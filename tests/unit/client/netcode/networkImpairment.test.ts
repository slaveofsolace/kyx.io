import { describe, expect, it } from 'vitest';

import {
  createLocalPrediction,
  createNetworkImpairmentHarness,
  createRemoteInterpolationBuffer,
  insertRemoteAuthoritativeSample,
  predictLocalMovementTick,
  reconcileLocalMovement,
  sampleRemoteInterpolation,
  type AuthoritativeLocalMovementSnapshot,
  type NetworkImpairmentConfig,
  type RemoteAuthoritativeSample,
} from '../../../../src/client/netcode';
import {
  PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
  asQuantizedAxis,
  hashCanonicalMovementState,
} from '../../../../src/sim';
import {
  FakeMovementQueryPort,
  createTestMovementState,
  testIntent,
} from '../../sim/movement/fakeQueryPort';

function directive(
  latencyMilliseconds: number,
  overrides: Partial<{
    readonly drop: boolean;
    readonly duplicateDelayMilliseconds: number | null;
    readonly reorderDelayMilliseconds: number;
  }> = {},
) {
  return {
    latencyMilliseconds,
    drop: overrides.drop ?? false,
    duplicateDelayMilliseconds: overrides.duplicateDelayMilliseconds ?? null,
    reorderDelayMilliseconds: overrides.reorderDelayMilliseconds ?? 0,
  } as const;
}

function remoteSample(serverTick: number): Omit<RemoteAuthoritativeSample, 'receivedAtMilliseconds'> {
  return {
    entityId: 'remote-harness',
    serverTick,
    feetPosition: { x: serverTick * 100, y: 0, z: 0 },
    velocity: { x: 2_000, y: 0, z: 0 },
    yawMilliDegrees: 0,
    pitchMilliDegrees: 0,
    grounded: true,
    stance: 'standing',
    locomotion: 'grounded',
  };
}

