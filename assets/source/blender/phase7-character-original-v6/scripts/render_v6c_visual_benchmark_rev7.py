"""Render direct, component, distance, and contact-intent evidence for rev7."""

from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


PREFIX = "KYX_V6C_BENCH_R7_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV7"
RIFLE_COLLECTION = f"{PREFIX}OriginalAutoRifle"

REV6_RENDER_PATH = Path(__file__).with_name("render_v6c_visual_benchmark_rev6.py")
SPEC = importlib.util.spec_from_file_location("kyx_v6c_rev6_render_utilities", REV6_RENDER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load rev6 render utilities: {REV6_RENDER_PATH}")
r6 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r6)
for module in (
    r6, r6.r5, r6.r5.r4, r6.r5.r4.r3,
    r6.r5.r4.r3.r2, r6.r5.r4.r3.r2.r1, r6.base,
):
    module.PREFIX = PREFIX
    module.CHECKPOINT = CHECKPOINT
    module.RIFLE_COLLECTION = RIFLE_COLLECTION
r6.base.VIEWS = {
    "front": (0.0, -4.6, 0.04), "side": (4.6, 0.0, 0.04),
    "back": (0.0, 4.6, 0.04), "three-quarter": (3.25, -3.45, 0.26),
}
base = r6.base
BOARD_MAKER = r6.r5.r4.r3.r2.r1.make_board
DISTANCE_RENDER = r6.r5.r4.r3.r2.r1.render_distance


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <blend> <render-dir> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def render_full_views(camera, target, minimum, maximum, output_dir, character, rifle):
    snapshots = base.visibility_snapshot(character + rifle)
    for obj in rifle:
        obj.hide_render = True
    scale = max((maximum.z - minimum.z) * 1.13,
                (maximum.x - minimum.x) / (960 / 1180) * 1.05)
    records = []
    for view, offset in base.VIEWS.items():
        records.append(base.write_render(
            output_dir / f"kyx-v6c-benchmark-rev7-{view}.png",
            camera, target, target + Vector(offset), scale, (960, 1180),
            f"{view.upper()} | V6-C VISUAL BENCHMARK REV7 | DIRECT REVIEW | NOT V6-C | NOT G6",
        ))
    base.restore_visibility(character + rifle, snapshots)
    return records


def render_contact_intent(camera, output_dir, character, rifle):
    all_objects = character + rifle
    snapshots = base.visibility_snapshot(all_objects)
    for obj in character:
        obj.hide_render = True
    for obj in rifle:
        obj.hide_render = False
    marker_specs = [
        ("primary_grip", f"{PREFIX}SignalCoral"),
        ("support_grip", f"{PREFIX}CyanReadout"),
        ("shoulder", f"{PREFIX}WarmIvoryCeramic"),
    ]
    markers: list[bpy.types.Object] = []
    for label, material_name in marker_specs:
        witness = bpy.data.objects.get(f"{PREFIX}CONTACT_{label}")
        material = bpy.data.materials.get(material_name)
        if witness is None or material is None:
            raise RuntimeError(f"Missing contact witness or marker material: {label}")
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=32, ring_count=16, radius=0.021,
            location=witness.matrix_world.translation,
        )
        marker = bpy.context.object
        marker.name = f"KYX_RENDER_ONLY_CONTACT_{label}"
        marker.data.materials.append(material)
        marker["render_only"] = True
        markers.append(marker)
    record = base.write_render(
        output_dir / "kyx-v6c-benchmark-rev7-contact-intent.png",
        camera, Vector((0.090, 0.0, 1.155)), Vector((1.18, -3.35, 1.695)),
        1.42, (1500, 850),
        "CONTACT INTENT ONLY | RED PRIMARY / CYAN SUPPORT / IVORY SHOULDER | NO HELD OR CONTACT CLAIM",
    )
    for marker in markers:
        bpy.data.objects.remove(marker, do_unlink=True)
    base.restore_visibility(all_objects, snapshots)
    return record


