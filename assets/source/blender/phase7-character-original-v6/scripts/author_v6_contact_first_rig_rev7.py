"""Rev7 contact-first proof with rest-bound corrective smoothing.

This revision preserves rev1-rev6 and builds on rev5's exact, rest-axial pose.
Digit-region vertices are constrained to one anatomical finger family, every
distal chain receives vertices from its own rest-space band, a corrective-smooth
modifier is bound before pose only over the upper-body deformation zone, and a
single Multires level follows correction.
"""

from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path
import sys

import bpy


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_rev5_for_rev7", HERE / "author_v6_contact_first_rig_rev5.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev5 authoring helpers")
rev5 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev5)

PREFIX = "V6CF7_"
rev5.PREFIX = PREFIX
rev5.rev4.PREFIX = PREFIX
rev5.rev4.rev3.PREFIX = PREFIX
rev5.rev4.rev3.rev2.PREFIX = PREFIX
base = rev5.rev4.rev3.rev2.base
base.PREFIX = PREFIX


DIGIT_CENTERS = {"index": -0.151, "middle": -0.126, "ring": -0.101, "pinky": -0.076}


def anatomical_family(point, sign: float) -> str:
    absolute_x = abs(point.x)
    if absolute_x < 0.390 and point.y < -0.137 and point.z > 0.835:
        return "thumb"
    return min(DIGIT_CENTERS, key=lambda name: abs(point.y - DIGIT_CENTERS[name]))


def constrain_digit_families(body: bpy.types.Object, rig: bpy.types.Object) -> dict[str, object]:
    audit: dict[str, object] = {}
    families = ("thumb", "index", "middle", "ring", "pinky")
    for sign, side in ((-1.0, "R"), (1.0, "L")):
        affected = []
        family_counts = {family: 0 for family in families}
        digit_group_names = [f"{family}_0{index}.{side}" for family in families for index in range(1, 4)]
        for vertex in body.data.vertices:
            point = vertex.co
            if point.x * sign <= 0.365 or not (0.775 <= point.z < 0.900):
                continue
            affected.append(vertex.index)
            for name in digit_group_names:
                body.vertex_groups[name].remove([vertex.index])
            family = anatomical_family(point, sign)
            family_counts[family] += 1
            names = [f"{family}_0{index}.{side}" for index in range(1, 4)]
            weights = rev5.rev4.nearest_segment_weights(point, rig, names, 0.010, 2)
            # Remove every non-digit influence in this distal region so the
            # deform sum remains exactly one and no palm/forearm smearing can
            # turn a finger into a ribbon.
            for group in body.vertex_groups:
                if group.name not in digit_group_names:
                    group.remove([vertex.index])
            for name, weight in weights.items():
                body.vertex_groups[name].add([vertex.index], weight, "REPLACE")
        audit[side] = {"affectedVertices": len(affected), "familyCounts": family_counts}
    return audit


def force_family_distals(body: bpy.types.Object, rig: bpy.types.Object) -> dict[str, list[int]]:
    forced: dict[str, list[int]] = {}
    for sign, side in ((-1.0, "R"), (1.0, "L")):
        for family in ("thumb", "index", "middle", "ring", "pinky"):
            distal_name = f"{family}_03.{side}"
            previous_name = f"{family}_02.{side}"
            distal = rig.data.bones[distal_name]
            candidates = []
            for vertex in body.data.vertices:
                point = vertex.co
                if point.x * sign <= 0.365 or not (0.775 <= point.z < 0.900):
                    continue
                if anatomical_family(point, sign) != family:
                    continue
                candidates.append((rev5.rev4.point_segment_distance(point, distal.head_local, distal.tail_local), vertex.index))
            selected = [index for _distance, index in sorted(candidates)[:6]]
            if len(selected) != 6:
                raise RuntimeError(f"Digit band has fewer than six distal vertices: {distal_name}")
            for group in body.vertex_groups:
                if group.name != f"{PREFIX}CorrectiveMask":
                    group.remove(selected)
            body.vertex_groups[previous_name].add(selected, 0.18, "REPLACE")
            body.vertex_groups[distal_name].add(selected, 0.82, "REPLACE")
            forced[distal_name] = selected
    return forced


