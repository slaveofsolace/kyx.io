import { expect, test } from '@playwright/test';

const WINDOWS_CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36';

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

test('touch-capable Windows desktop is not forced behind the mobile boundary', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop');

  const context = await browser.newContext({
    hasTouch: true,
    userAgent: WINDOWS_CHROME_USER_AGENT,
    viewport: { width: 2048, height: 1080 },
  });
  const page = await context.newPage();

  try {
    await page.goto('/', { waitUntil: 'networkidle' });

    expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);
    expect(await page.locator('body').getAttribute('data-launch-support')).not.toBe('desktop-required');
    await expect(page.locator('#desktop-required-overlay')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Enter Relay practice' })).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await context.close();
  }
});
