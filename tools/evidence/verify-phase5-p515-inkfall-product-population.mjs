import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROFILE = 'p511-inkfall-foundry-revision-2-combat-v1';
const FLAT_COMBAT_PROFILE = 'p58d-rev3-combat-v1';
const AUTHORITY_WEBSOCKET_ORIGIN = 'ws://127.0.0.1:8787';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const output = path.resolve(
  repo,
  process.argv[2] ?? 'evidence/2026-07-22/phase-5-p5-15/runtime-v1',
);
const proofPath = path.join(output, 'p515-product-population-proof.json');
const manifestPath = path.join(output, 'artifact-manifest.json');
const wireLogPath = path.join(output, 'p515-normalized-wire-log.jsonl');
const expectedBrowserLaunchArguments = [
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=IntensiveWakeUpThrottling,CalculateNativeWinOcclusion',
];

const expectedSpawns = [
  { spawnId: 'spawn_w_press_a', set: 'west_team', feetPosition: { x: -33_500, y: 0, z: -3_500 }, yawMilliDegrees: 0 },
  { spawnId: 'spawn_e_press_a', set: 'east_team', feetPosition: { x: 33_500, y: 0, z: 3_500 }, yawMilliDegrees: 180_000 },
  { spawnId: 'spawn_w_press_b', set: 'west_team', feetPosition: { x: -33_500, y: 0, z: 3_500 }, yawMilliDegrees: 0 },
  { spawnId: 'spawn_e_press_b', set: 'east_team', feetPosition: { x: 33_500, y: 0, z: -3_500 }, yawMilliDegrees: 180_000 },
  { spawnId: 'spawn_w_ink', set: 'west_team', feetPosition: { x: -30_500, y: 0, z: -7_000 }, yawMilliDegrees: -25_000 },
  { spawnId: 'spawn_e_ink', set: 'east_team', feetPosition: { x: 30_500, y: 0, z: -7_000 }, yawMilliDegrees: -155_000 },
  { spawnId: 'spawn_w_archive', set: 'west_team', feetPosition: { x: -30_500, y: 0, z: 7_000 }, yawMilliDegrees: 25_000 },
  { spawnId: 'spawn_e_archive', set: 'east_team', feetPosition: { x: 30_500, y: 0, z: 7_000 }, yawMilliDegrees: 155_000 },
];
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
  spawns: expectedSpawns,
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
const expectedScreenshots = [
  'screenshots/p515-01-client-0-two-rendered.png',
  'screenshots/p515-02-client-1-two-rendered.png',
  'screenshots/p515-03-real-occlusion.png',
  'screenshots/p515-04-confirmed-body-hit.png',
  'screenshots/p515-05-authoritative-death-score.png',
  'screenshots/p515-06-confirmed-teleport.png',
  'screenshots/p515-07-resume-preserved-state.png',
  'screenshots/p515-08-four-product-clients.png',
  'screenshots/p515-09-eight-product-clients.png',
  'screenshots/p515-10-profile-mismatch-fails-closed.png',
  'screenshots/p515-11-runtime-evidence-board.png',
];
const expectedSourceFiles = [
  'src/app/onlineAuthorityProfiles.ts',
  'src/app/onlineAuthorityGateway.ts',
  'src/app/onlineAuthorityInkfallWorld.ts',
  'src/app/onlineAuthorityRoute.ts',
  'src/dev/authorityEvidenceClient.ts',
  'src/client/combat/presentationAdapter.ts',
  'src/authority/room.ts',
  'src/authority/fixedTickScheduler.ts',
  'src/net/protocol.ts',
  'src/net/schemas.ts',
  'worker/combatRuntime.ts',
  'worker/room.ts',
  'worker/security.ts',
  'tests/worker/protocolV2Socket.test.ts',
  'tests/worker/socketAttachmentCache.test.ts',
  'tests/worker/slowConsumerBackpressure.test.ts',
  'tests/worker/inkfallPopulation.test.ts',
  'tests/unit/authority/fixedTickScheduler.test.ts',
  'tests/unit/authority/combat/roomCombatIntegration.test.ts',
  'tests/unit/dev/authorityEvidence.test.ts',
  'tests/unit/net/protocol-v2.test.ts',
  'tests/unit/worker/security.test.ts',
  'assets/source/maps/inkfall-foundry/inkfall-foundry.layout-seed.v1.json',
  'evidence/2026-07-22/phase-5-p5-15/runtime-v10/p515-canonical-traversal-defect.json',
  'tools/evidence/capture-phase5-p515-inkfall-product-population.mjs',
  'tools/evidence/verify-phase5-p515-inkfall-product-population.mjs',
];

async function sha256(file) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

function assertSha256(value, label) {
  assert.match(value, /^[0-9a-f]{64}$/u, label);
}

function reliableEventOccurrences(wire, clientId, stimulus) {
  return wire.flatMap((record) => {
    if (
      record.direction !== 'received'
      || record.clientId !== clientId
      || record.message.type !== 'reliableEventBatch'
    ) return [];
    return record.message.events.filter((event) => (
      event.id === stimulus.reliableEventId
      && event.subjectId === stimulus.subjectId
      && event.serverTick === stimulus.serverTick
      && event.kind === 'shotAccepted'
      && event.actorId === stimulus.actorId
    )).map((event) => ({ record, event }));
  });
}

