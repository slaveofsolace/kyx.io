import * as THREE from 'three';

export const KYX_AUTHORITY_WEAPON_PRESENTATION = Object.freeze({
  vertical_rifle_v1: Object.freeze({
    family: 'rifle',
    silhouette: 'standard_longarm',
    label: 'VLR-7 LINE RIFLE',
    accent: 0x55dcff,
    tracer: 0x9cecff,
    firstPerson: Object.freeze({
      scale: 0.82,
      position: Object.freeze([0.29, -0.285, -0.46] as const),
      rotation: Object.freeze([-0.045, 0.035, 0] as const),
    }),
  }),
  kyx_sidearm_v1: Object.freeze({
    family: 'pistol',
    silhouette: 'compact_sidearm',
    label: 'K-9 ARC SIDEARM',
    accent: 0xffca5c,
    tracer: 0xffe7a0,
    firstPerson: Object.freeze({
      scale: 1.04,
      position: Object.freeze([0.37, -0.335, -0.34] as const),
      rotation: Object.freeze([-0.025, -0.025, -0.045] as const),
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
      position: Object.freeze([0.285, -0.315, -0.46] as const),
      rotation: Object.freeze([-0.065, 0.045, 0.012] as const),
    }),
  }),
  kyx_longshot_v1: Object.freeze({
    family: 'sniper',
    silhouette: 'long_optic',
    label: 'LONGBOW-12',
    accent: 0xd5f4ff,
    tracer: 0xeafaff,
    firstPerson: Object.freeze({
      scale: 0.7,
      position: Object.freeze([0.255, -0.29, -0.53] as const),
      rotation: Object.freeze([-0.028, 0.018, -0.008] as const),
    }),
  }),
  kyx_breach_rocket_v1: Object.freeze({
    family: 'rocket',
    silhouette: 'heavy_tube',
    label: 'BR-6 SIEGE TUBE',
    accent: 0xff6042,
    tracer: 0xffa066,
    firstPerson: Object.freeze({
      scale: 0.68,
      position: Object.freeze([0.36, -0.36, -0.51] as const),
      rotation: Object.freeze([-0.035, -0.025, 0.035] as const),
    }),
  }),
  kyx_edge_v1: Object.freeze({
    family: 'melee',
    silhouette: 'energy_blade',
    label: 'EDGE-1 PHASE SABER',
    accent: 0x58f4ff,
    tracer: 0xb6fbff,
    firstPerson: Object.freeze({
      scale: 0.96,
      position: Object.freeze([0.41, -0.42, -0.32] as const),
      rotation: Object.freeze([-0.2, -0.18, -0.16] as const),
    }),
  }),
} as const);

export type KyxAuthorityWeaponId =
  keyof typeof KYX_AUTHORITY_WEAPON_PRESENTATION;

export type KyxWeaponFamily =
  typeof KYX_AUTHORITY_WEAPON_PRESENTATION[KyxAuthorityWeaponId]['family'];

export type KyxWeaponSilhouette =
  typeof KYX_AUTHORITY_WEAPON_PRESENTATION[KyxAuthorityWeaponId]['silhouette'];

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
  readonly backblast: THREE.Object3D | null;
  readonly movingParts: WeaponMovingParts;
  fireImpulse: number;
  reloadMix: number;
  reloadStartedAtMilliseconds: number | null;
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
      color: 0x0b1115,
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

