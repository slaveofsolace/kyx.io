import { expect, test, type Page, type TestInfo } from '@playwright/test';

const strict = process.env.KYX_PHASE8_A11Y_STRICT === '1';
const pointerLockProbe = process.env.KYX_PHASE8_POINTER_LOCK_PROBE === '1';

function requireDesktopProject(testInfo: TestInfo): void {
  test.skip(
    testInfo.project.name !== 'chromium-desktop',
    'Phase 8 targets desktop keyboard/mouse before the quarantined mobile path.',
  );
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  await testInfo.attach(name, {
    body: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'),
    contentType: 'application/json',
  });
}

async function visibleFocusableInventory(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const selector = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(',');
    return [...document.querySelectorAll<HTMLElement>(selector)]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0;
      })
      .map((element) => ({
        tag: element.tagName,
        id: element.id || null,
        role: element.getAttribute('role'),
        ariaLabel: element.getAttribute('aria-label'),
        text: (element.textContent ?? '').trim().replace(/\s+/gu, ' ').slice(0, 120),
        tabIndex: element.tabIndex,
      }));
  });
}

async function collectTabSequence(page: Page, count = 10): Promise<unknown[]> {
  const sequence: unknown[] = [];
  for (let index = 0; index < count; index += 1) {
    await page.keyboard.press('Tab');
    sequence.push(await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      if (!element) return null;
      const style = getComputedStyle(element);
      return {
        tag: element.tagName,
        id: element.id || null,
        role: element.getAttribute('role'),
        text: (element.textContent ?? '').trim().replace(/\s+/gu, ' ').slice(0, 120),
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        outlineColor: style.outlineColor,
        boxShadow: style.boxShadow,
      };
    }));
  }
  return sequence;
}

async function collectScaleProxy(page: Page): Promise<unknown[]> {
  const results: unknown[] = [];
  for (const scale of [1, 1.25, 2]) {
    await page.evaluate((nextScale) => {
      document.documentElement.style.setProperty('zoom', String(nextScale));
    }, scale);
    await page.waitForTimeout(32);
    results.push(await page.evaluate((nextScale) => {
      const visible = [...document.querySelectorAll<HTMLElement>('body *')].filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && rect.width > 0
          && rect.height > 0;
      });
      const outsideViewport = visible
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => (
          rect.right > window.innerWidth + 1
          || rect.bottom > window.innerHeight + 1
          || rect.left < -1
          || rect.top < -1
        ))
        .slice(0, 30)
        .map(({ element, rect }) => ({
          id: element.id || null,
          className: element.className || null,
          rect: {
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            right: Math.round(rect.right),
            bottom: Math.round(rect.bottom),
          },
        }));
      return {
        cssZoomProxy: nextScale,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        scroll: {
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
        },
        outsideViewport,
      };
    }, scale));
  }
  await page.evaluate(() => document.documentElement.style.removeProperty('zoom'));
  return results;
}

async function animationInventory(page: Page): Promise<unknown> {
  return page.evaluate(() => ({
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    animations: document.getAnimations().map((animation) => {
      const timing = animation.effect?.getComputedTiming();
      const target = animation.effect instanceof KeyframeEffect
        ? animation.effect.target as HTMLElement | null
        : null;
      return {
        target: target?.id || target?.className || target?.tagName || null,
        playState: animation.playState,
        duration: timing?.duration ?? null,
        iterations: timing?.iterations ?? null,
      };
    }),
  }));
}

