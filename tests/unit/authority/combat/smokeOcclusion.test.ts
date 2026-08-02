import { describe, expect, it } from 'vitest';

import {
  AUTHORITY_ABILITY_LOADOUT_RUNTIME_SCHEMA_VERSION,
  AUTHORITY_THROWABLE_RULES,
  createAuthoritySmokeAwareHitscanOcclusionPort,
  resolveAuthoritySmokeRayOcclusion,
  type AuthoritySmokeFieldV1,
  type AuthorityWorldOcclusionRayV1,
} from '../../../../src/authority';
import { ABILITY_ID } from '../../../../src/abilities/abilityLoadout';

const SMOKE_RADIUS_MILLIMETERS =
  AUTHORITY_THROWABLE_RULES[ABILITY_ID.smoke].areaRadiusMillimeters;

function field(
  fieldId: string,
  overrides: Partial<AuthoritySmokeFieldV1> = {},
): AuthoritySmokeFieldV1 {
  return {
    schemaVersion: AUTHORITY_ABILITY_LOADOUT_RUNTIME_SCHEMA_VERSION,
    fieldId,
    ownerPlayerId: 'player_smoke_owner',
    ownerTeamId: 'team_blue',
    spawnedAtTick: 100,
    expiresAtTick: 300,
    centerMillimeters: { x: 10_000, y: 0, z: 0 },
    radiusMillimeters: SMOKE_RADIUS_MILLIMETERS,
    ...overrides,
  };
}

function ray(
  overrides: Partial<AuthorityWorldOcclusionRayV1> = {},
): AuthorityWorldOcclusionRayV1 {
  return {
    schemaVersion: 1,
    originMillimeters: { x: 0, y: 0, z: 0 },
    directionUnit: { x: 1, y: 0, z: 0 },
    maximumDistanceMillimeters: 120_000,
    layer: 'authoritative_world',
    purpose: 'shot_path',
    ...overrides,
  };
}

describe('authoritative smoke hitscan occlusion', () => {
  it('returns the active sphere entry and immediately obscures a shot originating inside smoke', () => {
    const entry = resolveAuthoritySmokeRayOcclusion(ray(), 100, [field('smoke.alpha')]);
    expect(entry).toEqual({
      schemaVersion: 1,
      hit: true,
      distanceMillimeters: 4_120,
      colliderId: 'smoke.alpha',
    });
    expect(Object.isFrozen(entry)).toBe(true);

    expect(resolveAuthoritySmokeRayOcclusion(ray({
      originMillimeters: { x: 10_000, y: 0, z: 0 },
    }), 299, [field('smoke.alpha')])).toMatchObject({
      hit: true,
      distanceMillimeters: 0,
      colliderId: 'smoke.alpha',
    });
  });

  it('honors the active half-open tick interval and ignores smoke for barrel clearance', () => {
    const smoke = field('smoke.interval');
    expect(resolveAuthoritySmokeRayOcclusion(ray(), 99, [smoke]).hit).toBe(false);
    expect(resolveAuthoritySmokeRayOcclusion(ray(), 299, [smoke]).hit).toBe(true);
    expect(resolveAuthoritySmokeRayOcclusion(ray(), 300, [smoke]).hit).toBe(false);
    expect(resolveAuthoritySmokeRayOcclusion(ray(), 150, [field('smoke.behind', {
      centerMillimeters: { x: -10_000, y: 0, z: 0 },
    })]).hit).toBe(false);
    expect(resolveAuthoritySmokeRayOcclusion(ray({
      purpose: 'barrel_clearance',
    }), 150, [smoke]).hit).toBe(false);
  });

  it('selects the nearest field with a stable ID tie-break', () => {
    const tiedA = field('smoke.a');
    const tiedB = field('smoke.b');
    const nearer = field('smoke.near', {
      centerMillimeters: { x: 8_000, y: 0, z: 0 },
    });
    expect(resolveAuthoritySmokeRayOcclusion(ray(), 150, [tiedB, tiedA])).toMatchObject({
      distanceMillimeters: 4_120,
      colliderId: 'smoke.a',
    });
    expect(resolveAuthoritySmokeRayOcclusion(ray(), 150, [tiedB, nearer, tiedA])).toMatchObject({
      distanceMillimeters: 2_120,
      colliderId: 'smoke.near',
    });
  });

  it('composes smoke with physical geometry and gives physical geometry an exact-distance tie', () => {
    const smoke = field('smoke.composed');
    const worldAt = (distanceMillimeters: number) => () => ({
      schemaVersion: 1 as const,
      hit: true,
      distanceMillimeters,
      colliderId: 'world.wall',
    });
    const worldFirst = createAuthoritySmokeAwareHitscanOcclusionPort({
      schemaVersion: 1,
      authorityTick: 150,
      smokeFields: [smoke],
      worldOcclusion: worldAt(3_000),
    });
    const smokeFirst = createAuthoritySmokeAwareHitscanOcclusionPort({
      schemaVersion: 1,
      authorityTick: 150,
      smokeFields: [smoke],
      worldOcclusion: worldAt(5_000),
    });
    const exactTie = createAuthoritySmokeAwareHitscanOcclusionPort({
      schemaVersion: 1,
      authorityTick: 150,
      smokeFields: [smoke],
      worldOcclusion: worldAt(4_120),
    });

    expect(worldFirst(ray())).toMatchObject({ colliderId: 'world.wall' });
    expect(smokeFirst(ray())).toMatchObject({ colliderId: 'smoke.composed' });
    expect(exactTie(ray())).toMatchObject({ colliderId: 'world.wall' });
  });

  it('fails closed on malformed rays and duplicate smoke IDs', () => {
    expect(() => resolveAuthoritySmokeRayOcclusion(ray({
      directionUnit: { x: 2, y: 0, z: 0 },
    }), 150, [field('smoke.valid')])).toThrow(/unit length/);

    expect(() => createAuthoritySmokeAwareHitscanOcclusionPort({
      schemaVersion: 1,
      authorityTick: 150,
      smokeFields: [field('smoke.duplicate'), field('smoke.duplicate')],
      worldOcclusion: () => ({
        schemaVersion: 1,
        hit: false,
        distanceMillimeters: null,
        colliderId: null,
      }),
    })).toThrow(/IDs must be unique/);
  });
});
