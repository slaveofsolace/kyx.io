import { describe, expect, it } from 'vitest';

import {
  AuthoritativeRoom,
  G4_COMBAT_ROOM_PROFILE_ID,
  G4_COMBAT_RULESET_HASH,
  G4_COMBAT_RULESET_ID,
  G4_COMBAT_RULESET_REVISION,
  type AuthoritySpawnResolutionContext,
  type AuthoritySpawnResolver,
} from '../../../../src/authority';
import { hashRulesetContent, requireRuleset } from '../../../../src/content';
import { PROTOCOL_VERSION, type InputBatchMessage } from '../../../../src/net';
import { INTENT_BUTTON, PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../../../src/sim';
import { FakeMovementQueryPort } from '../../sim/movement/fakeQueryPort';

function combatRoom(options: {
  readonly sameTeam?: boolean;
  readonly queries?: FakeMovementQueryPort;
  readonly spawnResolver?: AuthoritySpawnResolver;
} = {}): AuthoritativeRoom {
  const content = requireRuleset(G4_COMBAT_RULESET_ID, G4_COMBAT_RULESET_REVISION);
  expect(hashRulesetContent(content)).toBe(G4_COMBAT_RULESET_HASH);
  return new AuthoritativeRoom({
    identity: {
      roomId: 'room_COMBAT',
      matchId: 'match_COMBAT',
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
    queries: options.queries ?? new FakeMovementQueryPort(),
    warmupTicks: 1,
    activeTicks: 1_000,
    postmatchTicks: 2,
    reconnectGraceTicks: 200,
    minimumConnectedPlayersToStart: 2,
    spawnResolver: options.spawnResolver ?? ((playerId, ordinal) => ({
      spawnId: `spawn_authority_${playerId}`,
      feetPosition: { x: ordinal * 10_000, y: 0, z: -5_000 },
      yawMilliDegrees: ordinal === 0 ? 0 : 180_000,
    })),
    combat: {
      profileId: G4_COMBAT_ROOM_PROFILE_ID,
      teamResolver: (_playerId, ordinal) => options.sameTeam
        ? 'team_blue'
        : ordinal === 0 ? 'team_blue' : 'team_red',
    },
  });
}

function join(authority: AuthoritativeRoom, suffix: string): void {
  const result = authority.joinNewPlayer({
    playerId: `player_${suffix}`,
    connectionId: `connection_${suffix}`,
  });
  expect(result.ok).toBe(true);
}

function batch(
  sequence: number,
  heldButtons = 0,
  pressedButtons = 0,
  selectedSlot = 0,
): InputBatchMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'inputBatch',
    commands: [{
      type: 'input',
      sequence,
      clientTick: sequence,
      moveX: 0,
      moveY: 0,
      lookYawDeltaMilliDegrees: 0,
      lookPitchDeltaMilliDegrees: 0,
      heldButtons,
      pressedButtons,
      releasedButtons: 0,
      selectedSlot,
    }],
  };
}

function advanceTo(authority: AuthoritativeRoom, targetTick: number): void {
  while (authority.serverTick < targetTick) authority.advanceOneTick();
}

