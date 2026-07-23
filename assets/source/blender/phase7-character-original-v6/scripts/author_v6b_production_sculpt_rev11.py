"""Author KYX Vanguard V6-B production-sculpt construction revision 11.

This is a clean construction lane from the accepted V6-A anatomy.  It does not
reuse the rejected predicate-cut plate system.  The accepted human remains the
continuous technical-garment surface; armor uses smooth authored strip/loft
topology, the helmet is a connected multi-volume assembly, the boots use
measured shoe lasts, and the rifle has genuine three-dimensional volume.

Checkpoint only: no rig, retopology, UV, runtime export, contact, or G6 claim.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Iterable

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
SOURCE_BODY = "KYX_V6A_AnatomySculpt_Body"
PREFIX = "KYX_V6B_PROD_R11_"
CHECKPOINT = "V6-B_PRODUCTION_SCULPT_REV11"


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <accepted-v6a.blend> <rev11.blend> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tag(obj: bpy.types.Object, role: str) -> bpy.types.Object:
    obj["kyx_checkpoint"] = CHECKPOINT
    obj["kyx_role"] = role
    obj["kyx_nonclaim"] = "V6-B visual construction only; not rigged, exported, runtime, contact, or G6"
    return obj


def relink(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def smooth(obj: bpy.types.Object) -> None:
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = True


def make_principled_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.5,
    coat: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    coat_socket = bsdf.inputs.get("Coat Weight") or bsdf.inputs.get("Clearcoat")
    if coat_socket is not None:
        coat_socket.default_value = coat
    return material


def make_fabric_material(name: str) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.018, 0.026, 0.033, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.67
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 185.0
    noise.inputs["Detail"].default_value = 2.2
    noise.inputs["Roughness"].default_value = 0.52
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.16
    bump.inputs["Distance"].default_value = 0.0012
    links.new(noise.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def make_visor_material(name: str) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.004, 0.020, 0.030, 1.0)
    bsdf.inputs["Metallic"].default_value = 0.48
    bsdf.inputs["Roughness"].default_value = 0.10
    emission = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
    strength = bsdf.inputs.get("Emission Strength")
    if emission is not None:
        emission.default_value = (0.0, 0.15, 0.24, 1.0)
    if strength is not None:
        strength.default_value = 0.22
    return material


def make_emissive_material(
    name: str,
    color: tuple[float, float, float, float],
    strength_value: float,
) -> bpy.types.Material:
    material = make_principled_material(name, color, roughness=0.26)
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    emission = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
    strength = bsdf.inputs.get("Emission Strength")
    if emission is not None:
        emission.default_value = color
    if strength is not None:
        strength.default_value = strength_value
    return material


def new_mesh_object(
    name: str,
    vertices: Iterable[tuple[float, float, float]],
    faces: Iterable[tuple[int, ...]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(list(vertices), [], list(faces))
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    smooth(obj)
    return tag(obj, role)


def add_modifiers(
    obj: bpy.types.Object,
    *,
    subdivision: int = 0,
    solidify: float = 0.0,
    bevel: float = 0.0,
    bevel_segments: int = 3,
) -> bpy.types.Object:
    if subdivision:
        modifier = obj.modifiers.new("SculptSurfaceSubdivision", "SUBSURF")
        modifier.subdivision_type = "CATMULL_CLARK"
        modifier.levels = subdivision
        modifier.render_levels = subdivision
    if solidify:
        modifier = obj.modifiers.new("ManufacturedThickness", "SOLIDIFY")
        modifier.thickness = solidify
        modifier.offset = 0.0
        modifier.use_even_offset = True
        modifier.use_quality_normals = True
    if bevel:
        modifier = obj.modifiers.new("SoftManufacturedEdge", "BEVEL")
        modifier.width = bevel
        modifier.segments = bevel_segments
        modifier.limit_method = "ANGLE"
    return obj


def add_beveled_box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.008,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    relink(obj, collection)
    obj.data.materials.append(material)
    smooth(obj)
    add_modifiers(obj, bevel=min(bevel, min(dimensions) * 0.42), bevel_segments=4)
    return tag(obj, role)


def add_cylinder_between(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    vertices: int = 32,
) -> bpy.types.Object:
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=direction.length,
        location=(start_v + end_v) * 0.5,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    relink(obj, collection)
    obj.data.materials.append(material)
    smooth(obj)
    add_modifiers(obj, bevel=radius * 0.16, bevel_segments=3)
    return tag(obj, role)


def add_curve(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    cyclic: bool = False,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 4
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for control, coordinate in zip(spline.bezier_points, points):
        control.co = coordinate
        control.handle_left_type = "AUTO"
        control.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    curve.materials.append(material)
    return tag(obj, role)


def add_elliptical_loft(
    name: str,
    rings: list[tuple[float, float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    segments: int = 64,
    cyclic: bool = True,
    subdivision: int = 1,
    solidify: float = 0.0,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    sample_count = segments if cyclic else segments + 1
    for z, center_y, radius_x, radius_y in rings:
        for index in range(sample_count):
            angle = math.tau * index / segments
            vertices.append((radius_x * math.cos(angle), center_y + radius_y * math.sin(angle), z))
    for ring_index in range(len(rings) - 1):
        current = ring_index * sample_count
        following = (ring_index + 1) * sample_count
        limit = sample_count if cyclic else sample_count - 1
        for index in range(limit):
            nxt = (index + 1) % sample_count
            faces.append((current + index, current + nxt, following + nxt, following + index))
    obj = new_mesh_object(name, vertices, faces, collection, material, role)
    add_modifiers(obj, subdivision=subdivision, solidify=solidify, bevel=0.0018 if solidify else 0.0)
    return obj


def make_body_bvh(body: bpy.types.Object) -> BVHTree:
    body.data.calc_loop_triangles()
    return BVHTree.FromPolygons(
        [vertex.co.copy() for vertex in body.data.vertices],
        [tuple(triangle.vertices) for triangle in body.data.loop_triangles],
        all_triangles=True,
    )


def surface_hit(
    bvh: BVHTree,
    x: float,
    z: float,
    *,
    front: bool,
    offset: float,
) -> Vector:
    origin = Vector((x, -0.55 if front else 0.55, z))
    direction = Vector((0.0, 1.0 if front else -1.0, 0.0))
    location, normal, _index, _distance = bvh.ray_cast(origin, direction, 1.25)
    if location is None or normal is None:
        raise RuntimeError(f"No body hit at x={x:.4f}, z={z:.4f}, front={front}")
    return location + normal.normalized() * offset


def add_body_fitted_strip(
    name: str,
    rows: list[tuple[float, float, float]],
    body_bvh: BVHTree,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    front: bool,
    offset: float = 0.008,
    columns: int = 14,
    thickness: float = 0.010,
    bevel: float = 0.003,
) -> bpy.types.Object:
    """Build a clean quad-strip shell; row endpoints author the silhouette.

    Unlike predicate-cut face masks, the boundary is a deliberate smooth curve
    independent of the vendor topology.  Every vertex is projected to V6-A.
    """
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, minimum_x, maximum_x in rows:
        for column in range(columns):
            t = column / (columns - 1)
            eased = t * t * (3.0 - 2.0 * t)
            x = minimum_x + (maximum_x - minimum_x) * eased
            vertices.append(tuple(surface_hit(body_bvh, x, z, front=front, offset=offset)))
    for row in range(len(rows) - 1):
        current = row * columns
        following = (row + 1) * columns
        for column in range(columns - 1):
            faces.append((current + column, current + column + 1, following + column + 1, following + column))
    obj = new_mesh_object(name, vertices, faces, collection, material, role)
    add_modifiers(obj, subdivision=1, solidify=thickness, bevel=bevel, bevel_segments=4)
    obj["surface_fit_method"] = "authored quad-strip projected to accepted V6-A BVH"
    return obj


def perpendicular_basis(axis: Vector, preferred: Vector) -> tuple[Vector, Vector]:
    axis = axis.normalized()
    first = preferred - axis * preferred.dot(axis)
    if first.length < 1.0e-5:
        first = Vector((1.0, 0.0, 0.0)) - axis * axis.x
    first.normalize()
    second = axis.cross(first).normalized()
    return first, second


def add_partial_limb_shell(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radii: tuple[float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    span_degrees: float = 205.0,
    axial_steps: int = 9,
    radial_steps: int = 16,
    center_direction: Vector = Vector((0.0, -1.0, 0.0)),
    thickness: float = 0.009,
) -> bpy.types.Object:
    start_v = Vector(start)
    end_v = Vector(end)
    axis = (end_v - start_v).normalized()
    front, lateral = perpendicular_basis(axis, center_direction)
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    half_span = math.radians(span_degrees) * 0.5
    for axial in range(axial_steps):
        t = axial / (axial_steps - 1)
        eased = t * t * (3.0 - 2.0 * t)
        center = start_v.lerp(end_v, eased)
        radius = radii[0] + (radii[1] - radii[0]) * eased
        crown = math.sin(math.pi * t) * radius * 0.05
        for radial in range(radial_steps):
            angle = -half_span + 2.0 * half_span * radial / (radial_steps - 1)
            position = center + front * (math.cos(angle) * radius + crown) + lateral * (math.sin(angle) * radius * 0.94)
            vertices.append(tuple(position))
    for axial in range(axial_steps - 1):
        current = axial * radial_steps
        following = (axial + 1) * radial_steps
        for radial in range(radial_steps - 1):
            faces.append((current + radial, current + radial + 1, following + radial + 1, following + radial))
    obj = new_mesh_object(name, vertices, faces, collection, material, role)
    add_modifiers(obj, subdivision=1, solidify=thickness, bevel=min(0.0035, thickness * 0.42), bevel_segments=4)
    return obj


def add_superellipse_axis_loft(
    name: str,
    sections: list[tuple[float, float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    exponent: float = 3.4,
    ring_steps: int = 24,
    bevel: float = 0.004,
) -> bpy.types.Object:
    """Loft along X; section=(x, center_z, half_y, half_z)."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for x, center_z, half_y, half_z in sections:
        for index in range(ring_steps):
            angle = math.tau * index / ring_steps
            cosine = math.cos(angle)
            sine = math.sin(angle)
            y = half_y * math.copysign(abs(cosine) ** (2.0 / exponent), cosine)
            z = center_z + half_z * math.copysign(abs(sine) ** (2.0 / exponent), sine)
            vertices.append((x, y, z))
    for section in range(len(sections) - 1):
        current = section * ring_steps
        following = (section + 1) * ring_steps
        for index in range(ring_steps):
            nxt = (index + 1) % ring_steps
            faces.append((current + index, current + nxt, following + nxt, following + index))
    faces.append(tuple(reversed(range(ring_steps))))
    last = (len(sections) - 1) * ring_steps
    faces.append(tuple(last + index for index in range(ring_steps)))
    obj = new_mesh_object(name, vertices, faces, collection, material, role)
    add_modifiers(obj, subdivision=1, bevel=bevel, bevel_segments=4)
    return obj


