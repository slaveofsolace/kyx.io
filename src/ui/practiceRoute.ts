import {
  KYX_MODE_ID,
  type KyxDeathmatchAuthorityModeId,
} from '../authority/modes/modeCatalog';

const PRACTICE_REVIEW_QUERY_KEYS = Object.freeze([
  'g6Candidate',
  'g6Population',
] as const);

function isLocalPracticeMatchMode(
  value: unknown,
): value is KyxDeathmatchAuthorityModeId {
  return value === KYX_MODE_ID.teamDeathmatch
    || value === KYX_MODE_ID.freeForAll
    || value === KYX_MODE_ID.instagib;
}

export function parsePracticeMatchMode(
  search = '',
): KyxDeathmatchAuthorityModeId {
  const source = new URLSearchParams(search);
  const values = source.getAll('match');
  if (values.length === 0) return KYX_MODE_ID.teamDeathmatch;
  if (values.length !== 1 || !isLocalPracticeMatchMode(values[0])) {
    throw new RangeError('The requested Practice match mode is unavailable.');
  }
  return values[0];
}

/**
 * Preserve only explicit character-review identity while moving from the menu
 * into Practice. All unrelated lobby, room, redirect, and tracking parameters
 * are intentionally dropped at this trust boundary.
 */
export function buildPracticeHref(
  search = '',
  matchMode?: KyxDeathmatchAuthorityModeId,
): string {
  const source = new URLSearchParams(search);
  const target = new URLSearchParams();
  for (const key of PRACTICE_REVIEW_QUERY_KEYS) {
    const value = source.get(key);
    if (value) target.set(key, value);
  }
  let selectedMatchMode = matchMode;
  if (selectedMatchMode === undefined) {
    const values = source.getAll('match');
    selectedMatchMode = values.length === 1 && isLocalPracticeMatchMode(values[0])
      ? values[0]
      : KYX_MODE_ID.teamDeathmatch;
  } else if (!isLocalPracticeMatchMode(selectedMatchMode)) {
    throw new RangeError('The requested Practice match mode is unavailable.');
  }
  if (selectedMatchMode !== KYX_MODE_ID.teamDeathmatch) {
    target.set('match', selectedMatchMode);
  }
  const query = target.toString();
  return query ? `/practice?${query}` : '/practice';
}
