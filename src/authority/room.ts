import {
  PROTOCOL_LIMITS,
  PROTOCOL_VERSION,
  type InputBatchMessage,
  type SnapshotEntity,
} from '../net/protocol';
import { validateClientMessage } from '../net/schemas';
import {
  asEntityId,
  asMillimeters,
  asMillimetersPerSecond,
  asQuantizedAxis,
  asSimulationTick,
  assertMovementProfile,
  assertMovementSimulationState,
  createMovementSimulationState,
  hashMovementProfile,
  INTENT_BUTTON,
  stepMovementSimulation,
  type MovementProfileV1,
  type MovementQueryMetrics,
  type MovementQueryPort,
  type MovementSemanticEvent,
  type MovementSimulationState,
} from '../sim';
import {
  BoundedInputQueue,
  DEFAULT_MAX_COMMANDS_PER_AUTHORITY_TICK,
  type BoundedInputQueueCheckpointV1,
  type InputQueueEnqueueResult,
  type InputQueueRejectionReason,
} from './inputQueue';
import {
  advanceAutoRifle,
  advanceImpulseGrenadeAbility,
  advanceImpulseGrenadeProjectile,
  assertAbilityResourceIntegrationRules,
  assertAuthorityTdmMatchRules,
  assertAutoRifleState,
  applyAuthoritativeDamage,
  applyAuthoritativeRespawn,
  createAuthorityTdmMatchState,
  createAuthorityTeleportResourceEvents,
  createAutoRifleState,
  createCombatLifeState,
  createImpulseGrenadeAbilityState,
  createImpulseGrenadeProjectile,
  createTargetPoseHistory,
  deriveAuthorityAbilityResources,
  endSpawnProtectionOnAcceptedOffense,
  G4_ABILITY_RESOURCE_INTEGRATION_RULES,
  G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_HASH,
  G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_ID,
  G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_REVISION,
  G4_AUTO_RIFLE_RULES,
  G4_IMPULSE_GRENADE_RULES,
  G4_TDM_MATCH_RULES,
  KYX_STANDARD_HUMANOID_HIT_VOLUMES_V1,
  G4_COMBAT_SLICE_LIFE_RULES,
  impulseGrenadeDirectionQ15FromLook,
  IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
  markImpulseGrenadeAbilityDead,
  prepareAuthorityTdmMatchTick,
  recordAuthorityTdmCombat,
  recordAuthorityTdmRespawn,
  recordTargetPoseSample,
  assertTargetPoseHistory,
  registerAuthorityTdmPlayer,
  resetImpulseGrenadeAbilityForRespawn,
  resolveImpulseGrenadeRadialImpulse,
  resolveAuthoritativeAutoRifleHitscan,
  settleAuthorityTdmMatchTick,
  startAuthorityTdmMatch,
  type ApplyAuthoritativeDamageResult,
  type ApplyAuthoritativeRespawnResult,
  type AuthorityAbilityResourceSnapshotV1,
  type AuthorityImpulseGrenadeWorldPort,
  type AuthorityTdmMatchEvent,
  type AuthorityTdmMatchStateV1,
  type AuthorityTeleportMovementOutcomeV1,
  type AuthorityTeleportResourceEvent,
  type AuthorityWorldOcclusionPort,
  type AutoRifleShotAcceptedEvent,
  type AutoRifleEvent,
  type AutoRifleState,
  type AuthoritativeAutoRifleHitscanRequestV1,
  type CombatLifeState,
  type ImpulseGrenadeAbilityState,
  type ImpulseGrenadeDetonatedEvent,
  type ImpulseGrenadeEvent,
  type ImpulseGrenadeProjectileState,
  type ObservedRttSampleV1,
  type ResolveImpulseGrenadeRadialResult,
  type ResolveAuthoritativeHitscanResult,
  type TargetPoseHistoryV1,
} from './combat';
import { assertStrictCombatDataTree } from './combat/strictCombatData';

export const G4_COMBAT_RULESET_ID = 'revamped_classic' as const;
export const G4_COMBAT_RULESET_REVISION = 3 as const;
export const G4_COMBAT_RULESET_HASH = 'd5f0418d1d927370' as const;
export const G4_COMBAT_ROOM_PROFILE_ID = 'revamped_classic_g4_v1' as const;
export const G4_HITSCAN_ROOM_CAPABILITY_ID = 'authoritative_hitscan_v1' as const;
export const G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID =
  'authoritative_impulse_grenade_v1' as const;
export const G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID =
  'authoritative_ability_resources_teleport_v1' as const;
export const G4_TDM_MATCH_ROOM_CAPABILITY_ID = 'authoritative_tdm_match_v1' as const;

export type RoomLifecycle =
  | 'created'
  | 'lobby'
  | 'warmup'
  | 'active'
  | 'postmatch'
  | 'idle'
  | 'expired';

export interface AuthorityRoomIdentity {
  readonly roomId: string;
  readonly matchId: string;
  readonly rulesetId: string;
  readonly rulesetRevision: number;
  readonly rulesetHash: string;
  readonly mapId: string;
  readonly fixtureId: string;
  readonly fixtureHash: string;
  readonly physicsAdapterId: string;
  readonly physicsAdapterVersion: string;
}

export interface AuthorityRoomOptions {
  readonly identity: AuthorityRoomIdentity;
  readonly profile: MovementProfileV1;
  readonly queries: MovementQueryPort;
  readonly maximumPlayers?: number;
  readonly commandsPerPlayerPerTick?: number;
  readonly warmupTicks?: number;
  readonly activeTicks?: number;
  readonly postmatchTicks?: number;
  readonly reconnectGraceTicks?: number;
  readonly minimumConnectedPlayersToStart?: number;
  readonly spawnResolver?: AuthoritySpawnResolver;
  readonly combat?: AuthorityRoomCombatOptions;
}

export interface AuthorityRoomCombatOptions {
  readonly profileId: typeof G4_COMBAT_ROOM_PROFILE_ID;
  readonly teamResolver?: AuthorityTeamResolver;
  readonly hitscan?: AuthorityRoomHitscanOptions;
  readonly impulseGrenade?: AuthorityRoomImpulseGrenadeOptions;
  readonly abilityResources?: AuthorityRoomAbilityResourceOptions;
  readonly match?: AuthorityRoomTdmMatchOptions;
}

export interface AuthorityRoomHitscanOptions {
  readonly capabilityId: typeof G4_HITSCAN_ROOM_CAPABILITY_ID;
  readonly worldOcclusion: AuthorityWorldOcclusionPort;
}

export interface AuthorityRoomImpulseGrenadeOptions {
  readonly capabilityId: typeof G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID;
  readonly world: AuthorityImpulseGrenadeWorldPort;
}

export interface AuthorityRoomAbilityResourceOptions {
  readonly capabilityId: typeof G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID;
}

export interface AuthorityRoomTdmMatchOptions {
  readonly capabilityId: typeof G4_TDM_MATCH_ROOM_CAPABILITY_ID;
}

export interface JoinNewAuthorityPlayerOptions {
  readonly playerId: string;
  readonly connectionId: string;
}

/**
 * Transport adapters may call this only after validating a server-issued
 * resume credential. Knowledge of a player id alone is never wire authority.
 */
export interface ResumeAuthorityPlayerOptions {
  readonly playerId: string;
  readonly connectionId: string;
}

export interface AuthoritySpawn {
  readonly spawnId?: string;
  readonly feetPosition: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>;
  readonly yawMilliDegrees?: number;
}

export type AuthoritySpawnResolver = (playerId: string, playerOrdinal: number) => AuthoritySpawn;
export type AuthorityTeamResolver = (playerId: string, playerOrdinal: number) => string | null;

export interface AuthorityRoomDamageRequest {
  readonly targetPlayerId: string;
  readonly sourcePlayerId: string | null;
  readonly damagePoints: number;
  readonly causeId: string;
}

export type AuthorityJoinResult =
  | {
      readonly ok: true;
      readonly connectionMode: 'joined' | 'resumed';
      readonly snapshot: AuthorityFullSnapshot;
    }
  | {
      readonly ok: false;
      readonly reason:
        | 'room_expired'
        | 'room_full'
        | 'duplicate_player'
        | 'duplicate_connection'
        | 'resume_rejected'
        | 'match_incompatible';
    };

export interface AuthorityPlayerSnapshot {
  readonly playerId: string;
  readonly connected: boolean;
  readonly lastProcessedInputSequence: number;
  readonly movement: MovementSimulationState;
  readonly combat?: {
    readonly life: CombatLifeState;
    readonly autoRifle: AutoRifleState;
    readonly impulseGrenade?: ImpulseGrenadeAbilityState;
    readonly abilityResources?: AuthorityAbilityResourceSnapshotV1;
  };
}

export interface AuthorityFullSnapshot {
  readonly kind: 'authority_full_snapshot';
  readonly identity: AuthorityRoomIdentity & {
    readonly movementProfileId: string;
    readonly movementProfileRevision: number;
    readonly movementProfileHash: string;
  };
  readonly serverTick: number;
  readonly lifecycle: RoomLifecycle;
  readonly phaseEndsAtTick: number | null;
  readonly players: readonly AuthorityPlayerSnapshot[];
  readonly impulseGrenadeProjectiles?: readonly ImpulseGrenadeProjectileState[];
  readonly match?: AuthorityTdmMatchStateV1;
}

export const AUTHORITY_ACTIVE_MATCH_CHECKPOINT_SCHEMA_VERSION = 1 as const;

export interface AuthorityActiveMatchCheckpointPlayerV1 {
  readonly playerOrdinal: number;
  readonly playerId: string;
  readonly connectionId: string | null;
  readonly connected: boolean;
  readonly disconnectedAtTick: number | null;
  readonly movement: MovementSimulationState;
  readonly life: CombatLifeState;
  readonly autoRifle: AutoRifleState;
  readonly impulseGrenade: ImpulseGrenadeAbilityState;
  readonly poseHistory: TargetPoseHistoryV1;
  readonly observedRttHistory: readonly ObservedRttSampleV1[];
  readonly inputQueue: BoundedInputQueueCheckpointV1;
}

export interface AuthorityActiveMatchCheckpointV1 {
  readonly kind: 'authority_active_match_checkpoint';
  readonly schemaVersion: typeof AUTHORITY_ACTIVE_MATCH_CHECKPOINT_SCHEMA_VERSION;
  readonly identity: AuthorityFullSnapshot['identity'];
  readonly options: {
    readonly maximumPlayers: number;
    readonly commandsPerPlayerPerTick: number;
    readonly warmupTicks: number;
    readonly activeTicks: number;
    readonly postmatchTicks: number;
    readonly reconnectGraceTicks: number;
    readonly minimumConnectedPlayersToStart: number;
    readonly combatProfileId: typeof G4_COMBAT_ROOM_PROFILE_ID;
    readonly hitscanCapabilityId: typeof G4_HITSCAN_ROOM_CAPABILITY_ID;
    readonly impulseGrenadeCapabilityId: typeof G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID;
    readonly abilityResourceCapabilityId: typeof G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID;
    readonly tdmMatchCapabilityId: typeof G4_TDM_MATCH_ROOM_CAPABILITY_ID;
  };
  readonly clock: {
    readonly serverTick: number;
    readonly lifecycle: 'warmup' | 'active' | 'postmatch';
    readonly phaseStartedAtTick: number;
    readonly matchStarted: true;
  };
  readonly counters: {
    readonly acceptedInputs: number;
    readonly inputRejections: Readonly<Record<InputQueueRejectionReason, number>>;
    readonly maximumObservedQueueDepth: number;
    readonly missedSchedulerTicks: number;
    readonly cumulativeQueryMetrics: MovementQueryMetrics;
    readonly nextCombatEventSequence: number;
  };
  readonly players: readonly AuthorityActiveMatchCheckpointPlayerV1[];
  readonly impulseGrenadeProjectiles: readonly ImpulseGrenadeProjectileState[];
  readonly match: AuthorityTdmMatchStateV1;
  readonly pendingMatchEvents: readonly AuthorityTdmMatchEvent[];
}

export interface AuthorityRoomTickResult {
  readonly serverTick: number;
  readonly lifecycle: RoomLifecycle;
  readonly lifecycleTransitions: readonly RoomLifecycle[];
  readonly movementEvents: readonly MovementSemanticEvent[];
  readonly queryMetrics: MovementQueryMetrics;
  readonly prunedPlayerIds: readonly string[];
  readonly combatEvents?: readonly AutoRifleEvent[];
  readonly hitscanResults?: readonly AuthorityRoomHitscanTickResult[];
  readonly impulseGrenadeEvents?: readonly ImpulseGrenadeEvent[];
  readonly impulseGrenadeResults?: readonly AuthorityRoomImpulseGrenadeTickResult[];
  readonly abilityResourceEvents?: readonly AuthorityTeleportResourceEvent[];
  readonly matchEvents?: readonly AuthorityTdmMatchEvent[];
}

export type AuthorityRoomDamageResult =
  | (Extract<ApplyAuthoritativeDamageResult, { readonly accepted: true }> & {
      readonly matchEvents?: readonly AuthorityTdmMatchEvent[];
    })
  | Extract<ApplyAuthoritativeDamageResult, { readonly accepted: false }>;

export type AuthorityRoomRespawnResult =
  | (Extract<ApplyAuthoritativeRespawnResult, { readonly accepted: true }> & {
      readonly matchEvents?: readonly AuthorityTdmMatchEvent[];
    })
  | Extract<ApplyAuthoritativeRespawnResult, { readonly accepted: false }>;

export type AuthorityRoomHitscanRejectionReason = 'server_rtt_history_unavailable';

export interface AuthorityRoomHitscanTickResult {
  readonly resolutionOrdinal: number;
  readonly acceptedShot: AutoRifleShotAcceptedEvent;
  readonly roomRejectionReason: AuthorityRoomHitscanRejectionReason | null;
  readonly resolution: ResolveAuthoritativeHitscanResult | null;
  readonly damage: AuthorityRoomDamageResult | null;
}

export interface AuthorityRoomImpulseGrenadeTickResult {
  readonly resolutionOrdinal: number;
  readonly detonation: ImpulseGrenadeDetonatedEvent;
  readonly radial: ResolveImpulseGrenadeRadialResult;
}

export interface AuthorityRoomMetricsSnapshot {
  readonly serverTick: number;
  readonly lifecycle: RoomLifecycle;
  readonly players: number;
  readonly connectedPlayers: number;
  readonly ticks: number;
  readonly acceptedInputs: number;
  readonly inputRejections: Readonly<Record<InputQueueRejectionReason, number>>;
  readonly maximumObservedQueueDepth: number;
  readonly missedSchedulerTicks: number;
  readonly queryMetrics: MovementQueryMetrics;
}

interface AuthorityPlayerRecord {
  readonly playerOrdinal: number;
  readonly playerId: string;
  connectionId: string | null;
  connected: boolean;
  disconnectedAtTick: number | null;
  state: MovementSimulationState;
  life: CombatLifeState | null;
  autoRifle: AutoRifleState | null;
  impulseGrenade: ImpulseGrenadeAbilityState | null;
  poseHistory: TargetPoseHistoryV1 | null;
  observedRttHistory: readonly ObservedRttSampleV1[] | null;
  readonly queue: BoundedInputQueue;
}

interface PendingAcceptedRoomShot {
  readonly playerId: string;
  readonly shot: AutoRifleShotAcceptedEvent;
}

interface PendingRoomHitscanResolution {
  readonly shot: AutoRifleShotAcceptedEvent;
  readonly request: AuthoritativeAutoRifleHitscanRequestV1 | null;
  readonly roomRejectionReason: AuthorityRoomHitscanRejectionReason | null;
}