function assertSharedAuthorityStimulus(stimulus, count, driverClientId) {
  assert.equal(stimulus.kind, 'real_product_shot_accepted_reliable_tick');
  assert.equal(stimulus.directStateMutation, false);
  assert.equal(stimulus.serverOwned, true);
  assert.equal(stimulus.roomWide, true);
  assert.equal(stimulus.driverClientId, driverClientId);
  assert.match(stimulus.reliableEventId, /^event\.(0|[1-9][0-9]*)$/u);
  assert.match(stimulus.subjectId, /^combat\.auto_rifle\.shot\./u);
  assert.equal(typeof stimulus.actorId, 'string');
  assert.ok(stimulus.actorId.length > 0);
  assert.ok(Number.isInteger(stimulus.serverTick) && stimulus.serverTick > 0);
  assert.equal(stimulus.acceptedShotCountAfter - stimulus.acceptedShotCountBefore, 1);
  assert.equal(stimulus.newAuthorityEventIdentityRequired, true);
  assert.ok(Number.isInteger(stimulus.preStimulusSnapshotTick));
  assert.ok(stimulus.serverTick > stimulus.preStimulusSnapshotTick);
  assert.ok(Array.isArray(stimulus.preStimulusShotEventIds));
  assert.equal(stimulus.preStimulusShotEventIds.includes(stimulus.reliableEventId), false);
  assert.ok(Number.isFinite(stimulus.acceptedStateObservedAtMilliseconds));
  assert.ok(Number.isFinite(stimulus.driverEventObservedAtMilliseconds));
  assert.equal(
    stimulus.diagnosticToEventObservationMilliseconds,
    stimulus.driverEventObservedAtMilliseconds - stimulus.acceptedStateObservedAtMilliseconds,
  );
  assert.ok(
    stimulus.diagnosticToEventObservationMilliseconds >= -5_000
    && stimulus.diagnosticToEventObservationMilliseconds <= 5_000,
  );
  assert.ok(
    stimulus.driverEventWaitMilliseconds >= 0
    && stimulus.driverEventWaitMilliseconds <= 5_000,
  );
  assert.deepEqual(
    stimulus.healthAfter.map(({ playerId }) => playerId),
    stimulus.healthBefore.map(({ playerId }) => playerId),
  );
  assert.deepEqual(stimulus.healthTransitions, stimulus.healthBefore.map((beforeHealth, index) => ({
    playerId: beforeHealth.playerId,
    beforeHealthPoints: beforeHealth.healthPoints,
    afterHealthPoints: stimulus.healthAfter[index].healthPoints,
    deltaHealthPoints: stimulus.healthAfter[index].healthPoints - beforeHealth.healthPoints,
  })));
  assert.equal(stimulus.healthNeverDecreased, true);
  assert.ok(stimulus.healthTransitions.every(({ deltaHealthPoints }) => deltaHealthPoints >= 0));
  assert.equal(
    stimulus.healthUnchanged,
    JSON.stringify(stimulus.healthAfter) === JSON.stringify(stimulus.healthBefore),
  );
  assert.deepEqual(stimulus.scoreFeedAfter, stimulus.scoreFeedBefore);
  assert.equal(stimulus.scoreFeedUnchanged, true);
  assert.equal(
    stimulus.transportDeliverySemantics,
    'at_least_once_with_client_deduplication',
  );
  assert.equal(stimulus.deliveryClients, count);
  assert.equal(stimulus.deliveries.length, count);
  assert.deepEqual(
    stimulus.deliveries.map(({ clientId }) => clientId),
    Array.from({ length: count }, (_, index) => `client-${index}`),
  );
  for (const delivery of stimulus.deliveries) {
    assert.ok(delivery.rawOccurrenceCount >= 1);
    assert.equal(delivery.duplicateWireDeliveries, delivery.rawOccurrenceCount - 1);
    assert.equal(delivery.logicalApplicationCount, 1);
    assert.deepEqual(delivery.presentationAfter, delivery.presentationBefore);
    assert.equal(delivery.presentationConsequenceUnchanged, true);
    assert.equal(Date.parse(delivery.observedAt), delivery.observedAtMilliseconds);
    assert.equal(
      delivery.latencyMilliseconds,
      delivery.observedAtMilliseconds - stimulus.requestedAtMilliseconds,
    );
    assert.ok(delivery.latencyMilliseconds >= 0 && delivery.latencyMilliseconds <= 5_000);
  }
  assert.equal(
    stimulus.totalRawDeliveries,
    stimulus.deliveries.reduce((sum, { rawOccurrenceCount }) => sum + rawOccurrenceCount, 0),
  );
  assert.equal(stimulus.totalLogicalApplications, count);
  assert.equal(stimulus.presentationConsequencesUnchanged, true);
  assert.equal(
    stimulus.maximumDeliveryLatencyMilliseconds,
    Math.max(...stimulus.deliveries.map(({ latencyMilliseconds }) => latencyMilliseconds)),
  );
}

