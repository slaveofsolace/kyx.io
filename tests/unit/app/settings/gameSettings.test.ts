import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULTS,
  GameSettings,
  normalizeSettings,
} from '../../../../src/core/GameSettings.js';

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  writes = 0;

  get length(): number { return this.values.size; }
  clear(): void { this.values.clear(); }
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string): void { this.values.delete(key); }
  setItem(key: string, value: string): void {
    this.writes += 1;
    this.values.set(key, value);
  }
}

describe('GameSettings validation and persistence', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
    GameSettings._d = null;
  });

  afterEach(() => {
    GameSettings._d = null;
    vi.unstubAllGlobals();
  });

  it('normalizes every supported preference and ignores unknown keys', () => {
    const result = normalizeSettings({
      sensitivity: Number.POSITIVE_INFINITY,
      volume: -4,
      fov: 900,
      quality: 'cinematic',
      invertY: 'yes',
      hudScale: 9,
      crosshairScale: 0.1,
      crosshairColor: 'ultraviolet',
      highContrast: true,
      reducedMotion: true,
      reducedEffects: true,
      reducedFlash: false,
      subtitles: false,
      visualAudioCues: true,
      injected: 'discard-me',
    });

    expect(result).toEqual({
      ...DEFAULTS,
      volume: 0,
      fov: 110,
      hudScale: 1.4,
      crosshairScale: 0.75,
      highContrast: true,
      reducedMotion: true,
      reducedEffects: true,
      subtitles: false,
      visualAudioCues: true,
    });
    expect(result).not.toHaveProperty('injected');
  });

  it('falls back to complete defaults when persisted JSON is malformed', () => {
    storage.values.set('sio_settings', '{not-json');

    GameSettings.load();

    expect(GameSettings.snapshot()).toEqual(DEFAULTS);
  });

  it('batches a settings update into one storage write', () => {
    GameSettings.load();
    const persisted = GameSettings.setMany({
      hudScale: 1.25,
      crosshairColor: 'amber',
      reducedEffects: true,
      reducedFlash: true,
      subtitles: false,
      visualAudioCues: true,
    });

    expect(persisted).toBe(true);
    expect(storage.writes).toBe(1);
    expect(GameSettings.snapshot()).toMatchObject({
      hudScale: 1.25,
      crosshairColor: 'amber',
      reducedEffects: true,
      reducedFlash: true,
      subtitles: false,
      visualAudioCues: true,
    });
  });

  it('keeps validated session preferences when browser storage rejects writes', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
    });
    GameSettings._d = null;
    GameSettings.load();

    expect(GameSettings.setMany({ highContrast: true, hudScale: 1.2 })).toBe(false);
    expect(GameSettings.snapshot()).toMatchObject({ highContrast: true, hudScale: 1.2 });
  });
});
