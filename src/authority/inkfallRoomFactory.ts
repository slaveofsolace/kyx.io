import inkfallRevision2CombatFixtureSnapshot
  from '../../assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.p5-10.v1.json';
import inkfallRevision3CombatFixtureSnapshot
  from '../../assets/source/maps/inkfall-foundry/runtime/combat-authority-fixture.g5-revision3.v1.json';
import inkfallRevision2MapPackage
  from '../../assets/source/maps/inkfall-foundry/runtime/map.package.v2.json';
import inkfallRevision3MapPackage
  from '../../assets/source/maps/inkfall-foundry/revisions/revision-3/runtime/map.package.v3.json';
import type { LoadedRuntimeMapPackage, PhysicsFixtureV1, RapierMovementWorld } from '../physics';
import {
  IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
  type ImpulseGrenadeCollisionSafeImpulseRequestV1,
} from './combat/impulseGrenade';
import {
  createInkfallRevision2RapierCombatWorldPorts,
  createInkfallRevision3RapierCombatWorldPorts,
} from './combat/inkfallRapierCombatWorld';
import {
  INKFALL_AUTHORITY_MAP_IDENTITY_V2,
  INKFALL_AUTHORITY_MAP_IDENTITY_V3,
} from './inkfallMapIdentity';
import {
  G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID,
  G4_COMBAT_ROOM_PROFILE_ID,
  G4_HITSCAN_ROOM_CAPABILITY_ID,
  G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
  G4_TDM_MATCH_ROOM_CAPABILITY_ID,
  type AuthorityRoomCombatOptions,
  type AuthoritySpawn,
} from './room';
import { createInkfallSpawnAuthority, type InkfallSpawnAuthority } from './spawn';

export const INKFALL_REVISION_2_AUTHORITY_PROFILE_ID =
  'p511-inkfall-foundry-revision-2-combat-v1' as const;
export const INKFALL_REVISION_3_AUTHORITY_PROFILE_ID =
  'g5-inkfall-foundry-rev4-revision-3-authority-v1' as const;
// The persisted profile remains wire-compatible while Rev5 presentation is additive.
export const INKFALL_REVISION_5_AUTHORITY_PROFILE_ID =
  INKFALL_REVISION_3_AUTHORITY_PROFILE_ID;

export type InkfallAuthorityProfile =
  | typeof INKFALL_REVISION_2_AUTHORITY_PROFILE_ID
  | typeof INKFALL_REVISION_3_AUTHORITY_PROFILE_ID;

interface InkfallRuntimeSpawnSource {
  readonly id: string;
  readonly set: string;
  readonly feetPositionMm: Readonly<{ x: number; y: number; z: number }>;
  readonly yawMilliDegrees: number;
  readonly escapeRouteFamilies: readonly string[];
  readonly validationStatus: string;
}

interface InkfallRuntimePackageSource {
  readonly id: string;
  readonly revision: number;
  readonly displayName: string;
  readonly identity: Readonly<{ digest: string }>;
  readonly units: Readonly<{ distance: string; angle: string }>;
  readonly coordinateSystem: Readonly<{
    xAxis: string;
    yAxis: string;
    zAxis: string;
    origin: string;
    gltfToMap: string;
  }>;
  readonly artifacts: Readonly<{
    render: Readonly<{
      path: string;
      sha256: string;
      expectedMeshNodeCount: number;
    }>;
    collision: Readonly<{
      path: string;
      sha256: string;
      expectedMeshNodeCount: number;
    }>;
  }>;
  readonly authority: Readonly<{ renderMeshesMayBeAuthority: boolean }>;
  readonly zones: readonly Readonly<{
    id: string;
    callout: string;
    family: string;
    centerMm: Readonly<{ x: number; y: number; z: number }>;
    halfExtentsMm: Readonly<{ x: number; y: number; z: number }>;
  }>[];
  readonly spawns: readonly InkfallRuntimeSpawnSource[];
  readonly pickups: readonly unknown[];
  readonly triggers: readonly Readonly<{
    id: string;
    kind: string;
    centerMm: Readonly<{ x: number; y: number; z: number }>;
    halfExtentsMm: Readonly<{ x: number; y: number; z: number }>;
    destinationFeetMm: Readonly<{ x: number; y: number; z: number }>;
    [key: string]: unknown;
  }>[];
}

