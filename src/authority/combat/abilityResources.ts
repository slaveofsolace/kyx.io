import {
  AUTO_RIFLE_WEAPON_ID,
  G4_AUTO_RIFLE_RULES,
  assertAutoRifleState,
  type AutoRiflePhase,
  type AutoRifleState,
} from './autoRifle';
import {
  G4_IMPULSE_GRENADE_RULES,
  IMPULSE_GRENADE_ABILITY_ID,
  type ImpulseGrenadeAbilityPhase,
  type ImpulseGrenadeAbilityState,
  type ImpulseGrenadeVector3,
} from './impulseGrenade';

const MAX_STABLE_ID_BYTES = 96;
const MAX_AUTHORITY_TICK = Number.MAX_SAFE_INTEGER - 100_000;

export const ABILITY_RESOURCE_INTEGRATION_SCHEMA_VERSION = 1 as const;
export const G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_ID = 'phase3_hypothesis_v1' as const;
export const G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_REVISION = 1 as const;
export const G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_HASH = '8ab4ed437a4393c0' as const;
export const G4_DEPLOYABLE_ABILITY_ID = 'vertical_deployable_v1' as const;
export const G4_TELEPORT_ABILITY_ID = 'vertical_teleport_v1' as const;

export interface AbilityResourceIntegrationRulesV1 {
  readonly schemaVersion: 1;
  readonly authorityHz: 20;
  readonly movementProfileId: typeof G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_ID;
  readonly movementProfileRevision: typeof G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_REVISION;
  readonly movementProfileHash: typeof G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_HASH;
  readonly primaryWeaponSlotIndex: 0;
  readonly primaryWeaponId: typeof AUTO_RIFLE_WEAPON_ID;
  readonly damageAbilitySlotCount: 2;
  readonly damageAbilityOneId: typeof IMPULSE_GRENADE_ABILITY_ID;
  readonly damageAbilityTwoId: typeof G4_DEPLOYABLE_ABILITY_ID;
  readonly utilityAbilitySlotCount: 1;
  readonly utilityAbilityId: typeof G4_TELEPORT_ABILITY_ID;
  readonly ammoAbilityEnabled: false;
  readonly teleport: Readonly<{
    readonly maximumRangeMillimeters: 9_000;
    readonly backwardSearchStepMillimeters: 100;
    readonly maximumBackwardSearchSteps: 90;
    readonly cooldownTicks: 160;
    readonly cooldownOnFailure: false;
    readonly retainPlanarVelocityPermille: 1_000;
    readonly retainVerticalVelocityPermille: 0;
    readonly requireGroundedDestination: false;
    readonly resourcePolicy: 'movement_profile_cooldown_only';
    readonly weaponRecoveryTicks: 0;
    readonly combatStatePolicy: 'preserve_existing_combat_state';
  }>;
}

/**
 * P5.5 does not invent teleport balance. This fixture binds the authoritative
 * combat loadout to the already accepted G2/G3 movement profile and records
 * its existing zero-recovery behavior explicitly. The teleport resolver,
 * destination policy, velocity policy, and cooldown remain movement-owned.
 */
export const G4_ABILITY_RESOURCE_INTEGRATION_RULES: AbilityResourceIntegrationRulesV1 =
  Object.freeze({
    schemaVersion: 1,
    authorityHz: 20,
    movementProfileId: G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_ID,
    movementProfileRevision: G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_REVISION,
    movementProfileHash: G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_HASH,
    primaryWeaponSlotIndex: 0,
    primaryWeaponId: AUTO_RIFLE_WEAPON_ID,
    damageAbilitySlotCount: 2,
    damageAbilityOneId: IMPULSE_GRENADE_ABILITY_ID,
    damageAbilityTwoId: G4_DEPLOYABLE_ABILITY_ID,
    utilityAbilitySlotCount: 1,
    utilityAbilityId: G4_TELEPORT_ABILITY_ID,
    ammoAbilityEnabled: false,
    teleport: Object.freeze({
      maximumRangeMillimeters: 9_000,
      backwardSearchStepMillimeters: 100,
      maximumBackwardSearchSteps: 90,
      cooldownTicks: 160,
      cooldownOnFailure: false,
      retainPlanarVelocityPermille: 1_000,
      retainVerticalVelocityPermille: 0,
      requireGroundedDestination: false,
      resourcePolicy: 'movement_profile_cooldown_only',
      weaponRecoveryTicks: 0,
      combatStatePolicy: 'preserve_existing_combat_state',
    }),
  });

