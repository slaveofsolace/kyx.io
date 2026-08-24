import type {
  ApplyAuthoritativeRespawnResult,
  CombatDamageAppliedEvent,
  CombatDeathEvent,
} from './life';
import {
  assertStrictCombatDataTree,
  deepFreezeCombatValue,
  strictArray,
  strictInteger,
  strictLiteral,
  strictNullableStableId,
  strictRecord,
  strictStableId,
} from './strictCombatData';
import {
  KYX_MODE_ID,
  type KyxDeathmatchAuthorityModeId,
} from '../modes';

const MAX_AUTHORITY_TICK = Number.MAX_SAFE_INTEGER - 100_000;
const MAX_SCOREBOARD_COUNT = 1_000_000;

function compareStableIdsOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export const TDM_MATCH_SCHEMA_VERSION = 1 as const;

export interface AuthorityTdmMatchRulesV1 {
  readonly schemaVersion: 1;
  readonly authorityHz: 20;
  readonly mode: KyxDeathmatchAuthorityModeId;
  readonly warmupTicks: 40;
  readonly activeTicks: 9_600;
  readonly postmatchTicks: 200;
  readonly teamScoreLimit: number;
}

export const G4_TDM_MATCH_RULES: AuthorityTdmMatchRulesV1 = Object.freeze({
  schemaVersion: 1,
  authorityHz: 20,
  mode: KYX_MODE_ID.teamDeathmatch,
  warmupTicks: 40,
  activeTicks: 9_600,
  postmatchTicks: 200,
  teamScoreLimit: 40,
});

export const KYX_FFA_MATCH_RULES: AuthorityTdmMatchRulesV1 = Object.freeze({
  schemaVersion: 1,
  authorityHz: 20,
  mode: KYX_MODE_ID.freeForAll,
  warmupTicks: 40,
  activeTicks: 9_600,
  postmatchTicks: 200,
  teamScoreLimit: 25,
});

export type AuthorityTdmMatchPhase =
  | 'lobby'
  | 'warmup'
  | 'active'
  | 'postmatch'
  | 'completed';

export interface AuthorityTdmTeamScoreV1 {
  readonly teamId: string;
  readonly score: number;
}

export interface AuthorityTdmPlayerScoreV1 {
  readonly playerId: string;
  readonly teamId: string;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
}

export interface AuthorityTdmKillFeedEventV1 {
  readonly kind: 'kill_feed_entry';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly feedSequence: number;
  readonly combatDeathEventId: string;
  readonly causeId: string;
  readonly killerPlayerId: string | null;
  readonly victimPlayerId: string;
  readonly assistPlayerIds: readonly string[];
  readonly scoredTeamId: string | null;
  readonly teamScoreAfter: number | null;
}

export interface AuthorityTdmTeamScoreEventV1 {
  readonly kind: 'team_score_changed';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly combatDeathEventId: string;
  readonly teamId: string;
  readonly previousScore: number;
  readonly scoreAfter: number;
  readonly scoreLimit: number;
  readonly killerPlayerId: string;
  readonly victimPlayerId: string;
}

export interface AuthorityTdmPhaseChangedEventV1 {
  readonly kind: 'match_phase_changed';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly matchId: string;
  readonly from: AuthorityTdmMatchPhase;
  readonly to: AuthorityTdmMatchPhase;
  readonly phaseStartedAtTick: number;
  readonly phaseEndsAtTick: number | null;
  readonly reason:
    | 'match_started'
    | 'warmup_elapsed'
    | 'score_limit_reached'
    | 'active_timer_elapsed'
    | 'postmatch_elapsed';
}

export interface AuthorityTdmMatchResultV1 {
  readonly kind: 'match_result';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly matchId: string;
  readonly reason: 'score_limit' | 'time_limit';
  readonly winningTeamId: string | null;
  readonly draw: boolean;
  readonly teamScores: readonly AuthorityTdmTeamScoreV1[];
}

export type AuthorityCombatRespawnEvent = Extract<
  ApplyAuthoritativeRespawnResult,
  { readonly accepted: true }
>['event'];

