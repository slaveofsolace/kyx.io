import { describe, expect, it, vi } from 'vitest';

import {
  ControllerMenuNavigator,
  controllerDirection,
  readControllerState,
} from '../../../../src/ui/ControllerNavigation.js';

function gamepad({
  axes = [0, 0],
  pressed = [],
}: {
  axes?: number[];
  pressed?: number[];
} = {}): Gamepad {
  const buttons = Array.from({ length: 16 }, (_, index) => ({
    pressed: pressed.includes(index),
    touched: pressed.includes(index),
    value: pressed.includes(index) ? 1 : 0,
  }));
  return { axes, buttons, connected: true } as unknown as Gamepad;
}

function focusable(x: number) {
  return {
    hidden: false,
    tagName: 'BUTTON',
    type: 'button',
    click: vi.fn(),
    focus: vi.fn(),
    getAttribute: () => null,
    closest: () => null,
    getBoundingClientRect: () => ({
      x,
      y: 0,
      left: x,
      right: x + 40,
      top: 0,
      bottom: 40,
      width: 40,
      height: 40,
      toJSON: () => ({}),
    }),
  } as unknown as HTMLButtonElement;
}

describe('controller menu navigation', () => {
  it('maps standard gamepad axes and A/B buttons to menu intent', () => {
    const state = readControllerState(gamepad({ axes: [0.8, -0.7], pressed: [0, 1] }));

    expect(state).toMatchObject({
      up: true,
      right: true,
      accept: true,
      back: true,
    });
    expect(controllerDirection(state)).toBe('ArrowUp');
  });

  it('moves visible focus spatially and activates the focused control', () => {
    const left = focusable(0);
    const right = focusable(120);
    const rootDouble = {
      body: { dataset: {} },
      activeElement: left,
    };
    const root = rootDouble as unknown as Document;
    const scope = {
      querySelectorAll: () => [left, right],
    } as unknown as HTMLElement;
    const queuedFrames: FrameRequestCallback[] = [];
    let currentPad = gamepad({ axes: [0.8, 0] });
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      queuedFrames.push(callback);
      return 1;
    });

    const navigator = new ControllerMenuNavigator({
      root,
      getScope: () => scope,
      getGamepads: () => [currentPad],
      requestFrame,
      cancelFrame: vi.fn(),
    });

    expect(navigator.start()).toBe(true);
    queuedFrames.shift()?.(0);
    expect(right.focus).toHaveBeenCalledOnce();

    rootDouble.activeElement = right;
    currentPad = gamepad({ pressed: [0] });
    queuedFrames.shift()?.(20);
    expect(right.click).toHaveBeenCalledOnce();
  });
});