export interface AuthorityAbilityResourceMovementStateV1 {
  readonly schemaVersion: 1;
  readonly authorityTick: number;
  readonly movementProfileId: string;
  readonly movementProfileRevision: number;
  readonly movementProfileHash: string;
  readonly selectedSlot: number;
  readonly sprintHeld: boolean;
  readonly locomotion: 'grounded' | 'airborne' | 'sliding';
  readonly teleportCooldownTicksRemaining: number;
}

export interface DeriveAuthorityAbilityResourcesRequestV1 {
  readonly schemaVersion: 1;
  readonly authorityTick: number;
  readonly lifePhase: 'alive' | 'dead';
  readonly movement: AuthorityAbilityResourceMovementStateV1;
  readonly autoRifle: AutoRifleState;
  readonly impulseGrenade: ImpulseGrenadeAbilityState;
  readonly activeImpulseGrenadeCount: number;
}

export interface AuthorityAbilityResourceSnapshotV1 {
  readonly schemaVersion: 1;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly movementProfile: Readonly<{
    readonly id: typeof G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_ID;
    readonly revision: typeof G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_REVISION;
    readonly hash: typeof G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_HASH;
  }>;
  readonly loadout: Readonly<{
    readonly primaryWeaponId: typeof AUTO_RIFLE_WEAPON_ID;
    readonly damageAbilityIds: readonly [
      typeof IMPULSE_GRENADE_ABILITY_ID,
      typeof G4_DEPLOYABLE_ABILITY_ID,
    ];
    readonly utilityAbilityId: typeof G4_TELEPORT_ABILITY_ID;
    readonly ammoAbilityEnabled: false;
  }>;
  readonly equipped: Readonly<{
    readonly selectedWeaponSlot: number;
    readonly primaryWeaponEquipped: boolean;
  }>;
  readonly primaryWeapon: Readonly<{
    readonly phase: AutoRiflePhase;
    readonly magazineRounds: number;
    readonly reserveRounds: number;
    readonly nextShotAtTick: number;
    readonly reloadCompletesAtTick: number | null;
  }>;
  readonly damageAbilityOne: Readonly<{
    readonly abilityId: typeof IMPULSE_GRENADE_ABILITY_ID;
    readonly phase: ImpulseGrenadeAbilityPhase;
    readonly readyTicksRemaining: number;
    readonly cooldownTicksRemaining: number;
    readonly currentCharges: number;
    readonly maximumCharges: 2;
    readonly activeProjectileCount: number;
    readonly maximumActiveProjectileCount: 2;
    readonly resourcePolicy: 'two_charges_sequential_recharge';
  }>;
  readonly damageAbilityTwo: Readonly<{
    readonly abilityId: typeof G4_DEPLOYABLE_ABILITY_ID;
    readonly status: 'contract_only_unavailable';
  }>;
  readonly utilityAbility: Readonly<{
    readonly abilityId: typeof G4_TELEPORT_ABILITY_ID;
    readonly phase: 'ready' | 'cooldown' | 'dead';
    readonly cooldownTicksRemaining: number;
    readonly maximumRangeMillimeters: 9_000;
    readonly resourcePolicy: 'movement_profile_cooldown_only';
    readonly destinationAuthority: 'movement_query_port';
    readonly weaponRecoveryTicks: 0;
  }>;
  readonly locks: Readonly<{
    readonly dead: boolean;
    readonly sprinting: boolean;
    readonly sliding: boolean;
  }>;
}

export type AuthorityTeleportMovementOutcomeV1 =
  | {
      readonly kind: 'teleport_succeeded';
      readonly tick: number;
      readonly entityId: string;
      readonly outcome: 'full' | 'partial';
      readonly from: ImpulseGrenadeVector3;
      readonly to: ImpulseGrenadeVector3;
    }
  | {
      readonly kind: 'teleport_rejected';
      readonly tick: number;
      readonly entityId: string;
      readonly reason: 'cooldown' | 'blocked' | 'forbidden_volume' | 'kill_volume' | 'no_ground';
    };

export interface CreateAuthorityTeleportResourceEventsRequestV1 {
  readonly schemaVersion: 1;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly teleportOutcomes: readonly AuthorityTeleportMovementOutcomeV1[];
  readonly resources: AuthorityAbilityResourceSnapshotV1;
}

