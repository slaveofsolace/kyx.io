import * as THREE from 'three';

import type { OriginalArenaAuthorityMapBinding } from '../authority/originalArenaAuthority';
import { hashPhysicsFixture, type FixtureSolidV1, type PhysicsFixtureV1 } from '../physics';

export const ORIGINAL_ARENA_VISUAL_VERSION =
  'original_arena_visual_continuity_v2' as const;

export interface OriginalArenaVisualContinuity {
  readonly group: THREE.Group;
  readonly displayName: 'Switchyard' | 'Crownpoint';
  readonly meshCount: number;
  readonly lightCount: number;
  readonly colliderInstanceCount: number;
  readonly authorityFixtureUnchanged: true;
  readonly humanAccepted: false;
}

type SurfaceRole = 'floor' | 'boundary' | 'stair' | 'cover' | 'landmark';

const POSITION = new THREE.Vector3();
const SCALE = new THREE.Vector3();
const EULER = new THREE.Euler(0, 0, 0, 'YXZ');
const QUATERNION = new THREE.Quaternion();
const MATRIX = new THREE.Matrix4();

function markRenderOnly(object: THREE.Object3D, role: string): void {
  object.userData.presentationRole = role;
  object.userData.renderMeshesMayBeAuthority = false;
  object.userData.noHit = true;
  object.userData.visualContinuityVersion = ORIGINAL_ARENA_VISUAL_VERSION;
}

function surfaceRole(solid: FixtureSolidV1): SurfaceRole {
  if (solid.id.includes('_floor')) return 'floor';
  if (solid.id.includes('_boundary')) return 'boundary';
  if (solid.id.includes('_stair')) return 'stair';
  if (solid.id.includes('_cover') || solid.id.includes('_screen')) return 'cover';
  return 'landmark';
}

function scenePosition(solid: FixtureSolidV1): THREE.Vector3 {
  return POSITION.set(
    solid.centerMm.x / 1_000,
    solid.centerMm.y / 1_000,
    -solid.centerMm.z / 1_000,
  );
}

function solidQuaternion(solid: FixtureSolidV1): THREE.Quaternion {
  EULER.set(
    solid.rotationMilliDegrees.x * Math.PI / 180_000,
    -solid.rotationMilliDegrees.y * Math.PI / 180_000,
    -solid.rotationMilliDegrees.z * Math.PI / 180_000,
    'YXZ',
  );
  return QUATERNION.setFromEuler(EULER);
}

function material(
  name: string,
  color: number,
  emissive = 0,
  emissiveIntensity = 0,
): THREE.MeshStandardMaterial {
  const value = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    metalness: 0.24,
    roughness: 0.66,
  });
  value.name = name;
  return value;
}

