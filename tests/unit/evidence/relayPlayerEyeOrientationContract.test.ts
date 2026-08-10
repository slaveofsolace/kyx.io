import { describe, expect, it } from 'vitest';

import {
  captureOrientationResidual,
  captureOrientationWithinTolerance,
  RELAY_CAPTURE_FRAME,
  signedShortestYawErrorMilliDegrees,
} from '../../../tools/evidence/relay-player-eye-orientation-contract.mjs';

describe('Relay player-eye orientation contract', () => {
  it('binds capture to the west-spawn route frame instead of global yaw zero', () => {
    expect(RELAY_CAPTURE_FRAME).toEqual({
      yawMilliDegrees: 90_000,
      pitchMilliDegrees: 0,
    });
    expect(signedShortestYawErrorMilliDegrees(90_000)).toBe(0);
    expect(signedShortestYawErrorMilliDegrees(450_000)).toBe(0);
    expect(signedShortestYawErrorMilliDegrees(-270_000)).toBe(0);
    expect(signedShortestYawErrorMilliDegrees(89_500)).toBe(-500);
    expect(signedShortestYawErrorMilliDegrees(90_500)).toBe(500);
  });

  it('accepts the exact residual boundary and rejects the next milli-degree', () => {
    expect(captureOrientationWithinTolerance(
      captureOrientationResidual(90_750, -750),
      750,
    )).toBe(true);
    expect(captureOrientationWithinTolerance(
      captureOrientationResidual(90_751, 0),
      750,
    )).toBe(false);
    expect(captureOrientationWithinTolerance(
      captureOrientationResidual(90_000, -751),
      750,
    )).toBe(false);
  });

  it('fails closed for non-finite orientation or invalid tolerance', () => {
    expect(() => captureOrientationResidual(Number.NaN, 0)).toThrow(TypeError);
    expect(() => captureOrientationResidual(90_000, Number.POSITIVE_INFINITY))
      .toThrow(TypeError);
    expect(() => captureOrientationWithinTolerance({
      yawMilliDegrees: 0,
      pitchMilliDegrees: 0,
    }, -1)).toThrow(RangeError);
  });
});
