import {
  RULESET_SCHEMA_VERSION,
  type AbilityContentV1,
  type CombatProfileContentV1,
  type ContentErrorCode,
  type ContentImplementationStatus,
  type ContentProvenance,
  type ContentValidationIssue,
  type ContentValidationResult,
  type MovementProfileImplementationStatus,
  type PresentationContract,
  type RulesetContentV1,
  type WeaponContentV1,
} from './ruleset';

const MAX_CONTENT_STRING_LENGTH = 256;
const MAX_CONTENT_ARRAY_LENGTH = 128;
const MAX_RECORDS_PER_KIND = 64;
const MAX_AUTHORITY_TICKS = 20 * 60 * 10;
const MAX_SCALAR = 1_000_000;
const MAX_CONTENT_SNAPSHOT_DEPTH = 32;
const MAX_CONTENT_SNAPSHOT_ARRAY_LENGTH = 1_024;
const MAX_CONTENT_SNAPSHOT_OBJECT_FIELDS = 256;
const SEMANTIC_ID = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

type UnknownRecord = Record<string, unknown>;

class Collector {
  readonly issues: ContentValidationIssue[] = [];

  add(code: ContentErrorCode, path: string, message: string): void {
    this.issues.push({ code, path, message });
  }
}

class ContentSnapshotAbort extends Error {
  readonly issue: ContentValidationIssue;

  constructor(path: string, message: string) {
    super(message);
    this.name = 'ContentSnapshotAbort';
    this.issue = { code: 'CONTENT_INVALID_FIELD_VALUE', path, message };
  }
}

function rejectSnapshot(path: string, message: string): never {
  throw new ContentSnapshotAbort(path, message);
}

/**
 * Copies untrusted input without invoking user-defined property accessors.
 * The returned graph contains only detached JSON data with plain containers.
 */
function snapshotContentValue(
  value: unknown,
  path: string,
  active: Set<object>,
  depth: number,
): unknown {
  if (depth > MAX_CONTENT_SNAPSHOT_DEPTH) {
    rejectSnapshot(path, 'Content value exceeds the maximum nesting depth.');
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      rejectSnapshot(path, 'Content values must contain only finite JSON numbers.');
    }
    return value;
  }
  if (typeof value !== 'object') {
    rejectSnapshot(path, 'Content values must contain only JSON data.');
  }
  if (active.has(value)) {
    rejectSnapshot(path, 'Content values cannot contain cycles.');
  }

  active.add(value);
  try {
    const prototype = Object.getPrototypeOf(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key === 'symbol')) {
      rejectSnapshot(path, 'Content values cannot contain symbol fields.');
    }

    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) {
        rejectSnapshot(path, 'Expected a plain content array.');
      }

      const lengthDescriptor = descriptors.length;
      if (
        !lengthDescriptor
        || !('value' in lengthDescriptor)
        || !Number.isInteger(lengthDescriptor.value)
        || lengthDescriptor.value < 0
      ) {
        rejectSnapshot(path, 'Content array length could not be inspected safely.');
      }
      const length = lengthDescriptor.value as number;
      if (length > MAX_CONTENT_SNAPSHOT_ARRAY_LENGTH) {
        rejectSnapshot(path, `Content array exceeds the absolute ${MAX_CONTENT_SNAPSHOT_ARRAY_LENGTH}-entry limit.`);
      }

      const allowedKeys = new Set([
        'length',
        ...Array.from({ length }, (_, index) => String(index)),
      ]);
      for (const key of keys) {
        if (typeof key === 'string' && !allowedKeys.has(key)) {
          rejectSnapshot(`${path}.${key}`, 'Content arrays cannot contain named fields.');
        }
      }

      const snapshot: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) {
          rejectSnapshot(`${path}[${index}]`, 'Content arrays cannot be sparse.');
        }
        if (!descriptor.enumerable || !('value' in descriptor) || descriptor.get || descriptor.set) {
          rejectSnapshot(`${path}[${index}]`, 'Content values cannot contain accessors.');
        }
        snapshot.push(
          snapshotContentValue(descriptor.value, `${path}[${index}]`, active, depth + 1),
        );
      }
      return snapshot;
    }

    if (prototype !== Object.prototype && prototype !== null) {
      rejectSnapshot(path, 'Expected a plain content object.');
    }
    if (keys.length > MAX_CONTENT_SNAPSHOT_OBJECT_FIELDS) {
      rejectSnapshot(path, 'Content object contains too many fields.');
    }

    const snapshot: UnknownRecord = Object.create(null) as UnknownRecord;
    for (const key of keys) {
      if (typeof key !== 'string') continue;
      const descriptor = descriptors[key];
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.get || descriptor.set) {
        rejectSnapshot(`${path}.${key}`, 'Content fields must be enumerable data properties.');
      }
      snapshot[key] = snapshotContentValue(descriptor.value, `${path}.${key}`, active, depth + 1);
    }
    return snapshot;
  } catch (error) {
    if (error instanceof ContentSnapshotAbort) throw error;
    rejectSnapshot(path, 'Content value could not be inspected safely.');
  } finally {
    active.delete(value);
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectAt(
  value: unknown,
  path: string,
  allowedKeys: readonly string[],
  collector: Collector,
): UnknownRecord | null {
  if (!isRecord(value)) {
    collector.add('CONTENT_INVALID_FIELD_TYPE', path, 'Expected an object.');
    return null;
  }

  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      collector.add(
        'CONTENT_UNKNOWN_FIELD',
        `${path}.${key}`,
        'Unknown content field.',
      );
    }
  }
  return value;
}

function required(record: UnknownRecord, key: string, path: string, collector: Collector): unknown {
  if (!Object.hasOwn(record, key)) {
    collector.add('CONTENT_REQUIRED_FIELD', `${path}.${key}`, 'Required field is missing.');
    return undefined;
  }
  return record[key];
}

interface StringOptions {
  readonly semanticId?: boolean;
  readonly maxLength?: number;
  readonly allowed?: readonly string[];
  readonly nullable?: boolean;
}

function stringAt(
  value: unknown,
  path: string,
  collector: Collector,
  options: StringOptions = {},
): string | null | undefined {
  if (value === null && options.nullable) return null;
  if (typeof value !== 'string') {
    collector.add('CONTENT_INVALID_FIELD_TYPE', path, 'Expected a string.');
    return undefined;
  }
  const maxLength = options.maxLength ?? MAX_CONTENT_STRING_LENGTH;
  if (value.length === 0 || value.length > maxLength) {
    collector.add(
      value.length > maxLength ? 'CONTENT_STRING_TOO_LONG' : 'CONTENT_INVALID_FIELD_VALUE',
      path,
      `Expected a non-empty string no longer than ${maxLength} characters.`,
    );
  }
  if (options.semanticId && !SEMANTIC_ID.test(value)) {
    collector.add('CONTENT_INVALID_FIELD_VALUE', path, 'Expected a stable snake_case semantic ID.');
  }
  if (options.allowed && !options.allowed.includes(value)) {
    collector.add('CONTENT_INVALID_FIELD_VALUE', path, 'Value is not in the supported set.');
  }
  return value;
}

