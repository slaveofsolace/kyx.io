/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { env, reset, runInDurableObject, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import type { KyxAuthorityEnv } from '../../worker/env';
import {
  INTERNAL_METRICS_ACCESS_DIGEST_HEADER,
  INTERNAL_METRICS_ACCESS_EXPIRY_HEADER,
  METRICS_ACCESS_CREDENTIAL_HEADER,
  METRICS_ACCESS_SCHEME,
  METRICS_ACCESS_TTL_MILLISECONDS,
  digestMetricsAccessCredential,
} from '../../worker/metricsAccess';

const AUTHORITY_ORIGIN = 'https://authority.test';
const ALLOWED_ORIGIN = 'http://127.0.0.1:5173';
const authorityEnv = env as unknown as KyxAuthorityEnv;

interface CreatedRoom {
  readonly roomCode: string;
  readonly roomPath: string;
  readonly metricsPath: string;
  readonly metricsAccess: {
    readonly scheme: string;
    readonly headerName: string;
    readonly credential: string;
    readonly expiresAt: number;
    readonly ttlMilliseconds: number;
  };
}

async function createRoom(): Promise<{
  readonly response: Response;
  readonly room: CreatedRoom;
}> {
  const response = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
    method: 'POST',
    headers: { Origin: ALLOWED_ORIGIN },
  });
  if (response.status !== 201) {
    throw new Error(`Room creation failed: ${response.status} ${await response.text()}`);
  }
  return {
    response,
    room: await response.clone().json() as CreatedRoom,
  };
}

function metricsHeaders(room: CreatedRoom): HeadersInit {
  return {
    Origin: ALLOWED_ORIGIN,
    [room.metricsAccess.headerName]: room.metricsAccess.credential,
  };
}

async function expectMetricsDenied(response: Response): Promise<void> {
  expect(response.status).toBe(403);
  expect(response.headers.get('cache-control')).toBe('no-store');
  const body = await response.text();
  expect(body).toBe('{"ok":false,"code":"METRICS_ACCESS_DENIED"}');
  expect(body).not.toMatch(/[A-Za-z0-9_-]{43}/u);
}

afterEach(async () => {
  await reset();
});

describe('room operational metrics authorization', () => {
  it('denies room-code-only access while preserving the issued room-bound credential', async () => {
    const issuedAt = Date.now();
    const { response: creationResponse, room } = await createRoom();
    expect(creationResponse.headers.get('cache-control')).toBe('no-store');
    expect(room.metricsAccess).toMatchObject({
      scheme: METRICS_ACCESS_SCHEME,
      headerName: METRICS_ACCESS_CREDENTIAL_HEADER,
      ttlMilliseconds: METRICS_ACCESS_TTL_MILLISECONDS,
    });
    expect(room.metricsAccess.credential).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(room.metricsAccess.expiresAt).toBeGreaterThanOrEqual(
      issuedAt + METRICS_ACCESS_TTL_MILLISECONDS,
    );
    expect(room.metricsAccess.expiresAt).toBeLessThanOrEqual(
      Date.now() + METRICS_ACCESS_TTL_MILLISECONDS,
    );

    await expectMetricsDenied(await SELF.fetch(
      `${AUTHORITY_ORIGIN}${room.metricsPath}`,
      { headers: { Origin: ALLOWED_ORIGIN } },
    ));
    await expectMetricsDenied(await SELF.fetch(
      `${AUTHORITY_ORIGIN}${room.metricsPath}?credential=${room.metricsAccess.credential}`,
      { headers: { Origin: ALLOWED_ORIGIN } },
    ));
    await expectMetricsDenied(await SELF.fetch(
      `${AUTHORITY_ORIGIN}${room.metricsPath}`,
      {
        headers: {
          Origin: ALLOWED_ORIGIN,
          [METRICS_ACCESS_CREDENTIAL_HEADER]: 'A'.repeat(43),
        },
      },
    ));

    const other = (await createRoom()).room;
    await expectMetricsDenied(await SELF.fetch(
      `${AUTHORITY_ORIGIN}${room.metricsPath}`,
      { headers: metricsHeaders(other) },
    ));

    const authorized = await SELF.fetch(`${AUTHORITY_ORIGIN}${room.metricsPath}`, {
      headers: metricsHeaders(room),
    });
    expect(authorized.status).toBe(200);
    expect(authorized.headers.get('cache-control')).toBe('no-store');
    await expect(authorized.json()).resolves.toMatchObject({
      ok: true,
      metrics: {
        lifecycle: 'created',
        players: 0,
        connectedPlayers: 0,
      },
    });

    const persisted = await runInDurableObject(
      authorityEnv.KYX_ROOM.getByName(room.roomCode),
      async (_instance, state) => (
        [...state.storage.sql.exec<{
          credential_digest: string;
          expires_at: number;
        }>(
          `SELECT credential_digest, expires_at
           FROM room_metrics_access_v1
           WHERE singleton = 1`,
        )][0]
      ),
    );
    expect(persisted?.credential_digest).toMatch(/^[a-f0-9]{64}$/u);
    expect(persisted?.credential_digest).not.toContain(room.metricsAccess.credential);
    expect(persisted?.expires_at).toBe(room.metricsAccess.expiresAt);

    await runInDurableObject(
      authorityEnv.KYX_ROOM.getByName(room.roomCode),
      async (_instance, state) => {
        state.storage.sql.exec(
          'UPDATE room_metrics_access_v1 SET expires_at = ? WHERE singleton = 1',
          Date.now() - 1,
        );
      },
    );
    await expectMetricsDenied(await SELF.fetch(
      `${AUTHORITY_ORIGIN}${room.metricsPath}`,
      { headers: metricsHeaders(room) },
    ));
  });

  it('scopes CORS to metrics and strips forged internal provisioning headers', async () => {
    const room = (await createRoom()).room;
    const preflight = await SELF.fetch(`${AUTHORITY_ORIGIN}${room.metricsPath}`, {
      method: 'OPTIONS',
      headers: {
        Origin: ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': METRICS_ACCESS_CREDENTIAL_HEADER,
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-headers'))
      .toBe(METRICS_ACCESS_CREDENTIAL_HEADER);

    const wrongPathPreflight = await SELF.fetch(`${AUTHORITY_ORIGIN}${room.roomPath}`, {
      method: 'OPTIONS',
      headers: {
        Origin: ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': METRICS_ACCESS_CREDENTIAL_HEADER,
      },
    });
    expect(wrongPathPreflight.status).toBe(403);

    const forgedRoomCode = 'KYX-234567';
    const forgedCredential = 'B'.repeat(43);
    const forgedDigest = await digestMetricsAccessCredential(
      forgedRoomCode,
      forgedCredential,
    );
    const forged = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/${forgedRoomCode}`, {
      method: 'POST',
      headers: {
        Origin: ALLOWED_ORIGIN,
        [INTERNAL_METRICS_ACCESS_DIGEST_HEADER]: forgedDigest,
        [INTERNAL_METRICS_ACCESS_EXPIRY_HEADER]:
          String(Date.now() + METRICS_ACCESS_TTL_MILLISECONDS),
      },
    });
    expect(forged.status).toBe(201);
    await expectMetricsDenied(await SELF.fetch(
      `${AUTHORITY_ORIGIN}/api/rooms/${forgedRoomCode}/metrics`,
      {
        headers: {
          Origin: ALLOWED_ORIGIN,
          [METRICS_ACCESS_CREDENTIAL_HEADER]: forgedCredential,
        },
      },
    ));
  });
});
