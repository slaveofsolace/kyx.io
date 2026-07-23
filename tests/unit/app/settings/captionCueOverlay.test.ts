import { afterEach, describe, expect, it, vi } from 'vitest';

import { CaptionCueOverlay } from '../../../../src/ui/CaptionCueOverlay.js';

class ClassListDouble {
  readonly values = new Set<string>();
  add(...names: string[]): void { names.forEach((name) => this.values.add(name)); }
  remove(...names: string[]): void { names.forEach((name) => this.values.delete(name)); }
  contains(name: string): boolean { return this.values.has(name); }
}

class ElementDouble {
  className = '';
  textContent = '';
  readonly dataset: Record<string, string> = {};
  readonly classList = new ClassListDouble();
  readonly children: ElementDouble[] = [];
  readonly attributes = new Map<string, string>();

  append(...children: ElementDouble[]): void { this.children.push(...children); }
  replaceChildren(...children: ElementDouble[]): void {
    this.children.length = 0;
    this.children.push(...children);
  }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
}

function createHarness(now: () => number = () => 1_000) {
  const captionRegion = new ElementDouble();
  const audioCueRegion = new ElementDouble();
  captionRegion.classList.add('hidden');
  audioCueRegion.classList.add('hidden');
  const documentDouble = {
    createElement: () => new ElementDouble(),
    getElementById: (id: string) => id === 'caption-region' ? captionRegion : audioCueRegion,
  };
  const overlay = new CaptionCueOverlay({
    document: documentDouble,
    captionRegion,
    audioCueRegion,
    now,
  });
  return { overlay, captionRegion, audioCueRegion };
}

describe('CaptionCueOverlay semantic alternatives', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders subtitle speaker, text, and truthful direction as text-only DOM', () => {
    vi.useFakeTimers();
    const harness = createHarness();
    harness.overlay.setPreferences({ subtitles: true, visualAudioCues: false });

    expect(harness.overlay.showSubtitle({
      speaker: 'Controller',
      text: '<script>hold position</script>',
      direction: 'left',
    })).toBe(true);

    const card = harness.captionRegion.children[0];
    expect(card.dataset.direction).toBe('left');
    expect(card.children[0].children[0].textContent).toBe('CONTROLLER');
    expect(card.children[0].children[1].textContent).toBe('LEFT');
    expect(card.children[1].textContent).toBe('<script>hold position</script>');
    expect(harness.captionRegion.classList.contains('hidden')).toBe(false);

    vi.advanceTimersByTime(3_200);
    expect(harness.captionRegion.children).toHaveLength(0);
    expect(harness.captionRegion.classList.contains('hidden')).toBe(true);
  });

  it('rate-limits repeated critical cues and does not invent a direction', () => {
    vi.useFakeTimers();
    let currentTime = 5_000;
    const harness = createHarness(() => currentTime);
    harness.overlay.setPreferences({ subtitles: true, visualAudioCues: true });

    expect(harness.overlay.showAudioCue({
      id: 'weapon-empty',
      text: 'weapon empty',
      priority: 'danger',
      minIntervalMs: 500,
    })).toBe(true);
    expect(harness.overlay.showAudioCue({
      id: 'weapon-empty',
      text: 'weapon empty',
      direction: 'right',
      minIntervalMs: 500,
    })).toBe(false);

    const card = harness.audioCueRegion.children[0];
    expect(card.dataset.direction).toBe('none');
    expect(card.dataset.priority).toBe('danger');
    expect(card.children).toHaveLength(2);

    currentTime += 501;
    expect(harness.overlay.showAudioCue({
      id: 'weapon-empty',
      text: 'weapon empty',
      direction: 'nearby',
      minIntervalMs: 500,
    })).toBe(true);
    expect(harness.audioCueRegion.children[0].dataset.direction).toBe('nearby');
  });
});
