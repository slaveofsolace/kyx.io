import { describe, expect, it } from 'vitest';

import {
  CLIENT_MESSAGE_TYPES,
  PROTOCOL_LIMITS,
  PROTOCOL_VERSION,
  RELIABLE_EVENT_STREAM_VERSION,
  SNAPSHOT_BASELINE_VERSION,
  decodeServerMessage,
  encodeServerMessage,
  validateClientMessage,
  validateServerMessage,
  type LocalReconciliationStateV1,
  type SimulationIdentityV1,
  type SnapshotEntity,
} from '../../../src/net';

const resumeToken = 'A'.repeat(43);

const simulationIdentity = {
  schemaVersion: 1,
  mapId: 'phase4_flat_run',
  rulesetId: 'revamped_classic',
  rulesetRevision: 1,
  rulesetHash: 'a'.repeat(64),
  movementProfileId: 'phase3_hypothesis_v1',
  movementProfileRevision: 1,
  movementProfileHash: '8ab4ed437a4393c0',
  fixtureId: 'flat_run_v1',
  fixtureHash: 'b'.repeat(64),
  physicsAdapterId: 'rapier3d_deterministic',
  physicsAdapterVersion: '0.19.3',
} as const satisfies SimulationIdentityV1;

const localReconciliation = {
  schemaVersion: 1,
  identity: {
    rulesetId: simulationIdentity.rulesetId,
    rulesetRevision: simulationIdentity.rulesetRevision,
    rulesetHash: simulationIdentity.rulesetHash,
    movementProfileId: simulationIdentity.movementProfileId,
    movementProfileRevision: simulationIdentity.movementProfileRevision,
    movementProfileHash: simulationIdentity.movementProfileHash,
    fixtureId: simulationIdentity.fixtureId,
    fixtureHash: simulationIdentity.fixtureHash,
    physicsAdapterId: simulationIdentity.physicsAdapterId,
    physicsAdapterVersion: simulationIdentity.physicsAdapterVersion,
  },
  simulationRateHz: 20,
  tick: 7,
  player: {
    id: 'player.1',
    feetPosition: { x: 1_250, y: 0, z: -3_000 },
    velocity: { x: 250, y: 0, z: 6_000 },
    integrationRemainders: {
      positionX: 1,
      positionY: -2,
      positionZ: 3,
      planarAcceleration: 4,
      gravity: -5,
    },
    yawMilliDegrees: 270_000,
    pitchMilliDegrees: -5_730,
    lastProcessedSequence: -1,
    ticksSinceAcceptedCommand: 2,
    intent: {
      moveX: 0,
      moveZ: 127,
      heldButtons: 1,
      pressedButtons: 1,
      releasedButtons: 0,
      selectedSlot: 0,
    },
    stance: 'standing',
    locomotion: 'grounded',
    grounded: true,
    support: {
      colliderId: 'ground.1',
      layer: 'world_static',
      normalQ15: { x: 0, y: 32_767, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
    },
    coyoteTicksRemaining: 2,
    jumpBufferTicksRemaining: 0,
    slideTicksRemaining: 0,
    slideCooldownTicksRemaining: 0,
    teleportCooldownTicksRemaining: 0,
    standBlocked: false,
    activeVolumes: [{ colliderId: 'recovery.1', kind: 'recovery' }],
  },
} as const satisfies LocalReconciliationStateV1;

const localEntity = {
  id: localReconciliation.player.id,
  kind: 'player',
  xMillimeters: localReconciliation.player.feetPosition.x,
  yMillimeters: localReconciliation.player.feetPosition.y,
  zMillimeters: localReconciliation.player.feetPosition.z,
  velocityXMillimetersPerSecond: localReconciliation.player.velocity.x,
  velocityYMillimetersPerSecond: localReconciliation.player.velocity.y,
  velocityZMillimetersPerSecond: localReconciliation.player.velocity.z,
  yawMilliDegrees: -90_000,
  pitchMilliDegrees: localReconciliation.player.pitchMilliDegrees,
  healthPoints: 100,
  shieldPoints: 0,
} as const satisfies SnapshotEntity;

const fullSnapshot = {
  protocolVersion: PROTOCOL_VERSION,
  type: 'fullSnapshot',
  snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
  snapshotBaselineId: 'baseline.7',
  reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
  reliableEventBaselineId: null,
  matchId: 'match.1',
  serverTick: localReconciliation.tick,
  phase: 'active',
  phaseEndsAtTick: 9_600,
  simulationIdentity,
  localReconciliation,
  entities: [localEntity],
} as const;

describe('protocol v2 identity and resume boundary', () => {
  it('rejects protocol v1 instead of upconverting it', () => {
    expect(PROTOCOL_VERSION).toBe(2);
    expect(validateClientMessage({
      protocolVersion: 1,
      type: 'hello',
      requestId: 'req.1',
      clientBuild: 'build.1',
      requestedRulesetId: 'revamped_classic',
      capabilities: [],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_VERSION_UNSUPPORTED',
        path: '$.protocolVersion',
      }),
    });
  });

  it('adds resumeRoom without accepting a client-authored player ID', () => {
    expect(CLIENT_MESSAGE_TYPES).toContain('resumeRoom');
    expect(PROTOCOL_LIMITS.maxResumeTokenBytes).toBe(64);
    expect(PROTOCOL_LIMITS.resumeTokenCharacters).toBe(43);

    const message = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'resumeRoom',
      requestId: 'req.resume.1',
      roomCode: 'KYX-ABCDEF',
      resumeToken,
    } as const;
    expect(validateClientMessage(message)).toEqual({ ok: true, value: message });
    expect(validateClientMessage({ ...message, playerId: 'player.1' })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_UNKNOWN_FIELD', path: '$.playerId' }),
    });
  });

  it.each([
    ['short', 'A'.repeat(42)],
    ['long', 'A'.repeat(44)],
    ['padded', `${'A'.repeat(42)}=`],
    ['non-base64url', `${'A'.repeat(42)}+`],
  ])('rejects a %s resume credential', (_label, invalidToken) => {
    expect(validateClientMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: 'resumeRoom',
      requestId: 'req.resume.1',
      roomCode: 'KYX-ABCDEF',
      resumeToken: invalidToken,
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_INVALID_FIELD_VALUE',
        path: '$.resumeToken',
      }),
    });
  });

  it('requires immutable simulation identity and a rotated token on join acceptance', () => {
    const joined = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'joinAccepted',
      requestId: 'req.join.1',
      playerId: 'player.1',
      roomId: 'room.1',
      matchId: 'match.1',
      serverTick: 7,
      connectionMode: 'joined',
      resumeToken,
      simulationIdentity,
    } as const;
    expect(validateServerMessage(joined)).toEqual({ ok: true, value: joined });
    expect(validateServerMessage({ ...joined, connectionMode: 'resume' })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_INVALID_FIELD_VALUE',
        path: '$.connectionMode',
      }),
    });
    expect(validateServerMessage({ ...joined, rulesetId: simulationIdentity.rulesetId })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_UNKNOWN_FIELD', path: '$.rulesetId' }),
    });
  });

  it.each(['DUPLICATE_SESSION', 'RESUME_REJECTED'] as const)(
    'accepts stable %s rejection without disclosing token state',
    (code) => {
      const rejected = {
        protocolVersion: PROTOCOL_VERSION,
        type: 'joinRejected',
        requestId: 'req.resume.1',
        code,
      } as const;
      expect(validateServerMessage(rejected)).toEqual({ ok: true, value: rejected });
    },
  );
});

