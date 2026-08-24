import { PROTOCOL_LIMITS } from '../../net/protocol';
import {
  authorityModeDefinition,
  isKyxAuthorityModeId,
  type KyxAuthorityModeId,
} from '../modes';

export const AUTHORITY_SPECTATOR_STATE_SCHEMA_VERSION = 1 as const;

export type AuthoritySpectatorReason = 'voluntary' | 'eliminated' | 'late_join';
export type AuthoritySpectatorLifecycle =
  | 'created'
  | 'lobby'
  | 'warmup'
  | 'active'
  | 'postmatch'
  | 'idle'
  | 'expired';

export interface AuthoritySpectatorTargetV1 {
  readonly playerId: string;
  readonly connected: boolean;
  readonly lifePhase: 'alive' | 'dead' | null;
}

export interface AuthoritySpectatorRecordV1 {
  readonly schemaVersion: typeof AUTHORITY_SPECTATOR_STATE_SCHEMA_VERSION;
  readonly spectatorId: string;
  readonly connectionId: string | null;
  readonly connected: boolean;
  readonly reason: AuthoritySpectatorReason;
  readonly joinedAtTick: number;
  readonly disconnectedAtTick: number | null;
  readonly targetPlayerId: string | null;
  readonly targetRevision: number;
}

export interface AuthoritySpectatorStateV1 {
  readonly schemaVersion: typeof AUTHORITY_SPECTATOR_STATE_SCHEMA_VERSION;
  readonly modeId: KyxAuthorityModeId;
  readonly maximumSpectators: number;
  readonly reconnectGraceTicks: number;
  readonly spectators: readonly AuthoritySpectatorRecordV1[];
}

export interface CreateAuthoritySpectatorStateOptions {
  readonly modeId: KyxAuthorityModeId;
  readonly maximumSpectators?: number;
  readonly reconnectGraceTicks?: number;
}

export interface JoinAuthoritySpectatorOptions {
  readonly spectatorId: string;
  readonly connectionId: string;
  readonly reason: AuthoritySpectatorReason;
  readonly authorityTick: number;
  readonly lifecycle: AuthoritySpectatorLifecycle;
  readonly targets: readonly AuthoritySpectatorTargetV1[];
  readonly preferredTargetPlayerId?: string | null;
}

export interface ResumeAuthoritySpectatorOptions {
  readonly spectatorId: string;
  readonly connectionId: string;
  readonly authorityTick: number;
  readonly targets: readonly AuthoritySpectatorTargetV1[];
}

export interface SelectAuthoritySpectatorTargetOptions {
  readonly spectatorId: string;
  readonly connectionId: string;
  readonly authorityTick: number;
  readonly targetPlayerId: string | null;
  readonly targets: readonly AuthoritySpectatorTargetV1[];
}

export type AuthoritySpectatorRejectionReason =
  | 'room_expired'
  | 'spectator_full'
  | 'duplicate_spectator'
  | 'duplicate_connection'
  | 'spectator_not_found'
  | 'spectator_already_connected'
  | 'resume_expired'
  | 'connection_mismatch'
  | 'target_unavailable'
  | 'reason_incompatible';

export type AuthoritySpectatorMutationResult =
  | Readonly<{
      readonly ok: true;
      readonly state: AuthoritySpectatorStateV1;
      readonly spectator: AuthoritySpectatorRecordV1;
      readonly replayed: boolean;
    }>
  | Readonly<{
      readonly ok: false;
      readonly reason: AuthoritySpectatorRejectionReason;
    }>;

export interface AdvanceAuthoritySpectatorsResult {
  readonly state: AuthoritySpectatorStateV1;
  readonly prunedSpectatorIds: readonly string[];
}

