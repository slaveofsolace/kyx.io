"""Author the isolated KYX Vanguard V6-B fitted-construction attempt 3.

This lane deliberately does not replace or import the earlier V6-B script/output.
Garment and armor shells are extracted from the pinned, accepted V6-A surface so
their fit is literal.  The file is a construction review only: no rig, animation,
runtime export, or final rifle-contact claim is made here.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Callable

import bpy
from mathutils import Vector


PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
BODY_V6A = "KYX_V6A_AnatomySculpt_Body"
BODY_V6B = "KYX_V6B_V3_AcceptedAnatomyUnderlayer"
FacePredicate = Callable[[Vector, Vector], bool]


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <accepted-v6a.blend> <v6b-v3.blend> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None:
        emission_socket = bsdf.inputs.get("Emission Color") or bsdf.inputs.get("Emission")
        strength_socket = bsdf.inputs.get("Emission Strength")
        if emission_socket is not None:
            emission_socket.default_value = emission
        if strength_socket is not None:
            strength_socket.default_value = emission_strength
    return material


def make_hidden_underlayer_material(name: str) -> bpy.types.Material:
    """Transparent review-only material for body faces fully enclosed by boots."""
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    material.node_tree.nodes.clear()
    transparent = material.node_tree.nodes.new("ShaderNodeBsdfTransparent")
    output = material.node_tree.nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(transparent.outputs["BSDF"], output.inputs["Surface"])
    if hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    return material


def tag(obj: bpy.types.Object, role: str) -> bpy.types.Object:
    obj["kyx_checkpoint"] = "V6-B_ATTEMPT_3_FITTED_CONSTRUCTION"
    obj["kyx_role"] = role
    obj["kyx_nonclaim"] = "Construction review; no rig, runtime, G6, or final contact claim"
    return obj


def add_surface_shell(
    body: bpy.types.Object,
    name: str,
    predicate: FacePredicate,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    thickness: float,
    bevel: float,
    role: str,
) -> bpy.types.Object:
    """Copy a face subset from the accepted body and thicken it outward.

    This is intentionally surface-derived rather than a floating primitive.  It
    preserves the accepted anatomy while creating explicit shell rims and depth.
    """
    source_mesh = body.data
    # Polygon normals are maintained by Mesh.update() in Blender 5.x; the old
    # calc_normals_split() API was removed.
    source_mesh.update()
    selected: list[bpy.types.MeshPolygon] = []
    for polygon in source_mesh.polygons:
        center = sum((source_mesh.vertices[index].co for index in polygon.vertices), Vector()) / len(polygon.vertices)
        if predicate(center, polygon.normal):
            selected.append(polygon)
    if not selected:
        raise RuntimeError(f"Surface predicate selected no faces for {name}")

    source_indices = sorted({index for polygon in selected for index in polygon.vertices})
    remap = {source_index: output_index for output_index, source_index in enumerate(source_indices)}
    vertices = [tuple(source_mesh.vertices[index].co) for index in source_indices]
    faces = [tuple(remap[index] for index in polygon.vertices) for polygon in selected]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.matrix_world = body.matrix_world.copy()
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    if thickness >= 0.007:
        # The accepted base topology has deliberately irregular anatomical edge
        # flow.  One Catmull-Clark pass rounds a predicate-cut review boundary
        # without replacing the body-derived curvature or joint clearances.
        refinement = obj.modifiers.new("SurfaceBoundaryRefinement", "SUBSURF")
        refinement.subdivision_type = "CATMULL_CLARK"
        refinement.levels = 1
        refinement.render_levels = 1
    solidify = obj.modifiers.new("ManufacturedThickness", "SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = 1.0
    solidify.use_even_offset = True
    solidify.use_quality_normals = True
    bevel_modifier = obj.modifiers.new("EdgeSoftening", "BEVEL")
    bevel_modifier.width = bevel
    bevel_modifier.segments = 3
    bevel_modifier.limit_method = "ANGLE"
    tag(obj, role)
    obj["surface_fit_source"] = BODY_V6B
    obj["selected_source_faces"] = len(selected)
    return obj


def add_curve_tube(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    cyclic: bool = False,
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
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve_data)
    collection.objects.link(obj)
    curve_data.materials.append(material)
    return tag(obj, role)


def add_loft(
    name: str,
    rings: list[tuple[float, float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    segments: int = 48,
) -> bpy.types.Object:
    """Build a connected, body-overlapping elliptical garment volume."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, center_y, radius_x, radius_y in rings:
        for segment in range(segments):
            angle = math.tau * segment / segments
            vertices.append((radius_x * math.cos(angle), center_y + radius_y * math.sin(angle), z))
    for ring_index in range(len(rings) - 1):
        start = ring_index * segments
        following = (ring_index + 1) * segments
        for segment in range(segments):
            nxt = (segment + 1) % segments
            faces.append((start + segment, start + nxt, following + nxt, following + segment))
    # Leave both ends open: a filled end-cap would create a horizontal disc
    # across the shoulders instead of a collar/cowl volume.
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    subdivision = obj.modifiers.new("FabricSubdivision", "SUBSURF")
    subdivision.levels = 1
    subdivision.render_levels = 1
    thickness = obj.modifiers.new("FabricThickness", "SOLIDIFY")
    thickness.thickness = 0.008
    thickness.offset = 0.0
    thickness.use_even_offset = True
    bevel_modifier = obj.modifiers.new("FabricEdge", "BEVEL")
    bevel_modifier.width = 0.002
    bevel_modifier.segments = 2
    return tag(obj, role)


