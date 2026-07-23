/// <reference types="@cloudflare/vitest-pool-workers/types" />

import {
  env,
  SELF,
  abortAllDurableObjects,
  reset,
  runInDurableObject,
} from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import type { KyxAuthorityEnv } from '../../worker/env';
import { ResumeSessionRegistry } from '../../worker/resumeSessions';

const authorityEnv = env as unknown as KyxAuthorityEnv;
const ALLOWED_ORIGIN = 'http://127.0.0.1:5173';

afterEach(async () => {
  await reset();
});

describe('authority Worker runtime', () => {
  it('serves health while failing closed on disallowed room origins', async () => {
    const health = await SELF.fetch('https://authority.test/health');
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      service: 'kyx-authority',
      roomBinding: true,
    });

    const rejected = await SELF.fetch('https://authority.test/api/rooms/create', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    });
    expect(rejected.status).toBe(403);
    await expect(rejected.json()).resolves.toEqual({ ok: false, code: 'ORIGIN_NOT_ALLOWED' });
  });

  it('creates a normalized room through the configured Durable Object binding', async () => {
    const response = await SELF.fetch('https://authority.test/api/rooms/create', {
      method: 'POST',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(response.status).toBe(201);
    const body = await response.json() as {
      readonly ok: boolean;
      readonly roomCode: string;
      readonly roomPath: string;
      readonly socketPath: string;
      readonly metricsPath: string;
    };
    expect(body).toMatchObject({ ok: true });
    expect(body.roomCode).toMatch(/^KYX-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/u);
    expect(body.roomPath).toBe(`/api/rooms/${body.roomCode}`);
    expect(body.socketPath).toBe(`${body.roomPath}/socket`);
    expect(body.metricsPath).toBe(`${body.roomPath}/metrics`);
  });

  it('preserves pristine immutable identity but fails closed on uncheckpointed recovery', async () => {
    const created = await SELF.fetch('https://authority.test/api/rooms/create', {
      method: 'POST',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    const body = await created.json() as { readonly roomCode: string; readonly roomPath: string };
    let stub = authorityEnv.KYX_ROOM.getByName(body.roomCode);
    const originalMatchId = await runInDurableObject(stub, async (_instance, state) => (
      [...state.storage.sql.exec<Record<string, string>>(
        'SELECT match_id FROM room_runtime_v2 WHERE singleton = 1',
      )][0]?.match_id
    ));

    await abortAllDurableObjects();
    const pristine = await SELF.fetch(`https://authority.test${body.roomPath}`, {
      method: 'POST',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(pristine.status).toBe(201);
    stub = authorityEnv.KYX_ROOM.getByName(body.roomCode);
    const restoredMatchId = await runInDurableObject(stub, async (_instance, state) => (
      [...state.storage.sql.exec<Record<string, string>>(
        'SELECT match_id FROM room_runtime_v2 WHERE singleton = 1',
      )][0]?.match_id
    ));
    expect(restoredMatchId).toBe(originalMatchId);

    await runInDurableObject(stub, async (_instance, state) => {
      state.storage.sql.exec(
        "UPDATE room_runtime_v2 SET recovery_state = 'active_uncheckpointed' WHERE singleton = 1",
      );
    });
    await abortAllDurableObjects();
    const unavailable = await SELF.fetch(`https://authority.test${body.roomPath}`, {
      method: 'POST',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toEqual({ ok: false, code: 'ROOM_UNAVAILABLE' });
  });

  it('stores only resume-token digests and rotates a credential atomically', async () => {
    const stub = authorityEnv.KYX_ROOM.getByName('KYX-234567');
    const result = await runInDurableObject(stub, async (_instance, state) => {
      const registry = new ResumeSessionRegistry(state.storage);
      registry.ensureSchema();
      const issued = await registry.issue(
        'player.TEST',
        'room.KYX-234567',
        'match.TEST',
      );
      const prepared = await registry.prepareRotation(issued.resumeToken);
      if (prepared === null) throw new Error('expected a valid prepared rotation');
      const found = registry.lookup(prepared, 'room.KYX-234567', 'match.TEST', 10_001);
      if (found === null) throw new Error('expected the issued session');
      const rotated = registry.commitRotation(found, prepared, 10_001);
      const replay = registry.lookup(prepared, 'room.KYX-234567', 'match.TEST', 10_002);
      const armed = registry.armDisconnectGrace(
        'player.TEST',
        'room.KYX-234567',
        'match.TEST',
        2,
        20_000,
      );
      const rows = [...state.storage.sql.exec<{
        player_id: string;
        token_digest: string;
        generation: number;
      }>('SELECT player_id, token_digest, generation FROM resume_sessions')];
      return {
        issuedToken: issued.resumeToken,
        storedDigest: rows[0]?.token_digest,
        storedGeneration: rows[0]?.generation,
        rotatedGeneration: rotated?.generation,
        replayAccepted: replay !== null,
        armed,
        armedExpiry: [...state.storage.sql.exec<{ expires_at: number }>(
          'SELECT expires_at FROM resume_sessions WHERE player_id = ?',
          'player.TEST',
        )][0]?.expires_at,
      };
    });

    expect(result.issuedToken).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(result.storedDigest).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.storedDigest).not.toBe(result.issuedToken);
    expect(result.storedGeneration).toBe(2);
    expect(result.rotatedGeneration).toBe(2);
    expect(result.replayAccepted).toBe(false);
    expect(result.armed).toBe(true);
    expect(result.armedExpiry).toBe(30_000);
  });
});
