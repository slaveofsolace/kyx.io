import * as THREE from 'three';

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
import { INKFALL_AUTHORITY_MAP_IDENTITY_V3 } from '../authority/inkfallMapIdentity';

export const INKFALL_REV4_CANDIDATE_ART = Object.freeze({
  revision: '4.1',
  bytes: 12_954_608,
  sha256: '5e2aa22cc598f49181524ce78b481adf091f71a91a823171277963de11d4db00',
  nodeCount: 45,
  meshCount: 45,
  primitiveCount: 45,
  triangleCount: 190_788,
  materialCount: 9,
} as const);

export const INKFALL_REV4_CANDIDATE_AUTHORITY = Object.freeze({
  ...INKFALL_AUTHORITY_MAP_IDENTITY_V3,
  renderSha256: '19bbf6f627f46146a7266d39e00e0635d7b4b09e556bfa0dee988bb2375c5ed6',
  collisionSha256: '1cce637ab4f83766627527b3885c3e9da819d8bcabdfa2144f8dc6b46bc5bba8',
  spawnCount: 12,
  zoneCount: 9,
} as const);

export const INKFALL_REV4_ART_ROUTE_RUNTIME_METERS = Object.freeze([
  Object.freeze([-13.4, 0.06, -2] as const),
  Object.freeze([-16, 2.06, -7] as const),
  Object.freeze([-19, 4.06, -12] as const),
  Object.freeze([-22, 6.06, -17] as const),
] as const);

const AUTHORITY_ROUTE_WAYPOINTS_MM = Object.freeze([
  Object.freeze([-14_000, 0, 2_000] as const),
  Object.freeze([-16_000, 2_000, 7_000] as const),
  Object.freeze([-19_000, 4_000, 12_000] as const),
  Object.freeze([-22_000, 6_000, 17_000] as const),
] as const);

const AUTHORITY_ROUTE_COLLIDERS = Object.freeze([
  Object.freeze({
    id: 'map_collision_route_press_west_archive_s00',
    centerMm: Object.freeze([-15_016, 883, 4_540] as const),
  }),
  Object.freeze({
    id: 'map_collision_route_press_west_archive_s01',
    centerMm: Object.freeze([-17_521, 2_882, 9_535] as const),
  }),
  Object.freeze({
    id: 'map_collision_route_press_west_archive_s02',
    centerMm: Object.freeze([-20_521, 4_882, 14_535] as const),
  }),
] as const);

const LANDING_CENTER_RUNTIME_METERS = Object.freeze([-22, 5.91, -19] as const);
const LANDING_ART_FLOOR_TOP_MM = 6_000;
const VISUAL_LANE_WIDTH_MM = 2_180;
const AUTHORITY_CLEAR_WIDTH_MM = 2_400;
const MAX_ROUTE_POINT_PLANAR_DELTA_MM = 600;
const MAX_ROUTE_POINT_VERTICAL_DELTA_MM = 60;
const MAX_SEGMENT_CENTER_PLANAR_DELTA_MM = 320;
const MAX_SEGMENT_CENTER_VERTICAL_DELTA_MM = 180;

type RuntimeMapLoader = (
  source: unknown,
  artifacts: RuntimeMapArtifactBytes,
) => Promise<LoadedRuntimeMapPackage>;

export interface InkfallRev4CandidateArtifactBytes {
  readonly presentationArt: Uint8Array;
  readonly packageRender: Uint8Array;
  readonly authorityCollision: Uint8Array;
}

function routePointAsMapMillimeters(
  point: readonly [number, number, number],
): readonly [number, number, number] {
  return Object.freeze([
    Math.round(point[0] * 1_000),
    Math.round(point[1] * 1_000),
    Math.round(-point[2] * 1_000),
  ] as const);
}

function planarDeltaMm(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  return Math.round(Math.hypot(left[0] - right[0], left[2] - right[2]));
}

