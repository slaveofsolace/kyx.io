import {
  createLocalPrediction,
  predictLocalMovementTick,
  reconcileLocalMovement,
  type LocalPredictionState,
  type LocalReconciliationMode,
} from '../client/netcode/localPrediction';
import {
  createRemoteInterpolationBuffer,
  delayedRemoteRenderTick,
  insertRemoteAuthoritativeSample,
  sampleRemoteInterpolation,
  type RemoteInterpolationBuffer,
  type RemoteInterpolationMode,
  type RemoteRenderState,
  type RemoteSampleInsertDisposition,
} from '../client/netcode/remoteInterpolation';
import {
  COMBAT_PLAYER_SCORES_CAPABILITY,
  PROTOCOL_LIMITS,
  PROTOCOL_VERSION,
  RELIABLE_EVENT_STREAM_VERSION,
  SNAPSHOT_BASELINE_VERSION,
  decodeServerMessage,
  encodeClientMessage,
  type ClientMessage,
  type CombatSnapshotV1,
  type DeltaSnapshotMessage,
  type ErrorMessage,
  type FullSnapshotMessage,
  type LoadoutRequestMessage,
  type MatchPhase,
  type ReliableEvent,
  type ServerMessage,
  type SimulationIdentityV1,
  type SnapshotEntity,
} from '../net';
import {
  assertIntentButtonMask,
  type MovementProfileV1,
  type MovementQueryPort,
  type MovementSimulationState,
} from '../sim';
import {
  assertAuthorityMovementIdentity,
  assertAuthoritySimulationIdentity,
  authoritySocketUrl,
  createEvidenceInputCommand,
  deepFreezeAuthorityEvidence,
  evidenceWireCommandToMovement,
  movementStateFromReconciliation,
  remoteSampleFromSnapshotEntity,
  type AuthorityEvidenceAxes,
  type AuthorityEvidenceConfig,
} from './authorityEvidenceModel';
import {
  accumulateAuthorityLookImpulse,
  consumeAuthorityLookImpulse,
  createAuthorityLookInputState,
  neutralizeAuthorityLookInput,
  sampleAuthorityLookDelta,
  setAuthorityContinuousLook,
  type AuthorityLookInputState,
} from './authorityLookInput';
import type {
  AuthorityEvidenceConnection,
  AuthorityEvidenceImpairmentDiagnostics,
  AuthorityEvidenceScheduler,
  AuthorityEvidenceTransport,
  AuthorityEvidenceTransportPayload,
} from './authorityEvidenceTransport';

const FIXED_TICK_MILLISECONDS = 50;
const HEARTBEAT_INTERVAL_MILLISECONDS = 10_000;
const RESUME_RECONNECT_DELAY_MILLISECONDS = 250;
const MAXIMUM_SEEN_RELIABLE_EVENT_IDS = 1_024;
const MAXIMUM_RECENT_COMBAT_EVENTS = 64;
const RELIABLE_EVENT_ID_PATTERN = /^event\.([1-9][0-9]*)$/u;
const RESUME_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;

function reliableEventSequence(eventId: string | null): number {
  if (eventId === null) return 0;
  const match = RELIABLE_EVENT_ID_PATTERN.exec(eventId);
  const sequence = match === null ? Number.NaN : Number(match[1]);
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > PROTOCOL_LIMITS.maxSequence) {
    throw new Error('reliable event ID is outside the version-1 stream');
  }
  return sequence;
}

function movementStateAtInputSequenceCursor(
  state: MovementSimulationState,
  lastGeneratedInputSequence: number,
): MovementSimulationState {
  if (state.player.lastProcessedSequence === lastGeneratedInputSequence) return state;
  return {
    ...state,
    player: {
      ...state.player,
      lastProcessedSequence: lastGeneratedInputSequence,
    },
  };
}

export type AuthorityEvidenceConnectionPhase =
  | 'idle'
  | 'connecting'
  | 'handshaking'
  | 'joining'
  | 'joined'
  | 'disconnecting'
  | 'resuming'
  | 'closed'
  | 'failed'
  | 'disposed';

type ConnectionIntent = 'join' | 'resume';

interface MutableAuthorityEvidenceCounters {
  connectionAttempts: number;
  socketOpens: number;
  socketCloses: number;
  serverMessages: number;
  protocolDecodeFailures: number;
  identityChecks: number;
  commandsGenerated: number;
  batchesSent: number;
  inputAcks: number;
  fullSnapshots: number;
  deltaSnapshots: number;
  snapshotAcksSent: number;
  staleSnapshotsIgnored: number;
  deltaBaselineMisses: number;
  fullSnapshotRequests: number;
  reliableEvents: number;
  reliableEventDuplicates: number;
  reliableEventHistoryGaps: number;
  reliableEventAcksSent: number;
  reconciliations: number;
  remoteSamples: number;
  interpolationFrames: number;
  resumeAttempts: number;
  resumeSuccesses: number;
  resumeTokenRotations: number;
  resumePredictionResets: number;
  transportErrors: number;
  applicationErrors: number;
  recoverableInputRejectionMessages: number;
  recoverableInputRejectedCommands: number;
}

type RecoverableInputRejectionCategory = 'duplicate_sequence' | 'stale_sequence' | 'mixed';

interface ParsedRecoverableInputRejections {
  readonly sequences: readonly number[];
  readonly duplicateSequence: number;
  readonly staleSequence: number;
  readonly category: RecoverableInputRejectionCategory;
}

function parseRecoverableInputRejections(
  message: ErrorMessage,
): ParsedRecoverableInputRejections | null {
  if (
    message.code !== 'INPUT_REJECTED'
    || message.requestId !== null
    || message.detail === null
  ) return null;
  const entries = message.detail.split(',');
  if (entries.length < 1 || entries.length > PROTOCOL_LIMITS.maxCommandsPerBatch) return null;
  const sequences: number[] = [];
  let duplicateSequence = 0;
  let staleSequence = 0;
  for (const entry of entries) {
    const match = /^(0|[1-9][0-9]*):(duplicate_sequence|stale_sequence)$/u.exec(entry);
    if (match === null) return null;
    const sequence = Number(match[1]);
    if (!Number.isSafeInteger(sequence) || sequence > PROTOCOL_LIMITS.maxSequence) return null;
    sequences.push(sequence);
    if (match[2] === 'duplicate_sequence') duplicateSequence += 1;
    else staleSequence += 1;
  }
  return Object.freeze({
    sequences: Object.freeze(sequences),
    duplicateSequence,
    staleSequence,
    category: duplicateSequence > 0 && staleSequence > 0
      ? 'mixed'
      : duplicateSequence > 0
        ? 'duplicate_sequence'
        : 'stale_sequence',
  });
}

