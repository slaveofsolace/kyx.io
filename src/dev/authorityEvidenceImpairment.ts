import {
  createNetworkImpairmentHarness,
  type DeterministicNetworkImpairmentHarness,
  type NetworkImpairmentConfig,
  type NetworkImpairmentMetrics,
  type ResolvedNetworkImpairmentConfig,
  type ScriptedNetworkImpairmentConfig,
  type SeededNetworkImpairmentConfig,
} from '../client/netcode/networkImpairment';
import type {
  AuthorityEvidenceConnection,
  AuthorityEvidenceImpairmentDiagnostics,
  AuthorityEvidenceScheduler,
  AuthorityEvidenceTransport,
  AuthorityEvidenceTransportCallbacks,
  AuthorityEvidenceTransportPayload,
} from './authorityEvidenceTransport';

const MAXIMUM_PROFILE_NAME_LENGTH = 64;
const IMPAIRMENT_QUEUE_DEPTH = 4_096;

export const AUTHORITY_EVIDENCE_IMPAIRMENT_PROFILE_NAMES = Object.freeze([
  'nominal',
  'latency-jitter',
  'loss',
  'reorder-duplicate',
  'combined-stress',
  'matrix-rtt-0',
  'matrix-rtt-50',
  'matrix-rtt-100',
  'matrix-rtt-200',
  'matrix-rtt-350',
  'matrix-jitter-15',
  'matrix-jitter-50',
  'matrix-loss-1',
  'matrix-loss-3',
  'matrix-loss-8',
  'matrix-duplicate-1',
  'matrix-duplicate-5',
  'matrix-targeted-reorder',
  'matrix-outage-recovery',
] as const);

export type AuthorityEvidenceImpairmentProfileName =
  (typeof AUTHORITY_EVIDENCE_IMPAIRMENT_PROFILE_NAMES)[number];

export interface AuthorityEvidenceImpairmentPolicy {
  readonly schemaVersion: 1;
  readonly profile: string;
  readonly enabled: boolean;
  readonly inbound: ResolvedNetworkImpairmentConfig;
  readonly outbound: ResolvedNetworkImpairmentConfig;
  readonly sessionPolicy: AuthorityEvidenceImpairmentDiagnostics['policy'];
}

interface AuthorityEvidenceImpairmentPolicyInput {
  readonly profile: string;
  readonly inbound: NetworkImpairmentConfig;
  readonly outbound: NetworkImpairmentConfig;
}

interface MutableImpairmentSession {
  readonly connectionOrdinal: number;
  readonly inbound: DeterministicNetworkImpairmentHarness<AuthorityEvidenceTransportPayload>;
  readonly outbound: DeterministicNetworkImpairmentHarness<string>;
  rawConnection: AuthorityEvidenceConnection | null;
  inboundTimer: unknown;
  outboundTimer: unknown;
  socketState: ReturnType<AuthorityEvidenceConnection['state']>;
  strandedCopiesAtClose: number;
  impairmentFaults: number;
  finalized: boolean;
  gameplayImpairmentActive: boolean;
  reliableControlFramesBypassedInbound: number;
  reliableControlFramesBypassedOutbound: number;
  bootstrapGameplayFramesBypassedInbound: number;
  bootstrapGameplayFramesBypassedOutbound: number;
}

const SESSION_POLICY = Object.freeze({
  socketWrapping: 'fresh_per_connect',
  harnessLifecycle: 'fresh_inbound_and_outbound_per_connection',
  seedLifecycle: 'restart_profile_seed_per_connection',
  metricsRetention: 'transport_lifetime_aggregate_and_per_connection',
  closePolicy: 'cancel_delivery_timers_and_retain_stranded_queue_metrics',
  aggregation: 'sum_counters_extrema_across_sessions_weighted_latency_average',
  frameScope: 'gameplay_input_snapshot_ack_after_initial_full_snapshot',
  reliableControlPolicy: 'bypass_synthetic_loss_duplication_reorder_and_latency',
  bootstrapPolicy: 'first_full_snapshot_delivered_before_gameplay_impairment',
} as const satisfies AuthorityEvidenceImpairmentDiagnostics['policy']);

function protocolMessageType(payload: AuthorityEvidenceTransportPayload): string | null {
  try {
    const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const type = (parsed as { readonly type?: unknown }).type;
    return typeof type === 'string' ? type : null;
  } catch {
    return null;
  }
}

