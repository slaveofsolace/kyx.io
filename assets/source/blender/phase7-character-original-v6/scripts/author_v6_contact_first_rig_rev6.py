"""Rev6 diagnostic/contact proof using the reviewed V6-A base cage.

Rev5 showed that the saved level-3 Multires grids fold under the required arm
pose.  Rev6 preserves that Multires datablock but explicitly evaluates it at
level zero so the continuous 10,582-vertex V6-A base topology can prove or
disprove the rig/contact method without displacement-grid artifacts.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys

import bpy


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_rev5_base", HERE / "author_v6_contact_first_rig_rev5.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev5 authoring helpers")
rev5 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev5)

PREFIX = "V6CF6_"
rev5.PREFIX = PREFIX
rev5.rev4.PREFIX = PREFIX
rev5.rev4.rev3.PREFIX = PREFIX
rev5.rev4.rev3.rev2.PREFIX = PREFIX
rev5.rev4.rev3.rev2.base.PREFIX = PREFIX
ORIGINAL_BIND_BODY = rev5.bind_body


def bind_base_cage(body: bpy.types.Object, rig: bpy.types.Object) -> str:
    result = ORIGINAL_BIND_BODY(body, rig)
    multires = next(modifier for modifier in body.modifiers if modifier.type == "MULTIRES")
    multires.levels = 0
    multires.sculpt_levels = 0
    multires.render_levels = 0
    audit = json.loads(rig["deterministic_full_body_weight_audit"])
    audit["multiresEvaluation"] = {
        "datablockPreserved": True,
        "viewportLevels": multires.levels,
        "sculptLevels": multires.sculpt_levels,
        "renderLevels": multires.render_levels,
        "reason": "isolate continuous base-cage deformation from rev5 displacement-grid folding",
    }
    rig["deterministic_full_body_weight_audit"] = json.dumps(audit, sort_keys=True)
    return result + "+MULTIRES_LEVEL_ZERO"


rev5.rev4.rev3.rev2.base.auto_weight_body = bind_base_cage


def main() -> None:
    rev5.main()
    args = sys.argv[sys.argv.index("--") + 1 :]
    report_path = Path(args[2]).resolve()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    rig = bpy.data.objects[f"{PREFIX}ContactFullBodyRig"]
    report["schema"] = "kyx-v6-contact-first-rig-author-report-v6"
    report["status"] = "EARLY_CONTACT_RIG_REV6_BASE_CAGE_VISUAL_REVIEW_REQUIRED"
    report["scope"] = "CONTACT_RIG_FOUNDATION_ONLY_CANDIDATE_REV6"
    report["rev6Isolation"] = {
        "rev1ThroughRev5Preserved": True,
        "multires": json.loads(rig["deterministic_full_body_weight_audit"])["multiresEvaluation"],
        "poseAudit": json.loads(rig["native_y_track_pose_audit"]),
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
