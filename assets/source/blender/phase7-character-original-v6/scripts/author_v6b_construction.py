"""Author the KYX Vanguard V6-B construction-review checkpoint.

The accepted V6-A anatomy is duplicated into a new Blend and kept as the
dominant human silhouette. Separate project-authored garment-detail, helmet,
armor, boot, and rifle meshes are then built around it. This is
still a construction checkpoint: it does not claim production retopology,
UVs, rigging, animation, LODs, exports, or runtime/G6 acceptance.

Run with Blender factory startup and auto-execution disabled:
  blender --background --factory-startup --disable-autoexec --python-exit-code 1 \
    --python author_v6b_construction.py -- <v6a.blend> <v6b.blend> <report.json>
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


PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
BODY_V6A = "KYX_V6A_AnatomySculpt_Body"
BODY_V6B = "KYX_V6B_Accepted_AnatomyUnderlayer"


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <v6a.blend> <v6b.blend> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return float(value >= edge1)
    t = clamp((value - edge0) / (edge1 - edge0))
    return t * t * (3.0 - 2.0 * t)


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.5,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf is None:
        raise RuntimeError(f"Principled BSDF missing for {name}")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None:
        emission_input = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        if emission_input is not None:
            emission_input.default_value = emission
        strength_input = bsdf.inputs.get("Emission Strength")
        if strength_input is not None:
            strength_input.default_value = emission_strength
    return material


def link_object(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for existing in tuple(obj.users_collection):
        existing.objects.unlink(obj)
    collection.objects.link(obj)


def smooth_and_bevel(
    obj: bpy.types.Object,
    *,
    bevel: float = 0.006,
    segments: int = 3,
    subdivision: int = 0,
) -> None:
    if obj.type != "MESH":
        return
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    if bevel > 0.0:
        modifier = obj.modifiers.new("ManufacturedEdge", "BEVEL")
        modifier.width = bevel
        modifier.segments = segments
        modifier.limit_method = "ANGLE"
    if subdivision > 0:
        modifier = obj.modifiers.new("ConstructionSubdivision", "SUBSURF")
        modifier.levels = subdivision
        modifier.render_levels = subdivision


def mesh_object(
    name: str,
    vertices: list[tuple[float, float, float]],
    faces: list[tuple[int, ...]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def extruded_xz_panel(
    name: str,
    polygon_xz: list[tuple[float, float]],
    y_front: float,
    y_back: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    bevel: float = 0.006,
) -> bpy.types.Object:
    count = len(polygon_xz)
    vertices = [(x, y_front, z) for x, z in polygon_xz]
    vertices += [(x, y_back, z) for x, z in polygon_xz]
    faces: list[tuple[int, ...]] = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    obj = mesh_object(name, vertices, faces, collection, material)
    smooth_and_bevel(obj, bevel=bevel, segments=3)
    return obj


def extruded_yz_boot(
    name: str,
    polygon_yz: list[tuple[float, float]],
    x_min: float,
    x_max: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    count = len(polygon_yz)
    vertices = [(x_min, y, z) for y, z in polygon_yz]
    vertices += [(x_max, y, z) for y, z in polygon_yz]
    faces: list[tuple[int, ...]] = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    obj = mesh_object(name, vertices, faces, collection, material)
    smooth_and_bevel(obj, bevel=0.012, segments=4)
    return obj


def loft_vertical(
    name: str,
    rings: list[tuple[float, float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    segments: int = 24,
) -> bpy.types.Object:
    """Build horizontal elliptical rings as (z, center_y, radius_x, radius_y)."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, center_y, radius_x, radius_y in rings:
        for segment in range(segments):
            angle = math.tau * segment / segments
            vertices.append((radius_x * math.cos(angle), center_y + radius_y * math.sin(angle), z))
    for ring in range(len(rings) - 1):
        start = ring * segments
        nxt = (ring + 1) * segments
        for segment in range(segments):
            following = (segment + 1) % segments
            faces.append((start + segment, start + following, nxt + following, nxt + segment))
    faces.append(tuple(reversed(range(segments))))
    last = (len(rings) - 1) * segments
    faces.append(tuple(last + segment for segment in range(segments)))
    obj = mesh_object(name, vertices, faces, collection, material)
    smooth_and_bevel(obj, bevel=0.002, segments=2, subdivision=1)
    return obj


def path_basis(points: list[Vector], index: int) -> tuple[Vector, Vector, Vector]:
    if index == 0:
        tangent = (points[1] - points[0]).normalized()
    elif index == len(points) - 1:
        tangent = (points[-1] - points[-2]).normalized()
    else:
        tangent = (points[index + 1] - points[index - 1]).normalized()
    reference = Vector((0.0, 0.0, 1.0))
    if abs(tangent.dot(reference)) > 0.92:
        reference = Vector((0.0, 1.0, 0.0))
    axis_a = tangent.cross(reference).normalized()
    axis_b = tangent.cross(axis_a).normalized()
    return tangent, axis_a, axis_b


