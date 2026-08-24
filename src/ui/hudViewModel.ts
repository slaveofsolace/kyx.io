export const HUD_VIEW_MODEL_SCHEMA_VERSION = 1 as const;

export type HudMode = 'practice' | 'online';
export type HudVitalState = 'stable' | 'low' | 'critical' | 'depleted';
export type HudAmmoState = 'stable' | 'low' | 'empty' | 'reloading' | 'unlimited';
export type HudAbilityState = 'ready' | 'charging' | 'empty' | 'unavailable';
export type HudConnectionState = 'quiet' | 'connecting' | 'reconnecting' | 'fatal';
export type HudLifeState = 'waiting' | 'alive' | 'dead' | 'spectating';

export interface HudVitalViewModel {
  readonly value: number;
  readonly maximum: number;
  readonly ratio: number;
  readonly state: HudVitalState;
  readonly visible: boolean;
}

export interface HudWeaponInput {
  readonly name: string;
  readonly magazineRounds: number | null;
  readonly reserveRounds: number | null;
  readonly magazineCapacity?: number | null;
  readonly isMelee?: boolean;
  readonly isReloading?: boolean;
  readonly isAds?: boolean;
}

export interface HudWeaponViewModel {
  readonly name: string;
  readonly magazineLabel: string;
  readonly reserveLabel: string;
  readonly ammoState: HudAmmoState;
  readonly isMelee: boolean;
  readonly isReloading: boolean;
  readonly isAds: boolean;
  readonly ariaLabel: string;
}

export interface HudAbilityInput {
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly state?: HudAbilityState;
  readonly locked?: boolean;
  readonly available?: boolean;
  readonly charges?: number | null;
  readonly maximumCharges?: number | null;
  readonly cooldownSeconds?: number | null;
  /**
   * Readiness is zero immediately after use and one when the ability is ready.
   * Charges remain the primary readiness source when the runtime exposes them.
   */
  readonly readinessRatio?: number | null;
}

export interface HudAbilityViewModel {
  readonly slot: number;
  readonly id: string;
  readonly name: string;
  readonly key: string;
  readonly locked: boolean;
  readonly charges: number | null;
  readonly maximumCharges: number | null;
  readonly readinessRatio: number;
  readonly cooldownSeconds: number;
  readonly state: HudAbilityState;
  readonly stateLabel: string;
  readonly ariaLabel: string;
}

export interface HudScoreViewModel {
  readonly leftScore: number;
  readonly rightScore: number | null;
  readonly timerLabel: string;
  readonly phaseLabel: string;
  readonly objectiveLabel: string;
}

export interface HudConnectionViewModel {
  readonly state: HudConnectionState;
  readonly message: string;
  readonly canRetry: boolean;
}

export interface HudLifeViewModel {
  readonly state: HudLifeState;
  readonly respawnSeconds: number | null;
  readonly message: string;
}

export interface HudViewModelV1 {
  readonly schemaVersion: typeof HUD_VIEW_MODEL_SCHEMA_VERSION;
  readonly mode: HudMode;
  readonly health: HudVitalViewModel;
  readonly shield: HudVitalViewModel;
  readonly energy: HudVitalViewModel;
  readonly weapon: HudWeaponViewModel;
  readonly abilities: readonly HudAbilityViewModel[];
  readonly score: HudScoreViewModel;
  readonly connection: HudConnectionViewModel;
  readonly life: HudLifeViewModel;
}

interface HudVitalInput {
  readonly value: number;
  readonly maximum: number;
  readonly visible?: boolean;
}

interface SharedHudInput {
  readonly mode: HudMode;
  readonly health: HudVitalInput;
  readonly shield?: HudVitalInput;
  readonly energy?: HudVitalInput;
  readonly weapon: HudWeaponInput;
  readonly abilities?: readonly HudAbilityInput[];
  readonly score: HudScoreViewModel;
  readonly connection?: HudConnectionViewModel;
  readonly life?: HudLifeViewModel;
}

export interface PracticeHudInput {
  readonly player: Readonly<{
    health: number;
    maxHealth: number;
    shield?: number;
    maxShield?: number;
    stamina?: number;
    maxStamina?: number;
  }>;
  readonly weapon: Readonly<{
    name: string;
    isMelee?: boolean;
    magAmmo?: number | null;
    reserveAmmo?: number | null;
    magazineCapacity?: number | null;
    isReloading?: boolean;
    isAds?: boolean;
  }>;
  readonly abilities?: readonly HudAbilityInput[];
  readonly kills: number;
  readonly score: number;
  readonly opponentScore?: number | null;
  readonly timerLabel?: string;
  readonly phaseLabel?: string;
  readonly objectiveLabel?: string;
  readonly life?: HudLifeViewModel;
}

