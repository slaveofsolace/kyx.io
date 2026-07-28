import { describe, expect, it } from 'vitest';

import { deconflictNameplatePlacements } from '../../../src/ui/Nameplates.js';

describe('G7 Tournament Instrument nameplate layout', () => {
  it('keeps the nearest projected label anchored and stacks farther collisions upward', () => {
    const placements = [
      { id: 'near', x: 500, y: 310, scale: 1, distance: 12 },
      { id: 'far', x: 504, y: 308, scale: 1, distance: 28 },
      { id: 'farther', x: 498, y: 306, scale: 0.9, distance: 42 },
    ];
    const original = structuredClone(placements);

    const resolved = deconflictNameplatePlacements(placements, 720);
    const near = resolved.find((placement) => placement.id === 'near');
    const far = resolved.find((placement) => placement.id === 'far');
    const farther = resolved.find((placement) => placement.id === 'farther');

    expect(near?.y).toBe(310);
    expect(far?.y).toBeLessThan(near?.y ?? 0);
    expect(farther?.y).toBeLessThan(far?.y ?? 0);
    expect(placements).toEqual(original);
  });

  it('leaves already separated projected labels at their world-space anchors', () => {
    const placements = [
      { id: 'left', x: 240, y: 260, scale: 1, distance: 14 },
      { id: 'right', x: 620, y: 300, scale: 0.8, distance: 30 },
    ];

    expect(deconflictNameplatePlacements(placements, 720)).toEqual(placements);
  });
});
