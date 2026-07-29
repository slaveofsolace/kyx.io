import { describe, expect, it } from 'vitest';

import {
  G7_CUTLINE_DATASET_VALUE,
  G7_CUTLINE_QUERY_VALUE,
  G7_CUTLINE_STYLE_TOKEN,
  resolveG7UiCandidate,
} from '../../../src/config/g7UiCandidate';

describe('G7 UI candidate selection', () => {
  it('presents Cutline as a human-review candidate on the default route', () => {
    expect(resolveG7UiCandidate('')).toEqual({
      kind: 'candidate',
      source: 'default',
      queryValue: null,
      datasetValue: G7_CUTLINE_DATASET_VALUE,
      styleToken: G7_CUTLINE_STYLE_TOKEN,
    });
    expect(resolveG7UiCandidate('?g6Candidate=rev17')).toMatchObject({
      kind: 'candidate',
      source: 'default',
    });
  });

  it('supports an explicit candidate value and the historical review URL', () => {
    expect(resolveG7UiCandidate(
      `?g7Presentation=${G7_CUTLINE_QUERY_VALUE}`,
    )).toMatchObject({
      kind: 'candidate',
      source: 'query',
      queryValue: G7_CUTLINE_QUERY_VALUE,
    });
    expect(resolveG7UiCandidate(
      '?g6Candidate=rev17&g7Candidate=foundry-tactical',
    )).toMatchObject({ kind: 'candidate', source: 'compatibility_query' });
  });

  it('keeps the previous presentation only behind one explicit fallback value', () => {
    expect(resolveG7UiCandidate('?g7Presentation=legacy')).toEqual({
      kind: 'fallback',
      queryValue: 'legacy',
    });
  });

  it('rejects unknown, empty, whitespace, case-shifted, duplicate, and conflicting values', () => {
    for (const search of [
      '?g7Presentation=',
      '?g7Presentation=cutline',
      '?g7Presentation=Cutline-V1',
      '?g7Presentation=%20cutline-v1%20',
    ]) {
      expect(resolveG7UiCandidate(search)).toEqual({ kind: 'invalid', reason: 'unknown' });
    }
    expect(resolveG7UiCandidate(
      '?g7Presentation=legacy&g7Presentation=legacy',
    )).toEqual({ kind: 'invalid', reason: 'duplicate' });
    expect(resolveG7UiCandidate(
      '?g7Presentation=legacy&g7Candidate=foundry-tactical',
    )).toEqual({ kind: 'invalid', reason: 'conflicting' });
  });
});
