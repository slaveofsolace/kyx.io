import {
  assertMovementProfile,
  assertMovementSimulationState,
  assertPlayerIntentCommand,
  hashCanonicalMovementState,
  stepMovementSimulation,
  type MovementProfileV1,
  type MovementQueryPort,
  type MovementSimulationState,
  type MovementStepResult,
  type PlayerIntentCommand,
} from '../../sim';

const DEFAULT_MAXIMUM_HISTORY_COMMANDS = 256;
const MAXIMUM_SUPPORTED_HISTORY_COMMANDS = 4_096;
// ADR-005's initial routine-correction hypothesis is below 15% of the
// accepted 350 mm body radius (52.5 mm). Integer millimetres deliberately
// round down so the presentation seam cannot quietly widen that envelope.
const DEFAULT_SOFT_CORRECTION_DISTANCE_MM = 52;
const DEFAULT_HARD_SNAP_DISTANCE_MM = 2_000;

export interface LocalPredictionOptions {
  /** Maximum unacknowledged commands retained for deterministic replay. */
  readonly maximumHistoryCommands?: number;
  /** Corrections at or below this distance can be hidden by presentation smoothing. */
  readonly softCorrectionDistanceMm?: number;
  /** Corrections at or above this distance must snap presentation immediately. */
  readonly hardSnapDistanceMm?: number;
}

export interface ResolvedLocalPredictionOptions {
  readonly maximumHistoryCommands: number;
  readonly softCorrectionDistanceMm: number;
  readonly hardSnapDistanceMm: number;
}

/**
 * A complete, exact local-player authority state is the protocol integration
 * seam. Position-only snapshots are intentionally insufficient: replay needs
 * movement timers, support, remainders, intent edges, and identity as well.
 */
export interface AuthoritativeLocalMovementSnapshot {
  readonly state: MovementSimulationState;
  readonly discontinuity?: 'teleport' | 'respawn';
}

export interface LocalPredictionFrame {
  readonly clientTick: number;
  readonly predictedSimulationTick: number;
  readonly commands: readonly Readonly<PlayerIntentCommand>[];
}

export interface LocalPredictionMetrics {
  readonly predictedTicks: number;
  readonly predictedCommands: number;
  readonly reconciliationCount: number;
  readonly confirmedReconciliations: number;
  readonly subthresholdCorrections: number;
  readonly softCorrections: number;
  readonly hardSnaps: number;
  readonly teleportSnaps: number;
  readonly historyGapSnaps: number;
  readonly staleSnapshots: number;
  readonly replayedTicks: number;
  readonly replayedCommands: number;
  readonly evictedHistoryFrames: number;
  readonly evictedHistoryCommands: number;
  readonly maximumPositionErrorMm: number;
}

export interface LocalPredictionState {
  readonly predictedState: MovementSimulationState;
  readonly history: readonly LocalPredictionFrame[];
  readonly historyCommandCount: number;
  /** Highest sequence evicted before acknowledgement, or the latest ack. */
  readonly historyFloorSequence: number;
  readonly lastAcknowledgedSequence: number;
  readonly lastAuthoritativeTick: number;
  readonly lastPredictedClientTick: number;
  readonly options: ResolvedLocalPredictionOptions;
  readonly metrics: LocalPredictionMetrics;
}

export interface LocalPredictionStepResult {
  readonly prediction: LocalPredictionState;
  readonly simulation: MovementStepResult;
  readonly evictedFrames: number;
  readonly evictedCommands: number;
}

export type LocalReconciliationMode =
  | 'stale_snapshot'
  | 'confirmed'
  | 'subthreshold_correction'
  | 'soft_correction'
  | 'hard_snap'
  | 'teleport_snap'
  | 'history_gap_snap';

export interface LocalReconciliationResult {
  readonly prediction: LocalPredictionState;
  readonly mode: LocalReconciliationMode;
  readonly acknowledgedSequence: number;
  readonly authoritativeTick: number;
  readonly replayedTicks: number;
  readonly replayedCommands: number;
  readonly positionErrorMm: number;
  readonly orientationErrorMilliDegrees: number;
  readonly previousPredictedHash: string;
  readonly reconciledPredictedHash: string;
  /** A history gap requires the input latch to restart after the authority ack. */
  readonly requiresInputStreamReset: boolean;
}

