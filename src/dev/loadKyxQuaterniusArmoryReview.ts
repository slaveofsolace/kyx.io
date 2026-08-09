import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import {
  installKyxWeaponReviewShellFactory,
} from '../weapons/KyxArmoryPresentation';
import {
  KYX_SELECTED_QUATERNIUS_GUN_ASSETS,
  type KyxSelectedGunAssetProfile,
} from '../weapons/KyxArmorySelectedAssets';

interface ArmoryCandidate extends KyxSelectedGunAssetProfile {
  readonly url: string;
}

function withRuntimeUrl(
  profile: KyxSelectedGunAssetProfile,
): Readonly<ArmoryCandidate> {
  return Object.freeze({
    ...profile,
    url: new URL(`../../${profile.assetRelativePath}`, import.meta.url).href,
  });
}

export const KYX_QUATERNIUS_ARMORY_REVIEW = Object.freeze([
  withRuntimeUrl(KYX_SELECTED_QUATERNIUS_GUN_ASSETS.kyx_sidearm_v1),
  withRuntimeUrl(KYX_SELECTED_QUATERNIUS_GUN_ASSETS.kyx_scattergun_v1),
  withRuntimeUrl(KYX_SELECTED_QUATERNIUS_GUN_ASSETS.kyx_longshot_v1),
  withRuntimeUrl(KYX_SELECTED_QUATERNIUS_GUN_ASSETS.kyx_breach_rocket_v1),
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

function retoneReviewMaterial(
  material: THREE.Material,
  candidate: ArmoryCandidate,
): THREE.Material {
  const clone = material.clone();
  if (!(clone instanceof THREE.MeshStandardMaterial)) return clone;
  const treatment = candidate.materialTreatment;
  const hsl = { h: 0, s: 0, l: 0 };
  clone.color.getHSL(hsl);
  if (hsl.s > 0.42) {
    clone.color.setHex(treatment.accent).multiplyScalar(0.34);
    clone.emissive.setHex(treatment.accent).multiplyScalar(0.05);
  } else if (hsl.l > 0.56) {
    clone.color.setHex(treatment.armor);
  } else if (hsl.l > 0.28) {
    clone.color.setHex(0x29343b);
  } else {
    clone.color.setHex(0x121a20);
  }
  clone.metalness = Math.min(
    clone.metalness,
    treatment.maximumMetalness,
  );
  clone.roughness = Math.max(
    clone.roughness,
    treatment.minimumRoughness,
  );
  clone.emissiveIntensity = Math.min(
    clone.emissiveIntensity,
    treatment.maximumEmissiveIntensity,
  );
  clone.name = `${material.name || candidate.rootNode}_${treatment.version}`;
  return clone;
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
      ? mesh.material.map((material) => (
          retoneReviewMaterial(material, candidate)
        ))
      : retoneReviewMaterial(mesh.material, candidate);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
  });
  clone.userData.weaponVisualSource =
    `quaternius_cc0_armory_rev1:${candidate.candidateId}`;
  clone.userData.reviewCandidateId = candidate.candidateId;
  clone.userData.sourceAssetSha256 = candidate.sha256;
  clone.userData.sourceAssetBytes = candidate.bytes;
  clone.userData.sourceCredit = 'Sci-Fi Gun Pack by Quaternius';
  clone.userData.sourceLicense = 'CC0-1.0';
  clone.userData.reviewOnly = true;
  clone.userData.releaseEligible = false;
  clone.userData.humanAccepted = false;
  clone.userData.reviewMaterialRetone =
    candidate.materialTreatment.version;
  clone.userData.authorityMuzzleNode = candidate.muzzleNode;
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
  if (root.getObjectByName(candidate.muzzleNode) === undefined) {
    throw new Error(
      `KYX_ARMORY_REVIEW_MUZZLE_MISSING candidate=${candidate.candidateId} node=${candidate.muzzleNode}`,
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
