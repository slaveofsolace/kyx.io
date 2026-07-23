import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_INPUT = path.join(
  REPO_ROOT,
  'evidence/2026-07-20/phase-4-g3-authoritative-movement/runs/reliable-control-split/runtime-matrix.json',
);
const DEFAULT_OUTPUT = path.join(
  REPO_ROOT,
  'evidence/2026-07-21/phase-4-g3-expanded/five-profile-independent-verification.json',
);
const REQUIRED_PROFILES = Object.freeze([
  'nominal',
  'latency-jitter',
  'loss',
  'reorder-duplicate',
  'combined-stress',
]);
const REQUIRED_POLICY = Object.freeze({
  frameScope: 'gameplay_input_snapshot_ack_after_initial_full_snapshot',
  reliableControlPolicy: 'bypass_synthetic_loss_duplication_reorder_and_latency',
  bootstrapPolicy: 'first_full_snapshot_delivered_before_gameplay_impairment',
});

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

function insideRepository(value) {
  const resolved = path.resolve(value);
  const relative = path.relative(REPO_ROOT, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Evidence paths must remain inside the repository.');
  }
  return resolved;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function delta(left, right) {
  if (left === null || right === null) return null;
  return Math.hypot(right.x - left.x, right.y - left.y, right.z - left.z);
}

function canonicalIdentity(value) {
  return JSON.stringify(value, Object.keys(value).sort());
}

function directionMetrics(peer) {
  return [peer.impairment.inbound.metrics, peer.impairment.outbound.metrics];
}

function recomputeObserved(peerA, peerB) {
  const metrics = [...directionMetrics(peerA), ...directionMetrics(peerB)];
  const sum = (field) => metrics.reduce((total, item) => total + item[field], 0);
  const max = (field) => Math.max(...metrics.map((item) => item[field] ?? 0));
  return Object.freeze({
    deliveredCopies: sum('deliveredCopies'),
    droppedPackets: sum('droppedPackets'),
    duplicatedPackets: sum('duplicatedPackets'),
    reorderImpairedPackets: sum('reorderImpairedPackets'),
    reorderedPackets: sum('reorderedPackets'),
    maximumDeliveryLatencyMilliseconds: max('maximumDeliveryLatencyMilliseconds'),
    maximumObservedQueueDepth: max('maximumObservedQueueDepth'),
  });
}

function expectedImpairment(profile, observed) {
  switch (profile) {
    case 'nominal':
      return observed.droppedPackets === 0
        && observed.duplicatedPackets === 0
        && observed.reorderImpairedPackets === 0;
    case 'latency-jitter':
      return observed.maximumDeliveryLatencyMilliseconds >= 65;
    case 'loss':
      return observed.droppedPackets > 0;
    case 'reorder-duplicate':
      return observed.duplicatedPackets > 0 && observed.reorderImpairedPackets > 0;
    case 'combined-stress':
      return observed.droppedPackets > 0
        && observed.duplicatedPackets > 0
        && observed.reorderImpairedPackets > 0;
    default:
      return false;
  }
}

function check(name, condition, detail = null) {
  return Object.freeze({ name, passed: condition === true, detail });
}

function sameNumbers(left, right, tolerance = 1e-9) {
  return typeof left === 'number'
    && typeof right === 'number'
    && Number.isFinite(left)
    && Number.isFinite(right)
    && Math.abs(left - right) <= tolerance;
}

function verifyProfile(profile) {
  const snapshots = profile.snapshots;
  const finalA = snapshots.afterResumeMoveA;
  const finalB = snapshots.afterResumeMoveB;
  const rawTickHz = (
    profile.workerMetrics.idleAfter.serverTick - profile.workerMetrics.idleBefore.serverTick
  ) / (profile.measuredAuthorityTick.elapsedMilliseconds / 1_000);
  const initialDelta = delta(
    snapshots.beforeMoveA.local.authoritativePosition,
    snapshots.afterMoveA.local.authoritativePosition,
  );
  const resumedDelta = delta(
    snapshots.resumedA.local.authoritativePosition,
    finalA.local.authoritativePosition,
  );
  const observed = recomputeObserved(finalA, finalB);
  const allDirectionMetrics = [
    ...directionMetrics(finalA),
    ...directionMetrics(finalB),
  ];
  const tickOrder = [
    snapshots.aJoined,
    snapshots.bJoined,
    snapshots.beforeMoveA,
    snapshots.afterMoveA,
    snapshots.resumedA,
    snapshots.afterResumeMoveA,
  ].map((snapshot) => snapshot.authority.serverTick);
  const checks = [
    check('declared profile pass', profile.passed === true),
    check('all declared assertions true', Object.values(profile.assertions).every((value) => value === true)),
    check('same room in raw joined snapshots',
      snapshots.aJoined.configuration.roomCode === snapshots.bJoined.configuration.roomCode),
    check('same match in raw joined snapshots',
      snapshots.aJoined.authority.matchId === snapshots.bJoined.authority.matchId),
    check('same simulation identity in raw joined snapshots',
      canonicalIdentity(snapshots.aJoined.authority.simulationIdentity)
        === canonicalIdentity(snapshots.bJoined.authority.simulationIdentity)),
    check('protocol v2 on both raw peers',
      snapshots.aJoined.authority.protocolVersion === 2
        && snapshots.bJoined.authority.protocolVersion === 2),
    check('raw idle authority tick rate is 17-23 Hz', rawTickHz >= 17 && rawTickHz <= 23, rawTickHz),
    check('reported tick rate matches raw worker metrics',
      sameNumbers(rawTickHz, profile.measuredAuthorityTick.measuredHz), rawTickHz),
    check('raw authority movement before resume', initialDelta > 0, initialDelta),
    check('reported initial movement matches raw positions',
      sameNumbers(initialDelta, profile.movement.initialAuthorityDeltaMillimeters), initialDelta),
    check('raw authority movement after resume', resumedDelta > 0, resumedDelta),
    check('reported resumed movement matches raw positions',
      sameNumbers(resumedDelta, profile.movement.postResumeAuthorityDeltaMillimeters), resumedDelta),
    check('remote samples increased on witness peer',
      snapshots.afterMoveB.counters.remoteSamples > snapshots.beforeMoveB.counters.remoteSamples),
    check('remote interpolation sampled on witness peer',
      snapshots.afterMoveB.counters.interpolationModes.interpolated > 0),
    check('resume preserved server-owned player identity',
      snapshots.resumedA.authority.playerId === snapshots.afterMoveA.authority.playerId),
    check('resume preserved match identity',
      snapshots.resumedA.authority.matchId === snapshots.afterMoveA.authority.matchId),
    check('resume rotated opaque 43-character token without capture',
      snapshots.resumedA.resume.generation === 1
        && snapshots.resumedA.resume.tokenLength === 43
        && snapshots.resumedA.counters.resumeTokenRotations === 1
        && profile.reconnect.resumeTokenValueCaptured === false),
    check('resume began from a full snapshot and reset prediction once',
      snapshots.resumedA.counters.fullSnapshots >= 1
        && snapshots.resumedA.counters.resumePredictionResets === 1),
    check('authority server ticks never moved backward across captured lifecycle',
      tickOrder.every((value, index) => index === 0 || value >= tickOrder[index - 1]), tickOrder),
    check('raw impairment counters equal reported aggregate',
      Object.entries(observed).every(([key, value]) => profile.impairment.observed[key] === value), observed),
    check('profile-specific impairment actually occurred', expectedImpairment(profile.profile, observed), observed),
    check('all impairment queues remained within the hard bound',
      observed.maximumObservedQueueDepth <= 4_096
        && allDirectionMetrics.every((metrics) => metrics.overflowRejectedPackets === 0)),
    check('control and bootstrap policy is explicit on both peers',
      [finalA, finalB].every(({ impairment }) => Object.entries(REQUIRED_POLICY)
        .every(([key, value]) => impairment.policy[key] === value))),
    check('joined/resumed bootstrap full snapshots bypass gameplay impairment',
      [finalA, finalB].every(({ impairment }) => impairment.bootstrapGameplayFramesBypassedInbound >= 1)),
    check('both final sockets remain joined and open',
      finalA.connection.phase === 'joined'
        && finalB.connection.phase === 'joined'
        && finalA.connection.socketState === 'open'
        && finalB.connection.socketState === 'open'),
    check('both clients are error-free', finalA.lastError === null && finalB.lastError === null),
    check('browser critical log is empty', profile.criticalBrowserLog.length === 0),
    check('reconciliation never reached a 2 m hard-snap bucket',
      finalA.local.correctionBounds.histogram.atLeast2000 === 0
        && finalB.local.correctionBounds.histogram.atLeast2000 === 0),
    check('worker queue stayed bounded', profile.workerMetrics.final.maximumObservedQueueDepth <= 128),
    check('worker remained live with both peers', profile.workerMetrics.final.connectedPlayers === 2),
  ];
  return Object.freeze({
    profile: profile.profile,
    passed: checks.every(({ passed }) => passed),
    checks,
    recomputed: Object.freeze({ rawTickHz, initialDelta, resumedDelta, observed, tickOrder }),
  });
}

async function recursiveFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await recursiveFiles(absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}

async function preservationInventory(evidenceRoot) {
  const failureRoot = path.join(evidenceRoot, 'failures');
  const files = (await recursiveFiles(failureRoot)).sort();
  return await Promise.all(files.map(async (absolute) => {
    const bytes = await readFile(absolute);
    const details = await stat(absolute);
    return Object.freeze({
      path: path.relative(REPO_ROOT, absolute).replaceAll('\\', '/'),
      bytes: details.size,
      sha256: sha256(bytes),
    });
  }));
}

async function main() {
  const inputPath = insideRepository(argument('--input', DEFAULT_INPUT));
  const outputPath = insideRepository(argument('--output', DEFAULT_OUTPUT));
  const inputBytes = await readFile(inputPath);
  const matrix = JSON.parse(inputBytes.toString('utf8'));
  const evidenceRoot = path.resolve(path.dirname(inputPath), '../..');
  const topChecks = [
    check('declared five-profile status is pass', matrix.status === 'FIVE_PROFILE_LOCAL_MATRIX_PASS'),
    check('artifact makes no G3 acceptance decision',
      matrix.gateDecision === 'NONE' && matrix.gateClaim === 'G3_NOT_ACCEPTED'),
    check('artifact declares no deployment', matrix.deploymentPerformed === false),
    check('required profile order is exact',
      JSON.stringify(matrix.profileOrder) === JSON.stringify(REQUIRED_PROFILES)),
    check('exactly five raw profile results exist', matrix.profiles.length === REQUIRED_PROFILES.length),
    check('all aggregate declarations are true',
      Object.values(matrix.aggregateAssertions).every((value) => value === true)),
    check('forged transform was rejected without mutation',
      matrix.adversarial.rejectionCode === 'PROTOCOL_FORBIDDEN_COMMAND'
        && matrix.adversarial.rejectionDetail === '$.type'
        && matrix.adversarial.socketRemainedOpen === true
        && matrix.adversarial.forgedPositionAbsent === true
        && matrix.adversarial.laterSnapshotTickAdvanced === true
        && JSON.stringify(matrix.adversarial.before) === JSON.stringify(matrix.adversarial.after)
        && matrix.adversarial.resumeTokenCaptured === false),
    check('scope explicitly denies full-matrix or gate completion',
      matrix.scopeBoundary.some((entry) => /do not by themselves cover/u.test(entry))
        && matrix.scopeBoundary.some((entry) => /No staging WSS/u.test(entry))),
  ];
  const profiles = matrix.profiles.map(verifyProfile);
  const failures = await preservationInventory(evidenceRoot);
  const output = Object.freeze({
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    input: Object.freeze({
      path: path.relative(REPO_ROOT, inputPath).replaceAll('\\', '/'),
      bytes: inputBytes.byteLength,
      sha256: sha256(inputBytes),
    }),
    status: topChecks.every(({ passed }) => passed) && profiles.every(({ passed }) => passed)
      ? 'INDEPENDENT_FIVE_PROFILE_VERIFICATION_PASS'
      : 'INDEPENDENT_FIVE_PROFILE_VERIFICATION_FAIL',
    gateDecision: 'NONE',
    gateClaim: 'G3_NOT_ACCEPTED',
    topChecks,
    profiles,
    preservedFailureArtifacts: Object.freeze({ count: failures.length, files: failures }),
    boundary: Object.freeze([
      'This independently recalculates the existing five-profile artifact from raw snapshots and metrics.',
      'It does not expand the ADR-005 matrix and cannot accept G3.',
      'Preservation hashes inventory prior failures but do not convert those failures into passing evidence.',
    ]),
  });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    output: path.relative(REPO_ROOT, outputPath).replaceAll('\\', '/'),
    status: output.status,
    profileResults: profiles.map(({ profile, passed }) => ({ profile, passed })),
    preservedFailureFiles: failures.length,
  }, null, 2)}\n`);
  if (output.status.endsWith('_FAIL')) process.exitCode = 1;
}

await main();
