import type {
  CombatVector3Millimeters,
  TargetPoseHistoryV1,
} from './poseHistory';
import { assertTargetPoseHistory } from './poseHistory';
import type {
  AuthorityWorldOcclusionPort,
  AuthoritativeWeaponHitscanProfileV1,
  CurrentAcceptedLookV1,
  CurrentShooterPoseV1,
  ObservedRttSampleV1,
  ResolveAuthoritativeHitscanResult,
} from './rewindHitscan';
import {
  resolveAuthoritativeWeaponHitscan,
  validateWorldOcclusionResult,
} from './rewindHitscan';

const MAX_AUTHORITY_TICK = Number.MAX_SAFE_INTEGER - 100_000;
const MAX_STABLE_ID_BYTES = 96;
const UINT32_MAX = 0xffff_ffff;

export const KYX_ARMORY_CATALOG_ID = 'kyx_authoritative_armory_v1' as const;
export const KYX_ARMORY_SCHEMA_VERSION = 1 as const;

export const KYX_WEAPON_ID = Object.freeze({
  autoRifle: 'vertical_rifle_v1',
  pistol: 'kyx_sidearm_v1',
  shotgun: 'kyx_scattergun_v1',
  sniper: 'kyx_longshot_v1',
  rocket: 'kyx_breach_rocket_v1',
  melee: 'kyx_edge_v1',
} as const);

export type KyxWeaponId = typeof KYX_WEAPON_ID[keyof typeof KYX_WEAPON_ID];
export type KyxWeaponFamily =
  | 'rifle'
  | 'pistol'
  | 'shotgun'
  | 'sniper'
  | 'rocket'
  | 'melee';
export type KyxWeaponAttackModel =
  | 'hitscan'
  | 'pellet_hitscan'
  | 'projectile'
  | 'melee_contact';
export type KyxWeaponTriggerPolicy = 'held' | 'press';

export interface KyxWeaponMuzzlePolicyV1 {
  readonly origin: 'authority_pose_muzzle';
  readonly convergence: 'authority_eye_aim_point';
  readonly barrelObstruction: 'eye_to_muzzle_fail_closed';
  readonly clientTransformClaimsAccepted: false;
}

export interface KyxWeaponProfileV1 {
  readonly schemaVersion: 1;
  readonly catalogId: typeof KYX_ARMORY_CATALOG_ID;
  readonly weaponId: KyxWeaponId;
  readonly slot: 0 | 1 | 2 | 3 | 4 | 5;
  readonly family: KyxWeaponFamily;
  readonly attackModel: KyxWeaponAttackModel;
  readonly triggerPolicy: KyxWeaponTriggerPolicy;
  readonly authorityHz: 20;
  readonly referenceDamagePoints: number;
  readonly rangeMillimeters: number;
  readonly magazineCapacity: number | null;
  readonly reserveCapacity: number | null;
  readonly shotCooldownTicks: number;
  readonly reloadDurationTicks: number;
  readonly equipDurationTicks: number;
  readonly pelletsPerAttack: number;
  readonly spreadMilliDegrees: number;
  readonly headMultiplierPermille: number;
  readonly torsoMultiplierPermille: 1_000;
  readonly limbMultiplierPermille: number;
  readonly projectileSpeedMillimetersPerSecond: number | null;
  readonly projectileRadiusMillimeters: number | null;
  readonly splashRadiusMillimeters: number | null;
  readonly meleeArcMilliDegrees: number | null;
  readonly muzzlePolicy: KyxWeaponMuzzlePolicyV1;
}

const MUZZLE_POLICY: KyxWeaponMuzzlePolicyV1 = Object.freeze({
  origin: 'authority_pose_muzzle',
  convergence: 'authority_eye_aim_point',
  barrelObstruction: 'eye_to_muzzle_fail_closed',
  clientTransformClaimsAccepted: false,
});

function profile(
  value: Omit<KyxWeaponProfileV1, 'schemaVersion' | 'catalogId' | 'authorityHz' | 'muzzlePolicy'>,
): KyxWeaponProfileV1 {
  return Object.freeze({
    schemaVersion: KYX_ARMORY_SCHEMA_VERSION,
    catalogId: KYX_ARMORY_CATALOG_ID,
    authorityHz: 20,
    muzzlePolicy: MUZZLE_POLICY,
    ...value,
  });
}

/**
 * Original KYX identifiers and server-owned implementation values. This is a
 * runtime foundation, not a statement that art, audio, presentation, or the
 * public ruleset records for every family have passed release acceptance.
 */
export const KYX_WEAPON_PROFILES: readonly KyxWeaponProfileV1[] = Object.freeze([
  profile({
    weaponId: KYX_WEAPON_ID.autoRifle,
    slot: 0,
    family: 'rifle',
    attackModel: 'hitscan',
    triggerPolicy: 'held',
    referenceDamagePoints: 10,
    rangeMillimeters: 120_000,
    magazineCapacity: 50,
    reserveCapacity: 150,
    shotCooldownTicks: 2,
    reloadDurationTicks: 60,
    equipDurationTicks: 4,
    pelletsPerAttack: 1,
    spreadMilliDegrees: 1_146,
    headMultiplierPermille: 1_000,
    torsoMultiplierPermille: 1_000,
    limbMultiplierPermille: 1_000,
    projectileSpeedMillimetersPerSecond: null,
    projectileRadiusMillimeters: null,
    splashRadiusMillimeters: null,
    meleeArcMilliDegrees: null,
  }),
  profile({
    weaponId: KYX_WEAPON_ID.pistol,
    slot: 1,
    family: 'pistol',
    attackModel: 'hitscan',
    triggerPolicy: 'press',
    referenceDamagePoints: 18,
    rangeMillimeters: 70_000,
    magazineCapacity: 12,
    reserveCapacity: 72,
    shotCooldownTicks: 4,
    reloadDurationTicks: 30,
    equipDurationTicks: 4,
    pelletsPerAttack: 1,
    spreadMilliDegrees: 350,
    headMultiplierPermille: 1_500,
    torsoMultiplierPermille: 1_000,
    limbMultiplierPermille: 850,
    projectileSpeedMillimetersPerSecond: null,
    projectileRadiusMillimeters: null,
    splashRadiusMillimeters: null,
    meleeArcMilliDegrees: null,
  }),
  profile({
    weaponId: KYX_WEAPON_ID.shotgun,
    slot: 2,
    family: 'shotgun',
    attackModel: 'pellet_hitscan',
    triggerPolicy: 'press',
    referenceDamagePoints: 9,
    rangeMillimeters: 20_000,
    magazineCapacity: 6,
    reserveCapacity: 30,
    shotCooldownTicks: 16,
    reloadDurationTicks: 36,
    equipDurationTicks: 6,
    pelletsPerAttack: 8,
    spreadMilliDegrees: 4_500,
    headMultiplierPermille: 1_000,
    torsoMultiplierPermille: 1_000,
    limbMultiplierPermille: 900,
    projectileSpeedMillimetersPerSecond: null,
    projectileRadiusMillimeters: null,
    splashRadiusMillimeters: null,
    meleeArcMilliDegrees: null,
  }),
  profile({
    weaponId: KYX_WEAPON_ID.sniper,
    slot: 3,
    family: 'sniper',
    attackModel: 'hitscan',
    triggerPolicy: 'press',
    referenceDamagePoints: 80,
    rangeMillimeters: 160_000,
    magazineCapacity: 4,
    reserveCapacity: 20,
    shotCooldownTicks: 24,
    reloadDurationTicks: 50,
    equipDurationTicks: 8,
    pelletsPerAttack: 1,
    spreadMilliDegrees: 75,
    headMultiplierPermille: 1_500,
    torsoMultiplierPermille: 1_000,
    limbMultiplierPermille: 750,
    projectileSpeedMillimetersPerSecond: null,
    projectileRadiusMillimeters: null,
    splashRadiusMillimeters: null,
    meleeArcMilliDegrees: null,
  }),
  profile({
    weaponId: KYX_WEAPON_ID.rocket,
    slot: 4,
    family: 'rocket',
    attackModel: 'projectile',
    triggerPolicy: 'press',
    referenceDamagePoints: 90,
    rangeMillimeters: 90_000,
    magazineCapacity: 1,
    reserveCapacity: 5,
    shotCooldownTicks: 30,
    reloadDurationTicks: 50,
    equipDurationTicks: 10,
    pelletsPerAttack: 1,
    spreadMilliDegrees: 0,
    headMultiplierPermille: 1_000,
    torsoMultiplierPermille: 1_000,
    limbMultiplierPermille: 1_000,
    projectileSpeedMillimetersPerSecond: 24_000,
    projectileRadiusMillimeters: 180,
    splashRadiusMillimeters: 4_500,
    meleeArcMilliDegrees: null,
  }),
  profile({
    weaponId: KYX_WEAPON_ID.melee,
    slot: 5,
    family: 'melee',
    attackModel: 'melee_contact',
    triggerPolicy: 'press',
    referenceDamagePoints: 55,
    rangeMillimeters: 2_500,
    magazineCapacity: null,
    reserveCapacity: null,
    shotCooldownTicks: 12,
    reloadDurationTicks: 0,
    equipDurationTicks: 3,
    pelletsPerAttack: 1,
    spreadMilliDegrees: 0,
    headMultiplierPermille: 1_000,
    torsoMultiplierPermille: 1_000,
    limbMultiplierPermille: 1_000,
    projectileSpeedMillimetersPerSecond: null,
    projectileRadiusMillimeters: null,
    splashRadiusMillimeters: null,
    meleeArcMilliDegrees: 70_000,
  }),
]);

