import { describe, expect, it } from 'vitest';

import {
  INTENT_BUTTON,
  asQuantizedAxis,
  asSimulationTick,
  bindPlayerIntent,
  createSimulationEntity,
  createSimulationState,
  hashCanonicalSimulationState,
  stepSimulation,
  type PlayerIntentCommand,
  type SimulationStepRules,
} from '../../../src/sim';

const RULES: SimulationStepRules = {
  simulationRateHz: 20,
  walkSpeedMmPerSecond: 5_000,
  sprintSpeedMmPerSecond: 7_500,
};

function command(
  sequence: number,
  overrides: Partial<Omit<PlayerIntentCommand, 'kind' | 'sequence' | 'clientTick'>> = {},
): PlayerIntentCommand {
  return {
    kind: 'player_intent',
    sequence,
    clientTick: asSimulationTick(sequence),
    moveX: asQuantizedAxis(0),
    moveZ: asQuantizedAxis(0),
    lookYawDeltaMilliDegrees: 0,
    lookPitchDeltaMilliDegrees: 0,
    heldButtons: 0,
    pressedButtons: 0,
    releasedButtons: 0,
    ...overrides,
  };
}

function initialState(seed: string | number = 'sim-test') {
  return createSimulationState({
    rulesetId: 'revamped_classic',
    simulationRateHz: 20,
    matchSeed: seed,
    entities: [createSimulationEntity({ id: 'player-a' })],
  });
}

