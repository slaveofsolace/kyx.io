import {
  assertAuthoritySmokeField,
  type AuthoritySmokeFieldV1,
} from './abilityLoadoutRuntime';
import {
  validateWorldOcclusionResult,
  type AuthorityWorldOcclusionHitV1,
  type AuthorityWorldOcclusionPort,
  type AuthorityWorldOcclusionRayV1,
} from './rewindHitscan';

const MAXIMUM_SMOKE_FIELDS = 512;
const MAXIMUM_RAY_DISTANCE_MILLIMETERS = 200_000;
const UNIT_VECTOR_TOLERANCE = 0.000_001;

export interface AuthoritySmokeAwareHitscanOcclusionOptionsV1 {
  readonly schemaVersion: 1;
  readonly authorityTick: number;
  readonly smokeFields: readonly AuthoritySmokeFieldV1[];
  readonly worldOcclusion: AuthorityWorldOcclusionPort;
}

function miss(): AuthorityWorldOcclusionHitV1 {
  return Object.freeze({
    schemaVersion: 1,
    hit: false,
    distanceMillimeters: null,
    colliderId: null,
  });
}

function authorityTick(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('smoke occlusion authority tick must be a non-negative safe integer');
  }
  return value;
}

function finite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
}

function assertRay(ray: AuthorityWorldOcclusionRayV1): AuthorityWorldOcclusionRayV1 {
  if (ray.schemaVersion !== 1 || ray.layer !== 'authoritative_world') {
    throw new RangeError('smoke occlusion ray identity is unsupported');
  }
  if (ray.purpose !== 'barrel_clearance' && ray.purpose !== 'shot_path') {
    throw new RangeError('smoke occlusion ray purpose is unsupported');
  }
  if (
    !Number.isFinite(ray.maximumDistanceMillimeters)
    || ray.maximumDistanceMillimeters <= 0
    || ray.maximumDistanceMillimeters > MAXIMUM_RAY_DISTANCE_MILLIMETERS
  ) {
    throw new RangeError('smoke occlusion ray distance is unsupported');
  }
  finite(ray.originMillimeters.x, 'smoke occlusion ray origin.x');
  finite(ray.originMillimeters.y, 'smoke occlusion ray origin.y');
  finite(ray.originMillimeters.z, 'smoke occlusion ray origin.z');
  finite(ray.directionUnit.x, 'smoke occlusion ray direction.x');
  finite(ray.directionUnit.y, 'smoke occlusion ray direction.y');
  finite(ray.directionUnit.z, 'smoke occlusion ray direction.z');
  const magnitude = Math.hypot(
    ray.directionUnit.x,
    ray.directionUnit.y,
    ray.directionUnit.z,
  );
  if (Math.abs(magnitude - 1) > UNIT_VECTOR_TOLERANCE) {
    throw new RangeError('smoke occlusion ray direction must be unit length');
  }
  return ray;
}

function snapshotFields(
  fields: readonly AuthoritySmokeFieldV1[],
): readonly AuthoritySmokeFieldV1[] {
  if (!Array.isArray(fields) || fields.length > MAXIMUM_SMOKE_FIELDS) {
    throw new RangeError('smoke occlusion fields must be a bounded array');
  }
  const ordered = fields.map((field) => {
    const validated = assertAuthoritySmokeField(field);
    finite(validated.centerMillimeters.x, 'smoke field center.x');
    finite(validated.centerMillimeters.y, 'smoke field center.y');
    finite(validated.centerMillimeters.z, 'smoke field center.z');
    return Object.freeze({
      ...validated,
      centerMillimeters: Object.freeze({ ...validated.centerMillimeters }),
    });
  }).sort((left, right) => left.fieldId.localeCompare(right.fieldId));
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1]?.fieldId === ordered[index]?.fieldId) {
      throw new RangeError('smoke occlusion field IDs must be unique');
    }
  }
  return Object.freeze(ordered);
}

