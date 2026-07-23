const ARRAY_INDEX = /^(?:0|[1-9][0-9]*)$/u;

function assertDataDescriptor(
  descriptor: PropertyDescriptor,
  label: string,
): asserts descriptor is PropertyDescriptor & { value: unknown } {
  if (!Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
    throw new TypeError(`${label} must not contain accessors`);
  }
}

/**
 * Rejects accessors, cycles, sparse arrays, exotic prototypes, symbol keys,
 * functions, and repeated object aliases before a combat validator reads any
 * untrusted field. The accepted tree is still cloned by the owning module.
 */
export function assertStrictCombatDataTree(value: unknown, label: string): void {
  const seen = new WeakSet<object>();

  const visit = (candidate: unknown, path: string): void => {
    if (
      candidate === null
      || typeof candidate === 'string'
      || typeof candidate === 'number'
      || typeof candidate === 'boolean'
    ) {
      return;
    }
    if (typeof candidate !== 'object') {
      throw new TypeError(`${path} contains an unsupported value type`);
    }
    if (seen.has(candidate)) {
      throw new TypeError(`${path} contains a cycle or repeated object reference`);
    }
    seen.add(candidate);

    if (Object.getOwnPropertySymbols(candidate).length !== 0) {
      throw new TypeError(`${path} must not contain symbol fields`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(candidate);

    if (Array.isArray(candidate)) {
      const keys = Object.keys(descriptors).filter((key) => key !== 'length');
      if (
        keys.length !== candidate.length
        || keys.some((key) => !ARRAY_INDEX.test(key) || Number(key) >= candidate.length)
      ) {
        throw new TypeError(`${path} must be a dense array without custom fields`);
      }
      for (let index = 0; index < candidate.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (descriptor === undefined) {
          throw new TypeError(`${path} must be a dense array without holes`);
        }
        assertDataDescriptor(descriptor, `${path}[${index}]`);
        visit(descriptor.value, `${path}[${index}]`);
      }
      return;
    }

    const prototype = Object.getPrototypeOf(candidate);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only plain records and arrays`);
    }
    for (const [key, descriptor] of Object.entries(descriptors)) {
      assertDataDescriptor(descriptor, `${path}.${key}`);
      visit(descriptor.value, `${path}.${key}`);
    }
  };

  visit(value, label);
}

export function strictRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a record`);
  }
  const keys = Object.getOwnPropertyNames(value).sort();
  const wanted = [...expectedKeys].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} contains unsupported or missing fields`);
  }
  return value as Record<string, unknown>;
}

export function strictArray(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
  label: string,
): readonly unknown[] {
  if (!Array.isArray(value) || value.length < minimumLength || value.length > maximumLength) {
    throw new RangeError(
      `${label} must contain ${minimumLength} through ${maximumLength} entries`,
    );
  }
  return value;
}

export function strictInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

export function strictFiniteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be a finite number from ${minimum} through ${maximum}`);
  }
  return value;
}

export function strictStableId(value: unknown, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || new TextEncoder().encode(value).byteLength > 96
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(value)
  ) {
    throw new RangeError(`${label} must be a bounded stable identifier`);
  }
  return value;
}

export function strictNullableStableId(value: unknown, label: string): string | null {
  return value === null ? null : strictStableId(value, label);
}

export function strictLiteral<T>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new RangeError(`${label} must equal ${String(expected)}`);
  return expected;
}

export function deepFreezeCombatValue<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreezeCombatValue(nested);
  return Object.freeze(value);
}
