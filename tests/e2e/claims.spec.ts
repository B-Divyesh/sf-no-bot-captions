import { expect, test } from '@playwright/test';

async function openDemo(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/demo');
  await expect(page).toHaveTitle('Demo — No-Bot Captions');
  await expect(page.getByLabel('Demo mode')).toBeVisible();
}

async function startReal(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('link', { name: 'Start for real' }).first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Choose meeting audio' }).first()).toBeVisible();
}

async function installSyntheticDisplayAudio(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const state = { calls: 0, tracks: [] as MediaStreamTrack[] };
    Object.defineProperty(window, '__claimCapture', { configurable: true, value: state });
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        state.calls += 1;
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const destination = context.createMediaStreamDestination();
        oscillator.frequency.value = 180;
        gain.gain.value = 0.08;
        oscillator.connect(gain).connect(destination);
        oscillator.start();
        await context.resume();
        state.tracks.push(...destination.stream.getAudioTracks());
        return destination.stream;
      },
    });
  });
}

async function startSyntheticCapture(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Choose meeting audio' }).first().click();
  await page.locator('#consent-permission').check();
  await page.locator('#consent-local').check();
  await page.getByRole('button', { name: 'Open system picker' }).click();
  await expect(page.locator('#capture-label')).toContainText('Capturing');
}

test('@claim:demo-sample opens a populated caption workspace without shared audio', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByText('We can move the customer review to Thursday afternoon.')).toBeVisible();
  await expect(page.getByText('Please confirm whether the renewal includes the data export.')).toBeVisible();
  await expect(page.getByText('I will send the revised agenda after this call.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reset demo' })).toBeVisible();
});

test('@claim:demo-reset restores the original realistic sample', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Please confirm that the renewal includes the data export.')).toBeVisible();
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expect(page.getByText('Please confirm whether the renewal includes the data export.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('@claim:demo-isolation keeps real licenses and archives untouched', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('no-bot:archive', '[{"id":"real-session"}]');
    localStorage.setItem('sb_license:no-bot-captions', 'real-license');
  });
  await openDemo(page);
  await page.getByRole('button', { name: 'Edit text' }).click();
  await page.getByLabel('Correct this caption').fill('Please confirm the data export is included.');
  await page.getByRole('button', { name: 'Save correction' }).click();
  expect(await page.evaluate(() => localStorage.getItem('no-bot:archive'))).toBe('[{"id":"real-session"}]');
  expect(await page.evaluate(() => localStorage.getItem('sb_license:no-bot-captions'))).toBe('real-license');
  expect(await page.evaluate(() => localStorage.getItem('demo:no-bot-captions:state'))).toContain('data export is included');
  await page.getByRole('button', { name: 'Reset demo' }).click();
  expect(await page.evaluate(() => localStorage.getItem('demo:no-bot-captions:state'))).toBeNull();
});

test('@claim:no-account-demo lets a visitor use the sample without account fields', async ({ page }) => {
  await openDemo(page);
  await expect(page.locator('input:visible')).toHaveCount(0);
  await expect(page.getByText('Sample captions are ready.')).toBeVisible();
});

test('@claim:no-bot-or-upload keeps approved-audio capture on the product origin', async ({ page }) => {
  const origins = new Set<string>();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  await openDemo(page);
  await startReal(page);
  await installSyntheticDisplayAudio(page);
  await startSyntheticCapture(page);
  await expect(page.getByRole('button', { name: 'Replay last 12 s' })).toBeEnabled({ timeout: 5_000 });
  await page.getByRole('button', { name: 'Stop capture' }).click();
  expect([...origins]).toEqual([new URL(page.url()).origin]);
});

test('@claim:consent-before-audio keeps the picker closed until both confirmations are checked', async ({ page }) => {
  await openDemo(page);
  await startReal(page);
  await installSyntheticDisplayAudio(page);
  await page.getByRole('button', { name: 'Choose meeting audio' }).first().click();
  await page.getByRole('button', { name: 'Open system picker' }).click();
  await expect(page.getByRole('alert')).toContainText('Confirm both');
  expect(await page.evaluate(() => (window as unknown as { __claimCapture: { calls: number } }).__claimCapture.calls)).toBe(0);
  await page.locator('#consent-permission').check();
  await page.locator('#consent-local').check();
  await page.getByRole('button', { name: 'Open system picker' }).click();
  await expect(page.locator('#capture-label')).toContainText('Capturing');
  expect(await page.evaluate(() => (window as unknown as { __claimCapture: { calls: number } }).__claimCapture.calls)).toBe(1);
  await page.getByRole('button', { name: 'Stop capture' }).click();
});