export type AuthorityTeleportResourceEvent =
  | {
      readonly kind: 'teleport_resource_confirmed';
      readonly eventId: string;
      readonly authorityTick: number;
      readonly playerId: string;
      readonly abilityId: typeof G4_TELEPORT_ABILITY_ID;
      readonly outcome: 'full' | 'partial';
      readonly from: ImpulseGrenadeVector3;
      readonly to: ImpulseGrenadeVector3;
      readonly cooldownTicksRemaining: 160;
      readonly weaponRecoveryTicks: 0;
      readonly combatStatePolicy: 'preserve_existing_combat_state';
    }
  | {
      readonly kind: 'teleport_resource_rejected';
      readonly eventId: string;
      readonly authorityTick: number;
      readonly playerId: string;
      readonly abilityId: typeof G4_TELEPORT_ABILITY_ID;
      readonly reason: 'cooldown' | 'blocked' | 'forbidden_volume' | 'kill_volume' | 'no_ground';
      readonly cooldownTicksRemaining: number;
      readonly cooldownConsumedByFailure: false;
    };

function exactKeys(value: object, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} contains unsupported or missing fields`);
  }
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function stableId(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || new TextEncoder().encode(value).byteLength > MAX_STABLE_ID_BYTES
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(value)
  ) {
    throw new RangeError(`${label} must be a bounded stable identifier`);
  }
  return value;
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean`);
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function literal(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new RangeError(`${label} must equal ${String(expected)}`);
}

function vector(value: unknown, label: string): ImpulseGrenadeVector3 {
  const item = record(value, label);
  exactKeys(item, ['x', 'y', 'z'], label);
  return Object.freeze({
    x: integer(item.x, -20_000_000, 20_000_000, `${label}.x`),
    y: integer(item.y, -20_000_000, 20_000_000, `${label}.y`),
    z: integer(item.z, -20_000_000, 20_000_000, `${label}.z`),
  });
}

export function assertAbilityResourceIntegrationRules(
  rules: AbilityResourceIntegrationRulesV1,
): void {
  const item = record(rules, 'ability resource integration rules');
  exactKeys(item, [
    'schemaVersion', 'authorityHz', 'movementProfileId', 'movementProfileRevision',
    'movementProfileHash', 'primaryWeaponSlotIndex', 'primaryWeaponId',
    'damageAbilitySlotCount', 'damageAbilityOneId', 'damageAbilityTwoId',
    'utilityAbilitySlotCount', 'utilityAbilityId', 'ammoAbilityEnabled', 'teleport',
  ], 'ability resource integration rules');
  for (const [value, expected, label] of [
    [item.schemaVersion, 1, 'ability resource schema'],
    [item.authorityHz, 20, 'ability resource authority rate'],
    [item.movementProfileId, G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_ID, 'movement profile id'],
    [item.movementProfileRevision, 1, 'movement profile revision'],
    [item.movementProfileHash, G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_HASH, 'movement profile hash'],
    [item.primaryWeaponSlotIndex, 0, 'primary weapon slot'],
    [item.primaryWeaponId, AUTO_RIFLE_WEAPON_ID, 'primary weapon id'],
    [item.damageAbilitySlotCount, 2, 'damage ability slot count'],
    [item.damageAbilityOneId, IMPULSE_GRENADE_ABILITY_ID, 'damage ability one id'],
    [item.damageAbilityTwoId, G4_DEPLOYABLE_ABILITY_ID, 'damage ability two id'],
    [item.utilityAbilitySlotCount, 1, 'utility ability slot count'],
    [item.utilityAbilityId, G4_TELEPORT_ABILITY_ID, 'utility ability id'],
    [item.ammoAbilityEnabled, false, 'ammo ability policy'],
  ] as const) literal(value, expected, label);
  const teleport = record(item.teleport, 'ability resource teleport rules');
  exactKeys(teleport, [
    'maximumRangeMillimeters', 'backwardSearchStepMillimeters',
    'maximumBackwardSearchSteps', 'cooldownTicks', 'cooldownOnFailure',
    'retainPlanarVelocityPermille', 'retainVerticalVelocityPermille',
    'requireGroundedDestination', 'resourcePolicy', 'weaponRecoveryTicks',
    'combatStatePolicy',
  ], 'ability resource teleport rules');
  for (const [value, expected, label] of [
    [teleport.maximumRangeMillimeters, 9_000, 'teleport range'],
    [teleport.backwardSearchStepMillimeters, 100, 'teleport search step'],
    [teleport.maximumBackwardSearchSteps, 90, 'teleport search steps'],
    [teleport.cooldownTicks, 160, 'teleport cooldown'],
    [teleport.cooldownOnFailure, false, 'teleport failure cooldown'],
    [teleport.retainPlanarVelocityPermille, 1_000, 'teleport planar retention'],
    [teleport.retainVerticalVelocityPermille, 0, 'teleport vertical retention'],
    [teleport.requireGroundedDestination, false, 'teleport ground requirement'],
    [teleport.resourcePolicy, 'movement_profile_cooldown_only', 'teleport resource policy'],
    [teleport.weaponRecoveryTicks, 0, 'teleport weapon recovery'],
    [teleport.combatStatePolicy, 'preserve_existing_combat_state', 'teleport combat state'],
  ] as const) literal(value, expected, label);
}

