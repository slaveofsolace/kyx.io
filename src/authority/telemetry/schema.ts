import type { MapVector3Millimeters } from '../../content/maps';
import type { InkfallAuthorityMapIdentity } from '../inkfallMapIdentity';

export const INKFALL_TELEMETRY_SCHEMA_VERSION = 1 as const;
export const INKFALL_TELEMETRY_MAP_ID = 'inkfall_foundry' as const;
export const INKFALL_TELEMETRY_MAP_REVISION = 1 as const;
export const INKFALL_TELEMETRY_PACKAGE_DIGEST =
  'a593ad82b2e9f713a4a8d775002c1583c0fb3dfd3acdf004ba7bd6b144173267' as const;
export const INKFALL_TELEMETRY_FIXTURE_HASH = '2a0a446a0b152395' as const;
export const INKFALL_TELEMETRY_AUTHORITY_RATE_HZ = 20 as const;
export const INKFALL_TELEMETRY_TICK_MILLISECONDS = 50 as const;
export const INKFALL_TELEMETRY_HEAT_CELL_MM = Object.freeze({
  x: 4_000,
  y: 3_000,
  z: 4_000,
} as const);

export type InkfallTelemetryEventKind =
  | 'route_traversal'
  | 'spawn_choice'
  | 'spawn_result'
  | 'no_safe_spawn'
  | 'damage_location'
  | 'death_location'
  | 'sightline_exposure'
  | 'occupancy_sample'
  | 'objective_pressure'
  | 'authority_volume';

export type InkfallMovementMode =
  | 'run'
  | 'jump'
  | 'slide'
  | 'crouch'
  | 'teleport'
  | 'drop';

export type InkfallDamageCauseClass =
  | 'weapon_direct'
  | 'explosive'
  | 'melee'
  | 'environment'
  | 'fall'
  | 'unknown';

export interface AuthorityTelemetryEnvelopeV1<
  Kind extends InkfallTelemetryEventKind,
  Payload,
> {
  readonly schemaVersion: typeof INKFALL_TELEMETRY_SCHEMA_VERSION;
  readonly mapId: typeof INKFALL_TELEMETRY_MAP_ID;
  readonly mapRevision: InkfallAuthorityMapIdentity['mapRevision'];
  readonly packageDigest: string;
  readonly fixtureHash: string;
  readonly authorityRateHz: typeof INKFALL_TELEMETRY_AUTHORITY_RATE_HZ;
  readonly producer: 'authority_runtime';
  readonly eventSequence: number;
  readonly authorityTick: number;
  readonly kind: Kind;
  readonly payload: Payload;
}

export interface RouteTraversalTelemetryInput {
  readonly actorSlot: number;
  readonly routeId: string;
  readonly direction: 'forward' | 'reverse';
  readonly enteredAtTick: number;
  readonly exitedAtTick: number;
  readonly outcome: 'completed' | 'aborted';
  readonly movementMode: InkfallMovementMode;
}

export interface SpawnChoiceTelemetryInput {
  readonly actorSlot: number;
  readonly spawnId: string;
  readonly decisionHash: string;
  readonly selectedScore: number;
  readonly evaluatedCandidateCount: number;
  readonly eligibleCandidateCount: number;
}

export interface SpawnResultTelemetryInput {
  readonly actorSlot: number;
  readonly spawnId: string;
  readonly spawnedAtTick: number;
  readonly observedUntilTick: number;
  readonly outcome: 'alive_window' | 'death';
  readonly firstRouteChoiceAtTick: number | null;
  readonly firstContactAtTick: number | null;
  readonly damageTakenPoints: number;
}

export interface NoSafeSpawnTelemetryInput {
  readonly actorSlot: number;
  readonly evaluatedCandidateCount: number;
  readonly directLosRejectedCount: number;
  readonly occupancyRejectedCount: number;
  readonly territoryRejectedCount: number;
  readonly retryAfterTicks: number;
}

