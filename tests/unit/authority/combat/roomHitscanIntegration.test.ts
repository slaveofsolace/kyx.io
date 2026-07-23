import { describe, expect, it } from 'vitest';

import {
  AuthoritativeRoom,
  G4_COMBAT_ROOM_PROFILE_ID,
  G4_COMBAT_RULESET_HASH,
  G4_COMBAT_RULESET_ID,
  G4_COMBAT_RULESET_REVISION,
  G4_HITSCAN_ROOM_CAPABILITY_ID,
  type AuthorityRoomOptions,
  type AuthorityRoomTickResult,
  type AuthorityWorldOcclusionPort,
} from '../../../../src/authority';
import { hashRulesetContent, requireRuleset } from '../../../../src/content';
import { PROTOCOL_VERSION, type InputBatchMessage } from '../../../../src/net';
import { INTENT_BUTTON, PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../../../src/sim';
import { FakeMovementQueryPort } from '../../sim/movement/fakeQueryPort';

const clearWorld: AuthorityWorldOcclusionPort = () => ({
  schemaVersion: 1,
  hit: false,
  distanceMillimeters: null,
  colliderId: null,
});

function roomOptions(options: {
  readonly hitscan?: boolean;
  readonly sameTeam?: boolean;
  readonly worldOcclusion?: AuthorityWorldOcclusionPort;
} = {}): AuthorityRoomOptions {
  const content = requireRuleset(G4_COMBAT_RULESET_ID, G4_COMBAT_RULESET_REVISION);
  expect(hashRulesetContent(content)).toBe(G4_COMBAT_RULESET_HASH);
  const teamResolver = (playerId: string): string => options.sameTeam || playerId === 'player_A'
    ? 'team_blue'
    : 'team_red';
  return {
    identity: {
      roomId: 'room_HITSCAN',
      matchId: 'match_HITSCAN',
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
    warmupTicks: 1,
    activeTicks: 1_000,
    postmatchTicks: 2,
    reconnectGraceTicks: 200,
    minimumConnectedPlayersToStart: 2,
    spawnResolver: (playerId) => ({
      spawnId: `spawn_authority_${playerId}`,
      feetPosition: playerId === 'player_A'
        ? { x: 0, y: 0, z: 0 }
        : { x: 0, y: 0, z: 10_000 },
      yawMilliDegrees: playerId === 'player_A' ? 0 : 180_000,
    }),
    combat: {
      profileId: G4_COMBAT_ROOM_PROFILE_ID,
      teamResolver,
      ...(options.hitscan === false
        ? {}
        : {
            hitscan: {
              capabilityId: G4_HITSCAN_ROOM_CAPABILITY_ID,
              worldOcclusion: options.worldOcclusion ?? clearWorld,
            },
          }),
    },
  };
}

function room(options: Parameters<typeof roomOptions>[0] = {}): AuthoritativeRoom {
  return new AuthoritativeRoom(roomOptions(options));
}

function join(authority: AuthoritativeRoom, suffix: string, connectionSuffix = suffix): void {
  expect(authority.joinNewPlayer({
    playerId: `player_${suffix}`,
    connectionId: `connection_${connectionSuffix}`,
  })).toMatchObject({ ok: true, connectionMode: 'joined' });
}

interface BatchOptions {
  readonly moveX?: number;
  readonly heldButtons?: number;
  readonly pressedButtons?: number;
  readonly lookYawDeltaMilliDegrees?: number;
  readonly lookPitchDeltaMilliDegrees?: number;
}

function batch(
  sequence: number,
  clientTick: number,
  options: BatchOptions = {},
): InputBatchMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'inputBatch',
    commands: [{
      type: 'input',
      sequence,
      clientTick,
      moveX: options.moveX ?? 0,
      moveY: 0,
      lookYawDeltaMilliDegrees: options.lookYawDeltaMilliDegrees ?? 0,
      lookPitchDeltaMilliDegrees: options.lookPitchDeltaMilliDegrees ?? 0,
      heldButtons: options.heldButtons ?? 0,
      pressedButtons: options.pressedButtons ?? 0,
      releasedButtons: 0,
      selectedSlot: 0,
    }],
  };
}