const PROFILE_BY_ID = new Map<KyxWeaponId, KyxWeaponProfileV1>(
  KYX_WEAPON_PROFILES.map((item) => [item.weaponId, item]),
);
const PROFILE_BY_SLOT = new Map<number, KyxWeaponProfileV1>(
  KYX_WEAPON_PROFILES.map((item) => [item.slot, item]),
);

function stableString(value: string, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || new TextEncoder().encode(value).length > MAX_STABLE_ID_BYTES
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(value)
  ) {
    throw new RangeError(`${label} must be a bounded stable identifier`);
  }
  return value;
}

function integer(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function uint32(value: number, label: string): number {
  return integer(value, 0, UINT32_MAX, label) >>> 0;
}

function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function xorshift32(value: number): number {
  let next = value >>> 0;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function kyxWeaponProfile(weaponId: KyxWeaponId): KyxWeaponProfileV1 {
  const found = PROFILE_BY_ID.get(weaponId);
  if (found === undefined) throw new RangeError(`unsupported KYX weapon ${weaponId}`);
  return found;
}

export function kyxWeaponProfileForSlot(slot: number): KyxWeaponProfileV1 | null {
  integer(slot, 0, 7, 'selected weapon slot');
  return PROFILE_BY_SLOT.get(slot) ?? null;
}

export function hashKyxWeaponCatalog(): string {
  const canonical = JSON.stringify(KYX_WEAPON_PROFILES);
  return fnv1a32(canonical).toString(16).padStart(8, '0');
}

export type AuthorityWeaponPhase =
  | 'holstered'
  | 'equipping'
  | 'ready'
  | 'recovering'
  | 'reloading'
  | 'empty'
  | 'dead';

export interface AuthorityWeaponStateV1 {
  readonly schemaVersion: 1;
  readonly catalogId: typeof KYX_ARMORY_CATALOG_ID;
  readonly playerId: string;
  readonly weaponId: KyxWeaponId;
  readonly phase: AuthorityWeaponPhase;
  readonly magazineRounds: number | null;
  readonly reserveRounds: number | null;
  readonly readyAtTick: number | null;
  readonly reloadCompletesAtTick: number | null;
  readonly nextAttackAtTick: number;
  readonly acceptedAttackCount: number;
  readonly ballisticsSeed: number;
  readonly eventNamespace: string;
  readonly lastProcessedAuthorityTick: number;
  readonly lastProcessedAuthorityInputSequence: number;
}

export interface AuthorityWeaponTickInputV1 {
  readonly authorityTick: number;
  readonly authorityInputSequence: number;
  readonly lifePhase: 'alive' | 'dead';
  readonly selected: boolean;
  readonly sprintHeld: boolean;
  readonly fireHeld: boolean;
  readonly firePressed: boolean;
  readonly reloadPressed: boolean;
}

export interface AuthorityWeaponBallisticsSampleV1 {
  readonly pelletIndex: number;
  readonly spreadRadiusMilliDegrees: number;
  readonly spreadPitchMilliDegrees: number;
  readonly spreadYawMilliDegrees: number;
}

export interface AuthorityWeaponAttackAcceptedEventV1 {
  readonly schemaVersion: 1;
  readonly kind: 'weapon_attack_accepted';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly weaponId: KyxWeaponId;
  readonly family: KyxWeaponFamily;
  readonly attackModel: KyxWeaponAttackModel;
  readonly attackOrdinal: number;
  readonly referenceDamagePoints: number;
  readonly magazineRoundsAfter: number | null;
  readonly reserveRoundsAfter: number | null;
  readonly nextAttackAtTick: number;
  readonly ballistics: readonly AuthorityWeaponBallisticsSampleV1[];
}

export interface AdvanceAuthorityWeaponResultV1 {
  readonly schemaVersion: 1;
  readonly state: AuthorityWeaponStateV1;
  readonly acceptedAttack: AuthorityWeaponAttackAcceptedEventV1 | null;
}

export function assertAuthorityWeaponState(state: AuthorityWeaponStateV1): void {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('authority weapon state must be an object');
  }
  const profileValue = kyxWeaponProfile(state.weaponId);
  stableString(state.playerId, 'authority weapon player id');
  stableString(state.eventNamespace, 'authority weapon event namespace');
  if (state.schemaVersion !== 1 || state.catalogId !== KYX_ARMORY_CATALOG_ID) {
    throw new RangeError('authority weapon state identity is unsupported');
  }
  if (![
    'holstered', 'equipping', 'ready', 'recovering', 'reloading', 'empty', 'dead',
  ].includes(state.phase)) {
    throw new RangeError('authority weapon phase is unsupported');
  }
  const ammoFree = profileValue.magazineCapacity === null;
  if (ammoFree) {
    if (state.magazineRounds !== null || state.reserveRounds !== null) {
      throw new RangeError('ammo-free weapon must retain null ammo counters');
    }
  } else {
    integer(state.magazineRounds as number, 0, profileValue.magazineCapacity, 'magazine rounds');
    integer(state.reserveRounds as number, 0, profileValue.reserveCapacity as number, 'reserve rounds');
  }
  if (state.readyAtTick !== null) {
    integer(state.readyAtTick, 0, MAX_AUTHORITY_TICK, 'weapon ready tick');
  }
  if (state.reloadCompletesAtTick !== null) {
    integer(state.reloadCompletesAtTick, 0, MAX_AUTHORITY_TICK, 'weapon reload completion tick');
  }
  integer(state.nextAttackAtTick, 0, MAX_AUTHORITY_TICK, 'weapon next attack tick');
  integer(state.acceptedAttackCount, 0, Number.MAX_SAFE_INTEGER, 'accepted attack count');
  uint32(state.ballisticsSeed, 'weapon ballistics seed');
  integer(
    state.lastProcessedAuthorityTick,
    -1,
    MAX_AUTHORITY_TICK,
    'weapon processed authority tick',
  );
  integer(
    state.lastProcessedAuthorityInputSequence,
    -1,
    UINT32_MAX,
    'weapon processed input sequence',
  );
}

export function createAuthorityWeaponState(options: Readonly<{
  playerId: string;
  weaponId: KyxWeaponId;
  roomSeed: string;
  authorityTick: number;
  selected?: boolean;
}>): AuthorityWeaponStateV1 {
  const playerId = stableString(options.playerId, 'authority weapon player id');
  stableString(options.roomSeed, 'authority weapon room seed');
  const profileValue = kyxWeaponProfile(options.weaponId);
  const authorityTick = integer(options.authorityTick, 0, MAX_AUTHORITY_TICK, 'authority tick');
  const selected = options.selected === true;
  const state: AuthorityWeaponStateV1 = {
    schemaVersion: 1,
    catalogId: KYX_ARMORY_CATALOG_ID,
    playerId,
    weaponId: profileValue.weaponId,
    phase: selected ? 'equipping' : 'holstered',
    magazineRounds: profileValue.magazineCapacity,
    reserveRounds: profileValue.reserveCapacity,
    readyAtTick: selected ? authorityTick + profileValue.equipDurationTicks : null,
    reloadCompletesAtTick: null,
    nextAttackAtTick: authorityTick,
    acceptedAttackCount: 0,
    ballisticsSeed: fnv1a32(`${options.roomSeed}:${playerId}:${profileValue.weaponId}`),
    eventNamespace: `combat.${playerId}.${profileValue.weaponId}`,
    lastProcessedAuthorityTick: authorityTick - 1,
    lastProcessedAuthorityInputSequence: -1,
  };
  assertAuthorityWeaponState(state);
  return deepFreeze(state);
}

function ballisticsSamples(
  state: AuthorityWeaponStateV1,
  profileValue: KyxWeaponProfileV1,
  attackOrdinal: number,
): readonly AuthorityWeaponBallisticsSampleV1[] {
  const samples: AuthorityWeaponBallisticsSampleV1[] = [];
  let seed = xorshift32(state.ballisticsSeed ^ attackOrdinal);
  for (let index = 0; index < profileValue.pelletsPerAttack; index += 1) {
    seed = xorshift32(seed ^ Math.imul(index + 1, 0x9e3779b1));
    const radiusUnit = (seed & 0xffff) / 0xffff;
    seed = xorshift32(seed);
    const angle = ((seed & 0xffff) / 0xffff) * Math.PI * 2;
    const radius = Math.round(profileValue.spreadMilliDegrees * Math.sqrt(radiusUnit));
    samples.push({
      pelletIndex: index,
      spreadRadiusMilliDegrees: radius,
      spreadPitchMilliDegrees: Math.round(Math.sin(angle) * radius),
      spreadYawMilliDegrees: Math.round(Math.cos(angle) * radius),
    });
  }
  return deepFreeze(samples);
}

function completeReload(
  state: AuthorityWeaponStateV1,
  profileValue: KyxWeaponProfileV1,
): Pick<AuthorityWeaponStateV1, 'magazineRounds' | 'reserveRounds'> {
  if (
    profileValue.magazineCapacity === null
    || profileValue.reserveCapacity === null
    || state.magazineRounds === null
    || state.reserveRounds === null
  ) {
    return { magazineRounds: null, reserveRounds: null };
  }
  const needed = profileValue.magazineCapacity - state.magazineRounds;
  const transferred = Math.min(needed, state.reserveRounds);
  return {
    magazineRounds: state.magazineRounds + transferred,
    reserveRounds: state.reserveRounds - transferred,
  };
}

export function advanceAuthorityWeapon(
  inputState: AuthorityWeaponStateV1,
  input: AuthorityWeaponTickInputV1,
): AdvanceAuthorityWeaponResultV1 {
  assertAuthorityWeaponState(inputState);
  const profileValue = kyxWeaponProfile(inputState.weaponId);
  const authorityTick = integer(input.authorityTick, 0, MAX_AUTHORITY_TICK, 'authority tick');
  const authorityInputSequence = uint32(
    input.authorityInputSequence,
    'authority input sequence',
  );
  if (
    authorityTick < inputState.lastProcessedAuthorityTick
    || (
      authorityTick === inputState.lastProcessedAuthorityTick
      && authorityInputSequence <= inputState.lastProcessedAuthorityInputSequence
    )
  ) {
    throw new RangeError('authority weapon input must advance the processed tick/sequence');
  }

  let state: AuthorityWeaponStateV1 = {
    ...inputState,
    lastProcessedAuthorityTick: authorityTick,
    lastProcessedAuthorityInputSequence: authorityInputSequence,
  };

  if (input.lifePhase === 'dead') {
    state = {
      ...state,
      phase: 'dead',
      readyAtTick: null,
      reloadCompletesAtTick: null,
    };
    return deepFreeze({ schemaVersion: 1, state, acceptedAttack: null });
  }
  if (!input.selected) {
    state = {
      ...state,
      phase: 'holstered',
      readyAtTick: null,
      reloadCompletesAtTick: null,
    };
    return deepFreeze({ schemaVersion: 1, state, acceptedAttack: null });
  }
  if (inputState.phase === 'dead' || inputState.phase === 'holstered') {
    state = {
      ...state,
      phase: 'equipping',
      readyAtTick: authorityTick + profileValue.equipDurationTicks,
      reloadCompletesAtTick: null,
    };
  }
  if (
    state.phase === 'equipping'
    && state.readyAtTick !== null
    && authorityTick >= state.readyAtTick
  ) {
    state = { ...state, phase: 'ready', readyAtTick: null };
  }
  if (state.phase === 'recovering' && authorityTick >= state.nextAttackAtTick) {
    state = { ...state, phase: 'ready' };
  }
  if (
    state.phase === 'reloading'
    && state.reloadCompletesAtTick !== null
    && authorityTick >= state.reloadCompletesAtTick
  ) {
    const ammo = completeReload(state, profileValue);
    state = {
      ...state,
      ...ammo,
      phase: ammo.magazineRounds === 0 ? 'empty' : 'ready',
      reloadCompletesAtTick: null,
    };
  }

  const canReload = (
    profileValue.magazineCapacity !== null
    && state.magazineRounds !== null
    && state.reserveRounds !== null
    && state.magazineRounds < profileValue.magazineCapacity
    && state.reserveRounds > 0
  );
  if (
    input.reloadPressed
    && canReload
    && state.phase !== 'equipping'
    && state.phase !== 'reloading'
  ) {
    state = {
      ...state,
      phase: 'reloading',
      reloadCompletesAtTick: authorityTick + profileValue.reloadDurationTicks,
    };
    return deepFreeze({ schemaVersion: 1, state, acceptedAttack: null });
  }

  const triggerActive = profileValue.triggerPolicy === 'held'
    ? input.fireHeld
    : input.firePressed;
  const hasAmmo = state.magazineRounds === null || state.magazineRounds > 0;
  const mayAttack = (
    triggerActive
    && hasAmmo
    && !input.sprintHeld
    && authorityTick >= state.nextAttackAtTick
    && (state.phase === 'ready' || state.phase === 'recovering')
  );
  if (!mayAttack) {
    if (!hasAmmo && state.phase !== 'reloading') state = { ...state, phase: 'empty' };
    return deepFreeze({ schemaVersion: 1, state, acceptedAttack: null });
  }

  const attackOrdinal = state.acceptedAttackCount + 1;
  const magazineRoundsAfter = state.magazineRounds === null
    ? null
    : state.magazineRounds - 1;
  const nextAttackAtTick = authorityTick + profileValue.shotCooldownTicks;
  const acceptedAttack: AuthorityWeaponAttackAcceptedEventV1 = {
    schemaVersion: 1,
    kind: 'weapon_attack_accepted',
    eventId: `${state.eventNamespace}.attack.${attackOrdinal}`,
    authorityTick,
    playerId: state.playerId,
    weaponId: profileValue.weaponId,
    family: profileValue.family,
    attackModel: profileValue.attackModel,
    attackOrdinal,
    referenceDamagePoints: profileValue.referenceDamagePoints,
    magazineRoundsAfter,
    reserveRoundsAfter: state.reserveRounds,
    nextAttackAtTick,
    ballistics: ballisticsSamples(state, profileValue, attackOrdinal),
  };
  state = {
    ...state,
    phase: magazineRoundsAfter === 0 ? 'empty' : 'recovering',
    magazineRounds: magazineRoundsAfter,
    nextAttackAtTick,
    acceptedAttackCount: attackOrdinal,
    ballisticsSeed: xorshift32(state.ballisticsSeed ^ attackOrdinal),
    reloadCompletesAtTick: null,
  };
  assertAuthorityWeaponState(state);
  return deepFreeze({ schemaVersion: 1, state, acceptedAttack });
}

export interface AuthorityWeaponLoadoutStateV1 {
  readonly schemaVersion: 1;
  readonly catalogId: typeof KYX_ARMORY_CATALOG_ID;
  readonly playerId: string;
  readonly selectedSlot: number;
  readonly weapons: readonly AuthorityWeaponStateV1[];
}

export function assertAuthorityWeaponLoadoutState(
  loadout: AuthorityWeaponLoadoutStateV1,
): void {
  if (loadout === null || typeof loadout !== 'object' || Array.isArray(loadout)) {
    throw new TypeError('authority weapon loadout must be an object');
  }
  if (
    loadout.schemaVersion !== 1
    || loadout.catalogId !== KYX_ARMORY_CATALOG_ID
  ) {
    throw new RangeError('authority weapon loadout identity is unsupported');
  }
  const playerId = stableString(loadout.playerId, 'authority loadout player id');
  integer(loadout.selectedSlot, 0, 7, 'selected weapon slot');
  if (
    !Array.isArray(loadout.weapons)
    || loadout.weapons.length !== KYX_WEAPON_PROFILES.length
  ) {
    throw new RangeError('authority weapon loadout catalog cardinality is unsupported');
  }
  const seenWeaponIds = new Set<KyxWeaponId>();
  for (const state of loadout.weapons) {
    assertAuthorityWeaponState(state);
    if (state.playerId !== playerId) {
      throw new RangeError('authority weapon loadout player identity is inconsistent');
    }
    if (seenWeaponIds.has(state.weaponId)) {
      throw new RangeError(`authority weapon loadout duplicates ${state.weaponId}`);
    }
    seenWeaponIds.add(state.weaponId);
  }
  for (const profileValue of KYX_WEAPON_PROFILES) {
    if (!seenWeaponIds.has(profileValue.weaponId)) {
      throw new RangeError(`authority weapon loadout is missing ${profileValue.weaponId}`);
    }
  }
}

export function createAuthorityWeaponLoadout(options: Readonly<{
  playerId: string;
  roomSeed: string;
  authorityTick: number;
  selectedSlot?: number;
}>): AuthorityWeaponLoadoutStateV1 {
  const selectedSlot = options.selectedSlot ?? 0;
  integer(selectedSlot, 0, 7, 'selected weapon slot');
  const weapons = KYX_WEAPON_PROFILES.map((profileValue) => createAuthorityWeaponState({
    playerId: options.playerId,
    weaponId: profileValue.weaponId,
    roomSeed: options.roomSeed,
    authorityTick: options.authorityTick,
    selected: profileValue.slot === selectedSlot,
  }));
  const loadout: AuthorityWeaponLoadoutStateV1 = {
    schemaVersion: 1,
    catalogId: KYX_ARMORY_CATALOG_ID,
    playerId: stableString(options.playerId, 'authority loadout player id'),
    selectedSlot,
    weapons,
  };
  assertAuthorityWeaponLoadoutState(loadout);
  return deepFreeze(loadout);
}

export function advanceAuthorityWeaponLoadout(
  inputLoadout: AuthorityWeaponLoadoutStateV1,
  input: Omit<AuthorityWeaponTickInputV1, 'selected'> & { readonly selectedSlot: number },
): Readonly<{
  schemaVersion: 1;
  loadout: AuthorityWeaponLoadoutStateV1;
  acceptedAttacks: readonly AuthorityWeaponAttackAcceptedEventV1[];
}> {
  assertAuthorityWeaponLoadoutState(inputLoadout);
  integer(input.selectedSlot, 0, 7, 'selected weapon slot');
  const acceptedAttacks: AuthorityWeaponAttackAcceptedEventV1[] = [];
  const weapons = inputLoadout.weapons.map((state) => {
    const selected = kyxWeaponProfile(state.weaponId).slot === input.selectedSlot;
    const result = advanceAuthorityWeapon(state, { ...input, selected });
    if (result.acceptedAttack !== null) acceptedAttacks.push(result.acceptedAttack);
    return result.state;
  });
  if (acceptedAttacks.length > 1) {
    throw new Error('authority weapon loadout accepted more than one attack in a single input step');
  }
  const loadout: AuthorityWeaponLoadoutStateV1 = {
    schemaVersion: 1,
    catalogId: KYX_ARMORY_CATALOG_ID,
    playerId: inputLoadout.playerId,
    selectedSlot: input.selectedSlot,
    weapons,
  };
  assertAuthorityWeaponLoadoutState(loadout);
  return deepFreeze({
    schemaVersion: 1,
    loadout,
    acceptedAttacks,
  });
}

export function kyxAuthoritativeHitscanProfile(
  profileValue: KyxWeaponProfileV1,
): AuthoritativeWeaponHitscanProfileV1 {
  if (
    (profileValue.attackModel !== 'hitscan' && profileValue.attackModel !== 'pellet_hitscan')
    || !['rifle', 'pistol', 'shotgun', 'sniper'].includes(profileValue.family)
  ) {
    throw new RangeError(`${profileValue.weaponId} is not a hitscan weapon`);
  }
  return deepFreeze({
    schemaVersion: 1,
    weaponId: profileValue.weaponId,
    family: profileValue.family as 'rifle' | 'pistol' | 'shotgun' | 'sniper',
    attackModel: profileValue.attackModel,
    referenceDamagePoints: profileValue.referenceDamagePoints,
    pelletsPerAttack: profileValue.pelletsPerAttack,
    rangeMillimeters: profileValue.rangeMillimeters,
    spreadMilliDegrees: profileValue.spreadMilliDegrees,
    headMultiplierPermille: profileValue.headMultiplierPermille,
    torsoMultiplierPermille: profileValue.torsoMultiplierPermille,
    limbMultiplierPermille: profileValue.limbMultiplierPermille,
    friendlyFireEnabled: false,
  });
}

export interface ResolveAuthorityWeaponHitscanAttackRequestV1 {
  readonly schemaVersion: 1;
  readonly currentAuthorityTick: number;
  readonly serverReceiptTick: number;
  readonly shooterPose: CurrentShooterPoseV1;
  readonly acceptedLook: CurrentAcceptedLookV1;
  readonly acceptedAttack: AuthorityWeaponAttackAcceptedEventV1;
  readonly observedRttHistory: readonly ObservedRttSampleV1[];
  readonly targetHistories: readonly TargetPoseHistoryV1[];
}

export interface AuthorityWeaponHitscanDamageTotalV1 {
  readonly targetPlayerId: string;
  readonly damagePoints: number;
  readonly pelletHits: number;
}

export interface ResolveAuthorityWeaponHitscanAttackResultV1 {
  readonly schemaVersion: 1;
  readonly weaponId: KyxWeaponId;
  readonly attackOrdinal: number;
  readonly pelletResults: readonly ResolveAuthoritativeHitscanResult[];
  readonly damageTotals: readonly AuthorityWeaponHitscanDamageTotalV1[];
}

export function resolveAuthorityWeaponHitscanAttack(
  request: ResolveAuthorityWeaponHitscanAttackRequestV1,
  worldOcclusionPort: AuthorityWorldOcclusionPort,
): ResolveAuthorityWeaponHitscanAttackResultV1 {
  const profileValue = kyxWeaponProfile(request.acceptedAttack.weaponId);
  const hitscanProfile = kyxAuthoritativeHitscanProfile(profileValue);
  if (
    request.acceptedAttack.attackModel !== hitscanProfile.attackModel
    || request.acceptedAttack.family !== hitscanProfile.family
  ) {
    throw new RangeError('accepted weapon attack does not match the authoritative hitscan profile');
  }
  const acceptedAttack = {
    ...request.acceptedAttack,
    family: hitscanProfile.family,
    attackModel: hitscanProfile.attackModel,
  };
  const pelletResults = acceptedAttack.ballistics.map((_, pelletIndex) => (
    resolveAuthoritativeWeaponHitscan({
      schemaVersion: 1,
      currentAuthorityTick: request.currentAuthorityTick,
      serverReceiptTick: request.serverReceiptTick,
      shooterPose: request.shooterPose,
      acceptedLook: request.acceptedLook,
      acceptedAttack,
      pelletIndex,
      observedRttHistory: request.observedRttHistory,
      targetHistories: request.targetHistories,
    }, hitscanProfile, worldOcclusionPort)
  ));
  const totals = new Map<string, AuthorityWeaponHitscanDamageTotalV1>();
  for (const result of pelletResults) {
    if (!result.accepted || result.outcome !== 'hit') continue;
    const previous = totals.get(result.hit.targetPlayerId);
    totals.set(result.hit.targetPlayerId, {
      targetPlayerId: result.hit.targetPlayerId,
      damagePoints: (previous?.damagePoints ?? 0) + result.hit.damagePoints,
      pelletHits: (previous?.pelletHits ?? 0) + 1,
    });
  }
  return deepFreeze({
    schemaVersion: 1,
    weaponId: profileValue.weaponId,
    attackOrdinal: request.acceptedAttack.attackOrdinal,
    pelletResults,
    damageTotals: [...totals.values()].sort((left, right) => (
      left.targetPlayerId < right.targetPlayerId ? -1 : 1
    )),
  });
}

export interface AuthorityRocketProjectileStateV1 {
  readonly schemaVersion: 1;
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly ownerTeamId: string | null;
  readonly weaponId: typeof KYX_WEAPON_ID.rocket;
  readonly spawnTick: number;
  readonly lastProcessedAuthorityTick: number;
  readonly expiresAtTick: number;
  readonly positionMillimeters: CombatVector3Millimeters;
  readonly velocityMillimetersPerSecond: CombatVector3Millimeters;
  readonly radiusMillimeters: number;
  readonly splashRadiusMillimeters: number;
  readonly referenceDamagePoints: number;
  readonly phase: 'active' | 'detonated' | 'expired';
}

export function assertAuthorityRocketProjectileState(
  state: AuthorityRocketProjectileStateV1,
): void {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('authority rocket projectile state must be an object');
  }
  if (state.schemaVersion !== 1 || state.weaponId !== KYX_WEAPON_ID.rocket) {
    throw new RangeError('authority rocket projectile identity is unsupported');
  }
  stableString(state.projectileId, 'rocket projectile id');
  stableString(state.ownerPlayerId, 'rocket owner player id');
  if (state.ownerTeamId !== null) stableString(state.ownerTeamId, 'rocket owner team id');
  integer(state.spawnTick, 0, MAX_AUTHORITY_TICK, 'rocket spawn tick');
  integer(
    state.lastProcessedAuthorityTick,
    state.spawnTick,
    MAX_AUTHORITY_TICK,
    'rocket processed tick',
  );
  integer(
    state.expiresAtTick,
    state.spawnTick + 1,
    MAX_AUTHORITY_TICK,
    'rocket expiry tick',
  );
  for (const [label, vector] of [
    ['rocket position', state.positionMillimeters],
    ['rocket velocity', state.velocityMillimetersPerSecond],
  ] as const) {
    if (vector === null || typeof vector !== 'object' || Array.isArray(vector)) {
      throw new TypeError(`${label} must be a vector`);
    }
    for (const axis of ['x', 'y', 'z'] as const) {
      integer(vector[axis], -2_000_000, 2_000_000, `${label}.${axis}`);
    }
  }
  const profileValue = kyxWeaponProfile(KYX_WEAPON_ID.rocket);
  if (
    state.radiusMillimeters !== profileValue.projectileRadiusMillimeters
    || state.splashRadiusMillimeters !== profileValue.splashRadiusMillimeters
    || state.referenceDamagePoints !== profileValue.referenceDamagePoints
  ) {
    throw new RangeError('authority rocket projectile does not match its weapon profile');
  }
  if (!['active', 'detonated', 'expired'].includes(state.phase)) {
    throw new RangeError('authority rocket projectile phase is unsupported');
  }
}

