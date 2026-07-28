export const PROTOCOL_VERSION = 2 as const;
export const SNAPSHOT_BASELINE_VERSION = 1 as const;
export const RELIABLE_EVENT_STREAM_VERSION = 1 as const;

export const PROTOCOL_LIMITS = Object.freeze({
  maxMessageBytes: 16_384,
  maxIdBytes: 64,
  maxDisplayNameBytes: 48,
  maxRoomCodeBytes: 24,
  maxBuildIdBytes: 64,
  maxAuthTokenBytes: 2_048,
  maxResumeTokenBytes: 64,
  resumeTokenCharacters: 43,
  maxNoticeBytes: 512,
  maxErrorDetailBytes: 256,
  maxCapabilities: 16,
  maxCommandsPerBatch: 32,
  maxEntitiesPerSnapshot: 256,
  maxRemovedEntitiesPerDelta: 256,
  maxEventsPerBatch: 128,
  maxActiveVolumesPerPlayer: 64,
  maxAxisMagnitude: 127,
  maxLookDeltaMilliDegrees: 32_767,
  maxCoordinateMillimeters: 1_000_000,
  maxVelocityMillimetersPerSecond: 1_000_000,
  maxYawMilliDegrees: 180_000,
  maxPitchMilliDegrees: 90_000,
  maxHealthValue: 1_000_000,
  maxAuthorityTick: 0xffff_ffff,
  maxSequence: 0xffff_ffff,
  // Eleven intent bits are currently defined by src/sim/commands.ts. Keep this
  // wire ceiling aligned so unsupported bits fail before the sim adapter.
  maxButtonBits: 0x07ff,
  maxSelectedSlot: 7,
} as const);

export type ProtocolVersion = typeof PROTOCOL_VERSION;
export type MatchPhase = 'lobby' | 'warmup' | 'active' | 'postmatch';

export interface ProtocolEnvelope {
  readonly protocolVersion: ProtocolVersion;
  readonly type: string;
}

export interface HelloMessage extends ProtocolEnvelope {
  readonly type: 'hello';
  readonly requestId: string;
  readonly clientBuild: string;
  readonly requestedRulesetId: string;
  readonly capabilities: readonly string[];
}

export interface AuthenticateMessage extends ProtocolEnvelope {
  readonly type: 'authenticate';
  readonly requestId: string;
  readonly accessToken: string;
}

export interface JoinRoomMessage extends ProtocolEnvelope {
  readonly type: 'joinRoom';
  readonly requestId: string;
  readonly roomCode: string;
  readonly displayName: string;
}

/**
 * Resumes one server-owned player session. The opaque token is the only player
 * credential on this message; player identity is never supplied by the client.
 */
export interface ResumeRoomMessage extends ProtocolEnvelope {
  readonly type: 'resumeRoom';
  readonly requestId: string;
  readonly roomCode: string;
  readonly resumeToken: string;
}

export type FullSnapshotRequestReason = 'missing_baseline' | 'history_gap' | 'manual_evidence';

/**
 * Requests one complete authoritative recovery state. The request carries no
 * baseline, transform, or player identity; the room resolves the bound session
 * from the socket attachment and correlates the response by request ID.
 */
export interface RequestFullSnapshotMessage extends ProtocolEnvelope {
  readonly type: 'requestFullSnapshot';
  readonly requestId: string;
  readonly reason: FullSnapshotRequestReason;
}

export interface InputCommand {
  readonly type: 'input';
  readonly sequence: number;
  readonly clientTick: number;
  readonly moveX: number;
  readonly moveY: number;
  readonly lookYawDeltaMilliDegrees: number;
  readonly lookPitchDeltaMilliDegrees: number;
  readonly heldButtons: number;
  readonly pressedButtons: number;
  readonly releasedButtons: number;
  readonly selectedSlot?: number;
}

export type PlayerIntentCommand = InputCommand;

export interface InputBatchMessage extends ProtocolEnvelope {
  readonly type: 'inputBatch';
  readonly commands: readonly PlayerIntentCommand[];
}

