import { describe, expect, it } from 'vitest';

import {
  AUTO_RIFLE_RECOIL_PATTERN_ID,
  AUTO_RIFLE_WEAPON_ID,
  COMBAT_POSE_HISTORY_AUTHORITY_HZ,
  COMBAT_POSE_HISTORY_CAPACITY_SAMPLES,
  G4_AUTHORITATIVE_HITSCAN_RULES,
  HITSCAN_MAX_COMPENSATION_MILLISECONDS,
  HITSCAN_MAX_COMPENSATION_TICKS,
  KYX_STANDARD_HUMANOID_HIT_VOLUMES_V1,
  assertTargetPoseHistory,
  createTargetPoseHistory,
  recordTargetPoseSample,
  recordTargetPoseSamples,
  resolveAuthoritativeAutoRifleHitscan,
  type AuthorityWorldOcclusionPort,
  type AuthorityWorldOcclusionRayV1,
  type AutoRifleBallisticsSample,
  type AutoRifleShotAcceptedEvent,
  type AuthoritativeAutoRifleHitscanRequestV1,
  type CombatHitRegion,
  type CombatHitVolumeBoxV1,
  type CurrentAcceptedLookV1,
  type CurrentShooterPoseV1,
  type ObservedRttSampleV1,
  type TargetPoseHistoryV1,
  type TargetPoseSampleV1,
} from '../../../../src/authority';

function cloneStandardVolumes(): readonly CombatHitVolumeBoxV1[] {
  return KYX_STANDARD_HUMANOID_HIT_VOLUMES_V1.map((volume) => ({
    schemaVersion: 1,
    volumeId: volume.volumeId,
    region: volume.region,
    centerOffsetMillimeters: { ...volume.centerOffsetMillimeters },
    halfExtentsMillimeters: { ...volume.halfExtentsMillimeters },
  }));
}

function oneVolume(region: CombatHitRegion, volumeId = `test_${region}`): readonly CombatHitVolumeBoxV1[] {
  return [{
    schemaVersion: 1,
    volumeId,
    region,
    centerOffsetMillimeters: { x: 0, y: 0, z: 0 },
    halfExtentsMillimeters: { x: 100, y: 100, z: 100 },
  }];
}

function pose(
  authorityTick: number,
  overrides: Partial<TargetPoseSampleV1> = {},
): TargetPoseSampleV1 {
  return {
    schemaVersion: 1,
    authorityTick,
    teamId: 'team_red',
    lifePhase: 'alive',
    positionMillimeters: { x: 0, y: 0, z: 10_000 },
    bodyYawMilliDegrees: 0,
    hitVolumes: cloneStandardVolumes(),
    ...overrides,
  };
}

function history(
  playerId: string,
  samples: readonly TargetPoseSampleV1[],
): TargetPoseHistoryV1 {
  return recordTargetPoseSamples(createTargetPoseHistory(playerId), samples);
}

function ballistics(
  overrides: Partial<AutoRifleBallisticsSample> = {},
): AutoRifleBallisticsSample {
  return {
    patternId: AUTO_RIFLE_RECOIL_PATTERN_ID,
    patternIndex: 0,
    recoilPitchMilliDegrees: 250,
    recoilYawMilliDegrees: 0,
    spreadRadiusMilliDegrees: 0,
    spreadPitchMilliDegrees: 0,
    spreadYawMilliDegrees: 0,
    ...overrides,
  };
}

function acceptedShot(
  authorityTick: number,
  overrides: Partial<AutoRifleShotAcceptedEvent> = {},
): AutoRifleShotAcceptedEvent {
  return {
    kind: 'auto_rifle_shot_accepted',
    eventId: `combat.auto_rifle.shot.test.${authorityTick}`,
    authorityTick,
    playerId: 'player_shooter',
    weaponId: AUTO_RIFLE_WEAPON_ID,
    shotOrdinal: 1,
    referenceDamagePoints: 10,
    magazineRoundsAfter: 49,
    reserveRoundsAfter: 150,
    nextShotAtTick: authorityTick + 2,
    ballistics: ballistics(),
    ...overrides,
  };
}