function assertPopulation(population, count, roomCode, matchId) {
  assert.equal(population.count, count);
  assert.equal(population.roomCode, roomCode);
  assert.equal(population.matchId, matchId);
  assert.ok(Number.isInteger(population.commonAuthorityTick) && population.commonAuthorityTick > 0);
  assert.equal(population.commonAuthorityTick, population.tickStimulus.serverTick);
  assertSharedAuthorityStimulus(population.tickStimulus, count, population.tickStimulus.driverClientId);
  assert.equal(population.uniquePlayerIds, count);
  assert.deepEqual(population.remotePlayersPerClient, Array.from({ length: count }, () => count - 1));
  for (const field of ['fullSnapshotsPerClient', 'inputAcksPerClient']) {
    assert.equal(population[field].length, count);
    assert.ok(population[field].every((value) => Number.isInteger(value) && value > 0), `${field} positive`);
  }
  assert.equal(population.deltaSnapshotsPerClient.length, count);
  assert.ok(population.deltaSnapshotsPerClient.every((value) => Number.isInteger(value) && value >= 0));
  assert.equal(population.identityChecksPerClient.length, count);
  assert.ok(population.identityChecksPerClient.every((value) => value >= 4));
  assert.equal(population.presentationPerClient.length, count);
  for (const presentation of population.presentationPerClient) {
    assert.equal(presentation.status, 'ready');
    assert.ok(presentation.hydrationCount >= 1);
    assert.ok(presentation.intentCount >= 1);
    assert.ok(Number.isInteger(presentation.confirmedIntentCount) && presentation.confirmedIntentCount >= 0);
    assert.equal(presentation.rejectedIntentCount, 0);
    assert.equal(presentation.duplicateAuthorityEvents, 0);
    assert.equal(presentation.staleAuthorityEvents, 0);
  }
  assert.equal(population.players.length, count);
  assert.equal(new Set(population.players.map(({ playerId }) => playerId)).size, count);
  assert.ok(population.players.every(({ shieldPoints }) => shieldPoints === 0));
  assert.deepEqual(population.teamDistribution, { team_blue: count / 2, team_red: count / 2 });
}

function assertConfirmedPresentation(value, cue, minimumConfirmedIntents) {
  assert.equal(value.diagnostics.status, 'ready');
  assert.equal(value.diagnostics.lastCue, cue);
  assert.ok(value.diagnostics.hydrationCount >= 1);
  assert.ok(value.diagnostics.intentCount >= value.diagnostics.confirmedIntentCount);
  assert.ok(value.diagnostics.confirmedIntentCount >= minimumConfirmedIntents);
  assert.equal(value.diagnostics.rejectedIntentCount, 0);
  assert.equal(value.diagnostics.duplicateAuthorityEvents, 0);
  assert.equal(value.diagnostics.staleAuthorityEvents, 0);
  assert.ok(value.diagnostics.audioCueAttempts >= minimumConfirmedIntents);
  assert.equal(typeof value.diagnostics.lastAuthorityEventId, 'string');
  assert.ok(value.diagnostics.lastAuthorityEventId.length > 0);
  assert.deepEqual(value.body, {
    status: 'ready',
    lastCue: cue,
    confirmedIntents: String(value.diagnostics.confirmedIntentCount),
  });
  assert.match(value.proof.text, new RegExp(`READY.*CONFIRMED.*${cue}`, 'iu'));
  assert.equal(value.proof.lastCue, cue);
  assert.equal(value.proof.confirmedIntents, String(value.diagnostics.confirmedIntentCount));
  assert.equal(value.proof.duplicateEvents, '0');
  assert.match(value.hud.text, new RegExp(cue === 'body' ? 'BODY HIT' : 'ELIMINATION', 'u'));
  assert.equal(value.hud.cue, cue);
  assert.equal(value.hud.authorityEventId, value.diagnostics.lastAuthorityEventId);
  assert.equal(value.hud.active, 'true');
  assert.ok(value.hud.audio === 'played' || value.hud.audio === 'caption_only');
  assert.equal(value.vfx.cue, cue);
  assert.equal(value.vfx.authorityEventId, value.diagnostics.lastAuthorityEventId);
  assert.equal(value.vfx.active, 'true');
  assert.ok(value.vfx.reducedMotion === 'true' || value.vfx.reducedMotion === 'false');
}

const [proof, manifest, wireText] = await Promise.all([
  fs.readFile(proofPath, 'utf8').then(JSON.parse),
  fs.readFile(manifestPath, 'utf8').then(JSON.parse),
  fs.readFile(wireLogPath, 'utf8'),
]);
const wireLines = wireText.trimEnd().split('\n');
const wire = wireLines.map((line) => JSON.parse(line));

assert.equal(proof.schemaVersion, 1);
assert.equal(proof.phase, 'P5.15');
assert.equal(proof.status, 'BOUNDED_PASS');
assert.equal(proof.gateClaim, 'G3_NOT_CLAIMED_G4_NOT_CLAIMED_G5_NOT_CLAIMED');

assert.equal(proof.topology.route, '/online');
assert.equal(proof.topology.exactProfile, PROFILE);
assert.equal(proof.topology.productClients, 8);
assert.equal(proof.topology.isolatedBrowserContexts, 8);
assert.equal(proof.topology.browserLaunches, 8);
assert.equal(proof.topology.browserProcesses, 8);
assert.equal(proof.topology.browserProcessIds.length, 8);
assert.equal(new Set(proof.topology.browserProcessIds).size, 8);
assert.ok(proof.topology.browserProcessIds.every((processId) => Number.isSafeInteger(processId)));
assert.equal(proof.topology.oneBrowserProcessPerProductClient, true);
assert.equal(proof.topology.independentlyScheduledActiveBrowserClients, 8);
assert.equal(proof.topology.browserProcessesPrelaunchedBeforeRoomCreation, 8);
assert.equal(proof.topology.browserContextsPrecreatedBeforeRoomCreation, 8);
assert.equal(proof.topology.productPagesPrewarmedBeforeRoomCreation, 8);
assert.equal(proof.topology.prewarmRoute, '/online');
assert.equal(proof.topology.prewarmStatus, 'lobby');
assert.ok(Date.parse(proof.topology.browserPrewarmCompletedAt) >= Date.parse(proof.topology.browserPrewarmStartedAt));
assert.ok(Date.parse(proof.topology.roomCreationRequestedAt) >= Date.parse(proof.topology.browserPrewarmCompletedAt));
assert.match(proof.topology.executable, /chrome\.exe$/iu);
assert.equal(proof.topology.headless, true);
assert.deepEqual(proof.topology.browserLaunchArguments, expectedBrowserLaunchArguments);
assert.equal(
  proof.topology.activeClientHarnessAssumption,
  'Each isolated context and dedicated Chrome process models an actively played client on a separate player machine.',
);
assert.equal(proof.topology.backgroundedOrSuspendedTabRobustnessClaimed, false);
assert.equal(proof.topology.syntheticProductClient, false);

