import { DurableObject } from 'cloudflare:workers';

import type { KyxAuthorityEnv } from './env';
import { normalizeRoomCode } from './security';

export const ALLOCATION_GUARD_NAME = 'kyx-allocation-guard-v1' as const;
export const INTERNAL_SOCKET_ALLOCATION_LEASE_HEADER =
  'x-kyx-socket-allocation-lease' as const;

export const ALLOCATION_LIMITS = Object.freeze({
  roomLeaseMilliseconds: 6 * 60 * 60 * 1_000,
  roomWindowMilliseconds: 5 * 60 * 1_000,
  maximumLiveRooms: 512,
  maximumLiveRoomsPerCaller: 16,
  maximumRoomsPerWindow: 128,
  maximumRoomsPerCallerWindow: 8,
  socketLeaseMilliseconds: 20_000,
  socketWindowMilliseconds: 60_000,
  maximumPreJoinSockets: 128,
  maximumPreJoinSocketsPerCaller: 12,
  maximumSocketAttemptsPerWindow: 512,
  maximumSocketAttemptsPerCallerWindow: 32,
} as const);

const CALLER_KEY_PATTERN = /^caller\.[a-f0-9]{32}$/u;
const SOCKET_LEASE_PATTERN = /^socket\.[a-f0-9]{32}$/u;

interface CountRow {
  readonly [column: string]: string | number | ArrayBuffer | null;
  readonly total: number;
}

interface RoomLeaseRow {
  readonly [column: string]: string | number | ArrayBuffer | null;
  readonly caller_key: string;
}

type ReservationResponse =
  | {
      readonly ok: true;
      readonly newlyReserved: boolean;
      readonly leaseId?: string;
      readonly expiresAt: number;
    }
  | {
      readonly ok: false;
      readonly code:
        | 'GLOBAL_ROOM_LIMIT'
        | 'CALLER_ROOM_LIMIT'
        | 'GLOBAL_ROOM_RATE_LIMIT'
        | 'CALLER_ROOM_RATE_LIMIT'
        | 'GLOBAL_PREJOIN_LIMIT'
        | 'CALLER_PREJOIN_LIMIT'
        | 'GLOBAL_SOCKET_RATE_LIMIT'
        | 'CALLER_SOCKET_RATE_LIMIT';
      readonly retryAfterMilliseconds: number;
    };

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function boundedString(value: unknown, pattern: RegExp): string | null {
  return typeof value === 'string' && pattern.test(value) ? value : null;
}

function count(
  state: DurableObjectState,
  statement: string,
  ...bindings: (string | number)[]
): number {
  return [...state.storage.sql.exec<CountRow>(statement, ...bindings)][0]?.total ?? 0;
}

function retryAfterFromExpiry(
  state: DurableObjectState,
  table: 'allocation_room_leases_v1' | 'allocation_socket_leases_v1',
  now: number,
  callerKey?: string,
): number {
  const rows = callerKey === undefined
    ? [...state.storage.sql.exec<{ expires_at: number }>(
        `SELECT MIN(expires_at) AS expires_at FROM ${table}`,
      )]
    : [...state.storage.sql.exec<{ expires_at: number }>(
        `SELECT MIN(expires_at) AS expires_at FROM ${table} WHERE caller_key = ?`,
        callerKey,
      )];
  const expiresAt = rows[0]?.expires_at;
  return typeof expiresAt === 'number' && Number.isFinite(expiresAt)
    ? Math.max(1_000, expiresAt - now)
    : 1_000;
}

export class KyxAllocationGuard extends DurableObject<KyxAuthorityEnv> {
  private readonly ready: Promise<void>;

