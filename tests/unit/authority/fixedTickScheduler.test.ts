import { describe, expect, it } from 'vitest';

import { FixedTickScheduler } from '../../../src/authority';

describe('fixed authority scheduler arithmetic', () => {
  it('ticks at 20 Hz independently of input arrival', () => {
    const scheduler = new FixedTickScheduler();
    expect(scheduler.start(1_000)).toBe(1_050);
    expect(scheduler.poll(1_049)).toMatchObject({ ticksToRun: 0, nextDelayMilliseconds: 1 });
    expect(scheduler.poll(1_050)).toMatchObject({ ticksToRun: 1, missedTicks: 0 });
    expect(scheduler.poll(1_100)).toMatchObject({ ticksToRun: 1, missedTicks: 0 });
  });

  it('caps catch-up and drops elapsed backlog without shifting cadence', () => {
    const scheduler = new FixedTickScheduler({ maximumCatchUpTicks: 4 });
    scheduler.start(0);
    expect(scheduler.poll(500)).toEqual({
      ticksToRun: 4,
      missedTicks: 6,
      driftMilliseconds: 450,
      nextDelayMilliseconds: 50,
      nextTickAtMilliseconds: 550,
    });
    expect(scheduler.poll(550)).toMatchObject({ ticksToRun: 1, missedTicks: 0 });
  });

  it('can rebase a room to one tick per event-loop turn after a long stall', () => {
    const scheduler = new FixedTickScheduler({ maximumCatchUpTicks: 1 });
    scheduler.start(0);
    expect(scheduler.poll(500)).toEqual({
      ticksToRun: 1,
      missedTicks: 9,
      driftMilliseconds: 450,
      nextDelayMilliseconds: 50,
      nextTickAtMilliseconds: 550,
    });
    expect(scheduler.poll(550)).toMatchObject({ ticksToRun: 1, missedTicks: 0 });
  });

  it('rejects clock regression and an accidental scheduler restart', () => {
    const scheduler = new FixedTickScheduler();
    scheduler.start(100);
    expect(() => scheduler.start(101)).toThrow(/already started/u);
    scheduler.poll(120);
    expect(() => scheduler.poll(119)).toThrow(/regressed/u);
  });
});