export interface DamageLocationTelemetryInput {
  readonly sourceActorSlot: number | null;
  readonly targetActorSlot: number;
  readonly zoneId: string;
  readonly positionMm: MapVector3Millimeters;
  readonly damagePoints: number;
  readonly causeClass: InkfallDamageCauseClass;
}

export interface DeathLocationTelemetryInput {
  readonly victimActorSlot: number;
  readonly killerActorSlot: number | null;
  readonly zoneId: string;
  readonly positionMm: MapVector3Millimeters;
  readonly causeClass: InkfallDamageCauseClass;
  readonly assistCount: number;
  readonly respawnEligibleAtTick: number;
}

export interface SightlineExposureTelemetryInput {
  readonly observerActorSlot: number;
  readonly subjectActorSlot: number;
  readonly observerZoneId: string;
  readonly subjectZoneId: string;
  readonly observerFeetPositionMm: MapVector3Millimeters;
  readonly subjectFeetPositionMm: MapVector3Millimeters;
  readonly observerStance: 'standing' | 'crouched';
  readonly subjectStance: 'standing' | 'crouched';
  readonly exposureTicks: number;
}

export interface OccupancySampleTelemetryInput {
  readonly occupants: readonly {
    readonly actorSlot: number;
    readonly zoneId: string;
    readonly feetPositionMm: MapVector3Millimeters;
  }[];
}

export interface ObjectivePressureTelemetryInput {
  readonly objectiveSlot: number;
  readonly zoneId: string;
  readonly positionMm: MapVector3Millimeters;
  readonly pressurePermille: number;
  readonly nearbyFriendlyCount: number;
  readonly nearbyEnemyCount: number;
  readonly controllingTeamSlot: number | null;
}

export interface AuthorityVolumeTelemetryInput {
  readonly actorSlot: number;
  readonly volumeId: string;
  readonly positionMm: MapVector3Millimeters;
  readonly outcome:
    | 'recovery_entered'
    | 'recovery_completed'
    | 'kill_entered'
    | 'killed';
}

export type InkfallTelemetryInputV1 =
  | AuthorityTelemetryEnvelopeV1<'route_traversal', RouteTraversalTelemetryInput>
  | AuthorityTelemetryEnvelopeV1<'spawn_choice', SpawnChoiceTelemetryInput>
  | AuthorityTelemetryEnvelopeV1<'spawn_result', SpawnResultTelemetryInput>
  | AuthorityTelemetryEnvelopeV1<'no_safe_spawn', NoSafeSpawnTelemetryInput>
  | AuthorityTelemetryEnvelopeV1<'damage_location', DamageLocationTelemetryInput>
  | AuthorityTelemetryEnvelopeV1<'death_location', DeathLocationTelemetryInput>
  | AuthorityTelemetryEnvelopeV1<'sightline_exposure', SightlineExposureTelemetryInput>
  | AuthorityTelemetryEnvelopeV1<'occupancy_sample', OccupancySampleTelemetryInput>
  | AuthorityTelemetryEnvelopeV1<'objective_pressure', ObjectivePressureTelemetryInput>
  | AuthorityTelemetryEnvelopeV1<'authority_volume', AuthorityVolumeTelemetryInput>;

export interface TelemetryHeatCell {
  readonly zoneId: string | null;
  readonly cellX: number;
  readonly cellY: number;
  readonly cellZ: number;
}

interface StoredTelemetryBase<Kind extends InkfallTelemetryEventKind, Payload> {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly eventSequence: number;
  readonly authorityTick: number;
  readonly elapsedAuthorityMilliseconds: number;
  readonly kind: Kind;
  readonly mapId: typeof INKFALL_TELEMETRY_MAP_ID;
  readonly mapRevision: InkfallAuthorityMapIdentity['mapRevision'];
  readonly packageDigest: string;
  readonly fixtureHash: string;
  readonly producer: 'authority_runtime';
  readonly outcomeAuthority: 'server_resolved';
  readonly payload: Payload;
}

