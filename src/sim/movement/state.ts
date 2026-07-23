import {
  MAX_SELECTABLE_SLOT,
  asEntityId,
  assertIntentButtonMask,
  type EntityId,
} from '../commands';
import {
  asMilliDegrees,
  asMillimeters,
  asMillimetersPerSecond,
  asQuantizedAxis,
  asSimulationTick,
  assertSimulationRateHz,
  normalizeYawMilliDegrees,
  type MilliDegrees,
  type QuantizedAxis,
  type SimulationRateHz,
  type SimulationTick,
} from '../units';
import type { MovementProfileV1 } from './profile';
import { assertMovementProfile, hashMovementProfile } from './profileIdentity';
import {
  assertContactNormalQ15,
  assertSafeInteger,
} from './fixedMath';
import type {
  MovementCollisionLayer,
  MovementSupport,
  MovementVolumeHit,
  Vector3Millimeters,
  Vector3MillimetersPerSecond,
} from './queryPort';

export const MOVEMENT_SIMULATION_STATE_SCHEMA_VERSION = 1 as const;
export const MOVEMENT_IDENTITY_HASH_PATTERN = /^[a-f0-9]{16}(?:[a-f0-9]{48})?$/;
export const MOVEMENT_PITCH_MIN_MILLI_DEGREES = asMilliDegrees(-89_000);
export const MOVEMENT_PITCH_MAX_MILLI_DEGREES = asMilliDegrees(89_000);

export type MovementStance = 'standing' | 'crouched';
export type MovementLocomotion = 'grounded' | 'airborne' | 'sliding';

export interface MovementSimulationIdentity {
  readonly rulesetId: string;
  readonly rulesetRevision: number;
  readonly rulesetHash: string;
  readonly movementProfileId: string;
  readonly movementProfileRevision: number;
  readonly movementProfileHash: string;
  readonly fixtureId: string;
  readonly fixtureHash: string;
  readonly physicsAdapterId: string;
  readonly physicsAdapterVersion: string;
}

export interface MovementAppliedIntent {
  readonly moveX: QuantizedAxis;
  readonly moveZ: QuantizedAxis;
  readonly heldButtons: number;
  readonly pressedButtons: number;
  readonly releasedButtons: number;
  readonly selectedSlot: number;
}

export interface MovementIntegrationRemainders {
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  readonly planarAcceleration: number;
  readonly gravity: number;
}

export interface MovementPlayerState {
  readonly id: EntityId;
  /** Lowest capsule point / floor-contact level. */
  readonly feetPosition: Vector3Millimeters;
  readonly velocity: Vector3MillimetersPerSecond;
  readonly integrationRemainders: MovementIntegrationRemainders;
  readonly yawMilliDegrees: MilliDegrees;
  readonly pitchMilliDegrees: MilliDegrees;
  readonly lastProcessedSequence: number;
  readonly ticksSinceAcceptedCommand: number;
  readonly intent: MovementAppliedIntent;
  readonly stance: MovementStance;
  readonly locomotion: MovementLocomotion;
  readonly grounded: boolean;
  readonly support: MovementSupport | null;
  readonly coyoteTicksRemaining: number;
  readonly jumpBufferTicksRemaining: number;
  readonly slideTicksRemaining: number;
  readonly slideCooldownTicksRemaining: number;
  readonly teleportCooldownTicksRemaining: number;
  readonly standBlocked: boolean;
  readonly activeVolumes: readonly MovementVolumeHit[];
}

export interface MovementSimulationState {
  readonly schemaVersion: typeof MOVEMENT_SIMULATION_STATE_SCHEMA_VERSION;
  readonly identity: MovementSimulationIdentity;
  readonly simulationRateHz: SimulationRateHz;
  readonly tick: SimulationTick;
  readonly player: MovementPlayerState;
}

export interface CreateMovementSimulationStateOptions {
  readonly rulesetId: string;
  readonly rulesetRevision: number;
  readonly rulesetHash: string;
  readonly fixtureId: string;
  readonly fixtureHash: string;
  readonly physicsAdapterId: string;
  readonly physicsAdapterVersion: string;
  readonly playerId?: string;
  readonly feetPosition?: Partial<Record<'x' | 'y' | 'z', number>>;
  readonly velocity?: Partial<Record<'x' | 'y' | 'z', number>>;
  readonly yawMilliDegrees?: number;
  readonly pitchMilliDegrees?: number;
  readonly grounded?: boolean;
  readonly stance?: MovementStance;
  readonly selectedSlot?: number;
}

