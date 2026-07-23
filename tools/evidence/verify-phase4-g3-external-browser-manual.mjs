import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE_ROOT = path.join(
  REPO_ROOT,
  'evidence',
  '2026-07-22',
  'phase-4-g3-external-browser',
);
const RUNTIME_FILENAME = 'manual-visual-runtime.json';
const FORBIDDEN_KEYS = new Set([
  'accessToken',
  'authorization',
  'cookie',
  'password',
  'resumeToken',
  'secret',
]);

function requiredArgument(name) {
  const indexes = process.argv.flatMap((value, index) => value === name ? [index] : []);
  if (indexes.length !== 1) throw new Error(`${name} must be provided exactly once.`);
  const value = process.argv[indexes[0] + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value.`);
  return value;
}

function contained(value, label) {
  const resolved = path.resolve(REPO_ROOT, value);
  const relative = path.relative(EVIDENCE_ROOT, resolved);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`${label} must remain inside the external-browser evidence root.`);
  }
  return resolved;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactKeys(record, expected) {
  return JSON.stringify(Object.keys(record)) === JSON.stringify(expected);
}

function auditSensitive(value, pathLabel = '$', result = { keys: [], opaqueValues: [] }) {
  if (typeof value === 'string') {
    if (/^[A-Za-z0-9_-]{43}$/u.test(value)) result.opaqueValues.push(pathLabel);
    return result;
  }
  if (value === null || typeof value !== 'object') return result;
  if (Array.isArray(value)) {
    value.forEach((item, index) => auditSensitive(item, `${pathLabel}[${index}]`, result));
    return result;
  }
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) result.keys.push(`${pathLabel}.${key}`);
    auditSensitive(item, `${pathLabel}.${key}`, result);
  }
  return result;
}

function pngDimensions(bytes) {
  const signature = '89504e470d0a1a0a';
  if (bytes.subarray(0, 8).toString('hex') !== signature) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function main() {
  const runRoot = contained(requiredArgument('--run'), '--run');
  const outputPath = contained(requiredArgument('--output'), '--output');
  if (path.extname(outputPath) !== '.json') throw new Error('--output must be JSON.');
  if (await stat(outputPath).then(() => true).catch(() => false)) {
    throw new Error('--output already exists; preserve it and choose a fresh path.');
  }

  const runtimePath = path.join(runRoot, RUNTIME_FILENAME);
  const runtimeBytes = await readFile(runtimePath);
  const runtime = JSON.parse(runtimeBytes.toString('utf8'));
  const expectedAssertionKeys = [
    'twoIsolatedBrowserContexts',
    'bothClientsJoined',
    'sameVisibleRoom',
    'sameVisibleMatch',
    'externalHttpsAndWssTarget',
    'matrixRtt50EnabledOnBothClients',
    'clientAAuthorityPositionMoved',
    'clientBReceivedRemoteSamples',
    'resumePreservedPlayer',
    'resumePreservedMatch',
    'resumeCredentialGenerationRotated',
    'bothClientsEndedJoined',
    'noClientLastError',
    'noBrowserConsoleOrPageErrors',
    'noCredentialSerialized',
  ];

  const inventoryResults = [];
  for (const entry of runtime.artifactInventory ?? []) {
    const artifactPath = path.resolve(runRoot, entry.file);
    const relative = path.relative(runRoot, artifactPath);
    const containedArtifact = relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
    if (!containedArtifact) {
      inventoryResults.push({ file: entry.file, contained: false, bytesMatch: false, hashMatch: false });
      continue;
    }
    const bytes = await readFile(artifactPath);
    inventoryResults.push({
      file: entry.file,
      contained: true,
      bytesMatch: bytes.length === entry.bytes,
      hashMatch: sha256(bytes) === entry.sha256,
      dimensions: pngDimensions(bytes),
    });
  }

  const viewportImages = inventoryResults.filter(({ file }) => file.endsWith('-viewport.png'));
  const fullImages = inventoryResults.filter(({ file }) => !file.endsWith('-viewport.png'));
  const sensitive = auditSensitive(runtime);
  const checks = {
    exactRuntimeIdentity: runtime.schemaVersion === 1
      && runtime.status === 'EXTERNAL_TWO_BROWSER_VISIBLE_AUTHORITY_MANUAL_PASS'
      && runtime.gateClaim === 'G3_NOT_ACCEPTED',
    exactAssertionContract: exactKeys(runtime.assertions ?? {}, expectedAssertionKeys),
    everyAssertionPassed: Object.values(runtime.assertions ?? {}).every((value) => value === true),
    externalBuildPinned: runtime.target?.workerOrigin
      === 'https://kyx-io-authority.heliotrope-contraption.workers.dev'
      && runtime.target?.buildId === 'g3tmp-93ae5c5c1604',
    twoBrowserViewportPinned: runtime.target?.browser?.viewport?.width === 1440
      && runtime.target?.browser?.viewport?.height === 1000,
    sharedRoomAndMatchRecorded: /^KYX-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/u
      .test(runtime.session?.roomCode ?? '')
      && /^match\.[a-f0-9]{32}$/u.test(runtime.session?.matchId ?? ''),
    impairmentAndMovementRecorded: runtime.session?.impairmentProfile === 'matrix-rtt-50'
      && runtime.measurements?.authoritativeMovementDeltaMillimeters > 0
      && runtime.measurements?.peerRemoteSamplesAfterMovement
        > runtime.measurements?.peerRemoteSamplesBeforeMovement,
    resumeAndClientHealthRecorded: runtime.measurements?.resumeGeneration === 1
      && runtime.measurements?.browserErrorCount === 0,
    exactManualBoundary: runtime.boundaries?.manualCapture === true
      && runtime.boundaries?.independentVerifier === false
      && runtime.boundaries?.developmentEvidenceRoute === true
      && runtime.boundaries?.productOnlineFlow === false
      && runtime.boundaries?.productionOriginAuthentication === false
      && runtime.boundaries?.durableStaging === false
      && runtime.boundaries?.humanFeelAcceptance === false,
    exactFiveImageInventory: inventoryResults.length === 5,
    imageBytesAndHashesMatch: inventoryResults.every((entry) => (
      entry.contained && entry.bytesMatch && entry.hashMatch
    )),
    readableViewportDimensions: viewportImages.length === 2
      && viewportImages.every(({ dimensions }) => dimensions?.width === 1440 && dimensions.height === 1000),
    fullPageDimensions: fullImages.length === 3
      && fullImages.every(({ dimensions }) => dimensions?.width === 1440 && dimensions.height >= 1000),
    noSensitiveKeysOrOpaqueCredentials: sensitive.keys.length === 0
      && sensitive.opaqueValues.length === 0,
  };
  const passed = Object.values(checks).every((value) => value === true);
  const verifierBytes = await readFile(fileURLToPath(import.meta.url));
  const verification = {
    schemaVersion: 1,
    status: passed ? 'INDEPENDENT_MANUAL_VISUAL_INTEGRITY_PASS' : 'INDEPENDENT_MANUAL_VISUAL_INTEGRITY_FAIL',
    gateClaim: 'G3_NOT_ACCEPTED',
    checks,
    counts: {
      passed: Object.values(checks).filter((value) => value === true).length,
      total: Object.keys(checks).length,
    },
    runtimeSha256: sha256(runtimeBytes),
    verifierSha256: sha256(verifierBytes),
    inventoryResults,
    credentialAudit: sensitive,
    boundaries: {
      verifiesArtifactIntegrityOnly: true,
      independentlyReplaysBrowserSession: false,
      productOnlineFlowOrProductionAuthenticationProved: false,
      g3Accepted: false,
    },
  };
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(verification, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({
    status: verification.status,
    counts: verification.counts,
    output: path.relative(REPO_ROOT, outputPath).replaceAll('\\', '/'),
    gateClaim: verification.gateClaim,
  }));
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
