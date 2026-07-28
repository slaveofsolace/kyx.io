import { KyxRoom } from './room';
import {
  ALLOCATION_GUARD_NAME,
  INTERNAL_SOCKET_ALLOCATION_LEASE_HEADER,
  KyxAllocationGuard,
} from './allocationGuard';
import {
  INTERNAL_ROOM_PROFILE_HEADER,
  P58D_COMBAT_PROFILE_HEADER,
  inkfallWorkerMapBinding,
  isInkfallWorkerRoomProfile,
  isOptInWorkerRoomProfile,
} from './combatRuntime';
import type { KyxAuthorityEnv } from './env';
import {
  INTERNAL_METRICS_ACCESS_DIGEST_HEADER,
  INTERNAL_METRICS_ACCESS_EXPIRY_HEADER,
  METRICS_ACCESS_CREDENTIAL_HEADER,
  issueMetricsAccessCredential,
  type IssuedMetricsAccessCredential,
} from './metricsAccess';
import { parseRoomRoute } from './routes';
import { isAllowedOrigin } from './security';

export { KyxRoom };
export { KyxAllocationGuard };

const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CORS_ALLOWED_METHODS = Object.freeze(['GET', 'POST'] as const);
const CORS_ROOM_ALLOWED_HEADERS = Object.freeze([
  'content-type',
  P58D_COMBAT_PROFILE_HEADER,
] as const);
const API_CONTENT_SECURITY_POLICY =
  "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const API_PERMISSIONS_POLICY =
  'accelerometer=(), ambient-light-sensor=(), camera=(), geolocation=(), ' +
  'gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()';

function applyApiSecurityHeaders(headers: Headers): Headers {
  headers.set('cache-control', 'no-store');
  headers.set('content-security-policy', API_CONTENT_SECURITY_POLICY);
  headers.set('cross-origin-opener-policy', 'same-origin');
  headers.set('cross-origin-resource-policy', 'same-origin');
  headers.set('permissions-policy', API_PERMISSIONS_POLICY);
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  return headers;
}

function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = applyApiSecurityHeaders(new Headers(extraHeaders));
  return Response.json(data, {
    status,
    headers,
  });
}

function corsAllowedHeaders(pathname: string): readonly string[] {
  const route = parseRoomRoute(pathname);
  if (route?.resource === 'metrics') {
    return Object.freeze([METRICS_ACCESS_CREDENTIAL_HEADER]);
  }
  return CORS_ROOM_ALLOWED_HEADERS;
}

function corsHeaders(origin: string, preflight = false, pathname = ''): Headers {
  const headers = new Headers({
    'access-control-allow-origin': origin,
    vary: preflight
      ? 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'
      : 'Origin',
  });
  if (preflight) {
    headers.set('access-control-allow-methods', CORS_ALLOWED_METHODS.join(', '));
    headers.set('access-control-allow-headers', corsAllowedHeaders(pathname).join(', '));
    headers.set('access-control-max-age', '600');
  }
  return headers;
}

function requestedCorsHeaders(request: Request): readonly string[] {
  return Object.freeze((request.headers.get('Access-Control-Request-Headers') ?? '')
    .split(',')
    .map((header) => header.trim().toLowerCase())
    .filter((header) => header.length > 0));
}

function allowedPreflight(request: Request, pathname: string): boolean {
  if (pathname !== '/api/rooms/create' && parseRoomRoute(pathname) === null) return false;
  const method = request.headers.get('Access-Control-Request-Method')?.toUpperCase();
  if (method === undefined || !(CORS_ALLOWED_METHODS as readonly string[]).includes(method)) {
    return false;
  }
  const allowedHeaders = new Set<string>(corsAllowedHeaders(pathname));
  return requestedCorsHeaders(request).every((header) => allowedHeaders.has(header));
}

function withCors(response: Response, origin: string): Response {
  if (response.status === 101) return response;
  const headers = applyApiSecurityHeaders(new Headers(response.headers));
  headers.set('access-control-allow-origin', origin);
  const vary = new Set((headers.get('vary') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0));
  vary.add('Origin');
  headers.set('vary', [...vary].join(', '));
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function secureRoomCode(): string {
  const values = new Uint32Array(6);
  crypto.getRandomValues(values);
  return `KYX-${[...values].map((value) => ROOM_ALPHABET[value % ROOM_ALPHABET.length]).join('')}`;
}

function roomStub(env: KyxAuthorityEnv, roomCode: string): DurableObjectStub {
  return env.KYX_ROOM.getByName(roomCode);
}

interface AcceptedRoomReservation {
  readonly ok: true;
  readonly newlyReserved: boolean;
  readonly expiresAt: number;
}

interface AcceptedSocketReservation {
  readonly ok: true;
  readonly newlyReserved: true;
  readonly leaseId: string;
  readonly expiresAt: number;
}

interface RejectedAllocationReservation {
  readonly ok: false;
  readonly code: string;
  readonly retryAfterMilliseconds: number;
}

type RoomReservation = AcceptedRoomReservation | RejectedAllocationReservation;
type SocketReservation = AcceptedSocketReservation | RejectedAllocationReservation;

function allocationGuardStub(env: KyxAuthorityEnv): DurableObjectStub {
  return env.KYX_ALLOCATION_GUARD.getByName(ALLOCATION_GUARD_NAME);
}

async function callerAllocationKey(request: Request): Promise<string> {
  const source = (request.headers.get('CF-Connecting-IP') ?? 'unattributed')
    .trim()
    .slice(0, 128);
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`kyx-allocation-v1:${source}`),
  );
  const hex = [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
  return `caller.${hex}`;
}