export type AuthorityTdmMatchEvent =
  | CombatDamageAppliedEvent
  | CombatDeathEvent
  | AuthorityTdmTeamScoreEventV1
  | AuthorityTdmKillFeedEventV1
  | AuthorityCombatRespawnEvent
  | AuthorityTdmPhaseChangedEventV1
  | AuthorityTdmMatchResultV1;

export interface AuthorityTdmMatchStateV1 {
  readonly schemaVersion: 1;
  readonly matchId: string;
  readonly rules: AuthorityTdmMatchRulesV1;
  readonly authorityTick: number;
  readonly phase: AuthorityTdmMatchPhase;
  readonly phaseStartedAtTick: number;
  readonly phaseEndsAtTick: number | null;
  readonly phaseTicksRemaining: number | null;
  readonly activeTicksRemaining: number;
  readonly teamScores: readonly AuthorityTdmTeamScoreV1[];
  readonly playerScores: readonly AuthorityTdmPlayerScoreV1[];
  readonly feedSequence: number;
  readonly feed: readonly AuthorityTdmKillFeedEventV1[];
  readonly lastProcessedCombatEventSequence: number;
  readonly result: AuthorityTdmMatchResultV1 | null;
}

export interface CreateAuthorityTdmMatchStateRequestV1 {
  readonly schemaVersion: 1;
  readonly matchId: string;
  readonly authorityTick: number;
}

export interface RegisterAuthorityTdmPlayerRequestV1 {
  readonly schemaVersion: 1;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly teamId: string;
}

export interface RecordAuthorityTdmCombatRequestV1 {
  readonly schemaVersion: 1;
  readonly damage: CombatDamageAppliedEvent;
  readonly death: CombatDeathEvent | null;
}

export interface RecordAuthorityTdmRespawnRequestV1 {
  readonly schemaVersion: 1;
  readonly respawn: AuthorityCombatRespawnEvent;
}

export interface AuthorityTdmTransitionResultV1 {
  readonly state: AuthorityTdmMatchStateV1;
  readonly events: readonly AuthorityTdmMatchEvent[];
}

export type RecordAuthorityTdmCombatResultV1 =
  | (AuthorityTdmTransitionResultV1 & { readonly accepted: true })
  | {
      readonly accepted: false;
      readonly state: AuthorityTdmMatchStateV1;
      readonly events: readonly [];
      readonly reason: 'match_not_accepting_combat' | 'replayed_or_stale_combat_event';
    };

export type RecordAuthorityTdmRespawnResultV1 =
  | (AuthorityTdmTransitionResultV1 & { readonly accepted: true })
  | {
      readonly accepted: false;
      readonly state: AuthorityTdmMatchStateV1;
      readonly events: readonly [];
      readonly reason: 'match_not_accepting_respawn' | 'replayed_or_stale_combat_event';
    };

function exactRules(rules: AuthorityTdmMatchRulesV1): void {
  const item = strictRecord(rules, [
    'schemaVersion', 'authorityHz', 'mode', 'warmupTicks', 'activeTicks',
    'postmatchTicks', 'teamScoreLimit',
  ], 'TDM match rules');
  strictLiteral(item.schemaVersion, 1, 'TDM match rules schema');
  strictLiteral(item.authorityHz, 20, 'TDM authority rate');
  if (item.mode !== KYX_MODE_ID.teamDeathmatch && item.mode !== KYX_MODE_ID.freeForAll) {
    throw new RangeError('deathmatch authority mode is unsupported');
  }
  const expected = item.mode === KYX_MODE_ID.teamDeathmatch
    ? G4_TDM_MATCH_RULES
    : KYX_FFA_MATCH_RULES;
  strictLiteral(item.mode, expected.mode, 'deathmatch mode');
  strictLiteral(item.warmupTicks, expected.warmupTicks, 'deathmatch warmup ticks');
  strictLiteral(item.activeTicks, expected.activeTicks, 'deathmatch active ticks');
  strictLiteral(item.postmatchTicks, expected.postmatchTicks, 'deathmatch postmatch ticks');
  strictLiteral(item.teamScoreLimit, expected.teamScoreLimit, 'deathmatch score limit');
}