def render_components(camera, output_dir, character, rifle):
    all_objects = character + rifle
    snapshots = base.visibility_snapshot(all_objects)
    details = [
        ("helmet", Vector((0.0, -0.005, 1.650)), Vector((1.10, -3.10, 0.42)), 0.43, (1100, 920),
         "HELMET | TEMPLE FRAMES / JAW RAILS / OCCIPITAL SHELL / FRAMED VISOR", False),
        ("chest", Vector((0.0, -0.005, 1.305)), Vector((1.10, -3.20, 0.42)), 0.63, (1100, 950),
         "TORSO | CONTINUOUS YOKE / STERNUM SPINE / RIB PANELS + ARCS / WAIST LOAD BAND", False),
        ("back-harness", Vector((0.0, 0.015, 1.305)), Vector((1.15, 3.20, 0.44)), 0.63, (1100, 950),
         "BACK | YOKE / SCAPULAR OVERLAP / REAR LOAD SPINE / RIB ARCS / WAIST ANCHOR", False),
        ("articulation", Vector((0.225, -0.005, 0.865)), Vector((1.45, -3.40, 0.55)), 1.22, (940, 1160),
         "ARTICULATION | SHOULDER BRIDGE / ELBOW BAND + RAIL / KNEE BAND + RAIL", False),
        ("boots", Vector((0.0, -0.040, 0.138)), Vector((1.02, -2.78, 0.34)), 0.50, (1180, 780),
         "BOOTS | MEASURED LAST / DORSAL SPLINES / FULL OUTSOLE / NO EXPOSED FOOT", False),
        ("rifle", Vector((0.090, 0.0, 1.155)), Vector((1.18, -3.35, 0.54)), 1.42, (1500, 850),
         "AUTO RIFLE | FORGED CHASSIS / RECEIVER ARMOR / VENTED HANDGUARD / RAIL / HAND STOP", True),
    ]
    records = []
    for name, target, offset, scale, resolution, note, rifle_only in details:
        for obj in character:
            obj.hide_render = rifle_only or snapshots[obj.name]
        for obj in rifle:
            obj.hide_render = not rifle_only
        records.append(base.write_render(
            output_dir / f"kyx-v6c-benchmark-rev7-{name}.png",
            camera, target, target + offset, scale, resolution, note,
        ))
    base.restore_visibility(all_objects, snapshots)
    records.append(render_contact_intent(camera, output_dir, character, rifle))
    return records


def render_distance_views(camera, output_dir, character, rifle):
    snapshots = base.visibility_snapshot(character + rifle)
    for obj in rifle:
        obj.hide_render = True
    target = Vector((0.0, -0.015, 0.89))
    records = []
    for distance in (5.0, 20.0, 40.0):
        label = str(int(distance))
        records.append(DISTANCE_RENDER(
            output_dir / f"kyx-v6c-benchmark-rev7-distance-{label}m.png",
            camera, target, distance,
            f"{label} M TRUE PERSPECTIVE | 50 MM / 36 MM SENSOR | V6-C BENCHMARK REV7 | NOT V6-C | NOT G6",
        ))
    base.restore_visibility(character + rifle, snapshots)
    return records


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 3:
        raise SystemExit("Expected -- <blend> <render-dir> <report.json>")
    blend_path, output_dir, report_path = (Path(value).resolve() for value in arguments)
    blend_hash_before = base.sha256(blend_path)
    bpy.ops.wm.open_mainfile(filepath=str(blend_path), load_ui=False, use_scripts=False)
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    character = base.character_geometry()
    rifle = base.rifle_geometry()
    if not character or not rifle:
        raise RuntimeError("Expected V6-C rev7 character and Auto Rifle geometry")
    minimum, maximum = base.combined_bounds(character)
    camera, target = base.configure_scene(minimum, maximum)
    bpy.context.scene.view_settings.exposure = -0.92
    full_views = render_full_views(camera, target, minimum, maximum, output_dir, character, rifle)
    component_views = render_components(camera, output_dir, character, rifle)
    distance_views = render_distance_views(camera, output_dir, character, rifle)
    direct_board = BOARD_MAKER(
        [output_dir / record["fileName"] for record in full_views],
        output_dir / "kyx-v6c-benchmark-rev7-direct-review-board.png", 2,
    )
    component_board = BOARD_MAKER(
        [output_dir / record["fileName"] for record in component_views],
        output_dir / "kyx-v6c-benchmark-rev7-component-review-board.png", 3,
    )
    distance_board = BOARD_MAKER(
        [output_dir / record["fileName"] for record in distance_views],
        output_dir / "kyx-v6c-benchmark-rev7-distance-review-board.png", 3,
    )
    blend_hash_after = base.sha256(blend_path)
    report = {
        "schemaVersion": 1,
        "renderedUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "input": {"path": blend_path.name, "sha256Before": blend_hash_before,
                  "sha256After": blend_hash_after, "unchanged": blend_hash_before == blend_hash_after},
        "renderExposure": -0.92,
        "characterBounds": {"minimum": [round(value, 6) for value in minimum],
                            "maximum": [round(value, 6) for value in maximum]},
        "fullViews": full_views,
        "componentViews": component_views,
        "distanceViews": distance_views,
        "boards": {"direct": direct_board, "components": component_board, "distance": distance_board},
        "contactEvidence": {
            "type": "standalone witness-only intent view",
            "fileName": "kyx-v6c-benchmark-rev7-contact-intent.png",
            "heldContactBoardOmittedByContract": True,
            "literalTwoHandOrShoulderContactClaimed": False,
        },
        "visualDecision": "PENDING_DIRECT_INSPECTION",
        "nonClaims": [
            "This packet is a V6-C visual benchmark candidate, not V6-C or G6 acceptance.",
            "The contact-intent view visualizes witness positions only; it is not a held-contact board or proof.",
            "No final retopology, UV, rig, animation, LOD, GLB, runtime, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "V6C_VISUAL_BENCHMARK_REV7_AUDIT_PACKET_COMPLETE",
        "renders": len(full_views) + len(component_views) + len(distance_views),
        "boards": 3, "blendSha256": blend_hash_before,
        "heldContactBoard": "OMITTED_BY_CONTRACT",
    }, sort_keys=True))


if __name__ == "__main__":
    main()
