import { normalizeSettings } from '../../core/GameSettings.js';
import { PROTOCOL_LIMITS } from '../../net/protocol';
import {
  DEFAULT_CAMERA_PRESENTATION_SETTINGS,
  applyReducedMotionPreset,
  requireCameraPresentationSettings,
  type CameraPresentationSettingsV1,
} from './cameraSettings';

export function cameraSettingsFromPreferences(
  preferences: Record<string, unknown>,
): CameraPresentationSettingsV1 {
  const saved = normalizeSettings(preferences);
  const settings = requireCameraPresentationSettings({
    ...DEFAULT_CAMERA_PRESENTATION_SETTINGS,
    fovDegrees: saved.fov,
    mouseSensitivity: saved.sensitivity,
    invertY: saved.invertY,
    adsSensitivityMultiplier: saved.adsSensitivity,
    reducedMotion: saved.reducedMotion,
  });
  return settings.reducedMotion ? applyReducedMotionPreset(settings) : settings;
}

export function pointerLookDelta(
  movementX: number,
  movementY: number,
  settings: CameraPresentationSettingsV1,
  aimHeld: boolean,
): Readonly<{ yawMilliDegrees: number; pitchMilliDegrees: number }> {
  const scale = 110 * settings.mouseSensitivity
    * (aimHeld ? settings.adsSensitivityMultiplier : 1);
  const quantize = (pixels: number): number => Number.isFinite(pixels)
    ? Math.max(-PROTOCOL_LIMITS.maxLookDeltaMilliDegrees, Math.min(
        PROTOCOL_LIMITS.maxLookDeltaMilliDegrees,
        Math.round(pixels * scale),
      ))
    : 0;
  return {
    yawMilliDegrees: quantize(movementX),
    pitchMilliDegrees: quantize(movementY * (settings.invertY ? 1 : -1)),
  };
}

/** Preserve the former 60 Hz response at every render rate. */
export function cameraPositionBlend(deltaSeconds: number, alphaAt60Hz = 0.42): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return 0;
  return 1 - Math.pow(1 - alphaAt60Hz, deltaSeconds * 60);
}
