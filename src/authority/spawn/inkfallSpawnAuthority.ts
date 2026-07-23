import type {
  MapSpawnV1,
  MapVector3Millimeters,
} from '../../content/maps';
import type { LoadedRuntimeMapPackage } from '../../physics';
import {
  INKFALL_AUTHORITY_MAP_ID,
  INKFALL_AUTHORITY_MAP_IDENTITIES,
  INKFALL_AUTHORITY_MAP_IDENTITY_V1,
  findInkfallAuthorityMapIdentity,
  type InkfallAuthorityMapIdentity,
} from '../inkfallMapIdentity';
import { FixtureAuthorityLineOfSight } from './fixtureLineOfSight';

const INPUT_SCHEMA_VERSION = 1 as const;
const RESULT_SCHEMA_VERSION = 1 as const;
const INKFALL_MAP_ID = INKFALL_AUTHORITY_MAP_ID;
const INKFALL_MAP_REVISION = INKFALL_AUTHORITY_MAP_IDENTITY_V1.mapRevision;
const INKFALL_PACKAGE_DIGEST = INKFALL_AUTHORITY_MAP_IDENTITY_V1.packageDigest;
const INKFALL_FIXTURE_HASH = INKFALL_AUTHORITY_MAP_IDENTITY_V1.fixtureHash;
const TICK_MILLISECONDS = 50;
const STANDING_EYE_HEIGHT_MM = 1_650;
const CROUCHED_EYE_HEIGHT_MM = 1_000;
const AUTHORITY_RUN_SPEED_MM_PER_SECOND = 9_000;
const ARRIVAL_PRESSURE_WINDOW_MS = 4_000;
const OCCUPANCY_RADIUS_MM = 1_400;
const OCCUPANCY_VERTICAL_MM = 2_200;
const RECENT_AIM_WINDOW_TICKS = 10;
const RECENT_DEATH_WINDOW_TICKS = 200;
const RECENT_DEATH_RADIUS_MM = 12_000;
const RECENT_USE_WINDOW_TICKS = 160;
const TEAM_CLUSTER_RADIUS_MM = 7_000;
const MAX_PLAYERS = 64;
const MAX_HISTORY_ENTRIES = 256;
const MAX_OBJECTIVES = 32;
const MAX_SNAPSHOT_DEPTH = 16;
const MAX_ARRAY_LENGTH = 512;
const MAX_OBJECT_FIELDS = 128;
const SEMANTIC_ID = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u;
const Q15 = 32_767;

type UnknownRecord = Record<string, unknown>;
type SpawnMode = 'deathmatch' | 'team_deathmatch';
type TeamTerritory = 'west' | 'east' | null;

export interface AuthorityArrivalEstimateInput {
  readonly spawnId: string;
  readonly milliseconds: number;
}

export interface AuthoritySpawnPlayerInput {
  readonly id: string;
  readonly teamId: string | null;
  readonly feetPositionMm: MapVector3Millimeters;
  readonly aimDirectionQ15: MapVector3Millimeters;
  readonly aimSampleTick: number;
  readonly authorityArrivalEstimates: readonly AuthorityArrivalEstimateInput[];
}

export interface AuthoritySpawnSelectionInputV1 {
  readonly schemaVersion: typeof INPUT_SCHEMA_VERSION;
  readonly mapId: typeof INKFALL_MAP_ID;
  readonly mapRevision: InkfallAuthorityMapIdentity['mapRevision'];
  readonly fixtureHash: string;
  readonly mode: SpawnMode;
  readonly tick: number;
  readonly requester: {
    readonly id: string;
    readonly teamId: string | null;
    readonly territory: TeamTerritory;
  };
  readonly players: readonly AuthoritySpawnPlayerInput[];
  readonly recentDeaths: readonly {
    readonly playerId: string;
    readonly feetPositionMm: MapVector3Millimeters;
    readonly tick: number;
  }[];
  readonly recentSpawnUses: readonly {
    readonly spawnId: string;
    readonly tick: number;
  }[];
  readonly objectives: readonly {
    readonly id: string;
    readonly feetPositionMm: MapVector3Millimeters;
    readonly controllingTeamId: string | null;
    readonly pressurePermille: number;
  }[];
}