def cross_family_audit(body: bpy.types.Object) -> dict[str, object]:
    failures = []
    checked = 0
    for sign, side in ((-1.0, "R"), (1.0, "L")):
        for vertex in body.data.vertices:
            point = vertex.co
            if point.x * sign <= 0.365 or not (0.775 <= point.z < 0.900):
                continue
            expected = anatomical_family(point, sign)
            checked += 1
            for membership in vertex.groups:
                name = body.vertex_groups[membership.group].name
                if not any(name.startswith(f"{family}_") for family in ("thumb", "index", "middle", "ring", "pinky")):
                    continue
                family = name.split("_", 1)[0]
                if family != expected and membership.weight > 1e-6:
                    failures.append({"vertex": vertex.index, "side": side, "expected": expected, "actual": name, "weight": membership.weight})
    return {"checkedVertices": checked, "crossFamilyAssignments": failures, "pass": not failures}


def add_corrective_stack(body: bpy.types.Object, rig: bpy.types.Object) -> dict[str, object]:
    mask = body.vertex_groups.new(name=f"{PREFIX}CorrectiveMask")
    mask_count = 0
    for vertex in body.data.vertices:
        point = vertex.co
        if not (0.74 <= point.z <= 1.52):
            continue
        arm_factor = 0.0
        if 0.775 <= point.z <= 1.485:
            threshold = rev5.rev4.arm_threshold(point.z)
            arm_factor = rev5.rev4.smoothstep(threshold - 0.045, threshold + 0.030, abs(point.x))
        shoulder_factor = 0.34 * rev5.rev4.smoothstep(1.18, 1.32, point.z) * (1.0 - rev5.rev4.smoothstep(1.48, 1.54, point.z))
        hand_reduction = 0.45 if point.z < 1.0 and abs(point.x) > 0.34 else 1.0
        weight = max(arm_factor, shoulder_factor) * hand_reduction
        if weight > 0.01:
            mask.add([vertex.index], weight, "REPLACE")
            mask_count += 1
    corrective = body.modifiers.new(f"{PREFIX}RestBoundCorrectiveSmooth", "CORRECTIVE_SMOOTH")
    corrective.factor = 0.62
    corrective.iterations = 12
    corrective.smooth_type = "LENGTH_WEIGHTED"
    corrective.rest_source = "BIND"
    corrective.vertex_group = mask.name
    corrective.use_only_smooth = False
    corrective.scale = 1.0
    source_index = body.modifiers.find(corrective.name)
    body.modifiers.move(source_index, 1)
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.correctivesmooth_bind(modifier=corrective.name)
    multires = next(modifier for modifier in body.modifiers if modifier.type == "MULTIRES")
    multires.levels = 1
    multires.sculpt_levels = 1
    multires.render_levels = 1
    return {
        "maskGroup": mask.name,
        "maskVertexCount": mask_count,
        "factor": corrective.factor,
        "iterations": corrective.iterations,
        "smoothType": corrective.smooth_type,
        "restSource": corrective.rest_source,
        "isBind": corrective.is_bind,
        "modifierStack": [{"index": index, "name": modifier.name, "type": modifier.type} for index, modifier in enumerate(body.modifiers)],
        "multiresLevels": {"viewport": multires.levels, "sculpt": multires.sculpt_levels, "render": multires.render_levels},
    }


