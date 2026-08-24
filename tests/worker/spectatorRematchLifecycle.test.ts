import {
  env,
  evictDurableObject,
  runInDurableObject,
  SELF,
  reset,
} from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import { createAuthorityRematchConsensus, type AuthoritativeRoom } from '../../src/authority';
import {
  PROTOCOL_VERSION,
  decodeServerMessage,
  encodeClientMessage,
  type ClientMessage,
  type ServerMessage,
} from '../../src/net';
import type { KyxAuthorityEnv } from '../../worker/env';
import type { AuthorityRematchConsensusStateV1 } from '../../src/authority';

const ALLOWED_ORIGIN = 'http://127.0.0.1:5173';
const AUTHORITY_ORIGIN = 'https://authority.test';
const authorityEnv = env as unknown as KyxAuthorityEnv;
const sockets = new Set<WebSocket>();

type ServerMessageOfType<T extends ServerMessage['type']> = Extract<ServerMessage, { type: T }>;

interface SocketProbe {
  readonly socket: WebSocket;
  readonly messages: ServerMessage[];
  readonly errors: string[];
  readonly waiters: Set<() => void>;
}

interface RoomCreated {
  readonly roomCode: string;
  readonly socketPath: string;
}

interface LifecycleHarness {
  readonly authority: AuthoritativeRoom | null;
  rematchConsensus: AuthorityRematchConsensusStateV1 | null;
  persistLifecycleState(): void;
}

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
  throw new TypeError('Unsupported WebSocket payload');
}

async function createRoom(): Promise<RoomCreated> {
  const response = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
    method: 'POST',
    headers: { Origin: ALLOWED_ORIGIN },
  });
  expect(response.status).toBe(201);
  return await response.json() as RoomCreated;
}

async function connectSocket(path: string): Promise<SocketProbe> {
  const response = await SELF.fetch(`${AUTHORITY_ORIGIN}${path}`, {
    headers: { Origin: ALLOWED_ORIGIN, Upgrade: 'websocket' },
  });
  if (response.status !== 101 || response.webSocket === null) {
    throw new Error(`WebSocket upgrade failed with ${response.status}`);
  }
  const probe: SocketProbe = {
    socket: response.webSocket,
    messages: [],
    errors: [],
    waiters: new Set(),
  };
  probe.socket.addEventListener('message', (event) => {
    const decoded = decodeServerMessage(socketPayload(event.data));
    if (decoded.ok) probe.messages.push(decoded.value);
    else probe.errors.push(`${decoded.error.code}:${decoded.error.path}`);
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

async function waitForType<T extends ServerMessage['type']>(
  probe: SocketProbe,
  type: T,
  predicate: (message: ServerMessageOfType<T>) => boolean = () => true,
): Promise<ServerMessageOfType<T>> {
  return await new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      probe.waiters.delete(check);
      if (timeout !== null) clearTimeout(timeout);
    };
    const check = () => {
      if (probe.errors.length > 0) {
        cleanup();
        reject(new Error(probe.errors.join(',')));
        return;
      }
      const found = probe.messages.find((message) => (
        message.type === type && predicate(message as ServerMessageOfType<T>)
      ));
      if (found !== undefined) {
        cleanup();
        resolve(found as ServerMessageOfType<T>);
      }
    };
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(
        `Timed out waiting for ${type}; received ${probe.messages.map(({ type: value }) => value).join(',')}`,
      ));
    }, 5_000);
    probe.waiters.add(check);
    check();
  });
}

async function waitForPersistedSpectatorDisconnect(roomCode: string): Promise<void> {
  const stub = authorityEnv.KYX_ROOM.getByName(roomCode);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const disconnected = await runInDurableObject(stub, async (_instance, state) => {
      const json = [...state.storage.sql.exec<Record<string, string>>(
        `SELECT spectator_json FROM room_lifecycle_checkpoint_v1 WHERE singleton = 1`,
      )][0]?.spectator_json;
      if (json === undefined) return false;
      const checkpoint = JSON.parse(json) as {
        readonly spectators: readonly { readonly connected: boolean }[];
      };
      return checkpoint.spectators[0]?.connected === false;
    });
    if (disconnected) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for spectator disconnect persistence');
}

