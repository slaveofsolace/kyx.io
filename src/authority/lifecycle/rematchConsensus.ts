import { PROTOCOL_LIMITS } from '../../net/protocol';

export const AUTHORITY_REMATCH_CONSENSUS_SCHEMA_VERSION = 1 as const;

export type AuthorityRematchDecision = 'accept' | 'decline';
export type AuthorityRematchConsensusStatus = 'open' | 'accepted' | 'declined' | 'expired';

export interface AuthorityRematchVoteV1 {
  readonly schemaVersion: typeof AUTHORITY_REMATCH_CONSENSUS_SCHEMA_VERSION;
  readonly playerId: string;
  readonly requestId: string;
  readonly decision: AuthorityRematchDecision;
  readonly authorityTick: number;
}

export interface AuthorityRematchConsensusStateV1 {
  readonly schemaVersion: typeof AUTHORITY_REMATCH_CONSENSUS_SCHEMA_VERSION;
  readonly matchId: string;
  readonly rematchOrdinal: number;
  readonly openedAtTick: number;
  readonly expiresAtTick: number;
  readonly eligiblePlayerIds: readonly string[];
  readonly votes: readonly AuthorityRematchVoteV1[];
  readonly status: AuthorityRematchConsensusStatus;
}

export interface CreateAuthorityRematchConsensusOptions {
  readonly matchId: string;
  readonly rematchOrdinal: number;
  readonly authorityTick: number;
  readonly responseWindowTicks?: number;
  readonly eligiblePlayerIds: readonly string[];
}

export interface CastAuthorityRematchVoteOptions {
  readonly playerId: string;
  readonly requestId: string;
  readonly decision: AuthorityRematchDecision;
  readonly authorityTick: number;
}

export type AuthorityRematchVoteRejectionReason =
  | 'consensus_closed'
  | 'consensus_expired'
  | 'player_ineligible'
  | 'request_id_conflict'
  | 'vote_already_recorded';

export type AuthorityRematchVoteResult =
  | Readonly<{
      readonly ok: true;
      readonly state: AuthorityRematchConsensusStateV1;
      readonly vote: AuthorityRematchVoteV1;
      readonly replayed: boolean;
    }>
  | Readonly<{
      readonly ok: false;
      readonly reason: AuthorityRematchVoteRejectionReason;
      readonly state: AuthorityRematchConsensusStateV1;
    }>;

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
  ) throw new RangeError(`${label} must be a stable protocol identifier`);
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

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function statusFor(
  eligiblePlayerIds: readonly string[],
  votes: readonly AuthorityRematchVoteV1[],
  authorityTick: number,
  expiresAtTick: number,
): AuthorityRematchConsensusStatus {
  if (votes.some(({ decision }) => decision === 'decline')) return 'declined';
  if (
    votes.length === eligiblePlayerIds.length
    && votes.every(({ decision }) => decision === 'accept')
  ) return 'accepted';
  return authorityTick >= expiresAtTick ? 'expired' : 'open';
}

function freezeState(
  value: Omit<AuthorityRematchConsensusStateV1, 'eligiblePlayerIds' | 'votes'> & {
    readonly eligiblePlayerIds: readonly string[];
    readonly votes: readonly AuthorityRematchVoteV1[];
  },
): AuthorityRematchConsensusStateV1 {
  return Object.freeze({
    ...value,
    eligiblePlayerIds: Object.freeze([...value.eligiblePlayerIds].sort(compare)),
    votes: Object.freeze(
      [...value.votes]
        .sort((left, right) => compare(left.playerId, right.playerId))
        .map((vote) => Object.freeze({ ...vote })),
    ),
  });
}

