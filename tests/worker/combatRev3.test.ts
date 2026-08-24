/// <reference types="@cloudflare/vitest-pool-workers/types" />

import {
  abortAllDurableObjects,
  env,
  evictDurableObject,
  reset,
  runInDurableObject,
  SELF,
} from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import {
  G4_COMBAT_RULESET_HASH,
  G4_COMBAT_RULESET_REVISION,
  KYX_MODE_ID,
} from '../../src/authority';
import {
  PROTOCOL_VERSION,
  RELIABLE_EVENT_STREAM_VERSION,
  SNAPSHOT_BASELINE_VERSION,
  decodeServerMessage,
  encodeClientMessage,
  hashCombatConsequenceV1,
  type ClientMessage,
  type CombatConsequenceDigestV1,
  type FullSnapshotMessage,
  type ReliableEvent,
  type ServerMessage,
} from '../../src/net';
import { INTENT_BUTTON } from '../../src/sim';
import {
  INTERNAL_ROOM_MATCH_MODE_HEADER,
  KYX_MATCH_MODE_HEADER,
  P58D_COMBAT_PROFILE_HEADER,
  P58D_REV3_COMBAT_PROFILE,
  RELAY_REV1_COMBAT_PROFILE,
} from '../../worker/combatRuntime';
import type { KyxAuthorityEnv } from '../../worker/env';

const ALLOWED_ORIGIN = 'http://127.0.0.1:5173';
const AUTHORITY_ORIGIN = 'https://authority.test';
const REV2_RULESET_HASH = '039ae95bed7ee716';
const authorityEnv = env as unknown as KyxAuthorityEnv;

interface RoomCreated {
  readonly roomCode: string;
  readonly roomPath: string;
  readonly socketPath: string;
  readonly metricsPath: string;
  readonly roomProfile?: string;
  readonly matchMode: string;
}

interface SocketProbe {
  readonly socket: WebSocket;
  readonly messages: ServerMessage[];
  readonly decodeErrors: string[];
  readonly waiters: Set<() => void>;
  readonly closes: Array<Readonly<{ code: number; reason: string }>>;
}

type ServerMessageOfType<T extends ServerMessage['type']> =
  Extract<ServerMessage, { readonly type: T }>;
type DeliveryProfile = 'baseline' | 'loss' | 'reorder' | 'duplicate';

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

async function createRoom(
  combat = false,
  matchMode?: string,
  profile = P58D_REV3_COMBAT_PROFILE,
): Promise<RoomCreated> {
  const response = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
    method: 'POST',
    headers: {
      Origin: ALLOWED_ORIGIN,
      ...(combat ? { [P58D_COMBAT_PROFILE_HEADER]: profile } : {}),
      ...(matchMode === undefined ? {} : { [KYX_MATCH_MODE_HEADER]: matchMode }),
    },
  });
  if (response.status !== 201) throw new Error(`Room creation failed: ${response.status}`);
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
    closes: [],
  };
  probe.socket.addEventListener('message', (event) => {
    const decoded = decodeServerMessage(socketPayload(event.data));
    if (decoded.ok) probe.messages.push(decoded.value);
    else probe.decodeErrors.push(`${decoded.error.code}:${decoded.error.path}`);
    for (const waiter of [...probe.waiters]) waiter();
  });
  probe.socket.addEventListener('close', (event) => {
    probe.closes.push(Object.freeze({ code: event.code, reason: event.reason }));
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
  timeoutMilliseconds = 15_000,
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
      const latestSnapshot = [...probe.messages].reverse().find((message) => (
        message.type === 'fullSnapshot' || message.type === 'deltaSnapshot'
      ));
      const reliableCounts = Object.fromEntries(
        Object.entries(Object.groupBy(uniqueReliableEvents(probe), ({ kind }) => kind))
          .map(([kind, events]) => [kind, events?.length ?? 0]),
      );
      const errors = probe.messages.filter(({ type }) => type === 'error').slice(-5);
      reject(new Error(
        `Timed out waiting for ${label}; latest=${JSON.stringify(latestSnapshot)}; reliable=${JSON.stringify(reliableCounts)}; errors=${JSON.stringify(errors)}`,
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

function joinMessage(roomCode: string, requestId: string, displayName: string): ClientMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'joinRoom',
    requestId,
    roomCode,
    displayName,
  };
}

function inputMessage(options: Readonly<{
  sequence: number;
  clientTick: number;
  heldButtons?: number;
  pressedButtons?: number;
  releasedButtons?: number;
}>): ClientMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'inputBatch',
    commands: [{
      type: 'input',
      sequence: options.sequence,
      clientTick: options.clientTick,
      moveX: 0,
      moveY: 0,
      lookYawDeltaMilliDegrees: 0,
      lookPitchDeltaMilliDegrees: 0,
      heldButtons: options.heldButtons ?? 0,
      pressedButtons: options.pressedButtons ?? 0,
      releasedButtons: options.releasedButtons ?? 0,
      selectedSlot: 0,
    }],
  };
}