function fireBatch(sequence: number, clientTick: number): InputBatchMessage {
  return batch(sequence, clientTick, {
    heldButtons: INTENT_BUTTON.primaryFire,
    pressedButtons: INTENT_BUTTON.primaryFire,
    lookPitchDeltaMilliDegrees: -2_000,
  });
}

function advanceTo(authority: AuthoritativeRoom, targetTick: number): void {
  while (authority.serverTick < targetTick) authority.advanceOneTick();
}

function startTwoPlayerRoom(authority: AuthoritativeRoom): void {
  join(authority, 'A');
  join(authority, 'B');
  expect(authority.startMatch()).toBe(true);
}

function playerHealth(authority: AuthoritativeRoom, playerId: string): number | undefined {
  return authority.fullSnapshot().players
    .find((player) => player.playerId === playerId)?.combat?.life.healthPoints;
}

function movingTargetShot(roundTripMilliseconds: number): {
  readonly authority: AuthoritativeRoom;
  readonly tick: AuthorityRoomTickResult;
} {
  const authority = room();
  startTwoPlayerRoom(authority);
  advanceTo(authority, 21);
  authority.recordServerObservedRtt('player_A', roundTripMilliseconds);
  let finalTick: AuthorityRoomTickResult | null = null;
  for (let moveOrdinal = 0; moveOrdinal < 4; moveOrdinal += 1) {
    authority.enqueueInputBatch('connection_B', batch(moveOrdinal, authority.serverTick, {
      moveX: 127,
    }));
    if (moveOrdinal === 3) {
      authority.enqueueInputBatch('connection_A', fireBatch(0, authority.serverTick));
    }
    finalTick = authority.advanceOneTick();
  }
  if (finalTick === null) throw new Error('expected final moving-target tick');
  return { authority, tick: finalTick };
}

