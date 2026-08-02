import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

const origin = process.argv[2] ?? 'http://127.0.0.1:6197';
const outputDirectory = path.resolve(
  process.argv[3]
    ?? 'review-evidence/2026-08-02/vlr7-quaternius-first-person-v6',
);

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl'],
});

const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(error.message));

async function snapshot() {
  return page.evaluate(() => globalThis.__KYX_LOCAL_PRACTICE__?.getSnapshot() ?? null);
}

async function capture(name) {
  const screenshot = path.join(outputDirectory, name);
  await page.screenshot({ path: screenshot, fullPage: false });
  return screenshot;
}

async function pointerButton(button, down) {
  const canvas = page.locator('#game-canvas');
  const bounds = await canvas.boundingBox();
  if (bounds === null) throw new Error('PRACTICE_CANVAS_NOT_VISIBLE');
  await page.mouse.move(
    bounds.x + bounds.width * 0.5,
    bounds.y + bounds.height * 0.5,
  );
  const playwrightButton = button === 2 ? 'right' : 'left';
  if (down) await page.mouse.down({ button: playwrightButton });
  else await page.mouse.up({ button: playwrightButton });
}

try {
  await page.goto(`${origin}/practice`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => (
    document.body.dataset.localPracticeStatus === 'paused'
    || document.body.dataset.localPracticeStatus === 'error'
  ), undefined, { timeout: 90_000 });
  await page.getByRole('button', { name: 'Enter arena' }).click();
  await page.waitForFunction(() => (
    document.body.dataset.localPracticeStatus === 'error'
    || (
      document.body.dataset.localPracticeStatus === 'ready'
      && globalThis.__KYX_LOCAL_PRACTICE__?.getSnapshot()?.render3d?.status === 'ready'
    )
  ), undefined, { timeout: 90_000 });
  if (await page.locator('body').getAttribute('data-local-practice-status') === 'error') {
    const failure = await page.evaluate(() => ({
      status: document.body.dataset.localPracticeStatus ?? null,
      text: document.body.innerText,
    }));
    await capture('00-startup-error.png');
    throw new Error(`PRACTICE_STARTUP_ERROR:${JSON.stringify({ failure, consoleErrors })}`);
  }

  await page.waitForTimeout(2_500);
  await page.evaluate(() => {
    globalThis.__KYX_CAPTURE_POINTER_EVENTS__ = [];
    for (const type of ['pointerdown', 'pointerup']) {
      document.addEventListener(type, (event) => {
        globalThis.__KYX_CAPTURE_POINTER_EVENTS__.push({
          type,
          button: event.button,
          buttons: event.buttons,
          target: event.target?.id ?? event.target?.nodeName ?? null,
        });
      }, true);
    }
  });

  const hip = await snapshot();
  const hipScreenshot = await capture('01-hip-fire-ready.png');

  await pointerButton(2, true);
  await page.waitForTimeout(750);
  const ads = await snapshot();
  const adsScreenshot = await capture('02-ads-contact.png');
  await pointerButton(2, false);
  await page.waitForTimeout(300);

  const acceptedAttackCountBefore = hip?.render3d
    ?.acceptedAttackPresentationCount ?? 0;
  await pointerButton(0, true);
  await page.waitForFunction((before) => (
    (globalThis.__KYX_LOCAL_PRACTICE__?.getSnapshot()
      ?.render3d?.acceptedAttackPresentationCount ?? 0) > before
  ), acceptedAttackCountBefore, { timeout: 20_000 });
  const fire = await snapshot();
  const fireScreenshot = await capture('03-fire-recoil.png');
  await pointerButton(0, false);
  await page.waitForTimeout(280);

  await page.keyboard.down('KeyR');
  await page.waitForTimeout(120);
  await page.keyboard.up('KeyR');
  await page.waitForTimeout(750);
  const reload = await snapshot();
  const reloadScreenshot = await capture('04-reload-contact.png');

  const diagnostics = {
    status: 'REVIEW_CAPTURE_COMPLETE',
    origin,
    viewport: { width: 1440, height: 900 },
    screenshots: {
      hip: hipScreenshot,
      ads: adsScreenshot,
      fire: fireScreenshot,
      reload: reloadScreenshot,
    },
    visualSource: hip?.render3d?.selectedWeaponVisualSource ?? null,
    contactMode: hip?.render3d?.selectedFirstPersonContactMode ?? null,
    handCount: hip?.render3d?.selectedFirstPersonHandCount ?? null,
    aimMix: ads?.render3d?.selectedFirstPersonAimMix ?? null,
    aimRequested: ads?.render3d?.selectedFirstPersonAimRequested ?? null,
    inputAimHeld: ads?.aimHeld ?? null,
    fireImpulse: fire?.render3d?.selectedFirstPersonFireImpulse ?? null,
    acceptedAttackCountBefore,
    acceptedAttackCountAfter:
      fire?.render3d?.acceptedAttackPresentationCount ?? null,
    reloadPoseMix: reload?.render3d?.selectedFirstPersonReloadPoseMix ?? null,
    pointerLocked: hip?.pointerLocked ?? null,
    rendererPointerLocked: hip?.render3d?.pointerLocked ?? null,
    pointerEvents: await page.evaluate(() => (
      globalThis.__KYX_CAPTURE_POINTER_EVENTS__ ?? []
    )),
    consoleErrors,
  };

  await writeFile(
    path.join(outputDirectory, 'diagnostics.json'),
    `${JSON.stringify(diagnostics, null, 2)}\n`,
    'utf8',
  );

  if (diagnostics.visualSource !== 'quaternius_cc0_review_rev1') {
    throw new Error(`UNEXPECTED_WEAPON_VISUAL_SOURCE:${diagnostics.visualSource}`);
  }
  if (diagnostics.contactMode !== 'profiled_two_hand_assault_suit_v9') {
    throw new Error(`UNEXPECTED_FIRST_PERSON_CONTACT_MODE:${diagnostics.contactMode}`);
  }
  if (diagnostics.handCount !== 2) {
    throw new Error(`UNEXPECTED_FIRST_PERSON_HAND_COUNT:${diagnostics.handCount}`);
  }
  if ((diagnostics.aimMix ?? 0) <= 0.8) {
    throw new Error(`ADS_POSE_NOT_REACHED:${diagnostics.aimMix}`);
  }
  if (
    (diagnostics.acceptedAttackCountAfter ?? 0)
      <= diagnostics.acceptedAttackCountBefore
  ) {
    throw new Error(
      `FIRE_PRESENTATION_NOT_OBSERVED:${diagnostics.acceptedAttackCountAfter}`,
    );
  }
  if ((diagnostics.reloadPoseMix ?? 0) <= 0.2) {
    throw new Error(`RELOAD_POSE_NOT_REACHED:${diagnostics.reloadPoseMix}`);
  }
  if (consoleErrors.length > 0) {
    throw new Error(`BROWSER_ERRORS:\n${consoleErrors.join('\n')}`);
  }

  process.stdout.write(`${JSON.stringify(diagnostics, null, 2)}\n`);
} finally {
  await browser.close();
}
