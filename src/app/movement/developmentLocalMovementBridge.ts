import type { PlayerIntentCommand } from '../../sim/commands';
import {
  hashCanonicalMovementState,
  stepMovementSimulation,
  type MovementStepResult,
} from '../../sim/movement';
import {
  EMPTY_MOVEMENT_QUERY_METRICS,
  type MovementQueryMetrics,
  type MovementSemanticEvent,
} from '../../sim/movement/events';
import type { MovementProfileV1 } from '../../sim/movement/profile';
import { assertMovementProfile } from '../../sim/movement/profileIdentity';
import {
  MOVEMENT_QUERY_SCHEMA_VERSION,
  type MovementQueryPort,
} from '../../sim/movement/queryPort';
import {
  assertMovementSimulationState,
  type MovementSimulationState,
} from '../../sim/movement/state';
import {
  AUTHORITY_RATE_HZ,
  AUTHORITY_TICK_DURATION_MS,
} from '../../sim/units';
import {
  FixedTickInputLatch,
  type BrowserMovementInputSample,
  type FixedTickInputLatchOptions,
} from './inputLatch';

export const DEVELOPMENT_LOCAL_MOVEMENT_BRIDGE_SCHEMA_VERSION = 1 as const;
export const DEVELOPMENT_LOCAL_MOVEMENT_BRIDGE_BOUNDARY =
  'development_local_render_only' as const;
export const DEFAULT_MAXIMUM_TICKS_PER_RENDER_SAMPLE = 8 as const;
export const MAXIMUM_TICKS_PER_RENDER_SAMPLE = 1_000 as const;
export const MAXIMUM_ACCUMULATED_RENDER_MILLISECONDS = 60_000 as const;

const UINT32_MAX = 0xffff_ffff;
const ACCUMULATOR_EPSILON_MILLISECONDS = 1e-7;

export interface DevelopmentLocalMovementBridgeInputOptions {
  readonly lookMilliDegreesPerMouseUnit?:
    FixedTickInputLatchOptions['lookMilliDegreesPerMouseUnit'];
  readonly invertY?: FixedTickInputLatchOptions['invertY'];
}

export interface CreateDevelopmentLocalMovementBridgeOptions {
  readonly boundary: typeof DEVELOPMENT_LOCAL_MOVEMENT_BRIDGE_BOUNDARY;
  readonly initialState: MovementSimulationState;
  readonly profile: MovementProfileV1;
  readonly queries: MovementQueryPort;
  readonly input?: DevelopmentLocalMovementBridgeInputOptions;
  readonly maximumTicksPerRenderSample?: number;
}

export interface DevelopmentMovementRenderSample {
  readonly elapsedMilliseconds: number;
  readonly input?: BrowserMovementInputSample;
}

export interface DevelopmentLocalMovementBridgeReinitializeOptions {
  readonly initialState: MovementSimulationState;
  readonly initialSequence?: number;
  readonly initialClientTick?: number;
}

export interface DevelopmentLocalMovementBridgeSnapshot {
  readonly schemaVersion: typeof DEVELOPMENT_LOCAL_MOVEMENT_BRIDGE_SCHEMA_VERSION;
  readonly boundary: typeof DEVELOPMENT_LOCAL_MOVEMENT_BRIDGE_BOUNDARY;
  readonly authorityRateHz: typeof AUTHORITY_RATE_HZ;
  readonly authorityTickDurationMilliseconds: typeof AUTHORITY_TICK_DURATION_MS;
  readonly authorityTick: MovementSimulationState['tick'];
  readonly currentStateHash: string;
  readonly previousAuthorityState: MovementSimulationState;
  readonly currentAuthorityState: MovementSimulationState;
  readonly accumulatorMilliseconds: number;
  readonly interpolationAlphaPermille: number;
  readonly pendingWholeTicks: number;
  readonly tickLimitReached: boolean;
  readonly ticksStepped: number;
  readonly totalTicksStepped: number;
  readonly commands: readonly Readonly<PlayerIntentCommand>[];
  readonly events: readonly MovementSemanticEvent[];
  readonly queries: MovementQueryMetrics;
  readonly lifetimeQueries: MovementQueryMetrics;
}

