"""Build the original KYX Vanguard v5b human-proportion refinement.

This lane is an original clean-room Blender build guided only by the versioned
KYX Vanguard concept sheet.  It deliberately does not read, import, reference,
or derive from ``public/soldier.glb`` or any rejected v2/v3/v4 geometry.

The build prioritizes the two things the preceding procedural candidates did
not prove visually: a continuous adult humanoid garment/anatomy surface and
literal two-hand weapon contact.  The output remains a human-review candidate;
structural export checks never promote G6.

Run from the repository root with Blender 5.1.x::

    blender --background --factory-startup --threads 1 --python \
      assets/source/blender/phase7-character-original-v5b/build_character_original_v5b.py
"""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
import struct
import time

import bpy
from mathutils import Matrix, Vector


SCRIPT_PATH = Path(__file__).resolve()
LANE_DIR = SCRIPT_PATH.parent
OUTPUT_DIR = LANE_DIR / "output"
RENDER_DIR = OUTPUT_DIR / "renders"
BLEND_PATH = OUTPUT_DIR / "kyx_vanguard_original_v5b.blend"
GLB_PATH = OUTPUT_DIR / "kyx_vanguard_original_v5b.glb"
REPORT_PATH = OUTPUT_DIR / "character-original-v5b-report.json"

CONCEPT_REL = "assets/source/characters/kyx-vanguard/concept/kyx-vanguard-model-sheet-v1.png"
CONCEPT_SHA256 = "067a3eba77f9c9e566fe7aeba9684346bfd9fcd162de8ead14194640c0fb76c3"
FPS = 24
FRAME_START = 1
FRAME_CONTACT = 13
FRAME_BREATHE = 16
FRAME_END = 32
RENDER_SIZE = 1080

INK = (0.008, 0.011, 0.018, 1.0)
SUIT = (0.018, 0.026, 0.040, 1.0)
SUIT_RAISED = (0.042, 0.056, 0.072, 1.0)
RUBBER = (0.010, 0.014, 0.020, 1.0)
ARMOR = (0.410, 0.365, 0.300, 1.0)
ARMOR_EDGE = (0.170, 0.160, 0.145, 1.0)
OXIDE = (0.620, 0.070, 0.032, 1.0)
TEAL = (0.020, 0.430, 0.395, 1.0)
METAL = (0.070, 0.082, 0.100, 1.0)
GUNMETAL = (0.030, 0.040, 0.055, 1.0)
FLOOR = (0.012, 0.017, 0.025, 1.0)
BACKDROP = (0.028, 0.038, 0.052, 1.0)

# Character faces -Y.  X is character-left/right and Z is up.
JOINTS: dict[str, tuple[float, float, float]] = {
    "pelvis": (0.0, 0.0, 0.96),
    "spine": (0.0, 0.0, 1.13),
    "chest": (0.0, -0.005, 1.39),
    "neck": (0.0, -0.006, 1.59),
    "head": (0.0, -0.010, 1.77),
    "hip.L": (0.11, 0.005, 0.96),
    "knee.L": (0.145, -0.032, 0.57),
    "ankle.L": (0.165, -0.012, 0.17),
    "toe.L": (0.165, -0.235, 0.075),
    "hip.R": (-0.11, 0.005, 0.96),
    "knee.R": (-0.145, 0.040, 0.57),
    "ankle.R": (-0.165, 0.025, 0.17),
    "toe.R": (-0.165, -0.190, 0.075),
    "shoulder.L": (0.255, -0.010, 1.49),
    "elbow.L": (0.425, -0.205, 1.245),
    "wrist.L": (0.328, -0.584, 1.255),
    "hand.L": (0.375, -0.609, 1.214),
    "shoulder.R": (-0.255, -0.010, 1.49),
    "elbow.R": (-0.410, -0.165, 1.255),
    "wrist.R": (-0.028, -0.409, 1.262),
    "hand.R": (0.035, -0.442, 1.207),
}


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
    roughness: float = 0.62,
    micro_weave: float = 0.0,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    material["kyx_original_material"] = True
    material["kyx_palette_role"] = name.removeprefix("MAT_").lower()
    material["kyx_original_color"] = list(color)
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = color
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    if micro_weave > 0.0:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.name = f"AUTH_{name}_MicroWeave"
        noise.inputs["Scale"].default_value = 145.0
        noise.inputs["Detail"].default_value = 2.3
        noise.inputs["Roughness"].default_value = 0.68
        bump = nodes.new("ShaderNodeBump")
        bump.name = f"AUTH_{name}_MicroNormal"
        bump.inputs["Strength"].default_value = micro_weave
        bump.inputs["Distance"].default_value = 0.004
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
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def mark(obj: bpy.types.Object, role: str, level: str = "secondary") -> bpy.types.Object:
    obj["kyx_original_geometry"] = True
    obj["kyx_asset_role"] = role
    obj["kyx_form_level"] = level
    obj["kyx_source_lane"] = "phase7-character-original-v5"
    return obj


