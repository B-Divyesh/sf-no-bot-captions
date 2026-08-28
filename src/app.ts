import { AudioRing, CaptureSession, novelTranscript, rms, uncertainty } from './audio';
import { acceptLicenseFromUrl, checkoutUrl, localLicenseState, saveLicense, verifyLicense, type LicenseState } from './license';

const SAMPLE_RATE = 16_000;
const TRANSCRIBE_EVERY = SAMPLE_RATE * 6;
const REPAIR_WINDOW = SAMPLE_RATE * 12;

type Caption = {
  id: string;
  text: string;
  uncertain: boolean;
  reason?: string;
  createdAt: Date;
};

class LocalTranscriber {
  private worker?: Worker;
  private pending = new Map<string, { resolve: (text: string) => void; reject: (error: Error) => void }>();

  constructor(private readonly onProgress: (message: string) => void) {}

  transcribe(audio: Float32Array): Promise<string> {
    if (!this.worker) {
      this.worker = new Worker(new URL('./transcriber.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<{ type: string; id?: string; text?: string; message?: string; progress?: number; file?: string }>) => {
        const data = event.data;
        if (data.type === 'progress') {
          const percent = typeof data.progress === 'number' ? ` ${Math.round(data.progress)}%` : '';
          const stage = data.file?.includes('.onnx') ? 'private speech model' : 'caption engine';
          this.onProgress(`Loading ${stage}${percent}…`);
          return;
        }
        if (!data.id) return;
        const request = this.pending.get(data.id);
        if (!request) return;
        this.pending.delete(data.id);
        if (data.type === 'result') request.resolve(data.text ?? '');
        else request.reject(new Error(data.message ?? 'Local transcription failed.'));
      };
    }
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const copy = audio.slice();
      this.worker?.postMessage({ id, audio: copy }, [copy.buffer]);
    });
  }

  reset(): void {
    this.worker?.terminate();
    this.worker = undefined;
    for (const request of this.pending.values()) request.reject(new Error('Capture stopped.'));
    this.pending.clear();
  }
}

export function captionCorrectionError(value: string): string | null {
  return value.trim() ? null : 'Enter the corrected caption, or choose Cancel to keep the original.';
}

