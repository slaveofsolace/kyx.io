export const CAMERA_SETTINGS_SCHEMA_VERSION = 1 as const;

export interface CameraPresentationSettingsV1 {
  readonly schemaVersion: typeof CAMERA_SETTINGS_SCHEMA_VERSION;
  readonly fovDegrees: number;
  readonly mouseSensitivity: number;
  readonly invertY: boolean;
  readonly adsSensitivityMultiplier: number;
  readonly headBobIntensity: number;
  readonly landingKickIntensity: number;
  readonly sprintFovIntensity: number;
  readonly slideTiltIntensity: number;
  readonly cameraShakeIntensity: number;
  readonly reducedMotion: boolean;
}

export interface CameraSettingBound {
  readonly minimum: number;
  readonly maximum: number;
}

function bound(minimum: number, maximum: number): CameraSettingBound {
  return Object.freeze({ minimum, maximum });
}

export const CAMERA_SETTINGS_BOUNDS = Object.freeze({
  fovDegrees: bound(60, 120),
  mouseSensitivity: bound(0.1, 5),
  adsSensitivityMultiplier: bound(0.1, 1.5),
  headBobIntensity: bound(0, 1),
  landingKickIntensity: bound(0, 1),
  sprintFovIntensity: bound(0, 1),
  slideTiltIntensity: bound(0, 1),
  cameraShakeIntensity: bound(0, 1),
});

export const DEFAULT_CAMERA_PRESENTATION_SETTINGS: CameraPresentationSettingsV1 =
  Object.freeze({
    schemaVersion: CAMERA_SETTINGS_SCHEMA_VERSION,
    fovDegrees: 90,
    mouseSensitivity: 1,
    invertY: false,
    adsSensitivityMultiplier: 1,
    headBobIntensity: 1,
    landingKickIntensity: 1,
    sprintFovIntensity: 1,
    slideTiltIntensity: 1,
    cameraShakeIntensity: 1,
    reducedMotion: false,
  });

const CAMERA_SETTING_FIELDS = Object.freeze([
  'schemaVersion',
  'fovDegrees',
  'mouseSensitivity',
  'invertY',
  'adsSensitivityMultiplier',
  'headBobIntensity',
  'landingKickIntensity',
  'sprintFovIntensity',
  'slideTiltIntensity',
  'cameraShakeIntensity',
  'reducedMotion',
] as const);

type CameraSettingField = (typeof CAMERA_SETTING_FIELDS)[number];
type BoundedCameraSettingField = keyof typeof CAMERA_SETTINGS_BOUNDS;

const CAMERA_SETTING_FIELD_SET = new Set<string>(CAMERA_SETTING_FIELDS);
const BOOLEAN_FIELDS = new Set<CameraSettingField>(['invertY', 'reducedMotion']);
const BOUNDED_FIELDS = Object.freeze(
  Object.keys(CAMERA_SETTINGS_BOUNDS) as BoundedCameraSettingField[],
);

export type CameraSettingsValidationIssueCode =
  | 'not_plain_object'
  | 'unsafe_object'
  | 'unsafe_field'
  | 'unknown_field'
  | 'missing_field'
  | 'invalid_schema_version'
  | 'invalid_type'
  | 'out_of_bounds';

export interface CameraSettingsValidationIssue {
  readonly code: CameraSettingsValidationIssueCode;
  readonly path: string;
  readonly message: string;
}

export type CameraSettingsValidationResult =
  | {
      readonly ok: true;
      readonly value: CameraPresentationSettingsV1;
    }
  | {
      readonly ok: false;
      readonly issues: readonly CameraSettingsValidationIssue[];
    };

function issue(
  code: CameraSettingsValidationIssueCode,
  path: string,
  message: string,
): CameraSettingsValidationIssue {
  return Object.freeze({ code, path, message });
}

function invalidResult(
  issues: readonly CameraSettingsValidationIssue[],
): CameraSettingsValidationResult {
  return Object.freeze({ ok: false as const, issues: Object.freeze([...issues]) });
}

function ownDataDescriptors(
  input: unknown,
):
  | { readonly ok: true; readonly descriptors: PropertyDescriptorMap }
  | { readonly ok: false; readonly issues: readonly CameraSettingsValidationIssue[] } {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return {
      ok: false,
      issues: [
        issue('not_plain_object', '$', 'camera settings must be a plain object'),
      ],
    };
  }

  let prototype: object | null;
  let keys: readonly PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(input);
    keys = Reflect.ownKeys(input);
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch {
    return {
      ok: false,
      issues: [issue('unsafe_object', '$', 'camera settings could not be inspected safely')],
    };
  }

  if (prototype !== Object.prototype && prototype !== null) {
    return {
      ok: false,
      issues: [
        issue('not_plain_object', '$', 'camera settings must be a plain object'),
      ],
    };
  }

  const issues: CameraSettingsValidationIssue[] = [];
  for (const key of keys) {
    if (typeof key !== 'string') {
      issues.push(
        issue('unsafe_field', '$', 'camera settings cannot contain symbol fields'),
      );
      continue;
    }
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      descriptor.enumerable !== true ||
      !('value' in descriptor)
    ) {
      issues.push(
        issue('unsafe_field', key, 'camera setting must be an enumerable data field'),
      );
    }
  }
  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, descriptors };
}

