"""Render direct V6-B construction and rifle-contact review plates."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


BODY_NAME = "KYX_V6B_Accepted_AnatomyUnderlayer"
EXPECTED_SHA256 = "9b1663e673a0b502bf3add5b8152e5e05d53b0fab5e244f973c4f202931b1181"
VIEWS = {
    "front": (0.0, -4.4, 0.04),
    "side": (4.4, 0.0, 0.04),
    "back": (0.0, 4.4, 0.04),
    "three-quarter": (3.2, -3.2, 0.18),
}


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <v6b.blend> <render-dir> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def point_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def all_render_meshes() -> list[bpy.types.Object]:
    return [obj for obj in bpy.context.scene.objects if obj.type in {"MESH", "CURVE"} and not obj.hide_render]


def combined_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points: list[Vector] = []
    for obj in objects:
        if obj.type == "MESH":
            points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
        elif obj.type == "CURVE":
            points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        raise RuntimeError("No renderable geometry")
    return (
        Vector(tuple(min(point[axis] for point in points) for axis in range(3))),
        Vector(tuple(max(point[axis] for point in points) for axis in range(3))),
    )


def review_material(name: str, color: tuple[float, float, float, float], roughness: float) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    return material


def add_area(name: str, location: tuple[float, float, float], energy: float, size: float,
             color: tuple[float, float, float], target: Vector) -> None:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    light = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(light)
    light.location = location
    point_at(light, target)


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
    scene.render.use_stamp_date = False
    scene.render.use_stamp_time = False
    scene.render.use_stamp_render_time = False
    scene.render.use_stamp_frame = False
    scene.render.use_stamp_frame_range = False
    scene.render.use_stamp_memory = False
    scene.render.use_stamp_hostname = False
    scene.render.use_stamp_camera = False
    scene.render.use_stamp_lens = False
    scene.render.use_stamp_scene = False
    scene.render.use_stamp_marker = False
    scene.render.use_stamp_filename = False
    scene.render.use_stamp_sequencer_strip = False
    scene.render.stamp_font_size = 16
    scene.render.stamp_foreground = (0.98, 0.98, 0.95, 1.0)
    scene.render.stamp_background = (0.006, 0.008, 0.010, 0.84)
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = scene.world or bpy.data.worlds.new("V6B_REVIEW_World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.015, 0.020, 0.025, 1.0)
    background.inputs["Strength"].default_value = 0.25

    target = (minimum + maximum) * 0.5
    target.z = (minimum.z + maximum.z) * 0.50
    floor_material = review_material("V6B_REVIEW_Floor", (0.030, 0.035, 0.040, 1.0), 0.88)
    bpy.ops.mesh.primitive_plane_add(size=8.0, location=(0.0, 0.0, minimum.z - 0.004))
    floor = bpy.context.object
    floor.name = "V6B_REVIEW_Floor"
    floor.data.materials.append(floor_material)

    add_area("V6B_REVIEW_Key", (2.8, -3.6, 3.0), 1250.0, 2.4, (1.0, 0.80, 0.63), target)
    add_area("V6B_REVIEW_Fill", (-2.8, -1.2, 1.5), 750.0, 2.8, (0.56, 0.76, 1.0), target)
    add_area("V6B_REVIEW_Rim", (0.4, 3.2, 2.4), 1450.0, 2.0, (0.58, 0.86, 1.0), target)
    add_area("V6B_REVIEW_Top", (0.0, 0.0, 3.4), 600.0, 2.2, (1.0, 0.93, 0.84), target)

    camera_data = bpy.data.cameras.new("V6B_REVIEW_Camera")
    camera = bpy.data.objects.new("V6B_REVIEW_Camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera, target


def render_full_views(camera: bpy.types.Object, target: Vector, minimum: Vector, maximum: Vector,
                      output_dir: Path) -> list[dict[str, object]]:
    scene = bpy.context.scene
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    camera.data.type = "ORTHO"
    height = maximum.z - minimum.z
    width = maximum.x - minimum.x
    camera.data.ortho_scale = max(height * 1.16, width / (900 / 1100) * 1.08)
    records: list[dict[str, object]] = []
    rifle_objects = [obj for obj in scene.objects if obj.name.startswith("KYX_V6B_Rifle")]
    prior_rifle_visibility = {obj.name: obj.hide_render for obj in rifle_objects}
    for obj in rifle_objects:
        obj.hide_render = True
    for view, offset in VIEWS.items():
        camera.location = target + Vector(offset)
        point_at(camera, target)
        scene.render.filepath = str(output_dir / f"kyx-v6b-construction-{view}.png")
        scene.render.stamp_note_text = (
            f"{view.upper()} | V6-B CONSTRUCTION REVIEW | ACCEPTED V6-A ANATOMY | "
            "GARMENT / ARMOR / HELMET / RIFLE | NOT G6"
        )
        bpy.context.view_layer.update()
        bpy.ops.render.render(write_still=True)
        path = Path(scene.render.filepath)
        records.append({
            "view": view,
            "fileName": path.name,
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
            "cameraLocation": [round(value, 6) for value in camera.location],
            "orthographicScale": round(camera.data.ortho_scale, 6),
        })
    for obj in rifle_objects:
        obj.hide_render = prior_rifle_visibility[obj.name]
    return records


def render_closeups(camera: bpy.types.Object, output_dir: Path) -> list[dict[str, object]]:
    scene = bpy.context.scene
    records: list[dict[str, object]] = []
    camera.data.type = "ORTHO"
    closeups = [
        ("rifle-design", (0.15, -0.055, 1.14), (0.0, -3.8, 0.0), 0.62, 1280, 700,
         "RIFLE CONSTRUCTION | STOCK / RECEIVER / GRIP / MAG / HANDGUARD / BARREL | CONTACT OPEN", True),
        ("helmet-chest", (0.0, -0.05, 1.43), (0.0, -3.8, 0.02), 0.82, 900, 900,
         "HELMET + COWL + CHEST | FITTED SEAMS / ASYMMETRY | V6-B | NOT G6", False),
    ]
    render_geometry = [obj for obj in scene.objects if obj.type in {"MESH", "CURVE"}]
    rifle_objects = {obj.name for obj in render_geometry if obj.name.startswith("KYX_V6B_Rifle")}
    for name, target_tuple, offset, scale, width, height, note, rifle_only in closeups:
        prior_visibility = {obj.name: obj.hide_render for obj in render_geometry}
        for obj in render_geometry:
            obj.hide_render = (obj.name not in rifle_objects) if rifle_only else (obj.name in rifle_objects)
        close_target = Vector(target_tuple)
        camera.location = close_target + Vector(offset)
        point_at(camera, close_target)
        camera.data.ortho_scale = scale
        scene.render.resolution_x = width
        scene.render.resolution_y = height
        scene.render.filepath = str(output_dir / f"kyx-v6b-{name}.png")
        scene.render.stamp_note_text = note
        bpy.context.view_layer.update()
        bpy.ops.render.render(write_still=True)
        path = Path(scene.render.filepath)
        records.append({"view": name, "fileName": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)})
        for obj in render_geometry:
            obj.hide_render = prior_visibility[obj.name]
    return records


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 3:
        raise SystemExit("Expected -- <v6b.blend> <render-dir> <report.json>")
    blend_path, output_dir, report_path = (Path(value).resolve() for value in arguments)
    blend_hash = sha256(blend_path)
    if blend_hash != EXPECTED_SHA256:
        raise RuntimeError(f"Unexpected V6-B Blend hash: {blend_hash}")
    bpy.ops.wm.open_mainfile(filepath=str(blend_path), load_ui=False, use_scripts=False)
    if bpy.data.objects.get(BODY_NAME) is None:
        raise RuntimeError(f"Missing V6-B body: {BODY_NAME}")
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    geometry = all_render_meshes()
    minimum, maximum = combined_bounds(geometry)
    camera, target = configure_scene(minimum, maximum)
    full_views = render_full_views(camera, target, minimum, maximum, output_dir)
    closeups = render_closeups(camera, output_dir)
    input_hash_after = sha256(blend_path)
    contact_witnesses = {
        name.removeprefix("KYX_V6B_CONTACT_"): [round(value, 6) for value in obj.matrix_world.translation]
        for name, obj in bpy.data.objects.items()
        if name.startswith("KYX_V6B_CONTACT_")
    }
    report = {
        "schemaVersion": 1,
        "renderedUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "blend": {"path": blend_path.name, "sha256Before": blend_hash, "sha256After": input_hash_after, "unchanged": blend_hash == input_hash_after},
        "bounds": {"minimum": [round(value, 6) for value in minimum], "maximum": [round(value, 6) for value in maximum]},
        "views": full_views + closeups,
        "contactWitnesses": contact_witnesses,
        "assertions": {
            "sixImagesRendered": len(full_views + closeups) == 6,
            "allImagesNonEmpty": all(record["bytes"] > 50_000 for record in full_views + closeups),
            "blendUnchanged": blend_hash == input_hash_after,
            "threeContactTargets": len(contact_witnesses) == 3,
        },
        "status": "V6B_DIRECT_REVIEW_RENDERS_COMPLETE_REQUIRES_VISUAL_AUDIT",
        "nonClaims": [
            "Images show a V6-B construction candidate, not final retopology/material/rig/animation/runtime work.",
            "Contact targets do not substitute for final literal two-hand and shoulder contact review after rigging.",
            "No G6 acceptance is claimed.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "images": len(report["views"])}, sort_keys=True))


if __name__ == "__main__":
    main()
