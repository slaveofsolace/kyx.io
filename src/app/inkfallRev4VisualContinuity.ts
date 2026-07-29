import * as THREE from 'three';

import type { PhysicsFixtureV1 } from '../physics/fixtureSchema';

export const INKFALL_REV4_VISUAL_CONTINUITY_VERSION =
  'inkfall_rev4_online_visual_continuity_v1' as const;

export interface InkfallRev4VisualContinuity {
  readonly group: THREE.Group;
  readonly meshCount: number;
  readonly lightCount: number;
  readonly authorityAlignedCladdingCount: number;
}

type DressingSource =
  | 'authority_aligned_cladding'
  | 'architectural_shell'
  | 'industrial_landmark'
  | 'route_readability'
  | 'spawn_pocket_dressing'
  | 'understructure';

const SPAWN_CONTAINMENT_COLLIDER_ID =
  /^(?:map_collision_(?:spawn_pad_spawn_[a-z0-9_]+|node_(?:west|east)_spawn|spawn_pocket_(?:floor|wall)_[a-z0-9_]+|kill_boundary_guard_(?:west|east)_back|spawn_sight_blocker_[a-z0-9_]+|door_frame_(?:west|east)_spawn_main_(?:left|right|lintel)|route_(?:west_spawn_choice_s00|east_choice_spawn_s01)))$/u;

const MAP_BOUNDS = Object.freeze({
  minimum: Object.freeze({ x: -36, y: -5, z: -28 }),
  maximum: Object.freeze({ x: 36, y: 10, z: 28 }),
});

function mapMillimetersToScene(
  value: Readonly<{ x: number; y: number; z: number }>,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  return target.set(value.x / 1_000, value.y / 1_000, -value.z / 1_000);
}

function markRenderOnly(
  object: THREE.Object3D,
  source: DressingSource,
): void {
  object.userData.presentationRole = 'render_only';
  object.userData.renderMeshesMayBeAuthority = false;
  object.userData.onlineAuthoritySource = source;
  object.userData.noHit = true;
  object.userData.visualContinuityVersion =
    INKFALL_REV4_VISUAL_CONTINUITY_VERSION;
}

function standardMaterial(
  color: number,
  {
    metalness = 0.7,
    roughness = 0.38,
    emissive,
    emissiveIntensity = 0,
  }: Readonly<{
    metalness?: number;
    roughness?: number;
    emissive?: number;
    emissiveIntensity?: number;
  }> = {},
): THREE.MeshStandardMaterial {
  const parameters: THREE.MeshStandardMaterialParameters = {
    color,
    metalness,
    roughness,
    emissiveIntensity,
  };
  if (emissive !== undefined) parameters.emissive = emissive;
  return new THREE.MeshStandardMaterial(parameters);
}

/**
 * Builds the presentation shell around the immutable Rev3 authority fixture.
 *
 * Every object created here is explicitly render-only/noHit. The fixture is
 * read, never mutated, and remains the sole source of collision and traversal.
 */