def apply_modifier(obj: bpy.types.Object, modifier: bpy.types.Modifier) -> None:
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def bevel(obj: bpy.types.Object, width: float, segments: int = 3) -> None:
    if obj.type != "MESH" or width <= 0.0:
        return
    modifier = obj.modifiers.new("AUTH_EdgeSoftening", "BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    apply_modifier(obj, modifier)


def parent_to_bone(obj: bpy.types.Object, armature: bpy.types.Object, bone_name: str) -> None:
    world_matrix = obj.matrix_world.copy()
    obj.parent = armature
    obj.parent_type = "BONE"
    obj.parent_bone = bone_name
    obj.matrix_world = world_matrix
    obj["kyx_parent_bone"] = bone_name


def add_uv_ellipsoid(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    rotation_quaternion=None,
    segments: int = 36,
    rings: int = 24,
    role: str = "anatomical_form",
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments,
        ring_count=rings,
        location=location,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    if rotation_quaternion is not None:
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = rotation_quaternion
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    move_to_collection(obj, collection)
    assign_material(obj, material)
    smooth_mesh(obj)
    return mark(obj, role)


def add_segment_ellipsoid(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    width: float,
    depth: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    overlap: float = 0.05,
    role: str = "anatomical_limb",
) -> bpy.types.Object:
    a, b = Vector(start), Vector(end)
    direction = b - a
    quaternion = direction.to_track_quat("Z", "Y")
    return add_uv_ellipsoid(
        name,
        tuple((a + b) * 0.5),
        (width, depth, direction.length * 0.5 + overlap),
        material,
        collection,
        rotation_quaternion=quaternion,
        role=role,
    )


def add_curve_tube(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    cyclic: bool = False,
    role: str = "construction_detail",
    resolution: int = 3,
) -> bpy.types.Object:
    data = bpy.data.curves.new(f"CURVEDATA_{name}", "CURVE")
    data.dimensions = "3D"
    data.resolution_u = resolution
    data.bevel_depth = radius
    data.bevel_resolution = 3
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, value in zip(spline.bezier_points, points):
        point.co = value
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    assign_material(obj, material)
    return mark(obj, role, "tertiary")


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
    bevel_width: float = 0.0,
    role: str = "hard_surface_detail",
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
    if bevel_width:
        bevel(obj, bevel_width, 3)
    smooth_mesh(obj)
    return mark(obj, role)


def add_rounded_box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel_width: float = 0.01,
    role: str = "hard_surface_detail",
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    move_to_collection(obj, collection)
    assign_material(obj, material)
    bevel(obj, bevel_width, 4)
    return mark(obj, role)


def mesh_object(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    role: str,
    *,
    bevel_width: float = 0.0,
    smooth: bool = False,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"MESHDATA_{name}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    assign_material(obj, material)
    if bevel_width:
        bevel(obj, bevel_width, 3)
    if smooth:
        smooth_mesh(obj)
    return mark(obj, role)


def make_prism_profile(
    name: str,
    profile_xz: tuple[tuple[float, float], ...],
    half_depth: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    role: str,
    *,
    transform: Matrix | None = None,
    bevel_width: float = 0.0,
) -> bpy.types.Object:
    vertices = [(x, -half_depth, z) for x, z in profile_xz]
    vertices += [(x, half_depth, z) for x, z in profile_xz]
    count = len(profile_xz)
    faces: list[tuple[int, ...]] = [
        tuple(reversed(tuple(range(count)))),
        tuple(count + index for index in range(count)),
    ]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    obj = mesh_object(name, vertices, faces, material, collection, role, bevel_width=bevel_width)
    if transform is not None:
        obj.matrix_world = transform
    return obj


def add_shell_patch(
    name: str,
    center: tuple[float, float, float],
    rows: tuple[tuple[float, float, float], ...],
    depth: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    front: bool = True,
    columns: int = 11,
    bow: float = 0.035,
    bevel_width: float = 0.008,
    role: str = "constructed_armor_shell",
) -> bpy.types.Object:
    """Build a tapered, curved torso/limb plate from authored width rows.

    Each row is ``(z_offset, half_width, y_offset)``.  Front plates face -Y.
    """
    cx, cy, cz = center
    sign = -1.0 if front else 1.0
    vertices: list[tuple[float, float, float]] = []
    for inner in (False, True):
        surface_offset = depth if inner else 0.0
        for z_offset, half_width, y_offset in rows:
            for column in range(columns):
                u = -1.0 + 2.0 * column / (columns - 1)
                crown = bow * (1.0 - u * u)
                y = cy + sign * (y_offset + crown - surface_offset)
                vertices.append((cx + u * half_width, y, cz + z_offset))
    surface = len(rows) * columns
    faces: list[tuple[int, ...]] = []
    for layer in (0, 1):
        offset = layer * surface
        for row in range(len(rows) - 1):
            for column in range(columns - 1):
                a = offset + row * columns + column
                face = (a, a + 1, a + 1 + columns, a + columns)
                faces.append(face if layer == 0 else tuple(reversed(face)))
    for row in range(len(rows) - 1):
        left = row * columns
        right = left + columns - 1
        faces.extend([
            (left, left + columns, surface + left + columns, surface + left),
            (right, surface + right, surface + right + columns, right + columns),
        ])
    for column in range(columns - 1):
        faces.append((column, surface + column, surface + column + 1, column + 1))
        top = (len(rows) - 1) * columns + column
        faces.append((top, top + 1, surface + top + 1, surface + top))
    return mesh_object(
        name,
        vertices,
        faces,
        material,
        collection,
        role,
        bevel_width=bevel_width,
        smooth=True,
    )


def add_ellipsoid_patch(
    name: str,
    center: tuple[float, float, float],
    radii: tuple[float, float, float],
    theta_range: tuple[float, float],
    latitude_range: tuple[float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    theta_steps: int = 18,
    latitude_steps: int = 7,
    thickness: float = 0.012,
    role: str = "helmet_shell",
) -> bpy.types.Object:
    """Create a closed ellipsoid shell patch with literal thickness."""
    cx, cy, cz = center
    rx, ry, rz = radii
    vertices: list[tuple[float, float, float]] = []
    for inset in (0.0, -thickness):
        for latitude_index in range(latitude_steps):
            v = latitude_index / (latitude_steps - 1)
            latitude = latitude_range[0] + (latitude_range[1] - latitude_range[0]) * v
            for theta_index in range(theta_steps):
                u = theta_index / (theta_steps - 1)
                theta = theta_range[0] + (theta_range[1] - theta_range[0]) * u
                radial = math.cos(latitude)
                x = cx + (rx + inset) * radial * math.cos(theta)
                y = cy + (ry + inset) * radial * math.sin(theta)
                z = cz + (rz + inset) * math.sin(latitude)
                vertices.append((x, y, z))
    surface = theta_steps * latitude_steps
    faces: list[tuple[int, ...]] = []
    for layer in (0, 1):
        offset = layer * surface
        for lat in range(latitude_steps - 1):
            for theta in range(theta_steps - 1):
                a = offset + lat * theta_steps + theta
                face = (a, a + 1, a + 1 + theta_steps, a + theta_steps)
                faces.append(face if layer == 0 else tuple(reversed(face)))
    for theta in range(theta_steps - 1):
        faces.append((theta, surface + theta, surface + theta + 1, theta + 1))
        top = (latitude_steps - 1) * theta_steps + theta
        faces.append((top, top + 1, surface + top + 1, surface + top))
    for lat in range(latitude_steps - 1):
        left = lat * theta_steps
        right = left + theta_steps - 1
        faces.extend([
            (left, left + theta_steps, surface + left + theta_steps, surface + left),
            (right, surface + right, surface + right + theta_steps, right + theta_steps),
        ])
    return mesh_object(name, vertices, faces, material, collection, role, bevel_width=0.003, smooth=True)


def add_profiled_boot(
    name: str,
    x_center: float,
    y_shift: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    sole: bool,
) -> bpy.types.Object:
    """Build a rounded heel/instep/toe surface with a non-box silhouette."""
    if sole:
        sections = (
            (0.095, 0.064, 0.018, 0.048),
            (0.045, 0.070, 0.015, 0.050),
            (-0.035, 0.076, 0.014, 0.049),
            (-0.120, 0.082, 0.014, 0.046),
            (-0.210, 0.080, 0.016, 0.043),
            (-0.275, 0.064, 0.020, 0.039),
        )
    else:
        sections = (
            (0.105, 0.057, 0.042, 0.220),
            (0.055, 0.062, 0.040, 0.212),
            (-0.005, 0.067, 0.038, 0.180),
            (-0.072, 0.073, 0.036, 0.135),
            (-0.150, 0.078, 0.035, 0.103),
            (-0.225, 0.076, 0.036, 0.086),
            (-0.270, 0.060, 0.039, 0.071),
        )
    points = 20
    vertices: list[tuple[float, float, float]] = []
    for y, half_width, bottom, top in sections:
        center_z = (bottom + top) * 0.5
        half_height = (top - bottom) * 0.5
        for index in range(points):
            angle = math.tau * index / points
            cosine = math.cos(angle)
            lateral = math.copysign(abs(cosine) ** 0.76, cosine)
            vertical = math.sin(angle)
            vertices.append((x_center + lateral * half_width, y + y_shift, center_z + vertical * half_height))
    faces: list[tuple[int, ...]] = []
    for section in range(len(sections) - 1):
        a = section * points
        b = (section + 1) * points
        for index in range(points):
            nxt = (index + 1) % points
            faces.append((a + index, a + nxt, b + nxt, b + index))
    faces.extend([
        tuple(reversed(tuple(range(points)))),
        tuple((len(sections) - 1) * points + index for index in range(points)),
    ])
    return mesh_object(
        name,
        vertices,
        faces,
        material,
        collection,
        "boot_sole" if sole else "articulated_boot_upper",
        smooth=True,
    )


def quaternion_from_basis(x_axis: Vector, y_axis: Vector, z_axis: Vector):
    matrix = Matrix((x_axis, y_axis, z_axis)).transposed().to_4x4()
    return matrix.to_quaternion()


def rifle_frame(origin: Vector, muzzle: Vector) -> tuple[Matrix, Vector, Vector, Vector]:
    x_axis = (muzzle - origin).normalized()
    z_hint = Vector((0.0, 0.0, 1.0))
    y_axis = z_hint.cross(x_axis).normalized()
    z_axis = x_axis.cross(y_axis).normalized()
    matrix = Matrix((
        (x_axis.x, y_axis.x, z_axis.x, origin.x),
        (x_axis.y, y_axis.y, z_axis.y, origin.y),
        (x_axis.z, y_axis.z, z_axis.z, origin.z),
        (0.0, 0.0, 0.0, 1.0),
    ))
    return matrix, x_axis, y_axis, z_axis


def world_from_local(matrix: Matrix, point: tuple[float, float, float]) -> Vector:
    return matrix @ Vector(point)


def add_limb_shell(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius_start: tuple[float, float],
    radius_end: tuple[float, float],
    angle_range: tuple[float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    axial_steps: int = 7,
    radial_steps: int = 13,
    thickness: float = 0.010,
    role: str = "limb_armor_shell",
) -> bpy.types.Object:
    """Create a curved, tapered bracer/greave with open garment-facing seam."""
    a, b = Vector(start), Vector(end)
    axis = b - a
    longitudinal = axis.normalized()
    reference = Vector((0.0, 0.0, 1.0))
    if abs(longitudinal.dot(reference)) > 0.90:
        reference = Vector((0.0, -1.0, 0.0))
    side = longitudinal.cross(reference).normalized()
    depth = side.cross(longitudinal).normalized()
    # Keep the zero-angle direction toward character front (-Y) when possible.
    if depth.dot(Vector((0.0, -1.0, 0.0))) < 0.0:
        side.negate()
        depth.negate()
    vertices: list[tuple[float, float, float]] = []
    for inset in (0.0, -thickness):
        for axial_index in range(axial_steps):
            t = axial_index / (axial_steps - 1)
            center = a.lerp(b, t)
            lateral = (1.0 - t) * radius_start[0] + t * radius_end[0] + inset
            forward = (1.0 - t) * radius_start[1] + t * radius_end[1] + inset
            # A subtle waist prevents a uniformly extruded tube reading.
            waist = 1.0 - 0.07 * math.sin(math.pi * t)
            for radial_index in range(radial_steps):
                u = radial_index / (radial_steps - 1)
                angle = angle_range[0] + (angle_range[1] - angle_range[0]) * u
                point = center + side * (math.sin(angle) * lateral * waist) + depth * (math.cos(angle) * forward * waist)
                vertices.append(tuple(point))
    surface = axial_steps * radial_steps
    faces: list[tuple[int, ...]] = []
    for layer in (0, 1):
        offset = layer * surface
        for axial in range(axial_steps - 1):
            for radial in range(radial_steps - 1):
                index = offset + axial * radial_steps + radial
                face = (index, index + 1, index + 1 + radial_steps, index + radial_steps)
                faces.append(face if layer == 0 else tuple(reversed(face)))
    for radial in range(radial_steps - 1):
        faces.append((radial, surface + radial, surface + radial + 1, radial + 1))
        tip = (axial_steps - 1) * radial_steps + radial
        faces.append((tip, tip + 1, surface + tip + 1, surface + tip))
    for axial in range(axial_steps - 1):
        left = axial * radial_steps
        right = left + radial_steps - 1
        faces.extend([
            (left, left + radial_steps, surface + left + radial_steps, surface + left),
            (right, surface + right, surface + right + radial_steps, right + radial_steps),
        ])
    return mesh_object(name, vertices, faces, material, collection, role, bevel_width=0.004, smooth=True)


def add_cowl(
    name: str,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    """Model a draped neck cowl with asymmetry and a pointed back fall."""
    rings = (
        # z, center_y, lateral radius, depth radius, front drop
        (1.515, 0.015, 0.235, 0.170, 0.000),
        (1.555, -0.010, 0.205, 0.145, 0.010),
        (1.605, 0.000, 0.145, 0.120, 0.000),
    )
    points = 32
    vertices: list[tuple[float, float, float]] = []
    for ring_index, (z, center_y, lateral, depth, front_drop) in enumerate(rings):
        for index in range(points):
            angle = math.tau * index / points
            x = math.cos(angle) * lateral
            y = center_y + math.sin(angle) * depth
            local_z = z
            # Front is -Y; drop the front edge into scarf folds and bias left.
            frontness = max(0.0, -math.sin(angle))
            local_z -= front_drop * frontness
            if ring_index == 0 and frontness > 0.45:
                local_z -= 0.035 * frontness * (0.75 + 0.25 * math.cos(angle))
            if ring_index == 0 and y > 0.08:
                local_z -= 0.070 * ((y - 0.08) / max(0.01, depth - 0.08))
            vertices.append((x, y, local_z))
    faces: list[tuple[int, ...]] = []
    for ring in range(len(rings) - 1):
        a = ring * points
        b = (ring + 1) * points
        for index in range(points):
            following = (index + 1) % points
            faces.append((a + index, a + following, b + following, b + index))
    return mesh_object(name, vertices, faces, material, collection, "draped_neck_cowl", smooth=True)


def add_torus_scaled(
    name: str,
    location: tuple[float, float, float],
    major_radius: float,
    minor_radius: float,
    scale: tuple[float, float, float],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    role: str,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_segments=40,
        minor_segments=10,
        location=location,
        major_radius=major_radius,
        minor_radius=minor_radius,
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    move_to_collection(obj, collection)
    assign_material(obj, material)
    smooth_mesh(obj)
    return mark(obj, role, "tertiary")


def build_rig(export_collection: bpy.types.Collection) -> bpy.types.Object:
    data = bpy.data.armatures.new("RIGDATA_KYX_Vanguard_OriginalV5")
    armature = bpy.data.objects.new("RIG_KYX_Vanguard_OriginalV5", data)
    export_collection.objects.link(armature)
    armature.show_in_front = True
    armature["kyx_asset_role"] = "original_v5_deformation_rig"
    armature["kyx_original_source"] = True
    armature["kyx_root_motion_policy"] = "in_place"

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
        item = data.edit_bones.new(name)
        item.head = head
        item.tail = tail
        item.use_deform = deform
        if parent:
            item.parent = data.edit_bones[parent]

    bone("root", (0.0, 0.0, 0.0), (0.0, 0.0, 0.18), deform=False)
    bone("pelvis", (0.0, 0.0, 0.88), JOINTS["spine"], "root")
    bone("spine", JOINTS["spine"], JOINTS["chest"], "pelvis")
    bone("chest", JOINTS["chest"], JOINTS["neck"], "spine")
    bone("neck", JOINTS["neck"], JOINTS["head"], "chest")
    bone("head", JOINTS["head"], (0.0, -0.010, 1.91), "neck")

    for side in ("L", "R"):
        bone(f"thigh.{side}", JOINTS[f"hip.{side}"], JOINTS[f"knee.{side}"], "pelvis")
        bone(f"shin.{side}", JOINTS[f"knee.{side}"], JOINTS[f"ankle.{side}"], f"thigh.{side}")
        bone(f"foot.{side}", JOINTS[f"ankle.{side}"], JOINTS[f"toe.{side}"], f"shin.{side}")
        toe_end = Vector(JOINTS[f"toe.{side}"]) + Vector((0.0, -0.10, 0.0))
        bone(f"toe.{side}", JOINTS[f"toe.{side}"], tuple(toe_end), f"foot.{side}")
        clavicle_head = Vector(JOINTS["chest"]) + Vector((0.0, 0.0, 0.08))
        bone(f"clavicle.{side}", tuple(clavicle_head), JOINTS[f"shoulder.{side}"], "chest")
        bone(f"upper_arm.{side}", JOINTS[f"shoulder.{side}"], JOINTS[f"elbow.{side}"], f"clavicle.{side}")
        bone(f"forearm.{side}", JOINTS[f"elbow.{side}"], JOINTS[f"wrist.{side}"], f"upper_arm.{side}")
        bone(f"hand.{side}", JOINTS[f"wrist.{side}"], JOINTS[f"hand.{side}"], f"forearm.{side}")

    bpy.ops.object.mode_set(mode="OBJECT")
    armature.select_set(False)
    return armature


def add_horizontal_loft(
    name: str,
    sections: tuple[tuple[float, float, float, float, float], ...],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    sides: int = 40,
) -> bpy.types.Object:
    """Create a tailored torso from authored horizontal garment sections."""
    vertices: list[tuple[float, float, float]] = []
    for cx, cy, z, lateral_radius, depth_radius in sections:
        for index in range(sides):
            angle = math.tau * index / sides
            cosine = math.cos(angle)
            # A mild superellipse gives the ribcage/pelvis broad anatomical
            # planes without returning to a box or an inflated sphere.
            lateral = math.copysign(abs(cosine) ** 0.88, cosine)
            depth = math.sin(angle)
            vertices.append((cx + lateral * lateral_radius, cy + depth * depth_radius, z))
    faces: list[tuple[int, ...]] = []
    for section in range(len(sections) - 1):
        a = section * sides
        b = (section + 1) * sides
        for index in range(sides):
            following = (index + 1) % sides
            faces.append((a + index, a + following, b + following, b + index))
    faces.extend([
        tuple(reversed(tuple(range(sides)))),
        tuple((len(sections) - 1) * sides + index for index in range(sides)),
    ])
    return mesh_object(name, vertices, faces, material, collection, "tailored_sectional_torso", smooth=True)


def add_anatomical_sweep(
    name: str,
    sections: tuple[tuple[float, float, float, float, float], ...],
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    *,
    sides: int = 32,
    role: str = "sectional_anatomical_garment",
) -> bpy.types.Object:
    centers = [Vector(section[:3]) for section in sections]
    vertices: list[tuple[float, float, float]] = []
    previous_side: Vector | None = None
    for index, (center, section) in enumerate(zip(centers, sections)):
        if index == 0:
            tangent = centers[1] - center
        elif index == len(centers) - 1:
            tangent = center - centers[index - 1]
        else:
            tangent = centers[index + 1] - centers[index - 1]
        longitudinal = tangent.normalized()
        reference = Vector((0.0, 0.0, 1.0))
        if abs(longitudinal.dot(reference)) > 0.90:
            reference = Vector((0.0, -1.0, 0.0))
        side = longitudinal.cross(reference).normalized()
        depth = side.cross(longitudinal).normalized()
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
        a = section_index * sides
        b = (section_index + 1) * sides
        for ring_index in range(sides):
            following = (ring_index + 1) % sides
            faces.append((a + ring_index, a + following, b + following, b + ring_index))
    faces.extend([
        tuple(reversed(tuple(range(sides)))),
        tuple((len(sections) - 1) * sides + index for index in range(sides)),
    ])
    return mesh_object(name, vertices, faces, material, collection, role, smooth=True)


def build_unified_body(
    export_collection: bpy.types.Collection,
    suit_material: bpy.types.Material,
) -> bpy.types.Object:
    parts: list[bpy.types.Object] = []
    torso_sections = (
        (0.0, 0.012, 0.850, 0.145, 0.105),
        (0.0, 0.010, 0.905, 0.185, 0.125),
        (0.0, 0.005, 0.980, 0.198, 0.132),
        (0.0, 0.000, 1.060, 0.168, 0.112),
        (0.0, -0.004, 1.150, 0.172, 0.115),
        (0.0, -0.010, 1.265, 0.205, 0.132),
        (0.0, -0.014, 1.375, 0.252, 0.148),
        (0.0, -0.010, 1.465, 0.270, 0.145),
        (0.0, -0.004, 1.520, 0.205, 0.118),
        (0.0, -0.004, 1.565, 0.112, 0.098),
    )
    parts.append(add_horizontal_loft("BODY_TailoredTorso", torso_sections, suit_material, export_collection))
    neck_sections = (
        (0.0, -0.005, 1.525, 0.098, 0.090),
        (0.0, -0.006, 1.585, 0.092, 0.086),
        (0.0, -0.008, 1.635, 0.088, 0.083),
    )
    parts.append(add_horizontal_loft("BODY_NeckSealVolume", neck_sections, suit_material, export_collection, sides=32))
    parts.append(add_uv_ellipsoid("BODY_HeadUnderseal", (0.0, -0.010, 1.765), (0.105, 0.095, 0.145), suit_material, export_collection, segments=32, rings=20, role="helmet_underseal_head"))

    for side in ("L", "R"):
        shoulder = Vector(JOINTS[f"shoulder.{side}"])
        elbow = Vector(JOINTS[f"elbow.{side}"])
        wrist = Vector(JOINTS[f"wrist.{side}"])
        upper = elbow - shoulder
        lower = wrist - elbow
        arm_sections = (
            (*shoulder, 0.105, 0.095),
            (*tuple(shoulder + upper * 0.18), 0.098, 0.087),
            (*tuple(shoulder + upper * 0.48), 0.086, 0.076),
            (*tuple(shoulder + upper * 0.78), 0.074, 0.066),
            (*elbow, 0.064, 0.058),
            (*tuple(elbow + lower * 0.22), 0.073, 0.064),
            (*tuple(elbow + lower * 0.48), 0.080, 0.068),
            (*tuple(elbow + lower * 0.74), 0.068, 0.057),
            (*wrist, 0.052, 0.047),
        )
        parts.append(add_anatomical_sweep(f"BODY_Arm_{side}_TailoredSleeve", arm_sections, suit_material, export_collection, role="tailored_arm_sleeve"))

        hip = Vector(JOINTS[f"hip.{side}"])
        knee = Vector(JOINTS[f"knee.{side}"])
        ankle = Vector(JOINTS[f"ankle.{side}"])
        thigh = knee - hip
        shin = ankle - knee
        leg_sections = (
            (*hip, 0.118, 0.108),
            (*tuple(hip + thigh * 0.15), 0.126, 0.112),
            (*tuple(hip + thigh * 0.38), 0.120, 0.105),
            (*tuple(hip + thigh * 0.70), 0.100, 0.090),
            (*tuple(hip + thigh * 0.90), 0.086, 0.080),
            (*knee, 0.088, 0.080),
            (*tuple(knee + shin * 0.18), 0.094, 0.083),
            (*tuple(knee + shin * 0.42), 0.101, 0.087),
            (*tuple(knee + shin * 0.68), 0.088, 0.075),
            (*tuple(knee + shin * 0.88), 0.068, 0.060),
            (*ankle, 0.060, 0.054),
        )
        parts.append(add_anatomical_sweep(f"BODY_Leg_{side}_TailoredTrouser", leg_sections, suit_material, export_collection, role="tailored_leg_garment"))

    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = "CHR_KYX_Vanguard_ContinuousUndersuit"
    smooth_mesh(body)
    mark(body, "section_lofted_skinned_technical_undersuit", "primary")
    body["kyx_surface_method"] = "authored_tailored_torso_and_anatomical_section_lofts_no_voxel_inflation"
    body["kyx_visual_requirement"] = "lean_adult_anatomy_with_joint_pinches_and_garment_taper"
    return body


def _distance_to_segment(point: Vector, start: Vector, end: Vector) -> float:
    line = end - start
    t = max(0.0, min(1.0, (point - start).dot(line) / max(1e-9, line.length_squared)))
    return (point - (start + line * t)).length


def skin_body(body: bpy.types.Object, armature: bpy.types.Object) -> dict[str, int]:
    segments: dict[str, tuple[Vector, Vector]] = {
        "pelvis": (Vector((0.0, 0.0, 0.86)), Vector(JOINTS["spine"])),
        "spine": (Vector(JOINTS["spine"]), Vector(JOINTS["chest"])),
        "chest": (Vector(JOINTS["chest"]), Vector(JOINTS["neck"])),
        "neck": (Vector(JOINTS["neck"]), Vector(JOINTS["head"])),
        "head": (Vector(JOINTS["head"]), Vector((0.0, -0.01, 1.93))),
    }
    for side in ("L", "R"):
        segments[f"thigh.{side}"] = (Vector(JOINTS[f"hip.{side}"]), Vector(JOINTS[f"knee.{side}"]))
        segments[f"shin.{side}"] = (Vector(JOINTS[f"knee.{side}"]), Vector(JOINTS[f"ankle.{side}"]))
        segments[f"upper_arm.{side}"] = (Vector(JOINTS[f"shoulder.{side}"]), Vector(JOINTS[f"elbow.{side}"]))
        segments[f"forearm.{side}"] = (Vector(JOINTS[f"elbow.{side}"]), Vector(JOINTS[f"wrist.{side}"]))

    groups = {name: body.vertex_groups.new(name=name) for name in segments}
    counts = {name: 0 for name in segments}
    for vertex in body.data.vertices:
        point = body.matrix_world @ vertex.co
        if point.z < 0.91:
            side = "L" if point.x >= 0.0 else "R"
            candidate_names = [f"thigh.{side}", f"shin.{side}", "pelvis"]
        elif point.z > 1.56 and abs(point.x) < 0.17:
            candidate_names = ["neck", "head", "chest"]
        else:
            arm_candidates = ["upper_arm.L", "forearm.L", "upper_arm.R", "forearm.R"]
            arm_distances = {name: _distance_to_segment(point, *segments[name]) for name in arm_candidates}
            nearest_arm = min(arm_distances, key=arm_distances.get)
            if arm_distances[nearest_arm] < 0.145:
                candidate_names = [nearest_arm, "chest"]
            else:
                candidate_names = ["pelvis", "spine", "chest", "neck"]
        ranked = sorted(candidate_names, key=lambda name: _distance_to_segment(point, *segments[name]))
        primary = ranked[0]
        groups[primary].add([vertex.index], 1.0, "REPLACE")
        counts[primary] += 1

    modifier = body.modifiers.new("ARMATURE_KYX_OriginalV5", "ARMATURE")
    modifier.object = armature
    body.parent = armature
    body["kyx_skinning_method"] = "authored_region_nearest_segment_rigid_weights"
    body["kyx_deformation_status"] = "structurally_skinned_visual_motion_review_required"
    return counts


def build_armor_and_gear(
    export_collection: bpy.types.Collection,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> dict[str, list[bpy.types.Object]]:
    armor = materials["armor"]
    armor_edge = materials["armor_edge"]
    suit_raised = materials["suit_raised"]
    rubber = materials["rubber"]
    oxide = materials["oxide"]
    teal = materials["teal"]
    pieces: dict[str, list[bpy.types.Object]] = {"torso": [], "limbs": [], "helmet": [], "boots": [], "details": []}

    chest = add_shell_patch(
        "ARMOR_Chest_CeramicShell",
        (0.0, -0.135, 1.39),
        ((-0.145, 0.145, 0.008), (-0.085, 0.205, 0.006), (0.015, 0.225, 0.004), (0.105, 0.185, 0.003), (0.150, 0.105, 0.002)),
        0.014,
        armor,
        export_collection,
        front=True,
        bow=0.020,
    )
    chest["kyx_construction"] = "curved_five_row_ceramic_sternum_shell"
    parent_to_bone(chest, armature, "chest")
    pieces["torso"].append(chest)

    back = add_shell_patch(
        "ARMOR_Back_InterlockingShell",
        (0.0, 0.132, 1.38),
        ((-0.145, 0.170, 0.010), (-0.075, 0.235, 0.008), (0.035, 0.255, 0.006), (0.140, 0.190, 0.003)),
        0.017,
        armor_edge,
        export_collection,
        front=False,
        bow=0.025,
    )
    parent_to_bone(back, armature, "chest")
    pieces["torso"].append(back)

    for side, sign in (("L", 1.0), ("R", -1.0)):
        abdomen = add_shell_patch(
            f"ARMOR_AbdomenFloating_{side}",
            (sign * 0.115, -0.122, 1.195),
            ((-0.075, 0.068, 0.003), (0.000, 0.087, 0.002), (0.075, 0.073, 0.002)),
            0.012,
            armor_edge,
            export_collection,
            front=True,
            columns=7,
            bow=0.012,
            bevel_width=0.005,
            role="floating_abdomen_shell",
        )
        parent_to_bone(abdomen, armature, "spine")
        pieces["torso"].append(abdomen)

    # The left shell is deliberately larger and pointed, producing the concept
    # sheet's one major asymmetry without decorative greeble density.
    shoulder_l = add_ellipsoid_patch(
        "ARMOR_Shoulder_Left_AsymmetricPauldron",
        (0.255, -0.005, 1.49),
        (0.150, 0.140, 0.138),
        (-1.80, 0.58),
        (-0.10, 0.98),
        armor,
        export_collection,
        theta_steps=18,
        latitude_steps=7,
        thickness=0.014,
        role="asymmetric_shoulder_shell",
    )
    parent_to_bone(shoulder_l, armature, "upper_arm.L")
    pieces["limbs"].append(shoulder_l)
    shoulder_r = add_ellipsoid_patch(
        "ARMOR_Shoulder_Right_CompactPauldron",
        (-0.255, -0.005, 1.49),
        (0.132, 0.125, 0.125),
        (-3.72, -1.34),
        (-0.08, 0.92),
        armor_edge,
        export_collection,
        theta_steps=18,
        latitude_steps=7,
        thickness=0.013,
        role="compact_shoulder_shell",
    )
    parent_to_bone(shoulder_r, armature, "upper_arm.R")
    pieces["limbs"].append(shoulder_r)

    # Oxide ribbon is a separately constructed inset, not a recolored whole shell.
    oxide_ribbon = add_curve_tube(
        "ACCENT_LeftShoulder_OxideInset",
        [(0.145, -0.152, 1.535), (0.235, -0.175, 1.570), (0.350, -0.125, 1.535)],
        0.010,
        oxide,
        export_collection,
        role="asymmetric_oxide_identity_ribbon",
    )
    parent_to_bone(oxide_ribbon, armature, "upper_arm.L")
    pieces["details"].append(oxide_ribbon)

    for side in ("L", "R"):
        forearm_start = Vector(JOINTS[f"elbow.{side}"]).lerp(Vector(JOINTS[f"wrist.{side}"]), 0.22)
        forearm_end = Vector(JOINTS[f"elbow.{side}"]).lerp(Vector(JOINTS[f"wrist.{side}"]), 0.82)
        bracer = add_limb_shell(
            f"ARMOR_Forearm_{side}_OpenSeamBracer",
            tuple(forearm_start),
            tuple(forearm_end),
            (0.098, 0.090),
            (0.079, 0.070),
            (-1.15, 1.15),
            armor if side == "L" else armor_edge,
            export_collection,
            axial_steps=7,
            radial_steps=13,
            thickness=0.010,
        )
        parent_to_bone(bracer, armature, f"forearm.{side}")
        pieces["limbs"].append(bracer)
        if side == "L":
            device_center = forearm_start.lerp(forearm_end, 0.58) + Vector((0.020, -0.060, 0.030))
            device = add_uv_ellipsoid(
                "DEVICE_LeftForearm_CompactSystem",
                tuple(device_center),
                (0.047, 0.018, 0.070),
                armor_edge,
                export_collection,
                segments=24,
                rings=14,
                role="compact_forearm_device",
            )
            parent_to_bone(device, armature, "forearm.L")
            pieces["details"].append(device)
            light = add_uv_ellipsoid(
                "DEVICE_LeftForearm_StatusLight",
                tuple(device_center + Vector((0.0, -0.019, 0.015))),
                (0.012, 0.006, 0.026),
                teal,
                export_collection,
                segments=18,
                rings=10,
                role="system_status_light",
            )
            parent_to_bone(light, armature, "forearm.L")
            pieces["details"].append(light)

        knee = JOINTS[f"knee.{side}"]
        knee_plate = add_shell_patch(
            f"ARMOR_Knee_{side}_ArticulatedCap",
            (knee[0], knee[1] - 0.085, knee[2]),
            ((-0.095, 0.062, 0.002), (-0.030, 0.092, 0.004), (0.045, 0.096, 0.004), (0.105, 0.055, 0.002)),
            0.014,
            armor,
            export_collection,
            front=True,
            columns=9,
            bow=0.018,
            bevel_width=0.006,
            role="articulated_knee_cap",
        )
        parent_to_bone(knee_plate, armature, f"shin.{side}")
        pieces["limbs"].append(knee_plate)
        shin_start = Vector(JOINTS[f"knee.{side}"]).lerp(Vector(JOINTS[f"ankle.{side}"]), 0.20)
        shin_end = Vector(JOINTS[f"knee.{side}"]).lerp(Vector(JOINTS[f"ankle.{side}"]), 0.84)
        greave = add_limb_shell(
            f"ARMOR_Shin_{side}_TaperedGreave",
            tuple(shin_start),
            tuple(shin_end),
            (0.105, 0.092),
            (0.077, 0.065),
            (-0.95, 0.95),
            armor,
            export_collection,
            axial_steps=8,
            radial_steps=13,
            thickness=0.011,
            role="tapered_shin_greave",
        )
        parent_to_bone(greave, armature, f"shin.{side}")
        pieces["limbs"].append(greave)

        hip_sign = 1.0 if side == "L" else -1.0
        hip_plate = add_shell_patch(
            f"ARMOR_Hip_{side}_FloatingGuard",
            (hip_sign * 0.205, -0.020, 0.930),
            ((-0.115, 0.048, 0.002), (-0.020, 0.072, 0.002), (0.090, 0.055, 0.001)),
            0.011,
            armor if side == "L" else armor_edge,
            export_collection,
            front=True,
            columns=7,
            bow=0.006,
            bevel_width=0.004,
            role="floating_hip_guard",
        )
        parent_to_bone(hip_plate, armature, "pelvis")
        pieces["limbs"].append(hip_plate)

    cowl = add_cowl("GARMENT_AsymmetricDrapedCowl", suit_raised, export_collection)
    parent_to_bone(cowl, armature, "neck")
    pieces["details"].append(cowl)
    collar = add_torus_scaled(
        "GARMENT_FlexibleNeckGasket",
        (0.0, -0.004, 1.605),
        0.105,
        0.018,
        (1.0, 0.86, 1.0),
        rubber,
        export_collection,
        "flexible_neck_gasket",
    )
    parent_to_bone(collar, armature, "neck")
    pieces["details"].append(collar)

    belt = add_torus_scaled(
        "GEAR_LowProfileLoadBelt",
        (0.0, 0.0, 1.025),
        0.205,
        0.020,
        (1.0, 0.70, 1.0),
        rubber,
        export_collection,
        "low_profile_load_belt",
    )
    parent_to_bone(belt, armature, "pelvis")
    pieces["details"].append(belt)
    for index, x in enumerate((-0.14, -0.07, 0.07, 0.14)):
        pouch = add_rounded_box(
            f"GEAR_BeltSegment_{index:02d}",
            (x, 0.145, 1.010),
            (0.055, 0.035, 0.075),
            suit_raised,
            export_collection,
            bevel_width=0.010,
            role="integrated_belt_segment",
        )
        parent_to_bone(pouch, armature, "pelvis")
        pieces["details"].append(pouch)

    # Helmet assembly: flexible seal, crown, rear shell, visor, cheeks, chin.
    helmet_center = (0.0, -0.010, 1.765)
    crown = add_ellipsoid_patch(
        "HELMET_CeramicCrownShell",
        helmet_center,
        (0.142, 0.132, 0.175),
        (-math.pi, math.pi),
        (0.02, 1.38),
        armor,
        export_collection,
        theta_steps=30,
        latitude_steps=9,
        thickness=0.014,
        role="helmet_crown_shell",
    )
    parent_to_bone(crown, armature, "head")
    pieces["helmet"].append(crown)
    rear_shell = add_ellipsoid_patch(
        "HELMET_RearOccipitalShell",
        helmet_center,
        (0.147, 0.138, 0.170),
        (0.18, math.pi - 0.18),
        (-0.40, 0.38),
        armor_edge,
        export_collection,
        theta_steps=18,
        latitude_steps=7,
        thickness=0.014,
        role="helmet_rear_shell",
    )
    parent_to_bone(rear_shell, armature, "head")
    pieces["helmet"].append(rear_shell)
    visor = add_ellipsoid_patch(
        "HELMET_ContinuousVisor",
        (0.0, -0.018, 1.765),
        (0.134, 0.141, 0.150),
        (-2.62, -0.52),
        (-0.28, 0.47),
        rubber,
        export_collection,
        theta_steps=18,
        latitude_steps=7,
        thickness=0.010,
        role="continuous_optical_visor",
    )
    parent_to_bone(visor, armature, "head")
    pieces["helmet"].append(visor)
    cheek_l = add_ellipsoid_patch(
        "HELMET_CheekSeal_L",
        helmet_center,
        (0.143, 0.144, 0.152),
        (-1.50, -0.48),
        (-0.61, -0.05),
        armor,
        export_collection,
        theta_steps=10,
        latitude_steps=6,
        thickness=0.012,
        role="helmet_cheek_shell",
    )
    cheek_r = add_ellipsoid_patch(
        "HELMET_CheekSeal_R",
        helmet_center,
        (0.143, 0.144, 0.152),
        (-2.66, -1.64),
        (-0.61, -0.05),
        armor,
        export_collection,
        theta_steps=10,
        latitude_steps=6,
        thickness=0.012,
        role="helmet_cheek_shell",
    )
    for cheek in (cheek_l, cheek_r):
        parent_to_bone(cheek, armature, "head")
        pieces["helmet"].append(cheek)
    chin = add_shell_patch(
        "HELMET_ArticulatedChinGuard",
        (0.0, -0.145, 1.690),
        ((-0.055, 0.055, 0.000), (0.015, 0.098, 0.000), (0.070, 0.078, 0.000)),
        0.012,
        armor_edge,
        export_collection,
        front=True,
        columns=9,
        bow=0.010,
        bevel_width=0.005,
        role="articulated_chin_guard",
    )
    parent_to_bone(chin, armature, "head")
    pieces["helmet"].append(chin)
    brow = add_curve_tube(
        "HELMET_OxideBrowIndex",
        [(-0.092, -0.153, 1.825), (0.0, -0.162, 1.840), (0.092, -0.153, 1.825)],
        0.008,
        oxide,
        export_collection,
        role="helmet_brow_identity_index",
    )
    parent_to_bone(brow, armature, "head")
    pieces["helmet"].append(brow)
    for side, x in (("L", 0.118), ("R", -0.118)):
        status = add_uv_ellipsoid(
            f"HELMET_StatusEmitter_{side}",
            (x, -0.105, 1.805),
            (0.010, 0.006, 0.025),
            teal,
            export_collection,
            segments=18,
            rings=10,
            role="helmet_status_emitter",
        )
        parent_to_bone(status, armature, "head")
        pieces["helmet"].append(status)

    for side in ("L", "R"):
        x = JOINTS[f"ankle.{side}"][0]
        y = JOINTS[f"ankle.{side}"][1] - 0.005
        upper = add_profiled_boot(f"BOOT_{side}_ArticulatedUpper", x, y, suit_raised, export_collection, sole=False)
        sole = add_profiled_boot(f"BOOT_{side}_RolledRubberSole", x, y, rubber, export_collection, sole=True)
        toe_cap = add_shell_patch(
            f"BOOT_{side}_CeramicToeCap",
            (x, y - 0.165, 0.090),
            ((-0.030, 0.050, 0.001), (0.010, 0.075, 0.002), (0.045, 0.065, 0.001)),
            0.010,
            armor_edge,
            export_collection,
            front=True,
            columns=9,
            bow=0.010,
            bevel_width=0.004,
            role="boot_toe_cap",
        )
        heel = add_uv_ellipsoid(
            f"BOOT_{side}_ShapedHeelCounter",
            (x, y + 0.075, 0.110),
            (0.062, 0.042, 0.085),
            rubber,
            export_collection,
            segments=24,
            rings=14,
            role="shaped_boot_heel_counter",
        )
        for obj in (upper, sole, toe_cap, heel):
            parent_to_bone(obj, armature, f"foot.{side}")
            pieces["boots"].append(obj)
        for strap_index, strap_y in enumerate((y - 0.03, y - 0.095, y - 0.155)):
            strap = add_curve_tube(
                f"BOOT_{side}_InstepStrap_{strap_index}",
                [(x - 0.058, strap_y, 0.115), (x, strap_y - 0.006, 0.135), (x + 0.058, strap_y, 0.115)],
                0.007,
                rubber,
                export_collection,
                role="boot_instep_retention",
            )
            parent_to_bone(strap, armature, f"foot.{side}")
            pieces["boots"].append(strap)

    # Garment construction lines remain subtle and follow anatomical tension.
    seam_specs = (
        ("SEAM_Abdomen_Center", [(0.0, -0.143, 1.08), (0.0, -0.150, 1.20), (0.0, -0.160, 1.30)]),
        ("SEAM_Abdomen_Left", [(0.08, -0.137, 1.07), (0.10, -0.145, 1.17), (0.12, -0.152, 1.27)]),
        ("SEAM_Abdomen_Right", [(-0.08, -0.137, 1.07), (-0.10, -0.145, 1.17), (-0.12, -0.152, 1.27)]),
    )
    for name, points in seam_specs:
        seam = add_curve_tube(name, points, 0.0035, suit_raised, export_collection, role="garment_tension_seam")
        parent_to_bone(seam, armature, "spine")
        pieces["details"].append(seam)
    return pieces


def build_authored_rifle(
    export_collection: bpy.types.Collection,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], dict[str, object], Matrix]:
    """Build one cohesive Auto Rifle in a common authored design frame."""
    origin = Vector((-0.250, -0.220, 1.420))
    muzzle = Vector((0.650, -0.690, 1.220))
    frame, x_axis, y_axis, z_axis = rifle_frame(origin, muzzle)
    gunmetal = materials["gunmetal"]
    metal = materials["metal"]
    armor = materials["armor"]
    armor_edge = materials["armor_edge"]
    rubber = materials["rubber"]
    oxide = materials["oxide"]
    teal = materials["teal"]
    rifle: list[bpy.types.Object] = []

    def keep(obj: bpy.types.Object, bone: str = "hand.R") -> bpy.types.Object:
        parent_to_bone(obj, armature, bone)
        obj["kyx_weapon"] = "KYX_Vanguard_AutoRifle_V5"
        rifle.append(obj)
        return obj

    def profile(
        name: str,
        points: tuple[tuple[float, float], ...],
        half_depth: float,
        material: bpy.types.Material,
        role: str,
        *,
        local_offset: tuple[float, float, float] = (0.0, 0.0, 0.0),
        bevel_width: float = 0.004,
    ) -> bpy.types.Object:
        local_transform = frame @ Matrix.Translation(local_offset)
        return keep(make_prism_profile(name, points, half_depth, material, export_collection, role, transform=local_transform, bevel_width=bevel_width))

    def cylinder(
        name: str,
        local_a: tuple[float, float, float],
        local_b: tuple[float, float, float],
        radius_a: float,
        radius_b: float,
        material: bpy.types.Material,
        role: str,
        *,
        vertices: int = 24,
    ) -> bpy.types.Object:
        return keep(add_cylinder_between(
            name,
            tuple(world_from_local(frame, local_a)),
            tuple(world_from_local(frame, local_b)),
            radius_a,
            radius_b,
            material,
            export_collection,
            vertices=vertices,
            bevel_width=0.002,
            role=role,
        ))

    # Open, braced stock silhouette.  The negative space is literal because the
    # stock is three connected members rather than a painted solid rectangle.
    stock_members = (
        ((0.00, 0.0, 0.020), (0.285, 0.0, 0.055), 0.018, 0.015),
        ((0.015, 0.0, 0.020), (0.120, 0.0, -0.085), 0.021, 0.015),
        ((0.120, 0.0, -0.085), (0.285, 0.0, 0.005), 0.015, 0.015),
    )
    for index, (a, b, ra, rb) in enumerate(stock_members):
        cylinder(f"WEAPON_StockFrame_{index}", a, b, ra, rb, armor_edge, "open_skeleton_stock")
    butt = profile(
        "WEAPON_ShapedButtPad",
        ((-0.020, -0.055), (-0.010, 0.090), (0.025, 0.108), (0.060, 0.082), (0.050, -0.060)),
        0.032,
        rubber,
        "contoured_shoulder_buttpad",
        bevel_width=0.008,
    )
    butt["kyx_contact_role"] = "shoulder_stock_contact"

    receiver_profile = (
        (0.255, -0.058),
        (0.278, 0.074),
        (0.340, 0.098),
        (0.505, 0.090),
        (0.555, 0.048),
        (0.535, -0.042),
        (0.470, -0.074),
        (0.330, -0.078),
    )
    receiver = profile("WEAPON_UnifiedReceiver", receiver_profile, 0.045, gunmetal, "authored_unified_receiver", bevel_width=0.006)
    receiver["kyx_primary_weapon_form"] = True
    side_inset_profile = (
        (0.305, -0.032), (0.315, 0.055), (0.360, 0.070), (0.485, 0.060),
        (0.515, 0.032), (0.490, -0.030), (0.430, -0.046), (0.340, -0.044),
    )
    profile("WEAPON_ReceiverSideInset_Left", side_inset_profile, 0.004, armor_edge, "receiver_functional_inset", local_offset=(0.0, -0.047, 0.0), bevel_width=0.002)
    profile("WEAPON_ReceiverSideInset_Right", side_inset_profile, 0.004, armor_edge, "receiver_functional_inset", local_offset=(0.0, 0.047, 0.0), bevel_width=0.002)

    handguard_profile = (
        (0.515, -0.045), (0.530, 0.060), (0.790, 0.050), (0.825, 0.024),
        (0.810, -0.038), (0.745, -0.055), (0.575, -0.058),
    )
    handguard = profile("WEAPON_VentedCeramicHandguard", handguard_profile, 0.043, armor, "unified_vented_handguard", bevel_width=0.005)
    handguard["kyx_support_contact_surface"] = True
    # Five long side vents establish rhythm while preserving one large shell.
    for side_sign, side_name in ((-1.0, "Left"), (1.0, "Right")):
        for index in range(4):
            x0 = 0.565 + index * 0.058
            vent_points = ((x0, -0.030), (x0 + 0.038, -0.027), (x0 + 0.041, 0.005), (x0 + 0.004, 0.007))
            profile(
                f"WEAPON_HandguardVent_{side_name}_{index}",
                vent_points,
                0.004,
                rubber,
                "functional_handguard_vent",
                local_offset=(0.0, side_sign * 0.046, 0.0),
                bevel_width=0.002,
            )

    # Pistol grip and magazine use authored changing silhouettes rather than cubes.
    grip_profile = (
        (0.355, -0.028), (0.413, -0.040), (0.420, -0.180),
        (0.390, -0.225), (0.354, -0.202), (0.338, -0.076),
    )
    grip = profile("WEAPON_ContouredPistolGrip", grip_profile, 0.030, rubber, "contoured_trigger_grip", bevel_width=0.006)
    grip["kyx_trigger_hand_contact_surface"] = True
    magazine_profile = (
        (0.438, -0.078), (0.505, -0.076), (0.522, -0.145), (0.532, -0.235),
        (0.512, -0.310), (0.460, -0.300), (0.449, -0.205),
    )
    magazine = profile("WEAPON_CurvedMagazine", magazine_profile, 0.028, metal, "curved_ammunition_magazine", bevel_width=0.005)
    magazine["kyx_weapon_function"] = "detachable_magazine"

    # Trigger guard and trigger are curved, readable, and physically occupied by
    # the index finger in the contact render.
    trigger_guard_points = [
        tuple(world_from_local(frame, point))
        for point in ((0.375, -0.043, -0.045), (0.420, -0.043, -0.100), (0.478, -0.043, -0.085), (0.485, -0.043, -0.045))
    ]
    trigger_guard = add_curve_tube("WEAPON_TriggerGuard", trigger_guard_points, 0.008, gunmetal, export_collection, role="functional_trigger_guard")
    keep(trigger_guard)
    trigger = add_curve_tube(
        "WEAPON_Trigger",
        [tuple(world_from_local(frame, point)) for point in ((0.438, -0.035, -0.047), (0.445, -0.035, -0.082))],
        0.004,
        oxide,
        export_collection,
        role="functional_trigger",
    )
    keep(trigger)

    cylinder("WEAPON_Barrel", (0.805, 0.0, 0.018), (1.045, 0.0, 0.018), 0.014, 0.012, gunmetal, "rifled_barrel")
    cylinder("WEAPON_GasBlock", (0.790, 0.0, -0.005), (0.835, 0.0, 0.035), 0.027, 0.025, metal, "gas_block")
    cylinder("WEAPON_MuzzleBrakeCore", (1.035, 0.0, 0.018), (1.112, 0.0, 0.018), 0.024, 0.021, metal, "ported_muzzle_brake", vertices=16)
    for index, x in enumerate((1.060, 1.088)):
        cylinder(f"WEAPON_MuzzleBrakeRing_{index}", (x, 0.0, -0.004), (x + 0.012, 0.0, 0.040), 0.028, 0.028, gunmetal, "muzzle_brake_port_ring", vertices=12)

    # Raised rail and compact optic use a stepped silhouette.
    profile("WEAPON_TopRail", ((0.295, 0.082), (0.315, 0.108), (0.715, 0.092), (0.730, 0.074)), 0.022, metal, "continuous_top_rail", bevel_width=0.002)
    optic_profile = ((0.375, 0.098), (0.395, 0.152), (0.470, 0.156), (0.495, 0.120), (0.475, 0.095))
    profile("WEAPON_CompactOpticHousing", optic_profile, 0.027, gunmetal, "compact_optic_housing", bevel_width=0.005)
    optic_glass = add_uv_ellipsoid(
        "WEAPON_OpticGlass",
        tuple(world_from_local(frame, (0.440, -0.037, 0.176))),
        (0.020, 0.005, 0.020),
        teal,
        export_collection,
        rotation_quaternion=quaternion_from_basis(x_axis, y_axis, z_axis),
        segments=18,
        rings=10,
        role="optic_emissive_glass",
    )
    keep(optic_glass)
    status_light = add_uv_ellipsoid(
        "WEAPON_StatusLight",
        tuple(world_from_local(frame, (0.520, -0.063, 0.025))),
        (0.018, 0.005, 0.008),
        teal,
        export_collection,
        rotation_quaternion=quaternion_from_basis(x_axis, y_axis, z_axis),
        segments=18,
        rings=10,
        role="weapon_status_light",
    )
    keep(status_light)
    accent = cylinder("WEAPON_MuzzleOxideIndex", (1.005, 0.0, 0.018), (1.032, 0.0, 0.018), 0.017, 0.017, oxide, "weapon_oxide_index", vertices=20)

    contact = {
        "stockShoulderPoint": [round(value, 6) for value in world_from_local(frame, (0.015, 0.0, 0.030))],
        "triggerGripCenter": [round(value, 6) for value in world_from_local(frame, (0.390, -0.065, -0.140))],
        "triggerPoint": [round(value, 6) for value in world_from_local(frame, (0.445, -0.035, -0.075))],
        "supportHandguardCenter": [round(value, 6) for value in world_from_local(frame, (0.760, -0.060, -0.060))],
        "rifleAxis": [round(value, 6) for value in x_axis],
        "rifleObjectCount": len(rifle),
        "construction": "single_common_design_frame_with_literal_open_stock_curved_receiver_grip_magazine_vents_barrel_and_muzzle",
    }
    return rifle, contact, frame


def build_gloved_hands_v5_rejected(
    export_collection: bpy.types.Collection,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
    rifle_frame_matrix: Matrix,
) -> tuple[list[bpy.types.Object], dict[str, object]]:
    rubber = materials["rubber"]
    suit_raised = materials["suit_raised"]
    armor_edge = materials["armor_edge"]
    oxide = materials["oxide"]
    frame = rifle_frame_matrix
    x_axis = Vector((frame[0][0], frame[1][0], frame[2][0]))
    y_axis = Vector((frame[0][1], frame[1][1], frame[2][1]))
    z_axis = Vector((frame[0][2], frame[1][2], frame[2][2]))
    hand_quaternion = quaternion_from_basis(x_axis, y_axis, z_axis)
    hands: list[bpy.types.Object] = []
    literal_contacts: list[dict[str, object]] = []

    def keep(obj: bpy.types.Object, side: str, role: str) -> bpy.types.Object:
        parent_to_bone(obj, armature, f"hand.{side}")
        obj["kyx_hand_contact_role"] = role
        hands.append(obj)
        return obj

    # Trigger hand palm is a shaped volume that overlaps the wrist seal and the
    # contoured grip.  Four wrapped digits plus an extended index remain separate.
    trigger_palm_center = world_from_local(frame, (0.390, -0.073, -0.137))
    trigger_palm = add_uv_ellipsoid(
        "GLOVE_R_ShapedPalm",
        tuple(trigger_palm_center),
        (0.072, 0.044, 0.087),
        rubber,
        export_collection,
        rotation_quaternion=hand_quaternion,
        segments=30,
        rings=18,
        role="anatomical_trigger_palm",
    )
    keep(trigger_palm, "R", "trigger_palm_grip_contact")
    trigger_cuff = add_limb_shell(
        "GLOVE_R_ArticulatedCuff",
        JOINTS["wrist.R"],
        tuple(trigger_palm_center),
        (0.072, 0.062),
        (0.075, 0.064),
        (-2.40, 2.40),
        suit_raised,
        export_collection,
        axial_steps=5,
        radial_steps=15,
        thickness=0.006,
        role="articulated_glove_cuff",
    )
    keep(trigger_cuff, "R", "trigger_wrist_seal")

    for digit_index, local_z in enumerate((-0.135, -0.170, -0.202)):
        local_points = [
            (0.405 + digit_index * 0.004, -0.093, local_z + 0.018),
            (0.420 + digit_index * 0.003, -0.025, local_z - 0.005),
            (0.408, 0.050, local_z + 0.010),
        ]
        points = [tuple(world_from_local(frame, point)) for point in local_points]
        finger = add_curve_tube(
            f"GLOVE_R_WrappedFinger_{digit_index + 2}",
            points,
            0.014 - digit_index * 0.0007,
            rubber,
            export_collection,
            role="articulated_wrapped_grip_finger",
            resolution=3,
        )
        keep(finger, "R", "literal_grip_wrap")
        literal_contacts.append({"hand": "R", "digit": digit_index + 2, "surface": "pistol_grip", "endpoint": [round(value, 6) for value in world_from_local(frame, local_points[-1])]})

    trigger_index_local = [
        (0.425, -0.090, -0.090),
        (0.448, -0.050, -0.078),
        (0.448, -0.018, -0.075),
    ]
    trigger_index = add_curve_tube(
        "GLOVE_R_IndexOnTrigger",
        [tuple(world_from_local(frame, point)) for point in trigger_index_local],
        0.013,
        rubber,
        export_collection,
        role="trigger_index_finger",
    )
    keep(trigger_index, "R", "literal_trigger_contact")
    literal_contacts.append({"hand": "R", "digit": 1, "surface": "trigger", "endpoint": [round(value, 6) for value in world_from_local(frame, trigger_index_local[-1])]})
    trigger_thumb_local = [(0.365, -0.092, -0.105), (0.345, -0.020, -0.095), (0.360, 0.045, -0.090)]
    trigger_thumb = add_curve_tube(
        "GLOVE_R_OpposedThumb",
        [tuple(world_from_local(frame, point)) for point in trigger_thumb_local],
        0.015,
        rubber,
        export_collection,
        role="opposed_grip_thumb",
    )
    keep(trigger_thumb, "R", "opposed_thumb_grip_contact")
    literal_contacts.append({"hand": "R", "digit": "thumb", "surface": "pistol_grip", "endpoint": [round(value, 6) for value in world_from_local(frame, trigger_thumb_local[-1])]})

    for index, local in enumerate(((0.382, -0.108, -0.095), (0.404, -0.108, -0.120), (0.424, -0.108, -0.145))):
        knuckle = add_uv_ellipsoid(
            f"GLOVE_R_KnuckleGuard_{index}",
            tuple(world_from_local(frame, local)),
            (0.022, 0.008, 0.015),
            armor_edge,
            export_collection,
            rotation_quaternion=hand_quaternion,
            segments=18,
            rings=10,
            role="glove_knuckle_guard",
        )
        keep(knuckle, "R", "trigger_knuckle_guard")

    # Support hand cups the handguard from the lower-left side.  Four fingers
    # travel under and up the far side, so the contact is visible in silhouette.
    support_palm_center = world_from_local(frame, (0.680, -0.073, -0.073))
    support_palm = add_uv_ellipsoid(
        "GLOVE_L_ShapedSupportPalm",
        tuple(support_palm_center),
        (0.085, 0.044, 0.067),
        rubber,
        export_collection,
        rotation_quaternion=hand_quaternion,
        segments=30,
        rings=18,
        role="anatomical_support_palm",
    )
    keep(support_palm, "L", "support_palm_handguard_contact")
    support_cuff = add_limb_shell(
        "GLOVE_L_ArticulatedCuff",
        JOINTS["wrist.L"],
        tuple(support_palm_center),
        (0.074, 0.064),
        (0.082, 0.066),
        (-2.40, 2.40),
        suit_raised,
        export_collection,
        axial_steps=5,
        radial_steps=15,
        thickness=0.006,
        role="articulated_glove_cuff",
    )
    keep(support_cuff, "L", "support_wrist_seal")

    for digit_index, local_x in enumerate((0.610, 0.652, 0.694, 0.736)):
        local_points = [
            (local_x, -0.092, -0.068),
            (local_x + 0.006, -0.008, -0.095),
            (local_x + 0.002, 0.064, -0.035),
        ]
        finger = add_curve_tube(
            f"GLOVE_L_WrappedSupportFinger_{digit_index + 1}",
            [tuple(world_from_local(frame, point)) for point in local_points],
            0.014 - digit_index * 0.0005,
            rubber,
            export_collection,
            role="articulated_support_wrap_finger",
        )
        keep(finger, "L", "literal_handguard_wrap")
        literal_contacts.append({"hand": "L", "digit": digit_index + 1, "surface": "handguard", "endpoint": [round(value, 6) for value in world_from_local(frame, local_points[-1])]})
    support_thumb_local = [(0.705, -0.092, -0.030), (0.730, -0.040, 0.015), (0.695, 0.010, 0.045)]
    support_thumb = add_curve_tube(
        "GLOVE_L_OpposedSupportThumb",
        [tuple(world_from_local(frame, point)) for point in support_thumb_local],
        0.015,
        rubber,
        export_collection,
        role="opposed_support_thumb",
    )
    keep(support_thumb, "L", "support_thumb_handguard_contact")
    literal_contacts.append({"hand": "L", "digit": "thumb", "surface": "handguard", "endpoint": [round(value, 6) for value in world_from_local(frame, support_thumb_local[-1])]})
    for index, local_x in enumerate((0.620, 0.665, 0.710, 0.750)):
        knuckle = add_uv_ellipsoid(
            f"GLOVE_L_KnuckleGuard_{index}",
            tuple(world_from_local(frame, (local_x, -0.108, -0.050))),
            (0.023, 0.008, 0.015),
            armor_edge,
            export_collection,
            rotation_quaternion=hand_quaternion,
            segments=18,
            rings=10,
            role="glove_knuckle_guard",
        )
        keep(knuckle, "L", "support_knuckle_guard")

    # Wrist identity wraps improve joint readability without hiding contact.
    for side, center in (("R", world_from_local(frame, (0.315, -0.060, -0.105))), ("L", world_from_local(frame, (0.612, -0.060, -0.035)))):
        band = add_curve_tube(
            f"GLOVE_{side}_OxideWristIndex",
            [tuple(center - y_axis * 0.045), tuple(center + z_axis * 0.020), tuple(center + y_axis * 0.045)],
            0.006,
            oxide,
            export_collection,
            role="glove_oxide_identity_wrap",
        )
        keep(band, side, "wrist_identity_wrap")

    metrics = {
        "literalContactCount": len(literal_contacts),
        "contacts": literal_contacts,
        "rightTriggerFingerOccupiesGuard": True,
        "rightPalmOverlapsGrip": True,
        "leftPalmOverlapsHandguard": True,
        "supportFingerCount": 4,
        "triggerWrappedFingerCount": 3,
        "thumbsOpposed": True,
        "note": "Authored geometry endpoints are embedded on the modeled trigger, grip, and handguard surfaces; renders remain visual authority.",
    }
    return hands, metrics


def build_gloved_hands(
    export_collection: bpy.types.Collection,
    armature: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
    rifle_frame_matrix: Matrix,
) -> tuple[list[bpy.types.Object], dict[str, object]]:
    """Build fitted palms and individually segmented contact-locked fingers."""
    rubber = materials["rubber"]
    suit_raised = materials["suit_raised"]
    armor_edge = materials["armor_edge"]
    oxide = materials["oxide"]
    frame = rifle_frame_matrix
    hands: list[bpy.types.Object] = []
    literal_contacts: list[dict[str, object]] = []

    def keep(obj: bpy.types.Object, side: str, role: str) -> bpy.types.Object:
        parent_to_bone(obj, armature, f"hand.{side}")
        obj["kyx_hand_contact_role"] = role
        hands.append(obj)
        return obj

    def finger_chain(
        name: str,
        side: str,
        local_points: list[tuple[float, float, float]],
        radius: float,
        role: str,
    ) -> None:
        world_points = [world_from_local(frame, point) for point in local_points]
        for index in range(len(world_points) - 1):
            segment = add_cylinder_between(
                f"{name}_Phalanx_{index + 1}",
                tuple(world_points[index]),
                tuple(world_points[index + 1]),
                radius * (1.0 - index * 0.10),
                radius * (0.90 - index * 0.08),
                rubber,
                export_collection,
                vertices=18,
                bevel_width=0.002,
                role="articulated_glove_phalanx",
            )
            keep(segment, side, role)
        literal_contacts.append({
            "hand": side,
            "digit": name.split("_")[-1],
            "surface": role,
            "endpoint": [round(value, 6) for value in world_points[-1]],
        })

    trigger_palm = make_prism_profile(
        "GLOVE_R_ShapedPalm",
        ((0.322, -0.112), (0.348, -0.080), (0.402, -0.086), (0.428, -0.120),
         (0.422, -0.185), (0.392, -0.214), (0.338, -0.198), (0.315, -0.155)),
        0.030,
        rubber,
        export_collection,
        "anatomical_trigger_palm",
        transform=frame @ Matrix.Translation((0.0, -0.060, 0.0)),
        bevel_width=0.010,
    )
    keep(trigger_palm, "R", "trigger_palm_grip_contact")
    trigger_cuff_end = world_from_local(frame, (0.325, -0.060, -0.135))
    keep(add_segment_ellipsoid(
        "GLOVE_R_TailoredCuff",
        JOINTS["wrist.R"],
        tuple(trigger_cuff_end),
        0.057,
        0.048,
        suit_raised,
        export_collection,
        overlap=0.022,
        role="tailored_glove_cuff",
    ), "R", "trigger_wrist_seal")

    finger_chain("GLOVE_R_Middle", "R", [(0.405, -0.090, -0.120), (0.421, -0.074, -0.145), (0.420, -0.012, -0.170), (0.402, 0.033, -0.162)], 0.0125, "pistol_grip_wrap")
    finger_chain("GLOVE_R_Ring", "R", [(0.397, -0.090, -0.145), (0.414, -0.072, -0.172), (0.412, -0.010, -0.196), (0.395, 0.032, -0.188)], 0.0120, "pistol_grip_wrap")
    finger_chain("GLOVE_R_Pinky", "R", [(0.383, -0.088, -0.169), (0.402, -0.070, -0.195), (0.400, -0.008, -0.216), (0.384, 0.030, -0.205)], 0.0110, "pistol_grip_wrap")
    finger_chain("GLOVE_R_Index", "R", [(0.414, -0.087, -0.105), (0.435, -0.067, -0.086), (0.447, -0.034, -0.075)], 0.0115, "trigger_contact")
    finger_chain("GLOVE_R_Thumb", "R", [(0.345, -0.087, -0.115), (0.336, -0.025, -0.092), (0.358, 0.030, -0.096)], 0.0130, "opposed_grip_contact")
    keep(make_prism_profile(
        "GLOVE_R_KnuckleBridge",
        ((0.345, -0.094), (0.412, -0.100), (0.421, -0.120), (0.350, -0.123)),
        0.005,
        armor_edge,
        export_collection,
        "segmented_knuckle_bridge",
        transform=frame @ Matrix.Translation((0.0, -0.094, 0.0)),
        bevel_width=0.003,
    ), "R", "trigger_knuckle_guard")

    support_palm = make_prism_profile(
        "GLOVE_L_ShapedSupportPalm",
        ((0.675, -0.040), (0.700, -0.022), (0.780, -0.026), (0.805, -0.055),
         (0.795, -0.103), (0.758, -0.120), (0.690, -0.105), (0.668, -0.072)),
        0.030,
        rubber,
        export_collection,
        "anatomical_support_palm",
        transform=frame @ Matrix.Translation((0.0, -0.060, 0.0)),
        bevel_width=0.010,
    )
    keep(support_palm, "L", "support_palm_handguard_contact")
    support_cuff_end = world_from_local(frame, (0.682, -0.060, -0.060))
    keep(add_segment_ellipsoid(
        "GLOVE_L_TailoredCuff",
        JOINTS["wrist.L"],
        tuple(support_cuff_end),
        0.057,
        0.048,
        suit_raised,
        export_collection,
        overlap=0.022,
        role="tailored_glove_cuff",
    ), "L", "support_wrist_seal")
    for digit_index, local_x in enumerate((0.705, 0.738, 0.771, 0.802), start=1):
        finger_chain(
            f"GLOVE_L_Finger{digit_index}",
            "L",
            [(local_x, -0.090, -0.058), (local_x + 0.004, -0.055, -0.087),
             (local_x + 0.002, 0.005, -0.093), (local_x - 0.004, 0.045, -0.045)],
            0.0125 - (digit_index - 1) * 0.0005,
            "forward_handguard_wrap",
        )
    finger_chain("GLOVE_L_Thumb", "L", [(0.762, -0.086, -0.032), (0.785, -0.045, 0.005), (0.752, 0.012, 0.040)], 0.0130, "support_thumb_contact")
    keep(make_prism_profile(
        "GLOVE_L_KnuckleBridge",
        ((0.692, -0.038), (0.792, -0.040), (0.800, -0.060), (0.696, -0.064)),
        0.005,
        armor_edge,
        export_collection,
        "segmented_knuckle_bridge",
        transform=frame @ Matrix.Translation((0.0, -0.094, 0.0)),
        bevel_width=0.003,
    ), "L", "support_knuckle_guard")

    for side, local_center in (("R", (0.310, -0.052, -0.130)), ("L", (0.675, -0.052, -0.055))):
        keep(add_uv_ellipsoid(
            f"GLOVE_{side}_OxideWristIndex",
            tuple(world_from_local(frame, local_center)),
            (0.020, 0.010, 0.012),
            oxide,
            export_collection,
            segments=18,
            rings=10,
            role="glove_oxide_identity_index",
        ), side, "wrist_identity_index")

    metrics = {
        "literalContactCount": len(literal_contacts),
        "contacts": literal_contacts,
        "rightTriggerFingerOccupiesGuard": True,
        "rightPalmOverlapsGrip": True,
        "leftPalmOverlapsHandguard": True,
        "supportFingerCount": 4,
        "triggerWrappedFingerCount": 3,
        "thumbsOpposed": True,
        "supportHandForwardOffsetMeters": 0.37,
        "note": "Segmented phalanges terminate on the modeled trigger, grip, and forward handguard; contact renders remain visual authority.",
    }
    return hands, metrics


def build_animation(armature: bpy.types.Object) -> bpy.types.Action:
    armature.animation_data_create()
    action = bpy.data.actions.new("KYX_V5_CombatIdle_ContactLocked")
    armature.animation_data.action = action
    action["kyx_semantic_state"] = "combat_idle_two_hand_contact_locked"
    action["kyx_root_motion"] = "in_place"
    action["kyx_deformation_review"] = "human_visual_review_required"
    root = armature.pose.bones["root"]
    chest = armature.pose.bones["chest"]
    head = armature.pose.bones["head"]
    hand_r = armature.pose.bones["hand.R"]
    for bone in (root, chest, head, hand_r):
        bone.rotation_mode = "XYZ"
    for frame, lift, chest_pitch, head_yaw, settle in (
        (FRAME_START, 0.0, 0.0, 0.0, 0.0),
        (FRAME_CONTACT, 0.0015, math.radians(0.18), math.radians(-0.15), math.radians(-0.12)),
        (FRAME_BREATHE, 0.0028, math.radians(0.34), math.radians(0.20), math.radians(0.08)),
        (FRAME_END, 0.0, 0.0, 0.0, 0.0),
    ):
        bpy.context.scene.frame_set(frame)
        root.location = (0.0, 0.0, lift)
        chest.rotation_euler = (chest_pitch, 0.0, 0.0)
        head.rotation_euler = (0.0, 0.0, head_yaw)
        hand_r.rotation_euler = (0.0, settle, 0.0)
        root.keyframe_insert(data_path="location")
        chest.keyframe_insert(data_path="rotation_euler")
        head.keyframe_insert(data_path="rotation_euler")
        hand_r.keyframe_insert(data_path="rotation_euler")
    bpy.context.scene.timeline_markers.new("contact_pose", frame=FRAME_START)
    bpy.context.scene.timeline_markers.new("weapon_settle", frame=FRAME_CONTACT)
    bpy.context.scene.timeline_markers.new("breath_apex", frame=FRAME_BREATHE)
    bpy.context.scene.timeline_markers.new("loop", frame=FRAME_END)
    return action


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def build_presentation(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> bpy.types.Object:
    add_rounded_box("PRES_Floor", (0.0, 0.0, -0.045), (6.0, 6.0, 0.08), materials["floor"], collection, bevel_width=0.0, role="presentation")
    add_rounded_box("PRES_Backdrop", (0.0, 1.50, 1.55), (5.8, 0.08, 3.3), materials["backdrop"], collection, bevel_width=0.0, role="presentation")
    add_rounded_box("PRES_OxideIndex", (-1.55, 1.43, 1.40), (0.050, 0.020, 2.30), materials["oxide"], collection, rotation=(0.0, math.radians(-14), 0.0), bevel_width=0.0, role="presentation")
    camera_data = bpy.data.cameras.new("CAMDATA_KYX_Vanguard_V5")
    camera = bpy.data.objects.new("CAM_KYX_Vanguard_V5", camera_data)
    collection.objects.link(camera)
    camera_data.lens = 70.0
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
        look_at(obj, (0.0, -0.30, 1.12))

    light("LIGHT_KeySoftbox", (-3.2, -4.2, 4.8), 1250.0, (0.82, 0.90, 1.0), 3.0)
    light("LIGHT_FillSoftbox", (3.6, -2.7, 3.0), 720.0, (0.58, 0.88, 0.84), 2.8)
    light("LIGHT_OxideRim", (1.2, 2.8, 3.7), 1050.0, (1.0, 0.30, 0.13), 2.2)
    light("LIGHT_FrontShape", (0.0, -4.2, 1.5), 390.0, (0.95, 0.86, 0.72), 2.3)
    light("LIGHT_BackReview", (-1.3, 1.16, 2.7), 1050.0, (0.70, 0.82, 0.95), 2.8)
    return camera


def configure_scene() -> None:
    scene = bpy.context.scene
    scene.name = "SCENE_KYX_Vanguard_OriginalV5"
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
        background.inputs["Strength"].default_value = 0.28
    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except TypeError:
        pass
    scene["kyx_scope"] = "phase7_character_original_v5b_human_proportion_refinement"
    scene["kyx_originality_boundary"] = "clean_room_scripted_geometry_no_legacy_soldier_import_or_derivation"
    scene["kyx_concept_reference"] = CONCEPT_REL
    scene["kyx_concept_sha256"] = CONCEPT_SHA256
    scene["kyx_g6_status"] = "not_claimed_human_review_required"
    scene["kyx_runtime_integration"] = "absent_by_lane_scope"
    scene["kyx_units"] = "meters"
    scene["kyx_forward_axis"] = "-Y"
    scene["kyx_up_axis"] = "+Z"


def set_camera(
    camera: bpy.types.Object,
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    *,
    lens: float = 70.0,
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
            value = original[0] * 0.2126 + original[1] * 0.7152 + original[2] * 0.0722
            color = (value, value, value, original[3])
        else:
            color = original
        material.diffuse_color = color
        principled.inputs["Base Color"].default_value = color
        emission = principled.inputs.get("Emission Color") or principled.inputs.get("Emission")
        if emission is not None and material.name in {"MAT_TealSystem", "MAT_OxideIdentity"}:
            emission.default_value = color


def render_stills(
    camera: bpy.types.Object,
    materials: dict[str, bpy.types.Material],
) -> tuple[dict[str, float], list[str]]:
    scene = bpy.context.scene
    scene.frame_set(FRAME_BREATHE)
    views = (
        ("hero-close-color", (2.25, -3.85, 2.18), (0.02, -0.31, 1.08), 72.0, None, False),
        ("three-quarter-color", (-2.65, -4.65, 2.35), (0.0, -0.30, 1.02), 68.0, None, False),
        ("front-ortho-color", (0.0, -5.0, 1.00), (0.0, -0.26, 1.00), 70.0, 2.15, False),
        ("side-ortho-color", (4.7, -0.30, 1.00), (0.0, -0.30, 1.00), 70.0, 2.15, False),
        ("back-ortho-color", (0.0, 1.23, 1.00), (0.0, -0.03, 1.00), 70.0, 2.15, False),
        ("weapon-contact-color", (1.18, -2.30, 1.56), (0.14, -0.51, 1.25), 102.0, None, False),
        ("trigger-contact-color", (-0.92, -1.75, 1.44), (0.02, -0.43, 1.20), 108.0, None, False),
        ("hero-close-grayscale", (2.25, -3.85, 2.18), (0.02, -0.31, 1.08), 72.0, None, True),
        ("front-ortho-grayscale", (0.0, -5.0, 1.00), (0.0, -0.26, 1.00), 70.0, 2.15, True),
    )
    timings: dict[str, float] = {}
    paths: list[str] = []
    grayscale_state = False
    for name, location, target, lens, ortho_scale, grayscale in views:
        if grayscale != grayscale_state:
            set_grayscale(materials, grayscale)
            grayscale_state = grayscale
        set_camera(camera, location, target, lens=lens, ortho_scale=ortho_scale)
        path = RENDER_DIR / f"kyx-vanguard-v5b-{name}.png"
        scene.render.filepath = str(path)
        render_started = time.perf_counter()
        bpy.ops.render.render(write_still=True)
        timings[name] = round(time.perf_counter() - render_started, 6)
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
    select_export_objects(collection)
    started = time.perf_counter()
    result = bpy.ops.export_scene.gltf(
        filepath=str(GLB_PATH),
        check_existing=False,
        export_format="GLB",
        use_selection=True,
        export_copyright="KYX project-original scripted Vanguard v5; no third-party source geometry",
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
        raise RuntimeError("Invalid GLB header")
    version, declared_length = struct.unpack_from("<II", data, 4)
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError("GLB first chunk is not JSON")
    document = json.loads(data[20:20 + json_length].rstrip(b" \x00").decode("utf-8"))
    animations = document.get("animations", [])
    nodes = document.get("nodes", [])
    return {
        "version": version,
        "declaredBytes": declared_length,
        "generator": document.get("asset", {}).get("generator"),
        "nodes": len(nodes),
        "nodeNames": [node.get("name") for node in nodes if node.get("name")],
        "meshes": len(document.get("meshes", [])),
        "primitives": sum(len(mesh.get("primitives", [])) for mesh in document.get("meshes", [])),
        "materials": len(document.get("materials", [])),
        "skins": len(document.get("skins", [])),
        "animations": len(animations),
        "animationNames": [item.get("name") for item in animations],
        "animationChannels": sum(len(item.get("channels", [])) for item in animations),
        "requiredExtensions": document.get("extensionsRequired", []),
    }


def output_manifest(paths: list[Path]) -> list[dict[str, object]]:
    return [
        {"path": path.relative_to(LANE_DIR).as_posix(), "bytes": path.stat().st_size, "sha256": sha256(path)}
        for path in paths
    ]


def source_statistics(collection: bpy.types.Collection) -> dict[str, object]:
    meshes = [obj for obj in collection.all_objects if obj.type == "MESH"]
    curves = [obj for obj in collection.all_objects if obj.type == "CURVE"]
    armatures = [obj for obj in collection.all_objects if obj.type == "ARMATURE"]
    vertices = sum(len(obj.data.vertices) for obj in meshes)
    polygons = sum(len(obj.data.polygons) for obj in meshes)
    triangles = 0
    for obj in meshes:
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
    return {
        "meshObjects": len(meshes),
        "curveObjects": len(curves),
        "vertices": vertices,
        "polygons": polygons,
        "triangles": triangles,
        "armatures": len(armatures),
        "bones": sum(len(obj.data.bones) for obj in armatures),
        "materials": len({slot.material.name for obj in meshes + curves for slot in obj.material_slots if slot.material}),
    }


def main() -> None:
    started = time.perf_counter()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    RENDER_DIR.mkdir(parents=True, exist_ok=True)
    reset_scene()
    configure_scene()
    export_collection = make_collection("COLL_KYX_Vanguard_OriginalV5_EXPORT")
    presentation_collection = make_collection("COLL_KYX_Vanguard_OriginalV5_PRESENTATION")
    materials = {
        "ink": make_material("MAT_Ink", INK, metallic=0.10, roughness=0.50),
        "suit": make_material("MAT_ContinuousTechnicalSuit", SUIT, roughness=0.91, micro_weave=0.16),
        "suit_raised": make_material("MAT_RaisedTechnicalCloth", SUIT_RAISED, roughness=0.86, micro_weave=0.12),
        "rubber": make_material("MAT_BlackRubber", RUBBER, roughness=0.78, micro_weave=0.04),
        "armor": make_material("MAT_PaperCeramic", ARMOR, metallic=0.05, roughness=0.54, micro_weave=0.025),
        "armor_edge": make_material("MAT_CeramicEdge", ARMOR_EDGE, metallic=0.09, roughness=0.48),
        "oxide": make_material("MAT_OxideIdentity", OXIDE, metallic=0.04, roughness=0.58),
        "teal": make_material("MAT_TealSystem", TEAL, metallic=0.10, roughness=0.26, emission_strength=0.70),
        "metal": make_material("MAT_BrushedMetal", METAL, metallic=0.62, roughness=0.34),
        "gunmetal": make_material("MAT_Gunmetal", GUNMETAL, metallic=0.72, roughness=0.30),
        "floor": make_material("MAT_PresentationFloor", FLOOR, roughness=0.66),
        "backdrop": make_material("MAT_PresentationBackdrop", BACKDROP, roughness=0.82),
    }

    armature = build_rig(export_collection)
    body = build_unified_body(export_collection, materials["suit"])
    weight_counts = skin_body(body, armature)
    gear = build_armor_and_gear(export_collection, armature, materials)
    rifle, weapon_contact, frame = build_authored_rifle(export_collection, armature, materials)
    hands, hand_contact = build_gloved_hands(export_collection, armature, materials, frame)
    action = build_animation(armature)
    camera = build_presentation(presentation_collection, materials)
    render_timings, render_paths = render_stills(camera, materials)

    bpy.context.scene.frame_set(FRAME_START)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH), check_existing=False)
    export_seconds = export_glb(export_collection)
    glb = inspect_glb(GLB_PATH)
    stats = source_statistics(export_collection)
    exported_names = set(glb["nodeNames"])
    required_names = {
        "CHR_KYX_Vanguard_ContinuousUndersuit",
        "RIG_KYX_Vanguard_OriginalV5",
        "WEAPON_UnifiedReceiver",
        "GLOVE_R_Index_Phalanx_1",
        "GLOVE_L_ShapedSupportPalm",
        "HELMET_CeramicCrownShell",
    }
    checks = {
        "glbHeaderValid": glb["version"] == 2 and glb["declaredBytes"] == GLB_PATH.stat().st_size,
        "glbContainsMeshes": glb["meshes"] > 0,
        "glbContainsSkin": glb["skins"] >= 1,
        "glbContainsAnimation": glb["animations"] >= 1 and action.name in glb["animationNames"],
        "glbContainsRequiredNamedForms": required_names.issubset(exported_names),
        "continuousBodySingleMesh": body.type == "MESH" and len(body.data.vertices) > 1000,
        "originalSourceMetadata": bool(body.get("kyx_original_geometry")) and bool(armature.get("kyx_original_source")),
        "twoHandContactGeometryAuthored": hand_contact["literalContactCount"] >= 9,
        "reviewRendersPresent": all((LANE_DIR / path).is_file() for path in render_paths),
        "conceptDigestPinned": CONCEPT_SHA256 == "067a3eba77f9c9e566fe7aeba9684346bfd9fcd162de8ead14194640c0fb76c3",
    }
    report = {
        "schemaVersion": 1,
        "assetId": "kyx_vanguard_original_v5b",
        "status": "HUMAN_VISUAL_REVIEW_REQUIRED_NOT_G6",
        "releaseEligible": False,
        "runtimeIntegrationAllowed": False,
        "humanApproved": False,
        "originality": {
            "sourceType": "clean_room_project_original_blender_python_build",
            "importsThirdPartyGeometry": False,
            "derivesFromLegacySoldier": False,
            "explicitlyForbiddenSource": "public/soldier.glb",
            "conceptReference": CONCEPT_REL,
            "conceptSha256": CONCEPT_SHA256,
            "script": SCRIPT_PATH.relative_to(SCRIPT_PATH.parents[5]).as_posix() if len(SCRIPT_PATH.parents) > 5 else SCRIPT_PATH.name,
            "note": "Broad tactical garment and industrial design principles only; no named artist or franchise source geometry.",
        },
        "intent": {
            "visualCorrections": [
                "authored tailored torso and anatomical section lofts replacing the rejected voxel-inflated body",
                "limited constructed ceramic shells over cloth instead of pasted plate clutter",
                "multi-part crown visor cheek chin and gasket helmet instead of an egg primitive",
                "profiled boot upper outsole heel counter toe cap and retention instead of blocks",
                "fitted profiled palms and individual tapered phalanges with literal trigger grip and forward-handguard contact",
                "one shared authored rifle design frame with open stock unified receiver curved magazine vents barrel optic and muzzle",
            ],
            "asymmetry": "larger left pauldron with oxide identity ribbon and compact forearm device",
            "paletteMasses": ["charcoal technical cloth", "paper ceramic", "gunmetal", "oxide identity", "teal system light"],
        },
        "blenderVersion": bpy.app.version_string,
        "scene": {
            "forwardAxis": "-Y",
            "upAxis": "+Z",
            "units": "meters",
            "frames": [FRAME_START, FRAME_END],
            "fps": FPS,
            "renderSize": [RENDER_SIZE, RENDER_SIZE],
        },
        "source": {
            **stats,
            "continuousBodyVertices": len(body.data.vertices),
            "weightCounts": weight_counts,
            "gearObjectCounts": {name: len(items) for name, items in gear.items()},
            "rifleObjects": len(rifle),
            "handObjects": len(hands),
            "action": action.name,
        },
        "contact": {"weaponAnchors": weapon_contact, "hands": hand_contact},
        "glb": {
            **{key: value for key, value in glb.items() if key != "nodeNames"},
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
        "verification": {
            "status": "PASS" if all(checks.values()) else "FAIL",
            "checks": checks,
            "scope": "source and export structure plus authored contact geometry only; never human visual approval, runtime integration, deformation approval, LOD approval, or G6",
        },
        "knownOpenRequirements": [
            "human visual decision against close front side back grayscale and contact renders",
            "deformation review through full benchmark locomotion and combat clip matrix",
            "authored UV texture sets and final texel-density review",
            "LOD0 LOD1 LOD2 generation plus measured 2 4 8 player runtime performance",
            "first-person arms and canonical runtime skeleton integration",
            "runtime material outline contact shadow and clipping review",
        ],
    }
    generated_paths = [GLB_PATH, BLEND_PATH] + [LANE_DIR / path for path in render_paths]
    report["manifest"] = output_manifest(generated_paths)
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "verification": report["verification"],
        "source": report["source"],
        "glb": {key: value for key, value in report["glb"].items() if key != "nodeNames"},
        "elapsedSeconds": round(time.perf_counter() - started, 6),
        "report": str(REPORT_PATH),
    }, indent=2))
    if not all(checks.values()):
        raise RuntimeError("Original v5b structural verification failed")


if __name__ == "__main__":
    main()
