"""Refine the independent V6-C benchmark after rev2 visual rejection.

Revision 3 stays entirely inside the new V6-C lane.  It preserves rev2, removes
the invalid fitted rib objects, rebuilds bounded chest and shoulder layers,
raises the crown cap, adds suit-integrating guard seams, and shortens/details
the continuous-loft rifle.  No V6-B geometry is loaded or reused.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


OLD_PREFIX = "KYX_V6C_BENCH_R2_"
PREFIX = "KYX_V6C_BENCH_R3_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV3"
PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
PINNED_REV2_SHA256 = "392020bc9c1b122e975c8f872fbfe3ff72f8b834407c38c495a00b7cf3f30388"

REV2_PATH = Path(__file__).with_name("author_v6c_visual_benchmark_rev2.py")
SPEC = importlib.util.spec_from_file_location("kyx_v6c_rev2_geometry_utilities", REV2_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load rev2 utilities: {REV2_PATH}")
r2 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r2)
r2.PREFIX = PREFIX
r2.CHECKPOINT = CHECKPOINT
r2.r1.PREFIX = PREFIX
r2.r1.CHECKPOINT = CHECKPOINT
r2.base.PREFIX = PREFIX
r2.base.CHECKPOINT = CHECKPOINT
base = r2.base


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <rev2.blend> <accepted-v6a.blend> <output.blend> <report.json>")
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
        if obj.get("kyx_checkpoint") == "V6-C_VISUAL_BENCHMARK_REV2":
            obj["kyx_checkpoint"] = CHECKPOINT


def remove_objects(suffixes: list[str]) -> list[str]:
    removed: list[str] = []
    for suffix in suffixes:
        obj = bpy.data.objects.get(f"{PREFIX}{suffix}")
        if obj is not None:
            removed.append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    return removed


def safe_fitted_patch(
    name: str,
    rows: list[tuple[float, float, float]],
    bvh,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    front: bool = True,
    offset: float = 0.007,
    columns: int = 29,
    thickness: float = 0.0045,
) -> bpy.types.Object:
    """Dense body-fit patch with no subdivision overshoot."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, minimum_x, maximum_x in rows:
        for column in range(columns):
            t = column / (columns - 1)
            eased = t * t * (3.0 - 2.0 * t)
            x = minimum_x + (maximum_x - minimum_x) * eased
            vertices.append(tuple(base.surface_hit(bvh, x, z, front=front, offset=offset)))
    for row in range(len(rows) - 1):
        current = row * columns
        following = (row + 1) * columns
        for column in range(columns - 1):
            faces.append((current + column, current + column + 1,
                          following + column + 1, following + column))
    obj = base.new_mesh_object(name, vertices, faces, collection, material, role)
    base.add_modifiers(obj, solidify=thickness, bevel=0.0014, bevel_segments=3)
    obj["construction"] = "dense bounded V6-A raycast patch; no subdivision modifier"
    return obj


