import { describe, expect, it } from 'vitest';

import {
  RELAY_AUTHORITY_FIXTURE,
  RELAY_AUTHORITY_FIXTURE_HASH,
  RELAY_AUTHORITY_IDENTITY,
  RELAY_AUTHORITY_MAP_BINDING,
  RELAY_AUTHORITY_PACKAGE_DIGEST,
  RELAY_AUTHORITY_PROFILE_ID,
  RELAY_AUTHORITY_SPAWNS,
  RELAY_AUTHORITY_ZONES,
  relayAuthoritySpawn,
  isRelayAuthorityProfile,
} from '../../../src/authority/relayAuthority';

describe('Relay Revision 1 authority candidate', () => {
  it('pins one original, deterministic 56-collider fixture identity', () => {
    expect(RELAY_AUTHORITY_FIXTURE).toMatchObject({
      schemaVersion: 1,
      id: 'relay_map_collision',
      revision: 1,
      millimetersPerRapierUnit: 1_000,
    });
    expect(RELAY_AUTHORITY_FIXTURE.solids).toHaveLength(56);
    expect(RELAY_AUTHORITY_FIXTURE.volumes).toHaveLength(2);
    expect(RELAY_AUTHORITY_IDENTITY).toMatchObject({
      mapId: 'relay',
      mapRevision: 1,
      fixtureId: 'relay_map_collision',
      fixtureHash: RELAY_AUTHORITY_FIXTURE_HASH,
      colliderCardinality: 56,
    });
    expect(RELAY_AUTHORITY_PACKAGE_DIGEST).toMatch(/^[0-9a-f]{16}$/u);
    expect(RELAY_AUTHORITY_PACKAGE_DIGEST).not.toBe(RELAY_AUTHORITY_FIXTURE_HASH);

    const ids = RELAY_AUTHORITY_FIXTURE.solids.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.join('\n')).not.toMatch(/(?:inkfall|foundry|press|archive)/iu);
    expect(RELAY_AUTHORITY_FIXTURE.solids.every(({ layer, body }) => (
      layer === 'world_static' && body === 'fixed'
    ))).toBe(true);
  });

  it('keeps the central spawn sightline open while moving upper traversal north', () => {
    const byId = new Map(
      RELAY_AUTHORITY_FIXTURE.solids.map((solid) => [solid.id, solid]),
    );
    const upperRouteIds = [
      'relay_ramp_west_upper',
      'relay_ramp_east_upper',
      'relay_floor_upper_west',
      'relay_floor_upper_east',
      'relay_bridge_upper_center',
      'relay_bridge_upper_north_link',
      'relay_floor_upper_overlook',
    ];
    for (const id of upperRouteIds) {
      const solid = byId.get(id);
      expect(solid, id).toBeDefined();
      expect(solid?.centerMm.z, id).toBeGreaterThanOrEqual(10_000);
    }
    expect(byId.get('relay_floor_central_court')?.centerMm).toMatchObject({
      x: 0,
      z: 750,
    });
    expect(byId.get('relay_floor_central_court')?.shape).toMatchObject({
      type: 'box',
      halfExtentsMm: { x: 13_000, y: 250, z: 9_250 },
    });
    const center = byId.get('relay_floor_central_court');
    const westConnector = byId.get('relay_floor_west_connector');
    const eastConnector = byId.get('relay_floor_east_connector');
    expect(center?.shape.type).toBe('box');
    expect(westConnector?.shape.type).toBe('box');
    expect(eastConnector?.shape.type).toBe('box');
    if (
      center?.shape.type === 'box'
      && westConnector?.shape.type === 'box'
      && eastConnector?.shape.type === 'box'
    ) {
      expect(westConnector.centerMm.x + westConnector.shape.halfExtentsMm.x)
        .toBe(center.centerMm.x - center.shape.halfExtentsMm.x);
      expect(eastConnector.centerMm.x - eastConnector.shape.halfExtentsMm.x)
        .toBe(center.centerMm.x + center.shape.halfExtentsMm.x);
    }
    expect(byId.get('relay_bridge_support_west')).toBeDefined();
    expect(byId.get('relay_bridge_support_east')).toBeDefined();
    expect(byId.get('relay_floor_lower_center')?.centerMm.y).toBe(-3_250);
  });

  it('provides eight symmetric, bounded deterministic spawn frames', () => {
    expect(RELAY_AUTHORITY_SPAWNS).toHaveLength(8);
    expect(new Set(RELAY_AUTHORITY_SPAWNS.map(({ spawnId }) => spawnId)).size)
      .toBe(8);
    expect(RELAY_AUTHORITY_SPAWNS[0]).toMatchObject({
      spawnId: 'relay_spawn_west_a',
      feetPosition: { x: -29_000, y: 0, z: 0 },
      yawMilliDegrees: 90_000,
    });
    expect(RELAY_AUTHORITY_SPAWNS[1]).toMatchObject({
      spawnId: 'relay_spawn_east_a',
      feetPosition: { x: 29_000, y: 0, z: 0 },
      yawMilliDegrees: 270_000,
    });
    for (const [index, spawn] of RELAY_AUTHORITY_SPAWNS.entries()) {
      expect(Math.abs(spawn.feetPosition.x), spawn.spawnId)
        .toBeLessThanOrEqual(29_000);
      expect(Math.abs(spawn.feetPosition.z), spawn.spawnId)
        .toBeLessThanOrEqual(17_000);
      expect(relayAuthoritySpawn(index)).toBe(spawn);
      expect(relayAuthoritySpawn(index + RELAY_AUTHORITY_SPAWNS.length))
        .toBe(spawn);
    }
    expect(() => relayAuthoritySpawn(-1)).toThrow(RangeError);
  });

  it('binds every authored spawn to one of eight named gameplay callout zones', () => {
    expect(RELAY_AUTHORITY_ZONES).toHaveLength(8);
    expect(new Set(RELAY_AUTHORITY_ZONES.map(({ zoneId }) => zoneId)).size).toBe(8);
    for (const spawn of RELAY_AUTHORITY_SPAWNS) {
      const containingZones = RELAY_AUTHORITY_ZONES.filter((zone) => (
        Math.abs(spawn.feetPosition.x - zone.center.x) <= zone.halfExtents.x
        && Math.abs(spawn.feetPosition.y - zone.center.y) <= zone.halfExtents.y
        && Math.abs(spawn.feetPosition.z - zone.center.z) <= zone.halfExtents.z
      ));
      expect(containingZones.length, spawn.spawnId).toBeGreaterThan(0);
    }
  });

  it('publishes one exact fail-closed browser and Worker map contract', () => {
    expect(RELAY_AUTHORITY_PROFILE_ID).toBe('relay-revision-1-authority-v1');
    expect(isRelayAuthorityProfile(RELAY_AUTHORITY_PROFILE_ID)).toBe(true);
    expect(isRelayAuthorityProfile('inkfall-foundry')).toBe(false);
    expect(RELAY_AUTHORITY_MAP_BINDING).toMatchObject({
      mapReference: 'relay@1',
      presentationReference: 'relay@1/open-sky/v4',
      fixtureId: RELAY_AUTHORITY_IDENTITY.fixtureId,
      fixtureHash: RELAY_AUTHORITY_FIXTURE_HASH,
      colliderCardinality: 56,
      spawns: RELAY_AUTHORITY_SPAWNS,
      zones: RELAY_AUTHORITY_ZONES,
    });
  });
});
