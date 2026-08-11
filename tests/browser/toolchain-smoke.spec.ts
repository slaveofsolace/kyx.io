import { expect, test } from '@playwright/test';

test('truthful shell boots in its declared desktop and mobile states', async ({ page }, testInfo) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  const requestOrigins = new Set<string>();

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.protocol === 'http:' || url.protocol === 'https:') requestOrigins.add(url.origin);
  });
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
  });

  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page).toHaveTitle('KYX.IO — Arena FPS');

  const mobile = testInfo.project.name === 'chromium-mobile-unsupported';
  if (mobile) {
    await expect(page.getByRole('heading', { name: 'DESKTOP REQUIRED' })).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-launch-support', 'desktop-required');
  } else {
    await expect(page.getByRole('button', { name: 'Enter Relay practice' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('#online-match-button')).toBeDisabled();
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect([...requestOrigins]).toEqual([new URL(page.url()).origin]);
});
