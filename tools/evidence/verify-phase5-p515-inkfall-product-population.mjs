import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REV2_PROFILE = 'p511-inkfall-foundry-revision-2-combat-v1';
const REV4_PROFILE = 'g5-inkfall-foundry-rev4-revision-3-authority-v1';
const requestedProfileArgument = process.argv.find((argument) => argument.startsWith('--profile='));
const PROFILE = requestedProfileArgument?.slice('--profile='.length) ?? REV2_PROFILE;
const requestedPresentationArgument = process.argv.find(
  (argument) => argument.startsWith('--presentation='),
);
const PRESENTATION = requestedPresentationArgument?.slice('--presentation='.length)
  ?? 'rev4';
assert.ok(
  PROFILE === REV2_PROFILE || PROFILE === REV4_PROFILE,
  `Unsupported Inkfall evidence profile: ${PROFILE}`,
);
assert.ok(
  PRESENTATION === 'rev4' || PRESENTATION === 'rev5',
  `Unsupported Inkfall evidence presentation: ${PRESENTATION}`,
);
assert.ok(
  PRESENTATION !== 'rev5' || PROFILE === REV4_PROFILE,
  'Rev5 presentation evidence requires the Revision 3 G5 authority profile',
);
const REV4_ACCEPTANCE_CAPTURE = PROFILE === REV4_PROFILE;
const REV5_PRESENTATION_CAPTURE =
  REV4_ACCEPTANCE_CAPTURE && PRESENTATION === 'rev5';
const FLAT_COMBAT_PROFILE = 'p58d-rev3-combat-v1';
const AUTHORITY_WEBSOCKET_ORIGIN = 'ws://127.0.0.1:8787';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const revision3Package = JSON.parse(await fs.readFile(
  path.join(
    repo,
    'assets/source/maps/inkfall-foundry/revisions/revision-3/runtime/map.package.v3.json',
  ),
  'utf8',
));
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

const rev2ExpectedSpawns = [
  { spawnId: 'spawn_w_press_a', set: 'west_team', feetPosition: { x: -33_500, y: 0, z: -3_500 }, yawMilliDegrees: 0 },
  { spawnId: 'spawn_e_press_a', set: 'east_team', feetPosition: { x: 33_500, y: 0, z: 3_500 }, yawMilliDegrees: 180_000 },
  { spawnId: 'spawn_w_press_b', set: 'west_team', feetPosition: { x: -33_500, y: 0, z: 3_500 }, yawMilliDegrees: 0 },
  { spawnId: 'spawn_e_press_b', set: 'east_team', feetPosition: { x: 33_500, y: 0, z: -3_500 }, yawMilliDegrees: 180_000 },
  { spawnId: 'spawn_w_ink', set: 'west_team', feetPosition: { x: -30_500, y: 0, z: -7_000 }, yawMilliDegrees: -25_000 },
  { spawnId: 'spawn_e_ink', set: 'east_team', feetPosition: { x: 30_500, y: 0, z: -7_000 }, yawMilliDegrees: -155_000 },
  { spawnId: 'spawn_w_archive', set: 'west_team', feetPosition: { x: -30_500, y: 0, z: 7_000 }, yawMilliDegrees: 25_000 },
  { spawnId: 'spawn_e_archive', set: 'east_team', feetPosition: { x: 30_500, y: 0, z: 7_000 }, yawMilliDegrees: 155_000 },
];
const rev2ExpectedMapBinding = {
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
  spawns: rev2ExpectedSpawns,
};
const rev4SpawnOrder = [
  'spawn_w_press_a', 'spawn_e_press_a', 'spawn_w_press_b', 'spawn_e_press_b',
  'spawn_w_ink', 'spawn_e_ink', 'spawn_w_archive', 'spawn_e_archive',
  'spawn_dm_ink_w', 'spawn_dm_ink_e', 'spawn_dm_archive_w', 'spawn_dm_archive_e',
];
const revision3SpawnsById = new Map(revision3Package.spawns.map((spawn) => [spawn.id, spawn]));
const rev4ExpectedSpawns = rev4SpawnOrder.map((spawnId) => {
  const spawn = revision3SpawnsById.get(spawnId);
  assert.notEqual(spawn, undefined, `Revision 3 spawn ${spawnId}`);
  return {
    spawnId: spawn.id,
    set: spawn.set,
    feetPosition: { ...spawn.feetPositionMm },
    yawMilliDegrees: spawn.yawMilliDegrees,
    escapeRouteFamilies: [...spawn.escapeRouteFamilies],
    validationStatus: spawn.validationStatus,
  };
});
const rev4ExpectedMapBinding = {
  mapReference: 'inkfall_foundry@3',
  presentationReference:
    'inkfall_foundry@3/press_archive/v4.1/spatial-material-joined',
  mapId: 'inkfall_foundry',
  mapRevision: 3,
  packageDigest: '260b90de2e0c2d51fa01e166d11401a04a1cb76943042de9993e85560e37f39a',
  fixtureId: 'inkfall_foundry_map_collision',
  fixtureHash: '6cf785c5171f2ff5',
  xAxis: 'east',
  yAxis: 'up',
  zAxis: 'north',
  origin: 'press_core_floor_contact',
  gltfToMap: 'x_y_negative_z',
  distanceUnit: 'millimeters',
  angleUnit: 'milli_degrees',
  colliderCardinality: 339,
  render: {
    role: 'render_only',
    path:
      'art-kit/press-archive-rev4/rev4/export/inkfall_foundry_press_archive_rev4.spatial-material-joined.glb',
    sha256: '5e2aa22cc598f49181524ce78b481adf091f71a91a823171277963de11d4db00',
    bytes: 12_954_608,
    renderMeshesMayBeAuthority: false,
  },
  collision: {
    role: 'authority_collision',
    path: 'revisions/revision-3/export/collision.authority.glb',
    sha256: '1cce637ab4f83766627527b3885c3e9da819d8bcabdfa2144f8dc6b46bc5bba8',
    bytes: 605_112,
  },
  supportedModes: ['deathmatch', 'team_deathmatch'],
  spawns: rev4ExpectedSpawns,
  zones: revision3Package.zones.map((zone) => ({
    zoneId: zone.id,
    callout: zone.callout,
    family: zone.family,
    center: { ...zone.centerMm },
    halfExtents: { ...zone.halfExtentsMm },
  })),
  pickups: [],
  triggers: revision3Package.triggers,
  telemetry: {
    schemaVersion: 1,
    authoritySource: 'durable_object_room_metrics_v1',
    counters: [
      'connectedPlayers', 'receivedCommands', 'rejectedCommands',
      'resumeSuccesses', 'authorityTickExecution', 'transport',
    ],
    zoneCount: 9,
    pickupCount: 0,
  },
};
const rev5ExpectedMapBinding = {
  ...rev4ExpectedMapBinding,
  presentationReference:
    'inkfall_foundry@3/press_archive/v5.0/geometry-portal-modular',
  render: {
    role: 'render_only',
    path:
      'art-kit/press-archive-rev5/rev5/export/inkfall_foundry_rev5_geometry_portal.render-only-modules.glb',
    sha256: '7bd3d5be1ca8019492b58c2dff92a307d30ec77996e978e662bac85dbec0d676',
    bytes: 2_803_128,
    renderMeshesMayBeAuthority: false,
  },
  portal: {
    capabilityId: 'inkfall_rev5_linked_world_portal_v1',
    authorityRole: 'additive_server_authority',
    renderRole: 'rev5_render_only_no_hit',
    endpointCount: 2,
  },
};
const expectedSpawns = REV4_ACCEPTANCE_CAPTURE
  ? rev4ExpectedSpawns.slice(0, 8)
  : rev2ExpectedSpawns;
