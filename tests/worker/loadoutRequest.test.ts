/// <reference types="@cloudflare/vitest-pool-workers/types" />

import {
  env,
  reset,
  runInDurableObject,
  SELF,
} from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import {
  authorityLoadoutForCombatPreset,
  authorityLoadoutFromRuleset,
  authorityLoadoutRequestFingerprint,
  createAuthorityLoadoutRequestMessage,
  evaluateAuthorityLoadoutRequest,
  hashAuthorityLoadoutDecisionTrace,
  type AuthorityLoadoutLifecycle,
} from '../../src/authority';
import { requireRuleset } from '../../src/content';
import {
  PROTOCOL_VERSION,
  RELIABLE_EVENT_STREAM_VERSION,
  SNAPSHOT_BASELINE_VERSION,
  decodeServerMessage,
  encodeClientMessage,
  type ClientMessage,
  type FullSnapshotMessage,
  type LoadoutRequestMessage,
  type ServerMessage,
} from '../../src/net';
import {
  G5_INKFALL_REV4_COMBAT_PROFILE,
  P58D_COMBAT_PROFILE_HEADER,
} from '../../worker/combatRuntime';
import type { KyxAuthorityEnv } from '../../worker/env';

const ALLOWED_ORIGIN = 'http://127.0.0.1:5173';
const AUTHORITY_ORIGIN = 'https://authority.test';
const authorityEnv = env as unknown as KyxAuthorityEnv;
const authoritativeLoadout = authorityLoadoutFromRuleset(requireRuleset());
const sockets = new Set<WebSocket>();

interface SocketProbe {
  readonly socket: WebSocket;
  readonly messages: ServerMessage[];
  readonly decodeErrors: string[];
  readonly waiters: Set<() => void>;
}

interface RoomCreated {
  readonly roomCode: string;
  readonly socketPath: string;
  readonly metricsPath: string;
  readonly metricsAccess: {
    readonly headerName: string;
    readonly credential: string;
  };
}

type ServerMessageOfType<T extends ServerMessage['type']> =
  Extract<ServerMessage, { type: T }>;

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

