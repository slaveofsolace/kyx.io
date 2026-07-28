import {
  AUTO_RIFLE_RECOIL_PATTERN_ID,
  AUTO_RIFLE_WEAPON_ID,
  G4_AUTO_RIFLE_RULES,
  type AutoRifleShotAcceptedEvent,
} from './autoRifle';
import {
  COMBAT_POSE_HISTORY_AUTHORITY_HZ,
  type CombatHitRegion,
  type CombatHitVolumeBoxV1,
  type CombatVector3Millimeters,
  type TargetPoseHistoryV1,
  type TargetPoseSampleV1,
  assertTargetPoseHistory,
} from './poseHistory';
import {
  assertStrictCombatDataTree,
  deepFreezeCombatValue,
  strictArray,
  strictFiniteNumber,
  strictInteger,
  strictLiteral,
  strictNullableStableId,
  strictRecord,
  strictStableId,
} from './strictCombatData';

export const HITSCAN_MAX_COMPENSATION_TICKS = 4 as const;
export const HITSCAN_MAX_COMPENSATION_MILLISECONDS = 200 as const;
export const HITSCAN_MAX_RECEIPT_AGE_TICKS = 1 as const;

const AUTHORITY_TICK_MILLISECONDS = 50;
const MAX_AUTHORITY_TICK = Number.MAX_SAFE_INTEGER - 32;
const MAX_WORLD_COORDINATE_MILLIMETERS = 2_000_000;
const MAX_SHOOTER_OFFSET_MILLIMETERS = 5_000;
const MAX_RTT_HISTORY_SAMPLES = 16;
const RTT_MEDIAN_WINDOW_SAMPLES = 8;
const MAX_OBSERVED_RTT_MILLISECONDS = 20_000;
const MAX_TARGET_HISTORIES = 64;
const MAX_AIM_YAW_FROM_BODY_MILLI_DEGREES = 90_000;
const MAX_AIM_PITCH_MILLI_DEGREES = 89_000;
const REGION_ORDER: Readonly<Record<CombatHitRegion, number>> = Object.freeze({
  head: 0,
  torso: 1,
  limb: 2,
});

export interface AuthoritativeHitscanRulesV1 {
  readonly schemaVersion: 1;
  readonly authorityHz: 20;
  readonly authorityTickMilliseconds: 50;
  readonly maximumCompensationTicks: 4;
  readonly maximumCompensationMilliseconds: 200;
  readonly maximumReceiptAgeTicks: 1;
  readonly rttMedianWindowSamples: 8;
  readonly maximumRangeMillimeters: 120_000;
  readonly maximumAimYawFromBodyMilliDegrees: 90_000;
  readonly maximumAimPitchMilliDegrees: 89_000;
  readonly friendlyFireEnabled: false;
  readonly headMultiplierPermille: 1_000;
  readonly torsoMultiplierPermille: 1_000;
  readonly limbMultiplierPermille: 1_000;
}

export const G4_AUTHORITATIVE_HITSCAN_RULES: AuthoritativeHitscanRulesV1
  = deepFreezeCombatValue({
    schemaVersion: 1,
    authorityHz: COMBAT_POSE_HISTORY_AUTHORITY_HZ,
    authorityTickMilliseconds: AUTHORITY_TICK_MILLISECONDS,
    maximumCompensationTicks: HITSCAN_MAX_COMPENSATION_TICKS,
    maximumCompensationMilliseconds: HITSCAN_MAX_COMPENSATION_MILLISECONDS,
    maximumReceiptAgeTicks: HITSCAN_MAX_RECEIPT_AGE_TICKS,
    rttMedianWindowSamples: RTT_MEDIAN_WINDOW_SAMPLES,
    maximumRangeMillimeters: G4_AUTO_RIFLE_RULES.rangeMillimeters,
    maximumAimYawFromBodyMilliDegrees: MAX_AIM_YAW_FROM_BODY_MILLI_DEGREES,
    maximumAimPitchMilliDegrees: MAX_AIM_PITCH_MILLI_DEGREES,
    friendlyFireEnabled: false,
    headMultiplierPermille: G4_AUTO_RIFLE_RULES.headMultiplierPermille,
    torsoMultiplierPermille: 1_000,
    limbMultiplierPermille: G4_AUTO_RIFLE_RULES.limbMultiplierPermille,
  });

export interface CurrentShooterPoseV1 {
  readonly schemaVersion: 1;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly teamId: string | null;
  readonly lifePhase: 'alive' | 'dead';
  readonly positionMillimeters: CombatVector3Millimeters;
  readonly bodyYawMilliDegrees: number;
  readonly eyeOffsetMillimeters: CombatVector3Millimeters;
  readonly muzzleOffsetMillimeters: CombatVector3Millimeters;
}

export interface CurrentAcceptedLookV1 {
  readonly schemaVersion: 1;
  readonly acceptedAtAuthorityTick: number;
  readonly yawMilliDegrees: number;
  readonly pitchMilliDegrees: number;
}

export interface ObservedRttSampleV1 {
  readonly schemaVersion: 1;
  readonly observedAtReceiptTick: number;
  readonly roundTripMilliseconds: number;
}

export interface AuthoritativeAutoRifleHitscanRequestV1 {
  readonly schemaVersion: 1;
  readonly currentAuthorityTick: number;
  readonly serverReceiptTick: number;
  readonly shooterPose: CurrentShooterPoseV1;
  readonly acceptedLook: CurrentAcceptedLookV1;
  readonly acceptedShot: AutoRifleShotAcceptedEvent;
  readonly observedRttHistory: readonly ObservedRttSampleV1[];
  readonly targetHistories: readonly TargetPoseHistoryV1[];
}

export interface AuthoritativeWeaponHitscanProfileV1 {
  readonly schemaVersion: 1;
  readonly weaponId: string;
  readonly family: 'rifle' | 'pistol' | 'shotgun' | 'sniper';
  readonly attackModel: 'hitscan' | 'pellet_hitscan';
  readonly referenceDamagePoints: number;
  readonly pelletsPerAttack: number;
  readonly rangeMillimeters: number;
  readonly spreadMilliDegrees: number;
  readonly headMultiplierPermille: number;
  readonly torsoMultiplierPermille: number;
  readonly limbMultiplierPermille: number;
  readonly friendlyFireEnabled: false;
}

export interface AuthoritativeWeaponHitscanAcceptedAttackV1 {
  readonly schemaVersion: 1;
  readonly kind: 'weapon_attack_accepted';
  readonly eventId: string;
  readonly authorityTick: number;
  readonly playerId: string;
  readonly weaponId: string;
  readonly family: 'rifle' | 'pistol' | 'shotgun' | 'sniper';
  readonly attackModel: 'hitscan' | 'pellet_hitscan';
  readonly attackOrdinal: number;
  readonly referenceDamagePoints: number;
  readonly magazineRoundsAfter: number | null;
  readonly reserveRoundsAfter: number | null;
  readonly nextAttackAtTick: number;
  readonly ballistics: readonly Readonly<{
    pelletIndex: number;
    spreadRadiusMilliDegrees: number;
    spreadPitchMilliDegrees: number;
    spreadYawMilliDegrees: number;
  }>[];
}

