import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROFILE = 'p511-inkfall-foundry-revision-2-combat-v1';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const output = path.resolve(
  repo,
  process.argv[2] ?? 'evidence/2026-07-22/phase-5-p5-12/runtime-v6',
);
const proofPath = path.join(output, 'p512-two-browser-inkfall-product-client-proof.json');
const manifestPath = path.join(output, 'artifact-manifest.json');

const expectedMapBinding = {
  mapReference: 'inkfall_foundry@2',
  mapId: 'inkfall_foundry',
  mapRevision: 2,
  packageDigest: '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520',
  fixtureId: 'inkfall_foundry_map_collision',
  fixtureHash: 'bf85e42731fd088e',
  xAxis: 'east',
  yAxis: 'up',
  zAxis: 'north',
  origin: 'press_core_floor_contact',
  gltfToMap: 'x_y_negative_z',
  distanceUnit: 'millimeters',
  angleUnit: 'milli_degrees',
  colliderCardinality: 339,
  spawns: [
    { spawnId: 'spawn_w_press_a', set: 'west_team', feetPosition: { x: -33_500, y: 0, z: -3_500 }, yawMilliDegrees: 0 },
    { spawnId: 'spawn_e_press_a', set: 'east_team', feetPosition: { x: 33_500, y: 0, z: 3_500 }, yawMilliDegrees: 180_000 },
    { spawnId: 'spawn_w_press_b', set: 'west_team', feetPosition: { x: -33_500, y: 0, z: 3_500 }, yawMilliDegrees: 0 },
    { spawnId: 'spawn_e_press_b', set: 'east_team', feetPosition: { x: 33_500, y: 0, z: -3_500 }, yawMilliDegrees: 180_000 },
    { spawnId: 'spawn_w_ink', set: 'west_team', feetPosition: { x: -30_500, y: 0, z: -7_000 }, yawMilliDegrees: -25_000 },
    { spawnId: 'spawn_e_ink', set: 'east_team', feetPosition: { x: 30_500, y: 0, z: -7_000 }, yawMilliDegrees: -155_000 },
    { spawnId: 'spawn_w_archive', set: 'west_team', feetPosition: { x: -30_500, y: 0, z: 7_000 }, yawMilliDegrees: 25_000 },
    { spawnId: 'spawn_e_archive', set: 'east_team', feetPosition: { x: 30_500, y: 0, z: 7_000 }, yawMilliDegrees: 155_000 },
  ],
};
const expectedSimulationIdentity = {
  schemaVersion: 1,
  mapId: 'inkfall_foundry',
  rulesetId: 'revamped_classic',
  rulesetRevision: 3,
  rulesetHash: 'd5f0418d1d927370',
  movementProfileId: 'phase3_hypothesis_v1',
  movementProfileRevision: 1,
  movementProfileHash: '8ab4ed437a4393c0',
  fixtureId: 'inkfall_foundry_map_collision',
  fixtureHash: 'bf85e42731fd088e',
  physicsAdapterId: 'rapier3d_deterministic_compat',
  physicsAdapterVersion: '0.19.3',
};

async function sha256(file) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

const [proof, manifest] = await Promise.all([
  fs.readFile(proofPath, 'utf8').then(JSON.parse),
  fs.readFile(manifestPath, 'utf8').then(JSON.parse),
]);

assert.equal(proof.schemaVersion, 1);
assert.equal(proof.phase, 'P5.12');
assert.equal(proof.status, 'BOUNDED_PASS');
assert.equal(proof.gateClaim, 'G4_NOT_CLAIMED_G5_NOT_CLAIMED');
assert.equal(proof.topology.route, '/online');
assert.equal(proof.topology.browserLaunches, 2);
assert.equal(proof.topology.browserProcesses, 2);
assert.notEqual(proof.topology.westBrowserProcessId, proof.topology.eastBrowserProcessId);
assert.equal(proof.topology.syntheticDashboard, false);
assert.equal(proof.selection.visibleUncheckedByDefault, true);
assert.equal(proof.selection.explicitProfile, PROFILE);
assert.equal(proof.selection.profileSentOnCreateAndJoinMetadataCheck, true);
assert.equal(proof.selection.mismatchFailsClosedBeforeSocket, true);
assert.match(proof.selection.mismatchCopy, /HTTP 409/u);

