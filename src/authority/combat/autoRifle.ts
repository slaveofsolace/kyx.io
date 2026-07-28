const MAX_STABLE_ID_BYTES = 96;
const MAX_SAFE_AUTHORITY_TICK = Number.MAX_SAFE_INTEGER - 100_000;
const UINT32_MAX = 0xffff_ffff;

export const AUTO_RIFLE_WEAPON_ID = 'vertical_rifle_v1' as const;
export const AUTO_RIFLE_RECOIL_PATTERN_ID = 'kyx_auto_rifle_12_v1' as const;

export type AutoRiflePhase =
  | 'holstered'
  | 'equipping'
  | 'ready'
  | 'firing'
  | 'recovering'
  | 'reloading'
  | 'sprinting'
  | 'empty'
  | 'dead';

export interface AutoRifleRulesV1 {
  readonly schemaVersion: 1;
  readonly weaponId: typeof AUTO_RIFLE_WEAPON_ID;
  readonly authorityHz: 20;
  readonly referenceDamagePoints: 10;
  readonly pelletsPerShot: 1;
  readonly headMultiplierPermille: 1_750;
  readonly limbMultiplierPermille: 1_000;
  readonly rangeMillimeters: 120_000;
  readonly magazineCapacity: 50;
  readonly reserveCapacity: 150;
  readonly shotCooldownTicks: 2;
  readonly reloadDurationTicks: 60;
  readonly readyDurationTicks: 4;
  readonly autoReloadEnabled: true;
  readonly firingBlockedWhileSprinting: true;
  readonly reloadTransferPolicy: 'completion_tick_once';
  readonly reloadInterruptionPolicy: 'fire_or_sprint_before_transfer_death_always';
  readonly sprintReleasePolicy: 'ready_delay';
  readonly recoilPatternId: typeof AUTO_RIFLE_RECOIL_PATTERN_ID;
  readonly recoilPatternLength: 12;
  readonly baseSpreadMilliDegrees: 0;
  readonly maximumSpreadMilliDegrees: 1_146;
}

/**
 * Immutable P5.2 implementation fixture. It is not a playable ruleset record
 * and does not enable combat in the authority room.
 */
export const G4_AUTO_RIFLE_RULES: AutoRifleRulesV1 = Object.freeze({
  schemaVersion: 1,
  weaponId: AUTO_RIFLE_WEAPON_ID,
  authorityHz: 20,
  referenceDamagePoints: 10,
  pelletsPerShot: 1,
  headMultiplierPermille: 1_750,
  limbMultiplierPermille: 1_000,
  rangeMillimeters: 120_000,
  magazineCapacity: 50,
  reserveCapacity: 150,
  shotCooldownTicks: 2,
  reloadDurationTicks: 60,
  readyDurationTicks: 4,
  autoReloadEnabled: true,
  firingBlockedWhileSprinting: true,
  reloadTransferPolicy: 'completion_tick_once',
  reloadInterruptionPolicy: 'fire_or_sprint_before_transfer_death_always',
  sprintReleasePolicy: 'ready_delay',
  recoilPatternId: AUTO_RIFLE_RECOIL_PATTERN_ID,
  recoilPatternLength: 12,
  baseSpreadMilliDegrees: 0,
  maximumSpreadMilliDegrees: 1_146,
});

export type AutoRifleReloadSource = 'manual' | 'auto';

export interface AutoRifleActiveReload {
  readonly reloadOrdinal: number;
  readonly source: AutoRifleReloadSource;
  readonly startedAtTick: number;
  readonly completesAtTick: number;
}