export function assertAuthorityTdmMatchRules(rules: AuthorityTdmMatchRulesV1): void {
  assertStrictCombatDataTree(rules, 'TDM match rules');
  exactRules(rules);
}

function checkedTickAdd(tick: number, delta: number, label: string): number {
  const result = tick + delta;
  if (!Number.isSafeInteger(result) || result > MAX_AUTHORITY_TICK) {
    throw new RangeError(`${label} exceeds the authority tick range`);
  }
  return result;
}

function phaseTicksRemaining(
  phase: AuthorityTdmMatchPhase,
  authorityTick: number,
  phaseEndsAtTick: number | null,
): number | null {
  if (phaseEndsAtTick === null) return null;
  return Math.max(0, phaseEndsAtTick - authorityTick);
}

function activeTicksRemaining(
  phase: AuthorityTdmMatchPhase,
  authorityTick: number,
  phaseEndsAtTick: number | null,
  rules: AuthorityTdmMatchRulesV1,
): number {
  if (phase === 'lobby' || phase === 'warmup') return rules.activeTicks;
  if (phase !== 'active' || phaseEndsAtTick === null) return 0;
  return Math.max(0, phaseEndsAtTick - authorityTick);
}

function withClock(
  state: AuthorityTdmMatchStateV1,
  authorityTick: number,
): AuthorityTdmMatchStateV1 {
  return deepFreezeCombatValue({
    ...state,
    authorityTick,
    phaseTicksRemaining: phaseTicksRemaining(state.phase, authorityTick, state.phaseEndsAtTick),
    activeTicksRemaining: activeTicksRemaining(
      state.phase,
      authorityTick,
      state.phaseEndsAtTick,
      state.rules,
    ),
  });
}

function phaseEvent(
  state: AuthorityTdmMatchStateV1,
  from: AuthorityTdmMatchPhase,
  reason: AuthorityTdmPhaseChangedEventV1['reason'],
): AuthorityTdmPhaseChangedEventV1 {
  return deepFreezeCombatValue({
    kind: 'match_phase_changed',
    eventId: `match.phase.${state.matchId}.${state.phase}.${state.authorityTick}`,
    authorityTick: state.authorityTick,
    matchId: state.matchId,
    from,
    to: state.phase,
    phaseStartedAtTick: state.phaseStartedAtTick,
    phaseEndsAtTick: state.phaseEndsAtTick,
    reason,
  });
}

function transitionPhase(
  state: AuthorityTdmMatchStateV1,
  phase: AuthorityTdmMatchPhase,
  durationTicks: number | null,
  reason: AuthorityTdmPhaseChangedEventV1['reason'],
): AuthorityTdmTransitionResultV1 {
  const phaseEndsAtTick = durationTicks === null
    ? null
    : checkedTickAdd(state.authorityTick, durationTicks, 'TDM phase end tick');
  const next = deepFreezeCombatValue({
    ...state,
    phase,
    phaseStartedAtTick: state.authorityTick,
    phaseEndsAtTick,
    phaseTicksRemaining: phaseTicksRemaining(phase, state.authorityTick, phaseEndsAtTick),
    activeTicksRemaining: activeTicksRemaining(
      phase,
      state.authorityTick,
      phaseEndsAtTick,
      state.rules,
    ),
  });
  return deepFreezeCombatValue({ state: next, events: [phaseEvent(next, state.phase, reason)] });
}

function scoreResult(
  state: AuthorityTdmMatchStateV1,
  reason: AuthorityTdmMatchResultV1['reason'],
): AuthorityTdmMatchResultV1 {
  const ordered = [...state.teamScores].sort((left, right) => (
    right.score - left.score || compareStableIdsOrdinal(left.teamId, right.teamId)
  ));
  const highest = ordered[0]?.score ?? 0;
  const leaders = ordered.filter(({ score }) => score === highest);
  const winningTeamId = leaders.length === 1 ? leaders[0]?.teamId ?? null : null;
  return deepFreezeCombatValue({
    kind: 'match_result',
    eventId: `match.result.${state.matchId}.${state.authorityTick}`,
    authorityTick: state.authorityTick,
    matchId: state.matchId,
    reason,
    winningTeamId,
    draw: winningTeamId === null,
    teamScores: state.teamScores.map((entry) => ({ ...entry })),
  });
}

