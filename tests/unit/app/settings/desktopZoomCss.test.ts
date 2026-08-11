import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../../../src/style.css', import.meta.url), 'utf8');

describe('desktop launch overlay CSS', () => {
  it('does not override the hidden state from pointer capability media queries', () => {
    expect(css).not.toMatch(
      /@media\s*\([^}]*pointer:\s*coarse[^}]*\)[^{]*\{[^}]*#desktop-required-overlay\.hidden/s,
    );
    expect(css).not.toMatch(
      /@media\s*\([^}]*hover:\s*none[^}]*\)[^{]*\{[^}]*#desktop-required-overlay\.hidden/s,
    );
  });
});
