import { PROTOCOL_LIMITS, type InputCommand } from '../net/protocol';
import {
  asQuantizedAxis,
  asSimulationTick,
  assertPlayerIntentCommand,
  type PlayerIntentCommand,
} from '../sim';

export const DEFAULT_MAX_PENDING_INPUTS = 128 as const;
export const DEFAULT_MAX_COMMANDS_PER_AUTHORITY_TICK = 32 as const;
export const DEFAULT_MAX_SEQUENCE_LEAD = 1_024 as const;
export const DEFAULT_MAX_CLIENT_TICK_LEAD = 200 as const;
export const DEFAULT_MAX_CLIENT_TICK_LAG = 400 as const;
// Four 20 Hz authority ticks keep the gap open through 150 ms and only skip it
// on the following drain. That covers the declared 160 ms targeted-reorder
// profile without allowing a permanently lost command to stall the queue.
export const DEFAULT_MAX_REORDER_WAIT_TICKS = 4 as const;

export type InputQueueRejectionReason =
  | 'duplicate_sequence'
  | 'stale_sequence'
  | 'sequence_too_far_ahead'
  | 'client_tick_too_far_ahead'
  | 'client_tick_too_old'
  | 'queue_full';

export interface InputQueueRejection {
  readonly sequence: number;
  readonly reason: InputQueueRejectionReason;
}

export interface InputQueueEnqueueResult {
  readonly accepted: number;
  readonly rejections: readonly InputQueueRejection[];
  readonly pending: number;
  readonly lastAcceptedSequence: number;
}

export interface BoundedInputQueueOptions {
  readonly maximumPendingInputs?: number;
  readonly maximumSequenceLead?: number;
  readonly maximumClientTickLead?: number;
  readonly maximumClientTickLag?: number;
  /** Authority ticks to wait for a missing sequence before treating it as loss. */
  readonly maximumReorderWaitTicks?: number;
  readonly initialLastAcceptedSequence?: number;
}

export const INPUT_QUEUE_CHECKPOINT_SCHEMA_VERSION = 1 as const;

export interface BoundedInputQueueCheckpointV1 {
  readonly schemaVersion: typeof INPUT_QUEUE_CHECKPOINT_SCHEMA_VERSION;
  readonly maximumPendingInputs: number;
  readonly maximumSequenceLead: number;
  readonly maximumClientTickLead: number;
  readonly maximumClientTickLag: number;
  readonly maximumReorderWaitTicks: number;
  readonly processedSequence: number;
  readonly highestAcceptedSequence: number;
  readonly reorderWaitTicks: number;
  readonly pendingInputs: readonly PlayerIntentCommand[];
}

function requireBoundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): number {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return value;
}

function checkpointRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('input queue checkpoint must be a record');
  }
  const expected = [
    'schemaVersion',
    'maximumPendingInputs',
    'maximumSequenceLead',
    'maximumClientTickLead',
    'maximumClientTickLag',
    'maximumReorderWaitTicks',
    'processedSequence',
    'highestAcceptedSequence',
    'reorderWaitTicks',
    'pendingInputs',
  ].sort();
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new TypeError('input queue checkpoint contains unsupported or missing fields');
  }
  return value as Record<string, unknown>;
}

/**
 * The wire protocol calls its forward/back axis `moveY`; the simulation uses
 * the horizontal X/Z plane. This is the only authoritative mapping between
 * those contracts. It intentionally carries no client-authored transform.
 */
export function wireInputToMovementCommand(command: InputCommand): PlayerIntentCommand {
  const translated: PlayerIntentCommand = {
    kind: 'player_intent',
    sequence: command.sequence,
    clientTick: asSimulationTick(command.clientTick),
    moveX: asQuantizedAxis(command.moveX),
    moveZ: asQuantizedAxis(command.moveY),
    lookYawDeltaMilliDegrees: command.lookYawDeltaMilliDegrees,
    lookPitchDeltaMilliDegrees: command.lookPitchDeltaMilliDegrees,
    heldButtons: command.heldButtons,
    pressedButtons: command.pressedButtons,
    releasedButtons: command.releasedButtons,
    ...(command.selectedSlot === undefined ? {} : { selectedSlot: command.selectedSlot }),
  };
  if (translated.sequence > PROTOCOL_LIMITS.maxSequence) {
    throw new RangeError('input sequence exceeds the protocol maximum');
  }
  assertPlayerIntentCommand(translated);
  return Object.freeze(translated);
}

export class BoundedInputQueue {
  readonly maximumPendingInputs: number;
  readonly maximumSequenceLead: number;
  readonly maximumClientTickLead: number;
  readonly maximumClientTickLag: number;
  readonly maximumReorderWaitTicks: number;

  private readonly pendingInputs: PlayerIntentCommand[] = [];
  private processedSequence: number;
  private highestAcceptedSequence: number;
  private reorderWaitTicks = 0;