function authorityAlignment(loaded: LoadedRuntimeMapPackage) {
  const projectedArtRouteMm = INKFALL_REV4_ART_ROUTE_RUNTIME_METERS.map(routePointAsMapMillimeters);
  const routePointDeltas = projectedArtRouteMm.map((point, index) => Object.freeze({
    index,
    planarMm: planarDeltaMm(point, AUTHORITY_ROUTE_WAYPOINTS_MM[index]),
    verticalMm: Math.abs(point[1] - AUTHORITY_ROUTE_WAYPOINTS_MM[index][1]),
  }));
  const colliderDeltas = AUTHORITY_ROUTE_COLLIDERS.map((expected, index) => {
    const solid = loaded.authority.fixture.solids.find(({ id }) => id === expected.id);
    if (!solid || solid.shape.type !== 'box') {
      throw new Error(`INKFALL_REV4_AUTHORITY_ROUTE_COLLIDER_MISSING ${expected.id}`);
    }
    const actual = [solid.centerMm.x, solid.centerMm.y, solid.centerMm.z] as const;
    if (actual.join('|') !== expected.centerMm.join('|')) {
      throw new Error(`INKFALL_REV4_AUTHORITY_ROUTE_COLLIDER_DRIFT ${expected.id}`);
    }
    const start = projectedArtRouteMm[index];
    const end = projectedArtRouteMm[index + 1];
    const artMidpoint = [
      Math.round((start[0] + end[0]) / 2),
      Math.round((start[1] + end[1]) / 2),
      Math.round((start[2] + end[2]) / 2),
    ] as const;
    return Object.freeze({
      id: expected.id,
      planarMm: planarDeltaMm(artMidpoint, actual),
      verticalMm: Math.abs(artMidpoint[1] - actual[1]),
    });
  });
  const landing = loaded.authority.fixture.solids.find(
    ({ id }) => id === 'map_collision_node_archive_west',
  );
  if (!landing || landing.shape.type !== 'box') {
    throw new Error('INKFALL_REV4_ARCHIVE_LANDING_COLLIDER_MISSING');
  }
  const landingAuthorityTopMm = landing.centerMm.y + landing.shape.halfExtentsMm.y;
  const maximumRoutePointPlanarDeltaMm = Math.max(...routePointDeltas.map(({ planarMm }) => planarMm));
  const maximumRoutePointVerticalDeltaMm = Math.max(...routePointDeltas.map(({ verticalMm }) => verticalMm));
  const maximumSegmentCenterPlanarDeltaMm = Math.max(...colliderDeltas.map(({ planarMm }) => planarMm));
  const maximumSegmentCenterVerticalDeltaMm = Math.max(...colliderDeltas.map(({ verticalMm }) => verticalMm));
  const checks = Object.freeze({
    mapIdentityPinned: loaded.identity.id === INKFALL_REV4_CANDIDATE_AUTHORITY.mapId
      && loaded.identity.revision === INKFALL_REV4_CANDIDATE_AUTHORITY.mapRevision
      && loaded.identity.packageDigest === INKFALL_REV4_CANDIDATE_AUTHORITY.packageDigest
      && loaded.authority.fixtureHash === INKFALL_REV4_CANDIDATE_AUTHORITY.fixtureHash,
    frozenArtifactHashesPinned: loaded.presentation.renderSha256
      === INKFALL_REV4_CANDIDATE_AUTHORITY.renderSha256
      && loaded.authority.collisionSha256
      === INKFALL_REV4_CANDIDATE_AUTHORITY.collisionSha256,
    renderMeshesRemainNonAuthoritative:
      loaded.manifest.authority.renderMeshesMayBeAuthority === false,
    zonesAndSpawnsPinned: loaded.manifest.zones.length
      === INKFALL_REV4_CANDIDATE_AUTHORITY.zoneCount
      && loaded.manifest.spawns.length === INKFALL_REV4_CANDIDATE_AUTHORITY.spawnCount,
    routePointsWithinTolerance: maximumRoutePointPlanarDeltaMm
      <= MAX_ROUTE_POINT_PLANAR_DELTA_MM
      && maximumRoutePointVerticalDeltaMm <= MAX_ROUTE_POINT_VERTICAL_DELTA_MM,
    segmentCentersWithinTolerance: maximumSegmentCenterPlanarDeltaMm
      <= MAX_SEGMENT_CENTER_PLANAR_DELTA_MM
      && maximumSegmentCenterVerticalDeltaMm <= MAX_SEGMENT_CENTER_VERTICAL_DELTA_MM,
    visualLaneInsideAuthorityClearance: VISUAL_LANE_WIDTH_MM <= AUTHORITY_CLEAR_WIDTH_MM,
    landingTopExact: landingAuthorityTopMm === LANDING_ART_FLOOR_TOP_MM,
    catalogDefaultUnchanged: DEFAULT_MAP_ID === 'inkfall_foundry' && DEFAULT_MAP_REVISION === 1,
  });
  if (Object.values(checks).some((passed) => !passed)) {
    throw new Error(`INKFALL_REV4_AUTHORITY_ALIGNMENT_FAILED ${JSON.stringify(checks)}`);
  }
  return Object.freeze({
    coordinateContract: 'art glTF X/Y/Z = map X/Y/-Z millimeters divided by 1000',
    projectedArtRouteMm: Object.freeze(projectedArtRouteMm),
    routePointDeltas: Object.freeze(routePointDeltas),
    colliderDeltas: Object.freeze(colliderDeltas),
    maximumRoutePointPlanarDeltaMm,
    maximumRoutePointVerticalDeltaMm,
    maximumSegmentCenterPlanarDeltaMm,
    maximumSegmentCenterVerticalDeltaMm,
    visualLaneWidthMm: VISUAL_LANE_WIDTH_MM,
    authorityClearWidthMm: AUTHORITY_CLEAR_WIDTH_MM,
    landingArtFloorTopMm: LANDING_ART_FLOOR_TOP_MM,
    landingAuthorityTopMm,
    checks,
    allChecksPassed: true,
  });
}