function latestEventId(probe: SocketProbe): string | null {
  return probe.messages
    .filter((message): message is ServerMessageOfType<'reliableEventBatch'> => (
      message.type === 'reliableEventBatch'
    ))
    .flatMap(({ events }) => events)
    .at(-1)?.id ?? null;
}

function acknowledgeSnapshot(
  probe: SocketProbe,
  snapshot: FullSnapshotMessage | ServerMessageOfType<'deltaSnapshot'>,
): void {
  sendClient(probe, {
    protocolVersion: PROTOCOL_VERSION,
    type: 'ack',
    snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
    reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
    snapshotBaselineId: snapshot.snapshotBaselineId,
    serverTick: snapshot.serverTick,
    lastEventId: latestEventId(probe),
  });
}

function startAutomaticAcknowledgements(probe: SocketProbe): () => void {
  const listener = (event: MessageEvent) => {
    const decoded = decodeServerMessage(socketPayload(event.data));
    if (!decoded.ok) return;
    if (decoded.value.type !== 'fullSnapshot' && decoded.value.type !== 'deltaSnapshot') return;
    if (probe.socket.readyState === WebSocket.OPEN) acknowledgeSnapshot(probe, decoded.value);
  };
  probe.socket.addEventListener('message', listener);
  return () => probe.socket.removeEventListener('message', listener);
}

function latestSnapshot(
  probe: SocketProbe,
): FullSnapshotMessage | ServerMessageOfType<'deltaSnapshot'> | null {
  return [...probe.messages].reverse().find(
    (message): message is FullSnapshotMessage | ServerMessageOfType<'deltaSnapshot'> => (
      message.type === 'fullSnapshot' || message.type === 'deltaSnapshot'
    ),
  ) ?? null;
}

function uniqueReliableEvents(...probes: readonly SocketProbe[]): readonly ReliableEvent[] {
  const events = new Map<string, ReliableEvent>();
  for (const probe of probes) {
    for (const message of probe.messages) {
      if (message.type !== 'reliableEventBatch') continue;
      for (const event of message.events) events.set(event.id, event);
    }
  }
  return [...events.values()];
}

