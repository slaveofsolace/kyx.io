import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { requireBundledMapPackageManifest } from '../../src/content/maps';
import { convertAuthorityCollisionGlbToFixture } from '../../src/physics';

const MAP_ROOT = new URL(
  '../../assets/source/maps/inkfall-foundry/',
  import.meta.url,
);
const EXPECTED_PACKAGE_DIGEST =
  '65c6c315d9bc0ba27e7ddec1fd2712752b0fa91c4f865f4b2a055e778158c9cf';
const EXPECTED_COLLISION_SHA256 =
  '59d791898a3f7815bb2306c678b2b37fcaaf201b33a94a1e260752edb7a5477c';
const EXPECTED_COLLISION_BYTES = 605_512;
const EXPECTED_COLLIDER_COUNT = 339;
const EXPECTED_FIXTURE_HASH = 'b24d002179389621';

export async function buildInkfallRevision4CombatFixtureSnapshot() {
  const manifest = await requireBundledMapPackageManifest('inkfall_foundry', 4);
  const collisionBytes = await readFile(new URL(manifest.artifacts.collision.path, MAP_ROOT));
  const collisionSha256 = createHash('sha256').update(collisionBytes).digest('hex');
  const converted = convertAuthorityCollisionGlbToFixture(manifest, collisionBytes);

  if (
    manifest.identity.digest !== EXPECTED_PACKAGE_DIGEST
    || manifest.artifacts.collision.sha256 !== EXPECTED_COLLISION_SHA256
    || collisionBytes.byteLength !== EXPECTED_COLLISION_BYTES
    || collisionSha256 !== EXPECTED_COLLISION_SHA256
    || converted.collisionMeshNodeCount !== EXPECTED_COLLIDER_COUNT
  ) {
    throw new Error('INKFALL_REVISION_4_COMBAT_FIXTURE_INPUT_IDENTITY_MISMATCH');
  }
  if (converted.fixtureHash !== EXPECTED_FIXTURE_HASH) {
    throw new Error(
      `INKFALL_REVISION_4_FIXTURE_HASH_PIN_REQUIRED:${converted.fixtureHash}`,
    );
  }

  return Object.freeze({
    schemaVersion: 1 as const,
    kind: 'inkfall_revision_4_combat_authority_fixture' as const,
    status: 'INKFALL_REV5_REVISION_4_AUTHORITY_SEAM_CORRECTION_CANDIDATE' as const,
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
      'REVISION_4_NOT_PROMOTED',
      'EXACT_FAILING_POSE_PROOF_NOT_RUN',
      'SUSTAINED_ONE_PLUS_SEVEN_TRAVERSAL_NOT_RUN',
      'HUMAN_MAP_ACCEPTANCE_NOT_RUN',
      'FINAL_TWO_FOUR_EIGHT_MATRIX_NOT_RUN',
      'G5_NOT_PASSED',
    ] as const),
  });
}
