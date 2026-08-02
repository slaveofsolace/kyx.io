import { describe, expect, it } from 'vitest';

import {
  ABILITY_ID,
  DEFAULT_ABILITY_LOADOUT,
} from '../../../../src/abilities/abilityLoadout';
import {
  AUTHORITY_FLASH_IMPAIRMENT_RULES,
  abilityLoadoutReconnectPayload,
  advanceAuthorityAbilityLoadout,
  createAuthorityAbilityLoadoutRuntimeState,
  createAuthorityAbilityProjectile,
  resolveAuthorityAbilityEffect,
  type AuthorityAbilityDetonatedV1,
  type AuthorityAbilityEffectTargetV1,
} from '../../../../src/authority/combat/abilityLoadoutRuntime';
import { INTENT_BUTTON } from '../../../../src/sim';

describe('authoritative four-slot ability loadout runtime', () => {
  it('owns two sequential charges and preserves recharge state for reconnect', () => {
    let state = createAuthorityAbilityLoadoutRuntimeState({
      playerId: 'player_A',
      roomSeed: 'room_A',
      authorityTick: 0,
      loadout: DEFAULT_ABILITY_LOADOUT,
    });

    const first = advanceAuthorityAbilityLoadout(state, {
      authorityTick: 1,
      pressedButtons: INTENT_BUTTON.abilityTwo,
      alive: true,
    });
    expect(first.accepted).toHaveLength(1);
    expect(first.accepted[0]?.abilityId).toBe(ABILITY_ID.smoke);
    expect(first.state.currentCharges).toEqual([2, 1, 2]);
    expect(first.state.cooldownEndsAtTicks).toEqual([0, 201, 0]);
    state = first.state;

    const second = advanceAuthorityAbilityLoadout(state, {
      authorityTick: 2,
      pressedButtons: INTENT_BUTTON.abilityTwo,
      alive: true,
    });
    expect(second.accepted).toHaveLength(1);
    expect(second.state.currentCharges).toEqual([2, 0, 2]);
    expect(second.state.cooldownEndsAtTicks).toEqual([0, 201, 0]);
    state = second.state;

    const empty = advanceAuthorityAbilityLoadout(state, {
      authorityTick: 3,
      pressedButtons: INTENT_BUTTON.abilityTwo,
      alive: true,
    });
    expect(empty.accepted).toHaveLength(0);
    expect(empty.events).toMatchObject([{ reason: 'cooldown' }]);
    state = empty.state;

    const firstRecharge = advanceAuthorityAbilityLoadout(state, {
      authorityTick: 201,
      pressedButtons: 0,
      alive: true,
    });
    expect(firstRecharge.state.currentCharges).toEqual([2, 1, 2]);
    expect(firstRecharge.state.cooldownEndsAtTicks).toEqual([0, 401, 0]);
    state = firstRecharge.state;

    const fullRecharge = advanceAuthorityAbilityLoadout(state, {
      authorityTick: 401,
      pressedButtons: 0,
      alive: true,
    });
    expect(fullRecharge.state.currentCharges).toEqual([2, 2, 2]);
    expect(abilityLoadoutReconnectPayload(fullRecharge.state)).toMatchObject({
      slots: DEFAULT_ABILITY_LOADOUT.slots,
      currentCharges: [2, 2, 2],
      maximumCharges: [2, 2, 2],
      acceptedActivationCounts: [0, 2, 0],
    });
  });

  it('quarantines Launch from the generic throwable projectile runtime', () => {
    const state = createAuthorityAbilityLoadoutRuntimeState({
      playerId: 'player_A',
      roomSeed: 'room_A',
      authorityTick: 0,
      loadout: DEFAULT_ABILITY_LOADOUT,
    });
    const activation = advanceAuthorityAbilityLoadout(state, {
      authorityTick: 1,
      pressedButtons: INTENT_BUTTON.abilityOne,
      alive: true,
    }).accepted[0];
    expect(activation?.abilityId).toBe(ABILITY_ID.launch);
    if (activation === undefined) throw new Error('expected a Launch activation');
    expect(() => createAuthorityAbilityProjectile({
      activation,
      ownerTeamId: 'team_blue',
      originMillimeters: { x: 0, y: 1_800, z: 0 },
      lookYawMilliDegrees: 0,
      lookPitchMilliDegrees: 0,
    })).toThrow('AUTHORITY_LAUNCH_REQUIRES_DEDICATED_IMPULSE_RUNTIME');
  });

  it('weights Flash by authority distance, line of sight, and target facing without stealing input', () => {
    const detonation: AuthorityAbilityDetonatedV1 = {
      kind: 'ability_projectile_detonated',
      eventId: 'ability.flash.projectile.1.detonation',
      authorityTick: 50,
      projectileId: 'ability.flash.projectile.1',
      ownerPlayerId: 'player_A',
      ownerTeamId: 'team_blue',
      abilityId: ABILITY_ID.flash,
      positionMillimeters: { x: 0, y: 1_000, z: 0 },
      areaRadiusMillimeters: 12_000,
      damageHealthPoints: 0,
      effect: 'flash',
      effectDurationTicks: 45,
      reason: 'fuse',
    };
    const target = (
      playerId: string,
      lookYawMilliDegrees: number,
    ): AuthorityAbilityEffectTargetV1 => ({
      playerId,
      teamId: 'team_red',
      alive: true,
      lookYawMilliDegrees,
      lookPitchMilliDegrees: 0,
      feetPositionMillimeters: { x: 0, y: 0, z: 5_000 },
      centerPositionMillimeters: { x: 0, y: 1_000, z: 5_000 },
      currentVelocityMillimetersPerSecond: { x: 0, y: 0, z: 0 },
      capsule: { heightMillimeters: 1_800, radiusMillimeters: 350 },
    });
    const outcomes = resolveAuthorityAbilityEffect({
      detonation,
      targets: [
        target('player_facing', 180_000),
        target('player_side', 90_000),
        target('player_away', 0),
      ],
      world: {
        traceRadialOcclusion: () => ({ schemaVersion: 1, kind: 'clear' }),
        resolveCollisionSafeImpulse: (request) => ({
          schemaVersion: 1,
          appliedImpulseMillimetersPerSecond:
            request.requestedImpulseMillimetersPerSecond,
        }),
      },
    });
    const facing = outcomes.find(({ targetPlayerId }) => targetPlayerId === 'player_facing');
    const side = outcomes.find(({ targetPlayerId }) => targetPlayerId === 'player_side');
    const away = outcomes.find(({ targetPlayerId }) => targetPlayerId === 'player_away');

    expect(AUTHORITY_FLASH_IMPAIRMENT_RULES).toMatchObject({
      minimumPeripheralExposurePermille: 250,
      facingExposureWeightPermille: 750,
    });
    expect(facing).toMatchObject({ status: 'applied', flashFacingPermille: 1_000 });
    expect(side).toMatchObject({ status: 'applied', flashFacingPermille: 500 });
    expect(away).toMatchObject({ status: 'applied', flashFacingPermille: 0 });
    expect(facing?.flashIntensityPermille).toBeGreaterThan(side?.flashIntensityPermille ?? 0);
    expect(side?.flashIntensityPermille).toBeGreaterThan(away?.flashIntensityPermille ?? 0);
    expect(facing?.flashDurationTicks).toBeGreaterThan(side?.flashDurationTicks ?? 0);
    expect(side?.flashDurationTicks).toBeGreaterThan(away?.flashDurationTicks ?? 0);
    expect(outcomes.every(({ damageHealthPoints, impulseMillimetersPerSecond }) => (
      damageHealthPoints === 0
      && impulseMillimetersPerSecond.x === 0
      && impulseMillimetersPerSecond.y === 0
      && impulseMillimetersPerSecond.z === 0
    ))).toBe(true);

    const occluded = resolveAuthorityAbilityEffect({
      detonation,
      targets: [target('player_occluded', 180_000)],
      world: {
        traceRadialOcclusion: () => ({
          schemaVersion: 1,
          kind: 'blocked',
          colliderId: 'world.wall',
        }),
        resolveCollisionSafeImpulse: (request) => ({
          schemaVersion: 1,
          appliedImpulseMillimetersPerSecond:
            request.requestedImpulseMillimetersPerSecond,
        }),
      },
    });
    expect(occluded).toEqual([expect.objectContaining({
      status: 'occluded',
      flashDurationTicks: 0,
      flashIntensityPermille: 0,
      flashFacingPermille: 0,
    })]);
  });
});
