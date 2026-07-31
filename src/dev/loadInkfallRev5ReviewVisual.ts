import type * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

import { getBundledMapPackageSource } from '../content/maps';
import {
  INKFALL_REV5_CANDIDATE_ART,
  inspectInkfallRev5CandidateScene,
  loadInkfallRev5CandidateAuthorityBinding,
} from '../app/inkfallRev5CandidateBinding';
import {
  createInkfallRev5VisualContinuity,
} from '../app/inkfallRev5VisualContinuity';
import {
  ONLINE_INKFALL_REV5_MAP_BINDING,
} from '../app/onlineAuthorityProfiles';

const rev5PresentationArtifactUrl = new URL(
  '../../assets/source/maps/inkfall-foundry/art-kit/press-archive-rev5/rev5/export/inkfall_foundry_rev5_geometry_portal.render-only-modules.glb',
  import.meta.url,
).href;
const revision3RenderArtifactUrl = new URL(
  '../../assets/source/maps/inkfall-foundry/revisions/revision-3/export/render.graybox.glb',
  import.meta.url,
).href;
const revision3CollisionArtifactUrl = new URL(
  '../../assets/source/maps/inkfall-foundry/revisions/revision-3/export/collision.authority.glb',
  import.meta.url,
).href;

async function fetchArtifact(url: string, role: string): Promise<Uint8Array> {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(
      `ONLINE_REV5_ARTIFACT_FETCH_FAILED role=${role} status=${response.status}`,
    );
  }
  return new Uint8Array(await response.arrayBuffer());
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
          : new Error('ONLINE_REV5_PRESENTATION_GLTF_PARSE_FAILED'),
      ),
    );
  });
}

export async function loadInkfallRev5ReviewVisual() {
  if (
    ONLINE_INKFALL_REV5_MAP_BINDING.render.sha256
      !== INKFALL_REV5_CANDIDATE_ART.sha256
    || ONLINE_INKFALL_REV5_MAP_BINDING.render.bytes
      !== INKFALL_REV5_CANDIDATE_ART.bytes
  ) {
    throw new Error('ONLINE_REV5_PRESENTATION_PROFILE_MISMATCH');
  }
  const source = getBundledMapPackageSource('inkfall_foundry', 3);
  if (source === undefined || source === null) {
    throw new Error('ONLINE_REV5_AUTHORITY_PACKAGE_NOT_BUNDLED');
  }
  const [
    presentationArt,
    packageRender,
    authorityCollision,
  ] = await Promise.all([
    fetchArtifact(rev5PresentationArtifactUrl, 'rev5_modular_presentation'),
    fetchArtifact(revision3RenderArtifactUrl, 'revision3_render_verification'),
    fetchArtifact(revision3CollisionArtifactUrl, 'revision3_authority_collision'),
  ]);
  const binding = await loadInkfallRev5CandidateAuthorityBinding(source, {
    presentationArt,
    packageRender,
    authorityCollision,
  });
  const loaded = binding.loaded;
  if (
    loaded.identity.id !== ONLINE_INKFALL_REV5_MAP_BINDING.mapId
    || loaded.identity.revision !== ONLINE_INKFALL_REV5_MAP_BINDING.mapRevision
    || loaded.identity.packageDigest
      !== ONLINE_INKFALL_REV5_MAP_BINDING.packageDigest
    || loaded.authority.fixture.id !== ONLINE_INKFALL_REV5_MAP_BINDING.fixtureId
    || loaded.authority.fixtureHash
      !== ONLINE_INKFALL_REV5_MAP_BINDING.fixtureHash
    || loaded.authority.fixture.solids.length
      !== ONLINE_INKFALL_REV5_MAP_BINDING.colliderCardinality
    || loaded.manifest.spawns.length !== 12
    || loaded.manifest.zones.length !== 9
    || loaded.manifest.pickups.length !== 0
    || loaded.manifest.authority.renderMeshesMayBeAuthority !== false
  ) {
    throw new Error('ONLINE_REV5_AUTHORITY_BINDING_MISMATCH');
  }
  const art = await parseGltf(binding.presentationArt);
  const sceneFacts = inspectInkfallRev5CandidateScene(art);
  const containment = createInkfallRev5VisualContinuity(
    loaded.authority.fixture,
  );
  art.name = 'INKFALL_REV5_MODULAR_PRESENTATION_ONLY_NOT_AUTHORITY';
  art.userData.presentationRole = 'rev5_modular_render_only_no_hit';
  art.userData.renderMeshesMayBeAuthority = false;
  art.userData.noHit = true;
  art.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.userData.presentationRole = 'rev5_modular_render_only_no_hit';
    mesh.userData.renderMeshesMayBeAuthority = false;
    mesh.userData.noHit = true;
  });
  return Object.freeze({
    art,
    containment: containment.group,
    meshCount: sceneFacts.meshCount,
    containmentMeshCount: containment.meshCount,
    presentationMode: 'review_glb' as const,
    presentationSha256: binding.presentationSha256,
  });
}
