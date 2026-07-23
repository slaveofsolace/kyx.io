const DIRECTIONS = new Set(['front', 'rear', 'left', 'right']);

function finiteXZ(vector) {
  return vector
    && Number.isFinite(vector.x)
    && Number.isFinite(vector.z);
}

/**
 * Classifies a real world-space damage source into one of four coarse HUD
 * sectors. The function intentionally returns null for missing/degenerate data
 * instead of fabricating a direction.
 */
export function classifyDamageDirection(sourcePosition, playerPosition, cameraForward) {
  if (!finiteXZ(sourcePosition) || !finiteXZ(playerPosition) || !finiteXZ(cameraForward)) return null;

  const offsetX = sourcePosition.x - playerPosition.x;
  const offsetZ = sourcePosition.z - playerPosition.z;
  const offsetLength = Math.hypot(offsetX, offsetZ);
  const forwardLength = Math.hypot(cameraForward.x, cameraForward.z);
  if (offsetLength < 0.0001 || forwardLength < 0.0001) return null;

  const sourceX = offsetX / offsetLength;
  const sourceZ = offsetZ / offsetLength;
  const forwardX = cameraForward.x / forwardLength;
  const forwardZ = cameraForward.z / forwardLength;
  const rightX = -forwardZ;
  const rightZ = forwardX;
  const forwardDot = sourceX * forwardX + sourceZ * forwardZ;
  const rightDot = sourceX * rightX + sourceZ * rightZ;

  if (Math.abs(forwardDot) >= Math.abs(rightDot)) return forwardDot >= 0 ? 'front' : 'rear';
  return rightDot >= 0 ? 'right' : 'left';
}

export function isDamageDirection(value) {
  return DIRECTIONS.has(value);
}
