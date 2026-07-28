import { INTENT_BUTTON } from '../sim';

function buttonForCode(code: string): number {
  if (code === 'Space') return INTENT_BUTTON.jump;
  if (code === 'ShiftLeft' || code === 'ShiftRight') return INTENT_BUTTON.sprint;
  if (code === 'KeyC' || code === 'ControlLeft' || code === 'ControlRight') {
    return INTENT_BUTTON.crouch;
  }
  if (code === 'KeyF') return INTENT_BUTTON.primaryFire;
  if (code === 'KeyR') return INTENT_BUTTON.reload;
  if (code === 'KeyG') return INTENT_BUTTON.abilityOne;
  if (code === 'KeyT') return INTENT_BUTTON.utility;
  return 0;
}

export function isOnlineAuthorityInputCode(code: string): boolean {
  return buttonForCode(code) !== 0 || [
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'KeyQ',
    'KeyE',
    'ArrowUp',
    'ArrowDown',
  ].includes(code);
}

export function onlineAuthorityInputButtonsFromPressedKeys(
  pressedKeys: ReadonlySet<string>,
): number {
  let heldButtons = 0;
  for (const code of pressedKeys) heldButtons |= buttonForCode(code);
  return heldButtons >>> 0;
}