export interface SpawnEnemyEvaluation {
  readonly enemyId: string;
  readonly distanceMm: number;
  readonly standingLineOfSight: boolean;
  readonly standingBlockerId: string | null;
  readonly crouchedLineOfSight: boolean;
  readonly crouchedBlockerId: string | null;
  readonly aimAlignmentPermille: number;
  readonly aimSampleAgeTicks: number;
  readonly arrivalTimeMs: number;
  readonly arrivalSource: 'authority_route_probe' | 'spatial_lower_bound';
  readonly components: {
    readonly distanceSafety: number;
    readonly lineOfSightExposure: number;
    readonly recentAimAlignment: number;
    readonly travelArrivalPressure: number;
  };
}

export interface SpawnScoreComponents {
  readonly enemyDistanceSafety: number;
  readonly lineOfSightExposure: number;
  readonly recentEnemyAimAlignment: number;
  readonly enemyTravelArrivalPressure: number;
  readonly recentDeathLocation: number;
  readonly recentSpawnUse: number;
  readonly teammateSupport: number;
  readonly teamClustering: number;
  readonly objectiveProximityPressure: number;
  readonly occupancy: number;
  readonly modeTeamTerritory: number;
  readonly escapeRouteCountQuality: number;
}

export interface SpawnCandidateEvaluation {
  readonly spawnId: string;
  readonly set: MapSpawnV1['set'];
  readonly feetPositionMm: MapVector3Millimeters;
  readonly yawMilliDegrees: number;
  readonly eligible: boolean;
  readonly rejectionReasons: readonly string[];
  readonly score: number;
  readonly components: SpawnScoreComponents;
  readonly enemies: readonly SpawnEnemyEvaluation[];
  readonly objectivePolicy: 'neutral_no_objectives' | 'authority_objectives_applied';
  readonly escapeRouteFamilies: readonly string[];
}

export interface AuthoritySpawnSelectionResultV1 {
  readonly schemaVersion: typeof RESULT_SCHEMA_VERSION;
  readonly status: 'selected' | 'no_safe_spawn';
  readonly mapId: typeof INKFALL_MAP_ID;
  readonly mapRevision: InkfallAuthorityMapIdentity['mapRevision'];
  readonly fixtureHash: string;
  readonly mode: SpawnMode;
  readonly tick: number;
  readonly selected: null | {
    readonly spawnId: string;
    readonly feetPositionMm: MapVector3Millimeters;
    readonly yawMilliDegrees: number;
    readonly score: number;
  };
  readonly evaluations: readonly SpawnCandidateEvaluation[];
  readonly decisionHash: string;
  readonly authorityBoundary: 'server_state_and_authority_collision_only';
  readonly clientPositionOrScoreAccepted: false;
  readonly nonClaims: readonly [
    'P6.5_NOT_CLAIMED',
    'P6.6_NOT_CLAIMED',
    'G5_NOT_PASSED',
  ];
}

export interface SpawnAuthorityValidationIssue {
  readonly path: string;
  readonly message: string;
}

export class SpawnAuthorityInputError extends Error {
  readonly issues: readonly SpawnAuthorityValidationIssue[];

  constructor(issues: readonly SpawnAuthorityValidationIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'SpawnAuthorityInputError';
    this.issues = issues;
  }
}

class InputAbort extends Error {
  readonly issue: SpawnAuthorityValidationIssue;

  constructor(path: string, message: string) {
    super(message);
    this.issue = { path, message };
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function snapshotUntrusted(value: unknown, path = '$', depth = 0): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'number'
    || typeof value === 'boolean') return value;
  if (typeof value !== 'object') throw new InputAbort(path, 'Expected JSON-compatible data.');
  if (depth > MAX_SNAPSHOT_DEPTH) throw new InputAbort(path, 'Input nesting is too deep.');
  let prototype: object | null;
  let descriptors: PropertyDescriptorMap;
  let symbolCount: number;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
    symbolCount = Object.getOwnPropertySymbols(value).length;
  } catch {
    throw new InputAbort(path, 'Input object could not be inspected safely.');
  }
  if (symbolCount > 0) throw new InputAbort(path, 'Symbol fields are not allowed.');
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype) throw new InputAbort(path, 'Expected a plain array.');
    const lengthDescriptor = descriptors.length;
    const length = lengthDescriptor?.value;
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_ARRAY_LENGTH) {
      throw new InputAbort(path, 'Array length is invalid or exceeds the authority limit.');
    }
    const allowed = new Set(['length', ...Array.from({ length }, (_, index) => String(index))]);
    const unknown = Object.keys(descriptors).find((key) => !allowed.has(key));
    if (unknown) throw new InputAbort(`${path}.${unknown}`, 'Named array fields are not allowed.');
    const result: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (!descriptor || !('value' in descriptor)) {
        throw new InputAbort(`${path}[${index}]`, 'Sparse arrays and accessors are not allowed.');
      }
      result.push(snapshotUntrusted(descriptor.value, `${path}[${index}]`, depth + 1));
    }
    return result;
  }
  if (prototype !== Object.prototype && prototype !== null) {
    throw new InputAbort(path, 'Expected a plain object.');
  }
  const keys = Object.keys(descriptors);
  if (keys.length > MAX_OBJECT_FIELDS) throw new InputAbort(path, 'Object has too many fields.');
  const result: UnknownRecord = Object.create(null) as UnknownRecord;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new InputAbort(`${path}.${key}`, 'Non-enumerable fields and accessors are not allowed.');
    }
    result[key] = snapshotUntrusted(descriptor.value, `${path}.${key}`, depth + 1);
  }
  return result;
}