export interface LoadoutRequestMessage extends ProtocolEnvelope {
  readonly type: 'loadoutRequest';
  readonly requestId: string;
  readonly primaryWeaponId: string;
  readonly secondaryWeaponId: string | null;
  readonly meleeWeaponId: string;
  readonly damageAbilityIds:
    | readonly [string, string]
    | readonly [string, string, string];
  readonly utilityAbilityId: string;
}

export interface PingMessage extends ProtocolEnvelope {
  readonly type: 'ping';
  readonly nonce: number;
  readonly clientTick: number;
}

export interface AckMessage extends ProtocolEnvelope {
  readonly type: 'ack';
  readonly snapshotBaselineVersion: typeof SNAPSHOT_BASELINE_VERSION;
  readonly reliableEventStreamVersion: typeof RELIABLE_EVENT_STREAM_VERSION;
  readonly snapshotBaselineId: string;
  readonly serverTick: number;
  readonly lastEventId: string | null;
}

export type ClientMessage =
  | HelloMessage
  | AuthenticateMessage
  | JoinRoomMessage
  | ResumeRoomMessage
  | RequestFullSnapshotMessage
  | InputBatchMessage
  | LoadoutRequestMessage
  | PingMessage
  | AckMessage;

export interface ProtocolConfig {
  readonly protocolVersion: ProtocolVersion;
  readonly snapshotBaselineVersion: typeof SNAPSHOT_BASELINE_VERSION;
  readonly reliableEventStreamVersion: typeof RELIABLE_EVENT_STREAM_VERSION;
  readonly simulationHz: 20;
  readonly snapshotHz: number;
  readonly maxMessageBytes: number;
  readonly maxCommandsPerBatch: number;
}

/** Immutable compatibility identity for one authoritative simulation. */
export interface SimulationIdentityV1 {
  readonly schemaVersion: 1;
  readonly mapId: string;
  readonly rulesetId: string;
  readonly rulesetRevision: number;
  readonly rulesetHash: string;
  readonly movementProfileId: string;
  readonly movementProfileRevision: number;
  readonly movementProfileHash: string;
  readonly fixtureId: string;
  readonly fixtureHash: string;
  readonly physicsAdapterId: string;
  readonly physicsAdapterVersion: string;
}

/** Identity embedded by the canonical Phase 3 MovementSimulationState. */
export interface MovementSimulationIdentityV1 {
  readonly rulesetId: string;
  readonly rulesetRevision: number;
  readonly rulesetHash: string;
  readonly movementProfileId: string;
  readonly movementProfileRevision: number;
  readonly movementProfileHash: string;
  readonly fixtureId: string;
  readonly fixtureHash: string;
  readonly physicsAdapterId: string;
  readonly physicsAdapterVersion: string;
}

export interface ReconciliationVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ReconciliationIntegrationRemainders {
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  readonly planarAcceleration: number;
  readonly gravity: number;
}

export interface ReconciliationAppliedIntent {
  readonly moveX: number;
  readonly moveZ: number;
  readonly heldButtons: number;
  /** All press edges consumed during the authority tick. */
  readonly pressedButtons: number;
  /** All release edges consumed during the authority tick. May overlap presses for a short pulse. */
  readonly releasedButtons: number;
  readonly selectedSlot: number;
}

export type ReconciliationCollisionLayer =
  | 'world_static'
  | 'dynamic_platform'
  | 'player_body'
  | 'door'
  | 'spawn_barrier'
  | 'kill_volume'
  | 'forbidden_volume'
  | 'recovery_volume';

export interface ReconciliationSupport {
  readonly colliderId: string;
  readonly layer: ReconciliationCollisionLayer;
  readonly normalQ15: ReconciliationVector3;
  readonly velocity: ReconciliationVector3;
}

export interface ReconciliationActiveVolume {
  readonly colliderId: string;
  readonly kind: 'kill' | 'forbidden' | 'recovery';
}

