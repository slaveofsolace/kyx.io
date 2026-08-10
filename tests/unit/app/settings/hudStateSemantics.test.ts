import { afterEach, describe, expect, it, vi } from 'vitest';

import { HUD } from '../../../../src/ui/HUD.js';
import { createPracticeHudViewModel } from '../../../../src/ui/hudViewModel';

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

  it('adds textual low/critical cues and descriptive vital/weapon labels', () => {
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
    expect(elements.get('health-state')?.textContent).toBe('Critical');
    expect(elements.get('health-state')?.classList.contains('hidden')).toBe(false);
    expect(elements.get('health-wrap')?.attributes.get('aria-label')).toBe('Health 18 of 100, critical');
    expect(elements.get('stamina-state')?.textContent).toBe('Critical');
    expect(elements.get('stamina-state')?.classList.contains('hidden')).toBe(false);
    expect(elements.get('stamina-wrap')?.attributes.get('aria-label')).toBe('Energy 12 of 100, critical');
    expect(elements.get('weapon-wrap')?.attributes.get('aria-label')).toContain('reloading');
  });

  it('renders team score, the authority clock, and respawn state', () => {
    const elements = new Map<string, ElementDouble>();
    vi.stubGlobal('document', {
      getElementById: (id: string) => {
        const element = elements.get(id) ?? new ElementDouble();
        elements.set(id, element);
        return element;
      },
    });
    const hud = new HUD();
    const rendered = hud.render(createPracticeHudViewModel({
      player: { health: 0, maxHealth: 100 },
      weapon: { name: 'VLR-7', magAmmo: 0, reserveAmmo: 60 },
      kills: 6,
      score: 6,
      opponentScore: 4,
      timerLabel: '0:27',
      phaseLabel: 'active',
      objectiveLabel: 'Team deathmatch',
      life: {
        state: 'dead',
        respawnSeconds: 2,
        message: 'Eliminated. Respawn in 2s.',
      },
    }));

    expect(rendered).toBe(true);
    expect(elements.get('kill-count')?.textContent).toBe('6');
    expect(elements.get('score-count')?.textContent).toBe('4');
    expect(elements.get('local-score-label')?.textContent).toBe('Your team');
    expect(elements.get('opponent-score-label')?.textContent).toBe('Opponents');
    expect(elements.get('dm-timer')?.textContent).toBe('0:27');
    expect(elements.get('dm-timer')?.classList.contains('dm-low')).toBe(true);
    expect(elements.get('downed-overlay')?.classList.contains('hidden')).toBe(false);
    expect(elements.get('downed-overlay')?.dataset.state).toBe('dead');
    expect(elements.get('downed-countdown')?.textContent).toBe(2);
  });
});
