import { readFile } from 'node:fs/promises';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  INKFALL_REV4_CANDIDATE_ART,
  loadInkfallRev4CandidateAuthorityBinding,
} from '../../../src/app/inkfallRev4CandidateBinding';
import {
  runInkfallRev4PressArchiveTraversal,
} from '../../../src/app/inkfallRev4CandidateTraversal';
import {
  DEFAULT_MAP_ID,
  DEFAULT_MAP_REVISION,
  getBundledMapPackageSource,
} from '../../../src/content/maps';
import {
  loadRuntimeMapPackage,
  type LoadedRuntimeMapPackage,
  type RuntimeMapArtifactBytes,
} from '../../../src/physics';

const mapRoot = new URL(
  '../../../assets/source/maps/inkfall-foundry/',
  import.meta.url,
);

let presentationArt: Uint8Array;
let packageRender: Uint8Array;
let authorityCollision: Uint8Array;
let revision3Source: unknown;
let loaded: LoadedRuntimeMapPackage;

beforeAll(async () => {
  [presentationArt, packageRender, authorityCollision] = await Promise.all([
    readFile(new URL(
      'art-kit/press-archive-rev4/rev4/export/inkfall_foundry_press_archive_rev4.spatial-material-joined.glb',
      mapRoot,
    )),
    readFile(new URL('revisions/revision-3/export/render.graybox.glb', mapRoot)),
    readFile(new URL('revisions/revision-3/export/collision.authority.glb', mapRoot)),
  ]);
  revision3Source = getBundledMapPackageSource(DEFAULT_MAP_ID, 3);
  if (!revision3Source) throw new Error('Revision 3 package missing');
  loaded = await loadRuntimeMapPackage(revision3Source, {
    render: packageRender,
    collision: authorityCollision,
  });
});

describe('Inkfall Rev4.1 art plus frozen Revision 3 authority candidate', () => {
  it('keeps the catalog default byte/behavior path on Revision 1', () => {
    const defaultSource = getBundledMapPackageSource(DEFAULT_MAP_ID) as {
      readonly revision?: number;
      readonly identity?: { readonly digest?: string };
    };
    const explicitRevision3 = revision3Source as {
      readonly revision?: number;
      readonly identity?: { readonly digest?: string };
    };
    expect(DEFAULT_MAP_ID).toBe('inkfall_foundry');
    expect(DEFAULT_MAP_REVISION).toBe(1);
    expect(defaultSource.revision).toBe(1);
    expect(explicitRevision3.revision).toBe(3);
    expect(defaultSource.identity?.digest).toBe(
      'a593ad82b2e9f713a4a8d775002c1583c0fb3dfd3acdf004ba7bd6b144173267',
    );
    expect(explicitRevision3.identity?.digest).toBe(
      '4027934730af7c855b0abcee1b36cc256294e3e5c22a6ffb8aa02a77f71d196a',
    );
  });

  it('passes only frozen package render and collision bytes to the authority loader', async () => {
    let forwarded: RuntimeMapArtifactBytes | null = null;
    const candidate = await loadInkfallRev4CandidateAuthorityBinding(
      revision3Source,
      { presentationArt, packageRender, authorityCollision },
      async (source, artifacts) => {
        forwarded = artifacts;
        return loadRuntimeMapPackage(source, artifacts);
      },
    );
    expect(forwarded).not.toBeNull();
    expect(forwarded!.render).toBe(packageRender);
    expect(forwarded!.collision).toBe(authorityCollision);
    expect(forwarded!.render).not.toBe(presentationArt);
    expect(forwarded!.collision).not.toBe(presentationArt);
    expect(candidate.presentationArt).toBe(presentationArt);
    expect(candidate.presentationSha256).toBe(INKFALL_REV4_CANDIDATE_ART.sha256);
    expect(candidate.roleSeparation).toEqual({
      presentationArtPassedToPackageLoader: false,
      packageRenderRole: 'frozen_revision_3_render_verification_only',
      collisionRole: 'frozen_revision_3_authoritative_collision_only',
      presentationRole: 'rev4_1_gltf_visual_only',
      renderMeshesMayBeAuthority: false,
    });
  });

  it('proves the pinned route, landing, zone, spawn, and bounds coordinate contract', async () => {
    const candidate = await loadInkfallRev4CandidateAuthorityBinding(
      revision3Source,
      { presentationArt, packageRender, authorityCollision },
    );
    expect(candidate.authorityAlignment).toMatchObject({
      maximumRoutePointPlanarDeltaMm: 600,
      maximumRoutePointVerticalDeltaMm: 60,
      maximumSegmentCenterPlanarDeltaMm: 319,
      maximumSegmentCenterVerticalDeltaMm: 178,
      visualLaneWidthMm: 2_180,
      authorityClearWidthMm: 2_400,
      landingArtFloorTopMm: 6_000,
      landingAuthorityTopMm: 6_000,
      allChecksPassed: true,
      checks: {
        mapIdentityPinned: true,
        frozenArtifactHashesPinned: true,
        renderMeshesRemainNonAuthoritative: true,
        zonesAndSpawnsPinned: true,
        routePointsWithinTolerance: true,
        segmentCentersWithinTolerance: true,
        visualLaneInsideAuthorityClearance: true,
        landingTopExact: true,
        catalogDefaultUnchanged: true,
      },
    });
  });

  it('fails before authority loading for aliased or tampered presentation bytes', async () => {
    let loaderCalled = false;
    await expect(loadInkfallRev4CandidateAuthorityBinding(
      revision3Source,
      {
        presentationArt: authorityCollision,
        packageRender,
        authorityCollision,
      },
      async () => {
        loaderCalled = true;
        return loaded;
      },
    )).rejects.toThrow('INKFALL_REV4_ARTIFACT_ROLE_ALIAS');
    expect(loaderCalled).toBe(false);

    const tampered = new Uint8Array(presentationArt);
    tampered[tampered.length - 1] ^= 1;
    await expect(loadInkfallRev4CandidateAuthorityBinding(
      revision3Source,
      {
        presentationArt: tampered,
        packageRender,
        authorityCollision,
      },
      async () => {
        loaderCalled = true;
        return loaded;
      },
    )).rejects.toThrow('INKFALL_REV4_PRESENTATION_ART_HASH_MISMATCH');
    expect(loaderCalled).toBe(false);

    await expect(loadRuntimeMapPackage(revision3Source, {
      render: packageRender,
      collision: presentationArt,
    })).rejects.toThrow();
  });

  it('executes Press Hall through the west ascent into Paper Archive without embed', async () => {
    const traversal = await runInkfallRev4PressArchiveTraversal(loaded);
    expect(traversal).toMatchObject({
      kind: 'executable_rapier_kcc_press_hall_to_west_archive_traversal',
      authorityRevision: 3,
      routeId: 'press_west_archive',
      classification: 'automated_runtime_evidence_not_human_playtest',
      enteredZoneIds: expect.arrayContaining(['press_hall', 'archive_walk_west']),
      allChecksPassed: true,
    });
    expect(traversal.legs).toHaveLength(3);
    expect(traversal.legs.every((leg) => (
      leg.passed
      && leg.finalOverlapColliderIds.length === 0
      && leg.planarRemainingMm <= 900
      && leg.verticalRemainingMm <= 1_600
    ))).toBe(true);
    expect(traversal.totalTickCount).toBeGreaterThan(40);
  });
});
