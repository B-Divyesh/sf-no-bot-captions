import { chromium } from '@playwright/test';

const url = process.env.APP_URL || 'http://127.0.0.1:4173/';
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const page = await context.newPage();

async function installAudio() {
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const destination = context.createMediaStreamDestination();
        oscillator.frequency.value = 180;
        gain.gain.value = 0.08;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        await context.resume();
        return destination.stream;
      },
    });
    const status = document.querySelector('#engine-status');
    new MutationObserver(() => {
      if (status?.textContent?.includes('Audio is held only')) document.documentElement.dataset.modelCompleted = 'true';
    }).observe(status, { childList: true, subtree: true });
  });
}

async function startAndComplete(label) {
  await installAudio();
  await page.getByRole('button', { name: 'Choose meeting audio' }).first().click();
  await page.locator('#consent-permission').check();
  await page.locator('#consent-local').check();
  await page.getByRole('button', { name: 'Open system picker' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.modelCompleted === 'true', null, { timeout: 180_000 });
  console.log(`${label}: local inference completed`);
  await page.locator('#stop-button').click();
}

try {
  await page.goto(url);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await page.reload();
  await startAndComplete('online warm-up');

  const cached = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (name) => (await caches.open(name)).keys())))
    .flat()
    .map((request) => new URL(request.url).pathname));
  if (!cached.some((path) => path.startsWith('/models/')) || !cached.some((path) => path.startsWith('/wasm/'))) {
    throw new Error(`Incomplete offline runtime cache: ${cached.join(', ')}`);
  }

  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await startAndComplete('offline reload');
  console.log(`offline model smoke passed with ${cached.filter((path) => path.startsWith('/models/') || path.startsWith('/wasm/')).length} cached runtime files`);
} finally {
  await browser.close();
}
