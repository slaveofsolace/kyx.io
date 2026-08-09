import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export interface KyxFirstPersonContactRig {
  readonly root: THREE.Group;
  readonly handCount: number;
  readonly dominantGrip: THREE.Object3D;
  readonly supportGrip: THREE.Object3D;
}

const Y_AXIS = new THREE.Vector3(0, 1, 0);

function capsuleBetween(
  name: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const direction = end.clone().sub(start);
  const distance = direction.length();
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(
      radius,
      Math.max(0.01, distance - radius * 2),
      8,
      18,
    ),
    material,
  );
  mesh.name = name;
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
  return mesh;
}

function taperedLimbBetween(
  name: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
  startRadius: number,
  endRadius: number,
  material: THREE.Material,
): THREE.Mesh {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(
      endRadius,
      startRadius,
      direction.length(),
      20,
      4,
      false,
    ),
    material,
  );
  mesh.name = name;
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
  return mesh;
}

function profiledForearmBetween(
  name: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
  startHalfWidth: number,
  startHalfDepth: number,
  endHalfWidth: number,
  endHalfDepth: number,
  material: THREE.Material,
): THREE.Mesh {
  const direction = end.clone().sub(start);
  const radialSegments = 10;
  const stations = [0, 0.18, 0.5, 0.82, 1] as const;
  const profile = [1, 1.025, 0.985, 0.95, 1] as const;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const [stationIndex, alpha] of stations.entries()) {
    const halfWidth = THREE.MathUtils.lerp(
      startHalfWidth,
      endHalfWidth,
      alpha,
    ) * profile[stationIndex];
    const halfDepth = THREE.MathUtils.lerp(
      startHalfDepth,
      endHalfDepth,
      alpha,
    ) * profile[stationIndex];
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const angle = radial / radialSegments * Math.PI * 2;
      positions.push(
        Math.cos(angle) * halfWidth,
        direction.length() * (alpha - 0.5),
        Math.sin(angle) * halfDepth,
      );
    }
  }
  for (let station = 0; station < stations.length - 1; station += 1) {
    for (let radial = 0; radial < radialSegments; radial += 1) {
      const next = (radial + 1) % radialSegments;
      const lower = station * radialSegments;
      const upper = (station + 1) * radialSegments;
      indices.push(
        lower + radial,
        upper + radial,
        upper + next,
        lower + radial,
        upper + next,
        lower + next,
      );
    }
  }
  const startCenter = positions.length / 3;
  positions.push(0, -direction.length() * 0.5, 0);
  const endCenter = positions.length / 3;
  positions.push(0, direction.length() * 0.5, 0);
  const lastRing = (stations.length - 1) * radialSegments;
  for (let radial = 0; radial < radialSegments; radial += 1) {
    const next = (radial + 1) % radialSegments;
    indices.push(startCenter, next, radial);
    indices.push(endCenter, lastRing + radial, lastRing + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
  return mesh;
}

function roundedBlockBetween(
  name: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
  width: number,
  depth: number,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(width, direction.length(), depth, 3, radius),
    material,
  );
  mesh.name = name;
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
  return mesh;
}

function pointBetween(
  start: THREE.Vector3,
  end: THREE.Vector3,
  alpha: number,
): THREE.Vector3 {
  return start.clone().lerp(end, alpha);
}

function plateBetween(
  name: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
  width: number,
  depth: number,
  material: THREE.Material,
): THREE.Mesh {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, direction.length(), depth),
    material,
  );
  mesh.name = name;
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
  return mesh;
}

function gripMarker(
  name: string,
  position: readonly [number, number, number],
): THREE.Object3D {
  const marker = new THREE.Object3D();
  marker.name = name;
  marker.position.set(...position);
  return marker;
}

