"""Render read-only revision-1 versus revision-2 collision debug evidence.

This evidence renderer imports the two authority-collision GLBs into an empty
Blender scene. It does not open or save either source blend and does not export
any map asset. Geometry is compared in world space by original node name.

Run with Blender 5.1+:
  blender --background --factory-startup --python \
    render_inkfall_collision_revision_overlay.py -- \
    --revision1-collision export/collision.authority.glb \
    --candidate-collision <candidate>/export/collision.authority.glb \
    --output-dir <candidate>/overlay
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


SCRIPT_VERSION = 2

COLORS = {
    "unchanged": (0.20, 0.29, 0.42, 1.0),
    "removed": (0.95, 0.08, 0.10, 1.0),
    "added": (0.12, 0.95, 0.30, 1.0),
    "modified_old": (1.00, 0.43, 0.05, 1.0),
    "modified_new": (0.00, 0.78, 1.00, 1.0),
}


def parse_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--revision1-collision", required=True)
    parser.add_argument("--candidate-collision", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--width", type=int, default=1920)
    parser.add_argument("--height", type=int, default=1080)
    parser.add_argument(
        "--evidence-id",
        default="inkfall_foundry_p6_6a_collision_revision_overlay",
    )
    parser.add_argument(
        "--scope",
        default="P6.6A_VISUAL_COLLISION_EVIDENCE_ONLY",
    )
    parser.add_argument("--expected-candidate-count", type=int)
    parser.add_argument("--expected-removed-count", type=int)
    parser.add_argument("--expected-added-count", type=int)
    parser.add_argument("--expected-modified-count", type=int)
    return parser.parse_args(raw)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def stable_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def enum_has(rna_owner: Any, property_name: str, value: str) -> bool:
    try:
        prop = rna_owner.bl_rna.properties[property_name]
        return value in {item.identifier for item in prop.enum_items}
    except (AttributeError, KeyError, TypeError):
        return False


def import_collision(
    path: Path, *, label: str, prefix: str
) -> tuple[dict[str, bpy.types.Object], bpy.types.Collection]:
    before = set(bpy.data.objects)
    result = bpy.ops.import_scene.gltf(filepath=str(path))
    if "FINISHED" not in result:
        raise RuntimeError(f"Could not import {path}: {sorted(result)}")

    imported = [obj for obj in bpy.data.objects if obj not in before]
    meshes = [obj for obj in imported if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No collision meshes imported from {path}")

    target = bpy.data.collections.new(label)
    bpy.context.scene.collection.children.link(target)
    by_original_name: dict[str, bpy.types.Object] = {}
    for obj in sorted(meshes, key=lambda item: item.name):
        original_name = obj.name
        if original_name in by_original_name:
            raise RuntimeError(f"Duplicate GLB node name in {path}: {original_name}")
        for collection in list(obj.users_collection):
            collection.objects.unlink(obj)
        target.objects.link(obj)
        obj["evidence_original_name"] = original_name
        obj["evidence_source"] = label
        obj.name = f"{prefix}__{original_name}"
        by_original_name[original_name] = obj
    return by_original_name, target


def geometry_signature(obj: bpy.types.Object) -> str:
    world = obj.matrix_world
    vertices = sorted(
        [
            [round(axis, 6) for axis in (world @ vertex.co)]
            for vertex in obj.data.vertices
        ]
    )
    payload = {
        "vertices": vertices,
        "polygons": sorted(
            sorted(polygon.vertices[:]) for polygon in obj.data.polygons
        ),
    }
    encoded = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def material(name: str, rgba: tuple[float, float, float, float]) -> bpy.types.Material:
    item = bpy.data.materials.new(name)
    item.diffuse_color = rgba
    item.metallic = 0.0
    item.roughness = 0.78
    return item


def assign_material(obj: bpy.types.Object, item: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(item)


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    if not points:
        raise RuntimeError("No mesh bounds available")
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return minimum, maximum


def point_camera(camera: bpy.types.Object, target: Vector) -> None:
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def configure_scene(scene: bpy.types.Scene, width: int, height: int) -> None:
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False

    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "MATERIAL"
    shading.background_type = "VIEWPORT"
    shading.background_color = (0.012, 0.017, 0.026)
    shading.show_shadows = True
    shading.show_cavity = True
    shading.cavity_type = "WORLD"
    shading.curvature_ridge_factor = 1.65
    shading.curvature_valley_factor = 1.35
    shading.show_specular_highlight = False
    if hasattr(shading, "show_outline"):
        shading.show_outline = True
    if hasattr(shading, "outline_color"):
        shading.outline_color = (0.005, 0.008, 0.012)
    if hasattr(scene.display, "render_aa"):
        if enum_has(scene.display, "render_aa", "16"):
            scene.display.render_aa = "16"
        elif enum_has(scene.display, "render_aa", "FXAA"):
            scene.display.render_aa = "FXAA"

    if enum_has(scene.view_settings, "look", "AgX - Medium High Contrast"):
        scene.view_settings.look = "AgX - Medium High Contrast"


def create_camera(
    minimum: Vector, maximum: Vector, width: int, height: int
) -> bpy.types.Object:
    center = (minimum + maximum) * 0.5
    spans = maximum - minimum
    maximum_span = max(spans.x, spans.y, spans.z, 1.0)
    camera_data = bpy.data.cameras.new("CollisionEvidenceCamera")
    camera_data.type = "ORTHO"
    camera_data.lens = 50.0
    camera_data.clip_start = 0.01
    camera_data.clip_end = maximum_span * 20.0
    camera = bpy.data.objects.new("CollisionEvidenceCamera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    camera["evidence_bounds_min"] = list(minimum)
    camera["evidence_bounds_max"] = list(maximum)
    camera["evidence_center"] = list(center)
    camera["evidence_span"] = list(spans)
    camera["evidence_aspect"] = width / height
    return camera


def set_view(
    camera: bpy.types.Object,
    view: str,
    minimum: Vector,
    maximum: Vector,
    width: int,
    height: int,
) -> dict[str, Any]:
    center = (minimum + maximum) * 0.5
    spans = maximum - minimum
    maximum_span = max(spans.x, spans.y, spans.z, 1.0)
    aspect = width / height
    if view == "plan":
        camera.location = (center.x, center.y, maximum.z + maximum_span * 1.45)
        camera.data.ortho_scale = max(spans.y * 1.14, spans.x / aspect * 1.14)
        point_camera(camera, Vector((center.x, center.y, center.z)))
    elif view == "oblique":
        direction = Vector((1.05, -1.30, 0.92)).normalized()
        camera.location = center + direction * maximum_span * 2.15
        camera.data.ortho_scale = maximum_span * 1.48
        point_camera(camera, center)
    else:
        raise ValueError(view)
    return {
        "location": [round(value, 6) for value in camera.location],
        "orthographicScale": round(camera.data.ortho_scale, 6),
        "rotationEuler": [round(value, 6) for value in camera.rotation_euler],
    }


def main() -> None:
    args = parse_args()
    revision1_path = Path(args.revision1_collision).resolve()
    candidate_path = Path(args.candidate_collision).resolve()
    output_dir = Path(args.output_dir).resolve()
    if not revision1_path.is_file() or not candidate_path.is_file():
        raise RuntimeError("Both revision-1 and candidate collision GLBs are required")
    if args.width < 640 or args.height < 360:
        raise RuntimeError("Evidence resolution must be at least 640x360")
    output_dir.mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    configure_scene(scene, args.width, args.height)

    revision1, revision1_collection = import_collision(
        revision1_path, label="REVISION_1_COLLISION", prefix="REV1"
    )
    candidate, candidate_collection = import_collision(
        candidate_path, label="ATTEMPT_5_COLLISION", prefix="ATTEMPT5"
    )
    bpy.context.view_layer.update()

    revision1_names = set(revision1)
    candidate_names = set(candidate)
    common_names = revision1_names & candidate_names
    removed_names = sorted(revision1_names - candidate_names)
    added_names = sorted(candidate_names - revision1_names)
    modified_names = sorted(
        name
        for name in common_names
        if geometry_signature(revision1[name]) != geometry_signature(candidate[name])
    )
    unchanged_names = sorted(common_names - set(modified_names))

    if len(revision1) != 346:
        raise RuntimeError(
            f"Unexpected revision-1 collision mesh count: revision1={len(revision1)}"
        )
    expected_counts = {
        "candidate": (args.expected_candidate_count, len(candidate)),
        "removed": (args.expected_removed_count, len(removed_names)),
        "added": (args.expected_added_count, len(added_names)),
        "modified": (args.expected_modified_count, len(modified_names)),
    }
    drifted = {
        label: {"expected": expected, "actual": actual}
        for label, (expected, actual) in expected_counts.items()
        if expected is not None and expected != actual
    }
    if drifted:
        raise RuntimeError(f"Candidate geometry partition drifted: {drifted}")

    materials = {
        key: material(f"EVIDENCE_{key.upper()}", color)
        for key, color in COLORS.items()
    }

    for name in unchanged_names:
        assign_material(revision1[name], materials["unchanged"])
        assign_material(candidate[name], materials["unchanged"])
    for name in removed_names:
        assign_material(revision1[name], materials["removed"])
    for name in added_names:
        assign_material(candidate[name], materials["added"])
    for name in modified_names:
        assign_material(revision1[name], materials["modified_old"])
        assign_material(candidate[name], materials["modified_new"])
        wire = revision1[name].modifiers.new("EVIDENCE_OLD_GEOMETRY_WIREFRAME", "WIREFRAME")
        wire.thickness = 0.055
        wire.use_replace = True
        wire.show_render = False

    all_objects = list(revision1.values()) + list(candidate.values())
    minimum, maximum = world_bounds(all_objects)
    camera = create_camera(minimum, maximum, args.width, args.height)

    render_records: list[dict[str, Any]] = []

    def set_visibility(mode: str) -> None:
        for name, obj in revision1.items():
            obj.hide_render = not (
                mode == "revision1"
                or (mode == "overlay" and name in set(removed_names + modified_names))
            )
        for obj in candidate.values():
            obj.hide_render = mode == "revision1"
        for name in modified_names:
            modifier = revision1[name].modifiers.get("EVIDENCE_OLD_GEOMETRY_WIREFRAME")
            if modifier is not None:
                modifier.show_render = mode == "overlay"
        revision1_collection.hide_render = False
        candidate_collection.hide_render = False

    filenames = {
        "revision1": "revision1-authority-collision",
        "candidate": "candidate-authority-collision",
        "overlay": "revision1-vs-candidate-collision-diff",
    }
    for mode in ("revision1", "candidate", "overlay"):
        set_visibility(mode)
        for view in ("plan", "oblique"):
            camera_record = set_view(camera, view, minimum, maximum, args.width, args.height)
            output_path = output_dir / f"{filenames[mode]}-{view}.png"
            scene.render.filepath = str(output_path)
            result = bpy.ops.render.render(write_still=True)
            if "FINISHED" not in result or not output_path.is_file():
                raise RuntimeError(f"Render failed for {output_path}: {sorted(result)}")
            render_records.append(
                {
                    "bytes": output_path.stat().st_size,
                    "camera": camera_record,
                    "height": args.height,
                    "mode": mode,
                    "path": output_path.name,
                    "sha256": sha256_file(output_path),
                    "view": view,
                    "width": args.width,
                }
            )

    report = {
        "blenderVersion": bpy.app.version_string,
        "candidate": {
            "meshNodeCount": len(candidate),
            "path": str(candidate_path),
            "sha256": sha256_file(candidate_path),
        },
        "comparison": {
            "added": added_names,
            "addedCount": len(added_names),
            "commonCount": len(common_names),
            "modified": modified_names,
            "modifiedCount": len(modified_names),
            "removed": removed_names,
            "removedCount": len(removed_names),
            "unchangedCount": len(unchanged_names),
        },
        "evidenceId": args.evidence_id,
        "legend": {
            "addedCandidate": {"color": "green", "rgba": COLORS["added"]},
            "modifiedCandidate": {"color": "cyan", "rgba": COLORS["modified_new"]},
            "modifiedRevision1Wire": {"color": "orange", "rgba": COLORS["modified_old"]},
            "removedRevision1": {"color": "red", "rgba": COLORS["removed"]},
            "unchanged": {"color": "slate", "rgba": COLORS["unchanged"]},
        },
        "nonClaims": [
            "P6_7_TOPOLOGY_LOCK_NOT_CLAIMED",
            "G5_NOT_PASSED",
            "HUMAN_ACCEPTANCE_NOT_RUN",
            "FINAL_ART_NOT_CLAIMED",
        ],
        "renders": render_records,
        "revision1": {
            "meshNodeCount": len(revision1),
            "path": str(revision1_path),
            "sha256": sha256_file(revision1_path),
        },
        "schemaVersion": 1,
        "script": {
            "path": str(Path(__file__).resolve()),
            "sha256": sha256_file(Path(__file__).resolve()),
            "version": SCRIPT_VERSION,
        },
        "scope": args.scope,
    }
    stable_write_json(output_dir / "collision-overlay-report.json", report)

    readme = f"""# P6.6A frozen-candidate authority-collision overlay

Read-only Blender 5.1 debug renders comparing preserved revision 1 with the
frozen revision-2 collision candidate.

## Legend

- Slate: geometry unchanged between the two GLBs.
- Red: revision-1 geometry removed in the candidate.
- Green: geometry added in the candidate.
- Orange wire: old geometry for a same-name modified collider.
- Cyan: candidate geometry for a same-name modified collider.

Comparison: {len(revision1)} revision-1 meshes, {len(candidate)} candidate meshes,
{len(removed_names)} removed, {len(added_names)} added, {len(modified_names)} modified,
and {len(unchanged_names)} unchanged. Exact names and SHA-256 values are in
`collision-overlay-report.json`.

These images are P6.6A visual collision evidence only. They do not claim P6.7,
G5, final art, or human acceptance.
"""
    (output_dir / "README.md").write_text(readme, encoding="utf-8", newline="\n")
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
