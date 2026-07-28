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

async function waitForMenu(page: Page, search = ''): Promise<void> {
  await page.goto(`/${search}`, { waitUntil: 'networkidle' });
  await expect(page.locator('#connect-screen')).toHaveClass(/hidden/, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Start offline practice' })).toBeVisible();
}

test('Tournament Instrument Rev2 is the default presentation with bounded HUD layout', async ({ page }) => {
  const errors = observeRuntimeErrors(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await waitForMenu(page);

  await expect(page.locator('body')).toHaveAttribute(
    'data-g7-presentation',
    'tournament-instrument-rev2',
  );
  await expect(page.locator('body')).toHaveAttribute(
    'data-g7-candidate',
    'foundry-tactical-v1',
  );
  await expect(page.locator('#hud')).toHaveAttribute(
    'data-ui-candidate',
    'foundry-tactical-v1',
  );

  const launchSurface = page.locator('.practice-launch-card');
  expect(await launchSurface.evaluate((element) => getComputedStyle(element).backdropFilter)).toBe('none');
  expect(await launchSurface.evaluate((element) => getComputedStyle(element).borderRadius)).toBe('0px');

  await page.getByRole('button', { name: 'Start offline practice' }).click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#map-loading')).toHaveClass(/hidden/, { timeout: 15_000 });

  const auditLayout = () => page.evaluate(() => {
    const boxes = Object.fromEntries(
      ['hud-vitals', 'weapon-wrap', 'score-wrap', 'ability-rack', 'dm-timer'].map((id) => {
        const rect = document.getElementById(id)?.getBoundingClientRect();
        return [id, rect ? {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        } : null];
      }),
    );
    const overlaps = (
      left: { left: number; right: number; top: number; bottom: number },
      right: { left: number; right: number; top: number; bottom: number },
    ) => left.left < right.right
      && left.right > right.left
      && left.top < right.bottom
      && left.bottom > right.top;
    return {
      overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
      overflowY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
      vitalsAbilities: overlaps(boxes['hud-vitals']!, boxes['ability-rack']!),
      weaponAbilities: overlaps(boxes['weapon-wrap']!, boxes['ability-rack']!),
      scoreTimer: overlaps(boxes['score-wrap']!, boxes['dm-timer']!),
      outside: Object.entries(boxes)
        .filter(([, box]) => box && (
          box.left < 0
          || box.top < 0
          || box.right > window.innerWidth
          || box.bottom > window.innerHeight
        ))
        .map(([id]) => id),
    };
  });

  expect(await auditLayout()).toEqual({
    overflowX: 0,
    overflowY: 0,
    vitalsAbilities: false,
    weaponAbilities: false,
    scoreTimer: false,
    outside: [],
  });

  const instrumentText = await page.evaluate(() => Object.fromEntries(
    [
      ['authority', '.hud-match-head > span'],
      ['roster', '#server-pop'],
      ['metric', '.hud-score-metrics small'],
      ['abilityName', '.ability-name'],
      ['abilityState', '.ability-state'],
      ['ammoQualifier', '.hud-ammo-row > span'],
    ].map(([name, selector]) => {
      const element = document.querySelector(selector);
      return [name, element ? Number.parseFloat(getComputedStyle(element).fontSize) : 0];
    }),
  ));
  expect(instrumentText).toEqual({
    authority: 11,
    roster: 11,
    metric: 11,
    abilityName: 11,
    abilityState: 11,
    ammoQualifier: 10,
  });

  await page.waitForTimeout(750);
  const nameplateCollisions = await page.evaluate(() => {
    const boxes = Array.from(document.querySelectorAll<HTMLElement>('.nameplate'))
      .filter((element) => getComputedStyle(element).display !== 'none')
      .map((element) => ({
        label: element.textContent?.trim() ?? 'Enemy',
        rect: element.getBoundingClientRect(),
      }));
    const collisions: string[] = [];
    for (let leftIndex = 0; leftIndex < boxes.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < boxes.length; rightIndex += 1) {
        const left = boxes[leftIndex]!;
        const right = boxes[rightIndex]!;
        if (
          left.rect.left < right.rect.right
          && left.rect.right > right.rect.left
          && left.rect.top < right.rect.bottom
          && left.rect.bottom > right.rect.top
        ) {
          collisions.push(`${left.label} / ${right.label}`);
        }
      }
    }
    return collisions;
  });
  expect(nameplateCollisions).toEqual([]);

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--hud-scale', '1.25');
  });
  expect(await auditLayout()).toEqual({
    overflowX: 0,
    overflowY: 0,
    vitalsAbilities: false,
    weaponAbilities: false,
    scoreTimer: false,
    outside: [],
  });
  expect((await page.locator('#score-wrap').boundingBox())?.width).toBeGreaterThan(270);

  await page.evaluate(() => {
    document.documentElement.style.setProperty('--hud-scale', '1');
  });
  await page.setViewportSize({ width: 1024, height: 576 });
  expect(await auditLayout()).toEqual({
    overflowX: 0,
    overflowY: 0,
    vitalsAbilities: false,
    weaponAbilities: false,
    scoreTimer: false,
    outside: [],
  });

  await page.evaluate(() => {
    window.requestAnimationFrame = () => 0;
  });
  await page.waitForTimeout(100);
  await page.evaluate(async () => {
    const hudModulePath = '/src/ui/HUD.js';
    const { HUD } = await import(hudModulePath);
    const hud = new HUD();
    hud.update(
      {
        health: 68,
        maxHealth: 100,
        shield: 24,
        maxShield: 50,
        stamina: 44,
        maxStamina: 100,
      },
      {
        name: 'AR-9 Assault',
        isMelee: false,
        magAmmo: 17,
        reserveAmmo: 90,
        isReloading: true,
      },
      3,
      450,
    );
  });
  await expect(page.locator('#reload-text')).toBeVisible();
  await expect(page.locator('#reload-text')).toHaveText('Reloading');
  await expect(page.locator('#weapon-wrap')).toHaveAttribute('aria-label', /reloading$/);
  expect(await page.locator('#reload-text').evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  )).toBe('rgb(232, 169, 40)');

  expect(errors).toEqual({ console: [], page: [], requests: [] });
});

test('the previous presentation remains available only through an explicit fallback', async ({ page }) => {
  const errors = observeRuntimeErrors(page);
  await waitForMenu(page, '?g7Presentation=legacy');

  await expect(page.locator('body')).toHaveAttribute('data-g7-presentation', 'legacy-fallback');
  await expect(page.locator('body')).not.toHaveAttribute('data-g7-candidate', /.+/u);
  await expect(page.locator('#hud')).not.toHaveAttribute('data-ui-candidate', /.+/u);
  await expect(page.locator('body')).toHaveAttribute('data-interface', 'kyx-field-ui-v3');

  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.locator('#panel-settings')).toBeVisible();
  await expect(page.locator('#settings-close-btn')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel-settings')).toBeHidden();

  expect(errors).toEqual({ console: [], page: [], requests: [] });
});

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
