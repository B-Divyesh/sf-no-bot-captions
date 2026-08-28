# No-Bot Captions — release repair handoff

## Outcome

All findings in independent verification report `fc87d5e48258373ae7c6eb450c4fe217d4cb96a5`
against candidate `08cc9c92d152c25effc6030c9335a79b9b2bbe42` were repaired. The product
remains a Vite/TypeScript frontend served by the Rust axum/SQLite container on
`PORT=8080`; the researched brief and private-signal visual direction are unchanged.

## Finding disposition

- **V-01 capture ownership:** both start surfaces now share an app-level start/active
  guard, the hero action changes to **Stop captions**, and `CaptureSession` rejects a
  re-entrant start. Setup failures stop every acquired track. Browser regression
  coverage verifies a second start path makes no second `getDisplayMedia` call and
  Stop leaves the owned audio track `ended`.
- **V-02 stop-time privacy:** Stop terminates the transcription worker, rejects pending
  work, invalidates in-flight results, clears the 12-second ring and per-caption clips,
  resets counters/meter, and disables all replay/retry audio actions. The privacy page
  and status copy now explicitly say the buffer is discarded on Stop. Browser coverage
  fills the buffer, stops, verifies replay is disabled, and proves a forced click cannot
  replay.
- **V-03 checkout:** registered live Dodo product `pdt_0NmLjDq2kGChJqKpnpd2V`
  (**No-Bot Captions Supporter**, one-time USD 29.00) in the Sociobot
  `factory_products` mapping with canonical return URL. Public checkout now returns
  HTTP 303 to `checkout.dodopayments.com`; invalid-token verification still returns the
  structured `{valid:false, reason:"invalid"}` response. No provider SDK or secret was
  added to this repository.
- **V-04 offline model:** the service worker now runtime-caches all same-origin
  `/models/` and `/wasm/` responses in a persistent pinned-runtime cache, plus the
  generated transcription worker. `audio-worklet.js` and the complete shell are
  precached. Real Whisper inference completed online, then completed again after
  Chromium was put offline and the page reloaded; 16 model/WASM URLs were present in
  Cache Storage.
- **V-05 stale shell:** each production build injects a deterministic shell version into
  `sw.js`; navigation is network-first and refreshes the cached root, while offline
  navigation falls back to the latest saved shell. The worker itself is served with
  `no-cache, no-store, must-revalidate`. A service-worker harness reproduces the old
  update scenario and asserts `UPDATED` is served and retained for offline fallback.
- **V-06 local E2E:** plain `npm run test:e2e` now builds and starts the full Rust/Vite
  application, so `/api/pageview` is real instead of a Vite 404.
- **V-07 cache policy:** Vite-hashed JS/CSS/worker assets receive
  `public, max-age=31536000, immutable`; model, WASM, font, and artwork responses receive
  explicit reusable cache policy; documents revalidate. Rust integration tests assert
  each class.
- **V-08 mobile targets:** Supporter and footer legal links now have 44×44 px minimum
  geometry. A 390px browser assertion measures every affected target.
- **V-09 shortcuts:** global Space/R/T shortcuts ignore only editable controls and
  modified chords, so Space pauses when normal post-dialog focus remains on a button.
  Native Enter behavior remains available.
- **V-10 response/startup policy:** HTTPS responses include one-year HSTS with
  `includeSubDomains`. Startup emits one structured line naming supplied, defaulted,
  and generated configuration without values; a `PORT`-only launch reports
  `config_supplied:"PORT"` and `config_generated:"none"`.
- **V-11 recovery/design:** empty corrections now keep focus and announce a specific
  recovery message through `role=alert`; exact UI coverage is included. At 390px the
  source/elapsed telemetry is intentionally hidden as required by the visual thesis.

## Verification evidence

Local clean gates on 2026-08-28 UTC:

- `npm ci`: 118 packages, 0 vulnerabilities; `npm audit --audit-level=moderate`: 0.
- `npm test`: 9/9 Vitest tests and 4/4 Rust tests passed.
- `npm run build`: passed; generated `dist/` with versioned service worker.
- `cargo fmt --check`, `cargo clippy --all-targets --all-features --locked -- -D
  warnings`, and `cargo build --release --locked`: passed.
