import type * as THREE from 'three';

const WORLD_WEAPON_ROOT_PREFIX = 'ONLINE_WORLD_';

interface WorldWeaponRoot {
  readonly group: THREE.Group;
}

export interface KyxWorldWeaponMountDiagnostics {
  readonly weaponRootCount: number;
  readonly overlapFree: boolean;
  readonly selectedWeaponMatches: boolean;
  readonly activeAuthorityWeaponId: string | null;
}

function isWorldWeaponRoot(value: THREE.Object3D): boolean {
  return value.name.startsWith(WORLD_WEAPON_ROOT_PREFIX)
    && value.userData.projectAuthoredPresentation === true
    && typeof value.userData.authorityWeaponId === 'string';
}

function collectWorldWeaponRoots(root: THREE.Object3D): THREE.Object3D[] {
  const result: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object !== root && isWorldWeaponRoot(object)) result.push(object);
  });
  return result;
}

export function inspectKyxWorldWeaponMount(
  avatarRoot: THREE.Object3D,
  expected: WorldWeaponRoot | null,
): KyxWorldWeaponMountDiagnostics {
  const roots = collectWorldWeaponRoots(avatarRoot);
  const expectedRoot = expected?.group ?? null;
  const expectedWeaponId = expectedRoot === null
    ? null
    : String(expectedRoot.userData.authorityWeaponId ?? '');
  const selectedWeaponMatches = expectedRoot === null
    ? roots.length === 0
    : roots.length === 1
      && roots[0] === expectedRoot
      && roots[0].userData.authorityWeaponId === expectedWeaponId;
  return Object.freeze({
    weaponRootCount: roots.length,
    overlapFree: selectedWeaponMatches,
    selectedWeaponMatches,
    activeAuthorityWeaponId: expectedWeaponId,
  });
}

/**
 * Replaces the authored world weapon below an avatar without knowing which
 * accepted character socket will own it. The callback is the only character
 * seam: this module neither imports nor approves a character implementation.
 */
export function replaceKyxWorldWeaponMount(
  avatarRoot: THREE.Object3D,
  previous: WorldWeaponRoot | null,
  next: WorldWeaponRoot,
  attach: (root: THREE.Group) => void,
  dispose: (root: THREE.Object3D) => void,
): KyxWorldWeaponMountDiagnostics {
  if (!isWorldWeaponRoot(next.group)) {
    throw new Error('KYX_WORLD_WEAPON_ROOT_INVALID');
  }

  const disposed = new Set<THREE.Object3D>();
  for (const root of collectWorldWeaponRoots(avatarRoot)) {
    if (root === next.group) continue;
    root.parent?.remove(root);
    dispose(root);
    disposed.add(root);
  }
  if (
    previous !== null
    && previous.group !== next.group
    && !disposed.has(previous.group)
  ) {
    previous.group.parent?.remove(previous.group);
    dispose(previous.group);
  }

  attach(next.group);
  const diagnostics = inspectKyxWorldWeaponMount(avatarRoot, next);
  if (!diagnostics.overlapFree) {
    next.group.parent?.remove(next.group);
    dispose(next.group);
    throw new Error('KYX_WORLD_WEAPON_OVERLAP');
  }
  return diagnostics;
}
