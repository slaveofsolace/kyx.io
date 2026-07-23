"""Render labeled V6-A clay plates and true-distance silhouette evidence.

The opened authored checkpoint is never saved. Review lights, cameras,
materials, floor, and contact-sheet images are ephemeral render scaffolding.
"""

from __future__ import annotations

from array import array
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


BODY_NAME = "KYX_V6A_AnatomySculpt_Body"
EYE_NAMES = (
    "KYX_V6A_AnatomySculpt_Eye.L",
    "KYX_V6A_AnatomySculpt_Eye.R",
)
EXPECTED_FINAL_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
CLAY_VIEWS = {
    "front": (0.0, -4.2, 0.02),
    "side": (4.2, 0.0, 0.02),
    "back": (0.0, 4.2, 0.02),
    "three-quarter": (3.0, -3.0, 0.15),
}
DISTANCES_METERS = (5, 20, 40)


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected: -- <working.blend> <clay-dir> <silhouette-dir> "
            "<source-render-dir> <report.json>"
        )
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def point_camera(camera: bpy.types.Object, target: Vector) -> None:
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def world_bounds(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    minimum = Vector(tuple(min(corner[axis] for corner in corners) for axis in range(3)))
    maximum = Vector(tuple(max(corner[axis] for corner in corners) for axis in range(3)))
    return minimum, maximum


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    roughness: float,
    metallic: float = 0.0,
) -> bpy.types.Material:
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    value.diffuse_color = color
    principled = value.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    return value


