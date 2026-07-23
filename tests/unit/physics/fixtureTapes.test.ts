import { describe, expect, it } from 'vitest';

import {
  PHYSICS_FIXTURE_IDS,
  PHYSICS_FIXTURE_TAPE_IDS,
  getPhysicsFixtureTape,
  listPhysicsFixtureTapes,
  listPhysicsFixtureTapesForFixture,
  loadPhysicsFixtureTape,
  preparePhysicsFixtureTape,
  type PhysicsFixtureTapeId,
} from '../../../src/physics';
import { RECORDED_PHYSICS_FIXTURE_TAPE_RESULTS } from '../../../src/physics/fixtures/recordedTapeResults';

function expectRecursivelyFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) expectRecursivelyFrozen(descriptor.value, seen);
  }
}

interface MutableTapeSource {
  [key: string]: unknown;
  readonly start: { readonly feetPosition: { x: number } };
  readonly frames: Array<{ readonly commands: Array<{ moveZ: number }> }>;
  readonly expected: {
    finalHash: string;
    readonly stateHashes: string[];
    readonly samples: Array<{ readonly feetPosition: { x: number } }>;
  };
  readonly identity: Record<string, unknown>;
}

function mutableTape(id: PhysicsFixtureTapeId = 'flat_run_fixed_20hz_v1'): MutableTapeSource {
  return structuredClone(getPhysicsFixtureTape(id)) as unknown as MutableTapeSource;
}

describe('versioned canonical physics fixture tapes', () => {
  it('publishes every tape once and covers every fixture', () => {
    const tapes = listPhysicsFixtureTapes();
    expect(tapes.map((tape) => tape.id)).toEqual(PHYSICS_FIXTURE_TAPE_IDS);
    expect(new Set(tapes.map((tape) => tape.id)).size).toBe(tapes.length);
    for (const fixtureId of PHYSICS_FIXTURE_IDS) {
      const fixtureTapes = listPhysicsFixtureTapesForFixture(fixtureId);
      expect(fixtureTapes.length).toBeGreaterThanOrEqual(1);
      expect(fixtureTapes.every((tape) => tape.identity.fixtureId === fixtureId)).toBe(true);
    }
  });

  it('pins complete literal traces and explicit deferred weapon recovery', () => {
    for (const tape of listPhysicsFixtureTapes()) {
      expect(tape.expected.finalHash).toMatch(/^[0-9a-f]{16}$/u);
      expect(tape.expected.finalHash).not.toMatch(/^0+$/u);
      expect(tape.expected.stateHashes).toHaveLength(tape.frames.length + 1);
      expect(tape.expected.samples).toHaveLength(tape.frames.length + 1);
      expect(tape.expected.samples.map((sample) => sample.stateHash)).toEqual(
        tape.expected.stateHashes,
      );
      expect(tape.expected.envelope.tickCount).toBe(tape.frames.length);
      expect(tape.expected.envelope).not.toHaveProperty('samples');
      expect(tape.expected.measurements.weaponReadyRecoveryMilliseconds).toEqual({
        status: 'not_measured',
        value: null,
        reason: 'weapon_ready_recovery_out_of_scope',
      });
      expectRecursivelyFrozen(tape);
    }
  });

  it('recursively freezes the internal literal source and prepared state graph', () => {
    expectRecursivelyFrozen(RECORDED_PHYSICS_FIXTURE_TAPE_RESULTS);
    const prepared = preparePhysicsFixtureTape('flat_run_fixed_20hz_v1');
    expectRecursivelyFrozen(prepared);
    expectRecursivelyFrozen(prepared.initialState);
    expectRecursivelyFrozen(prepared.replay);
  });

  it('loads a detached immutable snapshot', () => {
    const source = mutableTape();
    const loaded = loadPhysicsFixtureTape(source);
    source.start.feetPosition.x = 99_999;
    source.frames[0].commands[0].moveZ = 0;
    source.expected.samples[0].feetPosition.x = 99_999;

    expect(loaded.start.feetPosition.x).toBe(0);
    expect(loaded.frames[0]?.commands[0]?.moveZ).toBe(127);
    expect(loaded.expected.samples[0]?.feetPosition.x).toBe(0);
    expectRecursivelyFrozen(loaded);
  });

  it('rejects unknown fields, accessors, sparse arrays, and identity drift', () => {
    const unknown = mutableTape();
    unknown.unexpected = true;
    expect(() => loadPhysicsFixtureTape(unknown)).toThrow(/unsupported field/u);

    let getterCalls = 0;
    const accessor = mutableTape();
    Object.defineProperty(accessor, 'id', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'flat_run_fixed_20hz_v1';
      },
    });
    expect(() => loadPhysicsFixtureTape(accessor)).toThrow(/data property/u);
    expect(getterCalls).toBe(0);

    const sparse = mutableTape();
    delete sparse.frames[0];
    expect(() => loadPhysicsFixtureTape(sparse)).toThrow(/sparse|dense array/u);

    for (const field of ['movementProfileHash', 'fixtureHash', 'physicsAdapterVersion']) {
      const drifted = mutableTape();
      drifted.identity[field] = field === 'physicsAdapterVersion'
        ? '0.0.0'
        : 'ffffffffffffffff';
      expect(() => loadPhysicsFixtureTape(drifted)).toThrow(/identity drifted|fixture hash drifted/u);
    }
  });

  it('rejects zero-hash sentinels and inherited-looking unknown IDs', () => {
    const zeroFinal = mutableTape();
    zeroFinal.expected.finalHash = '0000000000000000';
    expect(() => loadPhysicsFixtureTape(zeroFinal)).toThrow(/final hash/u);

    const zeroState = mutableTape();
    zeroState.expected.stateHashes[0] = '0000000000000000';
    expect(() => loadPhysicsFixtureTape(zeroState)).toThrow(/state hash 0 is invalid/u);

    expect(() => getPhysicsFixtureTape('__proto__' as PhysicsFixtureTapeId)).toThrow(
      /Unknown physics fixture tape/u,
    );
  });
});