function addWrappedFingers(
  hand: THREE.Group,
  prefix: string,
  center: readonly [number, number, number],
  material: THREE.Material,
): void {
  for (const [index, x] of [-0.032, -0.011, 0.011, 0.032].entries()) {
    const proximal = new THREE.Vector3(
      center[0] + x,
      center[1] + 0.031,
      center[2] + 0.008,
    );
    const joint = new THREE.Vector3(
      center[0] + x,
      center[1] - 0.003,
      center[2] - 0.012,
    );
    const distal = new THREE.Vector3(
      center[0] + x,
      center[1] - 0.032,
      center[2] + 0.008,
    );
    hand.add(
      capsuleBetween(
        `${prefix}_FINGER_${index + 1}_PROXIMAL`,
        proximal,
        joint,
        0.0082,
        material,
      ),
      capsuleBetween(
        `${prefix}_FINGER_${index + 1}_DISTAL`,
        joint,
        distal,
        0.0075,
        material,
      ),
    );
  }
  const thumbSide = prefix.includes('DOMINANT') ? -1 : 1;
  hand.add(
    capsuleBetween(
      `${prefix}_THUMB_PROXIMAL`,
      new THREE.Vector3(
        center[0] + thumbSide * 0.043,
        center[1] + 0.019,
        center[2] + 0.016,
      ),
      new THREE.Vector3(
        center[0] + thumbSide * 0.025,
        center[1] - 0.009,
        center[2] + 0.034,
      ),
      0.009,
      material,
    ),
  );
}

