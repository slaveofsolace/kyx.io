import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_REVISION_3_MANIFEST_SHA256 =
  '14648737f7e511370e1136ac5150fa25b1ebfdc9bff2dd86ba7b2ce83e1c45b6';
const EXPECTED_REVISION_3_PACKAGE_DIGEST =
  '4027934730af7c855b0abcee1b36cc256294e3e5c22a6ffb8aa02a77f71d196a';
const EXPECTED_RENDER_SHA256 =
  '19bbf6f627f46146a7266d39e00e0635d7b4b09e556bfa0dee988bb2375c5ed6';
const EXPECTED_COLLISION_SHA256 =
  '59d791898a3f7815bb2306c678b2b37fcaaf201b33a94a1e260752edb7a5477c';
const EXPECTED_COLLIDER_COUNT = 339;
const ZERO_DIGEST = '0'.repeat(64);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
  );
}

const scriptPath = fileURLToPath(import.meta.url);
const revision4Root = path.resolve(path.dirname(scriptPath), '..');
const revisionsRoot = path.resolve(revision4Root, '..');
const mapRoot = path.resolve(revisionsRoot, '..');
const revision3Root = path.join(revisionsRoot, 'revision-3');
const revision3ManifestPath = path.join(revision3Root, 'runtime', 'map.package.v3.json');
const revision3RenderPath = path.join(revision3Root, 'export', 'render.graybox.glb');
const revision4CollisionPath = path.join(revision4Root, 'export', 'collision.authority.glb');
const revision4LocalManifestPath = path.join(revision4Root, 'runtime', 'map.package.v4.json');
const revision4CatalogManifestPath = path.join(mapRoot, 'runtime', 'map.package.v4.json');

const revision3ManifestBytes = await readFile(revision3ManifestPath);
const canonicalRevision3ManifestBytes = Buffer.from(
  revision3ManifestBytes.toString('utf8').replace(/\r\n/gu, '\n'),
);
if (sha256(canonicalRevision3ManifestBytes) !== EXPECTED_REVISION_3_MANIFEST_SHA256) {
  throw new Error('REVISION_3_MANIFEST_DRIFT');
}
const revision3Manifest = JSON.parse(revision3ManifestBytes.toString('utf8'));
if (
  revision3Manifest.revision !== 3
  || revision3Manifest.identity.digest !== EXPECTED_REVISION_3_PACKAGE_DIGEST
) {
  throw new Error('REVISION_3_IDENTITY_DRIFT');
}

const [renderBytes, collisionBytes, renderStat, collisionStat] = await Promise.all([
  readFile(revision3RenderPath),
  readFile(revision4CollisionPath),
  stat(revision3RenderPath),
  stat(revision4CollisionPath),
]);
const renderSha256 = sha256(renderBytes);
const collisionSha256 = sha256(collisionBytes);
if (renderSha256 !== EXPECTED_RENDER_SHA256) throw new Error('REVISION_3_RENDER_DRIFT');
if (collisionSha256 !== EXPECTED_COLLISION_SHA256) throw new Error('REVISION_4_COLLISION_DRIFT');

const manifest = structuredClone(revision3Manifest);
manifest.revision = 4;
manifest.identity.digest = ZERO_DIGEST;
manifest.artifacts.render = {
  ...manifest.artifacts.render,
  path: 'revisions/revision-3/export/render.graybox.glb',
  bytes: renderStat.size,
  sha256: renderSha256,
};
manifest.artifacts.collision = {
  ...manifest.artifacts.collision,
  path: 'revisions/revision-4/export/collision.authority.glb',
  bytes: collisionStat.size,
  sha256: collisionSha256,
  expectedMeshNodeCount: EXPECTED_COLLIDER_COUNT,
};
manifest.identity.digest = sha256(Buffer.from(JSON.stringify(canonicalize(manifest))));

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
await mkdir(path.dirname(revision4LocalManifestPath), { recursive: true });
await Promise.all([
  writeFile(revision4LocalManifestPath, serialized, 'utf8'),
  writeFile(revision4CatalogManifestPath, serialized, 'utf8'),
]);

const outputsEqual = (await readFile(revision4LocalManifestPath)).equals(
  await readFile(revision4CatalogManifestPath),
);
if (!outputsEqual) throw new Error('REVISION_4_MANIFEST_COPY_MISMATCH');

process.stdout.write(`${JSON.stringify({
  result: 'REVISION_4_MANIFEST_BUILT',
  revision: manifest.revision,
  packageDigest: manifest.identity.digest,
  renderReusedFromRevision: 3,
  renderSha256,
  collisionSha256,
  collisionBytes: collisionStat.size,
  expectedMeshNodeCount: manifest.artifacts.collision.expectedMeshNodeCount,
})}\n`);
