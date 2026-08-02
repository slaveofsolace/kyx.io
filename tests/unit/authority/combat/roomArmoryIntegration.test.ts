import { describe, expect, it } from 'vitest';

import {
  AuthoritativeRoom,
  G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID,
  G4_COMBAT_ROOM_PROFILE_ID,
  G4_COMBAT_RULESET_HASH,
  G4_COMBAT_RULESET_ID,
  G4_COMBAT_RULESET_REVISION,
  G4_HITSCAN_ROOM_CAPABILITY_ID,
  G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
  G4_TDM_MATCH_ROOM_CAPABILITY_ID,
  IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
  KYX_WEAPON_ID,
  type AuthorityRoomTickResult,
} from '../../../../src/authority';
import {
  applyCombatPresentationReliableEvent,
  applyCombatPresentationWireHydration,
  createCombatPresentationAdapter,
  type CombatPresentationIntentV1,
} from '../../../../src/client/combat';
import {
  PROTOCOL_VERSION,
  RELIABLE_EVENT_STREAM_VERSION,
  validateServerMessage,
  type InputBatchMessage,
} from '../../../../src/net';
import { INTENT_BUTTON, PHASE3_HYPOTHESIS_MOVEMENT_PROFILE } from '../../../../src/sim';
import {
  combatSnapshotFromAuthority,
  reliableCombatEvents,
} from '../../../../worker/combatRuntime';
import { ReliableEventStore } from '../../../../worker/reliableEvents';
import { FakeMovementQueryPort } from '../../sim/movement/fakeQueryPort';

const WEAPON_EXPECTATIONS = [
  {
    slot: 1,
    weaponId: KYX_WEAPON_ID.pistol,
    resultKind: 'hitscan',
    reliableKind: 'weapon_attack_accepted',
  },
  {
    slot: 2,
    weaponId: KYX_WEAPON_ID.shotgun,
    resultKind: 'hitscan',
    reliableKind: 'weapon_attack_accepted',
  },
  {
    slot: 3,
    weaponId: KYX_WEAPON_ID.sniper,
    resultKind: 'hitscan',
    reliableKind: 'weapon_attack_accepted',
  },
  {
    slot: 4,
    weaponId: KYX_WEAPON_ID.rocket,
    resultKind: 'projectile',
    reliableKind: 'weapon_projectile_spawned',
  },
  {
    slot: 5,
    weaponId: KYX_WEAPON_ID.melee,
    resultKind: 'melee',
    reliableKind: 'weapon_melee_contact',
  },
] as const;

function room(): AuthoritativeRoom {
  return new AuthoritativeRoom({
    identity: {
      roomId: 'room.armory.integration',
      matchId: 'match.armory.integration',
      rulesetId: G4_COMBAT_RULESET_ID,
      rulesetRevision: G4_COMBAT_RULESET_REVISION,
      rulesetHash: G4_COMBAT_RULESET_HASH,
      mapId: 'inkfall_foundry',
      fixtureId: 'inkfall_foundry_authority',
      fixtureHash: '5151515151515151',
      physicsAdapterId: 'fake_query_port',
      physicsAdapterVersion: '1.0.0',
    },
    profile: PHASE3_HYPOTHESIS_MOVEMENT_PROFILE,
    queries: new FakeMovementQueryPort(),
    spawnResolver: (playerId) => ({
      spawnId: `spawn.${playerId}`,
      feetPosition: playerId === 'player_A'
        ? { x: 0, y: 0, z: 0 }
        : { x: 0, y: 0, z: 2_000 },
      yawMilliDegrees: playerId === 'player_A' ? 0 : 180_000,
    }),
    combat: {
      profileId: G4_COMBAT_ROOM_PROFILE_ID,
      teamResolver: (playerId) => playerId === 'player_A' ? 'team_blue' : 'team_red',
      hitscan: {
        capabilityId: G4_HITSCAN_ROOM_CAPABILITY_ID,
        worldOcclusion: () => ({
          schemaVersion: 1,
          hit: false,
          distanceMillimeters: null,
          colliderId: null,
        }),
      },
      impulseGrenade: {
        capabilityId: G4_IMPULSE_GRENADE_ROOM_CAPABILITY_ID,
        world: {
          schemaVersion: IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
          sweepSphere: () => ({ schemaVersion: 1, contacts: [] }),
          traceRadialOcclusion: () => ({ schemaVersion: 1, kind: 'clear' }),
          resolveCollisionSafeImpulse: (request) => ({
            schemaVersion: 1,
            appliedImpulseMillimetersPerSecond:
              request.requestedImpulseMillimetersPerSecond,
          }),
        },
      },
      abilityResources: { capabilityId: G4_ABILITY_RESOURCE_ROOM_CAPABILITY_ID },
      match: { capabilityId: G4_TDM_MATCH_ROOM_CAPABILITY_ID },
    },
  });
}

