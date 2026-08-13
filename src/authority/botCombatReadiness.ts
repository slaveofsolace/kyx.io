import type { InputBatchMessage, InputCommand } from '../net';
import { INTENT_BUTTON } from '../sim';
import type { DeterministicCombatBotInput } from './deterministicCombatBot';

export const AUTHORITY_BOT_COMBAT_GRACE_TICKS = 60 as const;

const AUTHORITY_BOT_OFFENSIVE_BUTTON_MASK =
  INTENT_BUTTON.primaryFire
  | INTENT_BUTTON.secondaryFire
  | INTENT_BUTTON.abilityOne
  | INTENT_BUTTON.abilityTwo
  | INTENT_BUTTON.abilityThree
  | INTENT_BUTTON.utility;

type HumanControlInput = Readonly<Pick<
  InputCommand,
  | 'moveX'
  | 'moveY'
  | 'lookYawDeltaMilliDegrees'
  | 'lookPitchDeltaMilliDegrees'
  | 'heldButtons'
  | 'pressedButtons'
  | 'releasedButtons'
>>;

/** Slot heartbeats are not proof that the player has entered the fight. */
export function authorityInputShowsHumanControl(input: HumanControlInput): boolean {
  return input.moveX !== 0
    || input.moveY !== 0
    || input.lookYawDeltaMilliDegrees !== 0
    || input.lookPitchDeltaMilliDegrees !== 0
    || input.heldButtons !== 0
    || input.pressedButtons !== 0
    || input.releasedButtons !== 0;
}

export function inputBatchShowsHumanControl(message: InputBatchMessage): boolean {
  return message.commands.some(authorityInputShowsHumanControl);
}

/**
 * Before first control plus the grace window, bots may navigate and look but
 * cannot deal damage or activate combat abilities. Rebuild edge bits from the
 * filtered held state so restoring a checkpoint cannot leave offense latched.
 */
export function withoutAuthorityBotCombat(
  input: DeterministicCombatBotInput,
  previousHeldButtons: number,
): DeterministicCombatBotInput {
  const heldButtons = input.heldButtons & ~AUTHORITY_BOT_OFFENSIVE_BUTTON_MASK;
  return Object.freeze({
    ...input,
    heldButtons,
    pressedButtons: heldButtons & ~previousHeldButtons,
    releasedButtons: previousHeldButtons & ~heldButtons,
  });
}
