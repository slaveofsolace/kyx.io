export const RULESET_SCHEMA_VERSION = 1 as const;

export type RulesetSchemaVersion = typeof RULESET_SCHEMA_VERSION;
export type ContentImplementationStatus = 'contract_only' | 'playable';
export type MovementProfileImplementationStatus =
  | ContentImplementationStatus
  | 'fixture_only';
export type SourceProfile =
  | 'modern_v1_7_5'
  | 'classic_2021'
  | 'revamped_classic';
export type EvidenceLabel = 'VERIFIED' | 'INFERRED' | 'PRODUCT_OVERRIDE';

export interface ContentProvenance {
  readonly sourceProfile: SourceProfile;
  readonly evidenceLabel: EvidenceLabel;
  readonly designReason: string;
}

export interface PresentationContract {
  readonly animationId: string | null;
  readonly audioId: string | null;
  readonly vfxId: string | null;
  readonly markerIds: readonly string[];
}

export interface WeaponContentV1 {
  readonly schemaVersion: RulesetSchemaVersion;
  readonly kind: 'weapon';
  readonly id: string;
  readonly displayName: string;
  readonly implementationStatus: ContentImplementationStatus;
  readonly provenance: ContentProvenance;
  readonly slot: 'primary' | 'secondary' | 'melee';
  readonly category: 'rifle' | 'pickup' | 'melee';
  readonly equipConstraints: readonly string[];
  readonly timingsTicks: {
    readonly fireCooldown: number | null;
    readonly reload: number | null;
    readonly ready: number | null;
  };
  readonly damage: {
    readonly base: number | null;
    readonly pellets: number | null;
    readonly headMultiplier: number | null;
    readonly limbMultiplier: number | null;
  };
  readonly delivery: {
    readonly kind: 'hitscan' | 'melee' | 'projectile';
    readonly rangeMillimeters: number | null;
    readonly falloffStartMillimeters: number | null;
    readonly areaRadiusMillimeters: number | null;
  };
  readonly ammo: {
    readonly magazine: number | null;
    readonly reserve: number | null;
    readonly autoReload: boolean | null;
    readonly pickupPolicy: 'spawn' | 'world_pickup' | 'none';
  };
  readonly spread: {
    readonly baseMilliDegrees: number | null;
    readonly recoilPatternId: string | null;
  };
  readonly movementConstraints: readonly string[];
  readonly projectilePolicy: {
    readonly collision: string;
    readonly fuseTicks: number | null;
    readonly speedMillimetersPerSecond: number | null;
    readonly sticks: boolean | null;
    readonly bounces: boolean | null;
    readonly ownerCollision: string;
  } | null;
  readonly presentation: PresentationContract;
  readonly bot: {
    readonly desirability: number | null;
    readonly dangerTags: readonly string[];
  };
  readonly debugNotes: readonly string[];
}

export interface AbilityContentV1 {
  readonly schemaVersion: RulesetSchemaVersion;
  readonly kind: 'ability';
  readonly id: string;
  readonly displayName: string;
  readonly implementationStatus: ContentImplementationStatus;
  readonly provenance: ContentProvenance;
  readonly slot: 'damage' | 'utility';
  readonly category: 'teleport' | 'grenade' | 'deployable';
  readonly equipConstraints: readonly string[];
  readonly timingsTicks: {
    readonly cooldown: number | null;
    readonly active: number | null;
    readonly ready: number | null;
    readonly fuse: number | null;
    readonly arming: number | null;
  };
  readonly effect: {
    readonly damageHealthPoints: number | null;
    readonly areaRadiusMillimeters: number | null;
    readonly impulseMillimetersPerSecond: number | null;
    readonly rangeMillimeters: number | null;
  };
  readonly projectilePolicy: {
    readonly collision: string;
    readonly speedMillimetersPerSecond: number | null;
    readonly sticks: boolean | null;
    readonly bounces: boolean | null;
    readonly ownerCollision: string;
  } | null;
  readonly resourcePolicy: 'cooldown_only' | 'inventory_charge';
  readonly movementConstraints: readonly string[];
  readonly presentation: PresentationContract;
  readonly bot: {
    readonly desirability: number | null;
    readonly dangerTags: readonly string[];
  };
  readonly debugNotes: readonly string[];
}

