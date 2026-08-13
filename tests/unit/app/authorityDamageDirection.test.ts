import { describe, expect, it } from 'vitest';

import { classifyAuthorityDamageDirection } from '../../../src/app/authorityDamageDirection';

describe('authority player-eye damage direction', () => {
  it.each([
    [{ x: 0, z: 8 }, 0, 'front'],
    [{ x: 8, z: 0 }, 0, 'right'],
    [{ x: 0, z: -8 }, 0, 'rear'],
    [{ x: -8, z: 0 }, 0, 'left'],
    [{ x: 8, z: 0 }, 90_000, 'front'],
    [{ x: 0, z: -8 }, 90_000, 'right'],
  ] as const)('classifies source %o at yaw %d as %s', (sourcePosition, yaw, expected) => {
    expect(classifyAuthorityDamageDirection({
      sourcePosition,
      targetPosition: { x: 0, z: 0 },
      targetYawMilliDegrees: yaw,
    })).toBe(expected);
  });

  it('fails closed for absent, degenerate, or non-finite authority state', () => {
    expect(classifyAuthorityDamageDirection({
      sourcePosition: null,
      targetPosition: { x: 0, z: 0 },
      targetYawMilliDegrees: 0,
    })).toBeNull();
    expect(classifyAuthorityDamageDirection({
      sourcePosition: { x: 0, z: 0 },
      targetPosition: { x: 0, z: 0 },
      targetYawMilliDegrees: 0,
    })).toBeNull();
    expect(classifyAuthorityDamageDirection({
      sourcePosition: { x: Number.NaN, z: 4 },
      targetPosition: { x: 0, z: 0 },
      targetYawMilliDegrees: 0,
    })).toBeNull();
  });
});
