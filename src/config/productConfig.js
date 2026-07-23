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

export function supportsDesktopLaunch() {
  const userAgent = navigator.userAgent || '';
  const mobileUserAgent = /Android|iPhone|iPad|iPod|IEMobile|BlackBerry|Opera Mini|Mobile/i.test(userAgent);
  const hasFinePointer = window.matchMedia?.('(any-pointer: fine)').matches ?? true;
  const coarsePrimary = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return !mobileUserAgent && (hasFinePointer || !coarsePrimary);
}
