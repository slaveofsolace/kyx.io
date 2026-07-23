import type {
  MapAuthorityVolumeV1,
  MapVector3Millimeters,
  MapZoneV1,
} from '../../content/maps';
import type { LoadedRuntimeMapPackage } from '../../physics';
import {
  INKFALL_AUTHORITY_MAP_IDENTITIES,
  findInkfallAuthorityMapIdentity,
  type InkfallAuthorityMapIdentity,
} from '../inkfallMapIdentity';
import { FixtureAuthorityLineOfSight } from '../spawn';
import {
  INKFALL_ROUTE_TELEMETRY_CONTRACTS,
  INKFALL_TELEMETRY_AUTHORITY_RATE_HZ,
  INKFALL_TELEMETRY_FIXTURE_HASH,
  INKFALL_TELEMETRY_HEAT_CELL_MM,
  INKFALL_TELEMETRY_MAP_ID,
  INKFALL_TELEMETRY_MAP_REVISION,
  INKFALL_TELEMETRY_PACKAGE_DIGEST,
  INKFALL_TELEMETRY_SCHEMA_VERSION,
  INKFALL_TELEMETRY_TICK_MILLISECONDS,
  type InkfallDamageCauseClass,
  type InkfallMovementMode,
  type InkfallRouteTelemetryContract,
  type InkfallTelemetryEventKind,
  type InkfallTelemetrySnapshotV1,
  type StoredInkfallTelemetryEvent,
  type TelemetryHeatCell,
} from './schema';

const MAX_AUTHORITY_TICK = Math.floor(Number.MAX_SAFE_INTEGER / INKFALL_TELEMETRY_TICK_MILLISECONDS);
const MAX_EVENT_SEQUENCE = Number.MAX_SAFE_INTEGER;
const MAX_ACTOR_SLOT = 63;
const MAX_TEAM_SLOT = 15;
const MAX_OBJECTIVE_SLOT = 15;
const MAX_DAMAGE_POINTS = 1_000_000;
const MAX_BATCH_EVENTS = 64;
const MIN_BUFFER_CAPACITY = 4;
const MAX_BUFFER_CAPACITY = 4_096;
const DEFAULT_BUFFER_CAPACITY = 256;
const MAX_SNAPSHOT_DEPTH = 20;
const MAX_ARRAY_LENGTH = 512;
const MAX_OBJECT_FIELDS = 64;
const SIGHTLINE_DISTANCE_BAND_MM = 5_000;
const STANDING_EYE_HEIGHT_MM = 1_650;
const CROUCHED_EYE_HEIGHT_MM = 1_000;
const DECISION_HASH = /^[0-9a-f]{16}$/u;

type UnknownRecord = Record<string, unknown>;

interface TelemetryValidationIssue {
  readonly path: string;
  readonly message: string;
}

interface MutableRouteMetrics {
  samples: number;
  completed: number;
  aborted: number;
  totalTraversalTicks: number;
  minimumTraversalTicks: number;
  maximumTraversalTicks: number;
}

interface MutableSpawnMetrics {
  choices: number;
  results: number;
  deathOutcomes: number;
  totalObservationTicks: number;
}

interface MutableCombatZoneMetrics {
  damageEvents: number;
  damagePoints: number;
  deaths: number;
}

interface MutableExposureMetrics {
  samples: number;
  directSamples: number;
  totalExposureTicks: number;
}

interface MutableOccupancyZoneMetrics {
  samples: number;
  totalOccupants: number;
  peakOccupants: number;
}

interface MutableHeatMetrics {
  location: TelemetryHeatCell;
  occupancySamples: number;
  damagePoints: number;
  deaths: number;
  exposureTicks: number;
  objectivePressurePermille: number;
  volumeEvents: number;
}

interface MutableObjectiveMetrics {
  samples: number;
  totalPressurePermille: number;
  peakPressurePermille: number;
}

interface MutableVolumeMetrics {
  recoveryEntered: number;
  recoveryCompleted: number;
  killEntered: number;
  killed: number;
}

interface AggregationState {
  readonly totalsByKind: Record<InkfallTelemetryEventKind, number>;
  readonly arrangementSamples: {
    twoPlayers: number;
    fourPlayers: number;
    eightPlayers: number;
    other: number;
  };
  readonly routes: Map<string, MutableRouteMetrics>;
  readonly spawns: Map<string, MutableSpawnMetrics>;
  readonly combatZones: Map<string, MutableCombatZoneMetrics>;
  readonly exposures: Map<string, MutableExposureMetrics>;
  readonly occupancyZones: Map<string, MutableOccupancyZoneMetrics>;
  readonly heatCells: Map<string, MutableHeatMetrics>;
  readonly objectives: Map<number, MutableObjectiveMetrics>;
  readonly volumes: Map<string, MutableVolumeMetrics>;
  noSafeSpawnEvents: number;
}

export class InkfallTelemetryValidationError extends Error {
  readonly issues: readonly TelemetryValidationIssue[];

  constructor(issues: readonly TelemetryValidationIssue[]) {
    super(issues.map(({ path, message }) => `${path}: ${message}`).join('\n'));
    this.name = 'InkfallTelemetryValidationError';
    this.issues = issues;
  }
}

class ValidationAbort extends Error {
  readonly issue: TelemetryValidationIssue;

  constructor(path: string, message: string) {
    super(message);
    this.issue = { path, message };
  }
}

function abort(path: string, message: string): never {
  throw new ValidationAbort(path, message);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function snapshotUntrusted(
  value: unknown,
  path = '$',
  depth = 0,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number'
    || typeof value === 'boolean') return value;
  if (typeof value !== 'object') abort(path, 'Expected JSON-compatible data.');
  if (depth > MAX_SNAPSHOT_DEPTH) abort(path, 'Telemetry input nesting is too deep.');
  if (seen.has(value)) abort(path, 'Cycles and aliased object references are not allowed.');
  seen.add(value);
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  let symbols: symbol[];
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    symbols = Object.getOwnPropertySymbols(value);
  } catch {
    abort(path, 'Telemetry input could not be inspected safely.');
  }
  if (symbols.length > 0) abort(path, 'Symbol fields are not allowed.');
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) abort(path, 'Expected a plain array.');
    const length = descriptors.length?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_ARRAY_LENGTH) {
      abort(path, 'Array length is invalid or exceeds the telemetry limit.');
    }
    const allowed = new Set(['length', ...Array.from({ length }, (_, index) => String(index))]);
    const named = Object.keys(descriptors).find((key) => !allowed.has(key));
    if (named) abort(`${path}.${named}`, 'Named array fields are not allowed.');
    const result: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !('value' in descriptor)) {
        abort(`${path}[${index}]`, 'Sparse arrays and accessors are not allowed.');
      }
      result.push(snapshotUntrusted(descriptor.value, `${path}[${index}]`, depth + 1, seen));
    }
    return result;
  }
  if (prototype !== Object.prototype && prototype !== null) abort(path, 'Expected a plain object.');
  const keys = Object.keys(descriptors);
  if (keys.length > MAX_OBJECT_FIELDS) abort(path, 'Object has too many fields.');
  const result: UnknownRecord = Object.create(null) as UnknownRecord;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      abort(`${path}.${key}`, 'Non-enumerable fields and accessors are not allowed.');
    }
    result[key] = snapshotUntrusted(descriptor.value, `${path}.${key}`, depth + 1, seen);
  }
  return result;
}

