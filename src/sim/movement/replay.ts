import {
  assertPlayerIntentCommand,
  type PlayerIntentCommand,
} from '../commands';
import {
  asMillimeters,
  asSimulationTick,
  assertSimulationRateHz,
  ticksToMilliseconds,
  type SimulationRateHz,
  type SimulationTick,
} from '../units';
import { hashCanonicalMovementState } from './canonical';
import { stepMovementSimulation } from './controller';
import {
  EMPTY_MOVEMENT_QUERY_METRICS,
  type MovementQueryMetrics,
  type MovementSemanticEvent,
} from './events';
import { assertSafeInteger, integerSquareRootFloor, planarLength } from './fixedMath';
import type { MovementProfileV1 } from './profile';
import { assertMovementProfile } from './profileIdentity';
import type {
  MovementQueryPort,
  Vector3Millimeters,
  Vector3MillimetersPerSecond,
} from './queryPort';
import {
  MOVEMENT_SIMULATION_STATE_SCHEMA_VERSION,
  assertMovementSimulationIdentity,
  assertMovementSimulationState,
  type MovementLocomotion,
  type MovementSimulationIdentity,
  type MovementSimulationState,
  type MovementStance,
} from './state';

export const MOVEMENT_REPLAY_SCHEMA_VERSION = 1 as const;
export const MOVEMENT_REPLAY_ENVELOPE_SCHEMA_VERSION = 1 as const;
export const MOVEMENT_REPLAY_MAX_FRAMES = 200_000 as const;
export const MOVEMENT_REPLAY_MAX_COMMANDS_PER_FRAME = 64 as const;

export interface MovementReplayFrame {
  readonly authorityTick: SimulationTick;
  readonly commands: readonly PlayerIntentCommand[];
}

/**
 * A tape is intentionally self-identifying. The same commands are not
 * comparable when their controller, fixture, profile, or physics adapter
 * identity differs.
 */
export interface MovementReplay {
  readonly schemaVersion: typeof MOVEMENT_REPLAY_SCHEMA_VERSION;
  readonly movementStateSchemaVersion: typeof MOVEMENT_SIMULATION_STATE_SCHEMA_VERSION;
  readonly simulationRateHz: SimulationRateHz;
  readonly identity: MovementSimulationIdentity;
  readonly frames: readonly MovementReplayFrame[];
}

export interface MovementReplaySample {
  readonly authorityTick: SimulationTick;
  readonly stateHash: string;
  readonly feetPosition: Vector3Millimeters;
  readonly velocity: Vector3MillimetersPerSecond;
  readonly planarSpeedMmPerSecond: number;
  readonly grounded: boolean;
  readonly stance: MovementStance;
  readonly locomotion: MovementLocomotion;
  readonly queries: MovementQueryMetrics;
}

export interface MovementReplayEnvelope {
  readonly schemaVersion: typeof MOVEMENT_REPLAY_ENVELOPE_SCHEMA_VERSION;
  readonly evidenceLabel: MovementProfileV1['provenance']['evidenceLabel'];
  readonly initialTick: SimulationTick;
  readonly finalTick: SimulationTick;
  readonly tickCount: number;
  readonly elapsedMilliseconds: number;
  readonly planarDistanceTravelledMm: number;
  readonly spatialDistanceTravelledMm: number;
  readonly displacementMm: Vector3Millimeters;
  readonly minimumPlanarSpeedMmPerSecond: number;
  readonly maximumPlanarSpeedMmPerSecond: number;
  readonly minimumFeetHeightMm: number;
  readonly maximumFeetHeightMm: number;
  readonly apexHeightGainMm: number;
  readonly airborneTicks: number;
  readonly groundedTicks: number;
  readonly jumpCount: number;
  readonly bufferedJumpCount: number;
  readonly landingCount: number;
  readonly maximumLandingImpactSpeedMmPerSecond: number;
  readonly slideCount: number;
  readonly successfulTeleportCount: number;
  readonly rejectedTeleportCount: number;
  readonly queries: MovementQueryMetrics;
  readonly samples: readonly MovementReplaySample[];
}