export interface AuthoritativeWeaponHitscanRequestV1 {
  readonly schemaVersion: 1;
  readonly currentAuthorityTick: number;
  readonly serverReceiptTick: number;
  readonly shooterPose: CurrentShooterPoseV1;
  readonly acceptedLook: CurrentAcceptedLookV1;
  readonly acceptedAttack: AuthoritativeWeaponHitscanAcceptedAttackV1;
  readonly pelletIndex: number;
  readonly observedRttHistory: readonly ObservedRttSampleV1[];
  readonly targetHistories: readonly TargetPoseHistoryV1[];
}

export interface HitscanUnitVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface AuthorityWorldOcclusionRayV1 {
  readonly schemaVersion: 1;
  readonly originMillimeters: CombatVector3Millimeters;
  readonly directionUnit: HitscanUnitVector3;
  readonly maximumDistanceMillimeters: number;
  readonly layer: 'authoritative_world';
  readonly purpose: 'barrel_clearance' | 'shot_path';
}

export interface AuthorityWorldOcclusionHitV1 {
  readonly schemaVersion: 1;
  readonly hit: boolean;
  readonly distanceMillimeters: number | null;
  readonly colliderId: string | null;
}

export type AuthorityWorldOcclusionPort = (
  ray: AuthorityWorldOcclusionRayV1,
) => unknown;

export interface HitscanCompensationDebugV1 {
  readonly schemaVersion: 1;
  readonly currentAuthorityTick: number;
  readonly serverReceiptTick: number;
  readonly observedRttSampleCount: number;
  readonly medianObservedRttMilliseconds: number;
  readonly requestedCompensationTicks: number;
  readonly appliedCompensationTicks: number;
  readonly appliedCompensationMilliseconds: number;
  readonly compensationCapped: boolean;
  readonly targetRewindTick: number | null;
  readonly clientTimestampUsed: false;
}

export interface HitscanAimRayDebugV1 {
  readonly schemaVersion: 1;
  readonly rawAcceptedYawMilliDegrees: number;
  readonly rawAcceptedPitchMilliDegrees: number;
  readonly clampedLookYawMilliDegrees: number;
  readonly clampedLookPitchMilliDegrees: number;
  readonly recoilYawMilliDegrees: number;
  readonly recoilPitchMilliDegrees: number;
  readonly spreadYawMilliDegrees: number;
  readonly spreadPitchMilliDegrees: number;
  readonly finalYawMilliDegrees: number;
  readonly finalPitchMilliDegrees: number;
  readonly aimWasClamped: boolean;
  readonly eyeOriginMillimeters: CombatVector3Millimeters;
  readonly muzzleOriginMillimeters: CombatVector3Millimeters;
  readonly directionUnit: HitscanUnitVector3;
}

export interface HitscanWorldOcclusionDebugV1 {
  readonly schemaVersion: 1;
  readonly queried: true;
  readonly hit: boolean;
  readonly distanceMillimeters: number | null;
  readonly colliderId: string | null;
}

export interface HitscanResolutionDebugV1 {
  readonly schemaVersion: 1;
  readonly compensation: HitscanCompensationDebugV1;
  readonly aimRay: HitscanAimRayDebugV1 | null;
  readonly barrelObstruction: HitscanWorldOcclusionDebugV1 | null;
  readonly worldOcclusion: HitscanWorldOcclusionDebugV1 | null;
  readonly targetHistoryCount: number;
  readonly candidatesWithCurrentPose: number;
  readonly candidatesWithRewoundPose: number;
  readonly filteredSelfCount: number;
  readonly filteredTeamCount: number;
  readonly filteredDeadCount: number;
  readonly missingHistoryCount: number;
  readonly analyticVolumeIntersectionCount: number;
}

export interface AuthoritativeHitscanHitV1 {
  readonly schemaVersion: 1;
  readonly targetPlayerId: string;
  readonly targetTeamId: string | null;
  readonly targetPoseTick: number;
  readonly volumeId: string;
  readonly region: CombatHitRegion;
  readonly distanceMillimeters: number;
  readonly impactPointMillimeters: CombatVector3Millimeters;
  readonly damageMultiplierPermille: number;
  readonly damagePoints: number;
}

export type AuthoritativeHitscanRejectionReason =
  | 'future_receipt_tick'
  | 'stale_receipt_tick'
  | 'accepted_shot_tick_mismatch'
  | 'accepted_shot_player_mismatch'
  | 'shooter_pose_not_current'
  | 'look_not_current'
  | 'shooter_dead'
  | 'rewind_before_tick_zero'
  | 'target_history_unavailable';

export type AuthoritativeHitscanMissReason =
  | 'no_target'
  | 'barrel_obstructed'
  | 'world_occluded';

export type ResolveAuthoritativeHitscanResult =
  | {
      readonly accepted: true;
      readonly outcome: 'hit';
      readonly reason: null;
      readonly hit: AuthoritativeHitscanHitV1;
      readonly debug: HitscanResolutionDebugV1;
    }
  | {
      readonly accepted: true;
      readonly outcome: 'miss';
      readonly reason: AuthoritativeHitscanMissReason;
      readonly hit: null;
      readonly debug: HitscanResolutionDebugV1;
    }
  | {
      readonly accepted: false;
      readonly outcome: 'rejected';
      readonly reason: AuthoritativeHitscanRejectionReason;
      readonly hit: null;
      readonly debug: HitscanResolutionDebugV1;
    };

interface ValidatedRequestFacts {
  readonly rttSamples: readonly ObservedRttSampleV1[];
}

interface HitscanBallisticsAngles {
  readonly recoilPitchMilliDegrees: number;
  readonly recoilYawMilliDegrees: number;
  readonly spreadPitchMilliDegrees: number;
  readonly spreadYawMilliDegrees: number;
}

interface HitscanCoreRequest {
  readonly currentAuthorityTick: number;
  readonly serverReceiptTick: number;
  readonly shooterPose: CurrentShooterPoseV1;
  readonly acceptedLook: CurrentAcceptedLookV1;
  readonly acceptedShot: Readonly<{
    authorityTick: number;
    playerId: string;
    ballistics: HitscanBallisticsAngles;
  }>;
  readonly observedRttHistory: readonly ObservedRttSampleV1[];
  readonly targetHistories: readonly TargetPoseHistoryV1[];
}

interface HitscanCoreProfile {
  readonly rangeMillimeters: number;
  readonly referenceDamagePoints: number;
  readonly headMultiplierPermille: number;
  readonly torsoMultiplierPermille: number;
  readonly limbMultiplierPermille: number;
  readonly friendlyFireEnabled: boolean;
}

interface MutableResolutionCounts {
  candidatesWithCurrentPose: number;
  candidatesWithRewoundPose: number;
  filteredSelfCount: number;
  filteredTeamCount: number;
  filteredDeadCount: number;
  missingHistoryCount: number;
  analyticVolumeIntersectionCount: number;
}

