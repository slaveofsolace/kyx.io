import { describe, expect, it } from 'vitest';

import {
  G4_IMPULSE_GRENADE_RULES,
  IMPULSE_GRENADE_WORLD_ONLY_LAYERS,
  IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
  advanceImpulseGrenadeAbility,
  advanceImpulseGrenadeProjectile,
  createImpulseGrenadeAbilityState,
  createImpulseGrenadeProjectile,
  resolveImpulseGrenadeRadialImpulse,
  type AuthorityImpulseGrenadeWorldPort,
  type ImpulseGrenadeCollisionSafeImpulseRequestV1,
  type ImpulseGrenadeDetonatedEvent,
  type ImpulseGrenadeProjectileState,
  type ImpulseGrenadeRadialOcclusionRequestV1,
  type ImpulseGrenadeRadialTargetV1,
  type ImpulseGrenadeSweepSphereRequestV1,
  type ImpulseGrenadeSweepSphereResultV1,
  type ImpulseGrenadeThrowAcceptedEvent,
} from '../../../../src/authority';

const Q15 = 32_767;

function acceptedThrow(spawnTick = 8): ImpulseGrenadeThrowAcceptedEvent {
  const initial = createImpulseGrenadeAbilityState({
    playerId: 'player_A',
    roomSeed: 'match_P54',
    authorityTick: 0,
  });
  const result = advanceImpulseGrenadeAbility(initial, {
    authorityTick: spawnTick,
    authorityInputSequence: 0,
    lifePhase: 'alive',
    abilityEquipped: true,
    throwPressed: true,
    activeProjectileCount: 0,
  });
  if (!result.accepted || result.throw === null) throw new Error('expected an accepted throw');
  return result.throw;
}

function projectile(spawnTick = 8): ImpulseGrenadeProjectileState {
  return createImpulseGrenadeProjectile({
    schemaVersion: 1,
    acceptedThrow: acceptedThrow(spawnTick),
    ownerTeamId: 'team_blue',
    authorityOriginMillimeters: { x: 0, y: 1_800, z: 0 },
    authorityLookYawMilliDegrees: 0,
    authorityLookPitchMilliDegrees: 0,
    roomSeed: 'match_P54',
  });
}

function world(options: {
  readonly sweep?: (request: ImpulseGrenadeSweepSphereRequestV1) => ImpulseGrenadeSweepSphereResultV1;
  readonly occlusion?: (request: ImpulseGrenadeRadialOcclusionRequestV1) =>
    ReturnType<AuthorityImpulseGrenadeWorldPort['traceRadialOcclusion']>;
  readonly safeImpulse?: (request: ImpulseGrenadeCollisionSafeImpulseRequestV1) =>
    ReturnType<AuthorityImpulseGrenadeWorldPort['resolveCollisionSafeImpulse']>;
} = {}): AuthorityImpulseGrenadeWorldPort {
  return {
    schemaVersion: IMPULSE_GRENADE_WORLD_PORT_SCHEMA_VERSION,
    sweepSphere: options.sweep ?? (() => ({ schemaVersion: 1, contacts: [] })),
    traceRadialOcclusion: options.occlusion ?? (() => ({ schemaVersion: 1, kind: 'clear' })),
    resolveCollisionSafeImpulse: options.safeImpulse ?? ((request) => ({
      schemaVersion: 1,
      appliedImpulseMillimetersPerSecond: request.requestedImpulseMillimetersPerSecond,
    })),
  };
}

function step(
  state: ImpulseGrenadeProjectileState,
  authorityTick: number,
  port: Pick<AuthorityImpulseGrenadeWorldPort, 'sweepSphere'>,
): ImpulseGrenadeProjectileState {
  const result = advanceImpulseGrenadeProjectile(state, authorityTick, port);
  if (!result.accepted) throw new Error(`projectile step rejected: ${result.reason}`);
  return result.state;
}

function radialTarget(options: {
  readonly playerId: string;
  readonly teamId?: string | null;
  readonly lifePhase?: 'alive' | 'dead';
  readonly center: Readonly<{ readonly x: number; readonly y: number; readonly z: number }>;
}): ImpulseGrenadeRadialTargetV1 {
  return {
    schemaVersion: 1,
    playerId: options.playerId,
    teamId: options.teamId ?? 'team_red',
    lifePhase: options.lifePhase ?? 'alive',
    feetPositionMillimeters: options.center,
    centerPositionMillimeters: options.center,
    capsule: { heightMillimeters: 1_800, radiusMillimeters: 400 },
    currentVelocityMillimetersPerSecond: { x: 0, y: 0, z: 0 },
  };
}

function detonation(): ImpulseGrenadeDetonatedEvent {
  return {
    kind: 'impulse_grenade_detonated',
    eventId: 'projectile_A.detonation',
    authorityTick: 38,
    projectileId: 'projectile_A',
    ownerPlayerId: 'player_A',
    ownerTeamId: 'team_blue',
    reason: 'fuse',
    positionMillimeters: { x: 0, y: 0, z: 0 },
    areaRadiusMillimeters: 11_000,
    damageHealthPoints: 0,
  };
}