const EMPTY_METRICS: LocalPredictionMetrics = Object.freeze({
  predictedTicks: 0,
  predictedCommands: 0,
  reconciliationCount: 0,
  confirmedReconciliations: 0,
  subthresholdCorrections: 0,
  softCorrections: 0,
  hardSnaps: 0,
  teleportSnaps: 0,
  historyGapSnaps: 0,
  staleSnapshots: 0,
  replayedTicks: 0,
  replayedCommands: 0,
  evictedHistoryFrames: 0,
  evictedHistoryCommands: 0,
  maximumPositionErrorMm: 0,
});

function assertBoundedInteger(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
}

function resolveOptions(options: LocalPredictionOptions): ResolvedLocalPredictionOptions {
  const maximumHistoryCommands =
    options.maximumHistoryCommands ?? DEFAULT_MAXIMUM_HISTORY_COMMANDS;
  const softCorrectionDistanceMm =
    options.softCorrectionDistanceMm ?? DEFAULT_SOFT_CORRECTION_DISTANCE_MM;
  const hardSnapDistanceMm =
    options.hardSnapDistanceMm ?? DEFAULT_HARD_SNAP_DISTANCE_MM;
  assertBoundedInteger(
    maximumHistoryCommands,
    1,
    MAXIMUM_SUPPORTED_HISTORY_COMMANDS,
    'maximum prediction history commands',
  );
  assertBoundedInteger(
    softCorrectionDistanceMm,
    0,
    1_000_000,
    'soft correction distance',
  );
  assertBoundedInteger(
    hardSnapDistanceMm,
    1,
    1_000_000,
    'hard snap distance',
  );
  if (softCorrectionDistanceMm >= hardSnapDistanceMm) {
    throw new RangeError('soft correction distance must be lower than hard snap distance');
  }
  return Object.freeze({
    maximumHistoryCommands,
    softCorrectionDistanceMm,
    hardSnapDistanceMm,
  });
}

function cloneCommand(command: PlayerIntentCommand): Readonly<PlayerIntentCommand> {
  const clone: PlayerIntentCommand = {
    kind: 'player_intent',
    sequence: command.sequence,
    clientTick: command.clientTick,
    moveX: command.moveX,
    moveZ: command.moveZ,
    lookYawDeltaMilliDegrees: command.lookYawDeltaMilliDegrees,
    lookPitchDeltaMilliDegrees: command.lookPitchDeltaMilliDegrees,
    heldButtons: command.heldButtons,
    pressedButtons: command.pressedButtons,
    releasedButtons: command.releasedButtons,
    ...(command.selectedSlot === undefined ? {} : { selectedSlot: command.selectedSlot }),
  };
  return Object.freeze(clone);
}

/**
 * Prediction owns its canonical states. Detaching here prevents a render or
 * transport adapter from mutating retained authority/replay history through a
 * shared object reference.
 */
function cloneAndFreezeMovementState(
  state: MovementSimulationState,
): MovementSimulationState {
  const support = state.player.support === null
    ? null
    : Object.freeze({
        ...state.player.support,
        normalQ15: Object.freeze({ ...state.player.support.normalQ15 }),
        velocity: Object.freeze({ ...state.player.support.velocity }),
      });
  const activeVolumes = Object.freeze(state.player.activeVolumes.map((volume) => (
    Object.freeze({ ...volume })
  )));
  return Object.freeze({
    ...state,
    identity: Object.freeze({ ...state.identity }),
    player: Object.freeze({
      ...state.player,
      feetPosition: Object.freeze({ ...state.player.feetPosition }),
      velocity: Object.freeze({ ...state.player.velocity }),
      integrationRemainders: Object.freeze({ ...state.player.integrationRemainders }),
      intent: Object.freeze({ ...state.player.intent }),
      support,
      activeVolumes,
    }),
  });
}

