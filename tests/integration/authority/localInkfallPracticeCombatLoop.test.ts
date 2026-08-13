import { expect, it } from 'vitest';

import { LocalInkfallPracticeHost } from '../../../src/authority/localInkfallPracticeHost';

it('closes the deterministic bot shot, damage, kill, score, and respawn loop', async () => {
  const host = await LocalInkfallPracticeHost.create({ botCount: 3 });
  try {
    let acceptedAttacks = 0;
    let resolvedHitscans = 0;
    let appliedDamage = 0;
    let killedPlayerId: string | null = null;

    // The product intentionally withholds bot attacks until the local player
    // enters the arena. Explicitly author one real movement command so this
    // lifecycle probe covers combat after the same fair-entry contract.
    while (host.snapshot.lifecycle !== 'active') host.step();
    host.step({
      moveX: 0,
      moveY: 0,
      lookYawDeltaMilliDegrees: 1,
      lookPitchDeltaMilliDegrees: 0,
      heldButtons: 0,
      pressedButtons: 0,
      releasedButtons: 0,
      selectedSlot: 0,
    });

    for (let tick = 0; tick < 800 && killedPlayerId === null; tick += 1) {
      const step = host.step();
      acceptedAttacks += step.reliableEvents.filter(
        ({ kind }) => kind === 'weaponAttackAccepted',
      ).length;
      resolvedHitscans += step.tick.hitscanResults?.length ?? 0;
      appliedDamage += step.reliableEvents.filter(
        ({ kind }) => kind === 'damageApplied',
      ).length;
      killedPlayerId = step.reliableEvents.find(
        ({ kind }) => kind === 'playerKilled',
      )?.targetId ?? null;
    }

    expect(acceptedAttacks).toBeGreaterThan(0);
    expect(resolvedHitscans).toBeGreaterThan(0);
    expect(acceptedAttacks).toBeGreaterThan(resolvedHitscans);
    expect(appliedDamage).toBeGreaterThan(0);
    expect(killedPlayerId).not.toBeNull();

    const killed = host.snapshot.players.find(({ playerId }) => playerId === killedPlayerId);
    expect(killed?.combat?.life).toMatchObject({
      phase: 'dead',
      deathOrdinal: 1,
      spawnOrdinal: 1,
    });
    const score = host.snapshot.match;
    expect(score?.teamScores.reduce((total, team) => total + team.score, 0)).toBe(1);
    expect(score?.playerScores.reduce((total, player) => total + player.kills, 0)).toBe(1);
    expect(score?.playerScores.reduce((total, player) => total + player.deaths, 0)).toBe(1);
    expect(score?.feed).toHaveLength(1);

    const respawnAt = killed?.combat?.life.respawnEligibleAtTick;
    expect(respawnAt).not.toBeNull();
    while (host.snapshot.serverTick < (respawnAt ?? 0)) host.step();

    expect(host.snapshot.players.find(({ playerId }) => playerId === killedPlayerId)?.combat?.life)
      .toMatchObject({
        phase: 'alive',
        healthPoints: 100,
        deathOrdinal: 1,
        spawnOrdinal: 2,
        respawnEligibleAtTick: null,
      });
  } finally {
    host.dispose();
  }
}, 30_000);
