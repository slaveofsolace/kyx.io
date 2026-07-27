/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env, reset, runInDurableObject, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PROTOCOL_VERSION,
  RELIABLE_EVENT_STREAM_VERSION,
  SNAPSHOT_BASELINE_VERSION,
  decodeServerMessage,
  encodeClientMessage,
  type ClientMessage,
  type DeltaSnapshotMessage,
  type FullSnapshotMessage,
  type JoinAcceptedMessage,
  type ServerMessage,
} from '../../src/net';
import {
  P511_INKFALL_REV2_COMBAT_PROFILE,
  P58D_COMBAT_PROFILE_HEADER,
} from '../../worker/combatRuntime';
import type { KyxAuthorityEnv } from '../../worker/env';

const ALLOWED_ORIGIN = 'http://127.0.0.1:5173';
const AUTHORITY_ORIGIN = 'https://authority.test';
const CLIENT_COUNT = 8;
const SOAK_ROUNDS = 60;
const SOAK_ROUND_MILLISECONDS = 100;
const MINIMUM_TICK_SAMPLES = 100;
const MAXIMUM_TICK_P99_MILLISECONDS = 50;
const textEncoder = new TextEncoder();
const authorityEnv = env as unknown as KyxAuthorityEnv;

interface RoomCreated {
  readonly roomCode: string;
  readonly socketPath: string;
  readonly metricsPath: string;
}

type SnapshotMessage = FullSnapshotMessage | DeltaSnapshotMessage;
type ServerMessageOfType<T extends ServerMessage['type']> =
  Extract<ServerMessage, { readonly type: T }>;

interface SocketProbe {
  readonly socket: WebSocket;
  readonly messages: ServerMessage[];
  readonly decodeErrors: string[];
  readonly waiters: Set<() => void>;
  sentBytes: number;
  sentMessages: number;
  receivedBytes: number;
  receivedMessages: number;
  lastAcknowledgedBaselineId: string | null;
}

interface JoinedClient {
  readonly ordinal: number;
  readonly probe: SocketProbe;
  readonly join: JoinAcceptedMessage;
}

interface TickExecutionMetrics {
  readonly sampleCapacity: number;
  readonly samples: number;
  readonly p50Milliseconds: number | null;
  readonly p95Milliseconds: number | null;
  readonly p99Milliseconds: number | null;
  readonly maximumMilliseconds: number | null;
}

interface RoomMetrics {
  readonly lifecycle: string;
  readonly players: number;
  readonly connectedPlayers: number;
  readonly serverTick: number;
  readonly acceptedInputs: number;
  readonly lastTickFailure: string | null;
  readonly authorityTickExecution: TickExecutionMetrics;
  readonly transport: Readonly<Record<string, number>>;
}

interface ControlledCombatResult {
  readonly finalEventId: string;
  readonly checkpoint: {
    readonly clock: { readonly serverTick: number };
    readonly players: readonly {
      readonly playerId: string;
      readonly life: { readonly phase: string; readonly healthPoints: number };
    }[];
    readonly match: {
      readonly feedSequence: number;
      readonly teamScores: readonly { readonly teamId: string; readonly score: number }[];
    };
  };
}

const sockets = new Set<WebSocket>();

afterEach(async () => {
  for (const socket of sockets) {
    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
      socket.close(1000, 'authority soak cleanup');
    }
  }
  sockets.clear();
  await reset();
});

function payloadBytes(data: unknown): Uint8Array {
  if (typeof data === 'string') return textEncoder.encode(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  throw new TypeError(`Unsupported WebSocket payload: ${Object.prototype.toString.call(data)}`);
}

async function createRoom(): Promise<RoomCreated> {
  const response = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
    method: 'POST',
    headers: {
      Origin: ALLOWED_ORIGIN,
      [P58D_COMBAT_PROFILE_HEADER]: P511_INKFALL_REV2_COMBAT_PROFILE,
    },
  });
  if (response.status !== 201) {
    throw new Error(`Room creation failed: ${response.status} ${await response.text()}`);
  }
  return await response.json() as RoomCreated;
}

