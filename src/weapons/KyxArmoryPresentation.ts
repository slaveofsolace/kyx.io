import * as THREE from 'three';

import {
  createKyxFirstPersonContactRig,
} from './KyxFirstPersonContactRig';

export const KYX_AUTHORITY_WEAPON_PRESENTATION = Object.freeze({
  vertical_rifle_v1: Object.freeze({
    family: 'rifle',
    silhouette: 'standard_longarm',
    label: 'VLR-7 LINE RIFLE',
    accent: 0x55dcff,
    tracer: 0x9cecff,
    firstPerson: Object.freeze({
      scale: 0.585,
      position: Object.freeze([0.255, -0.34, -0.6] as const),
      rotation: Object.freeze([-0.052, 0.05, 0.006] as const),
      aim: Object.freeze({
        enabled: true,
        offset: Object.freeze([-0.255, 0.212, 0.06] as const),
        rotation: Object.freeze([0.052, -0.05, -0.006] as const),
        fieldOfViewDegrees: 60,
        scaleMultiplier: 0.74,
      }),
      recoil: Object.freeze({
        offset: Object.freeze([0, -0.004, 0.07] as const),
        rotation: Object.freeze([-0.095, 0, 0.01] as const),
      }),
      reload: Object.freeze({
        durationMilliseconds: 3_000,
        offset: Object.freeze([-0.08, -0.1, 0.13] as const),
        rotation: Object.freeze([0.2, -0.1, 0.3] as const),
      }),
    }),
  }),
  kyx_sidearm_v1: Object.freeze({
    family: 'pistol',
    silhouette: 'compact_sidearm',
    label: 'K-9 ARC SIDEARM',
    accent: 0xffca5c,
    tracer: 0xffe7a0,
    firstPerson: Object.freeze({
      // Keep the compact silhouette fully in front of the camera. The former
      // near-plane pose left only the emissive muzzle ring visible at common
      // desktop aspect ratios, which read as a floating white circle.
      scale: 0.74,
      position: Object.freeze([0.245, -0.335, -0.68] as const),
      rotation: Object.freeze([-0.06, 0.16, -0.045] as const),
      aim: Object.freeze({
        enabled: true,
        offset: Object.freeze([-0.31, 0.19, 0.08] as const),
        rotation: Object.freeze([0.012, 0.015, 0.03] as const),
        fieldOfViewDegrees: 62,
        scaleMultiplier: 0.88,
      }),
      recoil: Object.freeze({
        offset: Object.freeze([0.015, -0.005, 0.09] as const),
        rotation: Object.freeze([-0.13, 0, 0.035] as const),
      }),
      reload: Object.freeze({
        durationMilliseconds: 1_500,
        offset: Object.freeze([-0.1, -0.13, 0.12] as const),
        rotation: Object.freeze([0.28, -0.1, 0.42] as const),
      }),
    }),
  }),
  kyx_scattergun_v1: Object.freeze({
    family: 'shotgun',
    silhouette: 'wide_quad_barrel',
    label: 'SG-4 BREACH ARRAY',
    accent: 0xff8c5a,
    tracer: 0xffbb7d,
    firstPerson: Object.freeze({
      scale: 0.82,
      position: Object.freeze([0.27, -0.29, -0.52] as const),
      rotation: Object.freeze([-0.055, 0.07, 0.01] as const),
      aim: Object.freeze({
        enabled: true,
        offset: Object.freeze([-0.265, 0.19, 0.12] as const),
        rotation: Object.freeze([0.04, -0.035, -0.01] as const),
        fieldOfViewDegrees: 62,
        scaleMultiplier: 0.82,
      }),
      recoil: Object.freeze({
        offset: Object.freeze([0, -0.02, 0.14] as const),
        rotation: Object.freeze([-0.18, 0.02, 0.03] as const),
      }),
      reload: Object.freeze({
        durationMilliseconds: 1_800,
        offset: Object.freeze([-0.14, -0.16, 0.18] as const),
        rotation: Object.freeze([0.32, -0.18, 0.45] as const),
      }),
    }),
  }),
  kyx_longshot_v1: Object.freeze({
    family: 'sniper',
    silhouette: 'long_optic',
    label: 'LONGBOW-12',
    accent: 0xd5f4ff,
    tracer: 0xeafaff,
    firstPerson: Object.freeze({
      scale: 0.82,
      position: Object.freeze([0.27, -0.285, -0.58] as const),
      rotation: Object.freeze([-0.025, 0.11, -0.006] as const),
      aim: Object.freeze({
        enabled: true,
        offset: Object.freeze([-0.22, 0.19, 0.15] as const),
        rotation: Object.freeze([0.016, -0.014, 0.006] as const),
        fieldOfViewDegrees: 34,
        scaleMultiplier: 0.72,
      }),
      recoil: Object.freeze({
        offset: Object.freeze([0, -0.025, 0.12] as const),
        rotation: Object.freeze([-0.16, 0.02, 0.02] as const),
      }),
      reload: Object.freeze({
        durationMilliseconds: 2_500,
        offset: Object.freeze([-0.12, -0.14, 0.2] as const),
        rotation: Object.freeze([0.3, -0.1, 0.38] as const),
      }),
    }),
  }),
  kyx_breach_rocket_v1: Object.freeze({
    family: 'rocket',
    silhouette: 'heavy_tube',
    label: 'BR-6 SIEGE TUBE',
    accent: 0xff6042,
    tracer: 0xffa066,
    firstPerson: Object.freeze({
      // The backblast bell used to sit only centimeters from the camera and
      // dominate the entire lower-right quadrant. Preserve its heavy read at
      // a bounded depth and slight three-quarter angle.
      scale: 0.52,
      position: Object.freeze([0.25, -0.35, -0.79] as const),
      rotation: Object.freeze([-0.055, 0.11, 0.018] as const),
      aim: Object.freeze({
        enabled: true,
        offset: Object.freeze([-0.28, 0.21, 0.12] as const),
        rotation: Object.freeze([0.03, 0.02, -0.025] as const),
        fieldOfViewDegrees: 52,
        scaleMultiplier: 0.76,
      }),
      recoil: Object.freeze({
        offset: Object.freeze([0, -0.03, 0.18] as const),
        rotation: Object.freeze([-0.2, 0.035, 0.04] as const),
      }),
      reload: Object.freeze({
        durationMilliseconds: 2_500,
        offset: Object.freeze([-0.18, -0.18, 0.22] as const),
        rotation: Object.freeze([0.35, -0.22, 0.5] as const),
      }),
    }),
  }),
  kyx_edge_v1: Object.freeze({
    family: 'melee',
    silhouette: 'energy_blade',
    label: 'EDGE-1 PHASE SABER',
    accent: 0x58f4ff,
    tracer: 0xb6fbff,
    firstPerson: Object.freeze({
      // Present the blade across the frame instead of pointing its long axis
      // into the lens. This keeps the hilt attached to the visible hand and
      // exposes a readable diagonal melee silhouette.
      scale: 0.72,
      position: Object.freeze([0.3, -0.45, -0.78] as const),
      rotation: Object.freeze([0.45, 0.62, -0.08] as const),
      aim: Object.freeze({
        enabled: false,
        offset: Object.freeze([0, 0, 0] as const),
        rotation: Object.freeze([0, 0, 0] as const),
        fieldOfViewDegrees: 72,
        scaleMultiplier: 1,
      }),
      recoil: Object.freeze({
        offset: Object.freeze([0, 0, 0] as const),
        rotation: Object.freeze([0, 0, 0] as const),
      }),
      reload: Object.freeze({
        durationMilliseconds: 1,
        offset: Object.freeze([0, 0, 0] as const),
        rotation: Object.freeze([0, 0, 0] as const),
      }),
    }),
  }),
} as const);

