export const PRODUCT_CONFIG = Object.freeze({
  product: 'KYX.IO',
  version: '1.0.0-phase1',
  launchMode: 'offline_practice',
  practice: Object.freeze({
    localPlayers: 1,
    bots: 7,
    durationSeconds: 8 * 60,
  }),
  advertising: Object.freeze({ enabled: false, provider: null }),
  economy: Object.freeze({ enabled: false, authority: 'none' }),
  legacyRelay: Object.freeze({ enabled: false }),
  desktopOnly: true,
});

export function supportsDesktopLaunch(userAgent = navigator.userAgent || '') {
  // Touch-capable Windows PCs can report a coarse primary pointer even while a
  // mouse and keyboard are attached. Pointer media queries therefore cannot
  // distinguish an unsupported phone/tablet from a supported desktop here.
  // Keep the launch boundary tied to an explicitly mobile user agent; pointer
  // lock still provides the authoritative input check when play begins.
  const mobileUserAgent = /Android|iPhone|iPad|iPod|IEMobile|BlackBerry|Opera Mini|Mobile/i.test(userAgent);
  return !mobileUserAgent;
}
