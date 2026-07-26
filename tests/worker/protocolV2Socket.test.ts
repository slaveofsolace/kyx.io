/// <reference types="@cloudflare/vitest-pool-workers/types" />

import {
  env,
  evictDurableObject,
  runInDurableObject,
  runDurableObjectAlarm,
  SELF,
  reset,
} from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PROTOCOL_VERSION,
  RELIABLE_EVENT_STREAM_VERSION,
  SNAPSHOT_BASELINE_VERSION,
  decodeServerMessage,
  encodeClientMessage,
  type ClientMessage,
  type FullSnapshotMessage,
  type ServerMessage,
  type SnapshotEntity,
} from '../../src/net';
import {
  MAX_MESSAGES_PER_RATE_WINDOW,
  type SocketAttachment,
} from '../../worker/security';
import type { KyxAuthorityEnv } from '../../worker/env';

const ALLOWED_ORIGIN = 'http://127.0.0.1:5173';
const AUTHORITY_ORIGIN = 'https://authority.test';
const EXPECTED_RULESET_HASH = '039ae95bed7ee716';
const EXPECTED_MOVEMENT_PROFILE_HASH = '8ab4ed437a4393c0';
const RESUME_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const authorityEnv = env as unknown as KyxAuthorityEnv;

interface SocketProbe {
  readonly socket: WebSocket;
  readonly messages: ServerMessage[];
  readonly decodeErrors: string[];
  readonly waiters: Set<() => void>;
}

interface RoomCreated {
  readonly roomCode: string;
  readonly roomPath: string;
  readonly socketPath: string;
  readonly metricsPath: string;
}

interface SocketAttachmentHistoryHarness {
  readonly socketAttachments: Map<string, SocketAttachment>;
}

interface SocketSnapshotState {
  readonly sessionGeneration: number;
  readonly lastAcknowledgedSnapshotTick: number | null;
  readonly lastAcknowledgedSnapshotBaselineId: string | null;
  readonly lastSentSnapshotTick: number | null;
  readonly lastSentSnapshotBaselineId: string | null;
  readonly sentSnapshotHistory: SocketAttachment['sentSnapshotHistory'];
  readonly snapshotAckDebtStartedAt: number | null;
}

interface RoomMetrics {
  readonly serverTick: number;
  readonly lifecycle: string;
  readonly players: number;
  readonly connectedPlayers: number;
  readonly acceptedInputs: number;
  readonly transport: {
    readonly inboundMessagesReceived: number;
    readonly inboundMessagesRateAccepted: number;
    readonly inboundMessagesRateRejected: number;
    readonly deltaSnapshotsSent: number;
    readonly snapshotAcksAccepted: number;
    readonly snapshotAcksRejected: number;
    readonly snapshotAckTimeoutFallbacks: number;
    readonly snapshotAckDebtEpisodes: number;
    readonly snapshotAckDebtSnapshotsCoalesced: number;
    readonly snapshotAckDebtReliableBatchesCoalesced: number;
    readonly snapshotAckDebtRecoveries: number;
    readonly snapshotAckDebtEvictions: number;
    readonly maximumSnapshotAckDebtMilliseconds: number;
    readonly reliableEventBatchesSent: number;
    readonly reliableEventResendBatches: number;
    readonly slowConsumerEvictions: number;
    readonly lobbyCheckpointRehydrates: number;
    readonly lobbyCheckpointPlayersRestored: number;
    readonly durableAlarmRuns: number;
    readonly expiredResumeSessionsPruned: number;
  };
}

type ServerMessageOfType<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

const sockets = new Set<WebSocket>();

afterEach(async () => {
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
      socket.close(1000, 'test cleanup');
    }
  }
  sockets.clear();
  await reset();
});

function socketPayload(data: unknown): string | Uint8Array {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new TypeError(`Unsupported WebSocket test payload: ${Object.prototype.toString.call(data)}`);
}

async function connectSocket(socketPath: string): Promise<SocketProbe> {
  const response = await SELF.fetch(`${AUTHORITY_ORIGIN}${socketPath}`, {
    headers: {
      Origin: ALLOWED_ORIGIN,
      Upgrade: 'websocket',
    },
  });
  if (response.status !== 101 || response.webSocket === null) {
    throw new Error(`WebSocket upgrade failed with status ${response.status}`);
  }

  const socket = response.webSocket;
  const probe: SocketProbe = {
    socket,
    messages: [],
    decodeErrors: [],
    waiters: new Set(),
  };
  socket.addEventListener('message', (event) => {
    try {
      const decoded = decodeServerMessage(socketPayload(event.data));
      if (decoded.ok) probe.messages.push(decoded.value);
      else probe.decodeErrors.push(`${decoded.error.code}:${decoded.error.path}`);
    } catch (error) {
      probe.decodeErrors.push(error instanceof Error ? error.message : String(error));
    }
    for (const waiter of [...probe.waiters]) waiter();
  });
  socket.accept();
  sockets.add(socket);
  return probe;
}

async function socketSnapshotState(
  roomCode: string,
  playerId: string,
): Promise<SocketSnapshotState | null> {
  const stub = authorityEnv.KYX_ROOM.getByName(roomCode);
  return await runInDurableObject(stub, async (instance) => {
    const harness = instance as unknown as SocketAttachmentHistoryHarness;
    const attachment = [...harness.socketAttachments.values()].find((candidate) => (
      candidate.playerId === playerId
    ));
    if (attachment === undefined) return null;
    return {
      sessionGeneration: attachment.sessionGeneration,
      lastAcknowledgedSnapshotTick: attachment.lastAcknowledgedSnapshotTick,
      lastAcknowledgedSnapshotBaselineId: attachment.lastAcknowledgedSnapshotBaselineId,
      lastSentSnapshotTick: attachment.lastSentSnapshotTick,
      lastSentSnapshotBaselineId: attachment.lastSentSnapshotBaselineId,
      sentSnapshotHistory: attachment.sentSnapshotHistory,
      snapshotAckDebtStartedAt: attachment.snapshotAckDebtStartedAt,
    };
  });
}

