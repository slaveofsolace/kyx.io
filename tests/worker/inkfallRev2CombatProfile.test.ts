/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env, evictDurableObject, reset, runInDurableObject, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import {
  COMBAT_PLAYER_SCORES_CAPABILITY,
  PROTOCOL_VERSION,
  RELIABLE_EVENT_STREAM_VERSION,
  SNAPSHOT_BASELINE_VERSION,
  decodeServerMessage,
  encodeClientMessage,
  type ClientMessage,
  type FullSnapshotMessage,
  type ServerMessage,
} from '../../src/net';
import {
  CROWNPOINT_REV1_COMBAT_PROFILE,
  CROWNPOINT_REVISION_1_WORKER_MAP_BINDING,
  G5_INKFALL_REV4_COMBAT_PROFILE,
  G5_INKFALL_REV5_COMBAT_PROFILE,
  INKFALL_REVISION_2_WORKER_MAP_BINDING,
  INKFALL_REVISION_3_WORKER_MAP_BINDING,
  INKFALL_REVISION_4_WORKER_MAP_BINDING,
  INTERNAL_ROOM_PROFILE_HEADER,
  P511_INKFALL_REV2_COMBAT_PROFILE,
  P58D_COMBAT_PROFILE_HEADER,
  P58D_REV3_COMBAT_PROFILE,
  RELAY_REV1_COMBAT_PROFILE,
  RELAY_REVISION_1_WORKER_MAP_BINDING,
  SWITCHYARD_REV1_COMBAT_PROFILE,
  SWITCHYARD_REVISION_1_WORKER_MAP_BINDING,
} from '../../worker/combatRuntime';
import type { KyxAuthorityEnv } from '../../worker/env';
import { RELAY_AUTHORITY_PLAYER_SLOT_IDS } from '../../worker/relayBotSlots';
import { INTENT_BUTTON } from '../../src/sim';

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
  readonly roomProfile?: string;
  readonly mapBinding?:
    | typeof INKFALL_REVISION_2_WORKER_MAP_BINDING
    | typeof INKFALL_REVISION_3_WORKER_MAP_BINDING
    | typeof INKFALL_REVISION_4_WORKER_MAP_BINDING
    | typeof SWITCHYARD_REVISION_1_WORKER_MAP_BINDING
    | typeof CROWNPOINT_REVISION_1_WORKER_MAP_BINDING
    | typeof RELAY_REVISION_1_WORKER_MAP_BINDING;
}

interface SocketProbe {
  readonly socket: WebSocket;
  readonly messages: ServerMessage[];
  readonly decodeErrors: string[];
  readonly waiters: Set<() => void>;
}

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

