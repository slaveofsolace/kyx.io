import { normalizeSettings } from '../core/GameSettings.js';

export const CROSSHAIR_COLORS = Object.freeze({
  cyan: '#74f7ff',
  white: '#f4f8ff',
  amber: '#ffd166',
});

export function applyAccessibilityPreferences(settings, targetDocument = globalThis.document) {
  if (!targetDocument?.documentElement || !targetDocument?.body) return null;

  const normalized = normalizeSettings(settings);
  const rootStyle = targetDocument.documentElement.style;
  rootStyle.setProperty('--hud-scale', String(normalized.hudScale));
  rootStyle.setProperty('--crosshair-scale', String(normalized.crosshairScale));
  rootStyle.setProperty('--crosshair-color', CROSSHAIR_COLORS[normalized.crosshairColor]);

  targetDocument.body.dataset.highContrast = String(normalized.highContrast);
  targetDocument.body.dataset.reducedMotion = String(normalized.reducedMotion);
  targetDocument.body.dataset.reducedEffects = String(normalized.reducedEffects);
  targetDocument.body.dataset.reducedFlash = String(normalized.reducedFlash);
  targetDocument.body.dataset.crosshairColor = normalized.crosshairColor;

  return Object.freeze({
    hudScale: normalized.hudScale,
    crosshairScale: normalized.crosshairScale,
    crosshairColor: normalized.crosshairColor,
    highContrast: normalized.highContrast,
    reducedMotion: normalized.reducedMotion,
    reducedEffects: normalized.reducedEffects,
    reducedFlash: normalized.reducedFlash,
  });
}
