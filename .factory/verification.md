# Independent product verification — FAIL

## Scope and identity

- Work order: `no-bot-captions-verify-1`
- Candidate: `08cc9c92d152c25effc6030c9335a79b9b2bbe42`
- Canonical URL: `https://no-bot-captions.sociobot.in`
- Verification date: 2026-08-28 UTC
- Result: **FAIL**

The canonical deployment is healthy and now identifies as the exact candidate:
`GET /health` returned `{"status":"ok","build_sha":"08cc9c92d152c25effc6030c9335a79b9b2bbe42"}`.
The live HTML, JS, CSS, worker, generated WASM, and service worker were byte-for-byte
identical to the clean candidate build. This supersedes the older `b686f7a6…`
identity in the builder handoff. Deployment identity is therefore not the reason
for this failure.

## Release-blocking defects

### Critical — V-01: starting capture twice leaves the first audio share alive after Stop

The hero **Choose meeting audio** action remains visible and enabled after capture
starts. Starting it again overwrites `CaptureSession`'s stream/audio-node
references without first stopping the earlier stream. Pressing **Stop capture**
then stops only the second stream while the UI announces “Stopped — audio is no
longer captured.”

Independent Playwright reproduction used two observable user-approved audio
streams. After the second start and one Stop, their audio-track states were
`["live", "ended"]`; the required assertion `["ended", "ended"]` failed. The
orphaned stream can no longer be stopped from the app. This violates the brief's
prominent capture-state and privacy requirements and can mix old audio into a
later session.

### High — V-02: Stop does not discard the 12-second audio repair buffer

After more than one second of synthetic shared audio, **Replay last 12 s** became
enabled. After **Stop capture**, it remained enabled and clicking it changed the
status to “Replaying … seconds on this device…”. `stop()` does not clear the ring
buffer or per-caption clips. This contradicts README and privacy-page claims that
audio is temporary—most directly README's explicit “discarded on stop/reload”
claim—and violates the expected stop boundary.

### High — V-03: the production Supporter checkout is unavailable

The shipped buy link is correctly formed, but a fresh request to
`https://api.sociobot.in/api/v1/products/no-bot-captions/checkout` returned HTTP
404 with `{"error":"enabled factory product","status":404}`, including when sent
with the canonical Origin and Referer. License verification itself returned a
valid structured `valid:false` response for a test-invalid token. Users cannot
buy the advertised $29 one-time unlock.

### High — V-04: cached local captions fail after an offline reload

The shell does reload offline, but the advertised offline model does not. The
model was first loaded and successfully used online in a fresh Chromium context;
after service-worker control, reload, and offline mode, the next capture produced
“Caption engine needs attention.” Trace evidence showed:

- `wasm streaming compile failed: TypeError: Failed to fetch`
- failure to load `/wasm/ort-wasm-simd-threaded.jsep.wasm`
- page error `Aborted(NetworkError …)`

The service worker explicitly bypasses `/wasm/`, so its shell cache cannot satisfy
the runtime after reload. The UI's “cached on this device” promise is false for
the complete caption engine.

### High — V-05: existing PWA clients can remain on a stale application shell

The service worker uses cache-first navigation, precaches `/`, keeps the fixed
cache name `no-bot-shell-v1`, and calls `skipWaiting()`. In an update simulation,
an already controlled client cached the original shell, the server's `index.html`
was replaced with an `UPDATED` shell, `registration.update()` completed, and a
reload still showed the original title. The worker script had not changed, so no
new worker installed and the cached `/` was never refreshed. Users can miss later
privacy or safety fixes until they manually clear site data.

## Other defects

### Medium — V-06: the documented repository E2E command fails

From the clean checkout, plain `npm run test:e2e` used Vite preview. Vite returned
404 for `/api/pageview`, causing the console-error assertion to fail in both the
desktop and mobile main-path tests: **2 passed, 2 failed**. Pointing the same suite
at the live full-stack URL passed 4/4. The README lists the plain command as a
verification gate, so the repository's available gate is not self-contained.

### Medium — V-07: immutable assets and large runtime files have no cache policy

Live responses for hashed JS/CSS, fonts, artwork, both 10.1 MB/30.7 MB ONNX files,
the 21.6 MB WASM runtime, manifest, and service worker had no `Cache-Control`
header. Hashed assets are not served with long-lived immutable caching, contrary
to the performance contract. This also contributes to unreliable offline reuse.

### Medium — V-08: several mobile links miss the 44×44 target minimum

At 390 px, automated geometry checks found the inline Supporter **Terms** and
**Privacy** links at 18 px high, and the footer **Terms** link at 40×44 px. The
design/accessibility contract requires every touch/click target to be at least
44×44 CSS px.

### Low — V-09: advertised keyboard shortcuts do not work from normal post-dialog focus

After capture starts, focus returns to a button. The global shortcut handler
returns early for `BUTTON` and `A`, so Space did not pause until test code
programmatically blurred focus. Tab-only users naturally retain focus on an
interactive element. The labeled controls remain keyboard operable, limiting the
severity, but the advertised Space/R/T shortcuts are not reliably available.