export function createAuthorityRematchConsensus(
  options: CreateAuthorityRematchConsensusOptions,
): AuthorityRematchConsensusStateV1 {
  if (options === null || typeof options !== 'object') {
    throw new TypeError('rematch consensus options are required');
  }
  const matchId = stableId(options.matchId, 'rematch match id');
  const rematchOrdinal = integer(options.rematchOrdinal, 1, 10_000, 'rematch ordinal');
  const openedAtTick = integer(options.authorityTick, 0, Number.MAX_SAFE_INTEGER, 'authority tick');
  const responseWindowTicks = integer(
    options.responseWindowTicks ?? 400,
    20,
    12_000,
    'rematch response window',
  );
  if (!Array.isArray(options.eligiblePlayerIds)) {
    throw new TypeError('rematch eligible players must be an array');
  }
  const eligiblePlayerIds = options.eligiblePlayerIds.map((playerId) => (
    stableId(playerId, 'rematch eligible player id')
  )).sort(compare);
  if (eligiblePlayerIds.length < 1 || eligiblePlayerIds.length > 64) {
    throw new RangeError('rematch eligible player count must be from 1 through 64');
  }
  if (new Set(eligiblePlayerIds).size !== eligiblePlayerIds.length) {
    throw new RangeError('rematch eligible player ids must be unique');
  }
  const expiresAtTick = openedAtTick + responseWindowTicks;
  if (!Number.isSafeInteger(expiresAtTick)) throw new RangeError('rematch expiry tick overflowed');
  return freezeState({
    schemaVersion: AUTHORITY_REMATCH_CONSENSUS_SCHEMA_VERSION,
    matchId,
    rematchOrdinal,
    openedAtTick,
    expiresAtTick,
    eligiblePlayerIds,
    votes: [],
    status: 'open',
  });
}

export function castAuthorityRematchVote(
  state: AuthorityRematchConsensusStateV1,
  options: CastAuthorityRematchVoteOptions,
): AuthorityRematchVoteResult {
  const playerId = stableId(options.playerId, 'rematch player id');
  const requestId = stableId(options.requestId, 'rematch request id');
  const authorityTick = integer(options.authorityTick, 0, Number.MAX_SAFE_INTEGER, 'authority tick');
  if (options.decision !== 'accept' && options.decision !== 'decline') {
    throw new RangeError('rematch decision is unsupported');
  }
  const advanced = advanceAuthorityRematchConsensus(state, authorityTick);
  const requestVote = advanced.votes.find((vote) => vote.requestId === requestId);
  if (requestVote !== undefined) {
    if (requestVote.playerId === playerId && requestVote.decision === options.decision) {
      return Object.freeze({ ok: true, state: advanced, vote: requestVote, replayed: true });
    }
    return Object.freeze({ ok: false, reason: 'request_id_conflict', state: advanced });
  }
  if (advanced.status === 'expired') {
    return Object.freeze({ ok: false, reason: 'consensus_expired', state: advanced });
  }
  if (advanced.status !== 'open') {
    return Object.freeze({ ok: false, reason: 'consensus_closed', state: advanced });
  }
  if (!advanced.eligiblePlayerIds.includes(playerId)) {
    return Object.freeze({ ok: false, reason: 'player_ineligible', state: advanced });
  }
  if (advanced.votes.some((vote) => vote.playerId === playerId)) {
    return Object.freeze({ ok: false, reason: 'vote_already_recorded', state: advanced });
  }
  const vote: AuthorityRematchVoteV1 = Object.freeze({
    schemaVersion: AUTHORITY_REMATCH_CONSENSUS_SCHEMA_VERSION,
    playerId,
    requestId,
    decision: options.decision,
    authorityTick,
  });
  const votes = [...advanced.votes, vote];
  const status = statusFor(
    advanced.eligiblePlayerIds,
    votes,
    authorityTick,
    advanced.expiresAtTick,
  );
  return Object.freeze({
    ok: true,
    state: freezeState({ ...advanced, votes, status }),
    vote,
    replayed: false,
  });
}

export function advanceAuthorityRematchConsensus(
  state: AuthorityRematchConsensusStateV1,
  authorityTickValue: number,
): AuthorityRematchConsensusStateV1 {
  const authorityTick = integer(authorityTickValue, 0, Number.MAX_SAFE_INTEGER, 'authority tick');
  if (state.status !== 'open') return state;
  const status = statusFor(
    state.eligiblePlayerIds,
    state.votes,
    authorityTick,
    state.expiresAtTick,
  );
  return status === state.status ? state : freezeState({ ...state, status });
}

