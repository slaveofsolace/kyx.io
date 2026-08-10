export const RELAY_CAPTURE_FRAME = Object.freeze({
  yawMilliDegrees: 90_000,
  pitchMilliDegrees: 0,
});

const MILLI_DEGREES_PER_TURN = 360_000;
const HALF_TURN_MILLI_DEGREES = MILLI_DEGREES_PER_TURN / 2;

function finite(value, label) {
  if (!Number.isFinite(value)) {
    throw new TypeError(`${label} must be finite`);
  }
  return value;
}

export function signedShortestYawErrorMilliDegrees(
  actualYawMilliDegrees,
  targetYawMilliDegrees = RELAY_CAPTURE_FRAME.yawMilliDegrees,
) {
  const actual = finite(actualYawMilliDegrees, 'actualYawMilliDegrees');
  const target = finite(targetYawMilliDegrees, 'targetYawMilliDegrees');
  return (
    (
      (actual - target + HALF_TURN_MILLI_DEGREES)
        % MILLI_DEGREES_PER_TURN
      + MILLI_DEGREES_PER_TURN
    ) % MILLI_DEGREES_PER_TURN
  ) - HALF_TURN_MILLI_DEGREES;
}

export function captureOrientationResidual(
  actualYawMilliDegrees,
  actualPitchMilliDegrees,
) {
  const pitch = finite(actualPitchMilliDegrees, 'actualPitchMilliDegrees');
  return Object.freeze({
    yawMilliDegrees: signedShortestYawErrorMilliDegrees(
      actualYawMilliDegrees,
      RELAY_CAPTURE_FRAME.yawMilliDegrees,
    ),
    pitchMilliDegrees: pitch - RELAY_CAPTURE_FRAME.pitchMilliDegrees,
  });
}

export function captureOrientationWithinTolerance(
  residual,
  maximumResidualMilliDegrees,
) {
  const maximum = finite(
    maximumResidualMilliDegrees,
    'maximumResidualMilliDegrees',
  );
  if (maximum < 0) throw new RangeError('maximumResidualMilliDegrees must be non-negative');
  return Math.abs(finite(residual?.yawMilliDegrees, 'residual.yawMilliDegrees'))
      <= maximum
    && Math.abs(finite(residual?.pitchMilliDegrees, 'residual.pitchMilliDegrees'))
      <= maximum;
}