async function runWorkerImpairmentProfile(profile: DeliveryProfile) {
  const room = await createRoom(true);
  const first = await connectSocket(room.socketPath);
  await waitForType(first, 'welcome');
  sendClient(first, joinMessage(room.roomCode, `req.join.${profile}.first`, `${profile} first`));
  const firstJoin = await waitForType(first, 'joinAccepted');
  const firstFull = await waitForType(
    first,
    'fullSnapshot',
    ({ localReconciliation }) => localReconciliation.player.id === firstJoin.playerId,
  );
  acknowledgeSnapshot(first, firstFull);
  const stopFirstAcks = startAutomaticAcknowledgements(first);

  const second = await connectSocket(room.socketPath);
  await waitForType(second, 'welcome');
  sendClient(second, joinMessage(room.roomCode, `req.join.${profile}.second`, `${profile} second`));
  const secondJoin = await waitForType(second, 'joinAccepted');
  const secondFull = await waitForType(
    second,
    'fullSnapshot',
    ({ localReconciliation }) => localReconciliation.player.id === secondJoin.playerId,
  );
  acknowledgeSnapshot(second, secondFull);
  const stopSecondAcks = startAutomaticAcknowledgements(second);

  const active = await waitForMessage(
    first,
    (message) => (
      (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
      && message.combat?.match.phase === 'active'
    ),
    `${profile} active snapshot`,
  ) as FullSnapshotMessage | ServerMessageOfType<'deltaSnapshot'>;
  const fire = INTENT_BUTTON.primaryFire;
  let sequence = 0;
  if (profile === 'loss') {
    sequence = 1;
  } else if (profile === 'reorder') {
    sendClient(first, inputMessage({
      sequence: 1,
      clientTick: active.serverTick + 1,
      heldButtons: fire,
    }));
    sendClient(first, inputMessage({
      sequence: 0,
      clientTick: active.serverTick,
      heldButtons: fire,
    }));
    sequence = 2;
  } else {
    const initial = inputMessage({
      sequence: 0,
      clientTick: active.serverTick,
      heldButtons: fire,
    });
    sendClient(first, initial);
    if (profile === 'duplicate') sendClient(first, initial);
    sequence = 1;
  }

  let tenthShotObserved = false;
  for (let sample = 0; sample < 120 && !tenthShotObserved; sample += 1) {
    tenthShotObserved = uniqueReliableEvents(first)
      .filter(({ kind }) => kind === 'weaponAttackAccepted').length >= 10;
    if (tenthShotObserved) break;
    const current = latestSnapshot(first);
    if (current !== null) {
      const held = inputMessage({
        sequence,
        clientTick: current.serverTick,
        heldButtons: fire,
      });
      sendClient(first, held);
      if (profile === 'duplicate' && sequence % 3 === 0) sendClient(first, held);
      sequence += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, 45));
  }
  if (!tenthShotObserved) throw new Error(`${profile} did not deliver ten accepted shots`);
  const releaseBase = latestSnapshot(first);
  if (releaseBase === null) throw new Error(`${profile} has no release baseline`);
  sendClient(first, inputMessage({
    sequence,
    clientTick: releaseBase.serverTick,
    releasedButtons: fire,
  }));
  await waitForType(first, 'inputAck', ({ lastProcessedInputSequence }) => (
    lastProcessedInputSequence >= sequence
  ));
  await waitForType(first, 'reliableEventBatch', ({ events }) => (
    events.some(({ kind }) => kind === 'playerKilled')
  ));
  const lethal = await waitForMessage(
    first,
    (message) => {
      if (message.type !== 'fullSnapshot' && message.type !== 'deltaSnapshot') return false;
      const target = message.combat?.players
        .find(({ playerId }) => playerId === secondJoin.playerId);
      return target?.lifePhase === 'dead'
        && message.combat?.match.feedSequence === 1
        && message.serverTick >= releaseBase.serverTick;
    },
    `${profile} post-release lethal snapshot`,
  ) as FullSnapshotMessage | ServerMessageOfType<'deltaSnapshot'>;
  await new Promise((resolve) => setTimeout(resolve, 100));

  const final = latestSnapshot(first) ?? lethal;
  const shooter = final.combat?.players.find(({ playerId }) => playerId === firstJoin.playerId);
  const target = final.combat?.players.find(({ playerId }) => playerId === secondJoin.playerId);
  const events = uniqueReliableEvents(first);
  const acceptedWeaponEvents = events.filter(
    ({ kind }) => kind === 'weaponAttackAccepted',
  );
  expect(acceptedWeaponEvents).toHaveLength(shooter?.acceptedShotCount ?? 0);
  expect(acceptedWeaponEvents.every(({ presentation }) => (
    presentation?.kind === 'weapon_attack_accepted'
      && presentation.weaponId === 'vertical_rifle_v1'
      && presentation.family === 'rifle'
      && presentation.attackModel === 'hitscan'
      && presentation.ballistics.length === 1
  ))).toBe(true);
  const consequence = Object.freeze({
    acceptedShotCount: shooter?.acceptedShotCount ?? -1,
    magazineRounds: shooter?.magazineRounds ?? -1,
    targetHealthPoints: target?.healthPoints ?? -1,
    targetDeathOrdinal: target?.deathOrdinal ?? -1,
    blueScore: final.combat?.match.teamScores
      .find(({ teamId }) => teamId === 'team_blue')?.score ?? -1,
    feedSequence: final.combat?.match.feedSequence ?? -1,
    eventCounts: Object.freeze({
      shotAccepted:
        acceptedWeaponEvents.length,
      damageApplied: events.filter(({ kind }) => kind === 'damageApplied').length,
      playerKilled: events.filter(({ kind }) => kind === 'playerKilled').length,
    }),
  }) satisfies CombatConsequenceDigestV1;
  stopFirstAcks();
  stopSecondAcks();
  first.socket.close(1000, `${profile} complete`);
  second.socket.close(1000, `${profile} complete`);
  return Object.freeze({ profile, hash: hashCombatConsequenceV1(consequence), consequence });
}

