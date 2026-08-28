# Independent product verification — FAIL

## Scope and release identity

- Work order: `no-bot-captions-verify-2`
- Candidate: `69aa9c668a314675c69cbaadddc235d06ebd0a85`
- Canonical URL: `https://no-bot-captions.sociobot.in`
- Verification date: 2026-08-28 UTC
- Result: **FAIL**

This was a fresh verification of the requested candidate, not a reliance on the
builder handoff or the earlier failure report. The checkout began clean at the exact
candidate. The canonical deployment also identifies as the candidate:

```json
{"status":"ok","build_sha":"69aa9c668a314675c69cbaadddc235d06ebd0a85"}
```

The clean build and live deployment produced identical SHA-256 values for
`index.html` (`a30bdfdf…a146ef`), the hashed app JS (`8cf484f4…f9527e`), and
`sw.js` (`54872e4e…ef8275`). Deployment mismatch is not the reason for the
failure.

## Defects

### High — V2-01: an in-progress repair replay survives Stop

Stop now clears the rolling ring, clips, worker, and future replay/retry controls,
but it does not stop playback that has already begun. The replay path creates an
untracked `AudioContext`/`AudioBufferSourceNode`; `stop()` has no reference with
which to cancel or close it.

Fresh live reproduction:

1. Start consented synthetic shared audio and wait for **Replay last 12 s**.
2. Start replay; status reads **“Replaying 1 seconds on this device…”**.
3. Immediately press **Stop capture**; status reads **“Stopped — audio and the
   repair buffer were discarded.”** and replay is disabled.
4. Wait 2.5 seconds. The audio source reaches its natural end and changes status
   to **“Replay finished.”**

The active buffer copy and its audible meeting audio therefore outlive Stop. For a
full repair window this can continue for roughly 12 seconds after the user was told
the audio had been discarded. It can also overwrite the stop status. This violates
the brief's prominent capture/privacy boundary and the README/privacy-page promise
that temporary audio is discarded on Stop.

Required repair: track every active replay source/context, stop and close them from
the app's Stop path (and before a new session), invalidate their completion handlers,
then add browser coverage that starts replay, stops immediately, and proves neither
playback nor a later “Replay finished” update survives.

### Low — V2-02: offline PWA reload emits a console error for page counting

After warming and controlling the live PWA, Chromium was placed offline and the
page reloaded successfully from the service worker. The app still attempted
`POST /api/pageview`, producing both:

- request failure `net::ERR_INTERNET_DISCONNECTED`; and
- console error `Failed to load resource: net::ERR_INTERNET_DISCONNECTED`.

The fetch rejection is caught and the offline shell remains usable, so impact is
limited. It nevertheless fails the no-console-errors-on-load gate for the requested
offline reload. Avoid the request while offline or handle it through the service
worker without a failed browser request.

## Clean checkout and repository gates

| Check | Result |
|---|---|
| `npm ci` | Pass; 118 packages, 0 vulnerabilities |
| `npm test` | Pass; 9/9 Vitest and 4/4 Rust tests |
| `npm run build` | Pass; TypeScript plus production Vite build produced `dist/` |
| `npm audit --audit-level=moderate` | Pass; 0 vulnerabilities |
| `cargo fmt --check` | Pass |
| strict locked Clippy | Pass; no warnings |
| `cargo build --release --locked` | Pass |
| local `npm run test:e2e` | Pass; 12 passed, 2 intentional cross-project skips |
| live `APP_URL=… npm run test:e2e` | Pass; 12 passed, 2 intentional skips |
| `npm run test:model` | Pass; real same-origin Whisper/ONNX inference |
| `npm run test:offline-model` | Pass; inference after offline reload, 16 cached runtime files |

There is no separate lint script; TypeScript checking, rustfmt, and strict Clippy are
the available type/lint gates. Docker is not installed in the verifier container, so
a local Docker image rebuild was unavailable. The locked frontend and optimized
backend builds passed, and the live build SHA plus byte-identical browser artifacts
independently establish the deployed candidate identity.

## End-to-end product evidence

- A 1,940,478-byte representative spoken-English sample completed through the real
  live capture, AudioWorklet, Whisper Tiny EN, and ONNX path. The first caption was
  **“And so, my fellow Americans ask not what your country”**, unmarked as uncertain.
- During that real transcription, every browser request stayed on
  `https://no-bot-captions.sociobot.in`. The only non-GET request was the documented
  `POST /api/pageview` body `{"path":"/"}`; no audio or transcript upload occurred.
- Zero and one checked consent boxes both kept the picker closed and announced
  **“Confirm both points…”**. Picker denial recovered to idle with an actionable
  message. A stream with no audio track recovered to idle and told the user to enable
  **Share tab audio**.
- Re-entrant capture was independently blocked: the second start surface made no
  second `getDisplayMedia` call. Stop ended the owned track and disabled/cleared future
  replay. V2-01 is the remaining already-playing case.
