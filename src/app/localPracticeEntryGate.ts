import {
  ABILITY_ID,
  type AbilityId,
  type AbilityLoadoutUiSlot,
} from '../abilities/abilityLoadout';
import {
  KYX_MODE_ID,
  type KyxDeathmatchAuthorityModeId,
} from '../authority/modes/modeCatalog';

export const LOCAL_PRACTICE_POINTER_LOCK_TIMEOUT_MILLISECONDS = 1_600;
export const LOCAL_PRACTICE_MODE_LABEL = 'Relay · Team Deathmatch';
export const LOCAL_PRACTICE_ACTION_LABEL = 'Play Team Deathmatch';
export const LOCAL_PRACTICE_GOAL_TITLE = 'First team to 40 wins';
export const LOCAL_PRACTICE_GOAL_SUMMARY =
  'Score eliminations. First to 40 wins; if eight minutes expire, the higher score takes the match.';

export interface LocalPracticeModeCopy {
  readonly matchMode: KyxDeathmatchAuthorityModeId;
  readonly modeLabel: string;
  readonly actionLabel: string;
  readonly goalTitle: string;
  readonly goalSummary: string;
  readonly objectiveLabel: string;
}

const LOCAL_PRACTICE_MODE_COPY = Object.freeze({
  [KYX_MODE_ID.teamDeathmatch]: Object.freeze({
    matchMode: KYX_MODE_ID.teamDeathmatch,
    modeLabel: LOCAL_PRACTICE_MODE_LABEL,
    actionLabel: LOCAL_PRACTICE_ACTION_LABEL,
    goalTitle: LOCAL_PRACTICE_GOAL_TITLE,
    goalSummary: LOCAL_PRACTICE_GOAL_SUMMARY,
    objectiveLabel: 'Team deathmatch',
  }),
  [KYX_MODE_ID.freeForAll]: Object.freeze({
    matchMode: KYX_MODE_ID.freeForAll,
    modeLabel: 'Relay · Free For All',
    actionLabel: 'Play Free For All',
    goalTitle: 'First player to 25 wins',
    goalSummary:
      'Every combatant is hostile. Score 25 eliminations before the eight-minute clock expires.',
    objectiveLabel: 'Individual score',
  }),
  [KYX_MODE_ID.instagib]: Object.freeze({
    matchMode: KYX_MODE_ID.instagib,
    modeLabel: 'Relay · Instagib',
    actionLabel: 'Play Instagib',
    goalTitle: 'One shot · First player to 25',
    goalSummary:
      'Every combatant is hostile. Longshot is locked and every accepted hit deals lethal damage.',
    objectiveLabel: 'One shot · Individual score',
  }),
} as const satisfies Readonly<Record<KyxDeathmatchAuthorityModeId, LocalPracticeModeCopy>>);

export function localPracticeModeCopy(
  matchMode: KyxDeathmatchAuthorityModeId,
): LocalPracticeModeCopy {
  return LOCAL_PRACTICE_MODE_COPY[matchMode];
}

export function localPracticeModeChoices(): readonly LocalPracticeModeCopy[] {
  return Object.freeze([
    LOCAL_PRACTICE_MODE_COPY[KYX_MODE_ID.teamDeathmatch],
    LOCAL_PRACTICE_MODE_COPY[KYX_MODE_ID.freeForAll],
    LOCAL_PRACTICE_MODE_COPY[KYX_MODE_ID.instagib],
  ]);
}

const ABILITY_MEANINGS: Readonly<Record<AbilityId, string>> = Object.freeze({
  [ABILITY_ID.blink]: 'Hold to preview a safe landing; release to relocate.',
  [ABILITY_ID.launch]: 'Detonates on contact and launches nearby players.',
  [ABILITY_ID.frag]: 'Timed blast with radial damage and distance falloff.',
  [ABILITY_ID.smoke]: 'Expanding cover that blocks sight.',
  [ABILITY_ID.sticky]: 'Sticks on contact, then detonates.',
  [ABILITY_ID.flash]: 'Disrupts players in line of sight; deals no damage.',
});

export interface LocalPracticeAbilityGuideRow {
  readonly inputLabel: string;
  readonly name: string;
  readonly meaning: string;
  readonly locked: boolean;
}

export function localPracticeAbilityGuideRows(
  slots: readonly AbilityLoadoutUiSlot[],
): readonly LocalPracticeAbilityGuideRow[] {
  if (slots.length !== 4) {
    throw new RangeError('local Practice onboarding requires exactly four ability slots');
  }
  return Object.freeze(slots.map((slot, index) => {
    if (slot.slot !== index) {
      throw new RangeError('local Practice ability slots must be ordered Q/E/F/Z');
    }
    return Object.freeze({
      inputLabel: slot.inputLabel,
      name: slot.ability.shortName,
      meaning: ABILITY_MEANINGS[slot.ability.id],
      locked: slot.locked,
    });
  }));
}