  constructor(ctx: DurableObjectState, env: KyxAuthorityEnv) {
    super(ctx, env);
    this.ready = ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS allocation_room_leases_v1 (
          room_code TEXT PRIMARY KEY,
          caller_key TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `);
      ctx.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS allocation_room_leases_caller_v1
        ON allocation_room_leases_v1 (caller_key, expires_at)
      `);
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS allocation_room_events_v1 (
          event_id TEXT PRIMARY KEY,
          caller_key TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
      ctx.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS allocation_room_events_caller_v1
        ON allocation_room_events_v1 (caller_key, created_at)
      `);
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS allocation_socket_leases_v1 (
          lease_id TEXT PRIMARY KEY,
          room_code TEXT NOT NULL,
          caller_key TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL
        )
      `);
      ctx.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS allocation_socket_leases_caller_v1
        ON allocation_socket_leases_v1 (caller_key, expires_at)
      `);
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS allocation_socket_events_v1 (
          event_id TEXT PRIMARY KEY,
          caller_key TEXT NOT NULL,
          created_at INTEGER NOT NULL
        )
      `);
      ctx.storage.sql.exec(`
        CREATE INDEX IF NOT EXISTS allocation_socket_events_caller_v1
        ON allocation_socket_events_v1 (caller_key, created_at)
      `);
    });
  }

  override async fetch(request: Request): Promise<Response> {
    await this.ready;
    if (request.method !== 'POST') {
      return json({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);
    }
    let body: Readonly<Record<string, unknown>>;
    try {
      const value = await request.json();
      if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new TypeError('body');
      }
      body = value as Readonly<Record<string, unknown>>;
    } catch {
      return json({ ok: false, code: 'INVALID_REQUEST' }, 400);
    }
    const path = new URL(request.url).pathname;
    if (path === '/v1/rooms/reserve') return this.reserveRoom(body);
    if (path === '/v1/rooms/release') return this.releaseRoom(body);
    if (path === '/v1/sockets/reserve') return this.reserveSocket(body);
    if (path === '/v1/sockets/release') return this.releaseSocket(body);
    return json({ ok: false, code: 'NOT_FOUND' }, 404);
  }

  private prune(now: number): void {
    this.ctx.storage.sql.exec(
      'DELETE FROM allocation_room_leases_v1 WHERE expires_at <= ?',
      now,
    );
    this.ctx.storage.sql.exec(
      'DELETE FROM allocation_socket_leases_v1 WHERE expires_at <= ?',
      now,
    );
    this.ctx.storage.sql.exec(
      'DELETE FROM allocation_room_events_v1 WHERE created_at <= ?',
      now - ALLOCATION_LIMITS.roomWindowMilliseconds,
    );
    this.ctx.storage.sql.exec(
      'DELETE FROM allocation_socket_events_v1 WHERE created_at <= ?',
      now - ALLOCATION_LIMITS.socketWindowMilliseconds,
    );
  }

  private reserveRoom(body: Readonly<Record<string, unknown>>): Response {
    const roomCode = typeof body.roomCode === 'string'
      ? normalizeRoomCode(body.roomCode)
      : null;
    const callerKey = boundedString(body.callerKey, CALLER_KEY_PATTERN);
    if (roomCode === null || callerKey === null) {
      return json({ ok: false, code: 'INVALID_REQUEST' }, 400);
    }
    const now = Date.now();
    const result = this.ctx.storage.transactionSync((): ReservationResponse => {
      this.prune(now);
      const existing = [...this.ctx.storage.sql.exec<RoomLeaseRow>(
        'SELECT caller_key FROM allocation_room_leases_v1 WHERE room_code = ?',
        roomCode,
      )][0];
      if (existing !== undefined) {
        this.ctx.storage.sql.exec(
          `UPDATE allocation_room_leases_v1
           SET expires_at = MAX(expires_at, ?)
           WHERE room_code = ?`,
          now + ALLOCATION_LIMITS.roomLeaseMilliseconds,
          roomCode,
        );
        return {
          ok: true,
          newlyReserved: false,
          expiresAt: now + ALLOCATION_LIMITS.roomLeaseMilliseconds,
        };
      }
      const liveRooms = count(
        this.ctx,
        'SELECT COUNT(*) AS total FROM allocation_room_leases_v1',
      );
      if (liveRooms >= ALLOCATION_LIMITS.maximumLiveRooms) {
        return {
          ok: false,
          code: 'GLOBAL_ROOM_LIMIT',
          retryAfterMilliseconds: retryAfterFromExpiry(
            this.ctx,
            'allocation_room_leases_v1',
            now,
          ),
        };
      }
      const callerRooms = count(
        this.ctx,
        'SELECT COUNT(*) AS total FROM allocation_room_leases_v1 WHERE caller_key = ?',
        callerKey,
      );
      if (callerRooms >= ALLOCATION_LIMITS.maximumLiveRoomsPerCaller) {
        return {
          ok: false,
          code: 'CALLER_ROOM_LIMIT',
          retryAfterMilliseconds: retryAfterFromExpiry(
            this.ctx,
            'allocation_room_leases_v1',
            now,
            callerKey,
          ),
        };
      }
      const roomEvents = count(
        this.ctx,
        'SELECT COUNT(*) AS total FROM allocation_room_events_v1',
      );
      if (roomEvents >= ALLOCATION_LIMITS.maximumRoomsPerWindow) {
        return {
          ok: false,
          code: 'GLOBAL_ROOM_RATE_LIMIT',
          retryAfterMilliseconds: ALLOCATION_LIMITS.roomWindowMilliseconds,
        };
      }
      const callerEvents = count(
        this.ctx,
        'SELECT COUNT(*) AS total FROM allocation_room_events_v1 WHERE caller_key = ?',
        callerKey,
      );
      if (callerEvents >= ALLOCATION_LIMITS.maximumRoomsPerCallerWindow) {
        return {
          ok: false,
          code: 'CALLER_ROOM_RATE_LIMIT',
          retryAfterMilliseconds: ALLOCATION_LIMITS.roomWindowMilliseconds,
        };
      }
      const expiresAt = now + ALLOCATION_LIMITS.roomLeaseMilliseconds;
      this.ctx.storage.sql.exec(
        `INSERT INTO allocation_room_leases_v1
          (room_code, caller_key, created_at, expires_at)
         VALUES (?, ?, ?, ?)`,
        roomCode,
        callerKey,
        now,
        expiresAt,
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO allocation_room_events_v1 (event_id, caller_key, created_at)
         VALUES (?, ?, ?)`,
        `room.${crypto.randomUUID().replaceAll('-', '')}`,
        callerKey,
        now,
      );
      return { ok: true, newlyReserved: true, expiresAt };
    });
    return json(result, result.ok ? 200 : 429);
  }

  private releaseRoom(body: Readonly<Record<string, unknown>>): Response {
    const roomCode = typeof body.roomCode === 'string'
      ? normalizeRoomCode(body.roomCode)
      : null;
    const callerKey = boundedString(body.callerKey, CALLER_KEY_PATTERN);
    if (roomCode === null || callerKey === null) {
      return json({ ok: false, code: 'INVALID_REQUEST' }, 400);
    }
    this.ctx.storage.sql.exec(
      'DELETE FROM allocation_room_leases_v1 WHERE room_code = ? AND caller_key = ?',
      roomCode,
      callerKey,
    );
    return json({ ok: true });
  }

  private reserveSocket(body: Readonly<Record<string, unknown>>): Response {
    const roomCode = typeof body.roomCode === 'string'
      ? normalizeRoomCode(body.roomCode)
      : null;
    const callerKey = boundedString(body.callerKey, CALLER_KEY_PATTERN);
    if (roomCode === null || callerKey === null) {
      return json({ ok: false, code: 'INVALID_REQUEST' }, 400);
    }
    const now = Date.now();
    const result = this.ctx.storage.transactionSync((): ReservationResponse => {
      this.prune(now);
      const globalPreJoin = count(
        this.ctx,
        'SELECT COUNT(*) AS total FROM allocation_socket_leases_v1',
      );
      if (globalPreJoin >= ALLOCATION_LIMITS.maximumPreJoinSockets) {
        return {
          ok: false,
          code: 'GLOBAL_PREJOIN_LIMIT',
          retryAfterMilliseconds: retryAfterFromExpiry(
            this.ctx,
            'allocation_socket_leases_v1',
            now,
          ),
        };
      }
      const callerPreJoin = count(
        this.ctx,
        'SELECT COUNT(*) AS total FROM allocation_socket_leases_v1 WHERE caller_key = ?',
        callerKey,
      );
      if (callerPreJoin >= ALLOCATION_LIMITS.maximumPreJoinSocketsPerCaller) {
        return {
          ok: false,
          code: 'CALLER_PREJOIN_LIMIT',
          retryAfterMilliseconds: retryAfterFromExpiry(
            this.ctx,
            'allocation_socket_leases_v1',
            now,
            callerKey,
          ),
        };
      }
      const socketEvents = count(
        this.ctx,
        'SELECT COUNT(*) AS total FROM allocation_socket_events_v1',
      );
      if (socketEvents >= ALLOCATION_LIMITS.maximumSocketAttemptsPerWindow) {
        return {
          ok: false,
          code: 'GLOBAL_SOCKET_RATE_LIMIT',
          retryAfterMilliseconds: ALLOCATION_LIMITS.socketWindowMilliseconds,
        };
      }
      const callerEvents = count(
        this.ctx,
        'SELECT COUNT(*) AS total FROM allocation_socket_events_v1 WHERE caller_key = ?',
        callerKey,
      );
      if (callerEvents >= ALLOCATION_LIMITS.maximumSocketAttemptsPerCallerWindow) {
        return {
          ok: false,
          code: 'CALLER_SOCKET_RATE_LIMIT',
          retryAfterMilliseconds: ALLOCATION_LIMITS.socketWindowMilliseconds,
        };
      }
      const leaseId = `socket.${crypto.randomUUID().replaceAll('-', '')}`;
      const expiresAt = now + ALLOCATION_LIMITS.socketLeaseMilliseconds;
      this.ctx.storage.sql.exec(
        `INSERT INTO allocation_socket_leases_v1
          (lease_id, room_code, caller_key, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?)`,
        leaseId,
        roomCode,
        callerKey,
        now,
        expiresAt,
      );
      this.ctx.storage.sql.exec(
        `INSERT INTO allocation_socket_events_v1 (event_id, caller_key, created_at)
         VALUES (?, ?, ?)`,
        `socket_event.${crypto.randomUUID().replaceAll('-', '')}`,
        callerKey,
        now,
      );
      return { ok: true, newlyReserved: true, leaseId, expiresAt };
    });
    return json(result, result.ok ? 200 : 429);
  }

  private releaseSocket(body: Readonly<Record<string, unknown>>): Response {
    const leaseId = boundedString(body.leaseId, SOCKET_LEASE_PATTERN);
    if (leaseId === null) return json({ ok: false, code: 'INVALID_REQUEST' }, 400);
    this.ctx.storage.sql.exec(
      'DELETE FROM allocation_socket_leases_v1 WHERE lease_id = ?',
      leaseId,
    );
    return json({ ok: true });
  }
}
