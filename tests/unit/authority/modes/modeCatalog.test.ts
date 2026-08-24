import { describe, expect, it } from 'vitest';

import {
  AUTHORITY_MODE_CATALOG,
  KYX_MODE_ID,
  authorityModeDefinition,
  isKyxAuthorityModeId,
  requireAuthorityCoreMode,
  requireRoutableAuthorityMode,
} from '../../../../src/authority';

describe('KYX authority mode catalog', () => {
  it('contains every required non-custom gameplay mode exactly once', () => {
    expect(AUTHORITY_MODE_CATALOG.map(({ id }) => id)).toEqual([
      KYX_MODE_ID.teamDeathmatch,
      KYX_MODE_ID.freeForAll,
      KYX_MODE_ID.instagib,
      KYX_MODE_ID.captureTheFlag,
      KYX_MODE_ID.searchAndDestroy,
      KYX_MODE_ID.lastTeamStanding,
      KYX_MODE_ID.survival,
      KYX_MODE_ID.zombieSurvival,
      KYX_MODE_ID.battleRoyale,
    ]);
    expect(new Set(AUTHORITY_MODE_CATALOG.map(({ id }) => id)).size)
      .toBe(AUTHORITY_MODE_CATALOG.length);
    expect(AUTHORITY_MODE_CATALOG.every(({ serverOwnsAllOutcomes }) => (
      serverOwnsAllOutcomes
    ))).toBe(true);
    expect(Object.isFrozen(AUTHORITY_MODE_CATALOG)).toBe(true);
    expect(AUTHORITY_MODE_CATALOG.every(Object.isFrozen)).toBe(true);
  });

  it('keeps unimplemented modes fail-closed at authority and routing boundaries', () => {
    expect(requireRoutableAuthorityMode(KYX_MODE_ID.teamDeathmatch).implementationStatus)
      .toBe('shipping_runtime');
    expect(requireAuthorityCoreMode(KYX_MODE_ID.freeForAll).implementationStatus)
      .toBe('authority_core');
    expect(() => requireRoutableAuthorityMode(KYX_MODE_ID.freeForAll))
      .toThrow(/not routable/u);
    expect(() => requireAuthorityCoreMode(KYX_MODE_ID.instagib))
      .toThrow(/not implemented/u);
    expect(() => requireRoutableAuthorityMode('client_claimed_mode'))
      .toThrow(/unsupported/u);
  });

  it('defines elimination and objective policies without pretending they are live', () => {
    expect(authorityModeDefinition(KYX_MODE_ID.searchAndDestroy)).toMatchObject({
      implementationStatus: 'foundation_only',
      objectivePolicy: 'bomb',
      respawnPolicy: 'round_reset',
      lateJoinPolicy: 'spectator_until_round',
    });
    expect(authorityModeDefinition(KYX_MODE_ID.battleRoyale)).toMatchObject({
      implementationStatus: 'foundation_only',
      teamPolicy: 'last_player',
      respawnPolicy: 'eliminated',
      loadoutPolicy: 'battle_royale_loot',
      lateJoinPolicy: 'spectator_only',
    });
    expect(isKyxAuthorityModeId(KYX_MODE_ID.captureTheFlag)).toBe(true);
    expect(isKyxAuthorityModeId('deathmatch')).toBe(false);
  });
});