function validateImpulseGrenadeState(
  value: unknown,
  authorityTick: number,
): ImpulseGrenadeAbilityState {
  const state = record(value, 'impulse grenade resource state');
  exactKeys(state, [
    'schemaVersion', 'playerId', 'abilityId', 'phase', 'readyAtTick',
    'cooldownEndsAtTick', 'currentCharges', 'maximumCharges',
    'acceptedThrowCount', 'eventNamespace',
    'lastProcessedAuthorityTick', 'lastProcessedAuthorityInputSequence',
  ], 'impulse grenade resource state');
  literal(state.schemaVersion, 1, 'impulse grenade resource schema');
  literal(state.abilityId, IMPULSE_GRENADE_ABILITY_ID, 'impulse grenade resource ability');
  const phase = state.phase;
  if (!['equipping', 'ready', 'cooldown', 'dead'].includes(phase as string)) {
    throw new RangeError('impulse grenade resource phase is unsupported');
  }
  stableId(state.playerId, 'impulse grenade resource player id');
  stableId(state.eventNamespace, 'impulse grenade resource namespace');
  integer(state.readyAtTick, 0, MAX_AUTHORITY_TICK, 'impulse grenade ready tick');
  integer(state.cooldownEndsAtTick, 0, MAX_AUTHORITY_TICK, 'impulse grenade cooldown tick');
  const currentCharges = integer(
    state.currentCharges,
    0,
    2,
    'impulse grenade current charges',
  );
  const maximumCharges = integer(
    state.maximumCharges,
    2,
    2,
    'impulse grenade maximum charges',
  );
  if (currentCharges > maximumCharges) {
    throw new RangeError('impulse grenade current charges exceed maximum charges');
  }
  integer(state.acceptedThrowCount, 0, 1_000_000, 'impulse grenade throw count');
  const lastTick = integer(
    state.lastProcessedAuthorityTick,
    0,
    MAX_AUTHORITY_TICK,
    'impulse grenade processed tick',
  );
  if (lastTick > authorityTick) throw new RangeError('impulse grenade state is from the future');
  integer(
    state.lastProcessedAuthorityInputSequence,
    -1,
    MAX_AUTHORITY_TICK,
    'impulse grenade processed input',
  );
  return value as ImpulseGrenadeAbilityState;
}