function buildLineRifle(materials: MaterialSet): BuiltWeapon {
  const visual = new THREE.Group();
  visual.name = 'KYX_VLR7_LINE_RIFLE_VISUAL';

  visual.add(
    box(0.12, 0.13, 0.36, materials.armor, [0, 0.045, 0.04]),
    box(0.1, 0.065, 0.42, materials.dark, [0, 0.14, -0.02]),
    box(0.105, 0.11, 0.34, materials.dark, [0, 0.075, -0.34]),
    box(0.07, 0.028, 0.68, materials.metal, [0, 0.19, -0.14]),
    box(0.1, 0.105, 0.2, materials.armor, [0, 0.045, 0.31], [0.08, 0, 0]),
    box(0.075, 0.14, 0.12, materials.rubber, [0, 0.025, 0.44]),
  );
  finPair(visual, materials.armor, -0.31, 0.072, 0.1, 0.24);
  ventBank(visual, materials.accent, -0.22, 4, 0.078, -0.059, 0.105);
  ventBank(visual, materials.accent, -0.22, 4, 0.078, 0.059, 0.105);

  visual.add(
    cylinderZ(0.021, 0.021, 0.29, materials.metal, [0, 0.105, -0.64]),
    cylinderZ(0.04, 0.045, 0.075, materials.dark, [0, 0.105, -0.8]),
    torusZ(0.031, 0.008, materials.accent, [0, 0.105, -0.84]),
  );
  for (const [width, height] of [[0.076, 0.026], [0.026, 0.076]] as const) {
    visual.add(box(
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
  visual.add(action);

  const grip = new THREE.Group();
  grip.position.set(0, -0.06, 0.19);
  grip.rotation.x = 0.26;
  grip.add(
    box(0.075, 0.17, 0.075, materials.rubber, [0, -0.055, 0]),
    box(0.083, 0.025, 0.082, materials.metal, [0, -0.14, 0]),
  );
  visual.add(grip);

  const optic = new THREE.Group();
  optic.name = 'KYX_VLR7_REFLEX_OPTIC';
  optic.position.set(0, 0.235, 0.01);
  optic.add(
    box(0.072, 0.055, 0.085, materials.dark, [0, 0, 0]),
    box(0.05, 0.037, 0.012, materials.lens, [0, 0.008, -0.048]),
  );
  visual.add(optic);

  return {
    visual,
    muzzle: marker(visual, 'KYX_VLR7_MUZZLE', [0, 0.105, -0.89]),
    movingParts: {
      action: movingPart(action),
      magazine: movingPart(magazine),
    },
  };
}

function buildArcSidearm(materials: MaterialSet): BuiltWeapon {
  const visual = new THREE.Group();
  visual.name = 'KYX_K9_ARC_SIDEARM_VISUAL';

  const slide = new THREE.Group();
  slide.name = 'KYX_K9_RECIPROCATING_SLIDE';
  slide.position.set(0, 0.12, -0.07);
  slide.add(
    box(0.105, 0.09, 0.33, materials.dark, [0, 0, 0]),
    box(0.07, 0.018, 0.37, materials.metal, [0, 0.054, -0.01]),
    box(0.055, 0.025, 0.12, materials.armor, [0, -0.054, -0.1]),
  );
  ventBank(slide, materials.accent, -0.1, 3, 0.052, -0.056, 0.01);
  ventBank(slide, materials.accent, -0.1, 3, 0.052, 0.056, 0.01);
  visual.add(slide);

  visual.add(
    box(0.095, 0.085, 0.24, materials.armor, [0, 0.045, -0.01]),
    cylinderZ(0.026, 0.026, 0.2, materials.metal, [0, 0.12, -0.23]),
    torusZ(0.042, 0.01, materials.accent, [0, 0.12, -0.335]),
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
      materials.accent,
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
    box(0.035, 0.14, 0.03, materials.accent, [0, -0.055, 0.055]),
    box(0.095, 0.028, 0.1, materials.metal, [0, -0.18, 0]),
  );
  visual.add(magazine);

  visual.add(
    box(0.04, 0.03, 0.028, materials.metal, [0, 0.19, -0.21]),
    box(0.06, 0.035, 0.035, materials.dark, [0, 0.19, 0.07]),
  );

  return {
    visual,
    muzzle: marker(visual, 'KYX_K9_MUZZLE', [0, 0.12, -0.385]),
    movingParts: {
      action: movingPart(slide),
      magazine: movingPart(magazine),
      auxiliary: movingPart(chamber),
    },
  };
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

  const drum = new THREE.Group();
  drum.name = 'KYX_SG4_QUAD_CELL_DRUM';
  drum.position.set(0, -0.08, 0.03);
  drum.add(
    cylinderZ(0.09, 0.09, 0.13, materials.dark, [0, 0, 0], 12),
    torusZ(0.07, 0.012, materials.accent, [0, 0, -0.07]),
    torusZ(0.07, 0.012, materials.metal, [0, 0, 0.07]),
  );
  visual.add(drum);

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
      magazine: movingPart(drum),
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

  const magazine = new THREE.Group();
  magazine.name = 'KYX_LONGBOW12_MAGAZINE';
  magazine.position.set(0, -0.08, 0.02);
  magazine.add(
    box(0.075, 0.23, 0.1, materials.dark, [0, -0.07, 0]),
    box(0.025, 0.165, 0.035, materials.accent, [0, -0.06, 0.06]),
  );
  visual.add(magazine);

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
      magazine: movingPart(magazine),
    },
  };
}

function buildSiegeLauncher(materials: MaterialSet): BuiltWeapon {
  const visual = new THREE.Group();
  visual.name = 'KYX_BR6_SIEGE_TUBE_VISUAL';

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
      box(0.012, 0.1, 0.46, materials.accent, [
        side * 0.15,
        0.11,
        -0.08,
      ]),
    );
  }

  visual.add(
    cylinderZ(0.155, 0.13, 0.16, materials.dark, [0, 0.11, -0.58], 12),
    torusZ(0.14, 0.02, materials.accent, [0, 0.11, -0.67], 8),
    cylinderZ(0.17, 0.14, 0.18, materials.metal, [0, 0.11, 0.46], 12),
    torusZ(0.155, 0.018, materials.accent, [0, 0.11, 0.56], 8),
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
    torusZ(0.115, 0.016, materials.accent, [0, 0, -0.12], 8),
  );
  visual.add(chamber);

  const grip = new THREE.Group();
  grip.position.set(0, -0.01, 0.14);
  grip.rotation.x = 0.22;
  grip.add(
    box(0.095, 0.21, 0.1, materials.rubber, [0, -0.08, 0]),
    box(0.12, 0.035, 0.12, materials.metal, [0, -0.19, 0]),
  );
  visual.add(grip);

  const sight = new THREE.Group();
  sight.position.set(0, 0.27, -0.18);
  sight.add(
    box(0.1, 0.07, 0.2, materials.dark, [0, 0, 0]),
    box(0.065, 0.045, 0.012, materials.lens, [0, 0.005, -0.108]),
  );
  visual.add(sight);

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
    box(0.075, 0.025, 0.76, materials.lens, [0, 0, -0.36]),
    box(0.025, 0.052, 0.72, materials.accent, [0, 0, -0.34]),
    box(0.11, 0.035, 0.11, materials.metal, [0, 0, -0.02]),
  );
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.055, 0.18, 4),
    materials.lens,
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
): BuiltWeapon {
  switch (weaponId) {
    case 'vertical_rifle_v1':
      return buildLineRifle(materials);
    case 'kyx_sidearm_v1':
      return buildArcSidearm(materials);
    case 'kyx_scattergun_v1':
      return buildBreachScattergun(materials);
    case 'kyx_longshot_v1':
      return buildLongbowSniper(materials);
    case 'kyx_breach_rocket_v1':
      return buildSiegeLauncher(materials);
    case 'kyx_edge_v1':
      return buildPhaseSaber(materials);
  }
}

