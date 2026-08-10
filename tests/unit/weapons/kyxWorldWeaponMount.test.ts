import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  inspectKyxWorldWeaponMount,
  replaceKyxWorldWeaponMount,
} from '../../../src/weapons/KyxWorldWeaponMount';

function weaponRoot(id: string): Readonly<{ group: THREE.Group }> {
  const group = new THREE.Group();
  group.name = `ONLINE_WORLD_${id}`;
  group.userData.projectAuthoredPresentation = true;
  group.userData.authorityWeaponId = id;
  return Object.freeze({ group });
}

describe('KyxWorldWeaponMount', () => {
  it('purges stale authored world roots and attaches one selected weapon', () => {
    const avatar = new THREE.Group();
    const hand = new THREE.Group();
    avatar.add(hand);
    const previous = weaponRoot('vertical_rifle_v1');
    const stale = weaponRoot('kyx_sidearm_v1');
    const next = weaponRoot('kyx_edge_v1');
    hand.add(previous.group, stale.group);
    const dispose = vi.fn();

    const result = replaceKyxWorldWeaponMount(
      avatar,
      previous,
      next,
      (root) => hand.add(root),
      dispose,
    );

    expect(hand.children).toEqual([next.group]);
    expect(dispose.mock.calls.map(([root]) => root)).toEqual([
      previous.group,
      stale.group,
    ]);
    expect(result).toEqual({
      weaponRootCount: 1,
      overlapFree: true,
      selectedWeaponMatches: true,
      activeAuthorityWeaponId: 'kyx_edge_v1',
    });
  });

  it('fails closed when the accepted character seam does not attach', () => {
    const avatar = new THREE.Group();
    const previous = weaponRoot('vertical_rifle_v1');
    const next = weaponRoot('kyx_longshot_v1');
    avatar.add(previous.group);
    const dispose = vi.fn();

    expect(() => replaceKyxWorldWeaponMount(
      avatar,
      previous,
      next,
      () => {},
      dispose,
    )).toThrow('KYX_WORLD_WEAPON_OVERLAP');
    expect(inspectKyxWorldWeaponMount(avatar, null).overlapFree).toBe(true);
    expect(dispose).toHaveBeenCalledWith(next.group);
  });

  it('keeps exactly one world root across rifle to melee to rifle swaps', () => {
    const avatar = new THREE.Group();
    const hand = new THREE.Group();
    avatar.add(hand);
    const firstRifle = weaponRoot('vertical_rifle_v1');
    const edge = weaponRoot('kyx_edge_v1');
    const secondRifle = weaponRoot('vertical_rifle_v1');
    const dispose = vi.fn();
    hand.add(firstRifle.group);

    replaceKyxWorldWeaponMount(
      avatar,
      firstRifle,
      edge,
      (root) => hand.add(root),
      dispose,
    );
    const result = replaceKyxWorldWeaponMount(
      avatar,
      edge,
      secondRifle,
      (root) => hand.add(root),
      dispose,
    );

    expect(hand.children).toEqual([secondRifle.group]);
    expect(result).toEqual({
      weaponRootCount: 1,
      overlapFree: true,
      selectedWeaponMatches: true,
      activeAuthorityWeaponId: 'vertical_rifle_v1',
    });
    expect(dispose.mock.calls.map(([root]) => root)).toEqual([
      firstRifle.group,
      edge.group,
    ]);
  });

  it('validates the next world root before disturbing the current mount', () => {
    const avatar = new THREE.Group();
    const previous = weaponRoot('vertical_rifle_v1');
    const invalid = Object.freeze({ group: new THREE.Group() });
    const dispose = vi.fn();
    avatar.add(previous.group);

    expect(() => replaceKyxWorldWeaponMount(
      avatar,
      previous,
      invalid,
      (root) => avatar.add(root),
      dispose,
    )).toThrow('KYX_WORLD_WEAPON_ROOT_INVALID');
    expect(avatar.children).toEqual([previous.group]);
    expect(dispose).not.toHaveBeenCalled();
  });
});
