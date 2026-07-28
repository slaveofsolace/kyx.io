import { describe, expect, it } from 'vitest';

import {
  AuthoritativeRoom,
  G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID,
  G4_COMBAT_ROOM_PROFILE_ID,
  G4_COMBAT_RULESET_HASH,
  G4_COMBAT_RULESET_ID,
  G4_COMBAT_RULESET_REVISION,
  G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
  G4_TDM_MATCH_ROOM_CAPABILITY_ID,
  IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
  type AuthorityImpulseGrenadeWorldPort,
  type AuthorityRoomTickResult,
} from '../../../../src/authority';
import {
  COMBAT_PRESENTATION_MARKER_CONTRACT_ID,
  COMBAT_PRESENTATION_MARKERS_V1,
  applyCombatPresentationFrame,
  applyCombatPresentationSnapshot,
  cancelCombatPrediction,
  createCombatPresentationAdapter,
  predictCombatPresentation,
  reconcileCombatPrediction,
  type CombatPresentationAdapterV1,
} from '../../../../src/client';
import { PROTOCOL_VERSION, type InputBatchMessage } from '../../../../src/net';
import { PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../../../src/sim';
import { FakeMovementQueryPort } from '../../sim/movement/fakeQueryPort';

function grenadeWorld(): AuthorityImpulseGrenadeWorldPort {
  return {
    schemaVersion: IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
    sweepSphere: () => ({ schemaVersion: 1, contacts: [] }),
    traceRadialOcclusion: () => ({ schemaVersion: 1, kind: 'clear' }),
    resolveCollisionSafeImpulse: (request) => ({
      schemaVersion: 1,
      appliedImpulseMillimetersPerSecond: request.requestedImpulseMillimetersPerSecond,
    }),
  };
}

function room(): AuthoritativeRoom {
  return new AuthoritativeRoom({
    identity: {
      roomId: 'room_p57',
      matchId: 'match_p57',
      rulesetId: G4_COMBAT_RULESET_ID,
      rulesetRevision: G4_COMBAT_RULESET_REVISION,
      rulesetHash: G4_COMBAT_RULESET_HASH,
      mapId: 'inkfall_foundry',
      fixtureId: 'inkfall_authority',
      fixtureHash: '2a0a446a0b152395',
      physicsAdapterId: 'fake_query_port',
      physicsAdapterVersion: '1.0.0',
    },
    profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
    queries: new FakeMovementQueryPort(),
    maximumPlayers: 8,
    warmupTicks: 40,
    activeTicks: 9_600,
    postmatchTicks: 200,
    minimumConnectedPlayersToStart: 2,
    spawnResolver: (playerId, ordinal) => ({
      spawnId: `spawn_${playerId}`,
      feetPosition: { x: ordinal * 2_000, y: 0, z: 0 },
    }),
    combat: {
      profileId: G4_COMBAT_ROOM_PROFILE_ID,
      teamResolver: (playerId) => playerId === 'player_A' ? 'team_blue' : 'team_red',
      impulseGrenade: {
        capabilityId: G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
        world: grenadeWorld(),
      },
      abilityResources: { capabilityId: G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID },
      match: { capabilityId: G4_TDM_MATCH_ROOM_CAPABILITY_ID },
    },
  });
}

function start(authority: AuthoritativeRoom): void {
  expect(authority.joinNewPlayer({
    playerId: 'player_A',
    connectionId: 'connection_A',
  })).toMatchObject({ ok: true });
  expect(authority.joinNewPlayer({
    playerId: 'player_B',
    connectionId: 'connection_B',
  })).toMatchObject({ ok: true });
  expect(authority.startMatch()).toBe(true);
}

function adapterFrom(authority: AuthoritativeRoom): CombatPresentationAdapterV1 {
  const created = createCombatPresentationAdapter({
    schemaVersion: 1,
    localPlayerId: 'player_A',
  });
  return applyCombatPresentationSnapshot(created, authority.fullSnapshot()).adapter;
}

function input(sequence: number, options: {
  readonly heldButtons?: number;
  readonly pressedButtons?: number;
} = {}): InputBatchMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'inputBatch',
    commands: [{
      type: 'input',
      sequence,
      clientTick: sequence,
      moveX: 0,
      moveY: 0,
      lookYawDeltaMilliDegrees: 0,
      lookPitchDeltaMilliDegrees: 0,
      heldButtons: options.heldButtons ?? 0,
      pressedButtons: options.pressedButtons ?? 0,
      releasedButtons: 0,
      selectedSlot: 0,
    }],
  };
}

function emptyFrame(serverTick: number, lifecycle = 'warmup') {
  return {
    serverTick,
    lifecycle,
    lifecycleTransitions: [],
    movementEvents: [],
    queryMetrics: {
      moveQueries: 0,
      overlapQueries: 0,
      castQueries: 0,
      volumeQueries: 0,
      depenetrations: 0,
    },
    prunedPlayerIds: [],
    combatEvents: [],
    impulseGrenadeEvents: [],
    impulseGrenadeResults: [],
    abilityResourceEvents: [],
    matchEvents: [],
  };
}

