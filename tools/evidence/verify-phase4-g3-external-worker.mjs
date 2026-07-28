import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_ROOT = path.join(
  REPO_ROOT,
  'evidence/2026-07-22/phase-4-g3-external-worker',
);
const RUNS_ROOT = path.join(EVIDENCE_ROOT, 'runs');
const VERIFICATIONS_ROOT = path.join(EVIDENCE_ROOT, 'verifications');
const RUNTIME_FILENAME = 'external-worker-runtime.json';
const LOCALHOST_ORIGIN = 'http://127.0.0.1:5173';
const FORBIDDEN_ORIGIN = 'https://g3-forbidden-origin.invalid';

const SOURCE_FILES = Object.freeze([
  'package-lock.json',
  'src/net/protocol.ts',
  'src/net/schemas.ts',
  'worker/reliableEvents.ts',
  'worker/resumeSessions.ts',
  'worker/resumeToken.ts',
  'worker/room.ts',
  'worker/security.ts',
  'worker/snapshotBaselines.ts',
  'worker/worker.ts',
  'tools/evidence/capture-phase4-g3-external-worker.mjs',
  'tools/evidence/verify-phase4-g3-external-worker.mjs',
]);

const ASSERTION_KEYS = Object.freeze([
  'httpsHealthReached',
  'expectedBuildIdMatched',
  'roomBindingHealthy',
  'forbiddenOriginRejected',
  'httpsRoomCreated',
  'wssTransportUsed',
  'twoConcurrentProtocolV2Clients',
  'bothClientsJoined',
  'serverTickAdvanced',
  'bothClientsMaterializedDeltas',
  'bothClientsAutoAcknowledged',
  'inputAcceptedByAuthority',
  'authoritativeMovementObservedByBothClients',
  'forgedTransformRejected',
  'forgedTransformDidNotMutateAuthority',
  'initialSocketClosedCleanly',
  'resumeAuthenticatedByOpaqueCredential',
  'resumeIdentityPreserved',
  'resumeCredentialRotatedWithoutSerialization',
  'resumeStartedWithFullSnapshot',
  'metricsHealthy',
  'sourceFrozen',
  'sensitiveValuesNotSerialized',
  'scopeBoundariesRecorded',
]);

const TIMING_KEYS = Object.freeze([
  'healthMs',
  'forbiddenOriginMs',
  'createRoomMs',
  'clientAOpenMs',
  'clientAJoinAcceptedMs',
  'clientAInitialFullMs',
  'clientBOpenMs',
  'clientBJoinAcceptedMs',
  'clientBInitialFullMs',
  'tickAdvanceMs',
  'inputAckMs',
  'clientAAuthorityMovementMs',
  'clientBObservedMovementMs',
  'forgedTransformRejectionMs',
  'postForgerySnapshotMs',
  'resumeOpenMs',
  'resumeAcceptedMs',
  'resumeFullSnapshotMs',
  'metricsMs',
  'totalMs',
]);

function usage() {
  return [
    'Usage:',
    '  node tools/evidence/verify-phase4-g3-external-worker.mjs',
    '    --worker-origin https://<external-worker-host>',
    '    --expected-build-id <exact BUILD_ID>',
    '    --run evidence/2026-07-22/phase-4-g3-external-worker/runs/<run-id>',
    '    --output evidence/2026-07-22/phase-4-g3-external-worker/verifications/<fresh-id>.json',
  ].join('\n');
}

function requiredArgument(name) {
  const indexes = process.argv.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length !== 1) throw new Error(`${name} must be provided exactly once.`);
  const value = process.argv[indexes[0] + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function workerOrigin(value) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') throw new Error('--worker-origin must use HTTPS.');
  if (parsed.username !== '' || parsed.password !== '') {
    throw new Error('--worker-origin cannot contain credentials.');
  }
  if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
    throw new Error('--worker-origin must be an origin without a path, query, or fragment.');
  }
  return parsed.origin;
}

function expectedBuildId(value) {
  if (value.trim() !== value || value.length === 0 || Buffer.byteLength(value, 'utf8') > 64) {
    throw new Error('--expected-build-id must be 1-64 UTF-8 bytes without outer whitespace.');
  }
  return value;
}