export interface MovementReplayResult {
  readonly finalState: MovementSimulationState;
  readonly finalHash: string;
  readonly stateHashes: readonly string[];
  readonly events: readonly MovementSemanticEvent[];
  readonly envelope: MovementReplayEnvelope;
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

const IDENTITY_FIELDS = Object.freeze([
  'rulesetId',
  'rulesetRevision',
  'rulesetHash',
  'movementProfileId',
  'movementProfileRevision',
  'movementProfileHash',
  'fixtureId',
  'fixtureHash',
  'physicsAdapterId',
  'physicsAdapterVersion',
] as const);

const COMMAND_REQUIRED_FIELDS = Object.freeze([
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

const COMMAND_OPTIONAL_FIELDS = Object.freeze(['selectedSlot'] as const);

function readPlainDataRecord(
  value: unknown,
  label: string,
  requiredFields: readonly string[],
  optionalFields: readonly string[] = [],
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain data object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must have a plain object prototype`);
  }
  const allowed = new Set([...requiredFields, ...optionalFields]);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const values: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !allowed.has(key)) {
      throw new RangeError(`${label} contains unsupported field: ${String(key)}`);
    }
    const descriptor = descriptors[key];
    if (descriptor === undefined || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError(`${label}.${key} must be a data property, not an accessor`);
    }
    if (!descriptor.enumerable) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
    values[key] = descriptor.value;
  }
  for (const field of requiredFields) {
    if (!Object.prototype.hasOwnProperty.call(descriptors, field)) {
      throw new RangeError(`${label} is missing required field: ${field}`);
    }
  }
  return values;
}

function readPlainDenseArray(
  value: unknown,
  label: string,
  maximumLength: number,
): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${label} must have the standard array prototype`);
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (
    lengthDescriptor === undefined
    || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || (lengthDescriptor.value as number) < 0
    || (lengthDescriptor.value as number) > maximumLength
  ) {
    throw new RangeError(`${label} length must be an integer from 0 to ${maximumLength}`);
  }
  const length = lengthDescriptor.value as number;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const values: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined) throw new RangeError(`${label} must not be sparse`);
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError(`${label}[${index}] must be a data property, not an accessor`);
    }
    if (!descriptor.enumerable) {
      throw new TypeError(`${label}[${index}] must be an enumerable data property`);
    }
    values.push(descriptor.value);
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === 'length') continue;
    if (
      typeof key !== 'string'
      || !/^(?:0|[1-9][0-9]*)$/.test(key)
      || Number(key) >= length
    ) {
      throw new RangeError(`${label} contains an unsupported array property: ${String(key)}`);
    }
  }
  return values;
}

function cloneIdentity(identity: MovementSimulationIdentity): MovementSimulationIdentity {
  return Object.freeze({
    rulesetId: identity.rulesetId,
    rulesetRevision: identity.rulesetRevision,
    rulesetHash: identity.rulesetHash,
    movementProfileId: identity.movementProfileId,
    movementProfileRevision: identity.movementProfileRevision,
    movementProfileHash: identity.movementProfileHash,
    fixtureId: identity.fixtureId,
    fixtureHash: identity.fixtureHash,
    physicsAdapterId: identity.physicsAdapterId,
    physicsAdapterVersion: identity.physicsAdapterVersion,
  });
}

function identityMismatch(
  expected: MovementSimulationIdentity,
  actual: MovementSimulationIdentity,
): string | null {
  for (const field of IDENTITY_FIELDS) {
    if (expected[field] !== actual[field]) return field;
  }
  return null;
}

