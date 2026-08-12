import { describe, expect, it } from 'vitest';

import { buildPracticeHref } from '../../../src/ui/practiceRoute';
import { localPracticeRematchIdentity } from '../../../src/app/localInkfallPracticeRoute';

describe('Practice review route boundary', () => {
  it('preserves the selected G6 review candidate and supported population identity', () => {
    expect(buildPracticeHref(
      '?g6Candidate=rev38-fitted-v1&g6Population=8',
    )).toBe('/practice?g6Candidate=rev38-fitted-v1&g6Population=8');
  });

  it('drops unrelated room, mode, redirect, and tracking parameters', () => {
    expect(buildPracticeHref(
      '?mode=join&room=KYX-TEST&g6Population=4&redirect=https%3A%2F%2Fexample.test&g6Candidate=rev40-motion-v2&utm_source=test',
    )).toBe('/practice?g6Candidate=rev40-motion-v2&g6Population=4');
  });

  it('returns the canonical Practice route when no review identity is present', () => {
    expect(buildPracticeHref('')).toBe('/practice');
    expect(buildPracticeHref('?g6Candidate=&g6Population=&mode=practice'))
      .toBe('/practice');
  });

  it('encodes preserved values rather than concatenating raw query text', () => {
    expect(buildPracticeHref('?g6Candidate=rev 38/unsafe&g6Population=2'))
      .toBe('/practice?g6Candidate=rev+38%2Funsafe&g6Population=2');
  });

  it('allocates stable fresh authority identities for in-runtime rematches', () => {
    expect(localPracticeRematchIdentity(1)).toEqual({
      roomId: 'room.local.relay.practice',
      matchId: 'match.local.relay.practice.rematch.1',
    });
    expect(localPracticeRematchIdentity(2).matchId)
      .toBe('match.local.relay.practice.rematch.2');
    expect(() => localPracticeRematchIdentity(0)).toThrow(RangeError);
    expect(() => localPracticeRematchIdentity(10_001)).toThrow(RangeError);
  });
});