export const KYX_FIRST_PERSON_TRANSITION_PROFILE = Object.freeze({
  vertical_rifle_v1: Object.freeze({
    aimPresentation: 'reflex' as const,
    adsDatumNode: 'KYX_VLR7_REFLEX_RETICLE_DOT',
    adsDatumPosition: null,
    recoilRecoveryHalfLifeSeconds: 0.065,
    equipOffset: Object.freeze([0.12, -0.2, 0.24] as const),
    equipRotation: Object.freeze([0.2, -0.18, 0.22] as const),
    sprintOffset: Object.freeze([-0.08, 0.1, 0.12] as const),
    sprintRotation: Object.freeze([0.18, -0.08, -0.74] as const),
  }),
  kyx_sidearm_v1: Object.freeze({
    aimPresentation: 'iron' as const,
    adsDatumNode: 'KYX_K9_IRON_SIGHT_DATUM',
    adsDatumPosition: Object.freeze([0, 0.2, -0.04] as const),
    recoilRecoveryHalfLifeSeconds: 0.09,
    equipOffset: Object.freeze([0.16, -0.22, 0.18] as const),
    equipRotation: Object.freeze([0.18, -0.2, 0.34] as const),
    sprintOffset: Object.freeze([-0.04, 0.08, 0.08] as const),
    sprintRotation: Object.freeze([0.1, 0.04, -0.48] as const),
  }),
  kyx_scattergun_v1: Object.freeze({
    aimPresentation: 'breach_sight' as const,
    adsDatumNode: 'KYX_SG4_BREACH_SIGHT_DATUM',
    adsDatumPosition: Object.freeze([0, 0.18, -0.14] as const),
    recoilRecoveryHalfLifeSeconds: 0.14,
    equipOffset: Object.freeze([0.14, -0.24, 0.3] as const),
    equipRotation: Object.freeze([0.24, -0.22, 0.32] as const),
    sprintOffset: Object.freeze([-0.1, 0.11, 0.16] as const),
    sprintRotation: Object.freeze([0.22, -0.08, -0.8] as const),
  }),
  kyx_longshot_v1: Object.freeze({
    aimPresentation: 'precision_scope' as const,
    adsDatumNode: 'KYX_LONGBOW12_SCOPE_DATUM',
    adsDatumPosition: Object.freeze([0, 0.26, -0.04] as const),
    recoilRecoveryHalfLifeSeconds: 0.16,
    equipOffset: Object.freeze([0.16, -0.25, 0.34] as const),
    equipRotation: Object.freeze([0.25, -0.25, 0.28] as const),
    sprintOffset: Object.freeze([-0.12, 0.12, 0.2] as const),
    sprintRotation: Object.freeze([0.2, -0.12, -0.72] as const),
  }),
  kyx_breach_rocket_v1: Object.freeze({
    aimPresentation: 'launcher_sight' as const,
    adsDatumNode: 'KYX_BR6_LAUNCHER_SIGHT_DATUM',
    adsDatumPosition: Object.freeze([0, 0.27, -0.29] as const),
    recoilRecoveryHalfLifeSeconds: 0.18,
    equipOffset: Object.freeze([0.2, -0.28, 0.38] as const),
    equipRotation: Object.freeze([0.3, -0.28, 0.42] as const),
    sprintOffset: Object.freeze([-0.13, 0.12, 0.24] as const),
    sprintRotation: Object.freeze([0.25, -0.16, -0.86] as const),
  }),
  kyx_edge_v1: Object.freeze({
    aimPresentation: 'disabled' as const,
    adsDatumNode: null,
    adsDatumPosition: null,
    recoilRecoveryHalfLifeSeconds: 0.12,
    equipOffset: Object.freeze([0.2, -0.25, 0.26] as const),
    equipRotation: Object.freeze([0.28, -0.42, 0.58] as const),
    sprintOffset: Object.freeze([-0.02, 0.12, 0.08] as const),
    sprintRotation: Object.freeze([0.08, -0.18, -0.64] as const),
  }),
} as const);

export const KYX_WORLD_WEAPON_MOUNT_PROFILE = Object.freeze({
  vertical_rifle_v1: Object.freeze({
    scale: 0.92,
    position: Object.freeze([0, -0.015, -0.02] as const),
    rotation: Object.freeze([0, 0, 0] as const),
  }),
  kyx_sidearm_v1: Object.freeze({
    scale: 0.76,
    position: Object.freeze([0, 0.01, 0.08] as const),
    rotation: Object.freeze([0, 0, 0] as const),
  }),
  kyx_scattergun_v1: Object.freeze({
    scale: 0.92,
    position: Object.freeze([0, -0.015, -0.04] as const),
    rotation: Object.freeze([0, 0, 0] as const),
  }),
  kyx_longshot_v1: Object.freeze({
    scale: 0.86,
    position: Object.freeze([0, -0.02, -0.08] as const),
    rotation: Object.freeze([0, 0, 0] as const),
  }),
  kyx_breach_rocket_v1: Object.freeze({
    scale: 0.88,
    position: Object.freeze([0, -0.025, -0.04] as const),
    rotation: Object.freeze([0, 0, 0] as const),
  }),
  kyx_edge_v1: Object.freeze({
    scale: 0.9,
    position: Object.freeze([0, -0.01, -0.04] as const),
    rotation: Object.freeze([0, 0, 0] as const),
  }),
} as const);

export type KyxAuthorityWeaponId =
  keyof typeof KYX_AUTHORITY_WEAPON_PRESENTATION;

export type KyxWeaponFamily =
  typeof KYX_AUTHORITY_WEAPON_PRESENTATION[KyxAuthorityWeaponId]['family'];

export type KyxWeaponSilhouette =
  typeof KYX_AUTHORITY_WEAPON_PRESENTATION[KyxAuthorityWeaponId]['silhouette'];

export type KyxWeaponAimPresentation =
  typeof KYX_FIRST_PERSON_TRANSITION_PROFILE[KyxAuthorityWeaponId]['aimPresentation'];

export type KyxWeaponPhase =
  | 'holstered'
  | 'equipping'
  | 'ready'
  | 'firing'
  | 'recovering'
  | 'reloading'
  | 'sprinting'
  | 'empty'
  | 'dead';

interface MovingPart {
  readonly object: THREE.Object3D;
  readonly restPosition: THREE.Vector3;
  readonly restRotation: THREE.Euler;
}

interface WeaponMovingParts {
  readonly action?: MovingPart;
  readonly magazine?: MovingPart;
  readonly auxiliary?: MovingPart;
  readonly blade?: MovingPart;
}

export interface KyxFirstPersonWeaponPose {
  readonly baseScale: number;
  readonly aimEnabled: boolean;
  readonly aimOffset: THREE.Vector3;
  readonly aimRotation: THREE.Euler;
  readonly aimFieldOfViewDegrees: number;
  readonly aimScaleMultiplier: number;
  readonly aimPresentation: KyxWeaponAimPresentation;
  readonly aimDatumNodeName: string | null;
  readonly recoilOffset: THREE.Vector3;
  readonly recoilRotation: THREE.Euler;
  readonly recoilRecoveryHalfLifeSeconds: number;
  readonly reloadDurationMilliseconds: number;
  readonly reloadOffset: THREE.Vector3;
  readonly reloadRotation: THREE.Euler;
  readonly equipOffset: THREE.Vector3;
  readonly equipRotation: THREE.Euler;
  readonly sprintOffset: THREE.Vector3;
  readonly sprintRotation: THREE.Euler;
}

export interface KyxWeaponPresentationModel {
  readonly authorityWeaponId: KyxAuthorityWeaponId;
  readonly definitionId: string;
  readonly family: KyxWeaponFamily;
  readonly silhouette: KyxWeaponSilhouette;
  readonly label: string;
  readonly accent: number;
  readonly tracer: number;
  readonly presentation: 'first_person' | 'world';
  readonly group: THREE.Group;
  readonly muzzle: THREE.Object3D;
  readonly aimDatum: THREE.Object3D | null;
  readonly backblast: THREE.Object3D | null;
  readonly firstPersonContactRig: THREE.Group | null;
  readonly firstPersonHandCount: number;
  readonly firstPersonPose: KyxFirstPersonWeaponPose;
  readonly movingParts: WeaponMovingParts;
  fireImpulse: number;
  aimRequested: boolean;
  aimMix: number;
  reloadMix: number;
  reloadPoseMix: number;
  reloadProgress: number;
  reloadStartedAtMilliseconds: number | null;
  equipMix: number;
  sprintMix: number;
  phase: KyxWeaponPhase;
}

const DEFINITION_BY_AUTHORITY_ID = Object.freeze({
  vertical_rifle_v1: 'kyx_vlr7',
  kyx_sidearm_v1: 'kyx_k9_arc',
  kyx_scattergun_v1: 'kyx_sg4_breach',
  kyx_longshot_v1: 'kyx_longbow12',
  kyx_breach_rocket_v1: 'kyx_br6_siege',
  kyx_edge_v1: 'kyx_edge1',
} satisfies Record<KyxAuthorityWeaponId, string>);

