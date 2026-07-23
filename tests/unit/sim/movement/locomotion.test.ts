import { describe, expect, it } from 'vitest';

import {
  INTENT_BUTTON,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  asQuantizedAxis,
  stepMovementSimulation,
  type MovementSimulationState,
} from '../../../../src/sim';
import {
  FakeMovementQueryPort,
  createTestMovementState,
  testIntent,
} from './fakeQueryPort';

const PROFILE = PHASE3_HYPOTHESIS_MOVEMENT_PROFILE;

describe('deterministic locomotion controller', () => {
  it('accelerates toward walk speed instead of snapping to it', () => {
    const queries = new FakeMovementQueryPort();
    const result = stepMovementSimulation(
      createTestMovementState(),
      [testIntent(0, 0, { moveZ: asQuantizedAxis(127) })],
      PROFILE,
      queries,
    );

    expect(result.state.player.velocity.z).toBe(3_000);
    expect(result.state.player.feetPosition.z).toBe(150);
    expect(result.state.player.grounded).toBe(true);
    expect(result.events.map(({ kind }) => kind)).toContain('movement_intent_applied');
  });

  it('neutralizes stale held movement after the bounded command-reuse window', () => {
    const queries = new FakeMovementQueryPort();
    let state = stepMovementSimulation(
      createTestMovementState(),
      [testIntent(0, 0, { moveZ: asQuantizedAxis(127) })],
      PROFILE,
      queries,
    ).state;
    state = stepMovementSimulation(state, [], PROFILE, queries).state;
    state = stepMovementSimulation(state, [], PROFILE, queries).state;
    expect(state.player.velocity.z).toBe(7_000);

    state = stepMovementSimulation(state, [], PROFILE, queries).state;
    expect(state.player.intent.moveZ).toBe(0);
    expect(state.player.velocity.z).toBe(5_000);
  });

  it('uses the reverse-acceleration envelope for opposing intent', () => {
    const queries = new FakeMovementQueryPort();
    let state = createTestMovementState({ velocity: { z: 7_000 } });
    state = stepMovementSimulation(
      state,
      [testIntent(0, 0, { moveZ: asQuantizedAxis(-127) })],
      PROFILE,
      queries,
    ).state;

    expect(state.player.velocity.z).toBe(4_000);
  });

  it('applies normalized yaw-relative diagonal intent', () => {
    const queries = new FakeMovementQueryPort();
    const result = stepMovementSimulation(
      createTestMovementState(),
      [testIntent(0, 0, {
        moveX: asQuantizedAxis(127),
        moveZ: asQuantizedAxis(127),
        lookYawDeltaMilliDegrees: 90_000,
      })],
      PROFILE,
      queries,
    );

    expect(result.state.player.velocity.x).toBeGreaterThan(0);
    expect(result.state.player.velocity.z).toBeLessThan(0);
    expect(Math.hypot(result.state.player.velocity.x, result.state.player.velocity.z))
      .toBeLessThanOrEqual(3_001);
  });

  it('preserves excess airborne speed while bounding added air control', () => {
    const queries = new FakeMovementQueryPort({ floorY: -100_000 });
    const initial = createTestMovementState({
      grounded: false,
      feetPosition: { y: 10_000 },
      velocity: { x: 9_000 },
    });
    const result = stepMovementSimulation(
      initial,
      [testIntent(0, 0, { moveZ: asQuantizedAxis(127) })],
      PROFILE,
      queries,
    );
    const speed = Math.hypot(result.state.player.velocity.x, result.state.player.velocity.z);

    expect(speed).toBeLessThanOrEqual(9_001);
    expect(result.state.player.velocity.z).toBeGreaterThan(0);
    expect(result.state.player.velocity.y).toBe(-1_000);
  });

  it('jumps once from an edge and applies integer gravity in the same tick', () => {
    const queries = new FakeMovementQueryPort();
    const jump = testIntent(0, 0, {
      heldButtons: INTENT_BUTTON.jump,
      pressedButtons: INTENT_BUTTON.jump,
    });
    let result = stepMovementSimulation(createTestMovementState(), [jump], PROFILE, queries);

    expect(result.state.player.velocity.y).toBe(10_000);
    expect(result.state.player.feetPosition.y).toBe(500);
    expect(result.events.filter(({ kind }) => kind === 'jumped')).toHaveLength(1);

    result = stepMovementSimulation(result.state, [], PROFILE, queries);
    expect(result.events.filter(({ kind }) => kind === 'jumped')).toHaveLength(0);
  });

  it('accepts a coyote jump after leaving support', () => {
    const queries = new FakeMovementQueryPort({ floorY: -100_000 });
    const state = stepMovementSimulation(createTestMovementState(), [], PROFILE, queries).state;
    expect(state.player.grounded).toBe(false);
    expect(state.player.coyoteTicksRemaining).toBe(PROFILE.locomotion.coyoteTicks);

    const result = stepMovementSimulation(
      state,
      [testIntent(0, 1, { pressedButtons: INTENT_BUTTON.jump })],
      PROFILE,
      queries,
    );
    expect(result.events.some(({ kind }) => kind === 'jumped')).toBe(true);
    expect(result.state.player.velocity.y).toBeGreaterThan(0);
  });

  it('consumes a buffered jump on the landing tick', () => {
    const queries = new FakeMovementQueryPort();
    const initial = createTestMovementState({
      grounded: false,
      feetPosition: { y: 200 },
      velocity: { y: -1_000 },
    });
    const result = stepMovementSimulation(
      initial,
      [testIntent(0, 0, { pressedButtons: INTENT_BUTTON.jump })],
      PROFILE,
      queries,
    );

    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'landed' }),
      expect.objectContaining({ kind: 'jumped', buffered: true }),
    ]));
    expect(result.state.player.grounded).toBe(false);
    expect(result.state.player.velocity.y).toBe(PROFILE.locomotion.jumpImpulseMmPerSecond);
  });

  it('clips upward velocity and emits a ceiling event', () => {
    const queries = new FakeMovementQueryPort({ ceilingY: 2_300 });
    const state: MovementSimulationState = stepMovementSimulation(
      createTestMovementState(),
      [testIntent(0, 0, { pressedButtons: INTENT_BUTTON.jump })],
      PROFILE,
      queries,
    ).state;
    const result = stepMovementSimulation(state, [], PROFILE, queries);

    expect(result.events.some(({ kind }) => kind === 'hit_ceiling')).toBe(true);
    expect(result.state.player.velocity.y).toBe(0);
    expect(result.state.player.feetPosition.y).toBe(500);
  });

  it('clips velocity against stable wall contacts and records query metrics', () => {
    const queries = new FakeMovementQueryPort({ maximumX: 100 });
    const result = stepMovementSimulation(
      createTestMovementState({ velocity: { x: 7_000 } }),
      [],
      PROFILE,
      queries,
    );

    expect(result.state.player.feetPosition.x).toBe(100);
    expect(result.state.player.velocity.x).toBe(0);
    expect(result.metrics).toMatchObject({ moveCapsuleCalls: 1, contacts: 1, volumeCalls: 1 });
  });

  it('carries grounded support velocity without adding it to canonical player velocity', () => {
    const queries = new FakeMovementQueryPort({ supportVelocity: { x: 1_000, y: 0, z: 0 } });
    let state = stepMovementSimulation(createTestMovementState(), [], PROFILE, queries).state;
    state = stepMovementSimulation(state, [], PROFILE, queries).state;

    expect(state.player.feetPosition.x).toBe(50);
    expect(state.player.velocity.x).toBe(0);
    expect(state.player.support?.velocity.x).toBe(1_000);
  });
});
