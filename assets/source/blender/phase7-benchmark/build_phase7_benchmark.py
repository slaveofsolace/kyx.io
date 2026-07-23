"""Build KYX's isolated, original Phase 7 Blender benchmark.

Run with Blender 5.1.2 from the repository root:

    blender --background --factory-startup --python \
      assets/source/blender/phase7-benchmark/build_phase7_benchmark.py

This is a benchmark-only source artifact. It is deliberately not a hero asset,
runtime integration, deformation proof, complete animation matrix, or G6 claim.
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import time

import bpy
from mathutils import Vector


SCRIPT_PATH = Path(__file__).resolve()
BENCHMARK_DIR = SCRIPT_PATH.parent
OUTPUT_DIR = BENCHMARK_DIR / "output"
RENDER_DIR = OUTPUT_DIR / "renders"
BLEND_PATH = OUTPUT_DIR / "kyx_phase7_tactical_benchmark.blend"
GLB_PATH = OUTPUT_DIR / "kyx_phase7_tactical_benchmark.glb"
REPORT_PATH = OUTPUT_DIR / "benchmark-report.json"

FRAME_START = 1
FRAME_COMMIT = 12
FRAME_END = 24
RENDER_FRAMES = (FRAME_START, FRAME_COMMIT, FRAME_END)
FPS = 24
RENDER_WIDTH = 720
RENDER_HEIGHT = 720

INK = (0.013, 0.018, 0.030, 1.0)
INK_MID = (0.041, 0.059, 0.090, 1.0)
SLATE = (0.105, 0.130, 0.170, 1.0)
PAPER = (0.807, 0.753, 0.663, 1.0)
PAPER_LIGHT = (0.941, 0.871, 0.740, 1.0)
OXIDE = (0.695, 0.068, 0.039, 1.0)
AQUA = (0.054, 0.477, 0.445, 1.0)
SAFFRON = (0.760, 0.386, 0.035, 1.0)


def reset_scene() -> None:
    if bpy.context.object is not None and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.actions,
    ):
        for datablock in list(datablocks):
            datablocks.remove(datablock)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def make_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.82,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material["kyx_palette_token"] = name.removeprefix("MAT_").lower()
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is None:
        raise RuntimeError(f"Missing Principled BSDF node for {name}")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    return material


def assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if obj.type != "MESH":
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)


def apply_bevel(obj: bpy.types.Object, width: float) -> None:
    if width <= 0:
        return
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new(name="AUTH_Bevel", type="BEVEL")
    modifier.width = width
    modifier.segments = 1
    modifier.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def add_box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.025,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    move_to_collection(obj, collection)
    assign_material(obj, material)
    apply_bevel(obj, bevel)
    obj["kyx_original_geometry"] = True
    return obj


def add_cylinder(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    vertices: int = 8,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.012,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, collection)
    assign_material(obj, material)
    apply_bevel(obj, bevel)
    obj["kyx_original_geometry"] = True
    return obj


def add_ico(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    move_to_collection(obj, collection)
    assign_material(obj, material)
    obj["kyx_original_geometry"] = True
    return obj


def parent_to_bone(
    obj: bpy.types.Object,
    armature: bpy.types.Object,
    bone_name: str,
) -> None:
    world_matrix = obj.matrix_world.copy()
    obj.parent = armature
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    obj.matrix_world = world_matrix
    obj["kyx_parent_bone"] = bone_name


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def build_rig(export_collection: bpy.types.Collection) -> bpy.types.Object:
    armature_data = bpy.data.armatures.new("RIGDATA_KYX_Benchmark")
    armature = bpy.data.objects.new("RIG_KYX_Benchmark", armature_data)
    export_collection.objects.link(armature)
    armature.show_in_front = True
    armature["kyx_asset_role"] = "benchmark_rig"
    armature["kyx_root_motion_policy"] = "in_place"
    armature["kyx_provenance"] = "project_original_scripted_geometry"

    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(
        name: str,
        head: tuple[float, float, float],
        tail: tuple[float, float, float],
        parent: str | None = None,
        *,
        deform: bool = True,
    ) -> None:
        edit_bone = armature_data.edit_bones.new(name)
        edit_bone.head = head
        edit_bone.tail = tail
        edit_bone.use_deform = deform
        if parent is not None:
            edit_bone.parent = armature_data.edit_bones[parent]

    bone("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.22), deform=False)
    bone("hips", (0.0, 0.0, 0.78), (0.0, 0.0, 1.10), "root")
    bone("spine", (0.0, 0.0, 1.10), (0.0, 0.0, 1.43), "hips")
    bone("chest", (0.0, 0.0, 1.43), (0.0, 0.0, 1.78), "spine")
    bone("neck", (0.0, 0.0, 1.78), (0.0, 0.0, 1.94), "chest")
    bone("head", (0.0, 0.0, 1.94), (0.0, 0.0, 2.24), "neck")

    bone("upper_arm.L", (0.34, 0.0, 1.70), (0.60, 0.0, 1.38), "chest")
    bone("forearm.L", (0.60, 0.0, 1.38), (0.66, -0.02, 1.05), "upper_arm.L")
    bone("hand.L", (0.66, -0.02, 1.05), (0.66, -0.10, 0.90), "forearm.L")
    bone("upper_arm.R", (-0.34, 0.0, 1.70), (-0.60, 0.0, 1.38), "chest")
    bone("forearm.R", (-0.60, 0.0, 1.38), (-0.66, -0.02, 1.05), "upper_arm.R")
    bone("hand.R", (-0.66, -0.02, 1.05), (-0.66, -0.10, 0.90), "forearm.R")

    bone("thigh.L", (0.19, 0.0, 0.96), (0.22, 0.0, 0.52), "hips")
    bone("shin.L", (0.22, 0.0, 0.52), (0.22, 0.0, 0.12), "thigh.L")
    bone("foot.L", (0.22, 0.0, 0.12), (0.22, -0.28, 0.08), "shin.L")
    bone("thigh.R", (-0.19, 0.0, 0.96), (-0.22, 0.0, 0.52), "hips")
    bone("shin.R", (-0.22, 0.0, 0.52), (-0.22, 0.0, 0.12), "thigh.R")
    bone("foot.R", (-0.22, 0.0, 0.12), (-0.22, -0.28, 0.08), "shin.R")

    bone("socket_head", (0.0, 0.0, 2.18), (0.0, -0.10, 2.18), "head", deform=False)
    bone("socket_chest", (0.0, -0.12, 1.62), (0.0, -0.22, 1.62), "chest", deform=False)
    bone("socket_hand_l", (0.66, -0.08, 0.98), (0.66, -0.18, 0.98), "hand.L", deform=False)
    bone("socket_hand_r", (-0.66, -0.08, 0.98), (-0.66, -0.18, 0.98), "hand.R", deform=False)
    bone("socket_muzzle", (-0.66, -1.55, 1.02), (-0.66, -1.70, 1.02), "hand.R", deform=False)

    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)
    return armature


def build_character(
    export_collection: bpy.types.Collection,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []

    def part(obj: bpy.types.Object, bone_name: str) -> None:
        parent_to_bone(obj, armature, bone_name)
        obj["kyx_asset_role"] = "benchmark_mannequin_part"
        parts.append(obj)

    part(add_box("CHR_Pelvis", (0.0, 0.0, 1.01), (0.48, 0.30, 0.28), materials["slate"], export_collection), "hips")
    part(add_box("CHR_Torso", (0.0, 0.0, 1.47), (0.67, 0.34, 0.72), materials["paper"], export_collection, bevel=0.055), "chest")
    part(add_box("CHR_ChestPlate", (0.0, -0.19, 1.53), (0.52, 0.10, 0.38), materials["oxide"], export_collection, rotation=(math.radians(-7), 0.0, 0.0), bevel=0.035), "chest")
    part(add_box("CHR_WaistInk", (0.0, -0.02, 1.11), (0.40, 0.30, 0.12), materials["ink"], export_collection, bevel=0.018), "spine")
    part(add_ico("CHR_Head", (0.0, 0.0, 2.04), (0.25, 0.22, 0.31), materials["paper_light"], export_collection), "head")
    part(add_box("CHR_Visor", (0.0, -0.205, 2.08), (0.35, 0.055, 0.12), materials["aqua"], export_collection, rotation=(math.radians(-4), 0.0, 0.0), bevel=0.018), "head")
    part(add_box("CHR_HeadInkCut", (0.10, -0.18, 2.22), (0.14, 0.055, 0.13), materials["ink"], export_collection, rotation=(0.0, math.radians(18), 0.0), bevel=0.012), "head")

    for side, sign in (("L", 1.0), ("R", -1.0)):
        part(add_cylinder(f"CHR_UpperArm_{side}", (0.48 * sign, 0.0, 1.52), 0.13, 0.42, materials["slate"], export_collection, vertices=8, rotation=(0.0, math.radians(38 * sign), 0.0)), f"upper_arm.{side}")
        part(add_cylinder(f"CHR_Forearm_{side}", (0.63 * sign, -0.01, 1.20), 0.115, 0.36, materials["paper"], export_collection, vertices=8, rotation=(0.0, math.radians(10 * sign), 0.0)), f"forearm.{side}")
        part(add_box(f"CHR_Hand_{side}", (0.66 * sign, -0.07, 0.99), (0.17, 0.16, 0.22), materials["ink_mid"], export_collection, bevel=0.028), f"hand.{side}")

        part(add_cylinder(f"CHR_Thigh_{side}", (0.20 * sign, 0.0, 0.72), 0.15, 0.48, materials["slate"], export_collection, vertices=8), f"thigh.{side}")
        part(add_cylinder(f"CHR_Shin_{side}", (0.22 * sign, 0.0, 0.32), 0.12, 0.42, materials["paper"], export_collection, vertices=8), f"shin.{side}")
        part(add_box(f"CHR_Boot_{side}", (0.22 * sign, -0.10, 0.09), (0.25, 0.39, 0.17), materials["ink_mid"], export_collection, bevel=0.035), f"foot.{side}")

    # The single asymmetrical shoulder shell is the authored silhouette feature.
    part(add_box("CHR_ShoulderShell_L", (0.53, -0.01, 1.73), (0.42, 0.40, 0.24), materials["saffron"], export_collection, rotation=(0.0, math.radians(-12), math.radians(-8)), bevel=0.07), "upper_arm.L")
    part(add_box("CHR_ForearmDevice_L", (0.64, -0.15, 1.20), (0.16, 0.13, 0.24), materials["aqua"], export_collection, rotation=(math.radians(-8), 0.0, 0.0), bevel=0.025), "forearm.L")
    return parts


def build_rifle(
    export_collection: bpy.types.Collection,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    root = bpy.data.objects.new("PROP_RifleRoot", None)
    export_collection.objects.link(root)
    root.empty_display_type = "ARROWS"
    root.empty_display_size = 0.16
    root["kyx_asset_role"] = "benchmark_rifle_prop"
    root["kyx_firing_axis"] = "local_-Y"
    parent_to_bone(root, armature, "hand.R")

    pieces = [
        add_box("PROP_RifleReceiver", (-0.36, -0.68, 1.16), (0.22, 0.82, 0.22), materials["ink_mid"], export_collection, bevel=0.035),
        add_box("PROP_RifleStock", (-0.36, -0.19, 1.17), (0.28, 0.32, 0.26), materials["paper"], export_collection, rotation=(math.radians(-8), 0.0, 0.0), bevel=0.045),
        add_cylinder("PROP_RifleBarrel", (-0.36, -1.27, 1.18), 0.055, 0.58, materials["slate"], export_collection, vertices=8, rotation=(math.radians(90), 0.0, 0.0), bevel=0.01),
        add_cylinder("PROP_RifleMuzzle", (-0.36, -1.59, 1.18), 0.075, 0.15, materials["oxide"], export_collection, vertices=8, rotation=(math.radians(90), 0.0, 0.0), bevel=0.012),
        add_box("PROP_RifleMagazine", (-0.36, -0.64, 0.94), (0.16, 0.25, 0.35), materials["oxide"], export_collection, rotation=(math.radians(-14), 0.0, 0.0), bevel=0.025),
        add_box("PROP_RifleSight", (-0.36, -0.82, 1.34), (0.12, 0.22, 0.13), materials["aqua"], export_collection, bevel=0.02),
        add_box("PROP_RifleGrip", (-0.36, -0.50, 0.99), (0.14, 0.18, 0.30), materials["ink"], export_collection, rotation=(math.radians(-13), 0.0, 0.0), bevel=0.025),
    ]
    for piece in pieces:
        world_matrix = piece.matrix_world.copy()
        piece.parent = root
        piece.matrix_world = world_matrix
        piece["kyx_asset_role"] = "benchmark_rifle_part"

    muzzle = bpy.data.objects.new("SOCKET_Muzzle", None)
    export_collection.objects.link(muzzle)
    muzzle.empty_display_type = "SINGLE_ARROW"
    muzzle.empty_display_size = 0.12
    muzzle.location = (-0.36, -1.69, 1.18)
    world_matrix = muzzle.matrix_world.copy()
    muzzle.parent = root
    muzzle.matrix_world = world_matrix
    muzzle["kyx_socket"] = "muzzle"
    return root, [*pieces, muzzle]


def set_rotation(pose_bone: bpy.types.PoseBone, values: tuple[float, float, float]) -> None:
    pose_bone.rotation_mode = "XYZ"
    pose_bone.rotation_euler = tuple(math.radians(value) for value in values)
    pose_bone.keyframe_insert(data_path="rotation_euler")


def set_location(pose_bone: bpy.types.PoseBone, values: tuple[float, float, float]) -> None:
    pose_bone.location = values
    pose_bone.keyframe_insert(data_path="location")


def key_pose(
    armature: bpy.types.Object,
    frame: int,
    *,
    commit: float,
) -> None:
    bpy.context.scene.frame_set(frame)
    pose = armature.pose.bones
    set_location(pose["hips"], (0.0, 0.0, 0.018 * commit))
    set_rotation(pose["hips"], (0.0, 0.0, -4.0 * commit))
    set_rotation(pose["spine"], (2.0 + 3.0 * commit, 0.0, 3.0 * commit))
    set_rotation(pose["chest"], (3.0 + 4.0 * commit, 0.0, -4.0 * commit))
    set_rotation(pose["head"], (-2.0 * commit, 0.0, 6.0 * commit))

    set_rotation(pose["upper_arm.R"], (-56.0 - 7.0 * commit, 8.0, -29.0))
    set_rotation(pose["forearm.R"], (-42.0 - 5.0 * commit, -5.0, 18.0))
    set_rotation(pose["hand.R"], (4.0, -5.0, -2.0))
    set_rotation(pose["upper_arm.L"], (-64.0 - 5.0 * commit, -7.0, 34.0))
    set_rotation(pose["forearm.L"], (-51.0 - 6.0 * commit, 8.0, -24.0))
    set_rotation(pose["hand.L"], (3.0, 4.0, 2.0))

    set_rotation(pose["thigh.L"], (1.0, -2.0, -3.0 - 2.0 * commit))
    set_rotation(pose["shin.L"], (-2.0, 0.0, 0.0))
    set_rotation(pose["thigh.R"], (-2.0, 2.0, 3.0 + 2.0 * commit))
    set_rotation(pose["shin.R"], (3.0, 0.0, 0.0))


def action_fcurves(action: bpy.types.Action) -> list[bpy.types.FCurve]:
    """Return curves from Blender 5.x layered actions."""
    curves: list[bpy.types.FCurve] = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in strip.channelbags:
                curves.extend(channelbag.fcurves)
    return curves


def build_animation(armature: bpy.types.Object) -> bpy.types.Action:
    armature.animation_data_create()
    action = bpy.data.actions.new("BENCH_TacticalShift_Loop")
    armature.animation_data.action = action
    action["kyx_semantic_state"] = "combat_ready_pose_shift"
    action["kyx_root_motion"] = "in_place"
    action["kyx_benchmark_only"] = True

    key_pose(armature, FRAME_START, commit=0.0)
    key_pose(armature, FRAME_COMMIT, commit=1.0)
    key_pose(armature, FRAME_END, commit=0.0)

    for fcurve in action_fcurves(action):
        for keyframe in fcurve.keyframe_points:
            keyframe.interpolation = "BEZIER"
            keyframe.handle_left_type = "AUTO_CLAMPED"
            keyframe.handle_right_type = "AUTO_CLAMPED"

    markers = (
        ("equip_ready", FRAME_START, "presentation"),
        ("ability_commit", FRAME_COMMIT, "both"),
        ("pose_recover", FRAME_END, "presentation"),
    )
    for marker_name, frame, _marker_role in markers:
        bpy.context.scene.timeline_markers.new(marker_name, frame=frame)
        if hasattr(action, "pose_markers"):
            action_marker = action.pose_markers.new(marker_name)
            action_marker.frame = frame
    return action


def build_presentation(
    presentation_collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Camera:
    add_box("PRES_Floor", (0.0, 0.0, -0.08), (6.0, 6.0, 0.14), materials["paper_light"], presentation_collection, bevel=0.0)
    add_box("PRES_Backdrop", (0.0, 1.50, 1.45), (5.2, 0.10, 3.2), materials["paper"], presentation_collection, bevel=0.0)
    add_box("PRES_InkChannel", (-1.55, 1.42, 1.55), (0.26, 0.07, 2.45), materials["ink"], presentation_collection, rotation=(0.0, math.radians(-22), 0.0), bevel=0.0)
    add_box("PRES_OxideCut", (1.42, 1.40, 1.10), (0.18, 0.06, 1.85), materials["oxide"], presentation_collection, rotation=(0.0, math.radians(30), 0.0), bevel=0.0)
    add_box("PRES_SaffronStep", (1.25, 0.80, 0.07), (1.35, 0.62, 0.12), materials["saffron"], presentation_collection, bevel=0.012)

    camera_data = bpy.data.cameras.new("CAMDATA_Benchmark")
    camera = bpy.data.objects.new("CAM_Benchmark", camera_data)
    presentation_collection.objects.link(camera)
    camera.location = (4.55, -7.20, 3.25)
    camera_data.lens = 58.0
    camera_data.sensor_width = 36.0
    look_at(camera, (0.0, 0.0, 1.22))
    bpy.context.scene.camera = camera

    def light(name: str, kind: str, location: tuple[float, float, float], energy: float, color: tuple[float, float, float], size: float = 4.0) -> None:
        data = bpy.data.lights.new(name=f"{name}_DATA", type=kind)
        data.energy = energy
        data.color = color
        if kind == "AREA":
            data.shape = "DISK"
            data.size = size
        obj = bpy.data.objects.new(name, data)
        presentation_collection.objects.link(obj)
        obj.location = location
        look_at(obj, (0.0, 0.0, 1.15))

    light("LIGHT_Key", "AREA", (-3.4, -4.4, 6.2), 1050.0, (1.0, 0.78, 0.59), 4.2)
    light("LIGHT_Fill", "AREA", (4.3, -1.2, 3.6), 720.0, (0.50, 0.88, 0.92), 3.4)
    light("LIGHT_Rim", "AREA", (0.0, 3.6, 4.8), 920.0, (1.0, 0.32, 0.18), 2.4)
    return camera


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.name = "SCENE_KYX_Phase7_Benchmark"
    scene.frame_start = FRAME_START
    scene.frame_end = FRAME_END
    scene.render.fps = FPS
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RENDER_WIDTH
    scene.render.resolution_y = RENDER_HEIGHT
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.use_freestyle = True
    scene.render.line_thickness = 1.15
    scene.render.film_transparent = False
    scene.world.color = PAPER[:3]
    background = scene.world.node_tree.nodes.get("Background")
    if background is not None:
        background.inputs["Color"].default_value = PAPER
        background.inputs["Strength"].default_value = 0.34
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene["kyx_benchmark_scope"] = "phase7_visual_animation_benchmark_only"
    scene["kyx_g6_status"] = "not_claimed"
    scene["kyx_units"] = "meters"
    scene["kyx_forward_axis"] = "-Y"
    scene["kyx_up_axis"] = "+Z"


def select_export_objects(export_collection: bpy.types.Collection) -> list[bpy.types.Object]:
    bpy.ops.object.select_all(action="DESELECT")
    objects = list(export_collection.all_objects)
    for obj in objects:
        obj.hide_render = False
        obj.hide_set(False)
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]
    return objects


def export_glb(export_collection: bpy.types.Collection) -> float:
    select_export_objects(export_collection)
    started = time.perf_counter()
    result = bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        check_existing=False,
        export_format="GLB",
        use_selection=True,
        export_copyright="KYX project-original benchmark; no third-party art",
        export_texcoords=False,
        export_normals=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_extras=True,
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_frame_range=True,
        export_frame_step=1,
        export_force_sampling=True,
        export_def_bones=True,
        export_leaf_bone=False,
        export_optimize_animation_size=True,
        export_skins=True,
        export_influence_nb=4,
        export_all_influences=False,
        export_lights=False,
    )
    if "FINISHED" not in result:
        raise RuntimeError(f"glTF export failed: {result}")
    return time.perf_counter() - started


def render_stills() -> tuple[dict[str, float], list[str]]:
    scene = bpy.context.scene
    timings: dict[str, float] = {}
    paths: list[str] = []
    for frame in RENDER_FRAMES:
        scene.frame_set(frame)
        path = RENDER_DIR / f"phase7-benchmark-frame-{frame:03d}.png"
        scene.render.filepath = str(path)
        started = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        timings[str(frame)] = round(time.perf_counter() - started, 6)
        paths.append(path.relative_to(BENCHMARK_DIR).as_posix())
    return timings, paths


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inspect_glb(path: Path) -> dict[str, object]:
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise RuntimeError("Exported GLB header is invalid")
    version = int.from_bytes(data[4:8], "little")
    declared_length = int.from_bytes(data[8:12], "little")
    json_length = int.from_bytes(data[12:16], "little")
    json_type = int.from_bytes(data[16:20], "little")
    if version != 2 or declared_length != len(data) or json_type != 0x4E4F534A:
        raise RuntimeError("Exported GLB container metadata is invalid")
    document = json.loads(data[20:20 + json_length].rstrip(b" \x00").decode("utf-8"))
    return {
        "version": version,
        "declaredBytes": declared_length,
        "generator": document.get("asset", {}).get("generator"),
        "scenes": len(document.get("scenes", [])),
        "nodes": len(document.get("nodes", [])),
        "meshes": len(document.get("meshes", [])),
        "materials": len(document.get("materials", [])),
        "skins": len(document.get("skins", [])),
        "animations": [
            {
                "name": animation.get("name"),
                "channels": len(animation.get("channels", [])),
                "samplers": len(animation.get("samplers", [])),
            }
            for animation in document.get("animations", [])
        ],
        "extensionsUsed": document.get("extensionsUsed", []),
    }


def mesh_counts(objects: list[bpy.types.Object]) -> dict[str, int]:
    mesh_objects = [obj for obj in objects if obj.type == "MESH"]
    triangles = 0
    vertices = 0
    primitives = 0
    materials: set[str] = set()
    for obj in mesh_objects:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
        vertices += len(obj.data.vertices)
        primitives += max(1, len(obj.data.materials))
        materials.update(material.name for material in obj.data.materials if material is not None)
    return {
        "objects": len(objects),
        "meshObjects": len(mesh_objects),
        "vertices": vertices,
        "triangles": triangles,
        "primitives": primitives,
        "materials": len(materials),
    }


def action_counts(action: bpy.types.Action) -> dict[str, int | float | str]:
    fcurves = action_fcurves(action)
    keyframes = sum(len(fcurve.keyframe_points) for fcurve in fcurves)
    return {
        "name": action.name,
        "frameStart": FRAME_START,
        "frameEnd": FRAME_END,
        "durationSeconds": round((FRAME_END - FRAME_START) / FPS, 6),
        "fcurves": len(fcurves),
        "keyframes": keyframes,
    }


def main() -> None:
    total_started = time.perf_counter()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    reset_scene()
    configure_scene()

    export_collection = make_collection("EXPORT_Benchmark")
    presentation_collection = make_collection("PRESENTATION_Benchmark")
    materials = {
        "ink": make_material("MAT_Ink950", INK, metallic=0.05, roughness=0.90),
        "ink_mid": make_material("MAT_Ink800", INK_MID, metallic=0.20, roughness=0.72),
        "slate": make_material("MAT_Slate600", SLATE, metallic=0.58, roughness=0.56),
        "paper": make_material("MAT_Paper100", PAPER, metallic=0.0, roughness=0.88),
        "paper_light": make_material("MAT_Paper050", PAPER_LIGHT, metallic=0.0, roughness=0.92),
        "oxide": make_material("MAT_Oxide", OXIDE, metallic=0.14, roughness=0.67),
        "aqua": make_material("MAT_Aqua", AQUA, metallic=0.16, roughness=0.52),
        "saffron": make_material("MAT_Saffron", SAFFRON, metallic=0.06, roughness=0.78),
    }

    armature = build_rig(export_collection)
    build_character(export_collection, armature, materials)
    build_rifle(export_collection, armature, materials)
    action = build_animation(armature)
    build_presentation(presentation_collection, materials)

    scene = bpy.context.scene
    scene.frame_set(FRAME_COMMIT)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)

    export_seconds = export_glb(export_collection)
    render_seconds, render_paths = render_stills()
    scene.frame_set(FRAME_COMMIT)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)

    export_objects = list(export_collection.all_objects)
    glb_header = GLB_PATH.read_bytes()[:4]
    warnings = [
        "BENCHMARK_ONLY_NOT_RUNTIME_INTEGRATED",
        "NO_G6_CLAIM",
        "RIGID_BONE_PARENTED_MANNEQUIN_NOT_SKIN_DEFORMATION_PROOF",
        "NO_LODS_TEXTURE_ATLASES_KTX2_MESHOPT_OR_VIEWMODEL",
        "ONE_POSE_LOOP_NOT_COMPLETE_FIRST_OR_THIRD_PERSON_CLIP_MATRIX",
        "FREESTYLE_RENDER_LINES_ARE_PRESENTATION_ONLY_NOT_RUNTIME_OUTLINE_PROOF",
        "KHRONOS_GLTF_VALIDATOR_NOT_RUN",
        "BLEND_AND_RENDER_HASHES_ARE_ARTIFACT_IDS_NOT_CROSS_RUN_SENTINELS",
    ]
    report = {
        "schemaVersion": 1,
        "status": "EXECUTED_BENCHMARK_ONLY",
        "g6Claimed": False,
        "source": {
            "script": SCRIPT_PATH.relative_to(repo7_path()).as_posix(),
            "blend": BLEND_PATH.relative_to(BENCHMARK_DIR).as_posix(),
            "provenance": "Project-original scripted primitive geometry; no third-party art or textures.",
        },
        "environment": {
            "blenderVersion": bpy.app.version_string,
            "blenderVersionTuple": list(bpy.app.version),
            "background": bpy.app.background,
            "renderEngine": scene.render.engine,
            "resolution": [RENDER_WIDTH, RENDER_HEIGHT],
            "fps": FPS,
        },
        "asset": {
            **mesh_counts(export_objects),
            "bones": len(armature.data.bones),
            "actions": [action_counts(action)],
            "markers": [
                {
                    "name": marker.name,
                    "frame": marker.frame,
                    "role": {
                        "equip_ready": "presentation",
                        "ability_commit": "both",
                        "pose_recover": "presentation",
                    }.get(marker.name, "unspecified"),
                }
                for marker in scene.timeline_markers
            ],
            "rootMotion": "in_place",
            "asymmetricalFeature": "left shoulder shell and forearm device",
        },
        "outputs": {
            "glb": GLB_PATH.relative_to(BENCHMARK_DIR).as_posix(),
            "glbBytes": GLB_PATH.stat().st_size,
            "glbSha256": sha256(GLB_PATH),
            "glbMagicValid": glb_header == b"glTF",
            "blend": BLEND_PATH.relative_to(BENCHMARK_DIR).as_posix(),
            "blendBytes": BLEND_PATH.stat().st_size,
            "blendSha256": sha256(BLEND_PATH),
            "renders": render_paths,
            "renderSha256": {
                path: sha256(BENCHMARK_DIR / path) for path in render_paths
            },
            "glbInspection": inspect_glb(GLB_PATH),
        },
        "timingsSeconds": {
            "glbExport": round(export_seconds, 6),
            "rendersByFrame": render_seconds,
            "total": round(time.perf_counter() - total_started, 6),
        },
        "warnings": warnings,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("KYX_PHASE7_BENCHMARK_REPORT " + json.dumps(report, separators=(",", ":")))


def repo7_path() -> Path:
    # assets/source/blender/phase7-benchmark/build_phase7_benchmark.py -> repo root
    return SCRIPT_PATH.parents[4]


if __name__ == "__main__":
    main()
