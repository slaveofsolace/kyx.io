import type { CombatHitRegion } from './poseHistory';

const MAX_STABLE_ID_BYTES = 96;
const MAX_DAMAGE_POINTS = 1_000_000;

export type CombatLifePhase = 'alive' | 'dead';
export type CombatDiscontinuityReason = 'initial_spawn' | 'death' | 'respawn';

export interface CombatLifeRulesV1 {
  readonly schemaVersion: 1;
  readonly maximumHealthPoints: number;
  readonly maximumShieldPoints: number;
  readonly spawnProtectionTicks: number;
  readonly spawnProtectionBreaksOnOffense: boolean;
  readonly respawnDelayTicks: number;
  readonly assistWindowTicks: number;
  readonly minimumAssistHealthDamagePoints: number;
  readonly friendlyFireEnabled: boolean;
  readonly selfDamageEnabled: boolean;
  readonly regeneration: {
    readonly enabled: false;
  };
}

/**
 * Explicit P5.1 product decisions for the first authoritative combat slice.
 * This fixture is not a G4 gate claim; the versioned content/runtime bridge is
 * still required before the room can enable combat.
 */
export const G4_COMBAT_SLICE_LIFE_RULES: CombatLifeRulesV1 = Object.freeze({
  schemaVersion: 1,
  maximumHealthPoints: 100,
  maximumShieldPoints: 0,
  spawnProtectionTicks: 20,
  spawnProtectionBreaksOnOffense: true,
  respawnDelayTicks: 160,
  assistWindowTicks: 200,
  minimumAssistHealthDamagePoints: 1,
  friendlyFireEnabled: false,
  selfDamageEnabled: false,
  regeneration: Object.freeze({ enabled: false }),
});

export interface CombatDiscontinuity {
  readonly sequence: number;
  readonly authorityTick: number;
  readonly reason: CombatDiscontinuityReason;
}

export interface CombatDamageContribution {
  readonly sourcePlayerId: string;
  readonly lastDamageTick: number;
  readonly healthDamagePoints: number;
  readonly shieldDamagePoints: number;
}

export interface CombatLifeState {
  readonly schemaVersion: 1;
  readonly playerId: string;
  readonly teamId: string | null;
  readonly phase: CombatLifePhase;
  readonly healthPoints: number;
  readonly shieldPoints: number;
  readonly spawnOrdinal: number;
  readonly deathOrdinal: number;
  readonly protectedUntilTickExclusive: number;
  readonly respawnEligibleAtTick: number | null;
  readonly lastSpawnId: string;
  readonly lastDiscontinuity: CombatDiscontinuity;
  readonly damageContributions: readonly CombatDamageContribution[];
  readonly lastProcessedCombatEventSequence: number;
}

export interface CreateCombatLifeStateOptions {
  readonly playerId: string;
  readonly teamId: string | null;
  readonly authorityTick: number;
  readonly authoritySpawnId: string;
}

export interface AuthoritativeDamageRequest {
  readonly eventSequence: number;
  readonly authorityTick: number;
  readonly targetPlayerId: string;
  readonly sourcePlayerId: string | null;
  readonly sourceTeamId: string | null;
  readonly damagePoints: number;
  readonly causeId: string;
  /** Null for non-locational damage such as splash, melee, or admin damage. */
  readonly hitRegion?: CombatHitRegion | null;
}

export type DamageRejectionReason =
  | 'already_dead'
  | 'friendly_fire_blocked'
  | 'self_damage_blocked'
  | 'spawn_protected'
  | 'stale_event_sequence'
  | 'zero_damage';

export interface CombatDamageAppliedEvent {
  readonly kind: 'damage_applied';
  readonly eventId: string;
  readonly eventSequence: number;
  readonly authorityTick: number;
  readonly causeId: string;
  readonly sourcePlayerId: string | null;
  readonly targetPlayerId: string;
  readonly shieldDamagePoints: number;
  readonly healthDamagePoints: number;
  readonly shieldPointsAfter: number;
  readonly healthPointsAfter: number;
  readonly hitRegion: CombatHitRegion | null;
}

