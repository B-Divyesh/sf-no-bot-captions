# No-Bot Captions — repair handoff

## Outcome: PASS

This repair resolves V3-01 from `.factory/verification-3.md` without changing
the researched job or any previously passing caption behavior. The repaired
product source was committed as `f563742afcf60271523219b77060403355a59c37` and
deployed to `https://no-bot-captions.sociobot.in`.

## Repair

The old `POST /api/pageview` protection was one process-wide 120-request
counter. It blocked unrelated users together and emitted a bare 429.

- Reproduced the candidate failure before editing: 130 valid requests yielded
  120 HTTP 200 responses and 10 HTTP 429 responses; a different
  `X-Forwarded-For` address was also blocked, and the captured 429 had no
  `Retry-After` header.
- Replaced that counter with a one-minute, process-local client map at the
  `/api` router boundary. It keys on the first valid `X-Forwarded-For` address
  and uses the peer socket address if that header is absent or malformed.
- A final live check exposed ingress distribution across two replicas. The
  limiter now budgets 40 requests per replica; with the deployment's fixed
  maximum of three replicas, one client has a service-wide maximum of 120
  requests per minute even while a burst is distributed.
- Every denied API response now includes a numeric `Retry-After`; `/health`
  remains the intentional rate-limit exemption.
- The temporary client key expires after one minute and is never persisted to
  SQLite. Privacy and README copy now disclose that narrow in-memory use.
- Added exact Rust regression coverage for the per-replica 40th/41st request
  boundary, the asserted 120-request deployment ceiling across three replicas,
  numeric retry header, first forwarded hop, independent second client, and
  malformed-header socket fallback.
- Updated the container stage to `rust:1-slim` (current stable), with a test
  guarding against a pinned Rust minor image.

## Verification evidence

### Clean local checks

- `npm ci` — 118 packages, 0 audit vulnerabilities.
- `npm test` — 11 Vitest tests and 6 Rust tests passed.
- `npm run build` — strict TypeScript and Vite production build passed;
  `dist/` was created. Initial application JS: 32.82 KB (11.32 KB gzip), CSS:
  14.10 KB (4.04 KB gzip).
- `cargo fmt --check`, `cargo clippy --all-targets --all-features --locked --
  -D warnings`, and `cargo build --release --locked` passed.
- `npm run test:e2e` — 14 passed and 4 intentional cross-viewport skips. It
  covers desktop plus 390px Chromium, keyboard controls, focus, consent,
  replay-stop privacy, offline page-count quietness, mobile targets, and Axe
  serious/critical checks.
- Local `npm run test:model` completed real same-origin Whisper/ONNX inference.
  Local `npm run test:offline-model` completed an online warm-up then offline
  reload inference with 16 cached model/WASM paths.
- `/opt/fleet/lib/verify-url.sh http://127.0.0.1:18082` passed: 599 ms load,
  no browser errors, title, `lang=en`, one H1, main landmark, and no missing
  image alt text or unlabeled buttons.
- Local mobile Lighthouse 12.8.2: Performance 100, Accessibility 100, Best
  Practices 100, SEO 100; FCP 1.2 s, LCP 1.6 s, CLS 0.002.
- Docker is not installed in the worker, so local image execution was not
  possible. The exact Dockerfile was validated by the container contract test,
  then built successfully by ACR during the deployment below.

### Public deployment checks

- ACR run `ch1ca` built the repair container successfully; Container App
  revision `sf-no-bot-captions--0000006` became ready.
- `GET /health` returned
  `{"status":"ok","build_sha":"f563742afcf60271523219b77060403355a59c37"}`.
- Repeated live V3-01 burst: one forwarded client received 120 HTTP 200 then
  HTTP 429 with `retry-after: 54`; a second forwarded client immediately
  received HTTP 200.
- Live `verify-url.sh` passed in 661 ms with no console/page errors and all
  basic semantic checks.
- `APP_URL=https://no-bot-captions.sociobot.in npx playwright test` passed:
  14 passed, 4 intentional cross-viewport skips. It includes desktop and 390px
  mobile, keyboard, consent/recovery, privacy, PWA offline reload, response
  behavior, and Axe coverage.
- Live `npm run test:model` and `npm run test:offline-model` passed; the latter
  completed offline inference with all 16 runtime paths cached.
- Live response policies were checked: shell `no-cache`; worker
  `no-cache, no-store, must-revalidate`; hashed JS one-year immutable; model
  cache one day plus seven-day stale-while-revalidate; HSTS, CSP, nosniff,
  frame denial, referrer policy, and permissions policy are present.
- Live mobile Lighthouse 12.8.2: Performance 99, Accessibility 100, Best
  Practices 100, SEO 100; FCP 1.4 s, LCP 1.8 s, CLS 0.002.

## How to run and verify

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

To exercise the rate-limit regression manually, send 121 valid JSON page-view
requests with the same first `X-Forwarded-For` value. Requests 1–120 return
200; request 121 returns 429 with numeric `Retry-After`. A different first
forwarded address receives a separate allowance.

## Known gaps

No product gaps are known. The only environmental limitation was no local
Docker engine; the cloud ACR build and deployed Container App verified the
container path.