function snapshotIdentity(value: unknown): MovementSimulationIdentity {
  const values = readPlainDataRecord(value, 'movement replay identity', IDENTITY_FIELDS);
  const identity = cloneIdentity(values as unknown as MovementSimulationIdentity);
  assertMovementSimulationIdentity(identity);
  return identity;
}

function snapshotCommand(value: unknown, indexLabel: string): PlayerIntentCommand {
  const values = readPlainDataRecord(
    value,
    indexLabel,
    COMMAND_REQUIRED_FIELDS,
    COMMAND_OPTIONAL_FIELDS,
  );
  const command: PlayerIntentCommand = {
    kind: values.kind as PlayerIntentCommand['kind'],
    sequence: values.sequence as number,
    clientTick: values.clientTick as SimulationTick,
    moveX: values.moveX as PlayerIntentCommand['moveX'],
    moveZ: values.moveZ as PlayerIntentCommand['moveZ'],
    lookYawDeltaMilliDegrees: values.lookYawDeltaMilliDegrees as number,
    lookPitchDeltaMilliDegrees: values.lookPitchDeltaMilliDegrees as number,
    heldButtons: values.heldButtons as number,
    pressedButtons: values.pressedButtons as number,
    releasedButtons: values.releasedButtons as number,
    ...(Object.prototype.hasOwnProperty.call(values, 'selectedSlot')
      ? { selectedSlot: values.selectedSlot as number }
      : {}),
  };
  assertPlayerIntentCommand(command);
  return Object.freeze(command);
}

function snapshotFrame(value: unknown, frameIndex: number): MovementReplayFrame {
  const label = `movement replay frame ${frameIndex}`;
  const values = readPlainDataRecord(value, label, ['authorityTick', 'commands']);
  const authorityTick = asSimulationTick(values.authorityTick as number);
  const commandValues = readPlainDenseArray(
    values.commands,
    `${label} commands`,
    MOVEMENT_REPLAY_MAX_COMMANDS_PER_FRAME,
  );
  const commands = commandValues.map((command, commandIndex) => (
    snapshotCommand(command, `${label} command ${commandIndex}`)
  ));
  return Object.freeze({ authorityTick, commands: Object.freeze(commands) });
}

function snapshotReplay(value: unknown): MovementReplay {
  const values = readPlainDataRecord(value, 'movement replay', [
    'schemaVersion',
    'movementStateSchemaVersion',
    'simulationRateHz',
    'identity',
    'frames',
  ]);
  if (values.schemaVersion !== MOVEMENT_REPLAY_SCHEMA_VERSION) {
    throw new RangeError(`unsupported movement replay schema: ${String(values.schemaVersion)}`);
  }
  if (values.movementStateSchemaVersion !== MOVEMENT_SIMULATION_STATE_SCHEMA_VERSION) {
    throw new RangeError(
      `unsupported replay movement state schema: ${String(values.movementStateSchemaVersion)}`,
    );
  }
  const simulationRateHz = values.simulationRateHz as number;
  assertSimulationRateHz(simulationRateHz);
  const frameValues = readPlainDenseArray(
    values.frames,
    'movement replay frames',
    MOVEMENT_REPLAY_MAX_FRAMES,
  );
  const frames = frameValues.map((frame, index) => snapshotFrame(frame, index));
  return Object.freeze({
    schemaVersion: MOVEMENT_REPLAY_SCHEMA_VERSION,
    movementStateSchemaVersion: MOVEMENT_SIMULATION_STATE_SCHEMA_VERSION,
    simulationRateHz,
    identity: snapshotIdentity(values.identity),
    frames: Object.freeze(frames),
  });
}

function cloneMetrics(metrics: MovementQueryMetrics): MovementQueryMetrics {
  return {
    moveCapsuleCalls: metrics.moveCapsuleCalls,
    overlapCapsuleCalls: metrics.overlapCapsuleCalls,
    castCapsuleCalls: metrics.castCapsuleCalls,
    volumeCalls: metrics.volumeCalls,
    shapeCasts: metrics.shapeCasts,
    overlapTests: metrics.overlapTests,
    contacts: metrics.contacts,
  };
}

