import {
  ABILITY_ID,
  ABILITY_LOADOUT_SCHEMA_VERSION,
  assertAbilityLoadout,
  type AbilityLoadoutV1,
  type SelectableAbilityId,
} from '../../abilities/abilityLoadout';
import { INTENT_BUTTON } from '../../sim';
import {
  G4_IMPULSE_GRENADE_RULES,
  IMPULSE_GRENADE_SOLID_LAYERS,
  impulseGrenadeDirectionQ15FromLook,
  type AuthorityImpulseGrenadeWorldPort,
  type ImpulseGrenadeCollisionLayer,
  type ImpulseGrenadeVector3,
} from './impulseGrenade';

export const AUTHORITY_ABILITY_LOADOUT_RUNTIME_SCHEMA_VERSION = 1 as const;
const AUTHORITY_HZ = 20;
const Q15 = 32_767;
const PERMILLE = 1_000;

export interface AuthorityThrowableRulesV1 {
  readonly abilityId: SelectableAbilityId;
  readonly cooldownTicks: number;
  readonly fuseTicks: number;
  readonly lifetimeTicks: number;
  readonly speedMillimetersPerSecond: number;
  readonly upwardSpeedMillimetersPerSecond: number;
  readonly gravityMillimetersPerSecondSquared: number;
  readonly radiusMillimeters: number;
  readonly areaRadiusMillimeters: number;
  readonly damageHealthPoints: number;
  readonly maximumBounces: number;
  readonly restitutionPermille: number;
  readonly frictionPermille: number;
  readonly sticky: boolean;
  readonly fuseStartsOnCollision: boolean;
  readonly effect: 'launch' | 'damage' | 'smoke' | 'flash';
  readonly effectDurationTicks: number;
}

export const AUTHORITY_THROWABLE_RULES = Object.freeze({
  [ABILITY_ID.launch]: Object.freeze({
    abilityId: ABILITY_ID.launch,
    cooldownTicks: 240,
    fuseTicks: 0,
    lifetimeTicks: 120,
    speedMillimetersPerSecond: 18_000,
    upwardSpeedMillimetersPerSecond: 0,
    gravityMillimetersPerSecondSquared: -19_200,
    radiusMillimeters: 150,
    areaRadiusMillimeters: 11_000,
    damageHealthPoints: 0,
    maximumBounces: 0,
    restitutionPermille: 0,
    frictionPermille: 0,
    sticky: false,
    fuseStartsOnCollision: true,
    effect: 'launch',
    effectDurationTicks: 0,
  }),
  [ABILITY_ID.frag]: Object.freeze({
    abilityId: ABILITY_ID.frag,
    cooldownTicks: 160,
    fuseTicks: 50,
    lifetimeTicks: 80,
    speedMillimetersPerSecond: 16_000,
    upwardSpeedMillimetersPerSecond: 4_800,
    gravityMillimetersPerSecondSquared: -19_000,
    radiusMillimeters: 140,
    areaRadiusMillimeters: 5_000,
    damageHealthPoints: 80,
    maximumBounces: 4,
    restitutionPermille: 420,
    frictionPermille: 280,
    sticky: false,
    fuseStartsOnCollision: false,
    effect: 'damage',
    effectDurationTicks: 0,
  }),
  [ABILITY_ID.smoke]: Object.freeze({
    abilityId: ABILITY_ID.smoke,
    cooldownTicks: 200,
    fuseTicks: 25,
    lifetimeTicks: 80,
    speedMillimetersPerSecond: 15_000,
    upwardSpeedMillimetersPerSecond: 4_600,
    gravityMillimetersPerSecondSquared: -19_000,
    radiusMillimeters: 130,
    areaRadiusMillimeters: 5_880,
    damageHealthPoints: 0,
    maximumBounces: 3,
    restitutionPermille: 380,
    frictionPermille: 300,
    sticky: false,
    fuseStartsOnCollision: false,
    effect: 'smoke',
    effectDurationTicks: 200,
  }),
  [ABILITY_ID.sticky]: Object.freeze({
    abilityId: ABILITY_ID.sticky,
    cooldownTicks: 180,
    fuseTicks: 38,
    lifetimeTicks: 80,
    speedMillimetersPerSecond: 18_000,
    upwardSpeedMillimetersPerSecond: 3_600,
    gravityMillimetersPerSecondSquared: -17_000,
    radiusMillimeters: 130,
    areaRadiusMillimeters: 4_500,
    damageHealthPoints: 90,
    maximumBounces: 0,
    restitutionPermille: 0,
    frictionPermille: 1_000,
    sticky: true,
    fuseStartsOnCollision: false,
    effect: 'damage',
    effectDurationTicks: 0,
  }),
  [ABILITY_ID.flash]: Object.freeze({
    abilityId: ABILITY_ID.flash,
    cooldownTicks: 200,
    fuseTicks: 23,
    lifetimeTicks: 60,
    speedMillimetersPerSecond: 16_000,
    upwardSpeedMillimetersPerSecond: 4_200,
    gravityMillimetersPerSecondSquared: -19_000,
    radiusMillimeters: 130,
    areaRadiusMillimeters: 12_000,
    damageHealthPoints: 0,
    maximumBounces: 3,
    restitutionPermille: 440,
    frictionPermille: 280,
    sticky: false,
    fuseStartsOnCollision: false,
    effect: 'flash',
    effectDurationTicks: 45,
  }),
} satisfies Readonly<Record<SelectableAbilityId, AuthorityThrowableRulesV1>>);