export interface OnlineHudInput {
  readonly health: number;
  readonly maximumHealth?: number;
  readonly shield?: number;
  readonly maximumShield?: number;
  readonly energy?: number;
  readonly maximumEnergy?: number;
  readonly weapon: HudWeaponInput;
  readonly abilities: readonly HudAbilityInput[];
  readonly blueScore: number;
  readonly redScore: number;
  readonly remainingSeconds: number;
  readonly phase: string;
  readonly objective?: string;
  readonly connectionPhase: string;
  readonly connectionError?: string | null;
  readonly lifeState?: HudLifeState;
  readonly respawnTicks?: number | null;
  readonly tickRateHz?: number;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function nonNegative(value: unknown, fallback = 0): number {
  return Math.max(0, finiteNumber(value, fallback));
}

function integer(value: unknown, fallback = 0): number {
  return Math.floor(nonNegative(value, fallback));
}

function clampRatio(value: unknown): number {
  return Math.max(0, Math.min(1, finiteNumber(value)));
}

function cleanLabel(value: unknown, fallback: string, maximumLength = 40): string {
  const normalized = String(value ?? '')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, maximumLength);
  return normalized || fallback;
}

function vitalViewModel(input: HudVitalInput): HudVitalViewModel {
  const maximum = nonNegative(input.maximum);
  const value = Math.min(maximum, nonNegative(input.value));
  const ratio = maximum > 0 ? clampRatio(value / maximum) : 0;
  const visible = input.visible ?? maximum > 0;
  const state: HudVitalState = value <= 0
    ? 'depleted'
    : ratio <= 0.25
      ? 'critical'
      : ratio <= 0.5
        ? 'low'
        : 'stable';
  return Object.freeze({
    value: Math.ceil(value),
    maximum: Math.ceil(maximum),
    ratio,
    state,
    visible,
  });
}

function weaponViewModel(input: HudWeaponInput): HudWeaponViewModel {
  const name = cleanLabel(input.name, 'Weapon', 32);
  const isMelee = input.isMelee === true || input.magazineRounds === null;
  const isReloading = input.isReloading === true;
  const isAds = input.isAds === true;
  const magazineRounds = isMelee ? null : integer(input.magazineRounds);
  const reserveRounds = isMelee ? null : integer(input.reserveRounds);
  const loadedRounds = magazineRounds ?? 0;
  const storedRounds = reserveRounds ?? 0;
  const capacity = isMelee
    ? null
    : Math.max(1, integer(input.magazineCapacity, magazineRounds ?? 1));
  const lowThreshold = capacity === null ? 0 : Math.max(3, Math.ceil(capacity * 0.25));
  const ammoState: HudAmmoState = isMelee
    ? 'unlimited'
    : isReloading
      ? 'reloading'
      : loadedRounds === 0
        ? 'empty'
        : loadedRounds <= lowThreshold
          ? 'low'
          : 'stable';
  const magazineLabel = isMelee ? '∞' : String(loadedRounds);
  const reserveLabel = isMelee ? 'Melee' : String(storedRounds);
  const stateLabel = isReloading
    ? ', reloading'
    : ammoState === 'empty'
      ? ', empty'
      : ammoState === 'low'
        ? ', low ammunition'
        : '';
  const ariaLabel = isMelee
    ? `${name}, melee weapon`
    : `${name}, ${loadedRounds} rounds loaded, ${storedRounds} reserve${stateLabel}${isAds ? ', aiming down sights' : ''}`;
  return Object.freeze({
    name,
    magazineLabel,
    reserveLabel,
    ammoState,
    isMelee,
    isReloading,
    isAds,
    ariaLabel,
  });
}

