import { normalizeAuthorityRoomCode } from '../dev/authorityEvidenceModel';
import {
  ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
  ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
  ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID,
  ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
  onlineAuthorityMapBinding,
  type OnlineAuthorityProfileSelection,
  type OnlineInkfallProfileSelection,
  type OnlineInkfallRevision2MapBinding,
  type OnlineInkfallRevision4MapBinding,
  type OnlineInkfallRevision5MapBinding,
  type OnlineOriginalArenaMapBinding,
  type OnlineOriginalArenaProfileSelection,
  type OnlineRelayMapBinding,
} from './onlineAuthorityProfiles';
import type { OnlineAuthorityMatchMode } from './onlineAuthorityModes';

interface RoomCreationPayload {
  readonly ok?: unknown;
  readonly roomCode?: unknown;
  readonly roomProfile?: unknown;
  readonly matchMode?: unknown;
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

export interface OnlineInkfallRevision5RoomProof {
  readonly roomCode: string;
  readonly roomProfile: typeof ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID;
  readonly mapBinding: OnlineInkfallRevision5MapBinding;
}

export interface OnlineRelayRoomProof {
  readonly roomCode: string;
  readonly roomProfile: typeof ONLINE_RELAY_REV1_COMBAT_PROFILE_ID;
  readonly mapBinding: OnlineRelayMapBinding;
}

export interface OnlineOriginalArenaRoomProof {
  readonly roomCode: string;
  readonly roomProfile: OnlineOriginalArenaProfileSelection;
  readonly mapBinding: OnlineOriginalArenaMapBinding;
}

export type OnlineInkfallRoomProof =
  | OnlineInkfallRevision2RoomProof
  | OnlineInkfallRevision4RoomProof
  | OnlineInkfallRevision5RoomProof;

export type OnlineAuthorityMapRoomProof =
  | OnlineInkfallRoomProof
  | OnlineOriginalArenaRoomProof
  | OnlineRelayRoomProof;

export type OnlineAuthorityModeMapRoomProof = OnlineAuthorityMapRoomProof & Readonly<{
  matchMode: OnlineAuthorityMatchMode;
}>;

type OnlineInkfallRoomProofFor<Profile extends OnlineAuthorityProfileSelection> =
  Profile extends typeof ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID
    ? OnlineInkfallRevision5RoomProof
    : Profile extends typeof ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID
      ? OnlineInkfallRevision4RoomProof
      : OnlineInkfallRevision2RoomProof;

type OnlineAuthorityMapRoomProofFor<Profile extends OnlineAuthorityProfileSelection> =
  Profile extends typeof ONLINE_RELAY_REV1_COMBAT_PROFILE_ID
    ? OnlineRelayRoomProof
    : Profile extends OnlineInkfallProfileSelection
      ? OnlineInkfallRoomProofFor<Profile>
      : OnlineOriginalArenaRoomProof;

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
export const ONLINE_MATCH_MODE_HEADER = 'x-kyx-match-mode' as const;
export const ONLINE_COMBAT_PROFILE_ID = 'p58d-rev3-combat-v1' as const;

function matchModeBoundFetch(
  matchMode: OnlineAuthorityMatchMode,
  fetchRequest: OnlineAuthorityFetch,
): OnlineAuthorityFetch {
  return async (input, init) => {
    const response = await fetchRequest(input, Object.freeze({
      ...init,
      headers: Object.freeze({
        ...init.headers,
        [ONLINE_MATCH_MODE_HEADER]: matchMode,
      }),
    }));
    return Object.freeze({
      ok: response.ok,
      status: response.status,
      json: async () => {
        const payload = await response.json();
        if (response.ok) {
          if (
            payload === null
            || typeof payload !== 'object'
            || Array.isArray(payload)
            || (payload as RoomCreationPayload).matchMode !== matchMode
          ) {
            throw new Error('Authority returned a mismatched online match mode.');
          }
        }
        return payload;
      },
    });
  };
}

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

function authorityMapRoomFromPayload(
  payload: unknown,
  expectedRoomCode: string | null,
  profile: OnlineAuthorityProfileSelection,
): OnlineAuthorityMapRoomProof | null {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const candidate = payload as RoomCreationPayload;
  const roomCode = roomFromPayload(payload);
  if (
    roomCode === null
    || (expectedRoomCode !== null && roomCode !== expectedRoomCode)
    || candidate.roomProfile !== profile
    || !matchesExpected(candidate.mapBinding, onlineAuthorityMapBinding(profile))
  ) return null;
  return Object.freeze({
    roomCode,
    roomProfile: profile,
    mapBinding: onlineAuthorityMapBinding(profile),
  }) as OnlineAuthorityMapRoomProof;
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

async function requestOnlineAuthorityMapRoom<
  Profile extends OnlineAuthorityProfileSelection,
>(
  endpoint: string,
  expectedRoomCode: string | null,
  operation: 'creation' | 'join verification',
  fetchRequest: OnlineAuthorityFetch,
  profile: Profile,
): Promise<OnlineAuthorityMapRoomProofFor<Profile>> {
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
      const room = authorityMapRoomFromPayload(
        await response.json(),
        expectedRoomCode,
        profile,
      );
      if (room === null) {
        throw new Error(
          profile === ONLINE_RELAY_REV1_COMBAT_PROFILE_ID
            ? `Authority returned an invalid Relay Revision 1 map binding for ${profile}.`
            : profile === ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID
              ? 'Authority returned an invalid Inkfall Foundry revision-2 room binding.'
              : `Authority returned an invalid Inkfall Foundry room binding for ${profile}.`,
        );
      }
      return room as OnlineAuthorityMapRoomProofFor<Profile>;
    }
    if (response.status < 500 || attempt > 0) break;
  }
  throw new Error(
    lastStatus === null
      ? `Authority map room ${operation} did not return a response.`
      : `Authority map room ${operation} failed (HTTP ${lastStatus}).`,
  );
}

