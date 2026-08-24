/// <reference types="@cloudflare/vitest-pool-workers/types" />

import { reset, SELF } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';

import {
  KYX_MATCH_MODE_HEADER,
  P58D_COMBAT_PROFILE_HEADER,
  P58D_REV3_COMBAT_PROFILE,
} from '../../worker/combatRuntime';

const AUTHORITY_ORIGIN = 'https://authority.test';
const ALLOWED_ORIGIN = 'http://127.0.0.1:5173';

afterEach(async () => {
  await reset();
});

function expectExactCors(response: Response): void {
  expect(response.headers.get('access-control-allow-origin')).toBe(ALLOWED_ORIGIN);
  expect(response.headers.get('access-control-allow-origin')).not.toBe('*');
  expect(response.headers.get('vary')?.split(',').map((value) => value.trim()))
    .toContain('Origin');
}

describe('Worker exact-origin CORS policy', () => {
  it('accepts its own deployment origin without a hostname committed to configuration', async () => {
    const response = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
      method: 'POST',
      headers: { Origin: AUTHORITY_ORIGIN },
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('access-control-allow-origin')).toBe(AUTHORITY_ORIGIN);
    expect(response.headers.get('access-control-allow-origin')).not.toBe('*');
  });

  it('reflects one exact allowed origin on create and proxied room HTTP responses', async () => {
    const created = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
      method: 'POST',
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(created.status).toBe(201);
    expectExactCors(created);
    const body = await created.json() as {
      readonly metricsPath: string;
      readonly metricsAccess: {
        readonly headerName: string;
        readonly credential: string;
      };
    };

    const metrics = await SELF.fetch(`${AUTHORITY_ORIGIN}${body.metricsPath}`, {
      headers: {
        Origin: ALLOWED_ORIGIN,
        [body.metricsAccess.headerName]: body.metricsAccess.credential,
      },
    });
    expect(metrics.status).toBe(200);
    expectExactCors(metrics);

    const missing = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/not-a-room`, {
      headers: { Origin: ALLOWED_ORIGIN },
    });
    expect(missing.status).toBe(404);
    expectExactCors(missing);
  });

  it('answers only bounded room preflights without wildcard methods or headers', async () => {
    const response = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
      method: 'OPTIONS',
      headers: {
        Origin: ALLOWED_ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers':
          `Content-Type, ${P58D_COMBAT_PROFILE_HEADER}, ${KYX_MATCH_MODE_HEADER}`,
      },
    });
    expect(response.status).toBe(204);
    expectExactCors(response);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST');
    expect(response.headers.get('access-control-allow-methods')).not.toContain('*');
    expect(response.headers.get('access-control-allow-headers'))
      .toBe(`content-type, ${P58D_COMBAT_PROFILE_HEADER}, ${KYX_MATCH_MODE_HEADER}`);
    expect(response.headers.get('access-control-allow-headers')).not.toContain('*');
    expect(response.headers.get('access-control-max-age')).toBe('600');

    const combatCreated = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
      method: 'POST',
      headers: {
        Origin: ALLOWED_ORIGIN,
        [P58D_COMBAT_PROFILE_HEADER]: P58D_REV3_COMBAT_PROFILE,
      },
    });
    expect(combatCreated.status).toBe(201);
    expectExactCors(combatCreated);
  });

  it('fails closed for forbidden origins, methods, headers, and paths', async () => {
    const forbiddenOrigin = `${ALLOWED_ORIGIN}.attacker.invalid`;
    for (const method of ['POST', 'OPTIONS'] as const) {
      const response = await SELF.fetch(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
        method,
        headers: {
          Origin: forbiddenOrigin,
          ...(method === 'OPTIONS'
            ? { 'Access-Control-Request-Method': 'POST' }
            : {}),
        },
      });
      expect(response.status).toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
    }

    const rejected = [
      new Request(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
        method: 'OPTIONS',
        headers: {
          Origin: ALLOWED_ORIGIN,
          'Access-Control-Request-Method': 'DELETE',
        },
      }),
      new Request(`${AUTHORITY_ORIGIN}/api/rooms/create`, {
        method: 'OPTIONS',
        headers: {
          Origin: ALLOWED_ORIGIN,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'authorization',
        },
      }),
      new Request(`${AUTHORITY_ORIGIN}/health`, {
        method: 'OPTIONS',
        headers: {
          Origin: ALLOWED_ORIGIN,
          'Access-Control-Request-Method': 'GET',
        },
      }),
      new Request(`${AUTHORITY_ORIGIN}/api/rooms/arbitrary/deep/path`, {
        method: 'OPTIONS',
        headers: {
          Origin: ALLOWED_ORIGIN,
          'Access-Control-Request-Method': 'GET',
        },
      }),
    ];
    for (const request of rejected) {
      const response = await SELF.fetch(request);
      expect(response.status).toBe(403);
      expect(response.headers.get('access-control-allow-origin')).toBeNull();
      expect(response.headers.get('access-control-allow-methods')).toBeNull();
      expect(response.headers.get('access-control-allow-headers')).toBeNull();
    }
  });
});
