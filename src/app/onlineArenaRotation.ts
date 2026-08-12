import {
  ONLINE_CROWNPOINT_REV1_COMBAT_PROFILE_ID,
  ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
  ONLINE_SWITCHYARD_REV1_COMBAT_PROFILE_ID,
  type OnlineAuthorityProfileSelection,
} from './onlineAuthorityProfiles';

export const ONLINE_ARENA_ROTATION = Object.freeze([
  ONLINE_RELAY_REV1_COMBAT_PROFILE_ID,
  ONLINE_SWITCHYARD_REV1_COMBAT_PROFILE_ID,
  ONLINE_CROWNPOINT_REV1_COMBAT_PROFILE_ID,
] as const);

export type RotatingOnlineArenaProfile = (typeof ONLINE_ARENA_ROTATION)[number];

export function isRotatingOnlineArenaProfile(
  profile: OnlineAuthorityProfileSelection,
): profile is RotatingOnlineArenaProfile {
  return ONLINE_ARENA_ROTATION.some((candidate) => candidate === profile);
}

export function nextOnlineArenaProfile(
  current: OnlineAuthorityProfileSelection,
): OnlineAuthorityProfileSelection {
  if (!isRotatingOnlineArenaProfile(current)) return current;
  const index = ONLINE_ARENA_ROTATION.indexOf(current);
  return ONLINE_ARENA_ROTATION[(index + 1) % ONLINE_ARENA_ROTATION.length];
}