export function abilityViewModel(
  input: HudAbilityInput,
  slot: number,
): HudAbilityViewModel {
  const id = cleanLabel(input.id, `slot-${slot + 1}`, 40)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9_-]/gu, '');
  const name = cleanLabel(input.name, 'Ability', 24);
  const key = cleanLabel(input.key, String(slot + 1), 4).toLocaleUpperCase();
  const locked = input.locked === true;
  const available = input.available !== false;
  const maximumCharges = input.maximumCharges === null
    || input.maximumCharges === undefined
    ? null
    : Math.max(1, integer(input.maximumCharges, 1));
  const charges = maximumCharges === null
    ? null
    : Math.min(maximumCharges, integer(input.charges));
  const cooldownSeconds = nonNegative(input.cooldownSeconds);
  const inferredRatio = charges !== null && maximumCharges !== null && charges >= maximumCharges
    ? 1
    : cooldownSeconds > 0
      ? 0
      : 1;
  const readinessRatio = clampRatio(input.readinessRatio ?? inferredRatio);
  const state: HudAbilityState = !available
    ? 'unavailable'
    : input.state === 'ready'
      || input.state === 'charging'
      || input.state === 'empty'
      || input.state === 'unavailable'
      ? input.state
      : charges !== null && charges > 0
        ? 'ready'
        : readinessRatio >= 1
          ? 'ready'
          : cooldownSeconds > 0 || readinessRatio > 0
            ? 'charging'
            : 'empty';
  const stateLabel = state === 'ready'
    ? charges !== null && maximumCharges !== null
      ? `${charges}/${maximumCharges}`
      : 'Ready'
    : state === 'charging'
      ? cooldownSeconds >= 0.05
        ? `${cooldownSeconds.toFixed(cooldownSeconds < 10 ? 1 : 0)}s`
        : `${Math.round(readinessRatio * 100)}%`
      : state === 'unavailable'
        ? 'Unavailable'
        : 'Empty';
  const chargeDetail = charges === null || maximumCharges === null
    ? ''
    : `, ${charges} of ${maximumCharges} charges`;
  const cooldownDetail = state === 'charging' && cooldownSeconds > 0
    ? `, next charge in ${cooldownSeconds.toFixed(1)} seconds`
    : '';
  return Object.freeze({
    slot,
    id,
    name,
    key,
    locked,
    charges,
    maximumCharges,
    readinessRatio,
    cooldownSeconds,
    state,
    stateLabel,
    ariaLabel: `${name}, ${key}${locked ? ', fixed loadout slot' : ''}${chargeDetail}${cooldownDetail}, ${state}`,
  });
}

function defaultAbilities(): readonly HudAbilityInput[] {
  return Object.freeze([
    Object.freeze({
      id: 'blink',
      name: 'Blink',
      key: 'Q',
      locked: true,
      readinessRatio: 1,
    }),
    Object.freeze({
      id: 'launch',
      name: 'Launch',
      key: 'E',
      charges: 1,
      maximumCharges: 1,
    }),
    Object.freeze({
      id: 'smoke',
      name: 'Smoke',
      key: 'F',
      charges: 2,
      maximumCharges: 2,
    }),
    Object.freeze({
      id: 'frag',
      name: 'Frag',
      key: 'Z',
      charges: 2,
      maximumCharges: 2,
    }),
  ]);
}

