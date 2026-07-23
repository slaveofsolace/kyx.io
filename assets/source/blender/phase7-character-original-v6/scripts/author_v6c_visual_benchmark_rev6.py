"""Smooth and simplify the topology-fitted V6-C rev5 design language.

Rev6 preserves rev5 byte-for-byte.  It smooths the low-profile graphite shell
boundaries, replaces the stepped white limb patches with narrow body-following
ceramic splines, removes the rectangular rear helmet plates, and deepens the
rifle finish.  No V6-B geometry is loaded or reused.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


OLD_PREFIX = "KYX_V6C_BENCH_R5_"
PREFIX = "KYX_V6C_BENCH_R6_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV6"
PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
PINNED_REV5_SHA256 = "4b4d18f844688df0698ef1f28969bc6d996cb2963a76c116de2306f9a29a1c23"

REV5_PATH = Path(__file__).with_name("author_v6c_visual_benchmark_rev5.py")
SPEC = importlib.util.spec_from_file_location("kyx_v6c_rev5_geometry_utilities", REV5_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load rev5 utilities: {REV5_PATH}")
r5 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r5)
for module in (r5, r5.r4, r5.r4.r3, r5.r4.r3.r2, r5.r4.r3.r2.r1, r5.base):
    module.PREFIX = PREFIX
    module.CHECKPOINT = CHECKPOINT
base = r5.base


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <rev5.blend> <accepted-v6a.blend> <output.blend> <report.json>")
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
        if obj.get("kyx_checkpoint") == "V6-C_VISUAL_BENCHMARK_REV5":
            obj["kyx_checkpoint"] = CHECKPOINT


def remove_objects(suffixes: list[str]) -> list[str]:
    removed: list[str] = []
    for suffix in suffixes:
        obj = bpy.data.objects.get(f"{PREFIX}{suffix}")
        if obj is not None:
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    return removed


def smooth_fitted_shell(obj: bpy.types.Object) -> None:
    if obj.type != "MESH":
        return
    modifier = obj.modifiers.new(name=f"{PREFIX}BoundarySurfaceSmoothing", type="SUBSURF")
    modifier.subdivision_type = "CATMULL_CLARK"
    modifier.levels = 2
    modifier.render_levels = 2
    modifier.show_only_control_edges = True
    obj.modifiers.move(len(obj.modifiers) - 1, 0)
    obj["rev6_correction"] = "Catmull-Clark smoothing before thickness removes raw source-polygon border steps"


def build_ceramic_splines(
    equipment: bpy.types.Collection,
    ivory: bpy.types.Material,
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    paths = {
        "Forearm": [(0.348, -0.082, 1.108), (0.366, -0.079, 1.055), (0.387, -0.070, 0.995)],
        "Thigh": [(0.170, -0.106, 0.858), (0.165, -0.101, 0.802), (0.160, -0.090, 0.738)],
        "Patella": [(0.146, -0.094, 0.602), (0.147, -0.095, 0.574), (0.149, -0.083, 0.547)],
        "Tibia": [(0.153, -0.082, 0.458), (0.160, -0.077, 0.385), (0.168, -0.065, 0.296)],
    }
    for side, label in ((1.0, "L"), (-1.0, "R")):
        for region, samples in paths.items():
            mirrored = [(x * side, y, z) for x, y, z in samples]
            objects.append(base.add_curve(
                f"{PREFIX}{region}CeramicSpline_{label}", mirrored,
                0.0030 if region in {"Thigh", "Tibia"} else 0.0026,
                equipment, ivory,
                f"narrow smooth ceramic {region.lower()} spline seated on the fitted graphite shell",
            ))
    return objects


def build_occipital_routes(
    equipment: bpy.types.Collection,
    ivory: bpy.types.Material,
    graphite: bpy.types.Material,
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    for side, label in ((1.0, "L"), (-1.0, "R")):
        objects.append(base.add_curve(
            f"{PREFIX}OccipitalTaperRoute_{label}",
            [(0.035 * side, 0.060, 1.570), (0.048 * side, 0.064, 1.620),
             (0.056 * side, 0.064, 1.675), (0.049 * side, 0.057, 1.720)],
            0.0030, equipment, ivory,
            "thin tapered occipital route replacing the rectangular rear plate",
        ))
    center = bpy.data.objects.get(f"{PREFIX}OccipitalCenterSeam")
    if center is not None and hasattr(center.data, "materials"):
        center.data.materials.clear()
        center.data.materials.append(graphite)
    return objects


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 4:
        raise SystemExit("Expected -- <rev5.blend> <accepted-v6a.blend> <output.blend> <report.json>")
    rev5_path, v6a_path, output_path, report_path = (Path(value).resolve() for value in arguments)
    rev5_hash_before = sha256(rev5_path)
    v6a_hash_before = sha256(v6a_path)
    if rev5_hash_before != PINNED_REV5_SHA256:
        raise RuntimeError(f"Pinned rev5 hash mismatch: {rev5_hash_before}")
    if v6a_hash_before != PINNED_V6A_SHA256:
        raise RuntimeError(f"Pinned V6-A hash mismatch: {v6a_hash_before}")

    bpy.ops.wm.open_mainfile(filepath=str(rev5_path), load_ui=False, use_scripts=False)
    rename_namespace()
    body = bpy.data.objects.get(f"{PREFIX}ContinuousAnatomicalUndersuit")
    armor = bpy.data.collections.get(f"{PREFIX}AuthoredArmorSurfaces")
    equipment = bpy.data.collections.get(f"{PREFIX}IntegratedEquipment")
    rifle_collection = bpy.data.collections.get(f"{PREFIX}OriginalAutoRifle")
    if body is None or armor is None or equipment is None or rifle_collection is None:
        raise RuntimeError("Missing required renamed rev5 construction data")
    ivory = bpy.data.materials.get(f"{PREFIX}WarmIvoryCeramic")
    graphite = bpy.data.materials.get(f"{PREFIX}GraphiteStructure")
    gunmetal = bpy.data.materials.get(f"{PREFIX}AutoRifleWarmGunmetal")
    if ivory is None or graphite is None or gunmetal is None:
        raise RuntimeError("Missing required rev6 material")

    removable = ["OccipitalBlade_L", "OccipitalBlade_R"]
    for label in ("L", "R"):
        for region in ("Forearm", "Thigh", "Patella", "Tibia"):
            removable.append(f"{region}CeramicRoute_{label}")
    removed = remove_objects(removable)

    smoothed: list[str] = []
    for obj in armor.all_objects:
        if obj.get("construction") == "selected accepted V6-A topology offset along accepted vertex normals":
            smooth_fitted_shell(obj)
            smoothed.append(obj.name)

    replacements = build_ceramic_splines(equipment, ivory)
    replacements.extend(build_occipital_routes(equipment, ivory, graphite))
    # A dark, rougher receiver reads as equipment rather than white display plastic.
    r5.set_principled(gunmetal, (0.010, 0.023, 0.030, 1.0), roughness=0.56, metallic=0.24)

    bpy.context.view_layer.update()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)
    rev5_hash_after = sha256(rev5_path)
    v6a_hash_after = sha256(v6a_path)
    if rev5_hash_after != rev5_hash_before or v6a_hash_after != v6a_hash_before:
        raise RuntimeError("Pinned rev5 or accepted V6-A changed during rev6 authoring")
    output_hash = sha256(output_path)

    report = {
        "schemaVersion": 1,
        "authoredUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "inputs": {
            "rev5": {"path": rev5_path.name, "sha256Before": rev5_hash_before,
                     "sha256After": rev5_hash_after, "unchanged": rev5_hash_before == rev5_hash_after},
            "acceptedV6A": {"path": v6a_path.name, "sha256Before": v6a_hash_before,
                            "sha256After": v6a_hash_after, "unchanged": v6a_hash_before == v6a_hash_after},
        },
        "output": {"path": output_path.name, "bytes": output_path.stat().st_size, "sha256": output_hash},
        "removedRev5Objects": removed,
        "smoothedFittedSurfaces": smoothed,
        "corrections": [
            "Smoothed every V6-A-derived fitted panel before solidify/bevel to remove pixel-stepped borders.",
            "Replaced eight broad white limb patches with narrow surface-projected ceramic splines.",
            "Removed both rectangular occipital plates and replaced them with two tapered rear routes.",
            "Darkened and roughened the gunmetal rifle finish to reduce toy-plastic read.",
        ],
        "assertions": {
            "rev5Preserved": rev5_hash_before == rev5_hash_after,
            "acceptedV6APreserved": v6a_hash_before == v6a_hash_after,
            "fittedSurfacesSmoothed": len(smoothed) >= 12,
            "noV6BObjects": not any(obj.name.startswith("KYX_V6B_") for obj in bpy.data.objects),
            "noArmatures": len(bpy.data.armatures) == 0,
            "noActions": len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
        },
        "status": "V6C_VISUAL_BENCHMARK_REV6_REQUIRES_DIRECT_VISUAL_AUDIT",
        "nonClaims": [
            "Revision 6 is a V6-C visual benchmark candidate, not V6-C or G6 acceptance.",
            "No final retopology, authored UVs, texture bake, rig, animation, LOD, GLB, runtime integration, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "outputSha256": output_hash,
                      "removed": len(removed), "smoothed": len(smoothed)}, sort_keys=True))


if __name__ == "__main__":
    main()
