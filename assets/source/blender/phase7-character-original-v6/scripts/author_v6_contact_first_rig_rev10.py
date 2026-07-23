"""Rev10: reachable support palm plus deliberately curled native digit chains."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_rev9_base", HERE / "author_v6_contact_first_rig_rev9.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev9 authoring helpers")
rev9 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev9)

PREFIX = "V6CF10_"
rev9.PREFIX = PREFIX
rev9.rev8.PREFIX = PREFIX
rev9.rev8.rev7.PREFIX = PREFIX
rev9.rev8.rev7.rev5.PREFIX = PREFIX
rev9.rev8.rev7.rev5.rev4.PREFIX = PREFIX
rev9.rev8.rev7.rev5.rev4.rev3.PREFIX = PREFIX
rev9.rev8.rev7.rev5.rev4.rev3.rev2.PREFIX = PREFIX
base = rev9.base
base.PREFIX = PREFIX


def solve_support_arm(targets: dict, rig: bpy.types.Object, palm: Vector, forward: Vector, right: Vector, up: Vector) -> None:
    helper = rev9.rev8.rev7.rev5.rev4.rev3.rev2
    side = "L"
    shoulder = rig.data.bones[f"clavicle.{side}"].tail_local.copy()
    direction = (forward * 0.80 - right * 0.08 + up * 0.03).normalized()
    palm_name = f"palm.{side}"
    wrist_name = f"wrist.{side}"
    palm_head = palm - direction * rig.data.bones[palm_name].length
    wrist_head = palm_head - direction * rig.data.bones[wrist_name].length
    upper_name = f"upper_arm.{side}"
    forearm_name = f"forearm.{side}"
    elbow = helper.solve_two_bone(
        shoulder,
        wrist_head,
        rig.data.bones[upper_name].length,
        rig.data.bones[forearm_name].length,
        Vector((1.0, -0.35, -0.62)),
    )
    targets[upper_name] = helper.native_segment(rig, upper_name, shoulder, elbow - shoulder, up)
    elbow = targets[upper_name][1]
    targets[forearm_name] = helper.native_segment(rig, forearm_name, elbow, wrist_head - elbow, up)
    actual_wrist_head = targets[forearm_name][1]
    targets[wrist_name] = helper.native_segment(rig, wrist_name, actual_wrist_head, palm_head - actual_wrist_head, up)
    actual_palm_head = targets[wrist_name][1]
    targets[palm_name] = helper.native_segment(rig, palm_name, actual_palm_head, palm - actual_palm_head, up)


def curled_chain(targets: dict, rig: bpy.types.Object, side: str, family: str, root: Vector, endpoint: Vector, forward: Vector) -> None:
    rev9.add_fabrik(targets, rig, side, family, root, endpoint, -forward * 0.050 + Vector((0.0, 0.0, -0.040)))


def build_pose_targets() -> tuple[dict[str, tuple[Vector, Vector, Vector]], dict[str, list[float]]]:
    targets, landmarks = rev9.rev8.rev7.rev5.build_pose_targets()
    rig = bpy.data.objects[f"{PREFIX}ContactFullBodyRig"]
    forward = Vector(landmarks["forward"])
    right = Vector(landmarks["right"])
    up = Vector((0.0, 0.0, 1.0))
    grip = Vector(landmarks["grip"])
    # The old support target exceeded the native chain reach.  Move the
    # foregrip 9 cm rearward on the same rifle axis and solve the arm exactly.
    foregrip = Vector(landmarks["foregrip"]) - forward * 0.090
    support_palm = foregrip + right * 0.050 + up * 0.038
    solve_support_arm(targets, rig, support_palm, forward, right, up)

    roots: dict[str, list[float]] = {}
    for family in ("middle", "ring", "pinky"):
        root = rev9.palm_mapped_root(rig, targets, "palm.R", f"{family}_01.R")
        roots[f"{family}.R"] = base.rounded(root)
        endpoint = grip + right * 0.015 + forward * 0.010 + Vector((0.0, 0.0, root.z - 0.025 - grip.z))
        curled_chain(targets, rig, "R", family, root, endpoint, forward)
    index_root = rev9.palm_mapped_root(rig, targets, "palm.R", "index_01.R")
    roots["index.R"] = base.rounded(index_root)
    firing_trigger = grip - right * 0.004 + forward * 0.014 + up * 0.030
    curled_chain(targets, rig, "R", "index", index_root, firing_trigger, forward)
    thumb_root = rev9.palm_mapped_root(rig, targets, "palm.R", "thumb_01.R")
    roots["thumb.R"] = base.rounded(thumb_root)
    rev9.add_fabrik(targets, rig, "R", "thumb", thumb_root, grip - right * 0.018 - forward * 0.016 + up * 0.010, forward * 0.038 + up * 0.018)

    for family in ("index", "middle", "ring", "pinky"):
        root = rev9.palm_mapped_root(rig, targets, "palm.L", f"{family}_01.L")
        roots[f"{family}.L"] = base.rounded(root)
        endpoint = foregrip - right * 0.015 + forward * 0.010 + Vector((0.0, 0.0, root.z - 0.025 - foregrip.z))
        curled_chain(targets, rig, "L", family, root, endpoint, forward)
    support_thumb_root = rev9.palm_mapped_root(rig, targets, "palm.L", "thumb_01.L")
    roots["thumb.L"] = base.rounded(support_thumb_root)
    rev9.add_fabrik(targets, rig, "L", "thumb", support_thumb_root, foregrip + right * 0.018 - forward * 0.016 + up * 0.012, forward * 0.038 + up * 0.018)

    landmarks["grip"] = base.rounded(grip)
    landmarks["foregrip"] = base.rounded(foregrip)
    landmarks["trigger"] = base.rounded(targets["index_03.R"][1])
    landmarks["supportPalm"] = base.rounded(support_palm)
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
    objects.append(base.box_mesh(f"{PREFIX}Rifle_GripContact", grip, (0.044, 0.052, 0.170), right, forward, collection, contact, 0.008))
    objects.append(base.cylinder_between(f"{PREFIX}Rifle_ForegripContact", foregrip + up * 0.096, foregrip - up * 0.096, 0.030, collection, contact, 40))
    stock_start = shoulder + forward * 0.025
    stock_end = receiver - forward * 0.125
    objects.append(base.cylinder_between(f"{PREFIX}Rifle_StockBeam", stock_start, stock_end, 0.030, collection, metal, 32))
    objects.append(base.box_mesh(f"{PREFIX}Rifle_StockPadContact", shoulder, (0.115, 0.030, 0.165), right, forward, collection, contact, 0.010))
    barrel_start = receiver + forward * 0.19 + up * 0.018
    barrel_end = receiver + forward * 0.80 + up * 0.018
    objects.append(base.cylinder_between(f"{PREFIX}Rifle_Barrel", barrel_start, barrel_end, 0.021, collection, metal, 36))
    objects.append(base.cylinder_between(f"{PREFIX}Rifle_Muzzle", barrel_end - forward * 0.055, barrel_end + forward * 0.015, 0.032, collection, metal, 36))
    objects.append(base.cylinder_between(f"{PREFIX}Rifle_Trigger", trigger - up * 0.018 - forward * 0.003, trigger + up * 0.018 + forward * 0.003, 0.0055, collection, trigger_mat, 24))
    guard_points = [trigger - forward * 0.040 + up * 0.034, trigger - forward * 0.034 - up * 0.030, trigger + forward * 0.050 - up * 0.033, trigger + forward * 0.056 + up * 0.033]
    objects.append(base.curve_tube(f"{PREFIX}Rifle_TriggerGuard", guard_points, 0.006, collection, guard_mat))
    objects.append(base.box_mesh(f"{PREFIX}Rifle_ForegripHandStop", foregrip + forward * 0.047 + up * 0.075, (0.090, 0.018, 0.045), right, forward, collection, guard_mat, 0.005))
    return objects


base.build_pose_targets = build_pose_targets
base.build_rifle = build_rifle


def main() -> None:
    rev9.main()
    args = sys.argv[sys.argv.index("--") + 1 :]
    report_path = Path(args[2]).resolve()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    rig = bpy.data.objects[f"{PREFIX}ContactFullBodyRig"]
    report["schema"] = "kyx-v6-contact-first-rig-author-report-v10"
    report["status"] = "EARLY_CONTACT_RIG_REV10_REACHABLE_CURLED_VISUAL_REVIEW_REQUIRED"
    report["scope"] = "CONTACT_RIG_FOUNDATION_ONLY_CANDIDATE_REV10"
    report["rev10Corrections"] = {
        "rev1ThroughRev9Preserved": True,
        "supportArm": "foregrip moved rearward on rifle axis and native-length arm re-solved to reachable palm",
        "digitChains": "palm-mapped roots with deliberately slack FABRIK endpoints for visible curl",
        "poseAudit": json.loads(rig["native_y_track_pose_audit"]),
        "weightAudit": json.loads(rig["deterministic_full_body_weight_audit"]),
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