export interface AuthorityAbilityLoadoutRuntimeStateV1 {
  readonly schemaVersion: typeof AUTHORITY_ABILITY_LOADOUT_RUNTIME_SCHEMA_VERSION;
  readonly playerId: string;
  readonly loadout: AbilityLoadoutV1;
  readonly cooldownEndsAtTicks: readonly [number, number, number];
  readonly currentCharges: readonly [number, number, number];
  readonly maximumCharges: readonly [number, number, number];
  readonly acceptedActivationCounts: readonly [number, number, number];
  readonly lastProcessedAuthorityTick: number;
  readonly eventNamespace: string;
}

export interface AuthorityAbilityActivationAcceptedV1 {
  readonly kind: 'ability_activation_accepted';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly slot: 1 | 2 | 3;
  readonly abilityId: SelectableAbilityId;
  readonly activationOrdinal: number;
  readonly projectileId: string;
  readonly cooldownEndsAtTick: number;
}

export interface AuthorityAbilityActivationRejectedV1 {
  readonly kind: 'ability_activation_rejected';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly slot: 1 | 2 | 3;
  readonly abilityId: SelectableAbilityId;
  readonly reason: 'dead' | 'cooldown';
  readonly cooldownEndsAtTick: number;
}

export type AuthorityAbilityActivationEventV1 =
  | AuthorityAbilityActivationAcceptedV1
  | AuthorityAbilityActivationRejectedV1;

export interface AuthorityAbilityProjectileV1 {
  readonly schemaVersion: typeof AUTHORITY_ABILITY_LOADOUT_RUNTIME_SCHEMA_VERSION;
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly ownerTeamId: string | null;
  readonly abilityId: SelectableAbilityId;
  readonly spawnTick: number;
  readonly lastProcessedAuthorityTick: number;
  readonly detonatesAtTick: number | null;
  readonly lifetimeEndsAtTick: number;
  readonly positionMillimeters: ImpulseGrenadeVector3;
  readonly velocityMillimetersPerSecond: ImpulseGrenadeVector3;
  readonly bounceCount: number;
  readonly settled: boolean;
  readonly attachedPlayerId: string | null;
}

export interface AuthoritySmokeFieldV1 {
  readonly schemaVersion: typeof AUTHORITY_ABILITY_LOADOUT_RUNTIME_SCHEMA_VERSION;
  readonly fieldId: string;
  readonly ownerPlayerId: string;
  readonly ownerTeamId: string | null;
  readonly spawnedAtTick: number;
  readonly expiresAtTick: number;
  readonly centerMillimeters: ImpulseGrenadeVector3;
  readonly radiusMillimeters: number;
}

export interface AuthorityAbilityProjectileCollisionV1 {
  readonly kind: 'ability_projectile_collision';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly abilityId: SelectableAbilityId;
  readonly colliderId: string;
  readonly layer: ImpulseGrenadeCollisionLayer;
  readonly playerId: string | null;
  readonly bounceCount: number;
  readonly settled: boolean;
  readonly attached: boolean;
  readonly incomingSpeedMillimetersPerSecond: number;
  readonly outgoingSpeedMillimetersPerSecond: number;
}

export interface AuthorityAbilityDetonatedV1 {
  readonly kind: 'ability_projectile_detonated';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly ownerTeamId: string | null;
  readonly abilityId: SelectableAbilityId;
  readonly positionMillimeters: ImpulseGrenadeVector3;
  readonly areaRadiusMillimeters: number;
  readonly damageHealthPoints: number;
  readonly effect: AuthorityThrowableRulesV1['effect'];
  readonly effectDurationTicks: number;
  readonly reason: 'fuse' | 'lifetime';
}

export type AuthorityAbilityProjectileEventV1 =
  | AuthorityAbilityProjectileCollisionV1
  | AuthorityAbilityDetonatedV1;

