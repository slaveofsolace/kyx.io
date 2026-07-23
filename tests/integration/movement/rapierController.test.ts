import { describe, expect, it } from 'vitest';

import {
  INTENT_BUTTON,
  asQuantizedAxis,
  type PlayerIntentCommand,
} from '../../../src/sim';
import {
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  createMovementSimulationState,
  hashCanonicalMovementState,
  stepMovementSimulation,
  type MovementQueryMetrics,
  type MovementQueryPort,
  type MovementSimulationState,
  type MovementStepResult,
} from '../../../src/sim/movement';
import {
  createRapierMovementWorld,
  getPhysicsFixture,
  type RapierMovementWorld,
  type PhysicsFixtureId,
} from '../../../src/physics';

const PROFILE = PHASE3_HYPOTHESIS_MOVEMENT_PROFILE;
const INTEGRATION_RULESET_HASH = '4444444444444444';

interface IntentOverrides {
  readonly moveX?: number;
  readonly moveZ?: number;
  readonly heldButtons?: number;
  readonly pressedButtons?: number;
  readonly releasedButtons?: number;
  readonly lookYawDeltaMilliDegrees?: number;
  readonly lookPitchDeltaMilliDegrees?: number;
}

function command(
  state: MovementSimulationState,
  sequence: number,
  overrides: IntentOverrides = {},
): PlayerIntentCommand {
  return {
    kind: 'player_intent',
    sequence,
    clientTick: state.tick,
    moveX: asQuantizedAxis(overrides.moveX ?? 0),
    moveZ: asQuantizedAxis(overrides.moveZ ?? 0),
    lookYawDeltaMilliDegrees: overrides.lookYawDeltaMilliDegrees ?? 0,
    lookPitchDeltaMilliDegrees: overrides.lookPitchDeltaMilliDegrees ?? 0,
    heldButtons: overrides.heldButtons ?? 0,
    pressedButtons: overrides.pressedButtons ?? 0,
    releasedButtons: overrides.releasedButtons ?? 0,
  };
}

function createState(
  world: RapierMovementWorld,
  options: Omit<Parameters<typeof createMovementSimulationState>[1], 'rulesetHash'>,
): MovementSimulationState {
  return createMovementSimulationState(PROFILE, {
    ...options,
    rulesetHash: INTEGRATION_RULESET_HASH,
  });
}

function step(
  state: MovementSimulationState,
  world: RapierMovementWorld,
  sequence: number,
  overrides: IntentOverrides = {},
): MovementStepResult {
  return stepMovementSimulation(state, [command(state, sequence, overrides)], PROFILE, world);
}

function totalMetrics(log: readonly MovementQueryMetrics[]): MovementQueryMetrics {
  return log.reduce<MovementQueryMetrics>((total, metrics) => ({
    moveCapsuleCalls: total.moveCapsuleCalls + metrics.moveCapsuleCalls,
    overlapCapsuleCalls: total.overlapCapsuleCalls + metrics.overlapCapsuleCalls,
    castCapsuleCalls: total.castCapsuleCalls + metrics.castCapsuleCalls,
    volumeCalls: total.volumeCalls + metrics.volumeCalls,
    shapeCasts: total.shapeCasts + metrics.shapeCasts,
    overlapTests: total.overlapTests + metrics.overlapTests,
    contacts: total.contacts + metrics.contacts,
  }), {
    moveCapsuleCalls: 0,
    overlapCapsuleCalls: 0,
    castCapsuleCalls: 0,
    volumeCalls: 0,
    shapeCasts: 0,
    overlapTests: 0,
    contacts: 0,
  });
}

async function withWorld<T>(
  fixtureId: PhysicsFixtureId,
  run: (world: RapierMovementWorld) => T | Promise<T>,
): Promise<T> {
  const world = await createRapierMovementWorld(getPhysicsFixture(fixtureId));
  try {
    return await run(world);
  } finally {
    world.dispose();
  }
}

