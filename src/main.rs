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

    let port: u16 = env::var("PORT")
        .ok()
        .and_then(|value| value.parse().ok())
        .unwrap_or(8080);
    let database_url = env::var("DATABASE_URL")
        .unwrap_or_else(|_| "sqlite:///tmp/no-bot-captions.sqlite".to_string());
    let frontend = PathBuf::from(env::var("FRONTEND_DIR").unwrap_or_else(|_| "dist".to_string()));
    let build_sha = env::var("BUILD_SHA").unwrap_or_else(|_| "development".to_string());
    let pool = connect(&database_url).await?;
    let app = router(pool, frontend, build_sha);
    let address = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = TcpListener::bind(address).await?;
    tracing::info!(%address, "No-Bot Captions listening");
    axum::serve(listener, app)
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
