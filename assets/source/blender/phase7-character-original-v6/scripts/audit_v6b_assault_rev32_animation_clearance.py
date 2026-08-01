"""Audit every exported Rev32 animation frame for gross deformation failures.

This is a fail-closed structural/deformation audit over the exact LOD0 GLB. It
checks topology stability, finite evaluated geometry and pose matrices, shell
attachment distances at the head/feet/wrists, floor penetration, combined
bounds, and body/armor broad-phase relationships for every integer frame in all
16 exported clips. Body/armor intersection pairs are recorded as diagnostics,
not treated as a zero-clipping proof: fitted armor intentionally overlaps the
continuous body shell and still requires player-eye review.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import sys
from typing import Any

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree


CHECKPOINT = "G6_ASSAULT_REV32_ALL_FRAME_DEFORMATION_AUDIT"
EXPECTED_CLIPS = {
    "KYX_REV17_FP_AIRBORNE",
    "KYX_REV17_FP_FIRE",
    "KYX_REV17_FP_IDLE",
    "KYX_REV17_FP_LAND",
    "KYX_REV17_FP_RELOAD",
    "KYX_REV17_FP_SPRINT",
    "KYX_REV17_TP_AIRBORNE_LOOP",
    "KYX_REV17_TP_DEATH_FRONT",
    "KYX_REV17_TP_HIT_REACTION_FRONT",
    "KYX_REV17_TP_IDLE",
    "KYX_REV17_TP_JUMP_START",
    "KYX_REV17_TP_LAND",
    "KYX_REV17_TP_PRIMARY_FIRE",
    "KYX_REV17_TP_RELOAD",
    "KYX_REV17_TP_RUN",
    "KYX_REV17_TP_WALK",
}
KEY_ATTACHMENTS = {
    "armorHead": ("armor", "head"),
    "armorLeftFoot": ("armor", "foot_anchor.L"),
    "armorRightFoot": ("armor", "foot_anchor.R"),
    "bodyLeftWrist": ("body", "wrist.L"),
    "bodyRightWrist": ("body", "wrist.R"),
}
RENDER_PREFIX = "KYX_REV32_CLEARANCE_"


def helpers() -> Any:
    source = Path(__file__).resolve().with_name(
        "render_v6c_lod0_retopo_rev14.py"
    )
    spec = importlib.util.spec_from_file_location(
        "kyx_rev32_clearance_helpers", source
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load render helpers from {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.RENDER_PREFIX = RENDER_PREFIX
    return module


HELPERS = helpers()


def script_args() -> tuple[Path, Path, Path, str]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <lod0.glb> <report.json> <review-dir> <expected-sha256>"
        )
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 4:
        raise SystemExit(f"Expected four arguments, got {len(values)}")
    return (
        Path(values[0]).resolve(),
        Path(values[1]).resolve(),
        Path(values[2]).resolve(),
        values[3].strip().lower(),
    )


def finite(value: float) -> bool:
    return math.isfinite(float(value))


def vector_values(value: Vector) -> list[float]:
    return [round(float(component), 7) for component in value]


def bounds(points: list[Vector]) -> tuple[Vector, Vector]:
    if not points:
        raise RuntimeError("Cannot calculate bounds for an empty mesh")
    minimum = Vector(
        (
            min(point.x for point in points),
            min(point.y for point in points),
            min(point.z for point in points),
        )
    )
    maximum = Vector(
        (
            max(point.x for point in points),
            max(point.y for point in points),
            max(point.z for point in points),
        )
    )
    return minimum, maximum


def combine_bounds(
    first: tuple[Vector, Vector], second: tuple[Vector, Vector]
) -> tuple[Vector, Vector]:
    return (
        Vector(
            tuple(min(first[0][axis], second[0][axis]) for axis in range(3))
        ),
        Vector(
            tuple(max(first[1][axis], second[1][axis]) for axis in range(3))
        ),
    )


def aabb_gap(
    first: tuple[Vector, Vector], second: tuple[Vector, Vector]
) -> float:
    axis_gaps = []
    for axis in range(3):
        axis_gaps.append(
            max(
                0.0,
                first[0][axis] - second[1][axis],
                second[0][axis] - first[1][axis],
            )
        )
    return math.sqrt(sum(gap * gap for gap in axis_gaps))


def evaluated_geometry(
    obj: bpy.types.Object, depsgraph: bpy.types.Depsgraph
) -> dict[str, Any]:
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=False, depsgraph=depsgraph)
    try:
        world = evaluated.matrix_world
        vertices = [world @ vertex.co for vertex in mesh.vertices]
        non_finite_vertices = sum(
            1
            for vertex in vertices
            if not all(finite(component) for component in vertex)
        )
        polygons = [tuple(polygon.vertices) for polygon in mesh.polygons]
        non_triangles = sum(1 for polygon in polygons if len(polygon) != 3)
        minimum, maximum = bounds(vertices)
        tree = None
        if non_finite_vertices == 0:
            tree = BVHTree.FromPolygons(
                vertices,
                polygons,
                all_triangles=(non_triangles == 0),
                epsilon=0.0,
            )
        return {
            "bounds": (minimum, maximum),
            "vertices": len(vertices),
            "polygons": len(polygons),
            "nonTriangles": non_triangles,
            "nonFiniteVertices": non_finite_vertices,
            "tree": tree,
        }
    finally:
        evaluated.to_mesh_clear()


def nearest_distance(tree: BVHTree | None, point: Vector) -> float | None:
    if tree is None:
        return None
    result = tree.find_nearest(point)
    if result is None:
        return None
    return float(result[3])


def pose_bone_data(rig: bpy.types.Object) -> tuple[dict[str, Vector], int, float]:
    points: dict[str, Vector] = {}
    non_finite = 0
    maximum_scale_deviation = 0.0
    for pose_bone in rig.pose.bones:
        world_matrix = rig.matrix_world @ pose_bone.matrix
        values = [float(value) for row in world_matrix for value in row]
        if not all(finite(value) for value in values):
            non_finite += 1
        scale = world_matrix.to_scale()
        maximum_scale_deviation = max(
            maximum_scale_deviation,
            *(abs(float(component) - 1.0) for component in scale),
        )
        if pose_bone.name in {bone for _, bone in KEY_ATTACHMENTS.values()}:
            points[pose_bone.name] = rig.matrix_world @ pose_bone.head
    return points, non_finite, maximum_scale_deviation


def sample_pose(
    scene: bpy.types.Scene,
    rig: bpy.types.Object,
    body: bpy.types.Object,
    armor: bpy.types.Object,
    action: bpy.types.Action | None,
    frame: int,
) -> dict[str, Any]:
    if action is None:
        rig.data.pose_position = "REST"
        animation_data = rig.animation_data_create()
        animation_data.use_nla = False
        animation_data.action = None
        scene.frame_set(frame)
        bpy.context.view_layer.update()
    else:
        rig.data.pose_position = "POSE"
        HELPERS.assign_action(scene, rig, action, float(frame))

    depsgraph = bpy.context.evaluated_depsgraph_get()
    body_geometry = evaluated_geometry(body, depsgraph)
    armor_geometry = evaluated_geometry(armor, depsgraph)
    combined = combine_bounds(body_geometry["bounds"], armor_geometry["bounds"])
    dimensions = combined[1] - combined[0]
    diagonal = float(dimensions.length)
    bone_points, non_finite_bones, maximum_scale_deviation = pose_bone_data(rig)
    attachment_distances = {}
    for label, (shell, bone_name) in KEY_ATTACHMENTS.items():
        tree = body_geometry["tree"] if shell == "body" else armor_geometry["tree"]
        point = bone_points.get(bone_name)
        attachment_distances[label] = (
            nearest_distance(tree, point) if point is not None else None
        )
    overlap_pairs = None
    if body_geometry["tree"] is not None and armor_geometry["tree"] is not None:
        overlap_pairs = len(body_geometry["tree"].overlap(armor_geometry["tree"]))

    return {
        "action": action.name if action is not None else "RIG_REST_POSE",
        "frame": frame,
        "combinedBounds": {
            "minimum": vector_values(combined[0]),
            "maximum": vector_values(combined[1]),
            "dimensions": vector_values(dimensions),
            "diagonal": round(diagonal, 7),
        },
        "floorMinimumZ": round(float(combined[0].z), 7),
        "armorBodyAabbGap": round(
            aabb_gap(body_geometry["bounds"], armor_geometry["bounds"]), 7
        ),
        "surfaceIntersectionPairsDiagnostic": overlap_pairs,
        "attachmentDistances": {
            label: round(value, 7) if value is not None else None
            for label, value in attachment_distances.items()
        },
        "topology": {
            "body": {
                key: body_geometry[key]
                for key in (
                    "vertices",
                    "polygons",
                    "nonTriangles",
                    "nonFiniteVertices",
                )
            },
            "armor": {
                key: armor_geometry[key]
                for key in (
                    "vertices",
                    "polygons",
                    "nonTriangles",
                    "nonFiniteVertices",
                )
            },
        },
        "nonFinitePoseBones": non_finite_bones,
        "maximumBoneScaleDeviation": round(maximum_scale_deviation, 7),
    }


def threshold_contract(rest: dict[str, Any]) -> dict[str, Any]:
    rest_diagonal = rest["combinedBounds"]["diagonal"]
    attachment_limits = {}
    for label, value in rest["attachmentDistances"].items():
        if value is None:
            attachment_limits[label] = None
        else:
            attachment_limits[label] = round(max(0.20, value * 3.0 + 0.05), 7)
    return {
        "maximumCombinedDiagonal": round(rest_diagonal * 1.80, 7),
        "minimumFloorZ": round(rest["floorMinimumZ"] - 0.15, 7),
        "maximumArmorBodyAabbGap": 0.01,
        "maximumBoneScaleDeviation": 0.25,
        "maximumAttachmentDistance": attachment_limits,
        "surfaceIntersectionPairs": (
            "diagnostic only; fitted armor intentionally intersects body shell"
        ),
    }


def frame_failures(
    sample: dict[str, Any], rest: dict[str, Any], thresholds: dict[str, Any]
) -> list[str]:
    failures = []
    if sample["topology"] != rest["topology"]:
        failures.append("EVALUATED_TOPOLOGY_CHANGED")
    if any(
        sample["topology"][shell]["nonFiniteVertices"] > 0
        for shell in ("body", "armor")
    ):
        failures.append("NON_FINITE_EVALUATED_VERTICES")
    if sample["nonFinitePoseBones"] > 0:
        failures.append("NON_FINITE_POSE_BONES")
    if sample["maximumBoneScaleDeviation"] > thresholds["maximumBoneScaleDeviation"]:
        failures.append("GROSS_BONE_SCALE_DEVIATION")
    if sample["combinedBounds"]["diagonal"] > thresholds["maximumCombinedDiagonal"]:
        failures.append("GROSS_MESH_BOUNDS_EXPANSION")
    if sample["floorMinimumZ"] < thresholds["minimumFloorZ"]:
        failures.append("GROSS_FLOOR_PENETRATION")
    if sample["armorBodyAabbGap"] > thresholds["maximumArmorBodyAabbGap"]:
        failures.append("ARMOR_BODY_GROSS_DETACHMENT")
    for label, limit in thresholds["maximumAttachmentDistance"].items():
        distance = sample["attachmentDistances"].get(label)
        if limit is None or distance is None:
            failures.append(f"MISSING_ATTACHMENT_PROBE_{label}")
        elif distance > limit:
            failures.append(f"ATTACHMENT_DISTANCE_EXCEEDED_{label}")
    return failures


def gameplay_semantic_failures(
    samples: list[dict[str, Any]], rest: dict[str, Any]
) -> list[dict[str, Any]]:
    """Assert contact semantics that generic deformation bounds cannot prove."""

    failures = []
    by_action: dict[str, list[dict[str, Any]]] = {}
    for sample in samples:
        by_action.setdefault(sample["action"], []).append(sample)
    death = by_action.get("KYX_REV17_TP_DEATH_FRONT", [])
    if not death:
        failures.append(
            {
                "code": "TP_DEATH_ACTION_MISSING",
                "detail": "No third-person death samples were available.",
            }
        )
    else:
        final = max(death, key=lambda sample: sample["frame"])
        maximum_grounded_floor = rest["floorMinimumZ"] + 0.05
        maximum_prone_height = rest["combinedBounds"]["dimensions"][2] * 0.65
        if final["floorMinimumZ"] > maximum_grounded_floor:
            failures.append(
                {
                    "code": "TP_DEATH_FINAL_POSE_FLOATS_ABOVE_FLOOR",
                    "action": final["action"],
                    "frame": final["frame"],
                    "observedFloorMinimumZ": final["floorMinimumZ"],
                    "maximumAllowedFloorMinimumZ": round(maximum_grounded_floor, 7),
                }
            )
        if final["combinedBounds"]["dimensions"][2] > maximum_prone_height:
            failures.append(
                {
                    "code": "TP_DEATH_FINAL_POSE_NOT_PRONE_ENOUGH",
                    "action": final["action"],
                    "frame": final["frame"],
                    "observedHeight": final["combinedBounds"]["dimensions"][2],
                    "maximumAllowedHeight": round(maximum_prone_height, 7),
                }
            )
    return failures


def anomaly_score(
    sample: dict[str, Any], rest: dict[str, Any], thresholds: dict[str, Any]
) -> float:
    score = abs(
        sample["combinedBounds"]["diagonal"]
        / max(rest["combinedBounds"]["diagonal"], 0.000001)
        - 1.0
    )
    score += max(0.0, rest["floorMinimumZ"] - sample["floorMinimumZ"]) * 4.0
    score += sample["armorBodyAabbGap"] * 10.0
    for label, limit in thresholds["maximumAttachmentDistance"].items():
        value = sample["attachmentDistances"].get(label)
        baseline = rest["attachmentDistances"].get(label)
        if value is not None and baseline is not None:
            score += max(0.0, value - baseline) / max(limit or 1.0, 0.000001)
    rest_pairs = rest["surfaceIntersectionPairsDiagnostic"]
    pairs = sample["surfaceIntersectionPairsDiagnostic"]
    if rest_pairs not in (None, 0) and pairs is not None:
        score += abs(pairs / rest_pairs - 1.0) * 0.10
    return round(score, 9)


def diverse_worst_frames(samples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Choose the worst metric frame from six distinct third-person actions."""

    by_action: dict[str, dict[str, Any]] = {}
    for sample in samples:
        if not sample["action"].startswith("KYX_REV17_TP_"):
            continue
        previous = by_action.get(sample["action"])
        if previous is None or sample["anomalyScore"] > previous["anomalyScore"]:
            by_action[sample["action"]] = sample
    ranked = sorted(
        by_action.values(),
        key=lambda sample: (
            sample["anomalyScore"],
            sample["action"],
            sample["frame"],
        ),
        reverse=True,
    )
    return ranked[:6]