function record(value: unknown, path: string, expected: readonly string[]): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    abort(path, 'Expected an object.');
  }
  const result = value as UnknownRecord;
  const unknown = Object.keys(result).find((key) => !expected.includes(key));
  if (unknown) abort(`${path}.${unknown}`, 'Unknown telemetry field.');
  const missing = expected.find((key) => !(key in result));
  if (missing) abort(`${path}.${missing}`, 'Required telemetry field is missing.');
  return result;
}

function array(value: unknown, path: string, minimum: number, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    abort(path, `Expected an array with ${minimum} through ${maximum} entries.`);
  }
  return value;
}

function integer(value: unknown, path: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    abort(path, `Expected an integer from ${minimum} through ${maximum}.`);
  }
  return value as number;
}

function nullableInteger(value: unknown, path: string, minimum: number, maximum: number): number | null {
  return value === null ? null : integer(value, path, minimum, maximum);
}

function literal<T extends string | number>(value: unknown, path: string, expected: T): T {
  if (value !== expected) abort(path, `Expected ${String(expected)}.`);
  return expected;
}

function oneOf<T extends string>(value: unknown, path: string, expected: readonly T[]): T {
  if (typeof value !== 'string' || !expected.includes(value as T)) {
    abort(path, `Expected one of: ${expected.join(', ')}.`);
  }
  return value as T;
}

function semanticId(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length > 96
    || !/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(value)) {
    abort(path, 'Expected a bounded semantic identifier.');
  }
  return value;
}

function vector(value: unknown, path: string): MapVector3Millimeters {
  const input = record(value, path, ['x', 'y', 'z']);
  return Object.freeze({
    x: integer(input.x, `${path}.x`, -1_000_000, 1_000_000),
    y: integer(input.y, `${path}.y`, -1_000_000, 1_000_000),
    z: integer(input.z, `${path}.z`, -1_000_000, 1_000_000),
  });
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function checkedAdd(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result)) throw new Error(`TELEMETRY_AGGREGATE_OVERFLOW ${label}`);
  return result;
}

