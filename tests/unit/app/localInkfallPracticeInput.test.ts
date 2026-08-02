import { describe, expect, it } from 'vitest';

import { LocalInkfallPracticeInputBuffer } from '../../../src/app/localInkfallPracticeInput';
import { INTENT_BUTTON } from '../../../src/sim';

describe('local Inkfall Practice input buffer', () => {
  it('publishes sub-tick taps across valid authority commands', () => {
    const input = new LocalInkfallPracticeInputBuffer();

    input.handleKey('Space', true);
    input.handleKey('Space', false);
    input.handleKey('KeyQ', true);
    expect(input.blinkPreviewHeld).toBe(true);
    input.handleKey('KeyQ', false);

    const tick = input.consume();
    expect(tick.heldButtons & INTENT_BUTTON.jump).toBe(INTENT_BUTTON.jump);
    expect(tick.heldButtons & INTENT_BUTTON.utility).toBe(INTENT_BUTTON.utility);
    expect(tick.pressedButtons & INTENT_BUTTON.jump).toBe(INTENT_BUTTON.jump);
    expect(tick.pressedButtons & INTENT_BUTTON.utility).toBe(INTENT_BUTTON.utility);
    expect(tick.releasedButtons).toBe(0);

    const releaseTick = input.consume();
    expect(releaseTick.heldButtons).toBe(0);
    expect(releaseTick.pressedButtons).toBe(0);
    expect(releaseTick.releasedButtons & INTENT_BUTTON.jump).toBe(INTENT_BUTTON.jump);
    expect(releaseTick.releasedButtons & INTENT_BUTTON.utility)
      .toBe(INTENT_BUTTON.utility);
    expect(input.consume()).toMatchObject({ pressedButtons: 0, releasedButtons: 0 });
  });

  it('accumulates bounded look, movement, primary fire, ADS, and weapon selection', () => {
    const input = new LocalInkfallPracticeInputBuffer();
    input.handleKey('KeyW', true);
    input.handleKey('KeyD', true);
    input.handleKey('Digit4', true);
    input.handlePointerButton(0, true);
    input.handlePointerButton(2, true);
    input.addPointerLook(9_999, -9_999);

    const tick = input.consume();
    expect(tick.moveX).toBeGreaterThan(0);
    expect(tick.moveY).toBeGreaterThan(0);
    expect(tick.heldButtons & INTENT_BUTTON.primaryFire).toBe(INTENT_BUTTON.primaryFire);
    expect(tick.selectedSlot).toBe(3);
    expect(tick.lookYawDeltaMilliDegrees).toBe(32_767);
    expect(tick.lookPitchDeltaMilliDegrees).toBe(32_767);
    expect(input.aimHeld).toBe(true);

    input.neutralize();
    const neutral = input.consume();
    expect(neutral.heldButtons).toBe(0);
    expect(neutral.releasedButtons & INTENT_BUTTON.primaryFire)
      .toBe(INTENT_BUTTON.primaryFire);
    expect(input.pressedKeys).toEqual([]);
  });
});