interface TargetIntersection {
  readonly targetPlayerId: string;
  readonly targetTeamId: string | null;
  readonly targetPoseTick: number;
  readonly volumeId: string;
  readonly region: CombatHitRegion;
  readonly distanceMillimeters: number;
}

function vector3Integer(
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): CombatVector3Millimeters {
  const record = strictRecord(value, ['x', 'y', 'z'], label);
  return {
    x: strictInteger(record.x, minimum, maximum, `${label}.x`),
    y: strictInteger(record.y, minimum, maximum, `${label}.y`),
    z: strictInteger(record.z, minimum, maximum, `${label}.z`),
  };
}

function validateShooterPose(value: unknown): void {
  const record = strictRecord(value, [
    'schemaVersion',
    'authorityTick',
    'playerId',
    'teamId',
    'lifePhase',
    'positionMillimeters',
    'bodyYawMilliDegrees',
    'eyeOffsetMillimeters',
    'muzzleOffsetMillimeters',
  ], 'hitscan shooter pose');
  strictLiteral(record.schemaVersion, 1, 'hitscan shooter pose schemaVersion');
  strictInteger(record.authorityTick, 0, MAX_AUTHORITY_TICK, 'hitscan shooter pose tick');
  strictStableId(record.playerId, 'hitscan shooter playerId');
  strictNullableStableId(record.teamId, 'hitscan shooter teamId');
  if (record.lifePhase !== 'alive' && record.lifePhase !== 'dead') {
    throw new RangeError('hitscan shooter lifePhase must be alive or dead');
  }
  vector3Integer(
    record.positionMillimeters,
    -MAX_WORLD_COORDINATE_MILLIMETERS,
    MAX_WORLD_COORDINATE_MILLIMETERS,
    'hitscan shooter position',
  );
  strictInteger(record.bodyYawMilliDegrees, -180_000, 180_000, 'hitscan shooter body yaw');
  vector3Integer(
    record.eyeOffsetMillimeters,
    -MAX_SHOOTER_OFFSET_MILLIMETERS,
    MAX_SHOOTER_OFFSET_MILLIMETERS,
    'hitscan shooter eye offset',
  );
  vector3Integer(
    record.muzzleOffsetMillimeters,
    -MAX_SHOOTER_OFFSET_MILLIMETERS,
    MAX_SHOOTER_OFFSET_MILLIMETERS,
    'hitscan shooter muzzle offset',
  );
}

function validateAcceptedLook(value: unknown): void {
  const record = strictRecord(value, [
    'schemaVersion',
    'acceptedAtAuthorityTick',
    'yawMilliDegrees',
    'pitchMilliDegrees',
  ], 'hitscan accepted look');
  strictLiteral(record.schemaVersion, 1, 'hitscan accepted look schemaVersion');
  strictInteger(
    record.acceptedAtAuthorityTick,
    0,
    MAX_AUTHORITY_TICK,
    'hitscan accepted look tick',
  );
  strictInteger(record.yawMilliDegrees, -180_000, 180_000, 'hitscan accepted look yaw');
  strictInteger(record.pitchMilliDegrees, -90_000, 90_000, 'hitscan accepted look pitch');
}

function validateBallistics(value: unknown): void {
  const record = strictRecord(value, [
    'patternId',
    'patternIndex',
    'recoilPitchMilliDegrees',
    'recoilYawMilliDegrees',
    'spreadRadiusMilliDegrees',
    'spreadPitchMilliDegrees',
    'spreadYawMilliDegrees',
  ], 'accepted Auto Rifle ballistics');
  strictLiteral(record.patternId, AUTO_RIFLE_RECOIL_PATTERN_ID, 'accepted ballistics patternId');
  strictInteger(record.patternIndex, 0, 11, 'accepted ballistics patternIndex');
  strictInteger(record.recoilPitchMilliDegrees, 250, 1_146, 'accepted ballistics recoil pitch');
  strictInteger(record.recoilYawMilliDegrees, -573, 573, 'accepted ballistics recoil yaw');
  const radius = strictInteger(
    record.spreadRadiusMilliDegrees,
    0,
    G4_AUTO_RIFLE_RULES.maximumSpreadMilliDegrees,
    'accepted ballistics spread radius',
  );
  const spreadPitch = strictInteger(
    record.spreadPitchMilliDegrees,
    -radius,
    radius,
    'accepted ballistics spread pitch',
  );
  const spreadYaw = strictInteger(
    record.spreadYawMilliDegrees,
    -radius,
    radius,
    'accepted ballistics spread yaw',
  );
  if (Math.hypot(spreadPitch, spreadYaw) > radius + 2) {
    throw new RangeError('accepted ballistics spread components exceed the declared radius');
  }
}

function validateAcceptedShot(value: unknown): void {
  const record = strictRecord(value, [
    'kind',
    'eventId',
    'authorityTick',
    'playerId',
    'weaponId',
    'shotOrdinal',
    'referenceDamagePoints',
    'magazineRoundsAfter',
    'reserveRoundsAfter',
    'nextShotAtTick',
    'ballistics',
  ], 'accepted Auto Rifle shot');
  strictLiteral(record.kind, 'auto_rifle_shot_accepted', 'accepted shot kind');
  strictStableId(record.eventId, 'accepted shot eventId');
  const shotTick = strictInteger(
    record.authorityTick,
    0,
    MAX_AUTHORITY_TICK,
    'accepted shot authority tick',
  );
  strictStableId(record.playerId, 'accepted shot playerId');
  strictLiteral(record.weaponId, AUTO_RIFLE_WEAPON_ID, 'accepted shot weaponId');
  strictInteger(record.shotOrdinal, 1, Number.MAX_SAFE_INTEGER, 'accepted shot ordinal');
  strictLiteral(record.referenceDamagePoints, 10, 'accepted shot reference damage');
  strictInteger(
    record.magazineRoundsAfter,
    0,
    G4_AUTO_RIFLE_RULES.magazineCapacity - 1,
    'accepted shot magazine rounds',
  );
  strictInteger(
    record.reserveRoundsAfter,
    0,
    G4_AUTO_RIFLE_RULES.reserveCapacity,
    'accepted shot reserve rounds',
  );
  const nextShotTick = strictInteger(
    record.nextShotAtTick,
    0,
    MAX_AUTHORITY_TICK,
    'accepted shot next shot tick',
  );
  if (nextShotTick !== shotTick + G4_AUTO_RIFLE_RULES.shotCooldownTicks) {
    throw new RangeError('accepted shot next shot tick does not match the pinned cadence');
  }
  validateBallistics(record.ballistics);
}

