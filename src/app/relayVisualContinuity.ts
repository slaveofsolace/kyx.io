import * as THREE from 'three';

import type {
  FixtureSolidV1,
  PhysicsFixtureV1,
} from '../physics/fixtureSchema';
import { createRelayArchitectureSkin } from './relayArchitectureSkin';

export const RELAY_DISPLAY_NAME = 'Relay' as const;
export const RELAY_VISUAL_CONTINUITY_VERSION =
  'relay_open_sky_visual_candidate_v5' as const;
export const RELAY_AUTHORITY_COMPATIBILITY =
  'relay_revision_1_authority_candidate' as const;
export const RELAY_LEGACY_AUTHORITY_COMPATIBILITY =
  'inkfall_revision_4_fixture_temporary' as const;
export const RELAY_OPEN_SKY_V5_RENDER_BUDGET = Object.freeze({
  maximumMeshObjects: 96,
  maximumEstimatedDrawCalls: 96,
  maximumRealtimeLights: 8,
  portalPresentationDrawCallsOutsideBaseBudget: 10,
});
export const RELAY_OPEN_SKY_V5_LIGHTING_LIMITS = Object.freeze({
  maximumRouteSignalEmissiveIntensity: 0.3,
  maximumLocalPointLightIntensity: 0.55,
  maximumLocalPointLightRangeMeters: 14,
  surfaceInlayLiftMeters: 0.006,
});
export const RELAY_OPEN_SKY_V5_PLAYER_EYE_HIERARCHY = Object.freeze({
  primaryNorthLandmark: 'RELAY_CAMPUS_CROWN_STRUCTURAL_YOKE',
  centerDecisionLandmark: 'RELAY_CENTER_NODE_SIGNAL_INLAY',
  lowerServiceLandmark: 'RELAY_V5_LOWER_SERVICE_PIPE_BANK',
  westSpawnLandmark: 'RELAY_V5_WEST_SPAWN_EXIT_CODES',
  eastSpawnLandmark: 'RELAY_V5_EAST_SPAWN_EXIT_CODES',
  occupancyReviewTargets: Object.freeze([2, 4, 8] as const),
});

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
  readonly estimatedDrawCalls: number;
  readonly withinRenderBudget: boolean;
  readonly authorityFixtureUnchanged: true;
  readonly humanAccepted: false;
}

const WAYPOINT_ID = /_waypoint_/u;
const SPAWN_SURFACE_ID = /(?:spawn_pad|spawn_pocket_floor|node_(?:east|west)_spawn)/u;
const TRAVERSAL_SURFACE_ID =
  /(?:^|_)(?:floor|route|node|jump_pad|landing|bridge|ramp|stair|step|walk|deck|platform)(?:_|$)/u;
const EDGE_ID =
  /(?:guard_rail|door_frame|wall|boundary|barrier|sight_blocker|jump_guard|playable_guard)/u;
const COVER_ID = /(?:module_|full_cover|half_cover|reactor|slide_gate|baffle)/u;
const STRUCTURAL_SUPPORT_ID = /(?:support|pier|column|foundation|undercroft|keel)/u;

const SCENE_POSITION = new THREE.Vector3();
const SCENE_SCALE = new THREE.Vector3();
const SCENE_ROTATION = new THREE.Euler(0, 0, 0, 'YXZ');
const SCENE_QUATERNION = new THREE.Quaternion();
const SCENE_MATRIX = new THREE.Matrix4();
const LOCAL_UP_OFFSET = new THREE.Vector3();
const RELAY_GAP_HAZARD_WIDTH_METERS = 0.055;

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

type RelaySurfacePattern =
  | 'deck_strake'
  | 'edge_louver'
  | 'cover_chevron'
  | 'structure_brushed'
  | 'spawn_field'
  | 'service_grate';