export interface ReconciliationPlayerStateV1 {
  readonly id: string;
  readonly feetPosition: ReconciliationVector3;
  readonly velocity: ReconciliationVector3;
  readonly integrationRemainders: ReconciliationIntegrationRemainders;
  readonly yawMilliDegrees: number;
  readonly pitchMilliDegrees: number;
  readonly lastProcessedSequence: number;
  readonly ticksSinceAcceptedCommand: number;
  readonly intent: ReconciliationAppliedIntent;
  readonly stance: 'standing' | 'crouched';
  readonly locomotion: 'grounded' | 'airborne' | 'sliding';
  readonly grounded: boolean;
  readonly support: ReconciliationSupport | null;
  readonly coyoteTicksRemaining: number;
  readonly jumpBufferTicksRemaining: number;
  readonly slideTicksRemaining: number;
  readonly slideCooldownTicksRemaining: number;
  readonly teleportCooldownTicksRemaining: number;
  readonly standBlocked: boolean;
  readonly activeVolumes: readonly ReconciliationActiveVolume[];
}

/**
 * Exact wire representation of the canonical Phase 3 MovementSimulationState.
 * It is generated per recipient and is the only snapshot reconciliation truth.
 */
export interface LocalReconciliationStateV1 {
  readonly schemaVersion: 1;
  readonly identity: MovementSimulationIdentityV1;
  readonly simulationRateHz: 20;
  readonly tick: number;
  readonly player: ReconciliationPlayerStateV1;
}

export interface WelcomeMessage extends ProtocolEnvelope {
  readonly type: 'welcome';
  readonly connectionId: string;
  readonly serverTick: number;
  readonly protocolConfig: ProtocolConfig;
  readonly simulationIdentity: SimulationIdentityV1;
}

export interface JoinAcceptedMessage extends ProtocolEnvelope {
  readonly type: 'joinAccepted';
  readonly requestId: string;
  readonly playerId: string;
  readonly roomId: string;
  readonly matchId: string;
  readonly serverTick: number;
  readonly connectionMode: 'joined' | 'resumed';
  readonly resumeToken: string;
  readonly simulationIdentity: SimulationIdentityV1;
}

export type JoinRejectionCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'MATCH_INCOMPATIBLE'
  | 'DISPLAY_NAME_REJECTED'
  | 'AUTH_REQUIRED'
  | 'DUPLICATE_SESSION'
  | 'RESUME_REJECTED';

export interface JoinRejectedMessage extends ProtocolEnvelope {
  readonly type: 'joinRejected';
  readonly requestId: string;
  readonly code: JoinRejectionCode;
}

export type SnapshotEntityKind = 'player' | 'projectile' | 'deployable' | 'pickup';

/**
 * Additive protocol-v2 presentation facts copied from canonical authority
 * state. They let remote interpolation preserve multi-level grounding,
 * crouching, and sliding without inferring physics from a world coordinate.
 */
export interface SnapshotPlayerMovementV1 {
  readonly schemaVersion: 1;
  readonly grounded: boolean;
  readonly stance: 'standing' | 'crouched';
  readonly locomotion: 'grounded' | 'airborne' | 'sliding';
}

export interface SnapshotEntity {
  readonly id: string;
  readonly kind: SnapshotEntityKind;
  readonly xMillimeters: number;
  readonly yMillimeters: number;
  readonly zMillimeters: number;
  readonly velocityXMillimetersPerSecond: number;
  readonly velocityYMillimetersPerSecond: number;
  readonly velocityZMillimetersPerSecond: number;
  readonly yawMilliDegrees: number;
  readonly pitchMilliDegrees: number;
  readonly healthPoints: number | null;
  readonly shieldPoints: number | null;
  readonly movement?: SnapshotPlayerMovementV1;
}

