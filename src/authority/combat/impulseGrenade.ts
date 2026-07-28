const MAX_STABLE_ID_BYTES = 96;
const MAX_SAFE_AUTHORITY_TICK = Number.MAX_SAFE_INTEGER - 100_000;
const MAX_VECTOR_COMPONENT = 20_000_000;
const Q15_SCALE = 32_767;
const PERMILLE_SCALE = 1_000;

export const IMPULSE_GRENADE_ABILITY_ID = 'vertical_impulse_grenade_v1' as const;
export const IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION = 1 as const;

export interface ImpulseGrenadeVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ImpulseGrenadeRulesV1 {
  readonly schemaVersion: 1;
  readonly abilityId: typeof IMPULSE_GRENADE_ABILITY_ID;
  readonly authorityHz: 20;
  readonly damageHealthPoints: 0;
  readonly areaRadiusMillimeters: 11_000;
  readonly projectileSpeedMillimetersPerSecond: 18_000;
  readonly projectileAccelerationMillimetersPerSecondSquared: Readonly<{
    readonly x: 0;
    readonly y: 0;
    readonly z: 0;
  }>;
  readonly readyTicks: 8;
  readonly cooldownTicks: 240;
  readonly fuseTicks: 30;
  readonly fuseStarts: 'first_qualifying_collision';
  readonly lifetimeTicks: 120;
  readonly projectileRadiusMillimeters: 150;
  readonly maximumBounces: 3;
  readonly restitutionPermille: 550;
  readonly frictionPermille: 200;
  readonly ownerImmunityTicks: 6;
  readonly ownerCollisionPolicy: 'ignored_then_normal';
  readonly radialFalloff: 'linear_to_zero';
  readonly selfImpulseMillimetersPerSecond: 9_000;
  readonly enemyImpulseMillimetersPerSecond: 7_000;
  readonly verticalImpulseCapMillimetersPerSecond: 8_000;
  readonly maximumActivePerPlayer: 2;
}

/**
 * Exact `revamped_classic` revision-3 P5.4 implementation fixture. Gravity is
 * intentionally zero because the reviewed content profile does not authorize
 * an acceleration value. The projectile still uses an explicit server-owned
 * acceleration vector so a later profile revision cannot inherit a hidden
 * engine default.
 */
export const G4_IMPULSE_GRENADE_RULES: ImpulseGrenadeRulesV1 = Object.freeze({
  schemaVersion: 1,
  abilityId: IMPULSE_GRENADE_ABILITY_ID,
  authorityHz: 20,
  damageHealthPoints: 0,
  areaRadiusMillimeters: 11_000,
  projectileSpeedMillimetersPerSecond: 18_000,
  projectileAccelerationMillimetersPerSecondSquared: Object.freeze({ x: 0, y: 0, z: 0 }),
  readyTicks: 8,
  cooldownTicks: 240,
  fuseTicks: 30,
  fuseStarts: 'first_qualifying_collision',
  lifetimeTicks: 120,
  projectileRadiusMillimeters: 150,
  maximumBounces: 3,
  restitutionPermille: 550,
  frictionPermille: 200,
  ownerImmunityTicks: 6,
  ownerCollisionPolicy: 'ignored_then_normal',
  radialFalloff: 'linear_to_zero',
  selfImpulseMillimetersPerSecond: 9_000,
  enemyImpulseMillimetersPerSecond: 7_000,
  verticalImpulseCapMillimetersPerSecond: 8_000,
  maximumActivePerPlayer: 2,
});

export type ImpulseGrenadeAbilityPhase = 'equipping' | 'ready' | 'cooldown' | 'dead';

export interface ImpulseGrenadeAbilityState {
  readonly schemaVersion: 1;
  readonly playerId: string;
  readonly abilityId: typeof IMPULSE_GRENADE_ABILITY_ID;
  readonly phase: ImpulseGrenadeAbilityPhase;
  readonly readyAtTick: number;
  readonly cooldownEndsAtTick: number;
  readonly currentCharges: number;
  readonly maximumCharges: 2;
  readonly acceptedThrowCount: number;
  readonly eventNamespace: string;
  readonly lastProcessedAuthorityTick: number;
  readonly lastProcessedAuthorityInputSequence: number;
}

export interface CreateImpulseGrenadeAbilityStateOptions {
  readonly playerId: string;
  readonly roomSeed: string;
  readonly authorityTick: number;
}

export interface ImpulseGrenadeAuthorityTickInput {
  readonly authorityTick: number;
  readonly authorityInputSequence: number;
  readonly lifePhase: 'alive' | 'dead';
  readonly abilityEquipped: boolean;
  readonly throwPressed: boolean;
  readonly activeProjectileCount: number;
}

export interface ImpulseGrenadeThrowAcceptedEvent {
  readonly kind: 'impulse_grenade_throw_accepted';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly abilityId: typeof IMPULSE_GRENADE_ABILITY_ID;
  readonly throwOrdinal: number;
  readonly projectileId: string;
  readonly cooldownEndsAtTick: number;
}

export type ImpulseGrenadeThrowRejectionReason =
  | 'dead'
  | 'not_equipped'
  | 'equipping'
  | 'cooldown'
  | 'active_projectile_limit';

export type ImpulseGrenadeAbilityTickRejectionReason =
  | 'replayed_authority_tick'
  | 'stale_authority_tick'
  | 'replayed_authority_input_sequence'
  | 'stale_authority_input_sequence';

export type AdvanceImpulseGrenadeAbilityResult =
  | {
      readonly accepted: true;
      readonly state: ImpulseGrenadeAbilityState;
      readonly throw: ImpulseGrenadeThrowAcceptedEvent | null;
      readonly throwRejection: ImpulseGrenadeThrowRejectionReason | null;
    }
  | {
      readonly accepted: false;
      readonly state: ImpulseGrenadeAbilityState;
      readonly reason: ImpulseGrenadeAbilityTickRejectionReason;
    };

export type ImpulseGrenadeCollisionLayer =
  | 'world_static'
  | 'dynamic_platform'
  | 'player_body'
  | 'door'
  | 'spawn_barrier'
  | 'deployable'
  | 'projectile'
  | 'trigger';

export const IMPULSE_GRENADE_SOLID_LAYERS = Object.freeze([
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
] as const satisfies readonly ImpulseGrenadeCollisionLayer[]);

export interface ImpulseGrenadeSweepSphereRequestV1 {
  readonly schemaVersion: 1;
  readonly authorityTick: number;
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly centerMillimeters: ImpulseGrenadeVector3;
  readonly translationMillimeters: ImpulseGrenadeVector3;
  readonly radiusMillimeters: number;
  readonly solidLayers: typeof IMPULSE_GRENADE_SOLID_LAYERS;
  readonly ignoredPlayerIds: readonly string[];
}

export interface ImpulseGrenadeSweepSphereContactV1 {
  readonly colliderId: string;
  readonly layer: ImpulseGrenadeCollisionLayer;
  readonly playerId: string | null;
  readonly timeOfImpactPermille: number;
  readonly normalQ15: ImpulseGrenadeVector3;
}