assert.match(proof.authority.roomCode, /^KYX-[A-Z0-9]+$/u);
assert.equal(typeof proof.authority.matchId, 'string');
assert.ok(proof.authority.matchId.length > 0);
assert.deepEqual(proof.authority.mapBinding, expectedMapBinding);
assert.deepEqual(proof.authority.simulationIdentity, expectedSimulationIdentity);
assert.deepEqual(proof.authority.synchronizationContract, {
  source: 'server_owned_room_wide_reliable_event',
  eventKind: 'shotAccepted',
  rationale: 'Snapshot cadence and baselines are per connection; cross-client snapshot-tick equality is not the protocol contract.',
  snapshotReplicationStillRequired: true,
});
assert.equal(proof.authority.initialJoins.length, 8);
assert.equal(new Set(proof.authority.initialJoins.map(({ clientId }) => clientId)).size, 8);
assert.equal(new Set(proof.authority.initialJoins.map(({ playerId }) => playerId)).size, 8);
assert.ok(proof.authority.initialJoins.every(({ matchId }) => matchId === proof.authority.matchId));
for (let index = 0; index < 8; index += 1) {
  const join = proof.authority.initialJoins[index];
  assert.equal(join.clientId, `client-${index}`);
  assertSha256(join.resumeTokenSha256, `${join.clientId} token digest`);
  assert.ok(Number.isInteger(join.serverTick) && join.serverTick > 0);
  assert.deepEqual(join.feetPosition, expectedSpawns[index].feetPosition);
  assert.equal(join.yawMilliDegrees, expectedSpawns[index].yawMilliDegrees);
  assert.equal(join.teamId, index % 2 === 0 ? 'team_blue' : 'team_red');
}

assertPopulation(proof.populations.two, 2, proof.authority.roomCode, proof.authority.matchId);
assertPopulation(proof.populations.four, 4, proof.authority.roomCode, proof.authority.matchId);
assertPopulation(proof.populations.eight, 8, proof.authority.roomCode, proof.authority.matchId);
assert.equal(proof.populations.two.tickStimulus.driverClientId, 'client-0');
assert.equal(proof.populations.four.tickStimulus.driverClientId, 'client-2');
assert.equal(proof.populations.eight.tickStimulus.driverClientId, 'client-6');
assert.ok(proof.populations.two.commonAuthorityTick < proof.populations.four.commonAuthorityTick);
assert.ok(proof.populations.four.commonAuthorityTick < proof.populations.eight.commonAuthorityTick);

assert.equal(proof.movementAndWorld.routeId, 'alternate_ink_channel_after_press_cross_snag');
assert.equal(proof.movementAndWorld.routeCheckpoints.length, 9);
assert.equal(proof.movementAndWorld.spawnProtectionExpiryWaitMilliseconds, 1_500);
assert.ok(Array.isArray(proof.movementAndWorld.driverRecoveries));
assert.ok(proof.movementAndWorld.driverRecoveries.length <= 40);
for (const recovery of proof.movementAndWorld.driverRecoveries) {
  assert.equal(typeof recovery.label, 'string');
  assert.ok(recovery.recoveryKey === 'a' || recovery.recoveryKey === 'd');
  assert.ok(recovery.distanceBeforeMillimeters > 0);
}
assert.ok(proof.movementAndWorld.crossAcceptedShotsAfter > proof.movementAndWorld.crossAcceptedShotsBefore);
assert.equal(proof.movementAndWorld.crossVictimHealthAfter, proof.movementAndWorld.crossVictimHealthBefore);
assert.equal(proof.movementAndWorld.realOcclusionBlockedCrossMapDamage, true);
for (const interpolation of [
  proof.movementAndWorld.fourInterpolation,
  proof.movementAndWorld.eightInterpolation,
]) {
  assert.ok(interpolation.movementMillimeters >= 500);
  assert.ok(interpolation.peerDistanceMillimeters <= 1_500);
  assert.ok(interpolation.remoteTransformMovementMillimeters >= 500);
  assert.ok(Number.isInteger(interpolation.commonAuthorityTickAfterMovement));
  assert.equal(
    interpolation.commonAuthorityTickAfterMovement,
    interpolation.tickStimulusAfterMovement.serverTick,
  );
  assert.ok(interpolation.populationDeltaSnapshotsAfterMovement.every((value) => value >= 1));
  assert.ok(interpolation.populationInputAcksAfterMovement.every((value) => value >= 1));
  assert.ok(interpolation.populationDeltaSnapshotDeltasAfterMovement.every((value) => value >= 1));
  assert.ok(interpolation.populationInputAckDeltasAfterMovement.every((value) => value >= 1));
  assert.ok(interpolation.moverReconciliations >= 0);
}
assertSharedAuthorityStimulus(
  proof.movementAndWorld.fourInterpolation.tickStimulusAfterMovement,
  4,
  'client-2',
);
assertSharedAuthorityStimulus(
  proof.movementAndWorld.eightInterpolation.tickStimulusAfterMovement,
  8,
  'client-6',
);
assert.equal(proof.movementAndWorld.fourInterpolation.populationDeltaSnapshotsAfterMovement.length, 4);
assert.equal(proof.movementAndWorld.fourInterpolation.populationInputAcksAfterMovement.length, 4);
assert.equal(proof.movementAndWorld.fourInterpolation.populationDeltaSnapshotDeltasAfterMovement.length, 4);
assert.equal(proof.movementAndWorld.fourInterpolation.populationInputAckDeltasAfterMovement.length, 4);
assert.equal(proof.movementAndWorld.eightInterpolation.populationDeltaSnapshotsAfterMovement.length, 8);
assert.equal(proof.movementAndWorld.eightInterpolation.populationInputAcksAfterMovement.length, 8);
assert.equal(proof.movementAndWorld.eightInterpolation.populationDeltaSnapshotDeltasAfterMovement.length, 8);
assert.equal(proof.movementAndWorld.eightInterpolation.populationInputAckDeltasAfterMovement.length, 8);
assert.equal(proof.movementAndWorld.fourInterpolation.observerRemotePlayers, 3);
assert.equal(proof.movementAndWorld.eightInterpolation.observerRemotePlayers, 7);
assert.ok(
  proof.movementAndWorld.fourInterpolation.commonAuthorityTickAfterMovement
    > proof.populations.four.commonAuthorityTick,
);
assert.ok(
  proof.movementAndWorld.eightInterpolation.commonAuthorityTickAfterMovement
    > proof.populations.eight.commonAuthorityTick,
);