export interface CombatDeathEvent {
  readonly kind: 'death';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly victimPlayerId: string;
  readonly killerPlayerId: string | null;
  readonly assistPlayerIds: readonly string[];
  readonly deathOrdinal: number;
  readonly respawnEligibleAtTick: number;
  readonly discontinuitySequence: number;
}

export type ApplyAuthoritativeDamageResult =
  | {
      readonly accepted: true;
      readonly state: CombatLifeState;
      readonly damage: CombatDamageAppliedEvent;
      readonly death: CombatDeathEvent | null;
    }
  | {
      readonly accepted: false;
      readonly state: CombatLifeState;
      readonly reason: DamageRejectionReason;
    };

export interface AuthoritativeRespawnRequest {
  readonly eventSequence: number;
  readonly authorityTick: number;
  readonly authoritySpawnId: string;
  readonly resolvedBy: 'authority_spawn_resolver';
}

export type RespawnRejectionReason =
  | 'already_alive'
  | 'respawn_not_ready'
  | 'stale_event_sequence';

export type ApplyAuthoritativeRespawnResult =
  | {
      readonly accepted: true;
      readonly state: CombatLifeState;
      readonly event: {
        readonly kind: 'respawn';
        readonly eventId: string;
        readonly eventSequence: number;
        readonly authorityTick: number;
        readonly playerId: string;
        readonly authoritySpawnId: string;
        readonly spawnOrdinal: number;
        readonly protectedUntilTickExclusive: number;
        readonly discontinuitySequence: number;
      };
    }
  | {
      readonly accepted: false;
      readonly state: CombatLifeState;
      readonly reason: RespawnRejectionReason;
    };

export interface ApplyAuthoritativeDamageBatchResult {
  readonly states: readonly CombatLifeState[];
  readonly results: readonly ApplyAuthoritativeDamageResult[];
}

