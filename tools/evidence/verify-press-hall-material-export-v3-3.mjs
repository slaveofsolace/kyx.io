import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const requestedOutput = process.argv[2]
  ?? 'evidence/2026-07-22/phase-6-g5-press-hall-material-export-v3-3/actual-loader-v1';
const outputDirectory = path.resolve(repoRoot, requestedOutput);
const evidenceRoot = path.resolve(repoRoot, 'evidence');
if (outputDirectory !== evidenceRoot && !outputDirectory.startsWith(`${evidenceRoot}${path.sep}`)) {
  throw new Error('OUTPUT_MUST_BE_WITHIN_EVIDENCE_ROOT');
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function record(checks, id, condition, detail) {
  checks.push({ id, pass: Boolean(condition), detail });
}

async function fingerprint(relativePath) {
  const bytes = await readFile(path.join(repoRoot, relativePath));
  return { bytes: bytes.byteLength, sha256: sha256(bytes) };
}

await access(path.join(outputDirectory, 'capture.json'));
const capture = JSON.parse(await readFile(path.join(outputDirectory, 'capture.json'), 'utf8'));
const checks = [];
record(checks, 'capture.status', capture.status === 'PRESS_HALL_V3_3_ACTUAL_GLTFLOADER_CAPTURE_PASS_ASSET_ONLY_G5_G8_OPEN', capture.status);
record(checks, 'capture.scope', capture.scope === 'PRESS_HALL_V3_3_EXPLICIT_MATERIAL_EXPORT_ACTUAL_LOADER_COMPARISON_ONLY', capture.scope);
record(checks, 'output.binding', path.resolve(repoRoot, capture.outputDirectory) === outputDirectory, capture.outputDirectory);
record(checks, 'asset.sha', capture.asset.sha256 === '4ad11232074a794fd817114385f7256e286aefe810c76357a9b0103667874564', capture.asset.sha256);
record(checks, 'asset.bytes', capture.asset.bytes === 13_301_752, capture.asset.bytes);
record(checks, 'asset.structure', capture.asset.nodeCount === 29 && capture.asset.meshCount === 29 && capture.asset.primitiveCount === 29 && capture.asset.triangleCount === 188_576, capture.asset);
record(checks, 'asset.materialEncoding', capture.asset.materialCount === 9 && capture.asset.explicitBaseColorFactorCount === 9 && capture.asset.baseColorTextureReferenceCount === 0 && capture.asset.imageCount === 0, capture.asset);

const currentAsset = await fingerprint(capture.asset.path);
record(checks, 'asset.currentFingerprint', currentAsset.bytes === capture.asset.bytes && currentAsset.sha256 === capture.asset.sha256, currentAsset);
record(checks, 'harness.loader', capture.harness.loader === 'THREE.GLTFLoader.parse(ArrayBuffer)', capture.harness.loader);
record(checks, 'harness.browserAsset', capture.harness.browserAsset.bytes === capture.asset.bytes && capture.harness.browserAsset.sha256 === capture.asset.sha256, capture.harness.browserAsset);
record(checks, 'harness.scene', capture.harness.scene.meshCount === 29 && capture.harness.scene.geometryTriangleCount === 188_576 && capture.harness.scene.materialCount === 9, capture.harness.scene);
record(checks, 'harness.surface', capture.harness.evidenceSurfaceDescriptor?.writable === false && capture.harness.evidenceSurfaceDescriptor?.configurable === false, capture.harness.evidenceSurfaceDescriptor);

record(checks, 'materials.count', capture.materialAudit.explicitFamilyCount === 9 && capture.materialAudit.instantiatedMaterialCount === 9, capture.materialAudit);
record(checks, 'materials.noWhiteFallback', capture.materialAudit.instantiatedWhiteFallbackMaterialCount === 0, capture.materialAudit.instantiatedWhiteFallbackMaterialCount);
record(checks, 'materials.exactBaseColor', capture.materialAudit.exactBaseColorMatch === true && capture.materialAudit.comparisons.every((entry) => entry.maximumBaseColorDelta <= 1e-6), capture.materialAudit.comparisons.map((entry) => ({ name: entry.name, maximumBaseColorDelta: entry.maximumBaseColorDelta })));
record(checks, 'materials.pbrValues', capture.materialAudit.comparisons.every((entry) => Math.abs(entry.expectedMetalness - entry.actualMetalness) <= 1e-6 && Math.abs(entry.expectedRoughness - entry.actualRoughness) <= 1e-6), capture.materialAudit.comparisons.map((entry) => entry.name));
record(checks, 'materials.families', new Set(capture.materialAudit.loaded.map((entry) => entry.name)).size === 9, capture.materialAudit.loaded.map((entry) => entry.name));

const expectedViews = ['gameplay_lane', 'gameplay_north', 'gameplay_south', 'overhead_context'];
record(checks, 'screenshots.views', expectedViews.every((viewId) => capture.screenshots[viewId]), Object.keys(capture.screenshots));
for (const viewId of expectedViews) {
  const screenshot = capture.screenshots[viewId];
  const current = await fingerprint(screenshot.path);
  record(checks, `screenshot.${viewId}.fingerprint`, current.bytes === screenshot.bytes && current.sha256 === screenshot.sha256, current);
  record(checks, `screenshot.${viewId}.resolution`, screenshot.stats.width === 960 && screenshot.stats.height === 540, screenshot.stats);
  record(checks, `screenshot.${viewId}.notWhite`, screenshot.stats.nearWhiteFraction < 0.72, screenshot.stats.nearWhiteFraction);
  record(checks, `screenshot.${viewId}.notBlack`, screenshot.stats.nearBlackFraction < 0.86, screenshot.stats.nearBlackFraction);
  record(checks, `screenshot.${viewId}.color`, screenshot.stats.colorfulFraction > 0.002, screenshot.stats.colorfulFraction);
  record(checks, `screenshot.${viewId}.renderer`, screenshot.runtime.renderer.calls > 0 && screenshot.runtime.renderer.triangles > 0, screenshot.runtime.renderer);
}

const expectedBoards = ['actualLoaderFourView', 'blenderVsActualLoader'];
for (const boardId of expectedBoards) {
  const board = capture.boards[boardId];
  const current = await fingerprint(board.path);
  record(checks, `board.${boardId}.fingerprint`, current.bytes === board.bytes && current.sha256 === board.sha256, current);
  record(checks, `board.${boardId}.resolution`, board.resolution[0] === 1_920 && board.resolution[1] === 1_080, board.resolution);
}

record(checks, 'network.assetRequest', capture.network.assetRequestCount === 1, capture.network.assetRequestCount);
record(checks, 'network.external', capture.network.externalRequests.length === 0, capture.network.externalRequests);
record(checks, 'browser.console', capture.browserDiagnostics.consoleErrors.length === 0, capture.browserDiagnostics.consoleErrors);
record(checks, 'browser.page', capture.browserDiagnostics.pageErrors.length === 0, capture.browserDiagnostics.pageErrors);
record(checks, 'browser.failedRequests', capture.browserDiagnostics.failedRequests.length === 0, capture.browserDiagnostics.failedRequests);
record(checks, 'browser.http', capture.browserDiagnostics.httpErrors.length === 0, capture.browserDiagnostics.httpErrors);

for (const [relativePath, expected] of Object.entries(capture.sources)) {
  const current = await fingerprint(relativePath);
  record(checks, `source.${relativePath}`, current.bytes === expected.bytes && current.sha256 === expected.sha256, current);
}

record(checks, 'assessment.assetLoader', capture.assessment.exactAssetShaThroughActualGltfLoader === 'PASS', capture.assessment);
record(checks, 'assessment.materials', capture.assessment.instantiatedMaterialValuesMatchGltf === 'PASS' && capture.assessment.whiteFallbackRegression === 'PASS_IN_ISOLATED_ASSET_HARNESS', capture.assessment);
record(checks, 'assessment.boundary', capture.assessment.productIntegration === 'NOT_PERFORMED' && capture.assessment.shippingDefault === 'UNCHANGED', capture.assessment);
record(checks, 'assessment.gatesOpen', capture.assessment.g5 === 'OPEN' && capture.assessment.g8 === 'OPEN', capture.assessment);
record(checks, 'nonClaims', ['G5_NOT_PASSED', 'G8_NOT_PASSED', 'FINAL_ART_NOT_ACCEPTED', 'NOT_PRODUCT_INTEGRATED', 'NOT_SHIPPING_DEFAULT'].every((entry) => capture.nonClaims.includes(entry)), capture.nonClaims);

const failures = checks.filter((check) => !check.pass);
const verification = {
  schemaVersion: 1,
  status: failures.length === 0
    ? 'PRESS_HALL_V3_3_ACTUAL_GLTFLOADER_EVIDENCE_VERIFIED_ASSET_ONLY_G5_G8_OPEN'
    : 'PRESS_HALL_V3_3_ACTUAL_GLTFLOADER_EVIDENCE_REJECTED',
  verifiedAt: new Date().toISOString(),
  outputDirectory: path.relative(repoRoot, outputDirectory).replaceAll('\\', '/'),
  checkCount: checks.length,
  passCount: checks.length - failures.length,
  failureCount: failures.length,
  checks,
  failures,
  nonClaims: capture.nonClaims,
};
await writeFile(path.join(outputDirectory, 'verification.json'), `${JSON.stringify(verification, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({
  status: verification.status,
  checkCount: verification.checkCount,
  passCount: verification.passCount,
  failureCount: verification.failureCount,
  failures,
  outputDirectory,
}, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
