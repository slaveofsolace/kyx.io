import type {
  FixtureVector3Millimeters,
  PhysicsFixtureV1,
} from '../../physics';
import { FixtureAuthorityLineOfSight } from './fixtureLineOfSight';

const PROBE_ABOVE_FEET_MM = 150;
const PROBE_BELOW_FEET_MM = 300;
const MAX_SUPPORT_GAP_MM = 75;
const MAX_SURFACE_ABOVE_FEET_MM = 20;
const PROBE_LENGTH_MM = PROBE_ABOVE_FEET_MM + PROBE_BELOW_FEET_MM;

export interface AuthoritySpawnSupportResult {
  readonly supported: boolean;
  readonly colliderId: string | null;
  /** Positive when the surface is below the authored feet position. */
  readonly supportGapMm: number | null;
}

/**
 * Proves that an authored spawn is standing on accepted authority collision.
 *
 * Bounds and capsule-clear checks cannot distinguish a real platform from
 * empty space inside the arena envelope. This probe uses only world-static
 * authority boxes and rejects both floating and materially buried spawns.
 */
export class FixtureAuthoritySpawnSupport {
  private readonly surfaceTrace: FixtureAuthorityLineOfSight;

  constructor(fixture: PhysicsFixtureV1) {
    const supportSolids = Object.freeze(fixture.solids.filter(
      (solid) => solid.layer === 'world_static',
    ));
    this.surfaceTrace = new FixtureAuthorityLineOfSight(Object.freeze({
      ...fixture,
      solids: supportSolids,
    }));
  }

  probe(feetPositionMm: FixtureVector3Millimeters): AuthoritySpawnSupportResult {
    const trace = this.surfaceTrace.trace(
      Object.freeze({
        x: feetPositionMm.x,
        y: feetPositionMm.y + PROBE_ABOVE_FEET_MM,
        z: feetPositionMm.z,
      }),
      Object.freeze({
        x: feetPositionMm.x,
        y: feetPositionMm.y - PROBE_BELOW_FEET_MM,
        z: feetPositionMm.z,
      }),
    );
    if (!trace.blocked || trace.fractionPermille === null) {
      return Object.freeze({ supported: false, colliderId: null, supportGapMm: null });
    }

    const distanceFromProbeStartMm = Math.round(
      (PROBE_LENGTH_MM * trace.fractionPermille) / 1_000,
    );
    const surfaceOffsetFromFeetMm = PROBE_ABOVE_FEET_MM - distanceFromProbeStartMm;
    const rawSupportGapMm = -surfaceOffsetFromFeetMm;
    const supportGapMm = Object.is(rawSupportGapMm, -0) ? 0 : rawSupportGapMm;
    const supported = surfaceOffsetFromFeetMm <= MAX_SURFACE_ABOVE_FEET_MM
      && supportGapMm <= MAX_SUPPORT_GAP_MM;
    return Object.freeze({
      supported,
      colliderId: trace.colliderId,
      supportGapMm,
    });
  }
}

export const AUTHORITY_SPAWN_SUPPORT_CONTRACT = Object.freeze({
  probeAboveFeetMm: PROBE_ABOVE_FEET_MM,
  probeBelowFeetMm: PROBE_BELOW_FEET_MM,
  maximumSupportGapMm: MAX_SUPPORT_GAP_MM,
  maximumSurfaceAboveFeetMm: MAX_SURFACE_ABOVE_FEET_MM,
  collisionLayer: 'world_static' as const,
});
