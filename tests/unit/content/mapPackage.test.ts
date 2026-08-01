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
    expect(listBundledMapRevisions('inkfall_foundry')).toEqual([1, 2, 3, 4]);
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

    const openMidCandidateRevision3 = await requireBundledMapPackageManifest(
      'inkfall_foundry',
      3,
    );
    expect(openMidCandidateRevision3).toMatchObject({
      id: 'inkfall_foundry',
      revision: 3,
      identity: {
        digest: '4027934730af7c855b0abcee1b36cc256294e3e5c22a6ffb8aa02a77f71d196a',
      },
      artifacts: {
        render: {
          path: 'revisions/revision-3/export/render.graybox.glb',
          sha256: '19bbf6f627f46146a7266d39e00e0635d7b4b09e556bfa0dee988bb2375c5ed6',
          expectedMeshNodeCount: 346,
        },
        collision: {
          path: 'revisions/revision-3/export/collision.authority.glb',
          sha256: '1cce637ab4f83766627527b3885c3e9da819d8bcabdfa2144f8dc6b46bc5bba8',
          expectedMeshNodeCount: 339,
        },
      },
    });
    expect(openMidCandidateRevision3.identity.digest).toBe(
      await hashRuntimeMapPackageIdentity(openMidCandidateRevision3),
    );

    const correctedAuthorityRevision4 = await requireBundledMapPackageManifest(
      'inkfall_foundry',
      4,
    );
    expect(correctedAuthorityRevision4).toMatchObject({
      id: 'inkfall_foundry',
      revision: 4,
      identity: {
        digest: '65c6c315d9bc0ba27e7ddec1fd2712752b0fa91c4f865f4b2a055e778158c9cf',
      },
      artifacts: {
        render: {
          path: 'revisions/revision-3/export/render.graybox.glb',
          sha256: '19bbf6f627f46146a7266d39e00e0635d7b4b09e556bfa0dee988bb2375c5ed6',
          expectedMeshNodeCount: 346,
        },
        collision: {
          path: 'revisions/revision-4/export/collision.authority.glb',
          sha256: '59d791898a3f7815bb2306c678b2b37fcaaf201b33a94a1e260752edb7a5477c',
          expectedMeshNodeCount: 339,
        },
      },
    });
    expect(correctedAuthorityRevision4.identity.digest).toBe(
      await hashRuntimeMapPackageIdentity(correctedAuthorityRevision4),
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
