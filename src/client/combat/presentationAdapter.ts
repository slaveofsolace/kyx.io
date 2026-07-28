import type { ReliableEvent } from '../../net';

const MAX_STABLE_ID_BYTES = 256;
const MAX_AUTHORITY_TICK = Number.MAX_SAFE_INTEGER - 100_000;
const DEFAULT_PREDICTION_LIFETIME_TICKS = 20;
const DEFAULT_REMEMBERED_AUTHORITY_EVENTS = 1_024;
const DEFAULT_REMEMBERED_COMMANDS = 512;

export const COMBAT_PRESENTATION_SCHEMA_VERSION = 1 as const;
export const COMBAT_PRESENTATION_MARKER_CONTRACT_ID =
  'kyx.combat.presentation.markers.v1' as const;

export type CombatPredictionKindV1 =
  | 'rifle_fire'
  | 'impulse_grenade_throw'
  | 'teleport';

export type CombatPresentationSourceV1 =
  | 'predicted'
  | 'accepted'
  | 'rejected'
  | 'confirmed'
  | 'cancelled'
  | 'snapshot';

export type CombatPresentationMarkerIdV1 =
  `${typeof COMBAT_PRESENTATION_MARKER_CONTRACT_ID}.${string}`;

export interface CombatPresentationMarkerBundleV1 {
  readonly animation: CombatPresentationMarkerIdV1 | null;
  readonly audio: CombatPresentationMarkerIdV1 | null;
  readonly vfx: CombatPresentationMarkerIdV1 | null;
  readonly hud: CombatPresentationMarkerIdV1 | null;
  /** Substitutes for `animation` when reduced-motion presentation is enabled. */
  readonly reducedMotionAnimation: CombatPresentationMarkerIdV1 | null;
  /** Substitutes for `vfx` when reduced-flash presentation is enabled. */
  readonly reducedFlashVfx: CombatPresentationMarkerIdV1 | null;
  /** Substitutes for `vfx` when reduced-motion presentation is enabled. */
  readonly reducedMotionVfx: CombatPresentationMarkerIdV1 | null;
  /** Substitutes for `vfx` when reduced-flash and reduced-motion are both enabled. */
  readonly reducedFlashMotionVfx: CombatPresentationMarkerIdV1 | null;
  /** Caption/shape/text equivalent when the audio channel is unavailable. */
  readonly nonAudioHud: CombatPresentationMarkerIdV1 | null;
}

export interface CombatPresentationIntentV1 {
  readonly schemaVersion: 1;
  readonly markerContractId: typeof COMBAT_PRESENTATION_MARKER_CONTRACT_ID;
  readonly intentId: string;
  readonly source: CombatPresentationSourceV1;
  readonly authorityTick: number | null;
  readonly authorityEventId: string | null;
  readonly clientCommandId: string | null;
  readonly subjectPlayerId: string | null;
  readonly targetPlayerId: string | null;
  readonly markers: CombatPresentationMarkerBundleV1;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface CombatPresentationLifeViewV1 {
  readonly phase: 'alive' | 'dead';
  readonly healthPoints: number;
  readonly shieldPoints: number;
  readonly protectedUntilTickExclusive: number;
  readonly respawnEligibleAtTick: number | null;
  readonly spawnOrdinal: number;
  readonly deathOrdinal: number;
  /** False after an event that omits replacement point totals, until a snapshot. */
  readonly pointValuesFresh: boolean;
}

export interface CombatPresentationRifleViewV1 {
  readonly weaponId: string;
  readonly phase: string;
  readonly magazineRounds: number;
  readonly reserveRounds: number;
  readonly nextShotAtTick: number;
  readonly reloadCompletesAtTick: number | null;
}

export interface CombatPresentationWeaponViewV1 {
  readonly weaponId: string;
  readonly slot: number;
  readonly family: string;
  readonly attackModel: string;
  readonly phase: string;
  readonly magazineRounds: number | null;
  readonly reserveRounds: number | null;
  readonly readyAtTick: number | null;
  readonly reloadCompletesAtTick: number | null;
  readonly nextAttackAtTick: number;
  readonly acceptedAttackCount: number;
}

export interface CombatPresentationAbilityViewV1 {
  readonly abilityId: string;
  readonly phase: string;
  readonly cooldownEndsAtTick: number;
  readonly cooldownTicksRemaining: number;
  readonly activeProjectileCount: number | null;
}

export interface CombatPresentationLocalPlayerViewV1 {
  readonly playerId: string;
  readonly connected: boolean;
  readonly selectedWeaponSlot: number;
  readonly weaponCatalogId?: string;
  readonly selectedWeaponId?: string | null;
  readonly weapons?: readonly CombatPresentationWeaponViewV1[];
  readonly life: CombatPresentationLifeViewV1;
  readonly rifle: CombatPresentationRifleViewV1;
  readonly impulseGrenade: CombatPresentationAbilityViewV1 | null;
  readonly teleport: CombatPresentationAbilityViewV1 | null;
}

export interface CombatPresentationTeamScoreV1 {
  readonly teamId: string;
  readonly score: number;
}

export interface CombatPresentationPlayerScoreV1 {
  readonly playerId: string;
  readonly teamId: string;
  readonly kills: number;
  readonly deaths: number;
  readonly assists: number;
}

export interface CombatPresentationFeedEntryV1 {
  readonly eventId: string;
  readonly authorityTick: number;
  readonly feedSequence: number;
  readonly causeId: string;
  readonly killerPlayerId: string | null;
  readonly victimPlayerId: string;
  readonly assistPlayerIds: readonly string[];
  readonly scoredTeamId: string | null;
  readonly teamScoreAfter: number | null;
}

export interface CombatPresentationMatchViewV1 {
  readonly matchId: string;
  readonly phase: string;
  readonly phaseEndsAtTick: number | null;
  readonly phaseTicksRemaining: number | null;
  readonly activeTicksRemaining: number;
  readonly teamScoreLimit: number;
  readonly teamScores: readonly CombatPresentationTeamScoreV1[];
  readonly playerScores: readonly CombatPresentationPlayerScoreV1[];
  readonly feedSequence: number;
  readonly feed: readonly CombatPresentationFeedEntryV1[];
  readonly result: Readonly<{
    readonly reason: string;
    readonly winningTeamId: string | null;
    readonly draw: boolean;
  }> | null;
}

export interface CombatPresentationProjectileViewV1 {
  readonly projectileId: string;
  readonly ownerPlayerId: string;
  readonly phase: string;
  readonly positionMillimeters: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>;
  readonly detonatesAtTick: number | null;
  readonly weaponId?: string;
  readonly velocityMillimetersPerSecond?: Readonly<{
    readonly x: number;
    readonly y: number;
    readonly z: number;
  }>;
}

export interface CombatPresentationAuthorityIdentityV1 {
  readonly roomId: string;
  readonly matchId: string;
  readonly rulesetId: string;
  readonly rulesetRevision: number;
  readonly rulesetHash: string;
  readonly mapId: string;
  readonly fixtureId: string;
  readonly fixtureHash: string;
  readonly physicsAdapterId: string;
  readonly physicsAdapterVersion: string;
  readonly movementProfileId: string;
  readonly movementProfileRevision: number;
  readonly movementProfileHash: string;
}

export interface CombatPresentationViewModelV1 {
  readonly schemaVersion: 1;
  readonly markerContractId: typeof COMBAT_PRESENTATION_MARKER_CONTRACT_ID;
  readonly identity: CombatPresentationAuthorityIdentityV1;
  readonly roomId: string;
  readonly matchId: string;
  readonly serverTick: number;
  readonly lifecycle: string;
  readonly localPlayer: CombatPresentationLocalPlayerViewV1 | null;
  readonly match: CombatPresentationMatchViewV1 | null;
  readonly projectiles: readonly CombatPresentationProjectileViewV1[];
}

export interface PendingCombatPredictionV1 {
  readonly kind: CombatPredictionKindV1;
  readonly clientCommandId: string;
  readonly commandSequence: number;
  readonly clientTick: number;
  readonly predictedAtServerTick: number;
  readonly expiresAtServerTick: number;
  readonly expectedAuthorityEventId: string | null;
}

export interface CombatPresentationMetricsV1 {
  readonly predictedCues: number;
  readonly automaticallyReconciledPredictions: number;
  readonly explicitlyReconciledPredictions: number;
  readonly rejectedPredictions: number;
  readonly cancelledPredictions: number;
  readonly expiredPredictions: number;
  readonly acceptedAuthorityEvents: number;
  readonly rejectedAuthorityEvents: number;
  readonly confirmedAuthorityEvents: number;
  readonly duplicateAuthorityEvents: number;
  readonly staleAuthorityEvents: number;
  readonly staleAuthorityFrames: number;
  readonly fullSnapshotResyncs: number;
}

interface RememberedAuthorityEventV1 {
  readonly eventId: string;
  readonly kind: string;
  readonly canonicalPayload: string | null;
}

interface PredictionAuthorityHintsV1 {
  readonly rifleEventNamespace: string | null;
  readonly acceptedRifleShotCount: number;
  readonly grenadeEventNamespace: string | null;
  readonly acceptedGrenadeThrowCount: number;
}

export interface CombatPresentationAdapterV1 {
  readonly schemaVersion: 1;
  readonly localPlayerId: string;
  readonly predictionLifetimeTicks: number;
  readonly maximumRememberedAuthorityEvents: number;
  readonly maximumRememberedCommands: number;
  readonly view: CombatPresentationViewModelV1 | null;
  /** Retained for both internal full snapshots and validated wire hydration. */
  readonly runtimeIdentity: CombatPresentationAuthorityIdentityV1 | null;
  readonly pendingPredictions: readonly PendingCombatPredictionV1[];
  readonly resolvedClientCommandIds: readonly string[];
  readonly rememberedAuthorityEvents: readonly RememberedAuthorityEventV1[];
  readonly lastServerTick: number;
  readonly lastSnapshotServerTick: number;
  readonly snapshotCombatEventSequenceFloor: number;
  readonly lastAuthorityEventTick: number;
  readonly authorityHints: PredictionAuthorityHintsV1;
  readonly metrics: CombatPresentationMetricsV1;
}

export interface CreateCombatPresentationAdapterOptionsV1 {
  readonly schemaVersion: 1;
  readonly localPlayerId: string;
  readonly predictionLifetimeTicks?: number;
  readonly maximumRememberedAuthorityEvents?: number;
  readonly maximumRememberedCommands?: number;
}

export interface PredictCombatPresentationRequestV1 {
  readonly schemaVersion: 1;
  readonly kind: CombatPredictionKindV1;
  readonly clientCommandId: string;
  readonly commandSequence: number;
  readonly clientTick: number;
  /** Optional exact override. Teleport has no derivable event ID in P5.5. */
  readonly expectedAuthorityEventId?: string | null;
}

export interface CombatPresentationStepResultV1 {
  readonly adapter: CombatPresentationAdapterV1;
  readonly intents: readonly CombatPresentationIntentV1[];
  readonly status:
    | 'predicted'
    | 'applied'
    | 'stale_authority_frame'
    | 'snapshot_applied'
    | 'stale_snapshot'
    | 'reconciled'
    | 'rejected'
    | 'already_resolved'
    | 'cancelled';
}

export interface ReconcileCombatPredictionRequestV1 {
  readonly schemaVersion: 1;
  readonly clientCommandId: string;
  readonly authorityEventId: string;
}

export interface CancelCombatPredictionRequestV1 {
  readonly schemaVersion: 1;
  readonly clientCommandId: string;
  readonly reason: 'authority_rejected' | 'expired' | 'snapshot_superseded';
}

export interface CombatPresentationWireHydrationV1 {
  readonly schemaVersion: 1;
  readonly identity: CombatPresentationAuthorityIdentityV1;
  readonly serverTick: number;
  readonly lifecycle: string;
  readonly reliableEventBaselineSequence: number;
  readonly localPlayer: Readonly<{
    readonly playerId: string;
    readonly lifePhase: 'alive' | 'dead';
    readonly healthPoints: number;
    readonly shieldPoints: number;
    readonly riflePhase: string;
    readonly magazineRounds: number;
    readonly reserveRounds: number;
    readonly weaponCatalogId?: string;
    readonly selectedWeaponSlot?: number;
    readonly selectedWeaponId?: string | null;
    readonly weapons?: readonly CombatPresentationWeaponViewV1[];
    readonly grenadePhase: string;
    readonly grenadeCooldownEndsAtTick: number;
    readonly activeProjectileCount: number;
    readonly teleportCooldownTicksRemaining: number;
  }> | null;
  readonly match: Readonly<{
    readonly phase: string;
    readonly activeTicksRemaining: number;
    readonly teamScores: readonly CombatPresentationTeamScoreV1[];
    readonly feedSequence: number;
  }> | null;
}

type ParsedAuthorityEventV1 = Readonly<Record<string, unknown>> & {
  readonly kind: string;
  readonly eventId: string;
  readonly authorityTick: number;
};

interface ParsedAuthorityFrameV1 {
  readonly serverTick: number;
  readonly lifecycle: string;
  readonly events: readonly ParsedAuthorityEventV1[];
}

interface ParsedSnapshotV1 {
  readonly identity: CombatPresentationAuthorityIdentityV1;
  readonly roomId: string;
  readonly matchId: string;
  readonly serverTick: number;
  readonly lifecycle: string;
  readonly localPlayer: CombatPresentationLocalPlayerViewV1 | null;
  readonly match: CombatPresentationMatchViewV1 | null;
  readonly projectiles: readonly CombatPresentationProjectileViewV1[];
  readonly hints: PredictionAuthorityHintsV1;
  readonly historicalFeedEvents: readonly RememberedAuthorityEventV1[];
  readonly combatEventSequenceFloor: number;
}

function marker(suffix: string): CombatPresentationMarkerIdV1 {
  return `${COMBAT_PRESENTATION_MARKER_CONTRACT_ID}.${suffix}`;
}

function markerBundle(
  cue: string,
  channels: readonly ('animation' | 'audio' | 'vfx' | 'hud')[],
): CombatPresentationMarkerBundleV1 {
  const has = (channel: 'animation' | 'audio' | 'vfx' | 'hud'): boolean => (
    channels.includes(channel)
  );
  return Object.freeze({
    animation: has('animation') ? marker(`${cue}.animation`) : null,
    audio: has('audio') ? marker(`${cue}.audio`) : null,
    vfx: has('vfx') ? marker(`${cue}.vfx`) : null,
    hud: has('hud') ? marker(`${cue}.hud`) : null,
    reducedMotionAnimation: has('animation')
      ? marker(`${cue}.animation.reduced_motion`)
      : null,
    reducedFlashVfx: has('vfx') ? marker(`${cue}.vfx.reduced_flash`) : null,
    reducedMotionVfx: has('vfx') ? marker(`${cue}.vfx.reduced_motion`) : null,
    reducedFlashMotionVfx: has('vfx')
      ? marker(`${cue}.vfx.reduced_flash_motion`)
      : null,
    nonAudioHud: has('audio') ? marker(`${cue}.hud.non_audio`) : null,
  });
}

export const COMBAT_PRESENTATION_MARKERS_V1 = Object.freeze({
  snapshotHudSync: markerBundle('snapshot.sync', ['hud']),
  projectileSnapshotSync: markerBundle('projectile.snapshot_sync', ['vfx']),
  rifleFirePredicted: markerBundle('rifle.fire.predicted', ['animation', 'audio', 'vfx']),
  rifleFireAccepted: markerBundle('rifle.fire.accepted', ['animation', 'audio', 'vfx', 'hud']),
  rifleFireRejected: markerBundle('rifle.fire.rejected', ['animation', 'audio', 'vfx', 'hud']),
  rifleFireCancelled: markerBundle('rifle.fire.cancelled', ['animation', 'audio', 'vfx']),
  rifleReloadStarted: markerBundle('rifle.reload.started', ['animation', 'audio', 'hud']),
  rifleReloadCompleted: markerBundle('rifle.reload.completed', ['animation', 'audio', 'hud']),
  rifleReloadCancelled: markerBundle('rifle.reload.cancelled', ['animation', 'audio', 'hud']),
  hitBody: markerBundle('hit.body.confirmed', ['audio', 'vfx', 'hud']),
  hitHead: markerBundle('hit.head.confirmed', ['audio', 'vfx', 'hud']),
  hitHeadKill: markerBundle('hit.head.kill.confirmed', ['audio', 'vfx', 'hud']),
  hitShield: markerBundle('hit.shield.confirmed', ['audio', 'vfx', 'hud']),
  hitKill: markerBundle('hit.kill.confirmed', ['audio', 'vfx', 'hud']),
  damageReceived: markerBundle('damage.received', ['audio', 'vfx', 'hud']),
  death: markerBundle('life.death', ['animation', 'audio', 'vfx', 'hud']),
  respawn: markerBundle('life.respawn', ['animation', 'audio', 'vfx', 'hud']),
  scoreChanged: markerBundle('match.score.changed', ['audio', 'hud']),
  matchPhase: markerBundle('match.phase.changed', ['audio', 'hud']),
  killFeed: markerBundle('match.kill_feed.entry', ['hud']),
  matchResult: markerBundle('match.result', ['audio', 'hud']),
  grenadeThrowPredicted: markerBundle('grenade.throw.predicted', ['animation', 'audio', 'vfx']),
  grenadeThrowAccepted: markerBundle('grenade.throw.accepted', ['animation', 'audio', 'vfx', 'hud']),
  grenadeThrowRejected: markerBundle('grenade.throw.rejected', ['animation', 'audio', 'vfx', 'hud']),
  grenadeThrowCancelled: markerBundle('grenade.throw.cancelled', ['animation', 'audio', 'vfx']),
  grenadeCollision: markerBundle('grenade.projectile.collision', ['audio', 'vfx']),
  grenadeDetonation: markerBundle('grenade.projectile.detonation', ['audio', 'vfx']),
  grenadeImpulse: markerBundle('grenade.impulse.applied', ['audio', 'vfx', 'hud']),
  weaponAttackAccepted: markerBundle('weapon.attack.accepted', ['animation', 'audio', 'vfx', 'hud']),
  weaponProjectileSpawned: markerBundle('weapon.projectile.spawned', ['animation', 'audio', 'vfx']),
  weaponProjectileDetonation: markerBundle('weapon.projectile.detonation', ['audio', 'vfx', 'hud']),
  weaponMeleeContact: markerBundle('weapon.melee.contact', ['animation', 'audio', 'vfx', 'hud']),
  teleportPredicted: markerBundle('teleport.predicted', ['animation', 'audio', 'vfx']),
  teleportConfirmed: markerBundle('teleport.confirmed', ['animation', 'audio', 'vfx', 'hud']),
  teleportRejected: markerBundle('teleport.rejected', ['audio', 'vfx', 'hud']),
  teleportCancelled: markerBundle('teleport.cancelled', ['animation', 'audio', 'vfx']),
});

const EMPTY_METRICS: CombatPresentationMetricsV1 = Object.freeze({
  predictedCues: 0,
  automaticallyReconciledPredictions: 0,
  explicitlyReconciledPredictions: 0,
  rejectedPredictions: 0,
  cancelledPredictions: 0,
  expiredPredictions: 0,
  acceptedAuthorityEvents: 0,
  rejectedAuthorityEvents: 0,
  confirmedAuthorityEvents: 0,
  duplicateAuthorityEvents: 0,
  staleAuthorityEvents: 0,
  staleAuthorityFrames: 0,
  fullSnapshotResyncs: 0,
});

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.isFrozen(value) ? value : Object.freeze(value);
}

