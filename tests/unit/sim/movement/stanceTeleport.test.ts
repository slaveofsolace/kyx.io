import { describe, expect, it } from 'vitest';

import {
  CONTACT_NORMAL_Q15_SCALE,
  INTENT_BUTTON,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  stepMovementSimulation,
  type MovementProfileV1,
} from '../../../../src/sim';
import {
  FakeMovementQueryPort,
  createTestMovementState,
  millimeterVector,
  testIntent,
} from './fakeQueryPort';

const PROFILE = PHASE3_HYPOTHESIS_MOVEMENT_PROFILE;

describe('crouch and slide occupancy', () => {
  it('uses the crouched capsule and refuses to stand into a low ceiling', () => {
    let blocked = true;
    const queries = new FakeMovementQueryPort({
      overlap: (request) => blocked && request.shape.height === PROFILE.standingShape.height
        ? ['low_ceiling']
        : [],
    });
    let result = stepMovementSimulation(
      createTestMovementState(),
      [testIntent(0, 0, {
        heldButtons: INTENT_BUTTON.crouch,
        pressedButtons: INTENT_BUTTON.crouch,
      })],
      PROFILE,
      queries,
    );
    expect(result.state.player.stance).toBe('crouched');
    expect(queries.moveRequests.at(-1)?.shape.height).toBe(PROFILE.crouchedShape.height);

    result = stepMovementSimulation(
      result.state,
      [testIntent(1, 1, { releasedButtons: INTENT_BUTTON.crouch })],
      PROFILE,
      queries,
    );
    expect(result.state.player.stance).toBe('crouched');
    expect(result.state.player.standBlocked).toBe(true);
    expect(result.events.some(({ kind }) => kind === 'stand_blocked')).toBe(true);

    blocked = false;
    result = stepMovementSimulation(result.state, [], PROFILE, queries);
    expect(result.state.player.stance).toBe('standing');
    expect(result.events).toContainEqual(expect.objectContaining({
      kind: 'stance_changed',
      stance: 'standing',
    }));
  });

  it('starts slide once from a crouch edge, boosts, then decays under friction', () => {
    const queries = new FakeMovementQueryPort();
    let result = stepMovementSimulation(
      createTestMovementState({ velocity: { z: 7_000 } }),
      [testIntent(0, 0, {
        heldButtons: INTENT_BUTTON.crouch,
        pressedButtons: INTENT_BUTTON.crouch,
      })],
      PROFILE,
      queries,
    );
    expect(result.state.player.locomotion).toBe('sliding');
    expect(result.state.player.stance).toBe('crouched');
    expect(result.state.player.velocity.z).toBe(7_100);
    expect(result.events.filter(({ kind }) => kind === 'slide_started')).toHaveLength(1);

    result = stepMovementSimulation(
      result.state,
      [testIntent(1, 1, {
        heldButtons: INTENT_BUTTON.crouch,
        pressedButtons: INTENT_BUTTON.crouch,
      })],
      PROFILE,
      queries,
    );
    expect(result.state.player.velocity.z).toBe(6_700);
    expect(result.events.filter(({ kind }) => kind === 'slide_started')).toHaveLength(0);
  });

  it('ends slide deterministically and starts its cooldown', () => {
    const queries = new FakeMovementQueryPort();
    let state = stepMovementSimulation(
      createTestMovementState({ velocity: { z: 7_000 } }),
      [testIntent(0, 0, { pressedButtons: INTENT_BUTTON.crouch })],
      PROFILE,
      queries,
    ).state;
    let ended = false;
    for (let tick = 2; tick <= PROFILE.slide.durationTicks; tick += 1) {
      const result = stepMovementSimulation(state, [], PROFILE, queries);
      state = result.state;
      ended ||= result.events.some(({ kind }) => kind === 'slide_ended');
    }

    expect(ended).toBe(true);
    expect(state.player.locomotion).toBe('grounded');
    expect(state.player.slideTicksRemaining).toBe(0);
    expect(state.player.slideCooldownTicksRemaining).toBe(PROFILE.slide.cooldownTicks);
  });

  it('clears remaining slide time when support is lost', () => {
    const queries = new FakeMovementQueryPort({ floorY: -100_000 });
    const result = stepMovementSimulation(
      createTestMovementState({ velocity: { z: 7_000 } }),
      [testIntent(0, 0, { pressedButtons: INTENT_BUTTON.crouch })],
      PROFILE,
      queries,
    );

    expect(result.events).toContainEqual(expect.objectContaining({
      kind: 'slide_ended',
      reason: 'airborne',
    }));
    expect(result.state.player.locomotion).toBe('airborne');
    expect(result.state.player.slideTicksRemaining).toBe(0);
  });
});

