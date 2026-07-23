export const MAP_PACKAGE_SCHEMA_VERSION = 1 as const;
export const MAP_PACKAGE_IDENTITY_ALGORITHM =
  'sha256-canonical-json-zeroed-digest-v1' as const;
export const MAP_ARTIFACT_HASH_ALGORITHM = 'sha256' as const;

export type MapPackageImplementationStatus = 'runtime_fixture_only';
export type MapArtifactRole = 'render_only' | 'authority_collision';
export type MapSpawnSet = 'west_team' | 'east_team' | 'deathmatch_candidate';
export type MapVolumeKind = 'kill' | 'recovery';

export interface MapVector3Millimeters {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface MapBoundsMillimeters {
  readonly minimum: MapVector3Millimeters;
  readonly maximum: MapVector3Millimeters;
}

export interface MapArtifactV1 {
  readonly role: MapArtifactRole;
  readonly path: string;
  readonly format: 'glb';
  readonly bytes: number;
  readonly sha256: string;
  readonly expectedMeshNodeCount: number;
}

export interface MapZoneV1 {
  readonly id: string;
  readonly callout: string;
  readonly family: string;
  readonly centerMm: MapVector3Millimeters;
  readonly halfExtentsMm: MapVector3Millimeters;
}

export interface MapSpawnV1 {
  readonly id: string;
  readonly set: MapSpawnSet;
  readonly feetPositionMm: MapVector3Millimeters;
  readonly yawMilliDegrees: number;
  readonly escapeRouteFamilies: readonly string[];
  readonly validationStatus: 'capsule_clear_unscored';
}

export interface MapPickupV1 {
  readonly id: string;
  readonly socketId: string;
  readonly zoneId: string;
  readonly respawnTicks: number;
}

export interface MapTriggerV1 {
  readonly id: string;
  readonly kind: 'teleport';
  readonly centerMm: MapVector3Millimeters;
  readonly halfExtentsMm: MapVector3Millimeters;
  readonly destinationFeetMm: MapVector3Millimeters;
  readonly destinationYawMilliDegrees: number;
  readonly implementationStatus: 'contract_only';
}

export interface MapAuthorityVolumeV1 {
  readonly id: string;
  readonly kind: MapVolumeKind;
  readonly centerMm: MapVector3Millimeters;
  readonly halfExtentsMm: MapVector3Millimeters;
}

export interface RuntimeMapPackageManifestV1 {
  readonly schemaVersion: typeof MAP_PACKAGE_SCHEMA_VERSION;
  readonly kind: 'runtime_map_package';
  readonly id: string;
  readonly revision: number;
  readonly displayName: string;
  readonly implementationStatus: MapPackageImplementationStatus;
  readonly identity: {
    readonly algorithm: typeof MAP_PACKAGE_IDENTITY_ALGORITHM;
    readonly digest: string;
  };
  readonly sourceSeed: {
    readonly path: string;
    readonly sha256: string;
  };
  readonly units: {
    readonly distance: 'millimeters';
    readonly angle: 'milli_degrees';
    readonly gltfMetersPerUnit: 1;
    readonly millimetersPerRapierUnit: 1_000;
  };
  readonly coordinateSystem: {
    readonly handedness: 'right_handed';
    readonly xAxis: 'east';
    readonly yAxis: 'up';
    readonly zAxis: 'north';
    readonly origin: 'press_core_floor_contact';
    readonly gltfToMap: 'x_y_negative_z';
  };
  readonly boundsMm: MapBoundsMillimeters;
  readonly supportedModes: readonly ('deathmatch' | 'team_deathmatch')[];
  readonly artifacts: {
    readonly render: MapArtifactV1 & { readonly role: 'render_only' };
    readonly collision: MapArtifactV1 & { readonly role: 'authority_collision' };
  };
  readonly zones: readonly MapZoneV1[];
  readonly spawns: readonly MapSpawnV1[];
  readonly pickups: readonly MapPickupV1[];
  readonly triggers: readonly MapTriggerV1[];
  readonly authorityVolumes: readonly MapAuthorityVolumeV1[];
  readonly authority: {
    readonly defaultSpawnId: string;
    readonly collisionPrimitive: 'oriented_box';
    readonly collisionLayer: 'world_static';
    readonly renderMeshesMayBeAuthority: false;
  };
  readonly scope: {
    readonly phase: 'P6.3';
    readonly runtimeFixtureLoaded: true;
    readonly spawnScoringComplete: false;
    readonly traversalPlaytestComplete: false;
    readonly g5Passed: false;
  };
}

export type MapPackageIssueCode =
  | 'MAP_INVALID_DATA'
  | 'MAP_INVALID_TYPE'
  | 'MAP_INVALID_VALUE'
  | 'MAP_REQUIRED_FIELD'
  | 'MAP_UNKNOWN_FIELD'
  | 'MAP_DUPLICATE_ID'
  | 'MAP_REFERENCE_MISSING'
  | 'MAP_IDENTITY_HASH_MISMATCH'
  | 'MAP_ARTIFACT_HASH_MISMATCH'
  | 'MAP_ARTIFACT_SIZE_MISMATCH'
  | 'MAP_COLLISION_INVALID'
  | 'MAP_COLLISION_OUT_OF_BOUNDS'
  | 'MAP_RENDER_AUTHORITY_VIOLATION';

export interface MapPackageValidationIssue {
  readonly code: MapPackageIssueCode;
  readonly path: string;
  readonly message: string;
}

export type MapPackageValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly MapPackageValidationIssue[] };
