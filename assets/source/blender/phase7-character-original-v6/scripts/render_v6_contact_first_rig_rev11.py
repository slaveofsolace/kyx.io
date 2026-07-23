"""Render rev11 with high-contrast contact surfaces and transverse cameras."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_render_rev10_base", HERE / "render_v6_contact_first_rig_rev10.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev10 render helpers")
rev10 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev10)

PREFIX = "V6CF11_"
rev10.PREFIX = PREFIX
rev10.rev9.PREFIX = PREFIX
rev10.rev9.rev8.PREFIX = PREFIX
rev10.rev9.rev8.rev7.PREFIX = PREFIX
rev10.rev9.rev8.rev7.rev5.PREFIX = PREFIX
rev10.rev9.rev8.rev7.rev5.rev4.PREFIX = PREFIX
rev10.rev9.rev8.rev7.rev5.rev4.rev3.PREFIX = PREFIX
rev10.rev9.rev8.rev7.rev5.rev4.rev3.rev2.PREFIX = PREFIX
render_base = rev10.render_base
render_base.PREFIX = PREFIX
render_base.EVIDENCE = render_base.OUTPUT_ROOT / "evidence" / "v6-contact-first-rig-rev11"
render_base.RENDERS = render_base.EVIDENCE / "renders"
render_base.REPORT = render_base.EVIDENCE / "render-report.json"

FORWARD = Vector((0.220107, -0.975476, 0.0))
RIGHT = Vector((0.975476, 0.220107, 0.0))
UP = Vector((0.0, 0.0, 1.0))
GRIP = Vector((-0.113465, -0.432030, 1.165))
TRIGGER = Vector((-0.143222, -0.413064, 1.216229))
FOREGRIP = Vector((-0.048834, -0.627599, 1.190))
SHOULDER = Vector((-0.185, -0.115, 1.365))
rev10.rev9.GRIP = GRIP
rev10.rev9.TRIGGER = TRIGGER
rev10.rev9.FOREGRIP = FOREGRIP

ORIGINAL_CONFIGURE = render_base.configure_scene
ORIGINAL_SCOPE = rev10.rev9.set_contact_scope


def configure_scene():
    scene = ORIGINAL_CONFIGURE()
    contact_mat = render_base.material(f"{render_base.RENDER_PREFIX}Rev11ContactCyan", (0.015, 0.45, 0.78, 1.0), metallic=0.42, roughness=0.24, emission=0.42)
    pad_mat = render_base.material(f"{render_base.RENDER_PREFIX}Rev11PadMagenta", (0.90, 0.035, 0.30, 1.0), metallic=0.22, roughness=0.26, emission=0.55)
    trigger_mat = render_base.material(f"{render_base.RENDER_PREFIX}Rev11TriggerGold", (1.0, 0.56, 0.02, 1.0), metallic=0.52, roughness=0.20, emission=0.58)
    guard_mat = render_base.material(f"{render_base.RENDER_PREFIX}Rev11GuardBlue", (0.02, 0.80, 1.0, 1.0), metallic=0.56, roughness=0.18, emission=0.40)
    for suffix in ("GripContact", "ForegripContact"):
        render_base.assign(bpy.data.objects[f"{PREFIX}Rifle_{suffix}"], contact_mat)
    render_base.assign(bpy.data.objects[f"{PREFIX}Rifle_StockPadContact"], pad_mat)
    render_base.assign(bpy.data.objects[f"{PREFIX}Rifle_Trigger"], trigger_mat)
    render_base.assign(bpy.data.objects[f"{PREFIX}Rifle_TriggerGuard"], guard_mat)
    return scene


def set_contact_scope(view_name: str) -> dict[str, object]:
    record = ORIGINAL_SCOPE(view_name)
    if view_name == "stock-shoulder-tangent-ortho":
        keep = {f"{PREFIX}Rifle_StockPadContact"}
        for obj in bpy.data.objects:
            if obj.name.startswith(f"{PREFIX}Rifle_"):
                obj.hide_render = obj.name not in keep
        record["keptWeaponObjects"] = sorted(keep)
    return record


def contact_camera(view_name: str, location: Vector, target: Vector, scale: float):
    note = None
    if view_name == "firing-palm-wrap-ortho":
        location = GRIP + RIGHT * 0.72 + FORWARD * 0.18 + UP * 0.48
        target = GRIP + UP * 0.018
        scale = 0.255
        note = "TRANSVERSE 3Q • FIRING PALM + EXPLICIT MIDDLE/RING/PINKY CURL"
    elif view_name == "firing-index-trigger-guard-ortho":
        location = TRIGGER + RIGHT * 0.86 - FORWARD * 0.14 + UP * 0.08
        target = TRIGGER
        scale = 0.215
        note = "TRIGGER SECTION • INDEX TIP ON GOLD TRIGGER INSIDE CYAN GUARD"
    elif view_name == "support-palm-foregrip-ortho":
        location = FOREGRIP - RIGHT * 0.70 + FORWARD * 0.20 + UP * 0.46
        target = FOREGRIP + UP * 0.008
        scale = 0.255
        note = "TRANSVERSE 3Q • SUPPORT PALM + FOUR-DIGIT FOREGRIP CURL"
    elif view_name == "support-hand-section-side":
        location = FOREGRIP + RIGHT * 0.54 + FORWARD * 0.48 + UP * 0.22
        target = FOREGRIP + UP * 0.005
        scale = 0.245
        note = "OPPOSING SECTION • SUPPORT THUMB / FOUR DIGITS / WRIST"
    elif view_name == "stock-shoulder-tangent-ortho":
        location = SHOULDER + RIGHT * 0.94 + FORWARD * 0.035 + UP * 0.035
        target = SHOULDER
        scale = 0.285
        note = "PURE SIDE SECTION • MAGENTA STOCK PAD / SHOULDER TANGENCY"
    return location, target, scale, note


def rename_rev11(record: dict[str, object]) -> dict[str, object]:
    old_path = Path(record["path"])
    new_path = old_path.with_name(old_path.name.replace("rig-rev1", "rig-rev11"))
    if old_path != new_path:
        old_path.replace(new_path)
    record["path"] = str(new_path)
    record["bytes"] = new_path.stat().st_size
    record["sha256"] = render_base.sha256(new_path)
    return record


render_base.configure_scene = configure_scene
rev10.rev9.set_contact_scope = set_contact_scope
rev10.rev9.contact_camera = contact_camera
rev10.rev9.rename_rev9 = rename_rev11
render_base.render_view = rev10.rev9.render_view
render_base.render_board = rev10.rev9.render_board


def main() -> None:
    rev10.main()
    report = json.loads(render_base.REPORT.read_text(encoding="utf-8"))
    report["schema"] = "kyx-v6-contact-first-rig-render-report-v11"
    report["status"] = "EARLY_REV11_EXPLICIT_CURL_VISUAL_PROOF_REVIEW_REQUIRED"
    report["rev11Invariant"] = "high-contrast isolated contact surfaces; direct native-length curls; stock pad-only side section"
    render_base.REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
