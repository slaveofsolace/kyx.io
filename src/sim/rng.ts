export const RNG_ALGORITHM = 'mulberry32-v1' as const;

export interface DeterministicRngState {
  readonly algorithm: typeof RNG_ALGORITHM;
  readonly state: number;
}

export interface RandomSample<T> {
  readonly value: T;
  readonly state: DeterministicRngState;
}

const UINT32_RANGE = 0x1_0000_0000;
const UINT32_MAX = 0xffff_ffff;
const FNV32_OFFSET = 0x811c9dc5;
const FNV32_PRIME = 0x01000193;
const MULBERRY_INCREMENT = 0x6d2b79f5;

function assertUint32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  }
}

function updateFnv32(hash: number, byte: number): number {
  return Math.imul(hash ^ byte, FNV32_PRIME) >>> 0;
}

function forEachUtf8Byte(value: string, consume: (byte: number) => void): void {
  for (const symbol of value) {
    const codePoint = symbol.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }

    if (codePoint <= 0x7f) {
      consume(codePoint);
    } else if (codePoint <= 0x7ff) {
      consume(0xc0 | (codePoint >>> 6));
      consume(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      consume(0xe0 | (codePoint >>> 12));
      consume(0x80 | ((codePoint >>> 6) & 0x3f));
      consume(0x80 | (codePoint & 0x3f));
    } else {
      consume(0xf0 | (codePoint >>> 18));
      consume(0x80 | ((codePoint >>> 12) & 0x3f));
      consume(0x80 | ((codePoint >>> 6) & 0x3f));
      consume(0x80 | (codePoint & 0x3f));
    }
  }
}

export function hashSeedString(value: string): number {
  if (typeof value !== 'string') {
    throw new TypeError('seed value must be a string');
  }
  let hash = FNV32_OFFSET;
  forEachUtf8Byte(value, (byte) => {
    hash = updateFnv32(hash, byte);
  });
  return hash >>> 0;
}

function combineSeed(seed: number, streamKey: string): number {
  const framedKey = `${streamKey.length}:${streamKey}`;
  let hash = seed >>> 0;
  forEachUtf8Byte(framedKey, (byte) => {
    hash = updateFnv32(hash, byte);
  });
  return hash >>> 0;
}

export function seedDeterministicRng(
  seed: number | string,
  ...streamKeys: readonly string[]
): DeterministicRngState {
  let state: number;
  if (typeof seed === 'string') {
    if (seed.length === 0) {
      throw new RangeError('string seed cannot be empty');
    }
    state = hashSeedString(seed);
  } else {
    assertUint32(seed, 'numeric seed');
    state = seed >>> 0;
  }

  for (const streamKey of streamKeys) {
    if (typeof streamKey !== 'string' || streamKey.length === 0) {
      throw new RangeError('RNG stream key cannot be empty');
    }
    state = combineSeed(state, streamKey);
  }

  return { algorithm: RNG_ALGORITHM, state };
}

export function assertDeterministicRngState(
  state: DeterministicRngState,
): void {
  if (state.algorithm !== RNG_ALGORITHM) {
    throw new RangeError(`unsupported RNG algorithm: ${String(state.algorithm)}`);
  }
  assertUint32(state.state, 'RNG state');
}

export function nextUint32(state: DeterministicRngState): RandomSample<number> {
  assertDeterministicRngState(state);
  const nextStateValue = (state.state + MULBERRY_INCREMENT) >>> 0;
  let mixed = nextStateValue;
  mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
  mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
  const value = (mixed ^ (mixed >>> 14)) >>> 0;
  return {
    value,
    state: { algorithm: RNG_ALGORITHM, state: nextStateValue },
  };
}

export function nextUnitFloat(state: DeterministicRngState): RandomSample<number> {
  const sample = nextUint32(state);
  return {
    value: sample.value / UINT32_RANGE,
    state: sample.state,
  };
}

export function nextIntegerInclusive(
  state: DeterministicRngState,
  minimum: number,
  maximum: number,
): RandomSample<number> {
  if (!Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum)) {
    throw new RangeError('integer sample bounds must be safe integers');
  }
  if (minimum > maximum) {
    throw new RangeError('integer sample minimum cannot exceed maximum');
  }

  const range = maximum - minimum + 1;
  if (!Number.isSafeInteger(range) || range < 1 || range > UINT32_RANGE) {
    throw new RangeError('integer sample range must contain at most 2^32 values');
  }

  const rejectionLimit = Math.floor(UINT32_RANGE / range) * range;
  let cursor = state;
  for (;;) {
    const sample = nextUint32(cursor);
    cursor = sample.state;
    if (sample.value < rejectionLimit) {
      return {
        value: minimum + (sample.value % range),
        state: cursor,
      };
    }
  }
}
