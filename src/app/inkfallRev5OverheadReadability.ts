import * as THREE from 'three';

export const INKFALL_REV5_OVERHEAD_READABILITY_VERSION =
  'inkfall_rev5_overhead_readability_v1' as const;

/**
 * Render-only overhead subordination for the Rev5 presentation art.
 *
 * The authored ceiling family (six coffers, six full-span cross trusses,
 * three longitudinal members) reads as an undifferentiated black lattice in
 * gameplay because every downward-facing surface samples only hemisphere
 * ground bounce. This pass hides the unmotivated repeated members, keeps the
 * two trusses paired with the lit ceramic coffers as real load paths, and
 * lifts the remaining overhead materials out of the black floor. Meshes are
 * hidden, never removed, so authored mesh counts and the GLB stay intact.
 */
// The Blender export joins authored objects per zone and material, so the
// ceiling family arrives as exactly three combined meshes: the worn-steel
// cross-truss lattice, the cast-iron coffers/longitudinals, and the ceramic
// coffer bands.
const SUBORDINATED_OVERHEAD_MEMBERS = Object.freeze([
  'V5OPT_FOUNDRY_ENVIRONMENT_CEILING_V3_WORN_STEEL',
  'V5OPT_FOUNDRY_ENVIRONMENT_CEILING_V3_CAST_IRON',
]);

const OVERHEAD_MEMBER_RETONE = Object.freeze([
  Object.freeze({
    name: 'V5OPT_FOUNDRY_ENVIRONMENT_CEILING_V3_USED_CERAMIC',
    color: 0x53646c,
    emissive: 0x132229,
    emissiveIntensity: 0.32,
  }),
]);

const CONTAINMENT_LIFT_MINIMUM_WORLD_Y = 8;
const CONTAINMENT_LIFT_LUMINANCE_CEILING = 0.05;

function matchesMemberName(objectName: string, memberName: string): boolean {
  return objectName === memberName
    || objectName.startsWith(`${memberName}_`);
}

function subordinateOverheadMembers(art: THREE.Group): number {
  let subordinated = 0;
  art.traverse((object) => {
    if (!SUBORDINATED_OVERHEAD_MEMBERS.some(
      (member) => matchesMemberName(object.name, member),
    )) return;
    if (!object.visible) return;
    object.visible = false;
    object.userData.overheadReadabilitySubordinated = true;
    subordinated += 1;
  });
  return subordinated;
}

function retoneOverheadMembers(art: THREE.Group): number {
  const retoned = new Map<THREE.Material, THREE.Material>();
  art.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const definition = OVERHEAD_MEMBER_RETONE.find(
      ({ name }) => matchesMemberName(object.name, name)
        || (object.parent !== null
          && matchesMemberName(object.parent.name, name)),
    );
    if (definition === undefined) return;
    const mesh = object as THREE.Mesh;
    const apply = (material: THREE.Material): THREE.Material => {
      const existing = retoned.get(material);
      if (existing !== undefined) return existing;
      const clone = material.clone();
      if (clone instanceof THREE.MeshStandardMaterial) {
        clone.color.setHex(definition.color);
        clone.emissive.setHex(definition.emissive);
        clone.emissiveIntensity = definition.emissiveIntensity;
        clone.name =
          `${material.name || definition.name}_OVERHEAD_READABILITY`;
      }
      retoned.set(material, clone);
      return clone;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(apply)
      : apply(mesh.material);
  });
  return retoned.size;
}

function liftContainmentDarknessFloor(containment: THREE.Group): number {
  containment.updateMatrixWorld(true);
  const lifted = new Map<THREE.Material, THREE.Material>();
  const bounds = new THREE.Box3();
  const hsl = { h: 0, s: 0, l: 0 };
  containment.traverse((object) => {
    if (!(object as THREE.Mesh).isMesh) return;
    const mesh = object as THREE.Mesh;
    bounds.setFromObject(mesh);
    if (bounds.isEmpty() || bounds.min.y < CONTAINMENT_LIFT_MINIMUM_WORLD_Y) {
      return;
    }
    const apply = (material: THREE.Material): THREE.Material => {
      const existing = lifted.get(material);
      if (existing !== undefined) return existing;
      if (!(material instanceof THREE.MeshStandardMaterial)) return material;
      material.color.getHSL(hsl);
      if (hsl.l >= CONTAINMENT_LIFT_LUMINANCE_CEILING) return material;
      const clone = material.clone();
      clone.color.setHex(0x27333a);
      clone.emissive.setHex(0x0a1114);
      clone.emissiveIntensity = 0.22;
      clone.name = `${material.name || 'CONTAINMENT'}_OVERHEAD_LIFT`;
      lifted.set(material, clone);
      return clone;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(apply)
      : apply(mesh.material);
  });
  return lifted.size;
}

export function applyInkfallRev5OverheadReadability(
  art: THREE.Group,
  containment: THREE.Group,
): Readonly<{
  version: typeof INKFALL_REV5_OVERHEAD_READABILITY_VERSION;
  subordinatedMemberCount: number;
  retonedArtMaterialCount: number;
  liftedContainmentMaterialCount: number;
}> {
  const subordinatedMemberCount = subordinateOverheadMembers(art);
  const retonedArtMaterialCount = retoneOverheadMembers(art);
  const liftedContainmentMaterialCount =
    liftContainmentDarknessFloor(containment);
  const summary = Object.freeze({
    version: INKFALL_REV5_OVERHEAD_READABILITY_VERSION,
    subordinatedMemberCount,
    retonedArtMaterialCount,
    liftedContainmentMaterialCount,
  });
  art.userData.overheadReadability = summary;
  return summary;
}
