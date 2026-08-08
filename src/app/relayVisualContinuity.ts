import * as THREE from 'three';

import type {
  FixtureSolidV1,
  PhysicsFixtureV1,
} from '../physics/fixtureSchema';
import { createRelayArchitectureSkin } from './relayArchitectureSkin';

export const RELAY_DISPLAY_NAME = 'Relay' as const;
export const RELAY_VISUAL_CONTINUITY_VERSION =
  'relay_open_sky_visual_candidate_v4' as const;
export const RELAY_AUTHORITY_COMPATIBILITY =
  'relay_revision_1_authority_candidate' as const;
export const RELAY_LEGACY_AUTHORITY_COMPATIBILITY =
  'inkfall_revision_4_fixture_temporary' as const;

type ColliderSurfaceRole =
  | 'deck_upper'
  | 'deck_mid'
  | 'deck_lower'
  | 'edge'
  | 'cover'
  | 'structure'
  | 'spawn_west'
  | 'spawn_east';

export interface RelayVisualContinuity {
  readonly group: THREE.Group;
  readonly meshCount: number;
  readonly lightCount: number;
  readonly colliderInstanceCount: number;
  readonly waypointInlayCount: number;
  readonly landmarkMeshCount: number;
  readonly authorityFixtureUnchanged: true;
  readonly humanAccepted: false;
}

const WAYPOINT_ID = /_waypoint_/u;
const SPAWN_SURFACE_ID = /(?:spawn_pad|spawn_pocket_floor|node_(?:east|west)_spawn)/u;
const TRAVERSAL_SURFACE_ID =
  /(?:playable_floor|route_|node_|jump_pad|landing|bridge|ramp|stair|walk|deck|platform)/u;
const EDGE_ID =
  /(?:guard_rail|door_frame|wall|boundary|barrier|sight_blocker|jump_guard|playable_guard)/u;
const COVER_ID = /(?:module_|full_cover|half_cover|reactor|slide_gate|baffle)/u;

const SCENE_POSITION = new THREE.Vector3();
const SCENE_SCALE = new THREE.Vector3();
const SCENE_ROTATION = new THREE.Euler(0, 0, 0, 'YXZ');
const SCENE_QUATERNION = new THREE.Quaternion();
const SCENE_MATRIX = new THREE.Matrix4();
const LOCAL_UP_OFFSET = new THREE.Vector3();

function markRenderOnly(object: THREE.Object3D, role: string): void {
  object.userData.presentationRole = role;
  object.userData.renderMeshesMayBeAuthority = false;
  object.userData.noHit = true;
  object.userData.visualContinuityVersion = RELAY_VISUAL_CONTINUITY_VERSION;
}

function standardMaterial(
  name: string,
  color: number,
  options: Readonly<{
    emissive?: number;
    emissiveIntensity?: number;
    metalness?: number;
    roughness?: number;
    map?: THREE.Texture;
    roughnessMap?: THREE.Texture;
    bumpMap?: THREE.Texture;
    bumpScale?: number;
  }> = {},
): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    metalness: options.metalness ?? 0.18,
    roughness: options.roughness ?? 0.66,
    map: options.map ?? null,
    roughnessMap: options.roughnessMap ?? null,
    bumpMap: options.bumpMap ?? null,
    bumpScale: options.bumpScale ?? 1,
  });
  material.name = name;
  return material;
}

interface RelayPanelMaps {
  readonly color: THREE.DataTexture;
  readonly roughness: THREE.DataTexture;
  readonly height: THREE.DataTexture;
}

