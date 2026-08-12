import {
  INKFALL_REVISION_2_AUTHORITY_MAP_BINDING,
  INKFALL_REVISION_2_AUTHORITY_PROFILE_ID,
  INKFALL_REVISION_3_AUTHORITY_MAP_BINDING,
  INKFALL_REVISION_3_AUTHORITY_PROFILE_ID,
  INKFALL_REVISION_4_AUTHORITY_MAP_BINDING,
  INKFALL_REVISION_5_AUTHORITY_PROFILE_ID,
  inkfallAuthorityMapBinding,
  isInkfallAuthorityProfile,
  type InkfallAuthorityMapBinding,
  type InkfallAuthorityProfile,
  type InkfallRevision2AuthorityMapBinding,
  type InkfallRevision3AuthorityMapBinding,
  type InkfallRevision4AuthorityMapBinding,
} from '../authority/inkfallRoomFactory';
import {
  RELAY_AUTHORITY_MAP_BINDING,
  RELAY_AUTHORITY_PROFILE_ID,
  isRelayAuthorityProfile,
  type RelayAuthorityMapBinding,
} from '../authority/relayAuthority';
import {
  CROWNPOINT_AUTHORITY_MAP_BINDING,
  CROWNPOINT_AUTHORITY_PROFILE_ID,
  SWITCHYARD_AUTHORITY_MAP_BINDING,
  SWITCHYARD_AUTHORITY_PROFILE_ID,
  isOriginalArenaAuthorityProfile,
  originalArenaAuthorityMapBinding,
  type OriginalArenaAuthorityMapBinding,
  type OriginalArenaAuthorityProfile,
} from '../authority/originalArenaAuthority';

export const ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID =
  INKFALL_REVISION_2_AUTHORITY_PROFILE_ID;
export const ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID =
  INKFALL_REVISION_3_AUTHORITY_PROFILE_ID;
export const ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID =
  INKFALL_REVISION_5_AUTHORITY_PROFILE_ID;
export const ONLINE_RELAY_REV1_COMBAT_PROFILE_ID =
  RELAY_AUTHORITY_PROFILE_ID;
export const ONLINE_SWITCHYARD_REV1_COMBAT_PROFILE_ID =
  SWITCHYARD_AUTHORITY_PROFILE_ID;
export const ONLINE_CROWNPOINT_REV1_COMBAT_PROFILE_ID =
  CROWNPOINT_AUTHORITY_PROFILE_ID;

export type OnlineAuthorityProfileSelection =
  | InkfallAuthorityProfile
  | OriginalArenaAuthorityProfile
  | typeof ONLINE_RELAY_REV1_COMBAT_PROFILE_ID;
export type OnlineInkfallProfileSelection = InkfallAuthorityProfile;
export type OnlineOriginalArenaProfileSelection = OriginalArenaAuthorityProfile;

export const ONLINE_INKFALL_REV2_MAP_BINDING =
  INKFALL_REVISION_2_AUTHORITY_MAP_BINDING;
export const ONLINE_INKFALL_REV5_MAP_BINDING =
  INKFALL_REVISION_4_AUTHORITY_MAP_BINDING;
// Source compatibility for persisted selections and evidence profile naming.
export const ONLINE_INKFALL_REV4_MAP_BINDING =
  INKFALL_REVISION_3_AUTHORITY_MAP_BINDING;
export const ONLINE_RELAY_REV1_MAP_BINDING = RELAY_AUTHORITY_MAP_BINDING;
export const ONLINE_SWITCHYARD_REV1_MAP_BINDING = SWITCHYARD_AUTHORITY_MAP_BINDING;
export const ONLINE_CROWNPOINT_REV1_MAP_BINDING = CROWNPOINT_AUTHORITY_MAP_BINDING;

export type OnlineInkfallRevision2MapBinding =
  InkfallRevision2AuthorityMapBinding;
export type OnlineInkfallRevision4MapBinding =
  InkfallRevision3AuthorityMapBinding;
export type OnlineInkfallRevision5MapBinding =
  InkfallRevision4AuthorityMapBinding;
export type OnlineInkfallMapBinding = InkfallAuthorityMapBinding;
export type OnlineRelayMapBinding = RelayAuthorityMapBinding;
export type OnlineOriginalArenaMapBinding = OriginalArenaAuthorityMapBinding;
export type OnlineAuthorityMapBinding =
  | OnlineInkfallMapBinding
  | OnlineOriginalArenaMapBinding
  | OnlineRelayMapBinding;

export function isOnlineInkfallAuthorityProfile(
  value: OnlineAuthorityProfileSelection | null,
): value is InkfallAuthorityProfile {
  return isInkfallAuthorityProfile(value);
}

export function isOnlineRelayAuthorityProfile(
  value: OnlineAuthorityProfileSelection | null,
): value is typeof ONLINE_RELAY_REV1_COMBAT_PROFILE_ID {
  return isRelayAuthorityProfile(value);
}

export function isOnlineOriginalArenaAuthorityProfile(
  value: OnlineAuthorityProfileSelection | null,
): value is OriginalArenaAuthorityProfile {
  return isOriginalArenaAuthorityProfile(value);
}

export function onlineInkfallMapBinding(
  profile: InkfallAuthorityProfile,
): OnlineInkfallMapBinding {
  return inkfallAuthorityMapBinding(profile);
}

export function isOnlineAuthorityProfileSelection(
  value: string | null,
): value is OnlineAuthorityProfileSelection {
  return isInkfallAuthorityProfile(value)
    || isOriginalArenaAuthorityProfile(value)
    || isRelayAuthorityProfile(value);
}

export function onlineAuthorityMapBinding(
  profile: OnlineAuthorityProfileSelection,
): OnlineAuthorityMapBinding {
  if (isRelayAuthorityProfile(profile)) return ONLINE_RELAY_REV1_MAP_BINDING;
  if (isOriginalArenaAuthorityProfile(profile)) {
    return originalArenaAuthorityMapBinding(profile);
  }
  return inkfallAuthorityMapBinding(profile);
}
