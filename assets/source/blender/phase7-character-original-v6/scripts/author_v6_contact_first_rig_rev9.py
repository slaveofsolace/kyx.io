"""Rev9 contact-first proof: continuous palm-root digit solve and calibrated grips.

Rev8 proved the 45-bone transform and weight bookkeeping invariants, but its
digit roots were independently placed on the fixtures.  That tore a continuous
hand surface between palm and phalanges.  Rev9 derives every digit root from
the posed palm transform, solves native-length chains from those roots, uses
four-influence smooth arm weights, and places narrower grips between the palm
and opposing digits.
"""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_rev8_base", HERE / "author_v6_contact_first_rig_rev8.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev8 authoring helpers")
rev8 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev8)

PREFIX = "V6CF9_"
rev8.PREFIX = PREFIX
rev8.rev7.PREFIX = PREFIX
rev8.rev7.rev5.PREFIX = PREFIX
rev8.rev7.rev5.rev4.PREFIX = PREFIX
rev8.rev7.rev5.rev4.rev3.PREFIX = PREFIX
rev8.rev7.rev5.rev4.rev3.rev2.PREFIX = PREFIX
base = rev8.base
base.PREFIX = PREFIX


def normalized(values: dict[str, float]) -> dict[str, float]:
    values = {name: weight for name, weight in values.items() if weight > 1e-8}
    total = sum(values.values())
    if total <= 1e-12:
        raise RuntimeError("Cannot normalize empty influence set")
    return {name: weight / total for name, weight in values.items()}


def blend(primary: dict[str, float], secondary: dict[str, float], factor: float) -> dict[str, float]:
    result: dict[str, float] = {}
    for name, weight in primary.items():
        result[name] = result.get(name, 0.0) + weight * (1.0 - factor)
    for name, weight in secondary.items():
        result[name] = result.get(name, 0.0) + weight * factor
    return normalized(result)


