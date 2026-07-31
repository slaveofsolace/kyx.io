import { PROTOCOL_LIMITS } from '../src/net';

import transportLimits from './transport-limits.json';

export const ROOM_CODE_PATTERN = /^KYX-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/u;
/**
 * A legal fixed-20 Hz client emits 200 input batches and acknowledges up to
 * 100 ten-Hz snapshots per ten-second window. Keep bounded headroom for
 * reliable-event ACKs, control/ping traffic, and small duplicate bursts.
 */
export const MAX_MESSAGES_PER_RATE_WINDOW = transportLimits.maxMessagesPerRateWindow;
export const MAX_BYTES_PER_RATE_WINDOW = transportLimits.maxBytesPerRateWindow;
export const RATE_WINDOW_MILLISECONDS = transportLimits.rateWindowMilliseconds;
export const MAX_SOCKET_BUFFERED_BYTES = transportLimits.maxSocketBufferedBytes;
/**
 * Once the existing 256 KiB ceiling is crossed, stop adding supersedable
 * gameplay traffic for twenty 20 Hz authority ticks (ten 10 Hz snapshot
 * periods). A socket that drains inside this window resumes from the normal
 * snapshot/reliable-event fallback path; one that does not is evicted.
 */
export const SLOW_CONSUMER_GRACE_MILLISECONDS = transportLimits.slowConsumerGraceMilliseconds;
/**
 * Cloudflare's Durable Object Hibernation WebSocket surface does not expose a
 * portable outbound queue-depth property. Bound runtime delivery with an
 * application-level acknowledgement window as well: one latest snapshot may
 * remain unacknowledged for at most sixty authority ticks / thirty snapshot
 * periods before the socket is evicted. A full recovery snapshot may be retried
 * once per second inside that window.
 */
export const MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS =
  transportLimits.maxSnapshotAckDebtMilliseconds;
export const SNAPSHOT_ACK_FALLBACK_MILLISECONDS = 1_000 as const;
/**
 * Once the ACK-debt ceiling is reached, emit one final full snapshot and give
 * its exact ACK one short event-handler turn to arrive. The final fallback is
 * identified from lastSnapshotSentAt relative to the original debt deadline,
 * so later debt evaluations cannot refresh this grace for a silent client.
 */
export const SNAPSHOT_ACK_EVICTION_GRACE_MILLISECONDS = 250 as const;
export const MAX_SNAPSHOT_SENDS_PER_SECOND = 10 as const;
/**
 * Cover every snapshot that could be sent during the legal ACK-debt window at
 * the protocol's maximum 10 Hz cadence, plus two boundary entries for timer
 * phase and a simultaneous recovery fallback.
 */
export const MAX_RETAINED_SENT_SNAPSHOT_REFERENCES = Math.ceil(
  MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS / 1_000 * MAX_SNAPSHOT_SENDS_PER_SECOND,
) + 2;
export const SOCKET_STALE_MILLISECONDS = 30_000 as const;
export const PRE_JOIN_TIMEOUT_MILLISECONDS = 10_000 as const;
export const FULL_SNAPSHOT_REQUEST_COOLDOWN_MILLISECONDS = 500 as const;

export interface SocketAttachment {
  readonly schemaVersion: 7;
  readonly roomCode: string;
  readonly connectionId: string;
  readonly allocationLeaseId: string | null;
  readonly preJoinExpiresAt: number | null;
  readonly playerId: string | null;
  readonly sessionGeneration: number;
  readonly rateWindowStartedAt: number;
  readonly messagesInRateWindow: number;
  readonly bytesInRateWindow: number;
  readonly lastSeenAt: number;
  readonly lastFullSnapshotRequestAt: number | null;
  readonly lastAcknowledgedSnapshotTick: number | null;
  readonly lastAcknowledgedSnapshotBaselineId: string | null;
  readonly lastSentSnapshotTick: number | null;
  readonly lastSentSnapshotBaselineId: string | null;
  readonly sentSnapshotHistory: readonly SentSnapshotReference[];
  readonly lastSnapshotSentAt: number | null;
  readonly snapshotAckDebtStartedAt: number | null;
  readonly lastAcknowledgedEventId: string | null;
  readonly lastSentReliableEventId: string | null;
  readonly backpressureStartedAt: number | null;
}

