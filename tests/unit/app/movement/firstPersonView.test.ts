import { describe, expect, it } from 'vitest';
import { LocalInkfallPracticeInputBuffer } from '../../../../src/app/localInkfallPracticeInput';
import {
  cameraPositionBlend,
  cameraSettingsFromPreferences,
  pointerLookDelta,
} from '../../../../src/app/movement/firstPersonView';
import { projectAuthorityLook } from '../../../../src/dev/authorityLookInput';
import {
  movementEyeHeightMillimeters,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  MOVEMENT_PITCH_MAX_MILLI_DEGREES,
} from '../../../../src/sim/movement';

describe('first-person input and camera truth', () => {
  it('uses the saved FOV, sensitivity, invert, ADS and reduced-motion preferences', () => {
    expect(cameraSettingsFromPreferences({}).fovDegrees).toBe(78);
    const settings = cameraSettingsFromPreferences({
      fov: 100, sensitivity: 2, invertY: true, adsSensitivity: 0.5, reducedMotion: true,
    });
    expect(settings).toMatchObject({
      fovDegrees: 100, mouseSensitivity: 2, invertY: true,
      adsSensitivityMultiplier: 0.5, reducedMotion: true, headBobIntensity: 0,
    });
    expect(pointerLookDelta(10, 4, settings, false)).toEqual({
      yawMilliDegrees: 2_200, pitchMilliDegrees: 880,
    });
    expect(pointerLookDelta(10, 4, settings, true)).toEqual({
      yawMilliDegrees: 1_100, pitchMilliDegrees: 440,
    });
  });

  it('keeps Practice and online pointer conversion identical before publishing once', () => {
    const settings = cameraSettingsFromPreferences({ sensitivity: 1.5, adsSensitivity: 0.6 });
    const input = new LocalInkfallPracticeInputBuffer({ cameraSettings: settings });
    input.handlePointerButton(2, true);
    input.addPointerLook(20, -10);
    const online = pointerLookDelta(20, -10, settings, true);
    expect(input.pendingLookYawMilliDegrees).toBe(online.yawMilliDegrees);
    expect(input.pendingLookPitchMilliDegrees).toBe(online.pitchMilliDegrees);
    expect(input.consume()).toMatchObject({
      lookYawDeltaMilliDegrees: online.yawMilliDegrees,
      lookPitchDeltaMilliDegrees: online.pitchMilliDegrees,
    });
    expect(input.consume()).toMatchObject({ lookYawDeltaMilliDegrees: 0, lookPitchDeltaMilliDegrees: 0 });
  });

  it('normalizes malformed preferences and keeps extreme mouse events wire-safe', () => {
    const settings = cameraSettingsFromPreferences({ fov: 999, sensitivity: 999, adsSensitivity: -10 });
    expect(settings).toMatchObject({ fovDegrees: 110, mouseSensitivity: 3, adsSensitivityMultiplier: 0.1 });
    expect(pointerLookDelta(1e9, -1e9, settings, false)).toEqual({ yawMilliDegrees: 32_767, pitchMilliDegrees: 32_767 });
    expect(pointerLookDelta(NaN, Infinity, settings, false)).toEqual({ yawMilliDegrees: 0, pitchMilliDegrees: 0 });
  });

  it('derives standing and crouched eyes from the same authority collision profile', () => {
    expect(movementEyeHeightMillimeters(PHASE3_HYPOTHESIS_MOVEMENT_PROFILE, 'standing')).toBe(1_700);
    expect(movementEyeHeightMillimeters(PHASE3_HYPOTHESIS_MOVEMENT_PROFILE, 'crouched')).toBe(1_000);
    // A 1.2 m cover edge conceals the crouched eye but permits the standing eye.
    expect(movementEyeHeightMillimeters(PHASE3_HYPOTHESIS_MOVEMENT_PROFILE, 'standing')).toBeGreaterThan(1_200);
    expect(movementEyeHeightMillimeters(PHASE3_HYPOTHESIS_MOVEMENT_PROFILE, 'crouched')).toBeLessThan(1_200);
  });

  it('has the same positional step response after 100 ms at 30, 60 and 120 FPS', () => {
    const positions = [30, 60, 120].map((fps) => {
      let position = 0;
      for (let frame = 0; frame < fps / 10; frame += 1) {
        position += (1 - position) * cameraPositionBlend(1 / fps);
      }
      return position;
    });
    expect(positions[0]).toBeCloseTo(positions[1]!, 12);
    expect(positions[2]).toBeCloseTo(positions[1]!, 12);
    expect(positions[1]).toBeCloseTo(1 - 0.58 ** 6, 12);
    expect(cameraPositionBlend(0)).toBe(0);
  });

  it('projects unsent look immediately with authority yaw wrap and pitch clamp', () => {
    const committed = { yawMilliDegrees: 359_000, pitchMilliDegrees: 0 };
    expect(projectAuthorityLook(committed, 2_000, 200_000)).toEqual({
      yawMilliDegrees: 1_000,
      pitchMilliDegrees: MOVEMENT_PITCH_MAX_MILLI_DEGREES,
    });
    expect(committed).toEqual({ yawMilliDegrees: 359_000, pitchMilliDegrees: 0 });
  });
});
