import { normalizeAuthorityRoomCode } from '../dev/authorityEvidenceModel';

const STORAGE_KEY_PREFIX = 'kyx.online-authority.resume.v1';
const RESUME_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const FIXTURE_HASH_PATTERN = /^[0-9a-f]{16}$/u;
const BINDING_ID_PATTERN = /^[A-Za-z0-9._@/-]{1,160}$/u;
const SESSION_ID_PATTERN = /^[A-Za-z0-9._:-]{1,160}$/u;

export interface OnlineAuthorityResumeBinding {
  readonly authorityOrigin: string;
  readonly roomCode: string;
  readonly profileId: string;
  readonly mapId: string;
  readonly fixtureHash: string;
}

export interface OnlineAuthorityResumeCredential {
  readonly resumeToken: string;
  readonly matchId: string;
  readonly playerId: string;
}

interface OnlineAuthorityResumeEnvelope extends OnlineAuthorityResumeBinding,
  OnlineAuthorityResumeCredential {
  readonly schemaVersion: 1;
  readonly savedAtEpochMilliseconds: number;
}

export interface OnlineAuthorityResumeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function normalizedAuthorityOrigin(value: string): string {
  const parsed = new URL(value);
  if (
    (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
    || parsed.username.length > 0
    || parsed.password.length > 0
  ) throw new RangeError('online authority resume origin must be an HTTP(S) origin');
  return parsed.origin;
}

function exactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

function bindingMatches(
  envelope: OnlineAuthorityResumeEnvelope,
  binding: OnlineAuthorityResumeBinding,
): boolean {
  return envelope.authorityOrigin === binding.authorityOrigin
    && envelope.roomCode === binding.roomCode
    && envelope.profileId === binding.profileId
    && envelope.mapId === binding.mapId
    && envelope.fixtureHash === binding.fixtureHash;
}

function parseEnvelope(value: string): OnlineAuthorityResumeEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  if (!exactKeys(parsed, [
    'schemaVersion',
    'authorityOrigin',
    'roomCode',
    'profileId',
    'mapId',
    'fixtureHash',
    'resumeToken',
    'matchId',
    'playerId',
    'savedAtEpochMilliseconds',
  ])) return null;
  const candidate = parsed as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 1
    || typeof candidate.authorityOrigin !== 'string'
    || typeof candidate.roomCode !== 'string'
    || typeof candidate.profileId !== 'string'
    || typeof candidate.mapId !== 'string'
    || typeof candidate.fixtureHash !== 'string'
    || typeof candidate.resumeToken !== 'string'
    || typeof candidate.matchId !== 'string'
    || typeof candidate.playerId !== 'string'
    || typeof candidate.savedAtEpochMilliseconds !== 'number'
    || !Number.isSafeInteger(candidate.savedAtEpochMilliseconds)
    || candidate.savedAtEpochMilliseconds < 0
    || normalizeAuthorityRoomCode(candidate.roomCode) !== candidate.roomCode
    || !BINDING_ID_PATTERN.test(candidate.profileId)
    || !BINDING_ID_PATTERN.test(candidate.mapId)
    || !FIXTURE_HASH_PATTERN.test(candidate.fixtureHash)
    || !RESUME_TOKEN_PATTERN.test(candidate.resumeToken)
    || !SESSION_ID_PATTERN.test(candidate.matchId)
    || !SESSION_ID_PATTERN.test(candidate.playerId)
  ) return null;
  try {
    if (normalizedAuthorityOrigin(candidate.authorityOrigin) !== candidate.authorityOrigin) return null;
  } catch {
    return null;
  }
  return Object.freeze(candidate as unknown as OnlineAuthorityResumeEnvelope);
}

export function createOnlineAuthorityResumeBinding(
  input: OnlineAuthorityResumeBinding,
): OnlineAuthorityResumeBinding {
  const authorityOrigin = normalizedAuthorityOrigin(input.authorityOrigin);
  const roomCode = normalizeAuthorityRoomCode(input.roomCode);
  if (roomCode === null) throw new RangeError('online authority resume room code is invalid');
  if (!BINDING_ID_PATTERN.test(input.profileId)) {
    throw new RangeError('online authority resume profile id is invalid');
  }
  if (!BINDING_ID_PATTERN.test(input.mapId)) {
    throw new RangeError('online authority resume map id is invalid');
  }
  if (!FIXTURE_HASH_PATTERN.test(input.fixtureHash)) {
    throw new RangeError('online authority resume fixture hash is invalid');
  }
  return Object.freeze({
    authorityOrigin,
    roomCode,
    profileId: input.profileId,
    mapId: input.mapId,
    fixtureHash: input.fixtureHash,
  });
}

export function onlineAuthorityResumeStorageKey(
  binding: OnlineAuthorityResumeBinding,
): string {
  return [
    STORAGE_KEY_PREFIX,
    encodeURIComponent(binding.authorityOrigin),
    binding.roomCode,
    binding.profileId,
    binding.mapId,
    binding.fixtureHash,
  ].join(':');
}

export function readOnlineAuthorityResumeCredential(
  storage: OnlineAuthorityResumeStorage,
  binding: OnlineAuthorityResumeBinding,
): OnlineAuthorityResumeCredential | null {
  const key = onlineAuthorityResumeStorageKey(binding);
  let serialized: string | null;
  try {
    serialized = storage.getItem(key);
  } catch {
    return null;
  }
  if (serialized === null) return null;
  const envelope = parseEnvelope(serialized);
  if (envelope === null || !bindingMatches(envelope, binding)) {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can be unavailable in hardened browser contexts; fail closed in memory.
    }
    return null;
  }
  return Object.freeze({
    resumeToken: envelope.resumeToken,
    matchId: envelope.matchId,
    playerId: envelope.playerId,
  });
}

export function persistOnlineAuthorityResumeCredential(
  storage: OnlineAuthorityResumeStorage,
  binding: OnlineAuthorityResumeBinding,
  credential: OnlineAuthorityResumeCredential,
  nowEpochMilliseconds = Date.now(),
): boolean {
  if (
    !RESUME_TOKEN_PATTERN.test(credential.resumeToken)
    || !SESSION_ID_PATTERN.test(credential.matchId)
    || !SESSION_ID_PATTERN.test(credential.playerId)
    || !Number.isSafeInteger(nowEpochMilliseconds)
    || nowEpochMilliseconds < 0
  ) return false;
  const envelope: OnlineAuthorityResumeEnvelope = Object.freeze({
    schemaVersion: 1,
    ...binding,
    ...credential,
    savedAtEpochMilliseconds: nowEpochMilliseconds,
  });
  try {
    storage.setItem(onlineAuthorityResumeStorageKey(binding), JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function clearOnlineAuthorityResumeCredential(
  storage: OnlineAuthorityResumeStorage,
  binding: OnlineAuthorityResumeBinding,
): void {
  try {
    storage.removeItem(onlineAuthorityResumeStorageKey(binding));
  } catch {
    // A failed clear cannot make an opaque token available to the application.
  }
}
