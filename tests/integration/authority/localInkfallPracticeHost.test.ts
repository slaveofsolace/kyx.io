import { afterEach, describe, expect, it } from 'vitest';

import {
  LOCAL_INKFALL_PRACTICE_HOST_ID,
  LOCAL_INKFALL_PRACTICE_BOT_PRESET_ORDER,
  LOCAL_INKFALL_PRACTICE_PLAYER_ID,
  LOCAL_INKFALL_PRACTICE_TICK_MILLISECONDS,
  LOCAL_INKFALL_PRACTICE_TICK_RATE_HZ,
  LocalInkfallPracticeHost,
  localInkfallPracticeBotPresetId,
  RELAY_AUTHORITY_IDENTITY,
  RELAY_PORTAL_CAPABILITY_ID,
} from '../../../src/authority';
import { createLocalInkfallPracticePresentation } from '../../../src/app/localInkfallPracticePresentation';
import { createAuthorityScoreboardRows } from '../../../src/app/authorityHudProjection';
import {
  COMBAT_PRESET_ID,
  combatPresetAbilityLoadout,
  combatPresetById,
} from '../../../src/loadouts';
import { INTENT_BUTTON } from '../../../src/sim';

const hosts: LocalInkfallPracticeHost[] = [];

async function host(botCount = 3): Promise<LocalInkfallPracticeHost> {
  const created = await LocalInkfallPracticeHost.create({ botCount });
  hosts.push(created);
  return created;
}

afterEach(() => {
  while (hosts.length > 0) hosts.pop()?.dispose();
});

