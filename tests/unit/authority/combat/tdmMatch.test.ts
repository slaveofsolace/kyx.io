import { describe, expect, it } from 'vitest';

import {
  advanceAuthorityTdmMatch,
  applyAuthoritativeDamage,
  applyAuthoritativeRespawn,
  createAuthorityTdmMatchState,
  createCombatLifeState,
  G4_COMBAT_SLICE_LIFE_RULES,
  G4_TDM_MATCH_RULES,
  KYX_FFA_MATCH_RULES,
  recordAuthorityTdmCombat,
  recordAuthorityTdmRespawn,
  registerAuthorityTdmPlayer,
  settleAuthorityTdmMatchTick,
  startAuthorityTdmMatch,
  type AuthorityTdmMatchStateV1,
  type AuthorityTdmMatchRulesV1,
  type CombatLifeState,
} from '../../../../src/authority/combat';

function register(
  state: AuthorityTdmMatchStateV1,
  playerId: string,
  teamId: string,
): AuthorityTdmMatchStateV1 {
  return registerAuthorityTdmPlayer(state, {
    schemaVersion: 1,
    authorityTick: state.authorityTick,
    playerId,
    teamId,
  });
}

function createMatch(
  players: readonly (readonly [string, string])[],
  rules: AuthorityTdmMatchRulesV1 = G4_TDM_MATCH_RULES,
): AuthorityTdmMatchStateV1 {
  let state = createAuthorityTdmMatchState({
    schemaVersion: 1,
    matchId: 'match_TDM',
    authorityTick: 0,
  }, rules);
  for (const [playerId, teamId] of players) state = register(state, playerId, teamId);
  return state;
}

function startActive(state: AuthorityTdmMatchStateV1): AuthorityTdmMatchStateV1 {
  let next = startAuthorityTdmMatch(state, state.authorityTick).state;
  while (next.authorityTick < 40) {
    next = advanceAuthorityTdmMatch(next, next.authorityTick + 1).state;
  }
  return next;
}

function advanceTo(
  state: AuthorityTdmMatchStateV1,
  authorityTick: number,
): AuthorityTdmMatchStateV1 {
  let next = state;
  while (next.authorityTick < authorityTick) {
    next = advanceAuthorityTdmMatch(next, next.authorityTick + 1).state;
  }
  return next;
}

function life(playerId: string, teamId: string): CombatLifeState {
  return createCombatLifeState({
    playerId,
    teamId,
    authorityTick: 0,
    authoritySpawnId: `spawn_${playerId}`,
  });
}

function damage(
  state: CombatLifeState,
  options: {
    readonly eventSequence: number;
    readonly authorityTick?: number;
    readonly sourcePlayerId: string | null;
    readonly sourceTeamId: string | null;
    readonly damagePoints: number;
    readonly causeId?: string;
  },
) {
  return applyAuthoritativeDamage(state, {
    eventSequence: options.eventSequence,
    authorityTick: options.authorityTick ?? 40,
    targetPlayerId: state.playerId,
    sourcePlayerId: options.sourcePlayerId,
    sourceTeamId: options.sourceTeamId,
    damagePoints: options.damagePoints,
    causeId: options.causeId ?? `weapon.test.${options.eventSequence}`,
  }, G4_COMBAT_SLICE_LIFE_RULES);
}

