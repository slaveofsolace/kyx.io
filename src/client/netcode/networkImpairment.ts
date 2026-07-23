const MAXIMUM_QUEUE_DEPTH = 65_536;
const MAXIMUM_SCRIPT_LENGTH = 1_000_000;
const MAXIMUM_LATENCY_COMPONENT_MILLISECONDS = 300_000;

export interface ScriptedNetworkImpairmentDirective {
  /** Base one-way latency for the original delivery copy. */
  readonly latencyMilliseconds: number;
  /** Drops the logical packet before any delivery copies are queued. */
  readonly drop: boolean;
  /** Extra delay for one duplicate copy, or null when duplication is disabled. */
  readonly duplicateDelayMilliseconds: number | null;
  /** Extra delay applied to every copy to deliberately permit later packets to overtake it. */
  readonly reorderDelayMilliseconds: number;
}

interface NetworkImpairmentConfigBase {
  /** Initial explicit synthetic clock. No host clock is read by this utility. */
  readonly startingClockMilliseconds: number;
  /** Hard limit measured in queued delivery copies, including duplicates. */
  readonly maximumQueueDepth: number;
}

export interface ScriptedNetworkImpairmentConfig extends NetworkImpairmentConfigBase {
  readonly kind: 'scripted';
  /** Exactly one directive is consumed by each successfully accepted send. */
  readonly schedule: readonly ScriptedNetworkImpairmentDirective[];
}

export interface SeededNetworkImpairmentConfig extends NetworkImpairmentConfigBase {
  readonly kind: 'seeded';
  /** Unsigned 32-bit seed for the fixed xorshift32 stream. */
  readonly seed: number;
  readonly baseLatencyMilliseconds: number;
  /** Uniform inclusive integer jitter in [-jitter, +jitter]. */
  readonly jitterMilliseconds: number;
  readonly lossRatePermille: number;
  readonly duplicateRatePermille: number;
  readonly duplicateDelayMilliseconds: number;
  readonly reorderRatePermille: number;
  readonly reorderDelayMilliseconds: number;
}

export type NetworkImpairmentConfig =
  | ScriptedNetworkImpairmentConfig
  | SeededNetworkImpairmentConfig;

export type ResolvedNetworkImpairmentConfig = Readonly<NetworkImpairmentConfig>;

export interface NetworkImpairmentSendResult {
  readonly packetOrdinal: number;
  readonly sentAtMilliseconds: number;
  readonly dropped: boolean;
  readonly scheduledCopies: number;
  readonly deliveryAtMilliseconds: readonly number[];
}

export interface NetworkImpairmentDelivery<T> {
  readonly packetOrdinal: number;
  readonly copyIndex: number;
  readonly sentAtMilliseconds: number;
  /** Exact synthetic delivery time, independent of how coarsely drain() is called. */
  readonly deliveredAtMilliseconds: number;
  readonly latencyMilliseconds: number;
  readonly payload: Readonly<T>;
}

export interface NetworkImpairmentMetrics {
  readonly sentPackets: number;
  readonly droppedPackets: number;
  readonly duplicatedPackets: number;
  readonly reorderImpairedPackets: number;
  /** Packets whose first copy arrived after a higher-ordinal packet's first copy. */
  readonly reorderedPackets: number;
  readonly scheduledCopies: number;
  readonly deliveredPackets: number;
  readonly deliveredCopies: number;
  readonly overflowRejectedPackets: number;
  readonly currentQueueDepth: number;
  readonly maximumObservedQueueDepth: number;
  readonly minimumDeliveryLatencyMilliseconds: number | null;
  readonly maximumDeliveryLatencyMilliseconds: number | null;
  readonly totalDeliveryLatencyMilliseconds: number;
  readonly averageDeliveryLatencyMilliseconds: number | null;
}

/**
 * Optional payload ownership seam. The default retains the supplied immutable
 * value. A transport adapter handling mutable values should inject a cloner.
 */
export type NetworkImpairmentPayloadCloner<T> = (payload: T) => Readonly<T>;

interface DeliveryPlan {
  readonly dropped: boolean;
  readonly duplicated: boolean;
  readonly reorderImpaired: boolean;
  readonly latenciesMilliseconds: readonly number[];
  readonly nextRandomState: number;
  readonly nextScriptCursor: number;
}

interface QueuedDelivery<T> {
  readonly packetOrdinal: number;
  readonly copyIndex: number;
  readonly scheduleOrder: number;
  readonly sentAtMilliseconds: number;
  readonly deliveryAtMilliseconds: number;
  readonly payload: Readonly<T>;
}

