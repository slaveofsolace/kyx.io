import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const baseUrl = option('--base-url', 'http://127.0.0.1:6338');
const outputRoot = path.resolve(option(
  '--output',
  'evidence/2026-08-08/g6-assault-rev38-player-eye',
));
const buildCommit = option('--commit', 'working-tree');

await mkdir(outputRoot, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: 'no-preference',
});
const page = await context.newPage();
const errors = { console: [], page: [], requests: [] };
const glbResponses = [];
const captures = [];

page.on('console', (message) => {
  if (message.type() === 'error') errors.console.push(message.text());
});
page.on('pageerror', (error) => errors.page.push(error.message));
page.on('requestfailed', (request) => {
  errors.requests.push({
    method: request.method(),
    url: request.url(),
    error: request.failure()?.errorText ?? 'failed',
  });
});
page.on('response', (response) => {
  if (!new URL(response.url()).pathname.toLowerCase().endsWith('.glb')) return;
  glbResponses.push({ url: response.url(), status: response.status() });
});

async function capture(name, notes) {
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(outputRoot, name), fullPage: false });
  captures.push({ name, url: page.url(), viewport: page.viewportSize(), notes });
}

let candidateSnapshot = null;
let practiceBefore = null;
let practiceAfter = null;
let pointerLockAcquired = false;

try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.locator('#play-btn').waitFor({ state: 'visible', timeout: 20_000 });
  await capture(
    '01-menu-first-impression-1440x900.png',
    'First 3/10/30-second menu surface in the source-matched staging-review build.',
  );

  await page.getByRole('button', { name: 'Arenas' }).click();
  await page.locator('#panel-maps').waitFor({ state: 'visible' });
  await capture(
    '02-arena-selection-original-1440x900.png',
    'Original-arena lane before any legacy tab interaction.',
  );
  await page.getByRole('tab', { name: /Legacy maps/i }).click();
  await capture(
    '03-arena-selection-legacy-1440x900.png',
    'Legacy lane showing playable KYX history and the local-only evmap rights boundary.',
  );
  await page.getByRole('button', { name: 'Close map library' }).click();

  await page.getByRole('button', { name: 'Loadout' }).click();
  await page.locator('#panel-loadout').waitFor({ state: 'visible' });
  await page.waitForFunction(() => (
    window.__KYX_G6_CHARACTER_EVIDENCE__?.revision === 'rev38-fitted-v1'
    && window.__KYX_G6_CHARACTER_EVIDENCE__.snapshot().instances.length > 0
  ), null, { timeout: 30_000 });
  await page.waitForTimeout(1_000);
  candidateSnapshot = await page.evaluate(() => (
    window.__KYX_G6_CHARACTER_EVIDENCE__?.snapshot() ?? null
  ));
  await capture(
    '04-loadout-rev38-turntable-1440x900.png',
    'Actual runtime loadout turntable using the installed Rev38 staging-review candidate.',
  );
  await page.locator('#armor-preview-canvas').screenshot({
    path: path.join(outputRoot, '05-rev38-turntable-canvas.png'),
  });
  captures.push({
    name: '05-rev38-turntable-canvas.png',
    url: page.url(),
    viewport: page.viewportSize(),
    notes: 'Unscaled runtime canvas crop; not a static Blender render.',
  });
  await page.getByRole('button', { name: 'Close loadout' }).click();

  await page.locator('#play-btn').click();
  await page.waitForURL(/\/practice(?:\?|$)/u, { timeout: 20_000 });
  await page.waitForFunction(() => window.__KYX_LOCAL_PRACTICE__ !== undefined, null, {
    timeout: 30_000,
  });
  await page.locator('#hud').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('.local-practice-gate__enter').waitFor({ state: 'visible' });
  practiceBefore = await page.evaluate(() => (
    window.__KYX_LOCAL_PRACTICE__?.getSnapshot() ?? null
  ));
  await capture(
    '06-inkfall-practice-paused-1440x900.png',
    'Player-eye Inkfall view before pointer capture; HUD and entry affordance visible.',
  );

  await page.locator('.local-practice-gate__enter').click();
  try {
    await page.waitForFunction(() => (
      window.__KYX_LOCAL_PRACTICE__?.getSnapshot().pointerLocked === true
    ), null, { timeout: 5_000 });
    pointerLockAcquired = true;
  } catch {
    pointerLockAcquired = false;
  }

  if (pointerLockAcquired) {
    const canvas = page.locator('#game-canvas');
    const box = await canvas.boundingBox();
    if (box !== null) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.move(box.x + box.width * 0.68, box.y + box.height * 0.44, {
        steps: 8,
      });
    }
    await page.keyboard.down('w');
    await page.keyboard.down('d');
    await page.waitForTimeout(1_100);
    await page.keyboard.up('d');
    await page.keyboard.up('w');
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(180);
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(250);
    await capture(
      '07-inkfall-after-move-fire-1440x900.png',
      'Gray-box play sample after diagonal movement, camera rotation, and primary fire.',
    );
    await page.keyboard.down('Tab');
    await page.waitForTimeout(250);
    await capture(
      '08-inkfall-scoreboard-held-1440x900.png',
      'Live hold-Tab scoreboard over the current player-eye frame.',
    );
    await page.keyboard.up('Tab');
  }

  practiceAfter = await page.evaluate(() => (
    window.__KYX_LOCAL_PRACTICE__?.getSnapshot() ?? null
  ));
} finally {
  await writeFile(
    path.join(outputRoot, 'runtime.json'),
    `${JSON.stringify({
      schema: 'kyx-g6-assault-rev38-player-eye-capture-v1',
      capturedAt: new Date().toISOString(),
      buildCommit,
      buildMode: 'staging-review',
      baseUrl,
      viewport: { width: 1440, height: 900 },
      candidateSnapshot,
      practiceBefore,
      practiceAfter,
      pointerLockAcquired,
      glbResponses,
      captures,
      errors,
      nonclaims: [
        'No human visual acceptance is claimed.',
        'The Rev38 GLBs remain review-only and release-ineligible.',
        'This bounded run is not 2/4/8 multiplayer proof or a performance soak.',
      ],
    }, null, 2)}\n`,
    'utf8',
  );
  await browser.close();
}

if (errors.console.length || errors.page.length || errors.requests.length) {
  throw new Error(`G6_REV38_RUNTIME_ERRORS ${JSON.stringify(errors)}`);
}
if (candidateSnapshot?.revision !== 'rev38-fitted-v1') {
  throw new Error('G6_REV38_RUNTIME_IDENTITY_MISMATCH');
}
if (practiceBefore?.render3d?.selectedFirstPersonOverlapFree !== true) {
  throw new Error('G6_REV38_FIRST_PERSON_WEAPON_OVERLAP');
}

process.stdout.write(`${JSON.stringify({
  status: 'G6_REV38_PLAYER_EYE_PACKET_CAPTURED',
  outputRoot,
  pointerLockAcquired,
  candidateInstances: candidateSnapshot?.instances?.length ?? 0,
  remoteAvatarCount: practiceAfter?.render3d?.remoteAvatarCount ?? null,
  remoteAvatarAnimationContractCount:
    practiceAfter?.render3d?.remoteAvatarAnimationContractCount ?? null,
  remoteAvatarWeaponAttachmentCount:
    practiceAfter?.render3d?.remoteAvatarWeaponAttachmentCount ?? null,
  firstPersonOverlapFree:
    practiceAfter?.render3d?.selectedFirstPersonOverlapFree ?? null,
  runtimeErrorCount:
    errors.console.length + errors.page.length + errors.requests.length,
}, null, 2)}\n`);
