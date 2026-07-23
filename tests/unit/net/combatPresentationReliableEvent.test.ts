import { describe, expect, it } from 'vitest';

import {
  PROTOCOL_VERSION,
  RELIABLE_EVENT_STREAM_VERSION,
  validateServerMessage,
} from '../../../src/net';

function batch(event: Record<string, unknown>) {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'reliableEventBatch',
    reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
    matchId: 'match_wire',
    events: [event],
  };
}

const legacyDamage = Object.freeze({
  id: 'event.1',
  serverTick: 44,
  kind: 'damageApplied',
  subjectId: 'combat.damage.1',
  actorId: 'player_A',
  targetId: 'player_B',
  amountHealthPoints: 10,
});

const explicitDamage = Object.freeze({
  ...legacyDamage,
  presentation: Object.freeze({
    schemaVersion: 1,
    kind: 'damage_applied',
    eventId: 'combat.damage.1',
    eventSequence: 1,
    authorityTick: 44,
    causeId: 'vertical_rifle_v1',
    sourcePlayerId: 'player_A',
    targetPlayerId: 'player_B',
    shieldDamagePoints: 0,
    healthDamagePoints: 10,
    shieldPointsAfter: 0,
    healthPointsAfter: 90,
  }),
});

describe('versioned reliable combat presentation payload', () => {
  it('preserves legacy version-1 reliable events with no presentation payload', () => {
    expect(validateServerMessage(batch(legacyDamage))).toMatchObject({ ok: true });
  });

  it('accepts exact explicit damage and teleport authority semantics', () => {
    expect(validateServerMessage(batch(explicitDamage))).toMatchObject({ ok: true });
    expect(validateServerMessage(batch({
      id: 'event.2',
      serverTick: 45,
      kind: 'abilityActivated',
      subjectId: 'ability_resource.player_A.0.teleport.0',
      actorId: 'player_A',
      targetId: null,
      amountHealthPoints: null,
      presentation: {
        schemaVersion: 1,
        kind: 'teleport_resource_confirmed',
        eventId: 'ability_resource.player_A.0.teleport.0',
        authorityTick: 45,
        playerId: 'player_A',
        abilityId: 'vertical_teleport_v1',
        outcome: 'partial',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 0, y: 0, z: 8_400 },
        cooldownTicksRemaining: 160,
        weaponRecoveryTicks: 0,
        combatStatePolicy: 'preserve_existing_combat_state',
      },
    }))).toMatchObject({ ok: true });
  });

  it.each([
    ['unknown nested field', {
      ...explicitDamage,
      presentation: { ...explicitDamage.presentation, claimedKill: true },
    }],
    ['future nested schema', {
      ...explicitDamage,
      presentation: { ...explicitDamage.presentation, schemaVersion: 2 },
    }],
    ['mismatched authority tick', {
      ...explicitDamage,
      presentation: { ...explicitDamage.presentation, authorityTick: 45 },
    }],
    ['wrong reliable projection kind', {
      ...explicitDamage,
      kind: 'abilityActivated',
      amountHealthPoints: null,
    }],
    ['unknown semantic kind', {
      ...explicitDamage,
      presentation: { ...explicitDamage.presentation, kind: 'kill_claimed_by_client' },
    }],
  ])('rejects %s fail closed', (_label, event) => {
    expect(validateServerMessage(batch(event))).toMatchObject({ ok: false });
  });
});
