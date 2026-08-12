import { describe, expect, it } from 'vitest';

import {
  CROWNPOINT_AUTHORITY_BOT_PATROL_LANES,
  RELAY_AUTHORITY_BOT_PATROL_LANES,
  RELAY_AUTHORITY_BOT_STRATEGY,
  RELAY_AUTHORITY_PLAYER_SLOT_IDS,
  SWITCHYARD_AUTHORITY_BOT_PATROL_LANES,
  SWITCHYARD_AUTHORITY_BOT_STRATEGY,
  CROWNPOINT_AUTHORITY_BOT_STRATEGY,
  authorityBotStrategy,
  authorityBotPatrolDecision,
  nextRelayAuthorityBotTakeover,
  relayAuthorityBotConnectionId,
  relayAuthorityBotPatrolDecision,
  relayAuthorityPlayerSlotOrdinal,
} from '../../worker/relayBotSlots';
import type { AuthorityFullSnapshot } from '../../src/authority';

function patrolSnapshot(
  playerId: string,
  feetPosition: Readonly<{ x: number; y: number; z: number }>,
  yawMilliDegrees = 0,
  serverTick = 0,
): AuthorityFullSnapshot {
  return {
    serverTick,
    players: [{
      playerId,
      movement: { player: { feetPosition, yawMilliDegrees } },
      combat: { life: { phase: 'alive' } },
    }],
  } as AuthorityFullSnapshot;
}

describe('Relay authority bot slots', () => {
  it('pins eight stable authority-owned player slots and connections', () => {
    expect(RELAY_AUTHORITY_BOT_STRATEGY).toBe('relay_authority_safe_patrol_slot_takeover_v2');
    expect(RELAY_AUTHORITY_PLAYER_SLOT_IDS).toEqual([
      'player.relay.slot.01',
      'player.relay.slot.02',
      'player.relay.slot.03',
      'player.relay.slot.04',
      'player.relay.slot.05',
      'player.relay.slot.06',
      'player.relay.slot.07',
      'player.relay.slot.08',
    ]);
    expect(RELAY_AUTHORITY_PLAYER_SLOT_IDS.map(relayAuthorityBotConnectionId)).toEqual([
      'connection.relay.bot.01',
      'connection.relay.bot.02',
      'connection.relay.bot.03',
      'connection.relay.bot.04',
      'connection.relay.bot.05',
      'connection.relay.bot.06',
      'connection.relay.bot.07',
      'connection.relay.bot.08',
    ]);
  });

  it('reports a truthful map-specific strategy identity', () => {
    expect(authorityBotStrategy('relay')).toBe(RELAY_AUTHORITY_BOT_STRATEGY);
    expect(authorityBotStrategy('switchyard')).toBe(SWITCHYARD_AUTHORITY_BOT_STRATEGY);
    expect(authorityBotStrategy('crownpoint')).toBe(CROWNPOINT_AUTHORITY_BOT_STRATEGY);
    expect(() => authorityBotStrategy('unknown')).toThrow(/does not support/u);
  });

  it('pins one bounded clear-floor patrol lane per stable slot', () => {
    for (const lanes of [
      RELAY_AUTHORITY_BOT_PATROL_LANES,
      SWITCHYARD_AUTHORITY_BOT_PATROL_LANES,
      CROWNPOINT_AUTHORITY_BOT_PATROL_LANES,
    ]) {
      expect(lanes).toHaveLength(8);
      expect(new Set(lanes.map(({ laneId }) => laneId)).size).toBe(8);
      for (const patrol of lanes) {
        for (const anchor of patrol.anchors) {
          expect(anchor.x).toBeGreaterThanOrEqual(patrol.minimum.x);
          expect(anchor.x).toBeLessThanOrEqual(patrol.maximum.x);
          expect(anchor.y).toBeGreaterThanOrEqual(patrol.minimum.y);
          expect(anchor.y).toBeLessThanOrEqual(patrol.maximum.y);
          expect(anchor.z).toBeGreaterThanOrEqual(patrol.minimum.z);
          expect(anchor.z).toBeLessThanOrEqual(patrol.maximum.z);
        }
      }
    }
  });

  it.each([
    ['switchyard', { x: -26_000, y: 0, z: 14_000 }, 'switchyard_west_north'],
    ['crownpoint', { x: -21_000, y: 0, z: 11_000 }, 'crownpoint_west_north'],
  ] as const)('selects the %s authored patrol contract', (mapId, feet, laneId) => {
    const playerId = 'player.relay.slot.01';
    expect(authorityBotPatrolDecision(
      patrolSnapshot(playerId, feet),
      playerId,
      mapId,
    )).toMatchObject({ laneId, active: true });
  });

  it('moves toward a lane anchor but fails closed outside the authored floor inset', () => {
    const playerId = 'player.relay.slot.01';
    const active = relayAuthorityBotPatrolDecision(
      patrolSnapshot(playerId, { x: -29_000, y: 0, z: 0 }),
      playerId,
    );
    expect(active).toMatchObject({ laneId: 'west_spawn_a', active: true });
    expect(Math.hypot(active.moveX, active.moveY)).toBeGreaterThan(0);
    expect(Math.max(Math.abs(active.moveX), Math.abs(active.moveY))).toBeLessThanOrEqual(64);

    const outside = relayAuthorityBotPatrolDecision(
      patrolSnapshot(playerId, { x: -18_000, y: 0, z: 0 }),
      playerId,
    );
    expect(outside).toMatchObject({
      laneId: 'west_spawn_a',
      active: false,
      moveX: 0,
      moveY: 0,
    });
  });

  it('selects the lowest remaining bot slot for human takeover', () => {
    const bots = new Set([
      RELAY_AUTHORITY_PLAYER_SLOT_IDS[4] as string,
      RELAY_AUTHORITY_PLAYER_SLOT_IDS[1] as string,
    ]);
    expect(nextRelayAuthorityBotTakeover(bots)).toBe('player.relay.slot.02');
    bots.clear();
    expect(nextRelayAuthorityBotTakeover(bots)).toBeNull();
  });

  it('rejects identities outside the exact slot contract', () => {
    expect(relayAuthorityPlayerSlotOrdinal('player.relay.slot.01')).toBe(1);
    expect(relayAuthorityPlayerSlotOrdinal('player.relay.slot.08')).toBe(8);
    expect(relayAuthorityPlayerSlotOrdinal('player.relay.slot.09')).toBeNull();
    expect(() => relayAuthorityBotConnectionId('player.random')).toThrow(/player slot/u);
  });
});
