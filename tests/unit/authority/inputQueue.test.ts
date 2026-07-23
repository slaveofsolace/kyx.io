import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION, type InputCommand } from '../../../src/net';
import {
  BoundedInputQueue,
  wireInputToMovementCommand,
} from '../../../src/authority';

function wire(sequence: number, overrides: Partial<InputCommand> = {}): InputCommand {
  return {
    type: 'input',
    sequence,
    clientTick: sequence,
    moveX: 0,
    moveY: 0,
    lookYawDeltaMilliDegrees: 0,
    lookPitchDeltaMilliDegrees: 0,
    heldButtons: 0,
    pressedButtons: 0,
    releasedButtons: 0,
    ...overrides,
  };
}

describe('authoritative input queue', () => {
  it('maps wire moveY to simulation moveZ and never introduces a transform', () => {
    const command = wireInputToMovementCommand(wire(0, { moveX: -64, moveY: 127 }));
    expect(command).toMatchObject({
      kind: 'player_intent',
      moveX: -64,
      moveZ: 127,
    });
    expect(command).not.toHaveProperty('position');
    expect(command).not.toHaveProperty('velocity');
  });

  it('preserves fast press and release edges as ordered commands in one authority tick', () => {
    const queue = new BoundedInputQueue();
    const result = queue.enqueueWireBatch([
      wire(0, { heldButtons: 1, pressedButtons: 1 }),
      wire(1, { heldButtons: 0, releasedButtons: 1 }),
    ], 0);
    expect(result).toMatchObject({ accepted: 2, pending: 2, rejections: [] });
    expect(queue.drain()).toMatchObject([
      { sequence: 0, pressedButtons: 1, releasedButtons: 0 },
      { sequence: 1, pressedButtons: 0, releasedButtons: 1 },
    ]);
  });

  it('bounds duplicates, stale/future commands, client lead, and queue memory', () => {
    const queue = new BoundedInputQueue({
      maximumPendingInputs: 2,
      maximumSequenceLead: 4,
      maximumClientTickLead: 3,
    });
    expect(queue.enqueueWireBatch([wire(0), wire(1)], 0).accepted).toBe(2);
    expect(queue.enqueueWireBatch([wire(1), wire(0), wire(8), wire(2, { clientTick: 9 })], 0)
      .rejections.map(({ reason }) => reason)).toEqual([
      'duplicate_sequence',
      'duplicate_sequence',
      'sequence_too_far_ahead',
      'client_tick_too_far_ahead',
    ]);
    expect(queue.enqueueWireBatch([wire(2)], 0).rejections).toEqual([
      { sequence: 2, reason: 'queue_full' },
    ]);
    expect(queue.pendingCount).toBe(2);
  });

  it('restores arrival order when the missing earlier command arrives inside the reorder window', () => {
    const queue = new BoundedInputQueue({ maximumReorderWaitTicks: 2 });

    expect(queue.enqueueWireBatch([wire(1)], 0)).toMatchObject({
      accepted: 1,
      pending: 1,
      rejections: [],
    });
    expect(queue.drain()).toEqual([]);
    expect(queue.drain()).toEqual([]);

    expect(queue.enqueueWireBatch([wire(0)], 1)).toMatchObject({
      accepted: 1,
      pending: 2,
      rejections: [],
    });
    expect(queue.drain().map(({ sequence }) => sequence)).toEqual([0, 1]);
  });

  it('keeps the default gap open through the 160 ms targeted-reorder boundary', () => {
    const queue = new BoundedInputQueue();
    queue.enqueueWireBatch([wire(1)], 0);

    // A command observed just before a 20 Hz drain can be checked at roughly
    // 0, 50, 100, and 150 ms. The delayed predecessor arrives at 160 ms, before
    // the next 200 ms-equivalent drain is allowed to abandon the gap.
    expect(queue.drain()).toEqual([]);
    expect(queue.drain()).toEqual([]);
    expect(queue.drain()).toEqual([]);
    expect(queue.drain()).toEqual([]);
    queue.enqueueWireBatch([wire(0)], 4);

    expect(queue.drain().map(({ sequence }) => sequence)).toEqual([0, 1]);
  });

  it('bounds a missing-sequence wait and resumes at the earliest retained command', () => {
    const queue = new BoundedInputQueue({ maximumReorderWaitTicks: 2 });
    queue.enqueueWireBatch([wire(2)], 0);

    expect(queue.drain()).toEqual([]);
    expect(queue.drain()).toEqual([]);
    expect(queue.drain().map(({ sequence }) => sequence)).toEqual([2]);
    expect(queue.enqueueWireBatch([wire(1)], 1).rejections).toEqual([
      { sequence: 1, reason: 'stale_sequence' },
    ]);
  });

  it('distinguishes pending duplicates from already processed stale commands', () => {
    const queue = new BoundedInputQueue();
    queue.enqueueWireBatch([wire(1)], 0);
    expect(queue.enqueueWireBatch([wire(1)], 0).rejections).toEqual([
      { sequence: 1, reason: 'duplicate_sequence' },
    ]);

    queue.enqueueWireBatch([wire(0)], 0);
    expect(queue.drain().map(({ sequence }) => sequence)).toEqual([0, 1]);
    expect(queue.enqueueWireBatch([wire(1), wire(0)], 1).rejections).toEqual([
      { sequence: 1, reason: 'duplicate_sequence' },
      { sequence: 0, reason: 'stale_sequence' },
    ]);
  });

  it('clears reorder state when the processed sequence is reset', () => {
    const queue = new BoundedInputQueue({ maximumReorderWaitTicks: 2 });
    queue.enqueueWireBatch([wire(2)], 0);
    expect(queue.drain()).toEqual([]);

    expect(queue.resetToProcessedSequence(0)).toBe(1);
    expect(queue.lastAcceptedSequence).toBe(0);
    expect(queue.enqueueWireBatch([wire(1)], 1).accepted).toBe(1);
    expect(queue.drain().map(({ sequence }) => sequence)).toEqual([1]);
  });

  it('keeps the protocol version outside the per-command authority adapter', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
    expect(wireInputToMovementCommand(wire(0))).not.toHaveProperty('protocolVersion');
  });

  it('uses a safe default drain for queues smaller than one wire batch', () => {
    const queue = new BoundedInputQueue({ maximumPendingInputs: 2 });
    queue.enqueueWireBatch([wire(0), wire(1)], 0);
    expect(queue.drain()).toHaveLength(2);
  });

  it('round-trips pending commands and the exact remaining reorder wait', () => {
    const queue = new BoundedInputQueue({ maximumReorderWaitTicks: 2 });
    queue.enqueueWireBatch([wire(2)], 0);
    expect(queue.drain()).toEqual([]);

    const checkpoint = queue.exportCheckpoint();
    const restored = BoundedInputQueue.fromCheckpoint(JSON.parse(JSON.stringify(checkpoint)));
    expect(restored.exportCheckpoint()).toEqual(checkpoint);
    expect(restored.drain()).toEqual([]);
    expect(restored.drain().map(({ sequence }) => sequence)).toEqual([2]);
  });

  it('fails closed on incompatible or internally inconsistent checkpoints', () => {
    const queue = new BoundedInputQueue();
    queue.enqueueWireBatch([wire(0)], 0);
    const checkpoint = queue.exportCheckpoint();

    expect(() => BoundedInputQueue.fromCheckpoint({ ...checkpoint, schemaVersion: 2 }))
      .toThrow(/schema/u);
    expect(() => BoundedInputQueue.fromCheckpoint({
      ...checkpoint,
      highestAcceptedSequence: 7,
    })).toThrow(/highest accepted sequence/u);
    expect(() => BoundedInputQueue.fromCheckpoint({
      ...checkpoint,
      pendingInputs: [wireInputToMovementCommand(wire(1)), wireInputToMovementCommand(wire(0))],
      highestAcceptedSequence: 1,
    })).toThrow(/pending input sequences/u);
  });
});
