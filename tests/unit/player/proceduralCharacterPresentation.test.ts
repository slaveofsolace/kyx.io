import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { buildPreviewCharacter } from '../../../src/player/PreviewCharacter.js';
import { createKyxWeaponPresentationModel } from '../../../src/weapons/KyxArmoryPresentation';

const SKIN = Object.freeze({ primary: 0x4f7788, secondary: 0x121820 });

function buildAnimatedFallback() {
  return buildPreviewCharacter(SKIN, 'assault', null, {
    allowHuman: false,
    animate: true,
    runtimeRole: 'test',
  });
}

describe('procedural character presentation', () => {
  it('consumes the measured direction signal without non-finite limb poses', () => {
    const character = buildAnimatedFallback();
    character.userData.setLocomotion(4, true, false, {
      planarSpeedMillimetersPerSecond: 4_000,
      forwardSpeedMillimetersPerSecond: 0,
      rightSpeedMillimetersPerSecond: 4_000,
      travelDirectionRadians: Math.PI / 2,
      strafeLean: -1,
      gaitPlaybackDirection: 1,
      sector: 'right',
      turnRateRadiansPerSecond: 0,
    });
    character.userData.actionTick(1 / 60);

    const diagnostics = character.userData.locomotionDiagnostics();
    expect(diagnostics.sector).toBe('right');
    expect(diagnostics.gaitPlaybackDirection).toBe(1);
    expect(diagnostics.rightRatio).toBeGreaterThan(0);
    const rigPivots = Object.values(character.userData.rig) as THREE.Group[];
    for (const pivot of rigPivots) {
      expect([
        pivot.rotation.x,
        pivot.rotation.y,
        pivot.rotation.z,
      ].every(Number.isFinite)).toBe(true);
    }
  });

  it('reverses gait cadence for a measured backpedal', () => {
    const character = buildAnimatedFallback();
    character.userData.setLocomotion(3, true, false, {
      planarSpeedMillimetersPerSecond: 3_000,
      forwardSpeedMillimetersPerSecond: -3_000,
      rightSpeedMillimetersPerSecond: 0,
      travelDirectionRadians: Math.PI,
      strafeLean: 0,
      gaitPlaybackDirection: -1,
      sector: 'backward',
      turnRateRadiansPerSecond: 0,
    });
    character.userData.actionTick(1 / 60);

    expect(
      character.userData.locomotionDiagnostics().gaitPlaybackDirection,
    ).toBe(-1);
  });

  it('binds weapon presentation to the animated right hand', () => {
    const character = buildAnimatedFallback();
    const weapon = new THREE.Group();
    weapon.userData.weaponFamily = 'rifle';

    character.userData.attachWeapon(weapon, false);

    expect(weapon.parent?.name).toBe('hand_R');
    expect(character.userData.locomotionDiagnostics().weaponAttached).toBe(true);
  });

  it.each([
    ['vertical_rifle_v1', 'rifle'],
    ['kyx_scattergun_v1', 'shotgun'],
    ['kyx_longshot_v1', 'sniper'],
    ['kyx_breach_rocket_v1', 'rocket'],
  ] as const)(
    'solves and reports a measured support-hand contact for %s',
    (weaponId, family) => {
      const character = buildAnimatedFallback();
      const weapon = createKyxWeaponPresentationModel(weaponId, 'world');

      character.userData.attachWeapon(weapon.group, false);
      for (let frame = 0; frame < 12; frame += 1) {
        character.userData.actionTick(1 / 60);
      }

      const contact = character.userData.getPresentationState().weaponContact;
      expect(contact.family).toBe(family);
      expect(contact.profileSource).toBe('procedural-proportion-fit');
      expect(contact.supportHandErrorMeters).toBeTypeOf('number');
      expect(
        contact.supportHandErrorMeters,
        JSON.stringify(contact),
      ).toBeLessThanOrEqual(0.12);
      expect(contact.supportHandContact).toBe(true);
    },
  );

  it('uses a stance pose and vertical offset without whole-body scaling', () => {
    const character = buildAnimatedFallback();

    character.userData.setStance('crouched');
    character.userData.actionTick(0.1);

    const diagnostics = character.userData.locomotionDiagnostics();
    expect(diagnostics.crouchMix).toBeGreaterThan(0.5);
    expect(diagnostics.stanceOffsetY).toBeLessThan(0);
    expect(character.userData.getStanceOffsetY()).toBeLessThan(0);
    expect(character.scale.toArray()).toEqual([1, 1, 1]);
  });

  it('presents jump, reload, melee, ability, and death through shared hooks', () => {
    const character = buildAnimatedFallback();
    character.userData.triggerJump();
    character.userData.actionTick(1 / 60);
    expect(character.userData.locomotionDiagnostics().grounded).toBe(false);

    character.userData.setLocomotion(0, true, false, 0);
    character.userData.triggerReload(0.3);
    character.userData.actionTick(0.1);
    expect(character.userData.locomotionDiagnostics().action).toBe('reload');

    character.userData.triggerMelee(0.3);
    character.userData.actionTick(0.1);
    expect(character.userData.locomotionDiagnostics().action).toBe('melee');

    character.userData.triggerAbility(0.3);
    character.userData.actionTick(0.1);
    expect(character.userData.locomotionDiagnostics().action).toBe('ability');

    character.userData.triggerDeath();
    character.userData.actionTick(0.1);
    expect(character.userData.locomotionDiagnostics().dead).toBe(true);
    expect(character.rotation.z).toBeLessThan(0);
  });
});
