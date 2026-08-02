import { afterEach, describe, expect, it } from 'vitest';

import {
  INKFALL_REVISION_4_AUTHORITY_MAP_BINDING,
  LOCAL_INKFALL_PRACTICE_HOST_ID,
  LOCAL_INKFALL_PRACTICE_PLAYER_ID,
  LOCAL_INKFALL_PRACTICE_TICK_MILLISECONDS,
  LOCAL_INKFALL_PRACTICE_TICK_RATE_HZ,
  LocalInkfallPracticeHost,
} from '../../../src/authority';
import { createLocalInkfallPracticePresentation } from '../../../src/app/localInkfallPracticePresentation';
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

describe('browser-local Inkfall Practice authority host', () => {
  it('boots the exact Rev5-compatible Inkfall authority room at fixed 20 Hz', async () => {
    const practice = await host(3);
    const initial = practice.snapshot;

    expect(practice.hostId).toBe(LOCAL_INKFALL_PRACTICE_HOST_ID);
    expect(LOCAL_INKFALL_PRACTICE_TICK_RATE_HZ).toBe(20);
    expect(LOCAL_INKFALL_PRACTICE_TICK_MILLISECONDS).toBe(50);
    expect(initial.identity).toMatchObject({
      mapId: INKFALL_REVISION_4_AUTHORITY_MAP_BINDING.mapId,
      fixtureId: INKFALL_REVISION_4_AUTHORITY_MAP_BINDING.fixtureId,
      fixtureHash: INKFALL_REVISION_4_AUTHORITY_MAP_BINDING.fixtureHash,
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
      .toBe(INKFALL_REVISION_4_AUTHORITY_MAP_BINDING.portal.capabilityId);
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
      matchId: 'match.local.inkfall.practice',
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
    expect(presentation.combat.localPlayerId).toBe(practice.localPlayerId);
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

  it('fails closed for invalid population and after disposal', async () => {
    await expect(LocalInkfallPracticeHost.create({ botCount: 0 })).rejects.toThrow(RangeError);
    await expect(LocalInkfallPracticeHost.create({ botCount: 8 })).rejects.toThrow(RangeError);

    const practice = await host(1);
    practice.dispose();
    expect(() => practice.step()).toThrow('LOCAL_INKFALL_PRACTICE_HOST_DISPOSED');
  });
});
