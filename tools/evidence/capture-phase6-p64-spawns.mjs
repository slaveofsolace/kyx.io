import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { chromium } from '@playwright/test';

const HOST = '127.0.0.1';
const PORT = 4184;
const BASE_URL = `http://${HOST}:${PORT}`;
const ROUTE_URL = `${BASE_URL}/__test__/map`;
const OUTPUT_ROOT = path.resolve('evidence/2026-07-21/phase-6-p6-4-authority-spawns');
const SCREENSHOT_PATH = path.join(OUTPUT_ROOT, 'screenshots/inkfall-spawn-authority.png');
const RESULT_PATH = path.join(OUTPUT_ROOT, 'authority-spawn-capture.json');
const ENVIRONMENT_PATH = path.join(OUTPUT_ROOT, 'environment.json');
const COMMANDS_PATH = path.join(OUTPUT_ROOT, 'commands.txt');
const FIXTURE_PATH = path.resolve(
  'assets/source/maps/inkfall-foundry/runtime/spawn-fixtures.p6-4.v1.json',
);
const SOURCE_PATHS = Object.freeze({
  fixture: FIXTURE_PATH,
  scoring: path.resolve('src/authority/spawn/inkfallSpawnAuthority.ts'),
  lineOfSight: path.resolve('src/authority/spawn/fixtureLineOfSight.ts'),
  route: path.resolve('src/dev/mapTestRoute.ts'),
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function sourceFingerprints() {
  return Object.fromEntries(await Promise.all(Object.entries(SOURCE_PATHS).map(async ([id, sourcePath]) => (
    [id, {
      path: path.relative(process.cwd(), sourcePath).replaceAll('\\', '/'),
      sha256: sha256(await readFile(sourcePath)),
    }]
  ))));
}

async function portIsServing() {
  try {
    const response = await fetch(BASE_URL, { signal: AbortSignal.timeout(500) });
    return response.status > 0;
  } catch {
    return false;
  }
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portIsServing()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Vite did not become ready at ${BASE_URL}`);
}

async function stopServer(server) {
  if (server.exitCode !== null) return;
  server.kill('SIGTERM');
  await Promise.race([
    new Promise((resolve) => server.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server.exitCode === null) server.kill('SIGKILL');
}

function errorText(error) {
  return error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
}

if (await portIsServing()) throw new Error(`Evidence port ${PORT} is already in use.`);
await mkdir(path.dirname(SCREENSHOT_PATH), { recursive: true });

const fixtureSet = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
const viteOutput = [];
const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', HOST, '--port', String(PORT), '--strictPort'],
  { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
);
server.stdout.on('data', (chunk) => viteOutput.push(String(chunk)));
server.stderr.on('data', (chunk) => viteOutput.push(String(chunk)));

let browser;
try {
  await waitForServer(30_000);
  browser = await chromium.launch({ headless: true });
  const browserVersion = browser.version();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const diagnostics = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    httpErrors: [],
  };
  const artifactResponses = [];
  page.on('console', (message) => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => diagnostics.pageErrors.push(error.message));
  page.on('requestfailed', (request) => {
    diagnostics.failedRequests.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`,
    );
  });
  page.on('response', (response) => {
    if (response.status() >= 400) diagnostics.httpErrors.push(`${response.status()} ${response.url()}`);
    const url = new URL(response.url());
    if (url.pathname.endsWith('.glb') && url.search === '') {
      artifactResponses.push({ status: response.status(), url: response.url() });
    }
  });

  await page.goto(ROUTE_URL, { waitUntil: 'networkidle' });
  await page.locator('body[data-map-status="ready"]').waitFor({ state: 'attached', timeout: 30_000 });
  const snapshot = await page.evaluate(() => window.__KYX_MAP_EVIDENCE__?.getSnapshot());
  if (!snapshot) throw new Error('Read-only map evidence surface was not published.');
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  const screenshotBytes = await readFile(SCREENSHOT_PATH);
  const expectedFixtureResults = fixtureSet.scenarios.map(({ id, expected }) => ({ id, ...expected }));
  const visualCandidates = snapshot.spawnAuthority.decision.evaluations
    .filter(({ set }) => set === 'deathmatch_candidate');
  const componentKeys = [
    'enemyDistanceSafety',
    'lineOfSightExposure',
    'recentEnemyAimAlignment',
    'enemyTravelArrivalPressure',
    'recentDeathLocation',
    'recentSpawnUse',
    'teammateSupport',
    'teamClustering',
    'objectiveProximityPressure',
    'occupancy',
    'modeTeamTerritory',
    'escapeRouteCountQuality',
  ].sort();
  const assertions = {
    mapReady: await page.locator('body').getAttribute('data-map-status') === 'ready',
    exactArtifactResponses: artifactResponses.length === 2
      && artifactResponses.every(({ status }) => status === 200),
    noRuntimeErrors: Object.values(diagnostics).every((entries) => entries.length === 0),
    immutableP63Binding: snapshot.packageDigest === fixtureSet.packageDigest
      && snapshot.fixtureHash === fixtureSet.fixtureHash
      && snapshot.renderMeshesMayBeAuthority === false,
    p64FixtureIdentity: snapshot.spawnAuthority.status
      === 'P6.4_DETERMINISTIC_AUTHORITY_FIXTURE_G5_NOT_PASSED'
      && snapshot.spawnAuthority.fixtureSetId === fixtureSet.id
      && snapshot.spawnAuthority.scenarioId === 'ffa_visual_score_pressure',
    allSavedFixtureResultsExact: JSON.stringify(snapshot.spawnAuthority.fixtureResults)
      === JSON.stringify(expectedFixtureResults),
    visualDecisionExact: snapshot.spawnAuthority.decision.decisionHash === '81286ef1c04ce7e4'
      && snapshot.spawnAuthority.expectedDecisionHash === '81286ef1c04ce7e4'
      && snapshot.spawnAuthority.decision.selected?.spawnId === 'spawn_dm_ink_e',
    allScoreComponentsPresent: visualCandidates.length === 4
      && visualCandidates.every(({ components }) => (
        JSON.stringify(Object.keys(components).sort()) === JSON.stringify(componentKeys)
        && Object.values(components).every(Number.isSafeInteger)
      )),
    allEnemiesAggregated: visualCandidates.every(({ enemies }) => enemies.length === 1
      && enemies[0].enemyId === 'enemy_visual'),
    directAndOccludedLosMeasured: visualCandidates.some(({ enemies }) => (
      enemies.some(({ standingLineOfSight, crouchedLineOfSight }) => (
        standingLineOfSight || crouchedLineOfSight
      ))
    )) && visualCandidates.some(({ enemies }) => enemies.every(({ standingLineOfSight, crouchedLineOfSight }) => (
      !standingLineOfSight && !crouchedLineOfSight
    ))),
    noClientAuthority: snapshot.spawnAuthority.decision.authorityBoundary
      === 'server_state_and_authority_collision_only'
      && snapshot.spawnAuthority.decision.clientPositionOrScoreAccepted === false,
    boundedNonClaims: JSON.stringify(snapshot.spawnAuthority.decision.nonClaims)
      === JSON.stringify(['P6.5_NOT_CLAIMED', 'P6.6_NOT_CLAIMED', 'G5_NOT_PASSED']),
  };
  const result = {
    schemaVersion: 1,
    status: Object.values(assertions).every(Boolean)
      ? 'P6_4_AUTHORITY_SPAWN_EVIDENCE_PASS'
      : 'P6_4_AUTHORITY_SPAWN_EVIDENCE_FAIL',
    capturedAtUtc: new Date().toISOString(),
    route: ROUTE_URL,
    browser: { name: 'chromium', version: browserVersion, viewport: { width: 1600, height: 1000 } },
    pageState: {
      launchSupport: await page.locator('body').getAttribute('data-launch-support'),
      mapStatus: await page.locator('body').getAttribute('data-map-status'),
    },
    snapshot,
    fixtureSet: {
      path: path.relative(process.cwd(), FIXTURE_PATH).replaceAll('\\', '/'),
      scenarioCount: fixtureSet.scenarios.length,
      expectedResults: expectedFixtureResults,
    },
    sourceFingerprints: await sourceFingerprints(),
    artifactResponses,
    diagnostics,
    screenshot: {
      path: path.relative(process.cwd(), SCREENSHOT_PATH).replaceAll('\\', '/'),
      bytes: screenshotBytes.byteLength,
      sha256: sha256(screenshotBytes),
    },
    assertions,
  };
  await writeFile(RESULT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await writeFile(ENVIRONMENT_PATH, `${JSON.stringify({
    schemaVersion: 1,
    platform: process.platform,
    architecture: process.arch,
    nodeVersion: process.version,
    browser: result.browser,
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    dirtyStatus: execFileSync('git', ['status', '--short'], { encoding: 'utf8' }).trim().split(/\r?\n/u),
    viteOutput: viteOutput.join('').trim().split(/\r?\n/u),
  }, null, 2)}\n`, 'utf8');
  await writeFile(COMMANDS_PATH, [
    '# Run from repository root with the configured Node 20.19-24 runtime.',
    'node tools/evidence/capture-phase6-p64-spawns.mjs',
    'node tools/evidence/verify-phase6-p64-spawns.mjs',
    'node node_modules/vitest/vitest.mjs run tests/integration/authority/inkfallSpawnAuthority.test.ts',
    'node node_modules/@playwright/test/cli.js test tests/browser/map-package-route.spec.ts --project=chromium-desktop',
    '',
  ].join('\n'), 'utf8');
  if (result.status.endsWith('_FAIL')) throw new Error('P6.4 authority spawn assertions failed.');
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    result: RESULT_PATH,
    screenshot: SCREENSHOT_PATH,
  })}\n`);
} catch (error) {
  const failureRoot = path.join(OUTPUT_ROOT, 'failures');
  await mkdir(failureRoot, { recursive: true });
  const failurePath = path.join(failureRoot, `attempt-${Date.now()}.json`);
  await writeFile(failurePath, `${JSON.stringify({
    schemaVersion: 1,
    status: 'P6_4_CAPTURE_ATTEMPT_FAILED',
    capturedAtUtc: new Date().toISOString(),
    error: errorText(error),
    viteOutput,
  }, null, 2)}\n`, 'utf8');
  throw error;
} finally {
  await browser?.close();
  await stopServer(server);
  if (await portIsServing()) throw new Error(`Evidence port ${PORT} remained open after capture.`);
}
