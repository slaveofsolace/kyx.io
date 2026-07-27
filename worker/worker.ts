import { KyxRoom } from './room';
import {
  INKFALL_REVISION_2_WORKER_MAP_BINDING,
  INTERNAL_ROOM_PROFILE_HEADER,
  P511_INKFALL_REV2_COMBAT_PROFILE,
  P58D_COMBAT_PROFILE_HEADER,
  isOptInWorkerRoomProfile,
} from './combatRuntime';
import type { KyxAuthorityEnv } from './env';
import { parseRoomRoute } from './routes';
import { isAllowedOrigin } from './security';

export { KyxRoom };

const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CORS_ALLOWED_METHODS = Object.freeze(['GET', 'POST'] as const);
const CORS_ALLOWED_HEADERS = Object.freeze([
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

function corsHeaders(origin: string, preflight = false): Headers {
  const headers = new Headers({
    'access-control-allow-origin': origin,
    vary: preflight
      ? 'Origin, Access-Control-Request-Method, Access-Control-Request-Headers'
      : 'Origin',
  });
  if (preflight) {
    headers.set('access-control-allow-methods', CORS_ALLOWED_METHODS.join(', '));
    headers.set('access-control-allow-headers', CORS_ALLOWED_HEADERS.join(', '));
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
  const allowedHeaders = new Set<string>(CORS_ALLOWED_HEADERS);
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
        headers: applyApiSecurityHeaders(corsHeaders(requestOrigin, true)),
      });
    }

    if (url.pathname === '/api/rooms/create' && request.method === 'POST') {
      const requestedProfile = request.headers.get(P58D_COMBAT_PROFILE_HEADER);
      if (requestedProfile !== null && !isOptInWorkerRoomProfile(requestedProfile)) {
        return json({ ok: false, code: 'ROOM_PROFILE_UNSUPPORTED' }, 400, cors);
      }
      const roomCode = secureRoomCode();
      const roomUrl = new URL(`/api/rooms/${roomCode}`, url);
      let initialized: Response;
      try {
        initialized = await roomStub(env, roomCode).fetch(new Request(roomUrl, {
          method: 'POST',
          headers: requestedProfile === null
            ? undefined
            : { [INTERNAL_ROOM_PROFILE_HEADER]: requestedProfile },
        }));
      } catch {
        return json({ ok: false, code: 'ROOM_INITIALIZATION_FAILED' }, 503, cors);
      }
      if (!initialized.ok) {
        return json({ ok: false, code: 'ROOM_INITIALIZATION_FAILED' }, 503, cors);
      }
      return json({
        ok: true,
        roomCode,
        roomPath: `/api/rooms/${roomCode}`,
        socketPath: `/api/rooms/${roomCode}/socket`,
        metricsPath: `/api/rooms/${roomCode}/metrics`,
        ...(requestedProfile === null
          ? {}
          : { roomProfile: requestedProfile }),
        ...(requestedProfile === P511_INKFALL_REV2_COMBAT_PROFILE
          ? { mapBinding: INKFALL_REVISION_2_WORKER_MAP_BINDING }
          : {}),
      }, 201, cors);
    }

    const route = parseRoomRoute(url.pathname);
    if (route === null) return json({ ok: false, code: 'NOT_FOUND' }, 404, cors);
    let roomRequest = request;
    if (route.resource === 'room' && request.method === 'POST') {
      const requestedProfile = request.headers.get(P58D_COMBAT_PROFILE_HEADER);
      if (requestedProfile !== null && !isOptInWorkerRoomProfile(requestedProfile)) {
        return json({ ok: false, code: 'ROOM_PROFILE_UNSUPPORTED' }, 400, cors);
      }
      const headers = new Headers(request.headers);
      headers.delete(INTERNAL_ROOM_PROFILE_HEADER);
      if (requestedProfile !== null) {
        headers.set(INTERNAL_ROOM_PROFILE_HEADER, requestedProfile);
      }
      roomRequest = new Request(request, { headers });
    }
    try {
      return withCors(await roomStub(env, route.roomCode).fetch(roomRequest), requestOrigin);
    } catch {
      return json({ ok: false, code: 'ROOM_UNAVAILABLE' }, 503, cors);
    }
  },
} satisfies ExportedHandler<KyxAuthorityEnv>;
