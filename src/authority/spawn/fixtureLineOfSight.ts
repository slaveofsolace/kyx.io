import type {
  FixtureSolidV1,
  FixtureVector3Millimeters,
  PhysicsFixtureV1,
} from '../../physics';

const SEGMENT_EPSILON = 1e-9;

export interface AuthoritySegmentTrace {
  readonly blocked: boolean;
  readonly colliderId: string | null;
  readonly fractionPermille: number | null;
}

interface PreparedBox {
  readonly id: string;
  readonly center: FixtureVector3Millimeters;
  readonly inverseRotation: Readonly<{ x: number; y: number; z: number; w: number }>;
  readonly halfExtents: FixtureVector3Millimeters;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function rotationToQuaternion(rotation: FixtureSolidV1['rotationMilliDegrees']) {
  const x = (rotation.x / 1_000) * (Math.PI / 180) * 0.5;
  const y = (rotation.y / 1_000) * (Math.PI / 180) * 0.5;
  const z = (rotation.z / 1_000) * (Math.PI / 180) * 0.5;
  const cx = Math.cos(x);
  const sx = Math.sin(x);
  const cy = Math.cos(y);
  const sy = Math.sin(y);
  const cz = Math.cos(z);
  const sz = Math.sin(z);
  return Object.freeze({
    x: sx * cy * cz - cx * sy * sz,
    y: cx * sy * cz + sx * cy * sz,
    z: cx * cy * sz - sx * sy * cz,
    w: cx * cy * cz + sx * sy * sz,
  });
}

function rotateVector(
  vector: Readonly<{ x: number; y: number; z: number }>,
  quaternion: Readonly<{ x: number; y: number; z: number; w: number }>,
) {
  const dot = quaternion.x * vector.x + quaternion.y * vector.y + quaternion.z * vector.z;
  const crossX = quaternion.y * vector.z - quaternion.z * vector.y;
  const crossY = quaternion.z * vector.x - quaternion.x * vector.z;
  const crossZ = quaternion.x * vector.y - quaternion.y * vector.x;
  return Object.freeze({
    x: 2 * dot * quaternion.x + (quaternion.w * quaternion.w
      - quaternion.x * quaternion.x - quaternion.y * quaternion.y - quaternion.z * quaternion.z)
      * vector.x + 2 * quaternion.w * crossX,
    y: 2 * dot * quaternion.y + (quaternion.w * quaternion.w
      - quaternion.x * quaternion.x - quaternion.y * quaternion.y - quaternion.z * quaternion.z)
      * vector.y + 2 * quaternion.w * crossY,
    z: 2 * dot * quaternion.z + (quaternion.w * quaternion.w
      - quaternion.x * quaternion.x - quaternion.y * quaternion.y - quaternion.z * quaternion.z)
      * vector.z + 2 * quaternion.w * crossZ,
  });
}

function prepareBox(solid: FixtureSolidV1): PreparedBox {
  if (solid.shape.type !== 'box') {
    throw new Error(`SPAWN_AUTHORITY_UNSUPPORTED_COLLIDER ${solid.id}`);
  }
  const rotation = rotationToQuaternion(solid.rotationMilliDegrees);
  return Object.freeze({
    id: solid.id,
    center: solid.centerMm,
    inverseRotation: Object.freeze({
      x: -rotation.x,
      y: -rotation.y,
      z: -rotation.z,
      w: rotation.w,
    }),
    halfExtents: solid.shape.halfExtentsMm,
  });
}

function segmentBoxFraction(
  start: FixtureVector3Millimeters,
  end: FixtureVector3Millimeters,
  box: PreparedBox,
): number | null {
  const localStart = rotateVector({
    x: start.x - box.center.x,
    y: start.y - box.center.y,
    z: start.z - box.center.z,
  }, box.inverseRotation);
  const localDelta = rotateVector({
    x: end.x - start.x,
    y: end.y - start.y,
    z: end.z - start.z,
  }, box.inverseRotation);
  let entry = 0;
  let exit = 1;
  for (const axis of ['x', 'y', 'z'] as const) {
    const origin = localStart[axis];
    const delta = localDelta[axis];
    const extent = box.halfExtents[axis];
    if (Math.abs(delta) <= SEGMENT_EPSILON) {
      if (origin < -extent || origin > extent) return null;
      continue;
    }
    const first = (-extent - origin) / delta;
    const second = (extent - origin) / delta;
    const near = Math.min(first, second);
    const far = Math.max(first, second);
    entry = Math.max(entry, near);
    exit = Math.min(exit, far);
    if (entry - exit > SEGMENT_EPSILON) return null;
  }
  if (exit < 0 || entry > 1) return null;
  return Math.max(0, Math.min(1, entry));
}

/**
 * Immutable, authority-only sight queries over the accepted collision fixture.
 * Presentation meshes are not accepted by this boundary.
 */
export class FixtureAuthorityLineOfSight {
  private readonly boxes: readonly PreparedBox[];

  constructor(fixture: PhysicsFixtureV1) {
    this.boxes = Object.freeze(fixture.solids
      .filter((solid) => solid.layer === 'world_static'
        || solid.layer === 'door'
        || solid.layer === 'spawn_barrier')
      .map(prepareBox)
      .sort((left, right) => compareCodeUnits(left.id, right.id)));
    if (this.boxes.length < 1) throw new Error('SPAWN_AUTHORITY_EMPTY_COLLISION_FIXTURE');
  }

  trace(
    start: FixtureVector3Millimeters,
    end: FixtureVector3Millimeters,
  ): AuthoritySegmentTrace {
    let selected: Readonly<{ id: string; fraction: number }> | null = null;
    for (const box of this.boxes) {
      const fraction = segmentBoxFraction(start, end, box);
      if (fraction === null) continue;
      if (selected === null
        || fraction < selected.fraction - SEGMENT_EPSILON
        || (Math.abs(fraction - selected.fraction) <= SEGMENT_EPSILON
          && compareCodeUnits(box.id, selected.id) < 0)) {
        selected = Object.freeze({ id: box.id, fraction });
      }
    }
    if (!selected) {
      return Object.freeze({ blocked: false, colliderId: null, fractionPermille: null });
    }
    return Object.freeze({
      blocked: true,
      colliderId: selected.id,
      fractionPermille: Math.max(0, Math.min(1_000, Math.round(selected.fraction * 1_000))),
    });
  }
}
