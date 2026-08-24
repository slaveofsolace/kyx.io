import { describe, expect, it } from 'vitest';

import {
  advanceAuthorityRematchConsensus,
  castAuthorityRematchVote,
  createAuthorityRematchConsensus,
  restoreAuthorityRematchConsensus,
} from '../../../../src/authority';

function consensus() {
  return createAuthorityRematchConsensus({
    matchId: 'match.relay.1',
    rematchOrdinal: 1,
    authorityTick: 1_000,
    responseWindowTicks: 200,
    eligiblePlayerIds: ['player.bravo', 'player.alpha'],
  });
}

describe('authority rematch consensus foundation', () => {
  it('requires unanimous authenticated-player acceptance and canonicalizes identity order', () => {
    const initial = consensus();
    expect(initial).toMatchObject({
      status: 'open',
      eligiblePlayerIds: ['player.alpha', 'player.bravo'],
      votes: [],
      expiresAtTick: 1_200,
    });

    const alpha = castAuthorityRematchVote(initial, {
      playerId: 'player.alpha',
      requestId: 'request.rematch.alpha',
      decision: 'accept',
      authorityTick: 1_010,
    });
    expect(alpha).toMatchObject({ ok: true, replayed: false, state: { status: 'open' } });
    if (!alpha.ok) throw new Error('expected alpha rematch vote');

    const bravo = castAuthorityRematchVote(alpha.state, {
      playerId: 'player.bravo',
      requestId: 'request.rematch.bravo',
      decision: 'accept',
      authorityTick: 1_020,
    });
    expect(bravo).toMatchObject({
      ok: true,
      replayed: false,
      state: {
        status: 'accepted',
        votes: [
          { playerId: 'player.alpha', decision: 'accept' },
          { playerId: 'player.bravo', decision: 'accept' },
        ],
      },
    });
  });

  it('is idempotent per request and rejects conflicts, second votes, and ineligible players', () => {
    const accepted = castAuthorityRematchVote(consensus(), {
      playerId: 'player.alpha',
      requestId: 'request.rematch.alpha',
      decision: 'accept',
      authorityTick: 1_010,
    });
    if (!accepted.ok) throw new Error('expected alpha rematch vote');

    expect(castAuthorityRematchVote(accepted.state, {
      playerId: 'player.alpha',
      requestId: 'request.rematch.alpha',
      decision: 'accept',
      authorityTick: 1_011,
    })).toMatchObject({ ok: true, replayed: true, state: accepted.state });
    expect(castAuthorityRematchVote(accepted.state, {
      playerId: 'player.bravo',
      requestId: 'request.rematch.alpha',
      decision: 'accept',
      authorityTick: 1_011,
    })).toMatchObject({ ok: false, reason: 'request_id_conflict' });
    expect(castAuthorityRematchVote(accepted.state, {
      playerId: 'player.alpha',
      requestId: 'request.rematch.alpha.second',
      decision: 'decline',
      authorityTick: 1_011,
    })).toMatchObject({ ok: false, reason: 'vote_already_recorded' });
    expect(castAuthorityRematchVote(accepted.state, {
      playerId: 'player.charlie',
      requestId: 'request.rematch.charlie',
      decision: 'accept',
      authorityTick: 1_011,
    })).toMatchObject({ ok: false, reason: 'player_ineligible' });
  });

  it('closes on one decline and expires without client-authored time', () => {
    const declined = castAuthorityRematchVote(consensus(), {
      playerId: 'player.alpha',
      requestId: 'request.rematch.decline',
      decision: 'decline',
      authorityTick: 1_010,
    });
    expect(declined).toMatchObject({ ok: true, state: { status: 'declined' } });
    if (!declined.ok) throw new Error('expected decline');
    expect(castAuthorityRematchVote(declined.state, {
      playerId: 'player.bravo',
      requestId: 'request.rematch.too-late',
      decision: 'accept',
      authorityTick: 1_011,
    })).toMatchObject({ ok: false, reason: 'consensus_closed' });

    const expired = advanceAuthorityRematchConsensus(consensus(), 1_200);
    expect(expired.status).toBe('expired');
    expect(castAuthorityRematchVote(expired, {
      playerId: 'player.alpha',
      requestId: 'request.rematch.expired',
      decision: 'accept',
      authorityTick: 1_200,
    })).toMatchObject({ ok: false, reason: 'consensus_expired' });
  });

  it('round-trips restart state, preserves replay receipts, and rejects tampering', () => {
    const accepted = castAuthorityRematchVote(consensus(), {
      playerId: 'player.alpha',
      requestId: 'request.rematch.alpha',
      decision: 'accept',
      authorityTick: 1_010,
    });
    if (!accepted.ok) throw new Error('expected alpha rematch vote');
    const checkpoint = structuredClone(accepted.state);
    const restored = restoreAuthorityRematchConsensus(checkpoint, 1_010);
    expect(restored).toEqual(accepted.state);
    expect(castAuthorityRematchVote(restored, {
      playerId: 'player.alpha',
      requestId: 'request.rematch.alpha',
      decision: 'accept',
      authorityTick: 1_011,
    })).toMatchObject({ ok: true, replayed: true });

    expect(() => restoreAuthorityRematchConsensus({
      ...checkpoint,
      status: 'accepted',
    }, 1_010)).toThrow(/status disagrees/u);
    expect(() => restoreAuthorityRematchConsensus({
      ...checkpoint,
      clientSelectedNextMatchId: 'match.attacker',
    }, 1_010)).toThrow(/unsupported or missing/u);
  });
});
