import { describe, expect, it } from 'vitest';

import {
  AUTHORITY_SPAWN_SUPPORT_CONTRACT,
  FixtureAuthoritySpawnSupport,
} from '../../../src/authority/spawn';
import type { PhysicsFixtureV1 } from '../../../src/physics';

function fixture(): PhysicsFixtureV1 {
  return Object.freeze({
    schemaVersion: 1,
    id: 'spawn_support_test',
    revision: 1,
    millimetersPerRapierUnit: 1_000,
    spawn: Object.freeze({
      feetPositionMm: Object.freeze({ x: 0, y: 1_000, z: 0 }),
      yawMilliDegrees: 0,
    }),
    solids: Object.freeze([
      Object.freeze({
        id: 'floor',
        layer: 'world_static',
        body: 'fixed',
        centerMm: Object.freeze({ x: 0, y: 0, z: 0 }),
        rotationMilliDegrees: Object.freeze({ x: 0, y: 0, z: 0 }),
        velocityMmPerSecond: Object.freeze({ x: 0, y: 0, z: 0 }),
        shape: Object.freeze({
          type: 'box',
          halfExtentsMm: Object.freeze({ x: 1_000, y: 1_000, z: 1_000 }),
        }),
      }),
    ]),
    volumes: Object.freeze([]),
  });
}

describe('authority spawn surface support', () => {
  it('accepts a spawn whose feet sit on world-static authority collision', () => {
    const result = new FixtureAuthoritySpawnSupport(fixture()).probe({ x: 0, y: 1_000, z: 0 });
    expect(result).toEqual({ supported: true, colliderId: 'floor', supportGapMm: 0 });
  });

  it('rejects in-bounds empty space outside the walkable platform', () => {
    const result = new FixtureAuthoritySpawnSupport(fixture()).probe({ x: 2_000, y: 1_000, z: 0 });
    expect(result).toEqual({ supported: false, colliderId: null, supportGapMm: null });
  });

  it('rejects a spawn floating beyond the support tolerance', () => {
    const result = new FixtureAuthoritySpawnSupport(fixture()).probe({ x: 0, y: 1_080, z: 0 });
    expect(result.supported).toBe(false);
    expect(result.supportGapMm).toBeGreaterThan(
      AUTHORITY_SPAWN_SUPPORT_CONTRACT.maximumSupportGapMm,
    );
  });

  it('rejects a spawn materially buried below the support surface', () => {
    const result = new FixtureAuthoritySpawnSupport(fixture()).probe({ x: 0, y: 970, z: 0 });
    expect(result.supported).toBe(false);
    expect(result.supportGapMm).toBeLessThan(0);
  });
});
