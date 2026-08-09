import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  fitRev17WeaponContact,
  getRev17WeaponContactProfile,
  normalizeRev17LocomotionPresentation,
  rev17GaitPlaybackRate,
  rev17LocomotionClipKey,
  rev17ProjectedGaitSpeed,
  rev17RuntimeRoleLod,
} from '../../../src/player/rev17PresentationPolish.js';

describe('Rev17 runtime presentation polish', () => {
  it('uses LOD1 for every remote runtime role', () => {
    expect(rev17RuntimeRoleLod('preview')).toBe(0);
    expect(rev17RuntimeRoleLod('player')).toBe(0);
    expect(rev17RuntimeRoleLod('enemy')).toBe(1);
    expect(rev17RuntimeRoleLod('online_remote')).toBe(1);
  });

  it('preserves measured forward, strafe, and backpedal intent', () => {
    const strafe = normalizeRev17LocomotionPresentation(4, {
      planarSpeedMillimetersPerSecond: 4_000,
      forwardSpeedMillimetersPerSecond: 0,
      rightSpeedMillimetersPerSecond: 4_000,
      travelDirectionRadians: Math.PI / 2,
      strafeLean: -1,
      gaitPlaybackDirection: 1,
      sector: 'right',
      turnRateRadiansPerSecond: 1.25,
    });
    expect(strafe).toMatchObject({
      planarSpeed: 4,
      forwardRatio: 0,
      rightRatio: 1,
      strafeLean: -1,
      gaitPlaybackDirection: 1,
      sector: 'right',
      turnRateRadiansPerSecond: 1.25,
    });

    const backpedal = normalizeRev17LocomotionPresentation(2.2, {
      planarSpeedMillimetersPerSecond: 2_200,
      forwardSpeedMillimetersPerSecond: -2_200,
      rightSpeedMillimetersPerSecond: 0,
      travelDirectionRadians: Math.PI,
      strafeLean: 0,
      gaitPlaybackDirection: -1,
      sector: 'backward',
    });
    expect(backpedal.gaitPlaybackDirection).toBe(-1);
    expect(rev17GaitPlaybackRate('walk', backpedal)).toBeLessThan(0);
    expect(Object.isFrozen(backpedal)).toBe(true);
  });

  it('keeps legacy callers compatible while exposing their forward ratio', () => {
    const legacy = normalizeRev17LocomotionPresentation(
      3,
      0.6,
      -0.8,
      -2,
    );
    expect(legacy.forwardRatio).toBe(-0.8);
    expect(legacy.rightRatio).toBe(-0.6);
    expect(legacy.gaitPlaybackDirection).toBe(-1);
    expect(legacy.turnRateRadiansPerSecond).toBe(-2);
  });

  it('hands fast traversal to the run clip before walk cadence must overcrank', () => {
    expect(rev17LocomotionClipKey(0.45, false)).toBe('idle');
    expect(rev17LocomotionClipKey(0.8, false)).toBe('walk');
    expect(rev17LocomotionClipKey(2.99, false)).toBe('walk');
    expect(rev17LocomotionClipKey(3, false)).toBe('run');
    expect(rev17LocomotionClipKey(1.5, true)).toBe('run');

    const fastWalk = normalizeRev17LocomotionPresentation(2.99);
    const earlyRun = normalizeRev17LocomotionPresentation(3);
    expect(rev17GaitPlaybackRate('walk', fastWalk)).toBe(1.35);
    expect(rev17GaitPlaybackRate('run', earlyRun)).toBeCloseTo(3 / 5.5);
    expect(Math.abs(rev17ProjectedGaitSpeed(
      'run',
      rev17GaitPlaybackRate('run', earlyRun),
    ) - earlyRun.planarSpeed)).toBeLessThan(0.05);
    expect(rev17ProjectedGaitSpeed('idle', 1)).toBe(0);
  });

  it('plants the authored grip at the hand socket and aims the real muzzle', () => {
    const rig = new THREE.Group();
    const socket = new THREE.Object3D();
    socket.name = 'socket_weapon_r';
    const authoredMuzzle = new THREE.Object3D();
    authoredMuzzle.name = 'socket_muzzle';
    authoredMuzzle.position.set(0.08, -0.39, -0.77);
    socket.add(authoredMuzzle);
    rig.add(socket);

    const weapon = new THREE.Group();
    weapon.userData.weaponFamily = 'rifle';
    weapon.userData.muzzleNodeName = 'TEST_MUZZLE';
    const muzzle = new THREE.Object3D();
    muzzle.name = 'TEST_MUZZLE';
    muzzle.position.set(0, 0.105, -0.89);
    weapon.add(muzzle);
    socket.add(weapon);

    const contact = fitRev17WeaponContact(
      weapon,
      socket,
      authoredMuzzle,
      false,
    );
    rig.updateMatrixWorld(true);

    const profile = getRev17WeaponContactProfile(weapon, false);
    const plantedGrip = socket.worldToLocal(
      weapon.localToWorld(new THREE.Vector3(...profile.gripPoint)),
    );
    const muzzleDirection = muzzle.getWorldPosition(new THREE.Vector3())
      .sub(socket.getWorldPosition(new THREE.Vector3()))
      .normalize();
    const targetDirection = authoredMuzzle.getWorldPosition(new THREE.Vector3())
      .sub(socket.getWorldPosition(new THREE.Vector3()))
      .normalize();

    expect(plantedGrip.length()).toBeLessThan(1e-6);
    expect(muzzleDirection.dot(targetDirection)).toBeGreaterThan(0.9999);
    expect(contact.supportTarget?.name).toBe(
      'KYX_REV17_SUPPORT_HAND_CONTACT',
    );
    expect(contact.muzzleNodeName).toBe('TEST_MUZZLE');
  });
});
