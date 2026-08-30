use std::{env, net::SocketAddr, path::PathBuf};

use no_bot_captions::{connect, router};
use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .json()
        .with_env_filter(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("no_bot_captions=info,tower_http=info")),
        )
        .init();

    let port_env = env::var("PORT").ok();
    let database_env = env::var("DATABASE_URL").ok();
    let frontend_env = env::var("FRONTEND_DIR").ok();
    let build_sha_env = env::var("BUILD_SHA").ok();
    let port: u16 = port_env
        .as_deref()
        .and_then(|value| value.parse().ok())
        .unwrap_or(8080);
    let database_url = database_env
        .clone()
        .unwrap_or_else(|| "sqlite:///tmp/no-bot-captions.sqlite".to_string());
    let frontend = PathBuf::from(frontend_env.clone().unwrap_or_else(|| "dist".to_string()));
    let build_sha = build_sha_env
        .clone()
        .unwrap_or_else(|| "development".to_string());
    let supplied = [
        port_env.as_ref().map(|_| "PORT"),
        database_env.as_ref().map(|_| "DATABASE_URL"),
        frontend_env.as_ref().map(|_| "FRONTEND_DIR"),
        build_sha_env.as_ref().map(|_| "BUILD_SHA"),
    ]
    .into_iter()
    .flatten()
    .collect::<Vec<_>>()
    .join(",");
    tracing::info!(
        config_generated = "none",
        config_supplied = if supplied.is_empty() {
            "none"
        } else {
            &supplied
        },
        config_defaulted = "all remaining runtime settings",
        "runtime configuration sources"
    );
    let pool = connect(&database_url).await?;
    let app = router(pool, frontend, build_sha);
    let address = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(address).await?;
    tracing::info!(%address, "No-Bot Captions listening");
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown())
    .await?;
    Ok(())
}

async fn shutdown() {
    let ctrl_c = async {
        tokio::signal::ctrl_c()
            .await
            .expect("install Ctrl-C handler")
    };
    #[cfg(unix)]
    let terminate = async {
        tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            .expect("install SIGTERM handler")
            .recv()
            .await;
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();
    tokio::select! { _ = ctrl_c => {}, _ = terminate => {} }
}
