import { describe, expect, it } from 'vitest';

import {
  deriveLocomotionPresentationSignal,
  createRemoteInterpolationBuffer,
  insertRemoteAuthoritativeSample,
  sampleRemoteInterpolation,
} from '../../../src/client';
import {
  accumulateAuthorityLookImpulse,
  consumeAuthorityLookImpulse,
  createAuthorityLookInputState,
  sampleAuthorityLookDelta,
  setAuthorityContinuousLook,
} from '../../../src/dev/authorityLookInput';
import { remoteSampleFromSnapshotEntity } from '../../../src/dev/authorityEvidenceModel';
import type { SnapshotEntity } from '../../../src/net';
import { SnapshotBaselineStore } from '../../../worker/snapshotBaselines';

function playerEntity(
  movement: NonNullable<SnapshotEntity['movement']>,
  overrides: Partial<SnapshotEntity> = {},
): SnapshotEntity {
  return Object.freeze({
    id: 'player.remote',
    kind: 'player',
    xMillimeters: 0,
    yMillimeters: 6_500,
    zMillimeters: 0,
    velocityXMillimetersPerSecond: 0,
    velocityYMillimetersPerSecond: 0,
    velocityZMillimetersPerSecond: 0,
    yawMilliDegrees: 0,
    pitchMilliDegrees: 0,
    healthPoints: 100,
    shieldPoints: 0,
    movement,
    ...overrides,
  });
}

describe('movement and ability feel batch sentinel', () => {
  it('accumulates render-frame pointer motion exactly once beside held look', () => {
    let state = createAuthorityLookInputState();
    state = setAuthorityContinuousLook(state, 1_500, -250);
    state = accumulateAuthorityLookImpulse(state, 400, 100);
    state = accumulateAuthorityLookImpulse(state, -125, 300);

    expect(sampleAuthorityLookDelta(state)).toEqual({
      yawMilliDegrees: 1_775,
      pitchMilliDegrees: 150,
    });

    state = consumeAuthorityLookImpulse(state);
    expect(sampleAuthorityLookDelta(state)).toEqual({
      yawMilliDegrees: 1_500,
      pitchMilliDegrees: -250,
    });
  });

  it('derives signed forward, strafe, and backpedal sectors from measured motion', () => {
    expect(deriveLocomotionPresentationSignal({ x: 0, z: 7_000 }, 0))
      .toMatchObject({
        sector: 'forward',
        forwardSpeedMillimetersPerSecond: 7_000,
        rightSpeedMillimetersPerSecond: 0,
        gaitPlaybackDirection: 1,
      });
    expect(deriveLocomotionPresentationSignal({ x: 7_000, z: 0 }, 0))
      .toMatchObject({
        sector: 'right',
        forwardSpeedMillimetersPerSecond: 0,
        rightSpeedMillimetersPerSecond: 7_000,
        strafeLean: -1,
      });
    expect(deriveLocomotionPresentationSignal({ x: 0, z: -7_000 }, 0))
      .toMatchObject({
        sector: 'backward',
        forwardSpeedMillimetersPerSecond: -7_000,
        gaitPlaybackDirection: -1,
      });
    expect(deriveLocomotionPresentationSignal({ x: 7_000, z: 0 }, 90_000))
      .toMatchObject({
        sector: 'forward',
        forwardSpeedMillimetersPerSecond: 7_000,
      });
  });

  it('preserves elevated crouch/slide authority through remote interpolation', () => {
    const entity = playerEntity(Object.freeze({
      schemaVersion: 1,
      grounded: true,
      stance: 'crouched',
      locomotion: 'sliding',
    }), {
      velocityXMillimetersPerSecond: 6_000,
    });
    const sample = remoteSampleFromSnapshotEntity(entity, 20, 1_000, true);
    expect(sample).toMatchObject({
      grounded: true,
      stance: 'crouched',
      locomotion: 'sliding',
      feetPosition: { y: 6_500 },
    });

    const inserted = insertRemoteAuthoritativeSample(
      createRemoteInterpolationBuffer(entity.id),
      sample,
    );
    const rendered = sampleRemoteInterpolation(inserted.buffer, 20).renderState;
    expect(rendered).toMatchObject({
      grounded: true,
      stance: 'crouched',
      locomotion: 'sliding',
      locomotionSignal: {
        sector: 'right',
        strafeLean: -1,
      },
    });
  });

  it('emits a delta when only authoritative movement state changes', () => {
    const standing = playerEntity(Object.freeze({
      schemaVersion: 1,
      grounded: true,
      stance: 'standing',
      locomotion: 'grounded',
    }));
    const sliding = playerEntity(Object.freeze({
      schemaVersion: 1,
      grounded: true,
      stance: 'crouched',
      locomotion: 'sliding',
    }));
    const baselines = new SnapshotBaselineStore();
    const baseId = baselines.remember(10, [standing]);
    const currentId = baselines.remember(11, [sliding]);
    expect(baselines.deltaFrom(baseId, 10, currentId, 11)?.entities)
      .toEqual([sliding]);
  });
});
