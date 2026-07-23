import { createHash } from 'node:crypto';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_ROOT = path.join(
  REPO_ROOT,
  'evidence/2026-07-22/phase-4-g3-real-slow-socket',
);
const RUNS_ROOT = path.join(EVIDENCE_ROOT, 'runs');
const SOURCE_FILES = Object.freeze([
  'worker/transport-limits.json',
  'worker/security.ts',
  'worker/room.ts',
  'src/net/protocol.ts',
  'src/net/schemas.ts',
  'tests/unit/worker/security.test.ts',
  'tests/worker/protocolV2Socket.test.ts',
  'tools/evidence/capture-phase4-g3-real-slow-socket.mjs',
  'tools/evidence/verify-phase4-g3-real-slow-socket.mjs',
  'wrangler.jsonc',
  'package-lock.json',
]);
const FALLBACK_MILLISECONDS = 1_000;
const EVICTION_MILLISECONDS = 3_000;

function requiredArgument(name) {
  const indexes = process.argv.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length !== 1) throw new Error(`${name} must be provided exactly once.`);
  const value = process.argv[indexes[0] + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a path.`);
  return value;
}

function containedPath(value, root, label) {
  const resolved = path.resolve(REPO_ROOT, value);
  const relative = path.relative(root, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a child path of ${path.relative(REPO_ROOT, root)}.`);
  }
  return resolved;
}

