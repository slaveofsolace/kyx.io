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
  kyxWeaponProfile,
  type AuthorityFullSnapshot,
  type AuthorityRoomCombatOptions,
  type AuthorityRoomDamageResult,
  type AuthorityRoomTickResult,
  type AuthoritySpawn,
  type ImpulseGrenadeCollisionSafeImpulseRequestV1,
} from '../src/authority';
import {
  INKFALL_AUTHORITY_MAP_IDENTITY_V2,
  INKFALL_AUTHORITY_MAP_IDENTITY_V3,
} from '../src/authority';
import type { CombatSnapshotV1, SimulationIdentityV1 } from '../src/net';
import type {
  RapierMovementWorld,
} from '../src/physics';
import {
  INKFALL_REVISION_2_AUTHORITY_MAP_BINDING,
  INKFALL_REVISION_2_AUTHORITY_PROFILE_ID,
  INKFALL_REVISION_3_AUTHORITY_MAP_BINDING,
  INKFALL_REVISION_3_AUTHORITY_PROFILE_ID,
  INKFALL_REVISION_5_AUTHORITY_PROFILE_ID,
  createInkfallAuthorityCombatOptions,
  inkfallAuthorityCombatSpawn,
  inkfallAuthorityFixture,
  inkfallAuthorityMapBinding,
  inkfallRevision3SpawnAuthority,
  isInkfallAuthorityProfile,
  type InkfallAuthorityProfile,
} from '../src/authority/inkfallRoomFactory';
import type { ReliableEventInput } from './reliableEvents';

export const P58D_REV3_COMBAT_PROFILE = 'p58d-rev3-combat-v1' as const;
export const P511_INKFALL_REV2_COMBAT_PROFILE =
  INKFALL_REVISION_2_AUTHORITY_PROFILE_ID;
export const G5_INKFALL_REV4_COMBAT_PROFILE =
  INKFALL_REVISION_3_AUTHORITY_PROFILE_ID;
// Wire/storage identity remains unchanged for existing Durable Object rooms.
export const G5_INKFALL_REV5_COMBAT_PROFILE =
  INKFALL_REVISION_5_AUTHORITY_PROFILE_ID;
export const P58D_COMBAT_PROFILE_HEADER = 'x-kyx-evidence-profile' as const;
export const INTERNAL_ROOM_PROFILE_HEADER = 'x-kyx-room-profile' as const;
export const DEFAULT_FLAT_RUN_ROOM_PROFILE_STORAGE_ID =
  'phase4-flat-run-default-v1' as const;

export type OptInWorkerRoomProfile =
  | typeof P58D_REV3_COMBAT_PROFILE
  | typeof P511_INKFALL_REV2_COMBAT_PROFILE
  | typeof G5_INKFALL_REV4_COMBAT_PROFILE;

export type WorkerRoomProfile = OptInWorkerRoomProfile | null;
export type InkfallWorkerRoomProfile = InkfallAuthorityProfile;
export const INKFALL_REVISION_2_WORKER_MAP_BINDING =
  INKFALL_REVISION_2_AUTHORITY_MAP_BINDING;
export const INKFALL_REVISION_3_WORKER_MAP_BINDING =
  INKFALL_REVISION_3_AUTHORITY_MAP_BINDING;

export function isInkfallWorkerRoomProfile(
  value: WorkerRoomProfile,
): value is InkfallWorkerRoomProfile {
  return isInkfallAuthorityProfile(value);
}