assert.equal(proof.combat.damageEventObserved, true);
assert.deepEqual(proof.combat.setupContract, {
  west: { x: 400, z: -15_550 },
  east: { x: 2_323, z: -15_175 },
  arrivalToleranceMillimeters: 100,
  minimumPulseMilliseconds: 40,
  settleMilliseconds: 750,
  maximumSeparationMillimeters: 2_200,
  minimumVerticalMarginMillimeters: 90,
});
assert.ok(proof.combat.bodyHitConvergence.afterSeparationMillimeters <= 2_200);
assert.ok(proof.combat.bodyHitVerticalMarginMillimeters >= 90);
assert.equal(
  proof.combat.bodyHitVictimPosition.y + 1_800
    - (proof.combat.bodyHitShooterPosition.y + 1_700),
  proof.combat.bodyHitVerticalMarginMillimeters,
);
assert.ok(proof.combat.lethalConvergence.afterSeparationMillimeters <= 2_200);
for (const [drive, label] of [
  [proof.combat.bodyDamageDrive, 'body'],
  [proof.combat.lethalDamageDrive, 'lethal'],
]) {
  assert.ok(drive.length >= 1, `${label} drive pulses`);
  assert.ok(drive.every(({ index }, pulseIndex) => index === pulseIndex));
  assert.ok(drive.every(({ acceptedShotDelta, healthDamagePoints }) => (
    acceptedShotDelta >= 0 && healthDamagePoints >= 0
  )));
  assert.ok(drive.every(({ outcome }) => [
    'authority_damage', 'accepted_miss_or_occluded', 'cadence_no_shot',
  ].includes(outcome)));
  assert.ok(drive.reduce((sum, { acceptedShotDelta }) => sum + acceptedShotDelta, 0) >= 1);
  assert.ok(drive.reduce((sum, { healthDamagePoints }) => sum + healthDamagePoints, 0) >= 1);
}
assert.ok(proof.combat.bodyDamageDrive.at(-1).victimHealthAfter > 0);
assert.ok(proof.combat.bodyDamageDrive.at(-1).victimHealthAfter <= 70);
assert.equal(proof.combat.lethalDamageDrive.at(-1).victimHealthAfter, 0);
assert.deepEqual(
  { lifePhase: proof.combat.death.lifePhase, healthPoints: proof.combat.death.healthPoints },
  { lifePhase: 'dead', healthPoints: 0 },
);
assert.ok(proof.combat.death.deathOrdinal >= 1);
assert.ok(proof.combat.match.feedSequence >= 1);
assert.ok(proof.combat.match.teamScores.some(({ score }) => score >= 1));
assert.ok(proof.combat.match.feed.length >= 1);
assert.equal(proof.combat.playerKilledReliableDeliveryClientsAtEvent, 2);
assertConfirmedPresentation(proof.combat.confirmedPresentationAtDamage, 'body', 1);
assertConfirmedPresentation(proof.combat.confirmedPresentationAtDeath, 'kill', 2);
assert.ok(proof.combat.teleport.distanceMillimeters >= 500);
assert.ok(proof.combat.teleport.afterPosition.y > -10_000);
assert.notDeepEqual(proof.combat.teleport.beforePosition, proof.combat.teleport.afterPosition);
assert.equal(proof.combat.teleport.reliableEvent.kind, 'abilityActivated');
assert.equal(proof.combat.teleport.reliableEvent.actorId, proof.authority.initialJoins[0].playerId);
assert.equal(proof.combat.teleport.reliableEvent.presentation.kind, 'teleport_resource_confirmed');
assert.equal(proof.combat.teleport.reliableEvent.presentation.abilityId, 'vertical_teleport_v1');
assert.ok(
  proof.combat.teleport.reliableEvent.presentation.outcome === 'full'
    || proof.combat.teleport.reliableEvent.presentation.outcome === 'partial',
);
assert.equal(proof.combat.teleport.reliableDeliveryClients, 2);
assert.equal(proof.combat.teleport.deliveries.length, 2);
assert.deepEqual(proof.combat.teleport.deliveries.map(({ clientId }) => clientId), ['client-0', 'client-1']);
for (const delivery of proof.combat.teleport.deliveries) {
  assert.equal(delivery.occurrenceCount, 1);
  assert.equal(Date.parse(delivery.observedAt), delivery.observedAtMilliseconds);
  assert.equal(
    delivery.latencyMilliseconds,
    delivery.observedAtMilliseconds - proof.combat.teleport.requestedAtMilliseconds,
  );
  assert.ok(delivery.latencyMilliseconds >= 0 && delivery.latencyMilliseconds <= 5_000);
}
assert.equal(
  proof.combat.teleport.maximumDeliveryLatencyMilliseconds,
  Math.max(...proof.combat.teleport.deliveries.map(({ latencyMilliseconds }) => latencyMilliseconds)),
);
assertConfirmedPresentation(proof.combat.teleport.confirmedPresentation, 'teleport', 3);