export interface AdvanceAuthorityAbilityLoadoutResultV1 {
  readonly state: AuthorityAbilityLoadoutRuntimeStateV1;
  readonly events: readonly AuthorityAbilityActivationEventV1[];
  readonly accepted: readonly AuthorityAbilityActivationAcceptedV1[];
}

export interface AdvanceAuthorityAbilityProjectileResultV1 {
  readonly state: AuthorityAbilityProjectileV1 | null;
  readonly events: readonly AuthorityAbilityProjectileEventV1[];
  readonly detonation: AuthorityAbilityDetonatedV1 | null;
}

export interface AuthorityAbilityEffectTargetV1 {
  readonly playerId: string;
  readonly teamId: string | null;
  readonly alive: boolean;
  readonly feetPositionMillimeters: ImpulseGrenadeVector3;
  readonly centerPositionMillimeters: ImpulseGrenadeVector3;
  readonly currentVelocityMillimetersPerSecond: ImpulseGrenadeVector3;
  readonly capsule: Readonly<{ readonly heightMillimeters: number; readonly radiusMillimeters: number }>;
}

export interface AuthorityAbilityEffectOutcomeV1 {
  readonly targetPlayerId: string;
  readonly status: 'applied' | 'dead' | 'friendly' | 'outside_radius' | 'occluded';
  readonly damageHealthPoints: number;
  readonly flashDurationTicks: number;
  readonly flashIntensityPermille: number;
  readonly impulseMillimetersPerSecond: ImpulseGrenadeVector3;
}

function stableId(value: string, label: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/u.test(value)) {
    throw new RangeError(`${label} must be a stable identifier`);
  }
  return value;
}