export interface CombatPlayerSnapshotV1 {
  readonly playerId: string;
  readonly connected: boolean;
  readonly teamId: string | null;
  readonly lifePhase: 'alive' | 'dead';
  readonly healthPoints: number;
  readonly shieldPoints: number;
  readonly deathOrdinal: number;
  readonly respawnEligibleAtTick: number | null;
  readonly riflePhase:
    | 'holstered'
    | 'equipping'
    | 'ready'
    | 'firing'
    | 'recovering'
    | 'reloading'
    | 'sprinting'
    | 'empty'
    | 'dead';
  readonly magazineRounds: number;
  readonly reserveRounds: number;
  readonly nextShotAtTick: number;
  readonly reloadCompletesAtTick: number | null;
  readonly acceptedShotCount: number;
  readonly weaponCatalogId?: 'kyx_authoritative_armory_v1';
  readonly selectedWeaponSlot?: number;
  readonly selectedWeaponId?: string | null;
  readonly weapons?: readonly CombatWeaponSnapshotV1[];
  readonly grenadePhase: 'equipping' | 'ready' | 'cooldown' | 'dead';
  readonly grenadeCooldownEndsAtTick: number;
  readonly acceptedThrowCount: number;
  readonly activeProjectileCount: number;
  readonly abilityLoadout?: Readonly<{
    readonly slots: readonly [string, string, string, string];
    readonly cooldownEndsAtTicks: readonly [number, number, number];
    readonly currentCharges: readonly [number, number, number];
    readonly maximumCharges: readonly [number, number, number];
    readonly acceptedActivationCounts: readonly [number, number, number];
    readonly flashImpairedUntilTick: number;
  }>;
}

export interface CombatWeaponSnapshotV1 {
  readonly weaponId: string;
  readonly slot: number;
  readonly family: 'rifle' | 'pistol' | 'shotgun' | 'sniper' | 'rocket' | 'melee';
  readonly attackModel: 'hitscan' | 'pellet_hitscan' | 'projectile' | 'melee_contact';
  readonly phase:
    | 'holstered'
    | 'equipping'
    | 'ready'
    | 'recovering'
    | 'reloading'
    | 'empty'
    | 'dead';
  readonly magazineRounds: number | null;
  readonly reserveRounds: number | null;
  readonly readyAtTick: number | null;
  readonly reloadCompletesAtTick: number | null;
  readonly nextAttackAtTick: number;
  readonly acceptedAttackCount: number;
}

export interface CombatProjectileSnapshotV1 {
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly ownerTeamId: string | null;
  readonly phase: 'active' | 'detonated';
  readonly spawnTick: number;
  readonly lifetimeEndsAtTick: number;
  readonly fuseStartedAtTick: number | null;
  readonly detonatesAtTick: number | null;
  readonly xMillimeters: number;
  readonly yMillimeters: number;
  readonly zMillimeters: number;
  readonly velocityXMillimetersPerSecond: number;
  readonly velocityYMillimetersPerSecond: number;
  readonly velocityZMillimetersPerSecond: number;
  readonly bounceCount: number;
  readonly settled: boolean;
}

export interface CombatWeaponProjectileSnapshotV1 {
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly ownerTeamId: string | null;
  readonly weaponId: 'kyx_breach_rocket_v1';
  readonly phase: 'active' | 'detonated' | 'expired';
  readonly spawnTick: number;
  readonly expiresAtTick: number;
  readonly xMillimeters: number;
  readonly yMillimeters: number;
  readonly zMillimeters: number;
  readonly velocityXMillimetersPerSecond: number;
  readonly velocityYMillimetersPerSecond: number;
  readonly velocityZMillimetersPerSecond: number;
  readonly radiusMillimeters: number;
  readonly splashRadiusMillimeters: number;
}

export interface CombatAbilityProjectileSnapshotV1 {
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly ownerTeamId: string | null;
  readonly abilityId: string;
  readonly spawnTick: number;
  readonly lifetimeEndsAtTick: number;
  readonly detonatesAtTick: number | null;
  readonly xMillimeters: number;
  readonly yMillimeters: number;
  readonly zMillimeters: number;
  readonly velocityXMillimetersPerSecond: number;
  readonly velocityYMillimetersPerSecond: number;
  readonly velocityZMillimetersPerSecond: number;
  readonly bounceCount: number;
  readonly settled: boolean;
  readonly attachedPlayerId: string | null;
}

export interface CombatSmokeFieldSnapshotV1 {
  readonly fieldId: string;
  readonly ownerPlayerId: string;
  readonly ownerTeamId: string | null;
  readonly spawnedAtTick: number;
  readonly expiresAtTick: number;
  readonly xMillimeters: number;
  readonly yMillimeters: number;
  readonly zMillimeters: number;
  readonly radiusMillimeters: number;
}

