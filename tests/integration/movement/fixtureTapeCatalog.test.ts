import { describe, expect, it } from 'vitest';

import {
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  asMillimeters,
  asSimulationTick,
  runMovementReplay,
  ticksToMilliseconds,
  type MovementQueryPort,
  type MovementReplayResult,
} from '../../../src/sim';
import {
  PHYSICS_FIXTURE_TAPE_IDS,
  createRapierMovementWorld,
  assertPhysicsFixtureTapeResult,
  getPhysicsFixture,
  getPhysicsFixtureTape,
  preparePhysicsFixtureTape,
  type PhysicsFixtureTapeId,
} from '../../../src/physics';
import {
  boxSolid,
  boxVolume,
  capsuleSolid,
  fixture,
} from '../../../src/physics/fixtures/primitives';

const PROFILE = PHASE3_HYPOTHESIS_MOVEMENT_PROFILE;
const SOLID_LAYERS = Object.freeze([
  'world_static',
  'dynamic_platform',
  'player_body',
  'door',
  'spawn_barrier',
] as const);

interface MoveTrace {
  readonly requestedTranslation: { readonly x: number; readonly y: number; readonly z: number };
  readonly appliedTranslation: { readonly x: number; readonly y: number; readonly z: number };
  readonly grounded: boolean;
  readonly supportColliderId: string | null;
  readonly contacts: readonly { readonly colliderId: string }[];
  readonly requestUnchanged: boolean;
}

interface QueryOrderTrace {
  readonly moves: readonly MoveTrace[];
  readonly overlaps: readonly (readonly string[])[];
  readonly casts: readonly unknown[];
  readonly volumes: readonly (readonly string[])[];
}

interface InstrumentedTapeRun {
  readonly result: MovementReplayResult;
  readonly queryOrder: QueryOrderTrace;
  readonly sampleOverlaps: readonly (readonly string[])[];
}

async function runInstrumentedTape(id: PhysicsFixtureTapeId): Promise<InstrumentedTapeRun> {
  const prepared = preparePhysicsFixtureTape(id);
  const fixture = getPhysicsFixture(prepared.tape.identity.fixtureId as Parameters<
    typeof getPhysicsFixture
  >[0]);
  const world = await createRapierMovementWorld(fixture);
  const moves: MoveTrace[] = [];
  const overlaps: string[][] = [];
  const casts: unknown[] = [];
  const volumes: string[][] = [];
  const queries: MovementQueryPort = {
    schemaVersion: world.schemaVersion,
    moveCapsule(request) {
      const requestBefore = JSON.stringify(request);
      const response = world.moveCapsule(request);
      moves.push({
        requestedTranslation: { ...request.desiredTranslation },
        appliedTranslation: { ...response.appliedTranslation },
        grounded: response.grounded,
        supportColliderId: response.support?.colliderId ?? null,
        contacts: response.contacts.map((contact) => ({ ...contact })),
        requestUnchanged: JSON.stringify(request) === requestBefore,
      });
      return response;
    },
    overlapCapsule(request) {
      const response = world.overlapCapsule(request);
      overlaps.push([...response.blockingColliderIds]);
      return response;
    },
    castCapsule(request) {
      const response = world.castCapsule(request);
      casts.push(response.hit === null ? null : { ...response.hit });
      return response;
    },
    volumesAtCapsule(request) {
      const response = world.volumesAtCapsule(request);
      volumes.push(response.volumes.map((volume) => volume.colliderId));
      return response;
    },
  };

  try {
    const result = runMovementReplay(
      prepared.initialState,
      prepared.replay,
      PROFILE,
      queries,
    );
    const sampleOverlaps = result.envelope.samples.map((sample) => (
      world.overlapCapsule({
        feetPosition: sample.feetPosition,
        shape: sample.stance === 'standing' ? PROFILE.standingShape : PROFILE.crouchedShape,
        solidLayers: SOLID_LAYERS,
      }).blockingColliderIds
    ));
    return {
      result,
      queryOrder: {
        moves,
        overlaps,
        casts,
        volumes,
      },
      sampleOverlaps,
    };
  } finally {
    world.dispose();
  }
}

function measuredNumber(
  tapeId: PhysicsFixtureTapeId,
  field: keyof ReturnType<typeof getPhysicsFixtureTape>['expected']['measurements'],
): number {
  const measurement = getPhysicsFixtureTape(tapeId).expected.measurements[field];
  expect(measurement.status).toBe('measured');
  if (measurement.status !== 'measured' || typeof measurement.value !== 'number') {
    throw new Error(`${tapeId}.${field} is not a scalar measured value`);
  }
  return measurement.value;
}