async function waitForSocketSnapshotState(
  roomCode: string,
  playerId: string,
  predicate: (state: SocketSnapshotState) => boolean,
  label: string,
): Promise<SocketSnapshotState> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const state = await socketSnapshotState(roomCode, playerId);
    if (state !== null && predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function sendClient(probe: SocketProbe, message: ClientMessage): void {
  const encoded = encodeClientMessage(message);
  if (!encoded.ok) {
    throw new Error(`Invalid test client message: ${encoded.error.code}:${encoded.error.path}`);
  }
  probe.socket.send(encoded.json);
}

function latestReceivedEventId(probe: SocketProbe, fallback: string | null): string | null {
  for (let index = probe.messages.length - 1; index >= 0; index -= 1) {
    const message = probe.messages[index];
    if (message?.type !== 'reliableEventBatch') continue;
    return message.events.at(-1)?.id ?? fallback;
  }
  return fallback;
}

function acknowledgeSnapshot(
  probe: SocketProbe,
  snapshot: FullSnapshotMessage | ServerMessageOfType<'deltaSnapshot'>,
  fallbackEventId: string | null,
): void {
  sendClient(probe, {
    protocolVersion: PROTOCOL_VERSION,
    type: 'ack',
    snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
    reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
    snapshotBaselineId: snapshot.snapshotBaselineId,
    serverTick: snapshot.serverTick,
    lastEventId: latestReceivedEventId(probe, fallbackEventId),
  });
}

function startAutomaticSnapshotAcknowledgements(
  probe: SocketProbe,
  initialEventId: string | null,
): () => void {
  let lastEventId = latestReceivedEventId(probe, initialEventId);
  const listener = (event: MessageEvent) => {
    const decoded = decodeServerMessage(socketPayload(event.data));
    if (!decoded.ok) return;
    if (decoded.value.type === 'reliableEventBatch') {
      lastEventId = decoded.value.events.at(-1)?.id ?? lastEventId;
      return;
    }
    if (decoded.value.type !== 'fullSnapshot' && decoded.value.type !== 'deltaSnapshot') return;
    if (probe.socket.readyState !== WebSocket.OPEN) return;
    acknowledgeSnapshot(probe, decoded.value, lastEventId);
  };
  probe.socket.addEventListener('message', listener);
  return () => probe.socket.removeEventListener('message', listener);
}

function waitForSocketClose(
  probe: SocketProbe,
  timeoutMilliseconds = 5_000,
): Promise<Readonly<{ code: number; reason: string }>> {
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const listener = (event: CloseEvent) => {
      if (timeout !== null) clearTimeout(timeout);
      resolve(Object.freeze({ code: event.code, reason: event.reason }));
    };
    timeout = setTimeout(() => {
      probe.socket.removeEventListener('close', listener);
      reject(new Error('Timed out waiting for socket close'));
    }, timeoutMilliseconds);
    probe.socket.addEventListener('close', listener, { once: true });
  });
}

function waitForMessage(
  probe: SocketProbe,
  predicate: (message: ServerMessage) => boolean,
  label: string,
  timeoutMilliseconds = 5_000,
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      probe.waiters.delete(check);
      if (timeout !== null) clearTimeout(timeout);
    };
    const check = () => {
      if (probe.decodeErrors.length > 0) {
        cleanup();
        reject(new Error(`Server protocol decode failed: ${probe.decodeErrors.join(', ')}`));
        return;
      }
      const match = probe.messages.find(predicate);
      if (match !== undefined) {
        cleanup();
        resolve(match);
      }
    };
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(
        `Timed out waiting for ${label}; received ${probe.messages.map(({ type }) => type).join(', ')}`,
      ));
    }, timeoutMilliseconds);
    probe.waiters.add(check);
    check();
  });
}

async function waitForType<T extends ServerMessage['type']>(
  probe: SocketProbe,
  type: T,
  predicate: (message: ServerMessageOfType<T>) => boolean = () => true,
): Promise<ServerMessageOfType<T>> {
  return await waitForMessage(
    probe,
    (message) => message.type === type && predicate(message as ServerMessageOfType<T>),
    type,
  ) as ServerMessageOfType<T>;
}

function waitForProbe(
  probe: SocketProbe,
  predicate: () => boolean,
  label: string,
  timeoutMilliseconds = 5_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      probe.waiters.delete(check);
      if (timeout !== null) clearTimeout(timeout);
    };
    const check = () => {
      if (probe.decodeErrors.length > 0) {
        cleanup();
        reject(new Error(`Server protocol decode failed: ${probe.decodeErrors.join(', ')}`));
        return;
      }
      if (predicate()) {
        cleanup();
        resolve();
      }
    };
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${label}`));
    }, timeoutMilliseconds);
    probe.waiters.add(check);
    check();
  });
}

async function createRoom(): Promise<RoomCreated> {
  const response = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
    method: 'POST',
    headers: { Origin: ALLOWED_ORIGIN },
  });
  if (response.status !== 201) throw new Error(`Room creation failed with status ${response.status}`);
  return await response.json() as RoomCreated;
}

async function roomMetrics(metricsPath: string): Promise<RoomMetrics> {
  const response = await SELF.fetch(`${AUTHORITY_ORIGIN}${metricsPath}`, {
    headers: { Origin: ALLOWED_ORIGIN },
  });
  if (!response.ok) throw new Error(`Metrics request failed with status ${response.status}`);
  const body = await response.json() as { readonly metrics: RoomMetrics };
  return body.metrics;
}

async function waitForMetrics(
  metricsPath: string,
  predicate: (metrics: RoomMetrics) => boolean,
  label: string,
): Promise<RoomMetrics> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const metrics = await roomMetrics(metricsPath);
    if (predicate(metrics)) return metrics;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out polling room metrics for ${label}`);
}

function joinMessage(roomCode: string, requestId: string, displayName: string): ClientMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'joinRoom',
    requestId,
    roomCode,
    displayName,
  };
}

function resumeMessage(roomCode: string, requestId: string, resumeToken: string): ClientMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'resumeRoom',
    requestId,
    roomCode,
    resumeToken,
  };
}

function entity(
  snapshot: FullSnapshotMessage | ServerMessageOfType<'deltaSnapshot'>,
  playerId: string,
): SnapshotEntity {
  const found = snapshot.entities.find(({ id }) => id === playerId);
  if (found === undefined) throw new Error(`Snapshot is missing ${playerId}`);
  return found;
}

function positionChanged(left: SnapshotEntity, right: SnapshotEntity): boolean {
  return left.xMillimeters !== right.xMillimeters
    || left.yMillimeters !== right.yMillimeters
    || left.zMillimeters !== right.zMillimeters;
}

