import {
  classifyDamageDirection,
  isDamageDirection,
} from '../ui/DamageDirection.js';

export type AuthorityDamageDirection = 'front' | 'rear' | 'left' | 'right';

interface AuthorityXZ {
  readonly x: number;
  readonly z: number;
}

/**
 * Converts the authority +Z-forward basis into the Three/player-eye -Z basis
 * used by the shared HUD classifier. Missing or non-finite authority state is
 * rejected instead of inventing a hit direction.
 */
export function classifyAuthorityDamageDirection(input: Readonly<{
  sourcePosition: AuthorityXZ | null;
  targetPosition: AuthorityXZ | null;
  targetYawMilliDegrees: number | null;
}>): AuthorityDamageDirection | null {
  const { sourcePosition, targetPosition, targetYawMilliDegrees } = input;
  if (
    sourcePosition === null
    || targetPosition === null
    || !Number.isFinite(sourcePosition.x)
    || !Number.isFinite(sourcePosition.z)
    || !Number.isFinite(targetPosition.x)
    || !Number.isFinite(targetPosition.z)
    || targetYawMilliDegrees === null
    || !Number.isFinite(targetYawMilliDegrees)
  ) return null;

  const yawRadians = targetYawMilliDegrees * Math.PI / 180_000;
  const direction = classifyDamageDirection(
    { x: sourcePosition.x, z: -sourcePosition.z },
    { x: targetPosition.x, z: -targetPosition.z },
    { x: Math.sin(yawRadians), z: -Math.cos(yawRadians) },
  );
  return isDamageDirection(direction)
    ? direction as AuthorityDamageDirection
    : null;
}
