import { describe, expect, it } from 'vitest';

import { AuthoritativeRoom } from '../../../src/authority';
import { PROTOCOL_VERSION, type InputBatchMessage } from '../../../src/net';
import { PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../../src/sim';
import { FakeMovementQueryPort } from '../sim/movement/fakeQueryPort';

function room(overrides: Partial<ConstructorParameters<typeof AuthoritativeRoom>[0]> = {}) {
  return new AuthoritativeRoom({
    identity: {
      roomId: 'room_TEST',
      matchId: 'match_TEST',
      rulesetId: 'authority_test_rules',
      rulesetRevision: 1,
      rulesetHash: '5555555555555555',
      mapId: 'phase4_flat_run',
      fixtureId: 'flat_run',
      fixtureHash: '1111111111111111',
      physicsAdapterId: 'fake_query_port',
      physicsAdapterVersion: '1.0.0',
    },
    profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
    queries: new FakeMovementQueryPort(),
    warmupTicks: 2,
    activeTicks: 3,
    postmatchTicks: 2,
    reconnectGraceTicks: 2,
    minimumConnectedPlayersToStart: 2,
    ...overrides,
  });
}

function join(authority: AuthoritativeRoom, suffix: string) {
  return authority.joinNewPlayer({
    playerId: `player_${suffix}`,
    connectionId: `connection_${suffix}`,
  });
}

function batch(sequence: number, moveY = 0): InputBatchMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'inputBatch',
    commands: [{
      type: 'input',
      sequence,
      clientTick: sequence,
      moveX: 0,
      moveY,
      lookYawDeltaMilliDegrees: 0,
      lookPitchDeltaMilliDegrees: 0,
      heldButtons: 0,
      pressedButtons: 0,
      releasedButtons: 0,
    }],
  };
}

