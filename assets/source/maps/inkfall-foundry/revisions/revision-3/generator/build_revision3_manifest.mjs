import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_REVISION_2_MANIFEST_SHA256 =
  '15f80522274712fb5dd3bfb97dc0aa1a60d48d27269d42aa07c039898de93deb';
const EXPECTED_RENDER_SHA256 =
  '90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634';
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
const revision3Root = path.resolve(path.dirname(scriptPath), '..');
const mapRoot = path.resolve(revision3Root, '..', '..');
const revision2ManifestPath = path.join(mapRoot, 'runtime', 'map.package.v2.json');
const revision3RenderPath = path.join(revision3Root, 'export', 'render.graybox.glb');
const revision3CollisionPath = path.join(revision3Root, 'export', 'collision.authority.glb');
const revision3LocalManifestPath = path.join(revision3Root, 'runtime', 'map.package.v3.json');
const revision3CatalogManifestPath = path.join(mapRoot, 'runtime', 'map.package.v3.json');

const revision2ManifestBytes = await readFile(revision2ManifestPath);
if (sha256(revision2ManifestBytes) !== EXPECTED_REVISION_2_MANIFEST_SHA256) {
  throw new Error('REVISION_2_MANIFEST_DRIFT');
}
const revision2Manifest = JSON.parse(revision2ManifestBytes.toString('utf8'));
if (revision2Manifest.revision !== 2 || revision2Manifest.identity.digest !==
  '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520') {
  throw new Error('REVISION_2_IDENTITY_DRIFT');
}

const [renderBytes, collisionBytes, renderStat, collisionStat] = await Promise.all([
  readFile(revision3RenderPath),
  readFile(revision3CollisionPath),
  stat(revision3RenderPath),
  stat(revision3CollisionPath),
]);
const renderSha256 = sha256(renderBytes);
const collisionSha256 = sha256(collisionBytes);
if (renderSha256 !== EXPECTED_RENDER_SHA256) throw new Error('REVISION_3_RENDER_DRIFT');

const manifest = structuredClone(revision2Manifest);
manifest.revision = 3;
manifest.identity.digest = ZERO_DIGEST;
manifest.artifacts.render = {
  ...manifest.artifacts.render,
  path: 'revisions/revision-3/export/render.graybox.glb',
  bytes: renderStat.size,
  sha256: renderSha256,
};
manifest.artifacts.collision = {
  ...manifest.artifacts.collision,
  path: 'revisions/revision-3/export/collision.authority.glb',
  bytes: collisionStat.size,
  sha256: collisionSha256,
  expectedMeshNodeCount: EXPECTED_COLLIDER_COUNT,
};
manifest.identity.digest = sha256(Buffer.from(JSON.stringify(canonicalize(manifest))));

const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
await mkdir(path.dirname(revision3LocalManifestPath), { recursive: true });
await Promise.all([
  writeFile(revision3LocalManifestPath, serialized, 'utf8'),
  writeFile(revision3CatalogManifestPath, serialized, 'utf8'),
]);

const outputsEqual = (await readFile(revision3LocalManifestPath)).equals(
  await readFile(revision3CatalogManifestPath),
);
if (!outputsEqual) throw new Error('REVISION_3_MANIFEST_COPY_MISMATCH');

process.stdout.write(`${JSON.stringify({
  result: 'REVISION_3_MANIFEST_BUILT',
  revision: manifest.revision,
  packageDigest: manifest.identity.digest,
  renderSha256,
  collisionSha256,
  collisionBytes: collisionStat.size,
  expectedMeshNodeCount: manifest.artifacts.collision.expectedMeshNodeCount,
})}\n`);