export interface RemoveAuthoritySpectatorResult {
  readonly state: AuthoritySpectatorStateV1;
  readonly removed: boolean;
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function stableId(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || new TextEncoder().encode(value).byteLength < 1
    || new TextEncoder().encode(value).byteLength > PROTOCOL_LIMITS.maxIdBytes
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(value)
  ) {
    throw new RangeError(`${label} must be a stable protocol identifier`);
  }
  return value;
}

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
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

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function frozenState(
  state: Omit<AuthoritySpectatorStateV1, 'spectators'> & {
    readonly spectators: readonly AuthoritySpectatorRecordV1[];
  },
): AuthoritySpectatorStateV1 {
  return Object.freeze({
    ...state,
    spectators: Object.freeze(
      [...state.spectators]
        .sort((left, right) => codeUnitCompare(left.spectatorId, right.spectatorId))
        .map((spectator) => Object.freeze({ ...spectator })),
    ),
  });
}

function eligibleTargets(
  values: readonly AuthoritySpectatorTargetV1[],
): readonly AuthoritySpectatorTargetV1[] {
  const byPlayerId = new Map<string, AuthoritySpectatorTargetV1>();
  for (const value of values) {
    if (value === null || typeof value !== 'object') {
      throw new TypeError('spectator target must be a record');
    }
    const playerId = stableId(value.playerId, 'spectator target player id');
    if (byPlayerId.has(playerId)) throw new RangeError('spectator target player ids must be unique');
    if (typeof value.connected !== 'boolean') {
      throw new TypeError('spectator target connected flag must be boolean');
    }
    if (value.lifePhase !== null && value.lifePhase !== 'alive' && value.lifePhase !== 'dead') {
      throw new RangeError('spectator target life phase is unsupported');
    }
    byPlayerId.set(playerId, Object.freeze({ ...value, playerId }));
  }
  return Object.freeze(
    [...byPlayerId.values()]
      .filter(({ connected, lifePhase }) => connected && lifePhase !== 'dead')
      .sort((left, right) => codeUnitCompare(left.playerId, right.playerId)),
  );
}

function targetFor(
  targets: readonly AuthoritySpectatorTargetV1[],
  requestedTargetPlayerId: string | null | undefined,
): string | null | undefined {
  const eligible = eligibleTargets(targets);
  if (requestedTargetPlayerId === undefined) return eligible[0]?.playerId ?? null;
  if (requestedTargetPlayerId === null) return null;
  const targetPlayerId = stableId(requestedTargetPlayerId, 'spectator target player id');
  return eligible.some(({ playerId }) => playerId === targetPlayerId)
    ? targetPlayerId
    : undefined;
}

function reasonCompatible(
  reason: AuthoritySpectatorReason,
  lifecycle: AuthoritySpectatorLifecycle,
): boolean {
  if (lifecycle === 'expired') return false;
  if (reason === 'voluntary') return lifecycle !== 'created';
  if (reason === 'eliminated') return lifecycle === 'active' || lifecycle === 'postmatch';
  return lifecycle === 'warmup' || lifecycle === 'active';
}

function success(
  state: AuthoritySpectatorStateV1,
  spectator: AuthoritySpectatorRecordV1,
  replayed = false,
): AuthoritySpectatorMutationResult {
  return Object.freeze({ ok: true, state, spectator, replayed });
}

function reject(reason: AuthoritySpectatorRejectionReason): AuthoritySpectatorMutationResult {
  return Object.freeze({ ok: false, reason });
}

export function createAuthoritySpectatorState(
  options: CreateAuthoritySpectatorStateOptions,
): AuthoritySpectatorStateV1 {
  if (options === null || typeof options !== 'object') {
    throw new TypeError('spectator state options are required');
  }
  if (!isKyxAuthorityModeId(options.modeId)) throw new RangeError('spectator mode is unsupported');
  const definition = authorityModeDefinition(options.modeId);
  if (definition.spectatorPolicy !== 'voluntary_and_eliminated') {
    throw new RangeError('spectator policy is unsupported');
  }
  return frozenState({
    schemaVersion: AUTHORITY_SPECTATOR_STATE_SCHEMA_VERSION,
    modeId: options.modeId,
    maximumSpectators: integer(options.maximumSpectators ?? 8, 1, 64, 'maximum spectators'),
    reconnectGraceTicks: integer(
      options.reconnectGraceTicks ?? 200,
      1,
      100_000,
      'spectator reconnect grace ticks',
    ),
    spectators: [],
  });
}