interface MaterialSet {
  readonly armor: THREE.MeshStandardMaterial;
  readonly dark: THREE.MeshStandardMaterial;
  readonly metal: THREE.MeshStandardMaterial;
  readonly rubber: THREE.MeshStandardMaterial;
  readonly accent: THREE.MeshStandardMaterial;
  readonly lens: THREE.MeshStandardMaterial;
}

interface BuiltWeapon {
  readonly visual: THREE.Group;
  readonly muzzle: THREE.Object3D;
  readonly backblast?: THREE.Object3D;
  readonly movingParts: WeaponMovingParts;
}

export type KyxLineRifleReviewShellFactory = () => THREE.Group;
export type KyxWeaponReviewShellFactory = () => THREE.Group;

const KYX_VLR7_REVIEW_MAGAZINE_NODE = 'KYX_VLR7_REVIEW_MAGAZINE';
const KYX_REVIEW_MUZZLE_SUFFIX = '_MUZZLE_REFERENCE';
const KYX_REVIEW_MOTION_OVERLAY = 'kyxReviewMotionOverlay';
let lineRifleReviewShellFactory: KyxLineRifleReviewShellFactory | null = null;
const weaponReviewShellFactories: Partial<
  Record<KyxAuthorityWeaponId, KyxWeaponReviewShellFactory>
> = {};

export function installKyxLineRifleReviewShellFactory(
  factory: KyxLineRifleReviewShellFactory,
): () => void {
  const previous = lineRifleReviewShellFactory;
  lineRifleReviewShellFactory = factory;
  return () => {
    if (lineRifleReviewShellFactory === factory) {
      lineRifleReviewShellFactory = previous;
    }
  };
}

export function installKyxWeaponReviewShellFactory(
  weaponId: KyxAuthorityWeaponId,
  factory: KyxWeaponReviewShellFactory,
): () => void {
  const previous = weaponReviewShellFactories[weaponId];
  weaponReviewShellFactories[weaponId] = factory;
  return () => {
    if (weaponReviewShellFactories[weaponId] === factory) {
      if (previous === undefined) delete weaponReviewShellFactories[weaponId];
      else weaponReviewShellFactories[weaponId] = previous;
    }
  };
}

function applyInstalledReviewShell(
  weaponId: KyxAuthorityWeaponId,
  built: BuiltWeapon,
): BuiltWeapon {
  const factory = weaponReviewShellFactories[weaponId];
  if (factory === undefined) return built;

  // Preserve the procedural model as a fail-safe structural contract while
  // hiding only its render meshes. Its authority-facing muzzle/backblast
  // markers and presentation animation state remain the single source of
  // truth, preventing a donor asset from changing combat behavior.
  built.visual.traverse((object) => {
    if (
      (object as THREE.Mesh).isMesh
      && object.userData[KYX_REVIEW_MOTION_OVERLAY] !== true
    ) {
      object.visible = false;
    }
  });
  const reviewShell = factory();
  reviewShell.name = `${weaponId.toUpperCase()}_REVIEW_SHELL_MOUNT`;
  reviewShell.userData.presentationOnly = true;
  reviewShell.userData.noHit = true;
  reviewShell.userData.authorityUnchanged = true;
  built.visual.add(reviewShell);
  const reviewMuzzle = findReviewMuzzleReference(reviewShell);
  let reviewBackblast = built.backblast;
  if (weaponId === 'kyx_breach_rocket_v1' && reviewMuzzle !== null) {
    reviewBackblast = createReviewBackblastReference(
      reviewShell,
      reviewMuzzle,
    );
  }
  built.visual.userData.weaponVisualSource =
    reviewShell.userData.weaponVisualSource ?? 'quaternius_cc0_armory_rev1';
  built.visual.userData.reviewCandidateId =
    reviewShell.userData.reviewCandidateId ?? null;
  built.visual.userData.sourceAssetSha256 =
    reviewShell.userData.sourceAssetSha256 ?? null;
  built.visual.userData.sourceAssetBytes =
    reviewShell.userData.sourceAssetBytes ?? null;
  built.visual.userData.reviewMuzzleReferenceBound = reviewMuzzle !== null;
  return {
    ...built,
    muzzle: reviewMuzzle ?? built.muzzle,
    backblast: reviewBackblast,
  };
}

function preserveWithReviewShell(object: THREE.Object3D): void {
  object.traverse((child) => {
    child.userData[KYX_REVIEW_MOTION_OVERLAY] = true;
    child.userData.presentationOnly = true;
    child.userData.noHit = true;
  });
}

function fitInstalledReviewShellForFirstPerson(visual: THREE.Group): void {
  const reviewShell = visual.children.find((child) => (
    typeof child.userData.firstPersonScaleMultiplier === 'number'
  ));
  if (reviewShell === undefined) return;
  const multiplier = reviewShell.userData.firstPersonScaleMultiplier as number;
  const pivotValue = reviewShell.userData.firstPersonScalePivot as unknown;
  if (
    !Number.isFinite(multiplier)
    || multiplier <= 0
    || multiplier > 1
    || !Array.isArray(pivotValue)
    || pivotValue.length !== 3
    || !pivotValue.every((value) => Number.isFinite(value))
  ) {
    throw new Error('KYX_REVIEW_FIRST_PERSON_FIT_INVALID');
  }
  const pivot = new THREE.Vector3(
    pivotValue[0] as number,
    pivotValue[1] as number,
    pivotValue[2] as number,
  );
  // Scale the donor and its authored muzzle reference as one object. This
  // preserves camera framing without detaching muzzle FX from the nozzle.
  reviewShell.scale.setScalar(multiplier);
  reviewShell.position.copy(pivot).multiplyScalar(1 - multiplier);
  reviewShell.userData.firstPersonFitApplied = true;
}

function createLineRifleReviewShell(): Readonly<{
  root: THREE.Group;
  magazine: THREE.Object3D;
  muzzle: THREE.Object3D | null;
}> | null {
  if (lineRifleReviewShellFactory === null) return null;
  const root = lineRifleReviewShellFactory();
  const magazine = root.getObjectByName(KYX_VLR7_REVIEW_MAGAZINE_NODE);
  if (magazine === undefined) {
    throw new Error(
      `KYX_VLR7_REVIEW_MAGAZINE_MISSING node=${KYX_VLR7_REVIEW_MAGAZINE_NODE}`,
    );
  }
  root.name = 'KYX_VLR7_REVIEW_SHELL_MOUNT';
  root.userData.presentationOnly = true;
  root.userData.noHit = true;
  root.userData.authorityUnchanged = true;
  const muzzle = findReviewMuzzleReference(root);
  root.userData.reviewMuzzleReferenceBound = muzzle !== null;
  return Object.freeze({ root, magazine, muzzle });
}

function standardMaterials(
  accentColor: number,
  armorColor = 0x27333a,
): MaterialSet {
  return {
    armor: new THREE.MeshStandardMaterial({
      color: armorColor,
      metalness: 0.72,
      roughness: 0.3,
    }),
    dark: new THREE.MeshStandardMaterial({
      color: 0x111b21,
      metalness: 0.62,
      roughness: 0.42,
    }),
    metal: new THREE.MeshStandardMaterial({
      color: 0x85939a,
      metalness: 0.94,
      roughness: 0.18,
    }),
    rubber: new THREE.MeshStandardMaterial({
      color: 0x111517,
      metalness: 0.12,
      roughness: 0.8,
    }),
    accent: new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 2.6,
      metalness: 0.28,
      roughness: 0.24,
    }),
    lens: new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 3.8,
      metalness: 0.05,
      roughness: 0.08,
      transparent: true,
      opacity: 0.9,
    }),
  };
}

function box(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  position: readonly [number, number, number],
  rotation: readonly [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material,
  );
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  return mesh;
}

function cylinderZ(
  radiusTop: number,
  radiusBottom: number,
  depth: number,
  material: THREE.Material,
  position: readonly [number, number, number],
  radialSegments = 12,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(
      radiusTop,
      radiusBottom,
      depth,
      radialSegments,
    ),
    material,
  );
  mesh.position.set(...position);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function torusZ(
  radius: number,
  tube: number,
  material: THREE.Material,
  position: readonly [number, number, number],
  radialSegments = 8,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, radialSegments, 18),
    material,
  );
  mesh.position.set(...position);
  return mesh;
}

