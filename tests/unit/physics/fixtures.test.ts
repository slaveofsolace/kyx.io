import { describe, expect, it } from 'vitest';

import {
  MILLIMETERS_PER_RAPIER_UNIT,
  hashPhysicsFixture,
  validatePhysicsFixture,
} from '../../../src/physics/fixtureSchema';
import {
  PHYSICS_FIXTURE_IDS,
  getPhysicsFixture,
  listPhysicsFixtures,
} from '../../../src/physics/fixtures';

function everyNumberIsInteger(value: unknown): boolean {
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (Array.isArray(value)) return value.every(everyNumberIsInteger);
  if (value !== null && typeof value === 'object') {
    return Object.values(value).every(everyNumberIsInteger);
  }
  return true;
}

describe('physics fixture catalog', () => {
  it('contains exactly the five Phase 3 primitive fixtures', () => {
    expect(PHYSICS_FIXTURE_IDS).toEqual([
      'flat_run',
      'contact_lab',
      'vertical_lab',
      'slide_lab',
      'teleport_lab',
    ]);
    expect(listPhysicsFixtures()).toHaveLength(5);
  });

  it.each(PHYSICS_FIXTURE_IDS)('%s validates with integer geometry and explicit volumes', (id) => {
    const fixture = getPhysicsFixture(id);
    const result = validatePhysicsFixture(fixture);
    expect(result.ok).toBe(true);
    expect(fixture.millimetersPerRapierUnit).toBe(MILLIMETERS_PER_RAPIER_UNIT);
    expect(fixture.solids.length).toBeGreaterThan(0);
    expect(fixture.volumes.length).toBeGreaterThan(0);
    expect(everyNumberIsInteger(fixture)).toBe(true);
    expect(hashPhysicsFixture(fixture)).toMatch(/^[a-f0-9]{16}$/u);
  });

  it('pins the required threshold and teleport primitives', () => {
    expect(getPhysicsFixture('vertical_lab').solids.map((solid) => solid.id)).toEqual(
      expect.arrayContaining([
        'step_below_threshold',
        'step_above_threshold',
        'ramp_walkable',
        'ramp_too_steep',
        'crouch_tunnel_ceiling',
      ]),
    );
    expect(getPhysicsFixture('teleport_lab').solids.map((solid) => solid.id)).toEqual(
      expect.arrayContaining([
        'thin_wall',
        'teleport_door',
        'teleport_player_proxy',
        'teleport_spawn_barrier',
      ]),
    );
  });

  it('produces five distinct canonical hashes', () => {
    const hashes = listPhysicsFixtures().map(hashPhysicsFixture);
    expect(new Set(hashes).size).toBe(5);
    expect(Object.fromEntries(
      PHYSICS_FIXTURE_IDS.map((id) => [id, hashPhysicsFixture(getPhysicsFixture(id))]),
    )).toEqual({
      flat_run: '44bfdf2fdced9d9c',
      contact_lab: '1f8d019f6f1ae372',
      vertical_lab: 'a9fc5809db86605e',
      slide_lab: '3cb2374d832e66a7',
      teleport_lab: '4816a5ecd252b626',
    });
  });
});