export function joinAuthoritySpectator(
  state: AuthoritySpectatorStateV1,
  options: JoinAuthoritySpectatorOptions,
): AuthoritySpectatorMutationResult {
  const spectatorId = stableId(options.spectatorId, 'spectator id');
  const connectionId = stableId(options.connectionId, 'spectator connection id');
  const authorityTick = integer(options.authorityTick, 0, Number.MAX_SAFE_INTEGER, 'authority tick');
  if (options.lifecycle === 'expired') return reject('room_expired');
  if (!reasonCompatible(options.reason, options.lifecycle)) return reject('reason_incompatible');
  if (state.spectators.some((spectator) => spectator.spectatorId === spectatorId)) {
    return reject('duplicate_spectator');
  }
  if (state.spectators.some((spectator) => spectator.connectionId === connectionId)) {
    return reject('duplicate_connection');
  }
  if (state.spectators.length >= state.maximumSpectators) return reject('spectator_full');
  const targetPlayerId = targetFor(options.targets, options.preferredTargetPlayerId);
  if (targetPlayerId === undefined) return reject('target_unavailable');
  const spectator: AuthoritySpectatorRecordV1 = Object.freeze({
    schemaVersion: AUTHORITY_SPECTATOR_STATE_SCHEMA_VERSION,
    spectatorId,
    connectionId,
    connected: true,
    reason: options.reason,
    joinedAtTick: authorityTick,
    disconnectedAtTick: null,
    targetPlayerId,
    targetRevision: 0,
  });
  return success(frozenState({
    ...state,
    spectators: [...state.spectators, spectator],
  }), spectator);
}

export function resumeAuthoritySpectator(
  state: AuthoritySpectatorStateV1,
  options: ResumeAuthoritySpectatorOptions,
): AuthoritySpectatorMutationResult {
  const spectatorId = stableId(options.spectatorId, 'spectator id');
  const connectionId = stableId(options.connectionId, 'spectator connection id');
  const authorityTick = integer(options.authorityTick, 0, Number.MAX_SAFE_INTEGER, 'authority tick');
  const existing = state.spectators.find((spectator) => spectator.spectatorId === spectatorId);
  if (existing === undefined) return reject('spectator_not_found');
  if (existing.connected) return reject('spectator_already_connected');
  if (state.spectators.some((spectator) => spectator.connectionId === connectionId)) {
    return reject('duplicate_connection');
  }
  if (
    existing.disconnectedAtTick === null
    || authorityTick - existing.disconnectedAtTick > state.reconnectGraceTicks
  ) return reject('resume_expired');
  const available = eligibleTargets(options.targets);
  const retainedTarget = existing.targetPlayerId !== null
    && available.some(({ playerId }) => playerId === existing.targetPlayerId)
    ? existing.targetPlayerId
    : available[0]?.playerId ?? null;
  const spectator: AuthoritySpectatorRecordV1 = Object.freeze({
    ...existing,
    connectionId,
    connected: true,
    disconnectedAtTick: null,
    targetPlayerId: retainedTarget,
    targetRevision: retainedTarget === existing.targetPlayerId
      ? existing.targetRevision
      : existing.targetRevision + 1,
  });
  return success(frozenState({
    ...state,
    spectators: state.spectators.map((item) => (
      item.spectatorId === spectatorId ? spectator : item
    )),
  }), spectator);
}

export function selectAuthoritySpectatorTarget(
  state: AuthoritySpectatorStateV1,
  options: SelectAuthoritySpectatorTargetOptions,
): AuthoritySpectatorMutationResult {
  const spectatorId = stableId(options.spectatorId, 'spectator id');
  const connectionId = stableId(options.connectionId, 'spectator connection id');
  integer(options.authorityTick, 0, Number.MAX_SAFE_INTEGER, 'authority tick');
  const existing = state.spectators.find((spectator) => spectator.spectatorId === spectatorId);
  if (existing === undefined) return reject('spectator_not_found');
  if (!existing.connected || existing.connectionId !== connectionId) {
    return reject('connection_mismatch');
  }
  const targetPlayerId = targetFor(options.targets, options.targetPlayerId);
  if (targetPlayerId === undefined) return reject('target_unavailable');
  if (targetPlayerId === existing.targetPlayerId) return success(state, existing, true);
  const spectator: AuthoritySpectatorRecordV1 = Object.freeze({
    ...existing,
    targetPlayerId,
    targetRevision: existing.targetRevision + 1,
  });
  return success(frozenState({
    ...state,
    spectators: state.spectators.map((item) => (
      item.spectatorId === spectatorId ? spectator : item
    )),
  }), spectator);
}

