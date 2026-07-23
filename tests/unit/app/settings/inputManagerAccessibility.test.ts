import { afterEach, describe, expect, it, vi } from 'vitest';

import { InputManager } from '../../../../src/core/InputManager.js';

class EventTargetDouble {
  private readonly listeners = new Map<string, Set<(event: unknown) => void>>();

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const group = this.listeners.get(type) ?? new Set();
    group.add(listener);
    this.listeners.set(type, group);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string, event: unknown = {}): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

describe('InputManager accessibility boundaries', () => {
  afterEach(() => vi.unstubAllGlobals());

  function createHarness(requestPointerLock: () => unknown = () => undefined) {
    const windowTarget = new EventTargetDouble();
    const documentTarget = Object.assign(new EventTargetDouble(), {
      pointerLockElement: null as unknown,
      hidden: false,
      visibilityState: 'visible',
      exitPointerLock: vi.fn(),
    });
    const canvasTarget = Object.assign(new EventTargetDouble(), { requestPointerLock });
    vi.stubGlobal('window', windowTarget);
    vi.stubGlobal('document', documentTarget);
    const input = new InputManager(canvasTarget);
    return { input, windowTarget, documentTarget, canvasTarget };
  }

  it('allows native Tab traversal while released and captures Tab only during pointer-locked play', () => {
    const harness = createHarness();
    const releasedPreventDefault = vi.fn();
    harness.windowTarget.dispatch('keydown', { code: 'Tab', preventDefault: releasedPreventDefault });
    expect(releasedPreventDefault).not.toHaveBeenCalled();

    harness.documentTarget.pointerLockElement = harness.canvasTarget;
    harness.documentTarget.dispatch('pointerlockchange');
    const lockedPreventDefault = vi.fn();
    harness.windowTarget.dispatch('keydown', { code: 'Tab', preventDefault: lockedPreventDefault });
    expect(lockedPreventDefault).toHaveBeenCalledOnce();

    harness.input.dispose();
  });

  it('releases held input and explicitly exits pointer lock on Escape', () => {
    const harness = createHarness();
    harness.documentTarget.pointerLockElement = harness.canvasTarget;
    harness.documentTarget.dispatch('pointerlockchange');
    harness.windowTarget.dispatch('keydown', { code: 'KeyW' });
    expect(harness.input.isDown('KeyW')).toBe(true);

    harness.windowTarget.dispatch('keydown', { code: 'Escape' });

    expect(harness.input.isDown('KeyW')).toBe(false);
    expect(harness.input.isDown('Escape')).toBe(false);
    expect(harness.documentTarget.exitPointerLock).toHaveBeenCalledOnce();

    harness.input.dispose();
  });

  it('reports a rejected pointer-lock request instead of swallowing it', async () => {
    const harness = createHarness(() => Promise.reject(new Error('denied')));
    const onPointerLockError = vi.fn();
    harness.input.onPointerLockError = onPointerLockError;

    await expect(harness.input.requestPointerLock()).resolves.toBe(false);
    expect(onPointerLockError).toHaveBeenCalledWith('pointer_lock_denied');

    harness.input.dispose();
  });
});
