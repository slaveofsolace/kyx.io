import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

const origin = process.argv[2] ?? 'http://127.0.0.1:6341';
const outputDirectory = path.resolve(
  process.argv[3]
    ?? 'evidence/2026-08-08/quaternius-armory-player-eye-v1',
);

const SLOTS = Object.freeze([
  Object.freeze({
    slot: 1,
    weaponId: 'vertical_rifle_v1',
    label: 'vlr7-rifle',
    visualSource: 'quaternius_cc0_review_rev1',
  }),
  Object.freeze({
    slot: 2,
    weaponId: 'kyx_sidearm_v1',
    label: 'k9-sidearm',
    visualSource:
      'quaternius_cc0_armory_rev1:kyx-k9-quaternius-rev1',
  }),
  Object.freeze({
    slot: 3,
    weaponId: 'kyx_scattergun_v1',
    label: 'sg4-breach',
    visualSource:
      'quaternius_cc0_armory_rev1:kyx-sg4-quaternius-rev1',
  }),
  Object.freeze({
    slot: 4,
    weaponId: 'kyx_longshot_v1',
    label: 'longbow12-sniper',
    visualSource:
      'quaternius_cc0_armory_rev1:kyx-longbow12-quaternius-rev1',
  }),
  Object.freeze({
    slot: 5,
    weaponId: 'kyx_breach_rocket_v1',
    label: 'br6-launcher',
    visualSource:
      'quaternius_cc0_armory_rev1:kyx-br6-quaternius-rev1',
  }),
]);

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl'],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
});
const runtimeErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') runtimeErrors.push(message.text());
});
page.on('pageerror', (error) => runtimeErrors.push(error.message));

async function snapshot() {
  return page.evaluate(
    () => globalThis.__KYX_LOCAL_PRACTICE__?.getSnapshot() ?? null,
  );
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
      && globalThis.__KYX_LOCAL_PRACTICE__?.getSnapshot()?.render3d?.status
        === 'ready'
    )
  ), undefined, { timeout: 90_000 });
  if (await page.locator('body').getAttribute('data-local-practice-status') === 'error') {
    throw new Error('KYX_ARMORY_PRACTICE_STARTUP_ERROR');
  }

  const captures = [];
  for (const expected of SLOTS) {
    await page.keyboard.press(`Digit${expected.slot}`);
    await page.waitForFunction(({ weaponId, visualSource }) => {
      const render3d = globalThis.__KYX_LOCAL_PRACTICE__
        ?.getSnapshot()
        ?.render3d;
      return render3d?.selectedWeaponId === weaponId
        && render3d?.selectedWeaponVisualSource === visualSource;
    }, expected, { timeout: 15_000 });
    await page.waitForTimeout(300);
    const state = await snapshot();
    const render3d = state?.render3d;
    if (
      render3d?.selectedFirstPersonWeaponRootCount !== 1
      || render3d?.selectedFirstPersonOverlapFree !== true
    ) {
      throw new Error(
        `KYX_ARMORY_OVERLAP_CONTRACT_FAILED slot=${expected.slot} roots=${render3d?.selectedFirstPersonWeaponRootCount} overlapFree=${render3d?.selectedFirstPersonOverlapFree}`,
      );
    }
    const file = `${String(expected.slot).padStart(2, '0')}-${expected.label}.png`;
    await page.screenshot({
      path: path.join(outputDirectory, file),
      fullPage: false,
    });
    captures.push(Object.freeze({
      ...expected,
      file,
      selectedWeaponLabel: render3d.selectedWeaponLabel,
      selectedWeaponFamily: render3d.selectedWeaponFamily,
      selectedWeaponSilhouette: render3d.selectedWeaponSilhouette,
      selectedFirstPersonHandCount: render3d.selectedFirstPersonHandCount,
      selectedFirstPersonContactMode: render3d.selectedFirstPersonContactMode,
      selectedFirstPersonWeaponRootCount:
        render3d.selectedFirstPersonWeaponRootCount,
      selectedFirstPersonOverlapFree:
        render3d.selectedFirstPersonOverlapFree,
    }));
  }

  const report = Object.freeze({
    status: 'KYX_QUATERNIUS_ARMORY_RUNTIME_CAPTURED',
    origin,
    viewport: Object.freeze({ width: 1440, height: 900 }),
    captures,
    runtimeErrors,
    humanAccepted: false,
  });
  await writeFile(
    path.join(outputDirectory, 'runtime.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  if (runtimeErrors.length > 0) {
    throw new Error(`KYX_ARMORY_RUNTIME_ERRORS:${JSON.stringify(runtimeErrors)}`);
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