export interface AuthorityEvidenceDiagnostics {
  readonly schemaVersion: 1;
  readonly evidence: {
    readonly label: 'DEV / G3 EVIDENCE';
    readonly productStatus: 'NON_PRODUCT';
    readonly route: '/__test__/authority';
    readonly gateClaim: 'G3_NOT_CLAIMED';
  };
  readonly configuration: {
    readonly authorityUrl: string;
    readonly mode: AuthorityEvidenceConfig['mode'];
    readonly roomCode: string;
    readonly displayName: string;
    readonly impairmentProfile: AuthorityEvidenceConfig['impairmentProfile'];
  };
  readonly connection: {
    readonly phase: AuthorityEvidenceConnectionPhase;
    readonly connectionId: string | null;
    readonly connectionMode: 'joined' | 'resumed' | null;
    readonly socketState: ReturnType<AuthorityEvidenceConnection['state']> | 'absent';
    readonly lastCloseCode: number | null;
    readonly lastCloseReason: string | null;
  };
  readonly authority: {
    readonly protocolVersion: 2;
    readonly roomId: string | null;
    readonly matchId: string | null;
    readonly playerId: string | null;
    readonly matchPhase: MatchPhase | null;
    readonly phaseEndsAtTick: number | null;
    readonly serverTick: number;
    readonly estimatedServerTick: number;
    readonly simulationIdentity: SimulationIdentityV1;
    readonly lastAppliedSnapshotTick: number | null;
    readonly lastAppliedSnapshotBaselineId: string | null;
    readonly pendingFullSnapshotRequestId: string | null;
    readonly lastReliableEventId: string | null;
    readonly lastReliableEventSequence: number;
    readonly lastFullSnapshotReliableEventBaselineSequence: number;
    readonly seenReliableEventIds: number;
  };
  readonly input: {
    readonly moveX: number;
    readonly moveY: number;
    readonly heldButtons: number;
    readonly nextSequence: number;
    readonly nextClientTick: number;
    readonly lastAcknowledgedSequence: number;
    readonly authorityInputRejections: {
      readonly messages: number;
      readonly rejectedCommands: number;
      readonly duplicateSequence: number;
      readonly staleSequence: number;
      readonly lastCategory: RecoverableInputRejectionCategory | null;
    };
  };
  readonly local: {
    readonly authoritativePlayerId: string | null;
    readonly authoritativePosition: Readonly<{ x: number; y: number; z: number }> | null;
    readonly predictedPosition: Readonly<{ x: number; y: number; z: number }> | null;
    readonly authoritativeVelocity: Readonly<{ x: number; y: number; z: number }> | null;
    readonly predictedVelocity: Readonly<{ x: number; y: number; z: number }> | null;
    readonly authoritativeGrounded: boolean | null;
    readonly predictedGrounded: boolean | null;
    readonly predictedStance: 'standing' | 'crouched' | null;
    readonly authoritativeLocomotion: 'grounded' | 'airborne' | 'sliding' | null;
    readonly predictedLocomotion: 'grounded' | 'airborne' | 'sliding' | null;
    readonly authoritativeYawMilliDegrees: number | null;
    readonly predictedYawMilliDegrees: number | null;
    readonly predictedPitchMilliDegrees: number | null;
    readonly predictionHistoryCommands: number;
    readonly lastReconciliationMode: LocalReconciliationMode | null;
    readonly lastPositionErrorMillimeters: number | null;
    readonly teleportCooldownTicksRemaining: number;
    readonly correctionBounds: {
      readonly sampleCount: number;
      readonly maximumPositionErrorMillimeters: number | null;
      readonly histogram: {
        readonly zero: number;
        readonly oneTo52: number;
        readonly fiftyThreeTo1999: number;
        readonly atLeast2000: number;
      };
    };
  };
  readonly remote: {
    readonly playerCount: number;
    readonly entityIds: readonly string[];
  };
  readonly combat: {
    readonly enabled: boolean;
    readonly snapshot: CombatSnapshotV1 | null;
    readonly recentEvents: readonly ReliableEvent[];
  };
  readonly resume: {
    readonly available: boolean;
    readonly tokenLength: number;
    readonly generation: number;
  };
  readonly counters: Readonly<MutableAuthorityEvidenceCounters> & {
    readonly reconciliationModes: Readonly<Record<LocalReconciliationMode, number>>;
    readonly remoteInsertions: Readonly<Record<RemoteSampleInsertDisposition, number>>;
    readonly interpolationModes: Readonly<Record<RemoteInterpolationMode, number>>;
  };
  readonly impairment: AuthorityEvidenceImpairmentDiagnostics | null;
  readonly lastNotice: string | null;
  readonly lastError: string | null;
}

export interface AuthorityEvidencePresentation {
  readonly localPredicted: Readonly<{ x: number; y: number; z: number }> | null;
  readonly localAuthoritative: Readonly<{ x: number; y: number; z: number }> | null;
  readonly remotes: readonly Readonly<{
    entityId: string;
    mode: RemoteInterpolationMode;
    state: RemoteRenderState;
  }>[];
  readonly estimatedServerTick: number;
}

export interface AuthorityEvidenceSessionCredential {
  readonly resumeToken: string;
  readonly matchId: string;
  readonly playerId: string;
}

export interface AuthorityEvidenceClientOptions {
  readonly config: AuthorityEvidenceConfig;
  readonly roomCode: string;
  readonly expectedIdentity: SimulationIdentityV1;
  readonly profile: MovementProfileV1;
  readonly queries: MovementQueryPort;
  readonly transport: AuthorityEvidenceTransport;
  readonly scheduler: AuthorityEvidenceScheduler;
  readonly createRequestId: () => string;
  readonly initialResumeCredential?: AuthorityEvidenceSessionCredential;
  readonly enableCombatInput?: boolean;
  readonly onSessionCredential?: (credential: AuthorityEvidenceSessionCredential) => void;
  readonly onResumeRejected?: () => void;
  readonly onChange?: () => void;
}

function counterRecord<T extends string>(keys: readonly T[]): Record<T, number> {
  return Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
}

const RECONCILIATION_MODES = Object.freeze([
  'stale_snapshot',
  'confirmed',
  'subthreshold_correction',
  'soft_correction',
  'hard_snap',
  'teleport_snap',
  'history_gap_snap',
] as const satisfies readonly LocalReconciliationMode[]);

const REMOTE_INSERTION_DISPOSITIONS = Object.freeze([
  'accepted',
  'accepted_out_of_order',
  'duplicate',
  'conflicting_duplicate',
  'stale_before_discontinuity',
  'semantic_discontinuity_reset',
  'implicit_teleport_reset',
] as const satisfies readonly RemoteSampleInsertDisposition[]);

const INTERPOLATION_MODES = Object.freeze([
  'empty',
  'held',
  'authoritative',
  'interpolated',
  'extrapolated',
  'stale',
] as const satisfies readonly RemoteInterpolationMode[]);

function copyPosition(
  position: Readonly<{ x: number; y: number; z: number }>,
): Readonly<{ x: number; y: number; z: number }> {
  return Object.freeze({ x: position.x, y: position.y, z: position.z });
}

export class AuthorityEvidenceClient {
  private readonly config: AuthorityEvidenceConfig;
  private readonly roomCode: string;
  private readonly expectedIdentity: SimulationIdentityV1;
  private readonly profile: MovementProfileV1;
  private readonly queries: MovementQueryPort;
  private readonly transport: AuthorityEvidenceTransport;
  private readonly scheduler: AuthorityEvidenceScheduler;
  private readonly createRequestId: () => string;
  private readonly combatInputEnabled: boolean;
  private readonly initialResumeIdentity: Readonly<{ matchId: string; playerId: string }> | null;
  private readonly onSessionCredential: (credential: AuthorityEvidenceSessionCredential) => void;
  private readonly onResumeRejected: () => void;
  private readonly onChange: () => void;
  private readonly remoteBuffers = new Map<string, RemoteInterpolationBuffer>();
  private readonly entities = new Map<string, SnapshotEntity>();
  private readonly pendingLoadoutRequestIds = new Set<string>();
  private readonly counters: MutableAuthorityEvidenceCounters = {
    connectionAttempts: 0,
    socketOpens: 0,
    socketCloses: 0,
    serverMessages: 0,
    protocolDecodeFailures: 0,
    identityChecks: 0,
    commandsGenerated: 0,
    batchesSent: 0,
    inputAcks: 0,
    fullSnapshots: 0,
    deltaSnapshots: 0,
    snapshotAcksSent: 0,
    staleSnapshotsIgnored: 0,
    deltaBaselineMisses: 0,
    fullSnapshotRequests: 0,
    reliableEvents: 0,
    reliableEventDuplicates: 0,
    reliableEventHistoryGaps: 0,
    reliableEventAcksSent: 0,
    reconciliations: 0,
    remoteSamples: 0,
    interpolationFrames: 0,
    resumeAttempts: 0,
    resumeSuccesses: 0,
    resumeTokenRotations: 0,
    resumePredictionResets: 0,
    transportErrors: 0,
    applicationErrors: 0,
    recoverableInputRejectionMessages: 0,
    recoverableInputRejectedCommands: 0,
  };
  private readonly reconciliationModes = counterRecord(RECONCILIATION_MODES);
  private readonly remoteInsertions = counterRecord(REMOTE_INSERTION_DISPOSITIONS);
  private readonly interpolationModes = counterRecord(INTERPOLATION_MODES);

