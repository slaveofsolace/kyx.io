import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizeTransportLimitContract,
  verifyTransportFloodEvidence,
} from './g3-expanded-transport-contract.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_ROOT = path.join(REPO_ROOT, 'evidence/2026-07-21/phase-4-g3-expanded');
const RUNS_ROOT = path.join(EVIDENCE_ROOT, 'runs');

function requiredArgument(name) {
  const indexes = process.argv.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length !== 1) throw new Error(`${name} must be provided exactly once.`);
  const value = process.argv[indexes[0] + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a path value.`);
  }
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

const RUN_ROOT = containedPath(requiredArgument('--run'), RUNS_ROOT, '--run');
const MATRIX_PATH = path.join(RUN_ROOT, 'expanded-runtime-matrix.json');
const OUTPUT_PATH = containedPath(requiredArgument('--output'), EVIDENCE_ROOT, '--output');
const outputRelativeToRuns = path.relative(RUNS_ROOT, OUTPUT_PATH);
if (!outputRelativeToRuns.startsWith('..') && !path.isAbsolute(outputRelativeToRuns)) {
  throw new Error('--output must remain outside immutable capture run directories.');
}
if (path.extname(OUTPUT_PATH) !== '.json') throw new Error('--output must be a JSON file.');

const EXPECTED_PROFILES = Object.freeze([
  'matrix-rtt-0',
  'matrix-rtt-50',
  'matrix-rtt-100',
  'matrix-rtt-200',
  'matrix-rtt-350',
  'matrix-jitter-15',
  'matrix-jitter-50',
  'matrix-loss-1',
  'matrix-loss-3',
  'matrix-loss-8',
  'matrix-duplicate-1',
  'matrix-duplicate-5',
  'matrix-targeted-reorder',
  'matrix-outage-recovery',
]);

const EXPECTED_VIDEO_PROFILES = Object.freeze([
  'matrix-rtt-350',
  'matrix-targeted-reorder',
  'matrix-outage-recovery',
]);

const EXPECTED_LIFECYCLE_ASSERTIONS = Object.freeze([
  'initialJoinFullSnapshot',
  'serverTickAdvancedWithoutInput',
  'passiveActivationPeerDistinctAndVisibleWithoutInput',
  'lateJoinFullSnapshotContainsExistingMovedPlayer',
  'duplicateActiveSessionRejected',
  'explicitFullResyncCorrelated',
  'fullResyncRateBounded',
  'protocolVersionRejected',
  'disconnectGracePreservedThenRemovedPlayer',
  'authenticatedReconnectPreservedIdentity',
  'resumeRotatedOpaqueToken',
  'reconnectBeganWithFullSnapshot',
  'replayedResumeTokenRejected',
  'finalRoomHealthy',
]);

const EXPECTED_REFRESH_ASSERTIONS = Object.freeze([
  'activeSocketWasOpenAtDocumentReload',
  'realDocumentReloadOccurred',
  'playerIdentityPreserved',
  'matchIdentityPreserved',
  'connectionModeResumed',
  'tokenRotated',
  'resumedWithFullSnapshot',
  'zeroUnexpectedCriticalBrowserFailuresAcrossReload',
]);

const EXPECTED_ABUSE_ASSERTIONS = Object.freeze([
  'forgedTransformRejected',
  'forgedPlayerIdRejected',
  'replayRejected',
  'sequenceLeadRejected',
  'queueFloodRateLimitedAndDisconnected',
  'oversizedMessageRejected',
  'invalidJsonRejected',
  'forgedTransformDidNotMutateState',
  'socketRemainedOpen',
  'transportFloodCountersExact',
  'queueFloodRejectedAndBounded',
]);

function sameJson(first, second) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function everyTrue(record) {
  return Object.values(record).every((value) => value === true);
}

function exactKeys(record, expected) {
  return sameJson(Object.keys(record).sort(), [...expected].sort());
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
  const root = path.join(EVIDENCE_ROOT, 'failures');
  const attempts = await readdir(root, { withFileTypes: true }).catch(() => []);
  return await Promise.all(attempts.filter((entry) => entry.isDirectory()).map(async ({ name }) => {
    const files = (await recursiveFiles(path.join(root, name))).sort();
    return {
      attempt: name,
      files: await Promise.all(files.map(fileRecord)),
    };
  }));
}

async function main() {
  const outputAlreadyExists = await stat(OUTPUT_PATH).then(() => true).catch((error) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  });
  if (outputAlreadyExists) {
    throw new Error('Independent verification output already exists; preserve it and choose a fresh --output.');
  }
  const matrix = JSON.parse(await readFile(MATRIX_PATH, 'utf8'));
  const transportContractBytes = await readFile(path.join(REPO_ROOT, 'worker/transport-limits.json'));
  const expectedTransportContract = normalizeTransportLimitContract(
    JSON.parse(transportContractBytes.toString('utf8')),
    createHash('sha256').update(transportContractBytes).digest('hex'),
  );
  const transportFloodVerification = verifyTransportFloodEvidence(
    matrix.abuse?.transportFlood,
    expectedTransportContract,
  );
  const rawProfiles = await Promise.all(EXPECTED_PROFILES.map(async (profile) => ({
    profile,
    value: JSON.parse(await readFile(path.join(RUN_ROOT, 'profiles', `${profile}.json`), 'utf8')),
  })));
  const inventoryActual = await Promise.all(matrix.artifactInventory.map(async ({ path: relative }) => (
    await fileRecord(path.join(REPO_ROOT, relative))
  )));
  const failures = await failureInventory();
  const priorV13Root = path.join(RUNS_ROOT, 'local-v13');
  const priorV13Files = await recursiveFiles(priorV13Root).catch(() => []);
  const priorV13Failure = await readFile(
    path.join(priorV13Root, 'logs', 'capture-error.txt'),
    'utf8',
  ).catch(() => null);
  const runPrefix = `${path.relative(REPO_ROOT, RUN_ROOT).replaceAll('\\', '/')}/`;
  const artifactPaths = new Set(matrix.artifactInventory.map(({ path: relative }) => relative));

  const checks = {
    matrixStatusPass: matrix.status === 'EXPANDED_LOCAL_G3_EVIDENCE_PASS',
    freshRunIdentity: matrix.evidenceId === 'phase-4-g3-expanded-local-v14-2026-07-22',
    gateRemainsUnaccepted: matrix.gateDecision === 'NONE'
      && matrix.gateClaim === 'G3_NOT_ACCEPTED',
    noDeploymentPerformed: matrix.deploymentPerformed === false,
    exactProfileOrder: sameJson(matrix.profileOrder, EXPECTED_PROFILES),
    exactEmbeddedProfiles: sameJson(
      matrix.profiles.map(({ profile }) => profile),
      EXPECTED_PROFILES,
    ),
    everyProfilePassed: matrix.profiles.every(({ passed, assertions }) => (
      passed === true && everyTrue(assertions)
    )),
    everyObserverBMotionAssertionPassed: matrix.profiles.every(({ assertions }) => (
      assertions.observerBInterpolatedMovedPeerDuringMotion === true
    )),
    everyObserverBMotionSampleTiedToMovedPeer: matrix.profiles.every(({ snapshots, remotePresentation }) => (
      remotePresentation.observerBMotion?.modes?.interpolated
        > snapshots.beforeB.counters.interpolationModes.interpolated
      && remotePresentation.observerBMotion?.presentation?.remotes?.some(({ entityId, mode }) => (
        entityId === snapshots.joinedA.authority.playerId && mode === 'interpolated'
      )) === true
    )),
    everyObserverBMotionOverlayMatchesStructuredSample: matrix.profiles.every(({
      snapshots,
      remotePresentation,
      visualEvidence,
    }) => {
      const observer = remotePresentation.observerBMotion;
      const proof = visualEvidence.observerBMotionOverlay;
      const sample = observer?.structuredSample;
      return proof?.elementId === 'kyx-dev-only-observer-proof'
        && proof.label === 'DEV-ONLY OBSERVER PROOF'
        && sample?.capturedAt === observer.capturedAt
        && sample.entityId === snapshots.joinedA.authority.playerId
        && sample.mode === 'interpolated'
        && sample.estimatedServerTick === observer.presentation.estimatedServerTick
        && observer.presentation.remotes.some(({ entityId, mode }) => (
          entityId === sample.entityId && mode === sample.mode
        ))
        && sameJson(proof.payload, sample)
        && sameJson(proof.renderedPayload, sample);
    }),
    versionedDeltaTransportObservedInEveryProfile: matrix.profiles.every(({ workerMetrics }) => (
      workerMetrics.final.transport.fullSnapshotsSent >= 2
      && workerMetrics.final.transport.deltaSnapshotsSent > 0
      && workerMetrics.final.transport.snapshotAcksAccepted > 0
    )),
    rawProfilesMatchEmbedded: rawProfiles.every(({ profile, value }, index) => (
      value.profile === profile && sameJson(value, matrix.profiles[index])
    )),
    exactRttRows: sameJson(
      matrix.coverage.rttMilliseconds.map(({ value }) => value),
      [0, 50, 100, 200, 350],
    ),
    exactJitterRows: sameJson(
      matrix.coverage.jitterPlusMinusMilliseconds.map(({ value }) => value),
      [0, 15, 50],
    ),
    exactLossRows: sameJson(
      matrix.coverage.lossPercent.map(({ value }) => value),
      [0, 1, 3, 8],
    ),
    exactDuplicationRows: sameJson(
      matrix.coverage.duplicationPercent.map(({ value }) => value),
      [0, 1, 5],
    ),
    exactTargetedReorderRow: sameJson(
      matrix.coverage.reordering,
      [{ value: 'targeted-burst', evidenceProfile: 'matrix-targeted-reorder' }],
    ),
    exactBoundedRecoveryRow: sameJson(
      matrix.coverage.recovery,
      [{ value: 'bounded-outage', evidenceProfile: 'matrix-outage-recovery' }],
    ),
    exactRenderRows: sameJson(matrix.renderRates.rows.map(({ targetHz }) => targetHz), [30, 60, 120]),
    everyRenderAssertionPassed: matrix.renderRates.passed === true
      && matrix.renderRates.rows.every(({ passed, assertions }) => passed === true && everyTrue(assertions)),
    exactLifecycleAssertions: exactKeys(matrix.lifecycle.assertions, EXPECTED_LIFECYCLE_ASSERTIONS),
    everyLifecycleAssertionPassed: matrix.lifecycle.passed === true
      && everyTrue(matrix.lifecycle.assertions),
    lifecycleProtocolClientsAcknowledgedSnapshots:
      matrix.lifecycle.protocolClientDiagnostics.aAcknowledgementsSent > 0
      && matrix.lifecycle.protocolClientDiagnostics.activationAcknowledgementsSent > 0
      && matrix.lifecycle.protocolClientDiagnostics.bAcknowledgementsSent > 0
      && matrix.lifecycle.protocolClientDiagnostics.resumedAcknowledgementsSent > 0
      && matrix.lifecycle.protocolClientDiagnostics.deltaBaselineMisses === 0,
    exactRefreshAssertions: exactKeys(
      matrix.refreshResume.assertions,
      EXPECTED_REFRESH_ASSERTIONS,
    ),
    everyRefreshAssertionPassed: matrix.refreshResume.passed === true
      && everyTrue(matrix.refreshResume.assertions),
    refreshProtocolClientsAcknowledgedSnapshots:
      matrix.refreshResume.prepared.acknowledgementsSentBeforeReload > 0
      && matrix.refreshResume.resumed.protocolClientDiagnostics.acknowledgementsSent > 0,
    exactAbuseAssertions: exactKeys(matrix.abuse.assertions, EXPECTED_ABUSE_ASSERTIONS),
    everyAbuseAssertionPassed: matrix.abuse.passed === true && everyTrue(matrix.abuse.assertions),
    abuseProtocolClientsAcknowledgedSnapshots:
      matrix.abuse.protocolClientDiagnostics.attackerAcknowledgementsSent > 0
      && matrix.abuse.protocolClientDiagnostics.witnessAcknowledgementsSent > 0
      && matrix.abuse.protocolClientDiagnostics.deltaBaselineMisses === 0,
    transportContractRecordedExactly: sameJson(
      matrix.runtime.transportContract,
      expectedTransportContract,
    ),
    ...Object.fromEntries(Object.entries(transportFloodVerification.checks).map(([key, value]) => (
      [`transportFlood${key[0].toUpperCase()}${key.slice(1)}`, value]
    ))),
    aggregateAssertionsPassed: everyTrue(matrix.aggregateAssertions),
    artifactPathsUnique: new Set(matrix.artifactInventory.map(({ path }) => path)).size
      === matrix.artifactInventory.length,
    artifactHashesAndSizesMatch: sameJson(inventoryActual, matrix.artifactInventory),
    artifactPathsScopedToSelectedRun: matrix.artifactInventory.every(({ path: relative }) => (
      relative.startsWith(runPrefix)
    )),
    observerBMotionScreenshotsPresent: EXPECTED_PROFILES.every((profile) => (
      artifactPaths.has(`${runPrefix}screenshots/${profile}-b-motion.png`)
    )),
    bothPeerVideosPresentForRequiredProfiles: EXPECTED_VIDEO_PROFILES.every((profile) => (
      artifactPaths.has(`${runPrefix}video/${profile}-a.webm`)
      && artifactPaths.has(`${runPrefix}video/${profile}-b.webm`)
    )),
    ownedRuntimePortsReleased: matrix.cleanup?.vitePort5173Free === true
      && matrix.cleanup?.authorityPort8787Free === true,
    priorFailedAttemptsPreserved: [
      ['attempt-1-lifecycle-fetch-failed', '/logs/capture-error.txt'],
      ['attempt-2-minimum-player-tick-precondition', '/logs/capture-error.txt'],
      ['attempt-3-queue-flood-not-saturated', '/logs/capture-error.txt'],
      ['attempt-4-reload-abort-misclassified', '/expanded-runtime-matrix.json'],
      ['attempt-5-room-metrics-503', '/logs/capture-error.txt'],
    ].every(([expectedAttempt, requiredSuffix]) => failures.some(({ attempt, files }) => (
      attempt === expectedAttempt
        && files.some(({ path }) => path.endsWith(requiredSuffix))
        && files.length > 0
    ))),
    priorV13AckDebtHarnessFailurePreserved: priorV13Files.length > 0
      && priorV13Failure?.includes('Timed out waiting for A authoritative movement') === true,
    factoredSweepBoundaryDeclared: matrix.scopeBoundary.some((value) => (
      value.includes('not the 540-case Cartesian product')
    )),
    physical120HzBoundaryDeclared: matrix.scopeBoundary.some((value) => (
      value.includes('not physical 120 Hz monitor/video proof')
    )),
    successorTransportBoundaryDeclared: matrix.scopeBoundary.some((value) => (
      value.includes('versioned acknowledged delta snapshots')
        && value.includes('separate successor transport evidence')
    )) && !matrix.scopeBoundary.some((value) => value.includes('full snapshots only')),
    slowClientAndStagingGapsDeclared: matrix.scopeBoundary.some((value) => (
      value.includes('Slow-consumer/backpressure saturation')
        && value.includes('staging WSS')
        && value.includes('load/soak')
    )),
  };
  const result = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    matrixPath: path.relative(REPO_ROOT, MATRIX_PATH).replaceAll('\\', '/'),
    status: everyTrue(checks)
      ? 'INDEPENDENT_EXPANDED_G3_VERIFICATION_PASS'
      : 'INDEPENDENT_EXPANDED_G3_VERIFICATION_FAIL',
    gateClaim: 'G3_NOT_ACCEPTED',
    checks,
    profileCount: matrix.profiles.length,
    renderRowCount: matrix.renderRates.rows.length,
    lifecycleAssertionCount: Object.keys(matrix.lifecycle.assertions).length,
    refreshAssertionCount: Object.keys(matrix.refreshResume.assertions).length,
    abuseAssertionCount: Object.keys(matrix.abuse.assertions).length,
    artifactCount: matrix.artifactInventory.length,
    preservedFailureAttempts: failures,
    transportFloodVerification,
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${result.status}\n`);
  if (result.status.endsWith('_FAIL')) process.exitCode = 1;
}

await main();
