import type { InkfallTelemetrySnapshotV1 } from '../telemetry';

export const INKFALL_PLAYTEST_SCHEMA_VERSION = 1 as const;
export const INKFALL_PLAYTEST_MAP_ID = 'inkfall_foundry' as const;
export const INKFALL_PLAYTEST_MAP_REVISION = 1 as const;
export const INKFALL_PLAYTEST_PACKAGE_DIGEST =
  'a593ad82b2e9f713a4a8d775002c1583c0fb3dfd3acdf004ba7bd6b144173267' as const;
export const INKFALL_PLAYTEST_FIXTURE_HASH = '2a0a446a0b152395' as const;
export const INKFALL_PLAYTEST_TOPOLOGY_SEED_SHA256 =
  '562c5ea8711a1eb1f4a08a31c8872c68c23778aa159110a107c9da0b74e67a63' as const;
export const INKFALL_PLAYTEST_RATE_HZ = 20 as const;
export const INKFALL_PLAYTEST_TICK_MILLISECONDS = 50 as const;

export const INKFALL_PLAYTEST_SCHEMA_VERSION_V2 = 2 as const;
export const INKFALL_PLAYTEST_MAP_REVISION_V2 = 2 as const;
export const INKFALL_PLAYTEST_PACKAGE_DIGEST_V2 =
  '77a7b6c41416f9caaf615f3af5dacda1153cee65a239c04f2004e30fc1663520' as const;
export const INKFALL_PLAYTEST_FIXTURE_HASH_V2 = 'bf85e42731fd088e' as const;

export type InkfallTapeMovementMode = 'run' | 'jump' | 'slide' | 'crouch' | 'teleport' | 'drop';

export interface InkfallTapeRouteStepV1 {
  readonly linkId: string;
  readonly direction: 'forward' | 'reverse';
  readonly movementMode: InkfallTapeMovementMode;
}

export type InkfallTapePostureModeV2 = 'run' | 'jump' | 'crouch' | 'slide';

export interface InkfallTapePostureTransitionV2 {
  readonly atWaypointIndex: number;
  readonly afterTargetedTicks: number;
  readonly movementMode: InkfallTapePostureModeV2;
}

export interface InkfallTapeRouteStepV2 {
  readonly linkId: string;
  readonly direction: 'forward' | 'reverse';
  readonly movementMode: InkfallTapeMovementMode;
  readonly postureTransitions?: readonly InkfallTapePostureTransitionV2[];
}

export interface InkfallSyntheticAgentDefinitionV1 {
  readonly slot: number;
  readonly spawnId: string;
  readonly startDelayTicks: number;
  readonly routeMetricIds: readonly string[];
  readonly steps: readonly InkfallTapeRouteStepV1[];
}

export interface InkfallSyntheticAgentDefinitionV2 {
  readonly slot: number;
  readonly spawnId: string;
  readonly startDelayTicks: number;
  readonly routeMetricIds: readonly string[];
  readonly steps: readonly InkfallTapeRouteStepV2[];
}

export interface InkfallSpawnProbeDefinitionV1 {
  readonly fixtureScenarioId: string;
  readonly expectedStatus: 'selected' | 'no_safe_spawn';
  readonly expectedSpawnId: string | null;
  readonly expectedDecisionHash: string;
}

export interface InkfallAuthorityPlaytestScenarioDefinitionV1 {
  readonly id: string;
  readonly playerCount: 2 | 4 | 8;
  readonly maximumTicks: number;
  readonly spawnProbe: InkfallSpawnProbeDefinitionV1;
  readonly agents: readonly InkfallSyntheticAgentDefinitionV1[];
}

export interface InkfallAuthorityPlaytestScenarioDefinitionV2 {
  readonly id: string;
  readonly playerCount: 2 | 4 | 8;
  readonly maximumTicks: number;
  readonly spawnProbe: InkfallSpawnProbeDefinitionV1;
  readonly agents: readonly InkfallSyntheticAgentDefinitionV2[];
}

export interface InkfallAuthorityPlaytestSuiteDefinitionV1 {
  readonly schemaVersion: 1;
  readonly mapId: typeof INKFALL_PLAYTEST_MAP_ID;
  readonly mapRevision: typeof INKFALL_PLAYTEST_MAP_REVISION;
  readonly packageDigest: typeof INKFALL_PLAYTEST_PACKAGE_DIGEST;
  readonly fixtureHash: typeof INKFALL_PLAYTEST_FIXTURE_HASH;
  readonly topologySeedSha256: typeof INKFALL_PLAYTEST_TOPOLOGY_SEED_SHA256;
  readonly authorityRateHz: 20;
  readonly agents: 'synthetic_non_human_deterministic';
  readonly scenarios: readonly InkfallAuthorityPlaytestScenarioDefinitionV1[];
}