export type StoredInkfallTelemetryEvent =
  | StoredTelemetryBase<'route_traversal', {
      readonly actorSlot: number;
      readonly routeId: string;
      readonly direction: 'forward' | 'reverse';
      readonly fromZoneId: string;
      readonly toZoneId: string;
      readonly enteredAtTick: number;
      readonly exitedAtTick: number;
      readonly traversalTicks: number;
      readonly outcome: 'completed' | 'aborted';
      readonly movementMode: InkfallMovementMode;
    }>
  | StoredTelemetryBase<'spawn_choice', SpawnChoiceTelemetryInput>
  | StoredTelemetryBase<'spawn_result', {
      readonly actorSlot: number;
      readonly spawnId: string;
      readonly spawnedAtTick: number;
      readonly observedUntilTick: number;
      readonly observationTicks: number;
      readonly outcome: 'alive_window' | 'death';
      readonly firstRouteChoiceTicks: number | null;
      readonly firstContactTicks: number | null;
      readonly damageTakenPoints: number;
    }>
  | StoredTelemetryBase<'no_safe_spawn', NoSafeSpawnTelemetryInput>
  | StoredTelemetryBase<'damage_location', {
      readonly sourceActorSlot: number | null;
      readonly targetActorSlot: number;
      readonly location: TelemetryHeatCell;
      readonly damagePoints: number;
      readonly causeClass: InkfallDamageCauseClass;
    }>
  | StoredTelemetryBase<'death_location', {
      readonly victimActorSlot: number;
      readonly killerActorSlot: number | null;
      readonly location: TelemetryHeatCell;
      readonly causeClass: InkfallDamageCauseClass;
      readonly assistCount: number;
      readonly respawnEligibleAtTick: number;
    }>
  | StoredTelemetryBase<'sightline_exposure', {
      readonly observerActorSlot: number;
      readonly subjectActorSlot: number;
      readonly observerLocation: TelemetryHeatCell;
      readonly subjectLocation: TelemetryHeatCell;
      readonly observerStance: 'standing' | 'crouched';
      readonly subjectStance: 'standing' | 'crouched';
      readonly exposureTicks: number;
      readonly directLineOfSight: boolean;
      readonly blockerId: string | null;
      readonly distanceBandMinimumMm: number;
      readonly distanceBandMaximumExclusiveMm: number;
    }>
  | StoredTelemetryBase<'occupancy_sample', {
      readonly playerCount: number;
      readonly zoneCounts: readonly { readonly zoneId: string; readonly count: number }[];
      readonly cellCounts: readonly { readonly location: TelemetryHeatCell; readonly count: number }[];
    }>
  | StoredTelemetryBase<'objective_pressure', {
      readonly objectiveSlot: number;
      readonly location: TelemetryHeatCell;
      readonly pressurePermille: number;
      readonly nearbyFriendlyCount: number;
      readonly nearbyEnemyCount: number;
      readonly controllingTeamSlot: number | null;
    }>
  | StoredTelemetryBase<'authority_volume', {
      readonly actorSlot: number;
      readonly volumeId: string;
      readonly volumeKind: 'recovery' | 'kill';
      readonly location: TelemetryHeatCell;
      readonly outcome: AuthorityVolumeTelemetryInput['outcome'];
    }>;