  private phase: AuthorityEvidenceConnectionPhase = 'idle';
  private connection: AuthorityEvidenceConnection | null = null;
  private connectionEpoch = 0;
  private connectionIntent: ConnectionIntent = 'join';
  private joinDispatched = false;
  private pendingJoinRequestId: string | null = null;
  private resumeRequested = false;
  private resumeReconnectHandle: unknown = null;
  private fixedTickHandle: unknown = null;
  private resumeToken: string | null = null;
  private resumeGeneration = 0;
  private resetPredictionOnNextSnapshot = true;

  private connectionId: string | null = null;
  private connectionMode: 'joined' | 'resumed' | null = null;
  private roomId: string | null = null;
  private matchId: string | null = null;
  private playerId: string | null = null;
  private matchPhase: MatchPhase | null = null;
  private phaseEndsAtTick: number | null = null;
  private serverTick = 0;
  private serverTickObservedAtMilliseconds = 0;
  private lastAcknowledgedSequence = -1;
  private lastAppliedSnapshotTick: number | null = null;
  private lastAppliedSnapshotBaselineId: string | null = null;
  private pendingFullSnapshotRequestId: string | null = null;
  private lastReliableEventId: string | null = null;
  private lastReliableEventSequence = 0;
  private lastFullSnapshotReliableEventBaselineSequence = 0;
  private reliableEventStreamIdentity: string | null = null;
  private readonly seenReliableEventIds = new Set<string>();
  private readonly seenReliableEventOrder: string[] = [];
  private nextSequence = 0;
  private nextClientTick = 0;
  private nextHeartbeatAtMilliseconds = 0;
  private nextHeartbeatNonce = 0;
  private axes: AuthorityEvidenceAxes = Object.freeze({ moveX: 0, moveY: 0 });
  private combatHeldButtons = 0;
  private lastSentCombatHeldButtons = 0;
  private pendingCombatPressedButtons = 0;
  private pendingCombatReleasedButtons = 0;
  private lookInput: AuthorityLookInputState = createAuthorityLookInputState();
  private selectedWeaponSlot = 0;
  private combatSnapshot: CombatSnapshotV1 | null = null;
  private readonly recentCombatEvents: ReliableEvent[] = [];
  private prediction: LocalPredictionState | null = null;
  private authoritativePlayerId: string | null = null;
  private authoritativePosition: Readonly<{ x: number; y: number; z: number }> | null = null;
  private authoritativeVelocity: Readonly<{ x: number; y: number; z: number }> | null = null;
  private authoritativeGrounded: boolean | null = null;
  private authoritativeLocomotion: 'grounded' | 'airborne' | 'sliding' | null = null;
  private authoritativeYawMilliDegrees: number | null = null;
  private lastReconciliationMode: LocalReconciliationMode | null = null;
  private lastPositionErrorMillimeters: number | null = null;
  private teleportCooldownTicksRemaining = 0;
  private duplicateSequenceInputRejections = 0;
  private staleSequenceInputRejections = 0;
  private lastInputRejectionCategory: RecoverableInputRejectionCategory | null = null;
  private correctionSampleCount = 0;
  private maximumPositionErrorMillimeters: number | null = null;
  private readonly correctionHistogram = {
    zero: 0,
    oneTo52: 0,
    fiftyThreeTo1999: 0,
    atLeast2000: 0,
  };
  private lastCloseCode: number | null = null;
  private lastCloseReason: string | null = null;
  private lastNotice: string | null = null;
  private lastError: string | null = null;

  constructor(options: AuthorityEvidenceClientOptions) {
    this.config = options.config;
    this.roomCode = options.roomCode;
    this.expectedIdentity = Object.freeze({ ...options.expectedIdentity });
    this.profile = options.profile;
    this.queries = options.queries;
    this.transport = options.transport;
    this.scheduler = options.scheduler;
    this.createRequestId = options.createRequestId;
    const initialResumeCredential = options.initialResumeCredential;
    if (
      initialResumeCredential !== undefined
      && !RESUME_TOKEN_PATTERN.test(initialResumeCredential.resumeToken)
    ) throw new RangeError('initial authority resume credential is malformed');
    this.resumeToken = initialResumeCredential?.resumeToken ?? null;
    this.initialResumeIdentity = initialResumeCredential === undefined
      ? null
      : Object.freeze({
          matchId: initialResumeCredential.matchId,
          playerId: initialResumeCredential.playerId,
        });
    this.combatInputEnabled = options.enableCombatInput === true;
    this.onSessionCredential = options.onSessionCredential ?? (() => undefined);
    this.onResumeRejected = options.onResumeRejected ?? (() => undefined);
    this.onChange = options.onChange ?? (() => undefined);
  }

  start(): void {
    if (this.phase !== 'idle') throw new Error('authority evidence client can start only once');
    this.serverTickObservedAtMilliseconds = this.scheduler.nowMilliseconds();
    this.fixedTickHandle = this.scheduler.repeat(
      () => this.generateFixedInputTick(),
      FIXED_TICK_MILLISECONDS,
    );
    const initialIntent: ConnectionIntent = this.resumeToken === null ? 'join' : 'resume';
    if (initialIntent === 'resume') this.counters.resumeAttempts += 1;
    this.openConnection(initialIntent);
  }

  setAxes(axes: AuthorityEvidenceAxes): void {
    this.axes = Object.freeze({ moveX: axes.moveX, moveY: axes.moveY });
  }

  setInputButtons(heldButtons: number): boolean {
    if (!this.combatInputEnabled) return false;
    assertIntentButtonMask(heldButtons, 'authority evidence input buttons');
    const nextHeldButtons = heldButtons >>> 0;
    this.pendingCombatPressedButtons |= nextHeldButtons & ~this.combatHeldButtons;
    this.pendingCombatReleasedButtons |= this.combatHeldButtons & ~nextHeldButtons;
    this.combatHeldButtons = nextHeldButtons;
    this.emitChange();
    return true;
  }

  setCombatButtons(heldButtons: number): boolean {
    return this.setInputButtons(heldButtons);
  }

  neutralizeInput(): void {
    this.axes = Object.freeze({ moveX: 0, moveY: 0 });
    this.combatHeldButtons = 0;
    this.pendingCombatPressedButtons = 0;
    this.pendingCombatReleasedButtons = this.lastSentCombatHeldButtons;
    this.lookInput = neutralizeAuthorityLookInput();
    this.emitChange();
  }