interface MutableMovementQueryMetrics {
  moveCapsuleCalls: number;
  overlapCapsuleCalls: number;
  castCapsuleCalls: number;
  volumeCalls: number;
  shapeCasts: number;
  overlapTests: number;
  contacts: number;
}

function cloneAndFreeze<T>(value: T, ancestors = new WeakSet<object>()): T {
  if (Array.isArray(value)) {
    let prototype: object | null;
    let descriptors: Record<string, PropertyDescriptor>;
    try {
      prototype = Object.getPrototypeOf(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      throw new TypeError('development movement data could not be inspected safely');
    }
    if (prototype !== Array.prototype) {
      throw new TypeError('development movement data arrays must use Array.prototype');
    }
    if (ancestors.has(value)) {
      throw new TypeError('development movement data cannot contain cycles');
    }
    const lengthDescriptor = descriptors.length;
    if (
      lengthDescriptor === undefined
      || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
    ) {
      throw new TypeError('development movement data array length is unsafe');
    }
    const length = lengthDescriptor.value as number;
    const allowedKeys = new Set<PropertyKey>([
      'length',
      ...Array.from({ length }, (_unused, index) => String(index)),
    ]);
    for (const key of Reflect.ownKeys(descriptors)) {
      if (!allowedKeys.has(key)) {
        throw new TypeError('development movement data arrays cannot have extra fields');
      }
    }

    ancestors.add(value);
    try {
      const clone: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (
          descriptor === undefined
          || descriptor.enumerable !== true
          || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
        ) {
          throw new TypeError(
            'development movement data arrays must contain dense data properties',
          );
        }
        clone.push(cloneAndFreeze(descriptor.value, ancestors));
      }
      return Object.freeze(clone) as T;
    } finally {
      ancestors.delete(value);
    }
  }
  if (value !== null && typeof value === 'object') {
    let prototype: object | null;
    let descriptors: Record<string, PropertyDescriptor>;
    try {
      prototype = Object.getPrototypeOf(value);
      descriptors = Object.getOwnPropertyDescriptors(value);
    } catch {
      throw new TypeError('development movement data could not be inspected safely');
    }
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('development movement data must contain only plain objects');
    }
    if (ancestors.has(value)) {
      throw new TypeError('development movement data cannot contain cycles');
    }

    ancestors.add(value);
    try {
      const clone = Object.create(prototype) as Record<PropertyKey, unknown>;
      for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== 'string') {
          throw new TypeError(
            'development movement data objects must contain enumerable string data properties',
          );
        }
        const descriptor = descriptors[key];
        if (
          descriptor === undefined
          || descriptor.enumerable !== true
          || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
        ) {
          throw new TypeError(
            'development movement data objects must contain enumerable string data properties',
          );
        }
        Object.defineProperty(clone, key, {
          configurable: true,
          enumerable: true,
          value: cloneAndFreeze(descriptor.value, ancestors),
          writable: true,
        });
      }
      return Object.freeze(clone) as T;
    } finally {
      ancestors.delete(value);
    }
  }
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new TypeError('development movement data cannot contain functions or symbols');
  }
  return value;
}

function zeroMetrics(): MutableMovementQueryMetrics {
  return { ...EMPTY_MOVEMENT_QUERY_METRICS };
}

function addMetrics(
  target: MutableMovementQueryMetrics,
  current: MovementQueryMetrics,
): void {
  for (const field of [
    'moveCapsuleCalls',
    'overlapCapsuleCalls',
    'castCapsuleCalls',
    'volumeCalls',
    'shapeCasts',
    'overlapTests',
    'contacts',
  ] as const) {
    const next = target[field] + current[field];
    if (!Number.isSafeInteger(next) || next < 0) {
      throw new RangeError(`local movement query metric overflow: ${field}`);
    }
    target[field] = next;
  }
}

function assertUnsigned32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  }
}

type MovementQueryMethodName =
  | 'moveCapsule'
  | 'overlapCapsule'
  | 'castCapsule'
  | 'volumesAtCapsule';