function containedChild(value, root, label) {
  const resolved = path.resolve(REPO_ROOT, value);
  const relative = path.relative(root, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a child of ${path.relative(REPO_ROOT, root)}.`);
  }
  return resolved;
}

async function exists(absolute) {
  return await stat(absolute).then(() => true).catch((error) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  });
}

async function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function sourceHashes() {
  return Object.fromEntries(await Promise.all(SOURCE_FILES.map(async (relative) => {
    const bytes = await readFile(path.join(REPO_ROOT, relative));
    return [relative, await sha256Bytes(bytes)];
  })));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function exactKeys(value, expected) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && sameJson(Object.keys(value).sort(), [...expected].sort());
}

function everyTrue(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.values(value).every((entry) => entry === true);
}

function validClientSummary(summary, minimumFullSnapshots = 1) {
  return summary?.wss === true
    && summary.upgradeStatus === 101
    && summary.protocolVersionViolations === 0
    && summary.binaryMessages === 0
    && summary.parseFailures === 0
    && summary.fullSnapshotsMaterialized >= minimumFullSnapshots
    && summary.deltaSnapshotsMaterialized >= 1
    && summary.deltaBaselineMisses === 0
    && summary.fullRecoveryRequests === 0
    && summary.acknowledgementsSent >= 2
    && summary.reliableHistoryGaps === 0
    && summary.socketErrors === 0;
}

function validTimings(timings) {
  if (!exactKeys(timings, TIMING_KEYS)) return false;
  return Object.entries(timings).every(([key, value]) => (
    typeof value === 'number'
      && Number.isFinite(value)
      && value >= 0
      && (key === 'totalMs' ? value <= 180_000 : value <= 30_000)
  ));
}

function forbiddenCredentialFields(value, currentPath = '$') {
  const forbidden = new Set([
    'resumetoken',
    'accesstoken',
    'authorization',
    'cookie',
    'password',
    'secret',
    'credentials',
  ]);
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => forbiddenCredentialFields(entry, `${currentPath}[${index}]`));
  }
  if (value === null || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, entry]) => {
    const normalized = key.replaceAll(/[^a-z0-9]/giu, '').toLowerCase();
    const nestedPath = `${currentPath}.${key}`;
    return [
      ...(forbidden.has(normalized) ? [nestedPath] : []),
      ...forbiddenCredentialFields(entry, nestedPath),
    ];
  });
}

function opaqueCredentialLikeValues(value, currentPath = '$') {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => opaqueCredentialLikeValues(entry, `${currentPath}[${index}]`));
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, entry]) => (
      opaqueCredentialLikeValues(entry, `${currentPath}.${key}`)
    ));
  }
  if (
    typeof value === 'string'
    && /^[A-Za-z0-9_-]{43}$/u.test(value)
    && currentPath !== '$.target.expectedBuildId'
    && currentPath !== '$.target.observedBuildId'
  ) return [currentPath];
  return [];
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log(usage());
    return;
  }
  const authorityOrigin = workerOrigin(requiredArgument('--worker-origin'));
  const buildId = expectedBuildId(requiredArgument('--expected-build-id'));
  const runRoot = containedChild(requiredArgument('--run'), RUNS_ROOT, '--run');
  const outputPath = containedChild(
    requiredArgument('--output'),
    VERIFICATIONS_ROOT,
    '--output',
  );
  if (path.extname(outputPath) !== '.json') throw new Error('--output must be a JSON file.');
  if (await exists(outputPath)) {
    throw new Error('--output already exists; preserve it and choose a fresh immutable path.');
  }
  const runtimePath = path.join(runRoot, RUNTIME_FILENAME);
  const runtimeBytes = await readFile(runtimePath);
  const runtime = JSON.parse(runtimeBytes.toString('utf8'));
  const currentHashes = await sourceHashes();
  const credentialFieldPaths = forbiddenCredentialFields(runtime);
  const opaqueCredentialPaths = opaqueCredentialLikeValues(runtime);
  const transport = runtime.transport;
  const boundaries = runtime.boundaries;
  const metrics = runtime.metrics;
  const metricSnapshot = metrics?.snapshot;
  const transportMetrics = metricSnapshot?.transport;

  const checks = {
    runtimeSchemaVersion: runtime.schemaVersion === 1
      && runtime.evidenceKind === 'g3-external-worker-transport-smoke',
    capturePassed: runtime.status === 'EXTERNAL_WORKER_TRANSPORT_SMOKE_PASS',
    gateRemainsUnaccepted: runtime.gateDecision === 'NONE'
      && runtime.gateClaim === 'G3_NOT_ACCEPTED',
    noDeploymentPerformed: runtime.deploymentPerformed === false,
    targetPinnedIndependently: runtime.target?.workerOrigin === authorityOrigin
      && runtime.target?.expectedBuildId === buildId
      && runtime.target?.observedBuildId === buildId,
    strictExternalTlsRecorded: runtime.target?.targetKind === 'ephemeral-preview'
      && runtime.target?.tls?.httpScheme === 'https:'
      && runtime.target?.tls?.webSocketScheme === 'wss:'
      && runtime.target?.tls?.certificateVerification === 'node-default-strict',
    exactScopeBoundaries: boundaries?.localhostOriginAllowed === true
      && boundaries?.allowedOrigin === LOCALHOST_ORIGIN
      && boundaries?.productionOriginAuthenticationExercised === false
      && boundaries?.productionProductFlowExercised === false
      && boundaries?.externalAccessCredentialExercised === false
      && boundaries?.roomMetricsReadCredentialExercised === true
      && boundaries?.opaqueResumePossessionAuthenticationExercised === true
      && boundaries?.ephemeralPreviewOnly === true
      && boundaries?.durableStagingClaimed === false
      && boundaries?.remoteSourceAttestation === 'expected-build-id-only'
      && boundaries?.g3AcceptanceClaimed === false,
    credentialFieldsAbsent: credentialFieldPaths.length === 0,
    opaqueCredentialValuesAbsent: opaqueCredentialPaths.length === 0,
    noRawPayloadSerialization: runtime.security?.rawProtocolPayloadsSerialized === false
      && runtime.security?.sensitiveValuesSerialized === false
      && runtime.security?.externalAccessCredentialExercised === false
      && runtime.security?.resumePossessionAuthenticationExercised === true,
    exactAssertionContract: exactKeys(runtime.assertions, ASSERTION_KEYS),
    everyCaptureAssertionPassed: everyTrue(runtime.assertions),
    exactFrozenSourceSet: sameJson(runtime.sourceFreeze?.files, SOURCE_FILES),
    captureSourceStartEndMatch: runtime.sourceFreeze?.unchanged === true
      && sameJson(runtime.sourceFreeze?.hashesAtStart, runtime.sourceFreeze?.hashesAtEnd),
    currentSourceMatchesCapture: sameJson(runtime.sourceFreeze?.hashesAtEnd, currentHashes),
    httpsHttpContract: runtime.http?.health?.status === 200
      && runtime.http?.health?.ok === true
      && runtime.http?.health?.expectedBuildIdMatched === true
      && runtime.http?.health?.roomBinding === true
      && runtime.http?.forbiddenOrigin?.origin === FORBIDDEN_ORIGIN
      && runtime.http?.forbiddenOrigin?.status === 403
      && runtime.http?.forbiddenOrigin?.code === 'ORIGIN_NOT_ALLOWED'
      && runtime.http?.createRoom?.status === 201
      && runtime.http?.createRoom?.ok === true
      && runtime.http?.createRoom?.roomCodePatternMatched === true
      && runtime.http?.createRoom?.socketPathMatched === true
      && runtime.http?.createRoom?.metricsPathMatched === true
      && runtime.http?.createRoom?.metricsCredentialIssued === true,
    twoProtocolV2Clients: transport?.protocolVersion === 2
      && transport?.concurrentGameplayClients === 2
      && transport?.maximumConcurrentOpenSockets === 2
      && transport?.physicalConnectionsOpened === 3,
    protocolClientsHealthy: validClientSummary(transport?.clientA)
      && validClientSummary(transport?.clientB)
      && validClientSummary(transport?.resumedClientA),
    tickAndInputAuthorityProved: Number.isSafeInteger(transport?.tick?.initial)
      && transport.tick.advanced >= transport.tick.initial + 4
      && transport.tick.inputAcknowledged >= transport.tick.advanced
      && transport.tick.resumed >= transport.tick.inputAcknowledged
      && transport?.inputAuthority?.acceptedSequence === 0
      && transport.inputAuthority.acceptedByMetrics >= 1
      && transport.inputAuthority.movementObservedBySender === true
      && transport.inputAuthority.movementObservedByPeer === true,
    forgedTransformRejectedWithoutMutation:
      transport?.forgedTransform?.rejectionCode === 'PROTOCOL_FORBIDDEN_COMMAND'
      && transport.forgedTransform.authoritativeTargetAbsent === true,
    authenticatedResumeProved: transport?.resume?.originalCloseCode === 1000
      && transport.resume.connectionMode === 'resumed'
      && transport.resume.playerIdentityPreserved === true
      && transport.resume.matchIdentityPreserved === true
      && transport.resume.opaqueCredentialRotated === true
      && transport.resume.fullSnapshotFirst === true,
    healthyMetrics: metrics?.status === 200
      && metrics.ok === true
      && metrics.healthy === true
      && Number.isSafeInteger(metricSnapshot?.serverTick)
      && (metricSnapshot.lifecycle === 'warmup' || metricSnapshot.lifecycle === 'active')
      && metricSnapshot.players === 2
      && metricSnapshot.connectedPlayers === 2
      && metricSnapshot.acceptedInputs >= 1
      && metricSnapshot.inputRejections === 0
      && transportMetrics?.inboundMessagesReceived >= 1
      && transportMetrics?.inboundMessagesRateAccepted >= 1
      && transportMetrics?.inboundMessagesRateRejected === 0
      && transportMetrics?.fullSnapshotsSent >= 3
      && transportMetrics?.deltaSnapshotsSent >= 1
      && transportMetrics?.snapshotAcksAccepted >= 1
      && transportMetrics?.snapshotAcksRejected === 0
      && transportMetrics?.slowConsumerEvictions === 0,
    latencyTimingsComplete: validTimings(runtime.timings),
    immutableRunArtifactPath: path.basename(runtimePath) === RUNTIME_FILENAME
      && path.dirname(runtimePath) === runRoot,
  };
  const passed = Object.values(checks).every((value) => value === true);
  const verification = {
    schemaVersion: 1,
    verificationKind: 'g3-external-worker-independent-verification',
    status: passed ? 'INDEPENDENT_VERIFICATION_PASS' : 'INDEPENDENT_VERIFICATION_FAIL',
    gateDecision: 'NONE',
    gateClaim: 'G3_NOT_ACCEPTED',
    deploymentPerformed: false,
    verifiedAt: new Date().toISOString(),
    expectedTarget: {
      workerOrigin: authorityOrigin,
      expectedBuildId: buildId,
      targetKind: 'ephemeral-preview',
    },
    runtimeArtifact: {
      path: path.relative(REPO_ROOT, runtimePath).replaceAll('\\', '/'),
      bytes: runtimeBytes.byteLength,
      sha256: await sha256Bytes(runtimeBytes),
    },
    sourceHashesCurrent: currentHashes,
    credentialAudit: {
      forbiddenFieldCount: credentialFieldPaths.length,
      opaqueCredentialLikeValueCount: opaqueCredentialPaths.length,
      sensitiveValuesSerialized: false,
    },
    checks,
    boundaries: {
      localhostOriginTransportOnly: true,
      productionOriginAuthenticationOrProductFlowProved: false,
      durableStagingProved: false,
      ephemeralPreviewOnly: true,
      g3Accepted: false,
    },
  };
  if (forbiddenCredentialFields(verification).length > 0) {
    throw new Error('Independent verification contains a forbidden credential field.');
  }
  await mkdir(VERIFICATIONS_ROOT, { recursive: true });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(verification, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  });
  console.log(JSON.stringify({
    status: verification.status,
    output: path.relative(REPO_ROOT, outputPath).replaceAll('\\', '/'),
    gateClaim: verification.gateClaim,
  }));
  if (!passed) process.exitCode = 1;
}

await main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Unknown verification failure.';
  console.error(`External Worker verification failed: ${message}`);
  process.exitCode = 1;
});