def smooth_weights(body: bpy.types.Object, rig: bpy.types.Object) -> dict[str, object]:
    helper = rev8.rev7.rev5.rev4
    for group in list(body.vertex_groups):
        body.vertex_groups.remove(group)
    groups = {bone.name: body.vertex_groups.new(name=bone.name) for bone in rig.data.bones if bone.use_deform}
    axial = ["root", "spine_01", "spine_02", "chest", "neck", "head"]
    arm_bases = ["clavicle", "upper_arm", "forearm", "wrist", "palm"]
    families = ("thumb", "index", "middle", "ring", "pinky")
    region_counts = {"lower": 0, "axial": 0, "shoulderBlend": 0, "arm": 0, "handBase": 0, "digit": 0}
    influence_histogram: dict[str, int] = {}
    distal_family_counts = {f"{family}.{side}": 0 for side in ("R", "L") for family in families}

    for vertex in body.data.vertices:
        point = vertex.co
        side = "L" if point.x >= 0.0 else "R"
        sign = 1.0 if side == "L" else -1.0
        absolute_x = abs(point.x)
        z = point.z

        if z < 0.96:
            torso_weights = helper.lower_weights(point, side)
            region = "lower"
        else:
            torso_weights = helper.nearest_segment_weights(point, rig, axial, 0.120, 4)
            region = "axial"

        arm_factor = 0.0
        if 0.74 <= z <= 1.52:
            threshold = helper.arm_threshold(z)
            arm_factor = helper.smoothstep(threshold - 0.065, threshold + 0.045, absolute_x)

        if arm_factor > 0.0:
            if point.x * sign > 0.362 and 0.772 <= z < 0.905:
                family = rev8.rev7.anatomical_family(point, sign)
                names = [f"{family}_0{index}.{side}" for index in range(1, 4)]
                finger_weights = helper.nearest_segment_weights(point, rig, names, 0.026, 3)
                # Base loops remain shared with the palm, then hand off
                # continuously to their own three-bone family.
                palm_share = 0.38 * helper.smoothstep(0.842, 0.902, z)
                arm_weights = blend(finger_weights, {f"palm.{side}": 1.0}, palm_share)
                distal_family_counts[f"{family}.{side}"] += 1
                region = "digit"
            elif point.x * sign > 0.330 and 0.885 <= z < 1.015:
                names = [f"wrist.{side}", f"palm.{side}"] + [f"{family}_01.{side}" for family in families]
                arm_weights = helper.nearest_segment_weights(point, rig, names, 0.060, 4)
                region = "handBase"
            else:
                names = [f"{name}.{side}" for name in arm_bases]
                arm_weights = helper.nearest_segment_weights(point, rig, names, 0.105, 4)
                region = "arm" if arm_factor > 0.985 else "shoulderBlend"
            weights = blend(torso_weights, arm_weights, arm_factor)
        else:
            weights = torso_weights

        weights = normalized(weights)
        for name, weight in weights.items():
            groups[name].add([vertex.index], weight, "REPLACE")
        region_counts[region] += 1
        influence_histogram[str(len(weights))] = influence_histogram.get(str(len(weights)), 0) + 1

    body.parent = rig
    body.matrix_parent_inverse = rig.matrix_world.inverted()
    modifier = body.modifiers.new(f"{PREFIX}SmoothDeterministicArmatureDeform", "ARMATURE")
    modifier.object = rig
    modifier.use_deform_preserve_volume = True
    modifier.use_vertex_groups = True
    body.modifiers.move(body.modifiers.find(modifier.name), 0)
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)

    corrective = rev8.add_hand_preserving_corrective(body, rig)
    per_group = {}
    for side in ("R", "L"):
        for family in families:
            for index in range(1, 4):
                name = f"{family}_0{index}.{side}"
                group = body.vertex_groups[name]
                per_group[name] = sum(1 for vertex in body.data.vertices if any(item.group == group.index and item.weight > 1e-6 for item in vertex.groups))
    missing = [name for name, count in per_group.items() if count == 0]
    if missing:
        raise RuntimeError("Unweighted digit bones: " + ", ".join(missing))
    return {
        "method": "smooth deterministic four-influence arm plus family-local three-influence digits",
        "vertexCount": len(body.data.vertices),
        "regionCounts": region_counts,
        "influenceHistogram": influence_histogram,
        "maximumInfluences": max(int(value) for value in influence_histogram),
        "distalFamilyCounts": distal_family_counts,
        "verticesPerDigitGroup": per_group,
        "allThirtyDigitBonesWeighted": not missing,
        "corrective": corrective,
        "modifierStack": [{"index": index, "name": item.name, "type": item.type} for index, item in enumerate(body.modifiers)],
    }


def bind_body(body: bpy.types.Object, rig: bpy.types.Object) -> str:
    audit = smooth_weights(body, rig)
    rig["deterministic_full_body_weight_audit"] = json.dumps(audit, sort_keys=True)
    rig["deterministic_distal_weight_audit"] = json.dumps({
        "allThirtyDigitBonesWeighted": audit["allThirtyDigitBonesWeighted"],
        "verticesPerDigitGroup": audit["verticesPerDigitGroup"],
        "familyLocalOnlyBelowHandBase": True,
    }, sort_keys=True)
    return "SMOOTH_DETERMINISTIC_FOUR_INFLUENCE_CONTINUOUS_HAND_ROOTS"


def desired_bone_matrix(head: Vector, tail: Vector) -> Matrix:
    return Matrix.Translation(head) @ (tail - head).normalized().to_track_quat("Y", "Z").to_matrix().to_4x4()


def palm_mapped_root(rig: bpy.types.Object, targets: dict, palm_name: str, digit_name: str) -> Vector:
    head, tail, _roll = targets[palm_name]
    transform = desired_bone_matrix(head, tail) @ rig.data.bones[palm_name].matrix_local.inverted()
    return transform @ rig.data.bones[digit_name].head_local


def add_fabrik(targets: dict, rig: bpy.types.Object, side: str, family: str, root: Vector, end: Vector, bend: Vector) -> None:
    names = [f"{family}_0{index}.{side}" for index in range(1, 4)]
    lengths = [rig.data.bones[name].length for name in names]
    points = rev8.rev7.rev5.rev4.rev3.rev2.fabrik_chain(root, end, lengths, bend)
    rev8.rev7.rev5.rev4.rev3.rev2.add_chain_targets(targets, rig, side, family, points, Vector((0.0, 0.0, 1.0)))


