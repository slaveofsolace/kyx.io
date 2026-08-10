import { describe, expect, it } from 'vitest';

import {
  ABILITY_ID,
  abilityLoadoutUiSlots,
  createAbilityLoadout,
} from '../../../src/abilities/abilityLoadout';
import {
  LOCAL_PRACTICE_ACTION_LABEL,
  LOCAL_PRACTICE_GOAL_SUMMARY,
  LOCAL_PRACTICE_GOAL_TITLE,
  LOCAL_PRACTICE_MODE_LABEL,
  localPracticeAbilityGuideRows,
} from '../../../src/app/localPracticeEntryGate';

describe('local Practice entry guidance', () => {
  it('states the canonical Team Deathmatch goal before implementation detail', () => {
    expect(LOCAL_PRACTICE_MODE_LABEL).toBe('Relay · Team Deathmatch');
    expect(LOCAL_PRACTICE_ACTION_LABEL).toBe('Play Team Deathmatch');
    expect(LOCAL_PRACTICE_GOAL_TITLE).toBe('First team to 40 wins');
    expect(LOCAL_PRACTICE_GOAL_SUMMARY).toContain('eight minutes');
  });

  it('derives Q/E/F/Z meanings from the selected preset slots', () => {
    const slots = abilityLoadoutUiSlots(createAbilityLoadout([
      ABILITY_ID.sticky,
      ABILITY_ID.flash,
      ABILITY_ID.launch,
    ]));

    expect(localPracticeAbilityGuideRows(slots)).toEqual([
      expect.objectContaining({ inputLabel: 'Q', name: 'Blink', locked: true }),
      expect.objectContaining({ inputLabel: 'E', name: 'Sticky', locked: false }),
      expect.objectContaining({ inputLabel: 'F', name: 'Flash', locked: false }),
      expect.objectContaining({ inputLabel: 'Z', name: 'Launch', locked: false }),
    ]);
  });

  it('fails closed when the guide does not receive the four canonical slots', () => {
    expect(() => localPracticeAbilityGuideRows([])).toThrow(/exactly four/u);
  });
});
