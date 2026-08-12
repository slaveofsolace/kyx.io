import {
  G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID,
  G4_COMBAT_ROOM_PROFILE_ID,
  G4_HITSCAN_ROOM_CAPABILITY_ID,
  G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
  G4_TDM_MATCH_ROOM_CAPABILITY_ID,
  type AuthorityRoomCombatOptions,
  type AuthoritySpawn,
} from './room';
import { createRapierCombatWorldPorts } from './combat/inkfallRapierCombatWorld';
import {
  hashPhysicsFixture,
  loadPhysicsFixture,
  type FixtureSolidV1,
  type PhysicsFixtureV1,
  type RapierMovementWorld,
} from '../physics';

export const SWITCHYARD_AUTHORITY_PROFILE_ID =
  'switchyard-revision-1-authority-v1' as const;
export const CROWNPOINT_AUTHORITY_PROFILE_ID =
  'crownpoint-revision-1-authority-v1' as const;

export type OriginalArenaAuthorityProfile =
  | typeof SWITCHYARD_AUTHORITY_PROFILE_ID
  | typeof CROWNPOINT_AUTHORITY_PROFILE_ID;

type VectorTuple = readonly [number, number, number];
type FrozenVector = Readonly<{ x: number; y: number; z: number }>;

interface OriginalArenaDefinition {
  readonly profileId: OriginalArenaAuthorityProfile;
  readonly mapId: 'switchyard' | 'crownpoint';
  readonly displayName: 'Switchyard' | 'Crownpoint';
  readonly presentationTheme: 'freight_night' | 'solar_crown';
  readonly solids: readonly FixtureSolidV1[];
  readonly spawns: readonly AuthoritySpawn[];
  readonly zones: readonly Readonly<{
    zoneId: string;
    callout: string;
    family: string;
    center: FrozenVector;
    halfExtents: FrozenVector;
  }>[];
}

function vector([x, y, z]: VectorTuple): FrozenVector {
  return Object.freeze({ x, y, z });
}

function box(
  id: string,
  center: VectorTuple,
  halfExtents: VectorTuple,
): FixtureSolidV1 {
  return Object.freeze({
    id,
    layer: 'world_static',
    body: 'fixed',
    centerMm: vector(center),
    rotationMilliDegrees: vector([0, 0, 0]),
    velocityMmPerSecond: vector([0, 0, 0]),
    shape: Object.freeze({ type: 'box', halfExtentsMm: vector(halfExtents) }),
  });
}

function spawn(
  spawnId: string,
  position: VectorTuple,
  yawMilliDegrees: number,
): AuthoritySpawn {
  return Object.freeze({
    spawnId,
    feetPosition: vector(position),
    yawMilliDegrees,
  });
}

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

function boundary(prefix: string, halfX: number, halfZ: number): readonly FixtureSolidV1[] {
  return Object.freeze([
    box(`${prefix}_boundary_west`, [-halfX - 500, 2_500, 0], [500, 2_500, halfZ + 1_000]),
    box(`${prefix}_boundary_east`, [halfX + 500, 2_500, 0], [500, 2_500, halfZ + 1_000]),
    box(`${prefix}_boundary_north`, [0, 2_500, halfZ + 500], [halfX, 2_500, 500]),
    box(`${prefix}_boundary_south`, [0, 2_500, -halfZ - 500], [halfX, 2_500, 500]),
  ]);
}

function stairRunX(prefix: string, sign: -1 | 1): readonly FixtureSolidV1[] {
  return Object.freeze(Array.from({ length: 5 }, (_, index) => {
    const top = (index + 1) * 500;
    const x = sign * (12_250 - index * 1_500);
    return box(`${prefix}_${index + 1}`, [x, top / 2, 0], [750, top / 2, 4_000]);
  }));
}

function stairRunToCrown(
  prefix: string,
  axis: 'x' | 'z',
  sign: -1 | 1,
): readonly FixtureSolidV1[] {
  return Object.freeze(Array.from({ length: 6 }, (_, index) => {
    const top = (index + 1) * 500;
    const distance = 10_500 - index * 1_000;
    const center: VectorTuple = axis === 'x'
      ? [sign * distance, top / 2, 0]
      : [0, top / 2, sign * distance];
    const half: VectorTuple = axis === 'x'
      ? [500, top / 2, 2_500]
      : [2_500, top / 2, 500];
    return box(`${prefix}_${index + 1}`, center, half);
  }));
}