export function normalizeKyxAuthorityWeaponId(
  value: string | null | undefined,
): KyxAuthorityWeaponId {
  return value !== undefined
    && value !== null
    && Object.prototype.hasOwnProperty.call(
      KYX_AUTHORITY_WEAPON_PRESENTATION,
      value,
    )
    ? value as KyxAuthorityWeaponId
    : 'vertical_rifle_v1';
}

export function createKyxWeaponPresentationModel(
  requestedWeaponId: string | null | undefined,
  presentation: 'first_person' | 'world',
): KyxWeaponPresentationModel {
  const authorityWeaponId = normalizeKyxAuthorityWeaponId(requestedWeaponId);
  const spec = KYX_AUTHORITY_WEAPON_PRESENTATION[authorityWeaponId];
  const materials = standardMaterials(
    spec.accent,
    authorityWeaponId === 'kyx_sidearm_v1'
      ? 0x303941
      : authorityWeaponId === 'kyx_longshot_v1'
        ? 0x33434b
        : authorityWeaponId === 'kyx_breach_rocket_v1'
          ? 0x3a302e
          : 0x26343a,
  );
  const built = buildByWeaponId(authorityWeaponId, materials);
  const group = new THREE.Group();
  group.name = `ONLINE_${presentation.toUpperCase()}_${authorityWeaponId}`;
  group.userData.projectAuthoredPresentation = true;
  group.userData.authorityWeaponId = authorityWeaponId;
  group.userData.weaponFamily = spec.family;
  group.userData.weaponSilhouette = spec.silhouette;
  group.userData.muzzleNodeName = built.muzzle.name;
  group.add(built.visual);

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
    backblast: built.backblast ?? null,
    movingParts: built.movingParts,
    fireImpulse: 0,
    reloadMix: 0,
    reloadStartedAtMilliseconds: null,
    phase: 'ready',
  };
}

