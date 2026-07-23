export interface TransportLimitContract {
  readonly schemaVersion: 1;
  readonly path: 'worker/transport-limits.json';
  readonly sha256: string;
  readonly maxMessagesPerRateWindow: number;
  readonly maxBytesPerRateWindow: number;
  readonly rateWindowMilliseconds: number;
  readonly maxSocketBufferedBytes: number;
  readonly slowConsumerGraceMilliseconds: number;
  readonly maxSnapshotAckDebtMilliseconds: number;
}

export interface TransportFloodPlan {
  readonly messagesSent: number;
  readonly messagesRateAccepted: number;
  readonly messagesRateRejected: 1;
}

export interface TransportFloodCounterSnapshot {
  readonly inboundMessagesReceived: number;
  readonly inboundMessagesRateAccepted: number;
  readonly inboundMessagesRateRejected: number;
}

export interface TransportFloodEvidence {
  readonly schemaVersion: 1;
  readonly contract: TransportLimitContract;
  readonly messagesSent: number;
  readonly workerCounters: {
    readonly before: TransportFloodCounterSnapshot;
    readonly after: TransportFloodCounterSnapshot;
  };
  readonly rejectionCode: string;
  readonly close: {
    readonly code: number;
    readonly reason: string;
    readonly wasClean: boolean;
  };
}

export interface TransportFloodVerification {
  readonly expected: TransportFloodPlan;
  readonly observed: {
    readonly messagesSent: number | null;
    readonly messagesReceived: number | null;
    readonly messagesRateAccepted: number | null;
    readonly messagesRateRejected: number | null;
  };
  readonly checks: Readonly<Record<string, boolean>>;
  readonly passed: boolean;
}

export function normalizeTransportLimitContract(
  value: unknown,
  sha256: string,
): TransportLimitContract;

export function deriveTransportFloodPlan(
  contract: Pick<TransportLimitContract, 'maxMessagesPerRateWindow'>,
): TransportFloodPlan;

export function verifyTransportFloodEvidence(
  evidence: unknown,
  expectedContract: TransportLimitContract,
): TransportFloodVerification;
