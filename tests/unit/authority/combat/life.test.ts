import { describe, expect, it } from 'vitest';

import {
  applyAuthoritativeDamage,
  applyAuthoritativeDamageBatch,
  applyAuthoritativeRespawn,
  assertCombatLifeRules,
  createCombatLifeState,
  endSpawnProtectionOnAcceptedOffense,
  G4_COMBAT_SLICE_LIFE_RULES,
  type AuthoritativeDamageRequest,
  type CombatLifeRulesV1,
  type CombatLifeState,
} from '../../../../src/authority';

const unprotectedRules: CombatLifeRulesV1 = Object.freeze({
  ...G4_COMBAT_SLICE_LIFE_RULES,
  maximumShieldPoints: 25,
  spawnProtectionTicks: 0,
});

function life(
  playerId: string,
  teamId: string | null = null,
  rules: CombatLifeRulesV1 = unprotectedRules,
): CombatLifeState {
  return createCombatLifeState({
    playerId,
    teamId,
    authorityTick: 0,
    authoritySpawnId: `spawn_${playerId}`,
  }, rules);
}

function damage(
  targetPlayerId: string,
  sourcePlayerId: string | null,
  damagePoints: number,
  overrides: Partial<AuthoritativeDamageRequest> = {},
): AuthoritativeDamageRequest {
  return {
    eventSequence: 1,
    authorityTick: 20,
    targetPlayerId,
    sourcePlayerId,
    sourceTeamId: null,
    damagePoints,
    causeId: 'weapon.auto_rifle',
    ...overrides,
  };
}

