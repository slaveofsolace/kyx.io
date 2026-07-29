import * as THREE from 'three';

import type { PhysicsFixtureV1 } from '../physics/fixtureSchema';
import {
  createInkfallRev4VisualContinuity,
} from './inkfallRev4VisualContinuity';

export const INKFALL_REV5_VISUAL_CONTINUITY_VERSION =
  'inkfall_rev5_online_visual_continuity_v4' as const;

const SUPERSEDED_RED_FOLD_OBJECTS = Object.freeze([
  'INKFALL_RED_FOLD_FRAME',
  'INKFALL_RED_FOLD_BACKFIN_LEFT',
  'INKFALL_RED_FOLD_BACKFIN_RIGHT',
  'INKFALL_RED_FOLD_GLOW',
]);

const REDUNDANT_SPAWN_EXIT_FRAMES = Object.freeze([
  'INKFALL_WEST_SPAWN_EXIT_FRAME',
  'INKFALL_EAST_SPAWN_EXIT_FRAME',
]);

const SUPERSEDED_PRESS_ROLLER_OBJECTS = Object.freeze([
  'INKFALL_PRESS_MAIN_ROLLER',
  'INKFALL_PRESS_ROLLER_COLLAR_-5.9',
  'INKFALL_PRESS_ROLLER_COLLAR_5.9',
]);

const SUPERSEDED_INDEX_WHEEL_OBJECTS = Object.freeze([
  'INKFALL_INDEX_WHEEL',
  ...Array.from(
    { length: 8 },
    (_, index) => `INKFALL_INDEX_WHEEL_SPOKE_${index}`,
  ),
]);

const REV5_READABILITY_PALETTE = new Map<number, Readonly<{
  color: number;
  emissive?: number;
  emissiveIntensity?: number;
}>>([
  [0x1b2a30, { color: 0x3a5158, emissive: 0x10242b, emissiveIntensity: 0.34 }],
  [0x2a3b41, { color: 0x486269, emissive: 0x142b31, emissiveIntensity: 0.32 }],
  [0x111b20, { color: 0x32464d, emissive: 0x0d1b21, emissiveIntensity: 0.28 }],
  [0x31464a, { color: 0x50696e, emissive: 0x142a30, emissiveIntensity: 0.28 }],
  [0x213238, { color: 0x3a5057, emissive: 0x0f2228, emissiveIntensity: 0.25 }],
  [0x64767a, { color: 0x789094 }],
  [0x384c4e, { color: 0x52686b }],
  [0x765b3e, { color: 0x8f704f }],
  [0x0b4c55, { color: 0x167987, emissive: 0x08434d, emissiveIntensity: 0.64 }],
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

function removeRedundantSpawnExitFrames(group: THREE.Group): Readonly<{
  meshCount: number;
  objectCount: number;
}> {
  let meshCount = 0;
  let objectCount = 0;
  for (const name of REDUNDANT_SPAWN_EXIT_FRAMES) {
    const object = group.getObjectByName(name);
    if (object?.parent === null || object?.parent === undefined) continue;
    object.traverse((descendant) => {
      if ((descendant as THREE.Mesh).isMesh) meshCount += 1;
      objectCount += 1;
    });
    object.parent.remove(object);
  }
  return Object.freeze({ meshCount, objectCount });
}

function removeSupersededPressRollerObjects(group: THREE.Group): Readonly<{
  meshCount: number;
}> {
  let meshCount = 0;
  for (const name of SUPERSEDED_PRESS_ROLLER_OBJECTS) {
    const object = group.getObjectByName(name);
    if (object?.parent === null || object?.parent === undefined) continue;
    object.traverse((descendant) => {
      if ((descendant as THREE.Mesh).isMesh) meshCount += 1;
    });
    object.parent.remove(object);
  }
  return Object.freeze({ meshCount });
}

function removeSupersededIndexWheel(group: THREE.Group): Readonly<{
  meshCount: number;
}> {
  let meshCount = 0;
  for (const name of SUPERSEDED_INDEX_WHEEL_OBJECTS) {
    const object = group.getObjectByName(name);
    if (object?.parent === null || object?.parent === undefined) continue;
    object.traverse((descendant) => {
      if ((descendant as THREE.Mesh).isMesh) meshCount += 1;
    });
    object.parent.remove(object);
  }
  return Object.freeze({ meshCount });
}

function mountPressRollerLandmark(group: THREE.Group): Readonly<{
  meshCount: number;
}> {
  const coreMaterial = new THREE.MeshStandardMaterial({
    color: 0x536970,
    emissive: 0x13262d,
    emissiveIntensity: 0.24,
    metalness: 0.72,
    roughness: 0.38,
  });
  coreMaterial.name = 'INKFALL_REV5_PRESS_CROSSHEAD_STEEL';
  const mountMaterial = coreMaterial.clone();
  mountMaterial.name = 'INKFALL_REV5_PRESS_ROLLER_MOUNT_STEEL';
  mountMaterial.color.setHex(0x647a80);
  mountMaterial.emissive.setHex(0x172a30);
  mountMaterial.emissiveIntensity = 0.26;
  mountMaterial.metalness = 0.7;
  mountMaterial.roughness = 0.44;
  const bandMaterial = coreMaterial.clone();
  bandMaterial.name = 'INKFALL_REV5_PRESS_COMPRESSION_BAND';
  bandMaterial.color.setHex(0x2d555e);
  bandMaterial.emissive.setHex(0x0d3038);
  bandMaterial.emissiveIntensity = 0.32;

  const addMountBox = (
    name: string,
    size: readonly [number, number, number],
    position: readonly [number, number, number],
    material = mountMaterial,
  ): void => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size[0], size[1], size[2]),
      material,
    );
    mesh.name = name;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.userData.presentationRole = 'render_only';
    mesh.userData.renderMeshesMayBeAuthority = false;
    mesh.userData.onlineAuthoritySource = 'industrial_landmark';
    mesh.userData.noHit = true;
    mesh.userData.pressRollerMount = true;
    group.add(mesh);
  };

  addMountBox(
    'INKFALL_REV5_PRESS_CROSSHEAD_CORE',
    [11.8, 3.1, 3.1],
    [0, 6.9, 0],
    coreMaterial,
  );
  addMountBox(
    'INKFALL_REV5_PRESS_COMPRESSION_BAND',
    [2.2, 3.36, 3.36],
    [0, 6.9, 0],
    bandMaterial,
  );
  for (const x of [-5.9, 5.9]) {
    const token = x < 0 ? 'WEST' : 'EAST';
    addMountBox(
      `INKFALL_REV5_PRESS_ROLLER_BEARING_${token}`,
      [1.6, 1.45, 1.2],
      [x, 6.9, 0],
    );
    addMountBox(
      `INKFALL_REV5_PRESS_ROLLER_HANGER_${token}`,
      [1.08, 2.35, 0.72],
      [x, 8.35, 0],
    );
  }
  return Object.freeze({ meshCount: 6 });
}

