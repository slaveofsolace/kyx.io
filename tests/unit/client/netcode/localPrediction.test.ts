import { describe, expect, it } from 'vitest';

import {
  createLocalPrediction,
  predictLocalMovementTick,
  reconcileLocalMovement,
  type AuthoritativeLocalMovementSnapshot,
  type LocalPredictionState,
} from '../../../../src/client/netcode';
import {
  INTENT_BUTTON,
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  asMillimeters,
  asQuantizedAxis,
  asSimulationTick,
  hashCanonicalMovementState,
  type MovementSimulationState,
} from '../../../../src/sim';
import {
  FakeMovementQueryPort,
  createTestMovementState,
  testIntent,
} from '../../sim/movement/fakeQueryPort';

const PROFILE = PHASE3_HYPOTHESIS_MOVEMENT_PROFILE;

function predictForward(
  prediction: LocalPredictionState,
  sequence: number,
  clientTick = sequence,
): LocalPredictionState {
  return predictLocalMovementTick(
    prediction,
    [testIntent(sequence, clientTick, { moveZ: asQuantizedAxis(127) })],
    PROFILE,
    new FakeMovementQueryPort(),
  ).prediction;
}

function authoritySnapshot(
  state: MovementSimulationState,
  overrides: {
    readonly tick?: number;
    readonly acknowledgedSequence?: number;
    readonly x?: number;
    readonly z?: number;
    readonly discontinuity?: AuthoritativeLocalMovementSnapshot['discontinuity'];
  } = {},
): AuthoritativeLocalMovementSnapshot {
  const snapshotState: MovementSimulationState = {
    ...state,
    tick: asSimulationTick(overrides.tick ?? state.tick),
    player: {
      ...state.player,
      lastProcessedSequence:
        overrides.acknowledgedSequence ?? state.player.lastProcessedSequence,
      feetPosition: {
        ...state.player.feetPosition,
        x: asMillimeters(overrides.x ?? state.player.feetPosition.x),
        z: asMillimeters(overrides.z ?? state.player.feetPosition.z),
      },
    },
  };
  return {
    state: snapshotState,
    ...(overrides.discontinuity === undefined
      ? {}
      : { discontinuity: overrides.discontinuity }),
  };
}