export interface CombatMatchSnapshotV1 {
  readonly phase: 'lobby' | 'warmup' | 'active' | 'postmatch' | 'completed';
  readonly phaseEndsAtTick: number | null;
  readonly activeTicksRemaining: number;
  readonly teamScores: readonly Readonly<{
    readonly teamId: string;
    readonly score: number;
  }>[];
  readonly feedSequence: number;
  readonly result: Readonly<{
    readonly reason: 'score_limit' | 'time_limit';
    readonly winningTeamId: string | null;
    readonly draw: boolean;
  }> | null;
}

/**
 * Compact authoritative combat state. This optional projection is emitted only
 * by combat-capable room profiles; movement-only rooms retain their exact wire
 * shape and baseline semantics.
 */
export interface CombatSnapshotV1 {
  readonly schemaVersion: 1;
  readonly players: readonly CombatPlayerSnapshotV1[];
  readonly projectiles: readonly CombatProjectileSnapshotV1[];
  readonly abilityProjectiles?: readonly CombatAbilityProjectileSnapshotV1[];
  readonly smokeFields?: readonly CombatSmokeFieldSnapshotV1[];
  readonly weaponProjectiles?: readonly CombatWeaponProjectileSnapshotV1[];
  readonly match: CombatMatchSnapshotV1;
}

export interface FullSnapshotMessage extends ProtocolEnvelope {
  readonly type: 'fullSnapshot';
  readonly snapshotBaselineVersion: typeof SNAPSHOT_BASELINE_VERSION;
  readonly snapshotBaselineId: string;
  readonly reliableEventStreamVersion: typeof RELIABLE_EVENT_STREAM_VERSION;
  /** Cumulative event cursor absorbed by this complete state. */
  readonly reliableEventBaselineId: string | null;
  /** Present only for an explicit requestFullSnapshot recovery response. */
  readonly resyncRequestId?: string;
  readonly matchId: string;
  readonly serverTick: number;
  readonly phase: MatchPhase;
  readonly phaseEndsAtTick: number;
  readonly simulationIdentity: SimulationIdentityV1;
  readonly localReconciliation: LocalReconciliationStateV1;
  readonly entities: readonly SnapshotEntity[];
  readonly combat?: CombatSnapshotV1;
}

export interface DeltaSnapshotMessage extends ProtocolEnvelope {
  readonly type: 'deltaSnapshot';
  readonly snapshotBaselineVersion: typeof SNAPSHOT_BASELINE_VERSION;
  readonly baseSnapshotBaselineId: string;
  readonly snapshotBaselineId: string;
  readonly matchId: string;
  readonly baseTick: number;
  readonly serverTick: number;
  readonly phase: MatchPhase;
  readonly phaseEndsAtTick: number;
  readonly localReconciliation: LocalReconciliationStateV1;
  readonly entities: readonly SnapshotEntity[];
  readonly removedEntityIds: readonly string[];
  readonly combat?: CombatSnapshotV1;
}

export type ReliableEventKind =
  | 'shotAccepted'
  | 'weaponAttackAccepted'
  | 'meleeContact'
  | 'projectileSpawned'
  | 'projectileCollided'
  | 'projectileDetonated'
  | 'impulseApplied'
  | 'damageApplied'
  | 'playerKilled'
  | 'abilityActivated'
  | 'abilityRejected'
  | 'worldPortalTraversed'
  | 'cooldownStarted'
  | 'deployableSpawned'
  | 'loadoutAccepted'
  | 'playerJoined'
  | 'playerLeft';

export interface CombatPresentationDamageEventV1 {
  readonly schemaVersion: 1;
  readonly kind: 'damage_applied';
  readonly eventId: string;
  readonly eventSequence: number;
  readonly authorityTick: number;
  readonly causeId: string;
  readonly sourcePlayerId: string | null;
  readonly targetPlayerId: string;
  readonly shieldDamagePoints: number;
  readonly healthDamagePoints: number;
  readonly shieldPointsAfter: number;
  readonly healthPointsAfter: number;
  /**
   * Additive presentation metadata. Missing values from pre-headshot persisted
   * reliable events are interpreted as null during reconnect/replay.
   */
  readonly hitRegion?: 'head' | 'torso' | 'limb' | null;
}

