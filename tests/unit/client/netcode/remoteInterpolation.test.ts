import { describe, expect, it } from 'vitest';

import {
  createRemoteInterpolationBuffer,
  delayedRemoteRenderTick,
  insertRemoteAuthoritativeSample,
  sampleRemoteInterpolation,
  type RemoteAuthoritativeSample,
  type RemoteInterpolationBuffer,
} from '../../../../src/client/netcode';

function remoteSample(
  serverTick: number,
  receivedAtMilliseconds: number,
  overrides: Partial<Omit<RemoteAuthoritativeSample, 'serverTick' | 'receivedAtMilliseconds'>> = {},
): RemoteAuthoritativeSample {
  return {
    entityId: 'remote-1',
    serverTick,
    receivedAtMilliseconds,
    feetPosition: { x: serverTick * 100, y: 0, z: 0 },
    velocity: { x: 2_000, y: 0, z: 0 },
    yawMilliDegrees: 0,
    pitchMilliDegrees: 0,
    grounded: true,
    stance: 'standing',
    locomotion: 'grounded',
    ...overrides,
  };
}

function insert(
  buffer: RemoteInterpolationBuffer,
  sample: RemoteAuthoritativeSample,
): RemoteInterpolationBuffer {
  return insertRemoteAuthoritativeSample(buffer, sample).buffer;
}