describe('pure simulation step', () => {
  it('applies player movement intent at exactly one fixed tick', () => {
    const before = initialState();
    const beforeHash = hashCanonicalSimulationState(before);
    const result = stepSimulation(
      before,
      [
        bindPlayerIntent(
          'player-a',
          command(0, {
            moveX: asQuantizedAxis(127),
            lookYawDeltaMilliDegrees: 15_000,
          }),
        ),
      ],
      RULES,
    );

    expect(result.state.tick).toBe(1);
    expect(result.state.entities['player-a'].positionMm.x).toBe(250);
    expect(result.state.entities['player-a'].velocityMmPerSecond.x).toBe(5_000);
    expect(result.state.entities['player-a'].yawMilliDegrees).toBe(15_000);
    expect(result.events).toEqual([
      {
        kind: 'player_intent_applied',
        tick: 1,
        entityId: 'player-a',
        sequence: 0,
      },
    ]);
    expect(hashCanonicalSimulationState(before)).toBe(beforeHash);
    expect(before.tick).toBe(0);
    expect(before.entities['player-a'].positionMm.x).toBe(0);
  });

  it('normalizes diagonal input so it cannot exceed axial speed', () => {
    const result = stepSimulation(
      initialState(),
      [
        bindPlayerIntent(
          'player-a',
          command(0, {
            moveX: asQuantizedAxis(127),
            moveZ: asQuantizedAxis(127),
          }),
        ),
      ],
      RULES,
    );
    const entity = result.state.entities['player-a'];
    const planarSpeed = Math.hypot(
      entity.velocityMmPerSecond.x,
      entity.velocityMmPerSecond.z,
    );

    expect(entity.velocityMmPerSecond.x).toBe(3_528);
    expect(entity.velocityMmPerSecond.z).toBe(3_528);
    expect(planarSpeed).toBeLessThanOrEqual(RULES.walkSpeedMmPerSecond);
  });

  it('uses integer remainders so long fixed-tick integration does not discard distance', () => {
    const slowRules: SimulationStepRules = {
      ...RULES,
      walkSpeedMmPerSecond: 101,
      sprintSpeedMmPerSecond: 101,
    };
    let state = stepSimulation(
      initialState(),
      [
        bindPlayerIntent(
          'player-a',
          command(0, { moveX: asQuantizedAxis(127) }),
        ),
      ],
      slowRules,
    ).state;
    for (let index = 1; index < 20; index += 1) {
      state = stepSimulation(state, [], slowRules).state;
    }

    expect(state.tick).toBe(20);
    expect(state.entities['player-a'].positionMm.x).toBe(101);
    expect(state.entities['player-a'].integrationRemainder.x).toBe(0);
  });

  it('preserves one-second movement distance in the explicit 40 Hz evaluation profile', () => {
    function runOneSecond(rateHz: 20 | 40): number {
      const rules: SimulationStepRules = {
        ...RULES,
        simulationRateHz: rateHz,
      };
      let state = createSimulationState({
        rulesetId: 'revamped_classic',
        simulationRateHz: rateHz,
        matchSeed: 'rate-comparison',
        entities: [createSimulationEntity({ id: 'player-a' })],
      });
      state = stepSimulation(
        state,
        [
          bindPlayerIntent(
            'player-a',
            command(0, { moveZ: asQuantizedAxis(127) }),
          ),
        ],
        rules,
      ).state;
      for (let index = 1; index < rateHz; index += 1) {
        state = stepSimulation(state, [], rules).state;
      }
      return state.entities['player-a'].positionMm.z;
    }

    expect(runOneSecond(20)).toBe(5_000);
    expect(runOneSecond(40)).toBe(5_000);
  });

  it('binds identity outside the intent payload and orders sequences deterministically', () => {
    const result = stepSimulation(
      initialState(),
      [
        bindPlayerIntent(
          'player-a',
          command(1, { moveX: asQuantizedAxis(-127), selectedSlot: 1 }),
        ),
        bindPlayerIntent(
          'player-a',
          command(0, {
            moveX: asQuantizedAxis(127),
            heldButtons: INTENT_BUTTON.sprint,
          }),
        ),
      ],
      RULES,
    );

    expect(result.state.entities['player-a'].lastProcessedSequence).toBe(1);
    expect(result.state.entities['player-a'].intent.selectedSlot).toBe(1);
    expect(result.state.entities['player-a'].velocityMmPerSecond.x).toBe(-5_000);
    expect(result.events.map((event) => event.sequence)).toEqual([0, 1]);
  });

  it('rejects stale and unknown-entity commands as facts instead of mutating authority', () => {
    const first = stepSimulation(
      initialState(),
      [bindPlayerIntent('player-a', command(0))],
      RULES,
    ).state;
    const result = stepSimulation(
      first,
      [
        bindPlayerIntent('ghost', command(0)),
        bindPlayerIntent('player-a', command(0)),
      ],
      RULES,
    );

    expect(result.events).toEqual([
      {
        kind: 'player_intent_rejected',
        tick: 2,
        entityId: 'ghost',
        sequence: 0,
        reason: 'unknown_entity',
      },
      {
        kind: 'player_intent_rejected',
        tick: 2,
        entityId: 'player-a',
        sequence: 0,
        reason: 'stale_sequence',
      },
    ]);
    expect(result.state.entities['player-a'].lastProcessedSequence).toBe(0);
  });

  it('fails closed on malformed intent fields and mismatched tick rates', () => {
    const malformed = {
      ...command(0),
      moveX: 128,
    } as unknown as PlayerIntentCommand;
    expect(() =>
      stepSimulation(
        initialState(),
        [{ entityId: 'player-a' as never, intent: malformed }],
        RULES,
      ),
    ).toThrow(/moveX/);

    const outcomeClaim = {
      ...command(0),
      claimedAuthoritativeOutcome: 50,
    } as unknown as PlayerIntentCommand;
    expect(() =>
      stepSimulation(
        initialState(),
        [{ entityId: 'player-a' as never, intent: outcomeClaim }],
        RULES,
      ),
    ).toThrow(/unsupported field/);

    const unknownButton = {
      ...command(0),
      heldButtons: 1 << 30,
    } as PlayerIntentCommand;
    expect(() =>
      stepSimulation(
        initialState(),
        [{ entityId: 'player-a' as never, intent: unknownButton }],
        RULES,
      ),
    ).toThrow(/unsupported button bits/);

    expect(() =>
      stepSimulation(initialState(), [], { ...RULES, simulationRateHz: 40 }),
    ).toThrow(/state runs at 20 Hz/);

    expect(() =>
      stepSimulation(
        initialState(),
        [{ entityId: 7 as never, intent: command(0) }],
        RULES,
      ),
    ).toThrow(/entity id/);

    expect(() =>
      createSimulationState({
        rulesetId: 7 as never,
        simulationRateHz: 20,
        matchSeed: 'invalid-ruleset-id',
        entities: [],
      }),
    ).toThrow(/ruleset id/);
  });
});
