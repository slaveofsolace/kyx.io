/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env, evictDurableObject, reset, runInDurableObject, SELF } from 'cloudflare:test';
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
  type WelcomeMessage,
} from '../../src/net';
import {
  P511_INKFALL_REV2_COMBAT_PROFILE,
  P58D_COMBAT_PROFILE_HEADER,
  P58D_REV3_COMBAT_PROFILE,
  type INKFALL_REVISION_2_WORKER_MAP_BINDING,
} from '../../worker/combatRuntime';
import type { KyxAuthorityEnv } from '../../worker/env';

const ALLOWED_ORIGIN = 'http://127.0.0.1:5173';
const AUTHORITY_ORIGIN = 'https://authority.test';
const authorityEnv = env as unknown as KyxAuthorityEnv;

interface RoomCreated {
  readonly roomCode: string;
  readonly roomPath: string;
  readonly socketPath: string;
  readonly metricsPath: string;
  readonly metricsAccess: {
    readonly headerName: string;
    readonly credential: string;
  };
  readonly roomProfile: string;
  readonly mapBinding: typeof INKFALL_REVISION_2_WORKER_MAP_BINDING;
}

interface SocketProbe {
  readonly socket: WebSocket;
  readonly messages: ServerMessage[];
  readonly decodeErrors: string[];
  readonly waiters: Set<() => void>;
}

interface JoinedClient {
  readonly ordinal: number;
  readonly probe: SocketProbe;
  readonly welcome: WelcomeMessage;
  readonly join: JoinAcceptedMessage;
  readonly initialSnapshot: FullSnapshotMessage;
}

type PopulationSnapshot = FullSnapshotMessage | DeltaSnapshotMessage;

type ServerMessageOfType<T extends ServerMessage['type']> =
  Extract<ServerMessage, { readonly type: T }>;

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
  throw new TypeError(`Unsupported WebSocket payload: ${Object.prototype.toString.call(data)}`);
}

async function createInkfallRoom(): Promise<RoomCreated> {
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
  };
  probe.socket.addEventListener('message', (event) => {
    const decoded = decodeServerMessage(socketPayload(event.data));
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
      reject(new Error(`Timed out waiting for ${label}: ${JSON.stringify(probe.messages.slice(-8))}`));
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

function joinMessage(roomCode: string, requestId: string, displayName: string): ClientMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'joinRoom',
    requestId,
    roomCode,
    displayName,
  };
}

async function roomMetrics(room: RoomCreated): Promise<Record<string, unknown>> {
  const response = await SELF.fetch(`${AUTHORITY_ORIGIN}${room.metricsPath}`, {
    headers: {
      Origin: ALLOWED_ORIGIN,
      [room.metricsAccess.headerName]: room.metricsAccess.credential,
    },
  });
  if (!response.ok) throw new Error(`Metrics failed: ${response.status}`);
  const payload = await response.json() as { readonly metrics: Record<string, unknown> };
  return payload.metrics;
}

async function waitForMetrics(
  room: RoomCreated,
  predicate: (metrics: Record<string, unknown>) => boolean,
  label: string,
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const metrics = await roomMetrics(room);
    if (predicate(metrics)) return metrics;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizedYaw(yawMilliDegrees: number): number {
  return ((yawMilliDegrees % 360_000) + 360_000) % 360_000;
}

function latestReliableEventId(probe: SocketProbe): string | null {
  let eventId: string | null = null;
  for (const message of probe.messages) {
    if (message.type === 'fullSnapshot') eventId = message.reliableEventBaselineId;
    if (message.type === 'reliableEventBatch') eventId = message.events.at(-1)?.id ?? eventId;
  }
  return eventId;
}

function acknowledgeSnapshot(probe: SocketProbe, snapshot: PopulationSnapshot): void {
  sendClient(probe, {
    protocolVersion: PROTOCOL_VERSION,
    type: 'ack',
    snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
    reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
    snapshotBaselineId: snapshot.snapshotBaselineId,
    serverTick: snapshot.serverTick,
    lastEventId: latestReliableEventId(probe),
  });
}

function latestSnapshot(probe: SocketProbe): PopulationSnapshot {
  const snapshot = [...probe.messages].reverse().find((message): message is PopulationSnapshot => (
    message.type === 'fullSnapshot' || message.type === 'deltaSnapshot'
  ));
  if (snapshot === undefined) throw new Error('Client has no authority snapshot to acknowledge');
  return snapshot;
}

async function synchronizeSnapshotAcks(
  room: RoomCreated,
  clients: readonly JoinedClient[],
): Promise<void> {
  const before = await roomMetrics(room);
  const acceptedBefore = Number((before.transport as Record<string, unknown>).snapshotAcksAccepted);
  for (const { probe } of clients) acknowledgeSnapshot(probe, latestSnapshot(probe));
  await waitForMetrics(
    room,
    (metrics) => Number((metrics.transport as Record<string, unknown>).snapshotAcksAccepted)
      >= acceptedBefore + clients.length,
    `${clients.length}-player current snapshot acknowledgements`,
  );
}

async function joinPopulation(room: RoomCreated, count: 4 | 8): Promise<readonly JoinedClient[]> {
  const clients: JoinedClient[] = [];
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const probe = await connectSocket(room.socketPath);
    const welcomeStart = probe.messages.length;
    const welcome = await waitForTypeAfter(probe, welcomeStart, 'welcome');
    const requestId = `req.p514.join.${count}.${ordinal}`;
    const joinStart = probe.messages.length;
    sendClient(probe, joinMessage(room.roomCode, requestId, `P514 Player ${ordinal + 1}`));
    const join = await waitForTypeAfter(
      probe,
      joinStart,
      'joinAccepted',
      (message) => message.requestId === requestId,
    );
    const snapshot = await waitForTypeAfter(
      probe,
      joinStart,
      'fullSnapshot',
      (message) => message.localReconciliation.player.id === join.playerId,
    );
    const spawn = room.mapBinding.spawns[ordinal];
    if (spawn === undefined) throw new Error(`Missing locked spawn ${ordinal}`);
    expect(welcome.protocolConfig.simulationHz).toBe(20);
    expect(welcome.simulationIdentity).toMatchObject({
      mapId: 'inkfall_foundry',
      fixtureId: 'inkfall_foundry_map_collision',
      fixtureHash: 'bf85e42731fd088e',
    });
    expect(join).toMatchObject({
      connectionMode: 'joined',
      simulationIdentity: welcome.simulationIdentity,
    });
    expect(snapshot.localReconciliation.player).toMatchObject({
      feetPosition: spawn.feetPosition,
      yawMilliDegrees: normalizedYaw(spawn.yawMilliDegrees),
    });
    expect(snapshot.entities).toContainEqual(expect.objectContaining({
      id: join.playerId,
      xMillimeters: spawn.feetPosition.x,
      yMillimeters: spawn.feetPosition.y,
      zMillimeters: spawn.feetPosition.z,
      yawMilliDegrees: spawn.yawMilliDegrees,
    }));
    acknowledgeSnapshot(probe, snapshot);
    clients.push({ ordinal, probe, welcome, join, initialSnapshot: snapshot });
  }
  await waitForMetrics(
    room,
    (metrics) => metrics.players === count && metrics.connectedPlayers === count,
    `${count}-player population`,
  );
  expect(new Set(clients.map(({ join }) => join.playerId)).size).toBe(count);
  expect(new Set(room.mapBinding.spawns.slice(0, count).map(({ spawnId }) => spawnId)).size).toBe(count);
  await waitForMetrics(
    room,
    (metrics) => Number((metrics.transport as Record<string, unknown>).snapshotAcksAccepted) >= count,
    `${count}-player initial snapshot acknowledgements`,
  );
  await synchronizeSnapshotAcks(room, clients);
  return clients;
}