def safe_slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def render_worst_frames(
    scene: bpy.types.Scene,
    rig: bpy.types.Object,
    meshes: list[bpy.types.Object],
    actions: dict[str, bpy.types.Action],
    selected: list[dict[str, Any]],
    output_dir: Path,
    rest: dict[str, Any],
) -> list[dict[str, Any]]:
    output_dir.mkdir(parents=True, exist_ok=True)
    minimum = Vector(rest["combinedBounds"]["minimum"])
    maximum = Vector(rest["combinedBounds"]["maximum"])
    HELPERS.configure_scene(scene, minimum, maximum)
    records = []
    for index, selected_frame in enumerate(selected, start=1):
        action = actions[selected_frame["action"]]
        HELPERS.assign_action(scene, rig, action, float(selected_frame["frame"]))
        pose_minimum, pose_maximum = HELPERS.evaluated_bounds(meshes)
        center = (pose_minimum + pose_maximum) * 0.5
        height = pose_maximum.z - pose_minimum.z
        target = center + Vector((0.0, -0.025, height * 0.015))
        camera = HELPERS.add_camera(
            f"{RENDER_PREFIX}Worst_{index:02d}",
            target + Vector((3.8, 3.8, 1.15)),
            target,
            max(height * 1.18, 2.05),
        )
        scene.camera = camera
        scene.render.resolution_x = 900
        scene.render.resolution_y = 1150
        scene.render.stamp_note_text = (
            f"ASSAULT REV32 ALL-FRAME AUDIT | WORST METRIC {index}/6 | "
            f"{action.name} f{selected_frame['frame']} | SCORE "
            f"{selected_frame['anomalyScore']:.4f} | HUMAN CLIPPING REVIEW REQUIRED"
        )
        output = output_dir / (
            f"worst-{index:02d}-{safe_slug(action.name)}-f"
            f"{selected_frame['frame']:03d}.png"
        )
        scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
        records.append(
            {
                "rank": index,
                "action": action.name,
                "frame": selected_frame["frame"],
                "anomalyScore": selected_frame["anomalyScore"],
                "path": str(output),
                "bytes": output.stat().st_size,
                "sha256": HELPERS.sha256(output),
                "resolution": [900, 1150],
            }
        )
        bpy.data.objects.remove(camera, do_unlink=True)
    return records


