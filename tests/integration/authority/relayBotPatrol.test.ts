import { afterEach, describe, expect, it } from 'vitest';

import {
  AuthoritativeRoom,
  G4_COMBAT_RULESET_HASH,
  G4_COMBAT_RULESET_ID,
  G4_COMBAT_RULESET_REVISION,
  RELAY_AUTHORITY_FIXTURE,
  RELAY_AUTHORITY_IDENTITY,
  createRelayAuthorityCombatOptions,
  createRelayPortalAuthorityPort,
  relayAuthoritySpawn,
} from '../../../src/authority';
import {
  combatPresetById,
} from '../../../src/loadouts';
import { PROTOCOL_VERSION, type InputBatchMessage } from '../../../src/net';
import { createRapierMovementWorld, type RapierMovementWorld } from '../../../src/physics';
import { PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../../src/sim';
import {
  RELAY_AUTHORITY_PLAYER_SLOT_IDS,
  relayAuthorityBotConnectionId,
  relayAuthorityBotInput,
  relayAuthorityPlayerSlotOrdinal,
} from '../../../worker/relayBotSlots';
import { deterministicCombatBotPresetId } from '../../../src/authority';

describe('Relay authority bot patrol', () => {
  let world: RapierMovementWorld | null = null;

  afterEach(() => {
    world?.dispose();
    world = null;
  });

  it('keeps all eight map-authored patrols collision-stable beyond the former failure tick', async () => {
    world = await createRapierMovementWorld(RELAY_AUTHORITY_FIXTURE);
    const authority = new AuthoritativeRoom({
      identity: {
        roomId: 'room.test.relay.bot.patrol',
        matchId: 'match.test.relay.bot.patrol',
        rulesetId: G4_COMBAT_RULESET_ID,
        rulesetRevision: G4_COMBAT_RULESET_REVISION,
        rulesetHash: G4_COMBAT_RULESET_HASH,
        mapId: RELAY_AUTHORITY_IDENTITY.mapId,
        fixtureId: world.fixture.id,
        fixtureHash: world.fixtureHash,
        physicsAdapterId: 'rapier3d_deterministic_compat',
        physicsAdapterVersion: '0.19.3',
      },
      profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      queries: world,
      maximumPlayers: 8,
      minimumConnectedPlayersToStart: 1,
      spawnResolver: (_playerId, ordinal) => relayAuthoritySpawn(ordinal),
      combat: createRelayAuthorityCombatOptions(world),
      worldPortal: createRelayPortalAuthorityPort(world),
    });
    const sequences = new Map<string, number>();
    const heldButtons = new Map<string, number>();
    for (const playerId of RELAY_AUTHORITY_PLAYER_SLOT_IDS) {
      const ordinal = relayAuthorityPlayerSlotOrdinal(playerId);
      if (ordinal === null) throw new Error('Relay patrol test slot is invalid');
      const joined = authority.joinNewPlayer({
        playerId,
        connectionId: relayAuthorityBotConnectionId(playerId),
      });
      expect(joined.ok).toBe(true);
      authority.recordServerObservedRtt(playerId, 0);
      const preset = combatPresetById(deterministicCombatBotPresetId(ordinal));
      authority.setPlayerCombatLoadout(
        playerId,
        preset.selectableAbilityIds,
        preset.authorityPrimaryWeaponSlot,
      );
      sequences.set(playerId, 0);
      heldButtons.set(playerId, 0);
    }
    expect(authority.startMatch()).toBe(true);
    while (authority.lifecycle === 'warmup') authority.advanceOneTick();

    const initial = new Map(authority.fullSnapshot().players.map(({ playerId, movement }) => [
      playerId,
      { ...movement.player.feetPosition },
    ]));
    const maximumDisplacementMm = new Map(RELAY_AUTHORITY_PLAYER_SLOT_IDS.map((playerId) => [
      playerId,
      0,
    ]));
    for (let tick = 0; tick < 700; tick += 1) {
      const snapshot = authority.fullSnapshot();
      for (const playerId of RELAY_AUTHORITY_PLAYER_SLOT_IDS) {
        const generated = relayAuthorityBotInput(
          snapshot,
          playerId,
          heldButtons.get(playerId) ?? 0,
        );
        // This test isolates patrol physics while retaining the Worker's
        // target-facing yaw/pitch. Combat acceptance has separate full-room
        // coverage and must not end the movement run early.
        const input = {
          ...generated,
          heldButtons: 0,
          pressedButtons: 0,
          releasedButtons: heldButtons.get(playerId) ?? 0,
        };
        const sequence = sequences.get(playerId) ?? 0;
        const message: InputBatchMessage = {
          protocolVersion: PROTOCOL_VERSION,
          type: 'inputBatch',
          commands: [{
            type: 'input',
            sequence,
            clientTick: authority.serverTick,
            ...input,
          }],
        };
        const result = authority.enqueueInputBatch(
          relayAuthorityBotConnectionId(playerId),
          message,
        );
        expect(result).toMatchObject({ accepted: 1, rejections: [] });
        sequences.set(playerId, sequence + 1);
        heldButtons.set(playerId, 0);
      }
      authority.advanceOneTick();
      for (const { playerId, movement } of authority.fullSnapshot().players) {
        const start = initial.get(playerId);
        if (start === undefined) throw new Error(`Missing initial patrol position for ${playerId}`);
        const end = movement.player.feetPosition;
        maximumDisplacementMm.set(
          playerId,
          Math.max(
            maximumDisplacementMm.get(playerId) ?? 0,
            Math.hypot(end.x - start.x, end.z - start.z),
          ),
        );
      }
    }

    const final = authority.fullSnapshot();
    expect(final.serverTick).toBeGreaterThan(700);
    const movementDeltas = final.players.map(({ playerId, movement }) => {
      const start = initial.get(playerId);
      if (start === undefined) throw new Error(`Missing initial patrol position for ${playerId}`);
      const end = movement.player.feetPosition;
      return Object.freeze({
        playerId,
        deltaMm: Math.hypot(end.x - start.x, end.z - start.z),
        start,
        end,
      });
    });
    expect(
      RELAY_AUTHORITY_PLAYER_SLOT_IDS.filter((playerId) => (
        (maximumDisplacementMm.get(playerId) ?? 0) >= 1_000
      )),
      JSON.stringify({ movementDeltas, maximumDisplacementMm: Object.fromEntries(maximumDisplacementMm) }),
    ).toHaveLength(8);
    expect(final.players.every(({ movement }) => (
      movement.player.feetPosition.y > -5_000
    ))).toBe(true);
  }, 60_000);
});
