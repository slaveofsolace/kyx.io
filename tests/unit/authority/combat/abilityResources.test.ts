import { describe, expect, it } from 'vitest';

import {
  advanceAutoRifle,
  advanceImpulseGrenadeAbility,
  createAuthorityTeleportResourceEvents,
  createAutoRifleState,
  createImpulseGrenadeAbilityState,
  deriveAuthorityAbilityResources,
  G4_ABILITY_RESOURCE_INTEGRATION_RULES,
  G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_HASH,
  G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_ID,
  G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_REVISION,
  type AutoRifleState,
  type ImpulseGrenadeAbilityState,
} from '../../../../src/authority/combat';

function movement(
  authorityTick: number,
  overrides: Partial<{
    readonly movementProfileId: string;
    readonly selectedSlot: number;
    readonly sprintHeld: boolean;
    readonly locomotion: 'grounded' | 'airborne' | 'sliding';
    readonly teleportCooldownTicksRemaining: number;
  }> = {},
) {
  return {
    schemaVersion: 1 as const,
    authorityTick,
    movementProfileId: overrides.movementProfileId ?? G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_ID,
    movementProfileRevision: G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_REVISION,
    movementProfileHash: G4_ABILITY_RESOURCE_MOVEMENT_PROFILE_HASH,
    selectedSlot: overrides.selectedSlot ?? 0,
    sprintHeld: overrides.sprintHeld ?? false,
    locomotion: overrides.locomotion ?? 'grounded' as const,
    teleportCooldownTicksRemaining: overrides.teleportCooldownTicksRemaining ?? 0,
  };
}

function initialStates(): {
  readonly autoRifle: AutoRifleState;
  readonly impulseGrenade: ImpulseGrenadeAbilityState;
} {
  return {
    autoRifle: createAutoRifleState({
      playerId: 'player_A',
      roomSeed: 'match_RESOURCE',
      authorityTick: 0,
    }),
    impulseGrenade: createImpulseGrenadeAbilityState({
      playerId: 'player_A',
      roomSeed: 'match_RESOURCE',
      authorityTick: 0,
    }),
  };
}

function resources(options: {
  readonly authorityTick?: number;
  readonly lifePhase?: 'alive' | 'dead';
  readonly autoRifle?: AutoRifleState;
  readonly impulseGrenade?: ImpulseGrenadeAbilityState;
  readonly selectedSlot?: number;
  readonly sprintHeld?: boolean;
  readonly locomotion?: 'grounded' | 'airborne' | 'sliding';
  readonly teleportCooldownTicksRemaining?: number;
  readonly activeImpulseGrenadeCount?: number;
  readonly movementProfileId?: string;
} = {}) {
  const states = initialStates();
  const authorityTick = options.authorityTick ?? 0;
  return deriveAuthorityAbilityResources({
    schemaVersion: 1,
    authorityTick,
    lifePhase: options.lifePhase ?? 'alive',
    movement: movement(authorityTick, options),
    autoRifle: options.autoRifle ?? states.autoRifle,
    impulseGrenade: options.impulseGrenade ?? states.impulseGrenade,
    activeImpulseGrenadeCount: options.activeImpulseGrenadeCount ?? 0,
  });
}