function enterPostmatch(
  state: AuthorityTdmMatchStateV1,
  reason: AuthorityTdmMatchResultV1['reason'],
): AuthorityTdmTransitionResultV1 {
  const transition = transitionPhase(
    state,
    'postmatch',
    state.rules.postmatchTicks,
    reason === 'score_limit' ? 'score_limit_reached' : 'active_timer_elapsed',
  );
  const result = scoreResult(transition.state, reason);
  return deepFreezeCombatValue({
    state: { ...transition.state, result },
    events: [...transition.events, result],
  });
}

function validateDamageEvent(value: unknown): CombatDamageAppliedEvent {
  const damageKeys = [
    'kind', 'eventId', 'eventSequence', 'authorityTick', 'causeId',
    'sourcePlayerId', 'targetPlayerId', 'shieldDamagePoints',
    'healthDamagePoints', 'shieldPointsAfter', 'healthPointsAfter',
  ] as const;
  const hasHitRegion = value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.hasOwn(value, 'hitRegion');
  const item = strictRecord(
    value,
    hasHitRegion ? [...damageKeys, 'hitRegion'] : damageKeys,
    'TDM damage event',
  );
  strictLiteral(item.kind, 'damage_applied', 'TDM damage event kind');
  const eventSequence = strictInteger(
    item.eventSequence,
    0,
    MAX_AUTHORITY_TICK,
    'TDM damage event sequence',
  );
  strictLiteral(item.eventId, `combat.damage.${eventSequence}`, 'TDM damage event id');
  const hitRegion = item.hitRegion ?? null;
  if (
    hitRegion !== null
    && hitRegion !== 'head'
    && hitRegion !== 'torso'
    && hitRegion !== 'limb'
  ) {
    throw new RangeError('TDM damage hit region must be head, torso, limb, or null');
  }
  return deepFreezeCombatValue({
    kind: 'damage_applied',
    eventId: item.eventId as string,
    eventSequence,
    authorityTick: strictInteger(item.authorityTick, 0, MAX_AUTHORITY_TICK, 'TDM damage tick'),
    causeId: strictStableId(item.causeId, 'TDM damage cause'),
    sourcePlayerId: strictNullableStableId(item.sourcePlayerId, 'TDM damage source'),
    targetPlayerId: strictStableId(item.targetPlayerId, 'TDM damage target'),
    shieldDamagePoints: strictInteger(
      item.shieldDamagePoints,
      0,
      1_000_000,
      'TDM shield damage',
    ),
    healthDamagePoints: strictInteger(
      item.healthDamagePoints,
      0,
      1_000_000,
      'TDM health damage',
    ),
    shieldPointsAfter: strictInteger(item.shieldPointsAfter, 0, 1_000_000, 'TDM shield after'),
    healthPointsAfter: strictInteger(item.healthPointsAfter, 0, 1_000_000, 'TDM health after'),
    hitRegion,
  });
}

