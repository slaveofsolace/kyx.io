import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argumentsWithoutFlags = process.argv.slice(2).filter((value) => value !== '--check-only');
const checkOnly = process.argv.includes('--check-only');
const output = path.resolve(
  repo,
  argumentsWithoutFlags[0]
    ?? 'evidence/2026-07-25/phase-4-g3-source-frozen-2-4-8/runs/local-v7',
);
const failurePath = path.join(output, 'capture-failure.json');
const verificationPath = path.join(output, 'independent-failure-verification.json');
const failureVerifierRelative = 'tools/evidence/verify-phase5-p515-inkfall-product-population-failure.mjs';
const captureToolRelative = 'tools/evidence/capture-phase5-p515-inkfall-product-population.mjs';
const localV7CaptureToolSha256 =
  '713b3fbc1241e655be7585de87294dba1b6a3887920b19e4be5e2fa71740099b';
const preRepairFailureVerifierSha256 =
  'c0dade1113645c21fe9c343aa55becd8c7f0d32ecf421ebe83ec0fb854eff9a6';

async function sha256(file) {
  return createHash('sha256').update(await fs.readFile(file)).digest('hex');
}

function assertSha256(value, label) {
  assert.match(value, /^[0-9a-f]{64}$/u, label);
}

function distanceXZ(left, right) {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function snapshotEntityRecords(wire, clientId, playerId) {
  return wire.flatMap((record) => {
    if (
      record.clientId !== clientId
      || record.direction !== 'received'
      || (
        record.message.type !== 'fullSnapshot'
        && record.message.type !== 'deltaSnapshot'
      )
    ) return [];
    return (record.message.entities ?? [])
      .filter(({ id }) => id === playerId)
      .map((entity) => ({
        sequence: record.sequence,
        observedAt: record.observedAt,
        observedAtMilliseconds: record.observedAtMilliseconds,
        serverTick: record.message.serverTick,
        position: {
          x: entity.xMillimeters,
          y: entity.yMillimeters,
          z: entity.zMillimeters,
        },
      }));
  });
}

async function verifySourceFreeze(sourceFreeze) {
  if (sourceFreeze === undefined) {
    return {
      status: 'NOT_CAPTURED',
      recordedFiles: 0,
      currentMatches: 0,
      disclosedPostCaptureVerifierRepair: null,
    };
  }

  assert.equal(sourceFreeze.status, 'UNCHANGED');
  assert.equal(
    sourceFreeze.files,
    Object.keys(sourceFreeze.sourceSha256AtStart).length,
  );
  assert.deepEqual(
    sourceFreeze.sourceSha256AtFailure,
    sourceFreeze.sourceSha256AtStart,
  );

  let currentMatches = 0;
  let disclosedPostCaptureVerifierRepair = null;
  const disclosedPostCaptureWorkspaceDrift = [];
  for (const [relative, expectedHash] of Object.entries(
    sourceFreeze.sourceSha256AtFailure,
  )) {
    assertSha256(expectedHash, `${relative} recorded source hash`);
    const currentHash = await sha256(path.join(repo, relative));
    if (currentHash === expectedHash) {
      currentMatches += 1;
      continue;
    }

    if (
      relative === failureVerifierRelative
      && expectedHash === preRepairFailureVerifierSha256
    ) {
      disclosedPostCaptureVerifierRepair = {
        path: relative,
        capturedSha256: expectedHash,
        currentSha256: currentHash,
        reason: 'This verifier was repaired after local-v7 to verify the preserved interpolation failure.',
      };
      continue;
    }

    disclosedPostCaptureWorkspaceDrift.push({
      path: relative,
      capturedSha256: expectedHash,
      currentSha256: currentHash,
      reason: 'The workspace changed after the preserved local-v7 capture.',
    });
  }

  assert.notEqual(
    disclosedPostCaptureVerifierRepair,
    null,
    'local-v7 must disclose the intentional post-capture verifier repair',
  );

  return {
    status: 'RECORDED_UNCHANGED_WITH_POST_CAPTURE_DRIFT_DISCLOSED',
    recordedFiles: sourceFreeze.files,
    currentMatches,
    disclosedPostCaptureVerifierRepair,
    disclosedPostCaptureWorkspaceDrift,
  };
}

async function screenshotHashes(names) {
  return Object.fromEntries(await Promise.all(names.map(async (name) => {
    const file = path.join(output, 'screenshots', name);
    assert.ok((await fs.stat(file)).size > 0, `${name} non-empty`);
    return [name, await sha256(file)];
  })));
}

const failure = await fs.readFile(failurePath, 'utf8').then(JSON.parse);
assert.ok(Number.isFinite(Date.parse(failure.capturedAt)), 'capturedAt timestamp');
assert.equal(typeof failure.error?.message, 'string');
assert.ok(failure.error.message.length > 0);

const wireRelative = failure.wireDiagnostics.file;
assert.equal(wireRelative, path.basename(wireRelative), 'wire path must stay inside the run');
assert.equal(wireRelative, 'p515-failure-normalized-wire-log.jsonl');
const wirePath = path.join(output, wireRelative);
const wireText = await fs.readFile(wirePath, 'utf8');
const wire = wireText.trimEnd() === ''
  ? []
  : wireText.trimEnd().split('\n').map((line) => JSON.parse(line));

assert.equal(wire.length, failure.wireDiagnostics.entries);
assert.equal(await sha256(wirePath), failure.wireDiagnostics.sha256);
assert.deepEqual(
  wire.map(({ sequence }) => sequence),
  Array.from({ length: wire.length }, (_, index) => index),
);
assert.equal(wire.some(({ direction }) => direction === 'decode_error'), false);
assert.equal(JSON.stringify(wire).includes('"resumeToken":'), false);
assert.equal(
  wire.filter(({ direction, message }) => (
    direction === 'received'
    && (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
  )).length,
  failure.wireDiagnostics.receivedSnapshots,
);
assert.equal(
  wire.filter(({ direction, message }) => direction === 'sent' && message.type === 'ack').length,
  failure.wireDiagnostics.sentSnapshotAcknowledgements,
);
assert.equal(failure.wireDiagnostics.acknowledgementRejections, 0);

assert.equal(failure.clients.length, 8);
for (const client of failure.clients) {
  assert.deepEqual(client.pageErrors, [], `${client.clientId} page errors`);
  assert.deepEqual(client.consoleErrors, [], `${client.clientId} console errors`);
}

const finalMetricsRecord = failure.roomMetricsTimeline.at(-1);
assert.equal(finalMetricsRecord.status, 200);
const finalMetrics = finalMetricsRecord.body.metrics;
const transport = finalMetrics.transport;
assert.equal(transport.snapshotAcksRejected, 0);
assert.equal(transport.reliableEventAcksRejected, 0);

const completedStageScreenshots = [
  'p515-01-client-0-two-rendered.png',
  'p515-02-client-1-two-rendered.png',
  'p515-03-real-occlusion.png',
  'p515-04-confirmed-body-hit.png',
  'p515-05-authoritative-death-score.png',
  'p515-06-confirmed-teleport.png',
  'p515-07-resume-preserved-state.png',
  'p515-08-four-product-clients.png',
];

let failureKind;
let diagnosis;
let sourceFreeze;

if (
  failure.error.message === 'page.waitForFunction: Timeout 10000ms exceeded.'
  && /at movementInterpolationProof/u.test(failure.error.stack)
) {
  failureKind = 'EIGHT_CLIENT_INTERPOLATION_ENDPOINT_TIMEOUT';
  sourceFreeze = await verifySourceFreeze(failure.sourceFreeze);

  assert.equal(finalMetricsRecord.label, 'capture-failure');
  assert.equal(finalMetrics.lifecycle, 'active');
  assert.equal(finalMetrics.players, 8);
  assert.equal(finalMetrics.connectedPlayers, 8);
  assert.equal(finalMetrics.serverTick, 2_229);
  assert.equal(finalMetrics.ticks, 2_229);
  assert.equal(finalMetrics.missedSchedulerTicks, 186);
  assert.equal(transport.snapshotAckDebtEvictions, 0);
  assert.equal(transport.slowConsumerEvictions, 0);
  assert.equal(transport.snapshotAckDebtRecoveries, 152);

  for (const client of failure.clients) {
    assert.equal(client.snapshot.connection, 'joined', `${client.clientId} joined`);
    assert.equal(client.snapshot.remotePlayers, 7, `${client.clientId} remote players`);
    assert.equal(client.snapshot.combat.snapshot.players.length, 8, `${client.clientId} combat players`);
    assert.equal(client.snapshot.lastError, null, `${client.clientId} last error`);
  }

  const mover = failure.clients.find(({ clientId }) => clientId === 'client-6');
  const observer = failure.clients.find(({ clientId }) => clientId === 'client-7');
  assert.notEqual(mover, undefined);
  assert.notEqual(observer, undefined);
  const moverPlayerId = mover.snapshot.playerId;
  assert.equal(typeof moverPlayerId, 'string');
  assert.deepEqual(
    mover.snapshot.localPredictedPosition,
    { x: -30_522, y: 0, z: 5_751 },
  );
  assert.equal(
    observer.snapshot.remotePositions.some((position) => (
      position.x === mover.snapshot.localPredictedPosition.x
      && position.y === mover.snapshot.localPredictedPosition.y
      && position.z === mover.snapshot.localPredictedPosition.z
    )),
    true,
    'observer final remote position matches mover reconciled position',
  );

  const moverRecords = snapshotEntityRecords(wire, 'client-7', moverPlayerId);
  assert.ok(moverRecords.length >= 2);
  assert.deepEqual(moverRecords[0].position, { x: -30_500, y: 0, z: 7_000 });
  assert.deepEqual(moverRecords.at(-1).position, { x: -30_522, y: 0, z: 5_751 });
  assert.equal(moverRecords.at(-1).serverTick, 2_122);

  assert.equal(
    failure.sourceFreeze.sourceSha256AtFailure[captureToolRelative],
    localV7CaptureToolSha256,
  );
  assert.equal(
    failure.sourceFreeze.sourceSha256AtStart[captureToolRelative],
    failure.sourceFreeze.sourceSha256AtFailure[captureToolRelative],
  );

  const movementTarget = { x: -30_500, z: 4_500 };
  const arrivalToleranceMillimeters = 350;
  const remoteEndpoint = moverRecords.at(-1).position;
  const remoteDistanceFromTargetMillimeters = distanceXZ(remoteEndpoint, movementTarget);
  const minimumEndpointDiscrepancyMillimeters =
    remoteDistanceFromTargetMillimeters - arrivalToleranceMillimeters;
  const authoritativeRemoteMovementMillimeters = distanceXZ(
    moverRecords[0].position,
    remoteEndpoint,
  );
  assert.ok(authoritativeRemoteMovementMillimeters >= 500);
  assert.ok(minimumEndpointDiscrepancyMillimeters >= 901);
  assert.ok(minimumEndpointDiscrepancyMillimeters < 902);

  diagnosis = {
    moverClientId: 'client-6',
    observerClientId: 'client-7',
    moverPlayerId,
    target: movementTarget,
    arrivalToleranceMillimeters,
    observerEndpointProximityRequirementMillimeters: 750,
    observerTimeoutMilliseconds: 10_000,
    initialAuthoritativeRemotePosition: moverRecords[0].position,
    finalAuthoritativeRemotePosition: remoteEndpoint,
    finalAuthoritativeRemoteTick: moverRecords.at(-1).serverTick,
    authoritativeRemoteMovementMillimeters,
    remoteDistanceFromTargetMillimeters,
    minimumEndpointDiscrepancyMillimeters,
    missedSchedulerTicks: finalMetrics.missedSchedulerTicks,
    totalSchedulerTicks: finalMetrics.ticks,
    missedSchedulerTickRate: finalMetrics.missedSchedulerTicks / finalMetrics.ticks,
    inference:
      'moveTo returned only after local prediction entered the 350 mm target radius; the observer then timed out while the authoritative endpoint remained at least 901 mm outside that radius.',
  };
} else if (/^Population 8 readiness timeout:/u.test(failure.error.message)) {
  failureKind = 'EIGHT_CLIENT_SNAPSHOT_ACK_DEBT_EVICTION';
  sourceFreeze = await verifySourceFreeze(failure.sourceFreeze);

  assert.equal(finalMetricsRecord.label, 'population-8');
  assert.match(failure.error.message, /Snapshot acknowledgement timeout/u);
  const acknowledgementTimeoutClients = failure.clients.filter(({ snapshot }) => (
    snapshot?.connection === 'closed'
    && snapshot.lastError === 'authority socket closed (1013: Snapshot acknowledgement timeout)'
  ));
  const joinedClients = failure.clients.filter(({ snapshot }) => snapshot?.connection === 'joined');
  assert.equal(acknowledgementTimeoutClients.length, 7);
  assert.equal(joinedClients.length, 1);
  assert.deepEqual(
    acknowledgementTimeoutClients.map(({ clientId }) => clientId).sort(),
    ['client-0', 'client-1', 'client-2', 'client-3', 'client-4', 'client-5', 'client-6'],
  );
  assert.equal(joinedClients[0].clientId, 'client-7');

  assert.equal(finalMetrics.lifecycle, 'active');
  assert.equal(finalMetrics.connectedPlayers, 1);
  assert.equal(transport.snapshotAckDebtEvictions, 7);
  assert.equal(transport.slowConsumerEvictions, 7);
  assert.ok(transport.snapshotAckDebtEpisodes >= 7);
  assert.ok(transport.snapshotAckDebtRecoveries >= 1);
  assert.ok(transport.maximumSnapshotAckDebtMilliseconds >= 5_000);
  assert.ok(finalMetrics.missedSchedulerTicks > 0);

  diagnosis = {
    acknowledgementTimeoutClients: acknowledgementTimeoutClients.map(({ clientId }) => clientId),
    clientsRemainingJoined: joinedClients.map(({ clientId }) => clientId),
    snapshotAckDebtEvictions: transport.snapshotAckDebtEvictions,
    slowConsumerEvictions: transport.slowConsumerEvictions,
    maximumSnapshotAckDebtMilliseconds: transport.maximumSnapshotAckDebtMilliseconds,
    missedSchedulerTicks: finalMetrics.missedSchedulerTicks,
  };
} else {
  assert.fail(`Unsupported P5.15 failure signature: ${failure.error.message}`);
}

const screenshotSha256 = await screenshotHashes(completedStageScreenshots);
const limitations = failureKind === 'EIGHT_CLIENT_INTERPOLATION_ENDPOINT_TIMEOUT'
  ? [
    'This confirms a preserved failed capture; it is not a successful P5.15 proof.',
    'The source freeze covers only the files enumerated by the capture, not the complete repository or runtime environment.',
    'The minimum endpoint discrepancy is an inference from the audited local-v7 capture contract pinned by SHA-256 and the independently parsed authoritative wire endpoint because the predicted endpoint and the capture-source bytes were not archived inside the failed run.',
    'No G3, G4, G5, performance, human-playtest, staging, or deployment acceptance is claimed.',
  ]
  : [
    'This confirms a preserved failed capture; it is not a successful P5.15 proof.',
    'This older capture did not record a source freeze, so it cannot establish a current-source or capture-adjacent source identity.',
    'No G3, G4, G5, performance, human-playtest, staging, or deployment acceptance is claimed.',
  ];
const verification = {
  schemaVersion: 2,
  phase: 'P5.15',
  verifiedAt: new Date().toISOString(),
  status: 'FAILURE_CONFIRMED',
  failureKind,
  gateClaim: 'G3_REMAINS_OPEN',
  runtime: path.relative(repo, output).replaceAll('\\', '/'),
  checks: {
    recordedSourceFreeze: sourceFreeze,
    productClientsAttempted: 8,
    wireEntries: wire.length,
    receivedSnapshots: failure.wireDiagnostics.receivedSnapshots,
    snapshotAcknowledgements: failure.wireDiagnostics.sentSnapshotAcknowledgements,
    acknowledgementRejections: failure.wireDiagnostics.acknowledgementRejections,
    decodeErrors: 0,
    rawResumeTokenFields: 0,
    completedTwoClientCombatAndResumeStage: true,
    completedFourClientStage: true,
    completedEightClientAcceptance: false,
    g3Claimed: false,
  },
  diagnosis,
  screenshotSha256,
  captureFailureSha256: await sha256(failurePath),
  wireSha256: await sha256(wirePath),
  verifierSha256: await sha256(fileURLToPath(import.meta.url)),
  limitations,
};

if (!checkOnly) {
  await fs.writeFile(
    verificationPath,
    `${JSON.stringify(verification, null, 2)}\n`,
    { encoding: 'utf8', flag: 'wx' },
  );
}
console.log(JSON.stringify(verification, null, 2));
