export const ONLINE_AUTHORITY_MATCH_MODE_ID = Object.freeze({
  teamDeathmatch: 'team_deathmatch',
  freeForAll: 'free_for_all',
} as const);

export type OnlineAuthorityMatchMode =
  typeof ONLINE_AUTHORITY_MATCH_MODE_ID[keyof typeof ONLINE_AUTHORITY_MATCH_MODE_ID];

export function isOnlineAuthorityMatchMode(
  value: unknown,
): value is OnlineAuthorityMatchMode {
  return value === ONLINE_AUTHORITY_MATCH_MODE_ID.teamDeathmatch
    || value === ONLINE_AUTHORITY_MATCH_MODE_ID.freeForAll;
}

export function defaultOnlineAuthorityMatchMode(): OnlineAuthorityMatchMode {
  return ONLINE_AUTHORITY_MATCH_MODE_ID.teamDeathmatch;
}

export function onlineAuthorityMatchModeLabel(mode: OnlineAuthorityMatchMode): string {
  return mode === ONLINE_AUTHORITY_MATCH_MODE_ID.freeForAll
    ? 'Free For All'
    : 'Team Deathmatch';
}
