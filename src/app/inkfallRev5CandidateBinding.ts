import * as THREE from 'three';

import { INKFALL_AUTHORITY_MAP_IDENTITY_V3 } from '../authority/inkfallMapIdentity';
import {
  inspectInkfallRev5PortalCompatibility,
} from '../authority/portal/inkfallRev5PortalAuthority';
import {
  DEFAULT_MAP_ID,
  DEFAULT_MAP_REVISION,
  sha256Hex,
} from '../content/maps';
import {
  loadRuntimeMapPackage,
  type LoadedRuntimeMapPackage,
  type RuntimeMapArtifactBytes,
} from '../physics';

export const INKFALL_REV5_CANDIDATE_ART = Object.freeze({
  revision: '5.0',
  bytes: 3_805_416,
  sha256: 'b7ca109de054b56c8c9692e507942b27f5b64e46a60a6cdf140972910b48586f',
  nodeCount: 24,
  meshCount: 24,
  primitiveCount: 24,
  triangleCount: 65_520,
  materialCount: 11,
} as const);

export const INKFALL_REV5_CANDIDATE_AUTHORITY = Object.freeze({
  ...INKFALL_AUTHORITY_MAP_IDENTITY_V3,
  renderSha256: '19bbf6f627f46146a7266d39e00e0635d7b4b09e556bfa0dee988bb2375c5ed6',
  collisionSha256: '1cce637ab4f83766627527b3885c3e9da819d8bcabdfa2144f8dc6b46bc5bba8',
  colliderCount: 339,
  spawnCount: 12,
  zoneCount: 9,
} as const);

type RuntimeMapLoader = (
  source: unknown,
  artifacts: RuntimeMapArtifactBytes,
) => Promise<LoadedRuntimeMapPackage>;

export interface InkfallRev5CandidateArtifactBytes {
  readonly presentationArt: Uint8Array;
  readonly packageRender: Uint8Array;
  readonly authorityCollision: Uint8Array;
}

function boxFacts(box: THREE.Box3) {
  return Object.freeze({
    minimum: Object.freeze(box.min.toArray()),
    maximum: Object.freeze(box.max.toArray()),
    size: Object.freeze(box.getSize(new THREE.Vector3()).toArray()),
  });
}

export function inspectInkfallRev5CandidateScene(scene: THREE.Object3D) {
  const overall = new THREE.Box3().setFromObject(scene);
  const names: string[] = [];
  let riseMeshCount = 0;
  let landingMeshCount = 0;
  let lowerPortalMeshCount = 0;
  let upperPortalMeshCount = 0;
  let energySurfaceMeshCount = 0;

  scene.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    names.push(object.name);
    if (object.name.startsWith('V5OPT_ARCHIVE_RISE_')) {
      riseMeshCount += 1;
    } else if (object.name.startsWith('V5OPT_ARCHIVE_LANDING_')) {
      landingMeshCount += 1;
    } else if (object.name.startsWith('V5OPT_PORTAL_RED_FOLD_LOWER_')) {
      lowerPortalMeshCount += 1;
    } else if (object.name.startsWith('V5OPT_PORTAL_RED_FOLD_UPPER_')) {
      upperPortalMeshCount += 1;
    }
    if (object.name.includes('_V5_PORTAL_ENERGY_')) {
      energySurfaceMeshCount += 1;
    }
  });

  const checks = Object.freeze({
    exactMeshCount: names.length === INKFALL_REV5_CANDIDATE_ART.meshCount,
    modularOnlyNames: names.every((name) => name.startsWith('V5OPT_')),
    parentPresentationExcluded: names.every((name) => (
      !name.startsWith('V33OPT_') && !name.startsWith('V4OPT_')
    )),
    expectedStructuralFamilies:
      riseMeshCount === 6
      && landingMeshCount === 8
      && lowerPortalMeshCount === 5
      && upperPortalMeshCount === 5,
    pairedEnergizedSurfaces: energySurfaceMeshCount === 2,
    horizontalBoundsInsideAuthorityPackage:
      overall.min.x >= -36
      && overall.max.x <= 36
      && overall.min.z >= -28
      && overall.max.z <= 28,
  });
  if (Object.values(checks).some((passed) => !passed)) {
    throw new Error(
      `INKFALL_REV5_ART_SCENE_ALIGNMENT_FAILED ${JSON.stringify(checks)}`,
    );
  }
  return Object.freeze({
    overall: boxFacts(overall),
    meshCount: names.length,
    riseMeshCount,
    landingMeshCount,
    lowerPortalMeshCount,
    upperPortalMeshCount,
    energySurfaceMeshCount,
    checks,
    allChecksPassed: true,
  });
}

