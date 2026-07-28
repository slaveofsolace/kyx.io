// Player loadout selection: you bring exactly ONE gun and ONE melee into a
// match. Backed by localStorage so the choice persists between sessions.
import { WEAPONS } from '../weapons/weaponDefs.js';
import {
  DEFAULT_ABILITY_LOADOUT,
  abilityLoadoutUiSlots,
  createAbilityLoadout,
  deserializeAbilityLoadout,
  replaceSelectableAbility,
  selectableAbilityMetadata,
  serializeAbilityLoadout,
} from '../abilities/abilityLoadout.ts';

const _KEY = 'sio_loadout';
const _ABILITY_KEY = 'kyx_ability_loadout_v1';

export const GUNS  = WEAPONS.filter((w) => w.kind !== 'melee');
// Only the Arc Blade is available in the standard loadout melee slot
export const MELEE = WEAPONS.filter((w) => w.id === 'sword');

const DEFAULTS = { gun: 'm4', melee: 'sword' };

function _load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(_KEY) || '{}') }; }
  catch { return { ...DEFAULTS }; }
}
function _save(d) { localStorage.setItem(_KEY, JSON.stringify(d)); }

function _loadAbilities() {
  try {
    return deserializeAbilityLoadout(localStorage.getItem(_ABILITY_KEY));
  } catch {
    return DEFAULT_ABILITY_LOADOUT;
  }
}

function _saveAbilities(loadout) {
  localStorage.setItem(_ABILITY_KEY, serializeAbilityLoadout(loadout));
}

// Any gun may be equipped from the loadout.
function _validGun(id) { return GUNS.some((w) => w.id === id) ? id : DEFAULTS.gun; }
function _validMelee(id) { return MELEE.some((w) => w.id === id) ? id : DEFAULTS.melee; }

export const Loadout = {
  getGun()   { return _validGun(_load().gun); },
  getMelee() { return _validMelee(_load().melee); },

  setGun(id) {
    const d = _load();
    d.gun = _validGun(id);
    _save(d);
  },
  setMelee(id) {
    const d = _load();
    d.melee = _validMelee(id);
    _save(d);
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
    const loadout = createAbilityLoadout(selectableAbilityIds);
    _saveAbilities(loadout);
    return loadout;
  },
  setAbilitySlot(slot, abilityId) {
    if (slot === 0) throw new RangeError('Blink is locked and cannot be removed');
    const loadout = replaceSelectableAbility(_loadAbilities(), slot, abilityId);
    _saveAbilities(loadout);
    return loadout;
  },
};
