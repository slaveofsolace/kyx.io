import {
  DEFAULT_MAP_ID,
  DEFAULT_MAP_REVISION,
  LOCKED_GRAYBOX_MAP_REVISION,
} from '../content/maps/constants';

export const LOCKED_GRAYBOX_PREVIEW_QUERY_KEY = 'mapPackage' as const;
export const LOCKED_GRAYBOX_PREVIEW_REFERENCE = (
  `${DEFAULT_MAP_ID}@${LOCKED_GRAYBOX_MAP_REVISION}`
) as `${typeof DEFAULT_MAP_ID}@${typeof LOCKED_GRAYBOX_MAP_REVISION}`;
export const LOCKED_GRAYBOX_PREVIEW_SEARCH = (
  `?${LOCKED_GRAYBOX_PREVIEW_QUERY_KEY}=${encodeURIComponent(LOCKED_GRAYBOX_PREVIEW_REFERENCE)}`
) as const;

export interface LockedGrayboxPreviewSelection {
  readonly kind: 'selected';
  readonly source: 'explicit_query';
  readonly reference: typeof LOCKED_GRAYBOX_PREVIEW_REFERENCE;
  readonly mapId: typeof DEFAULT_MAP_ID;
  readonly mapRevision: typeof LOCKED_GRAYBOX_MAP_REVISION;
  readonly catalogDefault: {
    readonly mapId: typeof DEFAULT_MAP_ID;
    readonly mapRevision: typeof DEFAULT_MAP_REVISION;
  };
}

export type LockedGrayboxPreviewRequest =
  | { readonly kind: 'none' }
  | LockedGrayboxPreviewSelection
  | {
      readonly kind: 'unsupported';
      readonly source: 'explicit_query';
      readonly references: readonly string[];
    };

export function resolveLockedGrayboxPreviewRequest(search: string): LockedGrayboxPreviewRequest {
  const references = new URLSearchParams(search).getAll(LOCKED_GRAYBOX_PREVIEW_QUERY_KEY);
  if (references.length === 0) return Object.freeze({ kind: 'none' });
  if (references.length !== 1 || references[0] !== LOCKED_GRAYBOX_PREVIEW_REFERENCE) {
    return Object.freeze({
      kind: 'unsupported',
      source: 'explicit_query',
      references: Object.freeze([...references]),
    });
  }
  return Object.freeze({
    kind: 'selected',
    source: 'explicit_query',
    reference: LOCKED_GRAYBOX_PREVIEW_REFERENCE,
    mapId: DEFAULT_MAP_ID,
    mapRevision: LOCKED_GRAYBOX_MAP_REVISION,
    catalogDefault: Object.freeze({
      mapId: DEFAULT_MAP_ID,
      mapRevision: DEFAULT_MAP_REVISION,
    }),
  });
}