function currentBlockingColliders(
  world: RapierMovementWorld,
  state: MovementSimulationState,
): readonly string[] {
  return world.overlapCapsule({
    feetPosition: state.player.feetPosition,
    shape: state.player.stance === 'standing' ? PROFILE.standingShape : PROFILE.crouchedShape,
    solidLayers: ['world_static', 'dynamic_platform', 'player_body', 'door', 'spawn_barrier'],
  }).blockingColliderIds;
}

async function runFlatTrajectory() {
  return withWorld('flat_run', (world) => {
    let state = createState(world, {
      rulesetId: 'phase3.integration',
      rulesetRevision: 1,
      fixtureId: world.fixture.id,
      fixtureHash: world.fixtureHash,
      physicsAdapterId: 'rapier3d.deterministic.compat',
      physicsAdapterVersion: world.runtime.version,
      feetPosition: world.fixture.spawn.feetPositionMm,
      grounded: true,
    });
    const hashes: string[] = [];
    const trajectory: Array<MovementSimulationState['player']['feetPosition']> = [];
    const metrics: MovementQueryMetrics[] = [];
    for (let sequence = 0; sequence < 20; sequence += 1) {
      const result = step(state, world, sequence, { moveZ: 127 });
      state = result.state;
      hashes.push(hashCanonicalMovementState(state));
      trajectory.push({ ...state.player.feetPosition });
      metrics.push(result.metrics);
    }
    return {
      fixtureHash: world.fixtureHash,
      hashes,
      trajectory,
      metrics,
      totalMetrics: totalMetrics(metrics),
      finalHash: hashCanonicalMovementState(state),
      finalState: state,
      blockingColliderIds: currentBlockingColliders(world, state),
    };
  });
}

async function runWallAndCeiling() {
  const wall = await withWorld('contact_lab', (world) => {
    let state = createState(world, {
      rulesetId: 'phase3.integration',
      rulesetRevision: 1,
      fixtureId: world.fixture.id,
      fixtureHash: world.fixtureHash,
      physicsAdapterId: 'rapier3d.deterministic.compat',
      physicsAdapterVersion: world.runtime.version,
      feetPosition: { x: 0, y: 0, z: 0 },
      grounded: true,
    });
    const metrics: MovementQueryMetrics[] = [];
    for (let sequence = 0; sequence < 20; sequence += 1) {
      const result = step(state, world, sequence, { moveX: 127 });
      state = result.state;
      metrics.push(result.metrics);
    }
    return {
      state,
      metrics,
      totalMetrics: totalMetrics(metrics),
      blockingColliderIds: currentBlockingColliders(world, state),
    };
  });

  const ceiling = await withWorld('vertical_lab', (world) => {
    let state = createState(world, {
      rulesetId: 'phase3.integration',
      rulesetRevision: 1,
      fixtureId: world.fixture.id,
      fixtureHash: world.fixtureHash,
      physicsAdapterId: 'rapier3d.deterministic.compat',
      physicsAdapterVersion: world.runtime.version,
      feetPosition: { x: -4_000, y: 0, z: 4_500 },
      grounded: true,
    });
    const result = step(state, world, 0, {
      heldButtons: INTENT_BUTTON.jump,
      pressedButtons: INTENT_BUTTON.jump,
    });
    state = result.state;
    return {
      state,
      events: result.events,
      metrics: result.metrics,
      blockingColliderIds: currentBlockingColliders(world, state),
    };
  });
  return { wall, ceiling };
}

