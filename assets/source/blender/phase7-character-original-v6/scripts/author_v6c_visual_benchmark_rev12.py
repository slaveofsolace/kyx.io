"""Author the isolated KYX Vanguard V6-C visual benchmark revision 12.

Revision 12 is a modeling-strategy reset.  It opens only the accepted V6-A
anatomy checkpoint, hides that mesh as a proportion cage, and constructs a new
visible athletic technical suit, fitted panel system, segmented helmet, rear
load structure, and hard-surface rifle.  No revision 9/10/11 Blend is opened,
linked, appended, or used as geometry.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


PREFIX = "KYX_V6C_BENCH_R12_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV12"
SOURCE_BODY = "KYX_V6A_AnatomySculpt_Body"
PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
PINNED_REFERENCE_SHA256 = "9c188fa32daaeec2d284727a5d9e600f94b8b57fee6f0568c7ebac9d462abdd2"


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def mesh_geometry_sha256(obj: bpy.types.Object) -> str:
    digest = hashlib.sha256()
    for vertex in obj.data.vertices:
        digest.update(f"{vertex.co.x:.9f},{vertex.co.y:.9f},{vertex.co.z:.9f};".encode())
    for polygon in obj.data.polygons:
        digest.update((",".join(str(index) for index in polygon.vertices) + ";").encode())
    return digest.hexdigest()


def tag(obj: bpy.types.Object, role: str, tier: str = "primary") -> bpy.types.Object:
    obj["kyx_checkpoint"] = CHECKPOINT
    obj["kyx_role"] = role
    obj["kyx_detail_tier"] = tier
    obj["kyx_visible_strategy"] = "athletic loft + fitted curved shells + authored profile volumes"
    return obj


def make_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.new(PREFIX + name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def link_only(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    collection.objects.link(obj)


def material(
    name: str,
    base_color: tuple[float, float, float, float],
    metallic: float,
    roughness: float,
    *,
    noise_scale: float = 0.0,
    bump_strength: float = 0.0,
    coat: float = 0.0,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(PREFIX + name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
        bsdf.inputs["Coat Roughness"].default_value = max(0.08, roughness * 0.55)
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if noise_scale > 0.0:
        noise = nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = noise_scale
        noise.inputs["Detail"].default_value = 5.0
        noise.inputs["Roughness"].default_value = 0.72
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = bump_strength
        bump.inputs["Distance"].default_value = 0.012 if metallic < 0.35 else 0.004
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.28
        ramp.color_ramp.elements[0].color = (roughness * 0.52,) * 3 + (1.0,)
        ramp.color_ramp.elements[1].position = 0.76
        ramp.color_ramp.elements[1].color = (min(1.0, roughness * 1.35),) * 3 + (1.0,)
        links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], bsdf.inputs["Roughness"])
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    return mat


def make_materials() -> dict[str, bpy.types.Material]:
    return {
        "weave": material("GraphiteHexWeave", (0.0007, 0.0012, 0.0022, 1.0), 0.04, 0.63, noise_scale=135.0, bump_strength=0.31),
        "joint": material("BlackFlexJoint", (0.00015, 0.00025, 0.0005, 1.0), 0.02, 0.76, noise_scale=82.0, bump_strength=0.24),
        "ceramic": material("WarmGunmetalCeramic", (0.038, 0.044, 0.048, 1.0), 0.34, 0.34, noise_scale=18.0, bump_strength=0.052, coat=0.20),
        "ceramic_dark": material("SmokedCeramic", (0.005, 0.008, 0.013, 1.0), 0.42, 0.35, noise_scale=23.0, bump_strength=0.046, coat=0.14),
        "gunmetal": material("DeepGunmetalFrame", (0.0008, 0.0015, 0.0030, 1.0), 0.78, 0.25, noise_scale=32.0, bump_strength=0.042, coat=0.18),
        "edge": material("MachinedEdge", (0.055, 0.064, 0.070, 1.0), 0.86, 0.21, noise_scale=28.0, bump_strength=0.022, coat=0.26),
        "rubber": material("TreadRubber", (0.0002, 0.0003, 0.0005, 1.0), 0.0, 0.83, noise_scale=64.0, bump_strength=0.34),
        "visor": material("PetrolBallisticVisor", (0.0004, 0.007, 0.013, 1.0), 0.72, 0.14, noise_scale=9.0, bump_strength=0.014, coat=0.50),
        "cyan": material("CyanTelemetry", (0.003, 0.18, 0.24, 1.0), 0.22, 0.20, emission=(0.0, 0.72, 1.0, 1.0), emission_strength=5.0, coat=0.35),
        "red": material("SafetyRed", (0.15, 0.008, 0.004, 1.0), 0.18, 0.30, emission=(0.55, 0.012, 0.005, 1.0), emission_strength=1.4),
    }


def add_mesh(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...] | list[int]],
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    smooth: bool = True,
    solidify: float = 0.0,
    bevel: float = 0.0,
    subdiv: int = 0,
    tier: str = "primary",
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(PREFIX + name + "_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(PREFIX + name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = smooth
    if solidify > 0.0:
        mod = obj.modifiers.new("FittedShellThickness", "SOLIDIFY")
        mod.thickness = solidify
        mod.offset = 0.0
        mod.use_even_offset = True
        mod.use_quality_normals = True
    if bevel > 0.0:
        mod = obj.modifiers.new("ManufacturedEdgeRadius", "BEVEL")
        mod.width = bevel
        mod.segments = 3
        mod.limit_method = "ANGLE"
    if subdiv > 0:
        mod = obj.modifiers.new("SculptSubdivision", "SUBSURF")
        mod.subdivision_type = "CATMULL_CLARK"
        mod.levels = subdiv
        mod.render_levels = min(2, subdiv + 1)
    return tag(obj, role, tier)


def loft_z(
    name: str,
    rings: list[tuple[float, float, float, float, float]],
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    segments: int = 28,
    subdiv: int = 1,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    for z, rx, ry, cx, cy in rings:
        for index in range(segments):
            angle = math.tau * index / segments
            harmonic = 1.0 + 0.025 * math.cos(4.0 * angle)
            vertices.append((cx + rx * math.cos(angle) * harmonic, cy + ry * math.sin(angle), z))
    faces: list[tuple[int, ...]] = []
    for row in range(len(rings) - 1):
        for index in range(segments):
            nxt = (index + 1) % segments
            a = row * segments + index
            b = row * segments + nxt
            c = (row + 1) * segments + nxt
            d = (row + 1) * segments + index
            faces.append((a, b, c, d))
    faces.append(tuple(reversed(range(segments))))
    last = (len(rings) - 1) * segments
    faces.append(tuple(last + index for index in range(segments)))
    return add_mesh(name, vertices, faces, collection, mat, role, subdiv=subdiv)


def loft_path(
    name: str,
    rings: list[tuple[tuple[float, float, float], float, float]],
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    segments: int = 20,
    subdiv: int = 1,
    tier: str = "primary",
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    centers = [Vector(item[0]) for item in rings]
    for row, (center_tuple, r_side, r_depth) in enumerate(rings):
        center = Vector(center_tuple)
        if row == 0:
            tangent = centers[1] - centers[0]
        elif row == len(rings) - 1:
            tangent = centers[-1] - centers[-2]
        else:
            tangent = centers[row + 1] - centers[row - 1]
        tangent.normalize()
        depth_axis = Vector((0.0, 1.0, 0.0))
        side_axis = tangent.cross(depth_axis).normalized()
        for index in range(segments):
            angle = math.tau * index / segments
            p = center + side_axis * (math.sin(angle) * r_side) + depth_axis * (math.cos(angle) * r_depth)
            vertices.append(tuple(p))
    faces: list[tuple[int, ...]] = []
    for row in range(len(rings) - 1):
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((row * segments + index, row * segments + nxt, (row + 1) * segments + nxt, (row + 1) * segments + index))
    faces.append(tuple(reversed(range(segments))))
    last = (len(rings) - 1) * segments
    faces.append(tuple(last + index for index in range(segments)))
    return add_mesh(name, vertices, faces, collection, mat, role, subdiv=subdiv, tier=tier)


def torso_metrics(z: float) -> tuple[float, float]:
    keys = [
        (0.90, 0.215, 0.122), (1.00, 0.225, 0.132), (1.10, 0.242, 0.142),
        (1.22, 0.290, 0.158), (1.34, 0.340, 0.174), (1.44, 0.390, 0.174),
        (1.50, 0.355, 0.157),
    ]
    if z <= keys[0][0]:
        return keys[0][1], keys[0][2]
    if z >= keys[-1][0]:
        return keys[-1][1], keys[-1][2]
    for a, b in zip(keys, keys[1:]):
        if a[0] <= z <= b[0]:
            t = (z - a[0]) / (b[0] - a[0])
            return (a[1] * (1.0 - t) + b[1] * t, a[2] * (1.0 - t) + b[2] * t)
    raise AssertionError


def front_surface_y(x: float, z: float, extra: float = 0.0) -> float:
    rx, ry = torso_metrics(z)
    normalized = min(0.86, (abs(x) / max(rx, 1e-6)) ** 2)
    return -(ry * math.sqrt(max(0.14, 1.0 - normalized)) + extra)


def back_surface_y(x: float, z: float, extra: float = 0.0) -> float:
    rx, ry = torso_metrics(z)
    normalized = min(0.86, (abs(x) / max(rx, 1e-6)) ** 2)
    return ry * math.sqrt(max(0.14, 1.0 - normalized)) + extra


def fitted_front_plate(
    name: str,
    side: int,
    rows: list[tuple[float, float, float, float]],
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    across: int = 7,
    thickness: float = 0.014,
    bevel: float = 0.005,
    tier: str = "primary",
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    for z, inner, outer, extra in rows:
        for index in range(across):
            u = index / (across - 1)
            positive_x = inner * (1.0 - u) + outer * u
            x = side * positive_x
            crown = 0.0045 * math.sin(math.pi * u)
            vertices.append((x, front_surface_y(x, z, extra + crown), z))
    faces: list[tuple[int, ...]] = []
    for row in range(len(rows) - 1):
        for index in range(across - 1):
            a = row * across + index
            faces.append((a, a + 1, a + across + 1, a + across))
    return add_mesh(name, vertices, faces, collection, mat, role, solidify=thickness, bevel=bevel, tier=tier)


def fitted_back_plate(
    name: str,
    side: int,
    rows: list[tuple[float, float, float, float]],
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    across: int = 7,
    thickness: float = 0.014,
    bevel: float = 0.005,
    tier: str = "primary",
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    for z, inner, outer, extra in rows:
        for index in range(across):
            u = index / (across - 1)
            positive_x = inner * (1.0 - u) + outer * u
            x = side * positive_x
            crown = 0.004 * math.sin(math.pi * u)
            vertices.append((x, back_surface_y(x, z, extra + crown), z))
    faces: list[tuple[int, ...]] = []
    for row in range(len(rows) - 1):
        for index in range(across - 1):
            a = row * across + index
            faces.append((a, a + across, a + across + 1, a + 1))
    return add_mesh(name, vertices, faces, collection, mat, role, solidify=thickness, bevel=bevel, tier=tier)


def limb_shell(
    name: str,
    side: int,
    rings: list[tuple[tuple[float, float, float], float, float]],
    angle_center: float,
    angle_span: float,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    angular_steps: int = 11,
    thickness: float = 0.012,
    bevel: float = 0.0045,
    tier: str = "primary",
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    for center_tuple, r_side, r_depth in rings:
        center = Vector(center_tuple)
        for index in range(angular_steps):
            angle = angle_center - angle_span + 2.0 * angle_span * index / (angular_steps - 1)
            x = center.x + side * math.sin(angle) * r_side
            y = center.y + math.cos(angle) * r_depth
            vertices.append((x, y, center.z))
    faces: list[tuple[int, ...]] = []
    for row in range(len(rings) - 1):
        for index in range(angular_steps - 1):
            a = row * angular_steps + index
            faces.append((a, a + 1, a + angular_steps + 1, a + angular_steps))
    return add_mesh(name, vertices, faces, collection, mat, role, solidify=thickness, bevel=bevel, tier=tier)


def ellipsoid_patch_z(
    name: str,
    center: tuple[float, float, float],
    radii: tuple[float, float, float],
    phi_range: tuple[float, float],
    theta_range: tuple[float, float],
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    phi_steps: int = 9,
    theta_steps: int = 13,
    thickness: float = 0.012,
    bevel: float = 0.004,
    tier: str = "primary",
) -> bpy.types.Object:
    cx, cy, cz = center
    rx, ry, rz = radii
    vertices: list[tuple[float, float, float]] = []
    for i in range(phi_steps):
        phi = phi_range[0] + (phi_range[1] - phi_range[0]) * i / (phi_steps - 1)
        for j in range(theta_steps):
            theta = theta_range[0] + (theta_range[1] - theta_range[0]) * j / (theta_steps - 1)
            vertices.append((
                cx + rx * math.sin(phi) * math.sin(theta),
                cy - ry * math.sin(phi) * math.cos(theta),
                cz + rz * math.cos(phi),
            ))
    faces: list[tuple[int, ...]] = []
    for i in range(phi_steps - 1):
        for j in range(theta_steps - 1):
            a = i * theta_steps + j
            faces.append((a, a + 1, a + theta_steps + 1, a + theta_steps))
    return add_mesh(name, vertices, faces, collection, mat, role, solidify=thickness, bevel=bevel, tier=tier)


def shoulder_patch(
    name: str,
    side: int,
    phi_range: tuple[float, float],
    theta_range: tuple[float, float],
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    tier: str = "primary",
) -> bpy.types.Object:
    cx, cy, cz = side * 0.388, -0.004, 1.408
    rx, ry, rz = 0.116, 0.122, 0.106
    phi_steps, theta_steps = 9, 13
    vertices: list[tuple[float, float, float]] = []
    for i in range(phi_steps):
        phi = phi_range[0] + (phi_range[1] - phi_range[0]) * i / (phi_steps - 1)
        for j in range(theta_steps):
            theta = theta_range[0] + (theta_range[1] - theta_range[0]) * j / (theta_steps - 1)
            vertices.append((
                cx + side * rx * math.cos(phi),
                cy + ry * math.sin(phi) * math.sin(theta),
                cz + rz * math.sin(phi) * math.cos(theta),
            ))
    faces: list[tuple[int, ...]] = []
    for i in range(phi_steps - 1):
        for j in range(theta_steps - 1):
            a = i * theta_steps + j
            faces.append((a, a + theta_steps, a + theta_steps + 1, a + 1))
    return add_mesh(name, vertices, faces, collection, mat, role, solidify=0.014, bevel=0.005, tier=tier)


def profile_volume_xz(
    name: str,
    outline: list[tuple[float, float]],
    y_front: float,
    y_back: float,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.005,
    tier: str = "secondary",
) -> bpy.types.Object:
    count = len(outline)
    vertices = [(x, y_front, z) for x, z in outline] + [(x, y_back, z) for x, z in outline]
    faces: list[tuple[int, ...]] = [tuple(reversed(range(count))), tuple(count + index for index in range(count))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    return add_mesh(name, vertices, faces, collection, mat, role, bevel=bevel, tier=tier)


def profile_volume_xy(
    name: str,
    outline: list[tuple[float, float]],
    z_bottom: float,
    z_top: float,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.005,
    tier: str = "secondary",
) -> bpy.types.Object:
    count = len(outline)
    vertices = [(x, y, z_bottom) for x, y in outline] + [(x, y, z_top) for x, y in outline]
    faces: list[tuple[int, ...]] = [tuple(reversed(range(count))), tuple(count + index for index in range(count))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    return add_mesh(name, vertices, faces, collection, mat, role, bevel=bevel, tier=tier)


def curve_beam(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    tier: str = "secondary",
    cyclic: bool = False,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(PREFIX + name + "_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(PREFIX + name, curve)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    return tag(obj, role, tier)


def add_box(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.004,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    tier: str = "tertiary",
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = PREFIX + name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_only(obj, collection)
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
    if bevel > 0:
        mod = obj.modifiers.new("ManufacturedEdgeRadius", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    return tag(obj, role, tier)


def add_cylinder(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    axis: str = "Y",
    tier: str = "tertiary",
    vertices: int = 20,
) -> bpy.types.Object:
    rotation = (math.pi / 2.0, 0.0, 0.0) if axis == "Y" else ((0.0, math.pi / 2.0, 0.0) if axis == "X" else (0.0, 0.0, 0.0))
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = PREFIX + name
    link_only(obj, collection)
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    mod = obj.modifiers.new("MachinedEdge", "BEVEL")
    mod.width = min(radius * 0.22, 0.004)
    mod.segments = 2
    return tag(obj, role, tier)


def foot_last(
    name: str,
    side: int,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
) -> bpy.types.Object:
    cx = side * 0.175
    stations = [
        (0.105, 0.060, 0.066, 0.056),
        (0.030, 0.068, 0.064, 0.054),
        (-0.075, 0.080, 0.058, 0.048),
        (-0.175, 0.090, 0.052, 0.040),
        (-0.245, 0.078, 0.046, 0.030),
    ]
    segments = 20
    vertices: list[tuple[float, float, float]] = []
    for y, rx, zc, rz in stations:
        for index in range(segments):
            angle = math.tau * index / segments
            flatten = 0.22 if math.sin(angle) < 0 else 1.0
            vertices.append((cx + rx * math.cos(angle), y, zc + rz * math.sin(angle) * flatten))
    faces: list[tuple[int, ...]] = []
    for row in range(len(stations) - 1):
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((row * segments + index, row * segments + nxt, (row + 1) * segments + nxt, (row + 1) * segments + index))
    faces.append(tuple(reversed(range(segments))))
    last = (len(stations) - 1) * segments
    faces.append(tuple(last + index for index in range(segments)))
    return add_mesh(name, vertices, faces, collection, mat, role, subdiv=1)


def combat_boot_upper(
    name: str,
    side: int,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
) -> bpy.types.Object:
    """A shaped ankle/instep/toe volume with a deliberate boot side profile."""
    cx = side * 0.175
    stations = [
        (0.105, 0.064, 0.118, 0.082),
        (0.035, 0.070, 0.122, 0.086),
        (-0.050, 0.078, 0.106, 0.068),
        (-0.125, 0.086, 0.083, 0.043),
        (-0.205, 0.080, 0.068, 0.029),
        (-0.245, 0.065, 0.061, 0.021),
    ]
    segments = 20
    vertices: list[tuple[float, float, float]] = []
    exponent = 2.0 / 3.0
    for y, half_width, z_center, z_radius in stations:
        for index in range(segments):
            angle = math.tau * index / segments
            cosine, sine = math.cos(angle), math.sin(angle)
            x_shape = math.copysign(abs(cosine) ** exponent, cosine)
            z_shape = math.copysign(abs(sine) ** exponent, sine)
            vertices.append((cx + half_width * x_shape, y, z_center + z_radius * z_shape))
    faces: list[tuple[int, ...]] = []
    for row in range(len(stations) - 1):
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((row * segments + index, row * segments + nxt, (row + 1) * segments + nxt, (row + 1) * segments + index))
    faces.append(tuple(reversed(range(segments))))
    last = (len(stations) - 1) * segments
    faces.append(tuple(last + index for index in range(segments)))
    return add_mesh(name, vertices, faces, collection, mat, role, subdiv=1)


def build_undersuit(collection: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> dict[str, list]:
    parts: dict[str, list] = {"arms": [], "legs": [], "hands": [], "feet": []}
    loft_z(
        "AthleticTorsoUndersuit",
        [
            (0.90, 0.215, 0.122, 0.0, 0.0), (0.98, 0.222, 0.130, 0.0, -0.002),
            (1.08, 0.238, 0.140, 0.0, -0.004), (1.18, 0.272, 0.151, 0.0, -0.005),
            (1.28, 0.320, 0.167, 0.0, -0.004), (1.38, 0.365, 0.174, 0.0, -0.001),
            (1.46, 0.390, 0.168, 0.0, 0.002), (1.50, 0.342, 0.149, 0.0, 0.004),
        ], collection, mats["weave"], "athletic technical undersuit torso", segments=32, subdiv=1,
    )
    loft_z(
        "AnatomicalPelvisUndersuit",
        [
            (0.74, 0.190, 0.102, 0.0, 0.006), (0.80, 0.225, 0.118, 0.0, 0.003),
            (0.89, 0.242, 0.125, 0.0, 0.000), (0.98, 0.215, 0.120, 0.0, -0.002),
        ], collection, mats["weave"], "fitted pelvis underlayer", segments=30, subdiv=1,
    )
    loft_z(
        "FlexibleNeckSeal",
        [(1.45, 0.105, 0.095, 0.0, 0.004), (1.53, 0.100, 0.092, 0.0, 0.000), (1.59, 0.098, 0.090, 0.0, -0.003)],
        collection, mats["joint"], "ribbed neck seal", segments=28, subdiv=1,
    )
    loft_z(
        "HelmetInnerCranialSock",
        [
            (1.53, 0.100, 0.090, 0.0, -0.003), (1.59, 0.135, 0.118, 0.0, -0.005),
            (1.70, 0.151, 0.135, 0.0, -0.002), (1.79, 0.128, 0.116, 0.0, 0.002),
            (1.835, 0.055, 0.055, 0.0, 0.004),
        ], collection, mats["joint"], "hidden helmet sock", segments=30, subdiv=1,
    )
    for side in (-1, 1):
        arm_rings = [
            ((side * 0.390, 0.000, 1.430), 0.095, 0.105),
            ((side * 0.425, -0.002, 1.345), 0.090, 0.096),
            ((side * 0.452, -0.006, 1.230), 0.078, 0.086),
            ((side * 0.458, -0.010, 1.105), 0.064, 0.072),
            ((side * 0.450, -0.014, 1.035), 0.065, 0.070),
            ((side * 0.437, -0.018, 0.900), 0.058, 0.064),
            ((side * 0.425, -0.022, 0.790), 0.046, 0.052),
        ]
        parts["arms"].append(loft_path(f"{'L' if side < 0 else 'R'}_OrganicArmUndersuit", arm_rings, collection, mats["weave"], "anatomical arm undersuit", segments=22, subdiv=1))
        hand_rings = [
            ((side * 0.425, -0.022, 0.790), 0.048, 0.052),
            ((side * 0.420, -0.038, 0.735), 0.052, 0.040),
            ((side * 0.416, -0.046, 0.675), 0.046, 0.030),
        ]
        parts["hands"].append(loft_path(f"{'L' if side < 0 else 'R'}_GlovePalm", hand_rings, collection, mats["joint"], "fitted glove palm", segments=16, subdiv=1))
        for finger in range(4):
            lateral = (finger - 1.5) * 0.018
            x = side * (0.392 + finger * 0.012)
            rings = [
                ((x, -0.048, 0.686 - lateral * 0.1), 0.0085, 0.0080),
                ((x + side * 0.002, -0.052, 0.635 + abs(lateral) * 0.16), 0.0072, 0.0068),
                ((x + side * 0.001, -0.050, 0.602 + abs(lateral) * 0.22), 0.0050, 0.0048),
            ]
            loft_path(f"{'L' if side < 0 else 'R'}_GloveFinger_{finger+1}", rings, collection, mats["joint"], "articulated glove digit", segments=10, subdiv=1, tier="tertiary")
        thumb_x = side * 0.448
        loft_path(
            f"{'L' if side < 0 else 'R'}_GloveThumb",
            [((thumb_x, -0.045, 0.724), 0.010, 0.010), ((side * 0.456, -0.056, 0.690), 0.008, 0.008), ((side * 0.452, -0.058, 0.665), 0.005, 0.005)],
            collection, mats["joint"], "glove thumb", segments=10, subdiv=1, tier="tertiary",
        )
        leg_rings = [
            ((side * 0.178, 0.002, 0.905), 0.125, 0.145),
            ((side * 0.184, -0.004, 0.790), 0.122, 0.142),
            ((side * 0.190, -0.010, 0.675), 0.105, 0.120),
            ((side * 0.186, -0.012, 0.555), 0.077, 0.084),
            ((side * 0.183, -0.004, 0.475), 0.083, 0.092),
            ((side * 0.180, 0.004, 0.345), 0.092, 0.105),
            ((side * 0.176, 0.008, 0.205), 0.071, 0.081),
            ((side * 0.174, 0.005, 0.115), 0.059, 0.064),
        ]
        parts["legs"].append(loft_path(f"{'L' if side < 0 else 'R'}_OrganicLegUndersuit", leg_rings, collection, mats["weave"], "anatomical leg undersuit", segments=24, subdiv=1))
        parts["feet"].append(foot_last(f"{'L' if side < 0 else 'R'}_SculptedBootLast", side, collection, mats["rubber"], "sculpted boot last"))
    return parts


def build_helmet(collection: bpy.types.Collection, micro: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    center = (0.0, -0.003, 1.687)
    radii = (0.162, 0.142, 0.174)
    ellipsoid_patch_z("Helmet_CrownCenter", center, radii, (0.08, 0.96), (-0.52, 0.52), collection, mats["ceramic"], "segmented crown center", thickness=0.014, bevel=0.0045)
    ellipsoid_patch_z("Helmet_CrownLeft", center, radii, (0.12, 1.08), (0.58, 1.62), collection, mats["ceramic_dark"], "left crown shell", thickness=0.014, bevel=0.0045)
    ellipsoid_patch_z("Helmet_CrownRight", center, radii, (0.12, 1.08), (-1.62, -0.58), collection, mats["ceramic_dark"], "right crown shell", thickness=0.014, bevel=0.0045)
    ellipsoid_patch_z("Helmet_RearCrown", center, radii, (0.16, 1.22), (2.18, 4.10), collection, mats["ceramic"], "segmented rear crown", thickness=0.014, bevel=0.0045)
    gasket_outline = [(-0.132, 1.742), (-0.104, 1.772), (0.104, 1.772), (0.132, 1.742), (0.112, 1.668), (0.0, 1.625), (-0.112, 1.668)]
    visor_outline = [(-0.119, 1.738), (-0.096, 1.758), (0.096, 1.758), (0.119, 1.738), (0.096, 1.680), (0.0, 1.645), (-0.096, 1.680)]
    profile_volume_xz("Helmet_VisorGasket", gasket_outline, -0.157, -0.132, collection, mats["joint"], "continuous visor gasket", bevel=0.006)
    profile_volume_xz("Helmet_AggressiveVisor", visor_outline, -0.168, -0.150, collection, mats["visor"], "narrow aggressive ballistic visor", bevel=0.005)
    for side in (-1, 1):
        cheek = [(side * 0.100, 1.645), (side * 0.146, 1.665), (side * 0.160, 1.590), (side * 0.112, 1.535), (side * 0.055, 1.565)]
        profile_volume_xz(f"Helmet_{'L' if side < 0 else 'R'}_CheekJaw", cheek, -0.142, -0.090, collection, mats["ceramic"], "cheek and jaw shell", bevel=0.006)
        brow = [(side * 0.010, 1.792), (side * 0.112, 1.790), (side * 0.154, 1.755), (side * 0.135, 1.725), (side * 0.012, 1.747)]
        profile_volume_xz(f"Helmet_{'L' if side < 0 else 'R'}_BrowBlade", brow, -0.166, -0.130, collection, mats["ceramic"], "sloped brow armor", bevel=0.0045)
        temple = [(side * 0.144, 1.744), (side * 0.174, 1.720), (side * 0.171, 1.610), (side * 0.143, 1.575), (side * 0.124, 1.642)]
        profile_volume_xz(f"Helmet_{'L' if side < 0 else 'R'}_TempleRail", temple, -0.118, 0.012, collection, mats["gunmetal"], "temple structural rail", bevel=0.005)
        add_cylinder(f"Helmet_{'L' if side < 0 else 'R'}_AudioHub", (side * 0.174, 0.005, 1.662), 0.034, 0.020, collection, mats["gunmetal"], "recessed side audio hub", axis="X")
        add_cylinder(f"Helmet_{'L' if side < 0 else 'R'}_AudioRing", (side * 0.185, 0.005, 1.662), 0.023, 0.008, micro, mats["edge"], "audio hub retaining ring", axis="X")
        curve_beam(
            f"Helmet_{'L' if side < 0 else 'R'}_CrownSeam",
            [(side * 0.030, -0.128, 1.838), (side * 0.092, -0.132, 1.811), (side * 0.145, -0.105, 1.748)],
            0.0032, micro, mats["gunmetal"], "helmet crown panel seam", tier="tertiary",
        )
    profile_volume_xz("Helmet_ChinGuard", [(-0.105, 1.608), (0.0, 1.572), (0.105, 1.608), (0.074, 1.535), (0.0, 1.512), (-0.074, 1.535)], -0.154, -0.092, collection, mats["ceramic_dark"], "integrated chin guard", bevel=0.006)
    profile_volume_xz("Helmet_ForeheadKeel", [(-0.030, 1.834), (0.0, 1.848), (0.030, 1.834), (0.026, 1.786), (0.0, 1.775), (-0.026, 1.786)], -0.163, -0.137, collection, mats["gunmetal"], "forehead sensor keel", bevel=0.0035, tier="secondary")
    add_box("Helmet_ForeheadCyan", (0.0, -0.168, 1.810), (0.016, 0.004, 0.005), micro, mats["cyan"], "forehead telemetry", bevel=0.002, tier="tertiary")
    profile_volume_xz("Helmet_RearOccipitalUpper", [(-0.115, 1.780), (0.0, 1.812), (0.115, 1.780), (0.132, 1.705), (0.0, 1.680), (-0.132, 1.705)], 0.122, 0.158, collection, mats["ceramic_dark"], "upper occipital armor panel", bevel=0.006)
    profile_volume_xz("Helmet_RearOccipitalLower", [(-0.128, 1.690), (0.0, 1.712), (0.128, 1.690), (0.106, 1.588), (0.0, 1.558), (-0.106, 1.588)], 0.118, 0.160, collection, mats["gunmetal"], "lower occipital and neck interface", bevel=0.006)
    add_box("Helmet_RearCyan", (0.0, 0.165, 1.635), (0.010, 0.004, 0.023), micro, mats["cyan"], "rear helmet telemetry", bevel=0.002, tier="tertiary")
    for z, radius in ((1.535, 0.111), (1.555, 0.108), (1.575, 0.104)):
        curve_beam(f"Helmet_NeckRing_{int(z*1000)}", [(radius * math.cos(a), radius * math.sin(a), z) for a in [i * math.tau / 12 for i in range(13)]], 0.004, collection, mats["gunmetal"], "articulated neck ring", cyclic=True)


def build_torso(front: bpy.types.Collection, rear: bpy.types.Collection, micro: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    for side in (-1, 1):
        fitted_front_plate(
            f"Chest_{'L' if side < 0 else 'R'}_ClaviclePlate", side,
            [(1.385, 0.075, 0.285, 0.020), (1.440, 0.095, 0.335, 0.019), (1.482, 0.135, 0.292, 0.017)],
            front, mats["ceramic"], "seated clavicle armor plate", across=8, thickness=0.015, bevel=0.0055,
        )
        fitted_front_plate(
            f"Chest_{'L' if side < 0 else 'R'}_PectoralShell", side,
            [(1.270, 0.060, 0.245, 0.020), (1.325, 0.055, 0.292, 0.021), (1.378, 0.075, 0.305, 0.019)],
            front, mats["ceramic_dark"], "stepped pectoral armor shell", across=8, thickness=0.016, bevel=0.0055,
        )
        fitted_front_plate(
            f"Chest_{'L' if side < 0 else 'R'}_LowerRibShell", side,
            [(1.155, 0.060, 0.190, 0.017), (1.210, 0.055, 0.235, 0.019), (1.255, 0.065, 0.255, 0.017)],
            front, mats["gunmetal"], "overlapping lower rib shell", across=8, thickness=0.013, bevel=0.0045,
        )
        curve_beam(
            f"Chest_{'L' if side < 0 else 'R'}_ClavicleRail",
            [(side * 0.060, -0.176, 1.468), (side * 0.185, -0.176, 1.475), (side * 0.315, -0.142, 1.443), (side * 0.390, -0.090, 1.405)],
            0.009, front, mats["gunmetal"], "clavicle load rail",
        )
        curve_beam(
            f"Chest_{'L' if side < 0 else 'R'}_ObliqueRail",
            [(side * 0.060, -0.170, 1.185), (side * 0.170, -0.163, 1.155), (side * 0.248, -0.105, 1.085), (side * 0.240, -0.060, 1.000)],
            0.008, front, mats["gunmetal"], "oblique load rail",
        )
        for index, z in enumerate((1.260, 1.310, 1.360)):
            curve_beam(
                f"Chest_{'L' if side < 0 else 'R'}_PectoralSeam_{index+1}",
                [(side * 0.085, front_surface_y(side * 0.085, z, 0.028), z), (side * 0.205, front_surface_y(side * 0.205, z - 0.012, 0.028), z - 0.012), (side * 0.300, front_surface_y(side * 0.300, z - 0.026, 0.025), z - 0.026)],
                0.0028, micro, mats["gunmetal"], "recessed pectoral seam", tier="tertiary",
            )
        fitted_back_plate(
            f"Back_{'L' if side < 0 else 'R'}_ScapularShell", side,
            [(1.320, 0.075, 0.255, 0.017), (1.405, 0.095, 0.315, 0.019), (1.475, 0.140, 0.280, 0.017)],
            rear, mats["ceramic_dark"], "upper segmented scapular armor", across=8, thickness=0.015, bevel=0.0055,
        )
        fitted_back_plate(
            f"Back_{'L' if side < 0 else 'R'}_LowerScapularShell", side,
            [(1.185, 0.070, 0.200, 0.015), (1.245, 0.065, 0.235, 0.017), (1.305, 0.075, 0.252, 0.016)],
            rear, mats["gunmetal"], "lower scapular articulation plate", across=7, thickness=0.013, bevel=0.0045,
        )
        fitted_back_plate(
            f"Back_{'L' if side < 0 else 'R'}_LumbarFlankShell", side,
            [(0.985, 0.070, 0.155, 0.014), (1.060, 0.065, 0.195, 0.016), (1.135, 0.070, 0.215, 0.015)],
            rear, mats["ceramic_dark"], "fitted lumbar flank carrier", across=7, thickness=0.012, bevel=0.0045,
        )
        curve_beam(
            f"Back_{'L' if side < 0 else 'R'}_ScapularRail",
            [(side * 0.070, 0.180, 1.445), (side * 0.180, 0.180, 1.430), (side * 0.315, 0.136, 1.385), (side * 0.265, 0.112, 1.250)],
            0.0085, rear, mats["gunmetal"], "rear scapular load rail",
        )
    profile_volume_xz("Chest_SternumKeel", [(-0.048, 1.470), (0.0, 1.495), (0.048, 1.470), (0.060, 1.235), (0.0, 1.185), (-0.060, 1.235)], -0.203, -0.158, front, mats["gunmetal"], "segmented sternum keel", bevel=0.006)
    profile_volume_xz("Chest_SternumCeramicInset", [(-0.028, 1.430), (0.0, 1.451), (0.028, 1.430), (0.030, 1.285), (0.0, 1.252), (-0.030, 1.285)], -0.214, -0.199, micro, mats["ceramic"], "sternum inset plate", bevel=0.0035, tier="secondary")
    add_box("Chest_SternumCyan", (0.0, -0.221, 1.360), (0.010, 0.003, 0.034), micro, mats["cyan"], "sternum telemetry spine", bevel=0.002)
    abdominal_rows = [(1.165, 0.190), (1.105, 0.178), (1.045, 0.165), (0.990, 0.152)]
    for index, (z, width) in enumerate(abdominal_rows):
        profile_volume_xz(
            f"Abdomen_Lamella_{index+1}",
            [(-width, z + 0.028), (0.0, z + 0.040), (width, z + 0.028), (width * 0.88, z - 0.020), (0.0, z - 0.032), (-width * 0.88, z - 0.020)],
            front_surface_y(0.0, z, 0.014 + index * 0.002), front_surface_y(0.0, z, -0.012), front,
            mats["ceramic_dark"] if index % 2 else mats["gunmetal"], "articulated abdominal lamella", bevel=0.0045,
        )
    profile_volume_xz("Back_UpperSpinePack", [(-0.068, 1.458), (0.0, 1.486), (0.068, 1.458), (0.078, 1.330), (0.0, 1.302), (-0.078, 1.330)], 0.174, 0.208, rear, mats["gunmetal"], "upper purpose-built spine pack", bevel=0.006)
    profile_volume_xz("Back_LowerSpinePack", [(-0.074, 1.288), (0.0, 1.310), (0.074, 1.288), (0.068, 1.188), (0.0, 1.162), (-0.068, 1.188)], 0.168, 0.202, rear, mats["ceramic_dark"], "lower purpose-built spine pack", bevel=0.006)
    curve_beam("Back_SpinePackContinuousRail", [(0.0, 0.210, 1.475), (0.0, 0.207, 1.325), (0.0, 0.199, 1.180), (0.0, 0.176, 1.035), (0.0, 0.160, 0.920)], 0.0065, rear, mats["edge"], "continuous rear spine pack to waist rail")
    for index, z in enumerate((1.410, 1.340, 1.270, 1.200, 1.125, 1.055, 0.995, 0.940)):
        width = max(0.034, 0.050 - index * 0.002)
        profile_volume_xz(
            f"Back_SpineVertebra_{index+1}",
            [(-width, z + 0.026), (0.0, z + 0.038), (width, z + 0.026), (width * 0.88, z - 0.024), (0.0, z - 0.034), (-width * 0.88, z - 0.024)],
            back_surface_y(0.0, z, 0.026), back_surface_y(0.0, z, 0.012), rear,
            mats["ceramic_dark"] if index % 2 else mats["ceramic"], "articulated rear spine plate", bevel=0.004,
        )
    add_box("Back_PackCyan", (0.0, 0.212, 1.350), (0.009, 0.003, 0.028), micro, mats["cyan"], "rear pack telemetry", bevel=0.002)
    profile_volume_xz("Back_LumbarWaistBridge", [(-0.155, 1.015), (0.0, 1.045), (0.155, 1.015), (0.135, 0.948), (0.0, 0.920), (-0.135, 0.948)], 0.132, 0.165, rear, mats["gunmetal"], "continuous lumbar and waist carrier", bevel=0.006)
    for side in (-1, 1):
        curve_beam(
            f"Back_{'L' if side < 0 else 'R'}_WaistCarrierRail",
            [(side * 0.040, 0.166, 1.060), (side * 0.105, 0.160, 1.005), (side * 0.190, 0.130, 0.950), (side * 0.240, 0.080, 0.885)],
            0.0075, rear, mats["edge"], "rear spine to hip carrier rail",
        )


def build_shoulders_arms(collection: bpy.types.Collection, micro: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    for side in (-1, 1):
        label = "L" if side < 0 else "R"
        curve_beam(
            f"{label}_Shoulder_SeatRail",
            [(side * 0.310, -0.090, 1.432), (side * 0.370, -0.112, 1.430), (side * 0.430, -0.104, 1.400), (side * 0.470, -0.075, 1.350)],
            0.0075, collection, mats["gunmetal"], "physical clavicle to deltoid carrier seat",
        )
        upper_rings = [
            ((side * 0.420, -0.004, 1.340), 0.092, 0.098),
            ((side * 0.447, -0.008, 1.270), 0.082, 0.089),
            ((side * 0.457, -0.010, 1.185), 0.073, 0.080),
        ]
        limb_shell(f"{label}_Shoulder_DeltoidShell", side, upper_rings[:2], 2.42, 0.68, collection, mats["ceramic_dark"], "clavicle-seated fitted deltoid shell", angular_steps=10, thickness=0.013, bevel=0.005)
        limb_shell(f"{label}_Bicep_OuterPlate", side, upper_rings, 2.38, 0.82, collection, mats["ceramic_dark"], "fitted bicep outer plate", thickness=0.012, bevel=0.005)
        elbow_rings = [
            ((side * 0.459, -0.011, 1.145), 0.068, 0.074),
            ((side * 0.458, -0.012, 1.095), 0.068, 0.073),
            ((side * 0.454, -0.013, 1.052), 0.066, 0.070),
        ]
        limb_shell(f"{label}_Elbow_ArticulatedCup", side, elbow_rings, math.pi, 0.76, collection, mats["gunmetal"], "articulated elbow cup", thickness=0.013, bevel=0.0045)
        forearm_rings = [
            ((side * 0.450, -0.014, 1.030), 0.069, 0.074),
            ((side * 0.444, -0.017, 0.960), 0.067, 0.072),
            ((side * 0.435, -0.020, 0.880), 0.061, 0.066),
            ((side * 0.428, -0.022, 0.810), 0.052, 0.058),
        ]
        limb_shell(f"{label}_Forearm_PrimaryShell", side, forearm_rings, 2.62, 1.03, collection, mats["ceramic"], "tapered forearm primary shell", angular_steps=13, thickness=0.014, bevel=0.0055)
        limb_shell(f"{label}_Forearm_UlnaRail", side, forearm_rings, 1.65, 0.34, collection, mats["gunmetal"], "forearm ulna load rail", angular_steps=7, thickness=0.010, bevel=0.0035, tier="secondary")
        curve_beam(
            f"{label}_Arm_LoadPath",
            [(side * 0.410, -0.090, 1.410), (side * 0.452, -0.080, 1.260), (side * 0.465, -0.076, 1.095), (side * 0.443, -0.072, 0.930), (side * 0.426, -0.064, 0.815)],
            0.0055, micro, mats["edge"], "continuous shoulder to wrist load path", tier="secondary",
        )
        for index, z in enumerate((0.995, 0.920, 0.850)):
            add_box(f"{label}_ForearmVent_{index+1}", (side * 0.448, -0.094, z), (0.012, 0.004, 0.003), micro, mats["gunmetal"], "forearm recessed vent", bevel=0.0015)
        add_box(f"{label}_ForearmCyan", (side * 0.445, -0.098, 0.900), (0.006, 0.003, 0.030), micro, mats["cyan"], "forearm telemetry strip", bevel=0.0015)
        profile_volume_xz(
            f"{label}_GloveKnucklePlate",
            [(side * 0.380, 0.750), (side * 0.456, 0.748), (side * 0.458, 0.705), (side * 0.382, 0.700)],
            -0.078, -0.052, collection, mats["ceramic_dark"], "glove knuckle armor", bevel=0.004, tier="secondary",
        )


def build_pelvis_legs(collection: bpy.types.Collection, rear: bpy.types.Collection, micro: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    profile_volume_xz("Pelvis_CodPlate", [(-0.086, 0.912), (0.0, 0.944), (0.086, 0.912), (0.072, 0.820), (0.0, 0.790), (-0.072, 0.820)], -0.158, -0.132, collection, mats["gunmetal"], "compact articulated cod plate", bevel=0.006)
    profile_volume_xz("Pelvis_RearSacrum", [(-0.090, 0.918), (0.0, 0.946), (0.090, 0.918), (0.078, 0.818), (0.0, 0.792), (-0.078, 0.818)], 0.142, 0.174, rear, mats["gunmetal"], "compact segmented sacrum plate", bevel=0.006)
    for side in (-1, 1):
        label = "L" if side < 0 else "R"
        curve_beam(
            f"Pelvis_{label}_WaistRail",
            [(side * 0.030, -0.140, 0.978), (side * 0.125, -0.140, 0.958), (side * 0.225, -0.082, 0.914), (side * 0.258, -0.002, 0.868)],
            0.009, collection, mats["gunmetal"], "waist to hip load rail",
        )
        hip_rings = [
            ((side * 0.185, -0.002, 0.905), 0.128, 0.148),
            ((side * 0.188, -0.006, 0.845), 0.128, 0.146),
            ((side * 0.190, -0.010, 0.785), 0.122, 0.138),
        ]
        limb_shell(f"Pelvis_{label}_HipSaddle", side, hip_rings, 2.35, 0.66, collection, mats["ceramic_dark"], "overlapping articulated hip saddle", angular_steps=11, thickness=0.013, bevel=0.005)
        thigh_rings = [
            ((side * 0.190, -0.010, 0.785), 0.120, 0.138),
            ((side * 0.192, -0.012, 0.720), 0.116, 0.132),
            ((side * 0.191, -0.013, 0.645), 0.104, 0.118),
            ((side * 0.188, -0.012, 0.585), 0.090, 0.099),
        ]
        limb_shell(f"{label}_Thigh_UpperFrontOuterPlate", side, thigh_rings[:3], 2.56, 0.78, collection, mats["ceramic_dark"], "fitted upper thigh front outer shell", angular_steps=11, thickness=0.014, bevel=0.0055)
        limb_shell(f"{label}_Thigh_LowerArticulationPlate", side, thigh_rings[2:], 2.72, 0.70, collection, mats["gunmetal"], "stepped lower thigh articulation shell", angular_steps=10, thickness=0.012, bevel=0.0045)
        limb_shell(f"{label}_Thigh_LateralRail", side, thigh_rings, 1.56, 0.30, collection, mats["gunmetal"], "thigh lateral load rail", angular_steps=6, thickness=0.010, bevel=0.0035, tier="secondary")
        limb_shell(f"{label}_Thigh_RearOuterCounter", side, thigh_rings, 0.62, 0.50, rear, mats["ceramic_dark"], "rear outer thigh counter", angular_steps=8, thickness=0.012, bevel=0.0045, tier="secondary")
        knee_rings = [
            ((side * 0.188, -0.012, 0.575), 0.084, 0.091),
            ((side * 0.186, -0.014, 0.535), 0.080, 0.087),
            ((side * 0.185, -0.012, 0.495), 0.082, 0.090),
        ]
        limb_shell(f"{label}_Knee_FloatingPatella", side, knee_rings, math.pi, 0.68, collection, mats["ceramic"], "floating articulated patella", angular_steps=9, thickness=0.014, bevel=0.0055)
        shin_rings = [
            ((side * 0.184, -0.007, 0.470), 0.087, 0.096),
            ((side * 0.182, -0.001, 0.400), 0.093, 0.106),
            ((side * 0.180, 0.004, 0.315), 0.086, 0.100),
            ((side * 0.177, 0.007, 0.235), 0.073, 0.085),
            ((side * 0.175, 0.006, 0.170), 0.065, 0.073),
        ]
        limb_shell(f"{label}_Shin_UpperPrimaryShell", side, shin_rings[:3], math.pi, 0.72, collection, mats["ceramic_dark"], "upper tapered shin shell", angular_steps=10, thickness=0.014, bevel=0.0055)
        limb_shell(f"{label}_Shin_LowerPrimaryShell", side, shin_rings[2:], math.pi, 0.66, collection, mats["gunmetal"], "lower tapered shin load shell", angular_steps=10, thickness=0.013, bevel=0.005)
        limb_shell(f"{label}_Calf_UpperCounter", side, shin_rings[:3], 0.0, 0.58, rear, mats["gunmetal"], "upper rear calf counter", angular_steps=8, thickness=0.012, bevel=0.0045)
        limb_shell(f"{label}_Calf_LowerCounter", side, shin_rings[2:], 0.0, 0.52, rear, mats["ceramic_dark"], "lower rear calf counter", angular_steps=8, thickness=0.012, bevel=0.0045)
        curve_beam(
            f"{label}_Leg_LoadPath",
            [(side * 0.287, -0.030, 0.875), (side * 0.276, -0.074, 0.720), (side * 0.250, -0.084, 0.545), (side * 0.230, -0.085, 0.390), (side * 0.205, -0.070, 0.195)],
            0.0065, micro, mats["edge"], "continuous hip to ankle load path", tier="secondary",
        )
        add_box(f"{label}_ThighCyan", (side * 0.235, -0.121, 0.690), (0.006, 0.003, 0.030), micro, mats["cyan"], "thigh telemetry strip", bevel=0.0015)
        add_box(f"{label}_ShinCyan", (side * 0.190, -0.108, 0.305), (0.006, 0.003, 0.034), micro, mats["cyan"], "shin telemetry strip", bevel=0.0015)
        add_cylinder(f"{label}_AnklePivot", (side * 0.222, 0.000, 0.145), 0.014, 0.010, micro, mats["gunmetal"], "recessed ankle articulation pivot", axis="X")
        cx = side * 0.175
        combat_boot_upper(f"{label}_Boot_AnatomicalUpper", side, collection, mats["ceramic_dark"], "integrated ankle instep and toe boot upper")
        outsole_outline = [
            (cx - 0.070, 0.115), (cx - 0.085, -0.030), (cx - 0.095, -0.185),
            (cx - 0.075, -0.270), (cx + 0.075, -0.270), (cx + 0.095, -0.185),
            (cx + 0.085, -0.030), (cx + 0.070, 0.115),
        ]
        profile_volume_xy(f"{label}_Boot_ContouredOutsole", outsole_outline, 0.012, 0.043, collection, mats["rubber"], "flat contoured combat outsole", bevel=0.005)
        for tread_index, tread_y in enumerate((-0.205, -0.105, 0.010, 0.085)):
            add_box(
                f"{label}_Boot_Tread_{tread_index+1}", (cx, tread_y, 0.008),
                (0.068 if tread_index < 2 else 0.058, 0.026, 0.008), collection, mats["rubber"],
                "segmented outsole tread", bevel=0.0025,
            )
        toe_outline = [(cx - 0.083, -0.225), (cx - 0.070, -0.070), (cx - 0.055, 0.020), (cx + 0.055, 0.020), (cx + 0.070, -0.070), (cx + 0.083, -0.225), (cx + 0.060, -0.273), (cx - 0.060, -0.273)]
        profile_volume_xy(f"{label}_Boot_ToeArmor", toe_outline, 0.104, 0.132, collection, mats["ceramic_dark"], "shaped boot toe cap", bevel=0.006)
        heel_outline = [(cx - 0.068, 0.010), (cx - 0.070, 0.122), (cx + 0.070, 0.122), (cx + 0.068, 0.010)]
        profile_volume_xy(f"{label}_Boot_HeelCounter", heel_outline, 0.092, 0.138, rear, mats["gunmetal"], "fitted heel counter", bevel=0.006)
        for lace_index, lace_y in enumerate((-0.025, -0.075, -0.125)):
            add_box(f"{label}_Boot_LaceBridge_{lace_index+1}", (cx, lace_y, 0.162 - lace_index * 0.014), (0.048, 0.010, 0.004), micro, mats["edge"], "recessed boot lace bridge", bevel=0.0015)
        add_box(f"{label}_BootCyan", (cx, -0.246, 0.139), (0.018, 0.004, 0.004), micro, mats["cyan"], "boot telemetry", bevel=0.0015)


def rifle_profile(
    name: str,
    outline: list[tuple[float, float]],
    y_half: float,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.006,
    tier: str = "secondary",
) -> bpy.types.Object:
    return profile_volume_xz(name, outline, -y_half, y_half, collection, mat, role, bevel=bevel, tier=tier)


def build_rifle(collection: bpy.types.Collection, micro: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> None:
    # Rifle centered at world origin for isolated component inspection.
    receiver = [(-0.360, 0.150), (-0.300, 0.215), (0.190, 0.215), (0.270, 0.165), (0.255, -0.025), (0.160, -0.090), (-0.260, -0.080), (-0.360, -0.020)]
    rifle_profile("Rifle_UpperReceiver", receiver, 0.070, collection, mats["gunmetal"], "multi-depth upper receiver", bevel=0.009)
    lower = [(-0.270, 0.035), (0.175, 0.035), (0.225, -0.035), (0.150, -0.105), (-0.205, -0.105), (-0.305, -0.035)]
    rifle_profile("Rifle_LowerReceiver", lower, 0.064, collection, mats["gunmetal"], "machined lower receiver", bevel=0.007)
    rifle_profile("Rifle_ReceiverAccentPlate", [(-0.300, 0.165), (-0.210, 0.195), (0.105, 0.195), (0.165, 0.145), (0.135, 0.065), (-0.245, 0.065)], 0.074, micro, mats["ceramic"], "stepped receiver accent shell", bevel=0.005, tier="secondary")
    rifle_profile("Rifle_EjectionPort", [(-0.080, 0.130), (0.110, 0.130), (0.130, 0.085), (0.095, 0.040), (-0.090, 0.040), (-0.115, 0.085)], 0.078, micro, mats["joint"], "recessed ejection port", bevel=0.003, tier="tertiary")
    handguard = [(0.205, 0.185), (0.800, 0.185), (0.875, 0.125), (0.835, -0.085), (0.280, -0.085), (0.230, -0.020)]
    rifle_profile("Rifle_HandguardShell", handguard, 0.062, collection, mats["ceramic_dark"], "framed ventilated handguard", bevel=0.008)
    handguard_insert = [(0.280, 0.105), (0.750, 0.105), (0.790, 0.070), (0.760, -0.010), (0.315, -0.010), (0.275, 0.035)]
    rifle_profile("Rifle_HandguardInset", handguard_insert, 0.069, micro, mats["gunmetal"], "recessed handguard structural insert", bevel=0.004, tier="secondary")
    stock_butt = [(-0.910, 0.165), (-0.760, 0.190), (-0.530, 0.145), (-0.465, 0.050), (-0.545, -0.030), (-0.770, -0.165), (-0.920, -0.110)]
    rifle_profile("Rifle_OpenStockOuter", stock_butt, 0.058, collection, mats["gunmetal"], "open structural stock outer frame", bevel=0.009)
    stock_hole = [(-0.815, 0.095), (-0.680, 0.105), (-0.565, 0.065), (-0.615, 0.005), (-0.755, -0.075), (-0.830, -0.055)]
    rifle_profile("Rifle_OpenStockVoid", stock_hole, 0.064, micro, mats["weave"], "stock negative-space insert", bevel=0.004, tier="secondary")
    buffer_outline = [(-0.545, 0.120), (-0.345, 0.120), (-0.300, 0.070), (-0.325, 0.010), (-0.540, 0.010)]
    rifle_profile("Rifle_BufferBridge", buffer_outline, 0.052, collection, mats["ceramic_dark"], "stock receiver bridge", bevel=0.006)
    grip_outline = [(-0.225, -0.075), (-0.095, -0.070), (-0.055, -0.330), (-0.145, -0.365), (-0.280, -0.155)]
    rifle_profile("Rifle_PistolGrip", grip_outline, 0.050, collection, mats["rubber"], "ergonomic pistol grip", bevel=0.008)
    magazine_outline = [(0.000, -0.075), (0.170, -0.075), (0.155, -0.350), (0.025, -0.365), (-0.020, -0.155)]
    rifle_profile("Rifle_Magazine", magazine_outline, 0.052, collection, mats["gunmetal"], "detachable box magazine", bevel=0.006)
    rifle_profile("Rifle_AngledForegrip", [(0.420, -0.075), (0.555, -0.075), (0.520, -0.235), (0.445, -0.245), (0.395, -0.135)], 0.044, collection, mats["rubber"], "angled support-hand foregrip", bevel=0.006)
    add_cylinder("Rifle_Barrel", (1.030, 0.0, 0.080), 0.022, 0.420, collection, mats["gunmetal"], "free-float barrel", axis="X", vertices=24)
    add_cylinder("Rifle_GasBlock", (0.860, 0.0, 0.085), 0.042, 0.090, collection, mats["edge"], "gas block", axis="X", vertices=24)
    add_cylinder("Rifle_MuzzleBrake", (1.275, 0.0, 0.080), 0.045, 0.145, collection, mats["gunmetal"], "ported muzzle brake", axis="X", vertices=24)
    for index, x in enumerate((1.225, 1.260, 1.295, 1.330)):
        add_box(f"Rifle_MuzzlePort_{index+1}", (x, -0.043, 0.080), (0.008, 0.004, 0.017), micro, mats["weave"], "muzzle brake port", bevel=0.002)
    add_box("Rifle_TopRail", (0.230, 0.0, 0.235), (0.610, 0.035, 0.016), collection, mats["gunmetal"], "continuous top rail", bevel=0.003)
    for index, x in enumerate([i * 0.055 - 0.320 for i in range(20)]):
        add_box(f"Rifle_RailTooth_{index+1:02d}", (x, 0.0, 0.258), (0.018, 0.043, 0.008), micro, mats["edge"], "top rail tooth", bevel=0.0015)
    rifle_profile("Rifle_OpticBody", [(-0.160, 0.300), (0.020, 0.300), (0.065, 0.255), (0.040, 0.210), (-0.180, 0.210), (-0.205, 0.255)], 0.055, collection, mats["gunmetal"], "low-profile combat optic", bevel=0.006)
    add_box("Rifle_OpticLens", (-0.185, -0.058, 0.258), (0.006, 0.004, 0.026), micro, mats["cyan"], "optic lens", bevel=0.002)
    for row, z in enumerate((0.115, 0.045)):
        for index, x in enumerate((0.365, 0.475, 0.585, 0.695)):
            rifle_profile(
                f"Rifle_Vent_{row+1}_{index+1}",
                [(x - 0.035, z + 0.016), (x + 0.035, z + 0.016), (x + 0.025, z - 0.016), (x - 0.025, z - 0.016)],
                0.070, micro, mats["weave"], "handguard negative-space vent", bevel=0.003, tier="tertiary",
            )
    add_box("Rifle_CyanStatus", (0.015, -0.074, 0.125), (0.055, 0.004, 0.012), micro, mats["cyan"], "receiver status light", bevel=0.002)
    add_box("Rifle_RedSelector", (-0.155, -0.076, 0.015), (0.010, 0.004, 0.005), micro, mats["red"], "fire selector witness", bevel=0.0015)
    for index, x in enumerate((-0.250, -0.135, 0.090, 0.185, 0.325, 0.790)):
        add_cylinder(f"Rifle_Fastener_{index+1}", (x, -0.076, 0.075 if x < 0.25 else 0.130), 0.010, 0.005, micro, mats["edge"], "receiver fastener", axis="Y", vertices=16)
    add_box("Rifle_TriggerGuard", (-0.130, 0.0, -0.075), (0.080, 0.040, 0.012), collection, mats["gunmetal"], "trigger guard bridge", bevel=0.006)
    curve_beam("Rifle_Trigger", [(-0.135, -0.025, -0.075), (-0.125, -0.025, -0.125), (-0.105, -0.025, -0.148)], 0.006, micro, mats["edge"], "trigger", tier="tertiary")
    for index, z in enumerate((-0.165, -0.215, -0.265, -0.315)):
        add_box(f"Rifle_GripTexture_{index+1}", (-0.145, -0.053, z), (0.040, 0.004, 0.005), micro, mats["ceramic_dark"], "grip texture rib", bevel=0.002)


def create_contact_intent(collection: bpy.types.Collection) -> list[str]:
    witnesses = {
        "primary_grip": (-0.250573, -0.141000, 1.313522),
        "support_grip": (0.168362, -0.134876, 1.278882),
        "shoulder": (-0.493559, -0.079878, 1.403323),
    }
    names = []
    for label, location in witnesses.items():
        obj = bpy.data.objects.new(PREFIX + "CONTACT_" + label, None)
        obj.empty_display_type = "SPHERE"
        obj.empty_display_size = 0.025
        obj.location = location
        collection.objects.link(obj)
        tag(obj, "future contact intent only", "witness")
        names.append(obj.name)
    return names


def stage_rifle_at_chest_height(collection: bpy.types.Collection) -> None:
    """Scale the weapon to production-human dimensions and keep it off the ground."""
    def transform(point: Vector) -> Vector:
        x = (point.x - 0.200) * 0.52
        y = point.y * 0.52 - 0.115
        z = point.z * 0.52
        angle = 0.18
        return Vector((x * math.cos(angle) + z * math.sin(angle), y, -x * math.sin(angle) + z * math.cos(angle) + 1.350))

    for obj in collection.all_objects:
        if obj.type in {"MESH", "CURVE"}:
            deform_object_world(obj, transform)


def deform_object_world(obj: bpy.types.Object, transform) -> None:
    """Apply a deterministic world-space shape transform without changing topology."""
    inverse = obj.matrix_world.inverted()
    if obj.type == "MESH":
        for vertex in obj.data.vertices:
            vertex.co = inverse @ transform(obj.matrix_world @ vertex.co)
        obj.data.update()
    elif obj.type == "CURVE":
        for spline in obj.data.splines:
            for point in spline.bezier_points:
                point.co = inverse @ transform(obj.matrix_world @ point.co)
                point.handle_left = inverse @ transform(obj.matrix_world @ point.handle_left)
                point.handle_right = inverse @ transform(obj.matrix_world @ point.handle_right)
            for point in spline.points:
                world = obj.matrix_world @ Vector(point.co[:3])
                local = inverse @ transform(world)
                point.co = (*local, point.co.w)


def apply_athletic_proportion_pass(collections: dict[str, bpy.types.Collection]) -> None:
    """Lengthen the lower body/arms, reduce the head, enlarge hands, and shrink feet."""
    character_objects: list[bpy.types.Object] = []
    seen: set[int] = set()
    for key in ("undersuit", "helmet", "torso", "limbs", "rear", "micro"):
        for obj in collections[key].all_objects:
            if id(obj) not in seen and obj.type in {"MESH", "CURVE"}:
                seen.add(id(obj))
                character_objects.append(obj)

    def vertical_warp(point: Vector) -> Vector:
        point = point.copy()
        if point.z > 0.12:
            if point.z <= 0.98:
                point.z = 0.12 + (point.z - 0.12) * 1.075
            else:
                point.z += (0.98 - 0.12) * 0.075
        return point

    for obj in character_objects:
        deform_object_world(obj, vertical_warp)

    arm_tokens = ("Arm", "Shoulder", "Bicep", "Elbow", "Forearm", "Glove")
    leg_tokens = ("Leg", "Thigh", "Knee", "Shin", "Calf", "Ankle", "Boot", "HipSaddle")
    for side, label in ((-1, "L_"), (1, "R_")):
        for obj in character_objects:
            if label not in obj.name:
                continue
            if any(token in obj.name for token in arm_tokens):

                def arm_pose(point: Vector, side=side) -> Vector:
                    point = point.copy()
                    influence = max(0.0, min(1.0, (1.46 - point.z) / 0.86))
                    point.x += side * 0.036 * influence
                    point.y -= 0.018 * influence
                    return point

                deform_object_world(obj, arm_pose)
            elif any(token in obj.name for token in leg_tokens):

                def leg_stance(point: Vector, side=side) -> Vector:
                    point = point.copy()
                    influence = max(0.0, min(1.0, (0.98 - point.z) / 0.88))
                    point.x += side * 0.040 * influence
                    return point

                deform_object_world(obj, leg_stance)

    head_center = Vector((0.0, -0.003, vertical_warp(Vector((0.0, 0.0, 1.685))).z))

    def compact_head(point: Vector) -> Vector:
        delta = point - head_center
        return head_center + Vector((delta.x * 0.82, delta.y * 0.82, delta.z * 0.88))

    head_objects = list(collections["helmet"].all_objects) + [
        obj for obj in collections["undersuit"].all_objects if "CranialSock" in obj.name
    ]
    for obj in head_objects:
        if obj.type in {"MESH", "CURVE"}:
            deform_object_world(obj, compact_head)

    for obj in character_objects:
        if "Glove" not in obj.name:
            continue
        points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        center = sum(points, Vector()) / 8.0

        def enlarge_hand(point: Vector, center=center) -> Vector:
            return center + (point - center) * 1.24

        deform_object_world(obj, enlarge_hand)

    for side in (-1, 1):
        foot_center = Vector((side * 0.175, -0.080, 0.075))

        def compact_foot(point: Vector, foot_center=foot_center) -> Vector:
            delta = point - foot_center
            return foot_center + Vector((delta.x * 0.76, delta.y * 0.72, delta.z * 0.84))

        label = "L_" if side < 0 else "R_"
        for obj in character_objects:
            if label in obj.name and any(token in obj.name for token in ("Boot", "AnklePivot")):
                deform_object_world(obj, compact_foot)


def inventory(prefix: str) -> dict:
    objects = [obj for obj in bpy.data.objects if obj.name.startswith(prefix)]
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated_polygons = 0
    for obj in objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        evaluated_polygons += len(mesh.polygons)
        evaluated.to_mesh_clear()
    return {
        "objects": len(objects),
        "meshes": sum(1 for obj in objects if obj.type == "MESH"),
        "curves": sum(1 for obj in objects if obj.type == "CURVE"),
        "empties": sum(1 for obj in objects if obj.type == "EMPTY"),
        "baseVertices": sum(len(obj.data.vertices) for obj in objects if obj.type == "MESH"),
        "basePolygons": sum(len(obj.data.polygons) for obj in objects if obj.type == "MESH"),
        "evaluatedPolygons": evaluated_polygons,
        "materials": sorted(mat.name for mat in bpy.data.materials if mat.name.startswith(prefix)),
        "collections": sorted(col.name for col in bpy.data.collections if col.name.startswith(prefix)),
    }


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 4:
        raise SystemExit("Expected -- <accepted-v6a.blend> <production-target.png> <rev12.blend> <report.json>")
    v6a_path, reference_path, output_path, report_path = (Path(value).resolve() for value in arguments)
    v6a_hash_before = sha256(v6a_path)
    reference_hash_before = sha256(reference_path)
    if v6a_hash_before != PINNED_V6A_SHA256:
        raise RuntimeError(f"Accepted V6-A hash mismatch: {v6a_hash_before}")
    if reference_hash_before != PINNED_REFERENCE_SHA256:
        raise RuntimeError(f"Pinned concept hash mismatch: {reference_hash_before}")
    bpy.ops.wm.open_mainfile(filepath=str(v6a_path), load_ui=False, use_scripts=False)
    source_body = bpy.data.objects.get(SOURCE_BODY)
    if source_body is None or source_body.type != "MESH":
        raise RuntimeError(f"Missing accepted source body: {SOURCE_BODY}")
    source_geometry_before = mesh_geometry_sha256(source_body)
    # V6-A is a proportion cage only; nothing from it is visible in the benchmark.
    for obj in bpy.data.objects:
        obj.hide_render = True
        obj.hide_viewport = True
        obj.hide_set(True)
    collections = {
        "undersuit": make_collection("AthleticTechnicalUndersuit"),
        "helmet": make_collection("SegmentedHelmetSystem"),
        "torso": make_collection("ClavicleSternumObliqueCarrier"),
        "limbs": make_collection("ArticulatedPelvisLimbLoadPath"),
        "rear": make_collection("RearSpinePackSystem"),
        "rifle": make_collection("ProductionHardSurfaceRifle"),
        "micro": make_collection("SecondaryTertiaryDetail"),
    }
    mats = make_materials()
    build_undersuit(collections["undersuit"], mats)
    build_helmet(collections["helmet"], collections["micro"], mats)
    build_torso(collections["torso"], collections["rear"], collections["micro"], mats)
    build_shoulders_arms(collections["limbs"], collections["micro"], mats)
    build_pelvis_legs(collections["limbs"], collections["rear"], collections["micro"], mats)
    apply_athletic_proportion_pass(collections)
    build_rifle(collections["rifle"], collections["rifle"], mats)
    stage_rifle_at_chest_height(collections["rifle"])
    contact_names = create_contact_intent(collections["rifle"])
    for obj in bpy.data.objects:
        if obj.name.startswith(PREFIX):
            obj.hide_render = False
            obj.hide_viewport = False
            obj.hide_set(False)
    source_geometry_after = mesh_geometry_sha256(source_body)
    if source_geometry_after != source_geometry_before:
        raise RuntimeError("Accepted V6-A geometry changed while used as hidden cage")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)
    output_hash = sha256(output_path)
    v6a_hash_after = sha256(v6a_path)
    reference_hash_after = sha256(reference_path)
    inv = inventory(PREFIX)
    forbidden = [obj.name for obj in bpy.data.objects if obj.name.startswith(PREFIX) and any(token in obj.name.lower() for token in ("rev9", "rev10", "rev11", "v6b"))]
    assertions = {
        "builtFromAcceptedV6AOnly": True,
        "acceptedV6AUsedAsHiddenCageOnly": source_body.hide_render and source_body.hide_viewport,
        "noPriorRevisionBlendOpenedAppendedOrLinked": True,
        "acceptedV6AFilePreserved": v6a_hash_before == v6a_hash_after,
        "acceptedV6ABodyGeometryPreserved": source_geometry_before == source_geometry_after,
        "productionTargetPinnedAndPreserved": reference_hash_before == reference_hash_after,
        "noRev9Rev10Rev11OrV6BNames": not forbidden,
        "noArmatures": len(bpy.data.armatures) == 0,
        "noActions": len(bpy.data.actions) == 0,
        "noExternalLibraries": len(bpy.data.libraries) == 0,
        "threeContactIntentEmptiesOnly": len(contact_names) == 3,
    }
    failed_assertions = [key for key, value in assertions.items() if not bool(value)]
    if failed_assertions:
        raise RuntimeError(f"Rev12 construction assertion failed: {failed_assertions} / {assertions}")
    report = {
        "schemaVersion": 1,
        "authoredUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "sources": {
            "acceptedV6A": {
                "path": str(v6a_path), "sha256Before": v6a_hash_before, "sha256After": v6a_hash_after,
                "unchanged": v6a_hash_before == v6a_hash_after,
                "bodyGeometrySha256Before": source_geometry_before, "bodyGeometrySha256After": source_geometry_after,
                "visibleInBenchmark": False, "usage": "hidden anatomical and proportion cage only",
            },
            "productionTarget": {
                "path": str(reference_path), "sha256Before": reference_hash_before, "sha256After": reference_hash_after,
                "unchanged": reference_hash_before == reference_hash_after,
                "usage": "sole visual construction reference",
            },
        },
        "output": {"path": str(output_path), "bytes": output_path.stat().st_size, "sha256": output_hash},
        "method": {
            "strategyReset": "No prior armor geometry. Visible anatomy is a new athletic cross-section loft; V6-A is hidden.",
            "sculptSubdivision": "Organic suit, hands, legs, helmet sock, and boot lasts use authored multi-ring loft topology with Catmull-Clark subdivision.",
            "fittedArmor": "Open curved surface grids follow torso and limb cross sections, then receive physical shell thickness and manufactured bevel radii.",
            "retopologyIntent": "Primary surfaces are quad grids with controlled longitudinal and circumferential flow; profile volumes are reserved for hard manufactured plates.",
            "helmet": "Segmented ellipsoid patches, separate brow/cheek/jaw/chin shells, continuous gasket, and a narrow angular visor replace a generic dome.",
            "loadPath": "Clavicle, sternum, oblique, waist, hip, thigh, knee, shin, ankle, scapular, and spine structures form one readable system.",
            "weapon": "A new receiver/stock/handguard/grip/magazine/barrel/optic assembly with layered depths, negative-space inserts, rail teeth, vents, controls, and hardware.",
            "materials": "Dark graphite weave, smoked ceramic, deep gunmetal, restrained warm ceramic, cyan telemetry, and safety red hierarchy.",
        },
        "inventory": inv,
        "contactIntent": contact_names,
        "assertions": assertions,
        "status": "V6C_VISUAL_BENCHMARK_REV12_REQUIRES_STRICT_DIRECT_AUDIT",
        "nonClaims": [
            "Revision 12 is a visual benchmark candidate, not V6-C or G6 acceptance.",
            "Contact empties are future intent only; no held-contact proof is claimed.",
            "No authored UVs, texture bake, rig, animation, LOD, GLB, runtime integration, or performance acceptance is claimed.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"], "objects": inv["objects"], "basePolygons": inv["basePolygons"],
        "evaluatedPolygons": inv["evaluatedPolygons"], "outputSha256": output_hash,
        "acceptedV6ASha256": v6a_hash_before, "sourceReferenceSha256": reference_hash_before,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