function createColliderVisuals(
  fixture: PhysicsFixtureV1,
  mapId: OriginalArenaAuthorityMapBinding['mapId'],
  parent: THREE.Group,
): Readonly<{ meshCount: number; colliderInstanceCount: number }> {
  const switchyard = mapId === 'switchyard';
  const materials: Readonly<Record<SurfaceRole, THREE.MeshStandardMaterial>> = Object.freeze({
    floor: material(
      `${mapId.toUpperCase()}_DECK`,
      switchyard ? 0x1d3039 : 0x2c344d,
      switchyard ? 0x071116 : 0x111629,
      0.24,
    ),
    boundary: material(
      `${mapId.toUpperCase()}_BOUNDARY`,
      switchyard ? 0x102934 : 0x202849,
      switchyard ? 0x06151d : 0x0c1128,
      0.28,
    ),
    stair: material(
      `${mapId.toUpperCase()}_TRAVERSAL`,
      switchyard ? 0x496a73 : 0x63779b,
      switchyard ? 0x10262d : 0x1c2945,
      0.34,
    ),
    cover: material(
      `${mapId.toUpperCase()}_COVER`,
      switchyard ? 0xa84822 : 0x167b8f,
      switchyard ? 0x3b1006 : 0x052c39,
      0.42,
    ),
    landmark: material(
      `${mapId.toUpperCase()}_LANDMARK`,
      switchyard ? 0xb8732c : 0xd3a94a,
      switchyard ? 0x3a1907 : 0x3a2608,
      0.38,
    ),
  });
  const groups = new Map<SurfaceRole, FixtureSolidV1[]>();
  for (const solid of fixture.solids) {
    if (solid.shape.type !== 'box') {
      throw new Error(`ORIGINAL_ARENA_VISUAL_SHAPE_UNSUPPORTED:${solid.id}`);
    }
    const role = surfaceRole(solid);
    const values = groups.get(role) ?? [];
    values.push(solid);
    groups.set(role, values);
  }
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  unitBox.name = `${mapId.toUpperCase()}_AUTHORITY_VISUAL_UNIT_BOX`;
  let meshCount = 0;
  let colliderInstanceCount = 0;
  for (const [role, solids] of groups) {
    const mesh = new THREE.InstancedMesh(unitBox, materials[role], solids.length);
    mesh.name = `${mapId.toUpperCase()}_AUTHORITY_VISUAL_${role.toUpperCase()}`;
    mesh.castShadow = role !== 'floor';
    mesh.receiveShadow = true;
    mesh.userData.authorityAlignmentColliderIds = Object.freeze(
      solids.map(({ id }) => id),
    );
    mesh.userData.authorityAlignedInstanceCount = solids.length;
    markRenderOnly(mesh, 'authority_aligned_visual_cladding');
    solids.forEach((solid, index) => {
      if (solid.shape.type !== 'box') return;
      const half = solid.shape.halfExtentsMm;
      SCALE.set(half.x * 2 / 1_000, half.y * 2 / 1_000, half.z * 2 / 1_000);
      MATRIX.compose(scenePosition(solid), solidQuaternion(solid), SCALE);
      mesh.setMatrixAt(index, MATRIX);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    parent.add(mesh);
    meshCount += 1;
    colliderInstanceCount += solids.length;
  }
  return Object.freeze({ meshCount, colliderInstanceCount });
}

function addRouteInlays(
  mapId: OriginalArenaAuthorityMapBinding['mapId'],
  parent: THREE.Group,
): number {
  const switchyard = mapId === 'switchyard';
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const accent = switchyard ? 0xf29a3f : 0x53d8ff;
  const strips = switchyard
    ? [
      { x: 0, z: 14, sx: 25, sz: 0.08 },
      { x: 0, z: -14, sx: 25, sz: 0.08 },
      { x: -21, z: 0, sx: 0.08, sz: 8 },
      { x: 21, z: 0, sx: 0.08, sz: 8 },
    ]
    : [
      { x: 0, z: 0, sx: 13, sz: 0.08 },
      { x: 0, z: 0, sx: 0.08, sz: 13 },
      { x: -13, z: -13, sx: 3.5, sz: 0.08 },
      { x: 13, z: 13, sx: 3.5, sz: 0.08 },
    ];
  const mesh = new THREE.InstancedMesh(
    geometry,
    material(`${mapId.toUpperCase()}_ROUTE_SIGNAL`, accent, accent, 0.48),
    strips.length,
  );
  mesh.name = `${mapId.toUpperCase()}_ROUTE_SIGNAL_INLAYS`;
  mesh.userData.routeMeaning = switchyard
    ? 'flank_lanes_and_container_crossings'
    : 'four_routes_to_solar_crown';
  markRenderOnly(mesh, 'walkable_route_signal_inlay');
  strips.forEach((strip, index) => {
    MATRIX.compose(
      POSITION.set(strip.x, 0.012, -strip.z),
      QUATERNION.identity(),
      SCALE.set(strip.sx, 0.012, strip.sz),
    );
    mesh.setMatrixAt(index, MATRIX);
  });
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
  return 1;
}

function addNavigationStructures(
  mapId: OriginalArenaAuthorityMapBinding['mapId'],
  parent: THREE.Group,
): number {
  const switchyard = mapId === 'switchyard';
  const frameColor = switchyard ? 0x314954 : 0x334b70;
  const signalColor = switchyard ? 0xffa13d : 0x71e8ff;
  const frames = switchyard
    ? [
      { x: -22, y: 4.4, z: -15.5, sx: 0.35, sy: 8.8, sz: 0.35 },
      { x: 22, y: 4.4, z: -15.5, sx: 0.35, sy: 8.8, sz: 0.35 },
      { x: -22, y: 4.4, z: 15.5, sx: 0.35, sy: 8.8, sz: 0.35 },
      { x: 22, y: 4.4, z: 15.5, sx: 0.35, sy: 8.8, sz: 0.35 },
      { x: 0, y: 8.45, z: -15.5, sx: 44.35, sy: 0.35, sz: 0.35 },
      { x: 0, y: 8.45, z: 15.5, sx: 44.35, sy: 0.35, sz: 0.35 },
    ]
    : [
      { x: -18.5, y: 3.2, z: -18.5, sx: 0.55, sy: 6.4, sz: 0.55 },
      { x: 18.5, y: 3.2, z: -18.5, sx: 0.55, sy: 6.4, sz: 0.55 },
      { x: -18.5, y: 3.2, z: 18.5, sx: 0.55, sy: 6.4, sz: 0.55 },
      { x: 18.5, y: 3.2, z: 18.5, sx: 0.55, sy: 6.4, sz: 0.55 },
    ];
  const frameMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    material(`${mapId.toUpperCase()}_NAV_FRAME`, frameColor, frameColor, 0.18),
    frames.length,
  );
  frameMesh.name = `${mapId.toUpperCase()}_NAVIGATION_FRAMES`;
  frames.forEach((frame, index) => {
    MATRIX.compose(
      POSITION.set(frame.x, frame.y, frame.z),
      QUATERNION.identity(),
      SCALE.set(frame.sx, frame.sy, frame.sz),
    );
    frameMesh.setMatrixAt(index, MATRIX);
  });
  frameMesh.instanceMatrix.needsUpdate = true;
  frameMesh.castShadow = true;
  frameMesh.receiveShadow = true;
  markRenderOnly(frameMesh, 'arena_navigation_frame');
  parent.add(frameMesh);

  const signals = [
    { x: -18.5, z: -18.5 }, { x: 18.5, z: -18.5 },
    { x: -18.5, z: 18.5 }, { x: 18.5, z: 18.5 },
  ];
  if (switchyard) {
    for (const signal of signals) {
      signal.x = Math.sign(signal.x) * 22;
      signal.z = Math.sign(signal.z) * 15.5;
    }
  }
  const signalMesh = new THREE.InstancedMesh(
    new THREE.OctahedronGeometry(switchyard ? 0.48 : 0.62, 0),
    material(`${mapId.toUpperCase()}_NAV_SIGNAL`, signalColor, signalColor, 1.3),
    signals.length,
  );
  signalMesh.name = `${mapId.toUpperCase()}_NAVIGATION_SIGNALS`;
  signals.forEach((signal, index) => {
    MATRIX.compose(
      POSITION.set(signal.x, switchyard ? 8.9 : 6.75, signal.z),
      QUATERNION.identity(),
      SCALE.set(1, 1, 1),
    );
    signalMesh.setMatrixAt(index, MATRIX);
  });
  signalMesh.instanceMatrix.needsUpdate = true;
  markRenderOnly(signalMesh, 'arena_navigation_signal');
  parent.add(signalMesh);
  return 2;
}

function addLandmark(
  binding: OriginalArenaAuthorityMapBinding,
  parent: THREE.Group,
): number {
  const switchyard = binding.mapId === 'switchyard';
  const accent = switchyard ? 0xffa24a : 0x6ce5ff;
  const core = new THREE.Mesh(
    switchyard
      ? new THREE.BoxGeometry(2.4, 6.2, 2.4)
      : new THREE.CylinderGeometry(1.45, 1.45, 4.2, 16),
    material(`${binding.mapId.toUpperCase()}_BEACON`, 0x253039, accent, 0.72),
  );
  core.name = switchyard
    ? 'SWITCHYARD_CRANE_SIGNAL_BEACON'
    : 'CROWNPOINT_SOLAR_CROWN_BEACON';
  core.position.set(0, switchyard ? 7.6 : 7.2, 0);
  core.castShadow = true;
  markRenderOnly(core, 'center_orientation_landmark');
  parent.add(core);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(switchyard ? 2.2 : 3.1, 0.11, 8, 32),
    material(`${binding.mapId.toUpperCase()}_BEACON_RING`, accent, accent, 0.86),
  );
  ring.name = `${binding.mapId.toUpperCase()}_CENTER_ROUTE_RING`;
  ring.position.set(0, switchyard ? 7.8 : 8.2, 0);
  ring.rotation.x = Math.PI / 2;
  markRenderOnly(ring, 'center_orientation_signal');
  parent.add(ring);
  return 2;
}

