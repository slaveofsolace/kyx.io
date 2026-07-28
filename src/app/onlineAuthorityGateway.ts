import { normalizeAuthorityRoomCode } from '../dev/authorityEvidenceModel';
import {
  ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
  ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
  onlineInkfallMapBinding,
  type OnlineAuthorityProfileSelection,
  type OnlineInkfallRevision2MapBinding,
  type OnlineInkfallRevision4MapBinding,
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

export interface OnlineInkfallRevision4RoomProof {
  readonly roomCode: string;
  readonly roomProfile: typeof ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID;
  readonly mapBinding: OnlineInkfallRevision4MapBinding;
}

export type OnlineInkfallRoomProof =
  | OnlineInkfallRevision2RoomProof
  | OnlineInkfallRevision4RoomProof;

type OnlineInkfallRoomProofFor<Profile extends OnlineAuthorityProfileSelection> =
  Profile extends typeof ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID
    ? OnlineInkfallRevision4RoomProof
    : OnlineInkfallRevision2RoomProof;

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
  const expectedEntries = Object.entries(expected as Readonly<Record<string, unknown>>);
  if (Object.keys(record).length !== expectedEntries.length) return false;
  return expectedEntries.every(
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
  profile: OnlineAuthorityProfileSelection,
): OnlineInkfallRoomProof | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const candidate = payload as RoomCreationPayload;
  const roomCode = roomFromPayload(payload);
  if (
    roomCode === null
    || (expectedRoomCode !== null && roomCode !== expectedRoomCode)
    || candidate.roomProfile !== profile
    || !matchesExpected(candidate.mapBinding, onlineInkfallMapBinding(profile))
  ) return null;
  return Object.freeze({
    roomCode,
    roomProfile: profile,
    mapBinding: onlineInkfallMapBinding(profile),
  }) as OnlineInkfallRoomProof;
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

async function requestOnlineInkfallRoom<
  Profile extends OnlineAuthorityProfileSelection,
>(
  endpoint: string,
  expectedRoomCode: string | null,
  operation: 'creation' | 'join verification',
  fetchRequest: OnlineAuthorityFetch,
  profile: Profile,
): Promise<OnlineInkfallRoomProofFor<Profile>> {
  let lastStatus: number | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetchRequest(endpoint, {
      method: 'POST',
      headers: Object.freeze({
        Accept: 'application/json',
        [ONLINE_COMBAT_PROFILE_HEADER]: profile,
      }),
    });
    lastStatus = response.status;
    if (response.ok) {
      const room = inkfallRoomFromPayload(await response.json(), expectedRoomCode, profile);
      if (room === null) {
        throw new Error(
          profile === ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID
            ? 'Authority returned an invalid Inkfall Foundry revision-2 room binding.'
            : `Authority returned an invalid Inkfall Foundry room binding for ${profile}.`,
        );
      }
      return room as OnlineInkfallRoomProofFor<Profile>;
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
  return await requestOnlineInkfallRoom(
    new URL('/api/rooms/create', authorityOrigin).toString(),
    null,
    'creation',
    fetchRequest,
    ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
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
  return await requestOnlineInkfallRoom(
    new URL(`/api/rooms/${normalized}`, authorityOrigin).toString(),
    normalized,
    'join verification',
    fetchRequest,
    ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
  );
}

export async function createOnlineInkfallRevision4CombatRoom(
  authorityOrigin: string,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineInkfallRevision4RoomProof> {
  return await requestOnlineInkfallRoom(
    new URL('/api/rooms/create', authorityOrigin).toString(),
    null,
    'creation',
    fetchRequest,
    ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
  );
}

export async function verifyOnlineInkfallRevision4CombatRoom(
  authorityOrigin: string,
  roomCode: string,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineInkfallRevision4RoomProof> {
  const normalized = normalizeAuthorityRoomCode(roomCode);
  if (normalized === null) throw new RangeError('online room code is invalid');
  return await requestOnlineInkfallRoom(
    new URL(`/api/rooms/${normalized}`, authorityOrigin).toString(),
    normalized,
    'join verification',
    fetchRequest,
    ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
  );
}

export async function createOnlineInkfallCombatRoom(
  authorityOrigin: string,
  profile: OnlineAuthorityProfileSelection,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineInkfallRoomProof> {
  return profile === ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID
    ? createOnlineInkfallRevision4CombatRoom(authorityOrigin, fetchRequest)
    : createOnlineInkfallRevision2CombatRoom(authorityOrigin, fetchRequest);
}

export async function verifyOnlineInkfallCombatRoom(
  authorityOrigin: string,
  roomCode: string,
  profile: OnlineAuthorityProfileSelection,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineInkfallRoomProof> {
  return profile === ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID
    ? verifyOnlineInkfallRevision4CombatRoom(authorityOrigin, roomCode, fetchRequest)
    : verifyOnlineInkfallRevision2CombatRoom(authorityOrigin, roomCode, fetchRequest);
}
