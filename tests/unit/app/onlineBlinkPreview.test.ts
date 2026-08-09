import { describe, expect, it } from 'vitest';

import {
  isOnlineBlinkPreviewCommitEligible,
  resolveOnlineBlinkPreview,
} from '../../../src/app/onlineBlinkPreview';
import {
  authorityCameraYawRadians,
  directionFromAuthorityLook,
} from '../../../src/app/onlineAuthorityThreeRuntime';
import {
  CONTACT_NORMAL_Q15_SCALE,
  INTENT_BUTTON,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  stepMovementSimulation,
  type MovementProfileV1,
} from '../../../src/sim';
import {
  FakeMovementQueryPort,
  createTestMovementState,
  millimeterVector,
  testIntent,
  type FakeMovementQueryOptions,
} from '../sim/movement/fakeQueryPort';

const PROFILE = PHASE3_HYPOTHESIS_MOVEMENT_PROFILE;

function previewRequest(
  overrides: Partial<Parameters<typeof resolveOnlineBlinkPreview>[0]> = {},
): Parameters<typeof resolveOnlineBlinkPreview>[0] {
  return {
    active: true,
    feetPosition: millimeterVector(0, 0, 0),
    yawMilliDegrees: 0,
    pitchMilliDegrees: 0,
    stance: 'standing',
    cooldownTicksRemaining: 0,
    ...overrides,
  };
}

function authorityTeleport(
  options: FakeMovementQueryOptions,
  profile: MovementProfileV1 = PROFILE,
) {
  const result = stepMovementSimulation(
    createTestMovementState({}, profile),
    [testIntent(0, 0, {
      pressedButtons: INTENT_BUTTON.utility,
    })],
    profile,
    new FakeMovementQueryPort(options),
  );
  return result.events.find((event) => (
    event.kind === 'teleport_succeeded'
    || event.kind === 'teleport_rejected'
  ));
}

describe('online authoritative Blink preview', () => {
  it('keeps the Three camera and authority teleport look basis aligned', () => {
    expect(authorityCameraYawRadians(0)).toBeCloseTo(0, 8);
    expect(directionFromAuthorityLook(0, 0).toArray()).toEqual([0, 0, -1]);
    const right = directionFromAuthorityLook(90_000, 0);
    expect(right.x).toBeCloseTo(1, 8);
    expect(right.y).toBeCloseTo(0, 8);
    expect(right.z).toBeCloseTo(0, 8);
    const pitched = directionFromAuthorityLook(0, 45_000);
    expect(pitched.x).toBeCloseTo(0, 8);
    expect(pitched.y).toBeCloseTo(Math.SQRT1_2, 8);
    expect(pitched.z).toBeCloseTo(-Math.SQRT1_2, 8);
  });

  it('matches the authority full-range destination from the same query contract', () => {
    const preview = resolveOnlineBlinkPreview(
      previewRequest(),
      PROFILE,
      new FakeMovementQueryPort(),
    );
    const authority = authorityTeleport({});

    expect(preview).toMatchObject({
      active: true,
      valid: true,
      authorityBound: true,
      reason: 'ready',
      outcome: 'full',
      maximumRangeMillimeters: 9_000,
      distanceMillimeters: 9_000,
      intentYawMilliDegrees: 0,
      intentPitchMilliDegrees: 0,
      destinationFeetMillimeters: millimeterVector(0, 0, 9_000),
    });
    expect(authority).toMatchObject({
      kind: 'teleport_succeeded',
      outcome: preview.outcome,
      to: preview.destinationFeetMillimeters,
    });
    expect(isOnlineBlinkPreviewCommitEligible(preview, {
      yawMilliDegrees: 0,
      pitchMilliDegrees: 0,
    })).toBe(true);
    expect(isOnlineBlinkPreviewCommitEligible(preview, {
      yawMilliDegrees: 1,
      pitchMilliDegrees: 0,
    })).toBe(false);
  });

  it('matches authority collision clamping and backward occupancy search', () => {
    const options: FakeMovementQueryOptions = {
      cast: () => ({
        allowedTranslation: millimeterVector(0, 0, 4_000),
        hit: {
          colliderId: 'bridge_wall',
          layer: 'world_static',
          normalQ15: { x: 0, y: 0, z: -CONTACT_NORMAL_Q15_SCALE },
          timeOfImpactPermille: 450,
        },
        shapeCasts: 1,
      }),
      overlap: ({ feetPosition }) => (
        feetPosition.z > 3_600 ? ['landing_obstruction'] : []
      ),
    };
    const preview = resolveOnlineBlinkPreview(
      previewRequest(),
      PROFILE,
      new FakeMovementQueryPort(options),
    );
    const authority = authorityTeleport(options);

    expect(preview).toMatchObject({
      valid: true,
      outcome: 'partial',
      destinationFeetMillimeters: millimeterVector(0, 0, 3_600),
    });
    expect(authority).toMatchObject({
      kind: 'teleport_succeeded',
      outcome: preview.outcome,
      to: preview.destinationFeetMillimeters,
    });
  });

  it('matches authority forbidden-volume rejection without inventing a landing', () => {
    const profile: MovementProfileV1 = {
      ...PROFILE,
      teleport: {
        ...PROFILE.teleport,
        maximumRangeMm: 1_000,
        backwardSearchStepMm: 400,
        maximumBackwardSearchSteps: 2,
      },
    };
    const options: FakeMovementQueryOptions = {
      volumes: ({ feetPosition }) => feetPosition.z > 0
        ? [{ colliderId: 'no_blink_zone', kind: 'forbidden' }]
        : [],
    };
    const preview = resolveOnlineBlinkPreview(
      previewRequest(),
      profile,
      new FakeMovementQueryPort(options),
    );
    const authority = authorityTeleport(options, profile);

    expect(preview).toMatchObject({
      valid: false,
      reason: 'forbidden_volume',
      outcome: null,
      distanceMillimeters: 0,
      destinationFeetMillimeters: millimeterVector(0, 0, 0),
    });
    expect(authority).toMatchObject({
      kind: 'teleport_rejected',
      reason: preview.reason,
    });
  });

  it('does not query or advertise a destination while cooldown is active', () => {
    const queries = new FakeMovementQueryPort();
    const preview = resolveOnlineBlinkPreview(
      previewRequest({ cooldownTicksRemaining: 12 }),
      PROFILE,
      queries,
    );

    expect(preview).toMatchObject({
      active: true,
      valid: false,
      reason: 'cooldown',
      outcome: null,
    });
    expect(queries.castRequests).toHaveLength(0);
    expect(queries.overlapRequests).toHaveLength(0);
    expect(isOnlineBlinkPreviewCommitEligible(preview)).toBe(false);
  });
});