describe('Worker spectator and rematch lifecycle', () => {
  it('rotates spectator credentials across restart and persists accepted consensus', async () => {
    const room = await createRoom();
    const player = await connectSocket(room.socketPath);
    await waitForType(player, 'welcome');
    sendClient(player, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'joinRoom',
      requestId: 'req.player.join',
      roomCode: room.roomCode,
      displayName: 'Lifecycle Player',
    });
    const playerJoin = await waitForType(
      player,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.player.join',
    );
    await waitForType(
      player,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === playerJoin.playerId,
    );

    const spectator = await connectSocket(room.socketPath);
    await waitForType(spectator, 'welcome');
    sendClient(spectator, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'joinSpectator',
      requestId: 'req.spectator.join',
      roomCode: room.roomCode,
      displayName: 'Lifecycle Observer',
    });
    const accepted = await waitForType(
      spectator,
      'spectatorAccepted',
      ({ requestId }) => requestId === 'req.spectator.join',
    );
    expect(accepted.targetPlayerId).toBe(playerJoin.playerId);
    await waitForType(
      spectator,
      'spectatorState',
      ({ requestId, targetPlayerId }) => (
        requestId === 'req.spectator.join' && targetPlayerId === playerJoin.playerId
      ),
    );
    await waitForType(
      spectator,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === playerJoin.playerId,
    );

    sendClient(spectator, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputBatch',
      commands: [{
        type: 'input',
        sequence: 0,
        clientTick: 0,
        moveX: 127,
        moveY: 0,
        lookYawDeltaMilliDegrees: 0,
        lookPitchDeltaMilliDegrees: 0,
        heldButtons: 0,
        pressedButtons: 0,
        releasedButtons: 0,
      }],
    });
    await waitForType(spectator, 'error', ({ code }) => code === 'SPECTATOR_INPUT_FORBIDDEN');

    sendClient(spectator, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'selectSpectatorTarget',
      requestId: 'req.spectator.detach',
      targetPlayerId: null,
    });
    const detached = await waitForType(
      spectator,
      'spectatorState',
      ({ requestId }) => requestId === 'req.spectator.detach',
    );
    expect(detached.targetPlayerId).toBeNull();
    sendClient(spectator, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'selectSpectatorTarget',
      requestId: 'req.spectator.retarget',
      targetPlayerId: playerJoin.playerId,
    });
    const retargeted = await waitForType(
      spectator,
      'spectatorState',
      ({ requestId }) => requestId === 'req.spectator.retarget',
    );
    expect(retargeted.targetRevision).toBeGreaterThan(detached.targetRevision);

    spectator.socket.close(1000, 'exercise spectator resume');
    await waitForPersistedSpectatorDisconnect(room.roomCode);
    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    await evictDurableObject(stub);

    const resumed = await connectSocket(room.socketPath);
    await waitForType(resumed, 'welcome');
    sendClient(resumed, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'resumeSpectator',
      requestId: 'req.spectator.resume',
      roomCode: room.roomCode,
      resumeToken: accepted.resumeToken,
    });
    const resumedAccepted = await waitForType(
      resumed,
      'spectatorAccepted',
      ({ requestId }) => requestId === 'req.spectator.resume',
    );
    expect(resumedAccepted).toMatchObject({
      spectatorId: accepted.spectatorId,
      connectionMode: 'resumed',
      targetPlayerId: playerJoin.playerId,
    });
    expect(resumedAccepted.resumeToken).not.toBe(accepted.resumeToken);

    const replay = await connectSocket(room.socketPath);
    await waitForType(replay, 'welcome');
    sendClient(replay, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'resumeSpectator',
      requestId: 'req.spectator.replay',
      roomCode: room.roomCode,
      resumeToken: accepted.resumeToken,
    });
    await waitForType(
      replay,
      'joinRejected',
      ({ requestId, code }) => requestId === 'req.spectator.replay' && code === 'RESUME_REJECTED',
    );

    await runInDurableObject(stub, async (instance, state) => {
      const harness = instance as unknown as LifecycleHarness;
      const authority = harness.authority;
      if (authority === null) throw new Error('authority unavailable');
      harness.rematchConsensus = createAuthorityRematchConsensus({
        matchId: authority.identity.matchId,
        rematchOrdinal: 1,
        authorityTick: authority.serverTick,
        eligiblePlayerIds: [playerJoin.playerId],
      });
      harness.persistLifecycleState();
      const tokenRow = [...state.storage.sql.exec<Record<string, string>>(
        `SELECT token_digest FROM spectator_resume_sessions WHERE spectator_id = ?`,
        accepted.spectatorId,
      )][0];
      expect(tokenRow?.token_digest).toMatch(/^[a-f0-9]{64}$/u);
      expect(tokenRow?.token_digest).not.toBe(resumedAccepted.resumeToken);
    });

    sendClient(player, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'rematchVote',
      requestId: 'req.rematch.accept',
      decision: 'accept',
    });
    const rematch = await waitForType(
      player,
      'rematchState',
      ({ requestId }) => requestId === 'req.rematch.accept',
    );
    expect(rematch).toMatchObject({
      status: 'accepted',
      eligiblePlayerIds: [playerJoin.playerId],
      votes: [{ playerId: playerJoin.playerId, decision: 'accept' }],
    });

    await evictDurableObject(stub);
    sendClient(player, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ping',
      nonce: 42,
      clientTick: 0,
    });
    await waitForType(player, 'pong', ({ nonce }) => nonce === 42);
    const restored = await runInDurableObject(stub, async (instance, state) => {
      const harness = instance as unknown as LifecycleHarness;
      const row = [...state.storage.sql.exec<Record<string, string>>(
        `SELECT rematch_json, rematch_hash FROM room_lifecycle_checkpoint_v1 WHERE singleton = 1`,
      )][0];
      return {
        status: harness.rematchConsensus?.status,
        rematchJson: row?.rematch_json,
        rematchHash: row?.rematch_hash,
      };
    });
    expect(restored.status).toBe('accepted');
    expect(restored.rematchJson).toContain('"status":"accepted"');
    expect(restored.rematchHash).toMatch(/^[a-f0-9]{16}$/u);
  });
});