export interface AuthorityRocketSweepRequestV1 {
  readonly schemaVersion: 1;
  readonly authorityTick: number;
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly centerMillimeters: CombatVector3Millimeters;
  readonly translationMillimeters: CombatVector3Millimeters;
  readonly radiusMillimeters: number;
}

export interface AuthorityRocketSweepResultV1 {
  readonly schemaVersion: 1;
  readonly hit: boolean;
  readonly travelPermille: number;
  readonly colliderId: string | null;
}

export type AuthorityRocketSweepPort = (
  request: AuthorityRocketSweepRequestV1,
) => AuthorityRocketSweepResultV1;

export interface AuthorityRocketDetonationV1 {
  readonly schemaVersion: 1;
  readonly kind: 'weapon_projectile_detonated';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly ownerTeamId: string | null;
  readonly weaponId: typeof KYX_WEAPON_ID.rocket;
  readonly positionMillimeters: CombatVector3Millimeters;
  readonly referenceDamagePoints: number;
  readonly splashRadiusMillimeters: number;
  readonly colliderId: string | null;
  readonly reason: 'collision' | 'lifetime';
}

function normalizeYaw(value: number): number {
  return ((value + 180_000) % 360_000 + 360_000) % 360_000 - 180_000;
}

function directionFromLook(
  bodyYawMilliDegrees: number,
  look: CurrentAcceptedLookV1,
): Readonly<{ x: number; y: number; z: number }> {
  const bodyYaw = normalizeYaw(bodyYawMilliDegrees);
  const delta = normalizeYaw(look.yawMilliDegrees - bodyYaw);
  const yaw = normalizeYaw(bodyYaw + Math.max(-90_000, Math.min(90_000, delta)));
  const pitch = Math.max(-89_000, Math.min(89_000, look.pitchMilliDegrees));
  const yawRadians = yaw * Math.PI / 180_000;
  const pitchRadians = pitch * Math.PI / 180_000;
  const horizontal = Math.cos(pitchRadians);
  return {
    x: Math.sin(yawRadians) * horizontal,
    y: Math.sin(pitchRadians),
    z: Math.cos(yawRadians) * horizontal,
  };
}