async function connectSocket(socketPath: string): Promise<SocketProbe> {
  const response = await SELF.fetch(`${AUTHORITY_ORIGIN}${socketPath}`, {
    headers: { Origin: ALLOWED_ORIGIN, Upgrade: 'websocket' },
  });
  if (response.status !== 101 || response.webSocket === null) {
    throw new Error(`WebSocket upgrade failed with status ${response.status}`);
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
  if (!encoded.ok) {
    throw new Error(`Invalid client fixture: ${encoded.error.code}:${encoded.error.path}`);
  }
  probe.socket.send(encoded.json);
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
      reject(new Error(
        `Timed out waiting for ${label}; received ${probe.messages.map((message) => (
          message.type === 'error'
            ? `${message.type}:${message.code}:${message.detail ?? 'null'}`
            : message.type
        )).join(', ')}`,
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
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const cleanup = () => {
      probe.waiters.delete(check);
      if (timeout !== null) clearTimeout(timeout);
    };
    const check = () => {
      if (!predicate()) return;
      cleanup();
      resolve();
    };
    timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${label}`));
    }, 5_000);
    probe.waiters.add(check);
    check();
  });
}

async function createRoom(profile: string | null = null): Promise<RoomCreated> {
  const response = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
    method: 'POST',
    headers: {
      Origin: ALLOWED_ORIGIN,
      ...(profile === null ? {} : { [P58D_COMBAT_PROFILE_HEADER]: profile }),
    },
  });
  if (response.status !== 201) throw new Error(`Room creation failed: ${response.status}`);
  return await response.json() as RoomCreated;
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

function loadoutMessage(
  requestId: string,
  overrides: Partial<LoadoutRequestMessage> = {},
): LoadoutRequestMessage {
  return {
    ...createAuthorityLoadoutRequestMessage({ requestId, loadout: authoritativeLoadout }),
    ...overrides,
  };
}

function acknowledge(
  probe: SocketProbe,
  snapshot: FullSnapshotMessage,
  lastEventId: string | null,
): void {
  sendClient(probe, {
    protocolVersion: PROTOCOL_VERSION,
    type: 'ack',
    snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
    reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
    snapshotBaselineId: snapshot.snapshotBaselineId,
    serverTick: snapshot.serverTick,
    lastEventId,
  });
}

function decide(
  message: LoadoutRequestMessage,
  lifecycle: AuthorityLoadoutLifecycle = 'lobby',
) {
  return evaluateAuthorityLoadoutRequest({
    lifecycle,
    request: message,
    authoritativeLoadout,
  });
}

function parityTrace() {
  return [
    decide(loadoutMessage('req.loadout.parity.accepted')),
    decide(loadoutMessage('req.loadout.parity.primary', { primaryWeaponId: 'forged_primary' })),
    decide(loadoutMessage('req.loadout.parity.secondary', {
      secondaryWeaponId: 'forged_secondary',
    })),
    decide(loadoutMessage('req.loadout.parity.melee', { meleeWeaponId: 'forged_melee' })),
    decide(loadoutMessage('req.loadout.parity.damage-one', {
      damageAbilityIds: ['forged_damage_one', authoritativeLoadout.damageAbilityIds[1]],
    })),
    decide(loadoutMessage('req.loadout.parity.damage-two', {
      damageAbilityIds: [authoritativeLoadout.damageAbilityIds[0], 'forged_damage_two'],
    })),
    decide(loadoutMessage('req.loadout.parity.utility', { utilityAbilityId: 'forged_utility' })),
    decide(loadoutMessage('req.loadout.parity.locked'), 'warmup'),
  ] as const;
}

describe('P5.8C authoritative Worker loadoutRequest path', () => {
  it('accepts, persists, rejects abuse, and replays one request ID without a duplicate event', async () => {
    const room = await createRoom();
    const probe = await connectSocket(room.socketPath);
    await waitForType(probe, 'welcome');

    const exact = loadoutMessage('req.loadout.accepted');
    sendClient(probe, loadoutMessage('req.loadout.prejoin'));
    expect(await waitForType(
      probe,
      'error',
      ({ code, requestId }) => code === 'JOIN_REQUIRED' && requestId === 'req.loadout.prejoin',
    )).toMatchObject({ detail: null });

    sendClient(probe, joinMessage(room.roomCode, 'req.join.loadout', 'Loadout Tester'));
    const joined = await waitForType(
      probe,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.loadout',
    );
    const snapshot = await waitForType(
      probe,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === joined.playerId,
    );
    const joinedEvents = await waitForType(
      probe,
      'reliableEventBatch',
      ({ events }) => events.some(({ kind }) => kind === 'playerJoined'),
    );
    acknowledge(probe, snapshot, joinedEvents.events.at(-1)?.id ?? null);

    probe.socket.send(JSON.stringify({ ...exact, cooldownEndsAtTick: 0 }));
    expect(await waitForType(
      probe,
      'error',
      ({ code, detail, requestId }) => (
        code === 'PROTOCOL_UNKNOWN_FIELD'
        && detail === '$.cooldownEndsAtTick'
        && requestId === null
      ),
    )).toMatchObject({ code: 'PROTOCOL_UNKNOWN_FIELD' });

    const rejected = loadoutMessage('req.loadout.rejected', {
      primaryWeaponId: 'forged_primary',
    });
    sendClient(probe, rejected);
    expect(await waitForType(
      probe,
      'error',
      ({ code, detail, requestId }) => (
        code === 'LOADOUT_REJECTED'
        && detail === 'primary_weapon_not_allowed'
        && requestId === rejected.requestId
      ),
    )).toMatchObject({ code: 'LOADOUT_REJECTED' });

    sendClient(probe, exact);
    await waitForType(
      probe,
      'serverNotice',
      ({ code, message }) => code === 'LOADOUT_ACCEPTED' && message === exact.requestId,
    );
    const acceptedEvents = await waitForType(
      probe,
      'reliableEventBatch',
      ({ events }) => events.some((event) => (
        event.kind === 'loadoutAccepted' && event.subjectId === joined.playerId
      )),
    );
    const acceptedEvent = acceptedEvents.events.find(({ kind }) => kind === 'loadoutAccepted');
    expect(acceptedEvent).toMatchObject({
      subjectId: joined.playerId,
      actorId: joined.playerId,
      targetId: null,
      amountHealthPoints: null,
    });

    sendClient(probe, exact);
    await waitForProbe(
      probe,
      () => probe.messages.filter((message) => (
        message.type === 'serverNotice'
        && message.code === 'LOADOUT_ACCEPTED'
        && message.message === exact.requestId
      )).length === 2,
      'idempotent accepted replay notice',
    );

    sendClient(probe, { ...exact, primaryWeaponId: 'conflicting_primary' });
    expect(await waitForType(
      probe,
      'error',
      ({ code, requestId }) => (
        code === 'LOADOUT_REQUEST_ID_CONFLICT' && requestId === exact.requestId
      ),
    )).toMatchObject({ detail: null });

    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    const stored = await runInDurableObject(stub, async (_instance, state) => ({
      requestRows: [...state.storage.sql.exec<{
        request_id: string;
        request_fingerprint: string;
        outcome_code: string;
      }>(
        `SELECT request_id, request_fingerprint, outcome_code
         FROM room_loadout_requests_v1 ORDER BY request_ordinal`,
      )],
      selectionRows: [...state.storage.sql.exec<{
        player_id: string;
        ruleset_revision: number;
        request_fingerprint: string;
        selection_json: string;
      }>(
        `SELECT player_id, ruleset_revision, request_fingerprint, selection_json
         FROM room_player_loadouts_v1`,
      )],
    }));
    expect(stored.requestRows).toEqual([
      {
        request_id: rejected.requestId,
        request_fingerprint: authorityLoadoutRequestFingerprint(rejected),
        outcome_code: 'primary_weapon_not_allowed',
      },
      {
        request_id: exact.requestId,
        request_fingerprint: authorityLoadoutRequestFingerprint(exact),
        outcome_code: 'accepted',
      },
    ]);
    expect(stored.selectionRows).toEqual([{
      player_id: joined.playerId,
      ruleset_revision: 2,
      request_fingerprint: authorityLoadoutRequestFingerprint(exact),
      selection_json: JSON.stringify(authoritativeLoadout),
    }]);

    const uniqueAcceptedEventIds = new Set(probe.messages.flatMap((message) => (
      message.type === 'reliableEventBatch'
        ? message.events.filter(({ kind }) => kind === 'loadoutAccepted').map(({ id }) => id)
        : []
    )));
    expect([...uniqueAcceptedEventIds]).toEqual([acceptedEvent?.id]);

    const metricsResponse = await SELF.fetch(`${AUTHORITY_ORIGIN}${room.metricsPath}`, {
      headers: {
        Origin: ALLOWED_ORIGIN,
        [room.metricsAccess.headerName]: room.metricsAccess.credential,
      },
    });
    const metricsBody = await metricsResponse.json() as {
      readonly metrics: {
        readonly transport: Readonly<Record<string, number>>;
      };
    };
    expect(metricsBody.metrics.transport).toMatchObject({
      loadoutRequestsAccepted: 1,
      loadoutRequestsRejected: 1,
      loadoutRequestsReplayed: 1,
      loadoutRequestIdConflicts: 1,
    });
  });

  it('accepts an otherwise exact request during warmup and persists the selection', async () => {
    const room = await createRoom();
    const first = await connectSocket(room.socketPath);
    const second = await connectSocket(room.socketPath);
    await waitForType(first, 'welcome');
    await waitForType(second, 'welcome');

    sendClient(first, joinMessage(room.roomCode, 'req.join.locked.first', 'First'));
    await waitForType(first, 'joinAccepted', ({ requestId }) => requestId === 'req.join.locked.first');
    sendClient(second, joinMessage(room.roomCode, 'req.join.locked.second', 'Second'));
    await waitForType(
      second,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.locked.second',
    );

    const locked = loadoutMessage('req.loadout.locked');
    sendClient(first, locked);
    expect(await waitForType(
      first,
      'serverNotice',
      ({ code, message }) => code === 'LOADOUT_ACCEPTED' && message === locked.requestId,
    )).toMatchObject({ code: 'LOADOUT_ACCEPTED' });

    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    const stored = await runInDurableObject(stub, async (_instance, state) => ({
      selections: [...state.storage.sql.exec('SELECT player_id FROM room_player_loadouts_v1')]
        .length,
      outcome: [...state.storage.sql.exec<{ outcome_code: string }>(
        `SELECT outcome_code FROM room_loadout_requests_v1
         WHERE request_id = ?`,
        locked.requestId,
      )][0]?.outcome_code,
    }));
    expect(stored).toEqual({ selections: 1, outcome: 'accepted' });
  });

  it('accepts and persists the Breacher weapon slot on the Inkfall generalized armory', async () => {
    const room = await createRoom(G5_INKFALL_REV4_COMBAT_PROFILE);
    const probe = await connectSocket(room.socketPath);
    await waitForType(probe, 'welcome');
    sendClient(probe, joinMessage(room.roomCode, 'req.join.breacher', 'Breacher'));
    const joined = await waitForType(
      probe,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.breacher',
    );

    const breacher = authorityLoadoutForCombatPreset(
      requireRuleset('revamped_classic', 3),
      'breacher',
    );
    const request = createAuthorityLoadoutRequestMessage({
      requestId: 'req.loadout.breacher',
      loadout: breacher,
    });
    sendClient(probe, request);
    expect(await waitForType(
      probe,
      'serverNotice',
      ({ code, message }) => code === 'LOADOUT_ACCEPTED' && message === request.requestId,
    )).toMatchObject({ code: 'LOADOUT_ACCEPTED' });

    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    const stored = await runInDurableObject(stub, async (_instance, state) => (
      [...state.storage.sql.exec<{ player_id: string; selection_json: string }>(
        'SELECT player_id, selection_json FROM room_player_loadouts_v1',
      )]
    ));
    expect(stored).toEqual([{
      player_id: joined.playerId,
      selection_json: JSON.stringify(breacher),
    }]);

    const second = await connectSocket(room.socketPath);
    await waitForType(second, 'welcome');
    sendClient(second, joinMessage(room.roomCode, 'req.join.breacher.peer', 'Peer'));
    await waitForType(
      second,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.join.breacher.peer',
    );
    sendClient(probe, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputBatch',
      commands: [{
        type: 'input',
        sequence: 0,
        clientTick: 0,
        moveX: 0,
        moveY: 0,
        lookYawDeltaMilliDegrees: 0,
        lookPitchDeltaMilliDegrees: 0,
        heldButtons: 0,
        pressedButtons: 0,
        releasedButtons: 0,
        selectedSlot: 3,
      }],
    });
    expect(await waitForType(
      probe,
      'error',
      ({ code, detail }) => (
        code === 'INPUT_REJECTED'
        && detail === '0:weapon_slot_not_in_preset'
      ),
    )).toMatchObject({ code: 'INPUT_REJECTED' });
  });

  it('matches the Node decision-trace pin inside the Worker isolate', () => {
    expect(hashAuthorityLoadoutDecisionTrace(parityTrace())).toBe('0d1aec7c4c6c46ca');
  });
});
