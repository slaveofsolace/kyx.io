import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  classifyKyxConfirmedDamagePresentation,
  createOnlineWeaponPresentationFx,
} from '../../../src/app/onlineWeaponPresentationFx';
import { createKyxWeaponPresentationModel } from '../../../src/weapons/KyxArmoryPresentation';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('online weapon confirmed-damage presentation', () => {
  it.each([
    [{ hitRegion: 'torso', healthPointsAfter: 30 }, 'hit'],
    [{ hitRegion: 'head', healthPointsAfter: 30 }, 'headshot'],
    [{ hitRegion: 'torso', healthPointsAfter: 0 }, 'kill'],
    [{ hitRegion: 'head', healthPointsAfter: 0 }, 'headshot_kill'],
  ] as const)('classifies %o as %s', (event, expected) => {
    expect(classifyKyxConfirmedDamagePresentation(event)).toBe(expected);
  });

  it('keeps recoil and the sniper tracer on accepted attack instead of replaying them for damage', () => {
    vi.stubGlobal('window', {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    const interactionTarget = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;
    const scene = new THREE.Scene();
    const presentation = createOnlineWeaponPresentationFx(
      scene,
      interactionTarget,
    );
    const sniper = createKyxWeaponPresentationModel(
      'kyx_longshot_v1',
      'first_person',
    );
    const muzzle = new THREE.Vector3(0, 1.4, 0);

    presentation.presentAttack({
      event: {
        schemaVersion: 1,
        kind: 'weapon_attack_accepted',
        eventId: 'attack.player_A.45.1',
        authorityTick: 45,
        playerId: 'player_A',
        weaponId: 'kyx_longshot_v1',
        family: 'sniper',
        attackModel: 'hitscan',
        attackOrdinal: 1,
        referenceDamagePoints: 80,
        magazineRoundsAfter: 4,
        reserveRoundsAfter: 20,
        nextAttackAtTick: 65,
        ballistics: [],
      },
      weapon: sniper,
      muzzle,
      direction: new THREE.Vector3(0, 0, -1),
      actorPosition: new THREE.Vector3(),
      yawMilliDegrees: 0,
      pitchMilliDegrees: 0,
      nowMilliseconds: 1_000,
      local: true,
    });

    expect(sniper.fireImpulse).toBe(1);
    expect(presentation.diagnostics()).toMatchObject({
      acceptedAttackPresentationCount: 1,
      activeTransientCount: 2,
    });
    const transientCountAfterAttack = presentation.diagnostics()
      .activeTransientCount;

    presentation.presentDamage({
      event: {
        schemaVersion: 1,
        kind: 'damage_applied',
        eventId: 'damage.player_A.45.1',
        eventSequence: 1,
        authorityTick: 45,
        causeId: 'attack.player_A.45.1',
        sourcePlayerId: 'player_A',
        targetPlayerId: 'player_B',
        shieldDamagePoints: 0,
        healthDamagePoints: 80,
        shieldPointsAfter: 0,
        healthPointsAfter: 20,
        hitRegion: 'head',
      },
      impactPosition: new THREE.Vector3(0, 1.65, -12),
      sourceMuzzle: muzzle,
      sourceWeapon: sniper,
      nowMilliseconds: 1_005,
      localSource: true,
      localTarget: false,
    });

    // Damage adds one impact and one headshot flair. A replayed sniper tracer
    // would make this delta three, while a second recoil owner would reset the
    // model impulse outside presentAttack.
    expect(
      presentation.diagnostics().activeTransientCount
        - transientCountAfterAttack,
    ).toBe(2);
    expect(sniper.fireImpulse).toBe(1);
    expect(scene.getObjectByName(
      'KYX_CONFIRMED_HEADSHOT_PRESENTATION',
    )).toBeDefined();
    expect(presentation.diagnostics()).toMatchObject({
      confirmedDamagePresentationCount: 1,
      headshotPresentationCount: 1,
      lastConfirmedDamagePresentation: 'headshot',
    });

    presentation.dispose();
  });
});
