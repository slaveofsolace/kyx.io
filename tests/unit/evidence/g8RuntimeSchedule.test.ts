import { describe, expect, it } from 'vitest';

import {
  absoluteDeadline,
  advancePeriodicDeadline,
  scheduledSampleCount,
} from '../../../tools/evidence/g8-runtime-schedule.mjs';

describe('G8 absolute capture schedule', () => {
  it('schedules the full 30-minute one-second sample contract', () => {
    expect(scheduledSampleCount(30 * 60 * 1_000, 1_000)).toBe(1_800);
    expect(absoluteDeadline(50_000, 1_000, 1)).toBe(51_000);
    expect(absoluteDeadline(50_000, 1_000, 1_800)).toBe(1_850_000);
  });

  it('does not compound activity overhead into the next periodic deadline', () => {
    expect(advancePeriodicDeadline(10_500, 500, 10_537)).toBe(11_000);
    expect(advancePeriodicDeadline(10_500, 500, 11_240)).toBe(11_500);
    expect(advancePeriodicDeadline(10_500, 500, 10_000)).toBe(10_500);
  });

  it('rejects invalid timing inputs instead of silently weakening the sample contract', () => {
    expect(() => scheduledSampleCount(0, 1_000)).toThrow(RangeError);
    expect(() => scheduledSampleCount(1_000, 0)).toThrow(RangeError);
    expect(() => absoluteDeadline(0, 1_000, 0)).toThrow(RangeError);
  });
});