function finPair(
  group: THREE.Group,
  material: THREE.Material,
  z: number,
  halfWidth: number,
  height: number,
  depth: number,
): void {
  for (const side of [-1, 1] as const) {
    group.add(box(
      0.018,
      height,
      depth,
      material,
      [side * halfWidth, 0.065, z],
      [0, 0, side * 0.16],
    ));
  }
}

function ventBank(
  group: THREE.Group,
  material: THREE.Material,
  zStart: number,
  count: number,
  spacing: number,
  x: number,
  y: number,
): void {
  for (let index = 0; index < count; index += 1) {
    group.add(box(
      0.01,
      0.045,
      0.035,
      material,
      [x, y, zStart - index * spacing],
      [0.14, 0, 0],
    ));
  }
}

function movingPart(object: THREE.Object3D): MovingPart {
  return {
    object,
    restPosition: object.position.clone(),
    restRotation: object.rotation.clone(),
  };
}

function marker(
  parent: THREE.Object3D,
  name: string,
  position: readonly [number, number, number],
): THREE.Object3D {
  const result = new THREE.Object3D();
  result.name = name;
  result.position.set(...position);
  parent.add(result);
  return result;
}

function resolveAimDatum(
  visual: THREE.Group,
  transition: typeof KYX_FIRST_PERSON_TRANSITION_PROFILE[KyxAuthorityWeaponId],
): THREE.Object3D | null {
  if (transition.adsDatumNode === null) return null;
  const existing = visual.getObjectByName(transition.adsDatumNode);
  if (existing !== undefined) return existing;
  if (transition.adsDatumPosition === null) {
    throw new Error(
      `KYX_ADS_DATUM_MISSING node=${transition.adsDatumNode}`,
    );
  }
  return marker(
    visual,
    transition.adsDatumNode,
    transition.adsDatumPosition,
  );
}

function buildLineRifle(
  materials: MaterialSet,
  includeReviewShell: boolean,
): BuiltWeapon {
  const visual = new THREE.Group();
  visual.name = 'KYX_VLR7_LINE_RIFLE_VISUAL';
  const defaultShell = new THREE.Group();
  defaultShell.name = 'KYX_VLR7_DEFAULT_PROCEDURAL_SHELL';
  const reviewShell = includeReviewShell
    ? createLineRifleReviewShell()
    : null;

  const receiverCore = box(
    0.13,
    0.13,
    0.36,
    materials.armor,
    [0, 0.045, 0.04],
  );
  receiverCore.name = 'KYX_VLR7_RECEIVER_CORE';
  const upperShroud = box(
    0.095,
    0.052,
    0.42,
    materials.dark,
    [0, 0.145, -0.02],
  );
  upperShroud.name = 'KYX_VLR7_UPPER_SHROUD';
  const opticRail = box(
    0.07,
    0.028,
    0.68,
    materials.metal,
    [0, 0.19, -0.14],
  );
  opticRail.name = 'KYX_VLR7_OPTIC_RAIL';

  defaultShell.add(
    receiverCore,
    upperShroud,
    cylinderZ(0.072, 0.064, 0.36, materials.armor, [0, 0.075, -0.34], 10),
    opticRail,
    box(0.1, 0.105, 0.2, materials.armor, [0, 0.045, 0.31], [0.08, 0, 0]),
    box(0.075, 0.14, 0.12, materials.rubber, [0, 0.025, 0.44]),
    box(0.052, 0.12, 0.07, materials.rubber, [0, -0.025, -0.36], [-0.08, 0, 0]),
    box(0.012, 0.078, 0.18, materials.metal, [0.071, 0.078, 0.03], [0.02, 0, 0]),
    box(0.012, 0.078, 0.18, materials.metal, [-0.071, 0.078, 0.03], [0.02, 0, 0]),
    box(0.018, 0.024, 0.28, materials.dark, [0.075, 0.085, -0.35]),
    box(0.018, 0.024, 0.28, materials.dark, [-0.075, 0.085, -0.35]),
    box(0.065, 0.018, 0.14, materials.accent, [0.071, 0.035, -0.14]),
  );
  finPair(defaultShell, materials.armor, -0.31, 0.072, 0.1, 0.24);
  ventBank(defaultShell, materials.accent, -0.22, 4, 0.078, -0.059, 0.105);
  ventBank(defaultShell, materials.accent, -0.22, 4, 0.078, 0.059, 0.105);
  for (const z of [-0.22, -0.34, -0.46]) {
    defaultShell.add(torusZ(0.069, 0.008, materials.dark, [0, 0.075, z]));
  }
  for (const z of [-0.14, -0.04, 0.06, 0.16]) {
    defaultShell.add(
      box(0.075, 0.012, 0.045, materials.metal, [0, 0.181, z]),
    );
  }

  defaultShell.add(
    cylinderZ(0.021, 0.021, 0.29, materials.metal, [0, 0.105, -0.64]),
    cylinderZ(0.04, 0.045, 0.075, materials.dark, [0, 0.105, -0.8]),
    torusZ(0.031, 0.008, materials.accent, [0, 0.105, -0.84]),
  );
  for (const [width, height] of [[0.076, 0.026], [0.026, 0.076]] as const) {
    defaultShell.add(box(
      width,
      height,
      0.06,
      materials.metal,
      [0, 0.105, -0.82],
    ));
  }

  const magazine = new THREE.Group();
  magazine.name = 'KYX_VLR7_MAGAZINE';
  magazine.position.set(0, -0.09, 0.055);
  magazine.rotation.x = -0.12;
  magazine.add(
    box(0.075, 0.22, 0.1, materials.dark, [0, -0.07, 0]),
    box(0.024, 0.155, 0.03, materials.accent, [0, -0.06, 0.06]),
  );
  visual.add(magazine);

  const action = box(
    0.075,
    0.035,
    0.13,
    materials.metal,
    [0, 0.155, 0.08],
  );
  action.name = 'KYX_VLR7_RECIPROCATING_ACTION';
  // The bare reciprocating block reads as detached floating metal over the
  // donor shell, so it stays procedural-only while remaining a moving part.
  action.visible = reviewShell === null;
  visual.add(action);

  const grip = new THREE.Group();
  grip.position.set(0, -0.06, 0.19);
  grip.rotation.x = 0.26;
  grip.add(
    box(0.075, 0.17, 0.075, materials.rubber, [0, -0.055, 0]),
    box(0.083, 0.025, 0.082, materials.metal, [0, -0.14, 0]),
  );
  defaultShell.add(grip);

  const optic = new THREE.Group();
  optic.name = 'KYX_VLR7_REFLEX_OPTIC';
  optic.position.set(0, 0.235, 0.01);
  const reflexLensMaterial = materials.lens.clone();
  reflexLensMaterial.name = 'KYX_VLR7_REFLEX_GLASS';
  reflexLensMaterial.opacity = 0.28;
  reflexLensMaterial.depthWrite = false;
  reflexLensMaterial.side = THREE.DoubleSide;
  const reticleMaterial = materials.lens.clone();
  reticleMaterial.name = 'KYX_VLR7_REFLEX_RETICLE';
  reticleMaterial.opacity = 1;
  reticleMaterial.depthWrite = false;
  reticleMaterial.blending = THREE.AdditiveBlending;
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.038, 24),
    reflexLensMaterial,
  );
  lens.name = 'KYX_VLR7_REFLEX_LENS';
  lens.position.set(0, 0, -0.045);
  const reticle = new THREE.Mesh(
    new THREE.SphereGeometry(0.0055, 10, 6),
    reticleMaterial,
  );
  reticle.name = 'KYX_VLR7_REFLEX_RETICLE_DOT';
  reticle.position.set(0, 0, -0.052);
  optic.add(
    torusZ(0.045, 0.007, materials.dark, [0, 0, -0.038], 12),
    box(0.012, 0.045, 0.075, materials.dark, [-0.047, -0.025, 0]),
    box(0.012, 0.045, 0.075, materials.dark, [0.047, -0.025, 0]),
    box(0.105, 0.014, 0.09, materials.dark, [0, -0.055, 0]),
    lens,
    reticle,
  );
  visual.add(optic);
  visual.add(defaultShell);
  if (reviewShell !== null) {
    defaultShell.visible = false;
    magazine.visible = false;
    visual.add(reviewShell.root);
    visual.userData.weaponVisualSource =
      reviewShell.root.userData.weaponVisualSource
      ?? 'quaternius_cc0_review_rev1';
    visual.userData.reviewCandidateId =
      reviewShell.root.userData.reviewCandidateId ?? null;
    visual.userData.sourceAssetSha256 =
      reviewShell.root.userData.sourceAssetSha256 ?? null;
    visual.userData.sourceAssetBytes =
      reviewShell.root.userData.sourceAssetBytes ?? null;
  } else {
    visual.userData.weaponVisualSource = 'project_authored_procedural';
  }

  const proceduralMuzzle = marker(
    visual,
    'KYX_VLR7_MUZZLE',
    [0, 0.105, -0.89],
  );
  visual.userData.reviewMuzzleReferenceBound = reviewShell?.muzzle !== null
    && reviewShell?.muzzle !== undefined;
  return {
    visual,
    muzzle: reviewShell?.muzzle ?? proceduralMuzzle,
    movingParts: {
      action: movingPart(action),
      magazine: movingPart(reviewShell?.magazine ?? magazine),
    },
  };
}

