const DIRECTIONS = new Set(['front', 'rear', 'left', 'right', 'nearby', 'none']);
const PRIORITIES = new Set(['status', 'threat', 'danger']);

const DIRECTION_LABELS = Object.freeze({
  front: 'FRONT',
  rear: 'REAR',
  left: 'LEFT',
  right: 'RIGHT',
  nearby: 'NEARBY',
});

function cleanText(value, maximumLength) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maximumLength);
}

function normalizeDirection(value) {
  return DIRECTIONS.has(value) ? value : 'none';
}

function clampDuration(value, fallback) {
  return Number.isFinite(value) ? Math.min(5_000, Math.max(500, value)) : fallback;
}

/**
 * Event-driven subtitle and critical-sound alternative renderer.
 * It deliberately accepts semantic directions only; callers must not infer
 * precise enemy positions from an ordinary non-spatial sound trigger.
 */
export class CaptionCueOverlay {
  constructor(options = {}) {
    const doc = options.document ?? (typeof document === 'undefined' ? null : document);
    this.document = doc;
    this.captionRegion = options.captionRegion ?? doc?.getElementById('caption-region') ?? null;
    this.audioCueRegion = options.audioCueRegion ?? doc?.getElementById('audio-cue-region') ?? null;
    this.subtitles = true;
    this.visualAudioCues = false;
    this._captionTimer = null;
    this._audioCueTimer = null;
    this._lastAudioCueAt = new Map();
    this._now = options.now ?? (() => Date.now());
  }

  setPreferences({ subtitles = true, visualAudioCues = false } = {}) {
    this.subtitles = subtitles === true;
    this.visualAudioCues = visualAudioCues === true;
    if (!this.subtitles) this.clearSubtitles();
    if (!this.visualAudioCues) this.clearAudioCues();
  }

  showSubtitle({ speaker = 'SYSTEM', text = '', direction = 'none', durationMs = 3_200 } = {}) {
    const spokenText = cleanText(text, 180);
    if (!this.subtitles || !spokenText || !this.captionRegion || !this.document) return false;

    const safeSpeaker = cleanText(speaker, 40) || 'SYSTEM';
    const safeDirection = normalizeDirection(direction);
    const card = this.document.createElement('div');
    card.className = 'caption-card';
    card.dataset.direction = safeDirection;

    const header = this.document.createElement('div');
    header.className = 'caption-header';
    const speakerNode = this.document.createElement('span');
    speakerNode.className = 'caption-speaker';
    speakerNode.textContent = safeSpeaker.toUpperCase();
    header.append(speakerNode);

    const directionLabel = DIRECTION_LABELS[safeDirection];
    if (directionLabel) {
      const directionNode = this.document.createElement('span');
      directionNode.className = 'caption-direction';
      directionNode.textContent = directionLabel;
      header.append(directionNode);
    }

    const textNode = this.document.createElement('div');
    textNode.className = 'caption-text';
    textNode.textContent = spokenText;
    card.append(header, textNode);
    this._present(this.captionRegion, card, '_captionTimer', clampDuration(durationMs, 3_200));
    return true;
  }

  showAudioCue({
    id = 'critical-sound',
    text = '',
    direction = 'none',
    priority = 'status',
    durationMs = 1_600,
    minIntervalMs = 250,
  } = {}) {
    const cueText = cleanText(text, 64);
    if (!this.visualAudioCues || !cueText || !this.audioCueRegion || !this.document) return false;

    const cueId = cleanText(id, 48) || 'critical-sound';
    const now = this._now();
    const lastShown = this._lastAudioCueAt.get(cueId);
    const safeInterval = Number.isFinite(minIntervalMs) ? Math.max(0, minIntervalMs) : 250;
    if (lastShown !== undefined && now - lastShown < safeInterval) return false;
    this._lastAudioCueAt.set(cueId, now);

    const safeDirection = normalizeDirection(direction);
    const safePriority = PRIORITIES.has(priority) ? priority : 'status';
    const card = this.document.createElement('div');
    card.className = 'audio-cue-card';
    card.dataset.cueId = cueId;
    card.dataset.direction = safeDirection;
    card.dataset.priority = safePriority;

    const marker = this.document.createElement('span');
    marker.className = 'audio-cue-marker';
    marker.setAttribute('aria-hidden', 'true');
    const cueTextNode = this.document.createElement('span');
    cueTextNode.className = 'audio-cue-text';
    cueTextNode.textContent = cueText.toUpperCase();
    card.append(marker, cueTextNode);

    const directionLabel = DIRECTION_LABELS[safeDirection];
    if (directionLabel) {
      const directionNode = this.document.createElement('span');
      directionNode.className = 'audio-cue-direction';
      directionNode.textContent = directionLabel;
      card.append(directionNode);
    }

    this._present(this.audioCueRegion, card, '_audioCueTimer', clampDuration(durationMs, 1_600));
    return true;
  }

  _present(region, content, timerKey, durationMs) {
    clearTimeout(this[timerKey]);
    region.replaceChildren(content);
    region.classList.remove('hidden');
    this[timerKey] = setTimeout(() => {
      region.replaceChildren();
      region.classList.add('hidden');
      this[timerKey] = null;
    }, durationMs);
  }

  clearSubtitles() {
    clearTimeout(this._captionTimer);
    this._captionTimer = null;
    this.captionRegion?.replaceChildren();
    this.captionRegion?.classList.add('hidden');
  }

  clearAudioCues() {
    clearTimeout(this._audioCueTimer);
    this._audioCueTimer = null;
    this.audioCueRegion?.replaceChildren();
    this.audioCueRegion?.classList.add('hidden');
  }

  clear() {
    this.clearSubtitles();
    this.clearAudioCues();
  }

  dispose() {
    this.clear();
    this._lastAudioCueAt.clear();
  }
}

export { normalizeDirection };
