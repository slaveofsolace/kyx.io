"""Build V6-C rev5 using low-profile surfaces derived from accepted anatomy.

Rev5 preserves rev4 byte-for-byte and replaces the last capsule-like shoulder
and limb guards with thin, topology-conforming panels copied from the accepted
V6-A body surface.  It also rebuilds the chest protection the same way, adds a
restrained occipital structure, and moves the rifle away from a white toy read.
No V6-B geometry is loaded or reused.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys
from typing import Callable

import bpy
from mathutils import Vector


OLD_PREFIX = "KYX_V6C_BENCH_R4_"
PREFIX = "KYX_V6C_BENCH_R5_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV5"
PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
PINNED_REV4_SHA256 = "46ea58445aa92f2f59ecb5993d008ac4a14164300c5b276993cab28d94c8be2c"

REV4_PATH = Path(__file__).with_name("author_v6c_visual_benchmark_rev4.py")
SPEC = importlib.util.spec_from_file_location("kyx_v6c_rev4_geometry_utilities", REV4_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load rev4 utilities: {REV4_PATH}")
r4 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r4)
for module in (r4, r4.r3, r4.r3.r2, r4.r3.r2.r1, r4.base):
    module.PREFIX = PREFIX
    module.CHECKPOINT = CHECKPOINT
base = r4.base


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <rev4.blend> <accepted-v6a.blend> <output.blend> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rename_namespace() -> None:
    for data_group in (
        bpy.data.objects, bpy.data.meshes, bpy.data.curves,
        bpy.data.materials, bpy.data.collections,
    ):
        for datablock in list(data_group):
            if datablock.name.startswith(OLD_PREFIX):
                datablock.name = PREFIX + datablock.name[len(OLD_PREFIX):]
    for obj in bpy.data.objects:
        if obj.get("kyx_checkpoint") == "V6-C_VISUAL_BENCHMARK_REV4":
            obj["kyx_checkpoint"] = CHECKPOINT


def remove_objects(suffixes: list[str]) -> list[str]:
    removed: list[str] = []
    for suffix in suffixes:
        obj = bpy.data.objects.get(f"{PREFIX}{suffix}")
        if obj is not None:
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    return removed


def set_principled(
    material: bpy.types.Material,
    color: tuple[float, float, float, float],
    *, roughness: float, metallic: float = 0.0,
) -> None:
    if material.node_tree is None:
        return
    for node in material.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            node.inputs["Base Color"].default_value = color
            node.inputs["Roughness"].default_value = roughness
            node.inputs["Metallic"].default_value = metallic


def make_deep_fabric(name: str) -> bpy.types.Material:
    material = base.make_principled_material(
        name, (0.0035, 0.0075, 0.0105, 1.0), roughness=0.83,
    )
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = next(node for node in nodes if node.type == "BSDF_PRINCIPLED")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 72.0
    noise.inputs["Detail"].default_value = 3.2
    noise.inputs["Roughness"].default_value = 0.72
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.18
    bump.inputs["Distance"].default_value = 0.0022
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    return material


def fitted_surface_from_body(
    name: str,
    body: bpy.types.Object,
    predicate: Callable[[Vector], bool],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *, offset: float, thickness: float,
) -> bpy.types.Object:
    source = body.data
    selected = [polygon for polygon in source.polygons if predicate(polygon.center)]
    if len(selected) < 8:
        raise RuntimeError(f"Too few source polygons for {name}: {len(selected)}")
    used = sorted({vertex for polygon in selected for vertex in polygon.vertices})
    remap = {old: new for new, old in enumerate(used)}
    vertices = [tuple(source.vertices[index].co + source.vertices[index].normal * offset) for index in used]
    faces = [tuple(remap[index] for index in polygon.vertices) for polygon in selected]
    obj = base.new_mesh_object(name, vertices, faces, collection, material, role)
    obj.matrix_world = body.matrix_world.copy()
    base.add_modifiers(obj, solidify=thickness, bevel=0.0009, bevel_segments=3)
    obj["construction"] = "selected accepted V6-A topology offset along accepted vertex normals"
    obj["sourcePolygonCount"] = len(selected)
    return obj


def axial_mask(
    side: float,
    z_min: float,
    z_max: float,
    outer_min: float,
    *, y_end: float = -0.024,
    y_mid: float = 0.034,
    taper_x: float = 0.020,
) -> Callable[[Vector], bool]:
    def predicate(point: Vector) -> bool:
        if point.z <= z_min or point.z >= z_max or side * point.x <= 0.0:
            return False
        t = (point.z - z_min) / (z_max - z_min)
        envelope = math.sin(math.pi * t) ** 0.58
        return (
            side * point.x > outer_min + taper_x * (1.0 - envelope)
            and point.y < y_end + (y_mid - y_end) * envelope
        )
    return predicate


def chest_mask(side: float, inset: bool) -> Callable[[Vector], bool]:
    z_min, z_max = ((1.355, 1.438) if inset else (1.315, 1.452))

    def predicate(point: Vector) -> bool:
        if point.z <= z_min or point.z >= z_max or side * point.x <= 0.0:
            return False
        t = (point.z - z_min) / (z_max - z_min)
        envelope = math.sin(math.pi * t) ** 0.62
        center = 0.102 + 0.022 * t
        half_width = (0.049 if inset else 0.073) * envelope + (0.010 if inset else 0.016)
        outward = side * point.x
        y_limit = -0.030 if inset else 0.012
        return center - half_width < outward < center + half_width and point.y < y_limit
    return predicate


def build_fitted_armor(
    body: bpy.types.Object,
    armor: bpy.types.Collection,
    graphite: bpy.types.Material,
    ivory: bpy.types.Material,
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    regions = [
        ("Deltoid", 1.315, 1.462, 0.195, 0.230, 1.345, 1.438, 0.215),
        ("Forearm", 0.958, 1.142, 0.300, 0.175, 0.985, 1.115, 0.320),
        ("Thigh", 0.692, 0.908, 0.086, 0.205, 0.725, 0.872, 0.105),
        ("Patella", 0.518, 0.642, 0.083, 0.110, 0.542, 0.615, 0.095),
        ("Tibia", 0.248, 0.505, 0.094, 0.230, 0.286, 0.466, 0.105),
    ]
    for side, label in ((1.0, "L"), (-1.0, "R")):
        objects.append(fitted_surface_from_body(
            f"{PREFIX}ClavicleGraphiteUnderlay_{label}", body, chest_mask(side, False),
            armor, graphite,
            "thin fitted clavicle protection derived directly from accepted torso topology",
            offset=0.0040, thickness=0.0030,
        ))
        objects.append(fitted_surface_from_body(
            f"{PREFIX}ClavicleCeramicInlay_{label}", body, chest_mask(side, True),
            armor, ivory,
            "small ceramic clavicle inlay nested in the fitted graphite surface",
            offset=0.0080, thickness=0.0024,
        ))
        for region, z0, z1, outer, _length, iz0, iz1, iouter in regions:
            objects.append(fitted_surface_from_body(
                f"{PREFIX}{region}FittedWrap_{label}", body,
                axial_mask(side, z0, z1, outer), armor, graphite,
                f"low-profile {region.lower()} guard copied from the accepted anatomical surface",
                offset=0.0035, thickness=0.0030,
            ))
            objects.append(fitted_surface_from_body(
                f"{PREFIX}{region}CeramicRoute_{label}", body,
                axial_mask(side, iz0, iz1, iouter, y_end=-0.030, y_mid=0.015, taper_x=0.014),
                armor, ivory,
                f"narrow fitted ceramic route seated inside the {region.lower()} graphite wrap",
                offset=0.0070, thickness=0.0022,
            ))
    return objects


def rear_helmet_layers(
    liner: bpy.types.Object,
    armor: bpy.types.Collection,
    equipment: bpy.types.Collection,
    ivory: bpy.types.Material,
    graphite: bpy.types.Material,
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    def occipital_mask(side: float) -> Callable[[Vector], bool]:
        def predicate(point: Vector) -> bool:
            if point.z <= 1.545 or point.z >= 1.745 or point.y <= 0.012 or side * point.x <= 0.0:
                return False
            t = (point.z - 1.545) / 0.200
            envelope = math.sin(math.pi * t) ** 0.64
            outward = side * point.x
            center = 0.054 + 0.010 * t
            half_width = 0.013 + 0.035 * envelope
            return center - half_width < outward < center + half_width
        return predicate

    for side, label in ((1.0, "L"), (-1.0, "R")):
        objects.append(fitted_surface_from_body(
            f"{PREFIX}OccipitalBlade_{label}", liner, occipital_mask(side),
            armor, ivory,
            "small tapered occipital blade copied from the planar liner surface",
            offset=0.0045, thickness=0.0025,
        ))
    points = [(0.0, y, z) for y, z in (
        (0.055, 1.550), (0.062, 1.600), (0.064, 1.660),
        (0.060, 1.710), (0.048, 1.748),
    )]
    objects.append(base.add_curve(
        f"{PREFIX}OccipitalCenterSeam", points, 0.0018, equipment, graphite,
        "flush rear center seam separating the two tapered occipital blades",
    ))
    return objects


def rematerial_rifle(
    rifle_collection: bpy.types.Collection,
    ivory: bpy.types.Material,
    graphite: bpy.types.Material,
) -> tuple[bpy.types.Material, list[str]]:
    gunmetal = base.make_principled_material(
        f"{PREFIX}AutoRifleWarmGunmetal", (0.028, 0.047, 0.057, 1.0),
        metallic=0.62, roughness=0.34,
    )
    changed: list[str] = []
    for obj in rifle_collection.all_objects:
        if not hasattr(obj.data, "materials"):
            continue
        for index, material in enumerate(obj.data.materials):
            if material == ivory:
                obj.data.materials[index] = gunmetal
                changed.append(obj.name)
    # The top spine remains a light functional index without turning the body
    # back into a broad white slab.
    top_spine = bpy.data.objects.get(f"{PREFIX}AutoRifleTopSpine")
    if top_spine is not None and hasattr(top_spine.data, "materials"):
        top_spine.data.materials.clear()
        top_spine.data.materials.append(ivory)
    return gunmetal, changed


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 4:
        raise SystemExit("Expected -- <rev4.blend> <accepted-v6a.blend> <output.blend> <report.json>")
    rev4_path, v6a_path, output_path, report_path = (Path(value).resolve() for value in arguments)
    rev4_hash_before = sha256(rev4_path)
    v6a_hash_before = sha256(v6a_path)
    if rev4_hash_before != PINNED_REV4_SHA256:
        raise RuntimeError(f"Pinned rev4 hash mismatch: {rev4_hash_before}")
    if v6a_hash_before != PINNED_V6A_SHA256:
        raise RuntimeError(f"Pinned V6-A hash mismatch: {v6a_hash_before}")

    bpy.ops.wm.open_mainfile(filepath=str(rev4_path), load_ui=False, use_scripts=False)
    rename_namespace()
    body = bpy.data.objects.get(f"{PREFIX}ContinuousAnatomicalUndersuit")
    armor = bpy.data.collections.get(f"{PREFIX}AuthoredArmorSurfaces")
    equipment = bpy.data.collections.get(f"{PREFIX}IntegratedEquipment")
    rifle_collection = bpy.data.collections.get(f"{PREFIX}OriginalAutoRifle")
    suit_collection = bpy.data.collections.get(f"{PREFIX}ContinuousUndersuit")
    if body is None or armor is None or equipment is None or rifle_collection is None or suit_collection is None:
        raise RuntimeError("Missing required renamed rev4 construction data")
    ivory = bpy.data.materials.get(f"{PREFIX}WarmIvoryCeramic")
    graphite = bpy.data.materials.get(f"{PREFIX}GraphiteStructure")
    red = bpy.data.materials.get(f"{PREFIX}SignalCoral")
    if ivory is None or graphite is None or red is None:
        raise RuntimeError("Missing required rev5 materials")

    set_principled(ivory, (0.32, 0.255, 0.165, 1.0), roughness=0.48, metallic=0.03)
    set_principled(graphite, (0.006, 0.016, 0.023, 1.0), roughness=0.48, metallic=0.31)
    deep_fabric = make_deep_fabric(f"{PREFIX}DeepWovenUndersuit")
    body.data.materials[0] = deep_fabric
    cowl = bpy.data.objects.get(f"{PREFIX}HelmetCowlTransition")
    if cowl is not None and hasattr(cowl.data, "materials"):
        cowl.data.materials.clear()
        cowl.data.materials.append(deep_fabric)

    removable = [
        "ClavicleBlade_L", "ClavicleBlade_R", "ShortSternumPlacket",
        "DeltoidUnderlay_L", "DeltoidUnderlay_R", "DeltoidCeramicLeaf_L",
        "DeltoidCeramicLeaf_R", "LeftShoulderIdentitySeam",
    ]
    for label in ("L", "R"):
        for region in ("Forearm", "Thigh", "Patella", "Tibia"):
            removable.extend([f"{region}GraphiteWrap_{label}", f"{region}CeramicInset_{label}"])
        removable.extend([f"ForearmInsetRoute_{label}", f"LegContinuousRoute_{label}"])
    removed = remove_objects(removable)

    replacements = build_fitted_armor(body, armor, graphite, ivory)
    liner = bpy.data.objects.get(f"{PREFIX}HelmetPlanarLiner")
    if liner is None:
        raise RuntimeError("Missing rev4 planar helmet liner")
    replacements.extend(rear_helmet_layers(liner, armor, equipment, ivory, graphite))
    # Small, local identity marks replace rev4's long lines across flex gaps.
    replacements.append(base.add_curve(
        f"{PREFIX}LeftForearmLocalRoute",
        [(0.347, -0.083, 1.094), (0.365, -0.081, 1.055), (0.381, -0.074, 1.015)],
        0.0018, equipment, red,
        "short seated identity route contained within the left forearm fitted panel",
    ))
    replacements.append(base.add_curve(
        f"{PREFIX}LeftTibiaLocalRoute",
        [(0.154, -0.073, 0.438), (0.160, -0.070, 0.376), (0.166, -0.060, 0.316)],
        0.0018, equipment, red,
        "short seated identity route contained within the left tibia fitted panel",
    ))
    _gunmetal, rifle_rematerialized = rematerial_rifle(rifle_collection, ivory, graphite)

    bpy.context.view_layer.update()
    surface_counts = {obj.name: int(obj.get("sourcePolygonCount", 0)) for obj in replacements
                      if obj.get("sourcePolygonCount") is not None}
    if not surface_counts or min(surface_counts.values()) < 8:
        raise RuntimeError(f"Invalid fitted surface counts: {surface_counts}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)
    rev4_hash_after = sha256(rev4_path)
    v6a_hash_after = sha256(v6a_path)
    if rev4_hash_after != rev4_hash_before or v6a_hash_after != v6a_hash_before:
        raise RuntimeError("Pinned rev4 or accepted V6-A changed during rev5 authoring")
    output_hash = sha256(output_path)

    report = {
        "schemaVersion": 1,
        "authoredUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "inputs": {
            "rev4": {"path": rev4_path.name, "sha256Before": rev4_hash_before,
                     "sha256After": rev4_hash_after, "unchanged": rev4_hash_before == rev4_hash_after},
            "acceptedV6A": {"path": v6a_path.name, "sha256Before": v6a_hash_before,
                            "sha256After": v6a_hash_after, "unchanged": v6a_hash_before == v6a_hash_after},
        },
        "output": {"path": output_path.name, "bytes": output_path.stat().st_size, "sha256": output_hash},
        "removedRev4Objects": removed,
        "fittedSurfaceSourcePolygonCounts": surface_counts,
        "rifleRematerializedObjects": rifle_rematerialized,
        "corrections": [
            "Removed every rev4 capsule-like shoulder and limb sweep.",
            "Built chest, shoulder, forearm, thigh, patella, and tibia protection from accepted V6-A surface topology.",
            "Kept every new protection surface low-profile with nested narrow ceramic routes rather than isolated pads.",
            "Added small tapered rear helmet blades and a center seam to break the featureless orb read.",
            "Replaced the bright rifle slab material with warm gunmetal while retaining a restrained light top index.",
            "Replaced long flex-gap routes with two short local asymmetric identity marks.",
        ],
        "assertions": {
            "rev4Preserved": rev4_hash_before == rev4_hash_after,
            "acceptedV6APreserved": v6a_hash_before == v6a_hash_after,
            "allFittedSurfacesHaveSourceTopology": min(surface_counts.values()) >= 8,
            "noV6BObjects": not any(obj.name.startswith("KYX_V6B_") for obj in bpy.data.objects),
            "noArmatures": len(bpy.data.armatures) == 0,
            "noActions": len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
        },
        "status": "V6C_VISUAL_BENCHMARK_REV5_REQUIRES_DIRECT_VISUAL_AUDIT",
        "nonClaims": [
            "Revision 5 is a V6-C visual benchmark candidate, not V6-C or G6 acceptance.",
            "Contact witnesses establish future intent only; no literal posed contact is claimed.",
            "No final retopology, authored UVs, texture bake, rig, animation, LOD, GLB, runtime integration, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"], "outputSha256": output_hash,
        "removed": len(removed), "fittedSurfaces": len(surface_counts),
    }, sort_keys=True))


if __name__ == "__main__":
    main()