describe('teleport shape operation', () => {
  function teleportIntent(sequence: number, tick: number) {
    return testIntent(sequence, tick, { pressedButtons: INTENT_BUTTON.utility });
  }

  it('casts the capsule, moves atomically, applies velocity policy, and starts cooldown', () => {
    const queries = new FakeMovementQueryPort({
      volumes: (request) => request.feetPosition.z > 0
        ? [{ colliderId: 'safe_recovery', kind: 'recovery' }]
        : [],
    });
    const initial = createTestMovementState({ velocity: { x: 3_000, y: 2_000 } });
    const result = stepMovementSimulation(initial, [teleportIntent(0, 0)], PROFILE, queries);

    expect(result.state.player.feetPosition).toEqual(millimeterVector(0, 0, 9_000));
    expect(result.state.player.velocity).toMatchObject({ x: 3_000, y: 0, z: 0 });
    expect(result.state.player.teleportCooldownTicksRemaining).toBe(PROFILE.teleport.cooldownTicks);
    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'teleport_succeeded', outcome: 'full' }),
      expect.objectContaining({ kind: 'movement_volume_entered', volumeKind: 'recovery' }),
    ]));
    expect(result.metrics).toMatchObject({ castCapsuleCalls: 1, overlapCapsuleCalls: 1 });
  });

  it('rejects another teleport while cooldown remains', () => {
    const queries = new FakeMovementQueryPort();
    let result = stepMovementSimulation(
      createTestMovementState(),
      [teleportIntent(0, 0)],
      PROFILE,
      queries,
    );
    result = stepMovementSimulation(result.state, [teleportIntent(1, 1)], PROFILE, queries);

    expect(result.events).toContainEqual(expect.objectContaining({
      kind: 'teleport_rejected',
      reason: 'cooldown',
    }));
    expect(queries.castRequests).toHaveLength(1);
  });

  it('uses a partial cast result without passing through the blocker', () => {
    const queries = new FakeMovementQueryPort({
      cast: () => ({
        allowedTranslation: millimeterVector(0, 0, 4_000),
        hit: {
          colliderId: 'thin_wall',
          layer: 'world_static',
          normalQ15: { x: 0, y: 0, z: -CONTACT_NORMAL_Q15_SCALE },
          timeOfImpactPermille: 450,
        },
        shapeCasts: 1,
      }),
    });
    const result = stepMovementSimulation(
      createTestMovementState(),
      [teleportIntent(0, 0)],
      PROFILE,
      queries,
    );

    expect(result.state.player.feetPosition.z).toBe(4_000);
    expect(result.events).toContainEqual(expect.objectContaining({
      kind: 'teleport_succeeded',
      outcome: 'partial',
    }));
  });

  it('searches backward by fixed increments for an unoccupied destination', () => {
    const queries = new FakeMovementQueryPort({
      overlap: (request) => request.feetPosition.z > 8_500 ? ['destination_blocker'] : [],
    });
    const result = stepMovementSimulation(
      createTestMovementState(),
      [teleportIntent(0, 0)],
      PROFILE,
      queries,
    );

    expect(result.state.player.feetPosition.z).toBe(8_500);
    expect(queries.overlapRequests.length).toBeGreaterThan(1);
    expect(result.events).toContainEqual(expect.objectContaining({
      kind: 'teleport_succeeded',
      outcome: 'partial',
    }));
  });

  it.each(['forbidden', 'kill'] as const)('rejects a %s destination volume', (kind) => {
    const profile: MovementProfileV1 = {
      ...PROFILE,
      teleport: {
        ...PROFILE.teleport,
        maximumRangeMm: 1_000,
        backwardSearchStepMm: 400,
        maximumBackwardSearchSteps: 2,
      },
    };
    const queries = new FakeMovementQueryPort({
      volumes: (request) => request.feetPosition.z > 0
        ? [{ colliderId: `${kind}_zone`, kind }]
        : [],
    });
    const result = stepMovementSimulation(
      createTestMovementState({}, profile),
      [teleportIntent(0, 0)],
      profile,
      queries,
    );

    expect(result.state.player.feetPosition.z).toBe(0);
    expect(result.state.player.teleportCooldownTicksRemaining).toBe(0);
    expect(result.events).toContainEqual(expect.objectContaining({
      kind: 'teleport_rejected',
      reason: `${kind}_volume`,
    }));
  });

  it('rejects an entirely blocked backward search without starting cooldown', () => {
    const profile: MovementProfileV1 = {
      ...PROFILE,
      teleport: { ...PROFILE.teleport, maximumBackwardSearchSteps: 2 },
    };
    const queries = new FakeMovementQueryPort({ overlap: () => ['solid_blocker'] });
    const result = stepMovementSimulation(
      createTestMovementState({}, profile),
      [teleportIntent(0, 0)],
      profile,
      queries,
    );

    expect(result.events).toContainEqual(expect.objectContaining({
      kind: 'teleport_rejected',
      reason: 'blocked',
    }));
    expect(result.state.player.teleportCooldownTicksRemaining).toBe(0);
  });
});
