import { describe, expect, it } from 'vitest';

import { classifyDamageDirection } from '../../../../src/ui/DamageDirection.js';

describe('coarse directional damage classification', () => {
  const player = { x: 0, z: 0 };
  const facingNorth = { x: 0, z: -1 };

  it.each([
    [{ x: 0, z: -8 }, 'front'],
    [{ x: 8, z: 0 }, 'right'],
    [{ x: 0, z: 8 }, 'rear'],
    [{ x: -8, z: 0 }, 'left'],
  ])('maps a real source at %o to the %s sector', (source, expected) => {
    expect(classifyDamageDirection(source, player, facingNorth)).toBe(expected);
  });

  it('returns null rather than inventing a direction for missing or degenerate data', () => {
    expect(classifyDamageDirection(null, player, facingNorth)).toBeNull();
    expect(classifyDamageDirection(player, player, facingNorth)).toBeNull();
    expect(classifyDamageDirection({ x: 2, z: 2 }, player, { x: 0, z: 0 })).toBeNull();
  });
});