### Low — V-10: response/startup policy gaps

- HTTP redirects to HTTPS, but HTTPS responses do not include
  `Strict-Transport-Security`.
- The required backend startup line identifying generated versus supplied config
  is absent; a `PORT`-only launch logs only the listen address.

### Low — V-11: minor recovery/design contract gaps

- Saving an empty manual caption correction silently does nothing and supplies no
  validation message.
- The visual thesis says secondary telemetry disappears at 390 px, but source and
  elapsed time remain visible. The layout itself does not overflow.

## What passed

### Clean checkout and build gates

Verification ran in a new detached worktree at the exact candidate.

| Check | Result |
|---|---|
| `npm ci` | Pass; 118 packages, audit reported 0 vulnerabilities |
| `npm test` | Pass; 6 Vitest tests and 2 Rust tests |
| `npm run build` | Pass; TypeScript and Vite production build produced `dist/` |
| `cargo fmt --check` | Pass |
| `cargo clippy --all-targets --all-features --locked -- -D warnings` | Pass |
| `cargo build --release --locked` | Pass |
| `npm audit --audit-level=moderate` | Pass; 0 vulnerabilities |
| Live `npm run test:e2e` | Pass; 4/4 desktop/mobile tests |
| Documented local `npm run test:e2e` | **Fail; 2/4**, Vite `/api/pageview` 404 |

There is no lint script beyond TypeScript, rustfmt, and Clippy. Docker tooling was
not installed in the verifier container, so a local image rebuild was not
possible. The frontend production build and locked Rust release build both ran;
the deployed container's exact SHA plus matching artifact checksums independently
establish that the candidate image reached the canonical URL.

### End-to-end behavior

- Explicit two-checkbox consent is required. Zero and one checked boxes both
  produce the announced “Confirm both” error.
- Picker denial and a shared stream with no audio track both recover to a clear
  idle state with actionable messages.
- Synthetic user-approved audio reached the AudioWorklet and the real same-origin
  Whisper/ONNX model completed online without uploading audio.
- Pause/resume, stop, replay, uncertain marking, manual correction, and text
  export worked when exercised independently. A deterministic uncertain phrase
  was corrected and exported inside the 15-second repair target.
- Empty, 4,097-character, and invalid license values were rejected/reconciled
  without gating the free caption controls. A valid mocked return token was
  stored under `sb_license:no-bot-captions`, stripped from the URL, and unlocked
  the local archive.
- Baseline browser runs made requests only to the product origin; license testing
  additionally used only `api.sociobot.in`. No analytics, CDN fonts/scripts,
  audio upload, or transcript upload was observed.

### Accessibility, layout, and visual QA

- Axe found **0 serious/critical violations** on `/`, `/privacy`, and `/terms`,
  including the consent dialog and both desktop and mobile root runs.
- Title, `lang=en`, one H1, main landmark, image alt, labeled controls, skip link,
  dialog focus, and heading order passed.
- Focus is a visible 3 px amber outline. Reduced motion computed to `1e-05s`, and
  the 390×844 layout had no horizontal overflow.
- Desktop and 390 px screenshots were visually reviewed. The product-specific
  dark signal-console system is coherent, legible, and matches the documented
  design direction; the generated hero asset loaded correctly.

### Performance

Lighthouse 12.8.2 mobile on the canonical URL:

- Performance **98**, accessibility **100**, best practices **100**, SEO **100**
- FCP 1.4 s, LCP 1.7 s, CLS 0.036, TBT 130 ms, speed index 1.4 s
- Initial JS 30.11 KB, CSS 13.87 KB, fonts 53 KB, desktop hero 76 KB, mobile hero
  36 KB — all within stated budgets

The caching defect above remains despite the strong cold-load scores.

### Backend, persistence, and policies

- `env -i PORT=18180` launched successfully; SIGINT shut down cleanly with exit 0.
- Local `/health` handled 100/100 requests at concurrency 20. Live `/health`
  returned the exact candidate identity.
- Pageview validation returned 200 for allowed paths, 422 for an unknown path,
  400 for malformed JSON, 422 for a wrong type, and 405 for GET.
- Under concurrent writes, 119 allowed requests plus one prior rejected-path
  request filled the 120/minute window; the next 11 returned 429. The aggregate
  SQLite row persisted across restart and incremented from 119 to 120.
- The database contained only `(day, path, views)`. No user identifier, audio, or
  transcript field exists.
- HTTPS redirect, valid hostname certificate, CSP, `nosniff`, frame denial,
  referrer policy, and restrictive permissions policy passed. Baseline live load
  had no console or page errors. `/opt/fleet/lib/verify-url.sh` passed with 795 ms
  load time and all basic semantic checks.

## Required disposition

Do not promote this candidate. At minimum, prevent concurrent capture starts and
stop every owned stream; clear all audio buffers/clips on stop; register the live
billing product; cache the complete model runtime for offline use; version and
refresh the service-worker shell; and make the documented E2E command pass. Then
repeat privacy lifecycle, offline/update, checkout, mobile target, and full gate
verification from a new candidate SHA.
