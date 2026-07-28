import {
  G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID,
  G4_COMBAT_RULESET_HASH,
  G4_COMBAT_RULESET_ID,
  G4_COMBAT_RULESET_REVISION,
  G4_COMBAT_ROOM_PROFILE_ID,
  G4_HITSCAN_ROOM_CAPABILITY_ID,
  G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
  G4_TDM_MATCH_ROOM_CAPABILITY_ID,
  IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
  KYX_ARMORY_CATALOG_ID,
  KYX_WEAPON_ID,
  createInkfallSpawnAuthority,
  kyxWeaponProfile,
  type AuthorityFullSnapshot,
  type AuthorityRoomCombatOptions,
  type AuthorityRoomDamageResult,
  type AuthorityRoomTickResult,
  type AuthoritySpawn,
  type InkfallSpawnAuthority,
  type ImpulseGrenadeCollisionSafeImpulseRequestV1,
} from '../src/authority';
import {
  INKFALL_AUTHORITY_MAP_IDENTITY_V2,
  INKFALL_AUTHORITY_MAP_IDENTITY_V3,
  createInkfallRevision2RapierCombatWorldPorts,
  createInkfallRevision3RapierCombatWorldPorts,
} from '../src/authority';
import type { CombatSnapshotV1, SimulationIdentityV1 } from '../src/net';
import type {
  LoadedRuntimeMapPackage,
  PhysicsFixtureV1,
  RapierMovementWorld,
} from '../src/physics';
import inkfallCombatFixtureSnapshot from '../assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.p5-10.v1.json';
import inkfallRevision3CombatFixtureSnapshot from '../assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.g5-revision3.v1.json';
import inkfallRevision2MapPackage from '../assets/source/maps/inkfall-foundry/runtime/map.package.v2.json';
import inkfallRevision3MapPackage from '../assets/source/maps/inkfall-foundry/revisions/revision-3/runtime/map.package.v3.json';
import type { ReliableEventInput } from './reliableEvents';

export const P58D_REV3_COMBAT_PROFILE = 'p58d-rev3-combat-v1' as const;
export const P511_INKFALL_REV2_COMBAT_PROFILE =
  'p511-inkfall-foundry-revision-2-combat-v1' as const;
export const G5_INKFALL_REV4_COMBAT_PROFILE =
  'g5-inkfall-foundry-rev4-revision-3-authority-v1' as const;
export const P58D_COMBAT_PROFILE_HEADER = 'x-kyx-evidence-profile' as const;
export const INTERNAL_ROOM_PROFILE_HEADER = 'x-kyx-room-profile' as const;
export const DEFAULT_FLAT_RUN_ROOM_PROFILE_STORAGE_ID =
  'phase4-flat-run-default-v1' as const;

export type OptInWorkerRoomProfile =
  | typeof P58D_REV3_COMBAT_PROFILE
  | typeof P511_INKFALL_REV2_COMBAT_PROFILE
  | typeof G5_INKFALL_REV4_COMBAT_PROFILE;

export type WorkerRoomProfile = OptInWorkerRoomProfile | null;

export const INKFALL_REVISION_2_PRESENTATION_COORDINATES = Object.freeze({
  mapReference: 'inkfall_foundry@2',
  mapId: INKFALL_AUTHORITY_MAP_IDENTITY_V2.mapId,
  mapRevision: INKFALL_AUTHORITY_MAP_IDENTITY_V2.mapRevision,
  packageDigest: INKFALL_AUTHORITY_MAP_IDENTITY_V2.packageDigest,
  fixtureId: 'inkfall_foundry_map_collision',
  fixtureHash: INKFALL_AUTHORITY_MAP_IDENTITY_V2.fixtureHash,
  xAxis: 'east',
  yAxis: 'up',
  zAxis: 'north',
  origin: 'press_core_floor_contact',
  gltfToMap: 'x_y_negative_z',
  distanceUnit: 'millimeters',
  angleUnit: 'milli_degrees',
} as const);

const INKFALL_REVISION_2_LOCKED_SPAWNS = Object.freeze([
  Object.freeze({
    spawnId: 'spawn_w_press_a',
    set: 'west_team',
    feetPosition: Object.freeze({ x: -33_500, y: 0, z: -3_500 }),
    yawMilliDegrees: 0,
  }),
  Object.freeze({
    spawnId: 'spawn_e_press_a',
    set: 'east_team',
    feetPosition: Object.freeze({ x: 33_500, y: 0, z: 3_500 }),
    yawMilliDegrees: 180_000,
  }),
  Object.freeze({
    spawnId: 'spawn_w_press_b',
    set: 'west_team',
    feetPosition: Object.freeze({ x: -33_500, y: 0, z: 3_500 }),
    yawMilliDegrees: 0,
  }),
  Object.freeze({
    spawnId: 'spawn_e_press_b',
    set: 'east_team',
    feetPosition: Object.freeze({ x: 33_500, y: 0, z: -3_500 }),
    yawMilliDegrees: 180_000,
  }),
  Object.freeze({
    spawnId: 'spawn_w_ink',
    set: 'west_team',
    feetPosition: Object.freeze({ x: -30_500, y: 0, z: -7_000 }),
    yawMilliDegrees: -25_000,
  }),
  Object.freeze({
    spawnId: 'spawn_e_ink',
    set: 'east_team',
    feetPosition: Object.freeze({ x: 30_500, y: 0, z: -7_000 }),
    yawMilliDegrees: -155_000,
  }),
  Object.freeze({
    spawnId: 'spawn_w_archive',
    set: 'west_team',
    feetPosition: Object.freeze({ x: -30_500, y: 0, z: 7_000 }),
    yawMilliDegrees: 25_000,
  }),
  Object.freeze({
    spawnId: 'spawn_e_archive',
    set: 'east_team',
    feetPosition: Object.freeze({ x: 30_500, y: 0, z: 7_000 }),
    yawMilliDegrees: 155_000,
  }),
] as const);

export const INKFALL_REVISION_2_WORKER_MAP_BINDING = Object.freeze({
  ...INKFALL_REVISION_2_PRESENTATION_COORDINATES,
  colliderCardinality: INKFALL_AUTHORITY_MAP_IDENTITY_V2.colliderCardinality,
  spawns: INKFALL_REVISION_2_LOCKED_SPAWNS,
} as const);