describe('protocol v2 canonical local reconciliation', () => {
  it('round-trips and recursively freezes an exact local movement state', () => {
    const encoded = encodeServerMessage(structuredClone(fullSnapshot));
    expect(encoded.ok).toBe(true);
    if (!encoded.ok) return;
    expect(encoded.byteLength).toBeLessThanOrEqual(PROTOCOL_LIMITS.maxMessageBytes);

    const decoded = decodeServerMessage(encoded.bytes);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || decoded.value.type !== 'fullSnapshot') return;
    expect(decoded.value).toEqual(fullSnapshot);
    expect(Object.isFrozen(decoded.value)).toBe(true);
    expect(Object.isFrozen(decoded.value.simulationIdentity)).toBe(true);
    expect(Object.isFrozen(decoded.value.localReconciliation.player.intent)).toBe(true);
    expect(Object.isFrozen(decoded.value.localReconciliation.player.activeVolumes)).toBe(true);
  });

  it.each([
    ['press then release', 0],
    ['release then press', 8],
  ] as const)('encodes a same-tick %s aggregate with terminal held state %i', (_label, heldButtons) => {
    const pulseSnapshot = {
      ...fullSnapshot,
      localReconciliation: {
        ...localReconciliation,
        player: {
          ...localReconciliation.player,
          intent: {
            ...localReconciliation.player.intent,
            heldButtons,
            pressedButtons: 8,
            releasedButtons: 8,
          },
        },
      },
    } as const;

    expect(encodeServerMessage(pulseSnapshot)).toEqual(expect.objectContaining({ ok: true }));

    const input = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputBatch',
      commands: [{
        type: 'input',
        sequence: 0,
        clientTick: 0,
        moveX: 0,
        moveY: 0,
        heldButtons: 0,
        pressedButtons: 8,
        releasedButtons: 8,
        lookYawDeltaMilliDegrees: 0,
        lookPitchDeltaMilliDegrees: 0,
        selectedSlot: 0,
      }],
    } as const;
    expect(validateClientMessage(input)).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_INVALID_FIELD_VALUE',
        path: '$.commands[0].pressedButtons',
      }),
    });
  });

  it('uses local reconciliation as the only snapshot acknowledgement truth', () => {
    expect(validateServerMessage({
      ...fullSnapshot,
      lastProcessedInputSequence: 0,
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_UNKNOWN_FIELD',
        path: '$.lastProcessedInputSequence',
      }),
    });
    expect(validateServerMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputAck',
      serverTick: 7,
      lastProcessedInputSequence: -1,
    })).toEqual({
      ok: true,
      value: {
        protocolVersion: PROTOCOL_VERSION,
        type: 'inputAck',
        serverTick: 7,
        lastProcessedInputSequence: -1,
      },
    });
    expect(validateServerMessage({
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputAck',
      serverTick: 7,
      lastProcessedInputSequence: -2,
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_NUMERIC_OUT_OF_RANGE',
        path: '$.lastProcessedInputSequence',
      }),
    });
  });

  it('requires reconciliation and snapshot ticks to be identical', () => {
    expect(validateServerMessage({ ...fullSnapshot, serverTick: 8 })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_INVALID_FIELD_VALUE',
        path: '$.localReconciliation.tick',
      }),
    });
  });

  it('requires the canonical movement identity to match the full snapshot identity', () => {
    expect(validateServerMessage({
      ...fullSnapshot,
      localReconciliation: {
        ...localReconciliation,
        identity: { ...localReconciliation.identity, fixtureHash: 'c'.repeat(64) },
      },
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_INVALID_FIELD_VALUE',
        path: '$.localReconciliation.identity.fixtureHash',
      }),
    });
  });

  it.each([
    ['position', { xMillimeters: localEntity.xMillimeters + 1 }, '$.entities[0].xMillimeters'],
    [
      'velocity',
      { velocityZMillimetersPerSecond: localEntity.velocityZMillimetersPerSecond + 1 },
      '$.entities[0].velocityZMillimetersPerSecond',
    ],
    ['orientation', { yawMilliDegrees: localEntity.yawMilliDegrees + 1 }, '$.entities[0].yawMilliDegrees'],
  ])('rejects a contradictory local %s projection', (_label, change, path) => {
    expect(validateServerMessage({
      ...fullSnapshot,
      entities: [{ ...localEntity, ...change }],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_INVALID_FIELD_VALUE', path }),
    });
  });

  it('requires the local entity in a full snapshot', () => {
    expect(validateServerMessage({ ...fullSnapshot, entities: [] })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_REQUIRED_FIELD', path: '$.entities' }),
    });
  });

  it('allows an unchanged local projection to be omitted from a delta but never removed', () => {
    const delta = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'deltaSnapshot',
      snapshotBaselineVersion: SNAPSHOT_BASELINE_VERSION,
      baseSnapshotBaselineId: 'baseline.6',
      snapshotBaselineId: 'baseline.7',
      matchId: 'match.1',
      baseTick: 6,
      serverTick: 7,
      phase: 'active',
      phaseEndsAtTick: 9_600,
      localReconciliation,
      entities: [],
      removedEntityIds: ['projectile.1'],
    } as const;
    expect(validateServerMessage(delta)).toEqual({ ok: true, value: delta });
    expect(validateServerMessage({
      ...delta,
      removedEntityIds: [localReconciliation.player.id],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_INVALID_FIELD_VALUE',
        path: '$.removedEntityIds',
      }),
    });
  });

  it('rejects internally contradictory canonical movement state', () => {
    expect(validateServerMessage({
      ...fullSnapshot,
      localReconciliation: {
        ...localReconciliation,
        player: {
          ...localReconciliation.player,
          grounded: false,
          locomotion: 'airborne',
        },
      },
    })).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'PROTOCOL_INVALID_FIELD_VALUE',
        path: '$.localReconciliation.player.support',
      }),
    });
  });
});

describe('protocol v2 input ordering', () => {
  it('retains an ordered fast press and release pair', () => {
    const fastTap = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'inputBatch',
      commands: [
        {
          type: 'input',
          sequence: 41,
          clientTick: 100,
          moveX: 0,
          moveY: 0,
          lookYawDeltaMilliDegrees: 0,
          lookPitchDeltaMilliDegrees: 0,
          heldButtons: 1,
          pressedButtons: 1,
          releasedButtons: 0,
        },
        {
          type: 'input',
          sequence: 42,
          clientTick: 100,
          moveX: 0,
          moveY: 0,
          lookYawDeltaMilliDegrees: 0,
          lookPitchDeltaMilliDegrees: 0,
          heldButtons: 0,
          pressedButtons: 0,
          releasedButtons: 1,
        },
      ],
    } as const;
    expect(validateClientMessage(fastTap)).toEqual({ ok: true, value: fastTap });
    expect(validateClientMessage({
      ...fastTap,
      commands: [fastTap.commands[1], fastTap.commands[0]],
    })).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'PROTOCOL_SEQUENCE_INVALID' }),
    });
  });
});
