import {
  INTENT_BUTTON,
  MOVEMENT_REPLAY_ENVELOPE_SCHEMA_VERSION,
  MOVEMENT_REPLAY_SCHEMA_VERSION,
  MOVEMENT_SIMULATION_STATE_SCHEMA_VERSION,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  asEntityId,
  asMilliDegrees,
  asMillimeters,
  asMillimetersPerSecond,
  asQuantizedAxis,
  asSimulationTick,
  assertMovementSimulationIdentity,
  createMovementReplay,
  createMovementSimulationState,
  hashMovementProfile,
  planarLength,
  runMovementReplay,
  ticksToMilliseconds,
  type EntityId,
  type MilliDegrees,
  type MovementQueryMetrics,
  type MovementReplay,
  type MovementReplayEnvelope,
  type MovementReplayFrame,
  type MovementReplayResult,
  type MovementReplaySample,
  type MovementSemanticEvent,
  type MovementSimulationIdentity,
  type MovementSimulationState,
  type MovementStance,
  type PlayerIntentCommand,
  type Vector3Millimeters,
  type Vector3MillimetersPerSecond,
} from '../../sim';
import {
  PHYSICS_FIXTURE_SCHEMA_VERSION,
  hashPhysicsFixture,
} from '../fixtureSchema';
import {
  EXPECTED_RAPIER_VERSION,
  createRapierMovementWorld,
} from '../rapier';
import {
  PHYSICS_FIXTURE_IDS,
  getPhysicsFixture,
  type PhysicsFixtureId,
} from './catalog';
import { RECORDED_PHYSICS_FIXTURE_TAPE_RESULTS } from './recordedTapeResults';

export const PHYSICS_FIXTURE_TAPE_SCHEMA_VERSION = 1 as const;

export const PHYSICS_FIXTURE_TAPE_IDS = Object.freeze([
  'flat_run_fixed_20hz_v1',
  'flat_run_accel_brake_20hz_v1',
  'flat_run_buffer_accept_20hz_v1',
  'flat_run_buffer_reject_20hz_v1',
  'flat_run_coyote_accept_20hz_v1',
  'flat_run_coyote_reject_20hz_v1',
  'contact_lab_wall_20hz_v1',
  'contact_lab_diagonal_glance_20hz_v1',
  'contact_lab_corner_concave_20hz_v1',
  'contact_lab_corner_convex_20hz_v1',
  'contact_lab_doorway_exact_700_reject_20hz_v1',
  'contact_lab_doorway_800_pass_20hz_v1',
  'vertical_lab_steps_20hz_v1',
  'slide_lab_collision_20hz_v1',
  'slide_lab_uphill_20hz_v1',
  'slide_lab_downhill_20hz_v1',
  'teleport_lab_thin_wall_20hz_v1',
  'teleport_lab_blocked_20hz_v1',
] as const);

export type PhysicsFixtureTapeId = (typeof PHYSICS_FIXTURE_TAPE_IDS)[number];

export interface PhysicsFixtureTapeStartV1 {
  readonly playerId: EntityId;
  readonly feetPosition: Vector3Millimeters;
  readonly velocity: Vector3MillimetersPerSecond;
  readonly yawMilliDegrees: MilliDegrees;
  readonly pitchMilliDegrees: MilliDegrees;
  readonly grounded: boolean;
  readonly stance: MovementStance;
  readonly selectedSlot: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

export type PhysicsFixtureTapeExpectedEnvelopeV1 = Omit<MovementReplayEnvelope, 'samples'>;

export type PhysicsFixtureTapeNotMeasuredReason =
  | 'scenario_not_exercised'
  | 'initial_velocity_not_zero'
  | 'result_not_observed'
  | 'weapon_ready_recovery_out_of_scope';

export type PhysicsFixtureTapeMeasurement<T> =
  | {
    readonly status: 'measured';
    readonly value: T;
  }
  | {
    readonly status: 'not_measured';
    readonly value: null;
    readonly reason: PhysicsFixtureTapeNotMeasuredReason;
  };

export interface PhysicsFixtureTapeMeasurementsV1 {
  readonly speed90AttainmentTicks: PhysicsFixtureTapeMeasurement<number>;
  readonly brakingToStopTicks: PhysicsFixtureTapeMeasurement<number>;
  readonly jumpApexHeightGainMm: PhysicsFixtureTapeMeasurement<number>;
  readonly jumpTimeToApexTicks: PhysicsFixtureTapeMeasurement<number>;
  readonly jumpAirtimeTicks: PhysicsFixtureTapeMeasurement<number>;
  readonly coyoteJumpWindowTicks: PhysicsFixtureTapeMeasurement<number>;
  readonly bufferedJumpLeadTicks: PhysicsFixtureTapeMeasurement<number>;
  readonly slideDurationTicks: PhysicsFixtureTapeMeasurement<number>;
  readonly slideSpeedCurveMmPerSecond: PhysicsFixtureTapeMeasurement<readonly number[]>;
  readonly teleportActualDistanceMm: PhysicsFixtureTapeMeasurement<number>;
  readonly teleportBackoffDistanceMm: PhysicsFixtureTapeMeasurement<number>;
  readonly weaponReadyRecoveryMilliseconds: PhysicsFixtureTapeMeasurement<number>;
}

export interface PhysicsFixtureTapeExpectedV1 {
  readonly finalHash: string;
  readonly stateHashes: readonly string[];
  readonly events: readonly MovementSemanticEvent[];
  readonly samples: readonly MovementReplaySample[];
  readonly envelope: PhysicsFixtureTapeExpectedEnvelopeV1;
  readonly measurements: PhysicsFixtureTapeMeasurementsV1;
}

export interface PhysicsFixtureTapeV1 {
  readonly schemaVersion: typeof PHYSICS_FIXTURE_TAPE_SCHEMA_VERSION;
  readonly id: PhysicsFixtureTapeId;
  readonly movementReplaySchemaVersion: typeof MOVEMENT_REPLAY_SCHEMA_VERSION;
  readonly movementStateSchemaVersion: typeof MOVEMENT_SIMULATION_STATE_SCHEMA_VERSION;
  readonly fixtureSchemaVersion: typeof PHYSICS_FIXTURE_SCHEMA_VERSION;
  readonly simulationRateHz: typeof PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.simulationRateHz;
  readonly identity: MovementSimulationIdentity;
  readonly start: PhysicsFixtureTapeStartV1;
  readonly frames: readonly MovementReplayFrame[];
  readonly expected: PhysicsFixtureTapeExpectedV1;
}

export interface PreparedPhysicsFixtureTape {
  readonly tape: PhysicsFixtureTapeV1;
  readonly initialState: MovementSimulationState;
  readonly replay: MovementReplay;
}

const TAPE_FIELDS = Object.freeze([
  'schemaVersion',
  'id',
  'movementReplaySchemaVersion',
  'movementStateSchemaVersion',
  'fixtureSchemaVersion',
  'simulationRateHz',
  'identity',
  'start',
  'frames',
  'expected',
] as const);

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

const START_FIELDS = Object.freeze([
  'playerId',
  'feetPosition',
  'velocity',
  'yawMilliDegrees',
  'pitchMilliDegrees',
  'grounded',
  'stance',
  'selectedSlot',
] as const);

const EXPECTED_FIELDS = Object.freeze([
  'finalHash',
  'stateHashes',
  'events',
  'samples',
  'envelope',
  'measurements',
] as const);

const SAMPLE_FIELDS = Object.freeze([
  'authorityTick',
  'stateHash',
  'feetPosition',
  'velocity',
  'planarSpeedMmPerSecond',
  'grounded',
  'stance',
  'locomotion',
  'queries',
] as const);

const MEASUREMENT_FIELDS = Object.freeze([
  'speed90AttainmentTicks',
  'brakingToStopTicks',
  'jumpApexHeightGainMm',
  'jumpTimeToApexTicks',
  'jumpAirtimeTicks',
  'coyoteJumpWindowTicks',
  'bufferedJumpLeadTicks',
  'slideDurationTicks',
  'slideSpeedCurveMmPerSecond',
  'teleportActualDistanceMm',
  'teleportBackoffDistanceMm',
  'weaponReadyRecoveryMilliseconds',
] as const);

const EXPECTED_ENVELOPE_FIELDS = Object.freeze([
  'schemaVersion',
  'evidenceLabel',
  'initialTick',
  'finalTick',
  'tickCount',
  'elapsedMilliseconds',
  'planarDistanceTravelledMm',
  'spatialDistanceTravelledMm',
  'displacementMm',
  'minimumPlanarSpeedMmPerSecond',
  'maximumPlanarSpeedMmPerSecond',
  'minimumFeetHeightMm',
  'maximumFeetHeightMm',
  'apexHeightGainMm',
  'airborneTicks',
  'groundedTicks',
  'jumpCount',
  'bufferedJumpCount',
  'landingCount',
  'maximumLandingImpactSpeedMmPerSecond',
  'slideCount',
  'successfulTeleportCount',
  'rejectedTeleportCount',
  'queries',
] as const);

const QUERY_FIELDS = Object.freeze([
  'moveCapsuleCalls',
  'overlapCapsuleCalls',
  'castCapsuleCalls',
  'volumeCalls',
  'shapeCasts',
  'overlapTests',
  'contacts',
] as const);

const VECTOR_FIELDS = Object.freeze(['x', 'y', 'z'] as const);
const HASH_PATTERN = /^[a-f0-9]{16}(?:[a-f0-9]{48})?$/u;
const NOT_MEASURED_REASONS = new Set<PhysicsFixtureTapeNotMeasuredReason>([
  'scenario_not_exercised',
  'initial_velocity_not_zero',
  'result_not_observed',
  'weapon_ready_recovery_out_of_scope',
]);
const TAPE_ID_SET = new Set<string>(PHYSICS_FIXTURE_TAPE_IDS);
const FIXTURE_ID_SET = new Set<string>(PHYSICS_FIXTURE_IDS);
const PROFILE = PHASE3_HYPOTHESIS_MOVEMENT_PROFILE;
const EXPECTED_MOVEMENT_PROFILE_HASH = '8ab4ed437a4393c0' as const;
const EXPECTED_PHYSICS_ADAPTER_ID = 'rapier3d_deterministic_compat' as const;

if (hashMovementProfile(PROFILE) !== EXPECTED_MOVEMENT_PROFILE_HASH) {
  throw new Error('canonical physics fixture tape movement profile hash drifted');
}

function readDataRecord(
  value: unknown,
  label: string,
  fields: readonly string[],
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain data object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must have a plain object prototype`);
  }
  const allowed = new Set(fields);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
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
    snapshot[key] = descriptor.value;
  }
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(descriptors, field)) {
      throw new RangeError(`${label} is missing required field: ${field}`);
    }
  }
  return snapshot;
}

function readDenseArray(value: unknown, label: string, maximumLength: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new TypeError(`${label} must be a plain array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value) as unknown as Record<
    PropertyKey,
    PropertyDescriptor
  >;
  const lengthDescriptor = descriptors.length;
  if (
    lengthDescriptor === undefined
    || !Object.prototype.hasOwnProperty.call(lengthDescriptor, 'value')
    || !Number.isSafeInteger(lengthDescriptor.value)
    || (lengthDescriptor.value as number) < 0
    || (lengthDescriptor.value as number) > maximumLength
  ) {
    throw new RangeError(`${label} length is outside its supported range`);
  }
  const length = lengthDescriptor.value as number;
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined) throw new RangeError(`${label} must not be sparse`);
    if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new TypeError(`${label}[${index}] must be a data property, not an accessor`);
    }
    if (!descriptor.enumerable) {
      throw new TypeError(`${label}[${index}] must be enumerable`);
    }
    snapshot.push(descriptor.value);
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === 'length') continue;
    if (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(key) || Number(key) >= length) {
      throw new RangeError(`${label} contains unsupported field: ${String(key)}`);
    }
  }
  return snapshot;
}

function safeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be a safe integer`);
  return value as number;
}

function nonNegativeInteger(value: unknown, label: string): number {
  const integer = safeInteger(value, label);
  if (integer < 0) throw new RangeError(`${label} must be non-negative`);
  return integer;
}

function snapshotPosition(value: unknown, label: string): Vector3Millimeters {
  const vector = readDataRecord(value, label, VECTOR_FIELDS);
  return Object.freeze({
    x: asMillimeters(safeInteger(vector.x, `${label}.x`)),
    y: asMillimeters(safeInteger(vector.y, `${label}.y`)),
    z: asMillimeters(safeInteger(vector.z, `${label}.z`)),
  });
}

function snapshotVelocity(value: unknown, label: string): Vector3MillimetersPerSecond {
  const vector = readDataRecord(value, label, VECTOR_FIELDS);
  return Object.freeze({
    x: asMillimetersPerSecond(safeInteger(vector.x, `${label}.x`)),
    y: asMillimetersPerSecond(safeInteger(vector.y, `${label}.y`)),
    z: asMillimetersPerSecond(safeInteger(vector.z, `${label}.z`)),
  });
}

function snapshotIdentity(value: unknown): MovementSimulationIdentity {
  const identity = readDataRecord(value, 'physics fixture tape identity', IDENTITY_FIELDS);
  const snapshot = Object.freeze({
    rulesetId: identity.rulesetId as string,
    rulesetRevision: identity.rulesetRevision as number,
    rulesetHash: identity.rulesetHash as string,
    movementProfileId: identity.movementProfileId as string,
    movementProfileRevision: identity.movementProfileRevision as number,
    movementProfileHash: identity.movementProfileHash as string,
    fixtureId: identity.fixtureId as string,
    fixtureHash: identity.fixtureHash as string,
    physicsAdapterId: identity.physicsAdapterId as string,
    physicsAdapterVersion: identity.physicsAdapterVersion as string,
  });
  assertMovementSimulationIdentity(snapshot);
  return snapshot;
}

function snapshotStart(value: unknown): PhysicsFixtureTapeStartV1 {
  const start = readDataRecord(value, 'physics fixture tape start', START_FIELDS);
  const playerId = asEntityId(start.playerId as string);
  const yawMilliDegrees = safeInteger(start.yawMilliDegrees, 'physics fixture tape start yaw');
  const pitchMilliDegrees = safeInteger(start.pitchMilliDegrees, 'physics fixture tape start pitch');
  const selectedSlot = safeInteger(start.selectedSlot, 'physics fixture tape start selected slot');
  if (yawMilliDegrees < 0 || yawMilliDegrees >= 360_000) {
    throw new RangeError('physics fixture tape start yaw must be normalized');
  }
  if (pitchMilliDegrees < -89_000 || pitchMilliDegrees > 89_000) {
    throw new RangeError('physics fixture tape start pitch is outside the supported range');
  }
  if (typeof start.grounded !== 'boolean') {
    throw new TypeError('physics fixture tape start grounded must be a boolean');
  }
  if (start.stance !== 'standing' && start.stance !== 'crouched') {
    throw new RangeError('physics fixture tape start stance is unsupported');
  }
  if (selectedSlot < 0 || selectedSlot > 7) {
    throw new RangeError('physics fixture tape start selected slot is outside the supported range');
  }
  return Object.freeze({
    playerId,
    feetPosition: snapshotPosition(start.feetPosition, 'physics fixture tape start feet position'),
    velocity: snapshotVelocity(start.velocity, 'physics fixture tape start velocity'),
    yawMilliDegrees: asMilliDegrees(yawMilliDegrees),
    pitchMilliDegrees: asMilliDegrees(pitchMilliDegrees),
    grounded: start.grounded,
    stance: start.stance,
    selectedSlot: selectedSlot as PhysicsFixtureTapeStartV1['selectedSlot'],
  });
}

function deepFreezeData<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const descriptor of Object.values(descriptors)) {
    if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      deepFreezeData(descriptor.value);
    }
  }
  return Object.freeze(value);
}

function snapshotQueries(value: unknown): MovementQueryMetrics {
  const queries = readDataRecord(value, 'physics fixture tape expected queries', QUERY_FIELDS);
  return Object.freeze({
    moveCapsuleCalls: nonNegativeInteger(queries.moveCapsuleCalls, 'expected move calls'),
    overlapCapsuleCalls: nonNegativeInteger(queries.overlapCapsuleCalls, 'expected overlap calls'),
    castCapsuleCalls: nonNegativeInteger(queries.castCapsuleCalls, 'expected cast calls'),
    volumeCalls: nonNegativeInteger(queries.volumeCalls, 'expected volume calls'),
    shapeCasts: nonNegativeInteger(queries.shapeCasts, 'expected shape casts'),
    overlapTests: nonNegativeInteger(queries.overlapTests, 'expected overlap tests'),
    contacts: nonNegativeInteger(queries.contacts, 'expected contacts'),
  });
}

function snapshotMeasurement<T>(
  value: unknown,
  label: string,
  snapshotValue: (measuredValue: unknown, measuredLabel: string) => T,
): PhysicsFixtureTapeMeasurement<T> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a tagged data object`);
  }
  const statusDescriptor = Object.getOwnPropertyDescriptor(value, 'status');
  if (
    statusDescriptor === undefined
    || !Object.prototype.hasOwnProperty.call(statusDescriptor, 'value')
    || !statusDescriptor.enumerable
  ) {
    throw new TypeError(`${label}.status must be an enumerable data property`);
  }
  if (statusDescriptor.value === 'measured') {
    const measurement = readDataRecord(value, label, ['status', 'value']);
    return Object.freeze({
      status: 'measured',
      value: snapshotValue(measurement.value, `${label}.value`),
    });
  }
  if (statusDescriptor.value === 'not_measured') {
    const measurement = readDataRecord(value, label, ['status', 'value', 'reason']);
    if (measurement.value !== null) throw new RangeError(`${label}.value must be null`);
    if (
      typeof measurement.reason !== 'string'
      || !NOT_MEASURED_REASONS.has(measurement.reason as PhysicsFixtureTapeNotMeasuredReason)
    ) {
      throw new RangeError(`${label}.reason is unsupported`);
    }
    return Object.freeze({
      status: 'not_measured',
      value: null,
      reason: measurement.reason as PhysicsFixtureTapeNotMeasuredReason,
    });
  }
  throw new RangeError(`${label}.status is unsupported`);
}

