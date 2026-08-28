import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function installSyntheticDisplayAudio(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => {
    const state = { calls: 0, tracks: [] as MediaStreamTrack[], contexts: [] as AudioContext[] };
    Object.defineProperty(window, '__captureTest', { configurable: true, value: state });
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
        state.contexts.push(context);
        state.tracks.push(...destination.stream.getAudioTracks());
        return destination.stream;
      },
    });
  });
}

async function installReplayStopProbe(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { stops: 0 };
    Object.defineProperty(window, '__replayStopTest', { configurable: true, value: state });
    const originalStop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.stop = function(...args: Parameters<AudioBufferSourceNode['stop']>): void {
      state.stops += 1;
      originalStop.apply(this, args);
    };
  });
}

async function startCapture(page: import('@playwright/test').Page): Promise<void> {
  await page.getByRole('button', { name: 'Choose meeting audio' }).first().click();
  await page.locator('#consent-permission').check();
  await page.locator('#consent-local').check();
  await page.getByRole('button', { name: 'Open system picker' }).click();
  await expect(page.locator('#capture-label')).toContainText('Capturing');
}

test('main caption path exposes consent and keyboard-ready controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle(/No-Bot Captions/);
  await expect(page.locator('h1')).toHaveCount(1);
  await page.getByRole('button', { name: 'Choose meeting audio' }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Open system picker' }).click();
  await expect(page.getByRole('alert')).toContainText('Confirm both');
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
  expect(errors).toEqual([]);
});

test('legal pages have one heading and main landmark', async ({ page }) => {
  for (const path of ['/privacy', '/terms']) {
    await page.goto(path);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([]);
  }
});

test('baseline browsing stays on the product origin', async ({ page }) => {
  const origins = new Set<string>();
  page.on('request', (request) => origins.add(new URL(request.url()).origin));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect([...origins]).toEqual([new URL(page.url()).origin]);
  await expect(page.locator('#buy-link')).toHaveAttribute('href', 'https://api.sociobot.in/api/v1/products/no-bot-captions/checkout');
});

test('one capture owns one stream and Stop discards every audio repair buffer', async ({ page }) => {
  await page.goto('/');
  await installSyntheticDisplayAudio(page);
  await startCapture(page);
  await expect(page.locator('#hero-start')).toHaveText('Stop captions');

  await page.locator('#console-start').evaluate((button: HTMLButtonElement) => button.click());
  expect(await page.evaluate(() => (window as unknown as { __captureTest: { calls: number } }).__captureTest.calls)).toBe(1);

  await expect(page.locator('#replay-button')).toBeEnabled({ timeout: 5_000 });
  await page.locator('#stop-button').click();
  await expect(page.locator('#replay-button')).toBeDisabled();
  await expect(page.locator('#engine-status')).toContainText('repair buffer were discarded');
  expect(await page.evaluate(() => (window as unknown as { __captureTest: { tracks: MediaStreamTrack[] } }).__captureTest.tracks.map((track) => track.readyState))).toEqual(['ended']);

  const stoppedStatus = await page.locator('#engine-status').textContent();
  await page.locator('#replay-button').evaluate((button: HTMLButtonElement) => button.click());
  expect(await page.locator('#engine-status').textContent()).toBe(stoppedStatus);
});

test('Stop cancels an active replay and preserves its privacy status', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser covers the replay lifecycle');
  await installReplayStopProbe(page);
  await page.goto('/');
  await installSyntheticDisplayAudio(page);
  await startCapture(page);
  await expect(page.locator('#replay-button')).toBeEnabled({ timeout: 5_000 });

  await page.locator('#replay-button').click();
  await expect(page.locator('#engine-status')).toContainText('Replaying');
  await page.locator('#stop-button').click();
  await expect(page.locator('#engine-status')).toContainText('repair buffer were discarded');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __replayStopTest: { stops: number } }).__replayStopTest.stops)).toBe(1);

  await page.waitForTimeout(1_500);
  await expect(page.locator('#engine-status')).toContainText('repair buffer were discarded');
  await expect(page.locator('#engine-status')).not.toContainText('Replay finished');
});

test('offline reload skips page counting and has no console error', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser covers the offline page-count boundary');
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  const errors: string[] = [];
  const pageviewRequests: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/pageview') pageviewRequests.push(request.url()); });
  await page.context().setOffline(true);
  await page.reload();
  await expect(page.locator('h1')).toHaveCount(1);
  await page.waitForTimeout(300);

  expect(pageviewRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('advertised Space shortcut works while a capture button has focus', async ({ page }) => {
  await page.goto('/');
  await installSyntheticDisplayAudio(page);
  await startCapture(page);
  await page.locator('#pause-button').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#capture-label')).toContainText('Paused');
  await page.locator('#stop-button').click();
});

test('an empty manual correction announces how to recover', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one browser covers shared validation behavior');
  await page.addInitScript(() => {
    class FailingWorker {
      onmessage: ((event: MessageEvent) => void) | null = null;
      postMessage(message: { id: string }): void {
        setTimeout(() => this.onmessage?.({ data: { type: 'error', id: message.id, message: 'Synthetic model error' } } as MessageEvent), 0);
      }
      terminate(): void {}
    }
    Object.defineProperty(window, 'Worker', { configurable: true, value: FailingWorker });
  });
  await page.goto('/');
  await installSyntheticDisplayAudio(page);
  await startCapture(page);
  await expect(page.getByText('Caption engine needs attention.')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'Edit text' }).click();
  await page.getByLabel('Correct this caption').fill('   ');
  await page.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.locator('.edit-error')).toContainText('Enter the corrected caption');
  await page.locator('#stop-button').click();
});

test('mobile legal targets meet 44px and secondary telemetry is dropped', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 1000) > 500, 'mobile-only geometry check');
  await page.goto('/');
  const boxes = await page.locator('.legal-note a, footer nav a').evaluateAll((links) => links.map((link) => {
    const box = link.getBoundingClientRect();
    return { label: link.textContent, width: box.width, height: box.height };
  }));
  expect(boxes.length).toBeGreaterThan(0);
  for (const box of boxes) {
    expect(box.width, box.label ?? undefined).toBeGreaterThanOrEqual(44);
    expect(box.height, box.label ?? undefined).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('.telemetry')).toBeHidden();
});
