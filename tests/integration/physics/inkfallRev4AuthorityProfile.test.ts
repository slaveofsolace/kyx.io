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
  INKFALL_REV5_CANDIDATE_ART,
} from '../../../src/app/inkfallRev5CandidateBinding';
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

const REV3_SPAWN_EGRESS_TARGETS = Object.freeze({
  spawn_w_press_a: Object.freeze({ x: -27_500, z: 1_000 }),
  spawn_w_press_b: Object.freeze({ x: -27_500, z: 1_000 }),
  spawn_w_ink: Object.freeze({ x: -25_000, z: -7_000 }),
  spawn_w_archive: Object.freeze({ x: -25_000, z: 7_000 }),
  spawn_e_press_a: Object.freeze({ x: 27_500, z: -1_000 }),
  spawn_e_press_b: Object.freeze({ x: 27_500, z: -1_000 }),
  spawn_e_ink: Object.freeze({ x: 25_000, z: -7_000 }),
  spawn_e_archive: Object.freeze({ x: 25_000, z: 7_000 }),
  spawn_dm_ink_w: Object.freeze({ x: -22_000, z: -17_000 }),
  spawn_dm_ink_e: Object.freeze({ x: 22_000, z: -17_000 }),
  spawn_dm_archive_w: Object.freeze({ x: -22_000, z: 17_000 }),
  spawn_dm_archive_e: Object.freeze({ x: 22_000, z: 17_000 }),
} as const);

let world: RapierMovementWorld;

beforeAll(async () => {
  world = await createRapierMovementWorld(inkfallRevision3WorkerFixture());
});

afterAll(() => world?.dispose());

describe('Inkfall Rev4 presentation / Revision 3 authoritative profile', () => {
  it('keeps the browser and Worker on one exact complete authority binding', () => {
    expect(ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID).toBe(G5_INKFALL_REV4_COMBAT_PROFILE);
    expect(ONLINE_INKFALL_REV4_MAP_BINDING).toEqual(INKFALL_REVISION_3_WORKER_MAP_BINDING);
    expect(INKFALL_REVISION_3_WORKER_MAP_BINDING.render).toMatchObject({
      sha256: INKFALL_REV5_CANDIDATE_ART.sha256,
      bytes: INKFALL_REV5_CANDIDATE_ART.bytes,
    });
    expect(INKFALL_REVISION_3_WORKER_MAP_BINDING).toMatchObject({
      mapReference: 'inkfall_foundry@3',
      presentationReference:
        'inkfall_foundry@3/press_archive/v5.0/geometry-portal-modular',
      mapRevision: 3,
      fixtureHash: '97eb7772ac59dc95',
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
    expect(world.fixtureHash).toBe('97eb7772ac59dc95');
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

  it('faces every Revision 3 spawn through its first traversable egress', () => {
    for (const spawn of INKFALL_REVISION_3_WORKER_MAP_BINDING.spawns) {
      const target = REV3_SPAWN_EGRESS_TARGETS[spawn.spawnId];
      const deltaX = target.x - spawn.feetPosition.x;
      const deltaZ = target.z - spawn.feetPosition.z;
      const distance = Math.hypot(deltaX, deltaZ);
      const yawRadians = spawn.yawMilliDegrees * Math.PI / 180_000;
      const alignment = (
        Math.sin(yawRadians) * deltaX
        + Math.cos(yawRadians) * deltaZ
      ) / distance;
      expect(alignment, spawn.spawnId).toBeGreaterThan(0.9999);
    }
  });

  it('recovers the exact Rev4 profile from the persisted simulation identity', () => {
    expect(inferWorkerRoomProfileFromIdentity({
      mapId: 'inkfall_foundry',
      rulesetId: 'revamped_classic',
      rulesetRevision: 3,
      rulesetHash: '69b19f19a19de288',
      fixtureId: 'inkfall_foundry_map_collision',
      fixtureHash: '97eb7772ac59dc95',
    })).toBe(G5_INKFALL_REV4_COMBAT_PROFILE);
  });
});
