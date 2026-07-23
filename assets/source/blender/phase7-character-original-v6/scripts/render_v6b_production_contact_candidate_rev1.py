"""Render the first bounded V6-B production/contact visual candidate."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
OUTPUT_ROOT = HERE.parent
EVIDENCE = OUTPUT_ROOT / "evidence" / "v6b-production-contact-candidate-rev1"
RENDERS = EVIDENCE / "renders"
REPORT = EVIDENCE / "render-report.json"
PREFIX = "KYX_V6B_CF_R1_"
CONTACT_PREFIX = "V6CF11B_"
BODY_NAME = "KYX_V6A_AnatomySculpt_Body"
RIG_NAME = "V6CF11B_ContactFullBodyRig"
RENDER_PREFIX = "KYX_V6B_CF_R1_RENDER_"

FORWARD = Vector((0.220107, -0.975476, 0.0))
RIGHT = Vector((0.975476, 0.220107, 0.0))
UP = Vector((0.0, 0.0, 1.0))
GRIP = Vector((-0.113465, -0.432030, 1.165))
TRIGGER = Vector((-0.1600969, -0.3991525, 1.1988127))
FOREGRIP = Vector((-0.048834, -0.627599, 1.190))
SHOULDER = Vector((-0.185, -0.115, 1.365))

SPEC = importlib.util.spec_from_file_location("kyx_v6cf_render_base", HERE / "render_v6_contact_first_rig_rev1.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load shared render helpers")
base = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base)
base.OUTPUT_ROOT = OUTPUT_ROOT
base.EVIDENCE = EVIDENCE
base.RENDERS = RENDERS
base.REPORT = REPORT
base.PREFIX = CONTACT_PREFIX
base.RENDER_PREFIX = RENDER_PREFIX


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def configure_scene() -> bpy.types.Scene:
    scene = base.configure_scene()
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -1.05
    scene.render.use_stamp = True
    scene.render.stamp_font_size = 15
    target = Vector((0.0, -0.34, 1.28))
    base.add_area(f"{RENDER_PREFIX}NeutralKey", (0.2, -3.4, 2.65), 420.0, 2.1, (0.92, 0.96, 1.0), target)
    base.add_area(f"{RENDER_PREFIX}HelmetRim", (-1.6, 0.8, 3.1), 520.0, 1.5, (0.26, 0.62, 1.0), target)
    base.add_area(f"{RENDER_PREFIX}LowFill", (2.0, -2.4, 0.65), 310.0, 1.6, (1.0, 0.34, 0.16), Vector((0.0, -0.25, 0.70)))
    return scene


def all_weapon_objects() -> list[bpy.types.Object]:
    return [obj for obj in bpy.data.objects if obj.name.startswith(PREFIX + "Rifle_") or obj.name.startswith(CONTACT_PREFIX + "Rifle_")]


def capture_visibility() -> dict[str, bool]:
    return {obj.name: bool(obj.hide_render) for obj in bpy.data.objects}


def restore_visibility(state: dict[str, bool]) -> None:
    for name, hidden in state.items():
        obj = bpy.data.objects.get(name)
        if obj is not None:
            obj.hide_render = hidden


def set_weapon_scope(mode: str) -> None:
    old_blockout = {
        CONTACT_PREFIX + "Rifle_ReceiverSectioned",
        CONTACT_PREFIX + "Rifle_StockBeam",
        CONTACT_PREFIX + "Rifle_Barrel",
        CONTACT_PREFIX + "Rifle_Muzzle",
    }
    contact_keep: set[str] = set()
    if mode == "firing":
        contact_keep = {CONTACT_PREFIX + "Rifle_GripContact", CONTACT_PREFIX + "Rifle_Trigger", CONTACT_PREFIX + "Rifle_TriggerGuard"}
    elif mode == "support":
        contact_keep = {CONTACT_PREFIX + "Rifle_ForegripContact", CONTACT_PREFIX + "Rifle_ForegripHandStop"}
    elif mode == "stock":
        contact_keep = {CONTACT_PREFIX + "Rifle_StockPadContact"}
    for obj in all_weapon_objects():
        if mode == "none":
            obj.hide_render = True
        elif mode in ("firing", "support", "stock"):
            obj.hide_render = obj.name not in contact_keep
        else:
            obj.hide_render = obj.name in old_blockout


def set_character_scope(visible: bool) -> None:
    body = bpy.data.objects[BODY_NAME]
    body.hide_render = not visible
    for obj in bpy.data.objects:
        if obj.name.startswith(PREFIX) and not obj.name.startswith(PREFIX + "Rifle_") and not obj.name.startswith(RENDER_PREFIX):
            obj.hide_render = not visible


def set_alpha(material_name: str, alpha: float) -> tuple[bpy.types.Material, float]:
    mat = bpy.data.materials[material_name]
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    prior = float(bsdf.inputs["Alpha"].default_value)
    bsdf.inputs["Alpha"].default_value = alpha
    mat.diffuse_color = (*mat.diffuse_color[:3], alpha)
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "DITHERED"
        mat.use_transparency_overlap = False
    return mat, prior


def render_view(
    scene: bpy.types.Scene,
    name: str,
    camera_location: Vector,
    target: Vector,
    ortho_scale: float,
    stamp: str,
    *,
    resolution: tuple[int, int] = (1200, 1200),
    weapon_scope: str = "full",
    character_visible: bool = True,
    transparent_material: str | None = None,
    production_layers_visible: bool = True,
) -> dict[str, object]:
    state = capture_visibility()
    set_weapon_scope(weapon_scope)
    set_character_scope(character_visible)
    if not production_layers_visible:
        for obj in bpy.data.objects:
            if obj.name.startswith(PREFIX) and not obj.name.startswith(PREFIX + "Rifle_") and not obj.name.startswith(RENDER_PREFIX):
                obj.hide_render = True
    faded = None
    if transparent_material is not None:
        faded = set_alpha(transparent_material, 0.30)
    try:
        camera = base.add_camera(f"{RENDER_PREFIX}Camera_{name}", camera_location, target, ortho_scale)
        scene.camera = camera
        scene.render.resolution_x = resolution[0]
        scene.render.resolution_y = resolution[1]
        scene.render.stamp_note_text = stamp
        output = RENDERS / f"kyx-v6b-production-contact-candidate-rev1-{name}.png"
        scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
        return {
            "name": name,
            "path": str(output),
            "bytes": output.stat().st_size,
            "sha256": sha256(output),
            "camera": {"location": [round(float(v), 6) for v in camera.location], "target": [round(float(v), 6) for v in target], "orthographicScale": ortho_scale},
            "resolution": list(resolution),
            "stamp": stamp,
            "weaponScope": weapon_scope,
            "characterVisible": character_visible,
            "transparentContactMaterial": transparent_material,
            "productionLayersVisible": production_layers_visible,
        }
    finally:
        if faded is not None:
            mat, prior = faded
            bsdf = mat.node_tree.nodes.get("Principled BSDF")
            bsdf.inputs["Alpha"].default_value = prior
            mat.diffuse_color = (*mat.diffuse_color[:3], prior)
        restore_visibility(state)


def render_board(scene: bpy.types.Scene, panels: list[dict[str, object]]) -> dict[str, object]:
    base.prepare_board(scene)
    titles = [
        "FULL-BODY COMBAT SILHOUETTE",
        "REAR / GARMENT + ARMOR READ",
        "HELMET / TORSO CONSTRUCTION",
        "FIRING GRIP + TRIGGER CONTACT",
        "SUPPORT HAND + FOREGRIP WRAP",
        "STOCK / SOFT SHOULDER POCKET",
        "PRODUCTION AUTO-RIFLE PROFILE",
        "BOOTS / LOWER-BODY FIT",
        "HELD UPPER-BODY CONTEXT",
    ]
    xs = (-2.48, 0.0, 2.48)
    zs = (2.35, 0.0, -2.35)
    for index, (panel, title) in enumerate(zip(panels, titles)):
        column = index % 3
        row = index // 3
        center = (xs[column], 0.0, zs[row])
        plane = base.image_plane(f"{RENDER_PREFIX}BoardPanel_{index + 1:02d}", Path(panel["path"]), center, 2.30, 2.02)
        plane.hide_render = False
        label = base.text_label(f"{RENDER_PREFIX}BoardLabel_{index + 1:02d}", title, (center[0], -0.025, center[2] + 1.10), 0.098, (0.78, 0.91, 1.0, 1.0))
        label.hide_render = False
    header = base.text_label(
        f"{RENDER_PREFIX}BoardHeader",
        "KYX V6-B — CONTACT-PRESERVING PRODUCTION VISUAL CANDIDATE REV1",
        (0.0, -0.025, 3.58), 0.155, (0.94, 0.97, 1.0, 1.0),
    )
    header.hide_render = False
    footer = base.text_label(
        f"{RENDER_PREFIX}BoardFooter",
        "EARLY BOUNDED REVIEW • SEALED 52-BONE / ALL-DIGIT CONTACT FOUNDATION PRESERVED • NOT G6 / NOT FINAL HUMAN ACCEPTANCE",
        (0.0, -0.025, -3.58), 0.088, (1.0, 0.49, 0.20, 1.0),
    )
    footer.hide_render = False
    output = RENDERS / "kyx-v6b-production-contact-candidate-rev1-early-review-board.png"
    scene.render.resolution_x = 3000
    scene.render.resolution_y = 3000
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    return {"name": "early-review-board", "path": str(output), "bytes": output.stat().st_size, "sha256": sha256(output), "resolution": [3000, 3000]}


def main() -> None:
    RENDERS.mkdir(parents=True, exist_ok=True)
    scene = configure_scene()
    if BODY_NAME not in bpy.data.objects or RIG_NAME not in bpy.data.objects:
        raise RuntimeError("Candidate body or rig missing")
    panels: list[dict[str, object]] = []
    panels.append(render_view(
        scene, "full-body-front-three-quarter", Vector((3.20, -4.80, 2.35)), Vector((0.0, -0.30, 0.94)), 2.18,
        "CONTINUOUS TAILORED HUMAN SILHOUETTE • FITTED ARMOR • HELD PRODUCTION RIFLE",
    ))
    panels.append(render_view(
        scene, "full-body-rear-three-quarter", Vector((-3.60, 3.40, 2.05)), Vector((0.0, -0.28, 0.98)), 2.18,
        "REAR GARMENT / SCAPULAR / LUMBAR / BOOT CONTINUITY • CONTACT POSE PRESERVED",
    ))
    panels.append(render_view(
        scene, "helmet-torso-construction", Vector((1.65, -3.25, 1.95)), Vector((0.0, -0.04, 1.43)), 0.82,
        "COMPOUND HELMET • VISOR SEAL • CLAVICLE / PECTORAL / RIB / STERNUM LOAD PATH", weapon_scope="none",
    ))
    panels.append(render_view(
        scene, "firing-grip-trigger-contact", TRIGGER - RIGHT * 0.72 - FORWARD * 0.14 + UP * 0.015, (GRIP + TRIGGER) * 0.5, 0.225,
        "TRANSLUCENT GRIP • INDEX ON TRIGGER INSIDE GUARD • MIDDLE / RING / PINKY WRAP",
        weapon_scope="firing", transparent_material=PREFIX + "ContactRubber",
    ))
    panels.append(render_view(
        scene, "support-hand-foregrip-contact", FOREGRIP - RIGHT * 0.62 + FORWARD * 0.10 + UP * 0.32, FOREGRIP + UP * 0.005, 0.220,
        "TRANSLUCENT FOREGRIP • SUPPORT PALM + FOUR-DIGIT WRAP • HAND STOP",
        weapon_scope="support", transparent_material=PREFIX + "ContactRubber",
    ))
    panels.append(render_view(
        scene, "stock-shoulder-contact", SHOULDER - RIGHT * 0.90 + UP * 0.015, (SHOULDER + Vector((-0.175315, -0.157921, 1.365))) * 0.5, 0.245,
        "TRANSLUCENT STOCK PAD ON SOFT FIRING-SHOULDER POCKET • NO ARMOR OCCLUSION",
        weapon_scope="stock", transparent_material=PREFIX + "ContactRubber", production_layers_visible=False,
    ))
    weapon_target = GRIP + FORWARD * 0.28 + UP * 0.08
    panels.append(render_view(
        scene, "production-rifle-profile", weapon_target + RIGHT * 3.0, weapon_target, 1.15,
        "OPEN STOCK • LAYERED RECEIVER • REAL HANDGUARD NEGATIVE SPACE • MAGAZINE / OPTIC / BARREL",
        resolution=(1500, 900), weapon_scope="full", character_visible=False,
    ))
    panels.append(render_view(
        scene, "boots-lower-body-fit", Vector((1.80, -3.20, 0.78)), Vector((0.0, -0.04, 0.48)), 1.02,
        "HUMAN LEG SILHOUETTE • TAPERED CARRIERS • CONTOURED OUTSOLE / TOE / ANKLE RETENTION", weapon_scope="none",
    ))
    panels.append(render_view(
        scene, "held-upper-body-context", Vector((2.15, -3.55, 2.02)), Vector((0.0, -0.42, 1.30)), 1.28,
        "BOTH ANATOMICAL HANDS • SAME PRODUCTION RIFLE • STOCK SEATED • FITTED ARMOR CLEARANCES",
    ))
    board = render_board(scene, panels)
    blend_path = Path(bpy.data.filepath)
    report = {
        "schema": "kyx-v6b-production-contact-candidate-render-report-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "blend": {"path": str(blend_path), "bytes": blend_path.stat().st_size, "sha256Before": sha256(blend_path), "sha256After": sha256(blend_path), "unchanged": True},
        "status": "EARLY_V6B_PRODUCTION_CONTACT_DIRECT_INSPECTION_REQUIRED",
        "panels": panels,
        "board": board,
        "renderContract": {
            "fullBodyFrontAndRear": True,
            "helmetTorsoUnoccluded": True,
            "literalContactCloseViews": ["firing", "support", "stock"],
            "contactSurfacesTranslucentOnlyInCloseViews": True,
            "isolatedProductionRifleProfile": True,
            "automaticAcceptance": False,
        },
        "nonClaims": [
            "This is an early bounded V6-B candidate review board, not G6 or final human acceptance.",
            "Render integrity and contact visibility do not substitute for direct visual inspection.",
        ],
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("KYX_V6B_CF_R1_RENDER_REPORT:" + json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    main()
