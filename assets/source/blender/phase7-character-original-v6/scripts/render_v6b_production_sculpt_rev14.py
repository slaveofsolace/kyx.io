"""Render rev14 direct, detail, and true-perspective distance audit boards."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector
import numpy as np


PREFIX = "KYX_V6B_PROD_R14_"
CHECKPOINT = "V6-B_PRODUCTION_SCULPT_REV14"
RIFLE_COLLECTION = f"{PREFIX}StandaloneVolumetricRifle"
BASE_PATH = Path(__file__).with_name("render_v6b_production_sculpt_rev11.py")
SPEC = importlib.util.spec_from_file_location("kyx_v6b_rev11_render_library_r14", BASE_PATH)
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
        raise SystemExit("Expected -- <rev14.blend> <render-dir> <report.json>")
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
            output_dir / f"kyx-v6b-production-rev14-{view}.png",
            camera, target, target + Vector(offset), scale, (960, 1180),
            f"{view.upper()} | V6-B REV14 BOUNDED CORRECTION | DIRECT REVIEW | NOT V6-B | NOT G6",
        ))
    base.restore_visibility(character + rifle, snapshots)
    return records


def render_details(camera, output_dir, character, rifle):
    all_objects = character + rifle
    snapshots = base.visibility_snapshot(all_objects)
    details = [
        ("helmet", Vector((0.0, -0.015, 1.648)), Vector((1.10, -3.15, 0.42)), 0.43, (1050, 900),
         "HELMET | CLOSED CROWN / CROWN KEEL / VISOR / CHEEK RAIL / CLOSE COWL | REV14", False),
        ("chest", Vector((0.0, -0.015, 1.285)), Vector((1.23, -3.30, 0.54)), 0.62, (1050, 950),
         "CHEST | ONE CURVED BIB / DARK FABRIC / SHOULDER FLANGE / WAIST RESTORED | REV14", False),
        ("limb", Vector((0.235, -0.010, 0.800)), Vector((1.48, -3.50, 0.58)), 1.24, (920, 1160),
         "LIMBS | BOUNDED CURVED GUARDS / HUMAN JOINT GAPS / NO SURFACE JUMPING | REV14", False),
        ("boot", Vector((0.0, -0.040, 0.130)), Vector((1.02, -2.75, 0.38)), 0.42, (1150, 760),
         "BOOTS | HIDDEN FEET / MEASURED LAST / FITTED SHAFT / REDUCED CLOSED HEEL | REV14", False),
        ("rifle", Vector((0.180, 0.0, 1.155)), Vector((1.25, -3.40, 0.62)), 1.48, (1450, 820),
         "RIFLE | UNCHANGED FROM REV13 / DEEP RECEIVER / DARK CORE / DISTINCT GRIP + MAG | CONTACT OPEN", True),
    ]
    records = []
    for name, target, offset, scale, resolution, note, rifle_only in details:
        for obj in character:
            obj.hide_render = rifle_only or snapshots[obj.name]
        for obj in rifle:
            obj.hide_render = not rifle_only
        records.append(base.write_render(
            output_dir / f"kyx-v6b-production-rev14-{name}.png",
            camera, target, target + offset, scale, resolution, note,
        ))
    base.restore_visibility(all_objects, snapshots)
    return records


def render_perspective(
    output_path: Path,
    camera: bpy.types.Object,
    target: Vector,
    distance: float,
    note: str,
) -> dict[str, object]:
    scene = bpy.context.scene
    camera.data.type = "PERSP"
    camera.data.lens = 50.0
    camera.data.sensor_width = 36.0
    camera.location = Vector((0.0, -distance, target.z))
    base.point_at(camera, target)
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.render.filepath = str(output_path)
    scene.render.stamp_note_text = note
    bpy.context.view_layer.update()
    bpy.ops.render.render(write_still=True)
    if not output_path.is_file() or output_path.stat().st_size < 20_000:
        raise RuntimeError(f"Distance render missing or suspiciously small: {output_path}")
    return {
        "view": output_path.stem,
        "fileName": output_path.name,
        "bytes": output_path.stat().st_size,
        "sha256": base.sha256(output_path),
        "distanceMeters": distance,
        "lensMm": 50.0,
        "sensorWidthMm": 36.0,
        "resolution": [900, 1100],
    }


def render_distance_views(camera, output_dir, character, rifle):
    snapshots = base.visibility_snapshot(character + rifle)
    for obj in rifle:
        obj.hide_render = True
    for obj in character:
        obj.hide_render = snapshots[obj.name]
    target = Vector((0.0, 0.0, 0.89))
    records = []
    for distance in (5.0, 20.0, 40.0):
        label = str(int(distance))
        records.append(render_perspective(
            output_dir / f"kyx-v6b-production-rev14-distance-{label}m.png",
            camera, target, distance,
            f"{label} M TRUE PERSPECTIVE | 50 MM / 36 MM SENSOR | REV14 SILHOUETTE READ | NOT V6-B | NOT G6",
        ))
    base.restore_visibility(character + rifle, snapshots)
    return records


def make_board(paths: list[Path], output_path: Path, columns: int) -> dict[str, object]:
    loaded = []
    for path in paths:
        image = bpy.data.images.load(str(path), check_existing=False)
        width, height = image.size
        pixels = np.empty(width * height * 4, dtype=np.float32)
        image.pixels.foreach_get(pixels)
        loaded.append((image, pixels.reshape((height, width, 4))))
    cell_width = max(array.shape[1] for _image, array in loaded)
    cell_height = max(array.shape[0] for _image, array in loaded)
    rows = (len(loaded) + columns - 1) // columns
    board = np.zeros((rows * cell_height, columns * cell_width, 4), dtype=np.float32)
    board[:, :, 3] = 1.0
    for index, (_image, array) in enumerate(loaded):
        row = index // columns
        column = index % columns
        y = row * cell_height + (cell_height - array.shape[0]) // 2
        x = column * cell_width + (cell_width - array.shape[1]) // 2
        board[y:y + array.shape[0], x:x + array.shape[1], :] = array
    output = bpy.data.images.new(output_path.stem, width=board.shape[1], height=board.shape[0], alpha=True)
    output.pixels.foreach_set(board.ravel())
    output.filepath_raw = str(output_path)
    output.file_format = "PNG"
    output.save()
    for image, _array in loaded:
        bpy.data.images.remove(image)
    if not output_path.is_file() or output_path.stat().st_size < 50_000:
        raise RuntimeError(f"Review board missing or suspiciously small: {output_path}")
    return {"fileName": output_path.name, "bytes": output_path.stat().st_size,
            "sha256": base.sha256(output_path), "resolution": [board.shape[1], board.shape[0]]}


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 3:
        raise SystemExit("Expected -- <rev14.blend> <render-dir> <report.json>")
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
    bpy.context.scene.view_settings.exposure = -0.85
    full_views = render_full_views(camera, target, minimum, maximum, output_dir, character, rifle)
    detail_views = render_details(camera, output_dir, character, rifle)
    distance_views = render_distance_views(camera, output_dir, character, rifle)
    direct_board = make_board(
        [output_dir / record["fileName"] for record in full_views],
        output_dir / "kyx-v6b-production-rev14-direct-review-board.png", 2,
    )
    distance_board = make_board(
        [output_dir / record["fileName"] for record in distance_views],
        output_dir / "kyx-v6b-production-rev14-distance-review-board.png", 3,
    )
    blend_hash_after = base.sha256(blend_path)
    report = {
        "schemaVersion": 1,
        "renderedUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "input": {"path": blend_path.name, "sha256Before": blend_hash_before,
                  "sha256After": blend_hash_after, "unchanged": blend_hash_before == blend_hash_after},
        "renderExposure": -0.85,
        "characterBounds": {"minimum": [round(value, 6) for value in minimum],
                            "maximum": [round(value, 6) for value in maximum]},
        "fullViews": full_views,
        "detailViews": detail_views,
        "distanceViews": distance_views,
        "boards": {"direct": direct_board, "distance": distance_board},
        "visualDecision": "PENDING_INDEPENDENT_DIRECT_INSPECTION",
        "nonClaims": [
            "Revision 14 is a bounded correction and review candidate only; it is not V6-B or G6 acceptance.",
            "Rifle contact remains open until a defensible rigged pose exists.",
            "No final retopology, UV, rig, animation, LOD, GLB, runtime, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "V6B_PRODUCTION_SCULPT_REV14_AUDIT_PACKET_COMPLETE",
                      "renders": len(full_views) + len(detail_views) + len(distance_views),
                      "boards": 2, "blendSha256": blend_hash_before}, sort_keys=True))


if __name__ == "__main__":
    main()