function relayPanelTexture(
  name: string,
  channel: 'color' | 'roughness' | 'height',
): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const outerSeam = x < 2 || y < 2 || x >= size - 2 || y >= size - 2;
      const innerSeam = x === 31 || x === 32 || y === 31 || y === 32;
      const fastener = (
        (x - 7) ** 2 + (y - 7) ** 2 <= 3
        || (x - 56) ** 2 + (y - 7) ** 2 <= 3
        || (x - 7) ** 2 + (y - 56) ** 2 <= 3
        || (x - 56) ** 2 + (y - 56) ** 2 <= 3
      );
      const grain = ((x * 19 + y * 37 + (x ^ y) * 11) % 19) - 9;
      let value: number;
      if (channel === 'color') {
        value = outerSeam ? 118 : innerSeam ? 158 : fastener ? 96 : 226 + grain;
      } else if (channel === 'roughness') {
        value = outerSeam || innerSeam ? 230 : fastener ? 112 : 166 + grain * 2;
      } else {
        value = outerSeam ? 80 : innerSeam ? 112 : fastener ? 218 : 176 + grain;
      }
      const clamped = Math.max(0, Math.min(255, value));
      data[offset] = clamped;
      data[offset + 1] = clamped;
      data[offset + 2] = clamped;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(
    data,
    size,
    size,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = name;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  if (channel === 'color') texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createRelayPanelMaps(repeatX: number, repeatY: number): RelayPanelMaps {
  const configure = (texture: THREE.DataTexture): THREE.DataTexture => {
    texture.repeat.set(repeatX, repeatY);
    texture.needsUpdate = true;
    return texture;
  };
  return Object.freeze({
    color: configure(relayPanelTexture('RELAY_PANEL_ALBEDO', 'color')),
    roughness: configure(relayPanelTexture('RELAY_PANEL_ROUGHNESS', 'roughness')),
    height: configure(relayPanelTexture('RELAY_PANEL_HEIGHT', 'height')),
  });
}

function panelMaterial(
  name: string,
  color: number,
  repeat: readonly [number, number],
  options: Readonly<{
    emissive?: number;
    emissiveIntensity?: number;
    metalness?: number;
    roughness?: number;
    bumpScale?: number;
  }> = {},
): THREE.MeshStandardMaterial {
  const maps = createRelayPanelMaps(repeat[0], repeat[1]);
  return standardMaterial(name, color, {
    ...options,
    map: maps.color,
    roughnessMap: maps.roughness,
    bumpMap: maps.height,
    bumpScale: options.bumpScale ?? 0.035,
  });
}

function surfaceRole(solid: FixtureSolidV1): ColliderSurfaceRole {
  if (SPAWN_SURFACE_ID.test(solid.id)) {
    return solid.centerMm.x < 0 ? 'spawn_west' : 'spawn_east';
  }
  if (TRAVERSAL_SURFACE_ID.test(solid.id)) {
    if (solid.centerMm.y > 3_000) return 'deck_upper';
    if (solid.centerMm.y < -1_000) return 'deck_lower';
    return 'deck_mid';
  }
  if (EDGE_ID.test(solid.id)) return 'edge';
  if (COVER_ID.test(solid.id)) return 'cover';
  return 'structure';
}

function solidQuaternion(solid: FixtureSolidV1): THREE.Quaternion {
  SCENE_ROTATION.set(
    solid.rotationMilliDegrees.x * Math.PI / 180_000,
    -solid.rotationMilliDegrees.y * Math.PI / 180_000,
    -solid.rotationMilliDegrees.z * Math.PI / 180_000,
    'YXZ',
  );
  return SCENE_QUATERNION.setFromEuler(SCENE_ROTATION);
}

function scenePosition(solid: FixtureSolidV1): THREE.Vector3 {
  return SCENE_POSITION.set(
    solid.centerMm.x / 1_000,
    solid.centerMm.y / 1_000,
    -solid.centerMm.z / 1_000,
  );
}

function createColliderInstances(
  fixture: PhysicsFixtureV1,
  parent: THREE.Group,
): Readonly<{
  meshCount: number;
  colliderInstanceCount: number;
  waypointInlayCount: number;
}> {
  const materials = Object.freeze({
    deck_upper: panelMaterial('RELAY_CERAMIC_UPPER_DECK', 0x92a29e, [5, 4], {
      metalness: 0.16,
      roughness: 0.62,
    }),
    deck_mid: panelMaterial('RELAY_GRAPHITE_MID_DECK', 0x4d6263, [8, 6], {
      metalness: 0.28,
      roughness: 0.56,
    }),
    deck_lower: panelMaterial('RELAY_MOSS_LOWER_DECK', 0x344d48, [6, 4], {
      metalness: 0.18,
      roughness: 0.68,
    }),
    edge: panelMaterial('RELAY_CERAMIC_EDGE', 0x81918e, [3, 5], {
      metalness: 0.2,
      roughness: 0.58,
    }),
    cover: panelMaterial('RELAY_BLUEGRAY_COVER', 0x4f6b70, [2, 2], {
      metalness: 0.34,
      roughness: 0.46,
    }),
    structure: panelMaterial('RELAY_DARK_STRUCTURE', 0x2d4245, [3, 3], {
      metalness: 0.46,
      roughness: 0.46,
    }),
    spawn_west: panelMaterial('RELAY_WEST_SPAWN_CYAN', 0x28535b, [5, 5], {
      emissive: 0x0b3037,
      emissiveIntensity: 0.18,
      metalness: 0.3,
      roughness: 0.44,
    }),
    spawn_east: panelMaterial('RELAY_EAST_SPAWN_AMBER', 0x72503a, [5, 5], {
      emissive: 0x3e2515,
      emissiveIntensity: 0.18,
      metalness: 0.3,
      roughness: 0.44,
    }),
  } satisfies Readonly<Record<ColliderSurfaceRole, THREE.MeshStandardMaterial>>);
  const groups = new Map<ColliderSurfaceRole, FixtureSolidV1[]>();
  const waypoints: FixtureSolidV1[] = [];
  for (const solid of fixture.solids) {
    if (solid.shape.type !== 'box') continue;
    if (WAYPOINT_ID.test(solid.id)) {
      waypoints.push(solid);
      continue;
    }
    const role = surfaceRole(solid);
    const bucket = groups.get(role) ?? [];
    bucket.push(solid);
    groups.set(role, bucket);
  }

  const unitBox = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  unitBox.name = 'RELAY_AUTHORITY_CLADDING_UNIT_BOX';
  let meshCount = 0;
  let colliderInstanceCount = 0;
  for (const [role, solids] of groups) {
    const mesh = new THREE.InstancedMesh(unitBox, materials[role], solids.length);
    mesh.name = `RELAY_AUTHORITY_CLADDING_${role.toUpperCase()}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.authorityAlignmentColliderIds = Object.freeze(
      solids.map((solid) => solid.id),
    );
    mesh.userData.authorityAlignedInstanceCount = solids.length;
    markRenderOnly(mesh, 'authority_aligned_visual_cladding');
    solids.forEach((solid, index) => {
      if (solid.shape.type !== 'box') return;
      const half = solid.shape.halfExtentsMm;
      SCENE_SCALE.set(
        half.x * 2 / 1_000,
        half.y * 2 / 1_000,
        half.z * 2 / 1_000,
      );
      SCENE_MATRIX.compose(
        scenePosition(solid),
        solidQuaternion(solid),
        SCENE_SCALE,
      );
      mesh.setMatrixAt(index, SCENE_MATRIX);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    parent.add(mesh);
    meshCount += 1;
    colliderInstanceCount += solids.length;
  }

  if (waypoints.length > 0) {
    const waypointMaterial = standardMaterial(
      'RELAY_NAVIGATION_INLAY',
      0x98e6df,
      {
        emissive: 0x258f89,
        emissiveIntensity: 0.58,
        metalness: 0.14,
        roughness: 0.44,
      },
    );
    const waypointMesh = new THREE.InstancedMesh(
      unitBox,
      waypointMaterial,
      waypoints.length,
    );
    waypointMesh.name = 'RELAY_AUTHORITY_WAYPOINT_INLAYS';
    waypointMesh.castShadow = false;
    waypointMesh.receiveShadow = false;
    waypointMesh.userData.authorityAlignmentColliderIds = Object.freeze(
      waypoints.map((solid) => solid.id),
    );
    waypointMesh.userData.visualOnlySurfaceInlay = true;
    markRenderOnly(waypointMesh, 'authority_waypoint_visual_inlay');
    waypoints.forEach((solid, index) => {
      if (solid.shape.type !== 'box') return;
      const half = solid.shape.halfExtentsMm;
      const quaternion = solidQuaternion(solid);
      const position = scenePosition(solid).clone();
      LOCAL_UP_OFFSET.set(0, half.y / 1_000 + 0.018, 0)
        .applyQuaternion(quaternion);
      position.add(LOCAL_UP_OFFSET);
      SCENE_SCALE.set(
        half.x * 1.35 / 1_000,
        0.022,
        half.z * 1.35 / 1_000,
      );
      SCENE_MATRIX.compose(position, quaternion, SCENE_SCALE);
      waypointMesh.setMatrixAt(index, SCENE_MATRIX);
    });
    waypointMesh.instanceMatrix.needsUpdate = true;
    waypointMesh.computeBoundingBox();
    waypointMesh.computeBoundingSphere();
    parent.add(waypointMesh);
    meshCount += 1;
    colliderInstanceCount += waypoints.length;
  }

  return Object.freeze({
    meshCount,
    colliderInstanceCount,
    waypointInlayCount: waypoints.length,
  });
}

function createSkyEnvironment(parent: THREE.Group): number {
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      upperColor: { value: new THREE.Color(0x82a4b8) },
      horizonColor: { value: new THREE.Color(0xd2cbb5) },
      lowerColor: { value: new THREE.Color(0x6f8279) },
    },
    vertexShader: `
      varying vec3 vWorldDirection;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 upperColor;
      uniform vec3 horizonColor;
      uniform vec3 lowerColor;
      varying vec3 vWorldDirection;
      void main() {
        float up = smoothstep(-0.08, 0.72, vWorldDirection.y);
        float down = smoothstep(-0.55, -0.04, vWorldDirection.y);
        vec3 color = mix(horizonColor, upperColor, up);
        color = mix(color, lowerColor, down * 0.72);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  skyMaterial.name = 'RELAY_DAYLIGHT_SKY_GRADIENT';
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(118, 32, 18),
    skyMaterial,
  );
  sky.name = 'RELAY_OPEN_SKY';
  sky.renderOrder = -100;
  markRenderOnly(sky, 'distant_environment');
  parent.add(sky);
  return 1;
}

function createRelayLandmarks(parent: THREE.Group): Readonly<{
  meshCount: number;
  lightCount: number;
}> {
  const paleCeramic = standardMaterial('RELAY_LANDMARK_CERAMIC', 0x9faeaa, {
    metalness: 0.16,
    roughness: 0.56,
  });
  const darkMetal = standardMaterial('RELAY_LANDMARK_DARK_METAL', 0x14272d, {
    metalness: 0.68,
    roughness: 0.34,
  });
  const signal = standardMaterial('RELAY_SIGNAL_EMISSIVE', 0x54c8ca, {
    emissive: 0x167a7d,
    emissiveIntensity: 0.82,
    metalness: 0.18,
    roughness: 0.32,
  });
  const terrain = standardMaterial('RELAY_DISTANCE_TERRAIN', 0x263d3a, {
    metalness: 0,
    roughness: 1,
  });
  const terrainLight = standardMaterial('RELAY_DISTANCE_TERRAIN_LIGHT', 0x405a54, {
    metalness: 0,
    roughness: 1,
  });
  let meshCount = 0;
  let lightCount = 0;

  const add = (
    mesh: THREE.Mesh,
    name: string,
    role = 'original_environment_landmark',
  ): THREE.Mesh => {
    mesh.name = name;
    mesh.castShadow = role !== 'distant_environment'
      && !role.endsWith('_inlay');
    mesh.receiveShadow = true;
    markRenderOnly(mesh, role);
    parent.add(mesh);
    meshCount += 1;
    return mesh;
  };

  const hemisphere = new THREE.HemisphereLight(0xd7edf2, 0x304b44, 2.3);
  hemisphere.name = 'RELAY_DAYLIGHT_HEMISPHERE';
  markRenderOnly(hemisphere, 'environment_light');
  parent.add(hemisphere);
  lightCount += 1;
  const sun = new THREE.DirectionalLight(0xffe6bf, 2.35);
  sun.name = 'RELAY_DAYLIGHT_SUN';
  sun.position.set(-34, 48, 24);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1_024, 1_024);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.camera.left = -58;
  sun.shadow.camera.right = 58;
  sun.shadow.camera.top = 48;
  sun.shadow.camera.bottom = -48;
  sun.shadow.bias = -0.00015;
  markRenderOnly(sun, 'environment_light');
  parent.add(sun);
  lightCount += 1;
  const skyFill = new THREE.DirectionalLight(0x79b8ce, 1.35);
  skyFill.name = 'RELAY_DAYLIGHT_FILL';
  skyFill.position.set(26, 20, -30);
  markRenderOnly(skyFill, 'environment_light');
  parent.add(skyFill);
  lightCount += 1;
  const arrayGlow = new THREE.PointLight(0x71e0db, 1.25, 20, 1.85);
  arrayGlow.name = 'RELAY_ARRAY_SIGNAL_LIGHT';
  arrayGlow.position.set(0, 11.4, -27);
  markRenderOnly(arrayGlow, 'route_readability_light');
  parent.add(arrayGlow);
  lightCount += 1;

  for (const [index, x] of [-18, -14, -10, -6, 6, 10, 14, 18].entries()) {
    const centerLaneSegment = add(
      new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.025, 0.1), signal),
      `RELAY_CENTER_LANE_SIGNAL_SEGMENT_${index + 1}`,
      'route_readability_inlay',
    );
    centerLaneSegment.position.set(x, 0.025, 0);
  }
  const centerNode = add(
    new THREE.Mesh(new THREE.RingGeometry(2.25, 2.48, 32), signal),
    'RELAY_CENTER_NODE_SIGNAL_INLAY',
    'route_readability_inlay',
  );
  centerNode.rotation.x = -Math.PI / 2;
  centerNode.position.set(0, 0.03, 0);
  const upperBridgeTrim = add(
    new THREE.Mesh(new THREE.BoxGeometry(11, 0.035, 0.12), signal),
    'RELAY_UPPER_BRIDGE_SIGNAL_INLAY',
    'route_readability_inlay',
  );
  upperBridgeTrim.position.set(0, 3.96, -10);
  const lowerCourtTrim = add(
    new THREE.Mesh(new THREE.BoxGeometry(24, 0.035, 0.12), signal),
    'RELAY_LOWER_COURT_SIGNAL_INLAY',
    'route_readability_inlay',
  );
  lowerCourtTrim.position.set(0, -2.97, 17);

  for (const [side, color] of [[-1, 0x61d6e1], [1, 0xf2a054]] as const) {
    const spawnSignal = standardMaterial(
      side < 0 ? 'RELAY_WEST_SPAWN_INLAY' : 'RELAY_EAST_SPAWN_INLAY',
      color,
      {
        emissive: color,
        emissiveIntensity: 0.75,
        metalness: 0.08,
        roughness: 0.38,
      },
    );
    const spawnFrame = add(
      new THREE.Mesh(new THREE.RingGeometry(2.4, 2.62, 4), spawnSignal),
      side < 0 ? 'RELAY_WEST_SPAWN_FRAME' : 'RELAY_EAST_SPAWN_FRAME',
      'spawn_readability_inlay',
    );
    spawnFrame.rotation.x = -Math.PI / 2;
    spawnFrame.rotation.z = Math.PI / 4;
    spawnFrame.position.set(side * 29, 0.032, 0);
  }

  const island = add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(58, 66, 9, 12, 1, false),
      terrain,
    ),
    'RELAY_SUSPENDED_RIDGE_BASE',
    'distant_environment',
  );
  island.position.set(0, -8.2, 0);

  const ridgeDefinitions = Object.freeze([
    [-62, -8, -36, 18, 17, 15],
    [-38, -10, -62, 22, 21, 18],
    [2, -12, -72, 29, 25, 20],
    [42, -9, -58, 23, 19, 18],
    [67, -10, -24, 20, 18, 16],
    [68, -12, 39, 26, 22, 19],
    [24, -11, 71, 24, 18, 21],
    [-28, -10, 70, 28, 20, 19],
    [-69, -11, 34, 23, 18, 17],
  ] as const);
  ridgeDefinitions.forEach((definition, index) => {
    const ridge = add(
      new THREE.Mesh(
        new THREE.DodecahedronGeometry(1, 1),
        index % 2 === 0 ? terrain : terrainLight,
      ),
      `RELAY_DISTANCE_RIDGE_${index + 1}`,
      'distant_environment',
    );
    ridge.position.set(definition[0], definition[1], definition[2]);
    ridge.scale.set(definition[3], definition[4], definition[5]);
    ridge.rotation.set(0.12 * (index % 3), index * 0.47, -0.06 * (index % 2));
  });

  const outerRing = add(
    new THREE.Mesh(
      new THREE.TorusGeometry(3.35, 0.14, 10, 56),
      paleCeramic,
    ),
    'RELAY_ARRAY_OUTER_RING',
  );
  outerRing.position.set(0, 11.4, -27);
  const innerRing = add(
    new THREE.Mesh(
      new THREE.TorusGeometry(2.45, 0.08, 8, 48),
      signal,
    ),
    'RELAY_ARRAY_SIGNAL_RING',
  );
  innerRing.position.copy(outerRing.position);

  // The array faces the playable court and sits behind the overlook portal.
  // Earlier revisions turned the ring edge-on and ran three dark masts through
  // the arrival view, which read as floating cables/spikes. Two outboard
  // supports and one crossbeam now form a legible, continuous assembly.
  for (const [index, x] of [-4.15, 4.15].entries()) {
    const pylon = add(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.52, 7.2, 10),
        darkMetal,
      ),
      `RELAY_ARRAY_PYLON_${index + 1}`,
    );
    pylon.position.set(x, 7.05, -26.55);
    pylon.rotation.z = x < 0 ? -0.1 : 0.1;
  }
  const crossbeam = add(
    new THREE.Mesh(
      new THREE.BoxGeometry(8.8, 0.42, 0.5),
      darkMetal,
    ),
    'RELAY_ARRAY_CROSSBEAM',
  );
  crossbeam.position.set(0, 10.2, -26.55);
  const base = add(
    new THREE.Mesh(
      new THREE.BoxGeometry(10.2, 0.46, 1.6),
      darkMetal,
    ),
    'RELAY_ARRAY_OUTBOARD_BASE',
  );
  base.position.set(0, 3.98, -26.55);
  const hub = add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(1.12, 1.12, 0.42, 24),
      darkMetal,
    ),
    'RELAY_ARRAY_SIGNAL_HUB',
  );
  hub.position.copy(outerRing.position);
  hub.rotation.x = Math.PI / 2;
  for (const side of [-1, 1] as const) {
    const lens = add(
      new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.64, 0.34, 24), signal),
      side < 0
        ? 'RELAY_ARRAY_SIGNAL_LENS_WEST'
        : 'RELAY_ARRAY_SIGNAL_LENS_EAST',
    );
    lens.position.set(side * 0.62, 11.4, -26.98);
    lens.rotation.x = Math.PI / 2;
  }

  for (const [index, rotationZ] of [0, Math.PI / 3, -Math.PI / 3].entries()) {
    const spoke = add(
      new THREE.Mesh(new THREE.BoxGeometry(0.14, 4.8, 0.12), darkMetal),
      `RELAY_ARRAY_HUB_SPOKE_${index + 1}`,
    );
    spoke.position.copy(outerRing.position);
    spoke.rotation.z = rotationZ;
  }

  for (const [side, color] of [[-1, 0x61d6e1], [1, 0xf2a054]] as const) {
    const beacon = add(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.38, 9.2, 10),
        darkMetal,
      ),
      side < 0 ? 'RELAY_WEST_BEACON_MAST' : 'RELAY_EAST_BEACON_MAST',
    );
    beacon.position.set(side * 31.5, 4.1, 0);
    const capMaterial = standardMaterial(
      side < 0 ? 'RELAY_WEST_BEACON_SIGNAL' : 'RELAY_EAST_BEACON_SIGNAL',
      color,
      {
        emissive: color,
        emissiveIntensity: 1.4,
        metalness: 0.08,
        roughness: 0.3,
      },
    );
    const cap = add(
      new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 1), capMaterial),
      side < 0 ? 'RELAY_WEST_BEACON_CAP' : 'RELAY_EAST_BEACON_CAP',
    );
    cap.position.set(side * 31.5, 9, 0);
    const light = new THREE.PointLight(color, 3.2, 22, 1.7);
    light.name = side < 0 ? 'RELAY_WEST_BEACON_LIGHT' : 'RELAY_EAST_BEACON_LIGHT';
    light.position.copy(cap.position);
    markRenderOnly(light, 'route_readability_light');
    parent.add(light);
    lightCount += 1;
  }

  return Object.freeze({ meshCount, lightCount });
}