function rotateOffset(
  offset: CombatVector3Millimeters,
  yawMilliDegrees: number,
): CombatVector3Millimeters {
  const radians = yawMilliDegrees * Math.PI / 180_000;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: Math.round(offset.x * cosine + offset.z * sine),
    y: offset.y,
    z: Math.round(-offset.x * sine + offset.z * cosine),
  };
}

export type CreateAuthorityRocketProjectileResultV1 =
  | Readonly<{
      schemaVersion: 1;
      accepted: true;
      reason: null;
      state: AuthorityRocketProjectileStateV1;
    }>
  | Readonly<{
      schemaVersion: 1;
      accepted: false;
      reason: 'barrel_obstructed';
      state: null;
    }>;

function authorityPoseOrigin(
  pose: CurrentShooterPoseV1,
  offset: CombatVector3Millimeters,
): CombatVector3Millimeters {
  const rotated = rotateOffset(offset, pose.bodyYawMilliDegrees);
  return {
    x: pose.positionMillimeters.x + rotated.x,
    y: pose.positionMillimeters.y + rotated.y,
    z: pose.positionMillimeters.z + rotated.z,
  };
}

function authorityMuzzleIsObstructed(
  pose: CurrentShooterPoseV1,
  worldOcclusionPort: AuthorityWorldOcclusionPort,
): boolean {
  const eye = authorityPoseOrigin(pose, pose.eyeOffsetMillimeters);
  const muzzle = authorityPoseOrigin(pose, pose.muzzleOffsetMillimeters);
  const delta = {
    x: muzzle.x - eye.x,
    y: muzzle.y - eye.y,
    z: muzzle.z - eye.z,
  };
  const distance = Math.hypot(delta.x, delta.y, delta.z);
  if (distance === 0) return false;
  const result = validateWorldOcclusionResult(
    worldOcclusionPort(deepFreeze({
      schemaVersion: 1,
      originMillimeters: eye,
      directionUnit: {
        x: delta.x / distance,
        y: delta.y / distance,
        z: delta.z / distance,
      },
      maximumDistanceMillimeters: distance,
      layer: 'authoritative_world',
      purpose: 'barrel_clearance',
    })),
    distance,
  );
  return result.hit;
}