export const INKFALL_REVISION_3_PRESENTATION_COORDINATES = Object.freeze({
  mapReference: 'inkfall_foundry@3',
  presentationReference:
    'inkfall_foundry@3/press_archive/v4.1/spatial-material-joined',
  mapId: INKFALL_AUTHORITY_MAP_IDENTITY_V3.mapId,
  mapRevision: INKFALL_AUTHORITY_MAP_IDENTITY_V3.mapRevision,
  packageDigest: INKFALL_AUTHORITY_MAP_IDENTITY_V3.packageDigest,
  fixtureId: 'inkfall_foundry_map_collision',
  fixtureHash: INKFALL_AUTHORITY_MAP_IDENTITY_V3.fixtureHash,
  xAxis: 'east',
  yAxis: 'up',
  zAxis: 'north',
  origin: 'press_core_floor_contact',
  gltfToMap: 'x_y_negative_z',
  distanceUnit: 'millimeters',
  angleUnit: 'milli_degrees',
} as const);

const INKFALL_REVISION_3_LOCKED_SPAWNS = Object.freeze([
  Object.freeze({
    spawnId: 'spawn_w_press_a',
    set: 'west_team',
    feetPosition: Object.freeze({ x: -33_500, y: 0, z: -3_500 }),
    yawMilliDegrees: 0,
    escapeRouteFamilies: Object.freeze(['press_hall', 'ink_channel', 'archive_walk']),
    validationStatus: 'capsule_clear_unscored',
  }),
  Object.freeze({
    spawnId: 'spawn_e_press_a',
    set: 'east_team',
    feetPosition: Object.freeze({ x: 33_500, y: 0, z: 3_500 }),
    yawMilliDegrees: 180_000,
    escapeRouteFamilies: Object.freeze(['press_hall', 'ink_channel', 'archive_walk']),
    validationStatus: 'capsule_clear_unscored',
  }),
  Object.freeze({
    spawnId: 'spawn_w_press_b',
    set: 'west_team',
    feetPosition: Object.freeze({ x: -33_500, y: 0, z: 3_500 }),
    yawMilliDegrees: 0,
    escapeRouteFamilies: Object.freeze(['press_hall', 'ink_channel', 'archive_walk']),
    validationStatus: 'capsule_clear_unscored',
  }),
  Object.freeze({
    spawnId: 'spawn_e_press_b',
    set: 'east_team',
    feetPosition: Object.freeze({ x: 33_500, y: 0, z: -3_500 }),
    yawMilliDegrees: 180_000,
    escapeRouteFamilies: Object.freeze(['press_hall', 'ink_channel', 'archive_walk']),
    validationStatus: 'capsule_clear_unscored',
  }),
  Object.freeze({
    spawnId: 'spawn_w_ink',
    set: 'west_team',
    feetPosition: Object.freeze({ x: -30_500, y: 0, z: -7_000 }),
    yawMilliDegrees: -25_000,
    escapeRouteFamilies: Object.freeze(['ink_channel', 'press_hall']),
    validationStatus: 'capsule_clear_unscored',
  }),
  Object.freeze({
    spawnId: 'spawn_e_ink',
    set: 'east_team',
    feetPosition: Object.freeze({ x: 30_500, y: 0, z: -7_000 }),
    yawMilliDegrees: -155_000,
    escapeRouteFamilies: Object.freeze(['ink_channel', 'press_hall']),
    validationStatus: 'capsule_clear_unscored',
  }),
  Object.freeze({
    spawnId: 'spawn_w_archive',
    set: 'west_team',
    feetPosition: Object.freeze({ x: -30_500, y: 0, z: 7_000 }),
    yawMilliDegrees: 25_000,
    escapeRouteFamilies: Object.freeze(['archive_walk', 'press_hall']),
    validationStatus: 'capsule_clear_unscored',
  }),
  Object.freeze({
    spawnId: 'spawn_e_archive',
    set: 'east_team',
    feetPosition: Object.freeze({ x: 30_500, y: 0, z: 7_000 }),
    yawMilliDegrees: 155_000,
    escapeRouteFamilies: Object.freeze(['archive_walk', 'press_hall']),
    validationStatus: 'capsule_clear_unscored',
  }),
  Object.freeze({
    spawnId: 'spawn_dm_ink_w',
    set: 'deathmatch_candidate',
    feetPosition: Object.freeze({ x: -27_000, y: -3_000, z: -22_000 }),
    yawMilliDegrees: 45_000,
    escapeRouteFamilies: Object.freeze(['ink_channel', 'crosslink']),
    validationStatus: 'capsule_clear_unscored',
  }),
  Object.freeze({
    spawnId: 'spawn_dm_ink_e',
    set: 'deathmatch_candidate',
    feetPosition: Object.freeze({ x: 27_000, y: -3_000, z: -21_000 }),
    yawMilliDegrees: 135_000,
    escapeRouteFamilies: Object.freeze(['ink_channel', 'crosslink']),
    validationStatus: 'capsule_clear_unscored',
  }),
  Object.freeze({
    spawnId: 'spawn_dm_archive_w',
    set: 'deathmatch_candidate',
    feetPosition: Object.freeze({ x: -27_000, y: 6_000, z: 22_000 }),
    yawMilliDegrees: -45_000,
    escapeRouteFamilies: Object.freeze(['archive_walk', 'crosslink']),
    validationStatus: 'capsule_clear_unscored',
  }),
  Object.freeze({
    spawnId: 'spawn_dm_archive_e',
    set: 'deathmatch_candidate',
    feetPosition: Object.freeze({ x: 27_000, y: 6_000, z: 21_000 }),
    yawMilliDegrees: -135_000,
    escapeRouteFamilies: Object.freeze(['archive_walk', 'crosslink']),
    validationStatus: 'capsule_clear_unscored',
  }),
] as const);

const INKFALL_REVISION_3_ZONES = Object.freeze(
  inkfallRevision3MapPackage.zones.map((zone) => Object.freeze({
    zoneId: zone.id,
    callout: zone.callout,
    family: zone.family,
    center: Object.freeze({ ...zone.centerMm }),
    halfExtents: Object.freeze({ ...zone.halfExtentsMm }),
  })),
);