interface MutableMetrics {
  sentPackets: number;
  droppedPackets: number;
  duplicatedPackets: number;
  reorderImpairedPackets: number;
  reorderedPackets: number;
  scheduledCopies: number;
  deliveredPackets: number;
  deliveredCopies: number;
  overflowRejectedPackets: number;
  maximumObservedQueueDepth: number;
  minimumDeliveryLatencyMilliseconds: number | null;
  maximumDeliveryLatencyMilliseconds: number | null;
  totalDeliveryLatencyMilliseconds: number;
}

const SEEDED_CONFIG_KEYS = new Set([
  'kind',
  'startingClockMilliseconds',
  'maximumQueueDepth',
  'seed',
  'baseLatencyMilliseconds',
  'jitterMilliseconds',
  'lossRatePermille',
  'duplicateRatePermille',
  'duplicateDelayMilliseconds',
  'reorderRatePermille',
  'reorderDelayMilliseconds',
]);

const SCRIPTED_CONFIG_KEYS = new Set([
  'kind',
  'startingClockMilliseconds',
  'maximumQueueDepth',
  'schedule',
]);

const SCRIPT_DIRECTIVE_KEYS = new Set([
  'latencyMilliseconds',
  'drop',
  'duplicateDelayMilliseconds',
  'reorderDelayMilliseconds',
]);

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new RangeError(`${label} contains unsupported key ${key}`);
  }
}

function assertInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
}

