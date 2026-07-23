"""Render direct, component, and distance evidence for V6-C benchmark rev4."""

from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


PREFIX = "KYX_V6C_BENCH_R4_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV4"
RIFLE_COLLECTION = f"{PREFIX}OriginalAutoRifle"

REV3_RENDER_PATH = Path(__file__).with_name("render_v6c_visual_benchmark_rev3.py")
SPEC = importlib.util.spec_from_file_location("kyx_v6c_rev3_render_utilities", REV3_RENDER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load rev3 render utilities: {REV3_RENDER_PATH}")
r3 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r3)
for module in (r3, r3.r2, r3.r2.r1, r3.base):
    module.PREFIX = PREFIX
    module.CHECKPOINT = CHECKPOINT
    module.RIFLE_COLLECTION = RIFLE_COLLECTION
r3.base.VIEWS = {
    "front": (0.0, -4.6, 0.04),
    "side": (4.6, 0.0, 0.04),
    "back": (0.0, 4.6, 0.04),
    "three-quarter": (3.25, -3.45, 0.26),
}
base = r3.base


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <blend> <render-dir> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def render_full_views(camera, target, minimum, maximum, output_dir, character, rifle):
    snapshots = base.visibility_snapshot(character + rifle)
    for obj in rifle:
        obj.hide_render = True
    height = maximum.z - minimum.z
    width = maximum.x - minimum.x
    scale = max(height * 1.13, width / (960 / 1180) * 1.05)
    records = []
    for view, offset in base.VIEWS.items():
        records.append(base.write_render(
            output_dir / f"kyx-v6c-benchmark-rev4-{view}.png",
            camera, target, target + Vector(offset), scale, (960, 1180),
            f"{view.upper()} | V6-C VISUAL BENCHMARK REV4 | DIRECT REVIEW | NOT V6-C | NOT G6",
        ))
    base.restore_visibility(character + rifle, snapshots)
    return records


def render_components(camera, output_dir, character, rifle):
    all_objects = character + rifle
    snapshots = base.visibility_snapshot(all_objects)
    details = [
        ("helmet", Vector((0.0, -0.035, 1.650)), Vector((1.02, -3.12, 0.39)),
         0.43, (1100, 920),
         "HELMET | ASYMMETRIC PLANAR LINER / COMPRESSED HIGH CROWN / COMPOUND VISOR", False),
        ("chest", Vector((0.0, -0.020, 1.350)), Vector((1.15, -3.28, 0.46)),
         0.54, (1100, 950),
         "CHEST | BOUNDED CLAVICLE BLADES / FITTED RIB SEAMS / NO LOWER CUP PATCHES", False),
        ("limbs", Vector((0.230, -0.010, 0.805)), Vector((1.46, -3.48, 0.54)),
         1.18, (940, 1160),
         "LIMBS | CONTINUOUS GRAPHITE WRAPS / NARROW CERAMIC INSETS / ROUTED SEAMS", False),
        ("boots", Vector((0.0, -0.040, 0.138)), Vector((1.02, -2.78, 0.34)),
         0.50, (1180, 780),
         "BOOTS | MEASURED LAST / DORSAL SPLINES / FULL OUTSOLE / NO EXPOSED FOOT", False),
        ("rifle", Vector((0.110, 0.0, 1.145)), Vector((1.18, -3.35, 0.54)),
         1.43, (1500, 850),
         "AUTO RIFLE | CONTINUOUS 3D LOFT / EJECTION FRAME / POWER ROUTE / TOP SPINE", True),
    ]
    records = []
    for name, target, offset, scale, resolution, note, rifle_only in details:
        for obj in character:
            obj.hide_render = rifle_only or snapshots[obj.name]
        for obj in rifle:
            obj.hide_render = not rifle_only
        records.append(base.write_render(
            output_dir / f"kyx-v6c-benchmark-rev4-{name}.png",
            camera, target, target + offset, scale, resolution, note,
        ))
    base.restore_visibility(all_objects, snapshots)
    return records


def render_distance_views(camera, output_dir, character, rifle):
    snapshots = base.visibility_snapshot(character + rifle)
    for obj in rifle:
        obj.hide_render = True
    for obj in character:
        obj.hide_render = snapshots[obj.name]
    target = Vector((0.0, -0.015, 0.89))
    records = []
    for distance in (5.0, 20.0, 40.0):
        label = str(int(distance))
        records.append(r3.r2.r1.render_distance(
            output_dir / f"kyx-v6c-benchmark-rev4-distance-{label}m.png",
            camera, target, distance,
            f"{label} M TRUE PERSPECTIVE | 50 MM / 36 MM SENSOR | V6-C BENCHMARK REV4 | NOT V6-C | NOT G6",
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
        raise RuntimeError("Expected V6-C rev4 character and Auto Rifle geometry")
    minimum, maximum = base.combined_bounds(character)
    camera, target = base.configure_scene(minimum, maximum)
    bpy.context.scene.view_settings.exposure = -1.05
    full_views = render_full_views(camera, target, minimum, maximum, output_dir, character, rifle)
    component_views = render_components(camera, output_dir, character, rifle)
    distance_views = render_distance_views(camera, output_dir, character, rifle)
    direct_board = r3.r2.r1.make_board(
        [output_dir / record["fileName"] for record in full_views],
        output_dir / "kyx-v6c-benchmark-rev4-direct-review-board.png", 2,
    )
    component_board = r3.r2.r1.make_board(
        [output_dir / record["fileName"] for record in component_views],
        output_dir / "kyx-v6c-benchmark-rev4-component-review-board.png", 3,
    )
    distance_board = r3.r2.r1.make_board(
        [output_dir / record["fileName"] for record in distance_views],
        output_dir / "kyx-v6c-benchmark-rev4-distance-review-board.png", 3,
    )
    blend_hash_after = base.sha256(blend_path)
    report = {
        "schemaVersion": 1,
        "renderedUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "input": {"path": blend_path.name, "sha256Before": blend_hash_before,
                  "sha256After": blend_hash_after, "unchanged": blend_hash_before == blend_hash_after},
        "renderExposure": -1.05,
        "characterBounds": {"minimum": [round(value, 6) for value in minimum],
                            "maximum": [round(value, 6) for value in maximum]},
        "fullViews": full_views,
        "componentViews": component_views,
        "distanceViews": distance_views,
        "boards": {"direct": direct_board, "components": component_board, "distance": distance_board},
        "visualDecision": "PENDING_DIRECT_INSPECTION",
        "nonClaims": [
            "This packet is a V6-C visual benchmark candidate, not V6-C or G6 acceptance.",
            "Contact witnesses establish future intent only; no posed contact is claimed.",
            "No final retopology, UV, rig, animation, LOD, GLB, runtime, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "V6C_VISUAL_BENCHMARK_REV4_AUDIT_PACKET_COMPLETE",
        "renders": len(full_views) + len(component_views) + len(distance_views),
        "boards": 3, "blendSha256": blend_hash_before,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
