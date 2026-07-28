import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  asMillimeters,
} from '../../../src/sim';
import {
  createRapierMovementWorld,
  type RapierMovementWorld,
} from '../../../src/physics';
import {
  ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
  ONLINE_INKFALL_REV4_MAP_BINDING,
} from '../../../src/app/onlineAuthorityProfiles';
import {
  G5_INKFALL_REV4_COMBAT_PROFILE,
  INKFALL_REVISION_3_WORKER_MAP_BINDING,
  inferWorkerRoomProfileFromIdentity,
  inkfallRevision3WorkerFixture,
  inkfallWorkerCombatSpawn,
} from '../../../worker/combatRuntime';

const SOLID_LAYERS = [
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
] as const;

let world: RapierMovementWorld;

beforeAll(async () => {
  world = await createRapierMovementWorld(inkfallRevision3WorkerFixture());
});

afterAll(() => world?.dispose());

describe('Inkfall Rev4 presentation / Revision 3 authoritative profile', () => {
  it('keeps the browser and Worker on one exact complete authority binding', () => {
    expect(ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID).toBe(G5_INKFALL_REV4_COMBAT_PROFILE);
    expect(ONLINE_INKFALL_REV4_MAP_BINDING).toEqual(INKFALL_REVISION_3_WORKER_MAP_BINDING);
    expect(INKFALL_REVISION_3_WORKER_MAP_BINDING).toMatchObject({
      mapReference: 'inkfall_foundry@3',
      presentationReference:
        'inkfall_foundry@3/press_archive/v4.1/spatial-material-joined',
      mapRevision: 3,
      fixtureHash: '6cf785c5171f2ff5',
      colliderCardinality: 339,
      render: {
        role: 'render_only',
        renderMeshesMayBeAuthority: false,
      },
      collision: {
        role: 'authority_collision',
        sha256: '1cce637ab4f83766627527b3885c3e9da819d8bcabdfa2144f8dc6b46bc5bba8',
      },
      telemetry: {
        authoritySource: 'durable_object_room_metrics_v1',
        zoneCount: 9,
        pickupCount: 0,
      },
    });
    expect(INKFALL_REVISION_3_WORKER_MAP_BINDING.spawns).toHaveLength(12);
    expect(INKFALL_REVISION_3_WORKER_MAP_BINDING.zones).toHaveLength(9);
    expect(INKFALL_REVISION_3_WORKER_MAP_BINDING.pickups).toEqual([]);
    expect(INKFALL_REVISION_3_WORKER_MAP_BINDING.supportedModes)
      .toEqual(['deathmatch', 'team_deathmatch']);
  });

  it('reconstructs the frozen authority fixture without allowing render authority', () => {
    expect(world.fixture).toMatchObject({
      id: 'inkfall_foundry_map_collision',
      revision: 3,
    });
    expect(world.fixtureHash).toBe('6cf785c5171f2ff5');
    expect(world.fixture.solids).toHaveLength(339);
    expect(world.fixture.volumes).toHaveLength(2);
    expect(world.fixture.solids.every(({ layer }) => layer === 'world_static')).toBe(true);
  });

  it('allocates eight unique capsule-clear runtime spawns deterministically', () => {
    const firstPass = Array.from({ length: 8 }, (_, ordinal) => (
      inkfallWorkerCombatSpawn(ordinal, G5_INKFALL_REV4_COMBAT_PROFILE)
    ));
    const secondPass = Array.from({ length: 8 }, (_, ordinal) => (
      inkfallWorkerCombatSpawn(ordinal, G5_INKFALL_REV4_COMBAT_PROFILE)
    ));
    expect(secondPass).toEqual(firstPass);
    expect(firstPass.every(({ spawnId }) => typeof spawnId === 'string')).toBe(true);
    expect(new Set(firstPass.map(({ spawnId }) => spawnId)).size).toBe(8);
    expect(new Set(firstPass.map(({ feetPosition }) => (
      `${feetPosition.x}:${feetPosition.y}:${feetPosition.z}`
    ))).size).toBe(8);

    for (const spawn of firstPass) {
      expect(world.overlapCapsule({
        feetPosition: {
          x: asMillimeters(spawn.feetPosition.x),
          y: asMillimeters(spawn.feetPosition.y),
          z: asMillimeters(spawn.feetPosition.z),
        },
        shape: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.standingShape,
        solidLayers: SOLID_LAYERS,
      }).blockingColliderIds, spawn.spawnId).toEqual([]);
    }

    const pairDistances = firstPass.flatMap((left, leftIndex) => (
      firstPass.slice(leftIndex + 1).map((right) => Math.hypot(
        left.feetPosition.x - right.feetPosition.x,
        left.feetPosition.y - right.feetPosition.y,
        left.feetPosition.z - right.feetPosition.z,
      ))
    ));
    expect(Math.min(...pairDistances)).toBeGreaterThanOrEqual(4_000);
  });

  it('recovers the exact Rev4 profile from the persisted simulation identity', () => {
    expect(inferWorkerRoomProfileFromIdentity({
      mapId: 'inkfall_foundry',
      rulesetId: 'revamped_classic',
      rulesetRevision: 3,
      rulesetHash: 'd5f0418d1d927370',
      fixtureId: 'inkfall_foundry_map_collision',
      fixtureHash: '6cf785c5171f2ff5',
    })).toBe(G5_INKFALL_REV4_COMBAT_PROFILE);
  });
});