function validateRttHistory(
  value: unknown,
  serverReceiptTick: number,
): readonly ObservedRttSampleV1[] {
  const entries = strictArray(
    value,
    1,
    MAX_RTT_HISTORY_SAMPLES,
    'observed RTT history',
  ).map((entry, index) => {
    const record = strictRecord(entry, [
      'schemaVersion',
      'observedAtReceiptTick',
      'roundTripMilliseconds',
    ], `observed RTT history[${index}]`);
    strictLiteral(record.schemaVersion, 1, `observed RTT history[${index}].schemaVersion`);
    const observedAtReceiptTick = strictInteger(
      record.observedAtReceiptTick,
      0,
      MAX_AUTHORITY_TICK,
      `observed RTT history[${index}].observedAtReceiptTick`,
    );
    if (observedAtReceiptTick > serverReceiptTick) {
      throw new RangeError('observed RTT history must not contain future samples');
    }
    return {
      schemaVersion: 1 as const,
      observedAtReceiptTick,
      roundTripMilliseconds: strictInteger(
        record.roundTripMilliseconds,
        0,
        MAX_OBSERVED_RTT_MILLISECONDS,
        `observed RTT history[${index}].roundTripMilliseconds`,
      ),
    };
  }).sort((left, right) => left.observedAtReceiptTick - right.observedAtReceiptTick);
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1].observedAtReceiptTick === entries[index].observedAtReceiptTick) {
      throw new RangeError(
        `observed RTT history contains duplicate sample tick ${entries[index].observedAtReceiptTick}`,
      );
    }
  }
  return entries;
}

function validateRequest(request: AuthoritativeAutoRifleHitscanRequestV1): ValidatedRequestFacts {
  assertStrictCombatDataTree(request, 'authoritative Auto Rifle hitscan request');
  const record = strictRecord(request, [
    'schemaVersion',
    'currentAuthorityTick',
    'serverReceiptTick',
    'shooterPose',
    'acceptedLook',
    'acceptedShot',
    'observedRttHistory',
    'targetHistories',
  ], 'authoritative Auto Rifle hitscan request');
  strictLiteral(record.schemaVersion, 1, 'authoritative hitscan schemaVersion');
  const currentTick = strictInteger(
    record.currentAuthorityTick,
    0,
    MAX_AUTHORITY_TICK,
    'authoritative hitscan current tick',
  );
  const receiptTick = strictInteger(
    record.serverReceiptTick,
    0,
    MAX_AUTHORITY_TICK,
    'authoritative hitscan server receipt tick',
  );
  validateShooterPose(record.shooterPose);
  validateAcceptedLook(record.acceptedLook);
  validateAcceptedShot(record.acceptedShot);
  const rttSamples = validateRttHistory(record.observedRttHistory, receiptTick);
  validateTargetHistories(record.targetHistories, currentTick);
  return { rttSamples };
}

function validateTargetHistories(value: unknown, currentTick: number): void {
  const histories = strictArray(
    value,
    0,
    MAX_TARGET_HISTORIES,
    'authoritative hitscan target histories',
  );
  const playerIds = new Set<string>();
  histories.forEach((history, index) => {
    assertTargetPoseHistory(
      history as TargetPoseHistoryV1,
      `authoritative hitscan target histories[${index}]`,
    );
    const typedHistory = history as TargetPoseHistoryV1;
    if (playerIds.has(typedHistory.playerId)) {
      throw new RangeError(`duplicate target history for ${typedHistory.playerId}`);
    }
    playerIds.add(typedHistory.playerId);
    if (typedHistory.samples.some((sample) => sample.authorityTick > currentTick)) {
      throw new RangeError(`target history ${typedHistory.playerId} contains a future pose sample`);
    }
  });
}

function validateWeaponHitscanProfile(
  profile: AuthoritativeWeaponHitscanProfileV1,
): HitscanCoreProfile {
  assertStrictCombatDataTree(profile, 'authoritative weapon hitscan profile');
  const record = strictRecord(profile, [
    'schemaVersion',
    'weaponId',
    'family',
    'attackModel',
    'referenceDamagePoints',
    'pelletsPerAttack',
    'rangeMillimeters',
    'spreadMilliDegrees',
    'headMultiplierPermille',
    'torsoMultiplierPermille',
    'limbMultiplierPermille',
    'friendlyFireEnabled',
  ], 'authoritative weapon hitscan profile');
  strictLiteral(record.schemaVersion, 1, 'weapon hitscan profile schemaVersion');
  strictStableId(record.weaponId, 'weapon hitscan profile weaponId');
  if (!['rifle', 'pistol', 'shotgun', 'sniper'].includes(record.family as string)) {
    throw new RangeError('weapon hitscan profile family is unsupported');
  }
  if (record.attackModel !== 'hitscan' && record.attackModel !== 'pellet_hitscan') {
    throw new RangeError('weapon hitscan profile attack model is unsupported');
  }
  const referenceDamagePoints = strictInteger(
    record.referenceDamagePoints,
    1,
    1_000,
    'weapon hitscan reference damage',
  );
  strictInteger(record.pelletsPerAttack, 1, 32, 'weapon hitscan pellet count');
  const rangeMillimeters = strictInteger(
    record.rangeMillimeters,
    1,
    200_000,
    'weapon hitscan range',
  );
  strictInteger(record.spreadMilliDegrees, 0, 20_000, 'weapon hitscan spread');
  const headMultiplierPermille = strictInteger(
    record.headMultiplierPermille,
    1,
    5_000,
    'weapon hitscan head multiplier',
  );
  const torsoMultiplierPermille = strictInteger(
    record.torsoMultiplierPermille,
    1,
    5_000,
    'weapon hitscan torso multiplier',
  );
  const limbMultiplierPermille = strictInteger(
    record.limbMultiplierPermille,
    1,
    5_000,
    'weapon hitscan limb multiplier',
  );
  strictLiteral(record.friendlyFireEnabled, false, 'weapon hitscan friendly fire');
  return {
    rangeMillimeters,
    referenceDamagePoints,
    headMultiplierPermille,
    torsoMultiplierPermille,
    limbMultiplierPermille,
    friendlyFireEnabled: false,
  };
}

