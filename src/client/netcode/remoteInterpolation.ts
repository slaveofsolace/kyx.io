const DEFAULT_BUFFER_CAPACITY = 32;
const MAXIMUM_BUFFER_CAPACITY = 4_096;
const DEFAULT_INTERPOLATION_DELAY_TICKS = 2;
const DEFAULT_MAXIMUM_EXTRAPOLATION_TICKS = 2;
const DEFAULT_IMPLICIT_TELEPORT_DISTANCE_MM = 2_000;
const DEFAULT_SIMULATION_RATE_HZ = 20;

export type RemoteSemanticDiscontinuity =
  | 'spawn'
  | 'teleport'
  | 'death'
  | 'respawn'
  | 'resync';

export interface RemoteVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * Transport-independent projection of one remote authority sample. Keeping
 * this seam independent from the evolving wire protocol lets protocol codecs
 * validate and map v2 data without making presentation a wire concern.
 */
export interface RemoteAuthoritativeSample {
  readonly entityId: string;
  readonly serverTick: number;
  /** Monotonic local receipt time, used for metrics only. */
  readonly receivedAtMilliseconds: number;
  readonly feetPosition: RemoteVector3;
  readonly velocity: RemoteVector3;
  readonly yawMilliDegrees: number;
  readonly pitchMilliDegrees: number;
  readonly grounded: boolean;
  readonly stance: 'standing' | 'crouched';
  readonly locomotion: 'grounded' | 'airborne' | 'sliding';
  readonly discontinuity?: RemoteSemanticDiscontinuity;
}

export interface RemoteInterpolationOptions {
  readonly capacity?: number;
  readonly interpolationDelayTicks?: number;
  readonly maximumExtrapolationTicks?: number;
  /**
   * Defensive reset for an impossible one-tick displacement whose semantic
   * marker was lost. Multi-tick gaps require an explicit server marker.
   */
  readonly implicitTeleportDistanceMm?: number;
  readonly simulationRateHz?: number;
}

export interface ResolvedRemoteInterpolationOptions {
  readonly capacity: number;
  readonly interpolationDelayTicks: number;
  readonly maximumExtrapolationTicks: number;
  readonly implicitTeleportDistanceMm: number;
  readonly simulationRateHz: number;
}

export interface RemoteInterpolationMetrics {
  readonly receivedSamples: number;
  readonly acceptedSamples: number;
  readonly duplicateSamples: number;
  readonly conflictingDuplicateSamples: number;
  readonly reorderedSamples: number;
  readonly staleBeforeDiscontinuitySamples: number;
  readonly semanticResets: number;
  readonly implicitTeleportResets: number;
  readonly evictedSamples: number;
  readonly maximumArrivalJitterMilliseconds: number;
  readonly maximumBufferDepth: number;
}

export interface RemoteInterpolationBuffer {
  readonly entityId: string;
  readonly samples: readonly RemoteAuthoritativeSample[];
  readonly resetFloorTick: number;
  readonly latestReceivedAtMilliseconds: number;
  readonly options: ResolvedRemoteInterpolationOptions;
  readonly metrics: RemoteInterpolationMetrics;
}

export type RemoteSampleInsertDisposition =
  | 'accepted'
  | 'accepted_out_of_order'
  | 'duplicate'
  | 'conflicting_duplicate'
  | 'stale_before_discontinuity'
  | 'semantic_discontinuity_reset'
  | 'implicit_teleport_reset';

export interface RemoteSampleInsertResult {
  readonly buffer: RemoteInterpolationBuffer;
  readonly disposition: RemoteSampleInsertDisposition;
  readonly evictedSamples: number;
}

export type RemoteInterpolationMode =
  | 'empty'
  | 'held'
  | 'authoritative'
  | 'interpolated'
  | 'extrapolated'
  | 'stale';

