import './styles.css';
import { CaptionApp } from './app';
import { recordPageview } from './pageview';

const rootElement = document.querySelector<HTMLElement>('#app');
if (!rootElement) throw new Error('Application root is missing.');
const root: HTMLElement = rootElement;

const canonicalOrigin = 'https://no-bot-captions.sociobot.in';

function setRouteMetadata(path: string, title: string, description: string): void {
  document.title = title;
  document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute('href', `${canonicalOrigin}${path}`);
  document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', description);
  document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.setAttribute('content', title);
  document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.setAttribute('content', description);
  document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.setAttribute('content', title);
  document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.setAttribute('content', description);
}

const legalPages: Record<string, { title: string; description: string; updated: string; body: string }> = {
  '/privacy': {
    title: 'Privacy — No-Bot Captions',
    description: 'How No-Bot Captions keeps meeting audio, captions, and licenses on your device.',
    updated: 'September 6, 2026',
    body: `
      <section><h2>Meeting audio</h2><p>Audio you choose is processed by a speech model in your browser. No-Bot Captions does not send meeting audio or captions to our server. The repair buffer holds at most 12 seconds in memory. It clears when you stop capture, close, or reload.</p></section>
      <section><h2>Data on your device</h2><p>The speech model stays in browser cache for offline use. A Supporter license token and its verification result stay in localStorage. An unlocked archive also stays in localStorage on this device. Browser site-data controls remove these items.</p></section>
      <section><h2>Data our server receives</h2><p>The server stores a daily count by page path. It stores no account, audio, caption, or IP-address field. A temporary rate limit can use a network address for one minute. It is never written to the count.</p></section>
      <section><h2>Purchases</h2><p>Sociobot billing handles checkout and license checks. Dodo is the merchant of record. This site never receives card details.</p></section>
      <section><h2>Your choices</h2><p>Capture starts only after your confirmation and the browser picker. Stop sharing here or from the browser indicator. Email <a href="mailto:privacy@sociobot.in">privacy@sociobot.in</a> with privacy questions.</p></section>`,
  },
  '/terms': {
    title: 'Terms — No-Bot Captions',
    description: 'Terms for using No-Bot Captions and the optional Supporter archive.',
    updated: 'September 6, 2026',
    body: `
      <section><h2>Use and consent</h2><p>No-Bot Captions is a caption aid. It is not a certified legal, medical, or safety transcription service. Get consent and follow the laws that apply to every participant and location.</p></section>
      <section><h2>Accuracy</h2><p>Speech recognition can omit, combine, or mishear words. Replay, retry, and editing help you check important phrases. Confirm consequential information with the speaker.</p></section>
      <section><h2>Supporter purchase</h2><p>Supporter costs $29 as a one-time purchase. It adds a local session archive on licensed devices. Live captions, replay, repair, and export remain free. Sociobot and Dodo handle payment and refunds. A refund revokes the related license.</p></section>
      <section><h2>Availability</h2><p>Meeting-audio capture depends on browser and operating-system support. Do not use the service to violate privacy, intellectual property, or applicable law.</p></section>
      <section><h2>Warranty and liability</h2><p>The service is provided as is. To the extent permitted by law, Sociobot is not liable for decisions based on inaccurate or unavailable captions. These terms do not limit rights that cannot legally be limited.</p></section>
      <section><h2>Contact</h2><p>Email <a href="mailto:support@sociobot.in">support@sociobot.in</a> with questions about these terms.</p></section>`,
  },
};

function sharedHeader(): string {
  return `<header class="site-header"><a class="wordmark" href="/" aria-label="No-Bot Captions home"><span aria-hidden="true" class="wordmark-mark">▰</span> NO-BOT / CAPTIONS</a><nav aria-label="Primary navigation"><a href="/demo">Demo</a><a href="/#how">How it works</a><a href="/privacy">Privacy</a></nav></header>`;
}

function sharedFooter(): string {
  return `<footer><p>Private captions for Google Meet without a recording bot.</p><nav aria-label="Legal"><a href="/demo">Demo</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav><small>Built by Param Factory · v1.0.0 · Original generated artwork</small></footer>`;
}

function renderLegal(path: string): void {
  const page = legalPages[path];
  if (!page) return;
  setRouteMetadata(path, page.title, page.description);
  root.innerHTML = `${sharedHeader()}<main id="main" class="legal-page"><p class="sr-only" aria-live="polite">${page.title}</p><p class="eyebrow">Updated ${page.updated}</p><h1 tabindex="-1">${path === '/privacy' ? 'Privacy for No-Bot Captions' : 'Terms for No-Bot Captions'}</h1><p class="legal-intro">Meeting audio stays in your browser. The free tool needs no account.</p>${page.body}</main>${sharedFooter()}`;
  requestAnimationFrame(() => root.querySelector<HTMLHeadingElement>('h1')?.focus());
  recordPageview(path);
}

const path = window.location.pathname;
if (legalPages[path]) {
  renderLegal(path);
} else if (path === '/demo') {
  setRouteMetadata('/demo', 'Demo — No-Bot Captions', 'Try sample private meeting captions and repair an uncertain line without sharing audio.');
  void new CaptionApp(root, true).mount();
} else {
  setRouteMetadata('/', 'No-Bot Captions — private meeting captions', 'Private live captions for Google Meet users who cannot add a recording bot.');
  void new CaptionApp(root).mount();
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('/sw.js'));
}