function record(value: unknown, path: string, allowed: readonly string[]): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new InputAbort(path, 'Expected an object.');
  }
  const result = value as UnknownRecord;
  const unknown = Object.keys(result).find((key) => !allowed.includes(key));
  if (unknown) throw new InputAbort(`${path}.${unknown}`, 'Unknown field.');
  const missing = allowed.find((key) => !(key in result));
  if (missing) throw new InputAbort(`${path}.${missing}`, 'Required field is missing.');
  return result;
}

function array(value: unknown, path: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new InputAbort(path, `Expected an array with at most ${maximum} entries.`);
  }
  return value;
}

function integer(value: unknown, path: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new InputAbort(path, `Expected an integer from ${minimum} through ${maximum}.`);
  }
  return value as number;
}

function literal<T extends string | number>(value: unknown, path: string, expected: T): T {
  if (value !== expected) throw new InputAbort(path, `Expected ${String(expected)}.`);
  return expected;
}

function oneOf<T extends string>(value: unknown, path: string, expected: readonly T[]): T {
  if (typeof value !== 'string' || !expected.includes(value as T)) {
    throw new InputAbort(path, `Expected one of: ${expected.join(', ')}.`);
  }
  return value as T;
}

function semanticId(value: unknown, path: string): string {
  if (typeof value !== 'string' || !SEMANTIC_ID.test(value) || value.length > 64) {
    throw new InputAbort(path, 'Expected a bounded semantic identifier.');
  }
  return value;
}

function nullableSemanticId(value: unknown, path: string): string | null {
  return value === null ? null : semanticId(value, path);
}

function vector(value: unknown, path: string, minimum = -1_000_000, maximum = 1_000_000) {
  const input = record(value, path, ['x', 'y', 'z']);
  return Object.freeze({
    x: integer(input.x, `${path}.x`, minimum, maximum),
    y: integer(input.y, `${path}.y`, minimum, maximum),
    z: integer(input.z, `${path}.z`, minimum, maximum),
  });
}