export function createAuthorityRocketProjectile(
  request: Readonly<{
  currentAuthorityTick: number;
  shooterPose: CurrentShooterPoseV1;
  acceptedLook: CurrentAcceptedLookV1;
  acceptedAttack: AuthorityWeaponAttackAcceptedEventV1;
  }>,
  worldOcclusionPort: AuthorityWorldOcclusionPort,
): CreateAuthorityRocketProjectileResultV1 {
  const profileValue = kyxWeaponProfile(KYX_WEAPON_ID.rocket);
  const attack = request.acceptedAttack;
  if (
    attack.weaponId !== profileValue.weaponId
    || attack.attackModel !== 'projectile'
    || attack.authorityTick !== request.currentAuthorityTick
    || attack.playerId !== request.shooterPose.playerId
    || request.shooterPose.authorityTick !== request.currentAuthorityTick
    || request.shooterPose.lifePhase !== 'alive'
  ) {
    throw new RangeError('rocket spawn request does not match live authority state');
  }
  if (request.acceptedLook.acceptedAtAuthorityTick !== request.currentAuthorityTick) {
    throw new RangeError('rocket spawn look is not current');
  }
  if (typeof worldOcclusionPort !== 'function') {
    throw new TypeError('rocket muzzle clearance port must be a function');
  }
  if (authorityMuzzleIsObstructed(request.shooterPose, worldOcclusionPort)) {
    return deepFreeze({
      schemaVersion: 1,
      accepted: false,
      reason: 'barrel_obstructed',
      state: null,
    });
  }
  const speed = profileValue.projectileSpeedMillimetersPerSecond as number;
  const eyeDirection = directionFromLook(
    request.shooterPose.bodyYawMilliDegrees,
    request.acceptedLook,
  );
  const eye = authorityPoseOrigin(request.shooterPose, request.shooterPose.eyeOffsetMillimeters);
  const positionMillimeters = authorityPoseOrigin(
    request.shooterPose,
    request.shooterPose.muzzleOffsetMillimeters,
  );
  const eyeAimPoint = {
    x: eye.x + eyeDirection.x * profileValue.rangeMillimeters,
    y: eye.y + eyeDirection.y * profileValue.rangeMillimeters,
    z: eye.z + eyeDirection.z * profileValue.rangeMillimeters,
  };
  const muzzleToAimPoint = {
    x: eyeAimPoint.x - positionMillimeters.x,
    y: eyeAimPoint.y - positionMillimeters.y,
    z: eyeAimPoint.z - positionMillimeters.z,
  };
  const muzzleToAimDistance = Math.hypot(
    muzzleToAimPoint.x,
    muzzleToAimPoint.y,
    muzzleToAimPoint.z,
  );
  if (!Number.isFinite(muzzleToAimDistance) || muzzleToAimDistance <= 0) {
    throw new RangeError('rocket authority muzzle cannot converge on the eye aim point');
  }
  const direction = {
    x: muzzleToAimPoint.x / muzzleToAimDistance,
    y: muzzleToAimPoint.y / muzzleToAimDistance,
    z: muzzleToAimPoint.z / muzzleToAimDistance,
  };
  const lifetimeTicks = Math.ceil(profileValue.rangeMillimeters * 20 / speed);
  integer(
    request.currentAuthorityTick + lifetimeTicks,
    request.currentAuthorityTick + 1,
    MAX_AUTHORITY_TICK,
    'rocket expiry tick',
  );
  const state: AuthorityRocketProjectileStateV1 = {
    schemaVersion: 1,
    projectileId: `${attack.eventId}.projectile`,
    ownerPlayerId: attack.playerId,
    ownerTeamId: request.shooterPose.teamId,
    weaponId: KYX_WEAPON_ID.rocket,
    spawnTick: request.currentAuthorityTick,
    lastProcessedAuthorityTick: request.currentAuthorityTick,
    expiresAtTick: request.currentAuthorityTick + lifetimeTicks,
    positionMillimeters,
    velocityMillimetersPerSecond: {
      x: Math.round(direction.x * speed),
      y: Math.round(direction.y * speed),
      z: Math.round(direction.z * speed),
    },
    radiusMillimeters: profileValue.projectileRadiusMillimeters as number,
    splashRadiusMillimeters: profileValue.splashRadiusMillimeters as number,
    referenceDamagePoints: profileValue.referenceDamagePoints,
    phase: 'active',
  };
  assertAuthorityRocketProjectileState(state);
  return deepFreeze({
    schemaVersion: 1,
    accepted: true,
    reason: null,
    state,
  });
}

