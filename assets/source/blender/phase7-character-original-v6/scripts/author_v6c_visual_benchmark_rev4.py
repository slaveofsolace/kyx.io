"""Refine the independent V6-C benchmark after the rev3 visual audit.

Revision 4 preserves rev3 byte-for-byte.  It removes the cup-like lower chest
patches, rebuilds every limb guard as a nested wrap system, flattens the helmet
liner into a measured front/rear profile, deepens the undersuit contrast, and
adds seated boot/rifle surface routing.  No V6-B asset is loaded or reused.
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


OLD_PREFIX = "KYX_V6C_BENCH_R3_"
PREFIX = "KYX_V6C_BENCH_R4_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV4"
PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
PINNED_REV3_SHA256 = "0268b3299ecce743c22f2404af6f0ba0e74dd88f7c24304fd3a21ff3246020a0"

REV3_PATH = Path(__file__).with_name("author_v6c_visual_benchmark_rev3.py")
SPEC = importlib.util.spec_from_file_location("kyx_v6c_rev3_geometry_utilities", REV3_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load rev3 utilities: {REV3_PATH}")
r3 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r3)
for module in (r3, r3.r2, r3.r2.r1, r3.base):
    module.PREFIX = PREFIX
    module.CHECKPOINT = CHECKPOINT
base = r3.base


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <rev3.blend> <accepted-v6a.blend> <output.blend> <report.json>")
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
        if obj.get("kyx_checkpoint") == "V6-C_VISUAL_BENCHMARK_REV3":
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
    *,
    roughness: float | None = None,
    metallic: float | None = None,
) -> None:
    if material.node_tree is None:
        return
    for node in material.node_tree.nodes:
        if node.type != "BSDF_PRINCIPLED":
            continue
        node.inputs["Base Color"].default_value = color
        if roughness is not None:
            node.inputs["Roughness"].default_value = roughness
        if metallic is not None:
            node.inputs["Metallic"].default_value = metallic


def flattened_helmet_liner(
    name: str,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    """Measured asymmetric liner with a flatter rear and temporal planes."""
    rings = [
        (1.500, -0.030, 0.073, 0.079, 0.087),
        (1.545, -0.038, 0.098, 0.105, 0.097),
        (1.610, -0.044, 0.112, 0.118, 0.105),
        (1.675, -0.044, 0.116, 0.120, 0.106),
        (1.728, -0.036, 0.102, 0.105, 0.096),
        (1.770, -0.018, 0.064, 0.066, 0.067),
        (1.792, 0.000, 0.020, 0.021, 0.022),
    ]
    segments = 64
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, center_y, radius_x, front_radius, rear_radius in rings:
        for index in range(segments):
            theta = math.tau * index / segments
            cosine = math.cos(theta)
            sine = math.sin(theta)
            # Exponents below one produce restrained temporal/rear planes while
            # retaining enough curvature for the accepted V6-A head envelope.
            x = radius_x * math.copysign(abs(cosine) ** 0.79, cosine)
            depth = front_radius if sine < 0.0 else rear_radius
            y = center_y + depth * math.copysign(abs(sine) ** 0.82, sine)
            vertices.append((x, y, z))
    for ring in range(len(rings) - 1):
        current = ring * segments
        following = (ring + 1) * segments
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((current + index, current + nxt, following + nxt, following + index))
    faces.append(tuple(reversed(range(segments))))
    last = (len(rings) - 1) * segments
    faces.append(tuple(last + index for index in range(segments)))
    obj = base.new_mesh_object(
        name, vertices, faces, collection, material,
        "measured asymmetric helmet liner with flattened rear and temporal planes",
    )
    base.add_modifiers(obj, subdivision=1, solidify=0.0045, bevel=0.0013, bevel_segments=3)
    obj["construction"] = "asymmetric measured ring loft; distinct front and rear radii"
    return obj


def body_curve(
    name: str,
    bvh,
    samples: list[tuple[float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    radius: float = 0.0018,
    offset: float = 0.0030,
) -> bpy.types.Object:
    points = [tuple(base.surface_hit(bvh, x, z, front=True, offset=offset)) for x, z in samples]
    return base.add_curve(name, points, radius, collection, material, role)


def build_layered_guards(
    armor: bpy.types.Collection,
    equipment: bpy.types.Collection,
    graphite: bpy.types.Material,
    ivory: bpy.types.Material,
    red: bpy.types.Material,
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    specs = [
        ("Forearm", (0.338, -0.010, 1.132), (0.396, -0.010, 0.968),
         (0.060, 0.045), 220.0, (0.346, -0.020, 1.111), (0.386, -0.020, 0.993),
         (0.045, 0.034), 142.0, Vector((0.10, -1.0, 0.0))),
        ("Thigh", (0.171, -0.014, 0.902), (0.158, -0.016, 0.698),
         (0.086, 0.068), 174.0, (0.176, -0.026, 0.870), (0.160, -0.026, 0.734),
         (0.065, 0.050), 108.0, Vector((0.78, -1.0, 0.0))),
        ("Patella", (0.144, -0.010, 0.630), (0.151, -0.012, 0.522),
         (0.075, 0.062), 204.0, (0.146, -0.024, 0.607), (0.150, -0.024, 0.545),
         (0.056, 0.047), 122.0, Vector((0.05, -1.0, 0.0))),
        ("Tibia", (0.150, -0.006, 0.492), (0.171, -0.004, 0.258),
         (0.067, 0.050), 194.0, (0.155, -0.019, 0.461), (0.168, -0.017, 0.292),
         (0.050, 0.037), 116.0, Vector((0.16, -1.0, 0.0))),
    ]
    for side, label in ((1.0, "L"), (-1.0, "R")):
        for (region, under_start, under_end, under_radii, under_span,
             inset_start, inset_end, inset_radii, inset_span, preferred) in specs:
            mirror = lambda point: (point[0] * side, point[1], point[2])
            preferred_side = Vector((preferred.x * side, preferred.y, preferred.z))
            objects.append(r3.r2.swept_guard(
                f"{PREFIX}{region}GraphiteWrap_{label}",
                mirror(under_start), mirror(under_end), under_radii,
                armor, graphite,
                f"continuous graphite {region.lower()} wrap bridging suit and ceramic inset",
                preferred=preferred_side, span_degrees=under_span,
                axial_steps=25, radial_steps=29, oval=0.84, thickness=0.0055,
            ))
            objects.append(r3.r2.swept_guard(
                f"{PREFIX}{region}CeramicInset_{label}",
                mirror(inset_start), mirror(inset_end), inset_radii,
                armor, ivory,
                f"narrow asymmetric ceramic {region.lower()} inset nested inside the graphite wrap",
                preferred=preferred_side, span_degrees=inset_span,
                axial_steps=23, radial_steps=27, oval=0.78, thickness=0.0045,
            ))
        route_points = [
            (0.348 * side, -0.082, 1.108), (0.370 * side, -0.079, 1.045),
            (0.385 * side, -0.068, 0.991),
        ]
        objects.append(base.add_curve(
            f"{PREFIX}ForearmInsetRoute_{label}", route_points, 0.0018,
            equipment, red if label == "L" else graphite,
            "flush longitudinal route tying the nested forearm layers into the suit",
        ))
        leg_points = [
            (0.176 * side, -0.106, 0.855), (0.162 * side, -0.100, 0.748),
            (0.148 * side, -0.092, 0.592), (0.162 * side, -0.081, 0.435),
            (0.169 * side, -0.064, 0.300),
        ]
        objects.append(base.add_curve(
            f"{PREFIX}LegContinuousRoute_{label}", leg_points, 0.0017,
            equipment, red if label == "L" else graphite,
            "continuous routed seam crossing thigh, knee, and tibia layers without a floating plate",
        ))
    return objects


def add_boot_routing(
    equipment: bpy.types.Collection,
    graphite: bpy.types.Material,
    red: bpy.types.Material,
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    for side, label in ((1.0, "L"), (-1.0, "R")):
        points = [
            r3.r2.foot_transform(side, 0.0, 0.092, 0.174),
            r3.r2.foot_transform(side, 0.0, 0.038, 0.170),
            r3.r2.foot_transform(side, 0.0, -0.028, 0.149),
            r3.r2.foot_transform(side, 0.0, -0.095, 0.112),
            r3.r2.foot_transform(side, 0.0, -0.160, 0.076),
        ]
        objects.append(base.add_curve(
            f"{PREFIX}BootDorsalSpline_{label}", points, 0.0022,
            equipment, red if label == "L" else graphite,
            "seated anatomical dorsal spline breaking up the smooth boot upper",
        ))
    return objects


def add_rifle_routing(
    rifle_collection: bpy.types.Collection,
    graphite: bpy.types.Material,
    red: bpy.types.Material,
) -> list[bpy.types.Object]:
    objects = [
        base.add_curve(
            f"{PREFIX}AutoRifleEjectionFrame",
            [(0.105, -0.075, 1.238), (0.205, -0.075, 1.238),
             (0.205, -0.075, 1.265), (0.105, -0.075, 1.265),
             (0.105, -0.075, 1.238)],
            0.0023, rifle_collection, graphite,
            "flush closed ejection frame seated into the receiver loft",
        ),
        base.add_curve(
            f"{PREFIX}AutoRiflePowerRoute",
            [(-0.125, -0.071, 1.216), (-0.030, -0.074, 1.224),
             (0.085, -0.075, 1.219), (0.190, -0.073, 1.205),
             (0.292, -0.065, 1.189)],
            0.0024, rifle_collection, red,
            "continuous seated receiver-to-handguard power route",
        ),
        base.add_curve(
            f"{PREFIX}AutoRifleTopSpine",
            [(-0.155, -0.010, 1.298), (-0.045, -0.011, 1.309),
             (0.095, -0.010, 1.306), (0.235, -0.008, 1.287),
             (0.345, -0.006, 1.264)],
            0.0028, rifle_collection, graphite,
            "continuous top spine conforming to the receiver and handguard loft",
        ),
    ]
    return objects


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 4:
        raise SystemExit("Expected -- <rev3.blend> <accepted-v6a.blend> <output.blend> <report.json>")
    rev3_path, v6a_path, output_path, report_path = (Path(value).resolve() for value in arguments)
    rev3_hash_before = sha256(rev3_path)
    v6a_hash_before = sha256(v6a_path)
    if rev3_hash_before != PINNED_REV3_SHA256:
        raise RuntimeError(f"Pinned rev3 hash mismatch: {rev3_hash_before}")
    if v6a_hash_before != PINNED_V6A_SHA256:
        raise RuntimeError(f"Pinned V6-A hash mismatch: {v6a_hash_before}")

    bpy.ops.wm.open_mainfile(filepath=str(rev3_path), load_ui=False, use_scripts=False)
    rename_namespace()
    body = bpy.data.objects.get(f"{PREFIX}ContinuousAnatomicalUndersuit")
    armor = bpy.data.collections.get(f"{PREFIX}AuthoredArmorSurfaces")
    equipment = bpy.data.collections.get(f"{PREFIX}IntegratedEquipment")
    rifle_collection = bpy.data.collections.get(f"{PREFIX}OriginalAutoRifle")
    if body is None or armor is None or equipment is None or rifle_collection is None:
        raise RuntimeError("Missing required renamed rev3 construction data")

    materials = {
        "fabric": bpy.data.materials.get(f"{PREFIX}ContinuousWovenUndersuit"),
        "flex": bpy.data.materials.get(f"{PREFIX}ArticulationKnit"),
        "glove": bpy.data.materials.get(f"{PREFIX}GripComposite"),
        "boot": bpy.data.materials.get(f"{PREFIX}BootUpper"),
        "ivory": bpy.data.materials.get(f"{PREFIX}WarmIvoryCeramic"),
        "graphite": bpy.data.materials.get(f"{PREFIX}GraphiteStructure"),
        "red": bpy.data.materials.get(f"{PREFIX}SignalCoral"),
    }
    if any(material is None for material in materials.values()):
        raise RuntimeError("Missing required rev4 material")
    set_principled(materials["fabric"], (0.004, 0.008, 0.011, 1.0), roughness=0.84)
    set_principled(materials["flex"], (0.007, 0.014, 0.019, 1.0), roughness=0.82)
    set_principled(materials["glove"], (0.003, 0.006, 0.009, 1.0), roughness=0.68)
    set_principled(materials["boot"], (0.008, 0.015, 0.020, 1.0), roughness=0.60)
    set_principled(materials["graphite"], (0.010, 0.022, 0.030, 1.0), roughness=0.43, metallic=0.36)
    set_principled(materials["ivory"], (0.52, 0.43, 0.30, 1.0), roughness=0.43, metallic=0.02)
    set_principled(materials["red"], (0.46, 0.018, 0.009, 1.0), roughness=0.40, metallic=0.08)

    removable = ["RibBlade_L", "RibBlade_R", "HelmetTightLiner"]
    for label in ("L", "R"):
        removable.extend([
            f"ForearmLeaf_{label}", f"ThighLeaf_{label}", f"PatellaLeaf_{label}",
            f"TibiaLeaf_{label}", f"ForearmIntegratedSeam_{label}",
            f"ThighIntegratedSeam_{label}", f"KneeIntegratedSeam_{label}",
            f"ShinIntegratedSeam_{label}",
        ])
    removed = remove_objects(removable)
    bvh = base.make_body_bvh(body)
    replacements: list[bpy.types.Object] = []
    replacements.append(flattened_helmet_liner(
        f"{PREFIX}HelmetPlanarLiner", bpy.data.collections.get(f"{PREFIX}ContinuousUndersuit"),
        materials["graphite"],
    ))
    crown = bpy.data.objects.get(f"{PREFIX}HelmetHighCrown")
    if crown is not None:
        crown.scale.y *= 0.91
        crown.location.y -= 0.004
        crown["rev4_correction"] = "rear depth compressed while front brow coverage retained"

    replacements.append(body_curve(
        f"{PREFIX}RibTailoringSeam_L", bvh,
        [(0.026, 1.350), (0.066, 1.337), (0.108, 1.318), (0.148, 1.291)],
        equipment, materials["graphite"],
        "subtle fitted rib seam replacing the rejected lower chest cup patch",
    ))
    replacements.append(body_curve(
        f"{PREFIX}RibTailoringSeam_R", bvh,
        [(-0.026, 1.350), (-0.066, 1.337), (-0.108, 1.318), (-0.148, 1.291)],
        equipment, materials["graphite"],
        "subtle fitted rib seam replacing the rejected lower chest cup patch",
    ))
    replacements.extend(build_layered_guards(
        armor, equipment, materials["graphite"], materials["ivory"], materials["red"],
    ))
    replacements.extend(add_boot_routing(equipment, materials["graphite"], materials["red"]))
    replacements.extend(add_rifle_routing(rifle_collection, materials["graphite"], materials["red"]))

    bpy.context.view_layer.update()
    replacement_bounds: dict[str, list[float]] = {}
    for obj in replacements:
        if obj.type not in {"MESH", "CURVE"}:
            continue
        points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        spans = [max(point[axis] for point in points) - min(point[axis] for point in points)
                 for axis in range(3)]
        replacement_bounds[obj.name] = [round(value, 6) for value in spans]
        if ("Wrap" in obj.name or "Inset" in obj.name) and max(spans) > 0.30:
            raise RuntimeError(f"Unbounded rev4 limb replacement: {obj.name} -> {spans}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)
    rev3_hash_after = sha256(rev3_path)
    v6a_hash_after = sha256(v6a_path)
    if rev3_hash_after != rev3_hash_before or v6a_hash_after != v6a_hash_before:
        raise RuntimeError("Pinned rev3 or accepted V6-A changed during rev4 authoring")
    output_hash = sha256(output_path)

    report = {
        "schemaVersion": 1,
        "authoredUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "inputs": {
            "rev3": {"path": rev3_path.name, "sha256Before": rev3_hash_before,
                     "sha256After": rev3_hash_after, "unchanged": rev3_hash_before == rev3_hash_after},
            "acceptedV6A": {"path": v6a_path.name, "sha256Before": v6a_hash_before,
                            "sha256After": v6a_hash_after, "unchanged": v6a_hash_before == v6a_hash_after},
        },
        "output": {"path": output_path.name, "bytes": output_path.stat().st_size, "sha256": output_hash},
        "removedRev3Objects": removed,
        "replacementBounds": replacement_bounds,
        "corrections": [
            "Removed both cup-like graphite lower-rib patches and replaced them with fitted tailoring seams.",
            "Rebuilt all forearm, thigh, patella, and tibia armor as nested graphite wraps with narrower ceramic insets.",
            "Added continuous routed seams across the limb systems so the guards read as one equipment language.",
            "Replaced the smooth symmetric liner with an asymmetric measured loft and compressed the ivory crown depth.",
            "Deepened suit/boot values and warmed the ceramic for stronger material separation.",
            "Added seated boot dorsal splines and continuous rifle ejection, power, and top-spine routing.",
        ],
        "assertions": {
            "rev3Preserved": rev3_hash_before == rev3_hash_after,
            "acceptedV6APreserved": v6a_hash_before == v6a_hash_after,
            "noV6BObjects": not any(obj.name.startswith("KYX_V6B_") for obj in bpy.data.objects),
            "noArmatures": len(bpy.data.armatures) == 0,
            "noActions": len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
        },
        "status": "V6C_VISUAL_BENCHMARK_REV4_REQUIRES_DIRECT_VISUAL_AUDIT",
        "nonClaims": [
            "Revision 4 is a V6-C visual benchmark candidate, not V6-C or G6 acceptance.",
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