export const INKFALL_REVISION_3_WORKER_MAP_BINDING = Object.freeze({
  ...INKFALL_REVISION_3_PRESENTATION_COORDINATES,
  colliderCardinality: INKFALL_AUTHORITY_MAP_IDENTITY_V3.colliderCardinality,
  render: Object.freeze({
    role: 'render_only',
    path:
      'art-kit/press-archive-rev4/rev4/export/inkfall_foundry_press_archive_rev4.spatial-material-joined.glb',
    sha256: '5e2aa22cc598f49181524ce78b481adf091f71a91a823171277963de11d4db00',
    bytes: 12_954_608,
    renderMeshesMayBeAuthority: false,
  }),
  collision: Object.freeze({
    role: 'authority_collision',
    path: 'revisions/revision-3/export/collision.authority.glb',
    sha256: '1cce637ab4f83766627527b3885c3e9da819d8bcabdfa2144f8dc6b46bc5bba8',
    bytes: 605_112,
  }),
  supportedModes: Object.freeze(['deathmatch', 'team_deathmatch']),
  spawns: INKFALL_REVISION_3_LOCKED_SPAWNS,
  zones: INKFALL_REVISION_3_ZONES,
  pickups: Object.freeze([]),
  triggers: Object.freeze(inkfallRevision3MapPackage.triggers.map((trigger) => Object.freeze({
    ...trigger,
    centerMm: Object.freeze({ ...trigger.centerMm }),
    halfExtentsMm: Object.freeze({ ...trigger.halfExtentsMm }),
    destinationFeetMm: Object.freeze({ ...trigger.destinationFeetMm }),
  }))),
  telemetry: Object.freeze({
    schemaVersion: 1,
    authoritySource: 'durable_object_room_metrics_v1',
    counters: Object.freeze([
      'connectedPlayers',
      'receivedCommands',
      'rejectedCommands',
      'resumeSuccesses',
      'authorityTickExecution',
      'transport',
    ]),
    zoneCount: 9,
    pickupCount: 0,
  }),
} as const);

export type InkfallWorkerRoomProfile =
  | typeof P511_INKFALL_REV2_COMBAT_PROFILE
  | typeof G5_INKFALL_REV4_COMBAT_PROFILE;

export function isInkfallWorkerRoomProfile(
  value: WorkerRoomProfile,
): value is InkfallWorkerRoomProfile {
  return value === P511_INKFALL_REV2_COMBAT_PROFILE
    || value === G5_INKFALL_REV4_COMBAT_PROFILE;
}

export function inkfallWorkerMapBinding(profile: InkfallWorkerRoomProfile) {
  return profile === G5_INKFALL_REV4_COMBAT_PROFILE
    ? INKFALL_REVISION_3_WORKER_MAP_BINDING
    : INKFALL_REVISION_2_WORKER_MAP_BINDING;
}

export function isP58DCombatProfile(value: string | null): boolean {
  return value === P58D_REV3_COMBAT_PROFILE;
}

export function isOptInWorkerRoomProfile(
  value: string | null,
): value is OptInWorkerRoomProfile {
  return value === P58D_REV3_COMBAT_PROFILE
    || value === P511_INKFALL_REV2_COMBAT_PROFILE
    || value === G5_INKFALL_REV4_COMBAT_PROFILE;
}

export function workerRoomProfileStorageId(profile: WorkerRoomProfile): string {
  return profile ?? DEFAULT_FLAT_RUN_ROOM_PROFILE_STORAGE_ID;
}

export function workerRoomProfileFromStorageId(value: string): WorkerRoomProfile | undefined {
  if (value === DEFAULT_FLAT_RUN_ROOM_PROFILE_STORAGE_ID) return null;
  if (isOptInWorkerRoomProfile(value)) return value;
  return undefined;
}

export function inferWorkerRoomProfileFromIdentity(
  identity: Partial<SimulationIdentityV1>,
): WorkerRoomProfile | undefined {
  const revision3Combat = identity.rulesetId === G4_COMBAT_RULESET_ID
    && identity.rulesetRevision === G4_COMBAT_RULESET_REVISION
    && identity.rulesetHash === G4_COMBAT_RULESET_HASH;
  if (
    revision3Combat
    && identity.mapId === INKFALL_AUTHORITY_MAP_IDENTITY_V3.mapId
    && identity.fixtureId === INKFALL_REVISION_3_PRESENTATION_COORDINATES.fixtureId
    && identity.fixtureHash === INKFALL_AUTHORITY_MAP_IDENTITY_V3.fixtureHash
  ) return G5_INKFALL_REV4_COMBAT_PROFILE;
  if (
    revision3Combat
    && identity.mapId === INKFALL_AUTHORITY_MAP_IDENTITY_V2.mapId
    && identity.fixtureId === INKFALL_REVISION_2_PRESENTATION_COORDINATES.fixtureId
    && identity.fixtureHash === INKFALL_AUTHORITY_MAP_IDENTITY_V2.fixtureHash
  ) return P511_INKFALL_REV2_COMBAT_PROFILE;
  if (revision3Combat && identity.mapId === 'phase4_flat_run') {
    return P58D_REV3_COMBAT_PROFILE;
  }
  if (
    !revision3Combat
    && identity.mapId === 'phase4_flat_run'
    && identity.rulesetRevision === 2
  ) return null;
  return undefined;
}

