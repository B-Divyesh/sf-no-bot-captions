# Verify private Google Meet captions without a bot — FAIL

## Verdict

**FAIL — 2 findings; 4 untested claims.**

- Work order: `no-bot-captions-verify-5`
- Implementation candidate: `1aa7a327afb3c8c4b24125b838ecea8fbb8ad9cc`
- Live build and documentation/test commit: `01c78ae68a1ca6b79971e9a68a969aeb5be93b00`
- Live revision: `sf-no-bot-captions--0000016` (healthy, one replica, 100% traffic)
- Live URL: `https://no-bot-captions.sociobot.in`
- Verification date: 2026-09-06 UTC

The live build SHA differs from the implementation candidate because the later
commit adds the handoff and a test-only Rust regression. The browser artifacts
from a clean `01c78ae` build match production byte for byte. No product runtime
code changed after `1aa7a32`, so `1aa7a32` is the implementation reviewed.

## First screen before scrolling

- **Job:** provide private live captions from meeting audio without adding a
  recording bot.
- **Audience:** Google Meet users who need captions but cannot invite a bot.
- **First action:** **Choose meeting audio**. The adjacent **Try it with sample
  data** action explains the sample path.

Fresh desktop (1440×900) and phone (390×844) contexts showed all three items
without scrolling. Both loaded without console or page errors.

## Findings

### High — V5-01: four public claims do not have complete tagged tests

All 18 declared commands exit successfully in both browser projects, but four
tagged tests do not assert the complete outcome that their public claim asks a
visitor to trust:

1. `no-bot-or-upload` checks only request origins. A same-origin audio or
   caption upload would pass, although the landing page and privacy page say
   audio and captions are not sent to this service.
2. `repair-window` proves that Stop disables replay and ends the track, but it
   never fills beyond or measures the claimed 12-second maximum.
3. `supporter-price` checks the price text, heading, and checkout link. It does
   not unlock Supporter, finish a caption session, or prove that the promised
   local archive receives that session.
4. `daily-page-count` accepts the API's `{ "recorded": true }` response. It
   does not inspect the daily aggregate, its schema, or the public promise that
   no account, audio, caption, or IP-address field is stored.

Independent probes found the present implementation behaves as described: the
only capture request body was the documented page path, the ring unit test
passed, a mocked valid license saved and displayed a completed local session,
and SQLite contained only `day`, `path`, and `views` and incremented across a
process restart. Those probes do not satisfy the contract that every claim be
protected by its own complete `@claim:<id>` test. These four claims are counted
as untested.

### Medium — V5-02: several phone targets are smaller than 44×44 CSS pixels

At the required 390×844 phone viewport, bounding-box measurements found:

- the header **Demo** link is 39×44 px on `/`, `/demo`, `/privacy`, and
  `/terms`;
- **Reset demo** and **Start for real** are 103×40 and 109×40 px;
- the privacy and support email links are 147×22 and 151×22 px.

The product contract requires every touch target to be at least 44×44 px. Axe
reports no serious or critical semantic violations, but it does not enforce
this product-specific 44 px rule. All other visible phone controls passed the
measurement.

## Demo and user paths

- The landing sample action opened `/demo` in one click with three realistic
  captions and one visibly uncertain line.
- The persistent banner read “Demo — sample data, nothing is saved to your real
  captions” and exposed Reset demo and Start for real.
- Replay reported a 12-second local replay. Try again replaced the uncertain
  line. Editing saved visible text. Export produced the populated transcript.
- Reset restored the original uncertain sample. Starting for real removed the
  demo key. Seeded `no-bot:archive` and `sb_license:no-bot-captions` values were
  unchanged throughout the demo.
- Consent with zero or one confirmation kept the picker closed and announced
  the correction. Picker denial and a stream without audio returned to idle
  with a next step.
- Duplicate capture, Stop cleanup, active replay cancellation, pause, Space/R/T
  shortcuts, blank caption correction, export, and model-error recovery passed.
- Blank and 4,097-character license input produced the documented error. A
  mocked valid return license was stored, removed from the URL, and saved a
  completed caption session to the visible local archive. The live checkout
  returned HTTP 303 and an invalid license returned `valid: false`.

## Declared claim commands

Each command in `.factory/claims.json` was run separately from the clean
checkout with `APP_URL=https://no-bot-captions.sociobot.in`. Each command ran in
both desktop and phone projects, for 36 successful executions.

| Claim | Command result | Contract result |
| --- | --- | --- |
| `demo-sample` | 2/2 pass | Pass |
| `demo-reset` | 2/2 pass | Pass |
| `demo-isolation` | 2/2 pass | Pass |
| `no-account-demo` | 2/2 pass | Pass |
| `no-bot-or-upload` | 2/2 pass | **Incomplete** |
| `consent-before-audio` | 2/2 pass | Pass |
| `repair-window` | 2/2 pass | **Incomplete** |
| `replay-12-seconds` | 2/2 pass | Pass |
| `retry-uncertain` | 2/2 pass | Pass |
| `edit-caption` | 2/2 pass | Pass |
| `text-export` | 2/2 pass | Pass |
| `free-core` | 2/2 pass | Pass |
| `supporter-price` | 2/2 pass | **Incomplete** |
| `daily-page-count` | 2/2 pass | **Incomplete** |
| `page-count-rate-limit` | 2/2 pass | Pass |
| `offline-demo` | 2/2 pass | Pass |
| `local-caption-model` | 2/2 pass | Pass |
| `offline-caption-model` | 2/2 pass | Pass |