def add_rounded_box(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.008,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    bevel_modifier = obj.modifiers.new("ManufacturedRadius", "BEVEL")
    bevel_modifier.width = min(bevel, min(scale) * 0.42)
    bevel_modifier.segments = 4
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
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
    vertices: int = 24,
) -> bpy.types.Object:
    start_vector = Vector(start)
    end_vector = Vector(end)
    direction = end_vector - start_vector
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=(start_vector + end_vector) * 0.5)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    bevel_modifier = obj.modifiers.new("EdgeSoftening", "BEVEL")
    bevel_modifier.width = radius * 0.18
    bevel_modifier.segments = 3
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return tag(obj, role)


def add_uv_ellipsoid(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    segments: int = 40,
    rings: int = 20,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    bevel_modifier = obj.modifiers.new("ManufacturedSoftEdge", "BEVEL")
    bevel_modifier.width = min(scale) * 0.08
    bevel_modifier.segments = 3
    return tag(obj, role)


def add_tapered_boot_upper(
    name: str,
    center: tuple[float, float],
    angle: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
) -> bpy.types.Object:
    """Construct a tapered multi-section shoe volume around the measured foot."""
    sections = [
        (-0.155, 0.042, 0.034, 0.092),
        (-0.112, 0.062, 0.034, 0.124),
        (-0.030, 0.066, 0.034, 0.138),
        (0.060, 0.055, 0.034, 0.142),
        (0.112, 0.045, 0.034, 0.122),
    ]
    ring_steps = 16
    cos_angle = math.cos(angle)
    sin_angle = math.sin(angle)

    def transform(lateral: float, longitudinal: float, z: float) -> tuple[float, float, float]:
        return (
            center[0] + lateral * cos_angle - longitudinal * sin_angle,
            center[1] + lateral * sin_angle + longitudinal * cos_angle,
            z,
        )

    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for longitudinal, half_width, bottom_z, top_z in sections:
        center_z = (bottom_z + top_z) * 0.5
        half_height = (top_z - bottom_z) * 0.5
        for ring_index in range(ring_steps):
            theta = math.tau * ring_index / ring_steps
            vertices.append(transform(half_width * math.cos(theta), longitudinal, center_z + half_height * math.sin(theta)))
    for section_index in range(len(sections) - 1):
        current = section_index * ring_steps
        following = (section_index + 1) * ring_steps
        for ring_index in range(ring_steps):
            nxt = (ring_index + 1) % ring_steps
            faces.append((current + ring_index, current + nxt, following + nxt, following + ring_index))
    faces.append(tuple(reversed(range(ring_steps))))
    final = (len(sections) - 1) * ring_steps
    faces.append(tuple(final + index for index in range(ring_steps)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    bevel_modifier = obj.modifiers.new("ConstructedBootRadius", "BEVEL")
    bevel_modifier.width = 0.006
    bevel_modifier.segments = 3
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return tag(obj, role)


def add_ellipsoid_cap(
    name: str,
    center: tuple[float, float, float],
    radius: tuple[float, float, float],
    phi_max: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    theta_steps: int = 48,
    phi_steps: int = 14,
    thickness: float = 0.012,
) -> bpy.types.Object:
    """Build an open manufactured crown cap, not a closed egg volume."""
    cx, cy, cz = center
    rx, ry, rz = radius
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for phi_index in range(phi_steps + 1):
        phi = phi_max * phi_index / phi_steps
        for theta_index in range(theta_steps):
            theta = math.tau * theta_index / theta_steps
            sin_phi = math.sin(phi)
            vertices.append((
                cx + rx * sin_phi * math.cos(theta),
                cy + ry * sin_phi * math.sin(theta),
                cz + rz * math.cos(phi),
            ))
    for phi_index in range(phi_steps):
        current = phi_index * theta_steps
        following = (phi_index + 1) * theta_steps
        for theta_index in range(theta_steps):
            nxt = (theta_index + 1) % theta_steps
            faces.append((current + theta_index, current + nxt, following + nxt, following + theta_index))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    solidify = obj.modifiers.new("CrownThickness", "SOLIDIFY")
    solidify.thickness = thickness
    solidify.offset = 0.0
    solidify.use_even_offset = True
    bevel_modifier = obj.modifiers.new("CrownEdge", "BEVEL")
    bevel_modifier.width = 0.004
    bevel_modifier.segments = 3
    return tag(obj, role)


def extruded_xz_panel(
    name: str,
    polygon_xz: list[tuple[float, float]],
    y_front: float,
    y_back: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.008,
) -> bpy.types.Object:
    count = len(polygon_xz)
    vertices = [(x, y_front, z) for x, z in polygon_xz] + [(x, y_back, z) for x, z in polygon_xz]
    faces: list[tuple[int, ...]] = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    bevel_modifier = obj.modifiers.new("ManufacturedRadius", "BEVEL")
    bevel_modifier.width = bevel
    bevel_modifier.segments = 4
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return tag(obj, role)


def curved_prism(
    name: str,
    front_vertices: list[tuple[float, float, float]],
    inward_y: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.006,
) -> bpy.types.Object:
    """Build a non-planar manufactured panel with explicit edge thickness."""
    count = len(front_vertices)
    vertices = list(front_vertices) + [(x, y + inward_y, z) for x, y, z in front_vertices]
    faces: list[tuple[int, ...]] = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    bevel_modifier = obj.modifiers.new("ManufacturedRadius", "BEVEL")
    bevel_modifier.width = bevel
    bevel_modifier.segments = 4
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return tag(obj, role)


def build_surface_fitted_construction(
    body: bpy.types.Object,
    garment: bpy.types.Collection,
    armor: bpy.types.Collection,
    detail: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    charcoal = materials["undersuit"]
    ivory = materials["ivory"]
    dark = materials["dark_metal"]
    red = materials["red"]
    cyan = materials["cyan"]
    visor = materials["visor"]

    # One continuous body-derived technical suit.  It is not a cage or cylinder;
    # the original clavicle, deltoid, elbow, wrist, pelvis, knee, calf, and digits
    # remain the actual visible silhouette.
    objects.append(add_surface_shell(
        body, "KYX_V6B_V3_TechnicalUndersuit",
        lambda center, normal: 0.195 < center.z < 1.535,
        garment, charcoal, thickness=0.0035, bevel=0.0012, role="continuous fitted technical undersuit",
    ))
    objects.append(add_surface_shell(
        body, "KYX_V6B_V3_HelmetLiner",
        lambda center, normal: center.z >= 1.50,
        garment, charcoal, thickness=0.0040, bevel=0.0012, role="sealed fitted helmet liner",
    ))

    # Split thoracic shells and back yoke are copied from the accepted thorax.
    for side, label in ((-1.0, "R"), (1.0, "L")):
        objects.append(add_surface_shell(
            body, f"KYX_V6B_V3_ChestShell_{label}",
            lambda c, n, side=side: 1.225 < c.z < 1.410 and 0.040 < c.x * side < 0.225 and c.y < -0.065,
            armor, ivory, thickness=0.014, bevel=0.0045, role="surface-fitted split ceramic chest shell",
        ))
    objects.append(add_surface_shell(
        body, "KYX_V6B_V3_BackYoke",
        lambda c, n: 1.225 < c.z < 1.405 and abs(c.x) < 0.220 and c.y > 0.032,
        armor, ivory, thickness=0.013, bevel=0.0045, role="surface-fitted back yoke",
    ))
    objects.append(add_surface_shell(
        body, "KYX_V6B_V3_AbdominalArticulation",
        lambda c, n: 1.105 < c.z < 1.205 and abs(c.x) < 0.165 and c.y < -0.055,
        armor, dark, thickness=0.008, bevel=0.003, role="flexible abdominal articulation bridge",
    ))
    objects.append(add_surface_shell(
        body, "KYX_V6B_V3_WaistHarness",
        lambda c, n: 1.005 < c.z < 1.065,
        detail, dark, thickness=0.010, bevel=0.003, role="continuous fitted waist harness",
    ))

    # Literal surface-derived shoulder, forearm, hand, thigh, knee, shin, and foot
    # pieces.  All preserve joint gaps by construction.
    for side, label in ((-1.0, "R"), (1.0, "L")):
        objects.append(add_surface_shell(
            body, f"KYX_V6B_V3_ShoulderCap_{label}",
            lambda c, n, side=side: 1.340 < c.z < 1.450 and 0.215 < c.x * side < 0.325 and (c.y < 0.030 or n.x * side > 0.42),
            armor, ivory, thickness=0.013, bevel=0.004, role="fitted deltoid-clearance shoulder cap",
        ))
        objects.append(add_surface_shell(
            body, f"KYX_V6B_V3_ForearmGuard_{label}",
            lambda c, n, side=side: 0.940 < c.z < 1.125 and 0.320 < c.x * side < 0.430 and (c.y < -0.010 or n.x * side > 0.55),
            armor, ivory, thickness=0.011, bevel=0.0035, role="fitted open forearm guard",
        ))
        objects.append(add_surface_shell(
            body, f"KYX_V6B_V3_BackhandGuard_{label}",
            lambda c, n, side=side: 0.755 < c.z < 0.895 and c.x * side > 0.365 and (c.y < 0.015 or n.x * side > 0.45),
            armor, dark, thickness=0.007, bevel=0.0025, role="fitted five-digit glove backhand guard",
        ))
        objects.append(add_surface_shell(
            body, f"KYX_V6B_V3_ForearmFlexBand_{label}",
            lambda c, n, side=side: 1.010 < c.z < 1.045 and 0.315 < c.x * side < 0.430,
            detail, dark, thickness=0.014, bevel=0.0025, role="recessed forearm articulation band",
        ))
        objects.append(add_surface_shell(
            body, f"KYX_V6B_V3_ThighShell_{label}",
            lambda c, n, side=side: 0.720 < c.z < 0.885 and 0.145 < c.x * side < 0.230 and (c.y < -0.020 or n.x * side > 0.62),
            armor, ivory, thickness=0.011, bevel=0.0035, role="fitted lateral thigh shell",
        ))
        objects.append(add_surface_shell(
            body, f"KYX_V6B_V3_KneeShell_{label}",
            lambda c, n, side=side: 0.525 < c.z < 0.605 and 0.075 < c.x * side < 0.195 and c.y < 0.000,
            armor, ivory, thickness=0.012, bevel=0.004, role="patella-following knee shell",
        ))
        objects.append(add_surface_shell(
            body, f"KYX_V6B_V3_KneeFlexBand_{label}",
            lambda c, n, side=side: 0.485 < c.z < 0.520 and 0.060 < c.x * side < 0.205,
            detail, dark, thickness=0.012, bevel=0.0025, role="recessed knee articulation band",
        ))
        objects.append(add_surface_shell(
            body, f"KYX_V6B_V3_ShinGuard_{label}",
            lambda c, n, side=side: 0.205 < c.z < 0.445 and 0.070 < c.x * side < 0.195 and c.y < 0.005,
            armor, ivory, thickness=0.011, bevel=0.0035, role="tibia-following shin guard",
        ))
        objects.append(add_surface_shell(
            body, f"KYX_V6B_V3_BootUpper_{label}",
            lambda c, n, side=side: 0.105 < c.z < 0.225 and 0.035 < c.x * side < 0.235,
            garment, dark, thickness=0.010, bevel=0.003, role="anatomy-fitted boot upper",
        ))
        boot_angle = 0.22 * side
        boot_core = add_tapered_boot_upper(
            f"KYX_V6B_V3_BootCore_{label}", (0.195 * side, -0.012), boot_angle,
            garment, dark, "fully enclosing tapered manufactured boot upper",
        )
        objects.append(boot_core)
        toe_x = 0.195 * side + 0.090 * math.sin(boot_angle)
        toe_y = -0.012 - 0.090 * math.cos(boot_angle)
        toe_cap = add_rounded_box(
            f"KYX_V6B_V3_BootToeCap_{label}", (toe_x, toe_y, 0.124), (0.052, 0.056, 0.014),
            armor, ivory, "smooth manufactured boot toe cap without exposed digits", bevel=0.012,
        )
        toe_cap.rotation_euler.z = boot_angle
        objects.append(toe_cap)
        heel_cup = add_rounded_box(
            f"KYX_V6B_V3_BootHeelCup_{label}", (0.173 * side, 0.075, 0.080), (0.050, 0.026, 0.050),
            garment, dark, "connected rounded boot heel cup", bevel=0.012,
        )
        heel_cup.rotation_euler.z = boot_angle
        objects.append(heel_cup)

        # Low, rounded outsole and small separated tread lugs support rather than
        # replace the human foot volume; they intentionally avoid a slab silhouette.
        center_x = 0.195 * side
        sole = add_rounded_box(
            f"KYX_V6B_V3_BootSole_{label}", (center_x, -0.012, 0.024), (0.070, 0.148, 0.020),
            detail, dark, "rounded articulated boot outsole", bevel=0.015,
        )
        sole.rotation_euler.z = boot_angle
        objects.append(sole)
        for lug_index, y in enumerate((-0.165, -0.105, -0.045, 0.015, 0.075)):
            lug_x = center_x + (-y - 0.012) * 0.22 * side
            lug = add_rounded_box(
                f"KYX_V6B_V3_Tread_{label}_{lug_index + 1}", (lug_x, y, 0.002), (0.054, 0.013, 0.005),
                detail, materials["rubber"], "separate boot tread lug", bevel=0.005,
            )
            lug.rotation_euler.z = boot_angle
            objects.append(lug)

    # Connected helmet construction: surface-fitted crown, rear, temples, visor,
    # jaw, and neck/cowl volumes.  No enclosing ellipsoid or egg helmet exists.
    objects.append(add_surface_shell(
        body, "KYX_V6B_V3_HelmetCrown",
        lambda c, n: c.z > 1.690,
        armor, ivory, thickness=0.014, bevel=0.004, role="surface-fitted segmented helmet crown",
    ))
    objects.append(add_ellipsoid_cap(
        "KYX_V6B_V3_SegmentedCrownVolume", (0.0, -0.025, 1.650), (0.116, 0.122, 0.142), 1.54,
        armor, ivory, "open segmented helmet crown volume", thickness=0.012,
    ))
    objects.append(add_surface_shell(
        body, "KYX_V6B_V3_HelmetRearShell",
        lambda c, n: 1.585 < c.z < 1.705 and c.y > -0.015,
        armor, ivory, thickness=0.013, bevel=0.004, role="connected fitted helmet rear shell",
    ))
    for side, label in ((-1.0, "R"), (1.0, "L")):
        objects.append(add_surface_shell(
            body, f"KYX_V6B_V3_HelmetTemple_{label}",
            lambda c, n, side=side: 1.585 < c.z < 1.705 and c.x * side > 0.052 and c.y < 0.005,
            armor, ivory, thickness=0.013, bevel=0.0035, role="surface-fitted helmet temple and cheek shell",
        ))
        objects.append(add_surface_shell(
            body, f"KYX_V6B_V3_HelmetJaw_{label}",
            lambda c, n, side=side: 1.540 < c.z < 1.615 and c.x * side > 0.032 and c.y < -0.075,
            armor, ivory, thickness=0.012, bevel=0.0035, role="connected fitted helmet jaw shell",
        ))
    # An authored angular visor bridges the fitted temples and jaw.  Its center
    # bows forward and its side vertices overlap the surface-derived shell, so it
    # reads as a sealed manufactured assembly instead of exposing facial topology.
    objects.append(curved_prism(
        "KYX_V6B_V3_Visor",
        [(-0.086, -0.166, 1.690), (-0.055, -0.186, 1.716), (0.055, -0.186, 1.716),
         (0.086, -0.166, 1.690), (0.080, -0.179, 1.625), (0.038, -0.193, 1.598),
         (-0.038, -0.193, 1.598), (-0.080, -0.179, 1.625)],
        0.014, armor, visor, "sealed angular visor bridging fitted helmet shells", bevel=0.005,
    ))
    objects.append(add_surface_shell(
        body, "KYX_V6B_V3_HelmetChin",
        lambda c, n: 1.535 < c.z < 1.600 and abs(c.x) < 0.060 and c.y < -0.092,
        armor, dark, thickness=0.010, bevel=0.003, role="connected helmet chin seal",
    ))
    for side, label in ((-1.0, "R"), (1.0, "L")):
        objects.append(curved_prism(
            f"KYX_V6B_V3_VisorTempleBridge_{label}",
            [(0.086 * side, -0.166, 1.690), (0.106 * side, -0.064, 1.690),
             (0.103 * side, -0.058, 1.602), (0.080 * side, -0.179, 1.625)],
            0.008, armor, ivory, "literal visor-to-temple structural bridge", bevel=0.004,
        ))
        objects.append(add_rounded_box(
            f"KYX_V6B_V3_HelmetSideDevice_{label}", (0.103 * side, -0.045, 1.645), (0.013, 0.030, 0.035),
            detail, dark, "connected helmet side fastening device", bevel=0.007,
        ))
    objects.append(add_loft(
        "KYX_V6B_V3_CloseFittedCowl",
        [(1.405, -0.002, 0.188, 0.112), (1.440, -0.008, 0.158, 0.098),
         (1.475, -0.010, 0.128, 0.086), (1.510, -0.008, 0.105, 0.075)],
        garment, charcoal, "close-fitted connected cowl and helmet neck seal", segments=48,
    ))
    # Approximate floating seam tubes were rejected in earlier v3 revisions;
    # seam topology remains deliberately open for authored garment retopology.
    objects.append(add_curve_tube(
        "KYX_V6B_V3_HelmetCrownSeam", [(-0.078, -0.115, 1.710), (0.0, -0.148, 1.754), (0.078, -0.115, 1.710)],
        0.0035, detail, dark, "helmet crown manufacturing seam",
    ))
    objects.append(add_curve_tube(
        "KYX_V6B_V3_HelmetBrowSeal", [(-0.087, -0.137, 1.694), (0.0, -0.162, 1.720), (0.087, -0.137, 1.694)],
        0.0040, detail, red, "restrained helmet brow seal",
    ))

    # Asymmetric red route and restrained cyan readouts are also body-derived,
    # preventing the accent pieces from becoming floating decals.
    objects.append(add_surface_shell(
        body, "KYX_V6B_V3_RedShoulderRoute",
        lambda c, n: 1.360 < c.z < 1.465 and 0.215 < c.x < 0.360 and c.y < 0.030,
        detail, red, thickness=0.018, bevel=0.002, role="asymmetric connected red shoulder route",
    ))
    objects.append(add_surface_shell(
        body, "KYX_V6B_V3_RedChestRoute",
        lambda c, n: 1.365 < c.z < 1.415 and -0.220 < c.x < -0.075 and c.y < -0.075,
        detail, red, thickness=0.018, bevel=0.002, role="asymmetric connected red chest route",
    ))
    objects.append(add_rounded_box(
        "KYX_V6B_V3_CyanChestReadout", (0.155, -0.157, 1.350), (0.025, 0.006, 0.014),
        detail, cyan, "restrained cyan chest readout", bevel=0.004,
    ))
    objects.append(add_rounded_box(
        "KYX_V6B_V3_CyanForearmReadout", (0.387, -0.074, 1.015), (0.012, 0.006, 0.045),
        detail, cyan, "restrained cyan forearm readout", bevel=0.004,
    ))
    return objects


def build_rifle(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    """Build a connected standalone rifle design review, not a contact pose."""
    objects: list[bpy.types.Object] = []
    dark = materials["dark_metal"]
    ivory = materials["ivory"]
    black = materials["undersuit"]
    red = materials["red"]
    cyan = materials["cyan"]
    y_front, y_back = -0.060, 0.020
    objects.append(extruded_xz_panel(
        "KYX_V6B_V3_RifleReceiver",
        [(-0.210, 1.130), (0.120, 1.130), (0.165, 1.175), (0.125, 1.255), (-0.180, 1.250), (-0.230, 1.195)],
        y_front, y_back, collection, dark, "rifle receiver construction", bevel=0.010,
    ))
    objects.append(extruded_xz_panel(
        "KYX_V6B_V3_RifleReceiverCeramic",
        [(-0.155, 1.195), (0.100, 1.200), (0.120, 1.230), (-0.135, 1.240), (-0.180, 1.215)],
        y_front - 0.009, y_back + 0.009, collection, ivory, "fitted rifle receiver shell", bevel=0.007,
    ))
    objects.append(extruded_xz_panel(
        "KYX_V6B_V3_RifleHandguard",
        [(0.125, 1.145), (0.535, 1.155), (0.570, 1.200), (0.520, 1.245), (0.115, 1.240)],
        y_front + 0.004, y_back - 0.004, collection, ivory, "continuous rifle handguard", bevel=0.011,
    ))
    # Skeletonized stock has a deliberate negative-space opening instead of a box.
    objects.append(add_curve_tube(
        "KYX_V6B_V3_RifleStockFrame",
        [(-0.205, -0.018, 1.225), (-0.390, -0.018, 1.300), (-0.505, -0.018, 1.265),
         (-0.410, -0.018, 1.165), (-0.230, -0.018, 1.175), (-0.205, -0.018, 1.225)],
        0.018, collection, dark, "connected skeletonized rifle stock", cyclic=True,
    ))
    objects.append(extruded_xz_panel(
        "KYX_V6B_V3_RiflePistolGrip",
        [(-0.105, 1.140), (-0.025, 1.140), (-0.020, 0.995), (-0.080, 0.985), (-0.125, 1.075)],
        y_front + 0.006, y_back - 0.006, collection, black, "reachable rifle pistol grip", bevel=0.009,
    ))
    objects.append(extruded_xz_panel(
        "KYX_V6B_V3_RifleMagazine",
        [(0.010, 1.135), (0.105, 1.135), (0.095, 0.940), (0.020, 0.955)],
        y_front + 0.008, y_back - 0.008, collection, dark, "removable rifle magazine", bevel=0.007,
    ))
    objects.append(add_cylinder_between(
        "KYX_V6B_V3_RifleBarrel", (0.515, -0.020, 1.200), (0.785, -0.020, 1.200), 0.014,
        collection, dark, "rifle barrel", vertices=32,
    ))
    objects.append(add_cylinder_between(
        "KYX_V6B_V3_RifleMuzzle", (0.775, -0.020, 1.200), (0.870, -0.020, 1.200), 0.024,
        collection, dark, "rifle muzzle device", vertices=32,
    ))
    objects.append(add_rounded_box(
        "KYX_V6B_V3_RifleTopRail", (0.175, -0.020, 1.268), (0.330, 0.025, 0.011),
        collection, dark, "continuous rifle top rail", bevel=0.004,
    ))
    objects.append(add_rounded_box(
        "KYX_V6B_V3_RifleBottomRail", (0.330, -0.020, 1.132), (0.175, 0.027, 0.010),
        collection, dark, "rifle lower accessory rail", bevel=0.004,
    ))
    support_grip = add_rounded_box(
        "KYX_V6B_V3_RifleSupportGrip", (0.315, -0.020, 1.095), (0.025, 0.035, 0.078),
        collection, black, "reachable rifle support grip", bevel=0.010,
    )
    support_grip.rotation_euler.y = -0.16
    objects.append(support_grip)
    objects.append(add_cylinder_between(
        "KYX_V6B_V3_RifleBarrelShroud", (0.475, -0.020, 1.200), (0.610, -0.020, 1.200), 0.029,
        collection, dark, "rifle barrel shroud", vertices=32,
    ))
    objects.append(add_rounded_box(
        "KYX_V6B_V3_RifleEjectionPort", (0.040, y_front - 0.012, 1.205), (0.055, 0.006, 0.022),
        collection, black, "rifle ejection port", bevel=0.004,
    ))
    objects.append(add_rounded_box(
        "KYX_V6B_V3_RifleButtPad", (-0.490, -0.020, 1.225), (0.020, 0.050, 0.068),
        collection, black, "rifle shoulder butt pad", bevel=0.010,
    ))
    objects.append(add_rounded_box(
        "KYX_V6B_V3_RifleFrontSight", (0.480, -0.020, 1.300), (0.018, 0.020, 0.038),
        collection, dark, "rifle front sight", bevel=0.005,
    ))
    objects.append(add_rounded_box(
        "KYX_V6B_V3_RifleRearSight", (-0.120, -0.020, 1.295), (0.022, 0.020, 0.032),
        collection, dark, "rifle rear sight", bevel=0.005,
    ))
    for index, x in enumerate((0.225, 0.315, 0.405, 0.495)):
        objects.append(add_rounded_box(
            f"KYX_V6B_V3_RifleVent_{index + 1}", (x, y_front - 0.010, 1.205), (0.026, 0.008, 0.009),
            collection, dark, "rifle handguard vent witness", bevel=0.003,
        ))
    objects.append(add_rounded_box(
        "KYX_V6B_V3_RifleRedIndex", (0.155, y_front - 0.012, 1.232), (0.045, 0.006, 0.008),
        collection, red, "rifle identity accent", bevel=0.003,
    ))
    objects.append(add_rounded_box(
        "KYX_V6B_V3_RifleStatus", (-0.015, y_front - 0.012, 1.232), (0.032, 0.006, 0.009),
        collection, cyan, "rifle cyan status readout", bevel=0.003,
    ))
    objects.append(add_curve_tube(
        "KYX_V6B_V3_RifleTriggerGuard",
        [(-0.105, -0.020, 1.135), (-0.070, -0.020, 1.175), (-0.015, -0.020, 1.140)],
        0.006, collection, dark, "rifle trigger guard",
    ))
    objects.append(add_rounded_box(
        "KYX_V6B_V3_RifleTrigger", (-0.062, -0.020, 1.145), (0.004, 0.012, 0.020),
        collection, dark, "rifle trigger", bevel=0.002,
    ))

    # Empty witnesses explicitly define later literal-contact work without posing
    # or claiming contact in this unrigged checkpoint.
    for label, location in {
        "triggerTarget": (-0.060, -0.090, 1.120),
        "supportTarget": (0.320, -0.090, 1.175),
        "shoulderTarget": (-0.455, -0.020, 1.245),
    }.items():
        empty = bpy.data.objects.new(f"KYX_V6B_V3_CONTACT_{label}", None)
        empty.location = location
        empty.empty_display_type = "SPHERE"
        empty.empty_display_size = 0.015
        empty.hide_render = True
        collection.objects.link(empty)
        tag(empty, "future literal contact witness; not contact proof")
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
        "surfaceFittedObjects": sorted(obj.name for obj in objects if "surface_fit_source" in obj),
        "materials": sorted({slot.material.name for obj in meshes + curves for slot in obj.material_slots if slot.material}),
        "namedObjects": sorted(obj.name for obj in objects),
    }


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 3:
        raise SystemExit("Expected -- <accepted-v6a.blend> <v6b-v3.blend> <report.json>")
    source_path, output_path, report_path = (Path(value).resolve() for value in arguments)
    if source_path == output_path:
        raise RuntimeError("V6-A source and V6-B v3 output must differ")
    source_hash_before = sha256(source_path)
    if source_hash_before != PINNED_V6A_SHA256:
        raise RuntimeError(f"Pinned V6-A hash mismatch: {source_hash_before}")

    bpy.ops.wm.open_mainfile(filepath=str(source_path), load_ui=False, use_scripts=False)
    body = bpy.data.objects.get(BODY_V6A)
    if body is None or body.type != "MESH":
        raise RuntimeError(f"Missing accepted V6-A body {BODY_V6A}")
    body.name = BODY_V6B
    body.data.name = f"{BODY_V6B}_Mesh"
    body["kyx_asset_stage"] = "V6-B_ATTEMPT_3_FITTED_CONSTRUCTION"
    body["kyx_v6a_acceptance"] = "USER_ACCEPTED_2026-07-22"
    body["kyx_source_sha256"] = PINNED_V6A_SHA256
    body["kyx_review_visibility"] = "PRESERVED_IN_BLEND_BUT_HIDDEN_BEHIND_DERIVED_SHELLS"
    body.hide_render = True

    existing_root = bpy.data.collections.get("KYX_V6_CC0_AnatomySeed_MaleRealistic")
    if existing_root is not None:
        existing_root.name = "KYX_V6B_V3_AcceptedAnatomyUnderlayer"
    garment = bpy.data.collections.new("KYX_V6B_V3_FittedGarment")
    armor = bpy.data.collections.new("KYX_V6B_V3_SurfaceFittedArmor")
    detail = bpy.data.collections.new("KYX_V6B_V3_ManufacturedDetails")
    rifle = bpy.data.collections.new("KYX_V6B_V3_StandaloneRifleDesign")
    for collection in (garment, armor, detail, rifle):
        bpy.context.scene.collection.children.link(collection)
        collection["kyx_checkpoint"] = "V6-B_ATTEMPT_3_FITTED_CONSTRUCTION"
        collection["kyx_claim"] = "NOT_G6"

    materials = {
        "underlayer": make_material("KYX_V6B_V3_AnatomyUnderlayer", (0.012, 0.015, 0.018, 1.0), roughness=0.88),
        "undersuit": make_material("KYX_V6B_V3_TechnicalCharcoal", (0.004, 0.006, 0.008, 1.0), roughness=0.88),
        "dark_metal": make_material("KYX_V6B_V3_DarkMetal", (0.028, 0.037, 0.043, 1.0), metallic=0.72, roughness=0.27),
        "rubber": make_material("KYX_V6B_V3_TreadRubber", (0.009, 0.012, 0.014, 1.0), roughness=0.93),
        "ivory": make_material("KYX_V6B_V3_IvoryCeramic", (0.66, 0.60, 0.49, 1.0), metallic=0.10, roughness=0.32),
        "red": make_material("KYX_V6B_V3_RedAccent", (0.47, 0.030, 0.018, 1.0), metallic=0.25, roughness=0.29),
        "cyan": make_material("KYX_V6B_V3_CyanReadout", (0.010, 0.26, 0.31, 1.0), metallic=0.10, roughness=0.20, emission=(0.01, 0.78, 0.90, 1.0), emission_strength=3.5),
        "visor": make_material("KYX_V6B_V3_Visor", (0.005, 0.017, 0.024, 1.0), metallic=0.88, roughness=0.09),
        "hidden_under_boot": make_hidden_underlayer_material("KYX_V6B_V3_HiddenUnderBoot"),
    }
    body.data.materials.clear()
    body.data.materials.append(materials["underlayer"])
    body.data.materials.append(materials["hidden_under_boot"])
    for polygon in body.data.polygons:
        center_z = sum(body.data.vertices[index].co.z for index in polygon.vertices) / len(polygon.vertices)
        polygon.material_index = 1 if center_z < 0.195 else 0
    for eye_name in ("KYX_V6A_AnatomySculpt_Eye.L", "KYX_V6A_AnatomySculpt_Eye.R"):
        eye = bpy.data.objects.get(eye_name)
        if eye is not None:
            eye.hide_render = True
            eye.hide_viewport = True

    fitted_objects = build_surface_fitted_construction(body, garment, armor, detail, materials)
    rifle_objects = build_rifle(rifle, materials)

    scene = bpy.context.scene
    scene["kyx_checkpoint"] = "V6-B_ATTEMPT_3_FITTED_CONSTRUCTION"
    scene["kyx_human_direction"] = "V6-A_ACCEPTED"
    scene["kyx_method"] = "BODY_SURFACE_DERIVED_FITTED_SHELLS"
    scene["kyx_nonclaim"] = "No rig, animation, runtime export, G6, or final rifle contact"
    scene.render.engine = "BLENDER_EEVEE"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)

    source_hash_after = sha256(source_path)
    output_hash = sha256(output_path)
    report = {
        "schemaVersion": 1,
        "authoredUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": "V6-B_ATTEMPT_3_FITTED_CONSTRUCTION",
        "input": {
            "path": source_path.name,
            "sha256Before": source_hash_before,
            "sha256After": source_hash_after,
            "unchanged": source_hash_before == source_hash_after,
        },
        "output": {"path": output_path.name, "bytes": output_path.stat().st_size, "sha256": output_hash},
        "method": "Garment, armor, helmet, gloves, and boot surfaces derive from accepted V6-A mesh faces, then receive explicit outward thickness and edge treatment.",
        "construction": inventory([garment, armor, detail, rifle]),
        "authoredObjectCounts": {"fittedCharacterConstruction": len(fitted_objects), "standaloneRifleAndWitnesses": len(rifle_objects)},
        "assertions": {
            "acceptedV6APinned": source_hash_before == PINNED_V6A_SHA256,
            "acceptedV6AUnchanged": source_hash_before == source_hash_after,
            "outputDiffersFromInput": output_hash != source_hash_before,
            "surfaceFittedShellsExist": len(inventory([garment, armor, detail])["surfaceFittedObjects"]) >= 20,
            "separateRifleContactWitnessesExist": all(f"KYX_V6B_V3_CONTACT_{name}" in bpy.data.objects for name in ("triggerTarget", "supportTarget", "shoulderTarget")),
            "noArmatures": len(bpy.data.armatures) == 0,
            "noActions": len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
        },
        "nonClaims": [
            "Attempt 3 is a V6-B construction-review candidate only; it is not G6 acceptance.",
            "The rifle is a separate design construction; literal two-hand and shoulder contact remains a later rigged visual gate.",
            "No final retopology, authored UV set, textures, runtime skeleton, animation, LOD, GLB, first-person asset, runtime integration, or performance claim is made.",
        ],
        "status": "V6B_ATTEMPT3_FITTED_CONSTRUCTION_REQUIRES_DIRECT_VISUAL_AUDIT",
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "outputSha256": output_hash, "objects": report["construction"]["objects"]}, sort_keys=True))


if __name__ == "__main__":
    main()