def assign_material(obj: bpy.types.Object, value: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(value)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


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


def projection_metrics(
    scene: bpy.types.Scene,
    camera: bpy.types.Object,
    obj: bpy.types.Object,
) -> dict[str, object]:
    projected = [
        world_to_camera_view(scene, camera, obj.matrix_world @ Vector(corner))
        for corner in obj.bound_box
    ]
    minimum_x = min(point.x for point in projected)
    maximum_x = max(point.x for point in projected)
    minimum_y = min(point.y for point in projected)
    maximum_y = max(point.y for point in projected)
    minimum_depth = min(point.z for point in projected)
    width_pixels = (maximum_x - minimum_x) * scene.render.resolution_x
    height_pixels = (maximum_y - minimum_y) * scene.render.resolution_y
    return {
        "normalizedBounds": {
            "minX": round(minimum_x, 6),
            "maxX": round(maximum_x, 6),
            "minY": round(minimum_y, 6),
            "maxY": round(maximum_y, 6),
            "minDepth": round(minimum_depth, 6),
        },
        "projectedPixels": {
            "width": round(width_pixels, 3),
            "height": round(height_pixels, 3),
        },
        "center": [
            round((minimum_x + maximum_x) * 0.5, 6),
            round((minimum_y + maximum_y) * 0.5, 6),
        ],
        "pass": (
            minimum_depth > 0.0
            and minimum_x >= 0.01 and maximum_x <= 0.99
            and minimum_y >= 0.01 and maximum_y <= 0.99
            and width_pixels >= 10.0 and height_pixels >= 28.0
        ),
    }


def configure_base_scene(body: bpy.types.Object) -> tuple[bpy.types.Object, Vector, Vector, Vector]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
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
    scene.render.stamp_font_size = 17
    scene.render.stamp_foreground = (0.96, 0.97, 1.0, 1.0)
    scene.render.stamp_background = (0.008, 0.010, 0.014, 0.86)
    scene.view_settings.look = "AgX - Medium High Contrast"

    world = scene.world or bpy.data.worlds.new("V6A_REVIEW_World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.018, 0.024, 0.034, 1.0)
    background.inputs["Strength"].default_value = 0.34

    minimum, maximum = world_bounds(body)
    target = (minimum + maximum) * 0.5
    clay = material("V6A_REVIEW_AuthoredClay", (0.34, 0.235, 0.175, 1.0), roughness=0.72)
    eyes = material("V6A_REVIEW_Eyes", (0.018, 0.025, 0.036, 1.0), roughness=0.24)
    floor_material = material("V6A_REVIEW_Floor", (0.024, 0.031, 0.043, 1.0), roughness=0.9)
    assign_material(body, clay)
    for name in EYE_NAMES:
        eye = bpy.data.objects.get(name)
        if eye is None or eye.type != "MESH":
            raise RuntimeError(f"Authored eye is missing: {name}")
        assign_material(eye, eyes)

    bpy.ops.mesh.primitive_plane_add(size=8.0, location=(target.x, target.y, minimum.z - 0.002))
    floor = bpy.context.object
    floor.name = "V6A_REVIEW_NeutralFloor"
    assign_material(floor, floor_material)

    add_area("V6A_REVIEW_Key", tuple(target + Vector((2.6, -3.1, 2.4))), 1000.0, 2.1, (1.0, 0.78, 0.62), target)
    add_area("V6A_REVIEW_Fill", tuple(target + Vector((-2.5, -1.0, 1.2))), 680.0, 2.7, (0.58, 0.75, 1.0), target)
    add_area("V6A_REVIEW_Rim", tuple(target + Vector((0.3, 2.8, 1.9))), 1250.0, 1.7, (0.66, 0.84, 1.0), target)
    add_area("V6A_REVIEW_Top", tuple(target + Vector((0.0, 0.0, 3.0))), 480.0, 2.0, (1.0, 0.95, 0.88), target)

    camera_data = bpy.data.cameras.new("V6A_REVIEW_Camera")
    camera = bpy.data.objects.new("V6A_REVIEW_Camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera, target, minimum, maximum


def render_clay_views(
    camera: bpy.types.Object,
    body: bpy.types.Object,
    target: Vector,
    minimum: Vector,
    maximum: Vector,
    output_dir: Path,
) -> list[dict[str, object]]:
    scene = bpy.context.scene
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = (maximum.z - minimum.z) * 1.17
    output_dir.mkdir(parents=True, exist_ok=True)
    records = []
    for view, offset in CLAY_VIEWS.items():
        camera.location = target + Vector(offset)
        point_camera(camera, target)
        bpy.context.view_layer.update()
        projection = projection_metrics(scene, camera, body)
        if not projection["pass"]:
            raise RuntimeError(f"Clay framing failed for {view}: {projection}")
        output_path = output_dir / f"kyx-v6a-authored-anatomy-{view}.png"
        scene.render.filepath = str(output_path)
        scene.render.stamp_note_text = (
            f"{view.upper()} | V6-A AUTHORED ANATOMY/SILHOUETTE CANDIDATE | "
            "CC0-DERIVED / HUMAN REVIEW REQUIRED / NOT G6"
        )
        bpy.ops.render.render(write_still=True)
        records.append({
            "view": view,
            "fileName": output_path.name,
            "bytes": output_path.stat().st_size,
            "sha256": sha256(output_path),
            "cameraLocation": [round(value, 6) for value in camera.location],
            "cameraTarget": [round(value, 6) for value in target],
            "orthographicScale": round(camera.data.ortho_scale, 6),
            "projection": projection,
        })
    return records


def render_distance_silhouettes(
    camera: bpy.types.Object,
    body: bpy.types.Object,
    target: Vector,
    output_dir: Path,
) -> list[dict[str, object]]:
    scene = bpy.context.scene
    scene.render.resolution_x = 700
    scene.render.resolution_y = 850
    scene.render.resolution_percentage = 100
    camera.data.type = "PERSP"
    camera.data.lens = 50.0
    camera.data.sensor_width = 36.0
    camera.data.sensor_fit = "HORIZONTAL"

    silhouette = material("V6A_REVIEW_Silhouette", (0.003, 0.004, 0.006, 1.0), roughness=1.0)
    assign_material(body, silhouette)
    for name in EYE_NAMES:
        assign_material(bpy.data.objects[name], silhouette)
    world_background = scene.world.node_tree.nodes.get("Background")
    world_background.inputs["Color"].default_value = (0.78, 0.80, 0.82, 1.0)
    world_background.inputs["Strength"].default_value = 0.85
    floor = bpy.data.objects.get("V6A_REVIEW_NeutralFloor")
    floor.hide_render = True
    for obj in bpy.data.objects:
        if obj.type == "LIGHT":
            obj.hide_render = True

    output_dir.mkdir(parents=True, exist_ok=True)
    records = []
    for distance in DISTANCES_METERS:
        camera.location = Vector((0.0, -float(distance), target.z))
        point_camera(camera, target)
        bpy.context.view_layer.update()
        projection = projection_metrics(scene, camera, body)
        if not projection["pass"]:
            raise RuntimeError(f"{distance}m silhouette framing failed: {projection}")
        output_path = output_dir / f"kyx-v6a-silhouette-{distance}m.png"
        scene.render.filepath = str(output_path)
        scene.render.stamp_note_text = (
            f"TRUE PERSPECTIVE {distance} m | 50 mm / 36 mm SENSOR | "
            "V6-A SILHOUETTE READ CANDIDATE / HUMAN REVIEW REQUIRED / NOT G6"
        )
        bpy.ops.render.render(write_still=True)
        records.append({
            "distanceMeters": distance,
            "fileName": output_path.name,
            "bytes": output_path.stat().st_size,
            "sha256": sha256(output_path),
            "cameraLocation": [round(value, 6) for value in camera.location],
            "cameraTarget": [round(value, 6) for value in target],
            "lensMillimeters": camera.data.lens,
            "sensorWidthMillimeters": camera.data.sensor_width,
            "projection": projection,
        })
    return records


def contact_sheet(
    source_paths: list[Path],
    output_path: Path,
    cell_width: int,
    cell_height: int,
) -> dict[str, object]:
    loaded = []
    try:
        for path in source_paths:
            image = bpy.data.images.load(str(path), check_existing=False)
            image.scale(cell_width, cell_height)
            loaded.append(image)
        width = cell_width * len(loaded)
        height = cell_height
        pixels_per_cell_row = cell_width * 4
        output_pixels = array("f", [0.0]) * (width * height * 4)
        for column, image in enumerate(loaded):
            source_pixels = array("f", [0.0]) * (cell_width * cell_height * 4)
            image.pixels.foreach_get(source_pixels)
            for row in range(cell_height):
                source_start = row * pixels_per_cell_row
                destination_start = (row * width + column * cell_width) * 4
                output_pixels[destination_start : destination_start + pixels_per_cell_row] = (
                    source_pixels[source_start : source_start + pixels_per_cell_row]
                )
        sheet = bpy.data.images.new(output_path.stem, width=width, height=height, alpha=True)
        sheet.pixels.foreach_set(output_pixels)
        sheet.file_format = "PNG"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        sheet.save_render(filepath=str(output_path), scene=bpy.context.scene)
        bpy.data.images.remove(sheet)
    finally:
        for image in loaded:
            if image.name in bpy.data.images:
                bpy.data.images.remove(image)
    return {
        "fileName": output_path.name,
        "bytes": output_path.stat().st_size,
        "sha256": sha256(output_path),
        "dimensions": [cell_width * len(source_paths), cell_height],
        "sources": [path.name for path in source_paths],
    }


def main() -> None:
    args = args_after_separator()
    if len(args) != 5:
        raise SystemExit(
            "Expected: -- <working.blend> <clay-dir> <silhouette-dir> "
            "<source-render-dir> <report.json>"
        )
    working_path = Path(args[0]).resolve()
    clay_dir = Path(args[1]).resolve()
    silhouette_dir = Path(args[2]).resolve()
    source_render_dir = Path(args[3]).resolve()
    report_path = Path(args[4]).resolve()
    if Path(bpy.data.filepath).resolve() != working_path:
        raise RuntimeError(f"Unexpected opened blend: {bpy.data.filepath}")
    opened_hash = sha256(working_path)
    if opened_hash != EXPECTED_FINAL_SHA256:
        raise RuntimeError(f"Unexpected V6-A checkpoint hash: {opened_hash}")
    if bpy.data.texts or bpy.data.actions or bpy.data.armatures or bpy.data.libraries:
        raise RuntimeError("V6-A checkpoint contains forbidden executable or linked content")
    if bpy.utils.blend_paths(absolute=True, packed=False):
        raise RuntimeError("V6-A checkpoint contains external paths")
    body = bpy.data.objects.get(BODY_NAME)
    if body is None or body.type != "MESH":
        raise RuntimeError(f"Authored body not found: {BODY_NAME}")

    camera, target, minimum, maximum = configure_base_scene(body)
    clay_records = render_clay_views(camera, body, target, minimum, maximum, clay_dir)
    clay_order = [clay_dir / f"kyx-v6a-authored-anatomy-{name}.png" for name in CLAY_VIEWS]
    clay_sheet = contact_sheet(
        clay_order,
        clay_dir / "kyx-v6a-authored-anatomy-review-sheet.png",
        450,
        550,
    )
    compare_sheet = contact_sheet(
        [
            source_render_dir / "kyx-v6-cc0-anatomy-seed-front.png",
            clay_dir / "kyx-v6a-authored-anatomy-front.png",
            source_render_dir / "kyx-v6-cc0-anatomy-seed-side.png",
            clay_dir / "kyx-v6a-authored-anatomy-side.png",
        ],
        clay_dir / "kyx-v6a-source-vs-candidate-sheet.png",
        450,
        550,
    )
    silhouette_records = render_distance_silhouettes(camera, body, target, silhouette_dir)
    distance_sheet = contact_sheet(
        [silhouette_dir / f"kyx-v6a-silhouette-{distance}m.png" for distance in DISTANCES_METERS],
        silhouette_dir / "kyx-v6a-distance-read-review-sheet.png",
        490,
        595,
    )

    after_render_hash = sha256(working_path)
    report = {
        "schemaVersion": 1,
        "renderedUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": {
            "fileName": working_path.name,
            "bytes": working_path.stat().st_size,
            "sha256BeforeRender": opened_hash,
            "sha256AfterRender": after_render_hash,
            "unchanged": opened_hash == after_render_hash == EXPECTED_FINAL_SHA256,
        },
        "clayViews": clay_records,
        "clayReviewSheet": clay_sheet,
        "sourceVsCandidateSheet": compare_sheet,
        "distanceSilhouettes": silhouette_records,
        "distanceReviewSheet": distance_sheet,
        "assertions": {
            "checkpointUnchangedByRender": opened_hash == after_render_hash,
            "allClayFramesPass": all(record["projection"]["pass"] for record in clay_records),
            "allDistanceFramesPass": all(record["projection"]["pass"] for record in silhouette_records),
            "fourClayViewsRendered": len(clay_records) == 4,
            "threeTrueDistanceViewsRendered": len(silhouette_records) == 3,
            "allArtifactsNonEmpty": all(
                record["bytes"] > 1000
                for record in [*clay_records, *silhouette_records, clay_sheet, compare_sheet, distance_sheet]
            ),
        },
        "status": "V6A_REVIEW_EVIDENCE_RENDER_PASS_HUMAN_DECISION_REQUIRED",
        "nonClaims": [
            "Projection and file checks do not constitute visual acceptance.",
            "V6-A remains an anatomy/silhouette candidate only.",
            "No costume, armor, helmet, rifle, rig, animation, retopology, runtime export, G6, or release claim is made.",
        ],
    }
    if not all(report["assertions"].values()):
        raise RuntimeError(f"V6-A render assertions failed: {report['assertions']}")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        "V6A_REVIEW_EVIDENCE_RENDER_PASS_HUMAN_DECISION_REQUIRED "
        f"clay={len(clay_records)} distances={len(silhouette_records)}"
    )


if __name__ == "__main__":
    main()
