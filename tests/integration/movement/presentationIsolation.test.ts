import { describe, expect, it } from 'vitest';

import {
  DEFAULT_CAMERA_PRESENTATION_SETTINGS,
  FixedTickInputLatch,
  MOVEMENT_BUTTON_BITS,
  applyReducedMotionPreset,
  requireCameraPresentationSettings,
  type BrowserMovementInputSample,
  type CameraPresentationSettingsV1,
} from '../../../src/app/movement';
import {
  MOVEMENT_QUERY_SCHEMA_VERSION,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  asMillimeters,
  createMovementSimulationState,
  hashCanonicalMovementState,
  stepMovementSimulation,
  type CapsuleCastRequest,
  type CapsuleMoveRequest,
  type MovementQueryPort,
  type PlayerIntentCommand,
} from '../../../src/sim';

type RenderSchedule = readonly (readonly BrowserMovementInputSample[])[];

const COALESCED_RENDER_SCHEDULE: RenderSchedule = Object.freeze([
  Object.freeze([
    Object.freeze({
      held: Object.freeze(['moveForward', 'sprint'] as const),
      pressed: Object.freeze(['jump'] as const),
      released: Object.freeze(['jump'] as const),
      mouseDeltaX: 3,
      mouseDeltaY: -2,
      wheelDeltaY: 1,
    }),
  ]),
  Object.freeze([
    Object.freeze({
      held: Object.freeze(['moveRight'] as const),
      mouseDeltaX: -1,
      wheelDeltaY: -1,
    }),
  ]),
  Object.freeze([Object.freeze({ held: Object.freeze(['moveRight'] as const) })]),
]);

const PARTITIONED_RENDER_SCHEDULE: RenderSchedule = Object.freeze([
  Object.freeze([
    Object.freeze({ held: Object.freeze(['moveForward'] as const) }),
    Object.freeze({ pressed: Object.freeze(['sprint'] as const) }),
    Object.freeze({
      pressed: Object.freeze(['jump'] as const),
      mouseDeltaX: 1,
      mouseDeltaY: -1,
    }),
    Object.freeze({
      released: Object.freeze(['jump'] as const),
      mouseDeltaX: 2,
      mouseDeltaY: -1,
      wheelDeltaY: 1,
    }),
  ]),
  Object.freeze([
    Object.freeze({
      released: Object.freeze(['moveForward', 'sprint'] as const),
      pressed: Object.freeze(['moveRight'] as const),
      mouseDeltaX: -2,
    }),
    Object.freeze({ mouseDeltaX: 1, wheelDeltaY: -1 }),
  ]),
  Object.freeze([]),
]);

function commandStreamFor(schedule: RenderSchedule): readonly PlayerIntentCommand[] {
  const latch = new FixedTickInputLatch({
    lookMilliDegreesPerMouseUnit: 100,
  });
  return Object.freeze(
    schedule.map((renderSamples) => {
      for (const sample of renderSamples) latch.sample(sample);
      return latch.emitNextCommand();
    }),
  );
}

function createDeterministicFlatQueryPort(): MovementQueryPort {
  return Object.freeze({
    schemaVersion: MOVEMENT_QUERY_SCHEMA_VERSION,
    moveCapsule(request: CapsuleMoveRequest) {
      const proposedFeetY =
        request.feetPosition.y + request.desiredTranslation.y;
      const grounded = proposedFeetY <= 0;
      const appliedY = grounded
        ? request.feetPosition.y === 0
          ? 0
          : -request.feetPosition.y
        : request.desiredTranslation.y;
      return {
        appliedTranslation: {
          x: request.desiredTranslation.x,
          y: asMillimeters(appliedY),
          z: request.desiredTranslation.z,
        },
        grounded,
        hitCeiling: false,
        support: null,
        contacts: Object.freeze([]),
        shapeCasts: 0,
        overlapTests: 0,
      };
    },
    overlapCapsule() {
      return { blockingColliderIds: Object.freeze([]), overlapTests: 0 };
    },
    castCapsule(request: CapsuleCastRequest) {
      return {
        allowedTranslation: { ...request.translation },
        hit: null,
        shapeCasts: 0,
      };
    },
    volumesAtCapsule() {
      return { volumes: Object.freeze([]), overlapTests: 0 };
    },
  });
}

function runAuthority(
  commands: readonly PlayerIntentCommand[],
  presentationSettings: unknown,
) {
  requireCameraPresentationSettings(presentationSettings);
  let state = createMovementSimulationState(
    PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
    {
      rulesetId: 'presentation_isolation_ruleset',
      rulesetRevision: 1,
      rulesetHash: '5eb63bbbe01eeed0',
      fixtureId: 'deterministic_flat_fixture',
      fixtureHash: '0123456789abcdef',
      physicsAdapterId: 'deterministic_fake_query',
      physicsAdapterVersion: '1.0.0',
    },
  );
  const queries = createDeterministicFlatQueryPort();
  for (const command of commands) {
    state = stepMovementSimulation(
      state,
      [command],
      PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
      queries,
    ).state;
  }
  return Object.freeze({ state, hash: hashCanonicalMovementState(state) });
}

describe('movement presentation isolation', () => {
  it('produces one identical fixed-tick stream for equivalent render schedules', () => {
    const coalesced = commandStreamFor(COALESCED_RENDER_SCHEDULE);
    const partitioned = commandStreamFor(PARTITIONED_RENDER_SCHEDULE);

    expect(partitioned).toEqual(coalesced);
    expect(coalesced).toHaveLength(3);
    expect(coalesced[0]).toMatchObject({
      sequence: 0,
      clientTick: 0,
      moveX: 0,
      moveZ: 127,
      lookYawDeltaMilliDegrees: 300,
      lookPitchDeltaMilliDegrees: 200,
      heldButtons: MOVEMENT_BUTTON_BITS.sprint,
      pressedButtons: MOVEMENT_BUTTON_BITS.sprint | MOVEMENT_BUTTON_BITS.jump,
      releasedButtons: MOVEMENT_BUTTON_BITS.jump,
      selectedSlot: 1,
    });
    expect(coalesced[1]).toMatchObject({
      sequence: 1,
      clientTick: 1,
      moveX: 127,
      moveZ: 0,
      heldButtons: 0,
      pressedButtons: 0,
      releasedButtons: MOVEMENT_BUTTON_BITS.sprint,
      selectedSlot: 0,
    });
    expect(coalesced[2]).toMatchObject({
      sequence: 2,
      clientTick: 2,
      moveX: 127,
      moveZ: 0,
      pressedButtons: 0,
      releasedButtons: 0,
    });
  });

  it('keeps valid FOV and reduced-motion choices out of movement state and hash', () => {
    const commands = commandStreamFor(COALESCED_RENDER_SCHEDULE);
    const fullMotion: CameraPresentationSettingsV1 = Object.freeze({
      ...DEFAULT_CAMERA_PRESENTATION_SETTINGS,
      fovDegrees: 78,
    });
    const reducedMotion = applyReducedMotionPreset({
      ...DEFAULT_CAMERA_PRESENTATION_SETTINGS,
      fovDegrees: 110,
      mouseSensitivity: 1.75,
      adsSensitivityMultiplier: 0.6,
    });

    expect(reducedMotion).not.toEqual(fullMotion);
    const fullMotionAuthority = runAuthority(commands, fullMotion);
    const reducedMotionAuthority = runAuthority(commands, reducedMotion);

    expect(reducedMotionAuthority.state).toEqual(fullMotionAuthority.state);
    expect(reducedMotionAuthority.hash).toBe(fullMotionAuthority.hash);
  });
});
