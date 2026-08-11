import { DurableObject } from 'cloudflare:workers';

import {
  AuthoritativeRoom,
  FixedTickScheduler,
  G4_COMBAT_RULESET_HASH,
  G4_COMBAT_RULESET_ID,
  G4_COMBAT_RULESET_REVISION,
  INKFALL_AUTHORITY_MAP_IDENTITY_V3,
  INKFALL_AUTHORITY_MAP_IDENTITY_V4,
  assertAuthorityLoadoutSelection,
  authorityLoadoutFromRuleset,
  authorityLoadoutRequestFingerprint,
  createInkfallRev5PortalAuthorityPort,
  createRelayPortalAuthorityPort,
  evaluateAuthorityLoadoutRequest,
  type AuthorityActiveMatchCheckpointV1,
  type AuthorityLoadoutSelectionV1,
  type AuthorityFullSnapshot,
  type AuthoritySpawn,
  type AuthoritySpawnResolutionContext,
  type AuthoritySpawnSelectionResultV1,
} from '../src/authority';
import { hashRulesetContent, requireRuleset } from '../src/content';
import {
  COMBAT_PLAYER_SCORES_CAPABILITY,
  PROTOCOL_LIMITS,
  PROTOCOL_VERSION,
  RELIABLE_EVENT_STREAM_VERSION,
  SNAPSHOT_BASELINE_VERSION,
  decodeClientMessage,
  encodeServerMessage,
  type ErrorMessage,
  type InputBatchMessage,
  type LoadoutRequestMessage,
  type LocalReconciliationStateV1,
  type MatchPhase,
  type ServerMessage,
  type SimulationIdentityV1,
} from '../src/net';
import { getPhysicsFixture } from '../src/physics/fixtures/catalog';
import { RapierMovementWorld } from '../src/physics/rapier/world';
import {
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  hashMovementProfile,
  lookDirectionQ15,
} from '../src/sim';
import type { KyxAuthorityEnv } from './env';
import {
  ALLOCATION_GUARD_NAME,
  INTERNAL_SOCKET_ALLOCATION_LEASE_HEADER,
} from './allocationGuard';
import {
  INTERNAL_ROOM_PROFILE_HEADER,
  G5_INKFALL_REV4_COMBAT_PROFILE,
  G5_INKFALL_REV5_COMBAT_PROFILE,
  createInkfallWorkerCombatOptions,
  createRelayWorkerCombatOptions,
  combatSnapshotFromAuthority,
  createWorkerCombatOptions,
  inferWorkerRoomProfileFromIdentity,
  inkfallRevision3WorkerSpawnAuthority,
  inkfallRevision4WorkerSpawnAuthority,
  inkfallWorkerCombatSpawn,
  inkfallWorkerFixture,
  inkfallWorkerMapBinding,
  isInkfallWorkerRoomProfile,
  isPersistentMapWorkerRoomProfile,
  isRelayWorkerRoomProfile,
  isOptInWorkerRoomProfile,
  reliableCombatEvents,
  relayWorkerCombatSpawn,
  relayWorkerFixture,
  workerMapBinding,
  workerRoomProfileFromStorageId,
  workerRoomProfileStorageId,
  workerCombatSpawn,
  type InkfallWorkerRoomProfile,
  type WorkerRoomProfile,
} from './combatRuntime';
import { initializeWorkerRapierRuntime } from './rapierRuntime';
import {
  METRICS_ACCESS_CREDENTIAL_HEADER,
  digestMetricsAccessCredential,
  equalMetricsAccessDigests,
  isMetricsAccessCredential,
  readMetricsAccessProvisioning,
} from './metricsAccess';
import { parseRoomRoute } from './routes';
import { ResumeSessionRegistry } from './resumeSessions';
import {
  FULL_SNAPSHOT_REQUEST_COOLDOWN_MILLISECONDS,
  MAX_SOCKET_BUFFERED_BYTES,
  PRE_JOIN_TIMEOUT_MILLISECONDS,
  SOCKET_STALE_MILLISECONDS,
  applyAcceptedSnapshotAcknowledgement,
  consumeSocketRate,
  evaluateSnapshotAckDebt,
  evaluateSocketBackpressure,
  isSocketStale,
  normalizeSocketAttachment,
  rememberSentSnapshot,
  type SocketAttachment,
} from './security';
import {
  ReliableEventStore,
  type ReliableEventCheckpointV1,
} from './reliableEvents';
import { SnapshotBaselineStore } from './snapshotBaselines';

const SNAPSHOT_INTERVAL_TICKS = 2;
const ROOM_TIMER_MAXIMUM_CATCH_UP_TICKS = 1;
const ROOM_TIMER_EVENT_YIELD_MILLISECONDS = 4;
const ROOM_TICK_EXECUTION_SAMPLE_CAPACITY = 4_096;
const LOCAL_MAP_ID = 'phase4_flat_run';
const ROOM_RUNTIME_SCHEMA_VERSION = 2;
const ROOM_PROFILE_SCHEMA_VERSION = 1;
const LOBBY_CHECKPOINT_SCHEMA_VERSION = 1;
const LOBBY_RELIABILITY_CHECKPOINT_SCHEMA_VERSION = 1;
const LOBBY_RELIABILITY_CHECKPOINT_HASH_ALGORITHM = 'fnv1a64-json-v1';
const LOADOUT_REQUEST_LEDGER_SCHEMA_VERSION = 1;
const ACTIVE_MATCH_CHECKPOINT_SCHEMA_VERSION = 1;
const ACTIVE_MATCH_CHECKPOINT_HASH_ALGORITHM = 'fnv1a64-json-v1';
const ACTIVE_MATCH_CHECKPOINT_INTERVAL_TICKS = 10;
const MAXIMUM_LOBBY_RELIABILITY_CHECKPOINT_BYTES = 1_000_000;
const MAXIMUM_ACTIVE_MATCH_CHECKPOINT_BYTES = 4_000_000;
const MAXIMUM_RETAINED_LOADOUT_REQUESTS = 512;
const LOADOUT_ACCEPTED_OUTCOME = 'accepted';
const INKFALL_SPAWN_SELECTION_SCHEMA_VERSION = 1 as const;
const INKFALL_SPAWN_SELECTION_STRATEGY =
  'rev3_authority_enemy_distance_fixture_occluded_los_v1' as const;
const MAXIMUM_RETAINED_INKFALL_SPAWN_DECISIONS = 64;
const INKFALL_RECENT_SPAWN_USE_WINDOW_TICKS = 160;

type InkfallSpawnFallbackMode =
  | 'none'
  | 'scored_locked_candidate'
  | 'locked_ordinal';

interface InkfallSpawnDecisionDiagnostic {
  readonly tick: number;
  readonly requesterOrdinal: number;
  readonly populationBeforeSpawn: number;
  readonly status: AuthoritySpawnSelectionResultV1['status'];
  readonly decisionHash: string;
  readonly selectedSpawnId: string;
  readonly selectedScore: number | null;
  readonly fallbackMode: InkfallSpawnFallbackMode;
  readonly eligibleCandidateCount: number;
  readonly directLosRejectedCandidateCount: number;
  readonly minimumEnemyDistanceMm: number | null;
  readonly selectedStandingOccluded: boolean;
  readonly selectedCrouchedOccluded: boolean;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function inkfallLivePlayerSemanticId(playerId: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(playerId)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return `live_${hash.toString(16).padStart(16, '0')}`;
}

interface RoomRuntimeRow {
  readonly [column: string]: string | number | ArrayBuffer | null;
  readonly room_code: string;
  readonly schema_version: number;
  readonly room_id: string;
  readonly match_id: string;
  readonly protocol_version: number;
  readonly simulation_identity_json: string;
  readonly recovery_state: string;
}

interface RoomProfileRow {
  readonly [column: string]: string | number | ArrayBuffer | null;
  readonly schema_version: number;
  readonly profile_id: string;
}

interface MetricsAccessRow {
  readonly [column: string]: string | number | ArrayBuffer | null;
  readonly credential_digest: string;
  readonly expires_at: number;
}

interface LobbyCheckpointPlayerRow {
  readonly [column: string]: string | number | ArrayBuffer | null;
  readonly player_id: string;
  readonly join_ordinal: number;
}

interface LobbyResumeSessionRow {
  readonly [column: string]: string | number | ArrayBuffer | null;
  readonly player_id: string;
  readonly generation: number;
  readonly expires_at: number;
}

interface LobbyReliabilityCheckpointRow {
  readonly [column: string]: string | number | ArrayBuffer | null;
  readonly schema_version: number;
  readonly room_code: string;
  readonly room_id: string;
  readonly match_id: string;
  readonly protocol_version: number;
  readonly checkpoint_json: string;
  readonly checkpoint_hash_algorithm: string;
  readonly checkpoint_hash: string;
}

interface LoadoutRequestLedgerRow {
  readonly [column: string]: string | number | ArrayBuffer | null;
  readonly request_fingerprint: string;
  readonly outcome_code: string;
}

interface PlayerLoadoutRow {
  readonly [column: string]: string | number | ArrayBuffer | null;
  readonly selection_json: string;
}

interface ActiveMatchCheckpointRow {
  readonly [column: string]: string | number | ArrayBuffer | null;
  readonly schema_version: number;
  readonly room_code: string;
  readonly room_id: string;
  readonly match_id: string;
  readonly profile_id: string;
  readonly protocol_version: number;
  readonly simulation_identity_json: string;
  readonly map_binding_json: string;
  readonly checkpoint_json: string;
  readonly checkpoint_hash_algorithm: string;
  readonly checkpoint_hash: string;
  readonly authority_tick: number;
}

interface ActiveMatchCheckpointEnvelopeV1 {
  readonly schemaVersion: typeof ACTIVE_MATCH_CHECKPOINT_SCHEMA_VERSION;
  readonly roomCode: string;
  readonly roomProfile: Parameters<typeof workerMapBinding>[0];
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly simulationIdentity: SimulationIdentityV1;
  readonly mapBinding: ReturnType<typeof workerMapBinding>;
  readonly authority: AuthorityActiveMatchCheckpointV1;
  readonly reliableEvents: ReliableEventCheckpointV1;
  readonly playerEventAcknowledgements: readonly {
    readonly playerId: string;
    readonly lastAcknowledgedEventId: string | null;
  }[];
  readonly sessionGenerations: readonly {
    readonly playerId: string;
    readonly generation: number;
  }[];
}

interface LobbyReliabilityCheckpointEnvelopeV1 {
  readonly schemaVersion: typeof LOBBY_RELIABILITY_CHECKPOINT_SCHEMA_VERSION;
  readonly roomCode: string;
  readonly roomId: string;
  readonly matchId: string;
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly reliableEvents: ReliableEventCheckpointV1;
  readonly playerEventAcknowledgements: readonly {
    readonly playerId: string;
    readonly lastAcknowledgedEventId: string | null;
  }[];
}

interface TransportMetrics {
  inboundMessagesReceived: number;
  inboundMessagesRateAccepted: number;
  inboundMessagesRateRejected: number;
  fullSnapshotsSent: number;
  deltaSnapshotsSent: number;
  snapshotAcksAccepted: number;
  snapshotAcksRejected: number;
  snapshotAckTimeoutFallbacks: number;
  snapshotAckDebtEpisodes: number;
  snapshotAckDebtSnapshotsCoalesced: number;
  snapshotAckDebtReliableBatchesCoalesced: number;
  snapshotAckDebtRecoveries: number;
  snapshotAckDebtEvictions: number;
  maximumSnapshotAckDebtMilliseconds: number;
  snapshotHistoryFallbacks: number;
  reliableEventsRecorded: number;
  reliableEventBatchesSent: number;
  reliableEventResendBatches: number;
  reliableEventAcksAccepted: number;
  reliableEventAcksRejected: number;
  reliableEventHistoryFallbacks: number;
  backpressureEpisodes: number;
  backpressureMessagesCoalesced: number;
  slowConsumerRecoveries: number;
  slowConsumerEvictions: number;
  maximumObservedSocketBufferedBytes: number;
  lobbyCheckpointRehydrates: number;
  lobbyCheckpointPlayersRestored: number;
  durableAlarmRuns: number;
  expiredResumeSessionsPruned: number;
  loadoutRequestsAccepted: number;
  loadoutRequestsRejected: number;
  loadoutRequestsReplayed: number;
  loadoutRequestIdConflicts: number;
  activeMatchCheckpointDirtyMarks: number;
  activeMatchCheckpointCoalescedMarks: number;
  activeMatchCheckpointWrites: number;
}

interface AuthorityTickExecutionMetrics {
  readonly sampleCapacity: number;
  readonly samples: number;
  readonly p50Milliseconds: number | null;
  readonly p95Milliseconds: number | null;
  readonly p99Milliseconds: number | null;
  readonly maximumMilliseconds: number | null;
}

interface GameplaySendPermit {
  readonly kind: 'send' | 'coalesce' | 'evict' | 'closed';
  readonly attachment: SocketAttachment;
}

function errorMessage(
  code: string,
  detail: string | null = null,
  requestId: string | null = null,
): ErrorMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'error',
    code,
    detail,
    requestId,
  };
}

function lifecyclePhase(lifecycle: AuthorityFullSnapshot['lifecycle']): MatchPhase {
  if (lifecycle === 'warmup' || lifecycle === 'active' || lifecycle === 'postmatch') return lifecycle;
  return 'lobby';
}

function socketBufferedAmount(webSocket: WebSocket): number {
  const value = (webSocket as WebSocket & { readonly bufferedAmount?: number }).bufferedAmount ?? 0;
  return Number.isSafeInteger(value) && value >= 0 ? value : MAX_SOCKET_BUFFERED_BYTES + 1;
}

