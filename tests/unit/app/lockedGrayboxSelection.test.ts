import { describe, expect, it } from 'vitest';

import {
  LOCKED_GRAYBOX_PREVIEW_REFERENCE,
  LOCKED_GRAYBOX_PREVIEW_SEARCH,
  resolveLockedGrayboxPreviewRequest,
} from '../../../src/app/lockedGrayboxSelection';
import {
  DEFAULT_MAP_ID,
  DEFAULT_MAP_REVISION,
  LOCKED_GRAYBOX_MAP_REVISION,
} from '../../../src/content/maps';

describe('locked graybox product selection boundary', () => {
  it('resolves only the exact explicit non-default package reference', () => {
    expect(LOCKED_GRAYBOX_PREVIEW_REFERENCE).toBe('inkfall_foundry@2');
    expect(LOCKED_GRAYBOX_PREVIEW_SEARCH).toBe('?mapPackage=inkfall_foundry%402');
    expect(resolveLockedGrayboxPreviewRequest(LOCKED_GRAYBOX_PREVIEW_SEARCH)).toEqual({
      kind: 'selected',
      source: 'explicit_query',
      reference: 'inkfall_foundry@2',
      mapId: 'inkfall_foundry',
      mapRevision: 2,
      catalogDefault: {
        mapId: 'inkfall_foundry',
        mapRevision: 1,
      },
    });
    expect(DEFAULT_MAP_ID).toBe('inkfall_foundry');
    expect(DEFAULT_MAP_REVISION).toBe(1);
    expect(LOCKED_GRAYBOX_MAP_REVISION).toBe(2);
  });

  it('leaves ordinary launches alone and rejects unsupported or ambiguous requests', () => {
    expect(resolveLockedGrayboxPreviewRequest('')).toEqual({ kind: 'none' });
    expect(resolveLockedGrayboxPreviewRequest('?movementDriver=flat_run')).toEqual({ kind: 'none' });
    expect(resolveLockedGrayboxPreviewRequest('?mapPackage=inkfall_foundry%401')).toEqual({
      kind: 'unsupported',
      source: 'explicit_query',
      references: ['inkfall_foundry@1'],
    });
    expect(resolveLockedGrayboxPreviewRequest(
      '?mapPackage=inkfall_foundry%402&mapPackage=inkfall_foundry%402',
    )).toEqual({
      kind: 'unsupported',
      source: 'explicit_query',
      references: ['inkfall_foundry@2', 'inkfall_foundry@2'],
    });
  });
});