function relayPanelTexture(
  name: string,
  channel: 'color' | 'roughness' | 'height',
  pattern: RelaySurfacePattern,
): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const deckSeam = y % 16 <= 1;
      const deckBreak = x % 32 <= 1 && y % 32 > 7 && y % 32 < 25;
      const louverSeam = y % 8 <= 1;
      const chevronA = Math.abs(((x + y) % 32) - 16) <= 1;
      const chevronB = Math.abs(((x - y + 64) % 32) - 16) <= 1;
      const brushSeam = x % 23 === 0 && y % 16 > 3;
      const spawnFrame = x < 2 || x > 61 || y === 15 || y === 47;
      const grateSeam = x % 10 <= 1;
      const seam = pattern === 'deck_strake'
        ? deckSeam
        : pattern === 'edge_louver'
          ? louverSeam
          : pattern === 'cover_chevron'
            ? chevronA || chevronB
            : pattern === 'structure_brushed'
              ? brushSeam
              : pattern === 'spawn_field'
                ? spawnFrame
                : grateSeam;
      const secondary = pattern === 'deck_strake'
        ? deckBreak
        : pattern === 'edge_louver'
          ? x % 31 === 0
          : pattern === 'cover_chevron'
            ? y === 31 || y === 32
            : pattern === 'structure_brushed'
              ? y % 29 === 0
              : pattern === 'spawn_field'
                ? x === 31 || x === 32
                : y % 24 <= 1;
      const fastener = pattern !== 'structure_brushed' && (
        ((x - 5) ** 2 + (y - 5) ** 2 <= 2)
        || ((x - 58) ** 2 + (y - 58) ** 2 <= 2)
      );
      const grain = ((x * 19 + y * 37 + (x ^ y) * 11) % 19) - 9;
      let value: number;
      if (channel === 'color') {
        value = seam ? 112 : secondary ? 158 : fastener ? 86 : 218 + grain;
      } else if (channel === 'roughness') {
        value = seam ? 228 : secondary ? 204 : fastener ? 108 : 168 + grain * 2;
      } else {
        value = seam ? 82 : secondary ? 124 : fastener ? 220 : 176 + grain;
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

function createRelayPanelMaps(
  name: string,
  repeatX: number,
  repeatY: number,
  pattern: RelaySurfacePattern,
): RelayPanelMaps {
  const configure = (texture: THREE.DataTexture): THREE.DataTexture => {
    texture.repeat.set(repeatX, repeatY);
    texture.needsUpdate = true;
    return texture;
  };
  return Object.freeze({
    color: configure(relayPanelTexture(`${name}_ALBEDO`, 'color', pattern)),
    roughness: configure(relayPanelTexture(`${name}_ROUGHNESS`, 'roughness', pattern)),
    height: configure(relayPanelTexture(`${name}_HEIGHT`, 'height', pattern)),
  });
}

function panelMaterial(
  name: string,
  color: number,
  repeat: readonly [number, number],
  pattern: RelaySurfacePattern,
  options: Readonly<{
    emissive?: number;
    emissiveIntensity?: number;
    metalness?: number;
    roughness?: number;
    bumpScale?: number;
  }> = {},
): THREE.MeshStandardMaterial {
  const maps = createRelayPanelMaps(name, repeat[0], repeat[1], pattern);
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
  if (EDGE_ID.test(solid.id)) return 'edge';
  if (COVER_ID.test(solid.id)) return 'cover';
  if (STRUCTURAL_SUPPORT_ID.test(solid.id)) return 'structure';
  if (TRAVERSAL_SURFACE_ID.test(solid.id)) {
    const topSurfaceMm = solid.shape.type === 'box'
      ? solid.centerMm.y + solid.shape.halfExtentsMm.y
      : solid.centerMm.y;
    if (topSurfaceMm > 3_000) return 'deck_upper';
    if (topSurfaceMm < -1_000) return 'deck_lower';
    return 'deck_mid';
  }
  return 'structure';
}

function solidQuaternion(solid: FixtureSolidV1): THREE.Quaternion {
  // Authority Euler rotations use ZYX composition. Reflecting authority +Z
  // into Three -Z negates the quaternion's X/Y components, not its Z roll.
  SCENE_ROTATION.set(
    solid.rotationMilliDegrees.x * Math.PI / 180_000,
    solid.rotationMilliDegrees.y * Math.PI / 180_000,
    solid.rotationMilliDegrees.z * Math.PI / 180_000,
    'ZYX',
  );
  SCENE_QUATERNION.setFromEuler(SCENE_ROTATION);
  SCENE_QUATERNION.x *= -1;
  SCENE_QUATERNION.y *= -1;
  return SCENE_QUATERNION;
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
    deck_upper: panelMaterial('RELAY_CERAMIC_UPPER_DECK', 0x8f9e98, [2, 3], 'deck_strake', {
      emissive: 0x243531,
      emissiveIntensity: 0.12,
      metalness: 0.16,
      roughness: 0.68,
    }),
    deck_mid: panelMaterial('RELAY_GRAPHITE_MID_DECK', 0x526e70, [3, 3], 'deck_strake', {
      emissive: 0x284347,
      emissiveIntensity: 0.28,
      metalness: 0.24,
      roughness: 0.62,
    }),
    deck_lower: panelMaterial('RELAY_SERVICE_LOWER_DECK', 0x334743, [4, 2], 'service_grate', {
      metalness: 0.26,
      roughness: 0.72,
    }),
    edge: panelMaterial('RELAY_CERAMIC_EDGE', 0x778984, [2, 4], 'edge_louver', {
      metalness: 0.16,
      roughness: 0.68,
    }),
    cover: panelMaterial('RELAY_COMPOSITE_COVER', 0x455e61, [1, 1], 'cover_chevron', {
      metalness: 0.26,
      roughness: 0.58,
    }),
    structure: panelMaterial('RELAY_DARK_STRUCTURE', 0x263c42, [2, 3], 'structure_brushed', {
      metalness: 0.46,
      roughness: 0.52,
    }),
    spawn_west: panelMaterial('RELAY_WEST_SPAWN_CYAN', 0x31565b, [2, 2], 'spawn_field', {
      emissive: 0x0b2c30,
      emissiveIntensity: 0.1,
      metalness: 0.24,
      roughness: 0.54,
    }),
    spawn_east: panelMaterial('RELAY_EAST_SPAWN_AMBER', 0x654b3b, [2, 2], 'spawn_field', {
      emissive: 0x352116,
      emissiveIntensity: 0.1,
      metalness: 0.24,
      roughness: 0.54,
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

  const westConnector = fixture.solids.find(
    ({ id }) => id === 'relay_floor_west_connector',
  );
  const eastConnector = fixture.solids.find(
    ({ id }) => id === 'relay_floor_east_connector',
  );
  const centralCourt = fixture.solids.find(
    ({ id }) => id === 'relay_floor_central_court',
  );
  const gapAnchorCount = [westConnector, eastConnector, centralCourt].filter(
    (solid) => solid !== undefined,
  ).length;
  if (gapAnchorCount !== 0 && gapAnchorCount !== 3) {
    throw new Error('RELAY_CONNECTOR_GAP_ANCHOR_INCOMPLETE');
  }
  if (
    westConnector !== undefined
    && eastConnector !== undefined
    && centralCourt !== undefined
  ) {
    if (
      westConnector.shape.type !== 'box'
      || eastConnector.shape.type !== 'box'
      || centralCourt.shape.type !== 'box'
    ) {
      throw new Error('RELAY_CONNECTOR_GAP_ANCHOR_NOT_BOX');
    }
    const courtHalf = centralCourt.shape.halfExtentsMm;
    const westConnectorHalf = westConnector.shape.halfExtentsMm;
    const eastConnectorHalf = eastConnector.shape.halfExtentsMm;
    const courtSouthEdgeZmm = centralCourt.centerMm.z - courtHalf.z;
    const courtTopYmm = centralCourt.centerMm.y + courtHalf.y;
    const hazardMaterial = standardMaterial(
      'RELAY_CONNECTOR_GAP_HAZARD_AMBER',
      0xf0ae55,
      {
        emissive: 0x6a3113,
        emissiveIntensity: 0.24,
        metalness: 0.12,
        roughness: 0.5,
      },
    );
    const hazardLiftMeters =
      RELAY_OPEN_SKY_V5_LIGHTING_LIMITS.surfaceInlayLiftMeters;
    for (const definition of [
      {
        side: -1,
        sideName: 'WEST',
        connector: westConnector,
        connectorHalf: westConnectorHalf,
      },
      {
        side: 1,
        sideName: 'EAST',
        connector: eastConnector,
        connectorHalf: eastConnectorHalf,
      },
    ] as const) {
      const connectorHalf = definition.connectorHalf;
      const sharedEdgeXmm = definition.connector.centerMm.x
        - definition.side * connectorHalf.x;
      const courtEdgeXmm = centralCourt.centerMm.x
        + definition.side * courtHalf.x;
      const connectorSouthEdgeZmm = definition.connector.centerMm.z
        - connectorHalf.z;
      const connectorTopYmm = definition.connector.centerMm.y
        + connectorHalf.y;
      if (
        sharedEdgeXmm !== courtEdgeXmm
        || connectorTopYmm !== courtTopYmm
        || courtSouthEdgeZmm >= connectorSouthEdgeZmm
      ) {
        throw new Error(`RELAY_${definition.sideName}_CONNECTOR_GAP_ANCHOR_MISMATCH`);
      }

      const hazard = new THREE.InstancedMesh(unitBox, hazardMaterial, 2);
      hazard.name =
        `RELAY_${definition.sideName}_CONNECTOR_COURT_GAP_HAZARD_INLAYS`;
      hazard.castShadow = false;
      hazard.receiveShadow = false;
      hazard.userData.instanceNames = Object.freeze([
        `RELAY_${definition.sideName}_CONNECTOR_SOUTH_HAZARD_LIP`,
        `RELAY_CENTRAL_COURT_${definition.sideName}_SOUTH_HAZARD_LIP`,
      ]);
      hazard.userData.authorityAlignmentColliderIds = Object.freeze([
        definition.connector.id,
        centralCourt.id,
      ]);
      hazard.userData.visualOnlySurfaceInlay = true;
      hazard.userData.fakeTraversableSurfaceCount = 0;
      hazard.userData.hazardMeaning = 'drop_boundary_not_walkable';
      markRenderOnly(hazard, 'authority_gap_hazard_inlay');

      const connectorSceneSouthEdgeMeters = -connectorSouthEdgeZmm / 1_000;
      SCENE_POSITION.set(
        definition.connector.centerMm.x / 1_000,
        connectorTopYmm / 1_000 + hazardLiftMeters,
        connectorSceneSouthEdgeMeters - RELAY_GAP_HAZARD_WIDTH_METERS / 2,
      );
      SCENE_SCALE.set(
        connectorHalf.x * 2 / 1_000,
        0.008,
        RELAY_GAP_HAZARD_WIDTH_METERS,
      );
      SCENE_MATRIX.compose(
        SCENE_POSITION,
        SCENE_QUATERNION.identity(),
        SCENE_SCALE,
      );
      hazard.setMatrixAt(0, SCENE_MATRIX);

      SCENE_POSITION.set(
        sharedEdgeXmm / 1_000
          - definition.side * RELAY_GAP_HAZARD_WIDTH_METERS / 2,
        courtTopYmm / 1_000 + hazardLiftMeters,
        -(connectorSouthEdgeZmm + courtSouthEdgeZmm) / 2_000,
      );
      SCENE_SCALE.set(
        RELAY_GAP_HAZARD_WIDTH_METERS,
        0.008,
        (connectorSouthEdgeZmm - courtSouthEdgeZmm) / 1_000,
      );
      SCENE_MATRIX.compose(
        SCENE_POSITION,
        SCENE_QUATERNION.identity(),
        SCENE_SCALE,
      );
      hazard.setMatrixAt(1, SCENE_MATRIX);
      hazard.instanceMatrix.needsUpdate = true;
      hazard.computeBoundingBox();
      hazard.computeBoundingSphere();
      parent.add(hazard);
      meshCount += 1;
    }
  }

  if (waypoints.length > 0) {
    const waypointMaterial = standardMaterial(
      'RELAY_NAVIGATION_INLAY',
      0x98e6df,
      {
        emissive: 0x258f89,
        emissiveIntensity:
          RELAY_OPEN_SKY_V5_LIGHTING_LIMITS.maximumRouteSignalEmissiveIntensity,
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
      LOCAL_UP_OFFSET.set(
        0,
        half.y / 1_000
          + RELAY_OPEN_SKY_V5_LIGHTING_LIMITS.surfaceInlayLiftMeters,
        0,
      )
        .applyQuaternion(quaternion);
      position.add(LOCAL_UP_OFFSET);
      SCENE_SCALE.set(
        half.x * 1.35 / 1_000,
        0.008,
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
      zenithColor: { value: new THREE.Color(0x123456) },
      upperColor: { value: new THREE.Color(0x4b7898) },
      horizonColor: { value: new THREE.Color(0xf0c9a6) },
      lowerColor: { value: new THREE.Color(0x70858d) },
      sunColor: { value: new THREE.Color(0xffc481) },
      sunDirection: {
        value: new THREE.Vector3(-0.56, 0.42, 0.72).normalize(),
      },
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
      uniform vec3 zenithColor;
      uniform vec3 upperColor;
      uniform vec3 horizonColor;
      uniform vec3 lowerColor;
      uniform vec3 sunColor;
      uniform vec3 sunDirection;
      varying vec3 vWorldDirection;
      void main() {
        vec3 direction = normalize(vWorldDirection);
        float elevation = direction.y;
        float horizonRise = smoothstep(-0.14, 0.28, elevation);
        vec3 color = mix(lowerColor, horizonColor, horizonRise);
        color = mix(color, upperColor, smoothstep(0.03, 0.68, elevation));
        color = mix(color, zenithColor, smoothstep(0.58, 0.97, elevation));

        float horizonHaze = 1.0 - smoothstep(0.0, 0.22, abs(elevation - 0.015));
        color = mix(color, horizonColor, horizonHaze * 0.24);

        float sunFacing = max(dot(direction, sunDirection), 0.0);
        float sunHalo = pow(sunFacing, 34.0) * 0.34;
        float sunDisc = pow(sunFacing, 720.0) * 1.25;
        color += sunColor * (sunHalo + sunDisc);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  skyMaterial.name = 'RELAY_V5_LAYERED_DAYLIGHT_SKY';
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(126, 48, 24),
    skyMaterial,
  );
  sky.name = 'RELAY_OPEN_SKY';
  sky.renderOrder = -100;
  markRenderOnly(sky, 'distant_environment');
  sky.userData.skyModel = 'layered_high_altitude_sun_haze_v5';
  sky.userData.depthHierarchy = Object.freeze([
    'warm_horizon',
    'cool_upper_air',
    'deep_blue_zenith',
  ]);
  sky.userData.humanReviewRequired = true;
  parent.add(sky);
  return 1;
}

function createRidgeBandGeometry(
  radius: number,
  thickness: number,
  baseY: number,
  amplitude: number,
  phase: number,
): THREE.BufferGeometry {
  const segments = 72;
  const positions: number[] = [];
  const point = (valueRadius: number, valueY: number, angle: number) => (
    new THREE.Vector3(
      Math.cos(angle) * valueRadius,
      valueY,
      Math.sin(angle) * valueRadius,
    )
  );
  const height = (angle: number): number => baseY + amplitude * (
    0.72
    + Math.sin(angle * 3 + phase) * 0.17
    + Math.sin(angle * 7 - phase * 0.63) * 0.1
    + Math.sin(angle * 13 + phase * 1.31) * 0.055
  );
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  };
  for (let index = 0; index < segments; index += 1) {
    const angleA = index / segments * Math.PI * 2;
    const angleB = (index + 1) / segments * Math.PI * 2;
    const innerTopA = point(radius, height(angleA), angleA);
    const innerTopB = point(radius, height(angleB), angleB);
    const innerBaseA = point(radius, baseY, angleA);
    const innerBaseB = point(radius, baseY, angleB);
    const outerTopA = point(radius + thickness, height(angleA) - 2.1, angleA);
    const outerTopB = point(radius + thickness, height(angleB) - 2.1, angleB);
    triangle(innerBaseA, innerTopB, innerTopA);
    triangle(innerBaseA, innerBaseB, innerTopB);
    triangle(innerTopA, innerTopB, outerTopB);
    triangle(innerTopA, outerTopB, outerTopA);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function createRelayLandmarks(parent: THREE.Group): Readonly<{
  meshCount: number;
  lightCount: number;
}> {
  const paleCeramic = standardMaterial('RELAY_V5_LANDMARK_CERAMIC', 0xa5b2aa, {
    metalness: 0.12,
    roughness: 0.66,
  });
  const darkMetal = standardMaterial('RELAY_V5_LANDMARK_DARK_METAL', 0x122731, {
    metalness: 0.7,
    roughness: 0.36,
  });
  const signal = standardMaterial('RELAY_V5_SIGNAL_EMISSIVE', 0x4faeb1, {
    emissive: 0x135c60,
    emissiveIntensity:
      RELAY_OPEN_SKY_V5_LIGHTING_LIMITS.maximumRouteSignalEmissiveIntensity,
    metalness: 0.18,
    roughness: 0.4,
  });
  const terrain = standardMaterial('RELAY_V5_NEAR_RIDGE', 0x263e48, {
    metalness: 0,
    roughness: 1,
  });
  const terrainLight = standardMaterial('RELAY_V5_MIDDLE_RIDGE', 0x425c67, {
    metalness: 0,
    roughness: 1,
  });
  const terrainFar = standardMaterial('RELAY_V5_FAR_RIDGE', 0x71838c, {
    metalness: 0,
    roughness: 1,
  });
  for (const ridgeMaterial of [terrain, terrainLight, terrainFar]) {
    ridgeMaterial.side = THREE.DoubleSide;
    ridgeMaterial.flatShading = true;
    ridgeMaterial.needsUpdate = true;
  }
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

  const hemisphere = new THREE.HemisphereLight(0xc5dce7, 0x273941, 1.55);
  hemisphere.name = 'RELAY_DAYLIGHT_HEMISPHERE';
  markRenderOnly(hemisphere, 'environment_light');
  parent.add(hemisphere);
  lightCount += 1;
  const sun = new THREE.DirectionalLight(0xffd7a3, 2.7);
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
  const skyFill = new THREE.DirectionalLight(0x709caf, 0.62);
  skyFill.name = 'RELAY_DAYLIGHT_FILL';
  skyFill.position.set(26, 20, -30);
  markRenderOnly(skyFill, 'environment_light');
  parent.add(skyFill);
  lightCount += 1;
  const arrayGlow = new THREE.PointLight(
    0x71d0d1,
    RELAY_OPEN_SKY_V5_LIGHTING_LIMITS.maximumLocalPointLightIntensity,
    RELAY_OPEN_SKY_V5_LIGHTING_LIMITS.maximumLocalPointLightRangeMeters,
    2.1,
  );
  arrayGlow.name = 'RELAY_CAMPUS_CROWN_SIGNAL_LIGHT';
  arrayGlow.position.set(0, 10.2, -26.7);
  markRenderOnly(arrayGlow, 'route_readability_light');
  parent.add(arrayGlow);
  lightCount += 1;

  const centerLanePositions = [-18, -14, -10, -6, 6, 10, 14, 18] as const;
  const centerLane = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.35, 0.008, 0.06),
    signal,
    centerLanePositions.length,
  );
  centerLane.name = 'RELAY_V5_CENTER_LANE_SIGNAL_DASHES';
  centerLane.castShadow = false;
  centerLane.receiveShadow = false;
  centerLane.userData.instanceNames = Object.freeze(
    centerLanePositions.map((_x, index) => `RELAY_CENTER_LANE_DASH_${index + 1}`),
  );
  centerLanePositions.forEach((x, index) => {
    SCENE_MATRIX.makeTranslation(
      x,
      RELAY_OPEN_SKY_V5_LIGHTING_LIMITS.surfaceInlayLiftMeters,
      0,
    );
    centerLane.setMatrixAt(index, SCENE_MATRIX);
  });
  centerLane.instanceMatrix.needsUpdate = true;
  centerLane.computeBoundingBox();
  centerLane.computeBoundingSphere();
  markRenderOnly(centerLane, 'route_readability_inlay');
  parent.add(centerLane);
  meshCount += 1;
  const centerNode = add(
    new THREE.Mesh(new THREE.RingGeometry(2.28, 2.43, 32), signal),
    'RELAY_CENTER_NODE_SIGNAL_INLAY',
    'route_readability_inlay',
  );
  centerNode.rotation.x = -Math.PI / 2;
  centerNode.position.set(
    0,
    RELAY_OPEN_SKY_V5_LIGHTING_LIMITS.surfaceInlayLiftMeters,
    0,
  );
  const upperBridgeTrim = add(
    new THREE.Mesh(new THREE.BoxGeometry(10.8, 0.008, 0.06), signal),
    'RELAY_UPPER_BRIDGE_SIGNAL_INLAY',
    'route_readability_inlay',
  );
  upperBridgeTrim.position.set(0, 3.936, -10);
  const lowerCourtTrim = add(
    new THREE.Mesh(new THREE.BoxGeometry(20, 0.008, 0.06), signal),
    'RELAY_LOWER_COURT_SIGNAL_INLAY',
    'route_readability_inlay',
  );
  lowerCourtTrim.position.set(0, -2.994, 17);

  for (const [side, color] of [[-1, 0x61d6e1], [1, 0xf2a054]] as const) {
    const spawnSignal = standardMaterial(
      side < 0 ? 'RELAY_WEST_SPAWN_INLAY' : 'RELAY_EAST_SPAWN_INLAY',
      color,
      {
        emissive: color,
        emissiveIntensity: 0.22,
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
    spawnFrame.position.set(
      side * 29,
      RELAY_OPEN_SKY_V5_LIGHTING_LIMITS.surfaceInlayLiftMeters,
      0,
    );
  }

  const foundationHull = add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(57, 63, 7, 16, 1, false),
      terrain,
    ),
    'RELAY_CAMPUS_FOUNDATION_HULL',
    'distant_environment',
  );
  foundationHull.position.set(0, -6.55, 0);
  const foundationUndercroft = add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(49, 57, 3.6, 16, 1, false),
      darkMetal,
    ),
    'RELAY_CAMPUS_FOUNDATION_UNDERCROFT',
    'distant_environment',
  );
  foundationUndercroft.position.set(0, -11.7, 0);
  const foundationKeel = add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(18, 34, 7, 12, 1, false),
      darkMetal,
    ),
    'RELAY_CAMPUS_FOUNDATION_KEEL',
    'distant_environment',
  );
  foundationKeel.position.set(0, -16.8, 0);

  const ridgeDefinitions = Object.freeze([
    { name: 'NEAR', radius: 72, thickness: 7, baseY: -11, amplitude: 20, phase: 0.4, material: terrain },
    { name: 'MIDDLE', radius: 91, thickness: 8, baseY: -13, amplitude: 26, phase: 2.1, material: terrainLight },
    { name: 'FAR', radius: 109, thickness: 8, baseY: -16, amplitude: 34, phase: 4.6, material: terrainFar },
  ] as const);
  ridgeDefinitions.forEach((definition) => {
    add(
      new THREE.Mesh(
        createRidgeBandGeometry(
          definition.radius,
          definition.thickness,
          definition.baseY,
          definition.amplitude,
          definition.phase,
        ),
        definition.material,
      ),
      `RELAY_DISTANCE_RIDGE_BAND_${definition.name}`,
      'distant_environment',
    );
  });

  // The campus crown is a continuous load path anchored behind the overlook:
  // an outboard plinth and wall tie feed two pylons, a curved yoke, and one
  // suspended lens. It replaces the generic ring-on-sticks silhouette while
  // preserving the array as the north navigation landmark.
  const crownPlinth = add(
    new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.58, 1.9), darkMetal),
    'RELAY_CAMPUS_CROWN_PLINTH',
  );
  crownPlinth.position.set(0, 4.05, -26.55);
  const crownWallTie = add(
    new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.34, 3.2), darkMetal),
    'RELAY_CAMPUS_CROWN_WALL_TIE',
  );
  crownWallTie.position.set(0, 4.15, -24.95);
  for (const [index, x] of [-5.1, 5.1].entries()) {
    const pylon = add(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.54, 5.8, 6),
        darkMetal,
      ),
      `RELAY_CAMPUS_CROWN_PYLON_${index + 1}`,
    );
    pylon.position.set(x, 6.9, -26.55);
    pylon.rotation.z = x < 0 ? -0.12 : 0.12;
  }
  const crownYokeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-5.25, 9.2, -26.55),
    new THREE.Vector3(-4.4, 11.6, -26.62),
    new THREE.Vector3(-2.4, 13.55, -26.68),
    new THREE.Vector3(0, 14.25, -26.7),
    new THREE.Vector3(2.4, 13.55, -26.68),
    new THREE.Vector3(4.4, 11.6, -26.62),
    new THREE.Vector3(5.25, 9.2, -26.55),
  ], false, 'centripetal');
  add(
    new THREE.Mesh(
      new THREE.TubeGeometry(crownYokeCurve, 48, 0.28, 8, false),
      paleCeramic,
    ),
    'RELAY_CAMPUS_CROWN_STRUCTURAL_YOKE',
  );
  const signalArcCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-3.65, 9.15, -26.36),
    new THREE.Vector3(-2.45, 11.45, -26.4),
    new THREE.Vector3(0, 12.5, -26.42),
    new THREE.Vector3(2.45, 11.45, -26.4),
    new THREE.Vector3(3.65, 9.15, -26.36),
  ], false, 'centripetal');
  add(
    new THREE.Mesh(
      new THREE.TubeGeometry(signalArcCurve, 36, 0.1, 8, false),
      signal,
    ),
    'RELAY_CAMPUS_CROWN_SIGNAL_ARC',
    'route_readability_inlay',
  );
  const crownCrossbar = add(
    new THREE.Mesh(new THREE.BoxGeometry(8.8, 0.32, 0.48), darkMetal),
    'RELAY_CAMPUS_CROWN_CROSSBAR',
  );
  crownCrossbar.position.set(0, 9.15, -26.55);
  const crownSuspension = add(
    new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.35, 0.26), darkMetal),
    'RELAY_CAMPUS_CROWN_LENS_SUSPENSION',
  );
  crownSuspension.position.set(0, 11.35, -26.52);
  for (const side of [-1, 1] as const) {
    const shoulder = add(
      new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.2, 0.3), darkMetal),
      side < 0
        ? 'RELAY_CAMPUS_CROWN_SHOULDER_WEST'
        : 'RELAY_CAMPUS_CROWN_SHOULDER_EAST',
    );
    shoulder.position.set(side * 2.65, 10.05, -26.5);
    shoulder.rotation.z = side * 0.22;
  }
  const crownHub = add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.05, 0.46, 12),
      darkMetal,
    ),
    'RELAY_CAMPUS_CROWN_SIGNAL_HUB',
  );
  crownHub.position.set(0, 10.15, -26.48);
  crownHub.rotation.x = Math.PI / 2;
  const crownLens = add(
    new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 1), signal),
    'RELAY_CAMPUS_CROWN_SIGNAL_LENS',
    'route_readability_inlay',
  );
  crownLens.position.set(0, 10.15, -26.18);

  return Object.freeze({ meshCount, lightCount });
}