describe('P5.4 authoritative Impulse Grenade foundation', () => {
  it('enforces equip readiness, two sequential charges, and the two-active limit', () => {
    let state = createImpulseGrenadeAbilityState({
      playerId: 'player_A',
      roomSeed: 'match_P54',
      authorityTick: 0,
    });
    const early = advanceImpulseGrenadeAbility(state, {
      authorityTick: 1,
      authorityInputSequence: 1,
      lifePhase: 'alive',
      abilityEquipped: true,
      throwPressed: true,
      activeProjectileCount: 0,
    });
    expect(early).toMatchObject({ accepted: true, throw: null, throwRejection: 'equipping' });
    if (!early.accepted) throw new Error('expected accepted authority tick');
    state = early.state;

    const accepted = advanceImpulseGrenadeAbility(state, {
      authorityTick: 8,
      authorityInputSequence: 8,
      lifePhase: 'alive',
      abilityEquipped: true,
      throwPressed: true,
      activeProjectileCount: 0,
    });
    expect(accepted).toMatchObject({
      accepted: true,
      state: {
        phase: 'ready',
        cooldownEndsAtTick: 248,
        currentCharges: 1,
        maximumCharges: 2,
        acceptedThrowCount: 1,
      },
      throw: { authorityTick: 8, throwOrdinal: 1, cooldownEndsAtTick: 248 },
      throwRejection: null,
    });
    if (!accepted.accepted) throw new Error('expected accepted authority tick');

    const secondCharge = advanceImpulseGrenadeAbility(accepted.state, {
      authorityTick: 9,
      authorityInputSequence: 9,
      lifePhase: 'alive',
      abilityEquipped: true,
      throwPressed: true,
      activeProjectileCount: 1,
    });
    expect(secondCharge).toMatchObject({
      accepted: true,
      state: {
        phase: 'cooldown',
        cooldownEndsAtTick: 248,
        currentCharges: 0,
        maximumCharges: 2,
        acceptedThrowCount: 2,
      },
      throw: { authorityTick: 9, throwOrdinal: 2, cooldownEndsAtTick: 248 },
      throwRejection: null,
    });
    if (!secondCharge.accepted) throw new Error('expected accepted authority tick');

    const capped = advanceImpulseGrenadeAbility(secondCharge.state, {
      authorityTick: 248,
      authorityInputSequence: 248,
      lifePhase: 'alive',
      abilityEquipped: true,
      throwPressed: true,
      activeProjectileCount: 2,
    });
    expect(capped).toMatchObject({
      accepted: true,
      state: { phase: 'ready', currentCharges: 1, acceptedThrowCount: 2 },
      throw: null,
      throwRejection: 'active_projectile_limit',
    });
  });

  it('applies the reviewed gravity and forward speed on the fixed 20 Hz authority tick', () => {
    const first = projectile();
    const second = projectile();
    expect(first.seed).toBe(second.seed);
    expect(first.velocityMillimetersPerSecond).toEqual({ x: 0, y: 0, z: 18_000 });
    const seen: ImpulseGrenadeSweepSphereRequestV1[] = [];
    const after = step(first, 8, world({
      sweep: (request) => {
        seen.push(request);
        return { schemaVersion: 1, contacts: [] };
      },
    }));
    expect(after.positionMillimeters).toEqual({ x: 0, y: 1_752, z: 900 });
    expect(after.velocityMillimetersPerSecond).toEqual({ x: 0, y: -960, z: 18_000 });
    expect(seen[0]).toMatchObject({
      solidLayers: IMPULSE_GRENADE_WORLD_ONLY_LAYERS,
      ignoredPlayerIds: [],
      translationMillimeters: { x: 0, y: -48, z: 900 },
    });
  });

  it('fails closed if a world-only sweep adapter returns a player body', () => {
    const port = world({
      sweep: () => ({
        schemaVersion: 1,
        contacts: [{
          colliderId: 'body_B',
          layer: 'player_body',
          playerId: 'player_B',
          timeOfImpactPermille: 250,
          normalQ15: { x: 0, y: 0, z: -Q15 },
        }],
      }),
    });
    expect(() => advanceImpulseGrenadeProjectile(projectile(), 8, port))
      .toThrow(/outside the requested collision mask/u);
  });

  it('sorts world contacts and emits collision then detonation on the same tick without a bounce', () => {
    const port = world({
      sweep: () => ({
        schemaVersion: 1,
        contacts: [
          {
            colliderId: 'world_late',
            layer: 'world_static',
            playerId: null,
            timeOfImpactPermille: 700,
            normalQ15: { x: 0, y: 0, z: -Q15 },
          },
          {
            colliderId: 'door_early',
            layer: 'door',
            playerId: null,
            timeOfImpactPermille: 250,
            normalQ15: { x: 0, y: 0, z: -Q15 },
          },
        ],
      }),
    });
    const result = advanceImpulseGrenadeProjectile(projectile(), 8, port);
    expect(result).toMatchObject({
      accepted: true,
      state: {
        phase: 'detonated',
        positionMillimeters: { x: 0, y: 1_788, z: 224 },
        velocityMillimetersPerSecond: { x: 0, y: 0, z: 0 },
        bounceCount: 0,
        fuseStartedAtTick: 8,
        detonatesAtTick: 8,
        settled: true,
      },
      events: [
        {
          kind: 'impulse_grenade_collision',
          eventId: expect.stringContaining('.collision.8.0'),
          colliderId: 'door_early',
          layer: 'door',
          playerId: null,
          bounceCount: 0,
          fuseStartedAtTick: 8,
          detonatesAtTick: 8,
          settled: true,
        },
        {
          kind: 'impulse_grenade_detonated',
          eventId: expect.stringContaining('.detonation'),
          authorityTick: 8,
          reason: 'collision',
          damageHealthPoints: 0,
        },
      ],
      detonation: { authorityTick: 8, reason: 'collision', damageHealthPoints: 0 },
    });
    if (!result.accepted) throw new Error('expected contact detonation');
    expect(advanceImpulseGrenadeProjectile(result.state, 9, port)).toMatchObject({
      accepted: false,
      reason: 'already_detonated',
    });
  });

  it('applies LOS, linear falloff, friendly filtering, and separate self/enemy caps', () => {
    const port = world({
      occlusion: (request) => request.targetPlayerId === 'player_D'
        ? { schemaVersion: 1, kind: 'blocked', colliderId: 'wall_D' }
        : { schemaVersion: 1, kind: 'clear' },
    });
    const result = resolveImpulseGrenadeRadialImpulse({
      schemaVersion: 1,
      detonation: detonation(),
      targets: [
        radialTarget({ playerId: 'player_F', center: { x: 0, y: 0, z: 11_000 } }),
        radialTarget({ playerId: 'player_A', teamId: 'team_blue', center: { x: 0, y: 0, z: 0 } }),
        radialTarget({ playerId: 'player_B', center: { x: 0, y: 0, z: 5_500 } }),
        radialTarget({ playerId: 'player_C', teamId: 'team_blue', center: { x: 0, y: 0, z: 100 } }),
        radialTarget({ playerId: 'player_D', center: { x: 0, y: 0, z: 1_000 } }),
        radialTarget({
          playerId: 'player_E',
          lifePhase: 'dead',
          center: { x: 0, y: 0, z: 100 },
        }),
      ],
    }, port);
    expect(result.outcomes).toEqual([
      expect.objectContaining({ targetPlayerId: 'player_A', status: 'applied' }),
      expect.objectContaining({ targetPlayerId: 'player_B', status: 'applied' }),
      { targetPlayerId: 'player_C', status: 'friendly_impulse_blocked', event: null },
      { targetPlayerId: 'player_D', status: 'occluded', event: null },
      { targetPlayerId: 'player_E', status: 'dead', event: null },
      { targetPlayerId: 'player_F', status: 'outside_radius', event: null },
    ]);
    expect(result.events).toEqual([
      expect.objectContaining({
        targetPlayerId: 'player_A',
        relation: 'self',
        falloffPermille: 1_000,
        requestedImpulseMillimetersPerSecond: { x: 0, y: 8_000, z: 0 },
        damageHealthPoints: 0,
      }),
      expect.objectContaining({
        targetPlayerId: 'player_B',
        relation: 'enemy',
        distanceMillimeters: 5_500,
        falloffPermille: 500,
        requestedImpulseMillimetersPerSecond: { x: 0, y: 0, z: 3_500 },
        damageHealthPoints: 0,
      }),
    ]);
  });

  it('fails closed when a collision-safety adapter amplifies an impulse', () => {
    const unsafe = world({
      safeImpulse: (request) => ({
        schemaVersion: 1,
        appliedImpulseMillimetersPerSecond: {
          ...request.requestedImpulseMillimetersPerSecond,
          z: request.requestedImpulseMillimetersPerSecond.z + 1,
        },
      }),
    });
    expect(() => resolveImpulseGrenadeRadialImpulse({
      schemaVersion: 1,
      detonation: detonation(),
      targets: [radialTarget({ playerId: 'player_B', center: { x: 0, y: 0, z: 5_500 } })],
    }, unsafe)).toThrow(/cannot redirect or amplify/u);
  });

  it('keeps the dedicated revision-2 runtime capability frozen and exact', () => {
    expect(G4_IMPULSE_GRENADE_RULES).toMatchObject({
      schemaVersion: 2,
      projectileSpeedMillimetersPerSecond: 18_000,
      projectileAccelerationMillimetersPerSecondSquared: { x: 0, y: -19_200, z: 0 },
      fuseTicks: 0,
      fuseStarts: 'first_qualifying_world_collision',
      lifetimeTicks: 120,
      maximumBounces: 0,
      playerCollisionPolicy: 'ignored',
      areaRadiusMillimeters: 11_000,
      damageHealthPoints: 0,
    });
    expect(Object.isFrozen(G4_IMPULSE_GRENADE_RULES)).toBe(true);
    expect(Object.isFrozen(G4_IMPULSE_GRENADE_RULES.projectileAccelerationMillimetersPerSecondSquared))
      .toBe(true);
  });
});
