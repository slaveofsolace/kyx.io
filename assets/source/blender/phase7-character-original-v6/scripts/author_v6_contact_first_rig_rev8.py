"""Rev8 contact-first proof: preserve digit geometry from corrective smoothing."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys

import bpy


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_rev7_base", HERE / "author_v6_contact_first_rig_rev7.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev7 authoring helpers")
rev7 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev7)

PREFIX = "V6CF8_"
rev7.PREFIX = PREFIX
rev7.rev5.PREFIX = PREFIX
rev7.rev5.rev4.PREFIX = PREFIX
rev7.rev5.rev4.rev3.PREFIX = PREFIX
rev7.rev5.rev4.rev3.rev2.PREFIX = PREFIX
base = rev7.base
base.PREFIX = PREFIX


def add_hand_preserving_corrective(body: bpy.types.Object, rig: bpy.types.Object) -> dict[str, object]:
    mask = body.vertex_groups.new(name=f"{PREFIX}CorrectiveMask")
    mask_count = 0
    excluded_hand_vertices = 0
    for vertex in body.data.vertices:
        point = vertex.co
        if not (0.82 <= point.z <= 1.52):
            continue
        if point.z < 1.0 and abs(point.x) > 0.33:
            excluded_hand_vertices += 1
            continue
        arm_factor = 0.0
        if 0.98 <= point.z <= 1.485:
            threshold = rev7.rev5.rev4.arm_threshold(point.z)
            arm_factor = rev7.rev5.rev4.smoothstep(threshold - 0.045, threshold + 0.030, abs(point.x))
        shoulder_factor = 0.28 * rev7.rev5.rev4.smoothstep(1.18, 1.32, point.z) * (1.0 - rev7.rev5.rev4.smoothstep(1.48, 1.54, point.z))
        weight = max(arm_factor, shoulder_factor)
        if weight > 0.01:
            mask.add([vertex.index], weight, "REPLACE")
            mask_count += 1
    corrective = body.modifiers.new(f"{PREFIX}RestBoundCorrectiveSmooth", "CORRECTIVE_SMOOTH")
    corrective.factor = 0.52
    corrective.iterations = 10
    corrective.smooth_type = "LENGTH_WEIGHTED"
    corrective.rest_source = "BIND"
    corrective.vertex_group = mask.name
    corrective.use_only_smooth = False
    corrective.scale = 1.0
    body.modifiers.move(body.modifiers.find(corrective.name), 1)
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
        "excludedHandVertices": excluded_hand_vertices,
        "handCorrectiveWeight": 0.0,
        "factor": corrective.factor,
        "iterations": corrective.iterations,
        "smoothType": corrective.smooth_type,
        "restSource": corrective.rest_source,
        "isBind": corrective.is_bind,
        "modifierStack": [{"index": index, "name": modifier.name, "type": modifier.type} for index, modifier in enumerate(body.modifiers)],
        "multiresLevels": {"viewport": multires.levels, "sculpt": multires.sculpt_levels, "render": multires.render_levels},
    }


rev7.add_corrective_stack = add_hand_preserving_corrective


def main() -> None:
    rev7.main()
    args = sys.argv[sys.argv.index("--") + 1 :]
    report_path = Path(args[2]).resolve()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    rig = bpy.data.objects[f"{PREFIX}ContactFullBodyRig"]
    report["schema"] = "kyx-v6-contact-first-rig-author-report-v8"
    report["status"] = "EARLY_CONTACT_RIG_REV8_HAND_PRESERVING_VISUAL_REVIEW_REQUIRED"
    report["scope"] = "CONTACT_RIG_FOUNDATION_ONLY_CANDIDATE_REV8"
    report["rev8Corrections"] = {
        "rev1ThroughRev7Preserved": True,
        "poseAudit": json.loads(rig["native_y_track_pose_audit"]),
        "fullBodyWeightAudit": json.loads(rig["deterministic_full_body_weight_audit"]),
        "distalAudit": json.loads(rig["deterministic_distal_weight_audit"]),
        "contactRenderScope": "authored for section-only presentation by paired rev8 renderer",
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