async function createRoom(profile: string | null = null): Promise<RoomCreated> {
  const response = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
    method: 'POST',
    headers: {
      Origin: ALLOWED_ORIGIN,
      ...(profile === null ? {} : { [P58D_COMBAT_PROFILE_HEADER]: profile }),
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

function waitForMessage(
  probe: SocketProbe,
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
      const found = probe.messages.find(predicate);
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

function joinMessage(roomCode: string, requestId: string, displayName: string): ClientMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'joinRoom',
    requestId,
    roomCode,
    displayName,
  };
}

async function announceCombatScoreboardCapability(
  probe: SocketProbe,
  requestId: string,
): Promise<void> {
  const welcomeCount = probe.messages.filter(({ type }) => type === 'welcome').length;
  sendClient(probe, {
    protocolVersion: PROTOCOL_VERSION,
    type: 'hello',
    requestId,
    clientBuild: 'worker-combat-scoreboard-test',
    requestedRulesetId: 'revamped_classic',
    capabilities: [COMBAT_PLAYER_SCORES_CAPABILITY],
  });
  await waitForMessage(
    probe,
    () => probe.messages.filter(({ type }) => type === 'welcome').length > welcomeCount,
    'combat scoreboard capability welcome',
  );
}

function acknowledgeSnapshot(probe: SocketProbe, snapshot: FullSnapshotMessage): void {
  sendClient(probe, {
    protocolVersion: PROTOCOL_VERSION,
    type: 'ack',
    snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
    reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
    snapshotBaselineId: snapshot.snapshotBaselineId,
    serverTick: snapshot.serverTick,
    lastEventId: snapshot.reliableEventBaselineId,
  });
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

describe('P5.11 explicit Inkfall Foundry revision-2 Worker combat profile', () => {
  it('reconstitutes the locked world and serves two real clients in map presentation coordinates', async () => {
    const room = await createRoom(P511_INKFALL_REV2_COMBAT_PROFILE);
    expect(room).toMatchObject({
      roomProfile: P511_INKFALL_REV2_COMBAT_PROFILE,
      mapBinding: {
        mapReference: 'inkfall_foundry@2',
        packageDigest: INKFALL_REVISION_2_WORKER_MAP_BINDING.packageDigest,
        fixtureHash: INKFALL_REVISION_2_WORKER_MAP_BINDING.fixtureHash,
        xAxis: 'east',
        yAxis: 'up',
        zAxis: 'north',
        distanceUnit: 'millimeters',
      },
    });
    const publicProfileCheck = await SELF.fetch(`${AUTHORITY_ORIGIN}${room.roomPath}`, {
      method: 'POST',
      headers: {
        Origin: ALLOWED_ORIGIN,
        [P58D_COMBAT_PROFILE_HEADER]: P511_INKFALL_REV2_COMBAT_PROFILE,
      },
    });
    expect(publicProfileCheck.status).toBe(201);
    await expect(publicProfileCheck.json()).resolves.toMatchObject({
      ok: true,
      roomCode: room.roomCode,
      roomProfile: P511_INKFALL_REV2_COMBAT_PROFILE,
      mapBinding: INKFALL_REVISION_2_WORKER_MAP_BINDING,
    });

    const first = await connectSocket(room.socketPath);
    const firstWelcome = await waitForType(first, 'welcome');
    expect(firstWelcome.simulationIdentity).toMatchObject({
      mapId: 'inkfall_foundry',
      fixtureId: 'inkfall_foundry_map_collision',
      fixtureHash: 'bf85e42731fd088e',
    });
    sendClient(first, joinMessage(room.roomCode, 'req.join.inkfall.first', 'Inkfall First'));
    const firstJoin = await waitForType(
      first,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.inkfall.first',
    );
    const firstSnapshot = await waitForType(
      first,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === firstJoin.playerId,
    );
    expect(firstSnapshot.localReconciliation.player).toMatchObject({
      feetPosition: { x: -33_500, y: 0, z: -3_500 },
      yawMilliDegrees: 0,
    });
    expect(firstSnapshot.entities).toContainEqual(expect.objectContaining({
      id: firstJoin.playerId,
      xMillimeters: -33_500,
      yMillimeters: 0,
      zMillimeters: -3_500,
      yawMilliDegrees: 0,
    }));

    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    const beforeEviction = await runInDurableObject(stub, async (instance, state) => {
      const runtime = instance as unknown as Readonly<{
        roomProfile: string | null;
        world: Readonly<{ fixture: { id: string; revision: number }; fixtureHash: string }> | null;
        authority: Readonly<{
          worldOcclusionPort: (ray: unknown) => unknown;
          impulseGrenadeWorldPort: Readonly<{ sweepSphere(request: unknown): unknown }>;
        }> | null;
      }>;
      const profile = [...state.storage.sql.exec<Record<string, string | number>>(
        'SELECT schema_version, profile_id FROM room_profile_v1 WHERE singleton = 1',
      )][0];
      const ray = runtime.authority?.worldOcclusionPort({
        schemaVersion: 1,
        originMillimeters: { x: -33_500, y: 2_000, z: -3_500 },
        directionUnit: { x: 0, y: -1, z: 0 },
        maximumDistanceMillimeters: 120_000,
        layer: 'authoritative_world',
        purpose: 'shot_path',
      });
      const sweep = runtime.authority?.impulseGrenadeWorldPort.sweepSphere({
        schemaVersion: 1,
        authorityTick: 10,
        projectileId: 'grenade.worker.probe',
        ownerPlayerId: firstJoin.playerId,
        centerMillimeters: { x: -33_500, y: 1_000, z: -3_500 },
        translationMillimeters: { x: 0, y: -2_000, z: 0 },
        radiusMillimeters: 100,
        solidLayers: ['world_static', 'dynamic_platform', 'player_body', 'door', 'spawn_barrier'],
        ignoredPlayerIds: [firstJoin.playerId],
      });
      return {
        profile,
        roomProfile: runtime.roomProfile,
        fixtureId: runtime.world?.fixture.id,
        fixtureRevision: runtime.world?.fixture.revision,
        fixtureHash: runtime.world?.fixtureHash,
        ray,
        sweep,
      };
    });
    expect(beforeEviction).toMatchObject({
      profile: { schema_version: 1, profile_id: P511_INKFALL_REV2_COMBAT_PROFILE },
      roomProfile: P511_INKFALL_REV2_COMBAT_PROFILE,
      fixtureId: 'inkfall_foundry_map_collision',
      fixtureRevision: 2,
      fixtureHash: 'bf85e42731fd088e',
      ray: {
        hit: true,
        distanceMillimeters: 2_000,
        colliderId: 'map_collision_spawn_pad_spawn_w_press_a',
      },
      sweep: {
        contacts: [{
          colliderId: 'map_collision_spawn_pocket_floor_west',
          timeOfImpactPermille: 450,
        }],
      },
    });

    const fullSnapshotCount = first.messages.filter(({ type }) => type === 'fullSnapshot').length;
    await evictDurableObject(stub);
    sendClient(first, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ping',
      nonce: 5_110,
      clientTick: 0,
    });
    await waitForType(first, 'pong', ({ nonce }) => nonce === 5_110);
    const reconstituted = await waitForMessage(
      first,
      (message) => message.type === 'fullSnapshot'
        && message !== firstSnapshot
        && first.messages.filter(({ type }) => type === 'fullSnapshot').length > fullSnapshotCount,
      'reconstituted Inkfall snapshot',
    ) as FullSnapshotMessage;
    expect(reconstituted.simulationIdentity).toEqual(firstWelcome.simulationIdentity);
    expect(reconstituted.localReconciliation.player.feetPosition).toEqual({
      x: -33_500,
      y: 0,
      z: -3_500,
    });

    const second = await connectSocket(room.socketPath);
    const secondWelcome = await waitForType(second, 'welcome');
    expect(secondWelcome.simulationIdentity).toEqual(firstWelcome.simulationIdentity);
    sendClient(second, joinMessage(room.roomCode, 'req.join.inkfall.second', 'Inkfall Second'));
    const secondJoin = await waitForType(
      second,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.inkfall.second',
    );
    const secondSnapshot = await waitForType(
      second,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === secondJoin.playerId,
    );
    expect(secondSnapshot.localReconciliation.player).toMatchObject({
      feetPosition: { x: 33_500, y: 0, z: 3_500 },
      yawMilliDegrees: 180_000,
    });
    expect(secondSnapshot.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: firstJoin.playerId,
        xMillimeters: -33_500,
        yMillimeters: 0,
        zMillimeters: -3_500,
      }),
      expect.objectContaining({
        id: secondJoin.playerId,
        xMillimeters: 33_500,
        yMillimeters: 0,
        zMillimeters: 3_500,
      }),
    ]));
    const active = await waitForMetrics(
      room,
      (metrics) => metrics.connectedPlayers === 2 && metrics.lifecycle === 'warmup',
      'two-client Inkfall warmup',
    );
    expect(active).toMatchObject({
      roomProfile: P511_INKFALL_REV2_COMBAT_PROFILE,
      players: 2,
      connectedPlayers: 2,
      mapBinding: {
        mapReference: 'inkfall_foundry@2',
        fixtureHash: 'bf85e42731fd088e',
      },
      transport: {
        lobbyCheckpointRehydrates: 1,
        lobbyCheckpointPlayersRestored: 1,
      },
    });
    expect(first.decodeErrors).toEqual([]);
    expect(second.decodeErrors).toEqual([]);
  }, 30_000);

  it('binds the Rev4 / Revision 3 active checkpoint and resumes the same player', async () => {
    const room = await createRoom(G5_INKFALL_REV4_COMBAT_PROFILE);
    expect(room).toMatchObject({
      roomProfile: G5_INKFALL_REV4_COMBAT_PROFILE,
      mapBinding: INKFALL_REVISION_3_WORKER_MAP_BINDING,
    });
    const first = await connectSocket(room.socketPath);
    const second = await connectSocket(room.socketPath);
    const [firstWelcome, secondWelcome] = await Promise.all([
      waitForType(first, 'welcome'),
      waitForType(second, 'welcome'),
    ]);
    expect(firstWelcome.simulationIdentity).toMatchObject({
      mapId: 'inkfall_foundry',
      fixtureId: 'inkfall_foundry_map_collision',
      fixtureHash: '97eb7772ac59dc95',
    });
    expect(secondWelcome.simulationIdentity).toEqual(firstWelcome.simulationIdentity);

    sendClient(first, joinMessage(room.roomCode, 'req.join.rev4.first', 'Rev4 First'));
    const firstJoin = await waitForType(
      first,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.rev4.first',
    );
    const firstSnapshot = await waitForType(
      first,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === firstJoin.playerId,
    );
    expect(firstSnapshot.localReconciliation.player.feetPosition)
      .toEqual({ x: -33_500, y: 0, z: -3_500 });
    sendClient(second, joinMessage(room.roomCode, 'req.join.rev4.second', 'Rev4 Second'));
    const secondJoin = await waitForType(
      second,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.rev4.second',
    );
    const secondSnapshot = await waitForType(
      second,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === secondJoin.playerId,
    );
    expect(secondSnapshot.localReconciliation.player.feetPosition)
      .toEqual({ x: 33_500, y: 0, z: -3_500 });

    await waitForMetrics(
      room,
      (metrics) => metrics.lifecycle === 'warmup'
        && metrics.connectedPlayers === 2,
      'Rev4 active checkpoint',
    );
    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    const stored = await runInDurableObject(stub, async (_instance, state) => (
      [...state.storage.sql.exec<Record<string, string | number>>(
        `SELECT profile_id, map_binding_json, checkpoint_hash
         FROM room_active_checkpoint_v1 WHERE singleton = 1`,
      )][0]
    ));
    expect(stored).toMatchObject({
      profile_id: G5_INKFALL_REV4_COMBAT_PROFILE,
      map_binding_json: JSON.stringify(INKFALL_REVISION_3_WORKER_MAP_BINDING),
      checkpoint_hash: expect.stringMatching(/^[a-f0-9]{16}$/u),
    });

    first.socket.close(1000, 'Rev4 resume proof');
    await waitForMetrics(
      room,
      (metrics) => metrics.connectedPlayers === 1,
      'Rev4 first player disconnected',
    );
    const resumed = await connectSocket(room.socketPath);
    const resumedWelcome = await waitForType(resumed, 'welcome');
    expect(resumedWelcome.simulationIdentity).toEqual(firstWelcome.simulationIdentity);
    sendClient(resumed, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'resumeRoom',
      requestId: 'req.resume.rev4.first',
      roomCode: room.roomCode,
      resumeToken: firstJoin.resumeToken,
    });
    const resumedJoin = await waitForType(
      resumed,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.resume.rev4.first',
    );
    const resumedSnapshot = await waitForType(
      resumed,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === firstJoin.playerId,
    );
    expect(resumedJoin).toMatchObject({
      connectionMode: 'resumed',
      playerId: firstJoin.playerId,
      matchId: firstJoin.matchId,
    });
    expect(resumedJoin.resumeToken).not.toBe(firstJoin.resumeToken);
    expect(resumedSnapshot.simulationIdentity).toEqual(firstWelcome.simulationIdentity);
    expect(resumedSnapshot.localReconciliation.player.id).toBe(firstJoin.playerId);
    await expect(roomMetrics(room)).resolves.toMatchObject({
      roomProfile: G5_INKFALL_REV4_COMBAT_PROFILE,
      connectedPlayers: 2,
      mapBinding: {
        mapReference: 'inkfall_foundry@3',
        presentationReference:
          'inkfall_foundry@3/press_archive/v5.0/geometry-portal-modular',
        fixtureHash: '97eb7772ac59dc95',
        render: { renderMeshesMayBeAuthority: false },
        zones: expect.arrayContaining([
          expect.objectContaining({ zoneId: 'archive_walk_west' }),
        ]),
        pickups: [],
      },
    });
    expect(resumed.decodeErrors).toEqual([]);
    expect(second.decodeErrors).toEqual([]);
  }, 30_000);

  it('binds the Rev5 room profile to the corrected Revision 4 authority world', async () => {
    const room = await createRoom(G5_INKFALL_REV5_COMBAT_PROFILE);
    expect(room).toMatchObject({
      roomProfile: G5_INKFALL_REV5_COMBAT_PROFILE,
      mapBinding: INKFALL_REVISION_4_WORKER_MAP_BINDING,
    });

    const socket = await connectSocket(room.socketPath);
    const welcome = await waitForType(socket, 'welcome');
    expect(welcome.simulationIdentity).toMatchObject({
      mapId: 'inkfall_foundry',
      fixtureId: 'inkfall_foundry_map_collision',
      fixtureHash: 'b24d002179389621',
    });
    expect(socket.decodeErrors).toEqual([]);
  }, 30_000);

  it('runs Relay Revision 1 with exact spawns, portals, and active checkpoint binding', async () => {
    const room = await createRoom(RELAY_REV1_COMBAT_PROFILE);
    expect(room).toMatchObject({
      roomProfile: RELAY_REV1_COMBAT_PROFILE,
      mapBinding: RELAY_REVISION_1_WORKER_MAP_BINDING,
    });

    const first = await connectSocket(room.socketPath);
    const second = await connectSocket(room.socketPath);
    const [firstWelcome, secondWelcome] = await Promise.all([
      waitForType(first, 'welcome'),
      waitForType(second, 'welcome'),
    ]);
    expect(firstWelcome.simulationIdentity).toMatchObject({
      mapId: 'relay',
      fixtureId: 'relay_map_collision',
      fixtureHash: RELAY_REVISION_1_WORKER_MAP_BINDING.fixtureHash,
    });
    expect(secondWelcome.simulationIdentity).toEqual(firstWelcome.simulationIdentity);

    sendClient(first, joinMessage(room.roomCode, 'req.join.relay.first', 'Relay First'));
    const firstJoin = await waitForType(
      first,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.relay.first',
    );
    const firstSnapshot = await waitForType(
      first,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === firstJoin.playerId,
    );
    expect(firstSnapshot.localReconciliation.player).toMatchObject({
      feetPosition: { x: -29_000, y: 0, z: 0 },
      yawMilliDegrees: 90_000,
    });
    expect(firstSnapshot.combat?.players).toHaveLength(8);
    acknowledgeSnapshot(first, firstSnapshot);
    const firstPopulation = await waitForMetrics(
      room,
      (candidate) => candidate.connectedPlayers === 8,
      'Relay one-human bot population',
    );
    expect(firstPopulation).toMatchObject({
      botPopulation: {
        targetPlayers: 8,
        serverControlledPlayers: 7,
        connectedHumanPlayers: 1,
        reservedHumanReconnectSlots: 0,
      },
    });

    sendClient(second, joinMessage(room.roomCode, 'req.join.relay.second', 'Relay Second'));
    const secondJoin = await waitForType(
      second,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.relay.second',
    );
    const secondSnapshot = await waitForType(
      second,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === secondJoin.playerId,
    );
    expect(secondSnapshot.localReconciliation.player).toMatchObject({
      feetPosition: { x: 29_000, y: 0, z: 0 },
      yawMilliDegrees: 270_000,
    });
    acknowledgeSnapshot(second, secondSnapshot);

    const metrics = await waitForMetrics(
      room,
      (candidate) => candidate.connectedPlayers === 8
        && candidate.lifecycle === 'active',
      'Relay active checkpoint',
    );
    expect(metrics).toMatchObject({
      roomProfile: RELAY_REV1_COMBAT_PROFILE,
      players: 8,
      connectedPlayers: 8,
      botPopulation: {
        schemaVersion: 1,
        strategy: 'relay_authority_map_assault_slot_takeover_v3',
        targetPlayers: 8,
        serverControlledPlayers: 6,
        connectedHumanPlayers: 2,
        reservedHumanReconnectSlots: 0,
        combatGraceTicks: 60,
        humanControlObserved: false,
        combatReadyAtTick: null,
        combatEnabled: false,
      },
      mapBinding: {
        mapReference: 'relay@1',
        presentationReference: 'relay@1/open-sky/v5',
        fixtureHash: RELAY_REVISION_1_WORKER_MAP_BINDING.fixtureHash,
        colliderCardinality: 56,
        spawns: expect.any(Array),
        portal: {
          capabilityId: 'relay_revision_1_linked_world_portal_v1',
        },
      },
    });
    const inputTick = Number(metrics.serverTick);
    sendClient(first, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputBatch',
      commands: [{
        type: 'input',
        sequence: firstSnapshot.localReconciliation.player.lastProcessedSequence + 1,
        clientTick: inputTick,
        moveX: 0,
        moveY: 96,
        lookYawDeltaMilliDegrees: 0,
        lookPitchDeltaMilliDegrees: 0,
        heldButtons: 0,
        pressedButtons: 0,
        releasedButtons: 0,
        selectedSlot: 0,
      }],
    });
    const armed = await waitForMetrics(
      room,
      (candidate) => (
        (candidate.botPopulation as { readonly humanControlObserved?: boolean })
          ?.humanControlObserved === true
      ),
      'Relay bot combat grace armed by human control',
    );
    expect(armed.botPopulation).toMatchObject({
      combatGraceTicks: 60,
      humanControlObserved: true,
      combatEnabled: false,
    });
    expect(
      Number((armed.botPopulation as { readonly combatReadyAtTick: number }).combatReadyAtTick)
      - inputTick,
    ).toBeGreaterThanOrEqual(60);
    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    const stored = await runInDurableObject(stub, async (_instance, state) => (
      [...state.storage.sql.exec<Record<string, string | number>>(
        `SELECT profile_id, map_binding_json, checkpoint_hash, checkpoint_json
         FROM room_active_checkpoint_v1 WHERE singleton = 1`,
      )][0]
    ));
    expect(stored).toMatchObject({
      profile_id: RELAY_REV1_COMBAT_PROFILE,
      map_binding_json: JSON.stringify(RELAY_REVISION_1_WORKER_MAP_BINDING),
      checkpoint_hash: expect.stringMatching(/^[a-f0-9]{16}$/u),
    });
    const checkpoint = JSON.parse(String(stored.checkpoint_json)) as {
      readonly authority: {
        readonly players: readonly {
          readonly playerId: string;
          readonly connectionId: string;
          readonly connected: boolean;
        }[];
      };
      readonly playerEventAcknowledgements: readonly unknown[];
      readonly sessionGenerations: readonly unknown[];
    };
    expect(checkpoint.authority.players).toHaveLength(8);
    expect(checkpoint.authority.players.filter(({ connectionId }) => (
      connectionId.startsWith('connection.relay.bot.')
    ))).toHaveLength(6);
    expect(checkpoint.authority.players.every(({ connected }) => connected)).toBe(true);
    expect(checkpoint.playerEventAcknowledgements).toHaveLength(8);
    expect(checkpoint.sessionGenerations).toHaveLength(8);
    expect(first.decodeErrors).toEqual([]);
    expect(second.decodeErrors).toEqual([]);
  }, 30_000);

  it.each([
    {
      profile: SWITCHYARD_REV1_COMBAT_PROFILE,
      binding: SWITCHYARD_REVISION_1_WORKER_MAP_BINDING,
      mapId: 'switchyard',
      spawn: { x: -26_000, y: 0, z: 14_000 },
      yawMilliDegrees: 90_000,
    },
    {
      profile: CROWNPOINT_REV1_COMBAT_PROFILE,
      binding: CROWNPOINT_REVISION_1_WORKER_MAP_BINDING,
      mapId: 'crownpoint',
      spawn: { x: -21_000, y: 0, z: 11_000 },
      yawMilliDegrees: 90_000,
    },
  ] as const)('creates an eight-slot $mapId authority room', async ({
    profile,
    binding,
    mapId,
    spawn,
    yawMilliDegrees,
  }) => {
    const room = await createRoom(profile);
    expect(room).toMatchObject({ roomProfile: profile, mapBinding: binding });
    const socket = await connectSocket(room.socketPath);
    const welcome = await waitForType(socket, 'welcome');
    expect(welcome.simulationIdentity).toMatchObject({
      mapId,
      fixtureId: binding.fixtureId,
      fixtureHash: binding.fixtureHash,
    });
    sendClient(socket, joinMessage(room.roomCode, `req.join.${mapId}`, `${mapId} player`));
    const joined = await waitForType(
      socket,
      'joinAccepted',
      ({ requestId }) => requestId === `req.join.${mapId}`,
    );
    const snapshot = await waitForType(
      socket,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === joined.playerId,
    );
    expect(snapshot.localReconciliation.player).toMatchObject({
      feetPosition: spawn,
      yawMilliDegrees,
    });
    expect(snapshot.combat?.players).toHaveLength(8);
    const metrics = await waitForMetrics(
      room,
      (candidate) => candidate.connectedPlayers === 8,
      `${mapId} one-human bot population`,
    );
    expect(metrics).toMatchObject({
      roomProfile: profile,
      mapBinding: binding,
      botPopulation: {
        strategy: `${mapId}_authority_map_assault_slot_takeover_v2`,
        targetPlayers: 8,
        serverControlledPlayers: 7,
        connectedHumanPlayers: 1,
      },
    });
  }, 30_000);

  it('gates authoritative combat scoreboards across full, delta, and resumed snapshots', async () => {
    const room = await createRoom(RELAY_REV1_COMBAT_PROFILE);
    const capable = await connectSocket(room.socketPath);
    const legacy = await connectSocket(room.socketPath);
    await Promise.all([
      waitForType(capable, 'welcome'),
      waitForType(legacy, 'welcome'),
    ]);
    await announceCombatScoreboardCapability(capable, 'req.hello.relay.scoreboard');

    sendClient(capable, joinMessage(room.roomCode, 'req.join.relay.scoreboard', 'Scoreboard Client'));
    const capableJoin = await waitForType(
      capable,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.relay.scoreboard',
    );
    const capableFull = await waitForType(
      capable,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === capableJoin.playerId,
    );
    expect(capableFull.combat?.match.scoreboard?.playerScores).toHaveLength(8);
    expect(capableFull.combat?.match.scoreboard?.playerScores.map(({ playerId }) => playerId))
      .toEqual(RELAY_AUTHORITY_PLAYER_SLOT_IDS);
    expect(capableFull.combat?.match.scoreboard?.playerScores[0]).toEqual({
      playerId: capableJoin.playerId,
      teamId: 'team_blue',
      kills: 0,
      deaths: 0,
      assists: 0,
    });
    acknowledgeSnapshot(capable, capableFull);

    sendClient(legacy, joinMessage(room.roomCode, 'req.join.relay.legacy', 'Legacy Client'));
    const legacyJoin = await waitForType(
      legacy,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.relay.legacy',
    );
    const legacyFull = await waitForType(
      legacy,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === legacyJoin.playerId,
    );
    expect(legacyFull.combat?.match.scoreboard).toBeUndefined();
    acknowledgeSnapshot(legacy, legacyFull);

    const capableDelta = await waitForType(
      capable,
      'deltaSnapshot',
      ({ combat, serverTick }) => (
        serverTick > capableFull.serverTick
        && combat?.match.scoreboard?.playerScores.length === 8
      ),
    );
    expect(capableDelta.combat?.match.scoreboard?.playerScores.map(({ playerId }) => playerId).sort())
      .toEqual([...RELAY_AUTHORITY_PLAYER_SLOT_IDS].sort());
    const legacyDelta = await waitForType(
      legacy,
      'deltaSnapshot',
      ({ serverTick }) => serverTick > legacyFull.serverTick,
    );
    expect(legacyDelta.combat?.match.scoreboard).toBeUndefined();

    capable.socket.close(1000, 'scoreboard resume proof');
    const disconnectedMetrics = await waitForMetrics(
      room,
      (metrics) => metrics.connectedPlayers === 7,
      'scoreboard client disconnected',
    );
    expect(disconnectedMetrics).toMatchObject({
      botPopulation: {
        serverControlledPlayers: 6,
        connectedHumanPlayers: 1,
        reservedHumanReconnectSlots: 1,
      },
    });
    const resumed = await connectSocket(room.socketPath);
    await waitForType(resumed, 'welcome');
    await announceCombatScoreboardCapability(resumed, 'req.hello.relay.scoreboard.resume');
    sendClient(resumed, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'resumeRoom',
      requestId: 'req.resume.relay.scoreboard',
      roomCode: room.roomCode,
      resumeToken: capableJoin.resumeToken,
    });
    const resumedJoin = await waitForType(
      resumed,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.resume.relay.scoreboard',
    );
    const resumedFull = await waitForType(
      resumed,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === capableJoin.playerId,
    );
    expect(resumedJoin).toMatchObject({
      connectionMode: 'resumed',
      playerId: capableJoin.playerId,
    });
    expect(resumedFull.combat?.match.scoreboard?.playerScores.map(({ playerId }) => playerId).sort())
      .toEqual([...RELAY_AUTHORITY_PLAYER_SLOT_IDS].sort());
    expect(capable.decodeErrors).toEqual([]);
    expect(legacy.decodeErrors).toEqual([]);
    expect(resumed.decodeErrors).toEqual([]);
  }, 30_000);

  it('rejects profile mismatch, cross-profile resume, and persisted flat-run aliasing', async () => {
    const defaultRoom = await createRoom();
    const defaultSocket = await connectSocket(defaultRoom.socketPath);
    await waitForType(defaultSocket, 'welcome');
    sendClient(defaultSocket, joinMessage(defaultRoom.roomCode, 'req.join.default', 'Default'));
    const defaultJoin = await waitForType(
      defaultSocket,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.default',
    );

    const flatCombatRoom = await createRoom(P58D_REV3_COMBAT_PROFILE);
    const flatStub = authorityEnv.KYX_ROOM.getByName(flatCombatRoom.roomCode);
    const flatIdentityJson = await runInDurableObject(flatStub, async (_instance, state) => (
      [...state.storage.sql.exec<Record<string, string>>(
        'SELECT simulation_identity_json FROM room_runtime_v2 WHERE singleton = 1',
      )][0]?.simulation_identity_json
    ));
    expect(flatIdentityJson).toContain('phase4_flat_run');

    const inkfallRoom = await createRoom(P511_INKFALL_REV2_COMBAT_PROFILE);
    const publicMismatch = await SELF.fetch(`${AUTHORITY_ORIGIN}${inkfallRoom.roomPath}`, {
      method: 'POST',
      headers: {
        Origin: ALLOWED_ORIGIN,
        [P58D_COMBAT_PROFILE_HEADER]: P58D_REV3_COMBAT_PROFILE,
      },
    });
    expect(publicMismatch.status).toBe(409);
    await expect(publicMismatch.json()).resolves.toMatchObject({ code: 'ROOM_PROFILE_MISMATCH' });
    const inkfallStub = authorityEnv.KYX_ROOM.getByName(inkfallRoom.roomCode);
    const mismatch = await inkfallStub.fetch(new Request(
      `${AUTHORITY_ORIGIN}${inkfallRoom.roomPath}`,
      {
        method: 'POST',
        headers: { [INTERNAL_ROOM_PROFILE_HEADER]: P58D_REV3_COMBAT_PROFILE },
      },
    ));
    expect(mismatch.status).toBe(409);
    await expect(mismatch.json()).resolves.toMatchObject({ code: 'ROOM_PROFILE_MISMATCH' });
    await expect(roomMetrics(inkfallRoom)).resolves.toMatchObject({
      roomProfile: P511_INKFALL_REV2_COMBAT_PROFILE,
      mapBinding: { mapReference: 'inkfall_foundry@2' },
    });

    const inkfallSocket = await connectSocket(inkfallRoom.socketPath);
    await waitForType(inkfallSocket, 'welcome');
    sendClient(inkfallSocket, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'resumeRoom',
      requestId: 'req.resume.cross-profile',
      roomCode: inkfallRoom.roomCode,
      resumeToken: defaultJoin.resumeToken,
    });
    const resumeRejected = await waitForType(
      inkfallSocket,
      'joinRejected',
      ({ requestId }) => requestId === 'req.resume.cross-profile',
    );
    expect(resumeRejected.code).toBe('RESUME_REJECTED');

    if (flatIdentityJson === undefined) throw new Error('Missing flat-run persisted identity');
    await runInDurableObject(inkfallStub, async (_instance, state) => {
      state.storage.sql.exec(
        'UPDATE room_runtime_v2 SET simulation_identity_json = ? WHERE singleton = 1',
        flatIdentityJson,
      );
    });
    inkfallSocket.socket.close(1000, 'identity tamper probe');
    await evictDurableObject(inkfallStub);
    const aliased = await SELF.fetch(`${AUTHORITY_ORIGIN}${inkfallRoom.socketPath}`, {
      headers: { Origin: ALLOWED_ORIGIN, Upgrade: 'websocket' },
    });
    expect(aliased.status).toBe(503);
    await expect(aliased.json()).resolves.toMatchObject({ code: 'ROOM_UNAVAILABLE' });
  });

  it('backfills the versioned profile row for an older accepted P5.9 room identity', async () => {
    const room = await createRoom(P58D_REV3_COMBAT_PROFILE);
    const initial = await connectSocket(room.socketPath);
    const initialWelcome = await waitForType(initial, 'welcome');
    expect(initialWelcome.simulationIdentity.mapId).toBe('phase4_flat_run');
    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec('DELETE FROM room_profile_v1 WHERE singleton = 1');
    });
    initial.socket.close(1000, 'legacy profile migration');
    await evictDurableObject(stub);

    const reconstituted = await connectSocket(room.socketPath);
    const welcome = await waitForType(reconstituted, 'welcome');
    expect(welcome.simulationIdentity).toEqual(initialWelcome.simulationIdentity);
    const backfilled = await runInDurableObject(stub, async (_instance, state) => (
      [...state.storage.sql.exec<Record<string, string | number>>(
        'SELECT schema_version, profile_id FROM room_profile_v1 WHERE singleton = 1',
      )][0]
    ));
    expect(backfilled).toEqual({
      schema_version: 1,
      profile_id: P58D_REV3_COMBAT_PROFILE,
    });
  });

  it('reconstitutes two live clients with exact dead-player, projectile, and reliable ordinals', async () => {
    const room = await createRoom(P511_INKFALL_REV2_COMBAT_PROFILE);
    const first = await connectSocket(room.socketPath);
    const second = await connectSocket(room.socketPath);
    await Promise.all([waitForType(first, 'welcome'), waitForType(second, 'welcome')]);
    sendClient(first, joinMessage(room.roomCode, 'req.join.p513.first', 'P513 First'));
    const firstJoin = await waitForType(
      first,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.p513.first',
    );
    await waitForType(first, 'fullSnapshot', ({ serverTick }) => serverTick === firstJoin.serverTick);
    sendClient(second, joinMessage(room.roomCode, 'req.join.p513.second', 'P513 Second'));
    const secondJoin = await waitForType(
      second,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.p513.second',
    );
    await waitForType(second, 'fullSnapshot', ({ serverTick }) => serverTick === secondJoin.serverTick);
    const ready = await waitForMetrics(
      room,
      (metrics) => metrics.lifecycle === 'active'
        && Number(metrics.serverTick) >= 41
        && metrics.connectedPlayers === 2,
      'P5.13 live checkpoint combat readiness',
    );
    const inputTick = Number(ready.serverTick);
    sendClient(first, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputBatch',
      commands: [{
        type: 'input',
        sequence: 0,
        clientTick: inputTick,
        moveX: 0,
        moveY: 0,
        lookYawDeltaMilliDegrees: 0,
        lookPitchDeltaMilliDegrees: 0,
        heldButtons: INTENT_BUTTON.abilityOne,
        pressedButtons: INTENT_BUTTON.abilityOne,
        releasedButtons: 0,
        selectedSlot: 0,
      }],
    });

    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    const projectileStartedAt = Date.now();
    while (Date.now() - projectileStartedAt < 10_000) {
      const projectiles = await runInDurableObject(stub, async (instance) => {
        const runtime = instance as unknown as Readonly<{
          authority: { exportActiveMatchCheckpoint(): { impulseGrenadeProjectiles: readonly unknown[] } };
        }>;
        return runtime.authority.exportActiveMatchCheckpoint().impulseGrenadeProjectiles.length;
      });
      if (projectiles > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

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
            readonly clock: { readonly serverTick: number };
            readonly players: readonly {
              readonly playerId: string;
              readonly life: { readonly phase: string; readonly healthPoints: number };
            }[];
            readonly impulseGrenadeProjectiles: readonly { readonly projectileId: string }[];
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
        persistActiveMatchCheckpoint(): void;
        runTimer(): Promise<void>;
      };
      runtime.runTimer = async () => {};
      const damage = runtime.authority.applyCombatDamage({
        targetPlayerId: secondJoin.playerId,
        sourcePlayerId: firstJoin.playerId,
        damagePoints: 100,
        causeId: 'p513_eviction_probe',
      });
      if (!damage.accepted) throw new Error('P5.13 controlled damage was rejected');
      runtime.reliableEvents.append({
        serverTick: runtime.authority.serverTick,
        kind: 'damageApplied',
        subjectId: secondJoin.playerId,
        actorId: firstJoin.playerId,
        targetId: secondJoin.playerId,
        amountHealthPoints: 100,
      });
      const finalEvent = runtime.reliableEvents.append({
        serverTick: runtime.authority.serverTick,
        kind: 'playerKilled',
        subjectId: secondJoin.playerId,
        actorId: firstJoin.playerId,
        targetId: secondJoin.playerId,
        amountHealthPoints: null,
      });
      runtime.persistActiveMatchCheckpoint();
      const authorityCheckpoint = runtime.authority.exportActiveMatchCheckpoint();
      const reliableCheckpoint = runtime.reliableEvents.exportCheckpoint();
      const row = [...state.storage.sql.exec<Record<string, string | number>>(
        `SELECT recovery_state FROM room_runtime_v2 WHERE singleton = 1`,
      )][0];
      const stored = [...state.storage.sql.exec<Record<string, string | number>>(
        `SELECT schema_version, checkpoint_hash_algorithm, checkpoint_hash,
                authority_tick, checkpoint_json
         FROM room_active_checkpoint_v1 WHERE singleton = 1`,
      )][0];
      return { authorityCheckpoint, reliableCheckpoint, finalEvent, row, stored };
    });
    expect(before.row).toEqual({ recovery_state: 'active_checkpointed' });
    expect(before.stored).toMatchObject({
      schema_version: 2,
      checkpoint_hash_algorithm: 'fnv1a64-json-v1',
      checkpoint_hash: expect.stringMatching(/^[a-f0-9]{16}$/u),
      authority_tick: before.authorityCheckpoint.clock.serverTick,
    });
    expect(before.authorityCheckpoint.players.find(({ playerId }) => playerId === secondJoin.playerId))
      .toMatchObject({ life: { phase: 'dead', healthPoints: 0 } });
    expect(before.authorityCheckpoint.impulseGrenadeProjectiles).toHaveLength(1);
    expect(before.authorityCheckpoint.match.feedSequence).toBe(1);
    expect(before.authorityCheckpoint.match.teamScores).toContainEqual({ teamId: 'team_blue', score: 1 });
    expect(before.reliableCheckpoint.events.at(-1)).toMatchObject({
      id: before.finalEvent.id,
      kind: 'playerKilled',
    });

    const firstMessageCount = first.messages.length;
    const secondMessageCount = second.messages.length;
    await evictDurableObject(stub);
    sendClient(first, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ping',
      nonce: 5_130,
      clientTick: before.authorityCheckpoint.clock.serverTick,
    });
    await waitForType(first, 'pong', ({ nonce }) => nonce === 5_130);
    const firstRestored = await waitForMessage(
      first,
      (message) => message.type === 'fullSnapshot'
        && message.serverTick === before.authorityCheckpoint.clock.serverTick
        && first.messages.indexOf(message) >= firstMessageCount,
      'P5.13 first restored snapshot',
    ) as FullSnapshotMessage;
    const secondRestored = await waitForMessage(
      second,
      (message) => message.type === 'fullSnapshot'
        && message.serverTick === before.authorityCheckpoint.clock.serverTick
        && second.messages.indexOf(message) >= secondMessageCount,
      'P5.13 second restored snapshot',
    ) as FullSnapshotMessage;
    for (const restored of [firstRestored, secondRestored]) {
      expect(restored.combat?.players.find(({ playerId }) => playerId === secondJoin.playerId))
        .toMatchObject({ lifePhase: 'dead', healthPoints: 0 });
      expect(restored.combat?.projectiles).toContainEqual(expect.objectContaining({
        ownerPlayerId: firstJoin.playerId,
        phase: 'active',
      }));
      expect(restored.combat?.match).toMatchObject({
        feedSequence: 1,
        teamScores: expect.arrayContaining([{ teamId: 'team_blue', score: 1 }]),
      });
    }
    expect(secondRestored.combat?.projectiles).toEqual(firstRestored.combat?.projectiles);
    const restoredReliable = await waitForMessage(
      first,
      (message) => message.type === 'reliableEventBatch'
        && message.events.some(({ id }) => id === before.finalEvent.id),
      'P5.13 restored reliable ordinals',
    );
    expect(restoredReliable).toMatchObject({
      type: 'reliableEventBatch',
      events: expect.arrayContaining([
        expect.objectContaining({ id: before.finalEvent.id, kind: 'playerKilled' }),
      ]),
    });
    expect(first.decodeErrors).toEqual([]);
    expect(second.decodeErrors).toEqual([]);
  }, 30_000);

  it('fails closed on corrupt or map-mismatched active checkpoints', async () => {
    for (const corruption of ['payload', 'map'] as const) {
      const room = await createRoom(P511_INKFALL_REV2_COMBAT_PROFILE);
      const first = await connectSocket(room.socketPath);
      const second = await connectSocket(room.socketPath);
      await Promise.all([waitForType(first, 'welcome'), waitForType(second, 'welcome')]);
      sendClient(first, joinMessage(room.roomCode, `req.join.${corruption}.first`, 'Corrupt First'));
      await waitForType(first, 'joinAccepted', ({ requestId }) => requestId === `req.join.${corruption}.first`);
      sendClient(second, joinMessage(room.roomCode, `req.join.${corruption}.second`, 'Corrupt Second'));
      await waitForType(second, 'joinAccepted', ({ requestId }) => requestId === `req.join.${corruption}.second`);
      await waitForMetrics(
        room,
        (metrics) => metrics.lifecycle === 'warmup' && metrics.connectedPlayers === 2,
        `active ${corruption} checkpoint`,
      );
      const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
      await runInDurableObject(stub, async (instance, state) => {
        (instance as unknown as { runTimer(): Promise<void> }).runTimer = async () => {};
        state.storage.sql.exec(
          corruption === 'payload'
            ? `UPDATE room_active_checkpoint_v1
               SET checkpoint_json = checkpoint_json || ' '
               WHERE singleton = 1`
            : `UPDATE room_active_checkpoint_v1
               SET map_binding_json = '{}'
               WHERE singleton = 1`,
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
    }
  }, 30_000);
});