const MOVEMENT_LAYERS = new Set<MovementCollisionLayer>([
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
  'kill_volume',
  'forbidden_volume',
  'recovery_volume',
]);

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function assertIdentifier(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 96
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)
  ) {
    throw new RangeError(`${label} must be a safe 1-96 character identifier`);
  }
}

function assertRevision(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65_535) {
    throw new RangeError(`${label} must be an integer from 1 to 65535`);
  }
}

function assertHash(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !MOVEMENT_IDENTITY_HASH_PATTERN.test(value)) {
    throw new RangeError(`${label} must be a lowercase 64-bit or 256-bit hexadecimal hash`);
  }
}

function assertTimer(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
    throw new RangeError(`${label} must be a non-negative bounded integer`);
  }
}

function assertVectorMillimeters(value: unknown, label: string): void {
  assertRecord(value, label);
  for (const axis of ['x', 'y', 'z'] as const) {
    if (!Object.prototype.hasOwnProperty.call(value, axis)) {
      throw new RangeError(`${label} is missing ${axis}`);
    }
    asMillimeters(value[axis] as number);
    assertSafeInteger(value[axis] as number, `${label}.${axis}`);
  }
}

function assertVectorVelocity(value: unknown, label: string): void {
  assertRecord(value, label);
  for (const axis of ['x', 'y', 'z'] as const) {
    if (!Object.prototype.hasOwnProperty.call(value, axis)) {
      throw new RangeError(`${label} is missing ${axis}`);
    }
    asMillimetersPerSecond(value[axis] as number);
    assertSafeInteger(value[axis] as number, `${label}.${axis}`);
  }
}

function assertLayer(value: unknown, label: string): asserts value is MovementCollisionLayer {
  if (typeof value !== 'string' || !MOVEMENT_LAYERS.has(value as MovementCollisionLayer)) {
    throw new RangeError(`${label} is unsupported`);
  }
}

function assertSupport(support: MovementSupport | null): void {
  if (support === null) return;
  assertRecord(support, 'movement support');
  assertIdentifier(support.colliderId, 'support collider id');
  assertLayer(support.layer, 'support layer');
  assertContactNormalQ15(support.normalQ15, 'support normal');
  assertVectorVelocity(support.velocity, 'support velocity');
}

export function assertMovementSimulationIdentity(
  identity: MovementSimulationIdentity,
): void {
  assertRecord(identity, 'movement simulation identity');
  assertIdentifier(identity.rulesetId, 'ruleset id');
  assertRevision(identity.rulesetRevision, 'ruleset revision');
  assertHash(identity.rulesetHash, 'ruleset hash');
  assertIdentifier(identity.movementProfileId, 'movement profile id');
  assertRevision(identity.movementProfileRevision, 'movement profile revision');
  assertHash(identity.movementProfileHash, 'movement profile hash');
  assertIdentifier(identity.fixtureId, 'fixture id');
  assertHash(identity.fixtureHash, 'fixture hash');
  assertIdentifier(identity.physicsAdapterId, 'physics adapter id');
  assertIdentifier(identity.physicsAdapterVersion, 'physics adapter version');
}