interface InkfallCombatFixtureSnapshotV1 {
  readonly schemaVersion: 1;
  readonly kind:
    | 'inkfall_revision_2_combat_authority_fixture'
    | 'inkfall_revision_3_combat_authority_fixture';
  readonly mapId: string;
  readonly mapRevision: number;
  readonly packageDigest: string;
  readonly collisionPath: string;
  readonly collisionSha256: string;
  readonly fixtureHash: string;
  readonly collisionMeshNodeCount: number;
  readonly authorityVolumeCount: number;
  readonly fixture: PhysicsFixtureV1;
}

const revision2Package = inkfallRevision2MapPackage as unknown as InkfallRuntimePackageSource;
const revision3Package = inkfallRevision3MapPackage as unknown as InkfallRuntimePackageSource;
const revision2Fixture = inkfallRevision2CombatFixtureSnapshot as unknown as InkfallCombatFixtureSnapshotV1;
const revision3Fixture = inkfallRevision3CombatFixtureSnapshot as unknown as InkfallCombatFixtureSnapshotV1;

const INKFALL_REVISION_2_LOCKED_SPAWN_ORDER = Object.freeze([
  'spawn_w_press_a',
  'spawn_e_press_a',
  'spawn_w_press_b',
  'spawn_e_press_b',
  'spawn_w_ink',
  'spawn_e_ink',
  'spawn_w_archive',
  'spawn_e_archive',
] as const);

const INKFALL_REVISION_3_LOCKED_SPAWN_ORDER = Object.freeze([
  ...INKFALL_REVISION_2_LOCKED_SPAWN_ORDER,
  'spawn_dm_ink_w',
  'spawn_dm_ink_e',
  'spawn_dm_archive_w',
  'spawn_dm_archive_e',
] as const);

interface LockedInkfallSpawn<SpawnId extends string> {
  readonly spawnId: SpawnId;
  readonly set: string;
  readonly feetPosition: Readonly<{ x: number; y: number; z: number }>;
  readonly yawMilliDegrees: number;
  readonly escapeRouteFamilies: readonly string[];
  readonly validationStatus: string;
}

function lockedSpawns<const SpawnOrder extends readonly string[]>(
  source: InkfallRuntimePackageSource,
  order: SpawnOrder,
): readonly LockedInkfallSpawn<SpawnOrder[number]>[] {
  const byId = new Map(source.spawns.map((spawn) => [spawn.id, spawn]));
  return Object.freeze(order.map((spawnId): LockedInkfallSpawn<SpawnOrder[number]> => {
    const spawn = byId.get(spawnId);
    if (spawn === undefined) throw new Error(`INKFALL_AUTHORITY_SPAWN_MISSING:${spawnId}`);
    return Object.freeze({
      spawnId: spawn.id,
      set: spawn.set,
      feetPosition: Object.freeze({ ...spawn.feetPositionMm }),
      yawMilliDegrees: spawn.yawMilliDegrees,
      escapeRouteFamilies: Object.freeze([...spawn.escapeRouteFamilies]),
      validationStatus: spawn.validationStatus,
    });
  }));
}

const revision2Spawns = lockedSpawns(
  revision2Package,
  INKFALL_REVISION_2_LOCKED_SPAWN_ORDER,
);
const revision3Spawns = lockedSpawns(
  revision3Package,
  INKFALL_REVISION_3_LOCKED_SPAWN_ORDER,
);

export const INKFALL_REVISION_2_AUTHORITY_MAP_BINDING = Object.freeze({
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
  colliderCardinality: INKFALL_AUTHORITY_MAP_IDENTITY_V2.colliderCardinality,
  spawns: revision2Spawns,
} as const);

