import {
  asMillimeters,
  integerSquareRootFloor,
  lookDirectionQ15,
  scaleQ15,
  type MovementProfileV1,
  type MovementQueryPort,
  type MovementStance,
  type Vector3Millimeters,
} from '../sim';

const SOLID_MOVEMENT_LAYERS = Object.freeze([
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
] as const);

export type OnlineBlinkPreviewReason =
  | 'ready'
  | 'cooldown'
  | 'blocked'
  | 'forbidden_volume'
  | 'kill_volume'
  | 'no_ground';

export interface OnlineBlinkPreview {
  readonly schemaVersion: 1;
  readonly active: boolean;
  readonly valid: boolean;
  readonly authorityBound: true;
  readonly reason: OnlineBlinkPreviewReason;
  readonly outcome: 'full' | 'partial' | null;
  readonly maximumRangeMillimeters: number;
  readonly distanceMillimeters: number;
  readonly intentYawMilliDegrees: number;
  readonly intentPitchMilliDegrees: number;
  readonly originFeetMillimeters: Vector3Millimeters;
  readonly destinationFeetMillimeters: Vector3Millimeters;
}

/**
 * The release edge submits the current authoritative look intent only when the
 * held preview represents an eligible authority-bound destination. The Worker
 * still recomputes and owns the final target, cost and cooldown.
 */
export function isOnlineBlinkPreviewCommitEligible(
  preview: OnlineBlinkPreview | null,
  expectedIntent?: Readonly<{
    yawMilliDegrees: number;
    pitchMilliDegrees: number;
  }>,
): preview is OnlineBlinkPreview & { readonly valid: true } {
  return preview !== null
    && preview.active === true
    && preview.authorityBound === true
    && preview.valid === true
    && preview.reason === 'ready'
    && (preview.outcome === 'full' || preview.outcome === 'partial')
    && Number.isFinite(preview.maximumRangeMillimeters)
    && Number.isFinite(preview.distanceMillimeters)
    && preview.distanceMillimeters >= 0
    && preview.distanceMillimeters <= preview.maximumRangeMillimeters
    && (
      expectedIntent === undefined
      || (
        preview.intentYawMilliDegrees === expectedIntent.yawMilliDegrees
        && preview.intentPitchMilliDegrees === expectedIntent.pitchMilliDegrees
      )
    );
}

export interface ResolveOnlineBlinkPreviewRequest {
  readonly active: boolean;
  readonly feetPosition: Readonly<{ x: number; y: number; z: number }>;
  readonly yawMilliDegrees: number;
  readonly pitchMilliDegrees: number;
  readonly stance: MovementStance;
  readonly cooldownTicksRemaining: number;
}

function vectorLength(value: Readonly<{ x: number; y: number; z: number }>): number {
  return integerSquareRootFloor(
    value.x * value.x + value.y * value.y + value.z * value.z,
  );
}

function position(
  value: Readonly<{ x: number; y: number; z: number }>,
): Vector3Millimeters {
  return Object.freeze({
    x: asMillimeters(value.x),
    y: asMillimeters(value.y),
    z: asMillimeters(value.z),
  });
}

function result(
  request: ResolveOnlineBlinkPreviewRequest,
  profile: MovementProfileV1,
  values: Readonly<{
    valid: boolean;
    reason: OnlineBlinkPreviewReason;
    outcome: OnlineBlinkPreview['outcome'];
    destination: Vector3Millimeters;
  }>,
): OnlineBlinkPreview {
  const origin = position(request.feetPosition);
  return Object.freeze({
    schemaVersion: 1,
    active: request.active,
    valid: values.valid,
    authorityBound: true,
    reason: values.reason,
    outcome: values.outcome,
    maximumRangeMillimeters: profile.teleport.maximumRangeMm,
    distanceMillimeters: vectorLength({
      x: values.destination.x - origin.x,
      y: values.destination.y - origin.y,
      z: values.destination.z - origin.z,
    }),
    intentYawMilliDegrees: request.yawMilliDegrees,
    intentPitchMilliDegrees: request.pitchMilliDegrees,
    originFeetMillimeters: origin,
    destinationFeetMillimeters: position(values.destination),
  });
}

