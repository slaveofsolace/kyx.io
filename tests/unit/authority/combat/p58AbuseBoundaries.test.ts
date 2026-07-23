import { describe, expect, it } from 'vitest';

import {
  AuthoritativeRoom,
  G4_COMBAT_ROOM_PROFILE_ID,
  G4_COMBAT_RULESET_HASH,
  G4_COMBAT_RULESET_ID,
  G4_COMBAT_RULESET_REVISION,
  type AuthorityRoomTickResult,
} from '../../../../src/authority';
import {
  PROTOCOL_LIMITS,
  PROTOCOL_VERSION,
  validateClientMessage,
  type InputBatchMessage,
  type InputCommand,
} from '../../../../src/net';
import { INTENT_BUTTON, PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../../../src/sim';
import { FakeMovementQueryPort } from '../../sim/movement/fakeQueryPort';

function abuseRoom(): AuthoritativeRoom {
  const authority = new AuthoritativeRoom({
    identity: {
      roomId: 'room_p58_abuse',
      matchId: 'match_p58_abuse',
      rulesetId: G4_COMBAT_RULESET_ID,
      rulesetRevision: G4_COMBAT_RULESET_REVISION,
      rulesetHash: G4_COMBAT_RULESET_HASH,
      mapId: 'p58_abuse_fixture',
      fixtureId: 'p58_abuse_fixture',
      fixtureHash: '5858585858585858',
      physicsAdapterId: 'fake_query_port',
      physicsAdapterVersion: '1.0.0',
    },
    profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
    queries: new FakeMovementQueryPort(),
    warmupTicks: 40,
    activeTicks: 9_600,
    postmatchTicks: 200,
    minimumConnectedPlayersToStart: 2,
    spawnResolver: (playerId, ordinal) => ({
      spawnId: `spawn_${playerId}`,
      feetPosition: { x: ordinal * 10_000, y: 0, z: 0 },
    }),
    combat: {
      profileId: G4_COMBAT_ROOM_PROFILE_ID,
      teamResolver: (_playerId, ordinal) => ordinal === 0 ? 'team_blue' : 'team_red',
    },
  });
  expect(authority.joinNewPlayer({
    playerId: 'player_A',
    connectionId: 'connection_A',
  })).toMatchObject({ ok: true });
  expect(authority.joinNewPlayer({
    playerId: 'player_B',
    connectionId: 'connection_B',
  })).toMatchObject({ ok: true });
  expect(authority.startMatch()).toBe(true);
  return authority;
}

function input(sequence: number, overrides: Partial<InputCommand> = {}): InputCommand {
  return {
    type: 'input',
    sequence,
    clientTick: sequence,
    moveX: 0,
    moveY: 0,
    lookYawDeltaMilliDegrees: 0,
    lookPitchDeltaMilliDegrees: 0,
    heldButtons: 0,
    pressedButtons: 0,
    releasedButtons: 0,
    selectedSlot: 0,
    ...overrides,
  };
}

function batch(command: unknown): Readonly<Record<string, unknown>> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'inputBatch',
    commands: [command],
  };
}

function validBatch(sequence: number, overrides: Partial<InputCommand> = {}): InputBatchMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'inputBatch',
    commands: [input(sequence, overrides)],
  };
}

function acceptedShots(frame: AuthorityRoomTickResult): readonly Readonly<{
  eventId: string;
  authorityTick: number;
}>[] {
  return Object.freeze((frame.combatEvents ?? [])
    .filter(({ kind }) => kind === 'auto_rifle_shot_accepted')
    .map(({ eventId, authorityTick }) => Object.freeze({ eventId, authorityTick })));
}

function fnv1a64(source: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(source)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, '0');
}

function runDuplicateReorderTrace(): Readonly<Record<string, unknown>> {
  const authority = abuseRoom();
  while (authority.serverTick < 4) authority.advanceOneTick();
  const fire = INTENT_BUTTON.primaryFire;
  const events: Array<Readonly<{ eventId: string; authorityTick: number }>> = [];

  expect(authority.enqueueInputBatch(
    'connection_A',
    validBatch(0, { heldButtons: fire, pressedButtons: fire }),
  )).toMatchObject({ accepted: 1, rejections: [] });
  expect(authority.enqueueInputBatch(
    'connection_A',
    validBatch(0, { heldButtons: fire, pressedButtons: fire }),
  ).rejections).toEqual([{ sequence: 0, reason: 'duplicate_sequence' }]);
  events.push(...acceptedShots(authority.advanceOneTick()));

  expect(authority.enqueueInputBatch(
    'connection_A',
    validBatch(2, { heldButtons: fire }),
  )).toMatchObject({ accepted: 1, rejections: [] });
  expect(authority.enqueueInputBatch(
    'connection_A',
    validBatch(2, { heldButtons: fire }),
  ).rejections).toEqual([{ sequence: 2, reason: 'duplicate_sequence' }]);
  events.push(...acceptedShots(authority.advanceOneTick()));

  expect(authority.enqueueInputBatch(
    'connection_A',
    validBatch(1, { heldButtons: fire }),
  )).toMatchObject({ accepted: 1, rejections: [] });
  events.push(...acceptedShots(authority.advanceOneTick()));
  expect(authority.enqueueInputBatch(
    'connection_A',
    validBatch(0, { heldButtons: fire }),
  ).rejections).toEqual([{ sequence: 0, reason: 'stale_sequence' }]);

  const local = authority.fullSnapshot().players.find(({ playerId }) => playerId === 'player_A');
  return Object.freeze({
    events: Object.freeze(events),
    serverTick: authority.serverTick,
    rifle: local?.combat?.autoRifle,
    metrics: authority.metricsSnapshot(),
  });
}