function tick(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${label} must be a tick`);
  return value;
}

function freeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const nested of Object.values(value)) freeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function vector(value: ImpulseGrenadeVector3): ImpulseGrenadeVector3 {
  return Object.freeze({
    x: Math.round(value.x),
    y: Math.round(value.y),
    z: Math.round(value.z),
  });
}

function hash(value: string): string {
  let result = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    result ^= byte;
    result = Math.imul(result, 0x01000193) >>> 0;
  }
  return result.toString(16).padStart(8, '0');
}

export function createAuthorityAbilityLoadoutRuntimeState(options: Readonly<{
  playerId: string;
  roomSeed: string;
  authorityTick: number;
  loadout: AbilityLoadoutV1;
}>): AuthorityAbilityLoadoutRuntimeStateV1 {
  const playerId = stableId(options.playerId, 'ability loadout player id');
  const roomSeed = stableId(options.roomSeed, 'ability loadout room seed');
  const authorityTick = tick(options.authorityTick, 'ability loadout authority tick');
  const loadout = assertAbilityLoadout(options.loadout);
  return freeze({
    schemaVersion: AUTHORITY_ABILITY_LOADOUT_RUNTIME_SCHEMA_VERSION,
    playerId,
    loadout,
    cooldownEndsAtTicks: [authorityTick, authorityTick, authorityTick] as const,
    currentCharges: [2, 2, 2] as const,
    maximumCharges: [2, 2, 2] as const,
    acceptedActivationCounts: [0, 0, 0] as const,
    lastProcessedAuthorityTick: authorityTick,
    eventNamespace: `ability_loadout.${hash(`${roomSeed}:${playerId}`)}`,
  });
}

export function setAuthorityAbilityLoadout(
  state: AuthorityAbilityLoadoutRuntimeStateV1,
  loadout: AbilityLoadoutV1,
  authorityTickValue: number,
): AuthorityAbilityLoadoutRuntimeStateV1 {
  const authorityTick = tick(authorityTickValue, 'ability loadout replacement tick');
  if (authorityTick < state.lastProcessedAuthorityTick) {
    throw new RangeError('ability loadout replacement tick is stale');
  }
  return freeze({
    ...state,
    loadout: assertAbilityLoadout(loadout),
    cooldownEndsAtTicks: [authorityTick, authorityTick, authorityTick] as const,
    currentCharges: [2, 2, 2] as const,
    maximumCharges: [2, 2, 2] as const,
    acceptedActivationCounts: [0, 0, 0] as const,
    lastProcessedAuthorityTick: authorityTick,
  });
}

export function advanceAuthorityAbilityLoadout(
  state: AuthorityAbilityLoadoutRuntimeStateV1,
  options: Readonly<{
    authorityTick: number;
    pressedButtons: number;
    alive: boolean;
  }>,
): AdvanceAuthorityAbilityLoadoutResultV1 {
  const authorityTick = tick(options.authorityTick, 'ability loadout authority tick');
  if (authorityTick < state.lastProcessedAuthorityTick) {
    throw new RangeError('ability loadout authority tick is stale');
  }
  const buttons = [INTENT_BUTTON.abilityOne, INTENT_BUTTON.abilityTwo, INTENT_BUTTON.abilityThree];
  const cooldowns = [...state.cooldownEndsAtTicks] as [number, number, number];
  const charges = [...state.currentCharges] as [number, number, number];
  const maximumCharges = [...state.maximumCharges] as [number, number, number];
  const counts = [...state.acceptedActivationCounts] as [number, number, number];
  const events: AuthorityAbilityActivationEventV1[] = [];
  const accepted: AuthorityAbilityActivationAcceptedV1[] = [];
  for (let index = 0; index < buttons.length; index += 1) {
    const slot = (index + 1) as 1 | 2 | 3;
    const abilityId = state.loadout.slots[slot];
    const rules = AUTHORITY_THROWABLE_RULES[abilityId];
    while (charges[index] < maximumCharges[index] && authorityTick >= cooldowns[index]) {
      charges[index] += 1;
      cooldowns[index] = charges[index] < maximumCharges[index]
        ? cooldowns[index] + rules.cooldownTicks
        : authorityTick;
    }
    if ((options.pressedButtons & buttons[index]) === 0) continue;
    const reason = !options.alive
      ? 'dead' as const
      : charges[index] <= 0 ? 'cooldown' as const : null;
    if (reason !== null) {
      events.push(freeze({
        kind: 'ability_activation_rejected' as const,
        eventId: `${state.eventNamespace}.${abilityId}.${authorityTick}.${slot}.rejected`,
        authorityTick,
        playerId: state.playerId,
        slot,
        abilityId,
        reason,
        cooldownEndsAtTick: cooldowns[index],
      }));
      continue;
    }
    counts[index] += 1;
    const chargeCountBeforeActivation = charges[index];
    charges[index] -= 1;
    if (chargeCountBeforeActivation === maximumCharges[index]) {
      cooldowns[index] = authorityTick + rules.cooldownTicks;
    }
    const activation = freeze({
      kind: 'ability_activation_accepted' as const,
      eventId: `${state.eventNamespace}.${abilityId}.${authorityTick}.${slot}.${counts[index]}`,
      authorityTick,
      playerId: state.playerId,
      slot,
      abilityId,
      activationOrdinal: counts[index],
      projectileId: `${state.eventNamespace}.${abilityId}.projectile.${slot}.${counts[index]}`,
      cooldownEndsAtTick: cooldowns[index],
    });
    events.push(activation);
    accepted.push(activation);
  }
  return freeze({
    state: {
      ...state,
      cooldownEndsAtTicks: cooldowns,
      currentCharges: charges,
      maximumCharges,
      acceptedActivationCounts: counts,
      lastProcessedAuthorityTick: authorityTick,
    },
    events,
    accepted,
  });
}

export function createAuthorityAbilityProjectile(options: Readonly<{
  activation: AuthorityAbilityActivationAcceptedV1;
  ownerTeamId: string | null;
  originMillimeters: ImpulseGrenadeVector3;
  lookYawMilliDegrees: number;
  lookPitchMilliDegrees: number;
}>): AuthorityAbilityProjectileV1 {
  if (options.activation.abilityId === ABILITY_ID.launch) {
    throw new RangeError('AUTHORITY_LAUNCH_REQUIRES_DEDICATED_IMPULSE_RUNTIME');
  }
  const rules = AUTHORITY_THROWABLE_RULES[options.activation.abilityId];
  const direction = impulseGrenadeDirectionQ15FromLook(
    options.lookYawMilliDegrees,
    options.lookPitchMilliDegrees,
  );
  return freeze({
    schemaVersion: AUTHORITY_ABILITY_LOADOUT_RUNTIME_SCHEMA_VERSION,
    projectileId: stableId(options.activation.projectileId, 'ability projectile id'),
    ownerPlayerId: stableId(options.activation.playerId, 'ability projectile owner id'),
    ownerTeamId: options.ownerTeamId,
    abilityId: options.activation.abilityId,
    spawnTick: options.activation.authorityTick,
    lastProcessedAuthorityTick: options.activation.authorityTick - 1,
    detonatesAtTick: rules.fuseStartsOnCollision
      ? null
      : options.activation.authorityTick + rules.fuseTicks,
    lifetimeEndsAtTick: options.activation.authorityTick + rules.lifetimeTicks,
    positionMillimeters: vector(options.originMillimeters),
    velocityMillimetersPerSecond: vector({
      x: Math.round(direction.x * rules.speedMillimetersPerSecond / Q15),
      y: Math.round(direction.y * rules.speedMillimetersPerSecond / Q15)
        + rules.upwardSpeedMillimetersPerSecond,
      z: Math.round(direction.z * rules.speedMillimetersPerSecond / Q15),
    }),
    bounceCount: 0,
    settled: false,
    attachedPlayerId: null,
  });
}

function speed(value: ImpulseGrenadeVector3): number {
  return Math.round(Math.hypot(value.x, value.y, value.z));
}

function earliestContact(
  result: ReturnType<AuthorityImpulseGrenadeWorldPort['sweepSphere']>,
): ReturnType<AuthorityImpulseGrenadeWorldPort['sweepSphere']>['contacts'][number] | null {
  if (result.schemaVersion !== 1 || !Array.isArray(result.contacts) || result.contacts.length > 64) {
    throw new RangeError('ability projectile sweep result is invalid');
  }
  return [...result.contacts]
    .filter((contact) => IMPULSE_GRENADE_SOLID_LAYERS.includes(contact.layer as never))
    .sort((left, right) => (
      left.timeOfImpactPermille - right.timeOfImpactPermille
      || left.colliderId.localeCompare(right.colliderId)
    ))[0] ?? null;
}

function detonation(
  projectile: AuthorityAbilityProjectileV1,
  authorityTick: number,
  reason: AuthorityAbilityDetonatedV1['reason'],
): AuthorityAbilityDetonatedV1 {
  const rules = AUTHORITY_THROWABLE_RULES[projectile.abilityId];
  return freeze({
    kind: 'ability_projectile_detonated' as const,
    eventId: `${projectile.projectileId}.detonation`,
    authorityTick,
    projectileId: projectile.projectileId,
    ownerPlayerId: projectile.ownerPlayerId,
    ownerTeamId: projectile.ownerTeamId,
    abilityId: projectile.abilityId,
    positionMillimeters: projectile.positionMillimeters,
    areaRadiusMillimeters: rules.areaRadiusMillimeters,
    damageHealthPoints: rules.damageHealthPoints,
    effect: rules.effect,
    effectDurationTicks: rules.effectDurationTicks,
    reason,
  });
}

export function followAuthorityStickyAttachment(
  projectile: AuthorityAbilityProjectileV1,
  attachedCenterMillimeters: ImpulseGrenadeVector3 | null,
): AuthorityAbilityProjectileV1 {
  if (projectile.attachedPlayerId === null || attachedCenterMillimeters === null) return projectile;
  return freeze({
    ...projectile,
    positionMillimeters: vector(attachedCenterMillimeters),
  });
}

export function createAuthoritySmokeField(
  detonationEvent: AuthorityAbilityDetonatedV1,
): AuthoritySmokeFieldV1 {
  if (detonationEvent.abilityId !== ABILITY_ID.smoke || detonationEvent.effect !== 'smoke') {
    throw new RangeError('smoke field requires a smoke detonation');
  }
  return freeze({
    schemaVersion: AUTHORITY_ABILITY_LOADOUT_RUNTIME_SCHEMA_VERSION,
    fieldId: `${detonationEvent.projectileId}.smoke`,
    ownerPlayerId: detonationEvent.ownerPlayerId,
    ownerTeamId: detonationEvent.ownerTeamId,
    spawnedAtTick: detonationEvent.authorityTick,
    expiresAtTick: detonationEvent.authorityTick + detonationEvent.effectDurationTicks,
    centerMillimeters: vector(detonationEvent.positionMillimeters),
    radiusMillimeters: detonationEvent.areaRadiusMillimeters,
  });
}

export function assertAuthorityAbilityLoadoutRuntimeState(
  value: AuthorityAbilityLoadoutRuntimeStateV1,
): AuthorityAbilityLoadoutRuntimeStateV1 {
  if (value.schemaVersion !== AUTHORITY_ABILITY_LOADOUT_RUNTIME_SCHEMA_VERSION) {
    throw new RangeError('ability loadout runtime schema version is invalid');
  }
  stableId(value.playerId, 'ability loadout player id');
  stableId(value.eventNamespace, 'ability loadout event namespace');
  assertAbilityLoadout(value.loadout);
  tick(value.lastProcessedAuthorityTick, 'ability loadout last processed tick');
  if (
    value.cooldownEndsAtTicks.length !== 3
    || value.currentCharges.length !== 3
    || value.maximumCharges.length !== 3
    || value.acceptedActivationCounts.length !== 3
  ) {
    throw new RangeError('ability loadout runtime slot state is invalid');
  }
  value.cooldownEndsAtTicks.forEach((entry) => tick(entry, 'ability cooldown end tick'));
  value.currentCharges.forEach((entry, index) => {
    tick(entry, 'ability current charge count');
    if (entry > value.maximumCharges[index]) {
      throw new RangeError('ability current charge count exceeds its maximum');
    }
  });
  value.maximumCharges.forEach((entry) => {
    if (entry !== 2) throw new RangeError('ability maximum charge count is invalid');
  });
  value.acceptedActivationCounts.forEach((entry) => tick(entry, 'ability activation count'));
  return freeze(value);
}

export function assertAuthorityAbilityProjectile(
  value: AuthorityAbilityProjectileV1,
): AuthorityAbilityProjectileV1 {
  if (value.schemaVersion !== AUTHORITY_ABILITY_LOADOUT_RUNTIME_SCHEMA_VERSION) {
    throw new RangeError('ability projectile schema version is invalid');
  }
  stableId(value.projectileId, 'ability projectile id');
  stableId(value.ownerPlayerId, 'ability projectile owner id');
  if (!(value.abilityId in AUTHORITY_THROWABLE_RULES)) {
    throw new RangeError('ability projectile ability id is invalid');
  }
  tick(value.spawnTick, 'ability projectile spawn tick');
  tick(value.lastProcessedAuthorityTick, 'ability projectile last processed tick');
  if (value.detonatesAtTick !== null) tick(value.detonatesAtTick, 'ability projectile detonation tick');
  tick(value.lifetimeEndsAtTick, 'ability projectile lifetime tick');
  return freeze(value);
}

export function assertAuthoritySmokeField(value: AuthoritySmokeFieldV1): AuthoritySmokeFieldV1 {
  if (value.schemaVersion !== AUTHORITY_ABILITY_LOADOUT_RUNTIME_SCHEMA_VERSION) {
    throw new RangeError('ability smoke field schema version is invalid');
  }
  stableId(value.fieldId, 'ability smoke field id');
  stableId(value.ownerPlayerId, 'ability smoke field owner id');
  tick(value.spawnedAtTick, 'ability smoke field spawn tick');
  tick(value.expiresAtTick, 'ability smoke field expiry tick');
  if (
    !Number.isSafeInteger(value.radiusMillimeters)
    || value.radiusMillimeters !== AUTHORITY_THROWABLE_RULES[ABILITY_ID.smoke].areaRadiusMillimeters
  ) {
    throw new RangeError('ability smoke field radius is invalid');
  }
  return freeze(value);
}

export function advanceAuthorityAbilityProjectile(
  projectile: AuthorityAbilityProjectileV1,
  authorityTickValue: number,
  world: Pick<AuthorityImpulseGrenadeWorldPort, 'sweepSphere'>,
): AdvanceAuthorityAbilityProjectileResultV1 {
  const authorityTick = tick(authorityTickValue, 'ability projectile authority tick');
  if (authorityTick !== projectile.lastProcessedAuthorityTick + 1) {
    throw new RangeError('ability projectile authority tick must be sequential');
  }
  if (projectile.detonatesAtTick !== null && authorityTick >= projectile.detonatesAtTick) {
    const event = detonation(projectile, authorityTick, 'fuse');
    return freeze({ state: null, events: [event], detonation: event });
  }
  if (authorityTick >= projectile.lifetimeEndsAtTick) {
    const event = detonation(projectile, authorityTick, 'lifetime');
    return freeze({ state: null, events: [event], detonation: event });
  }
  if (projectile.settled) {
    return freeze({
      state: { ...projectile, lastProcessedAuthorityTick: authorityTick },
      events: [],
      detonation: null,
    });
  }

  const rules = AUTHORITY_THROWABLE_RULES[projectile.abilityId];
  const velocity = vector({
    ...projectile.velocityMillimetersPerSecond,
    y: projectile.velocityMillimetersPerSecond.y
      + Math.round(rules.gravityMillimetersPerSecondSquared / AUTHORITY_HZ),
  });
  const translation = vector({
    x: Math.round(velocity.x / AUTHORITY_HZ),
    y: Math.round(velocity.y / AUTHORITY_HZ),
    z: Math.round(velocity.z / AUTHORITY_HZ),
  });
  const contact = earliestContact(world.sweepSphere(freeze({
    schemaVersion: 1 as const,
    authorityTick,
    projectileId: projectile.projectileId,
    ownerPlayerId: projectile.ownerPlayerId,
    centerMillimeters: projectile.positionMillimeters,
    translationMillimeters: translation,
    radiusMillimeters: rules.radiusMillimeters,
    solidLayers: IMPULSE_GRENADE_SOLID_LAYERS,
    ignoredPlayerIds: authorityTick < projectile.spawnTick + 6
      ? [projectile.ownerPlayerId]
      : [],
  })));
  if (contact === null) {
    return freeze({
      state: {
        ...projectile,
        lastProcessedAuthorityTick: authorityTick,
        positionMillimeters: vector({
          x: projectile.positionMillimeters.x + translation.x,
          y: projectile.positionMillimeters.y + translation.y,
          z: projectile.positionMillimeters.z + translation.z,
        }),
        velocityMillimetersPerSecond: velocity,
      },
      events: [],
      detonation: null,
    });
  }

  const travel = vector({
    x: Math.round(translation.x * contact.timeOfImpactPermille / PERMILLE),
    y: Math.round(translation.y * contact.timeOfImpactPermille / PERMILLE),
    z: Math.round(translation.z * contact.timeOfImpactPermille / PERMILLE),
  });
  const position = vector({
    x: projectile.positionMillimeters.x + travel.x,
    y: projectile.positionMillimeters.y + travel.y,
    z: projectile.positionMillimeters.z + travel.z,
  });
  const incomingSpeed = speed(velocity);
  const attached = rules.sticky;
  let nextVelocity: ImpulseGrenadeVector3 = { x: 0, y: 0, z: 0 };
  let settled = attached;
  let bounceCount = projectile.bounceCount;
  if (!attached && bounceCount < rules.maximumBounces) {
    const normal = contact.normalQ15;
    const dot = Math.round(
      (velocity.x * normal.x + velocity.y * normal.y + velocity.z * normal.z) / Q15,
    );
    const normalVelocity = vector({
      x: Math.round(normal.x * dot / Q15),
      y: Math.round(normal.y * dot / Q15),
      z: Math.round(normal.z * dot / Q15),
    });
    const tangent = {
      x: velocity.x - normalVelocity.x,
      y: velocity.y - normalVelocity.y,
      z: velocity.z - normalVelocity.z,
    };
    nextVelocity = vector({
      x: Math.round(tangent.x * (PERMILLE - rules.frictionPermille) / PERMILLE)
        - Math.round(normalVelocity.x * rules.restitutionPermille / PERMILLE),
      y: Math.round(tangent.y * (PERMILLE - rules.frictionPermille) / PERMILLE)
        - Math.round(normalVelocity.y * rules.restitutionPermille / PERMILLE),
      z: Math.round(tangent.z * (PERMILLE - rules.frictionPermille) / PERMILLE)
        - Math.round(normalVelocity.z * rules.restitutionPermille / PERMILLE),
    });
    bounceCount += 1;
    settled = speed(nextVelocity) < 1_150;
    if (settled) nextVelocity = { x: 0, y: 0, z: 0 };
  } else {
    settled = true;
  }
  const detonatesAtTick = projectile.detonatesAtTick
    ?? (authorityTick + rules.fuseTicks);
  const event = freeze({
    kind: 'ability_projectile_collision' as const,
    eventId: `${projectile.projectileId}.collision.${authorityTick}.${bounceCount}`,
    authorityTick,
    projectileId: projectile.projectileId,
    ownerPlayerId: projectile.ownerPlayerId,
    abilityId: projectile.abilityId,
    colliderId: stableId(contact.colliderId, 'ability projectile collider id'),
    layer: contact.layer,
    playerId: contact.playerId,
    bounceCount,
    settled,
    attached,
    incomingSpeedMillimetersPerSecond: incomingSpeed,
    outgoingSpeedMillimetersPerSecond: speed(nextVelocity),
  });
  return freeze({
    state: {
      ...projectile,
      lastProcessedAuthorityTick: authorityTick,
      detonatesAtTick,
      positionMillimeters: position,
      velocityMillimetersPerSecond: vector(nextVelocity),
      bounceCount,
      settled,
      attachedPlayerId: attached ? contact.playerId : null,
    },
    events: [event],
    detonation: null,
  });
}

export function resolveAuthorityAbilityEffect(options: Readonly<{
  detonation: AuthorityAbilityDetonatedV1;
  targets: readonly AuthorityAbilityEffectTargetV1[];
  world: Pick<
    AuthorityImpulseGrenadeWorldPort,
    'traceRadialOcclusion' | 'resolveCollisionSafeImpulse'
  >;
}>): readonly AuthorityAbilityEffectOutcomeV1[] {
  const rules = AUTHORITY_THROWABLE_RULES[options.detonation.abilityId];
  return freeze([...options.targets]
    .sort((left, right) => left.playerId.localeCompare(right.playerId))
    .map((target): AuthorityAbilityEffectOutcomeV1 => {
      const empty = (status: AuthorityAbilityEffectOutcomeV1['status']) => ({
        targetPlayerId: target.playerId,
        status,
        damageHealthPoints: 0,
        flashDurationTicks: 0,
        flashIntensityPermille: 0,
        impulseMillimetersPerSecond: { x: 0, y: 0, z: 0 },
      });
      if (!target.alive) return empty('dead');
      if (
        target.playerId !== options.detonation.ownerPlayerId
        && options.detonation.ownerTeamId !== null
        && target.teamId === options.detonation.ownerTeamId
      ) {
        return empty('friendly');
      }
      const delta = {
        x: target.centerPositionMillimeters.x - options.detonation.positionMillimeters.x,
        y: target.centerPositionMillimeters.y - options.detonation.positionMillimeters.y,
        z: target.centerPositionMillimeters.z - options.detonation.positionMillimeters.z,
      };
      const distance = Math.round(Math.hypot(delta.x, delta.y, delta.z));
      if (distance >= rules.areaRadiusMillimeters) return empty('outside_radius');
      const occlusion = options.world.traceRadialOcclusion(freeze({
        schemaVersion: 1 as const,
        authorityTick: options.detonation.authorityTick,
        projectileId: options.detonation.projectileId,
        sourceMillimeters: options.detonation.positionMillimeters,
        targetPlayerId: target.playerId,
        targetMillimeters: target.centerPositionMillimeters,
      }));
      if (occlusion.kind === 'blocked') return empty('occluded');
      const falloff = Math.max(0, Math.min(
        PERMILLE,
        Math.round((rules.areaRadiusMillimeters - distance) * PERMILLE / rules.areaRadiusMillimeters),
      ));
      const damage = rules.effect === 'damage'
        ? Math.max(1, Math.round(rules.damageHealthPoints * falloff / PERMILLE))
        : 0;
      const flashIntensity = rules.effect === 'flash' ? falloff : 0;
      const flashDuration = rules.effect === 'flash'
        ? Math.round(rules.effectDurationTicks * (450 + 550 * falloff / PERMILLE) / PERMILLE)
        : 0;
      let impulse: ImpulseGrenadeVector3 = { x: 0, y: 0, z: 0 };
      if (rules.effect === 'launch') {
        const horizontalLength = Math.max(1, Math.hypot(delta.x, delta.z));
        const magnitude = Math.round(
          (target.playerId === options.detonation.ownerPlayerId
            ? G4_IMPULSE_GRENADE_RULES.selfImpulseMillimetersPerSecond
            : G4_IMPULSE_GRENADE_RULES.enemyImpulseMillimetersPerSecond)
          * falloff / PERMILLE,
        );
        const requested = vector({
          x: Math.round(delta.x / horizontalLength * magnitude),
          y: Math.min(
            G4_IMPULSE_GRENADE_RULES.verticalImpulseCapMillimetersPerSecond,
            Math.max(2_600, Math.round(magnitude * 0.72)),
          ),
          z: Math.round(delta.z / horizontalLength * magnitude),
        });
        const resolved = options.world.resolveCollisionSafeImpulse(freeze({
          schemaVersion: 1 as const,
          authorityTick: options.detonation.authorityTick,
          projectileId: options.detonation.projectileId,
          targetPlayerId: target.playerId,
          targetFeetPositionMillimeters: target.feetPositionMillimeters,
          targetCapsule: target.capsule,
          currentVelocityMillimetersPerSecond: target.currentVelocityMillimetersPerSecond,
          requestedImpulseMillimetersPerSecond: requested,
        }));
        impulse = vector(resolved.appliedImpulseMillimetersPerSecond);
      }
      return {
        targetPlayerId: target.playerId,
        status: 'applied',
        damageHealthPoints: damage,
        flashDurationTicks: flashDuration,
        flashIntensityPermille: flashIntensity,
        impulseMillimetersPerSecond: impulse,
      };
    }));
}

export function abilityLoadoutReconnectPayload(
  state: AuthorityAbilityLoadoutRuntimeStateV1,
): Readonly<{
  schemaVersion: typeof ABILITY_LOADOUT_SCHEMA_VERSION;
  slots: AbilityLoadoutV1['slots'];
  cooldownEndsAtTicks: AuthorityAbilityLoadoutRuntimeStateV1['cooldownEndsAtTicks'];
  currentCharges: AuthorityAbilityLoadoutRuntimeStateV1['currentCharges'];
  maximumCharges: AuthorityAbilityLoadoutRuntimeStateV1['maximumCharges'];
  acceptedActivationCounts: AuthorityAbilityLoadoutRuntimeStateV1['acceptedActivationCounts'];
}> {
  return freeze({
    schemaVersion: ABILITY_LOADOUT_SCHEMA_VERSION,
    slots: state.loadout.slots,
    cooldownEndsAtTicks: state.cooldownEndsAtTicks,
    currentCharges: state.currentCharges,
    maximumCharges: state.maximumCharges,
    acceptedActivationCounts: state.acceptedActivationCounts,
  });
}