interface NumberOptions {
  readonly integer?: boolean;
  readonly min?: number;
  readonly max?: number;
  readonly nullable?: boolean;
}

function numberAt(
  value: unknown,
  path: string,
  collector: Collector,
  options: NumberOptions = {},
): number | null | undefined {
  if (value === null && options.nullable) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    collector.add('CONTENT_INVALID_FIELD_TYPE', path, 'Expected a finite number.');
    return undefined;
  }
  if (options.integer && !Number.isInteger(value)) {
    collector.add('CONTENT_INVALID_FIELD_VALUE', path, 'Expected an integer.');
  }
  if ((options.min !== undefined && value < options.min) || (options.max !== undefined && value > options.max)) {
    collector.add('CONTENT_NUMERIC_OUT_OF_RANGE', path, 'Number is outside the supported range.');
  }
  return value;
}

function booleanAt(
  value: unknown,
  path: string,
  collector: Collector,
  nullable = false,
): boolean | null | undefined {
  if (value === null && nullable) return null;
  if (typeof value !== 'boolean') {
    collector.add('CONTENT_INVALID_FIELD_TYPE', path, 'Expected a boolean.');
    return undefined;
  }
  return value;
}

function stringArrayAt(
  value: unknown,
  path: string,
  collector: Collector,
  options: { readonly semanticIds?: boolean; readonly exactLength?: number } = {},
): readonly string[] | undefined {
  if (!Array.isArray(value)) {
    collector.add('CONTENT_INVALID_FIELD_TYPE', path, 'Expected an array.');
    return undefined;
  }
  if (value.length > MAX_CONTENT_ARRAY_LENGTH) {
    collector.add('CONTENT_ARRAY_TOO_LONG', path, `Array exceeds ${MAX_CONTENT_ARRAY_LENGTH} entries.`);
  }
  if (options.exactLength !== undefined && value.length !== options.exactLength) {
    collector.add('CONTENT_INVALID_FIELD_VALUE', path, `Expected exactly ${options.exactLength} entries.`);
  }
  value.forEach((entry, index) =>
    stringAt(entry, `${path}[${index}]`, collector, { semanticId: options.semanticIds }),
  );
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function validateSchemaVersion(record: UnknownRecord, path: string, collector: Collector): void {
  const value = required(record, 'schemaVersion', path, collector);
  if (typeof value !== 'number' || value !== RULESET_SCHEMA_VERSION) {
    collector.add(
      'CONTENT_SCHEMA_VERSION_UNSUPPORTED',
      `${path}.schemaVersion`,
      `Only content schema version ${RULESET_SCHEMA_VERSION} is supported.`,
    );
  }
}

function validateProvenance(value: unknown, path: string, collector: Collector): ContentProvenance | null {
  const record = objectAt(value, path, ['sourceProfile', 'evidenceLabel', 'designReason'], collector);
  if (!record) return null;
  stringAt(required(record, 'sourceProfile', path, collector), `${path}.sourceProfile`, collector, {
    allowed: ['modern_v1_7_5', 'classic_2021', 'revamped_classic'],
  });
  stringAt(required(record, 'evidenceLabel', path, collector), `${path}.evidenceLabel`, collector, {
    allowed: ['VERIFIED', 'INFERRED', 'PRODUCT_OVERRIDE'],
  });
  stringAt(required(record, 'designReason', path, collector), `${path}.designReason`, collector);
  return record as unknown as ContentProvenance;
}

function validatePresentation(value: unknown, path: string, collector: Collector): PresentationContract | null {
  const record = objectAt(value, path, ['animationId', 'audioId', 'vfxId', 'markerIds'], collector);
  if (!record) return null;
  stringAt(required(record, 'animationId', path, collector), `${path}.animationId`, collector, {
    semanticId: true,
    nullable: true,
  });
  stringAt(required(record, 'audioId', path, collector), `${path}.audioId`, collector, {
    semanticId: true,
    nullable: true,
  });
  stringAt(required(record, 'vfxId', path, collector), `${path}.vfxId`, collector, {
    semanticId: true,
    nullable: true,
  });
  stringArrayAt(required(record, 'markerIds', path, collector), `${path}.markerIds`, collector, {
    semanticIds: true,
  });
  return record as unknown as PresentationContract;
}

function validateStatus(value: unknown, path: string, collector: Collector): ContentImplementationStatus | undefined {
  return stringAt(value, path, collector, {
    allowed: ['contract_only', 'playable'],
  }) as ContentImplementationStatus | undefined;
}

function validateMovementProfileStatus(
  value: unknown,
  path: string,
  collector: Collector,
): MovementProfileImplementationStatus | undefined {
  return stringAt(value, path, collector, {
    allowed: ['contract_only', 'fixture_only', 'playable'],
  }) as MovementProfileImplementationStatus | undefined;
}

function validateNullableTick(value: unknown, path: string, collector: Collector): void {
  numberAt(value, path, collector, {
    integer: true,
    min: 0,
    max: MAX_AUTHORITY_TICKS,
    nullable: true,
  });
}

function validateNullableScalar(value: unknown, path: string, collector: Collector): void {
  numberAt(value, path, collector, { min: 0, max: MAX_SCALAR, nullable: true });
}

function validateNullableIntegerScalar(value: unknown, path: string, collector: Collector): void {
  numberAt(value, path, collector, {
    integer: true,
    min: 0,
    max: MAX_SCALAR,
    nullable: true,
  });
}

function validateWeapon(value: unknown, path: string, collector: Collector): WeaponContentV1 | null {
  const record = objectAt(
    value,
    path,
    [
      'schemaVersion', 'kind', 'id', 'displayName', 'implementationStatus', 'provenance',
      'slot', 'category', 'equipConstraints', 'timingsTicks', 'damage', 'delivery', 'ammo',
      'spread', 'movementConstraints', 'projectilePolicy', 'presentation', 'bot', 'debugNotes',
    ],
    collector,
  );
  if (!record) return null;
  validateSchemaVersion(record, path, collector);
  stringAt(required(record, 'kind', path, collector), `${path}.kind`, collector, { allowed: ['weapon'] });
  stringAt(required(record, 'id', path, collector), `${path}.id`, collector, { semanticId: true, maxLength: 64 });
  stringAt(required(record, 'displayName', path, collector), `${path}.displayName`, collector, { maxLength: 64 });
  validateStatus(required(record, 'implementationStatus', path, collector), `${path}.implementationStatus`, collector);
  validateProvenance(required(record, 'provenance', path, collector), `${path}.provenance`, collector);
  stringAt(required(record, 'slot', path, collector), `${path}.slot`, collector, {
    allowed: ['primary', 'secondary', 'melee'],
  });
  stringAt(required(record, 'category', path, collector), `${path}.category`, collector, {
    allowed: ['rifle', 'pickup', 'melee'],
  });
  stringArrayAt(required(record, 'equipConstraints', path, collector), `${path}.equipConstraints`, collector);

  const timings = objectAt(required(record, 'timingsTicks', path, collector), `${path}.timingsTicks`, ['fireCooldown', 'reload', 'ready'], collector);
  if (timings) {
    for (const key of ['fireCooldown', 'reload', 'ready'] as const) {
      validateNullableTick(required(timings, key, `${path}.timingsTicks`, collector), `${path}.timingsTicks.${key}`, collector);
    }
  }

  const damage = objectAt(required(record, 'damage', path, collector), `${path}.damage`, ['base', 'pellets', 'headMultiplier', 'limbMultiplier'], collector);
  if (damage) {
    validateNullableScalar(required(damage, 'base', `${path}.damage`, collector), `${path}.damage.base`, collector);
    numberAt(required(damage, 'pellets', `${path}.damage`, collector), `${path}.damage.pellets`, collector, { integer: true, min: 1, max: 128, nullable: true });
    validateNullableScalar(required(damage, 'headMultiplier', `${path}.damage`, collector), `${path}.damage.headMultiplier`, collector);
    validateNullableScalar(required(damage, 'limbMultiplier', `${path}.damage`, collector), `${path}.damage.limbMultiplier`, collector);
  }

  const delivery = objectAt(required(record, 'delivery', path, collector), `${path}.delivery`, ['kind', 'rangeMillimeters', 'falloffStartMillimeters', 'areaRadiusMillimeters'], collector);
  if (delivery) {
    stringAt(required(delivery, 'kind', `${path}.delivery`, collector), `${path}.delivery.kind`, collector, { allowed: ['hitscan', 'melee', 'projectile'] });
    for (const key of ['rangeMillimeters', 'falloffStartMillimeters', 'areaRadiusMillimeters'] as const) {
      validateNullableIntegerScalar(required(delivery, key, `${path}.delivery`, collector), `${path}.delivery.${key}`, collector);
    }
  }

  const ammo = objectAt(required(record, 'ammo', path, collector), `${path}.ammo`, ['magazine', 'reserve', 'autoReload', 'pickupPolicy'], collector);
  if (ammo) {
    numberAt(required(ammo, 'magazine', `${path}.ammo`, collector), `${path}.ammo.magazine`, collector, { integer: true, min: 0, max: 10_000, nullable: true });
    numberAt(required(ammo, 'reserve', `${path}.ammo`, collector), `${path}.ammo.reserve`, collector, { integer: true, min: 0, max: 100_000, nullable: true });
    booleanAt(required(ammo, 'autoReload', `${path}.ammo`, collector), `${path}.ammo.autoReload`, collector, true);
    stringAt(required(ammo, 'pickupPolicy', `${path}.ammo`, collector), `${path}.ammo.pickupPolicy`, collector, { allowed: ['spawn', 'world_pickup', 'none'] });
  }

  const spread = objectAt(required(record, 'spread', path, collector), `${path}.spread`, ['baseMilliDegrees', 'recoilPatternId'], collector);
  if (spread) {
    numberAt(required(spread, 'baseMilliDegrees', `${path}.spread`, collector), `${path}.spread.baseMilliDegrees`, collector, { integer: true, min: 0, max: 180_000, nullable: true });
    stringAt(required(spread, 'recoilPatternId', `${path}.spread`, collector), `${path}.spread.recoilPatternId`, collector, { semanticId: true, nullable: true });
  }

  stringArrayAt(required(record, 'movementConstraints', path, collector), `${path}.movementConstraints`, collector);
  const projectilePolicyValue = required(record, 'projectilePolicy', path, collector);
  if (projectilePolicyValue !== null) {
    const projectile = objectAt(projectilePolicyValue, `${path}.projectilePolicy`, ['collision', 'fuseTicks', 'speedMillimetersPerSecond', 'sticks', 'bounces', 'ownerCollision'], collector);
    if (projectile) {
      stringAt(required(projectile, 'collision', `${path}.projectilePolicy`, collector), `${path}.projectilePolicy.collision`, collector);
      validateNullableTick(required(projectile, 'fuseTicks', `${path}.projectilePolicy`, collector), `${path}.projectilePolicy.fuseTicks`, collector);
      validateNullableIntegerScalar(required(projectile, 'speedMillimetersPerSecond', `${path}.projectilePolicy`, collector), `${path}.projectilePolicy.speedMillimetersPerSecond`, collector);
      booleanAt(required(projectile, 'sticks', `${path}.projectilePolicy`, collector), `${path}.projectilePolicy.sticks`, collector, true);
      booleanAt(required(projectile, 'bounces', `${path}.projectilePolicy`, collector), `${path}.projectilePolicy.bounces`, collector, true);
      stringAt(required(projectile, 'ownerCollision', `${path}.projectilePolicy`, collector), `${path}.projectilePolicy.ownerCollision`, collector);
    }
  }

  validatePresentation(required(record, 'presentation', path, collector), `${path}.presentation`, collector);
  const bot = objectAt(required(record, 'bot', path, collector), `${path}.bot`, ['desirability', 'dangerTags'], collector);
  if (bot) {
    numberAt(required(bot, 'desirability', `${path}.bot`, collector), `${path}.bot.desirability`, collector, { min: 0, max: 1, nullable: true });
    stringArrayAt(required(bot, 'dangerTags', `${path}.bot`, collector), `${path}.bot.dangerTags`, collector);
  }
  stringArrayAt(required(record, 'debugNotes', path, collector), `${path}.debugNotes`, collector);
  return record as unknown as WeaponContentV1;
}

function validateAbility(value: unknown, path: string, collector: Collector): AbilityContentV1 | null {
  const record = objectAt(
    value,
    path,
    [
      'schemaVersion', 'kind', 'id', 'displayName', 'implementationStatus', 'provenance',
      'slot', 'category', 'equipConstraints', 'timingsTicks', 'effect', 'projectilePolicy',
      'resourcePolicy', 'movementConstraints', 'presentation', 'bot', 'debugNotes',
    ],
    collector,
  );
  if (!record) return null;
  validateSchemaVersion(record, path, collector);
  stringAt(required(record, 'kind', path, collector), `${path}.kind`, collector, { allowed: ['ability'] });
  stringAt(required(record, 'id', path, collector), `${path}.id`, collector, { semanticId: true, maxLength: 64 });
  stringAt(required(record, 'displayName', path, collector), `${path}.displayName`, collector, { maxLength: 64 });
  validateStatus(required(record, 'implementationStatus', path, collector), `${path}.implementationStatus`, collector);
  validateProvenance(required(record, 'provenance', path, collector), `${path}.provenance`, collector);
  stringAt(required(record, 'slot', path, collector), `${path}.slot`, collector, { allowed: ['damage', 'utility'] });
  stringAt(required(record, 'category', path, collector), `${path}.category`, collector, { allowed: ['teleport', 'grenade', 'deployable'] });
  stringArrayAt(required(record, 'equipConstraints', path, collector), `${path}.equipConstraints`, collector);

  const timings = objectAt(required(record, 'timingsTicks', path, collector), `${path}.timingsTicks`, ['cooldown', 'active', 'ready', 'fuse', 'arming'], collector);
  if (timings) {
    for (const key of ['cooldown', 'active', 'ready', 'fuse', 'arming'] as const) {
      validateNullableTick(required(timings, key, `${path}.timingsTicks`, collector), `${path}.timingsTicks.${key}`, collector);
    }
  }

  const effect = objectAt(required(record, 'effect', path, collector), `${path}.effect`, ['damageHealthPoints', 'areaRadiusMillimeters', 'impulseMillimetersPerSecond', 'rangeMillimeters'], collector);
  if (effect) {
    validateNullableScalar(required(effect, 'damageHealthPoints', `${path}.effect`, collector), `${path}.effect.damageHealthPoints`, collector);
    for (const key of ['areaRadiusMillimeters', 'impulseMillimetersPerSecond', 'rangeMillimeters'] as const) {
      validateNullableIntegerScalar(required(effect, key, `${path}.effect`, collector), `${path}.effect.${key}`, collector);
    }
  }

  const projectilePolicyValue = required(record, 'projectilePolicy', path, collector);
  if (projectilePolicyValue !== null) {
    const projectile = objectAt(projectilePolicyValue, `${path}.projectilePolicy`, ['collision', 'speedMillimetersPerSecond', 'sticks', 'bounces', 'ownerCollision'], collector);
    if (projectile) {
      stringAt(required(projectile, 'collision', `${path}.projectilePolicy`, collector), `${path}.projectilePolicy.collision`, collector);
      validateNullableIntegerScalar(required(projectile, 'speedMillimetersPerSecond', `${path}.projectilePolicy`, collector), `${path}.projectilePolicy.speedMillimetersPerSecond`, collector);
      booleanAt(required(projectile, 'sticks', `${path}.projectilePolicy`, collector), `${path}.projectilePolicy.sticks`, collector, true);
      booleanAt(required(projectile, 'bounces', `${path}.projectilePolicy`, collector), `${path}.projectilePolicy.bounces`, collector, true);
      stringAt(required(projectile, 'ownerCollision', `${path}.projectilePolicy`, collector), `${path}.projectilePolicy.ownerCollision`, collector);
    }
  }

  stringAt(required(record, 'resourcePolicy', path, collector), `${path}.resourcePolicy`, collector, { allowed: ['cooldown_only', 'inventory_charge'] });
  stringArrayAt(required(record, 'movementConstraints', path, collector), `${path}.movementConstraints`, collector);
  validatePresentation(required(record, 'presentation', path, collector), `${path}.presentation`, collector);
  const bot = objectAt(required(record, 'bot', path, collector), `${path}.bot`, ['desirability', 'dangerTags'], collector);
  if (bot) {
    numberAt(required(bot, 'desirability', `${path}.bot`, collector), `${path}.bot.desirability`, collector, { min: 0, max: 1, nullable: true });
    stringArrayAt(required(bot, 'dangerTags', `${path}.bot`, collector), `${path}.bot.dangerTags`, collector);
  }
  stringArrayAt(required(record, 'debugNotes', path, collector), `${path}.debugNotes`, collector);
  return record as unknown as AbilityContentV1;
}

function addDriftIssue(
  actual: unknown,
  expected: unknown,
  path: string,
  message: string,
  collector: Collector,
): void {
  if (actual !== expected) collector.add('CONTENT_INVALID_FIELD_VALUE', path, message);
}

function validateCombatProfile(
  value: unknown,
  path: string,
  weapons: readonly WeaponContentV1[],
  abilities: readonly AbilityContentV1[],
  collector: Collector,
): CombatProfileContentV1 | null {
  const record = objectAt(
    value,
    path,
    ['schemaVersion', 'implementationStatus', 'provenance', 'life', 'match', 'autoRifle', 'impulseGrenade'],
    collector,
  );
  if (!record) return null;
  validateSchemaVersion(record, path, collector);
  stringAt(
    required(record, 'implementationStatus', path, collector),
    `${path}.implementationStatus`,
    collector,
    { allowed: ['implementation_fixture'] },
  );
  validateProvenance(required(record, 'provenance', path, collector), `${path}.provenance`, collector);

  const lifePath = `${path}.life`;
  const life = objectAt(
    required(record, 'life', path, collector),
    lifePath,
    [
      'maximumHealthPoints', 'maximumShieldPoints', 'spawnProtectionTicks',
      'spawnProtectionBreaksOnOffense', 'respawnDelayTicks', 'assistWindowTicks',
      'minimumAssistHealthDamagePoints', 'friendlyFireEnabled', 'selfDamageEnabled',
      'regenerationEnabled',
    ],
    collector,
  );
  if (life) {
    const maximumHealth = numberAt(
      required(life, 'maximumHealthPoints', lifePath, collector),
      `${lifePath}.maximumHealthPoints`,
      collector,
      { integer: true, min: 1, max: 1_000_000 },
    );
    numberAt(
      required(life, 'maximumShieldPoints', lifePath, collector),
      `${lifePath}.maximumShieldPoints`,
      collector,
      { integer: true, min: 0, max: 1_000_000 },
    );
    for (const key of ['spawnProtectionTicks', 'respawnDelayTicks', 'assistWindowTicks'] as const) {
      numberAt(required(life, key, lifePath, collector), `${lifePath}.${key}`, collector, {
        integer: true,
        min: key === 'respawnDelayTicks' ? 1 : 0,
        max: MAX_AUTHORITY_TICKS,
      });
    }
    const minimumAssist = numberAt(
      required(life, 'minimumAssistHealthDamagePoints', lifePath, collector),
      `${lifePath}.minimumAssistHealthDamagePoints`,
      collector,
      { integer: true, min: 1, max: 1_000_000 },
    );
    if (
      maximumHealth != null
      && minimumAssist != null
      && minimumAssist > maximumHealth
    ) {
      collector.add(
        'CONTENT_INVALID_FIELD_VALUE',
        `${lifePath}.minimumAssistHealthDamagePoints`,
        'Minimum assist health damage cannot exceed maximum health.',
      );
    }
    for (const key of [
      'spawnProtectionBreaksOnOffense',
      'friendlyFireEnabled',
      'selfDamageEnabled',
      'regenerationEnabled',
    ] as const) {
      const parsed = booleanAt(required(life, key, lifePath, collector), `${lifePath}.${key}`, collector);
      if (key === 'regenerationEnabled' && parsed !== false) {
        collector.add(
          'CONTENT_INVALID_FIELD_VALUE',
          `${lifePath}.regenerationEnabled`,
          'The G4 implementation fixture requires regeneration to be explicitly disabled.',
        );
      }
    }
  }

  const matchPath = `${path}.match`;
  const match = objectAt(
    required(record, 'match', path, collector),
    matchPath,
    ['mode', 'warmupTicks', 'activeTicks', 'postmatchTicks', 'teamScoreLimit'],
    collector,
  );
  if (match) {
    stringAt(required(match, 'mode', matchPath, collector), `${matchPath}.mode`, collector, {
      allowed: ['team_deathmatch'],
    });
    for (const key of ['warmupTicks', 'activeTicks', 'postmatchTicks'] as const) {
      numberAt(required(match, key, matchPath, collector), `${matchPath}.${key}`, collector, {
        integer: true,
        min: 1,
        max: key === 'activeTicks' ? 10_000_000 : MAX_AUTHORITY_TICKS,
      });
    }
    numberAt(
      required(match, 'teamScoreLimit', matchPath, collector),
      `${matchPath}.teamScoreLimit`,
      collector,
      { integer: true, min: 1, max: 10_000 },
    );
  }

  const riflePath = `${path}.autoRifle`;
  const rifle = objectAt(
    required(record, 'autoRifle', path, collector),
    riflePath,
    [
      'weaponId', 'baseDamagePoints', 'pelletsPerShot', 'headMultiplierPermille',
      'limbMultiplierPermille', 'rangeMillimeters', 'magazineCapacity', 'reserveCapacity',
      'fireCooldownTicks', 'reloadTicks', 'readyTicks', 'autoReloadEnabled',
      'reloadTransferPolicy', 'reloadInterruptionPolicy', 'sprintFirePolicy',
      'baseSpreadMilliDegrees', 'maximumSpreadMilliDegrees', 'recoilPatternId',
    ],
    collector,
  );
  if (rifle) {
    const weaponId = stringAt(
      required(rifle, 'weaponId', riflePath, collector),
      `${riflePath}.weaponId`,
      collector,
      { semanticId: true },
    );
    for (const key of ['baseDamagePoints', 'rangeMillimeters', 'magazineCapacity', 'reserveCapacity'] as const) {
      numberAt(required(rifle, key, riflePath, collector), `${riflePath}.${key}`, collector, {
        integer: true,
        min: key === 'baseDamagePoints' ? 1 : 0,
        max: MAX_SCALAR,
      });
    }
    numberAt(required(rifle, 'pelletsPerShot', riflePath, collector), `${riflePath}.pelletsPerShot`, collector, {
      integer: true,
      min: 1,
      max: 128,
    });
    for (const key of ['headMultiplierPermille', 'limbMultiplierPermille'] as const) {
      numberAt(required(rifle, key, riflePath, collector), `${riflePath}.${key}`, collector, {
        integer: true,
        min: 0,
        max: 10_000,
      });
    }
    for (const key of ['fireCooldownTicks', 'reloadTicks', 'readyTicks'] as const) {
      numberAt(required(rifle, key, riflePath, collector), `${riflePath}.${key}`, collector, {
        integer: true,
        min: key === 'readyTicks' ? 0 : 1,
        max: MAX_AUTHORITY_TICKS,
      });
    }
    booleanAt(required(rifle, 'autoReloadEnabled', riflePath, collector), `${riflePath}.autoReloadEnabled`, collector);
    stringAt(required(rifle, 'reloadTransferPolicy', riflePath, collector), `${riflePath}.reloadTransferPolicy`, collector, {
      allowed: ['completion_tick_once'],
    });
    stringAt(required(rifle, 'reloadInterruptionPolicy', riflePath, collector), `${riflePath}.reloadInterruptionPolicy`, collector, {
      allowed: ['fire_or_sprint_before_transfer_death_always'],
    });
    stringAt(required(rifle, 'sprintFirePolicy', riflePath, collector), `${riflePath}.sprintFirePolicy`, collector, {
      allowed: ['blocked_ready_delay'],
    });
    const baseSpread = numberAt(
      required(rifle, 'baseSpreadMilliDegrees', riflePath, collector),
      `${riflePath}.baseSpreadMilliDegrees`,
      collector,
      { integer: true, min: 0, max: 180_000 },
    );
    const maximumSpread = numberAt(
      required(rifle, 'maximumSpreadMilliDegrees', riflePath, collector),
      `${riflePath}.maximumSpreadMilliDegrees`,
      collector,
      { integer: true, min: 0, max: 180_000 },
    );
    if (
      baseSpread != null
      && maximumSpread != null
      && baseSpread > maximumSpread
    ) {
      collector.add(
        'CONTENT_INVALID_FIELD_VALUE',
        `${riflePath}.baseSpreadMilliDegrees`,
        'Base spread cannot exceed maximum spread.',
      );
    }
    stringAt(required(rifle, 'recoilPatternId', riflePath, collector), `${riflePath}.recoilPatternId`, collector, {
      semanticId: true,
    });

    const weapon = weapons.find((candidate) => candidate.id === weaponId);
    if (!weapon) {
      collector.add('CONTENT_REFERENCE_MISSING', `${riflePath}.weaponId`, 'Combat profile Auto Rifle is missing.');
    } else {
      const checks: readonly [unknown, unknown, string, string][] = [
        [weapon.damage.base, rifle.baseDamagePoints, `${riflePath}.baseDamagePoints`, 'Auto Rifle damage drifted from its weapon record.'],
        [weapon.damage.pellets, rifle.pelletsPerShot, `${riflePath}.pelletsPerShot`, 'Auto Rifle pellets drifted from its weapon record.'],
        [weapon.damage.headMultiplier, typeof rifle.headMultiplierPermille === 'number' ? rifle.headMultiplierPermille / 1_000 : undefined, `${riflePath}.headMultiplierPermille`, 'Auto Rifle head multiplier drifted from its weapon record.'],
        [weapon.damage.limbMultiplier, typeof rifle.limbMultiplierPermille === 'number' ? rifle.limbMultiplierPermille / 1_000 : undefined, `${riflePath}.limbMultiplierPermille`, 'Auto Rifle limb multiplier drifted from its weapon record.'],
        [weapon.delivery.rangeMillimeters, rifle.rangeMillimeters, `${riflePath}.rangeMillimeters`, 'Auto Rifle range drifted from its weapon record.'],
        [weapon.ammo.magazine, rifle.magazineCapacity, `${riflePath}.magazineCapacity`, 'Auto Rifle magazine drifted from its weapon record.'],
        [weapon.ammo.reserve, rifle.reserveCapacity, `${riflePath}.reserveCapacity`, 'Auto Rifle reserve drifted from its weapon record.'],
        [weapon.timingsTicks.fireCooldown, rifle.fireCooldownTicks, `${riflePath}.fireCooldownTicks`, 'Auto Rifle cadence drifted from its weapon record.'],
        [weapon.timingsTicks.reload, rifle.reloadTicks, `${riflePath}.reloadTicks`, 'Auto Rifle reload drifted from its weapon record.'],
        [weapon.timingsTicks.ready, rifle.readyTicks, `${riflePath}.readyTicks`, 'Auto Rifle ready time drifted from its weapon record.'],
        [weapon.ammo.autoReload, rifle.autoReloadEnabled, `${riflePath}.autoReloadEnabled`, 'Auto Rifle auto-reload drifted from its weapon record.'],
        [weapon.spread.baseMilliDegrees, rifle.baseSpreadMilliDegrees, `${riflePath}.baseSpreadMilliDegrees`, 'Auto Rifle base spread drifted from its weapon record.'],
        [weapon.spread.recoilPatternId, rifle.recoilPatternId, `${riflePath}.recoilPatternId`, 'Auto Rifle recoil pattern drifted from its weapon record.'],
      ];
      for (const [actual, expected, issuePath, message] of checks) {
        addDriftIssue(actual, expected, issuePath, message, collector);
      }
    }
  }

  const grenadePath = `${path}.impulseGrenade`;
  const grenade = objectAt(
    required(record, 'impulseGrenade', path, collector),
    grenadePath,
    [
      'abilityId', 'damageHealthPoints', 'areaRadiusMillimeters',
      'projectileSpeedMillimetersPerSecond', 'readyTicks', 'cooldownTicks', 'fuseTicks',
      'fuseStarts', 'lifetimeTicks', 'projectileRadiusMillimeters', 'maximumBounces',
      'restitutionPermille', 'frictionPermille', 'ownerImmunityTicks',
      'ownerCollisionPolicy', 'radialFalloff', 'selfImpulseMillimetersPerSecond',
      'enemyImpulseMillimetersPerSecond', 'verticalImpulseCapMillimetersPerSecond',
      'maximumActivePerPlayer',
    ],
    collector,
  );
  if (grenade) {
    const abilityId = stringAt(
      required(grenade, 'abilityId', grenadePath, collector),
      `${grenadePath}.abilityId`,
      collector,
      { semanticId: true },
    );
    const damage = numberAt(
      required(grenade, 'damageHealthPoints', grenadePath, collector),
      `${grenadePath}.damageHealthPoints`,
      collector,
      { integer: true, min: 0, max: MAX_SCALAR },
    );
    if (damage !== 0) {
      collector.add(
        'CONTENT_INVALID_FIELD_VALUE',
        `${grenadePath}.damageHealthPoints`,
        'The Impulse Grenade implementation fixture has zero damage.',
      );
    }
    for (const key of [
      'areaRadiusMillimeters', 'projectileSpeedMillimetersPerSecond',
      'projectileRadiusMillimeters', 'selfImpulseMillimetersPerSecond',
      'enemyImpulseMillimetersPerSecond', 'verticalImpulseCapMillimetersPerSecond',
    ] as const) {
      numberAt(required(grenade, key, grenadePath, collector), `${grenadePath}.${key}`, collector, {
        integer: true,
        min: 1,
        max: MAX_SCALAR,
      });
    }
    for (const key of [
      'readyTicks', 'cooldownTicks', 'fuseTicks', 'lifetimeTicks', 'maximumBounces',
      'ownerImmunityTicks', 'maximumActivePerPlayer',
    ] as const) {
      numberAt(required(grenade, key, grenadePath, collector), `${grenadePath}.${key}`, collector, {
        integer: true,
        min: key === 'readyTicks' || key === 'ownerImmunityTicks' || key === 'maximumBounces' ? 0 : 1,
        max: MAX_AUTHORITY_TICKS,
      });
    }
    for (const key of ['restitutionPermille', 'frictionPermille'] as const) {
      numberAt(required(grenade, key, grenadePath, collector), `${grenadePath}.${key}`, collector, {
        integer: true,
        min: 0,
        max: 1_000,
      });
    }
    stringAt(required(grenade, 'fuseStarts', grenadePath, collector), `${grenadePath}.fuseStarts`, collector, {
      allowed: ['first_qualifying_collision'],
    });
    stringAt(required(grenade, 'ownerCollisionPolicy', grenadePath, collector), `${grenadePath}.ownerCollisionPolicy`, collector, {
      allowed: ['ignored_then_normal'],
    });
    stringAt(required(grenade, 'radialFalloff', grenadePath, collector), `${grenadePath}.radialFalloff`, collector, {
      allowed: ['linear_to_zero'],
    });

    const ability = abilities.find((candidate) => candidate.id === abilityId);
    if (!ability) {
      collector.add('CONTENT_REFERENCE_MISSING', `${grenadePath}.abilityId`, 'Combat profile Impulse Grenade is missing.');
    } else {
      const checks: readonly [unknown, unknown, string, string][] = [
        [ability.effect.damageHealthPoints, grenade.damageHealthPoints, `${grenadePath}.damageHealthPoints`, 'Impulse damage drifted from its ability record.'],
        [ability.effect.areaRadiusMillimeters, grenade.areaRadiusMillimeters, `${grenadePath}.areaRadiusMillimeters`, 'Impulse radius drifted from its ability record.'],
        [ability.effect.impulseMillimetersPerSecond, grenade.selfImpulseMillimetersPerSecond, `${grenadePath}.selfImpulseMillimetersPerSecond`, 'Impulse strength drifted from its ability record.'],
        [ability.projectilePolicy?.speedMillimetersPerSecond, grenade.projectileSpeedMillimetersPerSecond, `${grenadePath}.projectileSpeedMillimetersPerSecond`, 'Impulse speed drifted from its ability record.'],
        [ability.timingsTicks.ready, grenade.readyTicks, `${grenadePath}.readyTicks`, 'Impulse ready time drifted from its ability record.'],
        [ability.timingsTicks.cooldown, grenade.cooldownTicks, `${grenadePath}.cooldownTicks`, 'Impulse cooldown drifted from its ability record.'],
        [ability.timingsTicks.fuse, grenade.fuseTicks, `${grenadePath}.fuseTicks`, 'Impulse fuse drifted from its ability record.'],
        [ability.timingsTicks.active, grenade.lifetimeTicks, `${grenadePath}.lifetimeTicks`, 'Impulse lifetime drifted from its ability record.'],
        [ability.projectilePolicy?.bounces, typeof grenade.maximumBounces === 'number' ? grenade.maximumBounces > 0 : undefined, `${grenadePath}.maximumBounces`, 'Impulse bounce policy drifted from its ability record.'],
      ];
      for (const [actual, expected, issuePath, message] of checks) {
        addDriftIssue(actual, expected, issuePath, message, collector);
      }
    }
  }

  return record as unknown as CombatProfileContentV1;
}

function validateSlot(
  value: unknown,
  path: string,
  collector: Collector,
  acquisition: 'spawn' | 'pickup_optional',
): void {
  const record = objectAt(value, path, ['capacity', 'acquisition'], collector);
  if (!record) return;
  const capacity = numberAt(required(record, 'capacity', path, collector), `${path}.capacity`, collector, { integer: true, min: 1, max: 1 });
  const acquisitionValue = stringAt(required(record, 'acquisition', path, collector), `${path}.acquisition`, collector, { allowed: [acquisition] });
  if (capacity !== 1 || acquisitionValue !== acquisition) {
    collector.add('CONTENT_LOADOUT_INVALID', path, 'Weapon slot does not match the revamped_classic contract.');
  }
}

function validateLoadout(value: unknown, path: string, collector: Collector): void {
  const record = objectAt(value, path, ['weaponSlots', 'abilitySlots', 'ammoAbility'], collector);
  if (!record) return;
  const weaponSlots = objectAt(required(record, 'weaponSlots', path, collector), `${path}.weaponSlots`, ['primary', 'secondary', 'melee'], collector);
  if (weaponSlots) {
    validateSlot(required(weaponSlots, 'primary', `${path}.weaponSlots`, collector), `${path}.weaponSlots.primary`, collector, 'spawn');
    validateSlot(required(weaponSlots, 'secondary', `${path}.weaponSlots`, collector), `${path}.weaponSlots.secondary`, collector, 'pickup_optional');
    validateSlot(required(weaponSlots, 'melee', `${path}.weaponSlots`, collector), `${path}.weaponSlots.melee`, collector, 'spawn');
  }
  const abilities = objectAt(required(record, 'abilitySlots', path, collector), `${path}.abilitySlots`, ['damage', 'utility'], collector);
  if (abilities) {
    const damage = numberAt(required(abilities, 'damage', `${path}.abilitySlots`, collector), `${path}.abilitySlots.damage`, collector, { integer: true, min: 0, max: 8 });
    const utility = numberAt(required(abilities, 'utility', `${path}.abilitySlots`, collector), `${path}.abilitySlots.utility`, collector, { integer: true, min: 0, max: 8 });
    if (damage !== 2 || utility !== 1) {
      collector.add('CONTENT_LOADOUT_INVALID', `${path}.abilitySlots`, 'Revamped Classic requires two damage slots and one utility slot.');
    }
  }
  const ammo = objectAt(required(record, 'ammoAbility', path, collector), `${path}.ammoAbility`, ['enabledByDefault'], collector);
  if (ammo) {
    const enabled = booleanAt(required(ammo, 'enabledByDefault', `${path}.ammoAbility`, collector), `${path}.ammoAbility.enabledByDefault`, collector);
    if (enabled !== false) {
      collector.add('CONTENT_AMMO_DEFAULT_INVALID', `${path}.ammoAbility.enabledByDefault`, 'Ammo ability must remain off by default.');
    }
  }
}

function findDuplicateIds(records: readonly { readonly id: string }[], path: string, collector: Collector): void {
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.id)) {
      collector.add('CONTENT_DUPLICATE_ID', path, `Duplicate semantic ID: ${record.id}`);
    }
    seen.add(record.id);
  }
}

