import { describe, expect, it } from 'vitest';

import {
  KYX_ARMORY_CATALOG_ID,
  KYX_WEAPON_ID,
  KYX_WEAPON_PROFILES,
  advanceAuthorityRocketProjectile,
  advanceAuthorityWeapon,
  advanceAuthorityWeaponLoadout,
  createAuthorityRocketProjectile,
  createAuthorityWeaponLoadout,
  createAuthorityWeaponState,
  createTargetPoseHistory,
  hashKyxWeaponCatalog,
  kyxAuthoritativeHitscanProfile,
  kyxWeaponProfile,
  recordTargetPoseSample,
  resolveAuthorityMeleeContact,
  resolveAuthorityRocketSplash,
  resolveAuthorityWeaponHitscanAttack,
  type AuthorityRocketSweepPort,
  type AuthorityWeaponAttackAcceptedEventV1,
  type AuthorityWorldOcclusionPort,
  type CombatHitVolumeBoxV1,
  type CurrentAcceptedLookV1,
  type CurrentShooterPoseV1,
  type TargetPoseHistoryV1,
} from '../../../../src/authority';

const clearWorld: AuthorityWorldOcclusionPort = () => ({
  schemaVersion: 1,
  hit: false,
  distanceMillimeters: null,
  colliderId: null,
});

function shooter(
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
    eyeOffsetMillimeters: { x: 0, y: 1_000, z: 0 },
    muzzleOffsetMillimeters: { x: 0, y: 1_000, z: 0 },
    ...overrides,
  };
}

function look(authorityTick: number): CurrentAcceptedLookV1 {
  return {
    schemaVersion: 1,
    acceptedAtAuthorityTick: authorityTick,
    yawMilliDegrees: 0,
    pitchMilliDegrees: 0,
  };
}

function targetHistory(
  authorityTick: number,
  options: Readonly<{
    playerId?: string;
    teamId?: string | null;
    z?: number;
    region?: CombatHitVolumeBoxV1['region'];
    halfExtent?: number;
  }> = {},
): TargetPoseHistoryV1 {
  const region = options.region ?? 'torso';
  const halfExtent = options.halfExtent ?? 1_500;
  return recordTargetPoseSample(
    createTargetPoseHistory(options.playerId ?? 'player_target'),
    {
      schemaVersion: 1,
      authorityTick,
      teamId: options.teamId ?? 'team_red',
      lifePhase: 'alive',
      positionMillimeters: { x: 0, y: 0, z: options.z ?? 10_000 },
      bodyYawMilliDegrees: 0,
      hitVolumes: [{
        schemaVersion: 1,
        volumeId: `test_${region}`,
        region,
        centerOffsetMillimeters: { x: 0, y: 1_000, z: 0 },
        halfExtentsMillimeters: {
          x: halfExtent,
          y: halfExtent,
          z: halfExtent,
        },
      }],
    },
  );
}

function acceptedAttack(
  weaponId: Exclude<
    typeof KYX_WEAPON_ID[keyof typeof KYX_WEAPON_ID],
    typeof KYX_WEAPON_ID.autoRifle
  >,
  authorityTick: number,
): AuthorityWeaponAttackAcceptedEventV1 {
  const state = createAuthorityWeaponState({
    playerId: 'player_shooter',
    weaponId,
    roomSeed: 'room_weapon_test',
    authorityTick: 0,
    selected: true,
  });
  const result = advanceAuthorityWeapon(state, {
    authorityTick,
    authorityInputSequence: authorityTick,
    lifePhase: 'alive',
    selected: true,
    sprintHeld: false,
    fireHeld: true,
    firePressed: true,
    reloadPressed: false,
  });
  if (result.acceptedAttack === null) throw new Error('test weapon did not accept its attack');
  return result.acceptedAttack;
}

