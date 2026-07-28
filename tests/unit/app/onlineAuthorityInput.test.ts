import { describe, expect, it } from 'vitest';

import {
  isOnlineAuthorityInputCode,
  onlineAuthorityInputButtonsFromPressedKeys,
  onlineAuthorityWeaponSlotFromCode,
} from '../../../src/app/onlineAuthorityInput';
import { INTENT_BUTTON } from '../../../src/sim';

describe('online authority input mapping', () => {
  it('maps shipped movement and combat keys to authoritative intent buttons', () => {
    const heldButtons = onlineAuthorityInputButtonsFromPressedKeys(new Set([
      'Space',
      'ShiftLeft',
      'KeyC',
      'KeyF',
      'KeyR',
      'KeyG',
      'KeyT',
    ]));

    expect(heldButtons).toBe(
      INTENT_BUTTON.jump
      | INTENT_BUTTON.sprint
      | INTENT_BUTTON.crouch
      | INTENT_BUTTON.primaryFire
      | INTENT_BUTTON.reload
      | INTENT_BUTTON.abilityOne
      | INTENT_BUTTON.utility,
    );
  });

  it('derives alias-backed buttons from the complete pressed-key set', () => {
    const pressedKeys = new Set(['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight']);
    expect(onlineAuthorityInputButtonsFromPressedKeys(pressedKeys)).toBe(
      INTENT_BUTTON.sprint | INTENT_BUTTON.crouch,
    );

    pressedKeys.delete('ShiftLeft');
    pressedKeys.delete('ControlLeft');
    expect(onlineAuthorityInputButtonsFromPressedKeys(pressedKeys)).toBe(
      INTENT_BUTTON.sprint | INTENT_BUTTON.crouch,
    );

    pressedKeys.clear();
    expect(onlineAuthorityInputButtonsFromPressedKeys(pressedKeys)).toBe(0);
  });

  it('recognizes every controlled keyboard surface without consuming unrelated keys', () => {
    for (const code of [
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'KeyQ',
      'KeyE',
      'ArrowUp',
      'ArrowDown',
      'Space',
      'ShiftLeft',
      'ShiftRight',
      'KeyC',
      'ControlLeft',
      'ControlRight',
      'KeyF',
      'KeyR',
      'KeyG',
      'KeyT',
      'Digit1',
      'Digit2',
      'Digit3',
      'Digit4',
      'Digit5',
      'Digit6',
    ]) {
      expect(isOnlineAuthorityInputCode(code), code).toBe(true);
    }
    expect(isOnlineAuthorityInputCode('Escape')).toBe(false);
  });

  it('maps the six visible armory keys to zero-based authoritative slots', () => {
    expect([
      'Digit1',
      'Digit2',
      'Digit3',
      'Digit4',
      'Digit5',
      'Digit6',
    ].map(onlineAuthorityWeaponSlotFromCode)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(onlineAuthorityWeaponSlotFromCode('Digit0')).toBeNull();
    expect(onlineAuthorityWeaponSlotFromCode('Numpad1')).toBeNull();
  });
});
