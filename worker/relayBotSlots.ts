export const RELAY_AUTHORITY_PLAYER_SLOT_COUNT = 8 as const;

export const RELAY_AUTHORITY_PLAYER_SLOT_IDS = Object.freeze(Array.from(
  { length: RELAY_AUTHORITY_PLAYER_SLOT_COUNT },
  (_, index) => `player.relay.slot.${String(index + 1).padStart(2, '0')}`,
));

export function relayAuthorityPlayerSlotOrdinal(playerId: string): number | null {
  const match = /^player\.relay\.slot\.(0[1-8])$/u.exec(playerId);
  if (match === null) return null;
  return Number(match[1]);
}

export function relayAuthorityBotConnectionId(playerId: string): string {
  const ordinal = relayAuthorityPlayerSlotOrdinal(playerId);
  if (ordinal === null) throw new RangeError('Relay authority bot requires a player slot id');
  return `connection.relay.bot.${String(ordinal).padStart(2, '0')}`;
}

export function nextRelayAuthorityBotTakeover(
  botPlayerIds: ReadonlySet<string>,
): string | null {
  return RELAY_AUTHORITY_PLAYER_SLOT_IDS.find((playerId) => botPlayerIds.has(playerId)) ?? null;
}
