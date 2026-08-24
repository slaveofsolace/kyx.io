import { describe, expect, it } from 'vitest';

import { KyxRoom } from '../../worker/room';
import {
  MAX_SOCKET_BUFFERED_BYTES,
  SLOW_CONSUMER_GRACE_MILLISECONDS,
  type SocketAttachment,
} from '../../worker/security';

interface BackpressureTransportMetrics {
  inboundMessagesReceived: number;
  inboundMessagesRateAccepted: number;
  inboundMessagesRateRejected: number;
  fullSnapshotsSent: number;
  deltaSnapshotsSent: number;
  snapshotAcksAccepted: number;
  snapshotAcksRejected: number;
  snapshotAckTimeoutFallbacks: number;
  snapshotAckDebtEpisodes: number;
  snapshotAckDebtSnapshotsCoalesced: number;
  snapshotAckDebtReliableBatchesCoalesced: number;
  snapshotAckDebtRecoveries: number;
  snapshotAckDebtEvictions: number;
  maximumSnapshotAckDebtMilliseconds: number;
  snapshotHistoryFallbacks: number;
  reliableEventsRecorded: number;
  reliableEventBatchesSent: number;
  reliableEventResendBatches: number;
  reliableEventAcksAccepted: number;
  reliableEventAcksRejected: number;
  reliableEventHistoryFallbacks: number;
  backpressureEpisodes: number;
  backpressureMessagesCoalesced: number;
  slowConsumerRecoveries: number;
  slowConsumerEvictions: number;
  maximumObservedSocketBufferedBytes: number;
}

interface BackpressureRoomHarness {
  authority: {
    fullSnapshot(): unknown;
    disconnectConnection(connectionId: string): boolean;
  };
  ctx: { getWebSockets(): WebSocket[] };
  socketAttachments: Map<string, SocketAttachment>;
  transportMetrics: BackpressureTransportMetrics;
  timerActive: boolean;
  broadcastInputAcks(): void;
}

interface FakeSocketProbe {
  readonly socket: WebSocket;
  readonly sent: string[];
  readonly closes: Array<Readonly<{ code: number; reason: string }>>;
  setBufferedAmount(value: number): void;
  serializedAttachment(): SocketAttachment;
}

function attachment(overrides: Partial<SocketAttachment> = {}): SocketAttachment {
  return Object.freeze({
    schemaVersion: 9,
    roomCode: 'KYX-234567',
    connectionId: 'connection.slow-consumer',
    allocationLeaseId: null,
    preJoinExpiresAt: null,
    playerId: 'player.slow-consumer',
    spectatorId: null,
    sessionGeneration: 1,
    rateWindowStartedAt: 1_000,
    messagesInRateWindow: 0,
    bytesInRateWindow: 0,
    lastSeenAt: 1_000,
    lastFullSnapshotRequestAt: null,
    lastAcknowledgedSnapshotTick: null,
    lastAcknowledgedSnapshotBaselineId: null,
    lastSentSnapshotTick: null,
    lastSentSnapshotBaselineId: null,
    sentSnapshotHistory: Object.freeze([]),
    lastSnapshotSentAt: null,
    snapshotAckDebtStartedAt: null,
    lastAcknowledgedEventId: null,
    lastSentReliableEventId: null,
    backpressureStartedAt: null,
    combatPlayerScoresV1: false,
    ...overrides,
  });
}

function transportMetrics(): BackpressureTransportMetrics {
  return {
    inboundMessagesReceived: 0,
    inboundMessagesRateAccepted: 0,
    inboundMessagesRateRejected: 0,
    fullSnapshotsSent: 0,
    deltaSnapshotsSent: 0,
    snapshotAcksAccepted: 0,
    snapshotAcksRejected: 0,
    snapshotAckTimeoutFallbacks: 0,
    snapshotAckDebtEpisodes: 0,
    snapshotAckDebtSnapshotsCoalesced: 0,
    snapshotAckDebtReliableBatchesCoalesced: 0,
    snapshotAckDebtRecoveries: 0,
    snapshotAckDebtEvictions: 0,
    maximumSnapshotAckDebtMilliseconds: 0,
    snapshotHistoryFallbacks: 0,
    reliableEventsRecorded: 0,
    reliableEventBatchesSent: 0,
    reliableEventResendBatches: 0,
    reliableEventAcksAccepted: 0,
    reliableEventAcksRejected: 0,
    reliableEventHistoryFallbacks: 0,
    backpressureEpisodes: 0,
    backpressureMessagesCoalesced: 0,
    slowConsumerRecoveries: 0,
    slowConsumerEvictions: 0,
    maximumObservedSocketBufferedBytes: 0,
  };
}

