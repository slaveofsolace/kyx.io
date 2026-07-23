import { describe, expect, it } from 'vitest';

import {
  AuthoritativeRoom,
  G4_COMBAT_ROOM_PROFILE_ID,
  G4_COMBAT_RULESET_HASH,
  G4_COMBAT_RULESET_ID,
  G4_COMBAT_RULESET_REVISION,
  G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
  IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
  type AuthorityImpulseGrenadeWorldPort,
  type AuthorityRoomOptions,
  type ImpulseGrenadeCollisionSafeImpulseRequestV1,
  type ImpulseGrenadeRadialOcclusionRequestV1,
  type ImpulseGrenadeSweepSphereRequestV1,
  type ImpulseGrenadeSweepSphereResultV1,
} from '../../../../src/authority';
import { hashRulesetContent, requireRuleset } from '../../../../src/content';
import { PROTOCOL_VERSION, type InputBatchMessage } from '../../../../src/net';
import { INTENT_BUTTON, PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../../../src/sim';
import { FakeMovementQueryPort } from '../../sim/movement/fakeQueryPort';

const Q15 = 32_767;

function grenadeWorld(options: {
  readonly sweep?: (request: ImpulseGrenadeSweepSphereRequestV1) => ImpulseGrenadeSweepSphereResultV1;
  readonly occlusion?: (request: ImpulseGrenadeRadialOcclusionRequestV1) =>
    ReturnType<AuthorityImpulseGrenadeWorldPort['traceRadialOcclusion']>;
  readonly safeImpulse?: (request: ImpulseGrenadeCollisionSafeImpulseRequestV1) =>
    ReturnType<AuthorityImpulseGrenadeWorldPort['resolveCollisionSafeImpulse']>;
} = {}): AuthorityImpulseGrenadeWorldPort {
  return {
    schemaVersion: IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
    sweepSphere: options.sweep ?? (() => ({ schemaVersion: 1, contacts: [] })),
    traceRadialOcclusion: options.occlusion ?? (() => ({ schemaVersion: 1, kind: 'clear' })),
    resolveCollisionSafeImpulse: options.safeImpulse ?? ((request) => ({
      schemaVersion: 1,
      appliedImpulseMillimetersPerSecond: request.requestedImpulseMillimetersPerSecond,
    })),
  };
}

function roomOptions(options: {
  readonly grenade?: boolean;
  readonly world?: AuthorityImpulseGrenadeWorldPort;
  readonly spawnZ?: Readonly<Record<string, number>>;
} = {}): AuthorityRoomOptions {
  const content = requireRuleset(G4_COMBAT_RULESET_ID, G4_COMBAT_RULESET_REVISION);
  expect(hashRulesetContent(content)).toBe(G4_COMBAT_RULESET_HASH);
  return {
    identity: {
      roomId: 'room_GRENADE',
      matchId: 'match_GRENADE',
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
      feetPosition: { x: 0, y: 0, z: options.spawnZ?.[playerId] ?? 0 },
      yawMilliDegrees: playerId === 'player_A' ? 0 : 180_000,
    }),
    combat: {
      profileId: G4_COMBAT_ROOM_PROFILE_ID,
      teamResolver: (playerId) => playerId === 'player_A' ? 'team_blue' : 'team_red',
      ...(options.grenade === false
        ? {}
        : {
            impulseGrenade: {
              capabilityId: G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
              world: options.world ?? grenadeWorld(),
            },
          }),
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

function start(authority: AuthoritativeRoom, thirdPlayer = false): void {
  join(authority, 'A');
  join(authority, 'B');
  if (thirdPlayer) join(authority, 'C');
  expect(authority.startMatch()).toBe(true);
}

function batch(
  sequence: number,
  clientTick: number,
  pressedButtons = 0,
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

function throwBatch(sequence: number, clientTick: number): InputBatchMessage {
  return batch(sequence, clientTick, INTENT_BUTTON.abilityOne);
}

function advanceTo(authority: AuthoritativeRoom, targetTick: number): void {
  while (authority.serverTick < targetTick) authority.advanceOneTick();
}

describe('P5.4 exact authoritative room Impulse Grenade integration', () => {
  it('is absent by default and rejects non-exact capability and client outcome fields', () => {
    const combatOnly = room({ grenade: false });
    start(combatOnly);
    const priorTick = combatOnly.advanceOneTick();
    expect(priorTick.impulseGrenadeEvents).toBeUndefined();
    expect(priorTick.impulseGrenadeResults).toBeUndefined();
    expect(combatOnly.fullSnapshot().players[0]?.combat?.impulseGrenade).toBeUndefined();
    expect(combatOnly.fullSnapshot().impulseGrenadeProjectiles).toBeUndefined();

    const base = roomOptions();
    expect(() => new AuthoritativeRoom({
      ...base,
      combat: {
        profileId: G4_COMBAT_ROOM_PROFILE_ID,
        impulseGrenade: {
          capabilityId: 'client_grenade',
          world: grenadeWorld(),
        },
      },
    } as never)).toThrow(/capability is unsupported/u);
    expect(() => new AuthoritativeRoom({
      ...base,
      combat: {
        profileId: G4_COMBAT_ROOM_PROFILE_ID,
        impulseGrenade: {
          capabilityId: G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
          world: grenadeWorld(),
          clientFuseTick: 12,
        },
      },
    } as never)).toThrow(/unsupported or missing fields/u);

    const protectedRoom = room();
    start(protectedRoom);
    expect(() => protectedRoom.enqueueInputBatch('connection_A', {
      ...throwBatch(0, 0),
      commands: [{
        ...throwBatch(0, 0).commands[0],
        claimedProjectileOrigin: { x: 0, y: 0, z: 0 },
        claimedDetonationTargets: ['player_B'],
      }],
    })).toThrow('AUTHORITY_INPUT_BATCH_INVALID');
  });

  it('derives the projectile from authority pose and starts cooldown atomically', () => {
    const sweeps: ImpulseGrenadeSweepSphereRequestV1[] = [];
    const authority = room({
      world: grenadeWorld({
        sweep: (request) => {
          sweeps.push(request);
          return { schemaVersion: 1, contacts: [] };
        },
      }),
      spawnZ: { player_A: 0, player_B: 20_000 },
    });
    start(authority);
    advanceTo(authority, 7);
    authority.enqueueInputBatch('connection_A', throwBatch(0, authority.serverTick));
    const acceptedTick = authority.advanceOneTick();
    expect(acceptedTick.impulseGrenadeEvents).toEqual([
      expect.objectContaining({
        kind: 'impulse_grenade_throw_accepted',
        authorityTick: 8,
        playerId: 'player_A',
        throwOrdinal: 1,
        cooldownEndsAtTick: 248,
      }),
    ]);
    expect(acceptedTick.impulseGrenadeResults).toEqual([]);
    expect(sweeps).toHaveLength(1);
    expect(sweeps[0]).toMatchObject({
      authorityTick: 8,
      ownerPlayerId: 'player_A',
      centerMillimeters: { x: 0, z: 200 },
      translationMillimeters: { x: 0, y: 0, z: 900 },
      radiusMillimeters: 150,
      ignoredPlayerIds: ['player_A'],
    });
    const snapshot = authority.fullSnapshot();
    expect(snapshot.players.find((player) => player.playerId === 'player_A')?.combat?.impulseGrenade)
      .toMatchObject({ phase: 'cooldown', cooldownEndsAtTick: 248, acceptedThrowCount: 1 });
    expect(snapshot.impulseGrenadeProjectiles).toEqual([
      expect.objectContaining({
        ownerPlayerId: 'player_A',
        spawnTick: 8,
        positionMillimeters: expect.objectContaining({ x: 0, z: 1_100 }),
        velocityMillimetersPerSecond: { x: 0, y: 0, z: 18_000 },
      }),
    ]);

    authority.enqueueInputBatch('connection_A', throwBatch(1, authority.serverTick));
    const coolingTick = authority.advanceOneTick();
    expect(coolingTick.impulseGrenadeEvents).toEqual([]);
    expect(authority.fullSnapshot().players
      .find((player) => player.playerId === 'player_A')?.combat?.impulseGrenade)
      .toMatchObject({ cooldownEndsAtTick: 248, acceptedThrowCount: 1 });
  });

  it('resolves simultaneous projectiles in stable ID order exactly once', () => {
    const authority = room({
      world: grenadeWorld({
        sweep: (request) => ({
          schemaVersion: 1,
          contacts: request.authorityTick <= 11
            ? [{
                colliderId: `wall_${request.projectileId}_${request.authorityTick}`,
                layer: 'world_static',
                playerId: null,
                timeOfImpactPermille: 0,
                normalQ15: {
                  x: 0,
                  y: 0,
                  z: request.translationMillimeters.z >= 0 ? -Q15 : Q15,
                },
              }]
            : [],
        }),
      }),
      spawnZ: { player_A: 0, player_B: 2_000 },
    });
    start(authority);
    advanceTo(authority, 7);
    authority.enqueueInputBatch('connection_A', throwBatch(0, authority.serverTick));
    authority.enqueueInputBatch('connection_B', throwBatch(0, authority.serverTick));
    authority.advanceOneTick();
    expect(authority.fullSnapshot().impulseGrenadeProjectiles).toHaveLength(2);
    advanceTo(authority, 37);
    const detonationTick = authority.advanceOneTick();
    expect(detonationTick.serverTick).toBe(38);
    expect(detonationTick.impulseGrenadeResults).toHaveLength(2);
    const projectileIds = detonationTick.impulseGrenadeResults?.map(
      (result) => result.detonation.projectileId,
    ) ?? [];
    expect(projectileIds).toEqual([...projectileIds].sort());
    expect(detonationTick.impulseGrenadeResults?.map((result) => result.resolutionOrdinal))
      .toEqual([0, 1]);
    expect(detonationTick.impulseGrenadeResults?.map((result) => result.detonation.reason))
      .toEqual(['fuse', 'fuse']);
    expect(detonationTick.impulseGrenadeEvents?.filter(
      (event) => event.kind === 'impulse_grenade_detonated',
    )).toHaveLength(2);
    expect(authority.fullSnapshot().impulseGrenadeProjectiles).toEqual([]);
    expect(authority.protocolEntities()).toHaveLength(2);

    const next = authority.advanceOneTick();
    expect(next.impulseGrenadeEvents?.filter(
      (event) => event.kind === 'impulse_grenade_detonated',
    )).toEqual([]);
    expect(next.impulseGrenadeResults).toEqual([]);
  });

  it('applies only server-resolved LOS-safe impulse while health remains unchanged', () => {
    const authority = room({
      world: grenadeWorld({
        sweep: (request) => ({
          schemaVersion: 1,
          contacts: request.authorityTick <= 11
            ? [{
                colliderId: `wall_${request.authorityTick}`,
                layer: 'world_static',
                playerId: null,
                timeOfImpactPermille: 0,
                normalQ15: {
                  x: 0,
                  y: 0,
                  z: request.translationMillimeters.z >= 0 ? -Q15 : Q15,
                },
              }]
            : [],
        }),
        occlusion: (request) => request.targetPlayerId === 'player_C'
          ? { schemaVersion: 1, kind: 'blocked', colliderId: 'cover_C' }
          : { schemaVersion: 1, kind: 'clear' },
      }),
      spawnZ: { player_A: 0, player_B: 5_500, player_C: 1_000 },
    });
    start(authority, true);
    advanceTo(authority, 7);
    authority.enqueueInputBatch('connection_A', throwBatch(0, authority.serverTick));
    authority.advanceOneTick();
    advanceTo(authority, 37);
    const result = authority.advanceOneTick().impulseGrenadeResults?.[0];
    expect(result?.radial.outcomes).toEqual([
      expect.objectContaining({ targetPlayerId: 'player_A', status: 'applied' }),
      expect.objectContaining({ targetPlayerId: 'player_B', status: 'applied' }),
      { targetPlayerId: 'player_C', status: 'occluded', event: null },
    ]);
    expect(result?.radial.events.every((event) => event.damageHealthPoints === 0)).toBe(true);
    const snapshot = authority.fullSnapshot();
    expect(snapshot.players.map((player) => player.combat?.life.healthPoints)).toEqual([100, 100, 100]);
    expect(snapshot.players.find((player) => player.playerId === 'player_B')?.movement.player.velocity)
      .not.toEqual({ x: 0, y: 0, z: 0 });
    expect(snapshot.players.find((player) => player.playerId === 'player_C')?.movement.player.velocity)
      .toEqual({ x: 0, y: 0, z: 0 });
  });

  it('marks death immediately and respawns with readiness without erasing cooldown', () => {
    const authority = room({
      spawnZ: { player_A: 0, player_B: 20_000 },
    });
    start(authority);
    advanceTo(authority, 21);
    authority.enqueueInputBatch('connection_A', throwBatch(0, authority.serverTick));
    authority.advanceOneTick();
    const killed = authority.applyCombatDamage({
      targetPlayerId: 'player_A',
      sourcePlayerId: 'player_B',
      damagePoints: 100,
      causeId: 'test_grenade_death',
    });
    expect(killed).toMatchObject({ accepted: true, state: { phase: 'dead' } });
    expect(authority.fullSnapshot().players
      .find((player) => player.playerId === 'player_A')?.combat?.impulseGrenade)
      .toMatchObject({ phase: 'dead', cooldownEndsAtTick: 262 });

    advanceTo(authority, 182);
    expect(authority.respawnCombatPlayer('player_A')).toMatchObject({
      accepted: true,
      state: { phase: 'alive' },
    });
    expect(authority.fullSnapshot().players
      .find((player) => player.playerId === 'player_A')?.combat?.impulseGrenade)
      .toMatchObject({ phase: 'equipping', readyAtTick: 190, cooldownEndsAtTick: 262 });
    advanceTo(authority, 190);
    expect(authority.fullSnapshot().players
      .find((player) => player.playerId === 'player_A')?.combat?.impulseGrenade)
      .toMatchObject({ phase: 'cooldown', readyAtTick: 190, cooldownEndsAtTick: 262 });
  });
});
