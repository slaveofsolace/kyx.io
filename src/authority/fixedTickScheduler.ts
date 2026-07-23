import { AUTHORITY_TICK_DURATION_MS } from '../sim';

export const DEFAULT_MAX_CATCH_UP_TICKS = 4 as const;

export interface FixedTickPollResult {
  readonly ticksToRun: number;
  readonly missedTicks: number;
  readonly driftMilliseconds: number;
  readonly nextDelayMilliseconds: number;
  readonly nextTickAtMilliseconds: number;
}

function requireFiniteMilliseconds(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite millisecond value`);
  }
  return value;
}

/**
 * Pure scheduling arithmetic. The caller supplies a monotonic timestamp and
 * owns the timer, so room simulation never reads wall-clock time itself.
 */
export class FixedTickScheduler {
  readonly tickDurationMilliseconds: number;
  readonly maximumCatchUpTicks: number;

  private nextDeadline: number | null = null;
  private lastObservedTime: number | null = null;

  constructor(options: {
    readonly tickDurationMilliseconds?: number;
    readonly maximumCatchUpTicks?: number;
  } = {}) {
    this.tickDurationMilliseconds = requireFiniteMilliseconds(
      options.tickDurationMilliseconds ?? AUTHORITY_TICK_DURATION_MS,
      'tick duration',
    );
    if (this.tickDurationMilliseconds === 0) throw new RangeError('tick duration must be positive');
    const maximumCatchUpTicks = options.maximumCatchUpTicks ?? DEFAULT_MAX_CATCH_UP_TICKS;
    if (!Number.isSafeInteger(maximumCatchUpTicks) || maximumCatchUpTicks < 1 || maximumCatchUpTicks > 100) {
      throw new RangeError('maximum catch-up ticks must be an integer from 1 through 100');
    }
    this.maximumCatchUpTicks = maximumCatchUpTicks;
  }

  start(nowMilliseconds: number): number {
    requireFiniteMilliseconds(nowMilliseconds, 'scheduler start');
    if (this.nextDeadline !== null) throw new Error('fixed tick scheduler is already started');
    this.nextDeadline = nowMilliseconds + this.tickDurationMilliseconds;
    if (!Number.isFinite(this.nextDeadline)) {
      throw new RangeError('scheduler deadline exceeds finite millisecond precision');
    }
    this.lastObservedTime = nowMilliseconds;
    return this.nextDeadline;
  }

  get nextTickAtMilliseconds(): number | null {
    return this.nextDeadline;
  }

  poll(nowMilliseconds: number): FixedTickPollResult {
    requireFiniteMilliseconds(nowMilliseconds, 'scheduler poll');
    if (this.nextDeadline === null) this.start(nowMilliseconds);
    if (this.lastObservedTime !== null && nowMilliseconds < this.lastObservedTime) {
      throw new RangeError('scheduler monotonic time regressed');
    }
    this.lastObservedTime = nowMilliseconds;
    const deadline = this.nextDeadline as number;
    if (nowMilliseconds < deadline) {
      return Object.freeze({
        ticksToRun: 0,
        missedTicks: 0,
        driftMilliseconds: 0,
        nextDelayMilliseconds: deadline - nowMilliseconds,
        nextTickAtMilliseconds: deadline,
      });
    }

    const dueTicks = Math.floor((nowMilliseconds - deadline) / this.tickDurationMilliseconds) + 1;
    const ticksToRun = Math.min(dueTicks, this.maximumCatchUpTicks);
    const missedTicks = dueTicks - ticksToRun;
    const driftMilliseconds = nowMilliseconds - deadline;
    // Advance past the entire elapsed cadence, including deliberately dropped
    // backlog, so a slow room cannot enter an unbounded catch-up loop.
    this.nextDeadline = deadline + dueTicks * this.tickDurationMilliseconds;
    if (!Number.isFinite(this.nextDeadline)) {
      throw new RangeError('scheduler deadline exceeds finite millisecond precision');
    }
    return Object.freeze({
      ticksToRun,
      missedTicks,
      driftMilliseconds,
      nextDelayMilliseconds: Math.max(0, this.nextDeadline - nowMilliseconds),
      nextTickAtMilliseconds: this.nextDeadline,
    });
  }
}
