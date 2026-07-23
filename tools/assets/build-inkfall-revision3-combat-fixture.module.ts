import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { INKFALL_AUTHORITY_MAP_IDENTITY_V3 } from '../../src/authority/inkfallMapIdentity';
import { requireBundledMapPackageManifest } from '../../src/content/maps';
import { convertAuthorityCollisionGlbToFixture } from '../../src/physics';

const MAP_ROOT = new URL(
  '../../assets/source/maps/inkfall-foundry/',
  import.meta.url,
);
const INKFALL_REVISION_3_COLLISION_SHA256 =
  '5fc4f934676c96b9c06638640977fbff12c57585e56746d8129a75e59fd9a4ca';

export async function buildInkfallRevision3CombatFixtureSnapshot() {
  const manifest = await requireBundledMapPackageManifest('inkfall_foundry', 3);
  const collisionBytes = await readFile(new URL(manifest.artifacts.collision.path, MAP_ROOT));
  const collisionSha256 = createHash('sha256').update(collisionBytes).digest('hex');
  const converted = convertAuthorityCollisionGlbToFixture(manifest, collisionBytes);

  if (
    manifest.identity.digest !== INKFALL_AUTHORITY_MAP_IDENTITY_V3.packageDigest
    || manifest.artifacts.collision.sha256 !== INKFALL_REVISION_3_COLLISION_SHA256
    || collisionBytes.byteLength !== manifest.artifacts.collision.bytes
    || collisionSha256 !== manifest.artifacts.collision.sha256
    || converted.fixtureHash !== INKFALL_AUTHORITY_MAP_IDENTITY_V3.fixtureHash
    || converted.collisionMeshNodeCount !== INKFALL_AUTHORITY_MAP_IDENTITY_V3.colliderCardinality
  ) {
    throw new Error('INKFALL_REVISION_3_COMBAT_FIXTURE_IDENTITY_MISMATCH');
  }

  return Object.freeze({
    schemaVersion: 1 as const,
    kind: 'inkfall_revision_3_combat_authority_fixture' as const,
    status: 'G5_BOUNDED_COLLISION_REVISION_3_CANDIDATE' as const,
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
    nonClaims: Object.freeze([
      'REVISION_3_NOT_DEFAULT',
      'REVISION_3_NOT_PROMOTED',
      'EXACT_PRODUCT_RUNTIME_REPLAY_NOT_RUN',
      'HUMAN_ACCEPTANCE_NOT_RUN',
      'G5_NOT_PASSED',
    ] as const),
  });
}
