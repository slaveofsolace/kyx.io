import { normalizeAuthorityRoomCode } from '../dev/authorityEvidenceModel';
import {
  ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
  ONLINE_INKFALL_REV2_MAP_BINDING,
  type OnlineInkfallRevision2MapBinding,
} from './onlineAuthorityProfiles';

interface RoomCreationPayload {
  readonly ok?: unknown;
  readonly roomCode?: unknown;
  readonly roomProfile?: unknown;
  readonly mapBinding?: unknown;
}

export interface OnlineInkfallRevision2RoomProof {
  readonly roomCode: string;
  readonly roomProfile: typeof ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID;
  readonly mapBinding: OnlineInkfallRevision2MapBinding;
}

export interface OnlineAuthorityFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  readonly json: () => Promise<unknown>;
}

export type OnlineAuthorityFetch = (
  input: string,
  init: Readonly<{ method: 'POST'; headers: Readonly<Record<string, string>> }>,
) => Promise<OnlineAuthorityFetchResponse>;

export const ONLINE_COMBAT_PROFILE_HEADER = 'x-kyx-evidence-profile' as const;
export const ONLINE_COMBAT_PROFILE_ID = 'p58d-rev3-combat-v1' as const;

function matchesExpected(candidate: unknown, expected: unknown): boolean {
  if (candidate === expected) return true;
  if (Array.isArray(expected)) {
    return Array.isArray(candidate)
      && candidate.length === expected.length
      && expected.every((value, index) => matchesExpected(candidate[index], value));
  }
  if (expected === null || typeof expected !== 'object') return false;
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) return false;
  const record = candidate as Readonly<Record<string, unknown>>;
  return Object.entries(expected as Readonly<Record<string, unknown>>).every(
    ([key, value]) => matchesExpected(record[key], value),
  );
}

function roomFromPayload(payload: unknown): string | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const candidate = payload as RoomCreationPayload;
  if (candidate.ok !== true || typeof candidate.roomCode !== 'string') return null;
  return normalizeAuthorityRoomCode(candidate.roomCode);
}

function inkfallRoomFromPayload(
  payload: unknown,
  expectedRoomCode: string | null,
): OnlineInkfallRevision2RoomProof | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const candidate = payload as RoomCreationPayload;
  const roomCode = roomFromPayload(payload);
  if (
    roomCode === null
    || (expectedRoomCode !== null && roomCode !== expectedRoomCode)
    || candidate.roomProfile !== ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID
    || !matchesExpected(candidate.mapBinding, ONLINE_INKFALL_REV2_MAP_BINDING)
  ) return null;
  return Object.freeze({
    roomCode,
    roomProfile: ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
    mapBinding: ONLINE_INKFALL_REV2_MAP_BINDING,
  });
}

async function createRoom(
  authorityOrigin: string,
  headers: Readonly<Record<string, string>>,
  fetchRequest: OnlineAuthorityFetch,
): Promise<string> {
  const endpoint = new URL('/api/rooms/create', authorityOrigin).toString();
  let lastStatus: number | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetchRequest(endpoint, {
      method: 'POST',
      headers,
    });
    lastStatus = response.status;
    if (response.ok) {
      const roomCode = roomFromPayload(await response.json());
      if (roomCode === null) throw new Error('Authority returned an invalid room identity.');
      return roomCode;
    }
    if (response.status < 500 || attempt > 0) break;
  }

  throw new Error(
    lastStatus === null
      ? 'Authority room creation did not return a response.'
      : `Authority room creation failed (HTTP ${lastStatus}).`,
  );
}

export async function createOnlineAuthorityRoom(
  authorityOrigin: string,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<string> {
  return await createRoom(
    authorityOrigin,
    Object.freeze({ Accept: 'application/json' }),
    fetchRequest,
  );
}

/** Explicit opt-in for the pre-release production combat room. */
export async function createOnlineCombatRoom(
  authorityOrigin: string,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<string> {
  return await createRoom(
    authorityOrigin,
    Object.freeze({
      Accept: 'application/json',
      [ONLINE_COMBAT_PROFILE_HEADER]: ONLINE_COMBAT_PROFILE_ID,
    }),
    fetchRequest,
  );
}

async function requestOnlineInkfallRevision2Room(
  endpoint: string,
  expectedRoomCode: string | null,
  operation: 'creation' | 'join verification',
  fetchRequest: OnlineAuthorityFetch,
): Promise<OnlineInkfallRevision2RoomProof> {
  let lastStatus: number | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetchRequest(endpoint, {
      method: 'POST',
      headers: Object.freeze({
        Accept: 'application/json',
        [ONLINE_COMBAT_PROFILE_HEADER]: ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
      }),
    });
    lastStatus = response.status;
    if (response.ok) {
      const room = inkfallRoomFromPayload(await response.json(), expectedRoomCode);
      if (room === null) {
        throw new Error('Authority returned an invalid Inkfall Foundry revision-2 room binding.');
      }
      return room;
    }
    if (response.status < 500 || attempt > 0) break;
  }
  throw new Error(
    lastStatus === null
      ? `Authority Inkfall room ${operation} did not return a response.`
      : `Authority Inkfall room ${operation} failed (HTTP ${lastStatus}).`,
  );
}

/** Explicit opt-in. The default production combat-room request remains unchanged. */
export async function createOnlineInkfallRevision2CombatRoom(
  authorityOrigin: string,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineInkfallRevision2RoomProof> {
  return await requestOnlineInkfallRevision2Room(
    new URL('/api/rooms/create', authorityOrigin).toString(),
    null,
    'creation',
    fetchRequest,
  );
}

/**
 * Verify the profile and complete locked binding before a browser opens the
 * room socket. A missing profile, a flat-run room, or any binding drift fails.
 */
export async function verifyOnlineInkfallRevision2CombatRoom(
  authorityOrigin: string,
  roomCode: string,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineInkfallRevision2RoomProof> {
  const normalized = normalizeAuthorityRoomCode(roomCode);
  if (normalized === null) throw new RangeError('online room code is invalid');
  return await requestOnlineInkfallRevision2Room(
    new URL(`/api/rooms/${normalized}`, authorityOrigin).toString(),
    normalized,
    'join verification',
    fetchRequest,
  );
}
