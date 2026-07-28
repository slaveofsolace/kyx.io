import { describe, expect, it } from 'vitest';

import {
  FixedTickInputLatch,
  MOVEMENT_BUTTON_BITS,
  MOVEMENT_COMMAND_DURATION_MS,
  MOVEMENT_COMMAND_RATE_HZ,
} from '../../../../src/app/movement';

describe('FixedTickInputLatch', () => {
  it('emits stable button bits and quantized movement at the 20 Hz authority rate', () => {
    expect(MOVEMENT_COMMAND_RATE_HZ).toBe(20);
    expect(MOVEMENT_COMMAND_DURATION_MS).toBe(50);
    expect(MOVEMENT_BUTTON_BITS).toEqual({
      jump: 1,
      sprint: 2,
      crouch: 4,
      primaryFire: 8,
      secondaryFire: 16,
      abilityOne: 32,
      abilityTwo: 64,
      utility: 128,
      reload: 256,
      melee: 512,
      abilityThree: 1024,
    });

    const latch = new FixedTickInputLatch();
    latch.sample({ held: ['moveForward', 'moveRight', 'sprint'] });
    const command = latch.emitNextCommand();

    expect(command).toMatchObject({
      kind: 'player_intent',
      sequence: 0,
      clientTick: 0,
      moveX: 127,
      moveZ: 127,
      heldButtons: MOVEMENT_BUTTON_BITS.sprint,
      pressedButtons: MOVEMENT_BUTTON_BITS.sprint,
      releasedButtons: 0,
    });
    expect(Object.isFrozen(command)).toBe(true);
  });

  it('preserves a complete press and release between fixed ticks', () => {
    const latch = new FixedTickInputLatch();
    latch.sample({ pressed: ['jump'] });
    latch.sample({ released: ['jump'] });

    const command = latch.emitNextCommand();
    expect(command.heldButtons).toBe(0);
    expect(command.pressedButtons).toBe(MOVEMENT_BUTTON_BITS.jump);
    expect(command.releasedButtons).toBe(MOVEMENT_BUTTON_BITS.jump);

    const next = latch.emitNextCommand();
    expect(next.pressedButtons).toBe(0);
    expect(next.releasedButtons).toBe(0);
  });

  it('ignores browser key-repeat presses and never repeats command edges implicitly', () => {
    const latch = new FixedTickInputLatch();
    latch.sample({ pressed: ['primaryFire'] });
    latch.sample({ pressed: ['primaryFire'] });

    const first = latch.emitNextCommand();
    const second = latch.emitNextCommand();

    expect(first.heldButtons).toBe(MOVEMENT_BUTTON_BITS.primaryFire);
    expect(first.pressedButtons).toBe(MOVEMENT_BUTTON_BITS.primaryFire);
    expect(second.heldButtons).toBe(MOVEMENT_BUTTON_BITS.primaryFire);
    expect(second.pressedButtons).toBe(0);
    expect(second.releasedButtons).toBe(0);
  });

  it('accumulates, rounds, bounds, and consumes mouse look deltas', () => {
    const latch = new FixedTickInputLatch({
      lookMilliDegreesPerMouseUnit: 100,
    });
    latch.sample({ mouseDeltaX: 1.25, mouseDeltaY: 2 });
    latch.sample({ mouseDeltaX: 0.255, mouseDeltaY: -0.5 });

    const accumulated = latch.emitNextCommand();
    expect(accumulated.lookYawDeltaMilliDegrees).toBe(151);
    expect(accumulated.lookPitchDeltaMilliDegrees).toBe(-150);
    expect(latch.emitNextCommand()).toMatchObject({
      lookYawDeltaMilliDegrees: 0,
      lookPitchDeltaMilliDegrees: 0,
    });

    latch.sample({ mouseDeltaX: 1_000_000, mouseDeltaY: -1_000_000 });
    expect(latch.emitNextCommand()).toMatchObject({
      lookYawDeltaMilliDegrees: 180_000,
      lookPitchDeltaMilliDegrees: 180_000,
    });
  });

  it('advances sequence/tick monotonically and reports wheel selection once', () => {
    const latch = new FixedTickInputLatch({
      initialSequence: 41,
      initialClientTick: 99,
      initialSelectedSlot: 0,
    });
    latch.sample({ wheelDeltaY: -1 });

    const first = latch.emitNextCommand();
    const second = latch.emitNextCommand();

    expect(first).toMatchObject({ sequence: 41, clientTick: 99, selectedSlot: 7 });
    expect(second.sequence).toBe(42);
    expect(second.clientTick).toBe(100);
    expect('selectedSlot' in second).toBe(false);
  });

  it('neutralizes exposed input and resets a command stream without phantom edges', () => {
    const latch = new FixedTickInputLatch({
      lookMilliDegreesPerMouseUnit: 100,
    });
    latch.sample({ pressed: ['sprint'] });
    latch.emitNextCommand();

    latch.sample({ pressed: ['jump'], mouseDeltaX: 12, wheelDeltaY: 1 });
    latch.neutralize();
    expect(latch.emitNextCommand()).toMatchObject({
      heldButtons: 0,
      pressedButtons: 0,
      releasedButtons: MOVEMENT_BUTTON_BITS.sprint,
      lookYawDeltaMilliDegrees: 0,
    });

    latch.reset({ initialSequence: 8, initialClientTick: 12, initialSelectedSlot: 3 });
    const resetCommand = latch.emitNextCommand();
    expect(resetCommand).toMatchObject({
      sequence: 8,
      clientTick: 12,
      heldButtons: 0,
      pressedButtons: 0,
      releasedButtons: 0,
    });
    expect('selectedSlot' in resetCommand).toBe(false);
  });

  it('rejects invalid samples and fails closed when uint32 counters are exhausted', () => {
    const latch = new FixedTickInputLatch({
      initialSequence: 0xffff_ffff,
      initialClientTick: 0xffff_ffff,
    });
    expect(() => latch.sample({ pressed: ['jump', 'jump'] })).toThrow(/duplicate/);
    expect(() =>
      latch.sample({ mouseDeltaX: Number.POSITIVE_INFINITY }),
    ).toThrow(/finite/);
    expect(() =>
      latch.sample({ pressed: ['not-an-action'] as never[] }),
    ).toThrow(/unsupported/);

    expect(latch.emitNextCommand()).toMatchObject({
      sequence: 0xffff_ffff,
      clientTick: 0xffff_ffff,
    });
    expect(() => latch.emitNextCommand()).toThrow(/unsigned 32-bit/);
  });

  it('snapshots only plain, dense action arrays with own data fields', () => {
    let getterReads = 0;
    const accessorActions: string[] = [];
    Object.defineProperty(accessorActions, '0', {
      enumerable: true,
      get() {
        getterReads += 1;
        return 'jump';
      },
    });
    expect(() =>
      new FixedTickInputLatch().sample({
        pressed: accessorActions as never[],
      }),
    ).toThrow(/dense array/);
    expect(getterReads).toBe(0);

    const sparseActions = new Array<string>(1);
    expect(() =>
      new FixedTickInputLatch().sample({ pressed: sparseActions as never[] }),
    ).toThrow(/dense array/);

    const symbolActions = ['jump'];
    Object.defineProperty(symbolActions, Symbol('hidden'), {
      enumerable: true,
      value: 'crouch',
    });
    expect(() =>
      new FixedTickInputLatch().sample({ pressed: symbolActions as never[] }),
    ).toThrow(/symbol/);
  });

  it('keeps presentation settings entirely outside PlayerIntentCommand', () => {
    const command = new FixedTickInputLatch().emitNextCommand();
    expect(Object.keys(command)).toEqual([
      'kind',
      'sequence',
      'clientTick',
      'moveX',
      'moveZ',
      'lookYawDeltaMilliDegrees',
      'lookPitchDeltaMilliDegrees',
      'heldButtons',
      'pressedButtons',
      'releasedButtons',
    ]);
    expect(command).not.toHaveProperty('fovDegrees');
    expect(command).not.toHaveProperty('reducedMotion');
  });
});