describe('protocol-v2 WebSocket Worker integration', () => {
  it('reports exact received, accepted, and rejected rate-window counter deltas', async () => {
    const room = await createRoom();
    const flood = await connectSocket(room.socketPath);
    await waitForType(flood, 'welcome');
    const before = await roomMetrics(room.metricsPath);

    for (let index = 0; index <= MAX_MESSAGES_PER_RATE_WINDOW; index += 1) {
      flood.socket.send(JSON.stringify({
        protocolVersion: PROTOCOL_VERSION,
        type: 'ack',
        snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
        reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
        snapshotBaselineId: 'baseline.rate-window-test',
        serverTick: 0,
        lastEventId: `event.${index + 1}`,
      }));
    }

    await waitForType(flood, 'error', ({ code }) => code === 'RATE_LIMITED');
    const after = await waitForMetrics(
      room.metricsPath,
      ({ transport }) => (
        transport.inboundMessagesRateRejected
          === before.transport.inboundMessagesRateRejected + 1
      ),
      'rate-limit counters',
    );
    const messagesSent = MAX_MESSAGES_PER_RATE_WINDOW + 1;
    expect(after.transport.inboundMessagesReceived
      - before.transport.inboundMessagesReceived).toBe(messagesSent);
    expect(after.transport.inboundMessagesRateAccepted
      - before.transport.inboundMessagesRateAccepted).toBe(MAX_MESSAGES_PER_RATE_WINDOW);
    expect(after.transport.inboundMessagesRateRejected
      - before.transport.inboundMessagesRateRejected).toBe(1);
  });

  it('sends deltas only from acknowledged baselines and resends reliable events until cumulative ACK', async () => {
    const room = await createRoom();
    const first = await connectSocket(room.socketPath);
    await waitForType(first, 'welcome');
    sendClient(first, joinMessage(room.roomCode, 'req.join.delta-first', 'Delta First'));
    const firstJoin = await waitForType(
      first,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.delta-first',
    );
    const firstFull = await waitForType(
      first,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === firstJoin.playerId,
    );
    const firstJoinEvent = await waitForType(
      first,
      'reliableEventBatch',
      ({ events }) => events.some((event) => (
        event.kind === 'playerJoined' && event.subjectId === firstJoin.playerId
      )),
    );
    const firstEventId = firstJoinEvent.events.at(-1)?.id ?? null;
    sendClient(first, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ack',
      snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      snapshotBaselineId: firstFull.snapshotBaselineId,
      serverTick: firstFull.serverTick,
      lastEventId: firstEventId,
    });

    const second = await connectSocket(room.socketPath);
    await waitForType(second, 'welcome');
    sendClient(second, joinMessage(room.roomCode, 'req.join.delta-second', 'Delta Second'));
    const secondJoin = await waitForType(
      second,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.delta-second',
    );
    await waitForType(
      second,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === secondJoin.playerId,
    );

    const secondEvent = await waitForType(
      first,
      'reliableEventBatch',
      ({ events }) => events.some(({ subjectId }) => subjectId === secondJoin.playerId),
    );
    const secondEventId = secondEvent.events.at(-1)?.id ?? null;
    const firstDelta = await waitForType(
      first,
      'deltaSnapshot',
      ({ baseTick }) => baseTick === firstFull.serverTick,
    );
    expect(firstDelta.entities.some(({ id }) => id === secondJoin.playerId)).toBe(true);
    sendClient(first, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ack',
      snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      snapshotBaselineId: firstDelta.snapshotBaselineId,
      serverTick: firstDelta.serverTick,
      lastEventId: firstEventId,
    });
    await waitForProbe(first, () => first.messages.filter((message) => (
      message.type === 'reliableEventBatch'
      && message.events.some(({ id }) => id === secondEventId)
    )).length >= 2, 'reliable event resend after snapshot debt recovery');
    const chainedDelta = await waitForType(
      first,
      'deltaSnapshot',
      ({ baseTick, serverTick }) => (
        baseTick === firstDelta.serverTick && serverTick > firstDelta.serverTick
      ),
    );
    expect(chainedDelta.snapshotBaselineVersion).toBe(SNAPSHOT_BASELINE_VERSION);

    sendClient(first, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ack',
      snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      snapshotBaselineId: chainedDelta.snapshotBaselineId,
      serverTick: chainedDelta.serverTick,
      lastEventId: 'event.999999',
    });
    const reliableRejected = await waitForType(
      first,
      'error',
      ({ code, detail }) => code === 'ACK_REJECTED' && detail === 'event_unknown_event',
    );
    expect(reliableRejected.detail).toBe('event_unknown_event');

    sendClient(first, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ack',
      snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      snapshotBaselineId: chainedDelta.snapshotBaselineId,
      serverTick: chainedDelta.serverTick + 100,
      lastEventId: secondEventId,
    });
    const rejected = await waitForType(
      first,
      'error',
      ({ code, detail }) => code === 'ACK_REJECTED' && detail === 'snapshot_tick_future',
    );
    expect(rejected.detail).toBe('snapshot_tick_future');

    const metrics = await roomMetrics(room.metricsPath);
    expect(metrics.transport).toMatchObject({
      deltaSnapshotsSent: expect.any(Number),
      snapshotAcksAccepted: expect.any(Number),
      snapshotAcksRejected: expect.any(Number),
      reliableEventBatchesSent: expect.any(Number),
      reliableEventResendBatches: expect.any(Number),
      reliableEventAcksRejected: expect.any(Number),
    });
    expect(metrics.transport.deltaSnapshotsSent).toBeGreaterThanOrEqual(2);
    expect(metrics.transport.snapshotAcksAccepted).toBeGreaterThanOrEqual(2);
    expect(metrics.transport.snapshotAcksRejected).toBeGreaterThanOrEqual(1);
    expect(metrics.transport.reliableEventResendBatches).toBeGreaterThanOrEqual(1);
    expect(metrics.transport.reliableEventAcksRejected).toBeGreaterThanOrEqual(1);
  });

  it('evicts a real non-acknowledging socket while an acknowledging peer keeps advancing', async () => {
    const room = await createRoom();
    const stalled = await connectSocket(room.socketPath);
    await waitForType(stalled, 'welcome');
    sendClient(stalled, joinMessage(room.roomCode, 'req.join.stalled', 'Stalled'));
    const stalledJoin = await waitForType(
      stalled,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.stalled',
    );
    await waitForType(
      stalled,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === stalledJoin.playerId,
    );
    const stalledClose = waitForSocketClose(stalled);

    const healthy = await connectSocket(room.socketPath);
    await waitForType(healthy, 'welcome');
    sendClient(healthy, joinMessage(room.roomCode, 'req.join.healthy', 'Healthy'));
    const healthyJoin = await waitForType(
      healthy,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.healthy',
    );
    const healthyInitial = await waitForType(
      healthy,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === healthyJoin.playerId,
    );
    acknowledgeSnapshot(healthy, healthyInitial, healthyInitial.reliableEventBaselineId);
    const stopAutomaticAcks = startAutomaticSnapshotAcknowledgements(
      healthy,
      healthyInitial.reliableEventBaselineId,
    );

    const evicted = await waitForMetrics(
      room.metricsPath,
      ({ connectedPlayers, transport }) => (
        connectedPlayers === 1 && transport.snapshotAckDebtEvictions === 1
      ),
      'snapshot ACK-debt eviction',
    );
    const close = await stalledClose;
    expect(close).toEqual({ code: 1013, reason: 'Snapshot acknowledgement timeout' });
    expect(evicted.transport).toMatchObject({
      snapshotAckDebtEpisodes: expect.any(Number),
      snapshotAckDebtSnapshotsCoalesced: expect.any(Number),
      snapshotAckDebtReliableBatchesCoalesced: expect.any(Number),
      snapshotAckDebtEvictions: 1,
      slowConsumerEvictions: 1,
    });
    expect(evicted.transport.snapshotAckDebtEpisodes).toBeGreaterThanOrEqual(2);
    expect(evicted.transport.snapshotAckDebtSnapshotsCoalesced).toBeGreaterThan(0);
    expect(evicted.transport.snapshotAckDebtReliableBatchesCoalesced).toBeGreaterThan(0);
    expect(evicted.transport.snapshotAckTimeoutFallbacks).toBeGreaterThanOrEqual(3);
    expect(evicted.transport.maximumSnapshotAckDebtMilliseconds).toBeGreaterThanOrEqual(3_000);
    expect(healthy.socket.readyState).toBe(WebSocket.OPEN);

    const healthyAfterEviction = await waitForMessage(
      healthy,
      (message) => (
        (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
        && message.serverTick > evicted.serverTick
      ),
      'healthy post-eviction snapshot',
    );
    expect(healthyAfterEviction.type).toMatch(/^(?:fullSnapshot|deltaSnapshot)$/u);
    expect(healthy.socket.readyState).toBe(WebSocket.OPEN);
    stopAutomaticAcks();
  });

  it('advances a retained older snapshot ACK overtaken by a full-snapshot fallback', async () => {
    const room = await createRoom();
    const delayed = await connectSocket(room.socketPath);
    await waitForType(delayed, 'welcome');
    sendClient(delayed, joinMessage(room.roomCode, 'req.join.delayed', 'Delayed'));
    const delayedJoin = await waitForType(
      delayed,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.delayed',
    );
    const delayedInitial = await waitForType(
      delayed,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === delayedJoin.playerId,
    );

    const peer = await connectSocket(room.socketPath);
    await waitForType(peer, 'welcome');
    sendClient(peer, joinMessage(room.roomCode, 'req.join.peer', 'Peer'));
    const peerJoin = await waitForType(
      peer,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.peer',
    );
    const peerInitial = await waitForType(
      peer,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === peerJoin.playerId,
    );
    acknowledgeSnapshot(delayed, delayedInitial, delayedInitial.reliableEventBaselineId);
    acknowledgeSnapshot(peer, peerInitial, peerInitial.reliableEventBaselineId);
    const stopPeerAcks = startAutomaticSnapshotAcknowledgements(
      peer,
      peerInitial.reliableEventBaselineId,
    );

    const delayedDelta = await waitForType(
      delayed,
      'deltaSnapshot',
      ({ serverTick }) => serverTick > delayedInitial.serverTick,
    );
    const fallback = await waitForType(
      delayed,
      'fullSnapshot',
      ({ serverTick }) => serverTick > delayedDelta.serverTick,
    );
    const overtakenState = await waitForSocketSnapshotState(
      room.roomCode,
      delayedJoin.playerId,
      ({ lastSentSnapshotTick }) => lastSentSnapshotTick === fallback.serverTick,
      'fallback-overtaken sent snapshot history',
    );
    expect(overtakenState.sentSnapshotHistory).toEqual(expect.arrayContaining([
      { serverTick: delayedDelta.serverTick, snapshotBaselineId: delayedDelta.snapshotBaselineId },
      { serverTick: fallback.serverTick, snapshotBaselineId: fallback.snapshotBaselineId },
    ]));
    expect(overtakenState.sentSnapshotHistory.at(-1)).toEqual({
      serverTick: fallback.serverTick,
      snapshotBaselineId: fallback.snapshotBaselineId,
    });
    const beforeIntermediateAck = await roomMetrics(room.metricsPath);
    acknowledgeSnapshot(delayed, delayedDelta, delayedInitial.reliableEventBaselineId);
    await waitForMetrics(
      room.metricsPath,
      ({ transport }) => (
        transport.snapshotAcksAccepted > beforeIntermediateAck.transport.snapshotAcksAccepted
      ),
      'retained intermediate ACK acceptance',
    );
    const afterIntermediateAck = await socketSnapshotState(room.roomCode, delayedJoin.playerId);
    expect(afterIntermediateAck).toMatchObject({
      lastAcknowledgedSnapshotTick: delayedDelta.serverTick,
      lastAcknowledgedSnapshotBaselineId: delayedDelta.snapshotBaselineId,
      lastSentSnapshotTick: fallback.serverTick,
    });
    expect(afterIntermediateAck?.snapshotAckDebtStartedAt).not.toBeNull();
    expect(afterIntermediateAck?.sentSnapshotHistory).toEqual([{
      serverTick: fallback.serverTick,
      snapshotBaselineId: fallback.snapshotBaselineId,
    }]);
    acknowledgeSnapshot(delayed, fallback, delayedInitial.reliableEventBaselineId);
    const stopDelayedAcks = startAutomaticSnapshotAcknowledgements(
      delayed,
      delayedInitial.reliableEventBaselineId,
    );

    const postFallbackDelta = await waitForType(
      delayed,
      'deltaSnapshot',
      ({ serverTick }) => serverTick > fallback.serverTick,
    );
    expect(delayed.messages.filter((message) => (
      message.type === 'error'
      && message.code === 'ACK_REJECTED'
    ))).toEqual([]);
    const metrics = await roomMetrics(room.metricsPath);
    expect(metrics.connectedPlayers).toBe(2);
    expect(metrics.transport.snapshotAckDebtRecoveries).toBeGreaterThanOrEqual(1);
    expect(metrics.transport.snapshotAcksRejected).toBe(0);
    const recoveredState = await waitForSocketSnapshotState(
      room.roomCode,
      delayedJoin.playerId,
      ({ lastAcknowledgedSnapshotTick, lastSentSnapshotTick, sentSnapshotHistory }) => (
         lastAcknowledgedSnapshotTick === lastSentSnapshotTick
          && lastSentSnapshotTick !== null
          && lastSentSnapshotTick >= postFallbackDelta.serverTick
          && sentSnapshotHistory.length === 0
      ),
      'exact latest ACK debt recovery and history prune',
    );
    expect(recoveredState.sentSnapshotHistory).toEqual([]);
    stopDelayedAcks();

    sendClient(delayed, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ack',
      snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      snapshotBaselineId: `${recoveredState.lastSentSnapshotBaselineId}.forged`,
      serverTick: recoveredState.lastSentSnapshotTick ?? 0,
      lastEventId: latestReceivedEventId(delayed, delayedInitial.reliableEventBaselineId),
    });
    const forgedBaselineRejection = await waitForType(
      delayed,
      'error',
      ({ code, detail }) => (
        code === 'ACK_REJECTED' && detail === 'snapshot_baseline_id_not_sent'
      ),
    );
    expect(forgedBaselineRejection.detail).toBe('snapshot_baseline_id_not_sent');

    acknowledgeSnapshot(delayed, delayedInitial, delayedInitial.reliableEventBaselineId);
    const prunedRejection = await waitForType(
      delayed,
      'error',
      ({ code, detail }) => code === 'ACK_REJECTED' && detail === 'snapshot_tick_regression',
    );
    expect(prunedRejection.detail).toBe('snapshot_tick_regression');
    const stopRecoveredAcks = startAutomaticSnapshotAcknowledgements(
      delayed,
      delayedInitial.reliableEventBaselineId,
    );
    await waitForType(
      delayed,
      'deltaSnapshot',
      ({ serverTick }) => serverTick > (recoveredState.lastSentSnapshotTick ?? 0),
    );
    const afterPrunedRejection = await waitForSocketSnapshotState(
      room.roomCode,
      delayedJoin.playerId,
      ({ lastAcknowledgedSnapshotTick }) => (
        lastAcknowledgedSnapshotTick !== null
        && lastAcknowledgedSnapshotTick > (recoveredState.lastAcknowledgedSnapshotTick ?? 0)
      ),
      'post-pruned-ACK baseline integrity',
    );
    expect(afterPrunedRejection.lastAcknowledgedSnapshotTick).toBeGreaterThanOrEqual(
      recoveredState.lastAcknowledgedSnapshotTick ?? 0,
    );
    const afterPrunedMetrics = await roomMetrics(room.metricsPath);
    expect(afterPrunedMetrics.connectedPlayers).toBe(2);
    expect(afterPrunedMetrics.transport.snapshotAcksRejected).toBe(2);
    stopRecoveredAcks();
    stopPeerAcks();
  });

  it('runs two authoritative sockets and securely resumes one immutable player session', async () => {
    const room = await createRoom();
    const first = await connectSocket(room.socketPath);
    const second = await connectSocket(room.socketPath);

    const firstWelcome = await waitForType(first, 'welcome');
    const secondWelcome = await waitForType(second, 'welcome');
    expect(firstWelcome.protocolVersion).toBe(2);
    expect(firstWelcome.protocolConfig).toEqual({
      protocolVersion: 2,
      snapshotBaselineVersion: 1,
      reliableEventStreamVersion: 1,
      simulationHz: 20,
      snapshotHz: 10,
      maxMessageBytes: 16_384,
      maxCommandsPerBatch: 32,
    });
    expect(firstWelcome.simulationIdentity).toMatchObject({
      schemaVersion: 1,
      mapId: 'phase4_flat_run',
      rulesetId: 'revamped_classic',
      rulesetRevision: 2,
      rulesetHash: EXPECTED_RULESET_HASH,
      movementProfileId: 'phase3_hypothesis_v1',
      movementProfileRevision: 1,
      movementProfileHash: EXPECTED_MOVEMENT_PROFILE_HASH,
      fixtureId: 'flat_run',
      physicsAdapterId: 'rapier3d_deterministic_compat',
      physicsAdapterVersion: '0.19.3',
    });
    expect(firstWelcome.simulationIdentity.fixtureHash).toMatch(/^[a-f0-9]{16}$/u);
    expect(secondWelcome.simulationIdentity).toEqual(firstWelcome.simulationIdentity);

    sendClient(first, joinMessage(room.roomCode, 'req.join.first', 'First Player'));
    const firstJoin = await waitForType(
      first,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.first',
    );
    const firstInitialSnapshot = await waitForType(
      first,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === firstJoin.playerId,
    );
    expect(firstJoin.connectionMode).toBe('joined');
    expect(firstJoin.resumeToken).toMatch(RESUME_TOKEN_PATTERN);
    expect(firstInitialSnapshot.localReconciliation.player.lastProcessedSequence).toBe(-1);
    expect(firstInitialSnapshot.simulationIdentity).toEqual(firstWelcome.simulationIdentity);
    const firstJoinedSocketState = await waitForSocketSnapshotState(
      room.roomCode,
      firstJoin.playerId,
      ({ lastSentSnapshotTick }) => lastSentSnapshotTick === firstInitialSnapshot.serverTick,
      'new session snapshot history seed',
    );
    expect(firstJoinedSocketState).toMatchObject({
      lastAcknowledgedSnapshotTick: null,
      lastSentSnapshotTick: firstInitialSnapshot.serverTick,
      sentSnapshotHistory: [{
        serverTick: firstInitialSnapshot.serverTick,
        snapshotBaselineId: firstInitialSnapshot.snapshotBaselineId,
      }],
    });
    acknowledgeSnapshot(
      first,
      firstInitialSnapshot,
      firstInitialSnapshot.reliableEventBaselineId,
    );

    sendClient(second, joinMessage(room.roomCode, 'req.join.second', 'Second Player'));
    const secondJoin = await waitForType(
      second,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.second',
    );
    const secondInitialSnapshot = await waitForType(
      second,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === secondJoin.playerId,
    );
    expect(secondJoin.connectionMode).toBe('joined');
    expect(secondJoin.matchId).toBe(firstJoin.matchId);
    expect(secondJoin.roomId).toBe(firstJoin.roomId);
    expect(secondJoin.simulationIdentity).toEqual(firstJoin.simulationIdentity);
    expect(secondInitialSnapshot.matchId).toBe(firstJoin.matchId);
    expect(secondInitialSnapshot.entities.map(({ id }) => id).sort()).toEqual(
      [firstJoin.playerId, secondJoin.playerId].sort(),
    );
    acknowledgeSnapshot(
      second,
      secondInitialSnapshot,
      secondInitialSnapshot.reliableEventBaselineId,
    );

    const independentTickSnapshot = await waitForType(
      second,
      'deltaSnapshot',
      ({ serverTick }) => serverTick > secondJoin.serverTick,
    );
    expect(independentTickSnapshot.serverTick).toBeGreaterThan(secondJoin.serverTick);
    expect(independentTickSnapshot.localReconciliation.player.lastProcessedSequence).toBe(-1);
    const firstBeforeInput = entity(secondInitialSnapshot, firstJoin.playerId);
    acknowledgeSnapshot(
      second,
      independentTickSnapshot,
      secondInitialSnapshot.reliableEventBaselineId,
    );

    sendClient(first, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputBatch',
      commands: [{
        type: 'input',
        sequence: 0,
        clientTick: independentTickSnapshot.serverTick,
        moveX: 0,
        moveY: 127,
        lookYawDeltaMilliDegrees: 0,
        lookPitchDeltaMilliDegrees: 0,
        heldButtons: 0,
        pressedButtons: 0,
        releasedButtons: 0,
      }],
    });
    const sequenceZeroAck = await waitForType(
      first,
      'inputAck',
      ({ lastProcessedInputSequence }) => lastProcessedInputSequence === 0,
    );
    expect(sequenceZeroAck.serverTick).toBeGreaterThan(independentTickSnapshot.serverTick);

    const peerMovementSnapshot = await waitForType(
      second,
      'deltaSnapshot',
      (snapshot) => {
        const moved = snapshot.entities.find(({ id }) => id === firstJoin.playerId);
        return snapshot.serverTick >= sequenceZeroAck.serverTick
          && moved !== undefined
          && positionChanged(firstBeforeInput, moved);
      },
    );
    const firstAfterInput = entity(peerMovementSnapshot, firstJoin.playerId);
    expect(firstAfterInput.zMillimeters).toBeGreaterThan(firstBeforeInput.zMillimeters);
    expect(peerMovementSnapshot.localReconciliation.player.lastProcessedSequence).toBe(-1);
    acknowledgeSnapshot(
      second,
      peerMovementSnapshot,
      secondInitialSnapshot.reliableEventBaselineId,
    );

    first.socket.send(JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      type: 'SetPosition',
      xMillimeters: 999_999,
      yMillimeters: 999_999,
      zMillimeters: 999_999,
    }));
    const forgedRejection = await waitForType(
      first,
      'error',
      ({ code }) => code === 'PROTOCOL_FORBIDDEN_COMMAND',
    );
    expect(forgedRejection.detail).toBe('$.type');
    expect(first.socket.readyState).toBe(WebSocket.OPEN);

    first.socket.close(1000, 'test reconnect');
    const disconnected = await waitForMetrics(
      room.metricsPath,
      ({ connectedPlayers }) => connectedPlayers === 1,
      'first player disconnect',
    );
    expect(disconnected.players).toBe(2);
    expect(disconnected.acceptedInputs).toBe(1);
    sendClient(second, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'requestFullSnapshot',
      requestId: 'req.resync.frozen-peer',
      reason: 'manual_evidence',
    });
    const frozenPeerSnapshot = await waitForType(second, 'fullSnapshot', ({ resyncRequestId }) => (
      resyncRequestId === 'req.resync.frozen-peer'
    ));
    const frozenFirstPosition = entity(frozenPeerSnapshot, firstJoin.playerId);
    acknowledgeSnapshot(
      second,
      frozenPeerSnapshot,
      frozenPeerSnapshot.reliableEventBaselineId,
    );

    const resumed = await connectSocket(room.socketPath);
    await waitForType(resumed, 'welcome');
    sendClient(resumed, resumeMessage(room.roomCode, 'req.resume.first', firstJoin.resumeToken));
    const resumedJoin = await waitForType(
      resumed,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.resume.first',
    );
    const resumedSnapshot = await waitForType(
      resumed,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === firstJoin.playerId,
    );
    expect(resumedJoin).toMatchObject({
      playerId: firstJoin.playerId,
      roomId: firstJoin.roomId,
      matchId: firstJoin.matchId,
      connectionMode: 'resumed',
    });
    expect(resumedJoin.resumeToken).toMatch(RESUME_TOKEN_PATTERN);
    expect(resumedJoin.resumeToken).not.toBe(firstJoin.resumeToken);
    expect(resumedJoin.simulationIdentity).toEqual(firstJoin.simulationIdentity);
    expect(resumedSnapshot.localReconciliation.player.lastProcessedSequence).toBe(0);
    expect(resumedSnapshot.localReconciliation.player.feetPosition).toEqual({
      x: frozenFirstPosition.xMillimeters,
      y: frozenFirstPosition.yMillimeters,
      z: frozenFirstPosition.zMillimeters,
    });
    const resumedSocketState = await waitForSocketSnapshotState(
      room.roomCode,
      firstJoin.playerId,
      ({ lastSentSnapshotTick }) => lastSentSnapshotTick === resumedSnapshot.serverTick,
      'resumed session snapshot history seed',
    );
    expect(resumedSocketState.sessionGeneration).toBeGreaterThan(
      firstJoinedSocketState.sessionGeneration,
    );
    expect(resumedSocketState).toMatchObject({
      lastAcknowledgedSnapshotTick: null,
      lastSentSnapshotTick: resumedSnapshot.serverTick,
      sentSnapshotHistory: [{
        serverTick: resumedSnapshot.serverTick,
        snapshotBaselineId: resumedSnapshot.snapshotBaselineId,
      }],
    });
    acknowledgeSnapshot(
      resumed,
      resumedSnapshot,
      resumedSnapshot.reliableEventBaselineId,
    );

    sendClient(resumed, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'requestFullSnapshot',
      requestId: 'req.resync.first',
      reason: 'history_gap',
    });
    const explicitResync = await waitForType(
      resumed,
      'fullSnapshot',
      ({ resyncRequestId }) => resyncRequestId === 'req.resync.first',
    );
    expect(explicitResync.localReconciliation.player.id).toBe(firstJoin.playerId);
    expect(explicitResync.matchId).toBe(firstJoin.matchId);
    expect(explicitResync.serverTick).toBeGreaterThanOrEqual(resumedSnapshot.serverTick);

    sendClient(resumed, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'requestFullSnapshot',
      requestId: 'req.resync.too-fast',
      reason: 'manual_evidence',
    });
    const resyncRateLimited = await waitForType(
      resumed,
      'error',
      ({ requestId }) => requestId === 'req.resync.too-fast',
    );
    expect(resyncRateLimited.code).toBe('FULL_SNAPSHOT_RATE_LIMITED');

    const replay = await connectSocket(room.socketPath);
    await waitForType(replay, 'welcome');
    sendClient(replay, resumeMessage(room.roomCode, 'req.resume.replay', firstJoin.resumeToken));
    const replayRejected = await waitForType(
      replay,
      'joinRejected',
      ({ requestId }) => requestId === 'req.resume.replay',
    );
    expect(replayRejected.code).toBe('RESUME_REJECTED');

    const duplicate = await connectSocket(room.socketPath);
    await waitForType(duplicate, 'welcome');
    sendClient(
      duplicate,
      resumeMessage(room.roomCode, 'req.resume.duplicate', resumedJoin.resumeToken),
    );
    const duplicateRejected = await waitForType(
      duplicate,
      'joinRejected',
      ({ requestId }) => requestId === 'req.resume.duplicate',
    );
    expect(duplicateRejected.code).toBe('DUPLICATE_SESSION');

    const finalMetrics = await waitForMetrics(
      room.metricsPath,
      ({ connectedPlayers, acceptedInputs }) => connectedPlayers === 2 && acceptedInputs === 1,
      'resumed session metrics',
    );
    expect(finalMetrics.serverTick).toBeGreaterThan(sequenceZeroAck.serverTick);
    expect(finalMetrics.lifecycle).toMatch(/^(?:warmup|active)$/u);
  });

  it('rehydrates one lobby player and preserves cumulative reliable delivery across evictions', async () => {
    const room = await createRoom();
    const first = await connectSocket(room.socketPath);
    await waitForType(first, 'welcome');
    sendClient(first, joinMessage(room.roomCode, 'req.join.hibernate-live', 'Hibernate Live'));
    const joined = await waitForType(
      first,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.hibernate-live',
    );
    const initial = await waitForType(
      first,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === joined.playerId,
    );
    const joinedEventBatch = await waitForType(
      first,
      'reliableEventBatch',
      ({ events }) => events.some((event) => (
        event.kind === 'playerJoined' && event.subjectId === joined.playerId
      )),
    );
    const joinedEvent = joinedEventBatch.events.find((event) => (
      event.kind === 'playerJoined' && event.subjectId === joined.playerId
    ));
    expect(joinedEvent).toBeDefined();
    const joinedEventId = joinedEvent?.id ?? null;
    expect(joinedEventId).toBe('event.1');
    const fullSnapshotCount = first.messages.filter(({ type }) => type === 'fullSnapshot').length;
    const reliableBatchCount = first.messages.filter(
      ({ type }) => type === 'reliableEventBatch',
    ).length;
    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    const checkpointBeforeEviction = await runInDurableObject(
      stub,
      async (_instance, state) => ({
        recoveryState: [...state.storage.sql.exec<Record<string, string>>(
          'SELECT recovery_state FROM room_runtime_v2 WHERE singleton = 1',
        )][0]?.recovery_state,
        checkpointPlayers: [...state.storage.sql.exec<Record<string, number>>(
          'SELECT COUNT(*) AS count FROM room_lobby_players_v1',
        )][0]?.count,
        reliabilityCheckpoint: JSON.parse(
          [...state.storage.sql.exec<Record<string, string>>(
            'SELECT checkpoint_json FROM room_lobby_reliability_v1 WHERE singleton = 1',
          )][0]?.checkpoint_json ?? 'null',
        ) as {
          readonly reliableEvents: {
            readonly nextSequence: number;
            readonly events: readonly { readonly id: string }[];
          };
          readonly playerEventAcknowledgements: readonly {
            readonly playerId: string;
            readonly lastAcknowledgedEventId: string | null;
          }[];
        } | null,
        alarm: await state.storage.getAlarm(),
      }),
    );
    expect(checkpointBeforeEviction).toMatchObject({
      recoveryState: 'lobby_checkpointed',
      checkpointPlayers: 1,
      reliabilityCheckpoint: {
        reliableEvents: {
          nextSequence: 2,
          events: [{ id: joinedEventId }],
        },
        playerEventAcknowledgements: [{
          playerId: joined.playerId,
          lastAcknowledgedEventId: null,
        }],
      },
      alarm: expect.any(Number),
    });

    await evictDurableObject(stub);
    expect(first.socket.readyState).toBe(WebSocket.OPEN);
    sendClient(first, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ping',
      nonce: 9_001,
      clientTick: 0,
    });
    const pong = await waitForType(
      first,
      'pong',
      ({ nonce }) => nonce === 9_001,
    );
    expect(pong.serverTick).toBe(0);
    await waitForProbe(
      first,
      () => first.messages.filter(({ type }) => type === 'fullSnapshot').length
        > fullSnapshotCount,
      'post-hibernation full snapshot',
    );
    await waitForProbe(
      first,
      () => first.messages.filter(({ type }) => type === 'reliableEventBatch').length
        > reliableBatchCount,
      'post-hibernation reliable event replay',
    );
    const rehydrated = first.messages.filter(
      (message): message is FullSnapshotMessage => message.type === 'fullSnapshot',
    ).at(-1);
    const replayedEvent = first.messages.filter(
      (
        message,
      ): message is ServerMessageOfType<'reliableEventBatch'> => (
        message.type === 'reliableEventBatch'
      ),
    ).slice(reliableBatchCount).flatMap(({ events }) => events)
      .find(({ id }) => id === joinedEventId);
    expect(rehydrated).toBeDefined();
    expect(replayedEvent).toEqual(joinedEvent);
    expect(rehydrated?.matchId).toBe(joined.matchId);
    expect(rehydrated?.localReconciliation.player.id).toBe(joined.playerId);
    expect(rehydrated?.localReconciliation.player.feetPosition).toEqual(
      initial.localReconciliation.player.feetPosition,
    );
    expect(rehydrated?.serverTick).toBe(0);
    const rehydratedSocketState = await waitForSocketSnapshotState(
      room.roomCode,
      joined.playerId,
      ({ lastSentSnapshotTick, sentSnapshotHistory }) => (
        lastSentSnapshotTick === rehydrated?.serverTick
        && sentSnapshotHistory.length === 1
      ),
      'checkpoint-resynchronized snapshot history seed',
    );
    expect(rehydratedSocketState).toMatchObject({
      lastAcknowledgedSnapshotTick: null,
      lastSentSnapshotTick: rehydrated?.serverTick,
      sentSnapshotHistory: [{
        serverTick: rehydrated?.serverTick,
        snapshotBaselineId: rehydrated?.snapshotBaselineId,
      }],
    });
    await expect(roomMetrics(room.metricsPath)).resolves.toMatchObject({
      lifecycle: 'lobby',
      serverTick: 0,
      players: 1,
      connectedPlayers: 1,
      transport: {
        lobbyCheckpointRehydrates: 1,
        lobbyCheckpointPlayersRestored: 1,
      },
    });
    if (rehydrated === undefined) throw new Error('Missing post-hibernation snapshot');
    sendClient(first, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ack',
      snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
      reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
      snapshotBaselineId: rehydrated.snapshotBaselineId,
      serverTick: rehydrated.serverTick,
      lastEventId: joinedEventId,
    });
    let persistedAcknowledgement: string | null | undefined;
    for (let attempt = 0; attempt < 200; attempt += 1) {
      persistedAcknowledgement = await runInDurableObject(stub, async (_instance, state) => {
        const checkpointJson = [...state.storage.sql.exec<Record<string, string>>(
          'SELECT checkpoint_json FROM room_lobby_reliability_v1 WHERE singleton = 1',
        )][0]?.checkpoint_json;
        if (checkpointJson === undefined) return undefined;
        const checkpoint = JSON.parse(checkpointJson) as {
          readonly playerEventAcknowledgements: readonly {
            readonly playerId: string;
            readonly lastAcknowledgedEventId: string | null;
          }[];
        };
        return checkpoint.playerEventAcknowledgements.find(
          ({ playerId }) => playerId === joined.playerId,
        )?.lastAcknowledgedEventId;
      });
      if (persistedAcknowledgement === joinedEventId) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(persistedAcknowledgement).toBe(joinedEventId);

    const secondEvictionFullSnapshotCount = first.messages.filter(
      ({ type }) => type === 'fullSnapshot',
    ).length;
    const acknowledgedReliableBatchCount = first.messages.filter(
      ({ type }) => type === 'reliableEventBatch',
    ).length;
    await evictDurableObject(stub);
    expect(first.socket.readyState).toBe(WebSocket.OPEN);
    sendClient(first, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ping',
      nonce: 9_002,
      clientTick: 0,
    });
    await waitForType(first, 'pong', ({ nonce }) => nonce === 9_002);
    await waitForProbe(
      first,
      () => first.messages.filter(({ type }) => type === 'fullSnapshot').length
        > secondEvictionFullSnapshotCount,
      'acknowledged post-hibernation full snapshot',
    );
    const acknowledgedRehydrated = first.messages.filter(
      (message): message is FullSnapshotMessage => message.type === 'fullSnapshot',
    ).at(-1);
    expect(acknowledgedRehydrated?.reliableEventBaselineId).toBe(joinedEventId);
    expect(first.messages.filter(
      ({ type }) => type === 'reliableEventBatch',
    )).toHaveLength(acknowledgedReliableBatchCount);

    const second = await connectSocket(room.socketPath);
    await waitForType(second, 'welcome');
    sendClient(second, joinMessage(room.roomCode, 'req.join.hibernate-second', 'Second'));
    await waitForType(
      second,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.hibernate-second',
    );
    const started = await waitForMetrics(
      room.metricsPath,
      ({ lifecycle, connectedPlayers, serverTick }) => (
        connectedPlayers === 2 && lifecycle === 'warmup' && serverTick > 0
      ),
      'post-hibernation two-player warmup',
    );
    expect(started.players).toBe(2);
    const activePersistence = await runInDurableObject(
      stub,
      async (_instance, state) => ({
        recoveryState: [...state.storage.sql.exec<Record<string, string>>(
          'SELECT recovery_state FROM room_runtime_v2 WHERE singleton = 1',
        )][0]?.recovery_state,
        checkpointPlayers: [...state.storage.sql.exec<Record<string, number>>(
          'SELECT COUNT(*) AS count FROM room_lobby_players_v1',
        )][0]?.count,
        alarm: await state.storage.getAlarm(),
      }),
    );
    expect(activePersistence).toEqual({
      recoveryState: 'active_uncheckpointed',
      checkpointPlayers: 0,
      alarm: null,
    });
  });

  it('rehydrates a disconnected lobby player and rotates its resume token after eviction', async () => {
    const room = await createRoom();
    const first = await connectSocket(room.socketPath);
    await waitForType(first, 'welcome');
    sendClient(first, joinMessage(room.roomCode, 'req.join.hibernate-resume', 'Hibernate Resume'));
    const joined = await waitForType(
      first,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.hibernate-resume',
    );
    const initial = await waitForType(
      first,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === joined.playerId,
    );
    first.socket.close(1000, 'hibernate reconnect wait');
    await waitForMetrics(
      room.metricsPath,
      ({ lifecycle, players, connectedPlayers }) => (
        lifecycle === 'lobby' && players === 1 && connectedPlayers === 0
      ),
      'disconnected lobby checkpoint',
    );
    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    const disconnectedCheckpoint = await runInDurableObject(
      stub,
      async (_instance, state) => ({
        recoveryState: [...state.storage.sql.exec<Record<string, string>>(
          'SELECT recovery_state FROM room_runtime_v2 WHERE singleton = 1',
        )][0]?.recovery_state,
        checkpointPlayers: [...state.storage.sql.exec<Record<string, number>>(
          'SELECT COUNT(*) AS count FROM room_lobby_players_v1',
        )][0]?.count,
        alarm: await state.storage.getAlarm(),
      }),
    );
    expect(disconnectedCheckpoint).toMatchObject({
      recoveryState: 'lobby_checkpointed',
      checkpointPlayers: 1,
      alarm: expect.any(Number),
    });
    await evictDurableObject(stub);

    const resumed = await connectSocket(room.socketPath);
    await waitForType(resumed, 'welcome');
    sendClient(
      resumed,
      resumeMessage(room.roomCode, 'req.resume.hibernate', joined.resumeToken),
    );
    const resumedJoin = await waitForType(
      resumed,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.resume.hibernate',
    );
    const resumedSnapshot = await waitForType(
      resumed,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === joined.playerId,
    );
    expect(resumedJoin).toMatchObject({
      connectionMode: 'resumed',
      playerId: joined.playerId,
      roomId: joined.roomId,
      matchId: joined.matchId,
    });
    expect(resumedJoin.resumeToken).toMatch(RESUME_TOKEN_PATTERN);
    expect(resumedJoin.resumeToken).not.toBe(joined.resumeToken);
    expect(resumedSnapshot.serverTick).toBe(0);
    expect(resumedSnapshot.localReconciliation.player.feetPosition).toEqual(
      initial.localReconciliation.player.feetPosition,
    );
    await expect(roomMetrics(room.metricsPath)).resolves.toMatchObject({
      lifecycle: 'lobby',
      serverTick: 0,
      players: 1,
      connectedPlayers: 1,
    });
  });

  it('expires an evicted reconnect-wait lobby idempotently through its durable alarm', async () => {
    const room = await createRoom();
    const first = await connectSocket(room.socketPath);
    await waitForType(first, 'welcome');
    sendClient(first, joinMessage(room.roomCode, 'req.join.hibernate-expiry', 'Expiry'));
    const joined = await waitForType(
      first,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.hibernate-expiry',
    );
    first.socket.close(1000, 'expire reconnect wait');
    await waitForMetrics(
      room.metricsPath,
      ({ lifecycle, players, connectedPlayers }) => (
        lifecycle === 'lobby' && players === 1 && connectedPlayers === 0
      ),
      'reconnect wait before alarm expiry',
    );
    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec(
        'UPDATE resume_sessions SET expires_at = ? WHERE player_id = ?',
        Date.now() - 1,
        joined.playerId,
      );
      await state.storage.setAlarm(Date.now() + 60_000);
    });
    await evictDurableObject(stub);
    await expect(runDurableObjectAlarm(stub)).resolves.toBe(true);
    const expired = await runInDurableObject(stub, async (_instance, state) => ({
      recoveryState: [...state.storage.sql.exec<Record<string, string>>(
        'SELECT recovery_state FROM room_runtime_v2 WHERE singleton = 1',
      )][0]?.recovery_state,
      checkpointPlayers: [...state.storage.sql.exec<Record<string, number>>(
        'SELECT COUNT(*) AS count FROM room_lobby_players_v1',
      )][0]?.count,
      reliabilityCheckpoints: [...state.storage.sql.exec<Record<string, number>>(
        'SELECT COUNT(*) AS count FROM room_lobby_reliability_v1',
      )][0]?.count,
      resumeSessions: [...state.storage.sql.exec<Record<string, number>>(
        'SELECT COUNT(*) AS count FROM resume_sessions',
      )][0]?.count,
      alarm: await state.storage.getAlarm(),
    }));
    expect(expired).toEqual({
      recoveryState: 'pristine',
      checkpointPlayers: 0,
      reliabilityCheckpoints: 0,
      resumeSessions: 0,
      alarm: null,
    });
    const reopened = await SELF.fetch(`${AUTHORITY_ORIGIN}${room.roomPath}`, {
      method: 'POST',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(reopened.status).toBe(201);
    await expect(roomMetrics(room.metricsPath)).resolves.toMatchObject({
      lifecycle: 'created',
      serverTick: 0,
      players: 0,
      connectedPlayers: 0,
      transport: {
        durableAlarmRuns: 1,
        expiredResumeSessionsPruned: 1,
      },
    });
  });
});
