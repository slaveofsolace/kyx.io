import { expect, test } from '@playwright/test';

const WINDOWS_CHROME_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36';
const AUTHORITY_CONFIGURED = Boolean(process.env.VITE_KYX_AUTHORITY_ORIGIN?.trim());

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
    await expect(page.getByRole('button', { name: /^(?:Enter Relay|Quick Match)$/u })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('body')).toHaveAttribute(
      'data-launch-support',
      'canonical-authority-lobby',
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-canonical-runtime',
      'authority-relay-v1',
    );
    await expect(page.locator('body')).toHaveAttribute(
      'data-canonical-lobby-status',
      'ready',
    );
    await expect(page.locator('#game-canvas')).toHaveAttribute('aria-hidden', 'true');
    const onlineButton = page.locator('#online-match-button');
    await expect(onlineButton).toBeVisible();
    const onlineAriaDisabled = await onlineButton.getAttribute('aria-disabled');
    expect(['true', 'false']).toContain(onlineAriaDisabled);
    expect(await onlineButton.isDisabled()).toBe(onlineAriaDisabled === 'true');
  }

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
  expect([...requestOrigins]).toEqual([new URL(page.url()).origin]);
});

test('the canonical lobby enters the authority-backed Practice runtime', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop');
  test.skip(AUTHORITY_CONFIGURED, 'configured builds use online Quick Match');

  await page.goto('/', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Enter Relay' }).click();
  await expect(page).toHaveURL(/\/practice(?:\?|$)/u);
  await page.waitForFunction(() => window.__KYX_LOCAL_PRACTICE__ !== undefined);
  await expect(page.locator('body')).toHaveAttribute(
    'data-launch-support',
    'local-relay-practice-authority',
  );
  await expect(page.getByRole('dialog', { name: 'First team to 40 wins' })).toBeVisible();
});

test('configured canonical lobby enters online Relay Quick Match in one click', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop');
  test.skip(!AUTHORITY_CONFIGURED, 'requires configured online authority');

  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('body')).toHaveAttribute(
    'data-canonical-primary-play',
    'online_authority',
  );
  await page.getByRole('button', { name: 'Quick Match' }).click();
  await expect(page).toHaveURL(
    /\/online\?mode=create&profile=relay-revision-1-authority-v1$/u,
  );
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
    await expect(page.getByRole('button', { name: /^(?:Enter Relay|Quick Match)$/u })).toBeVisible({
      timeout: 15_000,
    });
  } finally {
    await context.close();
  }
});
