import type { CombatSnapshotV1 } from '../net';
import {
  KYX_ARMORY_CATALOG_ID,
  kyxWeaponProfile,
} from './combat';
import type { AuthorityFullSnapshot } from './room';

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

export function combatSnapshotFromAuthority(
  snapshot: AuthorityFullSnapshot,
  recipientPlayerId: string | null = null,
  includePlayerScores = false,
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
      ...(includePlayerScores
        ? {
            scoreboard: Object.freeze({
              schemaVersion: 1 as const,
              playerScores: Object.freeze(snapshot.match.playerScores.map((score) => Object.freeze({
                playerId: score.playerId,
                teamId: score.teamId,
                kills: score.kills,
                deaths: score.deaths,
                assists: score.assists,
              }))),
            }),
          }
        : {}),
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
