use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    path::Path,
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    body::Body,
    extract::{ConnectInfo, Request, State},
    http::{header, HeaderName, HeaderValue, Request as HttpRequest},
    middleware::{self, Next},
    response::{IntoResponse, Response},
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
    api_rate: Arc<tokio::sync::Mutex<ClientRateLimiter>>,
}

// The factory deployment may run up to three replicas. Keeping each replica
// at 40 requests per client preserves the intended 120-request service-wide
// minute ceiling even when ingress distributes a burst between all replicas.
const API_RATE_LIMIT: u32 = 120;
const MAX_DEPLOYED_REPLICAS: u32 = 3;
const API_RATE_LIMIT_PER_REPLICA: u32 = API_RATE_LIMIT / MAX_DEPLOYED_REPLICAS;
const API_RATE_WINDOW: Duration = Duration::from_secs(60);

struct ClientRateWindow {
    started: Instant,
    count: u32,
}

struct ClientRateLimiter {
    clients: HashMap<String, ClientRateWindow>,
}

impl ClientRateLimiter {
    /// Reserve one request for this client. Client windows are intentionally
    /// process-local and expire after a minute; they never reach SQLite.
    fn take(&mut self, client: String) -> Result<(), Duration> {
        self.clients
            .retain(|_, window| window.started.elapsed() < API_RATE_WINDOW);
        let window = self
            .clients
            .entry(client)
            .or_insert_with(|| ClientRateWindow {
                started: Instant::now(),
                count: 0,
            });
        if window.count >= API_RATE_LIMIT_PER_REPLICA {
            return Err(API_RATE_WINDOW.saturating_sub(window.started.elapsed()));
        }
        window.count += 1;
        Ok(())
    }
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
        api_rate: Arc::new(tokio::sync::Mutex::new(ClientRateLimiter {
            clients: HashMap::new(),
        })),
    };
    // The product has one mutating API route today. Keeping the limiter at the
    // /api router boundary makes future API routes protected by default while
    // leaving the intentional /health check exemption available to deployers.
    let api = Router::new()
        .route("/pageview", post(record_pageview))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            api_rate_limit,
        ));

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

async fn api_rate_limit(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let client = client_key(&request);
    let retry_after = {
        let mut limiter = state.api_rate.lock().await;
        limiter.take(client).err()
    };
    if let Some(remaining) = retry_after {
        let mut response = (
            axum::http::StatusCode::TOO_MANY_REQUESTS,
            Json(Recorded { recorded: false }),
        )
            .into_response();
        response
            .headers_mut()
            .insert(header::RETRY_AFTER, retry_after_header(remaining));
        return response;
    }
    next.run(request).await
}

/// Trust the first value injected by the factory ingress. A direct/local
/// request has no forwarding header, so use the actual peer address instead.
/// Invalid forwarding headers deliberately fall back rather than becoming a
/// user-controlled client key.
fn client_key(request: &HttpRequest<Body>) -> String {
    let forwarded = request
        .headers()
        .get("x-forwarded-for")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .and_then(|value| value.parse::<IpAddr>().ok());
    if let Some(address) = forwarded {
        return format!("forwarded:{address}");
    }
    request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|ConnectInfo(address)| format!("socket:{}", address.ip()))
        .unwrap_or_else(|| "socket:unknown".to_string())
}

fn retry_after_header(remaining: Duration) -> HeaderValue {
    let milliseconds = remaining.as_millis().max(1);
    let seconds = milliseconds.div_ceil(1_000);
    HeaderValue::from_str(&seconds.to_string()).expect("a numeric Retry-After header is valid")
}

async fn security_headers(request: HttpRequest<Body>, next: Next) -> Response {
    let path = request.uri().path().to_string();
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
        HeaderName::from_static("strict-transport-security"),
        HeaderValue::from_static("max-age=31536000; includeSubDomains"),
    );
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
    let cache_policy = if path == "/sw.js" {
        "no-cache, no-store, must-revalidate"
    } else if is_hashed_asset(&path) {
        "public, max-age=31536000, immutable"
    } else if path.starts_with("/models/")
        || path.starts_with("/wasm/")
        || path.starts_with("/fonts/")
        || path.starts_with("/assets/")
    {
        "public, max-age=86400, stale-while-revalidate=604800"
    } else {
        "no-cache"
    };
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static(cache_policy),
    );
    response
}