export interface CombatPresentationWeaponBallisticsSampleV1 {
  readonly pelletIndex: number;
  readonly spreadRadiusMilliDegrees: number;
  readonly spreadPitchMilliDegrees: number;
  readonly spreadYawMilliDegrees: number;
}

export interface CombatPresentationWeaponAttackEventV1 {
  readonly schemaVersion: 1;
  readonly kind: 'weapon_attack_accepted';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly weaponId: string;
  readonly family: 'rifle' | 'pistol' | 'shotgun' | 'sniper' | 'rocket' | 'melee';
  readonly attackModel: 'hitscan' | 'pellet_hitscan' | 'projectile' | 'melee_contact';
  readonly attackOrdinal: number;
  readonly referenceDamagePoints: number;
  readonly magazineRoundsAfter: number | null;
  readonly reserveRoundsAfter: number | null;
  readonly nextAttackAtTick: number;
  readonly ballistics: readonly CombatPresentationWeaponBallisticsSampleV1[];
}

export interface CombatPresentationWeaponProjectileSpawnedEventV1 {
  readonly schemaVersion: 1;
  readonly kind: 'weapon_projectile_spawned';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly ownerTeamId: string | null;
  readonly weaponId: 'kyx_breach_rocket_v1';
  readonly spawnTick: number;
  readonly expiresAtTick: number;
  readonly positionMillimeters: ReconciliationVector3;
  readonly velocityMillimetersPerSecond: ReconciliationVector3;
  readonly radiusMillimeters: number;
  readonly splashRadiusMillimeters: number;
}

export interface CombatPresentationWeaponProjectileDetonatedEventV1 {
  readonly schemaVersion: 1;
  readonly kind: 'weapon_projectile_detonated';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly ownerTeamId: string | null;
  readonly weaponId: 'kyx_breach_rocket_v1';
  readonly positionMillimeters: ReconciliationVector3;
  readonly referenceDamagePoints: number;
  readonly splashRadiusMillimeters: number;
  readonly colliderId: string | null;
  readonly reason: 'collision' | 'lifetime';
}

export interface CombatPresentationWeaponMeleeContactEventV1 {
  readonly schemaVersion: 1;
  readonly kind: 'weapon_melee_contact';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly weaponId: 'kyx_edge_v1';
  readonly attackOrdinal: number;
  readonly outcome: 'contact' | 'miss';
  readonly reason: 'no_target' | 'world_occluded' | null;
  readonly targetPlayerId: string | null;
  readonly distanceMillimeters: number | null;
  readonly damagePoints: number;
  readonly contactPointMillimeters: ReconciliationVector3 | null;
}

export interface CombatPresentationTeleportConfirmedEventV1 {
  readonly schemaVersion: 1;
  readonly kind: 'teleport_resource_confirmed';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly abilityId: string;
  readonly outcome: 'full' | 'partial';
  readonly from: ReconciliationVector3;
  readonly to: ReconciliationVector3;
  readonly cooldownTicksRemaining: number;
  readonly weaponRecoveryTicks: number;
  readonly combatStatePolicy: string;
}

export interface CombatPresentationTeleportRejectedEventV1 {
  readonly schemaVersion: 1;
  readonly kind: 'teleport_resource_rejected';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly abilityId: string;
  readonly reason: 'cooldown' | 'blocked' | 'forbidden_volume' | 'kill_volume' | 'no_ground';
  readonly cooldownTicksRemaining: number;
  readonly cooldownConsumedByFailure: false;
}

export interface CombatPresentationWorldPortalTraversedEventV1 {
  readonly schemaVersion: 1;
  readonly kind: 'world_portal_traversed';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly capabilityId: string;
  readonly endpointId: string;
  readonly partnerEndpointId: string;
  readonly from: ReconciliationVector3;
  readonly to: ReconciliationVector3;
  readonly departureAudioHook: string;
  readonly arrivalAudioHook: string;
  readonly departureVfxHook: string;
  readonly arrivalVfxHook: string;
}

