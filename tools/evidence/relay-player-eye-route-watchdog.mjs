const DEFAULT_AUTHORITY_TICK_MILLISECONDS = 50;

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function nonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer`);
  }
  return value;
}

function axisDelta(value, minimum, maximum, label) {
  const point = finite(value, `${label}.value`);
  const lower = finite(minimum, `${label}.minimum`);
  const upper = finite(maximum, `${label}.maximum`);
  if (lower > upper) throw new RangeError(`${label} bounds are inverted`);
  if (point < lower) return lower - point;
  if (point > upper) return upper - point;
  return 0;
}

export function horizontalTargetDelta(feet, bounds) {
  const x = axisDelta(feet?.x, bounds?.minimumX, bounds?.maximumX, 'x');
  const z = axisDelta(feet?.z, bounds?.minimumZ, bounds?.maximumZ, 'z');
  return Object.freeze({
    x,
    z,
    distance: Math.hypot(x, z),
  });
}

export function createRouteProgressWatchdog({
  serverTick,
  distanceMillimeters,
  timeoutMilliseconds,
  maximumStalledTicks,
  minimumProgressMillimeters,
  authorityTickMilliseconds = DEFAULT_AUTHORITY_TICK_MILLISECONDS,
}) {
  const initialTick = nonNegativeInteger(serverTick, 'serverTick');
  const initialDistance = finite(distanceMillimeters, 'distanceMillimeters');
  const timeout = finite(timeoutMilliseconds, 'timeoutMilliseconds');
  const tickDuration = finite(authorityTickMilliseconds, 'authorityTickMilliseconds');
  const stalledTicks = nonNegativeInteger(maximumStalledTicks, 'maximumStalledTicks');
  const progress = finite(minimumProgressMillimeters, 'minimumProgressMillimeters');
  if (initialDistance < 0) throw new RangeError('distanceMillimeters must be non-negative');
  if (timeout <= 0) throw new RangeError('timeoutMilliseconds must be positive');
  if (tickDuration <= 0) throw new RangeError('authorityTickMilliseconds must be positive');
  if (stalledTicks === 0) throw new RangeError('maximumStalledTicks must be positive');
  if (progress <= 0) throw new RangeError('minimumProgressMillimeters must be positive');
  return Object.freeze({
    initialTick,
    lastTick: initialTick,
    bestDistanceMillimeters: initialDistance,
    lastProgressTick: initialTick,
    maximumAuthorityTicks: Math.ceil(timeout / tickDuration),
    maximumStalledTicks: stalledTicks,
    minimumProgressMillimeters: progress,
  });
}

export function observeRouteProgress(state, {
  serverTick,
  distanceMillimeters,
}) {
  const tick = nonNegativeInteger(serverTick, 'serverTick');
  const distance = finite(distanceMillimeters, 'distanceMillimeters');
  if (distance < 0) throw new RangeError('distanceMillimeters must be non-negative');
  if (tick < state.lastTick) throw new RangeError('serverTick regressed');

  const madeProgress = distance
    <= state.bestDistanceMillimeters - state.minimumProgressMillimeters;
  const bestDistanceMillimeters = madeProgress
    ? distance
    : state.bestDistanceMillimeters;
  const lastProgressTick = madeProgress ? tick : state.lastProgressTick;
  const elapsedAuthorityTicks = tick - state.initialTick;
  const stalledAuthorityTicks = tick - lastProgressTick;
  let outcome = 'tracking';
  if (distance === 0) outcome = 'reached';
  else if (elapsedAuthorityTicks >= state.maximumAuthorityTicks) outcome = 'timeout';
  else if (stalledAuthorityTicks >= state.maximumStalledTicks) outcome = 'stalled';

  return Object.freeze({
    outcome,
    madeProgress,
    elapsedAuthorityTicks,
    stalledAuthorityTicks,
    state: Object.freeze({
      ...state,
      lastTick: tick,
      bestDistanceMillimeters,
      lastProgressTick,
    }),
  });
}