function inspectAuthorityBinding(loaded: LoadedRuntimeMapPackage) {
  const checks = Object.freeze({
    mapIdentityPinned:
      loaded.identity.id === INKFALL_REV5_CANDIDATE_AUTHORITY.mapId
      && loaded.identity.revision === INKFALL_REV5_CANDIDATE_AUTHORITY.mapRevision
      && loaded.identity.packageDigest
        === INKFALL_REV5_CANDIDATE_AUTHORITY.packageDigest
      && loaded.authority.fixtureHash
        === INKFALL_REV5_CANDIDATE_AUTHORITY.fixtureHash,
    frozenArtifactHashesPinned:
      loaded.presentation.renderSha256
        === INKFALL_REV5_CANDIDATE_AUTHORITY.renderSha256
      && loaded.authority.collisionSha256
        === INKFALL_REV5_CANDIDATE_AUTHORITY.collisionSha256,
    renderMeshesRemainNonAuthoritative:
      loaded.manifest.authority.renderMeshesMayBeAuthority === false,
    colliderCountPinned:
      loaded.authority.fixture.solids.length
        === INKFALL_REV5_CANDIDATE_AUTHORITY.colliderCount,
    zonesAndSpawnsPinned:
      loaded.manifest.zones.length
        === INKFALL_REV5_CANDIDATE_AUTHORITY.zoneCount
      && loaded.manifest.spawns.length
        === INKFALL_REV5_CANDIDATE_AUTHORITY.spawnCount,
    catalogDefaultUnchanged:
      DEFAULT_MAP_ID === 'inkfall_foundry'
      && DEFAULT_MAP_REVISION === 1,
  });
  if (Object.values(checks).some((passed) => !passed)) {
    throw new Error(
      `INKFALL_REV5_AUTHORITY_BINDING_FAILED ${JSON.stringify(checks)}`,
    );
  }
  return Object.freeze({
    checks,
    portalCompatibility: inspectInkfallRev5PortalCompatibility(loaded),
    allChecksPassed: true,
  });
}

export async function loadInkfallRev5CandidateAuthorityBinding(
  source: unknown,
  artifacts: InkfallRev5CandidateArtifactBytes,
  loader: RuntimeMapLoader = loadRuntimeMapPackage,
) {
  if (
    artifacts.presentationArt === artifacts.packageRender
    || artifacts.presentationArt === artifacts.authorityCollision
    || artifacts.packageRender === artifacts.authorityCollision
  ) {
    throw new Error('INKFALL_REV5_ARTIFACT_ROLE_ALIAS');
  }
  if (artifacts.presentationArt.byteLength !== INKFALL_REV5_CANDIDATE_ART.bytes) {
    throw new Error('INKFALL_REV5_PRESENTATION_ART_SIZE_MISMATCH');
  }
  const presentationSha256 = await sha256Hex(artifacts.presentationArt);
  if (presentationSha256 !== INKFALL_REV5_CANDIDATE_ART.sha256) {
    throw new Error('INKFALL_REV5_PRESENTATION_ART_HASH_MISMATCH');
  }
  const loaded = await loader(source, Object.freeze({
    render: artifacts.packageRender,
    collision: artifacts.authorityCollision,
  }));
  return Object.freeze({
    loaded,
    presentationArt: artifacts.presentationArt,
    presentationSha256,
    authorityBinding: inspectAuthorityBinding(loaded),
    roleSeparation: Object.freeze({
      presentationArtPassedToPackageLoader: false,
      packageRenderRole: 'frozen_revision_3_render_verification_only',
      collisionRole: 'frozen_revision_3_authoritative_collision_only',
      presentationRole: 'rev5_modular_render_only_no_hit',
      renderMeshesMayBeAuthority: false,
    }),
  });
}
