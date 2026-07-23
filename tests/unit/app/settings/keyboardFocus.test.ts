import { describe, expect, it, vi } from 'vitest';

import {
  focusFirst,
  getFocusableElements,
  trapTabWithin,
} from '../../../../src/ui/KeyboardFocus.js';

function focusable(hidden = false, ariaHidden = false): HTMLElement {
  return {
    hidden,
    focus: vi.fn(),
    getAttribute: (name: string) => name === 'aria-hidden' && ariaHidden ? 'true' : null,
    closest: () => null,
  } as unknown as HTMLElement;
}

function scopeWith(elements: HTMLElement[]): HTMLElement {
  return {
    querySelectorAll: () => elements,
  } as unknown as HTMLElement;
}

describe('keyboard dialog focus helpers', () => {
  it('filters hidden controls and focuses the first usable action', () => {
    const hidden = focusable(true);
    const ariaHidden = focusable(false, true);
    const first = focusable();
    const second = focusable();
    const scope = scopeWith([hidden, ariaHidden, first, second]);

    expect(getFocusableElements(scope)).toEqual([first, second]);
    expect(focusFirst(scope)).toBe(first);
    expect(first.focus).toHaveBeenCalledOnce();
  });

  it('wraps forward Tab from the last action to the first', () => {
    const first = focusable();
    const last = focusable();
    const scope = scopeWith([first, last]);
    const event = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() };

    expect(trapTabWithin(scope, event, last)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(first.focus).toHaveBeenCalledOnce();
  });

  it('wraps reverse Tab from the first action to the last', () => {
    const first = focusable();
    const last = focusable();
    const scope = scopeWith([first, last]);
    const event = { key: 'Tab', shiftKey: true, preventDefault: vi.fn() };

    expect(trapTabWithin(scope, event, first)).toBe(true);
    expect(last.focus).toHaveBeenCalledOnce();
  });
});