function sameJson(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function everyTrue(record) {
  return Object.values(record).every((value) => value === true);
}

async function fileRecord(absolute) {
  const bytes = await readFile(absolute);
  const details = await stat(absolute);
  return {
    path: path.relative(REPO_ROOT, absolute).replaceAll('\\', '/'),
    bytes: details.size,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}

function recomputeEvictionAssertions(scenario) {
  const { proxy, metricsBefore, metricsEvicted, stalledClient, healthyClient } = scenario;
  const pingsSent = scenario.pingsSent;
  return {
    exactScenarioIdentity: scenario.scenario === 'real-paused-read-eviction',
    exactPinnedPolicyConstants:
      scenario.constants.maxSnapshotAckDebtMilliseconds === EVICTION_MILLISECONDS
        && scenario.constants.snapshotAckFallbackMilliseconds === FALLBACK_MILLISECONDS,
    actualTcpByteRelay: proxy.protocol === 'real-node-tcp-byte-relay'
      && proxy.proxyPort > 0
      && proxy.proxyPort !== 8787,
    upstreamReadWasActuallyPaused: proxy.upstreamWasPaused === true,
    noServerToClientDataEventsWhilePaused:
      proxy.serverToClientBytesBeforeResume === proxy.serverToClientBytesAtPause,
    clientToServerTrafficContinuedWhilePaused:
      proxy.clientToServerBytesBeforeResume > proxy.clientToServerBytesAtPause
        && pingsSent >= 8,
    closeFrameOrBufferedFramesDrainedAfterResume:
      proxy.serverToClientBytesAfterResume > proxy.serverToClientBytesBeforeResume,
    exactApplicationDebtEviction: metricsEvicted.transport.snapshotAckDebtEvictions === 1,
    exactSlowConsumerEviction: metricsEvicted.transport.slowConsumerEvictions === 1,
    pinnedDebtBoundaryObserved:
      metricsEvicted.transport.maximumSnapshotAckDebtMilliseconds >= EVICTION_MILLISECONDS,
    snapshotsCoalesced: metricsEvicted.transport.snapshotAckDebtSnapshotsCoalesced > 0,
    reliableBatchesCoalesced:
      metricsEvicted.transport.snapshotAckDebtReliableBatchesCoalesced > 0,
    fallbackObservedBeforeEviction: metricsEvicted.transport.snapshotAckTimeoutFallbacks >= 1,
    exactClosePolicy: stalledClient.close?.code === 1013
      && stalledClient.close?.reason === 'Snapshot acknowledgement timeout',
    healthyPeerOpenAtCapture: healthyClient.readyState === 1
      && metricsEvicted.connectedPlayers === 1,
    healthyPeerAdvancedAfterEviction:
      scenario.healthyPostEvictionSnapshot.serverTick > metricsEvicted.serverTick,
    pingsReconciledAgainstWorkerCounter:
      metricsEvicted.transport.inboundMessagesReceived
        - metricsBefore.transport.inboundMessagesReceived >= pingsSent,
    noProbeErrors: stalledClient.decodeOrSocketErrors.length === 0
      && healthyClient.decodeOrSocketErrors.length === 0,
  };
}

function recomputeRecoveryAssertions(scenario) {
  const {
    proxy,
    metricsBefore,
    metricsRecovered,
    metricsTwoPeers,
    metricsFinal,
    recoveringClient,
    healthyClient,
  } = scenario;
  return {
    exactScenarioIdentity: scenario.scenario === 'real-paused-read-recovery',
    exactPinnedPolicyConstants:
      scenario.constants.recoveryPauseMilliseconds === 600
        && scenario.constants.maxSnapshotAckDebtMilliseconds === EVICTION_MILLISECONDS
        && scenario.constants.snapshotAckFallbackMilliseconds === FALLBACK_MILLISECONDS,
    actualTcpByteRelay: proxy.protocol === 'real-node-tcp-byte-relay'
      && proxy.proxyPort > 0
      && proxy.proxyPort !== 8787,
    upstreamReadWasActuallyPaused: proxy.upstreamWasPaused === true,
    shortPauseStayedBelowFallback:
      proxy.pauseDurationMilliseconds >= 575
        && proxy.pauseDurationMilliseconds < FALLBACK_MILLISECONDS,
    noServerToClientDataEventsWhilePaused:
      proxy.serverToClientBytesBeforeResume === proxy.serverToClientBytesAtPause,
    clientToServerTrafficContinuedWhilePaused:
      proxy.clientToServerBytesBeforeResume > proxy.clientToServerBytesAtPause
        && scenario.pingsSent >= 2,
    exactDebtRecoveryDelta:
      metricsRecovered.transport.snapshotAckDebtRecoveries
        > metricsBefore.transport.snapshotAckDebtRecoveries,
    noFallbackDuringShortPause:
      metricsRecovered.transport.snapshotAckTimeoutFallbacks
        === metricsBefore.transport.snapshotAckTimeoutFallbacks,
    zeroEvictions: metricsFinal.transport.snapshotAckDebtEvictions === 0
      && metricsFinal.transport.slowConsumerEvictions === 0,
    twoPeersRemainConnected: metricsTwoPeers.connectedPlayers === 2
      && metricsFinal.connectedPlayers === 2,
    recoveringClientAdvanced:
      scenario.recoveringLaterSnapshot.serverTick > scenario.recoveringJoin.full.serverTick
        && recoveringClient.readyState === 1,
    healthyClientOpenAtCapture: healthyClient.readyState === 1,
    maximumDebtStayedBelowEviction:
      metricsFinal.transport.maximumSnapshotAckDebtMilliseconds < EVICTION_MILLISECONDS,
    noProbeErrors: recoveringClient.decodeOrSocketErrors.length === 0
      && healthyClient.decodeOrSocketErrors.length === 0,
  };
}

async function main() {
  const runRoot = containedPath(requiredArgument('--run'), RUNS_ROOT, '--run');
  const outputPath = containedPath(requiredArgument('--output'), EVIDENCE_ROOT, '--output');
  const relativeToRuns = path.relative(RUNS_ROOT, outputPath);
  if (!relativeToRuns.startsWith('..') && !path.isAbsolute(relativeToRuns)) {
    throw new Error('--output must remain outside immutable capture runs.');
  }
  if (path.extname(outputPath) !== '.json') throw new Error('--output must be a JSON file.');
  const outputExists = await stat(outputPath).then(() => true).catch((error) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  });
  if (outputExists) {
    throw new Error('Verification output exists; preserve it and choose a fresh path.');
  }

  const evidencePath = path.join(runRoot, 'real-slow-socket.json');
  const evidence = JSON.parse(await readFile(evidencePath, 'utf8'));
  const rawEviction = JSON.parse(await readFile(
    path.join(runRoot, 'logs/eviction-scenario.json'),
    'utf8',
  ));
  const rawRecovery = JSON.parse(await readFile(
    path.join(runRoot, 'logs/recovery-scenario.json'),
    'utf8',
  ));
  const sourceActual = await Promise.all(SOURCE_FILES.map((relative) => (
    fileRecord(path.join(REPO_ROOT, relative))
  )));
  const artifactActual = await Promise.all(evidence.artifactInventory.map(({ path: relative }) => (
    fileRecord(path.join(REPO_ROOT, relative))
  )));
  const runPrefix = `${path.relative(REPO_ROOT, runRoot).replaceAll('\\', '/')}/`;
  const evictionAssertions = recomputeEvictionAssertions(rawEviction);
  const recoveryAssertions = recomputeRecoveryAssertions(rawRecovery);
  const checks = {
    captureStatusPassed: evidence.status === 'LOCAL_G3_REAL_SLOW_SOCKET_EVIDENCE_PASS',
    exactEvidenceIdentity:
      evidence.evidenceId === 'phase-4-g3-real-slow-socket-local-v1-2026-07-22',
    gateRemainsUnaccepted: evidence.gateDecision === 'NONE'
      && evidence.gateClaim === 'G3_NOT_ACCEPTED',
    noDeploymentPerformed: evidence.deploymentPerformed === false,
    exactSourceHashesAndSizes: sameJson(sourceActual, evidence.sourceInventory),
    artifactHashesAndSizesMatch: sameJson(artifactActual, evidence.artifactInventory),
    artifactPathsScopedToRun: evidence.artifactInventory.every(({ path: relative }) => (
      relative.startsWith(runPrefix)
    )),
    rawEvictionMatchesEmbedded: sameJson(rawEviction, evidence.eviction),
    rawRecoveryMatchesEmbedded: sameJson(rawRecovery, evidence.recovery),
    evictionRecomputedFromRawValues: everyTrue(evictionAssertions),
    recoveryRecomputedFromRawValues: everyTrue(recoveryAssertions),
    storedEvictionAssertionsMatchRecomputed:
      everyTrue(evidence.eviction.assertions)
        && evidence.eviction.passed === true,
    storedRecoveryAssertionsMatchRecomputed:
      everyTrue(evidence.recovery.assertions)
        && evidence.recovery.passed === true,
    aggregateAssertionsMatch:
      evidence.aggregateAssertions.evictionScenarioPassed === true
        && evidence.aggregateAssertions.recoveryScenarioPassed === true
        && evidence.aggregateAssertions.ownedAuthorityPortReleased === true,
    actualSocketBoundaryDeclared: evidence.scopeBoundary.some((value) => (
      value.includes('actual ws clients')
        && value.includes('Node TCP byte relay')
        && value.includes('server-to-client upstream read is paused')
    )),
    bufferedAmountNonClaimDeclared: evidence.scopeBoundary.some((value) => (
      value.includes('does not claim operating-system socket-buffer saturation')
        && value.includes('bufferedAmount')
    )),
    operationalRemainderDeclared: evidence.scopeBoundary.some((value) => (
      value.includes('Multiple stalled clients')
        && value.includes('external staging')
        && value.includes('resource/cost')
        && value.includes('physical-device refresh')
    )),
  };
  const result = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    evidencePath: path.relative(REPO_ROOT, evidencePath).replaceAll('\\', '/'),
    status: everyTrue(checks)
      ? 'INDEPENDENT_G3_REAL_SLOW_SOCKET_VERIFICATION_PASS'
      : 'INDEPENDENT_G3_REAL_SLOW_SOCKET_VERIFICATION_FAIL',
    gateClaim: 'G3_NOT_ACCEPTED',
    checks,
    recomputed: {
      evictionAssertions,
      recoveryAssertions,
    },
  };
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${result.status}\n${outputPath}\n`);
  if (result.status.endsWith('_FAIL')) process.exitCode = 1;
}

await main();