export interface SentSnapshotReference {
  readonly serverTick: number;
  readonly snapshotBaselineId: string;
}

export type SocketBackpressureAction = 'send' | 'coalesce' | 'evict';

export interface SocketBackpressureDecision {
  readonly action: SocketBackpressureAction;
  readonly attachment: SocketAttachment;
  readonly began: boolean;
  readonly recovered: boolean;
}

export type SnapshotAckDebtAction = 'none' | 'coalesce' | 'fallback' | 'evict';

export interface SnapshotAckDebtDecision {
  readonly action: SnapshotAckDebtAction;
  readonly attachment: SocketAttachment;
  readonly began: boolean;
  readonly recovered: boolean;
  readonly debtMilliseconds: number;
}

export function normalizeRoomCode(value: string): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return ROOM_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function parseAllowedOrigins(value: string | undefined): ReadonlySet<string> {
  const origins = new Set<string>();
  for (const candidate of (value ?? '').split(',')) {
    const trimmed = candidate.trim();
    if (trimmed.length === 0) continue;
    try {
      const url = new URL(trimmed);
      if ((url.protocol === 'http:' || url.protocol === 'https:') && url.origin === trimmed) {
        origins.add(url.origin);
      }
    } catch {
      // Invalid configuration remains excluded; callers fail closed.
    }
  }
  return origins;
}

export function isAllowedOrigin(request: Request, configuredOrigins: string | undefined): boolean {
  const origin = request.headers.get('Origin');
  if (origin === null) return false;

  let authorityOrigin: string;
  try {
    authorityOrigin = new URL(request.url).origin;
  } catch {
    return false;
  }

  return origin === authorityOrigin || parseAllowedOrigins(configuredOrigins).has(origin);
}

export function isSocketAttachment(value: unknown): value is SocketAttachment {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<SocketAttachment>;
  return record.schemaVersion === 7
    && typeof record.roomCode === 'string'
    && normalizeRoomCode(record.roomCode) === record.roomCode
    && typeof record.connectionId === 'string'
    && record.connectionId.length >= 1
    && record.connectionId.length <= PROTOCOL_LIMITS.maxIdBytes
    && nullableAllocationLeaseId(record.allocationLeaseId)
    && nullableTimestamp(record.preJoinExpiresAt)
    && (record.playerId === null || typeof record.playerId === 'string')
    && (
      (record.playerId === null && record.allocationLeaseId === null)
      || (record.playerId === null && record.preJoinExpiresAt !== null)
      || (
        record.playerId !== null
        && record.allocationLeaseId === null
        && record.preJoinExpiresAt === null
      )
    )
    && typeof record.sessionGeneration === 'number'
    && Number.isSafeInteger(record.sessionGeneration)
    && record.sessionGeneration >= 0
    && typeof record.rateWindowStartedAt === 'number'
    && Number.isFinite(record.rateWindowStartedAt)
    && typeof record.messagesInRateWindow === 'number'
    && Number.isSafeInteger(record.messagesInRateWindow)
    && record.messagesInRateWindow >= 0
    && typeof record.bytesInRateWindow === 'number'
    && Number.isSafeInteger(record.bytesInRateWindow)
    && record.bytesInRateWindow >= 0
    && typeof record.lastSeenAt === 'number'
    && Number.isFinite(record.lastSeenAt)
    && (
      record.lastFullSnapshotRequestAt === null
      || (
        typeof record.lastFullSnapshotRequestAt === 'number'
        && Number.isFinite(record.lastFullSnapshotRequestAt)
        && record.lastFullSnapshotRequestAt >= 0
      )
    )
    && nullableTick(record.lastAcknowledgedSnapshotTick)
    && nullableProtocolId(record.lastAcknowledgedSnapshotBaselineId)
    && nullableTick(record.lastSentSnapshotTick)
    && nullableProtocolId(record.lastSentSnapshotBaselineId)
    && Array.isArray(record.sentSnapshotHistory)
    && record.sentSnapshotHistory.length <= MAX_RETAINED_SENT_SNAPSHOT_REFERENCES
    && record.sentSnapshotHistory.every(isSentSnapshotReference)
    && nullableTimestamp(record.lastSnapshotSentAt)
    && nullableTimestamp(record.snapshotAckDebtStartedAt)
    && nullableProtocolId(record.lastAcknowledgedEventId)
    && nullableProtocolId(record.lastSentReliableEventId)
    && nullableTimestamp(record.backpressureStartedAt);
}

