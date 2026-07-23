import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../../../src/style.css', import.meta.url), 'utf8');

describe('desktop zoom support CSS', () => {
  it('does not classify a narrow zoomed desktop as touch-only', () => {
    const overlayRule = css.indexOf('#desktop-required-overlay.hidden');
    const mediaStart = css.lastIndexOf('@media', overlayRule);
    const mediaHeader = css.slice(mediaStart, css.indexOf('{', mediaStart));

    expect(overlayRule).toBeGreaterThanOrEqual(0);
    expect(mediaStart).toBeGreaterThanOrEqual(0);
    expect(mediaHeader).toContain('(hover: none)');
    expect(mediaHeader).toContain('(pointer: coarse)');
    expect(mediaHeader).not.toContain('max-width');
  });
});