function snapshotScalarMeasurement(
  value: unknown,
  label: string,
): PhysicsFixtureTapeMeasurement<number> {
  return snapshotMeasurement(value, label, (measuredValue, measuredLabel) => (
    nonNegativeInteger(measuredValue, measuredLabel)
  ));
}

function snapshotSpeedCurveMeasurement(
  value: unknown,
  label: string,
): PhysicsFixtureTapeMeasurement<readonly number[]> {
  return snapshotMeasurement(value, label, (measuredValue, measuredLabel) => Object.freeze(
    readDenseArray(measuredValue, measuredLabel, 10_000).map((speed, index) => (
      nonNegativeInteger(speed, `${measuredLabel}[${index}]`)
    )),
  ));
}

function snapshotMeasurements(value: unknown): PhysicsFixtureTapeMeasurementsV1 {
  const measurements = readDataRecord(
    value,
    'physics fixture tape expected measurements',
    MEASUREMENT_FIELDS,
  );
  return Object.freeze({
    speed90AttainmentTicks: snapshotScalarMeasurement(
      measurements.speed90AttainmentTicks,
      'expected 90 percent speed attainment',
    ),
    brakingToStopTicks: snapshotScalarMeasurement(
      measurements.brakingToStopTicks,
      'expected braking to stop',
    ),
    jumpApexHeightGainMm: snapshotScalarMeasurement(
      measurements.jumpApexHeightGainMm,
      'expected jump apex height gain',
    ),
    jumpTimeToApexTicks: snapshotScalarMeasurement(
      measurements.jumpTimeToApexTicks,
      'expected jump time to apex',
    ),
    jumpAirtimeTicks: snapshotScalarMeasurement(
      measurements.jumpAirtimeTicks,
      'expected jump airtime',
    ),
    coyoteJumpWindowTicks: snapshotScalarMeasurement(
      measurements.coyoteJumpWindowTicks,
      'expected coyote jump window',
    ),
    bufferedJumpLeadTicks: snapshotScalarMeasurement(
      measurements.bufferedJumpLeadTicks,
      'expected buffered jump lead',
    ),
    slideDurationTicks: snapshotScalarMeasurement(
      measurements.slideDurationTicks,
      'expected slide duration',
    ),
    slideSpeedCurveMmPerSecond: snapshotSpeedCurveMeasurement(
      measurements.slideSpeedCurveMmPerSecond,
      'expected slide speed curve',
    ),
    teleportActualDistanceMm: snapshotScalarMeasurement(
      measurements.teleportActualDistanceMm,
      'expected teleport actual distance',
    ),
    teleportBackoffDistanceMm: snapshotScalarMeasurement(
      measurements.teleportBackoffDistanceMm,
      'expected teleport backoff distance',
    ),
    weaponReadyRecoveryMilliseconds: snapshotScalarMeasurement(
      measurements.weaponReadyRecoveryMilliseconds,
      'expected weapon ready recovery',
    ),
  });
}

function snapshotStateHashes(value: unknown, frameCount: number): readonly string[] {
  const hashes = readDenseArray(value, 'physics fixture tape expected state hashes', frameCount + 1);
  if (hashes.length !== frameCount + 1) {
    throw new RangeError('physics fixture tape expected state hash count drifted');
  }
  return Object.freeze(hashes.map((hash, index) => {
    if (typeof hash !== 'string' || !HASH_PATTERN.test(hash) || /^0+$/u.test(hash)) {
      throw new RangeError(`physics fixture tape expected state hash ${index} is invalid`);
    }
    return hash;
  }));
}

