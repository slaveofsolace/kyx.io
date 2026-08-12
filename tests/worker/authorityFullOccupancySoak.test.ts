/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { reset, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import {
  PROTOCOL_LIMITS,
  PROTOCOL_VERSION,
  RELIABLE_EVENT_STREAM_VERSION,
  SNAPSHOT_BASELINE_VERSION,
  decodeServerMessage,
  encodeClientMessage,
  type ClientMessage,
  type DeltaSnapshotMessage,
  type FullSnapshotMessage,
  type JoinAcceptedMessage,
  type ReliableEvent,
  type ServerMessage,
} from '../../src/net';
import {
  P58D_COMBAT_PROFILE_HEADER,
  RELAY_REV1_COMBAT_PROFILE,
} from '../../worker/combatRuntime';

const ALLOWED_ORIGIN = 'http://127.0.0.1:5173';
const AUTHORITY_ORIGIN = 'https://authority.test';
const CLIENT_COUNT = 8;
const SOAK_ROUNDS = 60;
const SOAK_ROUND_MILLISECONDS = 100;
const MINIMUM_TICK_SAMPLES = 100;
const MAXIMUM_TICK_P99_MILLISECONDS = 50;
const PRIMARY_FIRE = 1 << 3;
const textEncoder = new TextEncoder();
const WEST_RELAY_CENTERLINE_ROUTE = Object.freeze([
  Object.freeze({ x: -27_500, z: 0 }),
  Object.freeze({ x: -22_000, z: 0 }),
  Object.freeze({ x: -15_000, z: 0 }),
  Object.freeze({ x: -8_000, z: 0 }),
  Object.freeze({ x: -3_000, z: 0 }),
]);
const EAST_RELAY_CENTERLINE_ROUTE = Object.freeze([
  Object.freeze({ x: 27_500, z: 0 }),
  Object.freeze({ x: 22_000, z: 0 }),
  Object.freeze({ x: 15_000, z: 0 }),
  Object.freeze({ x: 8_000, z: 0 }),
  Object.freeze({ x: 3_000, z: 0 }),
]);
const VERIFIED_RELAY_CENTERLINE_COMBAT_PAIR = Object.freeze({
  west: Object.freeze({ x: -950, z: 0 }),
  east: Object.freeze({ x: 950, z: 0 }),
  arrivalToleranceMillimeters: 100,
  minimumPulseMilliseconds: 60,
  settleMilliseconds: 750,
  maximumSeparationMillimeters: 2_200,
  minimumVerticalMarginMillimeters: 90,
});

interface RoomCreated {
  readonly roomCode: string;
  readonly socketPath: string;
  readonly metricsPath: string;
  readonly metricsAccess: {
    readonly headerName: string;
    readonly credential: string;
  };
  readonly mapBinding: {
    readonly spawns: readonly {
      readonly feetPosition: { readonly x: number; readonly y: number; readonly z: number };
      readonly yawMilliDegrees: number;
    }[];
  };
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
      [P58D_COMBAT_PROFILE_HEADER]: RELAY_REV1_COMBAT_PROFILE,
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
      const candidates = probe.messages.slice(startIndex);
      const received = candidates.slice(-12).map((message) => (
        message.type === 'error'
          ? `${message.type}:${message.code}:${message.detail ?? ''}`
          : message.type
      ));
      reject(new Error(
        `Timed out waiting for ${label}; received ${candidates.length} messages`
        + ` (last ${received.length}: ${received.join(', ') || 'nothing'})`,
      ));
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
    headers: {
      Origin: ALLOWED_ORIGIN,
      [room.metricsAccess.headerName]: room.metricsAccess.credential,
    },
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

function reliableEventsAfter(probe: SocketProbe, startIndex: number): readonly ReliableEvent[] {
  const events = new Map<string, ReliableEvent>();
  for (const message of probe.messages.slice(startIndex)) {
    if (message.type !== 'reliableEventBatch') continue;
    for (const event of message.events) events.set(event.id, event);
  }
  return [...events.values()];
}

function acknowledgeLatestSnapshot(probe: SocketProbe): boolean {
  const snapshot = latestSnapshot(probe);
  if (
    snapshot === null
    || snapshot.snapshotBaselineId === probe.lastAcknowledgedBaselineId
    || probe.socket.readyState !== WebSocket.OPEN
  ) return false;
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
  return true;
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

interface RouteTarget {
  readonly x: number;
  readonly z: number;
}

interface InputPatch {
  readonly moveX?: number;
  readonly moveY?: number;
  readonly lookYawDeltaMilliDegrees?: number;
  readonly lookPitchDeltaMilliDegrees?: number;
  readonly heldButtons?: number;
  readonly pressedButtons?: number;
  readonly releasedButtons?: number;
}

function signedYawDelta(targetYaw: number, currentYaw: number): number {
  return ((targetYaw - currentYaw + 540_000) % 360_000) - 180_000;
}

function acknowledgePopulation(clients: readonly JoinedClient[]): void {
  for (const { probe } of clients) acknowledgeLatestSnapshot(probe);
}

function issueInput(
  client: JoinedClient,
  nextSequences: Map<string, number>,
  patch: InputPatch = {},
): Readonly<{ sequence: number; startIndex: number }> {
  const playerId = client.join.playerId;
  const sequence = nextSequences.get(playerId);
  const snapshot = latestSnapshot(client.probe);
  if (sequence === undefined || snapshot === null) {
    throw new Error(`Input state missing for ${playerId}`);
  }
  const startIndex = client.probe.messages.length;
  sendClient(client.probe, {
    protocolVersion: PROTOCOL_VERSION,
    type: 'inputBatch',
    commands: [{
      type: 'input',
      sequence,
      clientTick: snapshot.serverTick,
      moveX: patch.moveX ?? 0,
      moveY: patch.moveY ?? 0,
      lookYawDeltaMilliDegrees: patch.lookYawDeltaMilliDegrees ?? 0,
      lookPitchDeltaMilliDegrees: patch.lookPitchDeltaMilliDegrees ?? 0,
      heldButtons: patch.heldButtons ?? 0,
      pressedButtons: patch.pressedButtons ?? 0,
      releasedButtons: patch.releasedButtons ?? 0,
      selectedSlot: 0,
    }],
  });
  nextSequences.set(playerId, sequence + 1);
  return Object.freeze({ sequence, startIndex });
}

async function waitForProcessedInput(
  client: JoinedClient,
  issued: Readonly<{ sequence: number; startIndex: number }>,
  label: string,
): Promise<SnapshotMessage> {
  return await waitForMessageAfter(
    client.probe,
    issued.startIndex,
    (message) => (
      (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
      && message.localReconciliation.player.id === client.join.playerId
      && message.localReconciliation.player.lastProcessedSequence >= issued.sequence
    ),
    label,
  ) as SnapshotMessage;
}

async function faceTarget(
  client: JoinedClient,
  targetYawMilliDegrees: number,
  nextSequences: Map<string, number>,
  population: readonly JoinedClient[],
  toleranceMilliDegrees = 800,
): Promise<SnapshotMessage> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const current = latestSnapshot(client.probe);
    if (current === null) throw new Error('Authority facing snapshot missing');
    const yaw = current.localReconciliation.player.yawMilliDegrees;
    const delta = signedYawDelta(targetYawMilliDegrees, yaw);
    if (Math.abs(delta) <= toleranceMilliDegrees) return current;
    const issued = issueInput(client, nextSequences, {
      lookYawDeltaMilliDegrees: Math.max(
        -PROTOCOL_LIMITS.maxLookDeltaMilliDegrees,
        Math.min(PROTOCOL_LIMITS.maxLookDeltaMilliDegrees, delta),
      ),
    });
    const processed = await waitForProcessedInput(
      client,
      issued,
      `face target input ${issued.sequence}`,
    );
    acknowledgePopulation(population);
    if (
      Math.abs(signedYawDelta(
        targetYawMilliDegrees,
        processed.localReconciliation.player.yawMilliDegrees,
      )) <= toleranceMilliDegrees
    ) return processed;
  }
  const final = latestSnapshot(client.probe);
  throw new Error(`Failed to face ${targetYawMilliDegrees}: ${JSON.stringify({
    finalYawMilliDegrees: final?.localReconciliation.player.yawMilliDegrees,
  })}`);
}

async function pulseAxes(
  client: JoinedClient,
  nextSequences: Map<string, number>,
  population: readonly JoinedClient[],
  moveX: number,
  moveY: number,
  durationMilliseconds: number,
  label: string,
): Promise<SnapshotMessage> {
  const move = issueInput(client, nextSequences, { moveX, moveY });
  const movementStartedAt = performance.now();
  await waitForProcessedInput(client, move, `${label} movement`);
  const remainingPulseMilliseconds = Math.max(
    0,
    durationMilliseconds - (performance.now() - movementStartedAt),
  );
  if (remainingPulseMilliseconds > 0) {
    await new Promise((resolve) => setTimeout(resolve, remainingPulseMilliseconds));
  }
  const stop = issueInput(client, nextSequences);
  const stopped = await waitForProcessedInput(client, stop, `${label} stop`);
  acknowledgePopulation(population);
  return stopped;
}

async function moveTo(
  client: JoinedClient,
  target: RouteTarget,
  label: string,
  nextSequences: Map<string, number>,
  population: readonly JoinedClient[],
  arrivalToleranceMillimeters = 850,
  minimumPulseMilliseconds = 80,
): Promise<SnapshotMessage> {
  let bestDistance = Number.POSITIVE_INFINITY;
  let stalledAttempts = 0;
  let lastPosition: Readonly<{ x: number; y: number; z: number }> | null = null;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const current = latestSnapshot(client.probe);
    if (current === null) throw new Error(`${label} authority snapshot missing`);
    const position = current.localReconciliation.player.feetPosition;
    if (position.y < -10_000) {
      throw new Error(`${label} authority fell through: ${JSON.stringify(position)}`);
    }
    if (Math.abs(position.x) > 35_250 || Math.abs(position.z) > 23_500) {
      throw new Error(`${label} left the bounded route envelope: ${JSON.stringify(position)}`);
    }
    const deltaX = target.x - position.x;
    const deltaZ = target.z - position.z;
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance <= arrivalToleranceMillimeters) return current;
    const nearTargetBand = arrivalToleranceMillimeters + 500;
    if (distance <= nearTargetBand || distance <= bestDistance - 120) {
      bestDistance = distance;
      stalledAttempts = 0;
    } else {
      stalledAttempts += 1;
    }
    if (stalledAttempts >= 3) {
      const yawRadians = current.localReconciliation.player.yawMilliDegrees
        * Math.PI / 180_000;
      const sine = Math.sin(yawRadians);
      const cosine = Math.cos(yawRadians);
      const targetUnitX = deltaX / distance;
      const targetUnitZ = deltaZ / distance;
      const centerlineUnitX = -Math.sign(position.x || 1);
      const score = (worldX: number, worldZ: number) => (
        centerlineUnitX * worldX * 2
        + targetUnitX * worldX
        + targetUnitZ * worldZ
      );
      const moveX = score(cosine, -sine) >= score(-cosine, sine) ? 127 : -127;
      await pulseAxes(
        client,
        nextSequences,
        population,
        moveX,
        0,
        180,
        `${label} recovery`,
      );
      stalledAttempts = 0;
      lastPosition = position;
      continue;
    }
    await faceTarget(
      client,
      Math.round(Math.atan2(deltaX, deltaZ) * 180_000 / Math.PI),
      nextSequences,
      population,
      1_200,
    );
    const pulseMilliseconds = Math.max(
      minimumPulseMilliseconds,
      Math.min(distance <= nearTargetBand ? 80 : 140, distance / 6_500 * 1_000),
    );
    const expectedFullTravel = 6_500 * pulseMilliseconds / 1_000;
    const desiredTravel = Math.max(50, distance - arrivalToleranceMillimeters / 2);
    const moveY = Math.max(
      16,
      Math.min(127, Math.round(127 * desiredTravel / expectedFullTravel)),
    );
    await pulseAxes(
      client,
      nextSequences,
      population,
      0,
      moveY,
      pulseMilliseconds,
      `${label} pulse`,
    );
    lastPosition = position;
  }
  throw new Error(`${label} did not reach ${JSON.stringify(target)}: ${JSON.stringify({
    bestDistance,
    lastPosition,
  })}`);
}

