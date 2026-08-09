import { describe, expect, it } from 'vitest';

import {
  classifyKyxConfirmedDamagePresentation,
} from '../../../src/app/onlineWeaponPresentationFx';

describe('online weapon confirmed-damage presentation', () => {
  it.each([
    [{ hitRegion: 'torso', healthPointsAfter: 30 }, 'hit'],
    [{ hitRegion: 'head', healthPointsAfter: 30 }, 'headshot'],
    [{ hitRegion: 'torso', healthPointsAfter: 0 }, 'kill'],
    [{ hitRegion: 'head', healthPointsAfter: 0 }, 'headshot_kill'],
  ] as const)('classifies %o as %s', (event, expected) => {
    expect(classifyKyxConfirmedDamagePresentation(event)).toBe(expected);
  });
});