export function createInkfallRev4VisualContinuity(
  fixture: PhysicsFixtureV1,
): InkfallRev4VisualContinuity {
  const group = new THREE.Group();
  group.name = 'INKFALL_REV4_RENDER_ONLY_VISUAL_CONTINUITY';
  markRenderOnly(group, 'architectural_shell');
  group.userData.authorityFixtureId = fixture.id;
  group.userData.authorityColliderCountAtBuild = fixture.solids.length;
  group.userData.mapBounds = MAP_BOUNDS;

  const materials = Object.freeze({
    shell: standardMaterial(0x1b2a30, {
      metalness: 0.74,
      roughness: 0.5,
      emissive: 0x071116,
      emissiveIntensity: 0.28,
    }),
    shellInset: standardMaterial(0x2a3b41, {
      metalness: 0.68,
      roughness: 0.43,
      emissive: 0x091519,
      emissiveIntensity: 0.25,
    }),
    blackSteel: standardMaterial(0x111b20, {
      metalness: 0.82,
      roughness: 0.35,
      emissive: 0x05090c,
      emissiveIntensity: 0.2,
    }),
    deck: standardMaterial(0x31464a, {
      metalness: 0.78,
      roughness: 0.4,
      emissive: 0x081315,
      emissiveIntensity: 0.22,
    }),
    deckInset: standardMaterial(0x213238, {
      metalness: 0.64,
      roughness: 0.53,
      emissive: 0x061013,
      emissiveIntensity: 0.18,
    }),
    steel: standardMaterial(0x64767a, { metalness: 0.92, roughness: 0.24 }),
    oxidizedSteel: standardMaterial(0x384c4e, {
      metalness: 0.76,
      roughness: 0.48,
    }),
    archive: standardMaterial(0x765b3e, { metalness: 0.55, roughness: 0.5 }),
    paper: standardMaterial(0xb6a67e, { metalness: 0.12, roughness: 0.75 }),
    ink: standardMaterial(0x0b4c55, {
      metalness: 0.46,
      roughness: 0.32,
      emissive: 0x04292f,
      emissiveIntensity: 0.6,
    }),
    hazard: standardMaterial(0xc68b2a, {
      metalness: 0.68,
      roughness: 0.38,
      emissive: 0x3b2004,
      emissiveIntensity: 0.4,
    }),
    west: standardMaterial(0x5de5ee, {
      metalness: 0.34,
      roughness: 0.26,
      emissive: 0x1a929d,
      emissiveIntensity: 1.25,
    }),
    east: standardMaterial(0xff9762, {
      metalness: 0.34,
      roughness: 0.26,
      emissive: 0xa6421f,
      emissiveIntensity: 1.25,
    }),
    warm: standardMaterial(0xffc278, {
      metalness: 0.3,
      roughness: 0.3,
      emissive: 0xb55c17,
      emissiveIntensity: 1.45,
    }),
    red: standardMaterial(0xf2473f, {
      metalness: 0.32,
      roughness: 0.28,
      emissive: 0xa90c0c,
      emissiveIntensity: 1.8,
    }),
  });

  let meshCount = 0;
  let lightCount = 0;
  let authorityAlignedCladdingCount = 0;

  const addBox = (
    parent: THREE.Object3D,
    name: string,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material: THREE.Material,
    source: DressingSource,
    rotation: readonly [number, number, number] = [0, 0, 0],
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size[0], size[1], size[2]),
      material,
    );
    mesh.name = name;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    markRenderOnly(mesh, source);
    parent.add(mesh);
    meshCount += 1;
    return mesh;
  };

  const addCylinder = (
    parent: THREE.Object3D,
    name: string,
    radius: number,
    length: number,
    position: readonly [number, number, number],
    material: THREE.Material,
    source: DressingSource,
    rotation: readonly [number, number, number] = [0, 0, 0],
    radialSegments = 16,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, radialSegments),
      material,
    );
    mesh.name = name;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    markRenderOnly(mesh, source);
    parent.add(mesh);
    meshCount += 1;
    return mesh;
  };

  const addTorus = (
    parent: THREE.Object3D,
    name: string,
    radius: number,
    tube: number,
    position: readonly [number, number, number],
    material: THREE.Material,
    source: DressingSource,
    rotation: readonly [number, number, number] = [0, 0, 0],
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(radius, tube, 10, 36),
      material,
    );
    mesh.name = name;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    markRenderOnly(mesh, source);
    parent.add(mesh);
    meshCount += 1;
    return mesh;
  };

  const addPointLight = (
    name: string,
    color: number,
    intensity: number,
    distance: number,
    position: readonly [number, number, number],
    source: DressingSource,
  ): THREE.PointLight => {
    const light = new THREE.PointLight(color, intensity, distance, 1.8);
    light.name = name;
    light.position.set(position[0], position[1], position[2]);
    markRenderOnly(light, source);
    group.add(light);
    lightCount += 1;
    return light;
  };

  const addFrame = (
    name: string,
    center: readonly [number, number, number],
    width: number,
    height: number,
    depth: number,
    material: THREE.Material,
    source: DressingSource,
    yaw = 0,
  ): void => {
    const frame = new THREE.Group();
    frame.name = name;
    frame.position.set(center[0], center[1], center[2]);
    frame.rotation.y = yaw;
    markRenderOnly(frame, source);
    group.add(frame);
    addBox(
      frame,
      `${name}_LEFT`,
      [0.32, height, depth],
      [-width / 2, 0, 0],
      material,
      source,
    );
    addBox(
      frame,
      `${name}_RIGHT`,
      [0.32, height, depth],
      [width / 2, 0, 0],
      material,
      source,
    );
    addBox(
      frame,
      `${name}_LINTEL`,
      [width + 0.32, 0.32, depth],
      [0, height / 2, 0],
      material,
      source,
    );
  };

  // Continuous hull and foundation. These pieces close the black void around
  // every playable tier without pretending to be collision surfaces.
  addBox(
    group,
    'INKFALL_FOUNDATION_BED',
    [76, 0.9, 60],
    [0, -5.55, 0],
    materials.blackSteel,
    'understructure',
  );
  addBox(
    group,
    'INKFALL_FOUNDATION_INSET',
    [70, 0.12, 54],
    [0, -5.04, 0],
    materials.deckInset,
    'understructure',
  );
  for (const z of [-25, -17, -9, -1, 7, 15, 23]) {
    addBox(
      group,
      `INKFALL_UNDERBEAM_X_${z}`,
      [72, 0.52, 0.52],
      [0, -4.62, z],
      materials.oxidizedSteel,
      'understructure',
    );
  }
  for (const x of [-32, -16, 0, 16, 32]) {
    addBox(
      group,
      `INKFALL_UNDERBEAM_Z_${x}`,
      [0.58, 0.58, 56],
      [x, -4.3, 0],
      materials.steel,
      'understructure',
    );
  }

  for (const x of [-37.2, 37.2]) {
    addBox(
      group,
      `INKFALL_OUTER_WALL_${x < 0 ? 'WEST' : 'EAST'}`,
      [1.2, 18.2, 59.2],
      [x, 3.55, 0],
      materials.shell,
      'architectural_shell',
    );
    for (const z of [-24, -16, -8, 0, 8, 16, 24]) {
      addBox(
        group,
        `INKFALL_OUTER_WALL_RIB_${x}_${z}`,
        [0.72, 16.5, 0.34],
        [x - Math.sign(x) * 0.72, 3.5, z],
        materials.steel,
        'architectural_shell',
      );
      addBox(
        group,
        `INKFALL_OUTER_WALL_INSET_${x}_${z}`,
        [0.18, 5.6, 6.2],
        [x - Math.sign(x) * 0.68, 2.6, z],
        materials.shellInset,
        'architectural_shell',
      );
    }
  }
  for (const z of [-29.2, 29.2]) {
    addBox(
      group,
      `INKFALL_OUTER_WALL_${z < 0 ? 'ARCHIVE' : 'INK'}`,
      [75.4, 18.2, 1.2],
      [0, 3.55, z],
      z < 0 ? materials.archive : materials.shell,
      'architectural_shell',
    );
    for (const x of [-32, -24, -16, -8, 0, 8, 16, 24, 32]) {
      addBox(
        group,
        `INKFALL_END_WALL_RIB_${z}_${x}`,
        [0.34, 16.5, 0.72],
        [x, 3.5, z - Math.sign(z) * 0.72],
        materials.steel,
        'architectural_shell',
      );
    }
  }

  // A segmented roof reads as one industrial volume while keeping the ceiling
  // rhythm visible from the upper archive tier.
  for (const x of [-27, -9, 9, 27]) {
    for (const z of [-20, 0, 20]) {
      addBox(
        group,
        `INKFALL_CEILING_PANEL_${x}_${z}`,
        [16.5, 0.42, 17.2],
        [x, 12.55, z],
        (x + z) % 4 === 0 ? materials.shellInset : materials.shell,
        'architectural_shell',
      );
      addBox(
        group,
        `INKFALL_CEILING_RECESS_${x}_${z}`,
        [8.6, 0.08, 8.8],
        [x, 12.31, z],
        materials.blackSteel,
        'architectural_shell',
      );
    }
  }
  for (const z of [-27, -18, -9, 0, 9, 18, 27]) {
    addBox(
      group,
      `INKFALL_ROOF_TRUSS_X_${z}`,
      [74, 0.62, 0.46],
      [0, 11.86, z],
      materials.steel,
      'architectural_shell',
    );
  }
  for (const x of [-36, -18, 0, 18, 36]) {
    addBox(
      group,
      `INKFALL_ROOF_TRUSS_Z_${x}`,
      [0.46, 0.62, 58],
      [x, 11.82, 0],
      materials.oxidizedSteel,
      'architectural_shell',
    );
  }

  // Broad, slightly recessed visual decks connect the authored landmarks and
  // provide a continuous material bed beneath the exact authority surfaces.
  addBox(
    group,
    'INKFALL_PRESS_HALL_VISUAL_DECK',
    [46, 0.24, 20],
    [0, -0.28, 0],
    materials.deck,
    'route_readability',
  );
  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? 'WEST' : 'EAST';
    const teamMaterial = side < 0 ? materials.west : materials.east;
    addBox(
      group,
      `INKFALL_${sideName}_GALLERY_VISUAL_DECK`,
      [14, 0.22, 20],
      [side * 30, -0.27, 0],
      materials.deck,
      'route_readability',
    );
    addBox(
      group,
      `INKFALL_${sideName}_PRESS_LINK_VISUAL_DECK`,
      [8.2, 0.2, 11.5],
      [side * 25, -0.26, 0],
      materials.deckInset,
      'route_readability',
    );
    addBox(
      group,
      `INKFALL_${sideName}_INK_CHANNEL_VISUAL_DECK`,
      [24, 0.28, 14],
      [side * 15, -3.25, 18],
      materials.deckInset,
      'route_readability',
    );
    addBox(
      group,
      `INKFALL_${sideName}_ARCHIVE_VISUAL_DECK`,
      [24, 0.28, 14],
      [side * 15, 5.74, -18],
      materials.archive,
      'route_readability',
    );

    // Spawn galleries become readable rooms instead of exposed platforms.
    addBox(
      group,
      `INKFALL_${sideName}_SPAWN_BACKDROP`,
      [0.44, 7.8, 18],
      [side * 35.65, 3.5, 0],
      materials.shellInset,
      'spawn_pocket_dressing',
    );
    addBox(
      group,
      `INKFALL_${sideName}_SPAWN_TEAM_BAND`,
      [0.16, 0.36, 15.5],
      [side * 35.39, 3.5, 0],
      teamMaterial,
      'spawn_pocket_dressing',
    );
    // A restrained rear-wall insignia keeps team identity readable without
    // entering the standing camera frustum or resembling a traversal portal.
    addTorus(
      group,
      `INKFALL_${sideName}_SPAWN_TEAM_MEDALLION`,
      0.58,
      0.09,
      [side * 35.2, 2.2, 0],
      teamMaterial,
      'spawn_pocket_dressing',
      [0, Math.PI / 2, 0],
    );
    addFrame(
      `INKFALL_${sideName}_SPAWN_EXIT_FRAME`,
      [side * 28.8, 1.65, 0],
      4.8,
      3.3,
      0.42,
      teamMaterial,
      'spawn_pocket_dressing',
      Math.PI / 2,
    );
    for (const z of [-6, 0, 6]) {
      addBox(
        group,
        `INKFALL_${sideName}_SPAWN_CEILING_RIB_${z}`,
        [8.2, 0.1, 0.14],
        [side * 32, 3.78, z],
        materials.steel,
        'spawn_pocket_dressing',
      );
    }
    for (const z of [-5.7, -1.9, 1.9, 5.7]) {
      addBox(
        group,
        `INKFALL_${sideName}_SPAWN_LIGHT_${z}`,
        [3.4, 0.04, 0.12],
        [side * 31.3, 3.21, z],
        teamMaterial,
        'spawn_pocket_dressing',
      );
    }
    for (const z of [-4.8, 0, 4.8]) {
      addBox(
        group,
        `INKFALL_${sideName}_FLOOR_CHEVRON_A_${z}`,
        [1.7, 0.035, 0.18],
        [side * 31.7, -0.12, z - 0.46],
        teamMaterial,
        'spawn_pocket_dressing',
        [0, side * 0.6, 0],
      );
      addBox(
        group,
        `INKFALL_${sideName}_FLOOR_CHEVRON_B_${z}`,
        [1.7, 0.035, 0.18],
        [side * 31.7, -0.12, z + 0.46],
        teamMaterial,
        'spawn_pocket_dressing',
        [0, -side * 0.6, 0],
      );
    }
    addPointLight(
      `INKFALL_${sideName}_SPAWN_LIGHTING`,
      side < 0 ? 0x68e9f3 : 0xffa36d,
      1.7,
      16,
      [side * 32.2, 3.25, 0],
      'spawn_pocket_dressing',
    );

    // Upper archive platforms visibly connect to the foundry below through a
    // repeated pier-and-brace language.
    for (const xOffset of [-8, 0, 8]) {
      addBox(
        group,
        `INKFALL_${sideName}_ARCHIVE_PIER_${xOffset}`,
        [0.8, 10.6, 0.8],
        [side * 15 + xOffset, 0.45, -23.8],
        materials.oxidizedSteel,
        'understructure',
      );
      addBox(
        group,
        `INKFALL_${sideName}_ARCHIVE_BRACE_${xOffset}`,
        [0.38, 8.5, 0.38],
        [side * 15 + xOffset, 1.2, -21.5],
        materials.steel,
        'understructure',
        [Math.PI / 4, 0, 0],
      );
    }
  }

  // Exact cladding of a narrow, audited whitelist of authority boxes. These
  // meshes are visuals only and preserve collider identity in userData.
  for (const solid of fixture.solids) {
    if (
      solid.shape.type !== 'box'
      || !SPAWN_CONTAINMENT_COLLIDER_ID.test(solid.id)
    ) continue;
    const half = solid.shape.halfExtentsMm;
    const floorLike = /(?:spawn_pad|node_|spawn_pocket_floor|route_)/u.test(
      solid.id,
    );
    const frameLike = /door_frame/u.test(solid.id);
    const mesh = addBox(
      group,
      `RENDER_ONLY_CLADDING_${solid.id}`,
      [half.x * 2 / 1_000, half.y * 2 / 1_000, half.z * 2 / 1_000],
      [0, 0, 0],
      floorLike
        ? materials.deck
        : frameLike
          ? materials.steel
          : /sight_blocker/u.test(solid.id)
            ? materials.oxidizedSteel
            : materials.shellInset,
      'authority_aligned_cladding',
    );
    mesh.position.copy(mapMillimetersToScene(solid.centerMm));
    mesh.rotation.set(
      solid.rotationMilliDegrees.x * Math.PI / 180_000,
      -solid.rotationMilliDegrees.y * Math.PI / 180_000,
      -solid.rotationMilliDegrees.z * Math.PI / 180_000,
      'YXZ',
    );
    mesh.userData.authorityAlignmentColliderId = solid.id;
    authorityAlignedCladdingCount += 1;
  }

  // Press Hall: a single unmistakable machine silhouette anchors the center
  // and gives players a stable human-scale reference from every route.
  for (const x of [-8.8, 8.8]) {
    for (const z of [-7.8, 7.8]) {
      addBox(
        group,
        `INKFALL_PRESS_GANTRY_COLUMN_${x}_${z}`,
        [0.82, 10.4, 0.82],
        [x, 5.1, z],
        materials.oxidizedSteel,
        'industrial_landmark',
      );
      addBox(
        group,
        `INKFALL_PRESS_GANTRY_FOOT_${x}_${z}`,
        [1.8, 0.38, 1.8],
        [x, 0.04, z],
        materials.steel,
        'industrial_landmark',
      );
    }
  }
  addBox(
    group,
    'INKFALL_PRESS_GANTRY_CROWN_X',
    [19.4, 1.15, 1.1],
    [0, 9.75, 0],
    materials.steel,
    'industrial_landmark',
  );
  for (const z of [-7.8, 7.8]) {
    addBox(
      group,
      `INKFALL_PRESS_GANTRY_CROWN_Z_${z}`,
      [19.4, 0.8, 0.8],
      [0, 9.1, z],
      materials.oxidizedSteel,
      'industrial_landmark',
    );
  }
  addCylinder(
    group,
    'INKFALL_PRESS_MAIN_ROLLER',
    2.05,
    12.4,
    [0, 6.9, 0],
    materials.blackSteel,
    'industrial_landmark',
    [0, 0, Math.PI / 2],
    24,
  );
  for (const x of [-5.9, 5.9]) {
    addTorus(
      group,
      `INKFALL_PRESS_ROLLER_COLLAR_${x}`,
      2.1,
      0.28,
      [x, 6.9, 0],
      materials.hazard,
      'industrial_landmark',
      [0, Math.PI / 2, 0],
    );
  }
  addTorus(
    group,
    'INKFALL_INDEX_WHEEL',
    3.2,
    0.28,
    [0, 5.2, -8.65],
    materials.warm,
    'industrial_landmark',
  );
  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    addBox(
      group,
      `INKFALL_INDEX_WHEEL_SPOKE_${index}`,
      [0.24, 2.9, 0.2],
      [Math.sin(angle) * 1.45, 5.2 + Math.cos(angle) * 1.45, -8.64],
      materials.steel,
      'industrial_landmark',
      [0, 0, -angle],
    );
  }
  addPointLight(
    'INKFALL_PRESS_WARM_POOL',
    0xffad55,
    5.4,
    30,
    [0, 7, 1.5],
    'industrial_landmark',
  );

  // Ink Channel: paired vats and one continuous pipe rack make the lower tier
  // legible as the cool/teal destination.
  for (const x of [-18, 18]) {
    addCylinder(
      group,
      `INKFALL_INK_VAT_${x}`,
      2.35,
      5.4,
      [x, -1.9, 25.6],
      materials.ink,
      'industrial_landmark',
      [0, 0, 0],
      24,
    );
    addTorus(
      group,
      `INKFALL_INK_VAT_RIM_${x}`,
      2.38,
      0.22,
      [x, 0.82, 25.6],
      materials.steel,
      'industrial_landmark',
      [Math.PI / 2, 0, 0],
    );
    addCylinder(
      group,
      `INKFALL_INK_DROP_PIPE_${x}`,
      0.38,
      8.5,
      [x, 5.4, 24.8],
      materials.oxidizedSteel,
      'industrial_landmark',
    );
    addPointLight(
      `INKFALL_INK_VAT_GLOW_${x}`,
      0x30d9df,
      3.2,
      18,
      [x, 0.4, 23.5],
      'industrial_landmark',
    );
  }
  for (const x of [-27, -18, -9, 0, 9, 18, 27]) {
    addBox(
      group,
      `INKFALL_INK_CHANNEL_RIB_${x}`,
      [0.28, 8.2, 0.34],
      [x, 0.1, 27.7],
      materials.steel,
      'route_readability',
    );
  }
  addCylinder(
    group,
    'INKFALL_INK_PIPE_RACK',
    0.42,
    62,
    [0, 8.2, 25.2],
    materials.oxidizedSteel,
    'industrial_landmark',
    [0, 0, Math.PI / 2],
    16,
  );

  // Archive Walk: shelf towers, paper bales, and warm overhead bands visually
  // carry the upper route into the wall rather than leaving it floating.
  for (const x of [-27, -18, -9, 0, 9, 18, 27]) {
    addBox(
      group,
      `INKFALL_ARCHIVE_SHELF_FRAME_${x}`,
      [0.48, 9.6, 3.2],
      [x, 6.6, -27.1],
      materials.archive,
      'industrial_landmark',
    );
    for (const y of [3.2, 5.6, 8, 10.4]) {
      addBox(
        group,
        `INKFALL_ARCHIVE_SHELF_${x}_${y}`,
        [6.9, 0.18, 2.6],
        [x, y, -26.9],
        materials.steel,
        'industrial_landmark',
      );
    }
  }
  for (const x of [-22, -14, -6, 2, 10, 18, 26]) {
    addBox(
      group,
      `INKFALL_ARCHIVE_PAPER_BALE_${x}`,
      [4.2, 1.25, 1.5],
      [x, 7.25, -26.1],
      materials.paper,
      'industrial_landmark',
      [0, x % 3 * 0.03, 0],
    );
  }
  for (const x of [-24, -12, 0, 12, 24]) {
    addBox(
      group,
      `INKFALL_ARCHIVE_LIGHT_BAND_${x}`,
      [6.8, 0.08, 0.18],
      [x, 10.9, -25.2],
      materials.warm,
      'route_readability',
    );
  }
  addPointLight(
    'INKFALL_ARCHIVE_WARM_POOL_WEST',
    0xffc27a,
    3.8,
    22,
    [-16, 8.8, -21.5],
    'industrial_landmark',
  );
  addPointLight(
    'INKFALL_ARCHIVE_WARM_POOL_EAST',
    0xffc27a,
    3.8,
    22,
    [16, 8.8, -21.5],
    'industrial_landmark',
  );

  // Crosslink landmarks use distinct silhouettes and colors. The open frames
  // frame the actual authority locations without introducing visual blockers.
  addFrame(
    'INKFALL_RED_FOLD_FRAME',
    [-1.5, 1.55, 7.5],
    4.6,
    3.1,
    0.35,
    materials.red,
    'route_readability',
  );
  addBox(
    group,
    'INKFALL_RED_FOLD_BACKFIN_LEFT',
    [0.32, 6.8, 2.2],
    [-4.2, 2.1, 8.5],
    materials.shellInset,
    'industrial_landmark',
    [0, -0.36, -0.12],
  );
  addBox(
    group,
    'INKFALL_RED_FOLD_BACKFIN_RIGHT',
    [0.32, 6.8, 2.2],
    [1.2, 2.1, 8.5],
    materials.shellInset,
    'industrial_landmark',
    [0, 0.36, 0.12],
  );
  addPointLight(
    'INKFALL_RED_FOLD_GLOW',
    0xff3f38,
    4.2,
    18,
    [-1.5, 2.5, 7.5],
    'route_readability',
  );

  addBox(
    group,
    'INKFALL_PAPER_DROP_CHUTE',
    [4.4, 5.2, 3.8],
    [-4, 9.1, -8],
    materials.archive,
    'industrial_landmark',
    [0, 0.14, 0.08],
  );
  addBox(
    group,
    'INKFALL_PAPER_DROP_MOUTH',
    [3.4, 2.1, 0.28],
    [-4, 6.5, -6.1],
    materials.warm,
    'route_readability',
    [0, 0.14, 0],
  );
  for (const x of [-6.2, -1.8]) {
    addCylinder(
      group,
      `INKFALL_PAPER_DROP_CHAIN_${x}`,
      0.09,
      5.4,
      [x, 8.7, -8],
      materials.steel,
      'industrial_landmark',
    );
  }

  // Repeating wall and ceiling light bars establish a restrained material
  // rhythm across long sightlines, reducing reliance on fog alone.
  for (const x of [-30, -20, -10, 0, 10, 20, 30]) {
    addBox(
      group,
      `INKFALL_PRESS_CEILING_LIGHT_${x}`,
      [5.6, 0.06, 0.22],
      [x, 11.48, 0],
      x < 0 ? materials.west : x > 0 ? materials.east : materials.warm,
      'route_readability',
    );
  }
  for (const z of [-21, -14, -7, 0, 7, 14, 21]) {
    addBox(
      group,
      `INKFALL_WEST_WALL_LIGHT_${z}`,
      [0.08, 3.2, 0.18],
      [-36.42, 4.8, z],
      materials.west,
      'route_readability',
    );
    addBox(
      group,
      `INKFALL_EAST_WALL_LIGHT_${z}`,
      [0.08, 3.2, 0.18],
      [36.42, 4.8, z],
      materials.east,
      'route_readability',
    );
  }

  group.userData.meshCount = meshCount;
  group.userData.lightCount = lightCount;
  group.userData.authorityAlignedCladdingCount =
    authorityAlignedCladdingCount;
  group.userData.authorityContract = Object.freeze({
    fixtureUnmodified: true,
    renderMeshesMayBeAuthority: false,
    noHit: true,
    expectedAuthorityColliderCount: 339,
    expectedSpawnCount: 12,
    expectedZoneCount: 9,
  });

  return Object.freeze({
    group,
    meshCount,
    lightCount,
    authorityAlignedCladdingCount,
  });
}
