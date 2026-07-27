import {
  DEFAULT_MAP_ID,
  DEFAULT_MAP_REVISION,
} from '../content/maps/constants';

export const INKFALL_REV3_REVIEW_QUERY_KEY = 'mapPackage' as const;
export const INKFALL_REV3_REVIEW_REVISION = 3 as const;
export const INKFALL_REV3_REVIEW_REFERENCE = (
  `${DEFAULT_MAP_ID}@${INKFALL_REV3_REVIEW_REVISION}`
) as `${typeof DEFAULT_MAP_ID}@${typeof INKFALL_REV3_REVIEW_REVISION}`;
export const INKFALL_REV3_REVIEW_SEARCH = (
  `?${INKFALL_REV3_REVIEW_QUERY_KEY}=${encodeURIComponent(INKFALL_REV3_REVIEW_REFERENCE)}`
) as const;

export interface InkfallRev3ReviewSelection {
  readonly kind: 'selected';
  readonly source: 'explicit_query';
  readonly reference: typeof INKFALL_REV3_REVIEW_REFERENCE;
  readonly mapId: typeof DEFAULT_MAP_ID;
  readonly mapRevision: typeof INKFALL_REV3_REVIEW_REVISION;
  readonly catalogDefault: {
    readonly mapId: typeof DEFAULT_MAP_ID;
    readonly mapRevision: typeof DEFAULT_MAP_REVISION;
  };
}

export type InkfallRev3ReviewRequest =
  | { readonly kind: 'none' }
  | InkfallRev3ReviewSelection
  | {
      readonly kind: 'unsupported';
      readonly source: 'explicit_query';
      readonly references: readonly string[];
    };

export function resolveInkfallRev3ReviewRequest(search: string): InkfallRev3ReviewRequest {
  const references = new URLSearchParams(search).getAll(INKFALL_REV3_REVIEW_QUERY_KEY);
  if (references.length === 0 || !references.includes(INKFALL_REV3_REVIEW_REFERENCE)) {
    return Object.freeze({ kind: 'none' });
  }
  if (references.length !== 1 || references[0] !== INKFALL_REV3_REVIEW_REFERENCE) {
    return Object.freeze({
      kind: 'unsupported',
      source: 'explicit_query',
      references: Object.freeze([...references]),
    });
  }
  return Object.freeze({
    kind: 'selected',
    source: 'explicit_query',
    reference: INKFALL_REV3_REVIEW_REFERENCE,
    mapId: DEFAULT_MAP_ID,
    mapRevision: INKFALL_REV3_REVIEW_REVISION,
    catalogDefault: Object.freeze({
      mapId: DEFAULT_MAP_ID,
      mapRevision: DEFAULT_MAP_REVISION,
    }),
  });
}
