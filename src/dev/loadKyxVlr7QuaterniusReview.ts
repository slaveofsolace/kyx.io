import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import {
  installKyxLineRifleReviewShellFactory,
} from '../weapons/KyxArmoryPresentation';

export const KYX_VLR7_QUATERNIUS_REVIEW = Object.freeze({
  candidateId: 'kyx-vlr7-quaternius-rev1',
  bytes: 132_052,
  sha256: '46de2380ac08810524d7bb4bb67d8621bb436a4f559b4d672d5c2026a075dd79',
  meshCount: 24,
  triangleCount: 2_384,
  rootNode: 'KYX_VLR7_QUATERNIUS_REV1',
  magazineNode: 'KYX_VLR7_REVIEW_MAGAZINE',
  license: 'CC0-1.0',
  sourceCredit: 'Sci-Fi Gun Pack by Quaternius',
  releaseEligible: false,
  humanAccepted: false,
} as const);

const candidateUrl = new URL(
  '../../assets/review/runtime-candidates/kyx-vlr7-quaternius-rev1/kyx-vlr7-quaternius-rev1.glb',
  import.meta.url,
).href;

let loadPromise: Promise<Readonly<{
  candidateId: typeof KYX_VLR7_QUATERNIUS_REVIEW.candidateId;
  bytes: number;
  sha256: string;
  meshCount: number;
  triangleCount: number;
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
          : new Error('KYX_VLR7_REVIEW_GLTF_PARSE_FAILED'),
      ),
    );
  });
}

function countTriangles(root: THREE.Object3D): Readonly<{
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

function cloneOwnedReviewShell(source: THREE.Group): THREE.Group {
  const clone = source.clone(true);
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
  clone.userData.reviewCandidateId =
    KYX_VLR7_QUATERNIUS_REVIEW.candidateId;
  clone.userData.sourceCredit = KYX_VLR7_QUATERNIUS_REVIEW.sourceCredit;
  clone.userData.sourceLicense = KYX_VLR7_QUATERNIUS_REVIEW.license;
  clone.userData.releaseEligible = false;
  clone.userData.humanAccepted = false;
  return clone;
}

async function loadReviewShell() {
  const response = await fetch(candidateUrl, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(
      `KYX_VLR7_REVIEW_FETCH_FAILED status=${response.status}`,
    );
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const sha256 = await digestHex(bytes);
  if (
    bytes.byteLength !== KYX_VLR7_QUATERNIUS_REVIEW.bytes
    || sha256 !== KYX_VLR7_QUATERNIUS_REVIEW.sha256
  ) {
    throw new Error(
      'KYX_VLR7_REVIEW_HASH_MISMATCH '
      + `bytes=${bytes.byteLength} sha256=${sha256}`,
    );
  }

  const loaded = await parseGltf(bytes);
  const candidateRoot = loaded.getObjectByName(
    KYX_VLR7_QUATERNIUS_REVIEW.rootNode,
  );
  if (!(candidateRoot instanceof THREE.Group)) {
    throw new Error(
      `KYX_VLR7_REVIEW_ROOT_MISSING node=${KYX_VLR7_QUATERNIUS_REVIEW.rootNode}`,
    );
  }
  if (
    candidateRoot.getObjectByName(
      KYX_VLR7_QUATERNIUS_REVIEW.magazineNode,
    ) === undefined
  ) {
    throw new Error(
      'KYX_VLR7_REVIEW_MAGAZINE_MISSING '
      + `node=${KYX_VLR7_QUATERNIUS_REVIEW.magazineNode}`,
    );
  }
  const structure = countTriangles(candidateRoot);
  if (
    structure.meshCount !== KYX_VLR7_QUATERNIUS_REVIEW.meshCount
    || structure.triangleCount !== KYX_VLR7_QUATERNIUS_REVIEW.triangleCount
  ) {
    throw new Error(
      'KYX_VLR7_REVIEW_STRUCTURE_MISMATCH '
      + `meshes=${structure.meshCount} triangles=${structure.triangleCount}`,
    );
  }

  installKyxLineRifleReviewShellFactory(
    () => cloneOwnedReviewShell(candidateRoot),
  );
  return Object.freeze({
    candidateId: KYX_VLR7_QUATERNIUS_REVIEW.candidateId,
    bytes: bytes.byteLength,
    sha256,
    meshCount: structure.meshCount,
    triangleCount: structure.triangleCount,
    presentationOnly: true as const,
    authorityUnchanged: true as const,
    humanAccepted: false as const,
  });
}

export function loadKyxVlr7QuaterniusReview() {
  loadPromise ??= loadReviewShell();
  return loadPromise;
}