export function formatMatchClock(secondsValue: unknown): string {
  const seconds = integer(secondsValue);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export function connectionViewModel(
  phaseValue: unknown,
  technicalError: unknown = null,
): HudConnectionViewModel {
  const phase = cleanLabel(phaseValue, 'idle', 24).toLocaleLowerCase();
  const hasError = typeof technicalError === 'string' && technicalError.trim().length > 0;
  if (phase === 'joined') {
    return Object.freeze({ state: 'quiet', message: '', canRetry: false });
  }
  if (phase === 'resuming') {
    return Object.freeze({
      state: 'reconnecting',
      message: 'Connection interrupted. Rejoining the room…',
      canRetry: false,
    });
  }
  if (phase === 'connecting' || phase === 'handshaking' || phase === 'joining') {
    return Object.freeze({
      state: 'connecting',
      message: 'Joining the room…',
      canRetry: false,
    });
  }
  if (phase === 'failed' || phase === 'closed' || phase === 'disposed' || hasError) {
    return Object.freeze({
      state: 'fatal',
      message: 'The room connection ended. Start a fresh room or return to the online lobby.',
      canRetry: true,
    });
  }
  if (phase === 'disconnecting') {
    return Object.freeze({
      state: 'reconnecting',
      message: 'Leaving the room…',
      canRetry: false,
    });
  }
  return Object.freeze({ state: 'quiet', message: '', canRetry: false });
}

function defaultLife(): HudLifeViewModel {
  return Object.freeze({
    state: 'alive',
    respawnSeconds: null,
    message: '',
  });
}

function createHudViewModel(input: SharedHudInput): HudViewModelV1 {
  const abilities = (input.abilities ?? defaultAbilities())
    .slice(0, 4)
    .map((ability, slot) => abilityViewModel(ability, slot));
  return Object.freeze({
    schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
    mode: input.mode,
    health: vitalViewModel(input.health),
    shield: vitalViewModel(input.shield ?? { value: 0, maximum: 0, visible: false }),
    energy: vitalViewModel(input.energy ?? { value: 0, maximum: 0, visible: false }),
    weapon: weaponViewModel(input.weapon),
    abilities: Object.freeze(abilities),
    score: Object.freeze({ ...input.score }),
    connection: input.connection ?? Object.freeze({
      state: 'quiet',
      message: '',
      canRetry: false,
    }),
    life: input.life ?? defaultLife(),
  });
}

export function createPracticeHudViewModel(input: PracticeHudInput): HudViewModelV1 {
  return createHudViewModel({
    mode: 'practice',
    health: {
      value: input.player.health,
      maximum: input.player.maxHealth,
    },
    shield: {
      value: input.player.shield ?? 0,
      maximum: input.player.maxShield ?? 0,
      visible: nonNegative(input.player.maxShield) > 0,
    },
    energy: {
      value: input.player.stamina ?? 0,
      maximum: input.player.maxStamina ?? 0,
      visible: nonNegative(input.player.maxStamina) > 0,
    },
    weapon: {
      name: input.weapon.name,
      magazineRounds: input.weapon.isMelee ? null : input.weapon.magAmmo ?? 0,
      reserveRounds: input.weapon.isMelee ? null : input.weapon.reserveAmmo ?? 0,
      magazineCapacity: input.weapon.magazineCapacity,
      isMelee: input.weapon.isMelee,
      isReloading: input.weapon.isReloading,
      isAds: input.weapon.isAds,
    },
    abilities: input.abilities,
    score: {
      leftScore: integer(input.kills),
      rightScore: input.opponentScore === null || input.opponentScore === undefined
        ? null
        : integer(input.opponentScore),
      timerLabel: cleanLabel(input.timerLabel, '', 12),
      phaseLabel: cleanLabel(input.phaseLabel, 'Practice', 24),
      objectiveLabel: cleanLabel(input.objectiveLabel, 'Score', 40),
    },
    life: input.life,
  });
}

export function createOnlineHudViewModel(input: OnlineHudInput): HudViewModelV1 {
  const tickRateHz = Math.max(1, integer(input.tickRateHz, 20));
  const respawnTicks = input.respawnTicks === null || input.respawnTicks === undefined
    ? null
    : integer(input.respawnTicks);
  const respawnSeconds = respawnTicks === null
    ? null
    : Math.ceil(respawnTicks / tickRateHz);
  const lifeState = input.lifeState ?? 'waiting';
  const life: HudLifeViewModel = Object.freeze({
    state: lifeState,
    respawnSeconds,
    message: lifeState === 'dead'
      ? `Eliminated. Respawn in ${respawnSeconds ?? 0}s.`
      : lifeState === 'spectating'
        ? 'Spectating until the next spawn window.'
        : '',
  });
  return createHudViewModel({
    mode: 'online',
    health: {
      value: input.health,
      maximum: input.maximumHealth ?? 100,
    },
    shield: {
      value: input.shield ?? 0,
      maximum: input.maximumShield ?? 0,
      visible: nonNegative(input.maximumShield) > 0,
    },
    energy: {
      value: input.energy ?? 0,
      maximum: input.maximumEnergy ?? 0,
      visible: nonNegative(input.maximumEnergy) > 0,
    },
    weapon: input.weapon,
    abilities: input.abilities,
    score: {
      leftScore: integer(input.blueScore),
      rightScore: integer(input.redScore),
      timerLabel: formatMatchClock(input.remainingSeconds),
      phaseLabel: cleanLabel(input.phase, 'Waiting', 24),
      objectiveLabel: cleanLabel(input.objective, 'Team score', 40),
    },
    connection: connectionViewModel(input.connectionPhase, input.connectionError),
    life,
  });
}
