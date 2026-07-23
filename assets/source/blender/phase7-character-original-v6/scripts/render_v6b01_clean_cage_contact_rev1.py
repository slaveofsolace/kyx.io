"""Render the bounded V6-B0.1 clean-cage/contact review set.

The saved proof Blend is reopened cleanly.  This script emits only the early
wireframe, one-panel, transparent-contact and pinned-concept comparison views.
"""

from __future__ import annotations

import bpy
import hashlib
import json
import math
import os
import sys
from pathlib import Path
from mathutils import Vector


BASE = Path(__file__).resolve().parents[1]
if "--output-root" in sys.argv:
    OUTPUT_ROOT = Path(sys.argv[sys.argv.index("--output-root") + 1])
else:
    OUTPUT_ROOT = Path(os.environ.get("KYX_V6B01_OUTPUT_ROOT", str(BASE)))
EVIDENCE = OUTPUT_ROOT / "evidence" / "v6b01-clean-cage-contact-rev1"
RENDERS = EVIDENCE / "renders"
REPORT = EVIDENCE / "render-report.json"
CONCEPT = BASE / "concept" / "kyx-vanguard-v6c-production-target-v1.png"
PREFIX = "V6B01_"
RENDER_PREFIX = "V6B01_RENDER_"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def remove_render_helpers() -> None:
    for obj in list(bpy.data.objects):
        if obj.name.startswith(RENDER_PREFIX):
            bpy.data.objects.remove(obj, do_unlink=True)
    for material in list(bpy.data.materials):
        if material.name.startswith(RENDER_PREFIX):
            bpy.data.materials.remove(material)


def add_area(
    name: str,
    location: tuple[float, float, float],
    energy: float,
    color: tuple[float, float, float],
    size: float,
    target: tuple[float, float, float],
) -> bpy.types.Object:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def add_camera(
    name: str,
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    lens: float,
) -> bpy.types.Object:
    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.sensor_width = 36.0
    data.dof.use_dof = False
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def configure() -> bpy.types.Scene:
    remove_render_helpers()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.42

    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.003, 0.006, 0.010, 1.0)
    background.inputs["Strength"].default_value = 0.06

    target = (0.10, -0.06, 1.20)
    add_area(f"{RENDER_PREFIX}Key", (-2.2, -3.2, 3.0), 165.0, (0.74, 0.86, 1.0), 2.6, target)
    add_area(f"{RENDER_PREFIX}Fill", (2.6, -2.4, 2.3), 110.0, (1.0, 0.70, 0.48), 2.2, target)
    add_area(f"{RENDER_PREFIX}Rim", (1.5, 1.4, 2.8), 205.0, (0.06, 0.48, 1.0), 1.7, target)
    add_area(f"{RENDER_PREFIX}HandSoftbox", (1.8, -1.1, 1.05), 135.0, (0.55, 0.86, 1.0), 1.1, (0.37, -0.10, 0.95))
    add_area(f"{RENDER_PREFIX}ArmorSoftbox", (0.0, -2.2, 2.4), 90.0, (1.0, 0.92, 0.78), 1.3, (0.14, -0.09, 1.34))
    return scene


def set_scope(scope: str) -> None:
    for obj in bpy.data.objects:
        if not obj.name.startswith(PREFIX) or obj.name.startswith(RENDER_PREFIX):
            continue
        obj.hide_render = True

    if scope == "garment":
        names = {
            f"{PREFIX}GarmentAnatomyWitness",
            f"{PREFIX}Garment_CleanQuadCage",
            f"{PREFIX}Garment_CageWireWitness",
            f"{PREFIX}Garment_Seam_CenterFront",
            f"{PREFIX}Garment_Seam_R_ClavicleTension",
            f"{PREFIX}Garment_Seam_L_ClavicleTension",
        }
        for name in names:
            bpy.data.objects[name].hide_render = False
    elif scope == "armor":
        for obj in bpy.data.objects:
            if obj.name == f"{PREFIX}GarmentAnatomyWitness" or obj.name == f"{PREFIX}Garment_CleanQuadCage" or obj.name.startswith(f"{PREFIX}Garment_Seam_") or obj.name.startswith(f"{PREFIX}Armor_"):
                obj.hide_render = False
    elif scope == "contact":
        for obj in bpy.data.objects:
            if obj.name == f"{PREFIX}ContactAnatomyContinuousBody" or obj.name.startswith(f"{PREFIX}ContactFixture_"):
                obj.hide_render = False
        rig = bpy.data.objects.get(f"{PREFIX}ContactHandRig")
        if rig:
            rig.hide_render = True
    else:
        raise ValueError(scope)