function validateWeaponAcceptedAttack(
  value: unknown,
  profile: AuthoritativeWeaponHitscanProfileV1,
): AuthoritativeWeaponHitscanAcceptedAttackV1 {
  const record = strictRecord(value, [
    'schemaVersion',
    'kind',
    'eventId',
    'authorityTick',
    'playerId',
    'weaponId',
    'family',
    'attackModel',
    'attackOrdinal',
    'referenceDamagePoints',
    'magazineRoundsAfter',
    'reserveRoundsAfter',
    'nextAttackAtTick',
    'ballistics',
  ], 'accepted authority weapon attack');
  strictLiteral(record.schemaVersion, 1, 'accepted authority weapon attack schemaVersion');
  strictLiteral(record.kind, 'weapon_attack_accepted', 'accepted authority weapon attack kind');
  strictStableId(record.eventId, 'accepted authority weapon attack eventId');
  const authorityTick = strictInteger(
    record.authorityTick,
    0,
    MAX_AUTHORITY_TICK,
    'accepted authority weapon attack tick',
  );
  strictStableId(record.playerId, 'accepted authority weapon attack playerId');
  strictLiteral(record.weaponId, profile.weaponId, 'accepted authority weapon attack weaponId');
  strictLiteral(record.family, profile.family, 'accepted authority weapon attack family');
  strictLiteral(
    record.attackModel,
    profile.attackModel,
    'accepted authority weapon attack model',
  );
  strictInteger(
    record.attackOrdinal,
    1,
    Number.MAX_SAFE_INTEGER,
    'accepted authority weapon attack ordinal',
  );
  strictLiteral(
    record.referenceDamagePoints,
    profile.referenceDamagePoints,
    'accepted authority weapon attack damage',
  );
  for (const [label, count] of [
    ['magazine', record.magazineRoundsAfter],
    ['reserve', record.reserveRoundsAfter],
  ] as const) {
    if (count !== null) {
      strictInteger(count, 0, 10_000, `accepted authority weapon attack ${label} rounds`);
    }
  }
  strictInteger(
    record.nextAttackAtTick,
    authorityTick,
    MAX_AUTHORITY_TICK,
    'accepted authority weapon next attack tick',
  );
  const ballistics = strictArray(
    record.ballistics,
    profile.pelletsPerAttack,
    profile.pelletsPerAttack,
    'accepted authority weapon ballistics',
  );
  ballistics.forEach((sample, index) => {
    const item = strictRecord(sample, [
      'pelletIndex',
      'spreadRadiusMilliDegrees',
      'spreadPitchMilliDegrees',
      'spreadYawMilliDegrees',
    ], `accepted authority weapon ballistics[${index}]`);
    strictLiteral(item.pelletIndex, index, `accepted ballistics pellet index ${index}`);
    const radius = strictInteger(
      item.spreadRadiusMilliDegrees,
      0,
      profile.spreadMilliDegrees,
      `accepted ballistics spread radius ${index}`,
    );
    const pitch = strictInteger(
      item.spreadPitchMilliDegrees,
      -radius,
      radius,
      `accepted ballistics spread pitch ${index}`,
    );
    const yaw = strictInteger(
      item.spreadYawMilliDegrees,
      -radius,
      radius,
      `accepted ballistics spread yaw ${index}`,
    );
    if (Math.hypot(pitch, yaw) > radius + 2) {
      throw new RangeError(`accepted ballistics sample ${index} exceeds its declared radius`);
    }
  });
  return value as AuthoritativeWeaponHitscanAcceptedAttackV1;
}

function validateWeaponHitscanRequest(
  request: AuthoritativeWeaponHitscanRequestV1,
  profile: AuthoritativeWeaponHitscanProfileV1,
): Readonly<{
  rttSamples: readonly ObservedRttSampleV1[];
  coreProfile: HitscanCoreProfile;
  coreRequest: HitscanCoreRequest;
}> {
  assertStrictCombatDataTree(request, 'authoritative weapon hitscan request');
  const coreProfile = validateWeaponHitscanProfile(profile);
  const record = strictRecord(request, [
    'schemaVersion',
    'currentAuthorityTick',
    'serverReceiptTick',
    'shooterPose',
    'acceptedLook',
    'acceptedAttack',
    'pelletIndex',
    'observedRttHistory',
    'targetHistories',
  ], 'authoritative weapon hitscan request');
  strictLiteral(record.schemaVersion, 1, 'authoritative weapon hitscan schemaVersion');
  const currentTick = strictInteger(
    record.currentAuthorityTick,
    0,
    MAX_AUTHORITY_TICK,
    'authoritative weapon hitscan current tick',
  );
  const receiptTick = strictInteger(
    record.serverReceiptTick,
    0,
    MAX_AUTHORITY_TICK,
    'authoritative weapon hitscan receipt tick',
  );
  validateShooterPose(record.shooterPose);
  validateAcceptedLook(record.acceptedLook);
  const acceptedAttack = validateWeaponAcceptedAttack(record.acceptedAttack, profile);
  const pelletIndex = strictInteger(
    record.pelletIndex,
    0,
    profile.pelletsPerAttack - 1,
    'authoritative weapon hitscan pellet index',
  );
  const rttSamples = validateRttHistory(record.observedRttHistory, receiptTick);
  validateTargetHistories(record.targetHistories, currentTick);
  const sample = acceptedAttack.ballistics[pelletIndex];
  return {
    rttSamples,
    coreProfile,
    coreRequest: {
      currentAuthorityTick: currentTick,
      serverReceiptTick: receiptTick,
      shooterPose: request.shooterPose,
      acceptedLook: request.acceptedLook,
      acceptedShot: {
        authorityTick: acceptedAttack.authorityTick,
        playerId: acceptedAttack.playerId,
        ballistics: {
          recoilPitchMilliDegrees: 0,
          recoilYawMilliDegrees: 0,
          spreadPitchMilliDegrees: sample.spreadPitchMilliDegrees,
          spreadYawMilliDegrees: sample.spreadYawMilliDegrees,
        },
      },
      observedRttHistory: request.observedRttHistory,
      targetHistories: request.targetHistories,
    },
  };
}

function medianObservedRtt(samples: readonly ObservedRttSampleV1[]): number {
  const window = samples.slice(-RTT_MEDIAN_WINDOW_SAMPLES)
    .map((sample) => sample.roundTripMilliseconds)
    .sort((left, right) => left - right);
  const middle = Math.floor(window.length / 2);
  if (window.length % 2 === 1) return window[middle];
  return (window[middle - 1] + window[middle]) / 2;
}

function compensationDebug(
  request: HitscanCoreRequest,
  rttSamples: readonly ObservedRttSampleV1[],
): HitscanCompensationDebugV1 {
  const median = medianObservedRtt(rttSamples);
  const requestedTicks = Math.round(median / (AUTHORITY_TICK_MILLISECONDS * 2));
  const appliedTicks = Math.min(requestedTicks, HITSCAN_MAX_COMPENSATION_TICKS);
  const rewindTick = request.serverReceiptTick - appliedTicks;
  return {
    schemaVersion: 1,
    currentAuthorityTick: request.currentAuthorityTick,
    serverReceiptTick: request.serverReceiptTick,
    observedRttSampleCount: rttSamples.length,
    medianObservedRttMilliseconds: median,
    requestedCompensationTicks: requestedTicks,
    appliedCompensationTicks: appliedTicks,
    appliedCompensationMilliseconds: appliedTicks * AUTHORITY_TICK_MILLISECONDS,
    compensationCapped: requestedTicks > appliedTicks,
    targetRewindTick: rewindTick < 0 ? null : rewindTick,
    clientTimestampUsed: false,
  };
}

function emptyCounts(): MutableResolutionCounts {
  return {
    candidatesWithCurrentPose: 0,
    candidatesWithRewoundPose: 0,
    filteredSelfCount: 0,
    filteredTeamCount: 0,
    filteredDeadCount: 0,
    missingHistoryCount: 0,
    analyticVolumeIntersectionCount: 0,
  };
}