assert.equal(proof.lockedAuthority.roomProfile, PROFILE);
assert.deepEqual(proof.lockedAuthority.mapBinding, expectedMapBinding);
assert.deepEqual(proof.lockedAuthority.simulationIdentity, expectedSimulationIdentity);
assert.ok(proof.lockedAuthority.westIdentityChecks >= 4);
assert.ok(proof.lockedAuthority.eastIdentityChecks >= 4);
assert.deepEqual(proof.spawns.west, expectedMapBinding.spawns[0].feetPosition);
assert.deepEqual(proof.spawns.east, expectedMapBinding.spawns[1].feetPosition);

assert.equal(proof.pressCross.routeId, 'synthetic_2_player_press_cross');
assert.equal(proof.pressCross.observedCheckpoints.length, 7);
assert.ok(proof.pressCross.acceptedShotsAfter > proof.pressCross.acceptedShotsBefore);
assert.equal(proof.pressCross.victimHealthBefore, 100);
assert.equal(proof.pressCross.victimHealthAfter, proof.pressCross.victimHealthBefore);
assert.equal(proof.pressCross.realOcclusionBlockedCrossMapDamage, true);

assert.ok(proof.closeCombat.damageHealth <= 70 && proof.closeCombat.damageHealth > 0);
assert.equal(proof.closeCombat.damageEventObserved, true);
assert.equal(proof.closeCombat.killEventObserved, true);
assert.deepEqual(
  {
    lifePhase: proof.closeCombat.death.lifePhase,
    healthPoints: proof.closeCombat.death.healthPoints,
  },
  { lifePhase: 'dead', healthPoints: 0 },
);
assert.ok(proof.closeCombat.death.deathOrdinal >= 1);
assert.ok(proof.closeCombat.death.feedSequence >= 1);
assert.ok(proof.closeCombat.death.teamScores.some(({ score }) => score >= 1));
assert.ok(proof.closeCombat.grenade.localPlayer.acceptedThrowCount >= 1);
assert.ok(proof.closeCombat.grenade.localPlayer.activeProjectileCount >= 1);
assert.ok(proof.closeCombat.grenade.projectiles.some(({ phase }) => phase === 'active'));
assert.deepEqual(proof.closeCombat.clientErrors, [null, null, null]);
assert.deepEqual(proof.browserConsole.errors.east, []);
assert.deepEqual(proof.browserConsole.errors.west, [proof.selection.expectedMismatchConsoleError]);
assert.equal(proof.knownLimits.includes('This capture does not close G4 or G5.'), true);

for (const [relative, expectedHash] of Object.entries(manifest.files)) {
  assert.equal(await sha256(path.join(output, relative)), expectedHash, relative);
}
for (const [relative, expectedHash] of Object.entries(proof.sourceSha256)) {
  assert.equal(await sha256(path.join(repo, relative)), expectedHash, relative);
}

const verification = {
  schemaVersion: 1,
  phase: 'P5.12',
  verifiedAt: new Date().toISOString(),
  status: 'PASS',
  runtime: path.relative(repo, output).replaceAll('\\', '/'),
  checks: {
    artifactHashes: Object.keys(manifest.files).length,
    sourceHashes: Object.keys(proof.sourceSha256).length,
    exactProfile: PROFILE,
    exactMapReference: expectedMapBinding.mapReference,
    exactSpawns: expectedMapBinding.spawns.length,
    distinctBrowserProcesses: true,
    crossMapShotsOccluded: true,
    damageDeathScoreFeed: true,
    realGrenadeProjectileActive: true,
    mismatchFailedClosedBeforeSocket: true,
    g4Claimed: false,
    g5Claimed: false,
  },
  proofSha256: await sha256(proofPath),
  manifestSha256: await sha256(manifestPath),
};
await fs.writeFile(
  path.join(output, 'independent-verification.json'),
  `${JSON.stringify(verification, null, 2)}\n`,
  { flag: 'wx' },
);
console.log(JSON.stringify(verification, null, 2));
