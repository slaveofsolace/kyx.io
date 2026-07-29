import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_REVISION_2_MANIFEST_SHA256 =
  '15f80522274712fb5dd3bfb97dc0aa1a60d48d27269d42aa07c039898de93deb';
const EXPECTED_RENDER_SHA256 =
  '19bbf6f627f46146a7266d39e00e0635d7b4b09e556bfa0dee988bb2375c5ed6';
const EXPECTED_COLLISION_SHA256 =
  '1cce637ab4f83766627527b3885c3e9da819d8bcabdfa2144f8dc6b46bc5bba8';
const EXPECTED_COLLIDER_COUNT = 339;
const ZERO_DIGEST = '0'.repeat(64);
// Revision 2 authored these headings against the old preview-camera basis.
// Revision 3 is consumed by the canonical +Z authority look basis, so each
// heading is corrected toward the first traversable waypoint in its declared
// escape-route family. These values are intentionally part of package identity.
const REVISION_3_SPAWN_FACING_MILLI_DEGREES = Object.freeze({
  spawn_w_press_a: 53_000,
  spawn_w_press_b: 113_000,
  spawn_w_ink: 90_000,
  spawn_w_archive: 90_000,
  spawn_e_press_a: -127_000,
  spawn_e_press_b: -67_000,
  spawn_e_ink: -90_000,
  spawn_e_archive: -90_000,
  spawn_dm_ink_w: 45_000,
  spawn_dm_ink_e: -51_000,
  spawn_dm_archive_w: 135_000,
  spawn_dm_archive_e: -129_000,
});

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
const canonicalRevision2ManifestBytes = Buffer.from(
  revision2ManifestBytes.toString('utf8').replace(/\r\n/gu, '\n'),
);
if (sha256(canonicalRevision2ManifestBytes) !== EXPECTED_REVISION_2_MANIFEST_SHA256) {
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
if (collisionSha256 !== EXPECTED_COLLISION_SHA256) throw new Error('REVISION_3_COLLISION_DRIFT');

const manifest = structuredClone(revision2Manifest);
manifest.revision = 3;
manifest.identity.digest = ZERO_DIGEST;
manifest.spawns = manifest.spawns.map((spawn) => {
  const yawMilliDegrees =
    REVISION_3_SPAWN_FACING_MILLI_DEGREES[spawn.id];
  if (!Number.isSafeInteger(yawMilliDegrees)) {
    throw new Error(`REVISION_3_SPAWN_FACING_MISSING:${spawn.id}`);
  }
  return {
    ...spawn,
    yawMilliDegrees,
  };
});
if (
  manifest.spawns.length
  !== Object.keys(REVISION_3_SPAWN_FACING_MILLI_DEGREES).length
) {
  throw new Error('REVISION_3_SPAWN_FACING_CARDINALITY_DRIFT');
}
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
