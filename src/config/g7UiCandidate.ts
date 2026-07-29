export const G7_PRESENTATION_QUERY_KEY = 'g7Presentation';
export const G7_CUTLINE_QUERY_VALUE = 'cutline-v1';
export const G7_LEGACY_FALLBACK_QUERY_VALUE = 'legacy';
export const G7_COMPATIBILITY_QUERY_KEY = 'g7Candidate';
export const G7_COMPATIBILITY_QUERY_VALUE = 'foundry-tactical';
export const G7_CUTLINE_DATASET_VALUE = 'cutline-v1';
export const G7_CUTLINE_STYLE_TOKEN = 'cutline-v1';

export type G7UiCandidateResolution =
  | Readonly<{
      kind: 'candidate';
      source: 'default' | 'query' | 'compatibility_query';
      queryValue: typeof G7_CUTLINE_QUERY_VALUE | null;
      datasetValue: typeof G7_CUTLINE_DATASET_VALUE;
      styleToken: typeof G7_CUTLINE_STYLE_TOKEN;
    }>
  | Readonly<{
      kind: 'fallback';
      queryValue: typeof G7_LEGACY_FALLBACK_QUERY_VALUE;
    }>
  | Readonly<{ kind: 'invalid'; reason: 'duplicate' | 'unknown' | 'conflicting' }>;

const CANDIDATE_DEFAULT = Object.freeze({
  kind: 'candidate',
  source: 'default',
  queryValue: null,
  datasetValue: G7_CUTLINE_DATASET_VALUE,
  styleToken: G7_CUTLINE_STYLE_TOKEN,
} as const);

export function resolveG7UiCandidate(search: string): G7UiCandidateResolution {
  const parameters = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const presentationReferences = parameters.getAll(G7_PRESENTATION_QUERY_KEY);
  const compatibilityReferences = parameters.getAll(G7_COMPATIBILITY_QUERY_KEY);

  if (presentationReferences.length > 1 || compatibilityReferences.length > 1) {
    return Object.freeze({ kind: 'invalid', reason: 'duplicate' } as const);
  }
  if (presentationReferences.length === 1 && compatibilityReferences.length === 1) {
    return Object.freeze({ kind: 'invalid', reason: 'conflicting' } as const);
  }
  if (presentationReferences.length === 0 && compatibilityReferences.length === 0) {
    return CANDIDATE_DEFAULT;
  }

  if (presentationReferences.length === 1) {
    const value = presentationReferences[0];
    if (value === G7_LEGACY_FALLBACK_QUERY_VALUE) {
      return Object.freeze({
        kind: 'fallback',
        queryValue: G7_LEGACY_FALLBACK_QUERY_VALUE,
      } as const);
    }
    if (value === G7_CUTLINE_QUERY_VALUE) {
      return Object.freeze({
        ...CANDIDATE_DEFAULT,
        source: 'query',
        queryValue: G7_CUTLINE_QUERY_VALUE,
      } as const);
    }
    return Object.freeze({ kind: 'invalid', reason: 'unknown' } as const);
  }

  if (compatibilityReferences[0] === G7_COMPATIBILITY_QUERY_VALUE) {
    return Object.freeze({
      ...CANDIDATE_DEFAULT,
      source: 'compatibility_query',
      queryValue: G7_CUTLINE_QUERY_VALUE,
    } as const);
  }
  return Object.freeze({ kind: 'invalid', reason: 'unknown' } as const);
}