function buildArcSidearm(materials: MaterialSet): BuiltWeapon {
  const visual = new THREE.Group();
  visual.name = 'KYX_K9_ARC_SIDEARM_VISUAL';
  const sidearmAccent = materials.accent.clone();
  sidearmAccent.name = 'KYX_K9_TACTICAL_ACCENT';
  sidearmAccent.color.setHex(0xb57e2e);
  sidearmAccent.emissive.setHex(0xffb24a);
  sidearmAccent.emissiveIntensity = 0.65;

  const slide = new THREE.Group();
  slide.name = 'KYX_K9_RECIPROCATING_SLIDE';
  slide.position.set(0, 0.12, -0.07);
  slide.add(
    box(0.105, 0.09, 0.33, materials.dark, [0, 0, 0]),
    box(0.07, 0.018, 0.37, materials.metal, [0, 0.054, -0.01]),
    box(0.055, 0.025, 0.12, materials.armor, [0, -0.054, -0.1]),
  );
  ventBank(slide, sidearmAccent, -0.1, 3, 0.052, -0.056, 0.01);
  ventBank(slide, sidearmAccent, -0.1, 3, 0.052, 0.056, 0.01);
  visual.add(slide);

  visual.add(
    box(0.095, 0.085, 0.24, materials.armor, [0, 0.045, -0.01]),
    cylinderZ(0.026, 0.026, 0.2, materials.metal, [0, 0.12, -0.23]),
    torusZ(0.042, 0.01, sidearmAccent, [0, 0.12, -0.335]),
    box(0.07, 0.022, 0.095, materials.dark, [0, -0.005, 0.02]),
  );

  const chamber = cylinderZ(
    0.06,
    0.06,
    0.11,
    materials.dark,
    [0, 0.062, 0.02],
    8,
  );
  chamber.name = 'KYX_K9_POWER_CHAMBER';
  visual.add(chamber);
  for (let index = 0; index < 6; index += 1) {
    const angle = index / 6 * Math.PI * 2;
    visual.add(cylinderZ(
      0.009,
      0.009,
      0.118,
      sidearmAccent,
      [Math.cos(angle) * 0.043, 0.062 + Math.sin(angle) * 0.043, 0.02],
      8,
    ));
  }

  const magazine = new THREE.Group();
  magazine.name = 'KYX_K9_GRIP_CELL';
  magazine.position.set(0, -0.04, 0.12);
  magazine.rotation.x = 0.34;
  magazine.add(
    box(0.085, 0.21, 0.09, materials.rubber, [0, -0.07, 0]),
    box(0.035, 0.14, 0.03, sidearmAccent, [0, -0.055, 0.055]),
    box(0.095, 0.028, 0.1, materials.metal, [0, -0.18, 0]),
  );
  visual.add(magazine);

  visual.add(
    box(0.04, 0.03, 0.028, materials.metal, [0, 0.19, -0.21]),
    box(0.06, 0.035, 0.035, materials.dark, [0, 0.19, 0.07]),
  );

  // The donor is a single fused mesh, so keep the verified shell intact and
  // layer only two compact mechanical witnesses over it. They read as a rear
  // slide cap and removable power cell, not as a second pistol body.
  const reviewAction = box(
    0.062,
    0.026,
    0.082,
    materials.metal,
    [0.038, 0.165, 0.045],
  );
  reviewAction.name = 'KYX_K9_REVIEW_SLIDE_CAP';
  const reviewCell = new THREE.Group();
  reviewCell.name = 'KYX_K9_REVIEW_POWER_CELL';
  reviewCell.position.set(0, -0.09, 0.135);
  reviewCell.rotation.x = 0.3;
  reviewCell.add(
    box(0.052, 0.105, 0.052, materials.dark, [0, -0.025, 0]),
    box(0.018, 0.072, 0.012, sidearmAccent, [0, -0.02, 0.032]),
  );
  preserveWithReviewShell(reviewAction);
  preserveWithReviewShell(reviewCell);
  visual.add(reviewAction, reviewCell);

  return {
    visual,
    muzzle: marker(visual, 'KYX_K9_MUZZLE', [0, 0.12, -0.385]),
    movingParts: {
      action: movingPart(reviewAction),
      magazine: movingPart(reviewCell),
      auxiliary: movingPart(chamber),
    },
  };
}

function findReviewMuzzleReference(
  root: THREE.Object3D,
): THREE.Object3D | null {
  const matches: THREE.Object3D[] = [];
  root.traverse((object) => {
    if (object.name.endsWith(KYX_REVIEW_MUZZLE_SUFFIX)) {
      matches.push(object);
    }
  });
  if (matches.length > 1) {
    throw new Error(
      `KYX_REVIEW_MUZZLE_REFERENCE_AMBIGUOUS count=${matches.length}`,
    );
  }
  return matches[0] ?? null;
}

function createReviewBackblastReference(
  reviewShell: THREE.Group,
  muzzle: THREE.Object3D,
): THREE.Object3D {
  reviewShell.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(reviewShell);
  const muzzleWorld = muzzle.getWorldPosition(new THREE.Vector3());
  const rearWorld = new THREE.Vector3(
    muzzleWorld.x,
    muzzleWorld.y,
    bounds.max.z + 0.06,
  );
  const backblast = new THREE.Object3D();
  backblast.name = 'KYX_BR6_REVIEW_BACKBLAST_REFERENCE';
  backblast.position.copy(reviewShell.worldToLocal(rearWorld));
  backblast.userData.presentationOnly = true;
  backblast.userData.noHit = true;
  backblast.userData.calibratedToVisibleRear = true;
  reviewShell.add(backblast);
  return backblast;
}

function buildBreachScattergun(materials: MaterialSet): BuiltWeapon {
  const visual = new THREE.Group();
  visual.name = 'KYX_SG4_BREACH_ARRAY_VISUAL';

  visual.add(
    box(0.19, 0.145, 0.34, materials.armor, [0, 0.065, 0.02]),
    box(0.16, 0.055, 0.4, materials.dark, [0, 0.165, -0.04]),
    box(0.13, 0.12, 0.17, materials.armor, [0, 0.045, 0.3]),
    box(0.12, 0.14, 0.1, materials.rubber, [0, 0.015, 0.43]),
  );
  finPair(visual, materials.metal, -0.34, 0.115, 0.12, 0.33);

  const barrelOffsets: readonly [number, number][] = [
    [-0.055, 0.055],
    [0.055, 0.055],
    [-0.055, 0.135],
    [0.055, 0.135],
  ];
  for (const [x, y] of barrelOffsets) {
    visual.add(
      cylinderZ(0.026, 0.026, 0.39, materials.metal, [x, y, -0.48], 12),
      torusZ(0.038, 0.01, materials.dark, [x, y, -0.68]),
      torusZ(0.026, 0.006, materials.accent, [x, y, -0.695]),
    );
  }

  const pump = new THREE.Group();
  pump.name = 'KYX_SG4_RECIPROCATING_PUMP';
  pump.position.set(0, -0.005, -0.37);
  pump.add(
    box(0.17, 0.075, 0.17, materials.rubber, [0, 0, 0]),
    box(0.135, 0.018, 0.13, materials.accent, [0, -0.046, 0]),
  );
  visual.add(pump);
  preserveWithReviewShell(pump);

  const drum = new THREE.Group();
  drum.name = 'KYX_SG4_QUAD_CELL_DRUM';
  drum.position.set(0, -0.08, 0.03);
  drum.add(
    cylinderZ(0.09, 0.09, 0.13, materials.dark, [0, 0, 0], 12),
    torusZ(0.07, 0.012, materials.accent, [0, 0, -0.07]),
    torusZ(0.07, 0.012, materials.metal, [0, 0, 0.07]),
  );
  visual.add(drum);

  const loadingGate = box(
    0.075,
    0.038,
    0.09,
    materials.accent,
    [0.075, -0.005, 0.045],
    [0, 0, -0.08],
  );
  loadingGate.name = 'KYX_SG4_REVIEW_LOADING_GATE';
  preserveWithReviewShell(loadingGate);
  visual.add(loadingGate);

  const grip = new THREE.Group();
  grip.position.set(0, -0.045, 0.2);
  grip.rotation.x = 0.25;
  grip.add(box(0.09, 0.18, 0.085, materials.rubber, [0, -0.07, 0]));
  visual.add(grip);

  return {
    visual,
    muzzle: marker(visual, 'KYX_SG4_MUZZLE', [0, 0.095, -0.74]),
    movingParts: {
      action: movingPart(pump),
      magazine: movingPart(loadingGate),
    },
  };
}

