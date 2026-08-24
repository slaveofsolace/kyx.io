import { describe, expect, it } from 'vitest';

import {
  advanceAuthoritySpectators,
  createAuthoritySpectatorState,
  disconnectAuthoritySpectator,
  joinAuthoritySpectator,
  KYX_MODE_ID,
  restoreAuthoritySpectatorState,
  resumeAuthoritySpectator,
  selectAuthoritySpectatorTarget,
  type AuthoritySpectatorStateV1,
  type AuthoritySpectatorTargetV1,
} from '../../../../src/authority';

const targets = Object.freeze([
  Object.freeze({ playerId: 'player.bravo', connected: true, lifePhase: 'alive' as const }),
  Object.freeze({ playerId: 'player.alpha', connected: true, lifePhase: 'alive' as const }),
  Object.freeze({ playerId: 'player.dead', connected: true, lifePhase: 'dead' as const }),
  Object.freeze({ playerId: 'player.offline', connected: false, lifePhase: 'alive' as const }),
]);

function state(overrides: Partial<{
  maximumSpectators: number;
  reconnectGraceTicks: number;
}> = {}): AuthoritySpectatorStateV1 {
  return createAuthoritySpectatorState({
    modeId: KYX_MODE_ID.teamDeathmatch,
    ...overrides,
  });
}

function join(
  source: AuthoritySpectatorStateV1,
  spectatorId = 'spectator.one',
  connectionId = 'connection.spectator.one',
  targetValues: readonly AuthoritySpectatorTargetV1[] = targets,
) {
  return joinAuthoritySpectator(source, {
    spectatorId,
    connectionId,
    reason: 'voluntary',
    authorityTick: 100,
    lifecycle: 'active',
    targets: targetValues,
  });
}