  setLookDeltas(yawMilliDegrees: number, pitchMilliDegrees = 0): boolean {
    if (!this.combatInputEnabled) return false;
    this.lookInput = setAuthorityContinuousLook(
      this.lookInput,
      yawMilliDegrees,
      pitchMilliDegrees,
    );
    this.emitChange();
    return true;
  }

  addLookDeltas(yawMilliDegrees: number, pitchMilliDegrees = 0): boolean {
    if (!this.combatInputEnabled) return false;
    this.lookInput = accumulateAuthorityLookImpulse(
      this.lookInput,
      yawMilliDegrees,
      pitchMilliDegrees,
    );
    this.emitChange();
    return true;
  }

  setSelectedWeaponSlot(slot: number): boolean {
    if (!this.combatInputEnabled) return false;
    if (!Number.isInteger(slot) || slot < 0 || slot > 5) {
      throw new RangeError('authority evidence weapon slot must be an integer from 0 through 5');
    }
    this.selectedWeaponSlot = slot;
    this.emitChange();
    return true;
  }

  requestLoadout(message: LoadoutRequestMessage): boolean {
    if (
      this.phase !== 'joined'
      || this.connection?.state() !== 'open'
      || (this.matchPhase !== 'lobby' && this.matchPhase !== 'warmup')
    ) return false;
    this.pendingLoadoutRequestIds.add(message.requestId);
    try {
      this.send(message);
    } catch (error) {
      this.pendingLoadoutRequestIds.delete(message.requestId);
      throw error;
    }
    return true;
  }

  requestResume(): boolean {
    if (
      this.phase !== 'joined'
      || this.resumeToken === null
      || this.connection?.state() !== 'open'
    ) return false;
    this.neutralizeInput();
    this.resumeRequested = true;
    this.phase = 'disconnecting';
    this.counters.resumeAttempts += 1;
    this.connection.close(4000, 'development evidence resume');
    this.emitChange();
    return true;
  }

  canResume(): boolean {
    return this.phase === 'joined'
      && this.resumeToken !== null
      && this.connection?.state() === 'open';
  }

  dispose(): void {
    if (this.phase === 'disposed') return;
    this.phase = 'disposed';
    this.resumeRequested = false;
    if (this.fixedTickHandle !== null) {
      this.scheduler.stopRepeating(this.fixedTickHandle);
      this.fixedTickHandle = null;
    }
    if (this.resumeReconnectHandle !== null) {
      this.scheduler.stopAfter(this.resumeReconnectHandle);
      this.resumeReconnectHandle = null;
    }
    this.connection?.close(1000, 'development evidence disposed');
    this.connection = null;
    this.emitChange();
  }

  diagnostics(): AuthorityEvidenceDiagnostics {
    const predictedPosition = this.prediction === null
      ? null
      : copyPosition(this.prediction.predictedState.player.feetPosition);
    const predictedVelocity = this.prediction === null
      ? null
      : copyPosition(this.prediction.predictedState.player.velocity);
    return deepFreezeAuthorityEvidence({
      schemaVersion: 1,
      evidence: {
        label: 'DEV / G3 EVIDENCE',
        productStatus: 'NON_PRODUCT',
        route: '/__test__/authority',
        gateClaim: 'G3_NOT_CLAIMED',
      },
      configuration: {
        authorityUrl: this.config.authorityUrl,
        mode: this.config.mode,
        roomCode: this.roomCode,
        displayName: this.config.displayName,
        impairmentProfile: this.config.impairmentProfile,
      },
      connection: {
        phase: this.phase,
        connectionId: this.connectionId,
        connectionMode: this.connectionMode,
        socketState: this.connection?.state() ?? 'absent',
        lastCloseCode: this.lastCloseCode,
        lastCloseReason: this.lastCloseReason,
      },
      authority: {
        protocolVersion: PROTOCOL_VERSION,
        roomId: this.roomId,
        matchId: this.matchId,
        playerId: this.playerId,
        matchPhase: this.matchPhase,
        phaseEndsAtTick: this.phaseEndsAtTick,
        serverTick: this.serverTick,
        estimatedServerTick: this.estimatedServerTick(),
        simulationIdentity: { ...this.expectedIdentity },
        lastAppliedSnapshotTick: this.lastAppliedSnapshotTick,
        lastAppliedSnapshotBaselineId: this.lastAppliedSnapshotBaselineId,
        pendingFullSnapshotRequestId: this.pendingFullSnapshotRequestId,
        lastReliableEventId: this.lastReliableEventId,
        lastReliableEventSequence: this.lastReliableEventSequence,
        lastFullSnapshotReliableEventBaselineSequence:
          this.lastFullSnapshotReliableEventBaselineSequence,
        seenReliableEventIds: this.seenReliableEventIds.size,
      },
      input: {
        moveX: this.axes.moveX,
        moveY: this.axes.moveY,
        heldButtons: this.combatHeldButtons,
        nextSequence: this.nextSequence,
        nextClientTick: this.nextClientTick,
        lastAcknowledgedSequence: this.lastAcknowledgedSequence,
        authorityInputRejections: {
          messages: this.counters.recoverableInputRejectionMessages,
          rejectedCommands: this.counters.recoverableInputRejectedCommands,
          duplicateSequence: this.duplicateSequenceInputRejections,
          staleSequence: this.staleSequenceInputRejections,
          lastCategory: this.lastInputRejectionCategory,
        },
      },
      local: {
        authoritativePlayerId: this.authoritativePlayerId,
        authoritativePosition: this.authoritativePosition === null
          ? null
          : copyPosition(this.authoritativePosition),
        predictedPosition,
        authoritativeVelocity: this.authoritativeVelocity === null
          ? null
          : copyPosition(this.authoritativeVelocity),
        predictedVelocity,
        authoritativeGrounded: this.authoritativeGrounded,
        predictedGrounded: this.prediction?.predictedState.player.grounded ?? null,
        predictedStance: this.prediction?.predictedState.player.stance ?? null,
        authoritativeLocomotion: this.authoritativeLocomotion,
        predictedLocomotion: this.prediction?.predictedState.player.locomotion ?? null,
        authoritativeYawMilliDegrees: this.authoritativeYawMilliDegrees,
        predictedYawMilliDegrees: this.prediction?.predictedState.player.yawMilliDegrees ?? null,
        predictedPitchMilliDegrees: this.prediction?.predictedState.player.pitchMilliDegrees ?? null,
        predictionHistoryCommands: this.prediction?.historyCommandCount ?? 0,
        lastReconciliationMode: this.lastReconciliationMode,
        lastPositionErrorMillimeters: this.lastPositionErrorMillimeters,
        teleportCooldownTicksRemaining: this.teleportCooldownTicksRemaining,
        correctionBounds: {
          sampleCount: this.correctionSampleCount,
          maximumPositionErrorMillimeters: this.maximumPositionErrorMillimeters,
          histogram: { ...this.correctionHistogram },
        },
      },
      remote: {
        playerCount: this.remoteBuffers.size,
        entityIds: [...this.remoteBuffers.keys()].sort(),
      },
      combat: {
        enabled: this.combatSnapshot !== null,
        snapshot: this.combatSnapshot,
        recentEvents: [...this.recentCombatEvents],
      },
      resume: {
        available: this.canResume(),
        tokenLength: this.resumeToken?.length ?? 0,
        generation: this.resumeGeneration,
      },
      counters: {
        ...this.counters,
        reconciliationModes: { ...this.reconciliationModes },
        remoteInsertions: { ...this.remoteInsertions },
        interpolationModes: { ...this.interpolationModes },
      },
      impairment: this.transport.impairmentDiagnostics?.() ?? null,
      lastNotice: this.lastNotice,
      lastError: this.lastError,
    }) as AuthorityEvidenceDiagnostics;
  }