describe('P5.1/P5.2 authoritative room combat integration', () => {
  it('requires the exact opt-in revision 3 identity and leaves prior rooms unchanged', () => {
    expect(() => new AuthoritativeRoom({
      identity: {
        roomId: 'room_WRONG',
        matchId: 'match_WRONG',
        rulesetId: G4_COMBAT_RULESET_ID,
        rulesetRevision: 2,
        rulesetHash: '039ae95bed7ee716',
        mapId: 'flat_run',
        fixtureId: 'flat_run',
        fixtureHash: '1111111111111111',
        physicsAdapterId: 'fake_query_port',
        physicsAdapterVersion: '1.0.0',
      },
      profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      queries: new FakeMovementQueryPort(),
      combat: { profileId: G4_COMBAT_ROOM_PROFILE_ID },
    })).toThrow(/exact revamped_classic revision 3 identity/u);

    const authority = new AuthoritativeRoom({
      identity: {
        roomId: 'room_LEGACY',
        matchId: 'match_LEGACY',
        rulesetId: 'authority_test_rules',
        rulesetRevision: 1,
        rulesetHash: '5555555555555555',
        mapId: 'flat_run',
        fixtureId: 'flat_run',
        fixtureHash: '1111111111111111',
        physicsAdapterId: 'fake_query_port',
        physicsAdapterVersion: '1.0.0',
      },
      profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      queries: new FakeMovementQueryPort(),
      minimumConnectedPlayersToStart: 1,
    });
    join(authority, 'A');
    expect(authority.fullSnapshot().players[0]?.combat).toBeUndefined();
    expect(() => authority.applyCombatDamage({
      targetPlayerId: 'player_A',
      sourcePlayerId: null,
      damagePoints: 10,
      causeId: 'test',
    })).toThrow('AUTHORITY_COMBAT_NOT_ENABLED');
  });

  it('recovers an alive player from an authority recovery volume without resetting input continuity', () => {
    const recoveryContexts: AuthoritySpawnResolutionContext[] = [];
    const authority = combatRoom({
      queries: new FakeMovementQueryPort({
        floorY: -10_000,
        volumes: ({ feetPosition }) => feetPosition.x < 5_000
          ? [{ colliderId: 'lower_void_recovery', kind: 'recovery' }]
          : [],
      }),
      spawnResolver: (playerId, ordinal, context) => {
        if (context.authorityTick > 0) recoveryContexts.push(context);
        return {
          spawnId: `spawn_authority_${playerId}`,
          feetPosition: { x: ordinal * 10_000, y: 0, z: -5_000 },
          yawMilliDegrees: ordinal === 0 ? 0 : 180_000,
        };
      },
    });
    join(authority, 'A');
    join(authority, 'B');
    expect(authority.startMatch()).toBe(true);
    authority.enqueueInputBatch('connection_A', batch(0, 0, 0, 3));

    const tick = authority.advanceOneTick();
    const player = authority.fullSnapshot().players.find(({ playerId }) => playerId === 'player_A');
    expect(tick.movementEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'movement_volume_entered',
        entityId: 'player_A',
        colliderId: 'lower_void_recovery',
        volumeKind: 'recovery',
      }),
    ]));
    expect(player).toMatchObject({
      lastProcessedInputSequence: 0,
      movement: {
        tick: 1,
        player: {
          feetPosition: { x: 0, y: 0, z: -5_000 },
          velocity: { x: 0, y: 0, z: 0 },
          lastProcessedSequence: 0,
          intent: { selectedSlot: 3 },
          activeVolumes: [],
        },
      },
      combat: {
        life: {
          phase: 'alive',
          healthPoints: 100,
          protectedUntilTickExclusive: 20,
        },
      },
    });
    expect(recoveryContexts).toHaveLength(1);
    expect(recoveryContexts[0]).toMatchObject({
      schemaVersion: 1,
      authorityTick: 1,
      players: [
        {
          playerId: 'player_A',
          lifePhase: 'alive',
          movementTick: 1,
        },
        {
          playerId: 'player_B',
          lifePhase: 'alive',
          movementTick: 0,
        },
      ],
    });
    expect(Object.isFrozen(recoveryContexts[0])).toBe(true);
    expect(Object.isFrozen(recoveryContexts[0]?.players)).toBe(true);
  });

  it('gives kill volumes priority over recovery and bypasses only world-hazard spawn protection', () => {
    const authority = combatRoom({
      queries: new FakeMovementQueryPort({
        volumes: ({ feetPosition }) => feetPosition.x < 5_000
          ? [
              { colliderId: 'lower_void_recovery', kind: 'recovery' },
              { colliderId: 'lower_void_kill', kind: 'kill' },
            ]
          : [],
      }),
    });
    join(authority, 'A');
    join(authority, 'B');
    expect(authority.startMatch()).toBe(true);

    const tick = authority.advanceOneTick();
    expect(tick.volumeDamageResults).toEqual([
      expect.objectContaining({
        playerId: 'player_A',
        colliderId: 'lower_void_kill',
        volumeKind: 'kill',
        damage: expect.objectContaining({
          accepted: true,
          damage: expect.objectContaining({
            authorityTick: 1,
            causeId: 'world.kill_volume',
            sourcePlayerId: null,
            targetPlayerId: 'player_A',
            healthPointsAfter: 0,
          }),
          death: expect.objectContaining({
            authorityTick: 1,
            victimPlayerId: 'player_A',
            killerPlayerId: null,
          }),
        }),
      }),
    ]);
    const player = authority.fullSnapshot().players.find(({ playerId }) => playerId === 'player_A');
    expect(player).toMatchObject({
      movement: {
        player: {
          activeVolumes: expect.arrayContaining([
            { colliderId: 'lower_void_recovery', kind: 'recovery' },
            { colliderId: 'lower_void_kill', kind: 'kill' },
          ]),
        },
      },
      combat: {
        life: {
          phase: 'dead',
          healthPoints: 0,
          protectedUntilTickExclusive: 1,
        },
      },
    });
  });

  it('creates frozen life and Auto Rifle state and derives fire from validated input buttons', () => {
    const authority = combatRoom();
    join(authority, 'A');
    join(authority, 'B');
    expect(authority.startMatch()).toBe(true);
    const initial = authority.fullSnapshot().players[0]?.combat;
    expect(initial).toMatchObject({
      life: {
        phase: 'alive',
        healthPoints: 100,
        shieldPoints: 0,
        protectedUntilTickExclusive: 20,
      },
      autoRifle: {
        phase: 'holstered',
        magazineRounds: 50,
        reserveRounds: 150,
      },
    });
    expect(Object.isFrozen(initial?.life)).toBe(true);
    expect(Object.isFrozen(initial?.autoRifle)).toBe(true);

    const acceptedShots: number[] = [];
    while (authority.serverTick < 7) {
      authority.enqueueInputBatch('connection_A', batch(
        authority.serverTick,
        INTENT_BUTTON.primaryFire,
        INTENT_BUTTON.primaryFire,
      ));
      const tick = authority.advanceOneTick();
      for (const event of tick.combatEvents ?? []) {
        if (event.kind === 'auto_rifle_shot_accepted') acceptedShots.push(event.authorityTick);
      }
    }
    expect(
      acceptedShots,
      JSON.stringify(authority.fullSnapshot().players[0]?.combat),
    ).toEqual([5, 7]);
    expect(authority.fullSnapshot().players[0]?.combat).toMatchObject({
      life: { protectedUntilTickExclusive: 5 },
      autoRifle: {
        phase: 'firing',
        magazineRounds: 48,
        acceptedShotCount: 2,
      },
    });
    expect(authority.protocolEntities()[0]).toMatchObject({
      healthPoints: 100,
      shieldPoints: 0,
    });
  });

  it('preserves one quick fire tap when catch-up drains its press and release together', () => {
    const authority = combatRoom();
    join(authority, 'A');
    join(authority, 'B');
    expect(authority.startMatch()).toBe(true);
    advanceTo(authority, 4);

    const press = batch(
      0,
      INTENT_BUTTON.primaryFire,
      INTENT_BUTTON.primaryFire,
    ).commands[0];
    const release = {
      ...batch(1).commands[0],
      releasedButtons: INTENT_BUTTON.primaryFire,
    };
    expect(authority.enqueueInputBatch('connection_A', {
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputBatch',
      commands: [press, release],
    }).rejections).toEqual([]);

    const tick = authority.advanceOneTick();
    expect(tick.combatEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'auto_rifle_shot_accepted',
        authorityTick: 5,
        playerId: 'player_A',
      }),
    ]));
    expect(authority.fullSnapshot().players[0]).toMatchObject({
      movement: {
        player: {
          lastProcessedSequence: 1,
          intent: {
            heldButtons: 0,
            pressedButtons: INTENT_BUTTON.primaryFire,
            releasedButtons: INTENT_BUTTON.primaryFire,
          },
        },
      },
      combat: {
        autoRifle: {
          magazineRounds: 49,
          acceptedShotCount: 1,
        },
      },
    });
  });

  it('retains the join-time spawn ordinal across death, late joins, and respawn', () => {
    const authority = combatRoom();
    join(authority, 'A');
    join(authority, 'B');
    authority.startMatch();
    advanceTo(authority, 20);

    const lethal = authority.applyCombatDamage({
      targetPlayerId: 'player_B',
      sourcePlayerId: 'player_A',
      damagePoints: 100,
      causeId: 'weapon.auto_rifle',
    });
    expect(lethal).toMatchObject({
      accepted: true,
      state: {
        phase: 'dead',
        healthPoints: 0,
        respawnEligibleAtTick: 180,
      },
      death: {
        victimPlayerId: 'player_B',
        killerPlayerId: 'player_A',
      },
    });
    const deadPosition = authority.fullSnapshot().players[1]?.movement.player.feetPosition;
    authority.enqueueInputBatch('connection_B', {
      ...batch(0),
      commands: [{ ...batch(0).commands[0], moveY: 127 }],
    });
    authority.advanceOneTick();
    expect(authority.fullSnapshot().players[1]).toMatchObject({
      movement: { player: { feetPosition: deadPosition } },
      combat: {
        life: { phase: 'dead', healthPoints: 0 },
        autoRifle: { phase: 'dead' },
      },
    });
    expect(authority.protocolEntities()[1]?.healthPoints).toBe(0);
    expect(authority.respawnCombatPlayer('player_B')).toMatchObject({
      accepted: false,
      reason: 'respawn_not_ready',
    });
    // This id sorts before A/B. Respawn must retain B's join-time ordinal
    // instead of recomputing a spawn slot from the mutable player-id set.
    join(authority, '0');

    advanceTo(authority, 180);
    const respawn = authority.respawnCombatPlayer('player_B');
    expect(respawn).toMatchObject({
      accepted: true,
      state: {
        phase: 'alive',
        healthPoints: 100,
        lastSpawnId: 'spawn_authority_player_B',
        protectedUntilTickExclusive: 200,
      },
      event: {
        authoritySpawnId: 'spawn_authority_player_B',
        authorityTick: 180,
      },
    });
    expect(authority.fullSnapshot().players.find(({ playerId }) => playerId === 'player_B'))
      .toMatchObject({
      movement: { player: { feetPosition: { x: 10_000, y: 0, z: -5_000 } } },
      combat: { life: { phase: 'alive', healthPoints: 100 } },
      });
  });

  it('fails closed on forged damage fields and blocks friendly fire from room-owned teams', () => {
    const authority = combatRoom({ sameTeam: true });
    join(authority, 'A');
    join(authority, 'B');
    authority.startMatch();
    advanceTo(authority, 20);

    let getterCalls = 0;
    const accessorRequest: Record<string, unknown> = {
      sourcePlayerId: 'player_A',
      damagePoints: 100,
      causeId: 'weapon.auto_rifle',
    };
    Object.defineProperty(accessorRequest, 'targetPlayerId', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'player_B';
      },
    });
    expect(() => authority.applyCombatDamage(accessorRequest as never)).toThrow(
      /data properties only/u,
    );
    expect(getterCalls).toBe(0);

    expect(() => authority.applyCombatDamage({
      targetPlayerId: 'player_B',
      sourcePlayerId: 'player_A',
      damagePoints: 100,
      causeId: 'weapon.auto_rifle',
      sourceTeamId: 'team_red',
    } as never)).toThrow(/contains unsupported field: sourceTeamId/u);
    expect(() => authority.applyCombatDamage({
      targetPlayerId: 'player_B',
      sourcePlayerId: 'player_A',
      damagePoints: 100,
      causeId: 'weapon.auto_rifle',
      authorityTick: 999_999,
    } as never)).toThrow(/contains unsupported field: authorityTick/u);
    expect(authority.applyCombatDamage({
      targetPlayerId: 'player_B',
      sourcePlayerId: 'player_A',
      damagePoints: 100,
      causeId: 'weapon.auto_rifle',
    })).toMatchObject({ accepted: false, reason: 'friendly_fire_blocked' });
    expect(authority.fullSnapshot().players[1]?.combat?.life.healthPoints).toBe(100);
  });

  it('preserves combat state across the authenticated resume seam', () => {
    const authority = combatRoom();
    join(authority, 'A');
    join(authority, 'B');
    authority.startMatch();
    while (authority.serverTick < 5) {
      authority.enqueueInputBatch('connection_A', batch(
        authority.serverTick,
        INTENT_BUTTON.primaryFire,
        INTENT_BUTTON.primaryFire,
      ));
      authority.advanceOneTick();
    }
    expect(authority.disconnectConnection('connection_A')).toBe(true);
    const resumed = authority.resumePlayer({
      playerId: 'player_A',
      connectionId: 'connection_A2',
    });
    expect(resumed).toMatchObject({ ok: true, connectionMode: 'resumed' });
    if (!resumed.ok) return;
    expect(resumed.snapshot.players.find(({ playerId }) => playerId === 'player_A')).toMatchObject({
      playerId: 'player_A',
      combat: {
        life: { phase: 'alive', protectedUntilTickExclusive: 5 },
        autoRifle: { magazineRounds: 49, acceptedShotCount: 1 },
      },
    });
  });
});
