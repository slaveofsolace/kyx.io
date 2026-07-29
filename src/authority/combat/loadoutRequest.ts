import type { RulesetContentV1 } from '../../content';
import {
  PROTOCOL_VERSION,
  type LoadoutRequestMessage,
} from '../../net';
import {
  ABILITY_ID,
  type SelectableAbilityId,
} from '../../abilities/abilityLoadout';
import {
  DEFAULT_COMBAT_PRESET,
  combatPresetById,
  combatPresetForAuthorityPrimaryWeapon,
  type CombatHelmetVariantId,
  type CombatPresetId,
  type CombatPresetV1,
  type CombatPresetWeaponFamily,
} from '../../loadouts';

export const AUTHORITY_LOADOUT_REQUEST_SCHEMA_VERSION = 1 as const;

export type AuthorityLoadoutLifecycle =
  | 'created'
  | 'lobby'
  | 'warmup'
  | 'active'
  | 'postmatch'
  | 'idle'
  | 'expired';

export interface AuthorityLoadoutSelectionV1 {
  readonly schemaVersion: 1;
  readonly rulesetId: string;
  readonly rulesetRevision: number;
  readonly presetId: CombatPresetId;
  readonly helmetVariantId: CombatHelmetVariantId;
  readonly primaryWeaponId: string;
  readonly primaryWeaponFamily: CombatPresetWeaponFamily;
  readonly primaryWeaponSlot: 0 | 2 | 3 | 5;
  readonly secondaryWeaponId: null;
  readonly meleeWeaponId: string;
  readonly damageAbilityIds: readonly [
    SelectableAbilityId,
    SelectableAbilityId,
    SelectableAbilityId,
  ];
  readonly utilityAbilityId: string;
}

export type AuthorityLoadoutRequestRejectionReason =
  | 'loadout_locked'
  | 'primary_weapon_not_allowed'
  | 'secondary_weapon_not_allowed'
  | 'melee_weapon_not_allowed'
  | 'damage_ability_one_not_allowed'
  | 'damage_ability_two_not_allowed'
  | 'damage_ability_three_not_allowed'
  | 'damage_abilities_not_unique'
  | 'utility_ability_not_allowed';

export type AuthorityLoadoutRequestDecisionV1 =
  | Readonly<{
      schemaVersion: 1;
      accepted: true;
      requestId: string;
      reason: null;
      loadout: AuthorityLoadoutSelectionV1;
    }>
  | Readonly<{
      schemaVersion: 1;
      accepted: false;
      requestId: string;
      reason: AuthorityLoadoutRequestRejectionReason;
      loadout: null;
    }>;

export function authorityLoadoutFromRuleset(
  ruleset: Pick<RulesetContentV1, 'id' | 'revision' | 'verticalSlice'>,
): AuthorityLoadoutSelectionV1 {
  return authorityLoadoutForCombatPreset(ruleset, DEFAULT_COMBAT_PRESET.id);
}

function selectionForPreset(
  ruleset: Pick<RulesetContentV1, 'id' | 'revision'>,
  preset: CombatPresetV1,
): AuthorityLoadoutSelectionV1 {
  return Object.freeze({
    schemaVersion: AUTHORITY_LOADOUT_REQUEST_SCHEMA_VERSION,
    rulesetId: ruleset.id,
    rulesetRevision: ruleset.revision,
    presetId: preset.id,
    helmetVariantId: preset.helmetVariantId,
    primaryWeaponId: preset.authorityPrimaryWeaponId,
    primaryWeaponFamily: preset.weaponFamily,
    primaryWeaponSlot: preset.authorityPrimaryWeaponSlot,
    secondaryWeaponId: null,
    meleeWeaponId: preset.authorityMeleeWeaponId,
    damageAbilityIds: preset.selectableAbilityIds,
    utilityAbilityId: ABILITY_ID.blink,
  });
}

export function authorityLoadoutForCombatPreset(
  ruleset: Pick<RulesetContentV1, 'id' | 'revision'>,
  presetId: CombatPresetId,
): AuthorityLoadoutSelectionV1 {
  return selectionForPreset(ruleset, combatPresetById(presetId));
}

export function assertAuthorityLoadoutSelection(
  value: unknown,
  ruleset: Pick<RulesetContentV1, 'id' | 'revision'>,
): AuthorityLoadoutSelectionV1 {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('authority loadout selection must be an object');
  }
  const item = value as Readonly<Record<string, unknown>>;
  const expectedKeys = [
    'schemaVersion',
    'rulesetId',
    'rulesetRevision',
    'presetId',
    'helmetVariantId',
    'primaryWeaponId',
    'primaryWeaponFamily',
    'primaryWeaponSlot',
    'secondaryWeaponId',
    'meleeWeaponId',
    'damageAbilityIds',
    'utilityAbilityId',
  ].sort();
  const keys = Object.keys(item).sort();
  if (
    keys.length !== expectedKeys.length
    || keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new TypeError('authority loadout selection contains unsupported or missing fields');
  }
  const preset = combatPresetById(item.presetId);
  const expected = selectionForPreset(ruleset, preset);
  const scalarKeys = [
    'schemaVersion',
    'rulesetId',
    'rulesetRevision',
    'presetId',
    'helmetVariantId',
    'primaryWeaponId',
    'primaryWeaponFamily',
    'primaryWeaponSlot',
    'secondaryWeaponId',
    'meleeWeaponId',
    'utilityAbilityId',
  ] as const;
  const damageAbilityIds = item.damageAbilityIds;
  if (
    scalarKeys.some((key) => item[key] !== expected[key])
    || !Array.isArray(damageAbilityIds)
    || damageAbilityIds.length !== expected.damageAbilityIds.length
    || expected.damageAbilityIds.some((id, index) => damageAbilityIds[index] !== id)
  ) {
    throw new RangeError('authority loadout selection does not match its combat preset');
  }
  return expected;
}

