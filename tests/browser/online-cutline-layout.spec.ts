import { expect, test, type Page } from '@playwright/test';

async function installCutlineStyles(page: Page): Promise<void> {
  await page.goto('/');
  const stylesheet = await page.evaluate(async () => (
    await fetch('/src/ui/kyx-cutline.css')
  ).text());
  await page.goto('about:blank');
  await page.addStyleTag({ content: stylesheet });
}

async function installCutlineFixture(page: Page): Promise<void> {
  await installCutlineStyles(page);
  await page.evaluate(() => {
    document.body.dataset.uiSystem = 'cutline-v1';
    document.body.replaceChildren();

    const canvasWrap = document.createElement('main');
    canvasWrap.className = 'online-session__canvas-wrap';
    canvasWrap.innerHTML = `
      <div class="online-session__combat-stats">
        <div class="online-session__combat-stat online-session__combat-stat--health"><span>Health</span><strong>100</strong></div>
        <div class="online-session__combat-stat online-session__combat-stat--ammo"><span>Ammo</span><strong>50 / 150</strong></div>
      </div>
      <div class="online-session__controls">
        <button class="online-session__control online-session__control--ability">Launch</button>
        <button class="online-session__control online-session__control--ability">Smoke</button>
        <button class="online-session__control online-session__control--ability">Frag</button>
        <button class="online-session__control online-session__control--ability">Blink</button>
      </div>
      <div class="online-session__weapon-rail">
        <button class="online-session__weapon-slot" data-preset-allowed="true" data-active="true"><strong>1</strong><span>Auto</span></button>
        <button class="online-session__weapon-slot" data-preset-allowed="true"><strong>6</strong><span>Blade</span></button>
      </div>
    `;
    document.body.append(canvasWrap);
  });
}

async function expectInsideViewport(page: Page, selector: string): Promise<void> {
  const locator = page.locator(selector);
  await expect(locator).toBeVisible();
  const bounds = await locator.boundingBox();
  expect(bounds).not.toBeNull();
  if (bounds === null) return;
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (viewport === null) return;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
}

test('keeps the combat HUD visible inside a desktop gameplay viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  await installCutlineFixture(page);

  await expectInsideViewport(page, '.online-session__combat-stat--health');
  await expectInsideViewport(page, '.online-session__combat-stat--ammo');
  await expectInsideViewport(page, '.online-session__controls');
  await expectInsideViewport(page, '.online-session__weapon-rail');
});

test('keeps result actions reachable at short desktop heights', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  await installCutlineStyles(page);
  await page.evaluate(() => {
    document.body.dataset.uiSystem = 'cutline-v1';
    document.body.replaceChildren();
    const dialog = document.createElement('section');
    dialog.className = 'online-session__result';
    dialog.innerHTML = `
      <div class="online-session__result-panel">
        <p class="online-preview__eyebrow">Online TDM complete</p>
        <h2>Victory</h2>
        <p class="online-session__result-summary">Score limit reached</p>
        <dl class="online-session__result-stats">
          ${['Final score', 'Eliminations', 'Deaths', 'Assists', 'K/D']
            .map((label) => `<div class="online-session__result-stat"><dt>${label}</dt><dd>8</dd></div>`)
            .join('')}
        </dl>
        <div class="online-session__result-actions">
          <button class="online-preview__primary">Play again</button>
          <button class="online-preview__secondary">Return to online</button>
        </div>
      </div>
    `;
    document.body.append(dialog);
  });

  await expectInsideViewport(page, '.online-session__result-panel');
  await expectInsideViewport(page, '.online-session__result-actions');
  await expect(page.getByRole('button', { name: 'Play again' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Return to online' })).toBeVisible();
});