function fnv1a64(source: string): string {
  let hash = 0xcbf29ce484222325n;
  const encoded = new TextEncoder().encode(source);
  for (const byte of encoded) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function emptyTotals(): Record<InkfallTelemetryEventKind, number> {
  return {
    route_traversal: 0,
    spawn_choice: 0,
    spawn_result: 0,
    no_safe_spawn: 0,
    damage_location: 0,
    death_location: 0,
    sightline_exposure: 0,
    occupancy_sample: 0,
    objective_pressure: 0,
    authority_volume: 0,
  };
}

function emptyAggregation(): AggregationState {
  return {
    totalsByKind: emptyTotals(),
    arrangementSamples: { twoPlayers: 0, fourPlayers: 0, eightPlayers: 0, other: 0 },
    routes: new Map(),
    spawns: new Map(),
    combatZones: new Map(),
    exposures: new Map(),
    occupancyZones: new Map(),
    heatCells: new Map(),
    objectives: new Map(),
    volumes: new Map(),
    noSafeSpawnEvents: 0,
  };
}

function cloneMap<T extends object>(source: ReadonlyMap<string, T>): Map<string, T> {
  return new Map([...source].map(([key, value]) => [key, { ...value }] as [string, T]));
}

function cloneAggregation(source: AggregationState): AggregationState {
  return {
    totalsByKind: { ...source.totalsByKind },
    arrangementSamples: { ...source.arrangementSamples },
    routes: cloneMap(source.routes),
    spawns: cloneMap(source.spawns),
    combatZones: cloneMap(source.combatZones),
    exposures: cloneMap(source.exposures),
    occupancyZones: cloneMap(source.occupancyZones),
    heatCells: new Map([...source.heatCells].map(([key, value]) => [key, {
      ...value,
      location: value.location,
    }])),
    objectives: new Map([...source.objectives].map(([key, value]) => [key, { ...value }])),
    volumes: cloneMap(source.volumes),
    noSafeSpawnEvents: source.noSafeSpawnEvents,
  };
}

function eventId(mapRevision: number, authorityTick: number, sequence: number): string {
  return `${INKFALL_TELEMETRY_MAP_ID}.r${mapRevision}`
    + `.t${String(authorityTick).padStart(16, '0')}`
    + `.s${String(sequence).padStart(16, '0')}`;
}

function commonEvent<Kind extends InkfallTelemetryEventKind, Payload>(
  identity: InkfallAuthorityMapIdentity,
  authorityTick: number,
  eventSequence: number,
  kind: Kind,
  payload: Payload,
) {
  return deepFreeze({
    schemaVersion: 1 as const,
    eventId: eventId(identity.mapRevision, authorityTick, eventSequence),
    eventSequence,
    authorityTick,
    elapsedAuthorityMilliseconds: authorityTick * INKFALL_TELEMETRY_TICK_MILLISECONDS,
    kind,
    mapId: INKFALL_TELEMETRY_MAP_ID,
    mapRevision: identity.mapRevision,
    packageDigest: identity.packageDigest,
    fixtureHash: identity.fixtureHash,
    producer: 'authority_runtime' as const,
    outcomeAuthority: 'server_resolved' as const,
    payload,
  });
}

export class InkfallAuthorityTelemetry {
  private readonly loaded: LoadedRuntimeMapPackage;
  private readonly identity: InkfallAuthorityMapIdentity;
  private readonly lineOfSight: FixtureAuthorityLineOfSight;
  private readonly zones: ReadonlyMap<string, MapZoneV1>;
  private readonly spawnIds: ReadonlySet<string>;
  private readonly volumes: ReadonlyMap<string, MapAuthorityVolumeV1>;
  private readonly colliderIds: ReadonlySet<string>;
  private readonly routeContracts: ReadonlyMap<string, InkfallRouteTelemetryContract>;
  private readonly retainedEventCapacity: number;
  private events: readonly StoredInkfallTelemetryEvent[] = Object.freeze([]);
  private aggregation: AggregationState = emptyAggregation();
  private acceptedEvents = 0;
  private evictedEvents = 0;
  private lastEventSequence: number | null = null;
  private lastAuthorityTick: number | null = null;

  constructor(loaded: LoadedRuntimeMapPackage, options: unknown = {}) {
    const identity = findInkfallAuthorityMapIdentity(loaded.identity.revision);
    if (!identity
      || loaded.identity.id !== INKFALL_TELEMETRY_MAP_ID
      || loaded.identity.packageDigest !== identity.packageDigest
      || loaded.authority.fixtureHash !== identity.fixtureHash
      || loaded.authority.fixture.solids.length !== identity.colliderCardinality
      || loaded.manifest.authority.renderMeshesMayBeAuthority !== false) {
      throw new Error('TELEMETRY_MAP_IDENTITY_MISMATCH');
    }
    let copiedOptions: unknown;
    try {
      copiedOptions = snapshotUntrusted(options, '$options');
      const optionKeys = copiedOptions !== null && typeof copiedOptions === 'object'
        && !Array.isArray(copiedOptions)
        ? Object.keys(copiedOptions)
        : [];
      const parsed = record(copiedOptions, '$options', optionKeys.length === 0
        ? []
        : ['retainedEventCapacity']);
      this.retainedEventCapacity = parsed.retainedEventCapacity === undefined
        ? DEFAULT_BUFFER_CAPACITY
        : integer(
          parsed.retainedEventCapacity,
          '$options.retainedEventCapacity',
          MIN_BUFFER_CAPACITY,
          MAX_BUFFER_CAPACITY,
        );
    } catch (error) {
      if (error instanceof ValidationAbort) {
        throw new InkfallTelemetryValidationError(Object.freeze([error.issue]));
      }
      throw error;
    }
    this.loaded = loaded;
    this.identity = identity;
    this.lineOfSight = new FixtureAuthorityLineOfSight(loaded.authority.fixture);
    this.zones = new Map(loaded.manifest.zones.map((zone) => [zone.id, zone]));
    this.spawnIds = new Set(loaded.manifest.spawns.map(({ id }) => id));
    this.volumes = new Map(loaded.manifest.authorityVolumes.map((volume) => [volume.id, volume]));
    this.colliderIds = new Set(loaded.authority.fixture.solids.map(({ id }) => id));
    this.routeContracts = new Map(INKFALL_ROUTE_TELEMETRY_CONTRACTS.map((route) => [route.id, route]));
    if (this.zones.size !== 9 || this.spawnIds.size !== 12 || this.volumes.size !== 2
      || this.routeContracts.size !== 27
      || this.colliderIds.size !== identity.colliderCardinality) {
      throw new Error('TELEMETRY_BOUND_CARDINALITY_MISMATCH');
    }
    for (const route of this.routeContracts.values()) {
      if (!this.zones.has(route.fromZoneId) || !this.zones.has(route.toZoneId)) {
        throw new Error(`TELEMETRY_ROUTE_ZONE_MISSING ${route.id}`);
      }
    }
  }

  private assertPositionInBounds(position: MapVector3Millimeters, path: string): void {
    const { minimum, maximum } = this.loaded.identity.boundsMm;
    for (const axis of ['x', 'y', 'z'] as const) {
      if (position[axis] < minimum[axis] || position[axis] > maximum[axis]) {
        abort(`${path}.${axis}`, 'Authority position is outside the bound map package.');
      }
    }
  }

  private zone(value: unknown, path: string): MapZoneV1 {
    const id = semanticId(value, path);
    const zone = this.zones.get(id);
    if (!zone) abort(path, 'Unknown Inkfall zone.');
    return zone;
  }

  private positionInZone(
    value: unknown,
    zone: MapZoneV1,
    path: string,
  ): MapVector3Millimeters {
    const position = vector(value, path);
    this.assertPositionInBounds(position, path);
    for (const axis of ['x', 'y', 'z'] as const) {
      if (Math.abs(position[axis] - zone.centerMm[axis]) > zone.halfExtentsMm[axis]) {
        abort(path, `Authority position is outside declared zone ${zone.id}.`);
      }
    }
    return position;
  }

  private heatCell(position: MapVector3Millimeters, zoneId: string | null): TelemetryHeatCell {
    const { minimum, maximum } = this.loaded.identity.boundsMm;
    const component = (axis: 'x' | 'y' | 'z') => {
      const cellSize = INKFALL_TELEMETRY_HEAT_CELL_MM[axis];
      const count = Math.ceil((maximum[axis] - minimum[axis]) / cellSize);
      return Math.max(0, Math.min(count - 1, Math.floor((position[axis] - minimum[axis]) / cellSize)));
    };
    return Object.freeze({
      zoneId,
      cellX: component('x'),
      cellY: component('y'),
      cellZ: component('z'),
    });
  }

  private parseEnvelope(value: unknown, path: string): StoredInkfallTelemetryEvent {
    const envelope = record(value, path, [
      'schemaVersion', 'mapId', 'mapRevision', 'packageDigest', 'fixtureHash',
      'authorityRateHz', 'producer', 'eventSequence', 'authorityTick', 'kind', 'payload',
    ]);
    literal(envelope.schemaVersion, `${path}.schemaVersion`, INKFALL_TELEMETRY_SCHEMA_VERSION);
    literal(envelope.mapId, `${path}.mapId`, INKFALL_TELEMETRY_MAP_ID);
    literal(envelope.mapRevision, `${path}.mapRevision`, this.identity.mapRevision);
    literal(envelope.packageDigest, `${path}.packageDigest`, this.identity.packageDigest);
    literal(envelope.fixtureHash, `${path}.fixtureHash`, this.identity.fixtureHash);
    literal(envelope.authorityRateHz, `${path}.authorityRateHz`, INKFALL_TELEMETRY_AUTHORITY_RATE_HZ);
    literal(envelope.producer, `${path}.producer`, 'authority_runtime');
    const eventSequence = integer(
      envelope.eventSequence,
      `${path}.eventSequence`,
      1,
      MAX_EVENT_SEQUENCE,
    );
    const authorityTick = integer(
      envelope.authorityTick,
      `${path}.authorityTick`,
      0,
      MAX_AUTHORITY_TICK,
    );
    const kind = oneOf(envelope.kind, `${path}.kind`, [
      'route_traversal', 'spawn_choice', 'spawn_result', 'no_safe_spawn',
      'damage_location', 'death_location', 'sightline_exposure', 'occupancy_sample',
      'objective_pressure', 'authority_volume',
    ] as const);
    const payloadPath = `${path}.payload`;
    switch (kind) {
      case 'route_traversal': {
        const payload = record(envelope.payload, payloadPath, [
          'actorSlot', 'routeId', 'direction', 'enteredAtTick', 'exitedAtTick',
          'outcome', 'movementMode',
        ]);
        const routeId = semanticId(payload.routeId, `${payloadPath}.routeId`);
        const route = this.routeContracts.get(routeId);
        if (!route) abort(`${payloadPath}.routeId`, 'Unknown Inkfall route.');
        const direction = oneOf(payload.direction, `${payloadPath}.direction`, ['forward', 'reverse'] as const);
        if (direction === 'reverse' && !route.reverseAllowed) {
          abort(`${payloadPath}.direction`, 'This authored route is one-way.');
        }
        const movementMode = oneOf(payload.movementMode, `${payloadPath}.movementMode`, [
          'run', 'jump', 'slide', 'crouch', 'teleport', 'drop',
        ] as const satisfies readonly InkfallMovementMode[]);
        if (route.requiredMovementMode !== null && movementMode !== route.requiredMovementMode) {
          abort(`${payloadPath}.movementMode`, `Route requires ${route.requiredMovementMode}.`);
        }
        if (route.requiredMovementMode === null
          && (movementMode === 'teleport' || movementMode === 'drop')) {
          abort(`${payloadPath}.movementMode`, 'Special traversal mode is not authored for this route.');
        }
        const enteredAtTick = integer(payload.enteredAtTick, `${payloadPath}.enteredAtTick`, 0, authorityTick);
        const exitedAtTick = integer(payload.exitedAtTick, `${payloadPath}.exitedAtTick`, enteredAtTick, authorityTick);
        if (exitedAtTick !== authorityTick) abort(`${payloadPath}.exitedAtTick`, 'Exit tick must equal envelope authority tick.');
        if (exitedAtTick === enteredAtTick) abort(payloadPath, 'Traversal must span at least one authority tick.');
        return commonEvent(this.identity, authorityTick, eventSequence, kind, Object.freeze({
          actorSlot: integer(payload.actorSlot, `${payloadPath}.actorSlot`, 0, MAX_ACTOR_SLOT),
          routeId,
          direction,
          fromZoneId: direction === 'forward' ? route.fromZoneId : route.toZoneId,
          toZoneId: direction === 'forward' ? route.toZoneId : route.fromZoneId,
          enteredAtTick,
          exitedAtTick,
          traversalTicks: exitedAtTick - enteredAtTick,
          outcome: oneOf(payload.outcome, `${payloadPath}.outcome`, ['completed', 'aborted'] as const),
          movementMode,
        })) as StoredInkfallTelemetryEvent;
      }
      case 'spawn_choice': {
        const payload = record(envelope.payload, payloadPath, [
          'actorSlot', 'spawnId', 'decisionHash', 'selectedScore',
          'evaluatedCandidateCount', 'eligibleCandidateCount',
        ]);
        const spawnId = semanticId(payload.spawnId, `${payloadPath}.spawnId`);
        if (!this.spawnIds.has(spawnId)) abort(`${payloadPath}.spawnId`, 'Unknown Inkfall spawn.');
        if (typeof payload.decisionHash !== 'string' || !DECISION_HASH.test(payload.decisionHash)) {
          abort(`${payloadPath}.decisionHash`, 'Expected a 16-character lowercase decision hash.');
        }
        const evaluatedCandidateCount = integer(
          payload.evaluatedCandidateCount,
          `${payloadPath}.evaluatedCandidateCount`,
          1,
          this.spawnIds.size,
        );
        return commonEvent(this.identity, authorityTick, eventSequence, kind, Object.freeze({
          actorSlot: integer(payload.actorSlot, `${payloadPath}.actorSlot`, 0, MAX_ACTOR_SLOT),
          spawnId,
          decisionHash: payload.decisionHash,
          selectedScore: integer(payload.selectedScore, `${payloadPath}.selectedScore`, -10_000_000, 10_000_000),
          evaluatedCandidateCount,
          eligibleCandidateCount: integer(
            payload.eligibleCandidateCount,
            `${payloadPath}.eligibleCandidateCount`,
            1,
            evaluatedCandidateCount,
          ),
        })) as StoredInkfallTelemetryEvent;
      }
      case 'spawn_result': {
        const payload = record(envelope.payload, payloadPath, [
          'actorSlot', 'spawnId', 'spawnedAtTick', 'observedUntilTick', 'outcome',
          'firstRouteChoiceAtTick', 'firstContactAtTick', 'damageTakenPoints',
        ]);
        const spawnId = semanticId(payload.spawnId, `${payloadPath}.spawnId`);
        if (!this.spawnIds.has(spawnId)) abort(`${payloadPath}.spawnId`, 'Unknown Inkfall spawn.');
        const spawnedAtTick = integer(payload.spawnedAtTick, `${payloadPath}.spawnedAtTick`, 0, authorityTick);
        const observedUntilTick = integer(
          payload.observedUntilTick,
          `${payloadPath}.observedUntilTick`,
          spawnedAtTick,
          authorityTick,
        );
        if (observedUntilTick !== authorityTick) {
          abort(`${payloadPath}.observedUntilTick`, 'Observation end must equal envelope authority tick.');
        }
        const firstRouteChoiceAtTick = nullableInteger(
          payload.firstRouteChoiceAtTick,
          `${payloadPath}.firstRouteChoiceAtTick`,
          spawnedAtTick,
          observedUntilTick,
        );
        const firstContactAtTick = nullableInteger(
          payload.firstContactAtTick,
          `${payloadPath}.firstContactAtTick`,
          spawnedAtTick,
          observedUntilTick,
        );
        return commonEvent(this.identity, authorityTick, eventSequence, kind, Object.freeze({
          actorSlot: integer(payload.actorSlot, `${payloadPath}.actorSlot`, 0, MAX_ACTOR_SLOT),
          spawnId,
          spawnedAtTick,
          observedUntilTick,
          observationTicks: observedUntilTick - spawnedAtTick,
          outcome: oneOf(payload.outcome, `${payloadPath}.outcome`, ['alive_window', 'death'] as const),
          firstRouteChoiceTicks: firstRouteChoiceAtTick === null ? null : firstRouteChoiceAtTick - spawnedAtTick,
          firstContactTicks: firstContactAtTick === null ? null : firstContactAtTick - spawnedAtTick,
          damageTakenPoints: integer(payload.damageTakenPoints, `${payloadPath}.damageTakenPoints`, 0, MAX_DAMAGE_POINTS),
        })) as StoredInkfallTelemetryEvent;
      }
      case 'no_safe_spawn': {
        const payload = record(envelope.payload, payloadPath, [
          'actorSlot', 'evaluatedCandidateCount', 'directLosRejectedCount',
          'occupancyRejectedCount', 'territoryRejectedCount', 'retryAfterTicks',
        ]);
        const evaluatedCandidateCount = integer(
          payload.evaluatedCandidateCount,
          `${payloadPath}.evaluatedCandidateCount`,
          1,
          this.spawnIds.size,
        );
        return commonEvent(this.identity, authorityTick, eventSequence, kind, Object.freeze({
          actorSlot: integer(payload.actorSlot, `${payloadPath}.actorSlot`, 0, MAX_ACTOR_SLOT),
          evaluatedCandidateCount,
          directLosRejectedCount: integer(payload.directLosRejectedCount, `${payloadPath}.directLosRejectedCount`, 0, evaluatedCandidateCount),
          occupancyRejectedCount: integer(payload.occupancyRejectedCount, `${payloadPath}.occupancyRejectedCount`, 0, evaluatedCandidateCount),
          territoryRejectedCount: integer(payload.territoryRejectedCount, `${payloadPath}.territoryRejectedCount`, 0, evaluatedCandidateCount),
          retryAfterTicks: integer(payload.retryAfterTicks, `${payloadPath}.retryAfterTicks`, 1, 1_200),
        })) as StoredInkfallTelemetryEvent;
      }
      case 'damage_location': {
        const payload = record(envelope.payload, payloadPath, [
          'sourceActorSlot', 'targetActorSlot', 'zoneId', 'positionMm', 'damagePoints',
          'causeClass',
        ]);
        const zone = this.zone(payload.zoneId, `${payloadPath}.zoneId`);
        const position = this.positionInZone(payload.positionMm, zone, `${payloadPath}.positionMm`);
        return commonEvent(this.identity, authorityTick, eventSequence, kind, Object.freeze({
          sourceActorSlot: nullableInteger(payload.sourceActorSlot, `${payloadPath}.sourceActorSlot`, 0, MAX_ACTOR_SLOT),
          targetActorSlot: integer(payload.targetActorSlot, `${payloadPath}.targetActorSlot`, 0, MAX_ACTOR_SLOT),
          location: this.heatCell(position, zone.id),
          damagePoints: integer(payload.damagePoints, `${payloadPath}.damagePoints`, 1, MAX_DAMAGE_POINTS),
          causeClass: oneOf(payload.causeClass, `${payloadPath}.causeClass`, [
            'weapon_direct', 'explosive', 'melee', 'environment', 'fall', 'unknown',
          ] as const satisfies readonly InkfallDamageCauseClass[]),
        })) as StoredInkfallTelemetryEvent;
      }
      case 'death_location': {
        const payload = record(envelope.payload, payloadPath, [
          'victimActorSlot', 'killerActorSlot', 'zoneId', 'positionMm', 'causeClass',
          'assistCount', 'respawnEligibleAtTick',
        ]);
        const zone = this.zone(payload.zoneId, `${payloadPath}.zoneId`);
        const position = this.positionInZone(payload.positionMm, zone, `${payloadPath}.positionMm`);
        return commonEvent(this.identity, authorityTick, eventSequence, kind, Object.freeze({
          victimActorSlot: integer(payload.victimActorSlot, `${payloadPath}.victimActorSlot`, 0, MAX_ACTOR_SLOT),
          killerActorSlot: nullableInteger(payload.killerActorSlot, `${payloadPath}.killerActorSlot`, 0, MAX_ACTOR_SLOT),
          location: this.heatCell(position, zone.id),
          causeClass: oneOf(payload.causeClass, `${payloadPath}.causeClass`, [
            'weapon_direct', 'explosive', 'melee', 'environment', 'fall', 'unknown',
          ] as const satisfies readonly InkfallDamageCauseClass[]),
          assistCount: integer(payload.assistCount, `${payloadPath}.assistCount`, 0, MAX_ACTOR_SLOT),
          respawnEligibleAtTick: integer(
            payload.respawnEligibleAtTick,
            `${payloadPath}.respawnEligibleAtTick`,
            authorityTick,
            MAX_AUTHORITY_TICK,
          ),
        })) as StoredInkfallTelemetryEvent;
      }
      case 'sightline_exposure': {
        const payload = record(envelope.payload, payloadPath, [
          'observerActorSlot', 'subjectActorSlot', 'observerZoneId', 'subjectZoneId',
          'observerFeetPositionMm', 'subjectFeetPositionMm', 'observerStance',
          'subjectStance', 'exposureTicks',
        ]);
        const observerActorSlot = integer(payload.observerActorSlot, `${payloadPath}.observerActorSlot`, 0, MAX_ACTOR_SLOT);
        const subjectActorSlot = integer(payload.subjectActorSlot, `${payloadPath}.subjectActorSlot`, 0, MAX_ACTOR_SLOT);
        if (observerActorSlot === subjectActorSlot) abort(payloadPath, 'Observer and subject slots must differ.');
        const observerZone = this.zone(payload.observerZoneId, `${payloadPath}.observerZoneId`);
        const subjectZone = this.zone(payload.subjectZoneId, `${payloadPath}.subjectZoneId`);
        const observer = this.positionInZone(
          payload.observerFeetPositionMm,
          observerZone,
          `${payloadPath}.observerFeetPositionMm`,
        );
        const subject = this.positionInZone(
          payload.subjectFeetPositionMm,
          subjectZone,
          `${payloadPath}.subjectFeetPositionMm`,
        );
        const observerStance = oneOf(payload.observerStance, `${payloadPath}.observerStance`, ['standing', 'crouched'] as const);
        const subjectStance = oneOf(payload.subjectStance, `${payloadPath}.subjectStance`, ['standing', 'crouched'] as const);
        const eye = (position: MapVector3Millimeters, stance: 'standing' | 'crouched') => Object.freeze({
          x: position.x,
          y: position.y + (stance === 'standing' ? STANDING_EYE_HEIGHT_MM : CROUCHED_EYE_HEIGHT_MM),
          z: position.z,
        });
        const trace = this.lineOfSight.trace(eye(observer, observerStance), eye(subject, subjectStance));
        if (trace.colliderId !== null && !this.colliderIds.has(trace.colliderId)) {
          throw new Error('TELEMETRY_LOS_COLLIDER_OUTSIDE_BOUND_FIXTURE');
        }
        const distance = Math.round(Math.hypot(
          observer.x - subject.x,
          observer.y - subject.y,
          observer.z - subject.z,
        ));
        const distanceBandMinimumMm = Math.floor(distance / SIGHTLINE_DISTANCE_BAND_MM)
          * SIGHTLINE_DISTANCE_BAND_MM;
        return commonEvent(this.identity, authorityTick, eventSequence, kind, Object.freeze({
          observerActorSlot,
          subjectActorSlot,
          observerLocation: this.heatCell(observer, observerZone.id),
          subjectLocation: this.heatCell(subject, subjectZone.id),
          observerStance,
          subjectStance,
          exposureTicks: integer(payload.exposureTicks, `${payloadPath}.exposureTicks`, 1, 1_200),
          directLineOfSight: !trace.blocked,
          blockerId: trace.colliderId,
          distanceBandMinimumMm,
          distanceBandMaximumExclusiveMm: distanceBandMinimumMm + SIGHTLINE_DISTANCE_BAND_MM,
        })) as StoredInkfallTelemetryEvent;
      }
      case 'occupancy_sample': {
        const payload = record(envelope.payload, payloadPath, ['occupants']);
        const actorSlots = new Set<number>();
        const cells = new Map<string, { location: TelemetryHeatCell; count: number }>();
        const zones = new Map<string, number>();
        for (const [index, occupantValue] of array(payload.occupants, `${payloadPath}.occupants`, 1, MAX_ACTOR_SLOT + 1).entries()) {
          const occupantPath = `${payloadPath}.occupants[${index}]`;
          const occupant = record(occupantValue, occupantPath, ['actorSlot', 'zoneId', 'feetPositionMm']);
          const actorSlot = integer(occupant.actorSlot, `${occupantPath}.actorSlot`, 0, MAX_ACTOR_SLOT);
          if (actorSlots.has(actorSlot)) abort(`${occupantPath}.actorSlot`, 'Occupancy actor slots must be unique.');
          actorSlots.add(actorSlot);
          const zone = this.zone(occupant.zoneId, `${occupantPath}.zoneId`);
          const position = this.positionInZone(occupant.feetPositionMm, zone, `${occupantPath}.feetPositionMm`);
          const location = this.heatCell(position, zone.id);
          const key = this.heatCellKey(location);
          const cell = cells.get(key) ?? { location, count: 0 };
          cell.count += 1;
          cells.set(key, cell);
          zones.set(zone.id, (zones.get(zone.id) ?? 0) + 1);
        }
        return commonEvent(this.identity, authorityTick, eventSequence, kind, Object.freeze({
          playerCount: actorSlots.size,
          zoneCounts: Object.freeze([...zones]
            .sort(([left], [right]) => compareCodeUnits(left, right))
            .map(([zoneId, count]) => Object.freeze({ zoneId, count }))),
          cellCounts: Object.freeze([...cells]
            .sort(([left], [right]) => compareCodeUnits(left, right))
            .map(([, cell]) => Object.freeze({ location: cell.location, count: cell.count }))),
        })) as StoredInkfallTelemetryEvent;
      }
      case 'objective_pressure': {
        const payload = record(envelope.payload, payloadPath, [
          'objectiveSlot', 'zoneId', 'positionMm', 'pressurePermille',
          'nearbyFriendlyCount', 'nearbyEnemyCount', 'controllingTeamSlot',
        ]);
        const zone = this.zone(payload.zoneId, `${payloadPath}.zoneId`);
        const position = this.positionInZone(payload.positionMm, zone, `${payloadPath}.positionMm`);
        const nearbyFriendlyCount = integer(
          payload.nearbyFriendlyCount,
          `${payloadPath}.nearbyFriendlyCount`,
          0,
          MAX_ACTOR_SLOT + 1,
        );
        const nearbyEnemyCount = integer(
          payload.nearbyEnemyCount,
          `${payloadPath}.nearbyEnemyCount`,
          0,
          MAX_ACTOR_SLOT + 1,
        );
        if (nearbyFriendlyCount + nearbyEnemyCount > MAX_ACTOR_SLOT + 1) {
          abort(payloadPath, 'Objective population exceeds the bounded match actor slots.');
        }
        return commonEvent(this.identity, authorityTick, eventSequence, kind, Object.freeze({
          objectiveSlot: integer(payload.objectiveSlot, `${payloadPath}.objectiveSlot`, 0, MAX_OBJECTIVE_SLOT),
          location: this.heatCell(position, zone.id),
          pressurePermille: integer(payload.pressurePermille, `${payloadPath}.pressurePermille`, 0, 1_000),
          nearbyFriendlyCount,
          nearbyEnemyCount,
          controllingTeamSlot: nullableInteger(payload.controllingTeamSlot, `${payloadPath}.controllingTeamSlot`, 0, MAX_TEAM_SLOT),
        })) as StoredInkfallTelemetryEvent;
      }
      case 'authority_volume': {
        const payload = record(envelope.payload, payloadPath, [
          'actorSlot', 'volumeId', 'positionMm', 'outcome',
        ]);
        const volumeId = semanticId(payload.volumeId, `${payloadPath}.volumeId`);
        const volume = this.volumes.get(volumeId);
        if (!volume) abort(`${payloadPath}.volumeId`, 'Unknown Inkfall authority volume.');
        const position = vector(payload.positionMm, `${payloadPath}.positionMm`);
        this.assertPositionInBounds(position, `${payloadPath}.positionMm`);
        for (const axis of ['x', 'y', 'z'] as const) {
          if (Math.abs(position[axis] - volume.centerMm[axis]) > volume.halfExtentsMm[axis]) {
            abort(`${payloadPath}.positionMm`, `Position is outside authority volume ${volume.id}.`);
          }
        }
        const outcome = oneOf(payload.outcome, `${payloadPath}.outcome`, [
          'recovery_entered', 'recovery_completed', 'kill_entered', 'killed',
        ] as const);
        if ((volume.kind === 'recovery' && outcome !== 'recovery_entered' && outcome !== 'recovery_completed')
          || (volume.kind === 'kill' && outcome !== 'kill_entered' && outcome !== 'killed')) {
          abort(`${payloadPath}.outcome`, `Outcome does not match ${volume.kind} volume.`);
        }
        return commonEvent(this.identity, authorityTick, eventSequence, kind, Object.freeze({
          actorSlot: integer(payload.actorSlot, `${payloadPath}.actorSlot`, 0, MAX_ACTOR_SLOT),
          volumeId,
          volumeKind: volume.kind,
          location: this.heatCell(position, null),
          outcome,
        })) as StoredInkfallTelemetryEvent;
      }
      default: {
        const exhaustive: never = kind;
        throw new Error(`TELEMETRY_UNREACHABLE_KIND ${String(exhaustive)}`);
      }
    }
  }

  private heatCellKey(location: TelemetryHeatCell): string {
    return `${location.zoneId ?? '~'}:${location.cellX}:${location.cellY}:${location.cellZ}`;
  }

  private heatMetric(state: AggregationState, location: TelemetryHeatCell): MutableHeatMetrics {
    const key = this.heatCellKey(location);
    const existing = state.heatCells.get(key);
    if (existing) return existing;
    const created: MutableHeatMetrics = {
      location,
      occupancySamples: 0,
      damagePoints: 0,
      deaths: 0,
      exposureTicks: 0,
      objectivePressurePermille: 0,
      volumeEvents: 0,
    };
    state.heatCells.set(key, created);
    return created;
  }

  private applyAggregation(state: AggregationState, event: StoredInkfallTelemetryEvent): void {
    state.totalsByKind[event.kind] = checkedAdd(
      state.totalsByKind[event.kind],
      1,
      `kind.${event.kind}`,
    );
    switch (event.kind) {
      case 'route_traversal': {
        const value = state.routes.get(event.payload.routeId) ?? {
          samples: 0,
          completed: 0,
          aborted: 0,
          totalTraversalTicks: 0,
          minimumTraversalTicks: event.payload.traversalTicks,
          maximumTraversalTicks: event.payload.traversalTicks,
        };
        value.samples = checkedAdd(value.samples, 1, 'route samples');
        value[event.payload.outcome] = checkedAdd(value[event.payload.outcome], 1, `route ${event.payload.outcome}`);
        value.totalTraversalTicks = checkedAdd(value.totalTraversalTicks, event.payload.traversalTicks, 'route ticks');
        value.minimumTraversalTicks = Math.min(value.minimumTraversalTicks, event.payload.traversalTicks);
        value.maximumTraversalTicks = Math.max(value.maximumTraversalTicks, event.payload.traversalTicks);
        state.routes.set(event.payload.routeId, value);
        break;
      }
      case 'spawn_choice': {
        const value = state.spawns.get(event.payload.spawnId) ?? {
          choices: 0, results: 0, deathOutcomes: 0, totalObservationTicks: 0,
        };
        value.choices = checkedAdd(value.choices, 1, 'spawn choices');
        state.spawns.set(event.payload.spawnId, value);
        break;
      }
      case 'spawn_result': {
        const value = state.spawns.get(event.payload.spawnId) ?? {
          choices: 0, results: 0, deathOutcomes: 0, totalObservationTicks: 0,
        };
        value.results = checkedAdd(value.results, 1, 'spawn results');
        value.deathOutcomes = checkedAdd(
          value.deathOutcomes,
          event.payload.outcome === 'death' ? 1 : 0,
          'spawn death outcomes',
        );
        value.totalObservationTicks = checkedAdd(
          value.totalObservationTicks,
          event.payload.observationTicks,
          'spawn observation ticks',
        );
        state.spawns.set(event.payload.spawnId, value);
        break;
      }
      case 'no_safe_spawn':
        state.noSafeSpawnEvents = checkedAdd(state.noSafeSpawnEvents, 1, 'no safe spawn events');
        break;
      case 'damage_location': {
        const zoneId = event.payload.location.zoneId!;
        const value = state.combatZones.get(zoneId) ?? { damageEvents: 0, damagePoints: 0, deaths: 0 };
        value.damageEvents = checkedAdd(value.damageEvents, 1, 'zone damage events');
        value.damagePoints = checkedAdd(value.damagePoints, event.payload.damagePoints, 'zone damage points');
        state.combatZones.set(zoneId, value);
        const heat = this.heatMetric(state, event.payload.location);
        heat.damagePoints = checkedAdd(heat.damagePoints, event.payload.damagePoints, 'heat damage points');
        break;
      }
      case 'death_location': {
        const zoneId = event.payload.location.zoneId!;
        const value = state.combatZones.get(zoneId) ?? { damageEvents: 0, damagePoints: 0, deaths: 0 };
        value.deaths = checkedAdd(value.deaths, 1, 'zone deaths');
        state.combatZones.set(zoneId, value);
        const heat = this.heatMetric(state, event.payload.location);
        heat.deaths = checkedAdd(heat.deaths, 1, 'heat deaths');
        break;
      }
      case 'sightline_exposure': {
        const observerZoneId = event.payload.observerLocation.zoneId!;
        const subjectZoneId = event.payload.subjectLocation.zoneId!;
        const key = `${observerZoneId}>${subjectZoneId}`;
        const value = state.exposures.get(key) ?? { samples: 0, directSamples: 0, totalExposureTicks: 0 };
        value.samples = checkedAdd(value.samples, 1, 'exposure samples');
        value.directSamples = checkedAdd(
          value.directSamples,
          event.payload.directLineOfSight ? 1 : 0,
          'direct exposure samples',
        );
        value.totalExposureTicks = checkedAdd(
          value.totalExposureTicks,
          event.payload.exposureTicks,
          'exposure ticks',
        );
        state.exposures.set(key, value);
        const heat = this.heatMetric(state, event.payload.subjectLocation);
        heat.exposureTicks = checkedAdd(heat.exposureTicks, event.payload.exposureTicks, 'heat exposure ticks');
        break;
      }
      case 'occupancy_sample': {
        const arrangement = event.payload.playerCount === 2
          ? 'twoPlayers'
          : event.payload.playerCount === 4
            ? 'fourPlayers'
            : event.payload.playerCount === 8 ? 'eightPlayers' : 'other';
        state.arrangementSamples[arrangement] = checkedAdd(
          state.arrangementSamples[arrangement],
          1,
          `arrangement ${arrangement}`,
        );
        for (const sample of event.payload.zoneCounts) {
          const value = state.occupancyZones.get(sample.zoneId) ?? {
            samples: 0, totalOccupants: 0, peakOccupants: 0,
          };
          value.samples = checkedAdd(value.samples, 1, 'zone occupancy samples');
          value.totalOccupants = checkedAdd(value.totalOccupants, sample.count, 'zone occupants');
          value.peakOccupants = Math.max(value.peakOccupants, sample.count);
          state.occupancyZones.set(sample.zoneId, value);
        }
        for (const sample of event.payload.cellCounts) {
          const heat = this.heatMetric(state, sample.location);
          heat.occupancySamples = checkedAdd(
            heat.occupancySamples,
            sample.count,
            'heat occupancy samples',
          );
        }
        break;
      }
      case 'objective_pressure': {
        const value = state.objectives.get(event.payload.objectiveSlot) ?? {
          samples: 0, totalPressurePermille: 0, peakPressurePermille: 0,
        };
        value.samples = checkedAdd(value.samples, 1, 'objective samples');
        value.totalPressurePermille = checkedAdd(
          value.totalPressurePermille,
          event.payload.pressurePermille,
          'objective pressure',
        );
        value.peakPressurePermille = Math.max(value.peakPressurePermille, event.payload.pressurePermille);
        state.objectives.set(event.payload.objectiveSlot, value);
        const heat = this.heatMetric(state, event.payload.location);
        heat.objectivePressurePermille = checkedAdd(
          heat.objectivePressurePermille,
          event.payload.pressurePermille,
          'heat objective pressure',
        );
        break;
      }
      case 'authority_volume': {
        const value = state.volumes.get(event.payload.volumeId) ?? {
          recoveryEntered: 0, recoveryCompleted: 0, killEntered: 0, killed: 0,
        };
        const field = event.payload.outcome === 'recovery_entered'
          ? 'recoveryEntered'
          : event.payload.outcome === 'recovery_completed'
            ? 'recoveryCompleted'
            : event.payload.outcome === 'kill_entered' ? 'killEntered' : 'killed';
        value[field] = checkedAdd(value[field], 1, `volume ${field}`);
        state.volumes.set(event.payload.volumeId, value);
        const heat = this.heatMetric(state, event.payload.location);
        heat.volumeEvents = checkedAdd(heat.volumeEvents, 1, 'heat volume events');
        break;
      }
      default: {
        const exhaustive: never = event;
        throw new Error(`TELEMETRY_UNREACHABLE_AGGREGATION ${String(exhaustive)}`);
      }
    }
  }

  append(source: unknown): StoredInkfallTelemetryEvent {
    return this.appendBatch([source])[0];
  }

  appendBatch(source: unknown): readonly StoredInkfallTelemetryEvent[] {
    try {
      const copied = snapshotUntrusted(source, '$batch');
      const values = array(copied, '$batch', 1, MAX_BATCH_EVENTS);
      const parsed = values.map((value, index) => this.parseEnvelope(value, `$batch[${index}]`));
      parsed.sort((left, right) => left.authorityTick - right.authorityTick
        || left.eventSequence - right.eventSequence
        || compareCodeUnits(left.kind, right.kind));
      const sequences = new Set<number>();
      let priorSequence = this.lastEventSequence;
      let priorTick = this.lastAuthorityTick;
      for (const [index, event] of parsed.entries()) {
        if (sequences.has(event.eventSequence)) {
          abort(`$batch[${index}].eventSequence`, 'Duplicate event sequence in one batch.');
        }
        sequences.add(event.eventSequence);
        if (priorSequence !== null && event.eventSequence <= priorSequence) {
          abort(`$batch[${index}].eventSequence`, 'Replay or non-increasing authority event sequence.');
        }
        if (priorTick !== null && event.authorityTick < priorTick) {
          abort(`$batch[${index}].authorityTick`, 'Authority event tick regressed.');
        }
        priorSequence = event.eventSequence;
        priorTick = event.authorityTick;
      }

      const nextAggregation = cloneAggregation(this.aggregation);
      for (const event of parsed) this.applyAggregation(nextAggregation, event);
      const nextAccepted = checkedAdd(this.acceptedEvents, parsed.length, 'accepted events');
      const combined = [...this.events, ...parsed];
      const overflow = Math.max(0, combined.length - this.retainedEventCapacity);
      const retained = Object.freeze(combined.slice(overflow));
      const nextEvicted = checkedAdd(this.evictedEvents, overflow, 'evicted events');

      this.aggregation = nextAggregation;
      this.events = retained;
      this.acceptedEvents = nextAccepted;
      this.evictedEvents = nextEvicted;
      this.lastEventSequence = priorSequence;
      this.lastAuthorityTick = priorTick;
      return Object.freeze([...parsed]);
    } catch (error) {
      if (error instanceof ValidationAbort) {
        throw new InkfallTelemetryValidationError(Object.freeze([error.issue]));
      }
      throw error;
    }
  }

  snapshot(): InkfallTelemetrySnapshotV1 {
    const state = this.aggregation;
    const exposureMetrics = [...state.exposures].map(([key, value]) => {
      const separator = key.indexOf('>');
      return {
        observerZoneId: key.slice(0, separator),
        subjectZoneId: key.slice(separator + 1),
        ...value,
      };
    }).sort((left, right) => compareCodeUnits(left.observerZoneId, right.observerZoneId)
      || compareCodeUnits(left.subjectZoneId, right.subjectZoneId));
    const snapshotSource = {
      schemaVersion: 1 as const,
      status: 'P6.5_AUTHORITY_TELEMETRY_FIXTURE_G5_NOT_PASSED' as const,
      binding: {
        mapId: INKFALL_TELEMETRY_MAP_ID,
        mapRevision: this.identity.mapRevision,
        packageDigest: this.identity.packageDigest,
        fixtureHash: this.identity.fixtureHash,
      },
      units: {
        authorityRateHz: INKFALL_TELEMETRY_AUTHORITY_RATE_HZ,
        tickMilliseconds: INKFALL_TELEMETRY_TICK_MILLISECONDS,
        inputDistance: 'millimeters' as const,
        retainedLocation: 'quantized_heat_cell' as const,
        heatCellMillimeters: INKFALL_TELEMETRY_HEAT_CELL_MM,
        pressure: 'permille' as const,
        damage: 'integer_points' as const,
      },
      privacy: {
        actorIdentity: 'ephemeral_match_slot_0_through_63' as const,
        exactPositionsRetained: false as const,
        accountIdentifiersRetained: false as const,
        networkIdentifiersRetained: false as const,
        clientOutcomeAuthorityAccepted: false as const,
      },
      buffer: {
        capacity: this.retainedEventCapacity,
        retainedEvents: this.events.length,
        acceptedEvents: this.acceptedEvents,
        evictedEvents: this.evictedEvents,
        lastEventSequence: this.lastEventSequence,
        lastAuthorityTick: this.lastAuthorityTick,
      },
      totalsByKind: { ...state.totalsByKind },
      arrangementSamples: { ...state.arrangementSamples },
      routeMetrics: [...state.routes]
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([routeId, metrics]) => ({ routeId, ...metrics })),
      spawnMetrics: [...state.spawns]
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([spawnId, metrics]) => ({ spawnId, ...metrics })),
      combatZoneMetrics: [...state.combatZones]
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([zoneId, metrics]) => ({ zoneId, ...metrics })),
      exposureMetrics,
      occupancyZoneMetrics: [...state.occupancyZones]
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([zoneId, metrics]) => ({ zoneId, ...metrics })),
      heatCells: [...state.heatCells]
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([, metrics]) => ({ ...metrics })),
      objectiveMetrics: [...state.objectives]
        .sort(([left], [right]) => left - right)
        .map(([objectiveSlot, metrics]) => ({ objectiveSlot, ...metrics })),
      volumeMetrics: [...state.volumes]
        .sort(([left], [right]) => compareCodeUnits(left, right))
        .map(([volumeId, metrics]) => ({ volumeId, ...metrics })),
      noSafeSpawnEvents: state.noSafeSpawnEvents,
      events: [...this.events],
      nonClaims: [
        'P6.6_NOT_CLAIMED',
        'G5_NOT_PASSED',
        'HUMAN_ACCEPTANCE_NOT_RUN',
      ] as const,
    };
    const snapshotHash = fnv1a64(JSON.stringify(snapshotSource));
    return deepFreeze({ ...snapshotSource, snapshotHash });
  }
}

