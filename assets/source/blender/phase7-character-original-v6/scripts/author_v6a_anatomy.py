"""Author the KYX Vanguard V6-A anatomy/silhouette checkpoint.

This deterministic sculpt-equivalent deformation changes the sanitized CC0
realistic male base cage in a working duplicate. It deliberately does not add
costume, armor, helmet, props, materials, rigging, retopology, or exports.

The script must be run by Blender with factory startup and auto-execution
disabled. It refuses to touch the immutable source path or an unpinned input.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector


PINNED_SOURCE_SHA256 = "e2d5b41ce10364cfc570fb0efe961c6548fe6fb90ab87850b453728372669e0d"
BODY_SOURCE = "KYX_V6_CC0_AnatomySeed_Body"
BODY_FINAL = "KYX_V6A_AnatomySculpt_Body"
EYE_SOURCE = (
    "KYX_V6_CC0_AnatomySeed_Eye.L",
    "KYX_V6_CC0_AnatomySeed_Eye.R",
)
TARGET_HEIGHT_METERS = 1.775


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected: -- <immutable-source.blend> <working.blend> "
            "<working-initial-sha256> <author-report.json>"
        )
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def geometry_sha256(mesh: bpy.types.Mesh) -> str:
    digest = hashlib.sha256()
    digest.update(struct.pack("<III", len(mesh.vertices), len(mesh.edges), len(mesh.polygons)))
    for vertex in mesh.vertices:
        digest.update(struct.pack("<ddd", vertex.co.x, vertex.co.y, vertex.co.z))
    for edge in mesh.edges:
        digest.update(struct.pack("<II", edge.vertices[0], edge.vertices[1]))
    for polygon in mesh.polygons:
        digest.update(struct.pack("<I", len(polygon.vertices)))
        for index in polygon.vertices:
            digest.update(struct.pack("<I", index))
    return digest.hexdigest()


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return float(value >= edge1)
    t = clamp((value - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def gaussian(value: float, center: float, width: float) -> float:
    return math.exp(-((value - center) / width) ** 2)


def piecewise(value: float, points: tuple[tuple[float, float], ...]) -> float:
    if value <= points[0][0]:
        return points[0][1]
    if value >= points[-1][0]:
        return points[-1][1]
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x0 <= value <= x1:
            factor = (value - x0) / (x1 - x0)
            return y0 + (y1 - y0) * factor
    raise AssertionError("piecewise interval missing")


VERTICAL_PROFILE = (
    # source standing-height fraction -> target standing-height fraction
    (0.000, 0.000),
    (0.085, 0.090),
    (0.310, 0.330),
    (0.480, 0.525),
    (0.610, 0.640),
    (0.690, 0.715),
    (0.820, 0.830),
    (0.880, 0.900),
    (1.000, 1.000),
)


def arm_threshold(u: float) -> float:
    return piecewise(
        u,
        ((0.32, 0.300), (0.48, 0.290), (0.67, 0.252), (0.79, 0.215), (0.86, 0.190)),
    )


def arm_center(u: float) -> float:
    return piecewise(
        u,
        ((0.32, 0.425), (0.48, 0.375), (0.67, 0.292), (0.79, 0.238), (0.86, 0.205)),
    )


def region_weights(co: Vector, u: float) -> tuple[float, float, float, float]:
    abs_x = abs(co.x)
    arm_window = smoothstep(0.32, 0.37, u) * (1.0 - smoothstep(0.83, 0.87, u))
    arm = arm_window * smoothstep(arm_threshold(u) - 0.018, arm_threshold(u) + 0.018, abs_x)
    head = smoothstep(0.835, 0.875, u) * (1.0 - arm)
    leg_window = 1.0 - smoothstep(0.53, 0.60, u)
    leg = leg_window * (1.0 - arm) * smoothstep(0.035, 0.075, abs_x)
    torso_window = smoothstep(0.47, 0.54, u) * (1.0 - smoothstep(0.845, 0.88, u))
    torso = torso_window * (1.0 - arm) * (1.0 - head)
    return arm, leg, torso, head


def deform_coordinate(co: Vector, min_z: float, source_height: float) -> tuple[Vector, dict[str, float]]:
    u = clamp((co.z - min_z) / source_height)
    arm, leg, torso, head = region_weights(co, u)
    sign_x = -1.0 if co.x < 0.0 else 1.0
    abs_x = abs(co.x)

    target_u = piecewise(u, VERTICAL_PROFILE)
    z_target = target_u * TARGET_HEIGHT_METERS
    # The concept's hands read lower and more mobile. Extend the distal arm
    # path without disturbing the shoulder seam or topology.
    distal_arm = arm * (1.0 - smoothstep(0.63, 0.80, u))
    z_target -= 0.027 * distal_arm

    # Start from a restrained global narrowing, then blend anatomically scoped
    # edits. Limb centers remain stable while cross-sections lose bulk.
    x_target = co.x * 0.985
    y_center = -0.020
    y_target = y_center + (co.y - y_center) * 0.965

    if arm > 0.0:
        source_center = arm_center(u)
        center_scale = 0.945
        # Preserve recognizable hand volume; slim upper/forearm mass more.
        hand_weight = 1.0 - smoothstep(0.48, 0.57, u)
        thickness_scale = 0.860 + 0.070 * hand_weight
        arm_x = sign_x * (
            source_center * center_scale
            + (abs_x - source_center) * thickness_scale
        )
        arm_y_scale = 0.895 + 0.045 * hand_weight
        arm_y = y_center + (co.y - y_center) * arm_y_scale
        x_target = x_target * (1.0 - arm) + arm_x * arm
        y_target = y_target * (1.0 - arm) + arm_y * arm

    if leg > 0.0:
        leg_center = 0.124
        foot_weight = 1.0 - smoothstep(0.085, 0.14, u)
        knee_weight = gaussian(u, 0.315, 0.055)
        thigh_weight = gaussian(u, 0.455, 0.105)
        thickness_scale = 0.950 - 0.045 * knee_weight - 0.095 * thigh_weight + 0.040 * foot_weight
        target_center = leg_center * 0.980
        leg_x = sign_x * (target_center + (abs_x - leg_center) * thickness_scale)
        leg_y_scale = 0.940 - 0.110 * thigh_weight - 0.030 * knee_weight + 0.050 * foot_weight
        leg_y = (co.y - 0.002) * leg_y_scale + 0.002
        x_target = x_target * (1.0 - leg) + leg_x * leg
        y_target = y_target * (1.0 - leg) + leg_y * leg

    if torso > 0.0:
        waist = gaussian(u, 0.640, 0.080)
        pelvis = gaussian(u, 0.555, 0.075)
        upper_chest = gaussian(u, 0.765, 0.080)
        shoulder_control = gaussian(u, 0.825, 0.055)
        torso_x_scale = 0.935 - 0.080 * waist - 0.055 * pelvis + 0.005 * upper_chest - 0.025 * shoulder_control
        torso_x = co.x * torso_x_scale
        front_back_scale = 0.895 - 0.070 * waist - 0.100 * pelvis + 0.010 * upper_chest
        # Reduce glute/buttock roundness a little more than the front plane.
        if co.y > y_center:
            front_back_scale -= 0.075 * pelvis
        torso_y = y_center + (co.y - y_center) * front_back_scale
        x_target = x_target * (1.0 - torso) + torso_x * torso
        y_target = y_target * (1.0 - torso) + torso_y * torso

    if head > 0.0:
        neck = gaussian(u, 0.875, 0.030)
        jaw = gaussian(u, 0.905, 0.035)
        crown = smoothstep(0.925, 0.975, u)
        head_x_scale = 0.965 - 0.075 * neck - 0.030 * jaw + 0.010 * crown
        head_y_scale = 0.980 - 0.075 * neck - 0.025 * jaw
        head_x = co.x * head_x_scale
        head_center_y = -0.040
        head_y = head_center_y + (co.y - head_center_y) * head_y_scale
        x_target = x_target * (1.0 - head) + head_x * head
        y_target = y_target * (1.0 - head) + head_y * head

    return Vector((x_target, y_target, z_target)), {
        "arm": arm,
        "leg": leg,
        "torso": torso,
        "headNeck": head,
        "distalArm": distal_arm,
    }


def mesh_bounds(mesh: bpy.types.Mesh) -> tuple[Vector, Vector]:
    coords = [vertex.co for vertex in mesh.vertices]
    minimum = Vector(tuple(min(co[axis] for co in coords) for axis in range(3)))
    maximum = Vector(tuple(max(co[axis] for co in coords) for axis in range(3)))
    return minimum, maximum


def body_summary(body: bpy.types.Object) -> dict[str, object]:
    minimum, maximum = mesh_bounds(body.data)
    multires = [
        {
            "name": modifier.name,
            "levels": modifier.levels,
            "sculptLevels": modifier.sculpt_levels,
            "renderLevels": modifier.render_levels,
            "totalLevels": modifier.total_levels,
        }
        for modifier in body.modifiers
        if modifier.type == "MULTIRES"
    ]
    return {
        "name": body.name,
        "data": body.data.name,
        "vertices": len(body.data.vertices),
        "edges": len(body.data.edges),
        "polygons": len(body.data.polygons),
        "geometrySha256": geometry_sha256(body.data),
        "bounds": {
            "min": [round(value, 6) for value in minimum],
            "max": [round(value, 6) for value in maximum],
            "height": round(maximum.z - minimum.z, 6),
            "width": round(maximum.x - minimum.x, 6),
            "depth": round(maximum.y - minimum.y, 6),
        },
        "multires": multires,
    }


def executable_inventory() -> dict[str, object]:
    driver_records = []
    for datablocks in (
        bpy.data.objects,
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.worlds,
        bpy.data.scenes,
    ):
        for datablock in datablocks:
            animation_data = getattr(datablock, "animation_data", None)
            if animation_data and animation_data.drivers:
                driver_records.append(datablock.name)
    return {
        "texts": len(bpy.data.texts),
        "actions": len(bpy.data.actions),
        "armatures": len(bpy.data.armatures),
        "drivers": sorted(driver_records),
        "libraries": len(bpy.data.libraries),
        "externalPaths": sorted(set(bpy.utils.blend_paths(absolute=True, packed=False))),
        "materials": len(bpy.data.materials),
        "images": len(bpy.data.images),
        "nodeGroups": len(bpy.data.node_groups),
    }


def main() -> None:
    args = args_after_separator()
    if len(args) != 4:
        raise SystemExit(
            "Expected: -- <immutable-source.blend> <working.blend> "
            "<working-initial-sha256> <author-report.json>"
        )
    source_path = Path(args[0]).resolve()
    working_path = Path(args[1]).resolve()
    expected_initial_hash = args[2].lower()
    report_path = Path(args[3]).resolve()
    opened_path = Path(bpy.data.filepath).resolve()
    if opened_path != working_path:
        raise RuntimeError(f"Unexpected opened blend: {opened_path}; expected {working_path}")
    if source_path == working_path:
        raise RuntimeError("Refusing to author in immutable source file")
    source_hash = sha256(source_path)
    initial_hash = sha256(working_path)
    if source_hash != PINNED_SOURCE_SHA256:
        raise RuntimeError(f"Immutable source hash mismatch: {source_hash}")
    if initial_hash != expected_initial_hash or initial_hash != source_hash:
        raise RuntimeError(
            f"Working duplicate is not byte-identical to pinned source: {initial_hash}"
        )
    inventory_before = executable_inventory()
    if any(
        (
            inventory_before["texts"],
            inventory_before["actions"],
            inventory_before["armatures"],
            inventory_before["drivers"],
            inventory_before["libraries"],
            inventory_before["externalPaths"],
            inventory_before["materials"],
            inventory_before["images"],
            inventory_before["nodeGroups"],
        )
    ):
        raise RuntimeError(f"Working duplicate contains forbidden content: {inventory_before}")

    body = bpy.data.objects.get(BODY_SOURCE)
    if body is None or body.type != "MESH":
        raise RuntimeError(f"Expected source body {BODY_SOURCE}")
    eyes = [bpy.data.objects.get(name) for name in EYE_SOURCE]
    if any(eye is None or eye.type != "MESH" for eye in eyes):
        raise RuntimeError(f"Expected both source eyes: {EYE_SOURCE}")
    if len(bpy.data.objects) != 3 or len(bpy.data.collections) != 1:
        raise RuntimeError("V6-A authoring expects the three-object sanitized scene only")
    multires_before = [
        (modifier.name, modifier.levels, modifier.sculpt_levels, modifier.render_levels, modifier.total_levels)
        for modifier in body.modifiers if modifier.type == "MULTIRES"
    ]
    if not multires_before or multires_before[0][-1] != 3:
        raise RuntimeError(f"Pinned three-level Multires data is absent: {multires_before}")

    initial_summary = body_summary(body)
    original_coords = [vertex.co.copy() for vertex in body.data.vertices]
    minimum, maximum = mesh_bounds(body.data)
    source_height = maximum.z - minimum.z
    region_counts = {"arm": 0, "leg": 0, "torso": 0, "headNeck": 0, "distalArm": 0}
    displacements: list[float] = []
    moved_vertices = 0
    for vertex, original in zip(body.data.vertices, original_coords):
        transformed, weights = deform_coordinate(original, minimum.z, source_height)
        displacement = (transformed - original).length
        vertex.co = transformed
        displacements.append(displacement)
        moved_vertices += displacement > 1.0e-7
        for name, weight in weights.items():
            region_counts[name] += weight >= 0.5
    body.data.update(calc_edges=False, calc_edges_loose=False)

    # Eyes are separate clean spheres parented to the body. Move their parent-
    # local centers through the same deformation; do not alter eye topology.
    for eye in eyes:
        local_matrix = eye.matrix_local.copy()
        transformed, _ = deform_coordinate(local_matrix.translation, minimum.z, source_height)
        local_matrix.translation = transformed
        eye.matrix_local = local_matrix

    # Normalize the authored working root and ground the plantar surface.
    authored_minimum, _ = mesh_bounds(body.data)
    body.location = (0.0, 0.0, -authored_minimum.z)
    body.rotation_euler = (0.0, 0.0, 0.0)
    body.scale = (1.0, 1.0, 1.0)

    collection = next(iter(bpy.data.collections))
    collection.name = "KYX_V6A_AnatomySculpt"
    body.name = BODY_FINAL
    body.data.name = "KYX_V6A_AnatomySculpt_Body_Mesh"
    for eye, suffix in zip(eyes, ("L", "R")):
        eye.name = f"KYX_V6A_AnatomySculpt_Eye.{suffix}"
        eye.data.name = f"KYX_V6A_AnatomySculpt_Eye.{suffix}_Mesh"

    authored_utc = datetime.now(timezone.utc).isoformat()
    for obj in [body, *eyes]:
        obj["kyx_asset_stage"] = "V6-A authored anatomy/silhouette candidate"
        obj["kyx_authorship_boundary"] = "Project-authored deformation of pinned CC0 anatomy seed"
        obj["kyx_checkpoint_status"] = "CANDIDATE_REQUIRES_HUMAN_VISUAL_REVIEW"
        obj["kyx_source_sha256"] = source_hash
        obj["kyx_authored_utc"] = authored_utc
    body["kyx_deformation_profile"] = "KYX_V6A_LEAN_LONG_LIMBED_PROFILE_V2"
    body["kyx_concept_sha256"] = "067a3eba77f9c9e566fe7aeba9684346bfd9fcd162de8ead14194640c0fb76c3"

    multires_after = [
        (modifier.name, modifier.levels, modifier.sculpt_levels, modifier.render_levels, modifier.total_levels)
        for modifier in body.modifiers if modifier.type == "MULTIRES"
    ]
    if multires_after != multires_before:
        raise RuntimeError(f"Multires changed: before={multires_before}; after={multires_after}")
    final_summary_pre_save = body_summary(body)
    inventory_after = executable_inventory()
    if any(
        (
            inventory_after["texts"],
            inventory_after["actions"],
            inventory_after["armatures"],
            inventory_after["drivers"],
            inventory_after["libraries"],
            inventory_after["externalPaths"],
            inventory_after["materials"],
            inventory_after["images"],
            inventory_after["nodeGroups"],
        )
    ):
        raise RuntimeError(f"Forbidden content appeared during authoring: {inventory_after}")

    bpy.context.scene["kyx_v6a_status"] = "CANDIDATE_REQUIRES_HUMAN_VISUAL_REVIEW"
    bpy.context.scene["kyx_v6a_non_claims"] = (
        "No armor, garment, helmet, cowl, boots, rifle, material, rig, animation, "
        "retopology, runtime export, G6, or human visual acceptance"
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(working_path), compress=True)
    final_hash = sha256(working_path)
    source_hash_after = sha256(source_path)
    if source_hash_after != source_hash:
        raise RuntimeError("Immutable source changed during V6-A authoring")

    sorted_displacements = sorted(displacements)
    report = {
        "schemaVersion": 1,
        "authoredUtc": authored_utc,
        "blenderVersion": bpy.app.version_string,
        "invocationSafety": ["--background", "--factory-startup", "--disable-autoexec", "--python-exit-code 1"],
        "immutableSource": {
            "path": source_path.name,
            "bytes": source_path.stat().st_size,
            "sha256Before": source_hash,
            "sha256After": source_hash_after,
            "unchanged": source_hash_after == source_hash == PINNED_SOURCE_SHA256,
        },
        "workingCheckpoint": {
            "path": working_path.name,
            "initialBytes": 12582373,
            "initialSha256": initial_hash,
            "finalBytes": working_path.stat().st_size,
            "finalSha256": final_hash,
            "initialAndFinalDiffer": initial_hash != final_hash,
        },
        "conceptSha256": "067a3eba77f9c9e566fe7aeba9684346bfd9fcd162de8ead14194640c0fb76c3",
        "authorship": {
            "method": "Project-authored deterministic base-cage sculpt-equivalent deformation",
            "profile": "KYX_V6A_LEAN_LONG_LIMBED_PROFILE_V2",
            "sourceTopologyReplaced": False,
            "thirdPartyAddonsOrGeneratorsUsed": False,
            "primitivesUsedAsReplacementAnatomy": False,
            "armorOrCostumeAdded": False,
        },
        "deformation": {
            "targetHeightMeters": TARGET_HEIGHT_METERS,
            "verticalControlPoints": [list(point) for point in VERTICAL_PROFILE],
            "movedVertices": moved_vertices,
            "totalVertices": len(displacements),
            "movedVertexRatio": round(moved_vertices / len(displacements), 6),
            "meanBaseCageDisplacementMeters": round(sum(displacements) / len(displacements), 6),
            "medianBaseCageDisplacementMeters": round(sorted_displacements[len(sorted_displacements) // 2], 6),
            "p95BaseCageDisplacementMeters": round(sorted_displacements[int(len(sorted_displacements) * 0.95)], 6),
            "maxBaseCageDisplacementMeters": round(max(displacements), 6),
            "regionVertexCountsAtWeightGteHalf": region_counts,
            "intent": [
                "longer leg and distal-arm read",
                "narrower waist and less rounded torso-pelvis transition",
                "reduced thigh, calf, upper-arm, and forearm bulk",
                "controlled shoulder spread",
                "cleaner neck-jaw transition for later sealed helmet and cowl construction",
                "source hand, foot, facial landmarks, UV, topology, and Multires detail retained",
            ],
        },
        "before": initial_summary,
        "after": final_summary_pre_save,
        "multiresBefore": [list(item) for item in multires_before],
        "multiresAfter": [list(item) for item in multires_after],
        "contentInventoryBefore": inventory_before,
        "contentInventoryAfter": inventory_after,
        "assertions": {
            "sourcePinnedAndImmutable": source_hash_after == source_hash == PINNED_SOURCE_SHA256,
            "workingStartedByteIdenticalToSource": initial_hash == source_hash,
            "workingFinalDiffersFromInitial": final_hash != initial_hash,
            "geometryCoordinatesChanged": initial_summary["geometrySha256"] != final_summary_pre_save["geometrySha256"],
            "topologyCountsPreserved": all(
                initial_summary[key] == final_summary_pre_save[key]
                for key in ("vertices", "edges", "polygons")
            ),
            "multiresPreserved": multires_after == multires_before,
            "authoredHeightInTargetBand": 1.765 <= final_summary_pre_save["bounds"]["height"] <= 1.785,
            "rootNormalizedAndGrounded": body.location.x == 0.0 and body.location.y == 0.0 and abs(body.location.z) <= 0.01,
            "noExecutableOrExternalContent": not any(
                (
                    inventory_after["texts"], inventory_after["actions"], inventory_after["armatures"],
                    inventory_after["drivers"], inventory_after["libraries"], inventory_after["externalPaths"],
                    inventory_after["images"], inventory_after["nodeGroups"],
                )
            ),
            "noMaterials": inventory_after["materials"] == 0,
        },
        "status": "V6A_AUTHORED_ANATOMY_CANDIDATE_REQUIRES_HUMAN_REVIEW",
        "nonClaims": [
            "V6-A is a candidate checkpoint and is not self-approved.",
            "No garment, armor, helmet, cowl, glove, boot, rifle, material, rig, animation, retopology, LOD, runtime export, or integration is claimed.",
            "This checkpoint does not satisfy G6 or human visual acceptance.",
        ],
    }
    if not all(report["assertions"].values()):
        raise RuntimeError(f"V6-A author assertions failed: {report['assertions']}")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        "V6A_AUTHORED_ANATOMY_CANDIDATE_REQUIRES_HUMAN_REVIEW "
        f"initial={initial_hash} final={final_hash} moved={moved_vertices}/{len(displacements)}"
    )


if __name__ == "__main__":
    main()
