import { INTENT_BUTTON } from '../sim';

function buttonForCode(code: string): number {
  if (code === 'Space') return INTENT_BUTTON.jump;
  if (code === 'ShiftLeft' || code === 'ShiftRight') return INTENT_BUTTON.sprint;
  if (code === 'KeyC' || code === 'ControlLeft' || code === 'ControlRight') {
    return INTENT_BUTTON.crouch;
  }
  if (code === 'KeyR') return INTENT_BUTTON.reload;
  if (code === 'Enter' || code === 'NumpadEnter') return INTENT_BUTTON.primaryFire;
  if (code === 'KeyE') return INTENT_BUTTON.abilityOne;
  if (code === 'KeyF') return INTENT_BUTTON.abilityTwo;
  if (code === 'KeyZ') return INTENT_BUTTON.abilityThree;
  if (code === 'KeyQ') return INTENT_BUTTON.utility;
  return 0;
}

export function isOnlineAuthorityInputCode(code: string): boolean {
  return buttonForCode(code) !== 0 || [
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'Digit1',
    'Digit2',
    'Digit3',
    'Digit4',
    'Digit5',
    'Digit6',
  ].includes(code);
}

export function onlineAuthorityWeaponSlotFromCode(code: string): number | null {
  const match = /^Digit([1-6])$/u.exec(code);
  return match === null ? null : Number(match[1]) - 1;
}

export function onlineAuthorityInputButtonsFromPressedKeys(
  pressedKeys: ReadonlySet<string>,
): number {
  let heldButtons = 0;
  for (const code of pressedKeys) heldButtons |= buttonForCode(code);
  return heldButtons >>> 0;
}