assert.equal(proof.resume.samePlayerId, true);
assert.equal(proof.resume.sameMatchId, true);
assert.equal(proof.resume.resumeTokenRotated, true);
assert.equal(proof.resume.scorePreserved, true);
assert.equal(proof.resume.feedSequencePreserved, true);
assertSha256(proof.resume.originalResumeTokenSha256, 'original resume token digest');
assertSha256(proof.resume.rotatedResumeTokenSha256, 'rotated resume token digest');
assert.notEqual(proof.resume.originalResumeTokenSha256, proof.resume.rotatedResumeTokenSha256);
assert.ok(proof.resume.resumeSuccesses >= 1);
assert.equal(proof.resume.presentationBeforeResume.status, 'ready');
assert.equal(proof.resume.presentationBeforeResume.lastCue, 'teleport');
assert.equal(proof.resume.presentationBeforeResume.duplicateAuthorityEvents, 0);
assert.equal(proof.resume.presentationBeforeResume.staleAuthorityEvents, 0);
assert.equal(proof.resume.presentationAfterResume.status, 'ready');
assert.equal(proof.resume.presentationAfterResume.lastCue, 'snapshot');
assert.ok(
  proof.resume.presentationAfterResume.hydrationCount
    > proof.resume.presentationBeforeResume.hydrationCount,
);
assert.equal(proof.resume.noConfirmedPresentationReplay, true);
assert.equal(proof.resume.noDuplicatePresentationReplay, true);
assert.equal(
  proof.resume.presentationAfterResume.confirmedIntentCount,
  proof.resume.presentationBeforeResume.confirmedIntentCount,
);
assert.equal(
  proof.resume.presentationAfterResume.audioCueAttempts,
  proof.resume.presentationBeforeResume.audioCueAttempts,
);
assert.equal(proof.resume.presentationAfterResume.duplicateAuthorityEvents, 0);
assert.equal(proof.resume.presentationAfterResume.staleAuthorityEvents, 0);

assert.equal(proof.failClosed.requestedProfile, PROFILE);
assert.equal(proof.failClosed.actualRoomProfile, FLAT_COMBAT_PROFILE);
assert.equal(proof.failClosed.httpStatus, 409);
assert.match(proof.failClosed.copy, /HTTP 409/u);
assert.equal(proof.failClosed.productClientCreated, false);
assert.equal(proof.failClosed.websocketScope, 'room_authority_only_dev_hmr_excluded');
assert.equal(proof.failClosed.websocketOpenedAfterMismatch, false);
const mismatchSocketOpens = wire.filter(({ clientId, direction, sequence, message }) => (
  clientId === 'client-7'
  && direction === 'lifecycle'
  && sequence >= proof.failClosed.wireSequenceStart
  && message.type === 'socket_open'
));
const mismatchAuthoritySocketUrls = mismatchSocketOpens
  .map(({ message }) => message.url)
  .filter((url) => url.startsWith(`${AUTHORITY_WEBSOCKET_ORIGIN}/api/rooms/`));
const mismatchDevelopmentSocketUrls = mismatchSocketOpens
  .map(({ message }) => message.url)
  .filter((url) => !url.startsWith(`${AUTHORITY_WEBSOCKET_ORIGIN}/api/rooms/`));
assert.deepEqual(mismatchAuthoritySocketUrls, []);
assert.deepEqual(proof.failClosed.authorityWebsocketUrlsAfterMismatch, mismatchAuthoritySocketUrls);
assert.deepEqual(proof.failClosed.developmentWebsocketUrlsAfterMismatch, mismatchDevelopmentSocketUrls);
assert.ok(mismatchDevelopmentSocketUrls.every((url) => url.startsWith('ws://127.0.0.1:5173/')));
assert.equal(
  proof.failClosed.expectedConsoleError,
  'Failed to load resource: the server responded with a status of 409 (Conflict)',
);

