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

async function installPointerLockShim(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = { pointerLockElement: null as Element | null };
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => state.pointerLockElement,
    });
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: () => {
        state.pointerLockElement = null;
        document.dispatchEvent(new Event('pointerlockchange'));
      },
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
      configurable: true,
      value: function requestPointerLock() {
        state.pointerLockElement = this;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      },
    });
  });
}

async function enterRelayPractice(page: Page): Promise<void> {
  await Promise.all([
    page.waitForURL('**/practice'),
    page.getByRole('button', { name: 'Enter Relay' }).click(),
  ]);
  await expect(page.getByRole('dialog', { name: 'First team to 40 wins' })).toBeVisible();
  const enterArena = page.getByRole('button', { name: 'Enter arena' });
  await enterArena.focus();
  await expect(enterArena).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-local-practice-status', 'ready');
}

async function waitForMenu(page: Page, search = ''): Promise<void> {
  await page.goto(`/${search}`, { waitUntil: 'networkidle' });
  await expect(page.locator('#connect-screen')).toHaveClass(/hidden/u, { timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Enter Relay' })).toBeVisible();
}

async function gameplayLayout(page: Page) {
  return page.evaluate(() => {
    const entries = ['hud-vitals', 'weapon-wrap', 'score-wrap', 'ability-rack']
      .map((id) => {
        const rect = document.getElementById(id)?.getBoundingClientRect();
        return [id, rect ? {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        } : null] as const;
      });
    const boxes = Object.fromEntries(entries);
    const clippedAbilityLabels = Array.from(
      document.querySelectorAll<HTMLElement>('#ability-rack .ability-name'),
    ).filter((element) => element.scrollWidth > element.clientWidth)
      .map((element) => element.textContent?.trim() ?? '');
    const weaponLabel = document.querySelector<HTMLElement>('#weapon-name');
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
      clippedAbilityLabels,
      clippedWeaponLabel: weaponLabel !== null
        && weaponLabel.scrollWidth > weaponLabel.clientWidth,
      outside: entries
        .filter(([, box]) => box !== null && box.width > 0 && box.height > 0 && (
          box.left < 0
          || box.top < 0
          || box.right > window.innerWidth
          || box.bottom > window.innerHeight
        ))
        .map(([id]) => id),
    };
  });
}

test('Cutline is a bounded human-review candidate backed by the shared practice HUD model', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'chromium-mobile-unsupported',
    'Cutline gameplay presentation is intentionally desktop-only',
  );
  const errors = observeRuntimeErrors(page);
  await installPointerLockShim(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await waitForMenu(page);

  await expect(page.locator('body')).toHaveAttribute('data-interface', 'kyx-cutline-v1');
  await expect(page.locator('body')).toHaveAttribute('data-ui-system', 'cutline-v1');
  await expect(page.locator('body')).toHaveAttribute('data-g7-presentation', 'cutline-v1');
  await expect(page.locator('body')).toHaveAttribute('data-g7-review', 'human-required');
  await expect(page.locator('#hud')).toHaveAttribute('data-ui-system', 'cutline-v1');

  const launchSurface = page.locator('.practice-launch-card');
  expect(await launchSurface.evaluate((element) => getComputedStyle(element).backdropFilter)).toBe('none');
  expect(await launchSurface.evaluate((element) => getComputedStyle(element).borderRadius)).toBe('0px');

  await enterRelayPractice(page);
  await expect(page.locator('#hud')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#map-loading')).toHaveClass(/hidden/u, { timeout: 15_000 });
  await expect(page.locator('#hud')).toHaveAttribute('data-hud-view-model', '1');
  await expect(page.locator('#ability-rack .ability-slot')).toHaveCount(4);
  await expect(page.locator('#ability-rack .ability-glyph')).toHaveCount(4);
  await expect(page.locator('#ability-q')).toHaveAttribute('data-locked', 'true');
  expect(await gameplayLayout(page)).toEqual({
    overflowX: 0,
    overflowY: 0,
    vitalsAbilities: false,
    weaponAbilities: false,
    clippedAbilityLabels: [],
    clippedWeaponLabel: false,
    outside: [],
  });

  await page.evaluate(async () => {
    window.requestAnimationFrame = () => 0;
    const hudModulePath = '/src/ui/HUD.js';
    const { HUD } = await import(hudModulePath);
    const hud = new HUD();
    hud.update(
      {
        health: 22,
        maxHealth: 100,
        shield: 24,
        maxShield: 50,
        stamina: 44,
        maxStamina: 100,
      },
      {
        name: 'AR-9 Assault',
        isMelee: false,
        magAmmo: 3,
        reserveAmmo: 90,
        magazineCapacity: 30,
        isReloading: true,
      },
      3,
      450,
    );
    hud.updateTeleport(0.35);
    hud.updateAbilitySlot('smoke_grenade_v1', {
      name: 'Smoke',
      key: 'F',
      state: 'charging',
      stateLabel: '4.2s',
      count: 0,
      readinessRatio: 0.58,
    });
  });
  await expect(page.locator('#health-wrap')).toHaveAttribute('data-state', 'critical');
  await expect(page.locator('#weapon-wrap')).toHaveAttribute('data-ammo-state', 'reloading');
  await expect(page.locator('#reload-text')).toHaveText('Reloading');
  await expect(page.locator('#ability-q')).toHaveAttribute('data-state', 'charging');
  await expect(page.locator('#ability-q')).toHaveAttribute('data-readiness-percent', '35');
  await expect(page.locator('#ability-q-state')).toHaveText('35%');
  expect(await page.locator('#ability-q .ability-progress__fill').evaluate(
    (element) => (element as HTMLElement).style.transform,
  )).toBe('scaleX(0.35)');
  await expect(page.locator('#ability-slot-2')).toHaveAttribute('data-readiness-percent', '58');
  await expect(page.locator('#ability-slot-2-state')).toHaveText('4.2s');

  await page.setViewportSize({ width: 1024, height: 576 });
  expect(await gameplayLayout(page)).toEqual({
    overflowX: 0,
    overflowY: 0,
    vitalsAbilities: false,
    weaponAbilities: false,
    clippedAbilityLabels: [],
    clippedWeaponLabel: false,
    outside: [],
  });
  expect(errors).toEqual({ console: [], page: [], requests: [] });
});

test('radial loadout keeps Blink fixed and makes linked package choices operable', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'chromium-mobile-unsupported',
    'The local loadout menu is intentionally desktop-only',
  );
  const errors = observeRuntimeErrors(page);
  await waitForMenu(page);
  await page.getByRole('button', { name: 'Loadout' }).click();
  await expect(page.locator('#panel-loadout')).toBeVisible();
  await expect(page.locator('.local-loadout-packages .local-loadout-option')).toHaveCount(4);
  await expect(page.locator('.local-loadout-slot')).toHaveCount(6);

  const blink = page.locator(
    '.local-loadout-slot[data-locked="true"] .local-loadout-ability',
  );
  await expect(blink).toHaveAttribute('aria-pressed', 'true');
  await expect(blink).toContainText('Blink');
  await expect(blink.locator('.local-loadout-slot__key')).toHaveText('Q');

  const stickyBreacher = page.locator(
    '.local-loadout-ability[data-ability-id="sticky_grenade_v1"]',
  );
  await expect(stickyBreacher).toBeEnabled();
  await expect(stickyBreacher).toHaveAttribute('data-combat-preset-id', 'breacher');
  await stickyBreacher.click();
  await expect(page.locator('#inv-equipped')).toContainText('Breacher preset');
  await expect(page.locator(
    '.local-loadout-packages [data-combat-preset-id="breacher"]',
  )).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.loadout-detail__title')).toContainText('Sticky Grenade');

  await page.keyboard.press('Escape');
  await expect(page.locator('#panel-loadout')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Loadout' })).toBeFocused();

  await page.setViewportSize({ width: 768, height: 900 });
  await page.getByRole('button', { name: 'Settings' }).click();
  const settingsBox = await page.locator('#panel-settings').boundingBox();
  expect(settingsBox?.x).toBeGreaterThanOrEqual(0);
  expect((settingsBox?.x ?? 0) + (settingsBox?.width ?? 0)).toBeLessThanOrEqual(768);
  await page.getByRole('group', { name: 'Camera / HUD motion' })
    .getByRole('button', { name: 'Reduced' })
    .click();
  await page.getByRole('group', { name: 'Contrast' })
    .getByRole('button', { name: 'High' })
    .click();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.locator('body')).toHaveAttribute('data-reduced-motion', 'true');
  await expect(page.locator('body')).toHaveAttribute('data-high-contrast', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768);
  expect(errors).toEqual({ console: [], page: [], requests: [] });
});