function buildLongbowSniper(materials: MaterialSet): BuiltWeapon {
  const visual = new THREE.Group();
  visual.name = 'KYX_LONGBOW12_VISUAL';

  visual.add(
    box(0.11, 0.125, 0.42, materials.armor, [0, 0.055, 0.04]),
    box(0.09, 0.06, 0.54, materials.dark, [0, 0.145, -0.06]),
    box(0.085, 0.1, 0.36, materials.dark, [0, 0.09, -0.39]),
    box(0.065, 0.028, 0.9, materials.metal, [0, 0.195, -0.22]),
  );
  ventBank(visual, materials.accent, -0.27, 5, 0.07, -0.05, 0.105);
  ventBank(visual, materials.accent, -0.27, 5, 0.07, 0.05, 0.105);

  visual.add(
    cylinderZ(0.019, 0.022, 0.52, materials.metal, [0, 0.11, -0.79], 16),
    box(0.085, 0.072, 0.13, materials.dark, [0, 0.11, -1.08]),
    box(0.13, 0.025, 0.08, materials.metal, [0, 0.11, -1.1]),
    box(0.025, 0.12, 0.08, materials.metal, [0, 0.11, -1.1]),
    torusZ(0.028, 0.007, materials.accent, [0, 0.11, -1.15]),
  );

  const bolt = new THREE.Group();
  bolt.name = 'KYX_LONGBOW12_BOLT';
  bolt.position.set(0.075, 0.13, 0.06);
  bolt.add(
    cylinderZ(0.013, 0.013, 0.19, materials.metal, [0, 0, 0], 10),
    cylinderZ(0.024, 0.024, 0.04, materials.dark, [0, -0.055, 0.08], 10),
  );
  visual.add(bolt);
  preserveWithReviewShell(bolt);

  const magazine = new THREE.Group();
  magazine.name = 'KYX_LONGBOW12_MAGAZINE';
  magazine.position.set(0, -0.08, 0.02);
  magazine.add(
    box(0.075, 0.23, 0.1, materials.dark, [0, -0.07, 0]),
    box(0.025, 0.165, 0.035, materials.accent, [0, -0.06, 0.06]),
  );
  visual.add(magazine);

  const reviewMagazine = new THREE.Group();
  reviewMagazine.name = 'KYX_LONGBOW12_REVIEW_MAGAZINE';
  reviewMagazine.position.set(0, -0.075, 0.035);
  reviewMagazine.add(
    box(0.058, 0.12, 0.065, materials.dark, [0, -0.035, 0]),
    box(0.018, 0.082, 0.014, materials.accent, [0, -0.03, 0.04]),
  );
  preserveWithReviewShell(reviewMagazine);
  visual.add(reviewMagazine);

  const scope = new THREE.Group();
  scope.name = 'KYX_LONGBOW12_SCOPE';
  scope.position.set(0, 0.26, 0);
  scope.add(
    cylinderZ(0.042, 0.042, 0.42, materials.dark, [0, 0, 0], 16),
    cylinderZ(0.058, 0.048, 0.12, materials.metal, [0, 0, -0.24], 16),
    cylinderZ(0.046, 0.05, 0.1, materials.dark, [0, 0, 0.24], 16),
    cylinderZ(0.04, 0.04, 0.012, materials.lens, [0, 0, -0.305], 16),
    cylinderZ(0.035, 0.035, 0.012, materials.lens, [0, 0, 0.295], 16),
  );
  visual.add(scope);

  const stock = new THREE.Group();
  stock.position.set(0, 0.02, 0.38);
  stock.add(
    box(0.085, 0.07, 0.32, materials.armor, [0, 0.05, 0]),
    box(0.03, 0.17, 0.24, materials.dark, [0, -0.03, 0.02], [0.18, 0, 0]),
    box(0.11, 0.16, 0.07, materials.rubber, [0, 0.015, 0.18]),
  );
  visual.add(stock);

  return {
    visual,
    muzzle: marker(visual, 'KYX_LONGBOW12_MUZZLE', [0, 0.11, -1.205]),
    movingParts: {
      action: movingPart(bolt),
      magazine: movingPart(reviewMagazine),
    },
  };
}

function buildSiegeLauncher(materials: MaterialSet): BuiltWeapon {
  const visual = new THREE.Group();
  visual.name = 'KYX_BR6_SIEGE_TUBE_VISUAL';
  const launcherAccent = materials.accent.clone();
  launcherAccent.name = 'KYX_BR6_TACTICAL_ACCENT';
  launcherAccent.color.setHex(0xa63d2d);
  launcherAccent.emissive.setHex(0xff6042);
  launcherAccent.emissiveIntensity = 0.55;

  visual.add(
    cylinderZ(0.12, 0.12, 0.9, materials.armor, [0, 0.11, -0.08], 12),
    cylinderZ(0.095, 0.095, 0.94, materials.dark, [0, 0.11, -0.08], 16),
  );
  for (const z of [-0.45, -0.16, 0.12, 0.37]) {
    visual.add(torusZ(0.125, 0.018, materials.metal, [0, 0.11, z], 8));
  }
  for (const side of [-1, 1] as const) {
    visual.add(
      box(0.035, 0.17, 0.62, materials.armor, [
        side * 0.13,
        0.11,
        -0.08,
      ]),
      box(0.012, 0.1, 0.46, launcherAccent, [
        side * 0.15,
        0.11,
        -0.08,
      ]),
    );
  }

  visual.add(
    cylinderZ(0.155, 0.13, 0.16, materials.dark, [0, 0.11, -0.58], 12),
    torusZ(0.14, 0.02, launcherAccent, [0, 0.11, -0.67], 8),
    cylinderZ(0.17, 0.14, 0.18, materials.metal, [0, 0.11, 0.46], 12),
    torusZ(0.155, 0.018, launcherAccent, [0, 0.11, 0.56], 8),
  );
  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2;
    visual.add(box(
      0.045,
      0.025,
      0.16,
      materials.dark,
      [
        Math.cos(angle) * 0.15,
        0.11 + Math.sin(angle) * 0.15,
        0.48,
      ],
      [0, 0, angle],
    ));
  }

  const chamber = new THREE.Group();
  chamber.name = 'KYX_BR6_LOCKING_CHAMBER';
  chamber.position.set(0, 0.11, -0.05);
  chamber.add(
    cylinderZ(0.135, 0.135, 0.22, materials.dark, [0, 0, 0], 10),
    torusZ(0.115, 0.016, launcherAccent, [0, 0, -0.12], 8),
  );
  visual.add(chamber);
  preserveWithReviewShell(chamber);

  const grip = new THREE.Group();
  grip.position.set(0, -0.01, 0.14);
  grip.rotation.x = 0.22;
  grip.add(
    box(0.095, 0.21, 0.1, materials.rubber, [0, -0.08, 0]),
    box(0.12, 0.035, 0.12, materials.metal, [0, -0.19, 0]),
  );
  visual.add(grip);

  const sight = new THREE.Group();
  sight.name = 'KYX_BR6_REVIEW_SIGHT';
  sight.position.set(0, 0.27, -0.18);
  sight.add(
    box(0.1, 0.07, 0.2, materials.dark, [0, 0, 0]),
    box(0.065, 0.045, 0.012, materials.lens, [0, 0.005, -0.108]),
  );
  visual.add(sight);
  preserveWithReviewShell(sight);

  return {
    visual,
    muzzle: marker(visual, 'KYX_BR6_NOZZLE', [0, 0.11, -0.76]),
    backblast: marker(visual, 'KYX_BR6_BACKBLAST', [0, 0.11, 0.67]),
    movingParts: {
      magazine: movingPart(chamber),
      auxiliary: movingPart(sight),
    },
  };
}

