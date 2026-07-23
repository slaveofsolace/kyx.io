import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const capturePath = path.resolve(repoRoot, process.argv[2]
  ?? 'evidence/2026-07-22/phase-6-g5-product-map-selection/runs/local-v1/capture.json');
const outputPath = path.resolve(repoRoot, process.argv[3]
  ?? 'evidence/2026-07-22/phase-6-g5-product-map-selection/verification-local-v1.json');
const evidenceRoot = path.resolve(repoRoot, 'evidence');
for (const target of [capturePath, outputPath]) {
  if (target !== evidenceRoot && !target.startsWith(`${evidenceRoot}${path.sep}`)) {
    throw new Error('EVIDENCE_PATH_REQUIRED');
  }
}
try {
  await access(outputPath);
  throw new Error(`OUTPUT_ALREADY_EXISTS ${outputPath}`);
} catch (error) {
  if (error instanceof Error && error.message.startsWith('OUTPUT_ALREADY_EXISTS')) throw error;
}

const capture = JSON.parse(await readFile(capturePath, 'utf8'));
const checks = [];
function check(id, condition, details) {
  checks.push({ id, passed: Boolean(condition), details });
}
function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

check('capture_status', capture.status === 'G5_PRODUCT_MAP_SELECTION_EVIDENCE_READY_G5_OPEN', capture.status);
check('explicit_selection', capture.routeSnapshot?.evidence?.selection?.reference === 'inkfall_foundry@2', capture.routeSnapshot?.evidence?.selection);
check('locked_revision', capture.routeSnapshot?.evidence?.selection?.mapRevision === 2, capture.routeSnapshot?.evidence?.selection?.mapRevision);
check('default_revision_unchanged', capture.routeSnapshot?.evidence?.catalogDefault?.mapRevision === 1 && capture.routeSnapshot?.evidence?.catalogDefault?.unchanged === true, capture.routeSnapshot?.evidence?.catalogDefault);
check('render_role', capture.routeSnapshot?.evidence?.assets?.render?.role === 'render_only', capture.routeSnapshot?.evidence?.assets?.render?.role);
check('collision_role', capture.routeSnapshot?.evidence?.assets?.authorityCollision?.role === 'authority_collision', capture.routeSnapshot?.evidence?.assets?.authorityCollision?.role);
check('separate_requests', capture.routeSnapshot?.evidence?.assets?.requestedSeparately === true && capture.artifactRequests?.length === 2 && new Set(capture.artifactRequests).size === 2, capture.artifactRequests);
check('render_identity', capture.routeSnapshot?.evidence?.assets?.render?.sha256 === '90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634' && capture.routeSnapshot?.evidence?.assets?.render?.meshNodeCount === 346, capture.routeSnapshot?.evidence?.assets?.render);
check('collision_identity', capture.routeSnapshot?.evidence?.assets?.authorityCollision?.sha256 === 'cd661c12534dd7d2362c862f4ff9f9177cb9f8ef0cea85d14a3b18e3dfb1380e' && capture.routeSnapshot?.evidence?.assets?.authorityCollision?.meshNodeCount === 339 && capture.routeSnapshot?.evidence?.assets?.authorityCollision?.fixtureHash === 'bf85e42731fd088e', capture.routeSnapshot?.evidence?.assets?.authorityCollision);
check('package_digest', capture.routeSnapshot?.evidence?.package?.digest === '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520', capture.routeSnapshot?.evidence?.package?.digest);
check('practice_not_loaded', capture.routeSnapshot?.evidence?.productBoundary?.loadedIntoOfflinePractice === false && capture.routeSnapshot?.evidence?.productBoundary?.playableFromPreview === false, capture.routeSnapshot?.evidence?.productBoundary);
check('no_promotion', capture.routeSnapshot?.evidence?.productBoundary?.shippingDefaultChanged === false && capture.routeSnapshot?.evidence?.productBoundary?.g5Passed === false, capture.routeSnapshot?.evidence?.productBoundary);
check('visible_boundary', capture.routeSnapshot?.visibleText?.includes('G5 REMAINS OPEN') && capture.routeSnapshot?.visibleText?.includes('Offline Practice unchanged'), 'G5 and practice boundaries visible');
check('read_only_surface', capture.routeSnapshot?.evidenceDescriptor?.writable === false && capture.routeSnapshot?.evidenceDescriptor?.configurable === false, capture.routeSnapshot?.evidenceDescriptor);
check('canvas_rendered', capture.routeSnapshot?.canvasDataLength > 8_000, capture.routeSnapshot?.canvasDataLength);
check('entry_path', capture.entry?.href === '?mapPackage=inkfall_foundry%402' && capture.entry?.errors?.length === 0, capture.entry);
check('browser_clean', ['consoleErrors', 'pageErrors', 'failedRequests', 'httpErrors'].every((key) => capture.browserDiagnostics?.[key]?.length === 0), capture.browserDiagnostics);
check('no_external_requests', capture.browserDiagnostics?.requestedUrls?.every((url) => {
  const parsed = new URL(url);
  return !['http:', 'https:'].includes(parsed.protocol) || parsed.origin === capture.origin;
}), capture.origin);

for (const [name, screenshot] of Object.entries(capture.screenshots ?? {})) {
  const actual = sha256(await readFile(path.join(repoRoot, screenshot.path)));
  check(`screenshot_hash_${name}`, actual === screenshot.sha256, { expected: screenshot.sha256, actual });
}
for (const [relativePath, expected] of Object.entries(capture.sourceHashes ?? {})) {
  const actual = sha256(await readFile(path.join(repoRoot, relativePath)));
  check(`source_hash_${relativePath}`, actual === expected, { expected, actual });
}

const failed = checks.filter(({ passed }) => !passed);
const verification = {
  schemaVersion: 1,
  status: failed.length === 0
    ? 'INDEPENDENT_G5_PRODUCT_MAP_SELECTION_VERIFICATION_READY_G5_OPEN'
    : 'INDEPENDENT_G5_PRODUCT_MAP_SELECTION_VERIFICATION_FAILED',
  capturePath: path.relative(repoRoot, capturePath).replaceAll('\\', '/'),
  checkedAt: new Date().toISOString(),
  checkCount: checks.length,
  passedCount: checks.length - failed.length,
  failedCount: failed.length,
  checks,
  nonClaims: capture.nonClaims,
};
await writeFile(outputPath, `${JSON.stringify(verification, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({
  status: verification.status,
  checkCount: verification.checkCount,
  passedCount: verification.passedCount,
  failedCount: verification.failedCount,
  outputPath,
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
