import * as THREE from 'three';

export interface RelayArchitectureSkin {
  readonly group: THREE.Group;
  readonly meshCount: number;
  readonly lightCount: number;
}

interface SkinFacts {
  meshCount: number;
  lightCount: number;
}

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

function addBox(
  parent: THREE.Group,
  facts: SkinFacts,
  definition: Readonly<{
    name: string;
    position: readonly [number, number, number];
    size: readonly [number, number, number];
    material: THREE.Material;
    role: string;
  }>,
  visualContinuityVersion: string,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      definition.size[0],
      definition.size[1],
      definition.size[2],
    ),
    definition.material,
  );
  mesh.name = definition.name;
  mesh.position.set(...definition.position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mark(mesh, definition.role, visualContinuityVersion);
  parent.add(mesh);
  facts.meshCount += 1;
  return mesh;
}

/**
 * A restrained, render-only surfacing layer placed flush against Relay's
 * authority geometry. Nothing here defines collision or creates a route that
 * the authority fixture does not already own.
 */
export function createRelayArchitectureSkin(
  visualContinuityVersion: string,
): RelayArchitectureSkin {
  const group = new THREE.Group();
  group.name = 'RELAY_ARCHITECTURAL_SKIN_V3';
  mark(group, 'relay_architectural_skin_root', visualContinuityVersion);
  const facts: SkinFacts = { meshCount: 0, lightCount: 0 };

  const darkMetal = material('RELAY_SKIN_DARK_METAL', 0x172a30, {
    metalness: 0.72,
    roughness: 0.34,
  });
  const ceramic = material('RELAY_SKIN_CERAMIC', 0x82938f, {
    metalness: 0.12,
    roughness: 0.68,
  });
  const cyan = material('RELAY_SKIN_WEST_SIGNAL', 0x4abfc7, {
    emissive: 0x196e77,
    emissiveIntensity: 0.58,
    metalness: 0.2,
    roughness: 0.4,
  });
  const amber = material('RELAY_SKIN_EAST_SIGNAL', 0xd38b4f, {
    emissive: 0x74401f,
    emissiveIntensity: 0.55,
    metalness: 0.2,
    roughness: 0.4,
  });

  // The paired gates are seated into authored wall/rail assemblies instead of
  // reading as energy decals pasted onto raw authority cladding. Every member
  // stays flush with an existing boundary, floor, or overlook rail footprint.
  // The cyan service bay is deliberately heavier and protected; the amber
  // overlook bay is lighter so it preserves the long sight line back to court.
  for (const [side, definition] of ([
    {
      id: 'SERVICE',
      signal: cyan,
      z: 20.72,
      centerY: -1.42,
      headerY: 0.22,
      sillY: -2.92,
      backplaneY: -1.38,
      backplaneHeight: 3.28,
    },
    {
      id: 'OVERLOOK',
      signal: amber,
      z: -21.72,
      centerY: 5.36,
      headerY: 7,
      sillY: 3.96,
      backplaneY: 5.4,
      backplaneHeight: 3.18,
    },
  ] as const).entries()) {
    addBox(group, facts, {
      name: `RELAY_${definition.id}_PORTAL_BACKPLANE`,
      position: [0, definition.backplaneY, definition.z + (side === 0 ? 0.12 : -0.12)],
      size: [5.35, definition.backplaneHeight, 0.12],
      material: darkMetal,
      role: 'authority_boundary_portal_backplane',
    }, visualContinuityVersion);
    for (const x of [-2.08, 2.08] as const) {
      addBox(group, facts, {
        name: `RELAY_${definition.id}_PORTAL_JAMB_${x < 0 ? 'WEST' : 'EAST'}`,
        position: [x, definition.centerY, definition.z],
        size: [0.34, 3.28, 0.34],
        material: ceramic,
        role: 'authority_boundary_portal_jamb',
      }, visualContinuityVersion);
      addBox(group, facts, {
        name: `RELAY_${definition.id}_PORTAL_SIGNAL_${x < 0 ? 'WEST' : 'EAST'}`,
        position: [x * 0.86, definition.centerY, definition.z - (side === 0 ? 0.19 : -0.19)],
        size: [0.07, 2.52, 0.07],
        material: definition.signal,
        role: 'portal_route_signal_inlay',
      }, visualContinuityVersion);
    }
    addBox(group, facts, {
      name: `RELAY_${definition.id}_PORTAL_HEADER`,
      position: [0, definition.headerY, definition.z],
      size: [4.5, 0.34, 0.34],
      material: ceramic,
      role: 'authority_boundary_portal_header',
    }, visualContinuityVersion);
    addBox(group, facts, {
      name: `RELAY_${definition.id}_PORTAL_SILL`,
      position: [0, definition.sillY, definition.z - (side === 0 ? 0.34 : -0.34)],
      size: [4.5, 0.12, 0.92],
      material: darkMetal,
      role: 'authority_floor_portal_sill',
    }, visualContinuityVersion);
  }

  // Thin fascia follows the real upper bridge and side decks. The pieces sit
  // inside the collision volume rather than presenting false solid ledges.
  for (const [index, definition] of ([
    { position: [0, 3.57, -8.14], size: [14, 0.18, 0.12] },
    { position: [0, 3.57, -11.86], size: [14, 0.18, 0.12] },
    { position: [-10.5, 3.57, -6.51], size: [7, 0.18, 0.12] },
    { position: [10.5, 3.57, -6.51], size: [7, 0.18, 0.12] },
    { position: [-10.5, 3.57, -13.49], size: [7, 0.18, 0.12] },
    { position: [10.5, 3.57, -13.49], size: [7, 0.18, 0.12] },
  ] as const).entries()) {
    addBox(group, facts, {
      name: `RELAY_UPPER_DECK_FASCIA_${index + 1}`,
      position: definition.position,
      size: definition.size,
      material: darkMetal,
      role: 'authority_surface_fascia',
    }, visualContinuityVersion);
  }

  // Flush underside bands connect the bridge deck into one authored assembly
  // instead of a stack of unrelated pale slabs. They stay inside the real
  // deck/support silhouette and cannot be mistaken for new traversal.
  for (const [index, definition] of ([
    { position: [0, 3.52, -10], size: [13.8, 0.1, 3.55] },
    { position: [-10.5, 3.52, -10], size: [6.8, 0.1, 6.75] },
    { position: [10.5, 3.52, -10], size: [6.8, 0.1, 6.75] },
  ] as const).entries()) {
    addBox(group, facts, {
      name: `RELAY_UPPER_DECK_UNDERSIDE_BAND_${index + 1}`,
      position: definition.position,
      size: definition.size,
      material: darkMetal,
      role: 'authority_surface_underside_band',
    }, visualContinuityVersion);
  }

  // West/east boundary panel rhythm gives each spawn a designed identity
  // without turning the whole floor into a saturated team color.
  for (const side of [-1, 1] as const) {
    const signal = side < 0 ? cyan : amber;
    addBox(group, facts, {
      name: side < 0
        ? 'RELAY_WEST_SPAWN_SIGNAL_PANEL'
        : 'RELAY_EAST_SPAWN_SIGNAL_PANEL',
      position: [side * 33.46, 0.72, 0],
      size: [0.07, 1.12, 7.4],
      material: signal,
      role: 'spawn_boundary_signal_panel',
    }, visualContinuityVersion);

    for (const [index, z] of [-16, -8, 8, 16].entries()) {
      addBox(group, facts, {
        name: `RELAY_${side < 0 ? 'WEST' : 'EAST'}_BOUNDARY_SEAM_${index + 1}`,
        position: [side * 33.44, 0.72, z],
        size: [0.09, 1.55, 0.15],
        material: darkMetal,
        role: 'authority_boundary_surface_seam',
      }, visualContinuityVersion);
    }

    const light = new THREE.PointLight(
      side < 0 ? 0x72e9f2 : 0xffb66f,
      0.92,
      11,
      1.9,
    );
    light.name = side < 0
      ? 'RELAY_WEST_SPAWN_READABILITY_LIGHT'
      : 'RELAY_EAST_SPAWN_READABILITY_LIGHT';
    light.position.set(side * 30.5, 2.2, 0);
    mark(light, 'spawn_readability_light', visualContinuityVersion);
    group.add(light);
    facts.lightCount += 1;
  }

  // Lower court receives a continuous structural datum and short vertical
  // ribs. These are shallow accents on existing walls/floors, not cover.
  for (const [index, x] of [-20, -12, -4, 4, 12, 20].entries()) {
    addBox(group, facts, {
      name: `RELAY_LOWER_COURT_RIB_${index + 1}`,
      position: [x, -1.82, 20.91],
      size: [0.18, 2.15, 0.12],
      material: index % 2 === 0 ? ceramic : darkMetal,
      role: 'lower_route_surface_rib',
    }, visualContinuityVersion);
  }
  addBox(group, facts, {
    name: 'RELAY_LOWER_COURT_DATUM',
    position: [0, -2.96, 20.88],
    size: [47.5, 0.1, 0.12],
    material: cyan,
    role: 'lower_route_signal_datum',
  }, visualContinuityVersion);

  // Repeated low-profile floor battens add material rhythm without becoming
  // fake cover or changing traversal. They sit inside the proven center slab.
  for (const [index, x] of [-9, -3, 3, 9].entries()) {
    addBox(group, facts, {
      name: `RELAY_CENTER_DECK_PANEL_BREAK_${index + 1}`,
      position: [x, 0.018, 0],
      size: [0.055, 0.018, 12.8],
      material: darkMetal,
      role: 'authority_floor_panel_break',
    }, visualContinuityVersion);
  }

  // Small flush armor plates break up the central cover silhouettes while
  // preserving the exact cover footprint.
  for (const [index, position] of ([
    [-5.5, 0.72, -5.66],
    [5.5, 0.72, 5.66],
    [5.8, 1.22, -6.46],
    [-5.8, 1.22, 6.46],
  ] as const).entries()) {
    addBox(group, facts, {
      name: `RELAY_COURT_COVER_FACEPLATE_${index + 1}`,
      position,
      size: index < 2 ? [1.9, 0.38, 0.06] : [1.15, 0.56, 0.06],
      material: index % 2 === 0 ? cyan : amber,
      role: 'authority_cover_surface_plate',
    }, visualContinuityVersion);
  }

  group.userData.meshCount = facts.meshCount;
  group.userData.lightCount = facts.lightCount;
  group.userData.authorityGeometryAdded = false;
  group.userData.humanAccepted = false;
  return Object.freeze({
    group,
    meshCount: facts.meshCount,
    lightCount: facts.lightCount,
  });
}
