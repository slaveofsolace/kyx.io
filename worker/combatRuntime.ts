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
  RELAY_AUTHORITY_FIXTURE,
  RELAY_AUTHORITY_IDENTITY,
  RELAY_AUTHORITY_MAP_BINDING,
  RELAY_AUTHORITY_PROFILE_ID,
  createRelayAuthorityCombatOptions,
  isRelayAuthorityProfile,
  relayAuthoritySpawn,
  type AuthorityRoomCombatOptions,
  type AuthoritySpawn,
  type ImpulseGrenadeCollisionSafeImpulseRequestV1,
} from '../src/authority';
import {
  INKFALL_AUTHORITY_MAP_IDENTITY_V2,
  INKFALL_AUTHORITY_MAP_IDENTITY_V3,
  INKFALL_AUTHORITY_MAP_IDENTITY_V4,
} from '../src/authority';
import type { SimulationIdentityV1 } from '../src/net';
import type {
  RapierMovementWorld,
} from '../src/physics';
import {
  INKFALL_REVISION_2_AUTHORITY_MAP_BINDING,
  INKFALL_REVISION_2_AUTHORITY_PROFILE_ID,
  INKFALL_REVISION_3_AUTHORITY_MAP_BINDING,
  INKFALL_REVISION_3_AUTHORITY_PROFILE_ID,
  INKFALL_REVISION_4_AUTHORITY_MAP_BINDING,
  INKFALL_REVISION_5_AUTHORITY_PROFILE_ID,
  createInkfallAuthorityCombatOptions,
  inkfallAuthorityCombatSpawn,
  inkfallAuthorityFixture,
  inkfallAuthorityMapBinding,
  inkfallRevision3SpawnAuthority,
  inkfallRevision4SpawnAuthority,
  isInkfallAuthorityProfile,
  type InkfallAuthorityProfile,
} from '../src/authority/inkfallRoomFactory';
import {
  combatSnapshotFromAuthority,
  combatWireId,
} from '../src/authority/combatSnapshot';
import { reliableCombatEvents } from '../src/authority/combatEvents';

export { combatSnapshotFromAuthority, combatWireId, reliableCombatEvents };

export const P58D_REV3_COMBAT_PROFILE = 'p58d-rev3-combat-v1' as const;
export const P511_INKFALL_REV2_COMBAT_PROFILE =
  INKFALL_REVISION_2_AUTHORITY_PROFILE_ID;
export const G5_INKFALL_REV4_COMBAT_PROFILE =
  INKFALL_REVISION_3_AUTHORITY_PROFILE_ID;
export const G5_INKFALL_REV5_COMBAT_PROFILE =
  INKFALL_REVISION_5_AUTHORITY_PROFILE_ID;
export const RELAY_REV1_COMBAT_PROFILE = RELAY_AUTHORITY_PROFILE_ID;
export const P58D_COMBAT_PROFILE_HEADER = 'x-kyx-evidence-profile' as const;
export const INTERNAL_ROOM_PROFILE_HEADER = 'x-kyx-room-profile' as const;
export const DEFAULT_FLAT_RUN_ROOM_PROFILE_STORAGE_ID =
  'phase4-flat-run-default-v1' as const;

export type OptInWorkerRoomProfile =
  | typeof P58D_REV3_COMBAT_PROFILE
  | typeof P511_INKFALL_REV2_COMBAT_PROFILE
  | typeof G5_INKFALL_REV4_COMBAT_PROFILE
  | typeof G5_INKFALL_REV5_COMBAT_PROFILE
  | typeof RELAY_REV1_COMBAT_PROFILE;

export type WorkerRoomProfile = OptInWorkerRoomProfile | null;
export type InkfallWorkerRoomProfile = InkfallAuthorityProfile;
export const INKFALL_REVISION_2_WORKER_MAP_BINDING =
  INKFALL_REVISION_2_AUTHORITY_MAP_BINDING;
export const INKFALL_REVISION_3_WORKER_MAP_BINDING =
  INKFALL_REVISION_3_AUTHORITY_MAP_BINDING;
export const INKFALL_REVISION_4_WORKER_MAP_BINDING =
  INKFALL_REVISION_4_AUTHORITY_MAP_BINDING;
export const RELAY_REVISION_1_WORKER_MAP_BINDING = RELAY_AUTHORITY_MAP_BINDING;

export function isInkfallWorkerRoomProfile(
  value: WorkerRoomProfile,
): value is InkfallWorkerRoomProfile {
  return isInkfallAuthorityProfile(value);
}

export function inkfallWorkerMapBinding(profile: InkfallWorkerRoomProfile) {
  return inkfallAuthorityMapBinding(profile);
}