/**
 * Rolling deployments may wake sockets serialized by any of the three prior
 * runtimes. Version 4 lacks snapshot-ACK debt, version 5 lacks the bounded
 * session-local sent-snapshot history, and version 6 predates the global
 * pre-join allocation lease. Prior sockets migrate with a null lease because
 * they were already accepted before this guard existed.
 */
export function normalizeSocketAttachment(value: unknown): SocketAttachment | null {
  if (isSocketAttachment(value)) return value;
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
  ) return null;
  const version = (value as { readonly schemaVersion?: unknown }).schemaVersion;
  let version6: unknown = value;
  if (version !== 6) {
    const version5 = version === 4
      ? { ...value, schemaVersion: 5, snapshotAckDebtStartedAt: null }
      : value;
    if ((version5 as { readonly schemaVersion?: unknown }).schemaVersion !== 5) return null;
    const previous = version5 as {
      readonly lastSentSnapshotTick?: unknown;
      readonly lastSentSnapshotBaselineId?: unknown;
    };
    const sentSnapshotHistory = (
      typeof previous.lastSentSnapshotTick === 'number'
      && Number.isSafeInteger(previous.lastSentSnapshotTick)
      && previous.lastSentSnapshotTick >= 0
      && typeof previous.lastSentSnapshotBaselineId === 'string'
    ) ? [Object.freeze({
        serverTick: previous.lastSentSnapshotTick,
        snapshotBaselineId: previous.lastSentSnapshotBaselineId,
      })] : [];
    version6 = Object.freeze({
      ...version5,
      schemaVersion: 6,
      sentSnapshotHistory: Object.freeze(sentSnapshotHistory),
    });
  }
  if ((version6 as { readonly schemaVersion?: unknown }).schemaVersion !== 6) return null;
  const migrated = Object.freeze({
    ...(version6 as object),
    schemaVersion: 7,
    allocationLeaseId: null,
    preJoinExpiresAt: null,
  });
  return isSocketAttachment(migrated) ? migrated : null;
}

export function rememberSentSnapshot(
  history: readonly SentSnapshotReference[],
  serverTick: number,
  snapshotBaselineId: string,
): readonly SentSnapshotReference[] {
  if (!nullableTick(serverTick) || serverTick === null) {
    throw new RangeError('sent snapshot tick is invalid');
  }
  if (!nullableProtocolId(snapshotBaselineId) || snapshotBaselineId === null) {
    throw new RangeError('sent snapshot baseline id is invalid');
  }
  const next = [
    ...history.filter((entry) => (
      entry.serverTick !== serverTick || entry.snapshotBaselineId !== snapshotBaselineId
    )),
    Object.freeze({ serverTick, snapshotBaselineId }),
  ].slice(-MAX_RETAINED_SENT_SNAPSHOT_REFERENCES);
  return Object.freeze(next);
}

