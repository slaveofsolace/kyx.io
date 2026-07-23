"""Render rev9 direct, component, distance, and pinned-reference evidence."""

from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


PREFIX = "KYX_V6C_BENCH_R9_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV9"
RIFLE_COLLECTION = f"{PREFIX}MultiDepthAutoRifle"
PINNED_REFERENCE_SHA256 = "9c188fa32daaeec2d284727a5d9e600f94b8b57fee6f0568c7ebac9d462abdd2"

REV8_RENDER_PATH = Path(__file__).with_name("render_v6c_visual_benchmark_rev8.py")
SPEC = importlib.util.spec_from_file_location("kyx_rev9_render_utilities", REV8_RENDER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load render utilities: {REV8_RENDER_PATH}")
r8 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r8)
for module in (
    r8, r8.r7, r8.r7.r6, r8.r7.r6.r5, r8.r7.r6.r5.r4,
    r8.r7.r6.r5.r4.r3, r8.r7.r6.r5.r4.r3.r2,
    r8.r7.r6.r5.r4.r3.r2.r1, r8.base,
):
    module.PREFIX = PREFIX
    module.CHECKPOINT = CHECKPOINT
    module.RIFLE_COLLECTION = RIFLE_COLLECTION
r8.base.VIEWS = {
    "front": (0.0, -4.6, 0.04),
    "side": (4.6, 0.0, 0.04),
    "back": (0.0, 4.6, 0.04),
    "three-quarter": (3.25, -3.45, 0.24),
}
base = r8.base
BOARD_MAKER = r8.BOARD_MAKER
DISTANCE_RENDER = r8.DISTANCE_RENDER


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <blend> <render-dir> <report.json> <reference.png>")
    return sys.argv[sys.argv.index("--") + 1 :]


def render_full_views(camera, target, minimum, maximum, output_dir, character, rifle):
    snapshots = base.visibility_snapshot(character + rifle)
    for obj in rifle:
        obj.hide_render = True
    scale = max(
        (maximum.z - minimum.z) * 1.13,
        (maximum.x - minimum.x) / (960 / 1180) * 1.05,
    )
    records = []
    for view, offset in base.VIEWS.items():
        records.append(base.write_render(
            output_dir / f"kyx-v6c-benchmark-rev9-{view}.png",
            camera, target, target + Vector(offset), scale, (960, 1180),
            f"{view.upper()} | V6-C VISUAL BENCHMARK REV9 | PRODUCTION-FORM REVIEW | NOT V6-C | NOT G6",
        ))
    base.restore_visibility(character + rifle, snapshots)
    return records


def render_components(camera, output_dir, character, rifle):
    all_objects = character + rifle
    snapshots = base.visibility_snapshot(all_objects)
    details = [
        (
            "helmet", Vector((0.0, -0.012, 1.655)), Vector((1.02, -3.02, 0.36)),
            0.46, (1180, 940),
            "HELMET | SEALED LINER / WRAPPED COMPOUND VISOR / CROWN KEEL / JAW / TEMPLE / OCCIPITAL HOUSING",
            False,
        ),
        (
            "torso", Vector((0.0, -0.010, 1.260)), Vector((1.02, -3.16, 0.34)),
            0.64, (1180, 1020),
            "TORSO | V6-A-PROJECTED CUIRASS / CONNECTED MANTLE / RIB WINGS / STERNUM KEEL / WAIST WRAP",
            False,
        ),
        (
            "back-structure", Vector((0.0, 0.015, 1.260)), Vector((1.05, 3.18, 0.36)),
            0.64, (1180, 1020),
            "BACK | BODY-CONFORMING FOUNDATION / SCAPULAR MANTLE / SEGMENTED LOAD SPINE / WAIST WRAP",
            False,
        ),
        (
            "nested-articulation", Vector((0.225, -0.008, 0.875)), Vector((1.45, -3.35, 0.52)),
            1.24, (980, 1180),
            "ARTICULATION | NESTED SHOULDER / ELBOW / FOREARM / THIGH / KNEE / SHIN SHELLS + WOVEN FLEX",
            False,
        ),
        (
            "boots", Vector((0.0, -0.020, 0.145)), Vector((1.02, -2.82, 0.34)),
            0.52, (1240, 800),
            "BOOTS | ANGULAR COMPOUND LAST / CONTOURED OUTSOLE / ANKLE UPPER / DORSAL SHELL / HEEL COUNTER",
            False,
        ),
        (
            "rifle", Vector((0.080, 0.0, 1.105)), Vector((1.16, -3.28, 0.48)),
            1.82, (1800, 920),
            "AUTO RIFLE | MULTI-DEPTH RECEIVER + HANDGUARD / REAL CUTOUTS / OPEN STOCK / MAG WELL / GAS BLOCK",
            True,
        ),
    ]
    records = []
    for name, target, offset, scale, resolution, note, rifle_only in details:
        for obj in character:
            obj.hide_render = rifle_only or snapshots[obj.name]
        for obj in rifle:
            obj.hide_render = not rifle_only
        records.append(base.write_render(
            output_dir / f"kyx-v6c-benchmark-rev9-{name}.png",
            camera, target, target + offset, scale, resolution, note,
        ))
    base.restore_visibility(all_objects, snapshots)
    return records


