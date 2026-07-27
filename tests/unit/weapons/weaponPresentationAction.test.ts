import { describe, expect, it, vi } from 'vitest';

import { WeaponSystem } from '../../../src/weapons/WeaponSystem.js';

type TestWeaponDefinition = Readonly<{
  id: string;
  kind: string;
  magSize: number;
  reloadTime: number;
}>;

type TestWeaponState = {
  magAmmo: number;
  reserveAmmo: number;
  isReloading: boolean;
  reloadTimer: number;
};

type TestWeaponSystem = {
  loadout: TestWeaponDefinition[];
  currentIndex: number;
  state: Map<string, TestWeaponState>;
  _reloadPresentationAction: unknown;
  _rev17Viewmodel: Readonly<{
    userData: Readonly<{
      triggerReload: (durationSeconds: number) => void;
      triggerAction?: (request: unknown) => void;
    }>;
  }>;
  audio: Readonly<{
    playReloadMag: () => void;
    playReloadRack: () => void;
  }>;
  onPresentationAction: (event: unknown) => void;
  onReloadStart: () => void;
  startReload: () => void;
  presentAbility: (durationSeconds?: number) => void;
  _advanceReloadPresentation: (deltaSeconds: number) => void;
  _completeReload: () => void;
};

describe('WeaponSystem presentation action clock', () => {
  it('drives reload audio markers from the weapon timer without mutating ammo', () => {
    const system = Object.create(WeaponSystem.prototype) as TestWeaponSystem;
    const definition: TestWeaponDefinition = {
      id: 'test_auto_rifle',
      kind: 'rifle',
      magSize: 30,
      reloadTime: 2,
    };
    const weaponState = {
      magAmmo: 7,
      reserveAmmo: 60,
      isReloading: false,
      reloadTimer: 0,
    };
    const triggerReload = vi.fn();
    const onPresentationAction = vi.fn();
    const onReloadStart = vi.fn();
    const playReloadMag = vi.fn();
    const playReloadRack = vi.fn();

    system.loadout = [definition];
    system.currentIndex = 0;
    system.state = new Map([[definition.id, weaponState]]);
    system._reloadPresentationAction = null;
    system._rev17Viewmodel = { userData: { triggerReload } };
    system.audio = { playReloadMag, playReloadRack };
    system.onPresentationAction = onPresentationAction;
    system.onReloadStart = onReloadStart;

    system.startReload();

    expect(triggerReload).toHaveBeenCalledWith(2);
    expect(onReloadStart).toHaveBeenCalledOnce();
    expect(playReloadMag).toHaveBeenCalledOnce();
    expect(playReloadRack).not.toHaveBeenCalled();
    expect(weaponState).toMatchObject({
      magAmmo: 7,
      reserveAmmo: 60,
      isReloading: true,
      reloadTimer: 2,
    });

    system._advanceReloadPresentation(1.75);
    expect(playReloadRack).not.toHaveBeenCalled();
    expect(weaponState.magAmmo).toBe(7);
    expect(weaponState.reserveAmmo).toBe(60);

    system._advanceReloadPresentation(0.01);
    expect(playReloadRack).toHaveBeenCalledOnce();
    system._advanceReloadPresentation(0.2);
    expect(playReloadRack).toHaveBeenCalledOnce();
    expect(weaponState.magAmmo).toBe(7);
    expect(weaponState.reserveAmmo).toBe(60);

    weaponState.reloadTimer = 0;
    system._completeReload();
    expect(weaponState).toMatchObject({
      magAmmo: 30,
      reserveAmmo: 37,
      isReloading: false,
    });
    expect(onPresentationAction).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'reload',
      phase: 'completed',
      roundsTransferred: 23,
    }));
  });

  it('forwards a successful ability presentation to first- and third-person sinks', () => {
    const system = Object.create(WeaponSystem.prototype) as TestWeaponSystem;
    const triggerAction = vi.fn();
    const onPresentationAction = vi.fn();
    system._rev17Viewmodel = { userData: { triggerReload: vi.fn(), triggerAction } };
    system.onPresentationAction = onPresentationAction;

    system.presentAbility(0.75);

    expect(triggerAction).toHaveBeenCalledWith({
      kind: 'ability',
      durationSeconds: 0.75,
    });
    expect(onPresentationAction).toHaveBeenCalledWith({
      kind: 'ability',
      phase: 'started',
      durationSeconds: 0.75,
    });
  });
});