function addMetrics(
  aggregate: MutableMovementQueryMetrics,
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
    const next = aggregate[field] + current[field];
    assertSafeInteger(next, `aggregate movement query metric ${field}`);
    aggregate[field] = next;
  }
}

function clonePosition(position: Vector3Millimeters): Vector3Millimeters {
  return { x: position.x, y: position.y, z: position.z };
}

function cloneVelocity(velocity: Vector3MillimetersPerSecond): Vector3MillimetersPerSecond {
  return { x: velocity.x, y: velocity.y, z: velocity.z };
}

function makeSample(
  state: MovementSimulationState,
  hash: string,
  queries: MovementQueryMetrics,
): MovementReplaySample {
  return {
    authorityTick: state.tick,
    stateHash: hash,
    feetPosition: clonePosition(state.player.feetPosition),
    velocity: cloneVelocity(state.player.velocity),
    planarSpeedMmPerSecond: planarLength(state.player.velocity.x, state.player.velocity.z),
    grounded: state.player.grounded,
    stance: state.player.stance,
    locomotion: state.player.locomotion,
    queries: cloneMetrics(queries),
  };
}

function spatialLength(x: number, y: number, z: number): number {
  const squared = x * x + y * y + z * z;
  assertSafeInteger(squared, 'movement replay spatial squared distance');
  return integerSquareRootFloor(squared);
}

export function createMovementReplay(
  initialState: MovementSimulationState,
  frames: readonly MovementReplayFrame[],
): MovementReplay {
  assertMovementSimulationState(initialState);
  return snapshotReplay({
    schemaVersion: MOVEMENT_REPLAY_SCHEMA_VERSION,
    movementStateSchemaVersion: MOVEMENT_SIMULATION_STATE_SCHEMA_VERSION,
    simulationRateHz: initialState.simulationRateHz,
    identity: cloneIdentity(initialState.identity),
    frames,
  });
}