function eventKind(value: unknown, label: string): string {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a data object`);
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, 'kind');
  if (
    descriptor === undefined
    || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    || !descriptor.enumerable
    || typeof descriptor.value !== 'string'
  ) {
    throw new TypeError(`${label}.kind must be an enumerable string data property`);
  }
  return descriptor.value;
}

function eventBase<K extends MovementSemanticEvent['kind']>(
  event: Readonly<Record<string, unknown>>,
  kind: K,
  label: string,
): { readonly kind: K; readonly tick: ReturnType<typeof asSimulationTick>; readonly entityId: EntityId } {
  return {
    kind,
    tick: asSimulationTick(nonNegativeInteger(event.tick, `${label}.tick`)),
    entityId: asEntityId(event.entityId as string),
  };
}

function snapshotEvent(value: unknown, index: number): MovementSemanticEvent {
  const label = `physics fixture tape expected event ${index}`;
  const kind = eventKind(value, label);
  const read = (extraFields: readonly string[]) => readDataRecord(
    value,
    label,
    ['kind', 'tick', 'entityId', ...extraFields],
  );
  switch (kind) {
    case 'movement_intent_applied': {
      const event = read(['sequence']);
      return Object.freeze({
        ...eventBase(event, kind, label),
        sequence: nonNegativeInteger(event.sequence, `${label}.sequence`),
      });
    }
    case 'movement_intent_rejected': {
      const event = read(['sequence', 'reason']);
      if (event.reason !== 'stale_sequence') throw new RangeError(`${label}.reason is unsupported`);
      return Object.freeze({
        ...eventBase(event, kind, label),
        sequence: nonNegativeInteger(event.sequence, `${label}.sequence`),
        reason: 'stale_sequence',
      });
    }
    case 'jumped': {
      const event = read(['buffered']);
      if (typeof event.buffered !== 'boolean') throw new TypeError(`${label}.buffered must be boolean`);
      return Object.freeze({ ...eventBase(event, kind, label), buffered: event.buffered });
    }
    case 'landed': {
      const event = read(['impactSpeedMmPerSecond']);
      return Object.freeze({
        ...eventBase(event, kind, label),
        impactSpeedMmPerSecond: nonNegativeInteger(
          event.impactSpeedMmPerSecond,
          `${label}.impactSpeedMmPerSecond`,
        ),
      });
    }
    case 'hit_ceiling':
    case 'stand_blocked':
    case 'slide_started': {
      const event = read([]);
      return Object.freeze(eventBase(event, kind, label));
    }
    case 'stance_changed': {
      const event = read(['stance']);
      if (event.stance !== 'standing' && event.stance !== 'crouched') {
        throw new RangeError(`${label}.stance is unsupported`);
      }
      return Object.freeze({ ...eventBase(event, kind, label), stance: event.stance });
    }
    case 'slide_ended': {
      const event = read(['reason']);
      if (event.reason !== 'duration' && event.reason !== 'airborne') {
        throw new RangeError(`${label}.reason is unsupported`);
      }
      return Object.freeze({ ...eventBase(event, kind, label), reason: event.reason });
    }
    case 'teleport_succeeded': {
      const event = read(['outcome', 'from', 'to']);
      if (event.outcome !== 'full' && event.outcome !== 'partial') {
        throw new RangeError(`${label}.outcome is unsupported`);
      }
      return Object.freeze({
        ...eventBase(event, kind, label),
        outcome: event.outcome,
        from: snapshotPosition(event.from, `${label}.from`),
        to: snapshotPosition(event.to, `${label}.to`),
      });
    }
    case 'teleport_rejected': {
      const event = read(['reason']);
      const reasons = new Set(['cooldown', 'blocked', 'forbidden_volume', 'kill_volume', 'no_ground']);
      if (typeof event.reason !== 'string' || !reasons.has(event.reason)) {
        throw new RangeError(`${label}.reason is unsupported`);
      }
      return Object.freeze({
        ...eventBase(event, kind, label),
        reason: event.reason as Extract<
          MovementSemanticEvent,
          { readonly kind: 'teleport_rejected' }
        >['reason'],
      });
    }
    case 'movement_volume_entered':
    case 'movement_volume_exited': {
      const event = read(['colliderId', 'volumeKind']);
      if (
        typeof event.colliderId !== 'string'
        || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/u.test(event.colliderId)
      ) {
        throw new RangeError(`${label}.colliderId is invalid`);
      }
      if (
        event.volumeKind !== 'kill'
        && event.volumeKind !== 'forbidden'
        && event.volumeKind !== 'recovery'
      ) {
        throw new RangeError(`${label}.volumeKind is unsupported`);
      }
      return Object.freeze({
        ...eventBase(event, kind, label),
        colliderId: event.colliderId,
        volumeKind: event.volumeKind,
      });
    }
    default:
      throw new RangeError(`${label}.kind is unsupported: ${kind}`);
  }
}

function snapshotEvents(value: unknown, frameCount: number): readonly MovementSemanticEvent[] {
  return Object.freeze(readDenseArray(
    value,
    'physics fixture tape expected events',
    Math.max(64, frameCount * 8),
  ).map((event, index) => snapshotEvent(event, index)));
}

function snapshotSamples(
  value: unknown,
  frameCount: number,
  stateHashes: readonly string[],
): readonly MovementReplaySample[] {
  const samples = readDenseArray(value, 'physics fixture tape expected samples', frameCount + 1);
  if (samples.length !== frameCount + 1) {
    throw new RangeError('physics fixture tape expected sample count drifted');
  }
  return Object.freeze(samples.map((sampleValue, index) => {
    const label = `physics fixture tape expected sample ${index}`;
    const sample = readDataRecord(sampleValue, label, SAMPLE_FIELDS);
    const authorityTick = asSimulationTick(nonNegativeInteger(sample.authorityTick, `${label}.tick`));
    if (authorityTick !== index) throw new RangeError(`${label}.tick is not sequential`);
    if (sample.stateHash !== stateHashes[index]) throw new RangeError(`${label}.stateHash drifted`);
    if (typeof sample.grounded !== 'boolean') throw new TypeError(`${label}.grounded must be boolean`);
    if (sample.stance !== 'standing' && sample.stance !== 'crouched') {
      throw new RangeError(`${label}.stance is unsupported`);
    }
    if (
      sample.locomotion !== 'grounded'
      && sample.locomotion !== 'airborne'
      && sample.locomotion !== 'sliding'
    ) {
      throw new RangeError(`${label}.locomotion is unsupported`);
    }
    return Object.freeze({
      authorityTick,
      stateHash: stateHashes[index] as string,
      feetPosition: snapshotPosition(sample.feetPosition, `${label}.feetPosition`),
      velocity: snapshotVelocity(sample.velocity, `${label}.velocity`),
      planarSpeedMmPerSecond: nonNegativeInteger(
        sample.planarSpeedMmPerSecond,
        `${label}.planarSpeedMmPerSecond`,
      ),
      grounded: sample.grounded,
      stance: sample.stance,
      locomotion: sample.locomotion,
      queries: snapshotQueries(sample.queries),
    });
  }));
}

function snapshotExpected(
  value: unknown,
  frameCount: number,
): PhysicsFixtureTapeExpectedV1 {
  const expected = readDataRecord(value, 'physics fixture tape expected result', EXPECTED_FIELDS);
  if (
    typeof expected.finalHash !== 'string'
    || !HASH_PATTERN.test(expected.finalHash)
    || /^0+$/u.test(expected.finalHash)
  ) {
    throw new RangeError('physics fixture tape expected final hash must be canonical hexadecimal');
  }
  const stateHashes = snapshotStateHashes(expected.stateHashes, frameCount);
  const events = snapshotEvents(expected.events, frameCount);
  const samples = snapshotSamples(expected.samples, frameCount, stateHashes);
  if (stateHashes[stateHashes.length - 1] !== expected.finalHash) {
    throw new RangeError('physics fixture tape expected final hash does not match its state hashes');
  }
  const envelope = readDataRecord(
    expected.envelope,
    'physics fixture tape expected envelope',
    EXPECTED_ENVELOPE_FIELDS,
  );
  if (envelope.schemaVersion !== MOVEMENT_REPLAY_ENVELOPE_SCHEMA_VERSION) {
    throw new RangeError('physics fixture tape expected envelope schema is unsupported');
  }
  if (envelope.evidenceLabel !== PROFILE.provenance.evidenceLabel) {
    throw new RangeError('physics fixture tape expected envelope evidence label drifted');
  }
  const initialTick = asSimulationTick(nonNegativeInteger(envelope.initialTick, 'expected initial tick'));
  const finalTick = asSimulationTick(nonNegativeInteger(envelope.finalTick, 'expected final tick'));
  const tickCount = nonNegativeInteger(envelope.tickCount, 'expected tick count');
  const elapsedMilliseconds = nonNegativeInteger(
    envelope.elapsedMilliseconds,
    'expected elapsed milliseconds',
  );
  if (
    initialTick !== 0
    || finalTick !== frameCount
    || tickCount !== frameCount
    || elapsedMilliseconds !== ticksToMilliseconds(asSimulationTick(frameCount), PROFILE.simulationRateHz)
  ) {
    throw new RangeError('physics fixture tape expected timing does not match its frames');
  }
  const airborneTicks = nonNegativeInteger(envelope.airborneTicks, 'expected airborne ticks');
  const groundedTicks = nonNegativeInteger(envelope.groundedTicks, 'expected grounded ticks');
  if (airborneTicks + groundedTicks !== frameCount) {
    throw new RangeError('physics fixture tape expected grounded tick accounting drifted');
  }
  return Object.freeze({
    finalHash: expected.finalHash,
    stateHashes,
    events,
    samples,
    envelope: Object.freeze({
      schemaVersion: MOVEMENT_REPLAY_ENVELOPE_SCHEMA_VERSION,
      evidenceLabel: PROFILE.provenance.evidenceLabel,
      initialTick,
      finalTick,
      tickCount,
      elapsedMilliseconds,
      planarDistanceTravelledMm: nonNegativeInteger(
        envelope.planarDistanceTravelledMm,
        'expected planar distance',
      ),
      spatialDistanceTravelledMm: nonNegativeInteger(
        envelope.spatialDistanceTravelledMm,
        'expected spatial distance',
      ),
      displacementMm: snapshotPosition(envelope.displacementMm, 'expected displacement'),
      minimumPlanarSpeedMmPerSecond: nonNegativeInteger(
        envelope.minimumPlanarSpeedMmPerSecond,
        'expected minimum planar speed',
      ),
      maximumPlanarSpeedMmPerSecond: nonNegativeInteger(
        envelope.maximumPlanarSpeedMmPerSecond,
        'expected maximum planar speed',
      ),
      minimumFeetHeightMm: safeInteger(envelope.minimumFeetHeightMm, 'expected minimum feet height'),
      maximumFeetHeightMm: safeInteger(envelope.maximumFeetHeightMm, 'expected maximum feet height'),
      apexHeightGainMm: nonNegativeInteger(envelope.apexHeightGainMm, 'expected apex height gain'),
      airborneTicks,
      groundedTicks,
      jumpCount: nonNegativeInteger(envelope.jumpCount, 'expected jump count'),
      bufferedJumpCount: nonNegativeInteger(
        envelope.bufferedJumpCount,
        'expected buffered jump count',
      ),
      landingCount: nonNegativeInteger(envelope.landingCount, 'expected landing count'),
      maximumLandingImpactSpeedMmPerSecond: nonNegativeInteger(
        envelope.maximumLandingImpactSpeedMmPerSecond,
        'expected maximum landing impact speed',
      ),
      slideCount: nonNegativeInteger(envelope.slideCount, 'expected slide count'),
      successfulTeleportCount: nonNegativeInteger(
        envelope.successfulTeleportCount,
        'expected successful teleport count',
      ),
      rejectedTeleportCount: nonNegativeInteger(
        envelope.rejectedTeleportCount,
        'expected rejected teleport count',
      ),
      queries: snapshotQueries(envelope.queries),
    }),
    measurements: snapshotMeasurements(expected.measurements),
  });
}

function initialStateFor(
  identity: MovementSimulationIdentity,
  start: PhysicsFixtureTapeStartV1,
): MovementSimulationState {
  const initialState = createMovementSimulationState(PROFILE, {
    rulesetId: identity.rulesetId,
    rulesetRevision: identity.rulesetRevision,
    rulesetHash: identity.rulesetHash,
    fixtureId: identity.fixtureId,
    fixtureHash: identity.fixtureHash,
    physicsAdapterId: identity.physicsAdapterId,
    physicsAdapterVersion: identity.physicsAdapterVersion,
    playerId: start.playerId,
    feetPosition: start.feetPosition,
    velocity: start.velocity,
    yawMilliDegrees: start.yawMilliDegrees,
    pitchMilliDegrees: start.pitchMilliDegrees,
    grounded: start.grounded,
    stance: start.stance,
    selectedSlot: start.selectedSlot,
  });
  for (const field of IDENTITY_FIELDS) {
    if (initialState.identity[field] !== identity[field]) {
      throw new RangeError(`physics fixture tape identity mismatch: ${field}`);
    }
  }
  return deepFreezeData(initialState);
}

export function loadPhysicsFixtureTape(value: unknown): PhysicsFixtureTapeV1 {
  const tape = readDataRecord(value, 'physics fixture tape', TAPE_FIELDS);
  if (tape.schemaVersion !== PHYSICS_FIXTURE_TAPE_SCHEMA_VERSION) {
    throw new RangeError(`unsupported physics fixture tape schema: ${String(tape.schemaVersion)}`);
  }
  if (typeof tape.id !== 'string' || !TAPE_ID_SET.has(tape.id)) {
    throw new RangeError(`unknown physics fixture tape id: ${String(tape.id)}`);
  }
  if (tape.movementReplaySchemaVersion !== MOVEMENT_REPLAY_SCHEMA_VERSION) {
    throw new RangeError('physics fixture tape replay schema drifted');
  }
  if (tape.movementStateSchemaVersion !== MOVEMENT_SIMULATION_STATE_SCHEMA_VERSION) {
    throw new RangeError('physics fixture tape movement state schema drifted');
  }
  if (tape.fixtureSchemaVersion !== PHYSICS_FIXTURE_SCHEMA_VERSION) {
    throw new RangeError('physics fixture tape fixture schema drifted');
  }
  if (tape.simulationRateHz !== PROFILE.simulationRateHz) {
    throw new RangeError('physics fixture tape simulation rate drifted');
  }

  const identity = snapshotIdentity(tape.identity);
  if (!FIXTURE_ID_SET.has(identity.fixtureId)) {
    throw new RangeError(`unknown physics fixture tape fixture: ${identity.fixtureId}`);
  }
  const fixture = getPhysicsFixture(identity.fixtureId as PhysicsFixtureId);
  if (identity.fixtureHash !== hashPhysicsFixture(fixture)) {
    throw new RangeError('physics fixture tape fixture hash drifted');
  }
  if (
    identity.movementProfileId !== PROFILE.id
    || identity.movementProfileRevision !== PROFILE.revision
    || identity.movementProfileHash !== EXPECTED_MOVEMENT_PROFILE_HASH
  ) {
    throw new RangeError('physics fixture tape movement profile identity drifted');
  }
  if (
    identity.physicsAdapterId !== EXPECTED_PHYSICS_ADAPTER_ID
    || identity.physicsAdapterVersion !== EXPECTED_RAPIER_VERSION
  ) {
    throw new RangeError('physics fixture tape adapter identity drifted');
  }

  const start = snapshotStart(tape.start);
  const initialState = initialStateFor(identity, start);
  const replay = createMovementReplay(initialState, tape.frames as readonly MovementReplayFrame[]);
  const expected = snapshotExpected(tape.expected, replay.frames.length);
  return Object.freeze({
    schemaVersion: PHYSICS_FIXTURE_TAPE_SCHEMA_VERSION,
    id: tape.id as PhysicsFixtureTapeId,
    movementReplaySchemaVersion: MOVEMENT_REPLAY_SCHEMA_VERSION,
    movementStateSchemaVersion: MOVEMENT_SIMULATION_STATE_SCHEMA_VERSION,
    fixtureSchemaVersion: PHYSICS_FIXTURE_SCHEMA_VERSION,
    simulationRateHz: PROFILE.simulationRateHz,
    identity,
    start,
    frames: replay.frames,
    expected,
  });
}

function intent(
  sequence: number,
  overrides: {
    readonly moveX?: number;
    readonly moveZ?: number;
    readonly lookYawDeltaMilliDegrees?: number;
    readonly lookPitchDeltaMilliDegrees?: number;
    readonly heldButtons?: number;
    readonly pressedButtons?: number;
    readonly releasedButtons?: number;
  } = {},
): Readonly<PlayerIntentCommand> {
  return Object.freeze({
    kind: 'player_intent',
    sequence,
    clientTick: asSimulationTick(sequence),
    moveX: asQuantizedAxis(overrides.moveX ?? 0),
    moveZ: asQuantizedAxis(overrides.moveZ ?? 0),
    lookYawDeltaMilliDegrees: overrides.lookYawDeltaMilliDegrees ?? 0,
    lookPitchDeltaMilliDegrees: overrides.lookPitchDeltaMilliDegrees ?? 0,
    heldButtons: overrides.heldButtons ?? 0,
    pressedButtons: overrides.pressedButtons ?? 0,
    releasedButtons: overrides.releasedButtons ?? 0,
  });
}

function frames(
  count: number,
  commandForIndex: (index: number) => Readonly<PlayerIntentCommand>,
): readonly MovementReplayFrame[] {
  return Object.freeze(Array.from({ length: count }, (_unused, index) => Object.freeze({
    authorityTick: asSimulationTick(index + 1),
    commands: Object.freeze([commandForIndex(index)]),
  })));
}

function flatRunFrames(): readonly MovementReplayFrame[] {
  return frames(48, (index) => {
    const axis = index < 12
      ? { moveX: 0, moveZ: 127 }
      : index < 24
        ? { moveX: 127, moveZ: 0 }
        : index < 36
          ? { moveX: 0, moveZ: -127 }
          : { moveX: -127, moveZ: 0 };
    const sprintHeld = index < 24;
    const jumpHeld = index === 6;
    return intent(index, {
      ...axis,
      heldButtons: (sprintHeld ? INTENT_BUTTON.sprint : 0)
        | (jumpHeld ? INTENT_BUTTON.jump : 0),
      pressedButtons: (index === 0 ? INTENT_BUTTON.sprint : 0)
        | (index === 6 ? INTENT_BUTTON.jump : 0),
      releasedButtons: (index === 7 ? INTENT_BUTTON.jump : 0)
        | (index === 24 ? INTENT_BUTTON.sprint : 0),
    });
  });
}

function bufferedJumpFrames(pressIndex: number): readonly MovementReplayFrame[] {
  return frames(10, (index) => {
    const jumpPressed = index === pressIndex;
    return intent(index, {
      heldButtons: jumpPressed ? INTENT_BUTTON.jump : 0,
      pressedButtons: jumpPressed ? INTENT_BUTTON.jump : 0,
    });
  });
}

function coyoteJumpFrames(pressIndex: number): readonly MovementReplayFrame[] {
  return frames(14, (index) => {
    const jumpPressed = index === pressIndex;
    return intent(index, {
      moveX: 127,
      heldButtons: INTENT_BUTTON.sprint | (jumpPressed ? INTENT_BUTTON.jump : 0),
      pressedButtons: jumpPressed ? INTENT_BUTTON.jump : 0,
    });
  });
}

function identity(fixtureId: PhysicsFixtureId, fixtureHash: string) {
  return {
    rulesetId: 'movement_fixture_lab',
    rulesetRevision: 1,
    rulesetHash: '3333333333333333',
    movementProfileId: PROFILE.id,
    movementProfileRevision: PROFILE.revision,
    movementProfileHash: EXPECTED_MOVEMENT_PROFILE_HASH,
    fixtureId,
    fixtureHash,
    physicsAdapterId: EXPECTED_PHYSICS_ADAPTER_ID,
    physicsAdapterVersion: EXPECTED_RAPIER_VERSION,
  };
}

function start(
  feetPosition: readonly [number, number, number],
  options: {
    readonly velocity?: readonly [number, number, number];
    readonly yawMilliDegrees?: number;
    readonly grounded?: boolean;
    readonly stance?: MovementStance;
  } = {},
) {
  const velocity = options.velocity ?? [0, 0, 0];
  return {
    playerId: 'local-player',
    feetPosition: { x: feetPosition[0], y: feetPosition[1], z: feetPosition[2] },
    velocity: { x: velocity[0], y: velocity[1], z: velocity[2] },
    yawMilliDegrees: options.yawMilliDegrees ?? 0,
    pitchMilliDegrees: 0,
    grounded: options.grounded ?? true,
    stance: options.stance ?? 'standing',
    selectedSlot: 0,
  };
}

function source(
  id: PhysicsFixtureTapeId,
  fixtureId: PhysicsFixtureId,
  fixtureHash: string,
  tapeStart: ReturnType<typeof start>,
  tapeFrames: readonly MovementReplayFrame[],
) {
  return {
    schemaVersion: PHYSICS_FIXTURE_TAPE_SCHEMA_VERSION,
    id,
    movementReplaySchemaVersion: MOVEMENT_REPLAY_SCHEMA_VERSION,
    movementStateSchemaVersion: MOVEMENT_SIMULATION_STATE_SCHEMA_VERSION,
    fixtureSchemaVersion: PHYSICS_FIXTURE_SCHEMA_VERSION,
    simulationRateHz: PROFILE.simulationRateHz,
    identity: identity(fixtureId, fixtureHash),
    start: tapeStart,
    frames: tapeFrames,
    expected: RECORDED_PHYSICS_FIXTURE_TAPE_RESULTS[id],
  };
}

const TAPE_SOURCES: readonly unknown[] = Object.freeze([
  source(
    'flat_run_fixed_20hz_v1',
    'flat_run',
    '44bfdf2fdced9d9c',
    start([0, 0, 0]),
    flatRunFrames(),
  ),
  source(
    'flat_run_accel_brake_20hz_v1',
    'flat_run',
    '44bfdf2fdced9d9c',
    start([0, 0, 0]),
    frames(16, (index) => intent(index, {
      moveZ: index < 8 ? 127 : 0,
      heldButtons: index < 8 ? INTENT_BUTTON.sprint : 0,
      pressedButtons: index === 0 ? INTENT_BUTTON.sprint : 0,
      releasedButtons: index === 8 ? INTENT_BUTTON.sprint : 0,
    })),
  ),
  source(
    'flat_run_buffer_accept_20hz_v1',
    'flat_run',
    '44bfdf2fdced9d9c',
    start([0, 800, 6_000], { grounded: false }),
    bufferedJumpFrames(3),
  ),
  source(
    'flat_run_buffer_reject_20hz_v1',
    'flat_run',
    '44bfdf2fdced9d9c',
    start([0, 800, 6_000], { grounded: false }),
    bufferedJumpFrames(2),
  ),
  source(
    'flat_run_coyote_accept_20hz_v1',
    'flat_run',
    '44bfdf2fdced9d9c',
    start([11_000, 0, 6_000]),
    coyoteJumpFrames(6),
  ),
  source(
    'flat_run_coyote_reject_20hz_v1',
    'flat_run',
    '44bfdf2fdced9d9c',
    start([11_000, 0, 6_000]),
    coyoteJumpFrames(7),
  ),
  source(
    'contact_lab_wall_20hz_v1',
    'contact_lab',
    '1f8d019f6f1ae372',
    start([0, 0, 0]),
    frames(28, (index) => intent(index, {
      moveX: index < 4 || index >= 8 ? 127 : 0,
    })),
  ),
  source(
    'contact_lab_diagonal_glance_20hz_v1',
    'contact_lab',
    '1f8d019f6f1ae372',
    start([-1_000, 0, 1_000]),
    frames(20, (index) => intent(index, { moveZ: 127 })),
  ),
  source(
    'contact_lab_corner_concave_20hz_v1',
    'contact_lab',
    '1f8d019f6f1ae372',
    start([-3_000, 0, -2_000]),
    frames(20, (index) => intent(index, { moveX: 127, moveZ: 127 })),
  ),
  source(
    'contact_lab_corner_convex_20hz_v1',
    'contact_lab',
    '1f8d019f6f1ae372',
    start([-500, 0, -2_000]),
    frames(20, (index) => intent(index, { moveX: -127, moveZ: 127 })),
  ),
  source(
    'contact_lab_doorway_exact_700_reject_20hz_v1',
    'contact_lab',
    '1f8d019f6f1ae372',
    start([-6_000, 0, 4_500]),
    frames(20, (index) => intent(index, { moveZ: index < 10 ? 127 : 0 })),
  ),
  source(
    'contact_lab_doorway_800_pass_20hz_v1',
    'contact_lab',
    '1f8d019f6f1ae372',
    start([6_000, 0, 4_500]),
    frames(8, (index) => intent(index, { moveZ: 127 })),
  ),
  source(
    'vertical_lab_steps_20hz_v1',
    'vertical_lab',
    'a9fc5809db86605e',
    start([-3_500, 0, 0]),
    frames(12, (index) => intent(index, { moveX: 127 })),
  ),
  source(
    'slide_lab_collision_20hz_v1',
    'slide_lab',
    '3cb2374d832e66a7',
    start([0, 0, 0], { velocity: [9_000, 0, 0] }),
    frames(12, (index) => intent(index, {
      moveX: 127,
      heldButtons: INTENT_BUTTON.crouch,
      pressedButtons: index === 0 ? INTENT_BUTTON.crouch : 0,
    })),
  ),
  source(
    'slide_lab_uphill_20hz_v1',
    'slide_lab',
    '3cb2374d832e66a7',
    start([3_000, 349, 3_000], { velocity: [9_000, 0, 0] }),
    // Six fixed ticks are the bounded authored-face window: every sample stays
    // supported by slide_uphill before the finite ramp edge is reached.
    frames(6, (index) => intent(index, {
      moveX: 127,
      heldButtons: INTENT_BUTTON.crouch,
      pressedButtons: index === 0 ? INTENT_BUTTON.crouch : 0,
    })),
  ),
  source(
    'slide_lab_downhill_20hz_v1',
    'slide_lab',
    '3cb2374d832e66a7',
    start([-3_000, 1_515, 2_200], { velocity: [5_000, 0, 5_000] }),
    // The diagonal route bounds X descent to the configured 150 mm snap while
    // remaining on slide_downhill for the complete six-tick tape.
    frames(6, (index) => intent(index, {
      moveX: 127,
      moveZ: 127,
      heldButtons: INTENT_BUTTON.crouch,
      pressedButtons: index === 0 ? INTENT_BUTTON.crouch : 0,
    })),
  ),
  source(
    'teleport_lab_thin_wall_20hz_v1',
    'teleport_lab',
    '4816a5ecd252b626',
    start([-3_000, 0, 0], { yawMilliDegrees: 90_000 }),
    frames(1, (index) => intent(index, {
      heldButtons: INTENT_BUTTON.utility,
      pressedButtons: INTENT_BUTTON.utility,
    })),
  ),
  source(
    'teleport_lab_blocked_20hz_v1',
    'teleport_lab',
    '4816a5ecd252b626',
    start([-375, 0, 0], { yawMilliDegrees: 90_000 }),
    frames(1, (index) => intent(index, {
      heldButtons: INTENT_BUTTON.utility,
      pressedButtons: INTENT_BUTTON.utility,
    })),
  ),
]);

const TAPES = new Map<PhysicsFixtureTapeId, PhysicsFixtureTapeV1>();
const mutableFixtureTapes = new Map<PhysicsFixtureId, PhysicsFixtureTapeV1[]>();
for (const tapeSource of TAPE_SOURCES) {
  const tape = loadPhysicsFixtureTape(tapeSource);
  if (TAPES.has(tape.id)) throw new Error(`duplicate physics fixture tape: ${tape.id}`);
  const fixtureId = tape.identity.fixtureId as PhysicsFixtureId;
  TAPES.set(tape.id, tape);
  const fixtureTapes = mutableFixtureTapes.get(fixtureId) ?? [];
  fixtureTapes.push(tape);
  mutableFixtureTapes.set(fixtureId, fixtureTapes);
}
for (const fixtureId of PHYSICS_FIXTURE_IDS) {
  if (!mutableFixtureTapes.has(fixtureId)) {
    throw new Error(`missing canonical tape for physics fixture: ${fixtureId}`);
  }
}
const FIXTURE_TAPES = new Map<PhysicsFixtureId, readonly PhysicsFixtureTapeV1[]>(
  PHYSICS_FIXTURE_IDS.map((fixtureId) => [
    fixtureId,
    Object.freeze([...(mutableFixtureTapes.get(fixtureId) ?? [])]),
  ]),
);

export function getPhysicsFixtureTape(id: PhysicsFixtureTapeId): PhysicsFixtureTapeV1 {
  const tape = TAPES.get(id);
  if (!tape) throw new RangeError(`Unknown physics fixture tape: ${id}`);
  return tape;
}

export function listPhysicsFixtureTapesForFixture(
  fixtureId: PhysicsFixtureId,
): readonly PhysicsFixtureTapeV1[] {
  const tapes = FIXTURE_TAPES.get(fixtureId);
  if (!tapes) throw new RangeError(`No canonical tapes for physics fixture: ${fixtureId}`);
  return tapes;
}

export function listPhysicsFixtureTapes(): readonly PhysicsFixtureTapeV1[] {
  return Object.freeze(PHYSICS_FIXTURE_TAPE_IDS.map((id) => getPhysicsFixtureTape(id)));
}

export function preparePhysicsFixtureTape(id: PhysicsFixtureTapeId): PreparedPhysicsFixtureTape {
  const tape = getPhysicsFixtureTape(id);
  const initialState = initialStateFor(tape.identity, tape.start);
  return Object.freeze({
    tape,
    initialState,
    replay: createMovementReplay(initialState, tape.frames),
  });
}

export async function runPhysicsFixtureTape(id: PhysicsFixtureTapeId): Promise<MovementReplayResult> {
  const prepared = preparePhysicsFixtureTape(id);
  const fixture = getPhysicsFixture(prepared.tape.identity.fixtureId as PhysicsFixtureId);
  const world = await createRapierMovementWorld(fixture);
  try {
    if (
      world.fixtureHash !== prepared.tape.identity.fixtureHash
      || world.runtime.version !== prepared.tape.identity.physicsAdapterVersion
    ) {
      throw new RangeError('physics fixture tape runtime identity drifted');
    }
    return runMovementReplay(
      prepared.initialState,
      prepared.replay,
      PROFILE,
      world,
    );
  } finally {
    world.dispose();
  }
}

function measured<T>(value: T): PhysicsFixtureTapeMeasurement<T> {
  return Object.freeze({ status: 'measured', value });
}

function notMeasured<T>(
  reason: PhysicsFixtureTapeNotMeasuredReason,
): PhysicsFixtureTapeMeasurement<T> {
  return Object.freeze({ status: 'not_measured', value: null, reason });
}

function frameCommand(frame: MovementReplayFrame): PlayerIntentCommand | null {
  if (frame.commands.length === 0) return null;
  return [...frame.commands].sort((left, right) => left.sequence - right.sequence).at(-1) ?? null;
}

function hasPlanarIntent(command: PlayerIntentCommand | null): boolean {
  return command !== null && (command.moveX !== 0 || command.moveZ !== 0);
}

function speed90Measurement(
  tape: PhysicsFixtureTapeV1,
  result: MovementReplayResult,
): PhysicsFixtureTapeMeasurement<number> {
  const initialSpeed = result.envelope.samples[0]?.planarSpeedMmPerSecond ?? 0;
  if (initialSpeed !== 0) return notMeasured('initial_velocity_not_zero');
  for (let frameIndex = 0; frameIndex < tape.frames.length; frameIndex += 1) {
    const command = frameCommand(tape.frames[frameIndex] as MovementReplayFrame);
    const previousCommand = frameIndex === 0
      ? null
      : frameCommand(tape.frames[frameIndex - 1] as MovementReplayFrame);
    if (command === null || !hasPlanarIntent(command) || hasPlanarIntent(previousCommand)) continue;
    const targetSpeed = (command.heldButtons & INTENT_BUTTON.crouch) !== 0
      ? PROFILE.locomotion.crouchSpeedMmPerSecond
      : (command.heldButtons & INTENT_BUTTON.sprint) !== 0
        ? PROFILE.locomotion.sprintSpeedMmPerSecond
        : PROFILE.locomotion.walkSpeedMmPerSecond;
    const threshold = Math.ceil((targetSpeed * 9) / 10);
    for (let candidateIndex = frameIndex; candidateIndex < tape.frames.length; candidateIndex += 1) {
      const candidateCommand = frameCommand(tape.frames[candidateIndex] as MovementReplayFrame);
      if (!hasPlanarIntent(candidateCommand)) break;
      const sample = result.envelope.samples[candidateIndex + 1];
      if (sample && sample.planarSpeedMmPerSecond >= threshold) {
        return measured(candidateIndex - frameIndex + 1);
      }
    }
    return notMeasured('result_not_observed');
  }
  return notMeasured('scenario_not_exercised');
}

function brakingMeasurement(
  tape: PhysicsFixtureTapeV1,
  result: MovementReplayResult,
): PhysicsFixtureTapeMeasurement<number> {
  for (let frameIndex = 1; frameIndex < tape.frames.length; frameIndex += 1) {
    const previousCommand = frameCommand(tape.frames[frameIndex - 1] as MovementReplayFrame);
    const command = frameCommand(tape.frames[frameIndex] as MovementReplayFrame);
    const speedBeforeRelease = result.envelope.samples[frameIndex]?.planarSpeedMmPerSecond ?? 0;
    if (!hasPlanarIntent(previousCommand) || hasPlanarIntent(command) || speedBeforeRelease === 0) {
      continue;
    }
    for (let candidateIndex = frameIndex; candidateIndex < tape.frames.length; candidateIndex += 1) {
      const candidateCommand = frameCommand(tape.frames[candidateIndex] as MovementReplayFrame);
      if (hasPlanarIntent(candidateCommand)) break;
      const sample = result.envelope.samples[candidateIndex + 1];
      if (sample?.planarSpeedMmPerSecond === 0) {
        return measured(candidateIndex - frameIndex + 1);
      }
    }
    return notMeasured('result_not_observed');
  }
  return notMeasured('scenario_not_exercised');
}

function jumpMeasurements(result: MovementReplayResult): {
  readonly apex: PhysicsFixtureTapeMeasurement<number>;
  readonly timeToApex: PhysicsFixtureTapeMeasurement<number>;
  readonly airtime: PhysicsFixtureTapeMeasurement<number>;
} {
  const jumps = result.events.filter((event) => event.kind === 'jumped');
  if (jumps.length === 0) {
    return {
      apex: notMeasured('scenario_not_exercised'),
      timeToApex: notMeasured('scenario_not_exercised'),
      airtime: notMeasured('scenario_not_exercised'),
    };
  }
  for (const jump of jumps) {
    const landing = result.events.find((event) => event.kind === 'landed' && event.tick > jump.tick);
    if (!landing || landing.kind !== 'landed') continue;
    const jumpSample = result.envelope.samples.find((sample) => sample.authorityTick === jump.tick);
    const takeoffSample = result.envelope.samples.find((sample) => (
      sample.authorityTick === jump.tick - 1
    ));
    if (!jumpSample || !takeoffSample) continue;
    const airborneSamples = result.envelope.samples.filter((sample) => (
      sample.authorityTick >= jump.tick && sample.authorityTick <= landing.tick
    ));
    const maximumHeight = airborneSamples.reduce<number>(
      (maximum, sample) => Math.max(maximum, sample.feetPosition.y),
      takeoffSample.feetPosition.y,
    );
    const firstApexSample = airborneSamples.find((sample) => (
      sample.feetPosition.y === maximumHeight
    ));
    if (!firstApexSample) continue;
    return {
      apex: measured(maximumHeight - takeoffSample.feetPosition.y),
      // The takeoff reference is the last pre-jump sample. This preserves the
      // full fixed interval consumed by the jump transition itself.
      timeToApex: measured(firstApexSample.authorityTick - takeoffSample.authorityTick),
      // Airtime is the number of fixed authority intervals from the jump
      // transition to the landing transition: landingTick - jumpTick.
      airtime: measured(landing.tick - jump.tick),
    };
  }
  return {
    apex: notMeasured('result_not_observed'),
    timeToApex: notMeasured('result_not_observed'),
    airtime: notMeasured('result_not_observed'),
  };
}

function coyoteMeasurement(
  tape: PhysicsFixtureTapeV1,
  result: MovementReplayResult,
): PhysicsFixtureTapeMeasurement<number> {
  for (const event of result.events) {
    if (event.kind !== 'jumped' || event.buffered) continue;
    const previousSample = result.envelope.samples.find((sample) => (
      sample.authorityTick === event.tick - 1
    ));
    if (!previousSample || previousSample.grounded) continue;
    const lastGrounded = [...result.envelope.samples]
      .reverse()
      .find((sample) => sample.authorityTick < event.tick && sample.grounded);
    if (lastGrounded) {
      // The transition from the last grounded sample to the first airborne
      // sample consumes one fixed interval. Report only the subsequent airborne
      // grace intervals so the literal measurement matches coyoteTicks.
      return measured(Math.max(0, event.tick - lastGrounded.authorityTick - 1));
    }
  }
  const airbornePress = tape.frames.some((frame, frameIndex) => (
    frame.commands.some((command) => (command.pressedButtons & INTENT_BUTTON.jump) !== 0)
    && result.envelope.samples[frameIndex]?.grounded === false
  ));
  return notMeasured(airbornePress ? 'result_not_observed' : 'scenario_not_exercised');
}

function bufferedJumpMeasurement(
  tape: PhysicsFixtureTapeV1,
  result: MovementReplayResult,
): PhysicsFixtureTapeMeasurement<number> {
  const bufferedJump = result.events.find((event) => event.kind === 'jumped' && event.buffered);
  if (!bufferedJump || bufferedJump.kind !== 'jumped') {
    const pressed = tape.frames.some((frame) => frame.commands.some((command) => (
      (command.pressedButtons & INTENT_BUTTON.jump) !== 0
    )));
    return notMeasured(pressed ? 'result_not_observed' : 'scenario_not_exercised');
  }
  const pressFrame = [...tape.frames]
    .reverse()
    .find((frame) => (
      frame.authorityTick <= bufferedJump.tick
      && frame.commands.some((command) => (command.pressedButtons & INTENT_BUTTON.jump) !== 0)
    ));
  return pressFrame
    ? measured(bufferedJump.tick - pressFrame.authorityTick)
    : notMeasured('result_not_observed');
}

function slideMeasurements(result: MovementReplayResult): {
  readonly duration: PhysicsFixtureTapeMeasurement<number>;
  readonly speedCurve: PhysicsFixtureTapeMeasurement<readonly number[]>;
} {
  const started = result.events.find((event) => event.kind === 'slide_started');
  if (!started || started.kind !== 'slide_started') {
    return {
      duration: notMeasured('scenario_not_exercised'),
      speedCurve: notMeasured('scenario_not_exercised'),
    };
  }
  const ended = result.events.find((event) => event.kind === 'slide_ended' && event.tick >= started.tick);
  if (!ended || ended.kind !== 'slide_ended') {
    return {
      duration: notMeasured('result_not_observed'),
      speedCurve: notMeasured('result_not_observed'),
    };
  }
  const speedCurve = Object.freeze(result.envelope.samples
    .filter((sample) => sample.authorityTick >= started.tick && sample.authorityTick <= ended.tick)
    .map((sample) => sample.planarSpeedMmPerSecond));
  return {
    duration: measured(ended.tick - started.tick + 1),
    speedCurve: measured(speedCurve),
  };
}

function teleportMeasurements(
  tape: PhysicsFixtureTapeV1,
  result: MovementReplayResult,
): {
  readonly actual: PhysicsFixtureTapeMeasurement<number>;
  readonly backoff: PhysicsFixtureTapeMeasurement<number>;
} {
  const succeeded = result.events.find((event) => event.kind === 'teleport_succeeded');
  if (succeeded && succeeded.kind === 'teleport_succeeded') {
    const actualDistance = planarLength(
      succeeded.to.x - succeeded.from.x,
      succeeded.to.z - succeeded.from.z,
    );
    return {
      actual: measured(actualDistance),
      backoff: measured(Math.max(0, PROFILE.teleport.maximumRangeMm - actualDistance)),
    };
  }
  const attempted = tape.frames.some((frame) => frame.commands.some((command) => (
    (command.pressedButtons & INTENT_BUTTON.utility) !== 0
  )));
  return {
    actual: notMeasured(attempted ? 'result_not_observed' : 'scenario_not_exercised'),
    backoff: notMeasured(attempted ? 'result_not_observed' : 'scenario_not_exercised'),
  };
}

function measurementsFor(
  tape: PhysicsFixtureTapeV1,
  result: MovementReplayResult,
): PhysicsFixtureTapeMeasurementsV1 {
  const jump = jumpMeasurements(result);
  const slide = slideMeasurements(result);
  const teleport = teleportMeasurements(tape, result);
  return Object.freeze({
    speed90AttainmentTicks: speed90Measurement(tape, result),
    brakingToStopTicks: brakingMeasurement(tape, result),
    jumpApexHeightGainMm: jump.apex,
    jumpTimeToApexTicks: jump.timeToApex,
    jumpAirtimeTicks: jump.airtime,
    coyoteJumpWindowTicks: coyoteMeasurement(tape, result),
    bufferedJumpLeadTicks: bufferedJumpMeasurement(tape, result),
    slideDurationTicks: slide.duration,
    slideSpeedCurveMmPerSecond: slide.speedCurve,
    teleportActualDistanceMm: teleport.actual,
    teleportBackoffDistanceMm: teleport.backoff,
    weaponReadyRecoveryMilliseconds: notMeasured<number>(
      'weapon_ready_recovery_out_of_scope',
    ),
  });
}

export function summarizePhysicsFixtureTapeResult(
  tape: PhysicsFixtureTapeV1,
  result: MovementReplayResult,
): PhysicsFixtureTapeExpectedV1 {
  const stateHashes = snapshotStateHashes(result.stateHashes, tape.frames.length);
  return Object.freeze({
    finalHash: result.finalHash,
    stateHashes,
    events: snapshotEvents(result.events, tape.frames.length),
    samples: snapshotSamples(result.envelope.samples, tape.frames.length, stateHashes),
    envelope: Object.freeze({
      schemaVersion: result.envelope.schemaVersion,
      evidenceLabel: result.envelope.evidenceLabel,
      initialTick: result.envelope.initialTick,
      finalTick: result.envelope.finalTick,
      tickCount: result.envelope.tickCount,
      elapsedMilliseconds: result.envelope.elapsedMilliseconds,
      planarDistanceTravelledMm: result.envelope.planarDistanceTravelledMm,
      spatialDistanceTravelledMm: result.envelope.spatialDistanceTravelledMm,
      displacementMm: Object.freeze({ ...result.envelope.displacementMm }),
      minimumPlanarSpeedMmPerSecond: result.envelope.minimumPlanarSpeedMmPerSecond,
      maximumPlanarSpeedMmPerSecond: result.envelope.maximumPlanarSpeedMmPerSecond,
      minimumFeetHeightMm: result.envelope.minimumFeetHeightMm,
      maximumFeetHeightMm: result.envelope.maximumFeetHeightMm,
      apexHeightGainMm: result.envelope.apexHeightGainMm,
      airborneTicks: result.envelope.airborneTicks,
      groundedTicks: result.envelope.groundedTicks,
      jumpCount: result.envelope.jumpCount,
      bufferedJumpCount: result.envelope.bufferedJumpCount,
      landingCount: result.envelope.landingCount,
      maximumLandingImpactSpeedMmPerSecond:
        result.envelope.maximumLandingImpactSpeedMmPerSecond,
      slideCount: result.envelope.slideCount,
      successfulTeleportCount: result.envelope.successfulTeleportCount,
      rejectedTeleportCount: result.envelope.rejectedTeleportCount,
      queries: Object.freeze({ ...result.envelope.queries }),
    }),
    measurements: measurementsFor(tape, result),
  });
}

export function assertPhysicsFixtureTapeResult(
  tapeOrId: PhysicsFixtureTapeV1 | PhysicsFixtureTapeId,
  result: MovementReplayResult,
): void {
  const tape = typeof tapeOrId === 'string' ? getPhysicsFixtureTape(tapeOrId) : tapeOrId;
  assertMovementSimulationIdentity(result.finalState.identity);
  for (const field of IDENTITY_FIELDS) {
    if (result.finalState.identity[field] !== tape.identity[field]) {
      throw new Error(`PHYSICS_FIXTURE_TAPE_IDENTITY_DRIFT:${field}`);
    }
  }
  if (
    result.stateHashes.length !== tape.frames.length + 1
    || result.envelope.samples.length !== tape.frames.length + 1
  ) {
    throw new Error('PHYSICS_FIXTURE_TAPE_TRACE_LENGTH_DRIFT');
  }
  const actual = summarizePhysicsFixtureTapeResult(tape, result);
  if (JSON.stringify(actual) !== JSON.stringify(tape.expected)) {
    throw new Error(
      `PHYSICS_FIXTURE_TAPE_RESULT_DRIFT:${tape.id}\nexpected=${JSON.stringify(tape.expected)}\nactual=${JSON.stringify(actual)}`,
    );
  }
}