export function disconnectAuthoritySpectator(
  state: AuthoritySpectatorStateV1,
  connectionIdValue: string,
  authorityTickValue: number,
): AuthoritySpectatorMutationResult {
  const connectionId = stableId(connectionIdValue, 'spectator connection id');
  const authorityTick = integer(authorityTickValue, 0, Number.MAX_SAFE_INTEGER, 'authority tick');
  const existing = state.spectators.find((spectator) => spectator.connectionId === connectionId);
  if (existing === undefined) return reject('spectator_not_found');
  const spectator: AuthoritySpectatorRecordV1 = Object.freeze({
    ...existing,
    connectionId: null,
    connected: false,
    disconnectedAtTick: authorityTick,
  });
  return success(frozenState({
    ...state,
    spectators: state.spectators.map((item) => (
      item.spectatorId === spectator.spectatorId ? spectator : item
    )),
  }), spectator);
}

/** Removes a server-expired credential without trusting a client disconnect tick. */
export function removeAuthoritySpectator(
  state: AuthoritySpectatorStateV1,
  spectatorIdValue: string,
): RemoveAuthoritySpectatorResult {
  const spectatorId = stableId(spectatorIdValue, 'spectator id');
  if (!state.spectators.some((spectator) => spectator.spectatorId === spectatorId)) {
    return Object.freeze({ state, removed: false });
  }
  return Object.freeze({
    state: frozenState({
      ...state,
      spectators: state.spectators.filter((spectator) => spectator.spectatorId !== spectatorId),
    }),
    removed: true,
  });
}

export function advanceAuthoritySpectators(
  state: AuthoritySpectatorStateV1,
  authorityTickValue: number,
  targets: readonly AuthoritySpectatorTargetV1[],
): AdvanceAuthoritySpectatorsResult {
  const authorityTick = integer(authorityTickValue, 0, Number.MAX_SAFE_INTEGER, 'authority tick');
  const available = eligibleTargets(targets);
  const retained: AuthoritySpectatorRecordV1[] = [];
  const prunedSpectatorIds: string[] = [];
  for (const spectator of state.spectators) {
    if (
      !spectator.connected
      && spectator.disconnectedAtTick !== null
      && authorityTick - spectator.disconnectedAtTick > state.reconnectGraceTicks
    ) {
      prunedSpectatorIds.push(spectator.spectatorId);
      continue;
    }
    const targetAvailable = spectator.targetPlayerId !== null
      && available.some(({ playerId }) => playerId === spectator.targetPlayerId);
    const targetPlayerId = targetAvailable
      ? spectator.targetPlayerId
      : available[0]?.playerId ?? null;
    retained.push(Object.freeze({
      ...spectator,
      targetPlayerId,
      targetRevision: targetPlayerId === spectator.targetPlayerId
        ? spectator.targetRevision
        : spectator.targetRevision + 1,
    }));
  }
  return Object.freeze({
    state: frozenState({ ...state, spectators: retained }),
    prunedSpectatorIds: Object.freeze(prunedSpectatorIds.sort(codeUnitCompare)),
  });
}

