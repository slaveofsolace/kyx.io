import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isG6Rev17CharacterCandidateEnabled,
  isG6Rev17ThirdPersonFallbackSelected,
  resolveG6CharacterCandidate,
} from '../../../src/config/g6CharacterCandidate';

const REV30 = '/candidates/g6-rev30-cc0-donor/character-lod0.glb';
const REV17_FIRST_PERSON = '/candidates/g6-rev17/first-person.glb';
const REV30_SHA256 =
  '24e742efe1d596e0efcc4fed73fb527346049b29a7b0782a9b93b0719a2e49ed';

describe('G6 character runtime selection', () => {
  it('uses one Rev30 LOD0 file for default player and enemy slots', () => {
    const candidate = resolveG6CharacterCandidate('');

    expect(candidate).toMatchObject({
      enabled: true,
      revision: 'rev30',
      defaultRevision: 'rev30',
      requestedRevision: null,
      selection: 'default',
      firstPersonRevision: 'rev17',
    });
    expect(candidate.assets.lod0).toBe(REV30);
    expect(candidate.assets.lod1).toBe(REV30);
    expect(candidate.assets.lod2).toBeNull();
    expect(candidate.assets.firstPerson).toBe(REV17_FIRST_PERSON);
  });

  it('preserves the exact Rev17 query fallback and review population', () => {
    const candidate = resolveG6CharacterCandidate(
      '?g6Candidate=rev17&g6Population=8',
    );

    expect(candidate).toMatchObject({
      revision: 'rev17',
      requestedRevision: 'rev17',
      selection: 'legacy-query-fallback',
      population: 8,
    });
    expect(candidate.assets).toEqual({
      lod0: '/candidates/g6-rev17/character-lod0.glb',
      lod1: '/candidates/g6-rev17/character-lod1.glb',
      lod2: '/candidates/g6-rev17/character-lod2.glb',
      firstPerson: REV17_FIRST_PERSON,
    });
  });

  it('falls unsupported revisions back to Rev30 without hiding the request', () => {
    expect(resolveG6CharacterCandidate('?g6Candidate=rev99')).toMatchObject({
      revision: 'rev30',
      requestedRevision: 'rev99',
      selection: 'unsupported-query-fell-back-to-default',
    });
    // Historical helper remains the candidate-pipeline gate used by
    // WeaponSystem, so the retained Rev17 first-person viewmodel stays active.
    expect(isG6Rev17CharacterCandidateEnabled()).toBe(true);
    expect(isG6Rev17ThirdPersonFallbackSelected()).toBe(false);
  });

  it('binds the single physical Rev30 file to truthful public and provenance records', async () => {
    const runtimePath = resolve(
      'public/candidates/g6-rev30-cc0-donor/character-lod0.glb',
    );
    const runtimeBytes = await readFile(runtimePath);
    const publicManifest = JSON.parse(await readFile(
      resolve('public/candidates/g6-rev30-cc0-donor/manifest.json'),
      'utf8',
    ));
    const assetManifest = JSON.parse(await readFile(
      resolve('assets/manifests/g6-rev30-cc0-donor-character-lod0.asset.json'),
      'utf8',
    ));
    const shippedAssets = JSON.parse(await readFile(
      resolve('assets/provenance/shipped-assets.g9.json'),
      'utf8',
    ));

    expect((await stat(runtimePath)).size).toBe(15025320);
    expect(createHash('sha256').update(runtimeBytes).digest('hex'))
      .toBe(REV30_SHA256);
    expect(publicManifest.thirdPerson).toMatchObject({
      asset: REV30,
      physicalRuntimeFileCount: 1,
      runtimeRoles: ['player', 'enemy'],
      distinctRev30Lod1Authored: false,
      distinctRev30Lod2Authored: false,
    });
    expect(assetManifest).toMatchObject({
      releaseEligible: false,
      disposition: 'approved',
      runtime: { hash: REV30_SHA256, bytes: 15025320 },
      budgets: { triangles: 10748, bones: 66, clips: 16 },
      provenance: { status: 'verified', license: 'CC0-1.0' },
    });
    expect(shippedAssets.scope.expectedAssetCount).toBe(5);
    expect(shippedAssets.assets).toContainEqual(expect.objectContaining({
      assetId: 'g6.rev30.cc0-donor-character-lod0',
      path: 'public/candidates/g6-rev30-cc0-donor/character-lod0.glb',
      sha256: REV30_SHA256,
    }));
  });
});
