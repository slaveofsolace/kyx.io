import { describe, expect, it } from 'vitest';

import {
  AuthoritativeRoom,
  G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID,
  G4_COMBAT_ROOM_PROFILE_ID,
  G4_COMBAT_RULESET_HASH,
  G4_COMBAT_RULESET_ID,
  G4_COMBAT_RULESET_REVISION,
  G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
  G4_TDM_MATCH_ROOM_CAPABILITY_ID,
  IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
  type AuthorityImpulseGrenadeWorldPort,
  type AuthorityRoomOptions,
  type AuthorityTeamResolver,
} from '../../../../src/authority';
import { hashRulesetContent, requireRuleset } from '../../../../src/content';
import { PROTOCOL_VERSION, type InputBatchMessage } from '../../../../src/net';
import { PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../../../src/sim';
import { FakeMovementQueryPort } from '../../sim/movement/fakeQueryPort';

function grenadeWorld(): AuthorityImpulseGrenadeWorldPort {
  return {
    schemaVersion: IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
    sweepSphere: () => ({ schemaVersion: 1, contacts: [] }),
    traceRadialOcclusion: () => ({ schemaVersion: 1, kind: 'clear' }),
    resolveCollisionSafeImpulse: (request) => ({
      schemaVersion: 1,
      appliedImpulseMillimetersPerSecond: request.requestedImpulseMillimetersPerSecond,
    }),
  };
}

function roomOptions(options: {
  readonly match?: boolean;
  readonly warmupTicks?: number;
  readonly activeTicks?: number;
  readonly postmatchTicks?: number;
  readonly teamResolver?: AuthorityTeamResolver;
} = {}): AuthorityRoomOptions {
  const content = requireRuleset(G4_COMBAT_RULESET_ID, G4_COMBAT_RULESET_REVISION);
  expect(hashRulesetContent(content)).toBe(G4_COMBAT_RULESET_HASH);
  return {
    identity: {
      roomId: 'room_TDM',
      matchId: 'match_TDM',
      rulesetId: G4_COMBAT_RULESET_ID,
      rulesetRevision: G4_COMBAT_RULESET_REVISION,
      rulesetHash: G4_COMBAT_RULESET_HASH,
      mapId: 'inkfall_foundry',
      fixtureId: 'inkfall_authority',
      fixtureHash: '2a0a446a0b152395',
      physicsAdapterId: 'fake_query_port',
      physicsAdapterVersion: '1.0.0',
    },
    profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
    queries: new FakeMovementQueryPort(),
    maximumPlayers: 64,
    warmupTicks: options.warmupTicks ?? 40,
    activeTicks: options.activeTicks ?? 9_600,
    postmatchTicks: options.postmatchTicks ?? 200,
    reconnectGraceTicks: 200,
    minimumConnectedPlayersToStart: 2,
    spawnResolver: (playerId, ordinal) => ({
      spawnId: `spawn_authority_${playerId}`,
      feetPosition: { x: ordinal * 1_000, y: 0, z: 0 },
      yawMilliDegrees: ordinal === 0 ? 0 : 180_000,
    }),
    combat: {
      profileId: G4_COMBAT_ROOM_PROFILE_ID,
      teamResolver: options.teamResolver ?? ((playerId) => (
        playerId === 'player_A' || playerId === 'player_C' ? 'team_blue' : 'team_red'
      )),
      impulseGrenade: {
        capabilityId: G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
        world: grenadeWorld(),
      },
      abilityResources: {
        capabilityId: G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID,
      },
      ...(options.match === false
        ? {}
        : { match: { capabilityId: G4_TDM_MATCH_ROOM_CAPABILITY_ID } }),
    },
  };
}

function room(options: Parameters<typeof roomOptions>[0] = {}): AuthoritativeRoom {
  return new AuthoritativeRoom(roomOptions(options));
}

function join(authority: AuthoritativeRoom, suffix: string): void {
  expect(authority.joinNewPlayer({
    playerId: `player_${suffix}`,
    connectionId: `connection_${suffix}`,
  })).toMatchObject({ ok: true, connectionMode: 'joined' });
}

function start(authority: AuthoritativeRoom): void {
  join(authority, 'A');
  join(authority, 'B');
  expect(authority.startMatch()).toBe(true);
}

function advanceTo(authority: AuthoritativeRoom, targetTick: number): void {
  while (authority.serverTick < targetTick) authority.advanceOneTick();
}

function emptyBatch(sequence: number): InputBatchMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'inputBatch',
    commands: [{
      type: 'input',
      sequence,
      clientTick: sequence,
      moveX: 0,
      moveY: 0,
      lookYawDeltaMilliDegrees: 0,
      lookPitchDeltaMilliDegrees: 0,
      heldButtons: 0,
      pressedButtons: 0,
      releasedButtons: 0,
      selectedSlot: 0,
    }],
  };
}