async function connectSocket(socketPath: string): Promise<SocketProbe> {
  const response = await SELF.fetch(`${AUTHORITY_ORIGIN}${socketPath}`, {
    headers: { Origin: ALLOWED_ORIGIN, Upgrade: 'websocket' },
  });
  if (response.status !== 101 || response.webSocket === null) {
    throw new Error(`WebSocket upgrade failed: ${response.status}`);
  }
  const probe: SocketProbe = {
    socket: response.webSocket,
    messages: [],
    decodeErrors: [],
    waiters: new Set(),
    sentBytes: 0,
    sentMessages: 0,
    receivedBytes: 0,
    receivedMessages: 0,
    lastAcknowledgedBaselineId: null,
  };
  probe.socket.addEventListener('message', (event) => {
    const bytes = payloadBytes(event.data);
    probe.receivedBytes += bytes.byteLength;
    probe.receivedMessages += 1;
    const decoded = decodeServerMessage(bytes);
    if (decoded.ok) probe.messages.push(decoded.value);
    else probe.decodeErrors.push(`${decoded.error.code}:${decoded.error.path}`);
    for (const waiter of [...probe.waiters]) waiter();
  });
  probe.socket.accept();
  sockets.add(probe.socket);
  return probe;
}

function sendClient(probe: SocketProbe, message: ClientMessage): void {
  const encoded = encodeClientMessage(message);
  if (!encoded.ok) throw new Error(`${encoded.error.code}:${encoded.error.path}`);
  probe.sentBytes += textEncoder.encode(encoded.json).byteLength;
  probe.sentMessages += 1;
  probe.socket.send(encoded.json);
}

