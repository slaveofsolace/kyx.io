export const ABILITY_LOADOUT_SCHEMA_VERSION = 1 as const;
export const ABILITY_LOADOUT_SLOT_COUNT = 4 as const;
export const LOCKED_BLINK_SLOT = 0 as const;
export const ABILITY_SLOT_INPUT_LABELS = Object.freeze(['Q', 'E', 'F', 'Z'] as const);

export const ABILITY_ID = Object.freeze({
  blink: 'vertical_teleport_v1',
  launch: 'vertical_impulse_grenade_v1',
  frag: 'frag_grenade_v1',
  smoke: 'smoke_grenade_v1',
  sticky: 'sticky_grenade_v1',
  flash: 'flash_grenade_v1',
} as const);

export type AbilityId = typeof ABILITY_ID[keyof typeof ABILITY_ID];
export type SelectableAbilityId = Exclude<AbilityId, typeof ABILITY_ID.blink>;
export type AbilityLoadoutSlots = readonly [
  typeof ABILITY_ID.blink,
  SelectableAbilityId,
  SelectableAbilityId,
  SelectableAbilityId,
];

export interface AbilityPresentationMetadata {
  readonly id: AbilityId;
  readonly shortName: string;
  readonly displayName: string;
  readonly description: string;
  readonly category: 'mobility' | 'damage' | 'control' | 'support';
  readonly locked: boolean;
  readonly inputLabel: string;
  readonly cooldownSeconds: number;
  readonly charges: number | null;
  readonly radiusMeters: number | null;
  readonly maximumRangeMeters: number | null;
  readonly authority: 'server' | 'offline_simulation';
  readonly color: string;
}

export interface AbilityLoadoutV1 {
  readonly schemaVersion: typeof ABILITY_LOADOUT_SCHEMA_VERSION;
  readonly slots: AbilityLoadoutSlots;
}

export interface SerializedAbilityLoadoutV1 {
  readonly schemaVersion: typeof ABILITY_LOADOUT_SCHEMA_VERSION;
  readonly slots: AbilityLoadoutSlots;
}

export interface AbilityLoadoutUiSlot {
  readonly slot: 0 | 1 | 2 | 3;
  readonly ability: AbilityPresentationMetadata;
  readonly locked: boolean;
  readonly inputLabel: string;
}

export const SELECTABLE_ABILITY_IDS = Object.freeze([
  ABILITY_ID.launch,
  ABILITY_ID.frag,
  ABILITY_ID.smoke,
  ABILITY_ID.sticky,
  ABILITY_ID.flash,
] as const);

const SELECTABLE_ID_SET = new Set<string>(SELECTABLE_ABILITY_IDS);

