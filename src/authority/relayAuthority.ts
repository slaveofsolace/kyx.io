import {
  G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID,
  G4_COMBAT_ROOM_PROFILE_ID,
  G4_HITSCAN_ROOM_CAPABILITY_ID,
  G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
  G4_TDM_MATCH_ROOM_CAPABILITY_ID,
  type AuthorityRoomCombatOptions,
  type AuthoritySpawn,
} from './room';
import {
  createRapierCombatWorldPorts,
} from './combat/inkfallRapierCombatWorld';
import {
  hashPhysicsFixture,
  loadPhysicsFixture,
  type FixtureSolidV1,
  type PhysicsFixtureV1,
  type RapierMovementWorld,
} from '../physics';

export const RELAY_AUTHORITY_MAP_ID = 'relay' as const;
export const RELAY_AUTHORITY_FIXTURE_ID = 'relay_map_collision' as const;
export const RELAY_AUTHORITY_REVISION = 1 as const;
export const RELAY_AUTHORITY_PROFILE_ID =
  'relay-revision-1-authority-v1' as const;
export const RELAY_AUTHORITY_MAP_REFERENCE = 'relay@1' as const;
export const RELAY_AUTHORITY_PRESENTATION_REFERENCE =
  'relay@1/open-sky/v5' as const;
export const RELAY_COMBAT_WORLD_CAPABILITY_ID =
  'authoritative_relay_revision_1_rapier_combat_v1' as const;

type VectorTuple = readonly [number, number, number];

function vector([x, y, z]: VectorTuple) {
  return Object.freeze({ x, y, z });
}

function box(
  id: string,
  center: VectorTuple,
  halfExtents: VectorTuple,
  rotation: VectorTuple = [0, 0, 0],
): FixtureSolidV1 {
  return Object.freeze({
    id,
    layer: 'world_static',
    body: 'fixed',
    centerMm: vector(center),
    rotationMilliDegrees: vector(rotation),
    velocityMmPerSecond: vector([0, 0, 0]),
    shape: Object.freeze({
      type: 'box',
      halfExtentsMm: vector(halfExtents),
    }),
  });
}

