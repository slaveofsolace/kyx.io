import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_ROOT = path.join(
  REPO_ROOT,
  'evidence/2026-07-22/phase-4-g3-multi-slow-socket',
);
const RUNS_ROOT = path.join(EVIDENCE_ROOT, 'runs');
const EXPECTED_STALLED_CLIENTS = 4;
const EXPECTED_MAXIMUM_ACK_DEBT_MILLISECONDS = 3_000;
const EXPECTED_MINIMUM_PINGS_PER_CLIENT = 8;
const PRIOR_SINGLE_CAPTURE = path.join(
  REPO_ROOT,
  'evidence/2026-07-22/phase-4-g3-real-slow-socket/runs/local-v1/real-slow-socket.json',
);
const PRIOR_SINGLE_VERIFICATION = path.join(
  REPO_ROOT,
  'evidence/2026-07-22/phase-4-g3-real-slow-socket/verification-local-v1.json',
);

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
    throw new Error(`${label} must be a child of ${path.relative(REPO_ROOT, root)}.`);
  }
  return resolved;
}

const RUN_ROOT = containedPath(requiredArgument('--run'), RUNS_ROOT, '--run');
const EVIDENCE_PATH = path.join(RUN_ROOT, 'multi-slow-socket.json');
const OUTPUT_PATH = containedPath(requiredArgument('--output'), EVIDENCE_ROOT, '--output');
const outputRelativeToRuns = path.relative(RUNS_ROOT, OUTPUT_PATH);
if (!outputRelativeToRuns.startsWith('..') && !path.isAbsolute(outputRelativeToRuns)) {
  throw new Error('--output must remain outside immutable run directories.');
}
if (path.extname(OUTPUT_PATH) !== '.json') throw new Error('--output must be JSON.');

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

async function recursiveFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await recursiveFiles(absolute));
    else if (entry.isFile()) result.push(absolute);
  }
  return result;
}

async function hashFile(absolute) {
  return createHash('sha256').update(await readFile(absolute)).digest('hex');
}

