import * as THREE from 'three';

import type { OriginalArenaAuthorityMapBinding } from '../authority/originalArenaAuthority';
import { hashPhysicsFixture, type FixtureSolidV1, type PhysicsFixtureV1 } from '../physics';

export const ORIGINAL_ARENA_VISUAL_VERSION =
  'original_arena_visual_continuity_v4' as const;

export interface OriginalArenaVisualContinuity {
  readonly group: THREE.Group;
  readonly displayName: 'Switchyard' | 'Crownpoint';
  readonly meshCount: number;
  readonly lightCount: number;
  readonly colliderInstanceCount: number;
  readonly structuralLineSegmentCount: number;
  readonly architecturalAccentCount: number;
  readonly authorityFixtureUnchanged: true;
  readonly humanAccepted: false;
}

type SurfaceRole =
  | 'floor'
  | 'boundary'
  | 'stair'
  | 'cover'
  | 'container'
  | 'screen'
  | 'landmark';

const POSITION = new THREE.Vector3();
const SCALE = new THREE.Vector3();
const EULER = new THREE.Euler(0, 0, 0, 'YXZ');
const QUATERNION = new THREE.Quaternion();
const MATRIX = new THREE.Matrix4();
const AXIS_Y = new THREE.Vector3(0, 1, 0);

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
  if (solid.id.includes('_screen')) return 'screen';
  if (solid.id.includes('_container')) return 'container';
  if (solid.id.includes('_cover')) return 'cover';
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
  textureSeed = 0,
): THREE.MeshStandardMaterial {
  const size = 16;
  const pixels = new Uint8Array(size * size * 4);
  let state = (textureSeed ^ 0x4b59584f) >>> 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      const seam = x === 0 || y === 0 || x === size - 1 || y === size - 1;
      const value = seam ? 172 : 218 + (state % 25);
      const offset = (y * size + x) * 4;
      pixels[offset] = value;
      pixels[offset + 1] = value;
      pixels[offset + 2] = value;
      pixels[offset + 3] = 255;
    }
  }
  const surfaceMap = new THREE.DataTexture(
    pixels,
    size,
    size,
    THREE.RGBAFormat,
  );
  surfaceMap.name = `${name}_MICRO_SURFACE`;
  surfaceMap.colorSpace = THREE.SRGBColorSpace;
  surfaceMap.wrapS = THREE.RepeatWrapping;
  surfaceMap.wrapT = THREE.RepeatWrapping;
  surfaceMap.needsUpdate = true;
  const value = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    map: surfaceMap,
    metalness: 0.18,
    roughness: 0.72,
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
      switchyard ? 0x263b43 : 0x34394f,
      switchyard ? 0x07161b : 0x12172a,
      0.2,
      switchyard ? 11 : 41,
    ),
    boundary: material(
      `${mapId.toUpperCase()}_BOUNDARY`,
      switchyard ? 0x132a34 : 0x20263e,
      switchyard ? 0x06151d : 0x0b1024,
      0.24,
      switchyard ? 12 : 42,
    ),
    stair: material(
      `${mapId.toUpperCase()}_TRAVERSAL`,
      switchyard ? 0x58737a : 0x536c93,
      switchyard ? 0x10282f : 0x182544,
      0.3,
      switchyard ? 13 : 43,
    ),
    cover: material(
      `${mapId.toUpperCase()}_COVER`,
      switchyard ? 0x8d482d : 0x334a6d,
      switchyard ? 0x321308 : 0x0a2237,
      0.3,
      switchyard ? 14 : 44,
    ),
    container: material(
      `${mapId.toUpperCase()}_CONTAINER`,
      switchyard ? 0x315968 : 0x3f4661,
      switchyard ? 0x0b2731 : 0x12172b,
      0.26,
      switchyard ? 15 : 45,
    ),
    screen: material(
      `${mapId.toUpperCase()}_SCREEN`,
      switchyard ? 0x355563 : 0x226b7a,
      switchyard ? 0x0d2933 : 0x063643,
      0.46,
      switchyard ? 16 : 46,
    ),
    landmark: material(
      `${mapId.toUpperCase()}_LANDMARK`,
      switchyard ? 0xb77937 : 0x9e8b43,
      switchyard ? 0x3a1907 : 0x322708,
      0.34,
      switchyard ? 17 : 47,
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

const BOX_EDGE_INDICES = Object.freeze([
  [0, 1], [1, 3], [3, 2], [2, 0],
  [4, 5], [5, 7], [7, 6], [6, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
] as const);
const BOX_CORNERS = Object.freeze([
  [-0.5, -0.5, -0.5], [-0.5, -0.5, 0.5],
  [-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5],
  [0.5, -0.5, -0.5], [0.5, -0.5, 0.5],
  [0.5, 0.5, -0.5], [0.5, 0.5, 0.5],
] as const);

function addStructuralLinework(
  fixture: PhysicsFixtureV1,
  mapId: OriginalArenaAuthorityMapBinding['mapId'],
  parent: THREE.Group,
): number {
  const positions: number[] = [];
  for (const solid of fixture.solids) {
    const role = surfaceRole(solid);
    if (
      solid.shape.type !== 'box'
      || role === 'floor'
      || role === 'boundary'
    ) continue;
    const half = solid.shape.halfExtentsMm;
    SCALE.set(half.x * 2 / 1_000, half.y * 2 / 1_000, half.z * 2 / 1_000);
    MATRIX.compose(scenePosition(solid), solidQuaternion(solid), SCALE);
    const corners = BOX_CORNERS.map(([x, y, z]) => (
      new THREE.Vector3(x, y, z).applyMatrix4(MATRIX)
    ));
    for (const [start, end] of BOX_EDGE_INDICES) {
      positions.push(...corners[start].toArray(), ...corners[end].toArray());
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  const switchyard = mapId === 'switchyard';
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.LineBasicMaterial({
      color: switchyard ? 0x91aeb6 : 0x91c9e2,
      transparent: true,
      opacity: switchyard ? 0.34 : 0.3,
      depthWrite: false,
    }),
  );
  lines.name = `${mapId.toUpperCase()}_STRUCTURAL_EDGE_DEFINITION`;
  markRenderOnly(lines, 'structural_edge_definition');
  parent.add(lines);
  return positions.length / 6;
}

function addSkyDome(
  mapId: OriginalArenaAuthorityMapBinding['mapId'],
  parent: THREE.Group,
): number {
  const switchyard = mapId === 'switchyard';
  const geometry = new THREE.SphereGeometry(118, 32, 18);
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  const horizon = new THREE.Color(switchyard ? 0x5d7071 : 0x8d7891);
  const zenith = new THREE.Color(switchyard ? 0x102631 : 0x222943);
  const color = new THREE.Color();
  for (let index = 0; index < position.count; index += 1) {
    const normalizedHeight = THREE.MathUtils.clamp(
      position.getY(index) / 118 * 0.5 + 0.5,
      0,
      1,
    );
    color.copy(horizon).lerp(zenith, Math.pow(normalizedHeight, 0.72));
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const dome = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      vertexColors: true,
      fog: false,
      depthWrite: false,
    }),
  );
  dome.name = `${mapId.toUpperCase()}_ATMOSPHERE_DOME`;
  dome.position.y = -18;
  dome.renderOrder = -1_000;
  markRenderOnly(dome, 'arena_atmosphere_dome');
  parent.add(dome);
  return 1;
}

function addArchitecturalAccents(
  mapId: OriginalArenaAuthorityMapBinding['mapId'],
  parent: THREE.Group,
): Readonly<{ meshCount: number; instanceCount: number }> {
  const switchyard = mapId === 'switchyard';
  const accents = switchyard
    ? [
      { x: -22.4, y: 1.55, z: -3.75, sx: 0.12, sy: 2.8, sz: 0.12 },
      { x: -22.4, y: 1.55, z: 3.75, sx: 0.12, sy: 2.8, sz: 0.12 },
      { x: -19.6, y: 1.55, z: -3.75, sx: 0.12, sy: 2.8, sz: 0.12 },
      { x: -19.6, y: 1.55, z: 3.75, sx: 0.12, sy: 2.8, sz: 0.12 },
      { x: 22.4, y: 1.55, z: -3.75, sx: 0.12, sy: 2.8, sz: 0.12 },
      { x: 22.4, y: 1.55, z: 3.75, sx: 0.12, sy: 2.8, sz: 0.12 },
      { x: 19.6, y: 1.55, z: -3.75, sx: 0.12, sy: 2.8, sz: 0.12 },
      { x: 19.6, y: 1.55, z: 3.75, sx: 0.12, sy: 2.8, sz: 0.12 },
    ]
    : [
      { x: -19, y: 1.15, z: -4.6, sx: 0.1, sy: 2.1, sz: 0.1 },
      { x: -19, y: 1.15, z: 4.6, sx: 0.1, sy: 2.1, sz: 0.1 },
      { x: 19, y: 1.15, z: -4.6, sx: 0.1, sy: 2.1, sz: 0.1 },
      { x: 19, y: 1.15, z: 4.6, sx: 0.1, sy: 2.1, sz: 0.1 },
      { x: -4.6, y: 1.15, z: -19, sx: 0.1, sy: 2.1, sz: 0.1 },
      { x: 4.6, y: 1.15, z: -19, sx: 0.1, sy: 2.1, sz: 0.1 },
      { x: -4.6, y: 1.15, z: 19, sx: 0.1, sy: 2.1, sz: 0.1 },
      { x: 4.6, y: 1.15, z: 19, sx: 0.1, sy: 2.1, sz: 0.1 },
    ];
  const accent = switchyard ? 0xffa13d : 0x71e8ff;
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    material(
      `${mapId.toUpperCase()}_ARCHITECTURAL_ACCENT`,
      accent,
      accent,
      1.05,
      switchyard ? 18 : 48,
    ),
    accents.length,
  );
  mesh.name = `${mapId.toUpperCase()}_ARCHITECTURAL_ACCENTS`;
  for (const [index, accentPart] of accents.entries()) {
    MATRIX.compose(
      POSITION.set(accentPart.x, accentPart.y, accentPart.z),
      QUATERNION.identity(),
      SCALE.set(accentPart.sx, accentPart.sy, accentPart.sz),
    );
    mesh.setMatrixAt(index, MATRIX);
  }
  mesh.instanceMatrix.needsUpdate = true;
  markRenderOnly(mesh, 'arena_architectural_accent');
  parent.add(mesh);
  return Object.freeze({ meshCount: 1, instanceCount: accents.length });
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

  const orbitalRing = new THREE.Mesh(
    new THREE.TorusGeometry(switchyard ? 1.55 : 2.45, 0.08, 8, 32),
    material(`${binding.mapId.toUpperCase()}_ORBITAL_RING`, accent, accent, 0.72),
  );
  orbitalRing.name = `${binding.mapId.toUpperCase()}_CENTER_ORBITAL_RING`;
  orbitalRing.position.set(0, switchyard ? 7.8 : 8.2, 0);
  orbitalRing.rotation.y = Math.PI / 2;
  markRenderOnly(orbitalRing, 'center_orientation_signal');
  parent.add(orbitalRing);

  const finCount = switchyard ? 4 : 6;
  const fins = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    material(`${binding.mapId.toUpperCase()}_LANDMARK_FIN`, accent, accent, 0.38),
    finCount,
  );
  fins.name = `${binding.mapId.toUpperCase()}_LANDMARK_FINS`;
  for (let index = 0; index < finCount; index += 1) {
    const angle = index * Math.PI * 2 / finCount;
    QUATERNION.setFromAxisAngle(AXIS_Y, angle);
    MATRIX.compose(
      POSITION.set(Math.cos(angle) * 2.25, switchyard ? 6.7 : 6.5, Math.sin(angle) * 2.25),
      QUATERNION,
      SCALE.set(switchyard ? 0.16 : 0.2, switchyard ? 2.4 : 3.8, 0.22),
    );
    fins.setMatrixAt(index, MATRIX);
  }
  fins.instanceMatrix.needsUpdate = true;
  markRenderOnly(fins, 'center_landmark_fin');
  parent.add(fins);
  return 4;
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
  group.name = `${binding.mapId.toUpperCase()}_VISUAL_CONTINUITY_V4`;
  const skyDomeCount = addSkyDome(binding.mapId, group);
  const colliderVisuals = createColliderVisuals(fixture, binding.mapId, group);
  const structuralLineSegmentCount = addStructuralLinework(
    fixture,
    binding.mapId,
    group,
  );
  const inlayCount = addRouteInlays(binding.mapId, group);
  const landmarkCount = addLandmark(binding, group);
  const navigationStructureCount = addNavigationStructures(binding.mapId, group);
  const architecturalAccents = addArchitecturalAccents(binding.mapId, group);
  const lightCount = addLighting(binding, group);
  const meshCount = colliderVisuals.meshCount
    + skyDomeCount
    + inlayCount
    + landmarkCount
    + navigationStructureCount
    + architecturalAccents.meshCount;
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
    structuralLineSegmentCount,
    architecturalAccentCount: architecturalAccents.instanceCount,
    atmosphere: binding.mapId === 'switchyard'
      ? 'industrial_blue_hour'
      : 'solar_twilight',
    humanAccepted: false,
    releaseEligible: false,
  });
  return Object.freeze({
    group,
    displayName: binding.displayName,
    meshCount,
    lightCount,
    colliderInstanceCount: colliderVisuals.colliderInstanceCount,
    structuralLineSegmentCount,
    architecturalAccentCount: architecturalAccents.instanceCount,
    authorityFixtureUnchanged: true,
    humanAccepted: false,
  });
}
