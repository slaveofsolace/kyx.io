import type { MovementProfileV1 } from './profile';
import type { MovementStance } from './state';

/** Shared by authoritative aim origins and the player's presentation camera. */
export function movementEyeHeightMillimeters(
  profile: MovementProfileV1,
  stance: MovementStance,
): number {
  const shape = stance === 'crouched' ? profile.crouchedShape : profile.standingShape;
  return Math.max(shape.radius, shape.height - 100);
}