describe('authoritative room core', () => {
  it('advances both players on one room tick while only accepted intent moves a player', () => {
    const authority = room();
    expect(join(authority, 'A').ok).toBe(true);
    expect(join(authority, 'B').ok).toBe(true);
    expect(authority.startMatch()).toBe(true);
    authority.enqueueInputBatch('connection_A', batch(0, 127));

    const tick = authority.advanceOneTick();
    expect(tick.serverTick).toBe(1);
    const snapshot = authority.fullSnapshot();
    expect(snapshot.identity.rulesetHash).toBe('5555555555555555');
    expect(snapshot.players.every(({ movement }) => (
      movement.identity.rulesetHash === snapshot.identity.rulesetHash
    ))).toBe(true);
    expect(snapshot.players.map(({ movement }) => movement.tick)).toEqual([1, 1]);
    expect(snapshot.players.find(({ playerId }) => playerId === 'player_A')
      ?.movement.player.feetPosition.z).toBeGreaterThan(0);
    expect(snapshot.players.find(({ playerId }) => playerId === 'player_B')
      ?.movement.player.feetPosition.z).toBe(0);
    expect(authority.protocolEntities()).toHaveLength(2);
  });

  it('processes overtaken input in sequence when its predecessor arrives inside 160 ms', () => {
    const authority = room({ activeTicks: 20 });
    join(authority, 'A');
    join(authority, 'B');
    authority.startMatch();

    authority.enqueueInputBatch('connection_A', batch(1, 127));
    authority.advanceOneTick();
    authority.advanceOneTick();
    authority.advanceOneTick();
    authority.advanceOneTick();
    expect(authority.fullSnapshot().players.find(({ playerId }) => playerId === 'player_A')
      ?.movement.player.lastProcessedSequence).toBe(-1);

    authority.enqueueInputBatch('connection_A', batch(0, 127));
    authority.advanceOneTick();
    const movement = authority.fullSnapshot().players.find(({ playerId }) => (
      playerId === 'player_A'
    ))?.movement;
    expect(movement?.player.lastProcessedSequence).toBe(1);
    expect(movement?.player.feetPosition.z).toBeGreaterThan(0);
    expect(Object.values(authority.metricsSnapshot().inputRejections).every((count) => (
      count === 0
    ))).toBe(true);
  });

  it('runs the explicit lobby/warmup/active/postmatch/idle/expired lifecycle', () => {
    const authority = room();
    join(authority, 'A');
    join(authority, 'B');
    expect(authority.lifecycle).toBe('lobby');
    expect(authority.startMatch()).toBe(true);
    expect(authority.advanceOneTick().lifecycle).toBe('warmup');
    expect(authority.advanceOneTick().lifecycle).toBe('active');
    authority.advanceOneTick();
    authority.advanceOneTick();
    expect(authority.advanceOneTick().lifecycle).toBe('postmatch');
    authority.advanceOneTick();
    expect(authority.advanceOneTick().lifecycle).toBe('idle');
    expect(authority.expire()).toBe(true);
    expect(authority.lifecycle).toBe('expired');
  });

  it('resumes only through the explicit transport-authenticated seam', () => {
    const authority = room();
    join(authority, 'A');
    join(authority, 'B');
    authority.startMatch();
    authority.enqueueInputBatch('connection_A', batch(0, 127));
    authority.advanceOneTick();
    expect(authority.disconnectConnection('connection_A')).toBe(true);
    const disconnected = authority.fullSnapshot().players.find(({ playerId }) => (
      playerId === 'player_A'
    ));
    expect(disconnected?.movement.player).toMatchObject({
      velocity: { x: 0, y: 0, z: 0 },
      integrationRemainders: {
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        planarAcceleration: 0,
        gravity: 0,
      },
      intent: { moveX: 0, moveZ: 0, heldButtons: 0 },
    });
    expect(authority.joinNewPlayer({
      playerId: 'player_A',
      connectionId: 'connection_EVIL',
    })).toEqual({ ok: false, reason: 'duplicate_player' });
    expect(authority.resumePlayer({
      playerId: 'player_UNKNOWN',
      connectionId: 'connection_EVIL',
    })).toEqual({ ok: false, reason: 'resume_rejected' });
    const reconnected = authority.resumePlayer({
      playerId: 'player_A',
      connectionId: 'connection_A2',
    });
    expect(reconnected).toMatchObject({
      ok: true,
      connectionMode: 'resumed',
      snapshot: {
        kind: 'authority_full_snapshot',
        serverTick: 1,
        players: expect.arrayContaining([
          expect.objectContaining({
            playerId: 'player_A',
            movement: expect.objectContaining({
              player: expect.objectContaining({
                feetPosition: disconnected?.movement.player.feetPosition,
                velocity: { x: 0, y: 0, z: 0 },
              }),
            }),
          }),
        ]),
      },
    });
    expect(authority.resumePlayer({
      playerId: 'player_A',
      connectionId: 'connection_A3',
    }))
      .toEqual({ ok: false, reason: 'duplicate_player' });
  });

  it('reports bounded queue and rejection metrics', () => {
    const authority = room({ commandsPerPlayerPerTick: 1 });
    join(authority, 'A');
    join(authority, 'B');
    authority.startMatch();
    authority.enqueueInputBatch('connection_A', {
      ...batch(0),
      commands: [batch(0).commands[0], batch(1).commands[0]],
    });
    authority.advanceOneTick();
    const duplicate = authority.enqueueInputBatch('connection_A', batch(1));
    expect(duplicate.rejections[0]?.reason).toBe('duplicate_sequence');
    expect(authority.metricsSnapshot()).toMatchObject({
      ticks: 1,
      acceptedInputs: 2,
      maximumObservedQueueDepth: 2,
      inputRejections: { duplicate_sequence: 1 },
    });
  });

  it('reopens an unstarted empty lobby without reusing a completed match', () => {
    const authority = room();
    expect(join(authority, 'A').ok).toBe(true);
    expect(authority.leavePlayer('player_A')).toBe(true);
    expect(authority.lifecycle).toBe('idle');
    expect(join(authority, 'B').ok).toBe(true);
    expect(authority.lifecycle).toBe('lobby');

    expect(join(authority, 'C').ok).toBe(true);
    expect(authority.startMatch()).toBe(true);
    authority.advanceOneTick();
    authority.advanceOneTick();
    authority.advanceOneTick();
    authority.advanceOneTick();
    authority.advanceOneTick();
    authority.advanceOneTick();
    authority.advanceOneTick();
    expect(authority.lifecycle).toBe('idle');
    expect(join(authority, 'D')).toEqual({ ok: false, reason: 'match_incompatible' });
  });

  it('uses only the trusted spawn resolver and rejects an unvalidated batch at the room seam', () => {
    const authority = room({
      spawnResolver: (_playerId, ordinal) => ({
        feetPosition: { x: ordinal * 2_000, y: 0, z: -3_000 },
      }),
    });
    join(authority, 'A');
    join(authority, 'B');
    authority.startMatch();
    expect(authority.fullSnapshot().players[1].movement.player.feetPosition).toEqual({
      x: 2_000,
      y: 0,
      z: -3_000,
    });
    expect(() => authority.enqueueInputBatch('connection_A', {
      ...batch(0),
      forgedPosition: { x: 999_999, y: 0, z: 0 },
    })).toThrow(/INVALID/u);
    expect(Object.isFrozen(authority.fullSnapshot().players[0].movement.player)).toBe(true);
  });
});
