import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { INKFALL_AUTHORITY_MAP_IDENTITY_V2 } from '../../src/authority/inkfallMapIdentity';
import { requireBundledMapPackageManifest } from '../../src/content/maps';
import { convertAuthorityCollisionGlbToFixture } from '../../src/physics';

const MAP_ROOT = new URL(
  '../../assets/source/maps/inkfall-foundry/',
  import.meta.url,
);
const INKFALL_REVISION_2_COLLISION_SHA256 =
  'cd661c12534dd7d2362c862f4ff9f9177cb9f8ef0cea85d14a3b18e3dfb1380e';

export async function buildInkfallRevision2CombatFixtureSnapshot() {
  const manifest = await requireBundledMapPackageManifest('inkfall_foundry', 2);
  const collisionBytes = await readFile(new URL(manifest.artifacts.collision.path, MAP_ROOT));
  const collisionSha256 = createHash('sha256').update(collisionBytes).digest('hex');
  const converted = convertAuthorityCollisionGlbToFixture(manifest, collisionBytes);

  if (
    manifest.identity.digest !== INKFALL_AUTHORITY_MAP_IDENTITY_V2.packageDigest
    || manifest.artifacts.collision.sha256 !== INKFALL_REVISION_2_COLLISION_SHA256
    || collisionBytes.byteLength !== manifest.artifacts.collision.bytes
    || collisionSha256 !== manifest.artifacts.collision.sha256
    || converted.fixtureHash !== INKFALL_AUTHORITY_MAP_IDENTITY_V2.fixtureHash
    || converted.collisionMeshNodeCount !== INKFALL_AUTHORITY_MAP_IDENTITY_V2.colliderCardinality
  ) {
    throw new Error('INKFALL_REVISION_2_COMBAT_FIXTURE_IDENTITY_MISMATCH');
  }

  return Object.freeze({
    schemaVersion: 1 as const,
    kind: 'inkfall_revision_2_combat_authority_fixture' as const,
    mapId: manifest.id,
    mapRevision: manifest.revision,
    packageDigest: manifest.identity.digest,
    collisionPath: manifest.artifacts.collision.path,
    collisionSha256,
    collisionBytes: collisionBytes.byteLength,
    fixtureHash: converted.fixtureHash,
    collisionMeshNodeCount: converted.collisionMeshNodeCount,
    authorityVolumeCount: manifest.authorityVolumes.length,
    fixture: converted.fixture,
  });
}
