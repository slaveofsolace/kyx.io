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
  readonly style = { width: '', setProperty: vi.fn() };
  readonly attributes = new Map<string, string>();
  textContent: string | number | null = '';

  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}

describe('HUD non-color critical-state semantics', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds textual LOW/CRITICAL cues and descriptive vital/weapon labels', () => {
    const elements = new Map<string, ElementDouble>();
    vi.stubGlobal('document', {
      getElementById: (id: string) => {
        const element = elements.get(id) ?? new ElementDouble();
        elements.set(id, element);
        return element;
      },
    });
    const hud = new HUD();

    hud.update({
      health: 18,
      maxHealth: 100,
      shield: 0,
      maxShield: 0,
      stamina: 12,
      maxStamina: 100,
    }, {
      name: 'AR-9 Assault',
      isMelee: false,
      magAmmo: 0,
      reserveAmmo: 90,
      isReloading: true,
    }, 3, 450);

    expect(elements.get('health-wrap')?.dataset.state).toBe('critical');
    expect(elements.get('health-state')?.textContent).toBe('CRITICAL');
    expect(elements.get('health-state')?.classList.contains('hidden')).toBe(false);
    expect(elements.get('health-wrap')?.attributes.get('aria-label')).toBe('Health 18 of 100, critical');
    expect(elements.get('stamina-state')?.textContent).toBe('LOW');
    expect(elements.get('stamina-state')?.classList.contains('hidden')).toBe(false);
    expect(elements.get('stamina-wrap')?.attributes.get('aria-label')).toBe('Energy 12 of 100, low');
    expect(elements.get('weapon-wrap')?.attributes.get('aria-label')).toContain('reloading');
  });
});