test('pause and compact scoreboard retain keyboard focus and gameplay sightline', async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name === 'chromium-mobile-unsupported',
    'Practice input and pause presentation are intentionally desktop-only',
  );
  const errors = observeRuntimeErrors(page);
  await installPointerLockShim(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await waitForMenu(page);
  await enterRelayPractice(page);
  await expect(page.locator('#hud')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('#map-loading')).toHaveClass(/hidden/u, { timeout: 15_000 });

  await page.evaluate(() => document.exitPointerLock());
  const entryGate = page.getByRole('dialog', { name: 'First team to 40 wins' });
  await expect(entryGate).toBeVisible();
  await expect(page.locator('body')).toHaveAttribute('data-local-practice-status', 'paused');
  await expect(page.getByRole('button', { name: 'Enter arena' })).toBeFocused();
  await page.getByRole('button', { name: 'Enter arena' }).click();
  await expect(entryGate).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-local-practice-status', 'ready');

  await page.evaluate(async () => {
    const hudModulePath = '/src/ui/HUD.js';
    const { HUD } = await import(hudModulePath);
    new HUD().showScoreboard([
      { name: 'Practice Bot 03', kills: 7, score: 1_125 },
      { name: 'You', kills: 5, score: 825, isYou: true },
      { name: 'Practice Bot 01', kills: 4, score: 650 },
      { name: 'Practice Bot 06', kills: 3, score: 500 },
      { name: 'Practice Bot 04', kills: 2, score: 350 },
      { name: 'Practice Bot 05', kills: 2, score: 325 },
      { name: 'Practice Bot 02', kills: 1, score: 175 },
      { name: 'Practice Bot 07', kills: 0, score: 50 },
    ], 'Offline practice');
  });
  await expect(page.locator('#scoreboard-overlay')).toBeVisible();
  await expect(page.locator('#sb-rows tr')).toHaveCount(8);
  const scoreboardStyle = await page.locator('.sb-panel').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backdropFilter: style.backdropFilter,
      borderRadius: style.borderRadius,
      backgroundColor: style.backgroundColor,
    };
  });
  expect(scoreboardStyle.backdropFilter).toBe('none');
  expect(scoreboardStyle.borderRadius).toBe('0px');
  expect(scoreboardStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  await page.evaluate(() => {
    document.getElementById('scoreboard-overlay')?.classList.add('hidden');
  });
  await expect(page.locator('#scoreboard-overlay')).toBeHidden();
  expect(errors).toEqual({ console: [], page: [], requests: [] });
});

test('online lobby shares Cutline while technical scope stays collapsed', async ({ page }) => {
  const errors = observeRuntimeErrors(page);
  await page.goto('/online', { waitUntil: 'networkidle' });
  const route = page.locator('[data-testid="online-preview-route"]');
  await expect(route).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create or join a room.' })).toBeVisible();
  await expect(page.getByText('Guest sessions use server-owned movement, combat, score, and respawn.'))
    .toBeVisible();
  await expect(page.locator('details.online-preview__scope')).not.toHaveAttribute('open', /.*/u);
  await expect(page.locator('.online-preview__profile-picker')).not.toHaveAttribute('open', /.*/u);
  expect(await route.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe('none');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  expect(errors).toEqual({ console: [], page: [], requests: [] });
});
