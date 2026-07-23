import { createHash } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const capturePath = path.resolve(repoRoot, process.argv[2]
  ?? 'evidence/2026-07-22/phase-9-g8-press-hall-runtime-v3-2/runtime-v3/capture.json');
const outputPath = path.resolve(repoRoot, process.argv[3]
  ?? 'evidence/2026-07-22/phase-9-g8-press-hall-runtime-v3-2/independent-verification-v3.json');
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
function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

const snapshot = capture.routeSnapshot?.evidence;
check('capture_status', capture.status === 'PRESS_HALL_V3_2_BOUNDED_RUNTIME_CAPTURE_PASS_G5_G8_OPEN', capture.status);
check('route_status', snapshot?.status === 'PRESS_HALL_V3_2_RUNTIME_INSPECTION_READY_G5_G8_OPEN', snapshot?.status);
check('explicit_selection', snapshot?.selection?.explicit === true
  && snapshot?.selection?.reference === 'inkfall_foundry@2/press_hall/v3.2/spatial-material-joined', snapshot?.selection);
check('default_preserved', snapshot?.catalogDefault?.mapId === 'inkfall_foundry'
  && snapshot?.catalogDefault?.mapRevision === 1
  && snapshot?.catalogDefault?.unchanged === true, snapshot?.catalogDefault);
check('art_hash_bytes', snapshot?.art?.sha256 === '56cbd313e3fd2166c70ce6cca614e02f08fd027acf2b0a43749cf076c46f8119'
  && snapshot?.art?.expectedSha256 === snapshot?.art?.sha256
  && snapshot?.art?.bytes === 13_300_676
  && snapshot?.art?.hashVerified === true, snapshot?.art);
check('art_loader_structure', snapshot?.art?.loadedBy === 'THREE.GLTFLoader.parse'
  && snapshot?.art?.nodeCount === 29
  && snapshot?.art?.meshCount === 29
  && snapshot?.art?.primitiveCount === 29
  && snapshot?.art?.triangleCount === 188_576
  && snapshot?.art?.materialCount === 9, snapshot?.art);
check('runtime_material_payload_blocker', snapshot?.art?.materialEncoding?.explicitBaseColorFactorCount === 0
  && snapshot?.art?.materialEncoding?.baseColorTextureReferenceCount === 0
  && snapshot?.art?.materialEncoding?.imageCount === 0
  && snapshot?.art?.materialEncoding?.textureCount === 0
  && snapshot?.art?.materialEncoding?.runtimeColorParityWithBlenderReview === false
  && capture.assessment?.runtimeMaterialColorParity === 'FAIL_GLTF_HAS_ZERO_EXPLICIT_BASE_COLORS_AND_ZERO_BASE_COLOR_TEXTURES', {
  materialEncoding: snapshot?.art?.materialEncoding,
  assessment: capture.assessment?.runtimeMaterialColorParity,
});
check('authority_identity', snapshot?.authorityAlignment?.mapRevision === 2
  && snapshot?.authorityAlignment?.packageDigest === '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520'
  && snapshot?.authorityAlignment?.fixtureHash === 'bf85e42731fd088e'
  && snapshot?.authorityAlignment?.collisionSha256 === 'cd661c12534dd7d2362c862f4ff9f9177cb9f8ef0cea85d14a3b18e3dfb1380e'
  && snapshot?.authorityAlignment?.solidColliderCount === 339
  && snapshot?.authorityAlignment?.authorityVolumeCount === 2, snapshot?.authorityAlignment);
check('authority_separation', snapshot?.authorityAlignment?.role === 'separate_authority_fixture_overlay'
  && snapshot?.authorityAlignment?.artGeometryMayBeAuthority === false
  && snapshot?.productBoundary?.artGeometryUsedForAuthority === false, snapshot?.productBoundary);
check('renderer_art_actual', Number.isInteger(snapshot?.renderer?.artOnly?.calls)
  && snapshot.renderer.artOnly.calls > 0
  && snapshot.renderer.artOnly.calls <= 29
  && Number.isInteger(snapshot?.renderer?.artOnly?.triangles)
  && snapshot.renderer.artOnly.triangles > 0
  && snapshot.renderer.artOnly.triangles <= 188_576, snapshot?.renderer?.artOnly);
check('renderer_overlay_actual', Number.isInteger(snapshot?.renderer?.artPlusAuthorityOverlay?.calls)
  && snapshot.renderer.artPlusAuthorityOverlay.calls > snapshot.renderer.artOnly.calls
  && snapshot.renderer.artPlusAuthorityOverlay.triangles >= snapshot.renderer.artOnly.triangles, snapshot?.renderer?.artPlusAuthorityOverlay);
const frame = snapshot?.performance?.frameTimes;
check('frame_profile_cardinality', snapshot?.performance?.warmupFrames === 60
  && snapshot?.performance?.measuredFrames === 180
  && frame?.count === 180, snapshot?.performance);