function roundedMilliseconds(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function percentileMilliseconds(
  sortedSamples: readonly number[],
  percentile: number,
): number | null {
  if (sortedSamples.length === 0) return null;
  const index = Math.min(
    sortedSamples.length - 1,
    Math.max(0, Math.ceil(sortedSamples.length * percentile) - 1),
  );
  const sample = sortedSamples[index];
  return sample === undefined ? null : roundedMilliseconds(sample);
}

function safeSocketSend(webSocket: WebSocket, message: ServerMessage): boolean {
  const bufferedAmount = socketBufferedAmount(webSocket);
  if (webSocket.readyState !== WebSocket.OPEN || bufferedAmount > MAX_SOCKET_BUFFERED_BYTES) {
    return false;
  }
  const encoded = encodeServerMessage(message);
  if (!encoded.ok) return false;
  webSocket.send(encoded.json);
  return true;
}

function payloadBytes(message: string | ArrayBuffer): string | Uint8Array {
  return typeof message === 'string' ? message : new Uint8Array(message);
}

function fnv1a64Json(source: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

function exactCheckpointRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} contains unsupported or missing fields`);
  }
  return value as Record<string, unknown>;
}

function exactCheckpointArray(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw new RangeError(`${label} must contain ${minimum} through ${maximum} entries`);
  }
  return value;
}

function exactCheckpointInteger(
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

function exactCheckpointStableId(value: unknown, label: string): string {
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

function exactCheckpointEventId(value: unknown, label: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^event\.(?:[1-9][0-9]*)$/u.test(value)) {
    throw new RangeError(`${label} must be a reliable event id or null`);
  }
  return value;
}

export class KyxRoom extends DurableObject<KyxAuthorityEnv> {
  private readonly authorityEnv: KyxAuthorityEnv;
  private authority: AuthoritativeRoom | null = null;
  private authoritativeLoadout: AuthorityLoadoutSelectionV1 | null = null;
  private world: RapierMovementWorld | null = null;
  private roomCode: string | null = null;
  private initialization: Promise<void> | null = null;
  private initializationFailure: string | null = null;
  private revision3CombatEnabled = false;
  private roomProfile: WorkerRoomProfile = null;
  private lastTickFailure: string | null = null;
  private readonly scheduler = new FixedTickScheduler({
    maximumCatchUpTicks: ROOM_TIMER_MAXIMUM_CATCH_UP_TICKS,
  });
  private readonly resumeSessions: ResumeSessionRegistry;
  private readonly sessionGenerations = new Map<string, number>();
  private readonly playerEventAcknowledgements = new Map<string, string | null>();
  private readonly snapshotBaselines = new SnapshotBaselineStore();
  private readonly reliableEvents = new ReliableEventStore();
  private readonly socketAttachments = new Map<string, SocketAttachment>();
  private readonly transportMetrics: TransportMetrics = {
    inboundMessagesReceived: 0,
    inboundMessagesRateAccepted: 0,
    inboundMessagesRateRejected: 0,
    fullSnapshotsSent: 0,
    deltaSnapshotsSent: 0,
    snapshotAcksAccepted: 0,
    snapshotAcksRejected: 0,
    snapshotAckTimeoutFallbacks: 0,
    snapshotAckDebtEpisodes: 0,
    snapshotAckDebtSnapshotsCoalesced: 0,
    snapshotAckDebtReliableBatchesCoalesced: 0,
    snapshotAckDebtRecoveries: 0,
    snapshotAckDebtEvictions: 0,
    maximumSnapshotAckDebtMilliseconds: 0,
    snapshotHistoryFallbacks: 0,
    reliableEventsRecorded: 0,
    reliableEventBatchesSent: 0,
    reliableEventResendBatches: 0,
    reliableEventAcksAccepted: 0,
    reliableEventAcksRejected: 0,
    reliableEventHistoryFallbacks: 0,
    backpressureEpisodes: 0,
    backpressureMessagesCoalesced: 0,
    slowConsumerRecoveries: 0,
    slowConsumerEvictions: 0,
    maximumObservedSocketBufferedBytes: 0,
    lobbyCheckpointRehydrates: 0,
    lobbyCheckpointPlayersRestored: 0,
    durableAlarmRuns: 0,
    expiredResumeSessionsPruned: 0,
    loadoutRequestsAccepted: 0,
    loadoutRequestsRejected: 0,
    loadoutRequestsReplayed: 0,
    loadoutRequestIdConflicts: 0,
    activeMatchCheckpointDirtyMarks: 0,
    activeMatchCheckpointCoalescedMarks: 0,
    activeMatchCheckpointWrites: 0,
  };
  private readonly authorityTickExecutionSamples: number[] = [];
  private authorityTickExecutionSampleCursor = 0;
  private compatibilityIdentity: SimulationIdentityV1 | null = null;
  private timerActive = false;
  private expiredMaintenanceTimerActive = false;
  private readonly restoredSpawnOrdinals = new Map<string, number>();
  private readonly recentInkfallSpawnUses: { readonly spawnId: string; readonly tick: number }[] = [];
  private readonly inkfallSpawnDecisions: InkfallSpawnDecisionDiagnostic[] = [];
  private inkfallSpawnFallbacks = 0;
  private activeMatchCheckpointDirty = false;
  private lastActiveMatchCheckpointPersistedTick: number | null = null;

  constructor(ctx: DurableObjectState, env: KyxAuthorityEnv) {
    super(ctx, env);
    this.authorityEnv = env;
    this.resumeSessions = new ResumeSessionRegistry(ctx.storage);
  }

  override async fetch(request: Request): Promise<Response> {
    const route = parseRoomRoute(new URL(request.url).pathname);
    if (route === null) return Response.json({ ok: false, code: 'ROOM_ROUTE_INVALID' }, { status: 404 });
    let allocationLeaseId: string | null = null;
    if (route.resource === 'socket') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
        return Response.json(
          { ok: false, code: 'WEBSOCKET_UPGRADE_REQUIRED' },
          { status: 426 },
        );
      }
      const candidate = request.headers.get(INTERNAL_SOCKET_ALLOCATION_LEASE_HEADER);
      if (candidate === null || !/^socket\.[a-f0-9]{32}$/u.test(candidate)) {
        return Response.json(
          { ok: false, code: 'SOCKET_ALLOCATION_LEASE_REQUIRED' },
          { status: 403 },
        );
      }
      allocationLeaseId = candidate;
    }
    if (route.resource === 'metrics' && request.method === 'GET') {
      const authorized = await this.authorizeMetricsRequest(request, route.roomCode);
      if (!authorized) {
        return Response.json({ ok: false, code: 'METRICS_ACCESS_DENIED' }, {
          status: 403,
          headers: { 'cache-control': 'no-store' },
        });
      }
    }
    const rawProfile = route.resource === 'room' && request.method === 'POST'
      ? request.headers.get(INTERNAL_ROOM_PROFILE_HEADER)
      : undefined;
    if (rawProfile !== undefined && rawProfile !== null && !isOptInWorkerRoomProfile(rawProfile)) {
      return Response.json({ ok: false, code: 'ROOM_PROFILE_UNSUPPORTED' }, { status: 400 });
    }
    const requestedProfile: WorkerRoomProfile | undefined = rawProfile === undefined
      ? undefined
      : rawProfile;
    try {
      if (route.resource === 'room' && request.method === 'POST') {
        this.provisionMetricsAccess(request, route.roomCode);
      }
      await this.ensureInitialized(route.roomCode, requestedProfile);
    } catch (error) {
      const profileMismatch = error instanceof Error
        && error.message === 'AUTHORITY_ROOM_PROFILE_MISMATCH';
      return Response.json({
        ok: false,
        code: profileMismatch ? 'ROOM_PROFILE_MISMATCH' : 'ROOM_UNAVAILABLE',
      }, {
        status: profileMismatch ? 409 : 503,
        headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
      });
    }

    if (route.resource === 'metrics' && request.method === 'GET') {
      return Response.json({
        ok: true,
        metrics: {
          ...this.requireAuthority().metricsSnapshot(),
          ...(this.roomProfile !== null
            ? {
                roomProfile: this.roomProfile,
                lastTickFailure: this.lastTickFailure,
              }
            : {}),
          ...(isPersistentMapWorkerRoomProfile(this.roomProfile)
            ? { mapBinding: workerMapBinding(this.roomProfile) }
            : {}),
          ...((
            this.roomProfile === G5_INKFALL_REV4_COMBAT_PROFILE
            || this.roomProfile === G5_INKFALL_REV5_COMBAT_PROFILE
          )
            ? {
                spawnSelection: Object.freeze({
                  schemaVersion: INKFALL_SPAWN_SELECTION_SCHEMA_VERSION,
                  strategy: INKFALL_SPAWN_SELECTION_STRATEGY,
                  authorityBoundary: 'server_state_and_authority_collision_only',
                  clientPositionOrScoreAccepted: false,
                  lockedSpawnIdentityCount: 12,
                  decisionCount: this.inkfallSpawnDecisions.length,
                  fallbackCount: this.inkfallSpawnFallbacks,
                  decisions: Object.freeze([...this.inkfallSpawnDecisions]),
                }),
              }
            : {}),
          authorityTickExecution: this.authorityTickExecutionMetrics(),
          transport: Object.freeze({ ...this.transportMetrics }),
        },
      }, {
        headers: { 'cache-control': 'no-store' },
      });
    }
    if (route.resource === 'room' && request.method === 'POST') {
      return Response.json({
        ok: true,
        roomCode: route.roomCode,
        lifecycle: this.requireAuthority().lifecycle,
        ...(this.roomProfile !== null
          ? { roomProfile: this.roomProfile }
          : {}),
        ...(isPersistentMapWorkerRoomProfile(this.roomProfile)
          ? { mapBinding: workerMapBinding(this.roomProfile) }
          : {}),
      }, { status: 201, headers: { 'cache-control': 'no-store' } });
    }
    if (route.resource !== 'socket') {
      return Response.json({ ok: false, code: 'WEBSOCKET_UPGRADE_REQUIRED' }, { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const now = Date.now();
    const attachment: SocketAttachment = Object.freeze({
      schemaVersion: 8,
      roomCode: route.roomCode,
      connectionId: `connection.${crypto.randomUUID()}`,
      allocationLeaseId,
      preJoinExpiresAt: now + PRE_JOIN_TIMEOUT_MILLISECONDS,
      playerId: null,
      sessionGeneration: 0,
      rateWindowStartedAt: now,
      messagesInRateWindow: 0,
      bytesInRateWindow: 0,
      lastSeenAt: now,
      lastFullSnapshotRequestAt: null,
      lastAcknowledgedSnapshotTick: null,
      lastAcknowledgedSnapshotBaselineId: null,
      lastSentSnapshotTick: null,
      lastSentSnapshotBaselineId: null,
      sentSnapshotHistory: Object.freeze([]),
      lastSnapshotSentAt: null,
      snapshotAckDebtStartedAt: null,
      lastAcknowledgedEventId: null,
      lastSentReliableEventId: null,
      backpressureStartedAt: null,
      combatPlayerScoresV1: false,
    });
    this.writeSocketAttachment(server, attachment);
    this.ctx.acceptWebSocket(server);
    safeSocketSend(server, this.welcome(attachment.connectionId));
    await this.scheduleMaintenanceAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  private async releaseAllocationLease(leaseId: string | null): Promise<void> {
    if (leaseId === null) return;
    try {
      await this.authorityEnv.KYX_ALLOCATION_GUARD
        .getByName(ALLOCATION_GUARD_NAME)
        .fetch(new Request('https://kyx-allocation.internal/v1/sockets/release', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ leaseId }),
        }));
    } catch {
      // The guard lease expires after twenty seconds. A transient release
      // failure remains fail-closed by consuming capacity until that expiry.
    }
  }

  private ensureMetricsAccessSchema(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS room_metrics_access_v1 (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        schema_version INTEGER NOT NULL CHECK (schema_version = 1),
        room_code TEXT NOT NULL,
        credential_digest TEXT NOT NULL CHECK (length(credential_digest) = 64),
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);
  }

  private provisionMetricsAccess(request: Request, roomCode: string): void {
    this.ensureMetricsAccessSchema();
    const provisioning = readMetricsAccessProvisioning(request.headers);
    if (provisioning === null) return;
    const current = [...this.ctx.storage.sql.exec<MetricsAccessRow>(
      `SELECT credential_digest, expires_at
       FROM room_metrics_access_v1
       WHERE singleton = 1
       LIMIT 1`,
    )][0];
    if (current !== undefined) {
      if (
        !equalMetricsAccessDigests(current.credential_digest, provisioning.credentialDigest)
        || current.expires_at !== provisioning.expiresAt
      ) {
        throw new Error('METRICS_ACCESS_ALREADY_PROVISIONED');
      }
      return;
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO room_metrics_access_v1
        (singleton, schema_version, room_code, credential_digest, expires_at, created_at)
       VALUES (1, 1, ?, ?, ?, ?)`,
      roomCode,
      provisioning.credentialDigest,
      provisioning.expiresAt,
      Date.now(),
    );
  }

  private async authorizeMetricsRequest(request: Request, roomCode: string): Promise<boolean> {
    this.ensureMetricsAccessSchema();
    const credential = request.headers.get(METRICS_ACCESS_CREDENTIAL_HEADER);
    if (!isMetricsAccessCredential(credential)) return false;
    const row = [...this.ctx.storage.sql.exec<MetricsAccessRow>(
      `SELECT credential_digest, expires_at
       FROM room_metrics_access_v1
       WHERE singleton = 1 AND room_code = ?
       LIMIT 1`,
      roomCode,
    )][0];
    if (row === undefined || row.expires_at <= Date.now()) return false;
    const candidateDigest = await digestMetricsAccessCredential(roomCode, credential);
    return equalMetricsAccessDigests(candidateDigest, row.credential_digest);
  }

  override async webSocketMessage(webSocket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.transportMetrics.inboundMessagesReceived += 1;
    const serializedAttachment = this.readSocketAttachment(webSocket);
    if (serializedAttachment === null) {
      safeSocketSend(webSocket, errorMessage('SOCKET_ATTACHMENT_INVALID'));
      webSocket.close(1008, 'Invalid socket state');
      return;
    }
    await this.ensureInitialized(serializedAttachment.roomCode);
    const rawAttachment = this.readSocketAttachment(webSocket);
    if (rawAttachment === null) {
      safeSocketSend(webSocket, errorMessage('SOCKET_ATTACHMENT_INVALID'));
      webSocket.close(1008, 'Invalid socket state');
      return;
    }
    const now = Date.now();
    const rawBytes = payloadBytes(message);
    const messageBytes = typeof rawBytes === 'string'
      ? new TextEncoder().encode(rawBytes).byteLength
      : rawBytes.byteLength;
    const rate = consumeSocketRate(rawAttachment, now, messageBytes);
    this.writeSocketAttachment(webSocket, rate.attachment);
    await this.scheduleMaintenanceAlarm();
    if (!rate.ok) {
      this.transportMetrics.inboundMessagesRateRejected += 1;
      safeSocketSend(webSocket, errorMessage('RATE_LIMITED'));
      webSocket.close(1008, 'Rate limit exceeded');
      return;
    }
    this.transportMetrics.inboundMessagesRateAccepted += 1;

    const decoded = decodeClientMessage(rawBytes);
    if (!decoded.ok) {
      safeSocketSend(webSocket, errorMessage(decoded.error.code, decoded.error.path));
      return;
    }
    const authority = this.requireAuthority();
    const clientMessage = decoded.value;
    switch (clientMessage.type) {
      case 'hello': {
        const nextAttachment: SocketAttachment = Object.freeze({
          ...rate.attachment,
          combatPlayerScoresV1: clientMessage.capabilities.includes(
            COMBAT_PLAYER_SCORES_CAPABILITY,
          ),
        });
        this.writeSocketAttachment(webSocket, nextAttachment);
        safeSocketSend(webSocket, this.welcome(nextAttachment.connectionId));
        return;
      }
      case 'joinRoom': {
        if (clientMessage.roomCode.toUpperCase() !== rawAttachment.roomCode) {
          safeSocketSend(webSocket, {
            protocolVersion: PROTOCOL_VERSION,
            type: 'joinRejected',
            requestId: clientMessage.requestId,
            code: 'ROOM_NOT_FOUND',
          });
          return;
        }
        if (rate.attachment.playerId !== null) {
          this.sendJoinRejection(webSocket, clientMessage.requestId, 'DUPLICATE_SESSION');
          return;
        }
        const playerId = `player.${crypto.randomUUID()}`;
        let issued;
        try {
          issued = await this.resumeSessions.issue(
            playerId,
            authority.identity.roomId,
            authority.identity.matchId,
          );
        } catch {
          this.sendJoinRejection(webSocket, clientMessage.requestId, 'MATCH_INCOMPATIBLE');
          return;
        }
        if (webSocket.readyState !== WebSocket.OPEN) {
          this.resumeSessions.revokePlayer(
            playerId,
            authority.identity.roomId,
            authority.identity.matchId,
          );
          return;
        }
        const joined = authority.joinNewPlayer({
          playerId,
          connectionId: rawAttachment.connectionId,
        });
        if (!joined.ok) {
          this.resumeSessions.revokePlayer(
            playerId,
            authority.identity.roomId,
            authority.identity.matchId,
          );
          this.sendJoinRejection(
            webSocket,
            clientMessage.requestId,
            joined.reason === 'room_full' ? 'ROOM_FULL' : 'MATCH_INCOMPATIBLE',
          );
          return;
        }
        const eventBaselineId = this.reliableEvents.latestId;
        await this.releaseAllocationLease(rate.attachment.allocationLeaseId);
        const nextAttachment: SocketAttachment = Object.freeze({
          ...rate.attachment,
          allocationLeaseId: null,
          preJoinExpiresAt: null,
          playerId,
          sessionGeneration: issued.session.generation,
          lastAcknowledgedSnapshotTick: null,
          lastAcknowledgedSnapshotBaselineId: null,
          lastSentSnapshotTick: null,
          lastSentSnapshotBaselineId: null,
          sentSnapshotHistory: Object.freeze([]),
          lastSnapshotSentAt: null,
          snapshotAckDebtStartedAt: null,
          lastAcknowledgedEventId: eventBaselineId,
          lastSentReliableEventId: eventBaselineId,
        });
        this.writeSocketAttachment(webSocket, nextAttachment);
        this.sessionGenerations.set(playerId, issued.session.generation);
        this.playerEventAcknowledgements.set(playerId, eventBaselineId);
        if (authority.lifecycle === 'lobby') {
          this.persistLobbyCheckpointPlayer(playerId);
        } else if (!isPersistentMapWorkerRoomProfile(this.roomProfile)) {
          this.markRecoveryState('active_uncheckpointed');
        }
        const accepted = safeSocketSend(webSocket, {
          protocolVersion: PROTOCOL_VERSION,
          type: 'joinAccepted',
          requestId: clientMessage.requestId,
          playerId,
          roomId: authority.identity.roomId,
          matchId: authority.identity.matchId,
          serverTick: authority.serverTick,
          connectionMode: 'joined',
          resumeToken: issued.resumeToken,
          simulationIdentity: this.simulationIdentity(joined.snapshot),
        });
        const fullAttachment = accepted
          ? this.sendFullSnapshot(webSocket, nextAttachment)
          : null;
        if (!accepted || fullAttachment === null) {
          this.disconnectSocket(webSocket, nextAttachment, 1013, 'Backpressure');
          return;
        }
        this.recordLifecycleEvent('playerJoined', playerId);
        this.broadcastReliableEvents(new Map([[fullAttachment.connectionId, fullAttachment]]));
        if (
          authority.lifecycle === 'lobby'
          && authority.metricsSnapshot().connectedPlayers >= 2
          && authority.startMatch()
        ) {
          this.activateFromLobbyCheckpoint();
          await this.ctx.storage.deleteAlarm();
        } else {
          if (isPersistentMapWorkerRoomProfile(this.roomProfile)) {
            this.persistActiveMatchCheckpoint();
          }
          await this.scheduleMaintenanceAlarm();
        }
        this.ensureTimer();
        return;
      }
      case 'resumeRoom': {
        if (
          rate.attachment.playerId !== null
          || clientMessage.roomCode.toUpperCase() !== rawAttachment.roomCode
        ) {
          this.sendJoinRejection(webSocket, clientMessage.requestId, 'RESUME_REJECTED');
          return;
        }
        const prepared = await this.resumeSessions.prepareRotation(clientMessage.resumeToken);
        if (prepared === null || webSocket.readyState !== WebSocket.OPEN) {
          this.sendJoinRejection(webSocket, clientMessage.requestId, 'RESUME_REJECTED');
          return;
        }
        const current = this.resumeSessions.lookup(
          prepared,
          authority.identity.roomId,
          authority.identity.matchId,
          now,
        );
        if (current === null) {
          this.sendJoinRejection(webSocket, clientMessage.requestId, 'RESUME_REJECTED');
          return;
        }
        const resumed = authority.resumePlayer({
          playerId: current.playerId,
          connectionId: rate.attachment.connectionId,
        });
        if (!resumed.ok) {
          this.sendJoinRejection(
            webSocket,
            clientMessage.requestId,
            resumed.reason === 'duplicate_player' ? 'DUPLICATE_SESSION' : 'RESUME_REJECTED',
          );
          return;
        }
        const rotated = this.resumeSessions.commitRotation(current, prepared, now);
        if (rotated === null) {
          authority.disconnectConnection(rate.attachment.connectionId);
          this.sendJoinRejection(webSocket, clientMessage.requestId, 'RESUME_REJECTED');
          return;
        }
        const restoredEventAcknowledgement = this.retainedEventBaseline(
          this.playerEventAcknowledgements.get(current.playerId) ?? null,
        );
        await this.releaseAllocationLease(rate.attachment.allocationLeaseId);
        const nextAttachment: SocketAttachment = Object.freeze({
          ...rate.attachment,
          allocationLeaseId: null,
          preJoinExpiresAt: null,
          playerId: current.playerId,
          sessionGeneration: rotated.generation,
          lastAcknowledgedSnapshotTick: null,
          lastAcknowledgedSnapshotBaselineId: null,
          lastSentSnapshotTick: null,
          lastSentSnapshotBaselineId: null,
          sentSnapshotHistory: Object.freeze([]),
          lastSnapshotSentAt: null,
          snapshotAckDebtStartedAt: null,
          lastAcknowledgedEventId: restoredEventAcknowledgement,
          lastSentReliableEventId: restoredEventAcknowledgement,
        });
        this.writeSocketAttachment(webSocket, nextAttachment);
        this.sessionGenerations.set(current.playerId, rotated.generation);
        this.playerEventAcknowledgements.set(current.playerId, restoredEventAcknowledgement);
        if (authority.lifecycle === 'lobby') {
          this.persistLobbyCheckpointPlayer(current.playerId);
        } else if (!isPersistentMapWorkerRoomProfile(this.roomProfile)) {
          this.markRecoveryState('active_uncheckpointed');
        }
        const accepted = safeSocketSend(webSocket, {
          protocolVersion: PROTOCOL_VERSION,
          type: 'joinAccepted',
          requestId: clientMessage.requestId,
          playerId: current.playerId,
          roomId: authority.identity.roomId,
          matchId: authority.identity.matchId,
          serverTick: authority.serverTick,
          connectionMode: 'resumed',
          resumeToken: prepared.rotatedResumeToken,
          simulationIdentity: this.simulationIdentity(resumed.snapshot),
        });
        const fullAttachment = accepted
          ? this.sendFullSnapshot(webSocket, nextAttachment)
          : null;
        if (!accepted || fullAttachment === null) {
          this.disconnectSocket(webSocket, nextAttachment, 1013, 'Backpressure');
          return;
        }
        this.broadcastReliableEvents(new Map([[fullAttachment.connectionId, fullAttachment]]));
        if (
          authority.lifecycle === 'lobby'
          && authority.metricsSnapshot().connectedPlayers >= 2
          && authority.startMatch()
        ) {
          this.activateFromLobbyCheckpoint();
          await this.ctx.storage.deleteAlarm();
        } else {
          if (isPersistentMapWorkerRoomProfile(this.roomProfile)) {
            this.persistActiveMatchCheckpoint();
          }
          await this.scheduleMaintenanceAlarm();
        }
        this.ensureTimer();
        return;
      }
      case 'requestFullSnapshot': {
        if (
          rate.attachment.playerId === null
          || !this.isCurrentSessionAttachment(rate.attachment, now)
        ) {
          safeSocketSend(webSocket, errorMessage(
            'JOIN_REQUIRED',
            null,
            clientMessage.requestId,
          ));
          return;
        }
        if (
          rate.attachment.lastFullSnapshotRequestAt !== null
          && now - rate.attachment.lastFullSnapshotRequestAt
            < FULL_SNAPSHOT_REQUEST_COOLDOWN_MILLISECONDS
        ) {
          safeSocketSend(webSocket, errorMessage(
            'FULL_SNAPSHOT_RATE_LIMITED',
            null,
            clientMessage.requestId,
          ));
          return;
        }
        const nextAttachment = Object.freeze({
          ...rate.attachment,
          lastFullSnapshotRequestAt: now,
        });
        this.writeSocketAttachment(webSocket, nextAttachment);
        const debt = this.evaluateSnapshotDebt(webSocket, nextAttachment, now);
        if (debt === null) return;
        if (debt.action === 'coalesce') {
          this.transportMetrics.snapshotAckDebtSnapshotsCoalesced += 1;
          return;
        }
        if (debt.action === 'evict') {
          this.evictSnapshotAckDebtor(webSocket, debt.attachment);
          return;
        }
        if (debt.action === 'fallback') {
          this.transportMetrics.snapshotAckTimeoutFallbacks += 1;
        }
        const permit = this.prepareGameplaySend(webSocket, debt.attachment, now);
        if (permit.kind === 'coalesce' || permit.kind === 'closed') return;
        if (permit.kind === 'evict') {
          this.disconnectSocket(webSocket, permit.attachment, 1013, 'Slow consumer');
          return;
        }
        if (this.sendFullSnapshot(
          webSocket,
          permit.attachment,
          authority.fullSnapshot(),
          clientMessage.requestId,
        ) === null) this.disconnectSocket(webSocket, permit.attachment, 1013, 'Backpressure');
        return;
      }
      case 'inputBatch': {
        if (
          rate.attachment.playerId === null
          || !this.isCurrentSessionAttachment(rate.attachment, now)
        ) {
          safeSocketSend(webSocket, errorMessage('JOIN_REQUIRED'));
          return;
        }
        const rejectedWeaponSlot = this.rejectedPresetWeaponSlot(
          rate.attachment.playerId,
          clientMessage,
        );
        if (rejectedWeaponSlot !== null) {
          safeSocketSend(webSocket, errorMessage(
            'INPUT_REJECTED',
            `${rejectedWeaponSlot.sequence}:weapon_slot_not_in_preset`,
          ));
          return;
        }
        try {
          const result = authority.enqueueInputBatch(rate.attachment.connectionId, clientMessage);
          this.markActiveMatchCheckpointDirty();
          if (result.rejections.length > 0) {
            safeSocketSend(webSocket, errorMessage(
              'INPUT_REJECTED',
              result.rejections.map(({ sequence, reason }) => `${sequence}:${reason}`).join(','),
            ));
          }
        } catch {
          safeSocketSend(webSocket, errorMessage('INPUT_CONNECTION_INVALID'));
        }
        return;
      }
      case 'ping': {
        safeSocketSend(webSocket, {
          protocolVersion: PROTOCOL_VERSION,
          type: 'pong',
          nonce: clientMessage.nonce,
          serverTick: authority.serverTick,
        });
        return;
      }
      case 'ack': {
        if (
          rate.attachment.playerId === null
          || !this.isCurrentSessionAttachment(rate.attachment, now)
        ) {
          safeSocketSend(webSocket, errorMessage('JOIN_REQUIRED'));
          return;
        }
        const snapshotRejection = this.snapshotAcknowledgementRejection(
          rate.attachment,
          clientMessage.serverTick,
          clientMessage.snapshotBaselineId,
          authority.serverTick,
        );
        const eventAcknowledgement = this.reliableEvents.validateAcknowledgement(
          rate.attachment.lastAcknowledgedEventId,
          clientMessage.lastEventId,
          rate.attachment.lastSentReliableEventId,
        );
        if (snapshotRejection !== null || eventAcknowledgement !== 'accepted') {
          if (snapshotRejection !== null) this.transportMetrics.snapshotAcksRejected += 1;
          if (eventAcknowledgement !== 'accepted') this.transportMetrics.reliableEventAcksRejected += 1;
          safeSocketSend(webSocket, errorMessage(
            'ACK_REJECTED',
            snapshotRejection ?? `event_${eventAcknowledgement}`,
          ));
          return;
        }
        const snapshotAcknowledgement = applyAcceptedSnapshotAcknowledgement(
          rate.attachment,
          clientMessage.serverTick,
          clientMessage.snapshotBaselineId,
        );
        const { acknowledgesLatestSent } = snapshotAcknowledgement;
        const recoveredSnapshotAckDebt = snapshotAcknowledgement.recoveredDebt;
        const nextAttachment: SocketAttachment = Object.freeze({
          ...snapshotAcknowledgement.attachment,
          lastAcknowledgedEventId: clientMessage.lastEventId,
        });
        this.writeSocketAttachment(webSocket, nextAttachment);
        if (
          acknowledgesLatestSent
          && rate.attachment.lastSnapshotSentAt !== null
          && authority.combatProfileId !== null
        ) {
          authority.recordServerObservedRtt(
            rate.attachment.playerId,
            Math.min(20_000, Math.max(0, now - rate.attachment.lastSnapshotSentAt)),
          );
        }
        this.playerEventAcknowledgements.set(
          rate.attachment.playerId,
          clientMessage.lastEventId,
        );
        if (authority.lifecycle === 'lobby') this.persistLobbyReliabilityCheckpoint();
        this.markActiveMatchCheckpointDirty();
        this.transportMetrics.snapshotAcksAccepted += 1;
        this.transportMetrics.reliableEventAcksAccepted += 1;
        if (recoveredSnapshotAckDebt) {
          this.transportMetrics.snapshotAckDebtRecoveries += 1;
          this.transportMetrics.slowConsumerRecoveries += 1;
        }
        return;
      }
      case 'authenticate':
        safeSocketSend(webSocket, errorMessage('AUTH_NOT_ENABLED', null, clientMessage.requestId));
        return;
      case 'loadoutRequest': {
        if (
          rate.attachment.playerId === null
          || !this.isCurrentSessionAttachment(rate.attachment, now)
        ) {
          safeSocketSend(webSocket, errorMessage(
            'JOIN_REQUIRED',
            null,
            clientMessage.requestId,
          ));
          return;
        }
        this.handleLoadoutRequest(webSocket, rate.attachment, clientMessage);
        return;
      }
    }
  }

  override async webSocketClose(
    webSocket: WebSocket,
    code: number,
    reason: string,
    _wasClean: boolean,
  ): Promise<void> {
    const attachment = this.readSocketAttachment(webSocket);
    if (attachment !== null) {
      try {
        await this.ensureInitialized(attachment.roomCode);
        this.disconnectAttachment(attachment, Date.now());
        await this.scheduleMaintenanceAlarm();
      } finally {
        await this.releaseAllocationLease(attachment.allocationLeaseId);
        this.forgetSocketAttachment(attachment);
      }
    }
    webSocket.close(code, reason.slice(0, 120));
  }

  override async webSocketError(webSocket: WebSocket): Promise<void> {
    const attachment = this.readSocketAttachment(webSocket);
    if (attachment !== null) {
      try {
        await this.ensureInitialized(attachment.roomCode);
        this.disconnectAttachment(attachment, Date.now());
        await this.scheduleMaintenanceAlarm();
      } finally {
        await this.releaseAllocationLease(attachment.allocationLeaseId);
        this.forgetSocketAttachment(attachment);
      }
    }
    webSocket.close(1011, 'Socket error');
  }

  override async alarm(): Promise<void> {
    const metadata = [...this.ctx.storage.sql.exec<{ room_code: string }>(
      'SELECT room_code FROM room_metadata LIMIT 1',
    )][0];
    if (metadata === undefined) return;
    try {
      await this.ensureInitialized(metadata.room_code);
    } catch {
      return;
    }
    if (this.timerActive) return;
    this.transportMetrics.durableAlarmRuns += 1;
    this.disconnectStaleSockets();
    await this.scheduleMaintenanceAlarm();
  }

  private resolveLiveInkfallSpawn(
    playerId: string,
    ordinal: number,
    context: AuthoritySpawnResolutionContext,
    profile: InkfallWorkerRoomProfile,
  ): AuthoritySpawn {
    const tick = context.authorityTick;
    const requesterTeamId = ordinal % 2 === 0 ? 'team_blue' : 'team_red';
    const requesterTerritory = ordinal % 2 === 0 ? 'west' : 'east';
    const players = context.players
      .filter((player) => (
        player.playerId !== playerId
        && player.lifePhase === 'alive'
      ))
      .map((player) => {
        return Object.freeze({
          id: inkfallLivePlayerSemanticId(player.playerId),
          teamId: player.teamId,
          feetPositionMm: player.feetPosition,
          aimDirectionQ15: lookDirectionQ15(
            player.yawMilliDegrees,
            player.pitchMilliDegrees,
          ),
          aimSampleTick: tick,
          authorityArrivalEstimates: Object.freeze([]),
        });
      });
    const recentSpawnUses = this.recentInkfallSpawnUses.filter(
      ({ tick: usedAtTick }) => tick - usedAtTick <= INKFALL_RECENT_SPAWN_USE_WINDOW_TICKS,
    );
    this.recentInkfallSpawnUses.splice(
      0,
      this.recentInkfallSpawnUses.length,
      ...recentSpawnUses,
    );
    const binding = inkfallWorkerMapBinding(profile);
    const spawnAuthority = profile === G5_INKFALL_REV5_COMBAT_PROFILE
      ? inkfallRevision4WorkerSpawnAuthority()
      : inkfallRevision3WorkerSpawnAuthority();
    const result = spawnAuthority.select({
      schemaVersion: 1,
      mapId: binding.mapId,
      mapRevision: binding.mapRevision,
      fixtureHash: binding.fixtureHash,
      mode: 'team_deathmatch',
      tick,
      requester: Object.freeze({
        id: inkfallLivePlayerSemanticId(playerId),
        teamId: requesterTeamId,
        territory: requesterTerritory,
      }),
      players: Object.freeze(players),
      recentDeaths: Object.freeze([]),
      recentSpawnUses: Object.freeze(recentSpawnUses),
      objectives: Object.freeze([]),
    });
    const directLosFallback = [...result.evaluations]
      .filter(({ rejectionReasons }) => (
        rejectionReasons.length === 1
        && rejectionReasons[0] === 'direct_enemy_line_of_sight'
      ))
      .sort((left, right) => (
        right.score - left.score || compareCodeUnits(left.spawnId, right.spawnId)
      ))[0] ?? null;
    const selectedEvaluation = result.selected === null
      ? directLosFallback
      : result.evaluations.find(({ spawnId }) => spawnId === result.selected?.spawnId) ?? null;
    let fallbackMode: InkfallSpawnFallbackMode = 'none';
    let selected: AuthoritySpawn;
    if (result.selected !== null) {
      selected = Object.freeze({
        spawnId: result.selected.spawnId,
        feetPosition: result.selected.feetPositionMm,
        yawMilliDegrees: result.selected.yawMilliDegrees,
      });
    } else if (directLosFallback !== null) {
      fallbackMode = 'scored_locked_candidate';
      selected = Object.freeze({
        spawnId: directLosFallback.spawnId,
        feetPosition: directLosFallback.feetPositionMm,
        yawMilliDegrees: directLosFallback.yawMilliDegrees,
      });
    } else {
      fallbackMode = 'locked_ordinal';
      selected = inkfallWorkerCombatSpawn(ordinal, profile);
    }
    const selectedEnemies = selectedEvaluation?.enemies ?? [];
    const enemyDistances = selectedEnemies.map(({ distanceMm }) => distanceMm);
    const diagnostic: InkfallSpawnDecisionDiagnostic = Object.freeze({
      tick,
      requesterOrdinal: ordinal,
      populationBeforeSpawn: players.length,
      status: result.status,
      decisionHash: result.decisionHash,
      selectedSpawnId: selected.spawnId ?? 'spawn_identity_missing',
      selectedScore: selectedEvaluation?.score ?? null,
      fallbackMode,
      eligibleCandidateCount: result.evaluations.filter(({ eligible }) => eligible).length,
      directLosRejectedCandidateCount: result.evaluations.filter(
        ({ rejectionReasons }) => rejectionReasons.includes('direct_enemy_line_of_sight'),
      ).length,
      minimumEnemyDistanceMm: enemyDistances.length === 0
        ? null
        : Math.min(...enemyDistances),
      selectedStandingOccluded: selectedEnemies.every(
        ({ standingLineOfSight }) => !standingLineOfSight,
      ),
      selectedCrouchedOccluded: selectedEnemies.every(
        ({ crouchedLineOfSight }) => !crouchedLineOfSight,
      ),
    });
    this.recentInkfallSpawnUses.push(Object.freeze({
      spawnId: diagnostic.selectedSpawnId,
      tick,
    }));
    this.inkfallSpawnDecisions.push(diagnostic);
    if (this.inkfallSpawnDecisions.length > MAXIMUM_RETAINED_INKFALL_SPAWN_DECISIONS) {
      this.inkfallSpawnDecisions.splice(
        0,
        this.inkfallSpawnDecisions.length - MAXIMUM_RETAINED_INKFALL_SPAWN_DECISIONS,
      );
    }
    if (fallbackMode !== 'none') this.inkfallSpawnFallbacks += 1;
    return selected;
  }

  private async ensureInitialized(
    roomCode: string,
    requestedProfile: WorkerRoomProfile | undefined = undefined,
  ): Promise<void> {
    if (this.authority !== null) {
      if (this.roomCode !== roomCode) throw new Error('AUTHORITY_ROOM_CODE_MISMATCH');
      if (requestedProfile !== undefined && requestedProfile !== this.roomProfile) {
        throw new Error('AUTHORITY_ROOM_PROFILE_MISMATCH');
      }
      return;
    }
    if (this.initialization === null) {
      this.initialization = this.ctx.blockConcurrencyWhile(async () => {
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS room_metadata (
            room_code TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL
          )
        `);
        this.resumeSessions.ensureSchema();
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS room_runtime_v2 (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            schema_version INTEGER NOT NULL,
            room_code TEXT NOT NULL,
            room_id TEXT NOT NULL,
            match_id TEXT NOT NULL,
            protocol_version INTEGER NOT NULL,
            simulation_identity_json TEXT NOT NULL,
            recovery_state TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `);
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS room_profile_v1 (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            schema_version INTEGER NOT NULL,
            profile_id TEXT NOT NULL
          )
        `);
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS room_lobby_players_v1 (
            player_id TEXT PRIMARY KEY,
            schema_version INTEGER NOT NULL,
            join_ordinal INTEGER NOT NULL UNIQUE CHECK (join_ordinal >= 0 AND join_ordinal < 64),
            created_at INTEGER NOT NULL
          )
        `);
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS room_lobby_reliability_v1 (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            schema_version INTEGER NOT NULL,
            room_code TEXT NOT NULL,
            room_id TEXT NOT NULL,
            match_id TEXT NOT NULL,
            protocol_version INTEGER NOT NULL,
            checkpoint_json TEXT NOT NULL,
            checkpoint_hash_algorithm TEXT NOT NULL,
            checkpoint_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `);
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS room_loadout_requests_v1 (
            request_ordinal INTEGER PRIMARY KEY AUTOINCREMENT,
            schema_version INTEGER NOT NULL,
            player_id TEXT NOT NULL,
            request_id TEXT NOT NULL,
            request_fingerprint TEXT NOT NULL,
            outcome_code TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            UNIQUE (player_id, request_id)
          )
        `);
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS room_player_loadouts_v1 (
            player_id TEXT PRIMARY KEY,
            schema_version INTEGER NOT NULL,
            ruleset_id TEXT NOT NULL,
            ruleset_revision INTEGER NOT NULL,
            request_fingerprint TEXT NOT NULL,
            selection_json TEXT NOT NULL,
            accepted_at_tick INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `);
        this.ctx.storage.sql.exec(`
          CREATE TABLE IF NOT EXISTS room_active_checkpoint_v1 (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            schema_version INTEGER NOT NULL,
            room_code TEXT NOT NULL,
            room_id TEXT NOT NULL,
            match_id TEXT NOT NULL,
            profile_id TEXT NOT NULL,
            protocol_version INTEGER NOT NULL,
            simulation_identity_json TEXT NOT NULL,
            map_binding_json TEXT NOT NULL,
            checkpoint_json TEXT NOT NULL,
            checkpoint_hash_algorithm TEXT NOT NULL,
            checkpoint_hash TEXT NOT NULL,
            authority_tick INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `);
        const stored = [...this.ctx.storage.sql.exec<{ room_code: string }>(
          'SELECT room_code FROM room_metadata LIMIT 1',
        )];
        if (stored.length > 0 && stored[0].room_code !== roomCode) {
          this.initializationFailure = 'AUTHORITY_ROOM_CODE_MISMATCH';
          return;
        }
        if (stored.length === 0) {
          this.ctx.storage.sql.exec(
            'INSERT INTO room_metadata (room_code, created_at) VALUES (?, ?)',
            roomCode,
            Date.now(),
          );
        }
        const runtimeRows = [...this.ctx.storage.sql.exec<RoomRuntimeRow>(
          `SELECT schema_version, room_code, room_id, match_id, protocol_version,
                  simulation_identity_json, recovery_state
           FROM room_runtime_v2 WHERE singleton = 1`,
        )];
        const runtime = runtimeRows[0];
        const profileRow = [...this.ctx.storage.sql.exec<RoomProfileRow>(
          'SELECT schema_version, profile_id FROM room_profile_v1 WHERE singleton = 1',
        )][0];
        let persistedProfile: WorkerRoomProfile | undefined;
        let backfillPersistedProfile = false;
        if (runtime !== undefined) {
          try {
            const identity = JSON.parse(runtime.simulation_identity_json) as Partial<SimulationIdentityV1>;
            persistedProfile = inferWorkerRoomProfileFromIdentity(identity);
          } catch {
            persistedProfile = undefined;
          }
          if (persistedProfile === undefined) {
            this.initializationFailure = 'AUTHORITY_PERSISTED_PROFILE_INVALID';
            return;
          }
          if (profileRow === undefined) {
            backfillPersistedProfile = true;
          } else {
            const storedProfile = profileRow.schema_version === ROOM_PROFILE_SCHEMA_VERSION
              ? workerRoomProfileFromStorageId(profileRow.profile_id)
              : undefined;
            if (storedProfile === undefined || storedProfile !== persistedProfile) {
              this.markRecoveryState('expired');
              this.initializationFailure = 'AUTHORITY_PERSISTED_PROFILE_IDENTITY_MISMATCH';
              return;
            }
          }
        } else if (profileRow !== undefined) {
          this.initializationFailure = 'AUTHORITY_PROFILE_WITHOUT_RUNTIME';
          return;
        }
        const selectedProfile: WorkerRoomProfile = runtime === undefined
          ? requestedProfile ?? null
          : persistedProfile as WorkerRoomProfile;
        const revision3Combat = selectedProfile !== null;
        const inkfallProfile = isInkfallWorkerRoomProfile(selectedProfile)
          ? selectedProfile
          : null;
        const relayProfile = isRelayWorkerRoomProfile(selectedProfile)
          ? selectedProfile
          : null;
        const persistentMapProfile = inkfallProfile ?? relayProfile;
        const mapCombat = persistentMapProfile !== null;
        const world = RapierMovementWorld.createWithRuntime(
          relayProfile !== null
            ? relayWorkerFixture()
            : inkfallProfile !== null
              ? inkfallWorkerFixture(inkfallProfile)
            : getPhysicsFixture('flat_run'),
          initializeWorkerRapierRuntime(),
        );
        const ruleset = revision3Combat
          ? requireRuleset(G4_COMBAT_RULESET_ID, G4_COMBAT_RULESET_REVISION)
          : requireRuleset();
        const rulesetHash = hashRulesetContent(ruleset);
        if (revision3Combat && rulesetHash !== G4_COMBAT_RULESET_HASH) {
          world.dispose();
          this.initializationFailure = 'RULESET_HASH_INCOMPATIBLE';
          return;
        }
        if (
          ruleset.movementProfile.id !== PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.id
          || ruleset.movementProfile.revision !== PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.revision
          || (
            ruleset.movementProfile.implementationStatus === 'playable'
            && PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.implementationStatus !== 'playable'
          )
        ) {
          world.dispose();
          this.initializationFailure = 'RULESET_PROFILE_INCOMPATIBLE';
          return;
        }
        const compatibilityIdentity: SimulationIdentityV1 = Object.freeze({
          schemaVersion: 1,
          mapId: persistentMapProfile !== null
            ? workerMapBinding(persistentMapProfile).mapId
            : LOCAL_MAP_ID,
          rulesetId: ruleset.id,
          rulesetRevision: ruleset.revision,
          rulesetHash,
          movementProfileId: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.id,
          movementProfileRevision: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE.revision,
          movementProfileHash: hashMovementProfile(PHASE3_HYPOTHESIS_MOVEMENT_PROFILE),
          fixtureId: world.fixture.id,
          fixtureHash: world.fixtureHash,
          physicsAdapterId: 'rapier3d_deterministic_compat',
          physicsAdapterVersion: '0.19.3',
        });
        const identityJson = JSON.stringify(compatibilityIdentity);
        const roomId = `room.${roomCode}`;
        let matchId: string;
        let restoreLobbyCheckpoint = false;
        let restoreActiveCheckpoint = false;
        if (runtime === undefined) {
          matchId = `match.${crypto.randomUUID().replaceAll('-', '')}`;
          const createdAt = Date.now();
          this.ctx.storage.transactionSync(() => {
            this.ctx.storage.sql.exec(
              `INSERT INTO room_runtime_v2
                (singleton, schema_version, room_code, room_id, match_id,
                 protocol_version, simulation_identity_json, recovery_state,
                 created_at, updated_at)
               VALUES (1, ?, ?, ?, ?, ?, ?, 'pristine', ?, ?)`,
              ROOM_RUNTIME_SCHEMA_VERSION,
              roomCode,
              roomId,
              matchId,
              PROTOCOL_VERSION,
              identityJson,
              createdAt,
              createdAt,
            );
            this.ctx.storage.sql.exec(
              `INSERT INTO room_profile_v1 (singleton, schema_version, profile_id)
               VALUES (1, ?, ?)`,
              ROOM_PROFILE_SCHEMA_VERSION,
              workerRoomProfileStorageId(selectedProfile),
            );
          });
        } else {
          matchId = runtime.match_id;
          if (
            runtime.schema_version !== ROOM_RUNTIME_SCHEMA_VERSION
            || runtime.room_code !== roomCode
            || runtime.room_id !== roomId
            || runtime.protocol_version !== PROTOCOL_VERSION
            || runtime.simulation_identity_json !== identityJson
          ) {
            world.dispose();
            this.markRecoveryState('expired');
            this.initializationFailure = 'AUTHORITY_PERSISTED_IDENTITY_MISMATCH';
            return;
          }
          if (runtime.recovery_state === 'lobby_checkpointed') {
            restoreLobbyCheckpoint = true;
          } else if (runtime.recovery_state === 'active_checkpointed') {
            if (!mapCombat) {
              world.dispose();
              this.markRecoveryState('expired');
              this.initializationFailure = 'AUTHORITY_ACTIVE_CHECKPOINT_PROFILE_MISMATCH';
              return;
            }
            restoreActiveCheckpoint = true;
          } else if (runtime.recovery_state !== 'pristine') {
            world.dispose();
            this.markRecoveryState('expired');
            this.initializationFailure = 'AUTHORITY_CHECKPOINT_UNAVAILABLE';
            return;
          } else if (this.hasPersistedLobbyAuthorityState()) {
            world.dispose();
            this.markRecoveryState('expired');
            this.initializationFailure = 'AUTHORITY_PRISTINE_RECOVERY_INCONSISTENT';
            return;
          }
          if (backfillPersistedProfile) {
            this.ctx.storage.sql.exec(
              `INSERT INTO room_profile_v1 (singleton, schema_version, profile_id)
               VALUES (1, ?, ?)`,
              ROOM_PROFILE_SCHEMA_VERSION,
              workerRoomProfileStorageId(selectedProfile),
            );
          }
        }
        this.world = world;
        this.roomCode = roomCode;
        this.revision3CombatEnabled = revision3Combat;
        this.roomProfile = selectedProfile;
        this.compatibilityIdentity = compatibilityIdentity;
        this.authoritativeLoadout = authorityLoadoutFromRuleset(ruleset);
        if (inkfallProfile === G5_INKFALL_REV5_COMBAT_PROFILE) {
          inkfallRevision4WorkerSpawnAuthority();
        } else if (inkfallProfile === G5_INKFALL_REV4_COMBAT_PROFILE) {
          inkfallRevision3WorkerSpawnAuthority();
        }
        this.authority = new AuthoritativeRoom({
          identity: {
            roomId,
            matchId,
            rulesetId: ruleset.id,
            rulesetRevision: ruleset.revision,
            rulesetHash,
            mapId: compatibilityIdentity.mapId,
            fixtureId: world.fixture.id,
            fixtureHash: world.fixtureHash,
            physicsAdapterId: 'rapier3d_deterministic_compat',
            physicsAdapterVersion: '0.19.3',
          },
          profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
          queries: world,
          ...(relayProfile !== null
            ? { worldPortal: createRelayPortalAuthorityPort(world) }
            : (
                inkfallProfile === G5_INKFALL_REV4_COMBAT_PROFILE
                || inkfallProfile === G5_INKFALL_REV5_COMBAT_PROFILE
              )
              ? {
                  worldPortal: createInkfallRev5PortalAuthorityPort(
                    world,
                    inkfallProfile === G5_INKFALL_REV5_COMBAT_PROFILE
                      ? INKFALL_AUTHORITY_MAP_IDENTITY_V4
                      : INKFALL_AUTHORITY_MAP_IDENTITY_V3,
                  ),
                }
              : {}),
          spawnResolver: (playerId, ordinal, context) => {
            const restoredOrdinal = this.restoredSpawnOrdinals.get(playerId);
            const resolvedOrdinal = restoredOrdinal ?? ordinal;
            if (relayProfile !== null) {
              return relayWorkerCombatSpawn(resolvedOrdinal);
            }
            if (inkfallProfile !== null) {
              if (restoredOrdinal !== undefined) {
                return inkfallWorkerCombatSpawn(restoredOrdinal, inkfallProfile);
              }
              if (
                inkfallProfile === G5_INKFALL_REV4_COMBAT_PROFILE
                || inkfallProfile === G5_INKFALL_REV5_COMBAT_PROFILE
              ) {
                return this.resolveLiveInkfallSpawn(
                  playerId,
                  ordinal,
                  context,
                  inkfallProfile,
                );
              }
              return inkfallWorkerCombatSpawn(resolvedOrdinal, inkfallProfile);
            }
            return revision3Combat
              ? workerCombatSpawn(resolvedOrdinal)
              : { feetPosition: this.spawnFor(resolvedOrdinal) };
          },
          ...(mapCombat ? { maximumPlayers: 8 } : {}),
          ...(revision3Combat
            ? {
                combat: relayProfile !== null
                  ? createRelayWorkerCombatOptions(world)
                  : inkfallProfile !== null
                    ? createInkfallWorkerCombatOptions(world, inkfallProfile)
                  : createWorkerCombatOptions(),
              }
            : {}),
        });
        if (restoreLobbyCheckpoint) await this.restoreLobbyCheckpoint();
        if (restoreActiveCheckpoint) {
          try {
            await this.restoreActiveMatchCheckpoint();
          } catch (error) {
            world.dispose();
            this.world = null;
            this.authority = null;
            this.compatibilityIdentity = null;
            this.markRecoveryState('expired');
            this.initializationFailure = error instanceof Error
              ? `AUTHORITY_ACTIVE_CHECKPOINT_INVALID:${error.message.slice(0, 160)}`
              : 'AUTHORITY_ACTIVE_CHECKPOINT_INVALID';
            return;
          }
        }
      });
    }
    await this.initialization;
    if (this.initializationFailure !== null) throw new Error(this.initializationFailure);
    if (requestedProfile !== undefined && requestedProfile !== this.roomProfile) {
      throw new Error('AUTHORITY_ROOM_PROFILE_MISMATCH');
    }
  }

  private requireAuthority(): AuthoritativeRoom {
    if (this.authority === null) throw new Error('AUTHORITY_ROOM_NOT_INITIALIZED');
    return this.authority;
  }

  private requireAuthoritativeLoadout(): AuthorityLoadoutSelectionV1 {
    if (this.authoritativeLoadout === null) {
      throw new Error('AUTHORITY_LOADOUT_NOT_INITIALIZED');
    }
    return this.authoritativeLoadout;
  }

  private welcome(connectionId: string): ServerMessage {
    const authority = this.requireAuthority();
    return {
      protocolVersion: PROTOCOL_VERSION,
      type: 'welcome',
      connectionId,
      serverTick: authority.serverTick,
      protocolConfig: {
        protocolVersion: PROTOCOL_VERSION,
        snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
        reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
        simulationHz: 20,
        snapshotHz: 10,
        maxMessageBytes: PROTOCOL_LIMITS.maxMessageBytes,
        maxCommandsPerBatch: PROTOCOL_LIMITS.maxCommandsPerBatch,
      },
      simulationIdentity: this.simulationIdentity(),
    };
  }

  private simulationIdentity(
    snapshot = this.requireAuthority().fullSnapshot(),
  ): SimulationIdentityV1 {
    const identity: SimulationIdentityV1 = Object.freeze({
      schemaVersion: 1,
      mapId: snapshot.identity.mapId,
      rulesetId: snapshot.identity.rulesetId,
      rulesetRevision: snapshot.identity.rulesetRevision,
      rulesetHash: snapshot.identity.rulesetHash,
      movementProfileId: snapshot.identity.movementProfileId,
      movementProfileRevision: snapshot.identity.movementProfileRevision,
      movementProfileHash: snapshot.identity.movementProfileHash,
      fixtureId: snapshot.identity.fixtureId,
      fixtureHash: snapshot.identity.fixtureHash,
      physicsAdapterId: snapshot.identity.physicsAdapterId,
      physicsAdapterVersion: snapshot.identity.physicsAdapterVersion,
    });
    if (
      this.compatibilityIdentity !== null
      && JSON.stringify(identity) !== JSON.stringify(this.compatibilityIdentity)
    ) {
      throw new Error('AUTHORITY_RUNTIME_IDENTITY_DRIFT');
    }
    return identity;
  }

  private markActiveMatchCheckpointDirty(): void {
    const authority = this.requireAuthority();
    if (
      !isPersistentMapWorkerRoomProfile(this.roomProfile)
      || (
        authority.lifecycle !== 'warmup'
        && authority.lifecycle !== 'active'
        && authority.lifecycle !== 'postmatch'
      )
    ) return;
    this.transportMetrics.activeMatchCheckpointDirtyMarks += 1;
    if (
      this.activeMatchCheckpointDirty
      || this.lastActiveMatchCheckpointPersistedTick === authority.serverTick
    ) this.transportMetrics.activeMatchCheckpointCoalescedMarks += 1;
    this.activeMatchCheckpointDirty = true;
  }

  private flushActiveMatchCheckpoint(): void {
    if (!this.activeMatchCheckpointDirty) return;
    const authority = this.requireAuthority();
    if (this.lastActiveMatchCheckpointPersistedTick === authority.serverTick) return;
    if (
      this.lastActiveMatchCheckpointPersistedTick !== null
      && authority.serverTick - this.lastActiveMatchCheckpointPersistedTick
        < ACTIVE_MATCH_CHECKPOINT_INTERVAL_TICKS
    ) return;
    this.persistActiveMatchCheckpoint();
  }

  private persistActiveMatchCheckpoint(): void {
    const authority = this.requireAuthority();
    if (
      authority.lifecycle !== 'warmup'
      && authority.lifecycle !== 'active'
      && authority.lifecycle !== 'postmatch'
    ) return;
    if (!isPersistentMapWorkerRoomProfile(this.roomProfile)) {
      this.markRecoveryState('active_uncheckpointed');
      return;
    }
    const roomProfile = this.roomProfile;
    const authorityCheckpoint = authority.exportActiveMatchCheckpoint();
    const playerIds = authorityCheckpoint.players.map(({ playerId }) => playerId).sort();
    const playerEventAcknowledgements = playerIds.map((playerId) => {
      if (!this.playerEventAcknowledgements.has(playerId)) {
        throw new Error(`AUTHORITY_ACTIVE_CHECKPOINT_ACK_MISSING:${playerId}`);
      }
      return Object.freeze({
        playerId,
        lastAcknowledgedEventId: this.playerEventAcknowledgements.get(playerId) ?? null,
      });
    });
    const sessionGenerations = playerIds.map((playerId) => {
      const generation = this.sessionGenerations.get(playerId);
      if (generation === undefined) {
        throw new Error(`AUTHORITY_ACTIVE_CHECKPOINT_SESSION_MISSING:${playerId}`);
      }
      return Object.freeze({ playerId, generation });
    });
    const envelope: ActiveMatchCheckpointEnvelopeV1 = Object.freeze({
      schemaVersion: ACTIVE_MATCH_CHECKPOINT_SCHEMA_VERSION,
      roomCode: this.roomCode as string,
      roomProfile,
      protocolVersion: PROTOCOL_VERSION,
      simulationIdentity: this.simulationIdentity(),
      mapBinding: workerMapBinding(roomProfile),
      authority: authorityCheckpoint,
      reliableEvents: this.reliableEvents.exportCheckpoint(),
      playerEventAcknowledgements: Object.freeze(playerEventAcknowledgements),
      sessionGenerations: Object.freeze(sessionGenerations),
    });
    const checkpointJson = JSON.stringify(envelope);
    const checkpointBytes = new TextEncoder().encode(checkpointJson).byteLength;
    if (checkpointBytes > MAXIMUM_ACTIVE_MATCH_CHECKPOINT_BYTES) {
      throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_TOO_LARGE');
    }
    const identityJson = JSON.stringify(envelope.simulationIdentity);
    const mapBindingJson = JSON.stringify(envelope.mapBinding);
    const checkpointHash = fnv1a64Json(checkpointJson);
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `INSERT INTO room_active_checkpoint_v1
          (singleton, schema_version, room_code, room_id, match_id, profile_id,
           protocol_version, simulation_identity_json, map_binding_json,
           checkpoint_json, checkpoint_hash_algorithm, checkpoint_hash,
           authority_tick, created_at, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(singleton) DO UPDATE SET
           schema_version = excluded.schema_version,
           room_code = excluded.room_code,
           room_id = excluded.room_id,
           match_id = excluded.match_id,
           profile_id = excluded.profile_id,
           protocol_version = excluded.protocol_version,
           simulation_identity_json = excluded.simulation_identity_json,
           map_binding_json = excluded.map_binding_json,
           checkpoint_json = excluded.checkpoint_json,
           checkpoint_hash_algorithm = excluded.checkpoint_hash_algorithm,
           checkpoint_hash = excluded.checkpoint_hash,
           authority_tick = excluded.authority_tick,
           updated_at = excluded.updated_at`,
        ACTIVE_MATCH_CHECKPOINT_SCHEMA_VERSION,
        envelope.roomCode,
        authority.identity.roomId,
        authority.identity.matchId,
        workerRoomProfileStorageId(roomProfile),
        PROTOCOL_VERSION,
        identityJson,
        mapBindingJson,
        checkpointJson,
        ACTIVE_MATCH_CHECKPOINT_HASH_ALGORITHM,
        checkpointHash,
        authority.serverTick,
        now,
        now,
      );
      this.ctx.storage.sql.exec('DELETE FROM room_lobby_players_v1');
      this.ctx.storage.sql.exec('DELETE FROM room_lobby_reliability_v1');
      this.ctx.storage.sql.exec(
        `UPDATE room_runtime_v2
         SET recovery_state = 'active_checkpointed', updated_at = ?
         WHERE singleton = 1`,
        now,
      );
    });
    this.activeMatchCheckpointDirty = false;
    this.lastActiveMatchCheckpointPersistedTick = authority.serverTick;
    this.transportMetrics.activeMatchCheckpointWrites += 1;
    this.restoredSpawnOrdinals.clear();
  }

  private persistLobbyReliabilityCheckpoint(): void {
    const authority = this.requireAuthority();
    if (authority.lifecycle !== 'lobby' && authority.lifecycle !== 'idle') return;
    const playerIds = [...this.ctx.storage.sql.exec<{ player_id: string }>(
      `SELECT player_id
       FROM room_lobby_players_v1
       WHERE schema_version = ?
       ORDER BY player_id`,
      LOBBY_CHECKPOINT_SCHEMA_VERSION,
    )].map(({ player_id: playerId }) => playerId);
    if (playerIds.length === 0) {
      this.ctx.storage.sql.exec('DELETE FROM room_lobby_reliability_v1');
      return;
    }
    const playerEventAcknowledgements = playerIds.map((playerId) => {
      if (!this.playerEventAcknowledgements.has(playerId)) {
        throw new Error(`AUTHORITY_LOBBY_CHECKPOINT_ACK_MISSING:${playerId}`);
      }
      return Object.freeze({
        playerId,
        lastAcknowledgedEventId: this.playerEventAcknowledgements.get(playerId) ?? null,
      });
    });
    const envelope: LobbyReliabilityCheckpointEnvelopeV1 = Object.freeze({
      schemaVersion: LOBBY_RELIABILITY_CHECKPOINT_SCHEMA_VERSION,
      roomCode: this.roomCode as string,
      roomId: authority.identity.roomId,
      matchId: authority.identity.matchId,
      protocolVersion: PROTOCOL_VERSION,
      reliableEvents: this.reliableEvents.exportCheckpoint(),
      playerEventAcknowledgements: Object.freeze(playerEventAcknowledgements),
    });
    const checkpointJson = JSON.stringify(envelope);
    if (
      new TextEncoder().encode(checkpointJson).byteLength
      > MAXIMUM_LOBBY_RELIABILITY_CHECKPOINT_BYTES
    ) {
      throw new Error('AUTHORITY_LOBBY_RELIABILITY_CHECKPOINT_TOO_LARGE');
    }
    const checkpointHash = fnv1a64Json(checkpointJson);
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `INSERT INTO room_lobby_reliability_v1
          (singleton, schema_version, room_code, room_id, match_id,
           protocol_version, checkpoint_json, checkpoint_hash_algorithm,
           checkpoint_hash, created_at, updated_at)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(singleton) DO UPDATE SET
           schema_version = excluded.schema_version,
           room_code = excluded.room_code,
           room_id = excluded.room_id,
           match_id = excluded.match_id,
           protocol_version = excluded.protocol_version,
           checkpoint_json = excluded.checkpoint_json,
           checkpoint_hash_algorithm = excluded.checkpoint_hash_algorithm,
           checkpoint_hash = excluded.checkpoint_hash,
           updated_at = excluded.updated_at`,
        LOBBY_RELIABILITY_CHECKPOINT_SCHEMA_VERSION,
        envelope.roomCode,
        envelope.roomId,
        envelope.matchId,
        PROTOCOL_VERSION,
        checkpointJson,
        LOBBY_RELIABILITY_CHECKPOINT_HASH_ALGORITHM,
        checkpointHash,
        now,
        now,
      );
      this.ctx.storage.sql.exec(
        `UPDATE room_runtime_v2
         SET recovery_state = 'lobby_checkpointed', updated_at = ?
         WHERE singleton = 1`,
        now,
      );
    });
  }

  private restoreLobbyReliabilityCheckpoint(expectedPlayerIds: readonly string[]): void {
    const authority = this.requireAuthority();
    const row = [...this.ctx.storage.sql.exec<LobbyReliabilityCheckpointRow>(
      `SELECT schema_version, room_code, room_id, match_id, protocol_version,
              checkpoint_json, checkpoint_hash_algorithm, checkpoint_hash
       FROM room_lobby_reliability_v1 WHERE singleton = 1`,
    )][0];
    if (row === undefined) throw new Error('AUTHORITY_LOBBY_RELIABILITY_CHECKPOINT_ROW_MISSING');
    if (
      row.schema_version !== LOBBY_RELIABILITY_CHECKPOINT_SCHEMA_VERSION
      || row.room_code !== this.roomCode
      || row.room_id !== authority.identity.roomId
      || row.match_id !== authority.identity.matchId
      || row.protocol_version !== PROTOCOL_VERSION
      || row.checkpoint_hash_algorithm !== LOBBY_RELIABILITY_CHECKPOINT_HASH_ALGORITHM
      || !/^[a-f0-9]{16}$/u.test(row.checkpoint_hash)
      || fnv1a64Json(row.checkpoint_json) !== row.checkpoint_hash
      || new TextEncoder().encode(row.checkpoint_json).byteLength
        > MAXIMUM_LOBBY_RELIABILITY_CHECKPOINT_BYTES
    ) {
      throw new Error('AUTHORITY_LOBBY_RELIABILITY_CHECKPOINT_BINDING_MISMATCH');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.checkpoint_json) as unknown;
    } catch {
      throw new Error('AUTHORITY_LOBBY_RELIABILITY_CHECKPOINT_JSON_INVALID');
    }
    const envelope = exactCheckpointRecord(parsed, [
      'schemaVersion', 'roomCode', 'roomId', 'matchId', 'protocolVersion',
      'reliableEvents', 'playerEventAcknowledgements',
    ], 'lobby reliability checkpoint envelope');
    if (
      envelope.schemaVersion !== LOBBY_RELIABILITY_CHECKPOINT_SCHEMA_VERSION
      || envelope.roomCode !== this.roomCode
      || envelope.roomId !== authority.identity.roomId
      || envelope.matchId !== authority.identity.matchId
      || envelope.protocolVersion !== PROTOCOL_VERSION
    ) {
      throw new Error('AUTHORITY_LOBBY_RELIABILITY_CHECKPOINT_ENVELOPE_MISMATCH');
    }
    this.reliableEvents.restoreCheckpoint(envelope.reliableEvents);
    const acknowledgements = exactCheckpointArray(
      envelope.playerEventAcknowledgements,
      expectedPlayerIds.length,
      expectedPlayerIds.length,
      'lobby checkpoint player acknowledgements',
    );
    this.playerEventAcknowledgements.clear();
    for (let index = 0; index < acknowledgements.length; index += 1) {
      const item = exactCheckpointRecord(
        acknowledgements[index],
        ['playerId', 'lastAcknowledgedEventId'],
        'lobby checkpoint player acknowledgement',
      );
      const playerId = exactCheckpointStableId(
        item.playerId,
        'lobby checkpoint acknowledgement player',
      );
      if (playerId !== expectedPlayerIds[index] || this.playerEventAcknowledgements.has(playerId)) {
        throw new Error('AUTHORITY_LOBBY_RELIABILITY_CHECKPOINT_ACK_ORDER_MISMATCH');
      }
      const lastAcknowledgedEventId = exactCheckpointEventId(
        item.lastAcknowledgedEventId,
        'lobby checkpoint acknowledged event',
      );
      if (lastAcknowledgedEventId !== null) {
        const sequence = Number(lastAcknowledgedEventId.slice('event.'.length));
        if (sequence >= (envelope.reliableEvents as ReliableEventCheckpointV1).nextSequence) {
          throw new Error('AUTHORITY_LOBBY_RELIABILITY_CHECKPOINT_ACK_UNKNOWN');
        }
      }
      this.playerEventAcknowledgements.set(playerId, lastAcknowledgedEventId);
    }
  }

  private async restoreActiveMatchCheckpoint(): Promise<void> {
    if (!isPersistentMapWorkerRoomProfile(this.roomProfile)) {
      throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_PROFILE_UNAVAILABLE');
    }
    const roomProfile = this.roomProfile;
    const authority = this.requireAuthority();
    const row = [...this.ctx.storage.sql.exec<ActiveMatchCheckpointRow>(
      `SELECT schema_version, room_code, room_id, match_id, profile_id,
              protocol_version, simulation_identity_json, map_binding_json,
              checkpoint_json, checkpoint_hash_algorithm, checkpoint_hash,
              authority_tick
       FROM room_active_checkpoint_v1 WHERE singleton = 1`,
    )][0];
    if (row === undefined) throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_ROW_MISSING');
    const expectedIdentityJson = JSON.stringify(this.simulationIdentity());
    const expectedMapBindingJson = JSON.stringify(workerMapBinding(roomProfile));
    if (
      row.schema_version !== ACTIVE_MATCH_CHECKPOINT_SCHEMA_VERSION
      || row.room_code !== this.roomCode
      || row.room_id !== authority.identity.roomId
      || row.match_id !== authority.identity.matchId
      || row.profile_id !== workerRoomProfileStorageId(roomProfile)
      || row.protocol_version !== PROTOCOL_VERSION
      || row.simulation_identity_json !== expectedIdentityJson
      || row.map_binding_json !== expectedMapBindingJson
      || row.checkpoint_hash_algorithm !== ACTIVE_MATCH_CHECKPOINT_HASH_ALGORITHM
      || !/^[a-f0-9]{16}$/u.test(row.checkpoint_hash)
      || fnv1a64Json(row.checkpoint_json) !== row.checkpoint_hash
      || new TextEncoder().encode(row.checkpoint_json).byteLength
        > MAXIMUM_ACTIVE_MATCH_CHECKPOINT_BYTES
    ) {
      throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_BINDING_MISMATCH');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.checkpoint_json) as unknown;
    } catch {
      throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_JSON_INVALID');
    }
    const envelope = exactCheckpointRecord(parsed, [
      'schemaVersion', 'roomCode', 'roomProfile', 'protocolVersion',
      'simulationIdentity', 'mapBinding', 'authority', 'reliableEvents',
      'playerEventAcknowledgements', 'sessionGenerations',
    ], 'active match checkpoint envelope');
    if (
      envelope.schemaVersion !== ACTIVE_MATCH_CHECKPOINT_SCHEMA_VERSION
      || envelope.roomCode !== this.roomCode
      || envelope.roomProfile !== roomProfile
      || envelope.protocolVersion !== PROTOCOL_VERSION
      || JSON.stringify(envelope.simulationIdentity) !== expectedIdentityJson
      || JSON.stringify(envelope.mapBinding) !== expectedMapBindingJson
    ) {
      throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_ENVELOPE_MISMATCH');
    }
    this.reliableEvents.restoreCheckpoint(envelope.reliableEvents);
    const snapshot = authority.restoreActiveMatchCheckpoint(envelope.authority);
    if (row.authority_tick !== snapshot.serverTick) {
      throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_TICK_MISMATCH');
    }
    const checkpointPlayers = (envelope.authority as AuthorityActiveMatchCheckpointV1).players;
    const playerIds = checkpointPlayers.map(({ playerId }) => playerId).sort();
    if (
      playerIds.length !== snapshot.players.length
      || snapshot.players.some(({ playerId }) => !playerIds.includes(playerId))
    ) {
      throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_PLAYER_SET_MISMATCH');
    }

    const acknowledgementValues = exactCheckpointArray(
      envelope.playerEventAcknowledgements,
      playerIds.length,
      playerIds.length,
      'active checkpoint player acknowledgements',
    );
    const restoredAcknowledgements = new Map<string, string | null>();
    for (let index = 0; index < acknowledgementValues.length; index += 1) {
      const item = exactCheckpointRecord(
        acknowledgementValues[index],
        ['playerId', 'lastAcknowledgedEventId'],
        'active checkpoint player acknowledgement',
      );
      const playerId = exactCheckpointStableId(item.playerId, 'checkpoint acknowledgement player');
      if (playerId !== playerIds[index] || restoredAcknowledgements.has(playerId)) {
        throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_ACK_ORDER_MISMATCH');
      }
      const lastAcknowledgedEventId = exactCheckpointEventId(
        item.lastAcknowledgedEventId,
        'checkpoint acknowledged event',
      );
      if (lastAcknowledgedEventId !== null) {
        const sequence = Number(lastAcknowledgedEventId.slice('event.'.length));
        if (sequence >= (envelope.reliableEvents as ReliableEventCheckpointV1).nextSequence) {
          throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_ACK_UNKNOWN');
        }
      }
      restoredAcknowledgements.set(playerId, lastAcknowledgedEventId);
    }

    const generationValues = exactCheckpointArray(
      envelope.sessionGenerations,
      playerIds.length,
      playerIds.length,
      'active checkpoint session generations',
    );
    const restoredGenerations = new Map<string, number>();
    const now = Date.now();
    for (let index = 0; index < generationValues.length; index += 1) {
      const item = exactCheckpointRecord(
        generationValues[index],
        ['playerId', 'generation'],
        'active checkpoint session generation',
      );
      const playerId = exactCheckpointStableId(item.playerId, 'checkpoint generation player');
      const generation = exactCheckpointInteger(
        item.generation,
        1,
        Number.MAX_SAFE_INTEGER,
        'checkpoint session generation',
      );
      if (
        playerId !== playerIds[index]
        || restoredGenerations.has(playerId)
        || !this.resumeSessions.isCurrentGeneration(
          playerId,
          authority.identity.roomId,
          authority.identity.matchId,
          generation,
          now,
        )
      ) {
        throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_SESSION_MISMATCH');
      }
      restoredGenerations.set(playerId, generation);
    }

    const checkpointByPlayerId = new Map(checkpointPlayers.map((player) => [player.playerId, player]));
    const connectedSockets = new Map<string, { socket: WebSocket; attachment: SocketAttachment }>();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.readSocketAttachment(socket);
      if (attachment === null) {
        socket.close(1008, 'Invalid active checkpoint socket');
        throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_SOCKET_INVALID');
      }
      if (attachment.playerId === null) continue;
      const checkpointPlayer = checkpointByPlayerId.get(attachment.playerId);
      const generation = restoredGenerations.get(attachment.playerId);
      if (
        checkpointPlayer === undefined
        || !checkpointPlayer.connected
        || checkpointPlayer.connectionId !== attachment.connectionId
        || generation !== attachment.sessionGeneration
        || connectedSockets.has(attachment.playerId)
      ) {
        socket.close(1008, 'Active checkpoint socket mismatch');
        throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_SOCKET_MISMATCH');
      }
      connectedSockets.set(attachment.playerId, { socket, attachment });
    }
    for (const player of checkpointPlayers) {
      if (player.connected !== connectedSockets.has(player.playerId)) {
        throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_CONNECTED_SET_MISMATCH');
      }
    }

    this.playerEventAcknowledgements.clear();
    this.sessionGenerations.clear();
    const resynchronized = new Map<string, SocketAttachment>();
    for (const playerId of playerIds) {
      const normalizedAcknowledgement = this.retainedEventBaseline(
        restoredAcknowledgements.get(playerId) ?? null,
      );
      this.playerEventAcknowledgements.set(playerId, normalizedAcknowledgement);
      this.sessionGenerations.set(playerId, restoredGenerations.get(playerId) as number);
      const live = connectedSockets.get(playerId);
      if (live === undefined) continue;
      const resetAttachment: SocketAttachment = Object.freeze({
        ...live.attachment,
        lastAcknowledgedSnapshotTick: null,
        lastAcknowledgedSnapshotBaselineId: null,
        lastSentSnapshotTick: null,
        lastSentSnapshotBaselineId: null,
        sentSnapshotHistory: Object.freeze([]),
        lastSnapshotSentAt: null,
        snapshotAckDebtStartedAt: null,
        lastAcknowledgedEventId: normalizedAcknowledgement,
        lastSentReliableEventId: normalizedAcknowledgement,
        backpressureStartedAt: null,
      });
      this.writeSocketAttachment(live.socket, resetAttachment);
      const sent = this.sendFullSnapshot(live.socket, resetAttachment, snapshot);
      if (sent === null) throw new Error('AUTHORITY_ACTIVE_CHECKPOINT_RESYNC_FAILED');
      resynchronized.set(sent.connectionId, sent);
    }
    if (resynchronized.size > 0) this.broadcastReliableEvents(resynchronized);
    this.persistActiveMatchCheckpoint();
    this.ensureTimer();
  }

  private async restoreLobbyCheckpoint(): Promise<void> {
    const authority = this.requireAuthority();
    const now = Date.now();
    const persistedRows = [...this.ctx.storage.sql.exec<LobbyCheckpointPlayerRow>(
      `SELECT player_id, join_ordinal
       FROM room_lobby_players_v1
       WHERE schema_version = ?
       ORDER BY join_ordinal, player_id`,
      LOBBY_CHECKPOINT_SCHEMA_VERSION,
    )];
    if (persistedRows.length === 0) {
      this.resetPristineLobbyCheckpoint();
      return;
    }
    this.restoreLobbyReliabilityCheckpoint(
      persistedRows.map(({ player_id: playerId }) => playerId).sort(),
    );
    const expiredPlayerIds = this.pruneExpiredSessionsAndLobbyCheckpoints(now);
    for (const playerId of expiredPlayerIds) this.recordPlayerLeft(playerId);
    const rows = [...this.ctx.storage.sql.exec<LobbyCheckpointPlayerRow>(
      `SELECT player_id, join_ordinal
       FROM room_lobby_players_v1
       WHERE schema_version = ?
       ORDER BY join_ordinal, player_id`,
      LOBBY_CHECKPOINT_SCHEMA_VERSION,
    )];
    if (rows.length === 0) {
      this.resetPristineLobbyCheckpoint();
      return;
    }

    const resumeRows = [...this.ctx.storage.sql.exec<LobbyResumeSessionRow>(
      `SELECT player_id, generation, expires_at
       FROM resume_sessions
       WHERE room_id = ? AND match_id = ?
       ORDER BY player_id`,
      authority.identity.roomId,
      authority.identity.matchId,
    )];
    const resumeByPlayer = new Map(resumeRows.map((row) => [row.player_id, row]));
    if (
      resumeRows.length !== rows.length
      || rows.some(({ player_id: playerId }) => !resumeByPlayer.has(playerId))
    ) {
      this.markRecoveryState('expired');
      throw new Error('AUTHORITY_LOBBY_CHECKPOINT_SESSION_MISMATCH');
    }

    const checkpointPlayerIds = new Set(rows.map(({ player_id: playerId }) => playerId));
    const liveSockets = new Map<string, { socket: WebSocket; attachment: SocketAttachment }>();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.readSocketAttachment(socket);
      if (attachment === null || attachment.playerId === null) continue;
      if (
        attachment.roomCode !== this.roomCode
        || !checkpointPlayerIds.has(attachment.playerId)
        || !this.resumeSessions.isCurrentGeneration(
          attachment.playerId,
          authority.identity.roomId,
          authority.identity.matchId,
          attachment.sessionGeneration,
          now,
        )
        || liveSockets.has(attachment.playerId)
      ) {
        this.forgetSocketAttachment(attachment);
        socket.close(1008, 'Invalid lobby checkpoint socket');
        this.markRecoveryState('expired');
        throw new Error('AUTHORITY_LOBBY_CHECKPOINT_SOCKET_MISMATCH');
      }
      liveSockets.set(attachment.playerId, { socket, attachment });
    }

    this.restoredSpawnOrdinals.clear();
    for (const row of rows) this.restoredSpawnOrdinals.set(row.player_id, row.join_ordinal);
    const resynchronized: Array<{ socket: WebSocket; attachment: SocketAttachment }> = [];
    for (const row of rows) {
      const live = liveSockets.get(row.player_id);
      const connectionId = live?.attachment.connectionId
        ?? `connection.recovery.${row.join_ordinal}`;
      const joined = authority.joinNewPlayer({ playerId: row.player_id, connectionId });
      if (!joined.ok) {
        this.markRecoveryState('expired');
        throw new Error(`AUTHORITY_LOBBY_CHECKPOINT_PLAYER_REJECTED:${row.player_id}`);
      }
      this.applyPersistedPlayerLoadout(row.player_id);
      if (!this.playerEventAcknowledgements.has(row.player_id)) {
        this.markRecoveryState('expired');
        throw new Error(`AUTHORITY_LOBBY_CHECKPOINT_ACK_MISSING:${row.player_id}`);
      }
      const restoredEventAcknowledgement = this.retainedEventBaseline(
        this.playerEventAcknowledgements.get(row.player_id) ?? null,
      );
      this.playerEventAcknowledgements.set(row.player_id, restoredEventAcknowledgement);
      if (live === undefined) {
        authority.disconnectConnection(connectionId);
        continue;
      }
      const resetAttachment: SocketAttachment = Object.freeze({
        ...live.attachment,
        lastAcknowledgedSnapshotTick: null,
        lastAcknowledgedSnapshotBaselineId: null,
        lastSentSnapshotTick: null,
        lastSentSnapshotBaselineId: null,
        sentSnapshotHistory: Object.freeze([]),
        lastSnapshotSentAt: null,
        snapshotAckDebtStartedAt: null,
        lastAcknowledgedEventId: restoredEventAcknowledgement,
        lastSentReliableEventId: restoredEventAcknowledgement,
        backpressureStartedAt: null,
      });
      this.writeSocketAttachment(live.socket, resetAttachment);
      this.sessionGenerations.set(row.player_id, resetAttachment.sessionGeneration);
      resynchronized.push({ socket: live.socket, attachment: resetAttachment });
    }

    if (authority.metricsSnapshot().connectedPlayers >= authority.minimumConnectedPlayersToStart) {
      this.markRecoveryState('expired');
      throw new Error('AUTHORITY_LOBBY_CHECKPOINT_START_RACE');
    }
    const sentAttachments = new Map<string, SocketAttachment>();
    for (const { socket, attachment } of resynchronized) {
      const sent = this.sendFullSnapshot(socket, attachment);
      if (sent === null) {
        this.disconnectSocket(socket, attachment, 1013, 'Backpressure');
      } else {
        sentAttachments.set(sent.connectionId, sent);
      }
    }
    if (sentAttachments.size > 0) this.broadcastReliableEvents(sentAttachments);
    this.persistLobbyReliabilityCheckpoint();
    this.transportMetrics.lobbyCheckpointRehydrates += 1;
    this.transportMetrics.lobbyCheckpointPlayersRestored += rows.length;
    await this.scheduleMaintenanceAlarm();
  }

  private persistLobbyCheckpointPlayer(playerId: string): void {
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      const existing = [...this.ctx.storage.sql.exec<Record<string, number>>(
        'SELECT join_ordinal FROM room_lobby_players_v1 WHERE player_id = ? LIMIT 1',
        playerId,
      )][0];
      if (existing === undefined) {
        const maximum = [...this.ctx.storage.sql.exec<Record<string, number | null>>(
          'SELECT MAX(join_ordinal) AS maximum FROM room_lobby_players_v1',
        )][0]?.maximum;
        const joinOrdinal = maximum === null || maximum === undefined ? 0 : maximum + 1;
        this.ctx.storage.sql.exec(
          `INSERT INTO room_lobby_players_v1
            (player_id, schema_version, join_ordinal, created_at)
           VALUES (?, ?, ?, ?)`,
          playerId,
          LOBBY_CHECKPOINT_SCHEMA_VERSION,
          joinOrdinal,
          now,
        );
      }
      this.ctx.storage.sql.exec(
        `UPDATE room_runtime_v2
         SET recovery_state = 'lobby_checkpointed', updated_at = ?
         WHERE singleton = 1`,
        now,
      );
    });
    this.persistLobbyReliabilityCheckpoint();
  }

  private hasPersistedLobbyAuthorityState(): boolean {
    const session = [...this.ctx.storage.sql.exec<Record<string, number>>(
      'SELECT 1 AS present FROM resume_sessions LIMIT 1',
    )].length > 0;
    const checkpoint = [...this.ctx.storage.sql.exec<Record<string, number>>(
      'SELECT 1 AS present FROM room_lobby_players_v1 LIMIT 1',
    )].length > 0;
    const reliabilityCheckpoint = [...this.ctx.storage.sql.exec<Record<string, number>>(
      'SELECT 1 AS present FROM room_lobby_reliability_v1 LIMIT 1',
    )].length > 0;
    const attachedPlayer = this.ctx.getWebSockets().some((socket) => {
      const attachment = this.readSocketAttachment(socket);
      return attachment !== null && attachment.playerId !== null;
    });
    return session || checkpoint || reliabilityCheckpoint || attachedPlayer;
  }

  private removeLobbyCheckpointPlayer(playerId: string): void {
    this.ctx.storage.sql.exec(
      'DELETE FROM room_lobby_players_v1 WHERE player_id = ?',
      playerId,
    );
    this.restoredSpawnOrdinals.delete(playerId);
  }

  private pruneExpiredSessionsAndLobbyCheckpoints(nowMilliseconds: number): readonly string[] {
    const expired = this.ctx.storage.transactionSync(() => {
      const playerIds = this.resumeSessions.pruneExpired(nowMilliseconds);
      for (const playerId of playerIds) {
        this.ctx.storage.sql.exec(
          'DELETE FROM room_lobby_players_v1 WHERE player_id = ?',
          playerId,
        );
      }
      return playerIds;
    });
    for (const playerId of expired) this.restoredSpawnOrdinals.delete(playerId);
    this.transportMetrics.expiredResumeSessionsPruned += expired.length;
    return expired;
  }

  private activateFromLobbyCheckpoint(): void {
    if (isPersistentMapWorkerRoomProfile(this.roomProfile)) {
      this.persistActiveMatchCheckpoint();
      return;
    }
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM room_lobby_players_v1');
      this.ctx.storage.sql.exec('DELETE FROM room_lobby_reliability_v1');
      this.ctx.storage.sql.exec(
        `UPDATE room_runtime_v2
         SET recovery_state = 'active_uncheckpointed', updated_at = ?
         WHERE singleton = 1`,
        now,
      );
    });
    this.restoredSpawnOrdinals.clear();
  }

  private resetPristineLobbyCheckpoint(): void {
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec('DELETE FROM room_lobby_players_v1');
      this.ctx.storage.sql.exec('DELETE FROM room_lobby_reliability_v1');
      this.ctx.storage.sql.exec(
        `UPDATE room_runtime_v2
         SET recovery_state = 'pristine', updated_at = ?
         WHERE singleton = 1`,
        now,
      );
    });
    this.restoredSpawnOrdinals.clear();
  }

  private async scheduleMaintenanceAlarm(): Promise<void> {
    if (this.timerActive) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    let nextAlarmAt: number | null = null;
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = this.readSocketAttachment(socket);
      if (attachment === null) continue;
      const staleAt = attachment.lastSeenAt + SOCKET_STALE_MILLISECONDS;
      nextAlarmAt = nextAlarmAt === null ? staleAt : Math.min(nextAlarmAt, staleAt);
    }
    const sessionExpiry = [...this.ctx.storage.sql.exec<Record<string, number | null>>(
      `SELECT MIN(expires_at) AS expires_at
       FROM resume_sessions
       WHERE expires_at < ?`,
      Number.MAX_SAFE_INTEGER,
    )][0]?.expires_at;
    if (sessionExpiry !== null && sessionExpiry !== undefined) {
      nextAlarmAt = nextAlarmAt === null
        ? sessionExpiry
        : Math.min(nextAlarmAt, sessionExpiry);
    }
    if (nextAlarmAt === null) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    await this.ctx.storage.setAlarm(Math.max(Date.now() + 1, nextAlarmAt));
  }

  private markRecoveryState(
    state:
      | 'pristine'
      | 'lobby_checkpointed'
      | 'active_checkpointed'
      | 'active_uncheckpointed'
      | 'expired',
  ): void {
    this.ctx.storage.sql.exec(
      'UPDATE room_runtime_v2 SET recovery_state = ?, updated_at = ? WHERE singleton = 1',
      state,
      Date.now(),
    );
  }

  private sendJoinRejection(
    webSocket: WebSocket,
    requestId: string,
    code: 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'MATCH_INCOMPATIBLE' | 'DUPLICATE_SESSION' | 'RESUME_REJECTED',
  ): void {
    safeSocketSend(webSocket, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'joinRejected',
      requestId,
      code,
    });
  }

  private spawnFor(playerCount: number): { readonly x: number; readonly y: number; readonly z: number } {
    const lane = playerCount % 4;
    return { x: (lane - 1) * 1_500, y: 0, z: playerCount < 4 ? -2_000 : 2_000 };
  }

  private sendFullSnapshot(
    webSocket: WebSocket,
    attachment: SocketAttachment,
    snapshot = this.requireAuthority().fullSnapshot(),
    resyncRequestId: string | null = null,
  ): SocketAttachment | null {
    const player = attachment.playerId === null
      ? null
      : snapshot.players.find(({ playerId }) => playerId === attachment.playerId) ?? null;
    if (player === null) return null;
    const entities = this.requireAuthority().protocolEntities();
    const combat = combatSnapshotFromAuthority(
      snapshot,
      attachment.playerId,
      attachment.combatPlayerScoresV1,
    );
    const snapshotBaselineId = this.snapshotBaselines.remember(snapshot.serverTick, entities);
    const eventBaselineId = this.retainedEventBaseline(attachment.lastAcknowledgedEventId);
    const eventBaselineReset = eventBaselineId !== attachment.lastAcknowledgedEventId;
    const sent = safeSocketSend(webSocket, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'fullSnapshot',
      snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
      snapshotBaselineId,
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      reliableEventBaselineId: eventBaselineId,
      ...(resyncRequestId === null ? {} : { resyncRequestId }),
      matchId: snapshot.identity.matchId,
      serverTick: snapshot.serverTick,
      phase: lifecyclePhase(snapshot.lifecycle),
      phaseEndsAtTick: snapshot.phaseEndsAtTick ?? snapshot.serverTick,
      simulationIdentity: this.simulationIdentity(snapshot),
      localReconciliation: this.localReconciliation(player.movement),
      entities,
      ...(combat === null ? {} : { combat }),
    });
    if (!sent) return null;
    const nextAttachment: SocketAttachment = Object.freeze({
      ...attachment,
      lastSentSnapshotTick: snapshot.serverTick,
      lastSentSnapshotBaselineId: snapshotBaselineId,
      sentSnapshotHistory: rememberSentSnapshot(
        attachment.sentSnapshotHistory,
        snapshot.serverTick,
        snapshotBaselineId,
      ),
      lastSnapshotSentAt: Date.now(),
      lastAcknowledgedEventId: eventBaselineId,
      lastSentReliableEventId: eventBaselineReset
        ? eventBaselineId
        : attachment.lastSentReliableEventId,
    });
    this.writeSocketAttachment(webSocket, nextAttachment);
    if (nextAttachment.playerId !== null) {
      this.playerEventAcknowledgements.set(nextAttachment.playerId, eventBaselineId);
      if (this.requireAuthority().lifecycle === 'lobby') {
        this.persistLobbyReliabilityCheckpoint();
      }
    }
    this.transportMetrics.fullSnapshotsSent += 1;
    return nextAttachment;
  }

  private sendDeltaSnapshot(
    webSocket: WebSocket,
    attachment: SocketAttachment,
    snapshot: AuthorityFullSnapshot,
    snapshotBaselineId: string,
  ): SocketAttachment | null {
    const player = attachment.playerId === null
      ? null
      : snapshot.players.find(({ playerId }) => playerId === attachment.playerId) ?? null;
    if (
      player === null
      || attachment.lastAcknowledgedSnapshotTick === null
      || attachment.lastAcknowledgedSnapshotBaselineId === null
    ) return null;
    const delta = this.snapshotBaselines.deltaFrom(
      attachment.lastAcknowledgedSnapshotBaselineId,
      attachment.lastAcknowledgedSnapshotTick,
      snapshotBaselineId,
      snapshot.serverTick,
    );
    if (delta === null) return null;
    const combat = combatSnapshotFromAuthority(
      snapshot,
      attachment.playerId,
      attachment.combatPlayerScoresV1,
    );
    const sent = safeSocketSend(webSocket, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'deltaSnapshot',
      snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
      baseSnapshotBaselineId: delta.baseSnapshotBaselineId,
      snapshotBaselineId: delta.snapshotBaselineId,
      matchId: snapshot.identity.matchId,
      baseTick: delta.baseTick,
      serverTick: delta.serverTick,
      phase: lifecyclePhase(snapshot.lifecycle),
      phaseEndsAtTick: snapshot.phaseEndsAtTick ?? snapshot.serverTick,
      localReconciliation: this.localReconciliation(player.movement),
      entities: delta.entities,
      removedEntityIds: delta.removedEntityIds,
      ...(combat === null ? {} : { combat }),
    });
    if (!sent) return null;
    const nextAttachment: SocketAttachment = Object.freeze({
      ...attachment,
      lastSentSnapshotTick: snapshot.serverTick,
      lastSentSnapshotBaselineId: snapshotBaselineId,
      sentSnapshotHistory: rememberSentSnapshot(
        attachment.sentSnapshotHistory,
        snapshot.serverTick,
        snapshotBaselineId,
      ),
      lastSnapshotSentAt: Date.now(),
    });
    this.writeSocketAttachment(webSocket, nextAttachment);
    this.transportMetrics.deltaSnapshotsSent += 1;
    return nextAttachment;
  }

  private localReconciliation(
    movement: AuthorityFullSnapshot['players'][number]['movement'],
  ): LocalReconciliationStateV1 {
    if (movement.simulationRateHz !== 20) {
      throw new Error('AUTHORITY_SIMULATION_RATE_INCOMPATIBLE');
    }
    return Object.freeze({ ...movement, simulationRateHz: 20 });
  }

  private isCurrentSessionAttachment(
    attachment: SocketAttachment,
    nowMilliseconds: number,
  ): boolean {
    if (attachment.playerId === null) return false;
    const cached = this.sessionGenerations.get(attachment.playerId);
    if (cached !== undefined) return cached === attachment.sessionGeneration;
    const authority = this.requireAuthority();
    const current = this.resumeSessions.isCurrentGeneration(
      attachment.playerId,
      authority.identity.roomId,
      authority.identity.matchId,
      attachment.sessionGeneration,
      nowMilliseconds,
    );
    if (current) this.sessionGenerations.set(attachment.playerId, attachment.sessionGeneration);
    return current;
  }

  private snapshotAcknowledgementRejection(
    attachment: SocketAttachment,
    acknowledgedTick: number,
    acknowledgedBaselineId: string,
    authorityTick: number,
  ): string | null {
    if (acknowledgedTick > authorityTick) return 'snapshot_tick_future';
    if (attachment.lastSentSnapshotTick === null) return 'snapshot_not_sent';
    if (
      attachment.lastAcknowledgedSnapshotTick !== null
      && acknowledgedTick < attachment.lastAcknowledgedSnapshotTick
    ) return 'snapshot_tick_regression';
    const matchesSent = acknowledgedTick === attachment.lastSentSnapshotTick
      && acknowledgedBaselineId === attachment.lastSentSnapshotBaselineId;
    const matchesAcknowledged = acknowledgedTick === attachment.lastAcknowledgedSnapshotTick
      && acknowledgedBaselineId === attachment.lastAcknowledgedSnapshotBaselineId;
    const retainedIntermediate = acknowledgedTick < attachment.lastSentSnapshotTick
      && (
        attachment.lastAcknowledgedSnapshotTick === null
        || acknowledgedTick > attachment.lastAcknowledgedSnapshotTick
      )
      && attachment.sentSnapshotHistory.some(({ serverTick, snapshotBaselineId }) => (
        serverTick === acknowledgedTick && snapshotBaselineId === acknowledgedBaselineId
      ));
    if (!matchesSent && !matchesAcknowledged && !retainedIntermediate) {
      if (
        acknowledgedTick === attachment.lastSentSnapshotTick
        || acknowledgedTick === attachment.lastAcknowledgedSnapshotTick
      ) return 'snapshot_baseline_id_not_sent';
      return 'snapshot_tick_not_sent';
    }
    // A queued ACK can arrive after the recovery fallback has sent a newer full
    // snapshot. A retained intermediate ACK is valid cumulative progress; the
    // acknowledgement helper advances the retained baseline while preserving
    // debt for any still-newer snapshot.
    if (!this.snapshotBaselines.has(acknowledgedBaselineId, acknowledgedTick)) {
      return 'snapshot_history_missing';
    }
    return null;
  }

  private retainedEventBaseline(requested: string | null): string | null {
    if (this.reliableEvents.pendingAfter(requested) !== null) return requested;
    this.transportMetrics.reliableEventHistoryFallbacks += 1;
    return this.reliableEvents.latestId;
  }

  private applyPersistedPlayerLoadout(playerId: string): void {
    const selection = this.persistedPlayerLoadout(playerId);
    if (selection === null) return;
    this.requireAuthority().setPlayerCombatLoadout(
      playerId,
      selection.damageAbilityIds,
      selection.primaryWeaponSlot,
    );
  }

  private persistedPlayerLoadout(playerId: string): AuthorityLoadoutSelectionV1 | null {
    const row = [...this.ctx.storage.sql.exec<PlayerLoadoutRow>(
      `SELECT selection_json
       FROM room_player_loadouts_v1
       WHERE player_id = ?
       LIMIT 1`,
      playerId,
    )][0] ?? null;
    if (row === null) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.selection_json);
    } catch {
      throw new Error('PERSISTED_LOADOUT_JSON_INVALID');
    }
    const authoritative = this.requireAuthoritativeLoadout();
    try {
      return assertAuthorityLoadoutSelection(parsed, {
        id: authoritative.rulesetId,
        revision: authoritative.rulesetRevision,
      });
    } catch {
      throw new Error('PERSISTED_LOADOUT_SELECTION_INVALID');
    }
  }

  private rejectedPresetWeaponSlot(
    playerId: string,
    message: InputBatchMessage,
  ): { readonly sequence: number; readonly slot: number } | null {
    const selection = this.persistedPlayerLoadout(playerId)
      ?? this.requireAuthoritativeLoadout();
    for (const command of message.commands) {
      if (
        command.selectedSlot !== undefined
        && command.selectedSlot !== selection.primaryWeaponSlot
        && command.selectedSlot !== 5
      ) {
        return Object.freeze({
          sequence: command.sequence,
          slot: command.selectedSlot,
        });
      }
    }
    return null;
  }

  private loadoutRequestLedgerEntry(
    playerId: string,
    requestId: string,
  ): LoadoutRequestLedgerRow | null {
    return [...this.ctx.storage.sql.exec<LoadoutRequestLedgerRow>(
      `SELECT request_fingerprint, outcome_code
       FROM room_loadout_requests_v1
       WHERE player_id = ? AND request_id = ?
       LIMIT 1`,
      playerId,
      requestId,
    )][0] ?? null;
  }

  private commitLoadoutRequest(options: Readonly<{
    playerId: string;
    requestId: string;
    fingerprint: string;
    outcomeCode: string;
    acceptedLoadout: AuthorityLoadoutSelectionV1 | null;
  }>): void {
    const authority = this.requireAuthority();
    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `INSERT INTO room_loadout_requests_v1
          (schema_version, player_id, request_id, request_fingerprint, outcome_code, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        LOADOUT_REQUEST_LEDGER_SCHEMA_VERSION,
        options.playerId,
        options.requestId,
        options.fingerprint,
        options.outcomeCode,
        now,
      );
      this.ctx.storage.sql.exec(
        `DELETE FROM room_loadout_requests_v1
         WHERE request_ordinal NOT IN (
           SELECT request_ordinal FROM room_loadout_requests_v1
           ORDER BY request_ordinal DESC LIMIT ?
         )`,
        MAXIMUM_RETAINED_LOADOUT_REQUESTS,
      );
      if (options.acceptedLoadout !== null) {
        this.ctx.storage.sql.exec(
          `INSERT INTO room_player_loadouts_v1
            (player_id, schema_version, ruleset_id, ruleset_revision,
             request_fingerprint, selection_json, accepted_at_tick, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(player_id) DO UPDATE SET
             schema_version = excluded.schema_version,
             ruleset_id = excluded.ruleset_id,
             ruleset_revision = excluded.ruleset_revision,
             request_fingerprint = excluded.request_fingerprint,
             selection_json = excluded.selection_json,
             accepted_at_tick = excluded.accepted_at_tick,
             updated_at = excluded.updated_at`,
          options.playerId,
          LOADOUT_REQUEST_LEDGER_SCHEMA_VERSION,
          options.acceptedLoadout.rulesetId,
          options.acceptedLoadout.rulesetRevision,
          options.fingerprint,
          JSON.stringify(options.acceptedLoadout),
          authority.serverTick,
          now,
        );
      }
    });
  }

  private sendLoadoutAcceptedNotice(webSocket: WebSocket, requestId: string): void {
    safeSocketSend(webSocket, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'serverNotice',
      code: 'LOADOUT_ACCEPTED',
      message: requestId,
    });
  }

  private handleLoadoutRequest(
    webSocket: WebSocket,
    attachment: SocketAttachment,
    request: LoadoutRequestMessage,
  ): void {
    if (attachment.playerId === null) throw new Error('LOADOUT_PLAYER_REQUIRED');
    const fingerprint = authorityLoadoutRequestFingerprint(request);
    const prior = this.loadoutRequestLedgerEntry(attachment.playerId, request.requestId);
    if (prior !== null) {
      if (prior.request_fingerprint !== fingerprint) {
        this.transportMetrics.loadoutRequestIdConflicts += 1;
        safeSocketSend(webSocket, errorMessage(
          'LOADOUT_REQUEST_ID_CONFLICT',
          null,
          request.requestId,
        ));
        return;
      }
      this.transportMetrics.loadoutRequestsReplayed += 1;
      if (prior.outcome_code === LOADOUT_ACCEPTED_OUTCOME) {
        if (
          this.requireAuthority().lifecycle === 'lobby'
          || this.requireAuthority().lifecycle === 'warmup'
        ) {
          try {
            this.applyPersistedPlayerLoadout(attachment.playerId);
          } catch {
            safeSocketSend(webSocket, errorMessage(
              'LOADOUT_STATE_UNAVAILABLE',
              null,
              request.requestId,
            ));
            return;
          }
        }
        this.sendLoadoutAcceptedNotice(webSocket, request.requestId);
      } else {
        safeSocketSend(webSocket, errorMessage(
          'LOADOUT_REJECTED',
          prior.outcome_code,
          request.requestId,
        ));
      }
      return;
    }

    const authority = this.requireAuthority();
    const decision = evaluateAuthorityLoadoutRequest({
      lifecycle: authority.lifecycle,
      request,
      authoritativeLoadout: this.requireAuthoritativeLoadout(),
    });
    try {
      this.commitLoadoutRequest({
        playerId: attachment.playerId,
        requestId: request.requestId,
        fingerprint,
        outcomeCode: decision.accepted ? LOADOUT_ACCEPTED_OUTCOME : decision.reason,
        acceptedLoadout: decision.loadout,
      });
      if (decision.accepted) {
        authority.setPlayerCombatLoadout(
          attachment.playerId,
          decision.loadout.damageAbilityIds,
          decision.loadout.primaryWeaponSlot,
        );
      }
    } catch {
      safeSocketSend(webSocket, errorMessage(
        'LOADOUT_STATE_UNAVAILABLE',
        null,
        request.requestId,
      ));
      return;
    }

    if (!decision.accepted) {
      this.transportMetrics.loadoutRequestsRejected += 1;
      safeSocketSend(webSocket, errorMessage(
        'LOADOUT_REJECTED',
        decision.reason,
        request.requestId,
      ));
      return;
    }

    this.transportMetrics.loadoutRequestsAccepted += 1;
    this.reliableEvents.append({
      serverTick: authority.serverTick,
      kind: 'loadoutAccepted',
      subjectId: attachment.playerId,
      actorId: attachment.playerId,
      targetId: null,
      amountHealthPoints: null,
    });
    this.transportMetrics.reliableEventsRecorded += 1;
    if (authority.lifecycle === 'lobby') {
      this.persistLobbyReliabilityCheckpoint();
    } else {
      this.persistActiveMatchCheckpoint();
    }
    this.sendLoadoutAcceptedNotice(webSocket, request.requestId);
    this.broadcastReliableEvents();
  }

  private recordLifecycleEvent(kind: 'playerJoined' | 'playerLeft', playerId: string): void {
    this.reliableEvents.append({
      serverTick: this.requireAuthority().serverTick,
      kind,
      subjectId: playerId,
      actorId: null,
      targetId: null,
      amountHealthPoints: null,
    });
    this.transportMetrics.reliableEventsRecorded += 1;
    this.persistLobbyReliabilityCheckpoint();
  }

  private recordPlayerLeft(playerId: string): void {
    this.removeLobbyCheckpointPlayer(playerId);
    this.ctx.storage.sql.exec(
      'DELETE FROM room_player_loadouts_v1 WHERE player_id = ?',
      playerId,
    );
    this.ctx.storage.sql.exec(
      'DELETE FROM room_loadout_requests_v1 WHERE player_id = ?',
      playerId,
    );
    if (!this.playerEventAcknowledgements.has(playerId)) return;
    this.recordLifecycleEvent('playerLeft', playerId);
    this.playerEventAcknowledgements.delete(playerId);
    this.sessionGenerations.delete(playerId);
  }

  private disconnectAttachment(attachment: SocketAttachment, nowMilliseconds: number): void {
    const authority = this.requireAuthority();
    if (!authority.disconnectConnection(attachment.connectionId) || attachment.playerId === null) return;
    this.resumeSessions.armDisconnectGrace(
      attachment.playerId,
      authority.identity.roomId,
      authority.identity.matchId,
      attachment.sessionGeneration,
      nowMilliseconds,
    );
    if (authority.lifecycle === 'lobby') {
      this.persistLobbyCheckpointPlayer(attachment.playerId);
    } else {
      this.persistActiveMatchCheckpoint();
    }
  }

  private readSocketAttachment(webSocket: WebSocket): SocketAttachment | null {
    const serialized = webSocket.deserializeAttachment();
    const normalized = normalizeSocketAttachment(serialized);
    if (normalized === null) return null;
    const cached = this.socketAttachments.get(normalized.connectionId);
    if (cached !== undefined) return cached;
    if (normalized !== serialized) this.writeSocketAttachment(webSocket, normalized);
    return normalized;
  }

  private writeSocketAttachment(webSocket: WebSocket, attachment: SocketAttachment): void {
    this.socketAttachments.set(attachment.connectionId, attachment);
    webSocket.serializeAttachment(attachment);
  }

  private forgetSocketAttachment(attachment: SocketAttachment): void {
    this.socketAttachments.delete(attachment.connectionId);
  }

  private prepareGameplaySend(
    webSocket: WebSocket,
    attachment: SocketAttachment,
    nowMilliseconds: number = Date.now(),
  ): GameplaySendPermit {
    if (webSocket.readyState !== WebSocket.OPEN) {
      return Object.freeze({ kind: 'closed', attachment });
    }
    const bufferedAmount = socketBufferedAmount(webSocket);
    this.transportMetrics.maximumObservedSocketBufferedBytes = Math.max(
      this.transportMetrics.maximumObservedSocketBufferedBytes,
      bufferedAmount,
    );
    const decision = evaluateSocketBackpressure(
      attachment,
      bufferedAmount,
      nowMilliseconds,
    );
    if (decision.attachment !== attachment) {
      this.writeSocketAttachment(webSocket, decision.attachment);
    }
    if (decision.began) this.transportMetrics.backpressureEpisodes += 1;
    if (decision.recovered) this.transportMetrics.slowConsumerRecoveries += 1;
    if (decision.action === 'coalesce') {
      this.transportMetrics.backpressureMessagesCoalesced += 1;
    } else if (decision.action === 'evict') {
      this.transportMetrics.slowConsumerEvictions += 1;
    }
    return Object.freeze({ kind: decision.action, attachment: decision.attachment });
  }

  private evaluateSnapshotDebt(
    webSocket: WebSocket,
    attachment: SocketAttachment,
    nowMilliseconds: number = Date.now(),
  ): ReturnType<typeof evaluateSnapshotAckDebt> | null {
    if (webSocket.readyState !== WebSocket.OPEN) return null;
    const decision = evaluateSnapshotAckDebt(attachment, nowMilliseconds);
    if (decision.attachment !== attachment) {
      this.writeSocketAttachment(webSocket, decision.attachment);
    }
    if (decision.began) this.transportMetrics.snapshotAckDebtEpisodes += 1;
    if (decision.recovered) {
      this.transportMetrics.snapshotAckDebtRecoveries += 1;
      this.transportMetrics.slowConsumerRecoveries += 1;
    }
    this.transportMetrics.maximumSnapshotAckDebtMilliseconds = Math.max(
      this.transportMetrics.maximumSnapshotAckDebtMilliseconds,
      decision.debtMilliseconds,
    );
    return decision;
  }

  private evictSnapshotAckDebtor(
    webSocket: WebSocket,
    attachment: SocketAttachment,
  ): void {
    this.transportMetrics.snapshotAckDebtEvictions += 1;
    this.transportMetrics.slowConsumerEvictions += 1;
    this.disconnectSocket(webSocket, attachment, 1013, 'Snapshot acknowledgement timeout');
  }

  private disconnectSocket(
    webSocket: WebSocket,
    attachment: SocketAttachment,
    code: number,
    reason: string,
  ): void {
    this.disconnectAttachment(attachment, Date.now());
    this.forgetSocketAttachment(attachment);
    webSocket.close(code, reason);
    if (!this.timerActive) this.ctx.waitUntil(this.scheduleMaintenanceAlarm());
  }

  private ensureTimer(): void {
    const lifecycle = this.requireAuthority().lifecycle;
    if (this.timerActive || (lifecycle !== 'warmup' && lifecycle !== 'active' && lifecycle !== 'postmatch')) {
      return;
    }
    this.timerActive = true;
    this.ctx.waitUntil(this.ctx.storage.deleteAlarm());
    const deadline = this.scheduler.start(performance.now());
    setTimeout(() => void this.runTimer(), Math.max(0, deadline - performance.now()));
  }

  private async runTimer(): Promise<void> {
    const authority = this.requireAuthority();
    try {
      const poll = this.scheduler.poll(performance.now());
      authority.recordMissedSchedulerTicks(poll.missedTicks);
      for (let index = 0; index < poll.ticksToRun; index += 1) {
        const tickStartedAt = performance.now();
        const tickResult = authority.advanceOneTick();
        this.respawnEligibleCombatPlayers();
        const combatEvents = reliableCombatEvents(tickResult);
        for (const event of combatEvents) {
          this.reliableEvents.append(event);
          this.transportMetrics.reliableEventsRecorded += 1;
        }
        for (const playerId of tickResult.prunedPlayerIds) this.recordPlayerLeft(playerId);
        this.markActiveMatchCheckpointDirty();
        if (combatEvents.length > 0 || tickResult.prunedPlayerIds.length > 0) {
          // Reliable combat and roster boundaries remain immediately durable.
          // Ordinary movement/checkpoint dirtiness is coalesced to a bounded
          // 500 ms cadence so a room does not serialize and transact at 20 Hz.
          this.persistActiveMatchCheckpoint();
        } else {
          this.flushActiveMatchCheckpoint();
        }
        this.broadcastInputAcks();
        if (authority.serverTick % SNAPSHOT_INTERVAL_TICKS === 0) {
          const snapshotAttachments = this.broadcastSnapshots();
          this.broadcastReliableEvents(snapshotAttachments);
        } else if (combatEvents.length > 0 || tickResult.prunedPlayerIds.length > 0) {
          this.broadcastReliableEvents();
        }
        if (authority.serverTick % 20 === 0) this.disconnectStaleSockets();
        this.recordAuthorityTickExecution(performance.now() - tickStartedAt);
      }
      const lifecycle = authority.lifecycle;
      if (lifecycle === 'warmup' || lifecycle === 'active' || lifecycle === 'postmatch') {
        // Rebase through FixedTickScheduler and yield between authority turns.
        // This gives queued hibernation WebSocket ACK handlers a chance to run
        // before the next bounded tick performs another debt evaluation.
        setTimeout(
          () => void this.runTimer(),
          Math.max(ROOM_TIMER_EVENT_YIELD_MILLISECONDS, poll.nextDelayMilliseconds),
        );
      } else {
        this.timerActive = false;
        this.markRecoveryState('expired');
        this.ensureExpiredMaintenanceTimer();
      }
    } catch (error) {
      this.timerActive = false;
      this.lastTickFailure = error instanceof Error ? error.message.slice(0, 256) : 'UNKNOWN';
      console.error(
        '[KYX_AUTHORITY_TICK_FAILED]',
        Object.freeze({
          roomCode: this.roomCode,
          roomProfile: this.roomProfile,
          serverTick: authority.serverTick,
          failure: this.lastTickFailure,
        }),
        error,
      );
      this.broadcast(errorMessage(
        'ROOM_TICK_FAILED',
        this.revision3CombatEnabled
          ? this.lastTickFailure
          : null,
      ));
    }
  }

  private recordAuthorityTickExecution(durationMilliseconds: number): void {
    if (!Number.isFinite(durationMilliseconds) || durationMilliseconds < 0) return;
    if (this.authorityTickExecutionSamples.length < ROOM_TICK_EXECUTION_SAMPLE_CAPACITY) {
      this.authorityTickExecutionSamples.push(durationMilliseconds);
      return;
    }
    this.authorityTickExecutionSamples[this.authorityTickExecutionSampleCursor] = durationMilliseconds;
    this.authorityTickExecutionSampleCursor = (
      this.authorityTickExecutionSampleCursor + 1
    ) % ROOM_TICK_EXECUTION_SAMPLE_CAPACITY;
  }

  private authorityTickExecutionMetrics(): AuthorityTickExecutionMetrics {
    const sortedSamples = [...this.authorityTickExecutionSamples].sort((left, right) => left - right);
    const maximum = sortedSamples.at(-1);
    return Object.freeze({
      sampleCapacity: ROOM_TICK_EXECUTION_SAMPLE_CAPACITY,
      samples: sortedSamples.length,
      p50Milliseconds: percentileMilliseconds(sortedSamples, 0.5),
      p95Milliseconds: percentileMilliseconds(sortedSamples, 0.95),
      p99Milliseconds: percentileMilliseconds(sortedSamples, 0.99),
      maximumMilliseconds: maximum === undefined ? null : roundedMilliseconds(maximum),
    });
  }

  private respawnEligibleCombatPlayers(): void {
    if (!this.revision3CombatEnabled) return;
    const authority = this.requireAuthority();
    if (authority.lifecycle !== 'warmup' && authority.lifecycle !== 'active') return;
    const snapshot = authority.fullSnapshot();
    for (const player of snapshot.players) {
      const life = player.combat?.life;
      if (
        life?.phase !== 'dead'
        || life.respawnEligibleAtTick === null
        || snapshot.serverTick < life.respawnEligibleAtTick
      ) continue;
      const result = authority.respawnCombatPlayer(player.playerId);
      if (!result.accepted && result.reason !== 'respawn_not_ready') {
        throw new Error(`AUTHORITY_COMBAT_RESPAWN_REJECTED:${result.reason}`);
      }
    }
  }

  private ensureExpiredMaintenanceTimer(): void {
    if (this.expiredMaintenanceTimerActive || this.timerActive) return;
    this.expiredMaintenanceTimerActive = true;
    setTimeout(() => this.runExpiredMaintenanceTimer(), 5_000);
  }

  private runExpiredMaintenanceTimer(): void {
    this.expiredMaintenanceTimerActive = false;
    if (this.timerActive) return;
    this.disconnectStaleSockets();
    if (this.ctx.getWebSockets().length > 0) this.ensureExpiredMaintenanceTimer();
  }

  private broadcastInputAcks(): void {
    const snapshot = this.requireAuthority().fullSnapshot();
    for (const webSocket of this.ctx.getWebSockets()) {
      const attachment = this.readSocketAttachment(webSocket);
      if (attachment === null || attachment.playerId === null) continue;
      const player = snapshot.players.find(({ playerId }) => playerId === attachment.playerId);
      const permit = this.prepareGameplaySend(webSocket, attachment);
      if (permit.kind === 'coalesce') continue;
      if (permit.kind === 'evict') {
        this.disconnectSocket(webSocket, permit.attachment, 1013, 'Slow consumer');
        continue;
      }
      if (permit.kind === 'closed') continue;
      if (!safeSocketSend(webSocket, {
        protocolVersion: PROTOCOL_VERSION,
        type: 'inputAck',
        serverTick: snapshot.serverTick,
        lastProcessedInputSequence: player?.lastProcessedInputSequence ?? -1,
      })) this.disconnectSocket(webSocket, permit.attachment, 1013, 'Backpressure');
    }
  }

  private broadcastSnapshots(): ReadonlyMap<string, SocketAttachment> {
    const snapshot = this.requireAuthority().fullSnapshot();
    const entities = this.requireAuthority().protocolEntities();
    const snapshotBaselineId = this.snapshotBaselines.remember(snapshot.serverTick, entities);
    const updatedAttachments = new Map<string, SocketAttachment>();
    for (const webSocket of this.ctx.getWebSockets()) {
      const attachment = this.readSocketAttachment(webSocket);
      if (attachment === null || attachment.playerId === null) continue;
      const debt = this.evaluateSnapshotDebt(webSocket, attachment);
      if (debt === null) continue;
      if (debt.action === 'coalesce') {
        this.transportMetrics.snapshotAckDebtSnapshotsCoalesced += 1;
        updatedAttachments.set(debt.attachment.connectionId, debt.attachment);
        continue;
      }
      if (debt.action === 'evict') {
        this.evictSnapshotAckDebtor(webSocket, debt.attachment);
        continue;
      }
      const waitingForAcknowledgement = debt.action === 'fallback';
      const acknowledgedBaselineMissing = (
        debt.attachment.lastAcknowledgedSnapshotTick !== null
        && debt.attachment.lastAcknowledgedSnapshotBaselineId !== null
        && !this.snapshotBaselines.has(
          debt.attachment.lastAcknowledgedSnapshotBaselineId,
          debt.attachment.lastAcknowledgedSnapshotTick,
        )
      );
      const sendFull = waitingForAcknowledgement
        || debt.attachment.lastAcknowledgedSnapshotTick === null
        || debt.attachment.lastAcknowledgedSnapshotBaselineId === null
        || acknowledgedBaselineMissing;
      const permit = this.prepareGameplaySend(webSocket, debt.attachment);
      if (permit.kind === 'coalesce') {
        updatedAttachments.set(permit.attachment.connectionId, permit.attachment);
        continue;
      }
      if (permit.kind === 'evict') {
        this.disconnectSocket(webSocket, permit.attachment, 1013, 'Slow consumer');
        continue;
      }
      if (permit.kind === 'closed') continue;
      if (waitingForAcknowledgement) this.transportMetrics.snapshotAckTimeoutFallbacks += 1;
      if (acknowledgedBaselineMissing) this.transportMetrics.snapshotHistoryFallbacks += 1;
      const sentAttachment = sendFull
        ? this.sendFullSnapshot(webSocket, permit.attachment, snapshot)
        : this.sendDeltaSnapshot(
          webSocket,
          permit.attachment,
          snapshot,
          snapshotBaselineId,
        );
      if (sentAttachment === null) {
        this.disconnectSocket(webSocket, permit.attachment, 1013, 'Backpressure');
      } else updatedAttachments.set(sentAttachment.connectionId, sentAttachment);
    }
    return updatedAttachments;
  }

  private broadcastReliableEvents(
    attachmentOverrides: ReadonlyMap<string, SocketAttachment> = new Map(),
  ): void {
    for (const webSocket of this.ctx.getWebSockets()) {
      const serialized = this.readSocketAttachment(webSocket);
      if (serialized === null) continue;
      const attachment = attachmentOverrides.get(serialized.connectionId) ?? serialized;
      if (attachment.playerId === null) continue;
      const pending = this.reliableEvents.pendingAfter(attachment.lastAcknowledgedEventId);
      if (pending !== null && pending.length === 0) continue;
      const reliableResend = pending !== null
        && attachment.lastSentReliableEventId !== attachment.lastAcknowledgedEventId;
      const debt = this.evaluateSnapshotDebt(webSocket, attachment);
      if (debt === null) continue;
      if (debt.action === 'evict') {
        this.evictSnapshotAckDebtor(webSocket, debt.attachment);
        continue;
      }
      if (
        (debt.action === 'coalesce' || debt.action === 'fallback')
        && (pending === null || (reliableResend && !debt.began))
      ) {
        this.transportMetrics.snapshotAckDebtReliableBatchesCoalesced += 1;
        continue;
      }
      if (pending === null) {
        const permit = this.prepareGameplaySend(webSocket, debt.attachment);
        if (permit.kind === 'coalesce') continue;
        if (permit.kind === 'evict') {
          this.disconnectSocket(webSocket, permit.attachment, 1013, 'Slow consumer');
          continue;
        }
        if (permit.kind === 'closed') continue;
        this.transportMetrics.reliableEventHistoryFallbacks += 1;
        if (this.sendFullSnapshot(webSocket, permit.attachment) === null) {
          this.disconnectSocket(webSocket, permit.attachment, 1013, 'Backpressure');
        }
        continue;
      }
      const events = pending.slice(0, PROTOCOL_LIMITS.maxEventsPerBatch);
      const permit = this.prepareGameplaySend(webSocket, debt.attachment);
      if (permit.kind === 'coalesce') continue;
      if (permit.kind === 'evict') {
        this.disconnectSocket(webSocket, permit.attachment, 1013, 'Slow consumer');
        continue;
      }
      if (permit.kind === 'closed') continue;
      if (permit.attachment.lastSentReliableEventId
        !== permit.attachment.lastAcknowledgedEventId) {
        this.transportMetrics.reliableEventResendBatches += 1;
      }
      const sent = safeSocketSend(webSocket, {
        protocolVersion: PROTOCOL_VERSION,
        type: 'reliableEventBatch',
        reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
        matchId: this.requireAuthority().identity.matchId,
        events,
      });
      if (!sent) {
        this.disconnectSocket(webSocket, permit.attachment, 1013, 'Backpressure');
        continue;
      }
      this.writeSocketAttachment(webSocket, Object.freeze({
        ...permit.attachment,
        lastSentReliableEventId: events.at(-1)?.id
          ?? permit.attachment.lastSentReliableEventId,
      }) satisfies SocketAttachment);
      this.transportMetrics.reliableEventBatchesSent += 1;
    }
  }

  private disconnectStaleSockets(): void {
    const now = Date.now();
    for (const webSocket of this.ctx.getWebSockets()) {
      const attachment = this.readSocketAttachment(webSocket);
      if (attachment !== null && isSocketStale(attachment, now)) {
        this.disconnectSocket(webSocket, attachment, 1001, 'Heartbeat timeout');
      }
    }
    const authority = this.requireAuthority();
    const prunedPlayerIds = this.pruneExpiredSessionsAndLobbyCheckpoints(now);
    for (const playerId of prunedPlayerIds) {
      authority.leavePlayer(playerId);
      this.recordPlayerLeft(playerId);
    }
    if (prunedPlayerIds.length > 0) this.persistActiveMatchCheckpoint();
    this.broadcastReliableEvents();
    const metrics = authority.metricsSnapshot();
    if (metrics.players === 0 && metrics.lifecycle === 'idle') {
      this.markRecoveryState(metrics.serverTick === 0 ? 'pristine' : 'expired');
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const webSocket of this.ctx.getWebSockets()) {
      if (!safeSocketSend(webSocket, message)) webSocket.close(1013, 'Backpressure');
    }
  }
}