const solids = Object.freeze([
  // Main level: two protected spawn courts, an open central court, and a
  // broad north flank. Every surface is individually named and renderable.
  box('relay_spawn_pad_west', [-28_000, -250, 0], [5_000, 250, 7_000]),
  box('relay_spawn_pad_east', [28_000, -250, 0], [5_000, 250, 7_000]),
  // The asymmetric center envelope meets both side connectors at x +/-13 m,
  // preserves the south stair lip at z -8.5 m, and reaches the north floor at
  // z 10 m. The earlier 10 x 8.5 m box left three-meter fall-through gaps on
  // the primary spawn-to-center route.
  box('relay_floor_central_court', [0, -250, 750], [13_000, 250, 9_250]),
  box('relay_floor_west_connector', [-18_000, -250, 0], [5_000, 250, 4_000]),
  box('relay_floor_east_connector', [18_000, -250, 0], [5_000, 250, 4_000]),
  box('relay_floor_north_west', [-20_000, -250, 15_000], [10_000, 250, 5_000]),
  box('relay_floor_north_center', [0, -250, 15_000], [10_000, 250, 5_000]),
  box('relay_floor_north_east', [20_000, -250, 15_000], [10_000, 250, 5_000]),
  box('relay_floor_west_north_link', [-28_000, -250, 9_500], [5_000, 250, 2_500]),
  box('relay_floor_east_north_link', [28_000, -250, 9_500], [5_000, 250, 2_500]),

  // Upper relay bridge: two mirrored ramps, two side decks, and one narrow
  // cross-map bridge with a north overlook.
  box('relay_ramp_west_upper', [-14_100, 1_750, 10_000], [4_900, 160, 2_100], [0, 0, 24_000]),
  box('relay_ramp_east_upper', [14_100, 1_750, 10_000], [4_900, 160, 2_100], [0, 0, -24_000]),
  box('relay_floor_upper_west', [-10_500, 3_750, 10_000], [3_500, 180, 3_500]),
  box('relay_floor_upper_east', [10_500, 3_750, 10_000], [3_500, 180, 3_500]),
  box('relay_bridge_upper_center', [0, 3_750, 10_000], [7_000, 180, 1_850]),
  box('relay_bridge_upper_north_link', [0, 3_750, 15_000], [2_600, 180, 3_150]),
  box('relay_floor_upper_overlook', [0, 3_750, 20_000], [5_000, 180, 1_850]),
  box('relay_bridge_support_west', [-5_600, 1_750, 10_000], [420, 1_750, 420]),
  box('relay_bridge_support_east', [5_600, 1_750, 10_000], [420, 1_750, 420]),

  // Lower service court: stepped access creates a readable third tier without
  // stacking hidden helper ramps through the player's eye line.
  box('relay_step_lower_one', [0, -625, -9_250], [6_000, 625, 750]),
  box('relay_step_lower_two', [0, -1_250, -10_750], [6_000, 1_250, 750]),
  box('relay_step_lower_three', [0, -1_875, -12_250], [6_000, 1_875, 750]),
  box('relay_floor_lower_center', [0, -3_250, -17_000], [8_000, 250, 4_000]),
  box('relay_floor_lower_west', [-16_000, -3_250, -17_000], [8_000, 250, 4_000]),
  box('relay_floor_lower_east', [16_000, -3_250, -17_000], [8_000, 250, 4_000]),
  box('relay_floor_west_lower_link', [-27_000, -1_750, -11_000], [4_000, 250, 3_000]),
  box('relay_floor_east_lower_link', [27_000, -1_750, -11_000], [4_000, 250, 3_000]),
  box('relay_step_west_lower', [-24_000, -875, -8_500], [3_000, 875, 1_500]),
  box('relay_step_east_lower', [24_000, -875, -8_500], [3_000, 875, 1_500]),

  // Outer silhouette and spawn sight protection.
  box('relay_boundary_west', [-34_000, 750, 0], [500, 1_250, 24_000]),
  box('relay_boundary_east', [34_000, 750, 0], [500, 1_250, 24_000]),
  box('relay_boundary_north', [0, 1_500, 24_000], [34_000, 2_000, 500]),
  box('relay_boundary_south', [0, 750, -24_000], [34_000, 1_250, 500]),
  box('relay_wall_west_spawn_north', [-25_000, 1_050, 7_600], [3_000, 1_050, 240]),
  box('relay_wall_west_spawn_south', [-25_000, 1_050, -7_600], [3_000, 1_050, 240]),
  box('relay_wall_east_spawn_north', [25_000, 1_050, 7_600], [3_000, 1_050, 240]),
  box('relay_wall_east_spawn_south', [25_000, 1_050, -7_600], [3_000, 1_050, 240]),
  box('relay_wall_lower_west', [-24_000, -1_100, -17_000], [300, 1_900, 4_000]),
  box('relay_wall_lower_east', [24_000, -1_100, -17_000], [300, 1_900, 4_000]),

  // Upper safety rails are thin and consistent; no rotated guard-volume fan.
  box('relay_guard_rail_upper_center_north', [0, 4_300, 11_950], [7_000, 550, 120]),
  box('relay_guard_rail_upper_center_south', [0, 4_300, 8_050], [7_000, 550, 120]),
  box('relay_guard_rail_upper_west_north', [-10_500, 4_300, 13_550], [3_500, 550, 120]),
  box('relay_guard_rail_upper_west_south', [-10_500, 4_300, 6_450], [3_500, 550, 120]),
  box('relay_guard_rail_upper_east_north', [10_500, 4_300, 13_550], [3_500, 550, 120]),
  box('relay_guard_rail_upper_east_south', [10_500, 4_300, 6_450], [3_500, 550, 120]),
  box('relay_guard_rail_upper_link_west', [-2_650, 4_300, 15_000], [120, 550, 3_150]),
  box('relay_guard_rail_upper_link_east', [2_650, 4_300, 15_000], [120, 550, 3_150]),
  box('relay_guard_rail_overlook_north', [0, 4_300, 21_950], [5_000, 550, 120]),

  // Human-scale cover establishes fight rhythm without hiding whole routes.
  box('relay_module_half_cover_court_northwest', [-5_500, 650, 5_200], [1_400, 650, 450], [0, 22_500, 0]),
  box('relay_module_half_cover_court_southeast', [5_500, 650, -5_200], [1_400, 650, 450], [0, 22_500, 0]),
  box('relay_module_full_cover_court_northeast', [5_800, 1_200, 5_800], [900, 1_200, 650]),
  box('relay_module_full_cover_court_southwest', [-5_800, 1_200, -5_800], [900, 1_200, 650]),
  box('relay_module_half_cover_north_west', [-14_000, 650, 15_000], [1_600, 650, 500]),
  box('relay_module_half_cover_north_east', [14_000, 650, 15_000], [1_600, 650, 500]),
  box('relay_module_full_cover_lower_west', [-10_000, -1_800, -17_000], [900, 1_200, 650]),
  box('relay_module_full_cover_lower_east', [10_000, -1_800, -17_000], [900, 1_200, 650]),
] as const);

