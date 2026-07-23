"""Repair V6-B production-sculpt construction in isolated revision 13.

Revision 13 starts from the preserved rev12 Blend, removes every failed
body-projected limb object, and replaces them with bounded authored curved
shields.  It also adds front shoulder flanges, fitted heel cups, and pulls the
waist treatment into the body.  No prior artifact is modified.
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


OLD_PREFIX = "KYX_V6B_PROD_R12_"
PREFIX = "KYX_V6B_PROD_R13_"
CHECKPOINT = "V6-B_PRODUCTION_SCULPT_REV13"
PINNED_REV12_SHA256 = "f28afd3f6f095b82d607015a88fef1caabb4ef514376c08b384879e529ebb440"
PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"

BASE_PATH = Path(__file__).with_name("author_v6b_production_sculpt_rev11.py")
SPEC = importlib.util.spec_from_file_location("kyx_v6b_rev11_geometry_library", BASE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load construction library: {BASE_PATH}")
base = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base)
base.PREFIX = PREFIX
base.CHECKPOINT = CHECKPOINT


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <rev12.blend> <accepted-v6a.blend> <rev13.blend> <report.json>")
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
        if obj.get("kyx_checkpoint") == "V6-B_PRODUCTION_SCULPT_REV12":
            obj["kyx_checkpoint"] = CHECKPOINT


def remove_failed_projection_objects() -> list[str]:
    removed: list[str] = []
    for label in ("L", "R"):
        for suffix in ("ForearmShield", "LateralThighShield", "KneeShell", "ShinShield"):
            name = f"{PREFIX}{suffix}_{label}"
            obj = bpy.data.objects.get(name)
            if obj is not None:
                removed.append(name)
                bpy.data.objects.remove(obj, do_unlink=True)
    return removed


def add_curved_guard(
    name: str,
    side: float,
    rows: list[tuple[float, float, float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    thickness: float,
) -> bpy.types.Object:
    """Create a bounded convex front shield with no body-surface jumping.

    Each row is (z, abs_center_x, half_width, edge_y, center_bow).  The regular
    quad topology is authored entirely within the intended limb envelope.
    """
    columns = 15
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, center_x, half_width, edge_y, center_bow in rows:
        for column in range(columns):
            u = -1.0 + 2.0 * column / (columns - 1)
            x = side * (center_x + half_width * u)
            y = edge_y - center_bow * (1.0 - u * u)
            camber_z = 0.004 * (1.0 - u * u)
            vertices.append((x, y, z + camber_z))
    for row in range(len(rows) - 1):
        current = row * columns
        following = (row + 1) * columns
        for column in range(columns - 1):
            faces.append((current + column, following + column,
                          following + column + 1, current + column + 1))
    obj = base.new_mesh_object(name, vertices, faces, collection, material, role)
    base.add_modifiers(obj, subdivision=1, solidify=thickness, bevel=0.0022, bevel_segments=4)
    obj["bounded_authored_rows"] = len(rows)
    obj["body_projection_used"] = False
    return obj


def add_replacements() -> list[bpy.types.Object]:
    armor = bpy.data.collections.get(f"{PREFIX}IntegratedArmor")
    detail = bpy.data.collections.get(f"{PREFIX}ManufacturedDetails")
    garment = bpy.data.collections.get(f"{PREFIX}ContinuousGarment")
    if armor is None or detail is None or garment is None:
        raise RuntimeError("Missing rev13 construction collections")
    ivory = bpy.data.materials.get(f"{PREFIX}IvoryCeramic")
    red = bpy.data.materials.get(f"{PREFIX}SignalRed")
    boot = bpy.data.materials.get(f"{PREFIX}BootComposite")
    if ivory is None or red is None or boot is None:
        raise RuntimeError("Missing rev13 construction materials")

    objects: list[bpy.types.Object] = []
    for side, label in ((1.0, "L"), (-1.0, "R")):
        objects.append(add_curved_guard(
            f"{PREFIX}ShoulderFrontFlange_{label}", side,
            [(1.438, 0.269, 0.040, -0.055, 0.014),
             (1.405, 0.289, 0.050, -0.063, 0.019),
             (1.365, 0.311, 0.046, -0.055, 0.017),
             (1.340, 0.326, 0.035, -0.044, 0.012)],
            armor, ivory, "front deltoid flange integrated beneath curved shoulder saddle",
            thickness=0.007,
        ))
        objects.append(add_curved_guard(
            f"{PREFIX}ForearmGuard_{label}", side,
            [(1.120, 0.336, 0.019, -0.052, 0.015),
             (1.075, 0.352, 0.023, -0.058, 0.019),
             (1.020, 0.373, 0.025, -0.061, 0.021),
             (0.970, 0.392, 0.020, -0.054, 0.016)],
            armor, ivory, "bounded tapered convex forearm guard with elbow and wrist gaps",
            thickness=0.006,
        ))
        objects.append(add_curved_guard(
            f"{PREFIX}ThighGuard_{label}", side,
            [(0.875, 0.169, 0.031, -0.079, 0.018),
             (0.830, 0.166, 0.037, -0.086, 0.022),
             (0.775, 0.162, 0.038, -0.088, 0.023),
             (0.725, 0.159, 0.031, -0.080, 0.018)],
            armor, ivory, "bounded slim lateral-front thigh guard following human volume",
            thickness=0.006,
        ))
        objects.append(add_curved_guard(
            f"{PREFIX}KneeGuard_{label}", side,
            [(0.620, 0.145, 0.030, -0.066, 0.018),
             (0.590, 0.145, 0.041, -0.078, 0.026),
             (0.555, 0.147, 0.039, -0.075, 0.024),
             (0.525, 0.150, 0.028, -0.063, 0.016)],
            armor, ivory, "bounded patella shell with curved crown and open flex zone",
            thickness=0.007,
        ))
        objects.append(add_curved_guard(
            f"{PREFIX}ShinGuard_{label}", side,
            [(0.468, 0.152, 0.029, -0.047, 0.017),
             (0.410, 0.157, 0.036, -0.056, 0.023),
             (0.340, 0.163, 0.034, -0.054, 0.021),
             (0.270, 0.169, 0.025, -0.043, 0.015)],
            armor, ivory, "bounded tapered tibia guard with ankle clearance",
            thickness=0.007,
        ))

        angle = 0.16 * side
        heel = base.add_beveled_box(
            f"{PREFIX}BootHeelCup_{label}", (0.172 * side, 0.092, 0.075),
            (0.102, 0.034, 0.094), garment, boot,
            "connected vertical heel cup masking shoe-last end cap",
            bevel=0.012, rotation=(0.0, 0.0, angle),
        )
        objects.append(heel)

    # Pull the inherited waist loop into the body until no daylight is visible.
    harness = bpy.data.objects.get(f"{PREFIX}FittedWaistHarness")
    if harness is not None:
        harness.scale.x = 0.90
        harness.scale.y = 0.86
        harness.scale.z = 0.72
        harness["rev13_fit_correction"] = "scaled into continuous garment to remove floating hoop read"
    return objects


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 4:
        raise SystemExit("Expected -- <rev12.blend> <accepted-v6a.blend> <rev13.blend> <report.json>")
    rev12_path, v6a_path, output_path, report_path = (Path(value).resolve() for value in arguments)
    rev12_hash_before = sha256(rev12_path)
    v6a_hash_before = sha256(v6a_path)
    if rev12_hash_before != PINNED_REV12_SHA256:
        raise RuntimeError(f"Pinned rev12 hash mismatch: {rev12_hash_before}")
    if v6a_hash_before != PINNED_V6A_SHA256:
        raise RuntimeError(f"Pinned V6-A hash mismatch: {v6a_hash_before}")

    bpy.ops.wm.open_mainfile(filepath=str(rev12_path), load_ui=False, use_scripts=False)
    rename_revision_namespace()
    removed = remove_failed_projection_objects()
    replacements = add_replacements()
    bpy.context.view_layer.update()

    # Bound every replacement before save; no guard may span unrelated limbs.
    replacement_bounds: dict[str, list[float]] = {}
    for obj in replacements:
        points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        spans = [max(point[axis] for point in points) - min(point[axis] for point in points) for axis in range(3)]
        replacement_bounds[obj.name] = [round(value, 6) for value in spans]
        if any(value > 0.45 for value in spans):
            raise RuntimeError(f"Unbounded replacement geometry: {obj.name} -> {spans}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)
    rev12_hash_after = sha256(rev12_path)
    v6a_hash_after = sha256(v6a_path)
    if rev12_hash_after != rev12_hash_before or v6a_hash_after != v6a_hash_before:
        raise RuntimeError("Pinned rev12 or V6-A input changed during rev13 authoring")
    output_hash = sha256(output_path)

    report = {
        "schemaVersion": 1,
        "authoredUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "inputs": {
            "rev12": {"path": rev12_path.name, "sha256Before": rev12_hash_before,
                      "sha256After": rev12_hash_after, "unchanged": rev12_hash_before == rev12_hash_after},
            "acceptedV6A": {"path": v6a_path.name, "sha256Before": v6a_hash_before,
                            "sha256After": v6a_hash_after, "unchanged": v6a_hash_before == v6a_hash_after},
        },
        "output": {"path": output_path.name, "bytes": output_path.stat().st_size, "sha256": output_hash},
        "removedFailedProjectionObjects": removed,
        "replacementBounds": replacement_bounds,
        "corrections": [
            "Removed all eight failed projected forearm, thigh, knee, and shin objects.",
            "Added bounded regular-quad curved guards with no body projection.",
            "Added front shoulder flanges beneath the retained saddle surfaces.",
            "Added vertical heel cups to close the rear boot silhouette.",
            "Pulled the waist harness into the continuous garment.",
        ],
        "assertions": {
            "rev12Preserved": rev12_hash_before == rev12_hash_after,
            "acceptedV6APreserved": v6a_hash_before == v6a_hash_after,
            "allFailedProjectionObjectsRemoved": len(removed) == 8,
            "allReplacementBoundsLimited": all(all(value <= 0.45 for value in spans)
                                                   for spans in replacement_bounds.values()),
            "noArmatures": len(bpy.data.armatures) == 0,
            "noActions": len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
        },
        "status": "V6B_PRODUCTION_SCULPT_REV13_REQUIRES_DIRECT_VISUAL_AUDIT",
        "nonClaims": [
            "Revision 13 is a V6-B visual construction candidate only; it is not G6.",
            "Rifle contact remains open until a defensible rigged pose exists.",
            "No final retopology, UV, texture bake, rig, animation, LOD, GLB, runtime, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "outputSha256": output_hash,
                      "removed": len(removed), "replacements": len(replacements)}, sort_keys=True))


if __name__ == "__main__":
    main()
