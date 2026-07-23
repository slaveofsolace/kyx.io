import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAP_ID,
  DEFAULT_MAP_REVISION,
  getBundledMapPackageSource,
  hashRuntimeMapPackageIdentity,
  listBundledMapIds,
  listBundledMapRevisions,
  requireBundledMapPackageManifest,
  validateBundledMapPackage,
  validateRuntimeMapPackageManifest,
  verifyRuntimeMapPackageIdentity,
} from '../../../src/content/maps';

function cloneBundledSource(): Record<string, unknown> {
  return structuredClone(getBundledMapPackageSource(DEFAULT_MAP_ID, DEFAULT_MAP_REVISION)) as Record<string, unknown>;
}

function issueCodes(result: ReturnType<typeof validateRuntimeMapPackageManifest>): readonly string[] {
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe('runtime map package schema', () => {
  it('loads the versioned bundled Inkfall manifest and verifies its canonical identity', async () => {
    expect(listBundledMapIds()).toEqual(['inkfall_foundry']);
    expect(listBundledMapRevisions('inkfall_foundry')).toEqual([1, 2, 3]);
    expect(validateBundledMapPackage()).toMatchObject({ ok: true });

    const manifest = await requireBundledMapPackageManifest();
    expect(manifest.id).toBe('inkfall_foundry');
    expect(manifest.revision).toBe(1);
    expect(manifest.displayName).toBe('Inkfall Foundry');
    expect(manifest.identity.digest).toBe(await hashRuntimeMapPackageIdentity(manifest));
    expect(manifest.boundsMm).toEqual({
      minimum: { x: -36_000, y: -5_000, z: -28_000 },
      maximum: { x: 36_000, y: 10_000, z: 28_000 },
    });
    expect(manifest.zones).toHaveLength(9);
    expect(manifest.spawns).toHaveLength(12);
    expect(manifest.pickups).toEqual([]);
    expect(manifest.triggers).toHaveLength(1);
    expect(manifest.authorityVolumes.map((volume) => volume.kind).sort()).toEqual(['kill', 'recovery']);
    expect(manifest.authority.renderMeshesMayBeAuthority).toBe(false);
    expect(manifest.scope).toEqual({
      phase: 'P6.3',
      runtimeFixtureLoaded: true,
      spawnScoringComplete: false,
      traversalPlaytestComplete: false,
      g5Passed: false,
    });
    expect(Object.isFrozen(manifest)).toBe(true);
    expect(Object.isFrozen(manifest.spawns[0])).toBe(true);

    const stagedRevision2 = await requireBundledMapPackageManifest('inkfall_foundry', 2);
    expect(stagedRevision2).toMatchObject({
      id: 'inkfall_foundry',
      revision: 2,
      identity: {
        digest: '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520',
      },
      artifacts: {
        render: {
          path: 'revisions/revision-2/export/render.graybox.glb',
          expectedMeshNodeCount: 346,
        },
        collision: {
          path: 'revisions/revision-2/export/collision.authority.glb',
          expectedMeshNodeCount: 339,
        },
      },
    });
    expect(stagedRevision2.identity.digest).toBe(
      await hashRuntimeMapPackageIdentity(stagedRevision2),
    );

    const collisionCandidateRevision3 = await requireBundledMapPackageManifest(
      'inkfall_foundry',
      3,
    );
    expect(collisionCandidateRevision3).toMatchObject({
      id: 'inkfall_foundry',
      revision: 3,
      identity: {
        digest: 'c769eba175a7d1bcef92167b9f997a6b72d0e50c29f3d171bd66ce911a9ea161',
      },
      artifacts: {
        render: {
          path: 'revisions/revision-3/export/render.graybox.glb',
          sha256: '90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634',
          expectedMeshNodeCount: 346,
        },
        collision: {
          path: 'revisions/revision-3/export/collision.authority.glb',
          sha256: '5fc4f934676c96b9c06638640977fbff12c57585e56746d8129a75e59fd9a4ca',
          expectedMeshNodeCount: 339,
        },
      },
    });
    expect(collisionCandidateRevision3.identity.digest).toBe(
      await hashRuntimeMapPackageIdentity(collisionCandidateRevision3),
    );
  });

  it('rejects unknown fields at the root and nested artifact boundary', () => {
    const root = cloneBundledSource();
    root.unknown = true;
    expect(issueCodes(validateRuntimeMapPackageManifest(root))).toContain('MAP_UNKNOWN_FIELD');

    const nested = cloneBundledSource();
    const artifacts = nested.artifacts as { render: Record<string, unknown> };
    artifacts.render.authority = true;
    const result = validateRuntimeMapPackageManifest(nested);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'MAP_UNKNOWN_FIELD',
      path: '$.artifacts.render.authority',
    }));
  });

  it('rejects unsupported schema/units/origin and render-authority aliasing', () => {
    const schema = cloneBundledSource();
    schema.schemaVersion = 2;
    expect(issueCodes(validateRuntimeMapPackageManifest(schema))).toContain('MAP_INVALID_VALUE');

    const units = cloneBundledSource();
    (units.units as Record<string, unknown>).distance = 'meters';
    expect(issueCodes(validateRuntimeMapPackageManifest(units))).toContain('MAP_INVALID_VALUE');

    const origin = cloneBundledSource();
    (origin.coordinateSystem as Record<string, unknown>).origin = 'unknown';
    expect(issueCodes(validateRuntimeMapPackageManifest(origin))).toContain('MAP_INVALID_VALUE');

    const alias = cloneBundledSource();
    const artifacts = alias.artifacts as { render: Record<string, unknown>; collision: Record<string, unknown> };
    artifacts.render.path = artifacts.collision.path;
    artifacts.render.sha256 = artifacts.collision.sha256;
    expect(issueCodes(validateRuntimeMapPackageManifest(alias))).toContain('MAP_RENDER_AUTHORITY_VIOLATION');
  });

  it('rejects out-of-bounds data, duplicate IDs, and missing spawn references', () => {
    const outOfBounds = cloneBundledSource();
    const spawns = outOfBounds.spawns as Record<string, unknown>[];
    spawns[0].feetPositionMm = { x: -36_001, y: 0, z: 0 };
    expect(issueCodes(validateRuntimeMapPackageManifest(outOfBounds))).toContain('MAP_INVALID_VALUE');

    const duplicate = cloneBundledSource();
    const duplicateSpawns = duplicate.spawns as Record<string, unknown>[];
    duplicateSpawns[1].id = duplicateSpawns[0].id;
    expect(issueCodes(validateRuntimeMapPackageManifest(duplicate))).toContain('MAP_DUPLICATE_ID');

    const missing = cloneBundledSource();
    (missing.authority as Record<string, unknown>).defaultSpawnId = 'missing_spawn';
    expect(issueCodes(validateRuntimeMapPackageManifest(missing))).toContain('MAP_REFERENCE_MISSING');
  });

  it('detects any structurally valid manifest mutation through the identity digest', async () => {
    const source = cloneBundledSource();
    source.displayName = 'Inkfall Foundry Mutated';
    const validated = validateRuntimeMapPackageManifest(source);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;
    const verified = await verifyRuntimeMapPackageIdentity(validated.value);
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.issues[0].code).toBe('MAP_IDENTITY_HASH_MISMATCH');
  });
});