export class CaptionApp {
  private capture = new CaptureSession();
  private ring = new AudioRing(REPAIR_WINDOW);
  private transcriber = new LocalTranscriber((message) => this.setEngineStatus(message));
  private captions: Caption[] = [];
  private clips = new Map<string, Float32Array>();
  private running = false;
  private paused = false;
  private busy = false;
  private samplesSinceRun = 0;
  private transcriptContext = '';
  private startedAt = 0;
  private timer?: number;
  private captureStarting = false;
  private captureEpoch = 0;
  private license: LicenseState = { unlocked: false, notice: '' };
  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  async mount(): Promise<void> {
    acceptLicenseFromUrl();
    this.license = localLicenseState();
    this.root.innerHTML = this.template();
    this.bind();
    this.renderLicense();
    this.renderArchive();
    void verifyLicense().then((state) => {
      this.license = state;
      this.renderLicense();
      this.renderArchive();
    });
    void fetch('/api/pageview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: '/' }),
      keepalive: true,
    }).catch(() => undefined);
  }

  private template(): string {
    return `
      <header class="site-header">
        <a class="wordmark" href="/" aria-label="No-Bot Captions home"><span aria-hidden="true" class="wordmark-mark">▰</span> NO-BOT / CAPTIONS</a>
        <nav aria-label="Primary navigation">
          <a href="#how">How it works</a>
          <a href="#supporter">Supporter</a>
        </nav>
      </header>
      <main id="main">
        <section class="hero" aria-labelledby="page-title">
          <div class="hero-copy">
            <p class="eyebrow"><span class="signal-dot" aria-hidden="true"></span> Local signal / zero attendees added</p>
            <h1 id="page-title">Hear the room.<br><span>Keep the bot out.</span></h1>
            <p class="lede">Large live captions from audio you choose, processed on this device. If the model misses a phrase, replay the last 12 seconds or try it again before the conversation moves on.</p>
            <div class="hero-actions">
              <button class="button primary" id="hero-start" type="button">Choose meeting audio</button>
              <a class="text-link" href="#how">Check the signal path <span aria-hidden="true">↓</span></a>
            </div>
            <ul class="trust-list" aria-label="Privacy summary">
              <li>No meeting bot</li><li>No account</li><li>No audio upload</li>
            </ul>
          </div>
          <figure class="hero-art">
            <picture>
              <source media="(max-width: 700px)" srcset="/assets/private-signal-console-720.webp" />
              <img src="/assets/private-signal-console.webp" width="1200" height="800" alt="Pixel-art laptop turning an audio waveform into caption blocks inside a protective shield" fetchpriority="high" decoding="async" />
            </picture>
            <figcaption>THE SIGNAL STAYS ON THIS DEVICE</figcaption>
          </figure>
        </section>

        <section class="console-section" id="captions" aria-labelledby="console-title">
          <div class="section-kicker"><span>01</span> Live console</div>
          <div class="console" data-state="idle">
            <div class="console-bar">
              <div class="capture-state" role="status" aria-live="polite">
                <span class="capture-lamp" aria-hidden="true"></span>
                <strong id="capture-label">Ready — not capturing</strong>
              </div>
              <div class="telemetry" aria-label="Capture telemetry"><span id="source-label">No source</span><time id="elapsed">00:00</time></div>
            </div>
            <div class="engine-status" id="engine-status" role="status" aria-live="polite">The 42 MB English model loads only when you start. It is cached on this device.</div>
            <div class="level-row" aria-hidden="true"><span>IN</span><div class="meter"><i id="level-meter"></i></div><span>LOCAL</span></div>
            <div class="caption-stage">
              <h2 id="console-title" class="sr-only">Live captions</h2>
              <ol class="caption-list" id="caption-list" aria-live="polite" aria-relevant="additions text">
                <li class="caption-empty" id="caption-empty"><span aria-hidden="true">▥</span><strong>Your captions will appear here.</strong><small>Choose a Chrome tab, window, or screen with audio. For a Meet tab, turn on “Share tab audio”.</small></li>
              </ol>
            </div>
            <div class="console-controls">
              <button class="button primary" id="console-start" type="button">Choose meeting audio</button>
              <button class="button secondary" id="pause-button" type="button" hidden>Pause captions <kbd>Space</kbd></button>
              <button class="button danger" id="stop-button" type="button" hidden>Stop capture</button>
              <button class="button secondary" id="replay-button" type="button" disabled>Replay last 12 s <kbd>R</kbd></button>
              <button class="button ghost" id="export-button" type="button" disabled>Export text</button>
            </div>
            <p class="keyboard-note">Keyboard: <kbd>Space</kbd> pause · <kbd>R</kbd> replay · <kbd>T</kbd> retry the latest uncertain line</p>
          </div>
        </section>

        <section class="how-section" id="how" aria-labelledby="how-title">
          <div class="section-kicker"><span>02</span> Signal path</div>
          <h2 id="how-title">Nothing joins the call.</h2>
          <ol class="signal-path">
            <li><span>01</span><div><h3>You choose the sound</h3><p>Your browser’s system picker controls the tab, window, or screen. Capture never starts itself.</p></div></li>
            <li><span>02</span><div><h3>Your device makes the words</h3><p>A compact Whisper model runs in browser memory. Audio samples are not posted to this service or a third party.</p></div></li>
            <li><span>03</span><div><h3>Doubt stays visible</h3><p>Short or dropped fragments are marked, with the last 12 seconds held only in memory for replay and retry.</p></div></li>
          </ol>
          <aside class="browser-note"><strong>Works best in desktop Chromium.</strong> System-audio sharing is a browser capability. Firefox and Safari currently do not expose meeting audio to web apps; the console will say so before anything starts.</aside>
        </section>

        <section class="supporter-section" id="supporter" aria-labelledby="supporter-title">
          <div class="section-kicker"><span>03</span> Optional unlock</div>
          <div class="supporter-grid">
            <div><p class="eyebrow">ONE-TIME / $29</p><h2 id="supporter-title">Keep the core free. Keep a local archive.</h2><p>Supporter unlocks named session archives on this device and future packaged offline model updates. Live captions, replay, repair, and text export stay free.</p></div>
            <div class="license-panel">
              <a class="button primary" id="buy-link" href="${checkoutUrl}">Buy Supporter — $29</a>
              <form id="license-form">
                <label for="license-token">Have a license? Paste it here</label>
                <div class="inline-form"><input id="license-token" name="license" autocomplete="off" spellcheck="false" /><button class="button secondary" type="submit">Restore</button></div>
              </form>
              <p class="license-status" id="license-status" role="status" aria-live="polite"></p>
              <p class="legal-note">One-time purchase. Sociobot/Dodo is merchant of record and handles refunds. <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a></p>
            </div>
          </div>
          <div class="archive" id="archive" hidden><h3>Local session archive</h3><ul id="archive-list"></ul></div>
        </section>
      </main>
      <footer><p>No-Bot Captions is built for consent, not surveillance.</p><nav aria-label="Legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="https://github.com/B-Divyesh/sf-no-bot-captions">Source</a></nav><small>Original generated pixel artwork; provenance is documented in the project.</small></footer>

      <dialog id="consent-dialog" aria-labelledby="consent-title">
        <form method="dialog" class="consent-card">
          <button class="dialog-close" value="cancel" aria-label="Close consent dialog">×</button>
          <p class="eyebrow">Before capture</p><h2 id="consent-title">The room should know.</h2>
          <p>Tell everyone captions are running. Your browser will show a picker next; select the meeting tab and enable its audio.</p>
          <label class="check-row"><input id="consent-permission" type="checkbox" /> <span>I have everyone’s permission to caption this audio.</span></label>
          <label class="check-row"><input id="consent-local" type="checkbox" /> <span>I understand the selected audio is held temporarily in this browser.</span></label>
          <p class="form-error" id="consent-error" role="alert"></p>
          <div class="dialog-actions"><button class="button secondary" value="cancel">Cancel</button><button class="button primary" id="confirm-capture" type="button">Open system picker</button></div>
        </form>
      </dialog>`;
  }

  private bind(): void {
    const dialog = this.byId<HTMLDialogElement>('consent-dialog');
    const open = () => {
      if (this.running || this.captureStarting) return;
      this.byId('consent-error').textContent = '';
      this.byId<HTMLInputElement>('consent-permission').checked = false;
      this.byId<HTMLInputElement>('consent-local').checked = false;
      dialog.showModal();
      this.byId<HTMLInputElement>('consent-permission').focus();
    };
    this.byId('hero-start').addEventListener('click', () => {
      if (this.running) this.stop('Stopped — audio and the repair buffer were discarded.');
      else open();
    });
    this.byId('console-start').addEventListener('click', open);
    this.byId('confirm-capture').addEventListener('click', () => void this.confirmCapture(dialog));
    this.byId('stop-button').addEventListener('click', () => this.stop('Stopped — audio and the repair buffer were discarded.'));
    this.byId('pause-button').addEventListener('click', () => this.togglePause());
    this.byId('replay-button').addEventListener('click', () => void this.play(this.ring.last()));
    this.byId('export-button').addEventListener('click', () => this.exportText());
    this.byId<HTMLFormElement>('license-form').addEventListener('submit', (event) => void this.restoreLicense(event));
    document.addEventListener('keydown', (event) => {
      const target = event.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(target.tagName) || target.isContentEditable || dialog.open || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.code === 'Space' && this.running) { event.preventDefault(); this.togglePause(); }
      if (event.key.toLocaleLowerCase() === 'r' && this.ring.length) void this.play(this.ring.last());
      if (event.key.toLocaleLowerCase() === 't') {
        const latest = [...this.captions].reverse().find((caption) => caption.uncertain);
        if (latest) void this.retry(latest.id);
      }
    });
  }

  private async confirmCapture(dialog: HTMLDialogElement): Promise<void> {
    if (this.running || this.captureStarting) return;
    const hasPermission = this.byId<HTMLInputElement>('consent-permission').checked;
    const acceptsLocal = this.byId<HTMLInputElement>('consent-local').checked;
    if (!hasPermission || !acceptsLocal) {
      this.byId('consent-error').textContent = 'Confirm both points before opening the system picker.';
      return;
    }
    dialog.close();
    this.captureStarting = true;
    this.setCaptureUi('starting');
    this.setEngineStatus('Waiting for your system audio choice…');
    try {
      const selected = await this.capture.start((samples) => this.receiveAudio(samples), () => this.stop('Sharing ended in the browser.'));
      this.running = true;
      this.startedAt = Date.now();
      this.byId('source-label').textContent = selected.source;
      this.setCaptureUi('capturing');
      this.timer = window.setInterval(() => this.updateElapsed(), 1_000);
      this.setEngineStatus(navigator.onLine ? 'Listening locally. The first caption may take a moment while the model loads.' : 'Offline. A previously cached model is required to caption.');
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'Nothing was captured. Allow the picker when you are ready, or check browser sharing permissions.'
        : error instanceof Error ? error.message : 'Meeting audio could not be opened.';
      this.setEngineStatus(message, true);
      this.setCaptureUi('idle');
    } finally {
      this.captureStarting = false;
    }
  }

  private receiveAudio(samples: Float32Array): void {
    if (!this.running || this.paused) return;
    this.ring.push(samples);
    this.samplesSinceRun += samples.length;
    const meter = this.byId<HTMLElement>('level-meter');
    meter.style.width = `${Math.min(100, Math.round(rms(samples) * 900))}%`;
    this.byId<HTMLButtonElement>('replay-button').disabled = this.ring.length < SAMPLE_RATE;
    if (this.samplesSinceRun >= TRANSCRIBE_EVERY && !this.busy) {
      this.samplesSinceRun = 0;
      void this.transcribeCurrent();
    }
  }

  private async transcribeCurrent(): Promise<void> {
    const epoch = this.captureEpoch;
    const audio = this.ring.last();
    if (audio.length < SAMPLE_RATE * 2) return;
    const level = rms(audio);
    if (level < 0.0025) { this.setEngineStatus('Listening locally — no clear speech yet.'); return; }
    this.busy = true;
    this.setEngineStatus('Resolving the latest words on this device…');
    try {
      const raw = await this.transcriber.transcribe(audio);
      if (!this.running || epoch !== this.captureEpoch) return;
      const text = novelTranscript(this.transcriptContext, raw);
      const reason = uncertainty(text, level);
      if (text || reason) {
        const caption = this.addCaption(text || 'Audio was not resolved.', reason ?? undefined);
        if (reason) this.clips.set(caption.id, audio.slice());
        if (text) this.transcriptContext = `${this.transcriptContext} ${text}`.trim().split(/\s+/).slice(-80).join(' ');
      }
      this.setEngineStatus('Listening locally. Audio is held only for the 12-second repair window.');
    } catch (error) {
      if (!this.running || epoch !== this.captureEpoch) return;
      const detail = error instanceof Error ? error.message : 'Unknown model error';
      const caption = this.addCaption('Caption engine needs attention.', 'The local model could not process this segment. Retry when the model is available.');
      this.clips.set(caption.id, audio.slice());
      this.setEngineStatus(navigator.onLine ? `Local model error: ${detail}` : 'Offline and the speech model is not cached yet. Reconnect once to load it.', true);
    } finally {
      this.busy = false;
    }
  }

  private addCaption(text: string, reason?: string): Caption {
    const caption: Caption = { id: crypto.randomUUID(), text, uncertain: Boolean(reason), reason, createdAt: new Date() };
    this.captions.push(caption);
    this.byId('caption-empty')?.remove();
    this.byId<HTMLButtonElement>('export-button').disabled = false;
    this.renderCaption(caption);
    return caption;
  }

  private renderCaption(caption: Caption): void {
    const item = document.createElement('li');
    item.className = `caption-line${caption.uncertain ? ' is-uncertain' : ''}`;
    item.dataset.captionId = caption.id;
    const time = document.createElement('time');
    time.dateTime = caption.createdAt.toISOString();
    time.textContent = caption.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const copy = document.createElement('p');
    copy.textContent = caption.text;
    item.append(time, copy);
    if (caption.uncertain) {
      const repair = document.createElement('div');
      repair.className = 'repair-row';
      const label = document.createElement('span');
      label.className = 'uncertain-label';
      label.textContent = `Uncertain — ${caption.reason}`;
      const replay = this.actionButton('Replay 12 s', () => void this.play(this.clips.get(caption.id) ?? this.ring.last()));
      const retry = this.actionButton('Try again', () => void this.retry(caption.id));
      replay.dataset.audioAction = 'replay';
      retry.dataset.audioAction = 'retry';
      const edit = this.actionButton('Edit text', () => this.editCaption(caption.id));
      repair.append(label, replay, retry, edit);
      item.append(repair);
    }
    this.byId('caption-list').append(item);
    item.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  private actionButton(label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'repair-action';
    button.textContent = label;
    button.addEventListener('click', action);
    return button;
  }

  private async retry(id: string): Promise<void> {
    const caption = this.captions.find((candidate) => candidate.id === id);
    const clip = this.clips.get(id);
    if (!caption || !clip || this.busy) return;
    this.busy = true;
    this.setEngineStatus('Trying that 12-second segment again…');
    try {
      const text = (await this.transcriber.transcribe(clip)).trim();
      if (!text) throw new Error('No words were resolved on the second pass.');
      caption.text = text;
      caption.uncertain = false;
      caption.reason = undefined;
      this.replaceCaption(caption);
      this.setEngineStatus('Recovered. The repaired line is now in the transcript.');
    } catch (error) {
      this.setEngineStatus(error instanceof Error ? error.message : 'That segment could not be recovered. You can replay or edit it.', true);
    } finally { this.busy = false; }
  }

  private editCaption(id: string): void {
    const caption = this.captions.find((candidate) => candidate.id === id);
    const item = document.querySelector<HTMLElement>(`[data-caption-id="${id}"]`);
    if (!caption || !item) return;
    const original = caption.text;
    item.innerHTML = '';
    const label = document.createElement('label');
    label.textContent = 'Correct this caption';
    label.htmlFor = `edit-${id}`;
    const input = document.createElement('textarea');
    input.id = `edit-${id}`;
    input.value = original;
    input.rows = 3;
    const validation = document.createElement('p');
    validation.className = 'edit-error';
    validation.id = `edit-error-${id}`;
    validation.setAttribute('role', 'alert');
    input.setAttribute('aria-describedby', validation.id);
    input.addEventListener('input', () => { validation.textContent = ''; });
    const actions = document.createElement('div');
    actions.className = 'edit-actions';
    actions.append(this.actionButton('Save correction', () => {
      const value = input.value.trim();
      const error = captionCorrectionError(value);
      if (error) { validation.textContent = error; input.focus(); return; }
      caption.text = value; caption.uncertain = false; caption.reason = undefined;
      this.replaceCaption(caption);
    }), this.actionButton('Cancel', () => this.replaceCaption(caption)));
    item.append(label, input, validation, actions);
    input.focus();
  }

  private replaceCaption(caption: Caption): void {
    const old = document.querySelector(`[data-caption-id="${caption.id}"]`);
    old?.remove();
    this.renderCaption(caption);
  }

  private async play(samples: Float32Array): Promise<void> {
    if (!samples.length) return;
    const context = new AudioContext();
    const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
    buffer.copyToChannel(new Float32Array(samples), 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();
    this.setEngineStatus(`Replaying ${Math.round(samples.length / SAMPLE_RATE)} seconds on this device…`);
    source.addEventListener('ended', () => { void context.close(); this.setEngineStatus('Replay finished.'); }, { once: true });
  }

  private togglePause(): void {
    this.paused = !this.paused;
    this.capture.setPaused(this.paused);
    this.setCaptureUi(this.paused ? 'paused' : 'capturing');
    this.setEngineStatus(this.paused ? 'Paused. Incoming audio is not being read.' : 'Listening locally.');
  }

  private stop(message: string): void {
    const hadActiveCapture = this.running || this.captureStarting;
    this.running = false;
    this.captureStarting = false;
    this.paused = false;
    this.captureEpoch += 1;
    this.capture.stop();
    this.transcriber.reset();
    this.ring.clear();
    this.clips.clear();
    this.samplesSinceRun = 0;
    this.busy = false;
    if (this.timer) window.clearInterval(this.timer);
    this.timer = undefined;
    this.setCaptureUi('idle');
    this.byId<HTMLButtonElement>('replay-button').disabled = true;
    this.byId<HTMLElement>('level-meter').style.width = '0%';
    document.querySelectorAll<HTMLButtonElement>('[data-audio-action]').forEach((button) => { button.disabled = true; });
    this.setEngineStatus(message);
    if (hadActiveCapture && this.license.unlocked && this.captions.length) this.saveArchive();
  }

  private setCaptureUi(state: 'idle' | 'starting' | 'capturing' | 'paused'): void {
    const active = state !== 'idle';
    document.querySelector<HTMLElement>('.console')?.setAttribute('data-state', state);
    this.byId('capture-label').textContent = state === 'starting' ? 'Opening audio picker…' : state === 'capturing' ? 'Capturing — local only' : state === 'paused' ? 'Paused — audio blocked' : 'Ready — not capturing';
    this.byId<HTMLButtonElement>('console-start').hidden = active;
    this.byId<HTMLButtonElement>('pause-button').hidden = !this.running;
    this.byId<HTMLButtonElement>('stop-button').hidden = !this.running;
    this.byId<HTMLButtonElement>('pause-button').innerHTML = state === 'paused' ? 'Resume captions <kbd>Space</kbd>' : 'Pause captions <kbd>Space</kbd>';
    const hero = this.byId<HTMLButtonElement>('hero-start');
    hero.textContent = this.running ? 'Stop captions' : state === 'starting' ? 'Opening audio picker…' : 'Choose meeting audio';
    hero.disabled = state === 'starting';
    hero.classList.toggle('danger', this.running);
    hero.classList.toggle('primary', !this.running);
    if (!active) { this.byId('source-label').textContent = 'No source'; this.byId('elapsed').textContent = '00:00'; }
  }

  private updateElapsed(): void {
    const seconds = Math.floor((Date.now() - this.startedAt) / 1_000);
    this.byId('elapsed').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  private setEngineStatus(message: string, error = false): void {
    const element = this.byId('engine-status');
    element.textContent = message;
    element.classList.toggle('is-error', error);
  }

  private exportText(): void {
    const text = this.captions.map((caption) => `[${caption.createdAt.toLocaleTimeString()}] ${caption.text}${caption.uncertain ? ' [uncertain]' : ''}`).join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `no-bot-captions-${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    this.setEngineStatus('Transcript exported.');
  }

  private async restoreLicense(event: Event): Promise<void> {
    event.preventDefault();
    const input = this.byId<HTMLInputElement>('license-token');
    try {
      saveLicense(input.value);
      this.byId('license-status').textContent = 'Checking your license…';
      this.license = await verifyLicense(true);
      input.value = '';
      this.renderLicense();
      this.renderArchive();
    } catch (error) {
      this.byId('license-status').textContent = error instanceof Error ? error.message : 'That license could not be saved.';
    }
  }

  private renderLicense(): void {
    const status = this.byId('license-status');
    status.textContent = this.license.notice;
    status.classList.toggle('is-unlocked', this.license.unlocked);
    this.byId<HTMLAnchorElement>('buy-link').hidden = this.license.unlocked;
  }

  private saveArchive(): void {
    const stored = this.readArchive();
    stored.unshift({ id: crypto.randomUUID(), date: new Date().toISOString(), lines: this.captions.map(({ text, uncertain }) => ({ text, uncertain })) });
    localStorage.setItem('no-bot:archive', JSON.stringify(stored.slice(0, 20)));
    this.renderArchive();
  }

  private readArchive(): Array<{ id: string; date: string; lines: Array<{ text: string; uncertain: boolean }> }> {
    try { return JSON.parse(localStorage.getItem('no-bot:archive') ?? '[]'); } catch { return []; }
  }

  private renderArchive(): void {
    const archive = this.byId('archive');
    archive.hidden = !this.license.unlocked;
    if (!this.license.unlocked) return;
    const list = this.byId('archive-list');
    list.innerHTML = '';
    const records = this.readArchive();
    if (!records.length) { const item = document.createElement('li'); item.textContent = 'Completed caption sessions will be saved here on this device.'; list.append(item); return; }
    for (const record of records) {
      const item = document.createElement('li');
      const time = document.createElement('time'); time.dateTime = record.date; time.textContent = new Date(record.date).toLocaleString();
      const summary = document.createElement('span'); summary.textContent = `${record.lines.length} caption lines`;
      item.append(time, summary); list.append(item);
    }
  }

  private byId<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing element #${id}`);
    return element as T;
  }
}