describe('P5.8D explicit revision-3 Worker combat path', () => {
  it('persists an opt-in FFA Worker runtime without making it player-routable', async () => {
    for (const matchMode of ['client_claimed_mode']) {
      const unsupported = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
        method: 'POST',
        headers: {
          Origin: ALLOWED_ORIGIN,
          [P58D_COMBAT_PROFILE_HEADER]: P58D_REV3_COMBAT_PROFILE,
          [KYX_MATCH_MODE_HEADER]: matchMode,
        },
      });
      expect(unsupported.status).toBe(400);
      await expect(unsupported.json()).resolves.toEqual({
        ok: false,
        code: 'MATCH_MODE_UNSUPPORTED',
      });
    }

    for (const matchMode of [KYX_MODE_ID.freeForAll, KYX_MODE_ID.instagib]) {
      for (const profile of [null, P58D_REV3_COMBAT_PROFILE] as const) {
        const missingPersistentProfile = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
          method: 'POST',
          headers: {
            Origin: ALLOWED_ORIGIN,
            ...(profile === null ? {} : { [P58D_COMBAT_PROFILE_HEADER]: profile }),
            [KYX_MATCH_MODE_HEADER]: matchMode,
          },
        });
        expect(missingPersistentProfile.status).toBe(400);
        await expect(missingPersistentProfile.json()).resolves.toEqual({
          ok: false,
          code: 'MATCH_MODE_REQUIRES_PERSISTENT_MAP_PROFILE',
        });
      }
    }

    const internalHeaderProbe = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
      method: 'POST',
      headers: {
        Origin: ALLOWED_ORIGIN,
        [P58D_COMBAT_PROFILE_HEADER]: P58D_REV3_COMBAT_PROFILE,
        [INTERNAL_ROOM_MATCH_MODE_HEADER]: KYX_MODE_ID.freeForAll,
      },
    });
    expect(internalHeaderProbe.status).toBe(201);
    await expect(internalHeaderProbe.json()).resolves.toMatchObject({
      matchMode: KYX_MODE_ID.teamDeathmatch,
    });

    const room = await createRoom(
      true,
      KYX_MODE_ID.freeForAll,
      RELAY_REV1_COMBAT_PROFILE,
    );
    expect(room).toMatchObject({
      roomProfile: RELAY_REV1_COMBAT_PROFILE,
      matchMode: KYX_MODE_ID.freeForAll,
    });
    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    const persisted = await runInDurableObject(stub, async (_instance, state) => (
      [...state.storage.sql.exec<Record<string, string | number>>(
        'SELECT schema_version, mode_id FROM room_match_mode_v1 WHERE singleton = 1',
      )][0]
    ));
    expect(persisted).toEqual({ schema_version: 1, mode_id: KYX_MODE_ID.freeForAll });

    await evictDurableObject(stub);
    const first = await connectSocket(room.socketPath);
    const second = await connectSocket(room.socketPath);
    await Promise.all([waitForType(first, 'welcome'), waitForType(second, 'welcome')]);
    sendClient(first, joinMessage(room.roomCode, 'req.join.ffa.first', 'FFA First'));
    const firstJoin = await waitForType(first, 'joinAccepted');
    sendClient(second, joinMessage(room.roomCode, 'req.join.ffa.second', 'FFA Second'));
    const secondJoin = await waitForType(second, 'joinAccepted');
    const active = await waitForMessage(
      first,
      (message) => (
        (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
        && message.combat?.match.phase === 'active'
        && message.combat.match.teamScores.some(({ teamId }) => teamId === firstJoin.playerId)
        && message.combat.match.teamScores.some(({ teamId }) => teamId === secondJoin.playerId)
      ),
      'FFA active snapshot',
    ) as FullSnapshotMessage | ServerMessageOfType<'deltaSnapshot'>;
    expect(active.combat?.players).toEqual(expect.arrayContaining([
      expect.objectContaining({ playerId: firstJoin.playerId, teamId: firstJoin.playerId }),
      expect.objectContaining({ playerId: secondJoin.playerId, teamId: secondJoin.playerId }),
    ]));
    expect(active.combat?.match).toMatchObject({
      teamScores: expect.arrayContaining([
        { teamId: firstJoin.playerId, score: 0 },
        { teamId: secondJoin.playerId, score: 0 },
      ]),
    });

    const messageCount = first.messages.length;
    await runInDurableObject(stub, async (instance) => {
      const runtime = instance as unknown as {
        persistActiveMatchCheckpoint(): void;
        runTimer(): Promise<void>;
      };
      runtime.runTimer = async () => {};
      runtime.persistActiveMatchCheckpoint();
    });
    await evictDurableObject(stub);
    sendClient(first, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ping',
      nonce: 5_001,
      clientTick: active.serverTick,
    });
    await waitForType(first, 'pong', ({ nonce }) => nonce === 5_001);
    const restored = await waitForMessage(
      first,
      (message) => (
        message.type === 'fullSnapshot'
        && first.messages.indexOf(message) >= messageCount
        && message.combat?.match.teamScores.some(({ teamId }) => teamId === firstJoin.playerId)
        && message.combat.match.teamScores.some(({ teamId }) => teamId === secondJoin.playerId)
      ),
      'FFA restart snapshot',
    ) as FullSnapshotMessage;
    expect(restored.combat?.match).toMatchObject({
      teamScores: expect.arrayContaining([
        { teamId: firstJoin.playerId, score: 0 },
        { teamId: secondJoin.playerId, score: 0 },
      ]),
    });

    const mismatch = await SELF.fetch(`${AUTHORITY_ORIGIN}${room.roomPath}`, {
      method: 'POST',
      headers: {
        Origin: ALLOWED_ORIGIN,
        [P58D_COMBAT_PROFILE_HEADER]: RELAY_REV1_COMBAT_PROFILE,
        [KYX_MATCH_MODE_HEADER]: KYX_MODE_ID.teamDeathmatch,
      },
    });
    expect(mismatch.status).toBe(409);
    await expect(mismatch.json()).resolves.toEqual({
      ok: false,
      code: 'ROOM_MATCH_MODE_MISMATCH',
    });
  }, 60_000);

  it('locks Instagib to Longshot and binds restart checkpoints to the exact mode', async () => {
    const room = await createRoom(
      true,
      KYX_MODE_ID.instagib,
      RELAY_REV1_COMBAT_PROFILE,
    );
    expect(room).toMatchObject({
      roomProfile: RELAY_REV1_COMBAT_PROFILE,
      matchMode: KYX_MODE_ID.instagib,
    });
    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    const first = await connectSocket(room.socketPath);
    const second = await connectSocket(room.socketPath);
    await Promise.all([waitForType(first, 'welcome'), waitForType(second, 'welcome')]);
    sendClient(first, joinMessage(room.roomCode, 'req.join.instagib.first', 'Instagib First'));
    const firstJoin = await waitForType(first, 'joinAccepted');
    sendClient(second, joinMessage(room.roomCode, 'req.join.instagib.second', 'Instagib Second'));
    const secondJoin = await waitForType(second, 'joinAccepted');
    const active = await waitForMessage(
      first,
      (message) => (
        (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
        && message.combat?.match.phase === 'active'
        && message.combat.players.every(({ selectedWeaponSlot }) => selectedWeaponSlot === 3)
      ),
      'Instagib active snapshot',
    ) as FullSnapshotMessage | ServerMessageOfType<'deltaSnapshot'>;
    expect(active.combat?.players).toEqual(expect.arrayContaining([
      expect.objectContaining({
        playerId: firstJoin.playerId,
        teamId: firstJoin.playerId,
        selectedWeaponSlot: 3,
        selectedWeaponId: 'kyx_longshot_v1',
      }),
      expect.objectContaining({
        playerId: secondJoin.playerId,
        teamId: secondJoin.playerId,
        selectedWeaponSlot: 3,
        selectedWeaponId: 'kyx_longshot_v1',
      }),
    ]));

    const messageCount = first.messages.length;
    const checkpoint = await runInDurableObject(stub, async (instance, state) => {
      const runtime = instance as unknown as {
        persistActiveMatchCheckpoint(): void;
        runTimer(): Promise<void>;
      };
      runtime.runTimer = async () => {};
      runtime.persistActiveMatchCheckpoint();
      const row = [...state.storage.sql.exec<Record<string, string | number>>(
        `SELECT schema_version, checkpoint_json
         FROM room_active_checkpoint_v1 WHERE singleton = 1`,
      )][0];
      return {
        schemaVersion: row?.schema_version,
        envelope: JSON.parse(String(row?.checkpoint_json)) as {
          readonly schemaVersion: number;
          readonly matchMode: string;
        },
      };
    });
    expect(checkpoint).toEqual({
      schemaVersion: 2,
      envelope: expect.objectContaining({
        schemaVersion: 2,
        matchMode: KYX_MODE_ID.instagib,
      }),
    });

    await evictDurableObject(stub);
    sendClient(first, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ping',
      nonce: 5_002,
      clientTick: active.serverTick,
    });
    await waitForType(first, 'pong', ({ nonce }) => nonce === 5_002);
    const restored = await waitForMessage(
      first,
      (message) => (
        message.type === 'fullSnapshot'
        && first.messages.indexOf(message) >= messageCount
        && message.combat?.players.every(({ selectedWeaponSlot }) => selectedWeaponSlot === 3)
      ),
      'Instagib restart snapshot',
    ) as FullSnapshotMessage;
    expect(restored.combat?.match.teamScores).toEqual(expect.arrayContaining([
      { teamId: firstJoin.playerId, score: 0 },
      { teamId: secondJoin.playerId, score: 0 },
    ]));

    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec(
        'UPDATE room_match_mode_v1 SET mode_id = ? WHERE singleton = 1',
        KYX_MODE_ID.freeForAll,
      );
    });
    await abortAllDurableObjects();
    const rejected = await SELF.fetch(`${AUTHORITY_ORIGIN}${room.roomPath}`, {
      method: 'POST',
      headers: {
        Origin: ALLOWED_ORIGIN,
        [P58D_COMBAT_PROFILE_HEADER]: RELAY_REV1_COMBAT_PROFILE,
        [KYX_MATCH_MODE_HEADER]: KYX_MODE_ID.instagib,
      },
    });
    expect(rejected.status).toBe(503);
    await expect(rejected.json()).resolves.toEqual({ ok: false, code: 'ROOM_UNAVAILABLE' });
  }, 60_000);

  it('backfills legacy rooms to TDM and fails closed on a corrupt persisted mode', async () => {
    const room = await createRoom(true);
    const stub = authorityEnv.KYX_ROOM.getByName(room.roomCode);
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec('DELETE FROM room_match_mode_v1 WHERE singleton = 1');
    });
    await evictDurableObject(stub);
    const socket = await connectSocket(room.socketPath);
    await waitForType(socket, 'welcome');
    const backfilled = await runInDurableObject(stub, async (_instance, state) => (
      [...state.storage.sql.exec<Record<string, string | number>>(
        'SELECT schema_version, mode_id FROM room_match_mode_v1 WHERE singleton = 1',
      )][0]
    ));
    expect(backfilled).toEqual({
      schema_version: 1,
      mode_id: KYX_MODE_ID.teamDeathmatch,
    });

    socket.socket.close(1000, 'persisted mode tamper probe');
    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec(
        'UPDATE room_match_mode_v1 SET mode_id = ? WHERE singleton = 1',
        'client_claimed_mode',
      );
    });
    await evictDurableObject(stub);
    const rejected = await SELF.fetch(`${AUTHORITY_ORIGIN}${room.socketPath}`, {
      headers: { Origin: ALLOWED_ORIGIN, Upgrade: 'websocket' },
    });
    expect(rejected.status).toBe(503);
    await expect(rejected.json()).resolves.toEqual({ ok: false, code: 'ROOM_UNAVAILABLE' });
  });

  it('preserves revision 2 by default and rehydrates an explicit revision-3 identity', async () => {
    const defaultRoom = await createRoom();
    expect(defaultRoom.roomProfile).toBeUndefined();
    const defaultSocket = await connectSocket(defaultRoom.socketPath);
    const defaultWelcome = await waitForType(defaultSocket, 'welcome');
    expect(defaultWelcome.simulationIdentity).toMatchObject({
      rulesetRevision: 2,
      rulesetHash: REV2_RULESET_HASH,
    });

    const combatRoom = await createRoom(true);
    expect(combatRoom.roomProfile).toBe(P58D_REV3_COMBAT_PROFILE);
    await evictDurableObject(authorityEnv.KYX_ROOM.getByName(combatRoom.roomCode));
    const combatSocket = await connectSocket(combatRoom.socketPath);
    const combatWelcome = await waitForType(combatSocket, 'welcome');
    expect(combatWelcome.simulationIdentity).toMatchObject({
      rulesetRevision: G4_COMBAT_RULESET_REVISION,
      rulesetHash: G4_COMBAT_RULESET_HASH,
    });
    sendClient(combatSocket, joinMessage(combatRoom.roomCode, 'req.join.rev3', 'Rev3'));
    const joined = await waitForType(combatSocket, 'joinAccepted');
    const snapshot = await waitForType(
      combatSocket,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === joined.playerId,
    );
    expect(snapshot.combat).toMatchObject({
      schemaVersion: 1,
      players: [{ playerId: joined.playerId, riflePhase: 'holstered', magazineRounds: 50 }],
      projectiles: [],
      match: { phase: 'lobby', feedSequence: 0 },
    });
    expect(combatSocket.decodeErrors).toEqual([]);
  });

  it('applies duplicate/loss/reorder intent once and resumes composite combat state', async () => {
    const room = await createRoom(true);
    const first = await connectSocket(room.socketPath);
    await waitForType(first, 'welcome');
    sendClient(first, joinMessage(room.roomCode, 'req.join.first', 'First'));
    const firstJoin = await waitForType(first, 'joinAccepted');
    const firstSnapshot = await waitForType(
      first,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === firstJoin.playerId,
    );
    acknowledgeSnapshot(first, firstSnapshot);
    const stopFirstAcks = startAutomaticAcknowledgements(first);

    const second = await connectSocket(room.socketPath);
    await waitForType(second, 'welcome');
    sendClient(second, joinMessage(room.roomCode, 'req.join.second', 'Second'));
    const secondJoin = await waitForType(second, 'joinAccepted');
    const secondSnapshot = await waitForType(
      second,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === secondJoin.playerId,
    );
    acknowledgeSnapshot(second, secondSnapshot);
    const stopSecondAcks = startAutomaticAcknowledgements(second);

    const active = await waitForMessage(
      first,
      (message) => (
        (message.type === 'fullSnapshot' || message.type === 'deltaSnapshot')
        && message.combat?.match.phase === 'active'
      ),
      'active combat snapshot',
    ) as FullSnapshotMessage | ServerMessageOfType<'deltaSnapshot'>;
    const fire = INTENT_BUTTON.primaryFire;
    sendClient(first, inputMessage({
      sequence: 0,
      clientTick: active.serverTick,
      heldButtons: fire,
    }));
    sendClient(first, inputMessage({
      sequence: 0,
      clientTick: active.serverTick,
      heldButtons: fire,
    }));
    sendClient(first, inputMessage({
      sequence: 2,
      clientTick: active.serverTick + 2,
      heldButtons: fire,
    }));
    sendClient(first, inputMessage({
      sequence: 1,
      clientTick: active.serverTick + 1,
      heldButtons: fire,
    }));
    await waitForType(
      first,
      'error',
      ({ code, detail }) => code === 'INPUT_REJECTED' && (detail?.includes('0:duplicate_sequence') ?? false),
    );

    let lethal: FullSnapshotMessage | ServerMessageOfType<'deltaSnapshot'> | null = null;
    let heldSequence = 4; // Sequence 3 is intentionally lost.
    for (let sample = 0; sample < 160 && lethal === null; sample += 1) {
      const current = latestSnapshot(first);
      if (current !== null) {
        const target = current.combat?.players.find(({ playerId }) => (
          playerId === secondJoin.playerId
        ));
        if (
          target?.lifePhase === 'dead'
          && target.deathOrdinal === 1
          && current.combat?.match.feedSequence === 1
          && current.combat.match.teamScores
            .find(({ teamId }) => teamId === 'team_blue')?.score === 1
        ) {
          lethal = current;
          break;
        }
        sendClient(first, inputMessage({
          sequence: heldSequence,
          clientTick: current.serverTick,
          heldButtons: fire,
        }));
        heldSequence += 1;
      }
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    if (lethal === null) {
      throw new Error(`Did not reach lethal combat consequence: ${JSON.stringify(latestSnapshot(first))}`);
    }
    const shooterAtLethal = lethal.combat?.players.find(({ playerId }) => playerId === firstJoin.playerId);
    expect(shooterAtLethal?.acceptedShotCount).toBeGreaterThanOrEqual(6);
    expect(shooterAtLethal?.magazineRounds).toBe(50 - (shooterAtLethal?.acceptedShotCount ?? 0));

    const releaseSequence = heldSequence;
    sendClient(first, inputMessage({
      sequence: releaseSequence,
      clientTick: lethal.serverTick,
      releasedButtons: fire,
    }));
    await waitForType(
      first,
      'inputAck',
      ({ lastProcessedInputSequence }) => lastProcessedInputSequence >= releaseSequence,
    );
    const afterRelease = latestSnapshot(first);
    if (afterRelease === null) throw new Error('Release acknowledgement had no snapshot');
    const reloadAndGrenade = INTENT_BUTTON.reload | INTENT_BUTTON.abilityOne;
    const compositeSequence = releaseSequence + 1;
    sendClient(first, inputMessage({
      sequence: compositeSequence,
      clientTick: afterRelease.serverTick,
      heldButtons: reloadAndGrenade,
      pressedButtons: reloadAndGrenade,
    }));
    await waitForType(
      first,
      'inputAck',
      ({ lastProcessedInputSequence }) => lastProcessedInputSequence >= compositeSequence,
    );
    let composite: FullSnapshotMessage | ServerMessageOfType<'deltaSnapshot'> | null = null;
    for (let attempt = 0; attempt < 100 && composite === null; attempt += 1) {
      const current = latestSnapshot(first);
      if (current !== null) {
        const shooter = current.combat?.players
          .find(({ playerId }) => playerId === firstJoin.playerId);
        const target = current.combat?.players
          .find(({ playerId }) => playerId === secondJoin.playerId);
        if (
          shooter?.riflePhase === 'reloading'
          && shooter.grenadePhase === 'ready'
          && current.combat?.projectiles
            .some(({ ownerPlayerId }) => ownerPlayerId === firstJoin.playerId) === true
          && target?.lifePhase === 'dead'
          && current.combat.match.phase === 'active'
        ) composite = current;
      }
      if (composite === null) await new Promise((resolve) => setTimeout(resolve, 20));
    }
    if (composite === null) {
      const diagnostic = await runInDurableObject(
        authorityEnv.KYX_ROOM.getByName(room.roomCode),
        async (instance) => {
          const state = instance as unknown as Readonly<{
            lastTickFailure: string | null;
            timerActive: boolean;
            authority: Readonly<{ serverTick: number }> | null;
            transportMetrics: Readonly<{
              inboundMessagesRateRejected: number;
              snapshotAckDebtEvictions: number;
              slowConsumerEvictions: number;
            }>;
          }>;
          return {
            lastTickFailure: state.lastTickFailure,
            timerActive: state.timerActive,
            serverTick: state.authority?.serverTick ?? null,
            transport: state.transportMetrics,
          };
        },
      );
      const combatHistory = first.messages.flatMap((message) => {
        if (message.type !== 'fullSnapshot' && message.type !== 'deltaSnapshot') return [];
        const shooter = message.combat?.players
          .find(({ playerId }) => playerId === firstJoin.playerId);
        return [{
          tick: message.serverTick,
          sequence: message.localReconciliation.player.lastProcessedSequence,
          rifle: shooter?.riflePhase,
          grenade: shooter?.grenadePhase,
          throws: shooter?.acceptedThrowCount,
          projectiles: message.combat?.projectiles.length,
        }];
      }).slice(-32);
      throw new Error(
        `Composite combat state failed: ${JSON.stringify({
          diagnostic,
          firstReadyState: first.socket.readyState,
          closes: first.closes,
          errors: first.messages.filter(({ type }) => type === 'error'),
          combatHistory,
        })}`,
      );
    }
    expect(composite.combat?.players.find(({ playerId }) => playerId === secondJoin.playerId))
      .toMatchObject({ respawnEligibleAtTick: expect.any(Number) });

    stopFirstAcks();
    first.socket.close(1000, 'reconnect proof');
    const resumed = await connectSocket(room.socketPath);
    await waitForType(resumed, 'welcome');
    sendClient(resumed, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'resumeRoom',
      requestId: 'req.resume.combat',
      roomCode: room.roomCode,
      resumeToken: firstJoin.resumeToken,
    });
    const resumedJoin = await waitForType(
      resumed,
      'joinAccepted',
      ({ requestId }) => requestId === 'req.resume.combat',
    );
    expect(resumedJoin.connectionMode).toBe('resumed');
    const resumedSnapshot = await waitForType(
      resumed,
      'fullSnapshot',
      ({ localReconciliation }) => localReconciliation.player.id === firstJoin.playerId,
    );
    const resumedShooter = resumedSnapshot.combat?.players
      .find(({ playerId }) => playerId === firstJoin.playerId);
    expect(resumedShooter).toMatchObject({
      connected: true,
      riflePhase: 'reloading',
      grenadePhase: 'ready',
      abilityLoadout: {
        currentCharges: [1, 2, 2],
        maximumCharges: [2, 2, 2],
      },
    });
    expect(resumedSnapshot.combat).toMatchObject({
      projectiles: [expect.objectContaining({ ownerPlayerId: firstJoin.playerId, phase: 'active' })],
      match: { phase: 'active', feedSequence: 1 },
    });
    expect(resumedSnapshot.combat?.players.find(({ playerId }) => playerId === secondJoin.playerId))
      .toMatchObject({ lifePhase: 'dead', deathOrdinal: 1 });

    const uniqueEvents = uniqueReliableEvents(first, resumed);
    const eventCounts = Object.groupBy(uniqueEvents, ({ kind }) => kind);
    expect(eventCounts.damageApplied).toHaveLength(6);
    expect(eventCounts.playerKilled).toHaveLength(1);
    expect(eventCounts.projectileSpawned).toHaveLength(1);
    expect(eventCounts.cooldownStarted).toHaveLength(1);
    expect(eventCounts.weaponAttackAccepted)
      .toHaveLength(resumedShooter?.acceptedShotCount ?? 0);
    const respawned = await waitForMessage(
      second,
      (message) => {
        if (message.type !== 'fullSnapshot' && message.type !== 'deltaSnapshot') return false;
        const target = message.combat?.players.find(({ playerId }) => playerId === secondJoin.playerId);
        return target?.lifePhase === 'alive' && target.deathOrdinal === 1 && target.healthPoints === 100;
      },
      'automatic authoritative respawn',
      12_000,
    ) as FullSnapshotMessage | ServerMessageOfType<'deltaSnapshot'>;
    expect(respawned.combat?.players.find(({ playerId }) => playerId === secondJoin.playerId))
      .toMatchObject({ lifePhase: 'alive', healthPoints: 100, respawnEligibleAtTick: null });
    expect(first.decodeErrors).toEqual([]);
    expect(second.decodeErrors).toEqual([]);
    expect(resumed.decodeErrors).toEqual([]);
    stopSecondAcks();
  }, 30_000);

  it('keeps normalized consequences identical across four real WSS delivery profiles', async () => {
    const profiles = ['baseline', 'loss', 'reorder', 'duplicate'] as const;
    const results = [];
    for (const profile of profiles) results.push(await runWorkerImpairmentProfile(profile));
    expect(results.map(({ consequence }) => consequence)).toEqual([
      results[0]!.consequence,
      results[0]!.consequence,
      results[0]!.consequence,
      results[0]!.consequence,
    ]);
    expect(Object.fromEntries(results.map(({ profile, hash }) => [profile, hash])))
      .toEqual({
        baseline: '0f9d08419d426e04',
        loss: '0f9d08419d426e04',
        reorder: '0f9d08419d426e04',
        duplicate: '0f9d08419d426e04',
      });
    expect(results[0]!.consequence).toEqual({
      acceptedShotCount: 10,
      magazineRounds: 40,
      targetHealthPoints: 0,
      targetDeathOrdinal: 1,
      blueScore: 1,
      feedSequence: 1,
      eventCounts: { shotAccepted: 10, damageApplied: 6, playerKilled: 1 },
    });
  }, 30_000);
});
