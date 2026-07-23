import { describe, expect, it } from 'vitest';

import {
  CAMERA_SETTINGS_BOUNDS,
  CAMERA_SETTINGS_SCHEMA_VERSION,
  DEFAULT_CAMERA_PRESENTATION_SETTINGS,
  applyReducedMotionPreset,
  migrateLegacyCameraSettings,
  validateCameraPresentationSettings,
} from '../../../../src/app/movement';

describe('camera presentation settings', () => {
  it('publishes a frozen versioned default with FOV 90 and hard bounds', () => {
    expect(DEFAULT_CAMERA_PRESENTATION_SETTINGS).toMatchObject({
      schemaVersion: CAMERA_SETTINGS_SCHEMA_VERSION,
      fovDegrees: 90,
      mouseSensitivity: 1,
      adsSensitivityMultiplier: 1,
      reducedMotion: false,
    });
    expect(CAMERA_SETTINGS_BOUNDS.fovDegrees).toEqual({
      minimum: 60,
      maximum: 120,
    });
    expect(Object.isFrozen(DEFAULT_CAMERA_PRESENTATION_SETTINGS)).toBe(true);
    expect(Object.isFrozen(CAMERA_SETTINGS_BOUNDS.fovDegrees)).toBe(true);
  });

  it('strictly validates fields, bounds, unknown keys, and unsafe accessors', () => {
    const accepted = validateCameraPresentationSettings({
      ...DEFAULT_CAMERA_PRESENTATION_SETTINGS,
      fovDegrees: CAMERA_SETTINGS_BOUNDS.fovDegrees.maximum,
      mouseSensitivity: CAMERA_SETTINGS_BOUNDS.mouseSensitivity.minimum,
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) expect(Object.isFrozen(accepted.value)).toBe(true);

    const rejected = validateCameraPresentationSettings({
      ...DEFAULT_CAMERA_PRESENTATION_SETTINGS,
      fovDegrees: 121,
      extraAuthorityFlag: true,
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'unknown_field', path: 'extraAuthorityFlag' }),
          expect.objectContaining({ code: 'out_of_bounds', path: 'fovDegrees' }),
        ]),
      );
    }

    let getterReads = 0;
    const accessorSettings = { ...DEFAULT_CAMERA_PRESENTATION_SETTINGS };
    Object.defineProperty(accessorSettings, 'fovDegrees', {
      enumerable: true,
      get() {
        getterReads += 1;
        return 90;
      },
    });
    const unsafe = validateCameraPresentationSettings(accessorSettings);
    expect(unsafe.ok).toBe(false);
    expect(getterReads).toBe(0);
    if (!unsafe.ok) {
      expect(unsafe.issues).toContainEqual(
        expect.objectContaining({ code: 'unsafe_field', path: 'fovDegrees' }),
      );
    }

    const emptyAccessorSettings = { ...DEFAULT_CAMERA_PRESENTATION_SETTINGS };
    Object.defineProperty(emptyAccessorSettings, 'fovDegrees', {
      enumerable: true,
      get: undefined,
      set: undefined,
    });
    const emptyAccessor = validateCameraPresentationSettings(
      emptyAccessorSettings,
    );
    expect(emptyAccessor.ok).toBe(false);
    if (!emptyAccessor.ok) {
      expect(emptyAccessor.issues).toContainEqual(
        expect.objectContaining({ code: 'unsafe_field', path: 'fovDegrees' }),
      );
    }
  });

  it('preserves explicit legacy FOV 78 instead of guessing that it was implicit', () => {
    const migrated = migrateLegacyCameraSettings({
      fov: 78,
      sensitivity: 0.8,
      invertY: true,
      volume: 0.5,
      quality: 'medium',
    });

    expect(migrated.value).toMatchObject({
      schemaVersion: 1,
      fovDegrees: 78,
      mouseSensitivity: 0.8,
      invertY: true,
    });
    expect(migrated.preservedLegacyFields).toEqual([
      'fov',
      'sensitivity',
      'invertY',
    ]);
    expect(migrated.defaultedLegacyFields).toEqual([]);
    expect(migrated.notices).toEqual([]);

    const missingFov = migrateLegacyCameraSettings({ sensitivity: 1.25 });
    expect(missingFov.value.fovDegrees).toBe(90);
    expect(missingFov.defaultedLegacyFields).toContain('fov');
  });

  it('defaults unsafe legacy accessors without reading them', () => {
    let getterReads = 0;
    const legacy = Object.defineProperty({}, 'fov', {
      enumerable: true,
      get() {
        getterReads += 1;
        return 78;
      },
    });

    const migrated = migrateLegacyCameraSettings(legacy);
    expect(getterReads).toBe(0);
    expect(migrated.value.fovDegrees).toBe(90);
    expect(migrated.notices).toContainEqual(
      expect.objectContaining({ code: 'unsafe_field', field: 'fov' }),
    );

    const emptyAccessor = Object.defineProperty({}, 'fov', {
      enumerable: true,
      get: undefined,
      set: undefined,
    });
    const emptyAccessorMigration = migrateLegacyCameraSettings(emptyAccessor);
    expect(emptyAccessorMigration.value.fovDegrees).toBe(90);
    expect(emptyAccessorMigration.notices).toContainEqual(
      expect.objectContaining({ code: 'unsafe_field', field: 'fov' }),
    );
  });

  it('applies reduced motion only to bounded presentation intensities', () => {
    const base = {
      ...DEFAULT_CAMERA_PRESENTATION_SETTINGS,
      fovDegrees: 101,
      mouseSensitivity: 1.4,
      invertY: true,
      adsSensitivityMultiplier: 0.65,
    };
    const reduced = applyReducedMotionPreset(base);

    expect(reduced).toEqual({
      ...base,
      headBobIntensity: 0,
      landingKickIntensity: 0,
      sprintFovIntensity: 0,
      slideTiltIntensity: 0,
      cameraShakeIntensity: 0,
      reducedMotion: true,
    });
    expect(reduced.fovDegrees).toBe(101);
    expect(reduced.mouseSensitivity).toBe(1.4);
    expect(Object.isFrozen(reduced)).toBe(true);
    expect(validateCameraPresentationSettings(reduced).ok).toBe(true);
  });
});
