use std::{
    path::Path,
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    body::Body,
    extract::State,
    http::{header, HeaderName, HeaderValue, Request},
    middleware::{self, Next},
    response::Response,
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

#[derive(Clone)]
pub struct AppState {
    pool: SqlitePool,
    build_sha: Arc<str>,
    pageview_rate: Arc<tokio::sync::Mutex<RateWindow>>,
}

struct RateWindow {
    started: Instant,
    count: u32,
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    build_sha: Arc<str>,
}

#[derive(Deserialize)]
struct PageView {
    path: String,
}

#[derive(Serialize)]
struct Recorded {
    recorded: bool,
}

pub async fn connect(database_url: &str) -> Result<SqlitePool, sqlx::Error> {
    let options = database_url
        .parse::<sqlx::sqlite::SqliteConnectOptions>()?
        .create_if_missing(true)
        .foreign_keys(true);
    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await?;
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS page_views (day TEXT NOT NULL, path TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(day, path))",
    )
    .execute(&pool)
    .await?;
    Ok(pool)
}

pub fn router(
    pool: SqlitePool,
    frontend_dir: impl AsRef<Path>,
    build_sha: impl Into<Arc<str>>,
) -> Router {
    let frontend = frontend_dir.as_ref().to_path_buf();
    let index = frontend.join("index.html");
    let state = AppState {
        pool,
        build_sha: build_sha.into(),
        pageview_rate: Arc::new(tokio::sync::Mutex::new(RateWindow {
            started: Instant::now(),
            count: 0,
        })),
    };
    let api = Router::new().route("/pageview", post(record_pageview));

    Router::new()
        .route("/health", get(health))
        .nest("/api", api)
        .fallback_service(
            ServeDir::new(frontend)
                .append_index_html_on_directories(true)
                .fallback(ServeFile::new(index)),
        )
        .layer(middleware::from_fn(security_headers))
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn health(State(state): State<AppState>) -> Json<Health> {
    Json(Health {
        status: "ok",
        build_sha: state.build_sha,
    })
}

async fn record_pageview(
    State(state): State<AppState>,
    Json(input): Json<PageView>,
) -> (axum::http::StatusCode, Json<Recorded>) {
    let mut rate = state.pageview_rate.lock().await;
    if rate.started.elapsed() >= Duration::from_secs(60) {
        rate.started = Instant::now();
        rate.count = 0;
    }
    if rate.count >= 120 {
        return (
            axum::http::StatusCode::TOO_MANY_REQUESTS,
            Json(Recorded { recorded: false }),
        );
    }
    rate.count += 1;
    drop(rate);
    if !matches!(input.path.as_str(), "/" | "/privacy" | "/terms") {
        return (
            axum::http::StatusCode::UNPROCESSABLE_ENTITY,
            Json(Recorded { recorded: false }),
        );
    }
    let day = Utc::now().format("%Y-%m-%d").to_string();
    let result = sqlx::query(
        "INSERT INTO page_views(day, path, views) VALUES(?1, ?2, 1) ON CONFLICT(day, path) DO UPDATE SET views = views + 1",
    )
    .bind(day)
    .bind(input.path)
    .execute(&state.pool)
    .await;
    match result {
        Ok(_) => (
            axum::http::StatusCode::OK,
            Json(Recorded { recorded: true }),
        ),
        Err(error) => {
            tracing::error!(error = %error, "page count write failed");
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                Json(Recorded { recorded: false }),
            )
        }
    }
}

async fn security_headers(request: Request<Body>, next: Next) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(
        HeaderName::from_static("permissions-policy"),
        HeaderValue::from_static(
            "camera=(), microphone=(), geolocation=(), display-capture=(self)",
        ),
    );
    headers.insert(
        HeaderName::from_static("content-security-policy"),
        HeaderValue::from_static("default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.sociobot.in; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://api.sociobot.in"),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
    };
    use http_body_util::BodyExt;
    use tempfile::tempdir;
    use tower::ServiceExt;

    async fn test_app() -> Router {
        let folder = tempdir().unwrap();
        let database = format!("sqlite://{}", folder.path().join("test.sqlite").display());
        let pool = connect(&database).await.unwrap();
        let _database_dir = folder.keep();
        let static_dir = tempdir().unwrap();
        std::fs::write(
            static_dir.path().join("index.html"),
            "<!doctype html><title>test</title>",
        )
        .unwrap();
        router(pool, static_dir.keep(), "test-sha")
    }

    #[tokio::test]
    async fn health_reports_build() {
        let response = test_app()
            .await
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        let body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["build_sha"], "test-sha");
    }

    #[tokio::test]
    async fn pageview_accepts_known_paths_and_rejects_others() {
        let app = test_app().await;
        let valid = Request::builder()
            .method("POST")
            .uri("/api/pageview")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"path":"/privacy"}"#))
            .unwrap();
        assert_eq!(
            app.clone().oneshot(valid).await.unwrap().status(),
            StatusCode::OK
        );
        let invalid = Request::builder()
            .method("POST")
            .uri("/api/pageview")
            .header("content-type", "application/json")
            .body(Body::from(r#"{"path":"/admin"}"#))
            .unwrap();
        assert_eq!(
            app.oneshot(invalid).await.unwrap().status(),
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
}