export function applyAcceptedSnapshotAcknowledgement(
  attachment: SocketAttachment,
  acknowledgedTick: number,
  acknowledgedBaselineId: string,
): Readonly<{
  attachment: SocketAttachment;
  acknowledgesLatestSent: boolean;
  advancesAcknowledgement: boolean;
  recoveredDebt: boolean;
}> {
  const acknowledgesLatestSent = acknowledgedTick === attachment.lastSentSnapshotTick
    && acknowledgedBaselineId === attachment.lastSentSnapshotBaselineId;
  const advancesAcknowledgement = attachment.lastAcknowledgedSnapshotTick === null
    || acknowledgedTick > attachment.lastAcknowledgedSnapshotTick;
  const recoveredDebt = advancesAcknowledgement
    && attachment.snapshotAckDebtStartedAt !== null;
  const stillWaitingForNewerSnapshot = advancesAcknowledgement
    && !acknowledgesLatestSent
    && attachment.lastSentSnapshotTick !== null
    && attachment.lastSentSnapshotTick > acknowledgedTick;
  return Object.freeze({
    attachment: advancesAcknowledgement
      ? Object.freeze({
          ...attachment,
          lastAcknowledgedSnapshotTick: acknowledgedTick,
          lastAcknowledgedSnapshotBaselineId: acknowledgedBaselineId,
          snapshotAckDebtStartedAt: stillWaitingForNewerSnapshot
            ? attachment.lastSnapshotSentAt
            : null,
          sentSnapshotHistory: Object.freeze(attachment.sentSnapshotHistory.filter(({ serverTick }) => (
            serverTick > acknowledgedTick
          ))),
        })
      : attachment,
    acknowledgesLatestSent,
    advancesAcknowledgement,
    recoveredDebt,
  });
}

function nullableTick(value: unknown): boolean {
  return value === null || (
    typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value <= PROTOCOL_LIMITS.maxAuthorityTick
  );
}

function nullableProtocolId(value: unknown): boolean {
  return value === null || (
    typeof value === 'string'
    && value.length >= 1
    && new TextEncoder().encode(value).byteLength <= PROTOCOL_LIMITS.maxIdBytes
  );
}

function nullableTimestamp(value: unknown): boolean {
  return value === null || (
    typeof value === 'number'
    && Number.isFinite(value)
    && value >= 0
  );
}

function nullableAllocationLeaseId(value: unknown): boolean {
  return value === null || (
    typeof value === 'string'
    && /^socket\.[a-f0-9]{32}$/u.test(value)
  );
}

function isSentSnapshotReference(value: unknown): value is SentSnapshotReference {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<SentSnapshotReference>;
  return nullableTick(record.serverTick)
    && record.serverTick !== null
    && nullableProtocolId(record.snapshotBaselineId)
    && record.snapshotBaselineId !== null;
}

export function consumeSocketRate(
  attachment: SocketAttachment,
  nowMilliseconds: number,
  messageBytes: number,
): {
  readonly ok: boolean;
  readonly reason: 'message_rate' | 'byte_rate' | null;
  readonly attachment: SocketAttachment;
} {
  if (!Number.isSafeInteger(messageBytes) || messageBytes < 0) {
    throw new RangeError('message byte length must be a non-negative safe integer');
  }
  const reset = nowMilliseconds - attachment.rateWindowStartedAt >= RATE_WINDOW_MILLISECONDS;
  const messages = reset ? 1 : attachment.messagesInRateWindow + 1;
  const bytes = reset ? messageBytes : attachment.bytesInRateWindow + messageBytes;
  const reason = messages > MAX_MESSAGES_PER_RATE_WINDOW
    ? 'message_rate'
    : bytes > MAX_BYTES_PER_RATE_WINDOW
      ? 'byte_rate'
      : null;
  return Object.freeze({
    ok: reason === null,
    reason,
    attachment: Object.freeze({
      ...attachment,
      rateWindowStartedAt: reset ? nowMilliseconds : attachment.rateWindowStartedAt,
      messagesInRateWindow: messages,
      bytesInRateWindow: bytes,
      lastSeenAt: nowMilliseconds,
    }),
  });
}

export function isSocketStale(
  attachment: SocketAttachment,
  nowMilliseconds: number,
): boolean {
  return (
    attachment.playerId === null
    && attachment.preJoinExpiresAt !== null
    && nowMilliseconds >= attachment.preJoinExpiresAt
  ) || nowMilliseconds - attachment.lastSeenAt >= SOCKET_STALE_MILLISECONDS;
}