async function runCrouchTunnel() {
  return withWorld('vertical_lab', (world) => {
    let state = createState(world, {
      rulesetId: 'phase3.integration',
      rulesetRevision: 1,
      fixtureId: world.fixture.id,
      fixtureHash: world.fixtureHash,
      physicsAdapterId: 'rapier3d.deterministic.compat',
      physicsAdapterVersion: world.runtime.version,
      feetPosition: { x: 0, y: 0, z: 4_500 },
      grounded: true,
      stance: 'crouched',
    });
    const blocked = step(state, world, 0);
    state = blocked.state;
    const travelMetrics: MovementQueryMetrics[] = [];
    let sequence = 1;
    while (state.player.feetPosition.x <= 2_500 && sequence < 30) {
      const result = step(state, world, sequence, {
        moveX: 127,
        heldButtons: INTENT_BUTTON.crouch,
      });
      state = result.state;
      travelMetrics.push(result.metrics);
      sequence += 1;
    }
    const released = step(state, world, sequence, {
      releasedButtons: INTENT_BUTTON.crouch,
    });
    state = released.state;
    return {
      blockedState: blocked.state,
      blockedEvents: blocked.events,
      blockedMetrics: blocked.metrics,
      travelTicks: travelMetrics.length,
      travelMetrics,
      releasedState: state,
      releasedEvents: released.events,
      releasedMetrics: released.metrics,
      blockingColliderIds: currentBlockingColliders(world, state),
    };
  });
}

async function runSlideProbe(startX: number) {
  return withWorld('slide_lab', (world) => {
    let state = createState(world, {
      rulesetId: 'phase3.integration',
      rulesetRevision: 1,
      fixtureId: world.fixture.id,
      fixtureHash: world.fixtureHash,
      physicsAdapterId: 'rapier3d.deterministic.compat',
      physicsAdapterVersion: world.runtime.version,
      feetPosition: { x: startX, y: 0, z: 0 },
      velocity: { x: 9_000, y: 0, z: 0 },
      grounded: true,
    });
    const metrics: MovementQueryMetrics[] = [];
    const events: MovementStepResult['events'][number][] = [];
    const trajectory: Array<MovementSimulationState['player']['feetPosition']> = [];
    const overlaps: string[][] = [];
    for (let sequence = 0; sequence < 12; sequence += 1) {
      const result = step(state, world, sequence, {
        moveX: 127,
        heldButtons: INTENT_BUTTON.crouch,
        pressedButtons: sequence === 0 ? INTENT_BUTTON.crouch : 0,
      });
      state = result.state;
      metrics.push(result.metrics);
      events.push(...result.events);
      trajectory.push({ ...state.player.feetPosition });
      overlaps.push([...currentBlockingColliders(world, state)]);
    }
    return {
      state,
      metrics,
      totalMetrics: totalMetrics(metrics),
      events,
      trajectory,
      overlaps,
    };
  });
}

async function runTeleportProbe(
  feetPosition: { x: number; y: number; z: number },
  yawMilliDegrees = 90_000,
) {
  return withWorld('teleport_lab', (world) => {
    const state = createState(world, {
      rulesetId: 'phase3.integration',
      rulesetRevision: 1,
      fixtureId: world.fixture.id,
      fixtureHash: world.fixtureHash,
      physicsAdapterId: 'rapier3d.deterministic.compat',
      physicsAdapterVersion: world.runtime.version,
      feetPosition,
      yawMilliDegrees,
      grounded: true,
    });
    const castColliderIds: Array<string | null> = [];
    const queries: MovementQueryPort = {
      schemaVersion: world.schemaVersion,
      moveCapsule: (request) => world.moveCapsule(request),
      overlapCapsule: (request) => world.overlapCapsule(request),
      castCapsule: (request) => {
        const cast = world.castCapsule(request);
        castColliderIds.push(cast.hit?.colliderId ?? null);
        return cast;
      },
      volumesAtCapsule: (request) => world.volumesAtCapsule(request),
    };
    const result = stepMovementSimulation(state, [command(state, 0, {
      heldButtons: INTENT_BUTTON.utility,
      pressedButtons: INTENT_BUTTON.utility,
    })], PROFILE, queries);
    return {
      state: result.state,
      events: result.events,
      metrics: result.metrics,
      castColliderIds,
      blockingColliderIds: currentBlockingColliders(world, result.state),
    };
  });
}

