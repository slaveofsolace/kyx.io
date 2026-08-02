import { afterEach, describe, expect, it, vi } from 'vitest';

import { HUD } from '../../../../src/ui/HUD.js';

class ClassListDouble {
  readonly values = new Set<string>();
  add(...names: string[]): void { names.forEach((name) => this.values.add(name)); }
  remove(...names: string[]): void { names.forEach((name) => this.values.delete(name)); }
  contains(name: string): boolean { return this.values.has(name); }
  toggle(name: string, force?: boolean): boolean {
    const enabled = force ?? !this.values.has(name);
    if (enabled) this.values.add(name);
    else this.values.delete(name);
    return enabled;
  }
}

class ElementDouble {
  readonly classList = new ClassListDouble();
  readonly dataset: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly styleValues = new Map<string, unknown>();
  readonly style = { setProperty: (key: string, value: unknown) => this.styleValues.set(key, value) };
  textContent: string | number | null = '';
  offsetWidth = 1;

  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}

describe('HUD event and ability semantics', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function createHud(reducedFlash = false) {
    const elements = new Map<string, ElementDouble>();
    vi.stubGlobal('document', {
      body: { dataset: { reducedFlash: String(reducedFlash) } },
      getElementById: (id: string) => {
        const element = elements.get(id) ?? new ElementDouble();
        elements.set(id, element);
        return element;
      },
    });
    return { hud: new HUD(), elements };
  }

  it('exposes three real ability states with text and unavailable reasons', () => {
    vi.useFakeTimers();
    const { hud, elements } = createHud();

    hud.updateAbilities({
      slots: [
        { slot: 0, abilityId: 'vertical_teleport_v1' },
        {
          slot: 1,
          abilityId: 'frag_grenade_v1',
          count: 0,
          cooldownSeconds: 2,
          metadata: { shortName: 'Frag', displayName: 'Frag grenade', charges: 2 },
        },
        {
          slot: 2,
          abilityId: 'smoke_grenade_v1',
          count: 2,
          cooldownSeconds: 0,
          metadata: { shortName: 'Smoke', displayName: 'Smoke grenade', charges: 2 },
        },
        {
          slot: 3,
          abilityId: 'sticky_grenade_v1',
          count: 1,
          cooldownSeconds: 1.25,
          metadata: { shortName: 'Sticky', displayName: 'Sticky grenade', charges: 2 },
        },
      ],
    });
    hud.updateTeleport(0.42);
    expect(elements.get('ability-slot-1')?.dataset.state).toBe('charging');
    expect(elements.get('ability-slot-1-state')?.textContent).toBe('2.0s');
    expect(elements.get('ability-slot-2')?.dataset.state).toBe('ready');
    expect(elements.get('ability-slot-2-state')?.textContent).toBe('2/2');
    expect(elements.get('ability-slot-3')?.dataset.state).toBe('ready');
    expect(elements.get('ability-slot-3-state')?.textContent).toBe('1/2');
    expect(elements.get('ability-q')?.dataset.state).toBe('charging');
    expect(elements.get('ability-q-state')?.textContent).toBe('42%');

    expect(hud.showAbilityUnavailable('Q', 'blink recharging 2.9s')).toBe(true);
    expect(elements.get('ability-reason')?.textContent).toBe('Q: Blink recharging 2.9s');
    expect(elements.get('ability-reason')?.classList.contains('hidden')).toBe(false);
    vi.advanceTimersByTime(1_400);
    expect(elements.get('ability-reason')?.classList.contains('hidden')).toBe(true);
  });

  it('keeps the exact Flash duration in low-luminance mode instead of shortening gameplay cover', () => {
    vi.useFakeTimers();
    const { hud, elements } = createHud(true);

    expect(hud.showFlashEffect(0.7, 1.75)).toBe(true);
    const overlay = elements.get('ability-flash-overlay');
    expect(overlay?.dataset.flashMode).toBe('low_luminance');
    expect(overlay?.styleValues.get('--flash-intensity')).toBe(0.7);
    expect(overlay?.styleValues.get('--flash-duration')).toBe('1.75s');
    expect(overlay?.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(1_749);
    expect(overlay?.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(overlay?.classList.contains('show')).toBe(false);
  });

  it('does not let a later short Flash truncate a longer active authority envelope', () => {
    vi.useFakeTimers();
    const { hud, elements } = createHud(false);

    expect(hud.showFlashEffect(0.4, 2)).toBe(true);
    vi.advanceTimersByTime(500);
    expect(hud.showFlashEffect(0.8, 0.5)).toBe(true);
    const overlay = elements.get('ability-flash-overlay');
    expect(overlay?.styleValues.get('--flash-intensity')).toBe(0.8);
    expect(overlay?.styleValues.get('--flash-duration')).toBe('1.5s');
    vi.advanceTimersByTime(1_499);
    expect(overlay?.classList.contains('show')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(overlay?.classList.contains('show')).toBe(false);
  });

  it('keeps Flash expiry independent from an ability-unavailable notice', () => {
    vi.useFakeTimers();
    const { hud, elements } = createHud(false);

    expect(hud.showFlashEffect(0.6, 0.5)).toBe(true);
    expect(hud.showAbilityUnavailable('Q', 'Blink recharging')).toBe(true);
    vi.advanceTimersByTime(500);
    expect(elements.get('ability-flash-overlay')?.classList.contains('show')).toBe(false);
    expect(elements.get('ability-reason')?.classList.contains('hidden')).toBe(false);
  });

  it('renders bounded direction, interaction, and conditional connection hooks', () => {
    vi.useFakeTimers();
    const { hud, elements } = createHud();

    expect(hud.showDamageDirection('left')).toBe(true);
    expect(elements.get('damage-direction')?.dataset.direction).toBe('left');
    expect(elements.get('damage-direction-text')?.textContent).toBe('Damage left');
    expect(hud.showDamageDirection('unknown')).toBe(false);

    expect(hud.showInteractionPrompt('E', 'open terminal')).toBe(true);
    expect(elements.get('interaction-key')?.textContent).toBe('E');
    expect(elements.get('interaction-text')?.textContent).toBe('Open terminal');

    expect(hud.setConnectionWarning(true, 'packet loss 8%')).toBe(true);
    expect(elements.get('connection-warning')?.classList.contains('hidden')).toBe(false);
    expect(elements.get('connection-warning-detail')?.textContent).toBe('Packet loss 8%');

    hud.clearTransientEvents();
    expect(elements.get('damage-direction')?.classList.contains('hidden')).toBe(true);
    expect(elements.get('interaction-prompt')?.classList.contains('hidden')).toBe(true);
    expect(elements.get('connection-warning')?.classList.contains('hidden')).toBe(true);
  });
});
