# No-Bot Captions — repair handoff

## Outcome

**READY FOR RELEASE** — this repair resolves every release-blocking finding in
the independent verification for candidate
`69aa9c668a314675c69cbaadddc235d06ebd0a85`.

The repaired privacy boundary now owns every replay `AudioContext` and buffer
source. Stopping capture synchronously stops/disconnects all active replay
sources, closes their contexts, and invalidates their completion callbacks, so
neither meeting audio nor a later `Replay finished.` announcement can survive
the Stop action. Starting a new capture also invalidates any outstanding
replay. Offline loads now skip the aggregate-only page-count request, avoiding
the prior `ERR_INTERNET_DISCONNECTED` console error while retaining page counts
when online.

## Changes made

- Added active-replay lifecycle tracking in `src/app.ts`; Stop and new capture
  clear every source/context and stale completion handler.
- Added `src/pageview.ts` so `/api/pageview` is sent only while
  `navigator.onLine` reports an available network. Both the application and
  legal pages use it.
- Added exact regressions:
  - browser test starts a live replay, stops immediately, proves the real
    `AudioBufferSourceNode.stop()` was called, then proves the discard status
    cannot be replaced by `Replay finished.`;
  - browser test warms the PWA, reloads offline, asserts no page-count request
    and no console errors;
  - unit tests cover online/offline page-count dispatch.

No existing product behavior or deployment class was changed. Audio and
transcripts remain local; the server continues to store only aggregate daily
page counts.

## Verification evidence

Run from a clean dependency install on 2026-08-28 UTC:

| Check | Result |
| --- | --- |
| `npm ci` | Pass; 118 packages installed, 0 audit vulnerabilities |
| `npm test` / `cargo test --locked` | Pass; 11 Vitest and 4 Rust tests |
| `npm run build` | Pass; TypeScript check and production `dist/` build |
| `cargo fmt --check` | Pass |
| `cargo clippy --all-targets --all-features --locked -- -D warnings` | Pass |
| `cargo build --release --locked` | Pass |
| `npm run test:e2e` | Pass; 14 desktop/mobile tests, 4 intentional cross-project skips; includes Axe serious/critical checks, keyboard, 390px layout, privacy origin checks, replay-stop, and offline-reload regressions |
| `npm run test:model` | Pass against local Rust production server; same-origin Whisper inference completed |
| `npm run test:offline-model` | Pass; online warm-up and offline reload inference completed with 16 cached model/WASM paths |
| `npm audit --audit-level=moderate` | Pass; 0 vulnerabilities |

The local production server was started with only normal runtime configuration
and returned `{"status":"ok","build_sha":"repair-verification"}` from
`/health`. Direct response checks confirmed the shell uses `no-cache`, the
service worker uses `no-cache, no-store, must-revalidate`, hashed JS is
one-year immutable, and HSTS/CSP/nosniff/frame/referrer/permissions policies
are present. Existing service-worker regression tests also passed for current
shell refresh and cached model/WASM offline reuse.

## Run and deploy

```bash
npm ci
npm run model:download
npm run build
PORT=8080 FRONTEND_DIR=dist cargo run --release
```

For the full local verification sequence, run the commands listed above under
Verification evidence. The deployed artifact remains the existing single
non-root Rust container serving the Vite build on `PORT`.

## Known limitations / next steps

- Desktop Chromium is required for dependable user-approved meeting-audio
  capture; this is disclosed in-product.
- The researched 20-real-meeting recovery metric requires post-release field
  observation; it is not a claim established by automated release tests.
- After deployment, confirm the canonical `/health` `build_sha` matches this
  repair commit and repeat the live identity check.
