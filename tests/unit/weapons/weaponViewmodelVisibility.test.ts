import { describe, expect, it } from 'vitest';

import { WeaponSystem } from '../../../src/weapons/WeaponSystem.js';

type WeaponKind = 'hitscan' | 'melee';

type VisibilityHarness = {
  _rev17Viewmodel: {
    visible: boolean;
  } | null;
  armGroup: {
    visible: boolean;
  };
  allWeapons: Array<{
    id: string;
    kind: WeaponKind;
  }>;
  loadout: Array<{
    id: string;
    kind: WeaponKind;
  }>;
  currentIndex: number;
  models: Map<string, {
    group: {
      visible: boolean;
    };
  }>;
  readonly currentDef: {
    id: string;
    kind: WeaponKind;
  };
  _setActiveModel(index: number): void;
};

function createHarness(
  currentIndex: number,
  { rev17 = true }: { rev17?: boolean } = {},
): VisibilityHarness {
  const rifle = { id: 'm4', kind: 'hitscan' as const };
  const sword = { id: 'sword', kind: 'melee' as const };
  const system = Object.create(WeaponSystem.prototype) as VisibilityHarness;

  system._rev17Viewmodel = rev17 ? { visible: false } : null;
  system.armGroup = { visible: true };
  system.allWeapons = [rifle, sword];
  system.loadout = [rifle, sword];
  system.currentIndex = currentIndex;
  system.models = new Map([
    [rifle.id, { group: { visible: currentIndex === 0 } }],
    [sword.id, { group: { visible: currentIndex === 1 } }],
  ]);

  return system;
}

describe('WeaponSystem first-person viewmodel visibility', () => {
  it('uses only the Rev17 first-person candidate for a rifle', () => {
    const system = createHarness(0);

    system._setActiveModel(0);

    expect(system._rev17Viewmodel?.visible).toBe(true);
    expect(system.armGroup.visible).toBe(false);
    expect(system.models.get('m4')?.group.visible).toBe(false);
    expect(system.models.get('sword')?.group.visible).toBe(false);
  });

  it('shows the sword without overlaying the legacy procedural arm', () => {
    const system = createHarness(1);

    system._setActiveModel(1);

    expect(system._rev17Viewmodel?.visible).toBe(false);
    expect(system.armGroup.visible).toBe(false);
    expect(system.models.get('m4')?.group.visible).toBe(false);
    expect(system.models.get('sword')?.group.visible).toBe(true);
  });

  it('retains the legacy arm and weapon model for a default-path rifle', () => {
    const system = createHarness(0, { rev17: false });

    system._setActiveModel(0);

    expect(system._rev17Viewmodel).toBeNull();
    expect(system.armGroup.visible).toBe(true);
    expect(system.models.get('m4')?.group.visible).toBe(true);
    expect(system.models.get('sword')?.group.visible).toBe(false);
  });

  it('removes the legacy arm overlay from a default-path sword', () => {
    const system = createHarness(1, { rev17: false });

    system._setActiveModel(1);

    expect(system._rev17Viewmodel).toBeNull();
    expect(system.armGroup.visible).toBe(false);
    expect(system.models.get('m4')?.group.visible).toBe(false);
    expect(system.models.get('sword')?.group.visible).toBe(true);
  });
});