function boxFacts(box: THREE.Box3) {
  return Object.freeze({
    minimum: Object.freeze(box.min.toArray()),
    maximum: Object.freeze(box.max.toArray()),
    size: Object.freeze(box.getSize(new THREE.Vector3()).toArray()),
  });
}

export function inspectInkfallRev4CandidateScene(scene: THREE.Object3D) {
  const overall = new THREE.Box3().setFromObject(scene);
  const rise = new THREE.Box3();
  const landing = new THREE.Box3();
  let riseMeshCount = 0;
  let landingMeshCount = 0;
  scene.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    if (object.name.startsWith('V4OPT_ARCHIVE_RISE_')) {
      rise.expandByObject(object);
      riseMeshCount += 1;
    } else if (object.name.startsWith('V4OPT_ARCHIVE_LANDING_')) {
      landing.expandByObject(object);
      landingMeshCount += 1;
    }
  });
  const routePointsInsideRise = INKFALL_REV4_ART_ROUTE_RUNTIME_METERS.every((point) => (
    rise.containsPoint(new THREE.Vector3(...point))
  ));
  const landingCenterInsideLanding = landing.containsPoint(
    new THREE.Vector3(...LANDING_CENTER_RUNTIME_METERS),
  );
  const horizontalBoundsInsidePackage = overall.min.x >= -36
    && overall.max.x <= 36
    && overall.min.z >= -28
    && overall.max.z <= 28;
  const decorativeVerticalOverhangMm = Math.max(0, Math.round((overall.max.y - 10) * 1_000));
  const checks = Object.freeze({
    expectedRev4MeshGroups: riseMeshCount === 7 && landingMeshCount === 9,
    routePointsInsideRise,
    landingCenterInsideLanding,
    horizontalBoundsInsidePackage,
    decorativeVerticalOverhangBounded: decorativeVerticalOverhangMm <= 1_000,
  });
  if (Object.values(checks).some((passed) => !passed)) {
    throw new Error(`INKFALL_REV4_ART_SCENE_ALIGNMENT_FAILED ${JSON.stringify(checks)}`);
  }
  return Object.freeze({
    overall: boxFacts(overall),
    archiveRise: boxFacts(rise),
    archiveLanding: boxFacts(landing),
    riseMeshCount,
    landingMeshCount,
    decorativeVerticalOverhangMm,
    checks,
    allChecksPassed: true,
  });
}

export async function loadInkfallRev4CandidateAuthorityBinding(
  source: unknown,
  artifacts: InkfallRev4CandidateArtifactBytes,
  loader: RuntimeMapLoader = loadRuntimeMapPackage,
) {
  if (
    artifacts.presentationArt === artifacts.packageRender
    || artifacts.presentationArt === artifacts.authorityCollision
    || artifacts.packageRender === artifacts.authorityCollision
  ) {
    throw new Error('INKFALL_REV4_ARTIFACT_ROLE_ALIAS');
  }
  if (artifacts.presentationArt.byteLength !== INKFALL_REV4_CANDIDATE_ART.bytes) {
    throw new Error('INKFALL_REV4_PRESENTATION_ART_SIZE_MISMATCH');
  }
  const presentationSha256 = await sha256Hex(artifacts.presentationArt);
  if (presentationSha256 !== INKFALL_REV4_CANDIDATE_ART.sha256) {
    throw new Error('INKFALL_REV4_PRESENTATION_ART_HASH_MISMATCH');
  }
  const loaded = await loader(source, Object.freeze({
    render: artifacts.packageRender,
    collision: artifacts.authorityCollision,
  }));
  return Object.freeze({
    loaded,
    presentationArt: artifacts.presentationArt,
    presentationSha256,
    authorityAlignment: authorityAlignment(loaded),
    roleSeparation: Object.freeze({
      presentationArtPassedToPackageLoader: false,
      packageRenderRole: 'frozen_revision_3_render_verification_only',
      collisionRole: 'frozen_revision_3_authoritative_collision_only',
      presentationRole: 'rev4_1_gltf_visual_only',
      renderMeshesMayBeAuthority: false,
    }),
  });
}