export function createMovementSimulationState(
  profile: MovementProfileV1,
  options: CreateMovementSimulationStateOptions,
): MovementSimulationState {
  assertMovementProfile(profile);
  assertRecord(options, 'movement state options');
  assertIdentifier(options.rulesetId, 'ruleset id');
  assertRevision(options.rulesetRevision, 'ruleset revision');
  assertHash(options.rulesetHash, 'ruleset hash');
  assertIdentifier(options.fixtureId, 'fixture id');
  assertHash(options.fixtureHash, 'fixture hash');
  assertIdentifier(options.physicsAdapterId, 'physics adapter id');
  assertIdentifier(options.physicsAdapterVersion, 'physics adapter version');
  const pitch = options.pitchMilliDegrees ?? 0;
  if (pitch < MOVEMENT_PITCH_MIN_MILLI_DEGREES || pitch > MOVEMENT_PITCH_MAX_MILLI_DEGREES) {
    throw new RangeError('initial pitch must be between -89000 and 89000 milli-degrees');
  }
  const selectedSlot = options.selectedSlot ?? 0;
  if (!Number.isInteger(selectedSlot) || selectedSlot < 0 || selectedSlot > MAX_SELECTABLE_SLOT) {
    throw new RangeError(`selected slot must be between 0 and ${MAX_SELECTABLE_SLOT}`);
  }
  const grounded = options.grounded ?? true;
  const stance = options.stance ?? 'standing';
  if (typeof grounded !== 'boolean') throw new TypeError('initial grounded must be a boolean');
  if (stance !== 'standing' && stance !== 'crouched') {
    throw new RangeError('initial stance is unsupported');
  }

  return {
    schemaVersion: MOVEMENT_SIMULATION_STATE_SCHEMA_VERSION,
    identity: {
      rulesetId: options.rulesetId,
      rulesetRevision: options.rulesetRevision,
      rulesetHash: options.rulesetHash,
      movementProfileId: profile.id,
      movementProfileRevision: profile.revision,
      movementProfileHash: hashMovementProfile(profile),
      fixtureId: options.fixtureId,
      fixtureHash: options.fixtureHash,
      physicsAdapterId: options.physicsAdapterId,
      physicsAdapterVersion: options.physicsAdapterVersion,
    },
    simulationRateHz: profile.simulationRateHz,
    tick: asSimulationTick(0),
    player: {
      id: asEntityId(options.playerId ?? 'local-player'),
      feetPosition: {
        x: asMillimeters(options.feetPosition?.x ?? 0),
        y: asMillimeters(options.feetPosition?.y ?? 0),
        z: asMillimeters(options.feetPosition?.z ?? 0),
      },
      velocity: {
        x: asMillimetersPerSecond(options.velocity?.x ?? 0),
        y: asMillimetersPerSecond(options.velocity?.y ?? 0),
        z: asMillimetersPerSecond(options.velocity?.z ?? 0),
      },
      integrationRemainders: {
        positionX: 0,
        positionY: 0,
        positionZ: 0,
        planarAcceleration: 0,
        gravity: 0,
      },
      yawMilliDegrees: normalizeYawMilliDegrees(options.yawMilliDegrees ?? 0),
      pitchMilliDegrees: asMilliDegrees(pitch),
      lastProcessedSequence: -1,
      ticksSinceAcceptedCommand: 0,
      intent: {
        moveX: asQuantizedAxis(0),
        moveZ: asQuantizedAxis(0),
        heldButtons: 0,
        pressedButtons: 0,
        releasedButtons: 0,
        selectedSlot,
      },
      stance,
      locomotion: grounded ? 'grounded' : 'airborne',
      grounded,
      support: null,
      coyoteTicksRemaining: grounded ? profile.locomotion.coyoteTicks : 0,
      jumpBufferTicksRemaining: 0,
      slideTicksRemaining: 0,
      slideCooldownTicksRemaining: 0,
      teleportCooldownTicksRemaining: 0,
      standBlocked: false,
      activeVolumes: [],
    },
  };
}