function validateDeathEvent(value: unknown): CombatDeathEvent {
  const item = strictRecord(value, [
    'kind', 'eventId', 'authorityTick', 'victimPlayerId', 'killerPlayerId',
    'assistPlayerIds', 'deathOrdinal', 'respawnEligibleAtTick',
    'discontinuitySequence',
  ], 'TDM death event');
  strictLiteral(item.kind, 'death', 'TDM death event kind');
  const assistPlayerIds = strictArray(item.assistPlayerIds, 0, 64, 'TDM assists')
    .map((entry) => strictStableId(entry, 'TDM assist player'));
  if (new Set(assistPlayerIds).size !== assistPlayerIds.length) {
    throw new RangeError('TDM assist player ids must be unique');
  }
  if (assistPlayerIds.some((entry, index) => index > 0 && assistPlayerIds[index - 1]! > entry)) {
    throw new RangeError('TDM assist player ids must be sorted');
  }
  return deepFreezeCombatValue({
    kind: 'death',
    eventId: strictStableId(item.eventId, 'TDM death event id'),
    authorityTick: strictInteger(item.authorityTick, 0, MAX_AUTHORITY_TICK, 'TDM death tick'),
    victimPlayerId: strictStableId(item.victimPlayerId, 'TDM death victim'),
    killerPlayerId: strictNullableStableId(item.killerPlayerId, 'TDM death killer'),
    assistPlayerIds,
    deathOrdinal: strictInteger(item.deathOrdinal, 1, MAX_SCOREBOARD_COUNT, 'TDM death ordinal'),
    respawnEligibleAtTick: strictInteger(
      item.respawnEligibleAtTick,
      0,
      MAX_AUTHORITY_TICK,
      'TDM respawn eligible tick',
    ),
    discontinuitySequence: strictInteger(
      item.discontinuitySequence,
      1,
      MAX_SCOREBOARD_COUNT,
      'TDM death discontinuity',
    ),
  });
}

function validateRespawnEvent(value: unknown): AuthorityCombatRespawnEvent {
  const item = strictRecord(value, [
    'kind', 'eventId', 'eventSequence', 'authorityTick', 'playerId',
    'authoritySpawnId', 'spawnOrdinal', 'protectedUntilTickExclusive',
    'discontinuitySequence',
  ], 'TDM respawn event');
  strictLiteral(item.kind, 'respawn', 'TDM respawn event kind');
  const eventSequence = strictInteger(
    item.eventSequence,
    0,
    MAX_AUTHORITY_TICK,
    'TDM respawn event sequence',
  );
  strictLiteral(item.eventId, `combat.respawn.${eventSequence}`, 'TDM respawn event id');
  return deepFreezeCombatValue({
    kind: 'respawn',
    eventId: item.eventId as string,
    eventSequence,
    authorityTick: strictInteger(item.authorityTick, 0, MAX_AUTHORITY_TICK, 'TDM respawn tick'),
    playerId: strictStableId(item.playerId, 'TDM respawn player'),
    authoritySpawnId: strictStableId(item.authoritySpawnId, 'TDM authority spawn'),
    spawnOrdinal: strictInteger(item.spawnOrdinal, 1, MAX_SCOREBOARD_COUNT, 'TDM spawn ordinal'),
    protectedUntilTickExclusive: strictInteger(
      item.protectedUntilTickExclusive,
      0,
      MAX_AUTHORITY_TICK,
      'TDM protection end tick',
    ),
    discontinuitySequence: strictInteger(
      item.discontinuitySequence,
      1,
      MAX_SCOREBOARD_COUNT,
      'TDM respawn discontinuity',
    ),
  });
}

function teamIndex(state: AuthorityTdmMatchStateV1, teamId: string): number {
  return state.teamScores.findIndex((entry) => entry.teamId === teamId);
}

function requireRegisteredPlayer(
  state: AuthorityTdmMatchStateV1,
  playerId: string,
  label: string,
): AuthorityTdmPlayerScoreV1 {
  const player = state.playerScores.find((entry) => entry.playerId === playerId);
  if (player === undefined) throw new RangeError(`${label} is not registered in the TDM match`);
  return player;
}

export function createAuthorityTdmMatchState(
  request: CreateAuthorityTdmMatchStateRequestV1,
  rules: AuthorityTdmMatchRulesV1 = G4_TDM_MATCH_RULES,
): AuthorityTdmMatchStateV1 {
  assertAuthorityTdmMatchRules(rules);
  assertStrictCombatDataTree(request, 'create TDM match request');
  const item = strictRecord(
    request,
    ['schemaVersion', 'matchId', 'authorityTick'],
    'create TDM match request',
  );
  strictLiteral(item.schemaVersion, 1, 'create TDM match schema');
  const authorityTick = strictInteger(item.authorityTick, 0, MAX_AUTHORITY_TICK, 'TDM initial tick');
  return deepFreezeCombatValue({
    schemaVersion: 1 as const,
    matchId: strictStableId(item.matchId, 'TDM match id'),
    rules: { ...rules },
    authorityTick,
    phase: 'lobby' as const,
    phaseStartedAtTick: authorityTick,
    phaseEndsAtTick: null,
    phaseTicksRemaining: null,
    activeTicksRemaining: rules.activeTicks,
    teamScores: [],
    playerScores: [],
    feedSequence: 0,
    feed: [],
    lastProcessedCombatEventSequence: -1,
    result: null,
  });
}

