import {
  INKFALL_REVISION_2_AUTHORITY_MAP_BINDING,
  INKFALL_REVISION_2_AUTHORITY_PROFILE_ID,
  INKFALL_REVISION_3_AUTHORITY_MAP_BINDING,
  INKFALL_REVISION_3_AUTHORITY_PROFILE_ID,
  INKFALL_REVISION_5_AUTHORITY_PROFILE_ID,
  inkfallAuthorityMapBinding,
  isInkfallAuthorityProfile,
  type InkfallAuthorityMapBinding,
  type InkfallAuthorityProfile,
  type InkfallRevision2AuthorityMapBinding,
  type InkfallRevision3AuthorityMapBinding,
} from '../authority/inkfallRoomFactory';

export const ONLINE_INKFALL_REV2_COMBAT_PROFILE_ID =
  INKFALL_REVISION_2_AUTHORITY_PROFILE_ID;
export const ONLINE_INKFALL_REV4_COMBAT_PROFILE_ID =
  INKFALL_REVISION_3_AUTHORITY_PROFILE_ID;
// The profile id remains wire-compatible with existing room checkpoints.
export const ONLINE_INKFALL_REV5_COMBAT_PROFILE_ID =
  INKFALL_REVISION_5_AUTHORITY_PROFILE_ID;

export type OnlineAuthorityProfileSelection = InkfallAuthorityProfile;

export const ONLINE_INKFALL_REV2_MAP_BINDING =
  INKFALL_REVISION_2_AUTHORITY_MAP_BINDING;
export const ONLINE_INKFALL_REV5_MAP_BINDING =
  INKFALL_REVISION_3_AUTHORITY_MAP_BINDING;
// Source compatibility for persisted selections and evidence profile naming.
export const ONLINE_INKFALL_REV4_MAP_BINDING =
  ONLINE_INKFALL_REV5_MAP_BINDING;

export type OnlineInkfallRevision2MapBinding =
  InkfallRevision2AuthorityMapBinding;
export type OnlineInkfallRevision4MapBinding =
  InkfallRevision3AuthorityMapBinding;
export type OnlineInkfallRevision5MapBinding =
  InkfallRevision3AuthorityMapBinding;
export type OnlineInkfallMapBinding = InkfallAuthorityMapBinding;

export function isOnlineInkfallAuthorityProfile(
  value: OnlineAuthorityProfileSelection | null,
): value is OnlineAuthorityProfileSelection {
  return isInkfallAuthorityProfile(value);
}

export function onlineInkfallMapBinding(
  profile: OnlineAuthorityProfileSelection,
): OnlineInkfallMapBinding {
  return inkfallAuthorityMapBinding(profile);
}

export function isOnlineAuthorityProfileSelection(
  value: string | null,
): value is OnlineAuthorityProfileSelection {
  return isInkfallAuthorityProfile(value);
}