export interface AutoRifleState {
  readonly schemaVersion: 1;
  readonly playerId: string;
  readonly weaponId: typeof AUTO_RIFLE_WEAPON_ID;
  readonly phase: AutoRiflePhase;
  readonly magazineRounds: number;
  readonly reserveRounds: number;
  readonly nextShotAtTick: number;
  readonly readyAtTick: number | null;
  readonly activeReload: AutoRifleActiveReload | null;
  readonly reloadOrdinal: number;
  readonly completedReloadOrdinal: number;
  readonly acceptedShotCount: number;
  readonly ballisticsSeed: number;
  readonly eventNamespace: string;
  readonly lastProcessedAuthorityTick: number;
  readonly lastProcessedAuthorityInputSequence: number;
}

export interface CreateAutoRifleStateOptions {
  readonly playerId: string;
  readonly roomSeed: string;
  readonly authorityTick: number;
}

/**
 * A room-normalized input sampled exactly once per authority step. It contains
 * intent and authority-owned life/selection state only. Client claims about
 * transforms, hits, damage, ammo, cooldowns, or shot time are not accepted.
 */
export interface AutoRifleAuthorityTickInput {
  readonly authorityTick: number;
  readonly authorityInputSequence: number;
  readonly lifePhase: 'alive' | 'dead';
  readonly weaponSelected: boolean;
  readonly sprintHeld: boolean;
  readonly fireHeld: boolean;
  readonly reloadPressed: boolean;
}

export interface AutoRifleBallisticsSample {
  readonly patternId: typeof AUTO_RIFLE_RECOIL_PATTERN_ID;
  readonly patternIndex: number;
  readonly recoilPitchMilliDegrees: number;
  readonly recoilYawMilliDegrees: number;
  readonly spreadRadiusMilliDegrees: number;
  readonly spreadPitchMilliDegrees: number;
  readonly spreadYawMilliDegrees: number;
}

export interface AutoRifleShotAcceptedEvent {
  readonly kind: 'auto_rifle_shot_accepted';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly weaponId: typeof AUTO_RIFLE_WEAPON_ID;
  readonly shotOrdinal: number;
  readonly referenceDamagePoints: 10;
  readonly magazineRoundsAfter: number;
  readonly reserveRoundsAfter: number;
  readonly nextShotAtTick: number;
  readonly ballistics: AutoRifleBallisticsSample;
}

export interface AutoRifleReloadStartedEvent {
  readonly kind: 'auto_rifle_reload_started';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly source: AutoRifleReloadSource;
  readonly reloadOrdinal: number;
  readonly magazineRoundsBefore: number;
  readonly reserveRoundsBefore: number;
  readonly completesAtTick: number;
}

export interface AutoRifleReloadCompletedEvent {
  readonly kind: 'auto_rifle_reload_completed';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly reloadOrdinal: number;
  readonly roundsTransferred: number;
  readonly magazineRoundsAfter: number;
  readonly reserveRoundsAfter: number;
}

export interface AutoRifleReloadCancelledEvent {
  readonly kind: 'auto_rifle_reload_cancelled';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly reloadOrdinal: number;
  readonly reason: 'fire' | 'sprint' | 'death' | 'holster';
}

export type AutoRifleEvent =
  | AutoRifleShotAcceptedEvent
  | AutoRifleReloadStartedEvent
  | AutoRifleReloadCompletedEvent
  | AutoRifleReloadCancelledEvent;

export type AutoRifleFireRejectionReason =
  | 'dead'
  | 'holstered'
  | 'not_ready'
  | 'sprinting'
  | 'reloading'
  | 'empty'
  | 'cadence';

export type AutoRifleTickRejectionReason =
  | 'replayed_authority_tick'
  | 'stale_authority_tick'
  | 'replayed_authority_input_sequence'
  | 'stale_authority_input_sequence';