function isExplicitResyncSnapshot(payload: AuthorityEvidenceTransportPayload): boolean {
  try {
    const text = typeof payload === 'string' ? payload : new TextDecoder().decode(payload);
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const record = parsed as { readonly type?: unknown; readonly resyncRequestId?: unknown };
    return record.type === 'fullSnapshot' && typeof record.resyncRequestId === 'string';
  } catch {
    return false;
  }
}

function isInboundGameplayFrame(payload: AuthorityEvidenceTransportPayload): boolean {
  const type = protocolMessageType(payload);
  return (type === 'fullSnapshot' && !isExplicitResyncSnapshot(payload))
    || type === 'deltaSnapshot'
    || type === 'inputAck';
}

function isOutboundGameplayFrame(payload: string): boolean {
  return protocolMessageType(payload) === 'inputBatch';
}

function seededConfig(
  seed: number,
  overrides: Partial<Omit<SeededNetworkImpairmentConfig,
    'kind' | 'startingClockMilliseconds' | 'maximumQueueDepth' | 'seed'>> = {},
): SeededNetworkImpairmentConfig {
  return {
    kind: 'seeded',
    startingClockMilliseconds: 0,
    maximumQueueDepth: IMPAIRMENT_QUEUE_DEPTH,
    seed,
    baseLatencyMilliseconds: 0,
    jitterMilliseconds: 0,
    lossRatePermille: 0,
    duplicateRatePermille: 0,
    duplicateDelayMilliseconds: 0,
    reorderRatePermille: 0,
    reorderDelayMilliseconds: 0,
    ...overrides,
  };
}

function targetedReorderConfig(): ScriptedNetworkImpairmentConfig {
  return {
    kind: 'scripted',
    startingClockMilliseconds: 0,
    maximumQueueDepth: IMPAIRMENT_QUEUE_DEPTH,
    // Every twelfth gameplay frame is delayed long enough for the next frame
    // to overtake it. The finite 512-frame schedule is deliberately generous
    // for one bounded evidence session and fails closed if a run exceeds it.
    schedule: Object.freeze(Array.from({ length: 512 }, (_, index) => Object.freeze({
      latencyMilliseconds: 20,
      drop: false,
      duplicateDelayMilliseconds: null,
      reorderDelayMilliseconds: index % 12 === 4 ? 140 : 0,
    }))),
  };
}

function outageRecoveryConfig(): ScriptedNetworkImpairmentConfig {
  return {
    kind: 'scripted',
    startingClockMilliseconds: 0,
    maximumQueueDepth: IMPAIRMENT_QUEUE_DEPTH,
    // Drop one deterministic 18-frame inbound gameplay burst after bootstrap,
    // then resume normal delivery so extrapolation, stale hold, and recovery are
    // all observable in one bounded browser session.
    schedule: Object.freeze(Array.from({ length: 512 }, (_, index) => Object.freeze({
      latencyMilliseconds: 20,
      drop: index >= 24 && index < 42,
      duplicateDelayMilliseconds: null,
      reorderDelayMilliseconds: 0,
    }))),
  };
}

