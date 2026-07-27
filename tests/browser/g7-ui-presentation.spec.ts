import { expect, test, type Page } from '@playwright/test';

type RuntimeErrors = {
  console: string[];
  page: string[];
  requests: string[];
};

function observeRuntimeErrors(page: Page): RuntimeErrors {
  const errors: RuntimeErrors = { console: [], page: [], requests: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') errors.console.push(message.text());
  });
  page.on('pageerror', (error) => errors.page.push(error.message));
  page.on('requestfailed', (request) => {
    errors.requests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`);
  });
  return errors;
}

async function waitForMenu(page: Page): Promise<void> {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#connect-screen')).toHaveClass(/hidden/, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Start offline practice' })).toBeVisible();
}

test('authored menu remains compact, keyboard navigable, and responsive', async ({ page }) => {
  const errors = observeRuntimeErrors(page);
  await waitForMenu(page);

  await expect(page.locator('body')).toHaveAttribute('data-interface', 'kyx-field-ui-v3');
  await expect(page.getByRole('heading', { name: 'Iron Bastion' })).toBeVisible();
  await expect(page.locator('.practice-stat-grid > span').filter({ hasText: '1 player + 7 bots' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Online match — not available' })).toBeDisabled();

  const launchSurface = page.locator('.practice-launch-card');
  expect(await launchSurface.evaluate((element) => getComputedStyle(element).backdropFilter)).toBe('none');
  expect(await launchSurface.evaluate((element) => getComputedStyle(element).borderRadius)).toBe('0px');

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#panel-settings')).toBeVisible();
  await expect(page.locator('#settings-close-btn')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#settings-save-btn')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#settings-close-btn')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel-settings')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeFocused();

  await page.setViewportSize({ width: 768, height: 900 });
  const menuBox = await launchSurface.boundingBox();
  expect(menuBox).not.toBeNull();
  expect(menuBox?.x).toBeGreaterThanOrEqual(0);
  expect((menuBox?.x ?? 0) + (menuBox?.width ?? 0)).toBeLessThanOrEqual(768);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768);

  await page.getByRole('button', { name: 'Settings' }).click();
  const settingsBox = await page.locator('#panel-settings').boundingBox();
  expect(settingsBox?.x).toBe(0);
  expect(settingsBox?.width).toBe(768);
  await page.getByRole('group', { name: 'Camera / HUD motion' })
    .getByRole('button', { name: 'Reduced' })
    .click();
  await page.getByRole('group', { name: 'Contrast' })
    .getByRole('button', { name: 'High' })
    .click();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-high-contrast', 'true');
  await page.getByRole('button', { name: 'Close settings' }).click();

  await page.setViewportSize({ width: 3440, height: 1440 });
  const ultrawideMenuBox = await launchSurface.boundingBox();
  expect(ultrawideMenuBox?.width).toBeGreaterThanOrEqual(900);
  expect((ultrawideMenuBox?.x ?? 0) + (ultrawideMenuBox?.width ?? 0)).toBeLessThanOrEqual(3440);

  expect(errors).toEqual({ console: [], page: [], requests: [] });
});

test('gameplay hierarchy, pause, and scoreboard do not overlap', async ({ page }) => {
  const errors = observeRuntimeErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await waitForMenu(page);
  await page.getByRole('button', { name: 'Start offline practice' }).click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#map-loading')).toHaveClass(/hidden/, { timeout: 15_000 });

  const boxes = await page.evaluate(() => Object.fromEntries(
    ['hud-vitals', 'weapon-wrap', 'score-wrap', 'ability-rack', 'dm-timer'].map((id) => {
      const rect = document.getElementById(id)?.getBoundingClientRect();
      return [id, rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom } : null];
    }),
  ));
  const overlaps = (
    left: { left: number; right: number; top: number; bottom: number },
    right: { left: number; right: number; top: number; bottom: number },
  ) => left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;

  expect(boxes['hud-vitals']).not.toBeNull();
  expect(boxes['weapon-wrap']).not.toBeNull();
  expect(boxes['ability-rack']).not.toBeNull();
  expect(overlaps(boxes['hud-vitals']!, boxes['ability-rack']!)).toBe(false);
  expect(overlaps(boxes['weapon-wrap']!, boxes['ability-rack']!)).toBe(false);
  expect(overlaps(boxes['score-wrap']!, boxes['dm-timer']!)).toBe(false);
  await expect(page.locator('.dev-build-diagnostics')).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Resume practice' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Quit to practice menu' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Resume practice' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden();

  await page.keyboard.down('Tab');
  await expect(page.locator('#scoreboard-overlay')).toBeVisible();
  await expect(page.locator('#sb-rows tr')).toHaveCount(8);
  await page.keyboard.up('Tab');
  await expect(page.locator('#scoreboard-overlay')).toBeHidden();

  expect(errors).toEqual({ console: [], page: [], requests: [] });
});

test('unconfigured online route shares the restrained presentation system', async ({ page }) => {
  const errors = observeRuntimeErrors(page);
  await page.goto('/online', { waitUntil: 'networkidle' });
  const route = page.locator('[data-testid="online-preview-route"]');
  await expect(route).toBeVisible();
  await expect(page.getByRole('heading', { name: /server-owned combat|online authority/i })).toBeVisible();
  expect(await route.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  expect(errors).toEqual({ console: [], page: [], requests: [] });
});
