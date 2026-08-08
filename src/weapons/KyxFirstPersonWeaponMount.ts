import type * as THREE from 'three';

const FIRST_PERSON_WEAPON_ROOT_PREFIX = 'ONLINE_FIRST_PERSON_';

interface FirstPersonWeaponRoot {
  readonly group: THREE.Group;
}

export interface KyxFirstPersonWeaponMountDiagnostics {
  readonly childCount: number;
  readonly weaponRootCount: number;
  readonly overlapFree: boolean;
  readonly activeAuthorityWeaponId: string | null;
}

function isFirstPersonWeaponRoot(value: THREE.Object3D): boolean {
  return value.name.startsWith(FIRST_PERSON_WEAPON_ROOT_PREFIX)
    && value.userData.projectAuthoredPresentation === true
    && typeof value.userData.authorityWeaponId === 'string';
}

export function inspectKyxFirstPersonWeaponMount(
  mount: THREE.Group,
  expected: FirstPersonWeaponRoot | null,
): KyxFirstPersonWeaponMountDiagnostics {
  const weaponRoots = mount.children.filter(isFirstPersonWeaponRoot);
  const expectedRoot = expected?.group ?? null;
  const overlapFree = expectedRoot === null
    ? mount.children.length === 0 && weaponRoots.length === 0
    : mount.children.length === 1
      && weaponRoots.length === 1
      && weaponRoots[0] === expectedRoot;

  return Object.freeze({
    childCount: mount.children.length,
    weaponRootCount: weaponRoots.length,
    overlapFree,
    activeAuthorityWeaponId: expectedRoot === null
      ? null
      : String(expectedRoot.userData.authorityWeaponId ?? ''),
  });
}

/**
 * Replaces the entire camera-space weapon payload atomically.
 *
 * The mount is intentionally weapon-only. Removing every stale child prevents
 * interrupted selection changes, re-entry, or older presentation code from
 * leaving two viewmodels on screen. The next root is validated before the
 * current presentation is mutated so a malformed candidate cannot blank the
 * player's hands.
 */
export function replaceKyxFirstPersonWeaponMount(
  mount: THREE.Group,
  previous: FirstPersonWeaponRoot | null,
  next: FirstPersonWeaponRoot,
  dispose: (root: THREE.Object3D) => void,
): KyxFirstPersonWeaponMountDiagnostics {
  if (!isFirstPersonWeaponRoot(next.group)) {
    throw new Error('KYX_FIRST_PERSON_WEAPON_ROOT_INVALID');
  }

  const disposedRoots = new Set<THREE.Object3D>();
  for (const child of [...mount.children]) {
    if (child === next.group) continue;
    mount.remove(child);
    dispose(child);
    disposedRoots.add(child);
  }

  if (
    previous !== null
    && previous.group !== next.group
    && !disposedRoots.has(previous.group)
  ) {
    previous.group.parent?.remove(previous.group);
    dispose(previous.group);
  }

  if (next.group.parent !== mount) {
    mount.add(next.group);
  }

  const diagnostics = inspectKyxFirstPersonWeaponMount(mount, next);
  if (!diagnostics.overlapFree) {
    throw new Error('KYX_FIRST_PERSON_WEAPON_OVERLAP');
  }
  return diagnostics;
}
