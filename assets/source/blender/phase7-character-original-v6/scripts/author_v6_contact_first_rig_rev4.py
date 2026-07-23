"""Rev4 contact-first proof with zero heat weights.

The prior three revisions remain preserved failure evidence.  Rev4 keeps the
native-length, numerically asserted pose from rev3 but replaces Blender heat
weighting completely with deterministic rest-space region/nearest-segment
weights.  Every body vertex is assigned, normalized to one, and audited.
"""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_rev3_base", HERE / "author_v6_contact_first_rig_rev3.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev3 authoring helpers")
rev3 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev3)

PREFIX = "V6CF4_"
rev3.PREFIX = PREFIX
rev3.rev2.PREFIX = PREFIX
rev3.rev2.base.PREFIX = PREFIX


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def smoothstep(low: float, high: float, value: float) -> float:
    factor = clamp((value - low) / (high - low))
    return factor * factor * (3.0 - 2.0 * factor)


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


def arm_threshold(z: float) -> float:
    u = clamp(z / 1.775)
    return piecewise(u, ((0.32, 0.300), (0.48, 0.290), (0.67, 0.252), (0.79, 0.215), (0.86, 0.190)))


def point_segment_distance(point: Vector, start: Vector, end: Vector) -> float:
    segment = end - start
    if segment.length_squared < 1e-12:
        return (point - start).length
    factor = clamp((point - start).dot(segment) / segment.length_squared)
    return (point - (start + segment * factor)).length


def nearest_segment_weights(
    point: Vector,
    rig: bpy.types.Object,
    names: list[str],
    sigma: float,
    maximum_influences: int = 2,
) -> dict[str, float]:
    distances = []
    for name in names:
        bone = rig.data.bones[name]
        distances.append((point_segment_distance(point, bone.head_local, bone.tail_local), name))
    distances.sort()
    chosen = distances[:maximum_influences]
    minimum = chosen[0][0]
    values = [(name, math.exp(-((distance - minimum) / sigma) ** 2)) for distance, name in chosen]
    total = sum(weight for _name, weight in values)
    return {name: weight / total for name, weight in values}


def blend_weights(primary: dict[str, float], secondary: dict[str, float], factor: float) -> dict[str, float]:
    result: dict[str, float] = {}
    for name, weight in primary.items():
        result[name] = result.get(name, 0.0) + weight * (1.0 - factor)
    for name, weight in secondary.items():
        result[name] = result.get(name, 0.0) + weight * factor
    result = {name: weight for name, weight in result.items() if weight > 1e-7}
    total = sum(result.values())
    return {name: weight / total for name, weight in result.items()}


def lower_weights(point: Vector, side: str) -> dict[str, float]:
    z = point.z
    if abs(point.x) < 0.045 and z > 0.74:
        return {"root": 1.0}
    if z < 0.12:
        return {f"foot_anchor.{side}": 1.0}
    if z < 0.19:
        factor = smoothstep(0.12, 0.19, z)
        return {f"foot_anchor.{side}": 1.0 - factor, f"shin_anchor.{side}": factor}
    if z < 0.52:
        return {f"shin_anchor.{side}": 1.0}
    if z < 0.62:
        factor = smoothstep(0.52, 0.62, z)
        return {f"shin_anchor.{side}": 1.0 - factor, f"thigh_anchor.{side}": factor}
    if z < 0.88:
        return {f"thigh_anchor.{side}": 1.0}
    factor = smoothstep(0.88, 0.98, z)
    return {f"thigh_anchor.{side}": 1.0 - factor, "root": factor}


