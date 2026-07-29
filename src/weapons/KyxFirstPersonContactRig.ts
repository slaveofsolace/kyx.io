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
      12,
      2,
      false,
    ),
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
    color: 0x111a20,
    metalness: 0.08,
    roughness: 0.8,
  });
  const plate = new THREE.MeshStandardMaterial({
    name: 'KYX_FP_FOREARM_PLATE',
    color: 0x33464f,
    metalness: 0.46,
    roughness: 0.42,
  });
  const glove = new THREE.MeshStandardMaterial({
    name: 'KYX_FP_TACTICAL_GLOVE',
    color: 0x090d12,
    metalness: 0.05,
    roughness: 0.82,
  });
  const seam = new THREE.MeshStandardMaterial({
    name: 'KYX_FP_GLOVE_SEAM',
    color: 0x28535b,
    metalness: 0.16,
    roughness: 0.6,
  });
  const root = new THREE.Group();
  root.name = 'KYX_VLR7_FIRST_PERSON_CONTACT_RIG';
  root.userData.presentationOnly = true;
  root.userData.noHit = true;
  root.userData.contactMode = 'authored_two_hand_assault_suit_v2';

  const dominantShoulder = new THREE.Vector3(0.52, -0.42, 0.26);
  const dominantElbow = new THREE.Vector3(0.33, -0.3, 0.235);
  const dominantWrist = new THREE.Vector3(0.135, -0.18, 0.22);
  const dominantPalm = new THREE.Vector3(0.018, -0.105, 0.19);
  const dominantGauntletStart = pointBetween(
    dominantElbow,
    dominantWrist,
    0.44,
  );
  const dominantGauntletEnd = pointBetween(
    dominantElbow,
    dominantWrist,
    0.94,
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
      0.064,
      0.052,
      suit,
    ),
    taperedLimbBetween(
      'KYX_VLR7_DOMINANT_SLEEVE_LOWER',
      dominantElbow,
      dominantWrist,
      0.052,
      0.041,
      suit,
    ),
    taperedLimbBetween(
      'KYX_VLR7_DOMINANT_ELBOW_BRIDGE',
      dominantElbowBridgeStart,
      dominantElbowBridgeEnd,
      0.053,
      0.051,
      suit,
    ),
    taperedLimbBetween(
      'KYX_VLR7_DOMINANT_GAUNTLET_CORE',
      dominantGauntletStart,
      dominantGauntletEnd,
      0.05,
      0.042,
      plate,
    ),
    plateBetween(
      'KYX_VLR7_DOMINANT_GAUNTLET_DORSAL_PLATE',
      dominantGauntletStart.clone().add(new THREE.Vector3(0, 0, 0.044)),
      dominantGauntletEnd.clone().add(new THREE.Vector3(0, 0, 0.04)),
      0.082,
      0.016,
      plate,
    ),
    taperedLimbBetween(
      'KYX_VLR7_DOMINANT_WRIST_SEAL',
      dominantWristSealStart,
      dominantWristSealEnd,
      0.043,
      0.04,
      seam,
    ),
    taperedLimbBetween(
      'KYX_VLR7_DOMINANT_WRIST',
      dominantWrist,
      dominantPalm,
      0.042,
      0.036,
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
      'KYX_VLR7_DOMINANT_GLOVE_BACKPLATE',
      new THREE.Vector3(-0.038, -0.068, 0.215),
      new THREE.Vector3(0.04, -0.068, 0.215),
      0.052,
      0.016,
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

  const supportShoulder = new THREE.Vector3(-0.62, -0.42, 0.05);
  const supportElbow = new THREE.Vector3(-0.4, -0.28, -0.08);
  const supportWrist = new THREE.Vector3(-0.16, -0.14, -0.2);
  const supportPalm = new THREE.Vector3(-0.02, -0.045, -0.34);
  const supportGauntletStart = pointBetween(
    supportElbow,
    supportWrist,
    0.44,
  );
  const supportGauntletEnd = pointBetween(
    supportElbow,
    supportWrist,
    0.94,
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
      0.066,
      0.052,
      suit,
    ),
    taperedLimbBetween(
      'KYX_VLR7_SUPPORT_SLEEVE_LOWER',
      supportElbow,
      supportWrist,
      0.052,
      0.041,
      suit,
    ),
    taperedLimbBetween(
      'KYX_VLR7_SUPPORT_ELBOW_BRIDGE',
      supportElbowBridgeStart,
      supportElbowBridgeEnd,
      0.053,
      0.051,
      suit,
    ),
    taperedLimbBetween(
      'KYX_VLR7_SUPPORT_GAUNTLET_CORE',
      supportGauntletStart,
      supportGauntletEnd,
      0.05,
      0.042,
      plate,
    ),
    plateBetween(
      'KYX_VLR7_SUPPORT_GAUNTLET_DORSAL_PLATE',
      supportGauntletStart.clone().add(new THREE.Vector3(0, 0, 0.048)),
      supportGauntletEnd.clone().add(new THREE.Vector3(0, 0, 0.04)),
      0.082,
      0.016,
      plate,
    ),
    taperedLimbBetween(
      'KYX_VLR7_SUPPORT_WRIST_SEAL',
      supportWristSealStart,
      supportWristSealEnd,
      0.043,
      0.04,
      seam,
    ),
    taperedLimbBetween(
      'KYX_VLR7_SUPPORT_WRIST',
      supportWrist,
      supportPalm,
      0.042,
      0.036,
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
      'KYX_VLR7_SUPPORT_GLOVE_BACKPLATE',
      new THREE.Vector3(-0.059, -0.023, -0.32),
      new THREE.Vector3(0.019, -0.023, -0.32),
      0.052,
      0.016,
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