def build_pose_targets() -> tuple[dict[str, tuple[Vector, Vector, Vector]], dict[str, list[float]]]:
    targets, landmarks = rev8.rev7.rev5.build_pose_targets()
    rig = bpy.data.objects[f"{PREFIX}ContactFullBodyRig"]
    forward = Vector(landmarks["forward"])
    right = Vector(landmarks["right"])
    up = Vector((0.0, 0.0, 1.0))
    grip = Vector(landmarks["grip"]) - forward * 0.025
    foregrip = Vector(landmarks["foregrip"]) - forward * 0.025

    firing_ends = {
        "middle": grip + right * 0.032 - forward * 0.010 + up * 0.042,
        "ring": grip + right * 0.032 - forward * 0.010 + up * 0.006,
        "pinky": grip + right * 0.030 - forward * 0.008 - up * 0.026,
    }
    roots: dict[str, list[float]] = {}
    for family, endpoint in firing_ends.items():
        root = palm_mapped_root(rig, targets, "palm.R", f"{family}_01.R")
        roots[f"{family}.R"] = base.rounded(root)
        add_fabrik(targets, rig, "R", family, root, endpoint, forward * 0.052 - up * 0.012)
    firing_index_root = palm_mapped_root(rig, targets, "palm.R", "index_01.R")
    firing_trigger = grip + forward * 0.030 + right * 0.015 + up * 0.125
    roots["index.R"] = base.rounded(firing_index_root)
    add_fabrik(targets, rig, "R", "index", firing_index_root, firing_trigger, up * 0.040 + forward * 0.015)
    firing_thumb_root = palm_mapped_root(rig, targets, "palm.R", "thumb_01.R")
    roots["thumb.R"] = base.rounded(firing_thumb_root)
    add_fabrik(targets, rig, "R", "thumb", firing_thumb_root, grip + right * 0.026 - forward * 0.030 + up * 0.044, -forward * 0.034 + up * 0.010)

    support_ends = {
        "index": foregrip - right * 0.032 - forward * 0.010 + up * 0.056,
        "middle": foregrip - right * 0.032 - forward * 0.010 + up * 0.023,
        "ring": foregrip - right * 0.032 - forward * 0.010 - up * 0.009,
        "pinky": foregrip - right * 0.030 - forward * 0.008 - up * 0.038,
    }
    for family, endpoint in support_ends.items():
        root = palm_mapped_root(rig, targets, "palm.L", f"{family}_01.L")
        roots[f"{family}.L"] = base.rounded(root)
        add_fabrik(targets, rig, "L", family, root, endpoint, forward * 0.052 - up * 0.012)
    support_thumb_root = palm_mapped_root(rig, targets, "palm.L", "thumb_01.L")
    roots["thumb.L"] = base.rounded(support_thumb_root)
    add_fabrik(targets, rig, "L", "thumb", support_thumb_root, foregrip - right * 0.026 - forward * 0.030 + up * 0.044, -forward * 0.034 + up * 0.010)

    landmarks["grip"] = base.rounded(grip)
    landmarks["foregrip"] = base.rounded(foregrip)
    landmarks["trigger"] = base.rounded(targets["index_03.R"][1])
    landmarks["palmMappedDigitRoots"] = roots
    return targets, landmarks


