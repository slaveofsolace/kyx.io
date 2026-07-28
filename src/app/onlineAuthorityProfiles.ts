import inkfallRevision3MapPackage
  from '../../assets/source/maps/inkfall-foundry/revisions/revision-3/runtime/map.package.v3.json';

export const ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID =
  'p511-inkfall-foundry-revision-2-combat-v1' as const;
export const ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID =
  'g5-inkfall-foundry-rev4-revision-3-authority-v1' as const;

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

export const ONLINE_INKFALL_REV4_MAP_BINDING = Object.freeze({
  mapReference: 'inkfall_foundry@3',
  presentationReference:
    'inkfall_foundry@3/press_archive/v4.1/spatial-material-joined',
  mapId: 'inkfall_foundry',
  mapRevision: 3,
  packageDigest: '260b90de2e0c2d51fa01e166d11401a04a1cb76943042de9993e85560e37f39a',
  fixtureId: 'inkfall_foundry_map_collision',
  fixtureHash: '6cf785c5171f2ff5',
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
      'art-kit/press-archive-rev4/rev4/export/inkfall_foundry_press_archive_rev4.spatial-material-joined.glb',
    sha256: '5e2aa22cc598f49181524ce78b481adf091f71a91a823171277963de11d4db00',
    bytes: 12_954_608,
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

export type OnlineInkfallRevision4MapBinding =
  typeof ONLINE_INKFALL_REV4_MAP_BINDING;
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