def render_distance_views(camera, output_dir, character, rifle):
    snapshots = base.visibility_snapshot(character + rifle)
    for obj in rifle:
        obj.hide_render = True
    target = Vector((0.0, -0.012, 0.895))
    records = []
    for distance in (5.0, 20.0, 40.0):
        label = str(int(distance))
        records.append(DISTANCE_RENDER(
            output_dir / f"kyx-v6c-benchmark-rev9-distance-{label}m.png",
            camera, target, distance,
            f"{label} M TRUE PERSPECTIVE | 50 MM / 36 MM SENSOR | V6-C BENCHMARK REV9 | NOT V6-C | NOT G6",
        ))
    base.restore_visibility(character + rifle, snapshots)
    return records


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 4:
        raise SystemExit("Expected -- <blend> <render-dir> <report.json> <reference.png>")
    blend_path, output_dir, report_path, reference_path = (
        Path(value).resolve() for value in arguments
    )
    reference_hash_before = base.sha256(reference_path)
    if reference_hash_before != PINNED_REFERENCE_SHA256:
        raise RuntimeError(f"Pinned production-target hash mismatch: {reference_hash_before}")
    blend_hash_before = base.sha256(blend_path)
    bpy.ops.wm.open_mainfile(filepath=str(blend_path), load_ui=False, use_scripts=False)
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    character = base.character_geometry()
    rifle = base.rifle_geometry()
    if not character or not rifle:
        raise RuntimeError("Expected rev9 character and MultiDepthAutoRifle geometry")
    minimum, maximum = base.combined_bounds(character)
    camera, target = base.configure_scene(minimum, maximum)
    bpy.context.scene.view_settings.exposure = -0.58
    full_views = render_full_views(camera, target, minimum, maximum, output_dir, character, rifle)
    component_views = render_components(camera, output_dir, character, rifle)
    distance_views = render_distance_views(camera, output_dir, character, rifle)
    direct_board = BOARD_MAKER(
        [output_dir / record["fileName"] for record in full_views],
        output_dir / "kyx-v6c-benchmark-rev9-direct-review-board.png", 2,
    )
    component_board = BOARD_MAKER(
        [output_dir / record["fileName"] for record in component_views],
        output_dir / "kyx-v6c-benchmark-rev9-component-review-board.png", 3,
    )
    distance_board = BOARD_MAKER(
        [output_dir / record["fileName"] for record in distance_views],
        output_dir / "kyx-v6c-benchmark-rev9-distance-review-board.png", 3,
    )
    source_reference_board = BOARD_MAKER(
        [reference_path, output_dir / direct_board["fileName"]],
        output_dir / "kyx-v6c-benchmark-rev9-source-reference-board.png", 2,
    )
    blend_hash_after = base.sha256(blend_path)
    reference_hash_after = base.sha256(reference_path)
    report = {
        "schemaVersion": 1,
        "renderedUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "input": {
            "path": str(blend_path), "sha256Before": blend_hash_before,
            "sha256After": blend_hash_after, "unchanged": blend_hash_before == blend_hash_after,
        },
        "sourceReference": {
            "path": str(reference_path), "sha256Before": reference_hash_before,
            "sha256After": reference_hash_after, "pinnedSha256": PINNED_REFERENCE_SHA256,
            "unchanged": reference_hash_before == reference_hash_after,
            "usage": "construction language only; accepted V6-A anatomy remains authoritative",
        },
        "renderExposure": -0.58,
        "characterBounds": {
            "minimum": [round(value, 6) for value in minimum],
            "maximum": [round(value, 6) for value in maximum],
        },
        "fullViews": full_views,
        "componentViews": component_views,
        "distanceViews": distance_views,
        "boards": {
            "direct": direct_board, "components": component_board,
            "distance": distance_board, "sourceReference": source_reference_board,
        },
        "contactEvidence": {
            "heldContactBoardOmittedByContract": True,
            "literalTwoHandOrShoulderContactClaimed": False,
            "note": "Three witness empties remain in the blend for later rigged work; no contact image is presented as proof.",
        },
        "visualDecision": "PENDING_DIRECT_INSPECTION",
        "nonClaims": [
            "This packet is a V6-C visual benchmark candidate, not V6-C or G6 acceptance.",
            "No final retopology, UV, rig, animation, LOD, GLB, runtime, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "V6C_VISUAL_BENCHMARK_REV9_AUDIT_PACKET_COMPLETE",
        "renders": len(full_views) + len(component_views) + len(distance_views),
        "boards": 4, "blendSha256": blend_hash_before,
        "sourceReferenceSha256": reference_hash_before,
        "heldContactBoard": "OMITTED_BY_CONTRACT",
    }, sort_keys=True))


if __name__ == "__main__":
    main()