  constructor(options: BoundedInputQueueOptions = {}) {
    this.maximumPendingInputs = requireBoundedInteger(
      options.maximumPendingInputs ?? DEFAULT_MAX_PENDING_INPUTS,
      1,
      4_096,
      'maximum pending inputs',
    );
    this.maximumSequenceLead = requireBoundedInteger(
      options.maximumSequenceLead ?? DEFAULT_MAX_SEQUENCE_LEAD,
      1,
      1_000_000,
      'maximum sequence lead',
    );
    this.maximumClientTickLead = requireBoundedInteger(
      options.maximumClientTickLead ?? DEFAULT_MAX_CLIENT_TICK_LEAD,
      0,
      1_000_000,
      'maximum client tick lead',
    );
    this.maximumClientTickLag = requireBoundedInteger(
      options.maximumClientTickLag ?? DEFAULT_MAX_CLIENT_TICK_LAG,
      0,
      1_000_000,
      'maximum client tick lag',
    );
    this.maximumReorderWaitTicks = requireBoundedInteger(
      options.maximumReorderWaitTicks ?? DEFAULT_MAX_REORDER_WAIT_TICKS,
      0,
      1_000_000,
      'maximum reorder wait ticks',
    );
    const initialSequence = requireBoundedInteger(
      options.initialLastAcceptedSequence ?? -1,
      -1,
      PROTOCOL_LIMITS.maxSequence,
      'initial accepted sequence',
    );
    this.processedSequence = initialSequence;
    this.highestAcceptedSequence = initialSequence;
  }

  static fromCheckpoint(checkpointValue: unknown): BoundedInputQueue {
    const checkpoint = checkpointRecord(checkpointValue);
    if (checkpoint.schemaVersion !== INPUT_QUEUE_CHECKPOINT_SCHEMA_VERSION) {
      throw new RangeError('input queue checkpoint schema is unsupported');
    }
    const maximumPendingInputs = requireBoundedInteger(
      checkpoint.maximumPendingInputs as number,
      1,
      4_096,
      'checkpoint maximum pending inputs',
    );
    const maximumSequenceLead = requireBoundedInteger(
      checkpoint.maximumSequenceLead as number,
      1,
      1_000_000,
      'checkpoint maximum sequence lead',
    );
    const maximumClientTickLead = requireBoundedInteger(
      checkpoint.maximumClientTickLead as number,
      0,
      1_000_000,
      'checkpoint maximum client tick lead',
    );
    const maximumClientTickLag = requireBoundedInteger(
      checkpoint.maximumClientTickLag as number,
      0,
      1_000_000,
      'checkpoint maximum client tick lag',
    );
    const maximumReorderWaitTicks = requireBoundedInteger(
      checkpoint.maximumReorderWaitTicks as number,
      0,
      1_000_000,
      'checkpoint maximum reorder wait ticks',
    );
    const processedSequence = requireBoundedInteger(
      checkpoint.processedSequence as number,
      -1,
      PROTOCOL_LIMITS.maxSequence,
      'checkpoint processed sequence',
    );
    const highestAcceptedSequence = requireBoundedInteger(
      checkpoint.highestAcceptedSequence as number,
      processedSequence,
      PROTOCOL_LIMITS.maxSequence,
      'checkpoint highest accepted sequence',
    );
    const reorderWaitTicks = requireBoundedInteger(
      checkpoint.reorderWaitTicks as number,
      0,
      maximumReorderWaitTicks,
      'checkpoint reorder wait ticks',
    );
    if (!Array.isArray(checkpoint.pendingInputs)) {
      throw new TypeError('checkpoint pending inputs must be an array');
    }
    if (checkpoint.pendingInputs.length > maximumPendingInputs) {
      throw new RangeError('checkpoint pending inputs exceed queue capacity');
    }
    const pendingInputs: PlayerIntentCommand[] = [];
    for (const value of checkpoint.pendingInputs) {
      assertPlayerIntentCommand(value);
      const command = structuredClone(value);
      if (
        command.sequence <= processedSequence
        || command.sequence > processedSequence + maximumSequenceLead
        || command.sequence <= (pendingInputs.at(-1)?.sequence ?? processedSequence)
      ) {
        throw new RangeError('checkpoint pending input sequences are invalid');
      }
      pendingInputs.push(Object.freeze(command));
    }
    const expectedHighest = pendingInputs.at(-1)?.sequence ?? processedSequence;
    if (highestAcceptedSequence !== expectedHighest) {
      throw new RangeError('checkpoint highest accepted sequence is inconsistent');
    }
    if (pendingInputs.length === 0 && reorderWaitTicks !== 0) {
      throw new RangeError('empty checkpoint queue cannot retain reorder wait ticks');
    }

    const queue = new BoundedInputQueue({
      maximumPendingInputs,
      maximumSequenceLead,
      maximumClientTickLead,
      maximumClientTickLag,
      maximumReorderWaitTicks,
      initialLastAcceptedSequence: processedSequence,
    });
    queue.pendingInputs.push(...pendingInputs);
    queue.highestAcceptedSequence = highestAcceptedSequence;
    queue.reorderWaitTicks = reorderWaitTicks;
    return queue;
  }