function buildPhaseSaber(materials: MaterialSet): BuiltWeapon {
  const visual = new THREE.Group();
  visual.name = 'KYX_EDGE1_PHASE_SABER_VISUAL';

  const bladeGlow = materials.lens.clone();
  bladeGlow.name = 'KYX_EDGE1_BLADE_GLOW';
  bladeGlow.color.setHex(0x2b747c);
  bladeGlow.emissive.setHex(0x21b7c5);
  bladeGlow.emissiveIntensity = 0.65;
  bladeGlow.opacity = 0.72;
  const bladeCore = materials.accent.clone();
  bladeCore.name = 'KYX_EDGE1_BLADE_CORE';
  bladeCore.color.setHex(0x2b818b);
  bladeCore.emissive.setHex(0x37dbe9);
  bladeCore.emissiveIntensity = 0.45;

  const grip = new THREE.Group();
  grip.position.set(0, 0.02, 0.14);
  grip.add(
    cylinderZ(0.035, 0.045, 0.31, materials.rubber, [0, 0, 0], 10),
    torusZ(0.047, 0.01, materials.metal, [0, 0, -0.14], 8),
    torusZ(0.047, 0.01, materials.metal, [0, 0, 0.14], 8),
  );
  for (const z of [-0.09, -0.03, 0.03, 0.09]) {
    grip.add(torusZ(0.039, 0.005, materials.accent, [0, 0, z], 8));
  }
  visual.add(grip);

  visual.add(
    box(0.26, 0.045, 0.075, materials.metal, [0, 0.02, -0.055]),
    box(0.19, 0.085, 0.055, materials.dark, [0, 0.02, -0.075]),
  );
  for (const side of [-1, 1] as const) {
    visual.add(box(
      0.04,
      0.095,
      0.18,
      materials.armor,
      [side * 0.115, 0.02, -0.1],
      [0, side * -0.34, 0],
    ));
  }

  const blade = new THREE.Group();
  blade.name = 'KYX_EDGE1_ENERGY_BLADE';
  blade.position.set(0, 0.02, -0.16);
  blade.add(
    box(0.075, 0.025, 0.76, bladeGlow, [0, 0, -0.36]),
    box(0.025, 0.052, 0.72, bladeCore, [0, 0, -0.34]),
    box(0.11, 0.035, 0.11, materials.metal, [0, 0, -0.02]),
  );
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.055, 0.18, 4),
    bladeGlow,
  );
  tip.position.set(0, 0, -0.82);
  tip.rotation.x = -Math.PI / 2;
  blade.add(tip);
  visual.add(blade);

  return {
    visual,
    muzzle: marker(blade, 'KYX_EDGE1_TIP', [0, 0, -0.94]),
    movingParts: {
      blade: movingPart(blade),
    },
  };
}

function buildByWeaponId(
  weaponId: KyxAuthorityWeaponId,
  materials: MaterialSet,
  includeReviewShell: boolean,
): BuiltWeapon {
  let built: BuiltWeapon;
  switch (weaponId) {
    case 'vertical_rifle_v1':
      built = buildLineRifle(materials, includeReviewShell);
      break;
    case 'kyx_sidearm_v1':
      built = buildArcSidearm(materials);
      break;
    case 'kyx_scattergun_v1':
      built = buildBreachScattergun(materials);
      break;
    case 'kyx_longshot_v1':
      built = buildLongbowSniper(materials);
      break;
    case 'kyx_breach_rocket_v1':
      built = buildSiegeLauncher(materials);
      break;
    case 'kyx_edge_v1':
      built = buildPhaseSaber(materials);
      break;
  }
  return includeReviewShell
    ? applyInstalledReviewShell(weaponId, built)
    : built;
}

export function normalizeKyxAuthorityWeaponId(
  value: string | null | undefined,
): KyxAuthorityWeaponId {
  if (value === undefined || value === null) return 'vertical_rifle_v1';
  if (Object.prototype.hasOwnProperty.call(
    KYX_AUTHORITY_WEAPON_PRESENTATION,
    value,
  )) {
    return value as KyxAuthorityWeaponId;
  }
  throw new Error(`KYX_WEAPON_PROFILE_MISSING weaponId=${value}`);
}

export function createKyxWeaponPresentationModel(
  requestedWeaponId: string | null | undefined,
  presentation: 'first_person' | 'world',
): KyxWeaponPresentationModel {
  const authorityWeaponId = normalizeKyxAuthorityWeaponId(requestedWeaponId);
  const spec = KYX_AUTHORITY_WEAPON_PRESENTATION[authorityWeaponId];
  const transition = KYX_FIRST_PERSON_TRANSITION_PROFILE[authorityWeaponId];
  const worldMount = KYX_WORLD_WEAPON_MOUNT_PROFILE[authorityWeaponId];
  const materials = standardMaterials(
    spec.accent,
    authorityWeaponId === 'vertical_rifle_v1'
      ? 0x3a515b
      : authorityWeaponId === 'kyx_sidearm_v1'
      ? 0x303941
      : authorityWeaponId === 'kyx_longshot_v1'
        ? 0x33434b
        : authorityWeaponId === 'kyx_breach_rocket_v1'
          ? 0x3a302e
          : 0x26343a,
  );
  // Review assets remain visible on world weapons for provenance review, but
  // they are not yet Human Eye accepted for the local camera. Keep the
  // project-authored procedural weapon in first person so the player always
  // has a readable weapon, muzzle, and reload silhouette.
  const built = buildByWeaponId(
    authorityWeaponId,
    materials,
    presentation === 'world',
  );
  if (presentation === 'first_person') {
    fitInstalledReviewShellForFirstPerson(built.visual);
  }
  const aimDatum = resolveAimDatum(built.visual, transition);
  const group = new THREE.Group();
  group.name = `ONLINE_${presentation.toUpperCase()}_${authorityWeaponId}`;
  group.userData.projectAuthoredPresentation = true;
  group.userData.authorityWeaponId = authorityWeaponId;
  group.userData.weaponFamily = spec.family;
  group.userData.weaponSilhouette = spec.silhouette;
  group.userData.weaponVisualSource =
    built.visual.userData.weaponVisualSource ?? 'project_authored_procedural';
  group.userData.reviewCandidateId =
    built.visual.userData.reviewCandidateId ?? null;
  group.userData.sourceAssetSha256 =
    built.visual.userData.sourceAssetSha256 ?? null;
  group.userData.sourceAssetBytes =
    built.visual.userData.sourceAssetBytes ?? null;
  group.userData.muzzleNodeName = built.muzzle.name;
  group.userData.authorityMuzzleReferenceBound =
    built.visual.userData.reviewMuzzleReferenceBound === true;
  group.userData.aimDatumNodeName = aimDatum?.name ?? null;
  group.add(built.visual);
  const firstPersonContact = presentation === 'first_person'
    ? createKyxFirstPersonContactRig(authorityWeaponId)
    : null;
  if (firstPersonContact !== null) {
    group.add(firstPersonContact.root);
  }
  group.userData.firstPersonContactMode =
    firstPersonContact?.root.userData.contactMode ?? 'none';
  group.userData.firstPersonHandCount = firstPersonContact?.handCount ?? 0;
  group.userData.firstPersonAimEnabled = spec.firstPerson.aim.enabled;
  group.userData.firstPersonAimFieldOfViewDegrees =
    spec.firstPerson.aim.fieldOfViewDegrees;
  group.userData.firstPersonAimPresentation = transition.aimPresentation;
  group.userData.worldMountProfile = authorityWeaponId;

  const firstPersonPose: KyxFirstPersonWeaponPose = {
    baseScale: spec.firstPerson.scale,
    aimEnabled: spec.firstPerson.aim.enabled,
    aimOffset: new THREE.Vector3(...spec.firstPerson.aim.offset),
    aimRotation: new THREE.Euler(...spec.firstPerson.aim.rotation),
    aimFieldOfViewDegrees: spec.firstPerson.aim.fieldOfViewDegrees,
    aimScaleMultiplier: spec.firstPerson.aim.scaleMultiplier,
    aimPresentation: transition.aimPresentation,
    aimDatumNodeName: aimDatum?.name ?? null,
    recoilOffset: new THREE.Vector3(...spec.firstPerson.recoil.offset),
    recoilRotation: new THREE.Euler(...spec.firstPerson.recoil.rotation),
    recoilRecoveryHalfLifeSeconds:
      transition.recoilRecoveryHalfLifeSeconds,
    reloadDurationMilliseconds:
      spec.firstPerson.reload.durationMilliseconds,
    reloadOffset: new THREE.Vector3(...spec.firstPerson.reload.offset),
    reloadRotation: new THREE.Euler(...spec.firstPerson.reload.rotation),
    equipOffset: new THREE.Vector3(...transition.equipOffset),
    equipRotation: new THREE.Euler(...transition.equipRotation),
    sprintOffset: new THREE.Vector3(...transition.sprintOffset),
    sprintRotation: new THREE.Euler(...transition.sprintRotation),
  };

  group.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    mesh.castShadow = presentation === 'world';
    mesh.receiveShadow = presentation === 'world';
    mesh.frustumCulled = false;
    mesh.userData.presentationOnly = true;
    mesh.userData.noHit = true;
    if (presentation === 'first_person') mesh.renderOrder = 40;
  });

  if (presentation === 'first_person') {
    group.scale.setScalar(spec.firstPerson.scale);
    group.position.set(
      spec.firstPerson.position[0],
      spec.firstPerson.position[1],
      spec.firstPerson.position[2],
    );
    group.rotation.set(
      spec.firstPerson.rotation[0],
      spec.firstPerson.rotation[1],
      spec.firstPerson.rotation[2],
    );
  } else {
    built.visual.scale.setScalar(worldMount.scale);
    built.visual.position.set(
      worldMount.position[0],
      worldMount.position[1],
      worldMount.position[2],
    );
    built.visual.rotation.set(
      worldMount.rotation[0],
      worldMount.rotation[1],
      worldMount.rotation[2],
    );
  }

  return {
    authorityWeaponId,
    definitionId: DEFINITION_BY_AUTHORITY_ID[authorityWeaponId],
    family: spec.family,
    silhouette: spec.silhouette,
    label: spec.label,
    accent: spec.accent,
    tracer: spec.tracer,
    presentation,
    group,
    muzzle: built.muzzle,
    aimDatum,
    backblast: built.backblast ?? null,
    firstPersonContactRig: firstPersonContact?.root ?? null,
    firstPersonHandCount: firstPersonContact?.handCount ?? 0,
    firstPersonPose,
    movingParts: built.movingParts,
    fireImpulse: 0,
    aimRequested: false,
    aimMix: 0,
    reloadMix: 0,
    reloadPoseMix: 0,
    reloadProgress: 0,
    reloadStartedAtMilliseconds: null,
    equipMix: 0,
    sprintMix: 0,
    phase: 'ready',
  };
}