function buildVlr7ContactRig(): KyxFirstPersonContactRig {
  const suit = new THREE.MeshStandardMaterial({
    name: 'KYX_FP_SYNTH_SLEEVE',
    color: 0x111820,
    metalness: 0.12,
    roughness: 0.58,
  });
  const plate = new THREE.MeshStandardMaterial({
    name: 'KYX_FP_FOREARM_PLATE',
    color: 0x1f3038,
    metalness: 0.45,
    roughness: 0.48,
  });
  const glove = new THREE.MeshStandardMaterial({
    name: 'KYX_FP_TACTICAL_GLOVE',
    color: 0x10161c,
    metalness: 0.05,
    roughness: 0.66,
  });
  const seam = new THREE.MeshStandardMaterial({
    name: 'KYX_FP_GLOVE_SEAM',
    color: 0x173f46,
    metalness: 0.28,
    roughness: 0.5,
  });
  const root = new THREE.Group();
  root.name = 'KYX_VLR7_FIRST_PERSON_CONTACT_RIG';
  root.userData.presentationOnly = true;
  root.userData.noHit = true;
  root.userData.contactMode = 'profiled_two_hand_assault_suit_v9';

  const dominantShoulder = new THREE.Vector3(0.58, -1.04, 0.78);
  const dominantElbow = new THREE.Vector3(0.32, -0.74, 0.43);
  const dominantWrist = new THREE.Vector3(0.15, -0.255, 0.26);
  const dominantPalm = new THREE.Vector3(0.065, -0.115, 0.2);
  const dominantGauntletStart = pointBetween(
    dominantElbow,
    dominantWrist,
    0.62,
  );
  const dominantGauntletEnd = pointBetween(
    dominantElbow,
    dominantWrist,
    0.96,
  );
  const dominantElbowBridgeStart = pointBetween(
    dominantElbow,
    dominantShoulder,
    0.12,
  );
  const dominantElbowBridgeEnd = pointBetween(
    dominantElbow,
    dominantWrist,
    0.14,
  );
  const dominantWristSealStart = pointBetween(
    dominantWrist,
    dominantElbow,
    0.12,
  );
  const dominantWristSealEnd = pointBetween(
    dominantWrist,
    dominantPalm,
    0.18,
  );
  root.add(
    taperedLimbBetween(
      'KYX_VLR7_DOMINANT_SLEEVE_UPPER',
      dominantShoulder,
      dominantElbow,
      0.075,
      0.062,
      suit,
    ),
    profiledForearmBetween(
      'KYX_VLR7_DOMINANT_SLEEVE_LOWER',
      dominantElbow,
      dominantWrist,
      0.052,
      0.039,
      0.041,
      0.032,
      suit,
    ),
    taperedLimbBetween(
      'KYX_VLR7_DOMINANT_ELBOW_BRIDGE',
      dominantElbowBridgeStart,
      dominantElbowBridgeEnd,
      0.06,
      0.057,
      suit,
    ),
    profiledForearmBetween(
      'KYX_VLR7_DOMINANT_GAUNTLET_CORE',
      dominantGauntletStart,
      dominantGauntletEnd,
      0.049,
      0.038,
      0.041,
      0.032,
      plate,
    ),
    plateBetween(
      'KYX_VLR7_DOMINANT_GAUNTLET_DORSAL_PLATE',
      dominantGauntletStart.clone().add(new THREE.Vector3(0.006, 0, 0.041)),
      dominantGauntletEnd.clone().add(new THREE.Vector3(0.003, 0, 0.036)),
      0.069,
      0.011,
      plate,
    ),
    taperedLimbBetween(
      'KYX_VLR7_DOMINANT_WRIST_SEAL',
      dominantWristSealStart,
      dominantWristSealEnd,
      0.045,
      0.04,
      seam,
    ),
    taperedLimbBetween(
      'KYX_VLR7_DOMINANT_WRIST',
      dominantWrist,
      dominantPalm,
      0.04,
      0.036,
      glove,
    ),
  );

  const dominantHand = new THREE.Group();
  dominantHand.name = 'KYX_VLR7_DOMINANT_HAND';
  dominantHand.add(
    roundedBlockBetween(
      'KYX_VLR7_DOMINANT_PALM',
      new THREE.Vector3(0.094, -0.154, 0.226),
      new THREE.Vector3(0.052, -0.078, 0.188),
      0.075,
      0.048,
      0.012,
      glove,
    ),
    plateBetween(
      'KYX_VLR7_DOMINANT_GLOVE_BACKPLATE',
      new THREE.Vector3(0.02, -0.072, 0.234),
      new THREE.Vector3(0.11, -0.072, 0.234),
      0.037,
      0.011,
      plate,
    ),
  );
  addWrappedFingers(
    dominantHand,
    'KYX_VLR7_DOMINANT',
    [0.065, -0.115, 0.2],
    glove,
  );
  root.add(dominantHand);

  const supportShoulder = new THREE.Vector3(-0.58, -1.04, 0.72);
  const supportElbow = new THREE.Vector3(-0.32, -0.75, 0.04);
  const supportWrist = new THREE.Vector3(-0.15, -0.245, -0.19);
  const supportPalm = new THREE.Vector3(-0.075, -0.1, -0.31);
  const supportGauntletStart = pointBetween(
    supportElbow,
    supportWrist,
    0.62,
  );
  const supportGauntletEnd = pointBetween(
    supportElbow,
    supportWrist,
    0.96,
  );
  const supportElbowBridgeStart = pointBetween(
    supportElbow,
    supportShoulder,
    0.12,
  );
  const supportElbowBridgeEnd = pointBetween(
    supportElbow,
    supportWrist,
    0.14,
  );
  const supportWristSealStart = pointBetween(
    supportWrist,
    supportElbow,
    0.12,
  );
  const supportWristSealEnd = pointBetween(
    supportWrist,
    supportPalm,
    0.18,
  );
  root.add(
    taperedLimbBetween(
      'KYX_VLR7_SUPPORT_SLEEVE_UPPER',
      supportShoulder,
      supportElbow,
      0.075,
      0.062,
      suit,
    ),
    profiledForearmBetween(
      'KYX_VLR7_SUPPORT_SLEEVE_LOWER',
      supportElbow,
      supportWrist,
      0.052,
      0.039,
      0.041,
      0.032,
      suit,
    ),
    taperedLimbBetween(
      'KYX_VLR7_SUPPORT_ELBOW_BRIDGE',
      supportElbowBridgeStart,
      supportElbowBridgeEnd,
      0.06,
      0.057,
      suit,
    ),
    profiledForearmBetween(
      'KYX_VLR7_SUPPORT_GAUNTLET_CORE',
      supportGauntletStart,
      supportGauntletEnd,
      0.049,
      0.038,
      0.041,
      0.032,
      plate,
    ),
    plateBetween(
      'KYX_VLR7_SUPPORT_GAUNTLET_DORSAL_PLATE',
      supportGauntletStart.clone().add(new THREE.Vector3(-0.006, 0, 0.041)),
      supportGauntletEnd.clone().add(new THREE.Vector3(-0.003, 0, 0.036)),
      0.069,
      0.011,
      plate,
    ),
    taperedLimbBetween(
      'KYX_VLR7_SUPPORT_WRIST_SEAL',
      supportWristSealStart,
      supportWristSealEnd,
      0.045,
      0.04,
      seam,
    ),
    taperedLimbBetween(
      'KYX_VLR7_SUPPORT_WRIST',
      supportWrist,
      supportPalm,
      0.04,
      0.036,
      glove,
    ),
  );

  const supportHand = new THREE.Group();
  supportHand.name = 'KYX_VLR7_SUPPORT_HAND';
  supportHand.add(
    roundedBlockBetween(
      'KYX_VLR7_SUPPORT_PALM',
      new THREE.Vector3(-0.112, -0.128, -0.264),
      new THREE.Vector3(-0.052, -0.064, -0.336),
      0.075,
      0.048,
      0.012,
      glove,
    ),
    plateBetween(
      'KYX_VLR7_SUPPORT_GLOVE_BACKPLATE',
      new THREE.Vector3(-0.12, -0.055, -0.278),
      new THREE.Vector3(-0.03, -0.055, -0.278),
      0.037,
      0.011,
      plate,
    ),
  );
  addWrappedFingers(
    supportHand,
    'KYX_VLR7_SUPPORT',
    [-0.075, -0.082, -0.325],
    glove,
  );
  root.add(supportHand);

  const dominantGrip = gripMarker(
    'KYX_VLR7_DOMINANT_GRIP_CONTACT',
    [0.065, -0.115, 0.2],
  );
  const supportGrip = gripMarker(
    'KYX_VLR7_SUPPORT_GRIP_CONTACT',
    [-0.075, -0.082, -0.325],
  );
  root.add(dominantGrip, supportGrip);

  root.traverse((object) => {
    object.userData.presentationOnly = true;
    object.userData.noHit = true;
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    // First-person cameras crop at the upper forearm. Rendering the synthetic
    // shoulder-to-elbow spans produces an oversized V across the sight picture;
    // keep the fitted forearms, gauntlets, palms, and fingers while treating the
    // off-camera upper sleeves as intentionally concealed presentation pieces.
    if (
      mesh.name.endsWith('_SLEEVE_UPPER')
      || mesh.name.endsWith('_ELBOW_BRIDGE')
    ) {
      mesh.visible = false;
      mesh.userData.firstPersonCameraCrop = true;
    }
    mesh.frustumCulled = false;
    mesh.renderOrder = 39;
  });

  return Object.freeze({
    root,
    handCount: 2,
    dominantGrip,
    supportGrip,
  });
}