/**
 * Mirrors the deterministic authority teleport query sequence against the
 * client's hash-locked Rapier fixture. It predicts presentation only: the
 * server still owns the Q press, final movement, cooldown, and confirmation.
 */
export function resolveOnlineBlinkPreview(
  request: ResolveOnlineBlinkPreviewRequest,
  profile: MovementProfileV1,
  queries: MovementQueryPort,
): OnlineBlinkPreview {
  const origin = position(request.feetPosition);
  if (!request.active) {
    return result(request, profile, {
      valid: false,
      reason: 'blocked',
      outcome: null,
      destination: origin,
    });
  }
  if (request.cooldownTicksRemaining > 0) {
    return result(request, profile, {
      valid: false,
      reason: 'cooldown',
      outcome: null,
      destination: origin,
    });
  }

  const shape = request.stance === 'standing'
    ? profile.standingShape
    : profile.crouchedShape;
  const direction = lookDirectionQ15(
    request.yawMilliDegrees,
    request.pitchMilliDegrees,
  );
  const cast = queries.castCapsule({
    feetPosition: origin,
    shape,
    translation: {
      x: asMillimeters(scaleQ15(direction.x, profile.teleport.maximumRangeMm)),
      y: asMillimeters(scaleQ15(direction.y, profile.teleport.maximumRangeMm)),
      z: asMillimeters(scaleQ15(direction.z, profile.teleport.maximumRangeMm)),
    },
    contactSkin: profile.query.contactSkin,
    solidLayers: SOLID_MOVEMENT_LAYERS,
  });
  const allowedDistance = vectorLength(cast.allowedTranslation);
  let rejectionReason: OnlineBlinkPreviewReason = 'blocked';

  for (
    let searchIndex = 0;
    searchIndex <= profile.teleport.maximumBackwardSearchSteps;
    searchIndex += 1
  ) {
    const distance = Math.max(
      0,
      allowedDistance - searchIndex * profile.teleport.backwardSearchStepMm,
    );
    if (distance <= profile.query.contactSkin) break;
    const translation = searchIndex === 0
      ? cast.allowedTranslation
      : {
          x: asMillimeters(scaleQ15(direction.x, distance)),
          y: asMillimeters(scaleQ15(direction.y, distance)),
          z: asMillimeters(scaleQ15(direction.z, distance)),
        };
    let candidate = position({
      x: origin.x + translation.x,
      y: origin.y + translation.y,
      z: origin.z + translation.z,
    });
    if (queries.overlapCapsule({
      feetPosition: candidate,
      shape,
      solidLayers: SOLID_MOVEMENT_LAYERS,
    }).blockingColliderIds.length > 0) continue;

    const groundProbe = queries.moveCapsule({
      feetPosition: candidate,
      shape,
      desiredTranslation: {
        x: asMillimeters(0),
        y: asMillimeters(0),
        z: asMillimeters(0),
      },
      settings: profile.query,
      solidLayers: SOLID_MOVEMENT_LAYERS,
    });
    candidate = position({
      x: candidate.x + groundProbe.appliedTranslation.x,
      y: candidate.y + groundProbe.appliedTranslation.y,
      z: candidate.z + groundProbe.appliedTranslation.z,
    });
    if (profile.teleport.requireGroundedDestination && !groundProbe.grounded) {
      rejectionReason = 'no_ground';
      continue;
    }

    const volumes = queries.volumesAtCapsule({
      feetPosition: candidate,
      shape,
    }).volumes;
    if (volumes.some(({ kind }) => kind === 'kill')) {
      rejectionReason = 'kill_volume';
      continue;
    }
    if (volumes.some(({ kind }) => kind === 'forbidden')) {
      rejectionReason = 'forbidden_volume';
      continue;
    }
    const full = cast.hit === null
      && searchIndex === 0
      && distance >= profile.teleport.maximumRangeMm - profile.query.contactSkin;
    return result(request, profile, {
      valid: true,
      reason: 'ready',
      outcome: full ? 'full' : 'partial',
      destination: candidate,
    });
  }

  return result(request, profile, {
    valid: false,
    reason: rejectionReason,
    outcome: null,
    destination: origin,
  });
}
