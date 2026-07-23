import { describe, expect, it } from 'vitest';

import {
  AuthoritativeRoom,
  G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID,
  G4_COMBAT_ROOM_PROFILE_ID,
  G4_COMBAT_RULESET_HASH,
  G4_COMBAT_RULESET_ID,
  G4_COMBAT_RULESET_REVISION,
  G4_HITSCAN_ROOM_CAPABILITY_ID,
  G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
  G4_TDM_MATCH_ROOM_CAPABILITY_ID,
  IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
  type AuthorityImpulseGrenadeWorldPort,
  type AuthorityRoomTickResult,
  type AuthorityWorldOcclusionPort,
} from '../../../../src/authority';
import {
  applyCombatPresentationSnapshot,
  createCombatPresentationAdapter,
} from '../../../../src/client';
import { PROTOCOL_VERSION, type InputBatchMessage } from '../../../../src/net';
import { INTENT_BUTTON, PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../../../src/sim';
import { FakeMovementQueryPort } from '../../sim/movement/fakeQueryPort';

type DeliveryProfile = 'baseline' | 'loss' | 'reorder' | 'duplicate';

interface SemanticEventDigestV1 {
  readonly eventId: string;
  readonly kind: string;
  readonly authorityTick: number;
}

const clearWorld: AuthorityWorldOcclusionPort = () => ({
  schemaVersion: 1,
  hit: false,
  distanceMillimeters: null,
  colliderId: null,
});

function grenadeWorld(): AuthorityImpulseGrenadeWorldPort {
  return {
    schemaVersion: IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
    sweepSphere: (request) => {
      const translation = request.translationMillimeters;
      const magnitudes = {
        x: Math.abs(translation.x),
        y: Math.abs(translation.y),
        z: Math.abs(translation.z),
      };
      const maximum = Math.max(magnitudes.x, magnitudes.y, magnitudes.z);
      if (maximum === 0) return { schemaVersion: 1, contacts: [] };
      const normalQ15 = magnitudes.x === maximum
        ? { x: translation.x > 0 ? -32_767 : 32_767, y: 0, z: 0 }
        : magnitudes.y === maximum
          ? { x: 0, y: translation.y > 0 ? -32_767 : 32_767, z: 0 }
          : { x: 0, y: 0, z: translation.z > 0 ? -32_767 : 32_767 };
      return {
        schemaVersion: 1,
        contacts: [{
          colliderId: 'p58b_opposing_contact',
          layer: 'world_static',
          playerId: null,
          timeOfImpactPermille: 500,
          normalQ15,
        }],
      };
    },
    traceRadialOcclusion: () => ({ schemaVersion: 1, kind: 'clear' }),
    resolveCollisionSafeImpulse: (request) => ({
      schemaVersion: 1,
      appliedImpulseMillimetersPerSecond: request.requestedImpulseMillimetersPerSecond,
    }),
  };
}

function fullCombatRoom(roomSuffix: string): AuthoritativeRoom {
  return new AuthoritativeRoom({
    identity: {
      roomId: `room_p58b_${roomSuffix}`,
      matchId: `match_p58b_${roomSuffix}`,
      rulesetId: G4_COMBAT_RULESET_ID,
      rulesetRevision: G4_COMBAT_RULESET_REVISION,
      rulesetHash: G4_COMBAT_RULESET_HASH,
      mapId: 'p58b_consequence_fixture',
      fixtureId: 'p58b_consequence_fixture',
      fixtureHash: '5858585858585858',
      physicsAdapterId: 'fake_query_port',
      physicsAdapterVersion: '1.0.0',
    },
    profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
    queries: new FakeMovementQueryPort(),
    warmupTicks: 40,
    activeTicks: 9_600,
    postmatchTicks: 200,
    reconnectGraceTicks: 400,
    minimumConnectedPlayersToStart: 2,
    spawnResolver: (playerId) => ({
      spawnId: `spawn_${playerId}`,
      feetPosition: playerId === 'player_A'
        ? { x: 0, y: 0, z: 0 }
        : { x: 0, y: 0, z: 3_000 },
      yawMilliDegrees: playerId === 'player_A' ? 0 : 180_000,
    }),
    combat: {
      profileId: G4_COMBAT_ROOM_PROFILE_ID,
      teamResolver: (playerId) => playerId === 'player_A' ? 'team_blue' : 'team_red',
      hitscan: {
        capabilityId: G4_HITSCAN_ROOM_CAPABILITY_ID,
        worldOcclusion: clearWorld,
      },
      impulseGrenade: {
        capabilityId: G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
        world: grenadeWorld(),
      },
      abilityResources: { capabilityId: G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID },
      match: { capabilityId: G4_TDM_MATCH_ROOM_CAPABILITY_ID },
    },
  });
}

function startTwoPlayers(authority: AuthoritativeRoom): void {
  expect(authority.joinNewPlayer({
    playerId: 'player_A',
    connectionId: 'connection_A',
  })).toMatchObject({ ok: true });
  expect(authority.joinNewPlayer({
    playerId: 'player_B',
    connectionId: 'connection_B',
  })).toMatchObject({ ok: true });
  expect(authority.startMatch()).toBe(true);
}

function inputBatch(options: {
  readonly sequence: number;
  readonly clientTick: number;
  readonly heldButtons?: number;
  readonly pressedButtons?: number;
  readonly releasedButtons?: number;
  readonly lookPitchDeltaMilliDegrees?: number;
}): InputBatchMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'inputBatch',
    commands: [{
      type: 'input',
      sequence: options.sequence,
      clientTick: options.clientTick,
      moveX: 0,
      moveY: 0,
      lookYawDeltaMilliDegrees: 0,
      lookPitchDeltaMilliDegrees: options.lookPitchDeltaMilliDegrees ?? 0,
      heldButtons: options.heldButtons ?? 0,
      pressedButtons: options.pressedButtons ?? 0,
      releasedButtons: options.releasedButtons ?? 0,
      selectedSlot: 0,
    }],
  };
}