export function deriveAuthorityAbilityResources(
  request: DeriveAuthorityAbilityResourcesRequestV1,
  rules: AbilityResourceIntegrationRulesV1 = G4_ABILITY_RESOURCE_INTEGRATION_RULES,
): AuthorityAbilityResourceSnapshotV1 {
  assertAbilityResourceIntegrationRules(rules);
  const item = record(request, 'authority ability resource request');
  exactKeys(item, [
    'schemaVersion', 'authorityTick', 'lifePhase', 'movement', 'autoRifle',
    'impulseGrenade', 'activeImpulseGrenadeCount',
  ], 'authority ability resource request');
  literal(item.schemaVersion, 1, 'authority ability resource request schema');
  const authorityTick = integer(item.authorityTick, 0, MAX_AUTHORITY_TICK, 'authority tick');
  const lifePhase = item.lifePhase;
  if (lifePhase !== 'alive' && lifePhase !== 'dead') {
    throw new RangeError('ability resource life phase is unsupported');
  }
  const movement = record(item.movement, 'ability resource movement state');
  exactKeys(movement, [
    'schemaVersion', 'authorityTick', 'movementProfileId', 'movementProfileRevision',
    'movementProfileHash', 'selectedSlot', 'sprintHeld', 'locomotion',
    'teleportCooldownTicksRemaining',
  ], 'ability resource movement state');
  literal(movement.schemaVersion, 1, 'ability resource movement schema');
  const movementTick = integer(movement.authorityTick, 0, authorityTick, 'movement authority tick');
  if (movementTick > authorityTick) throw new RangeError('movement state is from the future');
  literal(movement.movementProfileId, rules.movementProfileId, 'movement profile id');
  literal(movement.movementProfileRevision, rules.movementProfileRevision, 'movement profile revision');
  literal(movement.movementProfileHash, rules.movementProfileHash, 'movement profile hash');
  const selectedSlot = integer(movement.selectedSlot, 0, 7, 'selected weapon slot');
  const sprintHeld = bool(movement.sprintHeld, 'sprint held');
  const locomotion = movement.locomotion;
  if (locomotion !== 'grounded' && locomotion !== 'airborne' && locomotion !== 'sliding') {
    throw new RangeError('ability resource locomotion is unsupported');
  }
  const teleportCooldownTicksRemaining = integer(
    movement.teleportCooldownTicksRemaining,
    0,
    rules.teleport.cooldownTicks,
    'teleport cooldown remaining',
  );
  const autoRifle = item.autoRifle as AutoRifleState;
  assertAutoRifleState(autoRifle, G4_AUTO_RIFLE_RULES);
  if (autoRifle.lastProcessedAuthorityTick > authorityTick) {
    throw new RangeError('auto rifle state is from the future');
  }
  const impulseGrenade = validateImpulseGrenadeState(item.impulseGrenade, authorityTick);
  if (autoRifle.playerId !== impulseGrenade.playerId) {
    throw new RangeError('ability resource player states disagree');
  }
  const activeImpulseGrenadeCount = integer(
    item.activeImpulseGrenadeCount,
    0,
    G4_IMPULSE_GRENADE_RULES.maximumActivePerPlayer,
    'active impulse grenade count',
  );
  const dead = lifePhase === 'dead';
  const grenadeReadyTicksRemaining = Math.max(0, impulseGrenade.readyAtTick - authorityTick);
  const grenadeCooldownTicksRemaining = Math.max(
    0,
    impulseGrenade.cooldownEndsAtTick - authorityTick,
  );
  return deepFreeze({
    schemaVersion: 1 as const,
    authorityTick,
    playerId: autoRifle.playerId,
    movementProfile: {
      id: rules.movementProfileId,
      revision: rules.movementProfileRevision,
      hash: rules.movementProfileHash,
    },
    loadout: {
      primaryWeaponId: rules.primaryWeaponId,
      damageAbilityIds: [rules.damageAbilityOneId, rules.damageAbilityTwoId],
      utilityAbilityId: rules.utilityAbilityId,
      ammoAbilityEnabled: rules.ammoAbilityEnabled,
    },
    equipped: {
      selectedWeaponSlot: selectedSlot,
      primaryWeaponEquipped: selectedSlot === rules.primaryWeaponSlotIndex,
    },
    primaryWeapon: {
      phase: dead ? 'dead' : autoRifle.phase,
      magazineRounds: autoRifle.magazineRounds,
      reserveRounds: autoRifle.reserveRounds,
      nextShotAtTick: autoRifle.nextShotAtTick,
      reloadCompletesAtTick: autoRifle.activeReload?.completesAtTick ?? null,
    },
    damageAbilityOne: {
      abilityId: rules.damageAbilityOneId,
      phase: dead ? 'dead' : impulseGrenade.phase,
      readyTicksRemaining: grenadeReadyTicksRemaining,
      cooldownTicksRemaining: grenadeCooldownTicksRemaining,
      currentCharges: impulseGrenade.currentCharges,
      maximumCharges: impulseGrenade.maximumCharges,
      activeProjectileCount: activeImpulseGrenadeCount,
      maximumActiveProjectileCount: G4_IMPULSE_GRENADE_RULES.maximumActivePerPlayer,
      resourcePolicy: 'two_charges_sequential_recharge' as const,
    },
    damageAbilityTwo: {
      abilityId: rules.damageAbilityTwoId,
      status: 'contract_only_unavailable' as const,
    },
    utilityAbility: {
      abilityId: rules.utilityAbilityId,
      phase: dead
        ? 'dead' as const
        : teleportCooldownTicksRemaining > 0 ? 'cooldown' as const : 'ready' as const,
      cooldownTicksRemaining: teleportCooldownTicksRemaining,
      maximumRangeMillimeters: rules.teleport.maximumRangeMillimeters,
      resourcePolicy: rules.teleport.resourcePolicy,
      destinationAuthority: 'movement_query_port' as const,
      weaponRecoveryTicks: rules.teleport.weaponRecoveryTicks,
    },
    locks: {
      dead,
      sprinting: sprintHeld,
      sliding: locomotion === 'sliding',
    },
  });
}