const fixtureInput = Object.freeze({
  schemaVersion: 1,
  id: RELAY_AUTHORITY_FIXTURE_ID,
  revision: RELAY_AUTHORITY_REVISION,
  millimetersPerRapierUnit: 1_000,
  spawn: Object.freeze({
    feetPositionMm: vector([-28_000, 0, 0]),
    yawMilliDegrees: 90_000,
  }),
  solids,
  volumes: Object.freeze([
    Object.freeze({
      id: 'relay_recovery_below_arena',
      kind: 'recovery',
      layer: 'recovery_volume',
      centerMm: vector([0, -6_000, 0]),
      rotationMilliDegrees: vector([0, 0, 0]),
      shape: Object.freeze({
        type: 'box',
        halfExtentsMm: vector([48_000, 2_000, 38_000]),
      }),
    }),
    Object.freeze({
      id: 'relay_kill_below_recovery',
      kind: 'kill',
      layer: 'kill_volume',
      centerMm: vector([0, -13_000, 0]),
      rotationMilliDegrees: vector([0, 0, 0]),
      shape: Object.freeze({
        type: 'box',
        halfExtentsMm: vector([52_000, 5_000, 42_000]),
      }),
    }),
  ]),
});

export const RELAY_AUTHORITY_FIXTURE: PhysicsFixtureV1 = loadPhysicsFixture(
  fixtureInput,
);
export const RELAY_AUTHORITY_FIXTURE_HASH = hashPhysicsFixture(
  RELAY_AUTHORITY_FIXTURE,
);

export const RELAY_AUTHORITY_SPAWNS = Object.freeze([
  Object.freeze({ spawnId: 'relay_spawn_west_a', feetPosition: vector([-29_000, 0, 0]), yawMilliDegrees: 90_000 }),
  Object.freeze({ spawnId: 'relay_spawn_east_a', feetPosition: vector([29_000, 0, 0]), yawMilliDegrees: 270_000 }),
  Object.freeze({ spawnId: 'relay_spawn_west_b', feetPosition: vector([-28_000, 0, 4_500]), yawMilliDegrees: 90_000 }),
  Object.freeze({ spawnId: 'relay_spawn_east_b', feetPosition: vector([28_000, 0, -4_500]), yawMilliDegrees: 270_000 }),
  Object.freeze({ spawnId: 'relay_spawn_north_west', feetPosition: vector([-20_000, 0, 15_000]), yawMilliDegrees: 90_000 }),
  Object.freeze({ spawnId: 'relay_spawn_north_east', feetPosition: vector([20_000, 0, 15_000]), yawMilliDegrees: 270_000 }),
  Object.freeze({ spawnId: 'relay_spawn_lower_west', feetPosition: vector([-16_000, -3_000, -17_000]), yawMilliDegrees: 90_000 }),
  Object.freeze({ spawnId: 'relay_spawn_lower_east', feetPosition: vector([16_000, -3_000, -17_000]), yawMilliDegrees: 270_000 }),
] as const);

function zone(
  zoneId: string,
  callout: string,
  family: string,
  center: VectorTuple,
  halfExtents: VectorTuple,
) {
  return Object.freeze({
    zoneId,
    callout,
    family,
    center: vector(center),
    halfExtents: vector(halfExtents),
  });
}

export const RELAY_AUTHORITY_ZONES = Object.freeze([
  zone('relay_west_spawn', 'West Bay', 'spawn', [-28_000, 1_500, 0], [6_500, 3_000, 8_500]),
  zone('relay_east_spawn', 'East Bay', 'spawn', [28_000, 1_500, 0], [6_500, 3_000, 8_500]),
  zone('relay_central_court', 'Signal Court', 'main', [0, 1_500, 750], [13_000, 3_000, 9_250]),
  zone('relay_north_flank', 'North Gallery', 'flank', [0, 1_500, 15_000], [30_000, 3_000, 5_000]),
  zone('relay_upper_bridge', 'Relay Bridge', 'upper', [0, 4_250, 11_000], [15_000, 2_250, 5_000]),
  zone('relay_upper_overlook', 'Array Overlook', 'upper', [0, 4_250, 19_000], [5_500, 2_250, 4_000]),
  zone('relay_lower_descent', 'Service Descent', 'lower', [0, -1_250, -11_000], [31_000, 3_000, 3_500]),
  zone('relay_lower_service', 'Lower Relay', 'lower', [0, -1_750, -17_000], [24_000, 3_000, 4_500]),
] as const);

