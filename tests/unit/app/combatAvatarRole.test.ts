import { describe, expect, it } from 'vitest';

import { combatAvatarArmorType } from '../../../src/app/combatAvatarRole';
import {
  COMBAT_PRESETS,
  combatPresetAbilityLoadout,
} from '../../../src/loadouts';
import type { CombatPlayerSnapshotV1 } from '../../../src/net';

function playerForPreset(index: number): CombatPlayerSnapshotV1 {
  const preset = COMBAT_PRESETS[index];
  if (preset === undefined) throw new RangeError('combat preset fixture missing');
  return {
    playerId: `player_${preset.id}`,
    connected: true,
    teamId: 'team_red',
    lifePhase: 'alive',
    healthPoints: 100,
    shieldPoints: 0,
    deathOrdinal: 0,
    respawnEligibleAtTick: null,
    riflePhase: 'ready',
    magazineRounds: 50,
    reserveRounds: 150,
    nextShotAtTick: 0,
    reloadCompletesAtTick: null,
    acceptedShotCount: 0,
    grenadePhase: 'ready',
    grenadeCooldownEndsAtTick: 0,
    acceptedThrowCount: 0,
    activeProjectileCount: 0,
    abilityLoadout: {
      slots: combatPresetAbilityLoadout(preset).slots,
      cooldownEndsAtTicks: [0, 0, 0],
      currentCharges: [2, 2, 2],
      maximumCharges: [2, 2, 2],
      acceptedActivationCounts: [0, 0, 0],
      flashImpairedUntilTick: 0,
    },
  };
}

describe('combat avatar role silhouettes', () => {
  it('maps the four authority loadouts to distinct established armor builders', () => {
    expect(COMBAT_PRESETS.map((_, index) => combatAvatarArmorType(
      playerForPreset(index),
    ))).toEqual(['assault', 'heavy', 'recon', 'stealth']);
  });

  it('uses Assault when a legacy combat snapshot has no loadout', () => {
    expect(combatAvatarArmorType(null)).toBe('assault');
    expect(combatAvatarArmorType({
      ...playerForPreset(0),
      abilityLoadout: undefined,
    })).toBe('assault');
  });
});