export interface InkfallTelemetrySnapshotV1 {
  readonly schemaVersion: 1;
  readonly status: 'P6.5_AUTHORITY_TELEMETRY_FIXTURE_G5_NOT_PASSED';
  readonly binding: {
    readonly mapId: typeof INKFALL_TELEMETRY_MAP_ID;
    readonly mapRevision: InkfallAuthorityMapIdentity['mapRevision'];
    readonly packageDigest: string;
    readonly fixtureHash: string;
  };
  readonly units: {
    readonly authorityRateHz: 20;
    readonly tickMilliseconds: 50;
    readonly inputDistance: 'millimeters';
    readonly retainedLocation: 'quantized_heat_cell';
    readonly heatCellMillimeters: typeof INKFALL_TELEMETRY_HEAT_CELL_MM;
    readonly pressure: 'permille';
    readonly damage: 'integer_points';
  };
  readonly privacy: {
    readonly actorIdentity: 'ephemeral_match_slot_0_through_63';
    readonly exactPositionsRetained: false;
    readonly accountIdentifiersRetained: false;
    readonly networkIdentifiersRetained: false;
    readonly clientOutcomeAuthorityAccepted: false;
  };
  readonly buffer: {
    readonly capacity: number;
    readonly retainedEvents: number;
    readonly acceptedEvents: number;
    readonly evictedEvents: number;
    readonly lastEventSequence: number | null;
    readonly lastAuthorityTick: number | null;
  };
  readonly totalsByKind: Readonly<Record<InkfallTelemetryEventKind, number>>;
  readonly arrangementSamples: {
    readonly twoPlayers: number;
    readonly fourPlayers: number;
    readonly eightPlayers: number;
    readonly other: number;
  };
  readonly routeMetrics: readonly {
    readonly routeId: string;
    readonly samples: number;
    readonly completed: number;
    readonly aborted: number;
    readonly totalTraversalTicks: number;
    readonly minimumTraversalTicks: number;
    readonly maximumTraversalTicks: number;
  }[];
  readonly spawnMetrics: readonly {
    readonly spawnId: string;
    readonly choices: number;
    readonly results: number;
    readonly deathOutcomes: number;
    readonly totalObservationTicks: number;
  }[];
  readonly combatZoneMetrics: readonly {
    readonly zoneId: string;
    readonly damageEvents: number;
    readonly damagePoints: number;
    readonly deaths: number;
  }[];
  readonly exposureMetrics: readonly {
    readonly observerZoneId: string;
    readonly subjectZoneId: string;
    readonly samples: number;
    readonly directSamples: number;
    readonly totalExposureTicks: number;
  }[];
  readonly occupancyZoneMetrics: readonly {
    readonly zoneId: string;
    readonly samples: number;
    readonly totalOccupants: number;
    readonly peakOccupants: number;
  }[];
  readonly heatCells: readonly {
    readonly location: TelemetryHeatCell;
    readonly occupancySamples: number;
    readonly damagePoints: number;
    readonly deaths: number;
    readonly exposureTicks: number;
    readonly objectivePressurePermille: number;
    readonly volumeEvents: number;
  }[];
  readonly objectiveMetrics: readonly {
    readonly objectiveSlot: number;
    readonly samples: number;
    readonly totalPressurePermille: number;
    readonly peakPressurePermille: number;
  }[];
  readonly volumeMetrics: readonly {
    readonly volumeId: string;
    readonly recoveryEntered: number;
    readonly recoveryCompleted: number;
    readonly killEntered: number;
    readonly killed: number;
  }[];
  readonly noSafeSpawnEvents: number;
  readonly events: readonly StoredInkfallTelemetryEvent[];
  readonly snapshotHash: string;
  readonly nonClaims: readonly ['P6.6_NOT_CLAIMED', 'G5_NOT_PASSED', 'HUMAN_ACCEPTANCE_NOT_RUN'];
}

export interface InkfallRouteTelemetryContract {
  readonly id: string;
  readonly fromZoneId: string;
  readonly toZoneId: string;
  readonly reverseAllowed: boolean;
  readonly requiredMovementMode: 'teleport' | 'drop' | null;
}