async function main() {
  const outputExists = await stat(OUTPUT_PATH).then(() => true).catch((error) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  });
  if (outputExists) {
    throw new Error('Independent verification output exists; preserve it and choose a fresh path.');
  }
  const capture = JSON.parse(await readFile(EVIDENCE_PATH, 'utf8'));
  const rawScenarioPath = path.join(RUN_ROOT, 'logs', 'multi-slow-scenario.json');
  const rawScenario = JSON.parse(await readFile(rawScenarioPath, 'utf8'));
  const sourceActual = await Promise.all(capture.sourceInventory.map(async ({ path: relative }) => (
    await fileRecord(path.join(REPO_ROOT, relative))
  )));
  const artifactActual = await Promise.all(capture.artifactInventory.map(async ({ path: relative }) => (
    await fileRecord(path.join(REPO_ROOT, relative))
  )));
  const runPrefix = `${path.relative(REPO_ROOT, RUN_ROOT).replaceAll('\\', '/')}/`;
  const allRunFiles = (await recursiveFiles(RUN_ROOT)).map((absolute) => (
    path.relative(REPO_ROOT, absolute).replaceAll('\\', '/')
  ));
  const priorSingle = {
    captureSha256: await hashFile(PRIOR_SINGLE_CAPTURE),
    verificationSha256: await hashFile(PRIOR_SINGLE_VERIFICATION),
  };
  const scenario = rawScenario;
  const stalled = scenario.stalled;
  const playerIds = [
    ...stalled.map(({ join }) => join.accepted.playerId),
    scenario.healthyJoin.accepted.playerId,
  ];
  const proxyPorts = new Set(stalled.map(({ proxy }) => proxy.proxyPort));
  const totalPingsRecomputed = stalled.reduce((sum, record) => sum + record.pingsSent, 0);
  const checks = {
    captureStatusPass: capture.status === 'LOCAL_G3_MULTI_SLOW_SOCKET_EVIDENCE_PASS',
    exactEvidenceIdentity:
      capture.evidenceId === 'phase-4-g3-multi-slow-socket-local-v1-2026-07-22',
    gateRemainsUnaccepted: capture.gateDecision === 'NONE'
      && capture.gateClaim === 'G3_NOT_ACCEPTED',
    noDeploymentPerformed: capture.deploymentPerformed === false,
    exactRawScenarioMatchesEmbedded: sameJson(rawScenario, capture.scenario),
    aggregateAssertionsAllPass: everyTrue(capture.aggregateAssertions),
    serializedScenarioAssertionsAllPass: everyTrue(capture.scenario.assertions),
    exactScenarioKind: scenario.scenario === 'multiple-real-paused-read-evictions',
    exactPinnedConstants:
      scenario.constants.stalledClientCount === EXPECTED_STALLED_CLIENTS
      && scenario.constants.maxSnapshotAckDebtMilliseconds
        === EXPECTED_MAXIMUM_ACK_DEBT_MILLISECONDS
      && scenario.constants.minimumPingsPerStalledClient
        === EXPECTED_MINIMUM_PINGS_PER_CLIENT,
    exactStalledClientCount: stalled.length === EXPECTED_STALLED_CLIENTS,
    exactSequentialOrdinals: sameJson(stalled.map(({ ordinal }) => ordinal), [1, 2, 3, 4]),
    everyPlayerIdentityDistinct: new Set(playerIds).size === EXPECTED_STALLED_CLIENTS + 1,
    oneOwnedEphemeralProxy: proxyPorts.size === 1
      && [...proxyPorts][0] > 0
      && [...proxyPorts][0] !== 8787,
    everySessionIndexDistinct: new Set(stalled.map(({ proxy }) => proxy.sessionIndex)).size
      === EXPECTED_STALLED_CLIENTS,
    everyUpstreamReadActuallyPaused: stalled.every(({ proxy }) => (
      proxy.upstreamWasPaused === true
    )),
    noDownstreamDataEventDuringAnyPause: stalled.every(({ proxy }) => (
      proxy.serverToClientBytesAtPause === proxy.serverToClientBytesBeforeResume
    )),
    everyUpstreamApplicationLegAdvanced: stalled.every((record) => (
      record.inboundBytesBeforeResume > record.proxy.clientToServerBytesAtPause
      && record.pingsSent >= EXPECTED_MINIMUM_PINGS_PER_CLIENT
    )),
    everyCloseFrameDrainedOnlyAfterResume: stalled.every(({ proxy }) => (
      proxy.serverToClientBytesAfterResume > proxy.serverToClientBytesBeforeResume
    )),
    everyPauseCrossedPinnedDebtWindow: stalled.every(({ proxy }) => (
      proxy.pauseDurationMilliseconds >= EXPECTED_MAXIMUM_ACK_DEBT_MILLISECONDS
    )),
    everyStalledClientClosedWithPinnedPolicy: stalled.every(({ close, client }) => (
      close.code === 1013
      && close.reason === 'Snapshot acknowledgement timeout'
      && sameJson(client.close, close)
      && client.readyState === 3
    )),
    noProxyOrProbeErrors: stalled.every(({ proxy, client }) => (
      proxy.sessionErrors.length === 0
      && proxy.serverErrors.length === 0
      && client.decodeOrSocketErrors.length === 0
    )) && scenario.healthyClient.decodeOrSocketErrors.length === 0,
    exactApplicationDebtEvictionDelta:
      scenario.metricsEvicted.transport.snapshotAckDebtEvictions
        - scenario.metricsInitial.transport.snapshotAckDebtEvictions
        === EXPECTED_STALLED_CLIENTS,
    exactSlowConsumerEvictionDelta:
      scenario.metricsEvicted.transport.slowConsumerEvictions
        - scenario.metricsInitial.transport.slowConsumerEvictions
        === EXPECTED_STALLED_CLIENTS,
    maximumDebtReachedPinnedWindow:
      scenario.metricsEvicted.transport.maximumSnapshotAckDebtMilliseconds
        >= EXPECTED_MAXIMUM_ACK_DEBT_MILLISECONDS,
    coalescingAndFallbackAppliedToStalledSet:
      scenario.metricsEvicted.transport.snapshotAckDebtSnapshotsCoalesced
        >= EXPECTED_STALLED_CLIENTS
      && scenario.metricsEvicted.transport.snapshotAckDebtReliableBatchesCoalesced
        >= EXPECTED_STALLED_CLIENTS
      && scenario.metricsEvicted.transport.snapshotAckTimeoutFallbacks
        >= EXPECTED_STALLED_CLIENTS,
    exactlyOneHealthyPeerRemained:
      scenario.metricsEvicted.connectedPlayers === 1
      && scenario.healthyClient.readyState === 1,
    healthyAuthorityContinuedAdvancing:
      scenario.healthyPostEvictionSnapshot.serverTick > scenario.metricsEvicted.serverTick
      && scenario.metricsFinal.serverTick >= scenario.healthyPostEvictionSnapshot.serverTick,
    totalPingsRecomputedExactly:
      scenario.totalPings === totalPingsRecomputed
      && scenario.metricsEvicted.transport.inboundMessagesReceived
        - scenario.metricsInitial.transport.inboundMessagesReceived >= totalPingsRecomputed,
    sourcePathsUnique: new Set(capture.sourceInventory.map(({ path }) => path)).size
      === capture.sourceInventory.length,
    sourceUnchangedDuringCapture: sameJson(
      capture.sourceInventoryAtStart,
      capture.sourceInventory,
    ),
    sourceHashesAndSizesMatchCurrent: sameJson(sourceActual, capture.sourceInventory),
    artifactPathsUnique: new Set(capture.artifactInventory.map(({ path }) => path)).size
      === capture.artifactInventory.length,
    artifactHashesAndSizesMatch: sameJson(artifactActual, capture.artifactInventory),
    artifactInventoryCoversEveryNonCaptureRunFile: sameJson(
      [...capture.artifactInventory.map(({ path }) => path)].sort(),
      allRunFiles.filter((relative) => relative !== path.relative(REPO_ROOT, EVIDENCE_PATH)
        .replaceAll('\\', '/')).sort(),
    ),
    artifactsScopedToSelectedRun: capture.artifactInventory.every(({ path: relative }) => (
      relative.startsWith(runPrefix)
    )),
    rawScenarioArtifactPresent: capture.artifactInventory.some(({ path: relative }) => (
      relative === `${runPrefix}logs/multi-slow-scenario.json`
    )),
    ownedPortReleased: capture.cleanup.authorityPort8787Free === true,
    singleSlowSocketEvidencePreserved:
      priorSingle.captureSha256
        === '49748dd8be977fd4cba1ec7feab989f1852157f8df4a1a28c6e4bc4ecf37e49c'
      && priorSingle.verificationSha256
        === '403a4419982d174626b358326f110511c35594e3732d7453973dbd79ce0e510d',
    operatingSystemBufferBoundaryDeclared: capture.scopeBoundary.some((value) => (
      value.includes('does not claim operating-system socket-buffer saturation')
    )),
    stagingAndResourceGapsDeclared: capture.scopeBoundary.some((value) => (
      value.includes('Public authentication')
      && value.includes('external staging')
      && value.includes('CPU/memory/storage/bandwidth/cost')
    )),
    noUnsafeProjectMutationDeclared: capture.scopeBoundary.some((value) => (
      value.includes('No deployment, publication, commit, reset, clean, or stash')
    )),
  };
  const result = {
    schemaVersion: 1,
    verifiedAt: new Date().toISOString(),
    evidencePath: path.relative(REPO_ROOT, EVIDENCE_PATH).replaceAll('\\', '/'),
    status: everyTrue(checks)
      ? 'INDEPENDENT_G3_MULTI_SLOW_SOCKET_VERIFICATION_PASS'
      : 'INDEPENDENT_G3_MULTI_SLOW_SOCKET_VERIFICATION_FAIL',
    gateClaim: 'G3_NOT_ACCEPTED',
    checks,
    stalledClientCount: stalled.length,
    totalPingsRecomputed,
    sourceFileCount: capture.sourceInventory.length,
    artifactCount: capture.artifactInventory.length,
    priorSingle,
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${result.status}\n`);
  if (result.status.endsWith('_FAIL')) process.exitCode = 1;
}

await main();