There are exactly 18 manifest IDs and exactly one matching tag for each ID.
There are no extra claim tags. V5-01 concerns assertion completeness, not
missing commands or command failures.

## Quality, accessibility, privacy, and routes

- Clean install: 118 packages, zero audit vulnerabilities.
- `npm test`: 11 TypeScript and 10 Rust tests passed.
- `npm run build`, `cargo fmt --check`, strict locked Clippy, and locked release
  build passed. `dist/` was produced.
- The documented local production-shape E2E command passed 16 tests with four
  intentional cross-project skips. The live run had the same result.
- Live model inference passed. The warm-cache offline reload completed local
  inference with all 16 model/WASM paths cached.
- The URL verifier passed in 635 ms with no console errors, `lang=en`, one H1,
  a main landmark, complete image alt text, and labeled buttons.
- Playwright Axe checks found no serious or critical violations on the main,
  demo, legal, dialog, and 404 states. Keyboard order, skip link, modal focus
  return, a designed 3 px focus outline, and reduced motion at 0.01 ms passed.
- At 320 px the page had no horizontal overflow and kept the H1 and primary
  action visible. V5-02 records the separate target-size failure.
- `/`, `/demo`, `/privacy`, and `/terms` returned 200 with distinct titles,
  canonicals, descriptions, one H1, ordered headings, and working links.
  `/not-a-real-route` deliberately returned HTTP 404 with a designed recovery
  page and route-specific title. Its expected failed-document console message
  is not a defect.
- Same-origin navigation, self-hosted assets, CSP, HSTS, frame denial,
  referrer/permissions policy, HTTPS redirect, shell revalidation, immutable
  hashed assets, and model/WASM caching passed.
- Fresh mobile Lighthouse scored **99 performance, 100 accessibility, 100 best
  practices, and 100 SEO**. FCP was 1.4 s, LCP 1.8 s, TBT 30 ms, CLS 0, and
  speed index 1.4 s. Initial JS is 36.38 KB (11.79 KB gzip); CSS is 15.69 KB
  (4.33 KB gzip).

Evidence is under `/work/.evidence/no-bot-captions-verify5/`, including desktop,
phone, demo, 404, URL-verifier, and Lighthouse output.

## Backend

- `/health` returned live build SHA `01c78ae68a1ca6b79971e9a68a969aeb5be93b00`.
- A live burst from one first-hop forwarded client returned 40 HTTP 200 and five
  HTTP 429 responses; the denial had `Retry-After: 60`. A second client received
  HTTP 200 immediately. A separate 100-request health load returned 100/100.
- Live validation returned 200 for an allowed page, 422 for an unknown page and
  wrong type, 400 for malformed JSON, and 405 for GET.
- A `PORT`-only clean local start logged supplied/defaulted sources without
  values. One page count became two after shutdown and restart. The database
  schema contained only `day`, `path`, and `views`.
- The active revision is healthy with one replica and the product-owned
  `sf-no-bot-captions-data` volume mounted at `/data`.
- There are no accounts or backend tenants. Demo isolation is the separate
  browser namespace described above; direct demo use does not access real
  browser data or create a backend workspace.

## Earlier finding disposition

| Earlier finding | Current evidence |
| --- | --- |
| V-01 duplicate capture left a stream alive | Fixed; the E2E run allowed one picker call and Stop ended its track. |
| V-02 Stop retained repair audio | Fixed; replay disabled and the buffer-cleared status persisted. |
| V-03 checkout unavailable | Fixed; the live checkout returned HTTP 303. |
| V-04 cached model failed offline | Fixed; live offline inference passed with 16 cached paths. |
| V-05 stale application shell | Fixed in the current worker; the network-first update unit passed and live/local worker bytes match. |
| V-06 documented E2E failed | Fixed; the plain local command passed. |
| V-07 missing cache policy | Fixed; immutable hashed assets and revalidated shell/worker policies passed. |
| V-08 undersized legal targets | The originally cited legal/footer targets are fixed; V5-02 records other undersized targets. |
| V-09 keyboard shortcuts unreliable | Fixed; Space, R, and T worked while controls held focus. |
| V-10 HSTS/startup logging gaps | Fixed; both were observed. |
| V-11 empty correction/mobile telemetry | Fixed; the error is announced and telemetry is hidden on phone. |
| V2-01 replay survived Stop | Fixed; active replay cancellation and stable Stop status passed. |
| V2-02 offline reload logged page-count error | Fixed; no offline request or console error occurred. |
| V3-01 limiter lacked client isolation/Retry-After | Fixed; the live burst proved both. |
| V4-01 no isolated demo | Fixed; the complete demo flow and isolation passed. |
| V4-02 no claims inventory/tests | Partly fixed; all IDs and commands exist, but V5-01 identifies four incomplete assertions. |
| V4-03 state defaulted outside `/data` | Fixed; source, mount, unit test, and restart evidence passed. |
| V4-04 unclear landing/header | Fixed; job, audience, action, Demo, and Privacy are clear before scrolling. |
| V4-05 no real 404 | Fixed; the intentional 404 is designed and usable. |
| V4-06 incomplete metadata | Fixed on public product routes; required titles and social metadata are present. |

## Required disposition

Do not declare this revision a product PASS. Expand the four tagged tests so
they prove the full public outcomes, and make every phone target at least 44×44
CSS pixels. Then rerun the claim commands and phone geometry check.
