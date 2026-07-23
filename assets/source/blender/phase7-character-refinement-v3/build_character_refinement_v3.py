"""Build the isolated KYX Phase 7 character refinement v3 candidate.

This original scripted asset is a direct response to the product-owner finding
that the preceding player models read as blocky, shape-like, and toy-like.  It
uses a single connected Skin/Subdivision undersuit body, adult proportions,
restrained conforming armor, modeled garment seams/folds, articulated glove
fingers, and a slimmer shoulder-fired rifle.  The output is a visual-direction
candidate only: it is not runtime-integrated, deformation proof, or G6 approval.

Run with Blender 5.1.x from the repository root:

    blender --background --factory-startup --threads 1 --python \
      assets/source/blender/phase7-character-refinement-v3/build_character_refinement_v3.py
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import struct
import time

import bpy
from mathutils import Vector


SCRIPT_PATH = Path(__file__).resolve()
LANE_DIR = SCRIPT_PATH.parent
OUTPUT_DIR = LANE_DIR / "output"
RENDER_DIR = OUTPUT_DIR / "renders"
BLEND_PATH = OUTPUT_DIR / "kyx_phase7_character_refinement_v3.blend"
GLB_PATH = OUTPUT_DIR / "kyx_phase7_character_refinement_v3.glb"
REPORT_PATH = OUTPUT_DIR / "character-refinement-v3-report.json"

FRAME_START = 1
FRAME_BREATHE = 16
FRAME_END = 32
FPS = 24
RENDER_SIZE = 960

# Restrained, grayscale-readable tactical palette.  No near-white primary armor.
INK = (0.009, 0.013, 0.016, 1.0)
SUIT = (0.016, 0.023, 0.025, 1.0)
SUIT_RAISED = (0.037, 0.047, 0.047, 1.0)
WEBBING = (0.050, 0.054, 0.049, 1.0)
ARMOR = (0.078, 0.096, 0.091, 1.0)
ARMOR_EDGE = (0.135, 0.151, 0.137, 1.0)
OXIDE = (0.245, 0.045, 0.022, 1.0)
TEAL = (0.025, 0.330, 0.305, 1.0)
METAL = (0.065, 0.075, 0.076, 1.0)
BRASS = (0.330, 0.190, 0.065, 1.0)
FLOOR = (0.012, 0.017, 0.020, 1.0)
BACKDROP = (0.023, 0.031, 0.034, 1.0)


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
    micro_bump: float = 0.0,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    material["kyx_original_color"] = list(color)
    material["kyx_palette_role"] = name.removeprefix("MAT_").lower()
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    if principled is None:
        raise RuntimeError(f"Missing Principled BSDF for {name}")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    if micro_bump > 0.0:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.name = f"AUTH_{name}_MicroWeave"
        noise.inputs["Scale"].default_value = 115.0
        noise.inputs["Detail"].default_value = 2.0
        noise.inputs["Roughness"].default_value = 0.60
        bump = nodes.new("ShaderNodeBump")
        bump.name = f"AUTH_{name}_MicroBump"
        bump.inputs["Strength"].default_value = micro_bump
        bump.inputs["Distance"].default_value = 0.006
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], principled.inputs["Normal"])
    if emission_strength > 0.0:
        emission = principled.inputs.get("Emission Color") or principled.inputs.get("Emission")
        strength = principled.inputs.get("Emission Strength")
        if emission is not None:
            emission.default_value = color
        if strength is not None:
            strength.default_value = emission_strength
    return material


def assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    if obj.type not in {"MESH", "CURVE"}:
        return
    obj.data.materials.clear()
    obj.data.materials.append(material)


def smooth_mesh(obj: bpy.types.Object) -> None:
    if obj.type != "MESH":
        return
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def mark_asset(obj: bpy.types.Object, role: str, form_level: str) -> bpy.types.Object:
    obj["kyx_original_geometry"] = True
    obj["kyx_asset_role"] = role
    obj["kyx_form_level"] = form_level
    return obj


def apply_bevel(obj: bpy.types.Object, width: float, segments: int = 3) -> None:
    if obj.type != "MESH" or width <= 0.0:
        return
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    modifier = obj.modifiers.new("AUTH_ControlledBevel", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def parent_to_bone(obj: bpy.types.Object, armature: bpy.types.Object, bone_name: str) -> None:
    world_matrix = obj.matrix_world.copy()
    obj.parent = armature
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    obj.matrix_world = world_matrix
    obj["kyx_parent_bone"] = bone_name


def add_rounded_box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.012,
    role: str = "detail",
    form_level: str = "tertiary",
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    move_to_collection(obj, collection)
    assign_material(obj, material)
    apply_bevel(obj, bevel, 4)
    return mark_asset(obj, role, form_level)


def add_uv_ellipsoid(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    segments: int = 32,
    rings: int = 20,
    role: str = "soft_form",
    form_level: str = "secondary",
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


def _basis(axis: Vector) -> tuple[Vector, Vector, Vector]:
    longitudinal = axis.normalized()
    reference = Vector((0.0, 0.0, 1.0))
    if abs(longitudinal.dot(reference)) > 0.91:
        reference = Vector((1.0, 0.0, 0.0))
    side = longitudinal.cross(reference).normalized()
    depth = side.cross(longitudinal).normalized()
    return side, depth, longitudinal


def add_tapered_capsule(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius_start: float,
    radius_end: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    sides: int = 20,
    depth_ratio: float = 0.82,
    role: str = "soft_form",
    form_level: str = "secondary",
) -> bpy.types.Object:
    a, b = Vector(start), Vector(end)
    axis = b - a
    if axis.length < 1e-5:
        raise ValueError(f"Coincident endpoints for {name}")
    side, depth, longitudinal = _basis(axis)
    profiles = (
        (0.00, radius_start * 0.36),
        (0.06, radius_start * 0.76),
        (0.16, radius_start),
        (0.42, radius_start * 0.84 + radius_end * 0.16),
        (0.70, radius_start * 0.30 + radius_end * 0.70),
        (0.90, radius_end),
        (0.98, radius_end * 0.58),
        (1.00, radius_end * 0.32),
    )
    vertices: list[tuple[float, float, float]] = []
    for t, radius in profiles:
        center = a + longitudinal * (axis.length * t)
        for index in range(sides):
            angle = math.tau * index / sides
            point = center + side * (math.cos(angle) * radius) + depth * (math.sin(angle) * radius * depth_ratio)
            vertices.append(tuple(point))
    faces: list[tuple[int, ...]] = []
    for ring in range(len(profiles) - 1):
        current, following = ring * sides, (ring + 1) * sides
        for index in range(sides):
            next_index = (index + 1) % sides
            faces.append((current + index, current + next_index, following + next_index, following + index))
    faces.append(tuple(reversed(tuple(range(sides)))))
    last = (len(profiles) - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    mesh = bpy.data.meshes.new(f"MESHDATA_{name}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    assign_material(obj, material)
    smooth_mesh(obj)
    return mark_asset(obj, role, form_level)


def add_profiled_limb_surface(
    name: str,
    sections: tuple[tuple[float, float, float, float, float], ...],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    sides: int = 24,
    role: str = "anatomical_garment_form",
    form_level: str = "secondary",
) -> bpy.types.Object:
    """Create a bent, continuously tapered anatomical sleeve or trouser form.

    Each section is ``(x, y, z, lateral_radius, depth_radius)``.  The authored
    radii deliberately describe muscle bellies, bony joint pinches, and cloth
    taper instead of interpolating one capsule between two endpoints.
    """
    if len(sections) < 3:
        raise ValueError(f"At least three sections are required for {name}")
    centers = [Vector(item[:3]) for item in sections]
    vertices: list[tuple[float, float, float]] = []
    previous_side: Vector | None = None
    for index, (center, section) in enumerate(zip(centers, sections)):
        if index == 0:
            tangent = centers[1] - center
        elif index == len(centers) - 1:
            tangent = center - centers[index - 1]
        else:
            tangent = centers[index + 1] - centers[index - 1]
        side, depth, _ = _basis(tangent)
        if previous_side is not None and side.dot(previous_side) < 0.0:
            side.negate()
            depth.negate()
        previous_side = side.copy()
        lateral_radius, depth_radius = section[3], section[4]
        for ring_index in range(sides):
            angle = math.tau * ring_index / sides
            point = center + side * (math.cos(angle) * lateral_radius) + depth * (math.sin(angle) * depth_radius)
            vertices.append(tuple(point))
    faces: list[tuple[int, ...]] = []
    for section_index in range(len(sections) - 1):
        current = section_index * sides
        following = (section_index + 1) * sides
        for ring_index in range(sides):
            next_index = (ring_index + 1) % sides
            faces.append((current + ring_index, current + next_index, following + next_index, following + ring_index))
    faces.append(tuple(reversed(tuple(range(sides)))))
    last = (len(sections) - 1) * sides
    faces.append(tuple(last + index for index in range(sides)))
    mesh = bpy.data.meshes.new(f"MESHDATA_{name}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    assign_material(obj, material)
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
    vertices: int = 20,
    bevel: float = 0.0,
    role: str = "detail",
    form_level: str = "tertiary",
) -> bpy.types.Object:
    a, b = Vector(start), Vector(end)
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
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    move_to_collection(obj, collection)
    assign_material(obj, material)
    if bevel:
        apply_bevel(obj, bevel, 3)
    smooth_mesh(obj)
    return mark_asset(obj, role, form_level)


def add_curve_tube(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    cyclic: bool = False,
    role: str = "garment_seam",
) -> bpy.types.Object:
    curve_data = bpy.data.curves.new(f"CURVEDATA_{name}", "CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 2
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = 3
    curve_data.resolution_u = 2
    spline = curve_data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, value in zip(spline.bezier_points, points):
        point.co = value
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve_data)
    collection.objects.link(obj)
    assign_material(obj, material)
    return mark_asset(obj, role, "tertiary")


def add_box_between(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    width: float,
    height: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    bevel: float = 0.012,
    role: str = "detail",
    form_level: str = "secondary",
) -> bpy.types.Object:
    a, b = Vector(start), Vector(end)
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


def add_front_plate(
    name: str,
    center: tuple[float, float, float],
    rows: tuple[tuple[float, float], ...],
    depth: float,
    bow: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    columns: int = 9,
    bevel: float = 0.010,
    role: str = "conforming_armor",
) -> bpy.types.Object:
    """Create a tapered body-conforming plate from z-offset/width rows."""
    c = Vector(center)
    vertices: list[tuple[float, float, float]] = []
    for rear in (False, True):
        for z_offset, width in rows:
            for column in range(columns):
                u = -1.0 + 2.0 * column / (columns - 1)
                x = u * width * 0.5
                y = depth * 0.5 if rear else -depth * 0.5 - bow * (1.0 - u * u)
                vertices.append(tuple(c + Vector((x, y, z_offset))))
    surface_count = len(rows) * columns
    faces: list[tuple[int, ...]] = []
    for surface in (0, 1):
        offset = surface * surface_count
        for row in range(len(rows) - 1):
            for column in range(columns - 1):
                a = offset + row * columns + column
                face = (a, a + 1, a + 1 + columns, a + columns)
                faces.append(face if surface == 0 else tuple(reversed(face)))
    for row in range(len(rows) - 1):
        a = row * columns
        faces.append((a, a + columns, surface_count + a + columns, surface_count + a))
        b = row * columns + columns - 1
        faces.append((b, surface_count + b, surface_count + b + columns, b + columns))
    for column in range(columns - 1):
        faces.append((column, surface_count + column, surface_count + column + 1, column + 1))
        top = (len(rows) - 1) * columns + column
        faces.append((top, top + 1, surface_count + top + 1, surface_count + top))
    mesh = bpy.data.meshes.new(f"MESHDATA_{name}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    assign_material(obj, material)
    apply_bevel(obj, bevel, 3)
    smooth_mesh(obj)
    return mark_asset(obj, role, "secondary")


def add_boot_wedge(
    name: str,
    center: tuple[float, float, float],
    width: float,
    length: float,
    heel_height: float,
    toe_height: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    role: str = "boot",
) -> bpy.types.Object:
    cx, cy, cz = center
    x0, x1 = cx - width / 2, cx + width / 2
    y_back, y_front = cy + length / 2, cy - length / 2
    z0 = cz - heel_height / 2
    vertices = [
        (x0, y_back, z0), (x1, y_back, z0), (x1, y_front, z0), (x0, y_front, z0),
        (x0, y_back, z0 + heel_height), (x1, y_back, z0 + heel_height),
        (x1, y_front, z0 + toe_height), (x0, y_front, z0 + toe_height),
    ]
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    mesh = bpy.data.meshes.new(f"MESHDATA_{name}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    assign_material(obj, material)
    apply_bevel(obj, min(width, toe_height) * 0.14, 4)
    smooth_mesh(obj)
    return mark_asset(obj, role, "secondary")


def add_extruded_yz_profile(
    name: str,
    x_center: float,
    width: float,
    profile: tuple[tuple[float, float], ...],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    bevel: float = 0.008,
    role: str = "profiled_hard_surface",
    form_level: str = "secondary",
) -> bpy.types.Object:
    """Extrude an authored Y/Z silhouette across X for non-box hard surfaces."""
    vertices = [(x_center - width * 0.5, y, z) for y, z in profile]
    vertices += [(x_center + width * 0.5, y, z) for y, z in profile]
    count = len(profile)
    faces: list[tuple[int, ...]] = [tuple(reversed(tuple(range(count)))), tuple(count + index for index in range(count))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    mesh = bpy.data.meshes.new(f"MESHDATA_{name}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    assign_material(obj, material)
    apply_bevel(obj, bevel, 3)
    return mark_asset(obj, role, form_level)


def add_profiled_boot(
    name: str,
    x_center: float,
    y_shift: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    sole: bool = False,
) -> bpy.types.Object:
    """Build one rounded, tapered boot/sole from anatomical sections.

    Earlier candidates extruded four-corner section rings, so even a tapered
    outline still read as stacked blocks.  Sixteen-point oval rings give the
    upper a shaped heel cup, instep, toe box, and rolled sole edge.
    """
    if sole:
        sections = (
            (0.092, 0.061, 0.006, 0.034),
            (0.030, 0.066, 0.005, 0.035),
            (-0.070, 0.072, 0.005, 0.034),
            (-0.160, 0.075, 0.006, 0.032),
            (-0.230, 0.063, 0.008, 0.028),
            (-0.250, 0.046, 0.011, 0.025),
        )
    else:
        sections = (
            (0.082, 0.052, 0.026, 0.204),
            (0.040, 0.056, 0.027, 0.196),
            (-0.020, 0.060, 0.028, 0.168),
            (-0.082, 0.065, 0.029, 0.122),
            (-0.145, 0.069, 0.027, 0.088),
            (-0.210, 0.061, 0.026, 0.066),
            (-0.242, 0.046, 0.025, 0.053),
        )
    ring_points = 16
    vertices: list[tuple[float, float, float]] = []
    for y, half_width, z_bottom, z_top in sections:
        center_z = (z_bottom + z_top) * 0.5
        half_height = (z_top - z_bottom) * 0.5
        for ring_index in range(ring_points):
            angle = math.tau * ring_index / ring_points
            # The lateral exponent squares the shoulders of the cross-section
            # without returning to a hard rectangular profile.
            cosine = math.cos(angle)
            lateral = math.copysign(abs(cosine) ** 0.78, cosine)
            vertical = math.sin(angle)
            vertices.append((x_center + lateral * half_width, y + y_shift, center_z + vertical * half_height))
    faces: list[tuple[int, ...]] = []
    for index in range(len(sections) - 1):
        a, b = index * ring_points, (index + 1) * ring_points
        for ring_index in range(ring_points):
            following = (ring_index + 1) % ring_points
            faces.append((a + ring_index, a + following, b + following, b + ring_index))
    faces.extend([
        tuple(reversed(tuple(range(ring_points)))),
        tuple((len(sections) - 1) * ring_points + index for index in range(ring_points)),
    ])
    mesh = bpy.data.meshes.new(f"MESHDATA_{name}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    assign_material(obj, material)
    smooth_mesh(obj)
    return mark_asset(obj, "boot_sole" if sole else "profiled_boot_upper", "secondary")


def add_torus(
    name: str,
    location: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    role: str = "garment_interface",
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        align="WORLD",
        major_segments=32,
        minor_segments=10,
        location=location,
        major_radius=major_radius,
        minor_radius=minor_radius,
    )
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, collection)
    assign_material(obj, material)
    smooth_mesh(obj)
    return mark_asset(obj, role, "tertiary")


def build_rig(export_collection: bpy.types.Collection) -> bpy.types.Object:
    data = bpy.data.armatures.new("RIGDATA_KYX_RefinementV3")
    armature = bpy.data.objects.new("RIG_KYX_RefinementV3", data)
    export_collection.objects.link(armature)
    armature.show_in_front = True
    armature["kyx_asset_role"] = "visual_refinement_v3_rig"
    armature["kyx_deformation_status"] = "rigid_parented_candidate_only"
    armature["kyx_root_motion_policy"] = "in_place"

    joints = {
        "hip.L": (0.105, 0.010, 0.92), "knee.L": (0.132, -0.035, 0.51), "ankle.L": (0.155, -0.005, 0.115), "toe.L": (0.155, -0.205, 0.060),
        "hip.R": (-0.105, 0.010, 0.92), "knee.R": (-0.132, 0.025, 0.50), "ankle.R": (-0.155, 0.035, 0.115), "toe.R": (-0.155, -0.155, 0.060),
        "shoulder.L": (0.255, 0.0, 1.51), "elbow.L": (0.420, -0.220, 1.295), "wrist.L": (0.105, -0.755, 1.395), "palm.L": (0.025, -0.845, 1.405),
        "shoulder.R": (-0.255, 0.0, 1.51), "elbow.R": (-0.395, -0.190, 1.305), "wrist.R": (-0.135, -0.470, 1.345), "palm.R": (-0.090, -0.535, 1.345),
    }
    bpy.context.view_layer.objects.active = armature
    armature.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name: str, head: tuple[float, float, float], tail: tuple[float, float, float], parent: str | None = None, *, deform: bool = True) -> None:
        item = data.edit_bones.new(name)
        item.head = head
        item.tail = tail
        item.use_deform = deform
        if parent:
            item.parent = data.edit_bones[parent]

    bone("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.18), deform=False)
    bone("pelvis", (0.0, 0.0, 0.88), (0.0, 0.0, 1.06), "root")
    bone("spine", (0.0, 0.0, 1.06), (0.0, 0.0, 1.32), "pelvis")
    bone("chest", (0.0, 0.0, 1.32), (0.0, 0.0, 1.54), "spine")
    bone("neck", (0.0, 0.0, 1.54), (0.0, -0.006, 1.64), "chest")
    bone("head", (0.0, -0.006, 1.64), (0.0, -0.018, 1.86), "neck")
    for side in ("L", "R"):
        bone(f"upper_arm.{side}", joints[f"shoulder.{side}"], joints[f"elbow.{side}"], "chest")
        bone(f"forearm.{side}", joints[f"elbow.{side}"], joints[f"wrist.{side}"], f"upper_arm.{side}")
        bone(f"hand.{side}", joints[f"wrist.{side}"], joints[f"palm.{side}"], f"forearm.{side}")
        bone(f"thigh.{side}", joints[f"hip.{side}"], joints[f"knee.{side}"], "pelvis")
        bone(f"shin.{side}", joints[f"knee.{side}"], joints[f"ankle.{side}"], f"thigh.{side}")
        bone(f"foot.{side}", joints[f"ankle.{side}"], joints[f"toe.{side}"], f"shin.{side}")
    bone("weapon", joints["palm.R"], (0.0, -0.73, 1.42), "hand.R", deform=False)
    bone("socket_muzzle", (0.025, -1.34, 1.425), (0.025, -1.43, 1.425), "weapon", deform=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)
    armature["kyx_joint_positions"] = json.dumps(joints, sort_keys=True)
    return armature


def build_connected_suit(
    collection: bpy.types.Collection,
    armature: bpy.types.Object,
    material: bpy.types.Material,
) -> bpy.types.Object:
    """Build one connected human garment surface with Skin + Subdivision."""
    vertices: list[tuple[float, float, float]] = []
    radii: list[tuple[float, float]] = []
    edges: list[tuple[int, int]] = []

    def add_vertex(co: tuple[float, float, float], radius: tuple[float, float]) -> int:
        vertices.append(co)
        radii.append(radius)
        return len(vertices) - 1

    def chain(points: list[tuple[tuple[float, float, float], tuple[float, float]]], parent: int | None = None) -> list[int]:
        result: list[int] = []
        previous = parent
        for co, radius in points:
            current = add_vertex(co, radius)
            if previous is not None:
                edges.append((previous, current))
            result.append(current)
            previous = current
        return result

    # Central tailored torso.  The upper junction carries both shoulders while
    # the lower junction produces continuous hip transitions.
    spine = chain([
        ((0.0, 0.014, 0.90), (0.185, 0.125)),
        ((0.0, 0.010, 1.02), (0.205, 0.135)),
        ((0.0, 0.004, 1.17), (0.175, 0.120)),
        ((0.0, -0.003, 1.34), (0.225, 0.145)),
        ((0.0, -0.004, 1.47), (0.245, 0.145)),
        ((0.0, -0.004, 1.54), (0.165, 0.105)),
        ((0.0, -0.008, 1.63), (0.066, 0.070)),
    ])
    pelvis, shoulder_junction = spine[0], spine[4]
    # Legs are slightly bent and asymmetric; ankles remain slim.
    chain([
        ((0.105, 0.010, 0.89), (0.112, 0.100)),
        ((0.114, -0.006, 0.79), (0.119, 0.102)),
        ((0.124, -0.024, 0.64), (0.103, 0.091)),
        ((0.132, -0.035, 0.51), (0.069, 0.067)),
        ((0.140, -0.025, 0.405), (0.087, 0.075)),
        ((0.149, -0.014, 0.285), (0.078, 0.069)),
        ((0.155, -0.005, 0.125), (0.052, 0.054)),
    ], pelvis)
    chain([
        ((-0.105, 0.010, 0.89), (0.112, 0.100)),
        ((-0.114, 0.015, 0.78), (0.119, 0.102)),
        ((-0.124, 0.022, 0.63), (0.103, 0.091)),
        ((-0.132, 0.025, 0.50), (0.069, 0.067)),
        ((-0.140, 0.028, 0.395), (0.087, 0.075)),
        ((-0.149, 0.032, 0.275), (0.078, 0.069)),
        ((-0.155, 0.035, 0.125), (0.052, 0.054)),
    ], pelvis)
    # Arms taper continuously through shoulder, elbow and wrist.
    chain([
        ((0.205, -0.004, 1.50), (0.095, 0.086)),
        ((0.275, -0.032, 1.472), (0.088, 0.081)),
        ((0.345, -0.112, 1.390), (0.075, 0.068)),
        ((0.420, -0.220, 1.295), (0.052, 0.050)),
        ((0.370, -0.305, 1.308), (0.068, 0.058)),
        ((0.275, -0.455, 1.338), (0.062, 0.054)),
        ((0.175, -0.625, 1.372), (0.052, 0.048)),
        ((0.105, -0.755, 1.395), (0.041, 0.040)),
    ], shoulder_junction)
    chain([
        ((-0.205, -0.004, 1.50), (0.095, 0.086)),
        ((-0.275, -0.030, 1.470), (0.088, 0.081)),
        ((-0.340, -0.100, 1.395), (0.075, 0.068)),
        ((-0.395, -0.190, 1.305), (0.052, 0.050)),
        ((-0.350, -0.240, 1.315), (0.067, 0.058)),
        ((-0.275, -0.330, 1.325), (0.061, 0.053)),
        ((-0.200, -0.405, 1.337), (0.052, 0.047)),
        ((-0.135, -0.470, 1.345), (0.041, 0.040)),
    ], shoulder_junction)

    mesh = bpy.data.meshes.new("MESHDATA_CHR_ConnectedTailoredSuit")
    mesh.from_pydata(vertices, edges, [])
    mesh.update()
    obj = bpy.data.objects.new("CHR_ConnectedTailoredSuit", mesh)
    collection.objects.link(obj)
    assign_material(obj, material)
    mark_asset(obj, "connected_body_garment", "primary")
    obj["kyx_surface_contract"] = "single_connected_skin_subdivision_surface"
    obj["kyx_adult_height_target_m"] = 1.86
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    skin = obj.modifiers.new("AUTH_ConnectedSuitSkin", "SKIN")
    skin.branch_smoothing = 0.65
    bpy.context.view_layer.objects.active = obj
    # Evaluation creates the per-vertex skin data layer.
    bpy.context.view_layer.update()
    skin_data = mesh.skin_vertices[0].data
    for index, radius in enumerate(radii):
        skin_data[index].radius = radius
    skin_data[spine[2]].use_root = True
    bpy.ops.object.modifier_apply(modifier=skin.name)
    subdivision = obj.modifiers.new("AUTH_GarmentSubdivision", "SUBSURF")
    subdivision.subdivision_type = "CATMULL_CLARK"
    subdivision.levels = 2
    subdivision.render_levels = 2
    bpy.ops.object.modifier_apply(modifier=subdivision.name)
    smooth_mesh(obj)
    obj.select_set(False)
    parent_to_bone(obj, armature, "root")
    return obj


def build_body_and_gear(
    collection: bpy.types.Collection,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    parts: list[bpy.types.Object] = [build_connected_suit(collection, armature, materials["suit"])]

    def attach(obj: bpy.types.Object, bone_name: str) -> bpy.types.Object:
        parent_to_bone(obj, armature, bone_name)
        parts.append(obj)
        return obj

    # Anatomical garment volumes sit continuously over the connected undersuit.
    # Multiple authored sections establish deltoid/biceps/olecranon/forearm and
    # quadriceps/patella/gastrocnemius landmarks; these are not generic tubes.
    arm_sections = {
        "L": {
            "upper": (
                (0.205, -0.004, 1.500, 0.074, 0.068),
                (0.258, -0.024, 1.485, 0.097, 0.084),
                (0.310, -0.070, 1.440, 0.087, 0.074),
                (0.360, -0.132, 1.370, 0.077, 0.065),
                (0.402, -0.195, 1.312, 0.059, 0.052),
                (0.420, -0.220, 1.295, 0.047, 0.044),
            ),
            "forearm": (
                (0.418, -0.222, 1.296, 0.047, 0.044),
                (0.392, -0.270, 1.304, 0.060, 0.052),
                (0.345, -0.346, 1.318, 0.073, 0.060),
                (0.282, -0.445, 1.337, 0.065, 0.054),
                (0.196, -0.590, 1.366, 0.053, 0.047),
                (0.105, -0.755, 1.395, 0.039, 0.037),
            ),
        },
        "R": {
            "upper": (
                (-0.205, -0.004, 1.500, 0.074, 0.068),
                (-0.258, -0.022, 1.483, 0.097, 0.084),
                (-0.307, -0.064, 1.442, 0.087, 0.074),
                (-0.354, -0.118, 1.375, 0.077, 0.065),
                (-0.385, -0.170, 1.322, 0.059, 0.052),
                (-0.395, -0.190, 1.305, 0.047, 0.044),
            ),
            "forearm": (
                (-0.394, -0.192, 1.306, 0.047, 0.044),
                (-0.370, -0.222, 1.312, 0.060, 0.052),
                (-0.330, -0.265, 1.320, 0.071, 0.059),
                (-0.278, -0.326, 1.328, 0.064, 0.053),
                (-0.208, -0.398, 1.338, 0.052, 0.046),
                (-0.135, -0.470, 1.345, 0.039, 0.037),
            ),
        },
    }
    leg_sections = {
        "L": {
            "thigh": (
                (0.105, 0.010, 0.890, 0.106, 0.096),
                (0.112, 0.000, 0.825, 0.123, 0.104),
                (0.118, -0.012, 0.740, 0.126, 0.106),
                (0.125, -0.026, 0.630, 0.108, 0.092),
                (0.132, -0.035, 0.515, 0.067, 0.064),
            ),
            "calf": (
                (0.133, -0.034, 0.505, 0.066, 0.063),
                (0.139, -0.026, 0.455, 0.079, 0.070),
                (0.145, -0.018, 0.390, 0.093, 0.079),
                (0.149, -0.012, 0.315, 0.087, 0.073),
                (0.153, -0.007, 0.225, 0.069, 0.063),
                (0.155, -0.005, 0.125, 0.050, 0.050),
            ),
        },
        "R": {
            "thigh": (
                (-0.105, 0.010, 0.890, 0.106, 0.096),
                (-0.112, 0.014, 0.820, 0.123, 0.104),
                (-0.118, 0.019, 0.730, 0.126, 0.106),
                (-0.125, 0.023, 0.620, 0.108, 0.092),
                (-0.132, 0.025, 0.505, 0.067, 0.064),
            ),
            "calf": (
                (-0.133, 0.026, 0.495, 0.066, 0.063),
                (-0.139, 0.028, 0.445, 0.079, 0.070),
                (-0.145, 0.030, 0.380, 0.093, 0.079),
                (-0.149, 0.032, 0.305, 0.087, 0.073),
                (-0.153, 0.034, 0.215, 0.069, 0.063),
                (-0.155, 0.035, 0.125, 0.050, 0.050),
            ),
        },
    }
    for side in ("L", "R"):
        attach(add_profiled_limb_surface(f"CHR_UpperArmAnatomy_{side}", arm_sections[side]["upper"], materials["suit"], collection, role="tailored_deltoid_biceps_sleeve", form_level="primary"), f"upper_arm.{side}")
        attach(add_profiled_limb_surface(f"CHR_ForearmAnatomy_{side}", arm_sections[side]["forearm"], materials["suit"], collection, role="tailored_elbow_forearm_sleeve", form_level="primary"), f"forearm.{side}")
        attach(add_profiled_limb_surface(f"CHR_ThighAnatomy_{side}", leg_sections[side]["thigh"], materials["suit"], collection, role="tailored_quadriceps_trouser", form_level="primary"), f"thigh.{side}")
        attach(add_profiled_limb_surface(f"CHR_CalfAnatomy_{side}", leg_sections[side]["calf"], materials["suit"], collection, role="tailored_knee_calf_trouser", form_level="primary"), f"shin.{side}")

    # Adult-scaled head with a visible soft hood beneath a layered ballistic
    # shell.  The shell, brow, cheek interfaces, respirator and neck shroud are
    # individually readable; the result must not collapse into a blank egg.
    attach(add_uv_ellipsoid("CHR_HeadHood", (0.0, -0.014, 1.748), (0.090, 0.094, 0.123), materials["suit_raised"], collection, role="human_head_underlayer", form_level="primary"), "head")
    attach(add_uv_ellipsoid("CHR_HelmetCrown", (0.0, 0.006, 1.798), (0.101, 0.103, 0.096), materials["metal"], collection, role="fitted_helmet_shell_base", form_level="secondary"), "head")
    attach(add_front_plate("CHR_HelmetForeheadShell", (0.0, -0.101, 1.818), ((-0.032, 0.166), (0.020, 0.177), (0.074, 0.142)), 0.018, 0.014, materials["armor"], collection, columns=11, bevel=0.005, role="layered_forehead_shell"), "head")
    attach(add_front_plate("CHR_FaceMask", (0.0, -0.108, 1.720), ((-0.066, 0.080), (-0.025, 0.116), (0.026, 0.134), (0.070, 0.126)), 0.016, 0.010, materials["suit_raised"], collection, columns=9, bevel=0.004, role="fitted_face_mask"), "head")
    attach(add_front_plate("CHR_Respirator", (0.0, -0.128, 1.694), ((-0.043, 0.058), (-0.006, 0.084), (0.038, 0.073)), 0.014, 0.008, materials["armor"], collection, columns=7, bevel=0.004, role="shaped_respirator"), "head")
    attach(add_front_plate("CHR_ChinGuard", (0.0, -0.111, 1.653), ((-0.018, 0.047), (0.018, 0.071), (0.035, 0.054)), 0.017, 0.006, materials["metal"], collection, columns=7, bevel=0.004, role="helmet_chin_interface"), "head")
    attach(add_rounded_box("CHR_Visor", (0.0, -0.122, 1.793), (0.145, 0.018, 0.027), materials["teal"], collection, rotation=(math.radians(-4), 0.0, 0.0), bevel=0.007, role="visor", form_level="tertiary"), "head")
    attach(add_rounded_box("CHR_HelmetBrow", (0.0, -0.112, 1.824), (0.164, 0.021, 0.018), materials["armor_edge"], collection, rotation=(math.radians(-4), 0.0, 0.0), bevel=0.005, role="helmet_edge", form_level="tertiary"), "head")
    attach(add_rounded_box("CHR_CommModule_L", (0.108, -0.004, 1.755), (0.022, 0.052, 0.066), materials["oxide"], collection, bevel=0.007, role="helmet_device", form_level="tertiary"), "head")
    attach(add_rounded_box("CHR_EarCup_R", (-0.103, -0.004, 1.752), (0.020, 0.050, 0.060), materials["armor"], collection, bevel=0.009, role="helmet_ear_interface", form_level="tertiary"), "head")
    attach(add_cylinder_between("CHR_CommAntenna_L", (0.112, 0.012, 1.792), (0.119, 0.036, 1.895), 0.005, 0.003, materials["metal"], collection, vertices=12, role="helmet_device"), "head")
    attach(add_uv_ellipsoid("CHR_NeckShroud", (0.0, 0.002, 1.638), (0.082, 0.077, 0.041), materials["webbing"], collection, role="helmet_neck_shroud", form_level="secondary"), "neck")
    attach(add_torus("CHR_NeckGasket", (0.0, -0.002, 1.645), 0.071, 0.009, materials["webbing"], collection, role="helmet_neck_interface"), "neck")
    attach(add_curve_tube("CHR_HelmetCrownRidge", [(0.0, -0.096, 1.842), (0.0, -0.028, 1.890), (0.0, 0.075, 1.855)], 0.005, materials["armor_edge"], collection, role="helmet_shell_layer"), "head")
    attach(add_curve_tube("CHR_HelmetRearBreak", [(-0.072, 0.070, 1.824), (0.0, 0.100, 1.840), (0.072, 0.070, 1.824)], 0.004, materials["armor_edge"], collection, role="helmet_shell_layer"), "head")
    for side, sign in (("L", 1.0), ("R", -1.0)):
        attach(add_tapered_capsule(f"CHR_HelmetCheek_{side}", (0.069 * sign, -0.105, 1.776), (0.058 * sign, -0.101, 1.678), 0.018, 0.012, materials["armor"], collection, sides=20, depth_ratio=0.55, role="helmet_cheek_interface", form_level="tertiary"), "head")
        attach(add_curve_tube(f"CHR_HelmetTempleRail_{side}", [(0.083 * sign, -0.087, 1.827), (0.100 * sign, -0.012, 1.840), (0.084 * sign, 0.062, 1.812)], 0.004, materials["armor_edge"], collection, role="helmet_shell_layer"), "head")
        attach(add_curve_tube(f"CHR_HoodNeckFold_{side}", [(0.060 * sign, -0.060, 1.660), (0.070 * sign, -0.012, 1.642), (0.052 * sign, 0.046, 1.632)], 0.0022, materials["suit_raised"], collection, role="neck_cloth_fold"), "neck")
    attach(add_curve_tube("CHR_MaskCenterSeam", [(0.0, -0.132, 1.770), (0.0, -0.134, 1.725), (0.0, -0.136, 1.680)], 0.0022, materials["armor_edge"], collection, role="face_mask_seam"), "head")
    for index, x in enumerate((-0.034, -0.012, 0.012, 0.034)):
        attach(add_curve_tube(f"CHR_MaskVent_{index}", [(x - 0.005, -0.140, 1.682), (x + 0.005, -0.141, 1.694)], 0.0018, materials["ink"], collection, role="face_mask_vent"), "head")

    # Tailored armor covers only vital areas, leaving continuous soft goods and
    # anatomical transitions visible at neck, shoulders, waist, hips and joints.
    # Split pectoral shells follow the ribcage and leave a soft central channel;
    # this avoids the single broad chest-board read of the previous build.
    attach(add_front_plate("CHR_PectoralPlate_L", (0.096, -0.143, 1.410), ((-0.108, 0.128), (-0.050, 0.164), (0.018, 0.177), (0.082, 0.157), (0.122, 0.112)), 0.020, 0.027, materials["armor"], collection, columns=9, bevel=0.007, role="conforming_pectoral_armor"), "chest")
    attach(add_front_plate("CHR_PectoralPlate_R", (-0.096, -0.143, 1.410), ((-0.108, 0.128), (-0.050, 0.164), (0.018, 0.177), (0.082, 0.157), (0.122, 0.112)), 0.020, 0.027, materials["armor"], collection, columns=9, bevel=0.007, role="conforming_pectoral_armor"), "chest")
    attach(add_front_plate("CHR_SternumChannel", (0.0, -0.176, 1.405), ((-0.096, 0.045), (-0.030, 0.061), (0.044, 0.066), (0.098, 0.047)), 0.012, 0.006, materials["webbing"], collection, columns=7, bevel=0.004, role="soft_sternum_channel"), "chest")
    attach(add_front_plate("CHR_SternumInset", (0.0, -0.187, 1.405), ((-0.042, 0.035), (0.0, 0.050), (0.042, 0.034)), 0.009, 0.004, materials["oxide"], collection, columns=7, bevel=0.003, role="armor_inset"), "chest")
    attach(add_front_plate("CHR_UpperAbFlex", (0.0, -0.119, 1.238), ((-0.040, 0.196), (0.0, 0.232), (0.040, 0.202)), 0.014, 0.010, materials["webbing"], collection, columns=9, bevel=0.004, role="flex_armor"), "spine")
    attach(add_front_plate("CHR_LowerAbFlex", (0.0, -0.111, 1.145), ((-0.038, 0.172), (0.0, 0.214), (0.038, 0.186)), 0.013, 0.009, materials["webbing"], collection, columns=9, bevel=0.004, role="flex_armor"), "spine")
    attach(add_front_plate("CHR_BackPlate", (0.0, 0.127, 1.392), ((-0.128, 0.265), (0.0, 0.335), (0.132, 0.290)), 0.026, 0.010, materials["armor"], collection, bevel=0.008), "chest")

    for side, sign in (("L", 1.0), ("R", -1.0)):
        attach(add_uv_ellipsoid(f"CHR_ShoulderCap_{side}", (0.270 * sign, -0.018, 1.505), (0.074, 0.051, 0.039), materials["armor"], collection, rotation=(math.radians(8), math.radians(9 * sign), 0.0), segments=28, rings=16, role="conforming_shoulder_cap"), f"upper_arm.{side}")
        if side == "L":
            attach(add_curve_tube("CHR_ShoulderMark_L", [(0.242, -0.070, 1.524), (0.270, -0.074, 1.532), (0.294, -0.066, 1.518)], 0.0045, materials["oxide"], collection, role="restrained_faction_mark"), "upper_arm.L")
        # Small fitted knee and shin protection; no box boots or huge joint rings.
        knee_x = 0.132 * sign
        shin_x = 0.145 * sign
        knee_y = -0.074 if side == "L" else -0.023
        shin_y = -0.071 if side == "L" else -0.045
        attach(add_uv_ellipsoid(f"CHR_PatellaUnderform_{side}", (knee_x, knee_y + 0.010, 0.507), (0.064, 0.035, 0.058), materials["suit_raised"], collection, segments=24, rings=14, role="soft_patella_landmark", form_level="secondary"), f"shin.{side}")
        attach(add_front_plate(f"CHR_KneePad_{side}", (knee_x, knee_y, 0.505), ((-0.052, 0.075), (-0.024, 0.108), (0.010, 0.121), (0.040, 0.098), (0.055, 0.067)), 0.018, 0.010, materials["armor_edge"], collection, columns=9, bevel=0.004, role="conforming_knee_pad"), f"shin.{side}")
        attach(add_front_plate(f"CHR_ShinPlate_{side}", (shin_x, shin_y, 0.305), ((-0.108, 0.055), (-0.062, 0.078), (0.0, 0.092), (0.068, 0.075), (0.110, 0.050)), 0.017, 0.009, materials["armor"], collection, columns=9, bevel=0.004, role="conforming_shin_plate"), f"shin.{side}")
        # One profiled upper replaces the old capsule-plus-box stack.  Width,
        # instep height and toe height taper independently along the foot.
        boot_x = 0.155 * sign
        boot_shift = 0.0 if side == "L" else 0.040
        attach(add_profiled_boot(f"CHR_BootForm_{side}", boot_x, boot_shift, materials["metal"], collection), f"foot.{side}")
        attach(add_profiled_boot(f"CHR_BootSole_{side}", boot_x, boot_shift, materials["ink"], collection, sole=True), f"foot.{side}")
        attach(add_front_plate(f"CHR_BootTongue_{side}", (boot_x, -0.058 + boot_shift, 0.133), ((-0.055, 0.063), (-0.010, 0.076), (0.045, 0.060)), 0.010, 0.006, materials["webbing"], collection, columns=7, bevel=0.003, role="boot_tongue"), f"foot.{side}")
        attach(add_curve_tube(f"CHR_BootCollar_{side}", [(boot_x - 0.048, 0.060 + boot_shift, 0.178), (boot_x - 0.055, 0.005 + boot_shift, 0.186), (boot_x, -0.030 + boot_shift, 0.180), (boot_x + 0.055, 0.005 + boot_shift, 0.186), (boot_x + 0.048, 0.060 + boot_shift, 0.178), (boot_x, 0.082 + boot_shift, 0.184)], 0.0035, materials["armor_edge"], collection, cyclic=True, role="boot_padded_collar"), f"foot.{side}")
        attach(add_curve_tube(f"CHR_BootToeCapSeam_{side}", [(boot_x - 0.055, -0.155 + boot_shift, 0.064), (boot_x, -0.170 + boot_shift, 0.076), (boot_x + 0.055, -0.155 + boot_shift, 0.064)], 0.0025, materials["armor_edge"], collection, role="boot_toe_cap_seam"), f"foot.{side}")
        for lace_index, lace_y in enumerate((-0.005, -0.040, -0.075)):
            attach(add_curve_tube(f"CHR_BootLace_{side}_{lace_index}", [(boot_x - 0.042, lace_y + boot_shift, 0.149 - lace_index * 0.022), (boot_x, lace_y - 0.008 + boot_shift, 0.158 - lace_index * 0.022), (boot_x + 0.042, lace_y + boot_shift, 0.149 - lace_index * 0.022)], 0.0023, materials["armor_edge"], collection, role="boot_lacing"), f"foot.{side}")

    # Garment panel seams and deliberately irregular cloth-fold ridges.
    seam_specs = [
        ("CHR_ChestPrincessSeam_L", [(0.145, -0.120, 1.50), (0.135, -0.150, 1.36), (0.110, -0.125, 1.20)]),
        ("CHR_ChestPrincessSeam_R", [(-0.145, -0.120, 1.50), (-0.135, -0.150, 1.36), (-0.110, -0.125, 1.20)]),
        ("CHR_WaistSeam", [(-0.185, -0.105, 1.075), (0.0, -0.132, 1.045), (0.185, -0.105, 1.075)]),
        ("CHR_BackYoke", [(-0.205, 0.115, 1.475), (0.0, 0.155, 1.430), (0.205, 0.115, 1.475)]),
    ]
    for name, points in seam_specs:
        attach(add_curve_tube(name, points, 0.004, materials["webbing"], collection), "chest")
    fold_specs = [
        ("CHR_BicepTension_L", [(0.292, -0.112, 1.438), (0.332, -0.145, 1.410), (0.370, -0.166, 1.374)], "upper_arm.L"),
        ("CHR_BicepTension_R", [(-0.286, -0.105, 1.440), (-0.326, -0.132, 1.412), (-0.364, -0.151, 1.375)], "upper_arm.R"),
        ("CHR_ElbowFold_L_1", [(0.365, -0.176, 1.330), (0.405, -0.205, 1.310), (0.435, -0.235, 1.300)], "forearm.L"),
        ("CHR_ElbowFold_L_2", [(0.355, -0.188, 1.310), (0.400, -0.220, 1.292), (0.432, -0.250, 1.283)], "forearm.L"),
        ("CHR_ElbowFold_L_3", [(0.340, -0.205, 1.348), (0.388, -0.235, 1.330), (0.420, -0.268, 1.318)], "forearm.L"),
        ("CHR_ElbowFold_R_1", [(-0.350, -0.150, 1.335), (-0.393, -0.185, 1.315), (-0.410, -0.210, 1.300)], "forearm.R"),
        ("CHR_ElbowFold_R_2", [(-0.335, -0.168, 1.350), (-0.380, -0.202, 1.330), (-0.402, -0.228, 1.315)], "forearm.R"),
        ("CHR_KneeFold_L", [(0.075, -0.060, 0.530), (0.126, -0.085, 0.515), (0.178, -0.060, 0.530)], "shin.L"),
        ("CHR_KneeFold_R", [(-0.075, -0.015, 0.525), (-0.126, -0.040, 0.505), (-0.178, -0.015, 0.525)], "shin.R"),
        ("CHR_WaistTension_L", [(0.205, -0.080, 1.115), (0.145, -0.128, 1.085), (0.060, -0.143, 1.065)], "spine"),
        ("CHR_WaistTension_R", [(-0.205, -0.080, 1.115), (-0.145, -0.128, 1.085), (-0.060, -0.143, 1.065)], "spine"),
        ("CHR_ArmpitTension_L", [(0.220, -0.040, 1.445), (0.180, -0.110, 1.410), (0.145, -0.150, 1.360)], "chest"),
        ("CHR_ArmpitTension_R", [(-0.220, -0.040, 1.445), (-0.180, -0.110, 1.410), (-0.145, -0.150, 1.360)], "chest"),
        ("CHR_HipTension_L", [(0.030, -0.112, 0.955), (0.088, -0.125, 0.925), (0.158, -0.105, 0.885)], "pelvis"),
        ("CHR_HipTension_R", [(-0.030, -0.112, 0.955), (-0.088, -0.125, 0.925), (-0.158, -0.105, 0.885)], "pelvis"),
        ("CHR_ThighTension_L", [(0.065, -0.106, 0.620), (0.126, -0.125, 0.600), (0.180, -0.100, 0.620)], "thigh.L"),
        ("CHR_ThighTension_R", [(-0.065, -0.060, 0.610), (-0.126, -0.080, 0.590), (-0.180, -0.055, 0.610)], "thigh.R"),
        ("CHR_AnkleCompression_L", [(0.115, -0.055, 0.190), (0.155, -0.070, 0.180), (0.194, -0.050, 0.190)], "shin.L"),
        ("CHR_AnkleCompression_R", [(-0.115, -0.015, 0.190), (-0.155, -0.030, 0.180), (-0.194, -0.010, 0.190)], "shin.R"),
    ]
    for name, points, bone in fold_specs:
        attach(add_curve_tube(name, points, 0.0022, materials["suit_raised"], collection, role="cloth_fold"), bone)
    limb_seams = [
        ("CHR_ForearmSeam_L", [(0.405, -0.245, 1.315), (0.300, -0.445, 1.350), (0.165, -0.670, 1.385)], "forearm.L"),
        ("CHR_ForearmSeam_R", [(-0.382, -0.205, 1.315), (-0.285, -0.315, 1.335), (-0.170, -0.435, 1.347)], "forearm.R"),
        ("CHR_UpperArmSeam_L", [(0.250, 0.030, 1.485), (0.326, -0.042, 1.415), (0.397, -0.165, 1.325)], "upper_arm.L"),
        ("CHR_UpperArmSeam_R", [(-0.250, 0.030, 1.485), (-0.323, -0.038, 1.418), (-0.382, -0.145, 1.330)], "upper_arm.R"),
        ("CHR_ThighSeam_L", [(0.210, 0.015, 0.865), (0.220, -0.002, 0.700), (0.205, -0.030, 0.555)], "thigh.L"),
        ("CHR_ThighSeam_R", [(-0.210, 0.025, 0.865), (-0.220, 0.025, 0.695), (-0.205, 0.015, 0.545)], "thigh.R"),
        ("CHR_CalfSeam_L", [(0.208, -0.010, 0.455), (0.218, -0.005, 0.315), (0.205, 0.005, 0.180)], "shin.L"),
        ("CHR_CalfSeam_R", [(-0.208, 0.030, 0.445), (-0.218, 0.035, 0.305), (-0.205, 0.040, 0.180)], "shin.R"),
    ]
    for name, points, bone in limb_seams:
        attach(add_curve_tube(name, points, 0.0024, materials["webbing"], collection, role="garment_panel_seam"), bone)

    # Low-profile harness and utility pieces follow the body rather than
    # replacing it. Pouches are deliberately palm-sized.
    attach(add_curve_tube("CHR_Harness_L", [(0.195, -0.165, 1.515), (0.100, -0.196, 1.350), (-0.020, -0.172, 1.180)], 0.007, materials["webbing"], collection), "chest")
    attach(add_curve_tube("CHR_Harness_R", [(-0.195, -0.165, 1.515), (-0.100, -0.196, 1.350), (0.020, -0.172, 1.180)], 0.007, materials["webbing"], collection), "chest")
    attach(add_curve_tube("CHR_DutyBelt", [(-0.205, -0.090, 1.015), (0.0, -0.145, 1.000), (0.205, -0.090, 1.015), (0.210, 0.050, 1.015), (0.0, 0.120, 1.000), (-0.210, 0.050, 1.015)], 0.010, materials["webbing"], collection, cyclic=True), "pelvis")
    attach(add_rounded_box("CHR_BeltBuckle", (0.0, -0.154, 1.005), (0.055, 0.025, 0.045), materials["brass"], collection, bevel=0.007, role="hardware"), "pelvis")
    attach(add_rounded_box("CHR_RadioPouch_R", (-0.215, 0.005, 1.075), (0.070, 0.095, 0.125), materials["webbing"], collection, rotation=(0.0, math.radians(-5), 0.0), bevel=0.014, role="utility_pouch"), "pelvis")
    attach(add_rounded_box("CHR_MedPouch_L", (0.210, 0.020, 0.980), (0.082, 0.105, 0.105), materials["webbing"], collection, rotation=(0.0, math.radians(5), 0.0), bevel=0.014, role="utility_pouch"), "pelvis")
    attach(add_rounded_box("CHR_ForearmDevice_L", (0.285, -0.445, 1.385), (0.070, 0.120, 0.025), materials["metal"], collection, rotation=(math.radians(12), math.radians(8), math.radians(-28)), bevel=0.008, role="wrist_device"), "forearm.L")
    attach(add_rounded_box("CHR_ForearmDeviceScreen_L", (0.286, -0.455, 1.402), (0.045, 0.075, 0.010), materials["teal"], collection, rotation=(math.radians(12), math.radians(8), math.radians(-28)), bevel=0.004, role="device_state"), "forearm.L")

    # Articulated hands with explicit contact topology.  The dominant palm seats
    # against the pistol grip and the support palm sits beneath the handguard;
    # finger tips cross the far-side silhouette rather than hovering above it.
    attach(add_tapered_capsule("CHR_Carpal_R", (-0.135, -0.470, 1.345), (-0.114, -0.510, 1.346), 0.043, 0.038, materials["suit_raised"], collection, sides=20, depth_ratio=0.75, role="glove"), "hand.R")
    attach(add_uv_ellipsoid("CHR_Palm_R", (-0.112, -0.523, 1.340), (0.037, 0.052, 0.043), materials["suit_raised"], collection, rotation=(math.radians(5), math.radians(-8), math.radians(-5)), segments=24, rings=14, role="grip_palm_contact"), "hand.R")
    # Index finger is extended onto the trigger plane.
    attach(add_tapered_capsule("CHR_R_TriggerFinger_Prox", (-0.126, -0.526, 1.382), (-0.086, -0.548, 1.392), 0.0115, 0.0095, materials["suit_raised"], collection, sides=14, depth_ratio=0.90, role="trigger_finger_contact", form_level="tertiary"), "hand.R")
    attach(add_tapered_capsule("CHR_R_TriggerFinger_Dist", (-0.086, -0.548, 1.392), (-0.050, -0.535, 1.390), 0.0095, 0.0075, materials["suit_raised"], collection, sides=14, depth_ratio=0.90, role="trigger_finger_contact", form_level="tertiary"), "hand.R")
    for index, z in enumerate((1.350, 1.322, 1.294)):
        attach(add_tapered_capsule(f"CHR_R_GripFinger_{index}_Prox", (-0.127, -0.530, z), (-0.078, -0.556, z - 0.004), 0.0120, 0.0100, materials["suit_raised"], collection, sides=14, depth_ratio=0.90, role="grip_finger_contact", form_level="tertiary"), "hand.R")
        attach(add_tapered_capsule(f"CHR_R_GripFinger_{index}_Dist", (-0.078, -0.556, z - 0.004), (-0.033, -0.532, z - 0.010), 0.0100, 0.0072, materials["suit_raised"], collection, sides=14, depth_ratio=0.90, role="grip_finger_contact", form_level="tertiary"), "hand.R")
    attach(add_tapered_capsule("CHR_R_Thumb_Prox", (-0.098, -0.493, 1.365), (-0.064, -0.519, 1.382), 0.0135, 0.0105, materials["suit_raised"], collection, sides=14, role="grip_thumb_contact", form_level="tertiary"), "hand.R")
    attach(add_tapered_capsule("CHR_R_Thumb_Dist", (-0.064, -0.519, 1.382), (-0.040, -0.552, 1.360), 0.0105, 0.0075, materials["suit_raised"], collection, sides=14, role="grip_thumb_contact", form_level="tertiary"), "hand.R")

    attach(add_tapered_capsule("CHR_Carpal_L", (0.105, -0.755, 1.395), (0.048, -0.812, 1.400), 0.043, 0.038, materials["suit_raised"], collection, sides=20, depth_ratio=0.75, role="glove"), "hand.L")
    attach(add_uv_ellipsoid("CHR_Palm_L", (0.018, -0.842, 1.397), (0.043, 0.063, 0.034), materials["suit_raised"], collection, rotation=(math.radians(-7), math.radians(5), math.radians(3)), segments=24, rings=14, role="support_palm_contact"), "hand.L")
    for index, y in enumerate((-0.775, -0.818, -0.861, -0.904)):
        attach(add_tapered_capsule(f"CHR_L_WrapFinger_{index}_Prox", (0.059, y, 1.402), (0.052, y - 0.004, 1.449), 0.0120, 0.0100, materials["suit_raised"], collection, sides=14, depth_ratio=0.90, role="support_finger_contact", form_level="tertiary"), "hand.L")
        attach(add_tapered_capsule(f"CHR_L_WrapFinger_{index}_Dist", (0.052, y - 0.004, 1.449), (-0.043, y - 0.008, 1.415), 0.0100, 0.0072, materials["suit_raised"], collection, sides=14, depth_ratio=0.90, role="support_finger_contact", form_level="tertiary"), "hand.L")
    attach(add_tapered_capsule("CHR_L_Thumb_Prox", (-0.006, -0.788, 1.382), (0.036, -0.818, 1.417), 0.0135, 0.0105, materials["suit_raised"], collection, sides=14, role="support_thumb_contact", form_level="tertiary"), "hand.L")
    attach(add_tapered_capsule("CHR_L_Thumb_Dist", (0.036, -0.818, 1.417), (0.049, -0.875, 1.421), 0.0105, 0.0075, materials["suit_raised"], collection, sides=14, role="support_thumb_contact", form_level="tertiary"), "hand.L")
    return parts


def build_rifle(
    collection: bpy.types.Collection,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    pieces: list[bpy.types.Object] = []

    def weapon(obj: bpy.types.Object) -> bpy.types.Object:
        parent_to_bone(obj, armature, "weapon")
        obj["kyx_asset_role"] = "refinement_v3_rifle_part"
        pieces.append(obj)
        return obj

    # Recognizable, slender shoulder-fired carbine.  A skeletal stock, distinct
    # upper/lower receiver, hollow trigger guard, tapered grip, compact magazine
    # and ventilated handguard replace the previous panel-and-box assembly.
    weapon(add_extruded_yz_profile("PROP_StockCheek", -0.154, 0.070, ((-0.105, 1.535), (-0.235, 1.515), (-0.360, 1.485), (-0.340, 1.455), (-0.185, 1.475)), materials["metal"], collection, bevel=0.008, role="weapon_stock", form_level="primary"))
    weapon(add_curve_tube("PROP_StockUpperStrut", [(-0.160, -0.105, 1.515), (-0.145, -0.235, 1.485), (-0.105, -0.365, 1.445)], 0.011, materials["metal"], collection, role="weapon_stock_strut"))
    weapon(add_curve_tube("PROP_StockLowerStrut", [(-0.165, -0.110, 1.455), (-0.150, -0.225, 1.425), (-0.105, -0.365, 1.425)], 0.010, materials["metal"], collection, role="weapon_stock_strut"))
    weapon(add_extruded_yz_profile("PROP_StockPad", -0.198, 0.088, ((-0.079, 1.548), (-0.114, 1.540), (-0.120, 1.448), (-0.087, 1.440)), materials["webbing"], collection, bevel=0.007, role="weapon_shoulder_contact", form_level="secondary"))
    weapon(add_extruded_yz_profile("PROP_UpperReceiver", -0.063, 0.064, ((-0.340, 1.493), (-0.667, 1.476), (-0.682, 1.445), (-0.650, 1.420), (-0.352, 1.425)), materials["metal"], collection, bevel=0.006, role="weapon_receiver", form_level="primary"))
    weapon(add_extruded_yz_profile("PROP_LowerReceiver", -0.067, 0.060, ((-0.385, 1.424), (-0.636, 1.416), (-0.612, 1.360), (-0.512, 1.348), (-0.420, 1.382)), materials["armor"], collection, bevel=0.005, role="weapon_receiver", form_level="secondary"))
    weapon(add_extruded_yz_profile("PROP_Handguard", -0.001, 0.056, ((-0.650, 1.470), (-1.034, 1.458), (-1.055, 1.431), (-1.025, 1.402), (-0.670, 1.405)), materials["armor"], collection, bevel=0.006, role="weapon_handguard", form_level="primary"))
    weapon(add_curve_tube("PROP_TopRail", [(-0.084, -0.360, 1.508), (-0.034, -0.690, 1.490), (0.008, -1.010, 1.472)], 0.005, materials["ink"], collection, role="weapon_rail"))
    weapon(add_cylinder_between("PROP_Barrel", (0.018, -1.000, 1.425), (0.025, -1.355, 1.425), 0.016, 0.014, materials["ink"], collection, vertices=20, role="weapon_barrel", form_level="secondary"))
    weapon(add_cylinder_between("PROP_Muzzle", (0.025, -1.330, 1.425), (0.026, -1.410, 1.425), 0.025, 0.022, materials["metal"], collection, vertices=20, bevel=0.003, role="weapon_muzzle", form_level="secondary"))
    weapon(add_extruded_yz_profile("PROP_PistolGrip", -0.076, 0.046, ((-0.478, 1.397), (-0.530, 1.385), (-0.562, 1.275), (-0.526, 1.257), (-0.492, 1.310)), materials["ink"], collection, bevel=0.006, role="weapon_grip_contact", form_level="secondary"))
    weapon(add_curve_tube("PROP_TriggerGuard", [(-0.070, -0.475, 1.394), (-0.070, -0.520, 1.360), (-0.070, -0.566, 1.390)], 0.005, materials["metal"], collection, role="weapon_control"))
    weapon(add_cylinder_between("PROP_Trigger", (-0.060, -0.520, 1.392), (-0.055, -0.532, 1.372), 0.004, 0.003, materials["ink"], collection, vertices=10, role="weapon_control"))
    weapon(add_extruded_yz_profile("PROP_Magazine", -0.014, 0.058, ((-0.565, 1.388), (-0.620, 1.378), (-0.648, 1.230), (-0.610, 1.212), (-0.565, 1.320)), materials["webbing"], collection, bevel=0.006, role="weapon_magazine", form_level="secondary"))
    weapon(add_rounded_box("PROP_EjectionPort", (-0.098, -0.535, 1.462), (0.007, 0.118, 0.030), materials["ink"], collection, bevel=0.002, role="weapon_receiver_detail"))
    weapon(add_cylinder_between("PROP_ChargingHandle", (-0.100, -0.405, 1.475), (-0.128, -0.405, 1.475), 0.006, 0.005, materials["metal"], collection, vertices=12, role="weapon_receiver_detail"))
    weapon(add_rounded_box("PROP_OpticBase", (-0.060, -0.555, 1.516), (0.064, 0.105, 0.018), materials["ink"], collection, rotation=(0.0, math.radians(-2), math.radians(-10)), bevel=0.004, role="weapon_optic"))
    weapon(add_rounded_box("PROP_Optic", (-0.055, -0.560, 1.553), (0.069, 0.083, 0.052), materials["metal"], collection, rotation=(0.0, math.radians(-2), math.radians(-10)), bevel=0.012, role="weapon_optic", form_level="secondary"))
    weapon(add_rounded_box("PROP_OpticLens", (-0.035, -0.605, 1.555), (0.040, 0.010, 0.030), materials["teal"], collection, rotation=(0.0, math.radians(-2), math.radians(-10)), bevel=0.005, role="weapon_optic"))
    for index, y in enumerate((-0.740, -0.835, -0.930)):
        weapon(add_rounded_box(f"PROP_HandguardSlot_{index}", (0.031, y, 1.430), (0.006, 0.050, 0.020), materials["ink"], collection, bevel=0.002, role="weapon_vent"))
    muzzle = bpy.data.objects.new("SOCKET_Muzzle", None)
    collection.objects.link(muzzle)
    muzzle.location = (0.026, -1.410, 1.425)
    muzzle.empty_display_type = "SINGLE_ARROW"
    muzzle.empty_display_size = 0.08
    parent_to_bone(muzzle, armature, "weapon")
    muzzle["kyx_socket"] = "muzzle"
    pieces.append(muzzle)
    return pieces


def build_animation(armature: bpy.types.Object) -> bpy.types.Action:
    armature.animation_data_create()
    action = bpy.data.actions.new("REFINEV3_CombatReady_Breathe")
    armature.animation_data.action = action
    action["kyx_semantic_state"] = "combat_ready_breathe_visual_candidate"
    action["kyx_root_motion"] = "in_place"
    action["kyx_deformation_proof"] = False
    root = armature.pose.bones["root"]
    chest = armature.pose.bones["chest"]
    head = armature.pose.bones["head"]
    for bone in (root, chest, head):
        bone.rotation_mode = "XYZ"
    for frame, lift, pitch, head_yaw in (
        (FRAME_START, 0.0, 0.0, 0.0),
        (FRAME_BREATHE, 0.0025, math.radians(0.30), math.radians(0.20)),
        (FRAME_END, 0.0, 0.0, 0.0),
    ):
        bpy.context.scene.frame_set(frame)
        root.location = (0.0, 0.0, lift)
        chest.rotation_euler = (pitch, 0.0, 0.0)
        head.rotation_euler = (0.0, 0.0, head_yaw)
        root.keyframe_insert(data_path="location")
        chest.keyframe_insert(data_path="rotation_euler")
        head.keyframe_insert(data_path="rotation_euler")
    bpy.context.scene.timeline_markers.new("contact_pose", frame=FRAME_START)
    bpy.context.scene.timeline_markers.new("breath_apex", frame=FRAME_BREATHE)
    bpy.context.scene.timeline_markers.new("loop", frame=FRAME_END)
    return action


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def build_presentation(collection: bpy.types.Collection, materials: dict[str, bpy.types.Material]) -> bpy.types.Object:
    add_rounded_box("PRES_Floor", (0.0, 0.0, -0.045), (6.0, 6.0, 0.08), materials["floor"], collection, bevel=0.0, role="presentation", form_level="presentation")
    add_rounded_box("PRES_Backdrop", (0.0, 1.45, 1.55), (5.5, 0.08, 3.3), materials["backdrop"], collection, bevel=0.0, role="presentation", form_level="presentation")
    add_rounded_box("PRES_OxideMark", (-1.45, 1.39, 1.35), (0.035, 0.018, 2.20), materials["oxide"], collection, rotation=(0.0, math.radians(-16), 0.0), bevel=0.0, role="presentation", form_level="presentation")
    camera_data = bpy.data.cameras.new("CAMDATA_RefinementV3")
    camera = bpy.data.objects.new("CAM_RefinementV3", camera_data)
    collection.objects.link(camera)
    camera_data.lens = 68.0
    camera_data.sensor_width = 36.0
    bpy.context.scene.camera = camera

    def light(name: str, location: tuple[float, float, float], energy: float, color: tuple[float, float, float], size: float) -> None:
        data = bpy.data.lights.new(f"{name}_DATA", "AREA")
        data.energy = energy
        data.color = color
        data.shape = "DISK"
        data.size = size
        obj = bpy.data.objects.new(name, data)
        collection.objects.link(obj)
        obj.location = location
        look_at(obj, (0.0, -0.30, 1.10))

    light("LIGHT_Key", (-3.2, -4.0, 4.6), 1150.0, (0.80, 0.90, 1.0), 3.0)
    light("LIGHT_Fill", (3.4, -2.6, 2.8), 620.0, (0.52, 0.88, 0.82), 2.6)
    light("LIGHT_Rim", (1.0, 3.2, 3.6), 1000.0, (1.0, 0.32, 0.16), 2.2)
    light("LIGHT_Front", (0.0, -4.0, 1.5), 300.0, (0.90, 0.82, 0.70), 2.2)
    # Keep the back-review fill on the character side of the backdrop so the
    # wall does not occlude it.
    light("LIGHT_Back", (-1.2, 1.10, 2.6), 980.0, (0.72, 0.82, 0.90), 3.0)
    return camera


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.name = "SCENE_KYX_Phase7_CharacterRefinementV3"
    scene.frame_start = FRAME_START
    scene.frame_end = FRAME_END
    scene.render.fps = FPS
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = RENDER_SIZE
    scene.render.resolution_y = RENDER_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = BACKDROP
        background.inputs["Strength"].default_value = 0.25
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene["kyx_scope"] = "phase7_character_visual_refinement_v3"
    scene["kyx_visual_review_source"] = "v1_and_v2_rejected_blocky_shape_like_toy_like"
    scene["kyx_g6_status"] = "not_claimed"
    scene["kyx_runtime_integration"] = "absent"
    scene["kyx_units"] = "meters"
    scene["kyx_forward_axis"] = "-Y"
    scene["kyx_up_axis"] = "+Z"


def set_camera(camera: bpy.types.Object, location: tuple[float, float, float], target: tuple[float, float, float], *, lens: float = 68.0, ortho_scale: float | None = None) -> None:
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
            value = original[0] * 0.2126 + original[1] * 0.7152 + original[2] * 0.0722
            color = (value, value, value, original[3])
        else:
            color = original
        material.diffuse_color = color
        principled.inputs["Base Color"].default_value = color
        emission = principled.inputs.get("Emission Color") or principled.inputs.get("Emission")
        if emission is not None and material.name == "MAT_TealOptic":
            emission.default_value = color


def render_stills(camera: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> tuple[dict[str, float], list[str]]:
    scene = bpy.context.scene
    scene.frame_set(FRAME_BREATHE)
    views = (
        ("close-color", (2.15, -3.65, 2.05), (0.0, -0.35, 1.25), 72.0, None, False),
        ("tactical-color", (3.35, -5.65, 2.45), (0.0, -0.30, 1.02), 68.0, None, False),
        ("front-ortho-color", (0.0, -5.0, 0.95), (0.0, -0.28, 0.95), 68.0, 2.15, False),
        ("side-ortho-color", (4.6, -0.30, 0.95), (0.0, -0.30, 0.95), 68.0, 2.15, False),
        # Stay in front of the studio backdrop; the previous 2.3 m placement
        # put the wall between camera and character and produced a blank plate.
        ("back-ortho-color", (0.0, 1.22, 0.95), (0.0, -0.04, 0.95), 68.0, 2.15, False),
        ("weapon-contact-color", (1.18, -2.35, 1.56), (-0.020, -0.690, 1.405), 92.0, None, False),
        ("trigger-contact-color", (-1.18, -2.28, 1.50), (-0.070, -0.525, 1.350), 96.0, None, False),
        ("close-grayscale", (2.15, -3.65, 2.05), (0.0, -0.35, 1.25), 72.0, None, True),
        ("front-ortho-grayscale", (0.0, -5.0, 0.95), (0.0, -0.28, 0.95), 68.0, 2.15, True),
    )
    timings: dict[str, float] = {}
    paths: list[str] = []
    grayscale_state = False
    for name, location, target, lens, ortho_scale, grayscale in views:
        if grayscale != grayscale_state:
            set_grayscale(materials, grayscale)
            grayscale_state = grayscale
        set_camera(camera, location, target, lens=lens, ortho_scale=ortho_scale)
        path = RENDER_DIR / f"refinement-v3-{name}.png"
        scene.render.filepath = str(path)
        started = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        timings[name] = round(time.perf_counter() - started, 6)
        paths.append(path.relative_to(LANE_DIR).as_posix())
    if grayscale_state:
        set_grayscale(materials, False)
    return timings, paths


def select_export_objects(collection: bpy.types.Collection) -> list[bpy.types.Object]:
    bpy.ops.object.select_all(action="DESELECT")
    objects = list(collection.all_objects)
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


def export_glb(collection: bpy.types.Collection) -> float:
    objects = select_export_objects(collection)
    # Blender 5.1's glTF exporter currently drops rigid BONE-parented meshes
    # when every visible art object uses that relationship.  Detach those
    # objects only for export, retaining their world matrices, then restore the
    # authored .blend hierarchy immediately afterward.  The candidate remains
    # explicitly non-deformation-proof, but its GLB must contain actual art.
    rigid_parents: list[tuple[bpy.types.Object, bpy.types.Object, str, str, object]] = []
    for obj in objects:
        if obj.parent is not None and obj.parent_type == "BONE":
            world_matrix = obj.matrix_world.copy()
            rigid_parents.append((obj, obj.parent, obj.parent_type, obj.parent_bone, world_matrix))
            obj.parent = None
            obj.matrix_world = world_matrix
    select_export_objects(collection)
    started = time.perf_counter()
    try:
        result = bpy.ops.export_scene.gltf(
            filepath=str(GLB_PATH),
            check_existing=False,
            export_format="GLB",
            use_selection=True,
            export_copyright="KYX project-original scripted refinement v3; no third-party art",
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
    finally:
        for obj, parent, parent_type, parent_bone, world_matrix in rigid_parents:
            obj.parent = parent
            obj.parent_type = parent_type
            obj.parent_bone = parent_bone
            obj.matrix_world = world_matrix
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
        raise RuntimeError("Invalid GLB")
    version, declared_length = struct.unpack_from("<II", data, 4)
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError("GLB first chunk is not JSON")
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
        "animationNames": [item.get("name") for item in animations],
        "animationChannels": sum(len(item.get("channels", [])) for item in animations),
        "requiredExtensions": document.get("extensionsRequired", []),
    }


def output_manifest(paths: list[Path]) -> list[dict[str, object]]:
    return [{"path": path.relative_to(LANE_DIR).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)} for path in paths]


def main() -> None:
    started = time.perf_counter()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    reset_scene()
    configure_scene()
    export_collection = make_collection("COLL_RefinementV3_EXPORT")
    presentation_collection = make_collection("COLL_RefinementV3_PRESENTATION")
    materials = {
        "ink": make_material("MAT_Ink", INK, metallic=0.10, roughness=0.52),
        "suit": make_material("MAT_ContinuousSuit", SUIT, roughness=0.91, micro_bump=0.16),
        "suit_raised": make_material("MAT_SuitRaised", SUIT_RAISED, roughness=0.88, micro_bump=0.13),
        "webbing": make_material("MAT_Webbing", WEBBING, roughness=0.86, micro_bump=0.12),
        "armor": make_material("MAT_Armor", ARMOR, metallic=0.08, roughness=0.58, micro_bump=0.03),
        "armor_edge": make_material("MAT_ArmorEdge", ARMOR_EDGE, metallic=0.10, roughness=0.50),
        "oxide": make_material("MAT_Oxide", OXIDE, metallic=0.05, roughness=0.62),
        "teal": make_material("MAT_TealOptic", TEAL, metallic=0.15, roughness=0.28, emission_strength=0.65),
        "metal": make_material("MAT_Gunmetal", METAL, metallic=0.46, roughness=0.40),
        "brass": make_material("MAT_Brass", BRASS, metallic=0.60, roughness=0.36),
        "floor": make_material("MAT_StudioFloor", FLOOR, metallic=0.04, roughness=0.67),
        "backdrop": make_material("MAT_StudioBackdrop", BACKDROP, roughness=0.82),
    }
    armature = build_rig(export_collection)
    body_parts = build_body_and_gear(export_collection, armature, materials)
    weapon_parts = build_rifle(export_collection, armature, materials)
    action = build_animation(armature)
    # Export before presentation objects exist, allowing a complete scene export
    # without relying on Blender's selection/armature hierarchy filtering.
    export_seconds = export_glb(export_collection)
    camera = build_presentation(presentation_collection, materials)
    render_timings, render_paths = render_stills(camera, materials)
    bpy.context.scene.frame_set(FRAME_START)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    backup = Path(f"{BLEND_PATH}1")
    if backup.exists():
        backup.unlink()

    meshes = [obj for obj in export_collection.all_objects if obj.type == "MESH"]
    vertices = sum(len(obj.data.vertices) for obj in meshes)
    polygons = sum(len(obj.data.polygons) for obj in meshes)
    triangles = sum(len(poly.vertices) - 2 for obj in meshes for poly in obj.data.polygons)
    glb_info = inspect_glb(GLB_PATH)
    render_files = [LANE_DIR / item for item in render_paths]
    verification = {
        "glbHeaderValid": glb_info["version"] == 2 and glb_info["declaredBytes"] == GLB_PATH.stat().st_size,
        "glbContainsMeshes": glb_info["meshes"] >= 20,
        "glbContainsMaterials": glb_info["materials"] >= 8,
        "glbContainsAnimation": glb_info["animations"] >= 1,
        "renderCount": len(render_files) == 9 and all(path.is_file() and path.stat().st_size > 10000 for path in render_files),
        "connectedSuitPresent": len([obj for obj in meshes if obj.get("kyx_surface_contract") == "single_connected_skin_subdivision_surface"]) == 1,
        "anatomicalFormsPresent": len([obj for obj in meshes if obj.get("kyx_asset_role") in {"tailored_deltoid_biceps_sleeve", "tailored_elbow_forearm_sleeve", "tailored_quadriceps_trouser", "tailored_knee_calf_trouser"}]) == 8,
        "contactFormsPresent": len([obj for obj in meshes if "contact" in str(obj.get("kyx_asset_role", ""))]) >= 14,
    }
    if not all(verification.values()):
        failed = [name for name, passed in verification.items() if not passed]
        raise RuntimeError(f"Refinement v3 verification failed: {failed}; glb={glb_info}")
    report = {
        "schemaVersion": 1,
        "assetId": "kyx_phase7_character_refinement_v3",
        "status": "VISUAL_REFINEMENT_CANDIDATE_NOT_G6",
        "supersedesForReviewOnly": "phase7-character-refinement-v2 remains preserved and rejected",
        "blenderVersion": bpy.app.version_string,
        "blenderBuildHash": bpy.app.build_hash.decode("utf-8") if isinstance(bpy.app.build_hash, bytes) else str(bpy.app.build_hash),
        "visualIntent": {
            "silhouette": "cohesive medium-poly adult tactical human with realistic 1:8-ish head ratio and modest extremities",
            "connectedSurface": "single connected Skin/Subdivision tailored undersuit from neck through torso arms and legs",
            "layers": ["continuous undersuit", "seams and cloth folds", "conforming vital-area armor", "low-profile webbing", "articulated gloves", "fitted boots", "slender rifle"],
            "contact": ["stock pad intersects right shoulder pocket", "right glove wraps pistol grip", "left glove wraps handguard"],
            "avoidance": ["Roblox", "toy", "mannequin", "block assembly", "capsule assembly", "oversized head hands and boots"],
        },
        "scene": {"forwardAxis": "-Y", "upAxis": "+Z", "units": "meters", "approxCharacterHeightMeters": 1.91, "frames": [FRAME_START, FRAME_END], "fps": FPS, "renderSize": [RENDER_SIZE, RENDER_SIZE]},
        "source": {
            "exportObjects": len(export_collection.all_objects),
            "meshObjects": len(meshes),
            "vertices": vertices,
            "polygons": polygons,
            "triangles": triangles,
            "materials": len({slot.material.name for obj in meshes for slot in obj.material_slots if slot.material}),
            "bones": len(armature.data.bones),
            "actions": [action.name],
            "bodyParts": len(body_parts),
            "weaponParts": len(weapon_parts),
            "connectedSuitObjects": len([obj for obj in meshes if obj.get("kyx_surface_contract") == "single_connected_skin_subdivision_surface"]),
        },
        "glb": {**glb_info, "path": GLB_PATH.relative_to(LANE_DIR).as_posix(), "bytes": GLB_PATH.stat().st_size, "sha256": sha256(GLB_PATH), "exportSeconds": round(export_seconds, 6)},
        "renders": {"paths": render_paths, "timingsSeconds": render_timings, "totalSeconds": round(sum(render_timings.values()), 6)},
        "verification": {"status": "PASS", "checks": verification},
        "selfCritique": {
            "improved": [
                "Authored limb section profiles now establish readable deltoid, biceps, elbow, forearm, quadriceps, knee, and calf transitions.",
                "Rounded profiled boot uppers and soles replace the previous four-corner stacked-block construction.",
                "Helmet shell, forehead layer, visor, cheek interfaces, respirator, chin guard, ear interfaces, neck shroud, and seams now separate into a tactical head assembly.",
                "The rifle has a skeletal stock, split receiver, hollow trigger guard, tapered grip, compact magazine, ventilated handguard, and explicit palm/finger intersections.",
            ],
            "stillWeak": [
                "This remains a stylized medium-poly direction model; hands and facial equipment are not production sculpt quality.",
                "The static cross-chest pose hides some torso layering and makes the dominant-arm silhouette read heavier from front view.",
                "Rigid bone parenting is metadata/pose scaffolding only; skin weights, deformation stress poses, gameplay animation, and first-person arms remain absent.",
                "Procedural flat materials do not prove final texel density, authored wear, outline behavior, or runtime lighting readability.",
            ],
            "decision": "CANDIDATE_ONLY_AWAIT_HUMAN_VISUAL_REVIEW",
        },
        "manifest": output_manifest([GLB_PATH, *render_files]),
        "limitations": [
            "No human visual approval or G6 claim exists; this is a direction candidate.",
            "The connected body is a baked modeled surface parented rigidly for export, not deformation-weight or stress-pose proof.",
            "Only an in-place presentation breathe loop exists; gameplay clips and first-person arms are absent.",
            "No runtime integration, LODs, KTX2, meshopt, outline/contact validation, or multi-character performance evidence exists.",
            "Materials use procedural micro-detail, not authored UV texture sets or production wear passes.",
        ],
        "elapsedSeconds": round(time.perf_counter() - started, 6),
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "glbSha256": report["glb"]["sha256"], "glbBytes": report["glb"]["bytes"], "meshObjects": report["source"]["meshObjects"], "sourceTriangles": report["source"]["triangles"], "renders": len(render_paths), "elapsedSeconds": report["elapsedSeconds"]}, indent=2))


if __name__ == "__main__":
    main()
