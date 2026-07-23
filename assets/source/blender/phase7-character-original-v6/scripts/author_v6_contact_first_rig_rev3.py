"""Rev3 contact-first proof: native Blender bone-axis solve plus assertions.

Rev1 (hierarchical scale failure) and rev2 (basis-axis failure) remain immutable
evidence.  Rev3 uses Blender's native local-Y tracking quaternion, asserts every
posed head/tail against its authored target before save, normalizes all weights,
and forces nonzero distal thumb participation.  No garment or armor is authored.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_rev2_base", HERE / "author_v6_contact_first_rig_rev2.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev2 authoring helpers")
rev2 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev2)

PREFIX = "V6CF3_"
rev2.PREFIX = PREFIX
rev2.base.PREFIX = PREFIX


def pose_bone_to(rig: bpy.types.Object, name: str, head: Vector, tail: Vector, roll_hint: Vector) -> None:
    direction = tail - head
    if direction.length < 1e-7:
        raise RuntimeError(f"Zero-length pose target for {name}")
    rotation = direction.normalized().to_track_quat("Y", "Z").to_matrix().to_4x4()
    rig.pose.bones[name].matrix = Matrix.Translation(head) @ rotation


def apply_pose_with_assertions(rig: bpy.types.Object, targets: dict[str, tuple[Vector, Vector, Vector]]) -> None:
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    ordered = ["spine_01", "spine_02", "chest", "neck", "head"]
    ordered += ["clavicle.R", "upper_arm.R", "forearm.R", "wrist.R", "palm.R"]
    ordered += ["clavicle.L", "upper_arm.L", "forearm.L", "wrist.L", "palm.L"]
    ordered += [name for name in targets if name not in ordered]
    # Convert desired armature-space matrices into matrix_basis using Blender's
    # own rest/parent conversion.  This avoids both the rev1 scale propagation
    # and the rev2 implicit-basis interpretation error.
    for name in ordered:
        target_head, target_tail, _roll = targets[name]
        direction = target_tail - target_head
        desired = Matrix.Translation(target_head) @ direction.normalized().to_track_quat("Y", "Z").to_matrix().to_4x4()
        pose_bone = rig.pose.bones[name]
        pose_bone.rotation_mode = "QUATERNION"
        bone = pose_bone.bone
        if pose_bone.parent is None:
            pose_bone.matrix_basis = bone.convert_local_to_pose(desired, bone.matrix_local, invert=True)
        else:
            pose_bone.matrix_basis = bone.convert_local_to_pose(
                desired,
                bone.matrix_local,
                parent_matrix=pose_bone.parent.matrix,
                parent_matrix_local=pose_bone.parent.bone.matrix_local,
                invert=True,
            )
        bpy.context.view_layer.update()
    action = bpy.data.actions.new(f"{PREFIX}ContactPose_Action")
    rig.animation_data_create()
    rig.animation_data.action = action
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 20
    bpy.context.scene.frame_set(1)
    # Key the same asserted basis at both endpoints without changing frames in
    # between; evaluation cannot replace the just-authored transforms.
    for name in ordered:
        bone = rig.pose.bones[name]
        for frame in (1, 20):
            bone.keyframe_insert(data_path="location", frame=frame, group=name)
            bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=name)
            bone.keyframe_insert(data_path="scale", frame=frame, group=name)
    bpy.context.view_layer.update()
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    failures = []
    maximum_head_error = 0.0
    maximum_tail_error = 0.0
    maximum_scale_error = 0.0
    for name, (target_head, target_tail, _roll) in targets.items():
        bone = rig.pose.bones[name]
        head_error = (bone.head - target_head).length
        tail_error = (bone.tail - target_tail).length
        scale_error = max(abs(float(value) - 1.0) for value in bone.scale)
        maximum_head_error = max(maximum_head_error, head_error)
        maximum_tail_error = max(maximum_tail_error, tail_error)
        maximum_scale_error = max(maximum_scale_error, scale_error)
        if head_error > 1e-4 or tail_error > 1e-4 or scale_error > 1e-5:
            failures.append({
                "bone": name,
                "headError": head_error,
                "tailError": tail_error,
                "scaleError": scale_error,
                "actualHead": [round(float(value), 6) for value in bone.head],
                "actualTail": [round(float(value), 6) for value in bone.tail],
                "targetHead": [round(float(value), 6) for value in target_head],
                "targetTail": [round(float(value), 6) for value in target_tail],
            })
    audit = {
        "targetCount": len(targets),
        "maximumHeadErrorMeters": maximum_head_error,
        "maximumTailErrorMeters": maximum_tail_error,
        "maximumScaleError": maximum_scale_error,
        "failures": failures,
    }
    rig["native_y_track_pose_audit"] = json.dumps(audit, sort_keys=True)
    if failures:
        raise RuntimeError("Native Y-track pose assertion failed: " + json.dumps(failures[:5]))
    bpy.ops.object.mode_set(mode="OBJECT")


ORIGINAL_REDISTRIBUTE = rev2.redistribute_distal_chain_weights


def redistribute_with_thumb_tips(body: bpy.types.Object, rig: bpy.types.Object) -> dict[str, object]:
    audit = ORIGINAL_REDISTRIBUTE(body, rig)
    for sign, side in ((-1.0, "R"), (1.0, "L")):
        thumb_names = [f"thumb_0{index}.{side}" for index in range(1, 4)]
        groups = [body.vertex_groups[name] for name in thumb_names]
        tail = rig.data.bones[thumb_names[-1]].tail_local
        candidates = []
        for vertex in body.data.vertices:
            coordinate = vertex.co
            if coordinate.x * sign <= 0.345 or not (0.805 <= coordinate.z <= 0.905) or coordinate.y > -0.105:
                continue
            family_weight = 0.0
            for membership in vertex.groups:
                if membership.group in {group.index for group in groups}:
                    family_weight += membership.weight
            if family_weight > 0.10:
                candidates.append(((coordinate - tail).length, vertex.index))
        chosen = [index for _distance, index in sorted(candidates)[:12]]
        for group in groups:
            group.remove(chosen)
        groups[1].add(chosen, 0.14, "REPLACE")
        groups[2].add(chosen, 0.86, "REPLACE")
        audit[side]["forcedThumb03Vertices"] = chosen
    return audit


def auto_weight_body(body: bpy.types.Object, rig: bpy.types.Object) -> str:
    result = rev2.ORIGINAL_AUTO_WEIGHT_BODY(body, rig)
    audit = redistribute_with_thumb_tips(body, rig)
    rig["deterministic_distal_weight_audit"] = json.dumps(audit, sort_keys=True)
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    return result + "+DETERMINISTIC_DISTAL_CHAINS+NORMALIZED"


rev2.base.pose_bone_to = pose_bone_to
rev2.base.apply_pose = apply_pose_with_assertions
rev2.base.auto_weight_body = auto_weight_body


def main() -> None:
    rev2.main()
    args = sys.argv[sys.argv.index("--") + 1 :]
    report_path = Path(args[2]).resolve()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    rig = bpy.data.objects[f"{PREFIX}ContactFullBodyRig"]
    report["schema"] = "kyx-v6-contact-first-rig-author-report-v3"
    report["status"] = "EARLY_CONTACT_RIG_REV3_AUTHORED_VISUAL_REVIEW_REQUIRED"
    report["scope"] = "CONTACT_RIG_FOUNDATION_ONLY_CANDIDATE_REV3"
    report["rev3Corrections"] = {
        "rev1AndRev2Preserved": True,
        "orientationMethod": "Vector.to_track_quat local Y, local Z up",
        "poseAudit": json.loads(rig["native_y_track_pose_audit"]),
        "distalWeightAudit": json.loads(rig["deterministic_distal_weight_audit"]),
        "weightNormalization": "all vertex groups normalized after deterministic distal assignment",
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