function input(
  authority: AuthoritativeRoom,
  sequence: number,
  selectedSlot: number,
  pressedButtons = 0,
): InputBatchMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'inputBatch',
    commands: [{
      type: 'input',
      sequence,
      clientTick: authority.serverTick,
      moveX: 0,
      moveY: 0,
      lookYawDeltaMilliDegrees: 0,
      lookPitchDeltaMilliDegrees: 0,
      heldButtons: pressedButtons,
      pressedButtons,
      releasedButtons: 0,
      selectedSlot,
    }],
  };
}

function startRoom(): AuthoritativeRoom {
  const authority = room();
  expect(authority.joinNewPlayer({
    playerId: 'player_A',
    connectionId: 'connection_A',
  })).toMatchObject({ ok: true });
  expect(authority.joinNewPlayer({
    playerId: 'player_B',
    connectionId: 'connection_B',
  })).toMatchObject({ ok: true });
  expect(authority.startMatch()).toBe(true);
  while (authority.serverTick < 40) authority.advanceOneTick();
  authority.recordServerObservedRtt('player_A', 50);
  return authority;
}

function weaponState(authority: AuthoritativeRoom, weaponId: string) {
  const state = authority.fullSnapshot().players
    .find(({ playerId }) => playerId === 'player_A')
    ?.combat?.armory.weapons.find((weapon) => weapon.weaponId === weaponId);
  if (state === undefined) throw new Error(`missing room weapon state: ${weaponId}`);
  return state;
}

function equipAndFire(
  authority: AuthoritativeRoom,
  slot: number,
  weaponId: string,
): AuthorityRoomTickResult {
  expect(authority.enqueueInputBatch(
    'connection_A',
    input(authority, 0, slot),
  ).accepted).toBe(1);
  authority.advanceOneTick();
  const readyAtTick = weaponState(authority, weaponId).readyAtTick;
  if (readyAtTick === null) throw new Error(`weapon did not begin equipping: ${weaponId}`);
  while (authority.serverTick < readyAtTick - 1) authority.advanceOneTick();
  expect(authority.enqueueInputBatch(
    'connection_A',
    input(
      authority,
      1,
      slot,
      INTENT_BUTTON.primaryFire,
    ),
  ).accepted).toBe(1);
  return authority.advanceOneTick();
}

interface MutableSmokeCheckpoint {
  readonly clock: { readonly serverTick: number };
  readonly abilityProjectiles: Array<{
    readonly projectileId: string;
    detonatesAtTick: number | null;
    positionMillimeters: { x: number; y: number; z: number };
    velocityMillimetersPerSecond: { x: number; y: number; z: number };
  }>;
}

function checkpointWithSmokeDetonatingNextTick(
  authority: AuthoritativeRoom,
  sequence: number,
  selectedSlot: number,
): Readonly<{
  checkpoint: MutableSmokeCheckpoint;
  projectileId: string;
  detonationTick: number;
}> {
  expect(authority.enqueueInputBatch(
    'connection_A',
    input(authority, sequence, selectedSlot, INTENT_BUTTON.abilityTwo),
  ).accepted).toBe(1);
  const thrown = authority.advanceOneTick();
  expect(thrown.abilityLoadoutEvents).toContainEqual(expect.objectContaining({
    kind: 'ability_activation_accepted',
    abilityId: 'smoke_grenade_v1',
    playerId: 'player_A',
  }));
  const checkpoint = JSON.parse(
    JSON.stringify(authority.exportActiveMatchCheckpoint()),
  ) as MutableSmokeCheckpoint;
  expect(checkpoint.abilityProjectiles).toHaveLength(1);
  const projectile = checkpoint.abilityProjectiles[0];
  if (projectile === undefined) throw new Error('smoke projectile checkpoint is missing');
  const detonationTick = checkpoint.clock.serverTick + 1;
  projectile.detonatesAtTick = detonationTick;
  projectile.positionMillimeters = { x: 0, y: 1_700, z: 1_000 };
  projectile.velocityMillimetersPerSecond = { x: 0, y: 0, z: 0 };
  return { checkpoint, projectileId: projectile.projectileId, detonationTick };
}