def main() -> None:
    glb_path, report_path, review_dir, expected_sha = script_args()
    if not glb_path.is_file():
        raise FileNotFoundError(glb_path)
    source_hash_before = HELPERS.sha256(glb_path)
    source_bytes_before = glb_path.stat().st_size
    if source_hash_before != expected_sha:
        raise RuntimeError(
            f"Rev32 LOD0 hash mismatch: {source_hash_before} != {expected_sha}"
        )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(glb_path))
    if "FINISHED" not in result:
        raise RuntimeError(f"Fresh Rev32 import failed: {result}")
    helper_meshes = HELPERS.imported_helper_meshes()
    runtime_meshes = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH" and obj not in helper_meshes
    ]
    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    rig = max(rigs, key=lambda item: len(item.data.bones), default=None)
    if rig is None:
        raise RuntimeError("Fresh Rev32 import contains no armature")
    if len(runtime_meshes) != 2:
        raise RuntimeError(f"Expected exactly two runtime meshes, got {len(runtime_meshes)}")
    body = next(
        (obj for obj in runtime_meshes if "CONTINUOUS_CYBERSUIT" in obj.name),
        None,
    )
    armor = next(
        (obj for obj in runtime_meshes if "CONNECTED_ARMOR_HELMET" in obj.name),
        None,
    )
    if body is None or armor is None:
        raise RuntimeError(
            f"Unable to identify body/armor meshes: {[obj.name for obj in runtime_meshes]}"
        )
    actions = {action.name: action for action in bpy.data.actions}
    if set(actions) != EXPECTED_CLIPS:
        raise RuntimeError(f"Rev32 clip contract mismatch: {sorted(actions)}")

    scene = bpy.context.scene
    rest = sample_pose(scene, rig, body, armor, None, 1)
    thresholds = threshold_contract(rest)
    all_samples = []
    failures = []
    action_summaries = []
    for action_name in sorted(actions):
        action = actions[action_name]
        frame_start = int(math.floor(action.frame_range[0]))
        frame_end = int(math.ceil(action.frame_range[1]))
        action_samples = []
        for frame in range(frame_start, frame_end + 1):
            sample = sample_pose(scene, rig, body, armor, action, frame)
            sample["anomalyScore"] = anomaly_score(sample, rest, thresholds)
            sample_failures = frame_failures(sample, rest, thresholds)
            if sample_failures:
                failures.append(
                    {
                        "action": action_name,
                        "frame": frame,
                        "failures": sample_failures,
                    }
                )
            action_samples.append(sample)
            all_samples.append(sample)
        action_summaries.append(
            {
                "action": action_name,
                "frameStart": frame_start,
                "frameEnd": frame_end,
                "sampleCount": len(action_samples),
                "maximumAnomalyScore": max(
                    sample["anomalyScore"] for sample in action_samples
                ),
                "minimumFloorZ": min(
                    sample["floorMinimumZ"] for sample in action_samples
                ),
                "maximumArmorBodyAabbGap": max(
                    sample["armorBodyAabbGap"] for sample in action_samples
                ),
                "surfaceIntersectionPairRange": [
                    min(
                        sample["surfaceIntersectionPairsDiagnostic"]
                        for sample in action_samples
                    ),
                    max(
                        sample["surfaceIntersectionPairsDiagnostic"]
                        for sample in action_samples
                    ),
                ],
                "hardFailureFrames": sum(
                    1
                    for failure in failures
                    if failure["action"] == action_name
                ),
            }
        )
        print(f"KYX_CLEARANCE_SAMPLED {action_name} {len(action_samples)}")

    semantic_failures = gameplay_semantic_failures(all_samples, rest)
    worst_frames = diverse_worst_frames(all_samples)
    worst_frame_renders = render_worst_frames(
        scene,
        rig,
        [body, armor],
        actions,
        worst_frames,
        review_dir,
        rest,
    )

    frame_digest_payload = [
        {
            "action": sample["action"],
            "frame": sample["frame"],
            "bounds": sample["combinedBounds"],
            "floor": sample["floorMinimumZ"],
            "gap": sample["armorBodyAabbGap"],
            "pairs": sample["surfaceIntersectionPairsDiagnostic"],
            "attachments": sample["attachmentDistances"],
            "topology": sample["topology"],
            "bones": [
                sample["nonFinitePoseBones"],
                sample["maximumBoneScaleDeviation"],
            ],
        }
        for sample in all_samples
    ]
    frame_digest = hashlib.sha256(
        json.dumps(
            frame_digest_payload,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
    ).hexdigest()
    source_hash_after = HELPERS.sha256(glb_path)
    passed = not failures and not semantic_failures
    report = {
        "schema": "kyx-g6-assault-rev32-all-frame-deformation-audit-v1",
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "status": (
            "ALL_EXPORTED_FRAMES_SAMPLED_GROSS_DEFORMATION_GATE_PASS_"
            "HUMAN_CLIPPING_REVIEW_REQUIRED"
            if passed
            else "ALL_EXPORTED_FRAMES_SAMPLED_GROSS_DEFORMATION_GATE_FAIL"
        ),
        "sourceGlb": {
            "path": str(glb_path),
            "bytes": source_bytes_before,
            "sha256Before": source_hash_before,
            "sha256After": source_hash_after,
            "exactHashAndBytesUnchanged": (
                source_hash_before == source_hash_after == expected_sha
                and source_bytes_before == glb_path.stat().st_size
            ),
        },
        "contract": {
            "runtimeMeshes": [body.name, armor.name],
            "armature": rig.name,
            "boneCount": len(rig.data.bones),
            "clips": sorted(actions),
            "clipCount": len(actions),
            "integerFramesSampled": len(all_samples),
            "everyIntegerFrameSampled": True,
            "frameMetricsSha256": frame_digest,
        },
        "restReference": rest,
        "thresholds": thresholds,
        "actionSummaries": action_summaries,
        "hardFailureCount": len(failures) + len(semantic_failures),
        "hardFrameFailureCount": len(failures),
        "hardFailures": failures,
        "gameplaySemanticFailureCount": len(semantic_failures),
        "gameplaySemanticFailures": semantic_failures,
        "worstFrames": [
            {
                "action": sample["action"],
                "frame": sample["frame"],
                "anomalyScore": sample["anomalyScore"],
                "floorMinimumZ": sample["floorMinimumZ"],
                "armorBodyAabbGap": sample["armorBodyAabbGap"],
                "surfaceIntersectionPairsDiagnostic": sample[
                    "surfaceIntersectionPairsDiagnostic"
                ],
                "attachmentDistances": sample["attachmentDistances"],
            }
            for sample in worst_frames
        ],
        "worstFrameRenders": worst_frame_renders,
        "allFrameMetrics": all_samples,
        "claims": {
            "allExportedIntegerFramesSampled": True,
            "finiteTopologyAndGrossAttachmentGatePassed": not failures,
            "gameplayContactSemanticsPassed": not semantic_failures,
            "zeroVisibleClipping": False,
            "surfaceIntersectionPairsAreFailureGate": False,
            "humanAnimationVisualAcceptance": False,
            "runtimeBrowserAnimationAcceptance": False,
        },
        "nonClaims": [
            "Body and fitted armor intentionally overlap, so raw BVH intersection pairs do not prove visible clipping.",
            "Worst-frame renders support but do not replace a human player-eye animation review.",
            "This direct Blender import does not prove browser runtime selection, weapon contact, or network presentation.",
        ],
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "status": report["status"],
                "sampleCount": len(all_samples),
                "hardFailureCount": len(failures) + len(semantic_failures),
                "gameplaySemanticFailureCount": len(semantic_failures),
                "frameMetricsSha256": frame_digest,
                "report": str(report_path),
                "worstFrameRenderCount": len(worst_frame_renders),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