export function advanceAuthorityRocketProjectile(
  inputState: AuthorityRocketProjectileStateV1,
  authorityTick: number,
  sweepPort: AuthorityRocketSweepPort,
): Readonly<{
  schemaVersion: 1;
  state: AuthorityRocketProjectileStateV1;
  detonation: AuthorityRocketDetonationV1 | null;
}> {
  assertAuthorityRocketProjectileState(inputState);
  integer(authorityTick, inputState.lastProcessedAuthorityTick + 1, MAX_AUTHORITY_TICK, 'rocket tick');
  if (authorityTick !== inputState.lastProcessedAuthorityTick + 1) {
    throw new RangeError('rocket projectile must advance exactly one authority tick');
  }
  if (inputState.phase !== 'active') {
    throw new RangeError('only an active rocket projectile can advance');
  }
  if (typeof sweepPort !== 'function') throw new TypeError('rocket sweep port must be a function');
  const translation = {
    x: Math.trunc(inputState.velocityMillimetersPerSecond.x / 20),
    y: Math.trunc(inputState.velocityMillimetersPerSecond.y / 20),
    z: Math.trunc(inputState.velocityMillimetersPerSecond.z / 20),
  };
  const sweep = sweepPort(deepFreeze({
    schemaVersion: 1,
    authorityTick,
    projectileId: inputState.projectileId,
    ownerPlayerId: inputState.ownerPlayerId,
    centerMillimeters: inputState.positionMillimeters,
    translationMillimeters: translation,
    radiusMillimeters: inputState.radiusMillimeters,
  }));
  if (
    sweep.schemaVersion !== 1
    || typeof sweep.hit !== 'boolean'
    || !Number.isInteger(sweep.travelPermille)
    || sweep.travelPermille < 0
    || sweep.travelPermille > 1_000
    || (!sweep.hit && sweep.travelPermille !== 1_000)
    || (sweep.hit ? sweep.colliderId === null : sweep.colliderId !== null)
  ) {
    throw new RangeError('rocket sweep adapter returned an invalid result');
  }
  if (sweep.colliderId !== null) stableString(sweep.colliderId, 'rocket collider id');
  const positionMillimeters = {
    x: inputState.positionMillimeters.x + Math.trunc(translation.x * sweep.travelPermille / 1_000),
    y: inputState.positionMillimeters.y + Math.trunc(translation.y * sweep.travelPermille / 1_000),
    z: inputState.positionMillimeters.z + Math.trunc(translation.z * sweep.travelPermille / 1_000),
  };
  const expired = authorityTick >= inputState.expiresAtTick;
  if (!sweep.hit && !expired) {
    const state: AuthorityRocketProjectileStateV1 = {
      ...inputState,
      lastProcessedAuthorityTick: authorityTick,
      positionMillimeters,
    };
    assertAuthorityRocketProjectileState(state);
    return deepFreeze({
      schemaVersion: 1,
      state,
      detonation: null,
    });
  }
  const reason = sweep.hit ? 'collision' : 'lifetime';
  const state: AuthorityRocketProjectileStateV1 = {
    ...inputState,
    lastProcessedAuthorityTick: authorityTick,
    positionMillimeters,
    phase: sweep.hit ? 'detonated' : 'expired',
  };
  const detonation: AuthorityRocketDetonationV1 = {
    schemaVersion: 1,
    kind: 'weapon_projectile_detonated',
    eventId: `${inputState.projectileId}.${reason}.${authorityTick}`,
    authorityTick,
    projectileId: inputState.projectileId,
    ownerPlayerId: inputState.ownerPlayerId,
    ownerTeamId: inputState.ownerTeamId,
    weaponId: KYX_WEAPON_ID.rocket,
    positionMillimeters,
    referenceDamagePoints: inputState.referenceDamagePoints,
    splashRadiusMillimeters: inputState.splashRadiusMillimeters,
    colliderId: sweep.colliderId,
    reason,
  };
  assertAuthorityRocketProjectileState(state);
  return deepFreeze({ schemaVersion: 1, state, detonation });
}