function playerHealth(authority: AuthoritativeRoom, playerId: string): number | undefined {
  return authority.fullSnapshot().players
    .find((player) => player.playerId === playerId)
    ?.combat?.life.healthPoints;
}

function reliablePresentation(
  authority: AuthoritativeRoom,
  tick: AuthorityRoomTickResult,
): Readonly<{
  readonly kinds: readonly string[];
  readonly intents: readonly CombatPresentationIntentV1[];
}> {
  const store = new ReliableEventStore();
  const events = reliableCombatEvents(tick).map((event) => store.append(event));
  const validation = validateServerMessage({
    protocolVersion: PROTOCOL_VERSION,
    type: 'reliableEventBatch',
    reliableEventStreamVersion: RELIABLE_EVENT_STREAM_VERSION,
    matchId: authority.identity.matchId,
    events,
  });
  if (!validation.ok) {
    throw new Error(
      `armory reliable projection failed schema validation: ${JSON.stringify(validation.error)}`,
    );
  }

  const full = authority.fullSnapshot();
  const combat = combatSnapshotFromAuthority(full);
  if (combat === null) throw new Error('missing worker combat snapshot');
  const local = combat.players.find(({ playerId }) => playerId === 'player_A');
  if (
    local === undefined
    || local.weaponCatalogId === undefined
    || local.selectedWeaponSlot === undefined
    || local.weapons === undefined
  ) throw new Error('missing worker armory projection');
  let adapter = createCombatPresentationAdapter({
    schemaVersion: 1,
    localPlayerId: 'player_A',
  });
  adapter = applyCombatPresentationWireHydration(adapter, {
    schemaVersion: 1,
    identity: full.identity,
    serverTick: full.serverTick,
    lifecycle: full.lifecycle,
    reliableEventBaselineSequence: 0,
    localPlayer: {
      playerId: local.playerId,
      lifePhase: local.lifePhase,
      healthPoints: local.healthPoints,
      shieldPoints: local.shieldPoints,
      riflePhase: local.riflePhase,
      magazineRounds: local.magazineRounds,
      reserveRounds: local.reserveRounds,
      weaponCatalogId: local.weaponCatalogId,
      selectedWeaponSlot: local.selectedWeaponSlot,
      selectedWeaponId: local.selectedWeaponId ?? null,
      weapons: local.weapons,
      grenadePhase: local.grenadePhase,
      grenadeCooldownEndsAtTick: local.grenadeCooldownEndsAtTick,
      activeProjectileCount: local.activeProjectileCount,
      teleportCooldownTicksRemaining: 0,
    },
    match: {
      phase: combat.match.phase,
      activeTicksRemaining: combat.match.activeTicksRemaining,
      teamScores: combat.match.teamScores,
      feedSequence: combat.match.feedSequence,
    },
  }).adapter;
  const intents: CombatPresentationIntentV1[] = [];
  for (const event of events) {
    // The production bridge only sends events with the explicit semantic
    // projection to the presentation adapter. Transport-only events such as a
    // lethal sniper's playerKilled companion remain in the reliable stream.
    if (event.presentation === undefined) continue;
    const applied = applyCombatPresentationReliableEvent(adapter, event);
    adapter = applied.adapter;
    intents.push(...applied.intents);
  }
  return {
    kinds: events.flatMap(({ presentation }) => presentation === undefined
      ? []
      : [presentation.kind]),
    intents,
  };
}