describe('remote authoritative interpolation buffer', () => {
  it('interpolates by server tick and takes the shortest yaw path', () => {
    let buffer = createRemoteInterpolationBuffer('remote-1');
    buffer = insert(buffer, remoteSample(10, 100, {
      feetPosition: { x: 0, y: 1_000, z: -100 },
      velocity: { x: 1_000, y: 200, z: 0 },
      yawMilliDegrees: 350_000,
      pitchMilliDegrees: -10_000,
    }));
    buffer = insert(buffer, remoteSample(12, 270, {
      feetPosition: { x: 2_000, y: 1_400, z: 100 },
      velocity: { x: 3_000, y: 600, z: 400 },
      yawMilliDegrees: 10_000,
      pitchMilliDegrees: 10_000,
    }));

    const result = sampleRemoteInterpolation(buffer, 11);
    expect(result).toMatchObject({
      mode: 'interpolated',
      lowerServerTick: 10,
      upperServerTick: 12,
      interpolationAlpha: 0.5,
    });
    expect(result.renderState).toMatchObject({
      feetPosition: { x: 1_000, y: 1_200, z: 0 },
      velocity: { x: 2_000, y: 400, z: 200 },
      yawMilliDegrees: 0,
      pitchMilliDegrees: 0,
    });
  });

  it('orders delayed packets by authority tick and never animates in arrival order', () => {
    let buffer = createRemoteInterpolationBuffer('remote-1');
    buffer = insert(buffer, remoteSample(10, 0));
    buffer = insert(buffer, remoteSample(12, 100));
    const outOfOrder = insertRemoteAuthoritativeSample(buffer, remoteSample(11, 150));
    buffer = outOfOrder.buffer;

    expect(outOfOrder.disposition).toBe('accepted_out_of_order');
    expect(buffer.samples.map(({ serverTick }) => serverTick)).toEqual([10, 11, 12]);
    expect(buffer.metrics.reorderedSamples).toBe(1);
    const render = sampleRemoteInterpolation(buffer, 11.5);
    expect(render).toMatchObject({
      mode: 'interpolated',
      lowerServerTick: 11,
      upperServerTick: 12,
    });
    expect(render.renderState?.feetPosition.x).toBe(1_150);
  });

  it('makes jitter observable without allowing receipt timing to select the pose', () => {
    let onTime = createRemoteInterpolationBuffer('remote-1');
    onTime = insert(onTime, remoteSample(0, 0));
    onTime = insert(onTime, remoteSample(2, 100));

    let jittered = createRemoteInterpolationBuffer('remote-1');
    jittered = insert(jittered, remoteSample(0, 0));
    jittered = insert(jittered, remoteSample(2, 185));

    expect(sampleRemoteInterpolation(jittered, 1).renderState).toEqual(
      sampleRemoteInterpolation(onTime, 1).renderState,
    );
    expect(onTime.metrics.maximumArrivalJitterMilliseconds).toBe(0);
    expect(jittered.metrics.maximumArrivalJitterMilliseconds).toBe(85);
  });

  it('deduplicates identical ticks and retains the first value on conflict', () => {
    let buffer = createRemoteInterpolationBuffer('remote-1');
    const original = remoteSample(5, 10, { feetPosition: { x: 500, y: 0, z: 0 } });
    buffer = insert(buffer, original);
    const duplicate = insertRemoteAuthoritativeSample(
      buffer,
      { ...original, receivedAtMilliseconds: 20 },
    );
    const conflict = insertRemoteAuthoritativeSample(
      duplicate.buffer,
      remoteSample(5, 30, { feetPosition: { x: 999, y: 0, z: 0 } }),
    );

    expect(duplicate.disposition).toBe('duplicate');
    expect(conflict.disposition).toBe('conflicting_duplicate');
    expect(conflict.buffer.samples).toHaveLength(1);
    expect(conflict.buffer.samples[0]?.feetPosition.x).toBe(500);
    expect(conflict.buffer.metrics).toMatchObject({
      receivedSamples: 3,
      acceptedSamples: 1,
      duplicateSamples: 1,
      conflictingDuplicateSamples: 1,
    });
  });

  it('clears incompatible history at semantic teleport and rejects late pre-reset data', () => {
    let buffer = createRemoteInterpolationBuffer('remote-1');
    buffer = insert(buffer, remoteSample(10, 0));
    buffer = insert(buffer, remoteSample(11, 50));
    const teleported = insertRemoteAuthoritativeSample(buffer, remoteSample(12, 100, {
      feetPosition: { x: 50_000, y: 0, z: 0 },
      discontinuity: 'teleport',
    }));
    expect(teleported.disposition).toBe('semantic_discontinuity_reset');
    expect(teleported.buffer.samples.map(({ serverTick }) => serverTick)).toEqual([12]);
    expect(teleported.buffer.resetFloorTick).toBe(12);

    const stale = insertRemoteAuthoritativeSample(
      teleported.buffer,
      remoteSample(11, 150),
    );
    expect(stale.disposition).toBe('stale_before_discontinuity');
    expect(stale.buffer.samples.map(({ serverTick }) => serverTick)).toEqual([12]);
    expect(sampleRemoteInterpolation(stale.buffer, 11)).toMatchObject({
      mode: 'held',
      lowerServerTick: 12,
      upperServerTick: 12,
    });
    expect(sampleRemoteInterpolation(stale.buffer, 12).renderState?.discontinuity)
      .toBe('teleport');
  });

  it('defensively snaps an impossible one-tick displacement lacking a marker', () => {
    let buffer = createRemoteInterpolationBuffer('remote-1', {
      implicitTeleportDistanceMm: 2_000,
    });
    buffer = insert(buffer, remoteSample(20, 0, {
      feetPosition: { x: 0, y: 0, z: 0 },
    }));
    const reset = insertRemoteAuthoritativeSample(buffer, remoteSample(21, 50, {
      feetPosition: { x: 2_001, y: 0, z: 0 },
    }));

    expect(reset.disposition).toBe('implicit_teleport_reset');
    expect(reset.buffer.samples.map(({ serverTick }) => serverTick)).toEqual([21]);
    expect(reset.buffer.metrics.implicitTeleportResets).toBe(1);
  });

  it('bounds extrapolation and freezes at the tested edge once stale', () => {
    let buffer = createRemoteInterpolationBuffer('remote-1', {
      maximumExtrapolationTicks: 2,
      simulationRateHz: 20,
    });
    buffer = insert(buffer, remoteSample(10, 0, {
      feetPosition: { x: 1_000, y: 0, z: 0 },
      velocity: { x: 2_000, y: 0, z: 0 },
    }));

    const brief = sampleRemoteInterpolation(buffer, 11);
    const stale = sampleRemoteInterpolation(buffer, 15);
    expect(brief).toMatchObject({
      mode: 'extrapolated',
      extrapolationTicks: 1,
      staleTicks: 0,
    });
    expect(brief.renderState?.feetPosition.x).toBe(1_100);
    expect(stale).toMatchObject({
      mode: 'stale',
      extrapolationTicks: 2,
      staleTicks: 3,
    });
    expect(stale.renderState?.feetPosition.x).toBe(1_200);
  });

  it('evicts oldest samples at a hard capacity and exposes the delayed target', () => {
    let buffer = createRemoteInterpolationBuffer('remote-1', {
      capacity: 3,
      interpolationDelayTicks: 2,
    });
    for (let tick = 1; tick <= 4; tick += 1) {
      const inserted = insertRemoteAuthoritativeSample(
        buffer,
        remoteSample(tick, tick * 50),
      );
      buffer = inserted.buffer;
    }

    expect(buffer.samples.map(({ serverTick }) => serverTick)).toEqual([2, 3, 4]);
    expect(buffer.metrics).toMatchObject({
      acceptedSamples: 4,
      evictedSamples: 1,
      maximumBufferDepth: 3,
    });
    expect(delayedRemoteRenderTick(buffer, 10.5)).toBe(8.5);
  });

  it('detaches and freezes samples so transport objects cannot mutate presentation history', () => {
    const input = remoteSample(1, 0);
    const inserted = insertRemoteAuthoritativeSample(
      createRemoteInterpolationBuffer('remote-1'),
      input,
    );
    (input.feetPosition as { x: number }).x = 99_000;

    expect(inserted.buffer.samples[0]?.feetPosition.x).toBe(100);
    expect(Object.isFrozen(inserted.buffer)).toBe(true);
    expect(Object.isFrozen(inserted.buffer.samples)).toBe(true);
    expect(Object.isFrozen(inserted.buffer.samples[0]?.feetPosition)).toBe(true);
  });
});
