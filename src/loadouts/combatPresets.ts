import {
  ABILITY_ID,
  createAbilityLoadout,
  type AbilityLoadoutV1,
  type SelectableAbilityId,
} from '../abilities/abilityLoadout';

export const COMBAT_PRESET_SCHEMA_VERSION = 1 as const;

export const COMBAT_PRESET_ID = Object.freeze({
  assault: 'assault',
  breacher: 'breacher',
  recon: 'recon',
  duelist: 'duelist',
} as const);

export type CombatPresetId = typeof COMBAT_PRESET_ID[keyof typeof COMBAT_PRESET_ID];
export type CombatHelmetVariantId = CombatPresetId;
export type CombatPresetWeaponFamily = 'rifle' | 'shotgun' | 'sniper' | 'melee';

export interface CombatPresetV1 {
  readonly schemaVersion: typeof COMBAT_PRESET_SCHEMA_VERSION;
  readonly id: CombatPresetId;
  readonly displayName: string;
  readonly roleLabel: string;
  readonly description: string;
  readonly helmetVariantId: CombatHelmetVariantId;
  readonly weaponFamily: CombatPresetWeaponFamily;
  readonly offlinePrimaryWeaponId: 'm4' | 'energyshotgun' | 'boltsniper' | 'sidearm';
  readonly offlineMeleeWeaponId: 'sword';
  readonly initialOfflineWeaponId: 'm4' | 'energyshotgun' | 'boltsniper' | 'sword';
  readonly authorityPrimaryWeaponId:
    | 'vertical_rifle_v1'
    | 'kyx_scattergun_v1'
    | 'kyx_longshot_v1'
    | 'kyx_edge_v1';
  readonly authorityPrimaryWeaponSlot: 0 | 2 | 3 | 5;
  readonly authorityMeleeWeaponId: 'kyx_edge_v1';
  readonly selectableAbilityIds: readonly [
    SelectableAbilityId,
    SelectableAbilityId,
    SelectableAbilityId,
  ];
}

function preset(
  value: Omit<CombatPresetV1, 'schemaVersion' | 'helmetVariantId'>,
): CombatPresetV1 {
  const selectableAbilityIds = Object.freeze([
    ...value.selectableAbilityIds,
  ]) as CombatPresetV1['selectableAbilityIds'];
  // createAbilityLoadout is the shared fail-closed validator for slot count,
  // selectable IDs, uniqueness, and the immutable Q/Blink position.
  createAbilityLoadout(selectableAbilityIds);
  return Object.freeze({
    schemaVersion: COMBAT_PRESET_SCHEMA_VERSION,
    helmetVariantId: value.id,
    ...value,
    selectableAbilityIds,
  });
}

/**
 * Browser-first spawn presets. A preset is one product decision, not a loose
 * bag of preferences: changing it changes the primary weapon, opening weapon,
 * three E/F/Z abilities, and the third-person helmet variant together. Blink
 * remains server-owned and locked to Q through the ability-loadout contract.
 */
