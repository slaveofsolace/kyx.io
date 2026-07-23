import { describe, expect, it } from 'vitest';

import {
  AuthoritativeRoom,
  G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID,
  G4_COMBAT_ROOM_PROFILE_ID,
  G4_COMBAT_RULESET_HASH,
  G4_COMBAT_RULESET_ID,
  G4_COMBAT_RULESET_REVISION,
  G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
  IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
  type AuthorityImpulseGrenadeWorldPort,
  type AuthorityRoomOptions,
} from '../../../../src/authority';
import { hashRulesetContent, requireRuleset } from '../../../../src/content';
import { PROTOCOL_VERSION, type InputBatchMessage } from '../../../../src/net';
import {
  INTENT_BUTTON,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  type MovementProfileV1,
} from '../../../../src/sim';
import { FakeMovementQueryPort } from '../../sim/movement/fakeQueryPort';

function grenadeWorld(): AuthorityImpulseGrenadeWorldPort {
  return {
    schemaVersion: IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
    sweepSphere: () => ({ schemaVersion: 1, contacts: [] }),
    traceRadialOcclusion: () => ({ schemaVersion: 1, kind: 'clear' }),
    resolveCollisionSafeImpulse: (request) => ({
      schemaVersion: 1,
      appliedImpulseMillimetersPerSecond: request.requestedImpulseMillimetersPerSecond,
    }),
  };
}

function roomOptions(options: {
  readonly abilityResources?: boolean;
  readonly queries?: FakeMovementQueryPort;
  readonly profile?: MovementProfileV1;
} = {}): AuthorityRoomOptions {
  const content = requireRuleset(G4_COMBAT_RULESET_ID, G4_COMBAT_RULESET_REVISION);
  expect(hashRulesetContent(content)).toBe(G4_COMBAT_RULESET_HASH);
  return {
    identity: {
      roomId: 'room_RESOURCE',
      matchId: 'match_RESOURCE',
      rulesetId: G4_COMBAT_RULESET_ID,
      rulesetRevision: G4_COMBAT_RULESET_REVISION,
      rulesetHash: G4_COMBAT_RULESET_HASH,
      mapId: 'inkfall_foundry',
      fixtureId: 'inkfall_authority',
      fixtureHash: '2a0a446a0b152395',
      physicsAdapterId: 'fake_query_port',
      physicsAdapterVersion: '1.0.0',
    },
    profile: options.profile ?? PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
    queries: options.queries ?? new FakeMovementQueryPort(),
    warmupTicks: 1,
    activeTicks: 1_000,
    postmatchTicks: 2,
    reconnectGraceTicks: 200,
    minimumConnectedPlayersToStart: 2,
    spawnResolver: (playerId, ordinal) => ({
      spawnId: `spawn_authority_${playerId}`,
      feetPosition: { x: ordinal * 20_000, y: 0, z: 0 },
      yawMilliDegrees: ordinal === 0 ? 0 : 180_000,
    }),
    combat: {
      profileId: G4_COMBAT_ROOM_PROFILE_ID,
      teamResolver: (_playerId, ordinal) => ordinal === 0 ? 'team_blue' : 'team_red',
      impulseGrenade: {
        capabilityId: G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
        world: grenadeWorld(),
      },
      ...(options.abilityResources === false
        ? {}
        : {
            abilityResources: {
              capabilityId: G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID,
            },
          }),
    },
  };
}

function room(options: Parameters<typeof roomOptions>[0] = {}): AuthoritativeRoom {
  return new AuthoritativeRoom(roomOptions(options));
}

function joinAndStart(authority: AuthoritativeRoom): void {
  expect(authority.joinNewPlayer({
    playerId: 'player_A',
    connectionId: 'connection_A',
  })).toMatchObject({ ok: true, connectionMode: 'joined' });
  expect(authority.joinNewPlayer({
    playerId: 'player_B',
    connectionId: 'connection_B',
  })).toMatchObject({ ok: true, connectionMode: 'joined' });
  expect(authority.startMatch()).toBe(true);
}