function resolutionDebug(
  request: HitscanCoreRequest,
  compensation: HitscanCompensationDebugV1,
  counts: MutableResolutionCounts,
  aimRay: HitscanAimRayDebugV1 | null,
  barrelObstruction: HitscanWorldOcclusionDebugV1 | null,
  worldOcclusion: HitscanWorldOcclusionDebugV1 | null,
): HitscanResolutionDebugV1 {
  return {
    schemaVersion: 1,
    compensation,
    aimRay,
    barrelObstruction,
    worldOcclusion,
    targetHistoryCount: request.targetHistories.length,
    candidatesWithCurrentPose: counts.candidatesWithCurrentPose,
    candidatesWithRewoundPose: counts.candidatesWithRewoundPose,
    filteredSelfCount: counts.filteredSelfCount,
    filteredTeamCount: counts.filteredTeamCount,
    filteredDeadCount: counts.filteredDeadCount,
    missingHistoryCount: counts.missingHistoryCount,
    analyticVolumeIntersectionCount: counts.analyticVolumeIntersectionCount,
  };
}

function rejected(
  reason: AuthoritativeHitscanRejectionReason,
  debug: HitscanResolutionDebugV1,
): ResolveAuthoritativeHitscanResult {
  return deepFreezeCombatValue({
    accepted: false as const,
    outcome: 'rejected' as const,
    reason,
    hit: null,
    debug,
  });
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeYawMilliDegrees(value: number): number {
  const normalized = ((value + 180_000) % 360_000 + 360_000) % 360_000 - 180_000;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function yawDeltaMilliDegrees(value: number, reference: number): number {
  return normalizeYawMilliDegrees(value - reference);
}

function rotateLocalOffset(
  local: CombatVector3Millimeters,
  yawMilliDegrees: number,
): CombatVector3Millimeters {
  const radians = yawMilliDegrees * Math.PI / 180_000;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: local.x * cosine + local.z * sine,
    y: local.y,
    z: -local.x * sine + local.z * cosine,
  };
}

function addVector(
  left: CombatVector3Millimeters,
  right: CombatVector3Millimeters,
): CombatVector3Millimeters {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function quantizeMillimeterVector(
  value: CombatVector3Millimeters,
): CombatVector3Millimeters {
  return {
    x: Math.round(value.x),
    y: Math.round(value.y),
    z: Math.round(value.z),
  };
}

function directionFromAngles(
  yawMilliDegrees: number,
  pitchMilliDegrees: number,
): HitscanUnitVector3 {
  const yaw = yawMilliDegrees * Math.PI / 180_000;
  const pitch = pitchMilliDegrees * Math.PI / 180_000;
  const horizontal = Math.cos(pitch);
  return {
    x: Math.sin(yaw) * horizontal,
    y: Math.sin(pitch),
    z: Math.cos(yaw) * horizontal,
  };
}

function normalizeVector(value: CombatVector3Millimeters): HitscanUnitVector3 {
  const magnitude = Math.hypot(value.x, value.y, value.z);
  if (!Number.isFinite(magnitude) || magnitude <= 0) {
    throw new RangeError('authority-derived hitscan ray has zero or invalid length');
  }
  return { x: value.x / magnitude, y: value.y / magnitude, z: value.z / magnitude };
}

function buildAimRay(
  shooter: CurrentShooterPoseV1,
  look: CurrentAcceptedLookV1,
  ballistics: HitscanBallisticsAngles,
  maximumRangeMillimeters: number,
): HitscanAimRayDebugV1 {
  const bodyYaw = normalizeYawMilliDegrees(shooter.bodyYawMilliDegrees);
  const rawYawDelta = yawDeltaMilliDegrees(look.yawMilliDegrees, bodyYaw);
  const clampedYawDelta = clamp(
    rawYawDelta,
    -MAX_AIM_YAW_FROM_BODY_MILLI_DEGREES,
    MAX_AIM_YAW_FROM_BODY_MILLI_DEGREES,
  );
  const clampedYaw = normalizeYawMilliDegrees(bodyYaw + clampedYawDelta);
  const clampedPitch = clamp(
    look.pitchMilliDegrees,
    -MAX_AIM_PITCH_MILLI_DEGREES,
    MAX_AIM_PITCH_MILLI_DEGREES,
  );
  const finalYaw = normalizeYawMilliDegrees(
    clampedYaw
      + ballistics.recoilYawMilliDegrees
      + ballistics.spreadYawMilliDegrees,
  );
  const rawFinalPitch = clampedPitch
    + ballistics.recoilPitchMilliDegrees
    + ballistics.spreadPitchMilliDegrees;
  const finalPitch = clamp(
    rawFinalPitch,
    -MAX_AIM_PITCH_MILLI_DEGREES,
    MAX_AIM_PITCH_MILLI_DEGREES,
  );
  const eyeOrigin = quantizeMillimeterVector(addVector(
    shooter.positionMillimeters,
    rotateLocalOffset(shooter.eyeOffsetMillimeters, bodyYaw),
  ));
  const muzzleOrigin = quantizeMillimeterVector(addVector(
    shooter.positionMillimeters,
    rotateLocalOffset(shooter.muzzleOffsetMillimeters, bodyYaw),
  ));
  const eyeDirection = directionFromAngles(finalYaw, finalPitch);
  const eyeAimPoint = {
    x: eyeOrigin.x + eyeDirection.x * maximumRangeMillimeters,
    y: eyeOrigin.y + eyeDirection.y * maximumRangeMillimeters,
    z: eyeOrigin.z + eyeDirection.z * maximumRangeMillimeters,
  };
  const directionUnit = normalizeVector({
    x: eyeAimPoint.x - muzzleOrigin.x,
    y: eyeAimPoint.y - muzzleOrigin.y,
    z: eyeAimPoint.z - muzzleOrigin.z,
  });
  return {
    schemaVersion: 1,
    rawAcceptedYawMilliDegrees: look.yawMilliDegrees,
    rawAcceptedPitchMilliDegrees: look.pitchMilliDegrees,
    clampedLookYawMilliDegrees: clampedYaw,
    clampedLookPitchMilliDegrees: clampedPitch,
    recoilYawMilliDegrees: ballistics.recoilYawMilliDegrees,
    recoilPitchMilliDegrees: ballistics.recoilPitchMilliDegrees,
    spreadYawMilliDegrees: ballistics.spreadYawMilliDegrees,
    spreadPitchMilliDegrees: ballistics.spreadPitchMilliDegrees,
    finalYawMilliDegrees: finalYaw,
    finalPitchMilliDegrees: finalPitch,
    aimWasClamped: rawYawDelta !== clampedYawDelta
      || look.pitchMilliDegrees !== clampedPitch
      || rawFinalPitch !== finalPitch,
    eyeOriginMillimeters: eyeOrigin,
    muzzleOriginMillimeters: muzzleOrigin,
    directionUnit,
  };
}

function inverseRotateDirection(
  value: HitscanUnitVector3,
  yawMilliDegrees: number,
): HitscanUnitVector3 {
  const radians = yawMilliDegrees * Math.PI / 180_000;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: value.x * cosine - value.z * sine,
    y: value.y,
    z: value.x * sine + value.z * cosine,
  };
}

function inverseRotatePoint(
  value: CombatVector3Millimeters,
  targetPosition: CombatVector3Millimeters,
  yawMilliDegrees: number,
): CombatVector3Millimeters {
  const relative = {
    x: value.x - targetPosition.x,
    y: value.y - targetPosition.y,
    z: value.z - targetPosition.z,
  };
  const radians = yawMilliDegrees * Math.PI / 180_000;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: relative.x * cosine - relative.z * sine,
    y: relative.y,
    z: relative.x * sine + relative.z * cosine,
  };
}