function fakeSocket(initialAttachment: SocketAttachment, initialBufferedAmount: number): FakeSocketProbe {
  let bufferedAmount = initialBufferedAmount;
  let readyState = WebSocket.OPEN;
  let serialized = initialAttachment;
  const sent: string[] = [];
  const closes: Array<Readonly<{ code: number; reason: string }>> = [];
  const socket = {
    get bufferedAmount() { return bufferedAmount; },
    get readyState() { return readyState; },
    deserializeAttachment: () => serialized,
    serializeAttachment: (value: unknown) => { serialized = value as SocketAttachment; },
    send: (value: string) => { sent.push(value); },
    close: (code: number, reason: string) => {
      closes.push(Object.freeze({ code, reason }));
      readyState = WebSocket.CLOSING;
    },
  } as unknown as WebSocket;
  return {
    socket,
    sent,
    closes,
    setBufferedAmount: (value) => { bufferedAmount = value; },
    serializedAttachment: () => serialized,
  };
}

function roomHarness(
  socketProbe: FakeSocketProbe,
  initialAttachment: SocketAttachment,
): BackpressureRoomHarness {
  const room = Object.create(KyxRoom.prototype) as BackpressureRoomHarness;
  room.socketAttachments = new Map([[initialAttachment.connectionId, initialAttachment]]);
  room.transportMetrics = transportMetrics();
  room.timerActive = true;
  room.ctx = { getWebSockets: () => [socketProbe.socket] };
  room.authority = {
    fullSnapshot: () => ({
      serverTick: 42,
      players: [{
        playerId: initialAttachment.playerId,
        lastProcessedInputSequence: 7,
      }],
    }),
    disconnectConnection: () => false,
  };
  return room;
}

describe('Worker slow-consumer backpressure', () => {
  it('coalesces supersedable traffic and resumes after the socket drains', () => {
    const initial = attachment();
    const socket = fakeSocket(initial, MAX_SOCKET_BUFFERED_BYTES + 1);
    const room = roomHarness(socket, initial);

    room.broadcastInputAcks();

    const saturated = socket.serializedAttachment();
    expect(saturated.backpressureStartedAt).toEqual(expect.any(Number));
    expect(socket.sent).toEqual([]);
    expect(socket.closes).toEqual([]);
    expect(room.transportMetrics).toMatchObject({
      backpressureEpisodes: 1,
      backpressureMessagesCoalesced: 1,
      slowConsumerRecoveries: 0,
      slowConsumerEvictions: 0,
      maximumObservedSocketBufferedBytes: MAX_SOCKET_BUFFERED_BYTES + 1,
    });

    socket.setBufferedAmount(0);
    room.broadcastInputAcks();

    expect(socket.serializedAttachment().backpressureStartedAt).toBeNull();
    expect(socket.sent).toHaveLength(1);
    expect(room.transportMetrics.slowConsumerRecoveries).toBe(1);
  });

  it('preserves default healthy-client input ACK behavior at the exact byte ceiling', () => {
    const initial = attachment();
    const socket = fakeSocket(initial, MAX_SOCKET_BUFFERED_BYTES);
    const room = roomHarness(socket, initial);

    room.broadcastInputAcks();

    expect(socket.closes).toEqual([]);
    expect(socket.sent).toHaveLength(1);
    expect(JSON.parse(socket.sent[0] ?? '{}')).toMatchObject({
      protocolVersion: 2,
      type: 'inputAck',
      serverTick: 42,
      lastProcessedInputSequence: 7,
    });
    expect(room.transportMetrics).toMatchObject({
      backpressureEpisodes: 0,
      backpressureMessagesCoalesced: 0,
      slowConsumerRecoveries: 0,
      slowConsumerEvictions: 0,
      maximumObservedSocketBufferedBytes: MAX_SOCKET_BUFFERED_BYTES,
    });
  });

  it('evicts a continuously saturated client with stable code 1013 after 1,000 ms', () => {
    const initial = attachment({
      backpressureStartedAt: Date.now() - SLOW_CONSUMER_GRACE_MILLISECONDS - 1,
    });
    const socket = fakeSocket(initial, MAX_SOCKET_BUFFERED_BYTES + 1);
    const room = roomHarness(socket, initial);

    room.broadcastInputAcks();

    expect(socket.sent).toEqual([]);
    expect(socket.closes).toEqual([{ code: 1013, reason: 'Slow consumer' }]);
    expect(room.socketAttachments.has(initial.connectionId)).toBe(false);
    expect(room.transportMetrics).toMatchObject({
      backpressureEpisodes: 0,
      backpressureMessagesCoalesced: 0,
      slowConsumerRecoveries: 0,
      slowConsumerEvictions: 1,
      maximumObservedSocketBufferedBytes: MAX_SOCKET_BUFFERED_BYTES + 1,
    });
  });
});
