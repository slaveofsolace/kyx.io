const STORAGE_KEY = 'sio_settings';

export const DEFAULTS = Object.freeze({
  sensitivity: 1.0,       // mouse-look scale multiplier
  volume: 0.5,            // master audio gain 0-1
  fov: 78,                // player camera field-of-view in degrees
  quality: 'medium',      // 'low' | 'medium' | 'high'
  invertY: false,         // invert vertical look (mouse + touch)
  hudScale: 1.0,          // HUD readout scale
  crosshairScale: 1.0,    // crosshair-only scale
  crosshairColor: 'cyan', // 'cyan' | 'white' | 'amber'
  highContrast: false,
  reducedMotion: false,
  reducedFlash: false,
  subtitles: true,
  visualAudioCues: false,
});

const NUMBER_LIMITS = Object.freeze({
  sensitivity: Object.freeze([0.3, 3]),
  volume: Object.freeze([0, 1]),
  fov: Object.freeze([60, 110]),
  hudScale: Object.freeze([0.8, 1.4]),
  crosshairScale: Object.freeze([0.75, 1.75]),
});

const ENUM_VALUES = Object.freeze({
  quality: Object.freeze(['low', 'medium', 'high']),
  crosshairColor: Object.freeze(['cyan', 'white', 'amber']),
});

const BOOLEAN_KEYS = new Set([
  'invertY',
  'highContrast',
  'reducedMotion',
  'reducedFlash',
  'subtitles',
  'visualAudioCues',
]);

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * @param {string} key
 * @param {unknown} value
 * @returns {unknown}
 */
export function normalizeSetting(key, value) {
  if (!Object.hasOwn(DEFAULTS, key)) return undefined;

  const limits = NUMBER_LIMITS[key];
  if (limits) {
    return typeof value === 'number' && Number.isFinite(value)
      ? clamp(value, limits[0], limits[1])
      : DEFAULTS[key];
  }

  const allowed = ENUM_VALUES[key];
  if (allowed) return allowed.includes(value) ? value : DEFAULTS[key];
  if (BOOLEAN_KEYS.has(key)) return typeof value === 'boolean' ? value : DEFAULTS[key];
  return DEFAULTS[key];
}

/**
 * @param {Record<string, unknown> | undefined} [candidate]
 * @returns {Record<string, unknown>}
 */
export function normalizeSettings(candidate = undefined) {
  const source = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? candidate
    : {};
  const normalized = {};
  for (const key of Object.keys(DEFAULTS)) {
    normalized[key] = normalizeSetting(key, source[key] ?? DEFAULTS[key]);
  }
  return normalized;
}

function getStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const GameSettings = {
  _d: null,

  load() {
    let stored = {};
    try {
      const raw = getStorage()?.getItem(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      stored = {};
    }
    this._d = normalizeSettings(stored);
    return this;
  },

  save() {
    this._d = normalizeSettings(this._d);
    try {
      const storage = getStorage();
      if (!storage) return false;
      storage.setItem(STORAGE_KEY, JSON.stringify(this._d));
      return true;
    } catch {
      // Preferences still apply for this session when storage is blocked/full.
      return false;
    }
  },

  get(key) {
    if (!this._d) this.load();
    return Object.hasOwn(DEFAULTS, key) ? this._d[key] : undefined;
  },

  set(key, value) {
    if (!Object.hasOwn(DEFAULTS, key)) return false;
    if (!this._d) this.load();
    this._d[key] = normalizeSetting(key, value);
    return this.save();
  },

  setMany(values) {
    if (!this._d) this.load();
    const candidate = { ...this._d };
    if (values && typeof values === 'object' && !Array.isArray(values)) {
      for (const key of Object.keys(DEFAULTS)) {
        if (Object.hasOwn(values, key)) candidate[key] = values[key];
      }
    }
    this._d = normalizeSettings(candidate);
    return this.save();
  },

  snapshot() {
    if (!this._d) this.load();
    return { ...this._d };
  },
};