export const INKFALL_REVISION_3_AUTHORITY_MAP_BINDING = Object.freeze({
  mapReference: 'inkfall_foundry@3',
  presentationReference:
    'inkfall_foundry@3/press_archive/v5.0/geometry-portal-modular',
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
  colliderCardinality: INKFALL_AUTHORITY_MAP_IDENTITY_V3.colliderCardinality,
  render: Object.freeze({
    role: 'render_only',
    path:
      'art-kit/press-archive-rev5/rev5/export/inkfall_foundry_rev5_geometry_portal.render-only-modules.glb',
    sha256: '88bc45a6735256dcffb5735f3d466840f362e9ece9d02a52a9f1c8a082b395e0',
    bytes: 5_091_640,
    renderMeshesMayBeAuthority: false,
  }),
  collision: Object.freeze({
    role: 'authority_collision',
    path: revision3Package.artifacts.collision.path,
    sha256: revision3Package.artifacts.collision.sha256,
    bytes: 605_112,
  }),
  supportedModes: Object.freeze(['deathmatch', 'team_deathmatch']),
  spawns: revision3Spawns,
  zones: Object.freeze(revision3Package.zones.map((zone) => Object.freeze({
    zoneId: zone.id,
    callout: zone.callout,
    family: zone.family,
    center: Object.freeze({ ...zone.centerMm }),
    halfExtents: Object.freeze({ ...zone.halfExtentsMm }),
  }))),
  pickups: Object.freeze([]),
  triggers: Object.freeze(revision3Package.triggers.map((trigger) => Object.freeze({
    ...trigger,
    centerMm: Object.freeze({ ...trigger.centerMm }),
    halfExtentsMm: Object.freeze({ ...trigger.halfExtentsMm }),
    destinationFeetMm: Object.freeze({ ...trigger.destinationFeetMm }),
  }))),
  portal: Object.freeze({
    capabilityId: 'inkfall_rev5_linked_world_portal_v1',
    authorityRole: 'additive_server_authority',
    renderRole: 'rev5_render_only_no_hit',
    endpointCount: 2,
  }),
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

export type InkfallRevision2AuthorityMapBinding =
  typeof INKFALL_REVISION_2_AUTHORITY_MAP_BINDING;
export type InkfallRevision3AuthorityMapBinding =
  typeof INKFALL_REVISION_3_AUTHORITY_MAP_BINDING;
export type InkfallAuthorityMapBinding =
  | InkfallRevision2AuthorityMapBinding
  | InkfallRevision3AuthorityMapBinding;

export function isInkfallAuthorityProfile(
  value: string | null,
): value is InkfallAuthorityProfile {
  return value === INKFALL_REVISION_2_AUTHORITY_PROFILE_ID
    || value === INKFALL_REVISION_3_AUTHORITY_PROFILE_ID;
}

export function inkfallAuthorityMapBinding(
  profile: InkfallAuthorityProfile,
): InkfallAuthorityMapBinding {
  return profile === INKFALL_REVISION_3_AUTHORITY_PROFILE_ID
    ? INKFALL_REVISION_3_AUTHORITY_MAP_BINDING
    : INKFALL_REVISION_2_AUTHORITY_MAP_BINDING;
}

function assertRuntimeArtifacts(
  source: InkfallRuntimePackageSource,
  fixture: InkfallCombatFixtureSnapshotV1,
  binding: InkfallAuthorityMapBinding,
): void {
  const expectedKind = binding.mapRevision === 3
    ? 'inkfall_revision_3_combat_authority_fixture'
    : 'inkfall_revision_2_combat_authority_fixture';
  const packageMatches = source.id === binding.mapId
    && source.revision === binding.mapRevision
    && source.identity.digest === binding.packageDigest
    && source.units.distance === binding.distanceUnit
    && source.units.angle === binding.angleUnit
    && source.coordinateSystem.xAxis === binding.xAxis
    && source.coordinateSystem.yAxis === binding.yAxis
    && source.coordinateSystem.zAxis === binding.zAxis
    && source.coordinateSystem.origin === binding.origin
    && source.coordinateSystem.gltfToMap === binding.gltfToMap
    && source.authority.renderMeshesMayBeAuthority === false
    && source.spawns.length >= binding.spawns.length;
  const fixtureMatches = fixture.schemaVersion === 1
    && fixture.kind === expectedKind
    && fixture.mapId === binding.mapId
    && fixture.mapRevision === binding.mapRevision
    && fixture.packageDigest === binding.packageDigest
    && fixture.fixtureHash === binding.fixtureHash
    && fixture.collisionMeshNodeCount === binding.colliderCardinality
    && fixture.authorityVolumeCount === 2
    && fixture.fixture.id === binding.fixtureId
    && fixture.fixture.revision === binding.mapRevision
    && fixture.fixture.solids.length === binding.colliderCardinality;
  const sourceSpawns = new Map(source.spawns.map((spawn) => [spawn.id, spawn]));
  const spawnsMatch = binding.spawns.every((locked) => {
    const current = sourceSpawns.get(locked.spawnId);
    return current !== undefined
      && current.set === locked.set
      && current.feetPositionMm.x === locked.feetPosition.x
      && current.feetPositionMm.y === locked.feetPosition.y
      && current.feetPositionMm.z === locked.feetPosition.z
      && current.yawMilliDegrees === locked.yawMilliDegrees;
  });
  if (!packageMatches || !fixtureMatches || !spawnsMatch) {
    throw new Error(`INKFALL_REVISION_${binding.mapRevision}_AUTHORITY_ARTIFACT_MISMATCH`);
  }
}

function runtimeArtifacts(profile: InkfallAuthorityProfile) {
  if (profile === INKFALL_REVISION_3_AUTHORITY_PROFILE_ID) {
    assertRuntimeArtifacts(
      revision3Package,
      revision3Fixture,
      INKFALL_REVISION_3_AUTHORITY_MAP_BINDING,
    );
    return Object.freeze({ source: revision3Package, fixture: revision3Fixture });
  }
  assertRuntimeArtifacts(
    revision2Package,
    revision2Fixture,
    INKFALL_REVISION_2_AUTHORITY_MAP_BINDING,
  );
  return Object.freeze({ source: revision2Package, fixture: revision2Fixture });
}

export function inkfallAuthorityFixture(
  profile: InkfallAuthorityProfile,
): PhysicsFixtureV1 {
  return runtimeArtifacts(profile).fixture.fixture;
}

let revision3SpawnAuthority: InkfallSpawnAuthority | null = null;

export function inkfallRevision3SpawnAuthority(): InkfallSpawnAuthority {
  if (revision3SpawnAuthority !== null) return revision3SpawnAuthority;
  const { source, fixture } = runtimeArtifacts(INKFALL_REVISION_3_AUTHORITY_PROFILE_ID);
  const manifest = inkfallRevision3MapPackage as unknown as
    LoadedRuntimeMapPackage['manifest'];
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
      collisionPath: fixture.collisionPath,
      collisionSha256: fixture.collisionSha256,
      collisionMeshNodeCount: fixture.collisionMeshNodeCount,
      authorityVolumeCount: fixture.authorityVolumeCount,
      totalColliderCount: fixture.fixture.solids.length,
      sourceKindCounts: Object.freeze({ authority_collision: fixture.fixture.solids.length }),
      fixture: fixture.fixture,
      fixtureHash: fixture.fixtureHash,
    }),
  }) satisfies LoadedRuntimeMapPackage;
  if (source.id !== loaded.identity.id) {
    throw new Error('INKFALL_REVISION_3_SPAWN_AUTHORITY_IDENTITY_MISMATCH');
  }
  revision3SpawnAuthority = createInkfallSpawnAuthority(loaded);
  return revision3SpawnAuthority;
}