describe('KYX authoritative multi-weapon foundation', () => {
  it('pins six original authority profiles with unique slots and deterministic catalog identity', () => {
    expect(KYX_WEAPON_PROFILES.map(({ weaponId, slot, family, attackModel }) => ({
      weaponId,
      slot,
      family,
      attackModel,
    }))).toEqual([
      {
        weaponId: 'vertical_rifle_v1',
        slot: 0,
        family: 'rifle',
        attackModel: 'hitscan',
      },
      {
        weaponId: 'kyx_sidearm_v1',
        slot: 1,
        family: 'pistol',
        attackModel: 'hitscan',
      },
      {
        weaponId: 'kyx_scattergun_v1',
        slot: 2,
        family: 'shotgun',
        attackModel: 'pellet_hitscan',
      },
      {
        weaponId: 'kyx_longshot_v1',
        slot: 3,
        family: 'sniper',
        attackModel: 'hitscan',
      },
      {
        weaponId: 'kyx_breach_rocket_v1',
        slot: 4,
        family: 'rocket',
        attackModel: 'projectile',
      },
      {
        weaponId: 'kyx_edge_v1',
        slot: 5,
        family: 'melee',
        attackModel: 'melee_contact',
      },
    ]);
    expect(new Set(KYX_WEAPON_PROFILES.map(({ slot }) => slot)).size).toBe(6);
    expect(hashKyxWeaponCatalog()).toMatch(/^[0-9a-f]{8}$/u);
    expect(hashKyxWeaponCatalog()).toBe(hashKyxWeaponCatalog());
    expect(KYX_WEAPON_PROFILES.every((profile) => (
      profile.catalogId === KYX_ARMORY_CATALOG_ID
      && profile.muzzlePolicy.barrelObstruction === 'eye_to_muzzle_fail_closed'
      && profile.muzzlePolicy.clientTransformClaimsAccepted === false
      && Object.isFrozen(profile)
    ))).toBe(true);
  });

  it('owns pistol cadence, ammo, reload transfer, and duplicate-input rejection on the server tick', () => {
    const initial = createAuthorityWeaponState({
      playerId: 'player_pistol',
      weaponId: KYX_WEAPON_ID.pistol,
      roomSeed: 'room_pistol',
      authorityTick: 0,
      selected: true,
    });
    const fired = advanceAuthorityWeapon(initial, {
      authorityTick: 4,
      authorityInputSequence: 4,
      lifePhase: 'alive',
      selected: true,
      sprintHeld: false,
      fireHeld: true,
      firePressed: true,
      reloadPressed: false,
    });
    expect(fired).toMatchObject({
      state: {
        phase: 'recovering',
        magazineRounds: 11,
        reserveRounds: 72,
        nextAttackAtTick: 8,
        acceptedAttackCount: 1,
      },
      acceptedAttack: {
        weaponId: KYX_WEAPON_ID.pistol,
        attackModel: 'hitscan',
        referenceDamagePoints: 18,
        magazineRoundsAfter: 11,
      },
    });
    expect(() => advanceAuthorityWeapon(fired.state, {
      authorityTick: 4,
      authorityInputSequence: 4,
      lifePhase: 'alive',
      selected: true,
      sprintHeld: false,
      fireHeld: true,
      firePressed: true,
      reloadPressed: false,
    })).toThrow(/must advance/u);
    const reloading = advanceAuthorityWeapon(fired.state, {
      authorityTick: 5,
      authorityInputSequence: 5,
      lifePhase: 'alive',
      selected: true,
      sprintHeld: false,
      fireHeld: false,
      firePressed: false,
      reloadPressed: true,
    });
    expect(reloading.state).toMatchObject({
      phase: 'reloading',
      reloadCompletesAtTick: 35,
    });
    const completed = advanceAuthorityWeapon(reloading.state, {
      authorityTick: 35,
      authorityInputSequence: 35,
      lifePhase: 'alive',
      selected: true,
      sprintHeld: false,
      fireHeld: false,
      firePressed: false,
      reloadPressed: false,
    });
    expect(completed.state).toMatchObject({
      phase: 'ready',
      magazineRounds: 12,
      reserveRounds: 71,
      reloadCompletesAtTick: null,
    });
  });

  it('switches slots fail-closed and emits one deterministic eight-pellet shotgun attack', () => {
    const initial = createAuthorityWeaponLoadout({
      playerId: 'player_loadout',
      roomSeed: 'room_loadout',
      authorityTick: 0,
    });
    const equipping = advanceAuthorityWeaponLoadout(initial, {
      authorityTick: 0,
      authorityInputSequence: 0,
      lifePhase: 'alive',
      selectedSlot: 2,
      sprintHeld: false,
      fireHeld: false,
      firePressed: false,
      reloadPressed: false,
    });
    const fired = advanceAuthorityWeaponLoadout(equipping.loadout, {
      authorityTick: 6,
      authorityInputSequence: 6,
      lifePhase: 'alive',
      selectedSlot: 2,
      sprintHeld: false,
      fireHeld: true,
      firePressed: true,
      reloadPressed: false,
    });
    expect(fired.acceptedAttacks).toHaveLength(1);
    expect(fired.acceptedAttacks[0]).toMatchObject({
      weaponId: KYX_WEAPON_ID.shotgun,
      attackModel: 'pellet_hitscan',
      magazineRoundsAfter: 5,
    });
    expect(fired.acceptedAttacks[0].ballistics).toHaveLength(8);
    expect(fired.acceptedAttacks[0].ballistics.map(({ pelletIndex }) => pelletIndex))
      .toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(() => advanceAuthorityWeaponLoadout(fired.loadout, {
      authorityTick: 7,
      authorityInputSequence: 7,
      lifePhase: 'alive',
      selectedSlot: 7,
      sprintHeld: false,
      fireHeld: true,
      firePressed: true,
      reloadPressed: false,
    })).not.toThrow();
    expect(kyxWeaponProfile(KYX_WEAPON_ID.shotgun).magazineCapacity).toBe(6);
  });

  it('resolves pistol and shotgun damage from authority pose/history with family-specific values', () => {
    const pistolAttack = acceptedAttack(KYX_WEAPON_ID.pistol, 4);
    const pistol = resolveAuthorityWeaponHitscanAttack({
      schemaVersion: 1,
      currentAuthorityTick: 4,
      serverReceiptTick: 4,
      shooterPose: shooter(4),
      acceptedLook: look(4),
      acceptedAttack: pistolAttack,
      observedRttHistory: [{
        schemaVersion: 1,
        observedAtReceiptTick: 4,
        roundTripMilliseconds: 0,
      }],
      targetHistories: [targetHistory(4, { region: 'head' })],
    }, clearWorld);
    expect(pistol.damageTotals).toEqual([{
      targetPlayerId: 'player_target',
      damagePoints: 27,
      pelletHits: 1,
    }]);

    const shotgunAttack = acceptedAttack(KYX_WEAPON_ID.shotgun, 6);
    const shotgun = resolveAuthorityWeaponHitscanAttack({
      schemaVersion: 1,
      currentAuthorityTick: 6,
      serverReceiptTick: 6,
      shooterPose: shooter(6),
      acceptedLook: look(6),
      acceptedAttack: shotgunAttack,
      observedRttHistory: [{
        schemaVersion: 1,
        observedAtReceiptTick: 6,
        roundTripMilliseconds: 0,
      }],
      targetHistories: [targetHistory(6, { halfExtent: 2_000 })],
    }, clearWorld);
    expect(shotgun.pelletResults).toHaveLength(8);
    expect(shotgun.damageTotals).toEqual([{
      targetPlayerId: 'player_target',
      damagePoints: 72,
      pelletHits: 8,
    }]);
    expect(kyxAuthoritativeHitscanProfile(kyxWeaponProfile(KYX_WEAPON_ID.sniper)))
      .toMatchObject({ referenceDamagePoints: 80, rangeMillimeters: 160_000 });
  });

  it('rejects a generic weapon shot before target resolution when its barrel segment is blocked', () => {
    const attack = acceptedAttack(KYX_WEAPON_ID.pistol, 4);
    const purposes: string[] = [];
    const result = resolveAuthorityWeaponHitscanAttack({
      schemaVersion: 1,
      currentAuthorityTick: 4,
      serverReceiptTick: 4,
      shooterPose: shooter(4, {
        eyeOffsetMillimeters: { x: 0, y: 1_000, z: 0 },
        muzzleOffsetMillimeters: { x: 0, y: 1_000, z: 400 },
      }),
      acceptedLook: look(4),
      acceptedAttack: attack,
      observedRttHistory: [{
        schemaVersion: 1,
        observedAtReceiptTick: 4,
        roundTripMilliseconds: 0,
      }],
      targetHistories: [targetHistory(4)],
    }, (ray) => {
      purposes.push(ray.purpose);
      return ray.purpose === 'barrel_clearance'
        ? {
            schemaVersion: 1,
            hit: true,
            distanceMillimeters: 200,
            colliderId: 'barrel_wall',
          }
        : clearWorld(ray);
    });
    expect(result.pelletResults[0]).toMatchObject({
      accepted: true,
      outcome: 'miss',
      reason: 'barrel_obstructed',
    });
    expect(purposes).toEqual(['barrel_clearance']);
  });

  it('spawns rockets only from a clear authority muzzle and advances collision exactly once', () => {
    const attack = acceptedAttack(KYX_WEAPON_ID.rocket, 10);
    const blocked = createAuthorityRocketProjectile({
      currentAuthorityTick: 10,
      shooterPose: shooter(10, {
        muzzleOffsetMillimeters: { x: 0, y: 1_000, z: 500 },
      }),
      acceptedLook: look(10),
      acceptedAttack: attack,
    }, (ray) => ray.purpose === 'barrel_clearance'
      ? {
          schemaVersion: 1,
          hit: true,
          distanceMillimeters: 250,
          colliderId: 'rocket_barrel_wall',
        }
      : clearWorld(ray));
    expect(blocked).toEqual({
      schemaVersion: 1,
      accepted: false,
      reason: 'barrel_obstructed',
      state: null,
    });

    const spawned = createAuthorityRocketProjectile({
      currentAuthorityTick: 10,
      shooterPose: shooter(10),
      acceptedLook: look(10),
      acceptedAttack: attack,
    }, clearWorld);
    expect(spawned).toMatchObject({
      accepted: true,
      state: {
        positionMillimeters: { x: 0, y: 1_000, z: 0 },
        velocityMillimetersPerSecond: { x: 0, y: 0, z: 24_000 },
        radiusMillimeters: 180,
        splashRadiusMillimeters: 4_500,
      },
    });
    if (!spawned.accepted) throw new Error('rocket unexpectedly blocked');
    const collide: AuthorityRocketSweepPort = () => ({
      schemaVersion: 1,
      hit: true,
      travelPermille: 500,
      colliderId: 'rocket_test_wall',
    });
    const advanced = advanceAuthorityRocketProjectile(spawned.state, 11, collide);
    expect(advanced).toMatchObject({
      state: {
        phase: 'detonated',
        positionMillimeters: { x: 0, y: 1_000, z: 600 },
      },
      detonation: {
        reason: 'collision',
        colliderId: 'rocket_test_wall',
        referenceDamagePoints: 90,
        splashRadiusMillimeters: 4_500,
      },
    });
    if (advanced.detonation === null) throw new Error('rocket did not detonate');
    expect(resolveAuthorityRocketSplash(
      advanced.detonation,
      [targetHistory(11, { z: 2_000, halfExtent: 100 })],
      clearWorld,
    )).toEqual({
      schemaVersion: 1,
      projectileId: advanced.detonation.projectileId,
      authorityTick: 11,
      impacts: [{
        targetPlayerId: 'player_target',
        targetTeamId: 'team_red',
        distanceMillimeters: 1_400,
        damagePoints: 69,
      }],
      occludedTargetIds: [],
    });
    expect(() => advanceAuthorityRocketProjectile(advanced.state, 12, collide))
      .toThrow(/only an active rocket/u);
  });

  it('resolves melee contact by authority range/arc/team/occlusion without a client target claim', () => {
    const attack = acceptedAttack(KYX_WEAPON_ID.melee, 3);
    const request = {
      schemaVersion: 1 as const,
      currentAuthorityTick: 3,
      shooterPose: shooter(3),
      acceptedLook: look(3),
      acceptedAttack: attack,
      targetHistories: [targetHistory(3, { z: 2_000, halfExtent: 100 })],
    };
    expect(resolveAuthorityMeleeContact(request, clearWorld)).toMatchObject({
      accepted: true,
      outcome: 'contact',
      targetPlayerId: 'player_target',
      distanceMillimeters: 2_000,
      damagePoints: 55,
    });
    expect(resolveAuthorityMeleeContact(request, () => ({
      schemaVersion: 1,
      hit: true,
      distanceMillimeters: 500,
      colliderId: 'melee_wall',
    }))).toMatchObject({
      accepted: true,
      outcome: 'miss',
      reason: 'world_occluded',
    });
    expect(resolveAuthorityMeleeContact({
      ...request,
      targetHistories: [targetHistory(3, { teamId: 'team_blue', z: 2_000 })],
    }, clearWorld)).toMatchObject({
      outcome: 'miss',
      reason: 'no_target',
    });
  });
});
