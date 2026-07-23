export const ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID =
  'p511-inkfall-foundry-revision-2-combat-v1' as const;

export type OnlineAuthorityProfileSelection =
  typeof ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID;

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

export function isOnlineAuthorityProfileSelection(
  value: string | null,
): value is OnlineAuthorityProfileSelection {
  return value === ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID;
}