async function movePopulation(
  room: RoomCreated,
  clients: readonly JoinedClient[],
): Promise<readonly PopulationSnapshot[]> {
  const ready = await roomMetrics(room);
  const clientTick = Number(ready.serverTick);
  const ackStarts = clients.map(({ probe }) => probe.messages.length);
  for (const client of clients) {
    sendClient(client.probe, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputBatch',
      commands: [{
        type: 'input',
        sequence: 0,
        clientTick,
        moveX: client.ordinal % 2 === 0 ? 48 : -48,
        moveY: 127,
        lookYawDeltaMilliDegrees: 0,
        lookPitchDeltaMilliDegrees: 0,
        heldButtons: 0,
        pressedButtons: 0,
        releasedButtons: 0,
        selectedSlot: 0,
      }],
    });
  }
  await Promise.all(clients.map(async ({ probe }, index) => {
    await waitForTypeAfter(
      probe,
      ackStarts[index] ?? 0,
      'inputAck',
      ({ lastProcessedInputSequence }) => lastProcessedInputSequence >= 0,
    );
  }));
  await waitForMetrics(
    room,
    (metrics) => Number(metrics.acceptedInputs) >= clients.length,
    `${clients.length}-player accepted movement`,
  );

  const beforeAcks = await roomMetrics(room);
  const acceptedBefore = Number(
    (beforeAcks.transport as Record<string, unknown>).snapshotAcksAccepted,
  );
  const snapshots = await Promise.all(clients.map(async ({ probe }, index) => {
    const snapshot = await waitForMessageAfter(
      probe,
      ackStarts[index] ?? 0,
      (message): message is PopulationSnapshot => (
        (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
        && message.localReconciliation.player.lastProcessedSequence >= 0
      ),
      `${clients.length}-player post-input snapshot`,
    ) as PopulationSnapshot;
    expect(snapshot.localReconciliation.player.lastProcessedSequence).toBe(0);
    acknowledgeSnapshot(probe, snapshot);
    return snapshot;
  }));
  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index];
    const client = clients[index];
    if (snapshot === undefined || client === undefined) throw new Error('Population snapshot missing');
    expect(snapshot.localReconciliation.player.lastProcessedSequence).toBe(0);
  }
  await waitForMetrics(
    room,
    (metrics) => Number((metrics.transport as Record<string, unknown>).snapshotAcksAccepted)
      >= acceptedBefore + clients.length,
    `${clients.length}-player snapshot acknowledgements`,
  );
  return snapshots;
}

async function pingPopulation(clients: readonly JoinedClient[]): Promise<readonly number[]> {
  const sentAt = clients.map(() => Date.now());
  const starts = clients.map(({ probe }) => probe.messages.length);
  for (const client of clients) {
    sendClient(client.probe, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ping',
      nonce: 51_400 + client.ordinal,
      clientTick: client.initialSnapshot.serverTick,
    });
  }
  await Promise.all(clients.map(async ({ probe, ordinal }, index) => {
    await waitForTypeAfter(
      probe,
      starts[index] ?? 0,
      'pong',
      ({ nonce }) => nonce === 51_400 + ordinal,
    );
  }));
  return sentAt.map((startedAt) => Date.now() - startedAt);
}

