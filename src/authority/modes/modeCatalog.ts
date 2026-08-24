export const KYX_AUTHORITY_MODE_CATALOG_SCHEMA_VERSION = 1 as const;

export const KYX_MODE_ID = Object.freeze({
  teamDeathmatch: 'team_deathmatch',
  freeForAll: 'free_for_all',
  instagib: 'instagib',
  captureTheFlag: 'capture_the_flag',
  searchAndDestroy: 'search_and_destroy',
  lastTeamStanding: 'last_team_standing',
  survival: 'survival',
  zombieSurvival: 'zombie_survival',
  battleRoyale: 'battle_royale',
} as const);

export type KyxAuthorityModeId = typeof KYX_MODE_ID[keyof typeof KYX_MODE_ID];
export type KyxDeathmatchAuthorityModeId =
  | typeof KYX_MODE_ID.teamDeathmatch
  | typeof KYX_MODE_ID.freeForAll;

export type AuthorityModeImplementationStatus =
  | 'shipping_runtime'
  | 'worker_preview_runtime'
  | 'authority_core'
  | 'foundation_only';

export interface AuthorityModeDefinitionV1 {
  readonly schemaVersion: typeof KYX_AUTHORITY_MODE_CATALOG_SCHEMA_VERSION;
  readonly id: KyxAuthorityModeId;
  readonly displayName: string;
  readonly family: 'slayer' | 'objective' | 'elimination' | 'survival';
  readonly implementationStatus: AuthorityModeImplementationStatus;
  readonly teamPolicy: 'two_teams' | 'each_player' | 'cooperative' | 'last_player';
  readonly objectivePolicy: 'kills' | 'flag' | 'bomb' | 'last_alive' | 'waves';
  readonly respawnPolicy: 'timed' | 'round_reset' | 'eliminated';
  readonly loadoutPolicy: 'configured' | 'instagib' | 'battle_royale_loot';
  readonly minimumPlayers: number;
  readonly maximumPlayers: number;
  readonly scoreLimit: number | null;
  readonly roundWinLimit: number | null;
  readonly defaultActiveTicks: number;
  readonly botsAllowed: boolean;
  readonly lateJoinPolicy: 'active_player' | 'spectator_until_round' | 'spectator_only';
  readonly spectatorPolicy: 'voluntary_and_eliminated';
  readonly serverOwnsAllOutcomes: true;
}

function definition(
  value: Omit<AuthorityModeDefinitionV1, 'schemaVersion' | 'serverOwnsAllOutcomes'>,
): AuthorityModeDefinitionV1 {
  return Object.freeze({
    schemaVersion: KYX_AUTHORITY_MODE_CATALOG_SCHEMA_VERSION,
    serverOwnsAllOutcomes: true,
    ...value,
  });
}

