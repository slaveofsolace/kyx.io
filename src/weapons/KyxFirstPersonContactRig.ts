import * as THREE from 'three';

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
      6,
      12,
    ),
    material,
  );
  mesh.name = name;
  mesh.position.copy(start).add(end).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(Y_AXIS, direction.normalize());
  return mesh;
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
  for (const [index, x] of [-0.031, 0, 0.031].entries()) {
    const finger = capsuleBetween(
      `${prefix}_FINGER_${index + 1}`,
      new THREE.Vector3(center[0] + x, center[1] + 0.04, center[2]),
      new THREE.Vector3(center[0] + x, center[1] - 0.045, center[2] + 0.006),
      0.012,
      material,
    );
    hand.add(finger);
  }
}

function buildVlr7ContactRig(): KyxFirstPersonContactRig {
  const suit = new THREE.MeshStandardMaterial({
    name: 'KYX_FP_SYNTH_SLEEVE',
    color: 0x263842,
    metalness: 0.16,
    roughness: 0.58,
  });
  const plate = new THREE.MeshStandardMaterial({
    name: 'KYX_FP_FOREARM_PLATE',
    color: 0x526c76,
    metalness: 0.68,
    roughness: 0.34,
  });
  const glove = new THREE.MeshStandardMaterial({
    name: 'KYX_FP_TACTICAL_GLOVE',
    color: 0x10181d,
    metalness: 0.12,
    roughness: 0.7,
  });
  const seam = new THREE.MeshStandardMaterial({
    name: 'KYX_FP_GLOVE_SEAM',
    color: 0x080d10,
    metalness: 0.08,
    roughness: 0.82,
  });
  const accent = new THREE.MeshStandardMaterial({
    name: 'KYX_FP_SUIT_ACCENT',
    color: 0x55dcff,
    emissive: 0x123a44,
    emissiveIntensity: 0.72,
    metalness: 0.2,
    roughness: 0.38,
  });

  const root = new THREE.Group();
  root.name = 'KYX_VLR7_FIRST_PERSON_CONTACT_RIG';
  root.userData.presentationOnly = true;
  root.userData.noHit = true;
  root.userData.contactMode = 'authored_two_hand_rifle_v1';

  const dominantShoulder = new THREE.Vector3(0.52, -0.42, 0.26);
  const dominantElbow = new THREE.Vector3(0.33, -0.3, 0.235);
  const dominantWrist = new THREE.Vector3(0.135, -0.18, 0.22);
  const dominantPalm = new THREE.Vector3(0.018, -0.105, 0.19);
  root.add(
    capsuleBetween(
      'KYX_VLR7_DOMINANT_SLEEVE_UPPER',
      dominantShoulder,
      dominantElbow,
      0.048,
      suit,
    ),
    capsuleBetween(
      'KYX_VLR7_DOMINANT_SLEEVE_LOWER',
      dominantElbow,
      dominantWrist,
      0.044,
      suit,
    ),
    plateBetween(
      'KYX_VLR7_DOMINANT_FOREARM_PLATE',
      new THREE.Vector3(0.305, -0.285, 0.235),
      new THREE.Vector3(0.16, -0.195, 0.22),
      0.078,
      0.02,
      plate,
    ),
    capsuleBetween(
      'KYX_VLR7_DOMINANT_WRIST',
      dominantWrist,
      dominantPalm,
      0.038,
      glove,
    ),
  );

  const dominantHand = new THREE.Group();
  dominantHand.name = 'KYX_VLR7_DOMINANT_HAND';
  dominantHand.add(
    capsuleBetween(
      'KYX_VLR7_DOMINANT_PALM',
      new THREE.Vector3(0.035, -0.145, 0.225),
      new THREE.Vector3(0.004, -0.08, 0.18),
      0.041,
      glove,
    ),
    plateBetween(
      'KYX_VLR7_DOMINANT_KNUCKLE',
      new THREE.Vector3(-0.04, -0.074, 0.172),
      new THREE.Vector3(0.04, -0.074, 0.172),
      0.018,
      0.018,
      seam,
    ),
  );
  addWrappedFingers(
    dominantHand,
    'KYX_VLR7_DOMINANT',
    [0, -0.115, 0.19],
    glove,
  );
  root.add(dominantHand);

  const supportShoulder = new THREE.Vector3(-0.3, -0.4, 0.12);
  const supportElbow = new THREE.Vector3(-0.21, -0.28, -0.02);
  const supportWrist = new THREE.Vector3(-0.105, -0.15, -0.16);
  const supportPalm = new THREE.Vector3(-0.02, -0.045, -0.34);
  root.add(
    capsuleBetween(
      'KYX_VLR7_SUPPORT_SLEEVE_UPPER',
      supportShoulder,
      supportElbow,
      0.048,
      suit,
    ),
    capsuleBetween(
      'KYX_VLR7_SUPPORT_SLEEVE_LOWER',
      supportElbow,
      supportWrist,
      0.044,
      suit,
    ),
    plateBetween(
      'KYX_VLR7_SUPPORT_FOREARM_PLATE',
      new THREE.Vector3(-0.2, -0.27, -0.03),
      new THREE.Vector3(-0.115, -0.16, -0.145),
      0.078,
      0.02,
      plate,
    ),
    capsuleBetween(
      'KYX_VLR7_SUPPORT_WRIST',
      supportWrist,
      supportPalm,
      0.038,
      glove,
    ),
  );

  const supportHand = new THREE.Group();
  supportHand.name = 'KYX_VLR7_SUPPORT_HAND';
  supportHand.add(
    capsuleBetween(
      'KYX_VLR7_SUPPORT_PALM',
      new THREE.Vector3(-0.06, -0.075, -0.29),
      new THREE.Vector3(-0.01, 0, -0.365),
      0.041,
      glove,
    ),
    plateBetween(
      'KYX_VLR7_SUPPORT_KNUCKLE',
      new THREE.Vector3(-0.067, -0.028, -0.36),
      new THREE.Vector3(0.018, -0.028, -0.36),
      0.018,
      0.018,
      seam,
    ),
  );
  addWrappedFingers(
    supportHand,
    'KYX_VLR7_SUPPORT',
    [-0.02, -0.04, -0.36],
    glove,
  );
  root.add(supportHand);

  const dominantCuff = new THREE.Mesh(
    new THREE.TorusGeometry(0.046, 0.007, 8, 16),
    accent,
  );
  dominantCuff.name = 'KYX_VLR7_DOMINANT_CUFF_ACCENT';
  dominantCuff.position.copy(dominantWrist);
  dominantCuff.rotation.set(1.05, 0.52, -0.52);
  const supportCuff = dominantCuff.clone();
  supportCuff.name = 'KYX_VLR7_SUPPORT_CUFF_ACCENT';
  supportCuff.position.copy(supportWrist);
  supportCuff.rotation.set(0.95, -0.38, 0.34);
  root.add(dominantCuff, supportCuff);

  const dominantGrip = gripMarker(
    'KYX_VLR7_DOMINANT_GRIP_CONTACT',
    [0, -0.115, 0.19],
  );
  const supportGrip = gripMarker(
    'KYX_VLR7_SUPPORT_GRIP_CONTACT',
    [-0.02, -0.04, -0.36],
  );
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
    handCount: 2,
    dominantGrip,
    supportGrip,
  });
}

export function createKyxFirstPersonContactRig(
  authorityWeaponId: string,
): KyxFirstPersonContactRig | null {
  return authorityWeaponId === 'vertical_rifle_v1'
    ? buildVlr7ContactRig()
    : null;
}