function validateVerticalSlice(
  value: unknown,
  path: string,
  weapons: readonly WeaponContentV1[],
  abilities: readonly AbilityContentV1[],
  collector: Collector,
): void {
  const record = objectAt(value, path, ['primaryWeaponId', 'meleeWeaponId', 'damageAbilityIds', 'utilityAbilityId'], collector);
  if (!record) return;
  const primaryId = stringAt(required(record, 'primaryWeaponId', path, collector), `${path}.primaryWeaponId`, collector, { semanticId: true });
  const meleeId = stringAt(required(record, 'meleeWeaponId', path, collector), `${path}.meleeWeaponId`, collector, { semanticId: true });
  const damageIds = stringArrayAt(required(record, 'damageAbilityIds', path, collector), `${path}.damageAbilityIds`, collector, { semanticIds: true, exactLength: 2 });
  const utilityId = stringAt(required(record, 'utilityAbilityId', path, collector), `${path}.utilityAbilityId`, collector, { semanticId: true });

  const primary = weapons.find((weapon) => weapon.id === primaryId);
  const melee = weapons.find((weapon) => weapon.id === meleeId);
  const damageAbilities = damageIds?.map((id) => abilities.find((ability) => ability.id === id));
  const utility = abilities.find((ability) => ability.id === utilityId);

  if (!primary || primary.slot !== 'primary' || primary.category !== 'rifle') {
    collector.add('CONTENT_REFERENCE_MISSING', `${path}.primaryWeaponId`, 'Vertical slice must reference one primary rifle.');
  }
  if (!melee || melee.slot !== 'melee' || melee.category !== 'melee') {
    collector.add('CONTENT_REFERENCE_MISSING', `${path}.meleeWeaponId`, 'Vertical slice must reference one melee fallback.');
  }
  if (!damageAbilities || damageAbilities.length !== 2 || damageAbilities.some((ability) => !ability || ability.slot !== 'damage')) {
    collector.add('CONTENT_REFERENCE_MISSING', `${path}.damageAbilityIds`, 'Vertical slice must reference two damage abilities.');
  } else {
    const categories = new Set(damageAbilities.map((ability) => ability?.category));
    if (!categories.has('grenade') || !categories.has('deployable')) {
      collector.add('CONTENT_VERTICAL_SLICE_MISSING', `${path}.damageAbilityIds`, 'Vertical slice must include one grenade and one deployable.');
    }
  }
  if (!utility || utility.slot !== 'utility' || utility.category !== 'teleport') {
    collector.add('CONTENT_VERTICAL_SLICE_MISSING', `${path}.utilityAbilityId`, 'Vertical slice must include teleport in the utility slot.');
  }
}