export const ABILITY_PRESENTATION = Object.freeze({
  [ABILITY_ID.blink]: Object.freeze({
    id: ABILITY_ID.blink,
    shortName: 'Blink',
    displayName: 'Blink',
    description: 'Preview a collision-clamped landing marker, then relocate to it.',
    category: 'mobility',
    locked: true,
    inputLabel: 'Q',
    cooldownSeconds: 5,
    charges: null,
    radiusMeters: null,
    maximumRangeMeters: 22,
    authority: 'server',
    color: '#67e8f9',
  }),
  [ABILITY_ID.launch]: Object.freeze({
    id: ABILITY_ID.launch,
    shortName: 'Launch',
    displayName: 'Launch Grenade',
    description: 'A gravity-driven impulse charge that detonates on first world contact and throws nearby players outward and upward.',
    category: 'support',
    locked: false,
    inputLabel: 'Loadout slot',
    cooldownSeconds: 12,
    charges: 2,
    radiusMeters: 11,
    maximumRangeMeters: null,
    authority: 'server',
    color: '#5eead4',
  }),
  [ABILITY_ID.frag]: Object.freeze({
    id: ABILITY_ID.frag,
    shortName: 'Frag',
    displayName: 'Frag Grenade',
    description: 'Timed explosive with radial damage and distance falloff.',
    category: 'damage',
    locked: false,
    inputLabel: 'Loadout slot',
    cooldownSeconds: 8,
    charges: 2,
    radiusMeters: 5,
    maximumRangeMeters: null,
    authority: 'server',
    color: '#fb923c',
  }),
  [ABILITY_ID.smoke]: Object.freeze({
    id: ABILITY_ID.smoke,
    shortName: 'Smoke',
    displayName: 'Smoke Grenade',
    description: 'Deploys a smoothly expanding 5.88 m visual-obscuration field.',
    category: 'control',
    locked: false,
    inputLabel: 'Loadout slot',
    cooldownSeconds: 10,
    charges: 2,
    radiusMeters: 5.88,
    maximumRangeMeters: null,
    authority: 'server',
    color: '#cbd5e1',
  }),
  [ABILITY_ID.sticky]: Object.freeze({
    id: ABILITY_ID.sticky,
    shortName: 'Sticky',
    displayName: 'Sticky Grenade',
    description: 'Adheres to the first valid surface or target, then detonates.',
    category: 'damage',
    locked: false,
    inputLabel: 'Loadout slot',
    cooldownSeconds: 9,
    charges: 2,
    radiusMeters: 4.5,
    maximumRangeMeters: null,
    authority: 'server',
    color: '#facc15',
  }),
  [ABILITY_ID.flash]: Object.freeze({
    id: ABILITY_ID.flash,
    shortName: 'Flash',
    displayName: 'Flash Grenade',
    description: 'Applies a bounded line-of-sight flash effect; damage remains server-owned.',
    category: 'control',
    locked: false,
    inputLabel: 'Loadout slot',
    cooldownSeconds: 10,
    charges: 2,
    radiusMeters: 12,
    maximumRangeMeters: null,
    authority: 'server',
    color: '#f8fafc',
  }),
} satisfies Readonly<Record<AbilityId, AbilityPresentationMetadata>>);

export const DEFAULT_ABILITY_LOADOUT: AbilityLoadoutV1 = Object.freeze({
  schemaVersion: ABILITY_LOADOUT_SCHEMA_VERSION,
  slots: Object.freeze([
    ABILITY_ID.blink,
    ABILITY_ID.launch,
    ABILITY_ID.smoke,
    ABILITY_ID.frag,
  ]) as AbilityLoadoutSlots,
});

function selectableAbilityId(value: unknown, label: string): SelectableAbilityId {
  if (typeof value !== 'string' || !SELECTABLE_ID_SET.has(value)) {
    throw new RangeError(`${label} is not a selectable KYX ability`);
  }
  return value as SelectableAbilityId;
}

function validateSelectableSlots(
  slots: readonly unknown[],
): readonly [SelectableAbilityId, SelectableAbilityId, SelectableAbilityId] {
  if (slots.length !== ABILITY_LOADOUT_SLOT_COUNT - 1) {
    throw new RangeError('an ability loadout requires exactly three selectable abilities');
  }
  const selected = slots.map((value, index) => (
    selectableAbilityId(value, `ability loadout slot ${index + 1}`)
  ));
  if (new Set(selected).size !== selected.length) {
    throw new RangeError('selectable ability slots must be unique');
  }
  return selected as [SelectableAbilityId, SelectableAbilityId, SelectableAbilityId];
}

export function createAbilityLoadout(
  selectableSlots: readonly unknown[] = DEFAULT_ABILITY_LOADOUT.slots.slice(1),
): AbilityLoadoutV1 {
  const selected = validateSelectableSlots(selectableSlots);
  return Object.freeze({
    schemaVersion: ABILITY_LOADOUT_SCHEMA_VERSION,
    slots: Object.freeze([
      ABILITY_ID.blink,
      selected[0],
      selected[1],
      selected[2],
    ]) as AbilityLoadoutSlots,
  });
}

