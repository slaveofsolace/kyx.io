import { describe, expect, it } from 'vitest';

import {
  INKFALL_REV3_REVIEW_REFERENCE,
  INKFALL_REV3_REVIEW_SEARCH,
  resolveInkfallRev3ReviewRequest,
} from '../../../src/app/inkfallRev3ReviewSelection';
import {
  DEFAULT_MAP_ID,
  DEFAULT_MAP_REVISION,
} from '../../../src/content/maps';

describe('Inkfall Revision 3 product review selection boundary', () => {
  it('selects only the exact explicit non-default revision-3 package', () => {
    expect(INKFALL_REV3_REVIEW_REFERENCE).toBe('inkfall_foundry@3');
    expect(INKFALL_REV3_REVIEW_SEARCH).toBe('?mapPackage=inkfall_foundry%403');
    expect(resolveInkfallRev3ReviewRequest(INKFALL_REV3_REVIEW_SEARCH)).toEqual({
      kind: 'selected',
      source: 'explicit_query',
      reference: 'inkfall_foundry@3',
      mapId: 'inkfall_foundry',
      mapRevision: 3,
      catalogDefault: {
        mapId: 'inkfall_foundry',
        mapRevision: 1,
      },
    });
    expect(DEFAULT_MAP_ID).toBe('inkfall_foundry');
    expect(DEFAULT_MAP_REVISION).toBe(1);
  });

  it('does not intercept ordinary, revision-1, or revision-2 launches', () => {
    expect(resolveInkfallRev3ReviewRequest('')).toEqual({ kind: 'none' });
    expect(resolveInkfallRev3ReviewRequest('?movementDriver=flat_run')).toEqual({ kind: 'none' });
    expect(resolveInkfallRev3ReviewRequest('?mapPackage=inkfall_foundry%401')).toEqual({
      kind: 'none',
    });
    expect(resolveInkfallRev3ReviewRequest('?mapPackage=inkfall_foundry%402')).toEqual({
      kind: 'none',
    });
  });

  it('fails closed when revision 3 appears in an ambiguous request', () => {
    expect(resolveInkfallRev3ReviewRequest(
      '?mapPackage=inkfall_foundry%403&mapPackage=inkfall_foundry%403',
    )).toEqual({
      kind: 'unsupported',
      source: 'explicit_query',
      references: ['inkfall_foundry@3', 'inkfall_foundry@3'],
    });
  });
});