function rayBoxDistance(
  origin: CombatVector3Millimeters,
  direction: HitscanUnitVector3,
  maximumDistance: number,
  targetPose: TargetPoseSampleV1,
  volume: CombatHitVolumeBoxV1,
): number | null {
  const localOrigin = inverseRotatePoint(
    origin,
    targetPose.positionMillimeters,
    targetPose.bodyYawMilliDegrees,
  );
  const localDirection = inverseRotateDirection(direction, targetPose.bodyYawMilliDegrees);
  let near = 0;
  let far = maximumDistance;
  const axes = ['x', 'y', 'z'] as const;
  for (const axis of axes) {
    const minimum = volume.centerOffsetMillimeters[axis] - volume.halfExtentsMillimeters[axis];
    const maximum = volume.centerOffsetMillimeters[axis] + volume.halfExtentsMillimeters[axis];
    const rayOrigin = localOrigin[axis];
    const rayDirection = localDirection[axis];
    if (Math.abs(rayDirection) < 1e-12) {
      if (rayOrigin < minimum || rayOrigin > maximum) return null;
      continue;
    }
    let first = (minimum - rayOrigin) / rayDirection;
    let second = (maximum - rayOrigin) / rayDirection;
    if (first > second) [first, second] = [second, first];
    near = Math.max(near, first);
    far = Math.min(far, second);
    if (near > far) return null;
  }
  return near >= 0 && near <= maximumDistance ? near : null;
}

function compareStableIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareIntersections(left: TargetIntersection, right: TargetIntersection): number {
  if (left.distanceMillimeters !== right.distanceMillimeters) {
    return left.distanceMillimeters - right.distanceMillimeters;
  }
  const playerOrder = compareStableIds(left.targetPlayerId, right.targetPlayerId);
  if (playerOrder !== 0) return playerOrder;
  const regionOrder = REGION_ORDER[left.region] - REGION_ORDER[right.region];
  if (regionOrder !== 0) return regionOrder;
  return compareStableIds(left.volumeId, right.volumeId);
}

function exactPoseAtTick(
  history: TargetPoseHistoryV1,
  authorityTick: number,
): TargetPoseSampleV1 | null {
  return history.samples.find((sample) => sample.authorityTick === authorityTick) ?? null;
}

function validateWorldOcclusionResult(
  value: unknown,
  maximumDistance: number,
): AuthorityWorldOcclusionHitV1 {
  assertStrictCombatDataTree(value, 'authoritative world occlusion result');
  const record = strictRecord(value, [
    'schemaVersion',
    'hit',
    'distanceMillimeters',
    'colliderId',
  ], 'authoritative world occlusion result');
  strictLiteral(record.schemaVersion, 1, 'world occlusion result schemaVersion');
  if (typeof record.hit !== 'boolean') {
    throw new TypeError('world occlusion result hit must be boolean');
  }
  if (!record.hit) {
    if (record.distanceMillimeters !== null || record.colliderId !== null) {
      throw new TypeError('world occlusion miss must contain null distance and colliderId');
    }
    return { schemaVersion: 1, hit: false, distanceMillimeters: null, colliderId: null };
  }
  return {
    schemaVersion: 1,
    hit: true,
    distanceMillimeters: strictFiniteNumber(
      record.distanceMillimeters,
      0,
      maximumDistance,
      'world occlusion hit distance',
    ),
    colliderId: strictStableId(record.colliderId, 'world occlusion colliderId'),
  };
}

function worldDebug(result: AuthorityWorldOcclusionHitV1): HitscanWorldOcclusionDebugV1 {
  return {
    schemaVersion: 1,
    queried: true,
    hit: result.hit,
    distanceMillimeters: result.distanceMillimeters,
    colliderId: result.colliderId,
  };
}

function damageMultiplier(
  region: CombatHitRegion,
  profile: HitscanCoreProfile,
): number {
  if (region === 'head') return profile.headMultiplierPermille;
  if (region === 'torso') return profile.torsoMultiplierPermille;
  return profile.limbMultiplierPermille;
}

