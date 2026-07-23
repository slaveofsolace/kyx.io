import { describe, expect, it } from 'vitest';

import {
  PRESS_HALL_INSPECTION_REFERENCE,
  PRESS_HALL_INSPECTION_REFERENCE_V3_2,
  PRESS_HALL_INSPECTION_REFERENCE_V3_3,
  PRESS_HALL_INSPECTION_SEARCH,
  PRESS_HALL_INSPECTION_SEARCH_V3_2,
  PRESS_HALL_INSPECTION_SEARCH_V3_3,
  resolvePressHallInspectionRequest,
} from '../../../src/app/pressHallInspectionSelection';

describe('Press Hall explicit non-default inspection selection', () => {
  it('does not select presentation art without the exact opt-in query', () => {
    expect(resolvePressHallInspectionRequest('')).toEqual({ kind: 'none' });
    expect(resolvePressHallInspectionRequest('?mapPackage=inkfall_foundry%402')).toEqual({
      kind: 'none',
    });
  });

  it('selects only the pinned revision-2 joined-art reference', () => {
    expect(resolvePressHallInspectionRequest(PRESS_HALL_INSPECTION_SEARCH_V3_2)).toEqual({
      kind: 'selected',
      source: 'explicit_query',
      reference: PRESS_HALL_INSPECTION_REFERENCE_V3_2,
      mapId: 'inkfall_foundry',
      mapRevision: 2,
      artRevision: '3.2',
      exportVariant: 'spatial-material-joined',
      catalogDefault: {
        mapId: 'inkfall_foundry',
        mapRevision: 1,
      },
    });
  });

  it('selects the exact v3.3 material-export candidate without changing the catalog default', () => {
    expect(PRESS_HALL_INSPECTION_REFERENCE).toBe(PRESS_HALL_INSPECTION_REFERENCE_V3_3);
    expect(PRESS_HALL_INSPECTION_SEARCH).toBe(PRESS_HALL_INSPECTION_SEARCH_V3_3);
    expect(resolvePressHallInspectionRequest(PRESS_HALL_INSPECTION_SEARCH_V3_3)).toEqual({
      kind: 'selected',
      source: 'explicit_query',
      reference: PRESS_HALL_INSPECTION_REFERENCE_V3_3,
      mapId: 'inkfall_foundry',
      mapRevision: 2,
      artRevision: '3.3',
      exportVariant: 'spatial-material-joined',
      catalogDefault: {
        mapId: 'inkfall_foundry',
        mapRevision: 1,
      },
    });
  });

  it.each([
    '?mapArt=',
    '?mapArt=inkfall_foundry%402%2Fpress_hall%2Fv3.2%2Fstandard',
    '?mapArt=inkfall_foundry%402%2Fpress_hall%2Fv3.3%2Fstandard',
    '?mapArt=inkfall_foundry%402%2Fpress_hall%2Fv3.4%2Fspatial-material-joined',
    '?mapArt=inkfall_foundry%401%2Fpress_hall%2Fv3.2%2Fspatial-material-joined',
    `${PRESS_HALL_INSPECTION_SEARCH}&mapArt=${encodeURIComponent(PRESS_HALL_INSPECTION_REFERENCE)}`,
    `${PRESS_HALL_INSPECTION_SEARCH_V3_3}&mapArt=${encodeURIComponent(PRESS_HALL_INSPECTION_REFERENCE_V3_3)}`,
    `${PRESS_HALL_INSPECTION_SEARCH_V3_2}&mapArt=${encodeURIComponent(PRESS_HALL_INSPECTION_REFERENCE_V3_3)}`,
  ])('fails closed for unsupported or ambiguous art reference %s', (search) => {
    expect(resolvePressHallInspectionRequest(search)).toMatchObject({
      kind: 'unsupported',
      source: 'explicit_query',
    });
  });
});