function relayPackageDigest(): string {
  const source = JSON.stringify({
    schemaVersion: 1,
    mapId: RELAY_AUTHORITY_MAP_ID,
    mapRevision: RELAY_AUTHORITY_REVISION,
    fixtureId: RELAY_AUTHORITY_FIXTURE_ID,
    fixtureHash: RELAY_AUTHORITY_FIXTURE_HASH,
    spawns: RELAY_AUTHORITY_SPAWNS,
    zones: RELAY_AUTHORITY_ZONES,
    portal: {
      capabilityId: 'relay_revision_1_linked_world_portal_v1',
      endpointCount: 2,
    },
  });
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

// Collision, ordered spawns, callout zones, and the linked-gate contract are
// one exact authority package. Presentation art iterates behind its separate
// presentationReference without mutating this digest.
export const RELAY_AUTHORITY_PACKAGE_DIGEST = relayPackageDigest();
export const RELAY_AUTHORITY_IDENTITY = Object.freeze({
  mapId: RELAY_AUTHORITY_MAP_ID,
  mapRevision: RELAY_AUTHORITY_REVISION,
  packageDigest: RELAY_AUTHORITY_PACKAGE_DIGEST,
  fixtureId: RELAY_AUTHORITY_FIXTURE_ID,
  fixtureHash: RELAY_AUTHORITY_FIXTURE_HASH,
  colliderCardinality: RELAY_AUTHORITY_FIXTURE.solids.length,
});

export const RELAY_AUTHORITY_MAP_BINDING = Object.freeze({
  mapReference: RELAY_AUTHORITY_MAP_REFERENCE,
  presentationReference: RELAY_AUTHORITY_PRESENTATION_REFERENCE,
  mapId: RELAY_AUTHORITY_IDENTITY.mapId,
  mapRevision: RELAY_AUTHORITY_IDENTITY.mapRevision,
  packageDigest: RELAY_AUTHORITY_IDENTITY.packageDigest,
  fixtureId: RELAY_AUTHORITY_IDENTITY.fixtureId,
  fixtureHash: RELAY_AUTHORITY_IDENTITY.fixtureHash,
  xAxis: 'east',
  yAxis: 'up',
  zAxis: 'north',
  origin: 'relay_central_court',
  gltfToMap: 'x_y_negative_z',
  distanceUnit: 'millimeters',
  angleUnit: 'milli_degrees',
  colliderCardinality: RELAY_AUTHORITY_IDENTITY.colliderCardinality,
  supportedModes: Object.freeze(['deathmatch', 'team_deathmatch']),
  spawns: RELAY_AUTHORITY_SPAWNS,
  zones: RELAY_AUTHORITY_ZONES,
  pickups: Object.freeze([]),
  portal: Object.freeze({
    capabilityId: 'relay_revision_1_linked_world_portal_v1',
    authorityRole: 'server_authority',
    renderRole: 'relay_render_only_no_hit',
    endpointCount: 2,
  }),
} as const);

export type RelayAuthorityMapBinding = typeof RELAY_AUTHORITY_MAP_BINDING;

export function isRelayAuthorityProfile(
  value: string | null,
): value is typeof RELAY_AUTHORITY_PROFILE_ID {
  return value === RELAY_AUTHORITY_PROFILE_ID;
}

export function relayAuthoritySpawn(ordinal: number): AuthoritySpawn {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new RangeError('Relay spawn ordinal must be a non-negative safe integer');
  }
  const spawn = RELAY_AUTHORITY_SPAWNS[ordinal % RELAY_AUTHORITY_SPAWNS.length];
  if (spawn === undefined) throw new Error('RELAY_AUTHORITY_SPAWN_MISSING');
  return spawn;
}

export function createRelayAuthorityCombatOptions(
  world: RapierMovementWorld,
): AuthorityRoomCombatOptions {
  const ports = createRapierCombatWorldPorts(
    world,
    RELAY_AUTHORITY_IDENTITY,
    RELAY_COMBAT_WORLD_CAPABILITY_ID,
    'RELAY_REVISION_1',
  );
  return Object.freeze({
    profileId: G4_COMBAT_ROOM_PROFILE_ID,
    teamResolver: (_playerId: string, ordinal: number) => (
      ordinal % 2 === 0 ? 'team_blue' : 'team_red'
    ),
    hitscan: Object.freeze({
      capabilityId: G4_HITSCAN_ROOM_CAPABILITY_ID,
      worldOcclusion: ports.worldOcclusion,
    }),
    impulseGrenade: Object.freeze({
      capabilityId: G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
      world: ports.impulseGrenadeWorld,
    }),
    abilityResources: Object.freeze({
      capabilityId: G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID,
    }),
    match: Object.freeze({ capabilityId: G4_TDM_MATCH_ROOM_CAPABILITY_ID }),
  });
}
