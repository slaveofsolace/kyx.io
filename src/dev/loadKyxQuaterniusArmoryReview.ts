import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import {
  installKyxWeaponReviewShellFactory,
  type KyxAuthorityWeaponId,
} from '../weapons/KyxArmoryPresentation';

interface ArmoryCandidate {
  readonly candidateId: string;
  readonly authorityWeaponId: KyxAuthorityWeaponId;
  readonly url: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly runtimeMeshCount: number;
  readonly triangleCount: number;
  readonly rootNode: string;
  readonly firstPersonScaleMultiplier: number;
  readonly firstPersonScalePivot: readonly [number, number, number];
}

export const KYX_QUATERNIUS_ARMORY_REVIEW = Object.freeze([
  Object.freeze({
    candidateId: 'kyx-k9-quaternius-rev1',
    authorityWeaponId: 'kyx_sidearm_v1',
    url: new URL(
      '../../assets/review/runtime-candidates/kyx-quaternius-armory-rev1/kyx-k9-quaternius-rev1.glb',
      import.meta.url,
    ).href,
    bytes: 233_708,
    sha256: '4b72710b6071bd120195ddd80673ec47cc5a3f394430bb6d614df04dcf42b339',
    runtimeMeshCount: 5,
    triangleCount: 7_048,
    rootNode: 'KYX_K9_QUATERNIUS_REV1',
    firstPersonScaleMultiplier: 0.56,
    firstPersonScalePivot: Object.freeze([0, 0.12, -0.385] as const),
  }),
  Object.freeze({
    candidateId: 'kyx-sg4-quaternius-rev1',
    authorityWeaponId: 'kyx_scattergun_v1',
    url: new URL(
      '../../assets/review/runtime-candidates/kyx-quaternius-armory-rev1/kyx-sg4-quaternius-rev1.glb',
      import.meta.url,
    ).href,
    bytes: 510_624,
    sha256: 'd04629199f582dfcb2dce89bf534f295ee8689fa6cead04854c8a2e2a0bafd4b',
    runtimeMeshCount: 4,
    triangleCount: 10_006,
    rootNode: 'KYX_SG4_QUATERNIUS_REV1',
    firstPersonScaleMultiplier: 0.58,
    firstPersonScalePivot: Object.freeze([0, 0.095, -0.74] as const),
  }),
  Object.freeze({
    candidateId: 'kyx-longbow12-quaternius-rev1',
    authorityWeaponId: 'kyx_longshot_v1',
    url: new URL(
      '../../assets/review/runtime-candidates/kyx-quaternius-armory-rev1/kyx-longbow12-quaternius-rev1.glb',
      import.meta.url,
    ).href,
    bytes: 285_500,
    sha256: 'af4a907b60c1b482cf9e7d7339c884905dd5ae4d792a1ecc94bbd1a2da227b55',
    runtimeMeshCount: 4,
    triangleCount: 7_440,
    rootNode: 'KYX_LONGBOW12_QUATERNIUS_REV1',
    firstPersonScaleMultiplier: 0.5,
    firstPersonScalePivot: Object.freeze([0, 0.11, -1.205] as const),
  }),
  Object.freeze({
    candidateId: 'kyx-br6-quaternius-rev1',
    authorityWeaponId: 'kyx_breach_rocket_v1',
    url: new URL(
      '../../assets/review/runtime-candidates/kyx-quaternius-armory-rev1/kyx-br6-quaternius-rev1.glb',
      import.meta.url,
    ).href,
    bytes: 482_632,
    sha256: '6eb88285056f83b064cbbf82c7b123a8453d1deec61c4a4c2e47b081409b735b',
    runtimeMeshCount: 4,
    triangleCount: 12_135,
    rootNode: 'KYX_BR6_QUATERNIUS_REV1',
    firstPersonScaleMultiplier: 0.46,
    firstPersonScalePivot: Object.freeze([0, 0.11, -0.76] as const),
  }),
] as const satisfies readonly ArmoryCandidate[]);

let loadPromise: Promise<Readonly<{
  candidateCount: number;
  totalBytes: number;
  totalTriangles: number;
  presentationOnly: true;
  authorityUnchanged: true;
  humanAccepted: false;
}>> | null = null;

function digestHex(bytes: Uint8Array): Promise<string> {
  const view = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return crypto.subtle.digest('SHA-256', view).then((digest) => (
    [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('')
  ));
}

function parseGltf(bytes: Uint8Array): Promise<THREE.Group> {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(
      buffer,
      '',
      ({ scene }) => resolve(scene),
      (cause) => reject(
        cause instanceof Error
          ? cause
          : new Error('KYX_ARMORY_REVIEW_GLTF_PARSE_FAILED'),
      ),
    );
  });
}

