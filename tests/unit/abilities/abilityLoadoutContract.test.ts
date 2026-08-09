import { describe, expect, it } from 'vitest';

import {
  ABILITY_ID,
  ABILITY_LOADOUT_SCHEMA_VERSION,
  ABILITY_PRESENTATION,
  DEFAULT_ABILITY_LOADOUT,
  assertAbilityLoadout,
  createAbilityLoadout,
} from '../../../src/abilities/abilityLoadout';
import { G4_ABILITY_RESOURCE_INTEGRATION_RULES } from '../../../src/authority/combat/abilityResources';

describe('shared ability loadout contract', () => {
  it('locks Blink plus exactly three unique selectable slots in schema v1', () => {
    expect(ABILITY_LOADOUT_SCHEMA_VERSION).toBe(1);
    expect(DEFAULT_ABILITY_LOADOUT.slots).toEqual([
      ABILITY_ID.blink,
      ABILITY_ID.launch,
      ABILITY_ID.smoke,
      ABILITY_ID.frag,
    ]);
    expect(createAbilityLoadout([
      ABILITY_ID.sticky,
      ABILITY_ID.flash,
      ABILITY_ID.launch,
    ]).slots).toHaveLength(4);
    expect(() => createAbilityLoadout([ABILITY_ID.frag, ABILITY_ID.smoke]))
      .toThrow('exactly three selectable abilities');
    expect(() => assertAbilityLoadout({
      schemaVersion: 1,
      slots: [ABILITY_ID.frag, ABILITY_ID.launch, ABILITY_ID.smoke, ABILITY_ID.flash],
    })).toThrow('Blink is locked');
  });

  it('publishes Blink metadata from the exact Worker range/cooldown/cost policy', () => {
    const authority = G4_ABILITY_RESOURCE_INTEGRATION_RULES.teleport;
    expect(ABILITY_PRESENTATION[ABILITY_ID.blink]).toMatchObject({
      locked: true,
      inputLabel: 'Q',
      charges: null,
      maximumRangeMeters: authority.maximumRangeMillimeters / 1_000,
      cooldownSeconds:
        authority.cooldownTicks / G4_ABILITY_RESOURCE_INTEGRATION_RULES.authorityHz,
    });
    expect(authority.resourcePolicy).toBe('movement_profile_cooldown_only');
  });
});