async function stageRelayCenterlineCombatPair(
  west: JoinedClient,
  east: JoinedClient,
  nextSequences: Map<string, number>,
  population: readonly JoinedClient[],
) {
  const checkpoints: Array<Readonly<{
    index: number;
    west: Readonly<{ x: number; y: number; z: number }>;
    east: Readonly<{ x: number; y: number; z: number }>;
  }>> = [];
  for (let index = 0; index < WEST_RELAY_CENTERLINE_ROUTE.length; index += 1) {
    const westTarget = WEST_RELAY_CENTERLINE_ROUTE[index];
    const eastTarget = EAST_RELAY_CENTERLINE_ROUTE[index];
    if (westTarget === undefined || eastTarget === undefined) {
      throw new Error(`Relay centerline route leg ${index} missing`);
    }
    const arrivalToleranceMillimeters = index === WEST_RELAY_CENTERLINE_ROUTE.length - 1
      ? 350
      : 850;
    const minimumPulseMilliseconds = index === WEST_RELAY_CENTERLINE_ROUTE.length - 1
      ? 60
      : 80;
    const [westArrival, eastArrival] = await Promise.all([
      moveTo(
        west,
        westTarget,
        `west Relay centerline leg ${index}`,
        nextSequences,
        population,
        arrivalToleranceMillimeters,
        minimumPulseMilliseconds,
      ),
      moveTo(
        east,
        eastTarget,
        `east Relay centerline leg ${index}`,
        nextSequences,
        population,
        arrivalToleranceMillimeters,
        minimumPulseMilliseconds,
      ),
    ]);
    checkpoints.push(Object.freeze({
      index,
      west: westArrival.localReconciliation.player.feetPosition,
      east: eastArrival.localReconciliation.player.feetPosition,
    }));
    console.log(`KYX_AUTHORITY_SOAK_ROUTE=${JSON.stringify(checkpoints.at(-1))}`);
  }
  const [westStaged, eastStaged] = await Promise.all([
    moveTo(
      west,
      VERIFIED_RELAY_CENTERLINE_COMBAT_PAIR.west,
      'west verified Relay centerline combat pair',
      nextSequences,
      population,
      VERIFIED_RELAY_CENTERLINE_COMBAT_PAIR.arrivalToleranceMillimeters,
      VERIFIED_RELAY_CENTERLINE_COMBAT_PAIR.minimumPulseMilliseconds,
    ),
    moveTo(
      east,
      VERIFIED_RELAY_CENTERLINE_COMBAT_PAIR.east,
      'east verified Relay centerline combat pair',
      nextSequences,
      population,
      VERIFIED_RELAY_CENTERLINE_COMBAT_PAIR.arrivalToleranceMillimeters,
      VERIFIED_RELAY_CENTERLINE_COMBAT_PAIR.minimumPulseMilliseconds,
    ),
  ]);
  await new Promise((resolve) => (
    setTimeout(resolve, VERIFIED_RELAY_CENTERLINE_COMBAT_PAIR.settleMilliseconds)
  ));
  acknowledgePopulation(population);
  const westPosition = latestSnapshot(west.probe)?.localReconciliation.player.feetPosition
    ?? westStaged.localReconciliation.player.feetPosition;
  const eastPosition = latestSnapshot(east.probe)?.localReconciliation.player.feetPosition
    ?? eastStaged.localReconciliation.player.feetPosition;
  const separationMillimeters = Math.hypot(
    eastPosition.x - westPosition.x,
    eastPosition.z - westPosition.z,
  );
  const westYaw = Math.round(
    Math.atan2(
      eastPosition.x - westPosition.x,
      eastPosition.z - westPosition.z,
    ) * 180_000 / Math.PI,
  );
  const eastYaw = Math.round(
    Math.atan2(
      westPosition.x - eastPosition.x,
      westPosition.z - eastPosition.z,
    ) * 180_000 / Math.PI,
  );
  await Promise.all([
    faceTarget(west, westYaw, nextSequences, population),
    faceTarget(east, eastYaw, nextSequences, population),
  ]);
  await new Promise((resolve) => setTimeout(resolve, 180));
  acknowledgePopulation(population);
  return Object.freeze({
    checkpoints,
    westPosition,
    eastPosition,
    separationMillimeters,
    // Relay's integer KCC can settle the mirrored capsules a few millimeters
    // apart on the same authored floor. Use the east combatant as the shooter;
    // its eye-to-west-target vertical margin remains above the retained 90 mm
    // live-hitscan safety requirement without changing simulation thresholds.
    verticalMarginMillimeters: westPosition.y + 1_800 - (eastPosition.y + 1_700),
    westYawMilliDegrees: westYaw,
    eastYawMilliDegrees: eastYaw,
  });
}

