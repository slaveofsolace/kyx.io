import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const MANIFEST_PATH = path.resolve(
  'assets/source/maps/inkfall-foundry/runtime/map.package.v1.json',
);
const CAPTURE_PATH = path.resolve(
  'evidence/2026-07-21/phase-6-p6-3-runtime-map/runtime-map-capture.json',
);
const OUTPUT_PATH = path.resolve(
  'evidence/2026-07-21/phase-6-p6-3-runtime-map/independent-verification.json',
);
const ZERO_DIGEST = '0'.repeat(64);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

const manifestBytes = await readFile(MANIFEST_PATH);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
const capture = JSON.parse(await readFile(CAPTURE_PATH, 'utf8'));
const renderPath = path.resolve('assets/source/maps/inkfall-foundry', manifest.artifacts.render.path);
const collisionPath = path.resolve('assets/source/maps/inkfall-foundry', manifest.artifacts.collision.path);
const renderBytes = await readFile(renderPath);
const collisionBytes = await readFile(collisionPath);
const screenshotPath = path.resolve(capture.screenshot.path);
const screenshotBytes = await readFile(screenshotPath);
const identitySource = {
  ...manifest,
  identity: { ...manifest.identity, digest: ZERO_DIGEST },
};
const computedPackageDigest = sha256(Buffer.from(JSON.stringify(canonicalize(identitySource))));

const assertions = {
  packageIdentityMatches: computedPackageDigest === manifest.identity.digest
    && capture.snapshot.packageDigest === manifest.identity.digest,
  sourceSeedIsImmutable: manifest.sourceSeed.sha256
    === '562c5ea8711a1eb1f4a08a31c8872c68c23778aa159110a107c9da0b74e67a63',
  renderArtifactMatches: renderBytes.byteLength === manifest.artifacts.render.bytes
    && sha256(renderBytes) === manifest.artifacts.render.sha256
    && capture.snapshot.renderSha256 === manifest.artifacts.render.sha256,
  collisionArtifactMatches: collisionBytes.byteLength === manifest.artifacts.collision.bytes
    && sha256(collisionBytes) === manifest.artifacts.collision.sha256
    && capture.snapshot.authorityCollisionSha256 === manifest.artifacts.collision.sha256,
  rolesAreSeparated: manifest.artifacts.render.role === 'render_only'
    && manifest.artifacts.collision.role === 'authority_collision'
    && manifest.artifacts.render.sha256 !== manifest.artifacts.collision.sha256
    && manifest.authority.renderMeshesMayBeAuthority === false
    && capture.snapshot.renderMeshesMayBeAuthority === false,
  identityAndBoundsMatch: capture.snapshot.mapId === manifest.id
    && capture.snapshot.mapRevision === manifest.revision
    && JSON.stringify(capture.snapshot.boundsMm) === JSON.stringify(manifest.boundsMm),
  expectedRuntimeCounts: capture.snapshot.renderMeshNodeCount === 346
    && capture.snapshot.authorityCollisionMeshNodeCount === 346
    && capture.snapshot.authorityVolumeCount === 2
    && capture.snapshot.totalAuthorityColliderCount === 348
    && capture.snapshot.zoneCount === 9
    && capture.snapshot.spawnCount === 12,
  deterministicFixtureHash: capture.snapshot.fixtureHash === '2a0a446a0b152395',
  browserCapturePassed: capture.status === 'PASS'
    && Object.values(capture.assertions).every(Boolean)
    && Object.values(capture.diagnostics).every((entries) => entries.length === 0),
  screenshotMatches: screenshotBytes.byteLength === capture.screenshot.bytes
    && sha256(screenshotBytes) === capture.screenshot.sha256,
  scopeRemainsBounded: capture.snapshot.status === 'P6.3_RUNTIME_FIXTURE_LOADED_G5_NOT_PASSED'
    && manifest.scope.spawnScoringComplete === false
    && manifest.scope.traversalPlaytestComplete === false
    && manifest.scope.g5Passed === false,
};
const output = {
  schemaVersion: 1,
  verifiedAtUtc: new Date().toISOString(),
  status: Object.values(assertions).every(Boolean)
    ? 'INDEPENDENT_P6_3_RUNTIME_EVIDENCE_PASS'
    : 'INDEPENDENT_P6_3_RUNTIME_EVIDENCE_FAIL',
  inputs: {
    manifest: path.relative(process.cwd(), MANIFEST_PATH).replaceAll('\\', '/'),
    capture: path.relative(process.cwd(), CAPTURE_PATH).replaceAll('\\', '/'),
    render: path.relative(process.cwd(), renderPath).replaceAll('\\', '/'),
    collision: path.relative(process.cwd(), collisionPath).replaceAll('\\', '/'),
    screenshot: path.relative(process.cwd(), screenshotPath).replaceAll('\\', '/'),
  },
  fingerprints: {
    packageDigest: computedPackageDigest,
    renderSha256: sha256(renderBytes),
    collisionSha256: sha256(collisionBytes),
    screenshotSha256: sha256(screenshotBytes),
    fixtureHash: capture.snapshot.fixtureHash,
  },
  assertions,
};
await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
if (output.status.endsWith('_FAIL')) {
  process.stderr.write(`${JSON.stringify(output, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${output.status}\n`);
}