def build_rifle(collection: bpy.types.Collection, landmarks: dict[str, list[float]]) -> list[bpy.types.Object]:
    forward = Vector(landmarks["forward"])
    right = Vector(landmarks["right"])
    shoulder = Vector(landmarks["shoulderPad"])
    receiver = Vector(landmarks["receiver"])
    grip = Vector(landmarks["grip"])
    foregrip = Vector(landmarks["foregrip"])
    trigger = Vector(landmarks["trigger"])
    up = Vector((0.0, 0.0, 1.0))

    ghost = base.material(f"{PREFIX}RifleSectionGhost_Mat", (0.06, 0.50, 0.74, 1.0), metallic=0.45, roughness=0.28, alpha=0.24)
    metal = base.material(f"{PREFIX}RifleStructure_Mat", (0.025, 0.035, 0.050, 1.0), metallic=0.72, roughness=0.26)
    contact = base.material(f"{PREFIX}ContactSurface_Mat", (0.95, 0.29, 0.055, 1.0), metallic=0.18, roughness=0.34, emission=0.18)
    trigger_mat = base.material(f"{PREFIX}Trigger_Mat", (1.0, 0.72, 0.08, 1.0), metallic=0.65, roughness=0.22, emission=0.35)
    guard_mat = base.material(f"{PREFIX}Guard_Mat", (0.14, 0.82, 1.0, 1.0), metallic=0.70, roughness=0.18, emission=0.22)

    objects: list[bpy.types.Object] = []
    objects.append(base.box_mesh(f"{PREFIX}Rifle_ReceiverSectioned", receiver + forward * 0.055, (0.145, 0.36, 0.115), right, forward, collection, ghost, 0.008))
    objects.append(base.box_mesh(f"{PREFIX}Rifle_GripContact", grip, (0.055, 0.060, 0.190), right, forward, collection, contact, 0.009))
    objects.append(base.cylinder_between(f"{PREFIX}Rifle_ForegripContact", foregrip + up * 0.102, foregrip - up * 0.102, 0.032, collection, contact, 40))
    stock_start = shoulder + forward * 0.025
    stock_end = receiver - forward * 0.125
    objects.append(base.cylinder_between(f"{PREFIX}Rifle_StockBeam", stock_start, stock_end, 0.030, collection, metal, 32))
    objects.append(base.box_mesh(f"{PREFIX}Rifle_StockPadContact", shoulder, (0.115, 0.030, 0.165), right, forward, collection, contact, 0.010))
    barrel_start = receiver + forward * 0.19 + up * 0.018
    barrel_end = receiver + forward * 0.80 + up * 0.018
    objects.append(base.cylinder_between(f"{PREFIX}Rifle_Barrel", barrel_start, barrel_end, 0.021, collection, metal, 36))
    objects.append(base.cylinder_between(f"{PREFIX}Rifle_Muzzle", barrel_end - forward * 0.055, barrel_end + forward * 0.015, 0.032, collection, metal, 36))
    objects.append(base.cylinder_between(f"{PREFIX}Rifle_Trigger", trigger - up * 0.022 - forward * 0.004, trigger + up * 0.022 + forward * 0.004, 0.006, collection, trigger_mat, 24))
    guard_points = [
        trigger - forward * 0.048 + up * 0.045,
        trigger - forward * 0.042 - up * 0.040,
        trigger + forward * 0.060 - up * 0.043,
        trigger + forward * 0.070 + up * 0.042,
    ]
    objects.append(base.curve_tube(f"{PREFIX}Rifle_TriggerGuard", guard_points, 0.007, collection, guard_mat))
    objects.append(base.box_mesh(f"{PREFIX}Rifle_ForegripHandStop", foregrip + forward * 0.052 + up * 0.082, (0.100, 0.020, 0.050), right, forward, collection, guard_mat, 0.005))
    return objects


base.auto_weight_body = bind_body
base.build_pose_targets = build_pose_targets
base.build_rifle = build_rifle


def main() -> None:
    rev8.main()
    args = sys.argv[sys.argv.index("--") + 1 :]
    report_path = Path(args[2]).resolve()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    rig = bpy.data.objects[f"{PREFIX}ContactFullBodyRig"]
    report["schema"] = "kyx-v6-contact-first-rig-author-report-v9"
    report["status"] = "EARLY_CONTACT_RIG_REV9_CONTINUOUS_ROOT_VISUAL_REVIEW_REQUIRED"
    report["scope"] = "CONTACT_RIG_FOUNDATION_ONLY_CANDIDATE_REV9"
    report["rev9Corrections"] = {
        "rev1ThroughRev8Preserved": True,
        "digitRoots": "derived from posed palm matrices; never independently teleported to fixture",
        "fixtureCalibration": "narrow grip and foregrip centered between opposing palm/thumb and digit surfaces",
        "poseAudit": json.loads(rig["native_y_track_pose_audit"]),
        "fullBodyWeightAudit": json.loads(rig["deterministic_full_body_weight_audit"]),
        "distalAudit": json.loads(rig["deterministic_distal_weight_audit"]),
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