check('frame_profile_quantiles', [frame?.minimumMs, frame?.p50Ms, frame?.p95Ms, frame?.p99Ms, frame?.maximumMs, frame?.meanMs].every(finite)
  && frame.minimumMs <= frame.p50Ms
  && frame.p50Ms <= frame.p95Ms
  && frame.p95Ms <= frame.p99Ms
  && frame.p99Ms <= frame.maximumMs, frame);
check('named_browser_host', typeof capture.host?.machineName === 'string'
  && capture.host.machineName.length > 0
  && capture.browser?.product === 'Chromium'
  && typeof capture.browser?.version === 'string'
  && capture.browser?.runtimeIdentity?.webgl?.renderer, { host: capture.host, browser: capture.browser });
check('heap_captured', finite(capture.cdp?.jsHeapUsedBytes)
  && finite(capture.cdp?.jsHeapTotalBytes), capture.cdp);
check('network_three_glbs', capture.network?.distinctGlbRequests?.length === 3
  && new Set(capture.network.distinctGlbRequests).size === 3
  && capture.network?.externalRequests?.length === 0, capture.network);
check('browser_clean', ['consoleErrors', 'pageErrors', 'failedRequests', 'httpErrors'].every(
  (key) => capture.browserDiagnostics?.[key]?.length === 0,
), capture.browserDiagnostics);
check('camera_sweep_bounded', snapshot?.camera?.sweep?.status === 'complete'
  && snapshot?.camera?.sweep?.completedSegments === 4
  && finite(snapshot?.camera?.sweep?.durationMs)
  && snapshot?.camera?.sweep?.collisionNoSnagClaim === false, snapshot?.camera?.sweep);
check('gate_boundary', snapshot?.productBoundary?.explicitNonDefaultInspection === true
  && snapshot?.productBoundary?.loadedIntoOfflinePractice === false
  && snapshot?.productBoundary?.shippingDefaultChanged === false
  && snapshot?.productBoundary?.humanAccepted === false
  && snapshot?.productBoundary?.g5Passed === false
  && snapshot?.productBoundary?.g8Passed === false, snapshot?.productBoundary);
check('read_only_surface', capture.routeSnapshot?.evidenceDescriptor?.writable === false
  && capture.routeSnapshot?.evidenceDescriptor?.configurable === false, capture.routeSnapshot?.evidenceDescriptor);
check('visible_nonclaims', capture.routeSnapshot?.visibleText?.includes('G5 AND G8 REMAIN OPEN')
  && capture.routeSnapshot?.visibleText?.includes('NO COLLISION/NO-SNAG CLAIM'), capture.routeSnapshot?.visibleText);

for (const [id, screenshot] of Object.entries(capture.screenshots ?? {})) {
  const bytes = await readFile(path.join(repoRoot, screenshot.path));
  check(`screenshot_${id}`, bytes.byteLength === screenshot.bytes
    && sha256(bytes) === screenshot.sha256
    && bytes.byteLength > 20_000, { expected: screenshot, actualBytes: bytes.byteLength, actualSha256: sha256(bytes) });
}
check('required_screenshots', ['gameplayArtOnly', 'gameplayAuthorityOverlay', 'overheadAuthorityOverlay'].every(
  (id) => capture.screenshots?.[id],
), Object.keys(capture.screenshots ?? {}));
for (const [relativePath, expected] of Object.entries(capture.sources ?? {})) {
  const bytes = await readFile(path.join(repoRoot, relativePath));
  check(`source_${relativePath}`, bytes.byteLength === expected.bytes && sha256(bytes) === expected.sha256, {
    expected,
    actual: { bytes: bytes.byteLength, sha256: sha256(bytes) },
  });
}

const failed = checks.filter(({ passed }) => !passed);
const verification = {
  schemaVersion: 1,
  status: failed.length === 0
    ? 'INDEPENDENT_PRESS_HALL_V3_2_BOUNDED_RUNTIME_VERIFICATION_PASS_G5_G8_OPEN'
    : 'INDEPENDENT_PRESS_HALL_V3_2_BOUNDED_RUNTIME_VERIFICATION_FAILED',
  checkedAt: new Date().toISOString(),
  capturePath: path.relative(repoRoot, capturePath).replaceAll('\\', '/'),
  checkCount: checks.length,
  passedCount: checks.length - failed.length,
  failedCount: failed.length,
  checks,
  assessment: capture.assessment,
  nonClaims: capture.nonClaims,
};
await writeFile(outputPath, `${JSON.stringify(verification, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({
  status: verification.status,
  checkCount: verification.checkCount,
  passedCount: verification.passedCount,
  failedCount: verification.failedCount,
  failed: failed.map(({ id }) => id),
  outputPath,
}, null, 2)}\n`);
if (failed.length > 0) process.exitCode = 1;