function countStructure(root: THREE.Object3D): Readonly<{
  meshCount: number;
  triangleCount: number;
}> {
  let meshCount = 0;
  let triangleCount = 0;
  root.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const geometry = (object as THREE.Mesh).geometry;
    meshCount += 1;
    triangleCount += geometry.index === null
      ? geometry.attributes.position.count / 3
      : geometry.index.count / 3;
  });
  return Object.freeze({ meshCount, triangleCount });
}

function cloneOwnedShell(
  candidate: ArmoryCandidate,
  source: THREE.Object3D,
): THREE.Group {
  const clone = new THREE.Group();
  clone.name = `${candidate.rootNode}_OWNED_CLONE`;
  clone.add(source.clone(true));
  clone.traverse((object) => {
    object.userData.presentationOnly = true;
    object.userData.noHit = true;
    object.userData.authorityUnchanged = true;
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    mesh.geometry = mesh.geometry.clone();
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => material.clone())
      : mesh.material.clone();
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
  });
  clone.userData.weaponVisualSource =
    `quaternius_cc0_armory_rev1:${candidate.candidateId}`;
  clone.userData.reviewCandidateId = candidate.candidateId;
  clone.userData.sourceCredit = 'Sci-Fi Gun Pack by Quaternius';
  clone.userData.sourceLicense = 'CC0-1.0';
  clone.userData.releaseEligible = false;
  clone.userData.humanAccepted = false;
  clone.userData.firstPersonScaleMultiplier =
    candidate.firstPersonScaleMultiplier;
  clone.userData.firstPersonScalePivot = [
    ...candidate.firstPersonScalePivot,
  ];
  return clone;
}

async function loadCandidate(candidate: ArmoryCandidate): Promise<Readonly<{
  candidate: ArmoryCandidate;
  root: THREE.Object3D;
}>> {
  const response = await fetch(candidate.url);
  if (!response.ok) {
    throw new Error(
      `KYX_ARMORY_REVIEW_FETCH_FAILED candidate=${candidate.candidateId} status=${response.status}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== candidate.bytes) {
    throw new Error(
      `KYX_ARMORY_REVIEW_BYTE_MISMATCH candidate=${candidate.candidateId} expected=${candidate.bytes} actual=${bytes.byteLength}`,
    );
  }
  const sha256 = await digestHex(bytes);
  if (sha256 !== candidate.sha256) {
    throw new Error(
      `KYX_ARMORY_REVIEW_HASH_MISMATCH candidate=${candidate.candidateId} expected=${candidate.sha256} actual=${sha256}`,
    );
  }
  const scene = await parseGltf(bytes);
  const root = scene.getObjectByName(candidate.rootNode);
  if (root === undefined) {
    throw new Error(
      `KYX_ARMORY_REVIEW_ROOT_MISSING candidate=${candidate.candidateId} node=${candidate.rootNode}`,
    );
  }
  const structure = countStructure(root);
  if (
    structure.meshCount !== candidate.runtimeMeshCount
    || structure.triangleCount !== candidate.triangleCount
  ) {
    throw new Error(
      `KYX_ARMORY_REVIEW_STRUCTURE_MISMATCH candidate=${candidate.candidateId} meshes=${structure.meshCount} triangles=${structure.triangleCount}`,
    );
  }
  return Object.freeze({ candidate, root });
}

async function loadArmory() {
  // Install only after the entire batch verifies. A missing/corrupt donor must
  // never leave players with a partially mixed procedural/review armory.
  const loaded = await Promise.all(
    KYX_QUATERNIUS_ARMORY_REVIEW.map((candidate) => loadCandidate(candidate)),
  );
  for (const { candidate, root } of loaded) {
    installKyxWeaponReviewShellFactory(
      candidate.authorityWeaponId,
      () => cloneOwnedShell(candidate, root),
    );
  }
  return Object.freeze({
    candidateCount: loaded.length,
    totalBytes: KYX_QUATERNIUS_ARMORY_REVIEW.reduce(
      (sum, candidate) => sum + candidate.bytes,
      0,
    ),
    totalTriangles: KYX_QUATERNIUS_ARMORY_REVIEW.reduce(
      (sum, candidate) => sum + candidate.triangleCount,
      0,
    ),
    presentationOnly: true as const,
    authorityUnchanged: true as const,
    humanAccepted: false as const,
  });
}

export function loadKyxQuaterniusArmoryReview() {
  loadPromise ??= loadArmory();
  return loadPromise;
}