export function registerAuthorityTdmPlayer(
  state: AuthorityTdmMatchStateV1,
  request: RegisterAuthorityTdmPlayerRequestV1,
): AuthorityTdmMatchStateV1 {
  assertStrictCombatDataTree(request, 'register TDM player request');
  const item = strictRecord(
    request,
    ['schemaVersion', 'authorityTick', 'playerId', 'teamId'],
    'register TDM player request',
  );
  strictLiteral(item.schemaVersion, 1, 'register TDM player schema');
  strictLiteral(item.authorityTick, state.authorityTick, 'register TDM player tick');
  const playerId = strictStableId(item.playerId, 'TDM player id');
  const teamId = strictStableId(item.teamId, 'TDM team id');
  const existing = state.playerScores.find((entry) => entry.playerId === playerId);
  if (existing !== undefined) {
    if (existing.teamId !== teamId) throw new RangeError('registered TDM player cannot change teams');
    return state;
  }
  if (state.phase === 'postmatch' || state.phase === 'completed') {
    throw new RangeError('cannot register a TDM player after active play');
  }
  if (state.rules.mode === KYX_MODE_ID.freeForAll && teamId !== playerId) {
    throw new RangeError('FFA score identity must equal its authority player id');
  }
  const teamScores = teamIndex(state, teamId) >= 0
    ? state.teamScores
    : [...state.teamScores, { teamId, score: 0 }]
      .sort((left, right) => compareStableIdsOrdinal(left.teamId, right.teamId));
  const playerScores = [...state.playerScores, {
    playerId,
    teamId,
    kills: 0,
    deaths: 0,
    assists: 0,
  }].sort((left, right) => compareStableIdsOrdinal(left.playerId, right.playerId));
  return deepFreezeCombatValue({ ...state, teamScores, playerScores });
}

export function startAuthorityTdmMatch(
  state: AuthorityTdmMatchStateV1,
  authorityTickValue: number,
): AuthorityTdmTransitionResultV1 {
  const authorityTick = strictInteger(
    authorityTickValue,
    state.authorityTick,
    state.authorityTick,
    'TDM start tick',
  );
  if (state.phase !== 'lobby') throw new RangeError('TDM match can start only from lobby');
  if (state.teamScores.length < 2) {
    throw new RangeError('TDM match requires at least two authority-owned teams');
  }
  return transitionPhase(withClock(state, authorityTick), 'warmup', state.rules.warmupTicks, 'match_started');
}

export function advanceAuthorityTdmMatch(
  state: AuthorityTdmMatchStateV1,
  authorityTickValue: number,
): AuthorityTdmTransitionResultV1 {
  return settleAuthorityTdmMatchTick(
    prepareAuthorityTdmMatchTick(state, authorityTickValue),
  );
}

/**
 * Opens exactly one authority tick without crossing a phase boundary. The
 * room resolves that tick's already-sampled combat before calling settle.
 */
export function prepareAuthorityTdmMatchTick(
  state: AuthorityTdmMatchStateV1,
  authorityTickValue: number,
): AuthorityTdmMatchStateV1 {
  const authorityTick = strictInteger(
    authorityTickValue,
    state.authorityTick + 1,
    state.authorityTick + 1,
    'next TDM authority tick',
  );
  return withClock(state, authorityTick);
}