export function validateCameraPresentationSettings(
  input: unknown,
): CameraSettingsValidationResult {
  const inspected = ownDataDescriptors(input);
  if (!inspected.ok) return invalidResult(inspected.issues);

  const issues: CameraSettingsValidationIssue[] = [];
  const descriptorKeys = Object.keys(inspected.descriptors);
  for (const key of descriptorKeys.sort()) {
    if (!CAMERA_SETTING_FIELD_SET.has(key)) {
      issues.push(issue('unknown_field', key, `unsupported camera setting: ${key}`));
    }
  }
  for (const field of CAMERA_SETTING_FIELDS) {
    if (inspected.descriptors[field] === undefined) {
      issues.push(issue('missing_field', field, `missing camera setting: ${field}`));
    }
  }

  const valueFor = (field: CameraSettingField): unknown =>
    inspected.descriptors[field]?.value as unknown;

  if (inspected.descriptors.schemaVersion !== undefined) {
    const version = valueFor('schemaVersion');
    if (version !== CAMERA_SETTINGS_SCHEMA_VERSION) {
      issues.push(
        issue(
          'invalid_schema_version',
          'schemaVersion',
          `camera settings schemaVersion must be ${CAMERA_SETTINGS_SCHEMA_VERSION}`,
        ),
      );
    }
  }

  for (const field of BOOLEAN_FIELDS) {
    if (
      inspected.descriptors[field] !== undefined &&
      typeof valueFor(field) !== 'boolean'
    ) {
      issues.push(issue('invalid_type', field, `${field} must be a boolean`));
    }
  }

  for (const field of BOUNDED_FIELDS) {
    if (inspected.descriptors[field] === undefined) continue;
    const value = valueFor(field);
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      issues.push(issue('invalid_type', field, `${field} must be a finite number`));
      continue;
    }
    const limits = CAMERA_SETTINGS_BOUNDS[field];
    if (value < limits.minimum || value > limits.maximum) {
      issues.push(
        issue(
          'out_of_bounds',
          field,
          `${field} must be between ${limits.minimum} and ${limits.maximum}`,
        ),
      );
    }
  }

  if (issues.length > 0) return invalidResult(issues);

  const value: CameraPresentationSettingsV1 = Object.freeze({
    schemaVersion: CAMERA_SETTINGS_SCHEMA_VERSION,
    fovDegrees: valueFor('fovDegrees') as number,
    mouseSensitivity: valueFor('mouseSensitivity') as number,
    invertY: valueFor('invertY') as boolean,
    adsSensitivityMultiplier: valueFor('adsSensitivityMultiplier') as number,
    headBobIntensity: valueFor('headBobIntensity') as number,
    landingKickIntensity: valueFor('landingKickIntensity') as number,
    sprintFovIntensity: valueFor('sprintFovIntensity') as number,
    slideTiltIntensity: valueFor('slideTiltIntensity') as number,
    cameraShakeIntensity: valueFor('cameraShakeIntensity') as number,
    reducedMotion: valueFor('reducedMotion') as boolean,
  });
  return Object.freeze({ ok: true as const, value });
}

export function requireCameraPresentationSettings(
  input: unknown,
): CameraPresentationSettingsV1 {
  const result = validateCameraPresentationSettings(input);
  if (result.ok) return result.value;
  const details = result.issues
    .map((validationIssue) => `${validationIssue.path}: ${validationIssue.message}`)
    .join('; ');
  throw new RangeError(`invalid camera presentation settings: ${details}`);
}

export function applyReducedMotionPreset(
  base: unknown = DEFAULT_CAMERA_PRESENTATION_SETTINGS,
): CameraPresentationSettingsV1 {
  const settings = requireCameraPresentationSettings(base);
  return Object.freeze({
    ...settings,
    headBobIntensity: 0,
    landingKickIntensity: 0,
    sprintFovIntensity: 0,
    slideTiltIntensity: 0,
    cameraShakeIntensity: 0,
    reducedMotion: true,
  });
}

export type LegacyCameraSettingField = 'fov' | 'sensitivity' | 'invertY';
export type CameraSettingsMigrationNoticeCode =
  | 'invalid_input'
  | 'unsafe_field'
  | 'invalid_type'
  | 'out_of_bounds';

