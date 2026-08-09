import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  KYX_AUTHORITY_ID_BY_OFFLINE_ID,
  KYX_SELECTED_QUATERNIUS_GUN_ASSETS,
} from '../../../src/weapons/KyxArmorySelectedAssets';
import {
  buildWeaponModel,
  resolveKyxPresetAuthorityWeaponId,
} from '../../../src/weapons/WeaponModels.js';

function glbJson(bytes: Buffer): Readonly<{
  nodes?: readonly Readonly<{ name?: string }>[];
}> {
  expect(bytes.toString('ascii', 0, 4)).toBe('glTF');
  const jsonLength = bytes.readUInt32LE(12);
  const jsonChunkType = bytes.toString('ascii', 16, 20);
  expect(jsonChunkType).toBe('JSON');
  return JSON.parse(
    bytes.toString('utf8', 20, 20 + jsonLength).trimEnd(),
  ) as Readonly<{ nodes?: readonly Readonly<{ name?: string }>[] }>;
}

describe('selected Quaternius armory asset identity', () => {
  it('binds exact licensed assets and authored muzzle nodes to runtime roles', () => {
    const profiles = Object.values(KYX_SELECTED_QUATERNIUS_GUN_ASSETS);
    expect(profiles).toHaveLength(5);
    expect(new Set(profiles.map(({ loadoutRole }) => loadoutRole))).toEqual(
      new Set([
        'assault_rifle',
        'compact_sidearm',
        'breacher_shotgun',
        'recon_sniper',
        'siege_launcher',
      ]),
    );

    for (const profile of profiles) {
      const assetPath = resolve(process.cwd(), profile.assetRelativePath);
      const bytes = readFileSync(assetPath);
      expect(bytes.byteLength).toBe(profile.bytes);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(
        profile.sha256,
      );
      const nodeNames = new Set(
        glbJson(bytes).nodes?.map(({ name }) => name) ?? [],
      );
      expect(nodeNames.has(profile.rootNode)).toBe(true);
      expect(nodeNames.has(profile.muzzleNode)).toBe(true);
      expect(profile).toMatchObject({
        sourceCredit: 'Sci-Fi Gun Pack by Quaternius',
        sourceLicense: 'CC0-1.0',
        reviewOnly: true,
        releaseEligible: false,
        humanAccepted: false,
      });
      expect(profile.materialTreatment.version).toContain('retone_v2');
      expect(
        resolveKyxPresetAuthorityWeaponId(profile.offlineWeaponId),
      ).toBe(profile.authorityWeaponId);
      expect(
        KYX_AUTHORITY_ID_BY_OFFLINE_ID[profile.offlineWeaponId],
      ).toBe(profile.authorityWeaponId);
    }
  });

  it('does not mislabel the procedural Edge-1 as a selected GLB', () => {
    expect(resolveKyxPresetAuthorityWeaponId('sword')).toBe('kyx_edge_v1');
    expect(
      Object.hasOwn(KYX_SELECTED_QUATERNIUS_GUN_ASSETS, 'kyx_edge_v1'),
    ).toBe(false);
  });

  it('fails closed instead of displaying a procedural gun while a review GLB is pending', () => {
    const built = buildWeaponModel(
      { id: 'm4' },
      { presentation: 'first_person' },
    );
    expect(built.group.userData).toMatchObject({
      selectedReviewAssetRequired: true,
      selectedReviewAssetResolved: false,
      selectedAssetFailClosed: true,
    });
    let visibleMeshCount = 0;
    built.group.traverse((object: THREE.Object3D) => {
      if (object instanceof THREE.Mesh && object.visible) {
        visibleMeshCount += 1;
      }
    });
    expect(visibleMeshCount).toBe(0);
  });
});