function retuneRev5Readability(group: THREE.Group): Readonly<{
  landmarkMeshCount: number;
  materialCount: number;
}> {
  const tuned = new Set<THREE.MeshStandardMaterial>();
  let landmarkMeshCount = 0;
  group.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    if (
      mesh.name === 'INKFALL_PRESS_MAIN_ROLLER'
      || mesh.name.startsWith('INKFALL_PRESS_ROLLER_COLLAR_')
    ) {
      if (!(mesh.material instanceof THREE.MeshStandardMaterial)) return;
      const material = mesh.material.clone();
      material.name = mesh.name === 'INKFALL_PRESS_MAIN_ROLLER'
        ? 'INKFALL_REV5_PRESS_ROLLER_BRUSHED_STEEL'
        : 'INKFALL_REV5_PRESS_ROLLER_MUTED_BRASS';
      if (mesh.name === 'INKFALL_PRESS_MAIN_ROLLER') {
        material.color.setHex(0x536970);
        material.emissive.setHex(0x101b20);
        material.emissiveIntensity = 0.22;
        material.metalness = 0.72;
        material.roughness = 0.38;
      } else {
        material.color.setHex(0x9a6b32);
        material.emissive.setHex(0x231407);
        material.emissiveIntensity = 0.18;
        material.metalness = 0.66;
        material.roughness = 0.42;
      }
      material.needsUpdate = true;
      mesh.material = material;
      tuned.add(material);
      landmarkMeshCount += 1;
      return;
    }
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
  return Object.freeze({
    landmarkMeshCount,
    materialCount: tuned.size,
  });
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
  const removedSpawnFrames = removeRedundantSpawnExitFrames(continuity.group);
  const removedPressRollerObjects = removeSupersededPressRollerObjects(
    continuity.group,
  );
  const removedIndexWheel = removeSupersededIndexWheel(continuity.group);
  const readabilityRetune = retuneRev5Readability(continuity.group);
  const pressRollerMount = mountPressRollerLandmark(continuity.group);
  const meshCount = (
    continuity.meshCount
    - removedRedFold.meshCount
    - removedSpawnFrames.meshCount
    - removedPressRollerObjects.meshCount
    - removedIndexWheel.meshCount
    + pressRollerMount.meshCount
  );
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
    redundantSpawnExitFramesRemoved: true,
    removedSpawnExitFrameObjectCount: removedSpawnFrames.objectCount,
    modularRenderOnlyArtAddedSeparately: true,
    readabilityMaterialRetune: 'rev5_dark-surface-separation_v2',
    retunedMaterialCount: readabilityRetune.materialCount,
    pressRollerLandmarkRetune: 'connected_press_crosshead_no-floating-cylinders_v3',
    retunedPressRollerMeshCount: readabilityRetune.landmarkMeshCount,
    supersededPressRollerObjectsRemoved: true,
    removedPressRollerObjectMeshCount: removedPressRollerObjects.meshCount,
    supersededFloatingIndexWheelRemoved: true,
    removedIndexWheelMeshCount: removedIndexWheel.meshCount,
    pressRollerMount: 'two_bearings_two_overhead_hangers_v1',
    pressRollerMountMeshCount: pressRollerMount.meshCount,
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
