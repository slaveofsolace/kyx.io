import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const CAPTURE_PATH = path.resolve(
  'evidence/2026-07-21/phase-6-p6-4-authority-spawns/authority-spawn-capture.json',
);
const OUTPUT_PATH = path.resolve(
  'evidence/2026-07-21/phase-6-p6-4-authority-spawns/independent-verification.json',
);
const FIXTURE_PATH = path.resolve(
  'assets/source/maps/inkfall-foundry/runtime/spawn-fixtures.p6-4.v1.json',
);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

const capture = JSON.parse(await readFile(CAPTURE_PATH, 'utf8'));
const fixtureBytes = await readFile(FIXTURE_PATH);
const fixtureSet = JSON.parse(fixtureBytes.toString('utf8'));
const screenshotPath = path.resolve(capture.screenshot.path);
const screenshotBytes = await readFile(screenshotPath);
const expectedFixtureResults = fixtureSet.scenarios.map(({ id, expected }) => ({ id, ...expected }));
const independentlyHashedSources = Object.fromEntries(await Promise.all(
  Object.entries(capture.sourceFingerprints).map(async ([id, entry]) => {
    const bytes = await readFile(path.resolve(entry.path));
    return [id, { path: entry.path, sha256: sha256(bytes) }];
  }),
));
const decision = capture.snapshot.spawnAuthority.decision;
const visualCandidates = decision.evaluations.filter(({ set }) => set === 'deathmatch_candidate');
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
  capturePassed: capture.status === 'P6_4_AUTHORITY_SPAWN_EVIDENCE_PASS'
    && Object.values(capture.assertions).every(Boolean),
  sourceFingerprintsMatch: JSON.stringify(independentlyHashedSources)
    === JSON.stringify(capture.sourceFingerprints)
    && capture.sourceFingerprints.fixture.sha256 === sha256(fixtureBytes),
  screenshotMatches: screenshotBytes.byteLength === capture.screenshot.bytes
    && sha256(screenshotBytes) === capture.screenshot.sha256,
  immutableMapBinding: fixtureSet.mapId === 'inkfall_foundry'
    && fixtureSet.mapRevision === 1
    && fixtureSet.packageDigest === capture.snapshot.packageDigest
    && fixtureSet.fixtureHash === capture.snapshot.fixtureHash
    && capture.snapshot.renderMeshesMayBeAuthority === false,
  sixSavedFixturesExact: fixtureSet.scenarios.length === 6
    && JSON.stringify(expectedFixtureResults) === JSON.stringify(capture.fixtureSet.expectedResults)
    && JSON.stringify(expectedFixtureResults) === JSON.stringify(capture.snapshot.spawnAuthority.fixtureResults),
  arrangementCounts: JSON.stringify(fixtureSet.scenarios.slice(0, 3)
    .map(({ input }) => input.players.length + 1)) === JSON.stringify([2, 4, 8]),
  ffaAndTdmCovered: fixtureSet.scenarios.some(({ input }) => input.mode === 'deathmatch')
    && fixtureSet.scenarios.some(({ input }) => input.mode === 'team_deathmatch'),
  visualDecisionExact: decision.status === 'selected'
    && decision.selected?.spawnId === 'spawn_dm_ink_e'
    && decision.decisionHash === '81286ef1c04ce7e4'
    && decision.decisionHash === capture.snapshot.spawnAuthority.expectedDecisionHash,
  everyScoreComponentIsInteger: visualCandidates.length === 4
    && visualCandidates.every(({ components }) => (
      JSON.stringify(Object.keys(components).sort()) === JSON.stringify(componentKeys)
      && Object.values(components).every(Number.isSafeInteger)
    )),
  allEnemyRowsRetained: visualCandidates.every(({ enemies }) => enemies.length === 1
    && enemies[0].enemyId === 'enemy_visual'),
  authorityLosHasOpenAndBlockedRows: visualCandidates.some(({ enemies }) => enemies.some((enemy) => (
    enemy.standingLineOfSight || enemy.crouchedLineOfSight
  ))) && visualCandidates.some(({ enemies }) => enemies.every((enemy) => (
    !enemy.standingLineOfSight && !enemy.crouchedLineOfSight
    && typeof enemy.standingBlockerId === 'string'
  ))),
  unsafeFixtureFailsClosed: expectedFixtureResults.at(-1)?.status === 'no_safe_spawn'
    && expectedFixtureResults.at(-1)?.selectedSpawnId === null,
  noClientAuthority: decision.authorityBoundary === 'server_state_and_authority_collision_only'
    && decision.clientPositionOrScoreAccepted === false,
  scopeRemainsBounded: JSON.stringify(decision.nonClaims)
    === JSON.stringify(['P6.5_NOT_CLAIMED', 'P6.6_NOT_CLAIMED', 'G5_NOT_PASSED'])
    && capture.snapshot.status === 'P6.3_RUNTIME_FIXTURE_LOADED_G5_NOT_PASSED',
};
const output = {
  schemaVersion: 1,
  verifiedAtUtc: new Date().toISOString(),
  status: Object.values(assertions).every(Boolean)
    ? 'INDEPENDENT_P6_4_AUTHORITY_SPAWN_VERIFICATION_PASS'
    : 'INDEPENDENT_P6_4_AUTHORITY_SPAWN_VERIFICATION_FAIL',
  inputs: {
    capture: path.relative(process.cwd(), CAPTURE_PATH).replaceAll('\\', '/'),
    fixture: path.relative(process.cwd(), FIXTURE_PATH).replaceAll('\\', '/'),
    screenshot: capture.screenshot.path,
  },
  fingerprints: {
    fixtureSha256: sha256(fixtureBytes),
    screenshotSha256: sha256(screenshotBytes),
    sources: independentlyHashedSources,
    packageDigest: capture.snapshot.packageDigest,
    fixtureHash: capture.snapshot.fixtureHash,
    visualDecisionHash: decision.decisionHash,
  },
  assertions,
};
await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
if (output.status.endsWith('_FAIL')) {
  process.stderr.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${output.status}\n`);
}