const NAMED_PROFILE_INPUTS = Object.freeze({
  nominal: Object.freeze({
    profile: 'nominal',
    inbound: seededConfig(0x6a09_e667),
    outbound: seededConfig(0xbb67_ae85),
  }),
  'latency-jitter': Object.freeze({
    profile: 'latency-jitter',
    inbound: seededConfig(0x3c6e_f372, {
      baseLatencyMilliseconds: 95,
      jitterMilliseconds: 35,
    }),
    outbound: seededConfig(0xa54f_f53a, {
      baseLatencyMilliseconds: 65,
      jitterMilliseconds: 20,
    }),
  }),
  loss: Object.freeze({
    profile: 'loss',
    inbound: seededConfig(0x510e_527f, {
      baseLatencyMilliseconds: 30,
      jitterMilliseconds: 10,
      lossRatePermille: 100,
    }),
    outbound: seededConfig(0x9b05_688c, {
      baseLatencyMilliseconds: 25,
      jitterMilliseconds: 8,
      lossRatePermille: 50,
    }),
  }),
  'reorder-duplicate': Object.freeze({
    profile: 'reorder-duplicate',
    inbound: seededConfig(0x1f83_d9ab, {
      baseLatencyMilliseconds: 35,
      jitterMilliseconds: 15,
      duplicateRatePermille: 150,
      duplicateDelayMilliseconds: 7,
      reorderRatePermille: 250,
      reorderDelayMilliseconds: 90,
    }),
    outbound: seededConfig(0x5be0_cd19, {
      baseLatencyMilliseconds: 25,
      jitterMilliseconds: 10,
      duplicateRatePermille: 25,
      duplicateDelayMilliseconds: 5,
      reorderRatePermille: 100,
      reorderDelayMilliseconds: 70,
    }),
  }),
  'combined-stress': Object.freeze({
    profile: 'combined-stress',
    inbound: seededConfig(0xc105_9ed8, {
      baseLatencyMilliseconds: 110,
      jitterMilliseconds: 50,
      lossRatePermille: 80,
      duplicateRatePermille: 120,
      duplicateDelayMilliseconds: 9,
      reorderRatePermille: 180,
      reorderDelayMilliseconds: 120,
    }),
    outbound: seededConfig(0x367c_d507, {
      baseLatencyMilliseconds: 80,
      jitterMilliseconds: 35,
      lossRatePermille: 40,
      duplicateRatePermille: 35,
      duplicateDelayMilliseconds: 7,
      reorderRatePermille: 120,
      reorderDelayMilliseconds: 90,
    }),
  }),
  'matrix-rtt-0': Object.freeze({
    profile: 'matrix-rtt-0',
    inbound: seededConfig(0x0000_0101),
    outbound: seededConfig(0x0000_0102),
  }),
  'matrix-rtt-50': Object.freeze({
    profile: 'matrix-rtt-50',
    inbound: seededConfig(0x0000_0201, { baseLatencyMilliseconds: 25 }),
    outbound: seededConfig(0x0000_0202, { baseLatencyMilliseconds: 25 }),
  }),
  'matrix-rtt-100': Object.freeze({
    profile: 'matrix-rtt-100',
    inbound: seededConfig(0x0000_0301, { baseLatencyMilliseconds: 50 }),
    outbound: seededConfig(0x0000_0302, { baseLatencyMilliseconds: 50 }),
  }),
  'matrix-rtt-200': Object.freeze({
    profile: 'matrix-rtt-200',
    inbound: seededConfig(0x0000_0401, { baseLatencyMilliseconds: 100 }),
    outbound: seededConfig(0x0000_0402, { baseLatencyMilliseconds: 100 }),
  }),
  'matrix-rtt-350': Object.freeze({
    profile: 'matrix-rtt-350',
    inbound: seededConfig(0x0000_0501, { baseLatencyMilliseconds: 175 }),
    outbound: seededConfig(0x0000_0502, { baseLatencyMilliseconds: 175 }),
  }),
  'matrix-jitter-15': Object.freeze({
    profile: 'matrix-jitter-15',
    inbound: seededConfig(0x0000_0601, {
      baseLatencyMilliseconds: 60,
      jitterMilliseconds: 15,
    }),
    outbound: seededConfig(0x0000_0602, {
      baseLatencyMilliseconds: 60,
      jitterMilliseconds: 15,
    }),
  }),
  'matrix-jitter-50': Object.freeze({
    profile: 'matrix-jitter-50',
    inbound: seededConfig(0x0000_0701, {
      baseLatencyMilliseconds: 60,
      jitterMilliseconds: 50,
    }),
    outbound: seededConfig(0x0000_0702, {
      baseLatencyMilliseconds: 60,
      jitterMilliseconds: 50,
    }),
  }),
  'matrix-loss-1': Object.freeze({
    profile: 'matrix-loss-1',
    inbound: seededConfig(3, { baseLatencyMilliseconds: 25, lossRatePermille: 10 }),
    outbound: seededConfig(3, { baseLatencyMilliseconds: 25, lossRatePermille: 10 }),
  }),
  'matrix-loss-3': Object.freeze({
    profile: 'matrix-loss-3',
    inbound: seededConfig(1, { baseLatencyMilliseconds: 25, lossRatePermille: 30 }),
    outbound: seededConfig(1, { baseLatencyMilliseconds: 25, lossRatePermille: 30 }),
  }),
  'matrix-loss-8': Object.freeze({
    profile: 'matrix-loss-8',
    inbound: seededConfig(0x0000_0801, {
      baseLatencyMilliseconds: 25,
      lossRatePermille: 80,
    }),
    outbound: seededConfig(0x0000_0802, {
      baseLatencyMilliseconds: 25,
      lossRatePermille: 80,
    }),
  }),
  'matrix-duplicate-1': Object.freeze({
    profile: 'matrix-duplicate-1',
    inbound: seededConfig(1, {
      baseLatencyMilliseconds: 25,
      duplicateRatePermille: 10,
      duplicateDelayMilliseconds: 7,
    }),
    outbound: seededConfig(1, {
      baseLatencyMilliseconds: 25,
      duplicateRatePermille: 10,
      duplicateDelayMilliseconds: 7,
    }),
  }),
  'matrix-duplicate-5': Object.freeze({
    profile: 'matrix-duplicate-5',
    inbound: seededConfig(1, {
      baseLatencyMilliseconds: 25,
      duplicateRatePermille: 50,
      duplicateDelayMilliseconds: 7,
    }),
    outbound: seededConfig(1, {
      baseLatencyMilliseconds: 25,
      duplicateRatePermille: 50,
      duplicateDelayMilliseconds: 7,
    }),
  }),
  'matrix-targeted-reorder': Object.freeze({
    profile: 'matrix-targeted-reorder',
    inbound: targetedReorderConfig(),
    outbound: targetedReorderConfig(),
  }),
  'matrix-outage-recovery': Object.freeze({
    profile: 'matrix-outage-recovery',
    inbound: outageRecoveryConfig(),
    outbound: seededConfig(0x0000_0901, { baseLatencyMilliseconds: 20 }),
  }),
} as const satisfies Record<
  AuthorityEvidenceImpairmentProfileName,
  AuthorityEvidenceImpairmentPolicyInput
>);

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    if (!Object.isFrozen(value)) Object.freeze(value);
  }
  return value;
}

