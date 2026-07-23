declare const unitBrand: unique symbol;

type Unit<Name extends string> = number & {
  readonly [unitBrand]: Name;
};

export type SimulationTick = Unit<'simulation_tick'>;
export type Millimeters = Unit<'millimeters'>;
export type MillimetersPerSecond = Unit<'millimeters_per_second'>;
export type MilliDegrees = Unit<'milli_degrees'>;
export type QuantizedAxis = Unit<'quantized_axis'>;

export type SimulationRateHz = 20 | 40;

export const AUTHORITY_RATE_HZ: SimulationRateHz = 20;
export const EVALUATION_RATE_HZ: SimulationRateHz = 40;
export const AUTHORITY_TICK_DURATION_MS = 50 as const;
export const EVALUATION_TICK_DURATION_MS = 25 as const;
export const QUANTIZED_AXIS_LIMIT = 127 as const;
export const FULL_TURN_MILLI_DEGREES = 360_000 as const;

function assertSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer`);
  }
}

export function asSimulationTick(value: number): SimulationTick {
  assertSafeInteger(value, 'simulation tick');
  if (value < 0) {
    throw new RangeError('simulation tick must be non-negative');
  }
  return value as SimulationTick;
}

export function asMillimeters(value: number): Millimeters {
  assertSafeInteger(value, 'millimeters');
  return value as Millimeters;
}

export function asMillimetersPerSecond(value: number): MillimetersPerSecond {
  assertSafeInteger(value, 'millimeters per second');
  return value as MillimetersPerSecond;
}

export function asMilliDegrees(value: number): MilliDegrees {
  assertSafeInteger(value, 'milli-degrees');
  return value as MilliDegrees;
}

export function asQuantizedAxis(value: number): QuantizedAxis {
  assertSafeInteger(value, 'quantized axis');
  if (value < -QUANTIZED_AXIS_LIMIT || value > QUANTIZED_AXIS_LIMIT) {
    throw new RangeError(
      `quantized axis must be between -${QUANTIZED_AXIS_LIMIT} and ${QUANTIZED_AXIS_LIMIT}`,
    );
  }
  return value as QuantizedAxis;
}

export function assertSimulationRateHz(value: number): asserts value is SimulationRateHz {
  if (value !== AUTHORITY_RATE_HZ && value !== EVALUATION_RATE_HZ) {
    throw new RangeError('simulation rate must be 20 Hz or 40 Hz');
  }
}

export function tickDurationMilliseconds(rateHz: SimulationRateHz): 50 | 25 {
  assertSimulationRateHz(rateHz);
  return rateHz === AUTHORITY_RATE_HZ
    ? AUTHORITY_TICK_DURATION_MS
    : EVALUATION_TICK_DURATION_MS;
}

export function ticksToMilliseconds(
  ticks: SimulationTick,
  rateHz: SimulationRateHz,
): number {
  const milliseconds = ticks * tickDurationMilliseconds(rateHz);
  if (!Number.isSafeInteger(milliseconds)) {
    throw new RangeError('tick duration exceeds safe integer millisecond precision');
  }
  return milliseconds;
}

export function ticksToSeconds(ticks: SimulationTick, rateHz: SimulationRateHz): number {
  assertSimulationRateHz(rateHz);
  return ticks / rateHz;
}

export function millisecondsToTicksExact(
  milliseconds: number,
  rateHz: SimulationRateHz,
): SimulationTick {
  assertSafeInteger(milliseconds, 'milliseconds');
  if (milliseconds < 0) {
    throw new RangeError('milliseconds must be non-negative');
  }

  const duration = tickDurationMilliseconds(rateHz);
  if (milliseconds % duration !== 0) {
    throw new RangeError(
      `${milliseconds} ms is not an exact whole-tick duration at ${rateHz} Hz`,
    );
  }
  return asSimulationTick(milliseconds / duration);
}

export function normalizeYawMilliDegrees(value: number): MilliDegrees {
  assertSafeInteger(value, 'yaw milli-degrees');
  const normalized =
    ((value % FULL_TURN_MILLI_DEGREES) + FULL_TURN_MILLI_DEGREES) %
    FULL_TURN_MILLI_DEGREES;
  return asMilliDegrees(normalized);
}

export function clampMilliDegrees(
  value: number,
  minimum: MilliDegrees,
  maximum: MilliDegrees,
): MilliDegrees {
  assertSafeInteger(value, 'milli-degrees');
  if (minimum > maximum) {
    throw new RangeError('minimum milli-degrees cannot exceed maximum milli-degrees');
  }
  return asMilliDegrees(Math.min(maximum, Math.max(minimum, value)));
}

export function milliDegreesToRadians(value: MilliDegrees): number {
  return (value / 1_000) * (Math.PI / 180);
}
