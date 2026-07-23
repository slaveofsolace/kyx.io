import { describe, expect, it } from 'vitest';

import {
  MOVEMENT_REPLAY_MAX_COMMANDS_PER_FRAME,
  MOVEMENT_REPLAY_MAX_FRAMES,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  asQuantizedAxis,
  asSimulationTick,
  createMovementReplay,
  runMovementReplay,
  type MovementReplayFrame,
  type PlayerIntentCommand,
} from '../../../../src/sim';
import {
  FakeMovementQueryPort,
  createTestMovementState,
  testIntent,
} from './fakeQueryPort';

const PROFILE = PHASE3_HYPOTHESIS_MOVEMENT_PROFILE;

function walkFrames(): MovementReplayFrame[] {
  return [
    {
      authorityTick: asSimulationTick(1),
      commands: [testIntent(0, 0, { moveZ: asQuantizedAxis(127) })],
    },
    { authorityTick: asSimulationTick(2), commands: [] },
    { authorityTick: asSimulationTick(3), commands: [] },
  ];
}

describe('movement replay and measured envelopes', () => {
  it('produces identical hashes, events, samples, and envelopes on repeated runs', () => {
    const initial = createTestMovementState();
    const tape = createMovementReplay(initial, walkFrames());
    const first = runMovementReplay(initial, tape, PROFILE, new FakeMovementQueryPort());
    const second = runMovementReplay(initial, tape, PROFILE, new FakeMovementQueryPort());

    expect(first).toEqual(second);
    expect(first.stateHashes).toHaveLength(4);
    expect(first.finalHash).toHaveLength(16);
    expect(first.envelope).toMatchObject({
      evidenceLabel: 'HYPOTHESIS',
      tickCount: 3,
      elapsedMilliseconds: 150,
      planarDistanceTravelledMm: 800,
      spatialDistanceTravelledMm: 800,
      maximumPlanarSpeedMmPerSecond: 7_000,
      airborneTicks: 0,
      groundedTicks: 3,
      queries: {
        moveCapsuleCalls: 3,
        volumeCalls: 3,
        shapeCasts: 3,
        overlapTests: 3,
      },
    });
    expect(first.envelope.samples).toHaveLength(4);
  });

  it('rejects gaps and duplicate authority ticks', () => {
    const initial = createTestMovementState();
    const tape = createMovementReplay(initial, [{ authorityTick: asSimulationTick(2), commands: [] }]);

    expect(() => runMovementReplay(
      initial,
      tape,
      PROFILE,
      new FakeMovementQueryPort(),
    )).toThrow(/expected next tick 1/);
  });

  it('rejects ruleset, profile, fixture, and adapter identity drift', () => {
    const initial = createTestMovementState();
    const tape = createMovementReplay(initial, []);
    for (const identity of [
      { ...tape.identity, rulesetHash: '3333333333333333' },
      { ...tape.identity, movementProfileHash: '2222222222222222' },
      { ...tape.identity, fixtureHash: '2222222222222222' },
      { ...tape.identity, physicsAdapterVersion: '2.0.0' },
    ]) {
      expect(() => runMovementReplay(
        initial,
        { ...tape, identity },
        PROFILE,
        new FakeMovementQueryPort(),
      )).toThrow(/identity mismatch/);
    }
  });

  it('detaches and recursively freezes source frames and commands', () => {
    const initial = createTestMovementState();
    const command = testIntent(0, 0, { moveZ: asQuantizedAxis(127) });
    const frame: MovementReplayFrame = {
      authorityTick: asSimulationTick(1),
      commands: [command],
    };
    const frames = [frame];
    const tape = createMovementReplay(initial, frames);
    const before = runMovementReplay(initial, tape, PROFILE, new FakeMovementQueryPort());

    (command as unknown as Record<string, unknown>).moveZ = asQuantizedAxis(-127);
    (frame as unknown as Record<string, unknown>).authorityTick = asSimulationTick(9);
    frames.push({ authorityTick: asSimulationTick(2), commands: [] });
    const after = runMovementReplay(initial, tape, PROFILE, new FakeMovementQueryPort());

    expect(after.finalHash).toBe(before.finalHash);
    expect(after.envelope).toEqual(before.envelope);
    expect(Object.isFrozen(tape)).toBe(true);
    expect(Object.isFrozen(tape.identity)).toBe(true);
    expect(Object.isFrozen(tape.frames)).toBe(true);
    expect(Object.isFrozen(tape.frames[0])).toBe(true);
    expect(Object.isFrozen(tape.frames[0]?.commands)).toBe(true);
    expect(Object.isFrozen(tape.frames[0]?.commands[0])).toBe(true);
  });

  it('rejects accessors without invoking them', () => {
    let getterCalls = 0;
    const command = testIntent(0, 0);
    Object.defineProperty(command, 'moveZ', {
      enumerable: true,
      configurable: true,
      get: () => {
        getterCalls += 1;
        return asQuantizedAxis(127);
      },
    });

    expect(() => createMovementReplay(createTestMovementState(), [{
      authorityTick: asSimulationTick(1),
      commands: [command],
    }])).toThrow(/accessor/);
    expect(getterCalls).toBe(0);
  });

  it('snapshots descriptor values without invoking Proxy get traps', () => {
    let getCalls = 0;
    const source = testIntent(0, 0, { moveZ: asQuantizedAxis(127) });
    const proxy = new Proxy(source, {
      get: (target, property, receiver) => {
        getCalls += 1;
        if (property === 'moveZ') return asQuantizedAxis(-127);
        return Reflect.get(target, property, receiver) as unknown;
      },
    });
    const tape = createMovementReplay(createTestMovementState(), [{
      authorityTick: asSimulationTick(1),
      commands: [proxy],
    }]);

    expect(getCalls).toBe(0);
    expect(tape.frames[0]?.commands[0]?.moveZ).toBe(127);
  });

  it('rejects non-enumerable evidence fields', () => {
    const command = testIntent(0, 0);
    Object.defineProperty(command, 'sequence', {
      value: 0,
      enumerable: false,
      configurable: true,
    });
    expect(() => createMovementReplay(createTestMovementState(), [{
      authorityTick: asSimulationTick(1),
      commands: [command],
    }])).toThrow(/enumerable/);
  });

  it('rejects sparse and custom-prototype arrays', () => {
    const sparse = new Array<MovementReplayFrame>(2);
    sparse[0] = { authorityTick: asSimulationTick(1), commands: [] };
    expect(() => createMovementReplay(createTestMovementState(), sparse)).toThrow(/sparse/);

    const customPrototype = walkFrames();
    Object.setPrototypeOf(customPrototype, Object.create(Array.prototype) as object);
    expect(() => createMovementReplay(createTestMovementState(), customPrototype))
      .toThrow(/standard array prototype/);
  });

  it('rejects oversized frame and per-frame command counts before walking them', () => {
    const tooManyFrames = [] as MovementReplayFrame[];
    tooManyFrames.length = MOVEMENT_REPLAY_MAX_FRAMES + 1;
    expect(() => createMovementReplay(createTestMovementState(), tooManyFrames))
      .toThrow(new RegExp(`0 to ${MOVEMENT_REPLAY_MAX_FRAMES}`));

    const tooManyCommands = [] as PlayerIntentCommand[];
    tooManyCommands.length = MOVEMENT_REPLAY_MAX_COMMANDS_PER_FRAME + 1;
    expect(() => createMovementReplay(createTestMovementState(), [{
      authorityTick: asSimulationTick(1),
      commands: tooManyCommands,
    }])).toThrow(new RegExp(`0 to ${MOVEMENT_REPLAY_MAX_COMMANDS_PER_FRAME}`));
  });
});