async function createProfileRoom<Profile extends OnlineAuthorityProfileSelection>(
  authorityOrigin: string,
  profile: Profile,
  fetchRequest: OnlineAuthorityFetch,
): Promise<OnlineAuthorityMapRoomProofFor<Profile>> {
  return await requestOnlineAuthorityMapRoom(
    new URL('/api/rooms/create', authorityOrigin).toString(),
    null,
    'creation',
    fetchRequest,
    profile,
  );
}

async function verifyProfileRoom<Profile extends OnlineAuthorityProfileSelection>(
  authorityOrigin: string,
  roomCode: string,
  profile: Profile,
  fetchRequest: OnlineAuthorityFetch,
): Promise<OnlineAuthorityMapRoomProofFor<Profile>> {
  const normalized = normalizeAuthorityRoomCode(roomCode);
  if (normalized === null) throw new RangeError('online room code is invalid');
  return await requestOnlineAuthorityMapRoom(
    new URL(`/api/rooms/${normalized}`, authorityOrigin).toString(),
    normalized,
    'join verification',
    fetchRequest,
    profile,
  );
}

/** Explicit opt-in. The default production combat-room request remains unchanged. */
export async function createOnlineInkfallRevision2CombatRoom(
  authorityOrigin: string,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineInkfallRevision2RoomProof> {
  return await createProfileRoom(
    authorityOrigin,
    ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
    fetchRequest,
  );
}

export async function verifyOnlineInkfallRevision2CombatRoom(
  authorityOrigin: string,
  roomCode: string,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineInkfallRevision2RoomProof> {
  return await verifyProfileRoom(
    authorityOrigin,
    roomCode,
    ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID,
    fetchRequest,
  );
}

export async function createOnlineInkfallRevision4CombatRoom(
  authorityOrigin: string,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineInkfallRevision4RoomProof> {
  return await createProfileRoom(
    authorityOrigin,
    ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
    fetchRequest,
  );
}

export async function verifyOnlineInkfallRevision4CombatRoom(
  authorityOrigin: string,
  roomCode: string,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineInkfallRevision4RoomProof> {
  return await verifyProfileRoom(
    authorityOrigin,
    roomCode,
    ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID,
    fetchRequest,
  );
}

export async function createOnlineInkfallRevision5CombatRoom(
  authorityOrigin: string,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineInkfallRevision5RoomProof> {
  return await createProfileRoom(
    authorityOrigin,
    ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID,
    fetchRequest,
  );
}

export async function verifyOnlineInkfallRevision5CombatRoom(
  authorityOrigin: string,
  roomCode: string,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineInkfallRevision5RoomProof> {
  return await verifyProfileRoom(
    authorityOrigin,
    roomCode,
    ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID,
    fetchRequest,
  );
}

export async function createOnlineRelayCombatRoom(
  authorityOrigin: string,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineRelayRoomProof> {
  return await createProfileRoom(
    authorityOrigin,
    ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
    fetchRequest,
  );
}

export async function verifyOnlineRelayCombatRoom(
  authorityOrigin: string,
  roomCode: string,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineRelayRoomProof> {
  return await verifyProfileRoom(
    authorityOrigin,
    roomCode,
    ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
    fetchRequest,
  );
}

export async function createOnlineInkfallCombatRoom(
  authorityOrigin: string,
  profile: OnlineInkfallProfileSelection,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineInkfallRoomProof> {
  return profile === ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID
    ? createOnlineInkfallRevision5CombatRoom(authorityOrigin, fetchRequest)
    : profile === ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID
      ? createOnlineInkfallRevision4CombatRoom(authorityOrigin, fetchRequest)
      : createOnlineInkfallRevision2CombatRoom(authorityOrigin, fetchRequest);
}

export async function verifyOnlineInkfallCombatRoom(
  authorityOrigin: string,
  roomCode: string,
  profile: OnlineInkfallProfileSelection,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineInkfallRoomProof> {
  return profile === ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID
    ? verifyOnlineInkfallRevision5CombatRoom(authorityOrigin, roomCode, fetchRequest)
    : profile === ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID
      ? verifyOnlineInkfallRevision4CombatRoom(authorityOrigin, roomCode, fetchRequest)
      : verifyOnlineInkfallRevision2CombatRoom(authorityOrigin, roomCode, fetchRequest);
}

export async function createOnlineAuthorityMapCombatRoom(
  authorityOrigin: string,
  profile: OnlineAuthorityProfileSelection,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineAuthorityMapRoomProof> {
  if (profile === ONLINE_RELAY_REV1_COMBAT_PROFILE_ID) {
    return createOnlineRelayCombatRoom(authorityOrigin, fetchRequest);
  }
  if (
    profile === ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID
    || profile === ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID
    || profile === ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID
  ) {
    return createOnlineInkfallCombatRoom(authorityOrigin, profile, fetchRequest);
  }
  return createProfileRoom(authorityOrigin, profile, fetchRequest);
}

export async function verifyOnlineAuthorityMapCombatRoom(
  authorityOrigin: string,
  roomCode: string,
  profile: OnlineAuthorityProfileSelection,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineAuthorityMapRoomProof> {
  if (profile === ONLINE_RELAY_REV1_COMBAT_PROFILE_ID) {
    return verifyOnlineRelayCombatRoom(authorityOrigin, roomCode, fetchRequest);
  }
  if (
    profile === ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID
    || profile === ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID
    || profile === ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID
  ) {
    return verifyOnlineInkfallCombatRoom(
        authorityOrigin,
        roomCode,
        profile,
        fetchRequest,
    );
  }
  return verifyProfileRoom(authorityOrigin, roomCode, profile, fetchRequest);
}

export async function createOnlineAuthorityModeCombatRoom(
  authorityOrigin: string,
  profile: OnlineAuthorityProfileSelection,
  matchMode: OnlineAuthorityMatchMode,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineAuthorityModeMapRoomProof> {
  const proof = await createProfileRoom(
    authorityOrigin,
    profile,
    matchModeBoundFetch(matchMode, fetchRequest),
  );
  return Object.freeze({ ...proof, matchMode });
}

export async function verifyOnlineAuthorityModeCombatRoom(
  authorityOrigin: string,
  roomCode: string,
  profile: OnlineAuthorityProfileSelection,
  matchMode: OnlineAuthorityMatchMode,
  fetchRequest: OnlineAuthorityFetch = (input, init) => fetch(input, init),
): Promise<OnlineAuthorityModeMapRoomProof> {
  const proof = await verifyProfileRoom(
    authorityOrigin,
    roomCode,
    profile,
    matchModeBoundFetch(matchMode, fetchRequest),
  );
  return Object.freeze({ ...proof, matchMode });
}