export type KyxFirstPersonContactPoint =
  readonly [number, number, number];

interface CompactContactHandProfile {
  readonly role: 'DOMINANT' | 'SUPPORT';
  readonly entry: KyxFirstPersonContactPoint;
  readonly wrist: KyxFirstPersonContactPoint;
  readonly palm: KyxFirstPersonContactPoint;
  readonly grip: KyxFirstPersonContactPoint;
}

interface CompactContactProfile {
  readonly name: string;
  readonly prefix: string;
  readonly mode: string;
  readonly accent: number;
  readonly dominant: CompactContactHandProfile;
  readonly support?: CompactContactHandProfile;
}

export const KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE = Object.freeze({
  kyx_sidearm_v1: Object.freeze({
    name: 'KYX_K9_FIRST_PERSON_CONTACT_RIG',
    prefix: 'KYX_K9',
    mode: 'fitted_one_hand_sidearm_contact_v2',
    accent: 0xffca5c,
    dominant: Object.freeze({
      role: 'DOMINANT' as const,
      entry: Object.freeze([0.48, -0.94, 0.54] as const),
      wrist: Object.freeze([0.25, -0.34, 0.3] as const),
      palm: Object.freeze([0.1, -0.14, 0.18] as const),
      grip: Object.freeze([0.025, -0.07, 0.13] as const),
    }),
  }),
  kyx_scattergun_v1: Object.freeze({
    name: 'KYX_SG4_FIRST_PERSON_CONTACT_RIG',
    prefix: 'KYX_SG4',
    mode: 'fitted_two_hand_breacher_contact_v3',
    accent: 0xff8c5a,
    dominant: Object.freeze({
      role: 'DOMINANT' as const,
      entry: Object.freeze([0.5, -0.92, 0.6] as const),
      wrist: Object.freeze([0.28, -0.36, 0.34] as const),
      palm: Object.freeze([0.11, -0.13, 0.23] as const),
      grip: Object.freeze([0.03, -0.07, 0.18] as const),
    }),
    support: Object.freeze({
      role: 'SUPPORT' as const,
      entry: Object.freeze([-0.4, -0.91, 0.3] as const),
      wrist: Object.freeze([-0.21, -0.35, -0.15] as const),
      palm: Object.freeze([-0.08, -0.11, -0.36] as const),
      grip: Object.freeze([-0.025, -0.045, -0.42] as const),
    }),
  }),
  kyx_longshot_v1: Object.freeze({
    name: 'KYX_LONGBOW12_FIRST_PERSON_CONTACT_RIG',
    prefix: 'KYX_LONGBOW12',
    mode: 'fitted_two_hand_precision_contact_v3',
    accent: 0xd5f4ff,
    dominant: Object.freeze({
      role: 'DOMINANT' as const,
      entry: Object.freeze([0.53, -0.94, 0.62] as const),
      wrist: Object.freeze([0.29, -0.38, 0.34] as const),
      palm: Object.freeze([0.11, -0.13, 0.21] as const),
      grip: Object.freeze([0.03, -0.06, 0.16] as const),
    }),
    support: Object.freeze({
      role: 'SUPPORT' as const,
      entry: Object.freeze([-0.4, -0.92, 0.2] as const),
      wrist: Object.freeze([-0.22, -0.36, -0.2] as const),
      palm: Object.freeze([-0.075, -0.1, -0.44] as const),
      grip: Object.freeze([-0.025, -0.045, -0.5] as const),
    }),
  }),
  kyx_breach_rocket_v1: Object.freeze({
    name: 'KYX_BR6_FIRST_PERSON_CONTACT_RIG',
    prefix: 'KYX_BR6',
    mode: 'fitted_two_hand_launcher_contact_v3',
    accent: 0xff6042,
    dominant: Object.freeze({
      role: 'DOMINANT' as const,
      entry: Object.freeze([0.56, -0.95, 0.64] as const),
      wrist: Object.freeze([0.3, -0.4, 0.34] as const),
      palm: Object.freeze([0.115, -0.14, 0.21] as const),
      grip: Object.freeze([0.035, -0.07, 0.15] as const),
    }),
    support: Object.freeze({
      role: 'SUPPORT' as const,
      entry: Object.freeze([-0.43, -0.94, 0.23] as const),
      wrist: Object.freeze([-0.24, -0.39, -0.14] as const),
      palm: Object.freeze([-0.085, -0.13, -0.32] as const),
      grip: Object.freeze([-0.03, -0.065, -0.38] as const),
    }),
  }),
  kyx_edge_v1: Object.freeze({
    name: 'KYX_EDGE1_FIRST_PERSON_CONTACT_RIG',
    prefix: 'KYX_EDGE1',
    mode: 'fitted_one_hand_saber_contact_v2',
    accent: 0x58f4ff,
    dominant: Object.freeze({
      role: 'DOMINANT' as const,
      entry: Object.freeze([0.48, -0.96, 0.5] as const),
      wrist: Object.freeze([0.24, -0.38, 0.29] as const),
      palm: Object.freeze([0.08, -0.12, 0.16] as const),
      grip: Object.freeze([0.015, -0.055, 0.1] as const),
    }),
  }),
} satisfies Readonly<Record<string, CompactContactProfile>>);