describe('browser-local Relay Practice authority host', () => {
  it('boots the original Relay authority room at fixed 20 Hz', async () => {
    const practice = await host(3);
    const initial = practice.snapshot;

    expect(practice.hostId).toBe(LOCAL_INKFALL_PRACTICE_HOST_ID);
    expect(LOCAL_INKFALL_PRACTICE_TICK_RATE_HZ).toBe(20);
    expect(LOCAL_INKFALL_PRACTICE_TICK_MILLISECONDS).toBe(50);
    expect(initial.identity).toMatchObject({
      mapId: RELAY_AUTHORITY_IDENTITY.mapId,
      fixtureId: RELAY_AUTHORITY_IDENTITY.fixtureId,
      fixtureHash: RELAY_AUTHORITY_IDENTITY.fixtureHash,
      rulesetId: 'revamped_classic',
      rulesetRevision: 3,
      physicsAdapterId: 'rapier3d_deterministic_compat',
    });
    expect(initial.players).toHaveLength(4);
    expect(initial.players.map(({ playerId }) => playerId)).toEqual([
      'practice.bot.01',
      'practice.bot.02',
      'practice.bot.03',
      LOCAL_INKFALL_PRACTICE_PLAYER_ID,
    ]);
    expect(initial.players.every(({ combat }) => combat !== undefined)).toBe(true);
    expect(practice.authority.worldPortalCapabilityId)
      .toBe(RELAY_PORTAL_CAPABILITY_ID);
  });

  it('fields deterministic Assault, Breacher, Recon, and Duelist opponents', async () => {
    const practice = await host(7);
    const bots = practice.snapshot.players.filter(({ playerId }) => (
      playerId.startsWith('practice.bot.')
    ));

    expect(LOCAL_INKFALL_PRACTICE_BOT_PRESET_ORDER)
      .toEqual(['assault', 'breacher', 'recon', 'duelist']);
    expect(bots.map(({ playerId }) => localInkfallPracticeBotPresetId(playerId)))
      .toEqual(['assault', 'breacher', 'recon', 'duelist', 'assault', 'breacher', 'recon']);
    expect(bots.map(({ combat }) => combat?.armory.selectedSlot))
      .toEqual([0, 2, 3, 5, 0, 2, 3]);
    expect(bots.map(({ combat }) => combat?.abilityLoadout?.loadout.slots.slice(1)))
      .toEqual(bots.map(({ playerId }) => (
        combatPresetAbilityLoadout(combatPresetById(
          localInkfallPracticeBotPresetId(playerId),
        )).slots.slice(1)
      )));
  });

  it('accepts one local and one deterministic bot command per participant per tick', async () => {
    const practice = await host(3);
    const initialBots = new Map(practice.snapshot.players.slice(1).map((player) => [
      player.playerId,
      player.movement.player.feetPosition,
    ]));
    const initialSnapshot = practice.snapshot;
    const reliableEventIds: string[] = [];
    const reliableEventKinds = new Set<string>();

    let result = practice.step();
    reliableEventIds.push(...result.reliableEvents.map(({ id }) => id));
    result.reliableEvents.forEach(({ kind }) => reliableEventKinds.add(kind));
    for (let index = 1; index < 80; index += 1) {
      result = practice.step();
      reliableEventIds.push(...result.reliableEvents.map(({ id }) => id));
      result.reliableEvents.forEach(({ kind }) => reliableEventKinds.add(kind));
    }

    const metrics = practice.authority.metricsSnapshot();
    expect(result.snapshot.serverTick).toBe(80);
    expect(result.snapshot.lifecycle).toBe('active');
    expect(metrics.acceptedInputs).toBe(320);
    expect(Object.values(metrics.inputRejections).reduce((sum, count) => sum + count, 0)).toBe(0);
    expect(result.snapshot.players.slice(1).some((player) => (
      JSON.stringify(player.movement.player.feetPosition)
        !== JSON.stringify(initialBots.get(player.playerId))
    ))).toBe(true);
    expect(result.snapshot.match).toMatchObject({
      matchId: 'match.local.relay.practice',
      phase: 'active',
    });
    const attack = practice.step({
      moveX: 0,
      moveY: 0,
      lookYawDeltaMilliDegrees: 0,
      lookPitchDeltaMilliDegrees: 0,
      heldButtons: INTENT_BUTTON.primaryFire,
      pressedButtons: INTENT_BUTTON.primaryFire,
      releasedButtons: 0,
      selectedSlot: 0,
    });
    reliableEventIds.push(...attack.reliableEvents.map(({ id }) => id));
    attack.reliableEvents.forEach(({ kind }) => reliableEventKinds.add(kind));
    expect(reliableEventIds).toEqual(reliableEventIds.map((_, index) => `event.${index}`));
    expect(reliableEventKinds).toContain('weaponAttackAccepted');

    const presentation = createLocalInkfallPracticePresentation({
      snapshot: attack.snapshot,
      previousSnapshot: initialSnapshot,
      interpolationAlpha: 0.5,
      localPlayerId: practice.localPlayerId,
      recentEvents: attack.reliableEvents,
    });
    expect(presentation.presentation.remotes).toHaveLength(3);
    expect(presentation.combat.snapshot.players).toHaveLength(4);
    expect(attack.snapshot.match?.playerScores).toHaveLength(4);
    expect(presentation.combat.localPlayerId).toBe(practice.localPlayerId);
    expect(createAuthorityScoreboardRows(
      attack.snapshot.match?.playerScores ?? [],
      practice.localPlayerId,
    )).toHaveLength(4);
    expect(presentation.hud).toMatchObject({
      schemaVersion: 1,
      mode: 'practice',
      score: { rightScore: expect.any(Number) },
      connection: { state: 'quiet' },
    });
  });

  it('sustains a deterministic 1+7 population past the former east-rail failure tick', async () => {
    const first = await host(7);
    const second = await host(7);
    let lastFirstSnapshot = first.snapshot;

    for (let tick = 0; tick < 360; tick += 1) {
      try {
        lastFirstSnapshot = first.step().snapshot;
      } catch (error) {
        throw new Error(`LOCAL_PRACTICE_SUSTAINED_FAILURE:${JSON.stringify({
          tick,
          players: lastFirstSnapshot.players.map(({ playerId, movement }) => ({
            playerId,
            feetPosition: movement.player.feetPosition,
            velocity: movement.player.velocity,
            yawMilliDegrees: movement.player.yawMilliDegrees,
          })),
        })}`, { cause: error });
      }
      second.step();
    }

    expect(first.snapshot.serverTick).toBe(360);
    expect(first.snapshot.players).toHaveLength(8);
    expect(second.snapshot).toEqual(first.snapshot);
    expect(second.authority.metricsSnapshot()).toEqual(first.authority.metricsSnapshot());
    const botSnapshots = first.snapshot.players.filter(({ playerId }) => (
      playerId.startsWith('practice.bot.')
    ));
    expect(new Set(botSnapshots.map(({ combat }) => combat?.armory.selectedSlot)))
      .toEqual(new Set([0, 2, 3, 5]));
    expect(botSnapshots.some(({ movement }) => (
      movement.player.pitchMilliDegrees !== 0
    ))).toBe(true);
    expect(botSnapshots.reduce((total, { combat }) => (
      total + (combat?.abilityLoadout?.acceptedActivationCounts.reduce(
        (sum, count) => sum + count,
        0,
      ) ?? 0)
    ), 0)).toBeGreaterThan(0);
  }, 20_000);

  it('keeps the 1+7 runtime stable after a player-eye Launch sequence', async () => {
    const practice = await host(7);
    for (let tick = 0; tick < 8; tick += 1) practice.step();
    for (let tick = 0; tick < 3; tick += 1) {
      practice.step({
        moveX: 0,
        moveY: 0,
        lookYawDeltaMilliDegrees: 0,
        lookPitchDeltaMilliDegrees: -32_767,
        heldButtons: 0,
        pressedButtons: 0,
        releasedButtons: 0,
        selectedSlot: 0,
      });
    }
    const launch = practice.step({
      moveX: 0,
      moveY: 0,
      lookYawDeltaMilliDegrees: 0,
      lookPitchDeltaMilliDegrees: 0,
      heldButtons: INTENT_BUTTON.abilityOne,
      pressedButtons: INTENT_BUTTON.abilityOne,
      releasedButtons: 0,
      selectedSlot: 0,
    });
    const launchKinds = launch.reliableEvents.flatMap(({ presentation }) => (
      presentation === undefined ? [] : [presentation.kind]
    ));
    const subsequentKinds: string[] = [];
    for (let tick = 0; tick < 180; tick += 1) {
      try {
        const step = practice.step(tick === 0
          ? {
              moveX: 0,
              moveY: 0,
              lookYawDeltaMilliDegrees: 0,
              lookPitchDeltaMilliDegrees: 0,
              heldButtons: 0,
              pressedButtons: 0,
              releasedButtons: INTENT_BUTTON.abilityOne,
              selectedSlot: 0,
            }
          : undefined);
        subsequentKinds.push(...step.reliableEvents.flatMap(({ presentation }) => (
          presentation === undefined ? [] : [presentation.kind]
        )));
      } catch (error) {
        throw new Error(`LOCAL_PRACTICE_LAUNCH_FAILURE:${JSON.stringify({
          tick,
          serverTick: practice.snapshot.serverTick,
          players: practice.snapshot.players.map(({ playerId, movement }) => ({
            playerId,
            feetPosition: movement.player.feetPosition,
            velocity: movement.player.velocity,
            grounded: movement.player.grounded,
            yawMilliDegrees: movement.player.yawMilliDegrees,
            pitchMilliDegrees: movement.player.pitchMilliDegrees,
          })),
        })}`, { cause: error });
      }
    }

    expect(launchKinds).toContain('impulse_grenade_throw_accepted');
    expect(subsequentKinds).toContain('impulse_grenade_collision');
    expect(subsequentKinds).toContain('impulse_grenade_detonated');
    expect(practice.snapshot.serverTick).toBe(192);
  }, 20_000);

  it('closes the local death, countdown, and authoritative respawn loop', async () => {
    const practice = await host(1);
    while (practice.snapshot.serverTick < 80) practice.step();

    const lethal = practice.authority.applyCombatDamage({
      targetPlayerId: practice.localPlayerId,
      sourcePlayerId: practice.botPlayerIds[0] ?? null,
      damagePoints: 100,
      causeId: 'test.local_practice_respawn',
    });
    expect(lethal).toMatchObject({
      accepted: true,
      state: {
        phase: 'dead',
        healthPoints: 0,
        respawnEligibleAtTick: 240,
      },
    });

    const deadSnapshot = practice.snapshot;
    const deadPresentation = createLocalInkfallPracticePresentation({
      snapshot: deadSnapshot,
      previousSnapshot: deadSnapshot,
      interpolationAlpha: 1,
      localPlayerId: practice.localPlayerId,
    });
    expect(deadPresentation.hud.life).toEqual({
      state: 'dead',
      respawnSeconds: 8,
      message: 'Eliminated. Respawn in 8s.',
    });

    while (practice.snapshot.serverTick < 240) practice.step();
    const respawned = practice.snapshot.players.find(
      ({ playerId }) => playerId === practice.localPlayerId,
    );
    expect(respawned).toMatchObject({
      combat: {
        life: {
          phase: 'alive',
          healthPoints: 100,
          deathOrdinal: 1,
          spawnOrdinal: 2,
          respawnEligibleAtTick: null,
        },
      },
    });
  });

  it('applies a non-Assault combat preset before the local match starts', async () => {
    const preset = combatPresetById(COMBAT_PRESET_ID.breacher);
    const practice = await LocalInkfallPracticeHost.create({
      botCount: 1,
      combatPresetId: preset.id,
    });
    hosts.push(practice);

    const initialLocal = practice.snapshot.players.find(
      ({ playerId }) => playerId === practice.localPlayerId,
    );
    expect(initialLocal?.combat?.abilityLoadout?.loadout.slots)
      .toEqual(combatPresetAbilityLoadout(preset).slots);
    expect(initialLocal?.combat?.armory.selectedSlot)
      .toBe(preset.authorityPrimaryWeaponSlot);

    const disallowed = {
      moveX: 0,
      moveY: 0,
      lookYawDeltaMilliDegrees: 0,
      lookPitchDeltaMilliDegrees: 0,
      heldButtons: 0,
      pressedButtons: 0,
      releasedButtons: 0,
      selectedSlot: 0,
    } as const;
    expect(() => practice.step(disallowed))
      .toThrow('LOCAL_INKFALL_PRACTICE_WEAPON_SLOT_NOT_IN_PRESET');

    practice.step({ ...disallowed, selectedSlot: 5 });
    const steppedLocal = practice.snapshot.players.find(
      ({ playerId }) => playerId === practice.localPlayerId,
    );
    expect(steppedLocal?.combat?.armory.selectedSlot)
      .toBe(5);
  });

  it('stops enqueueing input after an authority score-limit result', async () => {
    const practice = await host(7);
    while (practice.snapshot.lifecycle !== 'active') practice.authority.advanceOneTick();
    const localTeamId = practice.snapshot.match?.playerScores.find(
      ({ playerId }) => playerId === practice.localPlayerId,
    )?.teamId;
    const opponents = practice.snapshot.match?.playerScores.filter(
      ({ teamId }) => teamId !== localTeamId,
    ) ?? [];
    expect(opponents).toHaveLength(4);

    for (let wave = 0; wave < 10; wave += 1) {
      for (const opponent of opponents) {
        expect(practice.authority.applyCombatDamage({
          targetPlayerId: opponent.playerId,
          sourcePlayerId: practice.localPlayerId,
          damagePoints: 100,
          causeId: `test.local_practice_result.${wave}.${opponent.playerId}`,
        })).toMatchObject({ accepted: true });
      }
      if (practice.snapshot.match?.result !== null) break;
      for (let tick = 0; tick < 160; tick += 1) practice.authority.advanceOneTick();
      for (const opponent of opponents) {
        expect(practice.authority.respawnCombatPlayer(opponent.playerId))
          .toMatchObject({ accepted: true });
      }
      for (let tick = 0; tick < 20; tick += 1) practice.authority.advanceOneTick();
    }

    expect(practice.snapshot).toMatchObject({
      lifecycle: 'postmatch',
      match: {
        phase: 'postmatch',
        result: {
          kind: 'match_result',
          reason: 'score_limit',
          winningTeamId: localTeamId,
          draw: false,
        },
      },
    });
    const acceptedInputsBefore = practice.authority.metricsSnapshot().acceptedInputs;
    const postmatch = practice.step();
    expect(postmatch.snapshot.lifecycle).toBe('postmatch');
    expect(practice.authority.metricsSnapshot().acceptedInputs).toBe(acceptedInputsBefore);
  }, 30_000);

  it('fails closed for invalid population and after disposal', async () => {
    await expect(LocalInkfallPracticeHost.create({ botCount: 0 })).rejects.toThrow(RangeError);
    await expect(LocalInkfallPracticeHost.create({ botCount: 8 })).rejects.toThrow(RangeError);

    const practice = await host(1);
    practice.dispose();
    expect(() => practice.step()).toThrow('LOCAL_INKFALL_PRACTICE_HOST_DISPOSED');
  });
});