export function runMovementReplay(
  initialState: MovementSimulationState,
  replay: MovementReplay,
  profile: MovementProfileV1,
  queries: MovementQueryPort,
): MovementReplayResult {
  assertMovementProfile(profile);
  assertMovementSimulationState(initialState, profile);
  const tape = snapshotReplay(replay);
  if (tape.simulationRateHz !== initialState.simulationRateHz) {
    throw new RangeError('movement replay authority rate does not match the initial state');
  }
  const mismatch = identityMismatch(initialState.identity, tape.identity);
  if (mismatch !== null) {
    throw new RangeError(`movement replay identity mismatch: ${mismatch}`);
  }
  let state = initialState;
  const initialHash = hashCanonicalMovementState(state);
  const hashes: string[] = [initialHash];
  const events: MovementSemanticEvent[] = [];
  const aggregateQueries: MutableMovementQueryMetrics = { ...EMPTY_MOVEMENT_QUERY_METRICS };
  const samples: MovementReplaySample[] = [
    makeSample(state, initialHash, EMPTY_MOVEMENT_QUERY_METRICS),
  ];
  let planarDistanceTravelledMm = 0;
  let spatialDistanceTravelledMm = 0;
  let minimumPlanarSpeedMmPerSecond = samples[0].planarSpeedMmPerSecond;
  let maximumPlanarSpeedMmPerSecond = samples[0].planarSpeedMmPerSecond;
  let minimumFeetHeightMm: number = state.player.feetPosition.y;
  let maximumFeetHeightMm: number = state.player.feetPosition.y;
  let airborneTicks = 0;
  let groundedTicks = 0;

  for (const frame of tape.frames) {
    const expectedTick = asSimulationTick(state.tick + 1);
    if (frame.authorityTick !== expectedTick) {
      throw new RangeError(
        `movement replay tick ${String(frame.authorityTick)} is not the expected next tick ${expectedTick}`,
      );
    }
    const previousPosition = state.player.feetPosition;
    const result = stepMovementSimulation(
      state,
      frame.commands,
      profile,
      queries,
    );
    state = result.state;
    const hash = hashCanonicalMovementState(state);
    hashes.push(hash);
    events.push(...result.events);
    addMetrics(aggregateQueries, result.metrics);
    const sample = makeSample(state, hash, result.metrics);
    samples.push(sample);

    const deltaX = state.player.feetPosition.x - previousPosition.x;
    const deltaY = state.player.feetPosition.y - previousPosition.y;
    const deltaZ = state.player.feetPosition.z - previousPosition.z;
    planarDistanceTravelledMm += planarLength(deltaX, deltaZ);
    spatialDistanceTravelledMm += spatialLength(deltaX, deltaY, deltaZ);
    assertSafeInteger(planarDistanceTravelledMm, 'movement replay planar distance');
    assertSafeInteger(spatialDistanceTravelledMm, 'movement replay spatial distance');
    minimumPlanarSpeedMmPerSecond = Math.min(
      minimumPlanarSpeedMmPerSecond,
      sample.planarSpeedMmPerSecond,
    );
    maximumPlanarSpeedMmPerSecond = Math.max(
      maximumPlanarSpeedMmPerSecond,
      sample.planarSpeedMmPerSecond,
    );
    minimumFeetHeightMm = Math.min(minimumFeetHeightMm, sample.feetPosition.y);
    maximumFeetHeightMm = Math.max(maximumFeetHeightMm, sample.feetPosition.y);
    if (sample.grounded) groundedTicks += 1;
    else airborneTicks += 1;
  }

  const initialPosition = initialState.player.feetPosition;
  const displacementMm: Vector3Millimeters = {
    x: asMillimeters(state.player.feetPosition.x - initialPosition.x),
    y: asMillimeters(state.player.feetPosition.y - initialPosition.y),
    z: asMillimeters(state.player.feetPosition.z - initialPosition.z),
  };
  const landingEvents = events.filter((event) => event.kind === 'landed');
  const finalHash = hashes[hashes.length - 1];
  if (finalHash === undefined) throw new Error('movement replay did not produce an initial hash');

  return {
    finalState: state,
    finalHash,
    stateHashes: hashes,
    events,
    envelope: {
      schemaVersion: MOVEMENT_REPLAY_ENVELOPE_SCHEMA_VERSION,
      evidenceLabel: profile.provenance.evidenceLabel,
      initialTick: initialState.tick,
      finalTick: state.tick,
      tickCount: tape.frames.length,
      elapsedMilliseconds: ticksToMilliseconds(
        asSimulationTick(tape.frames.length),
        tape.simulationRateHz,
      ),
      planarDistanceTravelledMm,
      spatialDistanceTravelledMm,
      displacementMm,
      minimumPlanarSpeedMmPerSecond,
      maximumPlanarSpeedMmPerSecond,
      minimumFeetHeightMm,
      maximumFeetHeightMm,
      apexHeightGainMm: maximumFeetHeightMm - initialPosition.y,
      airborneTicks,
      groundedTicks,
      jumpCount: events.filter((event) => event.kind === 'jumped').length,
      bufferedJumpCount: events.filter((event) => event.kind === 'jumped' && event.buffered).length,
      landingCount: landingEvents.length,
      maximumLandingImpactSpeedMmPerSecond: landingEvents.reduce(
        (maximum, event) => Math.max(maximum, event.impactSpeedMmPerSecond),
        0,
      ),
      slideCount: events.filter((event) => event.kind === 'slide_started').length,
      successfulTeleportCount: events.filter((event) => event.kind === 'teleport_succeeded').length,
      rejectedTeleportCount: events.filter((event) => event.kind === 'teleport_rejected').length,
      queries: cloneMetrics(aggregateQueries),
      samples,
    },
  };
}
