# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS frontend
WORKDIR /src
COPY package.json package-lock.json* ./
COPY scripts ./scripts
RUN npm ci
COPY index.html tsconfig.json vite.config.ts ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:22-bookworm-slim AS model
WORKDIR /src
COPY scripts/download-model.mjs ./scripts/download-model.mjs
RUN MODEL_DIR=/model node scripts/download-model.mjs

FROM rust:1.85-bookworm AS backend
WORKDIR /src
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
RUN cargo build --release --locked

FROM gcr.io/distroless/cc-debian12:nonroot
WORKDIR /app
COPY --from=backend /src/target/release/no-bot-captions /app/no-bot-captions
COPY --from=frontend /src/dist /app/dist
COPY --from=model /model /app/dist/models
ENV PORT=8080 FRONTEND_DIR=/app/dist DATABASE_URL=sqlite:///tmp/no-bot-captions.sqlite
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/no-bot-captions"]