def loft_path(
    name: str,
    path: list[tuple[float, float, float]],
    radii: list[tuple[float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    segments: int = 16,
    shell_fraction: float = 1.0,
) -> bpy.types.Object:
    points = [Vector(point) for point in path]
    if len(points) != len(radii):
        raise ValueError("path/radii mismatch")
    ring_segments = max(4, round(segments * shell_fraction))
    angle_start = -math.pi * shell_fraction
    angle_span = math.tau * shell_fraction
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for index, point in enumerate(points):
        _, axis_a, axis_b = path_basis(points, index)
        radius_a, radius_b = radii[index]
        for segment in range(ring_segments):
            divisor = ring_segments if shell_fraction >= 0.999 else max(1, ring_segments - 1)
            angle = angle_start + angle_span * segment / divisor
            vertex = point + axis_a * (math.cos(angle) * radius_a) + axis_b * (math.sin(angle) * radius_b)
            vertices.append(tuple(vertex))
    for ring in range(len(points) - 1):
        start = ring * ring_segments
        nxt = (ring + 1) * ring_segments
        limit = ring_segments if shell_fraction >= 0.999 else ring_segments - 1
        for segment in range(limit):
            following = (segment + 1) % ring_segments
            faces.append((start + segment, start + following, nxt + following, nxt + segment))
    if shell_fraction >= 0.999:
        faces.append(tuple(reversed(range(ring_segments))))
        last = (len(points) - 1) * ring_segments
        faces.append(tuple(last + segment for segment in range(ring_segments)))
    obj = mesh_object(name, vertices, faces, collection, material)
    smooth_and_bevel(obj, bevel=0.0025, segments=2, subdivision=1)
    if shell_fraction < 0.999:
        solidify = obj.modifiers.new("ArmorThickness", "SOLIDIFY")
        solidify.thickness = 0.012
        solidify.offset = 0.0
    return obj


def ellipsoid_patch(
    name: str,
    center: tuple[float, float, float],
    radius: tuple[float, float, float],
    theta_range: tuple[float, float],
    phi_range: tuple[float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    theta_steps: int = 24,
    phi_steps: int = 10,
    thickness: float = 0.008,
) -> bpy.types.Object:
    cx, cy, cz = center
    rx, ry, rz = radius
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for p_index in range(phi_steps + 1):
        phi = phi_range[0] + (phi_range[1] - phi_range[0]) * p_index / phi_steps
        for t_index in range(theta_steps + 1):
            theta = theta_range[0] + (theta_range[1] - theta_range[0]) * t_index / theta_steps
            sin_phi = math.sin(phi)
            vertices.append((
                cx + rx * math.cos(theta) * sin_phi,
                cy + ry * math.sin(theta) * sin_phi,
                cz + rz * math.cos(phi),
            ))
    stride = theta_steps + 1
    for p_index in range(phi_steps):
        for t_index in range(theta_steps):
            a = p_index * stride + t_index
            faces.append((a, a + 1, a + stride + 1, a + stride))
    obj = mesh_object(name, vertices, faces, collection, material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    solidify = obj.modifiers.new("ManufacturedThickness", "SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = 0.0
    bevel = obj.modifiers.new("ManufacturedEdge", "BEVEL")
    bevel.width = min(0.004, thickness * 0.45)
    bevel.segments = 3
    return obj


def add_uv_ellipsoid(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_object(obj, collection)
    obj.data.materials.append(material)
    smooth_and_bevel(obj, bevel=0.0015, segments=2)
    return obj


def add_cylinder_between(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    vertices: int = 24,
) -> bpy.types.Object:
    a = Vector(start)
    b = Vector(end)
    direction = b - a
    midpoint = (a + b) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=midpoint)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(direction.normalized())
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_object(obj, collection)
    obj.data.materials.append(material)
    smooth_and_bevel(obj, bevel=min(radius * 0.22, 0.006), segments=3)
    return obj


def add_curve_tube(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    curve_data = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve_data.dimensions = "3D"
    curve_data.resolution_u = 3
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = 3
    spline = curve_data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve_data)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def interpolate_polyline(points: list[Vector], t: float) -> tuple[Vector, Vector]:
    scaled = clamp(t) * (len(points) - 1)
    index = min(len(points) - 2, int(math.floor(scaled)))
    local = scaled - index
    start = points[index]
    end = points[index + 1]
    return start.lerp(end, local), (end - start).normalized()


def pose_arms(body: bpy.types.Object) -> dict[str, int]:
    original_paths = {
        -1: [Vector((-0.235, -0.020, 1.475)), Vector((-0.330, -0.030, 1.195)), Vector((-0.405, -0.055, 0.865))],
        1: [Vector((0.235, -0.020, 1.475)), Vector((0.330, -0.030, 1.195)), Vector((0.405, -0.055, 0.865))],
    }
    target_paths = {
        -1: [Vector((-0.235, -0.020, 1.475)), Vector((-0.225, -0.235, 1.285)), Vector((-0.055, -0.355, 1.155))],
        1: [Vector((0.235, -0.020, 1.475)), Vector((0.305, -0.215, 1.300)), Vector((0.205, -0.365, 1.185))],
    }
    moved = {-1: 0, 1: 0}
    for vertex in body.data.vertices:
        co = vertex.co.copy()
        abs_x = abs(co.x)
        side = -1 if co.x < 0.0 else 1
        arm_width = smoothstep(0.215, 0.285, abs_x)
        height_window = smoothstep(0.78, 0.88, co.z) * (1.0 - smoothstep(1.49, 1.54, co.z))
        weight = arm_width * height_window
        if weight <= 0.0:
            continue
        t = clamp((1.475 - co.z) / (1.475 - 0.865))
        shoulder_blend = smoothstep(0.02, 0.18, t)
        weight *= shoulder_blend
        original_center, original_tangent = interpolate_polyline(original_paths[side], t)
        target_center, target_tangent = interpolate_polyline(target_paths[side], t)
        rotation = original_tangent.rotation_difference(target_tangent)
        mapped = target_center + rotation @ (co - original_center)
        vertex.co = co.lerp(mapped, weight)
        if weight >= 0.5:
            moved[side] += 1
    body.data.update()
    return {"right": moved[-1], "left": moved[1]}


def add_suit_and_armor(
    construction: bpy.types.Collection,
    detail: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    black = materials["undersuit"]
    ivory = materials["ivory"]
    red = materials["red"]
    cyan = materials["cyan"]
    dark = materials["dark_metal"]

    # Separate low-profile garment cages. Armor hides the intentionally simple
    # central lofts; visible silhouette is carried by anatomy and hard-surface pieces.
    objects.append(loft_vertical("KYX_V6B_Undersuit_Torso", [
        (0.88, -0.010, 0.175, 0.112),
        (1.02, -0.012, 0.180, 0.105),
        (1.16, -0.015, 0.175, 0.100),
        (1.31, -0.020, 0.215, 0.112),
        (1.43, -0.020, 0.245, 0.118),
    ], construction, black))
    for side in (-1, 1):
        x = 0.132 * side
        leg = loft_path(
            f"KYX_V6B_Undersuit_Leg_{'R' if side < 0 else 'L'}",
            [(x, 0.010, 0.11), (x, 0.012, 0.34), (x, -0.010, 0.57), (x, -0.025, 0.80), (x * 0.92, -0.015, 0.94)],
            [(0.075, 0.070), (0.080, 0.072), (0.085, 0.078), (0.105, 0.095), (0.120, 0.105)],
            construction,
            black,
            segments=20,
        )
        objects.append(leg)
    arm_paths = {
        -1: [(-0.235, -0.020, 1.455), (-0.225, -0.235, 1.285), (-0.055, -0.355, 1.155)],
        1: [(0.235, -0.020, 1.455), (0.305, -0.215, 1.300), (0.205, -0.365, 1.185)],
    }
    for side, path in arm_paths.items():
        objects.append(loft_path(
            f"KYX_V6B_Undersuit_Arm_{'R' if side < 0 else 'L'}",
            path,
            [(0.080, 0.075), (0.067, 0.063), (0.055, 0.050)],
            construction,
            black,
            segments=18,
        ))

    # Split fitted chest construction with real thickness and an abdominal break.
    objects.append(extruded_xz_panel("KYX_V6B_ChestPlate_R", [
        (-0.245, 1.405), (-0.065, 1.435), (-0.025, 1.345), (-0.050, 1.225), (-0.190, 1.220), (-0.245, 1.305)
    ], -0.142, -0.115, construction, ivory, bevel=0.010))
    objects.append(extruded_xz_panel("KYX_V6B_ChestPlate_L", [
        (0.245, 1.405), (0.065, 1.435), (0.025, 1.345), (0.050, 1.225), (0.190, 1.220), (0.245, 1.305)
    ], -0.142, -0.115, construction, ivory, bevel=0.010))
    objects.append(extruded_xz_panel("KYX_V6B_AbdominalArticulation", [
        (-0.185, 1.205), (0.185, 1.205), (0.155, 1.115), (-0.145, 1.115)
    ], -0.128, -0.105, construction, dark, bevel=0.007))
    objects.append(extruded_xz_panel("KYX_V6B_BackPlate", [
        (-0.235, 1.405), (0.235, 1.405), (0.205, 1.225), (0.115, 1.165), (-0.115, 1.165), (-0.205, 1.225)
    ], 0.102, 0.128, construction, ivory, bevel=0.010))

    # Helmet: black sealed foundation, separate crown/side plates, visor, cheeks, chin.
    objects.append(add_uv_ellipsoid("KYX_V6B_HelmetSeal", (0.0, -0.030, 1.650), (0.113, 0.122, 0.145), construction, dark))
    objects.append(ellipsoid_patch("KYX_V6B_HelmetCrown", (0.0, -0.030, 1.650), (0.123, 0.132, 0.155),
        (-math.pi, math.pi), (0.0, 0.72), construction, ivory, theta_steps=36, phi_steps=9, thickness=0.010))
    objects.append(ellipsoid_patch("KYX_V6B_Visor", (0.0, -0.040, 1.650), (0.116, 0.137, 0.145),
        (-2.36, -0.78), (0.48, 1.34), construction, materials["visor"], theta_steps=20, phi_steps=10, thickness=0.006))
    for side in (-1, 1):
        theta_center = math.pi if side < 0 else 0.0
        objects.append(ellipsoid_patch(
            f"KYX_V6B_HelmetSide_{'R' if side < 0 else 'L'}",
            (0.0, -0.030, 1.650), (0.125, 0.132, 0.150),
            (theta_center - 0.62, theta_center + 0.62), (0.52, 1.58),
            construction, ivory, theta_steps=10, phi_steps=10, thickness=0.010,
        ))
    objects.append(extruded_xz_panel("KYX_V6B_HelmetChin", [
        (-0.075, 1.610), (-0.045, 1.555), (0.045, 1.555), (0.075, 1.610), (0.055, 1.640), (-0.055, 1.640)
    ], -0.162, -0.126, construction, ivory, bevel=0.008))

    # Layered cowl rings create a readable cloth seal instead of a neck cylinder.
    for index, (z, rx, ry, offset) in enumerate([
        (1.505, 0.170, 0.135, 0.000),
        (1.485, 0.205, 0.150, -0.006),
        (1.460, 0.245, 0.165, 0.008),
        (1.435, 0.270, 0.180, -0.004),
    ]):
        objects.append(loft_vertical(
            f"KYX_V6B_CowlLayer_{index+1}",
            [(z - 0.012, -0.020 + offset, rx * 0.96, ry * 0.96), (z + 0.012, -0.020 + offset, rx, ry)],
            construction, black, segments=32,
        ))

    # Shoulder shells are partial ellipsoids with deliberately asymmetric language.
    for side in (-1, 1):
        shoulder_x = 0.255 * side
        theta_center = math.pi if side < 0 else 0.0
        objects.append(ellipsoid_patch(
            f"KYX_V6B_ShoulderShell_{'R' if side < 0 else 'L'}",
            (shoulder_x, -0.030, 1.415), (0.155, 0.125, 0.120),
            (theta_center - 1.18, theta_center + 1.18), (0.18, 1.45),
            construction, ivory, theta_steps=16, phi_steps=10, thickness=0.012,
        ))
    objects.append(extruded_xz_panel("KYX_V6B_AsymmetricShoulderSlash", [
        (0.255, 1.490), (0.392, 1.430), (0.365, 1.395), (0.245, 1.452)
    ], -0.147, -0.130, detail, red, bevel=0.004))

    # Forearm guards and leg armor use separate open shells with clearance gaps.
    for side, path in arm_paths.items():
        forearm_path = [path[1], path[2]]
        objects.append(loft_path(
            f"KYX_V6B_ForearmGuard_{'R' if side < 0 else 'L'}",
            forearm_path,
            [(0.079, 0.072), (0.064, 0.058)],
            construction, ivory, segments=18, shell_fraction=0.62,
        ))
    for side in (-1, 1):
        x = 0.132 * side
        objects.append(loft_path(
            f"KYX_V6B_ShinGuard_{'R' if side < 0 else 'L'}",
            [(x, -0.075, 0.12), (x, -0.082, 0.30), (x, -0.075, 0.48)],
            [(0.070, 0.050), (0.080, 0.055), (0.076, 0.052)],
            construction, ivory, segments=18, shell_fraction=0.54,
        ))
        objects.append(add_uv_ellipsoid(
            f"KYX_V6B_KneeShell_{'R' if side < 0 else 'L'}", (x, -0.082, 0.565), (0.090, 0.050, 0.095),
            construction, ivory,
        ))
        objects.append(extruded_xz_panel(
            f"KYX_V6B_ThighSidePlate_{'R' if side < 0 else 'L'}",
            [(0.185 * side, 0.900), (0.250 * side, 0.840), (0.240 * side, 0.660), (0.185 * side, 0.700)],
            -0.035, 0.035, construction, ivory, bevel=0.009,
        ))

    # Constructed boots with heel block, toe taper, ankle clearance, and soles.
    boot_profile = [(-0.225, 0.020), (-0.245, 0.075), (-0.150, 0.145), (0.055, 0.160), (0.110, 0.100), (0.095, 0.035), (0.030, 0.015)]
    sole_profile = [(-0.245, 0.000), (-0.255, 0.035), (0.105, 0.035), (0.120, 0.000)]
    for side in (-1, 1):
        center_x = 0.132 * side
        objects.append(extruded_yz_boot(
            f"KYX_V6B_Boot_{'R' if side < 0 else 'L'}", boot_profile,
            center_x - 0.095, center_x + 0.095, construction, dark,
        ))
        objects.append(extruded_yz_boot(
            f"KYX_V6B_BootSole_{'R' if side < 0 else 'L'}", sole_profile,
            center_x - 0.105, center_x + 0.105, detail, black,
        ))
        # Ivory instep/toe shell.
        objects.append(extruded_yz_boot(
            f"KYX_V6B_BootToePlate_{'R' if side < 0 else 'L'}",
            [(-0.220, 0.070), (-0.205, 0.125), (-0.100, 0.145), (-0.070, 0.080)],
            center_x - 0.082, center_x + 0.082, construction, ivory,
        ))

    # Belt modules and restrained cyan readouts.
    objects.append(extruded_xz_panel("KYX_V6B_BeltCore", [(-0.210, 1.050), (0.210, 1.050), (0.220, 1.005), (-0.220, 1.005)],
        -0.105, -0.060, detail, dark, bevel=0.005))
    for x in (-0.175, -0.075, 0.075, 0.175):
        objects.append(extruded_xz_panel(f"KYX_V6B_BeltModule_{x:+.3f}", [(x-0.035, 1.045), (x+0.035, 1.045), (x+0.032, 0.985), (x-0.032, 0.985)],
            -0.125, -0.082, detail, black, bevel=0.004))
    objects.append(extruded_xz_panel("KYX_V6B_ChestAccent", [(-0.205, 1.405), (-0.075, 1.425), (-0.055, 1.400), (-0.190, 1.380)],
        -0.158, -0.143, detail, red, bevel=0.003))
    objects.append(extruded_xz_panel("KYX_V6B_CyanReadout", [(0.168, 1.370), (0.205, 1.365), (0.205, 1.330), (0.168, 1.335)],
        -0.160, -0.145, detail, cyan, bevel=0.002))
    return objects


def add_rifle_and_contact(
    construction: bpy.types.Collection,
    contact: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    ivory = materials["ivory"]
    dark = materials["dark_metal"]
    black = materials["undersuit"]
    red = materials["red"]
    cyan = materials["cyan"]
    gun_front, gun_back = -0.430, -0.345

    # Continuous rifle construction along +X with distinct stock, receiver,
    # pistol grip, magazine, handguard, barrel, muzzle, sights, and controls.
    objects.append(extruded_xz_panel("KYX_V6B_RifleReceiver", [
        (-0.165, 1.215), (0.110, 1.215), (0.165, 1.245), (0.115, 1.315), (-0.150, 1.305), (-0.205, 1.260)
    ], gun_front, gun_back, construction, dark, bevel=0.008))
    objects.append(extruded_xz_panel("KYX_V6B_RifleReceiverShell", [
        (-0.130, 1.285), (0.100, 1.290), (0.125, 1.260), (-0.115, 1.250)
    ], gun_front - 0.008, gun_back + 0.008, construction, ivory, bevel=0.006))
    objects.append(extruded_xz_panel("KYX_V6B_RifleHandguard", [
        (0.130, 1.225), (0.515, 1.230), (0.550, 1.275), (0.505, 1.315), (0.120, 1.305)
    ], gun_front + 0.008, gun_back - 0.008, construction, ivory, bevel=0.008))
    objects.append(extruded_xz_panel("KYX_V6B_RifleStockUpper", [
        (-0.205, 1.275), (-0.390, 1.330), (-0.475, 1.315), (-0.360, 1.250), (-0.195, 1.235)
    ], gun_front + 0.012, gun_back - 0.012, construction, dark, bevel=0.009))
    objects.append(extruded_xz_panel("KYX_V6B_RifleStockLower", [
        (-0.455, 1.300), (-0.365, 1.255), (-0.310, 1.170), (-0.350, 1.155), (-0.445, 1.240)
    ], gun_front + 0.016, gun_back - 0.016, construction, dark, bevel=0.008))
    objects.append(extruded_xz_panel("KYX_V6B_RifleGrip", [
        (-0.095, 1.225), (-0.015, 1.225), (-0.005, 1.085), (-0.075, 1.075), (-0.125, 1.170)
    ], gun_front + 0.005, gun_back - 0.005, construction, black, bevel=0.008))
    objects.append(extruded_xz_panel("KYX_V6B_RifleTriggerGuard", [
        (-0.015, 1.210), (0.075, 1.205), (0.055, 1.145), (-0.005, 1.145)
    ], gun_front - 0.004, gun_back + 0.004, construction, dark, bevel=0.004))
    objects.append(extruded_xz_panel("KYX_V6B_RifleMagazine", [
        (0.020, 1.215), (0.110, 1.215), (0.100, 0.995), (0.015, 1.015)
    ], gun_front + 0.010, gun_back - 0.010, construction, dark, bevel=0.007))
    objects.append(add_cylinder_between("KYX_V6B_RifleBarrel", (0.515, -0.387, 1.270), (0.735, -0.387, 1.270), 0.018, construction, dark))
    objects.append(add_cylinder_between("KYX_V6B_RifleMuzzle", (0.725, -0.387, 1.270), (0.815, -0.387, 1.270), 0.028, construction, dark))
    objects.append(extruded_xz_panel("KYX_V6B_RifleTopRail", [(-0.120, 1.315), (0.465, 1.315), (0.455, 1.335), (-0.110, 1.335)],
        gun_front + 0.020, gun_back - 0.020, construction, dark, bevel=0.003))
    for x in (0.205, 0.285, 0.365, 0.445):
        objects.append(extruded_xz_panel(f"KYX_V6B_RifleVent_{x:.3f}", [(x-0.026, 1.278), (x+0.026, 1.278), (x+0.020, 1.294), (x-0.020, 1.294)],
            gun_front - 0.010, gun_front - 0.018, contact, dark, bevel=0.003))
    objects.append(extruded_xz_panel("KYX_V6B_RifleAccent", [(0.145, 1.294), (0.235, 1.294), (0.225, 1.310), (0.150, 1.310)],
        gun_front - 0.012, gun_front - 0.021, contact, red, bevel=0.002))
    objects.append(extruded_xz_panel("KYX_V6B_RifleStatus", [(0.020, 1.294), (0.082, 1.294), (0.078, 1.310), (0.020, 1.310)],
        gun_front - 0.013, gun_front - 0.022, contact, cyan, bevel=0.002))

    # Separate five-digit glove construction around the grip/support regions.
    hand_specs = [
        ("Right", (-0.050, -0.414, 1.165), (0.068, 0.050, 0.075), -1),
        ("Left", (0.245, -0.414, 1.245), (0.075, 0.050, 0.062), 1),
    ]
    for label, center, scale, side in hand_specs:
        objects.append(add_uv_ellipsoid(f"KYX_V6B_GlovePalm_{label}", center, scale, contact, black))
        if label == "Right":
            finger_x = [-0.082, -0.058, -0.034, -0.010]
            for index, x in enumerate(finger_x):
                objects.append(add_curve_tube(
                    f"KYX_V6B_Glove_{label}_Finger{index+1}",
                    [(x, -0.448, 1.190), (x + 0.008, -0.466, 1.160), (x + 0.012, -0.445, 1.125)],
                    0.0105, contact, black,
                ))
            objects.append(add_curve_tube("KYX_V6B_Glove_Right_Thumb", [
                (-0.095, -0.425, 1.170), (-0.070, -0.455, 1.150), (-0.038, -0.454, 1.155)
            ], 0.0125, contact, black))
        else:
            finger_x = [0.205, 0.230, 0.255, 0.280]
            for index, x in enumerate(finger_x):
                objects.append(add_curve_tube(
                    f"KYX_V6B_Glove_{label}_Finger{index+1}",
                    [(x, -0.450, 1.270), (x + 0.004, -0.468, 1.245), (x, -0.450, 1.218)],
                    0.0105, contact, black,
                ))
            objects.append(add_curve_tube("KYX_V6B_Glove_Left_Thumb", [
                (0.190, -0.425, 1.255), (0.210, -0.457, 1.235), (0.238, -0.456, 1.238)
            ], 0.0125, contact, black))

    # Contact witnesses stay visible in the Blend but are hidden from renders;
    # the review renderer reads their positions into its report.
    contact_points = {
        "triggerHand": (-0.050, -0.414, 1.165),
        "supportHand": (0.245, -0.414, 1.245),
        "shoulderPocket": (-0.365, -0.370, 1.285),
    }
    for label, location in contact_points.items():
        empty = bpy.data.objects.new(f"KYX_V6B_CONTACT_{label}", None)
        empty.location = location
        empty.empty_display_type = "SPHERE"
        empty.empty_display_size = 0.022
        empty.hide_render = True
        contact.objects.link(empty)
    return objects


def curved_panel(
    name: str,
    front_vertices: list[tuple[float, float, float]],
    inward_y: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    bevel: float = 0.005,
) -> bpy.types.Object:
    """Create a fitted non-planar shell with explicit manufactured thickness."""
    count = len(front_vertices)
    vertices = list(front_vertices)
    vertices.extend((x, y + inward_y, z) for x, y, z in front_vertices)
    faces: list[tuple[int, ...]] = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    obj = mesh_object(name, vertices, faces, collection, material)
    smooth_and_bevel(obj, bevel=bevel, segments=3)
    return obj


def add_suit_and_armor_v2(
    construction: bpy.types.Collection,
    detail: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    """Attempt 2: keep anatomy dominant and add only fitted construction pieces."""
    objects: list[bpy.types.Object] = []
    black = materials["undersuit"]
    ivory = materials["ivory"]
    red = materials["red"]
    cyan = materials["cyan"]
    dark = materials["dark_metal"]

    # Thin tailored seam routes retain the accepted human form rather than
    # replacing it with torso/limb cylinders.
    seam_paths = [
        ("Spine", [(0.0, 0.108, 0.92), (0.0, 0.112, 1.13), (0.0, 0.115, 1.36)]),
        ("Sternum", [(0.0, -0.136, 0.98), (0.0, -0.142, 1.15), (0.0, -0.146, 1.34)]),
        ("Rib_R", [(-0.06, -0.142, 1.12), (-0.13, -0.135, 1.22), (-0.19, -0.115, 1.32)]),
        ("Rib_L", [(0.06, -0.142, 1.12), (0.13, -0.135, 1.22), (0.19, -0.115, 1.32)]),
        ("Leg_R", [(-0.13, -0.078, 0.15), (-0.13, -0.080, 0.43), (-0.145, -0.090, 0.78)]),
        ("Leg_L", [(0.13, -0.078, 0.15), (0.13, -0.080, 0.43), (0.145, -0.090, 0.78)]),
    ]
    for label, points in seam_paths:
        objects.append(add_curve_tube(f"KYX_V6B_UndersuitSeam_{label}", points, 0.0035, detail, dark))

    # Curved chest plates follow the thorax and leave the waist/pelvis visible.
    objects.append(curved_panel("KYX_V6B_ChestPlate_R", [
        (-0.235, -0.108, 1.405), (-0.060, -0.147, 1.420), (-0.025, -0.149, 1.345),
        (-0.055, -0.140, 1.245), (-0.170, -0.127, 1.235), (-0.225, -0.104, 1.305),
    ], 0.018, construction, ivory, bevel=0.008))
    objects.append(curved_panel("KYX_V6B_ChestPlate_L", [
        (0.235, -0.108, 1.405), (0.060, -0.147, 1.420), (0.025, -0.149, 1.345),
        (0.055, -0.140, 1.245), (0.170, -0.127, 1.235), (0.225, -0.104, 1.305),
    ], 0.018, construction, ivory, bevel=0.008))
    objects.append(curved_panel("KYX_V6B_AbdominalBridge", [
        (-0.155, -0.125, 1.220), (0.155, -0.125, 1.220), (0.130, -0.112, 1.155),
        (0.070, -0.118, 1.135), (-0.070, -0.118, 1.135), (-0.130, -0.112, 1.155),
    ], 0.014, construction, dark, bevel=0.006))
    objects.append(curved_panel("KYX_V6B_BackPlate", [
        (-0.220, 0.092, 1.405), (0.220, 0.092, 1.405), (0.195, 0.110, 1.265),
        (0.105, 0.115, 1.205), (-0.105, 0.115, 1.205), (-0.195, 0.110, 1.265),
    ], -0.018, construction, ivory, bevel=0.008))

    # Compact shoulder shells leave the deltoid/upper-arm transition visible.
    for side in (-1, 1):
        shoulder_x = 0.252 * side
        theta_center = math.pi if side < 0 else 0.0
        objects.append(ellipsoid_patch(
            f"KYX_V6B_ShoulderShell_{'R' if side < 0 else 'L'}",
            (shoulder_x, -0.010, 1.420), (0.115, 0.090, 0.082),
            (theta_center - 1.02, theta_center + 1.02), (0.18, 1.32),
            construction, ivory, theta_steps=14, phi_steps=9, thickness=0.009,
        ))
    objects.append(curved_panel("KYX_V6B_AsymmetricShoulderSlash", [
        (0.252, -0.102, 1.472), (0.340, -0.078, 1.438), (0.330, -0.074, 1.412), (0.245, -0.101, 1.445),
    ], 0.010, detail, red, bevel=0.003))

    # The accepted head remains the fitted black helmet seal. Curved patches
    # build a connected brow/crown/cheek language without an added egg shell.
    objects.append(ellipsoid_patch(
        "KYX_V6B_HelmetCrown", (0.0, -0.040, 1.655), (0.106, 0.113, 0.137),
        (-math.pi, math.pi), (0.02, 0.66), construction, ivory,
        theta_steps=36, phi_steps=9, thickness=0.008,
    ))
    objects.append(ellipsoid_patch(
        "KYX_V6B_Visor", (0.0, -0.046, 1.650), (0.102, 0.122, 0.126),
        (-2.30, -0.84), (0.50, 1.25), construction, materials["visor"],
        theta_steps=20, phi_steps=10, thickness=0.004,
    ))
    for side in (-1, 1):
        theta_center = math.pi if side < 0 else 0.0
        objects.append(ellipsoid_patch(
            f"KYX_V6B_HelmetTemple_{'R' if side < 0 else 'L'}",
            (0.0, -0.038, 1.648), (0.110, 0.116, 0.132),
            (theta_center - 0.42, theta_center + 0.42), (0.52, 1.34),
            construction, ivory, theta_steps=8, phi_steps=9, thickness=0.008,
        ))
    objects.append(curved_panel("KYX_V6B_HelmetChin", [
        (-0.062, -0.155, 1.625), (-0.045, -0.159, 1.574), (0.045, -0.159, 1.574),
        (0.062, -0.155, 1.625), (0.042, -0.157, 1.645), (-0.042, -0.157, 1.645),
    ], 0.018, construction, ivory, bevel=0.006))

    # One draped cowl volume, not stacked horizontal rings.
    cowl = loft_vertical("KYX_V6B_Cowl", [
        (1.405, -0.005, 0.235, 0.145),
        (1.438, -0.012, 0.215, 0.137),
        (1.468, -0.020, 0.165, 0.118),
        (1.495, -0.028, 0.125, 0.102),
    ], construction, black, segments=36)
    objects.append(cowl)
    objects.append(add_curve_tube("KYX_V6B_CowlFold", [
        (-0.19, -0.115, 1.420), (-0.04, -0.145, 1.455), (0.13, -0.125, 1.432),
    ], 0.006, detail, dark))

    # Slim open guards preserve elbow/wrist, knee, ankle, and calf landmarks.
    neutral_arm_paths = {
        -1: [(-0.315, -0.035, 1.205), (-0.365, -0.050, 1.050), (-0.402, -0.060, 0.900)],
        1: [(0.315, -0.035, 1.205), (0.365, -0.050, 1.050), (0.402, -0.060, 0.900)],
    }
    for side, path in neutral_arm_paths.items():
        objects.append(loft_path(
            f"KYX_V6B_ForearmGuard_{'R' if side < 0 else 'L'}", path,
            [(0.058, 0.050), (0.054, 0.047), (0.047, 0.043)],
            construction, ivory, segments=18, shell_fraction=0.48,
        ))
    for side in (-1, 1):
        x = 0.132 * side
        objects.append(loft_path(
            f"KYX_V6B_ShinGuard_{'R' if side < 0 else 'L'}",
            [(x, -0.073, 0.135), (x, -0.078, 0.300), (x, -0.072, 0.455)],
            [(0.058, 0.037), (0.065, 0.040), (0.058, 0.036)],
            construction, ivory, segments=18, shell_fraction=0.46,
        ))
        objects.append(ellipsoid_patch(
            f"KYX_V6B_KneeShell_{'R' if side < 0 else 'L'}",
            (x, -0.076, 0.565), (0.073, 0.040, 0.070),
            (-2.62, -0.52), (0.25, 1.65), construction, ivory,
            theta_steps=14, phi_steps=9, thickness=0.008,
        ))
        objects.append(curved_panel(
            f"KYX_V6B_ThighSidePlate_{'R' if side < 0 else 'L'}",
            [(0.170 * side, -0.048, 0.875), (0.215 * side, -0.030, 0.825),
             (0.210 * side, -0.025, 0.700), (0.170 * side, -0.045, 0.735)],
            0.012, construction, ivory, bevel=0.006,
        ))

        # Existing human foot supplies the boot silhouette. These are thin sole,
        # toe, and ankle construction layers only.
        center_x = x
        objects.append(extruded_yz_boot(
            f"KYX_V6B_BootSole_{'R' if side < 0 else 'L'}",
            [(-0.205, 0.002), (-0.218, 0.026), (0.095, 0.026), (0.105, 0.002)],
            center_x - 0.085, center_x + 0.085, detail, dark,
        ))
        objects.append(extruded_yz_boot(
            f"KYX_V6B_BootToePlate_{'R' if side < 0 else 'L'}",
            [(-0.190, 0.055), (-0.175, 0.105), (-0.085, 0.125), (-0.060, 0.068)],
            center_x - 0.070, center_x + 0.070, construction, ivory,
        ))
        objects.append(add_curve_tube(
            f"KYX_V6B_BootAnkleBand_{'R' if side < 0 else 'L'}",
            [(center_x - 0.060, -0.055, 0.125), (center_x, -0.078, 0.115), (center_x + 0.060, -0.055, 0.125)],
            0.006, detail, red,
        ))

    # Restrained identity accents, not a grid of belt boxes.
    objects.append(add_curve_tube("KYX_V6B_WaistBelt", [
        (-0.205, -0.070, 1.045), (-0.100, -0.108, 1.035), (0.0, -0.118, 1.032),
        (0.100, -0.108, 1.035), (0.205, -0.070, 1.045),
    ], 0.010, detail, dark))
    objects.append(curved_panel("KYX_V6B_ChestAccent", [
        (-0.205, -0.150, 1.390), (-0.075, -0.157, 1.412), (-0.058, -0.156, 1.390), (-0.192, -0.149, 1.368),
    ], 0.006, detail, red, bevel=0.0025))
    objects.append(curved_panel("KYX_V6B_CyanReadout", [
        (0.170, -0.148, 1.365), (0.205, -0.145, 1.360), (0.204, -0.144, 1.330), (0.169, -0.148, 1.335),
    ], 0.005, detail, cyan, bevel=0.002))
    return objects


def add_rifle_display_v2(
    contact: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    """Refined standalone rifle construction; literal body contact stays open."""
    objects: list[bpy.types.Object] = []
    ivory = materials["ivory"]
    dark = materials["dark_metal"]
    black = materials["undersuit"]
    red = materials["red"]
    cyan = materials["cyan"]
    front, back = -0.095, -0.015
    objects.append(extruded_xz_panel("KYX_V6B_RifleReceiver", [
        (-0.195, 1.155), (0.100, 1.155), (0.145, 1.185), (0.105, 1.260), (-0.175, 1.250), (-0.220, 1.205),
    ], front, back, contact, dark, bevel=0.009))
    objects.append(extruded_xz_panel("KYX_V6B_RifleReceiverShell", [
        (-0.155, 1.225), (0.090, 1.230), (0.110, 1.205), (-0.135, 1.190),
    ], front - 0.008, back + 0.008, contact, ivory, bevel=0.006))
    objects.append(extruded_xz_panel("KYX_V6B_RifleHandguard", [
        (0.125, 1.165), (0.505, 1.170), (0.545, 1.205), (0.500, 1.250), (0.105, 1.245),
    ], front + 0.006, back - 0.006, contact, ivory, bevel=0.009))
    objects.append(extruded_xz_panel("KYX_V6B_RifleStock", [
        (-0.205, 1.215), (-0.390, 1.275), (-0.475, 1.250), (-0.360, 1.170), (-0.205, 1.175),
    ], front + 0.010, back - 0.010, contact, dark, bevel=0.010))
    objects.append(extruded_xz_panel("KYX_V6B_RifleGrip", [
        (-0.095, 1.165), (-0.020, 1.165), (-0.010, 1.020), (-0.075, 1.015), (-0.120, 1.110),
    ], front + 0.004, back - 0.004, contact, black, bevel=0.008))
    objects.append(extruded_xz_panel("KYX_V6B_RifleMagazine", [
        (0.018, 1.160), (0.105, 1.160), (0.095, 0.965), (0.020, 0.980),
    ], front + 0.008, back - 0.008, contact, dark, bevel=0.007))
    objects.append(add_cylinder_between("KYX_V6B_RifleBarrel", (0.505, -0.055, 1.205), (0.720, -0.055, 1.205), 0.015, contact, dark))
    objects.append(add_cylinder_between("KYX_V6B_RifleMuzzle", (0.710, -0.055, 1.205), (0.790, -0.055, 1.205), 0.023, contact, dark))
    objects.append(extruded_xz_panel("KYX_V6B_RifleTopRail", [
        (-0.130, 1.255), (0.465, 1.255), (0.455, 1.274), (-0.120, 1.274),
    ], front + 0.018, back - 0.018, contact, dark, bevel=0.003))
    for x in (0.205, 0.285, 0.365, 0.445):
        objects.append(extruded_xz_panel(
            f"KYX_V6B_RifleVent_{x:.3f}",
            [(x - 0.022, 1.207), (x + 0.022, 1.207), (x + 0.018, 1.222), (x - 0.018, 1.222)],
            front - 0.008, front - 0.014, contact, dark, bevel=0.002,
        ))
    objects.append(extruded_xz_panel("KYX_V6B_RifleAccent", [
        (0.145, 1.230), (0.230, 1.230), (0.222, 1.245), (0.150, 1.245),
    ], front - 0.010, front - 0.017, contact, red, bevel=0.002))
    objects.append(extruded_xz_panel("KYX_V6B_RifleStatus", [
        (0.012, 1.230), (0.072, 1.230), (0.068, 1.245), (0.012, 1.245),
    ], front - 0.011, front - 0.018, contact, cyan, bevel=0.002))

    # Planning witnesses are honest construction targets, not contact proof.
    for label, location in {
        "triggerTarget": (-0.055, -0.120, 1.110),
        "supportTarget": (0.255, -0.120, 1.190),
        "shoulderTarget": (-0.385, -0.055, 1.235),
    }.items():
        empty = bpy.data.objects.new(f"KYX_V6B_CONTACT_{label}", None)
        empty.location = location
        empty.empty_display_type = "SPHERE"
        empty.empty_display_size = 0.018
        empty.hide_render = True
        contact.objects.link(empty)
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
        raise SystemExit("Expected -- <v6a.blend> <v6b.blend> <report.json>")
    source_path, output_path, report_path = (Path(value).resolve() for value in arguments)
    if source_path == output_path:
        raise RuntimeError("V6-A source and V6-B output must differ")
    if not source_path.is_file():
        raise FileNotFoundError(source_path)
    source_hash_before = sha256(source_path)
    if source_hash_before != PINNED_V6A_SHA256:
        raise RuntimeError(f"Pinned V6-A hash mismatch: {source_hash_before}")

    bpy.ops.wm.open_mainfile(filepath=str(source_path), load_ui=False, use_scripts=False)
    body = bpy.data.objects.get(BODY_V6A)
    if body is None or body.type != "MESH":
        raise RuntimeError(f"Missing accepted V6-A body {BODY_V6A}")

    body.name = BODY_V6B
    body.data.name = f"{BODY_V6B}_Mesh"
    # Attempt 1 proved that an unrigged scripted arm remap regressed the human
    # silhouette. Keep the accepted neutral anatomy intact until the dedicated
    # V6-D rig/contact checkpoint can supply defensible deformation.
    posed_vertices = {"right": 0, "left": 0}
    body["kyx_asset_stage"] = "V6-B_CONSTRUCTION_REVIEW"
    body["kyx_v6a_acceptance"] = "USER_ACCEPTED_2026-07-22"

    root = bpy.data.collections.get("KYX_V6_CC0_AnatomySeed_MaleRealistic")
    if root is not None:
        root.name = "KYX_V6B_AcceptedAnatomyUnderlayer"
    construction = bpy.data.collections.new("KYX_V6B_Construction")
    detail = bpy.data.collections.new("KYX_V6B_DetailAndAccents")
    contact = bpy.data.collections.new("KYX_V6B_RifleContactPreview")
    bpy.context.scene.collection.children.link(construction)
    bpy.context.scene.collection.children.link(detail)
    bpy.context.scene.collection.children.link(contact)

    materials = {
        "undersuit": make_material("KYX_Undersuit_Charcoal", (0.022, 0.026, 0.029, 1.0), roughness=0.74),
        "dark_metal": make_material("KYX_DarkMetal", (0.035, 0.043, 0.047, 1.0), metallic=0.72, roughness=0.28),
        "ivory": make_material("KYX_IvoryCeramic", (0.72, 0.67, 0.56, 1.0), metallic=0.12, roughness=0.34),
        "red": make_material("KYX_RedAccent", (0.46, 0.035, 0.022, 1.0), metallic=0.30, roughness=0.30),
        "cyan": make_material("KYX_CyanReadout", (0.015, 0.35, 0.40, 1.0), metallic=0.12, roughness=0.24,
            emission=(0.01, 0.72, 0.82, 1.0), emission_strength=3.0),
        "visor": make_material("KYX_Visor", (0.008, 0.018, 0.022, 1.0), metallic=0.82, roughness=0.12),
    }
    body.data.materials.clear()
    body.data.materials.append(materials["undersuit"])
    for eye_name in ("KYX_V6A_AnatomySculpt_Eye.L", "KYX_V6A_AnatomySculpt_Eye.R"):
        eye = bpy.data.objects.get(eye_name)
        if eye is not None:
            eye.hide_render = True
            eye.hide_viewport = True

    armor_objects = add_suit_and_armor_v2(construction, detail, materials)
    rifle_objects = add_rifle_display_v2(contact, materials)

    for collection in (construction, detail, contact):
        collection["kyx_asset_stage"] = "V6-B_CONSTRUCTION_REVIEW"
        collection["kyx_checkpoint_claim"] = "NOT_G6"

    scene = bpy.context.scene
    scene["kyx_checkpoint"] = "V6-B"
    scene["kyx_human_direction"] = "V6-A_ACCEPTED"
    scene["kyx_nonclaim"] = "Construction review only; not rigged, exported, runtime, or G6"
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = False
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)

    source_hash_after = sha256(source_path)
    output_hash = sha256(output_path)
    report = {
        "schemaVersion": 1,
        "authoredUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "input": {"path": source_path.name, "sha256Before": source_hash_before, "sha256After": source_hash_after, "unchanged": source_hash_before == source_hash_after},
        "output": {"path": output_path.name, "bytes": output_path.stat().st_size, "sha256": output_hash},
        "checkpoint": "V6-B_CONSTRUCTION_REVIEW_CANDIDATE",
        "userDirection": "ACCEPT_V6_A_AND_PROCEED_AUTONOMOUSLY",
        "posedArmVerticesAtWeightGteHalf": posed_vertices,
        "construction": inventory([construction, detail, contact]),
        "authoredObjectCounts": {"armorAndGarment": len(armor_objects), "rifleAndContact": len(rifle_objects)},
        "requirementsAddressed": [
            "sealed helmet/cowl interface",
            "asymmetric shoulder language",
            "split ivory chest/back armor with articulation gap",
            "separate fitted forearm/thigh/knee/shin/boot construction",
            "continuous rifle stock/receiver/grip/magazine/handguard/barrel/muzzle",
            "explicit trigger/support/shoulder contact targets for the later rigged checkpoint",
            "restrained red and cyan identity accents",
        ],
        "assertions": {
            "acceptedV6AWasPinned": source_hash_before == PINNED_V6A_SHA256,
            "acceptedV6ARemainsUnchanged": source_hash_before == source_hash_after,
            "outputDiffersFromInput": output_hash != source_hash_before,
            "separateConstructionCollectionsExist": all(name in bpy.data.collections for name in ("KYX_V6B_Construction", "KYX_V6B_DetailAndAccents", "KYX_V6B_RifleContactPreview")),
            "rifleContactTargetsExist": all(f"KYX_V6B_CONTACT_{name}" in bpy.data.objects for name in ("triggerTarget", "supportTarget", "shoulderTarget")),
            "noArmatureOrActionClaim": len(bpy.data.armatures) == 0 and len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
        },
        "nonClaims": [
            "V6-B is a construction-review candidate and is not G6 acceptance.",
            "The rifle is a separate construction display; literal two-hand and shoulder contact remains open for the rigged V6-D checkpoint.",
            "No final retopology, UV, texture set, runtime skeleton, animation, LOD, GLB, first-person asset, in-engine integration, or performance claim is made.",
        ],
        "status": "V6B_CONSTRUCTION_CANDIDATE_REQUIRES_VISUAL_AUDIT",
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "outputSha256": output_hash, "objects": report["construction"]["objects"]}, sort_keys=True))


if __name__ == "__main__":
    main()
