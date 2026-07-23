"""Render the isolated V6-B production-sculpt revision 12 audit packet."""

from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


PREFIX = "KYX_V6B_PROD_R12_"
CHECKPOINT = "V6-B_PRODUCTION_SCULPT_REV12"
RIFLE_COLLECTION = f"{PREFIX}StandaloneVolumetricRifle"
BASE_PATH = Path(__file__).with_name("render_v6b_production_sculpt_rev11.py")
SPEC = importlib.util.spec_from_file_location("kyx_v6b_rev11_render_library", BASE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load render library: {BASE_PATH}")
base = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base)
base.PREFIX = PREFIX
base.CHECKPOINT = CHECKPOINT
base.RIFLE_COLLECTION = RIFLE_COLLECTION
base.VIEWS = {
    "front": (0.0, -4.6, 0.04),
    "side": (4.6, 0.0, 0.04),
    "back": (0.0, 4.6, 0.04),
    "three-quarter": (3.25, -3.45, 0.28),
}


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <rev12.blend> <render-dir> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def render_full_views(
    camera: bpy.types.Object,
    target: Vector,
    minimum: Vector,
    maximum: Vector,
    output_dir: Path,
    character: list[bpy.types.Object],
    rifle: list[bpy.types.Object],
) -> list[dict[str, object]]:
    snapshots = base.visibility_snapshot(character + rifle)
    for obj in rifle:
        obj.hide_render = True
    height = maximum.z - minimum.z
    width = maximum.x - minimum.x
    scale = max(height * 1.13, width / (960 / 1180) * 1.05)
    records: list[dict[str, object]] = []
    for view, offset in base.VIEWS.items():
        records.append(base.write_render(
            output_dir / f"kyx-v6b-production-rev12-{view}.png",
            camera, target, target + Vector(offset), scale, (960, 1180),
            f"{view.upper()} | V6-B REV12 PRODUCTION SCULPT CANDIDATE | DIRECT REVIEW | NOT G6",
        ))
    base.restore_visibility(character + rifle, snapshots)
    return records


def render_details(
    camera: bpy.types.Object,
    output_dir: Path,
    character: list[bpy.types.Object],
    rifle: list[bpy.types.Object],
) -> list[dict[str, object]]:
    all_objects = character + rifle
    snapshots = base.visibility_snapshot(all_objects)
    details = [
        (
            "helmet", Vector((0.0, -0.015, 1.648)), Vector((1.10, -3.15, 0.42)), 0.43, (1050, 900),
            "HELMET | CLOSED LOWER CROWN / NARROW VISOR / CHEEK RAIL / CLOSE COWL | REV12", False,
        ),
        (
            "chest", Vector((0.0, -0.015, 1.285)), Vector((1.23, -3.30, 0.54)), 0.62, (1050, 950),
            "CHEST | ONE CURVED BIB / CONTINUOUS DARK FABRIC / FLEX GAP / FITTED WAIST | REV12", False,
        ),
        (
            "limb", Vector((0.235, -0.010, 0.800)), Vector((1.48, -3.50, 0.58)), 1.24, (920, 1160),
            "LIMBS | FITTED SHOULDER SADDLE / PROJECTED TAPERED SHIELDS / JOINT GAPS | REV12", False,
        ),
        (
            "boot", Vector((0.0, -0.040, 0.130)), Vector((1.02, -2.75, 0.38)), 0.42, (1150, 760),
            "BOOTS | HIDDEN SOURCE FEET / MEASURED LAST / CONTOURED SOLE / FITTED SHAFT | REV12", False,
        ),
        (
            "rifle", Vector((0.180, 0.0, 1.155)), Vector((1.25, -3.40, 0.62)), 1.48, (1450, 820),
            "RIFLE | DEEP RECEIVER / DARK CORE / CERAMIC BRIDGES / DISTINCT GRIP + MAG / STOCK", True,
        ),
    ]
    records: list[dict[str, object]] = []
    for name, target, offset, scale, resolution, note, rifle_only in details:
        for obj in character:
            obj.hide_render = rifle_only or snapshots[obj.name]
        for obj in rifle:
            obj.hide_render = not rifle_only
        records.append(base.write_render(
            output_dir / f"kyx-v6b-production-rev12-{name}.png",
            camera, target, target + offset, scale, resolution, note,
        ))
    base.restore_visibility(all_objects, snapshots)
    return records


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 3:
        raise SystemExit("Expected -- <rev12.blend> <render-dir> <report.json>")
    blend_path, output_dir, report_path = (Path(value).resolve() for value in arguments)
    blend_hash_before = base.sha256(blend_path)
    bpy.ops.wm.open_mainfile(filepath=str(blend_path), load_ui=False, use_scripts=False)
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    character = base.character_geometry()
    rifle = base.rifle_geometry()
    if not character or not rifle:
        raise RuntimeError("Expected character and standalone rifle geometry")
    minimum, maximum = base.combined_bounds(character)
    camera, target = base.configure_scene(minimum, maximum)
    full_views = render_full_views(camera, target, minimum, maximum, output_dir, character, rifle)
    detail_views = render_details(camera, output_dir, character, rifle)
    blend_hash_after = base.sha256(blend_path)
    report = {
        "schemaVersion": 1,
        "renderedUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "input": {"path": blend_path.name, "sha256Before": blend_hash_before,
                  "sha256After": blend_hash_after, "unchanged": blend_hash_before == blend_hash_after},
        "characterBounds": {
            "minimum": [round(value, 6) for value in minimum],
            "maximum": [round(value, 6) for value in maximum],
        },
        "fullViews": full_views,
        "detailViews": detail_views,
        "visualDecision": "PENDING_DIRECT_INSPECTION",
        "nonClaims": [
            "Revision 12 is a V6-B visual construction candidate only; it is not G6.",
            "Rifle contact remains open until a defensible rigged pose exists.",
            "No final retopology, UV, rig, animation, LOD, GLB, runtime, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "V6B_PRODUCTION_SCULPT_REV12_RENDERS_COMPLETE_PENDING_DIRECT_AUDIT",
                      "renders": len(full_views) + len(detail_views),
                      "blendSha256": blend_hash_before}, sort_keys=True))


if __name__ == "__main__":
    main()
