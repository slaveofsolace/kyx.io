import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ABILITY_ID } from '../../../src/abilities/abilityLoadout';
import { Loadout } from '../../../src/core/Loadout.js';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, String(value));
    },
  };
}

describe('combat preset persistence', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('defaults and migrates legacy storage into one deterministic preset', () => {
    expect(Loadout.getCombatPresetId()).toBe('assault');
    expect(Loadout.getGun()).toBe('m4');
    expect(Loadout.getHelmetVariantId()).toBe('assault');

    localStorage.setItem('sio_loadout', JSON.stringify({
      gun: 'boltsniper',
      melee: 'sword',
    }));
    expect(Loadout.getCombatPresetId()).toBe('recon');
    expect(Loadout.getAuthorityPrimaryWeaponId()).toBe('kyx_longshot_v1');
    expect(Loadout.getAuthorityPrimaryWeaponSlot()).toBe(3);
    expect(Loadout.getAbilities().slots).toEqual([
      ABILITY_ID.blink,
      ABILITY_ID.smoke,
      ABILITY_ID.flash,
      ABILITY_ID.sticky,
    ]);
  });

  it('atomically applies weapon, opening slot, helmet, and abilities for every selection', () => {
    Loadout.setCombatPreset('duelist');
    expect(Loadout.getCombatPresetId()).toBe('duelist');
    expect(Loadout.getGun()).toBe('sidearm');
    expect(Loadout.getMelee()).toBe('sword');
    expect(Loadout.getInitialWeaponId()).toBe('sword');
    expect(Loadout.getHelmetVariantId()).toBe('duelist');
    expect(Loadout.getAuthorityPrimaryWeaponSlot()).toBe(5);
    expect(Loadout.getAbilities().slots).toEqual([
      ABILITY_ID.blink,
      ABILITY_ID.launch,
      ABILITY_ID.frag,
      ABILITY_ID.flash,
    ]);
    expect(JSON.parse(localStorage.getItem('sio_loadout') ?? '{}')).toEqual({
      schemaVersion: 1,
      presetId: 'duelist',
      gun: 'sidearm',
      melee: 'sword',
      helmetVariantId: 'duelist',
    });
    expect(JSON.parse(localStorage.getItem('kyx_ability_loadout_v1') ?? '{}').slots)
      .toEqual(Loadout.getAbilities().slots);
  });

  it('fails closed on unsupported loose customization and maps exact preset primaries', () => {
    expect(() => Loadout.setAbilitySlot(1, ABILITY_ID.smoke))
      .toThrow('fixed by the selected combat preset');
    expect(() => Loadout.setGun('rpg'))
      .toThrow('not owned by a supported combat preset');

    Loadout.setGun('energyshotgun');
    expect(Loadout.getCombatPresetId()).toBe('breacher');
    expect(Loadout.getAbilities().slots).toEqual([
      ABILITY_ID.blink,
      ABILITY_ID.sticky,
      ABILITY_ID.flash,
      ABILITY_ID.launch,
    ]);
  });
});