describe('P5.3b opt-in authoritative room hitscan integration', () => {
  it('requires the exact capability and preserves prior combat and input shapes', () => {
    const combatOnly = room({ hitscan: false });
    startTwoPlayerRoom(combatOnly);
    const priorTick = combatOnly.advanceOneTick();
    expect(priorTick.combatEvents).toEqual([]);
    expect(priorTick.hitscanResults).toBeUndefined();
    expect(Object.keys(priorTick).sort()).toEqual([
      'combatEvents',
      'lifecycle',
      'lifecycleTransitions',
      'movementEvents',
      'prunedPlayerIds',
      'queryMetrics',
      'serverTick',
    ]);
    expect(() => combatOnly.recordServerObservedRtt('player_A', 50)).toThrow(
      'AUTHORITY_HITSCAN_NOT_ENABLED',
    );

    const base = roomOptions();
    expect(() => new AuthoritativeRoom({
      ...base,
      combat: {
        profileId: G4_COMBAT_ROOM_PROFILE_ID,
        hitscan: {
          capabilityId: 'client_hitscan',
          worldOcclusion: clearWorld,
        },
      },
    } as never)).toThrow(/capability is unsupported/u);
    expect(() => new AuthoritativeRoom({
      ...base,
      combat: {
        profileId: G4_COMBAT_ROOM_PROFILE_ID,
        hitscan: {
          capabilityId: G4_HITSCAN_ROOM_CAPABILITY_ID,
          worldOcclusion: clearWorld,
          clientTimestamp: 123,
        },
      },
    } as never)).toThrow(/unsupported or missing fields/u);

    const protectedRoom = room();
    startTwoPlayerRoom(protectedRoom);
    expect(() => protectedRoom.recordServerObservedRtt(
      'player_A',
      { clientTimestamp: 123, roundTripMilliseconds: 50 } as never,
    )).toThrow(/server-observed RTT milliseconds/u);
    expect(() => protectedRoom.enqueueInputBatch('connection_A', {
      ...batch(0, 0),
      commands: [{
        ...batch(0, 0).commands[0],
        claimedMuzzleOrigin: { x: 0, y: 0, z: 0 },
        claimedHitPlayerId: 'player_B',
      }],
    })).toThrow('AUTHORITY_INPUT_BATCH_INVALID');
  });

  it('bounds RTT history to 16 server ticks and replaces a same-tick observation', () => {
    const authority = room();
    startTwoPlayerRoom(authority);
    for (let index = 0; index < 20; index += 1) {
      authority.recordServerObservedRtt('player_A', index * 10);
      authority.advanceOneTick();
    }
    authority.recordServerObservedRtt('player_A', 350);
    authority.recordServerObservedRtt('player_A', 400);
    authority.enqueueInputBatch('connection_A', fireBatch(0, authority.serverTick));
    const result = authority.advanceOneTick().hitscanResults?.[0];
    expect(result).toMatchObject({
      resolution: {
        accepted: true,
        outcome: 'hit',
        debug: {
          compensation: {
            observedRttSampleCount: 16,
            medianObservedRttMilliseconds: 165,
            appliedCompensationTicks: 2,
            targetRewindTick: 19,
          },
        },
      },
      damage: { accepted: true, state: { healthPoints: 90 } },
    });
    expect(() => authority.recordServerObservedRtt('player_A', Number.NaN)).toThrow(
      /server-observed RTT milliseconds/u,
    );
    expect(() => authority.recordServerObservedRtt('player_A', 20_001)).toThrow(
      /server-observed RTT milliseconds/u,
    );
  });

  it('rewinds at 350 ms, caps larger RTT, and misses the same current pose at zero RTT', () => {
    const rewound = movingTargetShot(350);
    const capped = movingTargetShot(800);
    const current = movingTargetShot(0);
    const rewoundResult = rewound.tick.hitscanResults?.[0];
    const cappedResult = capped.tick.hitscanResults?.[0];
    const currentResult = current.tick.hitscanResults?.[0];
    expect(rewoundResult).toMatchObject({
      resolutionOrdinal: 0,
      acceptedShot: { authorityTick: 25, playerId: 'player_A' },
      roomRejectionReason: null,
      resolution: {
        accepted: true,
        outcome: 'hit',
        hit: { targetPlayerId: 'player_B', targetPoseTick: 21, damagePoints: 10 },
        debug: {
          compensation: {
            medianObservedRttMilliseconds: 350,
            requestedCompensationTicks: 4,
            appliedCompensationTicks: 4,
            appliedCompensationMilliseconds: 200,
            compensationCapped: false,
            clientTimestampUsed: false,
          },
        },
      },
      damage: { accepted: true, state: { healthPoints: 90 } },
    });
    expect(cappedResult).toMatchObject({
      resolution: {
        accepted: true,
        outcome: 'hit',
        hit: { targetPlayerId: 'player_B', targetPoseTick: 21 },
        debug: {
          compensation: {
            medianObservedRttMilliseconds: 800,
            requestedCompensationTicks: 8,
            appliedCompensationTicks: 4,
            compensationCapped: true,
            targetRewindTick: 21,
          },
        },
      },
      damage: { accepted: true, state: { healthPoints: 90 } },
    });
    expect(currentResult).toMatchObject({
      resolutionOrdinal: 0,
      resolution: {
        accepted: true,
        outcome: 'miss',
        reason: 'no_target',
        debug: { compensation: { appliedCompensationTicks: 0, targetRewindTick: 25 } },
      },
      damage: null,
    });
    expect(playerHealth(rewound.authority, 'player_B')).toBe(90);
    expect(playerHealth(current.authority, 'player_B')).toBe(100);
    expect(
      current.authority.fullSnapshot().players
        .find((player) => player.playerId === 'player_B')?.movement.player.feetPosition.x,
    ).not.toBe(0);
    expect(Object.isFrozen(rewound.tick.hitscanResults)).toBe(true);
    expect(Object.isFrozen(rewoundResult?.resolution?.debug)).toBe(true);
  });

  it('orders authoritative world occlusion ahead of a farther target', () => {
    let capturedRay: Parameters<AuthorityWorldOcclusionPort>[0] | null = null;
    const authority = room({
      worldOcclusion: (ray) => {
        capturedRay = ray;
        return {
          schemaVersion: 1,
          hit: true,
          distanceMillimeters: 5_000,
          colliderId: 'inkfall_wall_test',
        };
      },
    });
    startTwoPlayerRoom(authority);
    advanceTo(authority, 20);
    authority.recordServerObservedRtt('player_A', 0);
    authority.enqueueInputBatch('connection_A', fireBatch(0, authority.serverTick));
    const tick = authority.advanceOneTick();
    expect(tick.hitscanResults?.[0]).toMatchObject({
      resolution: {
        accepted: true,
        outcome: 'miss',
        reason: 'world_occluded',
        debug: {
          worldOcclusion: {
            hit: true,
            distanceMillimeters: 5_000,
            colliderId: 'inkfall_wall_test',
          },
        },
      },
      damage: null,
    });
    expect(playerHealth(authority, 'player_B')).toBe(100);
    expect(capturedRay).toMatchObject({
      schemaVersion: 1,
      maximumDistanceMillimeters: 120_000,
      layer: 'authoritative_world',
    });
    expect(Object.isFrozen(capturedRay)).toBe(true);
  });

  it('filters self, a room-owned teammate, and a current dead enemy', () => {
    const authority = room({ sameTeam: true });
    join(authority, 'A');
    join(authority, 'B');
    join(authority, 'C');
    expect(authority.startMatch()).toBe(true);
    advanceTo(authority, 20);
    expect(authority.applyCombatDamage({
      targetPlayerId: 'player_C',
      sourcePlayerId: null,
      damagePoints: 100,
      causeId: 'test.current_dead',
    })).toMatchObject({ accepted: true, state: { phase: 'dead' } });
    authority.recordServerObservedRtt('player_A', 0);
    authority.enqueueInputBatch('connection_A', fireBatch(0, authority.serverTick));
    const tick = authority.advanceOneTick();
    expect(tick.hitscanResults?.[0]).toMatchObject({
      resolution: {
        accepted: true,
        outcome: 'miss',
        reason: 'no_target',
        debug: {
          filteredSelfCount: 1,
          filteredTeamCount: 1,
          filteredDeadCount: 1,
          analyticVolumeIntersectionCount: 0,
        },
      },
      damage: null,
    });
    expect(playerHealth(authority, 'player_B')).toBe(100);
    expect(playerHealth(authority, 'player_C')).toBe(0);
  });

  it('resets target pose history on resume and respawn, failing closed until refill', () => {
    const resumedTargetRoom = room();
    startTwoPlayerRoom(resumedTargetRoom);
    advanceTo(resumedTargetRoom, 20);
    expect(resumedTargetRoom.disconnectConnection('connection_B')).toBe(true);
    expect(resumedTargetRoom.resumePlayer({
      playerId: 'player_B',
      connectionId: 'connection_B2',
    })).toMatchObject({ ok: true, connectionMode: 'resumed' });
    resumedTargetRoom.recordServerObservedRtt('player_A', 350);
    resumedTargetRoom.enqueueInputBatch('connection_A', fireBatch(0, resumedTargetRoom.serverTick));
    expect(resumedTargetRoom.advanceOneTick().hitscanResults?.[0]).toMatchObject({
      resolution: {
        accepted: false,
        outcome: 'rejected',
        reason: 'target_history_unavailable',
        debug: { missingHistoryCount: 1 },
      },
      damage: null,
    });

    const respawnedTargetRoom = room();
    startTwoPlayerRoom(respawnedTargetRoom);
    advanceTo(respawnedTargetRoom, 20);
    expect(respawnedTargetRoom.applyCombatDamage({
      targetPlayerId: 'player_B',
      sourcePlayerId: null,
      damagePoints: 100,
      causeId: 'test.respawn_reset',
    })).toMatchObject({ accepted: true, state: { respawnEligibleAtTick: 180 } });
    advanceTo(respawnedTargetRoom, 180);
    expect(respawnedTargetRoom.respawnCombatPlayer('player_B')).toMatchObject({ accepted: true });
    respawnedTargetRoom.recordServerObservedRtt('player_A', 350);
    respawnedTargetRoom.enqueueInputBatch(
      'connection_A',
      fireBatch(0, respawnedTargetRoom.serverTick),
    );
    expect(respawnedTargetRoom.advanceOneTick().hitscanResults?.[0]).toMatchObject({
      resolution: {
        accepted: false,
        reason: 'target_history_unavailable',
        debug: { missingHistoryCount: 1 },
      },
      damage: null,
    });
  });

  it('resets server RTT history on resume and never substitutes a client value', () => {
    const authority = room();
    startTwoPlayerRoom(authority);
    advanceTo(authority, 20);
    authority.recordServerObservedRtt('player_A', 350);
    expect(authority.disconnectConnection('connection_A')).toBe(true);
    expect(authority.resumePlayer({
      playerId: 'player_A',
      connectionId: 'connection_A2',
    })).toMatchObject({ ok: true, connectionMode: 'resumed' });
    authority.enqueueInputBatch('connection_A2', fireBatch(0, authority.serverTick));
    expect(authority.advanceOneTick().hitscanResults?.[0]).toMatchObject({
      roomRejectionReason: 'server_rtt_history_unavailable',
      resolution: null,
      damage: null,
    });
  });

  it('resolves simultaneous accepted shots in stable order from the same phase-one state', () => {
    const run = (joinOrder: readonly string[]) => {
      const authority = room();
      for (const suffix of joinOrder) join(authority, suffix);
      expect(authority.startMatch()).toBe(true);
      advanceTo(authority, 20);
      for (const suffix of ['A', 'B']) {
        expect(authority.applyCombatDamage({
          targetPlayerId: `player_${suffix}`,
          sourcePlayerId: null,
          damagePoints: 90,
          causeId: `test.simultaneous_setup_${suffix}`,
        })).toMatchObject({ accepted: true, state: { healthPoints: 10 } });
        authority.recordServerObservedRtt(`player_${suffix}`, 0);
        authority.enqueueInputBatch(
          `connection_${suffix}`,
          fireBatch(0, authority.serverTick),
        );
      }
      const tick = authority.advanceOneTick();
      return {
        results: tick.hitscanResults,
        players: authority.fullSnapshot().players.map((player) => ({
          playerId: player.playerId,
          phase: player.combat?.life.phase,
          healthPoints: player.combat?.life.healthPoints,
        })),
      };
    };

    const forward = run(['A', 'B']);
    const reverse = run(['B', 'A']);
    expect(reverse).toEqual(forward);
    expect(forward.results).toMatchObject([
      {
        resolutionOrdinal: 0,
        acceptedShot: { playerId: 'player_A' },
        resolution: { outcome: 'hit', hit: { targetPlayerId: 'player_B' } },
        damage: { accepted: true, death: { victimPlayerId: 'player_B' } },
      },
      {
        resolutionOrdinal: 1,
        acceptedShot: { playerId: 'player_B' },
        resolution: { outcome: 'hit', hit: { targetPlayerId: 'player_A' } },
        damage: { accepted: true, death: { victimPlayerId: 'player_A' } },
      },
    ]);
    expect(forward.players).toEqual([
      { playerId: 'player_A', phase: 'dead', healthPoints: 0 },
      { playerId: 'player_B', phase: 'dead', healthPoints: 0 },
    ]);
  });
});