describe('authoritative room KYX armory integration', () => {
  it('owns equip, cadence, ammo, reload, damage, protocol, and presentation for every weapon family', () => {
    for (const expected of WEAPON_EXPECTATIONS) {
      const authority = startRoom();
      const tick = equipAndFire(authority, expected.slot, expected.weaponId);
      const result = tick.weaponAttackResults?.[0];
      expect(result).toMatchObject({
        acceptedAttack: {
          weaponId: expected.weaponId,
          attackOrdinal: 1,
        },
        kind: expected.resultKind,
      });
      expect(authority.fullSnapshot().players[0].combat?.armory).toMatchObject({
        catalogId: 'kyx_authoritative_armory_v1',
        selectedSlot: expected.slot,
      });
      if (result?.kind === 'hitscan') {
        expect(result.damages.some((damage) => damage.accepted)).toBe(true);
      } else if (result?.kind === 'projectile') {
        expect(result.projectile).toMatchObject({
          weaponId: KYX_WEAPON_ID.rocket,
          phase: 'active',
        });
      } else if (result?.kind === 'melee') {
        expect(result).toMatchObject({
          resolution: { outcome: 'contact', targetPlayerId: 'player_B' },
          damage: { accepted: true },
        });
      }
      const presentation = reliablePresentation(authority, tick);
      expect(presentation.kinds).toContain(expected.reliableKind);
      expect(presentation.intents.some(({ markers }) => (
        Object.values(markers).some((value) => (
          typeof value === 'string' && value.includes('weapon.')
        ))
      ))).toBe(true);

      if (expected.weaponId === KYX_WEAPON_ID.pistol) {
        expect(authority.enqueueInputBatch(
          'connection_A',
          input(authority, 2, expected.slot, INTENT_BUTTON.reload),
        ).accepted).toBe(1);
        authority.advanceOneTick();
        const reloading = weaponState(authority, expected.weaponId);
        expect(reloading).toMatchObject({
          phase: 'reloading',
          magazineRounds: 11,
          reserveRounds: 72,
        });
        if (reloading.reloadCompletesAtTick === null) {
          throw new Error('pistol reload did not receive an authority completion tick');
        }
        while (authority.serverTick < reloading.reloadCompletesAtTick) {
          authority.advanceOneTick();
        }
        expect(weaponState(authority, expected.weaponId)).toMatchObject({
          phase: 'ready',
          magazineRounds: 12,
          reserveRounds: 71,
          reloadCompletesAtTick: null,
        });
      }
    }
  });

  it('round-trips an active rocket and selected ammo through checkpoint plus reconnect', () => {
    const source = startRoom();
    const fired = equipAndFire(source, 4, KYX_WEAPON_ID.rocket);
    expect(fired.weaponAttackResults?.[0]).toMatchObject({
      kind: 'projectile',
      projectile: { phase: 'active' },
    });
    expect(source.disconnectConnection('connection_A')).toBe(true);
    const checkpoint = JSON.parse(
      JSON.stringify(source.exportActiveMatchCheckpoint()),
    ) as unknown;
    const restored = room();
    expect(restored.restoreActiveMatchCheckpoint(checkpoint)).toEqual(source.fullSnapshot());
    const resumed = restored.resumePlayer({
      playerId: 'player_A',
      connectionId: 'connection_A_rotated',
    });
    expect(resumed).toMatchObject({
      ok: true,
      connectionMode: 'resumed',
    });
    if (!resumed.ok) return;
    const resumedPlayer = resumed.snapshot.players.find(
      ({ playerId }) => playerId === 'player_A',
    );
    expect(resumedPlayer?.combat?.armory).toMatchObject({
      selectedSlot: 4,
      weapons: expect.arrayContaining([
        expect.objectContaining({
          weaponId: KYX_WEAPON_ID.rocket,
          magazineRounds: 0,
          acceptedAttackCount: 1,
        }),
      ]),
    });
    expect(resumed.snapshot.weaponProjectiles).toEqual([
      expect.objectContaining({
        weaponId: KYX_WEAPON_ID.rocket,
        phase: 'active',
      }),
    ]);

    let detonationTick: AuthorityRoomTickResult | null = null;
    for (let index = 0; index < 4 && detonationTick === null; index += 1) {
      const tick = restored.advanceOneTick();
      if ((tick.weaponProjectileResults?.length ?? 0) > 0) detonationTick = tick;
    }
    expect(detonationTick).not.toBeNull();
    if (detonationTick === null) return;
    expect(detonationTick.weaponProjectileResults?.[0]).toMatchObject({
      detonation: {
        weaponId: KYX_WEAPON_ID.rocket,
        reason: 'collision',
      },
      splash: {
        impacts: [expect.objectContaining({ targetPlayerId: 'player_B' })],
      },
      damages: [expect.objectContaining({ accepted: true })],
    });
    expect(restored.fullSnapshot().weaponProjectiles).toBeUndefined();
    const presentation = reliablePresentation(restored, detonationTick);
    expect(presentation.kinds).toContain('weapon_projectile_detonated');
    expect(presentation.kinds).toContain('damage_applied');
  });

  it('materializes same-tick smoke before legacy rifle resolution and preserves it on reconnect', () => {
    const source = startRoom();
    const prepared = checkpointWithSmokeDetonatingNextTick(source, 0, 0);
    const restored = room();
    restored.restoreActiveMatchCheckpoint(prepared.checkpoint);

    expect(restored.enqueueInputBatch(
      'connection_A',
      input(restored, 1, 0, INTENT_BUTTON.primaryFire),
    ).accepted).toBe(1);
    const tick = restored.advanceOneTick();
    const smokeFieldId = `${prepared.projectileId}.smoke`;

    expect(tick.serverTick).toBe(prepared.detonationTick);
    expect(tick.hitscanResults?.[0]).toMatchObject({
      resolution: {
        accepted: true,
        outcome: 'miss',
        reason: 'world_occluded',
        debug: {
          barrelObstruction: { hit: false },
          worldOcclusion: {
            hit: true,
            distanceMillimeters: 0,
            colliderId: smokeFieldId,
          },
        },
      },
      damage: null,
    });
    expect(playerHealth(restored, 'player_B')).toBe(100);
    expect(restored.fullSnapshot().abilitySmokeFields).toEqual([
      expect.objectContaining({
        fieldId: smokeFieldId,
        spawnedAtTick: prepared.detonationTick,
        radiusMillimeters: 5_880,
      }),
    ]);

    expect(restored.disconnectConnection('connection_A')).toBe(true);
    const reconnectCheckpoint = JSON.parse(
      JSON.stringify(restored.exportActiveMatchCheckpoint()),
    ) as unknown;
    const resumed = room();
    resumed.restoreActiveMatchCheckpoint(reconnectCheckpoint);
    const resume = resumed.resumePlayer({
      playerId: 'player_A',
      connectionId: 'connection_A_rotated',
    });
    expect(resume).toMatchObject({ ok: true, connectionMode: 'resumed' });
    if (!resume.ok) return;
    expect(resume.snapshot.abilitySmokeFields).toEqual([
      expect.objectContaining({ fieldId: smokeFieldId }),
    ]);
  });

  it('applies the same smoke volume to the generalized sniper hitscan family', () => {
    const source = startRoom();
    expect(source.enqueueInputBatch(
      'connection_A',
      input(source, 0, 3),
    ).accepted).toBe(1);
    source.advanceOneTick();
    const readyAtTick = weaponState(source, KYX_WEAPON_ID.sniper).readyAtTick;
    if (readyAtTick === null) throw new Error('sniper did not begin equipping');
    while (source.serverTick < readyAtTick) source.advanceOneTick();

    const prepared = checkpointWithSmokeDetonatingNextTick(source, 1, 3);
    const restored = room();
    restored.restoreActiveMatchCheckpoint(prepared.checkpoint);
    expect(restored.enqueueInputBatch(
      'connection_A',
      input(restored, 2, 3, INTENT_BUTTON.primaryFire),
    ).accepted).toBe(1);
    const tick = restored.advanceOneTick();
    const smokeFieldId = `${prepared.projectileId}.smoke`;
    const result = tick.weaponAttackResults?.[0];

    expect(tick.serverTick).toBe(prepared.detonationTick);
    expect(result).toMatchObject({
      kind: 'hitscan',
      acceptedAttack: { weaponId: KYX_WEAPON_ID.sniper },
      roomRejectionReason: null,
      damages: [],
    });
    if (result?.kind !== 'hitscan' || result.resolution === null) {
      throw new Error('sniper smoke proof did not produce a hitscan resolution');
    }
    expect(result.resolution.damageTotals).toEqual([]);
    expect(result.resolution.pelletResults).toHaveLength(1);
    expect(result.resolution.pelletResults[0]).toMatchObject({
      accepted: true,
      outcome: 'miss',
      reason: 'world_occluded',
      debug: {
        barrelObstruction: { hit: false },
        worldOcclusion: {
          hit: true,
          distanceMillimeters: 0,
          colliderId: smokeFieldId,
        },
      },
    });
    expect(playerHealth(restored, 'player_B')).toBe(100);
  });
});