export function assertAbilityLoadout(value: unknown): AbilityLoadoutV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('ability loadout must be an object');
  }
  const item = value as Readonly<Record<string, unknown>>;
  const keys = Object.keys(item).sort();
  if (keys.length !== 2 || keys[0] !== 'schemaVersion' || keys[1] !== 'slots') {
    throw new TypeError('ability loadout contains unsupported or missing fields');
  }
  if (item.schemaVersion !== ABILITY_LOADOUT_SCHEMA_VERSION) {
    throw new RangeError('ability loadout schema is unsupported');
  }
  if (!Array.isArray(item.slots) || item.slots.length !== ABILITY_LOADOUT_SLOT_COUNT) {
    throw new RangeError('ability loadout must contain exactly four slots');
  }
  if (item.slots[LOCKED_BLINK_SLOT] !== ABILITY_ID.blink) {
    throw new RangeError('Blink is locked to ability slot zero');
  }
  return createAbilityLoadout(item.slots.slice(1));
}

export function serializeAbilityLoadout(loadout: AbilityLoadoutV1): string {
  const validated = assertAbilityLoadout(loadout);
  return JSON.stringify({
    schemaVersion: ABILITY_LOADOUT_SCHEMA_VERSION,
    slots: validated.slots,
  } satisfies SerializedAbilityLoadoutV1);
}

export function deserializeAbilityLoadout(serialized: string | null | undefined): AbilityLoadoutV1 {
  if (typeof serialized !== 'string' || serialized.length === 0) {
    return DEFAULT_ABILITY_LOADOUT;
  }
  try {
    return assertAbilityLoadout(JSON.parse(serialized));
  } catch {
    return DEFAULT_ABILITY_LOADOUT;
  }
}

export function replaceSelectableAbility(
  loadout: AbilityLoadoutV1,
  slot: 1 | 2 | 3,
  abilityId: SelectableAbilityId,
): AbilityLoadoutV1 {
  const validated = assertAbilityLoadout(loadout);
  const selected = validated.slots.slice(1);
  const nextAbilityId = selectableAbilityId(abilityId, `ability loadout slot ${slot}`);
  const targetIndex = slot - 1;
  const existingIndex = selected.indexOf(nextAbilityId);
  if (existingIndex >= 0 && existingIndex !== targetIndex) {
    [selected[targetIndex], selected[existingIndex]] = [selected[existingIndex], selected[targetIndex]];
  } else {
    selected[targetIndex] = nextAbilityId;
  }
  return createAbilityLoadout(selected);
}

export function abilityLoadoutUiSlots(loadout: AbilityLoadoutV1): readonly AbilityLoadoutUiSlot[] {
  const validated = assertAbilityLoadout(loadout);
  return Object.freeze(validated.slots.map((id, slot) => Object.freeze({
    slot: slot as 0 | 1 | 2 | 3,
    ability: ABILITY_PRESENTATION[id],
    locked: slot === LOCKED_BLINK_SLOT,
    inputLabel: ABILITY_SLOT_INPUT_LABELS[slot],
  })));
}

export function selectableAbilityMetadata(): readonly AbilityPresentationMetadata[] {
  return Object.freeze(SELECTABLE_ABILITY_IDS.map((id) => ABILITY_PRESENTATION[id]));
}

/**
 * Exact online selection representation. Runtime consumers must bind the three
 * ordered IDs to abilityOne, abilityTwo, and abilityThree respectively; Blink
 * remains the locked utility input.
 */
export function authorityCompatibleAbilityProjection(loadout: AbilityLoadoutV1): Readonly<{
  damageAbilityIds: readonly [SelectableAbilityId, SelectableAbilityId, SelectableAbilityId];
  utilityAbilityId: typeof ABILITY_ID.blink;
}> {
  const validated = assertAbilityLoadout(loadout);
  return Object.freeze({
    damageAbilityIds: Object.freeze([
      validated.slots[1],
      validated.slots[2],
      validated.slots[3],
    ]) as readonly [SelectableAbilityId, SelectableAbilityId, SelectableAbilityId],
    utilityAbilityId: ABILITY_ID.blink,
  });
}