function addLighting(
  binding: OriginalArenaAuthorityMapBinding,
  parent: THREE.Group,
): number {
  const switchyard = binding.mapId === 'switchyard';
  const hemisphere = new THREE.HemisphereLight(
    switchyard ? 0x8fa9bd : 0xc9e8ff,
    switchyard ? 0x161d25 : 0x3a2f2b,
    switchyard ? 1.15 : 1.42,
  );
  hemisphere.name = `${binding.mapId.toUpperCase()}_HEMISPHERE_LIGHT`;
  markRenderOnly(hemisphere, 'arena_global_light');
  parent.add(hemisphere);
  const key = new THREE.DirectionalLight(
    switchyard ? 0xffad62 : 0xffdfae,
    switchyard ? 2.05 : 2.45,
  );
  key.name = `${binding.mapId.toUpperCase()}_KEY_LIGHT`;
  key.position.set(switchyard ? -18 : 14, 28, switchyard ? -12 : 18);
  key.castShadow = true;
  key.shadow.mapSize.set(1_024, 1_024);
  key.shadow.camera.left = -36;
  key.shadow.camera.right = 36;
  key.shadow.camera.top = 32;
  key.shadow.camera.bottom = -32;
  markRenderOnly(key, 'arena_key_light');
  parent.add(key);
  const fill = new THREE.DirectionalLight(
    switchyard ? 0x8dc9ed : 0x87d4ff,
    switchyard ? 1.15 : 1.3,
  );
  fill.name = `${binding.mapId.toUpperCase()}_FILL_LIGHT`;
  fill.position.set(switchyard ? 18 : -14, 15, switchyard ? 16 : -18);
  markRenderOnly(fill, 'arena_fill_light');
  parent.add(fill);
  return 3;
}