function semanticEvents(frame: AuthorityRoomTickResult): readonly SemanticEventDigestV1[] {
  return Object.freeze([
    ...(frame.combatEvents ?? []),
    ...(frame.impulseGrenadeEvents ?? []),
    ...(frame.abilityResourceEvents ?? []),
    ...(frame.matchEvents ?? []),
  ].map(({ eventId, kind, authorityTick }) => Object.freeze({
    eventId,
    kind,
    authorityTick,
  })));
}

function fnv1a64(source: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function runImpairmentProfile(profile: DeliveryProfile): Readonly<{
  hash: string;
  snapshot: ReturnType<AuthoritativeRoom['fullSnapshot']>;
  events: readonly SemanticEventDigestV1[];
}> {
  const authority = fullCombatRoom('impairment');
  startTwoPlayers(authority);
  const fire = INTENT_BUTTON.primaryFire;
  const grenade = INTENT_BUTTON.abilityOne;
  const events: SemanticEventDigestV1[] = [];

  const deliver = (message: InputBatchMessage): void => {
    const accepted = authority.enqueueInputBatch('connection_A', message);
    expect(accepted.accepted).toBe(1);
    if (profile === 'duplicate') {
      expect(authority.enqueueInputBatch('connection_A', message).rejections).toEqual([{
        sequence: message.commands[0]!.sequence,
        reason: 'duplicate_sequence',
      }]);
    }
  };

  while (authority.serverTick < 400) {
    const tick = authority.serverTick;
    if (tick >= 50) authority.recordServerObservedRtt('player_A', 0);
    if (tick === 50) {
      deliver(inputBatch({
        sequence: 0,
        clientTick: 50,
        heldButtons: fire,
      }));
    } else if (tick === 51) {
      if (profile === 'baseline' || profile === 'duplicate') {
        deliver(inputBatch({ sequence: 1, clientTick: 51, heldButtons: fire }));
      } else {
        deliver(inputBatch({ sequence: 2, clientTick: 52, heldButtons: fire }));
      }
    } else if (tick === 52) {
      if (profile === 'baseline' || profile === 'duplicate') {
        deliver(inputBatch({ sequence: 2, clientTick: 52, heldButtons: fire }));
      } else if (profile === 'reorder') {
        deliver(inputBatch({ sequence: 1, clientTick: 51, heldButtons: fire }));
      }
    } else if (tick >= 53 && tick < 80) {
      deliver(inputBatch({
        sequence: tick - 50,
        clientTick: tick,
        heldButtons: fire,
      }));
    } else if (tick === 80) {
      deliver(inputBatch({
        sequence: 30,
        clientTick: 80,
        releasedButtons: fire,
      }));
    } else if (tick === 90) {
      deliver(inputBatch({
        sequence: 31,
        clientTick: 90,
        heldButtons: grenade,
        pressedButtons: grenade,
        lookPitchDeltaMilliDegrees: -2_000,
      }));
    } else if (tick === 91) {
      deliver(inputBatch({
        sequence: 32,
        clientTick: 91,
        releasedButtons: grenade,
      }));
    }
    events.push(...semanticEvents(authority.advanceOneTick()));
  }

  const snapshot = authority.fullSnapshot();
  const canonical = JSON.stringify({ snapshot, events });
  return Object.freeze({
    hash: fnv1a64(canonical),
    snapshot,
    events: Object.freeze(events),
  });
}

function eventKindCounts(events: readonly SemanticEventDigestV1[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const event of events) counts[event.kind] = (counts[event.kind] ?? 0) + 1;
  return Object.freeze(counts);
}

describe('P5.8B combat consequence impairment and composite reconnect', () => {
  it('keeps full combat consequences bounded under loss, reorder, and duplicate input delivery', () => {
    const results = (['baseline', 'loss', 'reorder', 'duplicate'] as const)
      .map((profile) => ({
        profile,
        first: runImpairmentProfile(profile),
        replay: runImpairmentProfile(profile),
      }));
    const baseline = results[0]!;
    for (const result of results) {
      expect(result.first.hash).toMatch(/^[a-f0-9]{16}$/u);
      expect(result.replay).toEqual(result.first);
      expect(new Set(result.first.events.map(({ eventId }) => eventId)).size)
        .toBe(result.first.events.length);

      const playerA = result.first.snapshot.players
        .find(({ playerId }) => playerId === 'player_A');
      const playerB = result.first.snapshot.players
        .find(({ playerId }) => playerId === 'player_B');
      expect(playerA?.combat).toMatchObject({
        autoRifle: { magazineRounds: 35, acceptedShotCount: 15 },
        impulseGrenade: { phase: 'ready', acceptedThrowCount: 1 },
        abilityResources: {
          damageAbilityOne: { phase: 'ready', cooldownTicksRemaining: 0 },
        },
      });
      expect(playerB?.combat?.life).toMatchObject({
        phase: 'dead',
        healthPoints: 0,
        deathOrdinal: 1,
      });
      expect(result.first.snapshot).toMatchObject({
        serverTick: 400,
        lifecycle: 'active',
        impulseGrenadeProjectiles: [],
        match: {
          phase: 'active',
          teamScores: [
            { teamId: 'team_blue', score: 1 },
            { teamId: 'team_red', score: 0 },
          ],
          feedSequence: 1,
          feed: [expect.objectContaining({ victimPlayerId: 'player_B' })],
        },
      });
      expect(eventKindCounts(result.first.events)).toMatchObject({
        auto_rifle_shot_accepted: 15,
        damage_applied: 10,
        death: 1,
        team_score_changed: 1,
        kill_feed_entry: 1,
        impulse_grenade_throw_accepted: 1,
        impulse_grenade_detonated: 1,
        impulse_grenade_impulse_applied: 1,
      });
    }
    expect(results[2]!.first).toEqual(baseline.first);
    expect(results[3]!.first).toEqual(baseline.first);
    expect(Object.fromEntries(results.map(({ profile, first }) => [profile, first.hash])))
      .toEqual({
        baseline: '02bc18767aada74b',
        loss: '8895a698a8421aed',
        reorder: '02bc18767aada74b',
        duplicate: '02bc18767aada74b',
      });
  }, 15_000);

  it('resumes one snapshot containing active reload/projectile, dead countdown, and active match', () => {
    const authority = fullCombatRoom('reconnect');
    startTwoPlayers(authority);
    while (authority.serverTick < 40) authority.advanceOneTick();
    expect(authority.applyCombatDamage({
      targetPlayerId: 'player_B',
      sourcePlayerId: 'player_A',
      damagePoints: 100,
      causeId: 'p58b.reconnect.lethal',
    })).toMatchObject({
      accepted: true,
      state: { phase: 'dead', respawnEligibleAtTick: 200 },
    });

    const fire = INTENT_BUTTON.primaryFire;
    const grenade = INTENT_BUTTON.abilityOne;
    authority.enqueueInputBatch('connection_A', inputBatch({
      sequence: 0,
      clientTick: 40,
      heldButtons: fire | grenade,
      pressedButtons: fire | grenade,
    }));
    authority.advanceOneTick();
    authority.enqueueInputBatch('connection_A', inputBatch({
      sequence: 1,
      clientTick: 41,
      releasedButtons: fire,
    }));
    authority.advanceOneTick();
    authority.advanceOneTick();
    authority.enqueueInputBatch('connection_A', inputBatch({
      sequence: 2,
      clientTick: 43,
      heldButtons: INTENT_BUTTON.reload,
      pressedButtons: INTENT_BUTTON.reload,
    }));
    authority.advanceOneTick();

    expect(authority.disconnectConnection('connection_A')).toBe(true);
    const resumed = authority.resumePlayer({
      playerId: 'player_A',
      connectionId: 'connection_A2',
    });
    expect(resumed).toMatchObject({ ok: true, connectionMode: 'resumed' });
    if (!resumed.ok) return;
    const snapshot = resumed.snapshot;
    const playerA = snapshot.players.find(({ playerId }) => playerId === 'player_A');
    const playerB = snapshot.players.find(({ playerId }) => playerId === 'player_B');
    expect(snapshot).toMatchObject({
      serverTick: 44,
      lifecycle: 'active',
      impulseGrenadeProjectiles: [expect.objectContaining({
        ownerPlayerId: 'player_A',
        phase: 'active',
        detonatesAtTick: 71,
        lifetimeEndsAtTick: 161,
      })],
      match: {
        phase: 'active',
        teamScores: [
          { teamId: 'team_blue', score: 1 },
          { teamId: 'team_red', score: 0 },
        ],
        feedSequence: 1,
      },
    });
    expect(playerA).toMatchObject({
      connected: true,
      combat: {
        autoRifle: {
          phase: 'reloading',
          magazineRounds: 49,
          activeReload: { completesAtTick: 104 },
        },
        impulseGrenade: { phase: 'cooldown', cooldownEndsAtTick: 281 },
      },
    });
    expect(playerB?.combat?.life).toMatchObject({
      phase: 'dead',
      healthPoints: 0,
      respawnEligibleAtTick: 200,
    });

    const hydrated = applyCombatPresentationSnapshot(
      createCombatPresentationAdapter({ schemaVersion: 1, localPlayerId: 'player_A' }),
      snapshot,
    );
    expect(hydrated.adapter.view).toMatchObject({
      serverTick: 44,
      lifecycle: 'active',
      localPlayer: {
        rifle: { phase: 'reloading', magazineRounds: 49, reloadCompletesAtTick: 104 },
        impulseGrenade: { phase: 'cooldown', cooldownEndsAtTick: 281 },
      },
      match: { phase: 'active', feedSequence: 1 },
      projectiles: [expect.objectContaining({ ownerPlayerId: 'player_A' })],
    });

    const continuationEvents: SemanticEventDigestV1[] = [];
    while (authority.serverTick < 281) {
      continuationEvents.push(...semanticEvents(authority.advanceOneTick()));
    }
    expect(eventKindCounts(continuationEvents)).toMatchObject({
      impulse_grenade_detonated: 1,
      impulse_grenade_impulse_applied: 1,
      auto_rifle_reload_completed: 1,
    });
    const finalSnapshot = authority.fullSnapshot();
    expect(finalSnapshot).toMatchObject({
      serverTick: 281,
      lifecycle: 'active',
      impulseGrenadeProjectiles: [],
    });
    expect(finalSnapshot.players.find(({ playerId }) => playerId === 'player_A'))
      .toMatchObject({
        playerId: 'player_A',
        combat: {
          autoRifle: {
            phase: 'ready',
            magazineRounds: 50,
            reserveRounds: 149,
            activeReload: null,
          },
        },
      });
  });
});
