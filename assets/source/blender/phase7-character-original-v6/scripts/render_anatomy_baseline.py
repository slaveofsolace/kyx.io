"""Render neutral review plates from the sanitized CC0 anatomy checkpoint.

These plates are supply/source review evidence only. They deliberately show
the unmodified anatomical scaffold before any KYX design sculpt or armor work.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


BODY_NAME = "KYX_V6_CC0_AnatomySeed_Body"
EYE_NAMES = {
    "KYX_V6_CC0_AnatomySeed_Eye.L",
    "KYX_V6_CC0_AnatomySeed_Eye.R",
}
VIEWS = {
    "front": (0.0, -4.0, 0.02),
    "side": (4.0, 0.0, 0.02),
    "back": (0.0, 4.0, 0.02),
    "three-quarter": (2.9, -2.9, 0.18),
}


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected: -- <sanitized.blend> <render-dir> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    roughness: float,
    metallic: float = 0.0,
) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    result.diffuse_color = color
    principled = result.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    return result


def assign_material(obj: bpy.types.Object, value: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(value)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def point_camera(camera: bpy.types.Object, target: Vector) -> None:
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


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
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(tuple(min(corner[axis] for corner in corners) for axis in range(3)))
    maximum = Vector(tuple(max(corner[axis] for corner in corners) for axis in range(3)))
    return minimum, maximum


def projection_metrics(
    scene: bpy.types.Scene,
    camera: bpy.types.Object,
    obj: bpy.types.Object,
) -> dict[str, object]:
    projected = [
        world_to_camera_view(scene, camera, obj.matrix_world @ Vector(corner))
        for corner in obj.bound_box
    ]
    min_x = min(point.x for point in projected)
    max_x = max(point.x for point in projected)
    min_y = min(point.y for point in projected)
    max_y = max(point.y for point in projected)
    min_depth = min(point.z for point in projected)
    center_x = (min_x + max_x) * 0.5
    center_y = (min_y + max_y) * 0.5
    assertions = {
        "inFrontOfCamera": min_depth > 0.0,
        "insideHorizontalFrame": min_x >= 0.02 and max_x <= 0.98,
        "insideVerticalFrame": min_y >= 0.02 and max_y <= 0.98,
        "meaningfulProjectedWidth": (max_x - min_x) >= 0.12,
        "meaningfulProjectedHeight": (max_y - min_y) >= 0.70,
        "centered": abs(center_x - 0.5) <= 0.08 and abs(center_y - 0.5) <= 0.08,
    }
    return {
        "bounds": {
            "minX": round(min_x, 6),
            "maxX": round(max_x, 6),
            "minY": round(min_y, 6),
            "maxY": round(max_y, 6),
            "minDepth": round(min_depth, 6),
        },
        "center": [round(center_x, 6), round(center_y, 6)],
        "assertions": assertions,
        "pass": all(assertions.values()),
    }


def image_content_metrics(image: bpy.types.Image) -> dict[str, object]:
    width, height = image.size
    pixels = image.pixels[:]
    stride = 6
    y_start = int(height * 0.12)
    y_end = int(height * 0.90)
    bright = 0
    samples = 0
    for y in range(y_start, y_end, stride):
        for x in range(0, width, stride):
            offset = (y * width + x) * 4
            red, green, blue = pixels[offset : offset + 3]
            luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
            bright += luminance >= 0.28
            samples += 1
    ratio = bright / samples if samples else 0.0
    return {
        "sampleStridePixels": stride,
        "sampleRegionY": [0.12, 0.90],
        "sampleCount": samples,
        "brightSampleCount": bright,
        "brightOccupancyRatio": round(ratio, 6),
        "minimumRequiredRatio": 0.02,
        "pass": ratio >= 0.02,
    }


def configure_scene() -> tuple[bpy.types.Object, bpy.types.Object, Vector]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
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
    scene.render.use_stamp_note = True
    scene.render.stamp_font_size = 18
    scene.render.stamp_foreground = (0.94, 0.96, 1.0, 1.0)
    scene.render.stamp_background = (0.008, 0.01, 0.014, 0.82)
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = scene.world or bpy.data.worlds.new("Baseline_World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.025, 0.032, 0.042, 1.0)
    background.inputs["Strength"].default_value = 0.32

    body = bpy.data.objects.get(BODY_NAME)
    if body is None or body.type != "MESH":
        raise RuntimeError(f"Sanitized body not found: {BODY_NAME}")
    if {obj.name for obj in bpy.data.objects if obj.name in EYE_NAMES} != EYE_NAMES:
        raise RuntimeError("Sanitized anatomy eyes are missing")
    minimum, maximum = world_bounds(body)
    target = (minimum + maximum) * 0.5

    clay = material("REVIEW_CC0_Anatomy_Clay", (0.52, 0.49, 0.45, 1.0), roughness=0.78)
    eye = material("REVIEW_CC0_Eye", (0.035, 0.04, 0.05, 1.0), roughness=0.28)
    floor_material = material("REVIEW_Floor", (0.026, 0.031, 0.040, 1.0), roughness=0.9)
    assign_material(body, clay)
    for eye_name in sorted(EYE_NAMES):
        assign_material(bpy.data.objects[eye_name], eye)

    bpy.ops.mesh.primitive_plane_add(
        size=8.0,
        location=(target.x, target.y, minimum.z - 0.002),
    )
    floor = bpy.context.object
    floor.name = "REVIEW_NeutralFloor"
    assign_material(floor, floor_material)

    add_area("REVIEW_Key", tuple(target + Vector((2.6, -3.0, 2.35))), 900.0, 2.2, (1.0, 0.87, 0.76), target)
    add_area("REVIEW_Fill", tuple(target + Vector((-2.6, -1.2, 1.2))), 620.0, 2.6, (0.68, 0.80, 1.0), target)
    add_area("REVIEW_Rim", tuple(target + Vector((0.2, 2.8, 1.85))), 1100.0, 1.8, (0.72, 0.88, 1.0), target)
    add_area("REVIEW_Top", tuple(target + Vector((0.0, 0.0, 3.15))), 450.0, 2.0, (1.0, 1.0, 1.0), target)

    camera_data = bpy.data.cameras.new("REVIEW_Camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 1.98
    camera_data.lens = 70.0
    camera = bpy.data.objects.new("REVIEW_Camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera, body, target


def main() -> None:
    args = args_after_separator()
    if len(args) != 3:
        raise SystemExit("Expected: -- <sanitized.blend> <render-dir> <report.json>")
    source_path = Path(args[0]).resolve()
    output_dir = Path(args[1]).resolve()
    report_path = Path(args[2]).resolve()
    if Path(bpy.data.filepath).resolve() != source_path:
        raise SystemExit(f"Unexpected opened blend: {bpy.data.filepath}")
    if bpy.data.texts or bpy.data.libraries or bpy.data.actions:
        raise RuntimeError("Sanitized source contains forbidden text/library/action data")
    if bpy.utils.blend_paths(absolute=True, packed=False):
        raise RuntimeError("Sanitized source contains external file paths")

    output_dir.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    camera, body, target = configure_scene()
    scene = bpy.context.scene
    rendered = []
    for view_name, offset in VIEWS.items():
        camera.location = target + Vector(offset)
        point_camera(camera, target)
        bpy.context.view_layer.update()
        projected = projection_metrics(scene, camera, body)
        if not projected["pass"]:
            raise RuntimeError(f"Body framing assertion failed for {view_name}: {projected}")
        output_path = output_dir / f"kyx-v6-cc0-anatomy-seed-{view_name}.png"
        scene.render.filepath = str(output_path)
        scene.render.stamp_note_text = (
            f"{view_name.upper()} | CC0 ANATOMY SCULPT-SEED PREWORK | "
            "HUMAN BASE MESHES v1.4.1 | NOT FINAL KYX / NOT G6"
        )
        bpy.ops.render.render(write_still=True)
        verification_image = bpy.data.images.load(str(output_path), check_existing=False)
        try:
            content = image_content_metrics(verification_image)
        finally:
            bpy.data.images.remove(verification_image)
        if not content["pass"]:
            raise RuntimeError(f"Rendered body-content assertion failed for {view_name}: {content}")
        rendered.append(
            {
                "view": view_name,
                "fileName": output_path.name,
                "bytes": output_path.stat().st_size,
                "sha256": sha256(output_path),
                "cameraLocation": [round(value, 6) for value in camera.location],
                "cameraTarget": [round(value, 6) for value in target],
                "orthographicScale": camera.data.ortho_scale,
                "projection": projected,
                "imageContent": content,
            }
        )

    report = {
        "schemaVersion": 1,
        "renderedUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "source": {
            "fileName": source_path.name,
            "bytes": source_path.stat().st_size,
            "sha256": sha256(source_path),
        },
        "resolution": [scene.render.resolution_x, scene.render.resolution_y],
        "engine": scene.render.engine,
        "views": rendered,
        "label": "CC0 anatomy sculpt-seed prework; not final KYX and not G6",
        "status": "NEUTRAL_BASELINE_REVIEW_RENDERS_COMPLETE",
        "attempt": 2,
        "failedAttempt1PreservedAt": "evidence/failures/attempt-1-camera-orientation",
        "allProjectionAndImageContentAssertionsPass": all(
            item["projection"]["pass"] and item["imageContent"]["pass"]
            for item in rendered
        ),
        "nonClaims": [
            "The shown anatomy is the unmodified CC0 sculpt seed, not original KYX anatomy.",
            "The plates are source-baseline evidence only and are not visual acceptance.",
            "No final character, armor, rifle, rig, animation, LOD, export, or runtime integration is claimed.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        "NEUTRAL_BASELINE_REVIEW_RENDERS_COMPLETE "
        + " ".join(f"{item['view']}={item['sha256']}" for item in rendered)
    )


if __name__ == "__main__":
    main()