def add_helmet_sector(
    name: str,
    rings: list[tuple[float, float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    theta_start: float = math.radians(-24.0),
    theta_end: float = math.radians(204.0),
    angular_steps: int = 38,
    thickness: float = 0.012,
) -> bpy.types.Object:
    """Open front crown/rear shell with a controlled manufactured profile."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, center_y, radius_x, radius_y in rings:
        for index in range(angular_steps):
            t = index / (angular_steps - 1)
            theta = theta_start + (theta_end - theta_start) * t
            vertices.append((radius_x * math.cos(theta), center_y + radius_y * math.sin(theta), z))
    for ring in range(len(rings) - 1):
        current = ring * angular_steps
        following = (ring + 1) * angular_steps
        for index in range(angular_steps - 1):
            faces.append((current + index, current + index + 1, following + index + 1, following + index))
    obj = new_mesh_object(name, vertices, faces, collection, material, role)
    add_modifiers(obj, subdivision=1, solidify=thickness, bevel=0.0035, bevel_segments=4)
    return obj


def add_visor(
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    columns = 21
    rows = 7
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for row in range(rows):
        v = row / (rows - 1)
        for column in range(columns):
            u = column / (columns - 1)
            x = -0.100 + 0.200 * u
            normalized_x = x / 0.100
            top = 1.724 - 0.034 * abs(normalized_x) ** 1.8
            bottom = 1.584 + 0.022 * abs(normalized_x) ** 1.5
            z = bottom + (top - bottom) * v
            # A single continuous compound-curved lens: center projects forward,
            # temples sweep back and the lower third gains a subtle chin taper.
            y = -0.145 - 0.035 * (1.0 - normalized_x * normalized_x) - 0.006 * (1.0 - v)
            vertices.append((x, y, z))
    for row in range(rows - 1):
        current = row * columns
        following = (row + 1) * columns
        for column in range(columns - 1):
            faces.append((current + column, current + column + 1, following + column + 1, following + column))
    obj = new_mesh_object(
        f"{PREFIX}Visor",
        vertices,
        faces,
        collection,
        material,
        "compound-curved sealed visor with temple sweep",
    )
    add_modifiers(obj, subdivision=1, solidify=0.008, bevel=0.0028, bevel_segments=4)
    return obj


def extrude_yz_profile(
    name: str,
    yz: list[tuple[float, float]],
    x_minimum: float,
    x_maximum: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.005,
) -> bpy.types.Object:
    count = len(yz)
    vertices = [(x_minimum, y, z) for y, z in yz] + [(x_maximum, y, z) for y, z in yz]
    faces: list[tuple[int, ...]] = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    obj = new_mesh_object(name, vertices, faces, collection, material, role)
    add_modifiers(obj, bevel=bevel, bevel_segments=5)
    return obj


def add_boot_last(
    side: float,
    label: str,
    collection: bpy.types.Collection,
    detail_collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    """Measured, low-profile shoe last with flat sole and articulated shaft."""
    objects: list[bpy.types.Object] = []
    center_x = 0.188 * side
    angle = 0.16 * side
    cosine = math.cos(angle)
    sine = math.sin(angle)

    def transform(lateral: float, longitudinal: float, z: float) -> tuple[float, float, float]:
        return (
            center_x + lateral * cosine - longitudinal * sine,
            -0.006 + lateral * sine + longitudinal * cosine,
            z,
        )

    # heel -> toe.  The toe is deliberately low and tapered, avoiding the
    # capsule/bulb silhouette of the rejected construction.
    sections = [
        (0.103, 0.044, 0.028, 0.104),
        (0.052, 0.056, 0.027, 0.118),
        (-0.018, 0.065, 0.026, 0.108),
        (-0.085, 0.069, 0.026, 0.092),
        (-0.145, 0.058, 0.027, 0.072),
        (-0.188, 0.025, 0.030, 0.056),
    ]
    ring_steps = 24
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for longitudinal, half_width, bottom, top in sections:
        center_z = (bottom + top) * 0.5
        half_height = (top - bottom) * 0.5
        for ring in range(ring_steps):
            theta = math.tau * ring / ring_steps
            lateral = half_width * math.copysign(abs(math.cos(theta)) ** 0.72, math.cos(theta))
            vertical = half_height * math.copysign(abs(math.sin(theta)) ** 0.88, math.sin(theta))
            vertices.append(transform(lateral, longitudinal, center_z + vertical))
    for section in range(len(sections) - 1):
        current = section * ring_steps
        following = (section + 1) * ring_steps
        for ring in range(ring_steps):
            nxt = (ring + 1) % ring_steps
            faces.append((current + ring, current + nxt, following + nxt, following + ring))
    faces.append(tuple(reversed(range(ring_steps))))
    last = (len(sections) - 1) * ring_steps
    faces.append(tuple(last + ring for ring in range(ring_steps)))
    last_obj = new_mesh_object(
        f"{PREFIX}BootLast_{label}", vertices, faces, collection, materials["boot"],
        "fully enclosed anatomically measured technical boot last",
    )
    add_modifiers(last_obj, subdivision=1, bevel=0.0035, bevel_segments=4)
    objects.append(last_obj)

    # Contoured outsole: a bevelled footprint rather than a rectangular slab.
    outline_local = [
        (-0.040, 0.112), (0.040, 0.112), (0.057, 0.060), (0.070, -0.025),
        (0.068, -0.105), (0.050, -0.166), (0.018, -0.202), (-0.018, -0.202),
        (-0.050, -0.166), (-0.068, -0.105), (-0.070, -0.025), (-0.057, 0.060),
    ]
    bottom_z, top_z = 0.010, 0.032
    sole_vertices = [transform(x, y, bottom_z) for x, y in outline_local]
    sole_vertices += [transform(x, y, top_z) for x, y in outline_local]
    count = len(outline_local)
    sole_faces: list[tuple[int, ...]] = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        sole_faces.append((index, nxt, count + nxt, count + index))
    sole = new_mesh_object(
        f"{PREFIX}BootOutsole_{label}", sole_vertices, sole_faces, detail_collection,
        materials["rubber"], "contoured articulated outsole with heel-to-toe rocker",
    )
    add_modifiers(sole, bevel=0.007, bevel_segments=4)
    objects.append(sole)

    # Close-fitted ankle shaft bridges the last to the suited lower leg.
    shaft_rings = []
    for z, radius_x, radius_y, y_offset in (
        (0.072, 0.058, 0.055, 0.034),
        (0.118, 0.060, 0.052, 0.028),
        (0.186, 0.053, 0.046, 0.022),
        (0.245, 0.047, 0.041, 0.018),
    ):
        shaft_rings.append((z, -0.006 + y_offset, radius_x, radius_y))
    shaft = add_elliptical_loft(
        f"{PREFIX}BootShaft_{label}", shaft_rings, collection, materials["boot"],
        "tapered articulated boot shaft enclosing ankle",
        segments=48, subdivision=1, solidify=0.006,
    )
    shaft.location.x = center_x
    objects.append(shaft)

    # Integrated ceramic toe bridge follows the top of the last.
    toe_points = []
    for longitudinal, half_width, _bottom, top in sections[3:]:
        for lateral in (-half_width * 0.78, half_width * 0.78):
            toe_points.append(transform(lateral, longitudinal, top + 0.003))
    # Reorder into perimeter: left heel -> left toe -> right toe -> right heel.
    toe_vertices = [toe_points[0], toe_points[2], toe_points[4], toe_points[5], toe_points[3], toe_points[1]]
    toe = new_mesh_object(
        f"{PREFIX}BootToeBridge_{label}", toe_vertices, [tuple(range(6))], collection,
        materials["ivory"], "low-profile integrated ceramic toe bridge",
    )
    add_modifiers(toe, subdivision=1, solidify=0.007, bevel=0.003, bevel_segments=4)
    objects.append(toe)

    # Tread lugs sit within the footprint and remain low enough to read as tread.
    for index, longitudinal in enumerate((0.070, 0.015, -0.045, -0.105, -0.160)):
        location = transform(0.0, longitudinal, 0.006)
        lug = add_beveled_box(
            f"{PREFIX}BootTread_{label}_{index + 1}", location, (0.086, 0.022, 0.010),
            detail_collection, materials["rubber"], "recessed transverse tread lug",
            bevel=0.004, rotation=(0.0, 0.0, angle),
        )
        objects.append(lug)
    return objects


def add_receiver_profile(
    name: str,
    xz: list[tuple[float, float]],
    depth: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    bevel: float,
) -> bpy.types.Object:
    count = len(xz)
    vertices = [(x, -depth * 0.5, z) for x, z in xz] + [(x, depth * 0.5, z) for x, z in xz]
    faces: list[tuple[int, ...]] = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    obj = new_mesh_object(name, vertices, faces, collection, material, role)
    add_modifiers(obj, bevel=bevel, bevel_segments=5)
    return obj


def add_strut_between(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    depth: float,
    thickness: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
) -> bpy.types.Object:
    start_v = Vector(start)
    end_v = Vector(end)
    direction = end_v - start_v
    length = direction.length
    angle = -math.atan2(direction.z, direction.x)
    return add_beveled_box(
        name, tuple((start_v + end_v) * 0.5), (length, depth, thickness), collection,
        material, role, bevel=min(thickness * 0.32, 0.007), rotation=(0.0, angle, 0.0),
    )


def build_character(
    body: bpy.types.Object,
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    garment = collections["garment"]
    armor = collections["armor"]
    detail = collections["detail"]
    bvh = make_body_bvh(body)

    # The accepted anatomy itself is the continuous suit surface.  This retains
    # every shoulder, elbow, wrist, finger, pelvis, knee, calf and ankle landmark
    # instead of replacing the person with tubes or a mannequin shell.
    body.name = f"{PREFIX}ContinuousTechnicalGarment"
    body.data.name = f"{PREFIX}ContinuousTechnicalGarment_Mesh"
    body.data.materials.clear()
    for material in (materials["fabric"], materials["flex"], materials["glove"]):
        body.data.materials.append(material)
    for polygon in body.data.polygons:
        center = polygon.center
        if (abs(center.x) > 0.355 and center.z < 0.94) or center.z < 0.16:
            polygon.material_index = 2
        elif (1.02 < center.z < 1.24 and abs(center.x) < 0.205) or (0.50 < center.z < 0.64):
            polygon.material_index = 1
        else:
            polygon.material_index = 0
    tag(body, "accepted V6-A anatomy as one continuous fitted woven technical garment")
    body["accepted_v6a_sha256"] = PINNED_V6A_SHA256
    objects.append(body)

    for obj in bpy.context.scene.objects:
        if obj.name.startswith("KYX_V6A_AnatomySculpt_Eye"):
            obj.hide_render = True
            obj.hide_viewport = True

    # Smooth, authored, body-projected thoracic shells.  Their outline comes
    # from evenly sampled rows, not topology masks, so no sawtooth borders.
    chest_rows = [
        (1.218, 0.055, 0.120),
        (1.252, 0.044, 0.135),
        (1.305, 0.030, 0.150),
        (1.365, 0.020, 0.205),
        (1.414, 0.052, 0.195),
        (1.438, 0.092, 0.160),
    ]
    for side, label in ((1.0, "L"), (-1.0, "R")):
        rows = chest_rows if side > 0.0 else [(z, -maximum, -minimum) for z, minimum, maximum in chest_rows]
        objects.append(add_body_fitted_strip(
            f"{PREFIX}ThoracicShell_{label}", rows, bvh, armor, materials["ivory"],
            "continuous-curvature fitted ceramic thoracic shell with authored perimeter",
            front=True, offset=0.010, thickness=0.012, bevel=0.0035,
        ))
    objects.append(add_body_fitted_strip(
        f"{PREFIX}BackYoke",
        [(1.210, -0.118, 0.118), (1.262, -0.135, 0.135), (1.330, -0.166, 0.166),
         (1.395, -0.194, 0.194), (1.432, -0.142, 0.142)],
        bvh, armor, materials["ivory"],
        "single flowing fitted back yoke with controlled lower articulation gap",
        front=False, offset=0.009, columns=24, thickness=0.011, bevel=0.0035,
    ))

    # A subtle central flex panel and low-profile harness establish garment
    # hierarchy without adding a barrel torso.
    objects.append(add_body_fitted_strip(
        f"{PREFIX}AbdominalFlexPanel",
        [(1.080, -0.104, 0.104), (1.122, -0.112, 0.112), (1.174, -0.120, 0.120),
         (1.205, -0.103, 0.103)],
        bvh, detail, materials["flex"], "recessed flexible abdominal articulation panel",
        front=True, offset=0.0045, columns=20, thickness=0.004, bevel=0.0015,
    ))
    harness = add_elliptical_loft(
        f"{PREFIX}WaistHarness",
        [(1.006, -0.010, 0.193, 0.113), (1.030, -0.011, 0.197, 0.116),
         (1.061, -0.010, 0.194, 0.112)],
        detail, materials["dark_metal"], "continuous low-profile waist harness",
        segments=72, subdivision=1, solidify=0.008,
    )
    objects.append(harness)
    objects.append(add_beveled_box(
        f"{PREFIX}HarnessBuckle", (0.0, -0.129, 1.034), (0.055, 0.012, 0.028),
        detail, materials["red"], "restrained integrated harness index", bevel=0.005,
    ))

    # Minimal curved protective shells retain joint gaps and human proportions.
    for side, label in ((1.0, "L"), (-1.0, "R")):
        objects.append(add_partial_limb_shell(
            f"{PREFIX}ShoulderShell_{label}",
            (0.257 * side, -0.004, 1.424), (0.335 * side, -0.002, 1.346),
            (0.098, 0.072), armor, materials["ivory"],
            "sculpted deltoid-clearance shoulder shell with open underside",
            span_degrees=220.0, axial_steps=10, radial_steps=18, thickness=0.010,
        ))
        objects.append(add_partial_limb_shell(
            f"{PREFIX}ForearmShell_{label}",
            (0.337 * side, -0.003, 1.116), (0.395 * side, -0.006, 0.967),
            (0.052, 0.043), armor, materials["ivory"],
            "tapered open forearm guard with wrist articulation clearance",
            span_degrees=184.0, axial_steps=10, radial_steps=16, thickness=0.008,
        ))
        objects.append(add_partial_limb_shell(
            f"{PREFIX}LateralThighShell_{label}",
            (0.172 * side, -0.002, 0.870), (0.160 * side, -0.006, 0.724),
            (0.079, 0.071), armor, materials["ivory"],
            "slim lateral thigh protection following quadriceps volume",
            span_degrees=122.0, axial_steps=10, radial_steps=14,
            center_direction=Vector((0.82 * side, -0.58, 0.0)), thickness=0.008,
        ))
        objects.append(add_partial_limb_shell(
            f"{PREFIX}KneeShell_{label}",
            (0.145 * side, -0.006, 0.612), (0.151 * side, -0.010, 0.535),
            (0.068, 0.059), armor, materials["ivory"],
            "rounded patella shell with exposed flex zone",
            span_degrees=178.0, axial_steps=8, radial_steps=16, thickness=0.009,
        ))
        objects.append(add_partial_limb_shell(
            f"{PREFIX}ShinShell_{label}",
            (0.153 * side, -0.003, 0.462), (0.169 * side, -0.001, 0.265),
            (0.058, 0.047), armor, materials["ivory"],
            "tapered tibia-following shell with ankle clearance",
            span_degrees=154.0, axial_steps=12, radial_steps=16, thickness=0.008,
        ))

        # Integrated red shoulder routing is a second fitted curved layer, not a decal.
        if label == "L":
            objects.append(add_partial_limb_shell(
                f"{PREFIX}ShoulderIdentityRoute_L",
                (0.277, -0.010, 1.437), (0.337, -0.008, 1.374),
                (0.102, 0.075), detail, materials["red"],
                "asymmetric fitted identity route over left shoulder shell",
                span_degrees=62.0, axial_steps=8, radial_steps=10,
                center_direction=Vector((0.30, -1.0, 0.05)), thickness=0.004,
            ))

        objects.extend(add_boot_last(side, label, garment, detail, materials))

    # Connected helmet: dark sealed liner, open-front manufactured crown, visor,
    # temple/cheek rails and a close fabric neck seal.
    inner = add_elliptical_loft(
        f"{PREFIX}HelmetInnerVolume",
        [(1.515, -0.006, 0.078, 0.070), (1.565, -0.010, 0.099, 0.091),
         (1.635, -0.012, 0.113, 0.112), (1.704, -0.006, 0.110, 0.113),
         (1.758, -0.001, 0.085, 0.087), (1.793, 0.002, 0.026, 0.030)],
        garment, materials["helmet_inner"], "sealed coherent helmet under-volume",
        segments=72, subdivision=1, solidify=0.005,
    )
    objects.append(inner)
    objects.append(add_helmet_sector(
        f"{PREFIX}HelmetCrownRear",
        [(1.585, -0.006, 0.112, 0.116), (1.650, -0.006, 0.121, 0.124),
         (1.714, -0.001, 0.112, 0.116), (1.765, 0.003, 0.080, 0.084),
         (1.795, 0.005, 0.030, 0.032)],
        armor, materials["ivory"], "continuous open-front crown and rear helmet shell",
    ))
    objects.append(add_visor(armor, materials["visor"]))
    cheek_profile = [
        (-0.142, 1.700), (-0.105, 1.744), (0.010, 1.722), (0.062, 1.655),
        (0.032, 1.590), (-0.104, 1.558), (-0.160, 1.606),
    ]
    for side, label in ((1.0, "L"), (-1.0, "R")):
        x_minimum, x_maximum = (0.074, 0.113) if side > 0.0 else (-0.113, -0.074)
        objects.append(extrude_yz_profile(
            f"{PREFIX}HelmetCheekRail_{label}", cheek_profile, x_minimum, x_maximum,
            armor, materials["ivory"], "curved structural temple-cheek rail joining crown and jaw",
            bevel=0.006,
        ))
        objects.append(add_beveled_box(
            f"{PREFIX}HelmetPivot_{label}", (0.110 * side, -0.005, 1.658),
            (0.018, 0.046, 0.050), detail, materials["dark_metal"],
            "recessed helmet visor pivot and fastener volume", bevel=0.008,
        ))
    objects.append(add_curve(
        f"{PREFIX}HelmetBrowIndex",
        [(-0.088, -0.155, 1.713), (-0.045, -0.174, 1.735), (0.018, -0.176, 1.735),
         (0.084, -0.153, 1.708)],
        0.0032, detail, materials["red"], "restrained integrated helmet brow identity seal",
    ))
    objects.append(add_elliptical_loft(
        f"{PREFIX}CloseFabricCowl",
        [(1.408, -0.004, 0.153, 0.102), (1.438, -0.010, 0.140, 0.096),
         (1.472, -0.012, 0.120, 0.086), (1.508, -0.008, 0.099, 0.074)],
        garment, materials["fabric"], "close technical-fabric cowl and helmet neck seal",
        segments=72, subdivision=1, solidify=0.007,
    ))

    objects.append(add_beveled_box(
        f"{PREFIX}ChestReadout", (0.143, -0.151, 1.342), (0.039, 0.009, 0.014),
        detail, materials["cyan"], "restrained embedded chest status readout", bevel=0.004,
    ))
    objects.append(add_beveled_box(
        f"{PREFIX}ForearmReadout", (0.401, -0.054, 1.020), (0.014, 0.009, 0.051),
        detail, materials["cyan"], "restrained embedded forearm status readout", bevel=0.004,
        rotation=(0.0, -0.34, 0.0),
    ))
    return objects


def build_rifle(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    dark = materials["dark_metal"]
    black = materials["glove"]
    ivory = materials["ivory"]
    red = materials["red"]
    cyan = materials["cyan"]

    objects.append(add_receiver_profile(
        f"{PREFIX}RifleReceiver",
        [(-0.245, 1.137), (0.118, 1.137), (0.162, 1.177), (0.142, 1.250),
         (-0.164, 1.270), (-0.238, 1.220)],
        0.105, collection, dark, "deep volumetric forged rifle receiver", bevel=0.012,
    ))
    # Smaller ceramic side saddle leaves the dark receiver visible as structure.
    objects.append(add_receiver_profile(
        f"{PREFIX}RifleReceiverSaddle",
        [(-0.172, 1.204), (0.086, 1.205), (0.118, 1.233), (-0.135, 1.246), (-0.195, 1.225)],
        0.115, collection, ivory, "curved ceramic receiver saddle with real side depth", bevel=0.008,
    ))
    objects.append(add_superellipse_axis_loft(
        f"{PREFIX}RifleHandguard",
        [(0.105, 1.202, 0.048, 0.064), (0.205, 1.202, 0.050, 0.066),
         (0.465, 1.202, 0.047, 0.061), (0.585, 1.202, 0.040, 0.050)],
        collection, ivory, "tapered fully volumetric handguard with softened manufactured section",
        exponent=4.2, ring_steps=28, bevel=0.004,
    ))

    # Skeletonized stock uses rectangular struts with real depth and a shoulder pad.
    objects.append(add_strut_between(
        f"{PREFIX}RifleStockUpper", (-0.210, 0.0, 1.238), (-0.492, 0.0, 1.294),
        0.064, 0.030, collection, dark, "upper stock spar with shoulder-load depth",
    ))
    objects.append(add_strut_between(
        f"{PREFIX}RifleStockLower", (-0.202, 0.0, 1.165), (-0.474, 0.0, 1.122),
        0.064, 0.028, collection, dark, "lower stock spar forming deliberate negative space",
    ))
    objects.append(add_strut_between(
        f"{PREFIX}RifleStockRear", (-0.492, 0.0, 1.294), (-0.474, 0.0, 1.122),
        0.068, 0.031, collection, black, "continuous stock heel bridge",
    ))
    objects.append(add_beveled_box(
        f"{PREFIX}RifleButtPad", (-0.501, 0.0, 1.207), (0.026, 0.086, 0.170),
        collection, black, "broad rubber shoulder butt pad", bevel=0.012,
    ))

    grip = add_receiver_profile(
        f"{PREFIX}RiflePistolGrip",
        [(-0.139, 1.151), (-0.058, 1.151), (-0.047, 1.010), (-0.096, 0.982), (-0.153, 1.070)],
        0.068, collection, black, "reachable angled pistol grip with palm-filling depth", bevel=0.009,
    )
    objects.append(grip)
    objects.append(add_receiver_profile(
        f"{PREFIX}RifleMagazine",
        [(-0.012, 1.143), (0.084, 1.143), (0.077, 0.966), (0.018, 0.938), (-0.020, 0.984)],
        0.058, collection, dark, "removable curved magazine with feed-path depth", bevel=0.008,
    ))

    objects.append(add_cylinder_between(
        f"{PREFIX}RifleBarrel", (0.548, 0.0, 1.202), (0.838, 0.0, 1.202),
        0.013, collection, dark, "free-floating rifle barrel", vertices=40,
    ))
    objects.append(add_cylinder_between(
        f"{PREFIX}RifleMuzzle", (0.820, 0.0, 1.202), (0.912, 0.0, 1.202),
        0.023, collection, dark, "multi-surface muzzle device", vertices=40,
    ))
    objects.append(add_cylinder_between(
        f"{PREFIX}RifleGasBlock", (0.512, 0.0, 1.202), (0.622, 0.0, 1.202),
        0.027, collection, dark, "recessed handguard gas-block volume", vertices=36,
    ))
    objects.append(add_beveled_box(
        f"{PREFIX}RifleTopRail", (0.170, 0.0, 1.280), (0.570, 0.038, 0.020),
        collection, dark, "continuous top rail with real transverse width", bevel=0.005,
    ))
    objects.append(add_beveled_box(
        f"{PREFIX}RifleBottomRail", (0.340, 0.0, 1.130), (0.300, 0.036, 0.018),
        collection, dark, "recessed lower accessory rail", bevel=0.004,
    ))
    support = add_beveled_box(
        f"{PREFIX}RifleSupportGrip", (0.330, 0.0, 1.073), (0.052, 0.064, 0.112),
        collection, black, "reachable support grip with three-dimensional palm depth", bevel=0.012,
        rotation=(0.0, -0.16, 0.0),
    )
    objects.append(support)

    # Deep side recesses and a top charging slot establish functional layering.
    for side, side_label in ((-1.0, "Near"), (1.0, "Far")):
        for index, x in enumerate((0.220, 0.310, 0.400, 0.490)):
            objects.append(add_beveled_box(
                f"{PREFIX}RifleVent_{side_label}_{index + 1}",
                (x, 0.052 * side, 1.210), (0.048, 0.008, 0.018), collection, dark,
                "recessed handguard vent inset with visible depth", bevel=0.004,
            ))
    objects.append(add_beveled_box(
        f"{PREFIX}RifleEjectionPort", (0.018, -0.058, 1.214), (0.092, 0.009, 0.032),
        collection, black, "deep receiver ejection port recess", bevel=0.005,
    ))
    objects.append(add_beveled_box(
        f"{PREFIX}RifleChargingHandle", (-0.150, 0.0, 1.284), (0.070, 0.072, 0.018),
        collection, dark, "reachable ambidextrous charging handle", bevel=0.005,
    ))
    objects.append(add_curve(
        f"{PREFIX}RifleTriggerGuard",
        [(-0.145, -0.035, 1.150), (-0.105, -0.043, 1.185), (-0.050, -0.035, 1.148)],
        0.006, collection, dark, "continuous trigger guard with finger clearance",
    ))
    objects.append(add_beveled_box(
        f"{PREFIX}RifleTrigger", (-0.101, -0.005, 1.151), (0.008, 0.030, 0.033),
        collection, dark, "reachable trigger blade", bevel=0.003,
    ))
    objects.append(add_beveled_box(
        f"{PREFIX}RifleFrontSight", (0.510, 0.0, 1.316), (0.028, 0.040, 0.060),
        collection, dark, "folded front sight", bevel=0.006,
    ))
    objects.append(add_beveled_box(
        f"{PREFIX}RifleRearSight", (-0.105, 0.0, 1.316), (0.034, 0.042, 0.055),
        collection, dark, "folded rear sight", bevel=0.006,
    ))
    objects.append(add_beveled_box(
        f"{PREFIX}RifleRedIndex", (0.126, -0.060, 1.242), (0.072, 0.008, 0.012),
        collection, red, "restrained rifle identity index", bevel=0.004,
    ))
    objects.append(add_beveled_box(
        f"{PREFIX}RifleStatus", (-0.050, -0.060, 1.246), (0.050, 0.008, 0.016),
        collection, cyan, "embedded cyan rifle status readout", bevel=0.004,
    ))

    for label, location in {
        "trigger": (-0.103, -0.072, 1.125),
        "support": (0.332, -0.074, 1.155),
        "shoulder": (-0.505, 0.0, 1.208),
    }.items():
        witness = bpy.data.objects.new(f"{PREFIX}CONTACT_{label}", None)
        witness.location = location
        witness.empty_display_type = "SPHERE"
        witness.empty_display_size = 0.014
        witness.hide_render = True
        collection.objects.link(witness)
        tag(witness, "future rigged literal-contact witness; not contact proof")
    return objects


def inventory(collections: list[bpy.types.Collection]) -> dict[str, object]:
    objects = [obj for collection in collections for obj in collection.objects]
    meshes = [obj for obj in objects if obj.type == "MESH"]
    curves = [obj for obj in objects if obj.type == "CURVE"]
    return {
        "collections": [collection.name for collection in collections],
        "objects": len(objects),
        "meshObjects": len(meshes),
        "curveObjects": len(curves),
        "meshVertices": sum(len(obj.data.vertices) for obj in meshes),
        "meshPolygons": sum(len(obj.data.polygons) for obj in meshes),
        "materials": sorted({slot.material.name for obj in meshes + curves for slot in obj.material_slots if slot.material}),
        "namedObjects": sorted(obj.name for obj in objects),
    }


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 3:
        raise SystemExit("Expected -- <accepted-v6a.blend> <rev11.blend> <report.json>")
    input_path, output_path, report_path = (Path(value).resolve() for value in arguments)
    if not input_path.is_file():
        raise FileNotFoundError(input_path)
    input_hash_before = sha256(input_path)
    if input_hash_before != PINNED_V6A_SHA256:
        raise RuntimeError(f"Pinned V6-A hash mismatch: {input_hash_before}")

    bpy.ops.wm.open_mainfile(filepath=str(input_path), load_ui=False, use_scripts=False)
    body = bpy.data.objects.get(SOURCE_BODY)
    if body is None:
        raise RuntimeError(f"Missing accepted V6-A body: {SOURCE_BODY}")

    root = bpy.data.collections.new(f"{PREFIX}ProductionSculptConstruction")
    bpy.context.scene.collection.children.link(root)
    collections: dict[str, bpy.types.Collection] = {}
    for key, suffix in (
        ("garment", "ContinuousGarment"), ("armor", "IntegratedArmor"),
        ("detail", "ManufacturedDetails"), ("rifle", "StandaloneVolumetricRifle"),
    ):
        collection = bpy.data.collections.new(f"{PREFIX}{suffix}")
        root.children.link(collection)
        collections[key] = collection

    materials = {
        "fabric": make_fabric_material(f"{PREFIX}WovenTechnicalCharcoal"),
        "flex": make_principled_material(f"{PREFIX}FlexKnit", (0.026, 0.038, 0.048, 1.0), roughness=0.78),
        "glove": make_principled_material(f"{PREFIX}GripRubber", (0.010, 0.014, 0.018, 1.0), roughness=0.52),
        "boot": make_principled_material(f"{PREFIX}BootComposite", (0.018, 0.026, 0.032, 1.0), roughness=0.48),
        "rubber": make_principled_material(f"{PREFIX}OutsoleRubber", (0.006, 0.009, 0.011, 1.0), roughness=0.74),
        "ivory": make_principled_material(f"{PREFIX}IvoryCeramic", (0.70, 0.66, 0.55, 1.0), roughness=0.32, coat=0.10),
        "dark_metal": make_principled_material(f"{PREFIX}GraphiteMetal", (0.028, 0.045, 0.058, 1.0), metallic=0.60, roughness=0.28),
        "red": make_principled_material(f"{PREFIX}SignalRed", (0.50, 0.020, 0.012, 1.0), metallic=0.16, roughness=0.34, coat=0.08),
        "cyan": make_emissive_material(f"{PREFIX}CyanReadout", (0.010, 0.54, 0.72, 1.0), 2.0),
        "visor": make_visor_material(f"{PREFIX}VisorGlass"),
        "helmet_inner": make_principled_material(f"{PREFIX}HelmetInner", (0.008, 0.016, 0.024, 1.0), metallic=0.24, roughness=0.26),
    }

    # Move the accepted body into the new construction hierarchy after its BVH
    # has been built.  Data stays local; the pinned input file remains immutable.
    relink(body, collections["garment"])
    character_objects = build_character(body, collections, materials)
    rifle_objects = build_rifle(collections["rifle"], materials)
    bpy.context.view_layer.update()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)
    input_hash_after = sha256(input_path)
    if input_hash_after != input_hash_before:
        raise RuntimeError("Accepted V6-A input changed during rev11 authoring")
    output_hash = sha256(output_path)

    authored_collections = [collections[key] for key in ("garment", "armor", "detail", "rifle")]
    report = {
        "schemaVersion": 1,
        "authoredUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "input": {
            "path": input_path.name,
            "sha256Before": input_hash_before,
            "sha256After": input_hash_after,
            "unchanged": input_hash_before == input_hash_after,
        },
        "output": {"path": output_path.name, "bytes": output_path.stat().st_size, "sha256": output_hash},
        "constructionMethod": {
            "garment": "Accepted continuous V6-A anatomy is the visible technical garment; subtle polygon material regions add flex and glove hierarchy without replacing anatomy.",
            "armor": "Authored quad strips raycast to the accepted body plus smooth partial-limb shell lofts; no predicate-cut face-mask boundaries.",
            "helmet": "Sealed inner volume, open-front crown/rear sector, compound-curved visor, structural cheek rails, close fabric cowl.",
            "boots": "Measured low-profile shoe lasts, contoured outsole footprints, tapered shafts, integrated toe bridges and recessed tread.",
            "rifle": "Deep receiver, superellipse handguard, dimensional skeleton stock, functional grip/magazine/rail/vent/control volumes.",
        },
        "inventory": inventory(authored_collections),
        "objectCounts": {"character": len(character_objects), "rifleAndWitnesses": len(rifle_objects)},
        "assertions": {
            "acceptedV6APinned": input_hash_before == PINNED_V6A_SHA256,
            "acceptedV6AUnchanged": input_hash_before == input_hash_after,
            "outputDiffersFromInput": output_hash != input_hash_before,
            "continuousAnatomicalGarment": body in character_objects,
            "noArmatures": len(bpy.data.armatures) == 0,
            "noActions": len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
        },
        "status": "V6B_PRODUCTION_SCULPT_REV11_REQUIRES_DIRECT_VISUAL_AUDIT",
        "nonClaims": [
            "Revision 11 is a V6-B visual construction candidate only; it is not G6.",
            "The rifle is standalone; literal rigged two-hand and shoulder contact remains open.",
            "No final retopology, authored UVs, texture bake, skeleton, animation, LOD, GLB, runtime integration, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "outputSha256": output_hash, "objects": report["inventory"]["objects"]}, sort_keys=True))


if __name__ == "__main__":
    main()