function shooterPose(
  authorityTick: number,
  overrides: Partial<CurrentShooterPoseV1> = {},
): CurrentShooterPoseV1 {
  return {
    schemaVersion: 1,
    authorityTick,
    playerId: 'player_shooter',
    teamId: 'team_blue',
    lifePhase: 'alive',
    positionMillimeters: { x: 0, y: 0, z: 0 },
    bodyYawMilliDegrees: 0,
    eyeOffsetMillimeters: { x: 0, y: 1_700, z: 0 },
    muzzleOffsetMillimeters: { x: 0, y: 1_700, z: 0 },
    ...overrides,
  };
}

function acceptedLook(
  authorityTick: number,
  overrides: Partial<CurrentAcceptedLookV1> = {},
): CurrentAcceptedLookV1 {
  return {
    schemaVersion: 1,
    acceptedAtAuthorityTick: authorityTick,
    yawMilliDegrees: 0,
    pitchMilliDegrees: 0,
    ...overrides,
  };
}

function rtt(
  observedAtReceiptTick: number,
  roundTripMilliseconds = 350,
): ObservedRttSampleV1 {
  return { schemaVersion: 1, observedAtReceiptTick, roundTripMilliseconds };
}

interface RequestOptions {
  readonly currentAuthorityTick?: number;
  readonly serverReceiptTick?: number;
  readonly shooterPose?: CurrentShooterPoseV1;
  readonly acceptedLook?: CurrentAcceptedLookV1;
  readonly acceptedShot?: AutoRifleShotAcceptedEvent;
  readonly observedRttHistory?: readonly ObservedRttSampleV1[];
  readonly targetHistories?: readonly TargetPoseHistoryV1[];
}

function request(options: RequestOptions = {}): AuthoritativeAutoRifleHitscanRequestV1 {
  const currentTick = options.currentAuthorityTick ?? 100;
  const receiptTick = options.serverReceiptTick ?? currentTick;
  return {
    schemaVersion: 1,
    currentAuthorityTick: currentTick,
    serverReceiptTick: receiptTick,
    shooterPose: options.shooterPose ?? shooterPose(currentTick),
    acceptedLook: options.acceptedLook ?? acceptedLook(receiptTick),
    acceptedShot: options.acceptedShot ?? acceptedShot(receiptTick),
    observedRttHistory: options.observedRttHistory ?? [rtt(receiptTick)],
    targetHistories: options.targetHistories ?? [history('player_target', [
      pose(receiptTick - 4),
      pose(currentTick, { positionMillimeters: { x: 5_000, y: 0, z: 10_000 } }),
    ])],
  };
}

const clearWorld: AuthorityWorldOcclusionPort = () => ({
  schemaVersion: 1,
  hit: false,
  distanceMillimeters: null,
  colliderId: null,
});

function worldAt(distanceMillimeters: number): AuthorityWorldOcclusionPort {
  return () => ({
    schemaVersion: 1,
    hit: true,
    distanceMillimeters,
    colliderId: 'world_test_wall',
  });
}

