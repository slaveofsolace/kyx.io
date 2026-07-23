"""Render the V6 CONTACT-FIRST early arm/finger rig proof.

The authored Blend is reopened cleanly and never saved by this renderer.
Contact views use the translucent/sectioned receiver and orthographic cameras;
the board also includes full-body, rear-side, and armature witness views so a
reviewer never has to infer that the posed hands belong to the body.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import sys

import bpy
from mathutils import Vector


BASE = Path(__file__).resolve().parents[1]
if "--output-root" in sys.argv:
    OUTPUT_ROOT = Path(sys.argv[sys.argv.index("--output-root") + 1])
else:
    OUTPUT_ROOT = Path(os.environ.get("KYX_V6CF_OUTPUT_ROOT", str(BASE)))
EVIDENCE = OUTPUT_ROOT / "evidence" / "v6-contact-first-rig-rev1"
RENDERS = EVIDENCE / "renders"
REPORT = EVIDENCE / "render-report.json"
PREFIX = "V6CF_"
RENDER_PREFIX = "V6CF_RENDER_"
BODY_NAME = "KYX_V6A_AnatomySculpt_Body"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    roughness: float = 0.4,
    metallic: float = 0.0,
    emission: float = 0.0,
    alpha: float = 1.0,
) -> bpy.types.Material:
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    value.diffuse_color = (color[0], color[1], color[2], alpha)
    bsdf = value.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Alpha"].default_value = alpha
    if emission > 0.0:
        bsdf.inputs["Emission Color"].default_value = (color[0], color[1], color[2], 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission
    if alpha < 1.0 and hasattr(value, "surface_render_method"):
        value.surface_render_method = "DITHERED"
        value.use_transparency_overlap = False
    return value


def assign(obj: bpy.types.Object, value: bpy.types.Material) -> None:
    if obj.type == "MESH":
        obj.data.materials.clear()
        obj.data.materials.append(value)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def add_area(name: str, location: tuple[float, float, float], energy: float, size: float, color: tuple[float, float, float], target: Vector) -> None:
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    data.color = color
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)


def clean_render_helpers() -> None:
    for obj in list(bpy.data.objects):
        if obj.name.startswith(RENDER_PREFIX):
            bpy.data.objects.remove(obj, do_unlink=True)
    for data in list(bpy.data.materials):
        if data.name.startswith(RENDER_PREFIX):
            bpy.data.materials.remove(data)
    for data in list(bpy.data.curves):
        if data.name.startswith(RENDER_PREFIX):
            bpy.data.curves.remove(data)


def configure_scene() -> bpy.types.Scene:
    clean_render_helpers()
    RENDERS.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
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
    scene.render.stamp_foreground = (0.94, 0.97, 1.0, 1.0)
    scene.render.stamp_background = (0.005, 0.008, 0.013, 0.82)
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.15
    scene.render.image_settings.color_mode = "RGBA"
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.004, 0.008, 0.014, 1.0)
    background.inputs["Strength"].default_value = 0.13
    target = Vector((0.0, -0.35, 1.12))
    add_area(f"{RENDER_PREFIX}Key", (-2.7, -3.6, 3.3), 1200.0, 2.2, (0.78, 0.88, 1.0), target)
    add_area(f"{RENDER_PREFIX}Fill", (3.0, -2.8, 2.4), 900.0, 2.0, (1.0, 0.60, 0.34), target)
    add_area(f"{RENDER_PREFIX}Rim", (1.2, 2.5, 2.8), 1350.0, 1.8, (0.10, 0.58, 1.0), target)
    add_area(f"{RENDER_PREFIX}Hands", (0.2, -1.8, 1.45), 850.0, 1.0, (0.55, 0.86, 1.0), Vector((0.0, -0.60, 1.20)))
    floor_mat = material(f"{RENDER_PREFIX}FloorMat", (0.016, 0.024, 0.035, 1.0), roughness=0.86)
    bpy.ops.mesh.primitive_plane_add(size=8.0, location=(0.0, 0.0, -0.004))
    floor = bpy.context.object
    floor.name = f"{RENDER_PREFIX}Floor"
    assign(floor, floor_mat)
    return scene


def add_camera(name: str, location: Vector, target: Vector, ortho_scale: float) -> bpy.types.Object:
    data = bpy.data.cameras.new(name)
    data.type = "ORTHO"
    data.ortho_scale = ortho_scale
    data.lens = 55.0
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def cylinder_between(name: str, start: Vector, end: Vector, radius: float, value: bpy.types.Material) -> bpy.types.Object:
    direction = end - start
    bpy.ops.mesh.primitive_cylinder_add(vertices=18, radius=radius, depth=direction.length, location=(start + end) * 0.5)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    assign(obj, value)
    return obj


def sphere(name: str, center: Vector, radius: float, value: bpy.types.Material) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=radius, location=center)
    obj = bpy.context.object
    obj.name = name
    assign(obj, value)
    return obj


def create_rig_witness() -> list[bpy.types.Object]:
    rig = bpy.data.objects[f"{PREFIX}ContactFullBodyRig"]
    torso_mat = material(f"{RENDER_PREFIX}RigTorsoMat", (0.95, 0.18, 0.55, 1.0), emission=0.6, roughness=0.22)
    right_mat = material(f"{RENDER_PREFIX}RigRightMat", (1.0, 0.46, 0.06, 1.0), emission=0.55, roughness=0.22)
    left_mat = material(f"{RENDER_PREFIX}RigLeftMat", (0.03, 0.80, 1.0, 1.0), emission=0.55, roughness=0.22)
    finger_mat = material(f"{RENDER_PREFIX}RigFingerMat", (0.48, 1.0, 0.16, 1.0), emission=0.7, roughness=0.18)
    objects: list[bpy.types.Object] = []
    allowed = {"spine_01", "spine_02", "chest", "neck", "head"}
    for side in ("R", "L"):
        allowed.update({f"clavicle.{side}", f"upper_arm.{side}", f"forearm.{side}", f"wrist.{side}", f"palm.{side}"})
        for digit in ("thumb", "index", "middle", "ring", "pinky"):
            for index in range(1, 4):
                allowed.add(f"{digit}_0{index}.{side}")
    for name in sorted(allowed):
        bone = rig.pose.bones.get(name)
        if bone is None:
            continue
        if any(token in name for token in ("thumb", "index", "middle", "ring", "pinky")):
            value = finger_mat
            radius = 0.006
        elif name.endswith(".R"):
            value = right_mat
            radius = 0.012
        elif name.endswith(".L"):
            value = left_mat
            radius = 0.012
        else:
            value = torso_mat
            radius = 0.013
        start = rig.matrix_world @ bone.head
        end = rig.matrix_world @ bone.tail
        objects.append(cylinder_between(f"{RENDER_PREFIX}Bone_{name}", start, end, radius, value))
        objects.append(sphere(f"{RENDER_PREFIX}Joint_{name}", start, radius * 1.35, value))
    return objects


def set_rig_witness(objects: list[bpy.types.Object], visible: bool) -> None:
    for obj in objects:
        obj.hide_render = not visible


def set_body_material(alpha: float) -> None:
    body = bpy.data.objects[BODY_NAME]
    mat = body.data.materials[0]
    mat.diffuse_color = (0.47, 0.22, 0.13, alpha)
    if mat.use_nodes:
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Alpha"].default_value = alpha
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "DITHERED" if alpha < 1.0 else "DITHERED"
        mat.use_transparency_overlap = False


def render_view(
    scene: bpy.types.Scene,
    name: str,
    camera_location: Vector,
    target: Vector,
    ortho_scale: float,
    stamp: str,
    *,
    resolution: tuple[int, int] = (1200, 1200),
) -> dict[str, object]:
    camera = add_camera(f"{RENDER_PREFIX}Camera_{name}", camera_location, target, ortho_scale)
    scene.camera = camera
    scene.render.resolution_x = resolution[0]
    scene.render.resolution_y = resolution[1]
    scene.render.stamp_note_text = stamp
    output = RENDERS / f"kyx-v6-contact-first-rig-rev1-{name}.png"
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    return {
        "name": name,
        "path": str(output),
        "bytes": output.stat().st_size,
        "sha256": sha256(output),
        "camera": {"location": [round(v, 6) for v in camera.location], "target": [round(v, 6) for v in target], "orthographicScale": ortho_scale},
        "resolution": list(resolution),
        "stamp": stamp,
    }


def image_material(name: str, path: Path) -> bpy.types.Material:
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    nodes = value.node_tree.nodes
    links = value.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = bpy.data.images.load(str(path), check_existing=True)
    texture.interpolation = "Linear"
    emission.inputs["Strength"].default_value = 1.0
    links.new(texture.outputs["Color"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return value


def image_plane(name: str, path: Path, center: tuple[float, float, float], width: float, height: float) -> bpy.types.Object:
    x, y, z = center
    vertices = [
        (x - width * 0.5, y, z - height * 0.5),
        (x + width * 0.5, y, z - height * 0.5),
        (x + width * 0.5, y, z + height * 0.5),
        (x - width * 0.5, y, z + height * 0.5),
    ]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], [(0, 1, 2, 3)])
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    for loop_index, coordinate in zip(mesh.polygons[0].loop_indices, ((0, 0), (1, 0), (1, 1), (0, 1))):
        uv.data[loop_index].uv = coordinate
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    mesh.materials.append(image_material(f"{name}_Material", path))
    return obj


def text_label(name: str, body: str, location: tuple[float, float, float], size: float, color: tuple[float, float, float, float]) -> bpy.types.Object:
    data = bpy.data.curves.new(name, "FONT")
    data.body = body
    data.align_x = "CENTER"
    data.align_y = "CENTER"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (math.pi / 2.0, 0.0, 0.0)
    value = material(f"{name}_Material", color, emission=1.2, roughness=0.4)
    data.materials.append(value)
    return obj


def prepare_board(scene: bpy.types.Scene) -> bpy.types.Object:
    for obj in bpy.data.objects:
        obj.hide_render = True
    world = scene.world
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.002, 0.004, 0.008, 1.0)
    background.inputs["Strength"].default_value = 0.0
    camera = add_camera(f"{RENDER_PREFIX}BoardCamera", Vector((0.0, -10.0, 0.0)), Vector((0.0, 0.0, 0.0)), 7.55)
    camera.data.type = "ORTHO"
    camera.hide_render = False
    scene.camera = camera
    scene.render.use_stamp = False
    return camera


def render_board(scene: bpy.types.Scene, panels: list[dict[str, object]]) -> dict[str, object]:
    prepare_board(scene)
    titles = [
        "CONTINUOUS BODY / FRONT 3Q",
        "REAR-SIDE / STOCK + ELBOWS",
        "FULL UPPER-BODY + FINGER RIG",
        "FIRING PALM / FOUR-DIGIT WRAP",
        "INDEX / TRIGGER / GUARD CLEARANCE",
        "SUPPORT PALM / FOREGRIP WRAP",
        "SUPPORT HAND / SECTION SIDE",
        "STOCK PAD / SHOULDER POCKET",
        "UPPER-BODY CONTACT CONTEXT",
    ]
    xs = (-2.48, 0.0, 2.48)
    zs = (2.35, 0.0, -2.35)
    for index, (panel, title) in enumerate(zip(panels, titles)):
        column = index % 3
        row = index // 3
        center = (xs[column], 0.0, zs[row])
        plane = image_plane(f"{RENDER_PREFIX}BoardPanel_{index + 1:02d}", Path(panel["path"]), center, 2.30, 2.02)
        plane.hide_render = False
        label = text_label(f"{RENDER_PREFIX}BoardLabel_{index + 1:02d}", title, (center[0], -0.025, center[2] + 1.10), 0.105, (0.76, 0.90, 1.0, 1.0))
        label.hide_render = False
    header = text_label(
        f"{RENDER_PREFIX}BoardHeader",
        "KYX V6 CONTACT-FIRST — FULL ARM / PALM / ALL-DIGIT RIG EARLY PROOF",
        (0.0, -0.025, 3.58),
        0.17,
        (0.94, 0.97, 1.0, 1.0),
    )
    header.hide_render = False
    footer = text_label(
        f"{RENDER_PREFIX}BoardFooter",
        "EARLY REVIEW ONLY • NO GARMENT / ARMOR • NO V6-B / G6 CLAIM • CONTACT MUST BE LITERAL, NOT INFERRED",
        (0.0, -0.025, -3.58),
        0.10,
        (1.0, 0.48, 0.19, 1.0),
    )
    footer.hide_render = False
    output = RENDERS / "kyx-v6-contact-first-rig-rev1-early-proof-board.png"
    scene.render.resolution_x = 3000
    scene.render.resolution_y = 3000
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    return {"name": "early-proof-board", "path": str(output), "bytes": output.stat().st_size, "sha256": sha256(output), "resolution": [3000, 3000]}


def main() -> None:
    scene = configure_scene()
    body = bpy.data.objects.get(BODY_NAME)
    rig = bpy.data.objects.get(f"{PREFIX}ContactFullBodyRig")
    if body is None or rig is None:
        raise RuntimeError("Authored contact-first body/rig missing")
    if any("garment" in name.lower() or "armor" in name.lower() for name in bpy.data.objects.keys()):
        raise RuntimeError("Contact-first proof unexpectedly contains garment or armor")
    landmarks = {
        "forward": Vector((0.220107, -0.975476, 0.0)),
        "right": Vector((0.975476, 0.220107, 0.0)),
        "shoulder": Vector((-0.185, -0.115, 1.365)),
        "grip": Vector((-0.113465, -0.432030, 1.165)),
        "trigger": Vector((-0.109063, -0.451539, 1.270)),
        "foregrip": Vector((-0.044131, -0.739304, 1.190)),
    }
    forward = landmarks["forward"]
    right = landmarks["right"]
    witness = create_rig_witness()
    set_rig_witness(witness, False)
    set_body_material(1.0)

    panels: list[dict[str, object]] = []
    panels.append(render_view(scene, "full-body-front-three-quarter", Vector((3.2, -4.8, 2.35)), Vector((0.0, -0.30, 0.94)), 2.18, "CONTINUOUS V6-A BODY • BOTH ARMS + HANDS • CONTACT-FIRST EARLY PROOF"))
    panels.append(render_view(scene, "full-body-rear-side", Vector((-3.6, 3.4, 2.05)), Vector((0.0, -0.28, 0.98)), 2.18, "REAR-SIDE • SHOULDER / ELBOW / WRIST CONTINUITY • EARLY PROOF"))

    set_body_material(0.30)
    set_rig_witness(witness, True)
    panels.append(render_view(scene, "full-upper-body-rig-witness", Vector((2.8, -4.1, 2.25)), Vector((0.0, -0.38, 1.20)), 1.45, "REAL DEFORMATION ARMATURE • SPINE / CLAVICLES / ARMS / PALMS / ALL DIGIT CHAINS"))
    set_rig_witness(witness, False)
    set_body_material(1.0)

    panels.append(render_view(scene, "firing-palm-wrap-ortho", landmarks["grip"] + forward * 1.05 + right * 0.05 + Vector((0.0, 0.0, 0.02)), landmarks["grip"] + Vector((0.0, 0.0, 0.015)), 0.40, "ORTHO ALONG BORE • FIRING PALM + FOUR DIGITS • SECTIONED RECEIVER"))
    panels.append(render_view(scene, "firing-index-trigger-guard-ortho", landmarks["trigger"] + right * 1.05 + forward * 0.02, landmarks["trigger"], 0.40, "ORTHO FROM RIFLE RIGHT • INDEX / TRIGGER / GUARD CLEARANCE"))
    panels.append(render_view(scene, "support-palm-foregrip-ortho", landmarks["foregrip"] - forward * 1.05 + right * 0.03, landmarks["foregrip"] + Vector((0.0, 0.0, 0.005)), 0.42, "ORTHO FROM REAR • SUPPORT PALM + FOUR DIGITS / FOREGRIP"))
    panels.append(render_view(scene, "support-hand-section-side", landmarks["foregrip"] - right * 1.05 + forward * 0.02, landmarks["foregrip"], 0.42, "ORTHO FROM RIFLE LEFT • SUPPORT WRIST / PALM / THUMB / DIGITS"))
    panels.append(render_view(scene, "stock-shoulder-tangent-ortho", landmarks["shoulder"] + right * 1.10 + Vector((0.0, 0.0, 0.01)), landmarks["shoulder"] + forward * 0.02, 0.48, "ORTHO • STOCK PAD CONTACT SURFACE / SHOULDER POCKET TANGENCY"))
    panels.append(render_view(scene, "upper-body-contact-context", Vector((1.9, -3.2, 1.95)), Vector((0.0, -0.43, 1.29)), 1.20, "UPPER BODY • BOTH HANDS ON SAME RIFLE • PLAUSIBLE ELBOW / WRIST LINES"))
    board = render_board(scene, panels)
    report = {
        "schema": "kyx-v6-contact-first-rig-render-report-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "blend": {"path": bpy.data.filepath, "sha256": sha256(Path(bpy.data.filepath))},
        "status": "EARLY_VISUAL_PROOF_REVIEW_REQUIRED",
        "panels": panels,
        "board": board,
        "renderContract": {
            "receiver": "translucent/sectioned in authored asset",
            "cameras": "orthographic for all four literal contact families",
            "fullBodyContinuity": True,
            "rearSideContinuity": True,
            "armatureWitness": True,
            "automaticAcceptance": False,
        },
    }
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("V6CF_RENDER_REPORT:" + json.dumps(report))


if __name__ == "__main__":
    main()
