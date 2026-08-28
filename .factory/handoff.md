# No-Bot Captions — build handoff

## What shipped

- A responsive Vite/TypeScript caption console for user-approved tab/system
  audio. Capture has an explicit consent gate, persistent visual state,
  pause/resume, stop, input metering, elapsed time, and clear browser-error
  recovery.
- Local English speech recognition using the pinned quantized
  `onnx-community/whisper-tiny.en` model through Transformers.js and ONNX
  WebAssembly. The model is served from the product origin and audio PCM never
  leaves the browser.
- A 12-second in-memory rolling audio buffer with replay, second-pass
  transcription, manual text correction, and visible uncertainty labels.
  Transcript text export remains free.
- The $29 one-time Sociobot Supporter flow: hosted checkout link, return-token
  capture, device-local token/cache, at-most-daily verification, quiet revoke
  behavior, paste-to-restore, and optimistic offline handling. Supporter adds a
  local session archive; it does not gate captions, repair, export, or safety.
- `/privacy` and `/terms`, installable/offline shell metadata, self-hosted
  fonts, original responsive pixel artwork with full provenance, and a
  product-specific visual contract in `.factory/design.md`.
- An axum/SQLite server with same-origin static/model delivery, aggregate-only
  page counting, strict path validation, privacy-preserving global rate
  limiting, security headers, structured JSON logs, graceful shutdown, and a
  build-aware `/health` route.
- Multi-stage, non-root distroless container packaging. The Docker model stage
  downloads model files at pinned Hugging Face revision
  `2575352d61be1bf7225cf8f8b268a4678025fc58`.

## Verification performed

- `npm test`: **pass** — 4 frontend unit tests and 2 Rust route tests.
- `npm run build`: **pass** — output lands in `dist/`, with `index.html` at its
  root.
- `APP_URL=http://127.0.0.1:8080 npm run test:e2e`: **pass** — 4 Playwright
  tests across desktop Chromium and a 390px mobile viewport; consent and legal
  routes included; no console/page errors; axe reports zero serious/critical
  violations.
- `APP_URL=http://127.0.0.1:8080 npm run test:model`: **pass** — synthetic
  shared audio reached the AudioWorklet, same-origin model/runtime files
  loaded, and local Whisper inference completed without an audio upload.
- `cargo fmt --check`: **pass**.
- `cargo clippy --all-targets --all-features -- -D warnings`: **pass**.
- `cargo build --release --locked`: **pass**.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Backend smoke: `/health`, `/privacy`, a model asset, and `/api/pageview` all
  returned successfully with the expected security headers.
- Load smoke: 500 `/health` requests at concurrency 20 completed in 2.066 s
  (approximately 242 requests/s), with no failures.
- Lighthouse mobile, local production server: **100 performance, 100
  accessibility, 100 best practices, 100 SEO**; FCP 1.1 s, LCP 1.8 s, total
  blocking time 50 ms, CLS 0.036. The initial application payload is 30.11 KB
  JS and 13.87 KB CSS uncompressed; fonts total 53 KB; responsive hero WebPs
  are 36 KB and 75 KB. The 868 KB transcription worker, 21 MB WASM runtime,
  and 42 MB model are deferred until the user starts capture.

## Run and deploy

See `README.md` for full commands. The deploy artifact is the root
`Dockerfile`; it listens on `PORT` (8080 by default). For local end-to-end use:

```bash
npm ci
npm run model:download
npm run build
FRONTEND_DIR=dist cargo run
```

`docker build` could not be executed in the worker because no Docker daemon or
CLI is installed. Both Docker build stages were independently exercised by
`npm run build`, the pinned model download, and `cargo build --release --locked`.

## Known gaps and next steps

- System-audio capture is currently a desktop Chromium capability. Firefox and
  Safari users receive an honest unsupported/no-audio message; no microphone
  fallback is used because that would change the privacy and job contract.
- V1 is English-only and uses Whisper Tiny EN for a reasonable browser download
  and CPU footprint. Accuracy on names and noisy multi-speaker calls will be
  lower than larger models.
- The success criterion (90% of uncertain segments recovered within 15 seconds
  across 20 real meetings) requires post-release field sessions. The repair
  instrumentation is present, but no real-meeting cohort was available in this
  build environment.
- Supporter archives are intentionally local and currently inherit browser
  site-data lifecycle; a future packaged desktop build can provide explicit
  encrypted backup and the larger offline models promised by the tier.
