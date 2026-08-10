import { describe, expect, it } from 'vitest';

import {
  createRouteProgressWatchdog,
  horizontalTargetDelta,
  observeRouteProgress,
} from '../../../tools/evidence/relay-player-eye-route-watchdog.mjs';

function watchdog() {
  return createRouteProgressWatchdog({
    serverTick: 10,
    distanceMillimeters: 2_000,
    timeoutMilliseconds: 1_000,
    maximumStalledTicks: 4,
    minimumProgressMillimeters: 100,
    authorityTickMilliseconds: 50,
  });
}

describe('Relay player-eye route watchdog', () => {
  it('measures the shortest horizontal delta into capture bounds', () => {
    const bounds = {
      minimumX: -11_500,
      maximumX: -8_500,
      minimumZ: -3_000,
      maximumZ: 3_000,
    };
    expect(horizontalTargetDelta({ x: -12_000, z: 3_400 }, bounds)).toEqual({
      x: 500,
      z: -400,
      distance: Math.hypot(500, 400),
    });
    expect(horizontalTargetDelta({ x: -10_000, z: 0 }, bounds)).toEqual({
      x: 0,
      z: 0,
      distance: 0,
    });
  });

  it('tracks progress, tolerates duplicate polls, and reaches exactly', () => {
    const duplicate = observeRouteProgress(watchdog(), {
      serverTick: 10,
      distanceMillimeters: 2_000,
    });
    expect(duplicate.outcome).toBe('tracking');
    expect(duplicate.stalledAuthorityTicks).toBe(0);

    const subThreshold = observeRouteProgress(duplicate.state, {
      serverTick: 11,
      distanceMillimeters: 1_940,
    });
    expect(subThreshold.madeProgress).toBe(false);
    expect(subThreshold.state.bestDistanceMillimeters).toBe(2_000);

    const progress = observeRouteProgress(subThreshold.state, {
      serverTick: 12,
      distanceMillimeters: 1_850,
    });
    expect(progress.madeProgress).toBe(true);
    expect(progress.state.lastProgressTick).toBe(12);

    const reached = observeRouteProgress(progress.state, {
      serverTick: 13,
      distanceMillimeters: 0,
    });
    expect(reached.outcome).toBe('reached');
  });

  it('distinguishes stalled progress from the authority tick timeout', () => {
    const stalled = observeRouteProgress(watchdog(), {
      serverTick: 14,
      distanceMillimeters: 1_950,
    });
    expect(stalled.outcome).toBe('stalled');
    expect(stalled.stalledAuthorityTicks).toBe(4);

    const timeoutState = createRouteProgressWatchdog({
      serverTick: 10,
      distanceMillimeters: 2_000,
      timeoutMilliseconds: 200,
      maximumStalledTicks: 20,
      minimumProgressMillimeters: 100,
      authorityTickMilliseconds: 50,
    });
    const timedOut = observeRouteProgress(timeoutState, {
      serverTick: 14,
      distanceMillimeters: 1_000,
    });
    expect(timedOut.outcome).toBe('timeout');
    expect(timedOut.elapsedAuthorityTicks).toBe(4);
  });

  it('fails closed on tick regression or invalid geometry', () => {
    expect(() => observeRouteProgress(watchdog(), {
      serverTick: 9,
      distanceMillimeters: 1_900,
    })).toThrow('serverTick regressed');
    expect(() => horizontalTargetDelta({ x: 0, z: 0 }, {
      minimumX: 1,
      maximumX: -1,
      minimumZ: -1,
      maximumZ: 1,
    })).toThrow('x bounds are inverted');
  });
});
