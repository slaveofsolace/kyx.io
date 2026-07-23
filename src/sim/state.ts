import {
  asEntityId,
  assertIntentButtonMask,
  type EntityId,
} from './commands';
import {
  MAX_SELECTABLE_SLOT,
} from './commands';
import {
  asMilliDegrees,
  asMillimeters,
  asMillimetersPerSecond,
  asQuantizedAxis,
  asSimulationTick,
  assertSimulationRateHz,
  normalizeYawMilliDegrees,
  type MilliDegrees,
  type Millimeters,
  type MillimetersPerSecond,
  type QuantizedAxis,
  type SimulationRateHz,
  type SimulationTick,
} from './units';
import {
  assertDeterministicRngState,
  seedDeterministicRng,
  type DeterministicRngState,
} from './rng';

export const SIMULATION_STATE_SCHEMA_VERSION = 1 as const;
export const DEFAULT_PITCH_MIN_MILLI_DEGREES = asMilliDegrees(-89_000);
export const DEFAULT_PITCH_MAX_MILLI_DEGREES = asMilliDegrees(89_000);

export interface PositionMillimeters {
  readonly x: Millimeters;
  readonly y: Millimeters;
  readonly z: Millimeters;
}

export interface VelocityMillimetersPerSecond {
  readonly x: MillimetersPerSecond;
  readonly y: MillimetersPerSecond;
  readonly z: MillimetersPerSecond;
}

export interface IntegrationRemainder {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AppliedIntentState {
  readonly moveX: QuantizedAxis;
  readonly moveZ: QuantizedAxis;
  readonly heldButtons: number;
  readonly pressedButtons: number;
  readonly releasedButtons: number;
  readonly selectedSlot: number;
}

export interface SimulationEntityState {
  readonly id: EntityId;
  readonly positionMm: PositionMillimeters;
  readonly velocityMmPerSecond: VelocityMillimetersPerSecond;
  readonly integrationRemainder: IntegrationRemainder;
  readonly yawMilliDegrees: MilliDegrees;
  readonly pitchMilliDegrees: MilliDegrees;
  readonly lastProcessedSequence: number;
  readonly intent: AppliedIntentState;
}

export interface SimulationState {
  readonly schemaVersion: typeof SIMULATION_STATE_SCHEMA_VERSION;
  readonly rulesetId: string;
  readonly simulationRateHz: SimulationRateHz;
  readonly tick: SimulationTick;
  readonly random: DeterministicRngState;
  readonly entities: Readonly<Record<string, SimulationEntityState>>;
}

export interface CreateSimulationEntityOptions {
  readonly id: string;
  readonly positionMm?: Partial<Record<'x' | 'y' | 'z', number>>;
  readonly yawMilliDegrees?: number;
  readonly pitchMilliDegrees?: number;
  readonly selectedSlot?: number;
}

export interface CreateSimulationStateOptions {
  readonly rulesetId: string;
  readonly simulationRateHz: SimulationRateHz;
  readonly matchSeed: number | string;
  readonly entities: readonly SimulationEntityState[];
}

function assertRulesetId(value: string): void {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > 96 ||
    !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)
  ) {
    throw new RangeError('ruleset id must be 1-96 safe ASCII identifier characters');
  }
}