describe('local deterministic prediction and reconciliation', () => {
  it('restores exact authority, drops acknowledged commands, and replays the suffix', () => {
    const initial = createLocalPrediction(createTestMovementState(), PROFILE);
    const afterZero = predictForward(initial, 0);
    const afterOne = predictForward(afterZero, 1);
    const afterTwo = predictForward(afterOne, 2);

    const reconciled = reconcileLocalMovement(
      afterTwo,
      authoritySnapshot(afterOne.predictedState),
      PROFILE,
      new FakeMovementQueryPort(),
    );

    expect(reconciled).toMatchObject({
      mode: 'confirmed',
      acknowledgedSequence: 1,
      replayedTicks: 1,
      replayedCommands: 1,
      requiresInputStreamReset: false,
    });
    expect(reconciled.prediction.history.map((frame) => (
      frame.commands.map((command) => command.sequence)
    ))).toEqual([[2]]);
    expect(reconciled.prediction.historyFloorSequence).toBe(1);
    expect(hashCanonicalMovementState(reconciled.prediction.predictedState)).toBe(
      hashCanonicalMovementState(afterTwo.predictedState),
    );
  });

  it('preserves ordered fast press/release edges sharing one client tick through replay', () => {
    const prediction = createLocalPrediction(createTestMovementState(), PROFILE);
    const press = testIntent(0, 7, {
      heldButtons: INTENT_BUTTON.jump,
      pressedButtons: INTENT_BUTTON.jump,
    });
    const release = testIntent(1, 7, {
      heldButtons: 0,
      releasedButtons: INTENT_BUTTON.jump,
    });
    const stepped = predictLocalMovementTick(
      prediction,
      // Deliberately reversed at the API boundary; sequence is canonical.
      [release, press],
      PROFILE,
      new FakeMovementQueryPort(),
    );

    expect(stepped.prediction.history[0]?.commands.map(({ sequence }) => sequence))
      .toEqual([0, 1]);
    expect(stepped.prediction.predictedState.player).toMatchObject({
      lastProcessedSequence: 1,
      grounded: false,
      intent: {
        heldButtons: 0,
        pressedButtons: INTENT_BUTTON.jump,
        releasedButtons: INTENT_BUTTON.jump,
      },
    });
    expect(stepped.simulation.events.filter(({ kind }) => kind === 'jumped')).toHaveLength(1);

    const replayed = reconcileLocalMovement(
      stepped.prediction,
      authoritySnapshot(prediction.predictedState),
      PROFILE,
      new FakeMovementQueryPort(),
    );
    expect(replayed.mode).toBe('confirmed');
    expect(replayed.replayedTicks).toBe(1);
    expect(replayed.replayedCommands).toBe(2);
    expect(replayed.prediction.predictedState.player.intent).toMatchObject({
      heldButtons: 0,
      pressedButtons: INTENT_BUTTON.jump,
      releasedButtons: INTENT_BUTTON.jump,
    });
  });

  it('hard-resets when authority acknowledges below an evicted history floor', () => {
    let prediction = createLocalPrediction(createTestMovementState(), PROFILE, {
      maximumHistoryCommands: 2,
    });
    prediction = predictForward(prediction, 0);
    prediction = predictForward(prediction, 1);
    prediction = predictForward(prediction, 2);
    expect(prediction.historyFloorSequence).toBe(0);
    expect(prediction.history.map((frame) => frame.commands[0]?.sequence)).toEqual([1, 2]);

    const initialAuthority = createTestMovementState();
    const result = reconcileLocalMovement(
      prediction,
      authoritySnapshot(initialAuthority),
      PROFILE,
      new FakeMovementQueryPort(),
    );

    expect(result).toMatchObject({
      mode: 'history_gap_snap',
      acknowledgedSequence: -1,
      replayedTicks: 0,
      replayedCommands: 0,
      requiresInputStreamReset: true,
    });
    expect(result.prediction.history).toEqual([]);
    expect(result.prediction.historyCommandCount).toBe(0);
    expect(result.prediction.lastPredictedClientTick).toBe(-1);
  });

  it('ignores duplicate and older authority ticks without rolling prediction backward', () => {
    const predicted = predictForward(
      predictForward(createLocalPrediction(createTestMovementState(), PROFILE), 0),
      1,
    );
    const first = reconcileLocalMovement(
      predicted,
      authoritySnapshot(predicted.predictedState),
      PROFILE,
      new FakeMovementQueryPort(),
    );
    const duplicate = reconcileLocalMovement(
      first.prediction,
      authoritySnapshot(predicted.predictedState),
      PROFILE,
      new FakeMovementQueryPort(),
    );
    const older = reconcileLocalMovement(
      duplicate.prediction,
      authoritySnapshot(predicted.predictedState, { tick: 1 }),
      PROFILE,
      new FakeMovementQueryPort(),
    );

    expect(duplicate.mode).toBe('stale_snapshot');
    expect(older.mode).toBe('stale_snapshot');
    expect(older.prediction.predictedState).toBe(first.prediction.predictedState);
    expect(older.prediction.metrics.staleSnapshots).toBe(2);
  });

  it('rejects an authoritative state from a different immutable ruleset hash', () => {
    const initial = createTestMovementState();
    const prediction = createLocalPrediction(initial, PROFILE);
    const incompatible: MovementSimulationState = {
      ...initial,
      identity: {
        ...initial.identity,
        rulesetHash: '3333333333333333',
      },
    };

    expect(() => reconcileLocalMovement(
      prediction,
      authoritySnapshot(incompatible),
      PROFILE,
      new FakeMovementQueryPort(),
    )).toThrow(/identity does not match/u);
  });

  it('classifies routine, hard-distance, and semantic teleport corrections separately', () => {
    const predicted = predictForward(
      createLocalPrediction(createTestMovementState(), PROFILE),
      0,
    );
    const baseX = predicted.predictedState.player.feetPosition.x;
    const baseZ = predicted.predictedState.player.feetPosition.z;

    const routine = reconcileLocalMovement(
      predicted,
      authoritySnapshot(predicted.predictedState, { x: baseX + 25 }),
      PROFILE,
      new FakeMovementQueryPort(),
    );
    expect(routine).toMatchObject({
      mode: 'subthreshold_correction',
      positionErrorMm: 25,
    });

    const hard = reconcileLocalMovement(
      predicted,
      authoritySnapshot(predicted.predictedState, { x: baseX + 3_000 }),
      PROFILE,
      new FakeMovementQueryPort(),
    );
    expect(hard).toMatchObject({ mode: 'hard_snap', positionErrorMm: 3_000 });

    const teleport = reconcileLocalMovement(
      predicted,
      authoritySnapshot(predicted.predictedState, {
        z: baseZ + 100,
        discontinuity: 'teleport',
      }),
      PROFILE,
      new FakeMovementQueryPort(),
    );
    expect(teleport).toMatchObject({ mode: 'teleport_snap', positionErrorMm: 100 });
  });

  it('keeps history command-bounded and reports whole-frame eviction', () => {
    let prediction = createLocalPrediction(createTestMovementState(), PROFILE, {
      maximumHistoryCommands: 3,
    });
    const first = predictLocalMovementTick(
      prediction,
      [testIntent(0, 0), testIntent(1, 0)],
      PROFILE,
      new FakeMovementQueryPort(),
    );
    prediction = predictForward(first.prediction, 2, 1);
    const overflow = predictLocalMovementTick(
      prediction,
      [testIntent(3, 2)],
      PROFILE,
      new FakeMovementQueryPort(),
    );

    expect(overflow).toMatchObject({ evictedFrames: 1, evictedCommands: 2 });
    expect(overflow.prediction.historyCommandCount).toBe(2);
    expect(overflow.prediction.historyFloorSequence).toBe(1);
    expect(overflow.prediction.history.flatMap((frame) => (
      frame.commands.map(({ sequence }) => sequence)
    ))).toEqual([2, 3]);
    expect(overflow.prediction.metrics).toMatchObject({
      predictedCommands: 4,
      evictedHistoryFrames: 1,
      evictedHistoryCommands: 2,
    });
  });

  it('owns and freezes canonical state instead of retaining caller references', () => {
    const initial = createTestMovementState();
    const prediction = createLocalPrediction(initial, PROFILE);
    (initial.player.feetPosition as unknown as { x: number }).x = 123_456;

    expect(prediction.predictedState.player.feetPosition.x).toBe(0);
    expect(Object.isFrozen(prediction.predictedState)).toBe(true);
    expect(Object.isFrozen(prediction.predictedState.player)).toBe(true);
    expect(Object.isFrozen(prediction.predictedState.player.feetPosition)).toBe(true);
    expect(() => {
      (prediction.predictedState.player.feetPosition as unknown as { x: number }).x = 5;
    }).toThrow();
  });
});