export const COMBAT_PRESETS: readonly CombatPresetV1[] = Object.freeze([
  preset({
    id: COMBAT_PRESET_ID.assault,
    displayName: 'Assault',
    roleLabel: 'Rifle',
    description: 'Flexible mid-range rifle pressure with displacement, concealment, and a frag finisher.',
    weaponFamily: 'rifle',
    offlinePrimaryWeaponId: 'm4',
    offlineMeleeWeaponId: 'sword',
    initialOfflineWeaponId: 'm4',
    authorityPrimaryWeaponId: 'vertical_rifle_v1',
    authorityPrimaryWeaponSlot: 0,
    authorityMeleeWeaponId: 'kyx_edge_v1',
    selectableAbilityIds: [
      ABILITY_ID.launch,
      ABILITY_ID.smoke,
      ABILITY_ID.frag,
    ],
  }),
  preset({
    id: COMBAT_PRESET_ID.breacher,
    displayName: 'Breacher',
    roleLabel: 'Shotgun',
    description: 'Close-range entry kit with a sticky charge, flash control, and launch displacement.',
    weaponFamily: 'shotgun',
    offlinePrimaryWeaponId: 'energyshotgun',
    offlineMeleeWeaponId: 'sword',
    initialOfflineWeaponId: 'energyshotgun',
    authorityPrimaryWeaponId: 'kyx_scattergun_v1',
    authorityPrimaryWeaponSlot: 2,
    authorityMeleeWeaponId: 'kyx_edge_v1',
    selectableAbilityIds: [
      ABILITY_ID.sticky,
      ABILITY_ID.flash,
      ABILITY_ID.launch,
    ],
  }),
  preset({
    id: COMBAT_PRESET_ID.recon,
    displayName: 'Recon',
    roleLabel: 'Sniper',
    description: 'Long-range information and denial with smoke, flash, and a sticky perimeter charge.',
    weaponFamily: 'sniper',
    offlinePrimaryWeaponId: 'boltsniper',
    offlineMeleeWeaponId: 'sword',
    initialOfflineWeaponId: 'boltsniper',
    authorityPrimaryWeaponId: 'kyx_longshot_v1',
    authorityPrimaryWeaponSlot: 3,
    authorityMeleeWeaponId: 'kyx_edge_v1',
    selectableAbilityIds: [
      ABILITY_ID.smoke,
      ABILITY_ID.flash,
      ABILITY_ID.sticky,
    ],
  }),
  preset({
    id: COMBAT_PRESET_ID.duelist,
    displayName: 'Duelist',
    roleLabel: 'Melee',
    description: 'Blade-first pressure with launch mobility, a frag punish, and flash cover for the close.',
    weaponFamily: 'melee',
    offlinePrimaryWeaponId: 'sidearm',
    offlineMeleeWeaponId: 'sword',
    initialOfflineWeaponId: 'sword',
    authorityPrimaryWeaponId: 'kyx_edge_v1',
    authorityPrimaryWeaponSlot: 5,
    authorityMeleeWeaponId: 'kyx_edge_v1',
    selectableAbilityIds: [
      ABILITY_ID.launch,
      ABILITY_ID.frag,
      ABILITY_ID.flash,
    ],
  }),
]);

export const DEFAULT_COMBAT_PRESET = COMBAT_PRESETS[0] as CombatPresetV1;

const PRESET_BY_ID = new Map<CombatPresetId, CombatPresetV1>(
  COMBAT_PRESETS.map((item) => [item.id, item]),
);
const PRESET_BY_OFFLINE_PRIMARY = new Map<string, CombatPresetV1>(
  COMBAT_PRESETS.map((item) => [item.offlinePrimaryWeaponId, item]),
);
const PRESET_BY_AUTHORITY_PRIMARY = new Map<string, CombatPresetV1>(
  COMBAT_PRESETS.map((item) => [item.authorityPrimaryWeaponId, item]),
);

export function isCombatPresetId(value: unknown): value is CombatPresetId {
  return typeof value === 'string' && PRESET_BY_ID.has(value as CombatPresetId);
}

export function combatPresetById(value: unknown): CombatPresetV1 {
  if (!isCombatPresetId(value)) {
    throw new RangeError('combat preset id is unsupported');
  }
  return PRESET_BY_ID.get(value) as CombatPresetV1;
}

export function combatPresetForOfflinePrimaryWeapon(
  weaponId: unknown,
): CombatPresetV1 | null {
  return typeof weaponId === 'string'
    ? PRESET_BY_OFFLINE_PRIMARY.get(weaponId) ?? null
    : null;
}

export function combatPresetForAuthorityPrimaryWeapon(
  weaponId: unknown,
): CombatPresetV1 | null {
  return typeof weaponId === 'string'
    ? PRESET_BY_AUTHORITY_PRIMARY.get(weaponId) ?? null
    : null;
}

export function combatPresetForSelectableAbilities(
  abilityIds: readonly unknown[],
): CombatPresetV1 | null {
  if (abilityIds.length !== 3) return null;
  return COMBAT_PRESETS.find((item) => item.selectableAbilityIds.every(
    (abilityId, index) => abilityId === abilityIds[index],
  )) ?? null;
}

export function combatPresetAbilityLoadout(presetValue: CombatPresetV1): AbilityLoadoutV1 {
  const preset = combatPresetById(presetValue.id);
  return createAbilityLoadout(preset.selectableAbilityIds);
}