export function createInkfallAuthorityCombatOptions(
  world: RapierMovementWorld,
  profile: InkfallAuthorityProfile = INKFALL_REVISION_2_AUTHORITY_PROFILE_ID,
): AuthorityRoomCombatOptions {
  runtimeArtifacts(profile);
  const ports = profile === INKFALL_REVISION_3_AUTHORITY_PROFILE_ID
    ? createInkfallRevision3RapierCombatWorldPorts(world)
    : createInkfallRevision2RapierCombatWorldPorts(world);
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

export function inkfallAuthorityCombatSpawn(
  ordinal: number,
  profile: InkfallAuthorityProfile = INKFALL_REVISION_2_AUTHORITY_PROFILE_ID,
): AuthoritySpawn {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) {
    throw new RangeError('Inkfall spawn ordinal must be a non-negative safe integer');
  }
  const binding = inkfallAuthorityMapBinding(profile);
  const playableSpawns = binding.spawns.slice(0, 8);
  const spawn = playableSpawns[ordinal % playableSpawns.length];
  if (spawn === undefined) throw new Error('INKFALL_AUTHORITY_SPAWN_MISSING');
  return Object.freeze({
    spawnId: spawn.spawnId,
    feetPosition: spawn.feetPosition,
    yawMilliDegrees: spawn.yawMilliDegrees,
  });
}

export function createOpenArenaCombatOptions(): AuthorityRoomCombatOptions {
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
        resolveCollisionSafeImpulse: (
          request: ImpulseGrenadeCollisionSafeImpulseRequestV1,
        ) => Object.freeze({
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
