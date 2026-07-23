import { describe, expect, it } from 'vitest';

import {
  hashPhysicsFixture,
  loadPhysicsFixture,
  validatePhysicsFixture,
} from '../../../src/physics/fixtureSchema';
import { CONTACT_LAB_FIXTURE_SOURCE } from '../../../src/physics/fixtures/contactLab';
import { FLAT_RUN_FIXTURE_SOURCE } from '../../../src/physics/fixtures/flatRun';

type DeepMutable<T> = T extends readonly (infer Item)[]
  ? DeepMutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
    : T;

function mutableClone<T>(value: T): DeepMutable<T> {
  return structuredClone(value) as DeepMutable<T>;
}

function issueCodes(input: unknown): string[] {
  const result = validatePhysicsFixture(input);
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe('physics fixture schema', () => {
  it('returns a detached, recursively frozen fixture and stable hash', () => {
    const source = mutableClone(FLAT_RUN_FIXTURE_SOURCE);
    const result = validatePhysicsFixture(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    source.spawn.feetPositionMm.x = 99;
    expect(result.value.spawn.feetPositionMm.x).toBe(0);
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.solids[0].shape)).toBe(true);
    expect(result.hash).toMatch(/^[a-f0-9]{16}$/u);
    expect(hashPhysicsFixture(result.value)).toBe(result.hash);
  });

  it('canonicalizes collider ordering before hashing', () => {
    const source = mutableClone(CONTACT_LAB_FIXTURE_SOURCE);
    const forward = loadPhysicsFixture(source);
    source.solids.reverse();
    source.volumes.reverse();
    const reversed = loadPhysicsFixture(source);
    expect(hashPhysicsFixture(reversed)).toBe(hashPhysicsFixture(forward));
    expect(reversed.solids.map((solid) => solid.id)).toEqual(
      [...reversed.solids.map((solid) => solid.id)].sort(),
    );
  });

  it('rejects unknown fields', () => {
    const source = { ...mutableClone(FLAT_RUN_FIXTURE_SOURCE), surprise: true };
    expect(issueCodes(source)).toContain('PHYSICS_FIXTURE_UNKNOWN_FIELD');
  });

  it('rejects fractional geometry', () => {
    const source = mutableClone(FLAT_RUN_FIXTURE_SOURCE);
    source.solids[0].centerMm.x = 0.5;
    expect(issueCodes(source)).toContain('PHYSICS_FIXTURE_INVALID_TYPE');
  });

  it('rejects duplicate solid and volume IDs', () => {
    const source = mutableClone(FLAT_RUN_FIXTURE_SOURCE);
    source.volumes[0].id = source.solids[0].id;
    expect(issueCodes(source)).toContain('PHYSICS_FIXTURE_DUPLICATE_ID');
  });

  it('rejects mismatched volume kind and layer', () => {
    const source = mutableClone(FLAT_RUN_FIXTURE_SOURCE);
    source.volumes[0].layer = 'recovery_volume';
    expect(issueCodes(source)).toContain('PHYSICS_FIXTURE_INVALID_VALUE');
  });

  it('rejects invalid capsule dimensions', () => {
    const source = mutableClone(CONTACT_LAB_FIXTURE_SOURCE);
    source.solids[0].shape = { type: 'capsule', heightMm: 500, radiusMm: 300 };
    expect(issueCodes(source)).toContain('PHYSICS_FIXTURE_INVALID_VALUE');
  });

  it('rejects an unsupported unit scale', () => {
    const source = { ...mutableClone(FLAT_RUN_FIXTURE_SOURCE), millimetersPerRapierUnit: 1 };
    expect(issueCodes(source)).toContain('PHYSICS_FIXTURE_INVALID_VALUE');
  });

  it('rejects accessors without invoking them', () => {
    const source = mutableClone(FLAT_RUN_FIXTURE_SOURCE);
    let calls = 0;
    Object.defineProperty(source.spawn, 'yawMilliDegrees', {
      enumerable: true,
      get() {
        calls += 1;
        return 0;
      },
    });
    expect(issueCodes(source)).toEqual(['PHYSICS_FIXTURE_INVALID_DATA']);
    expect(calls).toBe(0);
  });

  it('rejects cycles and sparse arrays', () => {
    const cyclic = mutableClone(FLAT_RUN_FIXTURE_SOURCE) as DeepMutable<
      typeof FLAT_RUN_FIXTURE_SOURCE
    > & { self?: unknown };
    cyclic.self = cyclic;
    expect(issueCodes(cyclic)).toEqual(['PHYSICS_FIXTURE_INVALID_DATA']);

    const sparse = mutableClone(FLAT_RUN_FIXTURE_SOURCE);
    delete sparse.solids[0];
    expect(issueCodes(sparse)).toEqual(['PHYSICS_FIXTURE_INVALID_DATA']);
  });

  it('keeps the production-map collider allowance bounded', () => {
    const source = mutableClone(FLAT_RUN_FIXTURE_SOURCE);
    const template = source.solids[0];
    source.solids = Array.from({ length: 1_025 }, (_, index) => ({
      ...structuredClone(template),
      id: `bounded_map_solid_${index}`,
    }));
    expect(issueCodes(source)).toContain('PHYSICS_FIXTURE_LIMIT_EXCEEDED');
  });
});