export interface KyxFirstPersonContactSeam {
  readonly mode: string;
  readonly handCount: 1 | 2;
  readonly dominantGrip: KyxFirstPersonContactPoint;
  readonly supportGrip: KyxFirstPersonContactPoint | null;
  readonly characterBinding: 'unbound_pending_accepted_assault_body';
}

export type KyxFirstPersonContactAuthorityWeaponId =
  | 'vertical_rifle_v1'
  | 'kyx_sidearm_v1'
  | 'kyx_scattergun_v1'
  | 'kyx_longshot_v1'
  | 'kyx_breach_rocket_v1'
  | 'kyx_edge_v1';

export const KYX_FIRST_PERSON_CONTACT_SEAM = Object.freeze({
  vertical_rifle_v1: Object.freeze({
    mode: 'profiled_two_hand_assault_suit_v9',
    handCount: 2,
    dominantGrip: Object.freeze([0.065, -0.115, 0.2] as const),
    supportGrip: Object.freeze([-0.075, -0.082, -0.325] as const),
    characterBinding: 'unbound_pending_accepted_assault_body',
  }),
  kyx_sidearm_v1: Object.freeze({
    mode: KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE.kyx_sidearm_v1.mode,
    handCount: 1,
    dominantGrip:
      KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE.kyx_sidearm_v1.dominant.grip,
    supportGrip: null,
    characterBinding: 'unbound_pending_accepted_assault_body',
  }),
  kyx_scattergun_v1: Object.freeze({
    mode: KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE.kyx_scattergun_v1.mode,
    handCount: 2,
    dominantGrip:
      KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE.kyx_scattergun_v1.dominant.grip,
    supportGrip:
      KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE.kyx_scattergun_v1.support.grip,
    characterBinding: 'unbound_pending_accepted_assault_body',
  }),
  kyx_longshot_v1: Object.freeze({
    mode: KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE.kyx_longshot_v1.mode,
    handCount: 2,
    dominantGrip:
      KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE.kyx_longshot_v1.dominant.grip,
    supportGrip:
      KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE.kyx_longshot_v1.support.grip,
    characterBinding: 'unbound_pending_accepted_assault_body',
  }),
  kyx_breach_rocket_v1: Object.freeze({
    mode: KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE.kyx_breach_rocket_v1.mode,
    handCount: 2,
    dominantGrip:
      KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE.kyx_breach_rocket_v1.dominant.grip,
    supportGrip:
      KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE.kyx_breach_rocket_v1.support.grip,
    characterBinding: 'unbound_pending_accepted_assault_body',
  }),
  kyx_edge_v1: Object.freeze({
    mode: KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE.kyx_edge_v1.mode,
    handCount: 1,
    dominantGrip:
      KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE.kyx_edge_v1.dominant.grip,
    supportGrip: null,
    characterBinding: 'unbound_pending_accepted_assault_body',
  }),
} satisfies Readonly<
  Record<KyxFirstPersonContactAuthorityWeaponId, KyxFirstPersonContactSeam>
>);

