import { describe, expect, it } from 'vitest';

import {
  deterministicCombatBotDecision,
  deterministicCombatBotInput,
  type AuthorityFullSnapshot,
} from '../../../src/authority';
import { INTENT_BUTTON } from '../../../src/sim';

function player(
  playerId: string,
  teamId: string,
  x: number,
  z: number,
  healthPoints = 100,
): AuthorityFullSnapshot['players'][number] {
  return {
    playerId,
    movement: {
      player: {
        feetPosition: { x, y: 0, z },
        yawMilliDegrees: 0,
        pitchMilliDegrees: 0,
        teleportCooldownTicksRemaining: 0,
      },
    },
    combat: {
      life: { phase: 'alive', teamId, healthPoints, shieldPoints: 0 },
      armory: { selectedSlot: 0 },
    },
  } as AuthorityFullSnapshot['players'][number];
}

function snapshot(
  serverTick: number,
  players: readonly AuthorityFullSnapshot['players'][number][],
): AuthorityFullSnapshot {
  return { serverTick, players } as AuthorityFullSnapshot;
}

describe('deterministic combat bot strategy', () => {
  it('finishes a vulnerable threat instead of blindly selecting the nearest enemy', () => {
    const state = snapshot(20, [
      player('bot', 'blue', 0, 0),
      player('near-healthy', 'red', 0, 5_000),
      player('far-vulnerable', 'red', 6_500, 0, 10),
    ]);

    expect(deterministicCombatBotDecision(state, 'bot')).toMatchObject({
      targetPlayerId: 'far-vulnerable',
      targetEffectiveHealth: 10,
      tactic: 'finish_vulnerable',
      moveY: 96,
    });
  });

  it('disengages while critically wounded and uses ready Blink on a stable tick', () => {
    const state = snapshot(151, [
      player('bot', 'blue', 0, 0, 40),
      player('enemy', 'red', 0, 5_000),
    ]);

    expect(deterministicCombatBotDecision(state, 'bot')).toMatchObject({
      tactic: 'disengage',
      selfEffectiveHealth: 40,
      moveY: -72,
    });
    const input = deterministicCombatBotInput(state, 'bot', 0, 1, {
      strategy: 'adaptive',
    });
    expect(input.moveY).toBe(-72);
    expect(input.heldButtons & INTENT_BUTTON.utility).toBe(INTENT_BUTTON.utility);
    expect(input.pressedButtons & INTENT_BUTTON.utility).toBe(INTENT_BUTTON.utility);
  });

  it('keeps baseline nearest-target behavior available as an explicit option', () => {
    const state = snapshot(20, [
      player('bot', 'blue', 0, 0),
      player('near-healthy', 'red', 0, 5_000),
      player('far-vulnerable', 'red', 6_500, 0, 10),
    ]);
    const baseline = deterministicCombatBotInput(state, 'bot', 0, 1, {
      strategy: 'baseline',
      locomotion: 'sentry',
    });
    const adaptive = deterministicCombatBotInput(state, 'bot', 0, 1, {
      strategy: 'adaptive',
      locomotion: 'sentry',
    });

    expect(baseline.lookYawDeltaMilliDegrees).toBe(0);
    expect(adaptive.lookYawDeltaMilliDegrees).toBe(12_000);
    expect(baseline.lookPitchDeltaMilliDegrees).toBe(0);
    expect(adaptive.lookPitchDeltaMilliDegrees).toBe(0);
  });
});
