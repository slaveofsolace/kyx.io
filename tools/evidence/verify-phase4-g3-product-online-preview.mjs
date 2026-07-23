import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const [, , rawRuntimePath, rawOutputPath] = process.argv;
if (!rawRuntimePath || !rawOutputPath) {
  throw new Error('usage: verify-phase4-g3-product-online-preview.mjs <runtime-json> <verification-json>');
}

const runtimePath = path.resolve(rawRuntimePath);
const outputPath = path.resolve(rawOutputPath);
const runtime = JSON.parse(await readFile(runtimePath, 'utf8'));
const runDirectory = path.dirname(runtimePath);

async function matchesScreenshot(record) {
  if (
    !record
    || typeof record.file !== 'string'
    || typeof record.bytes !== 'number'
    || typeof record.sha256 !== 'string'
  ) return false;
  const bytes = await readFile(path.join(runDirectory, record.file));
  return bytes.byteLength === record.bytes
    && createHash('sha256').update(bytes).digest('hex') === record.sha256;
}

const screenshotMatches = await Promise.all(
  Array.isArray(runtime.screenshots) ? runtime.screenshots.map(matchesScreenshot) : [],
);
const checks = Object.freeze({
  schemaVersion: runtime.schemaVersion === 1,
  evidenceIdentity: runtime.evidence === 'PHASE4_G3_PRODUCT_ONLINE_PREVIEW',
  claimRemainsBounded: runtime.claim === 'PRODUCT_PATH_INTEGRATION_ONLY_G3_NOT_ACCEPTED',
  captureVerdictPass: runtime.verdict === 'PASS',
  allCaptureChecksPass: runtime.checks !== null
    && typeof runtime.checks === 'object'
    && Object.keys(runtime.checks).length === 17
    && Object.values(runtime.checks).every((value) => value === true),
  validRoomCode: /^KYX-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/u.test(runtime.roomCode ?? ''),
  joinPathContainsNoAuthorityOverride: typeof runtime.joinPath === 'string'
    && runtime.joinPath.startsWith('/online?')
    && !runtime.joinPath.includes('authorityUrl')
    && !runtime.joinPath.includes('token'),
  movementObserved: Number.isFinite(runtime.movementMillimeters)
    && runtime.movementMillimeters >= 500,
  peerTrackingBounded: Number.isFinite(runtime.peerDistanceMillimeters)
    && runtime.peerDistanceMillimeters <= 1_500,
  screenshotsComplete: screenshotMatches.length === 4 && screenshotMatches.every(Boolean),
  browserErrorsEmpty: Array.isArray(runtime.errors?.clientA)
    && runtime.errors.clientA.length === 0
    && Array.isArray(runtime.errors?.clientB)
    && runtime.errors.clientB.length === 0,
  timestampsOrdered: Number.isFinite(Date.parse(runtime.startedAt))
    && Date.parse(runtime.finishedAt) >= Date.parse(runtime.startedAt),
});
const verification = {
  schemaVersion: 1,
  evidence: 'PHASE4_G3_PRODUCT_ONLINE_PREVIEW_VERIFICATION',
  source: path.relative(path.dirname(outputPath), runtimePath).replaceAll('\\', '/'),
  verifiedAt: new Date().toISOString(),
  checks,
  verdict: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
};
await writeFile(outputPath, `${JSON.stringify(verification, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({ outputPath, verdict: verification.verdict })}\n`);
if (verification.verdict !== 'PASS') process.exitCode = 1;