/** Resolve a boundary only after all deterministic work for the opened tick. */
export function settleAuthorityTdmMatchTick(
  state: AuthorityTdmMatchStateV1,
): AuthorityTdmTransitionResultV1 {
  if (state.phase === 'warmup' && state.authorityTick >= (state.phaseEndsAtTick as number)) {
    return transitionPhase(state, 'active', state.rules.activeTicks, 'warmup_elapsed');
  }
  if (
    state.phase === 'active'
    && state.teamScores.some(({ score }) => score >= state.rules.teamScoreLimit)
  ) {
    return enterPostmatch(state, 'score_limit');
  }
  if (state.phase === 'active' && state.authorityTick >= (state.phaseEndsAtTick as number)) {
    return enterPostmatch(state, 'time_limit');
  }
  if (state.phase === 'postmatch' && state.authorityTick >= (state.phaseEndsAtTick as number)) {
    return transitionPhase(state, 'completed', null, 'postmatch_elapsed');
  }
  return deepFreezeCombatValue({ state, events: [] });
}

export function recordAuthorityTdmCombat(
  state: AuthorityTdmMatchStateV1,
  request: RecordAuthorityTdmCombatRequestV1,
): RecordAuthorityTdmCombatResultV1 {
  assertStrictCombatDataTree(request, 'record TDM combat request');
  const item = strictRecord(
    request,
    ['schemaVersion', 'damage', 'death'],
    'record TDM combat request',
  );
  strictLiteral(item.schemaVersion, 1, 'record TDM combat schema');
  const damage = validateDamageEvent(item.damage);
  const death = item.death === null ? null : validateDeathEvent(item.death);
  if (damage.authorityTick !== state.authorityTick) {
    throw new RangeError('TDM damage tick must equal the current match tick');
  }
  if (damage.eventSequence <= state.lastProcessedCombatEventSequence) {
    return deepFreezeCombatValue({
      accepted: false as const,
      state,
      events: [] as const,
      reason: 'replayed_or_stale_combat_event' as const,
    });
  }
  if (state.phase !== 'warmup' && state.phase !== 'active') {
    return deepFreezeCombatValue({
      accepted: false as const,
      state,
      events: [] as const,
      reason: 'match_not_accepting_combat' as const,
    });
  }
  const target = requireRegisteredPlayer(state, damage.targetPlayerId, 'TDM damage target');
  if (damage.sourcePlayerId !== null) {
    requireRegisteredPlayer(state, damage.sourcePlayerId, 'TDM damage source');
  }
  if ((death === null) === (damage.healthPointsAfter === 0)) {
    throw new RangeError('TDM damage and death events disagree on lethality');
  }
  if (death !== null) {
    if (
      death.authorityTick !== damage.authorityTick
      || death.victimPlayerId !== damage.targetPlayerId
      || death.killerPlayerId !== damage.sourcePlayerId
      || death.eventId !== `combat.death.${damage.eventSequence}`
    ) {
      throw new RangeError('TDM death event does not match its damage event');
    }
  }
  let next: AuthorityTdmMatchStateV1 = deepFreezeCombatValue({
    ...state,
    lastProcessedCombatEventSequence: damage.eventSequence,
  });
  const events: AuthorityTdmMatchEvent[] = [damage];
  if (death === null) {
    return deepFreezeCombatValue({ accepted: true as const, state: next, events });
  }
  events.push(death);
  const killer = death.killerPlayerId === null
    ? null
    : requireRegisteredPlayer(next, death.killerPlayerId, 'TDM death killer');
  for (const assistPlayerId of death.assistPlayerIds) {
    const assist = requireRegisteredPlayer(next, assistPlayerId, 'TDM assist player');
    if (
      assist.playerId === death.victimPlayerId
      || assist.playerId === death.killerPlayerId
      || assist.teamId === target.teamId
    ) {
      throw new RangeError('TDM assist attribution is not an enemy contribution');
    }
  }
  if (killer !== null && (killer.playerId === target.playerId || killer.teamId === target.teamId)) {
    throw new RangeError('TDM killer attribution is not an enemy kill');
  }
  if (next.phase !== 'active') {
    return deepFreezeCombatValue({ accepted: true as const, state: next, events });
  }
  // The first ordered death that reaches the limit is the deterministic match
  // cutoff. Already-sampled combat later in that same authority tick remains in
  // the life/death ledger, but cannot mutate match score, stats, or feed.
  if (next.teamScores.some(({ score }) => score >= next.rules.teamScoreLimit)) {
    return deepFreezeCombatValue({ accepted: true as const, state: next, events });
  }

  const playerScores = next.playerScores.map((entry) => ({
    ...entry,
    kills: entry.playerId === killer?.playerId ? entry.kills + 1 : entry.kills,
    deaths: entry.playerId === target.playerId ? entry.deaths + 1 : entry.deaths,
    assists: death.assistPlayerIds.includes(entry.playerId) ? entry.assists + 1 : entry.assists,
  }));
  const teamScores = next.teamScores.map((entry) => ({ ...entry }));
  let scoreEvent: AuthorityTdmTeamScoreEventV1 | null = null;
  if (killer !== null) {
    const index = teamScores.findIndex((entry) => entry.teamId === killer.teamId);
    if (index < 0) throw new RangeError('TDM killer team is not registered');
    const current = teamScores[index] as AuthorityTdmTeamScoreV1;
    if (current.score >= next.rules.teamScoreLimit) {
      throw new RangeError('active TDM score already reached its limit');
    }
    const scoreAfter = current.score + 1;
    teamScores[index] = { teamId: current.teamId, score: scoreAfter };
    scoreEvent = deepFreezeCombatValue({
      kind: 'team_score_changed',
      eventId: `match.score.${next.matchId}.${damage.eventSequence}`,
      authorityTick: damage.authorityTick,
      combatDeathEventId: death.eventId,
      teamId: killer.teamId,
      previousScore: current.score,
      scoreAfter,
      scoreLimit: next.rules.teamScoreLimit,
      killerPlayerId: killer.playerId,
      victimPlayerId: target.playerId,
    });
    events.push(scoreEvent);
  }
  const feedSequence = next.feedSequence + 1;
  const feedEvent: AuthorityTdmKillFeedEventV1 = deepFreezeCombatValue({
    kind: 'kill_feed_entry',
    eventId: `match.feed.${next.matchId}.${feedSequence}`,
    authorityTick: damage.authorityTick,
    feedSequence,
    combatDeathEventId: death.eventId,
    causeId: damage.causeId,
    killerPlayerId: killer?.playerId ?? null,
    victimPlayerId: target.playerId,
    assistPlayerIds: [...death.assistPlayerIds],
    scoredTeamId: scoreEvent?.teamId ?? null,
    teamScoreAfter: scoreEvent?.scoreAfter ?? null,
  });
  events.push(feedEvent);
  next = deepFreezeCombatValue({
    ...next,
    teamScores,
    playerScores,
    feedSequence,
    feed: [...next.feed, feedEvent],
  });
  return deepFreezeCombatValue({ accepted: true as const, state: next, events });
}

