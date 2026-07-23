import { describe, expect, it } from 'vitest';

import {
  COLLISION_LAYER_BITS,
  COLLISION_LAYER_ORDER,
  collisionGroupsForLayer,
  queryCollisionGroups,
} from '../../../src/physics/collisionLayers';

function groupsInteract(left: number, right: number): boolean {
  return (((left >>> 16) & right) !== 0) && (((right >>> 16) & left) !== 0);
}

describe('collision layers', () => {
  it('pins stable, unique layer bits', () => {
    expect(COLLISION_LAYER_ORDER).toEqual([
      'world_static',
      'dynamic_platform',
      'player_body',
      'door',
      'spawn_barrier',
      'kill_volume',
      'forbidden_volume',
      'recovery_volume',
    ]);
    expect(COLLISION_LAYER_ORDER.map((layer) => COLLISION_LAYER_BITS[layer]))
      .toEqual([1, 2, 4, 8, 16, 32, 64, 128]);
  });

  it('encodes query filters without leaking excluded layers', () => {
    const query = queryCollisionGroups(['world_static', 'door']);
    expect(groupsInteract(query, collisionGroupsForLayer('world_static'))).toBe(true);
    expect(groupsInteract(query, collisionGroupsForLayer('door'))).toBe(true);
    expect(groupsInteract(query, collisionGroupsForLayer('player_body'))).toBe(false);
    expect(groupsInteract(query, collisionGroupsForLayer('kill_volume'))).toBe(false);
  });
});

