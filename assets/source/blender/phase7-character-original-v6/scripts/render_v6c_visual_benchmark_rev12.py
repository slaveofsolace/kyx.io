"""Render the strict, self-rejecting V6-C revision 12 visual audit packet."""

from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


PREFIX = "KYX_V6C_BENCH_R12_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV12"
RIFLE_COLLECTION = PREFIX + "ProductionHardSurfaceRifle"
PINNED_REFERENCE_SHA256 = "9c188fa32daaeec2d284727a5d9e600f94b8b57fee6f0568c7ebac9d462abdd2"

PREVIEW_PATH = Path(__file__).with_name("render_v6c_visual_benchmark_rev12_preview.py")
SPEC = importlib.util.spec_from_file_location("kyx_rev12_audit_utilities", PREVIEW_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load rev12 preview utilities: {PREVIEW_PATH}")
p = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(p)
base = p.base
BOARD_MAKER = p.u.BOARD_MAKER
DISTANCE_RENDER = p.u.DISTANCE_RENDER


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <rev12.blend> <render-dir> <report.json> <reference.png>")
    return sys.argv[sys.argv.index("--") + 1 :]


def geometry_sets() -> tuple[list[bpy.types.Object], list[bpy.types.Object]]:
    rifle_collection = bpy.data.collections.get(RIFLE_COLLECTION)
    rifle = list(rifle_collection.all_objects) if rifle_collection else []
    rifle_ids = {id(obj) for obj in rifle}
    character = [
        obj for obj in bpy.data.objects
        if obj.name.startswith(PREFIX) and obj.type in {"MESH", "CURVE"} and id(obj) not in rifle_ids
    ]
    return character, rifle


def full_views(camera, character, rifle, minimum, maximum, output_dir: Path) -> list[dict]:
    snapshots = base.visibility_snapshot(character + rifle)
    for obj in rifle:
        obj.hide_render = True
    target = Vector((0.0, -0.005, (minimum.z + maximum.z) * 0.5))
    scale = max((maximum.z - minimum.z) * 1.10, (maximum.x - minimum.x) / (1080 / 1320) * 1.05)
    records = []
    for label, offset in (
        ("front", Vector((0.0, -4.55, 0.02))),
        ("side", Vector((4.55, 0.0, 0.02))),
        ("back", Vector((0.0, 4.55, 0.02))),
        ("three-quarter", Vector((3.08, -3.62, 0.18))),
        ("rear-three-quarter", Vector((-3.08, 3.62, 0.18))),
    ):
        records.append(base.write_render(
            output_dir / f"kyx-v6c-benchmark-rev12-{label}.png",
            camera, target, target + offset, scale, (1080, 1320),
            f"{label.upper()} | REV12 CHANGED-STRATEGY AUDIT | SELF-REJECTED | NOT V6-C | NOT G6",
        ))
    base.restore_visibility(character + rifle, snapshots)
    return records


def hero_views(camera, character, rifle, output_dir: Path) -> list[dict]:
    snapshots = base.visibility_snapshot(character + rifle)
    for obj in rifle:
        obj.hide_render = True
    target = Vector((0.0, -0.015, 1.020))
    records = [
        base.write_render(
            output_dir / "kyx-v6c-benchmark-rev12-hero-three-quarter.png",
            camera, target, target + Vector((2.90, -4.10, 0.28)), 2.02, (1280, 1460),
            "HERO 3/4 | ATHLETIC LOFT / FITTED SHELL STRATEGY | SELF-REJECTED | NOT V6-C",
        ),
        base.write_render(
            output_dir / "kyx-v6c-benchmark-rev12-gameplay-low-three-quarter.png",
            camera, target, target + Vector((3.20, -4.35, -0.10)), 2.08, (1280, 1460),
            "LOW 3/4 | GAMEPLAY SILHOUETTE / BOOT AND LOWER-LEG READ | SELF-REJECTED",
        ),
    ]
    base.restore_visibility(character + rifle, snapshots)
    return records


def render_subset(
    name: str,
    subset: list[bpy.types.Object],
    all_objects: list[bpy.types.Object],
    camera: bpy.types.Object,
    output_dir: Path,
    *,
    offset: Vector,
    resolution: tuple[int, int] = (1280, 1000),
    title: str,
) -> dict:
    snapshots = base.visibility_snapshot(all_objects)
    subset_ids = {id(obj) for obj in subset}
    for obj in all_objects:
        obj.hide_render = id(obj) not in subset_ids
    minimum, maximum = base.combined_bounds(subset)
    target = (minimum + maximum) * 0.5
    aspect = resolution[0] / resolution[1]
    scale = max((maximum.z - minimum.z) * 1.30, (maximum.x - minimum.x) / aspect * 1.20, 0.30)
    record = base.write_render(output_dir / f"kyx-v6c-benchmark-rev12-{name}.png", camera, target, target + offset, scale, resolution, title)
    base.restore_visibility(all_objects, snapshots)
    return record


def component_views(camera, character, rifle, output_dir: Path) -> list[dict]:
    all_objects = character + rifle
    helmet = [obj for obj in character if any(token in obj.name for token in ("Helmet", "Neck"))]
    torso = [obj for obj in character if any(token in obj.name for token in ("Chest_", "Abdomen_", "Clavicle", "Sternum", "Oblique"))]
    lower = [obj for obj in character if any(token in obj.name for token in ("Pelvis_", "Thigh_", "Knee_", "Shin_", "Calf_"))]
    boots = [obj for obj in character if "Boot_" in obj.name or "AnklePivot" in obj.name]
    rear = [obj for obj in character if any(token in obj.name for token in ("Back_", "Rear", "Sacrum", "Calf_"))]
    return [
        render_subset("component-helmet", helmet, all_objects, camera, output_dir, offset=Vector((1.35, -3.10, 0.35)), title="HELMET | COMPOUND APERTURE / SEGMENTED CROWN / OCCIPITAL SYSTEM | SELF-REJECTED"),
        render_subset("component-torso", torso, all_objects, camera, output_dir, offset=Vector((1.65, -3.45, 0.25)), title="TORSO | CLAVICLE / STERNUM / OBLIQUE LOAD PATH | SELF-REJECTED"),
        render_subset("component-lower-body", lower, all_objects, camera, output_dir, offset=Vector((1.55, -3.35, 0.15)), title="LOWER BODY | HIP / THIGH / KNEE / SHIN ARTICULATION | SELF-REJECTED"),
        render_subset("component-boots", boots, all_objects, camera, output_dir, offset=Vector((1.40, -3.00, 0.20)), title="BOOTS | CONTOURED OUTSOLE / ANATOMICAL UPPER / LACE BRIDGES | SELF-REJECTED"),
        render_subset("component-rear-carrier", rear, all_objects, camera, output_dir, offset=Vector((-1.45, 3.20, 0.20)), title="REAR | SCAPULAR / SPINE PACK / LUMBAR / HIP CARRIER | SELF-REJECTED"),
        render_subset("component-rifle", rifle, all_objects, camera, output_dir, offset=Vector((0.0, -3.20, 0.06)), resolution=(1600, 760), title="RIFLE | RECEIVER / STOCK / HANDGUARD / GRIP / MAGAZINE / BARREL | SELF-REJECTED"),
    ]


def distance_views(camera, character, rifle, output_dir: Path) -> list[dict]:
    snapshots = base.visibility_snapshot(character + rifle)
    for obj in rifle:
        obj.hide_render = True
    minimum, maximum = base.combined_bounds(character)
    target = Vector((0.0, -0.005, (minimum.z + maximum.z) * 0.5))
    records = []
    for distance in (5, 12, 20):
        records.append(DISTANCE_RENDER(
            output_dir / f"kyx-v6c-benchmark-rev12-distance-{distance}m.png",
            camera, target, float(distance),
            f"{distance} M TRUE PERSPECTIVE | 50 MM / 36 MM SENSOR | GAMEPLAY READ | SELF-REJECTED | NOT V6-C",
        ))
    base.restore_visibility(character + rifle, snapshots)
    return records


def contact_views(camera, character, rifle, output_dir: Path) -> tuple[list[dict], dict]:
    for obj in character + rifle:
        obj.hide_render = False
    p.stage_literal_contact_pose(character)
    primary_target = Vector((-0.250573, -0.141000, 1.313522))
    support_target = Vector((0.168362, -0.134876, 1.278882))
    shoulder_target = Vector((-0.493559, -0.079878, 1.403323))
    primary_hand = p.closest_evaluated_distance([obj for obj in character if "L_Glove" in obj.name], primary_target)
    primary_weapon = p.closest_evaluated_distance([obj for obj in rifle if "PistolGrip" in obj.name or "TriggerGuard" in obj.name], primary_target)
    support_hand = p.closest_evaluated_distance([obj for obj in character if "R_Glove" in obj.name], support_target)
    support_weapon = p.closest_evaluated_distance([obj for obj in rifle if "Foregrip" in obj.name or "Handguard" in obj.name], support_target)
    shoulder_body = p.closest_evaluated_distance([obj for obj in character if "L_Shoulder" in obj.name or "Chest_L" in obj.name], shoulder_target)
    shoulder_weapon = p.closest_evaluated_distance([obj for obj in rifle if "Stock" in obj.name or "BufferBridge" in obj.name], shoulder_target)
    metrics = {
        "primary": {"handMeters": primary_hand, "weaponMeters": primary_weapon, "worstSideMeters": max(primary_hand, primary_weapon)},
        "support": {"handMeters": support_hand, "weaponMeters": support_weapon, "worstSideMeters": max(support_hand, support_weapon)},
        "shoulder": {"bodyMeters": shoulder_body, "weaponMeters": shoulder_weapon, "worstSideMeters": max(shoulder_body, shoulder_weapon)},
        "method": "Static deterministic arm-surface deformation for visual proof only; no rig or animation claim.",
    }
    title = (
        f"STATIC CONTACT AUDIT | PRIMARY {metrics['primary']['worstSideMeters']*1000:.1f} MM | "
        f"SUPPORT {metrics['support']['worstSideMeters']*1000:.1f} MM | "
        f"SHOULDER {metrics['shoulder']['worstSideMeters']*1000:.1f} MM | NO RIG CLAIM"
    )
    target = Vector((0.0, -0.145, 1.325))
    records = [
        base.write_render(
            output_dir / "kyx-v6c-benchmark-rev12-held-contact.png",
            camera, target, target + Vector((-2.65, -3.75, 0.32)), 1.90, (1200, 1400), title,
        ),
        base.write_render(
            output_dir / "kyx-v6c-benchmark-rev12-held-contact-close.png",
            camera, target + Vector((0.0, -0.025, 0.020)), target + Vector((-2.25, -3.35, 0.30)), 1.20, (1400, 1000), title,
        ),
    ]
    return records, metrics


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 4:
        raise SystemExit("Expected -- <rev12.blend> <render-dir> <report.json> <reference.png>")
    blend_path, output_dir, report_path, reference_path = (Path(value).resolve() for value in arguments)
    blend_hash_before = base.sha256(blend_path)
    reference_hash_before = base.sha256(reference_path)
    if reference_hash_before != PINNED_REFERENCE_SHA256:
        raise RuntimeError(f"Pinned concept hash mismatch: {reference_hash_before}")
    bpy.ops.wm.open_mainfile(filepath=str(blend_path), load_ui=False, use_scripts=False)
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    character, rifle = geometry_sets()
    if not character or not rifle:
        raise RuntimeError("Expected isolated rev12 character and rifle geometry")
    minimum, maximum = base.combined_bounds(character)
    camera, _ = base.configure_scene(minimum, maximum)
    bpy.context.scene.view_settings.exposure = -0.58
    full = full_views(camera, character, rifle, minimum, maximum, output_dir)
    heroes = hero_views(camera, character, rifle, output_dir)
    components = component_views(camera, character, rifle, output_dir)
    distances = distance_views(camera, character, rifle, output_dir)
    contacts, contact_metrics = contact_views(camera, character, rifle, output_dir)
    direct_board = BOARD_MAKER([output_dir / record["fileName"] for record in full], output_dir / "kyx-v6c-benchmark-rev12-direct-audit-board.png", 3)
    gameplay_board = BOARD_MAKER(
        [output_dir / record["fileName"] for record in heroes] + [output_dir / record["fileName"] for record in distances],
        output_dir / "kyx-v6c-benchmark-rev12-gameplay-distance-board.png", 2,
    )
    component_board = BOARD_MAKER([output_dir / record["fileName"] for record in components], output_dir / "kyx-v6c-benchmark-rev12-component-audit-board.png", 3)
    contact_board = BOARD_MAKER([output_dir / record["fileName"] for record in contacts], output_dir / "kyx-v6c-benchmark-rev12-contact-audit-board.png", 2)
    comparison_board = BOARD_MAKER(
        [reference_path, output_dir / heroes[0]["fileName"], output_dir / direct_board["fileName"], output_dir / component_board["fileName"]],
        output_dir / "kyx-v6c-benchmark-rev12-concept-comparison-board.png", 2,
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
        },
        "renderExposure": -0.58,
        "characterBounds": {"minimum": [round(value, 6) for value in minimum], "maximum": [round(value, 6) for value in maximum]},
        "fullViews": full,
        "heroViews": heroes,
        "componentViews": components,
        "distanceViews": distances,
        "contactViews": contacts,
        "contactMetrics": contact_metrics,
        "boards": {
            "direct": direct_board, "gameplayDistance": gameplay_board, "components": component_board,
            "contact": contact_board, "conceptComparison": comparison_board,
        },
        "visualDecision": "SELF_REJECTED_NOT_ACCEPTED_NOT_V6C_NOT_G6",
        "decisionReasons": [
            "Changed strategy and proportions are materially better than rev11, but the result still reads simplified and toy-like against the pinned concept.",
            "Primary shells and rifle surfaces lack production-grade authored tertiary structure and material breakup.",
            "Static hands establish measured contact but do not convincingly wrap the controls; no held-animation claim is made.",
            "Distinctive detail collapses too aggressively at 12 m and 20 m.",
        ],
        "nonClaims": [
            "This is a strict rejection packet, not visual acceptance.",
            "No rig, animation, UV, texture bake, LOD, GLB, runtime integration, or performance acceptance is claimed.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "REV12_STRICT_AUDIT_PACKET_COMPLETE_SELF_REJECTED", "renders": len(full) + len(heroes) + len(components) + len(distances) + len(contacts),
        "boards": 5, "blendSha256": blend_hash_before, "referenceSha256": reference_hash_before,
        "contactWorstMillimeters": {key: round(value["worstSideMeters"] * 1000.0, 3) for key, value in contact_metrics.items() if isinstance(value, dict)},
    }, sort_keys=True))


if __name__ == "__main__":
    main()