function dataRecord(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain data object`);
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain data object`);
  }
  if (Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(`${label} must not contain symbol fields`);
  }
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!Object.hasOwn(descriptor, 'value')) {
      throw new TypeError(`${label} must contain data properties only`);
    }
  }
  return value as Readonly<Record<string, unknown>>;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} contains unsupported or missing fields`);
  }
}

function allowedKeys(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  label: string,
): void {
  const accepted = new Set(allowed);
  const unsupported = Object.keys(value).find((key) => !accepted.has(key));
  if (unsupported !== undefined) throw new TypeError(`${label} contains unsupported field: ${unsupported}`);
}

function requireKeys(
  value: Readonly<Record<string, unknown>>,
  required: readonly string[],
  label: string,
): void {
  const missing = required.find((key) => !Object.hasOwn(value, key));
  if (missing !== undefined) throw new TypeError(`${label} is missing field: ${missing}`);
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} through ${maximum}`);
  }
  return value as number;
}

function bool(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${label} must be a boolean`);
  return value;
}

function stableId(value: unknown, label: string): string {
  return boundedStableId(value, MAX_STABLE_ID_BYTES, label);
}

function stableHash(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{16}(?:[a-f0-9]{48})?$/u.test(value)) {
    throw new RangeError(`${label} must be a lowercase 16-byte or 64-byte hexadecimal hash`);
  }
  return value;
}

function boundedStableId(value: unknown, maximumBytes: number, label: string): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || new TextEncoder().encode(value).byteLength > maximumBytes
    || !/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(value)
  ) {
    throw new RangeError(`${label} must be a bounded stable identifier`);
  }
  return value;
}

function nullableStableId(value: unknown, label: string): string | null {
  return value === null ? null : stableId(value, label);
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length < 1) throw new TypeError(`${label} must be a string`);
  return value;
}

function literal<T extends string | number>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new RangeError(`${label} must equal ${String(expected)}`);
  return expected;
}

function array(value: unknown, maximum: number, label: string): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new RangeError(`${label} must be an array with at most ${maximum} entries`);
  }
  return value;
}

function optionalInteger(value: unknown, minimum: number, maximum: number, label: string): number | null {
  return value === null ? null : integer(value, minimum, maximum, label);
}

function vector3(value: unknown, label: string): Readonly<{ x: number; y: number; z: number }> {
  const item = dataRecord(value, label);
  exactKeys(item, ['x', 'y', 'z'], label);
  return Object.freeze({
    x: integer(item.x, -20_000_000, 20_000_000, `${label} x`),
    y: integer(item.y, -20_000_000, 20_000_000, `${label} y`),
    z: integer(item.z, -20_000_000, 20_000_000, `${label} z`),
  });
}

function stableIdArray(value: unknown, label: string): readonly string[] {
  const result = array(value, 64, label).map((entry, index) => stableId(entry, `${label} ${index}`));
  if (new Set(result).size !== result.length) throw new RangeError(`${label} must be unique`);
  return Object.freeze(result);
}

function cloneData(value: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return deepFreeze(structuredClone(value));
}

function intent(
  id: string,
  source: CombatPresentationSourceV1,
  markers: CombatPresentationMarkerBundleV1,
  options: {
    readonly authorityTick?: number | null;
    readonly authorityEventId?: string | null;
    readonly clientCommandId?: string | null;
    readonly subjectPlayerId?: string | null;
    readonly targetPlayerId?: string | null;
    readonly data?: Readonly<Record<string, unknown>>;
  } = {},
): CombatPresentationIntentV1 {
  return deepFreeze({
    schemaVersion: 1 as const,
    markerContractId: COMBAT_PRESENTATION_MARKER_CONTRACT_ID,
    intentId: boundedStableId(id, 512, 'presentation intent id'),
    source,
    authorityTick: options.authorityTick ?? null,
    authorityEventId: options.authorityEventId ?? null,
    clientCommandId: options.clientCommandId ?? null,
    subjectPlayerId: options.subjectPlayerId ?? null,
    targetPlayerId: options.targetPlayerId ?? null,
    markers,
    data: cloneData(options.data ?? {}),
  });
}

function updateMetrics(
  metrics: CombatPresentationMetricsV1,
  changes: Partial<CombatPresentationMetricsV1>,
): CombatPresentationMetricsV1 {
  const next = { ...metrics };
  for (const [key, delta] of Object.entries(changes)) {
    const metric = key as keyof CombatPresentationMetricsV1;
    next[metric] += delta ?? 0;
  }
  return Object.freeze(next);
}

function freezeAdapter(
  adapter: CombatPresentationAdapterV1,
  changes: Partial<CombatPresentationAdapterV1>,
): CombatPresentationAdapterV1 {
  return deepFreeze({ ...adapter, ...changes });
}

function boundedAppend<T>(values: readonly T[], value: T, capacity: number): readonly T[] {
  return Object.freeze([...values, value].slice(-capacity));
}

function resolvedCommandIds(
  adapter: CombatPresentationAdapterV1,
  commandId: string,
): readonly string[] {
  if (adapter.resolvedClientCommandIds.includes(commandId)) return adapter.resolvedClientCommandIds;
  return boundedAppend(adapter.resolvedClientCommandIds, commandId, adapter.maximumRememberedCommands);
}

function predictionMarker(kind: CombatPredictionKindV1): CombatPresentationMarkerBundleV1 {
  if (kind === 'rifle_fire') return COMBAT_PRESENTATION_MARKERS_V1.rifleFirePredicted;
  if (kind === 'impulse_grenade_throw') return COMBAT_PRESENTATION_MARKERS_V1.grenadeThrowPredicted;
  return COMBAT_PRESENTATION_MARKERS_V1.teleportPredicted;
}

function cancellationMarker(kind: CombatPredictionKindV1): CombatPresentationMarkerBundleV1 {
  if (kind === 'rifle_fire') return COMBAT_PRESENTATION_MARKERS_V1.rifleFireCancelled;
  if (kind === 'impulse_grenade_throw') return COMBAT_PRESENTATION_MARKERS_V1.grenadeThrowCancelled;
  return COMBAT_PRESENTATION_MARKERS_V1.teleportCancelled;
}

function rejectionMarker(kind: CombatPredictionKindV1): CombatPresentationMarkerBundleV1 {
  if (kind === 'rifle_fire') return COMBAT_PRESENTATION_MARKERS_V1.rifleFireRejected;
  if (kind === 'impulse_grenade_throw') return COMBAT_PRESENTATION_MARKERS_V1.grenadeThrowRejected;
  return COMBAT_PRESENTATION_MARKERS_V1.teleportRejected;
}

function kindAcceptsEvent(prediction: CombatPredictionKindV1, eventKind: string): boolean {
  return (
    (prediction === 'rifle_fire' && eventKind === 'auto_rifle_shot_accepted')
    || (prediction === 'impulse_grenade_throw' && eventKind === 'impulse_grenade_throw_accepted')
    || (
      prediction === 'teleport'
      && (eventKind === 'teleport_resource_confirmed' || eventKind === 'teleport_resource_rejected')
    )
  );
}

function derivedExpectedEventId(
  adapter: CombatPresentationAdapterV1,
  kind: CombatPredictionKindV1,
): string | null {
  if (kind === 'rifle_fire' && adapter.authorityHints.rifleEventNamespace !== null) {
    const pending = adapter.pendingPredictions.filter((entry) => entry.kind === kind).length;
    return `combat.auto_rifle.shot.${adapter.authorityHints.rifleEventNamespace}.${
      adapter.authorityHints.acceptedRifleShotCount + pending + 1
    }`;
  }
  if (kind === 'impulse_grenade_throw' && adapter.authorityHints.grenadeEventNamespace !== null) {
    const pending = adapter.pendingPredictions.filter((entry) => entry.kind === kind).length;
    return `${adapter.authorityHints.grenadeEventNamespace}.projectile.${
      adapter.authorityHints.acceptedGrenadeThrowCount + pending + 1
    }.spawn`;
  }
  return null;
}

export function createCombatPresentationAdapter(
  options: CreateCombatPresentationAdapterOptionsV1,
): CombatPresentationAdapterV1 {
  const item = dataRecord(options, 'combat presentation adapter options');
  allowedKeys(item, [
    'schemaVersion',
    'localPlayerId',
    'predictionLifetimeTicks',
    'maximumRememberedAuthorityEvents',
    'maximumRememberedCommands',
  ], 'combat presentation adapter options');
  requireKeys(item, ['schemaVersion', 'localPlayerId'], 'combat presentation adapter options');
  literal(item.schemaVersion, 1, 'combat presentation schema version');
  const predictionLifetimeTicks = item.predictionLifetimeTicks === undefined
    ? DEFAULT_PREDICTION_LIFETIME_TICKS
    : integer(item.predictionLifetimeTicks, 1, 400, 'prediction lifetime ticks');
  const maximumRememberedAuthorityEvents = item.maximumRememberedAuthorityEvents === undefined
    ? DEFAULT_REMEMBERED_AUTHORITY_EVENTS
    : integer(item.maximumRememberedAuthorityEvents, 64, 8_192, 'remembered authority events');
  const maximumRememberedCommands = item.maximumRememberedCommands === undefined
    ? DEFAULT_REMEMBERED_COMMANDS
    : integer(item.maximumRememberedCommands, 32, 4_096, 'remembered commands');
  return deepFreeze({
    schemaVersion: 1 as const,
    localPlayerId: stableId(item.localPlayerId, 'local player id'),
    predictionLifetimeTicks,
    maximumRememberedAuthorityEvents,
    maximumRememberedCommands,
    view: null,
    runtimeIdentity: null,
    pendingPredictions: [],
    resolvedClientCommandIds: [],
    rememberedAuthorityEvents: [],
    lastServerTick: -1,
    lastSnapshotServerTick: -1,
    snapshotCombatEventSequenceFloor: -1,
    lastAuthorityEventTick: -1,
    authorityHints: {
      rifleEventNamespace: null,
      acceptedRifleShotCount: 0,
      grenadeEventNamespace: null,
      acceptedGrenadeThrowCount: 0,
    },
    metrics: EMPTY_METRICS,
  });
}

export function predictCombatPresentation(
  adapter: CombatPresentationAdapterV1,
  request: PredictCombatPresentationRequestV1,
): CombatPresentationStepResultV1 {
  if (adapter.view === null) throw new Error('COMBAT_PRESENTATION_SNAPSHOT_REQUIRED');
  const item = dataRecord(request, 'combat prediction request');
  allowedKeys(item, [
    'schemaVersion', 'kind', 'clientCommandId', 'commandSequence', 'clientTick',
    'expectedAuthorityEventId',
  ], 'combat prediction request');
  requireKeys(
    item,
    ['schemaVersion', 'kind', 'clientCommandId', 'commandSequence', 'clientTick'],
    'combat prediction request',
  );
  literal(item.schemaVersion, 1, 'combat prediction schema version');
  if (item.kind !== 'rifle_fire' && item.kind !== 'impulse_grenade_throw' && item.kind !== 'teleport') {
    throw new RangeError('combat prediction kind is unsupported');
  }
  const kind = item.kind;
  const clientCommandId = stableId(item.clientCommandId, 'client command id');
  if (
    adapter.pendingPredictions.some((entry) => entry.clientCommandId === clientCommandId)
    || adapter.resolvedClientCommandIds.includes(clientCommandId)
  ) {
    throw new Error('COMBAT_PRESENTATION_COMMAND_ID_REPLAYED');
  }
  const explicitExpected = item.expectedAuthorityEventId === undefined
    ? undefined
    : nullableStableId(item.expectedAuthorityEventId, 'expected authority event id');
  const expectedAuthorityEventId = explicitExpected === undefined
    ? derivedExpectedEventId(adapter, kind)
    : explicitExpected;
  if (
    expectedAuthorityEventId !== null
    && adapter.pendingPredictions.some((entry) => (
      entry.expectedAuthorityEventId === expectedAuthorityEventId
    ))
  ) {
    throw new Error('COMBAT_PRESENTATION_AUTHORITY_EVENT_ID_ALREADY_PREDICTED');
  }
  const predictedAtServerTick = adapter.lastServerTick;
  const prediction: PendingCombatPredictionV1 = Object.freeze({
    kind,
    clientCommandId,
    commandSequence: integer(item.commandSequence, 0, 0xffff_ffff, 'command sequence'),
    clientTick: integer(item.clientTick, 0, 0xffff_ffff, 'client tick'),
    predictedAtServerTick,
    expiresAtServerTick: predictedAtServerTick + adapter.predictionLifetimeTicks,
    expectedAuthorityEventId,
  });
  const next = freezeAdapter(adapter, {
    pendingPredictions: Object.freeze([...adapter.pendingPredictions, prediction]),
    metrics: updateMetrics(adapter.metrics, { predictedCues: 1 }),
  });
  return deepFreeze({
    adapter: next,
    intents: [intent(
      `prediction.${clientCommandId}`,
      'predicted',
      predictionMarker(kind),
      {
        clientCommandId,
        subjectPlayerId: adapter.localPlayerId,
        data: {
          kind,
          commandSequence: prediction.commandSequence,
          clientTick: prediction.clientTick,
          expectedAuthorityEventId,
        },
      },
    )],
    status: 'predicted' as const,
  });
}

function parseBaseEvent(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> & { kind: string; eventId: string; authorityTick: number } {
  const item = dataRecord(value, label);
  exactKeys(item, expectedKeys, label);
  const owned = structuredClone(item) as Readonly<Record<string, unknown>>;
  return {
    ...owned,
    kind: stringValue(owned.kind, `${label} kind`),
    eventId: stableId(owned.eventId, `${label} id`),
    authorityTick: integer(owned.authorityTick, 0, MAX_AUTHORITY_TICK, `${label} tick`),
  };
}

function parseRifleEvent(value: unknown): ParsedAuthorityEventV1 {
  const kind = dataRecord(value, 'rifle event').kind;
  let item: Readonly<Record<string, unknown>> & { kind: string; eventId: string; authorityTick: number };
  if (kind === 'auto_rifle_shot_accepted') {
    item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'playerId', 'weaponId', 'shotOrdinal',
      'referenceDamagePoints', 'magazineRoundsAfter', 'reserveRoundsAfter',
      'nextShotAtTick', 'ballistics',
    ], 'rifle shot event');
    stableId(item.playerId, 'rifle shot player');
    stableId(item.weaponId, 'rifle shot weapon');
    integer(item.shotOrdinal, 1, 1_000_000, 'rifle shot ordinal');
    integer(item.referenceDamagePoints, 0, 1_000_000, 'rifle reference damage');
    integer(item.magazineRoundsAfter, 0, 1_000_000, 'rifle magazine rounds');
    integer(item.reserveRoundsAfter, 0, 1_000_000, 'rifle reserve rounds');
    integer(item.nextShotAtTick, 0, MAX_AUTHORITY_TICK, 'rifle next shot tick');
    const ballistics = dataRecord(item.ballistics, 'rifle ballistics');
    exactKeys(ballistics, [
      'patternId', 'patternIndex', 'recoilPitchMilliDegrees', 'recoilYawMilliDegrees',
      'spreadRadiusMilliDegrees', 'spreadPitchMilliDegrees', 'spreadYawMilliDegrees',
    ], 'rifle ballistics');
    stableId(ballistics.patternId, 'rifle ballistics pattern');
    integer(ballistics.patternIndex, 0, 1_000_000, 'rifle ballistics pattern index');
    integer(ballistics.recoilPitchMilliDegrees, -360_000, 360_000, 'rifle recoil pitch');
    integer(ballistics.recoilYawMilliDegrees, -360_000, 360_000, 'rifle recoil yaw');
    integer(ballistics.spreadRadiusMilliDegrees, 0, 360_000, 'rifle spread radius');
    integer(ballistics.spreadPitchMilliDegrees, -360_000, 360_000, 'rifle spread pitch');
    integer(ballistics.spreadYawMilliDegrees, -360_000, 360_000, 'rifle spread yaw');
  } else if (kind === 'auto_rifle_reload_started') {
    item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'playerId', 'source', 'reloadOrdinal',
      'magazineRoundsBefore', 'reserveRoundsBefore', 'completesAtTick',
    ], 'rifle reload started event');
    stableId(item.playerId, 'reload player');
    if (item.source !== 'manual' && item.source !== 'auto') throw new RangeError('reload source is unsupported');
    integer(item.reloadOrdinal, 1, 1_000_000, 'reload ordinal');
    integer(item.magazineRoundsBefore, 0, 1_000_000, 'reload magazine rounds');
    integer(item.reserveRoundsBefore, 0, 1_000_000, 'reload reserve rounds');
    integer(item.completesAtTick, 0, MAX_AUTHORITY_TICK, 'reload completion tick');
  } else if (kind === 'auto_rifle_reload_completed') {
    item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'playerId', 'reloadOrdinal', 'roundsTransferred',
      'magazineRoundsAfter', 'reserveRoundsAfter',
    ], 'rifle reload completed event');
    stableId(item.playerId, 'reload player');
    integer(item.reloadOrdinal, 1, 1_000_000, 'reload ordinal');
    integer(item.roundsTransferred, 0, 1_000_000, 'reload transferred rounds');
    integer(item.magazineRoundsAfter, 0, 1_000_000, 'reload magazine rounds');
    integer(item.reserveRoundsAfter, 0, 1_000_000, 'reload reserve rounds');
  } else if (kind === 'auto_rifle_reload_cancelled') {
    item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'playerId', 'reloadOrdinal', 'reason',
    ], 'rifle reload cancelled event');
    stableId(item.playerId, 'reload player');
    integer(item.reloadOrdinal, 1, 1_000_000, 'reload ordinal');
    if (!['fire', 'sprint', 'death', 'holster'].includes(item.reason as string)) {
      throw new RangeError('reload cancellation reason is unsupported');
    }
  } else {
    throw new RangeError('rifle presentation event kind is unsupported');
  }
  return deepFreeze(item) as ParsedAuthorityEventV1;
}

function parseGrenadeEvent(value: unknown): ParsedAuthorityEventV1 {
  const kind = dataRecord(value, 'impulse grenade event').kind;
  let item: Readonly<Record<string, unknown>> & { kind: string; eventId: string; authorityTick: number };
  if (kind === 'impulse_grenade_throw_accepted') {
    item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'playerId', 'abilityId', 'throwOrdinal',
      'projectileId', 'cooldownEndsAtTick',
    ], 'impulse grenade throw event');
    stableId(item.playerId, 'grenade owner');
    stableId(item.abilityId, 'grenade ability');
    integer(item.throwOrdinal, 1, 1_000_000, 'grenade throw ordinal');
    stableId(item.projectileId, 'grenade projectile');
    integer(item.cooldownEndsAtTick, 0, MAX_AUTHORITY_TICK, 'grenade cooldown end');
  } else if (kind === 'impulse_grenade_collision') {
    item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'projectileId', 'ownerPlayerId', 'colliderId',
      'layer', 'playerId', 'timeOfImpactPermille', 'bounceCount', 'fuseStartedAtTick',
      'detonatesAtTick', 'settled',
    ], 'impulse grenade collision event');
    stableId(item.projectileId, 'grenade projectile');
    stableId(item.ownerPlayerId, 'grenade owner');
    stableId(item.colliderId, 'grenade collider');
    stringValue(item.layer, 'grenade collision layer');
    nullableStableId(item.playerId, 'grenade collision player');
    integer(item.timeOfImpactPermille, 0, 1_000, 'grenade collision time');
    integer(item.bounceCount, 0, 1_000, 'grenade bounce count');
    integer(item.fuseStartedAtTick, 0, MAX_AUTHORITY_TICK, 'grenade fuse start');
    integer(item.detonatesAtTick, 0, MAX_AUTHORITY_TICK, 'grenade detonation tick');
    bool(item.settled, 'grenade settled');
  } else if (kind === 'impulse_grenade_detonated') {
    item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'projectileId', 'ownerPlayerId', 'ownerTeamId',
      'reason', 'positionMillimeters', 'areaRadiusMillimeters', 'damageHealthPoints',
    ], 'impulse grenade detonation event');
    stableId(item.projectileId, 'grenade projectile');
    stableId(item.ownerPlayerId, 'grenade owner');
    nullableStableId(item.ownerTeamId, 'grenade owner team');
    if (item.reason !== 'fuse' && item.reason !== 'lifetime') throw new RangeError('detonation reason is unsupported');
    vector3(item.positionMillimeters, 'grenade detonation position');
    integer(item.areaRadiusMillimeters, 1, 1_000_000, 'grenade area radius');
    literal(item.damageHealthPoints, 0, 'grenade damage');
  } else if (kind === 'impulse_grenade_impulse_applied') {
    item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'projectileId', 'ownerPlayerId', 'targetPlayerId',
      'relation', 'distanceMillimeters', 'falloffPermille',
      'requestedImpulseMillimetersPerSecond', 'appliedImpulseMillimetersPerSecond',
      'damageHealthPoints',
    ], 'impulse grenade impulse event');
    stableId(item.projectileId, 'grenade projectile');
    stableId(item.ownerPlayerId, 'grenade owner');
    stableId(item.targetPlayerId, 'grenade target');
    if (item.relation !== 'self' && item.relation !== 'enemy') throw new RangeError('grenade relation is unsupported');
    integer(item.distanceMillimeters, 0, 1_000_000, 'grenade distance');
    integer(item.falloffPermille, 0, 1_000, 'grenade falloff');
    vector3(item.requestedImpulseMillimetersPerSecond, 'grenade requested impulse');
    vector3(item.appliedImpulseMillimetersPerSecond, 'grenade applied impulse');
    literal(item.damageHealthPoints, 0, 'grenade damage');
  } else {
    throw new RangeError('impulse grenade presentation event kind is unsupported');
  }
  return deepFreeze(item) as ParsedAuthorityEventV1;
}

function parseWeaponEvent(value: unknown): ParsedAuthorityEventV1 {
  const kind = dataRecord(value, 'weapon event').kind;
  let item: Readonly<Record<string, unknown>> & {
    kind: string;
    eventId: string;
    authorityTick: number;
  };
  if (kind === 'weapon_attack_accepted') {
    item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'playerId', 'weaponId', 'family', 'attackModel',
      'attackOrdinal', 'referenceDamagePoints', 'magazineRoundsAfter', 'reserveRoundsAfter',
      'nextAttackAtTick', 'ballistics',
    ], 'weapon attack event');
    stableId(item.playerId, 'weapon attack player');
    const weaponId = stableId(item.weaponId, 'weapon attack weapon');
    const weaponProfile = clientWeaponProfile(weaponId);
    if (!['rifle', 'pistol', 'shotgun', 'sniper', 'rocket', 'melee'].includes(item.family as string)) {
      throw new RangeError('weapon attack family is unsupported');
    }
    if (!['hitscan', 'pellet_hitscan', 'projectile', 'melee_contact'].includes(item.attackModel as string)) {
      throw new RangeError('weapon attack model is unsupported');
    }
    if (
      item.family !== weaponProfile.family
      || item.attackModel !== weaponProfile.attackModel
    ) throw new RangeError('weapon attack does not match its authoritative profile');
    integer(item.attackOrdinal, 1, 1_000_000, 'weapon attack ordinal');
    integer(item.referenceDamagePoints, 0, 1_000_000, 'weapon reference damage');
    optionalInteger(item.magazineRoundsAfter, 0, 1_000_000, 'weapon magazine rounds');
    optionalInteger(item.reserveRoundsAfter, 0, 1_000_000, 'weapon reserve rounds');
    integer(item.nextAttackAtTick, 0, MAX_AUTHORITY_TICK, 'weapon next attack tick');
    const ballistics = array(item.ballistics, 64, 'weapon ballistics');
    if (ballistics.length !== weaponProfile.pellets) {
      throw new RangeError('weapon ballistics count does not match its authoritative profile');
    }
    const pelletIndexes = new Set<number>();
    ballistics.forEach((sample, index) => {
      const entry = dataRecord(sample, `weapon ballistics ${index}`);
      exactKeys(entry, [
        'pelletIndex', 'spreadRadiusMilliDegrees', 'spreadPitchMilliDegrees',
        'spreadYawMilliDegrees',
      ], `weapon ballistics ${index}`);
      const pelletIndex = integer(
        entry.pelletIndex,
        0,
        weaponProfile.pellets - 1,
        `weapon ballistics ${index} pellet`,
      );
      if (pelletIndexes.has(pelletIndex)) {
        throw new RangeError('weapon ballistics pellet indexes must be unique');
      }
      pelletIndexes.add(pelletIndex);
      integer(
        entry.spreadRadiusMilliDegrees,
        0,
        360_000,
        `weapon ballistics ${index} spread radius`,
      );
      integer(
        entry.spreadPitchMilliDegrees,
        -360_000,
        360_000,
        `weapon ballistics ${index} spread pitch`,
      );
      integer(
        entry.spreadYawMilliDegrees,
        -360_000,
        360_000,
        `weapon ballistics ${index} spread yaw`,
      );
    });
  } else if (kind === 'weapon_projectile_spawned') {
    item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'projectileId', 'ownerPlayerId', 'ownerTeamId',
      'weaponId', 'spawnTick', 'expiresAtTick', 'positionMillimeters',
      'velocityMillimetersPerSecond', 'radiusMillimeters', 'splashRadiusMillimeters',
    ], 'weapon projectile spawn event');
    stableId(item.projectileId, 'weapon projectile');
    stableId(item.ownerPlayerId, 'weapon projectile owner');
    nullableStableId(item.ownerTeamId, 'weapon projectile owner team');
    literal(item.weaponId, 'kyx_breach_rocket_v1', 'weapon projectile weapon');
    integer(item.spawnTick, 0, MAX_AUTHORITY_TICK, 'weapon projectile spawn tick');
    integer(item.expiresAtTick, 0, MAX_AUTHORITY_TICK, 'weapon projectile expiry tick');
    vector3(item.positionMillimeters, 'weapon projectile position');
    vector3(item.velocityMillimetersPerSecond, 'weapon projectile velocity');
    integer(item.radiusMillimeters, 1, 1_000_000, 'weapon projectile radius');
    integer(item.splashRadiusMillimeters, 1, 1_000_000, 'weapon projectile splash radius');
  } else if (kind === 'weapon_projectile_detonated') {
    item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'projectileId', 'ownerPlayerId', 'ownerTeamId',
      'weaponId', 'positionMillimeters', 'referenceDamagePoints', 'splashRadiusMillimeters',
      'colliderId', 'reason',
    ], 'weapon projectile detonation event');
    stableId(item.projectileId, 'weapon projectile');
    stableId(item.ownerPlayerId, 'weapon projectile owner');
    nullableStableId(item.ownerTeamId, 'weapon projectile owner team');
    literal(item.weaponId, 'kyx_breach_rocket_v1', 'weapon projectile weapon');
    vector3(item.positionMillimeters, 'weapon projectile detonation position');
    integer(item.referenceDamagePoints, 0, 1_000_000, 'weapon projectile reference damage');
    integer(item.splashRadiusMillimeters, 1, 1_000_000, 'weapon projectile splash radius');
    nullableStableId(item.colliderId, 'weapon projectile collider');
    if (item.reason !== 'collision' && item.reason !== 'lifetime') {
      throw new RangeError('weapon projectile detonation reason is unsupported');
    }
  } else if (kind === 'weapon_melee_contact') {
    item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'playerId', 'weaponId', 'attackOrdinal',
      'outcome', 'reason', 'targetPlayerId', 'distanceMillimeters', 'damagePoints',
      'contactPointMillimeters',
    ], 'weapon melee contact event');
    stableId(item.playerId, 'weapon melee player');
    literal(item.weaponId, 'kyx_edge_v1', 'weapon melee weapon');
    integer(item.attackOrdinal, 1, 1_000_000, 'weapon melee attack ordinal');
    if (item.outcome !== 'contact' && item.outcome !== 'miss') {
      throw new RangeError('weapon melee outcome is unsupported');
    }
    if (
      item.reason !== null
      && item.reason !== 'no_target'
      && item.reason !== 'world_occluded'
    ) throw new RangeError('weapon melee reason is unsupported');
    nullableStableId(item.targetPlayerId, 'weapon melee target');
    optionalInteger(item.distanceMillimeters, 0, 1_000_000, 'weapon melee distance');
    integer(item.damagePoints, 0, 1_000_000, 'weapon melee damage');
    if (item.contactPointMillimeters !== null) {
      vector3(item.contactPointMillimeters, 'weapon melee contact point');
    }
  } else {
    throw new RangeError('weapon presentation event kind is unsupported');
  }
  return deepFreeze(item) as ParsedAuthorityEventV1;
}

function parseTeleportEvent(value: unknown): ParsedAuthorityEventV1 {
  const kind = dataRecord(value, 'teleport resource event').kind;
  let item: Readonly<Record<string, unknown>> & { kind: string; eventId: string; authorityTick: number };
  if (kind === 'teleport_resource_confirmed') {
    item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'playerId', 'abilityId', 'outcome', 'from', 'to',
      'cooldownTicksRemaining', 'weaponRecoveryTicks', 'combatStatePolicy',
    ], 'teleport confirmed event');
    stableId(item.playerId, 'teleport player');
    stableId(item.abilityId, 'teleport ability');
    if (item.outcome !== 'full' && item.outcome !== 'partial') throw new RangeError('teleport outcome is unsupported');
    vector3(item.from, 'teleport origin');
    vector3(item.to, 'teleport destination');
    integer(item.cooldownTicksRemaining, 0, 100_000, 'teleport cooldown');
    integer(item.weaponRecoveryTicks, 0, 100_000, 'teleport weapon recovery');
    stringValue(item.combatStatePolicy, 'teleport combat state policy');
  } else if (kind === 'teleport_resource_rejected') {
    item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'playerId', 'abilityId', 'reason',
      'cooldownTicksRemaining', 'cooldownConsumedByFailure',
    ], 'teleport rejected event');
    stableId(item.playerId, 'teleport player');
    stableId(item.abilityId, 'teleport ability');
    if (!['cooldown', 'blocked', 'forbidden_volume', 'kill_volume', 'no_ground'].includes(item.reason as string)) {
      throw new RangeError('teleport rejection reason is unsupported');
    }
    integer(item.cooldownTicksRemaining, 0, 100_000, 'teleport cooldown');
    if (item.cooldownConsumedByFailure !== false) {
      throw new RangeError('teleport rejection cannot consume cooldown in the accepted profile');
    }
  } else {
    throw new RangeError('teleport presentation event kind is unsupported');
  }
  return deepFreeze(item) as ParsedAuthorityEventV1;
}

function parseFeedEvent(value: unknown): ParsedAuthorityEventV1 {
  const item = parseBaseEvent(value, [
    'kind', 'eventId', 'authorityTick', 'feedSequence', 'combatDeathEventId', 'causeId',
    'killerPlayerId', 'victimPlayerId', 'assistPlayerIds', 'scoredTeamId', 'teamScoreAfter',
  ], 'kill feed event');
  literal(item.kind, 'kill_feed_entry', 'kill feed kind');
  integer(item.feedSequence, 1, 1_000_000, 'feed sequence');
  stableId(item.combatDeathEventId, 'feed death event');
  stableId(item.causeId, 'feed cause');
  nullableStableId(item.killerPlayerId, 'feed killer');
  stableId(item.victimPlayerId, 'feed victim');
  stableIdArray(item.assistPlayerIds, 'feed assists');
  nullableStableId(item.scoredTeamId, 'feed scored team');
  optionalInteger(item.teamScoreAfter, 0, 1_000_000, 'feed team score');
  return deepFreeze(item) as ParsedAuthorityEventV1;
}

function parseMatchEvent(value: unknown): ParsedAuthorityEventV1 {
  const kind = dataRecord(value, 'match event').kind;
  if (kind === 'damage_applied') {
    const damageFields = [
      'kind', 'eventId', 'eventSequence', 'authorityTick', 'causeId', 'sourcePlayerId',
      'targetPlayerId', 'shieldDamagePoints', 'healthDamagePoints', 'shieldPointsAfter',
      'healthPointsAfter',
    ] as const;
    const item = parseBaseEvent(
      value,
      Object.hasOwn(dataRecord(value, 'damage event'), 'hitRegion')
        ? [...damageFields, 'hitRegion']
        : damageFields,
      'damage event',
    );
    integer(item.eventSequence, 0, 1_000_000, 'damage event sequence');
    stableId(item.causeId, 'damage cause');
    nullableStableId(item.sourcePlayerId, 'damage source');
    stableId(item.targetPlayerId, 'damage target');
    integer(item.shieldDamagePoints, 0, 1_000_000, 'shield damage');
    integer(item.healthDamagePoints, 0, 1_000_000, 'health damage');
    integer(item.shieldPointsAfter, 0, 1_000_000, 'shield after');
    integer(item.healthPointsAfter, 0, 1_000_000, 'health after');
    if (
      item.hitRegion !== undefined
      && item.hitRegion !== null
      && item.hitRegion !== 'head'
      && item.hitRegion !== 'torso'
      && item.hitRegion !== 'limb'
    ) {
      throw new RangeError('damage hit region must be head, torso, limb, null, or omitted');
    }
    return deepFreeze(item) as ParsedAuthorityEventV1;
  }
  if (kind === 'death') {
    const item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'victimPlayerId', 'killerPlayerId',
      'assistPlayerIds', 'deathOrdinal', 'respawnEligibleAtTick', 'discontinuitySequence',
    ], 'death event');
    stableId(item.victimPlayerId, 'death victim');
    nullableStableId(item.killerPlayerId, 'death killer');
    stableIdArray(item.assistPlayerIds, 'death assists');
    integer(item.deathOrdinal, 1, 1_000_000, 'death ordinal');
    integer(item.respawnEligibleAtTick, 0, MAX_AUTHORITY_TICK, 'respawn eligible tick');
    integer(item.discontinuitySequence, 1, 1_000_000, 'death discontinuity');
    return deepFreeze(item) as ParsedAuthorityEventV1;
  }
  if (kind === 'respawn') {
    const item = parseBaseEvent(value, [
      'kind', 'eventId', 'eventSequence', 'authorityTick', 'playerId', 'authoritySpawnId',
      'spawnOrdinal', 'protectedUntilTickExclusive', 'discontinuitySequence',
    ], 'respawn event');
    integer(item.eventSequence, 0, 1_000_000, 'respawn event sequence');
    stableId(item.playerId, 'respawn player');
    stableId(item.authoritySpawnId, 'respawn spawn');
    integer(item.spawnOrdinal, 1, 1_000_000, 'respawn ordinal');
    integer(item.protectedUntilTickExclusive, 0, MAX_AUTHORITY_TICK, 'respawn protection');
    integer(item.discontinuitySequence, 1, 1_000_000, 'respawn discontinuity');
    return deepFreeze(item) as ParsedAuthorityEventV1;
  }
  if (kind === 'team_score_changed') {
    const item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'combatDeathEventId', 'teamId', 'previousScore',
      'scoreAfter', 'scoreLimit', 'killerPlayerId', 'victimPlayerId',
    ], 'team score event');
    stableId(item.combatDeathEventId, 'score death event');
    stableId(item.teamId, 'score team');
    integer(item.previousScore, 0, 1_000_000, 'previous team score');
    integer(item.scoreAfter, 1, 1_000_000, 'team score after');
    integer(item.scoreLimit, 1, 1_000_000, 'team score limit');
    stableId(item.killerPlayerId, 'score killer');
    stableId(item.victimPlayerId, 'score victim');
    return deepFreeze(item) as ParsedAuthorityEventV1;
  }
  if (kind === 'kill_feed_entry') return parseFeedEvent(value);
  if (kind === 'match_phase_changed') {
    const item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'matchId', 'from', 'to', 'phaseStartedAtTick',
      'phaseEndsAtTick', 'reason',
    ], 'match phase event');
    stableId(item.matchId, 'phase match');
    stringValue(item.from, 'phase from');
    stringValue(item.to, 'phase to');
    integer(item.phaseStartedAtTick, 0, MAX_AUTHORITY_TICK, 'phase start');
    optionalInteger(item.phaseEndsAtTick, 0, MAX_AUTHORITY_TICK, 'phase end');
    stringValue(item.reason, 'phase reason');
    return deepFreeze(item) as ParsedAuthorityEventV1;
  }
  if (kind === 'match_result') {
    const item = parseBaseEvent(value, [
      'kind', 'eventId', 'authorityTick', 'matchId', 'reason', 'winningTeamId', 'draw',
      'teamScores',
    ], 'match result event');
    stableId(item.matchId, 'result match');
    stringValue(item.reason, 'result reason');
    nullableStableId(item.winningTeamId, 'winning team');
    bool(item.draw, 'result draw');
    parseTeamScores(item.teamScores, 'result team scores');
    return deepFreeze(item) as ParsedAuthorityEventV1;
  }
  throw new RangeError('match presentation event kind is unsupported');
}

function eventPriority(kind: string): number {
  const priorities: Readonly<Record<string, number>> = {
    auto_rifle_shot_accepted: 10,
    auto_rifle_reload_started: 11,
    auto_rifle_reload_completed: 12,
    auto_rifle_reload_cancelled: 13,
    impulse_grenade_throw_accepted: 20,
    impulse_grenade_collision: 21,
    impulse_grenade_detonated: 22,
    impulse_grenade_impulse_applied: 23,
    teleport_resource_confirmed: 30,
    teleport_resource_rejected: 31,
    damage_applied: 40,
    death: 41,
    respawn: 42,
    team_score_changed: 43,
    kill_feed_entry: 44,
    match_phase_changed: 45,
    match_result: 46,
  };
  return priorities[kind] ?? 1_000;
}

function parseAuthorityFrame(value: unknown): ParsedAuthorityFrameV1 {
  const item = dataRecord(value, 'authority presentation frame');
  allowedKeys(item, [
    'serverTick', 'lifecycle', 'lifecycleTransitions', 'movementEvents', 'queryMetrics',
    'prunedPlayerIds', 'combatEvents', 'hitscanResults', 'impulseGrenadeEvents',
    'impulseGrenadeResults', 'weaponAttackResults', 'weaponProjectileResults',
    'abilityLoadoutEvents', 'abilityEffectResults', 'abilityResourceEvents', 'matchEvents',
  ], 'authority presentation frame');
  requireKeys(item, ['serverTick', 'lifecycle'], 'authority presentation frame');
  const serverTick = integer(item.serverTick, 0, MAX_AUTHORITY_TICK, 'authority frame tick');
  const parsed: ParsedAuthorityEventV1[] = [];
  for (const event of array(item.combatEvents ?? [], 512, 'rifle events')) parsed.push(parseRifleEvent(event));
  for (const event of array(item.impulseGrenadeEvents ?? [], 2_048, 'grenade events')) {
    parsed.push(parseGrenadeEvent(event));
  }
  for (const event of array(item.abilityResourceEvents ?? [], 512, 'ability resource events')) {
    parsed.push(parseTeleportEvent(event));
  }
  array(item.weaponAttackResults ?? [], 512, 'weapon attack results');
  array(item.weaponProjectileResults ?? [], 2_048, 'weapon projectile results');
  array(item.abilityLoadoutEvents ?? [], 2_048, 'ability loadout events');
  array(item.abilityEffectResults ?? [], 2_048, 'ability effect results');
  for (const event of array(item.matchEvents ?? [], 2_048, 'match events')) parsed.push(parseMatchEvent(event));
  for (const event of parsed) {
    if (event.authorityTick > serverTick) {
      throw new RangeError('authority event tick cannot exceed its enclosing server tick');
    }
  }
  const byId = new Map<string, string>();
  for (const event of parsed) {
    const canonical = JSON.stringify(event);
    const prior = byId.get(event.eventId);
    if (prior !== undefined && prior !== canonical) {
      throw new Error('AUTHORITY_EVENT_ID_HAS_CONFLICTING_PAYLOADS');
    }
    byId.set(event.eventId, canonical);
  }
  parsed.sort((left, right) => (
    left.authorityTick - right.authorityTick
    || eventPriority(left.kind) - eventPriority(right.kind)
    || (left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0)
  ));
  return deepFreeze({
    serverTick,
    lifecycle: stringValue(item.lifecycle, 'authority lifecycle'),
    events: parsed,
  });
}

function parseLife(value: unknown): CombatPresentationLifeViewV1 {
  const item = dataRecord(value, 'combat life snapshot');
  exactKeys(item, [
    'schemaVersion', 'playerId', 'teamId', 'phase', 'healthPoints', 'shieldPoints',
    'spawnOrdinal', 'deathOrdinal', 'protectedUntilTickExclusive', 'respawnEligibleAtTick',
    'lastSpawnId', 'lastDiscontinuity', 'damageContributions',
    'lastProcessedCombatEventSequence',
  ], 'combat life snapshot');
  literal(item.schemaVersion, 1, 'combat life schema');
  stableId(item.playerId, 'combat life player');
  nullableStableId(item.teamId, 'combat life team');
  if (item.phase !== 'alive' && item.phase !== 'dead') throw new RangeError('combat life phase is unsupported');
  const discontinuity = dataRecord(item.lastDiscontinuity, 'combat discontinuity');
  exactKeys(discontinuity, ['sequence', 'authorityTick', 'reason'], 'combat discontinuity');
  integer(discontinuity.sequence, 1, 1_000_000, 'combat discontinuity sequence');
  integer(discontinuity.authorityTick, 0, MAX_AUTHORITY_TICK, 'combat discontinuity tick');
  stringValue(discontinuity.reason, 'combat discontinuity reason');
  for (const [index, contributionValue] of array(
    item.damageContributions,
    64,
    'damage contributions',
  ).entries()) {
    const contribution = dataRecord(contributionValue, `damage contribution ${index}`);
    exactKeys(
      contribution,
      ['sourcePlayerId', 'lastDamageTick', 'healthDamagePoints', 'shieldDamagePoints'],
      `damage contribution ${index}`,
    );
    stableId(contribution.sourcePlayerId, 'damage contribution source');
    integer(contribution.lastDamageTick, 0, MAX_AUTHORITY_TICK, 'damage contribution tick');
    integer(contribution.healthDamagePoints, 0, 1_000_000, 'contributed health damage');
    integer(contribution.shieldDamagePoints, 0, 1_000_000, 'contributed shield damage');
  }
  integer(item.lastProcessedCombatEventSequence, -1, 1_000_000, 'combat event sequence');
  return Object.freeze({
    phase: item.phase,
    healthPoints: integer(item.healthPoints, 0, 1_000_000, 'health points'),
    shieldPoints: integer(item.shieldPoints, 0, 1_000_000, 'shield points'),
    protectedUntilTickExclusive: integer(
      item.protectedUntilTickExclusive,
      0,
      MAX_AUTHORITY_TICK,
      'spawn protection tick',
    ),
    respawnEligibleAtTick: optionalInteger(
      item.respawnEligibleAtTick,
      0,
      MAX_AUTHORITY_TICK,
      'respawn eligible tick',
    ),
    spawnOrdinal: integer(item.spawnOrdinal, 1, 1_000_000, 'spawn ordinal'),
    deathOrdinal: integer(item.deathOrdinal, 0, 1_000_000, 'death ordinal'),
    pointValuesFresh: true,
  });
}

function parseRifleSnapshot(value: unknown): {
  readonly view: CombatPresentationRifleViewV1;
  readonly eventNamespace: string;
  readonly acceptedShotCount: number;
} {
  const item = dataRecord(value, 'auto rifle snapshot');
  exactKeys(item, [
    'schemaVersion', 'playerId', 'weaponId', 'phase', 'magazineRounds', 'reserveRounds',
    'nextShotAtTick', 'readyAtTick', 'activeReload', 'reloadOrdinal',
    'completedReloadOrdinal', 'acceptedShotCount', 'ballisticsSeed', 'eventNamespace',
    'lastProcessedAuthorityTick', 'lastProcessedAuthorityInputSequence',
  ], 'auto rifle snapshot');
  literal(item.schemaVersion, 1, 'auto rifle schema');
  stableId(item.playerId, 'auto rifle player');
  const eventNamespace = stableId(item.eventNamespace, 'auto rifle event namespace');
  const activeReload = item.activeReload === null ? null : dataRecord(item.activeReload, 'active reload');
  if (activeReload !== null) {
    exactKeys(
      activeReload,
      ['reloadOrdinal', 'source', 'startedAtTick', 'completesAtTick'],
      'active reload',
    );
    integer(activeReload.reloadOrdinal, 1, 1_000_000, 'active reload ordinal');
    if (activeReload.source !== 'manual' && activeReload.source !== 'auto') {
      throw new RangeError('active reload source is unsupported');
    }
    integer(activeReload.startedAtTick, 0, MAX_AUTHORITY_TICK, 'active reload start');
  }
  const reloadCompletesAtTick = activeReload === null
    ? null
    : integer(activeReload.completesAtTick, 0, MAX_AUTHORITY_TICK, 'reload completion tick');
  return deepFreeze({
    view: {
      weaponId: stableId(item.weaponId, 'auto rifle weapon'),
      phase: stringValue(item.phase, 'auto rifle phase'),
      magazineRounds: integer(item.magazineRounds, 0, 1_000_000, 'magazine rounds'),
      reserveRounds: integer(item.reserveRounds, 0, 1_000_000, 'reserve rounds'),
      nextShotAtTick: integer(item.nextShotAtTick, 0, MAX_AUTHORITY_TICK, 'next shot tick'),
      reloadCompletesAtTick,
    },
    eventNamespace,
    acceptedShotCount: integer(item.acceptedShotCount, 0, 1_000_000, 'accepted shot count'),
  });
}

const CLIENT_WEAPON_PROFILE_BY_ID = Object.freeze({
  vertical_rifle_v1: Object.freeze({
    slot: 0, family: 'rifle', attackModel: 'hitscan', pellets: 1,
  }),
  kyx_sidearm_v1: Object.freeze({
    slot: 1, family: 'pistol', attackModel: 'hitscan', pellets: 1,
  }),
  kyx_scattergun_v1: Object.freeze({
    slot: 2,
    family: 'shotgun',
    attackModel: 'pellet_hitscan',
    pellets: 8,
  }),
  kyx_longshot_v1: Object.freeze({
    slot: 3, family: 'sniper', attackModel: 'hitscan', pellets: 1,
  }),
  kyx_breach_rocket_v1: Object.freeze({
    slot: 4,
    family: 'rocket',
    attackModel: 'projectile',
    pellets: 1,
  }),
  kyx_edge_v1: Object.freeze({
    slot: 5, family: 'melee', attackModel: 'melee_contact', pellets: 1,
  }),
} as const);

function clientWeaponProfile(weaponId: string): (
  typeof CLIENT_WEAPON_PROFILE_BY_ID[keyof typeof CLIENT_WEAPON_PROFILE_BY_ID]
) {
  const profile = CLIENT_WEAPON_PROFILE_BY_ID[
    weaponId as keyof typeof CLIENT_WEAPON_PROFILE_BY_ID
  ];
  if (profile === undefined) throw new RangeError('authority weapon profile is unsupported');
  return profile;
}

function parseAuthorityArmorySnapshot(
  value: unknown,
  expectedPlayerId: string,
): Readonly<{
  readonly weaponCatalogId: string;
  readonly selectedWeaponSlot: number;
  readonly selectedWeaponId: string | null;
  readonly weapons: readonly CombatPresentationWeaponViewV1[];
}> {
  const item = dataRecord(value, 'authority armory snapshot');
  exactKeys(item, [
    'schemaVersion', 'catalogId', 'playerId', 'selectedSlot', 'weapons',
  ], 'authority armory snapshot');
  literal(item.schemaVersion, 1, 'authority armory schema');
  const weaponCatalogId = literal(
    item.catalogId,
    'kyx_authoritative_armory_v1',
    'authority armory catalog',
  );
  if (stableId(item.playerId, 'authority armory player') !== expectedPlayerId) {
    throw new Error('COMBAT_PRESENTATION_ARMORY_PLAYER_MISMATCH');
  }
  const selectedWeaponSlot = integer(item.selectedSlot, 0, 7, 'authority selected weapon slot');
  const weaponValues = array(item.weapons, 8, 'authority armory weapons');
  if (weaponValues.length !== 6) {
    throw new RangeError('authority armory must contain all six original weapon profiles');
  }
  const seenWeaponIds = new Set<string>();
  const seenSlots = new Set<number>();
  const weapons = weaponValues.map((weaponValue) => {
    const weapon = dataRecord(weaponValue, 'authority weapon snapshot');
    exactKeys(weapon, [
      'schemaVersion', 'catalogId', 'playerId', 'weaponId', 'phase', 'magazineRounds',
      'reserveRounds', 'readyAtTick', 'reloadCompletesAtTick', 'nextAttackAtTick',
      'acceptedAttackCount', 'ballisticsSeed', 'eventNamespace',
      'lastProcessedAuthorityTick', 'lastProcessedAuthorityInputSequence',
    ], 'authority weapon snapshot');
    literal(weapon.schemaVersion, 1, 'authority weapon schema');
    literal(
      weapon.catalogId,
      'kyx_authoritative_armory_v1',
      'authority weapon catalog',
    );
    if (stableId(weapon.playerId, 'authority weapon player') !== expectedPlayerId) {
      throw new Error('COMBAT_PRESENTATION_WEAPON_PLAYER_MISMATCH');
    }
    const weaponId = stableId(weapon.weaponId, 'authority weapon id');
    const profile = clientWeaponProfile(weaponId);
    if (seenWeaponIds.has(weaponId) || seenSlots.has(profile.slot)) {
      throw new Error('COMBAT_PRESENTATION_ARMORY_DUPLICATE_WEAPON');
    }
    seenWeaponIds.add(weaponId);
    seenSlots.add(profile.slot);
    const phase = stringValue(weapon.phase, 'authority weapon phase');
    if (![
      'holstered', 'equipping', 'ready', 'recovering', 'reloading', 'empty', 'dead',
    ].includes(phase)) throw new RangeError('authority weapon phase is unsupported');
    return deepFreeze({
      weaponId,
      slot: profile.slot,
      family: profile.family,
      attackModel: profile.attackModel,
      phase,
      magazineRounds: weapon.magazineRounds === null
        ? null
        : integer(weapon.magazineRounds, 0, 1_000_000, 'authority weapon magazine'),
      reserveRounds: weapon.reserveRounds === null
        ? null
        : integer(weapon.reserveRounds, 0, 1_000_000, 'authority weapon reserve'),
      readyAtTick: optionalInteger(
        weapon.readyAtTick,
        0,
        MAX_AUTHORITY_TICK,
        'authority weapon ready tick',
      ),
      reloadCompletesAtTick: optionalInteger(
        weapon.reloadCompletesAtTick,
        0,
        MAX_AUTHORITY_TICK,
        'authority weapon reload tick',
      ),
      nextAttackAtTick: integer(
        weapon.nextAttackAtTick,
        0,
        MAX_AUTHORITY_TICK,
        'authority weapon next attack tick',
      ),
      acceptedAttackCount: integer(
        weapon.acceptedAttackCount,
        0,
        1_000_000,
        'authority accepted attack count',
      ),
    });
  });
  return deepFreeze({
    weaponCatalogId,
    selectedWeaponSlot,
    selectedWeaponId: weapons.find(({ slot }) => slot === selectedWeaponSlot)?.weaponId ?? null,
    weapons,
  });
}

function parseGrenadeSnapshot(value: unknown): {
  readonly eventNamespace: string;
  readonly acceptedThrowCount: number;
} {
  const item = dataRecord(value, 'impulse grenade snapshot');
  exactKeys(item, [
    'schemaVersion', 'playerId', 'abilityId', 'phase', 'readyAtTick', 'cooldownEndsAtTick',
    'currentCharges', 'maximumCharges', 'acceptedThrowCount', 'eventNamespace', 'lastProcessedAuthorityTick',
    'lastProcessedAuthorityInputSequence',
  ], 'impulse grenade snapshot');
  literal(item.schemaVersion, 1, 'impulse grenade schema');
  stableId(item.playerId, 'impulse grenade player');
  stableId(item.abilityId, 'impulse grenade ability');
  stringValue(item.phase, 'impulse grenade phase');
  integer(item.readyAtTick, 0, MAX_AUTHORITY_TICK, 'impulse grenade ready tick');
  integer(item.cooldownEndsAtTick, 0, MAX_AUTHORITY_TICK, 'impulse grenade cooldown end');
  integer(item.currentCharges, 0, 2, 'impulse grenade current charges');
  literal(item.maximumCharges, 2, 'impulse grenade maximum charges');
  return Object.freeze({
    eventNamespace: stableId(item.eventNamespace, 'impulse grenade event namespace'),
    acceptedThrowCount: integer(item.acceptedThrowCount, 0, 1_000_000, 'accepted throw count'),
  });
}

function parseAbilityResources(
  value: unknown,
  serverTick: number,
): {
  readonly selectedWeaponSlot: number;
  readonly impulseGrenade: CombatPresentationAbilityViewV1;
  readonly teleport: CombatPresentationAbilityViewV1;
} {
  const item = dataRecord(value, 'ability resource snapshot');
  exactKeys(item, [
    'schemaVersion', 'authorityTick', 'playerId', 'movementProfile', 'loadout', 'equipped',
    'primaryWeapon', 'damageAbilityOne', 'damageAbilityTwo', 'utilityAbility', 'locks',
  ], 'ability resource snapshot');
  literal(item.schemaVersion, 1, 'ability resource schema');
  integer(item.authorityTick, 0, MAX_AUTHORITY_TICK, 'ability resource tick');
  stableId(item.playerId, 'ability resource player');
  const equipped = dataRecord(item.equipped, 'equipped resources');
  const grenade = dataRecord(item.damageAbilityOne, 'grenade resources');
  const teleport = dataRecord(item.utilityAbility, 'teleport resources');
  const movementProfile = dataRecord(item.movementProfile, 'ability movement profile');
  const loadout = dataRecord(item.loadout, 'ability loadout');
  const primaryWeapon = dataRecord(item.primaryWeapon, 'primary weapon resources');
  const deployable = dataRecord(item.damageAbilityTwo, 'deployable resources');
  const locks = dataRecord(item.locks, 'ability resource locks');
  exactKeys(movementProfile, ['id', 'revision', 'hash'], 'ability movement profile');
  exactKeys(loadout, [
    'primaryWeaponId', 'damageAbilityIds', 'utilityAbilityId', 'ammoAbilityEnabled',
  ], 'ability loadout');
  exactKeys(equipped, ['selectedWeaponSlot', 'primaryWeaponEquipped'], 'equipped resources');
  exactKeys(primaryWeapon, [
    'phase', 'magazineRounds', 'reserveRounds', 'nextShotAtTick', 'reloadCompletesAtTick',
  ], 'primary weapon resources');
  exactKeys(grenade, [
    'abilityId', 'phase', 'readyTicksRemaining', 'cooldownTicksRemaining',
    'currentCharges', 'maximumCharges', 'activeProjectileCount',
    'maximumActiveProjectileCount', 'resourcePolicy',
  ], 'grenade resources');
  exactKeys(deployable, ['abilityId', 'status'], 'deployable resources');
  exactKeys(teleport, [
    'abilityId', 'phase', 'cooldownTicksRemaining', 'maximumRangeMillimeters',
    'resourcePolicy', 'destinationAuthority', 'weaponRecoveryTicks',
  ], 'teleport resources');
  exactKeys(locks, ['dead', 'sprinting', 'sliding'], 'ability resource locks');
  stableId(movementProfile.id, 'ability movement profile id');
  integer(movementProfile.revision, 1, 1_000_000, 'ability movement profile revision');
  stableId(movementProfile.hash, 'ability movement profile hash');
  stableId(loadout.primaryWeaponId, 'loadout primary weapon');
  const damageAbilityIds = stableIdArray(loadout.damageAbilityIds, 'loadout damage abilities');
  if (damageAbilityIds.length !== 2) throw new RangeError('loadout requires exactly two damage abilities');
  stableId(loadout.utilityAbilityId, 'loadout utility ability');
  bool(loadout.ammoAbilityEnabled, 'loadout ammo ability enabled');
  bool(equipped.primaryWeaponEquipped, 'primary weapon equipped');
  stringValue(primaryWeapon.phase, 'primary weapon resource phase');
  integer(primaryWeapon.magazineRounds, 0, 1_000_000, 'resource magazine rounds');
  integer(primaryWeapon.reserveRounds, 0, 1_000_000, 'resource reserve rounds');
  integer(primaryWeapon.nextShotAtTick, 0, MAX_AUTHORITY_TICK, 'resource next shot tick');
  optionalInteger(primaryWeapon.reloadCompletesAtTick, 0, MAX_AUTHORITY_TICK, 'resource reload end');
  integer(grenade.readyTicksRemaining, 0, 100_000, 'grenade ready ticks');
  const grenadeCurrentCharges = integer(
    grenade.currentCharges,
    0,
    2,
    'grenade current charges',
  );
  const grenadeMaximumCharges = integer(
    grenade.maximumCharges,
    2,
    2,
    'grenade maximum charges',
  );
  if (grenadeCurrentCharges > grenadeMaximumCharges) {
    throw new RangeError('grenade current charges exceed maximum charges');
  }
  integer(grenade.maximumActiveProjectileCount, 0, 1_000, 'maximum grenade projectiles');
  stringValue(grenade.resourcePolicy, 'grenade resource policy');
  stableId(deployable.abilityId, 'deployable ability id');
  stringValue(deployable.status, 'deployable status');
  integer(teleport.maximumRangeMillimeters, 0, 1_000_000, 'teleport range');
  stringValue(teleport.resourcePolicy, 'teleport resource policy');
  stringValue(teleport.destinationAuthority, 'teleport destination authority');
  integer(teleport.weaponRecoveryTicks, 0, 100_000, 'teleport weapon recovery');
  bool(locks.dead, 'dead resource lock');
  bool(locks.sprinting, 'sprinting resource lock');
  bool(locks.sliding, 'sliding resource lock');
  const grenadeCooldown = integer(grenade.cooldownTicksRemaining, 0, 100_000, 'grenade cooldown');
  const teleportCooldown = integer(teleport.cooldownTicksRemaining, 0, 100_000, 'teleport cooldown');
  return deepFreeze({
    selectedWeaponSlot: integer(equipped.selectedWeaponSlot, 0, 63, 'selected weapon slot'),
    impulseGrenade: {
      abilityId: stableId(grenade.abilityId, 'grenade ability id'),
      phase: stringValue(grenade.phase, 'grenade phase'),
      cooldownEndsAtTick: serverTick + grenadeCooldown,
      cooldownTicksRemaining: grenadeCooldown,
      activeProjectileCount: integer(
        grenade.activeProjectileCount,
        0,
        1_000,
        'active grenade projectile count',
      ),
    },
    teleport: {
      abilityId: stableId(teleport.abilityId, 'teleport ability id'),
      phase: stringValue(teleport.phase, 'teleport phase'),
      cooldownEndsAtTick: serverTick + teleportCooldown,
      cooldownTicksRemaining: teleportCooldown,
      activeProjectileCount: null,
    },
  });
}

function parseTeamScores(value: unknown, label: string): readonly CombatPresentationTeamScoreV1[] {
  return Object.freeze(array(value, 64, label).map((entry, index) => {
    const item = dataRecord(entry, `${label} ${index}`);
    exactKeys(item, ['teamId', 'score'], `${label} ${index}`);
    return Object.freeze({
      teamId: stableId(item.teamId, `${label} team`),
      score: integer(item.score, 0, 1_000_000, `${label} score`),
    });
  }));
}

function parsePlayerScores(value: unknown): readonly CombatPresentationPlayerScoreV1[] {
  return Object.freeze(array(value, 64, 'player scores').map((entry, index) => {
    const item = dataRecord(entry, `player score ${index}`);
    exactKeys(item, ['playerId', 'teamId', 'kills', 'deaths', 'assists'], `player score ${index}`);
    return Object.freeze({
      playerId: stableId(item.playerId, 'score player'),
      teamId: stableId(item.teamId, 'score player team'),
      kills: integer(item.kills, 0, 1_000_000, 'player kills'),
      deaths: integer(item.deaths, 0, 1_000_000, 'player deaths'),
      assists: integer(item.assists, 0, 1_000_000, 'player assists'),
    });
  }));
}

function feedView(event: ParsedAuthorityEventV1): CombatPresentationFeedEntryV1 {
  return deepFreeze({
    eventId: event.eventId,
    authorityTick: event.authorityTick,
    feedSequence: event.feedSequence as number,
    causeId: event.causeId as string,
    killerPlayerId: event.killerPlayerId as string | null,
    victimPlayerId: event.victimPlayerId as string,
    assistPlayerIds: [...event.assistPlayerIds as readonly string[]],
    scoredTeamId: event.scoredTeamId as string | null,
    teamScoreAfter: event.teamScoreAfter as number | null,
  });
}

function parseMatchSnapshot(value: unknown, serverTick: number): {
  readonly view: CombatPresentationMatchViewV1;
  readonly historicalFeedEvents: readonly RememberedAuthorityEventV1[];
  readonly combatEventSequenceFloor: number;
} {
  const item = dataRecord(value, 'match snapshot');
  exactKeys(item, [
    'schemaVersion', 'matchId', 'rules', 'authorityTick', 'phase', 'phaseStartedAtTick',
    'phaseEndsAtTick', 'phaseTicksRemaining', 'activeTicksRemaining', 'teamScores',
    'playerScores', 'feedSequence', 'feed', 'lastProcessedCombatEventSequence', 'result',
  ], 'match snapshot');
  literal(item.schemaVersion, 1, 'match schema');
  const rules = dataRecord(item.rules, 'match rules');
  exactKeys(rules, [
    'schemaVersion', 'authorityHz', 'mode', 'warmupTicks', 'activeTicks',
    'postmatchTicks', 'teamScoreLimit',
  ], 'match rules');
  literal(rules.schemaVersion, 1, 'match rules schema');
  integer(rules.authorityHz, 1, 1_000, 'match authority rate');
  stringValue(rules.mode, 'match mode');
  integer(rules.warmupTicks, 0, 1_000_000, 'match warmup ticks');
  integer(rules.activeTicks, 1, 10_000_000, 'match active ticks');
  integer(rules.postmatchTicks, 0, 1_000_000, 'match postmatch ticks');
  const parsedFeed = array(item.feed, 1_024, 'match feed').map(parseFeedEvent);
  const feed = parsedFeed.map(feedView);
  const result = item.result === null ? null : dataRecord(item.result, 'match result');
  if (result !== null) {
    exactKeys(result, [
      'kind', 'eventId', 'authorityTick', 'matchId', 'reason', 'winningTeamId', 'draw',
      'teamScores',
    ], 'match result');
    literal(result.kind, 'match_result', 'match result kind');
    stableId(result.eventId, 'match result event id');
    integer(result.authorityTick, 0, MAX_AUTHORITY_TICK, 'match result tick');
    stableId(result.matchId, 'match result match id');
    stringValue(result.reason, 'match result reason');
    nullableStableId(result.winningTeamId, 'match result winner');
    bool(result.draw, 'match result draw');
    parseTeamScores(result.teamScores, 'match result team scores');
  }
  const phaseEndsAtTick = optionalInteger(item.phaseEndsAtTick, 0, MAX_AUTHORITY_TICK, 'match phase end');
  return deepFreeze({
    view: {
      matchId: stableId(item.matchId, 'match id'),
      phase: stringValue(item.phase, 'match phase'),
      phaseEndsAtTick,
      phaseTicksRemaining: phaseEndsAtTick === null ? null : Math.max(0, phaseEndsAtTick - serverTick),
      activeTicksRemaining: integer(item.activeTicksRemaining, 0, 10_000_000, 'active ticks remaining'),
      teamScoreLimit: integer(rules.teamScoreLimit, 1, 1_000_000, 'team score limit'),
      teamScores: parseTeamScores(item.teamScores, 'match team scores'),
      playerScores: parsePlayerScores(item.playerScores),
      feedSequence: integer(item.feedSequence, 0, 1_000_000, 'feed sequence'),
      feed,
      result: result === null
        ? null
        : {
            reason: result.reason as string,
            winningTeamId: result.winningTeamId as string | null,
            draw: result.draw as boolean,
          },
    },
    historicalFeedEvents: parsedFeed.map((entry) => ({
      eventId: entry.eventId,
      kind: entry.kind,
      canonicalPayload: JSON.stringify(entry),
    })),
    combatEventSequenceFloor: integer(
      item.lastProcessedCombatEventSequence,
      -1,
      1_000_000,
      'match combat event sequence floor',
    ),
  });
}

function parseProjectileSnapshot(value: unknown): CombatPresentationProjectileViewV1 {
  const item = dataRecord(value, 'projectile snapshot');
  exactKeys(item, [
    'schemaVersion', 'projectileId', 'ownerPlayerId', 'ownerTeamId', 'abilityId', 'phase',
    'spawnTick', 'lastProcessedAuthorityTick', 'lifetimeEndsAtTick', 'fuseStartedAtTick',
    'detonatesAtTick', 'positionMillimeters', 'velocityMillimetersPerSecond',
    'accelerationMillimetersPerSecondSquared', 'positionIntegrationRemainder',
    'velocityIntegrationRemainder', 'radiusMillimeters', 'bounceCount', 'settled', 'seed',
  ], 'projectile snapshot');
  literal(item.schemaVersion, 1, 'projectile schema');
  return deepFreeze({
    projectileId: stableId(item.projectileId, 'projectile id'),
    ownerPlayerId: stableId(item.ownerPlayerId, 'projectile owner'),
    phase: stringValue(item.phase, 'projectile phase'),
    positionMillimeters: vector3(item.positionMillimeters, 'projectile position'),
    detonatesAtTick: optionalInteger(item.detonatesAtTick, 0, MAX_AUTHORITY_TICK, 'projectile detonation tick'),
  });
}

function parseWeaponProjectileSnapshot(value: unknown): CombatPresentationProjectileViewV1 {
  const item = dataRecord(value, 'weapon projectile snapshot');
  exactKeys(item, [
    'schemaVersion', 'projectileId', 'ownerPlayerId', 'ownerTeamId', 'weaponId',
    'spawnTick', 'lastProcessedAuthorityTick', 'expiresAtTick', 'positionMillimeters',
    'velocityMillimetersPerSecond', 'radiusMillimeters', 'splashRadiusMillimeters',
    'referenceDamagePoints', 'phase',
  ], 'weapon projectile snapshot');
  literal(item.schemaVersion, 1, 'weapon projectile schema');
  return deepFreeze({
    projectileId: stableId(item.projectileId, 'weapon projectile id'),
    ownerPlayerId: stableId(item.ownerPlayerId, 'weapon projectile owner'),
    weaponId: stableId(item.weaponId, 'weapon projectile weapon id'),
    phase: stringValue(item.phase, 'weapon projectile phase'),
    positionMillimeters: vector3(item.positionMillimeters, 'weapon projectile position'),
    velocityMillimetersPerSecond: vector3(
      item.velocityMillimetersPerSecond,
      'weapon projectile velocity',
    ),
    detonatesAtTick: integer(
      item.expiresAtTick,
      0,
      MAX_AUTHORITY_TICK,
      'weapon projectile expiry tick',
    ),
  });
}

const SNAPSHOT_IDENTITY_KEYS = [
  'roomId', 'matchId', 'rulesetId', 'rulesetRevision', 'rulesetHash', 'mapId',
  'fixtureId', 'fixtureHash', 'physicsAdapterId', 'physicsAdapterVersion',
  'movementProfileId', 'movementProfileRevision', 'movementProfileHash',
] as const;

const MOVEMENT_IDENTITY_KEYS = [
  'rulesetId', 'rulesetRevision', 'rulesetHash', 'movementProfileId',
  'movementProfileRevision', 'movementProfileHash', 'fixtureId', 'fixtureHash',
  'physicsAdapterId', 'physicsAdapterVersion',
] as const;

function parseSnapshotIdentity(value: unknown): CombatPresentationAuthorityIdentityV1 {
  const identity = dataRecord(value, 'authority snapshot identity');
  exactKeys(identity, SNAPSHOT_IDENTITY_KEYS, 'authority snapshot identity');
  return deepFreeze({
    roomId: stableId(identity.roomId, 'snapshot room id'),
    matchId: stableId(identity.matchId, 'snapshot match id'),
    rulesetId: stableId(identity.rulesetId, 'snapshot ruleset id'),
    rulesetRevision: integer(identity.rulesetRevision, 0, 0xffff_ffff, 'snapshot ruleset revision'),
    rulesetHash: stableHash(identity.rulesetHash, 'snapshot ruleset hash'),
    mapId: stableId(identity.mapId, 'snapshot map id'),
    fixtureId: stableId(identity.fixtureId, 'snapshot fixture id'),
    fixtureHash: stableHash(identity.fixtureHash, 'snapshot fixture hash'),
    physicsAdapterId: stableId(identity.physicsAdapterId, 'snapshot physics adapter id'),
    physicsAdapterVersion: stableId(
      identity.physicsAdapterVersion,
      'snapshot physics adapter version',
    ),
    movementProfileId: stableId(identity.movementProfileId, 'snapshot movement profile id'),
    movementProfileRevision: integer(
      identity.movementProfileRevision,
      0,
      0xffff_ffff,
      'snapshot movement profile revision',
    ),
    movementProfileHash: stableHash(identity.movementProfileHash, 'snapshot movement profile hash'),
  });
}

function snapshotIdentitiesEqual(
  left: CombatPresentationAuthorityIdentityV1,
  right: CombatPresentationAuthorityIdentityV1,
): boolean {
  return SNAPSHOT_IDENTITY_KEYS.every((key) => left[key] === right[key]);
}

function validateMovementSnapshotIdentity(
  movementValue: unknown,
  snapshotIdentity: CombatPresentationAuthorityIdentityV1,
  playerId: string,
  serverTick: number,
): void {
  const movement = dataRecord(movementValue, `snapshot player ${playerId} movement`);
  exactKeys(
    movement,
    ['schemaVersion', 'identity', 'simulationRateHz', 'tick', 'player'],
    `snapshot player ${playerId} movement`,
  );
  literal(movement.schemaVersion, 1, `snapshot player ${playerId} movement schema`);
  integer(movement.simulationRateHz, 1, 1_000, `snapshot player ${playerId} movement rate`);
  const movementTick = integer(
    movement.tick,
    0,
    MAX_AUTHORITY_TICK,
    `snapshot player ${playerId} movement tick`,
  );
  if (movementTick !== serverTick) {
    throw new Error('COMBAT_PRESENTATION_SNAPSHOT_MOVEMENT_TICK_MISMATCH');
  }
  dataRecord(movement.player, `snapshot player ${playerId} movement player`);
  const identity = dataRecord(
    movement.identity,
    `snapshot player ${playerId} movement identity`,
  );
  exactKeys(
    identity,
    MOVEMENT_IDENTITY_KEYS,
    `snapshot player ${playerId} movement identity`,
  );
  const parsed = {
    rulesetId: stableId(identity.rulesetId, 'movement ruleset id'),
    rulesetRevision: integer(identity.rulesetRevision, 0, 0xffff_ffff, 'movement ruleset revision'),
    rulesetHash: stableHash(identity.rulesetHash, 'movement ruleset hash'),
    movementProfileId: stableId(identity.movementProfileId, 'movement profile id'),
    movementProfileRevision: integer(
      identity.movementProfileRevision,
      0,
      0xffff_ffff,
      'movement profile revision',
    ),
    movementProfileHash: stableHash(identity.movementProfileHash, 'movement profile hash'),
    fixtureId: stableId(identity.fixtureId, 'movement fixture id'),
    fixtureHash: stableHash(identity.fixtureHash, 'movement fixture hash'),
    physicsAdapterId: stableId(identity.physicsAdapterId, 'movement physics adapter id'),
    physicsAdapterVersion: stableId(
      identity.physicsAdapterVersion,
      'movement physics adapter version',
    ),
  } as const;
  if (MOVEMENT_IDENTITY_KEYS.some((key) => parsed[key] !== snapshotIdentity[key])) {
    throw new Error('COMBAT_PRESENTATION_SNAPSHOT_MOVEMENT_IDENTITY_MISMATCH');
  }
}

function parseSnapshot(value: unknown, localPlayerId: string): ParsedSnapshotV1 {
  const item = dataRecord(value, 'authority full snapshot');
  allowedKeys(item, [
    'kind', 'identity', 'serverTick', 'lifecycle', 'phaseEndsAtTick', 'players',
    'impulseGrenadeProjectiles', 'abilityProjectiles', 'abilitySmokeFields',
    'smokeFields', 'weaponProjectiles', 'match',
  ], 'authority full snapshot');
  requireKeys(
    item,
    ['kind', 'identity', 'serverTick', 'lifecycle', 'phaseEndsAtTick', 'players'],
    'authority full snapshot',
  );
  literal(item.kind, 'authority_full_snapshot', 'authority snapshot kind');
  const identity = parseSnapshotIdentity(item.identity);
  const serverTick = integer(item.serverTick, 0, MAX_AUTHORITY_TICK, 'snapshot server tick');
  const playerValues = array(item.players, 64, 'snapshot players');
  const playerIds = new Set<string>();
  let localPlayer: CombatPresentationLocalPlayerViewV1 | null = null;
  let hints: PredictionAuthorityHintsV1 = {
    rifleEventNamespace: null,
    acceptedRifleShotCount: 0,
    grenadeEventNamespace: null,
    acceptedGrenadeThrowCount: 0,
  };
  for (const value of playerValues) {
    const player = dataRecord(value, 'authority player snapshot');
    allowedKeys(player, [
      'playerId', 'connected', 'lastProcessedInputSequence', 'movement', 'combat',
    ], 'authority player snapshot');
    requireKeys(
      player,
      ['playerId', 'connected', 'lastProcessedInputSequence', 'movement'],
      'authority player snapshot',
    );
    const playerId = stableId(player.playerId, 'snapshot player id');
    if (playerIds.has(playerId)) throw new Error('COMBAT_PRESENTATION_SNAPSHOT_DUPLICATE_PLAYER_ID');
    playerIds.add(playerId);
    bool(player.connected, 'snapshot player connected');
    integer(player.lastProcessedInputSequence, -1, 0xffff_ffff, 'processed input sequence');
    validateMovementSnapshotIdentity(player.movement, identity, playerId, serverTick);
    if (playerId !== localPlayerId || player.combat === undefined) continue;
    const combat = dataRecord(player.combat, 'player combat snapshot');
    allowedKeys(
      combat,
      [
        'life', 'autoRifle', 'armory', 'impulseGrenade', 'abilityResources',
        'abilityLoadout', 'flashImpairedUntilTick',
      ],
      'player combat snapshot',
    );
    requireKeys(combat, ['life', 'autoRifle'], 'player combat snapshot');
    const life = parseLife(combat.life);
    const rifle = parseRifleSnapshot(combat.autoRifle);
    const armory = combat.armory === undefined
      ? null
      : parseAuthorityArmorySnapshot(combat.armory, playerId);
    const grenade = combat.impulseGrenade === undefined ? null : parseGrenadeSnapshot(combat.impulseGrenade);
    const resources = combat.abilityResources === undefined
      ? null
      : parseAbilityResources(combat.abilityResources, serverTick);
    localPlayer = deepFreeze({
      playerId,
      connected: player.connected as boolean,
      selectedWeaponSlot: armory?.selectedWeaponSlot ?? resources?.selectedWeaponSlot ?? 0,
      ...(armory === null
        ? {}
        : {
            weaponCatalogId: armory.weaponCatalogId,
            selectedWeaponId: armory.selectedWeaponId,
            weapons: armory.weapons,
          }),
      life,
      rifle: rifle.view,
      impulseGrenade: resources?.impulseGrenade ?? null,
      teleport: resources?.teleport ?? null,
    });
    hints = Object.freeze({
      rifleEventNamespace: rifle.eventNamespace,
      acceptedRifleShotCount: rifle.acceptedShotCount,
      grenadeEventNamespace: grenade?.eventNamespace ?? null,
      acceptedGrenadeThrowCount: grenade?.acceptedThrowCount ?? 0,
    });
  }
  const match = item.match === undefined ? null : parseMatchSnapshot(item.match, serverTick);
  const projectiles = Object.freeze([
    ...array(
    item.impulseGrenadeProjectiles ?? [],
    256,
    'snapshot projectiles',
    ).map(parseProjectileSnapshot),
    ...array(
      item.weaponProjectiles ?? [],
      256,
      'snapshot weapon projectiles',
    ).map(parseWeaponProjectileSnapshot),
  ].sort((left, right) => left.projectileId.localeCompare(right.projectileId)));
  return deepFreeze({
    identity,
    roomId: identity.roomId,
    matchId: identity.matchId,
    serverTick,
    lifecycle: stringValue(item.lifecycle, 'snapshot lifecycle'),
    localPlayer,
    match: match?.view ?? null,
    projectiles,
    hints,
    historicalFeedEvents: match?.historicalFeedEvents ?? [],
    combatEventSequenceFloor: match?.combatEventSequenceFloor ?? -1,
  });
}

function snapshotIntent(view: CombatPresentationViewModelV1): CombatPresentationIntentV1 {
  return intent(
    `snapshot.${view.roomId}.${view.matchId}.${view.serverTick}`,
    'snapshot',
    COMBAT_PRESENTATION_MARKERS_V1.snapshotHudSync,
    {
      authorityTick: view.serverTick,
      subjectPlayerId: view.localPlayer?.playerId ?? null,
      data: {
        lifecycle: view.lifecycle,
        selectedWeaponSlot: view.localPlayer?.selectedWeaponSlot ?? null,
        weaponCatalogId: view.localPlayer?.weaponCatalogId ?? null,
        selectedWeaponId: view.localPlayer?.selectedWeaponId ?? null,
        weapons: view.localPlayer?.weapons ?? [],
        magazineRounds: view.localPlayer?.rifle.magazineRounds ?? null,
        reserveRounds: view.localPlayer?.rifle.reserveRounds ?? null,
        riflePhase: view.localPlayer?.rifle.phase ?? null,
        grenadeCooldownTicksRemaining:
          view.localPlayer?.impulseGrenade?.cooldownTicksRemaining ?? null,
        teleportCooldownTicksRemaining: view.localPlayer?.teleport?.cooldownTicksRemaining ?? null,
        matchPhase: view.match?.phase ?? null,
        phaseTicksRemaining: view.match?.phaseTicksRemaining ?? null,
        teamScores: view.match?.teamScores ?? [],
        feed: view.match?.feed ?? [],
      },
    },
  );
}

export function applyCombatPresentationSnapshot(
  adapter: CombatPresentationAdapterV1,
  snapshotValue: unknown,
): CombatPresentationStepResultV1 {
  const snapshot = parseSnapshot(snapshotValue, adapter.localPlayerId);
  if (adapter.view !== null) {
    if (!snapshotIdentitiesEqual(adapter.view.identity, snapshot.identity)) {
      throw new Error('COMBAT_PRESENTATION_SNAPSHOT_IDENTITY_MISMATCH');
    }
    if (snapshot.serverTick < adapter.lastServerTick) {
      return deepFreeze({ adapter, intents: [], status: 'stale_snapshot' as const });
    }
  }
  const view: CombatPresentationViewModelV1 = deepFreeze({
    schemaVersion: 1,
    markerContractId: COMBAT_PRESENTATION_MARKER_CONTRACT_ID,
    identity: snapshot.identity,
    roomId: snapshot.roomId,
    matchId: snapshot.matchId,
    serverTick: snapshot.serverTick,
    lifecycle: snapshot.lifecycle,
    localPlayer: snapshot.localPlayer,
    match: snapshot.match,
    projectiles: snapshot.projectiles,
  });
  const superseded = adapter.pendingPredictions.filter((entry) => (
    entry.predictedAtServerTick <= snapshot.serverTick
  ));
  const retained = adapter.pendingPredictions.filter((entry) => (
    entry.predictedAtServerTick > snapshot.serverTick
  ));
  let resolved = adapter.resolvedClientCommandIds;
  const cancellationIntents = superseded.map((entry) => {
    resolved = boundedAppend(resolved, entry.clientCommandId, adapter.maximumRememberedCommands);
    return intent(
      `prediction.${entry.clientCommandId}.snapshot_superseded`,
      'cancelled',
      cancellationMarker(entry.kind),
      {
        authorityTick: snapshot.serverTick,
        clientCommandId: entry.clientCommandId,
        subjectPlayerId: adapter.localPlayerId,
        data: { kind: entry.kind, reason: 'snapshot_superseded' },
      },
    );
  });
  let remembered = adapter.rememberedAuthorityEvents;
  for (const event of snapshot.historicalFeedEvents) {
    if (!remembered.some((entry) => entry.eventId === event.eventId)) {
      remembered = boundedAppend(remembered, event, adapter.maximumRememberedAuthorityEvents);
    }
  }
  const projectileIntents = snapshot.projectiles.map((projectile) => intent(
    `snapshot.${snapshot.serverTick}.${projectile.projectileId}`,
    'snapshot',
    COMBAT_PRESENTATION_MARKERS_V1.projectileSnapshotSync,
    {
      authorityTick: snapshot.serverTick,
      subjectPlayerId: projectile.ownerPlayerId,
      data: { ...projectile },
    },
  ));
  const next = freezeAdapter(adapter, {
    view,
    runtimeIdentity: snapshot.identity,
    pendingPredictions: Object.freeze(retained),
    resolvedClientCommandIds: Object.freeze(resolved),
    rememberedAuthorityEvents: remembered,
    lastServerTick: snapshot.serverTick,
    lastSnapshotServerTick: snapshot.serverTick,
    snapshotCombatEventSequenceFloor: snapshot.combatEventSequenceFloor,
    lastAuthorityEventTick: Math.max(adapter.lastAuthorityEventTick, snapshot.serverTick),
    authorityHints: snapshot.hints,
    metrics: updateMetrics(adapter.metrics, {
      fullSnapshotResyncs: 1,
      cancelledPredictions: superseded.length,
    }),
  });
  return deepFreeze({
    adapter: next,
    intents: [snapshotIntent(view), ...projectileIntents, ...cancellationIntents],
    status: 'snapshot_applied' as const,
  });
}

function parseWireHydration(value: unknown): CombatPresentationWireHydrationV1 {
  const item = dataRecord(value, 'combat presentation wire hydration');
  exactKeys(item, [
    'schemaVersion', 'identity', 'serverTick', 'lifecycle',
    'reliableEventBaselineSequence', 'localPlayer', 'match',
  ], 'combat presentation wire hydration');
  literal(item.schemaVersion, 1, 'combat presentation wire hydration schema');
  const identity = parseSnapshotIdentity(item.identity);
  const serverTick = integer(
    item.serverTick,
    0,
    MAX_AUTHORITY_TICK,
    'combat presentation wire hydration tick',
  );
  const reliableEventBaselineSequence = integer(
    item.reliableEventBaselineSequence,
    0,
    0xffff_ffff,
    'combat presentation wire baseline sequence',
  );
  const localPlayer = item.localPlayer === null
    ? null
    : (() => {
        const player = dataRecord(item.localPlayer, 'combat presentation wire local player');
        const armoryKeys = [
          'weaponCatalogId', 'selectedWeaponSlot', 'selectedWeaponId', 'weapons',
        ];
        const hasArmory = armoryKeys.some((key) => Object.hasOwn(player, key));
        if (hasArmory && armoryKeys.some((key) => !Object.hasOwn(player, key))) {
          throw new TypeError('combat presentation wire armory projection is incomplete');
        }
        exactKeys(player, [
          'playerId', 'lifePhase', 'healthPoints', 'shieldPoints', 'riflePhase',
          'magazineRounds', 'reserveRounds', 'grenadePhase', 'grenadeCooldownEndsAtTick',
          'activeProjectileCount', 'teleportCooldownTicksRemaining',
          ...(hasArmory ? armoryKeys : []),
        ], 'combat presentation wire local player');
        if (player.lifePhase !== 'alive' && player.lifePhase !== 'dead') {
          throw new RangeError('combat presentation wire life phase is unsupported');
        }
        const weaponValues = hasArmory
          ? array(player.weapons, 8, 'wire armory weapons')
          : [];
        if (hasArmory && weaponValues.length !== 6) {
          throw new RangeError('wire armory must contain all six original weapon profiles');
        }
        const seenWeaponIds = new Set<string>();
        const seenWeaponSlots = new Set<number>();
        const weapons = hasArmory
          ? weaponValues.map((weaponValue) => {
              const weapon = dataRecord(weaponValue, 'wire armory weapon');
              exactKeys(weapon, [
                'weaponId', 'slot', 'family', 'attackModel', 'phase', 'magazineRounds',
                'reserveRounds', 'readyAtTick', 'reloadCompletesAtTick', 'nextAttackAtTick',
                'acceptedAttackCount',
              ], 'wire armory weapon');
              const weaponId = stableId(weapon.weaponId, 'wire weapon id');
              const profile = clientWeaponProfile(weaponId);
              const slot = integer(weapon.slot, 0, 7, 'wire weapon slot');
              const family = stableId(weapon.family, 'wire weapon family');
              const attackModel = stableId(weapon.attackModel, 'wire weapon attack model');
              if (
                slot !== profile.slot
                || family !== profile.family
                || attackModel !== profile.attackModel
              ) throw new RangeError('wire weapon does not match its authoritative profile');
              if (seenWeaponIds.has(weaponId) || seenWeaponSlots.has(slot)) {
                throw new Error('COMBAT_PRESENTATION_WIRE_DUPLICATE_WEAPON');
              }
              seenWeaponIds.add(weaponId);
              seenWeaponSlots.add(slot);
              const phase = stableId(weapon.phase, 'wire weapon phase');
              if (![
                'holstered', 'equipping', 'ready', 'recovering', 'reloading', 'empty', 'dead',
              ].includes(phase)) throw new RangeError('wire weapon phase is unsupported');
              return deepFreeze({
                weaponId,
                slot,
                family,
                attackModel,
                phase,
                magazineRounds: weapon.magazineRounds === null
                  ? null
                  : integer(weapon.magazineRounds, 0, 1_000_000, 'wire weapon magazine'),
                reserveRounds: weapon.reserveRounds === null
                  ? null
                  : integer(weapon.reserveRounds, 0, 1_000_000, 'wire weapon reserve'),
                readyAtTick: optionalInteger(
                  weapon.readyAtTick,
                  0,
                  MAX_AUTHORITY_TICK,
                  'wire weapon ready tick',
                ),
                reloadCompletesAtTick: optionalInteger(
                  weapon.reloadCompletesAtTick,
                  0,
                  MAX_AUTHORITY_TICK,
                  'wire weapon reload tick',
                ),
                nextAttackAtTick: integer(
                  weapon.nextAttackAtTick,
                  0,
                  MAX_AUTHORITY_TICK,
                  'wire weapon next attack tick',
                ),
                acceptedAttackCount: integer(
                  weapon.acceptedAttackCount,
                  0,
                  1_000_000,
                  'wire weapon accepted attacks',
                ),
              });
            })
          : undefined;
        const selectedWeaponSlot = hasArmory
          ? integer(player.selectedWeaponSlot, 0, 7, 'wire selected weapon slot')
          : undefined;
        const selectedWeaponId = hasArmory
          ? nullableStableId(player.selectedWeaponId, 'wire selected weapon id')
          : undefined;
        if (
          hasArmory
          && selectedWeaponId !== (
            weapons?.find(({ slot }) => slot === selectedWeaponSlot)?.weaponId ?? null
          )
        ) throw new Error('COMBAT_PRESENTATION_WIRE_SELECTED_WEAPON_MISMATCH');
        return deepFreeze({
          playerId: stableId(player.playerId, 'combat presentation wire player id'),
          lifePhase: player.lifePhase as 'alive' | 'dead',
          healthPoints: integer(player.healthPoints, 0, 1_000_000, 'wire health points'),
          shieldPoints: integer(player.shieldPoints, 0, 1_000_000, 'wire shield points'),
          riflePhase: stableId(player.riflePhase, 'wire rifle phase'),
          magazineRounds: integer(player.magazineRounds, 0, 1_000_000, 'wire magazine'),
          reserveRounds: integer(player.reserveRounds, 0, 1_000_000, 'wire reserve'),
          ...(hasArmory
            ? {
                weaponCatalogId: literal(
                  player.weaponCatalogId,
                  'kyx_authoritative_armory_v1',
                  'wire weapon catalog id',
                ),
                selectedWeaponSlot: selectedWeaponSlot as number,
                selectedWeaponId: selectedWeaponId as string | null,
                weapons: Object.freeze(weapons as CombatPresentationWeaponViewV1[]),
              }
            : {}),
          grenadePhase: stableId(player.grenadePhase, 'wire grenade phase'),
          grenadeCooldownEndsAtTick: integer(
            player.grenadeCooldownEndsAtTick,
            0,
            MAX_AUTHORITY_TICK,
            'wire grenade cooldown end',
          ),
          activeProjectileCount: integer(
            player.activeProjectileCount,
            0,
            256,
            'wire active projectile count',
          ),
          teleportCooldownTicksRemaining: integer(
            player.teleportCooldownTicksRemaining,
            0,
            100_000,
            'wire teleport cooldown remaining',
          ),
        });
      })();
  const match = item.match === null
    ? null
    : (() => {
        const value = dataRecord(item.match, 'combat presentation wire match');
        exactKeys(value, [
          'phase', 'activeTicksRemaining', 'teamScores', 'feedSequence',
        ], 'combat presentation wire match');
        return deepFreeze({
          phase: stableId(value.phase, 'combat presentation wire match phase'),
          activeTicksRemaining: integer(
            value.activeTicksRemaining,
            0,
            MAX_AUTHORITY_TICK,
            'wire active ticks remaining',
          ),
          teamScores: parseTeamScores(value.teamScores, 'wire team scores'),
          feedSequence: integer(value.feedSequence, 0, 1_000_000, 'wire feed sequence'),
        });
      })();
  return deepFreeze({
    schemaVersion: 1,
    identity,
    serverTick,
    lifecycle: stableId(item.lifecycle, 'combat presentation wire lifecycle'),
    reliableEventBaselineSequence,
    localPlayer,
    match,
  });
}

/**
 * Hydrates authoritative HUD state from one already schema-validated full wire
 * snapshot. It emits no celebratory hit/kill/teleport effects and pins the
 * reliable-event baseline so reconnect resend cannot replay those effects.
 */
export function applyCombatPresentationWireHydration(
  adapter: CombatPresentationAdapterV1,
  hydrationValue: unknown,
): CombatPresentationStepResultV1 {
  const hydration = parseWireHydration(hydrationValue);
  if (
    adapter.runtimeIdentity !== null
    && !snapshotIdentitiesEqual(adapter.runtimeIdentity, hydration.identity)
  ) throw new Error('COMBAT_PRESENTATION_WIRE_IDENTITY_MISMATCH');
  if (
    hydration.localPlayer !== null
    && hydration.localPlayer.playerId !== adapter.localPlayerId
  ) throw new Error('COMBAT_PRESENTATION_WIRE_LOCAL_PLAYER_MISMATCH');
  if (hydration.serverTick < adapter.lastServerTick) {
    return deepFreeze({ adapter, intents: [], status: 'stale_snapshot' as const });
  }
  const superseded = adapter.pendingPredictions.filter((entry) => (
    entry.predictedAtServerTick <= hydration.serverTick
  ));
  let resolved = adapter.resolvedClientCommandIds;
  const cancellations = superseded.map((entry) => {
    resolved = boundedAppend(resolved, entry.clientCommandId, adapter.maximumRememberedCommands);
    return intent(
      `prediction.${entry.clientCommandId}.wire_snapshot_superseded`,
      'cancelled',
      cancellationMarker(entry.kind),
      {
        authorityTick: hydration.serverTick,
        clientCommandId: entry.clientCommandId,
        subjectPlayerId: adapter.localPlayerId,
        data: { kind: entry.kind, reason: 'snapshot_superseded' },
      },
    );
  });
  const sync = intent(
    `wire_snapshot.${hydration.identity.roomId}.${hydration.identity.matchId}.${hydration.serverTick}`,
    'snapshot',
    COMBAT_PRESENTATION_MARKERS_V1.snapshotHudSync,
    {
      authorityTick: hydration.serverTick,
      subjectPlayerId: hydration.localPlayer?.playerId ?? null,
      data: {
        lifecycle: hydration.lifecycle,
        localPlayer: hydration.localPlayer,
        match: hydration.match,
        reliableEventBaselineSequence: hydration.reliableEventBaselineSequence,
      },
    },
  );
  const next = freezeAdapter(adapter, {
    runtimeIdentity: hydration.identity,
    pendingPredictions: Object.freeze(adapter.pendingPredictions.filter((entry) => (
      entry.predictedAtServerTick > hydration.serverTick
    ))),
    resolvedClientCommandIds: Object.freeze(resolved),
    lastServerTick: hydration.serverTick,
    lastSnapshotServerTick: hydration.serverTick,
    snapshotCombatEventSequenceFloor: hydration.reliableEventBaselineSequence,
    lastAuthorityEventTick: Math.max(adapter.lastAuthorityEventTick, hydration.serverTick),
    metrics: updateMetrics(adapter.metrics, {
      fullSnapshotResyncs: 1,
      cancelledPredictions: superseded.length,
    }),
  });
  return deepFreeze({
    adapter: next,
    intents: [sync, ...cancellations],
    status: 'snapshot_applied' as const,
  });
}

function transportEventSequence(eventId: string): number {
  const match = /^event\.([1-9][0-9]*)$/u.exec(eventId);
  if (match === null) throw new RangeError('wire presentation transport event id is unsupported');
  return integer(Number(match[1]), 1, 0xffff_ffff, 'wire presentation event sequence');
}

function parseWirePresentationEvent(value: unknown): {
  readonly transportId: string;
  readonly transportSequence: number;
  readonly event: ParsedAuthorityEventV1;
} {
  const item = dataRecord(value, 'combat presentation reliable event');
  exactKeys(item, [
    'id', 'serverTick', 'kind', 'subjectId', 'actorId', 'targetId',
    'amountHealthPoints', 'presentation',
  ], 'combat presentation reliable event');
  const transportId = stableId(item.id, 'combat presentation transport event id');
  const serverTick = integer(item.serverTick, 0, MAX_AUTHORITY_TICK, 'wire presentation tick');
  const reliableKind = stableId(item.kind, 'wire presentation reliable kind');
  const subjectId = stableId(item.subjectId, 'wire presentation subject id');
  const actorId = nullableStableId(item.actorId, 'wire presentation actor id');
  const targetId = nullableStableId(item.targetId, 'wire presentation target id');
  const amountHealthPoints = item.amountHealthPoints === null
    ? null
    : integer(item.amountHealthPoints, 0, 1_000_000, 'wire presentation health amount');
  const presentation = dataRecord(item.presentation, 'combat presentation semantic payload');
  if (!Object.hasOwn(presentation, 'schemaVersion')) {
    throw new TypeError('combat presentation semantic payload is missing schemaVersion');
  }
  literal(presentation.schemaVersion, 1, 'combat presentation semantic schema');
  const payload = structuredClone(presentation) as Record<string, unknown>;
  delete payload.schemaVersion;
  const event = payload.kind === 'damage_applied'
    ? parseMatchEvent(payload)
    : typeof payload.kind === 'string' && payload.kind.startsWith('impulse_grenade_')
      ? parseGrenadeEvent(payload)
      : typeof payload.kind === 'string' && payload.kind.startsWith('weapon_')
        ? parseWeaponEvent(payload)
        : parseTeleportEvent(payload);
  if (event.authorityTick !== serverTick) {
    throw new Error('COMBAT_PRESENTATION_WIRE_TICK_MISMATCH');
  }
  if (event.eventId !== subjectId) {
    throw new Error('COMBAT_PRESENTATION_WIRE_EVENT_ID_MISMATCH');
  }
  if (event.kind === 'damage_applied') {
    if (
      reliableKind !== 'damageApplied'
      || actorId !== event.sourcePlayerId
      || targetId !== event.targetPlayerId
      || amountHealthPoints !== event.healthDamagePoints
    ) throw new Error('COMBAT_PRESENTATION_WIRE_DAMAGE_PROJECTION_MISMATCH');
  } else if (event.kind.startsWith('impulse_grenade_')) {
    const expectedProjection = event.kind === 'impulse_grenade_throw_accepted'
      ? {
          kind: 'projectileSpawned',
          actorId: event.playerId,
          targetId: null,
        }
      : event.kind === 'impulse_grenade_collision'
        ? {
            kind: 'projectileCollided',
            actorId: event.ownerPlayerId,
            targetId: event.playerId,
          }
        : event.kind === 'impulse_grenade_detonated'
          ? {
              kind: 'projectileDetonated',
              actorId: event.ownerPlayerId,
              targetId: null,
            }
          : {
              kind: 'impulseApplied',
              actorId: event.ownerPlayerId,
              targetId: event.targetPlayerId,
            };
    if (
      reliableKind !== expectedProjection.kind
      || actorId !== expectedProjection.actorId
      || targetId !== expectedProjection.targetId
      || amountHealthPoints !== null
    ) throw new Error('COMBAT_PRESENTATION_WIRE_GRENADE_PROJECTION_MISMATCH');
  } else if (event.kind.startsWith('weapon_')) {
    const expectedProjection = event.kind === 'weapon_attack_accepted'
      ? {
          kind: 'weaponAttackAccepted',
          actorId: event.playerId,
          targetId: null,
        }
      : event.kind === 'weapon_melee_contact'
        ? {
            kind: 'meleeContact',
            actorId: event.playerId,
            targetId: event.targetPlayerId,
          }
        : {
            kind: event.kind === 'weapon_projectile_spawned'
              ? 'projectileSpawned'
              : 'projectileDetonated',
            actorId: event.ownerPlayerId,
            targetId: null,
          };
    if (
      reliableKind !== expectedProjection.kind
      || actorId !== expectedProjection.actorId
      || targetId !== expectedProjection.targetId
      || amountHealthPoints !== null
    ) throw new Error('COMBAT_PRESENTATION_WIRE_WEAPON_PROJECTION_MISMATCH');
  } else {
    const expectedKind = event.kind === 'teleport_resource_confirmed'
      ? 'abilityActivated'
      : 'abilityRejected';
    if (
      reliableKind !== expectedKind
      || actorId !== event.playerId
      || targetId !== null
      || amountHealthPoints !== null
    ) throw new Error('COMBAT_PRESENTATION_WIRE_TELEPORT_PROJECTION_MISMATCH');
  }
  return deepFreeze({
    transportId,
    transportSequence: transportEventSequence(transportId),
    event,
  });
}

/** Apply one explicit presentation payload carried by the reliable wire stream. */
export function applyCombatPresentationReliableEvent(
  adapter: CombatPresentationAdapterV1,
  reliableEventValue: ReliableEvent | unknown,
): CombatPresentationStepResultV1 {
  if (adapter.runtimeIdentity === null) {
    throw new Error('COMBAT_PRESENTATION_WIRE_HYDRATION_REQUIRED');
  }
  const parsed = parseWirePresentationEvent(reliableEventValue);
  const { event } = parsed;
  if (parsed.transportSequence <= adapter.snapshotCombatEventSequenceFloor) {
    return deepFreeze({
      adapter: freezeAdapter(adapter, {
        metrics: updateMetrics(adapter.metrics, { staleAuthorityEvents: 1 }),
      }),
      intents: [],
      status: 'stale_authority_frame' as const,
    });
  }
  const canonical = JSON.stringify(event);
  const remembered = adapter.rememberedAuthorityEvents.find(({ eventId }) => (
    eventId === event.eventId
  ));
  if (remembered !== undefined) {
    if (remembered.kind !== event.kind || remembered.canonicalPayload !== canonical) {
      throw new Error('AUTHORITY_EVENT_ID_HAS_CONFLICTING_PAYLOADS');
    }
    return deepFreeze({
      adapter: freezeAdapter(adapter, {
        metrics: updateMetrics(adapter.metrics, { duplicateAuthorityEvents: 1 }),
      }),
      intents: [],
      status: 'applied' as const,
    });
  }
  if (event.authorityTick < adapter.lastAuthorityEventTick) {
    return deepFreeze({
      adapter: freezeAdapter(adapter, {
        metrics: updateMetrics(adapter.metrics, { staleAuthorityEvents: 1 }),
      }),
      intents: [],
      status: 'stale_authority_frame' as const,
    });
  }
  const intents: CombatPresentationIntentV1[] = [];
  if (event.kind === 'damage_applied') {
    if (event.targetPlayerId === adapter.localPlayerId) {
      intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.damageReceived, {
        subjectPlayerId: event.sourcePlayerId as string | null,
        targetPlayerId: adapter.localPlayerId,
      }));
    }
    if (event.sourcePlayerId === adapter.localPlayerId) {
      const markers = (event.healthPointsAfter as number) === 0
        ? event.hitRegion === 'head'
          ? COMBAT_PRESENTATION_MARKERS_V1.hitHeadKill
          : COMBAT_PRESENTATION_MARKERS_V1.hitKill
        : event.hitRegion === 'head'
          ? COMBAT_PRESENTATION_MARKERS_V1.hitHead
        : (event.shieldDamagePoints as number) > 0
          ? COMBAT_PRESENTATION_MARKERS_V1.hitShield
          : COMBAT_PRESENTATION_MARKERS_V1.hitBody;
      intents.push(eventIntent(event, markers, {
        subjectPlayerId: adapter.localPlayerId,
        targetPlayerId: event.targetPlayerId as string,
      }));
    }
  } else if (event.kind === 'teleport_resource_confirmed') {
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.teleportConfirmed, {
      subjectPlayerId: event.playerId as string,
    }));
  } else if (event.kind === 'impulse_grenade_throw_accepted') {
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.grenadeThrowAccepted, {
      subjectPlayerId: event.playerId as string,
    }));
  } else if (event.kind === 'impulse_grenade_collision') {
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.grenadeCollision, {
      subjectPlayerId: event.ownerPlayerId as string,
      targetPlayerId: event.playerId as string | null,
    }));
  } else if (event.kind === 'impulse_grenade_detonated') {
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.grenadeDetonation, {
      subjectPlayerId: event.ownerPlayerId as string,
    }));
  } else if (event.kind === 'impulse_grenade_impulse_applied') {
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.grenadeImpulse, {
      subjectPlayerId: event.ownerPlayerId as string,
      targetPlayerId: event.targetPlayerId as string,
    }));
  } else if (event.kind === 'weapon_attack_accepted') {
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.weaponAttackAccepted, {
      subjectPlayerId: event.playerId as string,
    }));
  } else if (event.kind === 'weapon_projectile_spawned') {
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.weaponProjectileSpawned, {
      subjectPlayerId: event.ownerPlayerId as string,
    }));
  } else if (event.kind === 'weapon_projectile_detonated') {
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.weaponProjectileDetonation, {
      subjectPlayerId: event.ownerPlayerId as string,
    }));
  } else if (event.kind === 'weapon_melee_contact') {
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.weaponMeleeContact, {
      subjectPlayerId: event.playerId as string,
      targetPlayerId: event.targetPlayerId as string | null,
    }));
  } else {
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.teleportRejected, {
      subjectPlayerId: event.playerId as string,
    }));
  }
  const rejected = event.kind === 'teleport_resource_rejected';
  const next = freezeAdapter(adapter, {
    rememberedAuthorityEvents: boundedAppend(
      adapter.rememberedAuthorityEvents,
      { eventId: event.eventId, kind: event.kind, canonicalPayload: canonical },
      adapter.maximumRememberedAuthorityEvents,
    ),
    lastServerTick: Math.max(adapter.lastServerTick, event.authorityTick),
    lastAuthorityEventTick: event.authorityTick,
    metrics: updateMetrics(adapter.metrics, {
      rejectedAuthorityEvents: rejected ? 1 : 0,
      confirmedAuthorityEvents: rejected ? 0 : 1,
    }),
  });
  return deepFreeze({
    adapter: next,
    intents,
    status: rejected ? 'rejected' as const : 'applied' as const,
  });
}

function advanceViewClock(
  view: CombatPresentationViewModelV1,
  serverTick: number,
  lifecycle: string,
): CombatPresentationViewModelV1 {
  const match = view.match === null ? null : {
    ...view.match,
    phaseTicksRemaining: view.match.phaseEndsAtTick === null
      ? null
      : Math.max(0, view.match.phaseEndsAtTick - serverTick),
    activeTicksRemaining: view.match.phase === 'active'
      ? Math.max(0, view.match.activeTicksRemaining - (serverTick - view.serverTick))
      : view.match.activeTicksRemaining,
  };
  const local = view.localPlayer;
  const localPlayer = local === null ? null : {
    ...local,
    impulseGrenade: local.impulseGrenade === null ? null : {
      ...local.impulseGrenade,
      cooldownTicksRemaining: Math.max(0, local.impulseGrenade.cooldownEndsAtTick - serverTick),
    },
    teleport: local.teleport === null ? null : {
      ...local.teleport,
      cooldownTicksRemaining: Math.max(0, local.teleport.cooldownEndsAtTick - serverTick),
    },
  };
  return deepFreeze({ ...view, serverTick, lifecycle, match, localPlayer });
}

function replaceLocal(
  view: CombatPresentationViewModelV1,
  localPlayer: CombatPresentationLocalPlayerViewV1,
): CombatPresentationViewModelV1 {
  return deepFreeze({ ...view, localPlayer });
}

function eventIntent(
  event: ParsedAuthorityEventV1,
  markers: CombatPresentationMarkerBundleV1,
  options: {
    readonly clientCommandId?: string | null;
    readonly subjectPlayerId?: string | null;
    readonly targetPlayerId?: string | null;
    readonly data?: Readonly<Record<string, unknown>>;
  } = {},
): CombatPresentationIntentV1 {
  return intent(`authority.${event.eventId}`, authorityEventSource(event.kind), markers, {
    authorityTick: event.authorityTick,
    authorityEventId: event.eventId,
    clientCommandId: options.clientCommandId ?? null,
    subjectPlayerId: options.subjectPlayerId ?? null,
    targetPlayerId: options.targetPlayerId ?? null,
    data: options.data ?? event,
  });
}

function authorityEventSource(
  eventKind: string,
): Extract<CombatPresentationSourceV1, 'accepted' | 'rejected' | 'confirmed'> {
  if (eventKind === 'auto_rifle_shot_accepted' || eventKind === 'impulse_grenade_throw_accepted') {
    return 'accepted';
  }
  if (eventKind === 'teleport_resource_rejected') return 'rejected';
  return 'confirmed';
}

function projectAuthorityEvent(
  viewValue: CombatPresentationViewModelV1,
  event: ParsedAuthorityEventV1,
  localPlayerId: string,
  clientCommandId: string | null,
): { readonly view: CombatPresentationViewModelV1; readonly intents: readonly CombatPresentationIntentV1[] } {
  let view = viewValue;
  const intents: CombatPresentationIntentV1[] = [];
  const local = view.localPlayer;
  if (event.kind === 'auto_rifle_shot_accepted') {
    if (local !== null && event.playerId === localPlayerId) {
      view = replaceLocal(view, {
        ...local,
        rifle: {
          ...local.rifle,
          phase: 'firing',
          magazineRounds: event.magazineRoundsAfter as number,
          reserveRounds: event.reserveRoundsAfter as number,
          nextShotAtTick: event.nextShotAtTick as number,
        },
      });
    }
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.rifleFireAccepted, {
      clientCommandId,
      subjectPlayerId: event.playerId as string,
      data: {
        weaponId: event.weaponId,
        shotOrdinal: event.shotOrdinal,
        magazineRoundsAfter: event.magazineRoundsAfter,
        reserveRoundsAfter: event.reserveRoundsAfter,
        nextShotAtTick: event.nextShotAtTick,
        ballistics: event.ballistics,
      },
    }));
  } else if (event.kind === 'auto_rifle_reload_started') {
    if (local !== null && event.playerId === localPlayerId) {
      view = replaceLocal(view, {
        ...local,
        rifle: {
          ...local.rifle,
          phase: 'reloading',
          reloadCompletesAtTick: event.completesAtTick as number,
        },
      });
    }
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.rifleReloadStarted, {
      subjectPlayerId: event.playerId as string,
    }));
  } else if (event.kind === 'auto_rifle_reload_completed') {
    if (local !== null && event.playerId === localPlayerId) {
      view = replaceLocal(view, {
        ...local,
        rifle: {
          ...local.rifle,
          phase: 'ready',
          magazineRounds: event.magazineRoundsAfter as number,
          reserveRounds: event.reserveRoundsAfter as number,
          reloadCompletesAtTick: null,
        },
      });
    }
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.rifleReloadCompleted, {
      subjectPlayerId: event.playerId as string,
    }));
  } else if (event.kind === 'auto_rifle_reload_cancelled') {
    if (local !== null && event.playerId === localPlayerId) {
      view = replaceLocal(view, {
        ...local,
        rifle: { ...local.rifle, phase: 'ready', reloadCompletesAtTick: null },
      });
    }
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.rifleReloadCancelled, {
      subjectPlayerId: event.playerId as string,
    }));
  } else if (event.kind === 'impulse_grenade_throw_accepted') {
    if (local !== null && event.playerId === localPlayerId && local.impulseGrenade !== null) {
      view = replaceLocal(view, {
        ...local,
        impulseGrenade: {
          ...local.impulseGrenade,
          phase: 'cooldown',
          cooldownEndsAtTick: event.cooldownEndsAtTick as number,
          cooldownTicksRemaining: Math.max(0, (event.cooldownEndsAtTick as number) - event.authorityTick),
          activeProjectileCount: (local.impulseGrenade.activeProjectileCount ?? 0) + 1,
        },
      });
    }
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.grenadeThrowAccepted, {
      clientCommandId,
      subjectPlayerId: event.playerId as string,
    }));
  } else if (event.kind === 'impulse_grenade_collision') {
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.grenadeCollision, {
      subjectPlayerId: event.ownerPlayerId as string,
      targetPlayerId: event.playerId as string | null,
    }));
  } else if (event.kind === 'impulse_grenade_detonated') {
    view = deepFreeze({
      ...view,
      projectiles: view.projectiles.filter(({ projectileId }) => projectileId !== event.projectileId),
    });
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.grenadeDetonation, {
      subjectPlayerId: event.ownerPlayerId as string,
    }));
  } else if (event.kind === 'impulse_grenade_impulse_applied') {
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.grenadeImpulse, {
      subjectPlayerId: event.ownerPlayerId as string,
      targetPlayerId: event.targetPlayerId as string,
    }));
  } else if (event.kind === 'teleport_resource_confirmed') {
    if (local !== null && event.playerId === localPlayerId && local.teleport !== null) {
      const remaining = event.cooldownTicksRemaining as number;
      view = replaceLocal(view, {
        ...local,
        teleport: {
          ...local.teleport,
          phase: remaining === 0 ? 'ready' : 'cooldown',
          cooldownEndsAtTick: event.authorityTick + remaining,
          cooldownTicksRemaining: remaining,
        },
      });
    }
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.teleportConfirmed, {
      clientCommandId,
      subjectPlayerId: event.playerId as string,
    }));
  } else if (event.kind === 'teleport_resource_rejected') {
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.teleportRejected, {
      clientCommandId,
      subjectPlayerId: event.playerId as string,
    }));
  } else if (event.kind === 'damage_applied') {
    if (local !== null && event.targetPlayerId === localPlayerId) {
      view = replaceLocal(view, {
        ...local,
        life: {
          ...local.life,
          healthPoints: event.healthPointsAfter as number,
          shieldPoints: event.shieldPointsAfter as number,
          pointValuesFresh: true,
        },
      });
      intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.damageReceived, {
        subjectPlayerId: event.sourcePlayerId as string | null,
        targetPlayerId: localPlayerId,
      }));
    }
    if (event.sourcePlayerId === localPlayerId) {
      const markers = (event.healthPointsAfter as number) === 0
        ? event.hitRegion === 'head'
          ? COMBAT_PRESENTATION_MARKERS_V1.hitHeadKill
          : COMBAT_PRESENTATION_MARKERS_V1.hitKill
        : event.hitRegion === 'head'
          ? COMBAT_PRESENTATION_MARKERS_V1.hitHead
        : (event.shieldDamagePoints as number) > 0
          ? COMBAT_PRESENTATION_MARKERS_V1.hitShield
          : COMBAT_PRESENTATION_MARKERS_V1.hitBody;
      intents.push(eventIntent(event, markers, {
        subjectPlayerId: localPlayerId,
        targetPlayerId: event.targetPlayerId as string,
      }));
    }
  } else if (event.kind === 'death') {
    if (local !== null && event.victimPlayerId === localPlayerId) {
      view = replaceLocal(view, {
        ...local,
        life: {
          ...local.life,
          phase: 'dead',
          healthPoints: 0,
          deathOrdinal: event.deathOrdinal as number,
          respawnEligibleAtTick: event.respawnEligibleAtTick as number,
          pointValuesFresh: true,
        },
      });
    }
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.death, {
      subjectPlayerId: event.killerPlayerId as string | null,
      targetPlayerId: event.victimPlayerId as string,
    }));
  } else if (event.kind === 'respawn') {
    if (local !== null && event.playerId === localPlayerId) {
      view = replaceLocal(view, {
        ...local,
        life: {
          ...local.life,
          phase: 'alive',
          protectedUntilTickExclusive: event.protectedUntilTickExclusive as number,
          respawnEligibleAtTick: null,
          spawnOrdinal: event.spawnOrdinal as number,
          pointValuesFresh: false,
        },
      });
    }
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.respawn, {
      subjectPlayerId: event.playerId as string,
    }));
  } else if (event.kind === 'team_score_changed') {
    if (view.match !== null) {
      const found = view.match.teamScores.some(({ teamId }) => teamId === event.teamId);
      if (!found) throw new Error('COMBAT_PRESENTATION_SCORE_TEAM_NOT_IN_SNAPSHOT');
      view = deepFreeze({
        ...view,
        match: {
          ...view.match,
          teamScoreLimit: event.scoreLimit as number,
          teamScores: view.match.teamScores.map((entry) => (
            entry.teamId === event.teamId ? { ...entry, score: event.scoreAfter as number } : entry
          )),
        },
      });
    }
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.scoreChanged, {
      subjectPlayerId: event.killerPlayerId as string,
      targetPlayerId: event.victimPlayerId as string,
    }));
  } else if (event.kind === 'kill_feed_entry') {
    if (view.match !== null && !view.match.feed.some(({ eventId }) => eventId === event.eventId)) {
      view = deepFreeze({
        ...view,
        match: {
          ...view.match,
          feedSequence: event.feedSequence as number,
          feed: [...view.match.feed, feedView(event)],
        },
      });
    }
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.killFeed, {
      subjectPlayerId: event.killerPlayerId as string | null,
      targetPlayerId: event.victimPlayerId as string,
    }));
  } else if (event.kind === 'match_phase_changed') {
    if (view.match !== null) {
      view = deepFreeze({
        ...view,
        match: {
          ...view.match,
          phase: event.to as string,
          phaseEndsAtTick: event.phaseEndsAtTick as number | null,
          phaseTicksRemaining: event.phaseEndsAtTick === null
            ? null
            : Math.max(0, (event.phaseEndsAtTick as number) - event.authorityTick),
        },
      });
    }
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.matchPhase));
  } else if (event.kind === 'match_result') {
    if (view.match !== null) {
      view = deepFreeze({
        ...view,
        match: {
          ...view.match,
          result: {
            reason: event.reason as string,
            winningTeamId: event.winningTeamId as string | null,
            draw: event.draw as boolean,
          },
        },
      });
    }
    intents.push(eventIntent(event, COMBAT_PRESENTATION_MARKERS_V1.matchResult));
  }
  return deepFreeze({ view, intents });
}

function combatSequenceFromEventId(eventId: string): number | null {
  const match = /^(?:combat\.death\.|combat\.damage\.|combat\.respawn\.)(\d+)$/u.exec(eventId);
  if (match === null) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) ? value : null;
}

const SAME_TICK_SNAPSHOT_REFLECTED_EVENT_KINDS = new Set([
  'auto_rifle_reload_started',
  'auto_rifle_reload_completed',
  'auto_rifle_reload_cancelled',
  'impulse_grenade_collision',
  'impulse_grenade_detonated',
  'impulse_grenade_impulse_applied',
  'teleport_resource_confirmed',
  'teleport_resource_rejected',
]);

function eventIsReflectedBySnapshot(
  adapter: CombatPresentationAdapterV1,
  event: ParsedAuthorityEventV1,
): boolean {
  if (event.authorityTick < adapter.lastSnapshotServerTick) return true;
  if (event.authorityTick > adapter.lastSnapshotServerTick) return false;
  if (SAME_TICK_SNAPSHOT_REFLECTED_EVENT_KINDS.has(event.kind)) return true;
  if (event.kind === 'auto_rifle_shot_accepted') {
    return event.playerId === adapter.localPlayerId
      && (event.shotOrdinal as number) <= adapter.authorityHints.acceptedRifleShotCount;
  }
  if (event.kind === 'impulse_grenade_throw_accepted') {
    return event.playerId === adapter.localPlayerId
      && (event.throwOrdinal as number) <= adapter.authorityHints.acceptedGrenadeThrowCount;
  }
  if (event.kind === 'damage_applied' || event.kind === 'respawn') {
    return (event.eventSequence as number) <= adapter.snapshotCombatEventSequenceFloor;
  }
  if (event.kind === 'death') {
    return (combatSequenceFromEventId(event.eventId) ?? Number.MAX_SAFE_INTEGER)
      <= adapter.snapshotCombatEventSequenceFloor;
  }
  if (event.kind === 'team_score_changed') {
    return (combatSequenceFromEventId(event.combatDeathEventId as string) ?? Number.MAX_SAFE_INTEGER)
      <= adapter.snapshotCombatEventSequenceFloor;
  }
  if (event.kind === 'kill_feed_entry') {
    return adapter.rememberedAuthorityEvents.some(({ eventId }) => eventId === event.eventId);
  }
  if (event.kind === 'match_phase_changed' && adapter.view?.match !== null) {
    return event.to === adapter.view?.match?.phase
      && event.phaseEndsAtTick === adapter.view?.match?.phaseEndsAtTick;
  }
  if (event.kind === 'match_result') return adapter.view?.match?.result !== null;
  return false;
}

export function applyCombatPresentationFrame(
  adapter: CombatPresentationAdapterV1,
  frameValue: unknown,
): CombatPresentationStepResultV1 {
  if (adapter.view === null) throw new Error('COMBAT_PRESENTATION_SNAPSHOT_REQUIRED');
  const frame = parseAuthorityFrame(frameValue);
  if (frame.serverTick <= adapter.lastServerTick) {
    return deepFreeze({
      adapter: freezeAdapter(adapter, {
        metrics: updateMetrics(adapter.metrics, { staleAuthorityFrames: 1 }),
      }),
      intents: [],
      status: 'stale_authority_frame' as const,
    });
  }
  let view = advanceViewClock(adapter.view, frame.serverTick, frame.lifecycle);
  let pending = [...adapter.pendingPredictions];
  let resolved = adapter.resolvedClientCommandIds;
  let remembered = adapter.rememberedAuthorityEvents;
  let lastAuthorityEventTick = adapter.lastAuthorityEventTick;
  let metrics = adapter.metrics;
  const intents: CombatPresentationIntentV1[] = [];
  for (const event of frame.events) {
    if (eventIsReflectedBySnapshot(adapter, event)) {
      metrics = updateMetrics(metrics, { staleAuthorityEvents: 1 });
      continue;
    }
    if (event.authorityTick < lastAuthorityEventTick) {
      metrics = updateMetrics(metrics, { staleAuthorityEvents: 1 });
      continue;
    }
    const rememberedEvent = remembered.find((entry) => entry.eventId === event.eventId);
    if (rememberedEvent !== undefined) {
      if (rememberedEvent.kind !== event.kind) {
        throw new Error('AUTHORITY_EVENT_ID_CHANGED_KIND');
      }
      if (
        rememberedEvent.canonicalPayload !== null
        && rememberedEvent.canonicalPayload !== JSON.stringify(event)
      ) {
        throw new Error('AUTHORITY_EVENT_ID_HAS_CONFLICTING_PAYLOADS');
      }
      metrics = updateMetrics(metrics, { duplicateAuthorityEvents: 1 });
      continue;
    }
    const predictionIndex = pending.findIndex((entry) => (
      entry.expectedAuthorityEventId === event.eventId
    ));
    const prediction = predictionIndex < 0 ? null : pending[predictionIndex] as PendingCombatPredictionV1;
    if (prediction !== null && !kindAcceptsEvent(prediction.kind, event.kind)) {
      throw new Error('PREDICTION_AUTHORITY_EVENT_KIND_MISMATCH');
    }
    if (prediction !== null) {
      pending.splice(predictionIndex, 1);
      resolved = boundedAppend(resolved, prediction.clientCommandId, adapter.maximumRememberedCommands);
      metrics = updateMetrics(metrics, {
        automaticallyReconciledPredictions: 1,
        rejectedPredictions: event.kind === 'teleport_resource_rejected' ? 1 : 0,
      });
    }
    const projected = projectAuthorityEvent(
      view,
      event,
      adapter.localPlayerId,
      prediction?.clientCommandId ?? null,
    );
    view = projected.view;
    intents.push(...projected.intents);
    remembered = boundedAppend(
      remembered,
      { eventId: event.eventId, kind: event.kind, canonicalPayload: JSON.stringify(event) },
      adapter.maximumRememberedAuthorityEvents,
    );
    lastAuthorityEventTick = Math.max(lastAuthorityEventTick, event.authorityTick);
    const eventSource = authorityEventSource(event.kind);
    metrics = updateMetrics(metrics, {
      acceptedAuthorityEvents: eventSource === 'accepted' ? 1 : 0,
      rejectedAuthorityEvents: eventSource === 'rejected' ? 1 : 0,
      confirmedAuthorityEvents: eventSource === 'confirmed' ? 1 : 0,
    });
  }
  const expired = pending.filter((entry) => entry.expiresAtServerTick < frame.serverTick);
  pending = pending.filter((entry) => entry.expiresAtServerTick >= frame.serverTick);
  for (const prediction of expired) {
    resolved = boundedAppend(resolved, prediction.clientCommandId, adapter.maximumRememberedCommands);
    intents.push(intent(
      `prediction.${prediction.clientCommandId}.expired`,
      'cancelled',
      cancellationMarker(prediction.kind),
      {
        authorityTick: frame.serverTick,
        clientCommandId: prediction.clientCommandId,
        subjectPlayerId: adapter.localPlayerId,
        data: { kind: prediction.kind, reason: 'expired' },
      },
    ));
  }
  metrics = updateMetrics(metrics, {
    cancelledPredictions: expired.length,
    expiredPredictions: expired.length,
  });
  const next = freezeAdapter(adapter, {
    view,
    pendingPredictions: Object.freeze(pending),
    resolvedClientCommandIds: Object.freeze(resolved),
    rememberedAuthorityEvents: Object.freeze(remembered),
    lastServerTick: frame.serverTick,
    lastAuthorityEventTick,
    metrics,
  });
  return deepFreeze({ adapter: next, intents, status: 'applied' as const });
}

export function reconcileCombatPrediction(
  adapter: CombatPresentationAdapterV1,
  request: ReconcileCombatPredictionRequestV1,
): CombatPresentationStepResultV1 {
  const item = dataRecord(request, 'combat prediction reconciliation');
  exactKeys(item, ['schemaVersion', 'clientCommandId', 'authorityEventId'], 'combat prediction reconciliation');
  literal(item.schemaVersion, 1, 'combat prediction reconciliation schema');
  const clientCommandId = stableId(item.clientCommandId, 'reconciled client command id');
  const authorityEventId = stableId(item.authorityEventId, 'reconciled authority event id');
  const pendingIndex = adapter.pendingPredictions.findIndex((entry) => (
    entry.clientCommandId === clientCommandId
  ));
  if (pendingIndex < 0) {
    if (adapter.resolvedClientCommandIds.includes(clientCommandId)) {
      return deepFreeze({ adapter, intents: [], status: 'already_resolved' as const });
    }
    throw new Error('COMBAT_PRESENTATION_PREDICTION_NOT_FOUND');
  }
  const event = adapter.rememberedAuthorityEvents.find((entry) => entry.eventId === authorityEventId);
  if (event === undefined) throw new Error('COMBAT_PRESENTATION_AUTHORITY_EVENT_NOT_CONFIRMED');
  const prediction = adapter.pendingPredictions[pendingIndex] as PendingCombatPredictionV1;
  if (!kindAcceptsEvent(prediction.kind, event.kind)) {
    throw new Error('PREDICTION_AUTHORITY_EVENT_KIND_MISMATCH');
  }
  if (
    prediction.expectedAuthorityEventId !== null
    && prediction.expectedAuthorityEventId !== authorityEventId
  ) {
    throw new Error('PREDICTION_AUTHORITY_EVENT_ID_MISMATCH');
  }
  const pending = adapter.pendingPredictions.filter((_, index) => index !== pendingIndex);
  const rejected = event.kind === 'teleport_resource_rejected';
  const next = freezeAdapter(adapter, {
    pendingPredictions: Object.freeze(pending),
    resolvedClientCommandIds: resolvedCommandIds(adapter, clientCommandId),
    metrics: updateMetrics(adapter.metrics, {
      explicitlyReconciledPredictions: 1,
      rejectedPredictions: rejected ? 1 : 0,
    }),
  });
  return rejected
    ? deepFreeze({ adapter: next, intents: [], status: 'rejected' as const })
    : deepFreeze({ adapter: next, intents: [], status: 'reconciled' as const });
}

export function cancelCombatPrediction(
  adapter: CombatPresentationAdapterV1,
  request: CancelCombatPredictionRequestV1,
): CombatPresentationStepResultV1 {
  const item = dataRecord(request, 'combat prediction cancellation');
  exactKeys(item, ['schemaVersion', 'clientCommandId', 'reason'], 'combat prediction cancellation');
  literal(item.schemaVersion, 1, 'combat prediction cancellation schema');
  const clientCommandId = stableId(item.clientCommandId, 'cancelled client command id');
  if (!['authority_rejected', 'expired', 'snapshot_superseded'].includes(item.reason as string)) {
    throw new RangeError('combat prediction cancellation reason is unsupported');
  }
  const pendingIndex = adapter.pendingPredictions.findIndex((entry) => (
    entry.clientCommandId === clientCommandId
  ));
  if (pendingIndex < 0) {
    if (adapter.resolvedClientCommandIds.includes(clientCommandId)) {
      return deepFreeze({ adapter, intents: [], status: 'already_resolved' as const });
    }
    throw new Error('COMBAT_PRESENTATION_PREDICTION_NOT_FOUND');
  }
  const prediction = adapter.pendingPredictions[pendingIndex] as PendingCombatPredictionV1;
  const pending = adapter.pendingPredictions.filter((_, index) => index !== pendingIndex);
  const reason = item.reason as CancelCombatPredictionRequestV1['reason'];
  const rejected = reason === 'authority_rejected';
  const next = freezeAdapter(adapter, {
    pendingPredictions: Object.freeze(pending),
    resolvedClientCommandIds: resolvedCommandIds(adapter, clientCommandId),
    metrics: updateMetrics(adapter.metrics, {
      rejectedPredictions: rejected ? 1 : 0,
      cancelledPredictions: rejected ? 0 : 1,
      expiredPredictions: reason === 'expired' ? 1 : 0,
    }),
  });
  return deepFreeze({
    adapter: next,
    intents: [intent(
      `prediction.${clientCommandId}.${reason}`,
      rejected ? 'rejected' : 'cancelled',
      rejected ? rejectionMarker(prediction.kind) : cancellationMarker(prediction.kind),
      {
        authorityTick: adapter.lastServerTick,
        clientCommandId,
        subjectPlayerId: adapter.localPlayerId,
        data: { kind: prediction.kind, reason },
      },
    )],
    status: rejected ? 'rejected' as const : 'cancelled' as const,
  });
}
