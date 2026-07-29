import inkfallRevision3MapPackage
  from '../../assets/source/maps/inkfall-foundry/revisions/revision-3/runtime/map.package.v3.json';

export const ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID =
  'p511-inkfall-foundry-revision-2-combat-v1' as const;
export const ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID =
  'g5-inkfall-foundry-rev4-revision-3-authority-v1' as const;
// The profile id remains wire-compatible with existing room checkpoints.
export const ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID =
  ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID;

export type OnlineAuthorityProfileSelection =
  | typeof ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID
  | typeof ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID;

export const ONLINE_INKFALL_REV2_MAP_BINDING = Object.freeze({
  mapReference: 'inkfall_foundry@2',
  mapId: 'inkfall_foundry',
  mapRevision: 2,
  packageDigest: '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520',
  fixtureId: 'inkfall_foundry_map_collision',
  fixtureHash: 'bf85e42731fd088e',
  xAxis: 'east',
  yAxis: 'up',
  zAxis: 'north',
  origin: 'press_core_floor_contact',
  gltfToMap: 'x_y_negative_z',
  distanceUnit: 'millimeters',
  angleUnit: 'milli_degrees',
  colliderCardinality: 339,
  spawns: Object.freeze([
    Object.freeze({
      spawnId: 'spawn_w_press_a',
      set: 'west_team',
      feetPosition: Object.freeze({ x: -33_500, y: 0, z: -3_500 }),
      yawMilliDegrees: 0,
    }),
    Object.freeze({
      spawnId: 'spawn_e_press_a',
      set: 'east_team',
      feetPosition: Object.freeze({ x: 33_500, y: 0, z: 3_500 }),
      yawMilliDegrees: 180_000,
    }),
    Object.freeze({
      spawnId: 'spawn_w_press_b',
      set: 'west_team',
      feetPosition: Object.freeze({ x: -33_500, y: 0, z: 3_500 }),
      yawMilliDegrees: 0,
    }),
    Object.freeze({
      spawnId: 'spawn_e_press_b',
      set: 'east_team',
      feetPosition: Object.freeze({ x: 33_500, y: 0, z: -3_500 }),
      yawMilliDegrees: 180_000,
    }),
    Object.freeze({
      spawnId: 'spawn_w_ink',
      set: 'west_team',
      feetPosition: Object.freeze({ x: -30_500, y: 0, z: -7_000 }),
      yawMilliDegrees: -25_000,
    }),
    Object.freeze({
      spawnId: 'spawn_e_ink',
      set: 'east_team',
      feetPosition: Object.freeze({ x: 30_500, y: 0, z: -7_000 }),
      yawMilliDegrees: -155_000,
    }),
    Object.freeze({
      spawnId: 'spawn_w_archive',
      set: 'west_team',
      feetPosition: Object.freeze({ x: -30_500, y: 0, z: 7_000 }),
      yawMilliDegrees: 25_000,
    }),
    Object.freeze({
      spawnId: 'spawn_e_archive',
      set: 'east_team',
      feetPosition: Object.freeze({ x: 30_500, y: 0, z: 7_000 }),
      yawMilliDegrees: 155_000,
    }),
  ]),
} as const);

export type OnlineInkfallRevision2MapBinding =
  typeof ONLINE_INKFALL_REV2_MAP_BINDING;

const ONLINE_INKFALL_REV4_LOCKED_SPAWN_ORDER = Object.freeze([
  'spawn_w_press_a',
  'spawn_e_press_a',
  'spawn_w_press_b',
  'spawn_e_press_b',
  'spawn_w_ink',
  'spawn_e_ink',
  'spawn_w_archive',
  'spawn_e_archive',
  'spawn_dm_ink_w',
  'spawn_dm_ink_e',
  'spawn_dm_archive_w',
  'spawn_dm_archive_e',
] as const);

const revision3SpawnsById = new Map(
  inkfallRevision3MapPackage.spawns.map((spawn) => [spawn.id, spawn]),
);

const ONLINE_INKFALL_REV4_SPAWNS = Object.freeze(
  ONLINE_INKFALL_REV4_LOCKED_SPAWN_ORDER.map((spawnId) => {
    const spawn = revision3SpawnsById.get(spawnId);
    if (spawn === undefined) {
      throw new Error(`ONLINE_INKFALL_REV4_SPAWN_MISSING:${spawnId}`);
    }
    return Object.freeze({
      spawnId: spawn.id,
      set: spawn.set,
      feetPosition: Object.freeze({ ...spawn.feetPositionMm }),
      yawMilliDegrees: spawn.yawMilliDegrees,
      escapeRouteFamilies: Object.freeze([...spawn.escapeRouteFamilies]),
      validationStatus: spawn.validationStatus,
    });
  }),
);