/**
 * Builds Relay's original render-only candidate around the current proven
 * authority fixture. This is intentionally a presentation migration, not a
 * false claim that Relay already owns a distinct collision/spawn package.
 */
export function createRelayVisualContinuity(
  fixture: PhysicsFixtureV1,
): RelayVisualContinuity {
  const ownsAuthorityFixture = fixture.id === 'relay_map_collision';
  const authorityCompatibility = ownsAuthorityFixture
    ? RELAY_AUTHORITY_COMPATIBILITY
    : RELAY_LEGACY_AUTHORITY_COMPATIBILITY;
  const authoritySourceMapId = ownsAuthorityFixture
    ? 'relay'
    : 'inkfall_foundry';
  const group = new THREE.Group();
  group.name = 'RELAY_OPEN_SKY_RENDER_ONLY_VISUAL_CANDIDATE';
  markRenderOnly(group, 'relay_visual_candidate_root');
  group.userData.displayName = RELAY_DISPLAY_NAME;
  group.userData.authorityFixtureId = fixture.id;
  group.userData.authorityColliderCountAtBuild = fixture.solids.length;
  group.userData.authorityFixtureUnchanged = true;
  group.userData.authoritySourceMapId = authoritySourceMapId;
  group.userData.humanAccepted = false;
  group.userData.releaseEligible = false;

  const colliderVisuals = new THREE.Group();
  colliderVisuals.name = 'RELAY_AUTHORITY_ALIGNED_VISUALS';
  markRenderOnly(colliderVisuals, 'authority_aligned_visual_group');
  group.add(colliderVisuals);
  const colliderFacts = createColliderInstances(fixture, colliderVisuals);

  const environment = new THREE.Group();
  environment.name = 'RELAY_ORIGINAL_ENVIRONMENT';
  markRenderOnly(environment, 'original_environment_group');
  group.add(environment);
  const skyMeshCount = createSkyEnvironment(environment);
  const landmarkFacts = createRelayLandmarks(environment);
  const architectureFacts = createRelayArchitectureSkin(
    RELAY_VISUAL_CONTINUITY_VERSION,
  );
  environment.add(architectureFacts.group);
  const meshCount = colliderFacts.meshCount
    + skyMeshCount
    + landmarkFacts.meshCount
    + architectureFacts.meshCount;

  group.userData.meshCount = meshCount;
  group.userData.lightCount = landmarkFacts.lightCount
    + architectureFacts.lightCount;
  group.userData.colliderInstanceCount = colliderFacts.colliderInstanceCount;
  group.userData.waypointInlayCount = colliderFacts.waypointInlayCount;
  group.userData.landmarkMeshCount = landmarkFacts.meshCount
    + architectureFacts.meshCount
    + skyMeshCount;
  group.traverse((object) => {
    object.userData.authorityCompatibility = authorityCompatibility;
  });
  group.userData.authorityContract = Object.freeze({
    fixtureUnmodified: true,
    authorityCompatibilityOnly: !ownsAuthorityFixture,
    renderMeshesMayBeAuthority: false,
    noHit: true,
    expectedAuthorityColliderCount: fixture.solids.length,
    candidateRequiresHumanAcceptance: true,
  });

  return Object.freeze({
    group,
    meshCount,
    lightCount: landmarkFacts.lightCount + architectureFacts.lightCount,
    colliderInstanceCount: colliderFacts.colliderInstanceCount,
    waypointInlayCount: colliderFacts.waypointInlayCount,
    landmarkMeshCount: landmarkFacts.meshCount
      + architectureFacts.meshCount
      + skyMeshCount,
    authorityFixtureUnchanged: true,
    humanAccepted: false,
  });
}
