import { describe, expect, it } from 'vitest';

import { ABILITY_ID } from '../../../src/abilities/abilityLoadout';
import {
  authorityLoadoutForCombatPreset,
  authorityLoadoutFromRuleset,
  createAuthorityLoadoutRequestMessage,
  evaluateAuthorityLoadoutRequest,
} from '../../../src/authority';
import { KYX_WEAPON_PROFILES } from '../../../src/authority/combat/weaponFoundation';
import { requireRuleset } from '../../../src/content';
import {
  CANONICAL_ARENA_AUTHORITY_WEAPON_SLOTS,
  COMBAT_PRESETS,
  combatPresetAbilityLoadout,
  combatPresetAuthorityWeaponSlots,
} from '../../../src/loadouts';
import { WEAPONS } from '../../../src/weapons/weaponDefs.js';

describe('browser-first combat presets', () => {
  it('pins four complete, unique role contracts against real local and authority weapons', () => {
    expect(COMBAT_PRESETS.map(({ id }) => id)).toEqual([
      'assault',
      'breacher',
      'recon',
      'duelist',
    ]);
    expect(new Set(COMBAT_PRESETS.map(({ helmetVariantId }) => helmetVariantId)).size).toBe(4);
    expect(new Set(COMBAT_PRESETS.map(({ offlinePrimaryWeaponId }) => (
      offlinePrimaryWeaponId
    ))).size).toBe(4);
    expect(new Set(COMBAT_PRESETS.map(({ authorityPrimaryWeaponId }) => (
      authorityPrimaryWeaponId
    ))).size).toBe(4);

    for (const preset of COMBAT_PRESETS) {
      expect(preset.helmetVariantId).toBe(preset.id);
      expect(WEAPONS.some(({ id }) => id === preset.offlinePrimaryWeaponId)).toBe(true);
      expect(WEAPONS.some(({ id }) => id === preset.offlineMeleeWeaponId)).toBe(true);
      expect(KYX_WEAPON_PROFILES.some(({ weaponId, slot, family }) => (
        weaponId === preset.authorityPrimaryWeaponId
        && slot === preset.authorityPrimaryWeaponSlot
        && family === preset.weaponFamily
      ))).toBe(true);
      expect(combatPresetAbilityLoadout(preset).slots).toEqual([
        ABILITY_ID.blink,
        ...preset.selectableAbilityIds,
      ]);
      expect(new Set(preset.selectableAbilityIds).size).toBe(3);
      expect(Object.isFrozen(preset)).toBe(true);
      expect(Object.isFrozen(preset.selectableAbilityIds)).toBe(true);
      expect(Object.isFrozen(combatPresetAuthorityWeaponSlots(preset))).toBe(true);
    }

    expect(COMBAT_PRESETS.map((preset) => combatPresetAuthorityWeaponSlots(preset)))
      .toEqual([
        [0, 1, 5],
        [2, 4, 5],
        [3, 1, 5],
        [5, 1],
      ]);
    expect(new Set(COMBAT_PRESETS.flatMap((preset) => (
      combatPresetAuthorityWeaponSlots(preset)
    )))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
    expect(CANONICAL_ARENA_AUTHORITY_WEAPON_SLOTS).toEqual([0, 1, 2, 3, 4, 5]);
    expect(Object.isFrozen(CANONICAL_ARENA_AUTHORITY_WEAPON_SLOTS)).toBe(true);
  });

  it('accepts every exact preset request and rejects cross-preset hybrids', () => {
    const ruleset = requireRuleset('revamped_classic', 3);
    const authoritativeDefault = authorityLoadoutFromRuleset(ruleset);
    for (const [index, preset] of COMBAT_PRESETS.entries()) {
      const loadout = authorityLoadoutForCombatPreset(ruleset, preset.id);
      const request = createAuthorityLoadoutRequestMessage({
        requestId: `req.preset.${preset.id}`,
        loadout,
      });
      expect(evaluateAuthorityLoadoutRequest({
        lifecycle: 'lobby',
        request,
        authoritativeLoadout: authoritativeDefault,
      })).toEqual({
        schemaVersion: 1,
        accepted: true,
        requestId: request.requestId,
        reason: null,
        loadout,
      });

      const nextPreset = COMBAT_PRESETS[(index + 1) % COMBAT_PRESETS.length];
      expect(evaluateAuthorityLoadoutRequest({
        lifecycle: 'lobby',
        request: {
          ...request,
          damageAbilityIds: nextPreset.selectableAbilityIds,
        },
        authoritativeLoadout: authoritativeDefault,
      })).toMatchObject({
        accepted: false,
        reason: expect.stringMatching(/^damage_ability_(one|two|three)_not_allowed$/u),
      });
    }
  });
});
