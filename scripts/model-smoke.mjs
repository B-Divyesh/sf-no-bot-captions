import { chromium } from '@playwright/test';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(error.message));
await page.route('**/api/pageview', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"recorded":true}' }));
await page.goto(process.env.APP_URL || 'http://127.0.0.1:4173/');
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
      const canvas = document.createElement('canvas');
      const video = canvas.captureStream(1).getVideoTracks()[0];
      if (video) destination.stream.addTrack(video);
      window.__noBotSmokeAudio = { context, oscillator };
      return destination.stream;
    },
  });
});
await page.getByRole('button', { name: 'Choose meeting audio' }).first().click();
await page.getByText('I have everyone’s permission').click();
await page.getByText('I understand the selected audio').click();
await page.getByRole('button', { name: 'Open system picker' }).click();
await page.waitForTimeout(8_000);
console.log('capture smoke:', await page.locator('#capture-label').innerText(), await page.locator('#engine-status').innerText(), await page.locator('#level-meter').getAttribute('style'));
await page.waitForFunction(() => {
  const status = document.querySelector('#engine-status')?.textContent ?? '';
  return /Audio is held|could not process|model error/i.test(status);
}, null, { timeout: 180_000 });
const status = await page.locator('#engine-status').innerText();
if (/error|could not process/i.test(status) || errors.length) {
  throw new Error(`Model smoke failed. Status: ${status}. Console: ${errors.join(' | ')}`);
}
console.log(`model smoke passed: ${status}`);
await browser.close();