export interface RemoteRenderState {
  readonly entityId: string;
  readonly feetPosition: RemoteVector3;
  readonly velocity: RemoteVector3;
  readonly yawMilliDegrees: number;
  readonly pitchMilliDegrees: number;
  readonly grounded: boolean;
  readonly stance: RemoteAuthoritativeSample['stance'];
  readonly locomotion: RemoteAuthoritativeSample['locomotion'];
  readonly discontinuity?: RemoteSemanticDiscontinuity;
}

export interface RemoteInterpolationResult {
  readonly mode: RemoteInterpolationMode;
  readonly targetServerTick: number;
  readonly lowerServerTick: number | null;
  readonly upperServerTick: number | null;
  readonly interpolationAlpha: number;
  readonly extrapolationTicks: number;
  readonly staleTicks: number;
  readonly renderState: RemoteRenderState | null;
}

const EMPTY_METRICS: RemoteInterpolationMetrics = Object.freeze({
  receivedSamples: 0,
  acceptedSamples: 0,
  duplicateSamples: 0,
  conflictingDuplicateSamples: 0,
  reorderedSamples: 0,
  staleBeforeDiscontinuitySamples: 0,
  semanticResets: 0,
  implicitTeleportResets: 0,
  evictedSamples: 0,
  maximumArrivalJitterMilliseconds: 0,
  maximumBufferDepth: 0,
});

function assertInteger(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
}

