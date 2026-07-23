"""Author a clean V6-C visual benchmark from the accepted V6-A anatomy.

This revision deliberately does not load or inherit any V6-B construction.
Every visible armor, helmet, boot, and rifle form is rebuilt as a new smooth
surface from the pinned accepted V6-A checkpoint.  The artifact is a visual
benchmark only and makes no rig, retopology, UV, export, runtime, or G6 claim.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys
from typing import Iterable

import bpy
from mathutils import Vector


PREFIX = "KYX_V6C_BENCH_R1_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV1"
SOURCE_BODY = "KYX_V6A_AnatomySculpt_Body"
PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"

BASE_PATH = Path(__file__).with_name("author_v6b_production_sculpt_rev11.py")
SPEC = importlib.util.spec_from_file_location("kyx_v6c_shared_blender_utilities", BASE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load Blender utility module: {BASE_PATH}")
base = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base)
base.PREFIX = PREFIX
base.CHECKPOINT = CHECKPOINT


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <accepted-v6a.blend> <output.blend> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def closed_z_loft(
    name: str,
    rings: list[tuple[float, float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    segments: int = 64,
    exponent: float = 2.35,
    subdivision: int = 1,
    bevel: float = 0.0015,
) -> bpy.types.Object:
    """Create a closed, softly manufactured superelliptical volume along Z."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, center_y, radius_x, radius_y in rings:
        for index in range(segments):
            angle = math.tau * index / segments
            cosine = math.cos(angle)
            sine = math.sin(angle)
            x = radius_x * math.copysign(abs(cosine) ** (2.0 / exponent), cosine)
            y = center_y + radius_y * math.copysign(abs(sine) ** (2.0 / exponent), sine)
            vertices.append((x, y, z))
    for ring in range(len(rings) - 1):
        current = ring * segments
        following = (ring + 1) * segments
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((current + index, current + nxt, following + nxt, following + index))
    faces.append(tuple(reversed(range(segments))))
    last = (len(rings) - 1) * segments
    faces.append(tuple(last + index for index in range(segments)))
    obj = base.new_mesh_object(name, vertices, faces, collection, material, role)
    base.add_modifiers(obj, subdivision=subdivision, bevel=bevel, bevel_segments=4)
    return obj


