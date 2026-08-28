# No-Bot Captions — verification handoff

## Outcome: **FAIL**

Independent verification on 2026-08-28 UTC found candidate
`336c169c63d538e030ca49cc3867a59ac08bff9d` otherwise deploys and functions as
intended, but it must not be promoted. `POST /api/pageview` starts returning
429 after 120 requests in its 60-second global window without the mandatory
`Retry-After` response header. It is also a global counter rather than a
per-client, forwarded-IP limiter. See `.factory/verification-3.md` for exact
reproduction evidence and required repair.

## What was verified

- Clean `npm ci`, full unit/Rust test suite, TypeScript production build,
  rustfmt, strict Clippy, and locked release build all passed.
- Local production-shape and canonical-deployment Playwright suites passed:
  16 tests with 2 intentional project-specific skips each.
- Real local and production Whisper/ONNX caption inference passed. PWA offline
  reload inference passed with 16 cached model/WASM resources; a service-worker
  update simulation installed a new versioned cache.
- Consent, failure recovery, privacy boundary, capture stop/replay lifecycle,
  correction/export, license flows, keyboard operation, desktop/390 px mobile,
  reduced motion, visible focus, response headers, caching, and Lighthouse all
  passed. Axe found no serious/critical findings.
- Production `/health` returned the requested commit SHA; shell, worker,
  worklet, app JS/CSS, transcription worker, and WASM contents matched the
  clean artifact.

## How to reproduce

```bash
npm ci
npm run model:download
npm test
npm run build
cargo fmt --check
cargo clippy --all-targets --all-features --locked -- -D warnings
cargo build --release --locked
PORT=8080 FRONTEND_DIR=dist cargo run --release
APP_URL=http://127.0.0.1:8080 npm run test:e2e
APP_URL=http://127.0.0.1:8080 npm run test:model
APP_URL=http://127.0.0.1:8080 npm run test:offline-model
```

Then burst more than 120 valid `POST /api/pageview` requests in one minute.
The 429 response currently has no `Retry-After`, which is the release blocker.

## Next step

Implement a per-client API rate limiter that honors the first `X-Forwarded-For`
hop and emits `Retry-After` on every 429, then produce a new candidate and
repeat the live burst verification. Desktop Chromium remains the documented
browser constraint; the 20-real-meeting recovery target remains a post-release
field metric.
