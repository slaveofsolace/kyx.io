import type { MovementCollisionLayer } from '../sim/movement/queryPort';

export const COLLISION_LAYER_ORDER = Object.freeze([
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
  'kill_volume',
  'forbidden_volume',
  'recovery_volume',
] as const satisfies readonly MovementCollisionLayer[]);

export const COLLISION_LAYER_BITS: Readonly<Record<MovementCollisionLayer, number>> =
  Object.freeze(Object.fromEntries(
    COLLISION_LAYER_ORDER.map((layer, index) => [layer, 1 << index]),
  ) as Record<MovementCollisionLayer, number>);

export const ALL_COLLISION_LAYER_BITS = COLLISION_LAYER_ORDER.reduce(
  (mask, layer) => mask | COLLISION_LAYER_BITS[layer],
  0,
);

function packInteractionGroups(membership: number, filter: number): number {
  return ((membership & 0xffff) << 16) | (filter & 0xffff);
}

export function collisionGroupsForLayer(layer: MovementCollisionLayer): number {
  return packInteractionGroups(COLLISION_LAYER_BITS[layer], ALL_COLLISION_LAYER_BITS);
}

export function queryCollisionGroups(layers: readonly MovementCollisionLayer[]): number {
  const filter = layers.reduce((mask, layer) => mask | COLLISION_LAYER_BITS[layer], 0);
  return packInteractionGroups(ALL_COLLISION_LAYER_BITS, filter);
}

