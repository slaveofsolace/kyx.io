import {
  AUTHORITY_RATE_HZ,
  asMilliDegrees,
  asMillimeters,
  asMillimetersPerSecond,
  type SimulationRateHz,
} from '../units';
import type { CapsuleShapeMillimeters, MovementQuerySettings } from './queryPort';

export const MOVEMENT_PROFILE_SCHEMA_VERSION = 1 as const;

export interface MovementProfileProvenance {
  readonly evidenceLabel: 'HYPOTHESIS' | 'PRODUCT_OVERRIDE' | 'VERIFIED';
  readonly designReason: string;
}

export interface MovementProfileV1 {
  readonly schemaVersion: typeof MOVEMENT_PROFILE_SCHEMA_VERSION;
  readonly id: string;
  readonly revision: number;
  readonly implementationStatus: 'fixture_only' | 'playable';
  readonly provenance: MovementProfileProvenance;
  readonly simulationRateHz: SimulationRateHz;
  readonly standingShape: CapsuleShapeMillimeters;
  readonly crouchedShape: CapsuleShapeMillimeters;
  readonly query: MovementQuerySettings;
  readonly locomotion: {
    readonly walkSpeedMmPerSecond: number;
    readonly sprintSpeedMmPerSecond: number;
    readonly crouchSpeedMmPerSecond: number;
    readonly groundAccelerationMmPerSecondSquared: number;
    readonly reverseAccelerationMmPerSecondSquared: number;
    readonly groundBrakingMmPerSecondSquared: number;
    readonly airAccelerationMmPerSecondSquared: number;
    readonly airSpeedCapMmPerSecond: number;
    readonly gravityMmPerSecondSquared: number;
    readonly maximumFallSpeedMmPerSecond: number;
    readonly jumpImpulseMmPerSecond: number;
    readonly coyoteTicks: number;
    readonly jumpBufferTicks: number;
    readonly heldCommandReuseTicks: number;
  };
  readonly slide: {
    readonly minimumEntrySpeedMmPerSecond: number;
    readonly entryBoostMmPerSecond: number;
    readonly maximumSpeedMmPerSecond: number;
    readonly frictionMmPerSecondSquared: number;
    readonly steeringAccelerationMmPerSecondSquared: number;
    readonly durationTicks: number;
    readonly cooldownTicks: number;
  };
  readonly teleport: {
    readonly maximumRangeMm: number;
    readonly backwardSearchStepMm: number;
    readonly maximumBackwardSearchSteps: number;
    readonly cooldownTicks: number;
    readonly cooldownOnFailure: boolean;
    readonly retainPlanarVelocityPermille: number;
    readonly retainVerticalVelocityPermille: number;
    readonly requireGroundedDestination: boolean;
  };
}

/**
 * Provisional fixture profile. Every value is a measured starting hypothesis,
 * not an ev.io parity claim and not yet approved as playable content.
 */
export const PHASE3_HYPOTHESIS_MOVEMENT_PROFILE: MovementProfileV1 = Object.freeze({
  schemaVersion: MOVEMENT_PROFILE_SCHEMA_VERSION,
  id: 'phase3_hypothesis_v1',
  revision: 1,
  implementationStatus: 'fixture_only',
  provenance: Object.freeze({
    evidenceLabel: 'HYPOTHESIS',
    designReason: 'Initial 20 Hz controller envelope for deterministic fixture tuning.',
  }),
  simulationRateHz: AUTHORITY_RATE_HZ,
  standingShape: Object.freeze({
    height: asMillimeters(1_800),
    radius: asMillimeters(350),
  }),
  crouchedShape: Object.freeze({
    height: asMillimeters(1_100),
    radius: asMillimeters(350),
  }),
  query: Object.freeze({
    contactSkin: asMillimeters(20),
    maxStepHeight: asMillimeters(350),
    minimumStepWidth: asMillimeters(400),
    snapToGroundDistance: asMillimeters(150),
    maximumSlopeClimb: asMilliDegrees(45_000),
    minimumSlopeSlide: asMilliDegrees(30_000),
    allowDynamicBodyAutostep: false,
    maximumContacts: 8,
  }),
  locomotion: Object.freeze({
    walkSpeedMmPerSecond: asMillimetersPerSecond(7_000),
    sprintSpeedMmPerSecond: asMillimetersPerSecond(9_000),
    crouchSpeedMmPerSecond: asMillimetersPerSecond(3_500),
    // Real-adapter accel/brake tape: sprint reaches 90% in 3 ticks (150 ms),
    // inside the provisional 100-180 ms worksheet band.
    groundAccelerationMmPerSecondSquared: 60_000,
    reverseAccelerationMmPerSecondSquared: 60_000,
    groundBrakingMmPerSecondSquared: 40_000,
    airAccelerationMmPerSecondSquared: 16_000,
    airSpeedCapMmPerSecond: asMillimetersPerSecond(8_000),
    gravityMmPerSecondSquared: 20_000,
    maximumFallSpeedMmPerSecond: asMillimetersPerSecond(30_000),
    jumpImpulseMmPerSecond: asMillimetersPerSecond(11_000),
    coyoteTicks: 2,
    jumpBufferTicks: 2,
    heldCommandReuseTicks: 2,
  }),
  slide: Object.freeze({
    minimumEntrySpeedMmPerSecond: asMillimetersPerSecond(7_000),
    entryBoostMmPerSecond: asMillimetersPerSecond(500),
    maximumSpeedMmPerSecond: asMillimetersPerSecond(10_000),
    frictionMmPerSecondSquared: 8_000,
    steeringAccelerationMmPerSecondSquared: 6_000,
    durationTicks: 12,
    cooldownTicks: 8,
  }),
  teleport: Object.freeze({
    maximumRangeMm: 9_000,
    backwardSearchStepMm: 100,
    maximumBackwardSearchSteps: 90,
    cooldownTicks: 160,
    cooldownOnFailure: false,
    retainPlanarVelocityPermille: 1_000,
    retainVerticalVelocityPermille: 0,
    requireGroundedDestination: false,
  }),
});