export function restoreAuthorityRematchConsensus(
  value: unknown,
  authorityTickValue: number,
): AuthorityRematchConsensusStateV1 {
  const authorityTick = integer(authorityTickValue, 0, Number.MAX_SAFE_INTEGER, 'authority tick');
  const root = exactRecord(value, [
    'schemaVersion',
    'matchId',
    'rematchOrdinal',
    'openedAtTick',
    'expiresAtTick',
    'eligiblePlayerIds',
    'votes',
    'status',
  ], 'authority rematch checkpoint');
  if (root.schemaVersion !== AUTHORITY_REMATCH_CONSENSUS_SCHEMA_VERSION) {
    throw new RangeError('authority rematch checkpoint schema is unsupported');
  }
  const matchId = stableId(root.matchId, 'checkpoint rematch match id');
  const rematchOrdinal = integer(root.rematchOrdinal, 1, 10_000, 'checkpoint rematch ordinal');
  const openedAtTick = integer(root.openedAtTick, 0, authorityTick, 'checkpoint rematch open tick');
  const expiresAtTick = integer(
    root.expiresAtTick,
    openedAtTick + 20,
    openedAtTick + 12_000,
    'checkpoint rematch expiry tick',
  );
  if (!Array.isArray(root.eligiblePlayerIds) || !Array.isArray(root.votes)) {
    throw new TypeError('checkpoint rematch players and votes must be arrays');
  }
  const eligiblePlayerIds = root.eligiblePlayerIds.map((playerId) => (
    stableId(playerId, 'checkpoint rematch eligible player id')
  ));
  if (
    eligiblePlayerIds.length < 1
    || eligiblePlayerIds.length > 64
    || new Set(eligiblePlayerIds).size !== eligiblePlayerIds.length
    || eligiblePlayerIds.some((playerId, index) => (
      index > 0 && compare(eligiblePlayerIds[index - 1] as string, playerId) >= 0
    ))
  ) throw new RangeError('checkpoint rematch eligible players are invalid');
  const requestIds = new Set<string>();
  const voterIds = new Set<string>();
  const votes = root.votes.map((item, index) => {
    const record = exactRecord(item, [
      'schemaVersion',
      'playerId',
      'requestId',
      'decision',
      'authorityTick',
    ], `checkpoint rematch vote ${index}`);
    if (record.schemaVersion !== AUTHORITY_REMATCH_CONSENSUS_SCHEMA_VERSION) {
      throw new RangeError('checkpoint rematch vote schema is unsupported');
    }
    const playerId = stableId(record.playerId, 'checkpoint rematch voter id');
    const requestId = stableId(record.requestId, 'checkpoint rematch request id');
    if (!eligiblePlayerIds.includes(playerId)) throw new RangeError('checkpoint rematch voter is ineligible');
    if (voterIds.has(playerId)) throw new RangeError('checkpoint rematch voters must be unique');
    if (requestIds.has(requestId)) throw new RangeError('checkpoint rematch request ids must be unique');
    voterIds.add(playerId);
    requestIds.add(requestId);
    if (record.decision !== 'accept' && record.decision !== 'decline') {
      throw new RangeError('checkpoint rematch decision is unsupported');
    }
    return Object.freeze({
      schemaVersion: AUTHORITY_REMATCH_CONSENSUS_SCHEMA_VERSION,
      playerId,
      requestId,
      decision: record.decision,
      authorityTick: integer(
        record.authorityTick,
        openedAtTick,
        Math.min(authorityTick, expiresAtTick),
        'checkpoint rematch vote tick',
      ),
    } satisfies AuthorityRematchVoteV1);
  });
  if (votes.some(({ playerId }, index) => index > 0 && compare(votes[index - 1]!.playerId, playerId) >= 0)) {
    throw new RangeError('checkpoint rematch votes must be sorted by player id');
  }
  if (
    root.status !== 'open'
    && root.status !== 'accepted'
    && root.status !== 'declined'
    && root.status !== 'expired'
  ) throw new RangeError('checkpoint rematch status is unsupported');
  const expectedStatus = statusFor(eligiblePlayerIds, votes, authorityTick, expiresAtTick);
  if (root.status !== expectedStatus) {
    throw new RangeError('checkpoint rematch status disagrees with authority state');
  }
  return freezeState({
    schemaVersion: AUTHORITY_REMATCH_CONSENSUS_SCHEMA_VERSION,
    matchId,
    rematchOrdinal,
    openedAtTick,
    expiresAtTick,
    eligiblePlayerIds,
    votes,
    status: expectedStatus,
  });
}