export interface CombatPresentationGrenadeThrowEventV1 {
  readonly schemaVersion: 1;
  readonly kind: 'impulse_grenade_throw_accepted';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly abilityId: 'vertical_impulse_grenade_v1';
  readonly throwOrdinal: number;
  readonly projectileId: string;
  readonly cooldownEndsAtTick: number;
}

export type CombatPresentationGrenadeCollisionLayerV1 =
  | 'world_static'
  | 'dynamic_platform'
  | 'player_body'
  | 'door'
  | 'spawn_barrier'
  | 'deployable'
  | 'projectile'
  | 'trigger';

export interface CombatPresentationGrenadeCollisionEventV1 {
  readonly schemaVersion: 1;
  readonly kind: 'impulse_grenade_collision';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly colliderId: string;
  readonly layer: CombatPresentationGrenadeCollisionLayerV1;
  readonly playerId: string | null;
  readonly timeOfImpactPermille: number;
  readonly bounceCount: number;
  readonly fuseStartedAtTick: number;
  readonly detonatesAtTick: number;
  readonly settled: boolean;
}

export interface CombatPresentationGrenadeDetonationEventV1 {
  readonly schemaVersion: 1;
  readonly kind: 'impulse_grenade_detonated';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly ownerTeamId: string | null;
  readonly reason: 'fuse' | 'lifetime';
  readonly positionMillimeters: ReconciliationVector3;
  readonly areaRadiusMillimeters: 11_000;
  readonly damageHealthPoints: 0;
}

export interface CombatPresentationGrenadeImpulseEventV1 {
  readonly schemaVersion: 1;
  readonly kind: 'impulse_grenade_impulse_applied';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly targetPlayerId: string;
  readonly relation: 'self' | 'enemy';
  readonly distanceMillimeters: number;
  readonly falloffPermille: number;
  readonly requestedImpulseMillimetersPerSecond: ReconciliationVector3;
  readonly appliedImpulseMillimetersPerSecond: ReconciliationVector3;
  readonly damageHealthPoints: 0;
}

export interface CombatPresentationThrowableAbilityEventV1 {
  readonly schemaVersion: 1;
  readonly kind: 'throwable_ability_event';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly phase: 'activated' | 'rejected' | 'collision' | 'detonated' | 'flash_applied';
  readonly playerId: string;
  readonly abilityId:
    | 'vertical_impulse_grenade_v1'
    | 'frag_grenade_v1'
    | 'smoke_grenade_v1'
    | 'sticky_grenade_v1'
    | 'flash_grenade_v1';
  readonly projectileId: string | null;
  readonly targetPlayerId: string | null;
  readonly cooldownEndsAtTick: number | null;
  readonly positionMillimeters: ReconciliationVector3 | null;
  readonly areaRadiusMillimeters: number | null;
  readonly reason: string | null;
}

/**
 * Optional, versioned semantic payload retained alongside the legacy reliable
 * event projection. Legacy events without this field remain valid. When the
 * field is present, clients validate the exact tagged shape before presenting
 * confirmed combat feedback.
 */
export type CombatPresentationReliableEventV1 =
  | CombatPresentationDamageEventV1
  | CombatPresentationWeaponAttackEventV1
  | CombatPresentationWeaponProjectileSpawnedEventV1
  | CombatPresentationWeaponProjectileDetonatedEventV1
  | CombatPresentationWeaponMeleeContactEventV1
  | CombatPresentationGrenadeThrowEventV1
  | CombatPresentationGrenadeCollisionEventV1
  | CombatPresentationGrenadeDetonationEventV1
  | CombatPresentationGrenadeImpulseEventV1
  | CombatPresentationThrowableAbilityEventV1
  | CombatPresentationTeleportConfirmedEventV1
  | CombatPresentationTeleportRejectedEventV1
  | CombatPresentationWorldPortalTraversedEventV1;

export interface ReliableEvent {
  readonly id: string;
  readonly serverTick: number;
  readonly kind: ReliableEventKind;
  readonly subjectId: string;
  readonly actorId: string | null;
  readonly targetId: string | null;
  readonly amountHealthPoints: number | null;
  readonly presentation?: CombatPresentationReliableEventV1;
}

