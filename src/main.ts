import './styles.css';
import { CaptionApp } from './app';
import { recordPageview } from './pageview';

const rootElement = document.querySelector<HTMLElement>('#app');
if (!rootElement) throw new Error('Application root is missing.');
const root = rootElement;

const legalPages: Record<string, { title: string; updated: string; body: string }> = {
  '/privacy': {
    title: 'Privacy, in plain language.',
    updated: 'August 28, 2026',
    body: `
      <section><h2>Your meeting audio</h2><p>Audio you explicitly share is processed by a speech model inside your browser. No-Bot Captions does not send meeting audio or transcripts to our server. The rolling audio repair buffer lasts at most 12 seconds in memory and is discarded when you stop capture, close, or reload the page.</p></section>
      <section><h2>Data on your device</h2><p>The speech model is cached by your browser for offline reuse. A Supporter license token and its most recent verification result are stored in localStorage. If Supporter archive is unlocked, completed transcripts are stored only in localStorage on that device. You can clear these through your browser’s site-data controls.</p></section>
      <section><h2>Data our server receives</h2><p>We keep a privacy-respecting daily page count containing only the page path, date, and total. It has no cookie, account, fingerprint, full IP address, or meeting data. Standard short-lived infrastructure logs may contain request metadata for security and reliability.</p></section>
      <section><h2>Purchases</h2><p>Checkout and license verification are handled by Sociobot’s billing API, with Dodo as merchant of record. Their systems receive the purchase and license details needed to provide the service. This site never receives card details.</p></section>
      <section><h2>Your choices</h2><p>Capture never begins without the browser picker and your confirmation. Stop sharing from this app or the browser indicator at any time. For privacy questions, email <a href="mailto:privacy@sociobot.in">privacy@sociobot.in</a>.</p></section>`,
  },
  '/terms': {
    title: 'Terms made for a caption aid.',
    updated: 'August 28, 2026',
    body: `
      <section><h2>Use and consent</h2><p>No-Bot Captions is an assistive caption aid, not a certified court, medical, or safety transcription service. You are responsible for obtaining consent and following recording or interception laws that apply to every participant and location.</p></section>
      <section><h2>Accuracy</h2><p>Speech recognition can omit, combine, or mishear words. Uncertain markers, replay, retry, and editing help you check important phrases, but they do not guarantee accuracy. Confirm consequential information with the speaker.</p></section>
      <section><h2>Supporter purchase</h2><p>Supporter costs $29 as a one-time purchase and unlocks the local session archive on licensed devices plus access to future packaged offline model updates when available. Core live captions, replay, repair, and export remain free. Sociobot/Dodo is merchant of record and handles payment and refunds; a refund revokes the related license.</p></section>
      <section><h2>Availability and fair use</h2><p>System-audio capture depends on browser and operating-system support. Do not use the service to violate privacy, intellectual property, or applicable law, or to attempt unauthorized access to the service.</p></section>
      <section><h2>Warranty and liability</h2><p>The service is provided “as is” without warranties. To the extent permitted by law, Sociobot is not liable for decisions based on inaccurate or unavailable captions. These terms do not limit rights that cannot legally be limited.</p></section>
      <section><h2>Contact</h2><p>Questions about these terms can be sent to <a href="mailto:support@sociobot.in">support@sociobot.in</a>.</p></section>`,
  },
};

function renderLegal(path: string): void {
  const page = legalPages[path];
  if (!page) return;
  document.title = `${path === '/privacy' ? 'Privacy' : 'Terms'} — No-Bot Captions`;
  root.innerHTML = `
    <header class="site-header"><a class="wordmark" href="/"><span aria-hidden="true" class="wordmark-mark">▰</span> NO-BOT / CAPTIONS</a><nav aria-label="Primary navigation"><a href="/">Back to captions</a></nav></header>
    <main id="main" class="legal-page"><p class="eyebrow">POLICY / ${page.updated.toLocaleUpperCase()}</p><h1>${page.title}</h1><p class="legal-intro">The short version: capture is visible, meeting audio stays in your browser, and the free tool does not need an account.</p>${page.body}</main>
    <footer><p>No-Bot Captions is built for consent, not surveillance.</p><nav aria-label="Legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav></footer>`;
  recordPageview(path);
}

if (legalPages[window.location.pathname]) renderLegal(window.location.pathname);
else {
  const app = new CaptionApp(root);
  void app.mount();
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