export const ONLINE_INKFALL_REV5_MAP_BINDING = Object.freeze({
  mapReference: 'inkfall_foundry@3',
  presentationReference:
    'inkfall_foundry@3/press_archive/v5.0/geometry-portal-modular',
  mapId: 'inkfall_foundry',
  mapRevision: 3,
  packageDigest: '4027934730af7c855b0abcee1b36cc256294e3e5c22a6ffb8aa02a77f71d196a',
  fixtureId: 'inkfall_foundry_map_collision',
  fixtureHash: '97eb7772ac59dc95',
  xAxis: 'east',
  yAxis: 'up',
  zAxis: 'north',
  origin: 'press_core_floor_contact',
  gltfToMap: 'x_y_negative_z',
  distanceUnit: 'millimeters',
  angleUnit: 'milli_degrees',
  colliderCardinality: 339,
  render: Object.freeze({
    role: 'render_only',
    path:
      'art-kit/press-archive-rev5/rev5/export/inkfall_foundry_rev5_geometry_portal.render-only-modules.glb',
    sha256: '7f9fb6064b514bcfc1ce962357c30eaa71e6539a5aa3dc5115cc73f1bba927d3',
    bytes: 3_232_668,
    renderMeshesMayBeAuthority: false,
  }),
  collision: Object.freeze({
    role: 'authority_collision',
    path: 'revisions/revision-3/export/collision.authority.glb',
    sha256: '1cce637ab4f83766627527b3885c3e9da819d8bcabdfa2144f8dc6b46bc5bba8',
    bytes: 605_112,
  }),
  supportedModes: Object.freeze(['deathmatch', 'team_deathmatch']),
  spawns: ONLINE_INKFALL_REV4_SPAWNS,
  zones: Object.freeze(inkfallRevision3MapPackage.zones.map((zone) => Object.freeze({
    zoneId: zone.id,
    callout: zone.callout,
    family: zone.family,
    center: Object.freeze({ ...zone.centerMm }),
    halfExtents: Object.freeze({ ...zone.halfExtentsMm }),
  }))),
  pickups: Object.freeze([]),
  triggers: Object.freeze(inkfallRevision3MapPackage.triggers.map((trigger) => Object.freeze({
    ...trigger,
    centerMm: Object.freeze({ ...trigger.centerMm }),
    halfExtentsMm: Object.freeze({ ...trigger.halfExtentsMm }),
    destinationFeetMm: Object.freeze({ ...trigger.destinationFeetMm }),
  }))),
  portal: Object.freeze({
    capabilityId: 'inkfall_rev5_linked_world_portal_v1',
    authorityRole: 'additive_server_authority',
    renderRole: 'rev5_render_only_no_hit',
    endpointCount: 2,
  }),
  telemetry: Object.freeze({
    schemaVersion: 1,
    authoritySource: 'durable_object_room_metrics_v1',
    counters: Object.freeze([
      'connectedPlayers',
      'receivedCommands',
      'rejectedCommands',
      'resumeSuccesses',
      'authorityTickExecution',
      'transport',
    ]),
    zoneCount: 9,
    pickupCount: 0,
  }),
} as const);

// Source compatibility for code and persisted selections that still use Rev4
// naming while presenting the additive Rev5 candidate.
export const ONLINE_INKFALL_REV4_MAP_BINDING =
  ONLINE_INKFALL_REV5_MAP_BINDING;

export type OnlineInkfallRevision4MapBinding =
  typeof ONLINE_INKFALL_REV4_MAP_BINDING;
export type OnlineInkfallRevision5MapBinding =
  typeof ONLINE_INKFALL_REV5_MAP_BINDING;
export type OnlineInkfallMapBinding =
  | OnlineInkfallRevision2MapBinding
  | OnlineInkfallRevision4MapBinding;

export function isOnlineInkfallAuthorityProfile(
  value: OnlineAuthorityProfileSelection | null,
): value is OnlineAuthorityProfileSelection {
  return value === ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID
    || value === ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID;
}

export function onlineInkfallMapBinding(
  profile: OnlineAuthorityProfileSelection,
): OnlineInkfallMapBinding {
  return profile === ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID
    ? ONLINE_INKFALL_REV4_MAP_BINDING
    : ONLINE_INKFALL_REV2_MAP_BINDING;
}

export function isOnlineAuthorityProfileSelection(
  value: string | null,
): value is OnlineAuthorityProfileSelection {
  return value === ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID
    || value === ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID;
}