describe('P5.8A deterministic combat abuse boundaries', () => {
  it.each([
    ['Kill', 'PROTOCOL_FORBIDDEN_COMMAND'],
    ['Damage', 'PROTOCOL_FORBIDDEN_COMMAND'],
    ['SetScore', 'PROTOCOL_FORBIDDEN_COMMAND'],
    ['Hit', 'PROTOCOL_TYPE_UNSUPPORTED'],
    ['Death', 'PROTOCOL_TYPE_UNSUPPORTED'],
    ['Projectile', 'PROTOCOL_TYPE_UNSUPPORTED'],
    ['Detonation', 'PROTOCOL_TYPE_UNSUPPORTED'],
  ] as const)(
    'rejects forged %s facts at both protocol and room input boundaries',
    (type, errorCode) => {
      const authority = abuseRoom();
      const before = authority.fullSnapshot();
      const forged = batch({ type, sequence: 0, clientTick: 0 });
      expect(validateClientMessage(forged)).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: errorCode,
          path: '$.commands[0].type',
        }),
      });
      expect(() => authority.enqueueInputBatch('connection_A', forged))
        .toThrow('AUTHORITY_INPUT_BATCH_INVALID');
      expect(authority.fullSnapshot()).toEqual(before);
      expect(authority.metricsSnapshot().acceptedInputs).toBe(0);
    },
  );

  it.each([
    ['weaponId', 'forged_rifle'],
    ['originMillimeters', { x: 999_999, y: 999_999, z: 999_999 }],
    ['aimDirection', { x: 0, y: 0, z: -1 }],
    ['hitTargetId', 'player_B'],
    ['damagePoints', 1_000_000],
    ['killedPlayerId', 'player_B'],
    ['scoreAfter', 40],
    ['projectileId', 'client_projectile'],
    ['detonatesAtTick', 0],
    ['cooldownEndsAtTick', 0],
  ] as const)(
    'rejects forged input outcome field %s without changing authoritative combat state',
    (field, value) => {
      const authority = abuseRoom();
      const before = authority.fullSnapshot();
      const forgedCommand = { ...input(0), [field]: value };
      const forged = batch(forgedCommand);
      expect(validateClientMessage(forged)).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'PROTOCOL_UNKNOWN_FIELD',
          path: `$.commands[0].${field}`,
        }),
      });
      expect(() => authority.enqueueInputBatch('connection_A', forged))
        .toThrow('AUTHORITY_INPUT_BATCH_INVALID');
      expect(authority.fullSnapshot()).toEqual(before);
    },
  );

  it('rejects invalid slot, impossible look delta, future sequence, and future client tick', () => {
    const authority = abuseRoom();
    const before = authority.fullSnapshot();
    for (const [field, value] of [
      ['selectedSlot', PROTOCOL_LIMITS.maxSelectedSlot + 1],
      ['lookYawDeltaMilliDegrees', PROTOCOL_LIMITS.maxLookDeltaMilliDegrees + 1],
      ['lookPitchDeltaMilliDegrees', -PROTOCOL_LIMITS.maxLookDeltaMilliDegrees - 1],
    ] as const) {
      const invalid = batch({ ...input(0), [field]: value });
      expect(validateClientMessage(invalid)).toEqual({
        ok: false,
        error: expect.objectContaining({
          code: 'PROTOCOL_NUMERIC_OUT_OF_RANGE',
          path: `$.commands[0].${field}`,
        }),
      });
      expect(() => authority.enqueueInputBatch('connection_A', invalid))
        .toThrow('AUTHORITY_INPUT_BATCH_INVALID');
    }

    expect(authority.enqueueInputBatch(
      'connection_A',
      validBatch(2_000, { clientTick: 0 }),
    ).rejections).toEqual([{ sequence: 2_000, reason: 'sequence_too_far_ahead' }]);
    expect(authority.enqueueInputBatch(
      'connection_A',
      validBatch(0, { clientTick: 1_000 }),
    ).rejections).toEqual([{ sequence: 0, reason: 'client_tick_too_far_ahead' }]);
    expect(authority.fullSnapshot()).toEqual(before);
    expect(authority.metricsSnapshot()).toMatchObject({
      acceptedInputs: 0,
      inputRejections: {
        sequence_too_far_ahead: 1,
        client_tick_too_far_ahead: 1,
      },
    });
  });

  it('keeps duplicate/reordered fire deterministic without duplicate ammo or accepted effects', () => {
    const first = runDuplicateReorderTrace();
    const second = runDuplicateReorderTrace();
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      events: [
        { authorityTick: 5 },
        { authorityTick: 7 },
      ],
      serverTick: 7,
      rifle: {
        magazineRounds: 48,
        acceptedShotCount: 2,
      },
      metrics: {
        acceptedInputs: 3,
        inputRejections: {
          duplicate_sequence: 2,
          stale_sequence: 1,
        },
      },
    });
    expect(fnv1a64(JSON.stringify(first))).toMatch(/^[a-f0-9]{16}$/u);
    expect(fnv1a64(JSON.stringify(second))).toBe(fnv1a64(JSON.stringify(first)));
  });
});