describe('P5.6 authoritative TDM timer, score, feed, and respawn', () => {
  it('pins the exact revision-3 rules and creates a frozen sorted lobby scoreboard', () => {
    const state = createMatch([
      ['player_Z', 'team_red'],
      ['player_A', 'team_blue'],
    ]);
    expect(G4_TDM_MATCH_RULES).toEqual({
      schemaVersion: 1,
      authorityHz: 20,
      mode: 'team_deathmatch',
      warmupTicks: 40,
      activeTicks: 9_600,
      postmatchTicks: 200,
      teamScoreLimit: 40,
    });
    expect(state).toMatchObject({
      phase: 'lobby',
      activeTicksRemaining: 9_600,
      teamScores: [{ teamId: 'team_blue', score: 0 }, { teamId: 'team_red', score: 0 }],
      playerScores: [{ playerId: 'player_A' }, { playerId: 'player_Z' }],
      feed: [],
      lastProcessedCombatEventSequence: -1,
    });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.playerScores)).toBe(true);

    const started = startAuthorityTdmMatch(state, 0);
    expect(started.events).toEqual([expect.objectContaining({
      kind: 'match_phase_changed',
      eventId: 'match.phase.match_TDM.warmup.0',
      from: 'lobby',
      to: 'warmup',
      reason: 'match_started',
      phaseEndsAtTick: 40,
    })]);
    expect(() => startAuthorityTdmMatch(createMatch([
      ['player_A', 'team_blue'],
      ['player_C', 'team_blue'],
    ]), 0)).toThrow(/at least two authority-owned teams/u);
  });

  it('orders mixed-case and punctuation stable IDs with one ordinal comparator', () => {
    const state = createMatch([
      ['player_a', 'team_a'],
      ['player_B', 'team.B'],
      ['player-A', 'team-A'],
      ['player:a', 'team:a'],
    ]);
    expect(state.teamScores.map(({ teamId }) => teamId)).toEqual([
      'team-A',
      'team.B',
      'team:a',
      'team_a',
    ]);
    expect(state.playerScores.map(({ playerId }) => playerId)).toEqual([
      'player-A',
      'player:a',
      'player_B',
      'player_a',
    ]);
  });

  it('drives warmup, active timer, result, and postmatch only from authority ticks', () => {
    let state = startAuthorityTdmMatch(createMatch([
      ['player_A', 'team_blue'],
      ['player_B', 'team_red'],
    ]), 0).state;
    state = advanceTo(state, 39);
    expect(state).toMatchObject({
      authorityTick: 39,
      phase: 'warmup',
      phaseTicksRemaining: 1,
      activeTicksRemaining: 9_600,
    });
    const active = advanceAuthorityTdmMatch(state, 40);
    expect(active.state).toMatchObject({
      phase: 'active',
      phaseStartedAtTick: 40,
      phaseEndsAtTick: 9_640,
      phaseTicksRemaining: 9_600,
      activeTicksRemaining: 9_600,
    });
    expect(active.events).toEqual([expect.objectContaining({
      kind: 'match_phase_changed',
      reason: 'warmup_elapsed',
    })]);
    state = advanceTo(active.state, 9_639);
    expect(state).toMatchObject({ phase: 'active', activeTicksRemaining: 1 });
    const ended = advanceAuthorityTdmMatch(state, 9_640);
    expect(ended.events.map(({ kind }) => kind)).toEqual([
      'match_phase_changed',
      'match_result',
    ]);
    expect(ended.state).toMatchObject({
      phase: 'postmatch',
      phaseEndsAtTick: 9_840,
      activeTicksRemaining: 0,
      result: {
        reason: 'time_limit',
        winningTeamId: null,
        draw: true,
      },
    });
    const completed = advanceTo(ended.state, 9_840);
    expect(completed).toMatchObject({
      phase: 'completed',
      phaseEndsAtTick: null,
      result: { reason: 'time_limit' },
    });
  });

  it('orders accepted damage, death, score, and feed and derives assists from the life ledger', () => {
    let match = startActive(createMatch([
      ['player_A', 'team_blue'],
      ['player_C', 'team_blue'],
      ['player_B', 'team_red'],
    ]));
    let victim = life('player_B', 'team_red');
    const contributed = damage(victim, {
      eventSequence: 0,
      sourcePlayerId: 'player_C',
      sourceTeamId: 'team_blue',
      damagePoints: 40,
    });
    expect(contributed.accepted).toBe(true);
    if (!contributed.accepted) return;
    victim = contributed.state;
    const recordedContribution = recordAuthorityTdmCombat(match, {
      schemaVersion: 1,
      damage: contributed.damage,
      death: contributed.death,
    });
    expect(recordedContribution.accepted).toBe(true);
    if (!recordedContribution.accepted) return;
    match = recordedContribution.state;
    expect(recordedContribution.events.map(({ kind }) => kind)).toEqual(['damage_applied']);

    const lethal = damage(victim, {
      eventSequence: 1,
      sourcePlayerId: 'player_A',
      sourceTeamId: 'team_blue',
      damagePoints: 60,
    });
    expect(lethal.accepted).toBe(true);
    if (!lethal.accepted || lethal.death === null) return;
    expect(lethal.death.assistPlayerIds).toEqual(['player_C']);
    const recorded = recordAuthorityTdmCombat(match, {
      schemaVersion: 1,
      damage: lethal.damage,
      death: lethal.death,
    });
    expect(recorded.accepted).toBe(true);
    if (!recorded.accepted) return;
    expect(recorded.events.map(({ kind }) => kind)).toEqual([
      'damage_applied',
      'death',
      'team_score_changed',
      'kill_feed_entry',
    ]);
    expect(recorded.events.map(({ eventId }) => eventId)).toEqual([
      'combat.damage.1',
      'combat.death.1',
      'match.score.match_TDM.1',
      'match.feed.match_TDM.1',
    ]);
    expect(recorded.state).toMatchObject({
      teamScores: [{ teamId: 'team_blue', score: 1 }, { teamId: 'team_red', score: 0 }],
      playerScores: [
        { playerId: 'player_A', kills: 1, deaths: 0, assists: 0 },
        { playerId: 'player_B', kills: 0, deaths: 1, assists: 0 },
        { playerId: 'player_C', kills: 0, deaths: 0, assists: 1 },
      ],
      feedSequence: 1,
      feed: [expect.objectContaining({
        causeId: 'weapon.test.1',
        killerPlayerId: 'player_A',
        victimPlayerId: 'player_B',
        assistPlayerIds: ['player_C'],
        scoredTeamId: 'team_blue',
        teamScoreAfter: 1,
      })],
    });
  });

  it('records an active environment death in the feed without awarding a team score', () => {
    const match = startActive(createMatch([
      ['player_A', 'team_blue'],
      ['player_B', 'team_red'],
    ]));
    const lethal = damage(life('player_B', 'team_red'), {
      eventSequence: 0,
      sourcePlayerId: null,
      sourceTeamId: null,
      damagePoints: 100,
      causeId: 'world.kill_volume',
    });
    expect(lethal.accepted).toBe(true);
    if (!lethal.accepted || lethal.death === null) return;
    const recorded = recordAuthorityTdmCombat(match, {
      schemaVersion: 1,
      damage: lethal.damage,
      death: lethal.death,
    });
    expect(recorded.accepted).toBe(true);
    if (!recorded.accepted) return;
    expect(recorded.events.map(({ kind }) => kind)).toEqual([
      'damage_applied',
      'death',
      'kill_feed_entry',
    ]);
    expect(recorded.state).toMatchObject({
      teamScores: [{ score: 0 }, { score: 0 }],
      playerScores: [
        { playerId: 'player_A', kills: 0, deaths: 0 },
        { playerId: 'player_B', kills: 0, deaths: 1 },
      ],
      feed: [expect.objectContaining({
        killerPlayerId: null,
        scoredTeamId: null,
        teamScoreAfter: null,
      })],
    });
  });

  it('does not turn a warmup death into score, statistics, or feed', () => {
    const match = startAuthorityTdmMatch(createMatch([
      ['player_A', 'team_blue'],
      ['player_B', 'team_red'],
    ]), 0).state;
    const matchAt20 = advanceTo(match, 20);
    const lethal = damage(life('player_B', 'team_red'), {
      eventSequence: 0,
      authorityTick: 20,
      sourcePlayerId: 'player_A',
      sourceTeamId: 'team_blue',
      damagePoints: 100,
    });
    expect(lethal.accepted).toBe(true);
    if (!lethal.accepted || lethal.death === null) return;
    const recorded = recordAuthorityTdmCombat(matchAt20, {
      schemaVersion: 1,
      damage: lethal.damage,
      death: lethal.death,
    });
    expect(recorded.accepted).toBe(true);
    if (!recorded.accepted) return;
    expect(recorded.events.map(({ kind }) => kind)).toEqual(['damage_applied', 'death']);
    expect(recorded.state).toMatchObject({
      teamScores: [{ score: 0 }, { score: 0 }],
      playerScores: [{ kills: 0, deaths: 0 }, { kills: 0, deaths: 0 }],
      feedSequence: 0,
      feed: [],
    });
  });

  it('cuts off scoring at the fortieth ordered enemy kill, then settles once', () => {
    const players: [string, string][] = [['player_A', 'team_blue']];
    for (let index = 0; index < 41; index += 1) {
      players.push([`player_R${index.toString().padStart(2, '0')}`, 'team_red']);
    }
    let match = startActive(createMatch(players));
    let finalKinds: string[] = [];
    let finalRequest: Parameters<typeof recordAuthorityTdmCombat>[1] | null = null;
    for (let index = 0; index < 40; index += 1) {
      const victimId = `player_R${index.toString().padStart(2, '0')}`;
      const lethal = damage(life(victimId, 'team_red'), {
        eventSequence: index,
        sourcePlayerId: 'player_A',
        sourceTeamId: 'team_blue',
        damagePoints: 100,
      });
      expect(lethal.accepted).toBe(true);
      if (!lethal.accepted || lethal.death === null) return;
      finalRequest = { schemaVersion: 1, damage: lethal.damage, death: lethal.death };
      const recorded = recordAuthorityTdmCombat(match, finalRequest);
      expect(recorded.accepted).toBe(true);
      if (!recorded.accepted) return;
      match = recorded.state;
      finalKinds = recorded.events.map(({ kind }) => kind);
    }
    expect(finalKinds).toEqual([
      'damage_applied',
      'death',
      'team_score_changed',
      'kill_feed_entry',
    ]);
    const afterLimit = match;
    const overflowVictim = damage(life('player_R40', 'team_red'), {
      eventSequence: 40,
      sourcePlayerId: 'player_A',
      sourceTeamId: 'team_blue',
      damagePoints: 100,
    });
    expect(overflowVictim.accepted).toBe(true);
    if (!overflowVictim.accepted || overflowVictim.death === null) return;
    const overflowRecorded = recordAuthorityTdmCombat(match, {
      schemaVersion: 1,
      damage: overflowVictim.damage,
      death: overflowVictim.death,
    });
    expect(overflowRecorded.accepted).toBe(true);
    if (!overflowRecorded.accepted) return;
    expect(overflowRecorded.events.map(({ kind }) => kind)).toEqual(['damage_applied', 'death']);
    expect(overflowRecorded.state).toMatchObject({
      phase: 'active',
      teamScores: afterLimit.teamScores,
      playerScores: afterLimit.playerScores,
      feedSequence: 40,
      feed: afterLimit.feed,
    });
    const settled = settleAuthorityTdmMatchTick(overflowRecorded.state);
    expect(settled.events.map(({ kind }) => kind)).toEqual([
      'match_phase_changed',
      'match_result',
    ]);
    match = settled.state;
    expect(match).toMatchObject({
      phase: 'postmatch',
      teamScores: [{ teamId: 'team_blue', score: 40 }, { teamId: 'team_red', score: 0 }],
      feedSequence: 40,
      result: { reason: 'score_limit', winningTeamId: 'team_blue', draw: false },
    });
    expect(match.playerScores.find(({ playerId }) => playerId === 'player_A')).toMatchObject({
      kills: 40,
      deaths: 0,
      assists: 0,
    });
    expect(finalRequest).not.toBeNull();
    if (finalRequest === null) return;
    const replay = recordAuthorityTdmCombat(match, {
      schemaVersion: 1,
      damage: overflowVictim.damage,
      death: overflowVictim.death,
    });
    expect(replay).toEqual({
      accepted: false,
      state: match,
      events: [],
      reason: 'replayed_or_stale_combat_event',
    });
  });

  it('records authority respawn once and never changes accumulated score', () => {
    let match = startActive(createMatch([
      ['player_A', 'team_blue'],
      ['player_B', 'team_red'],
    ]));
    let victim = life('player_B', 'team_red');
    const lethal = damage(victim, {
      eventSequence: 0,
      sourcePlayerId: 'player_A',
      sourceTeamId: 'team_blue',
      damagePoints: 100,
    });
    expect(lethal.accepted).toBe(true);
    if (!lethal.accepted || lethal.death === null) return;
    victim = lethal.state;
    const recordedDeath = recordAuthorityTdmCombat(match, {
      schemaVersion: 1,
      damage: lethal.damage,
      death: lethal.death,
    });
    expect(recordedDeath.accepted).toBe(true);
    if (!recordedDeath.accepted) return;
    match = advanceTo(recordedDeath.state, 200);
    const respawned = applyAuthoritativeRespawn(victim, {
      eventSequence: 1,
      authorityTick: 200,
      authoritySpawnId: 'spawn_player_B_2',
      resolvedBy: 'authority_spawn_resolver',
    }, G4_COMBAT_SLICE_LIFE_RULES);
    expect(respawned.accepted).toBe(true);
    if (!respawned.accepted) return;
    const recordedRespawn = recordAuthorityTdmRespawn(match, {
      schemaVersion: 1,
      respawn: respawned.event,
    });
    expect(recordedRespawn.accepted).toBe(true);
    if (!recordedRespawn.accepted) return;
    expect(recordedRespawn.events).toEqual([respawned.event]);
    expect(recordedRespawn.state.teamScores).toEqual(match.teamScores);
    expect(recordAuthorityTdmRespawn(recordedRespawn.state, {
      schemaVersion: 1,
      respawn: respawned.event,
    })).toMatchObject({
      accepted: false,
      events: [],
      reason: 'replayed_or_stale_combat_event',
    });
  });

  it('rejects forged score fields and mismatched death-ledger pairs', () => {
    const match = startActive(createMatch([
      ['player_A', 'team_blue'],
      ['player_B', 'team_red'],
    ]));
    const lethal = damage(life('player_B', 'team_red'), {
      eventSequence: 0,
      sourcePlayerId: 'player_A',
      sourceTeamId: 'team_blue',
      damagePoints: 100,
    });
    expect(lethal.accepted).toBe(true);
    if (!lethal.accepted || lethal.death === null) return;
    const deathEvent = lethal.death;
    expect(() => recordAuthorityTdmCombat(match, {
      schemaVersion: 1,
      damage: lethal.damage,
      death: deathEvent,
      claimedTeamScore: 40,
    } as never)).toThrow(/unsupported or missing fields/u);
    expect(() => recordAuthorityTdmCombat(match, {
      schemaVersion: 1,
      damage: lethal.damage,
      death: { ...deathEvent, victimPlayerId: 'player_A' },
    })).toThrow(/does not match its damage event/u);
  });
});