export interface ImpulseGrenadeSweepSphereResultV1 {
  readonly schemaVersion: 1;
  /** Untrusted adapter order; authority sorts and selects the earliest contact. */
  readonly contacts: readonly ImpulseGrenadeSweepSphereContactV1[];
}

export interface ImpulseGrenadeRadialOcclusionRequestV1 {
  readonly schemaVersion: 1;
  readonly authorityTick: number;
  readonly projectileId: string;
  readonly sourceMillimeters: ImpulseGrenadeVector3;
  readonly targetPlayerId: string;
  readonly targetMillimeters: ImpulseGrenadeVector3;
}

export type ImpulseGrenadeRadialOcclusionResultV1 =
  | { readonly schemaVersion: 1; readonly kind: 'clear' }
  | { readonly schemaVersion: 1; readonly kind: 'blocked'; readonly colliderId: string };

export interface ImpulseGrenadeCollisionSafeImpulseRequestV1 {
  readonly schemaVersion: 1;
  readonly authorityTick: number;
  readonly projectileId: string;
  readonly targetPlayerId: string;
  readonly targetFeetPositionMillimeters: ImpulseGrenadeVector3;
  readonly targetCapsule: Readonly<{ readonly heightMillimeters: number; readonly radiusMillimeters: number }>;
  readonly currentVelocityMillimetersPerSecond: ImpulseGrenadeVector3;
  readonly requestedImpulseMillimetersPerSecond: ImpulseGrenadeVector3;
}

export interface ImpulseGrenadeCollisionSafeImpulseResultV1 {
  readonly schemaVersion: 1;
  readonly appliedImpulseMillimetersPerSecond: ImpulseGrenadeVector3;
}

/** Engine/world seam. Every returned value is strictly checked before use. */
export interface AuthorityImpulseGrenadeWorldPort {
  readonly schemaVersion: typeof IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION;
  sweepSphere(request: ImpulseGrenadeSweepSphereRequestV1): ImpulseGrenadeSweepSphereResultV1;
  traceRadialOcclusion(
    request: ImpulseGrenadeRadialOcclusionRequestV1,
  ): ImpulseGrenadeRadialOcclusionResultV1;
  resolveCollisionSafeImpulse(
    request: ImpulseGrenadeCollisionSafeImpulseRequestV1,
  ): ImpulseGrenadeCollisionSafeImpulseResultV1;
}

export type ImpulseGrenadeProjectilePhase = 'active' | 'detonated';

export interface ImpulseGrenadeProjectileState {
  readonly schemaVersion: 1;
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly ownerTeamId: string | null;
  readonly abilityId: typeof IMPULSE_GRENADE_ABILITY_ID;
  readonly phase: ImpulseGrenadeProjectilePhase;
  readonly spawnTick: number;
  readonly lastProcessedAuthorityTick: number;
  readonly lifetimeEndsAtTick: number;
  readonly fuseStartedAtTick: number | null;
  readonly detonatesAtTick: number | null;
  readonly positionMillimeters: ImpulseGrenadeVector3;
  readonly velocityMillimetersPerSecond: ImpulseGrenadeVector3;
  readonly accelerationMillimetersPerSecondSquared: ImpulseGrenadeVector3;
  readonly positionIntegrationRemainder: ImpulseGrenadeVector3;
  readonly velocityIntegrationRemainder: ImpulseGrenadeVector3;
  readonly radiusMillimeters: number;
  readonly bounceCount: number;
  readonly settled: boolean;
  readonly seed: number;
}

export interface CreateImpulseGrenadeProjectileRequestV1 {
  readonly schemaVersion: 1;
  readonly acceptedThrow: ImpulseGrenadeThrowAcceptedEvent;
  readonly ownerTeamId: string | null;
  readonly authorityOriginMillimeters: ImpulseGrenadeVector3;
  readonly authorityLookYawMilliDegrees: number;
  readonly authorityLookPitchMilliDegrees: number;
  readonly roomSeed: string;
}

export interface ImpulseGrenadeCollisionEvent {
  readonly kind: 'impulse_grenade_collision';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly colliderId: string;
  readonly layer: ImpulseGrenadeCollisionLayer;
  readonly playerId: string | null;
  readonly timeOfImpactPermille: number;
  readonly bounceCount: number;
  readonly fuseStartedAtTick: number;
  readonly detonatesAtTick: number;
  readonly settled: boolean;
}

export interface ImpulseGrenadeDetonatedEvent {
  readonly kind: 'impulse_grenade_detonated';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly ownerTeamId: string | null;
  readonly reason: 'fuse' | 'lifetime';
  readonly positionMillimeters: ImpulseGrenadeVector3;
  readonly areaRadiusMillimeters: 11_000;
  readonly damageHealthPoints: 0;
}

export type ImpulseGrenadeProjectileEvent =
  | ImpulseGrenadeCollisionEvent
  | ImpulseGrenadeDetonatedEvent;

export type AdvanceImpulseGrenadeProjectileRejectionReason =
  | 'already_detonated'
  | 'replayed_authority_tick'
  | 'stale_authority_tick'
  | 'non_sequential_authority_tick';

export type AdvanceImpulseGrenadeProjectileResult =
  | {
      readonly accepted: true;
      readonly state: ImpulseGrenadeProjectileState;
      readonly events: readonly ImpulseGrenadeProjectileEvent[];
      readonly detonation: ImpulseGrenadeDetonatedEvent | null;
    }
  | {
      readonly accepted: false;
      readonly state: ImpulseGrenadeProjectileState;
      readonly reason: AdvanceImpulseGrenadeProjectileRejectionReason;
    };

export interface ImpulseGrenadeRadialTargetV1 {
  readonly schemaVersion: 1;
  readonly playerId: string;
  readonly teamId: string | null;
  readonly lifePhase: 'alive' | 'dead';
  readonly feetPositionMillimeters: ImpulseGrenadeVector3;
  readonly centerPositionMillimeters: ImpulseGrenadeVector3;
  readonly capsule: Readonly<{ readonly heightMillimeters: number; readonly radiusMillimeters: number }>;
  readonly currentVelocityMillimetersPerSecond: ImpulseGrenadeVector3;
}

export interface ResolveImpulseGrenadeRadialRequestV1 {
  readonly schemaVersion: 1;
  readonly detonation: ImpulseGrenadeDetonatedEvent;
  readonly targets: readonly ImpulseGrenadeRadialTargetV1[];
}

export type ImpulseGrenadeRadialOutcomeStatus =
  | 'applied'
  | 'dead'
  | 'friendly_impulse_blocked'
  | 'outside_radius'
  | 'occluded';

