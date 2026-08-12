import { describe, expect, it } from 'vitest';

import {
  CROWNPOINT_AUTHORITY_FIXTURE,
  CROWNPOINT_AUTHORITY_MAP_BINDING,
  CROWNPOINT_AUTHORITY_PROFILE_ID,
  CROWNPOINT_AUTHORITY_SPAWNS,
  SWITCHYARD_AUTHORITY_FIXTURE,
  SWITCHYARD_AUTHORITY_MAP_BINDING,
  SWITCHYARD_AUTHORITY_PROFILE_ID,
  SWITCHYARD_AUTHORITY_SPAWNS,
  isOriginalArenaAuthorityProfile,
  originalArenaAuthorityMapBinding,
  originalArenaAuthoritySpawn,
} from '../../../src/authority/originalArenaAuthority';

describe('original authority arena contracts', () => {
  it.each([
    [
      SWITCHYARD_AUTHORITY_PROFILE_ID,
      SWITCHYARD_AUTHORITY_FIXTURE,
      SWITCHYARD_AUTHORITY_MAP_BINDING,
      SWITCHYARD_AUTHORITY_SPAWNS,
      'switchyard',
    ],
    [
      CROWNPOINT_AUTHORITY_PROFILE_ID,
      CROWNPOINT_AUTHORITY_FIXTURE,
      CROWNPOINT_AUTHORITY_MAP_BINDING,
      CROWNPOINT_AUTHORITY_SPAWNS,
      'crownpoint',
    ],
  ] as const)('pins %s as a distinct eight-spawn authority package', (
    profile,
    fixture,
    binding,
    spawns,
    mapId,
  ) => {
    expect(isOriginalArenaAuthorityProfile(profile)).toBe(true);
    expect(originalArenaAuthorityMapBinding(profile)).toBe(binding);
    expect(fixture.id).toBe(`${mapId}_map_collision`);
    expect(fixture.revision).toBe(1);
    expect(fixture.solids.length).toBeGreaterThanOrEqual(20);
    expect(fixture.volumes).toHaveLength(2);
    expect(binding).toMatchObject({
      mapId,
      mapRevision: 1,
      fixtureId: fixture.id,
      colliderCardinality: fixture.solids.length,
      spawns,
    });
    expect(binding.fixtureHash).toMatch(/^[0-9a-f]{16}$/u);
    expect(binding.packageDigest).toMatch(/^[0-9a-f]{16}$/u);
    expect(spawns).toHaveLength(8);
    expect(new Set(spawns.map(({ spawnId }) => spawnId)).size).toBe(8);
    for (const [ordinal, item] of spawns.entries()) {
      expect(originalArenaAuthoritySpawn(ordinal, profile)).toBe(item);
      expect(originalArenaAuthoritySpawn(ordinal + 8, profile)).toBe(item);
      expect(item.feetPosition.y).toBe(0);
    }
  });

  it('keeps both arena geometries distinct from Relay and each other', () => {
    expect(SWITCHYARD_AUTHORITY_MAP_BINDING.fixtureHash)
      .not.toBe(CROWNPOINT_AUTHORITY_MAP_BINDING.fixtureHash);
    expect(SWITCHYARD_AUTHORITY_MAP_BINDING.mapReference).toBe('switchyard@1');
    expect(CROWNPOINT_AUTHORITY_MAP_BINDING.mapReference).toBe('crownpoint@1');
    expect(SWITCHYARD_AUTHORITY_FIXTURE.solids.map(({ id }) => id).join('\n'))
      .not.toMatch(/(?:relay|inkfall|foundry)/u);
    expect(CROWNPOINT_AUTHORITY_FIXTURE.solids.map(({ id }) => id).join('\n'))
      .not.toMatch(/(?:relay|inkfall|foundry)/u);
  });

  it('fails closed on unsupported profiles and spawn ordinals', () => {
    expect(isOriginalArenaAuthorityProfile('relay-revision-1-authority-v1')).toBe(false);
    expect(() => originalArenaAuthoritySpawn(-1, SWITCHYARD_AUTHORITY_PROFILE_ID))
      .toThrow(RangeError);
  });
});