function vector(point: KyxFirstPersonContactPoint): THREE.Vector3 {
  return new THREE.Vector3(point[0], point[1], point[2]);
}

function addCompactContactHand(
  root: THREE.Group,
  prefix: string,
  profile: CompactContactHandProfile,
  suit: THREE.Material,
  plate: THREE.Material,
  glove: THREE.Material,
  seam: THREE.Material,
): void {
  const entry = vector(profile.entry);
  const wrist = vector(profile.wrist);
  const palm = vector(profile.palm);
  const grip = vector(profile.grip);
  const name = `${prefix}_${profile.role}`;
  const gauntletStart = pointBetween(entry, wrist, 0.55);
  const gauntletEnd = pointBetween(entry, wrist, 0.92);
  const hand = new THREE.Group();
  hand.name = `${name}_HAND`;
  hand.add(
    roundedBlockBetween(
      `${name}_PALM`,
      palm,
      grip,
      0.074,
      0.05,
      0.012,
      glove,
    ),
    plateBetween(
      `${name}_GLOVE_BACKPLATE`,
      pointBetween(palm, grip, 0.22).add(new THREE.Vector3(0, 0, 0.035)),
      pointBetween(palm, grip, 0.72).add(new THREE.Vector3(0, 0, 0.035)),
      0.038,
      0.01,
      plate,
    ),
  );
  addWrappedFingers(
    hand,
    name,
    [profile.grip[0], profile.grip[1], profile.grip[2]],
    glove,
  );
  root.add(
    profiledForearmBetween(
      `${name}_SLEEVE_LOWER`,
      entry,
      wrist,
      0.054,
      0.041,
      0.041,
      0.032,
      suit,
    ),
    profiledForearmBetween(
      `${name}_GAUNTLET_CORE`,
      gauntletStart,
      gauntletEnd,
      0.05,
      0.039,
      0.041,
      0.032,
      plate,
    ),
    plateBetween(
      `${name}_GAUNTLET_DORSAL_PLATE`,
      gauntletStart.clone().add(new THREE.Vector3(0, 0, 0.041)),
      gauntletEnd.clone().add(new THREE.Vector3(0, 0, 0.036)),
      0.068,
      0.011,
      plate,
    ),
    taperedLimbBetween(
      `${name}_WRIST_SEAL`,
      pointBetween(wrist, entry, 0.14),
      pointBetween(wrist, palm, 0.2),
      0.044,
      0.039,
      seam,
    ),
    taperedLimbBetween(
      `${name}_WRIST`,
      wrist,
      palm,
      0.039,
      0.034,
      glove,
    ),
    hand,
  );
}