export const INKFALL_ROUTE_TELEMETRY_CONTRACTS: readonly InkfallRouteTelemetryContract[] =
  Object.freeze([
    { id: 'west_spawn_choice', fromZoneId: 'west_gallery', toZoneId: 'west_gallery', reverseAllowed: true, requiredMovementMode: null },
    { id: 'east_choice_spawn', fromZoneId: 'east_gallery', toZoneId: 'east_gallery', reverseAllowed: true, requiredMovementMode: null },
    { id: 'west_choice_press', fromZoneId: 'west_gallery', toZoneId: 'press_hall', reverseAllowed: true, requiredMovementMode: null },
    { id: 'press_west_core', fromZoneId: 'press_hall', toZoneId: 'press_hall', reverseAllowed: true, requiredMovementMode: null },
    { id: 'press_core_east', fromZoneId: 'press_hall', toZoneId: 'press_hall', reverseAllowed: true, requiredMovementMode: null },
    { id: 'press_east_choice', fromZoneId: 'press_hall', toZoneId: 'east_gallery', reverseAllowed: true, requiredMovementMode: null },
    { id: 'west_choice_ink', fromZoneId: 'west_gallery', toZoneId: 'ink_channel_west', reverseAllowed: true, requiredMovementMode: null },
    { id: 'ink_west_mid_w', fromZoneId: 'ink_channel_west', toZoneId: 'ink_channel_west', reverseAllowed: true, requiredMovementMode: null },
    { id: 'ink_mid_w_mid_e', fromZoneId: 'ink_channel_west', toZoneId: 'ink_channel_east', reverseAllowed: true, requiredMovementMode: null },
    { id: 'ink_mid_e_east', fromZoneId: 'ink_channel_east', toZoneId: 'ink_channel_east', reverseAllowed: true, requiredMovementMode: null },
    { id: 'ink_east_choice', fromZoneId: 'ink_channel_east', toZoneId: 'east_gallery', reverseAllowed: true, requiredMovementMode: null },
    { id: 'west_choice_archive', fromZoneId: 'west_gallery', toZoneId: 'archive_walk_west', reverseAllowed: true, requiredMovementMode: null },
    { id: 'archive_west_mid_w', fromZoneId: 'archive_walk_west', toZoneId: 'archive_walk_west', reverseAllowed: true, requiredMovementMode: null },
    { id: 'archive_mid_w_mid_e', fromZoneId: 'archive_walk_west', toZoneId: 'archive_walk_east', reverseAllowed: true, requiredMovementMode: null },
    { id: 'archive_mid_e_east', fromZoneId: 'archive_walk_east', toZoneId: 'archive_walk_east', reverseAllowed: true, requiredMovementMode: null },
    { id: 'archive_east_choice', fromZoneId: 'archive_walk_east', toZoneId: 'east_gallery', reverseAllowed: true, requiredMovementMode: null },
    { id: 'press_west_ink', fromZoneId: 'press_hall', toZoneId: 'ink_channel_west', reverseAllowed: true, requiredMovementMode: null },
    { id: 'press_east_ink', fromZoneId: 'press_hall', toZoneId: 'ink_channel_east', reverseAllowed: true, requiredMovementMode: null },
    { id: 'press_west_archive', fromZoneId: 'press_hall', toZoneId: 'archive_walk_west', reverseAllowed: true, requiredMovementMode: null },
    { id: 'press_east_archive', fromZoneId: 'press_hall', toZoneId: 'archive_walk_east', reverseAllowed: true, requiredMovementMode: null },
    { id: 'ink_mid_w_teleport_entry', fromZoneId: 'ink_channel_west', toZoneId: 'teleport_fold', reverseAllowed: true, requiredMovementMode: null },
    { id: 'teleport_shortcut', fromZoneId: 'teleport_fold', toZoneId: 'teleport_fold', reverseAllowed: false, requiredMovementMode: 'teleport' },
    { id: 'teleport_exit_press_core', fromZoneId: 'teleport_fold', toZoneId: 'press_hall', reverseAllowed: true, requiredMovementMode: null },
    { id: 'archive_mid_w_drop', fromZoneId: 'archive_walk_west', toZoneId: 'paper_drop', reverseAllowed: false, requiredMovementMode: 'drop' },
    { id: 'archive_drop_press_north', fromZoneId: 'paper_drop', toZoneId: 'paper_drop', reverseAllowed: false, requiredMovementMode: 'drop' },
    { id: 'press_north_core', fromZoneId: 'paper_drop', toZoneId: 'press_hall', reverseAllowed: true, requiredMovementMode: null },
    { id: 'press_core_archive_mid_e', fromZoneId: 'press_hall', toZoneId: 'archive_walk_east', reverseAllowed: true, requiredMovementMode: null },
  ] as const);