describe('deterministic network impairment harness', () => {
  it('deeply detaches and freezes strict scripted configuration', () => {
    const source = {
      kind: 'scripted',
      startingClockMilliseconds: 5,
      maximumQueueDepth: 4,
      schedule: [directive(10)],
    } satisfies NetworkImpairmentConfig;
    const harness = createNetworkImpairmentHarness<string>(source);
    (source.schedule as { latencyMilliseconds: number }[])[0]!.latencyMilliseconds = 999;

    expect(harness.config).toMatchObject({
      kind: 'scripted',
      schedule: [{ latencyMilliseconds: 10 }],
    });
    expect(Object.isFrozen(harness.config)).toBe(true);
    expect(Object.isFrozen(harness.config.kind === 'scripted' && harness.config.schedule)).toBe(true);
    expect(Object.isFrozen(harness.config.kind === 'scripted' && harness.config.schedule[0])).toBe(true);
    expect(() => createNetworkImpairmentHarness({
      ...source,
      surprise: true,
    } as NetworkImpairmentConfig)).toThrow(/unsupported key surprise/u);
  });

  it('applies loss, duplication, deliberate delay, and stable same-time delivery', () => {
    const harness = createNetworkImpairmentHarness<string>({
      kind: 'scripted',
      startingClockMilliseconds: 0,
      maximumQueueDepth: 8,
      schedule: [
        directive(5, { duplicateDelayMilliseconds: 0 }),
        directive(1, { drop: true }),
        directive(2, { reorderDelayMilliseconds: 20 }),
        directive(2),
      ],
    });
    harness.send('first', 0);
    harness.send('lost', 1);
    harness.send('delayed', 2);
    harness.send('overtaker', 3);

    const firstDrain = harness.drain(5);
    expect(firstDrain.map(({ payload, copyIndex }) => [payload, copyIndex])).toEqual([
      ['first', 0],
      ['first', 1],
      ['overtaker', 0],
    ]);
    expect(harness.drain(24).map(({ payload }) => payload)).toEqual(['delayed']);
    expect(harness.metrics()).toMatchObject({
      sentPackets: 4,
      droppedPackets: 1,
      duplicatedPackets: 1,
      reorderImpairedPackets: 1,
      reorderedPackets: 1,
      scheduledCopies: 4,
      deliveredPackets: 3,
      deliveredCopies: 4,
      currentQueueDepth: 0,
      maximumObservedQueueDepth: 4,
      minimumDeliveryLatencyMilliseconds: 2,
      maximumDeliveryLatencyMilliseconds: 22,
      totalDeliveryLatencyMilliseconds: 34,
      averageDeliveryLatencyMilliseconds: 8.5,
    });
  });

  it('fails closed before partial overflow and retains the unconsumed directive', () => {
    const harness = createNetworkImpairmentHarness<string>({
      kind: 'scripted',
      startingClockMilliseconds: 0,
      maximumQueueDepth: 1,
      schedule: [directive(10, { duplicateDelayMilliseconds: 1 })],
    });

    expect(() => harness.send('cannot-partially-queue', 0)).toThrow(/capacity/u);
    expect(harness.metrics()).toMatchObject({
      sentPackets: 0,
      overflowRejectedPackets: 1,
      currentQueueDepth: 0,
    });
    expect(() => harness.send('same-directive-remains', 0)).toThrow(/capacity/u);
    expect(harness.metrics().overflowRejectedPackets).toBe(2);
  });

  it('rejects backward time and exhausts an explicit script instead of inventing behavior', () => {
    const harness = createNetworkImpairmentHarness<string>({
      kind: 'scripted',
      startingClockMilliseconds: 10,
      maximumQueueDepth: 2,
      schedule: [directive(0)],
    });
    expect(() => harness.send('past', 9)).toThrow(/cannot move backward/u);
    harness.send('present', 10);
    expect(() => harness.drain(9)).toThrow(/cannot move backward/u);
    expect(harness.drain(10)).toHaveLength(1);
    expect(() => harness.send('unscripted', 10)).toThrow(/schedule is exhausted/u);
  });

  it('produces identical seeded schedules and metrics without wall-clock randomness', () => {
    const config = {
      kind: 'seeded',
      startingClockMilliseconds: 0,
      maximumQueueDepth: 64,
      seed: 0x51f1_0a7e,
      baseLatencyMilliseconds: 40,
      jitterMilliseconds: 15,
      lossRatePermille: 200,
      duplicateRatePermille: 300,
      duplicateDelayMilliseconds: 3,
      reorderRatePermille: 250,
      reorderDelayMilliseconds: 35,
    } as const;
    const left = createNetworkImpairmentHarness<number>(config);
    const right = createNetworkImpairmentHarness<number>(config);
    const leftSends = [];
    const rightSends = [];
    for (let packet = 0; packet < 20; packet += 1) {
      leftSends.push(left.send(packet, packet * 2));
      rightSends.push(right.send(packet, packet * 2));
    }
    const leftDeliveries = left.drain(1_000);
    const rightDeliveries = right.drain(1_000);

    expect(rightSends).toEqual(leftSends);
    expect(rightDeliveries).toEqual(leftDeliveries);
    expect(right.metrics()).toEqual(left.metrics());
    expect(left.metrics()).toMatchObject({ sentPackets: 20, currentQueueDepth: 0 });
    expect(left.metrics().droppedPackets).toBeGreaterThan(0);
    expect(left.metrics().deliveredCopies).toBeGreaterThan(0);
  });

  it('feeds a lost and overtaken authority stream into tick-ordered remote interpolation', () => {
    const harness = createNetworkImpairmentHarness<
      Omit<RemoteAuthoritativeSample, 'receivedAtMilliseconds'>
    >({
      kind: 'scripted',
      startingClockMilliseconds: 0,
      maximumQueueDepth: 4,
      schedule: [directive(100), directive(10, { drop: true }), directive(10)],
    });
    harness.send(remoteSample(10), 0);
    harness.send(remoteSample(11), 1);
    harness.send(remoteSample(12), 2);

    let buffer = createRemoteInterpolationBuffer('remote-harness');
    for (const delivery of harness.drain(12)) {
      buffer = insertRemoteAuthoritativeSample(buffer, {
        ...delivery.payload,
        receivedAtMilliseconds: delivery.deliveredAtMilliseconds,
      }).buffer;
    }
    expect(buffer.samples.map(({ serverTick }) => serverTick)).toEqual([12]);
    for (const delivery of harness.drain(100)) {
      buffer = insertRemoteAuthoritativeSample(buffer, {
        ...delivery.payload,
        receivedAtMilliseconds: delivery.deliveredAtMilliseconds,
      }).buffer;
    }

    expect(buffer.samples.map(({ serverTick }) => serverTick)).toEqual([10, 12]);
    expect(buffer.metrics.reorderedSamples).toBe(1);
    expect(sampleRemoteInterpolation(buffer, 11)).toMatchObject({
      mode: 'interpolated',
      lowerServerTick: 10,
      upperServerTick: 12,
      interpolationAlpha: 0.5,
      renderState: { feetPosition: { x: 1_100, y: 0, z: 0 } },
    });
    expect(harness.metrics()).toMatchObject({
      droppedPackets: 1,
      reorderedPackets: 1,
    });
  });

  it('replays the exact unacknowledged suffix when delayed authority arrives', () => {
    const profile = PHASE3_HYPOTHESIS_MOVEMENT_PROFILE;
    const queries = new FakeMovementQueryPort();
    let prediction = createLocalPrediction(createTestMovementState(), profile);
    prediction = predictLocalMovementTick(
      prediction,
      [testIntent(0, 0, { moveZ: asQuantizedAxis(127) })],
      profile,
      queries,
    ).prediction;
    const delayedAuthority: AuthoritativeLocalMovementSnapshot = {
      state: prediction.predictedState,
    };
    const harness = createNetworkImpairmentHarness<AuthoritativeLocalMovementSnapshot>({
      kind: 'scripted',
      startingClockMilliseconds: 0,
      maximumQueueDepth: 2,
      schedule: [directive(100)],
    });
    harness.send(delayedAuthority, 0);
    prediction = predictLocalMovementTick(
      prediction,
      [testIntent(1, 1, { moveZ: asQuantizedAxis(127) })],
      profile,
      queries,
    ).prediction;
    prediction = predictLocalMovementTick(
      prediction,
      [testIntent(2, 2, { moveZ: asQuantizedAxis(127) })],
      profile,
      queries,
    ).prediction;
    const beforeReconciliationHash = hashCanonicalMovementState(prediction.predictedState);
    const [delivery] = harness.drain(100);
    expect(delivery).toBeDefined();
    const reconciled = reconcileLocalMovement(
      prediction,
      delivery!.payload,
      profile,
      new FakeMovementQueryPort(),
    );

    expect(reconciled).toMatchObject({
      mode: 'confirmed',
      acknowledgedSequence: 0,
      replayedTicks: 2,
      replayedCommands: 2,
    });
    expect(reconciled.reconciledPredictedHash).toBe(beforeReconciliationHash);
  });
});
