import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  KYX_AUTHORITY_WEAPON_PRESENTATION,
  createKyxWeaponPresentationModel,
  type KyxAuthorityWeaponId,
} from '../../../src/weapons/KyxArmoryPresentation';

const WEAPON_IDS = Object.freeze(
  Object.keys(KYX_AUTHORITY_WEAPON_PRESENTATION) as KyxAuthorityWeaponId[],
);

const EXPECTED_SIGNATURE_NODE = Object.freeze({
  vertical_rifle_v1: 'KYX_VLR7_REFLEX_OPTIC',
  kyx_sidearm_v1: 'KYX_K9_POWER_CHAMBER',
  kyx_scattergun_v1: 'KYX_SG4_QUAD_CELL_DRUM',
  kyx_longshot_v1: 'KYX_LONGBOW12_SCOPE',
  kyx_breach_rocket_v1: 'KYX_BR6_LOCKING_CHAMBER',
  kyx_edge_v1: 'KYX_EDGE1_ENERGY_BLADE',
} satisfies Record<KyxAuthorityWeaponId, string>);

describe('KYX first-person armory presentation', () => {
  it('builds all six authority families with unique visual silhouettes', () => {
    const signatures = new Set<string>();
    const families = new Set<string>();
    const silhouettes = new Set<string>();

    for (const weaponId of WEAPON_IDS) {
      const model = createKyxWeaponPresentationModel(
        weaponId,
        'first_person',
      );
      model.group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model.group);
      const size = bounds.getSize(new THREE.Vector3());
      const signature = [
        size.x.toFixed(3),
        size.y.toFixed(3),
        size.z.toFixed(3),
      ].join('x');

      signatures.add(signature);
      families.add(model.family);
      silhouettes.add(model.silhouette);
      expect(model.group.getObjectByName(
        EXPECTED_SIGNATURE_NODE[weaponId],
      )).toBeDefined();
      expect(model.group.userData).toMatchObject({
        projectAuthoredPresentation: true,
        authorityWeaponId: weaponId,
        weaponFamily: model.family,
        weaponSilhouette: model.silhouette,
      });
      expect(model.muzzle.parent).not.toBeNull();
      expect(model.group.name).toBe(`ONLINE_FIRST_PERSON_${weaponId}`);
    }

    expect(families).toEqual(new Set([
      'rifle',
      'pistol',
      'shotgun',
      'sniper',
      'rocket',
      'melee',
    ]));
    expect(silhouettes.size).toBe(6);
    expect(signatures.size).toBe(6);
  });

  it('uses family-specific first-person framing instead of one shared pose', () => {
    const poses = WEAPON_IDS.map((weaponId) => {
      const model = createKyxWeaponPresentationModel(
        weaponId,
        'first_person',
      );
      return [
        model.group.position.toArray().map((value) => value.toFixed(3)),
        model.group.rotation.toArray().slice(0, 3)
          .map((value) => Number(value).toFixed(3)),
        model.group.scale.x.toFixed(3),
      ].flat().join('|');
    });

    expect(new Set(poses).size).toBe(WEAPON_IDS.length);
  });

  it('gives the VLR-7 a two-hand first-person contact rig without polluting world or blade presentation', () => {
    const firstPersonRifle = createKyxWeaponPresentationModel(
      'vertical_rifle_v1',
      'first_person',
    );
    expect(firstPersonRifle.firstPersonHandCount).toBe(2);
    expect(firstPersonRifle.firstPersonContactRig?.name).toBe(
      'KYX_VLR7_FIRST_PERSON_CONTACT_RIG',
    );
    expect(firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_DOMINANT_GRIP_CONTACT',
    )).toBeDefined();
    expect(firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_SUPPORT_GRIP_CONTACT',
    )).toBeDefined();
    expect(firstPersonRifle.group.userData).toMatchObject({
      firstPersonContactMode: 'authored_two_hand_rifle_v1',
      firstPersonHandCount: 2,
    });

    const worldRifle = createKyxWeaponPresentationModel(
      'vertical_rifle_v1',
      'world',
    );
    const firstPersonBlade = createKyxWeaponPresentationModel(
      'kyx_edge_v1',
      'first_person',
    );
    expect(worldRifle.firstPersonContactRig).toBeNull();
    expect(worldRifle.firstPersonHandCount).toBe(0);
    expect(firstPersonBlade.firstPersonContactRig).toBeNull();
    expect(firstPersonBlade.firstPersonHandCount).toBe(0);
  });
});
