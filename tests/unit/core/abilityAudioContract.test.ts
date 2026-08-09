import { describe, expect, it } from 'vitest';

import { normalizeAbilityAudioKind } from '../../../src/core/AudioManager.js';

describe('ability audio contract', () => {
  it('normalizes authority ids before selecting finite procedural cues', () => {
    expect(normalizeAbilityAudioKind('vertical_impulse_grenade_v1')).toBe('launch');
    expect(normalizeAbilityAudioKind('smoke_grenade_v1')).toBe('smoke');
    expect(normalizeAbilityAudioKind('sticky_grenade_v1')).toBe('sticky');
    expect(normalizeAbilityAudioKind('flash_grenade_v1')).toBe('flash');
    expect(normalizeAbilityAudioKind('frag_grenade_v1')).toBe('frag');
  });
});