function readQueryDataProperty(
  queries: object,
  property: 'schemaVersion' | MovementQueryMethodName,
): unknown {
  let owner: object | null = queries;
  const visited = new Set<object>();
  while (owner !== null) {
    if (visited.has(owner)) {
      throw new TypeError('development movement query port has a cyclic prototype chain');
    }
    visited.add(owner);

    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(owner, property);
    } catch {
      throw new TypeError(
        `development movement query port ${property} could not be inspected safely`,
      );
    }
    if (descriptor !== undefined) {
      if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        throw new TypeError(
          `development movement query port ${property} must be a data property`,
        );
      }
      return descriptor.value;
    }

    try {
      owner = Object.getPrototypeOf(owner);
    } catch {
      throw new TypeError(
        `development movement query port ${property} could not be inspected safely`,
      );
    }
  }
  throw new TypeError(`development movement query port is missing ${property}`);
}

function captureQueryPort(queries: MovementQueryPort): MovementQueryPort {
  if (queries === null || typeof queries !== 'object') {
    throw new TypeError('development movement query port must be an object');
  }
  const schemaVersion = readQueryDataProperty(queries, 'schemaVersion');
  if (schemaVersion !== MOVEMENT_QUERY_SCHEMA_VERSION) {
    throw new RangeError('development movement query port schema is unsupported');
  }

  const readBoundMethod = <MethodName extends MovementQueryMethodName>(
    methodName: MethodName,
  ): MovementQueryPort[MethodName] => {
    const method = readQueryDataProperty(queries, methodName);
    if (typeof method !== 'function') {
      throw new TypeError(
        `development movement query port ${methodName} must be callable`,
      );
    }
    return Function.prototype.bind.call(method, queries) as MovementQueryPort[MethodName];
  };

  const moveCapsule: MovementQueryPort['moveCapsule'] = readBoundMethod('moveCapsule');
  const overlapCapsule: MovementQueryPort['overlapCapsule'] =
    readBoundMethod('overlapCapsule');
  const castCapsule: MovementQueryPort['castCapsule'] = readBoundMethod('castCapsule');
  const volumesAtCapsule: MovementQueryPort['volumesAtCapsule'] =
    readBoundMethod('volumesAtCapsule');

  return Object.freeze({
    schemaVersion: MOVEMENT_QUERY_SCHEMA_VERSION,
    moveCapsule,
    overlapCapsule,
    castCapsule,
    volumesAtCapsule,
  } satisfies MovementQueryPort);
}

function readRenderSample(value: DevelopmentMovementRenderSample): {
  readonly elapsedMilliseconds: number;
  readonly input: BrowserMovementInputSample;
} {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('development movement render sample must be a plain object');
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('development movement render sample must be a plain object');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || (key !== 'elapsedMilliseconds' && key !== 'input')) {
      throw new RangeError(
        `development movement render sample contains unsupported field: ${String(key)}`,
      );
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined
      || descriptor.enumerable !== true
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ) {
      throw new TypeError(`development movement render sample field ${key} is unsafe`);
    }
  }
  const elapsedDescriptor = descriptors.elapsedMilliseconds;
  if (elapsedDescriptor === undefined) {
    throw new RangeError('development movement render sample is missing elapsedMilliseconds');
  }
  const elapsedMilliseconds = elapsedDescriptor.value as unknown;
  if (
    typeof elapsedMilliseconds !== 'number'
    || !Number.isFinite(elapsedMilliseconds)
    || elapsedMilliseconds < 0
    || elapsedMilliseconds > MAXIMUM_ACCUMULATED_RENDER_MILLISECONDS
  ) {
    throw new RangeError(
      `elapsedMilliseconds must be finite and between 0 and ${MAXIMUM_ACCUMULATED_RENDER_MILLISECONDS}`,
    );
  }
  const input = descriptors.input?.value as unknown;
  return {
    elapsedMilliseconds,
    input: (input ?? {}) as BrowserMovementInputSample,
  };
}

function validateAndDetachState(
  state: MovementSimulationState,
  profile: MovementProfileV1,
): MovementSimulationState {
  const detached = cloneAndFreeze(state);
  assertMovementSimulationState(detached, profile);
  return detached;
}

function nextDefaultSequence(state: MovementSimulationState): number {
  const sequence = state.player.lastProcessedSequence + 1;
  assertUnsigned32(sequence, 'development movement initial sequence');
  return sequence;
}

/**
 * Side-effect-free development bridge. Nothing installs it into the legacy
 * product path; a development local-render route must opt in and inject queries.
 */