function orderAndValidateCommands(
  prediction: LocalPredictionState,
  commands: readonly PlayerIntentCommand[],
): readonly Readonly<PlayerIntentCommand>[] {
  if (!Array.isArray(commands) || commands.length < 1) {
    throw new RangeError('each predicted movement tick requires at least one input command');
  }
  if (commands.length > prediction.options.maximumHistoryCommands) {
    throw new RangeError('one predicted command group cannot exceed the complete history capacity');
  }
  const ordered = [...commands].sort((left, right) => left.sequence - right.sequence);
  const clientTick = ordered[0]?.clientTick;
  if (clientTick === undefined) throw new RangeError('predicted command group is empty');
  if (clientTick <= prediction.lastPredictedClientTick) {
    throw new RangeError('predicted client ticks must increase between simulation ticks');
  }
  let expectedSequence = prediction.predictedState.player.lastProcessedSequence + 1;
  for (const command of ordered) {
    assertPlayerIntentCommand(command);
    if (command.clientTick !== clientTick) {
      throw new RangeError('commands in one predicted simulation tick must share a client tick');
    }
    if (command.sequence !== expectedSequence) {
      throw new RangeError(`predicted input sequence must be contiguous at ${expectedSequence}`);
    }
    expectedSequence += 1;
  }
  return Object.freeze(ordered.map(cloneCommand));
}

function movementIdentityEquals(
  left: MovementSimulationState,
  right: MovementSimulationState,
): boolean {
  const a = left.identity;
  const b = right.identity;
  return left.simulationRateHz === right.simulationRateHz
    && a.rulesetId === b.rulesetId
    && a.rulesetRevision === b.rulesetRevision
    && a.rulesetHash === b.rulesetHash
    && a.movementProfileId === b.movementProfileId
    && a.movementProfileRevision === b.movementProfileRevision
    && a.movementProfileHash === b.movementProfileHash
    && a.fixtureId === b.fixtureId
    && a.fixtureHash === b.fixtureHash
    && a.physicsAdapterId === b.physicsAdapterId
    && a.physicsAdapterVersion === b.physicsAdapterVersion;
}

function spatialErrorMm(
  left: MovementSimulationState,
  right: MovementSimulationState,
): number {
  const dx = left.player.feetPosition.x - right.player.feetPosition.x;
  const dy = left.player.feetPosition.y - right.player.feetPosition.y;
  const dz = left.player.feetPosition.z - right.player.feetPosition.z;
  return Math.round(Math.hypot(dx, dy, dz));
}

function orientationErrorMilliDegrees(
  left: MovementSimulationState,
  right: MovementSimulationState,
): number {
  const yawDelta = Math.abs(left.player.yawMilliDegrees - right.player.yawMilliDegrees);
  const shortestYaw = Math.min(yawDelta, 360_000 - yawDelta);
  return Math.max(
    shortestYaw,
    Math.abs(left.player.pitchMilliDegrees - right.player.pitchMilliDegrees),
  );
}

function freezeHistory(history: LocalPredictionFrame[]): readonly LocalPredictionFrame[] {
  return Object.freeze(history.map((frame) => Object.freeze({
    clientTick: frame.clientTick,
    predictedSimulationTick: frame.predictedSimulationTick,
    commands: Object.freeze([...frame.commands]),
  })));
}

export function createLocalPrediction(
  initialState: MovementSimulationState,
  profile: MovementProfileV1,
  options: LocalPredictionOptions = {},
): LocalPredictionState {
  assertMovementProfile(profile);
  assertMovementSimulationState(initialState, profile);
  const ownedInitialState = cloneAndFreezeMovementState(initialState);
  return Object.freeze({
    predictedState: ownedInitialState,
    history: Object.freeze([]),
    historyCommandCount: 0,
    historyFloorSequence: ownedInitialState.player.lastProcessedSequence,
    lastAcknowledgedSequence: ownedInitialState.player.lastProcessedSequence,
    lastAuthoritativeTick: -1,
    lastPredictedClientTick: -1,
    options: resolveOptions(options),
    metrics: EMPTY_METRICS,
  });
}

/**
 * Advances exactly one deterministic client tick. Multiple commands are sorted
 * by sequence and stepped together, preserving fast press/release edges that
 * share one client tick.
 */