const expectedSpawnsById = new Map(expectedSpawns.map((spawn) => [spawn.spawnId, spawn]));
const expectedMapBinding = REV5_PRESENTATION_CAPTURE
  ? rev5ExpectedMapBinding
  : REV4_ACCEPTANCE_CAPTURE
    ? rev4ExpectedMapBinding
    : rev2ExpectedMapBinding;
const expectedSimulationIdentity = {
  schemaVersion: 1,
  mapId: 'inkfall_foundry',
  rulesetId: 'revamped_classic',
  rulesetRevision: 3,
  rulesetHash: REV5_PRESENTATION_CAPTURE
    ? '69b19f19a19de288'
    : 'd5f0418d1d927370',
  movementProfileId: 'phase3_hypothesis_v1',
  movementProfileRevision: 1,
  movementProfileHash: '8ab4ed437a4393c0',
  fixtureId: 'inkfall_foundry_map_collision',
  fixtureHash: expectedMapBinding.fixtureHash,
  physicsAdapterId: 'rapier3d_deterministic_compat',
  physicsAdapterVersion: '0.19.3',
};
const rev5PortalRoute = {
  lowerApproach: { x: -4_500, z: -12_500 },
  lowerEntryTarget: { x: -4_000, z: -10_000 },
  lowerExit: { x: 1_539, y: 1_431, z: -4_461 },
  upperEntryTarget: { x: 1_000, z: -5_000 },
  upperExit: { x: -4_500, y: -3_000, z: -12_500 },
  arrivalToleranceMillimeters: 1_100,
  eventTimeoutMilliseconds: 8_000,
  cooldownSettleMilliseconds: 1_500,
};
const legacyExpectedScreenshots = [
  'screenshots/p515-01-client-0-two-rendered.png',
  'screenshots/p515-02-client-1-two-rendered.png',
  'screenshots/p515-03-real-occlusion.png',
  'screenshots/p515-04-confirmed-body-hit.png',
  'screenshots/p515-04a-grenade-throw-accepted.png',
  'screenshots/p515-04b-grenade-collision-fuse.png',
  'screenshots/p515-04c-grenade-impulse-confirmed.png',
  'screenshots/p515-05-authoritative-death-score.png',
  'screenshots/p515-06-confirmed-teleport.png',
  'screenshots/p515-07-resume-preserved-state.png',
  'screenshots/p515-08-four-product-clients.png',
  'screenshots/p515-09-eight-product-clients.png',
  'screenshots/p515-10-profile-mismatch-fails-closed.png',
  'screenshots/p515-11-runtime-evidence-board.png',
];
const expectedScreenshots = REV5_PRESENTATION_CAPTURE
  ? [
      ...legacyExpectedScreenshots,
      'screenshots/p515-03a-rev5-lower-portal-approach.png',
      'screenshots/p515-03b-rev5-upper-portal-arrival.png',
    ]
  : legacyExpectedScreenshots;