describe('P5.5 authoritative equip, cooldown, and resource policy', () => {
  it('pins a frozen loadout to the accepted movement profile without inventing teleport balance', () => {
    const snapshot = resources();
    expect(G4_ABILITY_RESOURCE_INTEGRATION_RULES).toMatchObject({
      authorityHz: 20,
      movementProfileId: 'phase3_hypothesis_v1',
      movementProfileRevision: 1,
      movementProfileHash: '8ab4ed437a4393c0',
      teleport: {
        maximumRangeMillimeters: 9_000,
        cooldownTicks: 160,
        cooldownOnFailure: false,
        resourcePolicy: 'movement_profile_cooldown_only',
        weaponRecoveryTicks: 0,
        combatStatePolicy: 'preserve_existing_combat_state',
      },
    });
    expect(snapshot).toMatchObject({
      loadout: {
        primaryWeaponId: 'vertical_rifle_v1',
        damageAbilityIds: ['vertical_impulse_grenade_v1', 'vertical_deployable_v1'],
        utilityAbilityId: 'vertical_teleport_v1',
        ammoAbilityEnabled: false,
      },
      equipped: { selectedWeaponSlot: 0, primaryWeaponEquipped: true },
      damageAbilityTwo: { status: 'contract_only_unavailable' },
      utilityAbility: {
        phase: 'ready',
        destinationAuthority: 'movement_query_port',
        cooldownTicksRemaining: 0,
      },
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.utilityAbility)).toBe(true);
  });

  it('derives equip and reload state from the authority-owned Auto Rifle transition', () => {
    const initial = initialStates();
    const equipping = advanceAutoRifle(initial.autoRifle, {
      authorityTick: 0,
      authorityInputSequence: 0,
      lifePhase: 'alive',
      weaponSelected: true,
      sprintHeld: false,
      fireHeld: false,
      reloadPressed: false,
    });
    expect(equipping.accepted).toBe(true);
    if (!equipping.accepted) return;
    const holstered = resources({ authorityTick: 0, autoRifle: equipping.state, selectedSlot: 1 });
    expect(holstered.equipped).toEqual({ selectedWeaponSlot: 1, primaryWeaponEquipped: false });
    expect(holstered.primaryWeapon).toMatchObject({
      phase: 'equipping',
      magazineRounds: 50,
      reserveRounds: 150,
    });
  });

  it('reports grenade readiness, cooldown, and the exact active projectile ceiling', () => {
    const initial = initialStates();
    const thrown = advanceImpulseGrenadeAbility(initial.impulseGrenade, {
      authorityTick: 8,
      authorityInputSequence: 8,
      lifePhase: 'alive',
      abilityEquipped: true,
      throwPressed: true,
      activeProjectileCount: 1,
    });
    expect(thrown.accepted).toBe(true);
    if (!thrown.accepted) return;
    expect(resources({
      authorityTick: 8,
      impulseGrenade: thrown.state,
      activeImpulseGrenadeCount: 2,
    }).damageAbilityOne).toMatchObject({
      phase: 'ready',
      cooldownTicksRemaining: 240,
      currentCharges: 1,
      maximumCharges: 2,
      activeProjectileCount: 2,
      maximumActiveProjectileCount: 2,
      resourcePolicy: 'two_charges_sequential_recharge',
    });
    expect(() => resources({ activeImpulseGrenadeCount: 3 })).toThrow(
      /active impulse grenade count/u,
    );
  });

  it('makes death an explicit lock and fails closed on mismatched profile or future state', () => {
    expect(resources({
      lifePhase: 'dead',
      sprintHeld: true,
      locomotion: 'sliding',
      teleportCooldownTicksRemaining: 12,
    })).toMatchObject({
      primaryWeapon: { phase: 'dead' },
      damageAbilityOne: { phase: 'dead' },
      utilityAbility: { phase: 'dead', cooldownTicksRemaining: 12 },
      locks: { dead: true, sprinting: true, sliding: true },
    });
    expect(() => resources({ movementProfileId: 'client_override' })).toThrow(
      /movement profile id/u,
    );
    expect(() => resources({ teleportCooldownTicksRemaining: 161 })).toThrow(
      /teleport cooldown remaining/u,
    );
  });

  it('confirms only a movement-owned success carrying the full accepted cooldown', () => {
    const snapshot = resources({ teleportCooldownTicksRemaining: 160 });
    expect(createAuthorityTeleportResourceEvents({
      schemaVersion: 1,
      authorityTick: 0,
      playerId: 'player_A',
      teleportOutcomes: [{
        kind: 'teleport_succeeded',
        tick: 0,
        entityId: 'player_A',
        outcome: 'full',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 0, y: 0, z: 9_000 },
      }],
      resources: snapshot,
    })).toEqual([{
      kind: 'teleport_resource_confirmed',
      eventId: 'ability_resource.player_A.0.teleport.0',
      authorityTick: 0,
      playerId: 'player_A',
      abilityId: 'vertical_teleport_v1',
      outcome: 'full',
      from: { x: 0, y: 0, z: 0 },
      to: { x: 0, y: 0, z: 9_000 },
      cooldownTicksRemaining: 160,
      weaponRecoveryTicks: 0,
      combatStatePolicy: 'preserve_existing_combat_state',
    }]);
    expect(() => createAuthorityTeleportResourceEvents({
      schemaVersion: 1,
      authorityTick: 0,
      playerId: 'player_A',
      teleportOutcomes: [{
        kind: 'teleport_succeeded',
        tick: 0,
        entityId: 'player_A',
        outcome: 'full',
        from: { x: 0, y: 0, z: 0 },
        to: { x: 0, y: 0, z: 9_000 },
      }],
      resources: resources(),
    })).toThrow(/full movement cooldown/u);
  });

  it('records non-consuming failures and rejects duplicate or forged movement outcomes', () => {
    const ready = resources();
    expect(createAuthorityTeleportResourceEvents({
      schemaVersion: 1,
      authorityTick: 0,
      playerId: 'player_A',
      teleportOutcomes: [{
        kind: 'teleport_rejected',
        tick: 0,
        entityId: 'player_A',
        reason: 'blocked',
      }],
      resources: ready,
    })).toEqual([expect.objectContaining({
      kind: 'teleport_resource_rejected',
      reason: 'blocked',
      cooldownTicksRemaining: 0,
      cooldownConsumedByFailure: false,
    })]);
    expect(() => createAuthorityTeleportResourceEvents({
      schemaVersion: 1,
      authorityTick: 0,
      playerId: 'player_A',
      teleportOutcomes: [
        { kind: 'teleport_rejected', tick: 0, entityId: 'player_A', reason: 'blocked' },
        { kind: 'teleport_rejected', tick: 0, entityId: 'player_A', reason: 'blocked' },
      ],
      resources: ready,
    })).toThrow(/at most one teleport outcome/u);
    expect(() => createAuthorityTeleportResourceEvents({
      schemaVersion: 1,
      authorityTick: 0,
      playerId: 'player_A',
      teleportOutcomes: [{
        kind: 'teleport_rejected',
        tick: 0,
        entityId: 'player_A',
        reason: 'blocked',
        claimedCooldownTicks: 160,
      } as never],
      resources: ready,
    })).toThrow(/unsupported or missing fields/u);
  });
});