async function allocationRequest<T>(
  env: KyxAuthorityEnv,
  path: string,
  body: Readonly<Record<string, unknown>>,
): Promise<T | null> {
  try {
    const response = await allocationGuardStub(env).fetch(new Request(
      new URL(path, 'https://kyx-allocation.internal'),
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    ));
    const value = await response.json();
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as T;
  } catch {
    return null;
  }
}

function allocationRejected(
  reservation: RejectedAllocationReservation,
  cors: Headers,
  scope: 'room' | 'socket',
): Response {
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil(reservation.retryAfterMilliseconds / 1_000),
  );
  return json({
    ok: false,
    code: scope === 'room' ? 'ROOM_ALLOCATION_LIMITED' : 'SOCKET_ALLOCATION_LIMITED',
    reason: reservation.code,
    retryAfterSeconds,
  }, 429, new Headers({
    ...Object.fromEntries(cors),
    'retry-after': String(retryAfterSeconds),
  }));
}

async function releaseRoomReservation(
  env: KyxAuthorityEnv,
  roomCode: string,
  callerKey: string,
): Promise<void> {
  await allocationRequest(env, '/v1/rooms/release', { roomCode, callerKey });
}

async function releaseSocketReservation(
  env: KyxAuthorityEnv,
  leaseId: string,
): Promise<void> {
  await allocationRequest(env, '/v1/sockets/release', { leaseId });
}