const TELEPORT_CASES = [
  {
    name: 'thin wall',
    feetPosition: { x: -3_000, y: 0, z: 0 },
    yawMilliDegrees: 90_000,
    expectedCastColliderIds: ['thin_wall'],
  },
  {
    name: 'forbidden volume',
    feetPosition: { x: -1_000, y: 0, z: -6_000 },
    yawMilliDegrees: 90_000,
    expectedCastColliderIds: [null],
  },
  {
    name: 'kill volume',
    feetPosition: { x: -1_000, y: 0, z: 6_000 },
    yawMilliDegrees: 90_000,
    expectedCastColliderIds: [null],
  },
  {
    name: 'low ceiling',
    feetPosition: { x: 1_000, y: 0, z: -4_000 },
    yawMilliDegrees: 90_000,
    expectedCastColliderIds: ['teleport_low_ceiling'],
  },
  {
    name: 'player proxy',
    feetPosition: { x: 1_000, y: 0, z: -1_500 },
    yawMilliDegrees: 90_000,
    expectedCastColliderIds: ['teleport_player_proxy'],
  },
  {
    name: 'door',
    feetPosition: { x: -2_000, y: 0, z: -3_500 },
    yawMilliDegrees: 0,
    expectedCastColliderIds: ['teleport_door'],
  },
  {
    name: 'spawn barrier',
    feetPosition: { x: -8_000, y: 0, z: -5_000 },
    yawMilliDegrees: 90_000,
    expectedCastColliderIds: ['teleport_spawn_barrier'],
  },
  {
    name: 'corner',
    feetPosition: { x: 1_000, y: 0, z: 1_000 },
    yawMilliDegrees: 45_000,
    expectedCastColliderIds: ['teleport_corner_x', 'teleport_corner_z'],
  },
] as const;

async function runThresholdProbe(startX: number, ticks: number) {
  return withWorld('vertical_lab', (world) => {
    let state = createState(world, {
      rulesetId: 'phase3.integration',
      rulesetRevision: 1,
      fixtureId: world.fixture.id,
      fixtureHash: world.fixtureHash,
      physicsAdapterId: 'rapier3d.deterministic.compat',
      physicsAdapterVersion: world.runtime.version,
      feetPosition: { x: startX, y: 0, z: 0 },
      grounded: true,
    });
    const trajectory: Array<MovementSimulationState['player']['feetPosition']> = [];
    const metrics: MovementQueryMetrics[] = [];
    for (let sequence = 0; sequence < ticks; sequence += 1) {
      const result = step(state, world, sequence, { moveX: 127 });
      state = result.state;
      trajectory.push({ ...state.player.feetPosition });
      metrics.push(result.metrics);
    }
    return {
      state,
      trajectory,
      metrics,
      totalMetrics: totalMetrics(metrics),
      blockingColliderIds: currentBlockingColliders(world, state),
    };
  });
}

async function runRampProbe(startX: number, ticks: number) {
  return withWorld('vertical_lab', (world) => {
    let state = createState(world, {
      rulesetId: 'phase3.integration',
      rulesetRevision: 1,
      fixtureId: world.fixture.id,
      fixtureHash: world.fixtureHash,
      physicsAdapterId: 'rapier3d.deterministic.compat',
      physicsAdapterVersion: world.runtime.version,
      feetPosition: { x: startX, y: 0, z: -2_500 },
      grounded: true,
    });
    const trajectory: Array<MovementSimulationState['player']['feetPosition']> = [];
    const metrics: MovementQueryMetrics[] = [];
    for (let sequence = 0; sequence < ticks; sequence += 1) {
      const result = step(state, world, sequence, { moveX: 127 });
      state = result.state;
      trajectory.push({ ...state.player.feetPosition });
      metrics.push(result.metrics);
    }
    return {
      state,
      trajectory,
      metrics,
      totalMetrics: totalMetrics(metrics),
      blockingColliderIds: currentBlockingColliders(world, state),
    };
  });
}

async function runPartialEmbedProbe() {
  return withWorld('contact_lab', (world) => {
    let state = createState(world, {
      rulesetId: 'phase3.integration',
      rulesetRevision: 1,
      fixtureId: world.fixture.id,
      fixtureHash: world.fixtureHash,
      physicsAdapterId: 'rapier3d.deterministic.compat',
      physicsAdapterVersion: world.runtime.version,
      feetPosition: { x: -6_500, y: 0, z: -3_000 },
      grounded: true,
    });
    const blockingBefore = currentBlockingColliders(world, state);
    const result = step(state, world, 0);
    state = result.state;
    return {
      blockingBefore,
      blockingAfter: currentBlockingColliders(world, state),
      state,
      events: result.events,
      metrics: result.metrics,
    };
  });
}

