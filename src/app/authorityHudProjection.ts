import {
  ABILITY_ID,
  ABILITY_PRESENTATION,
  type AbilityId,
} from '../abilities/abilityLoadout';
import type { AuthorityFullSnapshot } from '../authority';
import type { CombatPlayerSnapshotV1, CombatSnapshotV1 } from '../net';
import {
  createPracticeHudViewModel,
  type HudAbilityInput,
  type HudLifeState,
  type HudViewModelV1,
} from '../ui/hudViewModel';

const AUTHORITY_TICK_RATE_HZ = 20;

function cleanWeaponFamily(value: string | undefined): string {
  if (value === undefined) return 'Line rifle';
  return value
    .replace(/_/gu, ' ')
    .replace(/\b\w/gu, (character) => character.toLocaleUpperCase());
}

function formatMatchClock(activeTicksRemaining: number): string {
  const seconds = Math.max(0, Math.ceil(activeTicksRemaining / AUTHORITY_TICK_RATE_HZ));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

export interface AuthorityAbilityHudInput {
  readonly serverTick: number;
  readonly teleportCooldownTicksRemaining: number;
  readonly localPlayer: CombatPlayerSnapshotV1 | undefined;
}

/**
 * Project the one locked Blink slot and three authority-selected loadout slots
 * into the same typed HUD contract for Practice and online presentation.
 */
export function createAuthorityAbilityHudInputs(
  input: AuthorityAbilityHudInput,
): readonly HudAbilityInput[] {
  const selectedAbilities = input.localPlayer?.abilityLoadout?.slots.slice(1) ?? [];
  const blinkReadyIn = Math.max(0, input.teleportCooldownTicksRemaining);
  const blinkCooldownTicks = ABILITY_PRESENTATION[ABILITY_ID.blink].cooldownSeconds
    * AUTHORITY_TICK_RATE_HZ;
  return Object.freeze([
    Object.freeze({
      id: ABILITY_ID.blink,
      name: ABILITY_PRESENTATION[ABILITY_ID.blink].shortName,
      key: 'Q',
      locked: true,
      state: blinkReadyIn === 0 ? 'ready' : 'charging',
      cooldownSeconds: blinkReadyIn / AUTHORITY_TICK_RATE_HZ,
      readinessRatio: blinkReadyIn === 0
        ? 1
        : 1 - Math.min(1, blinkReadyIn / blinkCooldownTicks),
    } satisfies HudAbilityInput),
    ...(['E', 'F', 'Z'] as const).map((key, index): HudAbilityInput => {
      const abilityId = selectedAbilities[index] as AbilityId | undefined;
      const ability = abilityId === undefined ? null : ABILITY_PRESENTATION[abilityId];
      const readyIn = input.localPlayer?.abilityLoadout === undefined
        ? 0
        : Math.max(
            0,
            input.localPlayer.abilityLoadout.cooldownEndsAtTicks[index]
              - input.serverTick,
          );
      const charges = input.localPlayer?.abilityLoadout?.currentCharges[index] ?? 0;
      const maximumCharges = input.localPlayer?.abilityLoadout?.maximumCharges[index] ?? 0;
      const cooldownTicks = (ability?.cooldownSeconds ?? 0) * AUTHORITY_TICK_RATE_HZ;
      return Object.freeze({
        id: abilityId ?? `empty-${key.toLocaleLowerCase()}`,
        name: ability?.shortName ?? 'Empty',
        key,
        available: ability !== null,
        state: ability === null
          ? 'unavailable'
          : charges > 0
            ? 'ready'
            : readyIn > 0
              ? 'charging'
              : 'empty',
        charges: ability === null ? null : charges,
        maximumCharges: ability === null ? null : maximumCharges,
        cooldownSeconds: readyIn / AUTHORITY_TICK_RATE_HZ,
        readinessRatio: charges > 0
          ? 1
          : cooldownTicks > 0
            ? 1 - Math.min(1, readyIn / cooldownTicks)
            : 0,
      });
    }),
  ]);
}

export interface AuthorityPracticeHudProjectionInput {
  readonly snapshot: AuthorityFullSnapshot;
  readonly combat: CombatSnapshotV1;
  readonly localPlayerId: string;
  readonly aimHeld: boolean;
}

export function createAuthorityPracticeHudViewModel(
  input: AuthorityPracticeHudProjectionInput,
): HudViewModelV1 {
  const authorityPlayer = input.snapshot.players.find(
    ({ playerId }) => playerId === input.localPlayerId,
  );
  const localPlayer = input.combat.players.find(
    ({ playerId }) => playerId === input.localPlayerId,
  );
  if (authorityPlayer === undefined || localPlayer === undefined) {
    throw new Error('LOCAL_INKFALL_PRACTICE_PLAYER_MISSING');
  }
  const selectedWeapon = localPlayer.weapons?.find(
    ({ slot }) => slot === localPlayer.selectedWeaponSlot,
  );
  const localTeamId = localPlayer.teamId;
  const localTeamScore = input.combat.match.teamScores.find(
    ({ teamId }) => teamId === localTeamId,
  )?.score ?? 0;
  const opposingTeamScore = input.combat.match.teamScores.find(
    ({ teamId }) => teamId !== localTeamId,
  )?.score ?? 0;
  const lifeState: HudLifeState = localPlayer.lifePhase === 'dead'
    ? 'dead'
    : localPlayer.lifePhase === 'alive'
      ? 'alive'
      : 'waiting';
  const respawnSeconds = localPlayer.lifePhase === 'dead'
    ? Math.ceil(Math.max(
        0,
        (localPlayer.respawnEligibleAtTick ?? input.snapshot.serverTick)
          - input.snapshot.serverTick,
      ) / AUTHORITY_TICK_RATE_HZ)
    : null;
  return createPracticeHudViewModel({
    player: {
      health: localPlayer.healthPoints,
      maxHealth: 100,
      shield: localPlayer.shieldPoints,
      maxShield: 100,
    },
    weapon: {
      name: cleanWeaponFamily(selectedWeapon?.family),
      isMelee: selectedWeapon?.magazineRounds === null,
      magAmmo: selectedWeapon?.magazineRounds ?? localPlayer.magazineRounds,
      reserveAmmo: selectedWeapon?.reserveRounds ?? localPlayer.reserveRounds,
      isReloading: selectedWeapon?.phase === 'reloading',
      isAds: input.aimHeld,
    },
    abilities: createAuthorityAbilityHudInputs({
      serverTick: input.snapshot.serverTick,
      teleportCooldownTicksRemaining:
        authorityPlayer.movement.player.teleportCooldownTicksRemaining,
      localPlayer,
    }),
    kills: localTeamScore,
    score: localTeamScore,
    opponentScore: opposingTeamScore,
    timerLabel: formatMatchClock(input.combat.match.activeTicksRemaining),
    phaseLabel: input.combat.match.phase,
    objectiveLabel: 'Team score',
    life: Object.freeze({
      state: lifeState,
      respawnSeconds,
      message: lifeState === 'dead'
        ? `Eliminated. Respawn in ${respawnSeconds ?? 0}s.`
        : '',
    }),
  });
}
