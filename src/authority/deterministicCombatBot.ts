import {
  COMBAT_PRESET_ID,
  type CombatPresetId,
} from '../loadouts';
import type { InputCommand } from '../net';
import { INTENT_BUTTON } from '../sim';
import type { AuthorityFullSnapshot } from './room';

export type DeterministicCombatBotInput = Readonly<Omit<
  InputCommand,
  'type' | 'sequence' | 'clientTick'
>>;

export interface DeterministicCombatBotOptions {
  readonly locomotion?: 'mobile' | 'sentry';
}

export const DETERMINISTIC_COMBAT_BOT_PRESET_ORDER = Object.freeze([
  COMBAT_PRESET_ID.assault,
  COMBAT_PRESET_ID.breacher,
  COMBAT_PRESET_ID.recon,
  COMBAT_PRESET_ID.duelist,
] as const);

const NEUTRAL_BOT_INPUT = Object.freeze({
  moveX: 0,
  moveY: 0,
  lookYawDeltaMilliDegrees: 0,
  lookPitchDeltaMilliDegrees: 0,
  heldButtons: 0,
  pressedButtons: 0,
  releasedButtons: 0,
  selectedSlot: 0,
} as const satisfies DeterministicCombatBotInput);

interface BotWeaponBehavior {
  readonly engagementRangeMillimeters: number;
  readonly advanceUntilMillimeters: number;
  readonly retreatInsideMillimeters: number;
  readonly strafeIntent: number;
}

function botWeaponBehavior(selectedSlot: number): BotWeaponBehavior {
  switch (selectedSlot) {
    case 2:
      return Object.freeze({
        engagementRangeMillimeters: 15_000,
        advanceUntilMillimeters: 9_000,
        retreatInsideMillimeters: 3_500,
        strafeIntent: 42,
      });
    case 3:
      return Object.freeze({
        engagementRangeMillimeters: 55_000,
        advanceUntilMillimeters: 32_000,
        retreatInsideMillimeters: 18_000,
        strafeIntent: 20,
      });
    case 5:
      return Object.freeze({
        engagementRangeMillimeters: 2_800,
        advanceUntilMillimeters: 2_300,
        retreatInsideMillimeters: 0,
        strafeIntent: 56,
      });
    default:
      return Object.freeze({
        engagementRangeMillimeters: 32_000,
        advanceUntilMillimeters: 18_000,
        retreatInsideMillimeters: 6_000,
        strafeIntent: 30,
      });
  }
}

function botTacticalIntent(
  serverTick: number,
  botOrdinal: number,
  distanceMillimeters: number,
  facingTarget: boolean,
): number {
  if (!facingTarget) return 0;
  const phase = serverTick + botOrdinal * 53;
  if (distanceMillimeters >= 4_000 && distanceMillimeters <= 24_000 && phase % 300 === 0) {
    return INTENT_BUTTON.abilityOne;
  }
  if (distanceMillimeters <= 20_000 && phase % 420 === 0) {
    return INTENT_BUTTON.abilityTwo;
  }
  if (distanceMillimeters <= 16_000 && phase % 510 === 0) {
    return INTENT_BUTTON.abilityThree;
  }
  return 0;
}

