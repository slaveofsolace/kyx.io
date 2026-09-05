import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { hashPhysicsFixture, type PhysicsFixtureV1 } from '../physics/fixtureSchema';
import manifest from '../../assets/review/runtime-candidates/relay-reset-map/manifest.json';

export type RelayResetTreatment =
  | 'communications-deck'
  | 'ceramic-campus'
  | 'transmitter-workshop';

/** Keep the existing sky, lighting and distant terrain during a paired review. */
export const RELAY_RESET_REPLACED_ROOT_NAMES = Object.freeze([
  'RELAY_AUTHORITY_ALIGNED_VISUALS',
  'RELAY_ARCHITECTURAL_SKIN_V5',
  'RELAY_V5_CENTER_LANE_SIGNAL_DASHES',
  'RELAY_CENTER_NODE_SIGNAL_INLAY',
  'RELAY_UPPER_BRIDGE_SIGNAL_INLAY',
  'RELAY_LOWER_COURT_SIGNAL_INLAY',
] as const);

export interface RelayResetArchitectureDiagnostics {
  readonly treatment: RelayResetTreatment;
  readonly fixtureHash: string;
  readonly candidateSha256: string;
  readonly meshCount: number;
  readonly triangles: number;
  readonly materialCount: number;
  readonly textureCount: 0;
  readonly loadedBytes: number;
  readonly authorityGeometryAdded: false;
  readonly humanAccepted: false;
  readonly releaseEligible: false;
  readonly disposed: boolean;
}

export interface RelayResetArchitecture {
  readonly group: THREE.Group;
  readonly diagnostics: () => RelayResetArchitectureDiagnostics;
  readonly dispose: () => void;
}

function candidateUrl(treatment: RelayResetTreatment): string {
  if (!import.meta.env.DEV) {
    throw new Error('RELAY_RESET_ARCHITECTURE_REQUIRES_LOCAL_DEVELOPMENT');
  }
  switch (treatment) {
    case 'communications-deck':
      return new URL('../../assets/review/runtime-candidates/relay-reset-map/relay-communications-deck.glb', import.meta.url).href;
    case 'ceramic-campus':
      return new URL('../../assets/review/runtime-candidates/relay-reset-map/relay-ceramic-campus.glb', import.meta.url).href;
    case 'transmitter-workshop':
      return new URL('../../assets/review/runtime-candidates/relay-reset-map/relay-transmitter-workshop.glb', import.meta.url).href;
  }
}

/**
 * Explicit local art review. The GLB supplies presentation only and is pinned to
 * the existing authority fixture. Failure leaves selection/fallback to the caller.
 */
export async function createRelayResetArchitecture(
  fixture: PhysicsFixtureV1,
  options: Readonly<{ treatment: RelayResetTreatment }>,
): Promise<RelayResetArchitecture> {
  const candidate = manifest.candidates.find(
    ({ treatment }) => treatment === options.treatment,
  );
  if (
    candidate === undefined
    || fixture.id !== 'relay_map_collision'
    || hashPhysicsFixture(fixture) !== candidate.fixtureHash
    || fixture.solids.length !== candidate.authorityColliderCount
  ) {
    throw new Error('RELAY_RESET_ARCHITECTURE_FIXTURE_MISMATCH');
  }
  const response = await fetch(candidateUrl(options.treatment));
  if (!response.ok) throw new Error('RELAY_RESET_ARCHITECTURE_LOAD_FAILED');
  const bytes = await response.arrayBuffer();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const sha256 = Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('');
  if (sha256 !== candidate.sha256 || bytes.byteLength !== candidate.fileBytes) {
    throw new Error('RELAY_RESET_ARCHITECTURE_PAYLOAD_MISMATCH');
  }
  const gltf = await new GLTFLoader().parseAsync(bytes, '');
  const group = gltf.scene;
  group.name = `RELAY_RESET_${options.treatment.toUpperCase().replaceAll('-', '_')}`;
  group.userData.authorityFixtureHash = candidate.fixtureHash;
  group.userData.authorityGeometryAdded = false;
  group.userData.noHit = true;
  group.userData.humanAccepted = false;
  group.userData.releaseEligible = false;

  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  let meshCount = 0;
  let triangles = 0;
  let disposed = false;
  group.traverse((object) => {
    object.userData.noHit = true;
    object.userData.renderMeshesMayBeAuthority = false;
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = true;
    object.receiveShadow = true;
    meshCount += 1;
    geometries.add(object.geometry);
    triangles += object.geometry.index
      ? object.geometry.index.count / 3
      : object.geometry.getAttribute('position').count / 3;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
    }
  });

  return Object.freeze({
    group,
    diagnostics: (): RelayResetArchitectureDiagnostics => Object.freeze({
      treatment: options.treatment,
      fixtureHash: candidate.fixtureHash,
      candidateSha256: sha256,
      meshCount,
      triangles,
      materialCount: materials.size,
      textureCount: 0,
      loadedBytes: bytes.byteLength,
      authorityGeometryAdded: false,
      humanAccepted: false,
      releaseEligible: false,
      disposed,
    }),
    dispose: (): void => {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    },
  });
}
