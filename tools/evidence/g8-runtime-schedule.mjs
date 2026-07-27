function positiveFinite(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number`);
  }
}

export function scheduledSampleCount(durationMs, intervalMs) {
  positiveFinite('durationMs', durationMs);
  positiveFinite('intervalMs', intervalMs);
  return Math.floor(durationMs / intervalMs);
}

export function absoluteDeadline(startedAtMs, intervalMs, ordinal) {
  if (!Number.isFinite(startedAtMs)) {
    throw new RangeError('startedAtMs must be finite');
  }
  positiveFinite('intervalMs', intervalMs);
  if (!Number.isInteger(ordinal) || ordinal < 1) {
    throw new RangeError('ordinal must be a positive integer');
  }
  return startedAtMs + (intervalMs * ordinal);
}

export function advancePeriodicDeadline(deadlineMs, intervalMs, observedAtMs) {
  if (!Number.isFinite(deadlineMs) || !Number.isFinite(observedAtMs)) {
    throw new RangeError('deadlineMs and observedAtMs must be finite');
  }
  positiveFinite('intervalMs', intervalMs);
  if (deadlineMs > observedAtMs) return deadlineMs;
  const missedIntervals = Math.floor((observedAtMs - deadlineMs) / intervalMs);
  return deadlineMs + ((missedIntervals + 1) * intervalMs);
}