describe('P5.6 exact authoritative room TDM integration', () => {
  it('preserves prior rooms and rejects a non-exact or incomplete nested capability', () => {
    const prior = room({ match: false });
    start(prior);
    expect(prior.fullSnapshot().match).toBeUndefined();
    expect(prior.advanceOneTick().matchEvents).toBeUndefined();

    const base = roomOptions();
    expect(() => new AuthoritativeRoom({
      ...base,
      combat: {
        ...base.combat,
        match: { capabilityId: 'client_match' },
      },
    } as never)).toThrow(/capability is unsupported/u);
    expect(() => new AuthoritativeRoom({
      ...base,
      combat: {
        ...base.combat,
        match: {
          capabilityId: G4_TDM_MATCH_ROOM_CAPABILITY_ID,
          claimedScoreLimit: 1,
        },
      },
    } as never)).toThrow(/unsupported or missing fields/u);
    expect(() => new AuthoritativeRoom({
      ...base,
      combat: {
        ...base.combat,
        abilityResources: undefined,
      },
    } as never)).toThrow(/requires the exact P5.5 ability resource capability/u);
    expect(() => new AuthoritativeRoom(roomOptions({ activeTicks: 9_599 }))).toThrow(
      /exact revision 3 match durations/u,
    );
    const noTeam = room({ teamResolver: () => null });
    expect(() => join(noTeam, 'A')).toThrow(/authority-owned team id/u);
    expect(noTeam.fullSnapshot().players).toEqual([]);
  });

  it('publishes exact timer state and synchronizes warmup-to-active after the boundary tick', () => {
    const authority = room();
    start(authority);
    expect(authority.fullSnapshot()).toMatchObject({
      lifecycle: 'warmup',
      phaseEndsAtTick: 40,
      match: {
        phase: 'warmup',
        phaseEndsAtTick: 40,
        phaseTicksRemaining: 40,
        activeTicksRemaining: 9_600,
        teamScores: [
          { teamId: 'team_blue', score: 0 },
          { teamId: 'team_red', score: 0 },
        ],
      },
    });
    const first = authority.advanceOneTick();
    expect(first.matchEvents).toEqual([expect.objectContaining({
      kind: 'match_phase_changed',
      eventId: 'match.phase.match_TDM.warmup.0',
      reason: 'match_started',
    })]);
    advanceTo(authority, 39);
    expect(authority.fullSnapshot().match).toMatchObject({
      phase: 'warmup',
      phaseTicksRemaining: 1,
      activeTicksRemaining: 9_600,
    });
    const active = authority.advanceOneTick();
    expect(active).toMatchObject({
      serverTick: 40,
      lifecycle: 'active',
      lifecycleTransitions: ['active'],
      matchEvents: [expect.objectContaining({
        kind: 'match_phase_changed',
        reason: 'warmup_elapsed',
      })],
    });
    expect(authority.fullSnapshot()).toMatchObject({
      lifecycle: 'active',
      phaseEndsAtTick: 9_640,
      match: {
        authorityTick: 40,
        phase: 'active',
        phaseEndsAtTick: 9_640,
        activeTicksRemaining: 9_600,
      },
    });
  });

  it('derives one ordered score/feed transition from an accepted room death only', () => {
    const authority = room();
    start(authority);
    advanceTo(authority, 40);
    const lethal = authority.applyCombatDamage({
      targetPlayerId: 'player_B',
      sourcePlayerId: 'player_A',
      damagePoints: 100,
      causeId: 'weapon.room_test',
    });
    expect(lethal.accepted).toBe(true);
    if (!lethal.accepted) return;
    expect(lethal.matchEvents?.map(({ kind }) => kind)).toEqual([
      'damage_applied',
      'death',
      'team_score_changed',
      'kill_feed_entry',
    ]);
    expect(lethal.matchEvents?.map(({ eventId }) => eventId)).toEqual([
      'combat.damage.0',
      'combat.death.0',
      'match.score.match_TDM.0',
      'match.feed.match_TDM.1',
    ]);
    expect(authority.fullSnapshot().match).toMatchObject({
      lastProcessedCombatEventSequence: 0,
      teamScores: [
        { teamId: 'team_blue', score: 1 },
        { teamId: 'team_red', score: 0 },
      ],
      playerScores: [
        { playerId: 'player_A', kills: 1, deaths: 0, assists: 0 },
        { playerId: 'player_B', kills: 0, deaths: 1, assists: 0 },
      ],
      feedSequence: 1,
      feed: [expect.objectContaining({
        killerPlayerId: 'player_A',
        victimPlayerId: 'player_B',
        causeId: 'weapon.room_test',
        scoredTeamId: 'team_blue',
      })],
    });

    const duplicateDeath = authority.applyCombatDamage({
      targetPlayerId: 'player_B',
      sourcePlayerId: 'player_A',
      damagePoints: 100,
      causeId: 'weapon.room_test_duplicate',
    });
    expect(duplicateDeath).toMatchObject({ accepted: false, reason: 'already_dead' });
    expect(authority.fullSnapshot().match).toMatchObject({
      teamScores: [{ score: 1 }, { score: 0 }],
      feedSequence: 1,
    });
  });

  it('keeps warmup deaths outside score/feed and records an authority respawn exactly once', () => {
    const authority = room();
    start(authority);
    advanceTo(authority, 20);
    const warmupDeath = authority.applyCombatDamage({
      targetPlayerId: 'player_B',
      sourcePlayerId: 'player_A',
      damagePoints: 100,
      causeId: 'weapon.warmup_test',
    });
    expect(warmupDeath.accepted).toBe(true);
    if (!warmupDeath.accepted) return;
    expect(warmupDeath.matchEvents?.map(({ kind }) => kind)).toEqual([
      'damage_applied',
      'death',
    ]);
    expect(authority.fullSnapshot().match).toMatchObject({
      teamScores: [{ score: 0 }, { score: 0 }],
      playerScores: [{ kills: 0, deaths: 0 }, { kills: 0, deaths: 0 }],
      feedSequence: 0,
      feed: [],
    });
    advanceTo(authority, 180);
    const respawn = authority.respawnCombatPlayer('player_B');
    expect(respawn.accepted).toBe(true);
    if (!respawn.accepted) return;
    expect(respawn.matchEvents).toEqual([expect.objectContaining({
      kind: 'respawn',
      eventId: 'combat.respawn.1',
      authorityTick: 180,
      playerId: 'player_B',
    })]);
    expect(authority.fullSnapshot().match).toMatchObject({
      lastProcessedCombatEventSequence: 1,
      teamScores: [{ score: 0 }, { score: 0 }],
      feedSequence: 0,
    });
    expect(authority.respawnCombatPlayer('player_B')).toMatchObject({
      accepted: false,
      reason: 'already_alive',
    });
  });

  it('gives reconnect the current immutable match state without replaying score/feed', () => {
    const authority = room();
    start(authority);
    advanceTo(authority, 40);
    expect(authority.applyCombatDamage({
      targetPlayerId: 'player_B',
      sourcePlayerId: 'player_A',
      damagePoints: 100,
      causeId: 'weapon.reconnect_test',
    })).toMatchObject({ accepted: true });
    expect(authority.disconnectConnection('connection_A')).toBe(true);
    const resumed = authority.resumePlayer({
      playerId: 'player_A',
      connectionId: 'connection_A2',
    });
    expect(resumed).toMatchObject({
      ok: true,
      connectionMode: 'resumed',
      snapshot: {
        match: {
          authorityTick: 40,
          phase: 'active',
          lastProcessedCombatEventSequence: 0,
          teamScores: [{ teamId: 'team_blue', score: 1 }, { teamId: 'team_red', score: 0 }],
          feedSequence: 1,
          feed: [expect.objectContaining({ eventId: 'match.feed.match_TDM.1' })],
        },
      },
    });
    if (!resumed.ok) return;
    expect(Object.isFrozen(resumed.snapshot.match)).toBe(true);
    const next = authority.advanceOneTick();
    expect(next.matchEvents).toEqual([]);
    expect(authority.fullSnapshot().match).toMatchObject({
      teamScores: [{ score: 1 }, { score: 0 }],
      feedSequence: 1,
    });
  });

  it('keeps an empty active TDM authoritative until completion, then permits expiry', () => {
    const authority = room();
    start(authority);
    advanceTo(authority, 40);

    expect(authority.leavePlayer('player_A')).toBe(true);
    expect(authority.leavePlayer('player_B')).toBe(true);
    expect(authority.fullSnapshot()).toMatchObject({
      lifecycle: 'active',
      players: [],
      match: {
        phase: 'active',
        authorityTick: 40,
        activeTicksRemaining: 9_600,
      },
    });
    expect(authority.expire()).toBe(false);

    advanceTo(authority, 9_640);
    expect(authority.fullSnapshot()).toMatchObject({
      lifecycle: 'postmatch',
      phaseEndsAtTick: 9_840,
      match: {
        phase: 'postmatch',
        result: { reason: 'time_limit', draw: true },
      },
    });
    expect(authority.expire()).toBe(false);

    advanceTo(authority, 9_839);
    const completed = authority.advanceOneTick();
    expect(completed).toMatchObject({
      serverTick: 9_840,
      lifecycle: 'idle',
      lifecycleTransitions: ['idle'],
      matchEvents: [expect.objectContaining({
        kind: 'match_phase_changed',
        reason: 'postmatch_elapsed',
      })],
    });
    expect(authority.fullSnapshot()).toMatchObject({
      lifecycle: 'idle',
      players: [],
      match: { phase: 'completed', result: { reason: 'time_limit', draw: true } },
    });
    expect(authority.expire()).toBe(true);
    expect(authority.fullSnapshot()).toMatchObject({
      lifecycle: 'expired',
      match: { phase: 'completed' },
    });
  });

  it('ends the room on the exact fortieth score and rejects client-authored score claims', () => {
    const authority = room();
    join(authority, 'A');
    for (let index = 0; index < 40; index += 1) {
      join(authority, `R${index.toString().padStart(2, '0')}`);
    }
    expect(authority.startMatch()).toBe(true);
    advanceTo(authority, 40);
    let lastKinds: string[] = [];
    for (let index = 0; index < 40; index += 1) {
      const victimId = `player_R${index.toString().padStart(2, '0')}`;
      const result = authority.applyCombatDamage({
        targetPlayerId: victimId,
        sourcePlayerId: 'player_A',
        damagePoints: 100,
        causeId: `weapon.limit_test_${index}`,
      });
      expect(result.accepted).toBe(true);
      if (!result.accepted) return;
      lastKinds = result.matchEvents?.map(({ kind }) => kind) ?? [];
    }
    expect(lastKinds).toEqual([
      'damage_applied',
      'death',
      'team_score_changed',
      'kill_feed_entry',
      'match_phase_changed',
      'match_result',
    ]);
    expect(authority.fullSnapshot()).toMatchObject({
      lifecycle: 'postmatch',
      phaseEndsAtTick: 240,
      match: {
        phase: 'postmatch',
        phaseEndsAtTick: 240,
        teamScores: [{ teamId: 'team_blue', score: 40 }, { teamId: 'team_red', score: 0 }],
        feedSequence: 40,
        result: { reason: 'score_limit', winningTeamId: 'team_blue', draw: false },
      },
    });
    expect(() => authority.applyCombatDamage({
      targetPlayerId: 'player_R00',
      sourcePlayerId: 'player_A',
      damagePoints: 100,
      causeId: 'weapon.after_result',
    })).toThrow('AUTHORITY_COMBAT_PHASE_REJECTED');

    const forged = room();
    start(forged);
    expect(() => forged.applyCombatDamage({
      targetPlayerId: 'player_B',
      sourcePlayerId: 'player_A',
      damagePoints: 100,
      causeId: 'weapon.forged',
      claimedTeamScore: 40,
    } as never)).toThrow(/unsupported or missing fields/u);
    expect(() => forged.enqueueInputBatch('connection_A', {
      ...emptyBatch(0),
      commands: [{ ...emptyBatch(0).commands[0], claimedKill: 'player_B', claimedScore: 40 }],
    })).toThrow('AUTHORITY_INPUT_BATCH_INVALID');
  });
});