export function predictLocalMovementTick(
  prediction: LocalPredictionState,
  commands: readonly PlayerIntentCommand[],
  profile: MovementProfileV1,
  queries: MovementQueryPort,
): LocalPredictionStepResult {
  assertMovementProfile(profile);
  assertMovementSimulationState(prediction.predictedState, profile);
  const ordered = orderAndValidateCommands(prediction, commands);
  const simulation = stepMovementSimulation(
    prediction.predictedState,
    ordered,
    profile,
    queries,
  );
  const ownedPredictedState = cloneAndFreezeMovementState(simulation.state);
  const history = [...prediction.history, {
    clientTick: ordered[0]!.clientTick,
    predictedSimulationTick: ownedPredictedState.tick,
    commands: ordered,
  }];
  let historyCommandCount = prediction.historyCommandCount + ordered.length;
  let historyFloorSequence = prediction.historyFloorSequence;
  let evictedFrames = 0;
  let evictedCommands = 0;
  while (historyCommandCount > prediction.options.maximumHistoryCommands) {
    const evicted = history.shift();
    if (!evicted) break;
    evictedFrames += 1;
    evictedCommands += evicted.commands.length;
    historyCommandCount -= evicted.commands.length;
    historyFloorSequence = evicted.commands[evicted.commands.length - 1]!.sequence;
  }
  const metrics: LocalPredictionMetrics = Object.freeze({
    ...prediction.metrics,
    predictedTicks: prediction.metrics.predictedTicks + 1,
    predictedCommands: prediction.metrics.predictedCommands + ordered.length,
    evictedHistoryFrames: prediction.metrics.evictedHistoryFrames + evictedFrames,
    evictedHistoryCommands: prediction.metrics.evictedHistoryCommands + evictedCommands,
  });
  return Object.freeze({
    prediction: Object.freeze({
      ...prediction,
      predictedState: ownedPredictedState,
      history: freezeHistory(history),
      historyCommandCount,
      historyFloorSequence,
      lastPredictedClientTick: ordered[0]!.clientTick,
      metrics,
    }),
    simulation,
    evictedFrames,
    evictedCommands,
  });
}

function reconciliationMode(
  previousHash: string,
  nextHash: string,
  positionErrorMm: number,
  snapshot: AuthoritativeLocalMovementSnapshot,
  options: ResolvedLocalPredictionOptions,
): Exclude<LocalReconciliationMode, 'stale_snapshot' | 'history_gap_snap'> {
  if (snapshot.discontinuity !== undefined) return 'teleport_snap';
  if (previousHash === nextHash) return 'confirmed';
  if (positionErrorMm <= options.softCorrectionDistanceMm) {
    return 'subthreshold_correction';
  }
  if (positionErrorMm >= options.hardSnapDistanceMm) return 'hard_snap';
  return 'soft_correction';
}

function incrementReconciliationMetric(
  metrics: LocalPredictionMetrics,
  mode: Exclude<LocalReconciliationMode, 'stale_snapshot'>,
  replayedTicks: number,
  replayedCommands: number,
  positionErrorMm: number,
): LocalPredictionMetrics {
  return Object.freeze({
    ...metrics,
    reconciliationCount: metrics.reconciliationCount + 1,
    confirmedReconciliations:
      metrics.confirmedReconciliations + Number(mode === 'confirmed'),
    subthresholdCorrections:
      metrics.subthresholdCorrections + Number(mode === 'subthreshold_correction'),
    softCorrections: metrics.softCorrections + Number(mode === 'soft_correction'),
    hardSnaps: metrics.hardSnaps + Number(mode === 'hard_snap'),
    teleportSnaps: metrics.teleportSnaps + Number(mode === 'teleport_snap'),
    historyGapSnaps: metrics.historyGapSnaps + Number(mode === 'history_gap_snap'),
    replayedTicks: metrics.replayedTicks + replayedTicks,
    replayedCommands: metrics.replayedCommands + replayedCommands,
    maximumPositionErrorMm: Math.max(metrics.maximumPositionErrorMm, positionErrorMm),
  });
}

/**
 * Replaces prediction with an exact authority state and deterministically
 * replays every unacknowledged command group in original client-tick order.
 * The query port must expose collision state aligned with the replayed ticks.
 */
