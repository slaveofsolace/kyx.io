"""Apply the isolated rev14 fit/detail correction to the pinned rev13 candidate."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


OLD_PREFIX = "KYX_V6B_PROD_R13_"
PREFIX = "KYX_V6B_PROD_R14_"
CHECKPOINT = "V6-B_PRODUCTION_SCULPT_REV14"
PINNED_REV13_SHA256 = "4c6d1b386c90895a15b3d0713c916ba7270dbe81b74d265975db0109e152d1bb"
PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"

BASE_PATH = Path(__file__).with_name("author_v6b_production_sculpt_rev11.py")
SPEC = importlib.util.spec_from_file_location("kyx_v6b_rev11_geometry_library_r14", BASE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load construction library: {BASE_PATH}")
base = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base)
base.PREFIX = PREFIX
base.CHECKPOINT = CHECKPOINT


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <rev13.blend> <accepted-v6a.blend> <rev14.blend> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rename_revision_namespace() -> None:
    for data_group in (
        bpy.data.objects, bpy.data.meshes, bpy.data.curves, bpy.data.materials,
        bpy.data.collections,
    ):
        for datablock in list(data_group):
            if datablock.name.startswith(OLD_PREFIX):
                datablock.name = PREFIX + datablock.name[len(OLD_PREFIX):]
    for obj in bpy.data.objects:
        if obj.get("kyx_checkpoint") == "V6-B_PRODUCTION_SCULPT_REV13":
            obj["kyx_checkpoint"] = CHECKPOINT


def bounds_record(obj: bpy.types.Object) -> dict[str, list[float]]:
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    center = [(minimum[axis] + maximum[axis]) * 0.5 for axis in range(3)]
    span = [maximum[axis] - minimum[axis] for axis in range(3)]
    return {"center": [round(value, 6) for value in center],
            "span": [round(value, 6) for value in span]}


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 4:
        raise SystemExit("Expected -- <rev13.blend> <accepted-v6a.blend> <rev14.blend> <report.json>")
    rev13_path, v6a_path, output_path, report_path = (Path(value).resolve() for value in arguments)
    rev13_hash_before = sha256(rev13_path)
    v6a_hash_before = sha256(v6a_path)
    if rev13_hash_before != PINNED_REV13_SHA256:
        raise RuntimeError(f"Pinned rev13 hash mismatch: {rev13_hash_before}")
    if v6a_hash_before != PINNED_V6A_SHA256:
        raise RuntimeError(f"Pinned V6-A hash mismatch: {v6a_hash_before}")

    bpy.ops.wm.open_mainfile(filepath=str(rev13_path), load_ui=False, use_scripts=False)
    rename_revision_namespace()
    detail = bpy.data.collections.get(f"{PREFIX}ManufacturedDetails")
    graphite = bpy.data.materials.get(f"{PREFIX}GraphiteMetal")
    if detail is None or graphite is None:
        raise RuntimeError("Missing rev14 detail collection or graphite material")

    harness = bpy.data.objects.get(f"{PREFIX}FittedWaistHarness")
    if harness is None:
        raise RuntimeError("Missing inherited fitted waist harness")
    harness_before = bounds_record(harness)
    harness.scale.z = 1.0
    harness["rev14_fit_correction"] = "world-Z restored after rev13 XY-only body-fit intent"
    bpy.context.view_layer.update()
    harness_after = bounds_record(harness)
    if not 1.00 <= harness_after["center"][2] <= 1.07:
        raise RuntimeError(f"Harness did not return to waist: {harness_after}")

    heel_records: dict[str, dict[str, dict[str, list[float]]]] = {}
    for label in ("L", "R"):
        heel = bpy.data.objects.get(f"{PREFIX}BootHeelCup_{label}")
        if heel is None:
            raise RuntimeError(f"Missing heel cup {label}")
        before = bounds_record(heel)
        heel.scale.x *= 0.78
        heel.scale.y *= 0.80
        heel.scale.z *= 0.72
        heel.location.z -= 0.004
        heel["rev14_fit_correction"] = "reduced rear block silhouette while preserving closed heel"
        bpy.context.view_layer.update()
        after = bounds_record(heel)
        heel_records[label] = {"before": before, "after": after}

    crown_seam = base.add_curve(
        f"{PREFIX}HelmetCrownKeel",
        [(0.0, -0.102, 1.700), (0.0, -0.060, 1.744),
         (0.0, 0.006, 1.773), (0.0, 0.076, 1.724)],
        0.0024, detail, graphite,
        "restrained manufactured crown keel breaking generic dome read",
    )
    bpy.context.view_layer.update()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)
    rev13_hash_after = sha256(rev13_path)
    v6a_hash_after = sha256(v6a_path)
    if rev13_hash_after != rev13_hash_before or v6a_hash_after != v6a_hash_before:
        raise RuntimeError("Pinned rev13 or V6-A input changed during rev14 authoring")
    output_hash = sha256(output_path)
    report = {
        "schemaVersion": 1,
        "authoredUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "inputs": {
            "rev13": {"path": rev13_path.name, "sha256Before": rev13_hash_before,
                      "sha256After": rev13_hash_after, "unchanged": rev13_hash_before == rev13_hash_after},
            "acceptedV6A": {"path": v6a_path.name, "sha256Before": v6a_hash_before,
                            "sha256After": v6a_hash_after, "unchanged": v6a_hash_before == v6a_hash_after},
        },
        "output": {"path": output_path.name, "bytes": output_path.stat().st_size, "sha256": output_hash},
        "harnessBounds": {"before": harness_before, "after": harness_after},
        "heelCupBounds": heel_records,
        "addedDetails": [crown_seam.name],
        "assertions": {
            "rev13Preserved": rev13_hash_before == rev13_hash_after,
            "acceptedV6APreserved": v6a_hash_before == v6a_hash_after,
            "harnessAtWaist": 1.00 <= harness_after["center"][2] <= 1.07,
            "heelCupsReduced": all(record["after"]["span"][0] < record["before"]["span"][0]
                                   for record in heel_records.values()),
            "noArmatures": len(bpy.data.armatures) == 0,
            "noActions": len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
        },
        "status": "V6B_PRODUCTION_SCULPT_REV14_REQUIRES_DIRECT_VISUAL_AUDIT",
        "nonClaims": [
            "Revision 14 is a V6-B visual construction candidate only; it is not G6.",
            "Rifle contact remains open until a defensible rigged pose exists.",
            "No final retopology, UV, texture bake, rig, animation, LOD, GLB, runtime, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "outputSha256": output_hash,
                      "harnessCenterZ": harness_after["center"][2]}, sort_keys=True))


if __name__ == "__main__":
    main()