export type AdvanceAutoRifleResult =
  | {
      readonly accepted: true;
      readonly state: AutoRifleState;
      readonly events: readonly AutoRifleEvent[];
      readonly shot: AutoRifleShotAcceptedEvent | null;
      readonly fireRejection: AutoRifleFireRejectionReason | null;
    }
  | {
      readonly accepted: false;
      readonly state: AutoRifleState;
      readonly reason: AutoRifleTickRejectionReason;
    };

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

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean`);
  return value;
}

function checkedTickAdd(authorityTick: number, durationTicks: number, label: string): number {
  const result = authorityTick + durationTicks;
  if (!Number.isSafeInteger(result) || result > MAX_SAFE_AUTHORITY_TICK) {
    throw new RangeError(`${label} exceeds the safe authority tick range`);
  }
  return result;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function requireLiteral(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) throw new RangeError(`${label} must equal ${String(expected)}`);
}

export function assertAutoRifleRules(rules: AutoRifleRulesV1): void {
  if (rules === null || typeof rules !== 'object') throw new TypeError('auto rifle rules are required');
  exactKeys(rules, [
    'schemaVersion',
    'weaponId',
    'authorityHz',
    'referenceDamagePoints',
    'pelletsPerShot',
    'headMultiplierPermille',
    'limbMultiplierPermille',
    'rangeMillimeters',
    'magazineCapacity',
    'reserveCapacity',
    'shotCooldownTicks',
    'reloadDurationTicks',
    'readyDurationTicks',
    'autoReloadEnabled',
    'firingBlockedWhileSprinting',
    'reloadTransferPolicy',
    'reloadInterruptionPolicy',
    'sprintReleasePolicy',
    'recoilPatternId',
    'recoilPatternLength',
    'baseSpreadMilliDegrees',
    'maximumSpreadMilliDegrees',
  ], 'auto rifle rules');
  requireLiteral(rules.schemaVersion, 1, 'auto rifle schema version');
  requireLiteral(rules.weaponId, AUTO_RIFLE_WEAPON_ID, 'auto rifle weapon id');
  requireLiteral(rules.authorityHz, 20, 'auto rifle authority rate');
  requireLiteral(rules.referenceDamagePoints, 10, 'auto rifle reference damage');
  requireLiteral(rules.pelletsPerShot, 1, 'auto rifle pellets per shot');
  requireLiteral(rules.headMultiplierPermille, 1_750, 'auto rifle head multiplier');
  requireLiteral(rules.limbMultiplierPermille, 1_000, 'auto rifle limb multiplier');
  requireLiteral(rules.rangeMillimeters, 120_000, 'auto rifle range');
  requireLiteral(rules.magazineCapacity, 50, 'auto rifle magazine capacity');
  requireLiteral(rules.reserveCapacity, 150, 'auto rifle reserve capacity');
  requireLiteral(rules.shotCooldownTicks, 2, 'auto rifle shot cooldown');
  requireLiteral(rules.reloadDurationTicks, 60, 'auto rifle reload duration');
  requireLiteral(rules.readyDurationTicks, 4, 'auto rifle ready duration');
  requireLiteral(rules.autoReloadEnabled, true, 'auto rifle auto reload policy');
  requireLiteral(
    rules.firingBlockedWhileSprinting,
    true,
    'auto rifle sprint fire policy',
  );
  requireLiteral(
    rules.reloadTransferPolicy,
    'completion_tick_once',
    'auto rifle reload transfer policy',
  );
  requireLiteral(
    rules.reloadInterruptionPolicy,
    'fire_or_sprint_before_transfer_death_always',
    'auto rifle reload interruption policy',
  );
  requireLiteral(rules.sprintReleasePolicy, 'ready_delay', 'auto rifle sprint release policy');
  requireLiteral(rules.recoilPatternId, AUTO_RIFLE_RECOIL_PATTERN_ID, 'auto rifle recoil pattern');
  requireLiteral(rules.recoilPatternLength, 12, 'auto rifle recoil pattern length');
  requireLiteral(rules.baseSpreadMilliDegrees, 0, 'auto rifle base spread');
  requireLiteral(rules.maximumSpreadMilliDegrees, 1_146, 'auto rifle maximum spread');
}

const AUTO_RIFLE_PHASES = new Set<AutoRiflePhase>([
  'holstered',
  'equipping',
  'ready',
  'firing',
  'recovering',
  'reloading',
  'sprinting',
  'empty',
  'dead',
]);

export function assertAutoRifleState(
  state: AutoRifleState,
  rules: AutoRifleRulesV1 = G4_AUTO_RIFLE_RULES,
): void {
  assertAutoRifleRules(rules);
  if (state === null || typeof state !== 'object') throw new TypeError('auto rifle state is required');
  exactKeys(state, [
    'schemaVersion',
    'playerId',
    'weaponId',
    'phase',
    'magazineRounds',
    'reserveRounds',
    'nextShotAtTick',
    'readyAtTick',
    'activeReload',
    'reloadOrdinal',
    'completedReloadOrdinal',
    'acceptedShotCount',
    'ballisticsSeed',
    'eventNamespace',
    'lastProcessedAuthorityTick',
    'lastProcessedAuthorityInputSequence',
  ], 'auto rifle state');
  requireLiteral(state.schemaVersion, 1, 'auto rifle state schema version');
  stableId(state.playerId, 'auto rifle state player id');
  requireLiteral(state.weaponId, rules.weaponId, 'auto rifle state weapon id');
  if (!AUTO_RIFLE_PHASES.has(state.phase)) throw new RangeError('auto rifle state phase is invalid');
  integer(state.magazineRounds, 0, rules.magazineCapacity, 'auto rifle magazine rounds');
  integer(state.reserveRounds, 0, rules.reserveCapacity, 'auto rifle reserve rounds');
  integer(state.nextShotAtTick, 0, MAX_SAFE_AUTHORITY_TICK, 'auto rifle next shot tick');
  if (state.readyAtTick !== null) {
    integer(state.readyAtTick, 0, MAX_SAFE_AUTHORITY_TICK, 'auto rifle ready tick');
  }
  integer(state.reloadOrdinal, 0, Number.MAX_SAFE_INTEGER, 'auto rifle reload ordinal');
  integer(
    state.completedReloadOrdinal,
    0,
    state.reloadOrdinal,
    'auto rifle completed reload ordinal',
  );
  integer(state.acceptedShotCount, 0, Number.MAX_SAFE_INTEGER, 'auto rifle accepted shot count');
  integer(state.ballisticsSeed, 0, UINT32_MAX, 'auto rifle ballistics seed');
  if (!/^[a-f0-9]{16}$/u.test(state.eventNamespace)) {
    throw new RangeError('auto rifle event namespace must be lowercase 64-bit hexadecimal');
  }
  integer(
    state.lastProcessedAuthorityTick,
    -1,
    MAX_SAFE_AUTHORITY_TICK,
    'auto rifle last processed authority tick',
  );
  integer(
    state.lastProcessedAuthorityInputSequence,
    -1,
    Number.MAX_SAFE_INTEGER,
    'auto rifle last processed authority input sequence',
  );

  if (state.activeReload === null) {
    if (state.phase === 'reloading') throw new RangeError('reloading phase requires an active reload');
  } else {
    exactKeys(
      state.activeReload,
      ['reloadOrdinal', 'source', 'startedAtTick', 'completesAtTick'],
      'auto rifle active reload',
    );
    integer(
      state.activeReload.reloadOrdinal,
      1,
      state.reloadOrdinal,
      'auto rifle active reload ordinal',
    );
    if (state.activeReload.reloadOrdinal <= state.completedReloadOrdinal) {
      throw new RangeError('active reload was already completed');
    }
    if (state.activeReload.reloadOrdinal !== state.reloadOrdinal) {
      throw new RangeError('active reload must be the latest reload ordinal');
    }
    if (state.activeReload.source !== 'manual' && state.activeReload.source !== 'auto') {
      throw new RangeError('auto rifle active reload source is invalid');
    }
    integer(
      state.activeReload.startedAtTick,
      0,
      MAX_SAFE_AUTHORITY_TICK,
      'auto rifle reload start tick',
    );
    integer(
      state.activeReload.completesAtTick,
      0,
      MAX_SAFE_AUTHORITY_TICK,
      'auto rifle reload completion tick',
    );
    if (
      state.activeReload.completesAtTick
      !== state.activeReload.startedAtTick + rules.reloadDurationTicks
    ) {
      throw new RangeError('auto rifle reload duration does not match the pinned rules');
    }
    if (state.phase !== 'reloading') throw new RangeError('active reload requires reloading phase');
  }
  if (state.phase === 'equipping' && state.readyAtTick === null) {
    throw new RangeError('equipping phase requires a ready tick');
  }
  if (
    state.phase !== 'equipping'
    && state.phase !== 'recovering'
    && state.readyAtTick !== null
  ) {
    throw new RangeError('ready tick is only valid while equipping or recovering');
  }
}

function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function fnv1a64Hex(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, '0');
}

function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

export function createAutoRifleState(
  options: CreateAutoRifleStateOptions,
  rules: AutoRifleRulesV1 = G4_AUTO_RIFLE_RULES,
): AutoRifleState {
  assertAutoRifleRules(rules);
  if (options === null || typeof options !== 'object') {
    throw new TypeError('auto rifle state options are required');
  }
  exactKeys(options, ['playerId', 'roomSeed', 'authorityTick'], 'auto rifle state options');
  const playerId = stableId(options.playerId, 'auto rifle player id');
  const roomSeed = stableId(options.roomSeed, 'auto rifle room seed');
  const authorityTick = integer(
    options.authorityTick,
    0,
    MAX_SAFE_AUTHORITY_TICK,
    'auto rifle initial authority tick',
  );
  const state = deepFreeze({
    schemaVersion: 1,
    playerId,
    weaponId: rules.weaponId,
    phase: 'holstered',
    magazineRounds: rules.magazineCapacity,
    reserveRounds: rules.reserveCapacity,
    nextShotAtTick: authorityTick,
    readyAtTick: null,
    activeReload: null,
    reloadOrdinal: 0,
    completedReloadOrdinal: 0,
    acceptedShotCount: 0,
    ballisticsSeed: fnv1a32(`${roomSeed}:${playerId}:${rules.recoilPatternId}`),
    eventNamespace: fnv1a64Hex(`${roomSeed}:${playerId}`),
    lastProcessedAuthorityTick: authorityTick - 1,
    lastProcessedAuthorityInputSequence: -1,
  } satisfies AutoRifleState);
  assertAutoRifleState(state, rules);
  return state;
}

function validateTickInput(input: AutoRifleAuthorityTickInput): AutoRifleAuthorityTickInput {
  if (input === null || typeof input !== 'object') {
    throw new TypeError('auto rifle authority tick input is required');
  }
  exactKeys(input, [
    'authorityTick',
    'authorityInputSequence',
    'lifePhase',
    'weaponSelected',
    'sprintHeld',
    'fireHeld',
    'reloadPressed',
  ], 'auto rifle authority tick input');
  if (input.lifePhase !== 'alive' && input.lifePhase !== 'dead') {
    throw new RangeError('auto rifle life phase must be alive or dead');
  }
  return Object.freeze({
    authorityTick: integer(
      input.authorityTick,
      0,
      MAX_SAFE_AUTHORITY_TICK,
      'auto rifle authority tick',
    ),
    authorityInputSequence: integer(
      input.authorityInputSequence,
      0,
      Number.MAX_SAFE_INTEGER,
      'auto rifle authority input sequence',
    ),
    lifePhase: input.lifePhase,
    weaponSelected: bool(input.weaponSelected, 'auto rifle selected flag'),
    sprintHeld: bool(input.sprintHeld, 'auto rifle sprint intent'),
    fireHeld: bool(input.fireHeld, 'auto rifle fire intent'),
    reloadPressed: bool(input.reloadPressed, 'auto rifle reload intent'),
  });
}

const SPREAD_DIRECTIONS = Object.freeze([
  Object.freeze([1_024, 0]),
  Object.freeze([946, 392]),
  Object.freeze([724, 724]),
  Object.freeze([392, 946]),
  Object.freeze([0, 1_024]),
  Object.freeze([-392, 946]),
  Object.freeze([-724, 724]),
  Object.freeze([-946, 392]),
  Object.freeze([-1_024, 0]),
  Object.freeze([-946, -392]),
  Object.freeze([-724, -724]),
  Object.freeze([-392, -946]),
  Object.freeze([0, -1_024]),
  Object.freeze([392, -946]),
  Object.freeze([724, -724]),
  Object.freeze([946, -392]),
] as const);

function ballisticsSample(
  state: AutoRifleState,
  rules: AutoRifleRulesV1,
): AutoRifleBallisticsSample {
  const patternIndex = state.acceptedShotCount % rules.recoilPatternLength;
  const sampleA = mix32(
    state.ballisticsSeed ^ Math.imul(patternIndex + 1, 0x9e3779b9),
  );
  const sampleB = mix32(sampleA ^ 0xa511e9b3);
  const sampleC = mix32(sampleB ^ 0x63d83595);
  const spreadRadiusMilliDegrees = sampleA % (rules.maximumSpreadMilliDegrees + 1);
  const direction = SPREAD_DIRECTIONS[sampleB % SPREAD_DIRECTIONS.length];
  const spreadYawMilliDegrees = Math.round(
    (spreadRadiusMilliDegrees * direction[0]) / 1_024,
  );
  const spreadPitchMilliDegrees = Math.round(
    (spreadRadiusMilliDegrees * direction[1]) / 1_024,
  );
  const recoilPitchMilliDegrees = 250 + (sampleB % 897);
  const recoilYawMilliDegrees = (sampleC % 1_147) - 573;
  return deepFreeze({
    patternId: rules.recoilPatternId,
    patternIndex,
    recoilPitchMilliDegrees,
    recoilYawMilliDegrees,
    spreadRadiusMilliDegrees,
    spreadPitchMilliDegrees,
    spreadYawMilliDegrees,
  });
}

function withProcessedInput(
  state: AutoRifleState,
  input: AutoRifleAuthorityTickInput,
): AutoRifleState {
  return {
    ...state,
    lastProcessedAuthorityTick: input.authorityTick,
    lastProcessedAuthorityInputSequence: input.authorityInputSequence,
  };
}

export function advanceAutoRifle(
  stateInput: AutoRifleState,
  inputValue: AutoRifleAuthorityTickInput,
  rules: AutoRifleRulesV1 = G4_AUTO_RIFLE_RULES,
): AdvanceAutoRifleResult {
  assertAutoRifleState(stateInput, rules);
  const input = validateTickInput(inputValue);
  if (input.authorityTick === stateInput.lastProcessedAuthorityTick) {
    return deepFreeze({
      accepted: false,
      state: stateInput,
      reason: 'replayed_authority_tick',
    });
  }
  if (input.authorityTick < stateInput.lastProcessedAuthorityTick) {
    return deepFreeze({ accepted: false, state: stateInput, reason: 'stale_authority_tick' });
  }
  if (input.authorityInputSequence === stateInput.lastProcessedAuthorityInputSequence) {
    return deepFreeze({
      accepted: false,
      state: stateInput,
      reason: 'replayed_authority_input_sequence',
    });
  }
  if (input.authorityInputSequence < stateInput.lastProcessedAuthorityInputSequence) {
    return deepFreeze({
      accepted: false,
      state: stateInput,
      reason: 'stale_authority_input_sequence',
    });
  }

  let state = withProcessedInput(stateInput, input);
  const events: AutoRifleEvent[] = [];
  let shot: AutoRifleShotAcceptedEvent | null = null;
  let fireRejection: AutoRifleFireRejectionReason | null = null;

  const cancelReload = (reason: AutoRifleReloadCancelledEvent['reason']): void => {
    const reload = state.activeReload;
    if (reload === null) return;
    events.push(deepFreeze({
      kind: 'auto_rifle_reload_cancelled',
      eventId: `combat.auto_rifle.reload_cancelled.${state.eventNamespace}.${reload.reloadOrdinal}`,
      authorityTick: input.authorityTick,
      playerId: state.playerId,
      reloadOrdinal: reload.reloadOrdinal,
      reason,
    } satisfies AutoRifleReloadCancelledEvent));
    state = { ...state, activeReload: null };
  };

  const completeReload = (): void => {
    const reload = state.activeReload;
    if (reload === null || input.authorityTick < reload.completesAtTick) return;
    if (reload.reloadOrdinal <= state.completedReloadOrdinal) {
      throw new RangeError('auto rifle reload transfer was already applied');
    }
    const roundsTransferred = Math.min(
      rules.magazineCapacity - state.magazineRounds,
      state.reserveRounds,
    );
    const magazineRounds = state.magazineRounds + roundsTransferred;
    const reserveRounds = state.reserveRounds - roundsTransferred;
    events.push(deepFreeze({
      kind: 'auto_rifle_reload_completed',
      eventId: `combat.auto_rifle.reload_completed.${state.eventNamespace}.${reload.reloadOrdinal}`,
      authorityTick: input.authorityTick,
      playerId: state.playerId,
      reloadOrdinal: reload.reloadOrdinal,
      roundsTransferred,
      magazineRoundsAfter: magazineRounds,
      reserveRoundsAfter: reserveRounds,
    } satisfies AutoRifleReloadCompletedEvent));
    state = {
      ...state,
      phase: magazineRounds === 0 ? 'empty' : 'ready',
      magazineRounds,
      reserveRounds,
      activeReload: null,
      completedReloadOrdinal: reload.reloadOrdinal,
    };
  };

  const startReload = (source: AutoRifleReloadSource): void => {
    const reloadOrdinal = integer(
      state.reloadOrdinal + 1,
      1,
      Number.MAX_SAFE_INTEGER,
      'auto rifle next reload ordinal',
    );
    const completesAtTick = checkedTickAdd(
      input.authorityTick,
      rules.reloadDurationTicks,
      'auto rifle reload completion tick',
    );
    const activeReload = deepFreeze({
      reloadOrdinal,
      source,
      startedAtTick: input.authorityTick,
      completesAtTick,
    } satisfies AutoRifleActiveReload);
    events.push(deepFreeze({
      kind: 'auto_rifle_reload_started',
      eventId: `combat.auto_rifle.reload_started.${state.eventNamespace}.${reloadOrdinal}`,
      authorityTick: input.authorityTick,
      playerId: state.playerId,
      source,
      reloadOrdinal,
      magazineRoundsBefore: state.magazineRounds,
      reserveRoundsBefore: state.reserveRounds,
      completesAtTick,
    } satisfies AutoRifleReloadStartedEvent));
    state = {
      ...state,
      phase: 'reloading',
      readyAtTick: null,
      activeReload,
      reloadOrdinal,
    };
  };

  const finish = (): AdvanceAutoRifleResult => {
    const frozenState = deepFreeze(state);
    assertAutoRifleState(frozenState, rules);
    return deepFreeze({
      accepted: true,
      state: frozenState,
      events,
      shot,
      fireRejection,
    });
  };

  // Death is ordered before the reload transfer marker, including on the
  // nominal completion tick. This makes death an unconditional interruption.
  if (input.lifePhase === 'dead') {
    cancelReload('death');
    state = { ...state, phase: 'dead', readyAtTick: null, activeReload: null };
    if (input.fireHeld) fireRejection = 'dead';
    return finish();
  }

  if (!input.weaponSelected) {
    cancelReload('holster');
    state = { ...state, phase: 'holstered', readyAtTick: null, activeReload: null };
    if (input.fireHeld) fireRejection = 'holstered';
    return finish();
  }

  if (stateInput.phase === 'dead' || stateInput.phase === 'holstered') {
    state = {
      ...state,
      phase: 'equipping',
      readyAtTick: checkedTickAdd(
        input.authorityTick,
        rules.readyDurationTicks,
        'auto rifle equip ready tick',
      ),
    };
  } else if (stateInput.phase === 'sprinting' && !input.sprintHeld) {
    state = {
      ...state,
      phase: 'recovering',
      readyAtTick: checkedTickAdd(
        input.authorityTick,
        rules.readyDurationTicks,
        'auto rifle post-sprint ready tick',
      ),
    };
  }

  if (input.sprintHeld && rules.firingBlockedWhileSprinting) {
    if (state.activeReload !== null) {
      if (input.authorityTick >= state.activeReload.completesAtTick) completeReload();
      else cancelReload('sprint');
    }
    state = { ...state, phase: 'sprinting', readyAtTick: null, activeReload: null };
    if (input.fireHeld) fireRejection = 'sprinting';
    return finish();
  }

  if (state.activeReload !== null) {
    if (input.authorityTick >= state.activeReload.completesAtTick) {
      completeReload();
    } else if (input.fireHeld && state.magazineRounds > 0) {
      cancelReload('fire');
      state = { ...state, phase: 'ready' };
    } else {
      state = { ...state, phase: 'reloading', readyAtTick: null };
      if (input.fireHeld) fireRejection = 'reloading';
      return finish();
    }
  }

  if (state.readyAtTick !== null) {
    if (input.authorityTick < state.readyAtTick) {
      if (input.fireHeld) fireRejection = 'not_ready';
      return finish();
    }
    state = { ...state, phase: 'ready', readyAtTick: null };
  }

  if (input.fireHeld) {
    if (state.magazineRounds === 0) {
      state = { ...state, phase: 'empty' };
      fireRejection = 'empty';
      if (rules.autoReloadEnabled && state.reserveRounds > 0) startReload('auto');
      return finish();
    }
    if (input.authorityTick < state.nextShotAtTick) {
      state = { ...state, phase: 'recovering' };
      fireRejection = 'cadence';
      return finish();
    }

    const magazineRounds = state.magazineRounds - 1;
    const shotOrdinal = integer(
      state.acceptedShotCount + 1,
      1,
      Number.MAX_SAFE_INTEGER,
      'auto rifle next shot ordinal',
    );
    const nextShotAtTick = checkedTickAdd(
      input.authorityTick,
      rules.shotCooldownTicks,
      'auto rifle next shot tick',
    );
    shot = deepFreeze({
      kind: 'auto_rifle_shot_accepted',
      eventId: `combat.auto_rifle.shot.${state.eventNamespace}.${shotOrdinal}`,
      authorityTick: input.authorityTick,
      playerId: state.playerId,
      weaponId: rules.weaponId,
      shotOrdinal,
      referenceDamagePoints: rules.referenceDamagePoints,
      magazineRoundsAfter: magazineRounds,
      reserveRoundsAfter: state.reserveRounds,
      nextShotAtTick,
      ballistics: ballisticsSample(state, rules),
    });
    events.push(shot);
    state = {
      ...state,
      phase: magazineRounds === 0 ? 'empty' : 'firing',
      magazineRounds,
      nextShotAtTick,
      acceptedShotCount: shotOrdinal,
    };
    return finish();
  }

  if (
    input.reloadPressed
    && state.magazineRounds < rules.magazineCapacity
    && state.reserveRounds > 0
  ) {
    startReload('manual');
    return finish();
  }

  state = {
    ...state,
    phase: state.magazineRounds === 0
      ? 'empty'
      : input.authorityTick < state.nextShotAtTick
        ? 'recovering'
        : 'ready',
  };
  return finish();
}
