"""Author V6-C visual benchmark rev2 as a second clean V6-A rebuild.

Revision 1 is read only for an integrity pin.  Its scene and visible geometry
are never loaded.  Revision 2 replaces the rejected orb helmet, plate-like
limbs, inward boot envelope, broad chest shells, and slab rifle with tighter
measured and more strongly tapered continuous surfaces.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


PREFIX = "KYX_V6C_BENCH_R2_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV2"
SOURCE_BODY = "KYX_V6A_AnatomySculpt_Body"
PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
PINNED_REV1_SHA256 = "3cfea3ad9c17d310dec45a83e40804f7386fb487ad49b7223afc7e3bde9289f8"

REV1_PATH = Path(__file__).with_name("author_v6c_visual_benchmark_rev1.py")
SPEC = importlib.util.spec_from_file_location("kyx_v6c_rev1_surface_utilities", REV1_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load rev1 utility module: {REV1_PATH}")
r1 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(r1)
r1.PREFIX = PREFIX
r1.CHECKPOINT = CHECKPOINT
r1.base.PREFIX = PREFIX
r1.base.CHECKPOINT = CHECKPOINT
base = r1.base


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <accepted-v6a.blend> <rev1.blend> <output.blend> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def swept_guard(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radii: tuple[float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    preferred: Vector,
    span_degrees: float,
    axial_steps: int = 23,
    radial_steps: int = 27,
    oval: float = 0.82,
    thickness: float = 0.0065,
    crown: float = 0.060,
) -> bpy.types.Object:
    """Create a strongly almond-tapered anatomical wrap shell."""
    start_v = Vector(start)
    end_v = Vector(end)
    axis = (end_v - start_v).normalized()
    front, lateral = base.perpendicular_basis(axis, preferred)
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    nominal_half_span = math.radians(span_degrees) * 0.5
    for axial in range(axial_steps):
        t = axial / (axial_steps - 1)
        eased = t * t * (3.0 - 2.0 * t)
        envelope = math.sin(math.pi * t) ** 0.72
        center = start_v.lerp(end_v, eased)
        radius = radii[0] + (radii[1] - radii[0]) * eased
        tangential_scale = 0.43 + 0.57 * envelope
        half_span = nominal_half_span * (0.13 + 0.87 * envelope)
        center += front * radius * crown * envelope
        for radial in range(radial_steps):
            u = radial / (radial_steps - 1)
            angle = -half_span + 2.0 * half_span * u
            position = (
                center
                + front * (math.cos(angle) * radius)
                + lateral * (math.sin(angle) * radius * oval * tangential_scale)
            )
            vertices.append(tuple(position))
    for axial in range(axial_steps - 1):
        current = axial * radial_steps
        following = (axial + 1) * radial_steps
        for radial in range(radial_steps - 1):
            faces.append((current + radial, current + radial + 1,
                          following + radial + 1, following + radial))
    obj = base.new_mesh_object(name, vertices, faces, collection, material, role)
    base.add_modifiers(obj, subdivision=2, solidify=thickness,
                       bevel=min(0.0020, thickness * 0.34), bevel_segments=4)
    obj["construction"] = "strongly perimeter-tapered anatomical axial sweep"
    return obj


def helmet_crown_cap(
    name: str,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    rings = [
        (1.585, -0.042, 0.104, 0.112),
        (1.642, -0.044, 0.109, 0.116),
        (1.700, -0.039, 0.101, 0.105),
        (1.748, -0.025, 0.080, 0.080),
        (1.782, -0.006, 0.045, 0.046),
        (1.796, 0.003, 0.014, 0.015),
    ]
    angular_steps = 51
    theta_start = math.radians(-34.0)
    theta_end = math.radians(214.0)
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, center_y, radius_x, radius_y in rings:
        for index in range(angular_steps):
            t = index / (angular_steps - 1)
            theta = theta_start + (theta_end - theta_start) * t
            cosine = math.cos(theta)
            sine = math.sin(theta)
            x = radius_x * math.copysign(abs(cosine) ** 0.87, cosine)
            y = center_y + radius_y * math.copysign(abs(sine) ** 0.92, sine)
            vertices.append((x, y, z))
    for ring in range(len(rings) - 1):
        current = ring * angular_steps
        following = (ring + 1) * angular_steps
        for index in range(angular_steps - 1):
            faces.append((current + index, current + index + 1,
                          following + index + 1, following + index))
    obj = base.new_mesh_object(
        name, vertices, faces, collection, material,
        "tight open-face crown shell wrapping brow sides and a flattened rear",
    )
    base.add_modifiers(obj, subdivision=2, solidify=0.007, bevel=0.002, bevel_segments=4)
    return obj


def foot_transform(
    side: float,
    lateral: float,
    longitudinal: float,
    z: float,
) -> tuple[float, float, float]:
    center_x = 0.203 * side
    angle = 0.070 * side
    return r1.transform_foot(center_x, angle, lateral, longitudinal, z)


def boot_upper(
    name: str,
    side: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    sections = [
        (0.125, 0.057, 0.024, 0.112),
        (0.085, 0.066, 0.025, 0.140),
        (0.030, 0.075, 0.026, 0.174),
        (-0.035, 0.080, 0.026, 0.150),
        (-0.095, 0.079, 0.025, 0.110),
        (-0.150, 0.069, 0.025, 0.082),
        (-0.195, 0.047, 0.027, 0.068),
        (-0.220, 0.020, 0.031, 0.060),
    ]
    ring_steps = 36
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for longitudinal, half_width, bottom, top in sections:
        center_z = (bottom + top) * 0.5
        half_height = (top - bottom) * 0.5
        for ring in range(ring_steps):
            theta = math.tau * ring / ring_steps
            cosine = math.cos(theta)
            sine = math.sin(theta)
            lateral = half_width * math.copysign(abs(cosine) ** 0.68, cosine)
            vertical = half_height * math.copysign(abs(sine) ** 0.82, sine)
            vertices.append(foot_transform(side, lateral, longitudinal, center_z + vertical))
    for section in range(len(sections) - 1):
        current = section * ring_steps
        following = (section + 1) * ring_steps
        for ring in range(ring_steps):
            nxt = (ring + 1) % ring_steps
            faces.append((current + ring, current + nxt, following + nxt, following + ring))
    faces.append(tuple(reversed(range(ring_steps))))
    last = (len(sections) - 1) * ring_steps
    faces.append(tuple(last + ring for ring in range(ring_steps)))
    obj = base.new_mesh_object(
        name, vertices, faces, collection, material,
        "measured anatomical boot upper fully enclosing accepted V6-A foot bounds",
    )
    base.add_modifiers(obj, subdivision=2, bevel=0.002, bevel_segments=4)
    return obj


def boot_shaft(
    name: str,
    side: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    rings = [
        (0.074, 0.048, 0.069, 0.060),
        (0.112, 0.042, 0.070, 0.058),
        (0.156, 0.032, 0.064, 0.053),
        (0.202, 0.024, 0.056, 0.047),
        (0.248, 0.018, 0.050, 0.042),
    ]
    segments = 44
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, longitudinal, radius_x, radius_y in rings:
        for index in range(segments):
            theta = math.tau * index / segments
            cosine = math.cos(theta)
            sine = math.sin(theta)
            lateral = radius_x * math.copysign(abs(cosine) ** 0.75, cosine)
            depth = radius_y * math.copysign(abs(sine) ** 0.86, sine)
            vertices.append(foot_transform(side, lateral, longitudinal + depth, z))
    for ring in range(len(rings) - 1):
        current = ring * segments
        following = (ring + 1) * segments
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((current + index, current + nxt, following + nxt, following + index))
    faces.append(tuple(reversed(range(segments))))
    last = (len(rings) - 1) * segments
    faces.append(tuple(last + index for index in range(segments)))
    obj = base.new_mesh_object(
        name, vertices, faces, collection, material,
        "wide articulated heel-and-ankle shaft overlapping the anatomical upper",
    )
    base.add_modifiers(obj, subdivision=2, bevel=0.002, bevel_segments=4)
    return obj


def boot_outsole(
    name: str,
    side: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    outline = [
        (-0.050, 0.132), (0.050, 0.132), (0.070, 0.098), (0.082, 0.040),
        (0.086, -0.040), (0.083, -0.110), (0.071, -0.170), (0.046, -0.218),
        (0.0, -0.232), (-0.046, -0.218), (-0.071, -0.170), (-0.083, -0.110),
        (-0.086, -0.040), (-0.082, 0.040), (-0.070, 0.098),
    ]
    bottom_z, top_z = 0.006, 0.034
    vertices = [foot_transform(side, x, y, bottom_z) for x, y in outline]
    vertices += [foot_transform(side, x, y, top_z) for x, y in outline]
    count = len(outline)
    faces: list[tuple[int, ...]] = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    obj = base.new_mesh_object(
        name, vertices, faces, collection, material,
        "full-foot contoured outsole integrated under the measured last",
    )
    base.add_modifiers(obj, bevel=0.007, bevel_segments=5)
    return obj


def boot_dorsal_flow(
    name: str,
    side: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    sections = [
        (0.060, 0.043, 0.178), (0.025, 0.050, 0.171),
        (-0.025, 0.052, 0.151), (-0.080, 0.047, 0.116),
        (-0.132, 0.035, 0.090), (-0.170, 0.018, 0.079),
    ]
    columns = 19
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for longitudinal, half_width, top in sections:
        for column in range(columns):
            u = -1.0 + 2.0 * column / (columns - 1)
            lateral = half_width * math.sin(u * math.pi * 0.5)
            z = top + 0.008 * (1.0 - u * u)
            vertices.append(foot_transform(side, lateral, longitudinal, z))
    for section in range(len(sections) - 1):
        current = section * columns
        following = (section + 1) * columns
        for column in range(columns - 1):
            faces.append((current + column, current + column + 1,
                          following + column + 1, following + column))
    obj = base.new_mesh_object(
        name, vertices, faces, collection, material,
        "recessed graphite dorsal articulation flowing continuously over the instep",
    )
    base.add_modifiers(obj, subdivision=2, solidify=0.004, bevel=0.0015, bevel_segments=4)
    return obj


def path_loft(
    name: str,
    sections: list[tuple[float, float, float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    exponent: float = 2.8,
    ring_steps: int = 36,
    subdivision: int = 1,
    bevel: float = 0.004,
) -> bpy.types.Object:
    """Loft a closed softened YZ section along a shaped X/Z path."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for x, center_y, center_z, half_y, half_z in sections:
        for index in range(ring_steps):
            angle = math.tau * index / ring_steps
            cosine = math.cos(angle)
            sine = math.sin(angle)
            y = center_y + half_y * math.copysign(abs(cosine) ** (2.0 / exponent), cosine)
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
    obj = base.new_mesh_object(name, vertices, faces, collection, material, role)
    base.add_modifiers(obj, subdivision=subdivision, bevel=bevel, bevel_segments=4)
    return obj


