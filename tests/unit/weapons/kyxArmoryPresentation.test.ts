import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  KYX_AUTHORITY_WEAPON_PRESENTATION,
  KYX_FIRST_PERSON_TRANSITION_PROFILE,
  KYX_WORLD_WEAPON_MOUNT_PROFILE,
  createKyxWeaponPresentationModel,
  installKyxLineRifleReviewShellFactory,
  installKyxWeaponReviewShellFactory,
  setKyxWeaponAim,
  setKyxWeaponPhase,
  triggerKyxWeaponEquip,
  updateKyxWeaponPresentation,
  type KyxAuthorityWeaponId,
} from '../../../src/weapons/KyxArmoryPresentation';
import {
  KYX_FIRST_PERSON_CONTACT_SEAM,
} from '../../../src/weapons/KyxFirstPersonContactRig';

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

  it('keeps the compact sidearm, launcher, and blade out of the near-camera danger zone', () => {
    const correctedProfiles = Object.freeze({
      kyx_sidearm_v1: Object.freeze({
        scale: 0.74,
        position: Object.freeze([0.245, -0.335, -0.68]),
        rotation: Object.freeze([-0.06, 0.16, -0.045]),
      }),
      kyx_breach_rocket_v1: Object.freeze({
        scale: 0.52,
        position: Object.freeze([0.25, -0.35, -0.79]),
        rotation: Object.freeze([-0.055, 0.11, 0.018]),
      }),
      kyx_edge_v1: Object.freeze({
        scale: 0.72,
        position: Object.freeze([0.3, -0.45, -0.78]),
        rotation: Object.freeze([0.45, 0.62, -0.08]),
      }),
    });

    for (const [weaponId, expectedProfile] of Object.entries(
      correctedProfiles,
    )) {
      const profile = KYX_AUTHORITY_WEAPON_PRESENTATION[
        weaponId as keyof typeof correctedProfiles
      ].firstPerson;
      expect(profile.scale).toBe(expectedProfile.scale);
      expect(profile.position).toEqual(expectedProfile.position);
      expect(profile.rotation).toEqual(expectedProfile.rotation);

      const model = createKyxWeaponPresentationModel(
        weaponId,
        'first_person',
      );
      model.group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model.group);
      expect(bounds.max.z).toBeLessThan(-0.18);
    }
  });

  it('keeps the phase blade cyan without blowing its emissive core to white', () => {
    const blade = createKyxWeaponPresentationModel(
      'kyx_edge_v1',
      'first_person',
    );
    const glow = blade.group.getObjectByName('KYX_EDGE1_ENERGY_BLADE')
      ?.children.find((child) => (
        (child as THREE.Mesh).material as THREE.Material | undefined
      )?.name === 'KYX_EDGE1_BLADE_GLOW') as THREE.Mesh | undefined;
    const core = blade.group.getObjectByName('KYX_EDGE1_ENERGY_BLADE')
      ?.children.find((child) => (
        (child as THREE.Mesh).material as THREE.Material | undefined
      )?.name === 'KYX_EDGE1_BLADE_CORE') as THREE.Mesh | undefined;
    expect(glow).toBeDefined();
    expect(core).toBeDefined();
    expect((glow?.material as THREE.MeshStandardMaterial).emissiveIntensity)
      .toBe(0.65);
    expect((core?.material as THREE.MeshStandardMaterial).emissiveIntensity)
      .toBe(0.45);
    expect((glow?.material as THREE.MeshStandardMaterial).color.getHex())
      .toBe(0x2b747c);
    expect((core?.material as THREE.MeshStandardMaterial).color.getHex())
      .toBe(0x2b818b);
  });

  it('keeps first-person contact rigs out of world presentation and fits the blade hand', () => {
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
    expect(firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_DOMINANT_ELBOW_BRIDGE',
    )).toBeDefined();
    expect(firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_SUPPORT_ELBOW_BRIDGE',
    )).toBeDefined();
    expect(firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_DOMINANT_GAUNTLET_CORE',
    )).toBeDefined();
    expect(firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_SUPPORT_GAUNTLET_CORE',
    )).toBeDefined();
    expect(firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_DOMINANT_WRIST_SEAL',
    )).toBeDefined();
    expect(firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_SUPPORT_WRIST_SEAL',
    )).toBeDefined();
    expect(firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_DOMINANT_GLOVE_BACKPLATE',
    )).toBeDefined();
    expect(firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_SUPPORT_GLOVE_BACKPLATE',
    )).toBeDefined();
    expect(firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_DOMINANT_GRIP_CONTACT',
    )?.position.toArray()).toEqual([0.065, -0.115, 0.2]);
    expect(firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_SUPPORT_GRIP_CONTACT',
    )?.position.toArray()).toEqual([-0.075, -0.082, -0.325]);
    expect(firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_REFLEX_LENS',
    )).toBeDefined();
    expect(firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_REFLEX_RETICLE_DOT',
    )).toBeDefined();
    expect(firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_RECEIVER_CORE',
    )).toBeDefined();
    const upperShroud = firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_UPPER_SHROUD',
    ) as THREE.Mesh<THREE.BoxGeometry> | undefined;
    const opticRail = firstPersonRifle.group.getObjectByName(
      'KYX_VLR7_OPTIC_RAIL',
    ) as THREE.Mesh<THREE.BoxGeometry> | undefined;
    expect(upperShroud?.geometry.parameters).toMatchObject({
      width: 0.095,
      height: 0.052,
      depth: 0.42,
    });
    expect(upperShroud?.position.toArray()).toEqual([0, 0.145, -0.02]);
    expect(opticRail?.geometry.parameters).toMatchObject({
      width: 0.07,
      height: 0.028,
      depth: 0.68,
    });
    expect(opticRail?.position.toArray()).toEqual([0, 0.19, -0.14]);
    expect(firstPersonRifle.group.getObjectsByProperty(
      'name',
      'KYX_VLR7_LINE_RIFLE_VISUAL',
    )).toHaveLength(1);
    expect(firstPersonRifle.group.userData).toMatchObject({
      firstPersonContactMode: 'profiled_two_hand_assault_suit_v9',
      firstPersonHandCount: 2,
    });
    expect(firstPersonRifle.firstPersonContactRig?.userData).toMatchObject({
      presentationOnly: true,
      noHit: true,
    });
    for (const prefix of ['DOMINANT', 'SUPPORT']) {
      expect(firstPersonRifle.group.getObjectByName(
        `KYX_VLR7_${prefix}_SLEEVE_UPPER`,
      )?.visible).toBe(false);
      expect(firstPersonRifle.group.getObjectByName(
        `KYX_VLR7_${prefix}_ELBOW_BRIDGE`,
      )?.visible).toBe(false);
      const gauntlet = firstPersonRifle.group.getObjectByName(
        `KYX_VLR7_${prefix}_GAUNTLET_DORSAL_PLATE`,
      ) as THREE.Mesh<THREE.BoxGeometry> | undefined;
      expect(gauntlet?.geometry.parameters.width).toBe(0.069);
    }

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
    expect(firstPersonBlade.firstPersonContactRig?.name).toBe(
      'KYX_EDGE1_FIRST_PERSON_CONTACT_RIG',
    );
    expect(firstPersonBlade.firstPersonHandCount).toBe(1);
    expect(firstPersonBlade.group.getObjectByName(
      'KYX_EDGE1_DOMINANT_GRIP_CONTACT',
    )).toBeDefined();
  });

  it('keeps the local weapon readable while isolating review shells to world presentation', () => {
    const source = new THREE.Group();
    source.name = 'KYX_VLR7_QUATERNIUS_REV1';
    source.add(new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.8),
      new THREE.MeshStandardMaterial(),
    ));
    const magazine = new THREE.Group();
    magazine.name = 'KYX_VLR7_REVIEW_MAGAZINE';
    const muzzleReference = new THREE.Object3D();
    muzzleReference.name = 'KYX_VLR7_REVIEW_MUZZLE_REFERENCE';
    muzzleReference.position.set(0, 0.105, -0.73);
    source.add(magazine, muzzleReference);
    const restore = installKyxLineRifleReviewShellFactory(
      () => source.clone(true),
    );
    try {
      const rifle = createKyxWeaponPresentationModel(
        'vertical_rifle_v1',
        'first_person',
      );
      const worldRifle = createKyxWeaponPresentationModel(
        'vertical_rifle_v1',
        'world',
      );
      expect(rifle.group.userData.weaponVisualSource).toBe(
        'project_authored_procedural',
      );
      expect(rifle.group.getObjectByName(
        'KYX_VLR7_DEFAULT_PROCEDURAL_SHELL',
      )?.visible).toBe(true);
      expect(rifle.group.getObjectByName(
        'KYX_VLR7_REVIEW_SHELL_MOUNT',
      )).toBeUndefined();
      expect(rifle.firstPersonHandCount).toBe(2);
      expect(rifle.muzzle.name).toBe('KYX_VLR7_MUZZLE');
      expect(rifle.group.userData.authorityMuzzleReferenceBound).toBe(true);
      expect(rifle.group.userData.authorityMuzzleReferenceSource).toBe(
        'project-authored-procedural',
      );
      expect(rifle.group.userData.reviewMuzzleReferenceBound).toBe(false);

      expect(worldRifle.group.userData.weaponVisualSource).toBe(
        'quaternius_cc0_review_rev1',
      );
      expect(worldRifle.group.getObjectByName(
        'KYX_VLR7_DEFAULT_PROCEDURAL_SHELL',
      )?.visible).toBe(false);
      expect(worldRifle.group.getObjectByName(
        'KYX_VLR7_REVIEW_SHELL_MOUNT',
      )).toBeDefined();
      expect(worldRifle.group.getObjectByName(
        'KYX_VLR7_REFLEX_OPTIC',
      )).toBeDefined();
      expect(worldRifle.muzzle.name).toBe(
        'KYX_VLR7_REVIEW_MUZZLE_REFERENCE',
      );
      expect(worldRifle.group.userData.authorityMuzzleReferenceBound).toBe(true);
      expect(worldRifle.group.userData.authorityMuzzleReferenceSource).toBe(
        'review-authored',
      );
      expect(worldRifle.group.userData.reviewMuzzleReferenceBound).toBe(true);

      const mountedMagazine = rifle.group.getObjectByName(
        'KYX_VLR7_MAGAZINE',
      );
      expect(mountedMagazine).toBeDefined();
      const restY = mountedMagazine?.position.y ?? 0;
      setKyxWeaponPhase(rifle, 'reloading', 1_000);
      updateKyxWeaponPresentation(rifle, 1_750, 0.1);
      expect(mountedMagazine?.position.y).toBeLessThan(restY);
    } finally {
      restore();
    }
  });

  it('keeps non-rifle review shells out of first person while retaining them in world presentation', () => {
    const source = new THREE.Group();
    source.name = 'KYX_K9_QUATERNIUS_REV1';
    source.userData.weaponVisualSource =
      'quaternius_cc0_armory_rev1:kyx-k9-quaternius-rev1';
    const donorMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.18, 0.55),
      new THREE.MeshStandardMaterial(),
    );
    donorMesh.name = 'KYX_K9_QUATERNIUS_DONOR';
    const muzzleReference = new THREE.Object3D();
    muzzleReference.name = 'KYX_K9_QUATERNIUS_REV1_MUZZLE_REFERENCE';
    muzzleReference.position.set(0, 0.2434, -0.507405);
    source.add(donorMesh, muzzleReference);
    const restore = installKyxWeaponReviewShellFactory(
      'kyx_sidearm_v1',
      () => source.clone(true),
    );
    try {
      const sidearm = createKyxWeaponPresentationModel(
        'kyx_sidearm_v1',
        'first_person',
      );
      const worldSidearm = createKyxWeaponPresentationModel(
        'kyx_sidearm_v1',
        'world',
      );
      expect(sidearm.group.userData.weaponVisualSource).toBe(
        'project_authored_procedural',
      );
      expect(sidearm.group.getObjectByName(
        'KYX_K9_QUATERNIUS_DONOR',
      )).toBeUndefined();
      expect(sidearm.group.getObjectByName(
        'KYX_K9_POWER_CHAMBER',
      )?.visible).toBe(true);
      expect(sidearm.muzzle.name).toBe('KYX_K9_MUZZLE');
      expect(sidearm.group.userData.authorityMuzzleReferenceBound).toBe(true);
      expect(sidearm.group.userData.authorityMuzzleReferenceSource).toBe(
        'project-authored-procedural',
      );
      expect(sidearm.group.userData.reviewMuzzleReferenceBound).toBe(false);

      expect(worldSidearm.group.userData.weaponVisualSource).toBe(
        'quaternius_cc0_armory_rev1:kyx-k9-quaternius-rev1',
      );
      expect(worldSidearm.group.getObjectByName(
        'KYX_K9_QUATERNIUS_DONOR',
      )?.visible).toBe(true);
      expect(worldSidearm.group.getObjectByName(
        'KYX_K9_POWER_CHAMBER',
      )?.visible).toBe(false);
      expect(worldSidearm.muzzle.name).toBe(
        'KYX_K9_QUATERNIUS_REV1_MUZZLE_REFERENCE',
      );
      expect(worldSidearm.group.userData.authorityMuzzleReferenceBound).toBe(true);
      expect(worldSidearm.group.userData.authorityMuzzleReferenceSource).toBe(
        'review-authored',
      );
      expect(worldSidearm.group.userData.reviewMuzzleReferenceBound).toBe(true);
      expect(worldSidearm.group.getObjectByName(
        'KYX_K9_REVIEW_SLIDE_CAP',
      )?.visible).toBe(true);
      expect(worldSidearm.group.getObjectByName(
        'KYX_K9_REVIEW_POWER_CELL',
      )?.visible).toBe(true);
      expect(worldSidearm.group.getObjectsByProperty(
        'name',
        'KYX_K9_QUATERNIUS_DONOR',
      )).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it('provides fitted first-person contacts for every product gun family', () => {
    const expected = Object.freeze({
      kyx_sidearm_v1: Object.freeze({
        hands: 1,
        mode: 'fitted_one_hand_sidearm_contact_v2',
      }),
      kyx_scattergun_v1: Object.freeze({
        hands: 2,
        mode: 'fitted_two_hand_breacher_contact_v3',
      }),
      kyx_longshot_v1: Object.freeze({
        hands: 2,
        mode: 'fitted_two_hand_precision_contact_v3',
      }),
      kyx_breach_rocket_v1: Object.freeze({
        hands: 2,
        mode: 'fitted_two_hand_launcher_contact_v3',
      }),
      kyx_edge_v1: Object.freeze({
        hands: 1,
        mode: 'fitted_one_hand_saber_contact_v2',
      }),
    });
    for (const [weaponId, contract] of Object.entries(expected)) {
      const model = createKyxWeaponPresentationModel(
        weaponId,
        'first_person',
      );
      expect(model.firstPersonHandCount).toBe(contract.hands);
      expect(model.group.userData.firstPersonContactMode).toBe(contract.mode);
      expect(model.firstPersonContactRig?.userData).toMatchObject({
        presentationOnly: true,
        noHit: true,
        weaponFittedContact: true,
      });
      expect(KYX_FIRST_PERSON_CONTACT_SEAM[
        weaponId as keyof typeof KYX_FIRST_PERSON_CONTACT_SEAM
      ]).toMatchObject({
        handCount: contract.hands,
        mode: contract.mode,
        characterBinding: 'unbound_pending_accepted_assault_body',
      });
    }
  });

  it('blends a family-authored ADS pose and exits it for an authority reload', () => {
    const rifle = createKyxWeaponPresentationModel(
      'vertical_rifle_v1',
      'first_person',
    );
    expect(rifle.firstPersonPose).toMatchObject({
      aimEnabled: true,
      aimFieldOfViewDegrees: 60,
      aimScaleMultiplier: 0.74,
      reloadDurationMilliseconds: 3_000,
    });

    setKyxWeaponAim(rifle, true);
    updateKyxWeaponPresentation(rifle, 1_000, 0.1);
    expect(rifle.aimRequested).toBe(true);
    expect(rifle.aimMix).toBeCloseTo(1, 5);

    setKyxWeaponPhase(rifle, 'reloading', 1_000);
    updateKyxWeaponPresentation(rifle, 1_750, 0.1);
    expect(rifle.aimMix).toBeCloseTo(0, 5);
    expect(rifle.reloadProgress).toBeCloseTo(0.25, 5);
    expect(rifle.reloadPoseMix).toBeGreaterThan(0.5);

    setKyxWeaponPhase(rifle, 'ready', 4_000);
    updateKyxWeaponPresentation(rifle, 4_000, 0.1);
    expect(rifle.reloadPoseMix).toBe(0);
    expect(rifle.aimMix).toBeCloseTo(1, 5);
  });

  it('exposes typed ADS, recoil recovery, equip, sprint, and world-mount profiles for every family', () => {
    for (const weaponId of WEAPON_IDS) {
      const firstPerson = createKyxWeaponPresentationModel(
        weaponId,
        'first_person',
      );
      const transition = KYX_FIRST_PERSON_TRANSITION_PROFILE[weaponId];
      expect(firstPerson.firstPersonPose).toMatchObject({
        aimPresentation: transition.aimPresentation,
        aimDatumNodeName: transition.adsDatumNode,
        recoilRecoveryHalfLifeSeconds:
          transition.recoilRecoveryHalfLifeSeconds,
      });
      expect(firstPerson.aimDatum?.name ?? null).toBe(
        transition.adsDatumNode,
      );

      triggerKyxWeaponEquip(firstPerson);
      expect(firstPerson.equipMix).toBe(1);
      updateKyxWeaponPresentation(firstPerson, 16, 0.016);
      expect(firstPerson.equipMix).toBeGreaterThan(0);
      expect(firstPerson.equipMix).toBeLessThan(1);
      setKyxWeaponPhase(firstPerson, 'sprinting', 20);
      updateKyxWeaponPresentation(firstPerson, 120, 0.1);
      expect(firstPerson.sprintMix).toBeGreaterThan(0.5);
      expect(firstPerson.aimMix).toBe(0);

      const world = createKyxWeaponPresentationModel(weaponId, 'world');
      const visual = world.group.children[0];
      expect(visual.scale.x).toBeCloseTo(
        KYX_WORLD_WEAPON_MOUNT_PROFILE[weaponId].scale,
        6,
      );
      expect(world.group.userData.worldMountProfile).toBe(weaponId);
    }
  });

  it('keeps ADS presentation-only and disabled for world weapons and melee', () => {
    const worldRifle = createKyxWeaponPresentationModel(
      'vertical_rifle_v1',
      'world',
    );
    const blade = createKyxWeaponPresentationModel(
      'kyx_edge_v1',
      'first_person',
    );
    setKyxWeaponAim(worldRifle, true);
    setKyxWeaponAim(blade, true);
    updateKyxWeaponPresentation(worldRifle, 1_000, 0.1);
    updateKyxWeaponPresentation(blade, 1_000, 0.1);
    expect(worldRifle.aimMix).toBe(0);
    expect(blade.aimMix).toBe(0);
    expect(blade.firstPersonPose.aimEnabled).toBe(false);
  });
});