export function createAuthorityTeleportResourceEvents(
  request: CreateAuthorityTeleportResourceEventsRequestV1,
  rules: AbilityResourceIntegrationRulesV1 = G4_ABILITY_RESOURCE_INTEGRATION_RULES,
): readonly AuthorityTeleportResourceEvent[] {
  assertAbilityResourceIntegrationRules(rules);
  const item = record(request, 'authority teleport resource event request');
  exactKeys(item, [
    'schemaVersion', 'authorityTick', 'playerId', 'teleportOutcomes', 'resources',
  ], 'authority teleport resource event request');
  literal(item.schemaVersion, 1, 'authority teleport resource event schema');
  const authorityTick = integer(item.authorityTick, 0, MAX_AUTHORITY_TICK, 'authority tick');
  const playerId = stableId(item.playerId, 'teleport resource player id');
  const resources = item.resources as AuthorityAbilityResourceSnapshotV1;
  if (
    resources.schemaVersion !== 1
    || resources.authorityTick !== authorityTick
    || resources.playerId !== playerId
  ) {
    throw new RangeError('teleport resource snapshot identity does not match its request');
  }
  if (!Array.isArray(item.teleportOutcomes) || item.teleportOutcomes.length > 1) {
    throw new RangeError('a player may have at most one teleport outcome per authority tick');
  }
  return deepFreeze((item.teleportOutcomes as readonly AuthorityTeleportMovementOutcomeV1[])
    .map((outcome, index): AuthorityTeleportResourceEvent => {
      const result = record(outcome, 'teleport movement outcome');
      if (result.kind === 'teleport_succeeded') {
        exactKeys(result, [
          'kind', 'tick', 'entityId', 'outcome', 'from', 'to',
        ], 'teleport success outcome');
        literal(result.tick, authorityTick, 'teleport success tick');
        literal(result.entityId, playerId, 'teleport success player');
        if (result.outcome !== 'full' && result.outcome !== 'partial') {
          throw new RangeError('teleport success outcome is unsupported');
        }
        if (resources.utilityAbility.cooldownTicksRemaining !== rules.teleport.cooldownTicks) {
          throw new RangeError('successful teleport must atomically own the full movement cooldown');
        }
        return {
          kind: 'teleport_resource_confirmed',
          eventId: `ability_resource.${playerId}.${authorityTick}.teleport.${index}`,
          authorityTick,
          playerId,
          abilityId: rules.utilityAbilityId,
          outcome: result.outcome,
          from: vector(result.from, 'teleport success origin'),
          to: vector(result.to, 'teleport success destination'),
          cooldownTicksRemaining: rules.teleport.cooldownTicks,
          weaponRecoveryTicks: rules.teleport.weaponRecoveryTicks,
          combatStatePolicy: rules.teleport.combatStatePolicy,
        };
      }
      if (result.kind !== 'teleport_rejected') {
        throw new RangeError('teleport movement outcome kind is unsupported');
      }
      exactKeys(result, ['kind', 'tick', 'entityId', 'reason'], 'teleport rejection outcome');
      literal(result.tick, authorityTick, 'teleport rejection tick');
      literal(result.entityId, playerId, 'teleport rejection player');
      const reason = result.reason as Extract<
        AuthorityTeleportMovementOutcomeV1,
        { readonly kind: 'teleport_rejected' }
      >['reason'];
      if (!['cooldown', 'blocked', 'forbidden_volume', 'kill_volume', 'no_ground'].includes(reason as string)) {
        throw new RangeError('teleport rejection reason is unsupported');
      }
      if (reason === 'cooldown' && resources.utilityAbility.cooldownTicksRemaining === 0) {
        throw new RangeError('cooldown rejection requires a remaining movement cooldown');
      }
      if (reason !== 'cooldown' && resources.utilityAbility.cooldownTicksRemaining !== 0) {
        throw new RangeError('failed teleport cannot consume cooldown in the accepted movement profile');
      }
      return {
        kind: 'teleport_resource_rejected',
        eventId: `ability_resource.${playerId}.${authorityTick}.teleport.${index}`,
        authorityTick,
        playerId,
        abilityId: rules.utilityAbilityId,
        reason,
        cooldownTicksRemaining: resources.utilityAbility.cooldownTicksRemaining,
        cooldownConsumedByFailure: false,
      };
    }));
}