function raySphereDistance(
  ray: AuthorityWorldOcclusionRayV1,
  field: AuthoritySmokeFieldV1,
): number | null {
  const offsetX = ray.originMillimeters.x - field.centerMillimeters.x;
  const offsetY = ray.originMillimeters.y - field.centerMillimeters.y;
  const offsetZ = ray.originMillimeters.z - field.centerMillimeters.z;
  const projection = offsetX * ray.directionUnit.x
    + offsetY * ray.directionUnit.y
    + offsetZ * ray.directionUnit.z;
  const radiusSquared = field.radiusMillimeters * field.radiusMillimeters;
  const originDistanceSquared = offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ;
  if (originDistanceSquared <= radiusSquared) return 0;
  const discriminant = projection * projection - (originDistanceSquared - radiusSquared);
  if (discriminant < 0) return null;
  const squareRoot = Math.sqrt(discriminant);
  const exitDistance = -projection + squareRoot;
  if (exitDistance < 0) return null;
  const entryDistance = -projection - squareRoot;
  return entryDistance <= ray.maximumDistanceMillimeters ? entryDistance : null;
}

function resolveValidatedSmokeRayOcclusion(
  ray: AuthorityWorldOcclusionRayV1,
  tick: number,
  fields: readonly AuthoritySmokeFieldV1[],
): AuthorityWorldOcclusionHitV1 {
  if (ray.purpose === 'barrel_clearance') return miss();
  let nearest: { readonly fieldId: string; readonly distance: number } | null = null;
  for (const field of fields) {
    if (field.spawnedAtTick > tick || field.expiresAtTick <= tick) continue;
    const distance = raySphereDistance(ray, field);
    if (
      distance !== null
      && (
        nearest === null
        || distance < nearest.distance
        || (distance === nearest.distance && field.fieldId < nearest.fieldId)
      )
    ) {
      nearest = { fieldId: field.fieldId, distance };
    }
  }
  if (nearest === null) return miss();
  return Object.freeze({
    schemaVersion: 1,
    hit: true,
    distanceMillimeters: nearest.distance,
    colliderId: nearest.fieldId,
  });
}

/**
 * Resolves the nearest active smoke-volume entry on an authority shot ray.
 *
 * Smoke intentionally does not participate in the eye-to-muzzle barrel query:
 * it is visibility cover, not solid weapon geometry. A shot path beginning
 * inside smoke is immediately obscured at distance zero.
 */
export function resolveAuthoritySmokeRayOcclusion(
  rayValue: AuthorityWorldOcclusionRayV1,
  tickValue: number,
  fieldValues: readonly AuthoritySmokeFieldV1[],
): AuthorityWorldOcclusionHitV1 {
  const ray = assertRay(rayValue);
  const tick = authorityTick(tickValue);
  const fields = snapshotFields(fieldValues);
  return resolveValidatedSmokeRayOcclusion(ray, tick, fields);
}

/**
 * Captures one immutable smoke-field snapshot and composes it with the physical
 * world port. Physical geometry wins an exact-distance tie; otherwise the
 * nearest blocker is returned through the existing fail-closed hitscan shape.
 */
export function createAuthoritySmokeAwareHitscanOcclusionPort(
  options: AuthoritySmokeAwareHitscanOcclusionOptionsV1,
): AuthorityWorldOcclusionPort {
  if (options.schemaVersion !== 1) {
    throw new RangeError('smoke-aware hitscan occlusion schema is unsupported');
  }
  if (typeof options.worldOcclusion !== 'function') {
    throw new TypeError('smoke-aware hitscan requires a world occlusion port');
  }
  const tick = authorityTick(options.authorityTick);
  const fields = snapshotFields(options.smokeFields);
  const worldOcclusion = options.worldOcclusion;
  return Object.freeze((rayValue: AuthorityWorldOcclusionRayV1) => {
    const ray = assertRay(rayValue);
    const world = validateWorldOcclusionResult(
      worldOcclusion(ray),
      ray.maximumDistanceMillimeters,
    );
    const smoke = resolveValidatedSmokeRayOcclusion(ray, tick, fields);
    if (!smoke.hit) return Object.freeze({ ...world });
    if (!world.hit) return smoke;
    if (
      world.distanceMillimeters === null
      || smoke.distanceMillimeters === null
      || world.distanceMillimeters <= smoke.distanceMillimeters
    ) {
      return Object.freeze({ ...world });
    }
    return smoke;
  });
}