export function validateRulesetContent(input: unknown): ContentValidationResult<RulesetContentV1> {
  if (typeof input !== 'object' || input === null) {
    return {
      ok: false,
      issues: [{ code: 'CONTENT_ROOT_NOT_OBJECT', path: '$', message: 'Ruleset content must be an object.' }],
    };
  }

  let snapshot: unknown;
  try {
    snapshot = snapshotContentValue(input, '$', new Set(), 0);
  } catch (error) {
    const issue = error instanceof ContentSnapshotAbort
      ? error.issue
      : {
          code: 'CONTENT_INVALID_FIELD_VALUE' as const,
          path: '$',
          message: 'Content value could not be inspected safely.',
        };
    return { ok: false, issues: [issue] };
  }
  if (!isRecord(snapshot)) {
    return {
      ok: false,
      issues: [{ code: 'CONTENT_ROOT_NOT_OBJECT', path: '$', message: 'Ruleset content must be an object.' }],
    };
  }

  const collector = new Collector();
  const root = objectAt(
    snapshot,
    '$',
    [
      'schemaVersion', 'kind', 'id', 'revision', 'displayName', 'implementationStatus',
      'provenance', 'tickRateHz', 'loadout', 'movementProfile', 'verticalSlice', 'weapons',
      'abilities', 'combatProfile',
    ],
    collector,
  );
  if (!root) {
    return { ok: false, issues: collector.issues };
  }

  validateSchemaVersion(root, '$', collector);
  stringAt(required(root, 'kind', '$', collector), '$.kind', collector, { allowed: ['ruleset'] });
  stringAt(required(root, 'id', '$', collector), '$.id', collector, { semanticId: true, maxLength: 64 });
  const revision = numberAt(required(root, 'revision', '$', collector), '$.revision', collector, { integer: true, min: 1, max: 65_535 });
  stringAt(required(root, 'displayName', '$', collector), '$.displayName', collector, { maxLength: 64 });
  validateStatus(required(root, 'implementationStatus', '$', collector), '$.implementationStatus', collector);
  validateProvenance(required(root, 'provenance', '$', collector), '$.provenance', collector);
  const tickRate = numberAt(required(root, 'tickRateHz', '$', collector), '$.tickRateHz', collector, { integer: true, min: 1, max: 240 });
  if (tickRate !== 20) {
    collector.add('CONTENT_INVALID_FIELD_VALUE', '$.tickRateHz', 'Ruleset content schema v1 authority runs at 20 Hz.');
  }
  validateLoadout(required(root, 'loadout', '$', collector), '$.loadout', collector);

  const movement = objectAt(required(root, 'movementProfile', '$', collector), '$.movementProfile', ['id', 'revision', 'implementationStatus'], collector);
  if (movement) {
    stringAt(required(movement, 'id', '$.movementProfile', collector), '$.movementProfile.id', collector, { semanticId: true });
    numberAt(required(movement, 'revision', '$.movementProfile', collector), '$.movementProfile.revision', collector, { integer: true, min: 1, max: 65_535 });
    validateMovementProfileStatus(
      required(movement, 'implementationStatus', '$.movementProfile', collector),
      '$.movementProfile.implementationStatus',
      collector,
    );
  }

  const weaponsValue = required(root, 'weapons', '$', collector);
  const weapons: WeaponContentV1[] = [];
  if (!Array.isArray(weaponsValue)) {
    collector.add('CONTENT_INVALID_FIELD_TYPE', '$.weapons', 'Expected an array.');
  } else {
    if (weaponsValue.length === 0 || weaponsValue.length > MAX_RECORDS_PER_KIND) {
      collector.add(weaponsValue.length > MAX_RECORDS_PER_KIND ? 'CONTENT_ARRAY_TOO_LONG' : 'CONTENT_INVALID_FIELD_VALUE', '$.weapons', 'Weapons array must contain 1 to 64 records.');
    }
    weaponsValue.forEach((weapon, index) => {
      const parsed = validateWeapon(weapon, `$.weapons[${index}]`, collector);
      if (parsed) weapons.push(parsed);
    });
  }

  const abilitiesValue = required(root, 'abilities', '$', collector);
  const abilities: AbilityContentV1[] = [];
  if (!Array.isArray(abilitiesValue)) {
    collector.add('CONTENT_INVALID_FIELD_TYPE', '$.abilities', 'Expected an array.');
  } else {
    if (abilitiesValue.length === 0 || abilitiesValue.length > MAX_RECORDS_PER_KIND) {
      collector.add(abilitiesValue.length > MAX_RECORDS_PER_KIND ? 'CONTENT_ARRAY_TOO_LONG' : 'CONTENT_INVALID_FIELD_VALUE', '$.abilities', 'Abilities array must contain 1 to 64 records.');
    }
    abilitiesValue.forEach((ability, index) => {
      const parsed = validateAbility(ability, `$.abilities[${index}]`, collector);
      if (parsed) abilities.push(parsed);
    });
  }

  findDuplicateIds([...weapons, ...abilities], '$', collector);
  validateVerticalSlice(required(root, 'verticalSlice', '$', collector), '$.verticalSlice', weapons, abilities, collector);
  if (Object.hasOwn(root, 'combatProfile')) {
    if (revision != null && revision < 3) {
      collector.add(
        'CONTENT_INVALID_FIELD_VALUE',
        '$.combatProfile',
        'Combat profiles require ruleset revision 3 or newer.',
      );
    }
    validateCombatProfile(root.combatProfile, '$.combatProfile', weapons, abilities, collector);
  } else if (revision != null && revision >= 3) {
    collector.add(
      'CONTENT_REQUIRED_FIELD',
      '$.combatProfile',
      'Ruleset revision 3 or newer requires an explicit combat profile.',
    );
  }

  return collector.issues.length > 0
    ? { ok: false, issues: collector.issues }
    : { ok: true, value: deepFreeze(root as unknown as RulesetContentV1) };
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

export function parseRulesetJson(json: string): ContentValidationResult<RulesetContentV1> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    return {
      ok: false,
      issues: [{ code: 'CONTENT_JSON_INVALID', path: '$', message: 'Ruleset JSON could not be parsed.' }],
    };
  }
  return validateRulesetContent(parsed);
}