test.describe('Phase 8 accessibility preparation', () => {
  test('records an observational desktop shell contract without claiming G7', async ({ page }, testInfo) => {
    requireDesktopProject(testInfo);
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page).toHaveTitle('KYX.IO — Offline Practice');
    await expect(page.getByRole('button', { name: 'START OFFLINE PRACTICE' })).toBeVisible({
      timeout: 15_000,
    });

    const focusable = await visibleFocusableInventory(page);
    const tabSequence = await collectTabSequence(page);
    const scaleProxy = await collectScaleProxy(page);
    const defaultMotion = await animationInventory(page);

    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'none' });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const reducedMotion = await animationInventory(page);

    await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    const forcedColors = await page.evaluate(() => ({
      active: matchMedia('(forced-colors: active)').matches,
      controls: [...document.querySelectorAll<HTMLElement>('button, input, [tabindex]')]
        .filter((element) => getComputedStyle(element).display !== 'none')
        .slice(0, 30)
        .map((element) => {
          const style = getComputedStyle(element);
          return {
            id: element.id || null,
            color: style.color,
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            outlineColor: style.outlineColor,
          };
        }),
    }));

    await attachJson(testInfo, 'phase8-shell-observation.json', {
      gate: 'G7_NOT_EVALUATED',
      viewport: { width: 1280, height: 720 },
      browserPlugin: 'not available; repository Playwright fallback',
      focusable,
      tabSequence,
      scaleProxy: {
        kind: 'CSS zoom layout proxy; real 125% and 200% browser zoom remains manual evidence',
        results: scaleProxy,
      },
      defaultMotion,
      reducedMotion,
      forcedColors,
      consoleErrors,
      pageErrors,
    });
    await testInfo.attach('phase8-shell-forced-colors.png', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });

    expect(pageErrors).toEqual([]);
    await expect(page.locator('body')).toBeVisible();
  });

  test('enforces keyboard focus only after Phase 8 opts into strict mode', async ({ page }, testInfo) => {
    requireDesktopProject(testInfo);
    test.skip(!strict, 'Set KYX_PHASE8_A11Y_STRICT=1 only after Phase 8 implementation.');

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: 'START OFFLINE PRACTICE' })).toBeVisible({
      timeout: 15_000,
    });

    await page.keyboard.press('Tab');
    const firstFocus = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      const style = element ? getComputedStyle(element) : null;
      return {
        tag: element?.tagName ?? null,
        id: element?.id ?? null,
        hasVisibleIndicator: Boolean(style && (
          (style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0)
          || style.boxShadow !== 'none'
        )),
      };
    });
    expect(firstFocus.tag).not.toBe('BODY');
    expect(firstFocus.tag).not.toBe('CANVAS');
    expect(firstFocus.hasVisibleIndicator).toBe(true);

    await page.getByRole('button', { name: 'SETTINGS' }).click();
    const settings = page.locator('#panel-settings');
    await expect(settings).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(settings.locator(':focus')).toHaveCount(1);
  });

  test('enforces reduced-mode, scale, and caption hooks only in strict mode', async ({ page }, testInfo) => {
    requireDesktopProject(testInfo);
    test.skip(!strict, 'Set KYX_PHASE8_A11Y_STRICT=1 only after Phase 8 implementation.');

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'none' });
    await page.goto('/', { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: 'SETTINGS' }).click();
    await expect(page.getByRole('group', { name: 'Camera / HUD Motion' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'High Contrast' })).toBeVisible();
    await expect(page.getByRole('slider', { name: 'HUD Scale' })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Subtitles' })).toBeVisible();
    const motion = await animationInventory(page) as {
      animations: Array<{ iterations: number | null; playState: string }>;
    };
    expect(motion.animations.filter(({ iterations, playState }) => (
      iterations === Infinity && playState === 'running'
    ))).toEqual([]);

    await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
    await page.reload({ waitUntil: 'networkidle' });
    expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true);
  });

  test('records the pointer-lock/Escape lifecycle only when explicitly requested', async ({ page }, testInfo) => {
    requireDesktopProject(testInfo);
    test.skip(
      !pointerLockProbe,
      'Set KYX_PHASE8_POINTER_LOCK_PROBE=1 for the capability-dependent manual/runtime probe.',
    );

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/?movementDriver=flat_run', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: 'START OFFLINE PRACTICE' })).toBeVisible({
      timeout: 15_000,
    });
    const before = await page.evaluate(() => ({
      pointerLocked: document.pointerLockElement !== null,
      activeElement: (document.activeElement as HTMLElement | null)?.id ?? null,
    }));
    await page.getByRole('button', { name: 'START OFFLINE PRACTICE' }).click();
    await expect(page.locator('#hud')).toBeVisible({ timeout: 15_000 });
    const afterStart = await page.evaluate(() => ({
      pointerLocked: document.pointerLockElement !== null,
      activeElement: (document.activeElement as HTMLElement | null)?.id ?? null,
      launchStatus: document.body.dataset.movementDriverStatus ?? null,
    }));
    if (afterStart.pointerLocked) await page.keyboard.press('Escape');
    const afterEscape = await page.evaluate(() => ({
      pointerLocked: document.pointerLockElement !== null,
      pauseVisible: !document.getElementById('pause-menu')?.classList.contains('hidden'),
      activeElement: (document.activeElement as HTMLElement | null)?.id ?? null,
    }));

    if (afterStart.pointerLocked) {
      expect(afterEscape.pointerLocked).toBe(false);
      expect(afterEscape.pauseVisible).toBe(true);
      expect(afterEscape.activeElement).toBe('resume-btn');
    }

    await attachJson(testInfo, 'phase8-pointer-lock-observation.json', {
      gate: 'G7_NOT_EVALUATED',
      capabilityDependent: true,
      before,
      afterStart,
      afterEscape,
      manualFollowUp: 'Verify denial guidance, refocus, stale-input release, and focus restoration.',
    });
    await testInfo.attach('phase8-pointer-lock-after-escape.png', {
      body: await page.screenshot({ fullPage: false }),
      contentType: 'image/png',
    });
  });
});
