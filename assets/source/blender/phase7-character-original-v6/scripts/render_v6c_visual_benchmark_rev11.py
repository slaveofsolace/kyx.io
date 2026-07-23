"""Render rev11 direct, hero, component, gameplay-distance, and reference evidence."""

from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


PREFIX = "KYX_V6C_BENCH_R11_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV11"
RIFLE_COLLECTION = f"{PREFIX}ProductionGradeAutoRifle"
PINNED_REFERENCE_SHA256 = "9c188fa32daaeec2d284727a5d9e600f94b8b57fee6f0568c7ebac9d462abdd2"

REV10_RENDER_PATH = Path(__file__).with_name("render_v6c_visual_benchmark_rev10.py")
SPEC = importlib.util.spec_from_file_location("kyx_rev11_render_utilities", REV10_RENDER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load render utilities: {REV10_RENDER_PATH}")
r10 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r10)
for module in (
    r10, r10.r8, r10.r8.r7, r10.r8.r7.r6, r10.r8.r7.r6.r5,
    r10.r8.r7.r6.r5.r4, r10.r8.r7.r6.r5.r4.r3,
    r10.r8.r7.r6.r5.r4.r3.r2, r10.r8.r7.r6.r5.r4.r3.r2.r1,
    r10.base,
):
    module.PREFIX = PREFIX
    module.CHECKPOINT = CHECKPOINT
    module.RIFLE_COLLECTION = RIFLE_COLLECTION
base = r10.base
BOARD_MAKER = r10.BOARD_MAKER
DISTANCE_RENDER = r10.DISTANCE_RENDER
base.VIEWS = {
    "front": (0.0, -4.65, 0.02),
    "side": (4.65, 0.0, 0.02),
    "back": (0.0, 4.65, 0.02),
    "three-quarter": (3.18, -3.62, 0.22),
    "rear-three-quarter": (-3.15, 3.58, 0.20),
}


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <blend> <render-dir> <report.json> <reference.png>")
    return sys.argv[sys.argv.index("--") + 1 :]


def render_full_views(camera, target, minimum, maximum, output_dir, character, rifle):
    snapshots = base.visibility_snapshot(character + rifle)
    for obj in rifle:
        obj.hide_render = True
    scale = max(
        (maximum.z - minimum.z) * 1.12,
        (maximum.x - minimum.x) / (1040 / 1260) * 1.04,
    )
    records = []
    for view, offset in base.VIEWS.items():
        records.append(base.write_render(
            output_dir / f"kyx-v6c-benchmark-rev11-{view}.png",
            camera, target, target + Vector(offset), scale, (1040, 1260),
            f"{view.upper()} | V6-C VISUAL BENCHMARK REV11 | CONNECTED HARD-SURFACE READ | NOT V6-C | NOT G6",
        ))
    base.restore_visibility(character + rifle, snapshots)
    return records


def render_hero_views(camera, output_dir, character, rifle):
    snapshots = base.visibility_snapshot(character + rifle)
    for obj in rifle:
        obj.hide_render = True
    target = Vector((0.0, -0.012, 0.930))
    views = [
        (
            "hero-three-quarter",
            target + Vector((2.86, -4.20, 0.23)),
            2.16,
            "HERO 3/4 | SHOULDER-TO-WAIST TENSION / PELVIS-TO-BOOT CONTINUITY / NARROW RECESSED VISOR",
        ),
        (
            "gameplay-low-three-quarter",
            target + Vector((3.30, -4.50, -0.18)),
            2.18,
            "LOW 3/4 | GAMEPLAY SILHOUETTE / LOWER-LEG MASS / CONNECTED LOAD PATHS",
        ),
    ]
    records = []
    for name, camera_location, scale, note in views:
        records.append(base.write_render(
            output_dir / f"kyx-v6c-benchmark-rev11-{name}.png",
            camera, target, camera_location, scale, (1260, 1460), note,
        ))
    base.restore_visibility(character + rifle, snapshots)
    return records


def render_components(camera, output_dir, character, rifle):
    all_objects = character + rifle
    snapshots = base.visibility_snapshot(all_objects)
    details = [
        (
            "helmet", Vector((0.0, -0.010, 1.665)), Vector((0.82, -3.30, 0.30)),
            0.48, (1280, 1000),
            "HELMET | CONNECTED COMPOUND SHELL / NARROW RECESSED VISOR / GASKET / TEMPLE + OCCIPITAL + NECK FLOW",
            False,
        ),
        (
            "torso-loadpaths", Vector((0.0, -0.010, 1.260)), Vector((1.12, -3.35, 0.30)),
            0.70, (1280, 1080),
            "TORSO | CLAVICLE + STERNUM + OBLIQUE + WAIST LOAD PATHS / FITTED OVERLAPPING SHELLS",
            False,
        ),
        (
            "rear-loadpaths", Vector((0.0, 0.012, 1.245)), Vector((1.06, 3.38, 0.32)),
            0.72, (1280, 1080),
            "BACK | SCAPULAR SHELLS / REAR LOAD RAILS / WAIST + PELVIC CONTINUITY",
            False,
        ),
        (
            "arm-articulation", Vector((0.255, -0.008, 1.125)), Vector((1.55, -3.55, 0.36)),
            0.95, (1080, 1320),
            "ARM | LOW SHOULDER / DEEP CARRIERS / NESTED ELBOW / CONTINUOUS WRIST LOAD RAIL",
            False,
        ),
        (
            "pelvis-lowerbody", Vector((0.0, -0.008, 0.660)), Vector((1.20, -3.30, 0.34)),
            1.00, (1280, 1160),
            "LOWER BODY | CLOSE PELVIC CARRIER / OVERLAPPING HIP SADDLE / THIGH + KNEE + CALF + SHIN SYSTEM",
            False,
        ),
        (
            "boots", Vector((0.0, -0.040, 0.145)), Vector((1.20, -3.20, 0.30)),
            0.58, (1320, 900),
            "BOOTS | SHIN-TO-COLLAR FLOW / ANGULAR LAST / TOE-INSTEP SHELL / QUARTER RAILS / ROCKER OUTSOLE",
            False,
        ),
        (
            "rifle", Vector((0.170, 0.0, 1.000)), Vector((1.28, -3.55, 0.42)),
            2.15, (1900, 980),
            "AUTO RIFLE | MULTI-DEPTH RECEIVER / FRAMED HANDGUARD / OPEN STOCK / OPTIC / CONTROLS + HARDWARE",
            True,
        ),
    ]
    records = []
    for name, focus, offset, scale, resolution, note, rifle_only in details:
        for obj in character:
            obj.hide_render = rifle_only or snapshots[obj.name]
        for obj in rifle:
            obj.hide_render = not rifle_only
        records.append(base.write_render(
            output_dir / f"kyx-v6c-benchmark-rev11-{name}.png",
            camera, focus, focus + offset, scale, resolution, note,
        ))
    base.restore_visibility(all_objects, snapshots)
    return records