function resolveValidatedHitscan(
  request: HitscanCoreRequest,
  validated: ValidatedRequestFacts,
  worldOcclusionPort: AuthorityWorldOcclusionPort,
  profile: HitscanCoreProfile,
): ResolveAuthoritativeHitscanResult {
  if (typeof worldOcclusionPort !== 'function') {
    throw new TypeError('authoritative world occlusion port must be a function');
  }
  const compensation = compensationDebug(request, validated.rttSamples);
  const counts = emptyCounts();
  const earlyDebug = (): HitscanResolutionDebugV1 => resolutionDebug(
    request,
    compensation,
    counts,
    null,
    null,
    null,
  );

  if (request.serverReceiptTick > request.currentAuthorityTick) {
    return rejected('future_receipt_tick', earlyDebug());
  }
  if (request.currentAuthorityTick - request.serverReceiptTick > HITSCAN_MAX_RECEIPT_AGE_TICKS) {
    return rejected('stale_receipt_tick', earlyDebug());
  }
  if (request.acceptedShot.authorityTick !== request.serverReceiptTick) {
    return rejected('accepted_shot_tick_mismatch', earlyDebug());
  }
  if (request.acceptedShot.playerId !== request.shooterPose.playerId) {
    return rejected('accepted_shot_player_mismatch', earlyDebug());
  }
  if (request.shooterPose.authorityTick !== request.currentAuthorityTick) {
    return rejected('shooter_pose_not_current', earlyDebug());
  }
  if (request.acceptedLook.acceptedAtAuthorityTick !== request.serverReceiptTick) {
    return rejected('look_not_current', earlyDebug());
  }
  if (request.shooterPose.lifePhase !== 'alive') {
    return rejected('shooter_dead', earlyDebug());
  }
  if (compensation.targetRewindTick === null) {
    return rejected('rewind_before_tick_zero', earlyDebug());
  }

  const aimRay = buildAimRay(
    request.shooterPose,
    request.acceptedLook,
    request.acceptedShot.ballistics,
    profile.rangeMillimeters,
  );
  const eyeToMuzzle = {
    x: aimRay.muzzleOriginMillimeters.x - aimRay.eyeOriginMillimeters.x,
    y: aimRay.muzzleOriginMillimeters.y - aimRay.eyeOriginMillimeters.y,
    z: aimRay.muzzleOriginMillimeters.z - aimRay.eyeOriginMillimeters.z,
  };
  const eyeToMuzzleDistance = Math.hypot(
    eyeToMuzzle.x,
    eyeToMuzzle.y,
    eyeToMuzzle.z,
  );
  let barrelDebug: HitscanWorldOcclusionDebugV1 | null = null;
  if (eyeToMuzzleDistance > 0) {
    const barrelQuery: AuthorityWorldOcclusionRayV1 = deepFreezeCombatValue({
      schemaVersion: 1,
      originMillimeters: { ...aimRay.eyeOriginMillimeters },
      directionUnit: { ...normalizeVector(eyeToMuzzle) },
      maximumDistanceMillimeters: eyeToMuzzleDistance,
      layer: 'authoritative_world' as const,
      purpose: 'barrel_clearance' as const,
    });
    const barrelResult = validateWorldOcclusionResult(
      worldOcclusionPort(barrelQuery),
      barrelQuery.maximumDistanceMillimeters,
    );
    barrelDebug = worldDebug(barrelResult);
    if (barrelResult.hit) {
      return deepFreezeCombatValue({
        accepted: true as const,
        outcome: 'miss' as const,
        reason: 'barrel_obstructed' as const,
        hit: null,
        debug: resolutionDebug(
          request,
          compensation,
          counts,
          aimRay,
          barrelDebug,
          null,
        ),
      });
    }
  }
  const intersections: TargetIntersection[] = [];
  for (const history of request.targetHistories) {
    if (history.playerId === request.shooterPose.playerId) {
      counts.filteredSelfCount += 1;
      continue;
    }
    const currentPose = exactPoseAtTick(history, request.currentAuthorityTick);
    if (currentPose === null) {
      counts.missingHistoryCount += 1;
      continue;
    }
    counts.candidatesWithCurrentPose += 1;
    if (currentPose.lifePhase !== 'alive') {
      counts.filteredDeadCount += 1;
      continue;
    }
    if (
      !profile.friendlyFireEnabled
      && request.shooterPose.teamId !== null
      && currentPose.teamId === request.shooterPose.teamId
    ) {
      counts.filteredTeamCount += 1;
      continue;
    }
    const rewoundPose = exactPoseAtTick(history, compensation.targetRewindTick);
    if (rewoundPose === null) {
      counts.missingHistoryCount += 1;
      continue;
    }
    counts.candidatesWithRewoundPose += 1;
    if (rewoundPose.lifePhase !== 'alive') {
      counts.filteredDeadCount += 1;
      continue;
    }
    for (const volume of rewoundPose.hitVolumes) {
      const distance = rayBoxDistance(
        aimRay.muzzleOriginMillimeters,
        aimRay.directionUnit,
        profile.rangeMillimeters,
        rewoundPose,
        volume,
      );
      if (distance === null) continue;
      counts.analyticVolumeIntersectionCount += 1;
      intersections.push({
        targetPlayerId: history.playerId,
        targetTeamId: currentPose.teamId,
        targetPoseTick: rewoundPose.authorityTick,
        volumeId: volume.volumeId,
        region: volume.region,
        distanceMillimeters: distance,
      });
    }
  }

  if (counts.missingHistoryCount > 0) {
    return rejected(
      'target_history_unavailable',
      resolutionDebug(request, compensation, counts, aimRay, barrelDebug, null),
    );
  }
  intersections.sort(compareIntersections);
  const rayQuery: AuthorityWorldOcclusionRayV1 = deepFreezeCombatValue({
    schemaVersion: 1,
    originMillimeters: { ...aimRay.muzzleOriginMillimeters },
    directionUnit: { ...aimRay.directionUnit },
    maximumDistanceMillimeters: profile.rangeMillimeters,
    layer: 'authoritative_world' as const,
    purpose: 'shot_path' as const,
  });
  const worldResult = validateWorldOcclusionResult(
    worldOcclusionPort(rayQuery),
    rayQuery.maximumDistanceMillimeters,
  );
  const collisionDebug = worldDebug(worldResult);
  const debug = resolutionDebug(
    request,
    compensation,
    counts,
    aimRay,
    barrelDebug,
    collisionDebug,
  );
  const nearest = intersections[0] ?? null;
  if (nearest === null) {
    return deepFreezeCombatValue({
      accepted: true as const,
      outcome: 'miss' as const,
      reason: 'no_target' as const,
      hit: null,
      debug,
    });
  }
  if (
    worldResult.hit
    && worldResult.distanceMillimeters !== null
    && worldResult.distanceMillimeters <= nearest.distanceMillimeters
  ) {
    return deepFreezeCombatValue({
      accepted: true as const,
      outcome: 'miss' as const,
      reason: 'world_occluded' as const,
      hit: null,
      debug,
    });
  }
  const multiplier = damageMultiplier(nearest.region, profile);
  const hit: AuthoritativeHitscanHitV1 = {
    schemaVersion: 1,
    targetPlayerId: nearest.targetPlayerId,
    targetTeamId: nearest.targetTeamId,
    targetPoseTick: nearest.targetPoseTick,
    volumeId: nearest.volumeId,
    region: nearest.region,
    distanceMillimeters: nearest.distanceMillimeters,
    impactPointMillimeters: {
      x: aimRay.muzzleOriginMillimeters.x
        + aimRay.directionUnit.x * nearest.distanceMillimeters,
      y: aimRay.muzzleOriginMillimeters.y
        + aimRay.directionUnit.y * nearest.distanceMillimeters,
      z: aimRay.muzzleOriginMillimeters.z
        + aimRay.directionUnit.z * nearest.distanceMillimeters,
    },
    damageMultiplierPermille: multiplier,
    damagePoints: Math.max(
      1,
      Math.round(profile.referenceDamagePoints * multiplier / 1_000),
    ),
  };
  return deepFreezeCombatValue({
    accepted: true as const,
    outcome: 'hit' as const,
    reason: null,
    hit,
    debug,
  });
}

export function resolveAuthoritativeAutoRifleHitscan(
  request: AuthoritativeAutoRifleHitscanRequestV1,
  worldOcclusionPort: AuthorityWorldOcclusionPort,
): ResolveAuthoritativeHitscanResult {
  const validated = validateRequest(request);
  return resolveValidatedHitscan(
    request,
    validated,
    worldOcclusionPort,
    {
      rangeMillimeters: G4_AUTO_RIFLE_RULES.rangeMillimeters,
      referenceDamagePoints: G4_AUTO_RIFLE_RULES.referenceDamagePoints,
      headMultiplierPermille: G4_AUTHORITATIVE_HITSCAN_RULES.headMultiplierPermille,
      torsoMultiplierPermille: G4_AUTHORITATIVE_HITSCAN_RULES.torsoMultiplierPermille,
      limbMultiplierPermille: G4_AUTHORITATIVE_HITSCAN_RULES.limbMultiplierPermille,
      friendlyFireEnabled: G4_AUTHORITATIVE_HITSCAN_RULES.friendlyFireEnabled,
    },
  );
}

export function resolveAuthoritativeWeaponHitscan(
  request: AuthoritativeWeaponHitscanRequestV1,
  profile: AuthoritativeWeaponHitscanProfileV1,
  worldOcclusionPort: AuthorityWorldOcclusionPort,
): ResolveAuthoritativeHitscanResult {
  const validated = validateWeaponHitscanRequest(request, profile);
  return resolveValidatedHitscan(
    validated.coreRequest,
    { rttSamples: validated.rttSamples },
    worldOcclusionPort,
    validated.coreProfile,
  );
}
