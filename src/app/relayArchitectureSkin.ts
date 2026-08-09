import * as THREE from 'three';

export const RELAY_ARCHITECTURE_V5_RENDER_BUDGET = Object.freeze({
  maximumMeshObjects: 28,
  maximumEstimatedDrawCalls: 28,
  maximumRealtimeLights: 2,
  maximumLogicalInstances: 180,
});
export const RELAY_ARCHITECTURE_V5_LIGHTING_LIMITS = Object.freeze({
  maximumSignalEmissiveIntensity: 0.24,
  maximumSpawnPointLightIntensity: 0.24,
  maximumSpawnPointLightRangeMeters: 6.5,
  surfaceInlayLiftMeters: 0.006,
});
export const RELAY_V5_PORTAL_DESTINATION_LANGUAGE = Object.freeze({
  serviceGate: Object.freeze({
    endpointId: 'relay_service_gate',
    destinationEndpointId: 'relay_overlook_gate',
    destinationZoneId: 'relay_upper_overlook',
    previewObjectName: 'RELAY_V5_SERVICE_TO_OVERLOOK_CROWN_KEY',
    destinationLandmarkObjectName: 'RELAY_CAMPUS_CROWN_STRUCTURAL_YOKE',
  }),
  overlookGate: Object.freeze({
    endpointId: 'relay_overlook_gate',
    destinationEndpointId: 'relay_service_gate',
    destinationZoneId: 'relay_lower_service',
    previewObjectName: 'RELAY_V5_OVERLOOK_TO_SERVICE_PIPE_KEY',
    destinationLandmarkObjectName: 'RELAY_V5_LOWER_SERVICE_PIPE_BANK',
  }),
});

export interface RelayArchitectureSkin {
  readonly group: THREE.Group;
  readonly meshCount: number;
  readonly lightCount: number;
  readonly logicalInstanceCount: number;
  readonly estimatedDrawCalls: number;
}

interface SkinFacts {
  meshCount: number;
  lightCount: number;
  logicalInstanceCount: number;
  estimatedDrawCalls: number;
}

type VectorTuple = readonly [number, number, number];

interface InstanceDefinition {
  readonly name: string;
  readonly position: VectorTuple;
  readonly size: VectorTuple;
  readonly rotation: VectorTuple;
}

const INSTANCE_POSITION = new THREE.Vector3();
const INSTANCE_SCALE = new THREE.Vector3();
const INSTANCE_ROTATION = new THREE.Euler(0, 0, 0, 'XYZ');
const INSTANCE_QUATERNION = new THREE.Quaternion();
const INSTANCE_MATRIX = new THREE.Matrix4();

function material(
  name: string,
  color: number,
  options: Readonly<{
    emissive?: number;
    emissiveIntensity?: number;
    metalness?: number;
    roughness?: number;
  }> = {},
): THREE.MeshStandardMaterial {
  const value = new THREE.MeshStandardMaterial({
    color,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    metalness: options.metalness ?? 0.48,
    roughness: options.roughness ?? 0.48,
  });
  value.name = name;
  return value;
}

function mark(
  object: THREE.Object3D,
  role: string,
  visualContinuityVersion: string,
): void {
  object.userData.presentationRole = role;
  object.userData.renderMeshesMayBeAuthority = false;
  object.userData.noHit = true;
  object.userData.visualContinuityVersion = visualContinuityVersion;
}

function instance(
  name: string,
  position: VectorTuple,
  size: VectorTuple,
  rotation: VectorTuple = [0, 0, 0],
): InstanceDefinition {
  return Object.freeze({ name, position, size, rotation });
}

function positionOnLocalNegativeZ(
  position: VectorTuple,
  rotationY: number,
  distance: number,
): VectorTuple {
  return [
    position[0] - Math.sin(rotationY) * distance,
    position[1],
    position[2] - Math.cos(rotationY) * distance,
  ];
}

