from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import bpy
from mathutils import Vector


PREFIX = "KYX_V6C_BENCH_R11_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV11"
SOURCE_BODY = "KYX_V6A_AnatomySculpt_Body"
PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
PINNED_REFERENCE_SHA256 = "9c188fa32daaeec2d284727a5d9e600f94b8b57fee6f0568c7ebac9d462abdd2"

# Geometry helpers only.  No prior revision Blend is opened or appended.
UTILITY_PATH = Path(__file__).with_name("author_v6b_production_sculpt_rev11.py")
SPEC = importlib.util.spec_from_file_location("kyx_rev11_low_level_geometry", UTILITY_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load geometry helpers: {UTILITY_PATH}")
u = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(u)


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


def tag(obj: bpy.types.Object, role: str) -> bpy.types.Object:
    obj["kyx_checkpoint"] = CHECKPOINT
    obj["kyx_role"] = role
    obj["kyx_nonclaim"] = "visual benchmark only; not accepted, rigged, exported, runtime, contact, or G6"
    return obj


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float,
    roughness: float,
    noise_scale: float = 0.0,
    bump_strength: float = 0.0,
    coat: float = 0.0,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(f"{PREFIX}{name}")
    mat.use_nodes = True
    tree = mat.node_tree
    assert tree is not None
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.28
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = coat
    if "Coat Roughness" in bsdf.inputs:
        bsdf.inputs["Coat Roughness"].default_value = min(0.55, roughness + 0.10)
    if emission is not None:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = emission
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    if noise_scale > 0.0 and bump_strength > 0.0:
        noise = tree.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = noise_scale
        noise.inputs["Detail"].default_value = 3.0
        noise.inputs["Roughness"].default_value = 0.62
        bump = tree.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = bump_strength
        bump.inputs["Distance"].default_value = 0.012
        tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def conceal_material() -> bpy.types.Material:
    mat = bpy.data.materials.new(f"{PREFIX}SourceFootConceal")
    mat.use_nodes = True
    tree = mat.node_tree
    assert tree is not None
    tree.nodes.clear()
    output = tree.nodes.new("ShaderNodeOutputMaterial")
    transparent = tree.nodes.new("ShaderNodeBsdfTransparent")
    tree.links.new(transparent.outputs["BSDF"], output.inputs["Surface"])
    return mat


def make_materials() -> dict[str, bpy.types.Material]:
    return {
        "fabric": material("GraphiteTechnicalWeave", (0.003, 0.005, 0.006, 1.0), metallic=0.0, roughness=0.73, noise_scale=145.0, bump_strength=0.16),
        "flex": material("BlackJointKnit", (0.0015, 0.0022, 0.0028, 1.0), metallic=0.0, roughness=0.82, noise_scale=210.0, bump_strength=0.20),
        "rubber": material("TreadRubber", (0.0012, 0.0015, 0.0018, 1.0), metallic=0.0, roughness=0.88, noise_scale=95.0, bump_strength=0.13),
        "dark": material("BlueBlackLoadFrame", (0.0025, 0.0050, 0.0080, 1.0), metallic=0.44, roughness=0.54, noise_scale=70.0, bump_strength=0.045, coat=0.08),
        "mid": material("GraphiteTitanium", (0.009, 0.014, 0.020, 1.0), metallic=0.58, roughness=0.42, noise_scale=82.0, bump_strength=0.035, coat=0.12),
        "light": material("WarmTitaniumCeramic", (0.078, 0.067, 0.052, 1.0), metallic=0.38, roughness=0.40, noise_scale=105.0, bump_strength=0.032, coat=0.14),
        "light_dark": material("SmokedTitaniumCeramic", (0.022, 0.027, 0.029, 1.0), metallic=0.42, roughness=0.46, noise_scale=96.0, bump_strength=0.032, coat=0.10),
        "visor": material("RecessedPetrolVisor", (0.0002, 0.0035, 0.0065, 1.0), metallic=0.02, roughness=0.25, noise_scale=38.0, bump_strength=0.010, coat=0.34),
        "gasket": material("VisorAndPanelGasket", (0.001, 0.0014, 0.0018, 1.0), metallic=0.0, roughness=0.80, noise_scale=180.0, bump_strength=0.12),
        "cyan": material("RestrainedCyanTelemetry", (0.0, 0.025, 0.040, 1.0), metallic=0.12, roughness=0.28, emission=(0.0, 0.32, 0.58, 1.0), emission_strength=2.4),
        "coral": material("SafetyCoral", (0.22, 0.012, 0.006, 1.0), metallic=0.05, roughness=0.48, emission=(0.35, 0.012, 0.003, 1.0), emission_strength=0.45),
        "conceal": conceal_material(),
    }


def add_box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.005,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    return tag(u.add_beveled_box(f"{PREFIX}{name}", location, dimensions, collection, mat, role, bevel=bevel, rotation=rotation), role)


def add_curve(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    cyclic: bool = False,
) -> bpy.types.Object:
    return tag(u.add_curve(f"{PREFIX}{name}", points, radius, collection, mat, role, cyclic=cyclic), role)


def add_ellipsoid(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    segments: int = 40,
    rings: int = 24,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=location)
    obj = bpy.context.object
    obj.name = f"{PREFIX}{name}"
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    u.relink(obj, collection)
    obj.data.materials.append(mat)
    u.smooth(obj)
    return tag(obj, role)


def add_disc_x(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    vertices: int = 40,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=(0.0, math.pi / 2.0, 0.0))
    obj = bpy.context.object
    obj.name = f"{PREFIX}{name}"
    u.relink(obj, collection)
    obj.data.materials.append(mat)
    u.smooth(obj)
    u.add_modifiers(obj, bevel=min(0.004, depth * 0.25), bevel_segments=4)
    return tag(obj, role)


def add_bolt_y(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=depth, location=location, rotation=(math.pi / 2.0, 0.0, 0.0))
    obj = bpy.context.object
    obj.name = f"{PREFIX}{name}"
    u.relink(obj, collection)
    obj.data.materials.append(mat)
    u.add_modifiers(obj, bevel=radius * 0.22, bevel_segments=3)
    return tag(obj, role)


def superellipse_loft_z(
    name: str,
    rings: list[tuple[float, float, float, float, float]],
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    steps: int = 40,
    subdivision: int = 1,
    bevel: float = 0.002,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, center_y, radius_x, radius_y, exponent in rings:
        for index in range(steps):
            theta = math.tau * index / steps
            cosine = math.cos(theta)
            sine = math.sin(theta)
            x = radius_x * math.copysign(abs(cosine) ** (2.0 / exponent), cosine)
            y = center_y + radius_y * math.copysign(abs(sine) ** (2.0 / exponent), sine)
            vertices.append((x, y, z))
    for ring in range(len(rings) - 1):
        current = ring * steps
        following = (ring + 1) * steps
        for index in range(steps):
            nxt = (index + 1) % steps
            faces.append((current + index, current + nxt, following + nxt, following + index))
    faces.append(tuple(reversed(range(steps))))
    last = (len(rings) - 1) * steps
    faces.append(tuple(last + index for index in range(steps)))
    obj = u.new_mesh_object(f"{PREFIX}{name}", vertices, faces, collection, mat, role)
    u.add_modifiers(obj, subdivision=subdivision, bevel=bevel, bevel_segments=4)
    return tag(obj, role)


def ribbon_panel(
    name: str,
    rows: list[tuple[float, float, float, float, float]],
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    front: bool = True,
    width_steps: int = 10,
    thickness: float = 0.010,
    subdivision: int = 1,
) -> bpy.types.Object:
    """Closed curved shell. Row=(z, center_x, half_width, base_y, crown)."""
    outer: list[tuple[float, float, float]] = []
    inward = 1.0 if front else -1.0
    for z, center_x, half_width, base_y, crown in rows:
        for index in range(width_steps):
            t = -1.0 + 2.0 * index / (width_steps - 1)
            y = base_y + (-crown if front else crown) * (1.0 - t * t)
            outer.append((center_x + half_width * t, y, z))
    vertices = outer + [(x, y + inward * thickness, z) for x, y, z in outer]
    layer = len(outer)
    faces: list[tuple[int, ...]] = []
    for row in range(len(rows) - 1):
        current = row * width_steps
        following = (row + 1) * width_steps
        for index in range(width_steps - 1):
            a, b = current + index, current + index + 1
            c, d = following + index + 1, following + index
            faces.append((a, b, c, d))
            faces.append((layer + d, layer + c, layer + b, layer + a))
    boundary: list[int] = []
    boundary.extend(range(width_steps))
    boundary.extend(row * width_steps + width_steps - 1 for row in range(1, len(rows)))
    boundary.extend((len(rows) - 1) * width_steps + index for index in range(width_steps - 2, -1, -1))
    boundary.extend(row * width_steps for row in range(len(rows) - 2, 0, -1))
    for index, current in enumerate(boundary):
        following = boundary[(index + 1) % len(boundary)]
        faces.append((current, following, layer + following, layer + current))
    obj = u.new_mesh_object(f"{PREFIX}{name}", vertices, faces, collection, mat, role)
    u.add_modifiers(obj, subdivision=subdivision, bevel=min(0.0028, thickness * 0.30), bevel_segments=4)
    return tag(obj, role)


def profile_volume_xz(
    name: str,
    outline: list[tuple[float, float]],
    center_y: float,
    depth: float,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.004,
) -> bpy.types.Object:
    half = depth * 0.5
    vertices = [(x, center_y - half, z) for x, z in outline] + [(x, center_y + half, z) for x, z in outline]
    count = len(outline)
    faces: list[tuple[int, ...]] = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    obj = u.new_mesh_object(f"{PREFIX}{name}", vertices, faces, collection, mat, role)
    u.add_modifiers(obj, bevel=bevel, bevel_segments=5)
    return tag(obj, role)


def partial_shell(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radii: tuple[float, float],
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    span: float,
    center_direction: Vector,
    thickness: float,
) -> bpy.types.Object:
    obj = u.add_partial_limb_shell(
        f"{PREFIX}{name}", start, end, radii, collection, mat, role,
        span_degrees=span, axial_steps=12, radial_steps=22,
        center_direction=center_direction, thickness=thickness,
    )
    return tag(obj, role)


def build_helmet(
    armor: bpy.types.Collection,
    detail: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    objects.append(superellipse_loft_z(
        "HelmetIntegratedShell",
        [
            (1.505, 0.004, 0.078, 0.082, 2.55),
            (1.545, 0.004, 0.104, 0.112, 2.55),
            (1.640, 0.008, 0.117, 0.132, 2.45),
            (1.748, 0.014, 0.110, 0.124, 2.38),
            (1.825, 0.020, 0.086, 0.096, 2.30),
            (1.862, 0.022, 0.045, 0.050, 2.15),
        ],
        armor, mats["light"], "single connected compound helmet shell enclosing accepted head",
        steps=44, subdivision=1, bevel=0.0025,
    ))
    objects.append(superellipse_loft_z(
        "HelmetNeckSeal",
        [
            (1.455, 0.010, 0.092, 0.078, 2.5),
            (1.488, 0.005, 0.108, 0.093, 2.5),
            (1.530, 0.004, 0.104, 0.099, 2.45),
        ],
        armor, mats["gasket"], "close articulated helmet-to-neck seal",
        steps=40, subdivision=1, bevel=0.0015,
    ))

    columns, rows = 27, 9
    verts: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for row in range(rows):
        v = row / (rows - 1)
        for column in range(columns):
            t = -1.0 + 2.0 * column / (columns - 1)
            top = 1.739 - 0.032 * abs(t) ** 1.5
            bottom = 1.616 + 0.032 * abs(t) ** 1.3
            z = bottom + (top - bottom) * v
            x = 0.098 * t
            y = -0.137 - 0.038 * (1.0 - t * t) - 0.004 * math.sin(math.pi * v)
            verts.append((x, y, z))
    for row in range(rows - 1):
        for column in range(columns - 1):
            a = row * columns + column
            b = a + 1
            d = (row + 1) * columns + column
            c = d + 1
            faces.append((a, b, c, d))
    visor = u.new_mesh_object(f"{PREFIX}NarrowCompoundVisor", verts, faces, armor, mats["visor"], "single narrow aggressive compound visor recessed into helmet shell")
    u.add_modifiers(visor, subdivision=1, solidify=0.007, bevel=0.0025, bevel_segments=4)
    objects.append(tag(visor, "single narrow aggressive compound visor recessed into helmet shell"))

    top_edge, bottom_edge = [], []
    for index in range(15):
        t = -1.0 + 2.0 * index / 14
        x = 0.100 * t
        y = -0.141 - 0.038 * (1.0 - t * t)
        top_edge.append((x, y - 0.002, 1.742 - 0.032 * abs(t) ** 1.5))
        bottom_edge.append((x, y - 0.003, 1.613 + 0.032 * abs(t) ** 1.3))
    objects.append(add_curve("VisorGasketTop", top_edge, 0.0035, detail, mats["gasket"], "continuous upper visor gasket"))
    objects.append(add_curve("VisorGasketBottom", bottom_edge, 0.0035, detail, mats["gasket"], "continuous lower visor gasket"))
    objects.append(add_curve("VisorGasketLeft", [top_edge[0], (-0.105, -0.144, 1.670), bottom_edge[0]], 0.0035, detail, mats["gasket"], "left visor seal"))
    objects.append(add_curve("VisorGasketRight", [top_edge[-1], (0.105, -0.144, 1.670), bottom_edge[-1]], 0.0035, detail, mats["gasket"], "right visor seal"))

    objects.append(ribbon_panel(
        "IntegratedChinArmor",
        [
            (1.525, 0.0, 0.064, -0.105, 0.025),
            (1.565, 0.0, 0.086, -0.117, 0.028),
            (1.606, 0.0, 0.094, -0.121, 0.027),
        ],
        armor, mats["light_dark"], "integrated chin shell flowing into visor and neck seal",
        thickness=0.012, subdivision=1,
    ))
    objects.append(ribbon_panel(
        "LowProfileBrowArmor",
        [
            (1.733, 0.0, 0.103, -0.109, 0.026),
            (1.770, 0.0, 0.088, -0.096, 0.022),
            (1.797, 0.0, 0.060, -0.082, 0.015),
        ],
        armor, mats["light_dark"], "low profile brow integrated into crown",
        thickness=0.010, subdivision=1,
    ))

    side_profile = [(-0.103, 1.565), (-0.128, 1.610), (-0.132, 1.705), (-0.105, 1.768), (-0.082, 1.735), (-0.086, 1.608)]
    for side, label in ((-1.0, "L"), (1.0, "R")):
        yz = [(y, z) for y, z in side_profile]
        x0, x1 = sorted((0.101 * side, 0.124 * side))
        temple = u.extrude_yz_profile(f"{PREFIX}TempleCheekFrame_{label}", yz, x0, x1, armor, mats["mid"], "slim temple and cheek load frame wrapping visor edge", bevel=0.004)
        objects.append(tag(temple, "slim temple and cheek load frame wrapping visor edge"))
        objects.append(add_disc_x(f"TemplePivotOuter_{label}", (0.126 * side, 0.006, 1.668), 0.031, 0.014, detail, mats["dark"], "concentric helmet pivot"))
        objects.append(add_disc_x(f"TemplePivotInner_{label}", (0.134 * side, 0.006, 1.668), 0.017, 0.010, detail, mats["light_dark"], "nested helmet pivot cap"))
        objects.append(add_curve(
            f"CrownSweepSeam_{label}",
            [(0.018 * side, -0.038, 1.852), (0.065 * side, -0.018, 1.828), (0.098 * side, 0.015, 1.772), (0.110 * side, 0.054, 1.718)],
            0.0022, detail, mats["gasket"], "crown-to-temple manufactured seam",
        ))
        objects.append(add_curve(
            f"JawToNeckRail_{label}",
            [(0.092 * side, -0.125, 1.603), (0.105 * side, -0.100, 1.558), (0.094 * side, -0.053, 1.505)],
            0.0048, detail, mats["mid"], "continuous jaw-to-neck structural rail",
        ))
    objects.append(ribbon_panel(
        "OccipitalLoadPlate",
        [
            (1.575, 0.0, 0.072, 0.112, 0.014),
            (1.655, 0.0, 0.091, 0.123, 0.018),
            (1.748, 0.0, 0.079, 0.112, 0.014),
            (1.805, 0.0, 0.050, 0.083, 0.010),
        ],
        armor, mats["dark"], "integrated rear helmet load plate",
        front=False, thickness=0.010, subdivision=1,
    ))
    for x in (-0.032, 0.0, 0.032):
        objects.append(add_curve(
            f"OccipitalVent_{x:+.3f}",
            [(x, 0.137, 1.615), (x, 0.142, 1.686), (x * 0.8, 0.132, 1.750)],
            0.0026, detail, mats["gasket"], "recessed occipital ventilation channel",
        ))
    objects.append(add_box("HelmetTelemetry", (0.0, -0.126, 1.814), (0.030, 0.008, 0.007), detail, mats["cyan"], "restrained crown telemetry slit", bevel=0.002))
    return objects


def build_torso(
    armor: bpy.types.Collection,
    detail: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    objects.append(superellipse_loft_z(
        "ConnectedThoracicCarrier",
        [
            (1.015, 0.006, 0.180, 0.115, 3.0),
            (1.080, 0.004, 0.218, 0.135, 3.0),
            (1.190, 0.000, 0.260, 0.154, 2.85),
            (1.325, -0.004, 0.298, 0.170, 2.65),
            (1.440, -0.002, 0.286, 0.164, 2.55),
            (1.505, 0.000, 0.232, 0.138, 2.45),
        ],
        armor, mats["dark"], "single continuous thoracic carrier connecting collar chest ribs waist and back",
        steps=48, subdivision=1, bevel=0.0025,
    ))

    # Light thoracic plates remain subordinate to a connected dark load frame.
    for side, label in ((-1.0, "L"), (1.0, "R")):
        objects.append(ribbon_panel(
            f"ClaviclePectoralShell_{label}",
            [
                (1.318, 0.112 * side, 0.110, -0.142, 0.030),
                (1.390, 0.118 * side, 0.126, -0.151, 0.034),
                (1.462, 0.102 * side, 0.120, -0.139, 0.030),
                (1.495, 0.080 * side, 0.086, -0.116, 0.022),
            ],
            armor, mats["light"], "curved clavicle and pectoral shell integrated into thoracic carrier",
            thickness=0.012, subdivision=1,
        ))
        objects.append(ribbon_panel(
            f"ObliqueRibShell_{label}",
            [
                (1.116, 0.125 * side, 0.094, -0.125, 0.024),
                (1.185, 0.148 * side, 0.110, -0.142, 0.028),
                (1.270, 0.159 * side, 0.116, -0.151, 0.031),
                (1.327, 0.145 * side, 0.107, -0.146, 0.029),
            ],
            armor, mats["light_dark"], "overlapping oblique rib shell carrying chest loads into waist",
            thickness=0.011, subdivision=1,
        ))
        objects.append(ribbon_panel(
            f"RearScapularShell_{label}",
            [
                (1.245, 0.120 * side, 0.112, 0.132, 0.025),
                (1.335, 0.137 * side, 0.128, 0.149, 0.031),
                (1.425, 0.116 * side, 0.122, 0.143, 0.028),
                (1.485, 0.083 * side, 0.087, 0.117, 0.020),
            ],
            armor, mats["light_dark"], "back-conforming scapular shell connected to collar and waist",
            front=False, thickness=0.011, subdivision=1,
        ))
        objects.append(add_curve(
            f"ClavicleLoadRail_{label}",
            [(0.035 * side, -0.170, 1.466), (0.115 * side, -0.174, 1.430), (0.215 * side, -0.164, 1.372), (0.268 * side, -0.125, 1.330)],
            0.0065, detail, mats["mid"], "continuous clavicle-to-shoulder exoskeletal load rail",
        ))
        objects.append(add_curve(
            f"ObliqueLoadRail_{label}",
            [(0.050 * side, -0.167, 1.315), (0.132 * side, -0.172, 1.245), (0.175 * side, -0.157, 1.155), (0.142 * side, -0.135, 1.065)],
            0.0060, detail, mats["mid"], "continuous pectoral-to-waist oblique load rail",
        ))
        objects.append(add_curve(
            f"RearLoadRail_{label}",
            [(0.050 * side, 0.162, 1.458), (0.130 * side, 0.170, 1.365), (0.166 * side, 0.158, 1.230), (0.126 * side, 0.132, 1.070)],
            0.0055, detail, mats["mid"], "continuous rear scapula-to-waist load rail",
        ))

    objects.append(ribbon_panel(
        "SternumKeel",
        [
            (1.100, 0.0, 0.072, -0.139, 0.024),
            (1.220, 0.0, 0.066, -0.159, 0.028),
            (1.350, 0.0, 0.057, -0.168, 0.031),
            (1.475, 0.0, 0.046, -0.145, 0.025),
            (1.510, 0.0, 0.031, -0.119, 0.016),
        ],
        armor, mats["mid"], "continuous tapered sternum keel locking chest to abdomen",
        thickness=0.013, subdivision=1,
    ))
    for index, (z0, z1, width) in enumerate(((1.255, 1.305, 0.090), (1.185, 1.242, 0.105), (1.112, 1.172, 0.118), (1.045, 1.102, 0.126))):
        objects.append(ribbon_panel(
            f"ArticulatedAbdomenLamella_{index + 1}",
            [
                (z0, 0.0, width * 0.92, -0.137, 0.021),
                (z1, 0.0, width, -0.143, 0.024),
            ],
            armor, mats["light_dark"] if index % 2 else mats["mid"], "overlapping abdomen lamella carried by sternum and waist rails",
            thickness=0.010, subdivision=1,
        ))
    objects.append(superellipse_loft_z(
        "CloseWaistLoadRing",
        [
            (0.995, 0.010, 0.184, 0.108, 3.2),
            (1.030, 0.004, 0.205, 0.119, 3.1),
            (1.070, 0.002, 0.213, 0.125, 3.0),
        ],
        armor, mats["mid"], "body-close waist load ring receiving torso and pelvic rails",
        steps=44, subdivision=1, bevel=0.002,
    ))
    for side, label in ((-1.0, "L"), (1.0, "R")):
        objects.append(ribbon_panel(
            f"WaistKidneyPlate_{label}",
            [
                (1.005, 0.135 * side, 0.067, -0.090, 0.018),
                (1.052, 0.142 * side, 0.072, -0.103, 0.020),
                (1.085, 0.131 * side, 0.066, -0.097, 0.018),
            ],
            armor, mats["light"], "waist side plate nested into load ring",
            thickness=0.010, subdivision=1,
        ))
    objects.append(add_box("SternumTelemetry", (0.0, -0.194, 1.399), (0.018, 0.008, 0.055), detail, mats["cyan"], "single restrained sternum telemetry channel", bevel=0.003))
    for side, label in ((-1.0, "L"), (1.0, "R")):
        for index, z in enumerate((1.205, 1.245, 1.285)):
            objects.append(add_box(f"RibVent_{label}_{index + 1}", (0.177 * side, -0.178, z), (0.026, 0.008, 0.005), detail, mats["gasket"], "recessed pectoral ventilation slot", bevel=0.0015))
        for z in (1.355, 1.423):
            objects.append(add_bolt_y(f"ChestFastener_{label}_{z:.3f}", (0.205 * side, -0.181, z), 0.0040, 0.010, detail, mats["light_dark"], "flush thoracic fastener"))
    return objects


def build_pelvis_and_limbs(
    armor: bpy.types.Collection,
    detail: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    objects.append(superellipse_loft_z(
        "IntegratedPelvicCarrier",
        [
            (0.825, 0.012, 0.178, 0.112, 3.1),
            (0.875, 0.008, 0.216, 0.132, 3.0),
            (0.945, 0.004, 0.238, 0.142, 2.9),
            (1.005, 0.003, 0.213, 0.127, 3.0),
        ],
        armor, mats["dark"], "continuous pelvic carrier joining waist hips and thigh suspension",
        steps=44, subdivision=1, bevel=0.0025,
    ))
    objects.append(ribbon_panel(
        "PelvicFrontLock",
        [
            (0.828, 0.0, 0.070, -0.115, 0.022),
            (0.880, 0.0, 0.102, -0.139, 0.028),
            (0.945, 0.0, 0.124, -0.144, 0.029),
            (0.995, 0.0, 0.106, -0.126, 0.024),
        ],
        armor, mats["light_dark"], "central pelvic lock integrated into waist and hip saddles",
        thickness=0.012, subdivision=1,
    ))
    objects.append(ribbon_panel(
        "PelvicRearLock",
        [
            (0.842, 0.0, 0.096, 0.108, 0.020),
            (0.912, 0.0, 0.132, 0.136, 0.026),
            (0.982, 0.0, 0.112, 0.122, 0.022),
        ],
        armor, mats["light_dark"], "rear pelvic plate joining waist to gluteal armor",
        front=False, thickness=0.011, subdivision=1,
    ))

    for side, label in ((-1.0, "L"), (1.0, "R")):
        front = Vector((0.0, -1.0, 0.0))
        back = Vector((0.0, 1.0, 0.0))
        # Low-profile shoulder and arm shells share overlap and rail continuity.
        objects.append(partial_shell(f"ShoulderCarrier_{label}", (0.268 * side, 0.000, 1.438), (0.327 * side, -0.002, 1.298), (0.087, 0.073), armor, mats["dark"], "deep shoulder carrier nested into clavicle rail", span=268.0, center_direction=front, thickness=0.010))
        objects.append(partial_shell(f"ShoulderStrikeShell_{label}", (0.276 * side, -0.013, 1.425), (0.323 * side, -0.016, 1.330), (0.092, 0.080), armor, mats["light"], "low-profile shoulder strike shell following deltoid", span=142.0, center_direction=front, thickness=0.011))
        objects.append(partial_shell(f"UpperArmCarrier_{label}", (0.323 * side, 0.000, 1.330), (0.355 * side, -0.002, 1.145), (0.071, 0.060), armor, mats["dark"], "continuous upper-arm carrier overlapping shoulder and elbow", span=282.0, center_direction=front, thickness=0.009))
        objects.append(partial_shell(f"UpperArmStrikeShell_{label}", (0.327 * side, -0.014, 1.310), (0.352 * side, -0.017, 1.183), (0.076, 0.064), armor, mats["light_dark"], "curved upper-arm strike shell nested into carrier", span=150.0, center_direction=front, thickness=0.010))
        objects.append(add_ellipsoid(f"ElbowHousing_{label}", (0.360 * side, -0.004, 1.120), (0.066, 0.057, 0.070), armor, mats["dark"], "anatomical elbow housing bridging arm shells"))
        objects.append(partial_shell(f"ElbowAnteriorShell_{label}", (0.356 * side, -0.010, 1.164), (0.368 * side, -0.015, 1.076), (0.066, 0.061), armor, mats["light_dark"], "anterior elbow shell overlapping both limb carriers", span=176.0, center_direction=front, thickness=0.010))
        objects.append(partial_shell(f"ForearmCarrier_{label}", (0.366 * side, 0.000, 1.076), (0.397 * side, -0.002, 0.792), (0.061, 0.049), armor, mats["dark"], "continuous tapered forearm carrier from elbow to wrist", span=286.0, center_direction=front, thickness=0.009))
        objects.append(partial_shell(f"ForearmStrikeShell_{label}", (0.369 * side, -0.014, 1.052), (0.394 * side, -0.016, 0.824), (0.065, 0.054), armor, mats["light"], "curved forearm shell with integrated wrist transition", span=158.0, center_direction=front, thickness=0.010))
        objects.append(add_disc_x(f"ElbowPivotOuter_{label}", (0.371 * side, -0.001, 1.118), 0.023, 0.013, detail, mats["mid"], "nested elbow pivot"))
        objects.append(add_disc_x(f"ElbowPivotInner_{label}", (0.379 * side, -0.001, 1.118), 0.012, 0.008, detail, mats["light"], "elbow pivot cap"))

        # Hip saddle overlaps the waist and thigh rather than floating beside it.
        objects.append(partial_shell(f"HipSuspensionSaddle_{label}", (0.168 * side, 0.000, 0.976), (0.190 * side, -0.002, 0.832), (0.096, 0.088), armor, mats["mid"], "deep hip saddle overlapping pelvic carrier and thigh shell", span=286.0, center_direction=front, thickness=0.011))
        objects.append(partial_shell(f"HipOuterStrikeShell_{label}", (0.175 * side, -0.012, 0.957), (0.193 * side, -0.015, 0.858), (0.101, 0.092), armor, mats["light"], "fitted hip strike shell nested into suspension saddle", span=152.0, center_direction=Vector((0.62 * side, -0.78, 0.0)), thickness=0.011))
        objects.append(partial_shell(f"ThighCarrier_{label}", (0.190 * side, 0.000, 0.848), (0.157 * side, -0.001, 0.588), (0.087, 0.076), armor, mats["dark"], "continuous deep thigh carrier joining hip and knee", span=294.0, center_direction=front, thickness=0.010))
        objects.append(partial_shell(f"ThighStrikeShell_{label}", (0.190 * side, -0.015, 0.824), (0.160 * side, -0.017, 0.620), (0.093, 0.082), armor, mats["light"], "broad tapered thigh strike shell integrated into carrier", span=166.0, center_direction=Vector((0.24 * side, -0.97, 0.0)), thickness=0.011))
        objects.append(partial_shell(f"ThighRearCounterShell_{label}", (0.184 * side, 0.010, 0.800), (0.158 * side, 0.012, 0.630), (0.089, 0.078), armor, mats["light_dark"], "rear thigh counter shell balancing front armor mass", span=108.0, center_direction=back, thickness=0.009))
        objects.append(add_ellipsoid(f"KneeHousing_{label}", (0.153 * side, -0.004, 0.548), (0.078, 0.066, 0.076), armor, mats["dark"], "nested knee housing bridging thigh and shin"))
        objects.append(partial_shell(f"KneeStrikeShell_{label}", (0.154 * side, -0.010, 0.600), (0.154 * side, -0.018, 0.505), (0.080, 0.074), armor, mats["light_dark"], "anterior knee shell nested into full housing", span=188.0, center_direction=front, thickness=0.011))
        objects.append(partial_shell(f"ShinCarrier_{label}", (0.154 * side, -0.001, 0.505), (0.171 * side, 0.000, 0.217), (0.071, 0.060), armor, mats["dark"], "continuous shin carrier joining knee and armored boot collar", span=294.0, center_direction=front, thickness=0.010))
        objects.append(partial_shell(f"ShinStrikeShell_{label}", (0.154 * side, -0.015, 0.480), (0.170 * side, -0.017, 0.245), (0.076, 0.065), armor, mats["light"], "long tapered shin strike shell with gameplay-distance mass", span=164.0, center_direction=front, thickness=0.011))
        objects.append(partial_shell(f"CalfCounterShell_{label}", (0.158 * side, 0.012, 0.448), (0.169 * side, 0.012, 0.260), (0.073, 0.062), armor, mats["light_dark"], "rear calf counter shell closing lower-leg silhouette", span=112.0, center_direction=back, thickness=0.009))
        objects.append(add_disc_x(f"KneePivotOuter_{label}", (0.174 * side, -0.001, 0.548), 0.025, 0.014, detail, mats["mid"], "nested knee pivot"))
        objects.append(add_disc_x(f"KneePivotInner_{label}", (0.182 * side, -0.001, 0.548), 0.013, 0.008, detail, mats["light"], "knee pivot cap"))

        objects.append(add_curve(
            f"ShoulderToWristLoadRail_{label}",
            [(0.286 * side, -0.092, 1.402), (0.343 * side, -0.084, 1.285), (0.365 * side, -0.073, 1.116), (0.383 * side, -0.066, 0.950), (0.395 * side, -0.052, 0.818)],
            0.0045, detail, mats["mid"], "continuous arm exoskeletal rail tying shoulder elbow and wrist",
        ))
        objects.append(add_curve(
            f"WaistToAnkleLoadRail_{label}",
            [(0.170 * side, -0.112, 0.995), (0.202 * side, -0.105, 0.884), (0.190 * side, -0.094, 0.735), (0.157 * side, -0.082, 0.548), (0.165 * side, -0.075, 0.350), (0.176 * side, -0.064, 0.220)],
            0.0052, detail, mats["mid"], "continuous waist hip thigh knee shin ankle load rail",
        ))
        for index, z in enumerate((0.720, 0.765, 0.810)):
            objects.append(add_box(f"ThighVent_{label}_{index + 1}", (0.191 * side, -0.111, z), (0.027, 0.008, 0.005), detail, mats["gasket"], "recessed thigh heat-management slot", bevel=0.0015))
        objects.append(add_box(f"ForearmTelemetry_{label}", (0.394 * side, -0.075, 0.905), (0.012, 0.008, 0.040), detail, mats["cyan"], "restrained forearm telemetry slit", bevel=0.002))
        objects.append(add_box(f"ShinTelemetry_{label}", (0.171 * side, -0.082, 0.305), (0.012, 0.008, 0.038), detail, mats["cyan"], "restrained shin telemetry slit", bevel=0.002))
        if side < 0:
            objects.append(add_curve("LeftSafetyRoute", [(-0.281, -0.104, 1.405), (-0.314, -0.098, 1.365), (-0.330, -0.092, 1.322)], 0.0023, detail, mats["coral"], "single asymmetric safety route"))
    return objects


def boot_last_mesh(
    side: float,
    label: str,
    armor: bpy.types.Collection,
    detail: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    center_x = 0.177 * side
    angle = 0.10 * side
    cosine, sine = math.cos(angle), math.sin(angle)

    def transform(lateral: float, longitudinal: float, z: float) -> tuple[float, float, float]:
        return (center_x + lateral * cosine - longitudinal * sine, -0.004 + lateral * sine + longitudinal * cosine, z)

    sections = [
        (0.110, 0.044, 0.026, 0.118),
        (0.065, 0.056, 0.026, 0.126),
        (0.010, 0.066, 0.026, 0.116),
        (-0.055, 0.070, 0.026, 0.102),
        (-0.118, 0.066, 0.026, 0.081),
        (-0.176, 0.052, 0.028, 0.060),
        (-0.207, 0.026, 0.032, 0.052),
    ]
    ring_steps = 28
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for longitudinal, half_width, bottom, top in sections:
        center_z = (bottom + top) * 0.5
        half_height = (top - bottom) * 0.5
        for ring in range(ring_steps):
            theta = math.tau * ring / ring_steps
            lateral = half_width * math.copysign(abs(math.cos(theta)) ** 0.70, math.cos(theta))
            vertical = half_height * math.copysign(abs(math.sin(theta)) ** 0.82, math.sin(theta))
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
    last_obj = u.new_mesh_object(f"{PREFIX}IntegratedBootLast_{label}", vertices, faces, armor, mats["dark"], "low angular integrated boot last")
    u.add_modifiers(last_obj, subdivision=1, bevel=0.0035, bevel_segments=4)
    objects.append(tag(last_obj, "low angular integrated boot last"))

    outline = [(-0.046, 0.120), (0.046, 0.120), (0.061, 0.058), (0.072, -0.060), (0.066, -0.145), (0.044, -0.205), (0.0, -0.222), (-0.044, -0.205), (-0.066, -0.145), (-0.072, -0.060), (-0.061, 0.058)]
    lower = [transform(x, y, 0.008) for x, y in outline]
    upper = [transform(x, y, 0.030) for x, y in outline]
    count = len(outline)
    sole_faces: list[tuple[int, ...]] = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        sole_faces.append((index, nxt, count + nxt, count + index))
    sole = u.new_mesh_object(f"{PREFIX}ContouredOutsole_{label}", lower + upper, sole_faces, detail, mats["rubber"], "contoured rocker outsole")
    u.add_modifiers(sole, bevel=0.006, bevel_segments=4)
    objects.append(tag(sole, "contoured rocker outsole"))

    shaft = superellipse_loft_z(
        f"ArmoredBootCollar_{label}",
        [
            (0.080, 0.020, 0.064, 0.061, 2.9),
            (0.145, 0.018, 0.063, 0.056, 2.9),
            (0.215, 0.012, 0.058, 0.050, 2.8),
            (0.265, 0.006, 0.054, 0.046, 2.8),
        ],
        armor, mats["dark"], "armored boot collar continuous with shin carrier",
        steps=32, subdivision=1, bevel=0.002,
    )
    shaft.location.x = center_x
    objects.append(shaft)

    toe_outline = [(center_x - 0.055, 0.068), (center_x + 0.055, 0.068), (center_x + 0.061, -0.055), (center_x + 0.043, -0.160), (center_x, -0.194), (center_x - 0.043, -0.160), (center_x - 0.061, -0.055)]
    toe_rows = [
        (0.058, center_x, 0.045, -0.170, 0.018),
        (0.083, center_x, 0.060, -0.110, 0.022),
        (0.108, center_x, 0.062, -0.035, 0.025),
    ]
    objects.append(ribbon_panel(f"BootToeInstepShell_{label}", toe_rows, armor, mats["light_dark"], "single tapered toe-to-instep armor shell", thickness=0.009, subdivision=1))
    objects.append(add_box(
        f"BootIntegratedToeCap_{label}",
        transform(0.0, -0.082, 0.067),
        (0.162, 0.218, 0.070),
        armor, mats["dark"], "broad low toe cap fully enclosing the accepted source foot",
        bevel=0.022, rotation=(0.0, 0.0, angle),
    ))
    for local_side in (-1.0, 1.0):
        objects.append(add_curve(
            f"BootQuarterRail_{label}_{'O' if local_side == side else 'I'}",
            [transform(0.050 * local_side, 0.080, 0.095), transform(0.061 * local_side, -0.030, 0.104), transform(0.048 * local_side, -0.145, 0.075)],
            0.0042, detail, mats["mid"], "boot quarter rail connecting heel instep and toe",
        ))
    objects.append(profile_volume_xz(
        f"BootHeelCounter_{label}",
        [(center_x - 0.050, 0.045), (center_x + 0.050, 0.045), (center_x + 0.050, 0.160), (center_x + 0.035, 0.215), (center_x - 0.035, 0.215), (center_x - 0.050, 0.160)],
        0.092, 0.030, armor, mats["light_dark"], "tapered heel counter integrated into boot collar", bevel=0.004,
    ))
    for index, longitudinal in enumerate((0.075, 0.020, -0.040, -0.100, -0.155)):
        objects.append(add_box(f"BootTread_{label}_{index + 1}", transform(0.0, longitudinal, 0.005), (0.092, 0.022, 0.009), detail, mats["rubber"], "low transverse tread lug", bevel=0.003, rotation=(0.0, 0.0, angle)))
    objects.append(add_box(f"BootTelemetry_{label}", transform(0.0, 0.108, 0.178), (0.012, 0.008, 0.036), detail, mats["cyan"], "restrained boot telemetry slit", bevel=0.002, rotation=(0.0, 0.0, angle)))
    return objects


def build_rifle(
    rifle: bpy.types.Collection,
    detail: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], dict[str, list[float]]]:
    objects: list[bpy.types.Object] = []
    center_z = 1.020
    receiver = u.add_superellipse_axis_loft(
        f"{PREFIX}RifleReceiverCore",
        [(-0.330, center_z, 0.072, 0.108), (-0.250, center_z + 0.006, 0.082, 0.119), (0.030, center_z + 0.004, 0.084, 0.122), (0.260, center_z, 0.076, 0.105), (0.315, center_z - 0.003, 0.065, 0.088)],
        rifle, mats["dark"], "forged multi-depth receiver core", exponent=3.7, ring_steps=28, bevel=0.004,
    )
    objects.append(tag(receiver, "forged multi-depth receiver core"))
    upper = u.add_superellipse_axis_loft(
        f"{PREFIX}RifleUpperSaddle",
        [(-0.285, center_z + 0.085, 0.073, 0.035), (-0.130, center_z + 0.100, 0.079, 0.044), (0.105, center_z + 0.098, 0.078, 0.042), (0.265, center_z + 0.077, 0.067, 0.032)],
        rifle, mats["light"], "tapered ceramic upper receiver saddle", exponent=3.4, ring_steps=24, bevel=0.0035,
    )
    objects.append(tag(upper, "tapered ceramic upper receiver saddle"))
    handguard = u.add_superellipse_axis_loft(
        f"{PREFIX}RifleHandguardCore",
        [(0.285, center_z - 0.005, 0.069, 0.088), (0.390, center_z - 0.003, 0.071, 0.092), (0.690, center_z - 0.010, 0.061, 0.078), (0.760, center_z - 0.012, 0.049, 0.060)],
        rifle, mats["mid"], "tapered ventilated handguard core", exponent=3.7, ring_steps=28, bevel=0.004,
    )
    objects.append(tag(handguard, "tapered ventilated handguard core"))
    objects.append(add_box("RifleTopSpine", (0.240, -0.002, center_z + 0.111), (1.010, 0.050, 0.025), rifle, mats["light_dark"], "continuous receiver-to-handguard top spine", bevel=0.006))
    objects.append(add_box("RifleLowerSpine", (0.445, 0.000, center_z - 0.094), (0.610, 0.055, 0.026), rifle, mats["dark"], "continuous lower handguard load spine", bevel=0.005))
    for side, label in ((-1.0, "L"), (1.0, "R")):
        y = 0.077 * side
        objects.append(add_curve(f"RifleSideRailUpper_{label}", [(0.285, y, center_z + 0.052), (0.470, y, center_z + 0.062), (0.720, y * 0.82, center_z + 0.042)], 0.006, detail, mats["light"], "handguard upper side rail framing real negative space"))
        objects.append(add_curve(f"RifleSideRailLower_{label}", [(0.300, y, center_z - 0.048), (0.500, y, center_z - 0.060), (0.720, y * 0.82, center_z - 0.042)], 0.006, detail, mats["light_dark"], "handguard lower side rail framing real negative space"))
        for index, x in enumerate((0.360, 0.445, 0.530, 0.615, 0.695)):
            objects.append(add_box(f"RifleVentFrame_{label}_{index + 1}", (x, y * 1.03, center_z + 0.005), (0.048, 0.012, 0.033), detail, mats["gasket"], "recessed handguard vent field", bevel=0.003, rotation=(0.0, -0.20, 0.0)))

    # Open stock has real negative space and a shoulder pad.
    objects.append(add_curve("RifleStockUpperSpar", [(-0.305, 0.0, center_z + 0.070), (-0.470, 0.0, center_z + 0.105), (-0.690, 0.0, center_z + 0.078)], 0.013, rifle, mats["mid"], "open stock upper structural spar"))
    objects.append(add_curve("RifleStockLowerSpar", [(-0.315, 0.0, center_z - 0.040), (-0.490, 0.0, center_z - 0.080), (-0.690, 0.0, center_z - 0.068)], 0.012, rifle, mats["dark"], "open stock lower structural spar"))
    objects.append(add_box("RifleShoulderPad", (-0.715, 0.0, center_z + 0.005), (0.040, 0.106, 0.180), rifle, mats["rubber"], "canted shoulder pad closing open stock", bevel=0.008, rotation=(0.0, 0.10, 0.0)))
    objects.append(add_box("RifleCheekRest", (-0.500, -0.012, center_z + 0.119), (0.265, 0.092, 0.042), rifle, mats["light"], "tapered cheek rest", bevel=0.009, rotation=(0.0, -0.035, 0.0)))

    objects.append(profile_volume_xz(
        "RiflePistolGrip",
        [(-0.185, center_z - 0.070), (-0.090, center_z - 0.070), (-0.075, center_z - 0.235), (-0.135, center_z - 0.275), (-0.205, center_z - 0.205)],
        0.0, 0.100, rifle, mats["gasket"], "ergonomic angled pistol grip", bevel=0.008,
    ))
    objects.append(profile_volume_xz(
        "RifleMagazine",
        [(0.005, center_z - 0.075), (0.115, center_z - 0.075), (0.100, center_z - 0.275), (0.030, center_z - 0.300), (-0.005, center_z - 0.235)],
        0.0, 0.110, rifle, mats["mid"], "tapered removable magazine", bevel=0.007,
    ))
    for index in range(4):
        objects.append(add_box(f"RifleMagazineRib_{index + 1}", (0.030 + index * 0.020, -0.057, center_z - 0.195), (0.007, 0.008, 0.125), detail, mats["dark"], "magazine reinforcement rib", bevel=0.002, rotation=(0.0, 0.05, 0.0)))

    barrel = u.add_cylinder_between(f"{PREFIX}RifleBarrel", (0.735, 0.0, center_z), (1.010, 0.0, center_z), 0.019, rifle, mats["mid"], "rooted precision barrel", vertices=40)
    objects.append(tag(barrel, "rooted precision barrel"))
    muzzle = u.add_cylinder_between(f"{PREFIX}RifleMuzzleBrake", (0.990, 0.0, center_z), (1.105, 0.0, center_z), 0.036, rifle, mats["dark"], "multi-port muzzle brake", vertices=32)
    objects.append(tag(muzzle, "multi-port muzzle brake"))
    for side, label in ((-1.0, "L"), (1.0, "R")):
        for x in (1.015, 1.050, 1.082):
            objects.append(add_box(f"MuzzlePort_{label}_{x:.3f}", (x, 0.032 * side, center_z), (0.018, 0.012, 0.018), detail, mats["gasket"], "recessed muzzle brake port", bevel=0.003))
    for index, x in enumerate((-0.270, -0.200, -0.130, -0.060, 0.010, 0.080, 0.150, 0.220, 0.290, 0.360, 0.430, 0.500, 0.570, 0.640, 0.710)):
        objects.append(add_box(f"RifleRailTooth_{index + 1}", (x, 0.0, center_z + 0.135), (0.035, 0.068, 0.017), detail, mats["mid"], "machined top rail tooth", bevel=0.002))
    objects.append(add_box("RifleOpticBase", (-0.040, 0.0, center_z + 0.165), (0.160, 0.090, 0.042), rifle, mats["dark"], "optic mounting bridge", bevel=0.006))
    optic = u.add_cylinder_between(f"{PREFIX}RifleOpticBody", (-0.085, 0.0, center_z + 0.215), (0.095, 0.0, center_z + 0.215), 0.042, rifle, mats["light_dark"], "compact tubular combat optic", vertices=36)
    objects.append(tag(optic, "compact tubular combat optic"))
    objects.append(add_box("RifleOpticGlass", (0.098, 0.0, center_z + 0.215), (0.009, 0.064, 0.064), detail, mats["visor"], "recessed optic lens", bevel=0.004))
    objects.append(add_box("RifleChargingHandle", (-0.245, -0.102, center_z + 0.055), (0.080, 0.035, 0.025), detail, mats["light"], "functional charging handle", bevel=0.005))
    objects.append(add_curve("RifleTriggerGuard", [(-0.085, -0.056, center_z - 0.070), (-0.020, -0.056, center_z - 0.125), (0.040, -0.056, center_z - 0.075)], 0.006, detail, mats["mid"], "continuous trigger guard"))
    objects.append(add_curve("RifleTrigger", [(-0.015, -0.057, center_z - 0.075), (-0.018, -0.057, center_z - 0.120)], 0.004, detail, mats["light"], "recessed trigger"))
    objects.append(add_box("RifleTelemetry", (0.015, -0.091, center_z + 0.038), (0.080, 0.010, 0.025), detail, mats["cyan"], "restrained receiver telemetry window", bevel=0.004))
    for index, (x, z) in enumerate(((-0.275, center_z + 0.050), (-0.190, center_z - 0.015), (0.165, center_z + 0.030), (0.250, center_z - 0.035), (0.375, center_z + 0.055), (0.660, center_z - 0.050))):
        objects.append(add_bolt_y(f"RifleFastener_{index + 1}", (x, -0.088, z), 0.005, 0.010, detail, mats["light"], "flush rifle fastener"))

    witnesses = {
        "primary_grip": [-0.145, -0.058, center_z - 0.165],
        "support_grip": [0.430, -0.062, center_z - 0.095],
        "shoulder": [-0.727, 0.000, center_z + 0.010],
    }
    for key, location in witnesses.items():
        empty = bpy.data.objects.new(f"{PREFIX}CONTACT_{key}", None)
        empty.location = location
        empty.empty_display_type = "SPHERE"
        empty.empty_display_size = 0.020
        rifle.objects.link(empty)
        tag(empty, "future contact intent witness only")
        objects.append(empty)
    return objects, witnesses


def inventory(collections: list[bpy.types.Collection]) -> dict[str, object]:
    objects = [obj for collection in collections for obj in collection.objects]
    meshes = [obj for obj in objects if obj.type == "MESH"]
    curves = [obj for obj in objects if obj.type == "CURVE"]
    return {
        "collections": [collection.name for collection in collections],
        "objects": len(objects),
        "meshes": len(meshes),
        "curves": len(curves),
        "empties": sum(obj.type == "EMPTY" for obj in objects),
        "meshVertices": sum(len(obj.data.vertices) for obj in meshes),
        "meshPolygons": sum(len(obj.data.polygons) for obj in meshes),
        "materials": sorted({slot.material.name for obj in meshes + curves for slot in obj.material_slots if slot.material}),
    }


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 4:
        raise SystemExit("Expected -- <accepted-v6a.blend> <production-target.png> <rev11.blend> <report.json>")
    v6a_path, reference_path, output_path, report_path = (Path(value).resolve() for value in arguments)
    for path in (v6a_path, reference_path):
        if not path.is_file():
            raise FileNotFoundError(path)
    source_hashes_before = {"acceptedV6A": sha256(v6a_path), "productionTarget": sha256(reference_path)}
    if source_hashes_before != {"acceptedV6A": PINNED_V6A_SHA256, "productionTarget": PINNED_REFERENCE_SHA256}:
        raise RuntimeError(f"Pinned source hash mismatch: {source_hashes_before}")

    bpy.ops.wm.open_mainfile(filepath=str(v6a_path), load_ui=False, use_scripts=False)
    body = bpy.data.objects.get(SOURCE_BODY)
    if body is None or body.type != "MESH":
        raise RuntimeError(f"Missing accepted V6-A body: {SOURCE_BODY}")
    body_geometry_before = mesh_geometry_sha256(body)

    root = bpy.data.collections.new(f"{PREFIX}AuthoredHardSurfaceStrike")
    bpy.context.scene.collection.children.link(root)
    collections: dict[str, bpy.types.Collection] = {}
    for key, suffix in (("garment", "ContinuousTechnicalUndersuit"), ("armor", "ConnectedArmorSystem"), ("detail", "MicroDetailHierarchy"), ("rifle", "ProductionGradeAutoRifle")):
        collection = bpy.data.collections.new(f"{PREFIX}{suffix}")
        root.children.link(collection)
        collections[key] = collection
    mats = make_materials()
    u.relink(body, collections["garment"])
    body.name = f"{PREFIX}AcceptedV6AContinuousUndersuit"
    body.data.name = f"{PREFIX}AcceptedV6AContinuousUndersuit_Mesh"
    body.data.materials.clear()
    for mat in (mats["fabric"], mats["flex"], mats["rubber"], mats["conceal"]):
        body.data.materials.append(mat)
    for polygon in body.data.polygons:
        center = polygon.center
        if center.z < 0.130:
            polygon.material_index = 3
        elif (0.98 < center.z < 1.10) or (0.50 < center.z < 0.64) or (1.00 < center.z < 1.16 and abs(center.x) > 0.27):
            polygon.material_index = 1
        elif center.z < 0.15 or (center.z < 0.80 and abs(center.x) > 0.30):
            polygon.material_index = 2
        else:
            polygon.material_index = 0
    tag(body, "accepted V6-A anatomy preserved as continuous graphite technical undersuit")
    for eye in [obj for obj in bpy.data.objects if "Eye." in obj.name]:
        eye.hide_render = True
        eye.hide_viewport = True

    character_objects: list[bpy.types.Object] = [body]
    character_objects.extend(build_helmet(collections["armor"], collections["detail"], mats))
    character_objects.extend(build_torso(collections["armor"], collections["detail"], mats))
    character_objects.extend(build_pelvis_and_limbs(collections["armor"], collections["detail"], mats))
    for side, label in ((-1.0, "L"), (1.0, "R")):
        character_objects.extend(boot_last_mesh(side, label, collections["armor"], collections["detail"], mats))
    rifle_objects, witnesses = build_rifle(collections["rifle"], collections["rifle"], mats)
    for collection in collections.values():
        for obj in collection.objects:
            role = str(obj.get("kyx_role", "rev11 authored component"))
            tag(obj, role)
    bpy.context.view_layer.update()

    body_geometry_after = mesh_geometry_sha256(body)
    if body_geometry_after != body_geometry_before:
        raise RuntimeError("Accepted V6-A body geometry changed during rev11 authoring")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)
    source_hashes_after = {"acceptedV6A": sha256(v6a_path), "productionTarget": sha256(reference_path)}
    if source_hashes_after != source_hashes_before:
        raise RuntimeError("A pinned source changed during rev11 authoring")
    output_hash = sha256(output_path)
    all_names = [obj.name for obj in bpy.data.objects]
    report = {
        "schemaVersion": 1,
        "authoredUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "sources": {
            "acceptedV6A": {
                "path": str(v6a_path), "sha256Before": source_hashes_before["acceptedV6A"], "sha256After": source_hashes_after["acceptedV6A"], "unchanged": True,
                "bodyGeometrySha256Before": body_geometry_before, "bodyGeometrySha256After": body_geometry_after, "bodyGeometryUnchangedInOutput": body_geometry_before == body_geometry_after,
            },
            "productionTarget": {
                "path": str(reference_path), "sha256Before": source_hashes_before["productionTarget"], "sha256After": source_hashes_after["productionTarget"], "unchanged": True,
                "usage": "sole visual construction reference; no prior revision Blend was opened appended or used as geometry",
            },
        },
        "output": {"path": str(output_path), "bytes": output_path.stat().st_size, "sha256": output_hash},
        "constructionMethod": {
            "loadPaths": "Connected clavicle sternum oblique rear scapular waist hip and ankle rails organize the entire armor system.",
            "helmet": "Single enclosed compound shell with a narrow recessed visor, continuous gasket, slim temple frames, occipital plate, and neck seal.",
            "body": "Continuous thoracic and pelvic carriers with fitted curved shell overlays and deep overlapping limb carriers.",
            "lowerBody": "Waist-to-ankle rails, overlapping hip saddles, deep thigh and shin carriers, knee housings, calf counters, and integrated boot collars.",
            "materials": "Layered technical weave, gasket, metallic load-frame, titanium ceramic, visor, and restrained telemetry materials with procedural micro-roughness.",
            "rifle": "New multi-depth receiver, framed handguard negative spaces, open stock, rooted barrel, optic, controls, rail, magazine, grip, and hardware.",
        },
        "contactWitnesses": witnesses,
        "inventory": inventory(list(collections.values())),
        "objectCounts": {"character": len(character_objects), "rifleAndWitnesses": len(rifle_objects), "contactWitnesses": len(witnesses)},
        "assertions": {
            "builtFromAcceptedV6AOnly": True,
            "priorRevisionBlendOpenedOrAppended": False,
            "acceptedV6AFilePreserved": source_hashes_after["acceptedV6A"] == PINNED_V6A_SHA256,
            "acceptedV6ABodyGeometryPreservedInOutput": body_geometry_before == body_geometry_after,
            "productionTargetPinnedAndPreserved": source_hashes_after["productionTarget"] == PINNED_REFERENCE_SHA256,
            "noV6BObjects": not any("V6B" in name.upper() or "V6_B" in name.upper() for name in all_names),
            "noRev9OrRev10Objects": not any("BENCH_R9_" in name or "BENCH_R10_" in name for name in all_names),
            "noArmatures": len(bpy.data.armatures) == 0,
            "noActions": len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
            "contactWitnessCount": len(witnesses) == 3,
            "noLiteralHeldContactClaim": True,
        },
        "status": "V6C_VISUAL_BENCHMARK_REV11_REQUIRES_DIRECT_VISUAL_AUDIT",
        "nonClaims": [
            "Revision 11 is a visual benchmark candidate; it is not V6-C or G6 acceptance.",
            "Contact empties record future intent only; no held, two-hand, or shoulder contact is claimed.",
            "No retopology, authored UVs, texture bake, rig, animation, LOD, GLB, runtime integration, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "outputSha256": output_hash, "objects": report["inventory"]["objects"], "sourceReferenceSha256": source_hashes_after["productionTarget"]}, sort_keys=True))


if __name__ == "__main__":
    main()
