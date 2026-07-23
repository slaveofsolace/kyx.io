import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../../../../src/style.css', import.meta.url), 'utf8');

describe('reduced-motion CSS precedence', () => {
  it('out-ranks late important transition shorthands for the saved preference', () => {
    const match = css.match(
      /body\[data-reduced-motion="true"\] #app \*,[\s\S]*?\{([\s\S]*?)\}/u,
    );

    expect(match?.[1]).toContain('animation-duration: 0.001ms !important;');
    expect(match?.[1]).toContain('animation-iteration-count: 1 !important;');
    expect(match?.[1]).toContain('transition-duration: 0.001ms !important;');
  });

  it('gives classed and identified controls sufficient precedence for the OS preference', () => {
    const start = css.indexOf('@media (prefers-reduced-motion: reduce)');
    const end = css.indexOf('@media (max-height: 760px)', start);
    const mediaRule = css.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(mediaRule).toContain('body #app [class]');
    expect(mediaRule).toContain('body #app [id]');
    expect(mediaRule).toContain('animation-duration: 0.001ms !important;');
    expect(mediaRule).toContain('animation-iteration-count: 1 !important;');
    expect(mediaRule).toContain('transition-duration: 0.001ms !important;');
  });
});
