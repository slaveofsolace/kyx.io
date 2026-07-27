import { describe, expect, it } from 'vitest';

import type { AuthorityRoomTickResult } from '../../src/authority';
import {
  PROTOCOL_VERSION,
  RELIABLE_EVENT_STREAM_VERSION,
  validateServerMessage,
} from '../../src/net';
import { reliableCombatEvents } from '../../worker/combatRuntime';
import { ReliableEventStore } from '../../worker/reliableEvents';

function tick(value: Partial<AuthorityRoomTickResult>): AuthorityRoomTickResult {
  return value as AuthorityRoomTickResult;
}

describe('Worker explicit combat presentation projection', () => {
  it('retains authoritative shield amounts and teleport outcomes through the reliable store', () => {
    const inputs = reliableCombatEvents(tick({
      combatEvents: [],
      hitscanResults: [{
        damage: {
          accepted: true,
          damage: {
            kind: 'damage_applied',
            eventId: 'combat.damage.9',
            eventSequence: 9,
            authorityTick: 80,
            causeId: 'vertical_rifle_v1',
            sourcePlayerId: 'player_A',
            targetPlayerId: 'player_B',
            shieldDamagePoints: 10,
            healthDamagePoints: 0,
            shieldPointsAfter: 15,
            healthPointsAfter: 100,
          },
          death: null,
        },
      }] as AuthorityRoomTickResult['hitscanResults'],
      impulseGrenadeEvents: [],
      abilityResourceEvents: [{
        kind: 'teleport_resource_confirmed',
        eventId: 'ability_resource.player_A.0.teleport.0',
        authorityTick: 80,
        playerId: 'player_A',
        abilityId: 'vertical_teleport_v1',
        outcome: 'full',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 0, y: 0, z: 9_000 },
        cooldownTicksRemaining: 160,
        weaponRecoveryTicks: 0,
        combatStatePolicy: 'preserve_existing_combat_state',
      }],
    }));
    const store = new ReliableEventStore();
    const events = inputs.map((input) => store.append(input));
    expect(events.find(({ kind }) => kind === 'damageApplied')?.presentation).toMatchObject({
      kind: 'damage_applied',
      shieldDamagePoints: 10,
      healthDamagePoints: 0,
      shieldPointsAfter: 15,
      healthPointsAfter: 100,
    });
    expect(events.find(({ kind }) => kind === 'abilityActivated')?.presentation).toMatchObject({
      kind: 'teleport_resource_confirmed',
      playerId: 'player_A',
      outcome: 'full',
      to: { z: 9_000 },
    });
    expect(validateServerMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: 'reliableEventBatch',
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      matchId: 'match_worker_projection',
      events,
    })).toMatchObject({ ok: true });
  });

  it('projects teleport rejection distinctly without a cooldown-start consequence', () => {
    const inputs = reliableCombatEvents(tick({
      combatEvents: [],
      hitscanResults: [],
      impulseGrenadeEvents: [],
      abilityResourceEvents: [{
        kind: 'teleport_resource_rejected',
        eventId: 'ability_resource.player_A.1.teleport.rejected',
        authorityTick: 81,
        playerId: 'player_A',
        abilityId: 'vertical_teleport_v1',
        reason: 'blocked',
        cooldownTicksRemaining: 0,
        cooldownConsumedByFailure: false,
      }],
    }));
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      kind: 'abilityRejected',
      presentation: {
        schemaVersion: 1,
        kind: 'teleport_resource_rejected',
        reason: 'blocked',
        cooldownConsumedByFailure: false,
      },
    });
  });

  it('retains the complete Impulse Grenade lifecycle through the reliable store', () => {
    const inputs = reliableCombatEvents(tick({
      combatEvents: [],
      hitscanResults: [],
      impulseGrenadeEvents: [
        {
          kind: 'impulse_grenade_throw_accepted',
          eventId: 'grenade.spawn.1',
          authorityTick: 90,
          playerId: 'player_A',
          abilityId: 'vertical_impulse_grenade_v1',
          throwOrdinal: 1,
          projectileId: 'grenade.projectile.1',
          cooldownEndsAtTick: 330,
        },
        {
          kind: 'impulse_grenade_collision',
          eventId: 'grenade.collision.1',
          authorityTick: 91,
          projectileId: 'grenade.projectile.1',
          ownerPlayerId: 'player_A',
          colliderId: 'player.collider.B',
          layer: 'player_body',
          playerId: 'player_B',
          timeOfImpactPermille: 500,
          bounceCount: 1,
          fuseStartedAtTick: 91,
          detonatesAtTick: 121,
          settled: false,
        },
        {
          kind: 'impulse_grenade_detonated',
          eventId: 'grenade.detonation.1',
          authorityTick: 121,
          projectileId: 'grenade.projectile.1',
          ownerPlayerId: 'player_A',
          ownerTeamId: 'team_blue',
          reason: 'fuse',
          positionMillimeters: { x: 0, y: 1_000, z: 3_000 },
          areaRadiusMillimeters: 11_000,
          damageHealthPoints: 0,
        },
        {
          kind: 'impulse_grenade_impulse_applied',
          eventId: 'grenade.impulse.1',
          authorityTick: 121,
          projectileId: 'grenade.projectile.1',
          ownerPlayerId: 'player_A',
          targetPlayerId: 'player_B',
          relation: 'enemy',
          distanceMillimeters: 3_000,
          falloffPermille: 727,
          requestedImpulseMillimetersPerSecond: { x: 0, y: 2_000, z: 4_500 },
          appliedImpulseMillimetersPerSecond: { x: 0, y: 2_000, z: 4_500 },
          damageHealthPoints: 0,
        },
      ],
      abilityResourceEvents: [],
    }));
    const store = new ReliableEventStore();
    const events = inputs.map((input) => store.append(input));
    expect(events.map(({ kind }) => kind)).toEqual([
      'projectileSpawned',
      'cooldownStarted',
      'projectileCollided',
      'projectileDetonated',
      'impulseApplied',
    ]);
    expect(events.filter(({ presentation }) => presentation !== undefined).map((event) => ({
      reliableKind: event.kind,
      semanticKind: event.presentation?.kind,
    }))).toEqual([
      {
        reliableKind: 'projectileSpawned',
        semanticKind: 'impulse_grenade_throw_accepted',
      },
      {
        reliableKind: 'projectileCollided',
        semanticKind: 'impulse_grenade_collision',
      },
      {
        reliableKind: 'projectileDetonated',
        semanticKind: 'impulse_grenade_detonated',
      },
      {
        reliableKind: 'impulseApplied',
        semanticKind: 'impulse_grenade_impulse_applied',
      },
    ]);
    expect(validateServerMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: 'reliableEventBatch',
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      matchId: 'match_worker_grenade_projection',
      events,
    })).toMatchObject({ ok: true });
  });
});