function assertRemainder(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer`);
  }
}

function assertSelectedSlot(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_SELECTABLE_SLOT) {
    throw new RangeError(`selected slot must be between 0 and ${MAX_SELECTABLE_SLOT}`);
  }
}

export function createSimulationEntity(
  options: CreateSimulationEntityOptions,
): SimulationEntityState {
  const selectedSlot = options.selectedSlot ?? 0;
  assertSelectedSlot(selectedSlot);
  const pitch = options.pitchMilliDegrees ?? 0;
  if (
    pitch < DEFAULT_PITCH_MIN_MILLI_DEGREES ||
    pitch > DEFAULT_PITCH_MAX_MILLI_DEGREES
  ) {
    throw new RangeError('initial pitch must be between -89000 and 89000 milli-degrees');
  }

  return {
    id: asEntityId(options.id),
    positionMm: {
      x: asMillimeters(options.positionMm?.x ?? 0),
      y: asMillimeters(options.positionMm?.y ?? 0),
      z: asMillimeters(options.positionMm?.z ?? 0),
    },
    velocityMmPerSecond: {
      x: asMillimetersPerSecond(0),
      y: asMillimetersPerSecond(0),
      z: asMillimetersPerSecond(0),
    },
    integrationRemainder: { x: 0, y: 0, z: 0 },
    yawMilliDegrees: normalizeYawMilliDegrees(options.yawMilliDegrees ?? 0),
    pitchMilliDegrees: asMilliDegrees(pitch),
    lastProcessedSequence: -1,
    intent: {
      moveX: asQuantizedAxis(0),
      moveZ: asQuantizedAxis(0),
      heldButtons: 0,
      pressedButtons: 0,
      releasedButtons: 0,
      selectedSlot,
    },
  };
}

export function createSimulationState(
  options: CreateSimulationStateOptions,
): SimulationState {
  assertRulesetId(options.rulesetId);
  assertSimulationRateHz(options.simulationRateHz);
  const entities: Record<string, SimulationEntityState> = Object.create(null) as Record<
    string,
    SimulationEntityState
  >;

  const sortedEntities = [...options.entities].sort((left, right) => {
    if (left.id < right.id) return -1;
    if (left.id > right.id) return 1;
    return 0;
  });

  for (const entity of sortedEntities) {
    assertSimulationEntityState(entity);
    if (entities[entity.id] !== undefined) {
      throw new RangeError(`duplicate simulation entity id: ${entity.id}`);
    }
    entities[entity.id] = entity;
  }

  return {
    schemaVersion: SIMULATION_STATE_SCHEMA_VERSION,
    rulesetId: options.rulesetId,
    simulationRateHz: options.simulationRateHz,
    tick: asSimulationTick(0),
    random: seedDeterministicRng(options.matchSeed, 'simulation'),
    entities,
  };
}

export function assertSimulationEntityState(entity: SimulationEntityState): void {
  asEntityId(entity.id);
  for (const [label, value] of [
    ['position x', entity.positionMm.x],
    ['position y', entity.positionMm.y],
    ['position z', entity.positionMm.z],
  ] as const) {
    asMillimeters(value);
    if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be a safe integer`);
  }
  for (const [label, value] of [
    ['velocity x', entity.velocityMmPerSecond.x],
    ['velocity y', entity.velocityMmPerSecond.y],
    ['velocity z', entity.velocityMmPerSecond.z],
  ] as const) {
    asMillimetersPerSecond(value);
    if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be a safe integer`);
  }
  assertRemainder(entity.integrationRemainder.x, 'integration remainder x');
  assertRemainder(entity.integrationRemainder.y, 'integration remainder y');
  assertRemainder(entity.integrationRemainder.z, 'integration remainder z');
  if (
    !Number.isSafeInteger(entity.yawMilliDegrees) ||
    entity.yawMilliDegrees < 0 ||
    entity.yawMilliDegrees >= 360_000
  ) {
    throw new RangeError('entity yaw must be normalized milli-degrees');
  }
  if (
    !Number.isSafeInteger(entity.pitchMilliDegrees) ||
    entity.pitchMilliDegrees < DEFAULT_PITCH_MIN_MILLI_DEGREES ||
    entity.pitchMilliDegrees > DEFAULT_PITCH_MAX_MILLI_DEGREES
  ) {
    throw new RangeError('entity pitch must be between -89000 and 89000 milli-degrees');
  }
  if (!Number.isSafeInteger(entity.lastProcessedSequence) || entity.lastProcessedSequence < -1) {
    throw new RangeError('last processed sequence must be -1 or a non-negative safe integer');
  }
  asQuantizedAxis(entity.intent.moveX);
  asQuantizedAxis(entity.intent.moveZ);
  assertIntentButtonMask(entity.intent.heldButtons, 'held buttons');
  assertIntentButtonMask(entity.intent.pressedButtons, 'pressed buttons');
  assertIntentButtonMask(entity.intent.releasedButtons, 'released buttons');
  assertSelectedSlot(entity.intent.selectedSlot);
}

export function assertSimulationState(state: SimulationState): void {
  if (state.schemaVersion !== SIMULATION_STATE_SCHEMA_VERSION) {
    throw new RangeError(`unsupported simulation state schema: ${String(state.schemaVersion)}`);
  }
  assertRulesetId(state.rulesetId);
  assertSimulationRateHz(state.simulationRateHz);
  asSimulationTick(state.tick);
  assertDeterministicRngState(state.random);

  for (const [key, entity] of Object.entries(state.entities)) {
    assertSimulationEntityState(entity);
    if (key !== entity.id) {
      throw new RangeError(`simulation entity key/id mismatch: ${key} != ${entity.id}`);
    }
  }
}
