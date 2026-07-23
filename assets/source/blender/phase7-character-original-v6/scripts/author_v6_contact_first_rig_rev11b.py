"""Rev11b micro-correction: align literal surfaces to rev11 evaluated skin."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_rev11_base", HERE / "author_v6_contact_first_rig_rev11.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev11 authoring helpers")
rev11 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev11)

PREFIX = "V6CF11B_"
rev11.PREFIX = PREFIX
rev11.rev10.PREFIX = PREFIX
rev11.rev10.rev9.PREFIX = PREFIX
rev11.rev10.rev9.rev8.PREFIX = PREFIX
rev11.rev10.rev9.rev8.rev7.PREFIX = PREFIX
rev11.rev10.rev9.rev8.rev7.rev5.PREFIX = PREFIX
rev11.rev10.rev9.rev8.rev7.rev5.rev4.PREFIX = PREFIX
rev11.rev10.rev9.rev8.rev7.rev5.rev4.rev3.PREFIX = PREFIX
rev11.rev10.rev9.rev8.rev7.rev5.rev4.rev3.rev2.PREFIX = PREFIX
base = rev11.base
base.PREFIX = PREFIX

FORWARD = Vector((0.220107, -0.975476, 0.0))
TRIGGER_SKIN_CONTACT = Vector((-0.1600969, -0.3991525, 1.1988127))
SHOULDER_BODY_REFERENCE = Vector((-0.185, -0.115, 1.365))
STOCK_PAD_CENTER = SHOULDER_BODY_REFERENCE + FORWARD * 0.044


def build_pose_targets():
    targets, landmarks = rev11.build_pose_targets()
    landmarks["triggerBoneTip"] = landmarks["trigger"]
    landmarks["trigger"] = base.rounded(TRIGGER_SKIN_CONTACT)
    landmarks["shoulderBodyReference"] = base.rounded(SHOULDER_BODY_REFERENCE)
    landmarks["shoulderPad"] = base.rounded(STOCK_PAD_CENTER)
    landmarks["rev11bCalibration"] = {
        "trigger": "rev11 evaluated index-family nearest surface vertex",
        "stockPad": "rear face at measured frontmost shoulder surface along rifle forward axis",
        "supportForegrip": "radius expanded by maximum measured four-digit gap",
    }
    return targets, landmarks


def build_rifle(collection: bpy.types.Collection, landmarks: dict[str, list[float]]):
    objects = rev11.build_rifle(collection, landmarks)
    foregrip = bpy.data.objects[f"{PREFIX}Rifle_ForegripContact"]
    # Rev11 radius is 0.030 * 1.17 = 0.0351 m.  Rev11b uses 0.045 m,
    # covering the measured 9.8 mm maximum four-digit skin gap.
    radius_factor = 0.045 / 0.0351
    foregrip.scale.x *= radius_factor
    foregrip.scale.y *= radius_factor
    return objects


base.build_pose_targets = build_pose_targets
base.build_rifle = build_rifle


def main() -> None:
    rev11.main()
    args = sys.argv[sys.argv.index("--") + 1 :]
    report_path = Path(args[2]).resolve()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    report["schema"] = "kyx-v6-contact-first-rig-author-report-v11b"
    report["status"] = "EARLY_CONTACT_RIG_REV11B_SURFACE_CALIBRATED_VISUAL_REVIEW_REQUIRED"
    report["scope"] = "CONTACT_RIG_FOUNDATION_ONLY_CANDIDATE_REV11B"
    report["rev11bCorrections"] = {
        "rev11Preserved": True,
        "triggerSurface": base.rounded(TRIGGER_SKIN_CONTACT),
        "stockPadCenter": base.rounded(STOCK_PAD_CENTER),
        "foregripRadiusMeters": 0.045,
        "automaticAcceptance": False,
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
