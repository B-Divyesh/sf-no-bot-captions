# Independent product verification — FAIL

## Scope and identity

- Work order: `no-bot-captions-verify-3`
- Candidate: `336c169c63d538e030ca49cc3867a59ac08bff9d`
- Canonical URL: `https://no-bot-captions.sociobot.in`
- Verification date: 2026-08-28 UTC
- Result: **FAIL**

This was a fresh verification from a clean checkout at the requested commit.
The live deployment identifies as the same commit:

```json
{"status":"ok","build_sha":"336c169c63d538e030ca49cc3867a59ac08bff9d"}
```

The clean `dist/` artifact and production responses had identical SHA-256
content for `index.html`, `sw.js`, `audio-worklet.js`, hashed application JS and
CSS, the transcription worker, and the ONNX WASM runtime. This is a genuine
candidate failure, not a deployment mismatch.

## Release-blocking defect

### High — V3-01: API rate limiting omits the required `Retry-After` response header

The product has a server-side write endpoint, `POST /api/pageview`. A fresh
production burst of 140 valid JSON requests returned **120 HTTP 200** responses
and **20 HTTP 429** responses. The first captured 429 had the normal security
and cache headers but no `Retry-After` header. A clean local server repeated the
result exactly: 120 accepted, then 10 of 130 requests returned 429 without
`Retry-After`.

The observed threshold is therefore **120 requests per 60-second process-wide
window**. Inspection and the local behavior also show it is one global counter,
not a per-client limiter keyed from the first `X-Forwarded-For` hop as required.
One client can exhaust the entire service window for other users, and rejected
clients receive no safe retry time. This violates the supplied backend contract
and the explicit verification requirement that a burst produce 429 **with** a
`Retry-After` header.

Required repair: use a per-client limiter keyed from the first trusted
`X-Forwarded-For` value (with a safe socket fallback), apply it to every
server-side endpoint other than an intentional health exemption, and return a
numeric `Retry-After` on every 429. Repeat the live burst after a new deployment.

## Checks that passed

| Check | Result |
| --- | --- |
| Clean install: `npm ci` | Pass; 118 packages, audit reported 0 vulnerabilities |
| `npm test` | Pass; 11 Vitest and 4 Rust tests |
| `npm run build` | Pass; TypeScript check and Vite production build produced `dist/` |
| `cargo fmt --check` | Pass |
| `cargo clippy --all-targets --all-features --locked -- -D warnings` | Pass |
| `cargo build --release --locked` | Pass |
| Local production-shape E2E | Pass; 16 Playwright tests, 2 intentional project-specific skips |
| Live E2E | Pass; 16 Playwright tests, 2 intentional project-specific skips |
| Local and live `npm run test:model` | Pass; real same-origin Whisper/ONNX inference completed |
| Local and live `npm run test:offline-model` | Pass; online warm-up and offline reload inference completed with 16 cached model/WASM paths |

There is no separate lint script; strict TypeScript, rustfmt, and Clippy are the
available type/lint gates. Docker was unavailable in this verification
container, so a container-image rebuild was not run; the repository's exact
production frontend build and locked Rust release build both passed.

## Product, privacy, and recovery evidence

- Two explicit consent confirmations precede the browser picker. Zero or one
  confirmation reports an announced recovery message; picker denial and a
  stream without audio return to an actionable idle state.
- Synthetic approved audio exercised capture, pause/resume, replay, retry,
  manual correction, export, stop, and the uncertain-caption recovery controls.
  Stop ends the owned stream, clears repair buffers, and cancels active replay.
  Blank correction input announces a bound error. The advertised Space shortcut
  works while a capture button holds focus.
- A normal browser load made requests only to the product origin. The real
  model smoke made only same-origin model/runtime requests plus the documented
  aggregate page view; no meeting audio or transcript upload was observed.
  Fonts, scripts, model, artwork, and WASM are self-hosted.
- The Supporter checkout returned HTTP 303 to hosted Dodo checkout. An invalid
  license verification returned `{ "valid": false, "reason": "invalid" }`;
  return-token storage/URL cleanup and invalid/oversized restore input are
  covered by the browser flow. There is no sign-in surface.
- The backend starts with `PORT` alone, logs supplied/defaulted settings without
  values, serves the requested health identity, validates malformed/unknown
  page-view input, and keeps its stated aggregate-only SQLite schema boundary.

## Accessibility, responsive, PWA, and browser quality

- Axe found **0 serious or critical** violations on root, consent/error,
  uncertain-repair, `/privacy`, and `/terms` states in desktop and mobile
  coverage.
- Desktop and 390 px mobile E2E covered title, `lang=en`, one H1, main landmark,
  alt text, labels, skip link, dialog focus, keyboard operation, visible focus,
  44 px legal targets, no horizontal overflow, and dropped mobile telemetry.
  Reduced-motion behavior is covered by the browser suite.
- Normal online and offline-reload browser tests recorded no console or page
  errors. A real service-worker update simulation changed its versioned cache
  from `no-bot-shell-qa-one` to `no-bot-shell-qa-two`; real offline reload then
  completed model inference.
- Live policies passed: HTTPS redirect, HSTS, CSP, nosniff, DENY framing,
  referrer policy, restrictive permissions policy; shell `no-cache`, worker
  `no-cache, no-store, must-revalidate`, hashed JS one-year immutable, and
  model/WASM one-day plus stale-while-revalidate caching.

## Performance

Mobile Lighthouse against production: **99 performance, 100 accessibility, 100
best practices, 100 SEO**. FCP was 1.2 s, LCP 1.7 s, interactive 1.7 s, TBT 70
ms, CLS 0.036, and speed index 1.2 s. The initial application JS is 32.7 KB,
CSS 14.1 KB, fonts 53.7 KB, and mobile hero image 36.8 KB, within the stated
budgets. The 867.5 KB transcription worker and 21.6 MB WASM are deferred until
capture.

## Disposition

Do not promote `336c169c63d538e030ca49cc3867a59ac08bff9d`. All checked product
behavior passed, but V3-01 is a mandatory backend safety contract violation.
Repair the per-client rate limiter and `Retry-After` response, deploy a new
candidate, and rerun the live burst before release.