function validateInput(
  source: unknown,
  spawnIds: ReadonlySet<string>,
  identity: InkfallAuthorityMapIdentity,
): AuthoritySpawnSelectionInputV1 {
  let copied: unknown;
  try {
    copied = snapshotUntrusted(source);
    const root = record(copied, '$', [
      'schemaVersion', 'mapId', 'mapRevision', 'fixtureHash', 'mode', 'tick',
      'requester', 'players', 'recentDeaths', 'recentSpawnUses', 'objectives',
    ]);
    const tick = integer(root.tick, '$.tick', 0, Number.MAX_SAFE_INTEGER);
    const mode = oneOf(root.mode, '$.mode', ['deathmatch', 'team_deathmatch'] as const);
    const requesterSource = record(root.requester, '$.requester', ['id', 'teamId', 'territory']);
    const requester = Object.freeze({
      id: semanticId(requesterSource.id, '$.requester.id'),
      teamId: nullableSemanticId(requesterSource.teamId, '$.requester.teamId'),
      territory: requesterSource.territory === null
        ? null
        : oneOf(requesterSource.territory, '$.requester.territory', ['west', 'east'] as const),
    });
    if (mode === 'deathmatch' && (requester.teamId !== null || requester.territory !== null)) {
      throw new InputAbort('$.requester', 'Deathmatch requires null team and territory.');
    }
    if (mode === 'team_deathmatch' && (requester.teamId === null || requester.territory === null)) {
      throw new InputAbort('$.requester', 'Team deathmatch requires authority team and territory.');
    }
    const playerIds = new Set<string>();
    const players = array(root.players, '$.players', MAX_PLAYERS).map((entry, index) => {
      const path = `$.players[${index}]`;
      const input = record(entry, path, [
        'id', 'teamId', 'feetPositionMm', 'aimDirectionQ15', 'aimSampleTick',
        'authorityArrivalEstimates',
      ]);
      const id = semanticId(input.id, `${path}.id`);
      if (id === requester.id || playerIds.has(id)) {
        throw new InputAbort(`${path}.id`, 'Player identifiers must be unique and exclude the dead requester.');
      }
      playerIds.add(id);
      const teamId = nullableSemanticId(input.teamId, `${path}.teamId`);
      if (mode === 'deathmatch' && teamId !== null) {
        throw new InputAbort(`${path}.teamId`, 'Deathmatch players cannot carry teams.');
      }
      if (mode === 'team_deathmatch' && teamId === null) {
        throw new InputAbort(`${path}.teamId`, 'Team deathmatch players require authority teams.');
      }
      const aim = vector(input.aimDirectionQ15, `${path}.aimDirectionQ15`, -Q15, Q15);
      const aimMagnitude = Math.hypot(aim.x, aim.y, aim.z);
      if (aimMagnitude < Q15 - 64 || aimMagnitude > Q15 + 64) {
        throw new InputAbort(`${path}.aimDirectionQ15`, 'Aim direction must be normalized Q15.');
      }
      const arrivalIds = new Set<string>();
      const estimates = array(
        input.authorityArrivalEstimates,
        `${path}.authorityArrivalEstimates`,
        spawnIds.size,
      ).map((estimate, estimateIndex) => {
        const estimatePath = `${path}.authorityArrivalEstimates[${estimateIndex}]`;
        const value = record(estimate, estimatePath, ['spawnId', 'milliseconds']);
        const spawnId = semanticId(value.spawnId, `${estimatePath}.spawnId`);
        if (!spawnIds.has(spawnId) || arrivalIds.has(spawnId)) {
          throw new InputAbort(`${estimatePath}.spawnId`, 'Arrival estimate must reference one unique map spawn.');
        }
        arrivalIds.add(spawnId);
        return Object.freeze({
          spawnId,
          milliseconds: integer(value.milliseconds, `${estimatePath}.milliseconds`, 0, 120_000),
        });
      }).sort((left, right) => compareCodeUnits(left.spawnId, right.spawnId));
      const aimSampleTick = integer(input.aimSampleTick, `${path}.aimSampleTick`, 0, tick);
      return Object.freeze({
        id,
        teamId,
        feetPositionMm: vector(input.feetPositionMm, `${path}.feetPositionMm`),
        aimDirectionQ15: aim,
        aimSampleTick,
        authorityArrivalEstimates: Object.freeze(estimates),
      });
    }).sort((left, right) => compareCodeUnits(left.id, right.id));
    const recentDeaths = array(root.recentDeaths, '$.recentDeaths', MAX_HISTORY_ENTRIES)
      .map((entry, index) => {
        const path = `$.recentDeaths[${index}]`;
        const input = record(entry, path, ['playerId', 'feetPositionMm', 'tick']);
        return Object.freeze({
          playerId: semanticId(input.playerId, `${path}.playerId`),
          feetPositionMm: vector(input.feetPositionMm, `${path}.feetPositionMm`),
          tick: integer(input.tick, `${path}.tick`, 0, tick),
        });
      }).sort((left, right) => left.tick - right.tick
        || compareCodeUnits(left.playerId, right.playerId)
        || left.feetPositionMm.x - right.feetPositionMm.x
        || left.feetPositionMm.y - right.feetPositionMm.y
        || left.feetPositionMm.z - right.feetPositionMm.z);
    const recentSpawnUses = array(root.recentSpawnUses, '$.recentSpawnUses', MAX_HISTORY_ENTRIES)
      .map((entry, index) => {
        const path = `$.recentSpawnUses[${index}]`;
        const input = record(entry, path, ['spawnId', 'tick']);
        const spawnId = semanticId(input.spawnId, `${path}.spawnId`);
        if (!spawnIds.has(spawnId)) throw new InputAbort(`${path}.spawnId`, 'Unknown map spawn.');
        return Object.freeze({
          spawnId,
          tick: integer(input.tick, `${path}.tick`, 0, tick),
        });
      }).sort((left, right) => left.tick - right.tick || compareCodeUnits(left.spawnId, right.spawnId));
    const objectiveIds = new Set<string>();
    const objectives = array(root.objectives, '$.objectives', MAX_OBJECTIVES).map((entry, index) => {
      const path = `$.objectives[${index}]`;
      const input = record(entry, path, [
        'id', 'feetPositionMm', 'controllingTeamId', 'pressurePermille',
      ]);
      const id = semanticId(input.id, `${path}.id`);
      if (objectiveIds.has(id)) throw new InputAbort(`${path}.id`, 'Objective identifiers must be unique.');
      objectiveIds.add(id);
      return Object.freeze({
        id,
        feetPositionMm: vector(input.feetPositionMm, `${path}.feetPositionMm`),
        controllingTeamId: nullableSemanticId(input.controllingTeamId, `${path}.controllingTeamId`),
        pressurePermille: integer(input.pressurePermille, `${path}.pressurePermille`, 0, 1_000),
      });
    }).sort((left, right) => compareCodeUnits(left.id, right.id));
    return Object.freeze({
      schemaVersion: literal(root.schemaVersion, '$.schemaVersion', INPUT_SCHEMA_VERSION),
      mapId: literal(root.mapId, '$.mapId', INKFALL_MAP_ID),
      mapRevision: literal(root.mapRevision, '$.mapRevision', identity.mapRevision),
      fixtureHash: literal(root.fixtureHash, '$.fixtureHash', identity.fixtureHash),
      mode,
      tick,
      requester,
      players: Object.freeze(players),
      recentDeaths: Object.freeze(recentDeaths),
      recentSpawnUses: Object.freeze(recentSpawnUses),
      objectives: Object.freeze(objectives),
    });
  } catch (error) {
    if (error instanceof InputAbort) throw new SpawnAuthorityInputError(Object.freeze([error.issue]));
    throw error;
  }
}

