import { afterEach, describe, expect, it } from 'vitest';

import {
  AuthoritativeRoom,
  CROWNPOINT_AUTHORITY_FIXTURE,
  CROWNPOINT_AUTHORITY_MAP_BINDING,
  CROWNPOINT_AUTHORITY_PROFILE_ID,
  G4_COMBAT_RULESET_HASH,
  G4_COMBAT_RULESET_ID,
  G4_COMBAT_RULESET_REVISION,
  SWITCHYARD_AUTHORITY_FIXTURE,
  SWITCHYARD_AUTHORITY_MAP_BINDING,
  SWITCHYARD_AUTHORITY_PROFILE_ID,
  createOriginalArenaAuthorityCombatOptions,
  deterministicCombatBotPresetId,
  originalArenaAuthoritySpawn,
  type OriginalArenaAuthorityProfile,
} from '../../../src/authority';
import { combatPresetById } from '../../../src/loadouts';
import { PROTOCOL_VERSION, type InputBatchMessage } from '../../../src/net';
import { createRapierMovementWorld, type PhysicsFixtureV1, type RapierMovementWorld } from '../../../src/physics';
import { PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../../src/sim';
import {
  RELAY_AUTHORITY_PLAYER_SLOT_IDS,
  authorityBotInput,
  relayAuthorityBotConnectionId,
  relayAuthorityPlayerSlotOrdinal,
} from '../../../worker/relayBotSlots';

describe('original arena authority bot patrols', () => {
  let world: RapierMovementWorld | null = null;

  afterEach(() => {
    world?.dispose();
    world = null;
  });

  it.each([
    [SWITCHYARD_AUTHORITY_PROFILE_ID, SWITCHYARD_AUTHORITY_FIXTURE, SWITCHYARD_AUTHORITY_MAP_BINDING],
    [CROWNPOINT_AUTHORITY_PROFILE_ID, CROWNPOINT_AUTHORITY_FIXTURE, CROWNPOINT_AUTHORITY_MAP_BINDING],
  ] as const)('keeps all eight %s patrols on authored collision', async (
    profile,
    fixture,
    binding,
  ) => {
    world = await createRapierMovementWorld(fixture as PhysicsFixtureV1);
    const authority = new AuthoritativeRoom({
      identity: {
        roomId: `room.test.${binding.mapId}.patrol`,
        matchId: `match.test.${binding.mapId}.patrol`,
        rulesetId: G4_COMBAT_RULESET_ID,
        rulesetRevision: G4_COMBAT_RULESET_REVISION,
        rulesetHash: G4_COMBAT_RULESET_HASH,
        mapId: binding.mapId,
        fixtureId: world.fixture.id,
        fixtureHash: world.fixtureHash,
        physicsAdapterId: 'rapier3d_deterministic_compat',
        physicsAdapterVersion: '0.19.3',
      },
      profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      queries: world,
      maximumPlayers: 8,
      minimumConnectedPlayersToStart: 1,
      spawnResolver: (_playerId, ordinal) => originalArenaAuthoritySpawn(
        ordinal,
        profile as OriginalArenaAuthorityProfile,
      ),
      combat: createOriginalArenaAuthorityCombatOptions(
        world,
        profile as OriginalArenaAuthorityProfile,
      ),
    });
    const sequences = new Map<string, number>();
    for (const playerId of RELAY_AUTHORITY_PLAYER_SLOT_IDS) {
      const ordinal = relayAuthorityPlayerSlotOrdinal(playerId);
      if (ordinal === null) throw new Error('Original arena patrol slot is invalid');
      expect(authority.joinNewPlayer({
        playerId,
        connectionId: relayAuthorityBotConnectionId(playerId),
      }).ok).toBe(true);
      authority.recordServerObservedRtt(playerId, 0);
      const preset = combatPresetById(deterministicCombatBotPresetId(ordinal));
      authority.setPlayerCombatLoadout(
        playerId,
        preset.selectableAbilityIds,
        preset.authorityPrimaryWeaponSlot,
      );
      sequences.set(playerId, 0);
    }
    expect(authority.startMatch()).toBe(true);
    while (authority.lifecycle === 'warmup') authority.advanceOneTick();

    const initial = new Map(authority.fullSnapshot().players.map(({ playerId, movement }) => [
      playerId,
      { ...movement.player.feetPosition },
    ]));
    const maximumDisplacementMm = new Map(
      RELAY_AUTHORITY_PLAYER_SLOT_IDS.map((playerId) => [playerId, 0]),
    );
    for (let tick = 0; tick < 500; tick += 1) {
      const snapshot = authority.fullSnapshot();
      for (const playerId of RELAY_AUTHORITY_PLAYER_SLOT_IDS) {
        const generated = authorityBotInput(snapshot, playerId, 0, binding.mapId);
        const sequence = sequences.get(playerId) ?? 0;
        const message: InputBatchMessage = {
          protocolVersion: PROTOCOL_VERSION,
          type: 'inputBatch',
          commands: [{
            type: 'input',
            sequence,
            clientTick: authority.serverTick,
            ...generated,
            heldButtons: 0,
            pressedButtons: 0,
            releasedButtons: 0,
          }],
        };
        expect(authority.enqueueInputBatch(
          relayAuthorityBotConnectionId(playerId),
          message,
        )).toMatchObject({ accepted: 1, rejections: [] });
        sequences.set(playerId, sequence + 1);
      }
      authority.advanceOneTick();
      for (const { playerId, movement } of authority.fullSnapshot().players) {
        const start = initial.get(playerId);
        if (start === undefined) throw new Error(`Missing start for ${playerId}`);
        const current = movement.player.feetPosition;
        maximumDisplacementMm.set(
          playerId,
          Math.max(
            maximumDisplacementMm.get(playerId) ?? 0,
            Math.hypot(current.x - start.x, current.z - start.z),
          ),
        );
      }
    }

    const final = authority.fullSnapshot();
    expect(
      RELAY_AUTHORITY_PLAYER_SLOT_IDS.filter((playerId) => (
        (maximumDisplacementMm.get(playerId) ?? 0) >= 1_000
      )),
      JSON.stringify(Object.fromEntries(maximumDisplacementMm)),
    ).toHaveLength(8);
    expect(final.players.every(({ movement }) => (
      movement.player.feetPosition.y > -5_000
    ))).toBe(true);
  }, 60_000);
});