const EMPTY_QUERY_METRICS: MovementQueryMetrics = Object.freeze({
  moveCapsuleCalls: 0,
  overlapCapsuleCalls: 0,
  castCapsuleCalls: 0,
  volumeCalls: 0,
  shapeCasts: 0,
  overlapTests: 0,
  contacts: 0,
});

const ROOM_HITSCAN_RTT_HISTORY_CAPACITY = 16;
const ROOM_HITSCAN_MAX_RTT_MILLISECONDS = 20_000;
const STANDARD_HUMANOID_VOLUME_TOP_MILLIMETERS = 1_940;

function signedYawMilliDegrees(value: number): number {
  return value > 180_000 ? value - 360_000 : value;
}

function scaledRoomHitVolumes(
  state: MovementSimulationState,
  profile: MovementProfileV1,
) {
  const shape = state.player.stance === 'crouched'
    ? profile.crouchedShape
    : profile.standingShape;
  return KYX_STANDARD_HUMANOID_HIT_VOLUMES_V1.map((volume) => ({
    schemaVersion: 1 as const,
    volumeId: volume.volumeId,
    region: volume.region,
    centerOffsetMillimeters: {
      x: volume.centerOffsetMillimeters.x,
      y: Math.round(
        volume.centerOffsetMillimeters.y
          * shape.height
          / STANDARD_HUMANOID_VOLUME_TOP_MILLIMETERS,
      ),
      z: volume.centerOffsetMillimeters.z,
    },
    halfExtentsMillimeters: {
      x: volume.halfExtentsMillimeters.x,
      y: Math.max(1, Math.round(
        volume.halfExtentsMillimeters.y
          * shape.height
          / STANDARD_HUMANOID_VOLUME_TOP_MILLIMETERS,
      )),
      z: volume.halfExtentsMillimeters.z,
    },
  }));
}

function authorityAimOffsets(
  state: MovementSimulationState,
  profile: MovementProfileV1,
) {
  const shape = state.player.stance === 'crouched'
    ? profile.crouchedShape
    : profile.standingShape;
  const eyeHeight = Math.max(shape.radius, shape.height - 100);
  return {
    eyeOffsetMillimeters: { x: 0, y: eyeHeight, z: 0 },
    muzzleOffsetMillimeters: { x: 0, y: eyeHeight, z: 200 },
  };
}

function authorityImpulseGrenadeOrigin(
  state: MovementSimulationState,
  profile: MovementProfileV1,
) {
  const aimOffsets = authorityAimOffsets(state, profile);
  const direction = impulseGrenadeDirectionQ15FromLook(
    signedYawMilliDegrees(state.player.yawMilliDegrees),
    state.player.pitchMilliDegrees,
  );
  return Object.freeze({
    x: state.player.feetPosition.x + Math.round(direction.x * 200 / 32_767),
    y: state.player.feetPosition.y
      + aimOffsets.eyeOffsetMillimeters.y
      + Math.round(direction.y * 200 / 32_767),
    z: state.player.feetPosition.z + Math.round(direction.z * 200 / 32_767),
  });
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function stableId(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > PROTOCOL_LIMITS.maxIdBytes
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(value)
  ) {
    throw new RangeError(`${label} must be a stable protocol identifier`);
  }
  return value;
}

function stableHash(value: string, label: string): string {
  if (typeof value !== 'string' || !/^(?:[a-f0-9]{16}|[a-f0-9]{64})$/u.test(value)) {
    throw new RangeError(`${label} must be a lowercase 64-bit or 256-bit hexadecimal hash`);
  }
  return value;
}

function exactKeys(value: object, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} contains unsupported or missing fields`);
  }
}

function allowedKeys(value: object, allowed: readonly string[], label: string): void {
  const accepted = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !accepted.has(key));
  if (unknown !== undefined) throw new TypeError(`${label} contains unsupported field: ${unknown}`);
}

function optionalStableId(value: unknown, label: string): string | null {
  return value === null ? null : stableId(value, label);
}

function snapshotPlainDataRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain data object`);
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain data object`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(`${label} must not contain symbol fields`);
  }
  const snapshot: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (!Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`${label} must contain data properties only`);
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function addQueryMetrics(left: MovementQueryMetrics, right: MovementQueryMetrics): MovementQueryMetrics {
  return {
    moveCapsuleCalls: left.moveCapsuleCalls + right.moveCapsuleCalls,
    overlapCapsuleCalls: left.overlapCapsuleCalls + right.overlapCapsuleCalls,
    castCapsuleCalls: left.castCapsuleCalls + right.castCapsuleCalls,
    volumeCalls: left.volumeCalls + right.volumeCalls,
    shapeCasts: left.shapeCasts + right.shapeCasts,
    overlapTests: left.overlapTests + right.overlapTests,
    contacts: left.contacts + right.contacts,
  };
}

function emptyRejections(): Record<InputQueueRejectionReason, number> {
  return {
    duplicate_sequence: 0,
    stale_sequence: 0,
    sequence_too_far_ahead: 0,
    client_tick_too_far_ahead: 0,
    client_tick_too_old: 0,
    queue_full: 0,
  };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

const ACTIVE_MATCH_CHECKPOINT_MAX_TICK = Number.MAX_SAFE_INTEGER - 100_000;

function checkpointRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record`);
  }
  exactKeys(value, expectedKeys, label);
  return value as Record<string, unknown>;
}

function checkpointArray(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
  label: string,
): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimumLength || value.length > maximumLength) {
    throw new RangeError(
      `${label} must contain ${minimumLength} through ${maximumLength} entries`,
    );
  }
  return value;
}

function checkpointInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function checkpointBoolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean`);
  return value;
}

function checkpointLiteral<T>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new RangeError(`${label} must equal ${String(expected)}`);
  return expected;
}

function checkpointFlatRecordMatches(
  value: unknown,
  expected: Readonly<Record<string, string | number | boolean | null>>,
  label: string,
): void {
  const record = checkpointRecord(value, Object.keys(expected), label);
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (record[key] !== expectedValue) {
      throw new RangeError(`${label}.${key} does not match the running authority`);
    }
  }
}

function checkpointVector(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): Readonly<{ readonly x: number; readonly y: number; readonly z: number }> {
  const record = checkpointRecord(value, ['x', 'y', 'z'], label);
  return Object.freeze({
    x: checkpointInteger(record.x, minimum, maximum, `${label}.x`),
    y: checkpointInteger(record.y, minimum, maximum, `${label}.y`),
    z: checkpointInteger(record.z, minimum, maximum, `${label}.z`),
  });
}

function validateCheckpointCombatLife(
  value: unknown,
  playerId: string,
  serverTick: number,
  nextCombatEventSequence: number,
): CombatLifeState {
  const state = checkpointRecord(value, [
    'schemaVersion', 'playerId', 'teamId', 'phase', 'healthPoints', 'shieldPoints',
    'spawnOrdinal', 'deathOrdinal', 'protectedUntilTickExclusive', 'respawnEligibleAtTick',
    'lastSpawnId', 'lastDiscontinuity', 'damageContributions',
    'lastProcessedCombatEventSequence',
  ], 'authority checkpoint combat life state');
  checkpointLiteral(state.schemaVersion, 1, 'combat life state schema');
  checkpointLiteral(state.playerId, playerId, 'combat life player id');
  optionalStableId(state.teamId, 'combat life team id');
  if (state.phase !== 'alive' && state.phase !== 'dead') {
    throw new RangeError('combat life phase is unsupported');
  }
  const healthPoints = checkpointInteger(
    state.healthPoints,
    0,
    G4_COMBAT_SLICE_LIFE_RULES.maximumHealthPoints,
    'combat life health',
  );
  checkpointLiteral(
    state.shieldPoints,
    G4_COMBAT_SLICE_LIFE_RULES.maximumShieldPoints,
    'combat life shield',
  );
  const spawnOrdinal = checkpointInteger(state.spawnOrdinal, 1, 1_000_000, 'spawn ordinal');
  const deathOrdinal = checkpointInteger(state.deathOrdinal, 0, 1_000_000, 'death ordinal');
  checkpointInteger(
    state.protectedUntilTickExclusive,
    0,
    ACTIVE_MATCH_CHECKPOINT_MAX_TICK,
    'spawn protection tick',
  );
  stableId(state.lastSpawnId, 'combat life last spawn id');
  const discontinuity = checkpointRecord(
    state.lastDiscontinuity,
    ['sequence', 'authorityTick', 'reason'],
    'combat life discontinuity',
  );
  const discontinuitySequence = checkpointInteger(
    discontinuity.sequence,
    1,
    2_000_001,
    'combat discontinuity sequence',
  );
  const discontinuityTick = checkpointInteger(
    discontinuity.authorityTick,
    0,
    serverTick,
    'combat discontinuity tick',
  );
  if (
    discontinuity.reason !== 'initial_spawn'
    && discontinuity.reason !== 'death'
    && discontinuity.reason !== 'respawn'
  ) {
    throw new RangeError('combat discontinuity reason is unsupported');
  }
  if (
    discontinuitySequence !== spawnOrdinal + deathOrdinal
    || (state.phase === 'alive' && spawnOrdinal !== deathOrdinal + 1)
    || (state.phase === 'dead' && spawnOrdinal !== deathOrdinal)
    || (state.phase === 'dead' && discontinuity.reason !== 'death')
    || (state.phase === 'alive' && spawnOrdinal === 1 && discontinuity.reason !== 'initial_spawn')
    || (state.phase === 'alive' && spawnOrdinal > 1 && discontinuity.reason !== 'respawn')
  ) {
    throw new RangeError('combat life discontinuity and ordinals disagree');
  }
  if (state.phase === 'alive') {
    if (healthPoints < 1 || state.respawnEligibleAtTick !== null) {
      throw new RangeError('alive combat state has invalid health or respawn clock');
    }
  } else {
    checkpointLiteral(healthPoints, 0, 'dead combat health');
    const respawnEligibleAtTick = checkpointInteger(
      state.respawnEligibleAtTick,
      0,
      ACTIVE_MATCH_CHECKPOINT_MAX_TICK,
      'combat respawn eligible tick',
    );
    if (respawnEligibleAtTick !== discontinuityTick + G4_COMBAT_SLICE_LIFE_RULES.respawnDelayTicks) {
      throw new RangeError('combat respawn clock does not match the death discontinuity');
    }
  }
  const contributions = checkpointArray(
    state.damageContributions,
    0,
    64,
    'combat damage contributions',
  );
  let previousSourcePlayerId: string | null = null;
  for (const valueEntry of contributions) {
    const entry = checkpointRecord(valueEntry, [
      'sourcePlayerId', 'lastDamageTick', 'healthDamagePoints', 'shieldDamagePoints',
    ], 'combat damage contribution');
    const sourcePlayerId = stableId(entry.sourcePlayerId, 'combat contribution source');
    if (sourcePlayerId === playerId || (previousSourcePlayerId !== null && sourcePlayerId <= previousSourcePlayerId)) {
      throw new RangeError('combat contribution sources must be unique and sorted');
    }
    previousSourcePlayerId = sourcePlayerId;
    checkpointInteger(entry.lastDamageTick, 0, serverTick, 'combat contribution tick');
    checkpointInteger(entry.healthDamagePoints, 0, 1_000_000, 'combat contribution health damage');
    checkpointInteger(entry.shieldDamagePoints, 0, 1_000_000, 'combat contribution shield damage');
  }
  if (state.phase === 'dead' && contributions.length !== 0) {
    throw new RangeError('dead combat state cannot retain damage contributions');
  }
  const maximumProcessedSequence = nextCombatEventSequence - 1;
  checkpointInteger(
    state.lastProcessedCombatEventSequence,
    -1,
    Math.max(-1, maximumProcessedSequence),
    'combat life processed sequence',
  );
  return state as unknown as CombatLifeState;
}

function validateCheckpointImpulseGrenadeAbility(
  value: unknown,
  playerId: string,
  expectedEventNamespace: string,
  serverTick: number,
): ImpulseGrenadeAbilityState {
  const state = checkpointRecord(value, [
    'schemaVersion', 'playerId', 'abilityId', 'phase', 'readyAtTick', 'cooldownEndsAtTick',
    'acceptedThrowCount', 'eventNamespace', 'lastProcessedAuthorityTick',
    'lastProcessedAuthorityInputSequence',
  ], 'authority checkpoint impulse grenade ability');
  checkpointLiteral(state.schemaVersion, 1, 'impulse grenade ability schema');
  checkpointLiteral(state.playerId, playerId, 'impulse grenade ability player');
  checkpointLiteral(state.abilityId, G4_IMPULSE_GRENADE_RULES.abilityId, 'impulse grenade ability id');
  if (!['equipping', 'ready', 'cooldown', 'dead'].includes(state.phase as string)) {
    throw new RangeError('impulse grenade ability phase is unsupported');
  }
  checkpointInteger(state.readyAtTick, 0, ACTIVE_MATCH_CHECKPOINT_MAX_TICK, 'grenade ready tick');
  checkpointInteger(
    state.cooldownEndsAtTick,
    0,
    ACTIVE_MATCH_CHECKPOINT_MAX_TICK,
    'grenade cooldown tick',
  );
  checkpointInteger(state.acceptedThrowCount, 0, 1_000_000, 'grenade accepted throw count');
  checkpointLiteral(state.eventNamespace, expectedEventNamespace, 'grenade event namespace');
  checkpointInteger(state.lastProcessedAuthorityTick, 0, serverTick, 'grenade processed tick');
  checkpointInteger(
    state.lastProcessedAuthorityInputSequence,
    -1,
    serverTick,
    'grenade processed input sequence',
  );
  return state as unknown as ImpulseGrenadeAbilityState;
}

function validateCheckpointImpulseGrenadeProjectile(
  value: unknown,
  playersById: ReadonlyMap<string, AuthorityActiveMatchCheckpointPlayerV1>,
  serverTick: number,
): ImpulseGrenadeProjectileState {
  const state = checkpointRecord(value, [
    'schemaVersion', 'projectileId', 'ownerPlayerId', 'ownerTeamId', 'abilityId', 'phase',
    'spawnTick', 'lastProcessedAuthorityTick', 'lifetimeEndsAtTick', 'fuseStartedAtTick',
    'detonatesAtTick', 'positionMillimeters', 'velocityMillimetersPerSecond',
    'accelerationMillimetersPerSecondSquared', 'positionIntegrationRemainder',
    'velocityIntegrationRemainder', 'radiusMillimeters', 'bounceCount', 'settled', 'seed',
  ], 'authority checkpoint impulse grenade projectile');
  checkpointLiteral(state.schemaVersion, 1, 'impulse grenade projectile schema');
  if (
    typeof state.projectileId !== 'string'
    || state.projectileId.length < 1
    || state.projectileId.length > 256
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(state.projectileId)
  ) {
    throw new RangeError('impulse grenade projectile id must be a bounded internal identifier');
  }
  const projectileId = state.projectileId;
  const ownerPlayerId = stableId(state.ownerPlayerId, 'impulse grenade projectile owner');
  const owner = playersById.get(ownerPlayerId);
  if (owner === undefined) throw new RangeError('impulse grenade projectile owner is not retained');
  checkpointLiteral(state.ownerTeamId, owner.life.teamId, 'impulse grenade projectile team');
  checkpointLiteral(state.abilityId, G4_IMPULSE_GRENADE_RULES.abilityId, 'impulse grenade projectile ability');
  checkpointLiteral(state.phase, 'active', 'retained impulse grenade projectile phase');
  const spawnTick = checkpointInteger(state.spawnTick, 1, serverTick, 'grenade projectile spawn tick');
  checkpointLiteral(
    state.lastProcessedAuthorityTick,
    serverTick,
    'grenade projectile processed tick',
  );
  checkpointLiteral(
    state.lifetimeEndsAtTick,
    spawnTick + G4_IMPULSE_GRENADE_RULES.lifetimeTicks,
    'grenade projectile lifetime',
  );
  const fuseStartedAtTick = state.fuseStartedAtTick === null
    ? null
    : checkpointInteger(state.fuseStartedAtTick, spawnTick, serverTick, 'grenade fuse start tick');
  const detonatesAtTick = state.detonatesAtTick === null
    ? null
    : checkpointInteger(state.detonatesAtTick, spawnTick, ACTIVE_MATCH_CHECKPOINT_MAX_TICK, 'grenade detonation tick');
  if (
    (fuseStartedAtTick === null) !== (detonatesAtTick === null)
    || (fuseStartedAtTick !== null
      && detonatesAtTick !== fuseStartedAtTick + G4_IMPULSE_GRENADE_RULES.fuseTicks)
  ) {
    throw new RangeError('impulse grenade fuse clocks disagree');
  }
  checkpointVector(state.positionMillimeters, -20_000_000, 20_000_000, 'grenade position');
  checkpointVector(state.velocityMillimetersPerSecond, -20_000_000, 20_000_000, 'grenade velocity');
  const acceleration = checkpointVector(
    state.accelerationMillimetersPerSecondSquared,
    -20_000_000,
    20_000_000,
    'grenade acceleration',
  );
  if (acceleration.x !== 0 || acceleration.y !== 0 || acceleration.z !== 0) {
    throw new RangeError('impulse grenade acceleration must remain the reviewed zero vector');
  }
  checkpointVector(state.positionIntegrationRemainder, -19, 19, 'grenade position remainder');
  checkpointVector(state.velocityIntegrationRemainder, -19, 19, 'grenade velocity remainder');
  checkpointLiteral(
    state.radiusMillimeters,
    G4_IMPULSE_GRENADE_RULES.projectileRadiusMillimeters,
    'grenade projectile radius',
  );
  checkpointInteger(
    state.bounceCount,
    0,
    G4_IMPULSE_GRENADE_RULES.maximumBounces,
    'grenade bounce count',
  );
  checkpointBoolean(state.settled, 'grenade settled flag');
  checkpointInteger(state.seed, 0, 0xffff_ffff, 'grenade seed');
  const expectedPrefix = `${owner.impulseGrenade.eventNamespace}.projectile.`;
  if (!projectileId.startsWith(expectedPrefix)) {
    throw new RangeError('impulse grenade projectile namespace does not match its owner');
  }
  const throwOrdinal = Number(projectileId.slice(expectedPrefix.length));
  checkpointInteger(
    throwOrdinal,
    1,
    owner.impulseGrenade.acceptedThrowCount,
    'grenade projectile throw ordinal',
  );
  return state as unknown as ImpulseGrenadeProjectileState;
}

function validateCheckpointTdmMatch(
  value: unknown,
  matchId: string,
  lifecycle: 'warmup' | 'active' | 'postmatch',
  phaseStartedAtTick: number,
  serverTick: number,
  nextCombatEventSequence: number,
  retainedPlayers: ReadonlyMap<string, AuthorityActiveMatchCheckpointPlayerV1>,
): AuthorityTdmMatchStateV1 {
  const state = checkpointRecord(value, [
    'schemaVersion', 'matchId', 'rules', 'authorityTick', 'phase', 'phaseStartedAtTick',
    'phaseEndsAtTick', 'phaseTicksRemaining', 'activeTicksRemaining', 'teamScores',
    'playerScores', 'feedSequence', 'feed', 'lastProcessedCombatEventSequence', 'result',
  ], 'authority checkpoint TDM match');
  checkpointLiteral(state.schemaVersion, 1, 'TDM checkpoint schema');
  checkpointLiteral(state.matchId, matchId, 'TDM checkpoint match id');
  checkpointFlatRecordMatches(
    state.rules,
    G4_TDM_MATCH_RULES as unknown as Readonly<Record<string, string | number | boolean | null>>,
    'TDM checkpoint rules',
  );
  checkpointLiteral(state.authorityTick, serverTick, 'TDM checkpoint authority tick');
  checkpointLiteral(state.phase, lifecycle, 'TDM checkpoint phase');
  checkpointLiteral(state.phaseStartedAtTick, phaseStartedAtTick, 'TDM checkpoint phase start');
  const phaseDuration = lifecycle === 'warmup'
    ? G4_TDM_MATCH_RULES.warmupTicks
    : lifecycle === 'active'
      ? G4_TDM_MATCH_RULES.activeTicks
      : G4_TDM_MATCH_RULES.postmatchTicks;
  const phaseEndsAtTick = phaseStartedAtTick + phaseDuration;
  checkpointLiteral(state.phaseEndsAtTick, phaseEndsAtTick, 'TDM checkpoint phase end');
  checkpointLiteral(
    state.phaseTicksRemaining,
    Math.max(0, phaseEndsAtTick - serverTick),
    'TDM checkpoint phase ticks remaining',
  );
  checkpointLiteral(
    state.activeTicksRemaining,
    lifecycle === 'warmup'
      ? G4_TDM_MATCH_RULES.activeTicks
      : lifecycle === 'active' ? Math.max(0, phaseEndsAtTick - serverTick) : 0,
    'TDM checkpoint active ticks remaining',
  );

  const teamScores = checkpointArray(state.teamScores, 2, 64, 'TDM team scores');
  const teamIds = new Set<string>();
  let priorTeamId: string | null = null;
  for (const valueEntry of teamScores) {
    const entry = checkpointRecord(valueEntry, ['teamId', 'score'], 'TDM team score');
    const teamId = stableId(entry.teamId, 'TDM team score id');
    if (priorTeamId !== null && teamId <= priorTeamId) {
      throw new RangeError('TDM team scores must be unique and sorted');
    }
    priorTeamId = teamId;
    teamIds.add(teamId);
    checkpointInteger(entry.score, 0, G4_TDM_MATCH_RULES.teamScoreLimit, 'TDM team score');
  }

  const playerScores = checkpointArray(state.playerScores, 2, 64, 'TDM player scores');
  const scoreByPlayerId = new Map<string, Record<string, unknown>>();
  let priorPlayerId: string | null = null;
  for (const valueEntry of playerScores) {
    const entry = checkpointRecord(
      valueEntry,
      ['playerId', 'teamId', 'kills', 'deaths', 'assists'],
      'TDM player score',
    );
    const playerId = stableId(entry.playerId, 'TDM score player id');
    const teamId = stableId(entry.teamId, 'TDM score team id');
    if (priorPlayerId !== null && playerId <= priorPlayerId) {
      throw new RangeError('TDM player scores must be unique and sorted');
    }
    if (!teamIds.has(teamId)) throw new RangeError('TDM player score references an unknown team');
    priorPlayerId = playerId;
    scoreByPlayerId.set(playerId, entry);
    checkpointInteger(entry.kills, 0, 1_000_000, 'TDM player kills');
    checkpointInteger(entry.deaths, 0, 1_000_000, 'TDM player deaths');
    checkpointInteger(entry.assists, 0, 1_000_000, 'TDM player assists');
  }
  for (const [playerId, player] of retainedPlayers) {
    const score = scoreByPlayerId.get(playerId);
    if (score === undefined || score.teamId !== player.life.teamId) {
      throw new RangeError('retained player does not match the TDM scoreboard');
    }
  }

  const feed = checkpointArray(state.feed, 0, 1_000_000, 'TDM kill feed');
  checkpointLiteral(state.feedSequence, feed.length, 'TDM feed sequence');
  for (let index = 0; index < feed.length; index += 1) {
    const entry = checkpointRecord(feed[index], [
      'kind', 'eventId', 'authorityTick', 'feedSequence', 'combatDeathEventId', 'causeId',
      'killerPlayerId', 'victimPlayerId', 'assistPlayerIds', 'scoredTeamId', 'teamScoreAfter',
    ], 'TDM kill feed entry');
    checkpointLiteral(entry.kind, 'kill_feed_entry', 'TDM feed event kind');
    const feedSequence = index + 1;
    checkpointLiteral(entry.feedSequence, feedSequence, 'TDM feed event sequence');
    checkpointLiteral(
      entry.eventId,
      `match.feed.${matchId}.${feedSequence}`,
      'TDM feed event id',
    );
    checkpointInteger(entry.authorityTick, 0, serverTick, 'TDM feed event tick');
    stableId(entry.combatDeathEventId, 'TDM feed combat death id');
    stableId(entry.causeId, 'TDM feed cause');
    optionalStableId(entry.killerPlayerId, 'TDM feed killer');
    stableId(entry.victimPlayerId, 'TDM feed victim');
    const assists = checkpointArray(entry.assistPlayerIds, 0, 64, 'TDM feed assists');
    let previousAssist: string | null = null;
    for (const assistValue of assists) {
      const assist = stableId(assistValue, 'TDM feed assist');
      if (previousAssist !== null && assist <= previousAssist) {
        throw new RangeError('TDM feed assists must be unique and sorted');
      }
      previousAssist = assist;
    }
    const scoredTeamId = optionalStableId(entry.scoredTeamId, 'TDM feed scored team');
    if (scoredTeamId === null) {
      checkpointLiteral(entry.teamScoreAfter, null, 'TDM unscored feed score');
    } else {
      if (!teamIds.has(scoredTeamId)) throw new RangeError('TDM feed references an unknown team');
      checkpointInteger(
        entry.teamScoreAfter,
        1,
        G4_TDM_MATCH_RULES.teamScoreLimit,
        'TDM feed team score',
      );
    }
  }
  checkpointInteger(
    state.lastProcessedCombatEventSequence,
    -1,
    Math.max(-1, nextCombatEventSequence - 1),
    'TDM processed combat sequence',
  );

  if (lifecycle !== 'postmatch') {
    checkpointLiteral(state.result, null, 'pre-postmatch TDM result');
  } else {
    const result = checkpointRecord(state.result, [
      'kind', 'eventId', 'authorityTick', 'matchId', 'reason', 'winningTeamId', 'draw',
      'teamScores',
    ], 'TDM match result');
    checkpointLiteral(result.kind, 'match_result', 'TDM result kind');
    const resultTick = checkpointInteger(result.authorityTick, 0, serverTick, 'TDM result tick');
    checkpointLiteral(result.eventId, `match.result.${matchId}.${resultTick}`, 'TDM result id');
    checkpointLiteral(result.matchId, matchId, 'TDM result match id');
    if (result.reason !== 'score_limit' && result.reason !== 'time_limit') {
      throw new RangeError('TDM result reason is unsupported');
    }
    const winningTeamId = optionalStableId(result.winningTeamId, 'TDM winning team');
    const draw = checkpointBoolean(result.draw, 'TDM draw flag');
    if (draw !== (winningTeamId === null) || (winningTeamId !== null && !teamIds.has(winningTeamId))) {
      throw new RangeError('TDM winner and draw result disagree');
    }
    const resultScores = checkpointArray(result.teamScores, teamScores.length, teamScores.length, 'TDM result scores');
    if (JSON.stringify(resultScores) !== JSON.stringify(teamScores)) {
      throw new RangeError('TDM result scores do not match the final scoreboard');
    }
  }
  return state as unknown as AuthorityTdmMatchStateV1;
}

function validateCheckpointPendingMatchEvents(
  value: unknown,
  matchId: string,
  lifecycle: 'warmup' | 'active' | 'postmatch',
  phaseStartedAtTick: number,
  serverTick: number,
): readonly AuthorityTdmMatchEvent[] {
  const events = checkpointArray(value, 0, 1, 'pending TDM match events');
  if (serverTick !== 0 || lifecycle !== 'warmup') {
    if (events.length !== 0) throw new RangeError('only the initial warmup transition may be pending');
    return events as readonly AuthorityTdmMatchEvent[];
  }
  if (events.length !== 1) throw new RangeError('initial warmup transition is missing');
  const event = checkpointRecord(events[0], [
    'kind', 'eventId', 'authorityTick', 'matchId', 'from', 'to', 'phaseStartedAtTick',
    'phaseEndsAtTick', 'reason',
  ], 'pending TDM phase event');
  checkpointLiteral(event.kind, 'match_phase_changed', 'pending TDM event kind');
  checkpointLiteral(event.eventId, `match.phase.${matchId}.warmup.0`, 'pending TDM event id');
  checkpointLiteral(event.authorityTick, 0, 'pending TDM event tick');
  checkpointLiteral(event.matchId, matchId, 'pending TDM event match id');
  checkpointLiteral(event.from, 'lobby', 'pending TDM event source');
  checkpointLiteral(event.to, 'warmup', 'pending TDM event destination');
  checkpointLiteral(event.phaseStartedAtTick, phaseStartedAtTick, 'pending TDM phase start');
  checkpointLiteral(event.phaseEndsAtTick, G4_TDM_MATCH_RULES.warmupTicks, 'pending TDM phase end');
  checkpointLiteral(event.reason, 'match_started', 'pending TDM event reason');
  return events as readonly AuthorityTdmMatchEvent[];
}

function captureImpulseGrenadeWorldPort(value: unknown): AuthorityImpulseGrenadeWorldPort {
  if (value === null || typeof value !== 'object') {
    throw new TypeError('room impulse grenade world port is required');
  }
  const source = value as AuthorityImpulseGrenadeWorldPort;
  if (source.schemaVersion !== IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION) {
    throw new RangeError('room impulse grenade world port schema is unsupported');
  }
  for (const method of [
    'sweepSphere',
    'traceRadialOcclusion',
    'resolveCollisionSafeImpulse',
  ] as const) {
    if (typeof source[method] !== 'function') {
      throw new TypeError(`room impulse grenade world port is missing ${method}`);
    }
  }
  return Object.freeze({
    schemaVersion: IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
    sweepSphere: source.sweepSphere.bind(source),
    traceRadialOcclusion: source.traceRadialOcclusion.bind(source),
    resolveCollisionSafeImpulse: source.resolveCollisionSafeImpulse.bind(source),
  });
}

export class AuthoritativeRoom {
  readonly identity: AuthorityRoomIdentity;
  readonly profile: MovementProfileV1;
  readonly queries: MovementQueryPort;
  readonly maximumPlayers: number;
  readonly commandsPerPlayerPerTick: number;
  readonly warmupTicks: number;
  readonly activeTicks: number;
  readonly postmatchTicks: number;
  readonly reconnectGraceTicks: number;
  readonly minimumConnectedPlayersToStart: number;
  readonly spawnResolver: AuthoritySpawnResolver;
  readonly combatProfileId: typeof G4_COMBAT_ROOM_PROFILE_ID | null;
  readonly hitscanCapabilityId: typeof G4_HITSCAN_ROOM_CAPABILITY_ID | null;
  readonly impulseGrenadeCapabilityId: typeof G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID | null;
  readonly abilityResourceCapabilityId!: typeof G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID | null;
  readonly tdmMatchCapabilityId!: typeof G4_TDM_MATCH_ROOM_CAPABILITY_ID | null;
  readonly teamResolver: AuthorityTeamResolver;

  private readonly players = new Map<string, AuthorityPlayerRecord>();
  private readonly impulseGrenadeProjectiles = new Map<string, ImpulseGrenadeProjectileState>();
  private readonly connectionOwners = new Map<string, string>();
  private phase: RoomLifecycle = 'created';
  private phaseStartedAtTick = 0;
  private tick = 0;
  private acceptedInputs = 0;
  private inputRejections = emptyRejections();
  private maximumObservedQueueDepth = 0;
  private missedSchedulerTicks = 0;
  private cumulativeQueryMetrics: MovementQueryMetrics = { ...EMPTY_QUERY_METRICS };
  private readonly movementProfileHash: string;
  private matchStarted = false;
  private nextCombatEventSequence = 0;
  private readonly worldOcclusionPort: AuthorityWorldOcclusionPort | null;
  private readonly impulseGrenadeWorldPort: AuthorityImpulseGrenadeWorldPort | null;
  private tdmMatchState: AuthorityTdmMatchStateV1 | null = null;
  private activeTickMatchEvents: AuthorityTdmMatchEvent[] | null = null;
  private pendingMatchEvents: AuthorityTdmMatchEvent[] = [];
  private deferTdmLifecycleSync = false;

  constructor(options: AuthorityRoomOptions) {
    if (options === null || typeof options !== 'object') throw new TypeError('room options are required');
    this.identity = Object.freeze({
      roomId: stableId(options.identity.roomId, 'room id'),
      matchId: stableId(options.identity.matchId, 'match id'),
      rulesetId: stableId(options.identity.rulesetId, 'ruleset id'),
      rulesetRevision: boundedInteger(options.identity.rulesetRevision, 1, 1_000_000, 'ruleset revision'),
      rulesetHash: stableHash(options.identity.rulesetHash, 'ruleset hash'),
      mapId: stableId(options.identity.mapId, 'map id'),
      fixtureId: stableId(options.identity.fixtureId, 'fixture id'),
      fixtureHash: stableHash(options.identity.fixtureHash, 'fixture hash'),
      physicsAdapterId: stableId(options.identity.physicsAdapterId, 'physics adapter id'),
      physicsAdapterVersion: stableId(options.identity.physicsAdapterVersion, 'physics adapter version'),
    });
    assertMovementProfile(options.profile);
    this.profile = deepFreeze(structuredClone(options.profile));
    this.movementProfileHash = hashMovementProfile(this.profile);
    if (options.queries === null || typeof options.queries !== 'object') {
      throw new TypeError('room movement query port is required');
    }
    const querySource = options.queries;
    this.queries = Object.freeze({
      schemaVersion: querySource.schemaVersion,
      moveCapsule: querySource.moveCapsule.bind(querySource),
      overlapCapsule: querySource.overlapCapsule.bind(querySource),
      castCapsule: querySource.castCapsule.bind(querySource),
      volumesAtCapsule: querySource.volumesAtCapsule.bind(querySource),
    });
    this.maximumPlayers = boundedInteger(options.maximumPlayers ?? 8, 1, 64, 'maximum players');
    this.commandsPerPlayerPerTick = boundedInteger(
      options.commandsPerPlayerPerTick ?? DEFAULT_MAX_COMMANDS_PER_AUTHORITY_TICK,
      1,
      PROTOCOL_LIMITS.maxCommandsPerBatch,
      'commands per player per tick',
    );
    this.warmupTicks = boundedInteger(options.warmupTicks ?? 40, 1, 100_000, 'warmup ticks');
    this.activeTicks = boundedInteger(options.activeTicks ?? 9_600, 1, 10_000_000, 'active ticks');
    this.postmatchTicks = boundedInteger(options.postmatchTicks ?? 200, 1, 100_000, 'postmatch ticks');
    this.reconnectGraceTicks = boundedInteger(
      options.reconnectGraceTicks ?? 200,
      1,
      100_000,
      'reconnect grace ticks',
    );
    this.minimumConnectedPlayersToStart = boundedInteger(
      options.minimumConnectedPlayersToStart ?? 2,
      1,
      this.maximumPlayers,
      'minimum connected players to start',
    );
    this.spawnResolver = options.spawnResolver ?? (() => ({
      feetPosition: Object.freeze({ x: 0, y: 0, z: 0 }),
      yawMilliDegrees: 0,
    }));
    if (options.combat === undefined) {
      this.combatProfileId = null;
      this.hitscanCapabilityId = null;
      this.impulseGrenadeCapabilityId = null;
      this.abilityResourceCapabilityId = null;
      this.tdmMatchCapabilityId = null;
      this.teamResolver = () => null;
      this.worldOcclusionPort = null;
      this.impulseGrenadeWorldPort = null;
    } else {
      if (options.combat === null || typeof options.combat !== 'object') {
        throw new TypeError('room combat options are required');
      }
      const combatOptions = snapshotPlainDataRecord(options.combat, 'room combat options');
      allowedKeys(
        combatOptions,
        ['profileId', 'teamResolver', 'hitscan', 'impulseGrenade', 'abilityResources', 'match'],
        'room combat options',
      );
      if (!Object.hasOwn(combatOptions, 'profileId')) {
        throw new TypeError('room combat options are missing profileId');
      }
      if (combatOptions.profileId !== G4_COMBAT_ROOM_PROFILE_ID) {
        throw new RangeError('room combat profile is unsupported');
      }
      if (
        this.identity.rulesetId !== G4_COMBAT_RULESET_ID
        || this.identity.rulesetRevision !== G4_COMBAT_RULESET_REVISION
        || this.identity.rulesetHash !== G4_COMBAT_RULESET_HASH
      ) {
        throw new RangeError('room combat requires the exact revamped_classic revision 3 identity');
      }
      if (
        combatOptions.teamResolver !== undefined
        && typeof combatOptions.teamResolver !== 'function'
      ) {
        throw new TypeError('room combat team resolver must be a function');
      }
      this.combatProfileId = G4_COMBAT_ROOM_PROFILE_ID;
      this.teamResolver = combatOptions.teamResolver === undefined
        ? () => null
        : combatOptions.teamResolver as AuthorityTeamResolver;
      if (combatOptions.hitscan === undefined) {
        this.hitscanCapabilityId = null;
        this.worldOcclusionPort = null;
      } else {
        const hitscanOptions = snapshotPlainDataRecord(
          combatOptions.hitscan,
          'room hitscan options',
        );
        exactKeys(
          hitscanOptions,
          ['capabilityId', 'worldOcclusion'],
          'room hitscan options',
        );
        if (hitscanOptions.capabilityId !== G4_HITSCAN_ROOM_CAPABILITY_ID) {
          throw new RangeError('room hitscan capability is unsupported');
        }
        if (typeof hitscanOptions.worldOcclusion !== 'function') {
          throw new TypeError('room hitscan world occlusion port must be a function');
        }
        this.hitscanCapabilityId = G4_HITSCAN_ROOM_CAPABILITY_ID;
        this.worldOcclusionPort = hitscanOptions.worldOcclusion as AuthorityWorldOcclusionPort;
      }
      if (combatOptions.impulseGrenade === undefined) {
        this.impulseGrenadeCapabilityId = null;
        this.impulseGrenadeWorldPort = null;
      } else {
        const impulseGrenadeOptions = snapshotPlainDataRecord(
          combatOptions.impulseGrenade,
          'room impulse grenade options',
        );
        exactKeys(
          impulseGrenadeOptions,
          ['capabilityId', 'world'],
          'room impulse grenade options',
        );
        if (impulseGrenadeOptions.capabilityId !== G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID) {
          throw new RangeError('room impulse grenade capability is unsupported');
        }
        this.impulseGrenadeCapabilityId = G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID;
        this.impulseGrenadeWorldPort = captureImpulseGrenadeWorldPort(
          impulseGrenadeOptions.world,
        );
      }
      if (combatOptions.abilityResources === undefined) {
        this.abilityResourceCapabilityId = null;
      } else {
        const abilityResourceOptions = snapshotPlainDataRecord(
          combatOptions.abilityResources,
          'room ability resource options',
        );
        exactKeys(
          abilityResourceOptions,
          ['capabilityId'],
          'room ability resource options',
        );
        if (abilityResourceOptions.capabilityId !== G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID) {
          throw new RangeError('room ability resource capability is unsupported');
        }
        if (this.impulseGrenadeCapabilityId === null) {
          throw new RangeError('room ability resources require the exact impulse grenade capability');
        }
        assertAbilityResourceIntegrationRules(G4_ABILITY_RESOURCE_INTEGRATION_RULES);
        const teleport = this.profile.teleport;
        if (
          this.profile.id !== G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_ID
          || this.profile.revision !== G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_REVISION
          || this.movementProfileHash !== G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_HASH
          || teleport.maximumRangeMm
            !== G4_ABILITY_RESOURCE_INTEGRATION_RULES.teleport.maximumRangeMillimeters
          || teleport.backwardSearchStepMm
            !== G4_ABILITY_RESOURCE_INTEGRATION_RULES.teleport.backwardSearchStepMillimeters
          || teleport.maximumBackwardSearchSteps
            !== G4_ABILITY_RESOURCE_INTEGRATION_RULES.teleport.maximumBackwardSearchSteps
          || teleport.cooldownTicks !== G4_ABILITY_RESOURCE_INTEGRATION_RULES.teleport.cooldownTicks
          || teleport.cooldownOnFailure
            !== G4_ABILITY_RESOURCE_INTEGRATION_RULES.teleport.cooldownOnFailure
          || teleport.retainPlanarVelocityPermille
            !== G4_ABILITY_RESOURCE_INTEGRATION_RULES.teleport.retainPlanarVelocityPermille
          || teleport.retainVerticalVelocityPermille
            !== G4_ABILITY_RESOURCE_INTEGRATION_RULES.teleport.retainVerticalVelocityPermille
          || teleport.requireGroundedDestination
            !== G4_ABILITY_RESOURCE_INTEGRATION_RULES.teleport.requireGroundedDestination
        ) {
          throw new RangeError('room ability resources require the exact accepted movement profile');
        }
        this.abilityResourceCapabilityId = G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID;
      }
      if (combatOptions.match === undefined) {
        this.tdmMatchCapabilityId = null;
        this.tdmMatchState = null;
      } else {
        const matchOptions = snapshotPlainDataRecord(
          combatOptions.match,
          'room TDM match options',
        );
        exactKeys(matchOptions, ['capabilityId'], 'room TDM match options');
        if (matchOptions.capabilityId !== G4_TDM_MATCH_ROOM_CAPABILITY_ID) {
          throw new RangeError('room TDM match capability is unsupported');
        }
        if (this.abilityResourceCapabilityId === null) {
          throw new RangeError('room TDM match requires the exact P5.5 ability resource capability');
        }
        if (combatOptions.teamResolver === undefined) {
          throw new RangeError('room TDM match requires an authority team resolver');
        }
        assertAuthorityTdmMatchRules(G4_TDM_MATCH_RULES);
        if (
          this.warmupTicks !== G4_TDM_MATCH_RULES.warmupTicks
          || this.activeTicks !== G4_TDM_MATCH_RULES.activeTicks
          || this.postmatchTicks !== G4_TDM_MATCH_RULES.postmatchTicks
        ) {
          throw new RangeError('room TDM match requires the exact revision 3 match durations');
        }
        this.tdmMatchCapabilityId = G4_TDM_MATCH_ROOM_CAPABILITY_ID;
        this.tdmMatchState = createAuthorityTdmMatchState({
          schemaVersion: 1,
          matchId: this.identity.matchId,
          authorityTick: this.tick,
        }, G4_TDM_MATCH_RULES);
      }
    }
  }

  get serverTick(): number {
    return this.tick;
  }

  get lifecycle(): RoomLifecycle {
    return this.phase;
  }

  joinNewPlayer(options: JoinNewAuthorityPlayerOptions): AuthorityJoinResult {
    if (this.phase === 'expired') return Object.freeze({ ok: false, reason: 'room_expired' });
    if (this.matchStarted && (this.phase === 'postmatch' || this.phase === 'idle')) {
      return Object.freeze({ ok: false, reason: 'match_incompatible' });
    }
    const playerId = stableId(options.playerId, 'player id');
    const connectionId = stableId(options.connectionId, 'connection id');
    const connectionOwner = this.connectionOwners.get(connectionId);
    if (connectionOwner !== undefined && connectionOwner !== playerId) {
      return Object.freeze({ ok: false, reason: 'duplicate_connection' });
    }

    const existing = this.players.get(playerId);
    if (existing) return Object.freeze({ ok: false, reason: 'duplicate_player' });

    if (this.players.size >= this.maximumPlayers) {
      return Object.freeze({ ok: false, reason: 'room_full' });
    }
    const occupiedOrdinals = new Set(
      [...this.players.values()].map((player) => player.playerOrdinal),
    );
    let playerOrdinal = 0;
    while (occupiedOrdinals.has(playerOrdinal)) playerOrdinal += 1;
    const spawn = this.spawnResolver(playerId, playerOrdinal);
    if (spawn === null || typeof spawn !== 'object') throw new TypeError('spawn resolver must return a spawn');
    const spawnId = stableId(spawn.spawnId ?? `spawn.room.${playerOrdinal}`, 'authority spawn id');
    const initial = createMovementSimulationState(this.profile, {
      rulesetId: this.identity.rulesetId,
      rulesetRevision: this.identity.rulesetRevision,
      rulesetHash: this.identity.rulesetHash,
      fixtureId: this.identity.fixtureId,
      fixtureHash: this.identity.fixtureHash,
      physicsAdapterId: this.identity.physicsAdapterId,
      physicsAdapterVersion: this.identity.physicsAdapterVersion,
      playerId: asEntityId(playerId),
      feetPosition: {
        x: asMillimeters(spawn.feetPosition.x),
        y: asMillimeters(spawn.feetPosition.y),
        z: asMillimeters(spawn.feetPosition.z),
      },
      yawMilliDegrees: spawn.yawMilliDegrees ?? 0,
    });
    const state: MovementSimulationState = {
      ...initial,
      tick: asSimulationTick(this.tick),
    };
    const teamId = this.combatProfileId === null
      ? null
      : optionalStableId(this.teamResolver(playerId, playerOrdinal), 'authority team id');
    if (this.tdmMatchCapabilityId !== null && teamId === null) {
      throw new RangeError('room TDM players require an authority-owned team id');
    }
    const life = this.combatProfileId === null
      ? null
      : createCombatLifeState({
          playerId,
          teamId,
          authorityTick: this.tick,
          authoritySpawnId: spawnId,
        }, G4_COMBAT_SLICE_LIFE_RULES);
    const autoRifle = this.combatProfileId === null
      ? null
      : createAutoRifleState({
          playerId,
          roomSeed: this.identity.matchId,
          authorityTick: this.tick,
        }, G4_AUTO_RIFLE_RULES);
    const impulseGrenade = this.impulseGrenadeCapabilityId === null
      ? null
      : createImpulseGrenadeAbilityState({
          playerId,
          roomSeed: this.identity.matchId,
          authorityTick: this.tick,
        }, G4_IMPULSE_GRENADE_RULES);
    if (this.tdmMatchState !== null) {
      this.tdmMatchState = registerAuthorityTdmPlayer(this.tdmMatchState, {
        schemaVersion: 1,
        authorityTick: this.tick,
        playerId,
        teamId: teamId as string,
      });
    }
    this.players.set(playerId, {
      playerOrdinal,
      playerId,
      connectionId,
      connected: true,
      disconnectedAtTick: null,
      state,
      life,
      autoRifle,
      impulseGrenade,
      poseHistory: this.hitscanCapabilityId === null
        ? null
        : createTargetPoseHistory(playerId),
      observedRttHistory: this.hitscanCapabilityId === null ? null : Object.freeze([]),
      queue: new BoundedInputQueue(),
    });
    this.connectionOwners.set(connectionId, playerId);
    if (this.phase === 'created' || (this.phase === 'idle' && !this.matchStarted)) {
      this.transitionTo('lobby');
    }
    return Object.freeze({
      ok: true,
      connectionMode: 'joined',
      snapshot: this.fullSnapshot(),
    });
  }

  resumePlayer(options: ResumeAuthorityPlayerOptions): AuthorityJoinResult {
    if (this.phase === 'expired') return Object.freeze({ ok: false, reason: 'room_expired' });
    if (this.matchStarted && (this.phase === 'postmatch' || this.phase === 'idle')) {
      return Object.freeze({ ok: false, reason: 'match_incompatible' });
    }
    const playerId = stableId(options.playerId, 'player id');
    const connectionId = stableId(options.connectionId, 'connection id');
    const connectionOwner = this.connectionOwners.get(connectionId);
    if (connectionOwner !== undefined && connectionOwner !== playerId) {
      return Object.freeze({ ok: false, reason: 'duplicate_connection' });
    }
    const existing = this.players.get(playerId);
    if (!existing) return Object.freeze({ ok: false, reason: 'resume_rejected' });
    if (existing.connected) return Object.freeze({ ok: false, reason: 'duplicate_player' });
    if (
      existing.disconnectedAtTick === null
      || this.tick - existing.disconnectedAtTick > this.reconnectGraceTicks
    ) {
      return Object.freeze({ ok: false, reason: 'resume_rejected' });
    }

    existing.connected = true;
    existing.connectionId = connectionId;
    existing.disconnectedAtTick = null;
    existing.queue.resetToProcessedSequence(existing.state.player.lastProcessedSequence);
    existing.state = {
      ...existing.state,
      tick: asSimulationTick(this.tick),
      player: {
        ...existing.state.player,
        intent: {
          ...existing.state.player.intent,
          moveX: asQuantizedAxis(0),
          moveZ: asQuantizedAxis(0),
          heldButtons: 0,
          pressedButtons: 0,
          releasedButtons: 0,
        },
      },
    };
    if (this.hitscanCapabilityId !== null) {
      existing.poseHistory = createTargetPoseHistory(existing.playerId);
      existing.observedRttHistory = Object.freeze([]);
    }
    this.connectionOwners.set(connectionId, playerId);
    return Object.freeze({
      ok: true,
      connectionMode: 'resumed',
      snapshot: this.fullSnapshot(),
    });
  }

  disconnectConnection(connectionId: string): boolean {
    const owner = this.connectionOwners.get(connectionId);
    if (owner === undefined) return false;
    this.connectionOwners.delete(connectionId);
    const player = this.players.get(owner);
    if (!player) return false;
    player.connected = false;
    player.connectionId = null;
    player.disconnectedAtTick = this.tick;
    player.queue.resetToProcessedSequence(player.state.player.lastProcessedSequence);
    return true;
  }

  leavePlayer(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    if (player.connectionId !== null) this.connectionOwners.delete(player.connectionId);
    player.queue.clear();
    this.players.delete(playerId);
    if (
      this.players.size === 0
      && this.phase !== 'created'
      && this.phase !== 'expired'
      && !this.tdmMatchRequiresRunningRoomLifecycle()
    ) {
      this.transitionTo('idle');
    }
    return true;
  }

  startMatch(): boolean {
    const connectedPlayers = [...this.players.values()].filter((player) => player.connected).length;
    if (this.phase !== 'lobby' || connectedPlayers < this.minimumConnectedPlayersToStart) return false;
    for (const player of this.players.values()) {
      player.state = { ...player.state, tick: asSimulationTick(this.tick) };
    }
    if (this.tdmMatchState !== null) {
      const started = startAuthorityTdmMatch(this.tdmMatchState, this.tick);
      this.tdmMatchState = started.state;
      this.pendingMatchEvents.push(...started.events);
    }
    this.matchStarted = true;
    this.transitionTo('warmup');
    return true;
  }

  enqueueInputBatch(connectionId: string, message: unknown): InputQueueEnqueueResult {
    const playerId = this.connectionOwners.get(connectionId);
    if (playerId === undefined) throw new Error('AUTHORITY_CONNECTION_NOT_JOINED');
    const player = this.players.get(playerId);
    if (!player || !player.connected) throw new Error('AUTHORITY_PLAYER_NOT_CONNECTED');
    if (this.phase !== 'warmup' && this.phase !== 'active') {
      throw new Error('AUTHORITY_INPUT_PHASE_REJECTED');
    }
    const validated = validateClientMessage(message);
    if (!validated.ok || validated.value.type !== 'inputBatch') {
      throw new Error('AUTHORITY_INPUT_BATCH_INVALID');
    }
    const inputBatch: InputBatchMessage = validated.value;
    if (inputBatch.protocolVersion !== PROTOCOL_VERSION) throw new Error('AUTHORITY_PROTOCOL_MISMATCH');
    const result = player.queue.enqueueWireBatch(inputBatch.commands, this.tick);
    this.acceptedInputs += result.accepted;
    for (const rejection of result.rejections) this.inputRejections[rejection.reason] += 1;
    this.maximumObservedQueueDepth = Math.max(this.maximumObservedQueueDepth, result.pending);
    return result;
  }

  applyCombatDamage(request: AuthorityRoomDamageRequest): AuthorityRoomDamageResult {
    return this.applyCombatDamageInternal(request, true);
  }

  private applyCombatDamageInternal(
    request: AuthorityRoomDamageRequest,
    exposeMatchEvents: boolean,
  ): AuthorityRoomDamageResult {
    if (this.combatProfileId === null) throw new Error('AUTHORITY_COMBAT_NOT_ENABLED');
    if (this.phase !== 'warmup' && this.phase !== 'active') {
      throw new Error('AUTHORITY_COMBAT_PHASE_REJECTED');
    }
    const record = snapshotPlainDataRecord(request, 'room combat damage request');
    exactKeys(
      record,
      ['targetPlayerId', 'sourcePlayerId', 'damagePoints', 'causeId'],
      'room combat damage request',
    );
    const targetPlayerId = stableId(record.targetPlayerId, 'combat target player id');
    const sourcePlayerId = optionalStableId(record.sourcePlayerId, 'combat source player id');
    const damagePoints = boundedInteger(
      record.damagePoints as number,
      0,
      1_000_000,
      'combat damage points',
    );
    const causeId = stableId(record.causeId, 'combat damage cause id');
    const target = this.players.get(targetPlayerId);
    if (!target || target.life === null) throw new Error('AUTHORITY_COMBAT_TARGET_NOT_FOUND');
    const source = sourcePlayerId === null ? null : this.players.get(sourcePlayerId);
    if (sourcePlayerId !== null && (!source || source.life === null)) {
      throw new Error('AUTHORITY_COMBAT_SOURCE_NOT_FOUND');
    }
    const eventSequence = this.nextCombatEventSequence;
    this.nextCombatEventSequence += 1;
    const result = applyAuthoritativeDamage(target.life, {
      eventSequence,
      authorityTick: this.tick,
      targetPlayerId,
      sourcePlayerId,
      sourceTeamId: source?.life?.teamId ?? null,
      damagePoints,
      causeId,
    }, G4_COMBAT_SLICE_LIFE_RULES);
    if (!result.accepted) return result;
    const recordedMatch = this.tdmMatchState === null
      ? null
      : recordAuthorityTdmCombat(this.tdmMatchState, {
          schemaVersion: 1,
          damage: result.damage,
          death: result.death,
        });
    if (recordedMatch !== null && !recordedMatch.accepted) {
      throw new Error(`AUTHORITY_TDM_COMBAT_EVENT_REJECTED:${recordedMatch.reason}`);
    }
    let matchStateAfterCombat: AuthorityTdmMatchStateV1 | null = null;
    let matchEventsAfterCombat: readonly AuthorityTdmMatchEvent[] = [];
    if (recordedMatch !== null && recordedMatch.accepted) {
      matchStateAfterCombat = recordedMatch.state;
      matchEventsAfterCombat = recordedMatch.events;
      if (!this.deferTdmLifecycleSync) {
        const settled = settleAuthorityTdmMatchTick(matchStateAfterCombat);
        matchStateAfterCombat = settled.state;
        matchEventsAfterCombat = [...matchEventsAfterCombat, ...settled.events];
      }
    }
    target.life = result.state;
    if (result.death !== null) {
      if (target.impulseGrenade !== null) {
        target.impulseGrenade = markImpulseGrenadeAbilityDead(
          target.impulseGrenade,
          this.tick,
        );
      }
      target.queue.clear();
      target.state = {
        ...target.state,
        player: {
          ...target.state.player,
          velocity: {
            x: asMillimetersPerSecond(0),
            y: asMillimetersPerSecond(0),
            z: asMillimetersPerSecond(0),
          },
          intent: {
            ...target.state.player.intent,
            moveX: asQuantizedAxis(0),
            moveZ: asQuantizedAxis(0),
            heldButtons: 0,
            pressedButtons: 0,
            releasedButtons: 0,
          },
        },
      };
    }
    if (matchStateAfterCombat !== null) {
      this.tdmMatchState = matchStateAfterCombat;
      this.activeTickMatchEvents?.push(...matchEventsAfterCombat);
      if (!this.deferTdmLifecycleSync) this.synchronizeTdmLifecycle();
      if (exposeMatchEvents && this.activeTickMatchEvents === null) {
        return deepFreeze({ ...result, matchEvents: matchEventsAfterCombat });
      }
    }
    return result;
  }

  respawnCombatPlayer(playerIdValue: string): AuthorityRoomRespawnResult {
    if (this.combatProfileId === null) throw new Error('AUTHORITY_COMBAT_NOT_ENABLED');
    if (this.phase !== 'warmup' && this.phase !== 'active') {
      throw new Error('AUTHORITY_COMBAT_PHASE_REJECTED');
    }
    const playerId = stableId(playerIdValue, 'combat respawn player id');
    const player = this.players.get(playerId);
    if (!player || player.life === null) throw new Error('AUTHORITY_COMBAT_TARGET_NOT_FOUND');
    const playerOrdinal = player.playerOrdinal;
    const spawn = this.spawnResolver(playerId, playerOrdinal);
    if (spawn === null || typeof spawn !== 'object') throw new TypeError('spawn resolver must return a spawn');
    const spawnId = stableId(spawn.spawnId ?? `spawn.room.${playerOrdinal}`, 'authority spawn id');
    const eventSequence = this.nextCombatEventSequence;
    this.nextCombatEventSequence += 1;
    const result = applyAuthoritativeRespawn(player.life, {
      eventSequence,
      authorityTick: this.tick,
      authoritySpawnId: spawnId,
      resolvedBy: 'authority_spawn_resolver',
    }, G4_COMBAT_SLICE_LIFE_RULES);
    if (!result.accepted) return result;
    const recordedMatch = this.tdmMatchState === null
      ? null
      : recordAuthorityTdmRespawn(this.tdmMatchState, {
          schemaVersion: 1,
          respawn: result.event,
        });
    if (recordedMatch !== null && !recordedMatch.accepted) {
      throw new Error(`AUTHORITY_TDM_RESPAWN_EVENT_REJECTED:${recordedMatch.reason}`);
    }
    const initial = createMovementSimulationState(this.profile, {
      rulesetId: this.identity.rulesetId,
      rulesetRevision: this.identity.rulesetRevision,
      rulesetHash: this.identity.rulesetHash,
      fixtureId: this.identity.fixtureId,
      fixtureHash: this.identity.fixtureHash,
      physicsAdapterId: this.identity.physicsAdapterId,
      physicsAdapterVersion: this.identity.physicsAdapterVersion,
      playerId: asEntityId(playerId),
      feetPosition: {
        x: asMillimeters(spawn.feetPosition.x),
        y: asMillimeters(spawn.feetPosition.y),
        z: asMillimeters(spawn.feetPosition.z),
      },
      yawMilliDegrees: spawn.yawMilliDegrees ?? 0,
    });
    player.life = result.state;
    player.state = { ...initial, tick: asSimulationTick(this.tick) };
    if (player.impulseGrenade !== null) {
      player.impulseGrenade = resetImpulseGrenadeAbilityForRespawn(
        player.impulseGrenade,
        this.tick,
        G4_IMPULSE_GRENADE_RULES,
      );
    }
    if (this.hitscanCapabilityId !== null) {
      player.poseHistory = createTargetPoseHistory(playerId);
    }
    player.queue.clear();
    if (recordedMatch !== null && recordedMatch.accepted) {
      this.tdmMatchState = recordedMatch.state;
      this.activeTickMatchEvents?.push(...recordedMatch.events);
      return deepFreeze({ ...result, matchEvents: recordedMatch.events });
    }
    return result;
  }

  /**
   * Trusted transport adapters call this with a server-measured RTT. The room
   * owns the observation tick; there is intentionally no client timestamp.
   */
  recordServerObservedRtt(playerIdValue: string, roundTripMillisecondsValue: number): void {
    if (this.hitscanCapabilityId === null) throw new Error('AUTHORITY_HITSCAN_NOT_ENABLED');
    if (this.phase === 'expired') throw new Error('AUTHORITY_ROOM_EXPIRED');
    const playerId = stableId(playerIdValue, 'RTT player id');
    const player = this.players.get(playerId);
    if (!player || !player.connected || player.observedRttHistory === null) {
      throw new Error('AUTHORITY_RTT_PLAYER_NOT_CONNECTED');
    }
    const roundTripMilliseconds = boundedInteger(
      roundTripMillisecondsValue,
      0,
      ROOM_HITSCAN_MAX_RTT_MILLISECONDS,
      'server-observed RTT milliseconds',
    );
    const sample: ObservedRttSampleV1 = Object.freeze({
      schemaVersion: 1,
      observedAtReceiptTick: this.tick,
      roundTripMilliseconds,
    });
    player.observedRttHistory = Object.freeze([
      ...player.observedRttHistory.filter((entry) => entry.observedAtReceiptTick !== this.tick),
      sample,
    ].sort((left, right) => left.observedAtReceiptTick - right.observedAtReceiptTick)
      .slice(-ROOM_HITSCAN_RTT_HISTORY_CAPACITY));
  }

  recordMissedSchedulerTicks(count: number): void {
    this.missedSchedulerTicks += boundedInteger(count, 0, 1_000_000, 'missed scheduler ticks');
  }

  advanceOneTick(): AuthorityRoomTickResult {
    if (this.phase === 'expired') throw new Error('AUTHORITY_ROOM_EXPIRED');
    const nextTick = this.tick + 1;
    asSimulationTick(nextTick);
    const movementEvents: MovementSemanticEvent[] = [];
    const combatEvents: AutoRifleEvent[] = [];
    const impulseGrenadeEvents: ImpulseGrenadeEvent[] = [];
    const abilityResourceEvents: AuthorityTeleportResourceEvent[] = [];
    const impulseGrenadeDetonations: ImpulseGrenadeDetonatedEvent[] = [];
    const acceptedShots: PendingAcceptedRoomShot[] = [];
    const lifecycleTransitions: RoomLifecycle[] = [];
    const matchEvents = this.tdmMatchCapabilityId === null
      ? []
      : [...this.pendingMatchEvents];
    this.pendingMatchEvents = [];
    this.activeTickMatchEvents = this.tdmMatchCapabilityId === null ? null : matchEvents;
    let queryMetrics: MovementQueryMetrics = { ...EMPTY_QUERY_METRICS };
    const simulateMovement = this.phase === 'warmup' || this.phase === 'active';
    const sortedPlayers = [...this.players.values()].sort((left, right) => (
      left.playerId < right.playerId ? -1 : left.playerId > right.playerId ? 1 : 0
    ));
    for (const player of sortedPlayers) {
      if (!simulateMovement) continue;
      let playerMovementEvents: readonly MovementSemanticEvent[] = [];
      if (player.connected && player.life?.phase !== 'dead') {
        const result = stepMovementSimulation(
          player.state,
          player.queue.drain(this.commandsPerPlayerPerTick),
          this.profile,
          this.queries,
        );
        player.state = result.state;
        playerMovementEvents = result.events;
        movementEvents.push(...result.events);
        queryMetrics = addQueryMetrics(queryMetrics, result.metrics);
      } else if (player.connected && player.life?.phase === 'dead') {
        player.queue.drain(this.commandsPerPlayerPerTick);
        player.state = {
          ...player.state,
          tick: asSimulationTick(nextTick),
          player: {
            ...player.state.player,
            intent: {
              ...player.state.player.intent,
              moveX: asQuantizedAxis(0),
              moveZ: asQuantizedAxis(0),
              heldButtons: 0,
              pressedButtons: 0,
              releasedButtons: 0,
            },
          },
        };
      }
      if (player.life !== null && player.autoRifle !== null) {
        const intent = player.state.player.intent;
        const rifle = advanceAutoRifle(player.autoRifle, {
          authorityTick: nextTick,
          authorityInputSequence: nextTick,
          lifePhase: player.life.phase,
          weaponSelected: intent.selectedSlot === 0,
          sprintHeld: player.connected && (intent.heldButtons & INTENT_BUTTON.sprint) !== 0,
          fireHeld: player.connected && (
            (
              intent.heldButtons
              | intent.pressedButtons
            ) & INTENT_BUTTON.primaryFire
          ) !== 0,
          reloadPressed: player.connected && (intent.pressedButtons & INTENT_BUTTON.reload) !== 0,
        }, G4_AUTO_RIFLE_RULES);
        if (!rifle.accepted) throw new Error(`AUTHORITY_AUTO_RIFLE_TICK_REJECTED:${rifle.reason}`);
        player.autoRifle = rifle.state;
        combatEvents.push(...rifle.events);
        if (rifle.shot !== null) {
          acceptedShots.push({ playerId: player.playerId, shot: rifle.shot });
          player.life = endSpawnProtectionOnAcceptedOffense(
            player.life,
            nextTick,
            G4_COMBAT_SLICE_LIFE_RULES,
          );
        }
      }
      if (player.life !== null && player.impulseGrenade !== null) {
        const intent = player.state.player.intent;
        const activeProjectileCount = [...this.impulseGrenadeProjectiles.values()]
          .filter((projectile) => (
            projectile.phase === 'active' && projectile.ownerPlayerId === player.playerId
          )).length;
        const grenade = advanceImpulseGrenadeAbility(player.impulseGrenade, {
          authorityTick: nextTick,
          authorityInputSequence: nextTick,
          lifePhase: player.life.phase,
          abilityEquipped: true,
          throwPressed: player.connected
            && (intent.pressedButtons & INTENT_BUTTON.abilityOne) !== 0,
          activeProjectileCount,
        }, G4_IMPULSE_GRENADE_RULES);
        if (!grenade.accepted) {
          throw new Error(`AUTHORITY_IMPULSE_GRENADE_TICK_REJECTED:${grenade.reason}`);
        }
        player.impulseGrenade = grenade.state;
        if (grenade.throw !== null) {
          const projectile = createImpulseGrenadeProjectile({
            schemaVersion: 1,
            acceptedThrow: grenade.throw,
            ownerTeamId: player.life.teamId,
            authorityOriginMillimeters: authorityImpulseGrenadeOrigin(player.state, this.profile),
            authorityLookYawMilliDegrees: signedYawMilliDegrees(
              player.state.player.yawMilliDegrees,
            ),
            authorityLookPitchMilliDegrees: player.state.player.pitchMilliDegrees,
            roomSeed: this.identity.matchId,
          }, G4_IMPULSE_GRENADE_RULES);
          if (this.impulseGrenadeProjectiles.has(projectile.projectileId)) {
            throw new Error('AUTHORITY_IMPULSE_GRENADE_DUPLICATE_PROJECTILE_ID');
          }
          this.impulseGrenadeProjectiles.set(projectile.projectileId, projectile);
          impulseGrenadeEvents.push(grenade.throw);
          player.life = endSpawnProtectionOnAcceptedOffense(
            player.life,
            nextTick,
            G4_COMBAT_SLICE_LIFE_RULES,
          );
        }
      }
      if (this.abilityResourceCapabilityId !== null) {
        const resources = this.deriveAbilityResources(player, nextTick);
        const teleportOutcomes = playerMovementEvents.filter(
          (event): event is Extract<
            MovementSemanticEvent,
            { readonly kind: 'teleport_succeeded' | 'teleport_rejected' }
          > => (
            event.kind === 'teleport_succeeded' || event.kind === 'teleport_rejected'
          ),
        ) as readonly AuthorityTeleportMovementOutcomeV1[];
        abilityResourceEvents.push(...createAuthorityTeleportResourceEvents({
          schemaVersion: 1,
          authorityTick: nextTick,
          playerId: player.playerId,
          teleportOutcomes,
          resources,
        }, G4_ABILITY_RESOURCE_INTEGRATION_RULES));
      }
    }
    let pendingHitscanResolutions: readonly PendingRoomHitscanResolution[] = [];
    if (this.hitscanCapabilityId !== null && simulateMovement) {
      for (const player of sortedPlayers) this.recordCurrentHitscanPose(player, nextTick);
      pendingHitscanResolutions = this.buildPendingHitscanResolutions(
        acceptedShots,
        sortedPlayers,
        nextTick,
      );
    }
    if (this.impulseGrenadeCapabilityId !== null && simulateMovement) {
      if (this.impulseGrenadeWorldPort === null) {
        throw new Error('AUTHORITY_IMPULSE_GRENADE_WORLD_PORT_MISSING');
      }
      const orderedProjectiles = [...this.impulseGrenadeProjectiles.values()]
        .sort((left, right) => (
          left.projectileId < right.projectileId
            ? -1
            : left.projectileId > right.projectileId ? 1 : 0
        ));
      for (const projectile of orderedProjectiles) {
        const step = advanceImpulseGrenadeProjectile(
          projectile,
          nextTick,
          this.impulseGrenadeWorldPort,
          G4_IMPULSE_GRENADE_RULES,
        );
        if (!step.accepted) {
          throw new Error(`AUTHORITY_IMPULSE_GRENADE_PROJECTILE_REJECTED:${step.reason}`);
        }
        impulseGrenadeEvents.push(...step.events);
        if (step.detonation === null) {
          this.impulseGrenadeProjectiles.set(projectile.projectileId, step.state);
        } else {
          this.impulseGrenadeProjectiles.delete(projectile.projectileId);
          impulseGrenadeDetonations.push(step.detonation);
        }
      }
    }
    this.tick = nextTick;
    if (this.tdmMatchState !== null) {
      this.tdmMatchState = prepareAuthorityTdmMatchTick(this.tdmMatchState, nextTick);
    }
    this.deferTdmLifecycleSync = this.tdmMatchState !== null;
    let hitscanResults: readonly AuthorityRoomHitscanTickResult[];
    try {
      hitscanResults = this.resolvePendingHitscanResolutions(pendingHitscanResolutions);
    } finally {
      this.deferTdmLifecycleSync = false;
    }
    const impulseGrenadeResults = this.resolveImpulseGrenadeDetonations(
      impulseGrenadeDetonations,
      impulseGrenadeEvents,
    );
    this.cumulativeQueryMetrics = addQueryMetrics(this.cumulativeQueryMetrics, queryMetrics);

    const prunedPlayerIds: string[] = [];
    for (const player of this.players.values()) {
      if (
        !player.connected
        && player.disconnectedAtTick !== null
        && this.tick - player.disconnectedAtTick > this.reconnectGraceTicks
      ) {
        prunedPlayerIds.push(player.playerId);
      }
    }
    for (const playerId of prunedPlayerIds.sort()) this.leavePlayer(playerId);

    if (this.tdmMatchState !== null) {
      const settled = settleAuthorityTdmMatchTick(this.tdmMatchState);
      this.tdmMatchState = settled.state;
      matchEvents.push(...settled.events);
      const transition = this.synchronizeTdmLifecycle();
      if (transition !== null) lifecycleTransitions.push(transition);
    } else {
      const phaseAge = this.tick - this.phaseStartedAtTick;
      if (this.phase === 'warmup' && phaseAge >= this.warmupTicks) {
        this.transitionTo('active');
        lifecycleTransitions.push('active');
      } else if (this.phase === 'active' && phaseAge >= this.activeTicks) {
        this.transitionTo('postmatch');
        this.impulseGrenadeProjectiles.clear();
        lifecycleTransitions.push('postmatch');
      } else if (this.phase === 'postmatch' && phaseAge >= this.postmatchTicks) {
        this.transitionTo('idle');
        lifecycleTransitions.push('idle');
      }
    }
    this.activeTickMatchEvents = null;
    return Object.freeze({
      serverTick: this.tick,
      lifecycle: this.phase,
      lifecycleTransitions: Object.freeze(lifecycleTransitions),
      movementEvents: Object.freeze(movementEvents),
      queryMetrics: Object.freeze(queryMetrics),
      prunedPlayerIds: Object.freeze(prunedPlayerIds),
      ...(this.combatProfileId === null
        ? {}
        : { combatEvents: Object.freeze(combatEvents) }),
      ...(this.hitscanCapabilityId === null
        ? {}
        : { hitscanResults: deepFreeze(hitscanResults) }),
      ...(this.impulseGrenadeCapabilityId === null
        ? {}
        : {
            impulseGrenadeEvents: deepFreeze(impulseGrenadeEvents),
            impulseGrenadeResults: deepFreeze(impulseGrenadeResults),
          }),
      ...(this.abilityResourceCapabilityId === null
        ? {}
        : { abilityResourceEvents: deepFreeze(abilityResourceEvents) }),
      ...(this.tdmMatchCapabilityId === null
        ? {}
        : { matchEvents: deepFreeze(matchEvents) }),
    });
  }

  private recordCurrentHitscanPose(
    player: AuthorityPlayerRecord,
    authorityTick: number,
  ): void {
    if (player.poseHistory === null || player.life === null) {
      throw new Error('AUTHORITY_HITSCAN_PLAYER_STATE_MISSING');
    }
    player.poseHistory = recordTargetPoseSample(player.poseHistory, {
      schemaVersion: 1,
      authorityTick,
      teamId: player.life.teamId,
      lifePhase: player.life.phase,
      positionMillimeters: {
        x: player.state.player.feetPosition.x,
        y: player.state.player.feetPosition.y,
        z: player.state.player.feetPosition.z,
      },
      bodyYawMilliDegrees: signedYawMilliDegrees(player.state.player.yawMilliDegrees),
      hitVolumes: scaledRoomHitVolumes(player.state, this.profile),
    });
  }

  private buildPendingHitscanResolutions(
    acceptedShots: readonly PendingAcceptedRoomShot[],
    sortedPlayers: readonly AuthorityPlayerRecord[],
    authorityTick: number,
  ): readonly PendingRoomHitscanResolution[] {
    const targetHistories: TargetPoseHistoryV1[] = [];
    for (const player of sortedPlayers) {
      if (player.poseHistory === null) throw new Error('AUTHORITY_HITSCAN_PLAYER_STATE_MISSING');
      targetHistories.push(player.poseHistory);
    }
    const orderedShots = [...acceptedShots].sort((left, right) => {
      if (left.shot.authorityTick !== right.shot.authorityTick) {
        return left.shot.authorityTick - right.shot.authorityTick;
      }
      if (left.playerId !== right.playerId) return left.playerId < right.playerId ? -1 : 1;
      if (left.shot.shotOrdinal !== right.shot.shotOrdinal) {
        return left.shot.shotOrdinal - right.shot.shotOrdinal;
      }
      return left.shot.eventId < right.shot.eventId
        ? -1
        : left.shot.eventId > right.shot.eventId ? 1 : 0;
    });
    return orderedShots.map(({ playerId, shot }) => {
      const shooter = this.players.get(playerId);
      if (
        shooter === undefined
        || shooter.life === null
        || shooter.observedRttHistory === null
      ) {
        throw new Error('AUTHORITY_HITSCAN_SHOOTER_STATE_MISSING');
      }
      if (shooter.observedRttHistory.length === 0) {
        return Object.freeze({
          shot,
          request: null,
          roomRejectionReason: 'server_rtt_history_unavailable' as const,
        });
      }
      const aimOffsets = authorityAimOffsets(shooter.state, this.profile);
      const request: AuthoritativeAutoRifleHitscanRequestV1 = {
        schemaVersion: 1,
        currentAuthorityTick: authorityTick,
        serverReceiptTick: shot.authorityTick,
        shooterPose: {
          schemaVersion: 1,
          authorityTick,
          playerId,
          teamId: shooter.life.teamId,
          lifePhase: shooter.life.phase,
          positionMillimeters: {
            x: shooter.state.player.feetPosition.x,
            y: shooter.state.player.feetPosition.y,
            z: shooter.state.player.feetPosition.z,
          },
          bodyYawMilliDegrees: signedYawMilliDegrees(shooter.state.player.yawMilliDegrees),
          eyeOffsetMillimeters: aimOffsets.eyeOffsetMillimeters,
          muzzleOffsetMillimeters: aimOffsets.muzzleOffsetMillimeters,
        },
        acceptedLook: {
          schemaVersion: 1,
          acceptedAtAuthorityTick: shot.authorityTick,
          yawMilliDegrees: signedYawMilliDegrees(shooter.state.player.yawMilliDegrees),
          pitchMilliDegrees: shooter.state.player.pitchMilliDegrees,
        },
        acceptedShot: shot,
        observedRttHistory: shooter.observedRttHistory,
        targetHistories,
      };
      return Object.freeze({
        shot,
        request,
        roomRejectionReason: null,
      });
    });
  }

  private resolvePendingHitscanResolutions(
    pendingResolutions: readonly PendingRoomHitscanResolution[],
  ): readonly AuthorityRoomHitscanTickResult[] {
    if (pendingResolutions.length === 0) return Object.freeze([]);
    if (this.worldOcclusionPort === null) {
      throw new Error('AUTHORITY_HITSCAN_WORLD_PORT_MISSING');
    }
    return pendingResolutions.map((pending, resolutionOrdinal) => {
      if (pending.request === null) {
        return deepFreeze({
          resolutionOrdinal,
          acceptedShot: pending.shot,
          roomRejectionReason: pending.roomRejectionReason,
          resolution: null,
          damage: null,
        });
      }
      const resolution = resolveAuthoritativeAutoRifleHitscan(
        pending.request,
        this.worldOcclusionPort as AuthorityWorldOcclusionPort,
      );
      const damage = resolution.accepted && resolution.outcome === 'hit'
        ? this.applyCombatDamageInternal({
            targetPlayerId: resolution.hit.targetPlayerId,
            sourcePlayerId: pending.shot.playerId,
            damagePoints: resolution.hit.damagePoints,
            causeId: pending.shot.eventId,
          }, false)
        : null;
      return deepFreeze({
        resolutionOrdinal,
        acceptedShot: pending.shot,
        roomRejectionReason: null,
        resolution,
        damage,
      });
    });
  }

  private resolveImpulseGrenadeDetonations(
    detonations: readonly ImpulseGrenadeDetonatedEvent[],
    impulseGrenadeEvents: ImpulseGrenadeEvent[],
  ): readonly AuthorityRoomImpulseGrenadeTickResult[] {
    if (detonations.length === 0) return Object.freeze([]);
    if (this.impulseGrenadeWorldPort === null) {
      throw new Error('AUTHORITY_IMPULSE_GRENADE_WORLD_PORT_MISSING');
    }
    const orderedDetonations = [...detonations].sort((left, right) => {
      if (left.authorityTick !== right.authorityTick) {
        return left.authorityTick - right.authorityTick;
      }
      if (left.projectileId !== right.projectileId) {
        return left.projectileId < right.projectileId ? -1 : 1;
      }
      return left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0;
    });
    return orderedDetonations.map((detonation, resolutionOrdinal) => {
      const targets = [...this.players.values()]
        .sort((left, right) => (
          left.playerId < right.playerId ? -1 : left.playerId > right.playerId ? 1 : 0
        ))
        .map((player) => {
          if (player.life === null) throw new Error('AUTHORITY_IMPULSE_GRENADE_TARGET_STATE_MISSING');
          const shape = player.state.player.stance === 'crouched'
            ? this.profile.crouchedShape
            : this.profile.standingShape;
          return {
            schemaVersion: 1 as const,
            playerId: player.playerId,
            teamId: player.life.teamId,
            lifePhase: player.life.phase,
            feetPositionMillimeters: {
              x: player.state.player.feetPosition.x,
              y: player.state.player.feetPosition.y,
              z: player.state.player.feetPosition.z,
            },
            centerPositionMillimeters: {
              x: player.state.player.feetPosition.x,
              y: player.state.player.feetPosition.y + Math.round(shape.height / 2),
              z: player.state.player.feetPosition.z,
            },
            capsule: {
              heightMillimeters: shape.height,
              radiusMillimeters: shape.radius,
            },
            currentVelocityMillimetersPerSecond: {
              x: player.state.player.velocity.x,
              y: player.state.player.velocity.y,
              z: player.state.player.velocity.z,
            },
          };
        });
      const radial = resolveImpulseGrenadeRadialImpulse({
        schemaVersion: 1,
        detonation,
        targets,
      }, this.impulseGrenadeWorldPort as AuthorityImpulseGrenadeWorldPort, G4_IMPULSE_GRENADE_RULES);
      for (const event of radial.events) {
        const target = this.players.get(event.targetPlayerId);
        if (target === undefined || target.life === null) {
          throw new Error('AUTHORITY_IMPULSE_GRENADE_TARGET_STATE_MISSING');
        }
        const impulse = event.appliedImpulseMillimetersPerSecond;
        const changed = impulse.x !== 0 || impulse.y !== 0 || impulse.z !== 0;
        target.state = {
          ...target.state,
          player: {
            ...target.state.player,
            velocity: {
              x: asMillimetersPerSecond(target.state.player.velocity.x + impulse.x),
              y: asMillimetersPerSecond(target.state.player.velocity.y + impulse.y),
              z: asMillimetersPerSecond(target.state.player.velocity.z + impulse.z),
            },
            ...(changed
              ? {
                  grounded: false,
                  locomotion: 'airborne' as const,
                  support: null,
                }
              : {}),
          },
        };
      }
      impulseGrenadeEvents.push(...radial.events);
      return deepFreeze({ resolutionOrdinal, detonation, radial });
    });
  }

  private deriveAbilityResources(
    player: AuthorityPlayerRecord,
    authorityTick: number,
  ): AuthorityAbilityResourceSnapshotV1 {
    if (
      this.abilityResourceCapabilityId === null
      || player.life === null
      || player.autoRifle === null
      || player.impulseGrenade === null
    ) {
      throw new Error('AUTHORITY_ABILITY_RESOURCE_PLAYER_STATE_MISSING');
    }
    const activeImpulseGrenadeCount = [...this.impulseGrenadeProjectiles.values()]
      .filter((projectile) => (
        projectile.phase === 'active' && projectile.ownerPlayerId === player.playerId
      )).length;
    const intent = player.state.player.intent;
    return deriveAuthorityAbilityResources({
      schemaVersion: 1,
      authorityTick,
      lifePhase: player.life.phase,
      movement: {
        schemaVersion: 1,
        authorityTick: player.state.tick,
        movementProfileId: this.profile.id,
        movementProfileRevision: this.profile.revision,
        movementProfileHash: this.movementProfileHash,
        selectedSlot: intent.selectedSlot,
        sprintHeld: player.connected && (intent.heldButtons & INTENT_BUTTON.sprint) !== 0,
        locomotion: player.state.player.locomotion,
        teleportCooldownTicksRemaining: player.state.player.teleportCooldownTicksRemaining,
      },
      autoRifle: player.autoRifle,
      impulseGrenade: player.impulseGrenade,
      activeImpulseGrenadeCount,
    }, G4_ABILITY_RESOURCE_INTEGRATION_RULES);
  }

  private activeMatchCheckpointIdentity(): AuthorityFullSnapshot['identity'] {
    return Object.freeze({
      ...this.identity,
      movementProfileId: this.profile.id,
      movementProfileRevision: this.profile.revision,
      movementProfileHash: this.movementProfileHash,
    });
  }

  private assertActiveMatchCheckpointCapabilities(): void {
    if (
      this.combatProfileId !== G4_COMBAT_ROOM_PROFILE_ID
      || this.hitscanCapabilityId !== G4_HITSCAN_ROOM_CAPABILITY_ID
      || this.impulseGrenadeCapabilityId !== G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID
      || this.abilityResourceCapabilityId !== G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID
      || this.tdmMatchCapabilityId !== G4_TDM_MATCH_ROOM_CAPABILITY_ID
      || this.tdmMatchState === null
    ) {
      throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_CAPABILITIES_UNAVAILABLE');
    }
  }

  exportActiveMatchCheckpoint(): AuthorityActiveMatchCheckpointV1 {
    this.assertActiveMatchCheckpointCapabilities();
    if (
      !this.matchStarted
      || (this.phase !== 'warmup' && this.phase !== 'active' && this.phase !== 'postmatch')
    ) {
      throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_PHASE_UNAVAILABLE');
    }
    if (this.activeTickMatchEvents !== null || this.deferTdmLifecycleSync) {
      throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_TICK_IN_PROGRESS');
    }
    const players = [...this.players.values()]
      .sort((left, right) => left.playerOrdinal - right.playerOrdinal)
      .map((player) => {
        if (
          player.life === null
          || player.autoRifle === null
          || player.impulseGrenade === null
          || player.poseHistory === null
          || player.observedRttHistory === null
        ) {
          throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_PLAYER_STATE_MISSING');
        }
        return {
          playerOrdinal: player.playerOrdinal,
          playerId: player.playerId,
          connectionId: player.connectionId,
          connected: player.connected,
          disconnectedAtTick: player.disconnectedAtTick,
          movement: structuredClone(player.state),
          life: structuredClone(player.life),
          autoRifle: structuredClone(player.autoRifle),
          impulseGrenade: structuredClone(player.impulseGrenade),
          poseHistory: structuredClone(player.poseHistory),
          observedRttHistory: structuredClone(player.observedRttHistory),
          inputQueue: player.queue.exportCheckpoint(),
        } satisfies AuthorityActiveMatchCheckpointPlayerV1;
      });
    return deepFreeze({
      kind: 'authority_active_match_checkpoint',
      schemaVersion: AUTHORITY_ACTIVE_MATCH_CHECKPOINT_SCHEMA_VERSION,
      identity: this.activeMatchCheckpointIdentity(),
      options: {
        maximumPlayers: this.maximumPlayers,
        commandsPerPlayerPerTick: this.commandsPerPlayerPerTick,
        warmupTicks: this.warmupTicks,
        activeTicks: this.activeTicks,
        postmatchTicks: this.postmatchTicks,
        reconnectGraceTicks: this.reconnectGraceTicks,
        minimumConnectedPlayersToStart: this.minimumConnectedPlayersToStart,
        combatProfileId: G4_COMBAT_ROOM_PROFILE_ID,
        hitscanCapabilityId: G4_HITSCAN_ROOM_CAPABILITY_ID,
        impulseGrenadeCapabilityId: G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
        abilityResourceCapabilityId: G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID,
        tdmMatchCapabilityId: G4_TDM_MATCH_ROOM_CAPABILITY_ID,
      },
      clock: {
        serverTick: this.tick,
        lifecycle: this.phase,
        phaseStartedAtTick: this.phaseStartedAtTick,
        matchStarted: true,
      },
      counters: {
        acceptedInputs: this.acceptedInputs,
        inputRejections: { ...this.inputRejections },
        maximumObservedQueueDepth: this.maximumObservedQueueDepth,
        missedSchedulerTicks: this.missedSchedulerTicks,
        cumulativeQueryMetrics: { ...this.cumulativeQueryMetrics },
        nextCombatEventSequence: this.nextCombatEventSequence,
      },
      players,
      impulseGrenadeProjectiles: [...this.impulseGrenadeProjectiles.values()]
        .sort((left, right) => left.projectileId < right.projectileId ? -1 : 1)
        .map((projectile) => structuredClone(projectile)),
      match: structuredClone(this.tdmMatchState as AuthorityTdmMatchStateV1),
      pendingMatchEvents: structuredClone(this.pendingMatchEvents),
    } satisfies AuthorityActiveMatchCheckpointV1);
  }

  restoreActiveMatchCheckpoint(checkpointValue: unknown): AuthorityFullSnapshot {
    this.assertActiveMatchCheckpointCapabilities();
    if (
      this.phase !== 'created'
      || this.tick !== 0
      || this.matchStarted
      || this.players.size !== 0
      || this.connectionOwners.size !== 0
      || this.impulseGrenadeProjectiles.size !== 0
      || this.pendingMatchEvents.length !== 0
      || this.activeTickMatchEvents !== null
      || this.deferTdmLifecycleSync
      || this.tdmMatchState?.phase !== 'lobby'
      || this.tdmMatchState.playerScores.length !== 0
    ) {
      throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_RESTORE_REQUIRES_PRISTINE_ROOM');
    }
    assertStrictCombatDataTree(checkpointValue, 'authority active match checkpoint');
    const checkpoint = structuredClone(checkpointValue) as AuthorityActiveMatchCheckpointV1;
    const root = checkpointRecord(checkpoint, [
      'kind', 'schemaVersion', 'identity', 'options', 'clock', 'counters', 'players',
      'impulseGrenadeProjectiles', 'match', 'pendingMatchEvents',
    ], 'authority active match checkpoint');
    checkpointLiteral(root.kind, 'authority_active_match_checkpoint', 'authority checkpoint kind');
    checkpointLiteral(
      root.schemaVersion,
      AUTHORITY_ACTIVE_MATCH_CHECKPOINT_SCHEMA_VERSION,
      'authority checkpoint schema',
    );
    checkpointFlatRecordMatches(
      root.identity,
      this.activeMatchCheckpointIdentity() as unknown as Readonly<
        Record<string, string | number | boolean | null>
      >,
      'authority checkpoint identity',
    );
    checkpointFlatRecordMatches(root.options, {
      maximumPlayers: this.maximumPlayers,
      commandsPerPlayerPerTick: this.commandsPerPlayerPerTick,
      warmupTicks: this.warmupTicks,
      activeTicks: this.activeTicks,
      postmatchTicks: this.postmatchTicks,
      reconnectGraceTicks: this.reconnectGraceTicks,
      minimumConnectedPlayersToStart: this.minimumConnectedPlayersToStart,
      combatProfileId: G4_COMBAT_ROOM_PROFILE_ID,
      hitscanCapabilityId: G4_HITSCAN_ROOM_CAPABILITY_ID,
      impulseGrenadeCapabilityId: G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
      abilityResourceCapabilityId: G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID,
      tdmMatchCapabilityId: G4_TDM_MATCH_ROOM_CAPABILITY_ID,
    }, 'authority checkpoint options');

    const clock = checkpointRecord(
      root.clock,
      ['serverTick', 'lifecycle', 'phaseStartedAtTick', 'matchStarted'],
      'authority checkpoint clock',
    );
    const serverTick = checkpointInteger(
      clock.serverTick,
      0,
      ACTIVE_MATCH_CHECKPOINT_MAX_TICK,
      'authority checkpoint server tick',
    );
    if (clock.lifecycle !== 'warmup' && clock.lifecycle !== 'active' && clock.lifecycle !== 'postmatch') {
      throw new RangeError('authority checkpoint lifecycle is unsupported');
    }
    const lifecycle = clock.lifecycle;
    const phaseStartedAtTick = checkpointInteger(
      clock.phaseStartedAtTick,
      0,
      serverTick,
      'authority checkpoint phase start',
    );
    checkpointLiteral(clock.matchStarted, true, 'authority checkpoint match-started flag');
    const phaseDuration = lifecycle === 'warmup'
      ? this.warmupTicks
      : lifecycle === 'active' ? this.activeTicks : this.postmatchTicks;
    if (serverTick >= phaseStartedAtTick + phaseDuration) {
      throw new RangeError('authority checkpoint phase clock has crossed its boundary');
    }

    const counters = checkpointRecord(root.counters, [
      'acceptedInputs', 'inputRejections', 'maximumObservedQueueDepth', 'missedSchedulerTicks',
      'cumulativeQueryMetrics', 'nextCombatEventSequence',
    ], 'authority checkpoint counters');
    const acceptedInputs = checkpointInteger(
      counters.acceptedInputs,
      0,
      Number.MAX_SAFE_INTEGER,
      'authority accepted inputs',
    );
    const rejections = checkpointRecord(counters.inputRejections, [
      'duplicate_sequence', 'stale_sequence', 'sequence_too_far_ahead',
      'client_tick_too_far_ahead', 'client_tick_too_old', 'queue_full',
    ], 'authority input rejection counters');
    const inputRejections = emptyRejections();
    for (const reason of Object.keys(inputRejections) as InputQueueRejectionReason[]) {
      inputRejections[reason] = checkpointInteger(
        rejections[reason],
        0,
        Number.MAX_SAFE_INTEGER,
        `authority ${reason} counter`,
      );
    }
    const maximumObservedQueueDepth = checkpointInteger(
      counters.maximumObservedQueueDepth,
      0,
      4_096,
      'authority maximum observed queue depth',
    );
    const missedSchedulerTicks = checkpointInteger(
      counters.missedSchedulerTicks,
      0,
      Number.MAX_SAFE_INTEGER,
      'authority missed scheduler ticks',
    );
    const metricRecord = checkpointRecord(counters.cumulativeQueryMetrics, [
      'moveCapsuleCalls', 'overlapCapsuleCalls', 'castCapsuleCalls', 'volumeCalls',
      'shapeCasts', 'overlapTests', 'contacts',
    ], 'authority cumulative query metrics');
    const cumulativeQueryMetrics: MovementQueryMetrics = {
      moveCapsuleCalls: checkpointInteger(metricRecord.moveCapsuleCalls, 0, Number.MAX_SAFE_INTEGER, 'move capsule calls'),
      overlapCapsuleCalls: checkpointInteger(metricRecord.overlapCapsuleCalls, 0, Number.MAX_SAFE_INTEGER, 'overlap capsule calls'),
      castCapsuleCalls: checkpointInteger(metricRecord.castCapsuleCalls, 0, Number.MAX_SAFE_INTEGER, 'cast capsule calls'),
      volumeCalls: checkpointInteger(metricRecord.volumeCalls, 0, Number.MAX_SAFE_INTEGER, 'volume calls'),
      shapeCasts: checkpointInteger(metricRecord.shapeCasts, 0, Number.MAX_SAFE_INTEGER, 'shape casts'),
      overlapTests: checkpointInteger(metricRecord.overlapTests, 0, Number.MAX_SAFE_INTEGER, 'overlap tests'),
      contacts: checkpointInteger(metricRecord.contacts, 0, Number.MAX_SAFE_INTEGER, 'query contacts'),
    };
    const nextCombatEventSequence = checkpointInteger(
      counters.nextCombatEventSequence,
      0,
      ACTIVE_MATCH_CHECKPOINT_MAX_TICK,
      'authority next combat event sequence',
    );

    const playerValues = checkpointArray(root.players, 0, this.maximumPlayers, 'authority checkpoint players');
    const restoredPlayers = new Map<string, AuthorityPlayerRecord>();
    const restoredConnections = new Map<string, string>();
    const checkpointPlayersById = new Map<string, AuthorityActiveMatchCheckpointPlayerV1>();
    const restoredPlayerOrdinals = new Set<number>();
    const defaultQueue = new BoundedInputQueue().exportCheckpoint();
    for (let playerIndex = 0; playerIndex < playerValues.length; playerIndex += 1) {
      const value = playerValues[playerIndex];
      const player = checkpointRecord(value, [
        'playerOrdinal', 'playerId', 'connectionId', 'connected', 'disconnectedAtTick',
        'movement', 'life', 'autoRifle', 'impulseGrenade', 'poseHistory',
        'observedRttHistory', 'inputQueue',
      ], 'authority checkpoint player') as unknown as AuthorityActiveMatchCheckpointPlayerV1;
      const playerOrdinal = checkpointInteger(
        player.playerOrdinal,
        0,
        this.maximumPlayers - 1,
        'authority checkpoint player ordinal',
      );
      if (restoredPlayerOrdinals.has(playerOrdinal)) {
        throw new RangeError('authority checkpoint player ordinals must be unique');
      }
      restoredPlayerOrdinals.add(playerOrdinal);
      const playerId = stableId(player.playerId, 'authority checkpoint player id');
      if (restoredPlayers.has(playerId)) throw new RangeError('authority checkpoint player ids must be unique');
      const connected = checkpointBoolean(player.connected, 'authority checkpoint connected flag');
      const connectionId = optionalStableId(player.connectionId, 'authority checkpoint connection id');
      let disconnectedAtTick: number | null = null;
      if (connected) {
        if (connectionId === null || player.disconnectedAtTick !== null) {
          throw new RangeError('connected checkpoint player requires exactly one live connection');
        }
        if (restoredConnections.has(connectionId)) {
          throw new RangeError('authority checkpoint connection ids must be unique');
        }
        restoredConnections.set(connectionId, playerId);
      } else {
        if (connectionId !== null) throw new RangeError('disconnected checkpoint player retains a connection');
        disconnectedAtTick = checkpointInteger(
          player.disconnectedAtTick,
          Math.max(0, serverTick - this.reconnectGraceTicks),
          serverTick,
          'authority checkpoint disconnect tick',
        );
      }
      assertMovementSimulationState(player.movement, this.profile);
      checkpointLiteral(player.movement.player.id, playerId, 'checkpoint movement player id');
      checkpointInteger(player.movement.tick, 0, serverTick, 'checkpoint movement tick');
      const queue = BoundedInputQueue.fromCheckpoint(player.inputQueue);
      for (const key of [
        'schemaVersion', 'maximumPendingInputs', 'maximumSequenceLead', 'maximumClientTickLead',
        'maximumClientTickLag', 'maximumReorderWaitTicks',
      ] as const) {
        checkpointLiteral(player.inputQueue[key], defaultQueue[key], `checkpoint input queue ${key}`);
      }
      checkpointLiteral(
        player.inputQueue.processedSequence,
        player.movement.player.lastProcessedSequence,
        'checkpoint input queue processed sequence',
      );
      const life = validateCheckpointCombatLife(
        player.life,
        playerId,
        serverTick,
        nextCombatEventSequence,
      );
      assertAutoRifleState(player.autoRifle, G4_AUTO_RIFLE_RULES);
      checkpointLiteral(player.autoRifle.playerId, playerId, 'checkpoint auto rifle player');
      checkpointInteger(
        player.autoRifle.lastProcessedAuthorityTick,
        -1,
        serverTick,
        'checkpoint auto rifle tick',
      );
      const expectedGrenadeNamespace = createImpulseGrenadeAbilityState({
        playerId,
        roomSeed: this.identity.matchId,
        authorityTick: 0,
      }, G4_IMPULSE_GRENADE_RULES).eventNamespace;
      const impulseGrenade = validateCheckpointImpulseGrenadeAbility(
        player.impulseGrenade,
        playerId,
        expectedGrenadeNamespace,
        serverTick,
      );
      if ((life.phase === 'dead') !== (impulseGrenade.phase === 'dead')) {
        throw new RangeError('checkpoint life and grenade death phases disagree');
      }
      assertTargetPoseHistory(player.poseHistory, 'authority checkpoint pose history');
      checkpointLiteral(player.poseHistory.playerId, playerId, 'checkpoint pose history player');
      const latestPose = player.poseHistory.samples.at(-1);
      if (latestPose !== undefined) {
        checkpointInteger(latestPose.authorityTick, 0, serverTick, 'checkpoint latest pose tick');
      }
      const observedRttHistory = checkpointArray(
        player.observedRttHistory,
        0,
        ROOM_HITSCAN_RTT_HISTORY_CAPACITY,
        'authority checkpoint RTT history',
      ) as readonly ObservedRttSampleV1[];
      let priorRttTick = -1;
      for (const sampleValue of observedRttHistory) {
        const sample = checkpointRecord(
          sampleValue,
          ['schemaVersion', 'observedAtReceiptTick', 'roundTripMilliseconds'],
          'authority checkpoint RTT sample',
        );
        checkpointLiteral(sample.schemaVersion, 1, 'authority RTT sample schema');
        const observedAtReceiptTick = checkpointInteger(
          sample.observedAtReceiptTick,
          0,
          serverTick,
          'authority RTT sample tick',
        );
        if (observedAtReceiptTick <= priorRttTick) {
          throw new RangeError('authority RTT samples must have unique increasing ticks');
        }
        priorRttTick = observedAtReceiptTick;
        checkpointInteger(
          sample.roundTripMilliseconds,
          0,
          ROOM_HITSCAN_MAX_RTT_MILLISECONDS,
          'authority RTT sample value',
        );
      }
      const retainedPlayer = deepFreeze({
        ...player,
        movement: structuredClone(player.movement),
        life: structuredClone(life),
        autoRifle: structuredClone(player.autoRifle),
        impulseGrenade: structuredClone(impulseGrenade),
        poseHistory: structuredClone(player.poseHistory),
        observedRttHistory: structuredClone(observedRttHistory),
        inputQueue: structuredClone(player.inputQueue),
      });
      checkpointPlayersById.set(playerId, retainedPlayer);
      restoredPlayers.set(playerId, {
        playerOrdinal,
        playerId,
        connectionId,
        connected,
        disconnectedAtTick,
        state: retainedPlayer.movement,
        life: retainedPlayer.life,
        autoRifle: retainedPlayer.autoRifle,
        impulseGrenade: retainedPlayer.impulseGrenade,
        poseHistory: retainedPlayer.poseHistory,
        observedRttHistory: retainedPlayer.observedRttHistory,
        queue,
      });
    }

    const projectileValues = checkpointArray(
      root.impulseGrenadeProjectiles,
      0,
      this.maximumPlayers * G4_IMPULSE_GRENADE_RULES.maximumActivePerPlayer,
      'authority checkpoint impulse grenade projectiles',
    );
    if (lifecycle === 'postmatch' && projectileValues.length !== 0) {
      throw new RangeError('postmatch checkpoint cannot retain active projectiles');
    }
    const restoredProjectiles = new Map<string, ImpulseGrenadeProjectileState>();
    const activeProjectileCounts = new Map<string, number>();
    let previousProjectileId: string | null = null;
    for (const projectileValue of projectileValues) {
      const projectile = validateCheckpointImpulseGrenadeProjectile(
        projectileValue,
        checkpointPlayersById,
        serverTick,
      );
      if (previousProjectileId !== null && projectile.projectileId <= previousProjectileId) {
        throw new RangeError('authority checkpoint projectile ids must be unique and sorted');
      }
      previousProjectileId = projectile.projectileId;
      const activeCount = (activeProjectileCounts.get(projectile.ownerPlayerId) ?? 0) + 1;
      if (activeCount > G4_IMPULSE_GRENADE_RULES.maximumActivePerPlayer) {
        throw new RangeError('authority checkpoint exceeds the per-player grenade limit');
      }
      activeProjectileCounts.set(projectile.ownerPlayerId, activeCount);
      restoredProjectiles.set(projectile.projectileId, deepFreeze(structuredClone(projectile)));
    }
    const restoredMatch = validateCheckpointTdmMatch(
      root.match,
      this.identity.matchId,
      lifecycle,
      phaseStartedAtTick,
      serverTick,
      nextCombatEventSequence,
      checkpointPlayersById,
    );
    const restoredPendingEvents = validateCheckpointPendingMatchEvents(
      root.pendingMatchEvents,
      this.identity.matchId,
      lifecycle,
      phaseStartedAtTick,
      serverTick,
    );

    this.players.clear();
    for (const [playerId, player] of restoredPlayers) this.players.set(playerId, player);
    this.connectionOwners.clear();
    for (const [connectionId, playerId] of restoredConnections) {
      this.connectionOwners.set(connectionId, playerId);
    }
    this.impulseGrenadeProjectiles.clear();
    for (const [projectileId, projectile] of restoredProjectiles) {
      this.impulseGrenadeProjectiles.set(projectileId, projectile);
    }
    this.phase = lifecycle;
    this.phaseStartedAtTick = phaseStartedAtTick;
    this.tick = serverTick;
    this.acceptedInputs = acceptedInputs;
    this.inputRejections = inputRejections;
    this.maximumObservedQueueDepth = maximumObservedQueueDepth;
    this.missedSchedulerTicks = missedSchedulerTicks;
    this.cumulativeQueryMetrics = cumulativeQueryMetrics;
    this.matchStarted = true;
    this.nextCombatEventSequence = nextCombatEventSequence;
    this.tdmMatchState = deepFreeze(structuredClone(restoredMatch));
    this.pendingMatchEvents = structuredClone(restoredPendingEvents) as AuthorityTdmMatchEvent[];
    this.activeTickMatchEvents = null;
    this.deferTdmLifecycleSync = false;
    return this.fullSnapshot();
  }

  fullSnapshot(): AuthorityFullSnapshot {
    return deepFreeze({
      kind: 'authority_full_snapshot',
      identity: Object.freeze({
        ...this.identity,
        movementProfileId: this.profile.id,
        movementProfileRevision: this.profile.revision,
        movementProfileHash: this.movementProfileHash,
      }),
      serverTick: this.tick,
      lifecycle: this.phase,
      phaseEndsAtTick: this.phaseEndsAtTick(),
      players: Object.freeze([...this.players.values()]
        .sort((left, right) => left.playerId < right.playerId ? -1 : left.playerId > right.playerId ? 1 : 0)
        .map((player) => Object.freeze({
          playerId: player.playerId,
          connected: player.connected,
          lastProcessedInputSequence: player.state.player.lastProcessedSequence,
          movement: structuredClone(player.state),
          ...(player.life === null || player.autoRifle === null
            ? {}
            : {
                combat: Object.freeze({
                  life: structuredClone(player.life),
                  autoRifle: structuredClone(player.autoRifle),
                  ...(player.impulseGrenade === null
                    ? {}
                    : { impulseGrenade: structuredClone(player.impulseGrenade) }),
                  ...(this.abilityResourceCapabilityId === null
                    ? {}
                    : { abilityResources: this.deriveAbilityResources(player, this.tick) }),
                }),
              }),
        }))),
      ...(this.impulseGrenadeCapabilityId === null
        ? {}
        : {
            impulseGrenadeProjectiles: Object.freeze(
              [...this.impulseGrenadeProjectiles.values()]
                .sort((left, right) => (
                  left.projectileId < right.projectileId
                    ? -1
                    : left.projectileId > right.projectileId ? 1 : 0
                ))
                .map((projectile) => structuredClone(projectile)),
            ),
          }),
      ...(this.tdmMatchState === null
        ? {}
        : { match: structuredClone(this.tdmMatchState) }),
    });
  }

  protocolEntities(): readonly SnapshotEntity[] {
    return Object.freeze([...this.players.values()]
      .sort((left, right) => left.playerId < right.playerId ? -1 : left.playerId > right.playerId ? 1 : 0)
      .map(({ state, life }) => Object.freeze({
        id: state.player.id,
        kind: 'player' as const,
        xMillimeters: state.player.feetPosition.x,
        yMillimeters: state.player.feetPosition.y,
        zMillimeters: state.player.feetPosition.z,
        velocityXMillimetersPerSecond: state.player.velocity.x,
        velocityYMillimetersPerSecond: state.player.velocity.y,
        velocityZMillimetersPerSecond: state.player.velocity.z,
        yawMilliDegrees: state.player.yawMilliDegrees > 180_000
          ? state.player.yawMilliDegrees - 360_000
          : state.player.yawMilliDegrees,
        pitchMilliDegrees: state.player.pitchMilliDegrees,
        healthPoints: life?.healthPoints ?? 100,
        shieldPoints: life?.shieldPoints ?? 0,
      })));
  }

  metricsSnapshot(): AuthorityRoomMetricsSnapshot {
    return Object.freeze({
      serverTick: this.tick,
      lifecycle: this.phase,
      players: this.players.size,
      connectedPlayers: [...this.players.values()].filter((player) => player.connected).length,
      ticks: this.tick,
      acceptedInputs: this.acceptedInputs,
      inputRejections: Object.freeze({ ...this.inputRejections }),
      maximumObservedQueueDepth: this.maximumObservedQueueDepth,
      missedSchedulerTicks: this.missedSchedulerTicks,
      queryMetrics: Object.freeze({ ...this.cumulativeQueryMetrics }),
    });
  }

  expire(): boolean {
    if (this.phase !== 'idle' || this.tdmMatchRequiresRunningRoomLifecycle()) return false;
    this.transitionTo('expired');
    return true;
  }

  private tdmMatchRequiresRunningRoomLifecycle(): boolean {
    const matchPhase = this.tdmMatchState?.phase;
    return matchPhase === 'warmup' || matchPhase === 'active' || matchPhase === 'postmatch';
  }

  private synchronizeTdmLifecycle(): RoomLifecycle | null {
    const match = this.tdmMatchState;
    if (match === null) return null;
    const desired: RoomLifecycle | null = match.phase === 'warmup'
      ? 'warmup'
      : match.phase === 'active'
        ? 'active'
        : match.phase === 'postmatch'
          ? 'postmatch'
          : match.phase === 'completed'
            ? 'idle'
            : null;
    if (desired === null || desired === this.phase) return null;
    this.transitionTo(desired);
    if (desired === 'postmatch') this.impulseGrenadeProjectiles.clear();
    return desired;
  }

  private transitionTo(next: RoomLifecycle): void {
    if (
      (next === 'idle' || next === 'expired')
      && this.tdmMatchRequiresRunningRoomLifecycle()
    ) {
      throw new Error('AUTHORITY_TDM_LIFECYCLE_DIVERGED');
    }
    this.phase = next;
    this.phaseStartedAtTick = this.tick;
  }

  private phaseEndsAtTick(): number | null {
    const duration = this.phase === 'warmup'
      ? this.warmupTicks
      : this.phase === 'active'
        ? this.activeTicks
        : this.phase === 'postmatch'
          ? this.postmatchTicks
          : null;
    return duration === null ? null : this.phaseStartedAtTick + duration;
  }
}
