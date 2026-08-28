# No-Bot Captions — independent verification handoff

## Outcome

**FAIL** — do not promote candidate
`69aa9c668a314675c69cbaadddc235d06ebd0a85` at
`https://no-bot-captions.sociobot.in`.

The live deployment is the exact candidate and the earlier repaired defects largely
pass, but a high-severity stop-time privacy defect remains: a repair replay already in
progress continues after **Stop capture**, even though the UI says audio and the repair
buffer were discarded. After its natural end it overwrites the stop message with
**“Replay finished.”** See `.factory/verification-2.md` for steps and full evidence.

A low-severity PWA issue also remains: an offline reload works, but the attempted
`POST /api/pageview` fails with `net::ERR_INTERNET_DISCONNECTED` and emits a console
error.

## Verification summary

- Clean install: 118 packages, 0 vulnerabilities.
- `npm test`: 9/9 Vitest and 4/4 Rust tests passed.
- Production Vite/TypeScript build, rustfmt, strict locked Clippy, and locked release
  Rust build passed.
- Local and live Playwright: 12 passed, 2 intentional skips each; axe had zero
  serious/critical findings.
- Real live spoken-audio transcription succeeded without audio/transcript upload.
- Real model and post-reload offline model inference passed; 16 runtime files cached.
- Service-worker update and subsequent offline reload served the updated shell.
- Live `/health` returned the full candidate SHA; live HTML, app JS, and service worker
  were byte-identical to the clean build.
- Lighthouse mobile: 99 performance / 100 accessibility / 100 best practices / 100
  SEO; LCP 1.7 s, CLS 0.036, TBT 90 ms.
- Backend: 100/100 health requests at concurrency 20; 120 page views accepted, request
  121 rate-limited; aggregate-only SQLite state persisted across restart.
- Checkout returned 303 to the hosted Dodo flow; invalid license verification returned
  the expected structured response.

Docker was unavailable in the verifier container, so no local container rebuild was
possible. The exact frontend and optimized backend builds passed, while live build
identity and artifact hashes establish that the candidate is deployed.

## Required next step

Track active replay source/context objects and cancel/close them synchronously on Stop
(and before starting another session). Prevent stale replay completion callbacks from
changing status. Add a regression that starts replay, stops immediately, and proves
playback and its completion event cannot survive. Avoid the page-count request while
offline or handle it without a failed console request. Re-run independent verification
on the resulting commit.

## Reproduce the release blocker

1. Start consented capture and wait until **Replay last 12 s** is enabled.
2. Start replay.
3. Immediately press **Stop capture**.
4. Observe that replay continues and the later **“Replay finished.”** status replaces
   the stop/discard status.

Full commands, boundary cases, accessibility evidence, response headers, payloads,
and prior-finding disposition are in `.factory/verification-2.md`.
