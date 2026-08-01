import type {
  CombatPresentationReliableEventV1,
  ReliableEventKind,
} from '../net';
import { KYX_WEAPON_ID } from './combat';
import { combatWireId } from './combatSnapshot';
import type {
  AuthorityRoomDamageResult,
  AuthorityRoomTickResult,
} from './room';

export interface AuthorityReliableEventInput {
  readonly serverTick: number;
  readonly kind: ReliableEventKind;
  readonly subjectId: string;
  readonly actorId: string | null;
  readonly targetId: string | null;
  readonly amountHealthPoints: number | null;
  readonly presentation?: CombatPresentationReliableEventV1;
}

function fnv1a64(source: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

export function reliableCombatEvents(
  tick: AuthorityRoomTickResult,
): readonly AuthorityReliableEventInput[] {
  const events: AuthorityReliableEventInput[] = [];
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
