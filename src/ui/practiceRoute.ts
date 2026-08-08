const PRACTICE_REVIEW_QUERY_KEYS = Object.freeze([
  'g6Candidate',
  'g6Population',
] as const);

/**
 * Preserve only explicit character-review identity while moving from the menu
 * into Practice. All unrelated lobby, room, redirect, and tracking parameters
 * are intentionally dropped at this trust boundary.
 */
export function buildPracticeHref(search = ''): string {
  const source = new URLSearchParams(search);
  const target = new URLSearchParams();
  for (const key of PRACTICE_REVIEW_QUERY_KEYS) {
    const value = source.get(key);
    if (value) target.set(key, value);
  }
  const query = target.toString();
  return query ? `/practice?${query}` : '/practice';
}