describe('P5.14 exact-profile real-client population proof', () => {
  it('serves four real clients through movement, world queries, combat, and reconnect continuity', async () => {
    const room = await createInkfallRoom();
    expect(room).toMatchObject({
      roomProfile: P511_INKFALL_REV2_COMBAT_PROFILE,
      mapBinding: {
        mapReference: 'inkfall_foundry@2',
        spawns: { length: 8 },
      },
    });
    const clients = await joinPopulation(room, 4);
    const movedSnapshots = await movePopulation(room, clients);
    const movedCount = movedSnapshots.filter((snapshot, index) => {
      const spawn = room.mapBinding.spawns[index];
      if (spawn === undefined) return false;
      const position = snapshot.localReconciliation.player.feetPosition;
      return position.x !== spawn.feetPosition.x || position.z !== spawn.feetPosition.z;
    }).length;
    expect(movedCount).toBeGreaterThanOrEqual(2);
    for (const snapshot of movedSnapshots) {
      expect(snapshot.localReconciliation.player.feetPosition.y).toBeGreaterThanOrEqual(-10);
    }

    const progressionStart = await roomMetrics(room);
    const progressionStartedAt = Date.now();
    const progressionEnd = await waitForMetrics(
      room,
      (metrics) => Number(metrics.serverTick) >= Number(progressionStart.serverTick) + 4,
      'four-client authority tick progression',
    );
    const progressionMilliseconds = Math.max(1, Date.now() - progressionStartedAt);
    const observedTickRate = (
      (Number(progressionEnd.serverTick) - Number(progressionStart.serverTick)) * 1_000
      / progressionMilliseconds
    );
    expect(observedTickRate).toBeGreaterThanOrEqual(5);
    expect(observedTickRate).toBeLessThanOrEqual(100);

    const ready = await waitForMetrics(
      room,
      (metrics) => metrics.lifecycle === 'active'
        && Number(metrics.serverTick) >= 41
        && metrics.connectedPlayers === 4,
      'four-client active combat readiness',
    );
    expect(ready).toMatchObject({
      roomProfile: P511_INKFALL_REV2_COMBAT_PROFILE,
      players: 4,
      connectedPlayers: 4,
      mapBinding: { mapReference: 'inkfall_foundry@2' },
    });
    const rtts = await pingPopulation(clients);
    expect(Math.max(...rtts)).toBeLessThan(5_000);

    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    await runInDurableObject(stub, async (instance) => {
      (instance as unknown as { runTimer(): Promise<void> }).runTimer = async () => {};
    });
    await synchronizeSnapshotAcks(room, clients);
    const reliableStarts = clients.map(({ probe }) => probe.messages.length);
    const controlled = await runInDurableObject(stub, async (instance) => {
      const runtime = instance as unknown as {
        authority: {
          readonly serverTick: number;
          worldOcclusionPort(ray: unknown): unknown;
          readonly impulseGrenadeWorldPort: { sweepSphere(request: unknown): unknown };
          applyCombatDamage(request: {
            targetPlayerId: string;
            sourcePlayerId: string;
            damagePoints: number;
            causeId: string;
          }): { readonly accepted: boolean };
          exportActiveMatchCheckpoint(): {
            readonly clock: { readonly serverTick: number };
            readonly counters: { readonly acceptedInputs: number };
            readonly players: readonly {
              readonly playerId: string;
              readonly life: {
                readonly phase: string;
                readonly healthPoints: number;
                readonly teamId: string;
                readonly lastSpawnId: string;
              };
              readonly observedRttHistory: readonly unknown[];
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
          exportCheckpoint(): {
            readonly nextSequence: number;
            readonly events: readonly { readonly id: string; readonly kind: string }[];
          };
        };
        transportMetrics: { reliableEventsRecorded: number };
        persistActiveMatchCheckpoint(): void;
        broadcastReliableEvents(): void;
      };
      const ray = runtime.authority.worldOcclusionPort({
        schemaVersion: 1,
        originMillimeters: { x: -33_500, y: 2_000, z: -3_500 },
        directionUnit: { x: 0, y: -1, z: 0 },
        maximumDistanceMillimeters: 120_000,
        layer: 'authoritative_world',
      });
      const sweep = runtime.authority.impulseGrenadeWorldPort.sweepSphere({
        schemaVersion: 1,
        authorityTick: runtime.authority.serverTick,
        projectileId: 'grenade.p514.four.collision',
        ownerPlayerId: clients[0]?.join.playerId ?? 'missing',
        centerMillimeters: { x: -33_500, y: 1_000, z: -3_500 },
        translationMillimeters: { x: 0, y: -2_000, z: 0 },
        radiusMillimeters: 100,
        solidLayers: ['world_static', 'dynamic_platform', 'player_body', 'door', 'spawn_barrier'],
        ignoredPlayerIds: [clients[0]?.join.playerId ?? 'missing'],
      });
      const attackerId = clients[0]?.join.playerId;
      const targetId = clients[1]?.join.playerId;
      if (attackerId === undefined || targetId === undefined) throw new Error('Missing combat clients');
      const damage = runtime.authority.applyCombatDamage({
        targetPlayerId: targetId,
        sourcePlayerId: attackerId,
        damagePoints: 100,
        causeId: 'p514_four_player_death',
      });
      if (!damage.accepted) throw new Error('P5.14 controlled four-player damage was rejected');
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
        ray,
        sweep,
        checkpoint: runtime.authority.exportActiveMatchCheckpoint(),
        reliable: runtime.reliableEvents.exportCheckpoint(),
        finalEvent,
      };
    });
    expect(controlled.ray).toMatchObject({
      hit: true,
      distanceMillimeters: 2_000,
      colliderId: 'map_collision_spawn_pad_spawn_w_press_a',
    });
    expect(controlled.sweep).toMatchObject({
      contacts: [{
        colliderId: 'map_collision_spawn_pocket_floor_west',
        timeOfImpactPermille: 450,
      }],
    });
    expect(controlled.checkpoint.counters.acceptedInputs).toBeGreaterThanOrEqual(4);
    expect(controlled.checkpoint.players).toHaveLength(4);
    expect(controlled.checkpoint.players.find(
      ({ playerId }) => playerId === clients[1]?.join.playerId,
    )).toMatchObject({ life: { phase: 'dead', healthPoints: 0, teamId: 'team_red' } });
    expect(controlled.checkpoint.match).toMatchObject({
      feedSequence: 1,
      teamScores: expect.arrayContaining([{ teamId: 'team_blue', score: 1 }]),
    });
    expect(controlled.checkpoint.players.every(
      ({ observedRttHistory }) => observedRttHistory.length > 0,
    )).toBe(true);
    expect(controlled.reliable.events.at(-1)).toMatchObject({
      id: controlled.finalEvent.id,
      kind: 'playerKilled',
    });
    await Promise.all(clients.map(async ({ probe }, index) => {
      await waitForMessageAfter(
        probe,
        reliableStarts[index] ?? 0,
        (message) => message.type === 'reliableEventBatch'
          && message.events.some(({ id }) => id === controlled.finalEvent.id),
        'four-player controlled reliable death',
      );
    }));

    const disconnected = clients[3];
    if (disconnected === undefined) throw new Error('Missing reconnect client');
    disconnected.probe.socket.close(1000, 'P5.14 reconnect proof');
    await waitForMetrics(
      room,
      (metrics) => metrics.players === 4 && metrics.connectedPlayers === 3,
      'four-player disconnect checkpoint',
    );
    const resumedProbe = await connectSocket(room.socketPath);
    const welcomeStart = resumedProbe.messages.length;
    const resumedWelcome = await waitForTypeAfter(resumedProbe, welcomeStart, 'welcome');
    expect(resumedWelcome.simulationIdentity).toEqual(disconnected.welcome.simulationIdentity);
    const resumeStart = resumedProbe.messages.length;
    sendClient(resumedProbe, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'resumeRoom',
      requestId: 'req.p514.resume.four',
      roomCode: room.roomCode,
      resumeToken: disconnected.join.resumeToken,
    });
    const resumed = await waitForTypeAfter(
      resumedProbe,
      resumeStart,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.p514.resume.four',
    );
    expect(resumed).toMatchObject({
      playerId: disconnected.join.playerId,
      connectionMode: 'resumed',
    });
    expect(resumed.resumeToken).not.toBe(disconnected.join.resumeToken);
    const resumedSnapshot = await waitForTypeAfter(
      resumedProbe,
      resumeStart,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === disconnected.join.playerId,
    );
    expect(resumedSnapshot.combat?.match).toMatchObject({
      feedSequence: 1,
      teamScores: expect.arrayContaining([{ teamId: 'team_blue', score: 1 }]),
    });
    await expect(waitForMetrics(
      room,
      (metrics) => metrics.players === 4 && metrics.connectedPlayers === 4,
      'four-player resumed continuity',
    )).resolves.toMatchObject({ lifecycle: 'active' });

    const publicMismatch = await SELF.fetch(`${AUTHORITY_ORIGIN}${room.roomPath}`, {
      method: 'POST',
      headers: {
        Origin: ALLOWED_ORIGIN,
        [P58D_COMBAT_PROFILE_HEADER]: P58D_REV3_COMBAT_PROFILE,
      },
    });
    expect(publicMismatch.status).toBe(409);
    await expect(publicMismatch.json()).resolves.toMatchObject({ code: 'ROOM_PROFILE_MISMATCH' });
    for (const client of clients) expect(client.probe.decodeErrors).toEqual([]);
    expect(resumedProbe.decodeErrors).toEqual([]);
  }, 40_000);

  it('restores eight hibernated real clients at one exact populated authority tick', async () => {
    const room = await createInkfallRoom();
    const clients = await joinPopulation(room, 8);
    await movePopulation(room, clients);
    const ready = await waitForMetrics(
      room,
      (metrics) => metrics.lifecycle === 'active'
        && Number(metrics.serverTick) >= 41
        && metrics.connectedPlayers === 8,
      'eight-client active combat readiness',
    );
    expect(ready).toMatchObject({ players: 8, connectedPlayers: 8 });
    const rtts = await pingPopulation(clients);
    expect(Math.max(...rtts)).toBeLessThan(5_000);

    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    await runInDurableObject(stub, async (instance) => {
      (instance as unknown as { runTimer(): Promise<void> }).runTimer = async () => {};
    });
    await synchronizeSnapshotAcks(room, clients);
    const reliableStarts = clients.map(({ probe }) => probe.messages.length);
    const before = await runInDurableObject(stub, async (instance, state) => {
      const runtime = instance as unknown as {
        authority: {
          readonly serverTick: number;
          applyCombatDamage(request: {
            targetPlayerId: string;
            sourcePlayerId: string;
            damagePoints: number;
            causeId: string;
          }): { readonly accepted: boolean };
          exportActiveMatchCheckpoint(): {
            readonly clock: { readonly serverTick: number; readonly lifecycle: string };
            readonly counters: {
              readonly acceptedInputs: number;
              readonly cumulativeQueryMetrics: { readonly moveCapsuleCalls: number; readonly contacts: number };
            };
            readonly players: readonly {
              readonly playerId: string;
              readonly connected: boolean;
              readonly movement: { readonly player: { readonly feetPosition: { readonly x: number; readonly y: number; readonly z: number } } };
              readonly life: {
                readonly phase: string;
                readonly healthPoints: number;
                readonly teamId: string;
                readonly authoritySpawnId: string;
              };
              readonly observedRttHistory: readonly unknown[];
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
          exportCheckpoint(): {
            readonly nextSequence: number;
            readonly events: readonly { readonly id: string; readonly kind: string }[];
          };
        };
        transportMetrics: { reliableEventsRecorded: number };
        persistActiveMatchCheckpoint(): void;
        broadcastReliableEvents(): void;
        runTimer(): Promise<void>;
      };
      runtime.runTimer = async () => {};
      const attackerId = clients[0]?.join.playerId;
      const targetId = clients[1]?.join.playerId;
      if (attackerId === undefined || targetId === undefined) throw new Error('Missing eight-player combat clients');
      const damage = runtime.authority.applyCombatDamage({
        targetPlayerId: targetId,
        sourcePlayerId: attackerId,
        damagePoints: 100,
        causeId: 'p514_eight_player_death',
      });
      if (!damage.accepted) throw new Error('P5.14 controlled eight-player damage was rejected');
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
      const checkpoint = runtime.authority.exportActiveMatchCheckpoint();
      const row = [...state.storage.sql.exec<Record<string, string | number>>(
        `SELECT recovery_state FROM room_runtime_v2 WHERE singleton = 1`,
      )][0];
      const stored = [...state.storage.sql.exec<Record<string, string | number>>(
        `SELECT authority_tick, checkpoint_hash FROM room_active_checkpoint_v1 WHERE singleton = 1`,
      )][0];
      return {
        checkpoint,
        reliable: runtime.reliableEvents.exportCheckpoint(),
        finalEvent,
        row,
        stored,
      };
    });
    expect(before.row).toEqual({ recovery_state: 'active_checkpointed' });
    expect(before.stored).toMatchObject({
      authority_tick: before.checkpoint.clock.serverTick,
      checkpoint_hash: expect.stringMatching(/^[a-f0-9]{16}$/u),
    });
    expect(before.checkpoint.players).toHaveLength(8);
    expect(before.checkpoint.players.every(({ connected }) => connected)).toBe(true);
    expect(before.checkpoint.counters.acceptedInputs).toBeGreaterThanOrEqual(8);
    expect(before.checkpoint.counters.cumulativeQueryMetrics.moveCapsuleCalls).toBeGreaterThan(0);
    expect(before.checkpoint.counters.cumulativeQueryMetrics.contacts).toBeGreaterThan(0);
    expect(before.checkpoint.players.every(
      ({ observedRttHistory }) => observedRttHistory.length > 0,
    )).toBe(true);
    const teams = before.checkpoint.players.map(({ life }) => life.teamId);
    expect(teams.filter((teamId) => teamId === 'team_blue')).toHaveLength(4);
    expect(teams.filter((teamId) => teamId === 'team_red')).toHaveLength(4);
    for (const client of clients) {
      const player = before.checkpoint.players.find(({ playerId }) => playerId === client.join.playerId);
      const spawn = room.mapBinding.spawns[client.ordinal];
      if (spawn === undefined) throw new Error('Missing eight-player spawn');
      expect(player).toMatchObject({
        life: { lastSpawnId: spawn.spawnId },
        movement: { player: { feetPosition: { y: expect.any(Number) } } },
      });
    }
    expect(before.checkpoint.players.find(
      ({ playerId }) => playerId === clients[1]?.join.playerId,
    )).toMatchObject({ life: { phase: 'dead', healthPoints: 0 } });
    expect(before.checkpoint.match).toMatchObject({
      feedSequence: 1,
      teamScores: expect.arrayContaining([{ teamId: 'team_blue', score: 1 }]),
    });
    expect(before.reliable.events.at(-1)).toMatchObject({
      id: before.finalEvent.id,
      kind: 'playerKilled',
    });
    await Promise.all(clients.map(async ({ probe }, index) => {
      await waitForMessageAfter(
        probe,
        reliableStarts[index] ?? 0,
        (message) => message.type === 'reliableEventBatch'
          && message.events.some(({ id }) => id === before.finalEvent.id),
        'eight-player controlled reliable death',
      );
    }));

    const messageCounts = clients.map(({ probe }) => probe.messages.length);
    await evictDurableObject(stub);
    sendClient(clients[0]?.probe as SocketProbe, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ping',
      nonce: 51_480,
      clientTick: before.checkpoint.clock.serverTick,
    });
    await waitForTypeAfter(
      clients[0]?.probe as SocketProbe,
      messageCounts[0] ?? 0,
      'pong',
      ({ nonce }) => nonce === 51_480,
    );
    const restored = await Promise.all(clients.map(async ({ probe, join }, index) => (
      await waitForTypeAfter(
        probe,
        messageCounts[index] ?? 0,
        'fullSnapshot',
        ({ serverTick, localReconciliation }) => (
          serverTick === before.checkpoint.clock.serverTick
          && localReconciliation.player.id === join.playerId
        ),
      )
    )));
    for (const snapshot of restored) {
      expect(snapshot.combat?.players).toHaveLength(8);
      expect(snapshot.combat?.players.find(
        ({ playerId }) => playerId === clients[1]?.join.playerId,
      )).toMatchObject({ lifePhase: 'dead', healthPoints: 0 });
      expect(snapshot.combat?.match).toMatchObject({
        feedSequence: 1,
        teamScores: expect.arrayContaining([{ teamId: 'team_blue', score: 1 }]),
      });
    }
    const after = await runInDurableObject(stub, async (instance) => {
      const runtime = instance as unknown as Readonly<{
        authority: {
          exportActiveMatchCheckpoint(): {
            readonly clock: { readonly serverTick: number };
            readonly players: readonly { readonly playerId: string; readonly connected: boolean }[];
            readonly match: { readonly feedSequence: number };
          };
        };
      }>;
      return runtime.authority.exportActiveMatchCheckpoint();
    });
    expect(after.clock.serverTick).toBeGreaterThanOrEqual(before.checkpoint.clock.serverTick);
    expect(after.players).toHaveLength(8);
    expect(after.players.every(({ connected }) => connected)).toBe(true);
    expect(after.match.feedSequence).toBe(1);
    for (const client of clients) expect(client.probe.decodeErrors).toEqual([]);
  }, 40_000);

  it('keeps an eight-player socket open when one authority tick consumes a complete fire pulse', async () => {
    const room = await createInkfallRoom();
    const clients = await joinPopulation(room, 8);
    const driver = clients[6];
    if (driver === undefined) throw new Error('Missing eighth-population fire-pulse driver');

    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    await runInDurableObject(stub, async (instance) => {
      (instance as unknown as { runTimer(): Promise<void> }).runTimer = async () => {};
    });
    await synchronizeSnapshotAcks(room, clients);

    const before = await roomMetrics(room);
    const clientTick = Number(before.serverTick);
    const acceptedBefore = Number(before.acceptedInputs);
    const snapshotStart = driver.probe.messages.length;
    const primaryFire = 1 << 3;
    sendClient(driver.probe, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputBatch',
      commands: [
        {
          type: 'input',
          sequence: 0,
          clientTick,
          moveX: 0,
          moveY: 0,
          lookYawDeltaMilliDegrees: 0,
          lookPitchDeltaMilliDegrees: 0,
          heldButtons: primaryFire,
          pressedButtons: primaryFire,
          releasedButtons: 0,
          selectedSlot: 0,
        },
        {
          type: 'input',
          sequence: 1,
          clientTick: clientTick + 1,
          moveX: 0,
          moveY: 0,
          lookYawDeltaMilliDegrees: 0,
          lookPitchDeltaMilliDegrees: 0,
          heldButtons: 0,
          pressedButtons: 0,
          releasedButtons: primaryFire,
          selectedSlot: 0,
        },
      ],
    });
    await waitForMetrics(
      room,
      (metrics) => Number(metrics.acceptedInputs) >= acceptedBefore + 2,
      'same-tick fire pulse input acceptance',
    );

    const controlled = await runInDurableObject(stub, async (instance) => {
      const runtime = instance as unknown as {
        authority: {
          advanceOneTick(): unknown;
          exportActiveMatchCheckpoint(): {
            readonly clock: { readonly serverTick: number };
            readonly players: readonly {
              readonly playerId: string;
              readonly movement: {
                readonly player: {
                  readonly intent: {
                    readonly heldButtons: number;
                    readonly pressedButtons: number;
                    readonly releasedButtons: number;
                  };
                };
              };
            }[];
          };
        };
        broadcastInputAcks(): void;
        broadcastSnapshots(): ReadonlyMap<string, unknown>;
        broadcastReliableEvents(overrides?: ReadonlyMap<string, unknown>): void;
      };
      runtime.authority.advanceOneTick();
      const checkpoint = runtime.authority.exportActiveMatchCheckpoint();
      const player = checkpoint.players.find(({ playerId }) => playerId === driver.join.playerId);
      if (player === undefined) throw new Error('Missing fire-pulse driver checkpoint');
      runtime.broadcastInputAcks();
      const overrides = runtime.broadcastSnapshots();
      runtime.broadcastReliableEvents(overrides);
      return {
        serverTick: checkpoint.clock.serverTick,
        intent: player.movement.player.intent,
      };
    });

    expect(controlled.intent).toMatchObject({
      heldButtons: 0,
      pressedButtons: primaryFire,
      releasedButtons: primaryFire,
    });
    const snapshot = await waitForMessageAfter(
      driver.probe,
      snapshotStart,
      (message): message is PopulationSnapshot => (
        (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
        && message.serverTick === controlled.serverTick
        && message.localReconciliation.player.lastProcessedSequence === 1
      ),
      'decodable same-tick fire-pulse snapshot',
      5_000,
    ) as PopulationSnapshot;
    expect(snapshot.localReconciliation.player.intent).toEqual(controlled.intent);
    expect(driver.probe.decodeErrors).toEqual([]);
    expect(driver.probe.socket.readyState).toBe(WebSocket.OPEN);
  }, 30_000);

  it('coalesces checkpoint dirtiness to 500 ms and preserves forced boundary durability', async () => {
    const room = await createInkfallRoom();
    await joinPopulation(room, 4);
    await waitForMetrics(
      room,
      (metrics) => metrics.lifecycle === 'active' && metrics.connectedPlayers === 4,
      'four-client checkpoint coalescing readiness',
    );
    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    const result = await runInDurableObject(stub, async (instance, state) => {
      const runtime = instance as unknown as {
        authority: {
          readonly serverTick: number;
          advanceOneTick(): unknown;
        };
        transportMetrics: {
          activeMatchCheckpointCoalescedMarks: number;
          activeMatchCheckpointWrites: number;
        };
        runTimer(): Promise<void>;
        markActiveMatchCheckpointDirty(): void;
        flushActiveMatchCheckpoint(): void;
        persistActiveMatchCheckpoint(): void;
      };
      runtime.runTimer = async () => {};
      runtime.persistActiveMatchCheckpoint();
      const initialTick = runtime.authority.serverTick;
      const initialWrites = runtime.transportMetrics.activeMatchCheckpointWrites;
      const initialCoalescedMarks = runtime.transportMetrics.activeMatchCheckpointCoalescedMarks;

      runtime.markActiveMatchCheckpointDirty();
      runtime.markActiveMatchCheckpointDirty();
      runtime.flushActiveMatchCheckpoint();
      const sameTickWrites = runtime.transportMetrics.activeMatchCheckpointWrites;

      runtime.authority.advanceOneTick();
      runtime.flushActiveMatchCheckpoint();
      const nextTick = runtime.authority.serverTick;
      const nextTickWrites = runtime.transportMetrics.activeMatchCheckpointWrites;

      for (let tick = 1; tick < 10; tick += 1) runtime.authority.advanceOneTick();
      runtime.markActiveMatchCheckpointDirty();
      runtime.flushActiveMatchCheckpoint();
      const intervalTick = runtime.authority.serverTick;
      const intervalWrites = runtime.transportMetrics.activeMatchCheckpointWrites;

      runtime.markActiveMatchCheckpointDirty();
      runtime.flushActiveMatchCheckpoint();
      const coalescedSameTickWrites = runtime.transportMetrics.activeMatchCheckpointWrites;
      runtime.persistActiveMatchCheckpoint();
      const forcedSameTickWrites = runtime.transportMetrics.activeMatchCheckpointWrites;
      const stored = [...state.storage.sql.exec<{ authority_tick: number }>(
        'SELECT authority_tick FROM room_active_checkpoint_v1 WHERE singleton = 1',
      )][0];
      return {
        initialTick,
        nextTick,
        intervalTick,
        initialWrites,
        sameTickWrites,
        nextTickWrites,
        intervalWrites,
        coalescedSameTickWrites,
        forcedSameTickWrites,
        coalescedMarks: runtime.transportMetrics.activeMatchCheckpointCoalescedMarks
          - initialCoalescedMarks,
        stored,
      };
    });

    expect(result.nextTick).toBe(result.initialTick + 1);
    expect(result.intervalTick).toBe(result.initialTick + 10);
    expect(result.sameTickWrites).toBe(result.initialWrites);
    expect(result.nextTickWrites).toBe(result.initialWrites);
    expect(result.intervalWrites).toBe(result.initialWrites + 1);
    expect(result.coalescedSameTickWrites).toBe(result.intervalWrites);
    expect(result.forcedSameTickWrites).toBe(result.intervalWrites + 1);
    expect(result.coalescedMarks).toBeGreaterThanOrEqual(3);
    expect(result.stored).toEqual({ authority_tick: result.intervalTick });
  }, 30_000);

  it('recovers safely when marked input and event acknowledgement are evicted before the next tick', async () => {
    const room = await createInkfallRoom();
    const clients = await joinPopulation(room, 4);
    await waitForMetrics(
      room,
      (metrics) => metrics.lifecycle === 'active' && metrics.connectedPlayers === 4,
      'four-client dirty checkpoint recovery readiness',
    );
    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    const actorId = clients[0]?.join.playerId;
    const targetId = clients[1]?.join.playerId;
    if (actorId === undefined || targetId === undefined) throw new Error('Missing dirty recovery clients');
    await synchronizeSnapshotAcks(room, clients);
    const reliableEventMessageStart = (clients[0]?.probe as SocketProbe).messages.length;
    const seeded = await runInDurableObject(stub, async (instance) => {
      const runtime = instance as unknown as {
        authority: { readonly serverTick: number };
        reliableEvents: {
          append(input: {
            serverTick: number;
            kind: 'damageApplied';
            subjectId: string;
            actorId: string;
            targetId: string;
            amountHealthPoints: number;
          }): { readonly id: string };
        };
        transportMetrics: {
          activeMatchCheckpointDirtyMarks: number;
          activeMatchCheckpointWrites: number;
          reliableEventsRecorded: number;
        };
        runTimer(): Promise<void>;
        persistActiveMatchCheckpoint(): void;
        broadcastReliableEvents(): void;
      };
      runtime.runTimer = async () => {};
      const event = runtime.reliableEvents.append({
        serverTick: runtime.authority.serverTick,
        kind: 'damageApplied',
        subjectId: targetId,
        actorId,
        targetId,
        amountHealthPoints: 1,
      });
      runtime.transportMetrics.reliableEventsRecorded += 1;
      runtime.persistActiveMatchCheckpoint();
      runtime.broadcastReliableEvents();
      return {
        checkpointTick: runtime.authority.serverTick,
        eventId: event.id,
        dirtyMarks: runtime.transportMetrics.activeMatchCheckpointDirtyMarks,
        writes: runtime.transportMetrics.activeMatchCheckpointWrites,
      };
    });

    await waitForMessageAfter(
      clients[0]?.probe as SocketProbe,
      reliableEventMessageStart,
      (message) => message.type === 'reliableEventBatch'
        && message.events.some(({ id }) => id === seeded.eventId),
      'seeded reliable event before dirty eviction',
    );
    acknowledgeSnapshot(clients[0]?.probe as SocketProbe, latestSnapshot(clients[0]?.probe as SocketProbe));
    sendClient(clients[0]?.probe as SocketProbe, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputBatch',
      commands: [{
        type: 'input',
        sequence: 0,
        clientTick: seeded.checkpointTick,
        moveX: 0,
        moveY: 64,
        lookYawDeltaMilliDegrees: 0,
        lookPitchDeltaMilliDegrees: 0,
        heldButtons: 0,
        pressedButtons: 0,
        releasedButtons: 0,
        selectedSlot: 0,
      }],
    });
    const dirty = await waitForMetrics(
      room,
      (metrics) => {
        const transport = metrics.transport as Record<string, unknown>;
        return Number(transport.activeMatchCheckpointDirtyMarks) >= seeded.dirtyMarks + 2;
      },
      'unflushed input and event acknowledgement marks',
    );
    expect(Number((dirty.transport as Record<string, unknown>).activeMatchCheckpointWrites)).toBe(
      seeded.writes,
    );
    expect(clients[0]?.probe.messages.some((message) => (
      message.type === 'inputAck' && message.lastProcessedInputSequence >= 0
    ))).toBe(false);

    const messageCounts = clients.map(({ probe }) => probe.messages.length);
    await evictDurableObject(stub);
    sendClient(clients[0]?.probe as SocketProbe, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ping',
      nonce: 51_415,
      clientTick: seeded.checkpointTick,
    });
    await waitForTypeAfter(
      clients[0]?.probe as SocketProbe,
      messageCounts[0] ?? 0,
      'pong',
      ({ nonce }) => nonce === 51_415,
    );
    const restoredSnapshots = await Promise.all(clients.map(async ({ probe, join }, index) => (
      await waitForTypeAfter(
        probe,
        messageCounts[index] ?? 0,
        'fullSnapshot',
        ({ serverTick, localReconciliation }) => (
          serverTick === seeded.checkpointTick
          && localReconciliation.player.id === join.playerId
        ),
      )
    )));
    for (let index = 0; index < clients.length; index += 1) {
      const client = clients[index];
      const snapshot = restoredSnapshots[index];
      if (client === undefined || snapshot === undefined) throw new Error('Missing restored dirty client');
      acknowledgeSnapshot(client.probe, snapshot);
    }
    await waitForMessageAfter(
      clients[0]?.probe as SocketProbe,
      messageCounts[0] ?? 0,
      (message) => message.type === 'reliableEventBatch'
        && message.events.some(({ id }) => id === seeded.eventId),
      'at-least-once reliable event after dirty acknowledgement eviction',
    );

    const resendStart = clients[0]?.probe.messages.length ?? 0;
    sendClient(clients[0]?.probe as SocketProbe, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputBatch',
      commands: [{
        type: 'input',
        sequence: 0,
        clientTick: seeded.checkpointTick,
        moveX: 0,
        moveY: 64,
        lookYawDeltaMilliDegrees: 0,
        lookPitchDeltaMilliDegrees: 0,
        heldButtons: 0,
        pressedButtons: 0,
        releasedButtons: 0,
        selectedSlot: 0,
      }],
    });
    await waitForTypeAfter(
      clients[0]?.probe as SocketProbe,
      resendStart,
      'inputAck',
      ({ lastProcessedInputSequence }) => lastProcessedInputSequence >= 0,
    );
    const recovered = await waitForMetrics(
      room,
      (metrics) => metrics.connectedPlayers === 4 && Number(metrics.acceptedInputs) >= 1,
      'resent input after dirty checkpoint recovery',
    );
    expect(Number((recovered.transport as Record<string, unknown>).snapshotAckDebtEvictions)).toBe(0);
    for (const client of clients) expect(client.probe.decodeErrors).toEqual([]);
  }, 40_000);

  it('sustains four raw clients while bounding regular checkpoint writes to authority ticks', async () => {
    const room = await createInkfallRoom();
    const clients = await joinPopulation(room, 4);
    await waitForMetrics(
      room,
      (metrics) => metrics.lifecycle === 'active' && metrics.connectedPlayers === 4,
      'four-client sustained-load readiness',
    );
    await synchronizeSnapshotAcks(room, clients);

    const starts = clients.map(({ probe }) => probe.messages.length);
    const acknowledgedBaselines = clients.map(({ probe }) => latestSnapshot(probe).snapshotBaselineId);
    const before = await roomMetrics(room);
    const beforeTransport = before.transport as Record<string, unknown>;
    const rounds = 48;
    const acknowledgeNewestSnapshots = () => {
      for (let index = 0; index < clients.length; index += 1) {
        const client = clients[index];
        if (client === undefined) throw new Error(`Missing sustained-load client ${index}`);
        const snapshot = latestSnapshot(client.probe);
        if (snapshot.snapshotBaselineId === acknowledgedBaselines[index]) continue;
        acknowledgeSnapshot(client.probe, snapshot);
        acknowledgedBaselines[index] = snapshot.snapshotBaselineId;
      }
    };

    for (let sequence = 0; sequence < rounds; sequence += 1) {
      for (const client of clients) {
        sendClient(client.probe, {
          protocolVersion: PROTOCOL_VERSION,
          type: 'inputBatch',
          commands: [{
            type: 'input',
            sequence,
            clientTick: latestSnapshot(client.probe).serverTick,
            moveX: client.ordinal % 2 === 0 ? 32 : -32,
            moveY: 96,
            lookYawDeltaMilliDegrees: 0,
            lookPitchDeltaMilliDegrees: 0,
            heldButtons: 0,
            pressedButtons: 0,
            releasedButtons: 0,
            selectedSlot: 0,
          }],
        });
      }
      await delay(50);
      acknowledgeNewestSnapshots();
    }

    const finalSequence = rounds - 1;
    let processedAllInputs = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      acknowledgeNewestSnapshots();
      processedAllInputs = clients.every(({ probe }, index) => (
        probe.messages.slice(starts[index] ?? 0).some((message) => (
          message.type === 'inputAck' && message.lastProcessedInputSequence >= finalSequence
        ))
      ));
      if (processedAllInputs) break;
      await delay(50);
    }
    expect(processedAllInputs).toBe(true);

    const continuationSnapshotCounts = clients.map(({ probe }, index) => (
      probe.messages.slice(starts[index] ?? 0).filter((message) => (
        message.type === 'fullSnapshot' || message.type === 'deltaSnapshot'
      )).length
    ));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await delay(50);
      acknowledgeNewestSnapshots();
    }

    const after = await waitForMetrics(
      room,
      (metrics) => (
        metrics.connectedPlayers === 4
        && Number(metrics.acceptedInputs) >= Number(before.acceptedInputs) + (rounds * clients.length)
      ),
      'four-client sustained input acceptance',
    );
    const afterTransport = after.transport as Record<string, unknown>;
    const authorityTickDelta = Number(after.serverTick) - Number(before.serverTick);
    const checkpointWriteDelta = Number(afterTransport.activeMatchCheckpointWrites)
      - Number(beforeTransport.activeMatchCheckpointWrites);
    const dirtyMarkDelta = Number(afterTransport.activeMatchCheckpointDirtyMarks)
      - Number(beforeTransport.activeMatchCheckpointDirtyMarks);
    const coalescedMarkDelta = Number(afterTransport.activeMatchCheckpointCoalescedMarks)
      - Number(beforeTransport.activeMatchCheckpointCoalescedMarks);

    expect(Number(afterTransport.snapshotAckDebtEvictions)).toBe(
      Number(beforeTransport.snapshotAckDebtEvictions),
    );
    expect(checkpointWriteDelta).toBeGreaterThan(0);
    expect(checkpointWriteDelta).toBeLessThanOrEqual(
      Math.ceil(authorityTickDelta / 10) + 1,
    );
    expect(dirtyMarkDelta).toBeGreaterThanOrEqual(rounds * clients.length);
    expect(coalescedMarkDelta).toBeGreaterThanOrEqual(rounds * clients.length);
    for (let index = 0; index < clients.length; index += 1) {
      const client = clients[index];
      if (client === undefined) throw new Error(`Missing sustained-load client ${index}`);
      const traffic = client.probe.messages.slice(starts[index] ?? 0);
      const snapshots = traffic.filter((message) => (
        message.type === 'fullSnapshot' || message.type === 'deltaSnapshot'
      ));
      expect(snapshots.length).toBeGreaterThan((continuationSnapshotCounts[index] ?? 0) + 1);
      expect(traffic.some((message) => (
        message.type === 'inputAck' && message.lastProcessedInputSequence >= finalSequence
      ))).toBe(true);
      expect(client.probe.socket.readyState).toBe(WebSocket.OPEN);
      expect(client.probe.decodeErrors).toEqual([]);
    }
  }, 40_000);

  it('fails closed when a populated exact-profile room is aliased or persisted with another map identity', async () => {
    const room = await createInkfallRoom();
    const clients = await joinPopulation(room, 4);
    const publicMismatch = await SELF.fetch(`${AUTHORITY_ORIGIN}${room.roomPath}`, {
      method: 'POST',
      headers: {
        Origin: ALLOWED_ORIGIN,
        [P58D_COMBAT_PROFILE_HEADER]: P58D_REV3_COMBAT_PROFILE,
      },
    });
    expect(publicMismatch.status).toBe(409);
    await expect(publicMismatch.json()).resolves.toMatchObject({ code: 'ROOM_PROFILE_MISMATCH' });

    const invalidResume = await connectSocket(room.socketPath);
    const welcomeStart = invalidResume.messages.length;
    await waitForTypeAfter(invalidResume, welcomeStart, 'welcome');
    const resumeStart = invalidResume.messages.length;
    sendClient(invalidResume, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'resumeRoom',
      requestId: 'req.p514.resume.invalid-profile-token',
      roomCode: room.roomCode,
      resumeToken: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    await expect(waitForTypeAfter(
      invalidResume,
      resumeStart,
      'joinRejected',
      ({ requestId }) => requestId === 'req.p514.resume.invalid-profile-token',
    )).resolves.toMatchObject({ code: 'RESUME_REJECTED' });

    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    await runInDurableObject(stub, async (instance, state) => {
      (instance as unknown as { runTimer(): Promise<void> }).runTimer = async () => {};
      const row = [...state.storage.sql.exec<Record<string, string>>(
        'SELECT simulation_identity_json FROM room_runtime_v2 WHERE singleton = 1',
      )][0];
      if (row === undefined) throw new Error('Missing populated room identity');
      const mismatched = JSON.parse(row.simulation_identity_json) as Record<string, unknown>;
      mismatched.mapId = 'phase4_flat_run';
      state.storage.sql.exec(
        'UPDATE room_runtime_v2 SET simulation_identity_json = ? WHERE singleton = 1',
        JSON.stringify(mismatched),
      );
    });
    await evictDurableObject(stub);
    const unavailable = await stub.fetch(new Request(`${AUTHORITY_ORIGIN}${room.metricsPath}`, {
      headers: {
        [room.metricsAccess.headerName]: room.metricsAccess.credential,
      },
    }));
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toMatchObject({ code: 'ROOM_UNAVAILABLE' });
    for (const client of clients) expect(client.probe.decodeErrors).toEqual([]);
    expect(invalidResume.decodeErrors).toEqual([]);
  }, 30_000);
});