const legacyExpectedSourceFiles = [
  'src/app/onlineAuthorityProfiles.ts',
  'src/app/onlineAuthorityGateway.ts',
  'src/app/onlineAuthorityInkfallWorld.ts',
  'src/app/onlineAuthorityRoute.ts',
  'src/app/inkfallRev4CandidateBinding.ts',
  'src/app/inkfallRev4CandidateTraversal.ts',
  'src/app/inkfallRev3ReviewAudit.ts',
  'src/dev/authorityEvidenceClient.ts',
  'src/dev/authorityEvidenceModel.ts',
  'src/dev/authorityEvidenceTransport.ts',
  'src/client/combat/presentationAdapter.ts',
  'src/client/netcode/localPrediction.ts',
  'src/client/netcode/remoteInterpolation.ts',
  'src/authority/room.ts',
  'src/authority/fixedTickScheduler.ts',
  'src/authority/combat/abilityResources.ts',
  'src/authority/combat/autoRifle.ts',
  'src/authority/combat/impulseGrenade.ts',
  'src/authority/combat/index.ts',
  'src/authority/combat/inkfallRapierCombatWorld.ts',
  'src/authority/combat/life.ts',
  'src/authority/combat/loadoutRequest.ts',
  'src/authority/combat/poseHistory.ts',
  'src/authority/combat/rewindHitscan.ts',
  'src/authority/combat/strictCombatData.ts',
  'src/authority/combat/tdmMatch.ts',
  'src/physics/collisionLayers.ts',
  'src/physics/fixtureSchema.ts',
  'src/physics/fixtures/catalog.ts',
  'src/physics/fixtures/flatRun.ts',
  'src/physics/rapier/contracts.ts',
  'src/physics/rapier/runtime.ts',
  'src/physics/rapier/world.ts',
  'src/net/protocol.ts',
  'src/net/schemas.ts',
  'src/sim/index.ts',
  'src/sim/canonical.ts',
  'src/sim/commands.ts',
  'src/sim/rng.ts',
  'src/sim/state.ts',
  'src/sim/step.ts',
  'src/sim/tickClock.ts',
  'src/sim/units.ts',
  'src/sim/movement/canonical.ts',
  'src/sim/movement/controller.ts',
  'src/sim/movement/events.ts',
  'src/sim/movement/fixedMath.ts',
  'src/sim/movement/hash.ts',
  'src/sim/movement/index.ts',
  'src/sim/movement/profile.ts',
  'src/sim/movement/profileIdentity.ts',
  'src/sim/movement/queryPort.ts',
  'src/sim/movement/replay.ts',
  'src/sim/movement/state.ts',
  'assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.p5-10.v1.json',
  'assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.g5-revision3.v1.json',
  'assets/source/maps/inkfall-foundry/revisions/revision-3/runtime/map.package.v3.json',
  'assets/source/maps/inkfall-foundry/revisions/revision-3/export/collision.authority.glb',
  'assets/source/maps/inkfall-foundry/art-kit/press-archive-rev4/rev4/export/inkfall_foundry_press_archive_rev4.spatial-material-joined.glb',
  'worker/combatRuntime.ts',
  'worker/env.ts',
  'worker/rapierRuntime.ts',
  'worker/reliableEvents.ts',
  'worker/resumeSessions.ts',
  'worker/room.ts',
  'worker/routes.ts',
  'worker/security.ts',
  'worker/snapshotBaselines.ts',
  'worker/worker.ts',
  'tests/worker/protocolV2Socket.test.ts',
  'tests/worker/socketAttachmentCache.test.ts',
  'tests/worker/slowConsumerBackpressure.test.ts',
  'tests/worker/inkfallPopulation.test.ts',
  'tests/worker/combatPresentationProjection.test.ts',
  'tests/worker/combatRev3.test.ts',
  'tests/worker/inkfallRev2CombatProfile.test.ts',
  'tests/integration/physics/inkfallRev4AuthorityProfile.test.ts',
  'tests/integration/physics/inkfallRev4CandidateBinding.test.ts',
  'tests/integration/movement/inkfallRev3ReviewAudit.test.ts',
  'tests/integration/authority/inkfallAuthorityPlaytest.test.ts',
  'tests/integration/movement/inkfallCanonicalTraversalSnag.test.ts',
  'tests/unit/authority/combat/impulseGrenade.test.ts',
  'tests/unit/authority/combat/roomImpulseGrenadeIntegration.test.ts',
  'tests/unit/authority/fixedTickScheduler.test.ts',
  'tests/unit/authority/combat/roomCombatIntegration.test.ts',
  'tests/unit/client/combat/presentationWireBridge.test.ts',
  'tests/unit/dev/authorityEvidence.test.ts',
  'tests/unit/net/combatPresentationReliableEvent.test.ts',
  'tests/unit/net/protocol-v2.test.ts',
  'tests/unit/worker/reliableEvents.test.ts',
  'tests/unit/worker/security.test.ts',
  'assets/source/maps/inkfall-foundry/inkfall-foundry.layout-seed.v1.json',
  'evidence/2026-07-22/phase-5-p5-15/runtime-v10/p515-canonical-traversal-defect.json',
  '.env.production',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'public/_headers',
  'tsconfig.json',
  'tsconfig.worker.json',
  'vite.config.js',
  'wrangler.jsonc',
  'tools/evidence/capture-phase5-p515-inkfall-product-population.mjs',
  'tools/evidence/verify-phase5-p515-inkfall-product-population-failure.mjs',
  'tools/evidence/verify-phase5-p515-inkfall-product-population.mjs',
];
const rev5ExpectedSourceFiles = [
  ...legacyExpectedSourceFiles.filter((relative) => (
    relative
      !== 'assets/source/maps/inkfall-foundry/art-kit/press-archive-rev4/rev4/export/inkfall_foundry_press_archive_rev4.spatial-material-joined.glb'
  )),
  'assets/source/maps/inkfall-foundry/art-kit/press-archive-rev5/build_press_archive_rev5.py',
  'assets/source/maps/inkfall-foundry/art-kit/press-archive-rev5/rev5/export/inkfall_foundry_rev5_geometry_portal.render-only-modules.glb',
  'assets/source/maps/inkfall-foundry/art-kit/press-archive-rev5/rev5/manifest.inkfall-rev5-geometry-portal.json',
  'assets/source/maps/inkfall-foundry/art-kit/press-archive-rev5/rev5/validation/inkfall-rev5-geometry-portal-build-report.json',
  'src/app/inkfallRev5CandidateBinding.ts',
  'src/app/inkfallRev5PortalPresentation.ts',
  'src/app/inkfallRev5VisualContinuity.ts',
  'src/app/onlineAuthorityThreeRuntime.ts',
  'src/authority/portal/inkfallRev5PortalAuthority.ts',
  'src/dev/loadInkfallRev5ReviewVisual.ts',
  'tests/unit/authority/portal/inkfallRev5PortalAuthority.test.ts',
].sort();
const expectedSourceFiles = REV5_PRESENTATION_CAPTURE
  ? rev5ExpectedSourceFiles
  : legacyExpectedSourceFiles;

async function sha256(file) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

function assertSha256(value, label) {
  assert.match(value, /^[0-9a-f]{64}$/u, label);
}