test('@claim:repair-window discards temporary replay audio when capture stops', async ({ page }) => {
  await openDemo(page);
  await startReal(page);
  await installSyntheticDisplayAudio(page);
  await startSyntheticCapture(page);
  await expect(page.getByRole('button', { name: 'Replay last 12 s' })).toBeEnabled({ timeout: 5_000 });
  await page.getByRole('button', { name: 'Stop capture' }).click();
  await expect(page.getByRole('button', { name: 'Replay last 12 s' })).toBeDisabled();
  await expect(page.locator('#engine-status')).toContainText('repair buffer were discarded');
  expect(await page.evaluate(() => (window as unknown as { __claimCapture: { tracks: MediaStreamTrack[] } }).__claimCapture.tracks.map((track) => track.readyState))).toEqual(['ended']);
});

test('@claim:replay-12-seconds plays the sample repair window on this device', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Replay 12 s' }).first().click();
  await expect(page.locator('#engine-status')).toContainText('Replaying 12 seconds on this device');
});

test('@claim:retry-uncertain replaces the uncertain sample line', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('Please confirm that the renewal includes the data export.')).toBeVisible();
  await expect(page.getByText('Uncertain —')).toHaveCount(0);
  await expect(page.locator('#engine-status')).toContainText('Sample recovered');
});

test('@claim:edit-caption saves a visible correction in the sample', async ({ page }) => {
  await openDemo(page);
  await page.getByRole('button', { name: 'Edit text' }).click();
  await page.getByLabel('Correct this caption').fill('The renewal includes the data export.');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText('The renewal includes the data export.')).toBeVisible();
});

test('@claim:text-export downloads the sample transcript', async ({ page }) => {
  await openDemo(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export text' }).click();
  const file = await download;
  const stream = await file.createReadStream();
  let exported = '';
  for await (const chunk of stream ?? []) exported += chunk.toString();
  expect(exported).toContain('customer review');
  expect(exported).toContain('renewal includes the data export');
});

test('@claim:free-core shows caption, repair, and export controls without a license', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByRole('button', { name: 'Replay last 12 s' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Export text' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit text' })).toBeVisible();
});

test('@claim:supporter-price shows the one-time $29 archive offer without touching a real license', async ({ page }) => {
  await openDemo(page);
  await expect(page.getByText('ONE TIME / $29')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Supporter adds a local session archive' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Start for real to buy Supporter' })).toHaveAttribute('href', '/');
  await startReal(page);
  await expect(page.getByRole('link', { name: 'Buy Supporter — $29' })).toHaveAttribute('href', 'https://api.sociobot.in/api/v1/products/no-bot-captions/checkout');
});

test('@claim:daily-page-count accepts a page path without an account', async ({ page }) => {
  await openDemo(page);
  const result = await page.request.post('/api/pageview', { data: { path: '/demo' } });
  expect(result.status()).toBe(200);
  await expect(result.json()).resolves.toEqual({ recorded: true });
});

test('@claim:page-count-rate-limit returns a retry time when a client uses its allowance', async ({ page }) => {
  await openDemo(page);
  const client = `198.51.100.${Math.floor(Math.random() * 200) + 20}`;
  const responses = await Promise.all(Array.from({ length: 41 }, () => page.request.post('/api/pageview', {
    headers: { 'x-forwarded-for': client },
    data: { path: '/demo' },
  })));
  const denied = responses.find((response) => response.status() === 429);
  expect(denied).toBeDefined();
  expect(denied?.headers()['retry-after']).toMatch(/^\d+$/);
});

test('@claim:offline-demo reloads the sample without a network after the first visit', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await openDemo(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('We can move the customer review to Thursday afternoon.')).toBeVisible();
  expect(errors).toEqual([]);
  await context.close();
});

test('@claim:local-caption-model processes shared audio in the browser', async ({ page }) => {
  test.setTimeout(240_000);
  await openDemo(page);
  await startReal(page);
  await installSyntheticDisplayAudio(page);
  await startSyntheticCapture(page);
  await page.waitForFunction(() => /Audio is held only|could not process|model error/i.test(document.querySelector('#engine-status')?.textContent ?? ''), null, { timeout: 180_000 });
  await expect(page.locator('#engine-status')).not.toContainText(/could not process|model error/i);
  await page.getByRole('button', { name: 'Stop capture' }).click();
});

test('@claim:offline-caption-model keeps the cached local model usable after reload', async ({ browser }) => {
  test.setTimeout(360_000);
  const context = await browser.newContext();
  const page = await context.newPage();
  const run = async (label: string) => {
    await installSyntheticDisplayAudio(page);
    await startSyntheticCapture(page);
    await page.waitForFunction(() => document.querySelector('#engine-status')?.textContent?.includes('Audio is held only') === true, null, { timeout: 180_000 });
    await expect(page.locator('#engine-status'), label).toContainText('Audio is held only');
    await page.getByRole('button', { name: 'Stop capture' }).click();
  };
  await openDemo(page);
  await startReal(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
  await page.reload();
  await run('online warm-up');
  const paths = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (name) => (await caches.open(name)).keys())))
    .flat()
    .map((request) => new URL(request.url).pathname));
  expect(paths.some((path) => path.startsWith('/models/'))).toBe(true);
  expect(paths.some((path) => path.startsWith('/wasm/'))).toBe(true);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await run('offline reload');
  await context.close();
});