export function evaluateSocketBackpressure(
  attachment: SocketAttachment,
  bufferedAmount: number,
  nowMilliseconds: number,
): SocketBackpressureDecision {
  if (!Number.isSafeInteger(bufferedAmount) || bufferedAmount < 0) {
    throw new RangeError('socket buffered amount must be a non-negative safe integer');
  }
  if (!Number.isFinite(nowMilliseconds) || nowMilliseconds < 0) {
    throw new RangeError('backpressure observation time must be a non-negative finite number');
  }

  if (bufferedAmount <= MAX_SOCKET_BUFFERED_BYTES) {
    if (attachment.backpressureStartedAt === null) {
      return Object.freeze({ action: 'send', attachment, began: false, recovered: false });
    }
    return Object.freeze({
      action: 'send',
      attachment: Object.freeze({ ...attachment, backpressureStartedAt: null }),
      began: false,
      recovered: true,
    });
  }

  if (attachment.backpressureStartedAt === null) {
    return Object.freeze({
      action: 'coalesce',
      attachment: Object.freeze({ ...attachment, backpressureStartedAt: nowMilliseconds }),
      began: true,
      recovered: false,
    });
  }
  const saturatedForMilliseconds = Math.max(
    0,
    nowMilliseconds - attachment.backpressureStartedAt,
  );
  return Object.freeze({
    action: saturatedForMilliseconds >= SLOW_CONSUMER_GRACE_MILLISECONDS
      ? 'evict'
      : 'coalesce',
    attachment,
    began: false,
    recovered: false,
  });
}

export function evaluateSnapshotAckDebt(
  attachment: SocketAttachment,
  nowMilliseconds: number,
): SnapshotAckDebtDecision {
  if (!Number.isFinite(nowMilliseconds) || nowMilliseconds < 0) {
    throw new RangeError('snapshot ACK observation time must be a non-negative finite number');
  }
  const pending = attachment.lastSentSnapshotBaselineId !== null
    && attachment.lastAcknowledgedSnapshotBaselineId
      !== attachment.lastSentSnapshotBaselineId;
  if (!pending) {
    if (attachment.snapshotAckDebtStartedAt === null) {
      return Object.freeze({
        action: 'none',
        attachment,
        began: false,
        recovered: false,
        debtMilliseconds: 0,
      });
    }
    return Object.freeze({
      action: 'none',
      attachment: Object.freeze({ ...attachment, snapshotAckDebtStartedAt: null }),
      began: false,
      recovered: true,
      debtMilliseconds: 0,
    });
  }

  const began = attachment.snapshotAckDebtStartedAt === null;
  const startedAt = attachment.snapshotAckDebtStartedAt
    ?? attachment.lastSnapshotSentAt
    ?? nowMilliseconds;
  const nextAttachment = began
    ? Object.freeze({ ...attachment, snapshotAckDebtStartedAt: startedAt })
    : attachment;
  const debtMilliseconds = Math.max(0, nowMilliseconds - startedAt);
  const retryDue = attachment.lastSnapshotSentAt !== null
    && nowMilliseconds - attachment.lastSnapshotSentAt
      >= SNAPSHOT_ACK_FALLBACK_MILLISECONDS;
  const debtDeadline = startedAt + MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS;
  const finalFallbackSentAt = attachment.lastSnapshotSentAt !== null
    && attachment.lastSnapshotSentAt >= debtDeadline
    ? attachment.lastSnapshotSentAt
    : null;
  let action: SnapshotAckDebtAction;
  if (debtMilliseconds < MAX_SNAPSHOT_ACK_DEBT_MILLISECONDS) {
    action = retryDue ? 'fallback' : 'coalesce';
  } else if (finalFallbackSentAt === null) {
    // Do not evict in the same turn that crosses the debt ceiling. One final
    // latest snapshot must be emitted first; if the previous retry is too
    // recent, coalesce until it is due without moving the original deadline.
    action = retryDue ? 'fallback' : 'coalesce';
  } else {
    action = nowMilliseconds - finalFallbackSentAt
      >= SNAPSHOT_ACK_EVICTION_GRACE_MILLISECONDS
      ? 'evict'
      : 'coalesce';
  }
  return Object.freeze({
    action,
    attachment: nextAttachment,
    began,
    recovered: false,
    debtMilliseconds,
  });
}
