import * as THREE from 'three';

import type { PhysicsFixtureV1 } from '../physics/fixtureSchema';
import {
  createInkfallRev4VisualContinuity,
} from './inkfallRev4VisualContinuity';

export const INKFALL_REV5_VISUAL_CONTINUITY_VERSION =
  'inkfall_rev5_online_visual_continuity_v2' as const;

const SUPERSEDED_RED_FOLD_OBJECTS = Object.freeze([
  'INKFALL_RED_FOLD_FRAME',
  'INKFALL_RED_FOLD_BACKFIN_LEFT',
  'INKFALL_RED_FOLD_BACKFIN_RIGHT',
  'INKFALL_RED_FOLD_GLOW',
]);

const REV5_READABILITY_PALETTE = new Map<number, Readonly<{
  color: number;
  emissive?: number;
  emissiveIntensity?: number;
}>>([
  [0x1b2a30, { color: 0x2b4049, emissive: 0x0c1d24, emissiveIntensity: 0.36 }],
  [0x2a3b41, { color: 0x3a5158, emissive: 0x102329, emissiveIntensity: 0.34 }],
  [0x111b20, { color: 0x1c2a31, emissive: 0x081218, emissiveIntensity: 0.3 }],
  [0x31464a, { color: 0x425b60, emissive: 0x102429, emissiveIntensity: 0.3 }],
  [0x213238, { color: 0x30454c, emissive: 0x0b1c22, emissiveIntensity: 0.27 }],
  [0x64767a, { color: 0x71868a }],
  [0x384c4e, { color: 0x4a6062 }],
  [0x765b3e, { color: 0x876a4c }],
  [0x0b4c55, { color: 0x116874, emissive: 0x073944, emissiveIntensity: 0.72 }],
]);

function removeSupersededRedFoldLandmark(group: THREE.Group): Readonly<{
  meshCount: number;
  lightCount: number;
  objectCount: number;
}> {
  let meshCount = 0;
  let lightCount = 0;
  let objectCount = 0;
  for (const name of SUPERSEDED_RED_FOLD_OBJECTS) {
    const object = group.getObjectByName(name);
    if (object?.parent === null || object?.parent === undefined) continue;
    object.traverse((descendant) => {
      if ((descendant as THREE.Mesh).isMesh) meshCount += 1;
      if ((descendant as THREE.Light).isLight) lightCount += 1;
      objectCount += 1;
    });
    object.parent.remove(object);
  }
  return Object.freeze({ meshCount, lightCount, objectCount });
}

function retuneRev5Readability(group: THREE.Group): number {
  const tuned = new Set<THREE.MeshStandardMaterial>();
  group.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      if (!(material instanceof THREE.MeshStandardMaterial) || tuned.has(material)) {
        continue;
      }
      const replacement = REV5_READABILITY_PALETTE.get(material.color.getHex());
      if (replacement === undefined) continue;
      material.color.setHex(replacement.color);
      if (replacement.emissive !== undefined) {
        material.emissive.setHex(replacement.emissive);
      }
      if (replacement.emissiveIntensity !== undefined) {
        material.emissiveIntensity = replacement.emissiveIntensity;
      }
      material.needsUpdate = true;
      tuned.add(material);
    }
  });
  return tuned.size;
}

/**
 * Retains the authority-aligned procedural shell while the rejected Rev4
 * parent-scene overlay is removed. Rev5 adds only its modular bridge,
 * landing, and portal presentation on top of this no-hit shell.
 */
export function createInkfallRev5VisualContinuity(
  fixture: PhysicsFixtureV1,
) {
  const continuity = createInkfallRev4VisualContinuity(fixture);
  const removedRedFold = removeSupersededRedFoldLandmark(continuity.group);
  const retunedMaterialCount = retuneRev5Readability(continuity.group);
  const meshCount = continuity.meshCount - removedRedFold.meshCount;
  const lightCount = continuity.lightCount - removedRedFold.lightCount;
  continuity.group.name =
    'INKFALL_REV5_AUTHORITY_ALIGNED_RENDER_ONLY_VISUAL_CONTINUITY';
  continuity.group.userData.meshCount = meshCount;
  continuity.group.userData.lightCount = lightCount;
  continuity.group.userData.visualContinuityVersion =
    INKFALL_REV5_VISUAL_CONTINUITY_VERSION;
  continuity.group.userData.rev5GeometryCorrection = Object.freeze({
    rejectedRev4ParentSceneOverlayRemoved: true,
    supersededProceduralRedFoldLandmarkRemoved: true,
    removedProceduralRedFoldObjectCount: removedRedFold.objectCount,
    modularRenderOnlyArtAddedSeparately: true,
    readabilityMaterialRetune: 'rev5_dark-surface-separation_v1',
    retunedMaterialCount,
    authorityFixtureUnchanged: true,
    renderMeshesMayBeAuthority: false,
  });
  continuity.group.traverse((object) => {
    object.userData.visualContinuityVersion =
      INKFALL_REV5_VISUAL_CONTINUITY_VERSION;
    object.userData.rev5PresentationRole =
      'authority_aligned_no_hit_shell';
  });
  return Object.freeze({
    ...continuity,
    meshCount,
    lightCount,
  });
}