export interface ImpulseGrenadeImpulseAppliedEvent {
  readonly kind: 'impulse_grenade_impulse_applied';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly targetPlayerId: string;
  readonly relation: 'self' | 'enemy';
  readonly distanceMillimeters: number;
  readonly falloffPermille: number;
  readonly requestedImpulseMillimetersPerSecond: ImpulseGrenadeVector3;
  readonly appliedImpulseMillimetersPerSecond: ImpulseGrenadeVector3;
  readonly damageHealthPoints: 0;
}

export interface ImpulseGrenadeRadialOutcome {
  readonly targetPlayerId: string;
  readonly status: ImpulseGrenadeRadialOutcomeStatus;
  readonly event: ImpulseGrenadeImpulseAppliedEvent | null;
}

export interface ResolveImpulseGrenadeRadialResult {
  readonly outcomes: readonly ImpulseGrenadeRadialOutcome[];
  readonly events: readonly ImpulseGrenadeImpulseAppliedEvent[];
}

export type ImpulseGrenadeEvent =
  | ImpulseGrenadeThrowAcceptedEvent
  | ImpulseGrenadeProjectileEvent
  | ImpulseGrenadeImpulseAppliedEvent;

function exactKeys(value: object, expected: readonly string[], label: string): void {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
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

function optionalStableId(value: unknown, label: string): string | null {
  return value === null ? null : stableId(value, label);
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

function checkedTickAdd(authorityTick: number, durationTicks: number, label: string): number {
  const result = authorityTick + durationTicks;
  if (!Number.isSafeInteger(result) || result > MAX_SAFE_AUTHORITY_TICK) {
    throw new RangeError(`${label} exceeds the safe authority tick range`);
  }
  return result;
}

function vector(value: unknown, label: string): ImpulseGrenadeVector3 {
  const item = record(value, label);
  exactKeys(item, ['x', 'y', 'z'], label);
  return Object.freeze({
    x: integer(item.x, -MAX_VECTOR_COMPONENT, MAX_VECTOR_COMPONENT, `${label}.x`),
    y: integer(item.y, -MAX_VECTOR_COMPONENT, MAX_VECTOR_COMPONENT, `${label}.y`),
    z: integer(item.z, -MAX_VECTOR_COMPONENT, MAX_VECTOR_COMPONENT, `${label}.z`),
  });
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function requireLiteral(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new RangeError(`${label} must equal ${String(expected)}`);
}

function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function truncatingDivide(numerator: number, denominator: number): { quotient: number; remainder: number } {
  const quotient = Math.trunc(numerator / denominator);
  return { quotient, remainder: numerator - quotient * denominator };
}

function addVector(left: ImpulseGrenadeVector3, right: ImpulseGrenadeVector3): ImpulseGrenadeVector3 {
  return Object.freeze({ x: left.x + right.x, y: left.y + right.y, z: left.z + right.z });
}

function scaleVector(
  value: ImpulseGrenadeVector3,
  numerator: number,
  denominator: number,
): ImpulseGrenadeVector3 {
  return Object.freeze({
    x: Math.round(value.x * numerator / denominator),
    y: Math.round(value.y * numerator / denominator),
    z: Math.round(value.z * numerator / denominator),
  });
}

function squaredLength(value: ImpulseGrenadeVector3): number {
  return value.x * value.x + value.y * value.y + value.z * value.z;
}

export function assertImpulseGrenadeRules(rules: ImpulseGrenadeRulesV1): void {
  const item = record(rules, 'impulse grenade rules');
  exactKeys(item, [
    'schemaVersion', 'abilityId', 'authorityHz', 'damageHealthPoints',
    'areaRadiusMillimeters', 'projectileSpeedMillimetersPerSecond',
    'projectileAccelerationMillimetersPerSecondSquared', 'readyTicks', 'cooldownTicks',
    'fuseTicks', 'fuseStarts', 'lifetimeTicks', 'projectileRadiusMillimeters',
    'maximumBounces', 'restitutionPermille', 'frictionPermille', 'ownerImmunityTicks',
    'ownerCollisionPolicy', 'radialFalloff', 'selfImpulseMillimetersPerSecond',
    'enemyImpulseMillimetersPerSecond', 'verticalImpulseCapMillimetersPerSecond',
    'maximumActivePerPlayer',
  ], 'impulse grenade rules');
  requireLiteral(item.schemaVersion, 1, 'impulse grenade schema version');
  requireLiteral(item.abilityId, IMPULSE_GRENADE_ABILITY_ID, 'impulse grenade ability id');
  requireLiteral(item.authorityHz, 20, 'impulse grenade authority rate');
  requireLiteral(item.damageHealthPoints, 0, 'impulse grenade damage');
  requireLiteral(item.areaRadiusMillimeters, 11_000, 'impulse grenade radius');
  requireLiteral(item.projectileSpeedMillimetersPerSecond, 18_000, 'impulse grenade speed');
  const acceleration = vector(
    item.projectileAccelerationMillimetersPerSecondSquared,
    'impulse grenade acceleration',
  );
  if (acceleration.x !== 0 || acceleration.y !== 0 || acceleration.z !== 0) {
    throw new RangeError('impulse grenade acceleration must be the reviewed zero vector');
  }
  requireLiteral(item.readyTicks, 8, 'impulse grenade ready ticks');
  requireLiteral(item.cooldownTicks, 240, 'impulse grenade cooldown ticks');
  requireLiteral(item.fuseTicks, 30, 'impulse grenade fuse ticks');
  requireLiteral(item.fuseStarts, 'first_qualifying_collision', 'impulse grenade fuse policy');
  requireLiteral(item.lifetimeTicks, 120, 'impulse grenade lifetime ticks');
  requireLiteral(item.projectileRadiusMillimeters, 150, 'impulse grenade radius');
  requireLiteral(item.maximumBounces, 3, 'impulse grenade maximum bounces');
  requireLiteral(item.restitutionPermille, 550, 'impulse grenade restitution');
  requireLiteral(item.frictionPermille, 200, 'impulse grenade friction');
  requireLiteral(item.ownerImmunityTicks, 6, 'impulse grenade owner immunity');
  requireLiteral(item.ownerCollisionPolicy, 'ignored_then_normal', 'impulse grenade owner policy');
  requireLiteral(item.radialFalloff, 'linear_to_zero', 'impulse grenade falloff');
  requireLiteral(item.selfImpulseMillimetersPerSecond, 9_000, 'impulse grenade self impulse');
  requireLiteral(item.enemyImpulseMillimetersPerSecond, 7_000, 'impulse grenade enemy impulse');
  requireLiteral(item.verticalImpulseCapMillimetersPerSecond, 8_000, 'impulse grenade vertical cap');
  requireLiteral(item.maximumActivePerPlayer, 2, 'impulse grenade active limit');
}

export function createImpulseGrenadeAbilityState(
  options: CreateImpulseGrenadeAbilityStateOptions,
  rules: ImpulseGrenadeRulesV1 = G4_IMPULSE_GRENADE_RULES,
): ImpulseGrenadeAbilityState {
  assertImpulseGrenadeRules(rules);
  const item = record(options, 'impulse grenade state options');
  exactKeys(item, ['playerId', 'roomSeed', 'authorityTick'], 'impulse grenade state options');
  const playerId = stableId(item.playerId, 'impulse grenade player id');
  const roomSeed = stableId(item.roomSeed, 'impulse grenade room seed');
  const authorityTick = integer(item.authorityTick, 0, MAX_SAFE_AUTHORITY_TICK, 'authority tick');
  return deepFreeze({
    schemaVersion: 1 as const,
    playerId,
    abilityId: IMPULSE_GRENADE_ABILITY_ID,
    phase: 'equipping' as const,
    readyAtTick: checkedTickAdd(authorityTick, rules.readyTicks, 'impulse grenade ready tick'),
    cooldownEndsAtTick: authorityTick,
    currentCharges: 2,
    maximumCharges: 2 as const,
    acceptedThrowCount: 0,
    eventNamespace: `impulse_grenade.${hashSeed(`${roomSeed}:${playerId}`).toString(16)}.${playerId}`,
    lastProcessedAuthorityTick: authorityTick,
    lastProcessedAuthorityInputSequence: -1,
  });
}

export function markImpulseGrenadeAbilityDead(
  state: ImpulseGrenadeAbilityState,
  authorityTickValue: number,
): ImpulseGrenadeAbilityState {
  const authorityTick = integer(authorityTickValue, 0, MAX_SAFE_AUTHORITY_TICK, 'authority tick');
  if (authorityTick < state.lastProcessedAuthorityTick) {
    throw new RangeError('impulse grenade death tick cannot precede its state');
  }
  return deepFreeze({ ...state, phase: 'dead' as const, lastProcessedAuthorityTick: authorityTick });
}

export function resetImpulseGrenadeAbilityForRespawn(
  state: ImpulseGrenadeAbilityState,
  authorityTickValue: number,
  rules: ImpulseGrenadeRulesV1 = G4_IMPULSE_GRENADE_RULES,
): ImpulseGrenadeAbilityState {
  assertImpulseGrenadeRules(rules);
  const authorityTick = integer(authorityTickValue, 0, MAX_SAFE_AUTHORITY_TICK, 'authority tick');
  if (authorityTick < state.lastProcessedAuthorityTick) {
    throw new RangeError('impulse grenade respawn tick cannot precede its state');
  }
  return deepFreeze({
    ...state,
    phase: 'equipping' as const,
    readyAtTick: checkedTickAdd(authorityTick, rules.readyTicks, 'impulse grenade respawn ready tick'),
    lastProcessedAuthorityTick: authorityTick,
  });
}

export function advanceImpulseGrenadeAbility(
  state: ImpulseGrenadeAbilityState,
  input: ImpulseGrenadeAuthorityTickInput,
  rules: ImpulseGrenadeRulesV1 = G4_IMPULSE_GRENADE_RULES,
): AdvanceImpulseGrenadeAbilityResult {
  assertImpulseGrenadeRules(rules);
  const item = record(input, 'impulse grenade authority input');
  exactKeys(item, [
    'authorityTick', 'authorityInputSequence', 'lifePhase', 'abilityEquipped',
    'throwPressed', 'activeProjectileCount',
  ], 'impulse grenade authority input');
  const authorityTick = integer(item.authorityTick, 0, MAX_SAFE_AUTHORITY_TICK, 'authority tick');
  const inputSequence = integer(item.authorityInputSequence, 0, MAX_SAFE_AUTHORITY_TICK, 'input sequence');
  if (authorityTick === state.lastProcessedAuthorityTick) {
    return deepFreeze({ accepted: false as const, state, reason: 'replayed_authority_tick' as const });
  }
  if (authorityTick < state.lastProcessedAuthorityTick) {
    return deepFreeze({ accepted: false as const, state, reason: 'stale_authority_tick' as const });
  }
  if (inputSequence === state.lastProcessedAuthorityInputSequence) {
    return deepFreeze({ accepted: false as const, state, reason: 'replayed_authority_input_sequence' as const });
  }
  if (inputSequence < state.lastProcessedAuthorityInputSequence) {
    return deepFreeze({ accepted: false as const, state, reason: 'stale_authority_input_sequence' as const });
  }
  const lifePhase = item.lifePhase;
  if (lifePhase !== 'alive' && lifePhase !== 'dead') {
    throw new RangeError('impulse grenade life phase is unsupported');
  }
  const abilityEquipped = bool(item.abilityEquipped, 'impulse grenade equipped flag');
  const throwPressed = bool(item.throwPressed, 'impulse grenade throw flag');
  const activeProjectileCount = integer(
    item.activeProjectileCount,
    0,
    rules.maximumActivePerPlayer,
    'active impulse grenade count',
  );
  let readyAtTick = state.readyAtTick;
  if (state.phase === 'dead' && lifePhase === 'alive') {
    readyAtTick = checkedTickAdd(authorityTick, rules.readyTicks, 'impulse grenade life ready tick');
  }
  let cooldownEndsAtTick = state.cooldownEndsAtTick;
  let currentCharges = state.currentCharges;
  while (currentCharges < state.maximumCharges && authorityTick >= cooldownEndsAtTick) {
    currentCharges += 1;
    cooldownEndsAtTick = currentCharges < state.maximumCharges
      ? checkedTickAdd(cooldownEndsAtTick, rules.cooldownTicks, 'impulse grenade recharge')
      : authorityTick;
  }
  let phase: ImpulseGrenadeAbilityPhase = lifePhase === 'dead'
    ? 'dead'
    : authorityTick < readyAtTick
      ? 'equipping'
      : currentCharges <= 0
        ? 'cooldown'
        : 'ready';
  let throwRejection: ImpulseGrenadeThrowRejectionReason | null = null;
  let acceptedThrow: ImpulseGrenadeThrowAcceptedEvent | null = null;
  let acceptedThrowCount = state.acceptedThrowCount;
  if (throwPressed) {
    throwRejection = lifePhase === 'dead'
      ? 'dead'
      : !abilityEquipped
        ? 'not_equipped'
        : phase === 'equipping'
          ? 'equipping'
          : currentCharges <= 0
            ? 'cooldown'
            : activeProjectileCount >= rules.maximumActivePerPlayer
              ? 'active_projectile_limit'
              : null;
    if (throwRejection === null) {
      acceptedThrowCount += 1;
      const chargeCountBeforeThrow = currentCharges;
      currentCharges -= 1;
      if (chargeCountBeforeThrow === state.maximumCharges) {
        cooldownEndsAtTick = checkedTickAdd(
          authorityTick,
          rules.cooldownTicks,
          'impulse grenade cooldown',
        );
      }
      phase = currentCharges > 0 ? 'ready' : 'cooldown';
      const projectileId = `${state.eventNamespace}.projectile.${acceptedThrowCount}`;
      acceptedThrow = deepFreeze({
        kind: 'impulse_grenade_throw_accepted' as const,
        eventId: `${projectileId}.spawn`,
        authorityTick,
        playerId: state.playerId,
        abilityId: IMPULSE_GRENADE_ABILITY_ID,
        throwOrdinal: acceptedThrowCount,
        projectileId,
        cooldownEndsAtTick,
      });
    }
  }
  return deepFreeze({
    accepted: true as const,
    state: {
      ...state,
      phase,
      readyAtTick,
      cooldownEndsAtTick,
      currentCharges,
      acceptedThrowCount,
      lastProcessedAuthorityTick: authorityTick,
      lastProcessedAuthorityInputSequence: inputSequence,
    },
    throw: acceptedThrow,
    throwRejection,
  });
}

export function impulseGrenadeDirectionQ15FromLook(
  yawMilliDegreesValue: number,
  pitchMilliDegreesValue: number,
): ImpulseGrenadeVector3 {
  const yawMilliDegrees = integer(yawMilliDegreesValue, -180_000, 180_000, 'grenade look yaw');
  const pitchMilliDegrees = integer(pitchMilliDegreesValue, -89_000, 89_000, 'grenade look pitch');
  const yaw = yawMilliDegrees * Math.PI / 180_000;
  const pitch = pitchMilliDegrees * Math.PI / 180_000;
  const horizontal = Math.cos(pitch);
  const raw = {
    x: Math.sin(yaw) * horizontal,
    y: Math.sin(pitch),
    z: Math.cos(yaw) * horizontal,
  };
  const quantized = {
    x: Math.round(raw.x * Q15_SCALE),
    y: Math.round(raw.y * Q15_SCALE),
    z: Math.round(raw.z * Q15_SCALE),
  };
  const length = Math.hypot(quantized.x, quantized.y, quantized.z);
  return Object.freeze({
    x: Math.round(quantized.x * Q15_SCALE / length),
    y: Math.round(quantized.y * Q15_SCALE / length),
    z: Math.round(quantized.z * Q15_SCALE / length),
  });
}

export function createImpulseGrenadeProjectile(
  request: CreateImpulseGrenadeProjectileRequestV1,
  rules: ImpulseGrenadeRulesV1 = G4_IMPULSE_GRENADE_RULES,
): ImpulseGrenadeProjectileState {
  assertImpulseGrenadeRules(rules);
  const item = record(request, 'impulse grenade projectile request');
  exactKeys(item, [
    'schemaVersion', 'acceptedThrow', 'ownerTeamId', 'authorityOriginMillimeters',
    'authorityLookYawMilliDegrees', 'authorityLookPitchMilliDegrees', 'roomSeed',
  ], 'impulse grenade projectile request');
  requireLiteral(item.schemaVersion, 1, 'impulse grenade projectile request schema');
  const acceptedThrow = record(
    item.acceptedThrow,
    'accepted impulse grenade throw',
  ) as unknown as ImpulseGrenadeThrowAcceptedEvent;
  exactKeys(acceptedThrow, [
    'kind', 'eventId', 'authorityTick', 'playerId', 'abilityId', 'throwOrdinal',
    'projectileId', 'cooldownEndsAtTick',
  ], 'accepted impulse grenade throw');
  requireLiteral(acceptedThrow.kind, 'impulse_grenade_throw_accepted', 'impulse grenade throw kind');
  requireLiteral(acceptedThrow.abilityId, IMPULSE_GRENADE_ABILITY_ID, 'impulse grenade throw ability');
  const projectileId = stableId(acceptedThrow.projectileId, 'impulse grenade projectile id');
  const ownerPlayerId = stableId(acceptedThrow.playerId, 'impulse grenade owner id');
  const spawnTick = integer(acceptedThrow.authorityTick, 0, MAX_SAFE_AUTHORITY_TICK, 'grenade spawn tick');
  integer(acceptedThrow.throwOrdinal, 1, 1_000_000, 'grenade throw ordinal');
  stableId(acceptedThrow.eventId, 'grenade spawn event id');
  const ownerTeamId = optionalStableId(item.ownerTeamId, 'impulse grenade owner team id');
  const origin = vector(item.authorityOriginMillimeters, 'impulse grenade authority origin');
  const yaw = integer(item.authorityLookYawMilliDegrees, -180_000, 180_000, 'grenade look yaw');
  const pitch = integer(item.authorityLookPitchMilliDegrees, -89_000, 89_000, 'grenade look pitch');
  const roomSeed = stableId(item.roomSeed, 'impulse grenade room seed');
  const direction = impulseGrenadeDirectionQ15FromLook(yaw, pitch);
  const velocity = scaleVector(direction, rules.projectileSpeedMillimetersPerSecond, Q15_SCALE);
  return deepFreeze({
    schemaVersion: 1 as const,
    projectileId,
    ownerPlayerId,
    ownerTeamId,
    abilityId: IMPULSE_GRENADE_ABILITY_ID,
    phase: 'active' as const,
    spawnTick,
    lastProcessedAuthorityTick: spawnTick - 1,
    lifetimeEndsAtTick: checkedTickAdd(spawnTick, rules.lifetimeTicks, 'grenade lifetime'),
    fuseStartedAtTick: null,
    detonatesAtTick: null,
    positionMillimeters: origin,
    velocityMillimetersPerSecond: velocity,
    accelerationMillimetersPerSecondSquared: rules.projectileAccelerationMillimetersPerSecondSquared,
    positionIntegrationRemainder: { x: 0, y: 0, z: 0 },
    velocityIntegrationRemainder: { x: 0, y: 0, z: 0 },
    radiusMillimeters: rules.projectileRadiusMillimeters,
    bounceCount: 0,
    settled: false,
    seed: hashSeed(`${roomSeed}:${projectileId}`),
  });
}

function integrateVector(
  value: ImpulseGrenadeVector3,
  rate: ImpulseGrenadeVector3,
  remainder: ImpulseGrenadeVector3,
  denominator: number,
): { value: ImpulseGrenadeVector3; remainder: ImpulseGrenadeVector3 } {
  const axes = ['x', 'y', 'z'] as const;
  const nextValue = { x: 0, y: 0, z: 0 };
  const nextRemainder = { x: 0, y: 0, z: 0 };
  for (const axis of axes) {
    const integrated = truncatingDivide(rate[axis] + remainder[axis], denominator);
    nextValue[axis] = value[axis] + integrated.quotient;
    nextRemainder[axis] = integrated.remainder;
  }
  return { value: Object.freeze(nextValue), remainder: Object.freeze(nextRemainder) };
}

function assertNormalQ15(value: unknown, label: string): ImpulseGrenadeVector3 {
  const normal = vector(value, label);
  for (const axis of ['x', 'y', 'z'] as const) {
    if (normal[axis] < -Q15_SCALE || normal[axis] > Q15_SCALE) {
      throw new RangeError(`${label}.${axis} exceeds Q15`);
    }
  }
  const length = Math.hypot(normal.x, normal.y, normal.z);
  if (length < Q15_SCALE - 32 || length > Q15_SCALE + 32) {
    throw new RangeError(`${label} must be a normalized Q15 vector`);
  }
  return normal;
}

function validateSweepResult(
  value: ImpulseGrenadeSweepSphereResultV1,
  ignoredOwnerPlayerId: string | null,
): ImpulseGrenadeSweepSphereContactV1 | null {
  const item = record(value, 'impulse grenade sweep result');
  exactKeys(item, ['schemaVersion', 'contacts'], 'impulse grenade sweep result');
  requireLiteral(item.schemaVersion, 1, 'impulse grenade sweep schema');
  if (!Array.isArray(item.contacts) || item.contacts.length > 64) {
    throw new RangeError('impulse grenade sweep contacts must be a bounded array');
  }
  const contacts = (item.contacts as readonly unknown[]).map((value, index) => {
    const contact = record(value, `impulse grenade sweep contact ${index}`);
    exactKeys(contact, [
      'colliderId', 'layer', 'playerId', 'timeOfImpactPermille', 'normalQ15',
    ], `impulse grenade sweep contact ${index}`);
    const colliderId = stableId(contact.colliderId, 'impulse grenade collider id');
    if (!IMPULSE_GRENADE_SOLID_LAYERS.includes(contact.layer as never)) {
      throw new RangeError('impulse grenade sweep returned a non-solid layer');
    }
    const layer = contact.layer as ImpulseGrenadeCollisionLayer;
    const playerId = optionalStableId(contact.playerId, 'impulse grenade collision player id');
    if ((layer === 'player_body') !== (playerId !== null)) {
      throw new RangeError('impulse grenade player collision identity does not match its layer');
    }
    return deepFreeze({
      colliderId,
      layer,
      playerId,
      timeOfImpactPermille: integer(
        contact.timeOfImpactPermille,
        0,
        PERMILLE_SCALE,
        'impulse grenade time of impact',
      ),
      normalQ15: assertNormalQ15(contact.normalQ15, 'impulse grenade contact normal'),
    });
  }).filter((contact) => (
    ignoredOwnerPlayerId === null || contact.playerId !== ignoredOwnerPlayerId
  )).sort((left, right) => {
    if (left.timeOfImpactPermille !== right.timeOfImpactPermille) {
      return left.timeOfImpactPermille - right.timeOfImpactPermille;
    }
    if (left.colliderId !== right.colliderId) return left.colliderId < right.colliderId ? -1 : 1;
    if (left.layer !== right.layer) return left.layer < right.layer ? -1 : 1;
    const leftPlayer = left.playerId ?? '';
    const rightPlayer = right.playerId ?? '';
    return leftPlayer < rightPlayer ? -1 : leftPlayer > rightPlayer ? 1 : 0;
  });
  const duplicate = contacts.find((contact, index) => index > 0 && (
    contact.colliderId === contacts[index - 1]?.colliderId
    && contact.timeOfImpactPermille === contacts[index - 1]?.timeOfImpactPermille
  ));
  if (duplicate !== undefined) {
    throw new RangeError('impulse grenade sweep returned duplicate contacts');
  }
  return contacts[0] ?? null;
}

function bounceVelocity(
  velocity: ImpulseGrenadeVector3,
  normal: ImpulseGrenadeVector3,
  rules: ImpulseGrenadeRulesV1,
): ImpulseGrenadeVector3 {
  const dot = Math.round(
    (velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z) / Q15_SCALE,
  );
  if (dot >= 0) throw new RangeError('impulse grenade contact normal must oppose travel');
  const normalComponent = scaleVector(normal, dot, Q15_SCALE);
  const tangent = {
    x: velocity.x - normalComponent.x,
    y: velocity.y - normalComponent.y,
    z: velocity.z - normalComponent.z,
  };
  const retainedTangent = scaleVector(tangent, PERMILLE_SCALE - rules.frictionPermille, PERMILLE_SCALE);
  const reflectedNormal = scaleVector(normalComponent, -rules.restitutionPermille, PERMILLE_SCALE);
  return addVector(retainedTangent, reflectedNormal);
}

function detonate(
  state: ImpulseGrenadeProjectileState,
  authorityTick: number,
  reason: 'fuse' | 'lifetime',
  rules: ImpulseGrenadeRulesV1,
): AdvanceImpulseGrenadeProjectileResult {
  const event = deepFreeze({
    kind: 'impulse_grenade_detonated' as const,
    eventId: `${state.projectileId}.detonation`,
    authorityTick,
    projectileId: state.projectileId,
    ownerPlayerId: state.ownerPlayerId,
    ownerTeamId: state.ownerTeamId,
    reason,
    positionMillimeters: state.positionMillimeters,
    areaRadiusMillimeters: rules.areaRadiusMillimeters,
    damageHealthPoints: rules.damageHealthPoints,
  });
  return deepFreeze({
    accepted: true as const,
    state: { ...state, phase: 'detonated' as const, lastProcessedAuthorityTick: authorityTick },
    events: [event],
    detonation: event,
  });
}

export function advanceImpulseGrenadeProjectile(
  state: ImpulseGrenadeProjectileState,
  authorityTickValue: number,
  world: Pick<AuthorityImpulseGrenadeWorldPort, 'sweepSphere'>,
  rules: ImpulseGrenadeRulesV1 = G4_IMPULSE_GRENADE_RULES,
): AdvanceImpulseGrenadeProjectileResult {
  assertImpulseGrenadeRules(rules);
  const authorityTick = integer(authorityTickValue, 0, MAX_SAFE_AUTHORITY_TICK, 'authority tick');
  if (state.phase === 'detonated') {
    return deepFreeze({ accepted: false as const, state, reason: 'already_detonated' as const });
  }
  if (authorityTick === state.lastProcessedAuthorityTick) {
    return deepFreeze({ accepted: false as const, state, reason: 'replayed_authority_tick' as const });
  }
  if (authorityTick < state.lastProcessedAuthorityTick) {
    return deepFreeze({ accepted: false as const, state, reason: 'stale_authority_tick' as const });
  }
  if (authorityTick !== state.lastProcessedAuthorityTick + 1) {
    return deepFreeze({ accepted: false as const, state, reason: 'non_sequential_authority_tick' as const });
  }
  if (state.detonatesAtTick !== null && authorityTick >= state.detonatesAtTick) {
    return detonate(state, authorityTick, 'fuse', rules);
  }
  if (authorityTick >= state.lifetimeEndsAtTick) {
    return detonate(state, authorityTick, 'lifetime', rules);
  }
  const velocityIntegration = integrateVector(
    state.velocityMillimetersPerSecond,
    state.accelerationMillimetersPerSecondSquared,
    state.velocityIntegrationRemainder,
    rules.authorityHz,
  );
  if (state.settled) {
    return deepFreeze({
      accepted: true as const,
      state: {
        ...state,
        lastProcessedAuthorityTick: authorityTick,
        velocityMillimetersPerSecond: velocityIntegration.value,
        velocityIntegrationRemainder: velocityIntegration.remainder,
      },
      events: [],
      detonation: null,
    });
  }
  const translationIntegration = integrateVector(
    { x: 0, y: 0, z: 0 },
    velocityIntegration.value,
    state.positionIntegrationRemainder,
    rules.authorityHz,
  );
  const ownerImmune = authorityTick < state.spawnTick + rules.ownerImmunityTicks;
  const sweep = validateSweepResult(world.sweepSphere(deepFreeze({
    schemaVersion: 1 as const,
    authorityTick,
    projectileId: state.projectileId,
    ownerPlayerId: state.ownerPlayerId,
    centerMillimeters: state.positionMillimeters,
    translationMillimeters: translationIntegration.value,
    radiusMillimeters: state.radiusMillimeters,
    solidLayers: IMPULSE_GRENADE_SOLID_LAYERS,
    ignoredPlayerIds: ownerImmune ? [state.ownerPlayerId] : [],
  })), ownerImmune ? state.ownerPlayerId : null);
  if (sweep === null) {
    return deepFreeze({
      accepted: true as const,
      state: {
        ...state,
        lastProcessedAuthorityTick: authorityTick,
        positionMillimeters: addVector(state.positionMillimeters, translationIntegration.value),
        velocityMillimetersPerSecond: velocityIntegration.value,
        positionIntegrationRemainder: translationIntegration.remainder,
        velocityIntegrationRemainder: velocityIntegration.remainder,
      },
      events: [],
      detonation: null,
    });
  }
  const travel = scaleVector(translationIntegration.value, sweep.timeOfImpactPermille, PERMILLE_SCALE);
  const separation = scaleVector(sweep.normalQ15, 1, Q15_SCALE);
  const position = addVector(addVector(state.positionMillimeters, travel), separation);
  const fuseStartedAtTick = state.fuseStartedAtTick ?? authorityTick;
  const detonatesAtTick = state.detonatesAtTick
    ?? checkedTickAdd(fuseStartedAtTick, rules.fuseTicks, 'impulse grenade fuse');
  const willBounce = state.bounceCount < rules.maximumBounces;
  const bounceCount = state.bounceCount + (willBounce ? 1 : 0);
  const settled = !willBounce;
  const velocity = willBounce
    ? bounceVelocity(velocityIntegration.value, sweep.normalQ15, rules)
    : Object.freeze({ x: 0, y: 0, z: 0 });
  const event = deepFreeze({
    kind: 'impulse_grenade_collision' as const,
    eventId: `${state.projectileId}.collision.${authorityTick}.${bounceCount}`,
    authorityTick,
    projectileId: state.projectileId,
    ownerPlayerId: state.ownerPlayerId,
    colliderId: sweep.colliderId,
    layer: sweep.layer,
    playerId: sweep.playerId,
    timeOfImpactPermille: sweep.timeOfImpactPermille,
    bounceCount,
    fuseStartedAtTick,
    detonatesAtTick,
    settled,
  });
  return deepFreeze({
    accepted: true as const,
    state: {
      ...state,
      lastProcessedAuthorityTick: authorityTick,
      fuseStartedAtTick,
      detonatesAtTick,
      positionMillimeters: position,
      velocityMillimetersPerSecond: velocity,
      positionIntegrationRemainder: { x: 0, y: 0, z: 0 },
      velocityIntegrationRemainder: velocityIntegration.remainder,
      bounceCount,
      settled,
    },
    events: [event],
    detonation: null,
  });
}

function validateOcclusionResult(
  value: ImpulseGrenadeRadialOcclusionResultV1,
): ImpulseGrenadeRadialOcclusionResultV1 {
  const item = record(value, 'impulse grenade occlusion result');
  if (item.kind === 'clear') {
    exactKeys(item, ['schemaVersion', 'kind'], 'impulse grenade clear result');
    requireLiteral(item.schemaVersion, 1, 'impulse grenade occlusion schema');
    return Object.freeze({ schemaVersion: 1, kind: 'clear' });
  }
  if (item.kind !== 'blocked') throw new RangeError('impulse grenade occlusion kind is unsupported');
  exactKeys(item, ['schemaVersion', 'kind', 'colliderId'], 'impulse grenade blocked result');
  requireLiteral(item.schemaVersion, 1, 'impulse grenade occlusion schema');
  return Object.freeze({
    schemaVersion: 1,
    kind: 'blocked',
    colliderId: stableId(item.colliderId, 'impulse grenade occluder id'),
  });
}

function validateCollisionSafeImpulse(
  value: ImpulseGrenadeCollisionSafeImpulseResultV1,
  requested: ImpulseGrenadeVector3,
  verticalCap: number,
): ImpulseGrenadeVector3 {
  const item = record(value, 'collision-safe impulse result');
  exactKeys(item, ['schemaVersion', 'appliedImpulseMillimetersPerSecond'], 'collision-safe impulse result');
  requireLiteral(item.schemaVersion, 1, 'collision-safe impulse schema');
  const applied = vector(item.appliedImpulseMillimetersPerSecond, 'collision-safe applied impulse');
  for (const axis of ['x', 'y', 'z'] as const) {
    if (
      Math.abs(applied[axis]) > Math.abs(requested[axis])
      || (requested[axis] === 0 && applied[axis] !== 0)
      || (requested[axis] !== 0 && Math.sign(applied[axis]) !== Math.sign(requested[axis]) && applied[axis] !== 0)
    ) {
      throw new RangeError('collision-safe impulse may clamp but cannot redirect or amplify');
    }
  }
  if (Math.abs(applied.y) > verticalCap || squaredLength(applied) > squaredLength(requested)) {
    throw new RangeError('collision-safe impulse exceeds its authority cap');
  }
  return applied;
}

function assertRadialTarget(value: ImpulseGrenadeRadialTargetV1): ImpulseGrenadeRadialTargetV1 {
  const item = record(value, 'impulse grenade radial target');
  exactKeys(item, [
    'schemaVersion', 'playerId', 'teamId', 'lifePhase', 'feetPositionMillimeters',
    'centerPositionMillimeters', 'capsule', 'currentVelocityMillimetersPerSecond',
  ], 'impulse grenade radial target');
  requireLiteral(item.schemaVersion, 1, 'impulse grenade radial target schema');
  const lifePhase = item.lifePhase;
  if (lifePhase !== 'alive' && lifePhase !== 'dead') {
    throw new RangeError('impulse grenade radial target life phase is unsupported');
  }
  const capsule = record(item.capsule, 'impulse grenade target capsule');
  exactKeys(capsule, ['heightMillimeters', 'radiusMillimeters'], 'impulse grenade target capsule');
  return deepFreeze({
    schemaVersion: 1 as const,
    playerId: stableId(item.playerId, 'impulse grenade target player id'),
    teamId: optionalStableId(item.teamId, 'impulse grenade target team id'),
    lifePhase,
    feetPositionMillimeters: vector(item.feetPositionMillimeters, 'impulse grenade target feet'),
    centerPositionMillimeters: vector(item.centerPositionMillimeters, 'impulse grenade target center'),
    capsule: {
      heightMillimeters: integer(capsule.heightMillimeters, 1, 10_000, 'target capsule height'),
      radiusMillimeters: integer(capsule.radiusMillimeters, 1, 5_000, 'target capsule radius'),
    },
    currentVelocityMillimetersPerSecond: vector(
      item.currentVelocityMillimetersPerSecond,
      'impulse grenade target velocity',
    ),
  });
}

export function resolveImpulseGrenadeRadialImpulse(
  request: ResolveImpulseGrenadeRadialRequestV1,
  world: Pick<
    AuthorityImpulseGrenadeWorldPort,
    'traceRadialOcclusion' | 'resolveCollisionSafeImpulse'
  >,
  rules: ImpulseGrenadeRulesV1 = G4_IMPULSE_GRENADE_RULES,
): ResolveImpulseGrenadeRadialResult {
  assertImpulseGrenadeRules(rules);
  const item = record(request, 'impulse grenade radial request');
  exactKeys(item, ['schemaVersion', 'detonation', 'targets'], 'impulse grenade radial request');
  requireLiteral(item.schemaVersion, 1, 'impulse grenade radial request schema');
  const detonation = record(
    item.detonation,
    'impulse grenade detonation',
  ) as unknown as ImpulseGrenadeDetonatedEvent;
  exactKeys(detonation, [
    'kind', 'eventId', 'authorityTick', 'projectileId', 'ownerPlayerId', 'ownerTeamId',
    'reason', 'positionMillimeters', 'areaRadiusMillimeters', 'damageHealthPoints',
  ], 'impulse grenade detonation');
  requireLiteral(detonation.kind, 'impulse_grenade_detonated', 'impulse grenade detonation kind');
  requireLiteral(detonation.areaRadiusMillimeters, rules.areaRadiusMillimeters, 'grenade detonation radius');
  requireLiteral(detonation.damageHealthPoints, 0, 'grenade detonation damage');
  const authorityTick = integer(detonation.authorityTick, 0, MAX_SAFE_AUTHORITY_TICK, 'detonation tick');
  const projectileId = stableId(detonation.projectileId, 'detonation projectile id');
  const ownerPlayerId = stableId(detonation.ownerPlayerId, 'detonation owner id');
  const ownerTeamId = optionalStableId(detonation.ownerTeamId, 'detonation owner team id');
  const source = vector(detonation.positionMillimeters, 'detonation position');
  if (!Array.isArray(item.targets)) throw new TypeError('impulse grenade targets must be an array');
  const targets = (item.targets as readonly ImpulseGrenadeRadialTargetV1[])
    .map(assertRadialTarget)
    .sort((left, right) => left.playerId < right.playerId ? -1 : left.playerId > right.playerId ? 1 : 0);
  if (new Set(targets.map((target) => target.playerId)).size !== targets.length) {
    throw new RangeError('impulse grenade radial target ids must be unique');
  }
  const outcomes: ImpulseGrenadeRadialOutcome[] = [];
  const events: ImpulseGrenadeImpulseAppliedEvent[] = [];
  for (const target of targets) {
    const relation = target.playerId === ownerPlayerId ? 'self' as const : 'enemy' as const;
    if (target.lifePhase === 'dead') {
      outcomes.push({ targetPlayerId: target.playerId, status: 'dead', event: null });
      continue;
    }
    if (
      relation === 'enemy'
      && ownerTeamId !== null
      && target.teamId !== null
      && ownerTeamId === target.teamId
    ) {
      outcomes.push({ targetPlayerId: target.playerId, status: 'friendly_impulse_blocked', event: null });
      continue;
    }
    const delta = {
      x: target.centerPositionMillimeters.x - source.x,
      y: target.centerPositionMillimeters.y - source.y,
      z: target.centerPositionMillimeters.z - source.z,
    };
    const distance = Math.floor(Math.sqrt(squaredLength(delta)));
    if (distance >= rules.areaRadiusMillimeters) {
      outcomes.push({ targetPlayerId: target.playerId, status: 'outside_radius', event: null });
      continue;
    }
    const occlusion = validateOcclusionResult(world.traceRadialOcclusion(deepFreeze({
      schemaVersion: 1 as const,
      authorityTick,
      projectileId,
      sourceMillimeters: source,
      targetPlayerId: target.playerId,
      targetMillimeters: target.centerPositionMillimeters,
    })));
    if (occlusion.kind === 'blocked') {
      outcomes.push({ targetPlayerId: target.playerId, status: 'occluded', event: null });
      continue;
    }
    const falloffPermille = Math.floor(
      (rules.areaRadiusMillimeters - distance) * PERMILLE_SCALE / rules.areaRadiusMillimeters,
    );
    const impulseCap = relation === 'self'
      ? rules.selfImpulseMillimetersPerSecond
      : rules.enemyImpulseMillimetersPerSecond;
    const magnitude = Math.floor(impulseCap * falloffPermille / PERMILLE_SCALE);
    const direction = distance === 0
      ? { x: 0, y: Q15_SCALE, z: 0 }
      : {
          x: Math.round(delta.x * Q15_SCALE / Math.hypot(delta.x, delta.y, delta.z)),
          y: Math.round(delta.y * Q15_SCALE / Math.hypot(delta.x, delta.y, delta.z)),
          z: Math.round(delta.z * Q15_SCALE / Math.hypot(delta.x, delta.y, delta.z)),
        };
    const rawRequested = scaleVector(direction, magnitude, Q15_SCALE);
    const requested = Object.freeze({
      x: rawRequested.x,
      y: Math.max(
        -rules.verticalImpulseCapMillimetersPerSecond,
        Math.min(rules.verticalImpulseCapMillimetersPerSecond, rawRequested.y),
      ),
      z: rawRequested.z,
    });
    const applied = validateCollisionSafeImpulse(world.resolveCollisionSafeImpulse(deepFreeze({
      schemaVersion: 1 as const,
      authorityTick,
      projectileId,
      targetPlayerId: target.playerId,
      targetFeetPositionMillimeters: target.feetPositionMillimeters,
      targetCapsule: target.capsule,
      currentVelocityMillimetersPerSecond: target.currentVelocityMillimetersPerSecond,
      requestedImpulseMillimetersPerSecond: requested,
    })), requested, rules.verticalImpulseCapMillimetersPerSecond);
    const event = deepFreeze({
      kind: 'impulse_grenade_impulse_applied' as const,
      eventId: `${projectileId}.impulse.${target.playerId}`,
      authorityTick,
      projectileId,
      ownerPlayerId,
      targetPlayerId: target.playerId,
      relation,
      distanceMillimeters: distance,
      falloffPermille,
      requestedImpulseMillimetersPerSecond: requested,
      appliedImpulseMillimetersPerSecond: applied,
      damageHealthPoints: 0 as const,
    });
    events.push(event);
    outcomes.push({ targetPlayerId: target.playerId, status: 'applied', event });
  }
  return deepFreeze({ outcomes, events });
}