/**
 * Builds the Open Sky v5 campus entirely behind Relay's frozen Revision-1
 * authority fixture. Presentation objects remain no-hit and cannot become
 * floors, cover, portal triggers, or collision authority.
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
  group.userData.playerEyeLandmarkHierarchy =
    RELAY_OPEN_SKY_V5_PLAYER_EYE_HIERARCHY;
  group.userData.lightingLimits = RELAY_OPEN_SKY_V5_LIGHTING_LIMITS;

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
  const lightCount = landmarkFacts.lightCount + architectureFacts.lightCount;
  const estimatedDrawCalls = meshCount;
  const withinRenderBudget = meshCount
    <= RELAY_OPEN_SKY_V5_RENDER_BUDGET.maximumMeshObjects
    && estimatedDrawCalls
      <= RELAY_OPEN_SKY_V5_RENDER_BUDGET.maximumEstimatedDrawCalls
    && lightCount <= RELAY_OPEN_SKY_V5_RENDER_BUDGET.maximumRealtimeLights;

  group.userData.meshCount = meshCount;
  group.userData.lightCount = lightCount;
  group.userData.estimatedDrawCalls = estimatedDrawCalls;
  group.userData.renderBudget = RELAY_OPEN_SKY_V5_RENDER_BUDGET;
  group.userData.withinRenderBudget = withinRenderBudget;
  group.userData.architectureLogicalInstanceCount =
    architectureFacts.logicalInstanceCount;
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
    fakeTraversableSurfaceCount: 0,
    candidateRequiresHumanAcceptance: true,
  });

  return Object.freeze({
    group,
    meshCount,
    lightCount,
    colliderInstanceCount: colliderFacts.colliderInstanceCount,
    waypointInlayCount: colliderFacts.waypointInlayCount,
    landmarkMeshCount: landmarkFacts.meshCount
      + architectureFacts.meshCount
      + skyMeshCount,
    estimatedDrawCalls,
    withinRenderBudget,
    authorityFixtureUnchanged: true,
    humanAccepted: false,
  });
}