function normalizeYawDelta(value: number): number {
  let normalized = value % 360_000;
  if (normalized > 180_000) normalized -= 360_000;
  if (normalized < -180_000) normalized += 360_000;
  return normalized;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function deterministicCombatBotPresetId(botOrdinal: number): CombatPresetId {
  if (!Number.isSafeInteger(botOrdinal) || botOrdinal < 1) {
    throw new RangeError('Deterministic combat bot ordinal must be positive');
  }
  return DETERMINISTIC_COMBAT_BOT_PRESET_ORDER[
    (botOrdinal - 1) % DETERMINISTIC_COMBAT_BOT_PRESET_ORDER.length
  ] ?? COMBAT_PRESET_ID.assault;
}

export function deterministicCombatBotInput(
  snapshot: AuthorityFullSnapshot,
  playerId: string,
  previousHeldButtons: number,
  botOrdinal: number,
  options: DeterministicCombatBotOptions = {},
): DeterministicCombatBotInput {
  if (!Number.isSafeInteger(botOrdinal) || botOrdinal < 1) {
    throw new RangeError('Deterministic combat bot ordinal must be positive');
  }
  const player = snapshot.players.find((candidate) => candidate.playerId === playerId);
  if (player === undefined || player.combat?.life.phase !== 'alive') return NEUTRAL_BOT_INPUT;
  const teamId = player.combat.life.teamId;
  const position = player.movement.player.feetPosition;
  const targets = snapshot.players.filter((candidate) => (
    candidate.playerId !== playerId
    && candidate.combat?.life.phase === 'alive'
    && candidate.combat.life.teamId !== teamId
  ));
  const target = targets.reduce<(typeof targets)[number] | null>((nearest, candidate) => {
    if (nearest === null) return candidate;
    const candidateDx = candidate.movement.player.feetPosition.x - position.x;
    const candidateDz = candidate.movement.player.feetPosition.z - position.z;
    const nearestDx = nearest.movement.player.feetPosition.x - position.x;
    const nearestDz = nearest.movement.player.feetPosition.z - position.z;
    return candidateDx * candidateDx + candidateDz * candidateDz
      < nearestDx * nearestDx + nearestDz * nearestDz
      ? candidate
      : nearest;
  }, null);
  if (target === null) return NEUTRAL_BOT_INPUT;

  const dx = target.movement.player.feetPosition.x - position.x;
  const dy = target.movement.player.feetPosition.y - position.y;
  const dz = target.movement.player.feetPosition.z - position.z;
  const distance = Math.hypot(dx, dz);
  const desiredYaw = Math.round(Math.atan2(dx, dz) * 180_000 / Math.PI);
  const desiredPitch = clamp(
    Math.round(-Math.atan2(dy, Math.max(distance, 1)) * 180_000 / Math.PI),
    -80_000,
    80_000,
  );
  const yawDelta = clamp(
    normalizeYawDelta(desiredYaw - player.movement.player.yawMilliDegrees),
    -12_000,
    12_000,
  );
  const pitchDelta = clamp(
    desiredPitch - player.movement.player.pitchMilliDegrees,
    -8_000,
    8_000,
  );
  const facingYaw = Math.abs(normalizeYawDelta(
    desiredYaw - player.movement.player.yawMilliDegrees,
  )) < 18_000;
  const facingPitch = Math.abs(
    desiredPitch - player.movement.player.pitchMilliDegrees
  ) < 12_000;
  const facingTarget = facingYaw && facingPitch;
  const selectedSlot = player.combat.armory.selectedSlot;
  const behavior = botWeaponBehavior(selectedSlot);
  const engaged = facingTarget && distance < behavior.engagementRangeMillimeters;
  const tacticalIntent = botTacticalIntent(
    snapshot.serverTick,
    botOrdinal,
    distance,
    facingTarget,
  );
  const jump = snapshot.serverTick % (82 + playerId.length) === 0;
  const moveY = distance > behavior.advanceUntilMillimeters
    ? 96
    : distance < behavior.retreatInsideMillimeters
      ? -56
      : 0;
  const combatIntent = tacticalIntent !== 0
    ? tacticalIntent
    : engaged
      ? INTENT_BUTTON.primaryFire
      : 0;
  const heldButtons = combatIntent
    | (
      options.locomotion !== 'sentry' && combatIntent === 0 && moveY > 0
        ? INTENT_BUTTON.sprint
        : 0
    )
    | (options.locomotion !== 'sentry' && jump ? INTENT_BUTTON.jump : 0);

  return Object.freeze({
    moveX: options.locomotion === 'sentry'
      ? 0
      : snapshot.serverTick % 160 < 80
        ? behavior.strafeIntent
        : -behavior.strafeIntent,
    moveY: options.locomotion === 'sentry' ? 0 : moveY,
    lookYawDeltaMilliDegrees: yawDelta,
    lookPitchDeltaMilliDegrees: pitchDelta,
    heldButtons,
    pressedButtons: heldButtons & ~previousHeldButtons,
    releasedButtons: previousHeldButtons & ~heldButtons,
    selectedSlot,
  });
}
