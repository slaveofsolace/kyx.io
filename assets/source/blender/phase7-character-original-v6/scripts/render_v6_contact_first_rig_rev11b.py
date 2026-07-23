"""Render rev11b calibrated contact surfaces with tighter isolation."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_render_rev11_base", HERE / "render_v6_contact_first_rig_rev11.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev11 render helpers")
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
render_base = rev11.render_base
render_base.PREFIX = PREFIX
render_base.EVIDENCE = render_base.OUTPUT_ROOT / "evidence" / "v6-contact-first-rig-rev11b"
render_base.RENDERS = render_base.EVIDENCE / "renders"
render_base.REPORT = render_base.EVIDENCE / "render-report.json"

FORWARD = Vector((0.220107, -0.975476, 0.0))
RIGHT = Vector((0.975476, 0.220107, 0.0))
UP = Vector((0.0, 0.0, 1.0))
GRIP = Vector((-0.113465, -0.432030, 1.165))
TRIGGER = Vector((-0.160097, -0.399152, 1.198813))
FOREGRIP = Vector((-0.048834, -0.627599, 1.190))
SHOULDER_BODY = Vector((-0.185, -0.115, 1.365))
SHOULDER_PAD = Vector((-0.175315, -0.157921, 1.365))
rev11.rev10.rev9.GRIP = GRIP
rev11.rev10.rev9.TRIGGER = TRIGGER
rev11.rev10.rev9.FOREGRIP = FOREGRIP


def set_contact_scope(view_name: str) -> dict[str, object]:
    objects = [obj for obj in bpy.data.objects if obj.name.startswith(f"{PREFIX}Rifle_")]
    for obj in objects:
        obj.hide_render = False
    keep = None
    if view_name == "firing-palm-wrap-ortho":
        keep = {f"{PREFIX}Rifle_GripContact"}
    elif view_name == "firing-index-trigger-guard-ortho":
        keep = {f"{PREFIX}Rifle_Trigger", f"{PREFIX}Rifle_TriggerGuard"}
    elif view_name in ("support-palm-foregrip-ortho", "support-hand-section-side"):
        keep = {f"{PREFIX}Rifle_ForegripContact"}
    elif view_name == "stock-shoulder-tangent-ortho":
        keep = {f"{PREFIX}Rifle_StockPadContact"}
    if keep is not None:
        for obj in objects:
            obj.hide_render = obj.name not in keep
    return {"view": view_name, "keptWeaponObjects": sorted(keep) if keep is not None else "all"}


def contact_camera(view_name: str, location: Vector, target: Vector, scale: float):
    note = None
    if view_name == "firing-palm-wrap-ortho":
        location = GRIP + RIGHT * 0.68 + FORWARD * 0.12 + UP * 0.38
        target = GRIP + UP * 0.010
        scale = 0.190
        note = "TRANSLUCENT GRIP SECTION • FIRING PALM + THREE CURLED DIGITS"
    elif view_name == "firing-index-trigger-guard-ortho":
        location = TRIGGER - RIGHT * 0.74 - FORWARD * 0.16 - UP * 0.035
        target = TRIGGER
        scale = 0.165
        note = "ISOLATED TRIGGER SECTION • INDEX SKIN ON GOLD TRIGGER INSIDE GUARD"
    elif view_name == "support-palm-foregrip-ortho":
        location = FOREGRIP - RIGHT * 0.66 + FORWARD * 0.13 + UP * 0.39
        target = FOREGRIP + UP * 0.006
        scale = 0.205
        note = "TRANSLUCENT FOREGRIP • SUPPORT PALM + FOUR-DIGIT WRAP"
    elif view_name == "support-hand-section-side":
        location = FOREGRIP + RIGHT * 0.47 + FORWARD * 0.42 + UP * 0.16
        target = FOREGRIP
        scale = 0.195
        note = "OPPOSING TRANSLUCENT SECTION • FOUR SUPPORT DIGITS"
    elif view_name == "stock-shoulder-tangent-ortho":
        location = SHOULDER_BODY - RIGHT * 0.90 + UP * 0.015
        target = (SHOULDER_BODY + SHOULDER_PAD) * 0.5
        scale = 0.245
        note = "TRANSLUCENT PAD SECTION • REAR FACE ON SHOULDER SURFACE"
    return location, target, scale, note


def rename_rev11b(record: dict[str, object]) -> dict[str, object]:
    old_path = Path(record["path"])
    new_path = old_path.with_name(old_path.name.replace("rig-rev1", "rig-rev11b"))
    if old_path != new_path:
        old_path.replace(new_path)
    record["path"] = str(new_path)
    record["bytes"] = new_path.stat().st_size
    record["sha256"] = render_base.sha256(new_path)
    return record


BASE_RENDER_VIEW = rev11.rev10.rev9.render_view
BASE_IMAGE_MATERIAL = render_base.image_material


def image_material(name: str, path: Path):
    value = BASE_IMAGE_MATERIAL(name, path)
    for node in value.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image is not None:
            node.image.reload()
    return value


def set_material_alpha(obj: bpy.types.Object, alpha: float) -> list[tuple[bpy.types.Material, float]]:
    prior = []
    for material in obj.data.materials:
        if material is None or not material.use_nodes:
            continue
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        prior.append((material, float(bsdf.inputs["Alpha"].default_value)))
        bsdf.inputs["Alpha"].default_value = alpha
        material.diffuse_color = (*material.diffuse_color[:3], alpha)
        if hasattr(material, "surface_render_method"):
            material.surface_render_method = "DITHERED"
            material.use_transparency_overlap = False
    return prior


def render_view(*args, **kwargs):
    view_name = args[1]
    faded = []
    if view_name == "firing-palm-wrap-ortho":
        faded += set_material_alpha(bpy.data.objects[f"{PREFIX}Rifle_GripContact"], 0.28)
    elif view_name in ("support-palm-foregrip-ortho", "support-hand-section-side"):
        faded += set_material_alpha(bpy.data.objects[f"{PREFIX}Rifle_ForegripContact"], 0.24)
    elif view_name == "stock-shoulder-tangent-ortho":
        faded += set_material_alpha(bpy.data.objects[f"{PREFIX}Rifle_StockPadContact"], 0.48)
    try:
        record = BASE_RENDER_VIEW(*args, **kwargs)
        if faded:
            record["transparentContactSurface"] = True
        return record
    finally:
        for material, alpha in faded:
            bsdf = material.node_tree.nodes.get("Principled BSDF")
            bsdf.inputs["Alpha"].default_value = alpha
            material.diffuse_color = (*material.diffuse_color[:3], alpha)


render_base.configure_scene = rev11.configure_scene
render_base.image_material = image_material
rev11.rev10.rev9.set_contact_scope = set_contact_scope
rev11.rev10.rev9.contact_camera = contact_camera
rev11.rev10.rev9.rename_rev9 = rename_rev11b
render_base.render_view = render_view
render_base.render_board = rev11.rev10.rev9.render_board


def main() -> None:
    rev11.main()
    report = json.loads(render_base.REPORT.read_text(encoding="utf-8"))
    report["schema"] = "kyx-v6-contact-first-rig-render-report-v11b"
    report["status"] = "EARLY_REV11B_SURFACE_CALIBRATED_VISUAL_PROOF_REVIEW_REQUIRED"
    report["rev11bInvariant"] = "trigger/grip/foregrip/pad are isolated per view and cameras crop the non-contact hand"
    render_base.REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