function waitForMessageAfter(
  probe: SocketProbe,
  startIndex: number,
  predicate: (message: ServerMessage) => boolean,
  label: string,
  timeoutMilliseconds = 10_000,
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
        reject(new Error(`Server decode failed: ${probe.decodeErrors.join(', ')}`));
        return;
      }
      const found = probe.messages.slice(startIndex).find(predicate);
      if (found === undefined) return;
      cleanup();
      resolve(found);
    };
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${label}`));
    }, timeoutMilliseconds);
    probe.waiters.add(check);
    check();
  });
}

async function waitForTypeAfter<T extends ServerMessage['type']>(
  probe: SocketProbe,
  startIndex: number,
  type: T,
  predicate: (message: ServerMessageOfType<T>) => boolean = () => true,
): Promise<ServerMessageOfType<T>> {
  return await waitForMessageAfter(
    probe,
    startIndex,
    (message) => message.type === type && predicate(message as ServerMessageOfType<T>),
    type,
  ) as ServerMessageOfType<T>;
}

async function roomMetrics(room: RoomCreated): Promise<RoomMetrics> {
  const response = await SELF.fetch(`${AUTHORITY_ORIGIN}${room.metricsPath}`, {
    headers: { Origin: ALLOWED_ORIGIN },
  });
  if (!response.ok) throw new Error(`Metrics failed: ${response.status}`);
  const payload = await response.json() as { readonly metrics: RoomMetrics };
  return payload.metrics;
}

async function waitForMetrics(
  room: RoomCreated,
  predicate: (metrics: RoomMetrics) => boolean,
  label: string,
  timeoutMilliseconds = 15_000,
): Promise<RoomMetrics> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMilliseconds) {
    const metrics = await roomMetrics(room);
    if (predicate(metrics)) return metrics;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function latestSnapshot(probe: SocketProbe): SnapshotMessage | null {
  return [...probe.messages].reverse().find((message): message is SnapshotMessage => (
    message.type === 'fullSnapshot' || message.type === 'deltaSnapshot'
  )) ?? null;
}

function latestReliableEventId(probe: SocketProbe): string | null {
  let eventId: string | null = null;
  for (const message of probe.messages) {
    if (message.type === 'fullSnapshot') eventId = message.reliableEventBaselineId;
    if (message.type === 'reliableEventBatch') eventId = message.events.at(-1)?.id ?? eventId;
  }
  return eventId;
}

function acknowledgeLatestSnapshot(probe: SocketProbe): void {
  const snapshot = latestSnapshot(probe);
  if (
    snapshot === null
    || snapshot.snapshotBaselineId === probe.lastAcknowledgedBaselineId
    || probe.socket.readyState !== WebSocket.OPEN
  ) return;
  sendClient(probe, {
    protocolVersion: PROTOCOL_VERSION,
    type: 'ack',
    snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
    reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
    snapshotBaselineId: snapshot.snapshotBaselineId,
    serverTick: snapshot.serverTick,
    lastEventId: latestReliableEventId(probe),
  });
  probe.lastAcknowledgedBaselineId = snapshot.snapshotBaselineId;
}

async function joinEight(room: RoomCreated): Promise<JoinedClient[]> {
  const clients: JoinedClient[] = [];
  for (let ordinal = 0; ordinal < CLIENT_COUNT; ordinal += 1) {
    const probe = await connectSocket(room.socketPath);
    await waitForTypeAfter(probe, 0, 'welcome');
    const requestId = `req.authority-soak.join.${ordinal}`;
    const start = probe.messages.length;
    sendClient(probe, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'joinRoom',
      requestId,
      roomCode: room.roomCode,
      displayName: `Authority Soak ${ordinal + 1}`,
    });
    const join = await waitForTypeAfter(
      probe,
      start,
      'joinAccepted',
      (message) => message.requestId === requestId,
    );
    await waitForTypeAfter(
      probe,
      start,
      'fullSnapshot',
      (message) => message.localReconciliation.player.id === join.playerId,
    );
    acknowledgeLatestSnapshot(probe);
    clients.push({ ordinal, probe, join });
  }
  await waitForMetrics(
    room,
    (metrics) => metrics.players === CLIENT_COUNT && metrics.connectedPlayers === CLIENT_COUNT,
    'eight connected authority clients',
  );
  return clients;
}

function byteSummary(probes: readonly SocketProbe[]): Readonly<Record<string, number>> {
  return Object.freeze({
    clientToServerBytes: probes.reduce((total, probe) => total + probe.sentBytes, 0),
    serverToClientBytes: probes.reduce((total, probe) => total + probe.receivedBytes, 0),
    clientToServerMessages: probes.reduce((total, probe) => total + probe.sentMessages, 0),
    serverToClientMessages: probes.reduce((total, probe) => total + probe.receivedMessages, 0),
  });
}

describe('G4/G8 real Worker full-occupancy authority soak', () => {
  it('measures a live 8-client room and preserves resume plus combat convergence', async () => {
    const room = await createRoom();
    const clients = await joinEight(room);
    const active = await waitForMetrics(
      room,
      (metrics) => metrics.lifecycle === 'active'
        && metrics.connectedPlayers === CLIENT_COUNT
        && metrics.serverTick >= 41,
      'eight-client active room',
    );
    const soakStartedAt = performance.now();
    const startTick = active.serverTick;

    for (let round = 0; round < SOAK_ROUNDS; round += 1) {
      for (const client of clients) {
        acknowledgeLatestSnapshot(client.probe);
        const snapshot = latestSnapshot(client.probe);
        sendClient(client.probe, {
          protocolVersion: PROTOCOL_VERSION,
          type: 'inputBatch',
          commands: [{
            type: 'input',
            sequence: round,
            clientTick: snapshot?.serverTick ?? startTick,
            moveX: client.ordinal % 2 === 0 ? 40 : -40,
            moveY: round % 20 < 10 ? 96 : -96,
            lookYawDeltaMilliDegrees: client.ordinal % 2 === 0 ? 25 : -25,
            lookPitchDeltaMilliDegrees: 0,
            heldButtons: 0,
            pressedButtons: 0,
            releasedButtons: 0,
            selectedSlot: 0,
          }],
        });
      }
      await new Promise((resolve) => setTimeout(resolve, SOAK_ROUND_MILLISECONDS));
    }
    for (const client of clients) acknowledgeLatestSnapshot(client.probe);

    const expectedInputs = CLIENT_COUNT * SOAK_ROUNDS;
    const postSoak = await waitForMetrics(
      room,
      (metrics) => metrics.acceptedInputs >= expectedInputs
        && metrics.authorityTickExecution.samples >= MINIMUM_TICK_SAMPLES,
      'soak inputs and tick samples',
    );
    const soakDurationMilliseconds = performance.now() - soakStartedAt;
    const observedTickRateHertz = (
      (postSoak.serverTick - startTick) * 1_000 / soakDurationMilliseconds
    );

    const reliableStarts = clients.map(({ probe }) => probe.messages.length);
    const snapshotStarts = clients.map(({ probe }) => probe.messages.length);
    const attackerId = clients[0]?.join.playerId;
    const targetId = clients[1]?.join.playerId;
    if (attackerId === undefined || targetId === undefined) throw new Error('Combat clients missing');
    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    let combat: ControlledCombatResult | null = null;
    for (let attempt = 0; attempt < 100 && combat === null; attempt += 1) {
      combat = await runInDurableObject(stub, async (instance) => {
        const runtime = instance as unknown as {
          authority: {
            readonly serverTick: number;
            readonly activeTickMatchEvents: unknown;
            applyCombatDamage(request: {
              targetPlayerId: string;
              sourcePlayerId: string;
              damagePoints: number;
              causeId: string;
            }): { readonly accepted: boolean };
            exportActiveMatchCheckpoint(): {
              readonly clock: { readonly serverTick: number };
              readonly players: readonly {
                readonly playerId: string;
                readonly life: { readonly phase: string; readonly healthPoints: number };
              }[];
              readonly match: {
                readonly feedSequence: number;
                readonly teamScores: readonly { readonly teamId: string; readonly score: number }[];
              };
            };
          };
          reliableEvents: {
            append(input: {
              serverTick: number;
              kind: 'damageApplied' | 'playerKilled';
              subjectId: string;
              actorId: string;
              targetId: string;
              amountHealthPoints: number | null;
            }): { readonly id: string };
          };
          transportMetrics: { reliableEventsRecorded: number };
          persistActiveMatchCheckpoint(): void;
          broadcastReliableEvents(): void;
        };
        // runInDurableObject is a test-only introspection surface and can enter
        // while a setTimeout tick is still finishing. Only inject at the real
        // authority's explicit between-tick checkpoint boundary.
        if (runtime.authority.activeTickMatchEvents !== null) return null;
        const damage = runtime.authority.applyCombatDamage({
          targetPlayerId: targetId,
          sourcePlayerId: attackerId,
          damagePoints: 100,
          causeId: 'g4_g8_full_occupancy_convergence',
        });
        if (!damage.accepted) throw new Error('Controlled authority damage rejected');
        runtime.reliableEvents.append({
          serverTick: runtime.authority.serverTick,
          kind: 'damageApplied',
          subjectId: targetId,
          actorId: attackerId,
          targetId,
          amountHealthPoints: 100,
        });
        const finalEvent = runtime.reliableEvents.append({
          serverTick: runtime.authority.serverTick,
          kind: 'playerKilled',
          subjectId: targetId,
          actorId: attackerId,
          targetId,
          amountHealthPoints: null,
        });
        runtime.transportMetrics.reliableEventsRecorded += 2;
        runtime.persistActiveMatchCheckpoint();
        runtime.broadcastReliableEvents();
        return {
          finalEventId: finalEvent.id,
          checkpoint: runtime.authority.exportActiveMatchCheckpoint(),
        } satisfies ControlledCombatResult;
      });
      if (combat === null) await new Promise((resolve) => setTimeout(resolve, 5));
    }
    if (combat === null) throw new Error('No stable between-tick combat checkpoint boundary');

    await Promise.all(clients.map(async ({ probe }, index) => {
      await waitForMessageAfter(
        probe,
        reliableStarts[index] ?? 0,
        (message) => message.type === 'reliableEventBatch'
          && message.events.some(({ id }) => id === combat.finalEventId),
        `combat event convergence client ${index + 1}`,
      );
    }));
    const convergedSnapshots = await Promise.all(clients.map(async ({ probe }, index) => (
      await waitForMessageAfter(
        probe,
        snapshotStarts[index] ?? 0,
        (message) => (
          (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
          && message.combat?.players.some((player) => (
            player.playerId === targetId
            && player.lifePhase === 'dead'
            && player.healthPoints === 0
          )) === true
          && message.combat.match.feedSequence >= combat.checkpoint.match.feedSequence
        ),
        `combat snapshot convergence client ${index + 1}`,
      ) as SnapshotMessage
    )));

    const disconnected = clients[7];
    if (disconnected === undefined) throw new Error('Resume client missing');
    disconnected.probe.socket.close(1000, 'authority soak resume');
    await waitForMetrics(
      room,
      (metrics) => metrics.connectedPlayers === CLIENT_COUNT - 1,
      'resume disconnect boundary',
    );
    const resumedProbe = await connectSocket(room.socketPath);
    const welcomeStart = resumedProbe.messages.length;
    await waitForTypeAfter(resumedProbe, welcomeStart, 'welcome');
    const resumeStart = resumedProbe.messages.length;
    sendClient(resumedProbe, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'resumeRoom',
      requestId: 'req.authority-soak.resume',
      roomCode: room.roomCode,
      resumeToken: disconnected.join.resumeToken,
    });
    const resumed = await waitForTypeAfter(
      resumedProbe,
      resumeStart,
      'joinAccepted',
      (message) => message.requestId === 'req.authority-soak.resume',
    );
    const resumeSnapshot = await waitForTypeAfter(
      resumedProbe,
      resumeStart,
      'fullSnapshot',
      (message) => message.localReconciliation.player.id === disconnected.join.playerId,
    );
    const finalMetrics = await waitForMetrics(
      room,
      (metrics) => metrics.connectedPlayers === CLIENT_COUNT,
      'restored eight-client occupancy',
    );
    const probes = [...clients.map(({ probe }) => probe), resumedProbe];
    const network = byteSummary(probes);
    const totalObservedBytes = network.clientToServerBytes + network.serverToClientBytes;
    const result = Object.freeze({
      schemaVersion: 1,
      runtime: '@cloudflare/vitest-pool-workers',
      roomProfile: P511_INKFALL_REV2_COMBAT_PROFILE,
      clients: CLIENT_COUNT,
      soakRounds: SOAK_ROUNDS,
      soakDurationMilliseconds: Math.round(soakDurationMilliseconds * 1_000) / 1_000,
      startTick,
      endTick: postSoak.serverTick,
      observedTickRateHertz: Math.round(observedTickRateHertz * 1_000) / 1_000,
      authorityTickExecution: finalMetrics.authorityTickExecution,
      network: {
        ...network,
        totalObservedBytes,
        observedBytesPerClientSecond: Math.round(
          totalObservedBytes / CLIENT_COUNT / (soakDurationMilliseconds / 1_000),
        ),
      },
      resume: {
        preservedPlayerId: resumed.playerId === disconnected.join.playerId,
        connectionMode: resumed.connectionMode,
        rotatedCredential: resumed.resumeToken !== disconnected.join.resumeToken,
        fullSnapshotPlayerId: resumeSnapshot.localReconciliation.player.id,
      },
      combat: {
        authorityTick: combat.checkpoint.clock.serverTick,
        finalEventId: combat.finalEventId,
        targetPlayerId: targetId,
        targetDeadInCheckpoint: combat.checkpoint.players.some((player) => (
          player.playerId === targetId
          && player.life.phase === 'dead'
          && player.life.healthPoints === 0
        )),
        convergedClientCount: convergedSnapshots.length,
        feedSequence: combat.checkpoint.match.feedSequence,
        teamScores: combat.checkpoint.match.teamScores,
        injectionSurface: 'KyxRoom authoritative applyCombatDamage port inside real Durable Object',
      },
      transport: finalMetrics.transport,
      lastTickFailure: finalMetrics.lastTickFailure,
      decodeErrors: probes.flatMap((probe) => probe.decodeErrors),
    });

    expect(postSoak.acceptedInputs).toBeGreaterThanOrEqual(expectedInputs);
    expect(observedTickRateHertz).toBeGreaterThanOrEqual(10);
    expect(observedTickRateHertz).toBeLessThanOrEqual(30);
    expect(finalMetrics.authorityTickExecution.samples).toBeGreaterThanOrEqual(MINIMUM_TICK_SAMPLES);
    expect(finalMetrics.authorityTickExecution.p99Milliseconds).not.toBeNull();
    expect(finalMetrics.authorityTickExecution.p99Milliseconds as number)
      .toBeLessThanOrEqual(MAXIMUM_TICK_P99_MILLISECONDS);
    expect(finalMetrics.lastTickFailure).toBeNull();
    expect(network.clientToServerBytes).toBeGreaterThan(0);
    expect(network.serverToClientBytes).toBeGreaterThan(0);
    expect(resumed).toMatchObject({
      playerId: disconnected.join.playerId,
      connectionMode: 'resumed',
    });
    expect(resumed.resumeToken).not.toBe(disconnected.join.resumeToken);
    expect(result.combat.targetDeadInCheckpoint).toBe(true);
    expect(result.combat.convergedClientCount).toBe(CLIENT_COUNT);
    expect(result.decodeErrors).toEqual([]);
    for (const client of clients.slice(0, 7)) {
      expect(client.probe.socket.readyState).toBe(WebSocket.OPEN);
    }
    expect(resumedProbe.socket.readyState).toBe(WebSocket.OPEN);

    console.log(`KYX_AUTHORITY_SOAK_RESULT=${JSON.stringify(result)}`);
  }, 30_000);
});