assert.equal(proof.clientDiagnostics.length, 8);
for (let index = 0; index < 8; index += 1) {
  const diagnostics = proof.clientDiagnostics[index];
  assert.equal(diagnostics.clientId, `client-${index}`);
  assert.deepEqual(diagnostics.pageErrors, []);
  assert.equal(diagnostics.wireDecodeErrors, 0);
  assert.deepEqual(diagnostics.consoleErrors, index === 7 ? [proof.failClosed.expectedConsoleError] : []);
  assert.ok(diagnostics.transientOptimizerErrors.length <= 3);
  assert.ok(diagnostics.transientOptimizerErrors.every((message) => (
    message === 'Failed to load resource: the server responded with a status of 504 (Outdated Optimize Dep)'
  )));
}
assert.ok(proof.transportDiagnostics.connectionTimeline.length >= 8);
assert.ok(proof.transportDiagnostics.roomMetricsTimeline.length >= 4);
assert.equal(proof.transportDiagnostics.finalRoomMetrics.label, 'capture-complete');
assert.equal(proof.transportDiagnostics.finalRoomMetrics.status, 200);
const finalTransport = proof.transportDiagnostics.finalRoomMetrics.body.metrics.transport;
assert.equal(finalTransport.snapshotAcksRejected, 0);
assert.equal(finalTransport.snapshotAckDebtEvictions, 0);
assert.equal(finalTransport.reliableEventAcksRejected, 0);
assert.equal(finalTransport.snapshotHistoryFallbacks, 0);
assert.ok(finalTransport.snapshotAckDebtRecoveries >= 1);
assert.ok(finalTransport.maximumSnapshotAckDebtMilliseconds >= 0);
assert.equal(proof.knownLimits.includes('This capture is bounded product/browser evidence, not broad playtest acceptance.'), true);
assert.equal(proof.knownLimits.includes('This capture does not close G3, G4, or G5.'), true);
assert.equal(proof.knownLimits.includes('Inkfall revision-2 players begin with zero shield; no synthetic shield cue is manufactured.'), true);
assert.equal(proof.knownLimits.includes('Reliable event transport is at least once; raw retransmissions are disclosed and client dedupe is required for exactly-once logical application.'), true);
assert.equal(proof.knownLimits.includes('Canonical press-cross traversal snag is retained in runtime-v10; this alternate route does not support G5 no-snag acceptance.'), true);
assert.equal(proof.knownLimits.includes('Human visual approval remains separate.'), true);
const traversalWarning = proof.movementAndWorld.traversalCollisionWarning
  ? await fs.readFile(path.join(output, 'p515-traversal-collision-warning.json'), 'utf8').then(JSON.parse)
  : null;
if (traversalWarning === null) {
  assert.equal(proof.movementAndWorld.driverRecoveries.length, 0);
  assert.equal(proof.knownLimits.includes('Alternate Ink-channel automation completed with zero additional collision recoveries.'), true);
} else {
  assert.equal(proof.movementAndWorld.driverRecoveries.length > 0, true);
  assert.equal(proof.knownLimits.includes('Alternate Ink-channel automation required bounded collision recovery; this run cannot support G5 no-snag acceptance.'), true);
  assert.equal(traversalWarning.schemaVersion, 1);
  assert.equal(traversalWarning.phase, 'P5.15');
  assert.equal(traversalWarning.status, 'TRAVERSAL_COLLISION_WARNING');
  assert.equal(traversalWarning.gateImpact, 'CANNOT_SUPPORT_G5_NO_SNAG_ACCEPTANCE');
  assert.equal(traversalWarning.recoveryCount, proof.movementAndWorld.driverRecoveries.length);
  assert.deepEqual(traversalWarning.recoveries, proof.movementAndWorld.driverRecoveries);
}