describe('authoritative combat life and damage service', () => {
  it('applies shield-first overflow without mutating the prior state', () => {
    const initial = life('player_target');
    const result = applyAuthoritativeDamage(
      initial,
      damage('player_target', 'player_attacker', 40),
      unprotectedRules,
    );
    if (!result.accepted) throw new Error('expected damage to be accepted');

    expect(result).toMatchObject({
      accepted: true,
      state: {
        phase: 'alive',
        shieldPoints: 0,
        healthPoints: 85,
      },
      damage: {
        shieldDamagePoints: 25,
        healthDamagePoints: 15,
        shieldPointsAfter: 0,
        healthPointsAfter: 85,
      },
      death: null,
    });
    expect(initial).toMatchObject({ healthPoints: 100, shieldPoints: 25 });
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(Object.isFrozen(result.damage)).toBe(true);
  });

  it('fails closed for spawn protection, self damage, and same-team damage', () => {
    const protectedState = createCombatLifeState({
      playerId: 'player_target',
      teamId: 'team_blue',
      authorityTick: 10,
      authoritySpawnId: 'spawn_blue_a',
    });
    expect(applyAuthoritativeDamage(
      protectedState,
      damage('player_target', 'player_enemy', 10, {
        authorityTick: 29,
        sourceTeamId: 'team_red',
      }),
    )).toMatchObject({ accepted: false, reason: 'spawn_protected', state: protectedState });

    const unprotected = life('player_target', 'team_blue');
    expect(applyAuthoritativeDamage(
      unprotected,
      damage('player_target', 'player_target', 10, { sourceTeamId: 'team_blue' }),
      unprotectedRules,
    )).toMatchObject({ accepted: false, reason: 'self_damage_blocked' });
    expect(applyAuthoritativeDamage(
      unprotected,
      damage('player_target', 'player_teammate', 10, { sourceTeamId: 'team_blue' }),
      unprotectedRules,
    )).toMatchObject({ accepted: false, reason: 'friendly_fire_blocked' });
  });

  it('orders a simultaneous batch by server sequence and emits one death transition', () => {
    const target = life('player_target');
    const first = damage('player_target', 'player_assist', 35, {
      eventSequence: 40,
      authorityTick: 50,
    });
    const lethal = damage('player_target', 'player_killer', 90, {
      eventSequence: 41,
      authorityTick: 50,
    });
    const afterDeath = damage('player_target', 'player_late', 10, {
      eventSequence: 42,
      authorityTick: 50,
    });

    const result = applyAuthoritativeDamageBatch(
      [target],
      [afterDeath, lethal, first],
      unprotectedRules,
    );
    expect(result.results.map((entry) => (
      entry.accepted ? entry.damage.eventId : entry.reason
    ))).toEqual(['combat.damage.40', 'combat.damage.41', 'already_dead']);
    const lethalResult = result.results[1];
    expect(lethalResult).toMatchObject({
      accepted: true,
      state: {
        phase: 'dead',
        healthPoints: 0,
        deathOrdinal: 1,
        respawnEligibleAtTick: 210,
        lastDiscontinuity: { sequence: 2, authorityTick: 50, reason: 'death' },
      },
      death: {
        killerPlayerId: 'player_killer',
        assistPlayerIds: ['player_assist'],
        deathOrdinal: 1,
        respawnEligibleAtTick: 210,
        discontinuitySequence: 2,
      },
    });
    expect(result.states[0]).toBe(lethalResult.state);
  });

  it('rejects a replayed server event sequence and never increments death twice', () => {
    const initial = life('player_target');
    const request = damage('player_target', 'player_attacker', 1_000, {
      eventSequence: 7,
    });
    const first = applyAuthoritativeDamage(initial, request, unprotectedRules);
    if (!first.accepted) throw new Error('expected first damage to be accepted');
    const duplicate = applyAuthoritativeDamage(first.state, request, unprotectedRules);
    expect(duplicate).toEqual({
      accepted: false,
      state: first.state,
      reason: 'stale_event_sequence',
    });
    expect(first.state.deathOrdinal).toBe(1);
  });

  it('allows respawn only at the authority tick and with an authority-resolved spawn', () => {
    const initial = life('player_target');
    const killed = applyAuthoritativeDamage(
      initial,
      damage('player_target', 'player_attacker', 1_000, {
        eventSequence: 9,
        authorityTick: 100,
      }),
      unprotectedRules,
    );
    if (!killed.accepted) throw new Error('expected lethal damage');
    expect(applyAuthoritativeRespawn(killed.state, {
      eventSequence: 10,
      authorityTick: 259,
      authoritySpawnId: 'spawn_server_selected',
      resolvedBy: 'authority_spawn_resolver',
    }, unprotectedRules)).toMatchObject({ accepted: false, reason: 'respawn_not_ready' });
    expect(() => applyAuthoritativeRespawn(killed.state, {
      eventSequence: 10,
      authorityTick: 260,
      authoritySpawnId: 'spawn_server_selected',
      resolvedBy: 'authority_spawn_resolver',
      clientPosition: { x: 999_999, y: 999_999, z: 999_999 },
    } as never, unprotectedRules)).toThrow(/unsupported or missing fields/u);

    const respawned = applyAuthoritativeRespawn(killed.state, {
      eventSequence: 10,
      authorityTick: 260,
      authoritySpawnId: 'spawn_server_selected',
      resolvedBy: 'authority_spawn_resolver',
    }, unprotectedRules);
    expect(respawned).toMatchObject({
      accepted: true,
      state: {
        phase: 'alive',
        healthPoints: 100,
        shieldPoints: 25,
        spawnOrdinal: 2,
        deathOrdinal: 1,
        lastSpawnId: 'spawn_server_selected',
        respawnEligibleAtTick: null,
        lastDiscontinuity: { sequence: 3, authorityTick: 260, reason: 'respawn' },
      },
      event: {
        kind: 'respawn',
        eventId: 'combat.respawn.10',
        eventSequence: 10,
        authoritySpawnId: 'spawn_server_selected',
        discontinuitySequence: 3,
      },
    });
    if (!respawned.accepted) throw new Error('expected authority respawn');
    expect(applyAuthoritativeDamage(
      respawned.state,
      damage('player_target', 'player_attacker', 10, {
        eventSequence: 9,
        authorityTick: 261,
      }),
      unprotectedRules,
    )).toMatchObject({ accepted: false, reason: 'stale_event_sequence' });
  });

  it('expires old assist credit and permits damage exactly at the protection boundary', () => {
    const protectedState = createCombatLifeState({
      playerId: 'player_target',
      teamId: null,
      authorityTick: 10,
      authoritySpawnId: 'spawn_boundary',
    });
    const atBoundary = applyAuthoritativeDamage(
      protectedState,
      damage('player_target', 'player_old_attacker', 30, {
        eventSequence: 1,
        authorityTick: 30,
      }),
    );
    expect(atBoundary).toMatchObject({ accepted: true, state: { healthPoints: 70 } });
    if (!atBoundary.accepted) throw new Error('expected boundary damage');

    const lethal = applyAuthoritativeDamage(
      atBoundary.state,
      damage('player_target', 'player_killer', 100, {
        eventSequence: 2,
        authorityTick: 231,
      }),
    );
    expect(lethal).toMatchObject({
      accepted: true,
      death: {
        killerPlayerId: 'player_killer',
        assistPlayerIds: [],
      },
    });
  });

  it('ends protection immediately after a server-accepted offensive action', () => {
    const protectedState = createCombatLifeState({
      playerId: 'player_target',
      teamId: null,
      authorityTick: 10,
      authoritySpawnId: 'spawn_offense_break',
    });
    const ended = endSpawnProtectionOnAcceptedOffense(protectedState, 15);
    expect(ended).not.toBe(protectedState);
    expect(ended.protectedUntilTickExclusive).toBe(15);
    expect(applyAuthoritativeDamage(
      ended,
      damage('player_target', 'player_enemy', 10, {
        eventSequence: 1,
        authorityTick: 15,
      }),
    )).toMatchObject({ accepted: true, state: { healthPoints: 90 } });
    expect(endSpawnProtectionOnAcceptedOffense(ended, 16)).toBe(ended);
  });

  it('supports explicitly enabled self/team policy variants without silent defaults', () => {
    const permissiveRules: CombatLifeRulesV1 = Object.freeze({
      ...unprotectedRules,
      friendlyFireEnabled: true,
      selfDamageEnabled: true,
    });
    const initial = life('player_target', 'team_blue', permissiveRules);
    const friendly = applyAuthoritativeDamage(
      initial,
      damage('player_target', 'player_teammate', 10, {
        eventSequence: 1,
        sourceTeamId: 'team_blue',
      }),
      permissiveRules,
    );
    expect(friendly).toMatchObject({ accepted: true, state: { shieldPoints: 15, healthPoints: 100 } });
    if (!friendly.accepted) throw new Error('expected friendly damage under explicit policy');
    expect(applyAuthoritativeDamage(
      friendly.state,
      damage('player_target', 'player_target', 10, {
        eventSequence: 2,
        sourceTeamId: 'team_blue',
      }),
      permissiveRules,
    )).toMatchObject({ accepted: true, state: { shieldPoints: 5, healthPoints: 100 } });
  });

  it('rejects ambiguous batches and invalid or unresolved policy values', () => {
    expect(() => applyAuthoritativeDamageBatch(
      [life('player_target')],
      [
        damage('player_target', 'player_a', 1, { eventSequence: 3 }),
        damage('player_target', 'player_b', 1, { eventSequence: 3 }),
      ],
      unprotectedRules,
    )).toThrow(/duplicate batch damage event sequence 3/u);

    expect(() => assertCombatLifeRules({
      ...G4_COMBAT_SLICE_LIFE_RULES,
      regeneration: { enabled: true },
    } as never)).toThrow(/regeneration must remain explicitly disabled/u);
    expect(() => applyAuthoritativeDamage(
      life('player_target'),
      {
        ...damage('player_target', 'player_attacker', 10),
        claimedKill: true,
      } as never,
      unprotectedRules,
    )).toThrow(/unsupported or missing fields/u);
    expect(() => createCombatLifeState({
      playerId: 'player_tick_overflow',
      teamId: null,
      authorityTick: Number.MAX_SAFE_INTEGER,
      authoritySpawnId: 'spawn_overflow',
    })).toThrow(/exceeds the safe tick range/u);
  });
});