function finalSample(id: PhysicsFixtureTapeId) {
  return getPhysicsFixtureTape(id).expected.samples.at(-1)!;
}

describe('canonical real-Rapier fixture tapes', () => {
  it.each(PHYSICS_FIXTURE_TAPE_IDS)(
    '%s has literal two-world trace, event, sample, metric, and collider-order parity',
    async (id) => {
      const first = await runInstrumentedTape(id);
      const second = await runInstrumentedTape(id);

      expect(second.result).toEqual(first.result);
      expect(second.queryOrder).toEqual(first.queryOrder);
      expect(second.sampleOverlaps).toEqual(first.sampleOverlaps);
      expect(first.sampleOverlaps.every((ids) => ids.length === 0)).toBe(true);
      assertPhysicsFixtureTapeResult(id, first.result);
      assertPhysicsFixtureTapeResult(id, second.result);
    },
  );

  it('pins movement timing bands and explicit coyote/buffer boundaries', () => {
    const speedTicks = measuredNumber('flat_run_accel_brake_20hz_v1', 'speed90AttainmentTicks');
    const brakingTicks = measuredNumber('flat_run_accel_brake_20hz_v1', 'brakingToStopTicks');
    const speedMilliseconds = ticksToMilliseconds(asSimulationTick(speedTicks), 20);
    const brakingMilliseconds = ticksToMilliseconds(asSimulationTick(brakingTicks), 20);
    expect(speedMilliseconds).toBeGreaterThanOrEqual(100);
    expect(speedMilliseconds).toBeLessThanOrEqual(180);
    expect(brakingMilliseconds).toBeGreaterThanOrEqual(120);
    expect(brakingMilliseconds).toBeLessThanOrEqual(250);

    const slideTicks = measuredNumber('slide_lab_collision_20hz_v1', 'slideDurationTicks');
    const slideMilliseconds = ticksToMilliseconds(asSimulationTick(slideTicks), 20);
    expect(slideMilliseconds).toBeGreaterThanOrEqual(450);
    expect(slideMilliseconds).toBeLessThanOrEqual(900);
    const slideCurve = getPhysicsFixtureTape('slide_lab_collision_20hz_v1')
      .expected.measurements.slideSpeedCurveMmPerSecond;
    expect(slideCurve.status).toBe('measured');
    if (slideCurve.status === 'measured') expect(slideCurve.value.length).toBeGreaterThan(0);

    const apexTicks = measuredNumber('flat_run_fixed_20hz_v1', 'jumpTimeToApexTicks');
    const apexMilliseconds = ticksToMilliseconds(asSimulationTick(apexTicks), 20);
    expect(apexTicks).toBe(10);
    expect(apexMilliseconds).toBe(500);
    expect(apexMilliseconds).toBeGreaterThanOrEqual(450);
    expect(apexMilliseconds).toBeLessThanOrEqual(700);
    expect(measuredNumber('flat_run_fixed_20hz_v1', 'jumpApexHeightGainMm')).toBe(2_750);
    const airtimeTicks = measuredNumber('flat_run_fixed_20hz_v1', 'jumpAirtimeTicks');
    const airtimeMilliseconds = ticksToMilliseconds(asSimulationTick(airtimeTicks), 20);
    expect(airtimeTicks).toBe(20);
    expect(airtimeMilliseconds).toBeGreaterThanOrEqual(900);
    expect(airtimeMilliseconds).toBeLessThanOrEqual(1_350);

    const coyoteAccept = getPhysicsFixtureTape('flat_run_coyote_accept_20hz_v1');
    const coyoteReject = getPhysicsFixtureTape('flat_run_coyote_reject_20hz_v1');
    expect(coyoteAccept.expected.measurements.coyoteJumpWindowTicks).toEqual({
      status: 'measured', value: 2,
    });
    const coyoteMilliseconds = ticksToMilliseconds(asSimulationTick(2), 20);
    expect(coyoteMilliseconds).toBeGreaterThanOrEqual(50);
    expect(coyoteMilliseconds).toBeLessThanOrEqual(100);
    expect(coyoteAccept.expected.events.some((event) => event.kind === 'jumped')).toBe(true);
    expect(coyoteReject.expected.measurements.coyoteJumpWindowTicks).toEqual({
      status: 'not_measured', value: null, reason: 'result_not_observed',
    });
    expect(coyoteReject.expected.events.some((event) => event.kind === 'jumped')).toBe(false);
    const acceptLastGrounded = coyoteAccept.expected.samples
      .filter((sample) => sample.grounded)
      .at(-1)!.authorityTick;
    const rejectLastGrounded = coyoteReject.expected.samples
      .filter((sample) => sample.grounded)
      .at(-1)!.authorityTick;
    const acceptPressTick = coyoteAccept.frames.find((frame) => (
      frame.commands.some((command) => command.pressedButtons !== 0)
    ))!.authorityTick;
    const rejectPressTick = coyoteReject.frames.find((frame) => (
      frame.commands.some((command) => command.pressedButtons !== 0)
    ))!.authorityTick;
    const acceptedGraceIntervals = acceptPressTick - acceptLastGrounded - 1;
    const rejectedGraceIntervals = rejectPressTick - rejectLastGrounded - 1;
    expect(acceptedGraceIntervals).toBe(2);
    expect(rejectedGraceIntervals).toBe(acceptedGraceIntervals + 1);

    const bufferAccept = getPhysicsFixtureTape('flat_run_buffer_accept_20hz_v1');
    const bufferReject = getPhysicsFixtureTape('flat_run_buffer_reject_20hz_v1');
    expect(bufferAccept.expected.measurements.bufferedJumpLeadTicks).toEqual({
      status: 'measured', value: 1,
    });
    const bufferMilliseconds = ticksToMilliseconds(asSimulationTick(1), 20);
    expect(bufferMilliseconds).toBeGreaterThanOrEqual(50);
    expect(bufferMilliseconds).toBeLessThanOrEqual(120);
    expect(bufferAccept.expected.events.some((event) => (
      event.kind === 'jumped' && event.buffered
    ))).toBe(true);
    expect(bufferReject.expected.measurements.bufferedJumpLeadTicks).toEqual({
      status: 'not_measured', value: null, reason: 'result_not_observed',
    });
    expect(bufferReject.expected.events.some((event) => event.kind === 'jumped')).toBe(false);
  });

  it('separates the exact 700 mm rejection boundary from the 800 mm doorway', async () => {
    const rejected = await runInstrumentedTape('contact_lab_doorway_exact_700_reject_20hz_v1');
    const passed = await runInstrumentedTape('contact_lab_doorway_800_pass_20hz_v1');
    const rejectedFinal = rejected.result.envelope.samples.at(-1)!;
    const passedFinal = passed.result.envelope.samples.at(-1)!;

    expect(rejectedFinal.feetPosition).toEqual({ x: -6_000, y: 0, z: 5_781 });
    expect(rejectedFinal.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(rejected.result.envelope.samples.every((sample) => sample.grounded)).toBe(true);
    expect(rejected.result.envelope.samples.every((sample) => sample.feetPosition.y === 0)).toBe(true);

    expect(passed.result.envelope.samples.every((sample) => sample.feetPosition.x === 6_000)).toBe(true);
    expect(passed.result.envelope.samples.every((sample) => sample.feetPosition.y === 0)).toBe(true);
    expect(passed.result.envelope.samples.every((sample) => sample.velocity.y === 0)).toBe(true);
    expect(passed.result.envelope.samples.every((sample) => sample.grounded)).toBe(true);
    expect(passedFinal.feetPosition.z).toBeGreaterThan(6_470);
    const passedZ = passed.result.envelope.samples.map((sample) => sample.feetPosition.z);
    expect(passedZ).toEqual([...passedZ].sort((left, right) => left - right));

    const rejectedContactIds = rejected.queryOrder.moves
      .flatMap((move) => move.contacts)
      .map((contact) => contact.colliderId);
    expect(rejectedContactIds.some((id) => id.startsWith('doorway_exact_700_'))).toBe(true);
    const passedContactIds = passed.queryOrder.moves
      .flatMap((move) => move.contacts)
      .map((contact) => contact.colliderId);
    expect(passedContactIds.some((id) => id.startsWith('doorway_semantic_800_'))).toBe(false);
    expect([...rejected.result.events, ...passed.result.events].every((event) => (
      event.kind === 'movement_intent_applied'
    ))).toBe(true);
  });

  it('pins diagonal glance plus concave and convex corner safety', () => {
    const diagonal = getPhysicsFixtureTape('contact_lab_diagonal_glance_20hz_v1');
    const concave = getPhysicsFixtureTape('contact_lab_corner_concave_20hz_v1');
    const convex = getPhysicsFixtureTape('contact_lab_corner_convex_20hz_v1');

    expect(finalSample(diagonal.id).feetPosition.x).toBeLessThan(-2_000);
    expect(finalSample(diagonal.id).feetPosition.z).toBeGreaterThan(5_000);
    expect(Math.max(...concave.expected.samples.map((sample) => sample.feetPosition.z)))
      .toBeGreaterThan(concave.start.feetPosition.z + 500);
    expect(finalSample(convex.id).feetPosition.x).toBeLessThan(-3_000);
    expect(finalSample(convex.id).feetPosition.z).toBeGreaterThan(2_000);
    for (const tape of [diagonal, concave, convex]) {
      expect(tape.expected.samples.every((sample) => sample.velocity.y <= 0)).toBe(true);
      expect(tape.expected.events.every((event) => event.kind === 'movement_intent_applied')).toBe(true);
    }
  });

  it('keeps uphill and downhill slide envelopes grounded, bounded, and embed-free', async () => {
    const uphillRun = await runInstrumentedTape('slide_lab_uphill_20hz_v1');
    const downhillRun = await runInstrumentedTape('slide_lab_downhill_20hz_v1');
    const uphill = getPhysicsFixtureTape('slide_lab_uphill_20hz_v1');
    const downhill = getPhysicsFixtureTape('slide_lab_downhill_20hz_v1');
    const uphillActive = uphillRun.result.envelope.samples.slice(1);
    const downhillActive = downhillRun.result.envelope.samples.slice(1);

    for (const samples of [uphillActive, downhillActive]) {
      expect(samples.every((sample) => sample.grounded)).toBe(true);
      expect(samples.every((sample) => sample.stance === 'crouched')).toBe(true);
    }
    expect(uphill.expected.events.some((event) => event.kind === 'slide_started')).toBe(true);
    expect(uphill.expected.events.some((event) => event.kind === 'slide_ended')).toBe(false);
    expect(downhill.expected.events.some((event) => event.kind === 'slide_started')).toBe(true);
    expect(downhill.expected.events.some((event) => event.kind === 'slide_ended')).toBe(false);
    expect(uphillRun.queryOrder.moves.every((move) => (
      move.grounded && move.supportColliderId === 'slide_uphill'
    ))).toBe(true);
    expect(downhillRun.queryOrder.moves.every((move) => (
      move.grounded && move.supportColliderId === 'slide_downhill'
    ))).toBe(true);
    expect([...uphillRun.queryOrder.moves, ...downhillRun.queryOrder.moves].every((move) => (
      move.requestUnchanged
    ))).toBe(true);
    expect(downhillRun.queryOrder.moves.every((move) => (
      move.appliedTranslation.y >= -PROFILE.query.snapToGroundDistance
    ))).toBe(true);

    const uphillSpeeds = uphillActive.map((sample) => sample.planarSpeedMmPerSecond);
    expect(uphillSpeeds.at(-1)!).toBeLessThan(uphillSpeeds[0]!);
    expect(uphillSpeeds).toEqual([...uphillSpeeds].sort((left, right) => right - left));
    const uphillHeights = uphillActive.map((sample) => sample.feetPosition.y);
    expect(uphillHeights).toEqual([...uphillHeights].sort((left, right) => left - right));

    const downhillSpeeds = downhillActive.map((sample) => sample.planarSpeedMmPerSecond);
    const downhillInitialSpeed = downhill.expected.samples[0]!.planarSpeedMmPerSecond;
    expect(Math.max(...downhillSpeeds) - downhillInitialSpeed).toBeLessThanOrEqual(500);
    expect(downhillSpeeds.at(-1)!).toBeLessThan(downhillSpeeds[0]!);
    expect(downhillSpeeds).toEqual([...downhillSpeeds].sort((left, right) => right - left));
    const downhillHeights = downhillActive.map((sample) => sample.feetPosition.y);
    expect(downhillHeights).toEqual([...downhillHeights].sort((left, right) => right - left));
  });

  it('bounds slope snap to authored walkable support without mutating request DTOs', async () => {
    const flat = await runInstrumentedTape('flat_run_accel_brake_20hz_v1');
    expect(flat.result.envelope.samples.every((sample) => sample.feetPosition.y === 0)).toBe(true);
    expect(flat.queryOrder.moves.every((move) => move.appliedTranslation.y === 0)).toBe(true);
    expect(flat.queryOrder.moves.every((move) => move.requestUnchanged)).toBe(true);

    const guardSources = [
      fixture('steep_snap_guard', [0, 0, 0], [
        boxSolid('steep_guard', 'world_static', [0, 1_500, 0], [1_500, 100, 1_000], [0, 0, 50_000]),
      ], [boxVolume('steep_far_recovery', 'recovery', [20_000, 0, 0], [100, 100, 100])]),
      fixture('non_authored_snap_guard', [0, 0, 0], [
        capsuleSolid('capsule_guard', 'world_static', [0, 1_000, 0], 2_000, 1_000),
      ], [boxVolume('capsule_far_recovery', 'recovery', [20_000, 0, 0], [100, 100, 100])]),
    ];
    for (const source of guardSources) {
      const world = await createRapierMovementWorld(source);
      try {
        const cast = world.castCapsule({
          feetPosition: {
            x: asMillimeters(0), y: asMillimeters(5_000), z: asMillimeters(0),
          },
          shape: PROFILE.crouchedShape,
          translation: {
            x: asMillimeters(0), y: asMillimeters(-5_000), z: asMillimeters(0),
          },
          contactSkin: PROFILE.query.contactSkin,
          solidLayers: ['world_static'],
        });
        expect(cast.hit).not.toBeNull();
        const feetPosition = {
          x: asMillimeters(0),
          y: asMillimeters(
            5_000 + cast.allowedTranslation.y - PROFILE.query.contactSkin,
          ),
          z: asMillimeters(0),
        };
        const desiredTranslation = {
          x: asMillimeters(0), y: asMillimeters(0), z: asMillimeters(0),
        };
        const request = {
          feetPosition,
          shape: PROFILE.crouchedShape,
          desiredTranslation,
          settings: PROFILE.query,
          solidLayers: ['world_static'] as const,
        };
        const before = structuredClone(request);
        const response = world.moveCapsule(request);
        expect(request).toEqual(before);
        expect(response.appliedTranslation.y).toBe(0);
      } finally {
        world.dispose();
      }
    }

    const ledge = fixture('slope_ledge_guard', [0, 0, 0], [
      boxSolid('ledge_slope', 'world_static', [0, 2_000, 0], [1_000, 100, 1_000], [0, 0, -25_000]),
    ], [boxVolume('ledge_far_recovery', 'recovery', [20_000, 0, 0], [100, 100, 100])]);
    const ledgeWorld = await createRapierMovementWorld(ledge);
    try {
      const cast = ledgeWorld.castCapsule({
        feetPosition: {
          x: asMillimeters(500), y: asMillimeters(5_000), z: asMillimeters(0),
        },
        shape: PROFILE.crouchedShape,
        translation: {
          x: asMillimeters(0), y: asMillimeters(-5_000), z: asMillimeters(0),
        },
        contactSkin: PROFILE.query.contactSkin,
        solidLayers: ['world_static'],
      });
      const feetPosition = {
        x: asMillimeters(500),
        y: asMillimeters(5_000 + cast.allowedTranslation.y - PROFILE.query.contactSkin),
        z: asMillimeters(0),
      };
      const firstRequest = {
        feetPosition,
        shape: PROFILE.crouchedShape,
        desiredTranslation: {
          x: asMillimeters(800), y: asMillimeters(0), z: asMillimeters(0),
        },
        settings: PROFILE.query,
        solidLayers: ['world_static'] as const,
      };
      const firstBefore = structuredClone(firstRequest);
      const first = ledgeWorld.moveCapsule(firstRequest);
      expect(firstRequest).toEqual(firstBefore);
      expect(first.appliedTranslation.y).toBeGreaterThanOrEqual(-PROFILE.query.snapToGroundDistance);

      const secondRequest = {
        ...firstRequest,
        feetPosition: {
          x: asMillimeters(feetPosition.x + first.appliedTranslation.x),
          y: asMillimeters(feetPosition.y + first.appliedTranslation.y),
          z: asMillimeters(feetPosition.z + first.appliedTranslation.z),
        },
      };
      const secondBefore = structuredClone(secondRequest);
      const second = ledgeWorld.moveCapsule(secondRequest);
      expect(secondRequest).toEqual(secondBefore);
      expect(second.appliedTranslation.y).toBe(0);
      expect(second.grounded).toBe(false);
    } finally {
      ledgeWorld.dispose();
    }
  });

  it('pins blocked teleport rejection without cooldown or displacement', async () => {
    const blocked = await runInstrumentedTape('teleport_lab_blocked_20hz_v1');
    expect(blocked.result.events).toContainEqual({
      kind: 'teleport_rejected',
      tick: 1,
      entityId: 'local-player',
      reason: 'blocked',
    });
    expect(blocked.result.events.some((event) => event.kind === 'teleport_succeeded')).toBe(false);
    expect(blocked.result.finalState.player.feetPosition).toEqual({ x: -375, y: 0, z: 0 });
    expect(blocked.result.finalState.player.teleportCooldownTicksRemaining).toBe(0);
    expect(blocked.sampleOverlaps.every((ids) => ids.length === 0)).toBe(true);
  });
});