export interface ResolveAuthorityMeleeContactRequestV1 {
  readonly schemaVersion: 1;
  readonly currentAuthorityTick: number;
  readonly shooterPose: CurrentShooterPoseV1;
  readonly acceptedLook: CurrentAcceptedLookV1;
  readonly acceptedAttack: AuthorityWeaponAttackAcceptedEventV1;
  readonly targetHistories: readonly TargetPoseHistoryV1[];
}

export type ResolveAuthorityMeleeContactResultV1 =
  | Readonly<{
      schemaVersion: 1;
      accepted: true;
      outcome: 'contact';
      reason: null;
      targetPlayerId: string;
      targetTeamId: string | null;
      targetPoseTick: number;
      distanceMillimeters: number;
      damagePoints: number;
      contactPointMillimeters: CombatVector3Millimeters;
    }>
  | Readonly<{
      schemaVersion: 1;
      accepted: true;
      outcome: 'miss';
      reason: 'no_target' | 'world_occluded';
      targetPlayerId: null;
      targetTeamId: null;
      targetPoseTick: null;
      distanceMillimeters: null;
      damagePoints: 0;
      contactPointMillimeters: null;
    }>;

function targetContactPoint(
  history: TargetPoseHistoryV1,
  authorityTick: number,
): Readonly<{
  teamId: string | null;
  lifePhase: 'alive' | 'dead';
  point: CombatVector3Millimeters;
}> | null {
  const pose = history.samples.find((sample) => sample.authorityTick === authorityTick);
  if (pose === undefined) return null;
  const torso = pose.hitVolumes.find((volume) => volume.region === 'torso')
    ?? pose.hitVolumes[0];
  const offset = rotateOffset(torso.centerOffsetMillimeters, pose.bodyYawMilliDegrees);
  return {
    teamId: pose.teamId,
    lifePhase: pose.lifePhase,
    point: {
      x: pose.positionMillimeters.x + offset.x,
      y: pose.positionMillimeters.y + offset.y,
      z: pose.positionMillimeters.z + offset.z,
    },
  };
}

export interface AuthorityRocketSplashImpactV1 {
  readonly targetPlayerId: string;
  readonly targetTeamId: string | null;
  readonly distanceMillimeters: number;
  readonly damagePoints: number;
}

export interface ResolveAuthorityRocketSplashResultV1 {
  readonly schemaVersion: 1;
  readonly projectileId: string;
  readonly authorityTick: number;
  readonly impacts: readonly AuthorityRocketSplashImpactV1[];
  readonly occludedTargetIds: readonly string[];
}