function assertProfileName(profile: string): void {
  if (
    profile.length < 1
    || profile.length > MAXIMUM_PROFILE_NAME_LENGTH
    || !/^[a-z][a-z0-9-]*$/u.test(profile)
  ) throw new RangeError('authority impairment policy profile name is invalid');
}

/** Strict public parser for the query contract. Arbitrary configs are never accepted from a URL. */
export function parseAuthorityEvidenceImpairmentProfile(
  value: string | null,
): AuthorityEvidenceImpairmentProfileName {
  if (value === null) return 'nominal';
  if (
    !AUTHORITY_EVIDENCE_IMPAIRMENT_PROFILE_NAMES.includes(
      value as AuthorityEvidenceImpairmentProfileName,
    )
  ) {
    throw new RangeError(
      `impairment must be one of ${AUTHORITY_EVIDENCE_IMPAIRMENT_PROFILE_NAMES.join(', ')}`,
    );
  }
  return value as AuthorityEvidenceImpairmentProfileName;
}

/**
 * Resolve and deeply detach a policy. The generic constructor exists for focused
 * deterministic tests; the browser route only selects the finite named table.
 */
export function createAuthorityEvidenceImpairmentPolicy(
  input: AuthorityEvidenceImpairmentPolicyInput,
): AuthorityEvidenceImpairmentPolicy {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('authority impairment policy must be an object');
  }
  assertProfileName(input.profile);
  const inbound = createNetworkImpairmentHarness<AuthorityEvidenceTransportPayload>(
    input.inbound,
  ).config;
  const outbound = createNetworkImpairmentHarness<string>(input.outbound).config;
  const enabled = [inbound, outbound].some((config) => (
    config.kind === 'scripted'
      || config.baseLatencyMilliseconds > 0
      || config.jitterMilliseconds > 0
      || config.lossRatePermille > 0
      || config.duplicateRatePermille > 0
      || config.reorderRatePermille > 0
  ));
  return deepFreeze({
    schemaVersion: 1,
    profile: input.profile,
    enabled,
    inbound,
    outbound,
    sessionPolicy: SESSION_POLICY,
  }) as AuthorityEvidenceImpairmentPolicy;
}

const NAMED_POLICIES = Object.freeze(Object.fromEntries(
  AUTHORITY_EVIDENCE_IMPAIRMENT_PROFILE_NAMES.map((name) => [
    name,
    createAuthorityEvidenceImpairmentPolicy(NAMED_PROFILE_INPUTS[name]),
  ]),
) as Record<AuthorityEvidenceImpairmentProfileName, AuthorityEvidenceImpairmentPolicy>);