def high_crown_cap(
    name: str,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    rings = [
        (1.686, -0.040, 0.101, 0.103),
        (1.725, -0.032, 0.090, 0.091),
        (1.758, -0.020, 0.070, 0.071),
        (1.782, -0.006, 0.043, 0.044),
        (1.796, 0.003, 0.013, 0.014),
    ]
    angular_steps = 55
    theta_start = math.radians(-50.0)
    theta_end = math.radians(230.0)
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, center_y, radius_x, radius_y in rings:
        for index in range(angular_steps):
            t = index / (angular_steps - 1)
            theta = theta_start + (theta_end - theta_start) * t
            cosine = math.cos(theta)
            sine = math.sin(theta)
            x = radius_x * math.copysign(abs(cosine) ** 0.88, cosine)
            y = center_y + radius_y * math.copysign(abs(sine) ** 0.92, sine)
            vertices.append((x, y, z))
    for ring in range(len(rings) - 1):
        current = ring * angular_steps
        following = (ring + 1) * angular_steps
        for index in range(angular_steps - 1):
            faces.append((current + index, current + index + 1,
                          following + index + 1, following + index))
    obj = base.new_mesh_object(
        name, vertices, faces, collection, material,
        "high crown cap confined above the visor and rear temporal band",
    )
    base.add_modifiers(obj, subdivision=2, solidify=0.006, bevel=0.0018, bevel_segments=4)
    return obj


def add_guard_seams(
    equipment: bpy.types.Collection,
    material: bpy.types.Material,
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    for side, label in ((1.0, "L"), (-1.0, "R")):
        paths = {
            "Forearm": [(0.348 * side, -0.059, 1.108),
                        (0.366 * side, -0.058, 1.055),
                        (0.387 * side, -0.052, 0.995)],
            "Thigh": [(0.170 * side, -0.091, 0.858),
                      (0.165 * side, -0.088, 0.802),
                      (0.160 * side, -0.078, 0.738)],
            "Knee": [(0.146 * side, -0.078, 0.602),
                     (0.147 * side, -0.080, 0.574),
                     (0.149 * side, -0.068, 0.547)],
            "Shin": [(0.153 * side, -0.065, 0.458),
                     (0.160 * side, -0.061, 0.385),
                     (0.168 * side, -0.050, 0.296)],
        }
        for region, points in paths.items():
            objects.append(base.add_curve(
                f"{PREFIX}{region}IntegratedSeam_{label}", points, 0.0018,
                equipment, material,
                f"flush graphite center seam integrating the {region.lower()} leaf into suit logic",
            ))
    return objects


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 4:
        raise SystemExit("Expected -- <rev2.blend> <accepted-v6a.blend> <output.blend> <report.json>")
    rev2_path, v6a_path, output_path, report_path = (Path(value).resolve() for value in arguments)
    rev2_hash_before = sha256(rev2_path)
    v6a_hash_before = sha256(v6a_path)
    if rev2_hash_before != PINNED_REV2_SHA256:
        raise RuntimeError(f"Pinned rev2 hash mismatch: {rev2_hash_before}")
    if v6a_hash_before != PINNED_V6A_SHA256:
        raise RuntimeError(f"Pinned V6-A hash mismatch: {v6a_hash_before}")

    bpy.ops.wm.open_mainfile(filepath=str(rev2_path), load_ui=False, use_scripts=False)
    rename_namespace()
    body = bpy.data.objects.get(f"{PREFIX}ContinuousAnatomicalUndersuit")
    if body is None:
        raise RuntimeError("Missing renamed continuous V6-A undersuit")
    armor = bpy.data.collections.get(f"{PREFIX}AuthoredArmorSurfaces")
    equipment = bpy.data.collections.get(f"{PREFIX}IntegratedEquipment")
    rifle_collection = bpy.data.collections.get(f"{PREFIX}OriginalAutoRifle")
    if armor is None or equipment is None or rifle_collection is None:
        raise RuntimeError("Missing rev3 construction collections")
    ivory = bpy.data.materials.get(f"{PREFIX}WarmIvoryCeramic")
    graphite = bpy.data.materials.get(f"{PREFIX}GraphiteStructure")
    red = bpy.data.materials.get(f"{PREFIX}SignalCoral")
    if ivory is None or graphite is None or red is None:
        raise RuntimeError("Missing rev3 materials")

    removed = remove_objects([
        "UpperClavicle_L", "UpperClavicle_R", "LowerRibFlow_L", "LowerRibFlow_R",
        "SternumInset", "DeltoidLeaf_L", "DeltoidLeaf_R",
        "LeftShoulderIdentitySeam", "HelmetOpenCrown", "HelmetCrownSeam",
    ])
    bvh = base.make_body_bvh(body)
    replacements: list[bpy.types.Object] = []

    chest_specs = [
        ("ClavicleBlade_L",
         [(1.350, 0.062, 0.103), (1.365, 0.050, 0.132),
          (1.386, 0.048, 0.158), (1.408, 0.066, 0.166),
          (1.426, 0.091, 0.147), (1.438, 0.111, 0.132)],
         ivory, 0.008, 0.0055,
         "bounded upper-left clavicle blade following a narrow pectoral arc"),
        ("ClavicleBlade_R",
         [(1.350, -0.103, -0.062), (1.365, -0.132, -0.050),
          (1.386, -0.158, -0.048), (1.408, -0.166, -0.066),
          (1.426, -0.147, -0.091), (1.438, -0.132, -0.111)],
         ivory, 0.008, 0.0055,
         "bounded upper-right clavicle blade following a narrow pectoral arc"),
        ("RibBlade_L",
         [(1.286, 0.071, 0.093), (1.300, 0.060, 0.116),
          (1.318, 0.058, 0.133), (1.336, 0.074, 0.136),
          (1.348, 0.093, 0.121)],
         graphite, 0.0045, 0.0035,
         "small recessed left rib blade beneath the ceramic clavicle layer"),
        ("RibBlade_R",
         [(1.286, -0.093, -0.071), (1.300, -0.116, -0.060),
          (1.318, -0.133, -0.058), (1.336, -0.136, -0.074),
          (1.348, -0.121, -0.093)],
         graphite, 0.0045, 0.0035,
         "small recessed right rib blade beneath the ceramic clavicle layer"),
        ("ShortSternumPlacket",
         [(1.300, -0.016, 0.016), (1.326, -0.020, 0.020),
          (1.358, -0.021, 0.021), (1.390, -0.017, 0.017),
          (1.410, -0.010, 0.010)],
         graphite, 0.0045, 0.0030,
         "short narrow sternum placket separating the bounded chest layers"),
    ]
    for suffix, rows, material, offset, thickness, role in chest_specs:
        replacements.append(safe_fitted_patch(
            f"{PREFIX}{suffix}", rows, bvh, armor, material, role,
            offset=offset, thickness=thickness,
        ))

    for side, label in ((1.0, "L"), (-1.0, "R")):
        replacements.append(r2.r1.swept_guard(
            f"{PREFIX}DeltoidUnderlay_{label}",
            (0.222 * side, -0.012, 1.432), (0.316 * side, -0.010, 1.326),
            (0.064, 0.043), armor, graphite,
            "elongated graphite deltoid underlay bridging clavicle and upper arm",
            preferred=Vector((0.0, -1.0, 0.0)), span_degrees=138.0,
            axial_steps=21, radial_steps=25, oval=0.78, thickness=0.005,
        ))
        replacements.append(r2.swept_guard(
            f"{PREFIX}DeltoidCeramicLeaf_{label}",
            (0.230 * side, -0.021, 1.425), (0.308 * side, -0.018, 1.338),
            (0.055, 0.037), armor, ivory,
            "small pointed ceramic deltoid leaf nested inside the graphite underlay",
            preferred=Vector((0.0, -1.0, 0.0)), span_degrees=116.0,
            axial_steps=21, radial_steps=25, oval=0.78, thickness=0.0055,
        ))
    replacements.append(base.add_curve(
        f"{PREFIX}LeftShoulderIdentitySeam",
        [(0.238, -0.080, 1.414), (0.267, -0.075, 1.380),
         (0.300, -0.064, 1.345)],
        0.0025, equipment, red,
        "restrained identity seam seated inside the layered left deltoid shell",
    ))
    replacements.extend(add_guard_seams(equipment, graphite))

    replacements.append(high_crown_cap(f"{PREFIX}HelmetHighCrown", armor, ivory))
    replacements.append(base.add_curve(
        f"{PREFIX}HelmetCrownSeam",
        [(0.0, -0.098, 1.744), (0.0, -0.047, 1.782),
         (0.0, 0.015, 1.793), (0.0, 0.050, 1.765)],
        0.0023, equipment, graphite,
        "single high crown seam without a horizontal rear band",
    ))

    # Compress the already continuous rev2 rifle longitudinally to a plausible
    # carbine envelope; no part is replaced by the rejected V6-B blockout.
    rifle_scaled: list[str] = []
    for obj in list(rifle_collection.all_objects):
        if obj.type in {"MESH", "CURVE"}:
            obj.scale.x *= 0.80
            rifle_scaled.append(obj.name)
        elif obj.type == "EMPTY":
            obj.location.x *= 0.80
    for index, (x0, x1, z) in enumerate(((0.075, 0.135, 1.267),
                                         (0.165, 0.225, 1.260),
                                         (0.255, 0.315, 1.251))):
        replacements.append(base.add_curve(
            f"{PREFIX}AutoRifleHandguardVent_{index + 1}",
            [(x0, -0.070, z), ((x0 + x1) * 0.5, -0.073, z + 0.002),
             (x1, -0.068, z - 0.001)],
            0.0026, rifle_collection, graphite,
            "flush recessed handguard vent following the shortened flow shell",
        ))

    bpy.context.view_layer.update()
    replacement_bounds: dict[str, list[float]] = {}
    for obj in replacements:
        if obj.type not in {"MESH", "CURVE"}:
            continue
        points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        spans = [max(point[axis] for point in points) - min(point[axis] for point in points)
                 for axis in range(3)]
        replacement_bounds[obj.name] = [round(value, 6) for value in spans]
        if obj.name.startswith(f"{PREFIX}Clavicle") or obj.name.startswith(f"{PREFIX}Rib") or obj.name.endswith("Placket"):
            if max(spans) > 0.28:
                raise RuntimeError(f"Unbounded rev3 chest replacement: {obj.name} -> {spans}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)
    rev2_hash_after = sha256(rev2_path)
    v6a_hash_after = sha256(v6a_path)
    if rev2_hash_after != rev2_hash_before or v6a_hash_after != v6a_hash_before:
        raise RuntimeError("Pinned rev2 or V6-A changed during rev3 authoring")
    output_hash = sha256(output_path)

    report = {
        "schemaVersion": 1,
        "authoredUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "inputs": {
            "rev2": {"path": rev2_path.name, "sha256Before": rev2_hash_before,
                     "sha256After": rev2_hash_after, "unchanged": rev2_hash_before == rev2_hash_after},
            "acceptedV6A": {"path": v6a_path.name, "sha256Before": v6a_hash_before,
                            "sha256After": v6a_hash_after, "unchanged": v6a_hash_before == v6a_hash_after},
        },
        "output": {"path": output_path.name, "bytes": output_path.stat().st_size, "sha256": output_hash},
        "removedRejectedObjects": removed,
        "replacementBounds": replacement_bounds,
        "rifleLongitudinalScale": 0.80,
        "rifleScaledObjects": rifle_scaled,
        "corrections": [
            "Removed every invalid or cup-like rev2 front chest patch and the long sternum strip.",
            "Added dense bounded no-subdivision clavicle, rib, and short sternum surfaces.",
            "Replaced shoulder knobs with elongated nested graphite and ceramic deltoid layers.",
            "Added flush center seams to visually integrate forearm, thigh, knee, and tibia leaves.",
            "Raised the ivory helmet cap above the temporal band and retained the tight dark liner.",
            "Shortened the continuous-loft rifle and added three seated handguard vents.",
        ],
        "assertions": {
            "rev2Preserved": rev2_hash_before == rev2_hash_after,
            "acceptedV6APreserved": v6a_hash_before == v6a_hash_after,
            "allChestReplacementBoundsLimited": all(
                max(spans) <= 0.28 for name, spans in replacement_bounds.items()
                if ("Clavicle" in name or "RibBlade" in name or "Placket" in name)
            ),
            "noV6BObjects": not any(obj.name.startswith("KYX_V6B_") for obj in bpy.data.objects),
            "noArmatures": len(bpy.data.armatures) == 0,
            "noActions": len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
        },
        "status": "V6C_VISUAL_BENCHMARK_REV3_REQUIRES_DIRECT_VISUAL_AUDIT",
        "nonClaims": [
            "Revision 3 is a V6-C visual benchmark candidate, not V6-C or G6 acceptance.",
            "Contact witnesses establish future intent only; no literal posed contact is claimed.",
            "No final retopology, authored UVs, texture bake, rig, animation, LOD, GLB, runtime integration, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"], "outputSha256": output_hash,
        "removed": len(removed), "replacements": len(replacements),
    }, sort_keys=True))


if __name__ == "__main__":
    main()