function assertBoolean(value: unknown, label: string): asserts value is boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean`);
}

function assertTimestamp(value: number, label: string): void {
  assertInteger(value, 0, Number.MAX_SAFE_INTEGER, label);
}

function checkedTimestampSum(left: number, right: number, label: string): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(`${label} exceeds the safe synthetic clock range`);
  }
  return result;
}

function cloneScriptDirective(
  input: ScriptedNetworkImpairmentDirective,
  index: number,
): ScriptedNetworkImpairmentDirective {
  assertRecord(input, `network impairment directive ${index}`);
  assertExactKeys(input, SCRIPT_DIRECTIVE_KEYS, `network impairment directive ${index}`);
  assertInteger(
    input.latencyMilliseconds,
    0,
    MAXIMUM_LATENCY_COMPONENT_MILLISECONDS,
    `network impairment directive ${index} latency`,
  );
  assertBoolean(input.drop, `network impairment directive ${index} drop flag`);
  if (input.duplicateDelayMilliseconds !== null) {
    assertInteger(
      input.duplicateDelayMilliseconds,
      0,
      MAXIMUM_LATENCY_COMPONENT_MILLISECONDS,
      `network impairment directive ${index} duplicate delay`,
    );
  }
  assertInteger(
    input.reorderDelayMilliseconds,
    0,
    MAXIMUM_LATENCY_COMPONENT_MILLISECONDS,
    `network impairment directive ${index} reorder delay`,
  );
  checkedTimestampSum(
    input.latencyMilliseconds,
    input.reorderDelayMilliseconds,
    `network impairment directive ${index} latency`,
  );
  if (input.duplicateDelayMilliseconds !== null) {
    checkedTimestampSum(
      input.latencyMilliseconds + input.reorderDelayMilliseconds,
      input.duplicateDelayMilliseconds,
      `network impairment directive ${index} duplicate latency`,
    );
  }
  return Object.freeze({
    latencyMilliseconds: input.latencyMilliseconds,
    drop: input.drop,
    duplicateDelayMilliseconds: input.duplicateDelayMilliseconds,
    reorderDelayMilliseconds: input.reorderDelayMilliseconds,
  });
}

function resolveConfig(input: NetworkImpairmentConfig): ResolvedNetworkImpairmentConfig {
  assertRecord(input, 'network impairment config');
  if (input.kind !== 'scripted' && input.kind !== 'seeded') {
    throw new RangeError('network impairment config kind must be scripted or seeded');
  }
  assertInteger(
    input.startingClockMilliseconds,
    0,
    Number.MAX_SAFE_INTEGER,
    'network impairment starting clock',
  );
  assertInteger(
    input.maximumQueueDepth,
    1,
    MAXIMUM_QUEUE_DEPTH,
    'network impairment maximum queue depth',
  );
  if (input.kind === 'scripted') {
    assertExactKeys(input, SCRIPTED_CONFIG_KEYS, 'scripted network impairment config');
    if (!Array.isArray(input.schedule) || input.schedule.length < 1) {
      throw new RangeError('scripted network impairment schedule must not be empty');
    }
    if (input.schedule.length > MAXIMUM_SCRIPT_LENGTH) {
      throw new RangeError(`scripted network impairment schedule exceeds ${MAXIMUM_SCRIPT_LENGTH}`);
    }
    const schedule = Object.freeze(input.schedule.map(cloneScriptDirective));
    return Object.freeze({
      kind: 'scripted',
      startingClockMilliseconds: input.startingClockMilliseconds,
      maximumQueueDepth: input.maximumQueueDepth,
      schedule,
    });
  }

  assertExactKeys(input, SEEDED_CONFIG_KEYS, 'seeded network impairment config');
  assertInteger(input.seed, 0, 0xffff_ffff, 'network impairment seed');
  assertInteger(
    input.baseLatencyMilliseconds,
    0,
    MAXIMUM_LATENCY_COMPONENT_MILLISECONDS,
    'network impairment base latency',
  );
  assertInteger(
    input.jitterMilliseconds,
    0,
    MAXIMUM_LATENCY_COMPONENT_MILLISECONDS,
    'network impairment jitter',
  );
  assertInteger(input.lossRatePermille, 0, 1_000, 'network impairment loss rate');
  assertInteger(
    input.duplicateRatePermille,
    0,
    1_000,
    'network impairment duplicate rate',
  );
  assertInteger(
    input.duplicateDelayMilliseconds,
    0,
    MAXIMUM_LATENCY_COMPONENT_MILLISECONDS,
    'network impairment duplicate delay',
  );
  assertInteger(input.reorderRatePermille, 0, 1_000, 'network impairment reorder rate');
  assertInteger(
    input.reorderDelayMilliseconds,
    0,
    MAXIMUM_LATENCY_COMPONENT_MILLISECONDS,
    'network impairment reorder delay',
  );
  if (input.reorderRatePermille > 0 && input.reorderDelayMilliseconds === 0) {
    throw new RangeError('a non-zero reorder rate requires a non-zero reorder delay');
  }
  return Object.freeze({
    kind: 'seeded',
    startingClockMilliseconds: input.startingClockMilliseconds,
    maximumQueueDepth: input.maximumQueueDepth,
    seed: input.seed,
    baseLatencyMilliseconds: input.baseLatencyMilliseconds,
    jitterMilliseconds: input.jitterMilliseconds,
    lossRatePermille: input.lossRatePermille,
    duplicateRatePermille: input.duplicateRatePermille,
    duplicateDelayMilliseconds: input.duplicateDelayMilliseconds,
    reorderRatePermille: input.reorderRatePermille,
    reorderDelayMilliseconds: input.reorderDelayMilliseconds,
  });
}

function nextXorshift32(state: number): number {
  let next = state === 0 ? 0x6d2b_79f5 : state;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}

function seededPlan(
  config: SeededNetworkImpairmentConfig,
  randomState: number,
  scriptCursor: number,
): DeliveryPlan {
  const lossRoll = nextXorshift32(randomState);
  const duplicateRoll = nextXorshift32(lossRoll);
  const reorderRoll = nextXorshift32(duplicateRoll);
  const jitterRoll = nextXorshift32(reorderRoll);
  const dropped = lossRoll % 1_000 < config.lossRatePermille;
  const duplicated = !dropped && duplicateRoll % 1_000 < config.duplicateRatePermille;
  const reorderImpaired = !dropped && reorderRoll % 1_000 < config.reorderRatePermille;
  const jitterSpan = config.jitterMilliseconds * 2 + 1;
  const jitter = jitterRoll % jitterSpan - config.jitterMilliseconds;
  const baseLatency = Math.max(0, config.baseLatencyMilliseconds + jitter);
  const primaryLatency = baseLatency + (reorderImpaired
    ? config.reorderDelayMilliseconds
    : 0);
  const latencies = dropped
    ? []
    : [
        primaryLatency,
        ...(duplicated ? [primaryLatency + config.duplicateDelayMilliseconds] : []),
      ];
  return Object.freeze({
    dropped,
    duplicated,
    reorderImpaired,
    latenciesMilliseconds: Object.freeze(latencies),
    nextRandomState: jitterRoll,
    nextScriptCursor: scriptCursor,
  });
}

function scriptedPlan(
  config: ScriptedNetworkImpairmentConfig,
  randomState: number,
  scriptCursor: number,
): DeliveryPlan {
  const directive = config.schedule[scriptCursor];
  if (directive === undefined) {
    throw new RangeError('scripted network impairment schedule is exhausted');
  }
  const primaryLatency = directive.latencyMilliseconds + directive.reorderDelayMilliseconds;
  const duplicated = !directive.drop && directive.duplicateDelayMilliseconds !== null;
  const latencies = directive.drop
    ? []
    : [
        primaryLatency,
        ...(directive.duplicateDelayMilliseconds === null
          ? []
          : [primaryLatency + directive.duplicateDelayMilliseconds]),
      ];
  return Object.freeze({
    dropped: directive.drop,
    duplicated,
    reorderImpaired: !directive.drop && directive.reorderDelayMilliseconds > 0,
    latenciesMilliseconds: Object.freeze(latencies),
    nextRandomState: randomState,
    nextScriptCursor: scriptCursor + 1,
  });
}

function deliveryComparator<T>(left: QueuedDelivery<T>, right: QueuedDelivery<T>): number {
  return left.deliveryAtMilliseconds - right.deliveryAtMilliseconds
    || left.scheduleOrder - right.scheduleOrder;
}

function defaultPayloadCloner<T>(payload: T): Readonly<T> {
  return payload;
}

/**
 * Deterministic synthetic one-way transport. It never reads Date,
 * performance, random host state, or timers; callers explicitly advance its
 * monotonic clock through send() and drain(). This is P4.7 test/dev
 * infrastructure, not standalone evidence that multiplayer gate G3 passes.
 */
export class DeterministicNetworkImpairmentHarness<T> {
  public readonly config: ResolvedNetworkImpairmentConfig;

  private readonly payloadCloner: NetworkImpairmentPayloadCloner<T>;
  private readonly queue: QueuedDelivery<T>[] = [];
  private readonly firstDeliveredPackets = new Set<number>();
  private readonly reorderedPackets = new Set<number>();
  private clockMilliseconds: number;
  private randomState: number;
  private scriptCursor = 0;
  private nextPacketOrdinal = 0;
  private nextScheduleOrder = 0;
  private highestFirstDeliveredPacketOrdinal = -1;
  private readonly mutableMetrics: MutableMetrics = {
    sentPackets: 0,
    droppedPackets: 0,
    duplicatedPackets: 0,
    reorderImpairedPackets: 0,
    reorderedPackets: 0,
    scheduledCopies: 0,
    deliveredPackets: 0,
    deliveredCopies: 0,
    overflowRejectedPackets: 0,
    maximumObservedQueueDepth: 0,
    minimumDeliveryLatencyMilliseconds: null,
    maximumDeliveryLatencyMilliseconds: null,
    totalDeliveryLatencyMilliseconds: 0,
  };

  public constructor(
    config: NetworkImpairmentConfig,
    payloadCloner: NetworkImpairmentPayloadCloner<T> = defaultPayloadCloner,
  ) {
    if (typeof payloadCloner !== 'function') {
      throw new TypeError('network impairment payload cloner must be a function');
    }
    this.config = resolveConfig(config);
    this.payloadCloner = payloadCloner;
    this.clockMilliseconds = this.config.startingClockMilliseconds;
    this.randomState = this.config.kind === 'seeded' ? this.config.seed : 0;
  }

  public get currentClockMilliseconds(): number {
    return this.clockMilliseconds;
  }

  public get pendingDeliveryCopies(): number {
    return this.queue.length;
  }

  public get nextDeliveryAtMilliseconds(): number | null {
    return this.queue[0]?.deliveryAtMilliseconds ?? null;
  }

  private assertMonotonicClock(nowMilliseconds: number): void {
    assertTimestamp(nowMilliseconds, 'network impairment clock');
    if (nowMilliseconds < this.clockMilliseconds) {
      throw new RangeError('network impairment clock cannot move backward');
    }
  }

  private planNextSend(): DeliveryPlan {
    return this.config.kind === 'seeded'
      ? seededPlan(this.config, this.randomState, this.scriptCursor)
      : scriptedPlan(this.config, this.randomState, this.scriptCursor);
  }

  public send(payload: T, sentAtMilliseconds: number): NetworkImpairmentSendResult {
    this.assertMonotonicClock(sentAtMilliseconds);
    const plan = this.planNextSend();
    const requiredDepth = this.queue.length + plan.latenciesMilliseconds.length;
    if (requiredDepth > this.config.maximumQueueDepth) {
      this.clockMilliseconds = sentAtMilliseconds;
      this.mutableMetrics.overflowRejectedPackets += 1;
      throw new RangeError('network impairment queue capacity would be exceeded');
    }
    const ownedPayload = this.payloadCloner(payload);
    const packetOrdinal = this.nextPacketOrdinal;
    const deliveryAtMilliseconds = plan.latenciesMilliseconds.map((latency) => (
      checkedTimestampSum(sentAtMilliseconds, latency, 'network impairment delivery time')
    ));

    this.clockMilliseconds = sentAtMilliseconds;
    this.randomState = plan.nextRandomState;
    this.scriptCursor = plan.nextScriptCursor;
    this.nextPacketOrdinal += 1;
    this.mutableMetrics.sentPackets += 1;
    this.mutableMetrics.droppedPackets += Number(plan.dropped);
    this.mutableMetrics.duplicatedPackets += Number(plan.duplicated);
    this.mutableMetrics.reorderImpairedPackets += Number(plan.reorderImpaired);
    this.mutableMetrics.scheduledCopies += deliveryAtMilliseconds.length;
    for (let copyIndex = 0; copyIndex < deliveryAtMilliseconds.length; copyIndex += 1) {
      this.queue.push({
        packetOrdinal,
        copyIndex,
        scheduleOrder: this.nextScheduleOrder,
        sentAtMilliseconds,
        deliveryAtMilliseconds: deliveryAtMilliseconds[copyIndex]!,
        payload: ownedPayload,
      });
      this.nextScheduleOrder += 1;
    }
    this.queue.sort(deliveryComparator);
    this.mutableMetrics.maximumObservedQueueDepth = Math.max(
      this.mutableMetrics.maximumObservedQueueDepth,
      this.queue.length,
    );
    return Object.freeze({
      packetOrdinal,
      sentAtMilliseconds,
      dropped: plan.dropped,
      scheduledCopies: deliveryAtMilliseconds.length,
      deliveryAtMilliseconds: Object.freeze(deliveryAtMilliseconds),
    });
  }

  /** Returns all due copies in stable (delivery time, insertion order) order. */
  public drain(nowMilliseconds: number): readonly NetworkImpairmentDelivery<T>[] {
    this.assertMonotonicClock(nowMilliseconds);
    this.clockMilliseconds = nowMilliseconds;
    let dueCount = 0;
    while (
      dueCount < this.queue.length
      && this.queue[dueCount]!.deliveryAtMilliseconds <= nowMilliseconds
    ) {
      dueCount += 1;
    }
    const due = this.queue.splice(0, dueCount);
    const deliveries = due.map((queued): NetworkImpairmentDelivery<T> => {
      const latencyMilliseconds = queued.deliveryAtMilliseconds - queued.sentAtMilliseconds;
      if (!this.firstDeliveredPackets.has(queued.packetOrdinal)) {
        this.firstDeliveredPackets.add(queued.packetOrdinal);
        this.mutableMetrics.deliveredPackets += 1;
        if (queued.packetOrdinal < this.highestFirstDeliveredPacketOrdinal) {
          this.reorderedPackets.add(queued.packetOrdinal);
          this.mutableMetrics.reorderedPackets = this.reorderedPackets.size;
        } else {
          this.highestFirstDeliveredPacketOrdinal = queued.packetOrdinal;
        }
      }
      this.mutableMetrics.deliveredCopies += 1;
      this.mutableMetrics.minimumDeliveryLatencyMilliseconds = Math.min(
        this.mutableMetrics.minimumDeliveryLatencyMilliseconds ?? latencyMilliseconds,
        latencyMilliseconds,
      );
      this.mutableMetrics.maximumDeliveryLatencyMilliseconds = Math.max(
        this.mutableMetrics.maximumDeliveryLatencyMilliseconds ?? latencyMilliseconds,
        latencyMilliseconds,
      );
      this.mutableMetrics.totalDeliveryLatencyMilliseconds += latencyMilliseconds;
      return Object.freeze({
        packetOrdinal: queued.packetOrdinal,
        copyIndex: queued.copyIndex,
        sentAtMilliseconds: queued.sentAtMilliseconds,
        deliveredAtMilliseconds: queued.deliveryAtMilliseconds,
        latencyMilliseconds,
        payload: queued.payload,
      });
    });
    return Object.freeze(deliveries);
  }

  public metrics(): NetworkImpairmentMetrics {
    const deliveredCopies = this.mutableMetrics.deliveredCopies;
    return Object.freeze({
      ...this.mutableMetrics,
      currentQueueDepth: this.queue.length,
      averageDeliveryLatencyMilliseconds: deliveredCopies === 0
        ? null
        : this.mutableMetrics.totalDeliveryLatencyMilliseconds / deliveredCopies,
    });
  }
}

export function createNetworkImpairmentHarness<T>(
  config: NetworkImpairmentConfig,
  payloadCloner?: NetworkImpairmentPayloadCloner<T>,
): DeterministicNetworkImpairmentHarness<T> {
  return new DeterministicNetworkImpairmentHarness(config, payloadCloner);
}
