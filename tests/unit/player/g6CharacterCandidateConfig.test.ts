import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isG6CharacterCandidateEnabled,
  isG6Rev17CharacterCandidateEnabled,
  isG6Rev17ThirdPersonFallbackSelected,
  resolveG6CharacterCandidate,
} from '../../../src/config/g6CharacterCandidate';

const REV30_REVIEW_PATH =
  'assets/review/runtime-candidates/g6-rev30-cc0-donor/character-lod0.glb';
const REV30_SHA256 =
  '24e742efe1d596e0efcc4fed73fb527346049b29a7b0782a9b93b0719a2e49ed';

describe('G6 character runtime selection', () => {
  it('uses the shipped procedural character while visual candidates remain rejected', () => {
    const candidate = resolveG6CharacterCandidate('');

    expect(candidate).toMatchObject({
      enabled: false,
      default: false,
      revision: null,
      defaultRevision: null,
      requestedRevision: null,
      selection: 'project-authored-procedural-fallback',
      firstPersonRevision: null,
      thirdPersonAssetPolicy: 'project-authored-procedural-fallback',
      releasePackagePolicy: 'accepted-ledgered-assets-only',
    });
    expect(candidate.assets).toEqual({
      lod0: null,
      lod1: null,
      lod2: null,
      firstPerson: null,
    });
    expect(isG6CharacterCandidateEnabled()).toBe(false);
  });

  it('does not allow a legacy query to reactivate non-shipped review bytes', () => {
    const candidate = resolveG6CharacterCandidate(
      '?g6Candidate=rev17&g6Population=8',
    );

    expect(candidate).toMatchObject({
      enabled: false,
      revision: null,
      requestedRevision: 'rev17',
      selection: 'review-only-request-rejected',
      population: 8,
    });
    expect(candidate.assets).toEqual({
      lod0: null,
      lod1: null,
      lod2: null,
      firstPerson: null,
    });
  });

  it('records unsupported requests without selecting a rejected candidate', () => {
    expect(resolveG6CharacterCandidate('?g6Candidate=rev99')).toMatchObject({
      enabled: false,
      revision: null,
      requestedRevision: 'rev99',
      selection: 'review-only-request-rejected',
    });
    expect(isG6Rev17CharacterCandidateEnabled()).toBe(false);
    expect(isG6Rev17ThirdPersonFallbackSelected()).toBe(false);
  });

  it('preserves exact Rev30 review bytes while excluding them from release inventory', async () => {
    const reviewPath = resolve(REV30_REVIEW_PATH);
    const reviewBytes = await readFile(reviewPath);
    const reviewManifest = JSON.parse(await readFile(
      resolve('assets/review/runtime-candidates/g6-rev30-cc0-donor/manifest.json'),
      'utf8',
    ));
    const assetManifest = JSON.parse(await readFile(
      resolve('assets/review/manifests/g6-rev30-cc0-donor-character-lod0.asset.json'),
      'utf8',
    ));
    const shippedAssets = JSON.parse(await readFile(
      resolve('assets/provenance/shipped-assets.g9.json'),
      'utf8',
    ));

    expect((await stat(reviewPath)).size).toBe(15025320);
    expect(createHash('sha256').update(reviewBytes).digest('hex'))
      .toBe(REV30_SHA256);
    expect(reviewManifest).toMatchObject({
      default: false,
      runtimeSelection: 'review only; rejected as a shipped runtime default',
      releaseEligible: false,
    });
    expect(reviewManifest.thirdPerson).toMatchObject({
      asset: REV30_REVIEW_PATH,
      physicalRuntimeFileCount: 1,
      runtimeRoles: ['player', 'enemy'],
      distinctRev30Lod1Authored: false,
      distinctRev30Lod2Authored: false,
    });
    expect(assetManifest).toMatchObject({
      releaseEligible: false,
      disposition: 'candidate',
      runtime: { hash: REV30_SHA256, bytes: 15025320 },
      budgets: { triangles: 10748, bones: 66, clips: 16 },
      provenance: { status: 'verified', license: 'CC0-1.0' },
    });
    expect(shippedAssets.scope.expectedAssetCount).toBe(0);
    expect(shippedAssets.assets).toEqual([]);
  });
});