def bind_body(body: bpy.types.Object, rig: bpy.types.Object) -> str:
    # Start from rev4's full deterministic assignment, not rev5's global distal
    # picker.  Rebuild the distal region within strict digit bands instead.
    audit = rev5.rev4.deterministic_body_weights(body, rig)
    armature_modifier = next(modifier for modifier in body.modifiers if modifier.type == "ARMATURE" and modifier.object == rig)
    body.modifiers.move(body.modifiers.find(armature_modifier.name), 0)
    family_audit = constrain_digit_families(body, rig)
    forced = force_family_distals(body, rig)
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    cross_audit = cross_family_audit(body)
    if not cross_audit["pass"]:
        raise RuntimeError("Cross-finger borrowing remains: " + json.dumps(cross_audit["crossFamilyAssignments"][:5]))
    corrective = add_corrective_stack(body, rig)
    audit.update({
        "digitFamilyConstraint": family_audit,
        "forcedDistalAssignments": forced,
        "crossFamilyAudit": cross_audit,
        "corrective": corrective,
        "armatureBeforeCorrectiveBeforeMultires": [item["type"] for item in corrective["modifierStack"][:3]] == ["ARMATURE", "CORRECTIVE_SMOOTH", "MULTIRES"],
    })
    rig["deterministic_full_body_weight_audit"] = json.dumps(audit, sort_keys=True)
    rig["deterministic_distal_weight_audit"] = json.dumps({
        "forcedDistalAssignments": forced,
        "crossFamilyAudit": cross_audit,
        "allTenDistalChainsNonzero": len(forced) == 10,
    }, sort_keys=True)
    return "DETERMINISTIC_DIGIT_FAMILIES+REST_BOUND_CORRECTIVE+MULTIRES_LEVEL_1"


def filtered_weight_inventory(body: bpy.types.Object, rig: bpy.types.Object) -> dict[str, object]:
    deform_names = {bone.name for bone in rig.data.bones if bone.use_deform}
    per_group = {name: 0 for name in deform_names}
    zero_vertices = 0
    minimum_sum = 1000.0
    maximum_sum = 0.0
    for vertex in body.data.vertices:
        total = 0.0
        for membership in vertex.groups:
            name = body.vertex_groups[membership.group].name
            if name not in deform_names:
                continue
            per_group[name] += 1
            total += membership.weight
        if total <= 1e-6:
            zero_vertices += 1
        minimum_sum = min(minimum_sum, total)
        maximum_sum = max(maximum_sum, total)
    return {
        "vertexCount": len(body.data.vertices),
        "groupCount": len(body.vertex_groups),
        "deformBoneCount": len(deform_names),
        "zeroWeightVertices": zero_vertices,
        "minimumWeightSum": round(minimum_sum, 6),
        "maximumWeightSum": round(maximum_sum, 6),
        "verticesPerGroup": {name: per_group[name] for name in sorted(deform_names)},
        "missingDeformGroups": sorted(name for name in deform_names if body.vertex_groups.get(name) is None),
        "nonDeformGroupsExcluded": sorted(group.name for group in body.vertex_groups if group.name not in deform_names),
    }


base.auto_weight_body = bind_body
base.weight_inventory = filtered_weight_inventory


def main() -> None:
    rev5.main()
    args = sys.argv[sys.argv.index("--") + 1 :]
    report_path = Path(args[2]).resolve()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    rig = bpy.data.objects[f"{PREFIX}ContactFullBodyRig"]
    report["schema"] = "kyx-v6-contact-first-rig-author-report-v7"
    report["status"] = "EARLY_CONTACT_RIG_REV7_CORRECTIVE_VISUAL_REVIEW_REQUIRED"
    report["scope"] = "CONTACT_RIG_FOUNDATION_ONLY_CANDIDATE_REV7"
    report["rev7Corrections"] = {
        "rev1ThroughRev6Preserved": True,
        "poseAudit": json.loads(rig["native_y_track_pose_audit"]),
        "fullBodyWeightAudit": json.loads(rig["deterministic_full_body_weight_audit"]),
        "distalAudit": json.loads(rig["deterministic_distal_weight_audit"]),
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
