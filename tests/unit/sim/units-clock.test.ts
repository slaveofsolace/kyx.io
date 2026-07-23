import { describe, expect, it } from 'vitest';

import {
  AUTHORITY_20_HZ,
  AUTHORITY_RATE_HZ,
  EVALUATION_40_HZ,
  EVALUATION_RATE_HZ,
  advanceFixedTickClock,
  asQuantizedAxis,
  asSimulationTick,
  createFixedTickClock,
  elapsedSimulationMilliseconds,
  fixedTickProfile,
  millisecondsToTicksExact,
  normalizeYawMilliDegrees,
  tickDurationMilliseconds,
  ticksToSeconds,
} from '../../../src/sim';

describe('explicit simulation units and fixed clock', () => {
  it('locks authority to 20 Hz / 50 ms and represents the 40 Hz evaluation profile', () => {
    expect(AUTHORITY_RATE_HZ).toBe(20);
    expect(AUTHORITY_20_HZ.durationMilliseconds).toBe(50);
    expect(EVALUATION_RATE_HZ).toBe(40);
    expect(EVALUATION_40_HZ.durationMilliseconds).toBe(25);
    expect(tickDurationMilliseconds(20)).toBe(50);
    expect(tickDurationMilliseconds(40)).toBe(25);
    expect(fixedTickProfile(20)).toBe(AUTHORITY_20_HZ);
    expect(fixedTickProfile(40)).toBe(EVALUATION_40_HZ);
  });

  it('advances by integer ticks without consulting elapsed wall time', () => {
    const clock = createFixedTickClock(AUTHORITY_20_HZ, asSimulationTick(10));
    const advanced = advanceFixedTickClock(clock, 7);

    expect(advanced.tick).toBe(17);
    expect(elapsedSimulationMilliseconds(advanced)).toBe(850);
    expect(ticksToSeconds(advanced.tick, 20)).toBe(0.85);
    expect(clock.tick).toBe(10);
  });

  it('accepts exact time conversions and rejects ambiguous partial ticks', () => {
    expect(millisecondsToTicksExact(1_000, 20)).toBe(20);
    expect(millisecondsToTicksExact(1_000, 40)).toBe(40);
    expect(() => millisecondsToTicksExact(51, 20)).toThrow(/not an exact whole-tick/);
    expect(() => millisecondsToTicksExact(-50, 20)).toThrow(/non-negative/);
  });

  it('validates quantized axes, ticks, and canonical integer angles', () => {
    expect(asQuantizedAxis(-127)).toBe(-127);
    expect(asQuantizedAxis(127)).toBe(127);
    expect(() => asQuantizedAxis(128)).toThrow(/between -127 and 127/);
    expect(() => asSimulationTick(1.5)).toThrow(/safe integer/);
    expect(normalizeYawMilliDegrees(-1)).toBe(359_999);
    expect(normalizeYawMilliDegrees(720_125)).toBe(125);
  });
});
