import { describe, expect, it } from 'vitest';

import { ABILITY_ID } from '../../../../src/abilities/abilityLoadout';
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
} from '../../../../src/authority';
import { PROTOCOL_VERSION, type InputBatchMessage } from '../../../../src/net';
import { INTENT_BUTTON, PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../../../src/sim';
import { reliableCombatEvents } from '../../../../worker/combatRuntime';
import { FakeMovementQueryPort } from '../../sim/movement/fakeQueryPort';

function room(): AuthoritativeRoom {
  return new AuthoritativeRoom({
    identity: {
      roomId: 'room.flash.integration',
      matchId: 'match.flash.integration',
      rulesetId: G4_COMBAT_RULESET_ID,
      rulesetRevision: G4_COMBAT_RULESET_REVISION,
      rulesetHash: G4_COMBAT_RULESET_HASH,
      mapId: 'inkfall_foundry',
      fixtureId: 'inkfall_foundry_authority',
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
        : { x: 0, y: 0, z: 2_000 },
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

function flashInput(authority: AuthoritativeRoom): InputBatchMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'inputBatch',
    commands: [{
      type: 'input',
      sequence: 0,
      clientTick: authority.serverTick,
      moveX: 0,
      moveY: 0,
      lookYawDeltaMilliDegrees: 0,
      lookPitchDeltaMilliDegrees: 0,
      heldButtons: INTENT_BUTTON.abilityTwo,
      pressedButtons: INTENT_BUTTON.abilityTwo,
      releasedButtons: 0,
      selectedSlot: 2,
    }],
  };
}

interface MutableFlashCheckpoint {
  readonly clock: { readonly serverTick: number };
  readonly abilityProjectiles: Array<{
    readonly projectileId: string;
    detonatesAtTick: number | null;
    positionMillimeters: { x: number; y: number; z: number };
    velocityMillimetersPerSecond: { x: number; y: number; z: number };
  }>;
}

describe('authoritative room Flash integration', () => {
  it('owns facing exposure, exact presentation, and reconnect duration without disabling agency', () => {
    const source = room();
    expect(source.joinNewPlayer({
      playerId: 'player_A',
      connectionId: 'connection_A',
    })).toMatchObject({ ok: true });
    expect(source.joinNewPlayer({
      playerId: 'player_B',
      connectionId: 'connection_B',
    })).toMatchObject({ ok: true });
    source.setPlayerAbilityLoadout('player_A', [
      ABILITY_ID.sticky,
      ABILITY_ID.flash,
      ABILITY_ID.launch,
    ]);
    expect(source.startMatch()).toBe(true);
    while (source.serverTick < 40) source.advanceOneTick();

    expect(source.enqueueInputBatch('connection_A', flashInput(source)).accepted).toBe(1);
    const thrown = source.advanceOneTick();
    expect(thrown.abilityLoadoutEvents).toContainEqual(expect.objectContaining({
      kind: 'ability_activation_accepted',
      abilityId: ABILITY_ID.flash,
    }));
    const checkpoint = JSON.parse(
      JSON.stringify(source.exportActiveMatchCheckpoint()),
    ) as MutableFlashCheckpoint;
    expect(checkpoint.abilityProjectiles).toHaveLength(1);
    const projectile = checkpoint.abilityProjectiles[0];
    if (projectile === undefined) throw new Error('flash projectile checkpoint is missing');
    projectile.detonatesAtTick = checkpoint.clock.serverTick + 1;
    projectile.positionMillimeters = { x: 0, y: 900, z: 1_000 };
    projectile.velocityMillimetersPerSecond = { x: 0, y: 0, z: 0 };

    const restored = room();
    restored.restoreActiveMatchCheckpoint(checkpoint);
    const detonationTick = restored.advanceOneTick();
    const playerB = detonationTick.abilityEffectResults?.[0]?.outcomes.find(
      ({ targetPlayerId }) => targetPlayerId === 'player_B',
    );
    expect(playerB).toMatchObject({
      status: 'applied',
      damageHealthPoints: 0,
      flashFacingPermille: 1_000,
      impulseMillimetersPerSecond: { x: 0, y: 0, z: 0 },
    });
    expect(playerB?.flashIntensityPermille).toBeGreaterThan(900);
    expect(playerB?.flashDurationTicks).toBeGreaterThan(40);
    const expectedExpiry = detonationTick.serverTick + (playerB?.flashDurationTicks ?? 0);
    expect(restored.fullSnapshot().players.find(
      ({ playerId }) => playerId === 'player_B',
    )?.combat?.flashImpairedUntilTick).toBe(expectedExpiry);

    const wireFlash = reliableCombatEvents(detonationTick).find((event) => (
      event.presentation?.kind === 'throwable_ability_event'
      && event.presentation.phase === 'flash_applied'
      && event.targetId === 'player_B'
    ));
    expect(wireFlash?.presentation).toMatchObject({
      flashDurationTicks: playerB?.flashDurationTicks,
      flashIntensityPermille: playerB?.flashIntensityPermille,
      flashFacingPermille: 1_000,
    });

    expect(restored.disconnectConnection('connection_B')).toBe(true);
    const reconnectCheckpoint = JSON.parse(
      JSON.stringify(restored.exportActiveMatchCheckpoint()),
    ) as unknown;
    const resumed = room();
    resumed.restoreActiveMatchCheckpoint(reconnectCheckpoint);
    const resume = resumed.resumePlayer({
      playerId: 'player_B',
      connectionId: 'connection_B_rotated',
    });
    expect(resume).toMatchObject({ ok: true, connectionMode: 'resumed' });
    if (!resume.ok) return;
    expect(resume.snapshot.players.find(
      ({ playerId }) => playerId === 'player_B',
    )?.combat?.flashImpairedUntilTick).toBe(expectedExpiry);
  });
});