- A deterministic uncertain segment exposed replay, retry, and edit. Blank correction
  announced a bound error; a representative correction was saved and exported in
  1.537 seconds, well inside the 15-second repair target. The exported text contained
  the corrected line and Stop disabled its repair audio.
- A mocked valid return license was stored as
  `sb_license:no-bot-captions`, stripped from the URL, and unlocked the local archive.
  Blank and 4,097-character restore values were rejected without affecting free
  captions. The production checkout returned HTTP 303 to
  `checkout.dodopayments.com`; invalid verification returned
  `{valid:false, reason:"invalid"}`.

The 20-real-meeting success measure remains a post-release field metric and cannot be
established by this release verification.

## Accessibility, responsive design, and browser quality

- Axe found **0 serious/critical violations** across root, consent/error state,
  uncertain repair state, `/privacy`, and `/terms` in desktop/mobile coverage.
- The URL verifier reported 720 ms load, no normal-load console/page errors, title,
  `lang=en`, one H1, main landmark, alt text, and labeled buttons.
- Keyboard-only traversal reached the skip link, primary navigation, and hero action.
  Enter opened the modal, focus moved to the first consent checkbox, Space/Tab
  completed consent, and Enter submitted. There was no trap.
- Focus computed as a visible 3 px amber solid outline. Under reduced motion,
  transition durations computed to `0.01ms` (`1e-05s`).
- At exactly 390×844, document width remained 390 px. Every visible link/button was
  at least 44×44 CSS px; the license input was 316×48.3 px. Secondary telemetry and
  hero artwork were intentionally dropped, and screenshots showed no clipping or
  overlap.
- Desktop and 390 px screenshots were visually reviewed. The private-signal console
  is coherent, product-specific, legible, and consistent with `.factory/design.md`.

Normal online desktop/mobile loads had no console or page errors. V2-02 records the
separate offline-only console failure.

## PWA, privacy, response policy, and caching

- The offline model test completed online inference, reloaded with Chromium offline,
  and completed inference again with 16 model/WASM paths in Cache Storage.
- An actual service-worker update simulation changed the shell and worker version.
  The controlled page changed from the original title to **UPDATED No-Bot Captions**,
  retained that title on offline reload, and replaced old shell/runtime caches with
  `no-bot-shell-qa-update-v2` and `no-bot-runtime-qa-update-v2`.
- Baseline browsing was same-origin only. Fonts, scripts, artwork, model, and WASM are
  self-hosted. SQLite stores only aggregate `(day, path, views)` data; transcripts and
  licenses remain local browser state as disclosed.
- Live HTML uses `Cache-Control: no-cache`; `sw.js` uses
  `no-cache, no-store, must-revalidate`; hashed JS uses one-year immutable caching;
  model/WASM use one-day caching plus seven-day stale-while-revalidate.
- Live responses include HSTS, CSP, `nosniff`, frame denial, referrer policy, and a
  restrictive permissions policy. The HTTPS certificate and HTTP/2 response were
  valid.

## Performance and payload budgets

Lighthouse 12.8.2 mobile on the canonical deployment:

- Performance **99**, accessibility **100**, best practices **100**, SEO **100**
- FCP 1.2 s, LCP 1.7 s, CLS 0.036, TBT 90 ms, speed index 1.2 s, interactive 1.7 s

Production outputs were 32,181 B initial JS, 14,100 B CSS, 53,744 B total fonts,
36,780 B mobile hero, 75 KB desktop hero. These meet all stated budgets. The 867.5 KB
transcription worker and 21.6 MB WASM runtime remain deferred until capture.

## Backend and persistence

- A clean `env -i PORT=18180` launch succeeded with no other environment variables,
  logged supplied/defaulted/generated configuration sources without values, and
  stopped cleanly.
- A fresh isolated SQLite run served 100/100 `/health` requests at concurrency 20.
  It accepted 120/120 concurrent page views, returned 429 on request 121, and stored
  exactly one aggregate row with `views=120`.
- After process restart against the same database, the next request succeeded and the
  row became 121, proving the intended persistence boundary.
- The only table was `page_views`; its only columns were `day`, `path`, and `views`.
- Validation returned 200 for an allowed path, 422 for unknown path, 400 for malformed
  JSON, 422 for a wrong type, and 405 for GET. `/health` returned the configured build
  identity.

## Disposition of the earlier report

Earlier V-01 through V-11 repairs were reproduced as fixed: capture ownership, clearing
stored audio on Stop, checkout registration, complete offline runtime caching, shell
update behavior, self-contained E2E, cache/HSTS policy, mobile targets, shortcuts,
startup logging, correction feedback, and mobile telemetry. V2-01 is a newly tested
stop-time lifecycle gap involving playback already in progress.

## Required disposition

Do not promote candidate `69aa9c668a314675c69cbaadddc235d06ebd0a85`.
Cancel every active replay at Stop and add regression coverage, then repeat the stop
privacy lifecycle on the new candidate. The offline page-count console error should
also be removed before claiming the no-console-error/PWA gate.
