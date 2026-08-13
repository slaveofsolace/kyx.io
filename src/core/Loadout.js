// Player loadout selection: you bring exactly ONE gun and ONE melee into a
// match. Backed by localStorage so the choice persists between sessions.
import { WEAPONS } from '../weapons/weaponDefs.js';
import {
  abilityLoadoutUiSlots,
  selectableAbilityMetadata,
  serializeAbilityLoadout,
} from '../abilities/abilityLoadout.ts';
import {
  COMBAT_PRESETS,
  DEFAULT_COMBAT_PRESET,
  combatPresetAbilityLoadout,
  combatPresetById,
  combatPresetForOfflinePrimaryWeapon,
  combatPresetForSelectableAbilities,
  isCombatPresetId,
} from '../loadouts/combatPresets.ts';

const _KEY = 'sio_loadout';
const _ABILITY_KEY = 'kyx_ability_loadout_v1';

const PRESET_PRIMARY_IDS = new Set(COMBAT_PRESETS.map(({ offlinePrimaryWeaponId }) => (
  offlinePrimaryWeaponId
)));
export const GUNS = WEAPONS.filter((weapon) => PRESET_PRIMARY_IDS.has(weapon.id));
// Only the Arc Blade is available in the standard loadout melee slot
export const MELEE = WEAPONS.filter((w) => w.id === 'sword');

function _readStored() {
  try {
    const value = JSON.parse(localStorage.getItem(_KEY) || '{}');
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

function _storedPreset() {
  const stored = _readStored();
  if (isCombatPresetId(stored.presetId)) return combatPresetById(stored.presetId);
  // One-time migration from the legacy loose { gun, melee } record. Only exact
  // product-supported primaries migrate to a role; everything else fails back
  // to the reviewed Assault preset.
  return combatPresetForOfflinePrimaryWeapon(stored.gun) ?? DEFAULT_COMBAT_PRESET;
}

function _savePreset(presetValue) {
  const preset = combatPresetById(presetValue.id);
  localStorage.setItem(_KEY, JSON.stringify({
    schemaVersion: 1,
    presetId: preset.id,
    gun: preset.offlinePrimaryWeaponId,
    melee: preset.offlineMeleeWeaponId,
    helmetVariantId: preset.helmetVariantId,
  }));
  localStorage.setItem(
    _ABILITY_KEY,
    serializeAbilityLoadout(combatPresetAbilityLoadout(preset)),
  );
  return preset;
}

function _loadAbilities() {
  return combatPresetAbilityLoadout(_storedPreset());
}

export const Loadout = {
  getCombatPreset() {
    return _storedPreset();
  },
  getCombatPresetId() {
    return _storedPreset().id;
  },
  getHelmetVariantId() {
    return _storedPreset().helmetVariantId;
  },
  getAuthorityPrimaryWeaponId() {
    return _storedPreset().authorityPrimaryWeaponId;
  },
  getAuthorityPrimaryWeaponSlot() {
    return _storedPreset().authorityPrimaryWeaponSlot;
  },
  getInitialWeaponId() {
    return _storedPreset().initialOfflineWeaponId;
  },
  getGun() {
    return _storedPreset().offlinePrimaryWeaponId;
  },
  getMelee() {
    return _storedPreset().offlineMeleeWeaponId;
  },

  setCombatPreset(id) {
    return _savePreset(combatPresetById(id));
  },
  setGun(weaponId) {
    const preset = combatPresetForOfflinePrimaryWeapon(weaponId);
    if (preset === null) {
      throw new RangeError('primary weapon is not owned by a supported combat preset');
    }
    return _savePreset(preset);
  },
  setMelee(id) {
    if (!MELEE.some((weapon) => weapon.id === id)) {
      throw new RangeError('melee weapon is not supported by combat presets');
    }
    return _savePreset(_storedPreset());
  },

  getAbilities() {
    return _loadAbilities();
  },
  getAbilityUiSlots() {
    return abilityLoadoutUiSlots(_loadAbilities());
  },
  getSelectableAbilities() {
    return selectableAbilityMetadata();
  },
  setAbilities(selectableAbilityIds) {
    const preset = combatPresetForSelectableAbilities(selectableAbilityIds);
    if (preset === null) {
      throw new RangeError('ability trio is not owned by a supported combat preset');
    }
    _savePreset(preset);
    return combatPresetAbilityLoadout(preset);
  },
  setAbilitySlot(slot, _abilityId) {
    void _abilityId;
    if (slot === 0) throw new RangeError('Blink is locked and cannot be removed');
    throw new RangeError('ability slots are fixed by the selected combat preset');
  },
};
