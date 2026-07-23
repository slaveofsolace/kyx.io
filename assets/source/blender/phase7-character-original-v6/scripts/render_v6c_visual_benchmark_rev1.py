"""Render direct, component, and distance evidence for V6-C benchmark rev1."""

from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector
import numpy as np


PREFIX = "KYX_V6C_BENCH_R1_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV1"
RIFLE_COLLECTION = f"{PREFIX}OriginalAutoRifle"

BASE_PATH = Path(__file__).with_name("render_v6b_production_sculpt_rev11.py")
SPEC = importlib.util.spec_from_file_location("kyx_v6c_shared_render_utilities", BASE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load render utilities: {BASE_PATH}")
base = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base)
base.PREFIX = PREFIX
base.CHECKPOINT = CHECKPOINT
base.RIFLE_COLLECTION = RIFLE_COLLECTION
base.VIEWS = {
    "front": (0.0, -4.6, 0.04),
    "side": (4.6, 0.0, 0.04),
    "back": (0.0, 4.6, 0.04),
    "three-quarter": (3.25, -3.45, 0.26),
}


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
            output_dir / f"kyx-v6c-benchmark-rev1-{view}.png",
            camera, target, target + Vector(offset), scale, (960, 1180),
            f"{view.upper()} | V6-C NEW VISUAL BENCHMARK REV1 | DIRECT REVIEW | NOT V6-C | NOT G6",
        ))
    base.restore_visibility(character + rifle, snapshots)
    return records


def render_components(camera, output_dir, character, rifle):
    all_objects = character + rifle
    snapshots = base.visibility_snapshot(all_objects)
    details = [
        ("helmet", Vector((0.0, -0.020, 1.650)), Vector((0.98, -3.12, 0.40)),
         0.43, (1100, 920),
         "HELMET | ONE LOW-VOLUME SHELL / COMPOUND VISOR / CHIN SEAL / CONTINUOUS COWL", False),
        ("chest", Vector((0.0, -0.018, 1.322)), Vector((1.16, -3.28, 0.48)),
         0.58, (1100, 950),
         "CHEST | LAYERED CLAVICLE-RIB FLOW / NARROW STERNUM / UNDERSUIT VISIBLE", False),
        ("limbs", Vector((0.230, -0.010, 0.805)), Vector((1.46, -3.48, 0.54)),
         1.18, (940, 1160),
         "LIMBS | ALMOND-TAPERED WRAP SHELLS / MUSCLE + JOINT ARCS / OPEN FLEX ZONES", False),
        ("boots", Vector((0.0, -0.040, 0.138)), Vector((1.02, -2.78, 0.34)),
         0.47, (1180, 780),
         "BOOTS | HEEL-BALL-INSTEP LAST / CANTED ANKLE / CONTOURED OUTSOLE / LONG DORSAL FLOW", False),
        ("rifle", Vector((0.140, 0.0, 1.145)), Vector((1.24, -3.45, 0.56)),
         1.72, (1500, 850),
         "AUTO RIFLE | CONTINUOUS STOCK-RECEIVER-HANDGUARD-GRIP CHASSIS | CONTACT INTENT ONLY", True),
    ]
    records = []
    for name, target, offset, scale, resolution, note, rifle_only in details:
        for obj in character:
            obj.hide_render = rifle_only or snapshots[obj.name]
        for obj in rifle:
            obj.hide_render = not rifle_only
        records.append(base.write_render(
            output_dir / f"kyx-v6c-benchmark-rev1-{name}.png",
            camera, target, target + offset, scale, resolution, note,
        ))
    base.restore_visibility(all_objects, snapshots)
    return records


def render_distance(
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
    target = Vector((0.0, -0.015, 0.89))
    records = []
    for distance in (5.0, 20.0, 40.0):
        label = str(int(distance))
        records.append(render_distance(
            output_dir / f"kyx-v6c-benchmark-rev1-distance-{label}m.png",
            camera, target, distance,
            f"{label} M TRUE PERSPECTIVE | 50 MM / 36 MM SENSOR | V6-C BENCHMARK REV1 | NOT V6-C | NOT G6",
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
        visual_row = index // columns
        storage_row = rows - 1 - visual_row
        column = index % columns
        y = storage_row * cell_height + (cell_height - array.shape[0]) // 2
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
    return {
        "fileName": output_path.name,
        "bytes": output_path.stat().st_size,
        "sha256": base.sha256(output_path),
        "resolution": [board.shape[1], board.shape[0]],
    }


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
        raise RuntimeError("Expected V6-C character and original Auto Rifle geometry")
    minimum, maximum = base.combined_bounds(character)
    camera, target = base.configure_scene(minimum, maximum)
    bpy.context.scene.view_settings.exposure = -0.95
    full_views = render_full_views(camera, target, minimum, maximum, output_dir, character, rifle)
    component_views = render_components(camera, output_dir, character, rifle)
    distance_views = render_distance_views(camera, output_dir, character, rifle)
    direct_board = make_board(
        [output_dir / record["fileName"] for record in full_views],
        output_dir / "kyx-v6c-benchmark-rev1-direct-review-board.png", 2,
    )
    component_board = make_board(
        [output_dir / record["fileName"] for record in component_views],
        output_dir / "kyx-v6c-benchmark-rev1-component-review-board.png", 3,
    )
    distance_board = make_board(
        [output_dir / record["fileName"] for record in distance_views],
        output_dir / "kyx-v6c-benchmark-rev1-distance-review-board.png", 3,
    )
    blend_hash_after = base.sha256(blend_path)
    report = {
        "schemaVersion": 1,
        "renderedUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "input": {
            "path": blend_path.name,
            "sha256Before": blend_hash_before,
            "sha256After": blend_hash_after,
            "unchanged": blend_hash_before == blend_hash_after,
        },
        "renderExposure": -0.95,
        "characterBounds": {
            "minimum": [round(value, 6) for value in minimum],
            "maximum": [round(value, 6) for value in maximum],
        },
        "fullViews": full_views,
        "componentViews": component_views,
        "distanceViews": distance_views,
        "boards": {
            "direct": direct_board,
            "components": component_board,
            "distance": distance_board,
        },
        "visualDecision": "PENDING_DIRECT_INSPECTION",
        "nonClaims": [
            "This packet is a V6-C visual benchmark candidate, not V6-C or G6 acceptance.",
            "Contact witnesses establish future intent only; no posed contact is claimed.",
            "No final retopology, UV, rig, animation, LOD, GLB, runtime, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "V6C_VISUAL_BENCHMARK_REV1_AUDIT_PACKET_COMPLETE",
        "renders": len(full_views) + len(component_views) + len(distance_views),
        "boards": 3,
        "blendSha256": blend_hash_before,
    }, sort_keys=True))


if __name__ == "__main__":
    main()

