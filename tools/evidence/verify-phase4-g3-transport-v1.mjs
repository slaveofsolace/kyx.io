import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_ROOT = path.join(REPO_ROOT, 'evidence/2026-07-21/phase-4-g3-transport-v1');
const RUN_ROOT = path.join(EVIDENCE_ROOT, 'runs/local-v8');
const MATRIX_PATH = path.join(RUN_ROOT, 'transport-v1-runtime.json');
const OUTPUT_PATH = path.join(
  EVIDENCE_ROOT,
  'transport-v1-independent-verification-local-v8.json',
);

const CONTRACT_ASSERTIONS = Object.freeze([
  'protocolVersionsAdvertised',
  'sameTickBaselineIdsDistinct',
  'oldBaselineDeltaIncludesLateJoin',
  'deltaChainedFromAcknowledgedBaseline',
  'reliableEventResentBeforeAck',
  'reliableEventDeduplicatedBySequence',
  'reliableAckStoppedPendingEvent',
  'futureReliableAckRejected',
  'futureAckRejected',
  'oldAckRejected',
  'missingBaselineFullCorrelated',
  'unacknowledgedDeltaTimedOutToFull',
  'transportMetricsConfirmPaths',
  'roomHealthy',
]);
const HONEST_ASSERTIONS = Object.freeze([
  'inputCadenceNear20Hz',
  'snapshotAckCadenceNear10Hz',
  'rollingWindowBelow384',
  'authorityProcessedStream',
  'noRateLimit',
  'noUnexpectedErrors',
  'socketRemainedOpen',
  'deltasObserved',
  'noBaselineRecoveryRequests',
  'noReliableHistoryGap',
  'authorityAcceptedInputs',
  'workerSentDeltas',
]);
const ABUSE_ASSERTIONS = Object.freeze([
  'sentExactly385Messages',
  'revisedLimitCrossed',
  'rateLimited',
  'policyClose1008',
]);

const EXPECTED_TRANSPORT_FAILURES = Object.freeze([
  'local-v1',
  'local-v2',
  'local-v3',
  'local-v4',
  'local-v5',
  'local-v6',
  'local-v7',
]);

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactKeys(record, expected) {
  return sameJson(Object.keys(record).sort(), [...expected].sort());
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

async function failureInventory() {
  const root = path.join(EVIDENCE_ROOT, '..', 'phase-4-g3-delta-baseline', 'failures');
  const attempts = await readdir(root, { withFileTypes: true }).catch(() => []);
  return attempts.filter((entry) => entry.isDirectory()).map(({ name }) => name).sort();
}

async function transportFailureInventory() {
  const root = path.join(EVIDENCE_ROOT, 'runs');
  const runs = await readdir(root, { withFileTypes: true }).catch(() => []);
  const preserved = await Promise.all(runs.filter((entry) => entry.isDirectory()).map(async ({ name }) => {
    const captureError = path.join(root, name, 'logs', 'capture-error.txt');
    const present = await stat(captureError).then(() => true).catch((error) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
      throw error;
    });
    return present ? name : null;
  }));
  return preserved.filter((name) => name !== null).sort();
}