export interface InkfallAuthorityPlaytestSuiteDefinitionV2 {
  readonly schemaVersion: typeof INKFALL_PLAYTEST_SCHEMA_VERSION_V2;
  readonly mapId: typeof INKFALL_PLAYTEST_MAP_ID;
  readonly mapRevision: typeof INKFALL_PLAYTEST_MAP_REVISION_V2;
  readonly packageDigest: typeof INKFALL_PLAYTEST_PACKAGE_DIGEST_V2;
  readonly fixtureHash: typeof INKFALL_PLAYTEST_FIXTURE_HASH_V2;
  readonly topologySeedSha256: typeof INKFALL_PLAYTEST_TOPOLOGY_SEED_SHA256;
  readonly authorityRateHz: 20;
  readonly agents: 'synthetic_non_human_deterministic';
  readonly scenarios: readonly InkfallAuthorityPlaytestScenarioDefinitionV2[];
}

export type InkfallAuthorityPlaytestSuiteDefinition =
  | InkfallAuthorityPlaytestSuiteDefinitionV1
  | InkfallAuthorityPlaytestSuiteDefinitionV2;

export type InkfallAuthorityPlaytestScenarioDefinition =
  | InkfallAuthorityPlaytestScenarioDefinitionV1
  | InkfallAuthorityPlaytestScenarioDefinitionV2;

export type InkfallSyntheticAgentDefinition =
  | InkfallSyntheticAgentDefinitionV1
  | InkfallSyntheticAgentDefinitionV2;

export interface InkfallPlaytestIssueV1 {
  readonly code: string;
  readonly scenarioId: string;
  readonly agentSlot: number | null;
  readonly tick: number | null;
  readonly detail: string;
  readonly topologyMutationAuthorized: false;
}

export interface InkfallRouteTapeResultV1 {
  readonly linkId: string;
  readonly direction: 'forward' | 'reverse';
  readonly movementMode: InkfallTapeMovementMode;
  readonly enteredAtTick: number;
  readonly exitedAtTick: number | null;
  readonly traversalTicks: number | null;
  readonly completed: boolean;
}

export interface InkfallRouteMetricResultV1 {
  readonly metricId: string;
  readonly targetBandMilliseconds: readonly [number, number];
  readonly measuredTicks: number | null;
  readonly measuredMilliseconds: number | null;
  readonly insideTargetBand: boolean;
}

export interface InkfallMovementToolEventV1 {
  readonly kind: 'teleport_succeeded' | 'teleport_rejected';
  readonly tick: number;
  readonly outcome: 'full' | 'partial' | null;
  readonly reason: 'cooldown' | 'blocked' | 'forbidden_volume' | 'kill_volume' | 'no_ground' | null;
  readonly fromFeetPositionMm: Readonly<{ x: number; y: number; z: number }> | null;
  readonly toFeetPositionMm: Readonly<{ x: number; y: number; z: number }> | null;
  readonly blockerColliderIds: readonly string[];
}

export interface InkfallSyntheticAgentResultV1 {
  readonly slot: number;
  readonly id: string;
  readonly classification: 'synthetic_non_human_agent';
  readonly spawnId: string;
  readonly startDelayTicks: number;
  readonly completed: boolean;
  readonly completionTick: number | null;
  readonly finalFeetPositionMm: Readonly<{ x: number; y: number; z: number }>;
  readonly finalStateHash: string;
  readonly replayHash: string;
  readonly routeTapes: readonly InkfallRouteTapeResultV1[];
  readonly routeMetrics: readonly InkfallRouteMetricResultV1[];
  readonly movementToolEvents: readonly InkfallMovementToolEventV1[];
  readonly semanticEvents: Readonly<Record<string, number>>;
  readonly horizontalCollisionContacts: number;
  readonly blockingColliderIds: readonly string[];
  readonly embedSamples: number;
  readonly snagEvents: number;
  readonly recoveryVolumeEntries: number;
  readonly killVolumeEntries: number;
  readonly sampledFrameCount: number;
}

export interface InkfallPlaytestQueryMetricsV1 {
  readonly moveCapsuleCalls: number;
  readonly overlapCapsuleCalls: number;
  readonly castCapsuleCalls: number;
  readonly volumeCalls: number;
  readonly shapeCasts: number;
  readonly overlapTests: number;
  readonly contacts: number;
  readonly explicitEmbedChecks: number;
  readonly maximumCallsPerAgentTick: number;
}