function normalizeYawMilliDegrees(value) {
  return ((value % 360_000) + 360_000) % 360_000;
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
  assert.equal(stimulus.firePulseMilliseconds, 0);
  assert.equal(stimulus.inputEdgeMode, 'latched_press_release');
  assert.ok(Number.isInteger(stimulus.inputEdgeProof.preStimulusInputSequence));
  assert.equal(stimulus.inputEdgeProof.uniquePrimaryFirePressedCommands, 1);
  assert.equal(stimulus.inputEdgeProof.uniquePrimaryFireReleasedCommands, 1);
  assert.equal(stimulus.inputEdgeProof.pressCommand.held, true);
  assert.equal(stimulus.inputEdgeProof.pressCommand.pressed, true);
  assert.equal(stimulus.inputEdgeProof.pressCommand.released, false);
  assert.equal(stimulus.inputEdgeProof.releaseCommand.held, false);
  assert.equal(stimulus.inputEdgeProof.releaseCommand.pressed, false);
  assert.equal(stimulus.inputEdgeProof.releaseCommand.released, true);
  assert.ok(
    stimulus.inputEdgeProof.pressCommand.sequence
      > stimulus.inputEdgeProof.preStimulusInputSequence,
  );
  assert.ok(
    stimulus.inputEdgeProof.releaseCommand.sequence
      > stimulus.inputEdgeProof.pressCommand.sequence,
  );
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
  assert.equal(population.frameProfiles.length, count);
  assert.equal(new Set(population.frameProfiles.map(({ clientId }) => clientId)).size, count);
  for (const frameProfile of population.frameProfiles) {
    assert.equal(frameProfile.population, count);
    assert.equal(frameProfile.sampleCount, 120);
    assert.ok(Number.isFinite(frameProfile.measurementDurationMilliseconds));
    assert.ok(frameProfile.measurementDurationMilliseconds > 0);
    for (const field of [
      'meanFrameMilliseconds',
      'p50FrameMilliseconds',
      'p95FrameMilliseconds',
      'p99FrameMilliseconds',
      'maximumFrameMilliseconds',
      'estimatedFramesPerSecond',
    ]) {
      assert.ok(Number.isFinite(frameProfile[field]), `${field} finite`);
      assert.ok(frameProfile[field] > 0, `${field} positive`);
    }
    assert.ok(Number.isInteger(frameProfile.framesOver33Milliseconds));
    assert.ok(Number.isInteger(frameProfile.framesOver50Milliseconds));
    assert.ok(Array.isArray(frameProfile.longTasks));
    assert.ok(Number.isInteger(frameProfile.hardwareConcurrency));
    assert.ok(Date.parse(frameProfile.capturedAt) > 0);
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
  const expectedHudCopy = {
    body: 'BODY HIT',
    kill: 'ELIMINATION',
    grenade_impulse: 'DISPLACEMENT',
    teleport: 'TELEPORT',
  }[cue];
  assert.equal(typeof expectedHudCopy, 'string');
  assert.match(value.hud.text, new RegExp(expectedHudCopy, 'u'));
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
const performanceChecksPassed = Object.values(proof.performance.checks).every(Boolean);
const technicalAcceptanceChecksPassed =
  Object.values(proof.technicalAcceptance.checks).every(Boolean);
const expectedRev4Status = !performanceChecksPassed
  ? 'RUNTIME_PERFORMANCE_BOUND_EXCEEDED'
  : technicalAcceptanceChecksPassed
    ? 'ACCEPTANCE_CANDIDATE'
    : 'RUNTIME_TRAVERSAL_COLLISION_BLOCKED';
const expectedRev4GateClaim = !performanceChecksPassed
  ? 'G5_BLOCKED_BY_LOCAL_RUNTIME_PERFORMANCE'
  : technicalAcceptanceChecksPassed
    ? 'G5_TECHNICAL_ACCEPTANCE_CANDIDATE_HUMAN_REVIEW_PENDING'
    : 'G5_BLOCKED_BY_RUNTIME_TRAVERSAL_COLLISION';
assert.equal(proof.status, REV4_ACCEPTANCE_CAPTURE ? expectedRev4Status : 'BOUNDED_PASS');
assert.equal(
  proof.gateClaim,
  REV4_ACCEPTANCE_CAPTURE
    ? expectedRev4GateClaim
    : 'G3_G4_ACCEPTANCE_CANDIDATE_G5_NOT_CLAIMED',
);

assert.equal(proof.topology.route, '/online');
assert.equal(proof.topology.exactProfile, PROFILE);
if (REV5_PRESENTATION_CAPTURE) {
  assert.equal(proof.topology.exactPresentation, PRESENTATION);
} else {
  assert.ok(
    proof.topology.exactPresentation === undefined
      || proof.topology.exactPresentation === PRESENTATION,
  );
}
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
  const expectedSpawn = expectedSpawnsById.get(join.spawnId);
  assert.notEqual(expectedSpawn, undefined, `${join.clientId} locked spawn identity`);
  assert.equal(join.clientId, `client-${index}`);
  assertSha256(join.resumeTokenSha256, `${join.clientId} token digest`);
  assert.ok(Number.isInteger(join.serverTick) && join.serverTick >= 0);
  assert.deepEqual(join.feetPosition, expectedSpawn.feetPosition);
  assert.equal(
    normalizeYawMilliDegrees(join.yawMilliDegrees),
    normalizeYawMilliDegrees(expectedSpawn.yawMilliDegrees),
  );
  assert.equal(join.teamId, index % 2 === 0 ? 'team_blue' : 'team_red');
  assert.equal(join.spawnSet, join.teamId === 'team_blue' ? 'west_team' : 'east_team');
  assert.deepEqual(join.escapeRouteFamilies, expectedSpawn.escapeRouteFamilies ?? []);
  assert.equal(join.validationStatus, expectedSpawn.validationStatus ?? null);
}
assert.deepEqual(
  [...new Set(proof.authority.initialJoins.map(({ spawnId }) => spawnId))].sort(),
  expectedSpawns.map(({ spawnId }) => spawnId).sort(),
);
assert.equal(proof.authority.spawnSelection.schemaVersion, 1);
assert.equal(
  proof.authority.spawnSelection.strategy,
  'rev3_authority_enemy_distance_fixture_occluded_los_v1',
);
assert.equal(
  proof.authority.spawnSelection.authorityBoundary,
  'server_state_and_authority_collision_only',
);
assert.equal(proof.authority.spawnSelection.clientPositionOrScoreAccepted, false);
assert.equal(proof.authority.spawnSelection.lockedSpawnIdentityCount, 12);
assert.ok(proof.authority.spawnSelection.decisionCount >= 8);
assert.equal(proof.authority.spawnSelection.fallbackCount, 0);
assert.ok(proof.authority.spawnSelection.decisions.every((decision) => (
  expectedMapBinding.spawns.some(({ spawnId }) => spawnId === decision.selectedSpawnId)
  && decision.status === 'selected'
  && decision.fallbackMode === 'none'
  && decision.selectedStandingOccluded
  && decision.selectedCrouchedOccluded
)));
assert.ok(proof.authority.initialJoins.every(({ spawnId }) => (
  proof.authority.spawnSelection.decisions.some(
    (decision) => decision.selectedSpawnId === spawnId,
  )
)));

assertPopulation(proof.populations.two, 2, proof.authority.roomCode, proof.authority.matchId);
assertPopulation(proof.populations.four, 4, proof.authority.roomCode, proof.authority.matchId);
assertPopulation(proof.populations.eight, 8, proof.authority.roomCode, proof.authority.matchId);
assert.equal(proof.populations.two.tickStimulus.driverClientId, 'client-0');
assert.equal(proof.populations.four.tickStimulus.driverClientId, 'client-2');
assert.equal(proof.populations.eight.tickStimulus.driverClientId, 'client-6');
assert.ok(proof.populations.two.commonAuthorityTick < proof.populations.four.commonAuthorityTick);
assert.ok(proof.populations.four.commonAuthorityTick < proof.populations.eight.commonAuthorityTick);
assert.equal(proof.performance.scope, 'local_headless_system_chrome_active_client_capture_not_shipping_hardware');
assert.equal(proof.performance.frameSamples, 1_680);
assert.deepEqual(proof.performance.profiledClientPopulations, { two: 2, four: 4, eight: 8 });
assert.equal(proof.performance.checks.frameSampleCardinality, true);
assert.equal(
  proof.performance.checks.p95WithinBound,
  proof.performance.maximumP95FrameMilliseconds
    <= proof.performance.thresholds.maximumP95FrameMilliseconds,
);
assert.equal(
  proof.performance.checks.p99WithinBound,
  proof.performance.maximumP99FrameMilliseconds
    <= proof.performance.thresholds.maximumP99FrameMilliseconds,
);
assert.equal(
  proof.performance.checks.maximumFrameWithinBound,
  proof.performance.maximumObservedFrameMilliseconds
    <= proof.performance.thresholds.maximumObservedFrameMilliseconds,
);
assert.equal(
  proof.performance.checks.reliableDeliveryWithinBound,
  proof.performance.maximumReliableDeliveryLatencyMilliseconds
    <= proof.performance.thresholds.maximumReliableDeliveryLatencyMilliseconds,
);
assert.equal(proof.performance.allChecksPassed, performanceChecksPassed);
assert.deepEqual(proof.technicalAcceptance.checks, {
  ...proof.performance.checks,
  traversalCompletedWithoutDriverRecovery:
    proof.movementAndWorld.driverRecoveries.length === 0,
  ...(REV5_PRESENTATION_CAPTURE
    ? {
        portalRoundTripAuthoritative:
          proof.movementAndWorld.portalRoundTrip?.allChecksPassed === true,
      }
    : {}),
});
assert.equal(
  proof.technicalAcceptance.allChecksPassed,
  technicalAcceptanceChecksPassed,
);
assert.equal(proof.technicalAcceptance.humanReviewStillRequired, true);

assert.equal(proof.movementAndWorld.routeId, 'alternate_ink_channel_after_press_cross_snag');
assert.equal(proof.movementAndWorld.routeCheckpoints.length, 9);
assert.equal(proof.movementAndWorld.spawnProtectionExpiryWaitMilliseconds, 1_500);
if (REV5_PRESENTATION_CAPTURE) {
  const portalRoundTrip = proof.movementAndWorld.portalRoundTrip;
  assert.notEqual(portalRoundTrip, null);
  assert.deepEqual(portalRoundTrip.route, rev5PortalRoute);
  assert.equal(portalRoundTrip.actorId, proof.authority.initialJoins[0].playerId);
  assert.equal(portalRoundTrip.exactCapability, true);
  assert.equal(portalRoundTrip.exactHooks, true);
  assert.equal(portalRoundTrip.allChecksPassed, true);
  assert.ok(
    portalRoundTrip.lower.landing.distanceMillimeters
      <= rev5PortalRoute.arrivalToleranceMillimeters,
  );
  assert.ok(
    portalRoundTrip.upper.landing.distanceMillimeters
      <= rev5PortalRoute.arrivalToleranceMillimeters,
  );
  for (const [leg, endpointId, partnerEndpointId] of [
    [portalRoundTrip.lower, 'red_fold_lower', 'red_fold_upper'],
    [portalRoundTrip.upper, 'red_fold_upper', 'red_fold_lower'],
  ]) {
    assert.equal(leg.deliveries.length, 2);
    assert.deepEqual(
      leg.deliveries.map(({ clientId }) => clientId),
      ['client-0', 'client-1'],
    );
    for (const delivery of leg.deliveries) {
      assert.ok(
        delivery.latencyMilliseconds >= 0
          && delivery.latencyMilliseconds
            <= rev5PortalRoute.eventTimeoutMilliseconds,
      );
      assert.ok(delivery.rawOccurrenceCount >= 1);
      assert.equal(delivery.logicalApplicationCount, 1);
      assert.equal(delivery.event.kind, 'worldPortalTraversed');
      assert.equal(delivery.event.actorId, portalRoundTrip.actorId);
      assert.equal(
        delivery.event.presentation.kind,
        'world_portal_traversed',
      );
      assert.equal(delivery.event.presentation.endpointId, endpointId);
      assert.equal(
        delivery.event.presentation.partnerEndpointId,
        partnerEndpointId,
      );
      assert.equal(
        delivery.event.presentation.capabilityId,
        'inkfall_rev5_linked_world_portal_v1',
      );
      for (const hook of [
        'departureAudioHook',
        'arrivalAudioHook',
        'departureVfxHook',
        'arrivalVfxHook',
      ]) {
        assert.equal(typeof delivery.event.presentation[hook], 'string');
        assert.ok(delivery.event.presentation[hook].length > 0);
      }
    }
  }
} else {
  assert.ok(
    proof.movementAndWorld.portalRoundTrip === undefined
      || proof.movementAndWorld.portalRoundTrip === null,
  );
}
assert.ok(Array.isArray(proof.movementAndWorld.driverRecoveries));
assert.ok(proof.movementAndWorld.driverRecoveries.length <= 40);
for (const recovery of proof.movementAndWorld.driverRecoveries) {
  assert.equal(typeof recovery.label, 'string');
  assert.ok(recovery.recoveryKey === 'a' || recovery.recoveryKey === 'd');
  assert.equal(recovery.recoveryPolicy, 'strafe_toward_map_centerline_with_target_bias');
  assert.equal(Number.isFinite(recovery.recoveryScores.a), true);
  assert.equal(Number.isFinite(recovery.recoveryScores.d), true);
  assert.ok(recovery.distanceBeforeMillimeters > 0);
  assert.ok(Number.isInteger(recovery.yawBeforeMilliDegrees));
}
assert.ok(proof.movementAndWorld.crossAcceptedShotsAfter > proof.movementAndWorld.crossAcceptedShotsBefore);
assert.equal(proof.movementAndWorld.crossVictimHealthAfter, proof.movementAndWorld.crossVictimHealthBefore);
assert.equal(proof.movementAndWorld.realOcclusionBlockedCrossMapDamage, true);
for (const interpolation of [
  proof.movementAndWorld.fourInterpolation,
  proof.movementAndWorld.eightInterpolation,
]) {
  assert.ok(interpolation.movementMillimeters >= 500);
  assert.ok(interpolation.peerDistanceMillimeters <= 750);
  assert.ok(interpolation.remoteTransformMovementMillimeters >= 500);
  assert.ok(interpolation.observerActiveMovementMillimeters >= 500);
  assert.ok(interpolation.observerActiveModeObservedAfterMilliseconds <= 10_000);
  assert.ok(interpolation.requestedArrivalToleranceMillimeters > 0);
  assert.ok(interpolation.targetDistanceAfterSettlementMillimeters >= 0);
  assert.ok(interpolation.predictionToAuthorityDistanceAfterSettlementMillimeters <= 750);
  assert.ok(interpolation.predictionSettlementSamples >= 3);
  assert.ok(interpolation.predictionStableSamples >= 3);
  assert.ok(
    interpolation.predictionMaximumObservedErrorMillimeters
      >= interpolation.predictionToAuthorityDistanceAfterSettlementMillimeters,
  );
  assert.ok(interpolation.predictionSettledAfterMilliseconds <= 10_000);
  assert.ok(interpolation.observerConvergedAfterMilliseconds <= 10_000);
  assert.equal(
    interpolation.observerEntityId,
    proof.authority.initialJoins[
      Number.parseInt(interpolation.moverClientId.replace('client-', ''), 10)
    ].playerId,
  );
  assert.ok([
    'authoritative',
    'interpolated',
    'extrapolated',
    'held',
  ].includes(interpolation.observerInterpolationMode));
  assert.ok([
    'authoritative',
    'interpolated',
    'extrapolated',
    'held',
    'stale',
  ].includes(interpolation.observerFinalInterpolationMode));
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
assert.equal(proof.combat.playerKilledReliableDeliveryClientsAtEvent, 2);
assertConfirmedPresentation(proof.combat.confirmedPresentationAtDamage, 'body', 1);
const grenade = proof.combat.impulseGrenade;
assert.deepEqual(grenade.setupContract, {
  west: { x: 4_000, z: -15_000 },
  east: { x: 5_500, z: -15_000 },
  arrivalToleranceMillimeters: 100,
  minimumPulseMilliseconds: 40,
  settleMilliseconds: 750,
  maximumSeparationMillimeters: 2_000,
  rationale: 'Both players remain on the supported south Ink bridge centerline while the shooter holds the authority crouch stance and throws at -7.5 degrees on the bridge-aligned 14 degree yaw, trapping the projectile between the opposing guard rails so it detonates inside the 11 m radial impulse.',
});
assert.ok(grenade.setupConvergence.afterSeparationMillimeters <= 2_000);
assert.deepEqual(
  {
    targetYawMilliDegrees: grenade.aim.targetYawMilliDegrees,
    targetPitchMilliDegrees: grenade.aim.targetPitchMilliDegrees,
  },
  { targetYawMilliDegrees: 14_000, targetPitchMilliDegrees: -7_500 },
);
assert.ok(Math.abs(grenade.aim.finalYawMilliDegrees - 14_000) <= 800);
assert.ok(Math.abs(grenade.aim.finalPitchMilliDegrees - (-7_500)) <= 800);
assert.ok(Math.abs(grenade.aim.resetPitchMilliDegrees) <= 2_200);
assert.ok(grenade.aim.inputCommands.some(({ pitchMilliDegrees }) => pitchMilliDegrees < 0));
const grenadeAimWireCommands = wire.flatMap(({ clientId, sequence, direction, message }) => (
  clientId === 'client-0'
    && sequence >= grenade.aim.wireSequenceStart
    && sequence < grenade.wireSequenceStart
    && direction === 'sent'
    && message.type === 'inputBatch'
    ? message.lookCommands
    : []
));
assert.deepEqual(grenade.aim.inputCommands, grenadeAimWireCommands);
assert.deepEqual(
  {
    key: grenade.stance.key,
    buttonMask: grenade.stance.buttonMask,
  },
  { key: 'KeyC', buttonMask: 1 << 2 },
);
assert.ok(Number.isInteger(grenade.stance.wireSequenceStart));
assert.ok(Number.isInteger(grenade.stance.wireSequenceEnd));
assert.ok(grenade.stance.wireSequenceEnd > grenade.stance.wireSequenceStart);
assert.ok(grenade.stance.inputCommands.some(({ pressed, held }) => pressed && held));
assert.ok(grenade.stance.inputCommands.some(({ released, held }) => released && !held));
const grenadeStanceWireCommands = wire.flatMap(({ clientId, sequence, direction, message }) => (
  clientId === 'client-0'
    && sequence >= grenade.stance.wireSequenceStart
    && sequence < grenade.stance.wireSequenceEnd
    && direction === 'sent'
    && message.type === 'inputBatch'
    ? message.crouchCommands
    : []
));
assert.deepEqual(grenade.stance.inputCommands, grenadeStanceWireCommands);
assert.ok(Number.isInteger(grenade.wireSequenceStart) && grenade.wireSequenceStart >= 0);
assert.ok(Number.isFinite(grenade.requestedAtMilliseconds));
assert.equal(grenade.throwCountAfter - grenade.throwCountBefore, 1);
assert.ok(grenade.inputCommands.some(({ pressed }) => pressed));
assert.ok(grenade.inputCommands.some(({ released }) => released));
const grenadeWireInputCommands = wire.flatMap(({ clientId, sequence, direction, message }) => (
  clientId === 'client-0'
    && sequence >= grenade.wireSequenceStart
    && direction === 'sent'
    && message.type === 'inputBatch'
    ? message.impulseGrenadeCommands
    : []
));
assert.deepEqual(grenade.inputCommands, grenadeWireInputCommands);
assert.equal(grenade.projectileAtThrow.phase, 'active');
assert.equal(grenade.projectileAtThrow.ownerPlayerId, proof.authority.initialJoins[0].playerId);
assert.equal(grenade.projectileAtCollision.projectileId, grenade.projectileAtThrow.projectileId);
assert.ok(Number.isInteger(grenade.projectileAtCollision.fuseStartedAtTick));
assert.ok(Number.isInteger(grenade.projectileAtCollision.detonatesAtTick));
assert.equal(grenade.projectileRemovedAfterDetonation, true);
assert.equal(grenade.shooterHealthAfter, grenade.shooterHealthBefore);
assert.equal(grenade.victimHealthAfter, grenade.victimHealthBefore);
assert.ok(grenade.victimDisplacementMillimeters >= 100);
assert.notDeepEqual(grenade.victimPositionAfter, grenade.victimPositionBefore);

const grenadeExpectedKinds = [
  'impulse_grenade_throw_accepted',
  'impulse_grenade_collision',
  'impulse_grenade_detonated',
  'impulse_grenade_impulse_applied',
];
const grenadeSemanticKinds = grenade.semanticEvents.map(({ presentation }) => presentation.kind);
assert.ok(grenadeExpectedKinds.every((kind) => grenadeSemanticKinds.includes(kind)));
assert.equal(
  new Set(grenade.semanticEvents.map(({ presentation }) => presentation.eventId)).size,
  grenade.semanticEvents.length,
);
const grenadeProjectionKinds = {
  impulse_grenade_throw_accepted: 'projectileSpawned',
  impulse_grenade_collision: 'projectileCollided',
  impulse_grenade_detonated: 'projectileDetonated',
  impulse_grenade_impulse_applied: 'impulseApplied',
};
for (const event of grenade.semanticEvents) {
  const presentation = event.presentation;
  assert.equal(event.kind, grenadeProjectionKinds[presentation.kind]);
  assert.equal(event.subjectId, presentation.eventId);
  assert.equal(event.amountHealthPoints, null);
  if (presentation.kind === 'impulse_grenade_throw_accepted') {
    assert.equal(event.actorId, presentation.playerId);
    assert.equal(event.targetId, null);
    assert.equal(presentation.abilityId, 'vertical_impulse_grenade_v1');
    assert.equal(presentation.projectileId, grenade.projectileAtThrow.projectileId);
  } else if (presentation.kind === 'impulse_grenade_collision') {
    assert.equal(event.actorId, presentation.ownerPlayerId);
    assert.equal(event.targetId, presentation.playerId);
    assert.equal(presentation.projectileId, grenade.projectileAtThrow.projectileId);
    assert.ok(presentation.timeOfImpactPermille >= 0 && presentation.timeOfImpactPermille <= 1_000);
    assert.ok(presentation.detonatesAtTick >= presentation.fuseStartedAtTick);
  } else if (presentation.kind === 'impulse_grenade_detonated') {
    assert.equal(event.actorId, presentation.ownerPlayerId);
    assert.equal(event.targetId, null);
    assert.equal(presentation.areaRadiusMillimeters, 11_000);
    assert.equal(presentation.damageHealthPoints, 0);
  } else {
    assert.equal(event.actorId, presentation.ownerPlayerId);
    assert.equal(event.targetId, presentation.targetPlayerId);
    assert.equal(presentation.damageHealthPoints, 0);
    assert.ok(presentation.falloffPermille > 0 && presentation.falloffPermille <= 1_000);
    const appliedMagnitude = Math.hypot(
      presentation.appliedImpulseMillimetersPerSecond.x,
      presentation.appliedImpulseMillimetersPerSecond.y,
      presentation.appliedImpulseMillimetersPerSecond.z,
    );
    const requestedMagnitude = Math.hypot(
      presentation.requestedImpulseMillimetersPerSecond.x,
      presentation.requestedImpulseMillimetersPerSecond.y,
      presentation.requestedImpulseMillimetersPerSecond.z,
    );
    assert.ok(requestedMagnitude > 0);
    assert.ok(appliedMagnitude <= requestedMagnitude);
  }
}
assert.equal(grenade.throwReliableEvent.presentation.kind, 'impulse_grenade_throw_accepted');
assert.equal(grenade.collisionReliableEvent.presentation.kind, 'impulse_grenade_collision');
assert.equal(grenade.detonationReliableEvent.presentation.kind, 'impulse_grenade_detonated');
assert.ok(grenade.impulseReliableEvents.some(({ presentation }) => (
  presentation.targetPlayerId === proof.authority.initialJoins[1].playerId
  && presentation.relation === 'enemy'
  && Math.hypot(
    presentation.appliedImpulseMillimetersPerSecond.x,
    presentation.appliedImpulseMillimetersPerSecond.y,
    presentation.appliedImpulseMillimetersPerSecond.z,
  ) > 0
)));
assert.equal(grenade.logicalDeliveries.length, 2);
assert.deepEqual(grenade.logicalDeliveries.map(({ clientId }) => clientId), [
  'client-0',
  'client-1',
]);
for (const clientDelivery of grenade.logicalDeliveries) {
  assert.equal(clientDelivery.deliveries.length, grenade.semanticEvents.length);
  const clientWireEvents = wire.flatMap((record) => (
    record.clientId === clientDelivery.clientId
      && record.sequence >= grenade.wireSequenceStart
      && record.direction === 'received'
      && record.message.type === 'reliableEventBatch'
      ? record.message.events.filter(({ presentation }) => (
          presentation?.kind?.startsWith('impulse_grenade_')
        ))
      : []
  ));
  for (const delivery of clientDelivery.deliveries) {
    assert.ok(grenadeExpectedKinds.includes(delivery.semanticKind));
    assert.ok(delivery.wireOccurrences >= 1);
    assert.equal(delivery.logicalCueOccurrences, 1);
    assert.equal(
      delivery.wireOccurrences,
      clientWireEvents.filter(({ presentation }) => (
        presentation.eventId === delivery.eventId
      )).length,
    );
  }
}
assert.equal(grenade.presentationHistory.length, grenade.semanticEvents.length);
for (const cue of grenade.presentationHistory) {
  const semantic = grenade.semanticEvents.find(({ presentation }) => (
    presentation.eventId === cue.authorityEventId
  ));
  assert.notEqual(semantic, undefined);
  assert.equal(cue.renderedHud, true);
  assert.equal(cue.renderedVfx, true);
  assert.equal(cue.audioAttempted, true);
  assert.equal(typeof cue.vfxMarker, 'string');
  assert.equal(typeof cue.audioMarker, 'string');
  assert.equal(
    cue.source,
    semantic.presentation.kind === 'impulse_grenade_throw_accepted'
      ? 'accepted'
      : 'confirmed',
  );
}
assertConfirmedPresentation(grenade.confirmedPresentation, 'grenade_impulse', 4);
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
const finalMetrics = proof.transportDiagnostics.finalRoomMetrics.body.metrics;
const finalTransport = finalMetrics.transport;
assert.ok(finalMetrics.missedSchedulerTicks <= 60);
assert.ok(finalMetrics.maximumObservedQueueDepth <= 16);
assert.ok(
  finalMetrics.queryMetrics.shapeCasts
    <= finalMetrics.queryMetrics.moveCapsuleCalls * 4,
);
assert.equal(finalTransport.snapshotAcksRejected, 0);
assert.equal(finalTransport.snapshotAckDebtEvictions, 0);
assert.equal(finalTransport.reliableEventAcksRejected, 0);
assert.equal(finalTransport.snapshotHistoryFallbacks, 0);
assert.ok(finalTransport.snapshotAckDebtRecoveries >= 1);
assert.ok(
  finalTransport.maximumSnapshotAckDebtMilliseconds >= 0
    && finalTransport.maximumSnapshotAckDebtMilliseconds <= 1_000,
);
assert.ok(
  finalTransport.activeMatchCheckpointWrites
    <= Math.ceil(finalMetrics.serverTick / 10)
      + finalTransport.reliableEventsRecorded
      + 8,
);
assert.equal(proof.knownLimits.includes('This capture is bounded product/browser evidence, not broad playtest acceptance.'), true);
assert.equal(proof.knownLimits.includes(
  REV4_ACCEPTANCE_CAPTURE
    ? REV5_PRESENTATION_CAPTURE
      ? 'This capture supports a Rev5 G5 technical acceptance candidate; human visual and multiplayer review remain separate and G5 acceptance is not self-granted.'
      : 'This capture supports a G5 technical acceptance candidate; human visual and multiplayer review remain separate and G5 acceptance is not self-granted.'
    : 'This capture supports a bounded G3/G4 acceptance candidate; human acceptance remains separate and G5 is not claimed.',
), true);
assert.equal(proof.knownLimits.includes(
  `Inkfall revision-${expectedMapBinding.mapRevision} players begin with zero shield; no synthetic shield cue is manufactured.`,
), true);
assert.equal(proof.knownLimits.includes('Reliable event transport is at least once; raw retransmissions are disclosed and client dedupe is required for exactly-once logical application.'), true);
assert.equal(proof.knownLimits.includes(
  REV4_ACCEPTANCE_CAPTURE
    ? REV5_PRESENTATION_CAPTURE
      ? 'The Rev5 Ink Channel route and portal round trip are deterministic automation evidence, not a human traversal review.'
      : 'The separately executable Rev4 Press Hall to Paper Archive vertical route is deterministic automation evidence, not a human traversal review.'
    : 'Canonical press-cross traversal snag is retained in runtime-v10; this alternate route does not support G5 no-snag acceptance.',
), true);
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
assert.equal(proof.repositoryState.unchangedDuringCapture, true);
assert.deepEqual(proof.repositoryState.end, proof.repositoryState.start);
assert.match(proof.repositoryState.start.head, /^[0-9a-f]{40}$/u);
assertSha256(
  proof.repositoryState.start.statusSha256,
  'repository dirty-tree status digest',
);
assert.equal(typeof proof.repositoryState.start.status, 'string');
assert.equal(
  proof.repositoryState.start.excludedGeneratedOutput,
  path.relative(repo, output).replaceAll('\\', '/'),
);
assert.equal(typeof proof.runtimeEnvironment.nodeVersion, 'string');
assert.ok(proof.runtimeEnvironment.nodeVersion.startsWith('v'));
assert.equal(typeof proof.runtimeEnvironment.platform, 'string');
assert.equal(typeof proof.runtimeEnvironment.architecture, 'string');
assert.equal(typeof proof.runtimeEnvironment.nodeExecutable, 'string');
assert.deepEqual(
  proof.runtimeEnvironment.browserLaunchArguments,
  expectedBrowserLaunchArguments,
);

const verification = {
  schemaVersion: 1,
  phase: 'P5.15',
  verifiedAt: new Date().toISOString(),
  status: proof.status === 'ACCEPTANCE_CANDIDATE'
    ? 'EVIDENCE_INTEGRITY_VERIFIED_ACCEPTANCE_CANDIDATE'
    : proof.status === 'BOUNDED_PASS'
      ? 'EVIDENCE_INTEGRITY_VERIFIED_BOUNDED_EVIDENCE'
      : 'EVIDENCE_INTEGRITY_VERIFIED_BLOCKER',
  runtime: path.relative(repo, output).replaceAll('\\', '/'),
  checks: {
    productClients: 8,
    isolatedBrowserContexts: 8,
    distinctBrowserProcesses: true,
    exactProfile: PROFILE,
    exactMapReference: expectedMapBinding.mapReference,
    exactInitialSpawns: 8,
    frameSamples: proof.performance.frameSamples,
    maximumP95FrameMilliseconds: proof.performance.maximumP95FrameMilliseconds,
    maximumP99FrameMilliseconds: proof.performance.maximumP99FrameMilliseconds,
    maximumObservedFrameMilliseconds: proof.performance.maximumObservedFrameMilliseconds,
    maximumReliableDeliveryLatencyMilliseconds:
      proof.performance.maximumReliableDeliveryLatencyMilliseconds,
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
    missedSchedulerTicks: finalMetrics.missedSchedulerTicks,
    maximumObservedQueueDepth: finalMetrics.maximumObservedQueueDepth,
    movementSupportShapeCasts: finalMetrics.queryMetrics.shapeCasts,
    movementCalls: finalMetrics.queryMetrics.moveCapsuleCalls,
    activeMatchCheckpointWrites: finalTransport.activeMatchCheckpointWrites,
    activeMatchCheckpointWriteBound:
      Math.ceil(finalMetrics.serverTick / 10)
      + finalTransport.reliableEventsRecorded
      + 8,
    localPredictionAndPeerInterpolation: true,
    realCollisionOcclusion: true,
    canonicalTraversalRecoveries: proof.movementAndWorld.driverRecoveries.length,
    traversalCollisionWarning: traversalWarning !== null,
    supportsG5NoSnagAcceptance: false,
    technicalAcceptanceCandidate: proof.technicalAcceptance.allChecksPassed,
    gateClaim: proof.gateClaim,
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
    repositoryHeadAndDirtyTreeStableDuringCapture:
      proof.repositoryState.unchangedDuringCapture,
    repositoryStatusSha256: proof.repositoryState.start.statusSha256,
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