export function reconcileLocalMovement(
  prediction: LocalPredictionState,
  snapshot: AuthoritativeLocalMovementSnapshot,
  profile: MovementProfileV1,
  queries: MovementQueryPort,
): LocalReconciliationResult {
  assertMovementProfile(profile);
  assertMovementSimulationState(prediction.predictedState, profile);
  assertMovementSimulationState(snapshot.state, profile);
  const authoritativeState = cloneAndFreezeMovementState(snapshot.state);
  if (!movementIdentityEquals(prediction.predictedState, authoritativeState)) {
    throw new RangeError('authoritative movement identity does not match client prediction');
  }
  const acknowledgedSequence = authoritativeState.player.lastProcessedSequence;
  if (acknowledgedSequence > prediction.predictedState.player.lastProcessedSequence) {
    throw new RangeError('authority acknowledged an input sequence the client has not predicted');
  }
  const previousPredictedHash = hashCanonicalMovementState(prediction.predictedState);
  const isStale = authoritativeState.tick <= prediction.lastAuthoritativeTick
    || acknowledgedSequence < prediction.lastAcknowledgedSequence;
  if (isStale) {
    const metrics: LocalPredictionMetrics = Object.freeze({
      ...prediction.metrics,
      staleSnapshots: prediction.metrics.staleSnapshots + 1,
    });
    const stalePrediction = Object.freeze({ ...prediction, metrics });
    return Object.freeze({
      prediction: stalePrediction,
      mode: 'stale_snapshot',
      acknowledgedSequence,
      authoritativeTick: authoritativeState.tick,
      replayedTicks: 0,
      replayedCommands: 0,
      positionErrorMm: 0,
      orientationErrorMilliDegrees: 0,
      previousPredictedHash,
      reconciledPredictedHash: previousPredictedHash,
      requiresInputStreamReset: false,
    });
  }

  if (acknowledgedSequence < prediction.historyFloorSequence) {
    const positionError = spatialErrorMm(prediction.predictedState, authoritativeState);
    const nextHash = hashCanonicalMovementState(authoritativeState);
    const metrics = incrementReconciliationMetric(
      prediction.metrics,
      'history_gap_snap',
      0,
      0,
      positionError,
    );
    const nextPrediction: LocalPredictionState = Object.freeze({
      ...prediction,
      predictedState: authoritativeState,
      history: Object.freeze([]),
      historyCommandCount: 0,
      historyFloorSequence: acknowledgedSequence,
      lastAcknowledgedSequence: acknowledgedSequence,
      lastAuthoritativeTick: authoritativeState.tick,
      lastPredictedClientTick: -1,
      metrics,
    });
    return Object.freeze({
      prediction: nextPrediction,
      mode: 'history_gap_snap',
      acknowledgedSequence,
      authoritativeTick: authoritativeState.tick,
      replayedTicks: 0,
      replayedCommands: 0,
      positionErrorMm: positionError,
      orientationErrorMilliDegrees: orientationErrorMilliDegrees(
        prediction.predictedState,
        authoritativeState,
      ),
      previousPredictedHash,
      reconciledPredictedHash: nextHash,
      requiresInputStreamReset: true,
    });
  }

  let replayedState = authoritativeState;
  let replayedCommands = 0;
  const replayedHistory: LocalPredictionFrame[] = [];
  for (const frame of prediction.history) {
    const pendingCommands = frame.commands.filter(
      (command) => command.sequence > acknowledgedSequence,
    );
    if (pendingCommands.length === 0) continue;
    const simulation = stepMovementSimulation(replayedState, pendingCommands, profile, queries);
    replayedState = cloneAndFreezeMovementState(simulation.state);
    replayedCommands += pendingCommands.length;
    replayedHistory.push({
      clientTick: frame.clientTick,
      predictedSimulationTick: replayedState.tick,
      commands: Object.freeze([...pendingCommands]),
    });
  }
  const replayedTicks = replayedHistory.length;
  const reconciledPredictedHash = hashCanonicalMovementState(replayedState);
  const positionError = spatialErrorMm(prediction.predictedState, replayedState);
  const mode = reconciliationMode(
    previousPredictedHash,
    reconciledPredictedHash,
    positionError,
    snapshot,
    prediction.options,
  );
  const metrics = incrementReconciliationMetric(
    prediction.metrics,
    mode,
    replayedTicks,
    replayedCommands,
    positionError,
  );
  const nextPrediction: LocalPredictionState = Object.freeze({
    ...prediction,
    predictedState: replayedState,
    history: freezeHistory(replayedHistory),
    historyCommandCount: replayedCommands,
    historyFloorSequence: acknowledgedSequence,
    lastAcknowledgedSequence: acknowledgedSequence,
    lastAuthoritativeTick: authoritativeState.tick,
    metrics,
  });
  return Object.freeze({
    prediction: nextPrediction,
    mode,
    acknowledgedSequence,
    authoritativeTick: authoritativeState.tick,
    replayedTicks,
    replayedCommands,
    positionErrorMm: positionError,
    orientationErrorMilliDegrees: orientationErrorMilliDegrees(
      prediction.predictedState,
      replayedState,
    ),
    previousPredictedHash,
    reconciledPredictedHash,
    requiresInputStreamReset: false,
  });
}