assert.equal(wire.length, proof.wire.entries);
assert.ok(wire.length > 0);
assert.deepEqual(wire.map(({ sequence }) => sequence), Array.from({ length: wire.length }, (_, index) => index));
assert.equal(wire.some(({ direction }) => direction === 'decode_error'), false);
assert.equal(JSON.stringify(wire).includes('"resumeToken":'), false);
assert.equal(
  wire.filter(({ direction, message }) => direction === 'received' && (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')).length,
  proof.wire.receivedSnapshots,
);
assert.equal(
  wire.filter(({ direction, message }) => direction === 'received' && message.type === 'reliableEventBatch').length,
  proof.wire.receivedReliableBatches,
);
assert.equal(proof.wire.decodeErrors, 0);
assert.equal(proof.wire.sha256, await sha256(wireLogPath));
for (const [populationName, count] of [['two', 2], ['four', 4], ['eight', 8]]) {
  const stimulus = proof.populations[populationName].tickStimulus;
  for (let index = 0; index < count; index += 1) {
    const clientId = `client-${index}`;
    const occurrences = reliableEventOccurrences(wire, clientId, stimulus);
    assert.equal(
      occurrences.length,
      stimulus.deliveries[index].rawOccurrenceCount,
      `${populationName} ${clientId} shared authority event deliveries`,
    );
    const delivery = stimulus.deliveries[index];
    assert.equal(occurrences[0].record.observedAt, delivery.observedAt);
    assert.equal(occurrences[0].record.observedAtMilliseconds, delivery.observedAtMilliseconds);
  }
}
for (const [interpolation, count] of [
  [proof.movementAndWorld.fourInterpolation, 4],
  [proof.movementAndWorld.eightInterpolation, 8],
]) {
  const stimulus = interpolation.tickStimulusAfterMovement;
  for (let index = 0; index < count; index += 1) {
    const clientId = `client-${index}`;
    const occurrences = reliableEventOccurrences(wire, clientId, stimulus);
    assert.equal(
      occurrences.length,
      stimulus.deliveries[index].rawOccurrenceCount,
      `post-movement ${clientId} shared authority event deliveries`,
    );
    const delivery = stimulus.deliveries[index];
    assert.equal(occurrences[0].record.observedAt, delivery.observedAt);
    assert.equal(occurrences[0].record.observedAtMilliseconds, delivery.observedAtMilliseconds);
  }
}
for (let index = 0; index < 8; index += 1) {
  const clientId = `client-${index}`;
  const proofJoin = proof.authority.initialJoins[index];
  const join = wire.find(({ direction, clientId: recordClientId, message }) => (
    direction === 'received'
    && recordClientId === clientId
    && message.type === 'joinAccepted'
    && message.connectionMode === 'joined'
  ));
  assert.notEqual(join, undefined, `${clientId} joined`);
  assert.equal(join.message.playerId, proofJoin.playerId);
  assert.equal(join.message.matchId, proofJoin.matchId);
  assert.equal(join.message.resumeTokenSha256, proofJoin.resumeTokenSha256);
  assert.equal(wire.some(({ direction, clientId: recordClientId, message }) => (
    direction === 'sent' && recordClientId === clientId && message.type === 'inputBatch'
  )), true, `${clientId} sent input`);
  assert.equal(wire.some(({ direction, clientId: recordClientId, message }) => (
    direction === 'received' && recordClientId === clientId && message.type === 'inputAck'
  )), true, `${clientId} received input ack`);
}
const resumedJoin = wire.find(({ direction, clientId, message }) => (
  direction === 'received'
  && clientId === 'client-0'
  && message.type === 'joinAccepted'
  && message.connectionMode === 'resumed'
));
assert.notEqual(resumedJoin, undefined);
assert.equal(resumedJoin.message.playerId, proof.authority.initialJoins[0].playerId);
assert.equal(resumedJoin.message.matchId, proof.authority.matchId);
assert.equal(resumedJoin.message.resumeTokenSha256, proof.resume.rotatedResumeTokenSha256);
for (const clientId of ['client-0', 'client-1']) {
  assert.equal(wire.some(({ direction, clientId: recordClientId, message }) => (
    direction === 'received'
    && recordClientId === clientId
    && message.type === 'reliableEventBatch'
    && message.events.some(({ kind }) => kind === 'playerKilled')
  )), true, `${clientId} reliable playerKilled`);
  assert.equal(wire.filter(({ direction, clientId: recordClientId, message }) => (
    direction === 'received'
    && recordClientId === clientId
    && message.type === 'reliableEventBatch'
    && message.events.some((event) => (
      event.presentation?.eventId === proof.combat.teleport.reliableEvent.presentation.eventId
      && event.presentation.kind === 'teleport_resource_confirmed'
    ))
  )).length, 1, `${clientId} reliable teleport confirmation occurrence`);
}

assert.equal(manifest.schemaVersion, 1);
const expectedArtifacts = [
  ...expectedScreenshots,
  'p515-normalized-wire-log.jsonl',
  'p515-product-population-proof.json',
  ...(traversalWarning === null ? [] : ['p515-traversal-collision-warning.json']),
].sort();
assert.deepEqual(Object.keys(manifest.files).sort(), expectedArtifacts);
for (const [relative, entry] of Object.entries(manifest.files)) {
  const absolute = path.join(output, relative);
  const stat = await fs.stat(absolute);
  assert.equal(stat.size, entry.bytes, `${relative} bytes`);
  assertSha256(entry.sha256, `${relative} manifest digest`);
  assert.equal(await sha256(absolute), entry.sha256, `${relative} hash`);
}
assert.deepEqual(Object.keys(proof.sourceSha256), expectedSourceFiles);
for (const [relative, expectedHash] of Object.entries(proof.sourceSha256)) {
  assertSha256(expectedHash, `${relative} source digest`);
  assert.equal(await sha256(path.join(repo, relative)), expectedHash, `${relative} source hash`);
}

const verification = {
  schemaVersion: 1,
  phase: 'P5.15',
  verifiedAt: new Date().toISOString(),
  status: 'PASS',
  runtime: path.relative(repo, output).replaceAll('\\', '/'),
  checks: {
    productClients: 8,
    isolatedBrowserContexts: 8,
    distinctBrowserProcesses: true,
    exactProfile: PROFILE,
    exactMapReference: expectedMapBinding.mapReference,
    exactInitialSpawns: 8,
    commonPopulationAuthorityTicks: [
      proof.populations.two.commonAuthorityTick,
      proof.populations.four.commonAuthorityTick,
      proof.populations.eight.commonAuthorityTick,
    ],
    sharedAuthorityClockProof: 'server_owned_room_wide_shotAccepted_reliable_event',
    perConnectionSnapshotCadencePreserved: true,
    atLeastOnceReliableTransportWithExactlyOnceLogicalApplication: true,
    snapshotAcksRejected: finalTransport.snapshotAcksRejected,
    snapshotAckDebtEvictions: finalTransport.snapshotAckDebtEvictions,
    snapshotAckDebtRecoveries: finalTransport.snapshotAckDebtRecoveries,
    maximumSnapshotAckDebtMilliseconds: finalTransport.maximumSnapshotAckDebtMilliseconds,
    localPredictionAndPeerInterpolation: true,
    realCollisionOcclusion: true,
    canonicalTraversalRecoveries: proof.movementAndWorld.driverRecoveries.length,
    traversalCollisionWarning: traversalWarning !== null,
    supportsG5NoSnagAcceptance: false,
    authoritativeDamageDeathScoreFeed: true,
    confirmedBodyAndKillPresentationMarkers: true,
    confirmedTeleportPresentationMarker: true,
    shieldProfileDefaultZeroWithoutSyntheticCue: true,
    presentationReplaySuppression: true,
    reliableKillDeliveryClients: 2,
    resumeIdentityAndStatePreserved: true,
    resumeTokenRotatedAndRedacted: true,
    mismatchFailedClosedBeforeSocket: true,
    wireEntries: wire.length,
    artifactHashes: Object.keys(manifest.files).length,
    sourceHashes: Object.keys(proof.sourceSha256).length,
    g3Claimed: false,
    g4Claimed: false,
    g5Claimed: false,
    humanVisualApprovalClaimed: false,
  },
  proofSha256: await sha256(proofPath),
  manifestSha256: await sha256(manifestPath),
  wireSha256: await sha256(wireLogPath),
};
await fs.writeFile(
  path.join(output, 'independent-verification.json'),
  `${JSON.stringify(verification, null, 2)}\n`,
  { flag: 'wx' },
);
console.log(JSON.stringify(verification, null, 2));
