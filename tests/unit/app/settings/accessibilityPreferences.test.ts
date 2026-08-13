import { describe, expect, it } from 'vitest';

import {
  CROSSHAIR_COLORS,
  applyAccessibilityPreferences,
} from '../../../../src/ui/AccessibilityPreferences.js';

function createDocumentDouble(): {
  document: Document;
  properties: Map<string, string>;
  dataset: Record<string, string>;
} {
  const properties = new Map<string, string>();
  const dataset: Record<string, string> = {};
  const document = {
    documentElement: {
      style: { setProperty: (key: string, value: string) => properties.set(key, value) },
    },
    body: { dataset },
  } as unknown as Document;
  return { document, properties, dataset };
}

describe('applyAccessibilityPreferences', () => {
  it('publishes validated CSS variables and explicit body states', () => {
    const target = createDocumentDouble();

    const applied = applyAccessibilityPreferences({
      hudScale: 1.3,
      crosshairScale: 1.5,
      crosshairColor: 'amber',
      highContrast: true,
      reducedMotion: true,
      reducedEffects: true,
      reducedFlash: true,
    }, target.document);

    expect(applied).toMatchObject({
      hudScale: 1.3,
      crosshairScale: 1.5,
      crosshairColor: 'amber',
      highContrast: true,
      reducedMotion: true,
      reducedEffects: true,
      reducedFlash: true,
    });
    expect(target.properties.get('--hud-scale')).toBe('1.3');
    expect(target.properties.get('--crosshair-scale')).toBe('1.5');
    expect(target.properties.get('--crosshair-color')).toBe(CROSSHAIR_COLORS.amber);
    expect(target.dataset).toEqual({
      highContrast: 'true',
      reducedMotion: 'true',
      reducedEffects: 'true',
      reducedFlash: 'true',
      crosshairColor: 'amber',
    });
  });

  it('falls back safely when a caller supplies invalid presentation values', () => {
    const target = createDocumentDouble();

    const applied = applyAccessibilityPreferences({
      hudScale: Number.NaN,
      crosshairScale: 99,
      crosshairColor: 'invisible',
    }, target.document);

    expect(applied).toMatchObject({
      hudScale: 1,
      crosshairScale: 1.75,
      crosshairColor: 'cyan',
    });
    expect(target.properties.get('--crosshair-color')).toBe(CROSSHAIR_COLORS.cyan);
  });
});
