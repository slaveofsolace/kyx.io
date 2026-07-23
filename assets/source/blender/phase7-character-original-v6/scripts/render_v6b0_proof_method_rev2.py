"""Render bounded V6-B0 proof-of-method evidence from a clean Blend reopen."""

from __future__ import annotations

import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


BASE = Path(__file__).resolve().parents[1]
EVIDENCE = BASE / "evidence" / "v6b0-proof-method-rev2"
RENDERS = EVIDENCE / "renders"
REPORT = EVIDENCE / "render-report.json"
PREFIX = "V6B0_"


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def remove_render_helpers() -> None:
    for obj in list(bpy.data.objects):
        if obj.name.startswith("V6B0_RENDER_"):
            bpy.data.objects.remove(obj, do_unlink=True)


def material(name: str, color: tuple[float, float, float, float], roughness: float = 0.5) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
    return mat


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


def add_camera(name: str, location: tuple[float, float, float], target: tuple[float, float, float], lens: float) -> bpy.types.Object:
    data = bpy.data.cameras.new(name)
    data.lens = lens
    data.sensor_width = 36.0
    data.dof.use_dof = False
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def render_view(scene: bpy.types.Scene, camera: bpy.types.Object, filename: str) -> dict:
    scene.camera = camera
    path = RENDERS / filename
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return {
        "filename": filename,
        "bytes": path.stat().st_size,
        "camera": camera.name,
        "location": [round(value, 6) for value in camera.location],
        "lens_mm": camera.data.lens,
    }


def configure() -> bpy.types.Scene:
    remove_render_helpers()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1120
    scene.render.resolution_y = 1120
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.image_settings.color_depth = "8"
    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = 64
    scene.render.resolution_percentage = 100
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.55

    world = bpy.data.worlds.get("World") or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.004, 0.006, 0.010, 1.0)
    background.inputs["Strength"].default_value = 0.045

    # A curved visual-review stage: the waist-level plinth makes the deliberate
    # partial checkpoint legible rather than looking like an accidentally
    # truncated full character.
    stage_mat = material("V6B0_RENDER_StageMat", (0.010, 0.015, 0.022, 1.0), 0.38)
    bpy.ops.mesh.primitive_plane_add(size=8.0, location=(0.0, 0.15, 0.825))
    floor = bpy.context.object
    floor.name = "V6B0_RENDER_Floor"
    floor.data.materials.append(stage_mat)
    target = (-0.08, -0.08, 1.23)
    add_area("V6B0_RENDER_Key", (-2.4, -3.4, 3.0), 115.0, (0.78, 0.88, 1.0), 2.8, target)
    add_area("V6B0_RENDER_Fill", (2.5, -2.5, 2.1), 68.0, (1.0, 0.71, 0.52), 2.4, target)
    add_area("V6B0_RENDER_Rim", (1.2, 1.1, 2.8), 145.0, (0.12, 0.48, 1.0), 1.8, target)
    add_area("V6B0_RENDER_WeaponEdge", (-1.6, -1.0, 1.5), 72.0, (0.26, 0.72, 1.0), 1.0, (-0.25, -0.30, 1.15))
    add_area("V6B0_RENDER_ChestSoftbox", (0.1, -2.3, 2.6), 55.0, (1.0, 0.95, 0.84), 1.6, (0.1, -0.05, 1.36))
    return scene


def main() -> None:
    if "v6b0_proof_method_rev2" not in Path(bpy.data.filepath).name:
        raise RuntimeError("Render must clean-reopen the isolated V6-B0 proof Blend")
    RENDERS.mkdir(parents=True, exist_ok=True)
    scene = configure()

    cameras = {
        "front": add_camera(
            "V6B0_RENDER_Camera_Front",
            (-0.10, -3.50, 1.30),
            (-0.13, -0.09, 1.25),
            75.0,
        ),
        "three_quarter": add_camera(
            "V6B0_RENDER_Camera_ThreeQuarter",
            (2.55, -3.55, 1.70),
            (-0.06, -0.08, 1.25),
            83.0,
        ),
        "right_side": add_camera(
            "V6B0_RENDER_Camera_RightSide",
            (2.65, -0.75, 1.48),
            (0.00, -0.09, 1.25),
            86.0,
        ),
        "contact": add_camera(
            "V6B0_RENDER_Camera_Contact",
            (-0.92, -1.32, 1.10),
            (-0.27, -0.29, 1.070),
            102.0,
        ),
        "armor_close": add_camera(
            "V6B0_RENDER_Camera_ArmorClose",
            (1.35, -1.95, 1.62),
            (0.13, -0.08, 1.385),
            105.0,
        ),
    }

    records = [
        render_view(scene, cameras["front"], "kyx-v6b0-proof-method-rev2-front.png"),
        render_view(scene, cameras["three_quarter"], "kyx-v6b0-proof-method-rev2-three-quarter.png"),
        render_view(scene, cameras["right_side"], "kyx-v6b0-proof-method-rev2-right-side.png"),
        render_view(scene, cameras["contact"], "kyx-v6b0-proof-method-rev2-contact-close.png"),
        render_view(scene, cameras["armor_close"], "kyx-v6b0-proof-method-rev2-armor-close.png"),
    ]
    report = {
        "checkpoint": "V6-B0 proof-of-method rev2",
        "status": "DIRECT VISUAL REVIEW REQUIRED / NO ACCEPTANCE CLAIM",
        "blend": bpy.data.filepath,
        "engine": scene.render.engine,
        "resolution": [scene.render.resolution_x, scene.render.resolution_y],
        "views": records,
        "framing_contract": [
            "front, three-quarter, and right-side close views all show garment/armor/contact study",
            "contact close must visibly show five digits, trigger digit, palm and receiver/grip contact",
            "armor close must visibly show thickness, bevel, attachment and arm-clearance gap",
            "no render may be used to claim V6-B, V6-C or G6",
        ],
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("V6B0_RENDER_REPORT=" + json.dumps({"views": len(records), "engine": scene.render.engine}))


if __name__ == "__main__":
    main()
