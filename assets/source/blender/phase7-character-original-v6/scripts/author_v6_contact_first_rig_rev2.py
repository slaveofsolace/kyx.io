"""Rev2 of the V6 CONTACT-FIRST full arm/finger rig proof.

Rev1 is intentionally preserved as failure evidence.  This revision removes
all pose-bone scaling, uses anatomically sized rest chains, solves each arm at
its native lengths, and deterministically redistributes distal hand weights so
every phalanx chain participates in deformation.  It still authors no garment
or armor and makes no V6-B or G6 claim.
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
SPEC = importlib.util.spec_from_file_location("v6cf_rev1_base", HERE / "author_v6_contact_first_rig_rev1.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev1 authoring helpers")
base = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base)

PREFIX = "V6CF2_"
base.PREFIX = PREFIX
ORIGINAL_AUTO_WEIGHT_BODY = base.auto_weight_body


def build_armature(collection: bpy.types.Collection) -> bpy.types.Object:
    data = bpy.data.armatures.new(f"{PREFIX}ContactFullBodyRig_Data")
    rig = bpy.data.objects.new(f"{PREFIX}ContactFullBodyRig", data)
    collection.objects.link(rig)
    rig.show_in_front = True
    rig.display_type = "WIRE"
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    base.add_edit_bone(data, "root", (0.0, 0.0, 0.82), (0.0, 0.0, 0.96))
    base.add_edit_bone(data, "spine_01", (0.0, 0.0, 0.96), (0.0, -0.002, 1.14), "root", True)
    base.add_edit_bone(data, "spine_02", (0.0, -0.002, 1.14), (0.0, -0.008, 1.30), "spine_01", True)
    base.add_edit_bone(data, "chest", (0.0, -0.008, 1.30), (0.0, -0.010, 1.43), "spine_02", True)
    base.add_edit_bone(data, "neck", (0.0, -0.015, 1.43), (0.0, -0.025, 1.56), "chest")
    base.add_edit_bone(data, "head", (0.0, -0.025, 1.56), (0.0, -0.040, 1.73), "neck", True)

    for sign, side in ((-1.0, "R"), (1.0, "L")):
        base.add_edit_bone(data, f"thigh_anchor.{side}", (0.085 * sign, 0.0, 0.93), (0.115 * sign, 0.0, 0.55), "root")
        base.add_edit_bone(data, f"shin_anchor.{side}", (0.115 * sign, 0.0, 0.55), (0.105 * sign, -0.01, 0.13), f"thigh_anchor.{side}", True)
        base.add_edit_bone(data, f"foot_anchor.{side}", (0.105 * sign, -0.01, 0.13), (0.105 * sign, -0.13, 0.035), f"shin_anchor.{side}", True)

    digit_y = {"index": -0.151, "middle": -0.126, "ring": -0.101, "pinky": -0.076}
    digit_lengths = {
        "index": (0.033, 0.030, 0.025),
        "middle": (0.036, 0.032, 0.027),
        "ring": (0.034, 0.030, 0.026),
        "pinky": (0.029, 0.026, 0.022),
    }
    for sign, side in ((-1.0, "R"), (1.0, "L")):
        clavicle_tail = (0.185 * sign, -0.012, 1.392)
        upper_tail = (0.325 * sign, -0.025, 1.135)
        fore_tail = (0.392 * sign, -0.058, 0.900)
        wrist_tail = (0.405 * sign, -0.090, 0.845)
        palm_tail = (0.405 * sign, -0.112, 0.792)
        base.add_edit_bone(data, f"clavicle.{side}", (0.0, -0.010, 1.405), clavicle_tail, "chest")
        base.add_edit_bone(data, f"upper_arm.{side}", clavicle_tail, upper_tail, f"clavicle.{side}", True)
        base.add_edit_bone(data, f"forearm.{side}", upper_tail, fore_tail, f"upper_arm.{side}", True)
        base.add_edit_bone(data, f"wrist.{side}", fore_tail, wrist_tail, f"forearm.{side}", True)
        base.add_edit_bone(data, f"palm.{side}", wrist_tail, palm_tail, f"wrist.{side}", True)
        for digit, y in digit_y.items():
            z0 = 0.866 if digit in ("index", "middle") else 0.858
            l1, l2, l3 = digit_lengths[digit]
            p0 = Vector((0.404 * sign, y, z0))
            p1 = p0 + Vector((0.0015 * sign, 0.0, -l1))
            p2 = p1 + Vector((0.0010 * sign, 0.0, -l2))
            p3 = p2 + Vector((0.0005 * sign, 0.0, -l3))
            base.add_edit_bone(data, f"{digit}_01.{side}", tuple(p0), tuple(p1), f"palm.{side}")
            base.add_edit_bone(data, f"{digit}_02.{side}", tuple(p1), tuple(p2), f"{digit}_01.{side}", True)
            base.add_edit_bone(data, f"{digit}_03.{side}", tuple(p2), tuple(p3), f"{digit}_02.{side}", True)
        thumb0 = Vector((0.382 * sign, -0.151, 0.900))
        thumb1 = thumb0 + Vector((-0.018 * sign, -0.010, -0.025))
        thumb2 = thumb1 + Vector((-0.015 * sign, -0.008, -0.024))
        thumb3 = thumb2 + Vector((-0.010 * sign, 0.0, -0.020))
        base.add_edit_bone(data, f"thumb_01.{side}", tuple(thumb0), tuple(thumb1), f"palm.{side}")
        base.add_edit_bone(data, f"thumb_02.{side}", tuple(thumb1), tuple(thumb2), f"thumb_01.{side}", True)
        base.add_edit_bone(data, f"thumb_03.{side}", tuple(thumb2), tuple(thumb3), f"thumb_02.{side}", True)

    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def point_segment_distance(point: Vector, start: Vector, end: Vector) -> float:
    segment = end - start
    if segment.length_squared < 1e-12:
        return (point - start).length
    factor = max(0.0, min(1.0, (point - start).dot(segment) / segment.length_squared))
    return (point - (start + segment * factor)).length


def redistribute_distal_chain_weights(body: bpy.types.Object, rig: bpy.types.Object) -> dict[str, object]:
    families = ("thumb", "index", "middle", "ring", "pinky")
    audited: dict[str, object] = {}
    for sign, side in ((-1.0, "R"), (1.0, "L")):
        family_bones = {
            family: [rig.data.bones[f"{family}_0{index}.{side}"] for index in range(1, 4)]
            for family in families
        }
        affected = []
        for vertex in body.data.vertices:
            coordinate = vertex.co
            if coordinate.x * sign <= 0.372 or coordinate.z >= 0.900 or coordinate.z <= 0.775:
                continue
            affected.append(vertex.index)
        finger_group_names = [f"{family}_0{index}.{side}" for family in families for index in range(1, 4)]
        finger_groups = [body.vertex_groups[name] for name in finger_group_names]
        for group in finger_groups:
            group.remove(affected)
        counts = {name: 0 for name in finger_group_names}
        for vertex_index in affected:
            point = body.data.vertices[vertex_index].co
            # Assign each distal vertex to the nearest actual rest phalanx.
            candidates = []
            for family, bones in family_bones.items():
                for index, bone in enumerate(bones, 1):
                    candidates.append((point_segment_distance(point, bone.head_local, bone.tail_local), family, index))
            candidates.sort(key=lambda item: item[0])
            primary = candidates[0]
            secondary = next((item for item in candidates[1:] if item[1] == primary[1] and item[2] != primary[2]), None)
            primary_name = f"{primary[1]}_0{primary[2]}.{side}"
            body.vertex_groups[primary_name].add([vertex_index], 0.86, "REPLACE")
            counts[primary_name] += 1
            if secondary is not None:
                secondary_name = f"{secondary[1]}_0{secondary[2]}.{side}"
                body.vertex_groups[secondary_name].add([vertex_index], 0.14, "ADD")
                counts[secondary_name] += 1
        audited[side] = {"affectedVertices": len(affected), "nonzeroAssignments": counts}
    return audited


def auto_weight_body(body: bpy.types.Object, rig: bpy.types.Object) -> str:
    result = ORIGINAL_AUTO_WEIGHT_BODY(body, rig)
    rig["deterministic_distal_weight_audit"] = json.dumps(redistribute_distal_chain_weights(body, rig), sort_keys=True)
    return result + "+DETERMINISTIC_DISTAL_CHAINS"


def native_segment(rig: bpy.types.Object, name: str, head: Vector, direction: Vector, roll: Vector) -> tuple[Vector, Vector, Vector]:
    return head, head + direction.normalized() * rig.data.bones[name].length, roll


def solve_two_bone(start: Vector, end: Vector, length_a: float, length_b: float, bend_hint: Vector) -> Vector:
    axis = end - start
    distance = axis.length
    if distance > length_a + length_b - 1e-5:
        end = start + axis.normalized() * (length_a + length_b - 1e-5)
        axis = end - start
        distance = axis.length
    direction = axis.normalized()
    along = (length_a * length_a - length_b * length_b + distance * distance) / (2.0 * distance)
    height = math.sqrt(max(0.0, length_a * length_a - along * along))
    bend = bend_hint - direction * bend_hint.dot(direction)
    if bend.length < 1e-5:
        bend = Vector((0.0, 0.0, -1.0)).cross(direction)
    bend.normalize()
    return start + direction * along + bend * height


def fabrik_chain(start: Vector, end: Vector, lengths: list[float], bend: Vector) -> list[Vector]:
    axis = end - start
    if axis.length > sum(lengths) - 1e-5:
        end = start + axis.normalized() * (sum(lengths) - 1e-5)
    points = [start]
    for index in range(1, len(lengths)):
        factor = sum(lengths[:index]) / sum(lengths)
        points.append(start.lerp(end, factor) + bend * math.sin(math.pi * factor))
    points.append(end)
    for _ in range(24):
        points[-1] = end
        for index in range(len(lengths) - 1, -1, -1):
            direction = (points[index] - points[index + 1]).normalized()
            points[index] = points[index + 1] + direction * lengths[index]
        points[0] = start
        for index, length in enumerate(lengths):
            direction = (points[index + 1] - points[index]).normalized()
            points[index + 1] = points[index] + direction * length
    return points


def add_chain_targets(targets: dict, rig: bpy.types.Object, side: str, family: str, points: list[Vector], roll: Vector) -> None:
    for index in range(3):
        name = f"{family}_0{index + 1}.{side}"
        direction = points[index + 1] - points[index]
        targets[name] = native_segment(rig, name, points[index], direction, roll)


def build_pose_targets() -> tuple[dict[str, tuple[Vector, Vector, Vector]], dict[str, list[float]]]:
    rig = bpy.data.objects[f"{PREFIX}ContactFullBodyRig"]
    forward = Vector((0.22, -0.975, 0.0)).normalized()
    right = Vector((-forward.y, forward.x, 0.0)).normalized()
    up = Vector((0.0, 0.0, 1.0))
    shoulder_pad = Vector((-0.185, -0.115, 1.365))
    receiver = shoulder_pad + forward * 0.29 + Vector((0.0, 0.0, -0.055))
    grip = receiver + forward * 0.035 + Vector((0.0, 0.0, -0.145))
    foregrip = receiver + forward * 0.35 + Vector((0.0, 0.0, -0.120))
    trigger = grip + forward * 0.020 + Vector((0.0, 0.0, 0.105))
    firing_palm = grip - right * 0.050 + up * 0.040
    support_palm = foregrip + right * 0.050 + up * 0.038

    targets: dict[str, tuple[Vector, Vector, Vector]] = {}
    current = Vector((0.0, 0.0, 0.96))
    for name, direction in (
        ("spine_01", Vector((0.0, -0.025, 1.0))),
        ("spine_02", Vector((-0.02, -0.05, 1.0))),
        ("chest", Vector((-0.03, -0.04, 1.0))),
        ("neck", Vector((0.02, -0.05, 1.0))),
        ("head", Vector((0.03, -0.05, 1.0))),
    ):
        targets[name] = native_segment(rig, name, current, direction, Vector((1.0, 0.0, 0.0)))
        current = targets[name][1]

    chest_top = targets["chest"][1]
    for side, sign, palm, hand_dir, shoulder_bias, bend_hint in (
        ("R", -1.0, firing_palm, (forward * 0.78 + right * 0.10 + up * 0.02), Vector((-1.0, 0.0, 0.0)), Vector((-1.0, -0.35, -0.55))),
        ("L", 1.0, support_palm, (forward * 0.80 - right * 0.08 + up * 0.03), Vector((1.0, 0.0, 0.0)), Vector((1.0, -0.35, -0.62))),
    ):
        clavicle_name = f"clavicle.{side}"
        targets[clavicle_name] = native_segment(rig, clavicle_name, chest_top, shoulder_bias + Vector((0.0, -0.10, -0.03)), up)
        shoulder = targets[clavicle_name][1]
        palm_name = f"palm.{side}"
        wrist_name = f"wrist.{side}"
        palm_length = rig.data.bones[palm_name].length
        wrist_length = rig.data.bones[wrist_name].length
        direction = hand_dir.normalized()
        palm_head = palm - direction * palm_length
        wrist_head = palm_head - direction * wrist_length
        upper_name = f"upper_arm.{side}"
        forearm_name = f"forearm.{side}"
        upper_length = rig.data.bones[upper_name].length
        forearm_length = rig.data.bones[forearm_name].length
        elbow = solve_two_bone(shoulder, wrist_head, upper_length, forearm_length, bend_hint)
        targets[upper_name] = native_segment(rig, upper_name, shoulder, elbow - shoulder, up)
        elbow = targets[upper_name][1]
        targets[forearm_name] = native_segment(rig, forearm_name, elbow, wrist_head - elbow, up)
        actual_wrist_head = targets[forearm_name][1]
        targets[wrist_name] = native_segment(rig, wrist_name, actual_wrist_head, palm_head - actual_wrist_head, up)
        actual_palm_head = targets[wrist_name][1]
        targets[palm_name] = native_segment(rig, palm_name, actual_palm_head, palm - actual_palm_head, up)

    # Firing wrap.  Each bone stays at native length; curves close around the
    # grip rather than reaching via scale.
    for digit, z_offset in (("middle", 0.042), ("ring", 0.008), ("pinky", -0.026)):
        names = [f"{digit}_0{index}.R" for index in range(1, 4)]
        lengths = [rig.data.bones[name].length for name in names]
        p0 = grip - right * 0.055 + up * z_offset
        directions = (
            (right * 0.78 + forward * 0.43 - up * 0.18).normalized(),
            (right * 0.62 - forward * 0.35 - up * 0.60).normalized(),
            (-right * 0.10 - forward * 0.52 - up * 0.85).normalized(),
        )
        points = [p0]
        for length, direction in zip(lengths, directions):
            points.append(points[-1] + direction * length)
        add_chain_targets(targets, rig, "R", digit, points, up)
    index_names = [f"index_0{index}.R" for index in range(1, 4)]
    index_lengths = [rig.data.bones[name].length for name in index_names]
    index_start = grip - right * 0.054 + forward * 0.004 + up * 0.087
    index_end = trigger - right * 0.004 + forward * 0.004
    add_chain_targets(targets, rig, "R", "index", fabrik_chain(index_start, index_end, index_lengths, up * 0.032 - forward * 0.010), up)
    thumb_names = [f"thumb_0{index}.R" for index in range(1, 4)]
    thumb_lengths = [rig.data.bones[name].length for name in thumb_names]
    thumb_start = grip - right * 0.048 - forward * 0.024 + up * 0.060
    thumb_end = grip + right * 0.032 - forward * 0.012 + up * 0.018
    add_chain_targets(targets, rig, "R", "thumb", fabrik_chain(thumb_start, thumb_end, thumb_lengths, -forward * 0.030 - up * 0.010), up)

    # Support wrap is mirrored around the foregrip, with a high opposed thumb.
    for digit, z_offset in (("index", 0.058), ("middle", 0.025), ("ring", -0.008), ("pinky", -0.038)):
        names = [f"{digit}_0{index}.L" for index in range(1, 4)]
        lengths = [rig.data.bones[name].length for name in names]
        p0 = foregrip + right * 0.055 + up * z_offset
        directions = (
            (-right * 0.78 + forward * 0.42 - up * 0.18).normalized(),
            (-right * 0.62 - forward * 0.34 - up * 0.61).normalized(),
            (right * 0.10 - forward * 0.50 - up * 0.86).normalized(),
        )
        points = [p0]
        for length, direction in zip(lengths, directions):
            points.append(points[-1] + direction * length)
        add_chain_targets(targets, rig, "L", digit, points, up)
    support_thumb_names = [f"thumb_0{index}.L" for index in range(1, 4)]
    support_thumb_lengths = [rig.data.bones[name].length for name in support_thumb_names]
    support_thumb_start = foregrip + right * 0.050 - forward * 0.022 + up * 0.065
    support_thumb_end = foregrip - right * 0.030 - forward * 0.012 + up * 0.025
    add_chain_targets(targets, rig, "L", "thumb", fabrik_chain(support_thumb_start, support_thumb_end, support_thumb_lengths, -forward * 0.028 - up * 0.008), up)

    landmarks = {
        "forward": base.rounded(forward),
        "right": base.rounded(right),
        "shoulderPad": base.rounded(shoulder_pad),
        "receiver": base.rounded(receiver),
        "grip": base.rounded(grip),
        "foregrip": base.rounded(foregrip),
        "trigger": base.rounded(trigger),
        "firingPalm": base.rounded(firing_palm),
        "supportPalm": base.rounded(support_palm),
    }
    return targets, landmarks


def pose_bone_to(rig: bpy.types.Object, name: str, head: Vector, tail: Vector, roll_hint: Vector) -> None:
    # Crucial rev2 invariant: orientation and translation only.  No scale enters
    # the hierarchy, so child deformation cannot amplify into spikes.
    pose_bone = rig.pose.bones[name]
    pose_bone.matrix = base.segment_matrix(head, tail, roll_hint)


base.build_armature = build_armature
base.auto_weight_body = auto_weight_body
base.build_pose_targets = build_pose_targets
base.pose_bone_to = pose_bone_to


def main() -> None:
    base.main()
    args = sys.argv[sys.argv.index("--") + 1 :]
    report_path = Path(args[2]).resolve()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["schema"] = "kyx-v6-contact-first-rig-author-report-v2"
    report["status"] = "EARLY_CONTACT_RIG_REV2_AUTHORED_VISUAL_REVIEW_REQUIRED"
    report["scope"] = "CONTACT_RIG_FOUNDATION_ONLY_CANDIDATE_REV2"
    report["rev2Corrections"] = {
        "rev1Preserved": True,
        "poseBoneScale": "forbidden; every posed bone remains unit scale",
        "restChains": "anatomically sized upper-arm, forearm, wrist, palm, all digit chains",
        "armSolve": "native-length analytic two-bone solve",
        "indexSolve": "native-length FABRIK endpoint at trigger surface",
        "distalWeights": json.loads(bpy.data.objects[f"{PREFIX}ContactFullBodyRig"]["deterministic_distal_weight_audit"]),
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