fn is_hashed_asset(path: &str) -> bool {
    let Some(file) = path.strip_prefix("/assets/") else {
        return false;
    };
    let stem = file.rsplit_once('.').map_or(file, |(stem, _)| stem);
    if stem.len() < 10 || stem.as_bytes().get(stem.len() - 9) != Some(&b'-') {
        return false;
    }
    stem.as_bytes()[stem.len() - 8..]
        .iter()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, b'_' | b'-'))
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
        std::fs::create_dir_all(static_dir.path().join("assets")).unwrap();
        std::fs::create_dir_all(static_dir.path().join("wasm")).unwrap();
        std::fs::write(static_dir.path().join("assets/app-a1b2c3d4.js"), "ok").unwrap();
        std::fs::write(static_dir.path().join("wasm/runtime.wasm"), "ok").unwrap();
        std::fs::write(static_dir.path().join("sw.js"), "ok").unwrap();
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

    fn pageview_request(client: &str) -> HttpRequest<Body> {
        HttpRequest::builder()
            .method("POST")
            .uri("/api/pageview")
            .header("content-type", "application/json")
            .header("x-forwarded-for", client)
            .body(Body::from(r#"{"path":"/"}"#))
            .unwrap()
    }

    #[tokio::test]
    async fn api_limit_is_per_first_forwarded_client_and_sets_numeric_retry_after() {
        let app = test_app().await;
        assert_eq!(API_RATE_LIMIT, 120);
        for _ in 0..API_RATE_LIMIT_PER_REPLICA {
            let response = app
                .clone()
                .oneshot(pageview_request("198.51.100.24, 10.0.0.8"))
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::OK);
        }

        let blocked = app
            .clone()
            .oneshot(pageview_request("198.51.100.24, 10.0.0.8"))
            .await
            .unwrap();
        assert_eq!(blocked.status(), StatusCode::TOO_MANY_REQUESTS);
        let retry_after = blocked.headers()[header::RETRY_AFTER]
            .to_str()
            .unwrap()
            .parse::<u64>()
            .unwrap();
        assert!(retry_after >= 1);

        let other_client = app
            .oneshot(pageview_request("203.0.113.77, 10.0.0.8"))
            .await
            .unwrap();
        assert_eq!(other_client.status(), StatusCode::OK);
    }

    #[test]
    fn api_client_key_uses_first_forwarded_ip_and_safe_socket_fallback() {
        let forwarded = HttpRequest::builder()
            .header("x-forwarded-for", "198.51.100.24, 10.0.0.8")
            .body(Body::empty())
            .unwrap();
        assert_eq!(client_key(&forwarded), "forwarded:198.51.100.24");

        let mut socket = HttpRequest::builder().body(Body::empty()).unwrap();
        socket
            .extensions_mut()
            .insert(ConnectInfo(SocketAddr::from(([127, 0, 0, 1], 8080))));
        assert_eq!(client_key(&socket), "socket:127.0.0.1");

        let malformed = HttpRequest::builder()
            .header("x-forwarded-for", "not-an-ip")
            .body(Body::empty())
            .unwrap();
        assert_eq!(client_key(&malformed), "socket:unknown");
    }

    #[tokio::test]
    async fn response_policy_revalidates_shell_and_caches_runtime() {
        let app = test_app().await;
        let shell = app
            .clone()
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(shell.headers()[header::CACHE_CONTROL], "no-cache");
        assert_eq!(
            shell.headers()["strict-transport-security"],
            "max-age=31536000; includeSubDomains"
        );

        let worker = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/sw.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            worker.headers()[header::CACHE_CONTROL],
            "no-cache, no-store, must-revalidate"
        );

        let hashed = app
            .clone()
            .oneshot(
                Request::builder()
                    .uri("/assets/app-a1b2c3d4.js")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            hashed.headers()[header::CACHE_CONTROL],
            "public, max-age=31536000, immutable"
        );

        let runtime = app
            .oneshot(
                Request::builder()
                    .uri("/wasm/runtime.wasm")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(
            runtime.headers()[header::CACHE_CONTROL],
            "public, max-age=86400, stale-while-revalidate=604800"
        );
    }

    #[test]
    fn hashed_asset_detection_requires_a_content_hash() {
        assert!(is_hashed_asset("/assets/index-a1B2c3D4.js"));
        assert!(is_hashed_asset("/assets/index-DcmLEc_y.js"));
        assert!(is_hashed_asset("/assets/transcriber.worker-B0rugTU4.js"));
        assert!(!is_hashed_asset("/assets/private-signal-console.webp"));
        assert!(!is_hashed_asset("/sw.js"));
    }
}