export class DevelopmentLocalMovementBridge {
  private readonly profile: MovementProfileV1;
  private readonly queries: MovementQueryPort;
  private readonly latch: FixedTickInputLatch;
  private readonly maximumTicksPerRenderSample: number;
  private previousState: MovementSimulationState;
  private currentState: MovementSimulationState;
  private accumulatorMilliseconds = 0;
  private totalTicksStepped = 0;
  private lifetimeQueries: MutableMovementQueryMetrics = zeroMetrics();
  private latestSnapshot: DevelopmentLocalMovementBridgeSnapshot;
  private fault: Error | null = null;

  public constructor(options: CreateDevelopmentLocalMovementBridgeOptions) {
    if (options.boundary !== DEVELOPMENT_LOCAL_MOVEMENT_BRIDGE_BOUNDARY) {
      throw new RangeError(
        'local movement bridge is restricted to the development local render path',
      );
    }
    const profile = cloneAndFreeze(options.profile);
    assertMovementProfile(profile);
    if (profile.simulationRateHz !== AUTHORITY_RATE_HZ) {
      throw new RangeError('local movement bridge requires the 20 Hz authority profile');
    }
    this.profile = profile;
    this.queries = captureQueryPort(options.queries);

    const maximumTicks = options.maximumTicksPerRenderSample
      ?? DEFAULT_MAXIMUM_TICKS_PER_RENDER_SAMPLE;
    if (
      !Number.isInteger(maximumTicks)
      || maximumTicks < 1
      || maximumTicks > MAXIMUM_TICKS_PER_RENDER_SAMPLE
    ) {
      throw new RangeError(
        `maximumTicksPerRenderSample must be from 1 to ${MAXIMUM_TICKS_PER_RENDER_SAMPLE}`,
      );
    }
    this.maximumTicksPerRenderSample = maximumTicks;

    const state = validateAndDetachState(options.initialState, this.profile);
    assertUnsigned32(state.tick, 'development movement initial client tick');
    this.previousState = state;
    this.currentState = state;
    this.latch = new FixedTickInputLatch({
      lookMilliDegreesPerMouseUnit: options.input?.lookMilliDegreesPerMouseUnit,
      invertY: options.input?.invertY,
      initialSequence: nextDefaultSequence(state),
      initialClientTick: state.tick,
      initialSelectedSlot: state.player.intent.selectedSlot,
    });
    this.latestSnapshot = this.makeSnapshot(
      0,
      [],
      [],
      EMPTY_MOVEMENT_QUERY_METRICS,
    );
  }

  public getSnapshot(): DevelopmentLocalMovementBridgeSnapshot {
    return this.latestSnapshot;
  }

  public advanceRenderSample(
    renderSample: DevelopmentMovementRenderSample,
  ): DevelopmentLocalMovementBridgeSnapshot {
    if (this.fault !== null) {
      throw new Error('development local movement bridge is faulted; reinitialize it', {
        cause: this.fault,
      });
    }
    const sample = readRenderSample(renderSample);
    const projectedAccumulator = this.accumulatorMilliseconds + sample.elapsedMilliseconds;
    if (
      !Number.isFinite(projectedAccumulator)
      || projectedAccumulator > MAXIMUM_ACCUMULATED_RENDER_MILLISECONDS
    ) {
      throw new RangeError(
        `movement accumulator cannot exceed ${MAXIMUM_ACCUMULATED_RENDER_MILLISECONDS} ms`,
      );
    }
    this.latch.sample(sample.input);

    let accumulator = projectedAccumulator;
    let ticksStepped = 0;
    const commands: Readonly<PlayerIntentCommand>[] = [];
    const events: MovementSemanticEvent[] = [];
    const queries = zeroMetrics();
    while (
      accumulator + ACCUMULATOR_EPSILON_MILLISECONDS
        >= AUTHORITY_TICK_DURATION_MS
      && ticksStepped < this.maximumTicksPerRenderSample
    ) {
      if (this.totalTicksStepped >= Number.MAX_SAFE_INTEGER) {
        const overflow = new RangeError(
          'development local movement total tick counter overflow',
        );
        this.fault = overflow;
        throw overflow;
      }
      const command = this.latch.emitNextCommand();
      let result: MovementStepResult;
      try {
        result = stepMovementSimulation(
          this.currentState,
          [command],
          this.profile,
          this.queries,
        );
      } catch (error) {
        this.fault = error instanceof Error ? error : new Error(String(error));
        throw this.fault;
      }
      this.previousState = this.currentState;
      this.currentState = validateAndDetachState(result.state, this.profile);
      accumulator -= AUTHORITY_TICK_DURATION_MS;
      if (Math.abs(accumulator) <= ACCUMULATOR_EPSILON_MILLISECONDS) {
        accumulator = 0;
      }
      ticksStepped += 1;
      this.totalTicksStepped += 1;
      commands.push(command);
      events.push(...result.events);
      addMetrics(queries, result.metrics);
      addMetrics(this.lifetimeQueries, result.metrics);
    }
    this.accumulatorMilliseconds = accumulator;
    this.latestSnapshot = this.makeSnapshot(ticksStepped, commands, events, queries);
    return this.latestSnapshot;
  }

