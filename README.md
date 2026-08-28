# No-Bot Captions

No-Bot Captions is a private live-caption companion for people who cannot add a
recording bot to a Google Meet call. The user explicitly shares tab or system
audio; a compact Whisper model runs in the browser; large rolling captions show
uncertain fragments with replay, retry, and manual correction controls. No
meeting participant is added, and meeting audio is not uploaded.

The free mode includes live captions, a 12-second in-memory repair buffer,
manual correction, and text export. A $29 one-time Supporter license adds a
local session archive and helps fund packaged offline models. Billing uses only
the Sociobot hosted checkout and verification API.

## Browser and privacy model

Desktop Chromium is required because it is currently the dependable browser
surface for user-approved tab/system audio. For Google Meet, choose the Meet
tab and enable **Share tab audio** in the browser picker. Firefox and Safari do
not currently expose system audio to web apps; the product reports that
limitation without requesting microphone access.

- Capture starts only after a two-point consent check and the browser's own
  picker.
- PCM samples remain in browser memory. The last 12 seconds are retained for
  repair and discarded on stop/reload.
- The 42 MB quantized `whisper-tiny.en` model is fetched from the same origin,
  cached in the browser, and executed with Transformers.js/ONNX WebAssembly.
- The backend receives no meeting audio or transcript. It stores only daily
  aggregate page counts by one of `/`, `/privacy`, or `/terms`.
- Supporter archives and license state use localStorage on the user's device.

## Develop

Requirements: Node 22+, Rust 1.89+, and a Chromium browser.

```bash
npm ci
npm run model:download   # downloads the pinned, redistributable local model
npm run dev
```

Vite serves the frontend at `http://localhost:5173`. To exercise the complete
same-origin production shape:

```bash
npm run build            # reproducible frontend output -> dist/
FRONTEND_DIR=dist cargo run
```

The model download is intentionally separate from `npm run build` so ordinary
frontend builds stay quick. The container build downloads the model at its
pinned Git revision and copies it into `dist/models`.

## Verify

```bash
npm test                 # Vitest utility tests + Rust route tests
npm run build
npm run test:e2e         # desktop + 390px-class mobile, including axe checks
npm run test:model       # with preview running; loads/runs the local model
cargo fmt --check
```

Keyboard shortcuts while the console is active: Space pauses/resumes capture,
R replays the rolling buffer, and T retries the latest uncertain line. All
functions are also exposed as labeled buttons.

## Deploy

Deployment is a single non-root container on `PORT` (default `8080`):

```bash
docker build -t no-bot-captions .
docker run --read-only --tmpfs /tmp -p 8080:8080 no-bot-captions
```

Configuration is environment-only:

- `PORT` — HTTP port, default `8080`
- `DATABASE_URL` — SQLite URL, default `sqlite:///tmp/no-bot-captions.sqlite`
- `FRONTEND_DIR` — built client directory, default `dist`
- `BUILD_SHA` — returned by `/health`

The backend has structured JSON logs, graceful shutdown, strict response
headers, a privacy-preserving global page-count rate limit, and `/health`.
A basic load smoke can be run with `oha -n 1000 -c 20 http://localhost:8080/health`
(or equivalent); the endpoint is read-only and does not touch SQLite.

## Assets and licenses

The original hero image and its exact generation prompt/review live in
`assets/src/`; the shipped WebP variants are under `public/assets/`. Full visual
tokens and provenance are in `.factory/design.md`. Departure Mono and Atkinson
Hyperlegible Next are self-hosted under the SIL Open Font License. OpenAI
Whisper code and weights are MIT licensed. License copies are in
`assets/licenses/`. Application code is MIT licensed; see `LICENSE`.