export function requireAuthorityEvidenceImpairmentPolicy(
  name: AuthorityEvidenceImpairmentProfileName,
): AuthorityEvidenceImpairmentPolicy {
  return NAMED_POLICIES[name];
}

function schedulerNowMilliseconds(scheduler: AuthorityEvidenceScheduler): number {
  const now = Math.floor(scheduler.nowMilliseconds());
  if (!Number.isSafeInteger(now) || now < 0) {
    throw new RangeError('authority impairment scheduler clock must be finite and non-negative');
  }
  return now;
}

function cloneInboundPayload(
  payload: AuthorityEvidenceTransportPayload,
): Readonly<AuthorityEvidenceTransportPayload> {
  return typeof payload === 'string' ? payload : new Uint8Array(payload);
}

function emptyMetrics(): NetworkImpairmentMetrics {
  return Object.freeze({
    sentPackets: 0,
    droppedPackets: 0,
    duplicatedPackets: 0,
    reorderImpairedPackets: 0,
    reorderedPackets: 0,
    scheduledCopies: 0,
    deliveredPackets: 0,
    deliveredCopies: 0,
    overflowRejectedPackets: 0,
    currentQueueDepth: 0,
    maximumObservedQueueDepth: 0,
    minimumDeliveryLatencyMilliseconds: null,
    maximumDeliveryLatencyMilliseconds: null,
    totalDeliveryLatencyMilliseconds: 0,
    averageDeliveryLatencyMilliseconds: null,
  });
}

function aggregateMetrics(metrics: readonly NetworkImpairmentMetrics[]): NetworkImpairmentMetrics {
  if (metrics.length === 0) return emptyMetrics();
  const deliveredCopies = metrics.reduce((sum, value) => sum + value.deliveredCopies, 0);
  const totalDeliveryLatencyMilliseconds = metrics.reduce(
    (sum, value) => sum + value.totalDeliveryLatencyMilliseconds,
    0,
  );
  const minimumLatencies = metrics.flatMap((value) => (
    value.minimumDeliveryLatencyMilliseconds === null
      ? []
      : [value.minimumDeliveryLatencyMilliseconds]
  ));
  const maximumLatencies = metrics.flatMap((value) => (
    value.maximumDeliveryLatencyMilliseconds === null
      ? []
      : [value.maximumDeliveryLatencyMilliseconds]
  ));
  return Object.freeze({
    sentPackets: metrics.reduce((sum, value) => sum + value.sentPackets, 0),
    droppedPackets: metrics.reduce((sum, value) => sum + value.droppedPackets, 0),
    duplicatedPackets: metrics.reduce((sum, value) => sum + value.duplicatedPackets, 0),
    reorderImpairedPackets: metrics.reduce(
      (sum, value) => sum + value.reorderImpairedPackets,
      0,
    ),
    reorderedPackets: metrics.reduce((sum, value) => sum + value.reorderedPackets, 0),
    scheduledCopies: metrics.reduce((sum, value) => sum + value.scheduledCopies, 0),
    deliveredPackets: metrics.reduce((sum, value) => sum + value.deliveredPackets, 0),
    deliveredCopies,
    overflowRejectedPackets: metrics.reduce(
      (sum, value) => sum + value.overflowRejectedPackets,
      0,
    ),
    currentQueueDepth: metrics.reduce((sum, value) => sum + value.currentQueueDepth, 0),
    maximumObservedQueueDepth: Math.max(
      0,
      ...metrics.map((value) => value.maximumObservedQueueDepth),
    ),
    minimumDeliveryLatencyMilliseconds: minimumLatencies.length === 0
      ? null
      : Math.min(...minimumLatencies),
    maximumDeliveryLatencyMilliseconds: maximumLatencies.length === 0
      ? null
      : Math.max(...maximumLatencies),
    totalDeliveryLatencyMilliseconds,
    averageDeliveryLatencyMilliseconds: deliveredCopies === 0
      ? null
      : totalDeliveryLatencyMilliseconds / deliveredCopies,
  });
}

function safeSocketState(session: MutableImpairmentSession): ReturnType<AuthorityEvidenceConnection['state']> {
  return session.rawConnection?.state() ?? session.socketState;
}

