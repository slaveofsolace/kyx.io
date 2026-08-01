import { describe, expect, it } from 'vitest';

import {
  ABILITY_ID,
  DEFAULT_ABILITY_LOADOUT,
} from '../../../../src/abilities/abilityLoadout';
import {
  abilityLoadoutReconnectPayload,
  advanceAuthorityAbilityLoadout,
  createAuthorityAbilityLoadoutRuntimeState,
  createAuthorityAbilityProjectile,
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
});
