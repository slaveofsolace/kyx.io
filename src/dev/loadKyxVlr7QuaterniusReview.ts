import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import {
  installKyxLineRifleReviewShellFactory,
} from '../weapons/KyxArmoryPresentation';
import {
  KYX_SELECTED_QUATERNIUS_GUN_ASSETS,
} from '../weapons/KyxArmorySelectedAssets';

const selectedVlr7 = KYX_SELECTED_QUATERNIUS_GUN_ASSETS.vertical_rifle_v1;

export const KYX_VLR7_QUATERNIUS_REVIEW = Object.freeze({
  ...selectedVlr7,
  meshObjectCount: 24,
  license: selectedVlr7.sourceLicense,
} as const);

const candidateUrl = new URL(
  `../../${KYX_VLR7_QUATERNIUS_REVIEW.assetRelativePath}`,
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

// The raw donor palette exposes broad bright receiver planes and saturated
// warning-red accents in first person; retoning keeps donor geometry and
// provenance intact while joining the KYX dark-alloy/cyan service language.
function retoneReviewMaterial(material: THREE.Material): THREE.Material {
  const clone = material.clone();
  if (!(clone instanceof THREE.MeshStandardMaterial)) return clone;
  const treatment = KYX_VLR7_QUATERNIUS_REVIEW.materialTreatment;
  const hsl = { h: 0, s: 0, l: 0 };
  clone.color.getHSL(hsl);
  if (hsl.s > 0.45 && (hsl.h <= 0.09 || hsl.h >= 0.9)) {
    clone.color.setHex(0x18292e);
    clone.emissive.setHex(0x07191d);
    clone.emissiveIntensity = 0.12;
    clone.metalness = 0.36;
    clone.roughness = 0.54;
  } else if (hsl.l > 0.62) {
    clone.color.setHex(0x3d474f);
    clone.metalness = 0.6;
    clone.roughness = 0.44;
  } else if (hsl.l > 0.34) {
    clone.color.setHex(0x2b353d);
    clone.metalness = 0.52;
    clone.roughness = 0.52;
  }
  // The adapted donor ships hot PBR values (metalness up to 0.92, roughness
  // 0.2, boosted emissive strength); under the close camera-space weapon key
  // those bloom into blank white planes, so clamp them into the suit range.
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
  clone.name =
    `${material.name || 'KYX_VLR7_REVIEW_MATERIAL'}_${treatment.version}`;
  return clone;
}

function cloneOwnedReviewShell(source: THREE.Object3D): THREE.Group {
  const clone = new THREE.Group();
  clone.name = `${KYX_VLR7_QUATERNIUS_REVIEW.rootNode}_OWNED_CLONE`;
  clone.add(source.clone(true));
  clone.traverse((object) => {
    object.userData.presentationOnly = true;
    object.userData.noHit = true;
    object.userData.authorityUnchanged = true;
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    mesh.geometry = mesh.geometry.clone();
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => retoneReviewMaterial(material))
      : retoneReviewMaterial(mesh.material);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
  });
  clone.userData.reviewCandidateId =
    KYX_VLR7_QUATERNIUS_REVIEW.candidateId;
  clone.userData.sourceAssetSha256 =
    KYX_VLR7_QUATERNIUS_REVIEW.sha256;
  clone.userData.sourceAssetBytes =
    KYX_VLR7_QUATERNIUS_REVIEW.bytes;
  clone.userData.weaponVisualSource =
    `quaternius_cc0_armory_rev1:${KYX_VLR7_QUATERNIUS_REVIEW.candidateId}`;
  clone.userData.reviewMaterialRetone =
    KYX_VLR7_QUATERNIUS_REVIEW.materialTreatment.version;
  clone.userData.sourceCredit = KYX_VLR7_QUATERNIUS_REVIEW.sourceCredit;
  clone.userData.sourceLicense = KYX_VLR7_QUATERNIUS_REVIEW.license;
  clone.userData.reviewOnly = true;
  clone.userData.releaseEligible = false;
  clone.userData.humanAccepted = false;
  clone.userData.firstPersonScaleMultiplier =
    KYX_VLR7_QUATERNIUS_REVIEW.firstPersonScaleMultiplier;
  clone.userData.firstPersonScalePivot = [
    ...KYX_VLR7_QUATERNIUS_REVIEW.firstPersonScalePivot,
  ];
  clone.userData.authorityMuzzleNode =
    KYX_VLR7_QUATERNIUS_REVIEW.muzzleNode;
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
  if (candidateRoot === undefined) {
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
  if (
    candidateRoot.getObjectByName(
      KYX_VLR7_QUATERNIUS_REVIEW.muzzleNode,
    ) === undefined
  ) {
    throw new Error(
      'KYX_VLR7_REVIEW_MUZZLE_MISSING '
      + `node=${KYX_VLR7_QUATERNIUS_REVIEW.muzzleNode}`,
    );
  }
  const structure = countTriangles(candidateRoot);
  if (
    structure.meshCount !== KYX_VLR7_QUATERNIUS_REVIEW.runtimeMeshCount
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