describe('canonical Relay real Worker full-occupancy authority soak', () => {
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
            moveX: 0,
            moveY: 0,
            lookYawDeltaMilliDegrees: 0,
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

    const nextSequence = new Map(
      clients.map(({ join }) => [join.playerId, SOAK_ROUNDS] as const),
    );
    const westCombatant = clients[0];
    const eastCombatant = clients[1];
    if (westCombatant === undefined || eastCombatant === undefined) {
      throw new Error('Verified Relay centerline combat pair clients missing');
    }
    const combatSetup = await stageRelayCenterlineCombatPair(
      westCombatant,
      eastCombatant,
      nextSequence,
      clients,
    );
    expect(combatSetup.separationMillimeters)
      .toBeLessThanOrEqual(VERIFIED_RELAY_CENTERLINE_COMBAT_PAIR.maximumSeparationMillimeters);
    expect(combatSetup.verticalMarginMillimeters)
      .toBeGreaterThanOrEqual(VERIFIED_RELAY_CENTERLINE_COMBAT_PAIR.minimumVerticalMarginMillimeters);

    const shooterCombatant = eastCombatant;
    const targetCombatant = westCombatant;
    const shooterIndex = 1;
    const reliableStarts = clients.map(({ probe }) => probe.messages.length);
    const snapshotStarts = clients.map(({ probe }) => probe.messages.length);
    let killEvent: ReliableEvent | null = null;
    let firingStarted = false;
    for (let fireRound = 0; fireRound < 160 && killEvent === null; fireRound += 1) {
      issueInput(shooterCombatant, nextSequence, {
        heldButtons: PRIMARY_FIRE,
        pressedButtons: firingStarted ? 0 : PRIMARY_FIRE,
      });
      firingStarted = true;
      acknowledgePopulation(clients);
      await new Promise((resolve) => setTimeout(resolve, 45));
      killEvent = reliableEventsAfter(
        shooterCombatant.probe,
        reliableStarts[shooterIndex] ?? 0,
      ).find(({ kind }) => kind === 'playerKilled') ?? null;
    }
    if (killEvent === null) {
      const observedEvents = reliableEventsAfter(
        shooterCombatant.probe,
        reliableStarts[shooterIndex] ?? 0,
      );
      const current = latestSnapshot(westCombatant.probe);
      throw new Error(`No live Relay centerline authority kill after 160 fire rounds: ${JSON.stringify({
        combatSetup,
        eventKinds: Object.groupBy(observedEvents, ({ kind }) => kind),
        combatPlayers: current?.combat?.players,
        errors: clients.flatMap(({ probe }) => (
          probe.messages.filter(({ type }) => type === 'error')
        )),
      })}`);
    }
    const release = issueInput(shooterCombatant, nextSequence, {
      releasedButtons: PRIMARY_FIRE,
    });
    await waitForProcessedInput(shooterCombatant, release, 'live fire release');
    const targetId = killEvent.targetId ?? killEvent.subjectId;
    if (targetId === null || targetId !== targetCombatant.join.playerId) {
      throw new Error(`Authoritative kill target mismatch: ${String(targetId)}`);
    }

    await Promise.all(clients.map(async ({ probe }, index) => {
      await waitForMessageAfter(
        probe,
        reliableStarts[index] ?? 0,
        (message) => message.type === 'reliableEventBatch'
          && message.events.some(({ id }) => id === killEvent.id),
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
          && message.combat.match.feedSequence >= 1
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
    const measurementDurationMilliseconds = performance.now() - soakStartedAt;
    const combatProjection = convergedSnapshots[0];
    if (combatProjection === undefined || combatProjection.combat === undefined) {
      throw new Error('Combat convergence projection missing');
    }
    const result = Object.freeze({
      schemaVersion: 1,
      runtime: '@cloudflare/vitest-pool-workers',
      roomProfile: RELAY_REV1_COMBAT_PROFILE,
      clients: CLIENT_COUNT,
      soakRounds: SOAK_ROUNDS,
      soakDurationMilliseconds: Math.round(soakDurationMilliseconds * 1_000) / 1_000,
      measurementDurationMilliseconds:
        Math.round(measurementDurationMilliseconds * 1_000) / 1_000,
      startTick,
      soakEndTick: postSoak.serverTick,
      endTick: finalMetrics.serverTick,
      observedTickRateHertz: Math.round(observedTickRateHertz * 1_000) / 1_000,
      authorityTickExecution: finalMetrics.authorityTickExecution,
      network: {
        ...network,
        totalObservedBytes,
        observedBytesPerClientSecond: Math.round(
          totalObservedBytes / CLIENT_COUNT / (measurementDurationMilliseconds / 1_000),
        ),
      },
      resume: {
        preservedPlayerId: resumed.playerId === disconnected.join.playerId,
        connectionMode: resumed.connectionMode,
        rotatedCredential: resumed.resumeToken !== disconnected.join.resumeToken,
        fullSnapshotPlayerId: resumeSnapshot.localReconciliation.player.id,
      },
      combat: {
        authorityTick: killEvent.serverTick,
        finalEventId: killEvent.id,
        actorPlayerId: killEvent.actorId,
        targetPlayerId: targetId,
        targetDeadInAuthoritySnapshot: combatProjection.combat.players.some((player) => (
          player.playerId === targetId
          && player.lifePhase === 'dead'
          && player.healthPoints === 0
        )),
        convergedClientCount: convergedSnapshots.length,
        feedSequence: combatProjection.combat.match.feedSequence,
        teamScores: combatProjection.combat.match.teamScores,
        setup: combatSetup,
        inputSurface: 'real protocol-v2 movement and primary fire through Worker WebSockets',
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
    expect(result.combat.targetDeadInAuthoritySnapshot).toBe(true);
    expect(result.combat.convergedClientCount).toBe(CLIENT_COUNT);
    expect(result.decodeErrors).toEqual([]);
    for (const client of clients.slice(0, 7)) {
      expect(client.probe.socket.readyState).toBe(WebSocket.OPEN);
    }
    expect(resumedProbe.socket.readyState).toBe(WebSocket.OPEN);

    console.log(`KYX_AUTHORITY_SOAK_RESULT=${JSON.stringify(result)}`);
  }, 120_000);
});