function exactKeys(value: object, expected: readonly string[], label: string): void {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} contains unsupported or missing fields`);
  }
}

function stableId(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || new TextEncoder().encode(value).byteLength > MAX_STABLE_ID_BYTES
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(value)
  ) {
    throw new RangeError(`${label} must be a bounded stable identifier`);
  }
  return value;
}

function optionalStableId(value: unknown, label: string): string | null {
  return value === null ? null : stableId(value, label);
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function checkedTickAdd(authorityTick: number, durationTicks: number, label: string): number {
  const result = authorityTick + durationTicks;
  if (!Number.isSafeInteger(result)) throw new RangeError(`${label} exceeds the safe tick range`);
  return result;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

export function assertCombatLifeRules(rules: CombatLifeRulesV1): void {
  if (rules === null || typeof rules !== 'object') throw new TypeError('combat life rules are required');
  exactKeys(rules, [
    'schemaVersion',
    'maximumHealthPoints',
    'maximumShieldPoints',
    'spawnProtectionTicks',
    'spawnProtectionBreaksOnOffense',
    'respawnDelayTicks',
    'assistWindowTicks',
    'minimumAssistHealthDamagePoints',
    'friendlyFireEnabled',
    'selfDamageEnabled',
    'regeneration',
  ], 'combat life rules');
  if (rules.schemaVersion !== 1) throw new RangeError('unsupported combat life rules schema version');
  integer(rules.maximumHealthPoints, 1, MAX_DAMAGE_POINTS, 'maximum health points');
  integer(rules.maximumShieldPoints, 0, MAX_DAMAGE_POINTS, 'maximum shield points');
  integer(rules.spawnProtectionTicks, 0, 100_000, 'spawn protection ticks');
  integer(rules.respawnDelayTicks, 1, 100_000, 'respawn delay ticks');
  integer(rules.assistWindowTicks, 0, 100_000, 'assist window ticks');
  integer(
    rules.minimumAssistHealthDamagePoints,
    1,
    rules.maximumHealthPoints,
    'minimum assist health damage points',
  );
  if (
    typeof rules.spawnProtectionBreaksOnOffense !== 'boolean'
    || typeof rules.friendlyFireEnabled !== 'boolean'
    || typeof rules.selfDamageEnabled !== 'boolean'
  ) {
    throw new TypeError('combat damage policy flags must be booleans');
  }
  if (rules.regeneration === null || typeof rules.regeneration !== 'object') {
    throw new TypeError('combat regeneration policy is required');
  }
  exactKeys(rules.regeneration, ['enabled'], 'combat regeneration policy');
  if (rules.regeneration.enabled !== false) {
    throw new RangeError('P5.1 combat regeneration must remain explicitly disabled');
  }
}

function currentContributions(
  contributions: readonly CombatDamageContribution[],
  authorityTick: number,
  assistWindowTicks: number,
): readonly CombatDamageContribution[] {
  return Object.freeze(contributions.filter((entry) => (
    authorityTick - entry.lastDamageTick <= assistWindowTicks
  )));
}

function updateContribution(
  contributions: readonly CombatDamageContribution[],
  sourcePlayerId: string | null,
  targetPlayerId: string,
  authorityTick: number,
  healthDamagePoints: number,
  shieldDamagePoints: number,
  rules: CombatLifeRulesV1,
): readonly CombatDamageContribution[] {
  const current = currentContributions(contributions, authorityTick, rules.assistWindowTicks);
  if (sourcePlayerId === null || sourcePlayerId === targetPlayerId) return current;
  const prior = current.find((entry) => entry.sourcePlayerId === sourcePlayerId);
  return Object.freeze([
    ...current.filter((entry) => entry.sourcePlayerId !== sourcePlayerId),
    Object.freeze({
      sourcePlayerId,
      lastDamageTick: authorityTick,
      healthDamagePoints: (prior?.healthDamagePoints ?? 0) + healthDamagePoints,
      shieldDamagePoints: (prior?.shieldDamagePoints ?? 0) + shieldDamagePoints,
    }),
  ].sort((left, right) => left.sourcePlayerId.localeCompare(right.sourcePlayerId)));
}

export function createCombatLifeState(
  options: CreateCombatLifeStateOptions,
  rules: CombatLifeRulesV1 = G4_COMBAT_SLICE_LIFE_RULES,
): CombatLifeState {
  assertCombatLifeRules(rules);
  if (options === null || typeof options !== 'object') throw new TypeError('combat life state options are required');
  exactKeys(options, ['playerId', 'teamId', 'authorityTick', 'authoritySpawnId'], 'combat life state options');
  const authorityTick = integer(options.authorityTick, 0, Number.MAX_SAFE_INTEGER, 'authority tick');
  return deepFreeze({
    schemaVersion: 1,
    playerId: stableId(options.playerId, 'player id'),
    teamId: optionalStableId(options.teamId, 'team id'),
    phase: 'alive',
    healthPoints: rules.maximumHealthPoints,
    shieldPoints: rules.maximumShieldPoints,
    spawnOrdinal: 1,
    deathOrdinal: 0,
    protectedUntilTickExclusive: checkedTickAdd(
      authorityTick,
      rules.spawnProtectionTicks,
      'initial spawn protection end tick',
    ),
    respawnEligibleAtTick: null,
    lastSpawnId: stableId(options.authoritySpawnId, 'authority spawn id'),
    lastDiscontinuity: {
      sequence: 1,
      authorityTick,
      reason: 'initial_spawn',
    },
    damageContributions: [],
    lastProcessedCombatEventSequence: -1,
  } satisfies CombatLifeState);
}

export function endSpawnProtectionOnAcceptedOffense(
  state: CombatLifeState,
  authorityTickInput: number,
  rules: CombatLifeRulesV1 = G4_COMBAT_SLICE_LIFE_RULES,
): CombatLifeState {
  assertCombatLifeRules(rules);
  const authorityTick = integer(
    authorityTickInput,
    state.lastDiscontinuity.authorityTick,
    Number.MAX_SAFE_INTEGER,
    'offensive action authority tick',
  );
  if (
    !rules.spawnProtectionBreaksOnOffense
    || state.phase !== 'alive'
    || authorityTick >= state.protectedUntilTickExclusive
  ) {
    return state;
  }
  return deepFreeze({
    ...state,
    protectedUntilTickExclusive: authorityTick,
  } satisfies CombatLifeState);
}

function validateDamageRequest(request: AuthoritativeDamageRequest): AuthoritativeDamageRequest {
  if (request === null || typeof request !== 'object') throw new TypeError('authoritative damage request is required');
  const allowed = new Set([
    'eventSequence',
    'authorityTick',
    'targetPlayerId',
    'sourcePlayerId',
    'sourceTeamId',
    'damagePoints',
    'causeId',
    'hitRegion',
  ]);
  const keys = Object.keys(request);
  if (
    keys.some((key) => !allowed.has(key))
    || [
      'eventSequence',
      'authorityTick',
      'targetPlayerId',
      'sourcePlayerId',
      'sourceTeamId',
      'damagePoints',
      'causeId',
    ].some((key) => !keys.includes(key))
  ) {
    throw new TypeError('authoritative damage request contains unsupported or missing fields');
  }
  const hitRegion = request.hitRegion ?? null;
  if (hitRegion !== null && hitRegion !== 'head' && hitRegion !== 'torso' && hitRegion !== 'limb') {
    throw new RangeError('damage hit region must be head, torso, limb, or null');
  }
  return Object.freeze({
    eventSequence: integer(request.eventSequence, 0, Number.MAX_SAFE_INTEGER, 'damage event sequence'),
    authorityTick: integer(request.authorityTick, 0, Number.MAX_SAFE_INTEGER, 'damage authority tick'),
    targetPlayerId: stableId(request.targetPlayerId, 'damage target player id'),
    sourcePlayerId: optionalStableId(request.sourcePlayerId, 'damage source player id'),
    sourceTeamId: optionalStableId(request.sourceTeamId, 'damage source team id'),
    damagePoints: integer(request.damagePoints, 0, MAX_DAMAGE_POINTS, 'damage points'),
    causeId: stableId(request.causeId, 'damage cause id'),
    hitRegion,
  });
}

export function applyAuthoritativeDamage(
  state: CombatLifeState,
  requestInput: AuthoritativeDamageRequest,
  rules: CombatLifeRulesV1 = G4_COMBAT_SLICE_LIFE_RULES,
): ApplyAuthoritativeDamageResult {
  assertCombatLifeRules(rules);
  const request = validateDamageRequest(requestInput);
  if (request.targetPlayerId !== state.playerId) throw new RangeError('damage target does not match life state');
  if (request.eventSequence <= state.lastProcessedCombatEventSequence) {
    return Object.freeze({ accepted: false, state, reason: 'stale_event_sequence' });
  }
  if (state.phase === 'dead') return Object.freeze({ accepted: false, state, reason: 'already_dead' });
  if (request.damagePoints === 0) return Object.freeze({ accepted: false, state, reason: 'zero_damage' });
  if (request.authorityTick < state.protectedUntilTickExclusive) {
    return Object.freeze({ accepted: false, state, reason: 'spawn_protected' });
  }
  if (request.sourcePlayerId === state.playerId && !rules.selfDamageEnabled) {
    return Object.freeze({ accepted: false, state, reason: 'self_damage_blocked' });
  }
  if (
    request.sourcePlayerId !== null
    && request.sourcePlayerId !== state.playerId
    && request.sourceTeamId !== null
    && state.teamId !== null
    && request.sourceTeamId === state.teamId
    && !rules.friendlyFireEnabled
  ) {
    return Object.freeze({ accepted: false, state, reason: 'friendly_fire_blocked' });
  }

  const shieldDamagePoints = Math.min(state.shieldPoints, request.damagePoints);
  const healthDamagePoints = Math.min(
    state.healthPoints,
    request.damagePoints - shieldDamagePoints,
  );
  const shieldPointsAfter = state.shieldPoints - shieldDamagePoints;
  const healthPointsAfter = state.healthPoints - healthDamagePoints;
  const lethal = healthPointsAfter === 0;
  const deathOrdinal = state.deathOrdinal + (lethal ? 1 : 0);
  const discontinuitySequence = state.lastDiscontinuity.sequence + (lethal ? 1 : 0);
  const contributions = updateContribution(
    state.damageContributions,
    request.sourcePlayerId,
    state.playerId,
    request.authorityTick,
    healthDamagePoints,
    shieldDamagePoints,
    rules,
  );
  const respawnEligibleAtTick = lethal
    ? checkedTickAdd(request.authorityTick, rules.respawnDelayTicks, 'respawn eligible tick')
    : null;
  const nextState = deepFreeze({
    ...state,
    phase: lethal ? 'dead' : 'alive',
    healthPoints: healthPointsAfter,
    shieldPoints: shieldPointsAfter,
    deathOrdinal,
    respawnEligibleAtTick,
    lastDiscontinuity: lethal
      ? {
          sequence: discontinuitySequence,
          authorityTick: request.authorityTick,
          reason: 'death',
        }
      : state.lastDiscontinuity,
    damageContributions: lethal ? [] : contributions,
    lastProcessedCombatEventSequence: request.eventSequence,
  } satisfies CombatLifeState);
  const damage = deepFreeze({
    kind: 'damage_applied',
    eventId: `combat.damage.${request.eventSequence}`,
    eventSequence: request.eventSequence,
    authorityTick: request.authorityTick,
    causeId: request.causeId,
    sourcePlayerId: request.sourcePlayerId,
    targetPlayerId: state.playerId,
    shieldDamagePoints,
    healthDamagePoints,
    shieldPointsAfter,
    healthPointsAfter,
    hitRegion: request.hitRegion ?? null,
  } satisfies CombatDamageAppliedEvent);

  let death: CombatDeathEvent | null = null;
  if (lethal) {
    const assists = contributions
      .filter((entry) => (
        entry.sourcePlayerId !== request.sourcePlayerId
        && entry.healthDamagePoints >= rules.minimumAssistHealthDamagePoints
      ))
      .map((entry) => entry.sourcePlayerId)
      .sort();
    death = deepFreeze({
      kind: 'death',
      eventId: `combat.death.${request.eventSequence}`,
      authorityTick: request.authorityTick,
      victimPlayerId: state.playerId,
      killerPlayerId: request.sourcePlayerId,
      assistPlayerIds: assists,
      deathOrdinal,
      respawnEligibleAtTick: respawnEligibleAtTick as number,
      discontinuitySequence,
    });
  }
  return Object.freeze({ accepted: true, state: nextState, damage, death });
}

function validateRespawnRequest(request: AuthoritativeRespawnRequest): AuthoritativeRespawnRequest {
  if (request === null || typeof request !== 'object') throw new TypeError('authoritative respawn request is required');
  exactKeys(
    request,
    ['eventSequence', 'authorityTick', 'authoritySpawnId', 'resolvedBy'],
    'authoritative respawn request',
  );
  if (request.resolvedBy !== 'authority_spawn_resolver') {
    throw new RangeError('respawn request must come from the authority spawn resolver');
  }
  return Object.freeze({
    eventSequence: integer(request.eventSequence, 0, Number.MAX_SAFE_INTEGER, 'respawn event sequence'),
    authorityTick: integer(request.authorityTick, 0, Number.MAX_SAFE_INTEGER, 'respawn authority tick'),
    authoritySpawnId: stableId(request.authoritySpawnId, 'authority spawn id'),
    resolvedBy: request.resolvedBy,
  });
}

export function applyAuthoritativeRespawn(
  state: CombatLifeState,
  requestInput: AuthoritativeRespawnRequest,
  rules: CombatLifeRulesV1 = G4_COMBAT_SLICE_LIFE_RULES,
): ApplyAuthoritativeRespawnResult {
  assertCombatLifeRules(rules);
  const request = validateRespawnRequest(requestInput);
  if (request.eventSequence <= state.lastProcessedCombatEventSequence) {
    return Object.freeze({ accepted: false, state, reason: 'stale_event_sequence' });
  }
  if (state.phase === 'alive') return Object.freeze({ accepted: false, state, reason: 'already_alive' });
  if (state.respawnEligibleAtTick === null || request.authorityTick < state.respawnEligibleAtTick) {
    return Object.freeze({ accepted: false, state, reason: 'respawn_not_ready' });
  }
  const spawnOrdinal = state.spawnOrdinal + 1;
  const discontinuitySequence = state.lastDiscontinuity.sequence + 1;
  const protectedUntilTickExclusive = checkedTickAdd(
    request.authorityTick,
    rules.spawnProtectionTicks,
    'respawn protection end tick',
  );
  const nextState = deepFreeze({
    ...state,
    phase: 'alive',
    healthPoints: rules.maximumHealthPoints,
    shieldPoints: rules.maximumShieldPoints,
    spawnOrdinal,
    protectedUntilTickExclusive,
    respawnEligibleAtTick: null,
    lastSpawnId: request.authoritySpawnId,
    lastDiscontinuity: {
      sequence: discontinuitySequence,
      authorityTick: request.authorityTick,
      reason: 'respawn',
    },
    damageContributions: [],
    lastProcessedCombatEventSequence: request.eventSequence,
  } satisfies CombatLifeState);
  return deepFreeze({
    accepted: true,
    state: nextState,
    event: {
      kind: 'respawn',
      eventId: `combat.respawn.${request.eventSequence}`,
      eventSequence: request.eventSequence,
      authorityTick: request.authorityTick,
      playerId: state.playerId,
      authoritySpawnId: request.authoritySpawnId,
      spawnOrdinal,
      protectedUntilTickExclusive,
      discontinuitySequence,
    },
  });
}

export function applyAuthoritativeDamageBatch(
  initialStates: readonly CombatLifeState[],
  requests: readonly AuthoritativeDamageRequest[],
  rules: CombatLifeRulesV1 = G4_COMBAT_SLICE_LIFE_RULES,
): ApplyAuthoritativeDamageBatchResult {
  assertCombatLifeRules(rules);
  const states = new Map<string, CombatLifeState>();
  for (const state of initialStates) {
    if (states.has(state.playerId)) throw new RangeError(`duplicate combat life state ${state.playerId}`);
    states.set(state.playerId, state);
  }
  const validated = requests.map(validateDamageRequest);
  const eventSequences = new Set<number>();
  for (const request of validated) {
    if (eventSequences.has(request.eventSequence)) {
      throw new RangeError(`duplicate batch damage event sequence ${request.eventSequence}`);
    }
    eventSequences.add(request.eventSequence);
  }
  const ordered = [...validated].sort((left, right) => (
    left.authorityTick - right.authorityTick
    || left.eventSequence - right.eventSequence
  ));
  const results: ApplyAuthoritativeDamageResult[] = [];
  for (const request of ordered) {
    const state = states.get(request.targetPlayerId);
    if (!state) throw new RangeError(`damage target state not found: ${request.targetPlayerId}`);
    const result = applyAuthoritativeDamage(state, request, rules);
    states.set(request.targetPlayerId, result.state);
    results.push(result);
  }
  return Object.freeze({
    states: Object.freeze([...states.values()].sort((left, right) => (
      left.playerId.localeCompare(right.playerId)
    ))),
    results: Object.freeze(results),
  });
}
