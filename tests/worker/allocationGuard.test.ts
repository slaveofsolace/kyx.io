/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env, reset, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ALLOCATION_GUARD_NAME,
  ALLOCATION_LIMITS,
} from '../../worker/allocationGuard';
import type { KyxAuthorityEnv } from '../../worker/env';

const authorityEnv = env as unknown as KyxAuthorityEnv;
const ALLOWED_ORIGIN = 'http://127.0.0.1:5173';
const CALLER_KEY = `caller.${'a'.repeat(32)}`;
const SECOND_CALLER_KEY = `caller.${'b'.repeat(32)}`;
const ROOM_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

afterEach(async () => {
  await reset();
});

function roomCode(index: number): string {
  return `KYX-2345A${ROOM_ALPHABET[index]}`;
}

async function guardPost(
  path: string,
  body: Readonly<Record<string, unknown>>,
): Promise<Response> {
  return authorityEnv.KYX_ALLOCATION_GUARD
    .getByName(ALLOCATION_GUARD_NAME)
    .fetch(new Request(`https://allocation.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
}

describe('deployment allocation guard', () => {
  it('releases a terminal room by its internal identity without a caller echo', async () => {
    const room = roomCode(0);
    const reserved = await guardPost('/v1/rooms/reserve', {
      roomCode: room,
      callerKey: CALLER_KEY,
    });
    expect(reserved.status).toBe(200);

    const released = await guardPost('/v1/rooms/release', { roomCode: room });
    expect(released.status).toBe(200);
    await expect(released.json()).resolves.toEqual({ ok: true });

    const reused = await guardPost('/v1/rooms/reserve', {
      roomCode: room,
      callerKey: SECOND_CALLER_KEY,
    });
    expect(reused.status).toBe(200);
    await expect(reused.json()).resolves.toMatchObject({
      ok: true,
      newlyReserved: true,
    });
  });

  it('bounds new room creation per caller while keeping an existing room idempotent', async () => {
    for (
      let index = 0;
      index < ALLOCATION_LIMITS.maximumRoomsPerCallerWindow;
      index += 1
    ) {
      const response = await guardPost('/v1/rooms/reserve', {
        roomCode: roomCode(index),
        callerKey: CALLER_KEY,
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        newlyReserved: true,
      });
    }

    const limited = await guardPost('/v1/rooms/reserve', {
      roomCode: roomCode(ALLOCATION_LIMITS.maximumRoomsPerCallerWindow),
      callerKey: CALLER_KEY,
    });
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({
      ok: false,
      code: 'CALLER_ROOM_RATE_LIMIT',
    });

    const idempotent = await guardPost('/v1/rooms/reserve', {
      roomCode: roomCode(0),
      callerKey: CALLER_KEY,
    });
    expect(idempotent.status).toBe(200);
    await expect(idempotent.json()).resolves.toMatchObject({
      ok: true,
      newlyReserved: false,
    });
  });

  it('caps pre-join sockets, releases leases, and rejects direct unleased upgrades', async () => {
    const room = roomCode(0);
    const leases: string[] = [];
    for (
      let index = 0;
      index < ALLOCATION_LIMITS.maximumPreJoinSocketsPerCaller;
      index += 1
    ) {
      const response = await guardPost('/v1/sockets/reserve', {
        roomCode: room,
        callerKey: CALLER_KEY,
      });
      const body = await response.json() as { readonly ok: boolean; readonly leaseId: string };
      expect(response.status).toBe(200);
      expect(body.ok).toBe(true);
      leases.push(body.leaseId);
    }
    const limited = await guardPost('/v1/sockets/reserve', {
      roomCode: room,
      callerKey: CALLER_KEY,
    });
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toMatchObject({
      ok: false,
      code: 'CALLER_PREJOIN_LIMIT',
    });

    expect((await guardPost('/v1/sockets/release', {
      leaseId: leases[0],
    })).status).toBe(200);
    expect((await guardPost('/v1/sockets/reserve', {
      roomCode: room,
      callerKey: CALLER_KEY,
    })).status).toBe(200);

    const direct = await authorityEnv.KYX_ROOM.getByName(room).fetch(
      new Request(`https://authority.test/api/rooms/${room}/socket`, {
        headers: { Upgrade: 'websocket' },
      }),
    );
    expect(direct.status).toBe(403);
    await expect(direct.json()).resolves.toEqual({
      ok: false,
      code: 'SOCKET_ALLOCATION_LEASE_REQUIRED',
    });

    const created = await SELF.fetch('https://authority.test/api/rooms/create', {
      method: 'POST',
      headers: {
        Origin: ALLOWED_ORIGIN,
        'CF-Connecting-IP': '203.0.113.20',
      },
    });
    expect(created.status).toBe(201);
  });
});
