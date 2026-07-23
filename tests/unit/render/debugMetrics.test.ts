import { describe, expect, it } from 'vitest';

import {
  percentile,
  summarizeFrameTimes,
  summarizeLongTasks,
} from '@render/debugMetrics';

describe('renderer debug metric math', () => {
  it('uses nearest-rank percentiles on an already sorted sample', () => {
    const samples = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

    expect(percentile(samples, 0)).toBe(5);
    expect(percentile(samples, 0.5)).toBe(25);
    expect(percentile(samples, 0.95)).toBe(50);
    expect(percentile(samples, 1)).toBe(50);
  });

  it('summarizes finite non-negative frame samples without mutating input', () => {
    const samples = [20, Number.NaN, -1, 10, 30];

    expect(summarizeFrameTimes(samples)).toEqual({
      count: 3,
      p50Ms: 20,
      p95Ms: 30,
      p99Ms: 30,
      maxMs: 30,
    });
    expect(samples).toEqual([20, Number.NaN, -1, 10, 30]);
  });

  it('returns null when no valid frame sample exists', () => {
    expect(summarizeFrameTimes([])).toBeNull();
    expect(summarizeFrameTimes([Number.NaN, -5])).toBeNull();
  });

  it('rejects empty samples and invalid quantiles', () => {
    expect(() => percentile([], 0.5)).toThrow(RangeError);
    expect(() => percentile([1], -0.1)).toThrow(RangeError);
    expect(() => percentile([1], 1.1)).toThrow(RangeError);
  });

  it('summarizes only valid long tasks inside the requested rolling window', () => {
    const samples = [
      { startTimeMs: 9_000, durationMs: 55 },
      { startTimeMs: 9_500, durationMs: 80 },
      { startTimeMs: 7_000, durationMs: 400 },
      { startTimeMs: Number.NaN, durationMs: 100 },
      { startTimeMs: 9_900, durationMs: -1 },
    ];

    expect(summarizeLongTasks(samples, 10_000, 2_000)).toEqual({
      windowMs: 2_000,
      count: 2,
      totalDurationMs: 135,
      p95DurationMs: 80,
      maxDurationMs: 80,
    });
  });

  it('returns a zeroed long-task window and rejects invalid timing bounds', () => {
    expect(summarizeLongTasks([], 1_000, 500)).toEqual({
      windowMs: 500,
      count: 0,
      totalDurationMs: 0,
      p95DurationMs: 0,
      maxDurationMs: 0,
    });
    expect(() => summarizeLongTasks([], Number.NaN)).toThrow(RangeError);
    expect(() => summarizeLongTasks([], 1_000, 0)).toThrow(RangeError);
  });
});