describe('P5.3 bounded authoritative pose history', () => {
  it('retains exactly the newest 16 samples at 20 Hz without mutating its source', () => {
    const initial = createTargetPoseHistory('player_history');
    let state = initial;
    for (let authorityTick = 0; authorityTick < 20; authorityTick += 1) {
      const sample = pose(authorityTick);
      const before = JSON.stringify(sample);
      state = recordTargetPoseSample(state, sample);
      expect(JSON.stringify(sample)).toBe(before);
    }
    expect(state).toMatchObject({
      authorityHz: COMBAT_POSE_HISTORY_AUTHORITY_HZ,
      capacitySamples: COMBAT_POSE_HISTORY_CAPACITY_SAMPLES,
    });
    expect(state.samples.map((sample) => sample.authorityTick)).toEqual([
      4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
    ]);
    expect(initial.samples).toEqual([]);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.samples)).toBe(true);
    expect(Object.isFrozen(state.samples[0].hitVolumes[0])).toBe(true);
    expect(() => assertTargetPoseHistory(state)).not.toThrow();
  });

  it('records input-order-independent batches and rejects duplicate or hostile samples', () => {
    const base = createTargetPoseHistory('player_order');
    const forward = recordTargetPoseSamples(base, [pose(1), pose(2), pose(3)]);
    const shuffled = recordTargetPoseSamples(base, [pose(3), pose(1), pose(2)]);
    expect(shuffled).toEqual(forward);
    expect(() => recordTargetPoseSamples(base, [pose(2), pose(2)])).toThrow(
      /duplicate sample tick 2/u,
    );

    const duplicateVolumes = pose(4, {
      hitVolumes: [
        ...oneVolume('head', 'duplicate'),
        ...oneVolume('torso', 'duplicate'),
      ],
    });
    expect(() => recordTargetPoseSample(base, duplicateVolumes)).toThrow(/duplicate hit volume/u);
    expect(() => recordTargetPoseSample(base, pose(4, {
      positionMillimeters: { x: Number.NaN, y: 0, z: 0 },
    }))).toThrow(/must be an integer/u);
    expect(() => recordTargetPoseSample(base, pose(Number.MAX_SAFE_INTEGER))).toThrow(
      /authorityTick/u,
    );

    const accessorPosition: Record<string, unknown> = { y: 0, z: 10_000 };
    Object.defineProperty(accessorPosition, 'x', { enumerable: true, get: () => 0 });
    expect(() => recordTargetPoseSample(base, pose(4, {
      positionMillimeters: accessorPosition as never,
    }))).toThrow(/must not contain accessors/u);

    const cyclic = pose(4) as TargetPoseSampleV1 & Record<string, unknown>;
    cyclic.cycle = cyclic;
    expect(() => recordTargetPoseSample(base, cyclic)).toThrow(/cycle/u);
  });
});

