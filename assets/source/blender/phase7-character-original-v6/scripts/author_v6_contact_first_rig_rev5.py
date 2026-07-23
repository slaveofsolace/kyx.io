"""Rev5 contact-first proof: pre-Multires deformation and rest axial chain.

Rev4 proved that zero heat weights alone were insufficient while the Armature
modifier followed level-3 Multires and the axial chain was posed.  Rev5 moves
the deterministic Armature modifier before Multires, holds spine/chest/neck/
head and clavicles at the reviewed V6-A rest pose, solves only the upper-arm,
forearm, wrist, palm, and digit contact chains, and forces distinct vertices
onto every distal phalanx while retaining per-vertex normalization.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_rev4_base", HERE / "author_v6_contact_first_rig_rev4.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev4 authoring helpers")
rev4 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev4)

PREFIX = "V6CF5_"
rev4.PREFIX = PREFIX
rev4.rev3.PREFIX = PREFIX
rev4.rev3.rev2.PREFIX = PREFIX
rev4.rev3.rev2.base.PREFIX = PREFIX
ORIGINAL_BUILD_POSE_TARGETS = rev4.rev3.rev2.build_pose_targets


def build_pose_targets() -> tuple[dict[str, tuple[Vector, Vector, Vector]], dict[str, list[float]]]:
    targets, landmarks = ORIGINAL_BUILD_POSE_TARGETS()
    rig = bpy.data.objects[f"{PREFIX}ContactFullBodyRig"]
    up = Vector((0.0, 0.0, 1.0))
    forward = Vector(landmarks["forward"])
    right = Vector(landmarks["right"])

    # Axial skeleton and clavicles remain exactly in the accepted V6-A rest
    # alignment.  No torso/head skin deformation is introduced in this proof.
    for name in ("spine_01", "spine_02", "chest", "neck", "head", "clavicle.R", "clavicle.L"):
        bone = rig.data.bones[name]
        targets[name] = (bone.head_local.copy(), bone.tail_local.copy(), Vector((1.0, 0.0, 0.0)))

    for side, palm, hand_direction, bend_hint in (
        ("R", Vector(landmarks["firingPalm"]), forward * 0.78 + right * 0.10 + up * 0.02, Vector((-1.0, -0.35, -0.55))),
        ("L", Vector(landmarks["supportPalm"]), forward * 0.80 - right * 0.08 + up * 0.03, Vector((1.0, -0.35, -0.62))),
    ):
        shoulder = rig.data.bones[f"clavicle.{side}"].tail_local.copy()
        palm_name = f"palm.{side}"
        wrist_name = f"wrist.{side}"
        direction = hand_direction.normalized()
        palm_head = palm - direction * rig.data.bones[palm_name].length
        wrist_head = palm_head - direction * rig.data.bones[wrist_name].length
        upper_name = f"upper_arm.{side}"
        forearm_name = f"forearm.{side}"
        elbow = rev4.rev3.rev2.solve_two_bone(
            shoulder,
            wrist_head,
            rig.data.bones[upper_name].length,
            rig.data.bones[forearm_name].length,
            bend_hint,
        )
        targets[upper_name] = rev4.rev3.rev2.native_segment(rig, upper_name, shoulder, elbow - shoulder, up)
        elbow = targets[upper_name][1]
        targets[forearm_name] = rev4.rev3.rev2.native_segment(rig, forearm_name, elbow, wrist_head - elbow, up)
        actual_wrist_head = targets[forearm_name][1]
        targets[wrist_name] = rev4.rev3.rev2.native_segment(rig, wrist_name, actual_wrist_head, palm_head - actual_wrist_head, up)
        actual_palm_head = targets[wrist_name][1]
        targets[palm_name] = rev4.rev3.rev2.native_segment(rig, palm_name, actual_palm_head, palm - actual_palm_head, up)
    return targets, landmarks


def force_distal_phalanx_assignments(body: bpy.types.Object, rig: bpy.types.Object) -> dict[str, object]:
    forced: dict[str, object] = {}
    for sign, side in ((-1.0, "R"), (1.0, "L")):
        used: set[int] = set()
        for family in ("thumb", "index", "middle", "ring", "pinky"):
            distal_name = f"{family}_03.{side}"
            previous_name = f"{family}_02.{side}"
            distal = rig.data.bones[distal_name]
            candidates = []
            for vertex in body.data.vertices:
                coordinate = vertex.co
                if coordinate.x * sign <= 0.355 or not (0.775 <= coordinate.z <= 0.910):
                    continue
                distance = rev4.point_segment_distance(coordinate, distal.head_local, distal.tail_local)
                candidates.append((distance, vertex.index))
            selected = []
            for _distance, vertex_index in sorted(candidates):
                if vertex_index in used:
                    continue
                selected.append(vertex_index)
                used.add(vertex_index)
                if len(selected) == 6:
                    break
            if len(selected) != 6:
                raise RuntimeError(f"Could not reserve six distal vertices for {distal_name}")
            for group in body.vertex_groups:
                group.remove(selected)
            body.vertex_groups[previous_name].add(selected, 0.18, "REPLACE")
            body.vertex_groups[distal_name].add(selected, 0.82, "REPLACE")
            forced[distal_name] = selected
    return forced


def bind_body(body: bpy.types.Object, rig: bpy.types.Object) -> str:
    audit = rev4.deterministic_body_weights(body, rig)
    forced = force_distal_phalanx_assignments(body, rig)
    armature_modifier = next(
        modifier for modifier in body.modifiers
        if modifier.type == "ARMATURE" and modifier.object == rig
    )
    source_index = body.modifiers.find(armature_modifier.name)
    body.modifiers.move(source_index, 0)
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    audit["forcedDistalAssignments"] = forced
    audit["modifierStack"] = [
        {"index": index, "name": modifier.name, "type": modifier.type}
        for index, modifier in enumerate(body.modifiers)
    ]
    audit["armatureBeforeMultires"] = (
        audit["modifierStack"][0]["type"] == "ARMATURE"
        and any(item["type"] == "MULTIRES" for item in audit["modifierStack"][1:])
    )
    rig["deterministic_full_body_weight_audit"] = json.dumps(audit, sort_keys=True)
    rig["deterministic_distal_weight_audit"] = json.dumps({
        "forcedDistalAssignments": forced,
        "allTenDistalChainsNonzero": all(len(indices) == 6 for indices in forced.values()),
    }, sort_keys=True)
    return "DETERMINISTIC_REGION_NEAREST_SEGMENT_NO_HEAT_PRE_MULTIRES"


rev4.rev3.rev2.base.build_pose_targets = build_pose_targets
rev4.rev3.rev2.base.auto_weight_body = bind_body


def main() -> None:
    rev4.main()
    args = sys.argv[sys.argv.index("--") + 1 :]
    report_path = Path(args[2]).resolve()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    rig = bpy.data.objects[f"{PREFIX}ContactFullBodyRig"]
    report["schema"] = "kyx-v6-contact-first-rig-author-report-v5"
    report["status"] = "EARLY_CONTACT_RIG_REV5_AUTHORED_VISUAL_REVIEW_REQUIRED"
    report["scope"] = "CONTACT_RIG_FOUNDATION_ONLY_CANDIDATE_REV5"
    report["rev5Corrections"] = {
        "rev1ThroughRev4Preserved": True,
        "axialAndClaviclePose": "reviewed V6-A rest",
        "movedPoseChains": "upper arms, forearms, wrists, palms, all digit chains only",
        "poseAudit": json.loads(rig["native_y_track_pose_audit"]),
        "fullBodyWeightAudit": json.loads(rig["deterministic_full_body_weight_audit"]),
        "distalAudit": json.loads(rig["deterministic_distal_weight_audit"]),
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