function batch(options: {
  readonly sequence: number;
  readonly clientTick: number;
  readonly heldButtons?: number;
  readonly pressedButtons?: number;
  readonly releasedButtons?: number;
  readonly selectedSlot?: number;
}): InputBatchMessage {
  const pressedButtons = options.pressedButtons ?? 0;
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
      lookPitchDeltaMilliDegrees: 0,
      heldButtons: options.heldButtons ?? pressedButtons,
      pressedButtons,
      releasedButtons: options.releasedButtons ?? 0,
      selectedSlot: options.selectedSlot ?? 0,
    }],
  };
}

function advanceTo(authority: AuthoritativeRoom, targetTick: number): void {
  while (authority.serverTick < targetTick) authority.advanceOneTick();
}

function playerA(authority: AuthoritativeRoom) {
  return authority.fullSnapshot().players.find(({ playerId }) => playerId === 'player_A');
}

describe('P5.5 exact authoritative room ability-resource integration', () => {
  it('is absent by default and fails closed on a non-exact nested capability or profile', () => {
    const prior = room({ abilityResources: false });
    joinAndStart(prior);
    expect(prior.advanceOneTick().abilityResourceEvents).toBeUndefined();
    expect(playerA(prior)?.combat?.abilityResources).toBeUndefined();

    const base = roomOptions();
    expect(() => new AuthoritativeRoom({
      ...base,
      combat: {
        ...base.combat,
        abilityResources: { capabilityId: 'client_resources' },
      },
    } as never)).toThrow(/capability is unsupported/u);
    expect(() => new AuthoritativeRoom({
      ...base,
      combat: {
        ...base.combat,
        abilityResources: {
          capabilityId: G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID,
          cooldownTicks: 1,
        },
      },
    } as never)).toThrow(/unsupported or missing fields/u);
    expect(() => new AuthoritativeRoom({
      ...base,
      profile: {
        ...PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
        teleport: {
          ...PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.teleport,
          cooldownTicks: 161,
        },
      },
    })).toThrow(/exact accepted movement profile/u);
    expect(() => new AuthoritativeRoom({
      ...base,
      combat: {
        profileId: G4_COMBAT_ROOM_PROFILE_ID,
        abilityResources: { capabilityId: G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID },
      },
    } as never)).toThrow(/require the exact impulse grenade capability/u);
  });

  it('publishes deterministic equip and readiness transitions from authority state', () => {
    const authority = room();
    joinAndStart(authority);
    expect(playerA(authority)?.combat?.abilityResources).toMatchObject({
      authorityTick: 0,
      equipped: { selectedWeaponSlot: 0, primaryWeaponEquipped: true },
      primaryWeapon: { phase: 'holstered', magazineRounds: 50, reserveRounds: 150 },
      damageAbilityOne: { phase: 'equipping', readyTicksRemaining: 8 },
      utilityAbility: { phase: 'ready', cooldownTicksRemaining: 0 },
    });

    authority.enqueueInputBatch('connection_A', batch({
      sequence: 0,
      clientTick: 0,
      selectedSlot: 1,
    }));
    authority.advanceOneTick();
    expect(playerA(authority)?.combat?.abilityResources).toMatchObject({
      authorityTick: 1,
      equipped: { selectedWeaponSlot: 1, primaryWeaponEquipped: false },
      primaryWeapon: { phase: 'holstered' },
      damageAbilityOne: { phase: 'equipping', readyTicksRemaining: 7 },
    });

    authority.enqueueInputBatch('connection_A', batch({
      sequence: 1,
      clientTick: 1,
      selectedSlot: 0,
    }));
    authority.advanceOneTick();
    expect(playerA(authority)?.combat?.abilityResources).toMatchObject({
      authorityTick: 2,
      equipped: { selectedWeaponSlot: 0, primaryWeaponEquipped: true },
      primaryWeapon: { phase: 'equipping' },
    });
    advanceTo(authority, 8);
    expect(playerA(authority)?.combat?.abilityResources).toMatchObject({
      primaryWeapon: { phase: 'ready' },
      damageAbilityOne: { phase: 'ready', readyTicksRemaining: 0 },
      utilityAbility: { phase: 'ready' },
    });
  });

  it('observes one atomic movement teleport and preserves same-tick weapon readiness', () => {
    const authority = room();
    joinAndStart(authority);
    advanceTo(authority, 7);
    const fireAndTeleport = INTENT_BUTTON.primaryFire | INTENT_BUTTON.utility;
    authority.enqueueInputBatch('connection_A', batch({
      sequence: 0,
      clientTick: authority.serverTick,
      heldButtons: fireAndTeleport,
      pressedButtons: fireAndTeleport,
    }));
    const accepted = authority.advanceOneTick();
    expect(accepted.movementEvents).toContainEqual(expect.objectContaining({
      kind: 'teleport_succeeded',
      tick: 8,
      entityId: 'player_A',
      outcome: 'full',
      from: { x: 0, y: 0, z: 0 },
      to: { x: 0, y: 0, z: 9_000 },
    }));
    expect(accepted.combatEvents).toContainEqual(expect.objectContaining({
      kind: 'auto_rifle_shot_accepted',
      authorityTick: 8,
      playerId: 'player_A',
      magazineRoundsAfter: 49,
    }));
    expect(accepted.abilityResourceEvents).toEqual([
      expect.objectContaining({
        kind: 'teleport_resource_confirmed',
        authorityTick: 8,
        playerId: 'player_A',
        cooldownTicksRemaining: 160,
        weaponRecoveryTicks: 0,
        combatStatePolicy: 'preserve_existing_combat_state',
      }),
    ]);
    expect(playerA(authority)).toMatchObject({
      movement: {
        player: {
          feetPosition: { x: 0, y: 0, z: 9_000 },
          teleportCooldownTicksRemaining: 160,
        },
      },
      combat: {
        abilityResources: {
          primaryWeapon: { phase: 'firing', magazineRounds: 49 },
          utilityAbility: { phase: 'cooldown', cooldownTicksRemaining: 160 },
        },
      },
    });

    authority.enqueueInputBatch('connection_A', batch({
      sequence: 1,
      clientTick: authority.serverTick,
      pressedButtons: INTENT_BUTTON.utility,
    }));
    const cooling = authority.advanceOneTick();
    expect(cooling.movementEvents).toContainEqual(expect.objectContaining({
      kind: 'teleport_rejected',
      reason: 'cooldown',
    }));
    expect(cooling.abilityResourceEvents).toEqual([expect.objectContaining({
      kind: 'teleport_resource_rejected',
      reason: 'cooldown',
      cooldownTicksRemaining: 159,
      cooldownConsumedByFailure: false,
    })]);
    expect(playerA(authority)?.movement.player.feetPosition.z).toBe(9_000);
  });

  it('keeps a blocked destination at zero cooldown and ignores claimed client outcomes', () => {
    const authority = room({
      queries: new FakeMovementQueryPort({ overlap: () => ['solid_destination'] }),
    });
    joinAndStart(authority);
    authority.enqueueInputBatch('connection_A', batch({
      sequence: 0,
      clientTick: 0,
      pressedButtons: INTENT_BUTTON.utility,
    }));
    const rejected = authority.advanceOneTick();
    expect(rejected.abilityResourceEvents).toEqual([expect.objectContaining({
      kind: 'teleport_resource_rejected',
      reason: 'blocked',
      cooldownTicksRemaining: 0,
      cooldownConsumedByFailure: false,
    })]);
    expect(playerA(authority)).toMatchObject({
      movement: {
        player: {
          feetPosition: { x: 0, y: 0, z: 0 },
          teleportCooldownTicksRemaining: 0,
        },
      },
      combat: { abilityResources: { utilityAbility: { phase: 'ready' } } },
    });

    expect(() => authority.enqueueInputBatch('connection_A', {
      ...batch({ sequence: 1, clientTick: 1, pressedButtons: INTENT_BUTTON.utility }),
      commands: [{
        ...batch({ sequence: 1, clientTick: 1, pressedButtons: INTENT_BUTTON.utility }).commands[0],
        claimedTeleportDestination: { x: 0, y: 0, z: 9_000 },
        claimedCooldownTicks: 0,
        claimedWeaponReady: true,
      }],
    })).toThrow('AUTHORITY_INPUT_BATCH_INVALID');
  });

  it('surfaces reload interruption and sprint lock without mutating ammo resources', () => {
    const authority = room();
    joinAndStart(authority);
    advanceTo(authority, 4);
    authority.enqueueInputBatch('connection_A', batch({
      sequence: 0,
      clientTick: authority.serverTick,
      heldButtons: INTENT_BUTTON.primaryFire,
      pressedButtons: INTENT_BUTTON.primaryFire,
    }));
    authority.advanceOneTick();
    expect(playerA(authority)?.combat?.abilityResources?.primaryWeapon.magazineRounds).toBe(49);

    authority.enqueueInputBatch('connection_A', batch({
      sequence: 1,
      clientTick: authority.serverTick,
      pressedButtons: INTENT_BUTTON.reload,
    }));
    const reload = authority.advanceOneTick();
    expect(reload.combatEvents).toContainEqual(expect.objectContaining({
      kind: 'auto_rifle_reload_started',
      authorityTick: 6,
    }));
    expect(playerA(authority)?.combat?.abilityResources?.primaryWeapon).toMatchObject({
      phase: 'reloading',
      magazineRounds: 49,
      reserveRounds: 150,
      reloadCompletesAtTick: 66,
    });

    authority.enqueueInputBatch('connection_A', batch({
      sequence: 2,
      clientTick: authority.serverTick,
      heldButtons: INTENT_BUTTON.sprint,
    }));
    const interrupted = authority.advanceOneTick();
    expect(interrupted.combatEvents).toContainEqual(expect.objectContaining({
      kind: 'auto_rifle_reload_cancelled',
      reason: 'sprint',
    }));
    expect(playerA(authority)?.combat?.abilityResources).toMatchObject({
      primaryWeapon: {
        phase: 'sprinting',
        magazineRounds: 49,
        reserveRounds: 150,
        reloadCompletesAtTick: null,
      },
      locks: { dead: false, sprinting: true },
    });
  });

  it('drains dead input, freezes dead cooldown, and restores teleport only through respawn', () => {
    const authority = room();
    joinAndStart(authority);
    advanceTo(authority, 7);
    authority.enqueueInputBatch('connection_A', batch({
      sequence: 0,
      clientTick: authority.serverTick,
      heldButtons: INTENT_BUTTON.primaryFire | INTENT_BUTTON.utility,
      pressedButtons: INTENT_BUTTON.primaryFire | INTENT_BUTTON.utility,
    }));
    authority.advanceOneTick();
    expect(authority.applyCombatDamage({
      targetPlayerId: 'player_A',
      sourcePlayerId: 'player_B',
      damagePoints: 100,
      causeId: 'test_resource_death',
    })).toMatchObject({ accepted: true, state: { phase: 'dead', respawnEligibleAtTick: 168 } });
    expect(playerA(authority)?.combat?.abilityResources).toMatchObject({
      utilityAbility: { phase: 'dead', cooldownTicksRemaining: 160 },
      locks: { dead: true },
    });

    authority.enqueueInputBatch('connection_A', batch({
      sequence: 1,
      clientTick: authority.serverTick,
      pressedButtons: INTENT_BUTTON.utility,
    }));
    const deadTick = authority.advanceOneTick();
    expect(deadTick.abilityResourceEvents).toEqual([]);
    expect(playerA(authority)).toMatchObject({
      movement: { player: { teleportCooldownTicksRemaining: 160 } },
      combat: { abilityResources: { utilityAbility: { phase: 'dead' } } },
    });
    expect(authority.respawnCombatPlayer('player_A')).toMatchObject({
      accepted: false,
      reason: 'respawn_not_ready',
    });

    advanceTo(authority, 168);
    expect(authority.respawnCombatPlayer('player_A')).toMatchObject({
      accepted: true,
      state: { phase: 'alive' },
    });
    expect(playerA(authority)).toMatchObject({
      movement: {
        player: {
          feetPosition: { x: 0, y: 0, z: 0 },
          teleportCooldownTicksRemaining: 0,
        },
      },
      combat: {
        abilityResources: {
          damageAbilityOne: { phase: 'equipping', readyTicksRemaining: 8 },
          utilityAbility: { phase: 'ready', cooldownTicksRemaining: 0 },
          locks: { dead: false },
        },
      },
    });
    const postRespawn = authority.advanceOneTick();
    expect(postRespawn.abilityResourceEvents).toEqual([]);
    expect(playerA(authority)?.movement.player.feetPosition.z).toBe(0);
  });
});
