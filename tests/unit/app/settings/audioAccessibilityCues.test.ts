import { afterEach, describe, expect, it, vi } from 'vitest';

import { AudioManager } from '../../../../src/core/AudioManager.js';

describe('AudioManager accessibility event hooks', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits visual alternatives even when WebAudio is unavailable or muted', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T12:00:00Z'));
    const audio = new AudioManager();
    const onCriticalCue = vi.fn();
    audio.onCriticalCue = onCriticalCue;

    audio.playExplosion();
    audio.playHurt();
    audio.playEmptyClick();

    expect(onCriticalCue).toHaveBeenCalledTimes(3);
    expect(onCriticalCue).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: 'explosion',
      text: 'EXPLOSION',
      direction: 'nearby',
      priority: 'danger',
    }));
    expect(onCriticalCue).toHaveBeenNthCalledWith(2, expect.objectContaining({
      id: 'damage-received',
      direction: 'none',
    }));
  });

  it('rate-limits repeated threats and exposes a future dialogue subtitle hook', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-22T12:00:00Z'));
    const audio = new AudioManager();
    const onCriticalCue = vi.fn();
    const onSubtitle = vi.fn();
    audio.onCriticalCue = onCriticalCue;
    audio.onSubtitle = onSubtitle;

    audio.playZombieGrowl();
    audio.playZombieGrowl();
    expect(onCriticalCue).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(1_201);
    audio.playZombieGrowl();
    expect(onCriticalCue).toHaveBeenCalledTimes(2);

    expect(audio.emitSubtitle({
      speaker: 'Arena Control',
      text: 'Wave inbound',
      direction: 'front',
    })).toBe(true);
    expect(onSubtitle).toHaveBeenCalledWith(expect.objectContaining({
      speaker: 'Arena Control',
      text: 'Wave inbound',
      direction: 'front',
    }));
  });
});