def fitted_patch(
    name: str,
    rows: list[tuple[float, float, float]],
    bvh,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    front: bool = True,
    offset: float = 0.008,
    columns: int = 25,
    thickness: float = 0.007,
) -> bpy.types.Object:
    """Project a deliberately tapered smooth quad patch to the accepted body."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, minimum_x, maximum_x in rows:
        for column in range(columns):
            t = column / (columns - 1)
            eased = t * t * (3.0 - 2.0 * t)
            x = minimum_x + (maximum_x - minimum_x) * eased
            point = base.surface_hit(bvh, x, z, front=front, offset=offset)
            vertices.append(tuple(point))
    for row in range(len(rows) - 1):
        current = row * columns
        following = (row + 1) * columns
        for column in range(columns - 1):
            faces.append((current + column, current + column + 1,
                          following + column + 1, following + column))
    obj = base.new_mesh_object(name, vertices, faces, collection, material, role)
    base.add_modifiers(obj, subdivision=2, solidify=thickness,
                       bevel=min(0.0026, thickness * 0.38), bevel_segments=4)
    obj["surface_fit_method"] = "authored tapered patch raycast to accepted V6-A body"
    return obj


def swept_guard(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radii: tuple[float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    preferred: Vector = Vector((0.0, -1.0, 0.0)),
    span_degrees: float = 184.0,
    axial_steps: int = 17,
    radial_steps: int = 23,
    oval: float = 0.84,
    thickness: float = 0.007,
    crown: float = 0.055,
) -> bpy.types.Object:
    """Create an almond-tapered wraparound shell around an anatomical axis."""
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
        envelope = math.sin(math.pi * t) ** 0.62
        center = start_v.lerp(end_v, eased)
        radius = radii[0] + (radii[1] - radii[0]) * eased
        radius *= 0.74 + 0.26 * envelope
        half_span = nominal_half_span * (0.48 + 0.52 * envelope)
        center += front * (radius * crown * envelope)
        for radial in range(radial_steps):
            u = radial / (radial_steps - 1)
            angle = -half_span + 2.0 * half_span * u
            edge_soften = math.sin(math.pi * u) ** 0.30
            position = (
                center
                + front * (math.cos(angle) * radius)
                + lateral * (math.sin(angle) * radius * oval * (0.93 + 0.07 * edge_soften))
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
                       bevel=min(0.0022, thickness * 0.34), bevel_segments=4)
    obj["construction"] = "continuous tapered axial sweep with wraparound muscle arc"
    return obj


def curved_visor(
    name: str,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    columns = 31
    rows = 11
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for row in range(rows):
        v = row / (rows - 1)
        for column in range(columns):
            u = -1.0 + 2.0 * column / (columns - 1)
            x = 0.094 * u
            top = 1.719 - 0.038 * abs(u) ** 1.72
            bottom = 1.579 + 0.030 * abs(u) ** 1.45
            z = bottom + (top - bottom) * v
            y = -0.168 - 0.018 * (1.0 - u * u) - 0.003 * (1.0 - v)
            vertices.append((x, y, z))
    for row in range(rows - 1):
        current = row * columns
        following = (row + 1) * columns
        for column in range(columns - 1):
            faces.append((current + column, current + column + 1,
                          following + column + 1, following + column))
    obj = base.new_mesh_object(
        name, vertices, faces, collection, material,
        "single compound-curved visor flowing directly into the helmet shell",
    )
    base.add_modifiers(obj, subdivision=2, solidify=0.006, bevel=0.0018, bevel_segments=4)
    return obj


def front_mask_patch(
    name: str,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    rows = [
        (1.515, -0.046, 0.046, -0.143),
        (1.540, -0.064, 0.064, -0.156),
        (1.570, -0.078, 0.078, -0.164),
        (1.598, -0.085, 0.085, -0.169),
    ]
    columns = 23
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, minimum_x, maximum_x, edge_y in rows:
        for column in range(columns):
            u = -1.0 + 2.0 * column / (columns - 1)
            x = minimum_x + (maximum_x - minimum_x) * (column / (columns - 1))
            y = edge_y - 0.010 * (1.0 - u * u)
            vertices.append((x, y, z + 0.003 * (1.0 - u * u)))
    for row in range(len(rows) - 1):
        current = row * columns
        following = (row + 1) * columns
        for column in range(columns - 1):
            faces.append((current + column, current + column + 1,
                          following + column + 1, following + column))
    obj = base.new_mesh_object(
        name, vertices, faces, collection, material,
        "curved chin-to-visor seal without separate box cheek rails",
    )
    base.add_modifiers(obj, subdivision=2, solidify=0.006, bevel=0.0018, bevel_segments=4)
    return obj


def transform_foot(
    center_x: float,
    angle: float,
    lateral: float,
    longitudinal: float,
    z: float,
) -> tuple[float, float, float]:
    cosine = math.cos(angle)
    sine = math.sin(angle)
    return (
        center_x + lateral * cosine - longitudinal * sine,
        -0.010 + lateral * sine + longitudinal * cosine,
        z,
    )


def boot_upper(
    name: str,
    side: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    center_x = 0.178 * side
    angle = 0.095 * side
    sections = [
        (0.112, 0.047, 0.025, 0.108),
        (0.078, 0.055, 0.026, 0.132),
        (0.028, 0.064, 0.027, 0.166),
        (-0.030, 0.071, 0.027, 0.148),
        (-0.092, 0.073, 0.026, 0.108),
        (-0.154, 0.062, 0.026, 0.080),
        (-0.202, 0.034, 0.029, 0.066),
    ]
    ring_steps = 32
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for longitudinal, half_width, bottom, top in sections:
        center_z = (bottom + top) * 0.5
        half_height = (top - bottom) * 0.5
        for ring in range(ring_steps):
            theta = math.tau * ring / ring_steps
            cosine = math.cos(theta)
            sine = math.sin(theta)
            lateral = half_width * math.copysign(abs(cosine) ** 0.69, cosine)
            vertical = half_height * math.copysign(abs(sine) ** 0.82, sine)
            vertices.append(transform_foot(center_x, angle, lateral, longitudinal, center_z + vertical))
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
        "anatomical heel-ball-instep-toe boot last with continuous upper volume",
    )
    base.add_modifiers(obj, subdivision=2, bevel=0.0022, bevel_segments=4)
    return obj


def boot_shaft(
    name: str,
    side: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    center_x = 0.178 * side
    angle = 0.095 * side
    rings = [
        (0.074, 0.040, 0.060, 0.055),
        (0.112, 0.035, 0.062, 0.054),
        (0.157, 0.027, 0.058, 0.050),
        (0.205, 0.019, 0.052, 0.045),
        (0.252, 0.015, 0.047, 0.041),
    ]
    segments = 40
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, longitudinal, radius_x, radius_y in rings:
        for index in range(segments):
            theta = math.tau * index / segments
            cosine = math.cos(theta)
            sine = math.sin(theta)
            lateral = radius_x * math.copysign(abs(cosine) ** 0.76, cosine)
            depth = radius_y * math.copysign(abs(sine) ** 0.88, sine)
            vertices.append(transform_foot(center_x, angle, lateral, longitudinal + depth, z))
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
        "forward-canted tapered ankle shaft blended into the anatomical boot upper",
    )
    base.add_modifiers(obj, subdivision=2, bevel=0.0022, bevel_segments=4)
    return obj


def boot_outsole(
    name: str,
    side: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    center_x = 0.178 * side
    angle = 0.095 * side
    outline = [
        (-0.038, 0.118), (0.038, 0.118), (0.055, 0.084), (0.067, 0.030),
        (0.075, -0.045), (0.073, -0.108), (0.061, -0.164), (0.035, -0.210),
        (0.0, -0.220), (-0.035, -0.210), (-0.061, -0.164), (-0.073, -0.108),
        (-0.075, -0.045), (-0.067, 0.030), (-0.055, 0.084),
    ]
    bottom_z, top_z = 0.008, 0.033
    vertices = [transform_foot(center_x, angle, x, y, bottom_z) for x, y in outline]
    vertices += [transform_foot(center_x, angle, x, y, top_z) for x, y in outline]
    count = len(outline)
    faces: list[tuple[int, ...]] = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    obj = base.new_mesh_object(
        name, vertices, faces, collection, material,
        "integrated contoured outsole following the anatomical boot footprint",
    )
    base.add_modifiers(obj, bevel=0.006, bevel_segments=5)
    return obj


def dorsal_boot_guard(
    name: str,
    side: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    center_x = 0.178 * side
    angle = 0.095 * side
    sections = [
        (0.050, 0.042, 0.171),
        (0.015, 0.050, 0.165),
        (-0.035, 0.054, 0.148),
        (-0.090, 0.050, 0.112),
        (-0.145, 0.037, 0.084),
    ]
    columns = 17
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for longitudinal, half_width, top in sections:
        for column in range(columns):
            u = -1.0 + 2.0 * column / (columns - 1)
            lateral = half_width * math.sin(u * math.pi * 0.5)
            z = top + 0.010 * (1.0 - u * u)
            vertices.append(transform_foot(center_x, angle, lateral, longitudinal, z))
    for section in range(len(sections) - 1):
        current = section * columns
        following = (section + 1) * columns
        for column in range(columns - 1):
            faces.append((current + column, current + column + 1,
                          following + column + 1, following + column))
    obj = base.new_mesh_object(
        name, vertices, faces, collection, material,
        "long dorsal instep guard flowing from ankle toward the toe instead of a toe badge",
    )
    base.add_modifiers(obj, subdivision=2, solidify=0.006, bevel=0.002, bevel_segments=4)
    return obj


def build_rifle(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    """Build an original rifle around one continuous stock-receiver-grip body."""
    objects: list[bpy.types.Object] = []
    chassis_profile = [
        (-0.650, 1.170), (-0.650, 1.292), (-0.560, 1.343),
        (-0.405, 1.318), (-0.295, 1.360), (0.075, 1.350),
        (0.155, 1.312), (0.500, 1.290), (0.575, 1.238),
        (0.548, 1.150), (0.120, 1.118), (0.055, 1.078),
        (-0.018, 1.075), (-0.064, 0.965), (-0.112, 0.892),
        (-0.176, 0.905), (-0.220, 1.070), (-0.350, 1.118),
        (-0.492, 1.145),
    ]
    chassis = base.add_receiver_profile(
        f"{PREFIX}AutoRifleContinuousChassis", chassis_profile, 0.118,
        collection, materials["graphite"],
        "single continuous forged stock receiver handguard root and pistol-grip volume",
        bevel=0.014,
    )
    chassis["continuous_primary_volume"] = True
    objects.append(chassis)

    shroud_profile = [
        (-0.302, 1.267), (-0.222, 1.322), (0.072, 1.314),
        (0.162, 1.282), (0.492, 1.262), (0.526, 1.224),
        (0.470, 1.181), (0.150, 1.174), (0.068, 1.211),
        (-0.230, 1.218),
    ]
    shroud = base.add_receiver_profile(
        f"{PREFIX}AutoRifleFlowingShroud", shroud_profile, 0.126,
        collection, materials["ivory"],
        "continuous curved ceramic receiver-to-handguard shroud seated into the chassis",
        bevel=0.010,
    )
    objects.append(shroud)

    magazine = base.add_receiver_profile(
        f"{PREFIX}AutoRifleMagazine",
        [(-0.020, 1.090), (0.080, 1.094), (0.069, 0.920),
         (0.018, 0.878), (-0.034, 0.934)],
        0.068, collection, materials["rubber"],
        "curved removable magazine seated directly into the receiver well", bevel=0.009,
    )
    objects.append(magazine)

    objects.append(base.add_cylinder_between(
        f"{PREFIX}AutoRifleBarrel", (0.505, 0.0, 1.214), (0.842, 0.0, 1.214),
        0.013, collection, materials["graphite"],
        "barrel rooted inside the continuous handguard volume", vertices=48,
    ))
    objects.append(base.add_cylinder_between(
        f"{PREFIX}AutoRifleMuzzle", (0.820, 0.0, 1.214), (0.930, 0.0, 1.214),
        0.022, collection, materials["graphite"],
        "tapered muzzle assembly overlapping the barrel", vertices=48,
    ))
    objects.append(base.add_curve(
        f"{PREFIX}AutoRifleTriggerGuard",
        [(-0.224, -0.045, 1.096), (-0.166, -0.060, 1.147),
         (-0.080, -0.050, 1.092)],
        0.006, collection, materials["graphite"],
        "trigger guard joined at both ends to the continuous chassis",
    ))
    objects.append(base.add_beveled_box(
        f"{PREFIX}AutoRifleStatus", (0.105, -0.066, 1.274),
        (0.070, 0.008, 0.011), collection, materials["cyan"],
        "flush cyan status slit seated into the flowing shroud", bevel=0.004,
    ))
    objects.append(base.add_curve(
        f"{PREFIX}AutoRifleIdentityRoute",
        [(-0.255, -0.066, 1.278), (-0.115, -0.067, 1.291),
         (0.012, -0.067, 1.286)],
        0.0035, collection, materials["red"],
        "restrained identity route following the receiver surface",
    ))

    contact_points = {
        "primary_grip": (-0.142, -0.076, 1.010),
        "support_grip": (0.330, -0.078, 1.155),
        "shoulder": (-0.646, 0.0, 1.232),
    }
    for label, location in contact_points.items():
        witness = bpy.data.objects.new(f"{PREFIX}CONTACT_{label}", None)
        witness.location = location
        witness.empty_display_type = "SPHERE"
        witness.empty_display_size = 0.014
        witness.hide_render = True
        collection.objects.link(witness)
        base.tag(witness, "future two-hand/shoulder contact witness; not contact proof")
    return objects


def make_materials() -> dict[str, bpy.types.Material]:
    return {
        "fabric": base.make_fabric_material(f"{PREFIX}ContinuousWovenUndersuit"),
        "flex": base.make_principled_material(
            f"{PREFIX}ArticulationKnit", (0.024, 0.038, 0.048, 1.0), roughness=0.79),
        "glove": base.make_principled_material(
            f"{PREFIX}GripComposite", (0.008, 0.012, 0.016, 1.0), roughness=0.62),
        "boot": base.make_principled_material(
            f"{PREFIX}BootUpper", (0.020, 0.032, 0.041, 1.0), roughness=0.50),
        "rubber": base.make_principled_material(
            f"{PREFIX}OutsoleRubber", (0.005, 0.008, 0.010, 1.0), roughness=0.76),
        "ivory": base.make_principled_material(
            f"{PREFIX}WarmIvoryCeramic", (0.72, 0.66, 0.53, 1.0),
            roughness=0.34, coat=0.11),
        "graphite": base.make_principled_material(
            f"{PREFIX}GraphiteStructure", (0.022, 0.039, 0.052, 1.0),
            metallic=0.48, roughness=0.30),
        "red": base.make_principled_material(
            f"{PREFIX}SignalCoral", (0.56, 0.025, 0.014, 1.0),
            metallic=0.10, roughness=0.36, coat=0.08),
        "cyan": base.make_emissive_material(
            f"{PREFIX}CyanReadout", (0.010, 0.52, 0.70, 1.0), 1.8),
        "visor": base.make_visor_material(f"{PREFIX}DeepVisor"),
    }


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
        if (abs(center.x) > 0.350 and center.z < 1.18) or center.z < 0.15:
            polygon.material_index = 2
        elif (0.50 < center.z < 0.64) or (0.99 < center.z < 1.17 and abs(center.x) > 0.25):
            polygon.material_index = 1
        else:
            polygon.material_index = 0
    base.tag(body, "accepted V6-A anatomy retained as one continuous fitted technical undersuit")
    body["accepted_v6a_sha256"] = PINNED_V6A_SHA256
    objects.append(body)
    for obj in bpy.context.scene.objects:
        if obj.name.startswith("KYX_V6A_AnatomySculpt_Eye"):
            obj.hide_render = True
            obj.hide_viewport = True

    bvh = base.make_body_bvh(body)

    # Independent left/right clavicle and rib-flow shells leave sternum and
    # abdomen visible, avoiding the rejected white bib silhouette.
    left_rows = [
        (1.244, 0.040, 0.112), (1.275, 0.030, 0.146),
        (1.320, 0.025, 0.182), (1.366, 0.036, 0.205),
        (1.408, 0.060, 0.192), (1.438, 0.092, 0.148),
    ]
    right_rows = [(z, -maximum, -minimum) for z, minimum, maximum in left_rows]
    objects.append(fitted_patch(
        f"{PREFIX}ClavicleRibShell_L", left_rows, bvh, armor, materials["ivory"],
        "small layered left clavicle plate flowing down the rib arc", offset=0.010,
    ))
    objects.append(fitted_patch(
        f"{PREFIX}ClavicleRibShell_R", right_rows, bvh, armor, materials["ivory"],
        "small layered right clavicle plate flowing down the rib arc", offset=0.010,
    ))
    objects.append(fitted_patch(
        f"{PREFIX}SternumKeel",
        [(1.218, -0.026, 0.026), (1.268, -0.032, 0.032),
         (1.330, -0.036, 0.036), (1.390, -0.030, 0.030),
         (1.426, -0.020, 0.020)],
        bvh, armor, materials["graphite"],
        "narrow recessed sternum keel separating the layered chest shells",
        offset=0.012, columns=17, thickness=0.006,
    ))
    objects.append(fitted_patch(
        f"{PREFIX}BackScapularShell_L",
        [(1.245, 0.032, 0.105), (1.300, 0.040, 0.150),
         (1.360, 0.058, 0.188), (1.414, 0.088, 0.158)],
        bvh, armor, materials["ivory"],
        "tapered left scapular shell leaving the spine and lower back free",
        front=False, offset=0.009, thickness=0.007,
    ))
    objects.append(fitted_patch(
        f"{PREFIX}BackScapularShell_R",
        [(1.245, -0.105, -0.032), (1.300, -0.150, -0.040),
         (1.360, -0.188, -0.058), (1.414, -0.158, -0.088)],
        bvh, armor, materials["ivory"],
        "tapered right scapular shell leaving the spine and lower back free",
        front=False, offset=0.009, thickness=0.007,
    ))

    # Curves are seated directly against projected garment points and establish
    # tailoring without replacing anatomy with an external torso shell.
    seam_points = []
    for x, z in [(-0.112, 1.185), (-0.075, 1.120), (0.0, 1.075),
                 (0.075, 1.120), (0.112, 1.185)]:
        seam_points.append(tuple(base.surface_hit(bvh, x, z, front=True, offset=0.003)))
    objects.append(base.add_curve(
        f"{PREFIX}AbdominalVSeam", seam_points, 0.0022, equipment,
        materials["graphite"], "integrated tailoring seam following the abdominal surface",
    ))

    for side, label in ((1.0, "L"), (-1.0, "R")):
        objects.append(swept_guard(
            f"{PREFIX}DeltoidShell_{label}",
            (0.246 * side, -0.010, 1.430), (0.310 * side, -0.008, 1.338),
            (0.095, 0.073), armor, materials["ivory"],
            "almond-tapered deltoid shell integrated to the clavicle and upper-arm arc",
            preferred=Vector((0.20 * side, -1.0, 0.05)), span_degrees=210.0,
            axial_steps=18, radial_steps=25, oval=0.82, thickness=0.008,
        ))
        objects.append(swept_guard(
            f"{PREFIX}ForearmWrap_{label}",
            (0.336 * side, -0.005, 1.126), (0.394 * side, -0.008, 0.974),
            (0.054, 0.040), armor, materials["ivory"],
            "continuous tapered forearm wrap following the radius-ulna axis",
            preferred=Vector((0.06 * side, -1.0, 0.0)), span_degrees=202.0,
            axial_steps=20, radial_steps=25, oval=0.80, thickness=0.007,
        ))
        objects.append(swept_guard(
            f"{PREFIX}ThighFlowGuard_{label}",
            (0.171 * side, -0.012, 0.894), (0.158 * side, -0.015, 0.708),
            (0.080, 0.065), armor, materials["ivory"],
            "lateral-front tapered thigh guard wrapping the quadriceps arc",
            preferred=Vector((0.72 * side, -1.0, 0.0)), span_degrees=154.0,
            axial_steps=21, radial_steps=23, oval=0.86, thickness=0.007,
        ))
        objects.append(swept_guard(
            f"{PREFIX}PatellaShell_{label}",
            (0.145 * side, -0.010, 0.626), (0.149 * side, -0.012, 0.526),
            (0.069, 0.058), armor, materials["ivory"],
            "rounded patella shell with tapered superior and inferior joint clearance",
            preferred=Vector((0.0, -1.0, 0.0)), span_degrees=188.0,
            axial_steps=17, radial_steps=23, oval=0.84, thickness=0.008, crown=0.09,
        ))
        objects.append(swept_guard(
            f"{PREFIX}TibiaWrap_{label}",
            (0.151 * side, -0.004, 0.486), (0.169 * side, -0.002, 0.266),
            (0.061, 0.046), armor, materials["ivory"],
            "long tapered tibia wrap following calf and ankle arcs",
            preferred=Vector((0.12 * side, -1.0, 0.0)), span_degrees=176.0,
            axial_steps=23, radial_steps=25, oval=0.82, thickness=0.007,
        ))

        # One long identity route follows the left deltoid surface; it is not a
        # separate plate and does not alter the armor silhouette.
        if label == "L":
            objects.append(base.add_curve(
                f"{PREFIX}LeftShoulderIdentityRoute",
                [(0.247, -0.104, 1.423), (0.276, -0.098, 1.391),
                 (0.307, -0.083, 1.350)],
                0.0032, equipment, materials["red"],
                "restrained asymmetric route following the deltoid shell curvature",
            ))

        objects.append(boot_upper(
            f"{PREFIX}BootUpper_{label}", side, suit, materials["boot"]))
        objects.append(boot_shaft(
            f"{PREFIX}BootAnkleShaft_{label}", side, suit, materials["boot"]))
        objects.append(boot_outsole(
            f"{PREFIX}BootOutsole_{label}", side, equipment, materials["rubber"]))
        objects.append(dorsal_boot_guard(
            f"{PREFIX}BootDorsalFlow_{label}", side, armor, materials["ivory"]))

    # A single low-volume shell encloses the head.  The compound visor and chin
    # seal sit directly on that surface; there are no cheek boxes or dome cap.
    objects.append(closed_z_loft(
        f"{PREFIX}HelmetUnifiedShell",
        [(1.505, -0.006, 0.073, 0.080), (1.545, -0.012, 0.094, 0.105),
         (1.605, -0.018, 0.105, 0.128), (1.676, -0.016, 0.108, 0.137),
         (1.731, -0.010, 0.096, 0.118), (1.772, -0.002, 0.061, 0.074),
         (1.795, 0.004, 0.022, 0.026)],
        armor, materials["ivory"],
        "single enclosed low-volume helmet shell with integrated crown sides and rear",
        segments=72, exponent=2.22, subdivision=1, bevel=0.0016,
    ))
    objects.append(curved_visor(f"{PREFIX}HelmetCompoundVisor", armor, materials["visor"]))
    objects.append(front_mask_patch(f"{PREFIX}HelmetChinSeal", equipment, materials["graphite"]))
    objects.append(base.add_curve(
        f"{PREFIX}HelmetSagittalSeam",
        [(0.0, -0.116, 1.753), (0.0, -0.050, 1.790),
         (0.0, 0.030, 1.793), (0.0, 0.085, 1.760)],
        0.0026, equipment, materials["graphite"],
        "single restrained crown seam emphasizing the authored helmet profile",
    ))
    objects.append(base.add_curve(
        f"{PREFIX}HelmetBrowRoute",
        [(-0.078, -0.173, 1.710), (-0.025, -0.187, 1.726),
         (0.032, -0.185, 1.724), (0.078, -0.169, 1.704)],
        0.0030, equipment, materials["red"],
        "restrained brow route seated at the visor-shell transition",
    ))
    objects.append(base.add_elliptical_loft(
        f"{PREFIX}HelmetCowlTransition",
        [(1.405, -0.002, 0.155, 0.102), (1.432, -0.006, 0.144, 0.098),
         (1.461, -0.010, 0.127, 0.091), (1.490, -0.012, 0.108, 0.082),
         (1.518, -0.010, 0.091, 0.073)],
        suit, materials["fabric"],
        "continuous close cowl tapering from clavicles into the helmet neck seal",
        segments=72, subdivision=2, solidify=0.007,
    ))

    objects.append(base.add_beveled_box(
        f"{PREFIX}ChestReadout", (0.156, -0.145, 1.337),
        (0.031, 0.006, 0.011), equipment, materials["cyan"],
        "flush status slit nested into the right clavicle shell", bevel=0.004,
    ))
    return objects


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 3:
        raise SystemExit("Expected -- <accepted-v6a.blend> <output.blend> <report.json>")
    input_path, output_path, report_path = (Path(value).resolve() for value in arguments)
    if not input_path.is_file():
        raise FileNotFoundError(input_path)
    input_hash_before = sha256(input_path)
    if input_hash_before != PINNED_V6A_SHA256:
        raise RuntimeError(f"Pinned accepted V6-A hash mismatch: {input_hash_before}")

    bpy.ops.wm.open_mainfile(filepath=str(input_path), load_ui=False, use_scripts=False)
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

    materials = make_materials()
    character_objects = build_character(body, collections, materials)
    rifle_objects = build_rifle(collections["rifle"], materials)
    bpy.context.view_layer.update()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)
    input_hash_after = sha256(input_path)
    if input_hash_after != input_hash_before:
        raise RuntimeError("Pinned accepted V6-A input changed during V6-C authoring")
    output_hash = sha256(output_path)

    authored_collections = [collections[key] for key in ("suit", "armor", "equipment", "rifle")]
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
        "output": {
            "path": output_path.name,
            "bytes": output_path.stat().st_size,
            "sha256": output_hash,
        },
        "constructionMethod": {
            "undersuit": "Accepted V6-A body retained as the single continuous anatomical woven undersuit.",
            "chest": "Independent tapered clavicle-rib surface patches plus a narrow sternum keel; no bib slab.",
            "limbs": "High-resolution almond-tapered axial sweeps wrapping muscle and joint arcs; no rectangular appliques.",
            "helmet": "One enclosed low-volume superelliptical shell with compound visor, curved chin seal, and continuous cowl.",
            "boots": "Anatomical heel-ball-instep-toe loft, forward-canted ankle shaft, contoured outsole, and long dorsal guard.",
            "rifle": "One continuous stock-receiver-handguard-root-grip profile with seated shroud, magazine, barrel, and contact witnesses.",
        },
        "inventory": base.inventory(authored_collections),
        "objectCounts": {
            "character": len(character_objects),
            "rifleVisible": len(rifle_objects),
        },
        "futureContactWitnesses": {
            "primaryGrip": [-0.142, -0.076, 1.010],
            "supportGrip": [0.330, -0.078, 1.155],
            "shoulder": [-0.646, 0.0, 1.232],
        },
        "assertions": {
            "acceptedV6APinned": input_hash_before == PINNED_V6A_SHA256,
            "acceptedV6AUnchanged": input_hash_before == input_hash_after,
            "outputDiffersFromInput": output_hash != input_hash_before,
            "startsFromV6AOnly": True,
            "noV6BVisibleObjectsInherited": not any(obj.name.startswith("KYX_V6B_") for obj in bpy.data.objects),
            "continuousAnatomicalUndersuit": body in character_objects,
            "noArmatures": len(bpy.data.armatures) == 0,
            "noActions": len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
        },
        "status": "V6C_VISUAL_BENCHMARK_REV1_REQUIRES_DIRECT_VISUAL_AUDIT",
        "nonClaims": [
            "This is a V6-C visual benchmark candidate, not V6-C or G6 acceptance.",
            "Contact witnesses establish future intent only; no literal posed two-hand contact is claimed.",
            "No final retopology, authored UVs, texture bake, rig, animation, LOD, GLB, runtime integration, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"],
        "outputSha256": output_hash,
        "characterObjects": len(character_objects),
        "rifleObjects": len(rifle_objects),
    }, sort_keys=True))


if __name__ == "__main__":
    main()