export function restoreAuthoritySpectatorState(
  value: unknown,
  authorityTickValue: number,
): AuthoritySpectatorStateV1 {
  const authorityTick = integer(authorityTickValue, 0, Number.MAX_SAFE_INTEGER, 'authority tick');
  const root = exactRecord(value, [
    'schemaVersion',
    'modeId',
    'maximumSpectators',
    'reconnectGraceTicks',
    'spectators',
  ], 'authority spectator checkpoint');
  if (root.schemaVersion !== AUTHORITY_SPECTATOR_STATE_SCHEMA_VERSION) {
    throw new RangeError('authority spectator checkpoint schema is unsupported');
  }
  if (!isKyxAuthorityModeId(root.modeId)) {
    throw new RangeError('authority spectator checkpoint mode is unsupported');
  }
  const maximumSpectators = integer(root.maximumSpectators, 1, 64, 'maximum spectators');
  const reconnectGraceTicks = integer(
    root.reconnectGraceTicks,
    1,
    100_000,
    'spectator reconnect grace ticks',
  );
  if (!Array.isArray(root.spectators) || root.spectators.length > maximumSpectators) {
    throw new RangeError('authority spectator checkpoint count is invalid');
  }
  const spectatorIds = new Set<string>();
  const connectionIds = new Set<string>();
  const spectators = root.spectators.map((item, index) => {
    const record = exactRecord(item, [
      'schemaVersion',
      'spectatorId',
      'connectionId',
      'connected',
      'reason',
      'joinedAtTick',
      'disconnectedAtTick',
      'targetPlayerId',
      'targetRevision',
    ], `authority spectator checkpoint item ${index}`);
    if (record.schemaVersion !== AUTHORITY_SPECTATOR_STATE_SCHEMA_VERSION) {
      throw new RangeError('authority spectator record schema is unsupported');
    }
    const spectatorId = stableId(record.spectatorId, 'checkpoint spectator id');
    if (spectatorIds.has(spectatorId)) throw new RangeError('checkpoint spectator ids must be unique');
    spectatorIds.add(spectatorId);
    if (record.reason !== 'voluntary' && record.reason !== 'eliminated' && record.reason !== 'late_join') {
      throw new RangeError('checkpoint spectator reason is unsupported');
    }
    if (typeof record.connected !== 'boolean') {
      throw new TypeError('checkpoint spectator connected flag must be boolean');
    }
    const joinedAtTick = integer(record.joinedAtTick, 0, authorityTick, 'checkpoint spectator join tick');
    const targetPlayerId = record.targetPlayerId === null
      ? null
      : stableId(record.targetPlayerId, 'checkpoint spectator target player id');
    const targetRevision = integer(
      record.targetRevision,
      0,
      Number.MAX_SAFE_INTEGER,
      'checkpoint spectator target revision',
    );
    let connectionId: string | null;
    let disconnectedAtTick: number | null;
    if (record.connected) {
      connectionId = stableId(record.connectionId, 'checkpoint spectator connection id');
      if (connectionIds.has(connectionId)) {
        throw new RangeError('checkpoint spectator connection ids must be unique');
      }
      connectionIds.add(connectionId);
      if (record.disconnectedAtTick !== null) {
        throw new RangeError('connected checkpoint spectator retains a disconnect tick');
      }
      disconnectedAtTick = null;
    } else {
      if (record.connectionId !== null) {
        throw new RangeError('disconnected checkpoint spectator retains a connection');
      }
      connectionId = null;
      disconnectedAtTick = integer(
        record.disconnectedAtTick,
        Math.max(joinedAtTick, authorityTick - reconnectGraceTicks),
        authorityTick,
        'checkpoint spectator disconnect tick',
      );
    }
    return Object.freeze({
      schemaVersion: AUTHORITY_SPECTATOR_STATE_SCHEMA_VERSION,
      spectatorId,
      connectionId,
      connected: record.connected,
      reason: record.reason,
      joinedAtTick,
      disconnectedAtTick,
      targetPlayerId,
      targetRevision,
    } satisfies AuthoritySpectatorRecordV1);
  });
  const sortedIds = [...spectatorIds].sort(codeUnitCompare);
  if (spectators.some(({ spectatorId }, index) => spectatorId !== sortedIds[index])) {
    throw new RangeError('checkpoint spectators must be sorted by id');
  }
  return frozenState({
    schemaVersion: AUTHORITY_SPECTATOR_STATE_SCHEMA_VERSION,
    modeId: root.modeId,
    maximumSpectators,
    reconnectGraceTicks,
    spectators,
  });
}