function rifleShot(eventId: string, authorityTick: number, magazineRoundsAfter = 49) {
  return {
    kind: 'auto_rifle_shot_accepted',
    eventId,
    authorityTick,
    playerId: 'player_A',
    weaponId: 'vertical_rifle_v1',
    shotOrdinal: 1,
    referenceDamagePoints: 10,
    magazineRoundsAfter,
    reserveRoundsAfter: 150,
    nextShotAtTick: authorityTick + 2,
    ballistics: {
      patternId: 'kyx_auto_rifle_12_v1',
      patternIndex: 0,
      recoilPitchMilliDegrees: 0,
      recoilYawMilliDegrees: 0,
      spreadRadiusMilliDegrees: 0,
      spreadPitchMilliDegrees: 0,
      spreadYawMilliDegrees: 0,
    },
  } as const;
}

function damage(
  eventSequence: number,
  authorityTick: number,
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return {
    kind: 'damage_applied',
    eventId: `combat.damage.${eventSequence}`,
    eventSequence,
    authorityTick,
    causeId: `combat.cause.${eventSequence}`,
    sourcePlayerId: 'player_A',
    targetPlayerId: 'player_B',
    shieldDamagePoints: 0,
    healthDamagePoints: 10,
    shieldPointsAfter: 0,
    healthPointsAfter: 90,
    ...overrides,
  } as const;
}

describe('confirmed hit-region presentation', () => {
  it('emits distinct headshot and lethal-headshot markers while accepting legacy regionless events', () => {
    const authority = room();
    start(authority);
    let adapter = adapterFrom(authority);

    const headshot = applyCombatPresentationFrame(adapter, {
      ...emptyFrame(1),
      matchEvents: [damage(0, 1, { hitRegion: 'head' })],
    });
    adapter = headshot.adapter;
    expect(headshot.intents[0]?.markers.hud).toContain('.hit.head.confirmed.');

    const lethalHeadshot = applyCombatPresentationFrame(adapter, {
      ...emptyFrame(2),
      matchEvents: [damage(1, 2, {
        hitRegion: 'head',
        healthDamagePoints: 90,
        healthPointsAfter: 0,
      })],
    });
    adapter = lethalHeadshot.adapter;
    expect(lethalHeadshot.intents[0]?.markers.hud).toContain('.hit.head.kill.confirmed.');

    const legacyRegionless = applyCombatPresentationFrame(adapterFrom(authority), {
      ...emptyFrame(1),
      matchEvents: [damage(0, 1)],
    });
    expect(legacyRegionless.intents[0]?.markers.hud).toContain('.hit.body.confirmed.');
  });
});

type MutableSnapshotFixture = {
  identity: Record<string, unknown>;
  serverTick: number;
  players: Array<{
    movement: {
      identity: Record<string, unknown>;
      tick: number;
    };
  }>;
};

function mutableSnapshot(authority: AuthoritativeRoom): MutableSnapshotFixture {
  return structuredClone(authority.fullSnapshot()) as unknown as MutableSnapshotFixture;
}

const SNAPSHOT_IDENTITY_FIELDS = [
  'roomId', 'matchId', 'rulesetId', 'rulesetRevision', 'rulesetHash', 'mapId',
  'fixtureId', 'fixtureHash', 'physicsAdapterId', 'physicsAdapterVersion',
  'movementProfileId', 'movementProfileRevision', 'movementProfileHash',
] as const;

const MOVEMENT_IDENTITY_FIELDS = new Set<string>([
  'rulesetId', 'rulesetRevision', 'rulesetHash', 'movementProfileId',
  'movementProfileRevision', 'movementProfileHash', 'fixtureId', 'fixtureHash',
  'physicsAdapterId', 'physicsAdapterVersion',
]);

function differentIdentityValue(key: string, value: unknown): unknown {
  if (key.endsWith('Revision')) return (value as number) + 1;
  if (key.endsWith('Hash')) {
    const current = value as string;
    return `${current.startsWith('a') ? 'b' : 'a'}${current.slice(1)}`;
  }
  return `${String(value)}_other`;
}

