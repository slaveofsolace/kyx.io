import { describe, expect, it } from 'vitest';

import {
  createOnlineHudViewModel,
  createPracticeHudViewModel,
  formatMatchClock,
} from '../../../src/ui/hudViewModel';
import { abilityGlyphKind } from '../../../src/ui/abilityGlyph';

describe('shared HUD view model', () => {
  it('normalizes the practice HUD into four restrained gameplay slots', () => {
    const view = createPracticeHudViewModel({
      player: {
        health: 22,
        maxHealth: 100,
        shield: 0,
        maxShield: 50,
        stamina: 70,
        maxStamina: 100,
      },
      weapon: {
        name: 'AR-9 Assault',
        magAmmo: 3,
        reserveAmmo: 72,
        magazineCapacity: 30,
      },
      kills: 4,
      score: 600,
    });

    expect(view.mode).toBe('practice');
    expect(view.health).toMatchObject({ value: 22, state: 'critical' });
    expect(view.weapon).toMatchObject({
      magazineLabel: '3',
      reserveLabel: '72',
      ammoState: 'low',
    });
    expect(view.abilities).toHaveLength(4);
    expect(view.abilities.map(({ key }) => key)).toEqual(['Q', 'E', 'F', 'Z']);
    expect(view.abilities[0]).toMatchObject({ name: 'Blink', locked: true });
  });

  it('uses the same contract for online score, cooldown, death, and safe failure copy', () => {
    const view = createOnlineHudViewModel({
      health: 0,
      weapon: {
        name: 'scatter gun',
        magazineRounds: 0,
        reserveRounds: 12,
        magazineCapacity: 6,
        isReloading: true,
      },
      abilities: [
        {
          id: 'vertical_teleport_v1',
          name: 'Blink',
          key: 'Q',
          locked: true,
          state: 'charging',
          cooldownSeconds: 1.5,
          readinessRatio: 0.4,
        },
        {
          id: 'launch_v1',
          name: 'Launch',
          key: 'E',
          charges: 1,
          maximumCharges: 1,
        },
        {
          id: 'flash_v1',
          name: 'Flash',
          key: 'F',
          state: 'charging',
          charges: 0,
          maximumCharges: 2,
          cooldownSeconds: 4.25,
          readinessRatio: 0.58,
        },
        {
          id: 'frag_v1',
          name: 'Frag',
          key: 'Z',
          state: 'empty',
          charges: 0,
          maximumCharges: 2,
        },
      ],
      blueScore: 7,
      redScore: 5,
      remainingSeconds: 83,
      phase: 'active',
      objective: 'One shot · Individual score',
      connectionPhase: 'failed',
      connectionError: 'INTERNAL_SOCKET_TOKEN=do-not-display',
      lifeState: 'dead',
      respawnTicks: 37,
      tickRateHz: 20,
    });

    expect(view.mode).toBe('online');
    expect(view.score).toMatchObject({
      leftScore: 7,
      rightScore: 5,
      timerLabel: '1:23',
      objectiveLabel: 'One shot · Individual score',
    });
    expect(view.abilities[0]).toMatchObject({
      state: 'charging',
      stateLabel: '1.5s',
      readinessRatio: 0.4,
    });
    expect(view.abilities[2]).toMatchObject({
      state: 'charging',
      stateLabel: '4.3s',
      readinessRatio: 0.58,
    });
    expect(view.life).toEqual({
      state: 'dead',
      respawnSeconds: 2,
      message: 'Eliminated. Respawn in 2s.',
    });
    expect(view.connection).toEqual({
      state: 'fatal',
      message: 'The room connection ended. Start a fresh room or return to the online lobby.',
      canRetry: true,
    });
    expect(view.connection.message).not.toContain('SOCKET');
  });

  it('formats bounded match clocks', () => {
    expect(formatMatchClock(0)).toBe('0:00');
    expect(formatMatchClock(65.9)).toBe('1:05');
    expect(formatMatchClock(Number.NaN)).toBe('0:00');
  });

  it('maps runtime ability ids to one consistent original glyph set', () => {
    expect(abilityGlyphKind('vertical_teleport_v1')).toBe('blink');
    expect(abilityGlyphKind('vertical_impulse_grenade_v1')).toBe('launch');
    expect(abilityGlyphKind('smoke_grenade_v1')).toBe('smoke');
    expect(abilityGlyphKind('sticky_grenade_v1')).toBe('sticky');
    expect(abilityGlyphKind('flash_grenade_v1')).toBe('flash');
    expect(abilityGlyphKind('frag_grenade_v1')).toBe('frag');
  });
});
