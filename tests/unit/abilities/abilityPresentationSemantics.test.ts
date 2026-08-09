import { describe, expect, it } from 'vitest';

import {
  SMOKE_PRESENTATION_RULES,
  advanceSmokePresentationAgeTicks,
  smokePuffExpansion,
} from '../../../src/abilities/abilityPresentationSemantics';

describe('ability presentation semantics', () => {
  it('expands smoke continuously with a bounded one-tick prediction lead', () => {
    let age = advanceSmokePresentationAgeTicks(null, 0, 1 / 60);
    const samples: number[] = [];
    for (let frame = 0; frame < 6; frame += 1) {
      age = advanceSmokePresentationAgeTicks(age, 0, 1 / 60);
      samples.push(age);
    }

    expect(samples[0]).toBeCloseTo(1 / 3, 8);
    expect(samples[2]).toBeCloseTo(1, 8);
    expect(samples[5]).toBeCloseTo(
      SMOKE_PRESENTATION_RULES.maximumPredictionLeadTicks,
      8,
    );
    expect(samples.every((value, index) => (
      index === 0 || value >= (samples[index - 1] ?? 0)
    ))).toBe(true);
  });

  it('catches up smoothly after authority jitter and shares a phased smoothstep curve', () => {
    const first = advanceSmokePresentationAgeTicks(1, 8, 1 / 60);
    const second = advanceSmokePresentationAgeTicks(first, 8, 1 / 60);
    expect(first).toBeCloseTo(2, 8);
    expect(second).toBeCloseTo(3, 8);
    expect(second).toBeLessThan(8);
    expect(advanceSmokePresentationAgeTicks(second, 1, 1 / 60)).toBe(second);

    expect(smokePuffExpansion(0, 0)).toBe(0);
    expect(smokePuffExpansion(13.5, 0)).toBeCloseTo(0.5, 8);
    expect(smokePuffExpansion(13.5, 0.8)).toBeLessThan(0.5);
    expect(smokePuffExpansion(27, 0)).toBe(1);
  });
});