def deterministic_body_weights(body: bpy.types.Object, rig: bpy.types.Object) -> dict[str, object]:
    for group in list(body.vertex_groups):
        body.vertex_groups.remove(group)
    groups = {bone.name: body.vertex_groups.new(name=bone.name) for bone in rig.data.bones if bone.use_deform}
    axial = ["root", "spine_01", "spine_02", "chest", "neck", "head"]
    arm_bases = ["clavicle", "upper_arm", "forearm", "wrist", "palm"]
    digit_bases = ["thumb", "index", "middle", "ring", "pinky"]
    region_counts = {"lower": 0, "axial": 0, "shoulderBlend": 0, "arm": 0, "hand": 0}
    influence_histogram: dict[str, int] = {}
    dominant_counts = {name: 0 for name in groups}

    for vertex in body.data.vertices:
        point = vertex.co
        side = "L" if point.x >= 0.0 else "R"
        z = point.z
        absolute_x = abs(point.x)
        if z < 0.96:
            body_weights = lower_weights(point, side)
            region = "lower"
        else:
            body_weights = nearest_segment_weights(point, rig, axial, 0.075, 2)
            region = "axial"

        arm_factor = 0.0
        if 0.775 <= z <= 1.485:
            threshold = arm_threshold(z)
            arm_factor = smoothstep(threshold - 0.026, threshold + 0.026, absolute_x)
        if arm_factor > 0.0:
            if z < 0.905 and absolute_x > 0.365:
                candidates = [f"{digit}_0{index}.{side}" for digit in digit_bases for index in range(1, 4)]
                candidates += [f"palm.{side}"]
                arm_weights = nearest_segment_weights(point, rig, candidates, 0.012, 2)
                region = "hand" if arm_factor > 0.98 else "shoulderBlend"
            elif z < 0.985 and absolute_x > 0.335:
                candidates = [f"wrist.{side}", f"palm.{side}"]
                candidates += [f"{digit}_01.{side}" for digit in digit_bases]
                arm_weights = nearest_segment_weights(point, rig, candidates, 0.020, 2)
                region = "hand" if arm_factor > 0.98 else "shoulderBlend"
            else:
                candidates = [f"{name}.{side}" for name in arm_bases]
                arm_weights = nearest_segment_weights(point, rig, candidates, 0.040, 2)
                region = "arm" if arm_factor > 0.98 else "shoulderBlend"
            weights = blend_weights(body_weights, arm_weights, arm_factor)
        else:
            weights = body_weights

        total = sum(weights.values())
        if abs(total - 1.0) > 1e-7:
            raise RuntimeError(f"Unnormalized deterministic weights at vertex {vertex.index}: {total}")
        for name, weight in weights.items():
            groups[name].add([vertex.index], weight, "REPLACE")
        region_counts[region] += 1
        influence_histogram[str(len(weights))] = influence_histogram.get(str(len(weights)), 0) + 1
        dominant = max(weights.items(), key=lambda item: item[1])[0]
        dominant_counts[dominant] += 1

    body.parent = rig
    body.matrix_parent_inverse = rig.matrix_world.inverted()
    modifier = body.modifiers.new(f"{PREFIX}DeterministicArmatureDeform", "ARMATURE")
    modifier.object = rig
    modifier.use_deform_preserve_volume = True
    modifier.use_vertex_groups = True
    return {
        "method": "rest-space region mask plus nearest bone segment; no heat weighting",
        "vertexCount": len(body.data.vertices),
        "regionCounts": region_counts,
        "influenceHistogram": influence_histogram,
        "maximumInfluences": max(int(value) for value in influence_histogram),
        "dominantBoneVertexCounts": dominant_counts,
        "allVerticesAssigned": sum(region_counts.values()) == len(body.data.vertices),
        "perVertexWeightSum": 1.0,
    }


def bind_body(body: bpy.types.Object, rig: bpy.types.Object) -> str:
    audit = deterministic_body_weights(body, rig)
    rig["deterministic_full_body_weight_audit"] = json.dumps(audit, sort_keys=True)
    rig["deterministic_distal_weight_audit"] = json.dumps({
        "supersededBy": "deterministic full-body region/nearest-segment weights",
        "allDigitChainsIncluded": True,
    }, sort_keys=True)
    return "DETERMINISTIC_REGION_NEAREST_SEGMENT_NO_HEAT"


rev3.rev2.base.auto_weight_body = bind_body


def main() -> None:
    rev3.main()
    args = sys.argv[sys.argv.index("--") + 1 :]
    report_path = Path(args[2]).resolve()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    rig = bpy.data.objects[f"{PREFIX}ContactFullBodyRig"]
    audit = json.loads(rig["deterministic_full_body_weight_audit"])
    report["schema"] = "kyx-v6-contact-first-rig-author-report-v4"
    report["status"] = "EARLY_CONTACT_RIG_REV4_AUTHORED_VISUAL_REVIEW_REQUIRED"
    report["scope"] = "CONTACT_RIG_FOUNDATION_ONLY_CANDIDATE_REV4"
    report["rev4Corrections"] = {
        "rev1ThroughRev3Preserved": True,
        "heatWeightsUsed": False,
        "fullBodyWeightAudit": audit,
        "poseAudit": json.loads(rig["native_y_track_pose_audit"]),
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