  public neutralizeInput(): void {
    this.latch.neutralize();
  }

  public reinitialize(
    options: DevelopmentLocalMovementBridgeReinitializeOptions,
  ): DevelopmentLocalMovementBridgeSnapshot {
    const state = validateAndDetachState(options.initialState, this.profile);
    const initialSequence = options.initialSequence ?? nextDefaultSequence(state);
    const initialClientTick = options.initialClientTick ?? state.tick;
    assertUnsigned32(initialSequence, 'development movement initial sequence');
    assertUnsigned32(initialClientTick, 'development movement initial client tick');
    if (initialSequence <= state.player.lastProcessedSequence) {
      throw new RangeError('reinitialized command sequence must follow the state sequence');
    }
    if (initialClientTick !== state.tick) {
      throw new RangeError('reinitialized client tick must equal the authority state tick');
    }

    this.latch.reset({
      initialSequence,
      initialClientTick,
      initialSelectedSlot: state.player.intent.selectedSlot,
    });
    this.previousState = state;
    this.currentState = state;
    this.accumulatorMilliseconds = 0;
    this.totalTicksStepped = 0;
    this.lifetimeQueries = zeroMetrics();
    this.fault = null;
    this.latestSnapshot = this.makeSnapshot(
      0,
      [],
      [],
      EMPTY_MOVEMENT_QUERY_METRICS,
    );
    return this.latestSnapshot;
  }

  private makeSnapshot(
    ticksStepped: number,
    commands: readonly Readonly<PlayerIntentCommand>[],
    events: readonly MovementSemanticEvent[],
    queries: MovementQueryMetrics,
  ): DevelopmentLocalMovementBridgeSnapshot {
    const pendingWholeTicks = Math.floor(
      this.accumulatorMilliseconds / AUTHORITY_TICK_DURATION_MS,
    );
    const interpolationAlphaPermille = Math.min(
      1_000,
      Math.floor(
        (this.accumulatorMilliseconds * 1_000) / AUTHORITY_TICK_DURATION_MS,
      ),
    );
    return cloneAndFreeze({
      schemaVersion: DEVELOPMENT_LOCAL_MOVEMENT_BRIDGE_SCHEMA_VERSION,
      boundary: DEVELOPMENT_LOCAL_MOVEMENT_BRIDGE_BOUNDARY,
      authorityRateHz: AUTHORITY_RATE_HZ,
      authorityTickDurationMilliseconds: AUTHORITY_TICK_DURATION_MS,
      authorityTick: this.currentState.tick,
      currentStateHash: hashCanonicalMovementState(this.currentState),
      previousAuthorityState: this.previousState,
      currentAuthorityState: this.currentState,
      accumulatorMilliseconds: this.accumulatorMilliseconds,
      interpolationAlphaPermille,
      pendingWholeTicks,
      tickLimitReached: pendingWholeTicks > 0,
      ticksStepped,
      totalTicksStepped: this.totalTicksStepped,
      commands,
      events,
      queries,
      lifetimeQueries: this.lifetimeQueries,
    });
  }
}

export function createDevelopmentLocalMovementBridge(
  options: CreateDevelopmentLocalMovementBridgeOptions,
): DevelopmentLocalMovementBridge {
  return new DevelopmentLocalMovementBridge(options);
}