async function main() {
  const outputAlreadyExists = await stat(OUTPUT_PATH).then(() => true).catch((error) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  });
  if (outputAlreadyExists) {
    throw new Error('Independent verification output already exists; preserve it and use a fresh run path.');
  }
  const matrix = JSON.parse(await readFile(MATRIX_PATH, 'utf8'));
  const inventoryActual = await Promise.all(matrix.artifactInventory.map(({ path: relative }) => (
    fileRecord(path.join(REPO_ROOT, relative))
  )));
  const sourceHashesActual = Object.fromEntries(await Promise.all(
    Object.keys(matrix.sourceHashes).map(async (relative) => {
      const bytes = await readFile(path.join(REPO_ROOT, relative));
      return [relative, createHash('sha256').update(bytes).digest('hex')];
    }),
  ));
  const failures = await failureInventory();
  const transportFailures = await transportFailureInventory();
  const runPrefix = `${path.relative(REPO_ROOT, RUN_ROOT).replaceAll('\\', '/')}/`;
  const checks = {
    runtimeStatusPass: matrix.status === 'LOCAL_G3_TRANSPORT_V1_EVIDENCE_PASS',
    freshRunIdentity: matrix.evidenceId === 'phase-4-g3-transport-v1-local-v8-2026-07-21',
    gateRemainsUnaccepted: matrix.gateDecision === 'NONE'
      && matrix.gateClaim === 'G3_NOT_ACCEPTED',
    noDeploymentPerformed: matrix.deploymentPerformed === false,
    exactContractAssertions: exactKeys(matrix.contract.assertions, CONTRACT_ASSERTIONS),
    everyContractAssertionPassed: matrix.contract.passed === true
      && everyTrue(matrix.contract.assertions),
    exactHonestAssertions: exactKeys(matrix.honestClient.assertions, HONEST_ASSERTIONS),
    everyHonestAssertionPassed: matrix.honestClient.passed === true
      && everyTrue(matrix.honestClient.assertions),
    exactAbuseAssertions: exactKeys(matrix.abuse.assertions, ABUSE_ASSERTIONS),
    everyAbuseAssertionPassed: matrix.abuse.passed === true
      && everyTrue(matrix.abuse.assertions),
    exactAdvertisedVersions: sameJson(matrix.contract.versions, {
      protocol: 2,
      snapshotBaseline: 1,
      reliableEvents: 1,
    }),
    sameTickBaselinesActuallyDistinct: matrix.contract.sameTickBaselines.first.tick
      === matrix.contract.sameTickBaselines.second.tick
      && matrix.contract.sameTickBaselines.first.id
        !== matrix.contract.sameTickBaselines.second.id,
    exactDeltaChain: matrix.contract.chainedDelta.baseTick
      === matrix.contract.firstDelta.serverTick
      && matrix.contract.chainedDelta.baseSnapshotBaselineId
        === matrix.contract.firstDelta.snapshotBaselineId,
    reliableDeliveryActuallyDeduped: matrix.contract.reliable.deliveriesBeforeAck >= 2
      && matrix.contract.reliable.uniqueAppliedIds.length === 1
      && matrix.contract.reliable.deliveriesAfterAckWindow
        === matrix.contract.reliable.deliveriesBeforeAck,
    futureReliableAckActuallyRejected:
      matrix.contract.futureReliableAckError.code === 'ACK_REJECTED'
      && matrix.contract.futureReliableAckError.detail === 'event_unknown_event',
    futureAndOldAcksActuallyRejected: matrix.contract.futureAckError.code === 'ACK_REJECTED'
      && matrix.contract.futureAckError.detail === 'snapshot_tick_future'
      && matrix.contract.oldAckError.code === 'ACK_REJECTED',
    correlatedFallbackActuallyPresent: matrix.contract.correlatedFull.requestId
      === 'request.transport.missing-baseline',
    timeoutFallbackElapsedAtLeast900ms: matrix.contract.timeoutFallback.elapsedMilliseconds >= 900,
    honestRatesMeasured: matrix.honestClient.measuredInputHz >= 19
      && matrix.honestClient.measuredInputHz <= 21
      && matrix.honestClient.measuredAckHz >= 9
      && matrix.honestClient.measuredAckHz <= 12,
    honestWindowBelowLimit: matrix.honestClient.maximumRollingTenSecondMessages < 384,
    honestAuthorityHealthy: matrix.honestClient.errors.length === 0
      && matrix.metrics.honest.acceptedInputs >= matrix.honestClient.inputMessages - 3,
    abuseCrossedExactRevisedLimit: matrix.abuse.configuredWindowMessages === 384
      && matrix.abuse.sentMessages === 385
      && matrix.abuse.rateLimitError.code === 'RATE_LIMITED'
      && matrix.abuse.close.code === 1008,
    transportMetricsSupportClaims: matrix.metrics.contract.transport.deltaSnapshotsSent >= 2
      && matrix.metrics.contract.transport.snapshotAcksRejected >= 2
      && matrix.metrics.contract.transport.snapshotAckTimeoutFallbacks >= 1
      && matrix.metrics.contract.transport.reliableEventResendBatches >= 1
      && matrix.metrics.contract.transport.reliableEventAcksRejected >= 1,
    sourceHashesStillMatch: sameJson(sourceHashesActual, matrix.sourceHashes),
    artifactInventoryMatches: sameJson(inventoryActual, matrix.artifactInventory),
    artifactPathsUnique: new Set(matrix.artifactInventory.map(({ path }) => path)).size
      === matrix.artifactInventory.length,
    artifactInventoryScopedToRun: matrix.artifactInventory.every(({ path: relative }) => (
      relative.startsWith(runPrefix)
    )),
    successfulRunHasNoCaptureError: !matrix.artifactInventory.some(({ path: relative }) => (
      relative.endsWith('/logs/capture-error.txt')
    )),
    ownedRuntimePortsReleased: matrix.cleanup.vitePort5173Free === true
      && matrix.cleanup.authorityPort8787Free === true,
    criticalBrowserLogEmpty: matrix.criticalBrowserLog.length === 0,
    aggregateAssertionsPassed: everyTrue(matrix.aggregateAssertions),
    bothPreservedFailuresPresent: failures.includes('attempt-1-red-contract')
      && failures.includes('attempt-2-tick-only-baseline-alias'),
    allTransportCaptureFailuresPreserved: EXPECTED_TRANSPORT_FAILURES.every((name) => (
      transportFailures.includes(name)
    )),
    scopeExplicitlyRetainsG3Boundary: matrix.scopeBoundary.some((value) => (
      value.includes('G3 remains unaccepted')
    )) && matrix.scopeBoundary.some((value) => value.includes('Slow-consumer')),
  };
  const verification = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    source: path.relative(REPO_ROOT, MATRIX_PATH).replaceAll('\\', '/'),
    status: everyTrue(checks)
      ? 'INDEPENDENT_G3_TRANSPORT_V1_VERIFICATION_PASS'
      : 'INDEPENDENT_G3_TRANSPORT_V1_VERIFICATION_FAIL',
    checks,
    preservedFailures: failures,
    preservedTransportFailures: transportFailures,
    independentlyComputed: {
      sourceHashes: sourceHashesActual,
      artifactInventory: inventoryActual,
      measuredInputHz: matrix.honestClient.measuredInputHz,
      measuredAckHz: matrix.honestClient.measuredAckHz,
      maximumRollingTenSecondMessages: matrix.honestClient.maximumRollingTenSecondMessages,
      deltaChain: {
        baseTick: matrix.contract.chainedDelta.baseTick,
        priorTick: matrix.contract.firstDelta.serverTick,
        baseId: matrix.contract.chainedDelta.baseSnapshotBaselineId,
        priorId: matrix.contract.firstDelta.snapshotBaselineId,
      },
    },
    gateDecision: 'NONE',
    gateClaim: 'G3_NOT_ACCEPTED',
    deploymentPerformed: false,
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(verification, null, 2)}\n`, 'utf8');
  process.stdout.write(`${verification.status}\n${OUTPUT_PATH}\n`);
  if (verification.status !== 'INDEPENDENT_G3_TRANSPORT_V1_VERIFICATION_PASS') {
    process.exitCode = 1;
  }
}

await main();