export function triggerKyxWeaponFire(
  weapon: KyxWeaponPresentationModel,
): void {
  weapon.fireImpulse = 1;
}

export function triggerKyxWeaponEquip(
  weapon: KyxWeaponPresentationModel,
): void {
  if (weapon.presentation !== 'first_person') return;
  weapon.equipMix = 1;
  weapon.aimMix = 0;
}

export function setKyxWeaponAim(
  weapon: KyxWeaponPresentationModel,
  aiming: boolean,
): void {
  weapon.aimRequested = (
    weapon.presentation === 'first_person'
    && weapon.firstPersonPose.aimEnabled
    && aiming
  );
}

export function setKyxWeaponPhase(
  weapon: KyxWeaponPresentationModel,
  phase: KyxWeaponPhase,
  nowMilliseconds: number,
): void {
  if (weapon.phase === phase) return;
  if (phase === 'reloading') {
    weapon.reloadStartedAtMilliseconds = nowMilliseconds;
  } else if (weapon.phase === 'reloading') {
    weapon.reloadStartedAtMilliseconds = null;
  }
  weapon.phase = phase;
}

function resetMovingPart(part: MovingPart | undefined): void {
  if (part === undefined) return;
  part.object.position.copy(part.restPosition);
  part.object.rotation.copy(part.restRotation);
}

export function updateKyxWeaponPresentation(
  weapon: KyxWeaponPresentationModel,
  nowMilliseconds: number,
  deltaSeconds: number,
): void {
  const decay = Math.pow(
    0.5,
    Math.max(0, deltaSeconds)
      / weapon.firstPersonPose.recoilRecoveryHalfLifeSeconds,
  );
  weapon.fireImpulse *= decay;
  const aimAllowed = weapon.presentation === 'first_person'
    && weapon.firstPersonPose.aimEnabled
    && weapon.phase !== 'holstered'
    && weapon.phase !== 'equipping'
    && weapon.phase !== 'reloading'
    && weapon.phase !== 'sprinting'
    && weapon.phase !== 'dead';
  const aimTarget = weapon.aimRequested && aimAllowed ? 1 : 0;
  weapon.aimMix += (
    aimTarget - weapon.aimMix
  ) * Math.min(1, deltaSeconds * (aimTarget > weapon.aimMix ? 13 : 18));
  const reloadTarget = weapon.phase === 'reloading' ? 1 : 0;
  weapon.reloadMix += (
    reloadTarget - weapon.reloadMix
  ) * Math.min(1, deltaSeconds * (reloadTarget > weapon.reloadMix ? 8 : 13));
  weapon.reloadProgress = weapon.reloadStartedAtMilliseconds === null
    ? 0
    : Math.min(
        1,
        Math.max(
          0,
          (nowMilliseconds - weapon.reloadStartedAtMilliseconds)
            / weapon.firstPersonPose.reloadDurationMilliseconds,
        ),
      );
  weapon.reloadPoseMix = weapon.reloadMix
    * Math.sin(weapon.reloadProgress * Math.PI);
  weapon.equipMix *= Math.pow(0.0012, Math.max(0, deltaSeconds));
  const sprintTarget = weapon.phase === 'sprinting' ? 1 : 0;
  weapon.sprintMix += (
    sprintTarget - weapon.sprintMix
  ) * Math.min(
    1,
    deltaSeconds * (sprintTarget > weapon.sprintMix ? 8 : 12),
  );

  const action = weapon.movingParts.action;
  const magazine = weapon.movingParts.magazine;
  const auxiliary = weapon.movingParts.auxiliary;
  const blade = weapon.movingParts.blade;
  resetMovingPart(action);
  resetMovingPart(magazine);
  resetMovingPart(auxiliary);
  resetMovingPart(blade);

  const fire = weapon.fireImpulse;
  const reload = weapon.reloadMix;
  const reloadLift = weapon.reloadPoseMix;

  switch (weapon.family) {
    case 'rifle':
      if (action !== undefined) action.object.position.z += fire * 0.105;
      if (magazine !== undefined) {
        magazine.object.position.y -= reload * 0.04 + reloadLift * 0.22;
        magazine.object.rotation.z += reloadLift * 0.24;
      }
      break;
    case 'pistol':
      if (action !== undefined) action.object.position.z += fire * 0.115;
      if (auxiliary !== undefined) auxiliary.object.rotation.z += fire * 0.42;
      if (magazine !== undefined) {
        magazine.object.position.y -= reload * 0.035 + reloadLift * 0.2;
        magazine.object.rotation.z -= reloadLift * 0.2;
      }
      break;
    case 'shotgun':
      if (action !== undefined) action.object.position.z += fire * 0.19;
      if (magazine !== undefined) {
        magazine.object.rotation.z += reloadLift * Math.PI * 0.75;
        magazine.object.position.y -= reloadLift * 0.07;
      }
      break;
    case 'sniper':
      if (action !== undefined) {
        action.object.position.z += fire * 0.14;
        action.object.rotation.z += fire * 0.52;
      }
      if (magazine !== undefined) {
        magazine.object.position.y -= reload * 0.045 + reloadLift * 0.25;
        magazine.object.rotation.x += reloadLift * 0.2;
      }
      break;
    case 'rocket':
      if (magazine !== undefined) {
        magazine.object.rotation.z += reloadLift * Math.PI * 0.64;
        magazine.object.position.z += reloadLift * 0.08;
      }
      if (auxiliary !== undefined) auxiliary.object.rotation.y += fire * 0.08;
      break;
    case 'melee':
      if (blade !== undefined) {
        const hum = Math.sin(nowMilliseconds * 0.006) * 0.012;
        blade.object.scale.set(1 + hum, 1 + hum, 1 + fire * 0.03);
      }
      break;
  }
}
