import { describe, expect, it } from 'vitest';

import {
  createAuthorityPracticeMatchResultViewModel,
  createAuthorityScoreboardRows,
} from '../../../src/app/authorityHudProjection';

const PLAYER_SCORES = Object.freeze([
  Object.freeze({
    playerId: 'practice.player.local',
    teamId: 'team_blue',
    kills: 4,
    deaths: 1,
    assists: 2,
  }),
  Object.freeze({
    playerId: 'practice.bot.01',
    teamId: 'team_red',
    kills: 7,
    deaths: 2,
    assists: 0,
  }),
]);

describe('authority HUD match projections', () => {
  it('uses per-player authority scores and stable TDM ordering', () => {
    expect(createAuthorityScoreboardRows(
      PLAYER_SCORES,
      'practice.player.local',
    )).toEqual([
      {
        playerId: 'practice.bot.01',
        teamId: 'team_red',
        kills: 7,
        deaths: 2,
        assists: 0,
        kd: '3.5',
        isYou: false,
      },
      {
        playerId: 'practice.player.local',
        teamId: 'team_blue',
        kills: 4,
        deaths: 1,
        assists: 2,
        kd: '4.0',
        isYou: true,
      },
    ]);
  });

  it('does not invent scoreboard rows without an authority player ledger', () => {
    expect(createAuthorityScoreboardRows([], 'practice.player.local')).toEqual([]);
  });

  it('projects the completed authority result into local victory facts', () => {
    expect(createAuthorityPracticeMatchResultViewModel({
      localPlayerId: 'practice.player.local',
      playerScores: PLAYER_SCORES,
      result: {
        kind: 'match_result',
        eventId: 'match.result.1',
        authorityTick: 2_400,
        matchId: 'match.local.relay.practice',
        reason: 'score_limit',
        winningTeamId: 'team_blue',
        draw: false,
        teamScores: [
          { teamId: 'team_blue', score: 40 },
          { teamId: 'team_red', score: 37 },
        ],
      },
    })).toEqual({
      outcome: 'victory',
      title: 'Victory',
      reasonLabel: 'Score limit reached',
      localTeamScore: 40,
      opposingTeamScore: 37,
      kills: 4,
      deaths: 1,
      assists: 2,
      kd: '4.0',
    });
  });

  it.each([
    {
      draw: false,
      winningTeamId: 'team_red',
      reason: 'time_limit' as const,
      expected: { outcome: 'defeat', title: 'Defeat', reasonLabel: 'Time expired' },
    },
    {
      draw: true,
      winningTeamId: null,
      reason: 'time_limit' as const,
      expected: { outcome: 'draw', title: 'Draw', reasonLabel: 'Time expired' },
    },
  ])('preserves the authority $expected.outcome verdict', ({
    draw,
    winningTeamId,
    reason,
    expected,
  }) => {
    expect(createAuthorityPracticeMatchResultViewModel({
      localPlayerId: 'practice.player.local',
      playerScores: [...PLAYER_SCORES].reverse(),
      result: {
        kind: 'match_result',
        eventId: `match.result.${expected.outcome}`,
        authorityTick: 9_600,
        matchId: 'match.local.relay.practice',
        reason,
        winningTeamId,
        draw,
        teamScores: [
          { teamId: 'team_blue', score: 18 },
          { teamId: 'team_red', score: draw ? 18 : 22 },
        ],
      },
    })).toMatchObject(expected);
  });

  it('fails closed when the authority result omits the local score row', () => {
    expect(() => createAuthorityPracticeMatchResultViewModel({
      localPlayerId: 'missing.player',
      playerScores: PLAYER_SCORES,
      result: {
        kind: 'match_result',
        eventId: 'match.result.2',
        authorityTick: 9_600,
        matchId: 'match.local.relay.practice',
        reason: 'time_limit',
        winningTeamId: null,
        draw: true,
        teamScores: [
          { teamId: 'team_blue', score: 18 },
          { teamId: 'team_red', score: 18 },
        ],
      },
    })).toThrow('LOCAL_INKFALL_PRACTICE_RESULT_PLAYER_MISSING');
  });
});
