import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const baseUrl = option('--base-url', 'http://127.0.0.1:6338');
const outputRoot = path.resolve(option(
  '--output',
  'evidence/2026-08-08/relay-visual-candidate-player-eye-v10',
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
const movementSnapshots = [];

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
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(outputRoot, name), fullPage: false });
  captures.push({ name, url: page.url(), viewport: page.viewportSize(), notes });
}

async function practiceSnapshot(label) {
  const snapshot = await page.evaluate(() => (
    window.__KYX_LOCAL_PRACTICE__?.getSnapshot() ?? null
  ));
  movementSnapshots.push({ label, snapshot });
  return snapshot;
}

async function move(keys, durationMilliseconds) {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(durationMilliseconds);
  for (const key of [...keys].reverse()) await page.keyboard.up(key);
  await page.waitForTimeout(180);
}

let menuArena = null;
let practiceBefore = null;
let practiceAfter = null;
let pointerLockAcquired = false;

try {
  await page.goto(`${baseUrl}/`, { waitUntil: 'networkidle' });
  await page.locator('#play-btn').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(1_200);
  menuArena = await page.locator('body').getAttribute('data-menu-arena');
  await capture(
    '01-relay-menu-flythrough-1440x900.png',
    'Actual animated menu canvas with the Relay visual candidate as the sole map backdrop.',
  );

  await page.getByRole('button', { name: 'Arenas' }).click();
  await page.locator('#panel-maps').waitFor({ state: 'visible' });
  await capture(
    '02-relay-arena-selection-1440x900.png',
    'Player-facing original-arena selection with Relay as the current playable visual candidate.',
  );
  await page.getByRole('button', { name: 'Close map library' }).click();

  await page.locator('#play-btn').click();
  await page.waitForURL(/\/practice(?:\?|$)/u, { timeout: 20_000 });
  await page.waitForFunction(() => window.__KYX_LOCAL_PRACTICE__ !== undefined, null, {
    timeout: 30_000,
  });
  await page.locator('.local-practice-gate__enter').waitFor({ state: 'visible' });
  practiceBefore = await practiceSnapshot('entry_gate');
  await capture(
    '03-relay-entry-gate-1440x900.png',
    'Player-eye spawn view before capture; Relay identity, controls, HUD, and map are visible.',
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

  await practiceSnapshot('spawn_active');
  await capture(
    '04-relay-spawn-active-1440x900.png',
    'Unobstructed first-person spawn view with the live weapon mount and HUD.',
  );

  if (pointerLockAcquired) {
    const canvas = page.locator('#game-canvas');
    const box = await canvas.boundingBox();
    if (box !== null) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.47, {
        steps: 12,
      });
    }
    await move(['Shift', 'w'], 3_100);
    await practiceSnapshot('route_one');
    await capture(
      '05-relay-route-one-1440x900.png',
      'Player-eye route read after a sustained sprint away from spawn.',
    );

    if (box !== null) {
      await page.mouse.move(box.x + box.width * 0.39, box.y + box.height * 0.43, {
        steps: 14,
      });
    }
    await move(['w', 'd'], 1_450);
    await practiceSnapshot('route_two');
    await capture(
      '06-relay-route-two-1440x900.png',
      'Second route read after a direction change and diagonal movement.',
    );

    await page.keyboard.down('Shift');
    await page.keyboard.down('w');
    await page.keyboard.press('Space');
    await page.waitForTimeout(1_050);
    await page.keyboard.up('w');
    await page.keyboard.up('Shift');
    await page.waitForTimeout(220);
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(160);
    await page.mouse.up({ button: 'left' });
    await practiceSnapshot('movement_contact');
    await capture(
      '07-relay-movement-contact-1440x900.png',
      'Sprint/jump/contact sample with first-person weapon, route geometry, and combat HUD.',
    );
  }

  practiceAfter = await practiceSnapshot('final');
} finally {
  await writeFile(
    path.join(outputRoot, 'runtime.json'),
    `${JSON.stringify({
      schema: 'kyx-relay-visual-candidate-player-eye-v6',
      capturedAt: new Date().toISOString(),
      buildCommit,
      buildMode: 'staging-review',
      baseUrl,
      viewport: { width: 1440, height: 900 },
      menuArena,
      practiceBefore,
      practiceAfter,
      pointerLockAcquired,
      movementSnapshots,
      glbResponses,
      captures,
      errors,
      nonclaims: [
        'No human visual or play acceptance is claimed.',
        'Relay Revision 1 is an original local-authority gameplay candidate and is not an accepted/release map.',
        'The paired Relay portal contract and persistent apertures are present, but this route does not claim a player-driven traversal.',
        'This bounded local run is not final 2/4/8 multiplayer or soak proof.',
        'No externally owned map geometry, textures, audio, or layout is included.',
      ],
    }, null, 2)}\n`,
    'utf8',
  );
  await browser.close();
}