export function createInkfallAuthorityTelemetry(
  loaded: LoadedRuntimeMapPackage,
  options: unknown = {},
): InkfallAuthorityTelemetry {
  return new InkfallAuthorityTelemetry(loaded, options);
}

export const INKFALL_AUTHORITY_TELEMETRY_CONTRACT = Object.freeze({
  schemaVersion: INKFALL_TELEMETRY_SCHEMA_VERSION,
  mapId: INKFALL_TELEMETRY_MAP_ID,
  mapRevision: INKFALL_TELEMETRY_MAP_REVISION,
  packageDigest: INKFALL_TELEMETRY_PACKAGE_DIGEST,
  fixtureHash: INKFALL_TELEMETRY_FIXTURE_HASH,
  supportedMapRevisions: Object.freeze(INKFALL_AUTHORITY_MAP_IDENTITIES.map(
    ({ mapRevision }) => mapRevision,
  )),
  authorityRateHz: INKFALL_TELEMETRY_AUTHORITY_RATE_HZ,
  tickMilliseconds: INKFALL_TELEMETRY_TICK_MILLISECONDS,
  heatCellMillimeters: INKFALL_TELEMETRY_HEAT_CELL_MM,
  routeCardinality: INKFALL_ROUTE_TELEMETRY_CONTRACTS.length,
  zoneCardinality: 9,
  spawnCardinality: 12,
  colliderCardinality: 346,
  volumeCardinality: 2,
  maximumBatchEvents: MAX_BATCH_EVENTS,
  defaultRetainedEventCapacity: DEFAULT_BUFFER_CAPACITY,
  maximumRetainedEventCapacity: MAX_BUFFER_CAPACITY,
  actorIdentity: 'ephemeral_match_slot_0_through_63' as const,
  exactPositionsRetained: false as const,
  clientOutcomeAuthorityAccepted: false as const,
});