const SWITCHYARD_SOLIDS = Object.freeze([
  box('switchyard_floor', [0, -250, 0], [30_000, 250, 22_000]),
  ...boundary('switchyard', 30_000, 22_000),
  box('switchyard_freight_deck', [0, 1_250, 0], [7_000, 1_250, 4_500]),
  ...stairRunX('switchyard_stair_west', -1),
  ...stairRunX('switchyard_stair_east', 1),
  box('switchyard_crane_spine', [0, 4_500, 0], [1_400, 2_000, 1_400]),
  box('switchyard_cover_north_west', [-14_000, 1_250, 11_000], [3_000, 1_250, 1_400]),
  box('switchyard_cover_north_east', [14_000, 1_250, 11_000], [3_000, 1_250, 1_400]),
  box('switchyard_cover_south_west', [-14_000, 1_250, -11_000], [3_000, 1_250, 1_400]),
  box('switchyard_cover_south_east', [14_000, 1_250, -11_000], [3_000, 1_250, 1_400]),
  box('switchyard_container_west', [-21_000, 1_500, 0], [2_000, 1_500, 4_000]),
  box('switchyard_container_east', [21_000, 1_500, 0], [2_000, 1_500, 4_000]),
  box('switchyard_signal_north', [0, 1_000, 15_500], [5_000, 1_000, 1_000]),
  box('switchyard_signal_south', [0, 1_000, -15_500], [5_000, 1_000, 1_000]),
] as const);

export const SWITCHYARD_AUTHORITY_SPAWNS = Object.freeze([
  spawn('switchyard_spawn_west_north', [-26_000, 0, 14_000], 90_000),
  spawn('switchyard_spawn_east_south', [26_000, 0, -14_000], 270_000),
  spawn('switchyard_spawn_west_south', [-26_000, 0, -14_000], 90_000),
  spawn('switchyard_spawn_east_north', [26_000, 0, 14_000], 270_000),
  spawn('switchyard_spawn_north_west', [-12_000, 0, 18_000], 180_000),
  spawn('switchyard_spawn_south_east', [12_000, 0, -18_000], 0),
  spawn('switchyard_spawn_south_west', [-12_000, 0, -18_000], 0),
  spawn('switchyard_spawn_north_east', [12_000, 0, 18_000], 180_000),
] as const);

export const SWITCHYARD_AUTHORITY_ZONES = Object.freeze([
  zone('switchyard_west_yard', 'West Yard', 'spawn', [-23_000, 1_500, 0], [7_000, 3_000, 21_000]),
  zone('switchyard_east_yard', 'East Yard', 'spawn', [23_000, 1_500, 0], [7_000, 3_000, 21_000]),
  zone('switchyard_freight_deck', 'Freight Deck', 'upper', [0, 3_000, 0], [7_000, 3_000, 4_500]),
  zone('switchyard_north_lane', 'Signal Lane', 'flank', [0, 1_500, 14_000], [16_000, 3_000, 8_000]),
  zone('switchyard_south_lane', 'Loading Lane', 'flank', [0, 1_500, -14_000], [16_000, 3_000, 8_000]),
] as const);

const CROWNPOINT_SOLIDS = Object.freeze([
  box('crownpoint_floor', [0, -250, 0], [25_000, 250, 25_000]),
  ...boundary('crownpoint', 25_000, 25_000),
  box('crownpoint_crown_deck', [0, 1_500, 0], [5_000, 1_500, 5_000]),
  ...stairRunToCrown('crownpoint_stair_west', 'x', -1),
  ...stairRunToCrown('crownpoint_stair_east', 'x', 1),
  ...stairRunToCrown('crownpoint_stair_south', 'z', -1),
  ...stairRunToCrown('crownpoint_stair_north', 'z', 1),
  box('crownpoint_solar_core', [0, 5_000, 0], [1_400, 2_000, 1_400]),
  box('crownpoint_cover_north_west', [-13_000, 1_200, 13_000], [2_000, 1_200, 2_000]),
  box('crownpoint_cover_north_east', [13_000, 1_200, 13_000], [2_000, 1_200, 2_000]),
  box('crownpoint_cover_south_west', [-13_000, 1_200, -13_000], [2_000, 1_200, 2_000]),
  box('crownpoint_cover_south_east', [13_000, 1_200, -13_000], [2_000, 1_200, 2_000]),
  box('crownpoint_screen_west', [-19_000, 1_000, 0], [900, 1_000, 5_000]),
  box('crownpoint_screen_east', [19_000, 1_000, 0], [900, 1_000, 5_000]),
  box('crownpoint_screen_north', [0, 1_000, 19_000], [5_000, 1_000, 900]),
  box('crownpoint_screen_south', [0, 1_000, -19_000], [5_000, 1_000, 900]),
] as const);

