import { describe, expect, it, vi } from 'vitest';

import {
  forwardToStagingAuthority,
  type KyxPagesContext,
} from '../../../cloudflare/pages-preview/functions/authorityProxy';

describe('Pages staging authority proxy', () => {
  it('forwards the original same-origin request through the private service binding', async () => {
    const request = new Request('https://kyx-io-preview.pages.dev/api/rooms/create', {
      method: 'POST',
      headers: {
        origin: 'https://kyx-io-preview.pages.dev',
      },
      body: JSON.stringify({ requestedCapacity: 4 }),
    });
    const fetch = vi.fn(async (forwarded: Request) => Response.json({
      url: forwarded.url,
      origin: forwarded.headers.get('origin'),
    }));
    const context = {
      request,
      env: {
        KYX_AUTHORITY: { fetch },
      },
    } as unknown as KyxPagesContext;

    const response = await forwardToStagingAuthority(context);

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(request);
    await expect(response.json()).resolves.toEqual({
      url: request.url,
      origin: 'https://kyx-io-preview.pages.dev',
    });
  });
});