if (errors.console.length || errors.page.length || errors.requests.length) {
  throw new Error(`RELAY_RUNTIME_ERRORS ${JSON.stringify(errors)}`);
}
if (menuArena !== 'relay-visual-candidate') {
  throw new Error(`RELAY_MENU_IDENTITY_MISMATCH actual=${menuArena}`);
}
if (practiceBefore?.render3d?.presentationMode !== 'relay_visual_candidate') {
  throw new Error('RELAY_RUNTIME_PRESENTATION_MODE_MISMATCH');
}
if (practiceBefore?.render3d?.presentationDisplayName !== 'Relay') {
  throw new Error('RELAY_RUNTIME_DISPLAY_NAME_MISMATCH');
}
if (practiceBefore?.mapId !== 'relay') {
  throw new Error(`RELAY_RUNTIME_MAP_ID_MISMATCH actual=${practiceBefore?.mapId}`);
}
if (
  practiceBefore?.render3d?.authorityCompatibility
    !== 'relay_revision_1_authority_candidate'
) {
  throw new Error('RELAY_RUNTIME_AUTHORITY_COMPATIBILITY_MISMATCH');
}
if (practiceBefore?.render3d?.selectedFirstPersonOverlapFree !== true) {
  throw new Error('RELAY_FIRST_PERSON_WEAPON_OVERLAP');
}
if (
  practiceBefore?.portalAuthorityCapabilityId
    !== 'relay_revision_1_linked_world_portal_v1'
) {
  throw new Error('RELAY_PORTAL_AUTHORITY_CAPABILITY_MISMATCH');
}
if (practiceBefore?.render3d?.staticWorldPortalCount !== 2) {
  throw new Error('RELAY_STATIC_PORTAL_COUNT_MISMATCH');
}
if (practiceBefore?.render3d?.staticWorldPortalMeshCount !== 10) {
  throw new Error('RELAY_STATIC_PORTAL_MESH_COUNT_MISMATCH');
}
if (glbResponses.some(({ url }) => url.includes('inkfall_foundry_rev5_geometry_portal'))) {
  throw new Error('RELAY_RETIRED_FOUNDRY_GLB_REQUESTED');
}

process.stdout.write(`${JSON.stringify({
  status: 'RELAY_PLAYER_EYE_PACKET_CAPTURED',
  outputRoot,
  menuArena,
  pointerLockAcquired,
  presentationMode: practiceAfter?.render3d?.presentationMode ?? null,
  presentationDisplayName: practiceAfter?.render3d?.presentationDisplayName ?? null,
  mapId: practiceAfter?.mapId ?? null,
  fixtureId: practiceAfter?.fixtureId ?? null,
  authorityColliderCount:
    practiceAfter?.render3d?.authorityColliderCount ?? null,
  authorityCompatibility: practiceAfter?.render3d?.authorityCompatibility ?? null,
  remoteAvatarCount: practiceAfter?.render3d?.remoteAvatarCount ?? null,
  firstPersonOverlapFree:
    practiceAfter?.render3d?.selectedFirstPersonOverlapFree ?? null,
  portalAuthorityCapabilityId:
    practiceAfter?.portalAuthorityCapabilityId ?? null,
  staticWorldPortalCount:
    practiceAfter?.render3d?.staticWorldPortalCount ?? null,
  staticWorldPortalMeshCount:
    practiceAfter?.render3d?.staticWorldPortalMeshCount ?? null,
  observedPortalTraversalCount:
    practiceAfter?.recentPortalTraversalEvents ?? null,
  runtimeErrorCount:
    errors.console.length + errors.page.length + errors.requests.length,
}, null, 2)}\n`);