export const CROWNPOINT_AUTHORITY_SPAWNS = Object.freeze([
  spawn('crownpoint_spawn_west_north', [-21_000, 0, 11_000], 90_000),
  spawn('crownpoint_spawn_east_south', [21_000, 0, -11_000], 270_000),
  spawn('crownpoint_spawn_west_south', [-21_000, 0, -11_000], 90_000),
  spawn('crownpoint_spawn_east_north', [21_000, 0, 11_000], 270_000),
  spawn('crownpoint_spawn_north_west', [-11_000, 0, 21_000], 180_000),
  spawn('crownpoint_spawn_south_east', [11_000, 0, -21_000], 0),
  spawn('crownpoint_spawn_south_west', [-11_000, 0, -21_000], 0),
  spawn('crownpoint_spawn_north_east', [11_000, 0, 21_000], 180_000),
] as const);

export const CROWNPOINT_AUTHORITY_ZONES = Object.freeze([
  zone('crownpoint_west_quadrant', 'West Court', 'spawn', [-17_500, 1_500, 0], [7_500, 3_000, 24_000]),
  zone('crownpoint_east_quadrant', 'East Court', 'spawn', [17_500, 1_500, 0], [7_500, 3_000, 24_000]),
  zone('crownpoint_crown', 'Solar Crown', 'upper', [0, 3_500, 0], [5_000, 3_500, 5_000]),
  zone('crownpoint_north_arc', 'North Arc', 'flank', [0, 1_500, 17_500], [17_000, 3_000, 7_500]),
  zone('crownpoint_south_arc', 'South Arc', 'flank', [0, 1_500, -17_500], [17_000, 3_000, 7_500]),
] as const);

const DEFINITIONS: Readonly<Record<OriginalArenaAuthorityProfile, OriginalArenaDefinition>> =
  Object.freeze({
    [SWITCHYARD_AUTHORITY_PROFILE_ID]: Object.freeze({
      profileId: SWITCHYARD_AUTHORITY_PROFILE_ID,
      mapId: 'switchyard',
      displayName: 'Switchyard',
      presentationTheme: 'freight_night',
      solids: SWITCHYARD_SOLIDS,
      spawns: SWITCHYARD_AUTHORITY_SPAWNS,
      zones: SWITCHYARD_AUTHORITY_ZONES,
    }),
    [CROWNPOINT_AUTHORITY_PROFILE_ID]: Object.freeze({
      profileId: CROWNPOINT_AUTHORITY_PROFILE_ID,
      mapId: 'crownpoint',
      displayName: 'Crownpoint',
      presentationTheme: 'solar_crown',
      solids: CROWNPOINT_SOLIDS,
      spawns: CROWNPOINT_AUTHORITY_SPAWNS,
      zones: CROWNPOINT_AUTHORITY_ZONES,
    }),
  });

function fixtureFor(definition: OriginalArenaDefinition): PhysicsFixtureV1 {
  return loadPhysicsFixture({
    schemaVersion: 1,
    id: `${definition.mapId}_map_collision`,
    revision: 1,
    millimetersPerRapierUnit: 1_000,
    spawn: {
      feetPositionMm: definition.spawns[0]?.feetPosition ?? vector([0, 0, 0]),
      yawMilliDegrees: definition.spawns[0]?.yawMilliDegrees ?? 0,
    },
    solids: definition.solids,
    volumes: Object.freeze([
      Object.freeze({
        id: `${definition.mapId}_recovery_below_arena`,
        kind: 'recovery',
        layer: 'recovery_volume',
        centerMm: vector([0, -6_000, 0]),
        rotationMilliDegrees: vector([0, 0, 0]),
        shape: Object.freeze({ type: 'box', halfExtentsMm: vector([40_000, 2_000, 40_000]) }),
      }),
      Object.freeze({
        id: `${definition.mapId}_kill_below_recovery`,
        kind: 'kill',
        layer: 'kill_volume',
        centerMm: vector([0, -13_000, 0]),
        rotationMilliDegrees: vector([0, 0, 0]),
        shape: Object.freeze({ type: 'box', halfExtentsMm: vector([45_000, 5_000, 45_000]) }),
      }),
    ]),
  });
}

export const SWITCHYARD_AUTHORITY_FIXTURE = fixtureFor(
  DEFINITIONS[SWITCHYARD_AUTHORITY_PROFILE_ID],
);
export const CROWNPOINT_AUTHORITY_FIXTURE = fixtureFor(
  DEFINITIONS[CROWNPOINT_AUTHORITY_PROFILE_ID],
);

