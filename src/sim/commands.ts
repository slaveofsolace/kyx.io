import {
  QUANTIZED_AXIS_LIMIT,
  asSimulationTick,
  type QuantizedAxis,
  type SimulationTick,
} from './units';

declare const entityIdBrand: unique symbol;

export type EntityId = string & {
  readonly [entityIdBrand]: 'entity_id';
};

export const INTENT_BUTTON = Object.freeze({
  jump: 1 << 0,
  sprint: 1 << 1,
  crouch: 1 << 2,
  primaryFire: 1 << 3,
  secondaryFire: 1 << 4,
  abilityOne: 1 << 5,
  abilityTwo: 1 << 6,
  utility: 1 << 7,
  reload: 1 << 8,
  melee: 1 << 9,
  abilityThree: 1 << 10,
} as const);

export const INTENT_BUTTON_MASK = Object.values(INTENT_BUTTON).reduce(
  (mask, button) => mask | button,
  0,
) >>> 0;

export const MAX_LOOK_DELTA_MILLI_DEGREES = 180_000 as const;
export const MAX_SELECTABLE_SLOT = 7 as const;

export interface PlayerIntentCommand {
  readonly kind: 'player_intent';
  readonly sequence: number;
  readonly clientTick: SimulationTick;
  readonly moveX: QuantizedAxis;
  readonly moveZ: QuantizedAxis;
  readonly lookYawDeltaMilliDegrees: number;
  readonly lookPitchDeltaMilliDegrees: number;
  readonly heldButtons: number;
  readonly pressedButtons: number;
  readonly releasedButtons: number;
  readonly selectedSlot?: number;
}

export interface BoundPlayerIntent {
  readonly entityId: EntityId;
  readonly intent: PlayerIntentCommand;
}

const REQUIRED_INTENT_KEYS = Object.freeze([
  'kind',
  'sequence',
  'clientTick',
  'moveX',
  'moveZ',
  'lookYawDeltaMilliDegrees',
  'lookPitchDeltaMilliDegrees',
  'heldButtons',
  'pressedButtons',
  'releasedButtons',
] as const);

const OPTIONAL_INTENT_KEYS = Object.freeze(['selectedSlot'] as const);
const ALLOWED_INTENT_KEYS = new Set<string>([
  ...REQUIRED_INTENT_KEYS,
  ...OPTIONAL_INTENT_KEYS,
]);

function assertUnsigned32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  }
}

export function assertIntentButtonMask(value: number, label: string): void {
  assertUnsigned32(value, label);
  const unknownBits = (value & (~INTENT_BUTTON_MASK >>> 0)) >>> 0;
  if (unknownBits !== 0) {
    throw new RangeError(`${label} contains unsupported button bits`);
  }
}

function assertLookDelta(value: number, label: string): void {
  if (
    !Number.isSafeInteger(value) ||
    value < -MAX_LOOK_DELTA_MILLI_DEGREES ||
    value > MAX_LOOK_DELTA_MILLI_DEGREES
  ) {
    throw new RangeError(
      `${label} must be an integer between -${MAX_LOOK_DELTA_MILLI_DEGREES} and ${MAX_LOOK_DELTA_MILLI_DEGREES}`,
    );
  }
}

export function asEntityId(value: string): EntityId {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 64 ||
    !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value) ||
    value === '__proto__' ||
    value === 'prototype' ||
    value === 'constructor'
  ) {
    throw new RangeError('entity id must be 1-64 safe ASCII identifier characters');
  }
  return value as EntityId;
}

export function assertPlayerIntentCommand(command: PlayerIntentCommand): void {
  if (command === null || typeof command !== 'object') {
    throw new TypeError('player intent must be an object');
  }

  for (const key of Object.keys(command)) {
    if (!ALLOWED_INTENT_KEYS.has(key)) {
      throw new RangeError(`player intent contains unsupported field: ${key}`);
    }
  }
  for (const key of REQUIRED_INTENT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(command, key)) {
      throw new RangeError(`player intent is missing required field: ${key}`);
    }
  }

  if (command.kind !== 'player_intent') {
    throw new RangeError('command kind must be player_intent');
  }
  if (!Number.isSafeInteger(command.sequence) || command.sequence < 0) {
    throw new RangeError('command sequence must be a non-negative safe integer');
  }
  asSimulationTick(command.clientTick);

  for (const [label, value] of [
    ['moveX', command.moveX],
    ['moveZ', command.moveZ],
  ] as const) {
    if (!Number.isInteger(value) || Math.abs(value) > QUANTIZED_AXIS_LIMIT) {
      throw new RangeError(
        `${label} must be an integer between -${QUANTIZED_AXIS_LIMIT} and ${QUANTIZED_AXIS_LIMIT}`,
      );
    }
  }

  assertLookDelta(command.lookYawDeltaMilliDegrees, 'yaw delta');
  assertLookDelta(command.lookPitchDeltaMilliDegrees, 'pitch delta');
  assertIntentButtonMask(command.heldButtons, 'held buttons');
  assertIntentButtonMask(command.pressedButtons, 'pressed buttons');
  assertIntentButtonMask(command.releasedButtons, 'released buttons');

  if (
    command.selectedSlot !== undefined &&
    (!Number.isInteger(command.selectedSlot) ||
      command.selectedSlot < 0 ||
      command.selectedSlot > MAX_SELECTABLE_SLOT)
  ) {
    throw new RangeError(`selected slot must be between 0 and ${MAX_SELECTABLE_SLOT}`);
  }
}

export function bindPlayerIntent(
  entityId: string,
  intent: PlayerIntentCommand,
): BoundPlayerIntent {
  assertPlayerIntentCommand(intent);
  return { entityId: asEntityId(entityId), intent };
}

export function compareBoundPlayerIntents(
  left: BoundPlayerIntent,
  right: BoundPlayerIntent,
): number {
  if (left.entityId < right.entityId) return -1;
  if (left.entityId > right.entityId) return 1;
  return left.intent.sequence - right.intent.sequence;
}