export function assertMovementSimulationState(
  state: MovementSimulationState,
  profile?: MovementProfileV1,
): void {
  assertRecord(state, 'movement simulation state');
  if (state.schemaVersion !== MOVEMENT_SIMULATION_STATE_SCHEMA_VERSION) {
    throw new RangeError(`unsupported movement state schema: ${String(state.schemaVersion)}`);
  }
  assertSimulationRateHz(state.simulationRateHz);
  asSimulationTick(state.tick);
  const identity = state.identity;
  assertMovementSimulationIdentity(identity);
  if (profile) {
    assertMovementProfile(profile);
    if (
      state.simulationRateHz !== profile.simulationRateHz
      || identity.movementProfileId !== profile.id
      || identity.movementProfileRevision !== profile.revision
      || identity.movementProfileHash !== hashMovementProfile(profile)
    ) {
      throw new RangeError('movement state identity does not match its profile');
    }
  }

  const player = state.player;
  assertRecord(player, 'movement player state');
  asEntityId(player.id);
  assertVectorMillimeters(player.feetPosition, 'feet position');
  assertVectorVelocity(player.velocity, 'velocity');
  assertRecord(player.integrationRemainders, 'integration remainders');
  for (const label of [
    'positionX',
    'positionY',
    'positionZ',
    'planarAcceleration',
    'gravity',
  ] as const) {
    if (!Object.prototype.hasOwnProperty.call(player.integrationRemainders, label)) {
      throw new RangeError(`integration remainders is missing ${label}`);
    }
    assertSafeInteger(player.integrationRemainders[label], `integration remainder ${label}`);
  }
  asMilliDegrees(player.yawMilliDegrees);
  if (player.yawMilliDegrees < 0 || player.yawMilliDegrees >= 360_000) {
    throw new RangeError('movement yaw must be normalized milli-degrees');
  }
  asMilliDegrees(player.pitchMilliDegrees);
  if (
    player.pitchMilliDegrees < MOVEMENT_PITCH_MIN_MILLI_DEGREES
    || player.pitchMilliDegrees > MOVEMENT_PITCH_MAX_MILLI_DEGREES
  ) {
    throw new RangeError('movement pitch must be between -89000 and 89000 milli-degrees');
  }
  if (!Number.isSafeInteger(player.lastProcessedSequence) || player.lastProcessedSequence < -1) {
    throw new RangeError('last processed sequence must be -1 or a non-negative integer');
  }
  assertTimer(player.ticksSinceAcceptedCommand, 'ticks since accepted command');
  assertRecord(player.intent, 'movement intent');
  asQuantizedAxis(player.intent.moveX);
  asQuantizedAxis(player.intent.moveZ);
  assertIntentButtonMask(player.intent.heldButtons, 'held buttons');
  assertIntentButtonMask(player.intent.pressedButtons, 'pressed buttons');
  assertIntentButtonMask(player.intent.releasedButtons, 'released buttons');
  if (
    !Number.isInteger(player.intent.selectedSlot)
    || player.intent.selectedSlot < 0
    || player.intent.selectedSlot > MAX_SELECTABLE_SLOT
  ) {
    throw new RangeError('movement selected slot is outside its supported range');
  }
  if (player.stance !== 'standing' && player.stance !== 'crouched') {
    throw new RangeError('movement stance is unsupported');
  }
  if (
    player.locomotion !== 'grounded'
    && player.locomotion !== 'airborne'
    && player.locomotion !== 'sliding'
  ) {
    throw new RangeError('movement locomotion is unsupported');
  }
  if (typeof player.grounded !== 'boolean') throw new TypeError('movement grounded must be a boolean');
  if (typeof player.standBlocked !== 'boolean') {
    throw new TypeError('movement standBlocked must be a boolean');
  }
  for (const [label, value] of [
    ['coyote timer', player.coyoteTicksRemaining],
    ['jump buffer timer', player.jumpBufferTicksRemaining],
    ['slide timer', player.slideTicksRemaining],
    ['slide cooldown', player.slideCooldownTicksRemaining],
    ['teleport cooldown', player.teleportCooldownTicksRemaining],
  ] as const) {
    assertTimer(value, label);
  }
  assertSupport(player.support);
  if (player.support !== null && !player.grounded) {
    throw new RangeError('airborne movement state cannot have a support collider');
  }
  if (player.grounded && player.locomotion === 'airborne') {
    throw new RangeError('grounded movement state cannot be airborne');
  }
  if (!player.grounded && player.locomotion !== 'airborne') {
    throw new RangeError('ungrounded movement state must be airborne');
  }
  if (player.locomotion === 'sliding' && player.stance !== 'crouched') {
    throw new RangeError('sliding movement state must use the crouched stance');
  }
  if (player.locomotion === 'sliding' && player.slideTicksRemaining === 0) {
    throw new RangeError('sliding movement state must have time remaining');
  }
  if (player.standBlocked && player.stance !== 'crouched') {
    throw new RangeError('stand-blocked movement state must use the crouched stance');
  }
  if (!Array.isArray(player.activeVolumes)) {
    throw new TypeError('active movement volumes must be an array');
  }
  const seenVolumes = new Set<string>();
  for (const volume of player.activeVolumes) {
    assertRecord(volume, 'active movement volume');
    assertIdentifier(volume.colliderId, 'active volume collider id');
    if (volume.kind !== 'kill' && volume.kind !== 'forbidden' && volume.kind !== 'recovery') {
      throw new RangeError('active volume kind is unsupported');
    }
    if (seenVolumes.has(volume.colliderId)) throw new RangeError('active volume IDs must be unique');
    seenVolumes.add(volume.colliderId);
  }
}
