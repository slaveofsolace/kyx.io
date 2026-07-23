import { readFile } from 'node:fs/promises';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  getBundledMapPackageSource,
  requireBundledMapPackageManifest,
  type RuntimeMapPackageManifestV1,
} from '../../../src/content/maps';
import {
  convertAuthorityCollisionGlbToFixture,
  createRapierMovementWorld,
  loadRuntimeMapPackage,
  RuntimeMapPackageLoadError,
  type RapierMovementWorld,
} from '../../../src/physics';
import { asMillimeters } from '../../../src/sim/units';

const mapRoot = new URL('../../../assets/source/maps/inkfall-foundry/', import.meta.url);
let renderBytes: Uint8Array;
let collisionBytes: Uint8Array;
let manifest: RuntimeMapPackageManifestV1;

const worlds: RapierMovementWorld[] = [];

beforeAll(async () => {
  [renderBytes, collisionBytes, manifest] = await Promise.all([
    readFile(new URL('export/render.graybox.glb', mapRoot)),
    readFile(new URL('export/collision.authority.glb', mapRoot)),
    requireBundledMapPackageManifest(),
  ]);
});

afterEach(() => {
  for (const world of worlds.splice(0)) world.dispose();
});

describe('Inkfall Foundry P6.3 runtime map loading', () => {
  it('verifies both saved artifacts while exposing render and authority as separate roles', async () => {
    const loaded = await loadRuntimeMapPackage(getBundledMapPackageSource('inkfall_foundry'), {
      render: renderBytes,
      collision: collisionBytes,
    });
    expect(loaded.identity).toMatchObject({
      id: 'inkfall_foundry',
      revision: 1,
      displayName: 'Inkfall Foundry',
      boundsMm: {
        minimum: { x: -36_000, y: -5_000, z: -28_000 },
        maximum: { x: 36_000, y: 10_000, z: 28_000 },
      },
    });
    expect(loaded.presentation).toMatchObject({
      renderPath: 'export/render.graybox.glb',
      renderMeshNodeCount: 346,
    });
    expect(loaded.authority).toMatchObject({
      collisionPath: 'export/collision.authority.glb',
      collisionMeshNodeCount: 346,
      authorityVolumeCount: 2,
      totalColliderCount: 348,
    });
    expect(loaded.presentation.renderSha256).not.toBe(loaded.authority.collisionSha256);
    expect(loaded.authority.fixture.id).toBe('inkfall_foundry_map_collision');
    expect(loaded.authority.fixtureHash).toBe('2a0a446a0b152395');
    expect(loaded.authority.fixture.solids).toHaveLength(346);
    expect(loaded.authority.fixture.volumes).toHaveLength(2);
    expect(loaded.authority.fixture.solids.every((solid) => solid.layer === 'world_static')).toBe(true);
    expect(loaded.authority.sourceKindCounts).toMatchObject({
      route_segment: 59,
      route_guard_rail: 111,
      spawn_candidate_pad: 12,
    });
    expect(loaded.authority.fixture.solids.find((solid) => (
      solid.id === 'map_collision_route_west_spawn_choice_s00'
    ))).toMatchObject({
      centerMm: { x: -30_250, y: -125, z: 500 },
      rotationMilliDegrees: { x: 0, y: -10_305, z: 0 },
      shape: {
        type: 'box',
        halfExtentsMm: { x: 2_856, y: 125, z: 1_500 },
      },
    });
  });

  it('creates the current deterministic Rapier world from only the converted authority fixture', async () => {
    const loaded = await loadRuntimeMapPackage(manifest, { render: renderBytes, collision: collisionBytes });
    const world = await createRapierMovementWorld(loaded.authority.fixture);
    worlds.push(world);
    expect(world.fixture.id).toBe('inkfall_foundry_map_collision');
    expect(world.fixtureHash).toBe(loaded.authority.fixtureHash);
    expect(world.fixture.solids).toHaveLength(346);
    expect(world.fixture.volumes.map((volume) => volume.kind).sort()).toEqual(['kill', 'recovery']);
    expect(world.volumesAtCapsule({
      feetPosition: {
        x: asMillimeters(0),
        y: asMillimeters(-4_800),
        z: asMillimeters(0),
      },
      shape: {
        height: asMillimeters(1_100),
        radius: asMillimeters(350),
      },
    }).volumes).toEqual([
      { colliderId: 'map_volume_lower_void_kill', kind: 'kill' },
      { colliderId: 'map_volume_lower_void_recovery', kind: 'recovery' },
    ]);
  });

  it('rejects same-size artifact tampering before parsing authority geometry', async () => {
    const tampered = new Uint8Array(collisionBytes);
    tampered[tampered.length - 1] ^= 1;
    await expect(loadRuntimeMapPackage(manifest, {
      render: renderBytes,
      collision: tampered,
    })).rejects.toMatchObject({
      issues: [expect.objectContaining({ code: 'MAP_ARTIFACT_HASH_MISMATCH' })],
    });
  });

  it('rejects size mismatches before hashing', async () => {
    await expect(loadRuntimeMapPackage(manifest, {
      render: renderBytes.subarray(0, renderBytes.length - 4),
      collision: collisionBytes,
    })).rejects.toMatchObject({
      issues: [expect.objectContaining({ code: 'MAP_ARTIFACT_SIZE_MISMATCH' })],
    });
  });

  it('cannot convert the render GLB into an authority fixture even though geometry stems are paired', () => {
    expect(() => convertAuthorityCollisionGlbToFixture(manifest, renderBytes)).toThrow(RuntimeMapPackageLoadError);
    try {
      convertAuthorityCollisionGlbToFixture(manifest, renderBytes);
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeMapPackageLoadError);
      expect((error as RuntimeMapPackageLoadError).issues[0].code).toBe('MAP_RENDER_AUTHORITY_VIOLATION');
    }
  });

  it('fails closed when the declared authority bounds are narrower than saved collision', () => {
    const narrowed = {
      ...manifest,
      boundsMm: {
        ...manifest.boundsMm,
        maximum: { ...manifest.boundsMm.maximum, x: 35_000 },
      },
    } as RuntimeMapPackageManifestV1;
    expect(() => convertAuthorityCollisionGlbToFixture(narrowed, collisionBytes)).toThrow(RuntimeMapPackageLoadError);
    try {
      convertAuthorityCollisionGlbToFixture(narrowed, collisionBytes);
    } catch (error) {
      expect((error as RuntimeMapPackageLoadError).issues[0].code).toBe('MAP_COLLISION_OUT_OF_BOUNDS');
    }
  });
});
