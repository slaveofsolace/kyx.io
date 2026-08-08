import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  inspectKyxFirstPersonWeaponMount,
  replaceKyxFirstPersonWeaponMount,
} from '../../../src/weapons/KyxFirstPersonWeaponMount';

function weaponRoot(id: string): Readonly<{ group: THREE.Group }> {
  const group = new THREE.Group();
  group.name = `ONLINE_FIRST_PERSON_${id}`;
  group.userData.projectAuthoredPresentation = true;
  group.userData.authorityWeaponId = id;
  return Object.freeze({ group });
}

describe('KyxFirstPersonWeaponMount', () => {
  it('atomically replaces the current weapon and disposes it once', () => {
    const mount = new THREE.Group();
    const previous = weaponRoot('vertical_rifle_v1');
    const next = weaponRoot('kyx_scattergun_v1');
    const dispose = vi.fn();
    mount.add(previous.group);

    const result = replaceKyxFirstPersonWeaponMount(
      mount,
      previous,
      next,
      dispose,
    );

    expect(mount.children).toEqual([next.group]);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledWith(previous.group);
    expect(result).toEqual({
      childCount: 1,
      weaponRootCount: 1,
      overlapFree: true,
      activeAuthorityWeaponId: 'kyx_scattergun_v1',
    });
  });

  it('removes every stale mount child before attaching the selected weapon', () => {
    const mount = new THREE.Group();
    const previous = weaponRoot('vertical_rifle_v1');
    const orphan = weaponRoot('kyx_sidearm_v1');
    const staleHelper = new THREE.Group();
    staleHelper.name = 'STALE_UNEXPECTED_VIEWMODEL_CHILD';
    const next = weaponRoot('kyx_longshot_v1');
    const dispose = vi.fn();
    mount.add(previous.group, orphan.group, staleHelper);

    const result = replaceKyxFirstPersonWeaponMount(
      mount,
      previous,
      next,
      dispose,
    );

    expect(mount.children).toEqual([next.group]);
    expect(dispose.mock.calls.map(([root]) => root)).toEqual([
      previous.group,
      orphan.group,
      staleHelper,
    ]);
    expect(result.overlapFree).toBe(true);
  });

  it('does not mutate a healthy mount when the selected root is reused', () => {
    const mount = new THREE.Group();
    const selected = weaponRoot('kyx_edge_v1');
    const dispose = vi.fn();
    mount.add(selected.group);

    const result = replaceKyxFirstPersonWeaponMount(
      mount,
      selected,
      selected,
      dispose,
    );

    expect(result.overlapFree).toBe(true);
    expect(dispose).not.toHaveBeenCalled();
    expect(inspectKyxFirstPersonWeaponMount(mount, selected)).toEqual(result);
  });

  it('rejects a malformed next root before removing the current weapon', () => {
    const mount = new THREE.Group();
    const previous = weaponRoot('vertical_rifle_v1');
    const invalid = Object.freeze({ group: new THREE.Group() });
    const dispose = vi.fn();
    mount.add(previous.group);

    expect(() => replaceKyxFirstPersonWeaponMount(
      mount,
      previous,
      invalid,
      dispose,
    )).toThrow('KYX_FIRST_PERSON_WEAPON_ROOT_INVALID');
    expect(mount.children).toEqual([previous.group]);
    expect(dispose).not.toHaveBeenCalled();
  });
});