  exportCheckpoint(): BoundedInputQueueCheckpointV1 {
    return Object.freeze({
      schemaVersion: INPUT_QUEUE_CHECKPOINT_SCHEMA_VERSION,
      maximumPendingInputs: this.maximumPendingInputs,
      maximumSequenceLead: this.maximumSequenceLead,
      maximumClientTickLead: this.maximumClientTickLead,
      maximumClientTickLag: this.maximumClientTickLag,
      maximumReorderWaitTicks: this.maximumReorderWaitTicks,
      processedSequence: this.processedSequence,
      highestAcceptedSequence: this.highestAcceptedSequence,
      reorderWaitTicks: this.reorderWaitTicks,
      pendingInputs: Object.freeze(this.pendingInputs.map((command) => (
        Object.freeze(structuredClone(command))
      ))),
    });
  }

  get pendingCount(): number {
    return this.pendingInputs.length;
  }

  get lastAcceptedSequence(): number {
    return this.highestAcceptedSequence;
  }

  enqueueWireBatch(
    commands: readonly InputCommand[],
    authorityTick: number,
  ): InputQueueEnqueueResult {
    asSimulationTick(authorityTick);
    if (!Array.isArray(commands)) throw new TypeError('input batch must be an array');
    if (commands.length < 1 || commands.length > PROTOCOL_LIMITS.maxCommandsPerBatch) {
      throw new RangeError(`input batch must contain 1-${PROTOCOL_LIMITS.maxCommandsPerBatch} commands`);
    }

    let accepted = 0;
    const rejections: InputQueueRejection[] = [];
    for (const wireCommand of commands) {
      const command = wireInputToMovementCommand(wireCommand);
      let reason: InputQueueRejectionReason | null = null;
      if (
        command.sequence === this.processedSequence
        || this.pendingInputs.some(({ sequence }) => sequence === command.sequence)
      ) {
        reason = 'duplicate_sequence';
      } else if (command.sequence < this.processedSequence) {
        reason = 'stale_sequence';
      } else if (command.sequence > this.processedSequence + this.maximumSequenceLead) {
        reason = 'sequence_too_far_ahead';
      } else if (command.clientTick > authorityTick + this.maximumClientTickLead) {
        reason = 'client_tick_too_far_ahead';
      } else if (command.clientTick + this.maximumClientTickLag < authorityTick) {
        reason = 'client_tick_too_old';
      } else if (this.pendingInputs.length >= this.maximumPendingInputs) {
        reason = 'queue_full';
      }

      if (reason !== null) {
        rejections.push(Object.freeze({ sequence: command.sequence, reason }));
        continue;
      }

      this.pendingInputs.push(command);
      this.pendingInputs.sort((left, right) => left.sequence - right.sequence);
      this.highestAcceptedSequence = Math.max(this.highestAcceptedSequence, command.sequence);
      accepted += 1;
    }

    return Object.freeze({
      accepted,
      rejections: Object.freeze(rejections),
      pending: this.pendingInputs.length,
      lastAcceptedSequence: this.highestAcceptedSequence,
    });
  }

  drain(maximumCommands: number = Math.min(
    DEFAULT_MAX_COMMANDS_PER_AUTHORITY_TICK,
    this.maximumPendingInputs,
  )): readonly PlayerIntentCommand[] {
    requireBoundedInteger(maximumCommands, 1, 4_096, 'maximum drained commands');
    if (this.pendingInputs.length === 0) {
      this.reorderWaitTicks = 0;
      return Object.freeze([]);
    }
    const expectedSequence = this.processedSequence + 1;
    const firstSequence = this.pendingInputs[0]!.sequence;
    if (firstSequence > expectedSequence) {
      if (this.reorderWaitTicks < this.maximumReorderWaitTicks) {
        this.reorderWaitTicks += 1;
        return Object.freeze([]);
      }
      // The missing sequence exceeded the bounded reorder window. Treat it as
      // packet loss and resume at the earliest retained command.
      this.processedSequence = firstSequence - 1;
    }
    this.reorderWaitTicks = 0;
    const drained: PlayerIntentCommand[] = [];
    while (
      drained.length < maximumCommands
      && this.pendingInputs[0]?.sequence === this.processedSequence + 1
    ) {
      const command = this.pendingInputs.shift();
      if (command === undefined) break;
      drained.push(command);
      this.processedSequence = command.sequence;
    }
    return Object.freeze(drained);
  }

  clear(): number {
    this.reorderWaitTicks = 0;
    return this.pendingInputs.splice(0).length;
  }

  resetToProcessedSequence(sequence: number): number {
    requireBoundedInteger(sequence, -1, PROTOCOL_LIMITS.maxSequence, 'processed sequence');
    const cleared = this.clear();
    this.processedSequence = sequence;
    this.highestAcceptedSequence = sequence;
    return cleared;
  }
}