  samplePresentation(): AuthorityEvidencePresentation {
    const estimatedServerTick = this.estimatedServerTick();
    const remotes: Array<Readonly<{
      entityId: string;
      mode: RemoteInterpolationMode;
      state: RemoteRenderState;
    }>> = [];
    for (const [entityId, buffer] of [...this.remoteBuffers.entries()].sort()) {
      const targetTick = delayedRemoteRenderTick(buffer, estimatedServerTick);
      const result = sampleRemoteInterpolation(buffer, targetTick);
      this.interpolationModes[result.mode] += 1;
      if (result.renderState !== null) {
        remotes.push(Object.freeze({ entityId, mode: result.mode, state: result.renderState }));
      }
    }
    this.counters.interpolationFrames += 1;
    return deepFreezeAuthorityEvidence({
      localPredicted: this.prediction === null
        ? null
        : copyPosition(this.prediction.predictedState.player.feetPosition),
      localAuthoritative: this.authoritativePosition === null
        ? null
        : copyPosition(this.authoritativePosition),
      remotes,
      estimatedServerTick,
    }) as AuthorityEvidencePresentation;
  }

  private openConnection(intent: ConnectionIntent): void {
    if (this.phase === 'disposed' || this.phase === 'failed') return;
    this.connectionIntent = intent;
    this.joinDispatched = false;
    this.pendingJoinRequestId = null;
    this.pendingLoadoutRequestIds.clear();
    this.connectionId = null;
    this.lastAppliedSnapshotTick = null;
    this.lastAppliedSnapshotBaselineId = null;
    this.pendingFullSnapshotRequestId = null;
    this.phase = intent === 'resume' ? 'resuming' : 'connecting';
    this.counters.connectionAttempts += 1;
    const epoch = this.connectionEpoch + 1;
    this.connectionEpoch = epoch;
    try {
      this.connection = this.transport.connect(
        authoritySocketUrl(this.config.authorityUrl, this.roomCode),
        {
          onOpen: () => {
            if (epoch === this.connectionEpoch) this.handleOpen();
          },
          onMessage: (payload) => {
            if (epoch === this.connectionEpoch) this.handlePayload(payload);
          },
          onClose: (code, reason) => {
            if (epoch === this.connectionEpoch) this.handleClose(code, reason);
          },
          onError: (message) => {
            if (epoch === this.connectionEpoch) this.handleTransportError(message);
          },
        },
      );
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
    }
    this.emitChange();
  }

  private handleOpen(): void {
    this.phase = 'handshaking';
    this.counters.socketOpens += 1;
    this.nextHeartbeatAtMilliseconds = (
      this.scheduler.nowMilliseconds() + HEARTBEAT_INTERVAL_MILLISECONDS
    );
    this.send({
      protocolVersion: PROTOCOL_VERSION,
      type: 'hello',
      requestId: this.nextRequestId(),
      clientBuild: 'phase4-visible-authority-evidence',
      requestedRulesetId: this.expectedIdentity.rulesetId,
      capabilities: [
        'prediction-v1',
        'reconciliation-v1',
        'remote-interpolation-v1',
        'delta-baseline-v1',
        'reliable-events-v1',
        COMBAT_PLAYER_SCORES_CAPABILITY,
      ],
    });
    this.emitChange();
  }

  private handlePayload(payload: AuthorityEvidenceTransportPayload): void {
    this.counters.serverMessages += 1;
    const decoded = decodeServerMessage(payload);
    if (!decoded.ok) {
      this.counters.protocolDecodeFailures += 1;
      this.fail(`protocol decode failed: ${decoded.error.code} at ${decoded.error.path}`);
      return;
    }
    try {
      this.applyServerMessage(decoded.value);
    } catch (error) {
      this.counters.applicationErrors += 1;
      this.fail(error instanceof Error ? error.message : String(error));
      return;
    }
    this.emitChange();
  }

