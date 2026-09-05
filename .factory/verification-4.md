# Verify private meeting captions without a bot — FAIL

## Verdict

**FAIL — 6 findings; 16 untested public claims.**

- Work order: `no-bot-captions-verify-4`
- Implementation candidate: `2280d00d6582dd0aa428e7f0a4a2389f32768f93`
- Documentation/report commit: recorded after this verification is committed
- Live URL: `https://no-bot-captions.sociobot.in`
- Verification date: 2026-09-05 UTC

`GET /health` returned the exact implementation SHA. This is a live candidate
failure, not a deployment-identity mismatch.

## First screen, before scrolling

- **Job:** show private live captions from meeting audio without inviting a
  recording bot.
- **Audience:** people who need captions in Google Meet but cannot add a bot.
- **First action shown:** **Choose meeting audio**. It opens a consent gate and
  then the browser audio picker; it is not a sample-data action.

Fresh Playwright desktop (1440 x 900) and phone (390 x 844) contexts both loaded
without console errors. They showed the same headline, **“Hear the room. Keep
the bot out.”**, no demo/sample/reset text, and the same first action. The
phone screenshot was visually reviewed.

## Release-blocking findings

### High — V4-01: there is no one-click demo sandbox

The required demo is missing. `/demo` returns HTTP 200 but loads the ordinary
landing screen: its title is `No-Bot Captions — private live meeting captions`,
its H1 is the normal landing H1, and it has no realistic populated captions,
sample label, **Reset demo**, or **Start for real** control. Source search finds
no sample/demo implementation, and `.factory/demo.md` is absent.

This prevents a visitor from trying the repair loop without sharing audio and
means the required isolated storage namespace is not present. It also fails the
specified first-screen action: **Try it with sample data** must be visible and
one click away.

### High — V4-02: required claims inventory and sandbox claim tests are absent

`.factory/claims.json` does not exist. Therefore there are no declared,
tagged claim commands to run, despite public claims about local processing,
audio/transcript non-upload, offline cached captions, the 12-second repair
window, consent, pricing, and local archives.

I counted **16 concrete visitor-reliant claims** on the landing page and in the
README. None has the mandatory manifest entry and exactly one
`@claim:<id>` clean-sandbox test. Existing broad E2E coverage is useful but is
not a replacement for the required claim inventory, observable-outcome tests,
and request-log privacy assertions. This report records `untested_claim_count`
as 16.

### High — V4-03: default backend state is not on the required `/data` mount

With the factory's required `PORT`-only runtime, `src/main.rs` defaults
`DATABASE_URL` to `sqlite:///tmp/no-bot-captions.sqlite`. The deployment
contract requires product SQLite state to live under `/data` so it survives a
redeploy. The README documents the same `/tmp` default. No documented runtime
setup changes that default when only `PORT` is supplied.

This is a persistence-contract failure for the aggregate page-count database.
It is not a live restart test because restarting the production service was not
needed to establish the deterministic `PORT`-only configuration error.

## Other findings

### Medium — V4-04: the landing structure and copy do not meet the plain-words contract

The H1, **“Hear the room. Keep the bot out.”**, is a slogan rather than a
plain job headline. It does not state captions or the audience. The next
sentence is 35 words, exceeding the 22-word maximum. The header offers only
How it works and Supporter; it has no Demo or Privacy link. The required
`.factory/copy-audit.md` is also absent.

This is separately observable from the missing demo: a cold visitor does not
get the required job/audience/first-action wording on the first screen.

### Medium — V4-05: unknown URLs have no real 404 page or response

`/404` and `/not-a-real-route` both return HTTP 200 and render the ordinary
landing page, including its normal title and H1. There is no product-styled
not-found explanation or route back. The site-structure contract requires a
real, designed 404 route; this is not an intentional HTTP 404 with a usable
page.

### Low — V4-06: required route metadata is incomplete

The shipped `index.html` has a description and SVG favicon but no canonical
link, Open Graph metadata, Twitter card metadata, or 180 px Apple touch icon.
The site-structure contract requires all of these. Browser-side legal route
titles do update correctly after JavaScript loads.

## Checks that passed

| Check | Result |
| --- | --- |
| Fresh clone at candidate + `npm ci` | Pass; 118 packages, 0 audit vulnerabilities |
| `npm test` | Pass; 11 Vitest and 6 Rust tests |
| `npm run build` | Pass; `dist/` produced; initial JS 32.82 kB (11.32 kB gzip), CSS 14.10 kB (4.04 kB gzip) |
| `cargo fmt --check` | Pass |
| strict locked Clippy | Pass |
| `cargo build --release --locked` | Pass |
| Local production-shape E2E | Pass; 14 passed, 4 expected viewport skips |
| Live `APP_URL=… npm run test:e2e` | Pass; 14 passed, 4 expected viewport skips |
| Live real model smoke | Pass; local inference completed |
| Live offline-model smoke | Pass; offline reload inference completed with 16 cached runtime files |
| Live URL verifier | Pass; 649 ms, no console errors, title/lang/H1/main/alt/button checks passed |
| Live browser Axe coverage | Pass through the Playwright suite; no serious/critical violations |
| Live Lighthouse | 99 performance, 100 accessibility, 100 best practices, 100 SEO |

`npx @axe-core/cli` was attempted after installing it with `npx`, but its
Selenium launcher could not locate a Chrome binary in this container. This is
an environment prerequisite failure, not a passing CLI result. The repository's
Playwright Axe integration did run against the preinstalled Chromium and passed
on live desktop/mobile and legal states.

## Live backend and product evidence

- `/health` returned the requested candidate SHA.
- A 100-request live page-view burst for one first-hop forwarded client accepted
  85 requests, returned 15 HTTP 429 responses, and supplied numeric
  `Retry-After: 57`. A different forwarded client immediately received HTTP
  200. This confirms the V3-01 repair is currently effective under ingress
  distribution.
- Live API boundary checks returned 405 for GET, 400 for malformed JSON, and
  422 for an unknown path and wrong-type path. The hosted checkout endpoint
  returned its expected redirect without exposing credentials here.
- `/privacy` and `/terms` both loaded with their own browser-set titles, one H1,
  a main landmark, and no observed console errors. The ordinary site loaded
  same-origin assets only; the model smoke completed without a third-party
  audio/transcript request.
- Consent validation, capture recovery, single-stream ownership, Stop buffer
  clearing, active-replay cancellation, correction validation, keyboard Space,
  reduced motion, 390 px targets, and offline page-count quietness are covered
  by the passing E2E suite.

## Earlier finding disposition

The earlier privacy and functional defects are fixed in this candidate:

- V-01/V-02: duplicate capture is blocked; Stop ends capture and clears repair
  audio.
- V-03: live hosted checkout redirects successfully.
- V-04/V-05: cached model inference survives offline reload and service-worker
  update coverage passes.
- V-06 through V-11: self-starting E2E, cache/security policies, mobile targets,
  keyboard shortcut, startup logging, correction feedback, and mobile telemetry
  all pass their current checks.
- V2-01/V2-02: active replay cancellation and offline page-count console
  quietness pass.
- V3-01: first-hop, per-client limiting now gives 429 plus numeric Retry-After
  and permits an independent client.

## Required disposition

Do not release this candidate as PASS. Add a real isolated sample workspace and
demo documentation; add the complete claims manifest with one tagged,
observable sandbox test per public claim; default SQLite to `/data`; then repair
the landing/404/metadata gaps and repeat independent verification.