describe('P5.7 immutable predicted/authority combat presentation seam', () => {
  it('hydrates one detached frozen HUD view from the exact AuthoritativeRoom snapshot', () => {
    const authority = room();
    start(authority);
    const snapshot = authority.fullSnapshot();
    const result = applyCombatPresentationSnapshot(
      createCombatPresentationAdapter({ schemaVersion: 1, localPlayerId: 'player_A' }),
      snapshot,
    );

    expect(result.status).toBe('snapshot_applied');
    expect(result.intents).toHaveLength(1);
    expect(result.intents[0]).toMatchObject({
      source: 'snapshot',
      markerContractId: COMBAT_PRESENTATION_MARKER_CONTRACT_ID,
      markers: { hud: `${COMBAT_PRESENTATION_MARKER_CONTRACT_ID}.snapshot.sync.hud` },
    });
    expect(result.adapter.view).toMatchObject({
      identity: snapshot.identity,
      roomId: 'room_p57',
      matchId: 'match_p57',
      serverTick: 0,
      lifecycle: 'warmup',
      localPlayer: {
        life: { phase: 'alive', healthPoints: 100, shieldPoints: 0 },
        rifle: { magazineRounds: 50, reserveRounds: 150 },
        impulseGrenade: { cooldownTicksRemaining: 0 },
        teleport: { cooldownTicksRemaining: 0 },
      },
      match: { phase: 'warmup', teamScoreLimit: 40, phaseTicksRemaining: 40 },
    });
    expect(Object.isFrozen(result.adapter)).toBe(true);
    expect(Object.isFrozen(result.adapter.view)).toBe(true);
    expect(Object.isFrozen(result.adapter.view?.identity)).toBe(true);
    expect(result.adapter.view?.identity).toEqual(snapshot.identity);
    expect(result.adapter.view?.identity).not.toBe(snapshot.identity);
    expect(Object.isFrozen(result.adapter.view?.localPlayer?.life)).toBe(true);
    expect(result.adapter.view?.localPlayer?.life).not.toBe(snapshot.players[0]?.combat?.life);
  });

  it('pins every simulation/content identity field and fails closed on malformed or divergent identities', () => {
    const authority = room();
    start(authority);
    const adapter = adapterFrom(authority);

    for (const key of SNAPSHOT_IDENTITY_FIELDS) {
      const changed = mutableSnapshot(authority);
      const nextValue = differentIdentityValue(key, changed.identity[key]);
      changed.identity[key] = nextValue;
      if (MOVEMENT_IDENTITY_FIELDS.has(key)) {
        for (const player of changed.players) player.movement.identity[key] = nextValue;
      }
      expect(
        () => applyCombatPresentationSnapshot(adapter, changed),
        `identity field ${key}`,
      ).toThrow(/SNAPSHOT_IDENTITY_MISMATCH/u);
    }

    const malformed = mutableSnapshot(authority);
    malformed.identity.rulesetHash = 'NOT_A_STABLE_HASH';
    expect(() => applyCombatPresentationSnapshot(adapter, malformed)).toThrow(/hexadecimal hash/u);

    const remoteMovementMismatch = mutableSnapshot(authority);
    const remote = remoteMovementMismatch.players[1];
    expect(remote).toBeDefined();
    if (remote === undefined) return;
    remote.movement.identity.fixtureHash = 'aaaaaaaaaaaaaaaa';
    expect(() => applyCombatPresentationSnapshot(adapter, remoteMovementMismatch))
      .toThrow(/SNAPSHOT_MOVEMENT_IDENTITY_MISMATCH/u);

    const movementTickMismatch = mutableSnapshot(authority);
    movementTickMismatch.players[0]!.movement.tick = movementTickMismatch.serverTick + 1;
    expect(() => applyCombatPresentationSnapshot(adapter, movementTickMismatch))
      .toThrow(/SNAPSHOT_MOVEMENT_TICK_MISMATCH/u);
  });

  it('provides reduced-motion, reduced-flash, combined, and non-audio marker alternatives', () => {
    for (const bundle of Object.values(COMBAT_PRESENTATION_MARKERS_V1)) {
      expect(bundle.reducedMotionAnimation).toBe(
        bundle.animation === null ? null : `${bundle.animation}.reduced_motion`,
      );
      expect(bundle.reducedFlashVfx).toBe(
        bundle.vfx === null ? null : `${bundle.vfx}.reduced_flash`,
      );
      expect(bundle.reducedMotionVfx).toBe(
        bundle.vfx === null ? null : `${bundle.vfx}.reduced_motion`,
      );
      expect(bundle.reducedFlashMotionVfx).toBe(
        bundle.vfx === null ? null : `${bundle.vfx}.reduced_flash_motion`,
      );
      expect(bundle.nonAudioHud).toBe(
        bundle.audio === null ? null : `${bundle.audio.replace(/\.audio$/u, '')}.hud.non_audio`,
      );
    }
  });

  it('predicts only safe rifle, grenade, and teleport cues without mutating HUD authority values', () => {
    const authority = room();
    start(authority);
    const initial = adapterFrom(authority);
    const beforeView = initial.view;
    const rifle = predictCombatPresentation(initial, {
      schemaVersion: 1,
      kind: 'rifle_fire',
      clientCommandId: 'command.rifle.0',
      commandSequence: 0,
      clientTick: 0,
    });
    const grenade = predictCombatPresentation(rifle.adapter, {
      schemaVersion: 1,
      kind: 'impulse_grenade_throw',
      clientCommandId: 'command.grenade.1',
      commandSequence: 1,
      clientTick: 1,
    });
    const teleport = predictCombatPresentation(grenade.adapter, {
      schemaVersion: 1,
      kind: 'teleport',
      clientCommandId: 'command.teleport.2',
      commandSequence: 2,
      clientTick: 2,
    });

    expect(teleport.adapter.view).toBe(beforeView);
    expect(teleport.adapter.pendingPredictions).toHaveLength(3);
    expect(teleport.adapter.pendingPredictions[0]?.expectedAuthorityEventId)
      .toMatch(/^combat\.auto_rifle\.shot\.[a-f0-9]{16}\.1$/u);
    expect(teleport.adapter.pendingPredictions[1]?.expectedAuthorityEventId)
      .toMatch(/^impulse_grenade\..+\.projectile\.1\.spawn$/u);
    expect(teleport.adapter.pendingPredictions[2]?.expectedAuthorityEventId).toBeNull();
    for (const cue of [rifle.intents[0], grenade.intents[0], teleport.intents[0]]) {
      expect(cue).toMatchObject({ source: 'predicted', markers: { hud: null } });
      expect(cue?.markers.reducedFlashVfx).toMatch(/\.reduced_flash$/u);
      expect(cue?.markers.reducedMotionAnimation).toMatch(/\.reduced_motion$/u);
      expect(cue?.markers.reducedMotionVfx).toMatch(/\.reduced_motion$/u);
      expect(cue?.markers.reducedFlashMotionVfx).toMatch(/\.reduced_flash_motion$/u);
      expect(cue?.markers.nonAudioHud).toMatch(/\.non_audio$/u);
      expect(JSON.stringify(cue?.data)).not.toMatch(/damage|ammo|score|healthPointsAfter/u);
    }
    expect(initial.view?.localPlayer?.rifle.magazineRounds).toBe(50);
  });

  it('automatically accepts one predicted rifle cue by exact event ID and deduplicates replay', () => {
    const authority = room();
    start(authority);
    let adapter = predictCombatPresentation(adapterFrom(authority), {
      schemaVersion: 1,
      kind: 'rifle_fire',
      clientCommandId: 'command.rifle.real',
      commandSequence: 0,
      clientTick: 0,
    }).adapter;
    let acceptedFrame: AuthorityRoomTickResult | null = null;
    while (authority.serverTick < 6) {
      authority.enqueueInputBatch(
        'connection_A',
        input(authority.serverTick, { heldButtons: 1 << 3 }),
      );
      const frame = authority.advanceOneTick();
      const applied = applyCombatPresentationFrame(adapter, frame);
      adapter = applied.adapter;
      if ((frame.combatEvents ?? []).some(({ kind }) => kind === 'auto_rifle_shot_accepted')) {
        acceptedFrame = frame;
        expect(applied.intents).toEqual([
          expect.objectContaining({
            source: 'accepted',
            clientCommandId: 'command.rifle.real',
            markers: expect.objectContaining({
              hud: `${COMBAT_PRESENTATION_MARKER_CONTRACT_ID}.rifle.fire.accepted.hud`,
            }),
          }),
        ]);
      }
    }
    expect(acceptedFrame).not.toBeNull();
    expect(adapter.pendingPredictions).toEqual([]);
    expect(adapter.resolvedClientCommandIds).toContain('command.rifle.real');
    expect(adapter.view?.localPlayer?.rifle.magazineRounds).toBe(49);
    expect(adapter.metrics.automaticallyReconciledPredictions).toBe(1);

    const shot = acceptedFrame?.combatEvents?.find(({ kind }) => kind === 'auto_rifle_shot_accepted');
    const duplicate = applyCombatPresentationFrame(adapter, {
      ...emptyFrame(adapter.lastServerTick + 1),
      combatEvents: shot === undefined ? [] : [shot],
    });
    expect(duplicate.intents).toEqual([]);
    expect(duplicate.adapter.view?.localPlayer?.rifle.magazineRounds).toBe(49);
    expect(duplicate.adapter.metrics.duplicateAuthorityEvents).toBe(1);
  });

  it('distinguishes authority-rejected and expired predictions without inventing state', () => {
    const authority = room();
    start(authority);
    const initial = adapterFrom(authority);
    const predicted = predictCombatPresentation(initial, {
      schemaVersion: 1,
      kind: 'rifle_fire',
      clientCommandId: 'command.reject.0',
      commandSequence: 0,
      clientTick: 0,
    });
    const rejected = cancelCombatPrediction(predicted.adapter, {
      schemaVersion: 1,
      clientCommandId: 'command.reject.0',
      reason: 'authority_rejected',
    });
    expect(rejected).toMatchObject({ status: 'rejected' });
    expect(rejected.intents).toMatchObject([
      {
        source: 'rejected',
        markers: { hud: expect.stringContaining('.rifle.fire.rejected.') },
        data: { reason: 'authority_rejected' },
      },
    ]);
    expect(rejected.adapter.view).toBe(initial.view);
    expect(cancelCombatPrediction(rejected.adapter, {
      schemaVersion: 1,
      clientCommandId: 'command.reject.0',
      reason: 'authority_rejected',
    })).toMatchObject({ status: 'already_resolved', intents: [] });

    const expiring = predictCombatPresentation(rejected.adapter, {
      schemaVersion: 1,
      kind: 'teleport',
      clientCommandId: 'command.expire.1',
      commandSequence: 1,
      clientTick: 1,
    });
    const expired = applyCombatPresentationFrame(expiring.adapter, emptyFrame(21));
    expect(expired.intents).toMatchObject([
      { source: 'cancelled', data: { reason: 'expired' } },
    ]);
    expect(expired.adapter.metrics).toMatchObject({
      rejectedPredictions: 1,
      cancelledPredictions: 1,
      expiredPredictions: 1,
    });
    expect(expired.adapter.view?.localPlayer?.rifle.magazineRounds).toBe(50);
    expect(expired.adapter.view?.match?.teamScores).toEqual(initial.view?.match?.teamScores);
  });

  it('fails closed on malformed, conflicting, future, or command-replayed inputs', () => {
    const authority = room();
    start(authority);
    const adapter = adapterFrom(authority);
    const expected = `combat.auto_rifle.shot.${adapter.authorityHints.rifleEventNamespace}.1`;
    const valid = rifleShot(expected, 1);
    const { eventId: _missing, ...missingId } = valid;
    expect(() => applyCombatPresentationFrame(adapter, {
      ...emptyFrame(1),
      combatEvents: [missingId],
    })).toThrow(/unsupported or missing fields/u);
    expect(() => applyCombatPresentationFrame(adapter, {
      ...emptyFrame(1),
      combatEvents: [{ ...valid, claimedDamage: 999 }],
    })).toThrow(/unsupported or missing fields/u);
    expect(() => applyCombatPresentationFrame(adapter, {
      ...emptyFrame(1),
      combatEvents: [{ ...valid, authorityTick: 2 }],
    })).toThrow(/cannot exceed/u);
    expect(() => applyCombatPresentationFrame(adapter, {
      ...emptyFrame(1),
      combatEvents: [valid, { ...valid, magazineRoundsAfter: 0 }],
    })).toThrow(/CONFLICTING_PAYLOADS/u);
    const callerOwned = structuredClone(valid) as unknown as {
      ballistics: { patternIndex: number };
    };
    const accepted = applyCombatPresentationFrame(adapter, {
      ...emptyFrame(1),
      combatEvents: [callerOwned],
    });
    callerOwned.ballistics.patternIndex = 99;
    expect(accepted.intents[0]?.data.ballistics).toMatchObject({ patternIndex: 0 });
    expect(Object.isFrozen(accepted.intents[0]?.data.ballistics)).toBe(true);
    expect(() => applyCombatPresentationFrame(accepted.adapter, {
      ...emptyFrame(2),
      combatEvents: [{ ...valid, magazineRoundsAfter: 0 }],
    })).toThrow(/CONFLICTING_PAYLOADS/u);

    const once = predictCombatPresentation(adapter, {
      schemaVersion: 1,
      kind: 'rifle_fire',
      clientCommandId: 'command.strict.0',
      commandSequence: 0,
      clientTick: 0,
    }).adapter;
    expect(() => predictCombatPresentation(once, {
      schemaVersion: 1,
      kind: 'rifle_fire',
      clientCommandId: 'command.strict.0',
      commandSequence: 1,
      clientTick: 1,
    })).toThrow(/COMMAND_ID_REPLAYED/u);
  });

  it('canonically orders one frame and ignores an older frame/event without rolling HUD back', () => {
    const authority = room();
    start(authority);
    let adapter = adapterFrom(authority);
    const completed = {
      kind: 'auto_rifle_reload_completed',
      eventId: 'combat.reload.completed.1',
      authorityTick: 2,
      playerId: 'player_A',
      reloadOrdinal: 1,
      roundsTransferred: 10,
      magazineRoundsAfter: 50,
      reserveRoundsAfter: 140,
    } as const;
    const started = {
      kind: 'auto_rifle_reload_started',
      eventId: 'combat.reload.started.1',
      authorityTick: 1,
      playerId: 'player_A',
      source: 'manual',
      reloadOrdinal: 1,
      magazineRoundsBefore: 40,
      reserveRoundsBefore: 150,
      completesAtTick: 2,
    } as const;
    const ordered = applyCombatPresentationFrame(adapter, {
      ...emptyFrame(2),
      combatEvents: [completed, started],
    });
    adapter = ordered.adapter;
    expect(ordered.intents.map(({ authorityEventId }) => authorityEventId)).toEqual([
      started.eventId,
      completed.eventId,
    ]);
    expect(adapter.view?.localPlayer?.rifle).toMatchObject({
      phase: 'ready',
      magazineRounds: 50,
      reserveRounds: 140,
    });

    const staleFrame = applyCombatPresentationFrame(adapter, {
      ...emptyFrame(2),
      combatEvents: [started],
    });
    expect(staleFrame).toMatchObject({ status: 'stale_authority_frame', intents: [] });
    expect(staleFrame.adapter.view).toBe(adapter.view);

    const lateOlderEvent = applyCombatPresentationFrame(staleFrame.adapter, {
      ...emptyFrame(3),
      combatEvents: [{ ...started, eventId: 'combat.reload.started.late' }],
    });
    expect(lateOlderEvent.intents).toEqual([]);
    expect(lateOlderEvent.adapter.metrics.staleAuthorityEvents).toBe(1);
    expect(lateOlderEvent.adapter.view?.localPlayer?.rifle.magazineRounds).toBe(50);
  });

  it('resyncs reconnect/full snapshots without replaying historical damage, death, score, or feed', () => {
    const authority = room();
    start(authority);
    while (authority.serverTick < 40) authority.advanceOneTick();
    const lethal = authority.applyCombatDamage({
      targetPlayerId: 'player_B',
      sourcePlayerId: 'player_A',
      damagePoints: 100,
      causeId: 'weapon.reconnect',
    });
    expect(lethal.accepted).toBe(true);
    if (!lethal.accepted) return;

    let adapter = adapterFrom(authority);
    const pending = predictCombatPresentation(adapter, {
      schemaVersion: 1,
      kind: 'teleport',
      clientCommandId: 'command.before_reconnect',
      commandSequence: 0,
      clientTick: 0,
    });
    const reconnect = applyCombatPresentationSnapshot(pending.adapter, authority.fullSnapshot());
    adapter = reconnect.adapter;
    expect(reconnect.intents.map(({ source }) => source)).toEqual(['snapshot', 'cancelled']);
    expect(reconnect.intents.some(({ markers }) => (
      markers.audio?.includes('hit') || markers.audio?.includes('death')
    ))).toBe(false);
    expect(adapter.view?.match).toMatchObject({
      teamScores: [{ teamId: 'team_blue', score: 1 }, { teamId: 'team_red', score: 0 }],
      feedSequence: 1,
    });
    expect(adapter.view?.match?.feed).toHaveLength(1);
    expect(adapter.pendingPredictions).toEqual([]);

    const oldEvents = applyCombatPresentationFrame(adapter, {
      ...emptyFrame(41, 'active'),
      matchEvents: lethal.matchEvents,
    });
    expect(oldEvents.intents).toEqual([]);
    expect(oldEvents.adapter.view?.match?.teamScores[0]?.score).toBe(1);
    expect(oldEvents.adapter.view?.match?.feed).toHaveLength(1);
  });

  it('suppresses same-tick reconnect replay for reload, projectile, impulse, and teleport events', () => {
    const authority = room();
    start(authority);
    while (authority.serverTick < 5) authority.advanceOneTick();
    const adapter = adapterFrom(authority);
    const tick = adapter.lastSnapshotServerTick;
    const beforeRifle = adapter.view?.localPlayer?.rifle;
    const beforeProjectiles = adapter.view?.projectiles;

    const replayed = applyCombatPresentationFrame(adapter, {
      ...emptyFrame(tick + 1),
      combatEvents: [
        {
          kind: 'auto_rifle_reload_started',
          eventId: 'reconnect.reload.started',
          authorityTick: tick,
          playerId: 'player_A',
          source: 'manual',
          reloadOrdinal: 1,
          magazineRoundsBefore: 40,
          reserveRoundsBefore: 150,
          completesAtTick: tick + 10,
        },
        {
          kind: 'auto_rifle_reload_completed',
          eventId: 'reconnect.reload.completed',
          authorityTick: tick,
          playerId: 'player_A',
          reloadOrdinal: 1,
          roundsTransferred: 10,
          magazineRoundsAfter: 50,
          reserveRoundsAfter: 140,
        },
        {
          kind: 'auto_rifle_reload_cancelled',
          eventId: 'reconnect.reload.cancelled',
          authorityTick: tick,
          playerId: 'player_A',
          reloadOrdinal: 1,
          reason: 'fire',
        },
      ],
      impulseGrenadeEvents: [
        {
          kind: 'impulse_grenade_collision',
          eventId: 'reconnect.grenade.collision',
          authorityTick: tick,
          projectileId: 'reconnect.projectile',
          ownerPlayerId: 'player_A',
          colliderId: 'world.floor',
          layer: 'world_static',
          playerId: null,
          timeOfImpactPermille: 500,
          bounceCount: 1,
          fuseStartedAtTick: tick,
          detonatesAtTick: tick + 20,
          settled: false,
        },
        {
          kind: 'impulse_grenade_detonated',
          eventId: 'reconnect.grenade.detonated',
          authorityTick: tick,
          projectileId: 'reconnect.projectile',
          ownerPlayerId: 'player_A',
          ownerTeamId: 'team_blue',
          reason: 'fuse',
          positionMillimeters: { x: 0, y: 0, z: 0 },
          areaRadiusMillimeters: 11_000,
          damageHealthPoints: 0,
        },
        {
          kind: 'impulse_grenade_impulse_applied',
          eventId: 'reconnect.grenade.impulse',
          authorityTick: tick,
          projectileId: 'reconnect.projectile',
          ownerPlayerId: 'player_A',
          targetPlayerId: 'player_B',
          relation: 'enemy',
          distanceMillimeters: 1_000,
          falloffPermille: 900,
          requestedImpulseMillimetersPerSecond: { x: 1_000, y: 2_000, z: 0 },
          appliedImpulseMillimetersPerSecond: { x: 1_000, y: 2_000, z: 0 },
          damageHealthPoints: 0,
        },
      ],
      abilityResourceEvents: [
        {
          kind: 'teleport_resource_confirmed',
          eventId: 'reconnect.teleport.confirmed',
          authorityTick: tick,
          playerId: 'player_A',
          abilityId: 'vertical_teleport_v1',
          outcome: 'full',
          from: { x: 0, y: 0, z: 0 },
          to: { x: 9_000, y: 0, z: 0 },
          cooldownTicksRemaining: 160,
          weaponRecoveryTicks: 0,
          combatStatePolicy: 'preserve_existing_combat_state',
        },
        {
          kind: 'teleport_resource_rejected',
          eventId: 'reconnect.teleport.rejected',
          authorityTick: tick,
          playerId: 'player_A',
          abilityId: 'vertical_teleport_v1',
          reason: 'blocked',
          cooldownTicksRemaining: 0,
          cooldownConsumedByFailure: false,
        },
      ],
    });

    expect(replayed.intents).toEqual([]);
    expect(replayed.adapter.view?.localPlayer?.rifle).toEqual(beforeRifle);
    expect(replayed.adapter.view?.projectiles).toEqual(beforeProjectiles);
    expect(replayed.adapter.metrics.staleAuthorityEvents).toBe(8);
    expect(replayed.adapter.metrics).toMatchObject({
      acceptedAuthorityEvents: 0,
      rejectedAuthorityEvents: 0,
      confirmedAuthorityEvents: 0,
    });
  });

  it('projects confirmed body, shield, kill, damage, death, score, feed, and respawn intents', () => {
    const authority = room();
    start(authority);
    let adapter = adapterFrom(authority);
    const shield = applyCombatPresentationFrame(adapter, {
      ...emptyFrame(1),
      matchEvents: [damage(0, 1, {
        shieldDamagePoints: 10,
        healthDamagePoints: 0,
        shieldPointsAfter: 40,
        healthPointsAfter: 100,
      })],
    });
    adapter = shield.adapter;
    expect(shield.intents[0]?.source).toBe('confirmed');
    expect(shield.intents[0]?.markers.hud).toContain('.hit.shield.confirmed.');

    const body = applyCombatPresentationFrame(adapter, {
      ...emptyFrame(2),
      matchEvents: [damage(1, 2)],
    });
    adapter = body.adapter;
    expect(body.intents[0]?.markers.hud).toContain('.hit.body.confirmed.');

    const lethalDamage = damage(2, 3, {
      healthDamagePoints: 90,
      healthPointsAfter: 0,
    });
    const deathEvent = {
      kind: 'death',
      eventId: 'combat.death.2',
      authorityTick: 3,
      victimPlayerId: 'player_B',
      killerPlayerId: 'player_A',
      assistPlayerIds: [],
      deathOrdinal: 1,
      respawnEligibleAtTick: 163,
      discontinuitySequence: 2,
    } as const;
    const scoreEvent = {
      kind: 'team_score_changed',
      eventId: 'match.score.match_p57.2',
      authorityTick: 3,
      combatDeathEventId: 'combat.death.2',
      teamId: 'team_blue',
      previousScore: 0,
      scoreAfter: 1,
      scoreLimit: 40,
      killerPlayerId: 'player_A',
      victimPlayerId: 'player_B',
    } as const;
    const feedEvent = {
      kind: 'kill_feed_entry',
      eventId: 'match.feed.match_p57.1',
      authorityTick: 3,
      feedSequence: 1,
      combatDeathEventId: 'combat.death.2',
      causeId: 'combat.cause.2',
      killerPlayerId: 'player_A',
      victimPlayerId: 'player_B',
      assistPlayerIds: [],
      scoredTeamId: 'team_blue',
      teamScoreAfter: 1,
    } as const;
    const kill = applyCombatPresentationFrame(adapter, {
      ...emptyFrame(3),
      matchEvents: [feedEvent, scoreEvent, deathEvent, lethalDamage],
    });
    adapter = kill.adapter;
    expect(kill.intents.map(({ markers }) => markers.hud)).toEqual([
      expect.stringContaining('.hit.kill.confirmed.'),
      expect.stringContaining('.life.death.'),
      expect.stringContaining('.match.score.changed.'),
      expect.stringContaining('.match.kill_feed.entry.'),
    ]);
    expect(adapter.view?.match).toMatchObject({
      teamScores: [{ teamId: 'team_blue', score: 1 }, { teamId: 'team_red', score: 0 }],
      feedSequence: 1,
    });

    const incoming = applyCombatPresentationFrame(adapter, {
      ...emptyFrame(4),
      matchEvents: [damage(3, 4, {
        sourcePlayerId: 'player_B',
        targetPlayerId: 'player_A',
        healthPointsAfter: 80,
        healthDamagePoints: 20,
      })],
    });
    adapter = incoming.adapter;
    expect(incoming.intents[0]?.markers.hud).toContain('.damage.received.');
    expect(adapter.view?.localPlayer?.life.healthPoints).toBe(80);

    const respawn = applyCombatPresentationFrame(adapter, {
      ...emptyFrame(5),
      matchEvents: [{
        kind: 'respawn',
        eventId: 'combat.respawn.4',
        eventSequence: 4,
        authorityTick: 5,
        playerId: 'player_A',
        authoritySpawnId: 'spawn_player_A',
        spawnOrdinal: 2,
        protectedUntilTickExclusive: 25,
        discontinuitySequence: 3,
      }],
    });
    expect(respawn.intents[0]?.markers.hud).toContain('.life.respawn.');
    expect(respawn.adapter.view?.localPlayer?.life).toMatchObject({
      phase: 'alive',
      pointValuesFresh: false,
    });
  });

  it('projects projectile/detonation/teleport markers and explicitly links teleport by stable IDs', () => {
    const authority = room();
    start(authority);
    let adapter = adapterFrom(authority);
    const predictedGrenade = predictCombatPresentation(adapter, {
      schemaVersion: 1,
      kind: 'impulse_grenade_throw',
      clientCommandId: 'command.grenade.confirm',
      commandSequence: 0,
      clientTick: 0,
    });
    adapter = predictedGrenade.adapter;
    const grenadeEventId = adapter.pendingPredictions[0]?.expectedAuthorityEventId as string;
    const throwResult = applyCombatPresentationFrame(adapter, {
      ...emptyFrame(1),
      impulseGrenadeEvents: [{
        kind: 'impulse_grenade_throw_accepted',
        eventId: grenadeEventId,
        authorityTick: 1,
        playerId: 'player_A',
        abilityId: 'vertical_impulse_grenade_v1',
        throwOrdinal: 1,
        projectileId: grenadeEventId.replace(/\.spawn$/u, ''),
        cooldownEndsAtTick: 241,
      }],
    });
    adapter = throwResult.adapter;
    expect(throwResult.intents[0]).toMatchObject({
      source: 'accepted',
      clientCommandId: 'command.grenade.confirm',
      markers: { hud: expect.stringContaining('.grenade.throw.accepted.') },
    });

    const projectileId = grenadeEventId.replace(/\.spawn$/u, '');
    const detonation = applyCombatPresentationFrame(adapter, {
      ...emptyFrame(2),
      impulseGrenadeEvents: [{
        kind: 'impulse_grenade_detonated',
        eventId: `${projectileId}.detonation`,
        authorityTick: 2,
        projectileId,
        ownerPlayerId: 'player_A',
        ownerTeamId: 'team_blue',
        reason: 'fuse',
        positionMillimeters: { x: 1, y: 2, z: 3 },
        areaRadiusMillimeters: 11_000,
        damageHealthPoints: 0,
      }],
    });
    adapter = detonation.adapter;
    expect(detonation.intents[0]?.markers.vfx).toContain('.grenade.projectile.detonation.');

    const predictedTeleport = predictCombatPresentation(adapter, {
      schemaVersion: 1,
      kind: 'teleport',
      clientCommandId: 'command.teleport.link',
      commandSequence: 1,
      clientTick: 1,
    });
    const teleportEventId = 'ability_resource.player_A.3.teleport.0';
    const confirmedTeleport = applyCombatPresentationFrame(predictedTeleport.adapter, {
      ...emptyFrame(3),
      abilityResourceEvents: [{
        kind: 'teleport_resource_confirmed',
        eventId: teleportEventId,
        authorityTick: 3,
        playerId: 'player_A',
        abilityId: 'vertical_teleport_v1',
        outcome: 'full',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 9_000, y: 0, z: 0 },
        cooldownTicksRemaining: 160,
        weaponRecoveryTicks: 0,
        combatStatePolicy: 'preserve_existing_combat_state',
      }],
    });
    expect(confirmedTeleport.intents[0]).toMatchObject({
      source: 'confirmed',
      clientCommandId: null,
      markers: { hud: expect.stringContaining('.teleport.confirmed.') },
    });
    expect(confirmedTeleport.adapter.pendingPredictions).toHaveLength(1);
    const linked = reconcileCombatPrediction(confirmedTeleport.adapter, {
      schemaVersion: 1,
      clientCommandId: 'command.teleport.link',
      authorityEventId: teleportEventId,
    });
    expect(linked).toMatchObject({ status: 'reconciled', intents: [] });
    expect(linked.adapter.pendingPredictions).toEqual([]);
    expect(linked.adapter.view?.localPlayer?.teleport).toMatchObject({
      phase: 'cooldown',
      cooldownTicksRemaining: 160,
    });
    expect(reconcileCombatPrediction(linked.adapter, {
      schemaVersion: 1,
      clientCommandId: 'command.teleport.link',
      authorityEventId: teleportEventId,
    })).toMatchObject({ status: 'already_resolved', intents: [] });
  });

  it('labels automatic and explicit teleport rejection as rejected, never confirmed or cancelled', () => {
    const authority = room();
    start(authority);
    const automaticEventId = 'ability_resource.player_A.1.teleport.rejected';
    const predicted = predictCombatPresentation(adapterFrom(authority), {
      schemaVersion: 1,
      kind: 'teleport',
      clientCommandId: 'command.teleport.auto_reject',
      commandSequence: 0,
      clientTick: 0,
      expectedAuthorityEventId: automaticEventId,
    });
    const automatic = applyCombatPresentationFrame(predicted.adapter, {
      ...emptyFrame(1),
      abilityResourceEvents: [{
        kind: 'teleport_resource_rejected',
        eventId: automaticEventId,
        authorityTick: 1,
        playerId: 'player_A',
        abilityId: 'vertical_teleport_v1',
        reason: 'blocked',
        cooldownTicksRemaining: 0,
        cooldownConsumedByFailure: false,
      }],
    });
    expect(automatic.intents).toMatchObject([{
      source: 'rejected',
      clientCommandId: 'command.teleport.auto_reject',
      markers: { hud: expect.stringContaining('.teleport.rejected.') },
    }]);
    expect(automatic.adapter.pendingPredictions).toEqual([]);
    expect(automatic.adapter.metrics).toMatchObject({
      automaticallyReconciledPredictions: 1,
      rejectedPredictions: 1,
      rejectedAuthorityEvents: 1,
      confirmedAuthorityEvents: 0,
    });

    const awaitingExplicitLink = predictCombatPresentation(automatic.adapter, {
      schemaVersion: 1,
      kind: 'teleport',
      clientCommandId: 'command.teleport.explicit_reject',
      commandSequence: 1,
      clientTick: 1,
    });
    const explicitEventId = 'ability_resource.player_A.2.teleport.rejected';
    const observed = applyCombatPresentationFrame(awaitingExplicitLink.adapter, {
      ...emptyFrame(2),
      abilityResourceEvents: [{
        kind: 'teleport_resource_rejected',
        eventId: explicitEventId,
        authorityTick: 2,
        playerId: 'player_A',
        abilityId: 'vertical_teleport_v1',
        reason: 'no_ground',
        cooldownTicksRemaining: 0,
        cooldownConsumedByFailure: false,
      }],
    });
    expect(observed.intents[0]).toMatchObject({ source: 'rejected', clientCommandId: null });
    expect(observed.adapter.pendingPredictions).toHaveLength(1);
    const explicitlyRejected = reconcileCombatPrediction(observed.adapter, {
      schemaVersion: 1,
      clientCommandId: 'command.teleport.explicit_reject',
      authorityEventId: explicitEventId,
    });
    expect(explicitlyRejected).toMatchObject({ status: 'rejected', intents: [] });
    expect(explicitlyRejected.adapter.pendingPredictions).toEqual([]);
    expect(explicitlyRejected.adapter.metrics).toMatchObject({
      explicitlyReconciledPredictions: 1,
      rejectedPredictions: 2,
      rejectedAuthorityEvents: 2,
      confirmedAuthorityEvents: 0,
    });
  });
});