describe('pure movement controller with the real Rapier query port', () => {
  it('repeats the flat-run trajectory, hashes, and query metrics exactly', async () => {
    const first = await runFlatTrajectory();
    const repeated = await runFlatTrajectory();
    expect(repeated).toEqual(first);
    expect(first.fixtureHash).toBe('44bfdf2fdced9d9c');
    expect(first.hashes).toHaveLength(20);
    expect(new Set(first.hashes).size).toBe(20);
    expect(first.finalState.player.grounded).toBe(true);
    expect(first.trajectory.map((position) => position.y)).toEqual(Array(20).fill(0));
    expect(first.finalState.player.velocity.y).toBe(0);
    expect(first.finalState.player.feetPosition.z).toBeGreaterThan(6_000);
    expect(first.blockingColliderIds).toEqual([]);
  });

  it('stops at a wall and ceiling without embedding either capsule', async () => {
    const first = await runWallAndCeiling();
    const repeated = await runWallAndCeiling();
    expect(repeated).toEqual(first);
    expect(first.wall.state.player.feetPosition.x).toBeLessThan(2_600);
    expect(first.wall.blockingColliderIds).toEqual([]);
    expect(first.ceiling.state.player.feetPosition.y).toBeLessThanOrEqual(500);
    expect(first.ceiling.state.player.velocity.y).toBe(0);
    expect(first.ceiling.events.map((event) => event.kind)).toContain('hit_ceiling');
    expect(first.ceiling.blockingColliderIds).toEqual([]);
  });

  it('blocks standing inside the real crouch tunnel, then stands after exiting', async () => {
    const first = await runCrouchTunnel();
    const repeated = await runCrouchTunnel();
    expect(repeated).toEqual(first);
    expect(first.blockedState.player.stance).toBe('crouched');
    expect(first.blockedState.player.standBlocked).toBe(true);
    expect(first.blockedEvents.map((event) => event.kind)).toContain('stand_blocked');
    expect(first.releasedState.player.feetPosition.x).toBeGreaterThan(2_500);
    expect(first.releasedState.player.stance).toBe('standing');
    expect(first.releasedState.player.standBlocked).toBe(false);
    expect(first.blockingColliderIds).toEqual([]);
  });

  it('climbs below the step threshold and blocks above it through controller ticks', async () => {
    const below = await runThresholdProbe(-3_500, 12);
    const belowRepeated = await runThresholdProbe(-3_500, 12);
    expect(belowRepeated).toEqual(below);
    expect(Math.max(...below.trajectory.map((position) => position.y))).toBeGreaterThanOrEqual(340);
    expect(below.state.player.feetPosition.x).toBeGreaterThan(-2_000);
    expect(below.blockingColliderIds).toEqual([]);

    const above = await runThresholdProbe(-1_000, 7);
    const aboveRepeated = await runThresholdProbe(-1_000, 7);
    expect(aboveRepeated).toEqual(above);
    expect(above.state.player.feetPosition.x).toBeLessThan(-800);
    expect(Math.max(...above.trajectory.map((position) => position.y))).toBeLessThan(100);
    expect(above.blockingColliderIds).toEqual([]);
  });

  it('traverses the walkable ramp and refuses the too-steep ramp', async () => {
    const walkable = await runRampProbe(1_000, 12);
    const walkableRepeated = await runRampProbe(1_000, 12);
    expect(walkableRepeated).toEqual(walkable);
    expect(Math.max(...walkable.trajectory.map((position) => position.y))).toBeGreaterThan(1_000);
    expect(walkable.state.player.feetPosition.x).toBeGreaterThan(3_000);
    expect(walkable.blockingColliderIds).toEqual([]);

    const steep = await runRampProbe(5_000, 10);
    const steepRepeated = await runRampProbe(5_000, 10);
    expect(steepRepeated).toEqual(steep);
    expect(steep.state.player.feetPosition.x).toBeLessThan(5_700);
    expect(Math.max(...steep.trajectory.map((position) => position.y))).toBeLessThan(200);
    expect(steep.blockingColliderIds).toEqual([]);
  });

  it('fails safely against a step and wall during a high-speed slide', async () => {
    const stepFirst = await runSlideProbe(0);
    const stepRepeated = await runSlideProbe(0);
    expect(stepRepeated).toEqual(stepFirst);
    expect(Math.max(...stepFirst.trajectory.map((position) => position.y))).toBe(0);
    expect(stepFirst.state.player.feetPosition.x).toBeLessThan(1_300);
    expect(stepFirst.state.player.velocity.y).toBe(0);
    expect(stepFirst.overlaps.flat()).toEqual([]);
    expect(stepFirst.events.map((event) => event.kind)).toContain('slide_started');

    const wallFirst = await runSlideProbe(5_000);
    const wallRepeated = await runSlideProbe(5_000);
    expect(wallRepeated).toEqual(wallFirst);
    expect(wallFirst.state.player.feetPosition.x).toBeLessThan(7_600);
    expect(wallFirst.state.player.velocity.x).toBe(0);
    expect(wallFirst.overlaps.flat()).toEqual([]);
  });

  it.each(TELEPORT_CASES)(
    'backs off the $name teleport case with repeat-stable query metrics',
    async ({
      name,
      feetPosition,
      yawMilliDegrees,
      expectedCastColliderIds,
    }) => {
      const first = await runTeleportProbe(feetPosition, yawMilliDegrees);
      const repeated = await runTeleportProbe(feetPosition, yawMilliDegrees);
      expect(repeated).toEqual(first);
      if (expectedCastColliderIds.length === 1) {
        expect(first.castColliderIds).toEqual(expectedCastColliderIds);
      } else {
        expect(expectedCastColliderIds).toContain(first.castColliderIds[0]);
      }
      expect(first.events).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: 'teleport_succeeded', outcome: 'partial' }),
      ]));
      expect(first.metrics.castCapsuleCalls).toBe(1);
      expect(first.metrics.shapeCasts).toBeGreaterThan(0);
      expect(first.metrics.overlapTests).toBeGreaterThan(0);
      expect(first.state.player.activeVolumes).toEqual([]);
      expect(first.blockingColliderIds).toEqual([]);

      if (name === 'thin wall') expect(first.state.player.feetPosition.x).toBeLessThan(-25);
      if (name === 'forbidden volume' || name === 'kill volume') {
        expect(first.state.player.feetPosition.x).toBeLessThan(7_000);
      }
      if (name === 'low ceiling') expect(first.state.player.feetPosition.x).toBeLessThan(3_500);
      if (name === 'player proxy') expect(first.state.player.feetPosition.x).toBeLessThan(3_000);
      if (name === 'door') expect(first.state.player.feetPosition.z).toBeLessThan(5_400);
      if (name === 'spawn barrier') expect(first.state.player.feetPosition.x).toBeLessThan(-4_100);
      if (name === 'corner') {
        expect(first.state.player.feetPosition.x).toBeLessThan(3_900);
        expect(first.state.player.feetPosition.z).toBeLessThan(3_900);
      }
    },
  );

  it('depenetrates a partial fixture embed or produces an explicit safe recovery outcome', async () => {
    const first = await runPartialEmbedProbe();
    const repeated = await runPartialEmbedProbe();
    expect(repeated).toEqual(first);
    expect(first.blockingBefore).toEqual(['embedded_probe']);
    const recovered = first.blockingAfter.length === 0;
    const safeRecoveryEvent = first.events.some((event) => (
      event.kind === 'movement_volume_entered' && event.volumeKind === 'recovery'
    ));
    expect(recovered || safeRecoveryEvent).toBe(true);
  });
});