function fnv1a64(source: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

/** Preserve already-safe IDs and deterministically project longer authority IDs. */
export function combatWireId(authorityId: string): string {
  if (
    new TextEncoder().encode(authorityId).byteLength <= 64
    && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(authorityId)
  ) return authorityId;
  return `combat.${fnv1a64(authorityId)}`;
}

/**
 * The explicit P5.8D room uses deterministic clear evidence ports. Movement
 * remains on the real Worker Rapier adapter; combat collision semantics remain
 * server-owned and deterministic without pretending this fixture is a map pass.
 */
export function createWorkerCombatOptions(): AuthorityRoomCombatOptions {
  return Object.freeze({
    profileId: G4_COMBAT_ROOM_PROFILE_ID,
    teamResolver: (_playerId: string, ordinal: number) => (
      ordinal % 2 === 0 ? 'team_blue' : 'team_red'
    ),
    hitscan: Object.freeze({
      capabilityId: G4_HITSCAN_ROOM_CAPABILITY_ID,
      worldOcclusion: () => Object.freeze({
        schemaVersion: 1,
        hit: false,
        distanceMillimeters: null,
        colliderId: null,
      }),
    }),
    impulseGrenade: Object.freeze({
      capabilityId: G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
      world: Object.freeze({
        schemaVersion: IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
        sweepSphere: () => Object.freeze({ schemaVersion: 1, contacts: Object.freeze([]) }),
        traceRadialOcclusion: () => Object.freeze({ schemaVersion: 1, kind: 'clear' }),
        resolveCollisionSafeImpulse: (request: ImpulseGrenadeCollisionSafeImpulseRequestV1) => Object.freeze({
          schemaVersion: 1,
          appliedImpulseMillimetersPerSecond:
            request.requestedImpulseMillimetersPerSecond,
        }),
      }),
    }),
    abilityResources: Object.freeze({
      capabilityId: G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID,
    }),
    match: Object.freeze({ capabilityId: G4_TDM_MATCH_ROOM_CAPABILITY_ID }),
  });
}

function assertInkfallRevision2RuntimeArtifacts(): void {
  const snapshot = inkfallCombatFixtureSnapshot as unknown as Readonly<{
    schemaVersion: number;
    kind: string;
    mapId: string;
    mapRevision: number;
    packageDigest: string;
    fixtureHash: string;
    collisionMeshNodeCount: number;
    authorityVolumeCount: number;
    fixture: PhysicsFixtureV1;
  }>;
  const mapPackage = inkfallRevision2MapPackage as unknown as Readonly<{
    id: string;
    revision: number;
    identity: Readonly<{ digest: string }>;
    units: Readonly<{ distance: string; angle: string }>;
    coordinateSystem: Readonly<{
      xAxis: string;
      yAxis: string;
      zAxis: string;
      origin: string;
      gltfToMap: string;
    }>;
    spawns: readonly Readonly<{
      id: string;
      set: string;
      feetPositionMm: Readonly<{ x: number; y: number; z: number }>;
      yawMilliDegrees: number;
    }>[];
  }>;
  const coordinates = INKFALL_REVISION_2_PRESENTATION_COORDINATES;
  const snapshotMatches = snapshot.schemaVersion === 1
    && snapshot.kind === 'inkfall_revision_2_combat_authority_fixture'
    && snapshot.mapId === coordinates.mapId
    && snapshot.mapRevision === coordinates.mapRevision
    && snapshot.packageDigest === coordinates.packageDigest
    && snapshot.fixtureHash === coordinates.fixtureHash
    && snapshot.collisionMeshNodeCount === INKFALL_AUTHORITY_MAP_IDENTITY_V2.colliderCardinality
    && snapshot.authorityVolumeCount === 2
    && snapshot.fixture.id === coordinates.fixtureId
    && snapshot.fixture.revision === coordinates.mapRevision;
  const coordinateSystemMatches = mapPackage.id === coordinates.mapId
    && mapPackage.revision === coordinates.mapRevision
    && mapPackage.identity.digest === coordinates.packageDigest
    && mapPackage.units.distance === coordinates.distanceUnit
    && mapPackage.units.angle === coordinates.angleUnit
    && mapPackage.coordinateSystem.xAxis === coordinates.xAxis
    && mapPackage.coordinateSystem.yAxis === coordinates.yAxis
    && mapPackage.coordinateSystem.zAxis === coordinates.zAxis
    && mapPackage.coordinateSystem.origin === coordinates.origin
    && mapPackage.coordinateSystem.gltfToMap === coordinates.gltfToMap;
  const spawnsById = new Map(mapPackage.spawns.map((spawn) => [spawn.id, spawn]));
  const lockedSpawnsMatch = INKFALL_REVISION_2_LOCKED_SPAWNS.every((locked) => {
    const source = spawnsById.get(locked.spawnId);
    return source !== undefined
      && source.set === locked.set
      && source.feetPositionMm.x === locked.feetPosition.x
      && source.feetPositionMm.y === locked.feetPosition.y
      && source.feetPositionMm.z === locked.feetPosition.z
      && source.yawMilliDegrees === locked.yawMilliDegrees;
  });
  if (!snapshotMatches || !coordinateSystemMatches || !lockedSpawnsMatch) {
    throw new Error('INKFALL_REVISION_2_WORKER_PROFILE_ARTIFACT_MISMATCH');
  }
}

function assertInkfallRevision3RuntimeArtifacts(): void {
  const snapshot = inkfallRevision3CombatFixtureSnapshot as unknown as Readonly<{
    schemaVersion: number;
    kind: string;
    mapId: string;
    mapRevision: number;
    packageDigest: string;
    collisionSha256: string;
    fixtureHash: string;
    collisionMeshNodeCount: number;
    authorityVolumeCount: number;
    fixture: PhysicsFixtureV1;
  }>;
  const mapPackage = inkfallRevision3MapPackage;
  const coordinates = INKFALL_REVISION_3_PRESENTATION_COORDINATES;
  const spawnsById = new Map(mapPackage.spawns.map((spawn) => [spawn.id, spawn]));
  const lockedSpawnsMatch = INKFALL_REVISION_3_LOCKED_SPAWNS.every((locked) => {
    const source = spawnsById.get(locked.spawnId);
    return source !== undefined
      && source.set === locked.set
      && source.feetPositionMm.x === locked.feetPosition.x
      && source.feetPositionMm.y === locked.feetPosition.y
      && source.feetPositionMm.z === locked.feetPosition.z
      && source.yawMilliDegrees === locked.yawMilliDegrees
      && source.validationStatus === locked.validationStatus
      && JSON.stringify(source.escapeRouteFamilies)
        === JSON.stringify(locked.escapeRouteFamilies);
  });
  const runtimeSpawnsUnique = new Set(
    INKFALL_REVISION_3_LOCKED_SPAWNS.slice(0, 8).map(({ feetPosition }) => (
      `${feetPosition.x}:${feetPosition.y}:${feetPosition.z}`
    )),
  ).size === 8;
  const snapshotMatches = snapshot.schemaVersion === 1
    && snapshot.kind === 'inkfall_revision_3_combat_authority_fixture'
    && snapshot.mapId === coordinates.mapId
    && snapshot.mapRevision === coordinates.mapRevision
    && snapshot.packageDigest === coordinates.packageDigest
    && snapshot.fixtureHash === coordinates.fixtureHash
    && snapshot.collisionSha256 === INKFALL_REVISION_3_WORKER_MAP_BINDING.collision.sha256
    && snapshot.collisionMeshNodeCount === INKFALL_AUTHORITY_MAP_IDENTITY_V3.colliderCardinality
    && snapshot.authorityVolumeCount === 2
    && snapshot.fixture.id === coordinates.fixtureId
    && snapshot.fixture.revision === coordinates.mapRevision
    && snapshot.fixture.solids.length === INKFALL_AUTHORITY_MAP_IDENTITY_V3.colliderCardinality;
  const packageMatches = mapPackage.id === coordinates.mapId
    && mapPackage.revision === coordinates.mapRevision
    && mapPackage.identity.digest === coordinates.packageDigest
    && mapPackage.units.distance === coordinates.distanceUnit
    && mapPackage.units.angle === coordinates.angleUnit
    && mapPackage.coordinateSystem.xAxis === coordinates.xAxis
    && mapPackage.coordinateSystem.yAxis === coordinates.yAxis
    && mapPackage.coordinateSystem.zAxis === coordinates.zAxis
    && mapPackage.coordinateSystem.origin === coordinates.origin
    && mapPackage.coordinateSystem.gltfToMap === coordinates.gltfToMap
    && mapPackage.artifacts.render.role === 'render_only'
    && mapPackage.artifacts.collision.role === 'authority_collision'
    && mapPackage.authority.renderMeshesMayBeAuthority === false
    && mapPackage.zones.length === 9
    && mapPackage.spawns.length === 12
    && mapPackage.pickups.length === 0;
  if (!snapshotMatches || !packageMatches || !lockedSpawnsMatch || !runtimeSpawnsUnique) {
    throw new Error('INKFALL_REVISION_3_WORKER_PROFILE_ARTIFACT_MISMATCH');
  }
}

export function inkfallRevision2WorkerFixture(): PhysicsFixtureV1 {
  assertInkfallRevision2RuntimeArtifacts();
  return (inkfallCombatFixtureSnapshot as unknown as Readonly<{
    fixture: PhysicsFixtureV1;
  }>).fixture;
}

export function inkfallRevision3WorkerFixture(): PhysicsFixtureV1 {
  assertInkfallRevision3RuntimeArtifacts();
  return (inkfallRevision3CombatFixtureSnapshot as unknown as Readonly<{
    fixture: PhysicsFixtureV1;
  }>).fixture;
}

let inkfallRevision3SpawnAuthority: InkfallSpawnAuthority | null = null;

export function inkfallRevision3WorkerSpawnAuthority(): InkfallSpawnAuthority {
  if (inkfallRevision3SpawnAuthority !== null) {
    return inkfallRevision3SpawnAuthority;
  }
  assertInkfallRevision3RuntimeArtifacts();
  const manifest = inkfallRevision3MapPackage as unknown as
    LoadedRuntimeMapPackage['manifest'];
  const artifact = inkfallRevision3CombatFixtureSnapshot as unknown as Readonly<{
    collisionPath: string;
    collisionSha256: string;
    collisionMeshNodeCount: number;
    authorityVolumeCount: number;
    fixtureHash: string;
    fixture: PhysicsFixtureV1;
  }>;
  const loaded = Object.freeze({
    schemaVersion: 1,
    manifest,
    identity: Object.freeze({
      id: manifest.id,
      revision: manifest.revision,
      displayName: manifest.displayName,
      packageDigest: manifest.identity.digest,
      boundsMm: manifest.boundsMm,
    }),
    presentation: Object.freeze({
      renderPath: manifest.artifacts.render.path,
      renderSha256: manifest.artifacts.render.sha256,
      renderMeshNodeCount: manifest.artifacts.render.expectedMeshNodeCount,
    }),
    authority: Object.freeze({
      collisionPath: artifact.collisionPath,
      collisionSha256: artifact.collisionSha256,
      collisionMeshNodeCount: artifact.collisionMeshNodeCount,
      authorityVolumeCount: artifact.authorityVolumeCount,
      totalColliderCount: artifact.fixture.solids.length,
      sourceKindCounts: Object.freeze({
        authority_collision: artifact.fixture.solids.length,
      }),
      fixture: artifact.fixture,
      fixtureHash: artifact.fixtureHash,
    }),
  }) satisfies LoadedRuntimeMapPackage;
  inkfallRevision3SpawnAuthority = createInkfallSpawnAuthority(loaded);
  return inkfallRevision3SpawnAuthority;
}

export function inkfallWorkerFixture(
  profile: InkfallWorkerRoomProfile,
): PhysicsFixtureV1 {
  return profile === G5_INKFALL_REV4_COMBAT_PROFILE
    ? inkfallRevision3WorkerFixture()
    : inkfallRevision2WorkerFixture();
}

export function createInkfallWorkerCombatOptions(
  world: RapierMovementWorld,
  profile: InkfallWorkerRoomProfile = P511_INKFALL_REV2_COMBAT_PROFILE,
): AuthorityRoomCombatOptions {
  const ports = profile === G5_INKFALL_REV4_COMBAT_PROFILE
    ? (assertInkfallRevision3RuntimeArtifacts(), createInkfallRevision3RapierCombatWorldPorts(world))
    : (assertInkfallRevision2RuntimeArtifacts(), createInkfallRevision2RapierCombatWorldPorts(world));
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

export function inkfallWorkerCombatSpawn(
  ordinal: number,
  profile: InkfallWorkerRoomProfile = P511_INKFALL_REV2_COMBAT_PROFILE,
): AuthoritySpawn {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new RangeError('Inkfall spawn ordinal must be a non-negative safe integer');
  }
  const lockedSpawns = profile === G5_INKFALL_REV4_COMBAT_PROFILE
    ? INKFALL_REVISION_3_LOCKED_SPAWNS.slice(0, 8)
    : INKFALL_REVISION_2_LOCKED_SPAWNS;
  const spawn = lockedSpawns[ordinal % lockedSpawns.length];
  if (spawn === undefined) throw new Error('INKFALL_WORKER_SPAWN_MISSING');
  return Object.freeze({
    spawnId: spawn.spawnId,
    feetPosition: spawn.feetPosition,
    yawMilliDegrees: spawn.yawMilliDegrees,
  });
}

export function workerCombatSpawn(ordinal: number): AuthoritySpawn {
  if (ordinal === 0) {
    return Object.freeze({
      spawnId: 'p58d_spawn_blue',
      feetPosition: Object.freeze({ x: 0, y: 0, z: 0 }),
      yawMilliDegrees: 0,
    });
  }
  if (ordinal === 1) {
    return Object.freeze({
      spawnId: 'p58d_spawn_red',
      feetPosition: Object.freeze({ x: 0, y: 0, z: 3_000 }),
      yawMilliDegrees: 180_000,
    });
  }
  const lane = ordinal % 4;
  return Object.freeze({
    spawnId: `p58d_spawn_${ordinal}`,
    feetPosition: Object.freeze({
      x: (lane - 1) * 1_500,
      y: 0,
      z: ordinal < 4 ? -4_000 : 4_000,
    }),
    yawMilliDegrees: ordinal % 2 === 0 ? 0 : 180_000,
  });
}

export function combatSnapshotFromAuthority(
  snapshot: AuthorityFullSnapshot,
): CombatSnapshotV1 | null {
  const combatPlayers = snapshot.players.filter((player) => player.combat !== undefined);
  if (combatPlayers.length === 0) return null;
  if (combatPlayers.length !== snapshot.players.length || snapshot.match === undefined) {
    throw new Error('AUTHORITY_COMBAT_SNAPSHOT_INCOMPLETE');
  }
  const projectiles = snapshot.impulseGrenadeProjectiles ?? [];
  const weaponProjectiles = snapshot.weaponProjectiles ?? [];
  return Object.freeze({
    schemaVersion: 1,
    players: Object.freeze(combatPlayers.map((player) => {
      const combat = player.combat;
      if (
        combat === undefined
        || combat.impulseGrenade === undefined
        || combat.armory === undefined
      ) {
        throw new Error('AUTHORITY_COMBAT_PLAYER_SNAPSHOT_INCOMPLETE');
      }
      return Object.freeze({
        playerId: player.playerId,
        connected: player.connected,
        teamId: combat.life.teamId,
        lifePhase: combat.life.phase,
        healthPoints: combat.life.healthPoints,
        shieldPoints: combat.life.shieldPoints,
        deathOrdinal: combat.life.deathOrdinal,
        respawnEligibleAtTick: combat.life.respawnEligibleAtTick,
        riflePhase: combat.autoRifle.phase,
        magazineRounds: combat.autoRifle.magazineRounds,
        reserveRounds: combat.autoRifle.reserveRounds,
        nextShotAtTick: combat.autoRifle.nextShotAtTick,
        reloadCompletesAtTick: combat.autoRifle.activeReload?.completesAtTick ?? null,
        acceptedShotCount: combat.autoRifle.acceptedShotCount,
        weaponCatalogId: KYX_ARMORY_CATALOG_ID,
        selectedWeaponSlot: combat.armory.selectedSlot,
        selectedWeaponId: combat.armory.weapons.find(
          (weapon) => kyxWeaponProfile(weapon.weaponId).slot === combat.armory.selectedSlot,
        )?.weaponId ?? null,
        weapons: Object.freeze(combat.armory.weapons.map((weapon) => {
          const profile = kyxWeaponProfile(weapon.weaponId);
          return Object.freeze({
            weaponId: weapon.weaponId,
            slot: profile.slot,
            family: profile.family,
            attackModel: profile.attackModel,
            phase: weapon.phase,
            magazineRounds: weapon.magazineRounds,
            reserveRounds: weapon.reserveRounds,
            readyAtTick: weapon.readyAtTick,
            reloadCompletesAtTick: weapon.reloadCompletesAtTick,
            nextAttackAtTick: weapon.nextAttackAtTick,
            acceptedAttackCount: weapon.acceptedAttackCount,
          });
        })),
        grenadePhase: combat.impulseGrenade.phase,
        grenadeCooldownEndsAtTick: combat.impulseGrenade.cooldownEndsAtTick,
        acceptedThrowCount: combat.impulseGrenade.acceptedThrowCount,
        activeProjectileCount: projectiles.filter((projectile) => (
          projectile.phase === 'active' && projectile.ownerPlayerId === player.playerId
        )).length,
      });
    })),
    projectiles: Object.freeze(projectiles.map((projectile) => Object.freeze({
      projectileId: combatWireId(projectile.projectileId),
      ownerPlayerId: projectile.ownerPlayerId,
      ownerTeamId: projectile.ownerTeamId,
      phase: projectile.phase,
      spawnTick: projectile.spawnTick,
      lifetimeEndsAtTick: projectile.lifetimeEndsAtTick,
      fuseStartedAtTick: projectile.fuseStartedAtTick,
      detonatesAtTick: projectile.detonatesAtTick,
      xMillimeters: projectile.positionMillimeters.x,
      yMillimeters: projectile.positionMillimeters.y,
      zMillimeters: projectile.positionMillimeters.z,
      velocityXMillimetersPerSecond: projectile.velocityMillimetersPerSecond.x,
      velocityYMillimetersPerSecond: projectile.velocityMillimetersPerSecond.y,
      velocityZMillimetersPerSecond: projectile.velocityMillimetersPerSecond.z,
      bounceCount: projectile.bounceCount,
      settled: projectile.settled,
    }))),
    ...(weaponProjectiles.length === 0
      ? {}
      : {
          weaponProjectiles: Object.freeze(weaponProjectiles.map((projectile) => Object.freeze({
            projectileId: combatWireId(projectile.projectileId),
            ownerPlayerId: projectile.ownerPlayerId,
            ownerTeamId: projectile.ownerTeamId,
            weaponId: projectile.weaponId,
            phase: projectile.phase,
            spawnTick: projectile.spawnTick,
            expiresAtTick: projectile.expiresAtTick,
            xMillimeters: projectile.positionMillimeters.x,
            yMillimeters: projectile.positionMillimeters.y,
            zMillimeters: projectile.positionMillimeters.z,
            velocityXMillimetersPerSecond: projectile.velocityMillimetersPerSecond.x,
            velocityYMillimetersPerSecond: projectile.velocityMillimetersPerSecond.y,
            velocityZMillimetersPerSecond: projectile.velocityMillimetersPerSecond.z,
            radiusMillimeters: projectile.radiusMillimeters,
            splashRadiusMillimeters: projectile.splashRadiusMillimeters,
          }))),
        }),
    match: Object.freeze({
      phase: snapshot.match.phase,
      phaseEndsAtTick: snapshot.match.phaseEndsAtTick,
      activeTicksRemaining: snapshot.match.activeTicksRemaining,
      teamScores: Object.freeze(snapshot.match.teamScores.map(({ teamId, score }) => (
        Object.freeze({ teamId, score })
      ))),
      feedSequence: snapshot.match.feedSequence,
      result: snapshot.match.result === null
        ? null
        : Object.freeze({
            reason: snapshot.match.result.reason,
            winningTeamId: snapshot.match.result.winningTeamId,
            draw: snapshot.match.result.draw,
          }),
    }),
  });
}

export function reliableCombatEvents(
  tick: AuthorityRoomTickResult,
): readonly ReliableEventInput[] {
  const events: ReliableEventInput[] = [];
  const appendDamage = (damage: AuthorityRoomDamageResult | null): void => {
    if (damage === null || !damage.accepted) return;
    events.push(Object.freeze({
      serverTick: damage.damage.authorityTick,
      kind: 'damageApplied',
      subjectId: combatWireId(damage.damage.eventId),
      actorId: damage.damage.sourcePlayerId,
      targetId: damage.damage.targetPlayerId,
      amountHealthPoints: damage.damage.healthDamagePoints,
      presentation: Object.freeze({
        schemaVersion: 1 as const,
        kind: damage.damage.kind,
        eventId: combatWireId(damage.damage.eventId),
        eventSequence: damage.damage.eventSequence,
        authorityTick: damage.damage.authorityTick,
        causeId: combatWireId(damage.damage.causeId),
        sourcePlayerId: damage.damage.sourcePlayerId,
        targetPlayerId: damage.damage.targetPlayerId,
        shieldDamagePoints: damage.damage.shieldDamagePoints,
        healthDamagePoints: damage.damage.healthDamagePoints,
        shieldPointsAfter: damage.damage.shieldPointsAfter,
        healthPointsAfter: damage.damage.healthPointsAfter,
      }),
    }));
    if (damage.death !== null) {
      events.push(Object.freeze({
        serverTick: damage.death.authorityTick,
        kind: 'playerKilled',
        subjectId: combatWireId(damage.death.eventId),
        actorId: damage.death.killerPlayerId,
        targetId: damage.death.victimPlayerId,
        amountHealthPoints: null,
      }));
    }
  };
  for (const event of tick.combatEvents ?? []) {
    if (event.kind !== 'auto_rifle_shot_accepted') continue;
    events.push(Object.freeze({
      serverTick: event.authorityTick,
      kind: 'shotAccepted',
      subjectId: combatWireId(event.eventId),
      actorId: event.playerId,
      targetId: null,
      amountHealthPoints: null,
    }));
  }
  for (const result of tick.hitscanResults ?? []) {
    const damage = result.damage;
    if (damage === null || !damage.accepted) continue;
    events.push(Object.freeze({
      serverTick: damage.damage.authorityTick,
      kind: 'damageApplied',
      subjectId: combatWireId(damage.damage.eventId),
      actorId: damage.damage.sourcePlayerId,
      targetId: damage.damage.targetPlayerId,
      amountHealthPoints: damage.damage.healthDamagePoints,
      presentation: Object.freeze({
        schemaVersion: 1 as const,
        kind: damage.damage.kind,
        eventId: combatWireId(damage.damage.eventId),
        eventSequence: damage.damage.eventSequence,
        authorityTick: damage.damage.authorityTick,
        causeId: combatWireId(damage.damage.causeId),
        sourcePlayerId: damage.damage.sourcePlayerId,
        targetPlayerId: damage.damage.targetPlayerId,
        shieldDamagePoints: damage.damage.shieldDamagePoints,
        healthDamagePoints: damage.damage.healthDamagePoints,
        shieldPointsAfter: damage.damage.shieldPointsAfter,
        healthPointsAfter: damage.damage.healthPointsAfter,
      }),
    }));
    if (damage.death !== null) {
      events.push(Object.freeze({
        serverTick: damage.death.authorityTick,
        kind: 'playerKilled',
        subjectId: combatWireId(damage.death.eventId),
        actorId: damage.death.killerPlayerId,
        targetId: damage.death.victimPlayerId,
        amountHealthPoints: null,
      }));
    }
  }
  for (const result of tick.weaponAttackResults ?? []) {
    const attack = result.acceptedAttack;
    const attackEventId = combatWireId(attack.eventId);
    events.push(Object.freeze({
      serverTick: attack.authorityTick,
      kind: 'weaponAttackAccepted',
      subjectId: attackEventId,
      actorId: attack.playerId,
      targetId: null,
      amountHealthPoints: null,
      presentation: Object.freeze({
        schemaVersion: 1 as const,
        kind: 'weapon_attack_accepted' as const,
        eventId: attackEventId,
        authorityTick: attack.authorityTick,
        playerId: attack.playerId,
        weaponId: attack.weaponId,
        family: attack.family,
        attackModel: attack.attackModel,
        attackOrdinal: attack.attackOrdinal,
        referenceDamagePoints: attack.referenceDamagePoints,
        magazineRoundsAfter: attack.magazineRoundsAfter,
        reserveRoundsAfter: attack.reserveRoundsAfter,
        nextAttackAtTick: attack.nextAttackAtTick,
        ballistics: Object.freeze(attack.ballistics.map((sample) => Object.freeze({
          pelletIndex: sample.pelletIndex,
          spreadRadiusMilliDegrees: sample.spreadRadiusMilliDegrees,
          spreadPitchMilliDegrees: sample.spreadPitchMilliDegrees,
          spreadYawMilliDegrees: sample.spreadYawMilliDegrees,
        }))),
      }),
    }));
    if (result.kind === 'hitscan') {
      result.damages.forEach(appendDamage);
    } else if (result.kind === 'projectile' && result.projectile !== null) {
      const projectile = result.projectile;
      const projectileEventId = combatWireId(projectile.projectileId);
      events.push(Object.freeze({
        serverTick: projectile.spawnTick,
        kind: 'projectileSpawned',
        subjectId: projectileEventId,
        actorId: projectile.ownerPlayerId,
        targetId: null,
        amountHealthPoints: null,
        presentation: Object.freeze({
          schemaVersion: 1 as const,
          kind: 'weapon_projectile_spawned' as const,
          eventId: projectileEventId,
          authorityTick: projectile.spawnTick,
          projectileId: projectileEventId,
          ownerPlayerId: projectile.ownerPlayerId,
          ownerTeamId: projectile.ownerTeamId,
          weaponId: projectile.weaponId,
          spawnTick: projectile.spawnTick,
          expiresAtTick: projectile.expiresAtTick,
          positionMillimeters: Object.freeze({ ...projectile.positionMillimeters }),
          velocityMillimetersPerSecond: Object.freeze({
            ...projectile.velocityMillimetersPerSecond,
          }),
          radiusMillimeters: projectile.radiusMillimeters,
          splashRadiusMillimeters: projectile.splashRadiusMillimeters,
        }),
      }));
    } else if (result.kind === 'melee') {
      const contactEventId = combatWireId(`${attack.eventId}.contact`);
      events.push(Object.freeze({
        serverTick: attack.authorityTick,
        kind: 'meleeContact',
        subjectId: contactEventId,
        actorId: attack.playerId,
        targetId: result.resolution.targetPlayerId,
        amountHealthPoints: null,
        presentation: Object.freeze({
          schemaVersion: 1 as const,
          kind: 'weapon_melee_contact' as const,
          eventId: contactEventId,
          authorityTick: attack.authorityTick,
          playerId: attack.playerId,
          weaponId: KYX_WEAPON_ID.melee,
          attackOrdinal: attack.attackOrdinal,
          outcome: result.resolution.outcome,
          reason: result.resolution.reason,
          targetPlayerId: result.resolution.targetPlayerId,
          distanceMillimeters: result.resolution.distanceMillimeters,
          damagePoints: result.resolution.damagePoints,
          contactPointMillimeters: result.resolution.contactPointMillimeters === null
            ? null
            : Object.freeze({ ...result.resolution.contactPointMillimeters }),
        }),
      }));
      appendDamage(result.damage);
    }
  }
  for (const result of tick.weaponProjectileResults ?? []) {
    const detonation = result.detonation;
    const detonationEventId = combatWireId(detonation.eventId);
    events.push(Object.freeze({
      serverTick: detonation.authorityTick,
      kind: 'projectileDetonated',
      subjectId: detonationEventId,
      actorId: detonation.ownerPlayerId,
      targetId: null,
      amountHealthPoints: null,
      presentation: Object.freeze({
        schemaVersion: 1 as const,
        kind: 'weapon_projectile_detonated' as const,
        eventId: detonationEventId,
        authorityTick: detonation.authorityTick,
        projectileId: combatWireId(detonation.projectileId),
        ownerPlayerId: detonation.ownerPlayerId,
        ownerTeamId: detonation.ownerTeamId,
        weaponId: detonation.weaponId,
        positionMillimeters: Object.freeze({ ...detonation.positionMillimeters }),
        referenceDamagePoints: detonation.referenceDamagePoints,
        splashRadiusMillimeters: detonation.splashRadiusMillimeters,
        colliderId: detonation.colliderId === null
          ? null
          : combatWireId(detonation.colliderId),
        reason: detonation.reason,
      }),
    }));
    result.damages.forEach(appendDamage);
  }
  for (const event of tick.impulseGrenadeEvents ?? []) {
    if (event.kind === 'impulse_grenade_throw_accepted') {
      const wireEventId = combatWireId(event.eventId);
      const wireProjectileId = combatWireId(event.projectileId);
      events.push(Object.freeze({
        serverTick: event.authorityTick,
        kind: 'projectileSpawned',
        subjectId: wireEventId,
        actorId: event.playerId,
        targetId: null,
        amountHealthPoints: null,
        presentation: Object.freeze({
          schemaVersion: 1 as const,
          kind: event.kind,
          eventId: wireEventId,
          authorityTick: event.authorityTick,
          playerId: event.playerId,
          abilityId: event.abilityId,
          throwOrdinal: event.throwOrdinal,
          projectileId: wireProjectileId,
          cooldownEndsAtTick: event.cooldownEndsAtTick,
        }),
      }));
      events.push(Object.freeze({
        serverTick: event.authorityTick,
        kind: 'cooldownStarted',
        subjectId: wireEventId,
        actorId: event.playerId,
        targetId: null,
        amountHealthPoints: null,
      }));
    } else if (event.kind === 'impulse_grenade_collision') {
      const wireEventId = combatWireId(event.eventId);
      events.push(Object.freeze({
        serverTick: event.authorityTick,
        kind: 'projectileCollided',
        subjectId: wireEventId,
        actorId: event.ownerPlayerId,
        targetId: event.playerId,
        amountHealthPoints: null,
        presentation: Object.freeze({
          schemaVersion: 1 as const,
          kind: event.kind,
          eventId: wireEventId,
          authorityTick: event.authorityTick,
          projectileId: combatWireId(event.projectileId),
          ownerPlayerId: event.ownerPlayerId,
          colliderId: combatWireId(event.colliderId),
          layer: event.layer,
          playerId: event.playerId,
          timeOfImpactPermille: event.timeOfImpactPermille,
          bounceCount: event.bounceCount,
          fuseStartedAtTick: event.fuseStartedAtTick,
          detonatesAtTick: event.detonatesAtTick,
          settled: event.settled,
        }),
      }));
    } else if (event.kind === 'impulse_grenade_detonated') {
      const wireEventId = combatWireId(event.eventId);
      events.push(Object.freeze({
        serverTick: event.authorityTick,
        kind: 'projectileDetonated',
        subjectId: wireEventId,
        actorId: event.ownerPlayerId,
        targetId: null,
        amountHealthPoints: null,
        presentation: Object.freeze({
          schemaVersion: 1 as const,
          kind: event.kind,
          eventId: wireEventId,
          authorityTick: event.authorityTick,
          projectileId: combatWireId(event.projectileId),
          ownerPlayerId: event.ownerPlayerId,
          ownerTeamId: event.ownerTeamId,
          reason: event.reason,
          positionMillimeters: Object.freeze({ ...event.positionMillimeters }),
          areaRadiusMillimeters: event.areaRadiusMillimeters,
          damageHealthPoints: event.damageHealthPoints,
        }),
      }));
    } else if (event.kind === 'impulse_grenade_impulse_applied') {
      const wireEventId = combatWireId(event.eventId);
      events.push(Object.freeze({
        serverTick: event.authorityTick,
        kind: 'impulseApplied',
        subjectId: wireEventId,
        actorId: event.ownerPlayerId,
        targetId: event.targetPlayerId,
        amountHealthPoints: null,
        presentation: Object.freeze({
          schemaVersion: 1 as const,
          kind: event.kind,
          eventId: wireEventId,
          authorityTick: event.authorityTick,
          projectileId: combatWireId(event.projectileId),
          ownerPlayerId: event.ownerPlayerId,
          targetPlayerId: event.targetPlayerId,
          relation: event.relation,
          distanceMillimeters: event.distanceMillimeters,
          falloffPermille: event.falloffPermille,
          requestedImpulseMillimetersPerSecond: Object.freeze({
            ...event.requestedImpulseMillimetersPerSecond,
          }),
          appliedImpulseMillimetersPerSecond: Object.freeze({
            ...event.appliedImpulseMillimetersPerSecond,
          }),
          damageHealthPoints: event.damageHealthPoints,
        }),
      }));
    }
  }
  for (const event of tick.abilityResourceEvents ?? []) {
    if (event.kind === 'teleport_resource_confirmed') {
      events.push(Object.freeze({
        serverTick: event.authorityTick,
        kind: 'abilityActivated',
        subjectId: combatWireId(event.eventId),
        actorId: event.playerId,
        targetId: null,
        amountHealthPoints: null,
        presentation: Object.freeze({
          schemaVersion: 1 as const,
          kind: event.kind,
          eventId: combatWireId(event.eventId),
          authorityTick: event.authorityTick,
          playerId: event.playerId,
          abilityId: event.abilityId,
          outcome: event.outcome,
          from: Object.freeze({ ...event.from }),
          to: Object.freeze({ ...event.to }),
          cooldownTicksRemaining: event.cooldownTicksRemaining,
          weaponRecoveryTicks: event.weaponRecoveryTicks,
          combatStatePolicy: event.combatStatePolicy,
        }),
      }));
      events.push(Object.freeze({
        serverTick: event.authorityTick,
        kind: 'cooldownStarted',
        subjectId: combatWireId(event.eventId),
        actorId: event.playerId,
        targetId: null,
        amountHealthPoints: null,
      }));
    } else {
      events.push(Object.freeze({
        serverTick: event.authorityTick,
        kind: 'abilityRejected',
        subjectId: combatWireId(event.eventId),
        actorId: event.playerId,
        targetId: null,
        amountHealthPoints: null,
        presentation: Object.freeze({
          schemaVersion: 1 as const,
          kind: event.kind,
          eventId: combatWireId(event.eventId),
          authorityTick: event.authorityTick,
          playerId: event.playerId,
          abilityId: event.abilityId,
          reason: event.reason,
          cooldownTicksRemaining: event.cooldownTicksRemaining,
          cooldownConsumedByFailure: event.cooldownConsumedByFailure,
        }),
      }));
    }
  }
  return Object.freeze(events);
}