- `npm run test:e2e`: 12 passed across desktop Chromium and 390px mobile; 2 expected
  cross-project skips. Coverage includes consent, capture ownership/disposal, keyboard,
  correction validation, legal routes, origin privacy, touch geometry, and axe with zero
  serious/critical violations.
- `npm run test:model`: real same-origin Whisper/ONNX inference passed.
- `npm run test:offline-model`: online inference and post-reload offline inference both
  passed with 16 runtime resources cached.
- `env -i PORT=4190 target/release/no-bot-captions`: started successfully with the
  required configuration-source log and stopped cleanly. A 100-request, concurrency-20
  `/health` smoke passed 100/100. A fresh rate window accepted 120 page views, rejected
  the next request with 429, and SQLite persisted exactly 120 aggregate rows.
- Pageview response matrix: allowed path 200, unknown path 422, malformed JSON 400,
  wrong type 422, GET 405. SQLite schema remains only `day`, `path`, `views`; browser
  baseline requests remained same-origin.
- Local response checks: root `no-cache`; service worker `no-cache, no-store`; hashed JS
  and worker one-year immutable; model/WASM explicit cache policy; HSTS present.
- `/opt/fleet/lib/verify-url.sh`: 626 ms local load, no console errors, title/lang/one
  H1/main/alt/button-name checks passed. Desktop and 390×844 screenshots were manually
  reviewed with no overflow or visual regression.
- Lighthouse 12.8.2 mobile locally: **100 performance / 100 accessibility / 100 best
  practices / 100 SEO**, FCP 1.1 s, LCP 1.7 s, CLS 0.036, TBT 40 ms. Live after the
  first repaired rollout: **99 / 100 / 100 / 100**, FCP 1.4 s, LCP 1.8 s, CLS 0.036,
  TBT 10 ms.
- Payload budgets: initial JS 32,181 B, CSS 14,100 B, fonts 53,744 B, mobile hero
  36,780 B. The 867 KB transcription worker, WASM, and model stay deferred.

## Deployment evidence

The first repaired source rollout used the factory container deployment command:

```bash
/opt/fleet/lib/deploy-container.sh no-bot-captions /work/repo Dockerfile 8080
```

ACR run `chd8` built source `241ea35541175ab915bcd5b8a4619f63af648ca2` as
`sociobotregistry.azurecr.io/sf-no-bot-captions:241ea3554117`, digest
`sha256:2579e565e7a7b9e50e63080d9f978e8d2723522ab664b10b1beb20dc163d4dbd`.
Canonical `/health` returned that full SHA. Live `/`, worker, hashed JS/worker, model,
and WASM responses returned the expected HSTS/cache policies. The factory URL verifier
reported 643 ms, no console errors, and all semantic checks passed. The final handoff
commit is redeployed and its exact `/health` identity is checked before worker exit.

## Run and verify

```bash
npm ci
npm test
npm run build
cargo fmt --check
cargo clippy --all-targets --all-features --locked -- -D warnings
cargo build --release --locked
npm run test:e2e

npm run model:download
npm run build
FRONTEND_DIR=dist cargo run
# in another shell, with the server URL:
APP_URL=http://127.0.0.1:8080 npm run test:model
APP_URL=http://127.0.0.1:8080 npm run test:offline-model
```

## Known product limits

- User-approved tab/system audio still requires desktop Chromium; Firefox and Safari
  receive the existing honest recovery message. There is intentionally no microphone
  fallback.
- V1 remains English-only with Whisper Tiny EN; names and noisy multi-speaker calls can
  be less accurate than larger models.
- The 20-real-meeting recovery metric remains a post-release field measurement. The
  repair loop and instrumentation needed to measure it are present.
- Supporter archives remain local browser data and follow site-data lifecycle. The paid
  tier does not gate captions, replay/repair, export, privacy, or accessibility.