def render_distance_views(camera, output_dir, character, rifle):
    snapshots = base.visibility_snapshot(character + rifle)
    for obj in rifle:
        obj.hide_render = True
    target = Vector((0.0, -0.012, 0.895))
    records = []
    for distance in (5.0, 12.0, 20.0, 40.0):
        label = str(int(distance))
        records.append(DISTANCE_RENDER(
            output_dir / f"kyx-v6c-benchmark-rev11-distance-{label}m.png",
            camera, target, distance,
            f"{label} M TRUE PERSPECTIVE | 50 MM / 36 MM SENSOR | CONNECTED SILHOUETTE REV11 | NOT V6-C | NOT G6",
        ))
    base.restore_visibility(character + rifle, snapshots)
    return records


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 4:
        raise SystemExit("Expected -- <blend> <render-dir> <report.json> <reference.png>")
    blend_path, output_dir, report_path, reference_path = (Path(value).resolve() for value in arguments)
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
        raise RuntimeError("Expected rev11 character and ProductionGradeAutoRifle geometry")
    minimum, maximum = base.combined_bounds(character)
    camera, target = base.configure_scene(minimum, maximum)
    bpy.context.scene.view_settings.exposure = -0.12
    full_views = render_full_views(camera, target, minimum, maximum, output_dir, character, rifle)
    hero_views = render_hero_views(camera, output_dir, character, rifle)
    component_views = render_components(camera, output_dir, character, rifle)
    distance_views = render_distance_views(camera, output_dir, character, rifle)
    direct_board = BOARD_MAKER(
        [output_dir / record["fileName"] for record in full_views],
        output_dir / "kyx-v6c-benchmark-rev11-direct-review-board.png", 3,
    )
    hero_board = BOARD_MAKER(
        [output_dir / record["fileName"] for record in hero_views]
        + [output_dir / distance_views[0]["fileName"], output_dir / distance_views[1]["fileName"]],
        output_dir / "kyx-v6c-benchmark-rev11-hero-gameplay-board.png", 2,
    )
    component_board = BOARD_MAKER(
        [output_dir / record["fileName"] for record in component_views],
        output_dir / "kyx-v6c-benchmark-rev11-component-review-board.png", 3,
    )
    source_reference_board = BOARD_MAKER(
        [reference_path, output_dir / hero_board["fileName"], output_dir / direct_board["fileName"]],
        output_dir / "kyx-v6c-benchmark-rev11-source-reference-board.png", 2,
    )
    blend_hash_after = base.sha256(blend_path)
    reference_hash_after = base.sha256(reference_path)
    report = {
        "schemaVersion": 1,
        "renderedUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "input": {"path": str(blend_path), "sha256Before": blend_hash_before, "sha256After": blend_hash_after, "unchanged": blend_hash_before == blend_hash_after},
        "sourceReference": {
            "path": str(reference_path), "sha256Before": reference_hash_before, "sha256After": reference_hash_after,
            "pinnedSha256": PINNED_REFERENCE_SHA256, "unchanged": reference_hash_before == reference_hash_after,
            "usage": "sole visual construction reference; accepted V6-A anatomy remains authoritative",
        },
        "renderExposure": -0.12,
        "characterBounds": {"minimum": [round(value, 6) for value in minimum], "maximum": [round(value, 6) for value in maximum]},
        "fullViews": full_views,
        "heroViews": hero_views,
        "componentViews": component_views,
        "distanceViews": distance_views,
        "boards": {"direct": direct_board, "heroGameplay": hero_board, "components": component_board, "sourceReference": source_reference_board},
        "contactEvidence": {
            "heldContactBoardOmittedByContract": True,
            "literalTwoHandOrShoulderContactClaimed": False,
            "note": "Three witness empties remain for a future accepted rigged phase; no contact image is presented as proof.",
        },
        "visualDecision": "PENDING_DIRECT_INSPECTION",
        "nonClaims": [
            "This packet is a V6-C visual benchmark candidate, not V6-C or G6 acceptance.",
            "No retopology, UV, rig, animation, LOD, GLB, runtime, contact, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "V6C_VISUAL_BENCHMARK_REV11_AUDIT_PACKET_COMPLETE",
        "renders": len(full_views) + len(hero_views) + len(component_views) + len(distance_views),
        "boards": 4,
        "blendSha256": blend_hash_before,
        "sourceReferenceSha256": reference_hash_before,
        "heldContactBoard": "OMITTED_BY_CONTRACT",
    }, sort_keys=True))


if __name__ == "__main__":
    main()