describe('KYX authoritative free-for-all core', () => {
  it('uses one authority score identity per player and rejects team aliasing', () => {
    expect(KYX_FFA_MATCH_RULES).toEqual({
      schemaVersion: 1,
      authorityHz: 20,
      mode: 'free_for_all',
      warmupTicks: 40,
      activeTicks: 9_600,
      postmatchTicks: 200,
      teamScoreLimit: 25,
    });
    const state = createMatch([
      ['player_A', 'player_A'],
      ['player_B', 'player_B'],
      ['player_C', 'player_C'],
    ], KYX_FFA_MATCH_RULES);
    expect(state.teamScores).toEqual([
      { teamId: 'player_A', score: 0 },
      { teamId: 'player_B', score: 0 },
      { teamId: 'player_C', score: 0 },
    ]);
    expect(() => createMatch([
      ['player_A', 'shared_team'],
      ['player_B', 'shared_team'],
    ], KYX_FFA_MATCH_RULES)).toThrow(/score identity/u);
  });

  it('scores an enemy elimination for the individual competitor', () => {
    const match = startActive(createMatch([
      ['player_A', 'player_A'],
      ['player_B', 'player_B'],
    ], KYX_FFA_MATCH_RULES));
    const lethal = damage(life('player_B', 'player_B'), {
      eventSequence: 0,
      sourcePlayerId: 'player_A',
      sourceTeamId: 'player_A',
      damagePoints: 100,
    });
    expect(lethal.accepted).toBe(true);
    if (!lethal.accepted || lethal.death === null) return;
    const recorded = recordAuthorityTdmCombat(match, {
      schemaVersion: 1,
      damage: lethal.damage,
      death: lethal.death,
    });
    expect(recorded.accepted).toBe(true);
    if (!recorded.accepted) return;
    expect(recorded.state.rules.mode).toBe('free_for_all');
    expect(recorded.state.teamScores).toEqual([
      { teamId: 'player_A', score: 1 },
      { teamId: 'player_B', score: 0 },
    ]);
    expect(recorded.state.playerScores).toEqual([
      { playerId: 'player_A', teamId: 'player_A', kills: 1, deaths: 0, assists: 0 },
      { playerId: 'player_B', teamId: 'player_B', kills: 0, deaths: 1, assists: 0 },
    ]);
    expect(recorded.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'team_score_changed',
        teamId: 'player_A',
        scoreAfter: 1,
        scoreLimit: 25,
      }),
    ]));
  });
});