export function createOriginalArenaVisualContinuity(
  binding: OriginalArenaAuthorityMapBinding,
  fixture: PhysicsFixtureV1,
): OriginalArenaVisualContinuity {
  if (
    fixture.id !== binding.fixtureId
    || fixture.solids.length !== binding.colliderCardinality
    || hashPhysicsFixture(fixture) !== binding.fixtureHash
  ) {
    throw new Error('ORIGINAL_ARENA_VISUAL_AUTHORITY_BINDING_MISMATCH');
  }
  const group = new THREE.Group();
  group.name = `${binding.mapId.toUpperCase()}_VISUAL_CONTINUITY_V1`;
  const colliderVisuals = createColliderVisuals(fixture, binding.mapId, group);
  const inlayCount = addRouteInlays(binding.mapId, group);
  const landmarkCount = addLandmark(binding, group);
  const navigationStructureCount = addNavigationStructures(binding.mapId, group);
  const lightCount = addLighting(binding, group);
  const meshCount = colliderVisuals.meshCount
    + inlayCount
    + landmarkCount
    + navigationStructureCount;
  Object.assign(group.userData, {
    displayName: binding.displayName,
    mapId: binding.mapId,
    presentationTheme: binding.presentationTheme,
    authorityFixtureId: fixture.id,
    authorityFixtureHash: binding.fixtureHash,
    authorityColliderCountAtBuild: fixture.solids.length,
    authorityFixtureUnchanged: true,
    renderMeshesMayBeAuthority: false,
    noHit: true,
    visualContinuityVersion: ORIGINAL_ARENA_VISUAL_VERSION,
    humanAccepted: false,
    releaseEligible: false,
  });
  return Object.freeze({
    group,
    displayName: binding.displayName,
    meshCount,
    lightCount,
    colliderInstanceCount: colliderVisuals.colliderInstanceCount,
    authorityFixtureUnchanged: true,
    humanAccepted: false,
  });
}
