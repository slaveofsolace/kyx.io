import { PROTOCOL_LIMITS } from '../net';
import { normalizeAuthorityRoomCode } from '../dev/authorityEvidenceModel';
import {
  ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID,
  ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
  isOnlineAuthorityProfileSelection,
  type OnlineAuthorityProfileSelection,
} from './onlineAuthorityProfiles';

export const ONLINE_AUTHORITY_PATH = '/online' as const;

export type OnlineAuthorityAvailability =
  | Readonly<{ kind: 'configured'; origin: string }>
  | Readonly<{ kind: 'unconfigured' }>
  | Readonly<{ kind: 'invalid'; reason: string }>;

export type OnlineAuthorityRequest =
  | Readonly<{ kind: 'landing' }>
  | Readonly<{ kind: 'landing'; profile: OnlineAuthorityProfileSelection }>
  | Readonly<{ kind: 'create' }>
  | Readonly<{ kind: 'create'; profile: OnlineAuthorityProfileSelection }>
  | Readonly<{ kind: 'join'; roomCode: string }>
  | Readonly<{
      kind: 'join';
      roomCode: string;
      profile: OnlineAuthorityProfileSelection;
    }>
  | Readonly<{ kind: 'invalid'; reason: string }>;

export interface OnlineAuthorityEnvironment {
  readonly isDevelopment: boolean;
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '[::1]';
}

export function resolveOnlineAuthorityAvailability(
  rawOrigin: string | undefined,
  environment: OnlineAuthorityEnvironment,
): OnlineAuthorityAvailability {
  const candidate = rawOrigin?.trim() ?? '';
  if (candidate.length === 0) return Object.freeze({ kind: 'unconfigured' });

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return Object.freeze({
      kind: 'invalid',
      reason: 'The authority endpoint must be an absolute HTTPS origin.',
    });
  }

  if (
    url.username.length > 0
    || url.password.length > 0
    || url.pathname !== '/'
    || url.search.length > 0
    || url.hash.length > 0
  ) {
    return Object.freeze({
      kind: 'invalid',
      reason: 'The authority endpoint must contain only a scheme and host.',
    });
  }

  const secure = url.protocol === 'https:';
  const localDevelopment = environment.isDevelopment
    && url.protocol === 'http:'
    && isLoopbackHostname(url.hostname);
  if (!secure && !localDevelopment) {
    return Object.freeze({
      kind: 'invalid',
      reason: 'Online authority requires HTTPS; HTTP is limited to a loopback development server.',
    });
  }

  return Object.freeze({ kind: 'configured', origin: url.origin });
}

function uniqueParameter(parameters: URLSearchParams, name: string): string | null | undefined {
  const values = parameters.getAll(name);
  return values.length > 1 ? undefined : values[0] ?? null;
}

export function parseOnlineAuthorityRequest(search: string): OnlineAuthorityRequest {
  const parameters = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const allowed = new Set(['mode', 'room', 'profile']);
  for (const name of parameters.keys()) {
    if (!allowed.has(name)) {
      return Object.freeze({ kind: 'invalid', reason: `Unsupported online option: ${name}` });
    }
  }

  const mode = uniqueParameter(parameters, 'mode');
  const rawRoom = uniqueParameter(parameters, 'room');
  const rawProfile = uniqueParameter(parameters, 'profile');
  if (mode === undefined || rawRoom === undefined || rawProfile === undefined) {
    return Object.freeze({ kind: 'invalid', reason: 'Online options must not be repeated.' });
  }
  if (rawProfile !== null && !isOnlineAuthorityProfileSelection(rawProfile)) {
    return Object.freeze({ kind: 'invalid', reason: 'The requested online room profile is unavailable.' });
  }
  const profile = rawProfile === null ? null : rawProfile;
  if (mode === null && rawRoom === null) {
    return profile === null
      ? Object.freeze({ kind: 'landing' })
      : Object.freeze({ kind: 'landing', profile });
  }
  if (mode === 'create' && rawRoom === null) {
    return profile === null
      ? Object.freeze({ kind: 'create' })
      : Object.freeze({ kind: 'create', profile });
  }
  if (mode !== 'join') {
    return Object.freeze({ kind: 'invalid', reason: 'Choose create or join from the online lobby.' });
  }
  if (rawRoom === null) {
    return Object.freeze({ kind: 'invalid', reason: 'Joining requires a room code.' });
  }

  const roomCode = normalizeAuthorityRoomCode(rawRoom);
  if (roomCode === null) {
    return Object.freeze({
      kind: 'invalid',
      reason: 'Room codes use KYX- followed by six letters or digits.',
    });
  }
  return profile === null
    ? Object.freeze({ kind: 'join', roomCode })
    : Object.freeze({ kind: 'join', roomCode, profile });
}

export function onlineCreatePath(profile?: OnlineAuthorityProfileSelection): string {
  const parameters = new URLSearchParams({ mode: 'create' });
  if (profile !== undefined) parameters.set('profile', profile);
  return `${ONLINE_AUTHORITY_PATH}?${parameters.toString()}`;
}

export function onlineJoinPath(
  roomCode: string,
  profile?: OnlineAuthorityProfileSelection,
): string {
  const normalized = normalizeAuthorityRoomCode(roomCode);
  if (normalized === null) throw new RangeError('online room code is invalid');
  const parameters = new URLSearchParams({ mode: 'join', room: normalized });
  if (profile !== undefined) parameters.set('profile', profile);
  return `${ONLINE_AUTHORITY_PATH}?${parameters.toString()}`;
}

export function inkfallOnlineProfile(): OnlineAuthorityProfileSelection {
  return ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID;
}

/** Product default. Historical Foundry profiles require an explicit link. */
export function defaultOnlineProfile(): OnlineAuthorityProfileSelection {
  return ONLINE_RELAY_REV1_COMBAT_PROFILE_ID;
}

export function protocolDisplayName(value: string): string {
  const normalized = value.trim() || 'Recruit';
  const encoder = new TextEncoder();
  if (encoder.encode(normalized).byteLength <= PROTOCOL_LIMITS.maxDisplayNameBytes) {
    return normalized;
  }
  const codePoints = [...normalized];
  while (codePoints.length > 0) {
    codePoints.pop();
    const candidate = codePoints.join('').trimEnd();
    if (candidate.length > 0 && encoder.encode(candidate).byteLength <= PROTOCOL_LIMITS.maxDisplayNameBytes) {
      return candidate;
    }
  }
  return 'Recruit';
}
