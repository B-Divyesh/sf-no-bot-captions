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

FROM rust:1-slim AS backend
WORKDIR /src
COPY Cargo.toml Cargo.lock* ./
COPY src ./src
RUN cargo build --release --locked

FROM gcr.io/distroless/cc-debian12:nonroot
WORKDIR /app
ARG BUILD_SHA=dev
ARG GIT_SHA=dev
ARG SOURCE_COMMIT=dev
COPY --from=backend /src/target/release/no-bot-captions /app/no-bot-captions
COPY --from=frontend /src/dist /app/dist
COPY --from=model /model /app/dist/models
# ACR supplies BUILD_SHA from the source commit.  Keep it in the image so the
# runtime needs only PORT (and has a useful local-build default).
ENV BUILD_SHA=${BUILD_SHA}
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/app/no-bot-captions"]
