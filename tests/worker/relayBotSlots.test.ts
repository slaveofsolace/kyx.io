import { describe, expect, it } from 'vitest';

import {
  RELAY_AUTHORITY_PLAYER_SLOT_IDS,
  nextRelayAuthorityBotTakeover,
  relayAuthorityBotConnectionId,
  relayAuthorityPlayerSlotOrdinal,
} from '../../worker/relayBotSlots';

describe('Relay authority bot slots', () => {
  it('pins eight stable authority-owned player slots and connections', () => {
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