export interface CombatProfileContentV1 {
  readonly schemaVersion: 1;
  readonly implementationStatus: 'implementation_fixture';
  readonly provenance: ContentProvenance;
  readonly life: {
    readonly maximumHealthPoints: number;
    readonly maximumShieldPoints: number;
    readonly spawnProtectionTicks: number;
    readonly spawnProtectionBreaksOnOffense: boolean;
    readonly respawnDelayTicks: number;
    readonly assistWindowTicks: number;
    readonly minimumAssistHealthDamagePoints: number;
    readonly friendlyFireEnabled: boolean;
    readonly selfDamageEnabled: boolean;
    readonly regenerationEnabled: false;
  };
  readonly match: {
    readonly mode: 'team_deathmatch';
    readonly warmupTicks: number;
    readonly activeTicks: number;
    readonly postmatchTicks: number;
    readonly teamScoreLimit: number;
  };
  readonly autoRifle: {
    readonly weaponId: string;
    readonly baseDamagePoints: number;
    readonly pelletsPerShot: number;
    readonly headMultiplierPermille: number;
    readonly limbMultiplierPermille: number;
    readonly rangeMillimeters: number;
    readonly magazineCapacity: number;
    readonly reserveCapacity: number;
    readonly fireCooldownTicks: number;
    readonly reloadTicks: number;
    readonly readyTicks: number;
    readonly autoReloadEnabled: boolean;
    readonly reloadTransferPolicy: 'completion_tick_once';
    readonly reloadInterruptionPolicy: 'fire_or_sprint_before_transfer_death_always';
    readonly sprintFirePolicy: 'blocked_ready_delay';
    readonly baseSpreadMilliDegrees: number;
    readonly maximumSpreadMilliDegrees: number;
    readonly recoilPatternId: string;
  };
  readonly impulseGrenade: {
    readonly abilityId: string;
    readonly damageHealthPoints: 0;
    readonly areaRadiusMillimeters: number;
    readonly projectileSpeedMillimetersPerSecond: number;
    readonly readyTicks: number;
    readonly cooldownTicks: number;
    readonly fuseTicks: number;
    readonly fuseStarts: 'first_qualifying_collision';
    readonly lifetimeTicks: number;
    readonly projectileRadiusMillimeters: number;
    readonly maximumBounces: number;
    readonly restitutionPermille: number;
    readonly frictionPermille: number;
    readonly ownerImmunityTicks: number;
    readonly ownerCollisionPolicy: 'ignored_then_normal';
    readonly radialFalloff: 'linear_to_zero';
    readonly selfImpulseMillimetersPerSecond: number;
    readonly enemyImpulseMillimetersPerSecond: number;
    readonly verticalImpulseCapMillimetersPerSecond: number;
    readonly maximumActivePerPlayer: number;
  };
}

export interface RulesetContentV1 {
  readonly schemaVersion: RulesetSchemaVersion;
  readonly kind: 'ruleset';
  readonly id: string;
  readonly revision: number;
  readonly displayName: string;
  readonly implementationStatus: ContentImplementationStatus;
  readonly provenance: ContentProvenance;
  readonly tickRateHz: 20;
  readonly loadout: {
    readonly weaponSlots: {
      readonly primary: { readonly capacity: 1; readonly acquisition: 'spawn' };
      readonly secondary: {
        readonly capacity: 1;
        readonly acquisition: 'pickup_optional';
      };
      readonly melee: { readonly capacity: 1; readonly acquisition: 'spawn' };
    };
    readonly abilitySlots: {
      readonly damage: 2;
      readonly utility: 1;
    };
    readonly ammoAbility: {
      readonly enabledByDefault: false;
    };
  };
  readonly movementProfile: {
    readonly id: string;
    readonly revision: number;
    readonly implementationStatus: MovementProfileImplementationStatus;
  };
  readonly combatProfile?: CombatProfileContentV1;
  readonly verticalSlice: {
    readonly primaryWeaponId: string;
    readonly meleeWeaponId: string;
    readonly damageAbilityIds: readonly [string, string];
    readonly utilityAbilityId: string;
  };
  readonly weapons: readonly WeaponContentV1[];
  readonly abilities: readonly AbilityContentV1[];
}

export const CONTENT_ERROR_CODES = [
  'CONTENT_JSON_INVALID',
  'CONTENT_ROOT_NOT_OBJECT',
  'CONTENT_UNKNOWN_FIELD',
  'CONTENT_REQUIRED_FIELD',
  'CONTENT_INVALID_FIELD_TYPE',
  'CONTENT_INVALID_FIELD_VALUE',
  'CONTENT_NUMERIC_OUT_OF_RANGE',
  'CONTENT_STRING_TOO_LONG',
  'CONTENT_ARRAY_TOO_LONG',
  'CONTENT_SCHEMA_VERSION_UNSUPPORTED',
  'CONTENT_DUPLICATE_ID',
  'CONTENT_REFERENCE_MISSING',
  'CONTENT_LOADOUT_INVALID',
  'CONTENT_AMMO_DEFAULT_INVALID',
  'CONTENT_VERTICAL_SLICE_MISSING',
  'CONTENT_RULESET_NOT_FOUND',
] as const;

export type ContentErrorCode = (typeof CONTENT_ERROR_CODES)[number];

export interface ContentValidationIssue {
  readonly code: ContentErrorCode;
  readonly path: string;
  readonly message: string;
}

export type ContentValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ContentValidationIssue[] };
