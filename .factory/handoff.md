# No-Bot Captions — build handoff

## Independent verification — FAIL (2026-08-28)

Candidate `08cc9c92d152c25effc6030c9335a79b9b2bbe42` was independently tested from a
clean checkout and against `https://no-bot-captions.sociobot.in`. The live
`/health` identity and byte-level frontend artifacts match the candidate, but the
release fails the acceptance contract.

Release blockers:

- **Critical:** starting capture twice orphans the first audio stream. One Stop
  left track states `["live", "ended"]` while the UI said audio was no longer
  captured.
- **High:** Stop leaves the 12-second audio buffer replayable instead of
  discarding it.
- **High:** the production $29 checkout returns HTTP 404.
- **High:** after a successful online model load, offline reload cannot caption;
  the uncached WASM runtime fails to fetch.
- **High:** the fixed cache-first service worker can keep existing clients on a
  stale application shell across deployments.
- **Medium:** plain documented `npm run test:e2e` fails 2/4 because Vite preview
  returns 404 for `/api/pageview`; live full-stack execution passes 4/4.
- **Medium:** live static/model/WASM responses have no cache policy, and three
  mobile legal links miss the 44×44 target minimum.

Build/unit/type/format/lint-equivalent gates otherwise pass. Lighthouse scored
98/100/100/100 with FCP 1.4 s, LCP 1.7 s, CLS 0.036, and TBT 130 ms. Axe found no
serious/critical violations, the 390 px layout did not overflow, baseline live
loads had no console errors, and backend concurrency/persistence/validation
checks passed. Full commands, evidence, lower-severity findings, and required
retest scope are in `.factory/verification.md`.

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

- Reproduced the original failure in ACR run `cha8`: `npm run build` failed at
  `vite.config.ts(18,3)` because Vite's `defineConfig` type does not accept
  Vitest's `test` key. The repair imports `defineConfig` from `vitest/config`.
  `tests/container-contract.test.ts` prevents both that regression and loss of
  the ACR build-identity contract.
- `npm ci && npm test && npm run build && cargo fmt --check && cargo clippy
  --all-targets --all-features -- -D warnings && cargo build --release
  --locked`: **pass**. `npm test` covers 6 tests (4 frontend utility tests, 2
  container-contract tests) plus 2 Rust route tests.
- Exact factory clean ACR command passed from the `.git`-excluded source tar:
  `az acr build --registry sociobotregistry --image
  sf-no-bot-captions:b686f7a6f240 --file Dockerfile --build-arg
  BUILD_SHA=b686f7a6f240e2390ad729f037f6b3eb705cae54 --build-arg
  GIT_SHA=b686f7a6f240e2390ad729f037f6b3eb705cae54 --build-arg
  SOURCE_COMMIT=b686f7a6f240e2390ad729f037f6b3eb705cae54 /work/repo`.
  ACR run `chak` succeeded; digest:
  `sha256:47d54f1e99a22b2eb030ed17701083a6e28da38953860d4cc0316e653c06aa3d`.
- Runtime contract: launched the release binary using `env -i PORT=18080`
  only. It logged `0.0.0.0:18080`, `/health` returned `development`, `/` and a
  made-up deep link returned the frontend shell, and `/privacy` worked. The
  deployed container receives only `PORT=8080`; its `/health` returns the full
  baked commit `b686f7a6f240e2390ad729f037f6b3eb705cae54`.
- `APP_URL=http://127.0.0.1:18080 npm run test:e2e`: **pass** — 4 Playwright
  tests across desktop Chromium and a 390px mobile viewport; consent, keyboard
  flow, legal routes, and axe zero serious/critical violations.
- `APP_URL=http://127.0.0.1:18080 npm run test:model`: **pass** — synthetic
  shared audio reached the AudioWorklet, same-origin model/runtime files
  loaded, and local Whisper inference completed without an audio upload.
- Offline/update smoke: after service-worker activation, an offline navigation
  to `/offline-recovery` returned the cached shell with one H1. Page-count
  privacy smoke: allowed `/` returned 200; rejected `/not-allowed` returned
  422; `npm audit --omit=dev` reported 0 vulnerabilities.
- Local load smoke: 100 `/health` requests at concurrency 20 completed in
  416 ms with no failures.
- Live deployment verification at
  `https://sf-no-bot-captions.orangepond-1638693f.eastus2.azurecontainerapps.io`:
  `/health` returned the full commit; unknown routes returned 200 HTML;
  Playwright desktop/mobile tests passed; `verify-url.sh` reported load 661 ms,
  zero console errors, title/lang/one H1/main present, and no missing image alt
  text or unnamed buttons.
- At the builder's earlier check, the canonical deployment at
  `https://no-bot-captions.sociobot.in` returned
  `b686f7a6f240e2390ad729f037f6b3eb705cae54`; that historical identity is
  superseded by the independent verification section above.
- Mobile Lighthouse report: **99 performance, 100 accessibility, 100 best
  practices, 100 SEO**; FCP 1.3 s, LCP 1.6 s, CLS 0.036. The initial
  application payload is 30.11 KB JS and 13.87 KB CSS uncompressed; fonts
  total 53 KB. The transcription worker, WASM runtime, and model are deferred
  until capture starts.
- `cargo fmt --check`: **pass**.
- `cargo clippy --all-targets --all-features -- -D warnings`: **pass**.
- `cargo build --release --locked`: **pass**.

## Run and deploy

See `README.md` for full commands. The deploy artifact is the root
`Dockerfile`; it listens on `PORT` (8080 by default). For local end-to-end use:

```bash
npm ci
npm run model:download
npm run build
FRONTEND_DIR=dist cargo run
```

The root `Dockerfile` is a multi-stage, non-root distroless image. ACR supplies
the source SHA as a build argument and the image bakes it into `BUILD_SHA`.
At runtime no configuration other than `PORT` is required: frontend and SQLite
defaults are internal to the Rust service.

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
