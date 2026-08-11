import { describe, expect, it } from 'vitest';

import { supportsDesktopLaunch } from '../../../src/config/productConfig.js';

describe('supportsDesktopLaunch', () => {
  it.each([
    ['Windows Chrome', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36'],
    ['Windows Chrome on a touch-capable PC', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36'],
    ['macOS Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'],
  ])('allows %s', (_label, userAgent) => {
    expect(supportsDesktopLaunch(userAgent)).toBe(true);
  });

  it.each([
    ['Android Chrome', 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36'],
    ['iPhone Safari', 'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'],
    ['iPad desktop-mode Safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/19.0 Mobile/15E148 Safari/604.1'],
  ])('blocks %s', (_label, userAgent) => {
    expect(supportsDesktopLaunch(userAgent)).toBe(false);
  });
});
