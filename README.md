# No-Bot Captions

Get private captions without adding a meeting bot. It is for Google Meet users
who need live captions but cannot invite a recording bot.

Choose meeting audio to open the browser picker. Or open `/demo` to try
realistic sample captions and repair an uncertain line without sharing audio.

- No meeting bot joins the call.
- Meeting audio and captions stay in the browser.
- The free tool includes captions, replay, retry, editing, and text export.
- Supporter costs $29 once and adds a local session archive.

## Use it

Use desktop Chromium for meeting audio. Choose the Meet tab and turn on **Share
tab audio**. Confirm consent before the picker opens.

The local speech model loads when you first start. Browser cache keeps the
model available for offline captioning after that first download. The repair
buffer keeps at most 12 seconds of audio in memory. Stopping capture clears it.

## Demo

Open `/demo` or choose **Try it with sample data** on the landing page. The
demo begins with three realistic meeting captions and one uncertain line. Use
**Replay 12 s**, **Try again**, or **Edit text** to inspect the repair loop.

Demo state uses only the `demo:no-bot-captions:state` localStorage key. It never
reads licenses or archives. **Reset demo** clears that key. **Start for real**
also clears it before returning to the live caption screen. See
`.factory/demo.md` for the sandbox contract.

## Privacy and paid support

The backend stores a daily aggregate count by page path. It never stores
meeting audio, captions, accounts, or IP-address fields. A one-minute
in-memory rate limit uses a network address only while it protects the count.

Supporter is a $29 one-time purchase. It saves completed sessions in local
browser storage on licensed devices. Sociobot and Dodo handle checkout,
license checks, refunds, and merchant-of-record duties. Core captioning and
export remain free. Read `/privacy` and `/terms` before purchasing.

## Develop

Requirements: Node 22+, current stable Rust, and Chromium.

```bash
npm ci
npm run model:download
npm run dev
```

For the production shape, build the frontend and serve it from Rust:

```bash
npm run build
FRONTEND_DIR=dist cargo run
```

## Verify

Run these from a clean checkout after `npm ci` and `npm run model:download`:

```bash
npm test
npm run build
npm run test:e2e
npm run test:claims
cargo fmt --check
cargo clippy --all-targets --all-features --locked -- -D warnings
cargo build --release --locked
```

The claim manifest at `.factory/claims.json` lists the exact tagged sandbox
command for every public claim. To exercise real online and offline model
inference, serve the production shape above, then run:

```bash
APP_URL=http://127.0.0.1:8080 npm run test:model
APP_URL=http://127.0.0.1:8080 npm run test:offline-model
```

## Deploy

The container starts with only `PORT` set, defaulting to `8080`. It uses
`/data/no-bot-captions.sqlite` when the fleet mounts `/data`. Without that
mount, it stores SQLite beside the executable for local development.

```bash
docker build -t no-bot-captions .
docker run --read-only --tmpfs /tmp -v no-bot-captions-data:/data -p 8080:8080 no-bot-captions
```

Optional environment overrides are `PORT`, `DATABASE_URL`, `FRONTEND_DIR`, and
`BUILD_SHA`. `/health` returns the build SHA. `POST /api/pageview` is limited
per client and replies with `429` and `Retry-After` when its allowance is used.

## Assets and licenses

The original generated hero image and its prompt live in `assets/src/`. The
social preview and Apple touch icon are crops derived from that same product
art. The visual thesis and provenance are in `.factory/design.md`. Departure
Mono and Atkinson Hyperlegible Next are self-hosted under the SIL Open Font
License. Whisper code and weights are MIT licensed. Application code is MIT
licensed; see `LICENSE`.