export function authorityLoadoutRequestFingerprint(
  request: LoadoutRequestMessage,
): string {
  return JSON.stringify([
    AUTHORITY_LOADOUT_REQUEST_SCHEMA_VERSION,
    request.primaryWeaponId,
    request.secondaryWeaponId,
    request.meleeWeaponId,
    request.damageAbilityIds[0],
    request.damageAbilityIds[1],
    request.damageAbilityIds[2] ?? null,
    request.utilityAbilityId,
  ]);
}

function normalizedRequestedAbilities(
  request: LoadoutRequestMessage,
): readonly [string, string, string] {
  if (request.damageAbilityIds.length === 3) {
    return request.damageAbilityIds;
  }
  if (
    request.damageAbilityIds[0] === ABILITY_ID.launch
    && request.damageAbilityIds[1] === 'vertical_deployable_v1'
  ) {
    return DEFAULT_COMBAT_PRESET.selectableAbilityIds;
  }
  return Object.freeze([
    request.damageAbilityIds[0],
    request.damageAbilityIds[1],
    '__unsupported_legacy_ability_tuple__',
  ]);
}

export function evaluateAuthorityLoadoutRequest(options: Readonly<{
  lifecycle: AuthorityLoadoutLifecycle;
  request: LoadoutRequestMessage;
  authoritativeLoadout: AuthorityLoadoutSelectionV1;
}>): AuthorityLoadoutRequestDecisionV1 {
  const reject = (
    reason: AuthorityLoadoutRequestRejectionReason,
  ): AuthorityLoadoutRequestDecisionV1 => Object.freeze({
    schemaVersion: AUTHORITY_LOADOUT_REQUEST_SCHEMA_VERSION,
    accepted: false,
    requestId: options.request.requestId,
    reason,
    loadout: null,
  });

  if (options.lifecycle !== 'lobby' && options.lifecycle !== 'warmup') {
    return reject('loadout_locked');
  }
  const requestedPreset = combatPresetForAuthorityPrimaryWeapon(
    options.request.primaryWeaponId,
  );
  if (requestedPreset === null) {
    return reject('primary_weapon_not_allowed');
  }
  const candidate = selectionForPreset({
    id: options.authoritativeLoadout.rulesetId,
    revision: options.authoritativeLoadout.rulesetRevision,
  }, requestedPreset);
  if (options.request.secondaryWeaponId !== candidate.secondaryWeaponId) {
    return reject('secondary_weapon_not_allowed');
  }
  if (options.request.meleeWeaponId !== candidate.meleeWeaponId) {
    return reject('melee_weapon_not_allowed');
  }
  const requestedAbilityIds = normalizedRequestedAbilities(options.request);
  if (requestedAbilityIds[0] !== candidate.damageAbilityIds[0]) {
    return reject('damage_ability_one_not_allowed');
  }
  if (requestedAbilityIds[1] !== candidate.damageAbilityIds[1]) {
    return reject('damage_ability_two_not_allowed');
  }
  if (requestedAbilityIds[2] !== candidate.damageAbilityIds[2]) {
    return reject('damage_ability_three_not_allowed');
  }
  if (new Set(requestedAbilityIds).size !== requestedAbilityIds.length) {
    return reject('damage_abilities_not_unique');
  }
  if (options.request.utilityAbilityId !== ABILITY_ID.blink) {
    return reject('utility_ability_not_allowed');
  }
  return Object.freeze({
    schemaVersion: AUTHORITY_LOADOUT_REQUEST_SCHEMA_VERSION,
    accepted: true,
    requestId: options.request.requestId,
    reason: null,
    loadout: candidate,
  });
}

export function hashAuthorityLoadoutDecisionTrace(
  decisions: readonly AuthorityLoadoutRequestDecisionV1[],
): string {
  const canonical = JSON.stringify(decisions);
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(canonical)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

export function createAuthorityLoadoutRequestMessage(options: Readonly<{
  requestId: string;
  loadout: AuthorityLoadoutSelectionV1;
}>): LoadoutRequestMessage {
  return Object.freeze({
    protocolVersion: PROTOCOL_VERSION,
    type: 'loadoutRequest',
    requestId: options.requestId,
    primaryWeaponId: options.loadout.primaryWeaponId,
    secondaryWeaponId: options.loadout.secondaryWeaponId,
    meleeWeaponId: options.loadout.meleeWeaponId,
    damageAbilityIds: options.loadout.damageAbilityIds,
    utilityAbilityId: options.loadout.utilityAbilityId,
  });
}