export interface CameraSettingsMigrationNotice {
  readonly code: CameraSettingsMigrationNoticeCode;
  readonly field: LegacyCameraSettingField | '$';
  readonly message: string;
}

export interface LegacyCameraSettingsMigrationResult {
  readonly value: CameraPresentationSettingsV1;
  readonly preservedLegacyFields: readonly LegacyCameraSettingField[];
  readonly defaultedLegacyFields: readonly LegacyCameraSettingField[];
  readonly notices: readonly CameraSettingsMigrationNotice[];
}

const LEGACY_FIELDS = Object.freeze([
  'fov',
  'sensitivity',
  'invertY',
] as const satisfies readonly LegacyCameraSettingField[]);

function migrationNotice(
  code: CameraSettingsMigrationNoticeCode,
  field: LegacyCameraSettingField | '$',
  message: string,
): CameraSettingsMigrationNotice {
  return Object.freeze({ code, field, message });
}

/**
 * Migrates the unversioned `sio_settings` camera fields. Presence is determined
 * by an own data property, so an explicit legacy FOV of 78 is always preserved.
 */
export function migrateLegacyCameraSettings(
  input: unknown,
): LegacyCameraSettingsMigrationResult {
  const next = { ...DEFAULT_CAMERA_PRESENTATION_SETTINGS };
  const preserved: LegacyCameraSettingField[] = [];
  const defaulted: LegacyCameraSettingField[] = [];
  const notices: CameraSettingsMigrationNotice[] = [];

  let descriptors: PropertyDescriptorMap | undefined;
  if (input === undefined || input === null) {
    descriptors = {};
  } else if (typeof input !== 'object' || Array.isArray(input)) {
    notices.push(
      migrationNotice('invalid_input', '$', 'legacy camera settings must be an object'),
    );
  } else {
    try {
      const prototype = Object.getPrototypeOf(input);
      if (prototype === Object.prototype || prototype === null) {
        descriptors = Object.getOwnPropertyDescriptors(input);
      } else {
        notices.push(
          migrationNotice(
            'invalid_input',
            '$',
            'legacy camera settings must be a plain object',
          ),
        );
      }
    } catch {
      notices.push(
        migrationNotice(
          'invalid_input',
          '$',
          'legacy camera settings could not be inspected safely',
        ),
      );
    }
  }

  const migrateNumber = (
    legacyField: 'fov' | 'sensitivity',
    targetField: 'fovDegrees' | 'mouseSensitivity',
  ): void => {
    const descriptor = descriptors?.[legacyField];
    if (descriptor === undefined) {
      defaulted.push(legacyField);
      return;
    }
    if (
      descriptor.enumerable !== true ||
      !('value' in descriptor)
    ) {
      defaulted.push(legacyField);
      notices.push(
        migrationNotice('unsafe_field', legacyField, `${legacyField} is not a safe data field`),
      );
      return;
    }
    const value = descriptor.value as unknown;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      defaulted.push(legacyField);
      notices.push(
        migrationNotice('invalid_type', legacyField, `${legacyField} must be a finite number`),
      );
      return;
    }
    const limits = CAMERA_SETTINGS_BOUNDS[targetField];
    if (value < limits.minimum || value > limits.maximum) {
      defaulted.push(legacyField);
      notices.push(
        migrationNotice(
          'out_of_bounds',
          legacyField,
          `${legacyField} must be between ${limits.minimum} and ${limits.maximum}`,
        ),
      );
      return;
    }
    next[targetField] = value;
    preserved.push(legacyField);
  };

  migrateNumber('fov', 'fovDegrees');
  migrateNumber('sensitivity', 'mouseSensitivity');

  const invertDescriptor = descriptors?.invertY;
  if (invertDescriptor === undefined) {
    defaulted.push('invertY');
  } else if (
    invertDescriptor.enumerable !== true ||
    !('value' in invertDescriptor)
  ) {
    defaulted.push('invertY');
    notices.push(
      migrationNotice('unsafe_field', 'invertY', 'invertY is not a safe data field'),
    );
  } else if (typeof invertDescriptor.value !== 'boolean') {
    defaulted.push('invertY');
    notices.push(
      migrationNotice('invalid_type', 'invertY', 'invertY must be a boolean'),
    );
  } else {
    next.invertY = invertDescriptor.value;
    preserved.push('invertY');
  }

  if (descriptors === undefined) {
    for (const field of LEGACY_FIELDS) {
      if (!defaulted.includes(field)) defaulted.push(field);
    }
  }

  return Object.freeze({
    value: Object.freeze(next),
    preservedLegacyFields: Object.freeze(preserved),
    defaultedLegacyFields: Object.freeze(defaulted),
    notices: Object.freeze(notices),
  });
}