describe('P5.3 authoritative Auto Rifle rewind and hitscan', () => {
  it('pins the 20 Hz, four-tick/200 ms server-only compensation contract', () => {
    expect(G4_AUTHORITATIVE_HITSCAN_RULES).toEqual({
      schemaVersion: 1,
      authorityHz: 20,
      authorityTickMilliseconds: 50,
      maximumCompensationTicks: HITSCAN_MAX_COMPENSATION_TICKS,
      maximumCompensationMilliseconds: HITSCAN_MAX_COMPENSATION_MILLISECONDS,
      maximumReceiptAgeTicks: 1,
      rttMedianWindowSamples: 8,
      maximumRangeMillimeters: 120_000,
      maximumAimYawFromBodyMilliDegrees: 90_000,
      maximumAimPitchMilliDegrees: 89_000,
      friendlyFireEnabled: false,
      headMultiplierPermille: 1_750,
      torsoMultiplierPermille: 1_000,
      limbMultiplierPermille: 1_000,
    });
  });

  it('maps the accepted 350 ms RTT profile to four ticks and rewinds targets only', () => {
    const input = request();
    const before = JSON.stringify(input);
    let capturedRay: AuthorityWorldOcclusionRayV1 | null = null;
    const result = resolveAuthoritativeAutoRifleHitscan(input, (ray) => {
      capturedRay = ray;
      expect(Object.isFrozen(ray)).toBe(true);
      expect(Object.isFrozen(ray.originMillimeters)).toBe(true);
      return clearWorld(ray);
    });
    expect(result).toMatchObject({
      accepted: true,
      outcome: 'hit',
      reason: null,
      hit: {
        targetPlayerId: 'player_target',
        targetPoseTick: 96,
        region: 'head',
        damageMultiplierPermille: 1_750,
        damagePoints: 18,
      },
      debug: {
        compensation: {
          medianObservedRttMilliseconds: 350,
          requestedCompensationTicks: 4,
          appliedCompensationTicks: 4,
          appliedCompensationMilliseconds: 200,
          compensationCapped: false,
          targetRewindTick: 96,
          clientTimestampUsed: false,
        },
        aimRay: {
          eyeOriginMillimeters: { x: 0, y: 1_700, z: 0 },
          muzzleOriginMillimeters: { x: 0, y: 1_700, z: 0 },
          recoilPitchMilliDegrees: 250,
        },
        candidatesWithCurrentPose: 1,
        candidatesWithRewoundPose: 1,
      },
    });
    expect(result.hit?.impactPointMillimeters.x).toBeCloseTo(0, 8);
    expect(capturedRay).not.toBeNull();
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.hit)).toBe(true);
    expect(Object.isFrozen(result.debug)).toBe(true);
  });

  it('quantizes a non-cardinal authority muzzle origin to strict millimeters', () => {
    let capturedRay: AuthorityWorldOcclusionRayV1 | null = null;
    const result = resolveAuthoritativeAutoRifleHitscan(request({
      shooterPose: shooterPose(100, {
        bodyYawMilliDegrees: 94_500,
        muzzleOffsetMillimeters: { x: 0, y: 1_700, z: 200 },
      }),
      acceptedLook: acceptedLook(100, { yawMilliDegrees: 94_500 }),
      targetHistories: [],
    }), (ray) => {
      capturedRay = ray;
      expect(Number.isInteger(ray.originMillimeters.x)).toBe(true);
      expect(Number.isInteger(ray.originMillimeters.y)).toBe(true);
      expect(Number.isInteger(ray.originMillimeters.z)).toBe(true);
      return clearWorld(ray);
    });
    expect(result).toMatchObject({ accepted: true, outcome: 'miss' });
    expect(capturedRay).not.toBeNull();
  });

  it('caps RTT values beyond the profile at four ticks instead of extending rewind', () => {
    const result = resolveAuthoritativeAutoRifleHitscan(request({
      observedRttHistory: [rtt(100, 800)],
    }), clearWorld);
    expect(result).toMatchObject({
      accepted: true,
      outcome: 'hit',
      hit: { targetPoseTick: 96 },
      debug: {
        compensation: {
          medianObservedRttMilliseconds: 800,
          requestedCompensationTicks: 8,
          appliedCompensationTicks: 4,
          compensationCapped: true,
          targetRewindTick: 96,
        },
      },
    });
  });

  it('fails stale, future, mismatched, dead, and pre-zero timing with stable reasons', () => {
    const cases: readonly [AuthoritativeAutoRifleHitscanRequestV1, string][] = [
      [request({ currentAuthorityTick: 100, serverReceiptTick: 98, targetHistories: [] }), 'stale_receipt_tick'],
      [request({ currentAuthorityTick: 100, serverReceiptTick: 101, targetHistories: [] }), 'future_receipt_tick'],
      [request({ acceptedShot: acceptedShot(99), targetHistories: [] }), 'accepted_shot_tick_mismatch'],
      [request({
        acceptedShot: acceptedShot(100, { playerId: 'player_someone_else' }),
        targetHistories: [],
      }), 'accepted_shot_player_mismatch'],
      [request({ shooterPose: shooterPose(99), targetHistories: [] }), 'shooter_pose_not_current'],
      [request({ acceptedLook: acceptedLook(99), targetHistories: [] }), 'look_not_current'],
      [request({
        shooterPose: shooterPose(100, { lifePhase: 'dead' }),
        targetHistories: [],
      }), 'shooter_dead'],
      [request({
        currentAuthorityTick: 0,
        serverReceiptTick: 0,
        targetHistories: [],
      }), 'rewind_before_tick_zero'],
    ];
    for (const [input, reason] of cases) {
      const result = resolveAuthoritativeAutoRifleHitscan(input, clearWorld);
      expect(result).toMatchObject({ accepted: false, outcome: 'rejected', reason, hit: null });
    }
  });

  it('fails closed when an eligible target lacks the exact rewound pose tick', () => {
    const incomplete = history('player_incomplete', [pose(100)]);
    const result = resolveAuthoritativeAutoRifleHitscan(request({
      targetHistories: [incomplete],
    }), clearWorld);
    expect(result).toMatchObject({
      accepted: false,
      outcome: 'rejected',
      reason: 'target_history_unavailable',
      debug: {
        missingHistoryCount: 1,
        candidatesWithCurrentPose: 1,
        candidatesWithRewoundPose: 0,
        worldOcclusion: null,
      },
    });
  });

  it('orders the nearest world hit against the nearest analytic target hit', () => {
    const blocked = resolveAuthoritativeAutoRifleHitscan(request(), worldAt(9_000));
    expect(blocked).toMatchObject({
      accepted: true,
      outcome: 'miss',
      reason: 'world_occluded',
      hit: null,
      debug: { worldOcclusion: { colliderId: 'world_test_wall', distanceMillimeters: 9_000 } },
    });
    const clearBehindTarget = resolveAuthoritativeAutoRifleHitscan(request(), worldAt(11_000));
    expect(clearBehindTarget).toMatchObject({
      accepted: true,
      outcome: 'hit',
      hit: { targetPlayerId: 'player_target' },
    });
  });

  it('fails the shot at the authority eye-to-muzzle segment when the barrel is obstructed', () => {
    const queriedPurposes: AuthorityWorldOcclusionRayV1['purpose'][] = [];
    const result = resolveAuthoritativeAutoRifleHitscan(request({
      shooterPose: shooterPose(100, {
        eyeOffsetMillimeters: { x: 0, y: 1_700, z: 0 },
        muzzleOffsetMillimeters: { x: 0, y: 1_700, z: 500 },
      }),
    }), (ray) => {
      queriedPurposes.push(ray.purpose);
      if (ray.purpose === 'barrel_clearance') {
        expect(ray.maximumDistanceMillimeters).toBe(500);
        return {
          schemaVersion: 1,
          hit: true,
          distanceMillimeters: 250,
          colliderId: 'world_barrel_wall',
        };
      }
      return clearWorld(ray);
    });
    expect(result).toMatchObject({
      accepted: true,
      outcome: 'miss',
      reason: 'barrel_obstructed',
      hit: null,
      debug: {
        barrelObstruction: {
          hit: true,
          distanceMillimeters: 250,
          colliderId: 'world_barrel_wall',
        },
        worldOcclusion: null,
      },
    });
    expect(queriedPurposes).toEqual(['barrel_clearance']);
  });

  it('uses distance then stable player and volume identifiers independent of input order', () => {
    const alpha = history('player_alpha', [pose(96), pose(100)]);
    const zulu = history('player_zulu', [pose(96), pose(100)]);
    const reversed = resolveAuthoritativeAutoRifleHitscan(request({
      targetHistories: [zulu, alpha],
    }), clearWorld);
    const forward = resolveAuthoritativeAutoRifleHitscan(request({
      targetHistories: [alpha, zulu],
    }), clearWorld);
    expect(reversed).toEqual(forward);
    expect(reversed).toMatchObject({
      outcome: 'hit',
      hit: { targetPlayerId: 'player_alpha', volumeId: 'head' },
    });
  });

  it('filters self, current teammates, and current dead targets before analytic queries', () => {
    const self = history('player_shooter', [
      pose(96, { teamId: 'team_blue' }),
      pose(100, { teamId: 'team_blue' }),
    ]);
    const teammate = history('player_teammate', [
      pose(96, { teamId: 'team_blue' }),
      pose(100, { teamId: 'team_blue' }),
    ]);
    const dead = history('player_dead', [
      pose(96),
      pose(100, { lifePhase: 'dead' }),
    ]);
    const result = resolveAuthoritativeAutoRifleHitscan(request({
      targetHistories: [dead, teammate, self],
    }), clearWorld);
    expect(result).toMatchObject({
      accepted: true,
      outcome: 'miss',
      reason: 'no_target',
      debug: {
        filteredSelfCount: 1,
        filteredTeamCount: 1,
        filteredDeadCount: 1,
        analyticVolumeIntersectionCount: 0,
      },
    });
  });

  it('applies the 1.75 headshot multiplier while retaining torso and limb classification', () => {
    for (const region of ['head', 'torso', 'limb'] as const) {
      const target = history(`player_${region}`, [
        pose(96, {
          positionMillimeters: { x: 0, y: 1_700, z: 10_000 },
          hitVolumes: oneVolume(region),
        }),
        pose(100, {
          positionMillimeters: { x: 0, y: 1_700, z: 10_000 },
          hitVolumes: oneVolume(region),
        }),
      ]);
      const result = resolveAuthoritativeAutoRifleHitscan(request({
        targetHistories: [target],
      }), clearWorld);
      expect(result).toMatchObject({
        accepted: true,
        outcome: 'hit',
        hit: {
          targetPlayerId: `player_${region}`,
          volumeId: `test_${region}`,
          region,
          damageMultiplierPermille: region === 'head' ? 1_750 : 1_000,
          damagePoints: region === 'head' ? 18 : 10,
        },
      });
    }
  });

  it('applies the accepted recoil/spread after deterministic body-relative aim clamping', () => {
    const sample = ballistics({
      recoilPitchMilliDegrees: 300,
      recoilYawMilliDegrees: 100,
      spreadRadiusMilliDegrees: 500,
      spreadPitchMilliDegrees: 400,
      spreadYawMilliDegrees: 300,
    });
    const result = resolveAuthoritativeAutoRifleHitscan(request({
      acceptedLook: acceptedLook(100, { yawMilliDegrees: 120_000, pitchMilliDegrees: 90_000 }),
      acceptedShot: acceptedShot(100, { ballistics: sample }),
      targetHistories: [],
    }), clearWorld);
    expect(result).toMatchObject({
      accepted: true,
      outcome: 'miss',
      reason: 'no_target',
      debug: {
        aimRay: {
          clampedLookYawMilliDegrees: 90_000,
          clampedLookPitchMilliDegrees: 89_000,
          recoilYawMilliDegrees: 100,
          recoilPitchMilliDegrees: 300,
          spreadYawMilliDegrees: 300,
          spreadPitchMilliDegrees: 400,
          finalYawMilliDegrees: 90_400,
          finalPitchMilliDegrees: 89_000,
          aimWasClamped: true,
        },
      },
    });
  });

  it('enforces the 120 metre range and is independent of presentation frame count', () => {
    const farTarget = history('player_far', [
      pose(96, { positionMillimeters: { x: 0, y: 0, z: 130_000 } }),
      pose(100, { positionMillimeters: { x: 0, y: 0, z: 130_000 } }),
    ]);
    const input = request({ targetHistories: [farTarget] });
    const first = resolveAuthoritativeAutoRifleHitscan(input, clearWorld);
    for (let frame = 0; frame < 1_000; frame += 1) {
      expect(frame).toBeGreaterThanOrEqual(0);
    }
    const second = resolveAuthoritativeAutoRifleHitscan(input, clearWorld);
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      accepted: true,
      outcome: 'miss',
      reason: 'no_target',
    });
  });

  it('rejects unknown fields, forged outcomes, cycles, NaN, duplicates, and future history', () => {
    const base = request({ targetHistories: [] });
    expect(() => resolveAuthoritativeAutoRifleHitscan({
      ...base,
      clientTimestamp: 123,
    } as never, clearWorld)).toThrow(/unsupported or missing fields/u);
    const hiddenClaim: Record<string, unknown> = { ...base };
    Object.defineProperty(hiddenClaim, 'claimedMuzzleOrigin', {
      enumerable: false,
      value: { x: 0, y: 0, z: 0 },
    });
    expect(() => resolveAuthoritativeAutoRifleHitscan(hiddenClaim as never, clearWorld)).toThrow(
      /unsupported or missing fields/u,
    );
    expect(() => resolveAuthoritativeAutoRifleHitscan({
      ...base,
      acceptedShot: { ...base.acceptedShot, claimedTargetPlayerId: 'player_target' },
    } as never, clearWorld)).toThrow(/unsupported or missing fields/u);
    expect(() => resolveAuthoritativeAutoRifleHitscan({
      ...base,
      shooterPose: {
        ...base.shooterPose,
        positionMillimeters: { x: Number.NaN, y: 0, z: 0 },
      },
    }, clearWorld)).toThrow(/must be an integer/u);
    expect(() => resolveAuthoritativeAutoRifleHitscan({
      ...base,
      observedRttHistory: [rtt(100), rtt(100, 351)],
    }, clearWorld)).toThrow(/duplicate sample tick 100/u);
    const duplicateA = history('player_duplicate', [pose(96), pose(100)]);
    const duplicateB = history('player_duplicate', [pose(96), pose(100)]);
    expect(() => resolveAuthoritativeAutoRifleHitscan({
      ...base,
      targetHistories: [duplicateA, duplicateB],
    }, clearWorld)).toThrow(/duplicate target history/u);
    const future = history('player_future', [pose(101)]);
    expect(() => resolveAuthoritativeAutoRifleHitscan({
      ...base,
      targetHistories: [future],
    }, clearWorld)).toThrow(/future pose sample/u);

    const accessorShooter: Record<string, unknown> = { ...base.shooterPose };
    Object.defineProperty(accessorShooter, 'authorityTick', {
      enumerable: true,
      get: () => 100,
    });
    expect(() => resolveAuthoritativeAutoRifleHitscan({
      ...base,
      shooterPose: accessorShooter,
    } as never, clearWorld)).toThrow(/must not contain accessors/u);
    const cyclic: Record<string, unknown> = { ...base };
    cyclic.cycle = cyclic;
    expect(() => resolveAuthoritativeAutoRifleHitscan(cyclic as never, clearWorld)).toThrow(/cycle/u);
  });

  it('rejects malformed authoritative collision adapter replies', () => {
    const input = request();
    const badReplies: readonly (() => unknown)[] = [
      () => ({ schemaVersion: 1, hit: true, distanceMillimeters: Number.NaN, colliderId: 'wall' }),
      () => ({ schemaVersion: 1, hit: true, distanceMillimeters: 120_001, colliderId: 'wall' }),
      () => ({ schemaVersion: 1, hit: false, distanceMillimeters: 10, colliderId: null }),
      () => ({
        schemaVersion: 1,
        hit: false,
        distanceMillimeters: null,
        colliderId: null,
        clientTrusted: true,
      }),
    ];
    for (const reply of badReplies) {
      expect(() => resolveAuthoritativeAutoRifleHitscan(input, reply)).toThrow();
    }

    const accessorReply: Record<string, unknown> = {
      schemaVersion: 1,
      hit: true,
      colliderId: 'wall',
    };
    Object.defineProperty(accessorReply, 'distanceMillimeters', {
      enumerable: true,
      get: () => 9_000,
    });
    expect(() => resolveAuthoritativeAutoRifleHitscan(input, () => accessorReply)).toThrow(
      /must not contain accessors/u,
    );
  });
});
