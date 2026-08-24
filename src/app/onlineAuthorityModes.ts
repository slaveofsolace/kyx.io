import type { KyxDeathmatchAuthorityModeId } from '../authority/modes/modeCatalog';

export const ONLINE_AUTHORITY_MATCH_MODE_ID = Object.freeze({
  teamDeathmatch: 'team_deathmatch',
  freeForAll: 'free_for_all',
  instagib: 'instagib',
} as const);

export type OnlineAuthorityMatchMode = KyxDeathmatchAuthorityModeId;

export function isOnlineAuthorityMatchMode(
  value: unknown,
): value is OnlineAuthorityMatchMode {
  return value === ONLINE_AUTHORITY_MATCH_MODE_ID.teamDeathmatch
    || value === ONLINE_AUTHORITY_MATCH_MODE_ID.freeForAll
    || value === ONLINE_AUTHORITY_MATCH_MODE_ID.instagib;
}

export function defaultOnlineAuthorityMatchMode(): OnlineAuthorityMatchMode {
  return ONLINE_AUTHORITY_MATCH_MODE_ID.teamDeathmatch;
}

export function onlineAuthorityMatchModeLabel(mode: OnlineAuthorityMatchMode): string {
  if (mode === ONLINE_AUTHORITY_MATCH_MODE_ID.freeForAll) return 'Free For All';
  if (mode === ONLINE_AUTHORITY_MATCH_MODE_ID.instagib) return 'Instagib';
  return 'Team Deathmatch';
}

export function isOnlineIndividualDeathmatchMode(mode: OnlineAuthorityMatchMode): boolean {
  return mode !== ONLINE_AUTHORITY_MATCH_MODE_ID.teamDeathmatch;
}
