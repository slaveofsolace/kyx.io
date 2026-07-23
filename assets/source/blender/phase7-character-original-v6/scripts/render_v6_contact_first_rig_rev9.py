"""Render rev9 continuous-palm hand solve with oblique contact cameras."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_render_rev8_base", HERE / "render_v6_contact_first_rig_rev8.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev8 render helpers")
rev8 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev8)

PREFIX = "V6CF9_"
rev8.PREFIX = PREFIX
rev8.rev7.PREFIX = PREFIX
rev8.rev7.rev5.PREFIX = PREFIX
rev8.rev7.rev5.rev4.PREFIX = PREFIX
rev8.rev7.rev5.rev4.rev3.PREFIX = PREFIX
rev8.rev7.rev5.rev4.rev3.rev2.PREFIX = PREFIX
render_base = rev8.render_base
render_base.PREFIX = PREFIX
render_base.EVIDENCE = render_base.OUTPUT_ROOT / "evidence" / "v6-contact-first-rig-rev9"
render_base.RENDERS = render_base.EVIDENCE / "renders"
render_base.REPORT = render_base.EVIDENCE / "render-report.json"
ORIGINAL_RENDER_VIEW = rev8.ORIGINAL_RENDER_VIEW
ORIGINAL_RENDER_BOARD = rev8.ORIGINAL_RENDER_BOARD

FORWARD = Vector((0.220107, -0.975476, 0.0))
RIGHT = Vector((0.975476, 0.220107, 0.0))
UP = Vector((0.0, 0.0, 1.0))
GRIP = Vector((-0.118968, -0.407643, 1.165))
TRIGGER = Vector((-0.139703, -0.414059, 1.214075))
FOREGRIP = Vector((-0.049634, -0.714917, 1.190))
SHOULDER = Vector((-0.185, -0.115, 1.365))


def rename_rev9(record: dict[str, object]) -> dict[str, object]:
    old_path = Path(record["path"])
    new_path = old_path.with_name(old_path.name.replace("rig-rev1", "rig-rev9"))
    if old_path != new_path:
        old_path.replace(new_path)
    record["path"] = str(new_path)
    record["bytes"] = new_path.stat().st_size
    record["sha256"] = render_base.sha256(new_path)
    return record


def set_contact_scope(view_name: str) -> dict[str, object]:
    weapon_objects = [obj for obj in bpy.data.objects if obj.name.startswith(f"{PREFIX}Rifle_")]
    for obj in weapon_objects:
        obj.hide_render = False
    keep: set[str] | None = None
    if view_name == "firing-palm-wrap-ortho":
        keep = {f"{PREFIX}Rifle_GripContact"}
    elif view_name == "firing-index-trigger-guard-ortho":
        keep = {f"{PREFIX}Rifle_GripContact", f"{PREFIX}Rifle_Trigger", f"{PREFIX}Rifle_TriggerGuard"}
    elif view_name in ("support-palm-foregrip-ortho", "support-hand-section-side"):
        keep = {f"{PREFIX}Rifle_ForegripContact", f"{PREFIX}Rifle_ForegripHandStop"}
    elif view_name == "stock-shoulder-tangent-ortho":
        keep = {f"{PREFIX}Rifle_StockPadContact", f"{PREFIX}Rifle_StockBeam"}
    if keep is not None:
        for obj in weapon_objects:
            obj.hide_render = obj.name not in keep
    return {"view": view_name, "keptWeaponObjects": sorted(keep) if keep is not None else "all"}


def contact_camera(view_name: str, location: Vector, target: Vector, scale: float) -> tuple[Vector, Vector, float, str | None]:
    note = None
    if view_name == "firing-palm-wrap-ortho":
        location = GRIP + RIGHT * 0.72 + FORWARD * 0.62 + UP * 0.18
        target = GRIP + UP * 0.025
        scale = 0.285
        note = "OBLIQUE ACROSS GRIP • CONTINUOUS PALM ROOTS + MIDDLE/RING/PINKY WRAP"
    elif view_name == "firing-index-trigger-guard-ortho":
        location = TRIGGER + RIGHT * 0.88 - FORWARD * 0.22 + UP * 0.12
        target = TRIGGER
        scale = 0.245
        note = "OBLIQUE RIFLE-RIGHT • INDEX TIP / TRIGGER / GUARD CLEARANCE"
    elif view_name == "support-palm-foregrip-ortho":
        location = FOREGRIP - RIGHT * 0.72 + FORWARD * 0.58 + UP * 0.16
        target = FOREGRIP + UP * 0.012
        scale = 0.285
        note = "OBLIQUE RIFLE-LEFT • SUPPORT PALM / FOUR-DIGIT FOREGRIP WRAP"
    elif view_name == "support-hand-section-side":
        location = FOREGRIP + RIGHT * 0.68 + FORWARD * 0.44 + UP * 0.10
        target = FOREGRIP + UP * 0.010
        scale = 0.275
        note = "OPPOSING OBLIQUE • SUPPORT THUMB / DIGITS / WRIST CONTINUITY"
    elif view_name == "stock-shoulder-tangent-ortho":
        location = SHOULDER + RIGHT * 0.88 + FORWARD * 0.30 + UP * 0.12
        target = SHOULDER
        scale = 0.39
        note = "OBLIQUE STOCK PAD • SHOULDER-POCKET SURFACE TANGENCY"
    return location, target, scale, note


def render_view(*args, **kwargs):
    values = list(args)
    view_name = values[1]
    scope = set_contact_scope(view_name)
    location, target, scale, note = contact_camera(view_name, Vector(values[2]), Vector(values[3]), float(values[4]))
    values[2] = location
    values[3] = target
    values[4] = scale
    if note is not None:
        values[5] = note
    record = ORIGINAL_RENDER_VIEW(*values, **kwargs)
    record["contactScope"] = scope
    if note is not None:
        record["cameraContract"] = "oblique transverse view prevents bore-axis hand overlap"
    for obj in bpy.data.objects:
        if obj.name.startswith(f"{PREFIX}Rifle_"):
            obj.hide_render = False
    return rename_rev9(record)


def render_board(*args, **kwargs):
    return rename_rev9(ORIGINAL_RENDER_BOARD(*args, **kwargs))


render_base.render_view = render_view
render_base.render_board = render_board


def main() -> None:
    render_base.main()
    report = json.loads(render_base.REPORT.read_text(encoding="utf-8"))
    report["schema"] = "kyx-v6-contact-first-rig-render-report-v9"
    report["status"] = "EARLY_REV9_CONTINUOUS_ROOT_VISUAL_PROOF_REVIEW_REQUIRED"
    report["rev9Invariant"] = "digit roots derive from palm deformation; contact cameras are oblique transverse"
    render_base.REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
