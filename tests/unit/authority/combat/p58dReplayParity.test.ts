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
  type AuthorityRoomTickResult,
} from '../../../../src/authority';
import {
  PROTOCOL_VERSION,
  hashCombatConsequenceV1,
  type CombatConsequenceDigestV1,
  type InputBatchMessage,
} from '../../../../src/net';
import { INTENT_BUTTON, PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../../../src/sim';
import { FakeMovementQueryPort } from '../../sim/movement/fakeQueryPort';

function input(sequence: number, clientTick: number, heldButtons: number): InputBatchMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'inputBatch',
    commands: [{
      type: 'input',
      sequence,
      clientTick,
      moveX: 0,
      moveY: 0,
      lookYawDeltaMilliDegrees: 0,
      lookPitchDeltaMilliDegrees: 0,
      heldButtons,
      pressedButtons: 0,
      releasedButtons: heldButtons === 0 ? INTENT_BUTTON.primaryFire : 0,
      selectedSlot: 0,
    }],
  };
}

function directRoom(): AuthoritativeRoom {
  return new AuthoritativeRoom({
    identity: {
      roomId: 'room.p58d.node',
      matchId: 'match.p58d.node',
      rulesetId: G4_COMBAT_RULESET_ID,
      rulesetRevision: G4_COMBAT_RULESET_REVISION,
      rulesetHash: G4_COMBAT_RULESET_HASH,
      mapId: 'p58d_node_fixture',
      fixtureId: 'p58d_node_fixture',
      fixtureHash: '5858585858585858',
      physicsAdapterId: 'fake_query_port',
      physicsAdapterVersion: '1.0.0',
    },
    profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
    queries: new FakeMovementQueryPort(),
    spawnResolver: (playerId) => ({
      spawnId: `spawn.${playerId}`,
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
        worldOcclusion: () => ({
          schemaVersion: 1,
          hit: false,
          distanceMillimeters: null,
          colliderId: null,
        }),
      },
      impulseGrenade: {
        capabilityId: G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
        world: {
          schemaVersion: IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
          sweepSphere: () => ({ schemaVersion: 1, contacts: [] }),
          traceRadialOcclusion: () => ({ schemaVersion: 1, kind: 'clear' }),
          resolveCollisionSafeImpulse: (request) => ({
            schemaVersion: 1,
            appliedImpulseMillimetersPerSecond:
              request.requestedImpulseMillimetersPerSecond,
          }),
        },
      },
      abilityResources: { capabilityId: G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID },
      match: { capabilityId: G4_TDM_MATCH_ROOM_CAPABILITY_ID },
    },
  });
}

function semanticCounts(frames: readonly AuthorityRoomTickResult[]) {
  const events = frames.flatMap((frame) => [
    ...(frame.combatEvents ?? []),
    ...(frame.matchEvents ?? []),
  ]);
  return {
    shotAccepted: events.filter(({ kind }) => kind === 'auto_rifle_shot_accepted').length,
    damageApplied: events.filter(({ kind }) => kind === 'damage_applied').length,
    playerKilled: events.filter(({ kind }) => kind === 'death').length,
  };
}

describe('P5.8D portable replay digest', () => {
  it('pins the Node authority consequence to the real Worker/WSS digest', () => {
    const authority = directRoom();
    expect(authority.joinNewPlayer({
      playerId: 'player_A',
      connectionId: 'connection_A',
    })).toMatchObject({ ok: true });
    expect(authority.joinNewPlayer({
      playerId: 'player_B',
      connectionId: 'connection_B',
    })).toMatchObject({ ok: true });
    expect(authority.startMatch()).toBe(true);

    const frames: AuthorityRoomTickResult[] = [];
    let sequence = 0;
    while (authority.serverTick < 200) {
      if (authority.serverTick >= 40) {
        authority.recordServerObservedRtt('player_A', 0);
        expect(authority.enqueueInputBatch(
          'connection_A',
          input(sequence, authority.serverTick, INTENT_BUTTON.primaryFire),
        ).accepted).toBe(1);
        sequence += 1;
      }
      frames.push(authority.advanceOneTick());
      const target = authority.fullSnapshot().players
        .find(({ playerId }) => playerId === 'player_B');
      if (target?.combat?.life.phase !== 'dead') continue;
      expect(authority.enqueueInputBatch(
        'connection_A',
        input(sequence, authority.serverTick, 0),
      ).accepted).toBe(1);
      frames.push(authority.advanceOneTick());
      break;
    }

    const snapshot = authority.fullSnapshot();
    const shooter = snapshot.players.find(({ playerId }) => playerId === 'player_A');
    const target = snapshot.players.find(({ playerId }) => playerId === 'player_B');
    const consequence = {
      acceptedShotCount: shooter?.combat?.autoRifle.acceptedShotCount ?? -1,
      magazineRounds: shooter?.combat?.autoRifle.magazineRounds ?? -1,
      targetHealthPoints: target?.combat?.life.healthPoints ?? -1,
      targetDeathOrdinal: target?.combat?.life.deathOrdinal ?? -1,
      blueScore: snapshot.match?.teamScores
        .find(({ teamId }) => teamId === 'team_blue')?.score ?? -1,
      feedSequence: snapshot.match?.feedSequence ?? -1,
      eventCounts: semanticCounts(frames),
    } satisfies CombatConsequenceDigestV1;
    expect(consequence).toEqual({
      acceptedShotCount: 10,
      magazineRounds: 40,
      targetHealthPoints: 0,
      targetDeathOrdinal: 1,
      blueScore: 1,
      feedSequence: 1,
      eventCounts: { shotAccepted: 10, damageApplied: 10, playerKilled: 1 },
    });
    expect(hashCombatConsequenceV1(consequence)).toBe('c614736551a1a503');
  });
});