function assertFinite(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be finite and between ${minimum} and ${maximum}`);
  }
}

function assertEntityId(value: string): void {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 64
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)
    || value === '__proto__'
    || value === 'prototype'
    || value === 'constructor'
  ) {
    throw new RangeError('remote entity ID must be a safe 1-64 character identifier');
  }
}

function resolveOptions(
  options: RemoteInterpolationOptions,
): ResolvedRemoteInterpolationOptions {
  const capacity = options.capacity ?? DEFAULT_BUFFER_CAPACITY;
  const interpolationDelayTicks = options.interpolationDelayTicks
    ?? DEFAULT_INTERPOLATION_DELAY_TICKS;
  const maximumExtrapolationTicks = options.maximumExtrapolationTicks
    ?? DEFAULT_MAXIMUM_EXTRAPOLATION_TICKS;
  const implicitTeleportDistanceMm = options.implicitTeleportDistanceMm
    ?? DEFAULT_IMPLICIT_TELEPORT_DISTANCE_MM;
  const simulationRateHz = options.simulationRateHz ?? DEFAULT_SIMULATION_RATE_HZ;
  assertInteger(capacity, 2, MAXIMUM_BUFFER_CAPACITY, 'remote buffer capacity');
  assertInteger(interpolationDelayTicks, 0, 1_000, 'remote interpolation delay');
  assertInteger(maximumExtrapolationTicks, 0, 1_000, 'remote extrapolation limit');
  assertInteger(
    implicitTeleportDistanceMm,
    1,
    1_000_000_000,
    'remote implicit teleport distance',
  );
  assertInteger(simulationRateHz, 1, 1_000, 'remote simulation rate');
  return Object.freeze({
    capacity,
    interpolationDelayTicks,
    maximumExtrapolationTicks,
    implicitTeleportDistanceMm,
    simulationRateHz,
  });
}

function cloneVector(vector: RemoteVector3): RemoteVector3 {
  return Object.freeze({ x: vector.x, y: vector.y, z: vector.z });
}

function validateAndCloneSample(sample: RemoteAuthoritativeSample): RemoteAuthoritativeSample {
  if (sample === null || typeof sample !== 'object' || Array.isArray(sample)) {
    throw new TypeError('remote authority sample must be an object');
  }
  assertEntityId(sample.entityId);
  assertInteger(sample.serverTick, 0, Number.MAX_SAFE_INTEGER, 'remote server tick');
  assertFinite(
    sample.receivedAtMilliseconds,
    0,
    Number.MAX_SAFE_INTEGER,
    'remote receipt time',
  );
  for (const [label, vector] of [
    ['remote feet position', sample.feetPosition],
    ['remote velocity', sample.velocity],
  ] as const) {
    if (vector === null || typeof vector !== 'object' || Array.isArray(vector)) {
      throw new TypeError(`${label} must be an object`);
    }
    for (const axis of ['x', 'y', 'z'] as const) {
      assertInteger(vector[axis], -1_000_000_000, 1_000_000_000, `${label}.${axis}`);
    }
  }
  assertInteger(sample.yawMilliDegrees, 0, 359_999, 'remote yaw');
  assertInteger(sample.pitchMilliDegrees, -89_000, 89_000, 'remote pitch');
  if (typeof sample.grounded !== 'boolean') {
    throw new TypeError('remote grounded state must be a boolean');
  }
  if (sample.stance !== 'standing' && sample.stance !== 'crouched') {
    throw new RangeError('remote stance is unsupported');
  }
  if (
    sample.locomotion !== 'grounded'
    && sample.locomotion !== 'airborne'
    && sample.locomotion !== 'sliding'
  ) {
    throw new RangeError('remote locomotion is unsupported');
  }
  if (sample.grounded === (sample.locomotion === 'airborne')) {
    throw new RangeError('remote grounded and locomotion states disagree');
  }
  if (sample.locomotion === 'sliding' && sample.stance !== 'crouched') {
    throw new RangeError('remote sliding state must be crouched');
  }
  if (
    sample.discontinuity !== undefined
    && sample.discontinuity !== 'spawn'
    && sample.discontinuity !== 'teleport'
    && sample.discontinuity !== 'death'
    && sample.discontinuity !== 'respawn'
    && sample.discontinuity !== 'resync'
  ) {
    throw new RangeError('remote semantic discontinuity is unsupported');
  }
  return Object.freeze({
    entityId: sample.entityId,
    serverTick: sample.serverTick,
    receivedAtMilliseconds: sample.receivedAtMilliseconds,
    feetPosition: cloneVector(sample.feetPosition),
    velocity: cloneVector(sample.velocity),
    yawMilliDegrees: sample.yawMilliDegrees,
    pitchMilliDegrees: sample.pitchMilliDegrees,
    grounded: sample.grounded,
    stance: sample.stance,
    locomotion: sample.locomotion,
    ...(sample.discontinuity === undefined
      ? {}
      : { discontinuity: sample.discontinuity }),
  });
}

function samplesEqual(
  left: RemoteAuthoritativeSample,
  right: RemoteAuthoritativeSample,
): boolean {
  return left.entityId === right.entityId
    && left.serverTick === right.serverTick
    && left.feetPosition.x === right.feetPosition.x
    && left.feetPosition.y === right.feetPosition.y
    && left.feetPosition.z === right.feetPosition.z
    && left.velocity.x === right.velocity.x
    && left.velocity.y === right.velocity.y
    && left.velocity.z === right.velocity.z
    && left.yawMilliDegrees === right.yawMilliDegrees
    && left.pitchMilliDegrees === right.pitchMilliDegrees
    && left.grounded === right.grounded
    && left.stance === right.stance
    && left.locomotion === right.locomotion
    && left.discontinuity === right.discontinuity;
}

function distanceMm(left: RemoteVector3, right: RemoteVector3): number {
  return Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);
}

function freezeBuffer(
  buffer: Omit<RemoteInterpolationBuffer, 'samples' | 'metrics'> & {
    readonly samples: readonly RemoteAuthoritativeSample[];
    readonly metrics: RemoteInterpolationMetrics;
  },
): RemoteInterpolationBuffer {
  return Object.freeze({
    ...buffer,
    samples: Object.freeze([...buffer.samples]),
    metrics: Object.freeze({ ...buffer.metrics }),
  });
}

export function createRemoteInterpolationBuffer(
  entityId: string,
  options: RemoteInterpolationOptions = {},
): RemoteInterpolationBuffer {
  assertEntityId(entityId);
  return freezeBuffer({
    entityId,
    samples: [],
    resetFloorTick: -1,
    latestReceivedAtMilliseconds: -1,
    options: resolveOptions(options),
    metrics: EMPTY_METRICS,
  });
}

function withReceiptMetrics(
  buffer: RemoteInterpolationBuffer,
  sample: RemoteAuthoritativeSample,
): RemoteInterpolationMetrics {
  if (sample.receivedAtMilliseconds < buffer.latestReceivedAtMilliseconds) {
    throw new RangeError('remote receipt time cannot move backward');
  }
  return {
    ...buffer.metrics,
    receivedSamples: buffer.metrics.receivedSamples + 1,
  };
}

function resultWithMetrics(
  buffer: RemoteInterpolationBuffer,
  sample: RemoteAuthoritativeSample,
  samples: readonly RemoteAuthoritativeSample[],
  resetFloorTick: number,
  metrics: RemoteInterpolationMetrics,
  disposition: RemoteSampleInsertDisposition,
  evictedSamples: number,
): RemoteSampleInsertResult {
  return Object.freeze({
    buffer: freezeBuffer({
      ...buffer,
      samples,
      resetFloorTick,
      latestReceivedAtMilliseconds: sample.receivedAtMilliseconds,
      metrics: {
        ...metrics,
        maximumBufferDepth: Math.max(metrics.maximumBufferDepth, samples.length),
      },
    }),
    disposition,
    evictedSamples,
  });
}

/** Inserts by server tick; packet arrival order never becomes presentation order. */
export function insertRemoteAuthoritativeSample(
  buffer: RemoteInterpolationBuffer,
  input: RemoteAuthoritativeSample,
): RemoteSampleInsertResult {
  const sample = validateAndCloneSample(input);
  if (sample.entityId !== buffer.entityId) {
    throw new RangeError('remote sample entity does not match its interpolation buffer');
  }
  let metrics = withReceiptMetrics(buffer, sample);
  if (sample.serverTick < buffer.resetFloorTick) {
    metrics = {
      ...metrics,
      staleBeforeDiscontinuitySamples: metrics.staleBeforeDiscontinuitySamples + 1,
    };
    return resultWithMetrics(
      buffer,
      sample,
      buffer.samples,
      buffer.resetFloorTick,
      metrics,
      'stale_before_discontinuity',
      0,
    );
  }

  const sameTick = buffer.samples.find((candidate) => (
    candidate.serverTick === sample.serverTick
  ));
  if (sameTick !== undefined && sample.discontinuity === undefined) {
    if (samplesEqual(sameTick, sample)) {
      metrics = { ...metrics, duplicateSamples: metrics.duplicateSamples + 1 };
      return resultWithMetrics(
        buffer,
        sample,
        buffer.samples,
        buffer.resetFloorTick,
        metrics,
        'duplicate',
        0,
      );
    }
    metrics = {
      ...metrics,
      conflictingDuplicateSamples: metrics.conflictingDuplicateSamples + 1,
    };
    return resultWithMetrics(
      buffer,
      sample,
      buffer.samples,
      buffer.resetFloorTick,
      metrics,
      'conflicting_duplicate',
      0,
    );
  }

  if (sample.discontinuity !== undefined) {
    const following = buffer.samples.filter((candidate) => candidate.serverTick > sample.serverTick);
    let samples = [sample, ...following];
    const evictedSamples = Math.max(0, samples.length - buffer.options.capacity);
    if (evictedSamples > 0) samples = samples.slice(evictedSamples);
    metrics = {
      ...metrics,
      acceptedSamples: metrics.acceptedSamples + 1,
      semanticResets: metrics.semanticResets + 1,
      evictedSamples: metrics.evictedSamples + evictedSamples,
    };
    return resultWithMetrics(
      buffer,
      sample,
      samples,
      Math.max(buffer.resetFloorTick, sample.serverTick),
      metrics,
      'semantic_discontinuity_reset',
      evictedSamples,
    );
  }

  const latest = buffer.samples.at(-1);
  const isNewLatest = latest === undefined || sample.serverTick > latest.serverTick;
  if (
    latest !== undefined
    && sample.serverTick === latest.serverTick + 1
    && distanceMm(latest.feetPosition, sample.feetPosition)
      >= buffer.options.implicitTeleportDistanceMm
  ) {
    metrics = {
      ...metrics,
      acceptedSamples: metrics.acceptedSamples + 1,
      implicitTeleportResets: metrics.implicitTeleportResets + 1,
    };
    return resultWithMetrics(
      buffer,
      sample,
      [sample],
      sample.serverTick,
      metrics,
      'implicit_teleport_reset',
      0,
    );
  }

  let maximumArrivalJitterMilliseconds = metrics.maximumArrivalJitterMilliseconds;
  if (latest !== undefined && isNewLatest) {
    const tickDelta = sample.serverTick - latest.serverTick;
    const expectedSpacing = (tickDelta * 1_000) / buffer.options.simulationRateHz;
    const actualSpacing = sample.receivedAtMilliseconds - latest.receivedAtMilliseconds;
    maximumArrivalJitterMilliseconds = Math.max(
      maximumArrivalJitterMilliseconds,
      Math.abs(actualSpacing - expectedSpacing),
    );
  }

  let samples = [...buffer.samples, sample].sort((left, right) => (
    left.serverTick - right.serverTick
  ));
  const evictedSamples = Math.max(0, samples.length - buffer.options.capacity);
  if (evictedSamples > 0) samples = samples.slice(evictedSamples);
  const outOfOrder = !isNewLatest;
  metrics = {
    ...metrics,
    acceptedSamples: metrics.acceptedSamples + 1,
    reorderedSamples: metrics.reorderedSamples + Number(outOfOrder),
    evictedSamples: metrics.evictedSamples + evictedSamples,
    maximumArrivalJitterMilliseconds,
  };
  return resultWithMetrics(
    buffer,
    sample,
    samples,
    buffer.resetFloorTick,
    metrics,
    outOfOrder ? 'accepted_out_of_order' : 'accepted',
    evictedSamples,
  );
}

function lerp(left: number, right: number, alpha: number): number {
  return left + (right - left) * alpha;
}

function lerpVector(left: RemoteVector3, right: RemoteVector3, alpha: number): RemoteVector3 {
  return Object.freeze({
    x: lerp(left.x, right.x, alpha),
    y: lerp(left.y, right.y, alpha),
    z: lerp(left.z, right.z, alpha),
  });
}

function lerpYaw(left: number, right: number, alpha: number): number {
  const signedDelta = ((right - left + 540_000) % 360_000) - 180_000;
  return (left + signedDelta * alpha + 360_000) % 360_000;
}

function renderFromAuthoritative(sample: RemoteAuthoritativeSample): RemoteRenderState {
  return Object.freeze({
    entityId: sample.entityId,
    feetPosition: cloneVector(sample.feetPosition),
    velocity: cloneVector(sample.velocity),
    yawMilliDegrees: sample.yawMilliDegrees,
    pitchMilliDegrees: sample.pitchMilliDegrees,
    grounded: sample.grounded,
    stance: sample.stance,
    locomotion: sample.locomotion,
    ...(sample.discontinuity === undefined
      ? {}
      : { discontinuity: sample.discontinuity }),
  });
}

function freezeInterpolationResult(
  result: RemoteInterpolationResult,
): RemoteInterpolationResult {
  return Object.freeze(result);
}

/**
 * Returns a presentation-only pose for an explicit server-clock target. The
 * caller owns server-clock synchronization; receipt timestamps never select a
 * pose and therefore packet jitter cannot directly animate the entity.
 */
export function sampleRemoteInterpolation(
  buffer: RemoteInterpolationBuffer,
  targetServerTick: number,
): RemoteInterpolationResult {
  assertFinite(targetServerTick, 0, Number.MAX_SAFE_INTEGER, 'remote render target tick');
  const first = buffer.samples[0];
  if (first === undefined) {
    return freezeInterpolationResult({
      mode: 'empty',
      targetServerTick,
      lowerServerTick: null,
      upperServerTick: null,
      interpolationAlpha: 0,
      extrapolationTicks: 0,
      staleTicks: 0,
      renderState: null,
    });
  }
  if (targetServerTick < first.serverTick) {
    return freezeInterpolationResult({
      mode: 'held',
      targetServerTick,
      lowerServerTick: first.serverTick,
      upperServerTick: first.serverTick,
      interpolationAlpha: 0,
      extrapolationTicks: 0,
      staleTicks: 0,
      renderState: renderFromAuthoritative(first),
    });
  }

  const exact = buffer.samples.find((sample) => sample.serverTick === targetServerTick);
  if (exact !== undefined) {
    return freezeInterpolationResult({
      mode: 'authoritative',
      targetServerTick,
      lowerServerTick: exact.serverTick,
      upperServerTick: exact.serverTick,
      interpolationAlpha: 0,
      extrapolationTicks: 0,
      staleTicks: 0,
      renderState: renderFromAuthoritative(exact),
    });
  }

  const upperIndex = buffer.samples.findIndex((sample) => sample.serverTick > targetServerTick);
  if (upperIndex > 0) {
    const lower = buffer.samples[upperIndex - 1]!;
    const upper = buffer.samples[upperIndex]!;
    const alpha = (targetServerTick - lower.serverTick)
      / (upper.serverTick - lower.serverTick);
    return freezeInterpolationResult({
      mode: 'interpolated',
      targetServerTick,
      lowerServerTick: lower.serverTick,
      upperServerTick: upper.serverTick,
      interpolationAlpha: alpha,
      extrapolationTicks: 0,
      staleTicks: 0,
      renderState: Object.freeze({
        entityId: buffer.entityId,
        feetPosition: lerpVector(lower.feetPosition, upper.feetPosition, alpha),
        velocity: lerpVector(lower.velocity, upper.velocity, alpha),
        yawMilliDegrees: lerpYaw(lower.yawMilliDegrees, upper.yawMilliDegrees, alpha),
        pitchMilliDegrees: lerp(
          lower.pitchMilliDegrees,
          upper.pitchMilliDegrees,
          alpha,
        ),
        grounded: lower.grounded,
        stance: lower.stance,
        locomotion: lower.locomotion,
      }),
    });
  }

  const latest = buffer.samples.at(-1)!;
  const requestedExtrapolationTicks = targetServerTick - latest.serverTick;
  const extrapolationTicks = Math.min(
    requestedExtrapolationTicks,
    buffer.options.maximumExtrapolationTicks,
  );
  const elapsedSeconds = extrapolationTicks / buffer.options.simulationRateHz;
  const renderState: RemoteRenderState = Object.freeze({
    ...renderFromAuthoritative(latest),
    feetPosition: Object.freeze({
      x: latest.feetPosition.x + latest.velocity.x * elapsedSeconds,
      y: latest.feetPosition.y + latest.velocity.y * elapsedSeconds,
      z: latest.feetPosition.z + latest.velocity.z * elapsedSeconds,
    }),
  });
  const staleTicks = Math.max(
    0,
    requestedExtrapolationTicks - buffer.options.maximumExtrapolationTicks,
  );
  return freezeInterpolationResult({
    mode: staleTicks > 0 ? 'stale' : 'extrapolated',
    targetServerTick,
    lowerServerTick: latest.serverTick,
    upperServerTick: null,
    interpolationAlpha: 0,
    extrapolationTicks,
    staleTicks,
    renderState,
  });
}

/** Selects the delayed target from a synchronized authority clock. */
export function delayedRemoteRenderTick(
  buffer: RemoteInterpolationBuffer,
  estimatedAuthorityTick: number,
): number {
  assertFinite(
    estimatedAuthorityTick,
    0,
    Number.MAX_SAFE_INTEGER,
    'estimated remote authority tick',
  );
  return Math.max(0, estimatedAuthorityTick - buffer.options.interpolationDelayTicks);
}