function distance3d(left: MapVector3Millimeters, right: MapVector3Millimeters): number {
  return Math.round(Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z));
}

function distanceHorizontal(left: MapVector3Millimeters, right: MapVector3Millimeters): number {
  return Math.round(Math.hypot(left.x - right.x, left.z - right.z));
}

function addEyeHeight(position: MapVector3Millimeters, height: number): MapVector3Millimeters {
  return Object.freeze({ x: position.x, y: position.y + height, z: position.z });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizedInteger(value: number): number {
  const rounded = Math.round(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}

function sumComponents(components: SpawnScoreComponents): number {
  return Object.values(components).reduce((sum, value) => sum + value, 0);
}

function fnv1a64(source: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < source.length; index += 1) {
    const codePoint = source.codePointAt(index)!;
    if (codePoint > 0xffff) index += 1;
    const encoded = new TextEncoder().encode(String.fromCodePoint(codePoint));
    for (const byte of encoded) {
      hash ^= BigInt(byte);
      hash = BigInt.asUintN(64, hash * 0x100000001b3n);
    }
  }
  return hash.toString(16).padStart(16, '0');
}

function escapeQuality(families: readonly string[]): number {
  const quality: Readonly<Record<string, number>> = Object.freeze({
    press_hall: 100,
    ink_channel: 90,
    archive_walk: 90,
    crosslink: 70,
  });
  return families.length * 120 + families.reduce((sum, family) => sum + (quality[family] ?? 0), 0);
}

function territoryValid(
  spawn: MapSpawnV1,
  mode: SpawnMode,
  territory: TeamTerritory,
): boolean {
  if (mode === 'deathmatch') return spawn.set === 'deathmatch_candidate';
  if (territory === 'west') return spawn.set === 'west_team';
  if (territory === 'east') return spawn.set === 'east_team';
  return false;
}

function candidateInsideBounds(spawn: MapSpawnV1, loaded: LoadedRuntimeMapPackage): boolean {
  const { minimum, maximum } = loaded.identity.boundsMm;
  return (['x', 'y', 'z'] as const).every((axis) => (
    spawn.feetPositionMm[axis] >= minimum[axis] && spawn.feetPositionMm[axis] <= maximum[axis]
  ));
}

export class InkfallSpawnAuthority {
  private readonly lineOfSight: FixtureAuthorityLineOfSight;
  private readonly spawns: readonly MapSpawnV1[];
  private readonly spawnIds: ReadonlySet<string>;
  private readonly identity: InkfallAuthorityMapIdentity;

  constructor(loaded: LoadedRuntimeMapPackage) {
    const identity = findInkfallAuthorityMapIdentity(loaded.identity.revision);
    if (!identity
      || loaded.identity.id !== INKFALL_MAP_ID
      || loaded.identity.packageDigest !== identity.packageDigest
      || loaded.authority.fixtureHash !== identity.fixtureHash
      || loaded.authority.fixture.solids.length !== identity.colliderCardinality
      || loaded.manifest.authority.renderMeshesMayBeAuthority !== false) {
      throw new Error('SPAWN_AUTHORITY_MAP_IDENTITY_MISMATCH');
    }
    this.identity = identity;
    const ordered = [...loaded.manifest.spawns]
      .sort((left, right) => compareCodeUnits(left.id, right.id));
    const ids = new Set<string>();
    for (const spawn of ordered) {
      if (ids.has(spawn.id)
        || spawn.validationStatus !== 'capsule_clear_unscored'
        || spawn.escapeRouteFamilies.length < 2
        || new Set(spawn.escapeRouteFamilies).size !== spawn.escapeRouteFamilies.length
        || !candidateInsideBounds(spawn, loaded)) {
        throw new Error(`SPAWN_AUTHORITY_INVALID_CANDIDATE ${spawn.id}`);
      }
      ids.add(spawn.id);
    }
    if (ordered.length !== 12) throw new Error('SPAWN_AUTHORITY_CANDIDATE_COUNT_MISMATCH');
    this.spawns = Object.freeze(ordered);
    this.spawnIds = ids;
    this.lineOfSight = new FixtureAuthorityLineOfSight(loaded.authority.fixture);
  }

  select(source: unknown): AuthoritySpawnSelectionResultV1 {
    const input = validateInput(source, this.spawnIds, this.identity);
    const enemies = input.mode === 'deathmatch'
      ? input.players
      : input.players.filter((player) => player.teamId !== input.requester.teamId);
    const teammates = input.mode === 'team_deathmatch'
      ? input.players.filter((player) => player.teamId === input.requester.teamId)
      : [];
    const evaluations = this.spawns.map((spawn): SpawnCandidateEvaluation => {
      const rejectionReasons: string[] = [];
      const modeValid = territoryValid(spawn, input.mode, input.requester.territory);
      if (!modeValid) rejectionReasons.push('mode_team_territory_invalid');
      const occupiedBy = input.players.filter((player) => (
        distanceHorizontal(spawn.feetPositionMm, player.feetPositionMm) < OCCUPANCY_RADIUS_MM
        && Math.abs(spawn.feetPositionMm.y - player.feetPositionMm.y) < OCCUPANCY_VERTICAL_MM
      ));
      if (occupiedBy.length > 0) rejectionReasons.push('authority_occupancy_overlap');

      const enemyEvaluations = enemies.map((enemy): SpawnEnemyEvaluation => {
        const enemyEye = addEyeHeight(enemy.feetPositionMm, STANDING_EYE_HEIGHT_MM);
        const standingTrace = this.lineOfSight.trace(
          enemyEye,
          addEyeHeight(spawn.feetPositionMm, STANDING_EYE_HEIGHT_MM),
        );
        const crouchedTrace = this.lineOfSight.trace(
          enemyEye,
          addEyeHeight(spawn.feetPositionMm, CROUCHED_EYE_HEIGHT_MM),
        );
        const standingLineOfSight = !standingTrace.blocked;
        const crouchedLineOfSight = !crouchedTrace.blocked;
        const delta = {
          x: spawn.feetPositionMm.x - enemy.feetPositionMm.x,
          y: spawn.feetPositionMm.y - enemy.feetPositionMm.y,
          z: spawn.feetPositionMm.z - enemy.feetPositionMm.z,
        };
        const distanceMm = Math.round(Math.hypot(delta.x, delta.y, delta.z));
        const directionScale = distanceMm > 0 ? Q15 / distanceMm : 0;
        const towardQ15 = distanceMm > 0 ? Math.round((
          enemy.aimDirectionQ15.x * delta.x * directionScale
          + enemy.aimDirectionQ15.y * delta.y * directionScale
          + enemy.aimDirectionQ15.z * delta.z * directionScale
        ) / Q15) : Q15;
        const aimSampleAgeTicks = input.tick - enemy.aimSampleTick;
        const aimAlignmentPermille = aimSampleAgeTicks <= RECENT_AIM_WINDOW_TICKS
          ? clamp(Math.round((Math.max(0, towardQ15) * 1_000) / Q15), 0, 1_000)
          : 0;
        const directArrival = Math.round((distanceMm * 1_000) / AUTHORITY_RUN_SPEED_MM_PER_SECOND);
        const routeArrival = enemy.authorityArrivalEstimates
          .find((estimate) => estimate.spawnId === spawn.id)?.milliseconds;
        const useRoute = routeArrival !== undefined && routeArrival < directArrival;
        const arrivalTimeMs = useRoute ? routeArrival : directArrival;
        const exposedSamples = Number(standingLineOfSight) + Number(crouchedLineOfSight);
        const components = Object.freeze({
          distanceSafety: clamp(Math.round((distanceMm * 400) / 40_000), 0, 400),
          lineOfSightExposure: exposedSamples === 0 ? 0 : -2_500 * exposedSamples,
          recentAimAlignment: normalizedInteger(-(aimAlignmentPermille * 600) / 1_000),
          travelArrivalPressure: normalizedInteger(-(
            Math.max(0, ARRIVAL_PRESSURE_WINDOW_MS - arrivalTimeMs) * 800
          ) / ARRIVAL_PRESSURE_WINDOW_MS),
        });
        return Object.freeze({
          enemyId: enemy.id,
          distanceMm,
          standingLineOfSight,
          standingBlockerId: standingTrace.colliderId,
          crouchedLineOfSight,
          crouchedBlockerId: crouchedTrace.colliderId,
          aimAlignmentPermille,
          aimSampleAgeTicks,
          arrivalTimeMs,
          arrivalSource: useRoute ? 'authority_route_probe' : 'spatial_lower_bound',
          components,
        });
      });
      if (enemyEvaluations.some((enemy) => enemy.standingLineOfSight || enemy.crouchedLineOfSight)) {
        rejectionReasons.push('direct_enemy_line_of_sight');
      }
      const deathPenalty = input.recentDeaths.reduce((sum, death) => {
        const age = input.tick - death.tick;
        if (age >= RECENT_DEATH_WINDOW_TICKS) return sum;
        const distance = distance3d(spawn.feetPositionMm, death.feetPositionMm);
        if (distance >= RECENT_DEATH_RADIUS_MM) return sum;
        const base = death.playerId === input.requester.id ? 1_200 : 400;
        return sum - Math.round(
          (base * (RECENT_DEATH_WINDOW_TICKS - age) * (RECENT_DEATH_RADIUS_MM - distance))
          / (RECENT_DEATH_WINDOW_TICKS * RECENT_DEATH_RADIUS_MM),
        );
      }, 0);
      const recentUsePenalty = input.recentSpawnUses.reduce((sum, use) => {
        const age = input.tick - use.tick;
        return use.spawnId === spawn.id && age < RECENT_USE_WINDOW_TICKS
          ? sum - Math.round((1_000 * (RECENT_USE_WINDOW_TICKS - age)) / RECENT_USE_WINDOW_TICKS)
          : sum;
      }, 0);
      const teammateDistances = teammates.map((player) => distance3d(spawn.feetPositionMm, player.feetPositionMm));
      const nearestTeammate = teammateDistances.length > 0 ? Math.min(...teammateDistances) : null;
      const teammateSupport = nearestTeammate === null ? 0 : clamp(
        300 - Math.round((Math.abs(nearestTeammate - 12_000) * 300) / 12_000),
        0,
        300,
      );
      const clusteredTeammates = teammateDistances.filter((distance) => distance < TEAM_CLUSTER_RADIUS_MM).length;
      const teamClustering = clusteredTeammates === 0
        ? 0
        : -350 * clusteredTeammates - (clusteredTeammates > 2 ? 500 : 0);
      const objectivePressure = input.objectives.reduce((sum, objective) => {
        const distance = distance3d(spawn.feetPositionMm, objective.feetPositionMm);
        if (distance >= 20_000) return sum;
        const proximityPermille = Math.round(((20_000 - distance) * 1_000) / 20_000);
        const friendly = input.mode === 'team_deathmatch'
          && objective.controllingTeamId !== null
          && objective.controllingTeamId === input.requester.teamId;
        const scale = friendly ? 200 : -500;
        return sum + normalizedInteger(
          (scale * proximityPermille * objective.pressurePermille) / 1_000_000,
        );
      }, 0);
      const components = Object.freeze({
        enemyDistanceSafety: enemyEvaluations.reduce((sum, enemy) => sum + enemy.components.distanceSafety, 0),
        lineOfSightExposure: enemyEvaluations.reduce((sum, enemy) => sum + enemy.components.lineOfSightExposure, 0),
        recentEnemyAimAlignment: enemyEvaluations.reduce((sum, enemy) => sum + enemy.components.recentAimAlignment, 0),
        enemyTravelArrivalPressure: enemyEvaluations.reduce((sum, enemy) => sum + enemy.components.travelArrivalPressure, 0),
        recentDeathLocation: deathPenalty,
        recentSpawnUse: recentUsePenalty,
        teammateSupport,
        teamClustering,
        objectiveProximityPressure: objectivePressure,
        occupancy: occupiedBy.length > 0 ? -10_000 * occupiedBy.length : 0,
        modeTeamTerritory: modeValid ? 0 : -100_000,
        escapeRouteCountQuality: escapeQuality(spawn.escapeRouteFamilies),
      });
      return Object.freeze({
        spawnId: spawn.id,
        set: spawn.set,
        feetPositionMm: spawn.feetPositionMm,
        yawMilliDegrees: spawn.yawMilliDegrees,
        eligible: rejectionReasons.length === 0,
        rejectionReasons: Object.freeze(rejectionReasons),
        score: sumComponents(components),
        components,
        enemies: Object.freeze(enemyEvaluations),
        objectivePolicy: input.objectives.length === 0
          ? 'neutral_no_objectives'
          : 'authority_objectives_applied',
        escapeRouteFamilies: spawn.escapeRouteFamilies,
      });
    });
    const ranking = evaluations.filter((evaluation) => evaluation.eligible).sort((left, right) => (
      right.score - left.score || compareCodeUnits(left.spawnId, right.spawnId)
    ));
    const winner = ranking[0] ?? null;
    const selected = winner === null ? null : Object.freeze({
      spawnId: winner.spawnId,
      feetPositionMm: winner.feetPositionMm,
      yawMilliDegrees: winner.yawMilliDegrees,
      score: winner.score,
    });
    const decisionSource = JSON.stringify({
      mapId: input.mapId,
      mapRevision: input.mapRevision,
      fixtureHash: input.fixtureHash,
      mode: input.mode,
      tick: input.tick,
      requester: input.requester,
      players: input.players,
      recentDeaths: input.recentDeaths,
      recentSpawnUses: input.recentSpawnUses,
      objectives: input.objectives,
      selected,
      evaluations,
    });
    return Object.freeze({
      schemaVersion: RESULT_SCHEMA_VERSION,
      status: winner ? 'selected' : 'no_safe_spawn',
      mapId: INKFALL_MAP_ID,
      mapRevision: this.identity.mapRevision,
      fixtureHash: this.identity.fixtureHash,
      mode: input.mode,
      tick: input.tick,
      selected,
      evaluations: Object.freeze(evaluations),
      decisionHash: fnv1a64(decisionSource),
      authorityBoundary: 'server_state_and_authority_collision_only',
      clientPositionOrScoreAccepted: false,
      nonClaims: Object.freeze([
        'P6.5_NOT_CLAIMED',
        'P6.6_NOT_CLAIMED',
        'G5_NOT_PASSED',
      ] as const),
    });
  }
}

export function createInkfallSpawnAuthority(
  loaded: LoadedRuntimeMapPackage,
): InkfallSpawnAuthority {
  return new InkfallSpawnAuthority(loaded);
}

export const INKFALL_SPAWN_AUTHORITY_CONTRACT = Object.freeze({
  inputSchemaVersion: INPUT_SCHEMA_VERSION,
  resultSchemaVersion: RESULT_SCHEMA_VERSION,
  mapId: INKFALL_MAP_ID,
  mapRevision: INKFALL_MAP_REVISION,
  packageDigest: INKFALL_PACKAGE_DIGEST,
  fixtureHash: INKFALL_FIXTURE_HASH,
  supportedMapRevisions: Object.freeze(INKFALL_AUTHORITY_MAP_IDENTITIES.map(
    ({ mapRevision }) => mapRevision,
  )),
  tickMilliseconds: TICK_MILLISECONDS,
  standingEyeHeightMm: STANDING_EYE_HEIGHT_MM,
  crouchedEyeHeightMm: CROUCHED_EYE_HEIGHT_MM,
  authorityRunSpeedMmPerSecond: AUTHORITY_RUN_SPEED_MM_PER_SECOND,
  arrivalPressureWindowMs: ARRIVAL_PRESSURE_WINDOW_MS,
  occupancyRadiusMm: OCCUPANCY_RADIUS_MM,
  occupancyVerticalMm: OCCUPANCY_VERTICAL_MM,
  recentAimWindowTicks: RECENT_AIM_WINDOW_TICKS,
  recentDeathWindowTicks: RECENT_DEATH_WINDOW_TICKS,
  recentDeathRadiusMm: RECENT_DEATH_RADIUS_MM,
  recentUseWindowTicks: RECENT_USE_WINDOW_TICKS,
  teamClusterRadiusMm: TEAM_CLUSTER_RADIUS_MM,
  lineOfSightPolicy: 'standing_or_crouched_direct_los_rejects_candidate' as const,
  tieBreak: 'score_desc_then_spawn_id_code_unit_asc' as const,
  objectivePolicyWhenEmpty: 'neutral_no_objectives' as const,
});