def render_view(
    scene: bpy.types.Scene,
    camera: bpy.types.Object,
    filename: str,
    width: int = 1200,
    height: int = 1200,
) -> dict:
    scene.camera = camera
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    path = RENDERS / filename
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return {
        "filename": filename,
        "path": str(path),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "camera": camera.name,
        "location": [round(value, 6) for value in camera.location],
        "lens_mm": camera.data.lens,
        "resolution": [width, height],
    }


def image_material(name: str, path: Path) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(path), check_existing=True)
    texture.interpolation = "Linear"
    links.new(texture.outputs["Color"], emission.inputs["Color"])
    links.new(texture.outputs["Alpha"], emission.inputs["Strength"])
    emission.inputs["Strength"].default_value = 1.0
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return mat


def image_plane(
    name: str,
    path: Path,
    center: tuple[float, float, float],
    width: float,
    height: float,
    uv_rect: tuple[float, float, float, float] = (0.0, 0.0, 1.0, 1.0),
) -> bpy.types.Object:
    x, y, z = center
    vertices = [
        (x - width / 2.0, y, z - height / 2.0),
        (x + width / 2.0, y, z - height / 2.0),
        (x + width / 2.0, y, z + height / 2.0),
        (x - width / 2.0, y, z + height / 2.0),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    u0, v0, u1, v1 = uv_rect
    coordinates = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    for loop, coordinate in zip(mesh.polygons[0].loop_indices, coordinates):
        uv_layer.data[loop].uv = coordinate
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(image_material(f"{name}_Material", path))
    return obj


def text_label(
    name: str,
    body: str,
    location: tuple[float, float, float],
    size: float,
    color: tuple[float, float, float, float],
) -> bpy.types.Object:
    data = bpy.data.curves.new(name, "FONT")
    data.body = body
    data.align_x = "CENTER"
    data.align_y = "CENTER"
    data.size = size
    data.extrude = 0.0
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (math.pi / 2.0, 0.0, 0.0)
    mat = bpy.data.materials.new(f"{name}_Material")
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Emission Color"].default_value = color
    bsdf.inputs["Emission Strength"].default_value = 2.0
    data.materials.append(mat)
    return obj


def prepare_flat_scene(scene: bpy.types.Scene) -> bpy.types.Object:
    for obj in bpy.data.objects:
        obj.hide_render = True
    camera_data = bpy.data.cameras.new(f"{RENDER_PREFIX}FlatCamera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 5.35
    camera = bpy.data.objects.new(f"{RENDER_PREFIX}FlatCamera", camera_data)
    bpy.context.scene.collection.objects.link(camera)
    camera.location = (0.0, -10.0, 0.0)
    look_at(camera, (0.0, 0.0, 0.0))
    camera.hide_render = False
    scene.camera = camera
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.0
    world = scene.world
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.004, 0.007, 0.011, 1.0)
    background.inputs["Strength"].default_value = 0.0
    return camera


def render_concept_crop(scene: bpy.types.Scene) -> dict:
    camera = prepare_flat_scene(scene)
    camera.data.ortho_scale = 2.15
    plane = image_plane(
        f"{RENDER_PREFIX}ConceptCropPlane",
        CONCEPT,
        (0.0, 0.0, 0.0),
        2.15,
        2.15,
        # Pinned front operator: upper-body, shoulder construction and hand.
        (0.015, 0.285, 0.345, 0.995),
    )
    plane.hide_render = False
    path = RENDERS / "kyx-v6b01-clean-cage-contact-rev1-concept-crop.png"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1200
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return {
        "filename": path.name,
        "path": str(path),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "source": str(CONCEPT),
        "source_sha256": sha256(CONCEPT),
        "crop_uv": [0.015, 0.285, 0.345, 0.995],
        "resolution": [1200, 1200],
    }


def render_board(scene: bpy.types.Scene, panels: list[dict]) -> dict:
    camera = prepare_flat_scene(scene)
    camera.data.ortho_scale = 5.25
    panel_specs = [
        (panels[0], (-1.72, 0.0, 1.15), "CLEAN QUAD GARMENT — FRONT WIRE"),
        (panels[2], (1.72, 0.0, 1.15), "ONE CONTINUOUS ARMOR PANEL"),
        (panels[3], (-1.72, 0.0, -1.15), "CONTINUOUS FIVE-DIGIT CONTACT"),
        (panels[4], (1.72, 0.0, -1.15), "PINNED CONCEPT CROP"),
    ]
    for index, (panel, center, label) in enumerate(panel_specs, 1):
        plane = image_plane(
            f"{RENDER_PREFIX}BoardPanel_{index:02d}",
            Path(panel["path"]),
            center,
            3.20,
            1.93,
        )
        plane.hide_render = False
        text = text_label(
            f"{RENDER_PREFIX}BoardLabel_{index:02d}",
            label,
            (center[0], -0.025, center[2] + 1.065),
            0.14,
            (0.78, 0.90, 1.0, 1.0),
        )
        text.hide_render = False
    header = text_label(
        f"{RENDER_PREFIX}BoardHeader",
        "KYX V6-B0.1 — CLEAN CAGE + LITERAL CONTACT METHOD PROOF",
        (0.0, -0.025, 2.48),
        0.20,
        (0.92, 0.95, 1.0, 1.0),
    )
    header.hide_render = False
    footer = text_label(
        f"{RENDER_PREFIX}BoardFooter",
        "EARLY REVIEW ONLY / NO V6-B / NO V6-C / NO G6 / STOPPED BEFORE FULL BODY + FULL RIFLE",
        (0.0, -0.025, -2.47),
        0.14,
        (0.95, 0.32, 0.30, 1.0),
    )
    footer.hide_render = False
    path = RENDERS / "kyx-v6b01-clean-cage-contact-rev1-proof-board.png"
    scene.render.resolution_x = 2400
    scene.render.resolution_y = 1800
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return {
        "filename": path.name,
        "path": str(path),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "resolution": [2400, 1800],
        "panels": [panel["filename"] for panel, _center, _label in panel_specs],
    }


def main() -> None:
    if "v6b01_clean_cage_contact_rev1" not in Path(bpy.data.filepath).name:
        raise RuntimeError("Render must clean-reopen the isolated V6-B0.1 proof Blend")
    RENDERS.mkdir(parents=True, exist_ok=True)
    scene = configure()

    cameras = {
        "garment_front": add_camera(
            f"{RENDER_PREFIX}Camera_GarmentFront",
            (0.0, -2.75, 1.245),
            (0.0, -0.055, 1.245),
            98.0,
        ),
        "garment_side": add_camera(
            f"{RENDER_PREFIX}Camera_GarmentSide",
            (2.65, -0.16, 1.250),
            (0.0, -0.045, 1.245),
            98.0,
        ),
        "armor": add_camera(
            f"{RENDER_PREFIX}Camera_ArmorClose",
            (0.98, -2.20, 1.48),
            (0.125, -0.080, 1.315),
            105.0,
        ),
        "contact": add_camera(
            f"{RENDER_PREFIX}Camera_TransparentContact",
            (1.45, -1.32, 1.19),
            (0.315, -0.098, 1.105),
            92.0,
        ),
    }

    records: list[dict] = []
    set_scope("garment")
    records.append(render_view(scene, cameras["garment_front"], "kyx-v6b01-clean-cage-contact-rev1-garment-front-wire.png"))
    records.append(render_view(scene, cameras["garment_side"], "kyx-v6b01-clean-cage-contact-rev1-garment-side-wire.png"))

    set_scope("armor")
    records.append(render_view(scene, cameras["armor"], "kyx-v6b01-clean-cage-contact-rev1-armor-close.png"))

    set_scope("contact")
    records.append(render_view(scene, cameras["contact"], "kyx-v6b01-clean-cage-contact-rev1-transparent-contact-close.png", 1400, 1200))

    concept_record = render_concept_crop(scene)
    records.append(concept_record)
    board_record = render_board(scene, records)

    report = {
        "checkpoint": "V6-B0.1 clean-cage/contact proof rev1",
        "status": "DIRECT HUMAN VISUAL REVIEW REQUIRED / NO ACCEPTANCE CLAIM",
        "blend": bpy.data.filepath,
        "blend_sha256": sha256(Path(bpy.data.filepath)),
        "engine": "BLENDER_EEVEE",
        "views": records,
        "board": board_record,
        "framing_contract": [
            "front and side wire views must show one clean connected garment cage with explicit arm-hole loops",
            "armor close must show one continuous manufactured perimeter, thickness, bevel, backed attachments and arm clearance",
            "transparent contact close must independently show palm seating, four wrapped grip digits, index at trigger, guard clearance and stock pad contact",
            "the sectioned receiver may not occlude the literal hand or shoulder contacts",
            "no view may be used to claim V6-B, V6-C or G6",
        ],
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("V6B01_RENDER_REPORT=" + json.dumps({"views": len(records), "board": board_record["filename"]}))


if __name__ == "__main__":
    main()
