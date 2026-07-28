import type { RulesetContentV1 } from '../../content';
import {
  PROTOCOL_VERSION,
  type LoadoutRequestMessage,
} from '../../net';
import {
  ABILITY_ID,
  DEFAULT_ABILITY_LOADOUT,
  SELECTABLE_ABILITY_IDS,
  type SelectableAbilityId,
} from '../../abilities/abilityLoadout';

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
  readonly primaryWeaponId: string;
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
  const damageAbilityIds = Object.freeze([
    DEFAULT_ABILITY_LOADOUT.slots[1],
    DEFAULT_ABILITY_LOADOUT.slots[2],
    DEFAULT_ABILITY_LOADOUT.slots[3],
  ]) as readonly [SelectableAbilityId, SelectableAbilityId, SelectableAbilityId];
  return Object.freeze({
    schemaVersion: AUTHORITY_LOADOUT_REQUEST_SCHEMA_VERSION,
    rulesetId: ruleset.id,
    rulesetRevision: ruleset.revision,
    primaryWeaponId: ruleset.verticalSlice.primaryWeaponId,
    secondaryWeaponId: null,
    meleeWeaponId: ruleset.verticalSlice.meleeWeaponId,
    damageAbilityIds,
    utilityAbilityId: ABILITY_ID.blink,
  });
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
    return DEFAULT_ABILITY_LOADOUT.slots.slice(1) as [
      SelectableAbilityId,
      SelectableAbilityId,
      SelectableAbilityId,
    ];
  }
  const fallback = DEFAULT_ABILITY_LOADOUT.slots
    .slice(1)
    .find((id) => !request.damageAbilityIds.includes(id));
  return Object.freeze([
    request.damageAbilityIds[0],
    request.damageAbilityIds[1],
    fallback ?? ABILITY_ID.frag,
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
  if (options.request.primaryWeaponId !== options.authoritativeLoadout.primaryWeaponId) {
    return reject('primary_weapon_not_allowed');
  }
  if (options.request.secondaryWeaponId !== options.authoritativeLoadout.secondaryWeaponId) {
    return reject('secondary_weapon_not_allowed');
  }
  if (options.request.meleeWeaponId !== options.authoritativeLoadout.meleeWeaponId) {
    return reject('melee_weapon_not_allowed');
  }
  const requestedAbilityIds = normalizedRequestedAbilities(options.request);
  if (!SELECTABLE_ABILITY_IDS.includes(requestedAbilityIds[0] as SelectableAbilityId)) {
    return reject('damage_ability_one_not_allowed');
  }
  if (!SELECTABLE_ABILITY_IDS.includes(requestedAbilityIds[1] as SelectableAbilityId)) {
    return reject('damage_ability_two_not_allowed');
  }
  if (!SELECTABLE_ABILITY_IDS.includes(requestedAbilityIds[2] as SelectableAbilityId)) {
    return reject('damage_ability_three_not_allowed');
  }
  if (new Set(requestedAbilityIds).size !== requestedAbilityIds.length) {
    return reject('damage_abilities_not_unique');
  }
  if (options.request.utilityAbilityId !== ABILITY_ID.blink) {
    return reject('utility_ability_not_allowed');
  }
  const loadout: AuthorityLoadoutSelectionV1 = Object.freeze({
    ...options.authoritativeLoadout,
    damageAbilityIds: Object.freeze(requestedAbilityIds) as AuthorityLoadoutSelectionV1['damageAbilityIds'],
    utilityAbilityId: ABILITY_ID.blink,
  });
  return Object.freeze({
    schemaVersion: AUTHORITY_LOADOUT_REQUEST_SCHEMA_VERSION,
    accepted: true,
    requestId: options.request.requestId,
    reason: null,
    loadout,
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