describe('authority spectator lifecycle foundation', () => {
  it('joins outside player capacity and selects the first eligible target deterministically', () => {
    const initial = state();
    const result = join(initial);

    expect(result).toMatchObject({
      ok: true,
      replayed: false,
      spectator: {
        spectatorId: 'spectator.one',
        connected: true,
        reason: 'voluntary',
        targetPlayerId: 'player.alpha',
        targetRevision: 0,
      },
    });
    expect(initial.spectators).toEqual([]);
    if (!result.ok) throw new Error('expected spectator join');
    expect(Object.isFrozen(result.state)).toBe(true);
    expect(Object.isFrozen(result.state.spectators)).toBe(true);
  });

  it('fails closed on duplicate identities, capacity, invalid targets, and incompatible reasons', () => {
    const first = join(state({ maximumSpectators: 1 }));
    if (!first.ok) throw new Error('expected spectator join');

    expect(join(first.state)).toEqual({ ok: false, reason: 'duplicate_spectator' });
    expect(join(
      first.state,
      'spectator.two',
      'connection.spectator.one',
    )).toEqual({ ok: false, reason: 'duplicate_connection' });
    expect(join(
      first.state,
      'spectator.two',
      'connection.spectator.two',
    )).toEqual({ ok: false, reason: 'spectator_full' });
    expect(joinAuthoritySpectator(state(), {
      spectatorId: 'spectator.two',
      connectionId: 'connection.spectator.two',
      reason: 'voluntary',
      authorityTick: 100,
      lifecycle: 'active',
      targets,
      preferredTargetPlayerId: 'player.dead',
    })).toEqual({ ok: false, reason: 'target_unavailable' });
    expect(joinAuthoritySpectator(state(), {
      spectatorId: 'spectator.eliminated',
      connectionId: 'connection.spectator.eliminated',
      reason: 'eliminated',
      authorityTick: 1,
      lifecycle: 'lobby',
      targets,
    })).toEqual({ ok: false, reason: 'reason_incompatible' });
    expect(joinAuthoritySpectator(state(), {
      spectatorId: 'spectator.expired',
      connectionId: 'connection.spectator.expired',
      reason: 'voluntary',
      authorityTick: 1,
      lifecycle: 'expired',
      targets,
    })).toEqual({ ok: false, reason: 'room_expired' });
  });

  it('binds target mutation to the live spectator connection and makes repeats idempotent', () => {
    const joined = join(state());
    if (!joined.ok) throw new Error('expected spectator join');

    expect(selectAuthoritySpectatorTarget(joined.state, {
      spectatorId: 'spectator.one',
      connectionId: 'connection.attacker',
      authorityTick: 101,
      targetPlayerId: 'player.bravo',
      targets,
    })).toEqual({ ok: false, reason: 'connection_mismatch' });

    const selected = selectAuthoritySpectatorTarget(joined.state, {
      spectatorId: 'spectator.one',
      connectionId: 'connection.spectator.one',
      authorityTick: 101,
      targetPlayerId: 'player.bravo',
      targets,
    });
    expect(selected).toMatchObject({
      ok: true,
      replayed: false,
      spectator: { targetPlayerId: 'player.bravo', targetRevision: 1 },
    });
    if (!selected.ok) throw new Error('expected spectator target selection');

    expect(selectAuthoritySpectatorTarget(selected.state, {
      spectatorId: 'spectator.one',
      connectionId: 'connection.spectator.one',
      authorityTick: 102,
      targetPlayerId: 'player.bravo',
      targets,
    })).toMatchObject({
      ok: true,
      replayed: true,
      state: selected.state,
    });
  });

  it('supports bounded reconnect, target repair, and deterministic pruning', () => {
    const joined = join(state({ reconnectGraceTicks: 20 }));
    if (!joined.ok) throw new Error('expected spectator join');
    const disconnected = disconnectAuthoritySpectator(
      joined.state,
      'connection.spectator.one',
      110,
    );
    if (!disconnected.ok) throw new Error('expected spectator disconnect');

    const resumed = resumeAuthoritySpectator(disconnected.state, {
      spectatorId: 'spectator.one',
      connectionId: 'connection.spectator.resumed',
      authorityTick: 129,
      targets: targets.filter(({ playerId }) => playerId !== 'player.alpha'),
    });
    expect(resumed).toMatchObject({
      ok: true,
      spectator: {
        connected: true,
        targetPlayerId: 'player.bravo',
        targetRevision: 1,
      },
    });

    const disconnectedAgain = disconnectAuthoritySpectator(
      resumed.ok ? resumed.state : disconnected.state,
      'connection.spectator.resumed',
      130,
    );
    if (!disconnectedAgain.ok) throw new Error('expected spectator disconnect');
    expect(resumeAuthoritySpectator(disconnectedAgain.state, {
      spectatorId: 'spectator.one',
      connectionId: 'connection.spectator.late',
      authorityTick: 151,
      targets,
    })).toEqual({ ok: false, reason: 'resume_expired' });
    expect(advanceAuthoritySpectators(disconnectedAgain.state, 151, targets))
      .toMatchObject({
        state: { spectators: [] },
        prunedSpectatorIds: ['spectator.one'],
      });
  });

  it('round-trips strict restart state and rejects stale or widened checkpoints', () => {
    const joined = join(state({ reconnectGraceTicks: 20 }));
    if (!joined.ok) throw new Error('expected spectator join');
    const disconnected = disconnectAuthoritySpectator(
      joined.state,
      'connection.spectator.one',
      110,
    );
    if (!disconnected.ok) throw new Error('expected spectator disconnect');
    const checkpoint = structuredClone(disconnected.state);

    expect(restoreAuthoritySpectatorState(checkpoint, 120)).toEqual(disconnected.state);
    expect(() => restoreAuthoritySpectatorState({
      ...checkpoint,
      clientOwnsCamera: true,
    }, 120)).toThrow(/unsupported or missing/u);
    expect(() => restoreAuthoritySpectatorState(checkpoint, 131)).toThrow(/disconnect tick/u);
  });
});