export function triggerKyxWeaponFire(
  weapon: KyxWeaponPresentationModel,
): void {
  weapon.fireImpulse = 1;
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
  const decay = Math.pow(0.00045, Math.max(0, deltaSeconds));
  weapon.fireImpulse *= decay;
  const reloadTarget = weapon.phase === 'reloading' ? 1 : 0;
  weapon.reloadMix += (
    reloadTarget - weapon.reloadMix
  ) * Math.min(1, deltaSeconds * (reloadTarget > weapon.reloadMix ? 8 : 13));

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
  const reloadCycle = weapon.reloadStartedAtMilliseconds === null
    ? 0
    : Math.max(0, (nowMilliseconds - weapon.reloadStartedAtMilliseconds) / 820);
  const reloadLift = Math.sin(Math.min(1, reloadCycle) * Math.PI);

  switch (weapon.family) {
    case 'rifle':
      if (action !== undefined) action.object.position.z += fire * 0.105;
      if (magazine !== undefined) {
        magazine.object.position.y -= reload * (0.18 + reloadLift * 0.08);
        magazine.object.rotation.z += reload * 0.16;
      }
      break;
    case 'pistol':
      if (action !== undefined) action.object.position.z += fire * 0.115;
      if (auxiliary !== undefined) auxiliary.object.rotation.z += fire * 0.42;
      if (magazine !== undefined) {
        magazine.object.position.y -= reload * (0.2 + reloadLift * 0.06);
        magazine.object.rotation.z -= reload * 0.14;
      }
      break;
    case 'shotgun':
      if (action !== undefined) action.object.position.z += fire * 0.19;
      if (magazine !== undefined) {
        magazine.object.rotation.z += reload * Math.PI * 0.75;
        magazine.object.position.y -= reloadLift * 0.04;
      }
      break;
    case 'sniper':
      if (action !== undefined) {
        action.object.position.z += fire * 0.14;
        action.object.rotation.z += fire * 0.52;
      }
      if (magazine !== undefined) {
        magazine.object.position.y -= reload * (0.23 + reloadLift * 0.08);
        magazine.object.rotation.x += reload * 0.18;
      }
      break;
    case 'rocket':
      if (magazine !== undefined) {
        magazine.object.rotation.z += reload * Math.PI * 0.64;
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