  private applyServerMessage(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome': {
        this.assertIdentity(message.simulationIdentity, 'welcome');
        if (message.protocolConfig.protocolVersion !== PROTOCOL_VERSION) {
          throw new Error('welcome protocol configuration is not protocol v2');
        }
        if (
          message.protocolConfig.snapshotBaselineVersion !== SNAPSHOT_BASELINE_VERSION
          || message.protocolConfig.reliableEventStreamVersion !== RELIABLE_EVENT_STREAM_VERSION
        ) throw new Error('welcome transport versions are unsupported');
        this.connectionId = message.connectionId;
        this.observeServerTick(message.serverTick);
        if (!this.joinDispatched) this.dispatchJoinOrResume();
        return;
      }
      case 'joinAccepted': {
        this.assertIdentity(message.simulationIdentity, 'joinAccepted');
        if (message.requestId !== this.pendingJoinRequestId) {
          throw new Error('joinAccepted request id does not match the pending request');
        }
        if (message.roomId !== `room.${this.roomCode}`) {
          throw new Error('joinAccepted room id contradicts the requested room code');
        }
        if (this.matchId !== null && message.matchId !== this.matchId) {
          throw new Error('joinAccepted changed the authority match id');
        }
        if (this.matchId === null) this.resetReliableEventStream(message.matchId);
        if (this.connectionIntent === 'resume') {
          if (message.connectionMode !== 'resumed') {
            throw new Error('resume connection was not accepted as resumed');
          }
          if (
            this.initialResumeIdentity !== null
            && (
              message.matchId !== this.initialResumeIdentity.matchId
              || message.playerId !== this.initialResumeIdentity.playerId
            )
          ) throw new Error('resume connection changed the persisted player identity');
          if (message.resumeToken === this.resumeToken) {
            throw new Error('resume token was not rotated');
          }
          this.counters.resumeSuccesses += 1;
          this.counters.resumeTokenRotations += 1;
          this.resumeGeneration += 1;
        } else if (message.connectionMode !== 'joined') {
          throw new Error('new connection was not accepted as joined');
        }
        this.roomId = message.roomId;
        this.matchId = message.matchId;
        this.playerId = message.playerId;
        this.connectionMode = message.connectionMode;
        this.resumeToken = message.resumeToken;
        this.onSessionCredential(Object.freeze({
          resumeToken: message.resumeToken,
          matchId: message.matchId,
          playerId: message.playerId,
        }));
        this.resetPredictionOnNextSnapshot = true;
        this.observeServerTick(message.serverTick);
        return;
      }
      case 'joinRejected':
        if (this.connectionIntent === 'resume') {
          this.resumeToken = null;
          this.onResumeRejected();
        }
        throw new Error(`authority rejected ${this.connectionIntent}: ${message.code}`);
      case 'fullSnapshot':
        this.applyFullSnapshot(message);
        return;
      case 'deltaSnapshot':
        this.applyDeltaSnapshot(message);
        return;
      case 'inputAck': {
        if (message.lastProcessedInputSequence > this.nextSequence - 1) {
          throw new Error('authority acknowledged an input sequence the client did not generate');
        }
        this.counters.inputAcks += 1;
        this.lastAcknowledgedSequence = Math.max(
          this.lastAcknowledgedSequence,
          message.lastProcessedInputSequence,
        );
        this.observeServerTick(message.serverTick);
        return;
      }
      case 'matchState':
        this.assertIdentity(message.simulationIdentity, 'matchState');
        this.assertMatch(message.matchId);
        this.matchPhase = message.phase;
        this.phaseEndsAtTick = message.phaseEndsAtTick;
        this.observeServerTick(message.serverTick);
        return;
      case 'reliableEventBatch':
        this.assertMatch(message.matchId);
        this.applyReliableEventBatch(message);
        this.sendTransportAcknowledgement();
        return;
      case 'serverNotice':
        if (message.code === 'LOADOUT_ACCEPTED') {
          this.pendingLoadoutRequestIds.delete(message.message);
        }
        this.lastNotice = `${message.code}: ${message.message}`;
        return;
      case 'error':
        if (this.applyRecoverableInputRejection(message)) return;
        if (this.applyRecoverableLoadoutLockRejection(message)) return;
        throw new Error(
          `authority error ${message.code}${message.detail === null ? '' : `: ${message.detail}`}`,
        );
      case 'pong':
        this.observeServerTick(message.serverTick);
        return;
    }
  }

  private applyRecoverableInputRejection(message: ErrorMessage): boolean {
    if (
      this.phase !== 'joined'
      || this.playerId === null
      || this.matchId === null
    ) return false;
    const parsed = parseRecoverableInputRejections(message);
    if (
      parsed === null
      || parsed.sequences.some((sequence) => sequence >= this.nextSequence)
    ) return false;
    const rejectedCommands = parsed.duplicateSequence + parsed.staleSequence;
    this.counters.recoverableInputRejectionMessages += 1;
    this.counters.recoverableInputRejectedCommands += rejectedCommands;
    this.duplicateSequenceInputRejections += parsed.duplicateSequence;
    this.staleSequenceInputRejections += parsed.staleSequence;
    this.lastInputRejectionCategory = parsed.category;
    this.lastNotice = `INPUT_REJECTED: authority ignored ${rejectedCommands} duplicate or stale input command${rejectedCommands === 1 ? '' : 's'}`;
    return true;
  }

  private applyRecoverableLoadoutLockRejection(message: ErrorMessage): boolean {
    if (
      this.phase !== 'joined'
      || this.playerId === null
      || this.matchId === null
      || message.code !== 'LOADOUT_REJECTED'
      || message.detail !== 'loadout_locked'
      || message.requestId === null
      || !this.pendingLoadoutRequestIds.delete(message.requestId)
    ) return false;
    // The authority can cross warmup -> active after this client submits the
    // request but before the rejection reaches us. The pending request ID is
    // the fail-closed correlation boundary; the client's last observed phase
    // can legitimately still be warmup during that race.
    this.lastNotice = 'LOADOUT_LOCKED: using the authoritative in-match loadout until the next selection window';
    return true;
  }

  private applyFullSnapshot(message: FullSnapshotMessage): void {
    this.assertJoinedSnapshot(message.matchId);
    this.assertIdentity(message.simulationIdentity, 'fullSnapshot');
    this.assertReliableEventStream(message.matchId, message.reliableEventStreamVersion);
    if (
      this.lastAppliedSnapshotTick !== null
      && message.serverTick < this.lastAppliedSnapshotTick
    ) {
      this.counters.staleSnapshotsIgnored += 1;
      this.sendTransportAcknowledgement();
      return;
    }
    this.applyLocalReconciliation(message.localReconciliation, 'fullSnapshot');
    this.entities.clear();
    for (const entity of message.entities) this.entities.set(entity.id, entity);
    this.applyRemoteSamples(message.entities, message.serverTick, true);
    this.combatSnapshot = message.combat ?? null;
    this.matchPhase = message.phase;
    this.phaseEndsAtTick = message.phaseEndsAtTick;
    this.observeServerTick(message.serverTick);
    this.lastAppliedSnapshotTick = message.serverTick;
    this.lastAppliedSnapshotBaselineId = message.snapshotBaselineId;
    const fullSnapshotReliableEventBaselineSequence = reliableEventSequence(
      message.reliableEventBaselineId,
    );
    this.lastFullSnapshotReliableEventBaselineSequence = fullSnapshotReliableEventBaselineSequence;
    // A recovery full snapshot can overtake the ACK for a reliable batch that
    // this same ordered WebSocket already delivered. Never rewind the applied
    // event cursor to the server's older acknowledged baseline: doing so would
    // emit an event-regression ACK and could logically replay presentation.
    if (
      fullSnapshotReliableEventBaselineSequence === this.lastReliableEventSequence
      && message.reliableEventBaselineId !== this.lastReliableEventId
    ) {
      throw new Error('full snapshot reliable event baseline conflicts with applied ordinal');
    }
    if (fullSnapshotReliableEventBaselineSequence > this.lastReliableEventSequence) {
      this.lastReliableEventId = message.reliableEventBaselineId;
      this.lastReliableEventSequence = fullSnapshotReliableEventBaselineSequence;
    }
    this.pendingFullSnapshotRequestId = null;
    this.counters.fullSnapshots += 1;
    this.phase = 'joined';
    this.resumeRequested = false;
    this.sendTransportAcknowledgement();
  }

  private applyDeltaSnapshot(message: DeltaSnapshotMessage): void {
    this.assertJoinedSnapshot(message.matchId);
    if (
      this.lastAppliedSnapshotTick !== null
      && message.serverTick <= this.lastAppliedSnapshotTick
    ) {
      this.counters.staleSnapshotsIgnored += 1;
      this.sendTransportAcknowledgement();
      return;
    }
    if (
      message.baseTick !== this.lastAppliedSnapshotTick
      || message.baseSnapshotBaselineId !== this.lastAppliedSnapshotBaselineId
    ) {
      this.counters.deltaBaselineMisses += 1;
      this.requestFullSnapshot('missing_baseline');
      return;
    }
    assertAuthorityMovementIdentity(
      message.localReconciliation,
      this.expectedIdentity,
      'deltaSnapshot',
    );
    this.counters.identityChecks += 1;
    this.applyLocalReconciliation(message.localReconciliation, 'deltaSnapshot');
    for (const entityId of message.removedEntityIds) {
      this.entities.delete(entityId);
      this.remoteBuffers.delete(entityId);
    }
    for (const entity of message.entities) this.entities.set(entity.id, entity);
    this.applyRemoteSamples(message.entities, message.serverTick, false);
    if (message.combat !== undefined) this.combatSnapshot = message.combat;
    this.matchPhase = message.phase;
    this.phaseEndsAtTick = message.phaseEndsAtTick;
    this.observeServerTick(message.serverTick);
    this.lastAppliedSnapshotTick = message.serverTick;
    this.lastAppliedSnapshotBaselineId = message.snapshotBaselineId;
    this.counters.deltaSnapshots += 1;
    this.phase = 'joined';
    this.sendTransportAcknowledgement();
  }

  private requestFullSnapshot(reason: 'missing_baseline' | 'history_gap'): void {
    if (this.pendingFullSnapshotRequestId !== null) return;
    const requestId = this.nextRequestId();
    this.pendingFullSnapshotRequestId = requestId;
    this.send({
      protocolVersion: PROTOCOL_VERSION,
      type: 'requestFullSnapshot',
      requestId,
      reason,
    });
    this.counters.fullSnapshotRequests += 1;
  }

  private applyReliableEventBatch(
    message: Extract<ServerMessage, { type: 'reliableEventBatch' }>,
  ): void {
    this.assertReliableEventStream(message.matchId, message.reliableEventStreamVersion);
    let accepted = 0;
    for (const event of message.events) {
      const sequence = reliableEventSequence(event.id);
      if (sequence <= this.lastReliableEventSequence) {
        if (sequence === this.lastReliableEventSequence && event.id !== this.lastReliableEventId) {
          throw new Error('reliable event ID conflicts with applied ordinal');
        }
        this.counters.reliableEventDuplicates += 1;
        continue;
      }
      if (sequence !== this.lastReliableEventSequence + 1) {
        this.counters.reliableEventHistoryGaps += 1;
        this.requestFullSnapshot('history_gap');
        break;
      }
      if (this.seenReliableEventIds.has(event.id)) {
        this.counters.reliableEventDuplicates += 1;
        this.lastReliableEventId = event.id;
        this.lastReliableEventSequence = sequence;
        continue;
      }
      this.seenReliableEventIds.add(event.id);
      this.seenReliableEventOrder.push(event.id);
      while (this.seenReliableEventOrder.length > MAXIMUM_SEEN_RELIABLE_EVENT_IDS) {
        const expired = this.seenReliableEventOrder.shift();
        if (expired !== undefined) this.seenReliableEventIds.delete(expired);
      }
      if (event.kind === 'playerLeft') {
        this.entities.delete(event.subjectId);
        this.remoteBuffers.delete(event.subjectId);
      }
      this.recentCombatEvents.push(Object.freeze({ ...event }));
      while (this.recentCombatEvents.length > MAXIMUM_RECENT_COMBAT_EVENTS) {
        this.recentCombatEvents.shift();
      }
      accepted += 1;
      this.lastReliableEventId = event.id;
      this.lastReliableEventSequence = sequence;
      this.observeServerTick(event.serverTick);
    }
    if (accepted > 0) {
      this.counters.reliableEvents += accepted;
    }
  }

  private resetReliableEventStream(matchId: string): void {
    this.reliableEventStreamIdentity = `${matchId}@${RELIABLE_EVENT_STREAM_VERSION}`;
    this.lastReliableEventId = null;
    this.lastReliableEventSequence = 0;
    this.lastFullSnapshotReliableEventBaselineSequence = 0;
    this.seenReliableEventIds.clear();
    this.seenReliableEventOrder.length = 0;
    this.recentCombatEvents.length = 0;
  }

  private assertReliableEventStream(matchId: string, streamVersion: number): void {
    const identity = `${matchId}@${streamVersion}`;
    if (this.reliableEventStreamIdentity === null) {
      throw new Error('reliable event stream was not initialized by join acceptance');
    }
    if (identity !== this.reliableEventStreamIdentity) {
      throw new Error('authority changed the reliable event stream identity');
    }
  }

  private sendTransportAcknowledgement(): void {
    if (
      this.lastAppliedSnapshotTick === null
      || this.lastAppliedSnapshotBaselineId === null
      || this.connection?.state() !== 'open'
    ) return;
    this.send({
      protocolVersion: PROTOCOL_VERSION,
      type: 'ack',
      snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      snapshotBaselineId: this.lastAppliedSnapshotBaselineId,
      serverTick: this.lastAppliedSnapshotTick,
      lastEventId: this.lastReliableEventId,
    });
    this.counters.snapshotAcksSent += 1;
    this.counters.reliableEventAcksSent += 1;
  }

  private applyLocalReconciliation(
    reconciliation: FullSnapshotMessage['localReconciliation'],
    source: string,
  ): void {
    assertAuthorityMovementIdentity(reconciliation, this.expectedIdentity, source);
    this.counters.identityChecks += 1;
    const state = movementStateFromReconciliation(reconciliation, this.profile);
    if (this.playerId === null) {
      throw new Error(`${source}: local reconciliation arrived before player identity`);
    }
    if (state.player.id !== this.playerId) {
      throw new Error(
        `${source}: local reconciliation player mismatch; expected ${this.playerId}, received ${state.player.id}`,
      );
    }
    this.authoritativePlayerId = state.player.id;
    this.authoritativePosition = copyPosition(state.player.feetPosition);
    this.authoritativeVelocity = copyPosition(state.player.velocity);
    this.authoritativeGrounded = state.player.grounded;
    this.authoritativeLocomotion = state.player.locomotion;
    this.authoritativeYawMilliDegrees = state.player.yawMilliDegrees;
    this.teleportCooldownTicksRemaining = state.player.teleportCooldownTicksRemaining;
    this.lastAcknowledgedSequence = Math.max(
      this.lastAcknowledgedSequence,
      state.player.lastProcessedSequence,
    );
    if (this.prediction === null || this.resetPredictionOnNextSnapshot) {
      this.nextSequence = Math.max(
        this.nextSequence,
        state.player.lastProcessedSequence + 1,
      );
      this.prediction = createLocalPrediction(
        movementStateAtInputSequenceCursor(state, this.nextSequence - 1),
        this.profile,
      );
      this.nextClientTick = Math.max(this.nextClientTick, state.tick);
      this.lastReconciliationMode = null;
      this.lastPositionErrorMillimeters = null;
      if (this.resetPredictionOnNextSnapshot && this.connectionIntent === 'resume') {
        this.counters.resumePredictionResets += 1;
      }
      this.resetPredictionOnNextSnapshot = false;
      return;
    }
    const result = reconcileLocalMovement(
      this.prediction,
      { state },
      this.profile,
      this.queries,
    );
    this.prediction = result.prediction;
    this.lastReconciliationMode = result.mode;
    this.lastPositionErrorMillimeters = result.positionErrorMm;
    this.recordCorrectionError(result.positionErrorMm);
    this.counters.reconciliations += 1;
    this.reconciliationModes[result.mode] += 1;
    if (result.requiresInputStreamReset) {
      // Rebuild prediction history from authority without reusing sequence
      // numbers that may already be in flight. Sequence identity is monotonic
      // for the player stream even when replay history is no longer retained.
      this.nextSequence = Math.max(
        this.nextSequence,
        state.player.lastProcessedSequence + 1,
      );
      this.prediction = createLocalPrediction(
        movementStateAtInputSequenceCursor(state, this.nextSequence - 1),
        this.profile,
        result.prediction.options,
      );
      this.nextClientTick = Math.max(this.nextClientTick, state.tick);
    }
  }

  private recordCorrectionError(positionErrorMillimeters: number): void {
    this.correctionSampleCount += 1;
    this.maximumPositionErrorMillimeters = Math.max(
      this.maximumPositionErrorMillimeters ?? positionErrorMillimeters,
      positionErrorMillimeters,
    );
    if (positionErrorMillimeters === 0) this.correctionHistogram.zero += 1;
    else if (positionErrorMillimeters <= 52) this.correctionHistogram.oneTo52 += 1;
    else if (positionErrorMillimeters <= 1_999) this.correctionHistogram.fiftyThreeTo1999 += 1;
    else this.correctionHistogram.atLeast2000 += 1;
  }

  private applyRemoteSamples(
    entities: readonly SnapshotEntity[],
    serverTick: number,
    fullSnapshot: boolean,
  ): void {
    if (this.playerId === null) throw new Error('remote samples arrived before player identity');
    const remoteEntities = entities.filter((entity) => (
      entity.kind === 'player' && entity.id !== this.playerId
    ));
    if (fullSnapshot) {
      const present = new Set(remoteEntities.map(({ id }) => id));
      for (const entityId of this.remoteBuffers.keys()) {
        if (!present.has(entityId)) this.remoteBuffers.delete(entityId);
      }
    }
    const receivedAt = this.scheduler.nowMilliseconds();
    for (const entity of remoteEntities) {
      const existing = this.remoteBuffers.get(entity.id)
        ?? createRemoteInterpolationBuffer(entity.id);
      const sample = remoteSampleFromSnapshotEntity(
        entity,
        serverTick,
        receivedAt,
        existing.samples.length === 0,
      );
      const inserted = insertRemoteAuthoritativeSample(existing, sample);
      this.remoteBuffers.set(entity.id, inserted.buffer);
      this.remoteInsertions[inserted.disposition] += 1;
      this.counters.remoteSamples += 1;
    }
  }

  private generateFixedInputTick(): void {
    this.sendHeartbeatIfDue();
    if (
      this.phase !== 'joined'
      || (this.matchPhase !== 'warmup' && this.matchPhase !== 'active')
      || this.prediction === null
      || this.connection?.state() !== 'open'
    ) return;
    if (
      this.nextSequence > PROTOCOL_LIMITS.maxSequence
      || this.nextClientTick > PROTOCOL_LIMITS.maxAuthorityTick
    ) {
      this.fail('development input sequence or client tick exhausted');
      return;
    }
    const heldButtons = this.combatInputEnabled
      ? (this.combatHeldButtons | this.pendingCombatPressedButtons) >>> 0
      : 0;
    const pressedButtons = (
      (heldButtons & ~this.lastSentCombatHeldButtons)
      | this.pendingCombatPressedButtons
    ) >>> 0;
    const releasedButtons = ((
      (this.lastSentCombatHeldButtons & ~heldButtons)
      | this.pendingCombatReleasedButtons
    ) & ~heldButtons) >>> 0;
    const lookDelta = sampleAuthorityLookDelta(this.lookInput);
    const wireCommand = createEvidenceInputCommand(
      this.nextSequence,
      this.nextClientTick,
      this.axes,
      this.combatInputEnabled
        ? {
            heldButtons,
            pressedButtons,
            releasedButtons,
            selectedSlot: this.selectedWeaponSlot,
            lookYawDeltaMilliDegrees: lookDelta.yawMilliDegrees,
            lookPitchDeltaMilliDegrees: lookDelta.pitchMilliDegrees,
          }
        : undefined,
    );
    try {
      const result = predictLocalMovementTick(
        this.prediction,
        [evidenceWireCommandToMovement(wireCommand)],
        this.profile,
        this.queries,
      );
      this.send({
        protocolVersion: PROTOCOL_VERSION,
        type: 'inputBatch',
        commands: [wireCommand],
      });
      this.prediction = result.prediction;
      this.lastSentCombatHeldButtons = heldButtons;
      this.pendingCombatPressedButtons = 0;
      this.pendingCombatReleasedButtons &= ~releasedButtons;
      this.lookInput = consumeAuthorityLookImpulse(this.lookInput);
      this.nextSequence += 1;
      this.nextClientTick += 1;
      this.counters.commandsGenerated += 1;
      this.counters.batchesSent += 1;
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
      return;
    }
    this.emitChange();
  }

  private sendHeartbeatIfDue(): void {
    if (
      this.phase !== 'joined'
      || this.connection?.state() !== 'open'
    ) return;
    const nowMilliseconds = this.scheduler.nowMilliseconds();
    if (nowMilliseconds < this.nextHeartbeatAtMilliseconds) return;
    this.send({
      protocolVersion: PROTOCOL_VERSION,
      type: 'ping',
      nonce: this.nextHeartbeatNonce,
      clientTick: Math.min(this.nextClientTick, PROTOCOL_LIMITS.maxAuthorityTick),
    });
    this.nextHeartbeatNonce = this.nextHeartbeatNonce >= PROTOCOL_LIMITS.maxSequence
      ? 0
      : this.nextHeartbeatNonce + 1;
    this.nextHeartbeatAtMilliseconds = nowMilliseconds + HEARTBEAT_INTERVAL_MILLISECONDS;
  }

  private dispatchJoinOrResume(): void {
    this.joinDispatched = true;
    const requestId = this.nextRequestId();
    this.pendingJoinRequestId = requestId;
    if (this.connectionIntent === 'resume') {
      if (this.resumeToken === null) throw new Error('resume requested without an opaque token');
      this.phase = 'resuming';
      this.send({
        protocolVersion: PROTOCOL_VERSION,
        type: 'resumeRoom',
        requestId,
        roomCode: this.roomCode,
        resumeToken: this.resumeToken,
      });
      return;
    }
    this.phase = 'joining';
    this.send({
      protocolVersion: PROTOCOL_VERSION,
      type: 'joinRoom',
      requestId,
      roomCode: this.roomCode,
      displayName: this.config.displayName,
    });
  }

  private send(message: ClientMessage): void {
    if (this.connection?.state() !== 'open') throw new Error('authority socket is not open');
    const encoded = encodeClientMessage(message);
    if (!encoded.ok) {
      throw new Error(`client protocol encode failed: ${encoded.error.code} at ${encoded.error.path}`);
    }
    this.connection.send(encoded.json);
  }

  private nextRequestId(): string {
    const requestId = this.createRequestId();
    if (
      requestId.length < 1
      || requestId.length > PROTOCOL_LIMITS.maxIdBytes
      || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(requestId)
    ) throw new Error('request id factory returned an invalid protocol identifier');
    return requestId;
  }

  private assertIdentity(identity: SimulationIdentityV1, source: string): void {
    assertAuthoritySimulationIdentity(identity, this.expectedIdentity, source);
    this.counters.identityChecks += 1;
  }

  private assertMatch(matchId: string): void {
    if (this.matchId === null || matchId !== this.matchId) {
      throw new Error('server message match id does not match the accepted authority match');
    }
  }

  private assertJoinedSnapshot(matchId: string): void {
    if (this.playerId === null || this.roomId === null || this.matchId === null) {
      throw new Error('authority snapshot arrived before join acceptance');
    }
    this.assertMatch(matchId);
  }

  private observeServerTick(serverTick: number): void {
    if (serverTick < this.serverTick) return;
    this.serverTick = serverTick;
    this.serverTickObservedAtMilliseconds = this.scheduler.nowMilliseconds();
  }

  private estimatedServerTick(): number {
    if (this.matchPhase !== 'warmup' && this.matchPhase !== 'active') return this.serverTick;
    const elapsed = Math.max(
      0,
      this.scheduler.nowMilliseconds() - this.serverTickObservedAtMilliseconds,
    );
    return this.serverTick + elapsed / FIXED_TICK_MILLISECONDS;
  }

  private handleClose(code: number, reason: string): void {
    this.counters.socketCloses += 1;
    this.lastCloseCode = code;
    this.lastCloseReason = reason;
    this.connection = null;
    if (this.phase === 'disposed' || this.phase === 'failed') return;
    if (this.resumeRequested) {
      this.phase = 'resuming';
      this.resumeReconnectHandle = this.scheduler.after(() => {
        this.resumeReconnectHandle = null;
        this.openConnection('resume');
      }, RESUME_RECONNECT_DELAY_MILLISECONDS);
    } else {
      this.phase = 'closed';
      this.lastError = `authority socket closed (${code}${reason.length === 0 ? '' : `: ${reason}`})`;
    }
    this.emitChange();
  }

  private handleTransportError(message: string): void {
    this.counters.transportErrors += 1;
    this.fail(message);
  }

  private fail(message: string): void {
    if (this.phase === 'disposed' || this.phase === 'failed') return;
    this.phase = 'failed';
    this.lastError = message;
    this.resumeRequested = false;
    if (this.resumeReconnectHandle !== null) {
      this.scheduler.stopAfter(this.resumeReconnectHandle);
      this.resumeReconnectHandle = null;
    }
    const connection = this.connection;
    this.connection = null;
    if (connection?.state() === 'open' || connection?.state() === 'connecting') {
      // Browsers may initiate only 1000 or application-private 3000-4999 codes.
      connection.close(4008, 'development evidence failed closed');
    }
    this.emitChange();
  }

  private emitChange(): void {
    this.onChange();
  }
}
