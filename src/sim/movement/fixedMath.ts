import { CONTACT_NORMAL_Q15_SCALE } from './queryPort';

const CORDIC_GAIN_Q15 = 19_898;
const CORDIC_ARCTANGENT_MILLI_DEGREES = Object.freeze([
  45_000,
  26_565,
  14_036,
  7_125,
  3_576,
  1_790,
  895,
  448,
  224,
  112,
  56,
  28,
  14,
  7,
  3,
  2,
  1,
] as const);

export interface PlanarQ15 {
  readonly x: number;
  readonly z: number;
}

export interface DirectionQ15 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer`);
  }
}

export function roundDivideSigned(numerator: number, denominator: number): number {
  assertSafeInteger(numerator, 'division numerator');
  assertSafeInteger(denominator, 'division denominator');
  if (denominator <= 0) throw new RangeError('division denominator must be positive');
  if (numerator === 0) return 0;
  const sign = numerator < 0 ? -1 : 1;
  return sign * Math.floor((Math.abs(numerator) + Math.floor(denominator / 2)) / denominator);
}

export function integerSquareRootFloor(value: number): number {
  assertSafeInteger(value, 'integer square root input');
  if (value < 0) throw new RangeError('integer square root input must be non-negative');
  if (value < 2) return value;

  let lower = 1;
  // floor(sqrt(Number.MAX_SAFE_INTEGER)); keeping the square itself safe is
  // important because this helper is also part of the runtime trust boundary.
  let upper = Math.min(value, 94_906_265);
  while (lower <= upper) {
    const midpoint = Math.floor((lower + upper) / 2);
    const square = midpoint * midpoint;
    if (square === value) return midpoint;
    if (square < value) lower = midpoint + 1;
    else upper = midpoint - 1;
  }
  return upper;
}

export function integerSquareRootCeiling(value: number): number {
  const floor = integerSquareRootFloor(value);
  return floor * floor === value ? floor : floor + 1;
}

export function planarLength(x: number, z: number): number {
  assertSafeInteger(x, 'planar x');
  assertSafeInteger(z, 'planar z');
  const squared = x * x + z * z;
  assertSafeInteger(squared, 'planar squared length');
  return integerSquareRootFloor(squared);
}

function normalizeSignedAngleMilliDegrees(value: number): number {
  assertSafeInteger(value, 'angle milli-degrees');
  return ((value + 180_000) % 360_000 + 360_000) % 360_000 - 180_000;
}

/** Integer-only CORDIC basis. Outputs are quantized to signed Q15. */
export function sinCosMilliDegreesQ15(value: number): {
  readonly sinQ15: number;
  readonly cosQ15: number;
} {
  let angle = normalizeSignedAngleMilliDegrees(value);
  if (angle === 0) return { sinQ15: 0, cosQ15: CONTACT_NORMAL_Q15_SCALE };
  if (angle === 90_000) return { sinQ15: CONTACT_NORMAL_Q15_SCALE, cosQ15: 0 };
  if (angle === -90_000) return { sinQ15: -CONTACT_NORMAL_Q15_SCALE, cosQ15: 0 };
  if (angle === -180_000) return { sinQ15: 0, cosQ15: -CONTACT_NORMAL_Q15_SCALE };
  let quadrantSign = 1;
  if (angle > 90_000) {
    angle -= 180_000;
    quadrantSign = -1;
  } else if (angle < -90_000) {
    angle += 180_000;
    quadrantSign = -1;
  }

  let x = CORDIC_GAIN_Q15;
  let y = 0;
  let remaining = angle;
  for (let index = 0; index < CORDIC_ARCTANGENT_MILLI_DEGREES.length; index += 1) {
    const direction = remaining >= 0 ? 1 : -1;
    const divisor = 2 ** index;
    const shiftedX = Math.trunc(x / divisor);
    const shiftedY = Math.trunc(y / divisor);
    const nextX = x - direction * shiftedY;
    const nextY = y + direction * shiftedX;
    remaining -= direction * CORDIC_ARCTANGENT_MILLI_DEGREES[index];
    x = nextX;
    y = nextY;
  }

  return {
    sinQ15: Math.max(-CONTACT_NORMAL_Q15_SCALE, Math.min(CONTACT_NORMAL_Q15_SCALE, y * quadrantSign)),
    cosQ15: Math.max(-CONTACT_NORMAL_Q15_SCALE, Math.min(CONTACT_NORMAL_Q15_SCALE, x * quadrantSign)),
  };
}

export function normalizedPlanarIntentQ15(moveX: number, moveZ: number): PlanarQ15 {
  assertSafeInteger(moveX, 'movement x');
  assertSafeInteger(moveZ, 'movement z');
  if (moveX === 0 && moveZ === 0) return { x: 0, z: 0 };
  const magnitude = integerSquareRootCeiling(moveX * moveX + moveZ * moveZ);
  const denominator = Math.max(127, magnitude);
  return {
    x: roundDivideSigned(moveX * CONTACT_NORMAL_Q15_SCALE, denominator),
    z: roundDivideSigned(moveZ * CONTACT_NORMAL_Q15_SCALE, denominator),
  };
}

export function yawRelativePlanarIntentQ15(
  moveX: number,
  moveZ: number,
  yawMilliDegrees: number,
): PlanarQ15 {
  const local = normalizedPlanarIntentQ15(moveX, moveZ);
  const basis = sinCosMilliDegreesQ15(yawMilliDegrees);
  return {
    x: roundDivideSigned(
      local.x * basis.cosQ15 + local.z * basis.sinQ15,
      CONTACT_NORMAL_Q15_SCALE,
    ),
    z: roundDivideSigned(
      local.z * basis.cosQ15 - local.x * basis.sinQ15,
      CONTACT_NORMAL_Q15_SCALE,
    ),
  };
}

export function lookDirectionQ15(
  yawMilliDegrees: number,
  pitchMilliDegrees: number,
): DirectionQ15 {
  const yaw = sinCosMilliDegreesQ15(yawMilliDegrees);
  const pitch = sinCosMilliDegreesQ15(pitchMilliDegrees);
  return {
    x: roundDivideSigned(yaw.sinQ15 * pitch.cosQ15, CONTACT_NORMAL_Q15_SCALE),
    y: pitch.sinQ15,
    z: roundDivideSigned(yaw.cosQ15 * pitch.cosQ15, CONTACT_NORMAL_Q15_SCALE),
  };
}

export function scaleQ15(value: number, scale: number): number {
  assertSafeInteger(value, 'Q15 value');
  assertSafeInteger(scale, 'Q15 scale operand');
  return roundDivideSigned(value * scale, CONTACT_NORMAL_Q15_SCALE);
}

export function assertContactNormalQ15(normal: unknown, label: string): void {
  if (normal === null || typeof normal !== 'object' || Array.isArray(normal)) {
    throw new TypeError(`${label} must be an object`);
  }
  const components = normal as Record<string, unknown>;
  for (const axis of ['x', 'y', 'z'] as const) {
    if (!Object.prototype.hasOwnProperty.call(components, axis)) {
      throw new RangeError(`${label} is missing ${axis}`);
    }
    const value = components[axis] as number;
    assertSafeInteger(value, `${label}.${axis}`);
    if (value < -CONTACT_NORMAL_Q15_SCALE || value > CONTACT_NORMAL_Q15_SCALE) {
      throw new RangeError(`${label}.${axis} must be signed Q15`);
    }
  }
}
