import type { MovementProfileV1 } from './profile';
import { hashMovementString } from './hash';

function assertIdentifier(value: string, label: string): void {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 96
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(value)
  ) {
    throw new RangeError(`${label} must be a safe 1-96 character identifier`);
  }
}

function assertIntegerRange(value: number, minimum: number, maximum: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
}

export function assertMovementProfile(profile: MovementProfileV1): void {
  if (profile.schemaVersion !== 1) throw new RangeError('unsupported movement profile schema');
  assertIdentifier(profile.id, 'movement profile id');
  assertIntegerRange(profile.revision, 1, 65_535, 'movement profile revision');
  if (profile.implementationStatus !== 'fixture_only' && profile.implementationStatus !== 'playable') {
    throw new RangeError('unsupported movement implementation status');
  }
  if (!['HYPOTHESIS', 'PRODUCT_OVERRIDE', 'VERIFIED'].includes(profile.provenance.evidenceLabel)) {
    throw new RangeError('unsupported movement profile evidence label');
  }
  if (profile.provenance.designReason.length < 1 || profile.provenance.designReason.length > 512) {
    throw new RangeError('movement profile design reason must contain 1-512 characters');
  }
  if (profile.simulationRateHz !== 20) {
    throw new RangeError('movement authority profile must run at 20 Hz');
  }

  for (const [label, shape] of [
    ['standing shape', profile.standingShape],
    ['crouched shape', profile.crouchedShape],
  ] as const) {
    assertIntegerRange(shape.radius, 1, 10_000, `${label} radius`);
    assertIntegerRange(shape.height, shape.radius * 2, 20_000, `${label} height`);
  }
  if (profile.standingShape.radius !== profile.crouchedShape.radius) {
    throw new RangeError('standing and crouched shapes must share one radius');
  }
  if (profile.crouchedShape.height >= profile.standingShape.height) {
    throw new RangeError('crouched shape must be shorter than standing shape');
  }

  const query = profile.query;
  assertIntegerRange(query.contactSkin, 0, 1_000, 'contact skin');
  assertIntegerRange(query.maxStepHeight, 0, 5_000, 'maximum step height');
  assertIntegerRange(query.minimumStepWidth, 0, 10_000, 'minimum step width');
  assertIntegerRange(query.snapToGroundDistance, 0, 5_000, 'snap-to-ground distance');
  assertIntegerRange(query.maximumSlopeClimb, 0, 89_999, 'maximum slope climb');
  assertIntegerRange(query.minimumSlopeSlide, 0, 89_999, 'minimum slope slide');
  assertIntegerRange(query.maximumContacts, 1, 32, 'maximum contacts');

  const locomotion = profile.locomotion;
  for (const [label, value] of [
    ['walk speed', locomotion.walkSpeedMmPerSecond],
    ['sprint speed', locomotion.sprintSpeedMmPerSecond],
    ['crouch speed', locomotion.crouchSpeedMmPerSecond],
    ['ground acceleration', locomotion.groundAccelerationMmPerSecondSquared],
    ['reverse acceleration', locomotion.reverseAccelerationMmPerSecondSquared],
    ['ground braking', locomotion.groundBrakingMmPerSecondSquared],
    ['air acceleration', locomotion.airAccelerationMmPerSecondSquared],
    ['air speed cap', locomotion.airSpeedCapMmPerSecond],
    ['gravity', locomotion.gravityMmPerSecondSquared],
    ['maximum fall speed', locomotion.maximumFallSpeedMmPerSecond],
    ['jump impulse', locomotion.jumpImpulseMmPerSecond],
  ] as const) {
    assertIntegerRange(value, 0, 1_000_000, label);
  }
  if (locomotion.sprintSpeedMmPerSecond < locomotion.walkSpeedMmPerSecond) {
    throw new RangeError('sprint speed cannot be lower than walk speed');
  }
  if (locomotion.crouchSpeedMmPerSecond > locomotion.walkSpeedMmPerSecond) {
    throw new RangeError('crouch speed cannot exceed walk speed');
  }
  for (const [label, value] of [
    ['coyote ticks', locomotion.coyoteTicks],
    ['jump buffer ticks', locomotion.jumpBufferTicks],
    ['held command reuse ticks', locomotion.heldCommandReuseTicks],
  ] as const) {
    assertIntegerRange(value, 0, 20, label);
  }

  const slide = profile.slide;
  for (const [label, value] of [
    ['slide minimum entry speed', slide.minimumEntrySpeedMmPerSecond],
    ['slide entry boost', slide.entryBoostMmPerSecond],
    ['slide maximum speed', slide.maximumSpeedMmPerSecond],
    ['slide friction', slide.frictionMmPerSecondSquared],
    ['slide steering acceleration', slide.steeringAccelerationMmPerSecondSquared],
  ] as const) {
    assertIntegerRange(value, 0, 1_000_000, label);
  }
  assertIntegerRange(slide.durationTicks, 1, 200, 'slide duration ticks');
  assertIntegerRange(slide.cooldownTicks, 0, 1_000, 'slide cooldown ticks');
  if (slide.maximumSpeedMmPerSecond < slide.minimumEntrySpeedMmPerSecond) {
    throw new RangeError('slide maximum speed cannot be below its entry threshold');
  }

  const teleport = profile.teleport;
  assertIntegerRange(teleport.maximumRangeMm, 1, 1_000_000, 'teleport range');
  assertIntegerRange(teleport.backwardSearchStepMm, 1, teleport.maximumRangeMm, 'teleport search step');
  assertIntegerRange(teleport.maximumBackwardSearchSteps, 0, 1_000, 'teleport search steps');
  assertIntegerRange(teleport.cooldownTicks, 0, 100_000, 'teleport cooldown ticks');
  assertIntegerRange(teleport.retainPlanarVelocityPermille, 0, 1_000, 'teleport planar retention');
  assertIntegerRange(teleport.retainVerticalVelocityPermille, 0, 1_000, 'teleport vertical retention');
}

function canonicalMovementProfileValue(profile: MovementProfileV1): unknown {
  return {
    schemaVersion: profile.schemaVersion,
    id: profile.id,
    revision: profile.revision,
    implementationStatus: profile.implementationStatus,
    provenance: {
      evidenceLabel: profile.provenance.evidenceLabel,
      designReason: profile.provenance.designReason,
    },
    simulationRateHz: profile.simulationRateHz,
    standingShape: { height: profile.standingShape.height, radius: profile.standingShape.radius },
    crouchedShape: { height: profile.crouchedShape.height, radius: profile.crouchedShape.radius },
    query: {
      contactSkin: profile.query.contactSkin,
      maxStepHeight: profile.query.maxStepHeight,
      minimumStepWidth: profile.query.minimumStepWidth,
      snapToGroundDistance: profile.query.snapToGroundDistance,
      maximumSlopeClimb: profile.query.maximumSlopeClimb,
      minimumSlopeSlide: profile.query.minimumSlopeSlide,
      allowDynamicBodyAutostep: profile.query.allowDynamicBodyAutostep,
      maximumContacts: profile.query.maximumContacts,
    },
    locomotion: { ...profile.locomotion },
    slide: { ...profile.slide },
    teleport: { ...profile.teleport },
  };
}

export function serializeMovementProfile(profile: MovementProfileV1): string {
  assertMovementProfile(profile);
  return JSON.stringify(canonicalMovementProfileValue(profile));
}

export function hashMovementProfile(profile: MovementProfileV1): string {
  return hashMovementString(serializeMovementProfile(profile));
}

