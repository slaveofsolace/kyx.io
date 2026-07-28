export type LocomotionTravelSector =
  | 'idle'
  | 'forward'
  | 'forward_right'
  | 'right'
  | 'backward_right'
  | 'backward'
  | 'backward_left'
  | 'left'
  | 'forward_left';

export interface LocomotionPresentationSignal {
  /** Measured planar speed from authority/interpolated velocity. */
  readonly planarSpeedMillimetersPerSecond: number;
  /** Positive means travel along the avatar's facing direction. */
  readonly forwardSpeedMillimetersPerSecond: number;
  /** Positive means travel toward the avatar's local right. */
  readonly rightSpeedMillimetersPerSecond: number;
  /** Zero is forward and positive angles turn toward local right. */
  readonly travelDirectionRadians: number;
  /**
   * Existing HumanSoldier lean convention: -1 is right and +1 is left.
   * This is presentation-only and never feeds movement authority.
   */
  readonly strafeLean: number;
  /** Reverse authored gait playback only when the body is truly backpedaling. */
  readonly gaitPlaybackDirection: 1 | -1;
  readonly sector: LocomotionTravelSector;
}

const EIGHTH_TURN_RADIANS = Math.PI / 4;

function sectorForAngle(angleRadians: number): LocomotionTravelSector {
  const octant = Math.round(angleRadians / EIGHTH_TURN_RADIANS);
  switch ((octant + 8) % 8) {
    case 0: return 'forward';
    case 1: return 'forward_right';
    case 2: return 'right';
    case 3: return 'backward_right';
    case 4: return 'backward';
    case 5: return 'backward_left';
    case 6: return 'left';
    default: return 'forward_left';
  }
}

/**
 * Derive animation-facing facts from measured motion, not packet arrival or
 * input guesses. World velocity is rotated into the authority yaw basis:
 * local +Z is forward and local +X is right.
 */
export function deriveLocomotionPresentationSignal(
  velocity: Readonly<{ x: number; z: number }>,
  yawMilliDegrees: number,
): LocomotionPresentationSignal {
  for (const [label, value] of [
    ['velocity.x', velocity.x],
    ['velocity.z', velocity.z],
    ['yaw', yawMilliDegrees],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new RangeError(`locomotion presentation ${label} must be finite`);
    }
  }
  const planarSpeed = Math.hypot(velocity.x, velocity.z);
  if (planarSpeed === 0) {
    return Object.freeze({
      planarSpeedMillimetersPerSecond: 0,
      forwardSpeedMillimetersPerSecond: 0,
      rightSpeedMillimetersPerSecond: 0,
      travelDirectionRadians: 0,
      strafeLean: 0,
      gaitPlaybackDirection: 1,
      sector: 'idle',
    });
  }

  const yawRadians = yawMilliDegrees * Math.PI / 180_000;
  const cosine = Math.cos(yawRadians);
  const sine = Math.sin(yawRadians);
  const rightSpeed = velocity.x * cosine - velocity.z * sine;
  const forwardSpeed = velocity.x * sine + velocity.z * cosine;
  const travelDirectionRadians = Math.atan2(rightSpeed, forwardSpeed);
  return Object.freeze({
    planarSpeedMillimetersPerSecond: planarSpeed,
    forwardSpeedMillimetersPerSecond: forwardSpeed,
    rightSpeedMillimetersPerSecond: rightSpeed,
    travelDirectionRadians,
    strafeLean: Math.max(-1, Math.min(1, -rightSpeed / planarSpeed)),
    gaitPlaybackDirection: forwardSpeed < 0 ? -1 : 1,
    sector: sectorForAngle(travelDirectionRadians),
  });
}