export function resolveAuthorityRocketSplash(
  detonation: AuthorityRocketDetonationV1,
  targetHistories: readonly TargetPoseHistoryV1[],
  worldOcclusionPort: AuthorityWorldOcclusionPort,
): ResolveAuthorityRocketSplashResultV1 {
  if (
    detonation.schemaVersion !== 1
    || detonation.weaponId !== KYX_WEAPON_ID.rocket
    || detonation.splashRadiusMillimeters !== (
      kyxWeaponProfile(KYX_WEAPON_ID.rocket).splashRadiusMillimeters
    )
  ) {
    throw new RangeError('rocket detonation does not match the authoritative profile');
  }
  if (typeof worldOcclusionPort !== 'function') {
    throw new TypeError('rocket splash world occlusion port must be a function');
  }
  const impacts: AuthorityRocketSplashImpactV1[] = [];
  const occludedTargetIds: string[] = [];
  const seen = new Set<string>();
  for (const history of targetHistories) {
    assertTargetPoseHistory(history, 'rocket splash target history');
    stableString(history.playerId, 'rocket splash target player id');
    if (seen.has(history.playerId)) throw new RangeError('duplicate rocket splash target history');
    seen.add(history.playerId);
    if (history.playerId === detonation.ownerPlayerId) continue;
    const target = targetContactPoint(history, detonation.authorityTick);
    if (target === null) throw new RangeError('rocket splash target lacks the detonation pose');
    if (
      target.lifePhase !== 'alive'
      || (
        detonation.ownerTeamId !== null
        && target.teamId === detonation.ownerTeamId
      )
    ) {
      continue;
    }
    const delta = {
      x: target.point.x - detonation.positionMillimeters.x,
      y: target.point.y - detonation.positionMillimeters.y,
      z: target.point.z - detonation.positionMillimeters.z,
    };
    const distance = Math.hypot(delta.x, delta.y, delta.z);
    if (distance > detonation.splashRadiusMillimeters) continue;
    if (distance > 0) {
      const world = validateWorldOcclusionResult(
        worldOcclusionPort(deepFreeze({
          schemaVersion: 1,
          originMillimeters: detonation.positionMillimeters,
          directionUnit: {
            x: delta.x / distance,
            y: delta.y / distance,
            z: delta.z / distance,
          },
          maximumDistanceMillimeters: distance,
          layer: 'authoritative_world',
          purpose: 'shot_path',
        })),
        distance,
      );
      if (world.hit) {
        occludedTargetIds.push(history.playerId);
        continue;
      }
    }
    const falloffPermille = Math.max(
      250,
      1_000 - Math.round(distance * 750 / detonation.splashRadiusMillimeters),
    );
    impacts.push({
      targetPlayerId: history.playerId,
      targetTeamId: target.teamId,
      distanceMillimeters: distance,
      damagePoints: Math.max(
        1,
        Math.round(detonation.referenceDamagePoints * falloffPermille / 1_000),
      ),
    });
  }
  impacts.sort((left, right) => (
    left.distanceMillimeters !== right.distanceMillimeters
      ? left.distanceMillimeters - right.distanceMillimeters
      : left.targetPlayerId < right.targetPlayerId ? -1 : 1
  ));
  occludedTargetIds.sort();
  return deepFreeze({
    schemaVersion: 1,
    projectileId: detonation.projectileId,
    authorityTick: detonation.authorityTick,
    impacts,
    occludedTargetIds,
  });
}

export function resolveAuthorityMeleeContact(
  request: ResolveAuthorityMeleeContactRequestV1,
  worldOcclusionPort: AuthorityWorldOcclusionPort,
): ResolveAuthorityMeleeContactResultV1 {
  const profileValue = kyxWeaponProfile(KYX_WEAPON_ID.melee);
  const attack = request.acceptedAttack;
  if (
    request.schemaVersion !== 1
    || request.currentAuthorityTick !== request.shooterPose.authorityTick
    || request.currentAuthorityTick !== request.acceptedLook.acceptedAtAuthorityTick
    || request.currentAuthorityTick !== attack.authorityTick
    || request.shooterPose.playerId !== attack.playerId
    || request.shooterPose.lifePhase !== 'alive'
    || attack.weaponId !== profileValue.weaponId
    || attack.attackModel !== 'melee_contact'
  ) {
    throw new RangeError('melee contact request does not match live authority state');
  }
  if (typeof worldOcclusionPort !== 'function') {
    throw new TypeError('melee world occlusion port must be a function');
  }
  const origin = authorityPoseOrigin(request.shooterPose, request.shooterPose.eyeOffsetMillimeters);
  const direction = directionFromLook(
    request.shooterPose.bodyYawMilliDegrees,
    request.acceptedLook,
  );
  const halfArcRadians = (profileValue.meleeArcMilliDegrees as number)
    * Math.PI / 360_000;
  const minimumDot = Math.cos(halfArcRadians);
  const candidates: {
    playerId: string;
    teamId: string | null;
    distance: number;
    point: CombatVector3Millimeters;
  }[] = [];
  const seen = new Set<string>();
  for (const history of request.targetHistories) {
    assertTargetPoseHistory(history, 'melee target history');
    stableString(history.playerId, 'melee target player id');
    if (seen.has(history.playerId)) throw new RangeError('duplicate melee target history');
    seen.add(history.playerId);
    if (history.playerId === request.shooterPose.playerId) continue;
    const target = targetContactPoint(history, request.currentAuthorityTick);
    if (target === null) throw new RangeError('melee target history lacks the current pose');
    if (
      target.lifePhase !== 'alive'
      || (
        request.shooterPose.teamId !== null
        && target.teamId === request.shooterPose.teamId
      )
    ) {
      continue;
    }
    const delta = {
      x: target.point.x - origin.x,
      y: target.point.y - origin.y,
      z: target.point.z - origin.z,
    };
    const distance = Math.hypot(delta.x, delta.y, delta.z);
    if (distance <= 0 || distance > profileValue.rangeMillimeters) continue;
    const dot = (
      delta.x / distance * direction.x
      + delta.y / distance * direction.y
      + delta.z / distance * direction.z
    );
    if (dot < minimumDot) continue;
    candidates.push({
      playerId: history.playerId,
      teamId: target.teamId,
      distance,
      point: target.point,
    });
  }
  candidates.sort((left, right) => (
    left.distance !== right.distance
      ? left.distance - right.distance
      : left.playerId < right.playerId ? -1 : 1
  ));
  if (candidates.length === 0) {
    return deepFreeze({
      schemaVersion: 1,
      accepted: true,
      outcome: 'miss',
      reason: 'no_target',
      targetPlayerId: null,
      targetTeamId: null,
      targetPoseTick: null,
      distanceMillimeters: null,
      damagePoints: 0,
      contactPointMillimeters: null,
    });
  }
  for (const candidate of candidates) {
    const delta = {
      x: candidate.point.x - origin.x,
      y: candidate.point.y - origin.y,
      z: candidate.point.z - origin.z,
    };
    const world = validateWorldOcclusionResult(
      worldOcclusionPort(deepFreeze({
        schemaVersion: 1,
        originMillimeters: origin,
        directionUnit: {
          x: delta.x / candidate.distance,
          y: delta.y / candidate.distance,
          z: delta.z / candidate.distance,
        },
        maximumDistanceMillimeters: candidate.distance,
        layer: 'authoritative_world',
        purpose: 'shot_path',
      })),
      candidate.distance,
    );
    if (world.hit) continue;
    return deepFreeze({
      schemaVersion: 1,
      accepted: true,
      outcome: 'contact',
      reason: null,
      targetPlayerId: candidate.playerId,
      targetTeamId: candidate.teamId,
      targetPoseTick: request.currentAuthorityTick,
      distanceMillimeters: candidate.distance,
      damagePoints: profileValue.referenceDamagePoints,
      contactPointMillimeters: candidate.point,
    });
  }
  return deepFreeze({
    schemaVersion: 1,
    accepted: true,
    outcome: 'miss',
    reason: 'world_occluded',
    targetPlayerId: null,
    targetTeamId: null,
    targetPoseTick: null,
    distanceMillimeters: null,
    damagePoints: 0,
    contactPointMillimeters: null,
  });
}