export const AUTHORITY_MODE_CATALOG: readonly AuthorityModeDefinitionV1[] = Object.freeze([
  definition({
    id: KYX_MODE_ID.teamDeathmatch,
    displayName: 'Team Deathmatch',
    family: 'slayer',
    implementationStatus: 'shipping_runtime',
    teamPolicy: 'two_teams',
    objectivePolicy: 'kills',
    respawnPolicy: 'timed',
    loadoutPolicy: 'configured',
    minimumPlayers: 2,
    maximumPlayers: 8,
    scoreLimit: 40,
    roundWinLimit: null,
    defaultActiveTicks: 9_600,
    botsAllowed: true,
    lateJoinPolicy: 'active_player',
    spectatorPolicy: 'voluntary_and_eliminated',
  }),
  definition({
    id: KYX_MODE_ID.freeForAll,
    displayName: 'Free For All',
    family: 'slayer',
    implementationStatus: 'worker_preview_runtime',
    teamPolicy: 'each_player',
    objectivePolicy: 'kills',
    respawnPolicy: 'timed',
    loadoutPolicy: 'configured',
    minimumPlayers: 2,
    maximumPlayers: 12,
    scoreLimit: 25,
    roundWinLimit: null,
    defaultActiveTicks: 9_600,
    botsAllowed: true,
    lateJoinPolicy: 'active_player',
    spectatorPolicy: 'voluntary_and_eliminated',
  }),
  definition({
    id: KYX_MODE_ID.instagib,
    displayName: 'Instagib',
    family: 'slayer',
    implementationStatus: 'foundation_only',
    teamPolicy: 'each_player',
    objectivePolicy: 'kills',
    respawnPolicy: 'timed',
    loadoutPolicy: 'instagib',
    minimumPlayers: 2,
    maximumPlayers: 12,
    scoreLimit: 25,
    roundWinLimit: null,
    defaultActiveTicks: 9_600,
    botsAllowed: true,
    lateJoinPolicy: 'active_player',
    spectatorPolicy: 'voluntary_and_eliminated',
  }),
  definition({
    id: KYX_MODE_ID.captureTheFlag,
    displayName: 'Capture The Flag',
    family: 'objective',
    implementationStatus: 'foundation_only',
    teamPolicy: 'two_teams',
    objectivePolicy: 'flag',
    respawnPolicy: 'timed',
    loadoutPolicy: 'configured',
    minimumPlayers: 2,
    maximumPlayers: 12,
    scoreLimit: 5,
    roundWinLimit: null,
    defaultActiveTicks: 12_000,
    botsAllowed: true,
    lateJoinPolicy: 'active_player',
    spectatorPolicy: 'voluntary_and_eliminated',
  }),
  definition({
    id: KYX_MODE_ID.searchAndDestroy,
    displayName: 'Search and Destroy',
    family: 'objective',
    implementationStatus: 'foundation_only',
    teamPolicy: 'two_teams',
    objectivePolicy: 'bomb',
    respawnPolicy: 'round_reset',
    loadoutPolicy: 'configured',
    minimumPlayers: 2,
    maximumPlayers: 12,
    scoreLimit: null,
    roundWinLimit: 7,
    defaultActiveTicks: 2_400,
    botsAllowed: true,
    lateJoinPolicy: 'spectator_until_round',
    spectatorPolicy: 'voluntary_and_eliminated',
  }),
  definition({
    id: KYX_MODE_ID.lastTeamStanding,
    displayName: 'Last Team Standing',
    family: 'elimination',
    implementationStatus: 'foundation_only',
    teamPolicy: 'two_teams',
    objectivePolicy: 'last_alive',
    respawnPolicy: 'round_reset',
    loadoutPolicy: 'configured',
    minimumPlayers: 2,
    maximumPlayers: 12,
    scoreLimit: null,
    roundWinLimit: 7,
    defaultActiveTicks: 2_400,
    botsAllowed: true,
    lateJoinPolicy: 'spectator_until_round',
    spectatorPolicy: 'voluntary_and_eliminated',
  }),
  definition({
    id: KYX_MODE_ID.survival,
    displayName: 'Survival',
    family: 'survival',
    implementationStatus: 'foundation_only',
    teamPolicy: 'cooperative',
    objectivePolicy: 'waves',
    respawnPolicy: 'round_reset',
    loadoutPolicy: 'configured',
    minimumPlayers: 1,
    maximumPlayers: 4,
    scoreLimit: null,
    roundWinLimit: null,
    defaultActiveTicks: 12_000,
    botsAllowed: true,
    lateJoinPolicy: 'spectator_until_round',
    spectatorPolicy: 'voluntary_and_eliminated',
  }),
  definition({
    id: KYX_MODE_ID.zombieSurvival,
    displayName: 'Zombie Survival',
    family: 'survival',
    implementationStatus: 'foundation_only',
    teamPolicy: 'cooperative',
    objectivePolicy: 'waves',
    respawnPolicy: 'round_reset',
    loadoutPolicy: 'configured',
    minimumPlayers: 1,
    maximumPlayers: 4,
    scoreLimit: null,
    roundWinLimit: null,
    defaultActiveTicks: 12_000,
    botsAllowed: true,
    lateJoinPolicy: 'spectator_until_round',
    spectatorPolicy: 'voluntary_and_eliminated',
  }),
  definition({
    id: KYX_MODE_ID.battleRoyale,
    displayName: 'Battle Royale',
    family: 'elimination',
    implementationStatus: 'foundation_only',
    teamPolicy: 'last_player',
    objectivePolicy: 'last_alive',
    respawnPolicy: 'eliminated',
    loadoutPolicy: 'battle_royale_loot',
    minimumPlayers: 2,
    maximumPlayers: 32,
    scoreLimit: null,
    roundWinLimit: 1,
    defaultActiveTicks: 18_000,
    botsAllowed: true,
    lateJoinPolicy: 'spectator_only',
    spectatorPolicy: 'voluntary_and_eliminated',
  }),
]);

const DEFINITION_BY_ID = new Map(
  AUTHORITY_MODE_CATALOG.map((item) => [item.id, item]),
);

export function isKyxAuthorityModeId(value: unknown): value is KyxAuthorityModeId {
  return typeof value === 'string' && DEFINITION_BY_ID.has(value as KyxAuthorityModeId);
}

export function authorityModeDefinition(modeId: KyxAuthorityModeId): AuthorityModeDefinitionV1 {
  const found = DEFINITION_BY_ID.get(modeId);
  if (found === undefined) throw new RangeError('unsupported KYX authority mode');
  return found;
}

export function requireAuthorityCoreMode(modeId: unknown): AuthorityModeDefinitionV1 {
  if (!isKyxAuthorityModeId(modeId)) throw new RangeError('unsupported KYX authority mode');
  const found = authorityModeDefinition(modeId);
  if (found.implementationStatus === 'foundation_only') {
    throw new RangeError(`KYX authority mode ${modeId} is not implemented`);
  }
  return found;
}

export function requireWorkerRuntimeAuthorityMode(modeId: unknown): AuthorityModeDefinitionV1 {
  const found = requireAuthorityCoreMode(modeId);
  if (
    found.implementationStatus !== 'shipping_runtime'
    && found.implementationStatus !== 'worker_preview_runtime'
  ) {
    throw new RangeError(`KYX authority mode ${String(modeId)} has no Worker runtime`);
  }
  return found;
}

export function requireRoutableAuthorityMode(modeId: unknown): AuthorityModeDefinitionV1 {
  const found = requireAuthorityCoreMode(modeId);
  if (found.implementationStatus !== 'shipping_runtime') {
    throw new RangeError(`KYX authority mode ${String(modeId)} is not routable`);
  }
  return found;
}
