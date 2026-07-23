"""Build the isolated KYX Phase 7 character visual-refinement v2 asset.

Run from the repository root with Blender 5.1.2:

    "C:/Program Files/Blender Foundation/Blender 5.1/blender.exe" \
      --background --factory-startup --threads 1 --python \
      assets/source/blender/phase7-character-refinement-v2/build_character_refinement_v2.py

This lane responds to the product-owner rejection of the blocky Phase 7
benchmark.  It is original scripted geometry and deliberately remains separate
from the preserved benchmark.  It is a visual refinement and export proof, not
a G6 claim, production deformation proof, LOD set, or complete clip library.
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
LANE_DIR = SCRIPT_PATH.parent
OUTPUT_DIR = LANE_DIR / "output"
RENDER_DIR = OUTPUT_DIR / "renders"
BLEND_PATH = OUTPUT_DIR / "kyx_phase7_character_refinement_v2.blend"
GLB_PATH = OUTPUT_DIR / "kyx_phase7_character_refinement_v2.glb"
REPORT_PATH = OUTPUT_DIR / "character-refinement-v2-report.json"

FRAME_START = 1
FRAME_BREATHE = 16
FRAME_END = 32
FPS = 24
RENDER_SIZE = 900

INK = (0.008, 0.014, 0.025, 1.0)
GRAPHITE = (0.030, 0.048, 0.070, 1.0)
UNDERSUIT = (0.055, 0.083, 0.105, 1.0)
UNDERSUIT_LIGHT = (0.102, 0.145, 0.170, 1.0)
ARMOR = (0.525, 0.565, 0.555, 1.0)
ARMOR_LIGHT = (0.770, 0.785, 0.735, 1.0)
OXIDE = (0.630, 0.105, 0.045, 1.0)
OXIDE_DARK = (0.270, 0.047, 0.028, 1.0)
TEAL = (0.045, 0.540, 0.500, 1.0)
BRASS = (0.475, 0.250, 0.070, 1.0)
FLOOR = (0.016, 0.024, 0.035, 1.0)
BACKDROP = (0.027, 0.042, 0.057, 1.0)


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
    roughness: float = 0.72,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    material["kyx_palette_token"] = name.removeprefix("MAT_").lower()
    material["kyx_original_color"] = list(color)
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is None:
        raise RuntimeError(f"Missing Principled BSDF node for {name}")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    if emission_strength > 0.0:
        emission = principled.inputs.get("Emission Color") or principled.inputs.get("Emission")
        strength = principled.inputs.get("Emission Strength")
        if emission is not None:
            emission.default_value = color
        if strength is not None:
            strength.default_value = emission_strength
    return material


def assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if obj.type != "MESH":
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)


def smooth_mesh(obj: bpy.types.Object) -> None:
    if obj.type != "MESH":
        return
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def apply_bevel(obj: bpy.types.Object, width: float, segments: int = 3) -> None:
    if width <= 0.0:
        return
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new(name="AUTH_ControlledBevel", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def mark_asset(obj: bpy.types.Object, role: str, form_level: str) -> bpy.types.Object:
    obj["kyx_original_geometry"] = True
    obj["kyx_asset_role"] = role
    obj["kyx_form_level"] = form_level
    return obj


def add_rounded_box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.025,
    bevel_segments: int = 3,
    role: str = "character_detail",
    form_level: str = "secondary",
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    # Bake authored orientation into geometry before bone parenting. Blender's
    # bone-parent evaluation otherwise normalizes some rigid child rotations.
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    move_to_collection(obj, collection)
    assign_material(obj, material)
    apply_bevel(obj, bevel, bevel_segments)
    return mark_asset(obj, role, form_level)


def add_box_between(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    width: float,
    height: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    bevel: float = 0.02,
    role: str = "character_detail",
    form_level: str = "secondary",
) -> bpy.types.Object:
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    obj = add_rounded_box(
        name,
        tuple((a + b) * 0.5),
        (width, direction.length, height),
        material,
        collection,
        bevel=bevel,
        role=role,
        form_level=form_level,
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Y", "Z")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    obj.select_set(False)
    return obj


def add_uv_ellipsoid(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    segments: int = 32,
    rings: int = 16,
    role: str = "character_soft_form",
    form_level: str = "primary",
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    move_to_collection(obj, collection)
    assign_material(obj, material)
    smooth_mesh(obj)
    return mark_asset(obj, role, form_level)


def _basis_for_axis(axis: Vector) -> tuple[Vector, Vector, Vector]:
    up = axis.normalized()
    reference = Vector((0.0, 0.0, 1.0))
    if abs(up.dot(reference)) > 0.92:
        reference = Vector((1.0, 0.0, 0.0))
    side = up.cross(reference).normalized()
    forward = side.cross(up).normalized()
    return side, forward, up


def add_tapered_capsule(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius_start: float,
    radius_end: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    sides: int = 24,
    role: str = "character_soft_form",
    form_level: str = "primary",
) -> bpy.types.Object:
    a = Vector(start)
    b = Vector(end)
    axis = b - a
    if axis.length < 1e-5:
        raise ValueError(f"Capsule {name} endpoints are coincident")
    side, forward, up = _basis_for_axis(axis)
    profiles = (
        (0.04, radius_start * 0.55),
        (0.12, radius_start),
        (0.34, radius_start * 0.96 + radius_end * 0.04),
        (0.66, radius_start * 0.35 + radius_end * 0.65),
        (0.88, radius_end),
        (0.96, radius_end * 0.55),
    )
    vertices: list[tuple[float, float, float]] = [tuple(a)]
    for t, radius in profiles:
        center = a + up * (axis.length * t)
        for index in range(sides):
            angle = math.tau * index / sides
            point = center + side * (math.cos(angle) * radius) + forward * (math.sin(angle) * radius)
            vertices.append(tuple(point))
    vertices.append(tuple(b))
    end_index = len(vertices) - 1
    faces: list[tuple[int, ...]] = []
    for index in range(sides):
        faces.append((0, 1 + index, 1 + (index + 1) % sides))
    for ring in range(len(profiles) - 1):
        current = 1 + ring * sides
        following = current + sides
        for index in range(sides):
            next_index = (index + 1) % sides
            faces.append((current + index, following + index, following + next_index, current + next_index))
    last_ring = 1 + (len(profiles) - 1) * sides
    for index in range(sides):
        faces.append((last_ring + index, end_index, last_ring + (index + 1) % sides))
    mesh = bpy.data.meshes.new(f"MESHDATA_{name}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    assign_material(obj, material)
    smooth_mesh(obj)
    return mark_asset(obj, role, form_level)


def add_ring_form(
    name: str,
    rings: tuple[tuple[float, float, float, float], ...],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    sides: int = 32,
    role: str = "character_soft_form",
    form_level: str = "primary",
) -> bpy.types.Object:
    """Build a smooth, contoured body from z/x-radius/y-radius/y-offset rings."""
    vertices: list[tuple[float, float, float]] = []
    for z, radius_x, radius_y, y_offset in rings:
        for index in range(sides):
            angle = math.tau * index / sides
            vertices.append((radius_x * math.cos(angle), y_offset + radius_y * math.sin(angle), z))
    faces: list[tuple[int, ...]] = []
    for ring in range(len(rings) - 1):
        current = ring * sides
        following = (ring + 1) * sides
        for index in range(sides):
            next_index = (index + 1) % sides
            faces.append((current + index, current + next_index, following + next_index, following + index))
    faces.append(tuple(reversed(tuple(range(sides)))))
    last = (len(rings) - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    mesh = bpy.data.meshes.new(f"MESHDATA_{name}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    assign_material(obj, material)
    smooth_mesh(obj)
    return mark_asset(obj, role, form_level)


def add_curved_plate(
    name: str,
    location: tuple[float, float, float],
    top_width: float,
    bottom_width: float,
    height: float,
    depth: float,
    bow: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    bevel: float = 0.018,
    role: str = "fitted_armor_plate",
    form_level: str = "secondary",
) -> bpy.types.Object:
    """Build a tapered, laterally bowed plate instead of a rounded cube."""
    center = Vector(location)
    row_specs = (
        (-0.5, bottom_width),
        (-0.16, bottom_width * 0.92 + top_width * 0.08),
        (0.20, bottom_width * 0.42 + top_width * 0.58),
        (0.5, top_width),
    )
    columns = 7
    vertices: list[tuple[float, float, float]] = []
    # Front surface curves toward -Y at its center; the rear remains shallow.
    for back in (False, True):
        for row, width in row_specs:
            for column in range(columns):
                normalized_x = -1.0 + 2.0 * column / (columns - 1)
                x = normalized_x * width * 0.5
                if back:
                    y = depth * 0.5
                else:
                    y = -depth * 0.5 - bow * (1.0 - normalized_x * normalized_x)
                z = row * height
                vertices.append(tuple(center + Vector((x, y, z))))
    ring_count = len(row_specs) * columns
    faces: list[tuple[int, ...]] = []
    for surface in (0, 1):
        offset = surface * ring_count
        for row in range(len(row_specs) - 1):
            for column in range(columns - 1):
                a = offset + row * columns + column
                face = (a, a + 1, a + 1 + columns, a + columns)
                faces.append(tuple(reversed(face)) if surface else face)
    # Close the four perimeter strips.
    for row in range(len(row_specs) - 1):
        front_a = row * columns
        back_a = ring_count + front_a
        faces.append((front_a, front_a + columns, back_a + columns, back_a))
        front_b = row * columns + columns - 1
        back_b = ring_count + front_b
        faces.append((front_b, back_b, back_b + columns, front_b + columns))
    for column in range(columns - 1):
        faces.append((column, ring_count + column, ring_count + column + 1, column + 1))
        top = (len(row_specs) - 1) * columns + column
        faces.append((top, top + 1, ring_count + top + 1, ring_count + top))
    mesh = bpy.data.meshes.new(f"MESHDATA_{name}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    assign_material(obj, material)
    apply_bevel(obj, bevel, 3)
    smooth_mesh(obj)
    return mark_asset(obj, role, form_level)


def add_cylinder_between(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius_start: float,
    radius_end: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    vertices: int = 24,
    bevel: float = 0.0,
    role: str = "character_detail",
    form_level: str = "tertiary",
) -> bpy.types.Object:
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=radius_start,
        radius2=radius_end,
        depth=direction.length,
        location=tuple((a + b) * 0.5),
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    obj.select_set(False)
    move_to_collection(obj, collection)
    assign_material(obj, material)
    smooth_mesh(obj)
    apply_bevel(obj, bevel, 2)
    return mark_asset(obj, role, form_level)


def parent_to_bone(obj: bpy.types.Object, armature: bpy.types.Object, bone_name: str) -> None:
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
    armature_data = bpy.data.armatures.new("RIGDATA_KYX_RefinementV2")
    armature = bpy.data.objects.new("RIG_KYX_RefinementV2", armature_data)
    export_collection.objects.link(armature)
    armature.show_in_front = True
    armature["kyx_asset_role"] = "visual_refinement_rig"
    armature["kyx_deformation_status"] = "rigid_parented_visual_proof_only"
    armature["kyx_root_motion_policy"] = "in_place"

    joints = {
        "hip.L": (0.18, 0.0, 1.00),
        "knee.L": (0.22, -0.015, 0.57),
        "ankle.L": (0.21, 0.015, 0.17),
        "toe.L": (0.21, -0.27, 0.09),
        "hip.R": (-0.18, 0.0, 1.00),
        "knee.R": (-0.22, 0.015, 0.57),
        "ankle.R": (-0.21, -0.005, 0.17),
        "toe.R": (-0.21, -0.27, 0.09),
        "shoulder.L": (0.31, 0.0, 1.56),
        "elbow.L": (0.48, -0.23, 1.32),
        "wrist.L": (0.11, -0.79, 1.43),
        "palm.L": (0.02, -0.93, 1.44),
        "shoulder.R": (-0.31, 0.0, 1.56),
        "elbow.R": (-0.48, -0.13, 1.33),
        "wrist.R": (-0.18, -0.47, 1.31),
        "palm.R": (-0.12, -0.55, 1.29),
    }

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

    bone("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.20), deform=False)
    bone("pelvis", (0.0, 0.0, 0.92), (0.0, 0.0, 1.12), "root")
    bone("spine", (0.0, 0.0, 1.12), (0.0, 0.0, 1.36), "pelvis")
    bone("chest", (0.0, 0.0, 1.36), (0.0, 0.0, 1.61), "spine")
    bone("neck", (0.0, 0.0, 1.61), (0.0, 0.0, 1.72), "chest")
    bone("head", (0.0, 0.0, 1.72), (0.0, 0.0, 1.98), "neck")

    for side in ("L", "R"):
        bone(f"upper_arm.{side}", joints[f"shoulder.{side}"], joints[f"elbow.{side}"], "chest")
        bone(f"forearm.{side}", joints[f"elbow.{side}"], joints[f"wrist.{side}"], f"upper_arm.{side}")
        bone(f"hand.{side}", joints[f"wrist.{side}"], joints[f"palm.{side}"], f"forearm.{side}")
        bone(f"thigh.{side}", joints[f"hip.{side}"], joints[f"knee.{side}"], "pelvis")
        bone(f"shin.{side}", joints[f"knee.{side}"], joints[f"ankle.{side}"], f"thigh.{side}")
        bone(f"foot.{side}", joints[f"ankle.{side}"], joints[f"toe.{side}"], f"shin.{side}")
    bone("weapon", joints["palm.R"], (-0.02, -0.77, 1.44), "hand.R", deform=False)
    bone("socket_muzzle", (0.075, -1.63, 1.475), (0.08, -1.75, 1.475), "weapon", deform=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)
    armature["kyx_joint_positions"] = json.dumps(joints, sort_keys=True)
    return armature


def build_body_and_gear(
    export_collection: bpy.types.Collection,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = []

    def attach(obj: bpy.types.Object, bone_name: str) -> bpy.types.Object:
        parent_to_bone(obj, armature, bone_name)
        parts.append(obj)
        return obj

    # Primary anatomy: an intentionally human, tapered silhouette under gear.
    attach(
        add_ring_form(
            "CHR_UndersuitTorso",
            (
                (0.96, 0.235, 0.155, 0.012),
                (1.06, 0.260, 0.170, 0.006),
                (1.19, 0.225, 0.145, -0.003),
                (1.37, 0.300, 0.185, -0.006),
                (1.54, 0.365, 0.205, -0.002),
                (1.62, 0.310, 0.180, 0.000),
            ),
            materials["undersuit"],
            export_collection,
        ),
        "chest",
    )
    attach(
        add_ring_form(
            "CHR_UndersuitPelvis",
            (
                (0.84, 0.205, 0.145, 0.015),
                (0.92, 0.245, 0.175, 0.010),
                (1.02, 0.255, 0.170, 0.010),
                (1.10, 0.230, 0.155, 0.000),
            ),
            materials["undersuit_light"],
            export_collection,
        ),
        "pelvis",
    )
    attach(add_tapered_capsule("CHR_NeckSoft", (0.0, 0.0, 1.60), (0.0, 0.0, 1.75), 0.105, 0.095, materials["undersuit"], export_collection), "neck")

    joints = {
        "upper_arm.L": ((0.31, 0.0, 1.56), (0.48, -0.23, 1.32), 0.125, 0.100),
        "forearm.L": ((0.48, -0.23, 1.32), (0.11, -0.79, 1.43), 0.105, 0.072),
        "upper_arm.R": ((-0.31, 0.0, 1.56), (-0.48, -0.13, 1.33), 0.125, 0.100),
        "forearm.R": ((-0.48, -0.13, 1.33), (-0.18, -0.47, 1.31), 0.105, 0.072),
        "thigh.L": ((0.18, 0.0, 1.00), (0.22, -0.015, 0.57), 0.165, 0.128),
        "shin.L": ((0.22, -0.015, 0.57), (0.21, 0.015, 0.17), 0.125, 0.092),
        "thigh.R": ((-0.18, 0.0, 1.00), (-0.22, 0.015, 0.57), 0.165, 0.128),
        "shin.R": ((-0.22, 0.015, 0.57), (-0.21, -0.005, 0.17), 0.125, 0.092),
    }
    for bone_name, (start, end, radius_start, radius_end) in joints.items():
        attach(
            add_tapered_capsule(
                f"CHR_{bone_name.replace('.', '_')}_Soft",
                start,
                end,
                radius_start,
                radius_end,
                materials["undersuit"],
                export_collection,
            ),
            bone_name,
        )

    # Head/helmet stack: soft hood, curved shell, face mask, visor, rails and vents.
    attach(add_uv_ellipsoid("CHR_HeadHood", (0.0, 0.005, 1.835), (0.145, 0.135, 0.185), materials["undersuit"], export_collection), "head")
    attach(add_uv_ellipsoid("CHR_HelmetCrown", (0.0, 0.018, 1.872), (0.175, 0.158, 0.172), materials["armor_light"], export_collection), "head")
    attach(add_rounded_box("CHR_FaceMask", (0.0, -0.145, 1.790), (0.245, 0.095, 0.155), materials["armor"], export_collection, rotation=(math.radians(-7), 0.0, 0.0), bevel=0.045), "head")
    attach(add_rounded_box("CHR_Visor", (0.0, -0.190, 1.875), (0.268, 0.035, 0.065), materials["teal"], export_collection, rotation=(math.radians(-5), 0.0, 0.0), bevel=0.018, form_level="secondary"), "head")
    attach(add_rounded_box("CHR_ChinGuard", (0.0, -0.171, 1.724), (0.184, 0.080, 0.090), materials["graphite"], export_collection, rotation=(math.radians(-8), 0.0, 0.0), bevel=0.025, form_level="secondary"), "head")
    for side, sign in (("L", 1.0), ("R", -1.0)):
        attach(add_cylinder_between(f"CHR_HelmetEar_{side}", (0.158 * sign, -0.005, 1.825), (0.184 * sign, -0.005, 1.825), 0.060, 0.060, materials["graphite"], export_collection, vertices=24, bevel=0.006, form_level="secondary"), "head")
        attach(add_rounded_box(f"CHR_HelmetRail_{side}", (0.154 * sign, -0.075, 1.905), (0.035, 0.145, 0.035), materials["oxide"], export_collection, rotation=(math.radians(12), 0.0, 0.0), bevel=0.010, form_level="tertiary"), "head")
    for index, x in enumerate((-0.065, 0.0, 0.065)):
        attach(add_rounded_box(f"CHR_HelmetVent_{index}", (x, 0.154, 1.905), (0.035, 0.018, 0.085), materials["graphite"], export_collection, bevel=0.007, form_level="tertiary"), "head")

    # Fitted torso armor layered over visible soft goods.
    attach(add_curved_plate("CHR_ChestPlate_Main", (0.0, -0.180, 1.430), 0.600, 0.430, 0.405, 0.072, 0.040, materials["armor"], export_collection, bevel=0.020), "chest")
    attach(add_rounded_box("CHR_ChestPlate_OxideInset", (0.0, -0.257, 1.465), (0.300, 0.025, 0.120), materials["oxide"], export_collection, rotation=(math.radians(-4), 0.0, 0.0), bevel=0.025, form_level="secondary"), "chest")
    attach(add_curved_plate("CHR_ChestPlate_Ab", (0.0, -0.150, 1.185), 0.405, 0.330, 0.180, 0.060, 0.026, materials["armor_light"], export_collection, bevel=0.015), "spine")
    attach(add_rounded_box("CHR_BackPlate", (0.0, 0.185, 1.405), (0.535, 0.075, 0.410), materials["graphite"], export_collection, rotation=(math.radians(3), 0.0, 0.0), bevel=0.055), "chest")
    attach(add_rounded_box("CHR_BackSpinePlate", (0.0, 0.230, 1.390), (0.150, 0.035, 0.465), materials["oxide_dark"], export_collection, bevel=0.025, form_level="secondary"), "chest")
    for side, sign in (("L", 1.0), ("R", -1.0)):
        attach(add_rounded_box(f"CHR_RibPlate_{side}", (0.286 * sign, -0.095, 1.355), (0.110, 0.165, 0.280), materials["armor"], export_collection, rotation=(0.0, math.radians(9 * sign), math.radians(3 * sign)), bevel=0.045, form_level="secondary"), "chest")
        attach(add_rounded_box(f"CHR_ShoulderShell_{side}", (0.345 * sign, -0.026, 1.575), (0.285, 0.225, 0.155), materials["armor_light" if side == "R" else "oxide"], export_collection, rotation=(math.radians(5), math.radians(10 * sign), math.radians(8 * sign)), bevel=0.065, bevel_segments=5, role="fitted_limb_armor", form_level="secondary"), f"upper_arm.{side}")
        attach(add_rounded_box(f"CHR_ShoulderTrim_{side}", (0.365 * sign, -0.155, 1.575), (0.195, 0.035, 0.055), materials["graphite"], export_collection, bevel=0.016, form_level="tertiary"), f"upper_arm.{side}")

    # Chest harness, belt, buckles and pouches establish tertiary function.
    strap_points = ((0.225, -0.252, 1.575), (0.120, -0.280, 1.425), (-0.030, -0.260, 1.270), (-0.160, -0.210, 1.080))
    for index in range(len(strap_points) - 1):
        attach(add_box_between(f"CHR_HarnessSegment_{index}", strap_points[index], strap_points[index + 1], 0.038, 0.010, materials["graphite"], export_collection, bevel=0.004, role="soft_harness", form_level="tertiary"), "chest")
    attach(add_rounded_box("CHR_HarnessBuckle", (0.02, -0.285, 1.305), (0.080, 0.030, 0.070), materials["brass"], export_collection, bevel=0.012, form_level="tertiary"), "chest")
    attach(add_rounded_box("CHR_DutyBelt", (0.0, -0.005, 1.005), (0.505, 0.310, 0.075), materials["graphite"], export_collection, bevel=0.025, form_level="secondary"), "pelvis")
    attach(add_rounded_box("CHR_BeltBuckle", (0.0, -0.175, 1.005), (0.105, 0.030, 0.090), materials["brass"], export_collection, bevel=0.016, form_level="tertiary"), "pelvis")
    for side, sign in (("L", 1.0), ("R", -1.0)):
        attach(add_rounded_box(f"CHR_HipPouch_{side}", (0.285 * sign, -0.030, 0.935), (0.125, 0.180, 0.180), materials["graphite"], export_collection, rotation=(0.0, math.radians(4 * sign), 0.0), bevel=0.032, form_level="tertiary"), "pelvis")

    # Limb armor follows the anatomy instead of replacing it with boxes.
    limb_armor = {
        "upper_arm.L": ((0.355, -0.070, 1.505), (0.430, -0.175, 1.395), 0.134, 0.108, "armor"),
        "upper_arm.R": ((-0.355, -0.040, 1.505), (-0.430, -0.105, 1.395), 0.134, 0.108, "armor"),
        "forearm.L": ((0.425, -0.305, 1.345), (0.165, -0.700, 1.415), 0.112, 0.082, "oxide"),
        "forearm.R": ((-0.425, -0.180, 1.325), (-0.215, -0.425, 1.315), 0.112, 0.082, "armor"),
    }
    for bone_name, (start, end, r0, r1, material_name) in limb_armor.items():
        attach(add_tapered_capsule(f"CHR_{bone_name.replace('.', '_')}_Armor", start, end, r0, r1, materials[material_name], export_collection, role="fitted_limb_armor", form_level="secondary"), bone_name)

    for side, sign in (("L", 1.0), ("R", -1.0)):
        thigh_bone = f"thigh.{side}"
        shin_bone = f"shin.{side}"
        attach(add_curved_plate(f"CHR_ThighPlate_{side}", (0.198 * sign, -0.112, 0.800), 0.205, 0.165, 0.300, 0.055, 0.018, materials["armor"], export_collection, bevel=0.014, role="fitted_limb_armor"), thigh_bone)
        attach(add_rounded_box(f"CHR_KneePad_{side}", (0.220 * sign, -0.105, 0.565), (0.190, 0.075, 0.145), materials["oxide" if side == "L" else "armor_light"], export_collection, bevel=0.045, bevel_segments=4, role="fitted_limb_armor", form_level="secondary"), shin_bone)
        attach(add_curved_plate(f"CHR_ShinPlate_{side}", (0.216 * sign, -0.082, 0.370), 0.170, 0.135, 0.270, 0.050, 0.014, materials["armor_light"], export_collection, bevel=0.012, role="fitted_limb_armor"), shin_bone)
        attach(add_rounded_box(f"CHR_BootUpper_{side}", (0.210 * sign, 0.000, 0.205), (0.205, 0.220, 0.250), materials["graphite"], export_collection, bevel=0.055, role="boot", form_level="secondary"), f"foot.{side}")
        attach(add_rounded_box(f"CHR_BootToe_{side}", (0.210 * sign, -0.145, 0.095), (0.235, 0.370, 0.170), materials["graphite"], export_collection, bevel=0.060, role="boot", form_level="secondary"), f"foot.{side}")
        attach(add_rounded_box(f"CHR_BootSole_{side}", (0.210 * sign, -0.145, 0.030), (0.250, 0.390, 0.055), materials["ink"], export_collection, bevel=0.020, role="boot", form_level="tertiary"), f"foot.{side}")
        # Suit seam bands remain visible around joints.
        attach(add_cylinder_between(f"CHR_ElbowSeam_{side}", (0.460 * sign, -0.205 if side == "L" else -0.115, 1.335), (0.480 * sign, -0.235 if side == "L" else -0.145, 1.315), 0.112, 0.112, materials["graphite"], export_collection, vertices=20, form_level="tertiary"), f"forearm.{side}")
        attach(add_cylinder_between(f"CHR_KneeSeam_{side}", (0.220 * sign, -0.010, 0.600), (0.220 * sign, -0.005, 0.545), 0.132, 0.127, materials["graphite"], export_collection, vertices=20, form_level="tertiary"), shin_bone)

    # Hand construction: palms plus individual fingers and thumbs wrapped onto controls.
    attach(add_tapered_capsule("CHR_HandBridge_R", (-0.180, -0.470, 1.310), (-0.120, -0.545, 1.290), 0.064, 0.058, materials["graphite"], export_collection, sides=20, role="glove", form_level="secondary"), "hand.R")
    attach(add_uv_ellipsoid("CHR_Palm_R", (-0.120, -0.545, 1.290), (0.074, 0.092, 0.060), materials["graphite"], export_collection, rotation=(math.radians(8), math.radians(-10), 0.0), role="glove", form_level="secondary"), "hand.R")
    for index, x in enumerate((-0.168, -0.143, -0.118, -0.093)):
        attach(add_tapered_capsule(f"CHR_Finger_R_{index}", (x, -0.575, 1.325 - index * 0.006), (x + 0.012, -0.610, 1.225 - index * 0.006), 0.020, 0.014, materials["undersuit_light"], export_collection, sides=16, role="glove_finger", form_level="tertiary"), "hand.R")
    attach(add_tapered_capsule("CHR_Thumb_R", (-0.055, -0.550, 1.325), (-0.125, -0.620, 1.285), 0.024, 0.016, materials["graphite"], export_collection, sides=16, role="glove_finger", form_level="tertiary"), "hand.R")

    attach(add_tapered_capsule("CHR_HandBridge_L", (0.110, -0.790, 1.430), (0.020, -0.930, 1.440), 0.064, 0.058, materials["graphite"], export_collection, sides=20, role="glove", form_level="secondary"), "hand.L")
    attach(add_uv_ellipsoid("CHR_Palm_L", (0.020, -0.930, 1.440), (0.082, 0.090, 0.060), materials["graphite"], export_collection, rotation=(math.radians(-5), math.radians(10), 0.0), role="glove", form_level="secondary"), "hand.L")
    for index, y in enumerate((-0.985, -0.955, -0.925, -0.895)):
        attach(add_tapered_capsule(f"CHR_Finger_L_{index}", (0.075, y, 1.468), (-0.020, y - 0.006, 1.385), 0.020, 0.014, materials["undersuit_light"], export_collection, sides=16, role="glove_finger", form_level="tertiary"), "hand.L")
    attach(add_tapered_capsule("CHR_Thumb_L", (-0.070, -0.875, 1.468), (0.018, -0.960, 1.430), 0.024, 0.016, materials["graphite"], export_collection, sides=16, role="glove_finger", form_level="tertiary"), "hand.L")

    # Small authored asymmetries make side identification possible without color.
    attach(add_rounded_box("CHR_LeftForearmDevice", (0.382, -0.430, 1.445), (0.100, 0.175, 0.060), materials["teal"], export_collection, rotation=(math.radians(13), math.radians(9), math.radians(-22)), bevel=0.020, form_level="tertiary"), "forearm.L")
    attach(add_cylinder_between("CHR_RightShoulderAntenna", (-0.390, 0.050, 1.655), (-0.430, 0.085, 1.805), 0.014, 0.009, materials["graphite"], export_collection, vertices=12, form_level="tertiary"), "upper_arm.R")
    return parts


def build_rifle(
    export_collection: bpy.types.Collection,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    pieces: list[bpy.types.Object] = []

    def weapon(obj: bpy.types.Object) -> bpy.types.Object:
        parent_to_bone(obj, armature, "weapon")
        obj["kyx_asset_role"] = "refinement_v2_rifle_part"
        pieces.append(obj)
        return obj

    # Axis is authored to place butt stock on the right shoulder, trigger under
    # the right index group and the left palm around the handguard.
    weapon(add_box_between("PROP_StockCore", (-0.245, -0.115, 1.535), (-0.135, -0.455, 1.475), 0.175, 0.165, materials["armor"], export_collection, bevel=0.040, role="weapon_primary", form_level="primary"))
    weapon(add_rounded_box("PROP_StockPad", (-0.245, -0.118, 1.535), (0.205, 0.060, 0.205), materials["graphite"], export_collection, rotation=(math.radians(-10), math.radians(-17), math.radians(-4)), bevel=0.035, role="weapon_secondary"))
    weapon(add_box_between("PROP_Receiver", (-0.145, -0.420, 1.475), (-0.015, -0.805, 1.455), 0.170, 0.175, materials["graphite"], export_collection, bevel=0.035, role="weapon_primary", form_level="primary"))
    weapon(add_box_between("PROP_Handguard", (-0.020, -0.760, 1.455), (0.045, -1.190, 1.475), 0.145, 0.135, materials["armor_light"], export_collection, bevel=0.032, role="weapon_primary", form_level="primary"))
    weapon(add_box_between("PROP_HandguardOxide", (0.005, -0.800, 1.505), (0.040, -1.095, 1.515), 0.090, 0.040, materials["oxide"], export_collection, bevel=0.012, role="weapon_detail", form_level="tertiary"))
    weapon(add_cylinder_between("PROP_Barrel", (0.045, -1.155, 1.475), (0.075, -1.625, 1.475), 0.031, 0.027, materials["ink"], export_collection, vertices=20, role="weapon_primary", form_level="secondary"))
    weapon(add_cylinder_between("PROP_MuzzleBrake", (0.072, -1.580, 1.475), (0.083, -1.710, 1.475), 0.055, 0.050, materials["oxide"], export_collection, vertices=20, bevel=0.005, role="weapon_secondary", form_level="secondary"))
    weapon(add_box_between("PROP_PistolGrip", (-0.095, -0.525, 1.430), (-0.135, -0.565, 1.205), 0.095, 0.095, materials["ink"], export_collection, bevel=0.025, role="weapon_secondary", form_level="secondary"))
    weapon(add_rounded_box("PROP_Magazine", (-0.015, -0.650, 1.245), (0.145, 0.200, 0.300), materials["oxide_dark"], export_collection, rotation=(math.radians(-8), math.radians(-4), math.radians(-3)), bevel=0.035, role="weapon_secondary", form_level="secondary"))
    weapon(add_rounded_box("PROP_OpticBase", (-0.070, -0.615, 1.580), (0.105, 0.245, 0.055), materials["ink"], export_collection, rotation=(0.0, math.radians(-2), math.radians(-18)), bevel=0.012, role="weapon_detail", form_level="tertiary"))
    weapon(add_rounded_box("PROP_Optic", (-0.060, -0.625, 1.655), (0.130, 0.165, 0.115), materials["graphite"], export_collection, rotation=(0.0, math.radians(-2), math.radians(-18)), bevel=0.030, role="weapon_secondary", form_level="secondary"))
    weapon(add_rounded_box("PROP_OpticLens", (-0.035, -0.710, 1.660), (0.080, 0.020, 0.070), materials["teal"], export_collection, rotation=(0.0, math.radians(-2), math.radians(-18)), bevel=0.015, role="weapon_detail", form_level="tertiary"))
    muzzle = bpy.data.objects.new("SOCKET_Muzzle", None)
    export_collection.objects.link(muzzle)
    muzzle.empty_display_type = "SINGLE_ARROW"
    muzzle.empty_display_size = 0.10
    muzzle.location = (0.083, -1.710, 1.475)
    parent_to_bone(muzzle, armature, "weapon")
    muzzle["kyx_socket"] = "muzzle"
    pieces.append(muzzle)
    return pieces


def build_animation(armature: bpy.types.Object) -> bpy.types.Action:
    armature.animation_data_create()
    action = bpy.data.actions.new("REFINEV2_CombatReady_Breathe")
    armature.animation_data.action = action
    action["kyx_semantic_state"] = "combat_ready_breathe_visual_proof"
    action["kyx_root_motion"] = "in_place"
    action["kyx_deformation_proof"] = False

    root = armature.pose.bones["root"]
    chest = armature.pose.bones["chest"]
    head = armature.pose.bones["head"]
    for bone in (root, chest, head):
        bone.rotation_mode = "XYZ"

    for frame, lift, chest_pitch, head_pitch in (
        (FRAME_START, 0.0, 0.0, 0.0),
        (FRAME_BREATHE, 0.004, math.radians(0.55), math.radians(-0.20)),
        (FRAME_END, 0.0, 0.0, 0.0),
    ):
        bpy.context.scene.frame_set(frame)
        root.location = (0.0, 0.0, lift)
        chest.rotation_euler = (chest_pitch, 0.0, 0.0)
        head.rotation_euler = (head_pitch, 0.0, 0.0)
        root.keyframe_insert(data_path="location")
        chest.keyframe_insert(data_path="rotation_euler")
        head.keyframe_insert(data_path="rotation_euler")

    bpy.context.scene.timeline_markers.new("contact_locked", frame=FRAME_START)
    bpy.context.scene.timeline_markers.new("breath_apex", frame=FRAME_BREATHE)
    bpy.context.scene.timeline_markers.new("loop", frame=FRAME_END)
    return action


def build_presentation(
    presentation_collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Camera:
    add_rounded_box("PRES_Floor", (0.0, 0.0, -0.055), (7.0, 7.0, 0.10), materials["floor"], presentation_collection, bevel=0.0, role="presentation", form_level="presentation")
    add_rounded_box("PRES_Backdrop", (0.0, 1.70, 1.70), (6.2, 0.10, 3.6), materials["backdrop"], presentation_collection, bevel=0.0, role="presentation", form_level="presentation")
    add_rounded_box("PRES_OxideSlash", (-1.70, 1.61, 1.55), (0.080, 0.030, 2.65), materials["oxide_dark"], presentation_collection, rotation=(0.0, math.radians(-22), 0.0), bevel=0.0, role="presentation", form_level="presentation")
    add_rounded_box("PRES_TealSlash", (1.65, 1.60, 1.15), (0.050, 0.030, 1.65), materials["teal"], presentation_collection, rotation=(0.0, math.radians(27), 0.0), bevel=0.0, role="presentation", form_level="presentation")

    camera_data = bpy.data.cameras.new("CAMDATA_RefinementV2")
    camera = bpy.data.objects.new("CAM_RefinementV2", camera_data)
    presentation_collection.objects.link(camera)
    camera_data.lens = 62.0
    camera_data.sensor_width = 36.0
    bpy.context.scene.camera = camera

    def light(
        name: str,
        kind: str,
        location: tuple[float, float, float],
        energy: float,
        color: tuple[float, float, float],
        size: float,
    ) -> None:
        data = bpy.data.lights.new(name=f"{name}_DATA", type=kind)
        data.energy = energy
        data.color = color
        if kind == "AREA":
            data.shape = "DISK"
            data.size = size
        obj = bpy.data.objects.new(name, data)
        presentation_collection.objects.link(obj)
        obj.location = location
        look_at(obj, (0.0, -0.35, 1.15))

    light("LIGHT_Key", "AREA", (-3.7, -4.5, 5.5), 1150.0, (0.82, 0.91, 1.0), 3.8)
    light("LIGHT_Fill", "AREA", (4.0, -2.0, 3.0), 720.0, (0.45, 0.95, 0.90), 3.0)
    light("LIGHT_Rim", "AREA", (0.8, 3.2, 4.2), 1250.0, (1.0, 0.25, 0.08), 2.1)
    light("LIGHT_Front", "AREA", (0.0, -4.0, 1.4), 380.0, (1.0, 0.80, 0.62), 2.5)
    light("LIGHT_BackRead", "AREA", (0.0, 4.3, 2.6), 540.0, (0.68, 0.86, 1.0), 2.8)
    return camera


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.name = "SCENE_KYX_Phase7_CharacterRefinementV2"
    scene.frame_start = FRAME_START
    scene.frame_end = FRAME_END
    scene.render.fps = FPS
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RENDER_SIZE
    scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.image_settings.color_depth = "8"
    scene.world.use_nodes = True
    scene.world.color = BACKDROP[:3]
    background = scene.world.node_tree.nodes.get("Background")
    if background is not None:
        background.inputs["Color"].default_value = BACKDROP
        background.inputs["Strength"].default_value = 0.30
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene["kyx_scope"] = "phase7_character_visual_refinement_v2"
    scene["kyx_visual_review_source"] = "product_owner_blocky_shape_like_rejection"
    scene["kyx_g6_status"] = "not_claimed"
    scene["kyx_units"] = "meters"
    scene["kyx_forward_axis"] = "-Y"
    scene["kyx_up_axis"] = "+Z"


def set_camera(
    camera: bpy.types.Object,
    *,
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    lens: float = 62.0,
    ortho_scale: float | None = None,
) -> None:
    camera.location = location
    if ortho_scale is None:
        camera.data.type = "PERSP"
        camera.data.lens = lens
    else:
        camera.data.type = "ORTHO"
        camera.data.ortho_scale = ortho_scale
    look_at(camera, target)


def set_grayscale(materials: dict[str, bpy.types.Material], enabled: bool) -> None:
    for material in materials.values():
        if not material.use_nodes:
            continue
        principled = material.node_tree.nodes.get("Principled BSDF")
        if principled is None:
            continue
        original = tuple(material.get("kyx_original_color", material.diffuse_color))
        if enabled:
            linear_gray = original[0] * 0.2126 + original[1] * 0.7152 + original[2] * 0.0722
            color = (linear_gray, linear_gray, linear_gray, original[3])
        else:
            color = original
        material.diffuse_color = color
        principled.inputs["Base Color"].default_value = color
        emission = principled.inputs.get("Emission Color") or principled.inputs.get("Emission")
        if emission is not None and material.name == "MAT_TealOptic":
            emission.default_value = color


def render_stills(
    camera: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[dict[str, float], list[str]]:
    scene = bpy.context.scene
    scene.frame_set(FRAME_BREATHE)
    views = (
        ("close-color", (2.35, -4.05, 2.15), (0.0, -0.42, 1.34), 66.0, None, False),
        ("tactical-mid-color", (3.70, -6.25, 2.65), (0.0, -0.34, 1.05), 62.0, None, False),
        ("far-color", (5.20, -9.25, 3.20), (0.0, -0.30, 1.04), 62.0, None, False),
        ("front-ortho-color", (0.0, -6.0, 1.05), (0.0, -0.34, 1.05), 62.0, 2.45, False),
        ("side-ortho-color", (5.0, -0.35, 1.08), (0.0, -0.35, 1.08), 62.0, 2.45, False),
        ("back-ortho-color", (0.0, 1.28, 1.05), (0.0, -0.10, 1.05), 62.0, 2.45, False),
        ("weapon-contact-color", (-1.50, -2.70, 1.65), (-0.06, -0.61, 1.39), 82.0, None, False),
        ("close-grayscale", (2.35, -4.05, 2.15), (0.0, -0.42, 1.34), 66.0, None, True),
        ("front-ortho-grayscale", (0.0, -6.0, 1.05), (0.0, -0.34, 1.05), 62.0, 2.45, True),
    )
    timings: dict[str, float] = {}
    paths: list[str] = []
    grayscale_state = False
    for name, location, target, lens, ortho_scale, grayscale in views:
        if grayscale != grayscale_state:
            set_grayscale(materials, grayscale)
            grayscale_state = grayscale
        set_camera(camera, location=location, target=target, lens=lens, ortho_scale=ortho_scale)
        path = RENDER_DIR / f"refinement-v2-{name}.png"
        scene.render.filepath = str(path)
        started = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        timings[name] = round(time.perf_counter() - started, 6)
        paths.append(path.relative_to(LANE_DIR).as_posix())
    if grayscale_state:
        set_grayscale(materials, False)
    return timings, paths


def select_export_objects(export_collection: bpy.types.Collection) -> list[bpy.types.Object]:
    bpy.ops.object.select_all(action="DESELECT")
    objects = list(export_collection.all_objects)
    for obj in objects:
        obj.hide_render = False
        obj.hide_set(False)
        obj.select_set(True)
    armatures = [obj for obj in objects if obj.type == "ARMATURE"]
    if armatures:
        bpy.context.view_layer.objects.active = armatures[0]
    elif objects:
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
        export_copyright="KYX project-original scripted refinement v2; no third-party art",
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
    animations = document.get("animations", [])
    return {
        "version": version,
        "declaredBytes": declared_length,
        "generator": document.get("asset", {}).get("generator"),
        "nodes": len(document.get("nodes", [])),
        "meshes": len(document.get("meshes", [])),
        "materials": len(document.get("materials", [])),
        "skins": len(document.get("skins", [])),
        "animations": len(animations),
        "animationNames": [animation.get("name") for animation in animations],
        "animationChannels": sum(len(animation.get("channels", [])) for animation in animations),
        "requiredExtensions": document.get("extensionsRequired", []),
    }


def output_manifest(paths: list[Path]) -> list[dict[str, object]]:
    return [
        {
            "path": path.relative_to(LANE_DIR).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256(path),
        }
        for path in paths
    ]


def main() -> None:
    started = time.perf_counter()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    reset_scene()
    configure_scene()
    export_collection = make_collection("COLL_RefinementV2_EXPORT")
    presentation_collection = make_collection("COLL_RefinementV2_PRESENTATION")

    materials = {
        "ink": make_material("MAT_Ink", INK, roughness=0.62),
        "graphite": make_material("MAT_Graphite", GRAPHITE, metallic=0.12, roughness=0.52),
        "undersuit": make_material("MAT_Undersuit", UNDERSUIT, roughness=0.90),
        "undersuit_light": make_material("MAT_UndersuitLight", UNDERSUIT_LIGHT, roughness=0.84),
        "armor": make_material("MAT_Armor", ARMOR, metallic=0.10, roughness=0.58),
        "armor_light": make_material("MAT_ArmorLight", ARMOR_LIGHT, metallic=0.08, roughness=0.52),
        "oxide": make_material("MAT_Oxide", OXIDE, metallic=0.04, roughness=0.63),
        "oxide_dark": make_material("MAT_OxideDark", OXIDE_DARK, roughness=0.70),
        "teal": make_material("MAT_TealOptic", TEAL, metallic=0.18, roughness=0.30, emission_strength=1.4),
        "brass": make_material("MAT_Brass", BRASS, metallic=0.68, roughness=0.38),
        "floor": make_material("MAT_StudioFloor", FLOOR, metallic=0.08, roughness=0.64),
        "backdrop": make_material("MAT_StudioBackdrop", BACKDROP, roughness=0.82),
    }

    armature = build_rig(export_collection)
    body_parts = build_body_and_gear(export_collection, armature, materials)
    weapon_parts = build_rifle(export_collection, armature, materials)
    action = build_animation(armature)
    camera = build_presentation(presentation_collection, materials)

    export_seconds = export_glb(export_collection)
    render_timings, render_paths = render_stills(camera, materials)
    bpy.context.scene.frame_set(FRAME_START)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    # Blender's user preference may emit an overwrite backup. It is not part of
    # the authored lane or manifest, so keep repeated headless builds tidy.
    blend_backup = Path(f"{BLEND_PATH}1")
    if blend_backup.exists():
        blend_backup.unlink()

    meshes = [obj for obj in export_collection.all_objects if obj.type == "MESH"]
    source_vertices = sum(len(obj.data.vertices) for obj in meshes)
    source_polygons = sum(len(obj.data.polygons) for obj in meshes)
    source_triangles = sum(len(polygon.vertices) - 2 for obj in meshes for polygon in obj.data.polygons)
    glb_info = inspect_glb(GLB_PATH)
    render_files = [LANE_DIR / relative for relative in render_paths]
    manifest = output_manifest([GLB_PATH, *render_files])
    report = {
        "schemaVersion": 1,
        "assetId": "kyx_phase7_character_refinement_v2",
        "status": "VISUAL_REFINEMENT_CANDIDATE_NOT_G6",
        "sourceReview": "phase7-benchmark/VISUAL_REVIEW.md NOT APPROVED blocky/shape-like",
        "blenderVersion": bpy.app.version_string,
        "blenderBuildHash": bpy.app.build_hash.decode("utf-8") if isinstance(bpy.app.build_hash, bytes) else str(bpy.app.build_hash),
        "visualIntent": {
            "silhouette": "human tactical figure with anatomical taper and asymmetrical readable gear",
            "layers": ["undersuit", "fitted armor", "harness and belt", "gloves", "boots", "helmet", "rifle"],
            "formHierarchy": ["primary anatomy and weapon axis", "secondary armor shells", "tertiary straps seams fingers vents and controls"],
            "contact": ["butt stock at right shoulder", "right fingers around pistol grip", "left fingers around handguard"],
            "palette": ["graphite", "desaturated armor", "oxide faction cue", "teal optic", "brass hardware"],
        },
        "scene": {
            "forwardAxis": "-Y",
            "upAxis": "+Z",
            "units": "meters",
            "frames": [FRAME_START, FRAME_END],
            "fps": FPS,
            "renderSize": [RENDER_SIZE, RENDER_SIZE],
        },
        "source": {
            "exportObjects": len(export_collection.all_objects),
            "meshObjects": len(meshes),
            "vertices": source_vertices,
            "polygons": source_polygons,
            "triangles": source_triangles,
            "materials": len({slot.material.name for obj in meshes for slot in obj.material_slots if slot.material}),
            "bones": len(armature.data.bones),
            "actions": [action.name],
            "bodyParts": len(body_parts),
            "weaponParts": len(weapon_parts),
        },
        "glb": {
            **glb_info,
            "path": GLB_PATH.relative_to(LANE_DIR).as_posix(),
            "bytes": GLB_PATH.stat().st_size,
            "sha256": sha256(GLB_PATH),
            "exportSeconds": round(export_seconds, 6),
        },
        "renders": {
            "paths": render_paths,
            "timingsSeconds": render_timings,
            "totalSeconds": round(sum(render_timings.values()), 6),
        },
        "manifest": manifest,
        "limitations": [
            "Rigid bone parenting is an animation/export proof, not deformation-capable skin or weight-stress evidence.",
            "Only a subtle combat-ready breathe loop exists; gameplay clip and first-person arm matrices remain absent.",
            "No LODs, KTX2, meshopt, runtime outline/contact integration, or 2/4/8-character performance capture exists.",
            "No Khronos glTF Validator, color-vision simulation, wireframe/topology capture, or human G6 approval is claimed.",
        ],
        "elapsedSeconds": round(time.perf_counter() - started, 6),
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "glbSha256": report["glb"]["sha256"],
        "glbBytes": report["glb"]["bytes"],
        "meshObjects": report["source"]["meshObjects"],
        "sourceTriangles": report["source"]["triangles"],
        "renders": len(render_paths),
        "elapsedSeconds": report["elapsedSeconds"],
    }, indent=2))


if __name__ == "__main__":
    main()
