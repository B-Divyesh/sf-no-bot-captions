import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

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
  }
});