function digest(value: unknown): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(JSON.stringify(value))) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

function bindingFor(
  definition: OriginalArenaDefinition,
  fixture: PhysicsFixtureV1,
) {
  const fixtureHash = hashPhysicsFixture(fixture);
  const packageDigest = digest({
    mapId: definition.mapId,
    fixtureHash,
    spawns: definition.spawns,
    zones: definition.zones,
    presentationTheme: definition.presentationTheme,
  });
  return Object.freeze({
    mapReference: `${definition.mapId}@1`,
    presentationReference: `${definition.mapId}@1/${definition.presentationTheme}/v1`,
    mapId: definition.mapId,
    mapRevision: 1 as const,
    packageDigest,
    fixtureId: fixture.id,
    fixtureHash,
    xAxis: 'east' as const,
    yAxis: 'up' as const,
    zAxis: 'north' as const,
    origin: `${definition.mapId}_center`,
    gltfToMap: 'x_y_negative_z' as const,
    distanceUnit: 'millimeters' as const,
    angleUnit: 'milli_degrees' as const,
    colliderCardinality: fixture.solids.length,
    supportedModes: Object.freeze(['deathmatch', 'team_deathmatch'] as const),
    spawns: definition.spawns,
    zones: definition.zones,
    pickups: Object.freeze([]),
    displayName: definition.displayName,
    presentationTheme: definition.presentationTheme,
  });
}

export const SWITCHYARD_AUTHORITY_MAP_BINDING = bindingFor(
  DEFINITIONS[SWITCHYARD_AUTHORITY_PROFILE_ID],
  SWITCHYARD_AUTHORITY_FIXTURE,
);
export const CROWNPOINT_AUTHORITY_MAP_BINDING = bindingFor(
  DEFINITIONS[CROWNPOINT_AUTHORITY_PROFILE_ID],
  CROWNPOINT_AUTHORITY_FIXTURE,
);

export type OriginalArenaAuthorityMapBinding =
  | typeof SWITCHYARD_AUTHORITY_MAP_BINDING
  | typeof CROWNPOINT_AUTHORITY_MAP_BINDING;

export function isOriginalArenaAuthorityProfile(
  value: string | null,
): value is OriginalArenaAuthorityProfile {
  return value === SWITCHYARD_AUTHORITY_PROFILE_ID
    || value === CROWNPOINT_AUTHORITY_PROFILE_ID;
}

export function originalArenaAuthorityMapBinding(
  profile: OriginalArenaAuthorityProfile,
): OriginalArenaAuthorityMapBinding {
  return profile === SWITCHYARD_AUTHORITY_PROFILE_ID
    ? SWITCHYARD_AUTHORITY_MAP_BINDING
    : CROWNPOINT_AUTHORITY_MAP_BINDING;
}

export function originalArenaAuthorityFixture(
  profile: OriginalArenaAuthorityProfile,
): PhysicsFixtureV1 {
  return profile === SWITCHYARD_AUTHORITY_PROFILE_ID
    ? SWITCHYARD_AUTHORITY_FIXTURE
    : CROWNPOINT_AUTHORITY_FIXTURE;
}

export function originalArenaAuthoritySpawn(
  ordinal: number,
  profile: OriginalArenaAuthorityProfile,
): AuthoritySpawn {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new RangeError('Original arena spawn ordinal must be a non-negative safe integer');
  }
  const spawns = profile === SWITCHYARD_AUTHORITY_PROFILE_ID
    ? SWITCHYARD_AUTHORITY_SPAWNS
    : CROWNPOINT_AUTHORITY_SPAWNS;
  const selected = spawns[ordinal % spawns.length];
  if (selected === undefined) throw new Error('ORIGINAL_ARENA_SPAWN_MISSING');
  return selected;
}

export function createOriginalArenaAuthorityCombatOptions(
  world: RapierMovementWorld,
  profile: OriginalArenaAuthorityProfile,
): AuthorityRoomCombatOptions {
  const binding = originalArenaAuthorityMapBinding(profile);
  const ports = createRapierCombatWorldPorts(
    world,
    Object.freeze({
      mapId: binding.mapId,
      mapRevision: binding.mapRevision,
      packageDigest: binding.packageDigest,
      fixtureId: binding.fixtureId,
      fixtureHash: binding.fixtureHash,
      colliderCardinality: binding.colliderCardinality,
    }),
    `authoritative_${binding.mapId}_revision_1_rapier_combat_v1`,
    binding.mapId.toUpperCase(),
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
