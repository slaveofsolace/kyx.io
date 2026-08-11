import {
  COMBAT_PRESET_ID,
  combatPresetForSelectableAbilities,
} from '../loadouts';
import type { CombatPlayerSnapshotV1 } from '../net';

export type CombatAvatarArmorTypeId = 'assault' | 'heavy' | 'recon' | 'stealth';

/**
 * Keep a remote player's silhouette tied to the authority-owned role loadout.
 * The current character system still uses its four established armor builders,
 * so Breacher maps to the heavy silhouette and Duelist maps to stealth.
 */
export function combatAvatarArmorType(
  player: CombatPlayerSnapshotV1 | null | undefined,
): CombatAvatarArmorTypeId {
  const slots = player?.abilityLoadout?.slots;
  const preset = slots === undefined
    ? null
    : combatPresetForSelectableAbilities(slots.slice(1));
  switch (preset?.id) {
    case COMBAT_PRESET_ID.breacher:
      return 'heavy';
    case COMBAT_PRESET_ID.recon:
      return 'recon';
    case COMBAT_PRESET_ID.duelist:
      return 'stealth';
    default:
      return 'assault';
  }
}