def upper_axis_shell(
    name: str,
    sections: list[tuple[float, float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
) -> bpy.types.Object:
    """Create a continuous curved upper-half shell along X."""
    radial_steps = 23
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for x, center_z, half_y, half_z in sections:
        for index in range(radial_steps):
            theta = math.pi * index / (radial_steps - 1)
            y = half_y * math.cos(theta)
            z = center_z + half_z * math.sin(theta)
            vertices.append((x, y, z))
    for section in range(len(sections) - 1):
        current = section * radial_steps
        following = (section + 1) * radial_steps
        for index in range(radial_steps - 1):
            faces.append((current + index, current + index + 1,
                          following + index + 1, following + index))
    obj = base.new_mesh_object(name, vertices, faces, collection, material, role)
    base.add_modifiers(obj, subdivision=2, solidify=0.007, bevel=0.002, bevel_segments=4)
    return obj


def build_rifle(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    primary = path_loft(
        f"{PREFIX}AutoRifleContinuousPrimaryVolume",
        [(-0.650, 0.0, 1.222, 0.058, 0.096),
         (-0.555, 0.0, 1.242, 0.064, 0.102),
         (-0.405, 0.0, 1.228, 0.059, 0.077),
         (-0.280, 0.0, 1.220, 0.064, 0.078),
         (-0.100, 0.0, 1.218, 0.068, 0.081),
         (0.070, 0.0, 1.214, 0.065, 0.075),
         (0.180, 0.0, 1.210, 0.060, 0.069),
         (0.390, 0.0, 1.210, 0.051, 0.058),
         (0.560, 0.0, 1.210, 0.035, 0.044)],
        collection, materials["graphite"],
        "one continuous three-dimensional stock receiver and handguard core",
        exponent=3.2, ring_steps=40, subdivision=2, bevel=0.003,
    )
    primary["continuous_primary_volume"] = True
    objects.append(primary)
    objects.append(upper_axis_shell(
        f"{PREFIX}AutoRifleCeramicFlowShell",
        [(-0.300, 1.220, 0.068, 0.086), (-0.180, 1.219, 0.072, 0.090),
         (0.030, 1.215, 0.069, 0.085), (0.180, 1.211, 0.064, 0.077),
         (0.385, 1.211, 0.055, 0.065), (0.525, 1.211, 0.040, 0.050)],
        collection, materials["ivory"],
        "continuous ceramic upper shell flowing from receiver across the handguard",
    ))
    objects.append(upper_axis_shell(
        f"{PREFIX}AutoRifleStockCheekFlow",
        [(-0.620, 1.230, 0.061, 0.104), (-0.555, 1.246, 0.067, 0.108),
         (-0.450, 1.236, 0.062, 0.084), (-0.350, 1.226, 0.060, 0.074)],
        collection, materials["ivory"],
        "short seated cheek shell following the stock volume",
    ))
    objects.append(path_loft(
        f"{PREFIX}AutoRifleIntegratedGrip",
        [(-0.175, 0.0, 1.175, 0.048, 0.050),
         (-0.160, 0.0, 1.100, 0.046, 0.052),
         (-0.137, 0.0, 1.020, 0.043, 0.055),
         (-0.112, 0.0, 0.935, 0.037, 0.048)],
        collection, materials["rubber"],
        "palm-shaped grip loft overlapping the receiver as one functional junction",
        exponent=2.7, ring_steps=32, subdivision=2, bevel=0.003,
    ))
    objects.append(path_loft(
        f"{PREFIX}AutoRifleMagazine",
        [(-0.015, 0.0, 1.150, 0.047, 0.045),
         (0.005, 0.0, 1.075, 0.046, 0.050),
         (0.020, 0.0, 0.990, 0.042, 0.052),
         (0.024, 0.0, 0.910, 0.036, 0.043)],
        collection, materials["graphite"],
        "curved removable magazine continuously seated into the receiver well",
        exponent=3.4, ring_steps=32, subdivision=1, bevel=0.004,
    ))
    objects.append(base.add_cylinder_between(
        f"{PREFIX}AutoRifleBarrel", (0.530, 0.0, 1.210), (0.842, 0.0, 1.210),
        0.012, collection, materials["graphite"],
        "barrel overlapping deeply inside the tapered handguard", vertices=48,
    ))
    objects.append(path_loft(
        f"{PREFIX}AutoRifleMuzzle",
        [(0.820, 0.0, 1.210, 0.020, 0.020),
         (0.875, 0.0, 1.210, 0.023, 0.023),
         (0.930, 0.0, 1.210, 0.018, 0.018)],
        collection, materials["graphite"],
        "tapered muzzle volume joined over the barrel", exponent=2.3,
        ring_steps=36, subdivision=1, bevel=0.002,
    ))
    objects.append(base.add_curve(
        f"{PREFIX}AutoRifleTriggerGuard",
        [(-0.205, -0.046, 1.135), (-0.150, -0.057, 1.175),
         (-0.078, -0.048, 1.132)],
        0.0055, collection, materials["graphite"],
        "trigger guard seated into receiver and grip junction at both ends",
    ))
    objects.append(base.add_curve(
        f"{PREFIX}AutoRifleIdentityRoute",
        [(-0.270, -0.069, 1.274), (-0.115, -0.074, 1.289),
         (0.052, -0.071, 1.281)],
        0.0032, collection, materials["red"],
        "restrained identity seam following the ceramic receiver shell",
    ))
    objects.append(base.add_beveled_box(
        f"{PREFIX}AutoRifleStatus", (0.125, -0.066, 1.266),
        (0.060, 0.006, 0.010), collection, materials["cyan"],
        "flush status slit nested into the ceramic flow shell", bevel=0.003,
    ))

    for label, location in {
        "primary_grip": (-0.132, -0.070, 1.015),
        "support_grip": (0.320, -0.069, 1.155),
        "shoulder": (-0.642, 0.0, 1.225),
    }.items():
        witness = bpy.data.objects.new(f"{PREFIX}CONTACT_{label}", None)
        witness.location = location
        witness.empty_display_type = "SPHERE"
        witness.empty_display_size = 0.014
        witness.hide_render = True
        collection.objects.link(witness)
        base.tag(witness, "future contact witness only; no posed contact claim")
    return objects


def build_character(
    body: bpy.types.Object,
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    suit = collections["suit"]
    armor = collections["armor"]
    equipment = collections["equipment"]

    body.name = f"{PREFIX}ContinuousAnatomicalUndersuit"
    body.data.name = f"{PREFIX}ContinuousAnatomicalUndersuit_Mesh"
    body.data.materials.clear()
    for material in (materials["fabric"], materials["flex"], materials["glove"]):
        body.data.materials.append(material)
    for polygon in body.data.polygons:
        center = polygon.center
        if (abs(center.x) > 0.350 and center.z < 1.18) or center.z < 0.19:
            polygon.material_index = 2
        elif (0.50 < center.z < 0.64) or (0.99 < center.z < 1.17 and abs(center.x) > 0.25):
            polygon.material_index = 1
        else:
            polygon.material_index = 0
    base.tag(body, "accepted V6-A body retained as one continuous fitted woven undersuit")
    body["accepted_v6a_sha256"] = PINNED_V6A_SHA256
    objects.append(body)
    for obj in bpy.context.scene.objects:
        if obj.name.startswith("KYX_V6A_AnatomySculpt_Eye"):
            obj.hide_render = True
            obj.hide_viewport = True
    bvh = base.make_body_bvh(body)

    # Four smaller front layers preserve garment gaps and avoid a merged bib.
    for label, rows, material, role in (
        ("UpperClavicle_L",
         [(1.335, 0.055, 0.130), (1.360, 0.042, 0.174),
          (1.392, 0.055, 0.190), (1.420, 0.080, 0.165),
          (1.438, 0.104, 0.137)],
         materials["ivory"], "small upper left clavicle shell with a rounded ribward edge"),
        ("UpperClavicle_R",
         [(1.335, -0.130, -0.055), (1.360, -0.174, -0.042),
          (1.392, -0.190, -0.055), (1.420, -0.165, -0.080),
          (1.438, -0.137, -0.104)],
         materials["ivory"], "small upper right clavicle shell with a rounded ribward edge"),
        ("LowerRibFlow_L",
         [(1.256, 0.070, 0.096), (1.276, 0.054, 0.126),
          (1.304, 0.050, 0.148), (1.328, 0.070, 0.142),
          (1.343, 0.092, 0.124)],
         materials["graphite"], "recessed left rib-flow layer below the ceramic clavicle shell"),
        ("LowerRibFlow_R",
         [(1.256, -0.096, -0.070), (1.276, -0.126, -0.054),
          (1.304, -0.148, -0.050), (1.328, -0.142, -0.070),
          (1.343, -0.124, -0.092)],
         materials["graphite"], "recessed right rib-flow layer below the ceramic clavicle shell"),
    ):
        objects.append(r1.fitted_patch(
            f"{PREFIX}{label}", rows, bvh, armor, material, role,
            offset=0.009 if "Upper" in label else 0.005,
            columns=27, thickness=0.006 if "Upper" in label else 0.0045,
        ))
    objects.append(r1.fitted_patch(
        f"{PREFIX}SternumInset",
        [(1.242, -0.018, 0.018), (1.286, -0.024, 0.024),
         (1.340, -0.026, 0.026), (1.390, -0.020, 0.020),
         (1.424, -0.010, 0.010)],
        bvh, equipment, materials["graphite"],
        "narrow flush sternum inset maintaining separation between chest layers",
        offset=0.0045, columns=15, thickness=0.0035,
    ))
    for label, rows in (
        ("L", [(1.292, 0.050, 0.108), (1.330, 0.058, 0.140),
               (1.372, 0.076, 0.158), (1.408, 0.100, 0.142)]),
        ("R", [(1.292, -0.108, -0.050), (1.330, -0.140, -0.058),
               (1.372, -0.158, -0.076), (1.408, -0.142, -0.100)]),
    ):
        objects.append(r1.fitted_patch(
            f"{PREFIX}CompactScapular_{label}", rows, bvh, armor, materials["ivory"],
            "compact tapered scapular shell leaving spine and lower back visible",
            front=False, offset=0.008, columns=25, thickness=0.006,
        ))

    seam_points = [tuple(base.surface_hit(bvh, x, z, front=True, offset=0.0025))
                   for x, z in [(-0.105, 1.190), (-0.065, 1.130), (0.0, 1.092),
                                (0.065, 1.130), (0.105, 1.190)]]
    objects.append(base.add_curve(
        f"{PREFIX}AbdominalTailoringSeam", seam_points, 0.0020,
        equipment, materials["graphite"],
        "flush abdominal tailoring seam preserving the continuous garment read",
    ))

    for side, label in ((1.0, "L"), (-1.0, "R")):
        objects.append(swept_guard(
            f"{PREFIX}DeltoidLeaf_{label}",
            (0.250 * side, -0.018, 1.424), (0.298 * side, -0.014, 1.352),
            (0.076, 0.055), armor, materials["ivory"],
            "compact fitted deltoid leaf integrated into clavicle and upper-arm arcs",
            preferred=Vector((0.12 * side, -1.0, 0.02)), span_degrees=142.0,
            axial_steps=21, radial_steps=25, oval=0.80, thickness=0.006,
        ))
        objects.append(swept_guard(
            f"{PREFIX}ForearmLeaf_{label}",
            (0.340 * side, -0.006, 1.125), (0.392 * side, -0.009, 0.978),
            (0.052, 0.039), armor, materials["ivory"],
            "pointed wraparound forearm leaf following radius-ulna taper",
            preferred=Vector((0.05 * side, -1.0, 0.0)), span_degrees=192.0,
        ))
        objects.append(swept_guard(
            f"{PREFIX}ThighLeaf_{label}",
            (0.171 * side, -0.018, 0.884), (0.159 * side, -0.020, 0.716),
            (0.076, 0.061), armor, materials["ivory"],
            "pointed lateral-front thigh leaf wrapping the quadriceps arc",
            preferred=Vector((0.72 * side, -1.0, 0.0)), span_degrees=146.0,
        ))
        objects.append(swept_guard(
            f"{PREFIX}PatellaLeaf_{label}",
            (0.145 * side, -0.014, 0.616), (0.149 * side, -0.015, 0.535),
            (0.065, 0.055), armor, materials["ivory"],
            "compact pointed patella leaf with exposed superior and inferior flex zones",
            preferred=Vector((0.0, -1.0, 0.0)), span_degrees=174.0,
            axial_steps=19, radial_steps=25, crown=0.10,
        ))
        objects.append(swept_guard(
            f"{PREFIX}TibiaLeaf_{label}",
            (0.152 * side, -0.008, 0.478), (0.169 * side, -0.005, 0.274),
            (0.058, 0.043), armor, materials["ivory"],
            "long pointed tibia leaf following shin and ankle taper",
            preferred=Vector((0.10 * side, -1.0, 0.0)), span_degrees=164.0,
            axial_steps=25, radial_steps=27,
        ))
        if label == "L":
            objects.append(base.add_curve(
                f"{PREFIX}LeftShoulderIdentitySeam",
                [(0.253, -0.091, 1.417), (0.272, -0.087, 1.391),
                 (0.294, -0.074, 1.360)],
                0.0028, equipment, materials["red"],
                "restrained route seated into the compact deltoid leaf",
            ))

        objects.append(boot_upper(f"{PREFIX}BootUpper_{label}", side, suit, materials["boot"]))
        objects.append(boot_shaft(f"{PREFIX}BootShaft_{label}", side, suit, materials["boot"]))
        objects.append(boot_outsole(f"{PREFIX}BootOutsole_{label}", side, equipment, materials["rubber"]))
        objects.append(boot_dorsal_flow(
            f"{PREFIX}BootDorsalArticulation_{label}", side, equipment, materials["graphite"]))

    # Tight dark liner follows measured head bounds; ivory is only the open
    # crown shell, preventing the side and rear from becoming a white orb.
    objects.append(r1.closed_z_loft(
        f"{PREFIX}HelmetTightLiner",
        [(1.500, -0.030, 0.071, 0.078), (1.545, -0.038, 0.095, 0.103),
         (1.610, -0.044, 0.107, 0.116), (1.675, -0.044, 0.111, 0.120),
         (1.728, -0.036, 0.098, 0.104), (1.770, -0.018, 0.061, 0.064),
         (1.792, 0.000, 0.018, 0.019)],
        suit, materials["graphite"],
        "tight enclosed helmet liner fitted to measured V6-A head bounds",
        segments=72, exponent=2.18, subdivision=1, bevel=0.0012,
    ))
    objects.append(helmet_crown_cap(f"{PREFIX}HelmetOpenCrown", armor, materials["ivory"]))
    objects.append(r1.curved_visor(f"{PREFIX}HelmetCompoundVisor", armor, materials["visor"]))
    objects.append(r1.front_mask_patch(f"{PREFIX}HelmetChinSeal", equipment, materials["graphite"]))
    objects.append(base.add_curve(
        f"{PREFIX}HelmetCrownSeam",
        [(0.0, -0.108, 1.751), (0.0, -0.050, 1.784),
         (0.0, 0.020, 1.793), (0.0, 0.064, 1.763)],
        0.0024, equipment, materials["graphite"],
        "single crown seam emphasizing the flattened front-to-rear profile",
    ))
    objects.append(base.add_curve(
        f"{PREFIX}HelmetBrowRoute",
        [(-0.076, -0.173, 1.706), (-0.024, -0.186, 1.721),
         (0.030, -0.184, 1.719), (0.076, -0.168, 1.701)],
        0.0028, equipment, materials["red"],
        "restrained brow route joining visor and open crown shell",
    ))
    objects.append(base.add_elliptical_loft(
        f"{PREFIX}HelmetCowlTransition",
        [(1.405, -0.002, 0.151, 0.100), (1.430, -0.006, 0.141, 0.095),
         (1.457, -0.010, 0.125, 0.088), (1.485, -0.012, 0.107, 0.080),
         (1.512, -0.010, 0.090, 0.071)],
        suit, materials["fabric"],
        "continuous fitted cowl narrowing from clavicles into the helmet liner",
        segments=72, subdivision=2, solidify=0.006,
    ))
    objects.append(base.add_beveled_box(
        f"{PREFIX}ChestReadout", (0.151, -0.145, 1.382),
        (0.028, 0.006, 0.010), equipment, materials["cyan"],
        "flush status slit nested in the right upper clavicle shell", bevel=0.003,
    ))
    return objects


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 4:
        raise SystemExit("Expected -- <accepted-v6a.blend> <rev1.blend> <output.blend> <report.json>")
    v6a_path, rev1_path, output_path, report_path = (Path(value).resolve() for value in arguments)
    v6a_hash_before = sha256(v6a_path)
    rev1_hash_before = sha256(rev1_path)
    if v6a_hash_before != PINNED_V6A_SHA256:
        raise RuntimeError(f"Pinned V6-A hash mismatch: {v6a_hash_before}")
    if rev1_hash_before != PINNED_REV1_SHA256:
        raise RuntimeError(f"Pinned rev1 hash mismatch: {rev1_hash_before}")

    bpy.ops.wm.open_mainfile(filepath=str(v6a_path), load_ui=False, use_scripts=False)
    body = bpy.data.objects.get(SOURCE_BODY)
    if body is None:
        raise RuntimeError(f"Missing accepted V6-A body: {SOURCE_BODY}")
    root = bpy.data.collections.new(f"{PREFIX}VisualBenchmark")
    bpy.context.scene.collection.children.link(root)
    collections: dict[str, bpy.types.Collection] = {}
    for key, suffix in (
        ("suit", "ContinuousUndersuit"), ("armor", "AuthoredArmorSurfaces"),
        ("equipment", "IntegratedEquipment"), ("rifle", "OriginalAutoRifle"),
    ):
        collection = bpy.data.collections.new(f"{PREFIX}{suffix}")
        root.children.link(collection)
        collections[key] = collection
    base.relink(body, collections["suit"])
    materials = r1.make_materials()
    character_objects = build_character(body, collections, materials)
    rifle_objects = build_rifle(collections["rifle"], materials)
    bpy.context.view_layer.update()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)
    v6a_hash_after = sha256(v6a_path)
    rev1_hash_after = sha256(rev1_path)
    if v6a_hash_after != v6a_hash_before or rev1_hash_after != rev1_hash_before:
        raise RuntimeError("Pinned V6-A or preserved rev1 changed during rev2 authoring")
    output_hash = sha256(output_path)

    authored_collections = [collections[key] for key in ("suit", "armor", "equipment", "rifle")]
    report = {
        "schemaVersion": 1,
        "authoredUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "inputs": {
            "acceptedV6A": {"path": v6a_path.name, "sha256Before": v6a_hash_before,
                              "sha256After": v6a_hash_after, "unchanged": v6a_hash_before == v6a_hash_after},
            "preservedRev1IntegrityPin": {"path": rev1_path.name, "sha256Before": rev1_hash_before,
                                           "sha256After": rev1_hash_after, "unchanged": rev1_hash_before == rev1_hash_after,
                                           "sceneLoaded": False},
        },
        "output": {"path": output_path.name, "bytes": output_path.stat().st_size, "sha256": output_hash},
        "constructionMethod": {
            "undersuit": "Accepted V6-A body retained as a single continuous anatomical undersuit.",
            "chest": "Four small upper-clavicle and lower-rib layers with visible garment gaps and a narrow sternum inset.",
            "limbs": "Strongly almond-tapered wrap sweeps with narrow end spans and muscle/joint-aligned centerlines.",
            "helmet": "Tight measured dark liner, open ivory crown, compound visor, curved chin seal, and fitted cowl.",
            "boots": "Measured wider foot envelope, articulated upper and shaft overlap, full-foot outsole, recessed graphite dorsal flow.",
            "rifle": "Continuous three-dimensional primary path loft with curved seated shells, joined grip, magazine, and barrel volumes.",
        },
        "measuredDesignBounds": {
            "acceptedFootLeft": {"minimum": [0.134394, -0.132563, 0.0], "maximum": [0.270831, 0.103295, 0.185623]},
            "acceptedHead": {"minimum": [-0.118681, -0.157064, 1.500111], "maximum": [0.118752, 0.057004, 1.775]},
        },
        "inventory": base.inventory(authored_collections),
        "objectCounts": {"character": len(character_objects), "rifleVisible": len(rifle_objects)},
        "assertions": {
            "acceptedV6APreserved": v6a_hash_before == v6a_hash_after,
            "rev1Preserved": rev1_hash_before == rev1_hash_after,
            "startsFromV6AOnly": True,
            "noV6BVisibleObjectsInherited": not any(obj.name.startswith("KYX_V6B_") for obj in bpy.data.objects),
            "noRev1VisibleObjectsInherited": not any(obj.name.startswith("KYX_V6C_BENCH_R1_") for obj in bpy.data.objects),
            "noArmatures": len(bpy.data.armatures) == 0,
            "noActions": len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
        },
        "status": "V6C_VISUAL_BENCHMARK_REV2_REQUIRES_DIRECT_VISUAL_AUDIT",
        "nonClaims": [
            "This is a V6-C visual benchmark candidate, not V6-C or G6 acceptance.",
            "Contact witnesses establish future intent only; no literal posed contact is claimed.",
            "No final retopology, authored UVs, texture bake, rig, animation, LOD, GLB, runtime integration, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"], "outputSha256": output_hash,
        "characterObjects": len(character_objects), "rifleObjects": len(rifle_objects),
    }, sort_keys=True))


if __name__ == "__main__":
    main()