function buildCompactContactRig(
  authorityWeaponId: keyof typeof KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE,
): KyxFirstPersonContactRig {
  const profile: CompactContactProfile =
    KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE[authorityWeaponId];
  const suit = new THREE.MeshStandardMaterial({
    name: `${profile.prefix}_FP_SYNTH_SLEEVE`,
    color: 0x111820,
    metalness: 0.12,
    roughness: 0.58,
  });
  const plate = new THREE.MeshStandardMaterial({
    name: `${profile.prefix}_FP_FOREARM_PLATE`,
    color: 0x1f3038,
    metalness: 0.45,
    roughness: 0.48,
  });
  const glove = new THREE.MeshStandardMaterial({
    name: `${profile.prefix}_FP_TACTICAL_GLOVE`,
    color: 0x10161c,
    metalness: 0.05,
    roughness: 0.66,
  });
  const seam = new THREE.MeshStandardMaterial({
    name: `${profile.prefix}_FP_CONTACT_SEAM`,
    color: profile.accent,
    emissive: profile.accent,
    emissiveIntensity: 0.08,
    metalness: 0.3,
    roughness: 0.5,
  });
  const root = new THREE.Group();
  root.name = profile.name;
  root.userData.presentationOnly = true;
  root.userData.noHit = true;
  root.userData.contactMode = profile.mode;
  root.userData.authorityWeaponId = authorityWeaponId;
  root.userData.weaponFittedContact = true;
  addCompactContactHand(
    root,
    profile.prefix,
    profile.dominant,
    suit,
    plate,
    glove,
    seam,
  );
  if (profile.support !== undefined) {
    addCompactContactHand(
      root,
      profile.prefix,
      profile.support,
      suit,
      plate,
      glove,
      seam,
    );
  }

  const dominantGrip = gripMarker(
    `${profile.prefix}_DOMINANT_GRIP_CONTACT`,
    profile.dominant.grip,
  );
  const supportGrip = gripMarker(
    `${profile.prefix}_SUPPORT_GRIP_CONTACT`,
    profile.support?.grip ?? profile.dominant.grip,
  );
  supportGrip.visible = profile.support !== undefined;
  root.add(dominantGrip, supportGrip);
  root.traverse((object) => {
    object.userData.presentationOnly = true;
    object.userData.noHit = true;
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    mesh.frustumCulled = false;
    mesh.renderOrder = 39;
  });
  return Object.freeze({
    root,
    handCount: profile.support === undefined ? 1 : 2,
    dominantGrip,
    supportGrip,
  });
}

export function createKyxFirstPersonContactRig(
  authorityWeaponId: string,
): KyxFirstPersonContactRig | null {
  if (authorityWeaponId === 'vertical_rifle_v1') return buildVlr7ContactRig();
  if (authorityWeaponId in KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE) {
    return buildCompactContactRig(
      authorityWeaponId as keyof typeof KYX_COMPACT_FIRST_PERSON_CONTACT_PROFILE,
    );
  }
  return null;
}