function addInstancedGeometry(
  parent: THREE.Group,
  facts: SkinFacts,
  definition: Readonly<{
    name: string;
    role: string;
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    instances: readonly InstanceDefinition[];
    castShadow?: boolean;
    receiveShadow?: boolean;
  }>,
  visualContinuityVersion: string,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(
    definition.geometry,
    definition.material,
    definition.instances.length,
  );
  mesh.name = definition.name;
  mesh.castShadow = definition.castShadow ?? true;
  mesh.receiveShadow = definition.receiveShadow ?? true;
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.userData.instanceNames = Object.freeze(
    definition.instances.map(({ name }) => name),
  );
  mesh.userData.logicalInstanceCount = definition.instances.length;
  definition.instances.forEach((value, index) => {
    INSTANCE_POSITION.set(...value.position);
    INSTANCE_SCALE.set(...value.size);
    INSTANCE_ROTATION.set(...value.rotation);
    INSTANCE_QUATERNION.setFromEuler(INSTANCE_ROTATION);
    INSTANCE_MATRIX.compose(
      INSTANCE_POSITION,
      INSTANCE_QUATERNION,
      INSTANCE_SCALE,
    );
    mesh.setMatrixAt(index, INSTANCE_MATRIX);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  mark(mesh, definition.role, visualContinuityVersion);
  parent.add(mesh);
  facts.meshCount += 1;
  facts.logicalInstanceCount += definition.instances.length;
  facts.estimatedDrawCalls += 1;
  return mesh;
}

function addLight(
  parent: THREE.Group,
  facts: SkinFacts,
  light: THREE.Light,
  role: string,
  visualContinuityVersion: string,
): void {
  mark(light, role, visualContinuityVersion);
  parent.add(light);
  facts.lightCount += 1;
}

/**
 * A render-only architectural layer seated on, inside, or beyond Relay's
 * exact Revision-1 authority envelope. It adds no floors, collision, cover,
 * portal triggers, or navigable surfaces. Repeated members are instanced so
 * the authored silhouette does not require one draw call per decorative box.
 */
export function createRelayArchitectureSkin(
  visualContinuityVersion: string,
): RelayArchitectureSkin {
  const group = new THREE.Group();
  group.name = 'RELAY_ARCHITECTURAL_SKIN_V5';
  mark(group, 'relay_architectural_skin_root', visualContinuityVersion);
  const facts: SkinFacts = {
    meshCount: 0,
    lightCount: 0,
    logicalInstanceCount: 0,
    estimatedDrawCalls: 0,
  };

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  unitBox.name = 'RELAY_V5_SHARED_UNIT_BOX';
  const unitHexColumn = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1, false);
  unitHexColumn.name = 'RELAY_V5_SHARED_HEX_COLUMN';
  const unitPipe = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, false);
  unitPipe.name = 'RELAY_V5_SHARED_UTILITY_PIPE';

  const darkMetal = material('RELAY_V5_DARK_STRUCTURE', 0x13272f, {
    metalness: 0.72,
    roughness: 0.34,
  });
  const ceramic = material('RELAY_V5_WARM_CERAMIC', 0x899992, {
    metalness: 0.1,
    roughness: 0.72,
  });
  const shadowCeramic = material('RELAY_V5_SHADOW_CERAMIC', 0x425a5b, {
    metalness: 0.22,
    roughness: 0.62,
  });
  const westSignal = material('RELAY_V5_WEST_SIGNAL', 0x479ba0, {
    emissive: 0x124d52,
    emissiveIntensity:
      RELAY_ARCHITECTURE_V5_LIGHTING_LIMITS.maximumSignalEmissiveIntensity,
    metalness: 0.18,
    roughness: 0.46,
  });
  const eastSignal = material('RELAY_V5_EAST_SIGNAL', 0xc67e46, {
    emissive: 0x603318,
    emissiveIntensity: 0.22,
    metalness: 0.16,
    roughness: 0.48,
  });
  const serviceMetal = material('RELAY_V5_SERVICE_METAL', 0x59675f, {
    metalness: 0.58,
    roughness: 0.54,
  });
  const coverArmor = material('RELAY_V5_COVER_ARMOR', 0x687a76, {
    metalness: 0.36,
    roughness: 0.56,
  });

  const portalBackplanes = [
    instance('RELAY_SERVICE_PORTAL_BACKPLANE', [0, -1.35, 20.78], [6.2, 3.8, 0.18]),
    instance('RELAY_OVERLOOK_PORTAL_BACKPLANE', [0, 5.3, -21.78], [6.2, 3.7, 0.18]),
  ];
  addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_PORTAL_BACKPLANES',
    role: 'authority_boundary_portal_backplane',
    geometry: unitBox,
    material: shadowCeramic,
    instances: portalBackplanes,
  }, visualContinuityVersion);

  const portalFrameMembers = [
    instance('RELAY_SERVICE_PORTAL_HEADER', [0, 0.37, 20.56], [5.2, 0.42, 0.5]),
    instance('RELAY_SERVICE_PORTAL_SILL', [0, -2.93, 20.43], [5.2, 0.14, 1.1]),
    instance('RELAY_SERVICE_PORTAL_WALL_TIE', [0, 0.5, 22.18], [6.35, 0.2, 3.2]),
    instance('RELAY_SERVICE_PORTAL_BRACE_WEST', [-3.02, -0.25, 20.58], [2.15, 0.2, 0.22], [0, 0, 0.52]),
    instance('RELAY_SERVICE_PORTAL_BRACE_EAST', [3.02, -0.25, 20.58], [2.15, 0.2, 0.22], [0, 0, -0.52]),
    instance('RELAY_OVERLOOK_PORTAL_HEADER', [0, 6.98, -20.56], [5.2, 0.42, 0.5]),
    instance('RELAY_OVERLOOK_PORTAL_SILL', [0, 3.96, -20.43], [5.2, 0.14, 1.1]),
    instance('RELAY_OVERLOOK_PORTAL_ARRAY_TIE', [0, 5.42, -23.15], [6.35, 0.2, 2.9]),
    instance('RELAY_OVERLOOK_PORTAL_BRACE_WEST', [-3.02, 6.18, -20.58], [2.15, 0.2, 0.22], [0, 0, -0.52]),
    instance('RELAY_OVERLOOK_PORTAL_BRACE_EAST', [3.02, 6.18, -20.58], [2.15, 0.2, 0.22], [0, 0, 0.52]),
  ];
  addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_PORTAL_STRUCTURAL_MEMBERS',
    role: 'portal_frame_connected_structure',
    geometry: unitBox,
    material: darkMetal,
    instances: portalFrameMembers,
  }, visualContinuityVersion);

  const portalJambs = [
    instance('RELAY_SERVICE_PORTAL_JAMB_WEST', [-2.22, -1.35, 20.52], [0.56, 3.35, 0.56]),
    instance('RELAY_SERVICE_PORTAL_JAMB_EAST', [2.22, -1.35, 20.52], [0.56, 3.35, 0.56]),
    instance('RELAY_OVERLOOK_PORTAL_JAMB_WEST', [-2.22, 5.33, -20.52], [0.56, 3.15, 0.56]),
    instance('RELAY_OVERLOOK_PORTAL_JAMB_EAST', [2.22, 5.33, -20.52], [0.56, 3.15, 0.56]),
  ];
  addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_PORTAL_HEX_JAMBS',
    role: 'authority_boundary_portal_jamb',
    geometry: unitHexColumn,
    material: ceramic,
    instances: portalJambs,
  }, visualContinuityVersion);

  addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_SERVICE_PORTAL_SIGNAL_INLAYS',
    role: 'portal_route_signal_inlay',
    geometry: unitBox,
    material: westSignal,
    instances: [
      instance('RELAY_SERVICE_PORTAL_SIGNAL_WEST', [-1.78, -1.35, 20.21], [0.07, 2.5, 0.055]),
      instance('RELAY_SERVICE_PORTAL_SIGNAL_EAST', [1.78, -1.35, 20.21], [0.07, 2.5, 0.055]),
    ],
    castShadow: false,
  }, visualContinuityVersion);
  addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_OVERLOOK_PORTAL_SIGNAL_INLAYS',
    role: 'portal_route_signal_inlay',
    geometry: unitBox,
    material: eastSignal,
    instances: [
      instance('RELAY_OVERLOOK_PORTAL_SIGNAL_WEST', [-1.78, 5.33, -20.21], [0.07, 2.35, 0.055]),
      instance('RELAY_OVERLOOK_PORTAL_SIGNAL_EAST', [1.78, 5.33, -20.21], [0.07, 2.35, 0.055]),
    ],
    castShadow: false,
  }, visualContinuityVersion);

  // Each gate carries a small, shallow symbol for the place it reaches, not
  // another same-color echo of its current room. The service header previews
  // the amber crown; the overlook header previews the cyan service pipe bank.
  // Both keys are fixed to existing frame headers and make no traversal claim.
  const serviceDestinationKey = addInstancedGeometry(group, facts, {
    name: RELAY_V5_PORTAL_DESTINATION_LANGUAGE.serviceGate.previewObjectName,
    role: 'portal_destination_preview_inlay',
    geometry: unitBox,
    material: eastSignal,
    instances: [
      instance('RELAY_SERVICE_DESTINATION_CROWN_WEST', [-0.46, 0.38, 20.304], [0.62, 0.05, 0.012], [0, 0, 0.32]),
      instance('RELAY_SERVICE_DESTINATION_CROWN_EAST', [0.46, 0.38, 20.304], [0.62, 0.05, 0.012], [0, 0, -0.32]),
      instance('RELAY_SERVICE_DESTINATION_CROWN_HUB', [0, 0.49, 20.304], [0.5, 0.05, 0.012]),
    ],
    castShadow: false,
  }, visualContinuityVersion);
  serviceDestinationKey.userData.portalEndpointId =
    RELAY_V5_PORTAL_DESTINATION_LANGUAGE.serviceGate.endpointId;
  serviceDestinationKey.userData.destinationEndpointId =
    RELAY_V5_PORTAL_DESTINATION_LANGUAGE.serviceGate.destinationEndpointId;
  serviceDestinationKey.userData.destinationZoneId =
    RELAY_V5_PORTAL_DESTINATION_LANGUAGE.serviceGate.destinationZoneId;
  serviceDestinationKey.userData.destinationLandmarkObjectName =
    RELAY_V5_PORTAL_DESTINATION_LANGUAGE.serviceGate
      .destinationLandmarkObjectName;

  const overlookDestinationKey = addInstancedGeometry(group, facts, {
    name: RELAY_V5_PORTAL_DESTINATION_LANGUAGE.overlookGate.previewObjectName,
    role: 'portal_destination_preview_inlay',
    geometry: unitBox,
    material: westSignal,
    instances: [
      instance('RELAY_OVERLOOK_DESTINATION_PIPE_UPPER', [0, 7.08, -20.304], [1.05, 0.04, 0.012]),
      instance('RELAY_OVERLOOK_DESTINATION_PIPE_MIDDLE', [0, 6.98, -20.304], [1.05, 0.04, 0.012]),
      instance('RELAY_OVERLOOK_DESTINATION_PIPE_LOWER', [0, 6.88, -20.304], [1.05, 0.04, 0.012]),
      instance('RELAY_OVERLOOK_DESTINATION_PIPE_CLAMP', [0, 6.98, -20.304], [0.08, 0.28, 0.012]),
    ],
    castShadow: false,
  }, visualContinuityVersion);
  overlookDestinationKey.userData.portalEndpointId =
    RELAY_V5_PORTAL_DESTINATION_LANGUAGE.overlookGate.endpointId;
  overlookDestinationKey.userData.destinationEndpointId =
    RELAY_V5_PORTAL_DESTINATION_LANGUAGE.overlookGate.destinationEndpointId;
  overlookDestinationKey.userData.destinationZoneId =
    RELAY_V5_PORTAL_DESTINATION_LANGUAGE.overlookGate.destinationZoneId;
  overlookDestinationKey.userData.destinationLandmarkObjectName =
    RELAY_V5_PORTAL_DESTINATION_LANGUAGE.overlookGate
      .destinationLandmarkObjectName;

  // All bridge pieces occupy existing deck, rail, or support silhouettes.
  // Dark underside continuity, hexagonal piers, capitals, and rail-plane
  // diagonals make the bridge read as one load path instead of floating slabs.
  const bridgeStructure = [
    instance('RELAY_BRIDGE_CENTER_UNDERSIDE', [0, 3.61, -10], [14, 0.22, 3.7]),
    instance('RELAY_BRIDGE_WEST_UNDERSIDE', [-10.5, 3.61, -10], [7, 0.22, 7]),
    instance('RELAY_BRIDGE_EAST_UNDERSIDE', [10.5, 3.61, -10], [7, 0.22, 7]),
    instance('RELAY_BRIDGE_SUPPORT_WEST_BASE', [-5.6, 0.18, -10], [0.82, 0.3, 0.82]),
    instance('RELAY_BRIDGE_SUPPORT_EAST_BASE', [5.6, 0.18, -10], [0.82, 0.3, 0.82]),
    instance('RELAY_BRIDGE_SUPPORT_WEST_CAPITAL', [-5.6, 3.35, -10], [0.82, 0.34, 0.82]),
    instance('RELAY_BRIDGE_SUPPORT_EAST_CAPITAL', [5.6, 3.35, -10], [0.82, 0.34, 0.82]),
    instance('RELAY_BRIDGE_CENTER_JOINT_WEST', [-7, 3.61, -10], [0.12, 0.2, 3.5]),
    instance('RELAY_BRIDGE_CENTER_JOINT_EAST', [7, 3.61, -10], [0.12, 0.2, 3.5]),
    instance('RELAY_BRIDGE_CENTER_FASCIA_NORTH', [0, 3.85, -11.86], [14, 0.34, 0.14]),
    instance('RELAY_BRIDGE_CENTER_FASCIA_SOUTH', [0, 3.85, -8.14], [14, 0.34, 0.14]),
    instance('RELAY_BRIDGE_WEST_FASCIA_NORTH', [-10.5, 3.85, -13.48], [7, 0.34, 0.14]),
    instance('RELAY_BRIDGE_WEST_FASCIA_SOUTH', [-10.5, 3.85, -6.52], [7, 0.34, 0.14]),
    instance('RELAY_BRIDGE_EAST_FASCIA_NORTH', [10.5, 3.85, -13.48], [7, 0.34, 0.14]),
    instance('RELAY_BRIDGE_EAST_FASCIA_SOUTH', [10.5, 3.85, -6.52], [7, 0.34, 0.14]),
  ];
  addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_BRIDGE_LOAD_PATH',
    role: 'authority_bridge_structural_skin',
    geometry: unitBox,
    material: darkMetal,
    instances: bridgeStructure,
  }, visualContinuityVersion);
  addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_BRIDGE_HEX_PIERS',
    role: 'authority_bridge_support_skin',
    geometry: unitHexColumn,
    material: shadowCeramic,
    instances: [
      instance('RELAY_BRIDGE_HEX_PIER_WEST', [-5.6, 1.74, -10], [0.78, 3.05, 0.78]),
      instance('RELAY_BRIDGE_HEX_PIER_EAST', [5.6, 1.74, -10], [0.78, 3.05, 0.78]),
    ],
  }, visualContinuityVersion);

  const bridgeBraces: InstanceDefinition[] = [];
  for (const z of [-11.96, -8.04]) {
    for (const [index, x] of [-5.25, -1.75, 1.75, 5.25].entries()) {
      bridgeBraces.push(instance(
        `RELAY_CENTER_RAIL_BRACE_${z < -10 ? 'N' : 'S'}_${index + 1}`,
        [x, 4.3, z],
        [3.45, 0.14, 0.1],
        [0, 0, index % 2 === 0 ? 0.23 : -0.23],
      ));
    }
  }
  for (const side of [-1, 1] as const) {
    for (const [index, z] of [-13.56, -6.44].entries()) {
      bridgeBraces.push(instance(
        `RELAY_${side < 0 ? 'WEST' : 'EAST'}_RAIL_BRACE_${index + 1}`,
        [side * 10.5, 4.3, z],
        [3.2, 0.14, 0.1],
        [0, 0, side * (index === 0 ? 0.23 : -0.23)],
      ));
    }
  }
  addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_BRIDGE_RAIL_BRACES',
    role: 'authority_guard_rail_structural_inlay',
    geometry: unitBox,
    material: ceramic,
    instances: bridgeBraces,
  }, visualContinuityVersion);

  for (const side of [-1, 1] as const) {
    addInstancedGeometry(group, facts, {
      name: side < 0
        ? 'RELAY_V5_WEST_RAMP_SIGNAL_INLAYS'
        : 'RELAY_V5_EAST_RAMP_SIGNAL_INLAYS',
      role: 'authority_ramp_route_inlay',
      geometry: unitBox,
      material: side < 0 ? westSignal : eastSignal,
      instances: [-11.7, -8.3].map((z, index) => instance(
        `RELAY_${side < 0 ? 'WEST' : 'EAST'}_RAMP_SIGNAL_${index + 1}`,
        [side * 14.1, 1.93, z],
        [9.35, 0.028, 0.065],
        [0, 0, side < 0 ? -Math.PI * 24 / 180 : Math.PI * 24 / 180],
      )),
      castShadow: false,
    }, visualContinuityVersion);
  }

  // Spawn identity is carried by two wall-bound operations facades rather
  // than tall lamp posts in the combat lane. Floor inserts remain flush with
  // the proven pads; every tall element stays in or outside the boundary wall.
  const spawnDarkMembers: InstanceDefinition[] = [];
  const spawnCeramicMembers: InstanceDefinition[] = [];
  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'WEST' : 'EAST';
    spawnDarkMembers.push(
      instance(`RELAY_${sideName}_SPAWN_DECK_INSERT`, [side * 28, 0.009, 0], [8.3, 0.016, 11.4]),
      instance(`RELAY_${sideName}_OPERATIONS_BACKPLANE`, [side * 33.56, 2.72, 0], [0.12, 5.45, 14.8]),
      instance(`RELAY_${sideName}_OPERATIONS_CROWN`, [side * 34.05, 5.3, 0], [1.08, 0.4, 15.7]),
      instance(`RELAY_${sideName}_OPERATIONS_SILL`, [side * 33.55, 0.42, 0], [0.1, 0.46, 14.2]),
    );
    for (const [index, z] of [-6.1, -2.05, 2.05, 6.1].entries()) {
      spawnCeramicMembers.push(instance(
        `RELAY_${sideName}_OPERATIONS_FIN_${index + 1}`,
        [side * 33.515, 2.75, z],
        [0.03, 4.65, 0.28],
        [index % 2 === 0 ? side * 0.04 : -side * 0.04, 0, 0],
      ));
    }
    spawnCeramicMembers.push(
      instance(`RELAY_${sideName}_OPERATIONS_WING_NORTH`, [side * 33.515, 4.35, -4.25], [0.03, 0.28, 4.5], [0.22, 0, 0]),
      instance(`RELAY_${sideName}_OPERATIONS_WING_SOUTH`, [side * 33.515, 4.35, 4.25], [0.03, 0.28, 4.5], [-0.22, 0, 0]),
    );
  }
  addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_SPAWN_OPERATIONS_STRUCTURE',
    role: 'authority_boundary_spawn_architecture',
    geometry: unitBox,
    material: darkMetal,
    instances: spawnDarkMembers,
  }, visualContinuityVersion);
  addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_SPAWN_OPERATIONS_FINS',
    role: 'authority_boundary_spawn_facade',
    geometry: unitBox,
    material: ceramic,
    instances: spawnCeramicMembers,
  }, visualContinuityVersion);
  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'WEST' : 'EAST';
    const signalMaterial = side < 0 ? westSignal : eastSignal;
    addInstancedGeometry(group, facts, {
      name: `RELAY_V5_${sideName}_SPAWN_SIGNAL_BLADES`,
      role: 'spawn_boundary_signal_blade',
      geometry: unitBox,
      material: signalMaterial,
      instances: [
        instance(`RELAY_${sideName}_SPAWN_SIGNAL_SPINE`, [side * 33.508, 2.72, 0], [0.016, 3.3, 0.18]),
        instance(`RELAY_${sideName}_SPAWN_TRACK_NORTH`, [side * 28, RELAY_ARCHITECTURE_V5_LIGHTING_LIMITS.surfaceInlayLiftMeters, -4.4], [7.2, 0.008, 0.045]),
        instance(`RELAY_${sideName}_SPAWN_TRACK_SOUTH`, [side * 28, RELAY_ARCHITECTURE_V5_LIGHTING_LIMITS.surfaceInlayLiftMeters, 4.4], [7.2, 0.008, 0.045]),
      ],
      castShadow: false,
    }, visualContinuityVersion);
    const light = new THREE.PointLight(
      side < 0 ? 0x72d8db : 0xeaa262,
      RELAY_ARCHITECTURE_V5_LIGHTING_LIMITS
        .maximumSpawnPointLightIntensity,
      RELAY_ARCHITECTURE_V5_LIGHTING_LIMITS
        .maximumSpawnPointLightRangeMeters,
      2.2,
    );
    light.name = `RELAY_${sideName}_SPAWN_FACADE_LIGHT`;
    light.position.set(side * 33.72, 3.25, 0);
    addLight(
      group,
      facts,
      light,
      'spawn_facade_readability_light',
      visualContinuityVersion,
    );
  }

  // The four existing spawn sight-protection walls also become the readable
  // exit shoulders. Armor and caps stay inside those exact 6 x 2.1 x 0.48 m
  // collider envelopes. The colored codes are twelve-millimeter surface
  // inlays, so they communicate bay identity without inventing a blocking
  // arch, post, or traversable ledge in either spawn route.
  const spawnProtectionArmor: InstanceDefinition[] = [];
  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'WEST' : 'EAST';
    for (const z of [-7.6, 7.6] as const) {
      const wallName = z < 0 ? 'NORTH' : 'SOUTH';
      const spawnFacingSurfaceZ = z - Math.sign(z) * 0.228;
      spawnProtectionArmor.push(
        instance(
          `RELAY_${sideName}_SPAWN_${wallName}_WALL_ARMOR`,
          [side * 25, 1.04, spawnFacingSurfaceZ],
          [5.4, 1.34, 0.024],
        ),
        instance(
          `RELAY_${sideName}_SPAWN_${wallName}_WALL_CAP`,
          [side * 25, 2.05, z],
          [5.65, 0.09, 0.4],
        ),
      );
    }
  }
  const spawnProtectionMesh = addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_SPAWN_EXIT_SHOULDERS',
    role: 'authority_spawn_sight_wall_skin',
    geometry: unitBox,
    material: shadowCeramic,
    instances: spawnProtectionArmor,
  }, visualContinuityVersion);
  spawnProtectionMesh.userData.authorityAnchorIds = Object.freeze([
    'relay_wall_west_spawn_north',
    'relay_wall_west_spawn_south',
    'relay_wall_east_spawn_north',
    'relay_wall_east_spawn_south',
  ]);
  spawnProtectionMesh.userData.containment =
    'inside_exact_spawn_sight_wall_envelopes';

  const addSpawnExitCodes = (
    side: -1 | 1,
    signalMaterial: THREE.Material,
  ): void => {
    const sideName = side < 0 ? 'WEST' : 'EAST';
    const values: InstanceDefinition[] = [];
    for (const z of [-7.6, 7.6] as const) {
      const wallName = z < 0 ? 'NORTH' : 'SOUTH';
      const signalSurfaceZ = z - Math.sign(z) * 0.246;
      if (side < 0) {
        values.push(
          instance(`RELAY_${sideName}_${wallName}_EXIT_BAR`, [side * 25, 1.04, signalSurfaceZ], [2.1, 0.07, 0.012]),
          instance(`RELAY_${sideName}_${wallName}_EXIT_TICK_A`, [side * 25 - 0.92, 1.04, signalSurfaceZ], [0.07, 0.62, 0.012]),
          instance(`RELAY_${sideName}_${wallName}_EXIT_TICK_B`, [side * 25 + 0.92, 1.04, signalSurfaceZ], [0.07, 0.62, 0.012]),
        );
      } else {
        values.push(
          instance(`RELAY_${sideName}_${wallName}_EXIT_CHEVRON_A`, [side * 25 - 0.42, 1.04, signalSurfaceZ], [1.15, 0.07, 0.012], [0, 0, 0.42]),
          instance(`RELAY_${sideName}_${wallName}_EXIT_CHEVRON_B`, [side * 25 + 0.42, 1.04, signalSurfaceZ], [1.15, 0.07, 0.012], [0, 0, -0.42]),
        );
      }
    }
    const mesh = addInstancedGeometry(group, facts, {
      name: `RELAY_V5_${sideName}_SPAWN_EXIT_CODES`,
      role: 'spawn_exit_identity_surface_inlay',
      geometry: unitBox,
      material: signalMaterial,
      instances: values,
      castShadow: false,
    }, visualContinuityVersion);
    mesh.userData.navigationClaim = 'spawn_exit_identity_only';
    mesh.userData.maximumVisualOnlyProtrusionMeters = 0.012;
  };
  addSpawnExitCodes(-1, westSignal);
  addSpawnExitCodes(1, eastSignal);

  // The lower service route gets a mechanical datum: pipe banks terminate in
  // the service-gate frame, clamps sit against the arena edge, and dark grates
  // are flush on existing floor. Nothing creates a new ledge or cover volume.
  addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_LOWER_SERVICE_PIPE_BANK',
    role: 'lower_service_wall_utility',
    geometry: unitPipe,
    material: serviceMetal,
    instances: [
      instance('RELAY_SERVICE_PIPE_WEST_UPPER', [-11.2, -0.95, 20.9], [0.18, 15.8, 0.18], [0, 0, Math.PI / 2]),
      instance('RELAY_SERVICE_PIPE_EAST_UPPER', [11.2, -0.95, 20.9], [0.18, 15.8, 0.18], [0, 0, Math.PI / 2]),
      instance('RELAY_SERVICE_PIPE_WEST_LOWER', [-11.2, -1.38, 20.94], [0.13, 15.8, 0.13], [0, 0, Math.PI / 2]),
      instance('RELAY_SERVICE_PIPE_EAST_LOWER', [11.2, -1.38, 20.94], [0.13, 15.8, 0.13], [0, 0, Math.PI / 2]),
      instance('RELAY_SERVICE_PIPE_RISER_WEST', [-3.2, -1.4, 20.91], [0.18, 3.25, 0.18]),
      instance('RELAY_SERVICE_PIPE_RISER_EAST', [3.2, -1.4, 20.91], [0.18, 3.25, 0.18]),
    ],
  }, visualContinuityVersion);
  const lowerClamps: InstanceDefinition[] = [];
  for (const [index, x] of [-19, -15, -7.5, 7.5, 15, 19].entries()) {
    lowerClamps.push(instance(
      `RELAY_SERVICE_PIPE_CLAMP_${index + 1}`,
      [x, -1.16, 20.87],
      [0.2, 1.08, 0.22],
    ));
  }
  addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_LOWER_SERVICE_PIPE_CLAMPS',
    role: 'lower_service_wall_utility_clamp',
    geometry: unitBox,
    material: darkMetal,
    instances: lowerClamps,
  }, visualContinuityVersion);
  addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_LOWER_SERVICE_FLOOR_GRATES',
    role: 'authority_lower_floor_flush_grate',
    geometry: unitBox,
    material: darkMetal,
    instances: [-18, -12, -6, 0, 6, 12, 18].map((x, index) => instance(
      `RELAY_LOWER_SERVICE_GRATE_${index + 1}`,
      [x, -2.996, 17],
      [3.55, 0.008, 1.22],
    )),
    castShadow: false,
  }, visualContinuityVersion);
  addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_LOWER_SERVICE_DATUM',
    role: 'lower_service_signal_datum',
    geometry: unitBox,
    material: westSignal,
    instances: [
      instance('RELAY_LOWER_SERVICE_DATUM_WEST', [-12.5, -2.994, 20.84], [21.2, 0.012, 0.05]),
      instance('RELAY_LOWER_SERVICE_DATUM_EAST', [12.5, -2.994, 20.84], [21.2, 0.012, 0.05]),
    ],
    castShadow: false,
  }, visualContinuityVersion);

  // Cover keeps the exact box collision readable, but top caps, recessed face
  // armor, and side-coded vertical spines stop the exposed collider cladding
  // from being the only silhouette/detail read.
  const coverDefinitions = [
    { name: 'COURT_NORTHWEST', position: [-5.5, 0.65, -5.2] as VectorTuple, size: [2.8, 1.3, 0.9] as VectorTuple, rotationY: -Math.PI / 8, signal: westSignal },
    { name: 'COURT_SOUTHEAST', position: [5.5, 0.65, 5.2] as VectorTuple, size: [2.8, 1.3, 0.9] as VectorTuple, rotationY: -Math.PI / 8, signal: eastSignal },
    { name: 'COURT_NORTHEAST', position: [5.8, 1.2, -5.8] as VectorTuple, size: [1.8, 2.4, 1.3] as VectorTuple, rotationY: 0, signal: eastSignal },
    { name: 'COURT_SOUTHWEST', position: [-5.8, 1.2, 5.8] as VectorTuple, size: [1.8, 2.4, 1.3] as VectorTuple, rotationY: 0, signal: westSignal },
    { name: 'NORTH_WEST', position: [-14, 0.65, -15] as VectorTuple, size: [3.2, 1.3, 1] as VectorTuple, rotationY: 0, signal: westSignal },
    { name: 'NORTH_EAST', position: [14, 0.65, -15] as VectorTuple, size: [3.2, 1.3, 1] as VectorTuple, rotationY: 0, signal: eastSignal },
    { name: 'LOWER_WEST', position: [-10, -1.8, 17] as VectorTuple, size: [1.8, 2.4, 1.3] as VectorTuple, rotationY: 0, signal: westSignal },
    { name: 'LOWER_EAST', position: [10, -1.8, 17] as VectorTuple, size: [1.8, 2.4, 1.3] as VectorTuple, rotationY: 0, signal: eastSignal },
  ] as const;
  addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_COVER_SADDLE_CAPS',
    role: 'authority_cover_inset_cap',
    geometry: unitHexColumn,
    material: darkMetal,
    instances: coverDefinitions.map(({ name, position, size, rotationY }) => instance(
      `RELAY_${name}_COVER_SADDLE_CAP`,
      [position[0], position[1] + size[1] / 2 + 0.004, position[2]],
      [size[0] * 0.82, 0.016, size[2] * 0.82],
      [0, rotationY + Math.PI / 6, 0],
    )),
  }, visualContinuityVersion);
  addInstancedGeometry(group, facts, {
    name: 'RELAY_V5_COVER_RECESSED_ARMOR',
    role: 'authority_cover_recessed_face',
    geometry: unitBox,
    material: coverArmor,
    instances: coverDefinitions.map(({
      name,
      position,
      size,
      rotationY,
    }) => instance(
      `RELAY_${name}_COVER_RECESSED_ARMOR`,
      positionOnLocalNegativeZ(position, rotationY, size[2] / 2 + 0.006),
      [size[0] * 0.7, size[1] * 0.56, 0.012],
      [0, rotationY, 0],
    )),
    castShadow: false,
  }, visualContinuityVersion);
  for (const [sideName, signalMaterial, indices] of ([
    ['WEST', westSignal, [0, 3, 4, 6]],
    ['EAST', eastSignal, [1, 2, 5, 7]],
  ] as const)) {
    addInstancedGeometry(group, facts, {
      name: `RELAY_V5_${sideName}_COVER_SPINES`,
      role: 'authority_cover_identity_spine',
      geometry: unitBox,
      material: signalMaterial,
      instances: indices.map((index) => {
        const definition = coverDefinitions[index];
        return instance(
          `RELAY_${definition.name}_COVER_SPINE`,
          positionOnLocalNegativeZ(
            definition.position,
            definition.rotationY,
            definition.size[2] / 2 + 0.004,
          ),
          [0.065, definition.size[1] * 0.72, 0.008],
          [0, definition.rotationY, 0],
        );
      }),
      castShadow: false,
    }, visualContinuityVersion);
  }

  const withinBudget = facts.meshCount
    <= RELAY_ARCHITECTURE_V5_RENDER_BUDGET.maximumMeshObjects
    && facts.estimatedDrawCalls
      <= RELAY_ARCHITECTURE_V5_RENDER_BUDGET.maximumEstimatedDrawCalls
    && facts.lightCount
      <= RELAY_ARCHITECTURE_V5_RENDER_BUDGET.maximumRealtimeLights
    && facts.logicalInstanceCount
      <= RELAY_ARCHITECTURE_V5_RENDER_BUDGET.maximumLogicalInstances;
  group.userData.meshCount = facts.meshCount;
  group.userData.lightCount = facts.lightCount;
  group.userData.logicalInstanceCount = facts.logicalInstanceCount;
  group.userData.estimatedDrawCalls = facts.estimatedDrawCalls;
  group.userData.renderBudget = RELAY_ARCHITECTURE_V5_RENDER_BUDGET;
  group.userData.withinRenderBudget = withinBudget;
  group.userData.authorityGeometryAdded = false;
  group.userData.fakeTraversableSurfaceCount = 0;
  group.userData.portalDestinationLanguage =
    RELAY_V5_PORTAL_DESTINATION_LANGUAGE;
  group.userData.spawnExitAuthorityAnchorCount = 4;
  group.userData.maximumSurfaceInlayProtrusionMeters = 0.012;
  group.userData.collisionTruthReview = 'source_static_only_runtime_unknown';
  group.userData.humanAccepted = false;
  return Object.freeze({
    group,
    meshCount: facts.meshCount,
    lightCount: facts.lightCount,
    logicalInstanceCount: facts.logicalInstanceCount,
    estimatedDrawCalls: facts.estimatedDrawCalls,
  });
}