export interface InkfallAuthorityPlaytestScenarioResultV1 {
  readonly id: string;
  readonly playerCount: 2 | 4 | 8;
  readonly classification: 'automated_synthetic_authority_playtest_not_human';
  readonly status: 'PASS' | 'FAIL';
  readonly elapsedTicks: number;
  readonly elapsedMilliseconds: number;
  readonly spawnProbe: {
    readonly fixtureScenarioId: string;
    readonly status: 'selected' | 'no_safe_spawn';
    readonly selectedSpawnId: string | null;
    readonly decisionHash: string;
    readonly directLosSelected: boolean | null;
    readonly passed: boolean;
  };
  readonly agents: readonly InkfallSyntheticAgentResultV1[];
  readonly occupancy: {
    readonly sampledTicks: number;
    readonly peakPlayersByZone: Readonly<Record<string, number>>;
    readonly minimumPairDistanceMm: number | null;
    readonly closeContactSamples: number;
    readonly bodyOverlapSamples: number;
  };
  readonly collision: {
    readonly horizontalContacts: number;
    readonly uniqueBlockingColliderIds: readonly string[];
    readonly embedSamples: number;
    readonly snagEvents: number;
  };
  readonly volumes: {
    readonly recoveryEntries: number;
    readonly killEntries: number;
    readonly recoveryProbePassed: boolean;
    readonly killPriorityProbePassed: boolean;
    readonly postRecoveryEscapePassed: boolean;
  };
  readonly telemetry: {
    readonly eventCount: number;
    readonly routeEvents: number;
    readonly occupancyEvents: number;
    readonly sightlineEvents: number;
    readonly damageEvents: number;
    readonly deathEvents: number;
    readonly zoneCount: number;
    readonly snapshotHash: string;
    readonly privacy: InkfallTelemetrySnapshotV1['privacy'];
  };
  readonly queryMetrics: InkfallPlaytestQueryMetricsV1;
  readonly replayHash: string;
  readonly issues: readonly InkfallPlaytestIssueV1[];
}

export interface InkfallAuthorityPlaytestSuiteResultV1 {
  readonly schemaVersion: 1;
  readonly status: 'P6_6_AUTOMATED_AUTHORITY_PLAYTEST_FOUNDATION_G5_NOT_PASSED';
  readonly binding: {
    readonly mapId: typeof INKFALL_PLAYTEST_MAP_ID;
    readonly mapRevision: typeof INKFALL_PLAYTEST_MAP_REVISION;
    readonly packageDigest: typeof INKFALL_PLAYTEST_PACKAGE_DIGEST;
    readonly fixtureHash: typeof INKFALL_PLAYTEST_FIXTURE_HASH;
    readonly topologySeedSha256: typeof INKFALL_PLAYTEST_TOPOLOGY_SEED_SHA256;
    readonly movementProfileId: 'phase3_hypothesis_v1';
    readonly movementProfileRevision: 1;
    readonly physicsAdapterVersion: '0.19.3';
  };
  readonly units: {
    readonly authorityRateHz: 20;
    readonly tickMilliseconds: 50;
    readonly distance: 'integer_millimeters';
    readonly time: 'authority_ticks_and_integer_milliseconds';
  };
  readonly resourceBounds: {
    readonly maximumScenarios: 3;
    readonly maximumAgentsPerScenario: 8;
    readonly maximumTicksPerScenario: 900;
    readonly maximumRouteStepsPerAgent: 16;
    readonly sampledFrameStrideTicks: 10;
    readonly telemetryRetainedEventCapacity: 4096;
    readonly maximumAuthorityQueryCallsPerAgentTick: 128;
  };
  readonly scenarios: readonly InkfallAuthorityPlaytestScenarioResultV1[];
  readonly allAutomatedThresholdsPassed: boolean;
  readonly issueCount: number;
  readonly topologyRecommendation: 'NO_AUTOMATED_CHANGE_JUSTIFIED' | 'REPORT_REQUIRED_BEFORE_PACKAGE_CHANGE';
  readonly suiteHash: string;
  readonly nonClaims: readonly [
    'SYNTHETIC_AGENTS_NOT_HUMAN_PLAYTESTERS',
    'HUMAN_FUN_AND_READABILITY_NOT_CLAIMED',
    'P6_7_TOPOLOGY_LOCK_NOT_CLAIMED',
    'FINAL_ART_NOT_CLAIMED',
    'G5_NOT_PASSED',
  ];
}

export interface InkfallAuthorityPlaytestSuiteResultV2 extends Omit<
  InkfallAuthorityPlaytestSuiteResultV1,
  'schemaVersion' | 'status' | 'binding'
> {
  readonly schemaVersion: typeof INKFALL_PLAYTEST_SCHEMA_VERSION_V2;
  readonly status: 'P6_6_REVISION_2_AUTOMATED_AUTHORITY_PLAYTEST_RESULT_G5_NOT_PASSED';
  readonly binding: {
    readonly mapId: typeof INKFALL_PLAYTEST_MAP_ID;
    readonly mapRevision: typeof INKFALL_PLAYTEST_MAP_REVISION_V2;
    readonly packageDigest: typeof INKFALL_PLAYTEST_PACKAGE_DIGEST_V2;
    readonly fixtureHash: typeof INKFALL_PLAYTEST_FIXTURE_HASH_V2;
    readonly topologySeedSha256: typeof INKFALL_PLAYTEST_TOPOLOGY_SEED_SHA256;
    readonly movementProfileId: 'phase3_hypothesis_v1';
    readonly movementProfileRevision: 1;
    readonly physicsAdapterVersion: '0.19.3';
  };
}

export type InkfallAuthorityPlaytestSuiteResult =
  | InkfallAuthorityPlaytestSuiteResultV1
  | InkfallAuthorityPlaytestSuiteResultV2;
