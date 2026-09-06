# No-Bot Captions — repair handoff

## Outcome

The repair is live at `https://no-bot-captions.sociobot.in`.

- **Implementation SHA:** `1aa7a327afb3c8c4b24125b838ecea8fbb8ad9cc`
- **Deployed revision:** `sf-no-bot-captions--0000015` (healthy, 100% traffic)
- **Live health:** `GET /health` returns that implementation SHA.
- **Documentation:** this handoff is a later report-only commit; it does not
  change the deployed image. Its commit SHA is recorded in `git log` separately
  from the implementation SHA above.

The job is **private live captions from meeting audio without adding a recording
bot**. It is for **Google Meet users who need captions but cannot invite a
bot**. Before scrolling, the first real action is **Choose meeting audio**;
the adjacent **Try it with sample data** link opens the sandbox.

## What changed

- Added `/demo`, a one-click populated caption workspace. It has realistic
  captions, an uncertain segment, repair/replay controls, a persistent
  “Demo — sample data, nothing is saved to your real captions” label, Reset
  demo, and Start for real. Demo state uses only the `demo:no-bot-captions:state`
  browser-storage namespace and never reads or writes real captions, the
  license, archive, or page-view endpoint.
- Added `.factory/demo.md`, `.factory/claims.json`, and 18 observable tagged
  claim checks. Every public, relied-on statement now has a clean `/demo`
  assertion; the suite covers populated sample data, reset/isolation, privacy,
  consent, repair/replay/edit/export, free core, price, page-count behavior,
  rate limit, and cached offline model behavior.
- Rewrote the first screen and navigation in plain language, added Demo and
  Privacy links, and recorded the checked copy and terminology in
  `.factory/copy-audit.md`.
- Added distinct route titles and canonical URLs, full Open Graph/Twitter
  metadata, an original derived 1200×630 social image, and an Apple touch icon.
  The image provenance is in `.factory/design.md`.
- Added a real, accessible `/404` document and server behavior: unknown routes
  return HTTP 404 with a route-specific title, explanatory heading, and links
  back home or to the demo.
- Moved the SQLite default from `/tmp` to the durable `/data` mount, with a
  local executable-directory fallback. The single-replica Azure Files mount
  uses SQLite's `unix-none` VFS, memory journal, exclusive locking mode, and a
  one-connection pool. This avoids unsupported share byte locks while retaining
  one writer. Startup retries transient database-open failures without logging
  data or secrets.
- Preserved the existing local model, consent, replay, offline cache, rate
  limit, privacy, paid Supporter offer, and accessibility behavior.

## Verification

### Clean local setup

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
APP_URL=http://127.0.0.1:8080 npm run test:claims
APP_URL=http://127.0.0.1:8080 npm run test:model
APP_URL=http://127.0.0.1:8080 npm run test:offline-model
```

Completed in this repair:

- `npm ci` installed 118 packages with 0 audit vulnerabilities.
- `npm test` passed 11 TypeScript tests and 10 Rust tests, including reopening
  the page-count SQLite database after a simulated process restart.
- `npm run build`, formatting, strict Clippy, and locked release build passed.
  The initial app bundle is 36.38 KB (11.79 KB gzip); CSS is 15.69 KB
  (4.33 KB gzip). The transcription model is deferred.
- Local E2E, all 18 local claim commands, local model inference, and the
  offline warm-cache model test passed. The offline model test observed all
  16 cached model/WASM paths.
- Local URL verification found one title, `lang=en`, one H1, a main landmark,
  no missing image alt text, no unlabeled buttons, and no browser errors.

### Live HTTPS checks

- Fresh desktop and phone Playwright contexts exercised the landing screen and
  `/demo`; the normal suite passed 16 checks with 4 expected browser-capability
  skips. Its Axe checks found no serious or critical violations.
- `APP_URL=https://no-bot-captions.sociobot.in npm run test:claims` passed all
  36 viewport executions (18 claim IDs in desktop and phone projects).
- The separate live `@claim:page-count-rate-limit` check passed in both
  projects. It exceeds a single client allowance and observes HTTP 429 with a
  numeric `Retry-After` header. The server only accepts known paths and stores
  aggregate daily page counts; it has no account or tenant data. The demo makes
  no page-view request, which is the sandbox isolation check.
- Live local model smoke passed. The full claim suite also passed the demo
  offline and warm-cache offline-model claims.
- `verify-url.sh https://no-bot-captions.sociobot.in` passed: HTTP 200, 641 ms
  load, no console errors, one H1, main, language, title, alt text, and button
  labels present. `/not-a-real-route` deliberately returns HTTP 404.
- A fresh mobile Lighthouse run using the supplied Chromium scored **100
  performance, 100 accessibility, 100 best practices, and 100 SEO**. The JSON
  and log are in `/work/.evidence/no-bot-captions-live/`.
- The active Container App revision is healthy and has one replica with the
  durable product-owned Azure Files `/data` mount. The image built successfully
  in ACR; no local Docker daemon was required.

## Disposition of verification-4 findings

| Finding | Result |
| --- | --- |
| No isolated demo sandbox | Fixed with `/demo`, persistent label, reset, real start, separate namespace, and realistic sample. |
| Sixteen public claims lacked a manifest/tests | Fixed with 18 claims and clean sandbox tests; all passed live. |
| SQLite defaulted to `/tmp` | Fixed to `/data` with safe local fallback and a one-replica Azure Files configuration. |
| Plain-words/header gaps | Fixed; the landing headline names the job, header includes Demo/Privacy, and the copy audit is checked in. |
| No real 404 | Fixed with actual HTTP 404 document and recovery links. |
| Incomplete metadata | Fixed with route-specific titles, canonical, OG/Twitter fields, social image, and Apple touch icon. |

All earlier verification/review findings remain covered by the existing
regressions: consent before capture, no duplicate capture graph, stop cleanup,
replay cancellation, local/offline model cache, accessibility, response
headers, and rate limiting.

## Deployment

The durable deployment command is:

```bash
WO_DATA_DIR=/data /opt/fleet/lib/deploy-container.sh no-bot-captions /work/repo Dockerfile 8080
```

It deploys the product-owned `sf-no-bot-captions` container only. The runtime
starts with `PORT` alone; `/health` reports the build SHA. Do not scale beyond
one replica while the product uses its local SQLite database.

## Known gaps

None. The $29 one-time Supporter checkout remains an existing live offer; the
free caption, repair, replay, and text-export core remains usable without it.
