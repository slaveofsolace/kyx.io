import type {
  NetworkImpairmentMetrics,
  ResolvedNetworkImpairmentConfig,
} from '../client/netcode/networkImpairment';

export type AuthorityEvidenceTransportPayload = string | Uint8Array;

export interface AuthorityEvidenceImpairmentDirectionDiagnostics {
  readonly config: ResolvedNetworkImpairmentConfig;
  readonly metrics: NetworkImpairmentMetrics;
}

export interface AuthorityEvidenceImpairmentSessionDiagnostics {
  readonly connectionOrdinal: number;
  readonly socketState: 'connecting' | 'open' | 'closing' | 'closed';
  readonly gameplayImpairmentActive: boolean;
  readonly reliableControlFramesBypassedInbound: number;
  readonly reliableControlFramesBypassedOutbound: number;
  readonly bootstrapGameplayFramesBypassedInbound: number;
  readonly bootstrapGameplayFramesBypassedOutbound: number;
  readonly inbound: AuthorityEvidenceImpairmentDirectionDiagnostics;
  readonly outbound: AuthorityEvidenceImpairmentDirectionDiagnostics;
  /** Queued delivery copies intentionally abandoned when the underlying socket closed. */
  readonly strandedCopiesAtClose: number;
  readonly impairmentFaults: number;
}

export interface AuthorityEvidenceImpairmentDiagnostics {
  readonly schemaVersion: 1;
  readonly profile: string;
  readonly enabled: boolean;
  readonly policy: {
    readonly socketWrapping: 'fresh_per_connect';
    readonly harnessLifecycle: 'fresh_inbound_and_outbound_per_connection';
    readonly seedLifecycle: 'restart_profile_seed_per_connection';
    readonly metricsRetention: 'transport_lifetime_aggregate_and_per_connection';
    readonly closePolicy: 'cancel_delivery_timers_and_retain_stranded_queue_metrics';
    readonly aggregation: 'sum_counters_extrema_across_sessions_weighted_latency_average';
    readonly frameScope: 'gameplay_input_snapshot_ack_after_initial_full_snapshot';
    readonly reliableControlPolicy: 'bypass_synthetic_loss_duplication_reorder_and_latency';
    readonly bootstrapPolicy: 'first_full_snapshot_delivered_before_gameplay_impairment';
  };
  readonly connectionsCreated: number;
  readonly activeConnectionOrdinal: number | null;
  readonly reliableControlFramesBypassedInbound: number;
  readonly reliableControlFramesBypassedOutbound: number;
  readonly bootstrapGameplayFramesBypassedInbound: number;
  readonly bootstrapGameplayFramesBypassedOutbound: number;
  readonly inbound: AuthorityEvidenceImpairmentDirectionDiagnostics;
  readonly outbound: AuthorityEvidenceImpairmentDirectionDiagnostics;
  readonly sessions: readonly AuthorityEvidenceImpairmentSessionDiagnostics[];
}

export interface AuthorityEvidenceTransportCallbacks {
  readonly onOpen: () => void;
  readonly onMessage: (payload: AuthorityEvidenceTransportPayload) => void;
  readonly onClose: (code: number, reason: string) => void;
  readonly onError: (message: string) => void;
}

export interface AuthorityEvidenceConnection {
  readonly state: () => 'connecting' | 'open' | 'closing' | 'closed';
  readonly send: (payload: string) => void;
  readonly close: (code?: number, reason?: string) => void;
}

/** Narrow injection seam for nominal sockets and the later impairment harness. */
export interface AuthorityEvidenceTransport {
  readonly connect: (
    url: string,
    callbacks: AuthorityEvidenceTransportCallbacks,
  ) => AuthorityEvidenceConnection;
  /** Present only when the route has deliberately installed the dev impairment wrapper. */
  readonly impairmentDiagnostics?: () => AuthorityEvidenceImpairmentDiagnostics;
}

export interface AuthorityEvidenceScheduler {
  readonly nowMilliseconds: () => number;
  readonly repeat: (callback: () => void, intervalMilliseconds: number) => unknown;
  readonly stopRepeating: (handle: unknown) => void;
  readonly after: (callback: () => void, delayMilliseconds: number) => unknown;
  readonly stopAfter: (handle: unknown) => void;
}

function browserSocketState(socket: WebSocket): ReturnType<AuthorityEvidenceConnection['state']> {
  switch (socket.readyState) {
    case WebSocket.CONNECTING: return 'connecting';
    case WebSocket.OPEN: return 'open';
    case WebSocket.CLOSING: return 'closing';
    default: return 'closed';
  }
}

export function createBrowserAuthorityEvidenceTransport(): AuthorityEvidenceTransport {
  const transport: AuthorityEvidenceTransport = {
    connect(
      url: string,
      callbacks: AuthorityEvidenceTransportCallbacks,
    ): AuthorityEvidenceConnection {
      const socket = new WebSocket(url);
      socket.binaryType = 'arraybuffer';
      socket.addEventListener('open', () => callbacks.onOpen());
      socket.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (typeof event.data === 'string') {
          callbacks.onMessage(event.data);
          return;
        }
        if (event.data instanceof ArrayBuffer) {
          callbacks.onMessage(new Uint8Array(event.data));
          return;
        }
        callbacks.onError('authority socket delivered an unsupported payload type');
      });
      socket.addEventListener('close', (event) => callbacks.onClose(event.code, event.reason));
      socket.addEventListener('error', () => callbacks.onError('authority socket transport error'));
      return Object.freeze({
        state: () => browserSocketState(socket),
        send: (payload: string) => socket.send(payload),
        close: (code?: number, reason?: string) => socket.close(code, reason),
      });
    },
  };
  return Object.freeze(transport);
}

export function createBrowserAuthorityEvidenceScheduler(): AuthorityEvidenceScheduler {
  const scheduler: AuthorityEvidenceScheduler = {
    nowMilliseconds: () => performance.now(),
    repeat: (callback: () => void, intervalMilliseconds: number) => window.setInterval(
      callback,
      intervalMilliseconds,
    ),
    stopRepeating: (handle: unknown) => window.clearInterval(handle as number),
    after: (callback: () => void, delayMilliseconds: number) => window.setTimeout(
      callback,
      delayMilliseconds,
    ),
    stopAfter: (handle: unknown) => window.clearTimeout(handle as number),
  };
  return Object.freeze(scheduler);
}