export function recordAuthorityTdmRespawn(
  state: AuthorityTdmMatchStateV1,
  request: RecordAuthorityTdmRespawnRequestV1,
): RecordAuthorityTdmRespawnResultV1 {
  assertStrictCombatDataTree(request, 'record TDM respawn request');
  const item = strictRecord(
    request,
    ['schemaVersion', 'respawn'],
    'record TDM respawn request',
  );
  strictLiteral(item.schemaVersion, 1, 'record TDM respawn schema');
  const respawn = validateRespawnEvent(item.respawn);
  if (respawn.authorityTick !== state.authorityTick) {
    throw new RangeError('TDM respawn tick must equal the current match tick');
  }
  if (respawn.eventSequence <= state.lastProcessedCombatEventSequence) {
    return deepFreezeCombatValue({
      accepted: false as const,
      state,
      events: [] as const,
      reason: 'replayed_or_stale_combat_event' as const,
    });
  }
  if (state.phase !== 'warmup' && state.phase !== 'active') {
    return deepFreezeCombatValue({
      accepted: false as const,
      state,
      events: [] as const,
      reason: 'match_not_accepting_respawn' as const,
    });
  }
  requireRegisteredPlayer(state, respawn.playerId, 'TDM respawn player');
  return deepFreezeCombatValue({
    accepted: true as const,
    state: {
      ...state,
      lastProcessedCombatEventSequence: respawn.eventSequence,
    },
    events: [respawn],
  });
}
