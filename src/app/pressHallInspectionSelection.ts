import {
  DEFAULT_MAP_ID,
  DEFAULT_MAP_REVISION,
  LOCKED_GRAYBOX_MAP_REVISION,
} from '../content/maps/constants';

export const PRESS_HALL_INSPECTION_QUERY_KEY = 'mapArt' as const;
export const PRESS_HALL_INSPECTION_REFERENCE_V3_2 = (
  `${DEFAULT_MAP_ID}@${LOCKED_GRAYBOX_MAP_REVISION}/press_hall/v3.2/spatial-material-joined`
) as const;
export const PRESS_HALL_INSPECTION_REFERENCE_V3_3 = (
  `${DEFAULT_MAP_ID}@${LOCKED_GRAYBOX_MAP_REVISION}/press_hall/v3.3/spatial-material-joined`
) as const;
export const PRESS_ARCHIVE_REV4_CANDIDATE_REFERENCE = (
  `${DEFAULT_MAP_ID}@3/press_archive/v4.1/spatial-material-joined`
) as const;
export const PRESS_HALL_INSPECTION_REFERENCE = PRESS_HALL_INSPECTION_REFERENCE_V3_3;
export const PRESS_HALL_INSPECTION_SEARCH_V3_2 = (
  `?${PRESS_HALL_INSPECTION_QUERY_KEY}=${encodeURIComponent(PRESS_HALL_INSPECTION_REFERENCE_V3_2)}`
) as const;
export const PRESS_HALL_INSPECTION_SEARCH_V3_3 = (
  `?${PRESS_HALL_INSPECTION_QUERY_KEY}=${encodeURIComponent(PRESS_HALL_INSPECTION_REFERENCE_V3_3)}`
) as const;
export const PRESS_HALL_INSPECTION_SEARCH = (
  `?${PRESS_HALL_INSPECTION_QUERY_KEY}=${encodeURIComponent(PRESS_HALL_INSPECTION_REFERENCE)}`
) as const;
export const PRESS_ARCHIVE_REV4_CANDIDATE_SEARCH = (
  `?${PRESS_HALL_INSPECTION_QUERY_KEY}=${encodeURIComponent(PRESS_ARCHIVE_REV4_CANDIDATE_REFERENCE)}`
) as const;

export type PressHallArtRevision = '3.2' | '3.3' | '4.1';
export type PressHallInspectionReference =
  | typeof PRESS_HALL_INSPECTION_REFERENCE_V3_2
  | typeof PRESS_HALL_INSPECTION_REFERENCE_V3_3
  | typeof PRESS_ARCHIVE_REV4_CANDIDATE_REFERENCE;

export interface PressHallInspectionSelection {
  readonly kind: 'selected';
  readonly source: 'explicit_query';
  readonly reference: PressHallInspectionReference;
  readonly mapId: typeof DEFAULT_MAP_ID;
  readonly mapRevision: typeof LOCKED_GRAYBOX_MAP_REVISION | 3;
  readonly artRevision: PressHallArtRevision;
  readonly exportVariant: 'spatial-material-joined';
  readonly catalogDefault: {
    readonly mapId: typeof DEFAULT_MAP_ID;
    readonly mapRevision: typeof DEFAULT_MAP_REVISION;
  };
}

export type PressHallInspectionRequest =
  | { readonly kind: 'none' }
  | PressHallInspectionSelection
  | {
      readonly kind: 'unsupported';
      readonly source: 'explicit_query';
      readonly references: readonly string[];
    };

export function resolvePressHallInspectionRequest(search: string): PressHallInspectionRequest {
  const parameters = new URLSearchParams(search);
  const references = parameters.getAll(PRESS_HALL_INSPECTION_QUERY_KEY);
  if (references.length === 0) return Object.freeze({ kind: 'none' });
  const packageReferences = parameters.getAll('mapPackage');
  const reference = references[0];
  const artRevision = reference === PRESS_HALL_INSPECTION_REFERENCE_V3_2
    ? '3.2'
    : reference === PRESS_HALL_INSPECTION_REFERENCE_V3_3
      ? '3.3'
      : reference === PRESS_ARCHIVE_REV4_CANDIDATE_REFERENCE ? '4.1' : null;
  if (references.length !== 1 || packageReferences.length > 0 || artRevision === null) {
    return Object.freeze({
      kind: 'unsupported',
      source: 'explicit_query',
      references: Object.freeze([
        ...references,
        ...packageReferences.map((entry) => `mapPackage:${entry}`),
      ]),
    });
  }
  return Object.freeze({
    kind: 'selected',
    source: 'explicit_query',
    reference: reference as PressHallInspectionReference,
    mapId: DEFAULT_MAP_ID,
    mapRevision: artRevision === '4.1' ? 3 : LOCKED_GRAYBOX_MAP_REVISION,
    artRevision,
    exportVariant: 'spatial-material-joined',
    catalogDefault: Object.freeze({
      mapId: DEFAULT_MAP_ID,
      mapRevision: DEFAULT_MAP_REVISION,
    }),
  });
}
