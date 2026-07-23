"""Render the isolated V6-B attempt-3 fitted-construction review packet."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


BODY_NAME = "KYX_V6B_V3_AcceptedAnatomyUnderlayer"
VIEWS = {
    "front": (0.0, -4.4, 0.02),
    "side": (4.4, 0.0, 0.02),
    "back": (0.0, 4.4, 0.02),
    "three-quarter": (3.2, -3.2, 0.22),
}


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <v6b-v3.blend> <render-dir> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def point_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def collection_descends_from(obj: bpy.types.Object, collection_name: str) -> bool:
    return any(collection.name == collection_name for collection in obj.users_collection)


def character_geometry() -> list[bpy.types.Object]:
    return [
        obj for obj in bpy.context.scene.objects
        if obj.type in {"MESH", "CURVE"}
        and not collection_descends_from(obj, "KYX_V6B_V3_StandaloneRifleDesign")
    ]


def rifle_geometry() -> list[bpy.types.Object]:
    return [
        obj for obj in bpy.context.scene.objects
        if obj.type in {"MESH", "CURVE"}
        and collection_descends_from(obj, "KYX_V6B_V3_StandaloneRifleDesign")
    ]


def combined_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points: list[Vector] = []
    for obj in objects:
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        raise RuntimeError("No geometry for bounds")
    minimum = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    maximum = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    return minimum, maximum


def review_material(name: str, color: tuple[float, float, float, float], roughness: float) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    return material


def add_area(
    name: str,
    location: tuple[float, float, float],
    energy: float,
    size: float,
    color: tuple[float, float, float],
    target: Vector,
) -> None:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    point_at(obj, target)


def configure_scene(minimum: Vector, maximum: Vector) -> tuple[bpy.types.Object, Vector]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.use_stamp = True
    scene.render.use_stamp_note = True
    for property_name in (
        "use_stamp_date", "use_stamp_time", "use_stamp_render_time", "use_stamp_frame",
        "use_stamp_frame_range", "use_stamp_memory", "use_stamp_hostname", "use_stamp_camera",
        "use_stamp_lens", "use_stamp_scene", "use_stamp_marker", "use_stamp_filename",
        "use_stamp_sequencer_strip",
    ):
        if hasattr(scene.render, property_name):
            setattr(scene.render, property_name, False)
    scene.render.stamp_font_size = 15
    scene.render.stamp_foreground = (0.98, 0.98, 0.95, 1.0)
    scene.render.stamp_background = (0.006, 0.008, 0.010, 0.84)
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = scene.world or bpy.data.worlds.new("V6B_V3_REVIEW_World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.012, 0.017, 0.022, 1.0)
    background.inputs["Strength"].default_value = 0.22

    target = (minimum + maximum) * 0.5
    target.z = minimum.z + (maximum.z - minimum.z) * 0.51
    floor_material = review_material("V6B_V3_REVIEW_Floor", (0.025, 0.031, 0.037, 1.0), 0.88)
    bpy.ops.mesh.primitive_plane_add(size=8.0, location=(0.0, 0.0, minimum.z - 0.012))
    floor = bpy.context.object
    floor.name = "V6B_V3_REVIEW_Floor"
    floor.data.materials.append(floor_material)

    add_area("V6B_V3_REVIEW_Key", (2.6, -3.5, 3.1), 1350.0, 2.5, (1.0, 0.81, 0.64), target)
    add_area("V6B_V3_REVIEW_Fill", (-2.8, -1.4, 1.7), 900.0, 2.8, (0.49, 0.72, 1.0), target)
    add_area("V6B_V3_REVIEW_Rim", (0.2, 3.4, 2.5), 1550.0, 2.1, (0.55, 0.85, 1.0), target)
    add_area("V6B_V3_REVIEW_Top", (0.0, 0.0, 3.5), 650.0, 2.2, (1.0, 0.94, 0.84), target)

    camera_data = bpy.data.cameras.new("V6B_V3_REVIEW_Camera")
    camera = bpy.data.objects.new("V6B_V3_REVIEW_Camera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    scene.camera = camera
    return camera, target


def visibility_snapshot(objects: list[bpy.types.Object]) -> dict[str, bool]:
    return {obj.name: obj.hide_render for obj in objects}


def restore_visibility(objects: list[bpy.types.Object], snapshot: dict[str, bool]) -> None:
    for obj in objects:
        obj.hide_render = snapshot[obj.name]


def write_render(
    output_path: Path,
    camera: bpy.types.Object,
    target: Vector,
    location: Vector,
    ortho_scale: float,
    resolution: tuple[int, int],
    note: str,
) -> dict[str, object]:
    scene = bpy.context.scene
    camera.data.type = "ORTHO"
    camera.location = location
    point_at(camera, target)
    camera.data.ortho_scale = ortho_scale
    scene.render.resolution_x, scene.render.resolution_y = resolution
    scene.render.filepath = str(output_path)
    scene.render.stamp_note_text = note
    bpy.context.view_layer.update()
    bpy.ops.render.render(write_still=True)
    return {
        "view": output_path.stem,
        "fileName": output_path.name,
        "bytes": output_path.stat().st_size,
        "sha256": sha256(output_path),
        "cameraLocation": [round(value, 6) for value in camera.location],
        "target": [round(value, 6) for value in target],
        "orthographicScale": round(ortho_scale, 6),
        "resolution": list(resolution),
    }


def render_full_views(
    camera: bpy.types.Object,
    target: Vector,
    minimum: Vector,
    maximum: Vector,
    output_dir: Path,
    character: list[bpy.types.Object],
    rifle: list[bpy.types.Object],
) -> list[dict[str, object]]:
    snapshots = visibility_snapshot(character + rifle)
    for obj in character:
        obj.hide_render = obj.name == BODY_NAME
    for obj in rifle:
        obj.hide_render = True
    height = maximum.z - minimum.z
    width = maximum.x - minimum.x
    scale = max(height * 1.15, width / (900 / 1100) * 1.06)
    records: list[dict[str, object]] = []
    for view, offset in VIEWS.items():
        records.append(write_render(
            output_dir / f"kyx-v6b-v3-fitted-{view}.png",
            camera, target, target + Vector(offset), scale, (900, 1100),
            f"{view.upper()} | V6-B ATTEMPT 3 | BODY-SURFACE FITTED CONSTRUCTION | DIRECT REVIEW | NOT G6",
        ))
    restore_visibility(character + rifle, snapshots)
    return records


def render_details(
    camera: bpy.types.Object,
    output_dir: Path,
    character: list[bpy.types.Object],
    rifle: list[bpy.types.Object],
) -> list[dict[str, object]]:
    scene_objects = character + rifle
    snapshots = visibility_snapshot(scene_objects)
    details = [
        (
            "helmet-chest", Vector((0.0, -0.020, 1.465)), Vector((1.35, -3.1, 0.70)), 0.70, (1000, 1000),
            "HELMET / COWL / CHEST FIT | SURFACE-DERIVED SHELLS + MANUFACTURED EDGES | NOT G6", False,
        ),
        (
            "limb-fit", Vector((0.230, -0.020, 0.800)), Vector((1.55, -3.4, 0.55)), 1.30, (900, 1100),
            "SHOULDER / FOREARM / THIGH / KNEE / SHIN FIT | JOINT GAPS RETAINED | NOT G6", False,
        ),
        (
            "boot-detail", Vector((0.0, -0.060, 0.120)), Vector((1.2, -3.0, 0.55)), 0.46, (1100, 760),
            "BOOT UPPER / TOE / ROUNDED OUTSOLE / SEPARATE TREADS | NOT FINAL RETOPO | NOT G6", False,
        ),
        (
            "rifle-design", Vector((0.180, -0.020, 1.150)), Vector((0.90, -4.0, 0.42)), 1.12, (1400, 760),
            "STANDALONE RIFLE DESIGN | STOCK / RECEIVER / GRIP / MAG / HANDGUARD / BARREL | CONTACT OPEN", True,
        ),
    ]
    records: list[dict[str, object]] = []
    for name, target, offset, scale, resolution, note, rifle_only in details:
        for obj in character:
            obj.hide_render = rifle_only or obj.name == BODY_NAME
        for obj in rifle:
            obj.hide_render = not rifle_only
        records.append(write_render(
            output_dir / f"kyx-v6b-v3-{name}.png",
            camera, target, target + offset, scale, resolution, note,
        ))
    restore_visibility(scene_objects, snapshots)
    return records


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 3:
        raise SystemExit("Expected -- <v6b-v3.blend> <render-dir> <report.json>")
    blend_path, output_dir, report_path = (Path(value).resolve() for value in arguments)
    blend_hash_before = sha256(blend_path)
    bpy.ops.wm.open_mainfile(filepath=str(blend_path), load_ui=False, use_scripts=False)
    body = bpy.data.objects.get(BODY_NAME)
    if body is None:
        raise RuntimeError(f"Missing expected body: {BODY_NAME}")
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    character = character_geometry()
    rifle = rifle_geometry()
    if not character or not rifle:
        raise RuntimeError("Expected both character and standalone rifle geometry")
    minimum, maximum = combined_bounds(character)
    camera, target = configure_scene(minimum, maximum)
    full_views = render_full_views(camera, target, minimum, maximum, output_dir, character, rifle)
    detail_views = render_details(camera, output_dir, character, rifle)
    blend_hash_after = sha256(blend_path)
    report = {
        "schemaVersion": 1,
        "renderedUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": "V6-B_ATTEMPT_3_FITTED_CONSTRUCTION",
        "input": {
            "path": blend_path.name,
            "sha256Before": blend_hash_before,
            "sha256After": blend_hash_after,
            "unchanged": blend_hash_before == blend_hash_after,
        },
        "characterBounds": {
            "minimum": [round(value, 6) for value in minimum],
            "maximum": [round(value, 6) for value in maximum],
        },
        "fullViews": full_views,
        "detailViews": detail_views,
        "visualDecision": "PENDING_DIRECT_INSPECTION",
        "nonClaims": [
            "These are construction-review renders, not a G6 decision.",
            "The rifle is deliberately standalone; two-hand and shoulder contact remain open.",
            "No rig, animation, runtime export, final retopology, UV, texture, LOD, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "V6B_V3_RENDERS_COMPLETE_PENDING_VISUAL_AUDIT", "renders": len(full_views) + len(detail_views), "blendSha256": blend_hash_before}, sort_keys=True))


if __name__ == "__main__":
    main()
