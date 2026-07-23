"""Render rev8 with contact-specific section scopes and darker clay."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import bpy


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_render_rev7_base", HERE / "render_v6_contact_first_rig_rev7.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev7 render helpers")
rev7 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev7)

PREFIX = "V6CF8_"
rev7.PREFIX = PREFIX
rev7.rev5.PREFIX = PREFIX
rev7.rev5.rev4.PREFIX = PREFIX
rev7.rev5.rev4.rev3.PREFIX = PREFIX
rev7.rev5.rev4.rev3.rev2.PREFIX = PREFIX
render_base = rev7.render_base
render_base.PREFIX = PREFIX
render_base.EVIDENCE = render_base.OUTPUT_ROOT / "evidence" / "v6-contact-first-rig-rev8"
render_base.RENDERS = render_base.EVIDENCE / "renders"
render_base.REPORT = render_base.EVIDENCE / "render-report.json"
ORIGINAL_CONFIGURE = render_base.configure_scene
ORIGINAL_RENDER_VIEW = rev7.rev5.rev4.rev3.rev2.ORIGINAL_RENDER_VIEW
ORIGINAL_RENDER_BOARD = rev7.rev5.rev4.rev3.rev2.ORIGINAL_RENDER_BOARD


def configure_scene():
    scene = ORIGINAL_CONFIGURE()
    scene.view_settings.exposure = -0.48
    body = bpy.data.objects[render_base.BODY_NAME]
    clay = body.data.materials[0]
    clay.diffuse_color = (0.22, 0.055, 0.022, 1.0)
    bsdf = clay.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.22, 0.055, 0.022, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.58
    for obj in bpy.data.objects:
        if obj.type == "LIGHT" and obj.name.startswith(render_base.RENDER_PREFIX):
            obj.data.energy *= 0.62
    return scene


def rename_rev8(record: dict[str, object]) -> dict[str, object]:
    old_path = Path(record["path"])
    new_path = old_path.with_name(old_path.name.replace("rig-rev1", "rig-rev8"))
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


def render_view(*args, **kwargs):
    values = list(args)
    view_name = values[1]
    scope = set_contact_scope(view_name)
    if view_name in {
        "firing-palm-wrap-ortho",
        "firing-index-trigger-guard-ortho",
        "support-palm-foregrip-ortho",
        "support-hand-section-side",
    }:
        values[4] = min(float(values[4]), 0.335)
    if view_name == "stock-shoulder-tangent-ortho":
        values[4] = 0.40
    record = ORIGINAL_RENDER_VIEW(*values, **kwargs)
    record["contactScope"] = scope
    for obj in bpy.data.objects:
        if obj.name.startswith(f"{PREFIX}Rifle_"):
            obj.hide_render = False
    return rename_rev8(record)


def render_board(*args, **kwargs):
    return rename_rev8(ORIGINAL_RENDER_BOARD(*args, **kwargs))


render_base.configure_scene = configure_scene
render_base.render_view = render_view
render_base.render_board = render_board


def main() -> None:
    render_base.main()
    report = json.loads(render_base.REPORT.read_text(encoding="utf-8"))
    report["schema"] = "kyx-v6-contact-first-rig-render-report-v8"
    report["status"] = "EARLY_REV8_SECTIONED_VISUAL_PROOF_REVIEW_REQUIRED"
    report["rev8Invariant"] = "hands excluded from corrective; contact views contain only required rifle surfaces"
    render_base.REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