export interface ReliableEventBatchMessage extends ProtocolEnvelope {
  readonly type: 'reliableEventBatch';
  readonly reliableEventStreamVersion: typeof RELIABLE_EVENT_STREAM_VERSION;
  readonly matchId: string;
  readonly events: readonly ReliableEvent[];
}

export interface InputAckMessage extends ProtocolEnvelope {
  readonly type: 'inputAck';
  readonly serverTick: number;
  readonly lastProcessedInputSequence: number;
}

export interface MatchStateMessage extends ProtocolEnvelope {
  readonly type: 'matchState';
  readonly matchId: string;
  readonly serverTick: number;
  readonly phase: MatchPhase;
  readonly phaseEndsAtTick: number;
  readonly simulationIdentity: SimulationIdentityV1;
}

export interface ServerNoticeMessage extends ProtocolEnvelope {
  readonly type: 'serverNotice';
  readonly code: string;
  readonly message: string;
}

export interface ErrorMessage extends ProtocolEnvelope {
  readonly type: 'error';
  readonly code: string;
  readonly detail: string | null;
  readonly requestId: string | null;
}

export interface PongMessage extends ProtocolEnvelope {
  readonly type: 'pong';
  readonly nonce: number;
  readonly serverTick: number;
}

export type ServerMessage =
  | WelcomeMessage
  | JoinAcceptedMessage
  | JoinRejectedMessage
  | FullSnapshotMessage
  | DeltaSnapshotMessage
  | ReliableEventBatchMessage
  | InputAckMessage
  | MatchStateMessage
  | ServerNoticeMessage
  | ErrorMessage
  | PongMessage;

export type ProtocolMessage = ClientMessage | ServerMessage;

export const CLIENT_MESSAGE_TYPES = [
  'hello',
  'authenticate',
  'joinRoom',
  'resumeRoom',
  'inputBatch',
  'loadoutRequest',
  'ping',
  'ack',
  'requestFullSnapshot',
] as const satisfies readonly ClientMessage['type'][];

export const SERVER_MESSAGE_TYPES = [
  'welcome',
  'joinAccepted',
  'joinRejected',
  'fullSnapshot',
  'deltaSnapshot',
  'reliableEventBatch',
  'inputAck',
  'matchState',
  'serverNotice',
  'error',
  'pong',
] as const satisfies readonly ServerMessage['type'][];

export const FORBIDDEN_CLIENT_COMMAND_TYPES = [
  'kill',
  'damage',
  'awardcurrency',
  'setposition',
  'setscore',
] as const;

export const PROTOCOL_ERROR_CODES = [
  'PROTOCOL_MESSAGE_TOO_LARGE',
  'PROTOCOL_INVALID_UTF8',
  'PROTOCOL_INVALID_JSON',
  'PROTOCOL_SERIALIZATION_FAILED',
  'PROTOCOL_ROOT_NOT_OBJECT',
  'PROTOCOL_VERSION_REQUIRED',
  'PROTOCOL_VERSION_UNSUPPORTED',
  'PROTOCOL_TYPE_REQUIRED',
  'PROTOCOL_TYPE_UNSUPPORTED',
  'PROTOCOL_DIRECTION_MISMATCH',
  'PROTOCOL_UNKNOWN_FIELD',
  'PROTOCOL_REQUIRED_FIELD',
  'PROTOCOL_INVALID_FIELD_TYPE',
  'PROTOCOL_INVALID_FIELD_VALUE',
  'PROTOCOL_NUMERIC_OUT_OF_RANGE',
  'PROTOCOL_STRING_TOO_LONG',
  'PROTOCOL_ARRAY_TOO_LONG',
  'PROTOCOL_DUPLICATE_ID',
  'PROTOCOL_FORBIDDEN_COMMAND',
  'PROTOCOL_EMPTY_INPUT_BATCH',
  'PROTOCOL_SEQUENCE_INVALID',
] as const;

export type ProtocolErrorCode = (typeof PROTOCOL_ERROR_CODES)[number];

export interface ProtocolFailure {
  readonly code: ProtocolErrorCode;
  readonly path: string;
  readonly message: string;
}

export type ProtocolValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: ProtocolFailure };