export function createImpairedAuthorityEvidenceTransport(options: {
  readonly baseTransport: AuthorityEvidenceTransport;
  readonly scheduler: AuthorityEvidenceScheduler;
  readonly policy: AuthorityEvidenceImpairmentProfileName | AuthorityEvidenceImpairmentPolicy;
}): AuthorityEvidenceTransport {
  const policy = typeof options.policy === 'string'
    ? requireAuthorityEvidenceImpairmentPolicy(options.policy)
    : options.policy;
  if (policy.schemaVersion !== 1) throw new RangeError('authority impairment policy schema is invalid');
  const sessions: MutableImpairmentSession[] = [];

  const diagnostics = (): AuthorityEvidenceImpairmentDiagnostics => {
    const sessionDiagnostics = sessions.map((session) => Object.freeze({
      connectionOrdinal: session.connectionOrdinal,
      socketState: safeSocketState(session),
      gameplayImpairmentActive: session.gameplayImpairmentActive,
      reliableControlFramesBypassedInbound: session.reliableControlFramesBypassedInbound,
      reliableControlFramesBypassedOutbound: session.reliableControlFramesBypassedOutbound,
      bootstrapGameplayFramesBypassedInbound: session.bootstrapGameplayFramesBypassedInbound,
      bootstrapGameplayFramesBypassedOutbound: session.bootstrapGameplayFramesBypassedOutbound,
      inbound: Object.freeze({
        config: session.inbound.config,
        metrics: session.inbound.metrics(),
      }),
      outbound: Object.freeze({
        config: session.outbound.config,
        metrics: session.outbound.metrics(),
      }),
      strandedCopiesAtClose: session.strandedCopiesAtClose,
      impairmentFaults: session.impairmentFaults,
    }));
    const active = [...sessions].reverse().find((session) => (
      safeSocketState(session) !== 'closed'
    ));
    return deepFreeze({
      schemaVersion: 1,
      profile: policy.profile,
      enabled: policy.enabled,
      policy: policy.sessionPolicy,
      connectionsCreated: sessions.length,
      activeConnectionOrdinal: active?.connectionOrdinal ?? null,
      reliableControlFramesBypassedInbound: sessionDiagnostics.reduce(
        (sum, session) => sum + session.reliableControlFramesBypassedInbound,
        0,
      ),
      reliableControlFramesBypassedOutbound: sessionDiagnostics.reduce(
        (sum, session) => sum + session.reliableControlFramesBypassedOutbound,
        0,
      ),
      bootstrapGameplayFramesBypassedInbound: sessionDiagnostics.reduce(
        (sum, session) => sum + session.bootstrapGameplayFramesBypassedInbound,
        0,
      ),
      bootstrapGameplayFramesBypassedOutbound: sessionDiagnostics.reduce(
        (sum, session) => sum + session.bootstrapGameplayFramesBypassedOutbound,
        0,
      ),
      inbound: {
        config: policy.inbound,
        metrics: aggregateMetrics(sessionDiagnostics.map((session) => session.inbound.metrics)),
      },
      outbound: {
        config: policy.outbound,
        metrics: aggregateMetrics(sessionDiagnostics.map((session) => session.outbound.metrics)),
      },
      sessions: sessionDiagnostics,
    }) as AuthorityEvidenceImpairmentDiagnostics;
  };

  const transport: AuthorityEvidenceTransport = {
    connect(
      url: string,
      callbacks: AuthorityEvidenceTransportCallbacks,
    ): AuthorityEvidenceConnection {
      const session: MutableImpairmentSession = {
        connectionOrdinal: sessions.length + 1,
        inbound: createNetworkImpairmentHarness(
          policy.inbound,
          cloneInboundPayload,
        ),
        outbound: createNetworkImpairmentHarness(policy.outbound),
        rawConnection: null,
        inboundTimer: null,
        outboundTimer: null,
        socketState: 'connecting',
        strandedCopiesAtClose: 0,
        impairmentFaults: 0,
        finalized: false,
        gameplayImpairmentActive: false,
        reliableControlFramesBypassedInbound: 0,
        reliableControlFramesBypassedOutbound: 0,
        bootstrapGameplayFramesBypassedInbound: 0,
        bootstrapGameplayFramesBypassedOutbound: 0,
      };
      sessions.push(session);

      const stopTimer = (direction: 'inbound' | 'outbound'): void => {
        const key = direction === 'inbound' ? 'inboundTimer' : 'outboundTimer';
        const handle = session[key];
        if (handle !== null) options.scheduler.stopAfter(handle);
        session[key] = null;
      };
      const finalize = (): void => {
        if (session.finalized) return;
        session.finalized = true;
        session.socketState = 'closed';
        stopTimer('inbound');
        stopTimer('outbound');
        session.strandedCopiesAtClose = session.inbound.pendingDeliveryCopies
          + session.outbound.pendingDeliveryCopies;
      };
      const failImpairment = (direction: 'inbound' | 'outbound'): void => {
        session.impairmentFaults += 1;
        callbacks.onError(`authority ${direction} impairment transport failed closed`);
        const raw = session.rawConnection;
        if (raw?.state() === 'open' || raw?.state() === 'connecting') {
          // 4011 is the browser-valid private analogue of server-only 1011.
          raw.close(4011, 'development impairment transport failed closed');
        }
      };

      const drainInbound = (): void => {
        const now = schedulerNowMilliseconds(options.scheduler);
        for (const delivery of session.inbound.drain(now)) {
          if (session.finalized) break;
          callbacks.onMessage(delivery.payload);
        }
      };
      const drainOutbound = (): void => {
        const now = schedulerNowMilliseconds(options.scheduler);
        for (const delivery of session.outbound.drain(now)) {
          if (session.finalized) break;
          if (session.rawConnection?.state() !== 'open') {
            throw new Error('underlying authority socket is not open for impaired delivery');
          }
          session.rawConnection.send(delivery.payload);
        }
      };
      const scheduleInbound = (): void => {
        stopTimer('inbound');
        drainInbound();
        const next = session.inbound.nextDeliveryAtMilliseconds;
        if (next === null || session.finalized) return;
        const delay = Math.max(0, next - schedulerNowMilliseconds(options.scheduler));
        session.inboundTimer = options.scheduler.after(() => {
          session.inboundTimer = null;
          try {
            scheduleInbound();
          } catch {
            failImpairment('inbound');
          }
        }, delay);
      };
      const scheduleOutbound = (): void => {
        stopTimer('outbound');
        drainOutbound();
        const next = session.outbound.nextDeliveryAtMilliseconds;
        if (next === null || session.finalized) return;
        const delay = Math.max(0, next - schedulerNowMilliseconds(options.scheduler));
        session.outboundTimer = options.scheduler.after(() => {
          session.outboundTimer = null;
          try {
            scheduleOutbound();
          } catch {
            failImpairment('outbound');
          }
        }, delay);
      };

      try {
        session.rawConnection = options.baseTransport.connect(url, {
          onOpen: () => {
            session.socketState = 'open';
            callbacks.onOpen();
          },
          onMessage: (payload) => {
            if (session.finalized) return;
            try {
              if (!isInboundGameplayFrame(payload)) {
                session.reliableControlFramesBypassedInbound += 1;
                callbacks.onMessage(payload);
                return;
              }
              if (!session.gameplayImpairmentActive) {
                session.bootstrapGameplayFramesBypassedInbound += 1;
                callbacks.onMessage(payload);
                if (protocolMessageType(payload) === 'fullSnapshot') {
                  session.gameplayImpairmentActive = true;
                }
                return;
              }
              session.inbound.send(payload, schedulerNowMilliseconds(options.scheduler));
              scheduleInbound();
            } catch {
              failImpairment('inbound');
            }
          },
          onClose: (code, reason) => {
            finalize();
            callbacks.onClose(code, reason);
          },
          onError: (message) => callbacks.onError(message),
        });
      } catch (error) {
        finalize();
        throw error;
      }

      return Object.freeze({
        state: () => safeSocketState(session),
        send: (payload: string): void => {
          if (session.finalized || session.rawConnection?.state() !== 'open') {
            throw new Error('authority socket is not open');
          }
          if (!isOutboundGameplayFrame(payload)) {
            session.reliableControlFramesBypassedOutbound += 1;
            session.rawConnection.send(payload);
            return;
          }
          if (!session.gameplayImpairmentActive) {
            session.bootstrapGameplayFramesBypassedOutbound += 1;
            session.rawConnection.send(payload);
            return;
          }
          session.outbound.send(payload, schedulerNowMilliseconds(options.scheduler));
          scheduleOutbound();
        },
        close: (code?: number, reason?: string): void => {
          if (session.finalized) return;
          session.socketState = 'closing';
          session.rawConnection?.close(code, reason);
        },
      });
    },
    impairmentDiagnostics: diagnostics,
  };
  return Object.freeze(transport);
}
