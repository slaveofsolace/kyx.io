import { PROTOCOL_LIMITS } from '../net';
import {
  clampMilliDegrees,
  MOVEMENT_PITCH_MAX_MILLI_DEGREES,
  MOVEMENT_PITCH_MIN_MILLI_DEGREES,
  normalizeYawMilliDegrees,
} from '../sim';

export interface AuthorityLookInputState {
  readonly continuousYawMilliDegrees: number;
  readonly continuousPitchMilliDegrees: number;
  readonly pendingYawMilliDegrees: number;
  readonly pendingPitchMilliDegrees: number;
}

export interface AuthorityLookDelta {
  readonly yawMilliDegrees: number;
  readonly pitchMilliDegrees: number;
}

/** Present queued mouse intent without consuming it or changing simulation. */
export function projectAuthorityLook(
  look: AuthorityLookDelta,
  yawDelta: number,
  pitchDelta: number,
): AuthorityLookDelta {
  return {
    yawMilliDegrees: normalizeYawMilliDegrees(look.yawMilliDegrees + yawDelta),
    pitchMilliDegrees: clampMilliDegrees(
      look.pitchMilliDegrees + pitchDelta,
      MOVEMENT_PITCH_MIN_MILLI_DEGREES,
      MOVEMENT_PITCH_MAX_MILLI_DEGREES,
    ),
  };
}

const EMPTY_LOOK_INPUT: AuthorityLookInputState = Object.freeze({
  continuousYawMilliDegrees: 0,
  continuousPitchMilliDegrees: 0,
  pendingYawMilliDegrees: 0,
  pendingPitchMilliDegrees: 0,
});

function assertLookDelta(value: number, label: string): void {
  if (
    !Number.isInteger(value)
    || Math.abs(value) > PROTOCOL_LIMITS.maxLookDeltaMilliDegrees
  ) {
    throw new RangeError(`${label} exceeds the protocol limit`);
  }
}

function boundedLookDelta(value: number): number {
  return Math.max(
    -PROTOCOL_LIMITS.maxLookDeltaMilliDegrees,
    Math.min(PROTOCOL_LIMITS.maxLookDeltaMilliDegrees, value),
  );
}

function freezeLookInput(state: AuthorityLookInputState): AuthorityLookInputState {
  return Object.freeze({ ...state });
}

export function createAuthorityLookInputState(): AuthorityLookInputState {
  return EMPTY_LOOK_INPUT;
}

/**
 * Set a continuous per-authority-tick look delta. This is used by held
 * keyboard/controller turning and remains active until explicitly replaced.
 */
export function setAuthorityContinuousLook(
  state: AuthorityLookInputState,
  yawMilliDegrees: number,
  pitchMilliDegrees = 0,
): AuthorityLookInputState {
  assertLookDelta(yawMilliDegrees, 'authority continuous yaw delta');
  assertLookDelta(pitchMilliDegrees, 'authority continuous pitch delta');
  return freezeLookInput({
    ...state,
    continuousYawMilliDegrees: yawMilliDegrees,
    continuousPitchMilliDegrees: pitchMilliDegrees,
  });
}

/**
 * Accumulate render-frame pointer deltas for exactly one authority command.
 * Saturation keeps rapid mouse input inside the existing protocol boundary
 * without allowing one render event to overwrite another.
 */
export function accumulateAuthorityLookImpulse(
  state: AuthorityLookInputState,
  yawMilliDegrees: number,
  pitchMilliDegrees = 0,
): AuthorityLookInputState {
  assertLookDelta(yawMilliDegrees, 'authority pointer yaw delta');
  assertLookDelta(pitchMilliDegrees, 'authority pointer pitch delta');
  return freezeLookInput({
    ...state,
    pendingYawMilliDegrees: boundedLookDelta(
      state.pendingYawMilliDegrees + yawMilliDegrees,
    ),
    pendingPitchMilliDegrees: boundedLookDelta(
      state.pendingPitchMilliDegrees + pitchMilliDegrees,
    ),
  });
}

export function sampleAuthorityLookDelta(
  state: AuthorityLookInputState,
): AuthorityLookDelta {
  return Object.freeze({
    yawMilliDegrees: boundedLookDelta(
      state.continuousYawMilliDegrees + state.pendingYawMilliDegrees,
    ),
    pitchMilliDegrees: boundedLookDelta(
      state.continuousPitchMilliDegrees + state.pendingPitchMilliDegrees,
    ),
  });
}

/** Clear only one-shot pointer motion after a command is successfully sent. */
export function consumeAuthorityLookImpulse(
  state: AuthorityLookInputState,
): AuthorityLookInputState {
  if (
    state.pendingYawMilliDegrees === 0
    && state.pendingPitchMilliDegrees === 0
  ) return state;
  return freezeLookInput({
    ...state,
    pendingYawMilliDegrees: 0,
    pendingPitchMilliDegrees: 0,
  });
}

export function neutralizeAuthorityLookInput(): AuthorityLookInputState {
  return EMPTY_LOOK_INPUT;
}