export function isRelayWorkerRoomProfile(
  value: WorkerRoomProfile,
): value is typeof RELAY_REV1_COMBAT_PROFILE {
  return isRelayAuthorityProfile(value);
}

export function isPersistentMapWorkerRoomProfile(
  value: WorkerRoomProfile,
): value is InkfallWorkerRoomProfile | typeof RELAY_REV1_COMBAT_PROFILE {
  return isInkfallWorkerRoomProfile(value) || isRelayWorkerRoomProfile(value);
}

export function workerMapBinding(
  profile: InkfallWorkerRoomProfile | typeof RELAY_REV1_COMBAT_PROFILE,
) {
  return isRelayWorkerRoomProfile(profile)
    ? RELAY_REVISION_1_WORKER_MAP_BINDING
    : inkfallWorkerMapBinding(profile);
}

export function isP58DCombatProfile(value: string | null): boolean {
  return value === P58D_REV3_COMBAT_PROFILE;
}

export function isOptInWorkerRoomProfile(
  value: string | null,
): value is OptInWorkerRoomProfile {
  return value === P58D_REV3_COMBAT_PROFILE
    || value === P511_INKFALL_REV2_COMBAT_PROFILE
    || value === G5_INKFALL_REV4_COMBAT_PROFILE
    || value === G5_INKFALL_REV5_COMBAT_PROFILE
    || value === RELAY_REV1_COMBAT_PROFILE;
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
    && identity.mapId === RELAY_AUTHORITY_IDENTITY.mapId
    && identity.fixtureId === RELAY_AUTHORITY_IDENTITY.fixtureId
    && identity.fixtureHash === RELAY_AUTHORITY_IDENTITY.fixtureHash
  ) return RELAY_REV1_COMBAT_PROFILE;
  if (
    revision3Combat
    && identity.mapId === INKFALL_AUTHORITY_MAP_IDENTITY_V4.mapId
    && identity.fixtureId === INKFALL_REVISION_4_AUTHORITY_MAP_BINDING.fixtureId
    && identity.fixtureHash === INKFALL_AUTHORITY_MAP_IDENTITY_V4.fixtureHash
  ) return G5_INKFALL_REV5_COMBAT_PROFILE;
  if (
    revision3Combat
    && identity.mapId === INKFALL_AUTHORITY_MAP_IDENTITY_V3.mapId
    && identity.fixtureId === INKFALL_REVISION_3_AUTHORITY_MAP_BINDING.fixtureId
    && identity.fixtureHash === INKFALL_AUTHORITY_MAP_IDENTITY_V3.fixtureHash
  ) return G5_INKFALL_REV4_COMBAT_PROFILE;
  if (
    revision3Combat
    && identity.mapId === INKFALL_AUTHORITY_MAP_IDENTITY_V2.mapId
    && identity.fixtureId === INKFALL_REVISION_2_AUTHORITY_MAP_BINDING.fixtureId
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

export function inkfallRevision2WorkerFixture() {
  return inkfallAuthorityFixture(P511_INKFALL_REV2_COMBAT_PROFILE);
}

export function inkfallRevision3WorkerFixture() {
  return inkfallAuthorityFixture(G5_INKFALL_REV4_COMBAT_PROFILE);
}

export function inkfallRevision3WorkerSpawnAuthority() {
  return inkfallRevision3SpawnAuthority();
}

export function inkfallRevision4WorkerFixture() {
  return inkfallAuthorityFixture(G5_INKFALL_REV5_COMBAT_PROFILE);
}

export function inkfallRevision4WorkerSpawnAuthority() {
  return inkfallRevision4SpawnAuthority();
}

export function inkfallWorkerFixture(profile: InkfallWorkerRoomProfile) {
  return inkfallAuthorityFixture(profile);
}

export function relayWorkerFixture() {
  return RELAY_AUTHORITY_FIXTURE;
}

export function createRelayWorkerCombatOptions(
  world: RapierMovementWorld,
): AuthorityRoomCombatOptions {
  return createRelayAuthorityCombatOptions(world);
}

export function relayWorkerCombatSpawn(ordinal: number): AuthoritySpawn {
  return relayAuthoritySpawn(ordinal);
}

export function createInkfallWorkerCombatOptions(
  world: RapierMovementWorld,
  profile: InkfallWorkerRoomProfile = P511_INKFALL_REV2_COMBAT_PROFILE,
): AuthorityRoomCombatOptions {
  return createInkfallAuthorityCombatOptions(world, profile);
}

export function inkfallWorkerCombatSpawn(
  ordinal: number,
  profile: InkfallWorkerRoomProfile = P511_INKFALL_REV2_COMBAT_PROFILE,
): AuthoritySpawn {
  return inkfallAuthorityCombatSpawn(ordinal, profile);
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
