import { describe, expect, it } from 'vitest';

import {
  nextIntegerInclusive,
  nextUint32,
  nextUnitFloat,
  seedDeterministicRng,
} from '../../../src/sim';

function takeUint32(seed: string, count: number): number[] {
  let state = seedDeterministicRng(seed, 'movement', 'player-a');
  const values: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const sample = nextUint32(state);
    values.push(sample.value);
    state = sample.state;
  }
  return values;
}

describe('deterministic RNG', () => {
  it('repeats the same stream for the same seed and keys', () => {
    const expected = [
      727_658_253,
      3_473_015_379,
      786_204_333,
      3_401_440_989,
      3_081_852_723,
      2_048_153_033,
      3_513_298_135,
      1_848_457_611,
    ];
    expect(seedDeterministicRng('match-42', 'movement', 'player-a').state).toBe(
      658_565_293,
    );
    expect(takeUint32('match-42', 8)).toEqual(expected);
    expect(takeUint32('match-42', 8)).toEqual(expected);
  });

  it('separates different match seeds and subsystem/entity streams', () => {
    expect(takeUint32('match-42', 4)).not.toEqual(takeUint32('match-43', 4));

    const movement = seedDeterministicRng('match-42', 'movement', 'player-a');
    const recoil = seedDeterministicRng('match-42', 'recoil', 'player-a');
    const otherEntity = seedDeterministicRng('match-42', 'movement', 'player-b');
    expect(movement.state).not.toBe(recoil.state);
    expect(movement.state).not.toBe(otherEntity.state);
  });

  it('keeps float and bounded integer samples inside declared ranges', () => {
    let state = seedDeterministicRng(0);
    for (let index = 0; index < 2_000; index += 1) {
      const floatSample = nextUnitFloat(state);
      expect(floatSample.value).toBeGreaterThanOrEqual(0);
      expect(floatSample.value).toBeLessThan(1);

      const integerSample = nextIntegerInclusive(floatSample.state, -3, 7);
      expect(integerSample.value).toBeGreaterThanOrEqual(-3);
      expect(integerSample.value).toBeLessThanOrEqual(7);
      state = integerSample.state;
    }
  });

  it('rejects invalid seeds, stream keys, and ranges', () => {
    expect(() => seedDeterministicRng('')).toThrow(/cannot be empty/);
    expect(() => seedDeterministicRng(-1)).toThrow(/unsigned 32-bit/);
    expect(() => seedDeterministicRng(1, '')).toThrow(/stream key/);
    expect(() => seedDeterministicRng(1, 7 as never)).toThrow(/stream key/);
    expect(() => nextIntegerInclusive(seedDeterministicRng(1), 2, 1)).toThrow(
      /minimum cannot exceed maximum/,
    );
    expect(() =>
      nextIntegerInclusive(seedDeterministicRng(1), 0, 0x1_0000_0000),
    ).toThrow(/at most 2\^32/);
  });
});
