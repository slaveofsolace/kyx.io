import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('Cloudflare staging browser policy', () => {
  it('permits local GLB texture blob reads without broadening remote connections', async () => {
    const headers = await readFile(
      new URL('../../../public/_headers', import.meta.url),
      'utf8',
    );
    const policy = headers.split(/\r?\n/u).find((line) => (
      line.trimStart().startsWith('Content-Security-Policy:')
    ));

    expect(policy).toContain("connect-src 'self' blob:");
    expect(policy).not.toContain('connect-src *');
    expect(policy).not.toContain("connect-src 'self' https:");
  });
});
