import { describe, expect, it } from 'vitest';

import {
  FOUNDATION_REPLAY,
  FOUNDATION_REPLAY_RULES,
  FOUNDATION_REPLAY_SEED,
  createFoundationReplayInitialState,
  createSimulationEntity,
  createSimulationState,
  hashCanonicalSimulationState,
  runFoundationDeterministicReplay,
  runSimulationReplay,
} from '../../../src/sim';

describe('canonical deterministic replay', () => {
  it('produces the same literal state hash on every 20 Hz run', () => {
    const first = runFoundationDeterministicReplay();
    const second = runFoundationDeterministicReplay();

    expect(first).toEqual(second);
    expect(first).toEqual({
      finalTick: 6,
      finalStateHash: 'd7201dfc006e72ee',
      entityCount: 2,
      eventCount: 6,
    });
  });

  it('keeps the full hash tape stable for identical seed, state, and commands', () => {
    const first = runSimulationReplay(
      createFoundationReplayInitialState(),
      FOUNDATION_REPLAY,
      FOUNDATION_REPLAY_RULES,
    );
    const second = runSimulationReplay(
      createFoundationReplayInitialState(),
      FOUNDATION_REPLAY,
      FOUNDATION_REPLAY_RULES,
    );

    expect(first.stateHashes).toEqual(second.stateHashes);
    expect(first.finalHash).toBe(second.finalHash);
    expect(first.stateHashes).toHaveLength(FOUNDATION_REPLAY.frames.length + 1);
  });

  it('changes canonical state when the match seed changes', () => {
    const defaultInitial = createFoundationReplayInitialState();
    const otherSeedInitial = createSimulationState({
      rulesetId: 'revamped_classic',
      simulationRateHz: 20,
      matchSeed: `${FOUNDATION_REPLAY_SEED}-different`,
      entities: [
        createSimulationEntity({ id: 'practice-bot-01', positionMm: { x: 2_000, z: -1_000 } }),
        createSimulationEntity({ id: 'local-player' }),
      ],
    });

    const defaultRun = runSimulationReplay(
      defaultInitial,
      FOUNDATION_REPLAY,
      FOUNDATION_REPLAY_RULES,
    );
    const otherRun = runSimulationReplay(
      otherSeedInitial,
      FOUNDATION_REPLAY,
      FOUNDATION_REPLAY_RULES,
    );
    expect(defaultRun.finalHash).not.toBe(otherRun.finalHash);
  });

  it('canonicalizes entity insertion order', () => {
    const forward = createSimulationState({
      rulesetId: 'revamped_classic',
      simulationRateHz: 20,
      matchSeed: FOUNDATION_REPLAY_SEED,
      entities: [
        createSimulationEntity({ id: 'alpha' }),
        createSimulationEntity({ id: 'bravo' }),
      ],
    });
    const reverse = createSimulationState({
      rulesetId: 'revamped_classic',
      simulationRateHz: 20,
      matchSeed: FOUNDATION_REPLAY_SEED,
      entities: [
        createSimulationEntity({ id: 'bravo' }),
        createSimulationEntity({ id: 'alpha' }),
      ],
    });

    expect(hashCanonicalSimulationState(forward)).toBe(hashCanonicalSimulationState(reverse));
  });

  it('rejects gaps and duplicate authority ticks in a replay tape', () => {
    expect(() =>
      runSimulationReplay(
        createFoundationReplayInitialState(),
        {
          schemaVersion: 1,
          frames: [{ authorityTick: 2 as never, commands: [] }],
        },
        FOUNDATION_REPLAY_RULES,
      ),
    ).toThrow(/expected next tick 1/);
  });
});