export default {
  async fetch(request: Request, env: KyxAuthorityEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return json({
        ok: true,
        service: 'kyx-authority',
        buildId: env.BUILD_ID ?? 'local',
        roomBinding: Boolean(env.KYX_ROOM),
      });
    }

    if (!isAllowedOrigin(request, env.ALLOWED_ORIGINS)) {
      return json({ ok: false, code: 'ORIGIN_NOT_ALLOWED' }, 403);
    }
    const requestOrigin = request.headers.get('Origin') as string;
    const cors = corsHeaders(requestOrigin);

    if (request.method === 'OPTIONS') {
      if (!allowedPreflight(request, url.pathname)) {
        return json({ ok: false, code: 'CORS_PREFLIGHT_REJECTED' }, 403);
      }
      return new Response(null, {
        status: 204,
        headers: applyApiSecurityHeaders(corsHeaders(requestOrigin, true, url.pathname)),
      });
    }

    if (url.pathname === '/api/rooms/create' && request.method === 'POST') {
      const requestedProfile = request.headers.get(P58D_COMBAT_PROFILE_HEADER);
      if (requestedProfile !== null && !isOptInWorkerRoomProfile(requestedProfile)) {
        return json({ ok: false, code: 'ROOM_PROFILE_UNSUPPORTED' }, 400, cors);
      }
      const callerKey = await callerAllocationKey(request);
      let roomCode: string | null = null;
      let roomReservation: AcceptedRoomReservation | null = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const candidate = secureRoomCode();
        const reservation = await allocationRequest<RoomReservation>(
          env,
          '/v1/rooms/reserve',
          { roomCode: candidate, callerKey },
        );
        if (reservation === null) {
          return json({ ok: false, code: 'ALLOCATION_GUARD_UNAVAILABLE' }, 503, cors);
        }
        if (!reservation.ok) return allocationRejected(reservation, cors, 'room');
        if (!reservation.newlyReserved) continue;
        roomCode = candidate;
        roomReservation = reservation;
        break;
      }
      if (roomCode === null || roomReservation === null) {
        return json({ ok: false, code: 'ROOM_CODE_RESERVATION_FAILED' }, 503, cors);
      }
      const roomUrl = new URL(`/api/rooms/${roomCode}`, url);
      let metricsAccess: IssuedMetricsAccessCredential;
      let initialized: Response;
      try {
        metricsAccess = await issueMetricsAccessCredential(roomCode);
        const initializationHeaders = new Headers({
          [INTERNAL_METRICS_ACCESS_DIGEST_HEADER]: metricsAccess.credentialDigest,
          [INTERNAL_METRICS_ACCESS_EXPIRY_HEADER]: String(metricsAccess.expiresAt),
        });
        if (requestedProfile !== null) {
          initializationHeaders.set(INTERNAL_ROOM_PROFILE_HEADER, requestedProfile);
        }
        initialized = await roomStub(env, roomCode).fetch(new Request(roomUrl, {
          method: 'POST',
          headers: initializationHeaders,
        }));
      } catch {
        await releaseRoomReservation(env, roomCode, callerKey);
        return json({ ok: false, code: 'ROOM_INITIALIZATION_FAILED' }, 503, cors);
      }
      if (!initialized.ok) {
        await releaseRoomReservation(env, roomCode, callerKey);
        return json({ ok: false, code: 'ROOM_INITIALIZATION_FAILED' }, 503, cors);
      }
      return json({
        ok: true,
        roomCode,
        roomPath: `/api/rooms/${roomCode}`,
        socketPath: `/api/rooms/${roomCode}/socket`,
        metricsPath: `/api/rooms/${roomCode}/metrics`,
        metricsAccess: {
          scheme: metricsAccess.scheme,
          headerName: metricsAccess.headerName,
          credential: metricsAccess.credential,
          expiresAt: metricsAccess.expiresAt,
          ttlMilliseconds: metricsAccess.ttlMilliseconds,
        },
        ...(requestedProfile === null
          ? {}
          : { roomProfile: requestedProfile }),
        ...(isInkfallWorkerRoomProfile(requestedProfile)
          ? { mapBinding: inkfallWorkerMapBinding(requestedProfile) }
          : {}),
      }, 201, cors);
    }

    const route = parseRoomRoute(url.pathname);
    if (route === null) return json({ ok: false, code: 'NOT_FOUND' }, 404, cors);
    if (
      route.resource === 'socket'
      && request.headers.get('Upgrade')?.toLowerCase() !== 'websocket'
    ) {
      return json({ ok: false, code: 'WEBSOCKET_UPGRADE_REQUIRED' }, 426, cors);
    }
    const requestedProfile = route.resource === 'room' && request.method === 'POST'
      ? request.headers.get(P58D_COMBAT_PROFILE_HEADER)
      : null;
    if (requestedProfile !== null && !isOptInWorkerRoomProfile(requestedProfile)) {
      return json({ ok: false, code: 'ROOM_PROFILE_UNSUPPORTED' }, 400, cors);
    }
    const callerKey = await callerAllocationKey(request);
    const roomReservation = await allocationRequest<RoomReservation>(
      env,
      '/v1/rooms/reserve',
      { roomCode: route.roomCode, callerKey },
    );
    if (roomReservation === null) {
      return json({ ok: false, code: 'ALLOCATION_GUARD_UNAVAILABLE' }, 503, cors);
    }
    if (!roomReservation.ok) return allocationRejected(roomReservation, cors, 'room');

    let socketReservation: AcceptedSocketReservation | null = null;
    if (route.resource === 'socket') {
      const reservation = await allocationRequest<SocketReservation>(
        env,
        '/v1/sockets/reserve',
        { roomCode: route.roomCode, callerKey },
      );
      if (reservation === null) {
        if (roomReservation.newlyReserved) {
          await releaseRoomReservation(env, route.roomCode, callerKey);
        }
        return json({ ok: false, code: 'ALLOCATION_GUARD_UNAVAILABLE' }, 503, cors);
      }
      if (!reservation.ok) {
        if (roomReservation.newlyReserved) {
          await releaseRoomReservation(env, route.roomCode, callerKey);
        }
        return allocationRejected(reservation, cors, 'socket');
      }
      socketReservation = reservation;
    }

    const headers = new Headers(request.headers);
    headers.delete(INTERNAL_ROOM_PROFILE_HEADER);
    headers.delete(INTERNAL_SOCKET_ALLOCATION_LEASE_HEADER);
    headers.delete(INTERNAL_METRICS_ACCESS_DIGEST_HEADER);
    headers.delete(INTERNAL_METRICS_ACCESS_EXPIRY_HEADER);
    if (route.resource === 'room' && request.method === 'POST') {
      if (requestedProfile !== null) {
        headers.set(INTERNAL_ROOM_PROFILE_HEADER, requestedProfile);
      }
    }
    if (socketReservation !== null) {
      headers.set(INTERNAL_SOCKET_ALLOCATION_LEASE_HEADER, socketReservation.leaseId);
    }
    const roomRequest = new Request(request, { headers });
    try {
      const response = await roomStub(env, route.roomCode).fetch(roomRequest);
      if (socketReservation !== null && response.status !== 101) {
        await releaseSocketReservation(env, socketReservation.leaseId);
      }
      if (response.status !== 101 && !response.ok && roomReservation.newlyReserved) {
        await releaseRoomReservation(env, route.roomCode, callerKey);
      }
      return withCors(response, requestOrigin);
    } catch {
      if (socketReservation !== null) {
        await releaseSocketReservation(env, socketReservation.leaseId);
      }
      if (roomReservation.newlyReserved) {
        await releaseRoomReservation(env, route.roomCode, callerKey);
      }
      return json({ ok: false, code: 'ROOM_UNAVAILABLE' }, 503, cors);
    }
  },
} satisfies ExportedHandler<KyxAuthorityEnv>;
