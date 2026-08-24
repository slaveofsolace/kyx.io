import { describe, expect, it } from 'vitest';

import {
  buildPracticeHref,
  parsePracticeMatchMode,
} from '../../../src/ui/practiceRoute';
import { KYX_MODE_ID } from '../../../src/authority';
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

  it('routes the shared FFA and Instagib ids while keeping TDM canonical', () => {
    expect(buildPracticeHref('', KYX_MODE_ID.teamDeathmatch)).toBe('/practice');
    expect(buildPracticeHref(
      '?g6Candidate=rev40',
      KYX_MODE_ID.freeForAll,
    )).toBe('/practice?g6Candidate=rev40&match=free_for_all');
    expect(buildPracticeHref('', KYX_MODE_ID.instagib))
      .toBe('/practice?match=instagib');
    expect(buildPracticeHref('?match=free_for_all&utm_source=test'))
      .toBe('/practice?match=free_for_all');
  });

  it('parses one exact Practice mode and rejects repeated or unsupported modes', () => {
    expect(parsePracticeMatchMode('')).toBe(KYX_MODE_ID.teamDeathmatch);
    expect(parsePracticeMatchMode('?match=free_for_all')).toBe(KYX_MODE_ID.freeForAll);
    expect(parsePracticeMatchMode('?match=instagib')).toBe(KYX_MODE_ID.instagib);
    expect(() => parsePracticeMatchMode('?match=battle_royale')).toThrow(RangeError);
    expect(() => parsePracticeMatchMode('?match=instagib&match=free_for_all'))
      .toThrow(RangeError);
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