export function inkfallWorkerMapBinding(profile: InkfallWorkerRoomProfile) {
  return inkfallAuthorityMapBinding(profile);
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

export function inkfallRevision2WorkerFixture() {
  return inkfallAuthorityFixture(P511_INKFALL_REV2_COMBAT_PROFILE);
}

export function inkfallRevision3WorkerFixture() {
  return inkfallAuthorityFixture(G5_INKFALL_REV4_COMBAT_PROFILE);
}

export function inkfallRevision3WorkerSpawnAuthority() {
  return inkfallRevision3SpawnAuthority();
}

export function inkfallWorkerFixture(profile: InkfallWorkerRoomProfile) {
  return inkfallAuthorityFixture(profile);
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

export function combatSnapshotFromAuthority(
  snapshot: AuthorityFullSnapshot,
  recipientPlayerId: string | null = null,
): CombatSnapshotV1 | null {
  const combatPlayers = snapshot.players.filter((player) => player.combat !== undefined);
  if (combatPlayers.length === 0) return null;
  if (combatPlayers.length !== snapshot.players.length || snapshot.match === undefined) {
    throw new Error('AUTHORITY_COMBAT_SNAPSHOT_INCOMPLETE');
  }
  const projectiles = snapshot.impulseGrenadeProjectiles ?? [];
  const abilityProjectiles = snapshot.abilityProjectiles ?? [];
  const smokeFields = snapshot.abilitySmokeFields ?? [];
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
      const includePrivateArmory = recipientPlayerId === null
        || player.playerId === recipientPlayerId;
      const abilityCooldowns = combat.abilityLoadout === undefined
        ? null
        : [...combat.abilityLoadout.cooldownEndsAtTicks] as [number, number, number];
      const abilityActivationCounts = combat.abilityLoadout === undefined
        ? null
        : [...combat.abilityLoadout.acceptedActivationCounts] as [number, number, number];
      const abilityCurrentCharges = combat.abilityLoadout === undefined
        ? null
        : [...combat.abilityLoadout.currentCharges] as [number, number, number];
      const abilityMaximumCharges = combat.abilityLoadout === undefined
        ? null
        : [...combat.abilityLoadout.maximumCharges] as [number, number, number];
      const launchSlotIndex = combat.abilityLoadout?.loadout.slots
        .slice(1)
        .indexOf('vertical_impulse_grenade_v1') ?? -1;
      if (
        launchSlotIndex >= 0
        && abilityCooldowns !== null
        && abilityActivationCounts !== null
        && abilityCurrentCharges !== null
        && abilityMaximumCharges !== null
      ) {
        abilityCooldowns[launchSlotIndex] = combat.impulseGrenade.cooldownEndsAtTick;
        abilityActivationCounts[launchSlotIndex] = combat.impulseGrenade.acceptedThrowCount;
        abilityCurrentCharges[launchSlotIndex] = combat.impulseGrenade.currentCharges;
        abilityMaximumCharges[launchSlotIndex] = combat.impulseGrenade.maximumCharges;
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
        selectedWeaponSlot: combat.armory.selectedSlot,
        selectedWeaponId: combat.armory.weapons.find(
          (weapon) => kyxWeaponProfile(weapon.weaponId).slot === combat.armory.selectedSlot,
        )?.weaponId ?? null,
        ...(includePrivateArmory
          ? {
              weaponCatalogId: KYX_ARMORY_CATALOG_ID,
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
            }
          : {}),
        grenadePhase: combat.impulseGrenade.phase,
        grenadeCooldownEndsAtTick: combat.impulseGrenade.cooldownEndsAtTick,
        acceptedThrowCount: combat.impulseGrenade.acceptedThrowCount,
        activeProjectileCount: projectiles.filter((projectile) => (
          projectile.phase === 'active' && projectile.ownerPlayerId === player.playerId
        )).length,
        ...(combat.abilityLoadout === undefined
          || (recipientPlayerId !== null && player.playerId !== recipientPlayerId)
          ? {}
          : {
              abilityLoadout: Object.freeze({
                slots: combat.abilityLoadout.loadout.slots,
                cooldownEndsAtTicks: Object.freeze(abilityCooldowns) as readonly [
                  number,
                  number,
                  number,
                ],
                currentCharges: Object.freeze(abilityCurrentCharges) as readonly [
                  number,
                  number,
                  number,
                ],
                maximumCharges: Object.freeze(abilityMaximumCharges) as readonly [
                  number,
                  number,
                  number,
                ],
                acceptedActivationCounts: Object.freeze(abilityActivationCounts) as readonly [
                  number,
                  number,
                  number,
                ],
                flashImpairedUntilTick: combat.flashImpairedUntilTick ?? snapshot.serverTick,
              }),
            }),
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
    ...(abilityProjectiles.length === 0
      ? {}
      : {
          abilityProjectiles: Object.freeze(abilityProjectiles.map((projectile) => Object.freeze({
            projectileId: combatWireId(projectile.projectileId),
            ownerPlayerId: projectile.ownerPlayerId,
            ownerTeamId: projectile.ownerTeamId,
            abilityId: projectile.abilityId,
            spawnTick: projectile.spawnTick,
            lifetimeEndsAtTick: projectile.lifetimeEndsAtTick,
            detonatesAtTick: projectile.detonatesAtTick,
            xMillimeters: projectile.positionMillimeters.x,
            yMillimeters: projectile.positionMillimeters.y,
            zMillimeters: projectile.positionMillimeters.z,
            velocityXMillimetersPerSecond: projectile.velocityMillimetersPerSecond.x,
            velocityYMillimetersPerSecond: projectile.velocityMillimetersPerSecond.y,
            velocityZMillimetersPerSecond: projectile.velocityMillimetersPerSecond.z,
            bounceCount: projectile.bounceCount,
            settled: projectile.settled,
            attachedPlayerId: projectile.attachedPlayerId,
          }))),
        }),
    ...(smokeFields.length === 0
      ? {}
      : {
          smokeFields: Object.freeze(smokeFields.map((field) => Object.freeze({
            fieldId: combatWireId(field.fieldId),
            ownerPlayerId: field.ownerPlayerId,
            ownerTeamId: field.ownerTeamId,
            spawnedAtTick: field.spawnedAtTick,
            expiresAtTick: field.expiresAtTick,
            xMillimeters: field.centerMillimeters.x,
            yMillimeters: field.centerMillimeters.y,
            zMillimeters: field.centerMillimeters.z,
            radiusMillimeters: field.radiusMillimeters,
          }))),
        }),
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
        hitRegion: damage.damage.hitRegion,
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
  for (const result of tick.volumeDamageResults ?? []) appendDamage(result.damage);
  for (const event of tick.movementEvents ?? []) {
    if (event.kind !== 'teleport_succeeded' || event.worldPortal === undefined) {
      continue;
    }
    const worldPortal = event.worldPortal;
    const wireEventId = combatWireId(
      `world_portal.${event.tick}.${event.entityId}.${worldPortal.endpointId}`,
    );
    events.push(Object.freeze({
      serverTick: event.tick,
      kind: 'worldPortalTraversed',
      subjectId: wireEventId,
      actorId: event.entityId,
      targetId: null,
      amountHealthPoints: null,
      presentation: Object.freeze({
        schemaVersion: 1 as const,
        kind: 'world_portal_traversed' as const,
        eventId: wireEventId,
        authorityTick: event.tick,
        playerId: event.entityId,
        capabilityId: worldPortal.capabilityId,
        endpointId: worldPortal.endpointId,
        partnerEndpointId: worldPortal.partnerEndpointId,
        from: Object.freeze({ ...event.from }),
        to: Object.freeze({ ...event.to }),
        departureAudioHook: worldPortal.departureAudioHook,
        arrivalAudioHook: worldPortal.arrivalAudioHook,
        departureVfxHook: worldPortal.departureVfxHook,
        arrivalVfxHook: worldPortal.arrivalVfxHook,
      }),
    }));
  }
  for (const event of tick.combatEvents ?? []) {
    if (event.kind !== 'auto_rifle_shot_accepted') continue;
    const attackEventId = combatWireId(event.eventId);
    events.push(Object.freeze({
      serverTick: event.authorityTick,
      kind: 'weaponAttackAccepted',
      subjectId: attackEventId,
      actorId: event.playerId,
      targetId: null,
      amountHealthPoints: null,
      presentation: Object.freeze({
        schemaVersion: 1 as const,
        kind: 'weapon_attack_accepted' as const,
        eventId: attackEventId,
        authorityTick: event.authorityTick,
        playerId: event.playerId,
        weaponId: event.weaponId,
        family: 'rifle' as const,
        attackModel: 'hitscan' as const,
        attackOrdinal: event.shotOrdinal,
        referenceDamagePoints: event.referenceDamagePoints,
        magazineRoundsAfter: event.magazineRoundsAfter,
        reserveRoundsAfter: event.reserveRoundsAfter,
        nextAttackAtTick: event.nextShotAtTick,
        ballistics: Object.freeze([Object.freeze({
          pelletIndex: 0,
          spreadRadiusMilliDegrees:
            event.ballistics.spreadRadiusMilliDegrees,
          spreadPitchMilliDegrees:
            event.ballistics.spreadPitchMilliDegrees,
          spreadYawMilliDegrees:
            event.ballistics.spreadYawMilliDegrees,
        })]),
      }),
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
        hitRegion: damage.damage.hitRegion,
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
  for (const event of tick.abilityLoadoutEvents ?? []) {
    const wireEventId = combatWireId(
      `ability.${event.abilityId}.${fnv1a64(event.eventId)}`,
    );
    if (event.kind === 'ability_activation_accepted') {
      events.push(Object.freeze({
        serverTick: event.authorityTick,
        kind: 'projectileSpawned',
        subjectId: wireEventId,
        actorId: event.playerId,
        targetId: null,
        amountHealthPoints: null,
        presentation: Object.freeze({
          schemaVersion: 1 as const,
          kind: 'throwable_ability_event' as const,
          eventId: wireEventId,
          authorityTick: event.authorityTick,
          phase: 'activated' as const,
          playerId: event.playerId,
          abilityId: event.abilityId,
          projectileId: combatWireId(event.projectileId),
          targetPlayerId: null,
          cooldownEndsAtTick: event.cooldownEndsAtTick,
          positionMillimeters: null,
          areaRadiusMillimeters: null,
          reason: null,
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
    } else if (event.kind === 'ability_activation_rejected') {
      events.push(Object.freeze({
        serverTick: event.authorityTick,
        kind: 'abilityRejected',
        subjectId: wireEventId,
        actorId: event.playerId,
        targetId: null,
        amountHealthPoints: null,
        presentation: Object.freeze({
          schemaVersion: 1 as const,
          kind: 'throwable_ability_event' as const,
          eventId: wireEventId,
          authorityTick: event.authorityTick,
          phase: 'rejected' as const,
          playerId: event.playerId,
          abilityId: event.abilityId,
          projectileId: null,
          targetPlayerId: null,
          cooldownEndsAtTick: event.cooldownEndsAtTick,
          positionMillimeters: null,
          areaRadiusMillimeters: null,
          reason: event.reason,
        }),
      }));
    } else if (event.kind === 'ability_projectile_collision') {
      events.push(Object.freeze({
        serverTick: event.authorityTick,
        kind: 'projectileCollided',
        subjectId: wireEventId,
        actorId: event.ownerPlayerId,
        targetId: event.playerId,
        amountHealthPoints: null,
        presentation: Object.freeze({
          schemaVersion: 1 as const,
          kind: 'throwable_ability_event' as const,
          eventId: wireEventId,
          authorityTick: event.authorityTick,
          phase: 'collision' as const,
          playerId: event.ownerPlayerId,
          abilityId: event.abilityId,
          projectileId: combatWireId(event.projectileId),
          targetPlayerId: event.playerId,
          cooldownEndsAtTick: null,
          positionMillimeters: null,
          areaRadiusMillimeters: null,
          reason: event.attached ? 'attached' : event.settled ? 'settled' : 'bounce',
        }),
      }));
    } else {
      events.push(Object.freeze({
        serverTick: event.authorityTick,
        kind: 'projectileDetonated',
        subjectId: wireEventId,
        actorId: event.ownerPlayerId,
        targetId: null,
        amountHealthPoints: null,
        presentation: Object.freeze({
          schemaVersion: 1 as const,
          kind: 'throwable_ability_event' as const,
          eventId: wireEventId,
          authorityTick: event.authorityTick,
          phase: 'detonated' as const,
          playerId: event.ownerPlayerId,
          abilityId: event.abilityId,
          projectileId: combatWireId(event.projectileId),
          targetPlayerId: null,
          cooldownEndsAtTick: null,
          positionMillimeters: Object.freeze({ ...event.positionMillimeters }),
          areaRadiusMillimeters: event.areaRadiusMillimeters,
          reason: event.reason,
        }),
      }));
    }
  }
  for (const result of tick.abilityEffectResults ?? []) {
    result.damages.forEach(appendDamage);
    for (const outcome of result.outcomes) {
      if (outcome.status !== 'applied' || outcome.flashDurationTicks <= 0) continue;
      const flashEventId = combatWireId(
        `ability.${result.detonation.abilityId}.flash.${fnv1a64(
          `${result.detonation.eventId}:${outcome.targetPlayerId}`,
        )}`,
      );
      events.push(Object.freeze({
        serverTick: result.detonation.authorityTick,
        kind: 'abilityActivated',
        subjectId: flashEventId,
        actorId: result.detonation.ownerPlayerId,
        targetId: outcome.targetPlayerId,
        amountHealthPoints: null,
        presentation: Object.freeze({
          schemaVersion: 1 as const,
          kind: 'throwable_ability_event' as const,
          eventId: flashEventId,
          authorityTick: result.detonation.authorityTick,
          phase: 'flash_applied' as const,
          playerId: result.detonation.ownerPlayerId,
          abilityId: result.detonation.abilityId,
          projectileId: combatWireId(result.detonation.projectileId),
          targetPlayerId: outcome.targetPlayerId,
          cooldownEndsAtTick: null,
          positionMillimeters: Object.freeze({
            ...result.detonation.positionMillimeters,
          }),
          areaRadiusMillimeters: result.detonation.areaRadiusMillimeters,
          reason: null,
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
