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
} from '../../../src/authority';
import { PROTOCOL_VERSION, type InputBatchMessage } from '../../../src/net';
import { INTENT_BUTTON, PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../../src/sim';
import { FakeMovementQueryPort } from '../sim/movement/fakeQueryPort';

function room(): AuthoritativeRoom {
  return new AuthoritativeRoom({
    identity: {
      roomId: 'room.active.checkpoint',
      matchId: 'match.active.checkpoint',
      rulesetId: G4_COMBAT_RULESET_ID,
      rulesetRevision: G4_COMBAT_RULESET_REVISION,
      rulesetHash: G4_COMBAT_RULESET_HASH,
      mapId: 'inkfall_foundry_revision_2',
      fixtureId: 'inkfall_foundry_revision_2',
      fixtureHash: '5151515151515151',
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
            appliedImpulseMillimetersPerSecond: request.requestedImpulseMillimetersPerSecond,
          }),
        },
      },
      abilityResources: { capabilityId: G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID },
      match: { capabilityId: G4_TDM_MATCH_ROOM_CAPABILITY_ID },
    },
  });
}

function input(
  sequence: number,
  clientTick: number,
  pressedButtons: number,
): InputBatchMessage {
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
      heldButtons: pressedButtons,
      pressedButtons,
      releasedButtons: 0,
      selectedSlot: 0,
    }],
  };
}

function liveCheckpointRoom(): AuthoritativeRoom {
  const authority = room();
  expect(authority.joinNewPlayer({ playerId: 'player_A', connectionId: 'connection_A' }))
    .toMatchObject({ ok: true });
  expect(authority.joinNewPlayer({ playerId: 'player_B', connectionId: 'connection_B' }))
    .toMatchObject({ ok: true });
  expect(authority.startMatch()).toBe(true);
  while (authority.serverTick < 40) authority.advanceOneTick();
  authority.recordServerObservedRtt('player_A', 75);
  expect(authority.enqueueInputBatch(
    'connection_A',
    input(0, authority.serverTick, INTENT_BUTTON.abilityOne),
  ).accepted).toBe(1);
  authority.advanceOneTick();
  expect(authority.applyCombatDamage({
    targetPlayerId: 'player_B',
    sourcePlayerId: 'player_A',
    damagePoints: 100,
    causeId: 'checkpoint_test',
  })).toMatchObject({ accepted: true, state: { phase: 'dead' } });
  expect(authority.enqueueInputBatch(
    'connection_A',
    input(2, authority.serverTick, 0),
  ).accepted).toBe(1);
  return authority;
}

describe('P5.13 active-match authority checkpoint', () => {
  it('round-trips exact live clocks, combat, projectile, queues, and ordinals', () => {
    const source = liveCheckpointRoom();
    const checkpoint = JSON.parse(JSON.stringify(source.exportActiveMatchCheckpoint())) as unknown;
    const restored = room();
    expect(restored.restoreActiveMatchCheckpoint(checkpoint)).toEqual(source.fullSnapshot());
    expect(restored.exportActiveMatchCheckpoint()).toEqual(source.exportActiveMatchCheckpoint());

    source.advanceOneTick();
    restored.advanceOneTick();
    expect(restored.exportActiveMatchCheckpoint()).toEqual(source.exportActiveMatchCheckpoint());
  });

  it('fails closed without partially mutating a pristine authority', () => {
    const source = liveCheckpointRoom();
    const checkpoint = JSON.parse(JSON.stringify(source.exportActiveMatchCheckpoint())) as ReturnType<
      AuthoritativeRoom['exportActiveMatchCheckpoint']
    >;
    const attempts: unknown[] = [
      { ...checkpoint, schemaVersion: 2 },
      { ...checkpoint, identity: { ...checkpoint.identity, fixtureHash: '5252525252525252' } },
      {
        ...checkpoint,
        options: {
          ...checkpoint.options,
          impulseGrenadeCapabilityId: 'authoritative_impulse_grenade_v1',
        },
      },
      {
        ...checkpoint,
        counters: { ...checkpoint.counters, nextCombatEventSequence: 0 },
      },
      {
        ...checkpoint,
        impulseGrenadeProjectiles: checkpoint.impulseGrenadeProjectiles.map((projectile) => ({
          ...projectile,
          lastProcessedAuthorityTick: projectile.lastProcessedAuthorityTick - 1,
        })),
      },
      {
        ...checkpoint,
        impulseGrenadeProjectiles: checkpoint.impulseGrenadeProjectiles.map((projectile) => ({
          ...projectile,
          accelerationMillimetersPerSecondSquared: { x: 0, y: 0, z: 0 },
        })),
      },
    ];
    for (const corrupt of attempts) {
      const target = room();
      expect(() => target.restoreActiveMatchCheckpoint(corrupt)).toThrow();
      expect(target.lifecycle).toBe('created');
      expect(target.serverTick).toBe(0);
      expect(target.fullSnapshot().players).toEqual([]);
    }
  });
});
