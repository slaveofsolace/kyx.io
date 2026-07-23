"""Author KYX Vanguard V6-C visual benchmark rev10 from accepted V6-A.

Rev10 is a distinct production-form strike. It opens the accepted V6-A file,
uses the pinned concept only as construction-language reference, and verifies
that preserved rev9 is unchanged and never used as a geometry source.
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


PREFIX = "KYX_V6C_BENCH_R10_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV10"
SOURCE_BODY = "KYX_V6A_AnatomySculpt_Body"
PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
PINNED_REV9_SHA256 = "4ab1bf6db12d99194ddc896077f631d5216053b343aa42c81ab2ec39c7877a19"
PINNED_REFERENCE_SHA256 = "9c188fa32daaeec2d284727a5d9e600f94b8b57fee6f0568c7ebac9d462abdd2"

UTILITY_PATH = Path(__file__).with_name("author_v6b_production_sculpt_rev11.py")
SPEC = importlib.util.spec_from_file_location("kyx_rev10_surface_utilities", UTILITY_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load surface utilities: {UTILITY_PATH}")
u = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(u)
u.PREFIX = PREFIX
u.CHECKPOINT = CHECKPOINT


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <accepted-v6a.blend> <preserved-rev9.blend> "
            "<production-target.png> <rev10.blend> <report.json>"
        )
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def mesh_geometry_sha256(obj: bpy.types.Object) -> str:
    digest = hashlib.sha256()
    for vertex in obj.data.vertices:
        digest.update((f"v:{vertex.co.x:.9f},{vertex.co.y:.9f},{vertex.co.z:.9f};").encode())
    for polygon in obj.data.polygons:
        digest.update(("p:" + ",".join(str(index) for index in polygon.vertices) + ";").encode())
    return digest.hexdigest()


def tag(obj: bpy.types.Object, role: str) -> bpy.types.Object:
    obj["kyx_checkpoint"] = CHECKPOINT
    obj["kyx_role"] = role
    obj["kyx_nonclaim"] = (
        "V6-C rev10 visual benchmark only; not retopologized, rigged, exported, "
        "runtime, held-contact, V6-C accepted, or G6 accepted"
    )
    return obj


u.tag = tag


def make_fabric(name: str, base_color: tuple[float, float, float, float], scale: float) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Roughness"].default_value = 0.94
    specular = bsdf.inputs.get("Specular IOR Level") or bsdf.inputs.get("Specular")
    if specular is not None:
        specular.default_value = 0.10
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 2.2
    noise.inputs["Roughness"].default_value = 0.64
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = scale * 1.35
    wave.inputs["Distortion"].default_value = 2.0
    mix = nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 0.40
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.24
    bump.inputs["Distance"].default_value = 0.00055
    links.new(noise.outputs["Fac"], mix.inputs[1])
    links.new(wave.outputs["Color"], mix.inputs[2])
    links.new(mix.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def make_materials() -> dict[str, bpy.types.Material]:
    materials = {
        "fabric": make_fabric(f"{PREFIX}GraphiteWovenSuit", (0.00045, 0.00070, 0.00095, 1.0), 285.0),
        "flex": make_fabric(f"{PREFIX}BlackJointKnit", (0.00016, 0.00023, 0.00032, 1.0), 330.0),
        "rubber": u.make_principled_material(
            f"{PREFIX}TreadRubber", (0.00042, 0.00052, 0.00066, 1.0), roughness=0.94,
        ),
        "gunmetal": u.make_principled_material(
            f"{PREFIX}GraphiteGunmetal", (0.0022, 0.0030, 0.0038, 1.0),
            metallic=0.28, roughness=0.64, coat=0.006,
        ),
        "steel": u.make_principled_material(
            f"{PREFIX}BlueBlackTitanium", (0.0060, 0.0080, 0.0100, 1.0),
            metallic=0.34, roughness=0.58, coat=0.008,
        ),
        "ceramic": u.make_principled_material(
            f"{PREFIX}WarmTitaniumCeramic", (0.0170, 0.0130, 0.0080, 1.0),
            metallic=0.02, roughness=0.66, coat=0.008,
        ),
        "ceramic_dark": u.make_principled_material(
            f"{PREFIX}SmokedCeramic", (0.0040, 0.0048, 0.0052, 1.0),
            metallic=0.02, roughness=0.70, coat=0.004,
        ),
        "bronze": u.make_principled_material(
            f"{PREFIX}MutedBronzeHardware", (0.0100, 0.0060, 0.0026, 1.0),
            metallic=0.36, roughness=0.62,
        ),
        "seam": u.make_principled_material(
            f"{PREFIX}RecessedSeam", (0.00018, 0.00028, 0.00034, 1.0), roughness=0.82,
        ),
        "visor": u.make_principled_material(
            f"{PREFIX}RecessedPetrolVisor", (0.00070, 0.00500, 0.00850, 1.0),
            metallic=0.00, roughness=0.46, coat=0.06,
        ),
        "cyan": u.make_emissive_material(
            f"{PREFIX}RestrainedCyan", (0.0004, 0.026, 0.042, 1.0), 0.34,
        ),
        "coral": u.make_emissive_material(
            f"{PREFIX}SafetyCoral", (0.030, 0.0015, 0.0005, 1.0), 0.22,
        ),
    }
    for key in ("rubber", "gunmetal", "steel", "ceramic", "ceramic_dark", "bronze", "seam", "visor"):
        bsdf = materials[key].node_tree.nodes.get("Principled BSDF")
        specular = bsdf.inputs.get("Specular IOR Level") or bsdf.inputs.get("Specular")
        if specular is not None:
            specular.default_value = 0.08 if key != "visor" else 0.045
    return materials


def body_panel(
    name: str,
    rows: list[tuple[float, float, float]],
    bvh,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    front: bool,
    offset: float = 0.008,
    columns: int = 16,
    flatten: float = 0.12,
    thickness: float = 0.007,
    subdivision: int = 1,
    bevel: float = 0.0022,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, minimum_x, maximum_x in rows:
        row_points: list[Vector] = []
        for column in range(columns):
            t = column / (columns - 1)
            eased = t * t * (3.0 - 2.0 * t)
            x = minimum_x + (maximum_x - minimum_x) * eased
            hit = None
            for z_jitter in (0.0, 0.003, -0.003, 0.006, -0.006, 0.012, -0.012):
                for shrink in (1.0, 0.97, 0.94, 0.90, 0.86, 0.82, 0.76, 0.68, 0.60, 0.52, 0.44, 0.36, 0.28):
                    try:
                        hit = u.surface_hit(bvh, x * shrink, z + z_jitter, front=front, offset=offset)
                        hit.z = z
                        break
                    except RuntimeError:
                        continue
                if hit is not None:
                    break
            if hit is None:
                raise RuntimeError(f"No robust body hit at x={x:.4f}, z={z:.4f}, front={front}")
            row_points.append(hit)
        row_plane = min(point.y for point in row_points) if front else max(point.y for point in row_points)
        for point in row_points:
            point.y = point.y * (1.0 - flatten) + row_plane * flatten
            vertices.append(tuple(point))
    for row_index in range(len(rows) - 1):
        current = row_index * columns
        following = (row_index + 1) * columns
        for column in range(columns - 1):
            faces.append((current + column, current + column + 1, following + column + 1, following + column))
    outer_faces = list(faces)
    vertex_count = len(vertices)
    inward = thickness if front else -thickness
    inner_vertices = [(x, y + inward, z) for x, y, z in vertices]
    inner_faces = [tuple(vertex_count + index for index in reversed(face)) for face in outer_faces]
    edge_counts: dict[tuple[int, int], tuple[int, int, int]] = {}
    for face in outer_faces:
        for edge_index, a in enumerate(face):
            b = face[(edge_index + 1) % len(face)]
            key = tuple(sorted((a, b)))
            count, _old_a, _old_b = edge_counts.get(key, (0, a, b))
            edge_counts[key] = (count + 1, a, b)
    side_faces = [
        (a, b, vertex_count + b, vertex_count + a)
        for count, a, b in edge_counts.values() if count == 1
    ]
    shell_faces = outer_faces + inner_faces + side_faces
    obj = u.new_mesh_object(
        f"{PREFIX}{name}", vertices + inner_vertices, shell_faces,
        collection, material, role,
    )
    u.add_modifiers(obj, subdivision=subdivision, bevel=bevel, bevel_segments=4)
    rim_material = bpy.data.materials.get(f"{PREFIX}RecessedSeam")
    if rim_material is not None:
        obj.data.materials.append(rim_material)
        side_start = len(outer_faces) + len(inner_faces)
        for polygon in obj.data.polygons[side_start:]:
            polygon.material_index = 1
    obj["surface_fit_method"] = "new rev10 authored grid projected directly to accepted V6-A BVH"
    return tag(obj, role)


def mirrored_rows(rows: list[tuple[float, float, float]], side: float) -> list[tuple[float, float, float]]:
    return [(z, min(a * side, b * side), max(a * side, b * side)) for z, a, b in rows]


def partial_shell(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radii: tuple[float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    span: float,
    center_direction: Vector,
    thickness: float = 0.006,
    axial_steps: int = 12,
    radial_steps: int = 22,
) -> bpy.types.Object:
    obj = u.add_partial_limb_shell(
        f"{PREFIX}{name}", start, end, radii, collection, material, role,
        span_degrees=span, axial_steps=axial_steps, radial_steps=radial_steps,
        center_direction=center_direction, thickness=thickness,
    )
    return tag(obj, role)


def add_box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.003,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    return tag(u.add_beveled_box(
        f"{PREFIX}{name}", location, dimensions, collection, material, role,
        bevel=bevel, rotation=rotation,
    ), role)


def add_strut(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    width: float,
    depth: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
) -> bpy.types.Object:
    return tag(u.add_strut_between(
        f"{PREFIX}{name}", start, end, width, depth, collection, material, role,
    ), role)


def add_curve(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
) -> bpy.types.Object:
    return tag(u.add_curve(f"{PREFIX}{name}", points, radius, collection, material, role), role)


def add_disc_x(
    name: str,
    center: tuple[float, float, float],
    radius: float,
    depth: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    vertices: int = 16,
) -> bpy.types.Object:
    x, y, z = center
    return tag(u.add_cylinder_between(
        f"{PREFIX}{name}", (x - depth * 0.5, y, z), (x + depth * 0.5, y, z),
        radius, collection, material, role, vertices=vertices,
    ), role)


def add_bolt_y(
    name: str,
    center: tuple[float, float, float],
    radius: float,
    depth: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
) -> bpy.types.Object:
    x, y, z = center
    return tag(u.add_cylinder_between(
        f"{PREFIX}{name}", (x, y - depth * 0.5, z), (x, y + depth * 0.5, z),
        radius, collection, material, role, vertices=12,
    ), role)


def profile_volume(
    name: str,
    xz: list[tuple[float, float]],
    depth: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.005,
    y_center: float = 0.0,
) -> bpy.types.Object:
    obj = u.add_receiver_profile(
        f"{PREFIX}{name}", xz, depth, collection, material, role, bevel=bevel,
    )
    obj.location.y = y_center
    return tag(obj, role)


def axis_volume(
    name: str,
    sections: list[tuple[float, float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    exponent: float = 4.4,
    ring_steps: int = 16,
    bevel: float = 0.004,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for x, center_z, half_y, half_z in sections:
        for index in range(ring_steps):
            angle = math.tau * index / ring_steps
            cosine, sine = math.cos(angle), math.sin(angle)
            y = half_y * math.copysign(abs(cosine) ** (2.0 / exponent), cosine)
            z = center_z + half_z * math.copysign(abs(sine) ** (2.0 / exponent), sine)
            vertices.append((x, y, z))
    for section_index in range(len(sections) - 1):
        current = section_index * ring_steps
        following = (section_index + 1) * ring_steps
        for index in range(ring_steps):
            nxt = (index + 1) % ring_steps
            faces.append((current + index, current + nxt, following + nxt, following + index))
    faces.append(tuple(reversed(range(ring_steps))))
    last = (len(sections) - 1) * ring_steps
    faces.append(tuple(last + index for index in range(ring_steps)))
    obj = u.new_mesh_object(f"{PREFIX}{name}", vertices, faces, collection, material, role)
    u.add_modifiers(obj, bevel=bevel, bevel_segments=4)
    return tag(obj, role)


def boolean_box_cut(
    target: bpy.types.Object,
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> None:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    cutter = bpy.context.object
    cutter.name = f"{PREFIX}CUTTER_{name}"
    cutter.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = target.modifiers.new(f"BooleanCut_{name}", "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter
    bpy.context.view_layer.objects.active = target
    target.select_set(True)
    cutter.select_set(False)
    while target.modifiers.find(modifier.name) > 0:
        bpy.ops.object.modifier_move_up(modifier=modifier.name)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def build_torso(
    body: bpy.types.Object,
    armor: bpy.types.Collection,
    detail: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    bvh = u.make_body_bvh(body)
    objects: list[bpy.types.Object] = []

    objects.append(body_panel(
        "FrontLoadCuirass",
        [(1.035, -0.120, 0.120), (1.105, -0.155, 0.155), (1.190, -0.185, 0.185),
         (1.285, -0.207, 0.207), (1.375, -0.220, 0.220), (1.440, -0.185, 0.185),
         (1.468, -0.120, 0.120)],
        bvh, armor, materials["gunmetal"],
        "continuous body-conforming dark front load cuirass beneath articulated plates",
        front=True, offset=0.009, columns=34, flatten=0.22, thickness=0.009, bevel=0.0028,
    ))
    objects.append(body_panel(
        "RearLoadCuirass",
        [(1.035, -0.118, 0.118), (1.110, -0.155, 0.155), (1.205, -0.187, 0.187),
         (1.300, -0.208, 0.208), (1.390, -0.218, 0.218), (1.448, -0.175, 0.175),
         (1.470, -0.115, 0.115)],
        bvh, armor, materials["gunmetal"],
        "continuous body-conforming rear load cuirass beneath scapular and spine plates",
        front=False, offset=0.008, columns=34, flatten=0.10, thickness=0.009, bevel=0.0028,
    ))

    for side, label in ((1.0, "R"), (-1.0, "L")):
        objects.append(body_panel(
            f"ClaviclePlate_{label}", mirrored_rows([
                (1.365, 0.018, 0.190), (1.410, 0.026, 0.185),
                (1.452, 0.018, 0.128), (1.468, 0.010, 0.075),
            ], side), bvh, armor, materials["ceramic"],
            "separate overlapping clavicle plate keyed into sternum and shoulder bridge",
            front=True, offset=0.018, columns=18, flatten=0.16, thickness=0.008, bevel=0.0022,
        ))
        objects.append(body_panel(
            f"PectoralPlate_{label}", mirrored_rows([
                (1.285, 0.030, 0.177), (1.325, 0.024, 0.203),
                (1.365, 0.022, 0.198), (1.395, 0.030, 0.170),
            ], side), bvh, armor, materials["ceramic_dark"],
            "faceted pectoral plate overlapping clavicle and upper rib cassette",
            front=True, offset=0.022, columns=17, flatten=0.18, thickness=0.007, bevel=0.0020,
        ))
        rib_specs = [
            ("Upper", [(1.225, 0.050, 0.188), (1.270, 0.042, 0.198), (1.305, 0.052, 0.177)], materials["steel"], 0.019),
            ("Middle", [(1.165, 0.045, 0.165), (1.205, 0.040, 0.185), (1.238, 0.052, 0.172)], materials["ceramic"], 0.021),
            ("Lower", [(1.105, 0.038, 0.138), (1.145, 0.036, 0.162), (1.175, 0.048, 0.151)], materials["steel"], 0.020),
        ]
        for segment, rows, material, offset in rib_specs:
            objects.append(body_panel(
                f"RibCassette{segment}_{label}", mirrored_rows(rows, side), bvh, armor, material,
                "overlapping articulated rib cassette with deliberate dark expansion gap",
                front=True, offset=offset, columns=15, flatten=0.12,
                thickness=0.0065, bevel=0.0018,
            ))

    sternum_segments = [
        ("SternumLockUpper", [(1.378, -0.030, 0.030), (1.425, -0.025, 0.025), (1.458, -0.014, 0.014)], materials["bronze"], 0.026),
        ("SternumLockMid", [(1.285, -0.042, 0.042), (1.332, -0.038, 0.038), (1.372, -0.028, 0.028)], materials["ceramic"], 0.027),
        ("AbdomenPlateUpper", [(1.205, -0.052, 0.052), (1.245, -0.048, 0.048), (1.278, -0.038, 0.038)], materials["steel"], 0.024),
        ("AbdomenPlateLower", [(1.120, -0.060, 0.060), (1.165, -0.056, 0.056), (1.197, -0.046, 0.046)], materials["ceramic_dark"], 0.022),
        ("AbdomenLock", [(1.055, -0.066, 0.066), (1.093, -0.062, 0.062), (1.115, -0.048, 0.048)], materials["steel"], 0.020),
    ]
    for name, rows, material, offset in sternum_segments:
        objects.append(body_panel(
            name, rows, bvh, armor, material,
            "overlapping segmented sternum and abdomen load plate with recessed interval",
            front=True, offset=offset, columns=13, flatten=0.28,
            thickness=0.006, bevel=0.0018,
        ))

    for side, label in ((1.0, "R"), (-1.0, "L")):
        objects.append(body_panel(
            f"RearScapularPlate_{label}", mirrored_rows([
                (1.315, 0.024, 0.190), (1.365, 0.020, 0.208),
                (1.420, 0.024, 0.185), (1.457, 0.018, 0.125),
            ], side), bvh, armor, materials["ceramic"],
            "overlapping rear scapular plate keyed into collar and spine",
            front=False, offset=0.018, columns=18, flatten=0.08,
            thickness=0.0075, bevel=0.0021,
        ))
        objects.append(body_panel(
            f"RearLatPlate_{label}", mirrored_rows([
                (1.145, 0.045, 0.158), (1.205, 0.040, 0.185),
                (1.265, 0.048, 0.190), (1.310, 0.055, 0.175),
            ], side), bvh, armor, materials["steel"],
            "rear lat armor cassette overlapping scapular shell and waist frame",
            front=False, offset=0.017, columns=16, flatten=0.06,
            thickness=0.0065, bevel=0.0019,
        ))
    for index, (lower, upper, width) in enumerate(((1.345, 1.438, 0.030), (1.250, 1.337, 0.038), (1.155, 1.242, 0.043), (1.070, 1.147, 0.048)), 1):
        objects.append(body_panel(
            f"RearSpineVertebra_{index}",
            [(lower, -width, width), ((lower + upper) * 0.5, -width * 1.12, width * 1.12), (upper, -width * 0.82, width * 0.82)],
            bvh, armor, materials["ceramic_dark"] if index % 2 else materials["bronze"],
            "segmented overlapping rear load-spine vertebra with functional expansion gaps",
            front=False, offset=0.023, columns=12, flatten=0.04, thickness=0.006, bevel=0.0018,
        ))

    waist_rows = [(0.988, -0.125, 0.125), (1.014, -0.158, 0.158), (1.045, -0.168, 0.168), (1.070, -0.145, 0.145)]
    for front, label in ((True, "Front"), (False, "Rear")):
        objects.append(body_panel(
            f"{label}WaistFrame", waist_rows, bvh, detail, materials["gunmetal"],
            "low-profile body-conforming waist frame continuous with cuirass and pelvis",
            front=front, offset=0.011, columns=28, flatten=0.08,
            thickness=0.0065, bevel=0.002,
        ))

    for side, label in ((1.0, "R"), (-1.0, "L")):
        objects.append(body_panel(
            f"FrontPelvicUnderframe_{label}", mirrored_rows([
                (0.842, 0.026, 0.090), (0.872, 0.022, 0.145),
                (0.915, 0.024, 0.168), (0.958, 0.028, 0.172), (0.995, 0.035, 0.145),
            ], side), bvh, armor, materials["gunmetal"],
            "split armored pelvic underframe bridging waist codpiece and hip shell without spanning the leg gap",
            front=True, offset=0.010, columns=16, flatten=0.10, thickness=0.008, bevel=0.0024,
        ))
        objects.append(body_panel(
            f"RearPelvicUnderframe_{label}", mirrored_rows([
                (0.845, 0.028, 0.098), (0.875, 0.024, 0.150),
                (0.920, 0.025, 0.170), (0.968, 0.030, 0.168), (0.998, 0.036, 0.140),
            ], side), bvh, armor, materials["gunmetal"],
            "split rear pelvic underframe continuous with waist and thigh suspension",
            front=False, offset=0.009, columns=16, flatten=0.05, thickness=0.008, bevel=0.0024,
        ))
    objects.append(profile_volume(
        "CodpieceArmor",
        [(-0.066, 0.968), (-0.086, 0.914), (-0.066, 0.852),
         (0.0, 0.817), (0.066, 0.852), (0.086, 0.914), (0.066, 0.968)],
        0.030, armor, materials["ceramic_dark"],
        "faceted central codpiece armor bridging the split pelvic underframe",
        bevel=0.004, y_center=-0.112,
    ))
    for side, label in ((1.0, "R"), (-1.0, "L")):
        objects.append(body_panel(
            f"PelvicWing_{label}", mirrored_rows([
                (0.835, 0.065, 0.145), (0.885, 0.055, 0.170),
                (0.940, 0.060, 0.170), (0.982, 0.070, 0.145),
            ], side), bvh, armor, materials["ceramic"],
            "overlapping pelvic wing transferring waist load into hip shell",
            front=True, offset=0.019, columns=14, flatten=0.10, thickness=0.0065, bevel=0.0019,
        ))
        objects.append(body_panel(
            f"RearPelvicWing_{label}", mirrored_rows([
                (0.835, 0.060, 0.145), (0.890, 0.052, 0.168),
                (0.947, 0.058, 0.165), (0.982, 0.072, 0.138),
            ], side), bvh, armor, materials["steel"],
            "rear overlapping pelvic wing with direct thigh suspension path",
            front=False, offset=0.017, columns=14, flatten=0.05, thickness=0.006, bevel=0.0018,
        ))

    for side, label in ((1.0, "R"), (-1.0, "L")):
        for index, z in enumerate((1.348, 1.245, 1.148), 1):
            objects.append(add_bolt_y(
                f"RibFastener{index}_{label}", (0.155 * side, -0.178, z),
                0.0042, 0.010, detail, materials["bronze"], "recessed rib cassette fastener",
            ))
    objects.append(add_box(
        "SternumTelemetry", (0.0, -0.186, 1.332), (0.010, 0.005, 0.041),
        detail, materials["cyan"], "single restrained KYX sternum telemetry slit", bevel=0.0015,
    ))
    objects.append(add_box(
        "WaistLatch", (0.0, -0.132, 1.027), (0.045, 0.012, 0.022),
        detail, materials["bronze"], "flush mechanical waist latch", bevel=0.0035,
    ))
    for side, label in ((1.0, "R"), (-1.0, "L")):
        for index, (x, z) in enumerate(((0.112, 1.266), (0.126, 1.242), (0.136, 1.218)), 1):
            objects.append(add_box(
                f"PectoralVent{index}_{label}", (x * side, -0.184, z),
                (0.016, 0.0045, 0.0055), detail, materials["seam"],
                "recessed pectoral thermal-management slot", bevel=0.0010,
            ))
    return objects


def build_limbs(
    armor: bpy.types.Collection,
    detail: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    for side, label in ((1.0, "R"), (-1.0, "L")):
        front_outer = Vector((0.34 * side, -0.94, 0.0))
        shoulder_direction = Vector((0.18 * side, -0.64, 0.75))
        thigh_direction = Vector((0.12 * side, -0.99, 0.0))
        objects.append(add_strut(
            f"ClavicleShoulderBridge_{label}", (0.168 * side, -0.055, 1.418),
            (0.266 * side, -0.040, 1.382), 0.038, 0.018, armor, materials["steel"],
            "structural clavicle-to-deltoid bridge preventing a floating shoulder read",
        ))
        objects.append(partial_shell(
            f"ShoulderCradle_{label}", (0.225 * side, 0.000, 1.445),
            (0.322 * side, -0.002, 1.330), (0.082, 0.060), armor, materials["gunmetal"],
            "deep deltoid cradle nested into clavicle bridge and upper-arm shell",
            span=232.0, center_direction=shoulder_direction, thickness=0.008, axial_steps=15,
        ))
        objects.append(partial_shell(
            f"ShoulderOuterShell_{label}", (0.238 * side, -0.010, 1.438),
            (0.310 * side, -0.012, 1.350), (0.078, 0.059), armor, materials["ceramic"],
            "smaller articulated shoulder shell nested inside the structural cradle",
            span=154.0, center_direction=shoulder_direction, thickness=0.006, axial_steps=13,
        ))
        objects.append(partial_shell(
            f"UpperArmUnderShell_{label}", (0.298 * side, -0.002, 1.350),
            (0.347 * side, -0.004, 1.168), (0.060, 0.049), armor, materials["steel"],
            "continuous upper-arm under-shell overlapping shoulder and elbow gasket",
            span=216.0, center_direction=front_outer, thickness=0.007, axial_steps=15,
        ))
        objects.append(partial_shell(
            f"UpperArmDorsalPlate_{label}", (0.305 * side, -0.012, 1.335),
            (0.342 * side, -0.014, 1.195), (0.061, 0.050), armor, materials["ceramic_dark"],
            "nested upper-arm dorsal plate with structural side rails visible",
            span=116.0, center_direction=front_outer, thickness=0.005, axial_steps=12,
        ))
        objects.append(partial_shell(
            f"ElbowHingeHousing_{label}", (0.337 * side, -0.003, 1.165),
            (0.365 * side, -0.004, 1.030), (0.055, 0.049), armor, materials["gunmetal"],
            "deep elbow hinge housing overlapping upper arm and forearm with rear flex channel",
            span=248.0, center_direction=front_outer, thickness=0.007, axial_steps=11,
        ))
        objects.append(partial_shell(
            f"ElbowPatella_{label}", (0.348 * side, -0.013, 1.135),
            (0.361 * side, -0.015, 1.065), (0.058, 0.052), armor, materials["ceramic"],
            "nested elbow strike cap seated inside hinge housing",
            span=126.0, center_direction=front_outer, thickness=0.005, axial_steps=9,
        ))
        objects.append(add_disc_x(
            f"ElbowPivotOuter_{label}", (0.397 * side, -0.002, 1.095), 0.026, 0.014,
            detail, materials["bronze"], "functional outer elbow pivot nested into hinge housing",
        ))
        objects.append(partial_shell(
            f"ForearmUnderShell_{label}", (0.355 * side, -0.004, 1.025),
            (0.397 * side, -0.006, 0.790), (0.053, 0.040), armor, materials["steel"],
            "continuous tapered forearm under-shell overlapping elbow and wrist interface",
            span=222.0, center_direction=front_outer, thickness=0.007, axial_steps=16,
        ))
        objects.append(partial_shell(
            f"ForearmDorsalPlate_{label}", (0.360 * side, -0.015, 1.005),
            (0.393 * side, -0.017, 0.825), (0.055, 0.043), armor, materials["ceramic"],
            "nested faceted forearm plate with protected side rails and wrist clearance",
            span=122.0, center_direction=front_outer, thickness=0.0055, axial_steps=14,
        ))
        objects.append(partial_shell(
            f"WristInterface_{label}", (0.391 * side, -0.004, 0.820),
            (0.405 * side, -0.006, 0.750), (0.043, 0.035), armor, materials["gunmetal"],
            "low-profile wrist interface overlapping gauntlet and continuous undersuit",
            span=205.0, center_direction=front_outer, thickness=0.0055, axial_steps=8,
        ))

        objects.append(add_strut(
            f"PelvicThighSuspension_{label}", (0.145 * side, -0.020, 0.966),
            (0.188 * side, -0.018, 0.885), 0.042, 0.020, armor, materials["steel"],
            "visible pelvic-to-thigh suspension bridge eliminating a floating thigh plate",
        ))
        objects.append(partial_shell(
            f"HipCup_{label}", (0.150 * side, -0.002, 0.982),
            (0.188 * side, -0.004, 0.875), (0.076, 0.068), armor, materials["gunmetal"],
            "deep hip cup nested into pelvic wing and thigh suspension",
            span=214.0, center_direction=thigh_direction, thickness=0.007, axial_steps=12,
        ))
        objects.append(partial_shell(
            f"ThighUnderShell_{label}", (0.178 * side, -0.004, 0.905),
            (0.158 * side, -0.006, 0.704), (0.078, 0.064), armor, materials["steel"],
            "broad quadriceps and lateral thigh under-shell continuous from hip to knee gasket",
            span=252.0, center_direction=thigh_direction, thickness=0.0075, axial_steps=16,
        ))
        objects.append(partial_shell(
            f"ThighOuterPlate_{label}", (0.182 * side, -0.015, 0.890),
            (0.160 * side, -0.018, 0.735), (0.081, 0.067), armor, materials["ceramic"],
            "nested thigh strike plate with visible dark load-bearing perimeter",
            span=158.0, center_direction=thigh_direction, thickness=0.0055, axial_steps=13,
        ))
        objects.append(partial_shell(
            f"KneeHingeHousing_{label}", (0.150 * side, -0.003, 0.688),
            (0.153 * side, -0.004, 0.525), (0.067, 0.058), armor, materials["gunmetal"],
            "deep knee hinge housing overlapping thigh and shin while retaining rear flex",
            span=258.0, center_direction=Vector((0.15 * side, -0.99, 0.0)),
            thickness=0.0075, axial_steps=12,
        ))
        objects.append(partial_shell(
            f"KneeStrikeCap_{label}", (0.150 * side, -0.017, 0.650),
            (0.153 * side, -0.019, 0.555), (0.070, 0.061), armor, materials["ceramic_dark"],
            "nested patella strike cap seated within functional hinge sidewalls",
            span=138.0, center_direction=Vector((0.0, -1.0, 0.0)), thickness=0.0055, axial_steps=9,
        ))
        objects.append(add_disc_x(
            f"KneePivotOuter_{label}", (0.205 * side, -0.003, 0.607), 0.031, 0.016,
            detail, materials["bronze"], "functional outer knee pivot integrated into hinge housing",
        ))
        knee_center = 0.153 * side
        knee_profile = [
            (knee_center - 0.041, 0.650), (knee_center - 0.047, 0.605),
            (knee_center - 0.028, 0.558), (knee_center, 0.542),
            (knee_center + 0.028, 0.558), (knee_center + 0.047, 0.605),
            (knee_center + 0.041, 0.650), (knee_center, 0.672),
        ]
        objects.append(profile_volume(
            f"KneeAnteriorShield_{label}", knee_profile, 0.022, armor, materials["ceramic_dark"],
            "faceted anterior knee shield mechanically seated between hinge sidewalls",
            bevel=0.004, y_center=-0.064,
        ))
        objects.append(partial_shell(
            f"ShinUnderShell_{label}", (0.151 * side, -0.004, 0.520),
            (0.171 * side, -0.004, 0.235), (0.062, 0.047), armor, materials["steel"],
            "broad tibia shell overlapping knee hinge and armored boot interface",
            span=222.0, center_direction=Vector((0.12 * side, -0.99, 0.0)),
            thickness=0.007, axial_steps=17,
        ))
        objects.append(partial_shell(
            f"ShinDorsalPlate_{label}", (0.153 * side, -0.016, 0.490),
            (0.169 * side, -0.018, 0.270), (0.065, 0.050), armor, materials["ceramic"],
            "nested shin strike plate with protected lateral rails and ankle overlap",
            span=126.0, center_direction=Vector((0.0, -1.0, 0.0)), thickness=0.0055, axial_steps=15,
        ))
        objects.append(partial_shell(
            f"AnkleArmorCollar_{label}", (0.168 * side, -0.002, 0.270),
            (0.181 * side, -0.003, 0.185), (0.055, 0.044), armor, materials["gunmetal"],
            "armored ankle collar overlapping shin shell and boot upper",
            span=226.0, center_direction=Vector((0.10 * side, -0.99, 0.0)), thickness=0.006, axial_steps=9,
        ))

        objects.append(add_strut(
            f"ForearmSideRail_{label}", (0.382 * side, -0.050, 0.998),
            (0.409 * side, -0.044, 0.820), 0.012, 0.010, detail, materials["gunmetal"],
            "recessed forearm structural side rail tying elbow to wrist",
        ))
        objects.append(add_strut(
            f"ShinSideRail_{label}", (0.180 * side, -0.050, 0.486),
            (0.194 * side, -0.045, 0.265), 0.013, 0.011, detail, materials["gunmetal"],
            "recessed shin structural side rail tying knee to ankle",
        ))
        for index, z in enumerate((1.285, 1.215), 1):
            objects.append(add_bolt_y(
                f"UpperArmFastener{index}_{label}", (0.330 * side, -0.058, z),
                0.0038, 0.009, detail, materials["bronze"], "recessed upper-arm shell fastener",
            ))
        for index, z in enumerate((0.850, 0.780), 1):
            objects.append(add_bolt_y(
                f"ThighFastener{index}_{label}", (0.178 * side, -0.074, z),
                0.0040, 0.009, detail, materials["bronze"], "recessed thigh shell fastener",
            ))
        for index, z in enumerate((0.850, 0.810, 0.770), 1):
            objects.append(add_box(
                f"ThighVent{index}_{label}", (0.160 * side, -0.080, z),
                (0.014, 0.005, 0.006), detail, materials["seam"],
                "recessed anterior thigh shell vent", bevel=0.0011,
            ))
        if label == "L":
            objects.append(add_curve(
                "LeftShoulderSafetyRoute",
                [(-0.244, -0.074, 1.435), (-0.285, -0.086, 1.416), (-0.316, -0.078, 1.380)],
                0.0019, detail, materials["coral"], "minimal asymmetric shoulder safety route",
            ))
        if label == "R":
            objects.append(add_box(
                "RightForearmTelemetry", (0.399, -0.060, 0.910), (0.008, 0.005, 0.035),
                detail, materials["cyan"], "single restrained forearm telemetry slit", bevel=0.0013,
            ))
    return objects


def helmet_shell(
    name: str,
    rows: list[tuple[float, float, float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    front: bool,
    columns: int = 10,
    thickness: float = 0.006,
    subdivision: int = 0,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, minimum_x, maximum_x, center_y, radius_y in rows:
        radius_x = max(abs(minimum_x), abs(maximum_x)) * 1.04
        for column in range(columns):
            t = column / (columns - 1)
            x = minimum_x + (maximum_x - minimum_x) * t
            factor = math.sqrt(max(0.0, 1.0 - (x / max(radius_x, 1.0e-5)) ** 2))
            y = center_y + (-radius_y if front else radius_y) * factor
            vertices.append((x, y, z))
    for row_index in range(len(rows) - 1):
        current = row_index * columns
        following = (row_index + 1) * columns
        for column in range(columns - 1):
            faces.append((current + column, current + column + 1, following + column + 1, following + column))
    obj = u.new_mesh_object(f"{PREFIX}{name}", vertices, faces, collection, material, role)
    u.add_modifiers(obj, subdivision=subdivision, solidify=thickness, bevel=0.0020, bevel_segments=3)
    return tag(obj, role)


def sealed_helmet_liner(collection: bpy.types.Collection, material: bpy.types.Material) -> bpy.types.Object:
    rings = [
        (1.505, -0.018, 0.078, 0.084), (1.555, -0.026, 0.100, 0.126),
        (1.625, -0.024, 0.110, 0.142), (1.695, -0.012, 0.108, 0.133),
        (1.755, 0.004, 0.085, 0.094), (1.790, 0.012, 0.045, 0.050),
    ]
    steps = 16
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, center_y, radius_x, radius_y in rings:
        for index in range(steps):
            angle = math.tau * index / steps
            cosine, sine = math.cos(angle), math.sin(angle)
            x = radius_x * math.copysign(abs(cosine) ** 0.54, cosine)
            y = center_y + radius_y * math.copysign(abs(sine) ** 0.54, sine)
            vertices.append((x, y, z))
    for ring_index in range(len(rings) - 1):
        current, following = ring_index * steps, (ring_index + 1) * steps
        for index in range(steps):
            nxt = (index + 1) % steps
            faces.append((current + index, current + nxt, following + nxt, following + index))
    faces.append(tuple(reversed(range(steps))))
    last = (len(rings) - 1) * steps
    faces.append(tuple(last + index for index in range(steps)))
    role = "compact faceted sealed helmet liner fully enclosing accepted V6-A head and face"
    obj = u.new_mesh_object(f"{PREFIX}HelmetSealedLiner", vertices, faces, collection, material, role)
    u.add_modifiers(obj, bevel=0.0025, bevel_segments=3)
    return tag(obj, role)


def recessed_visor(collection: bpy.types.Collection, material: bpy.types.Material) -> bpy.types.Object:
    columns, rows = 13, 6
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for row in range(rows):
        v = row / (rows - 1)
        for column in range(columns):
            nx = -1.0 + 2.0 * column / (columns - 1)
            x = 0.092 * nx
            top = 1.704 - 0.020 * abs(nx) ** 1.5
            bottom = 1.565 + 0.034 * abs(nx) ** 1.25 + 0.010 * (1.0 - abs(nx))
            z = bottom + (top - bottom) * v
            y = -0.172 + 0.040 * abs(nx) ** 1.55 + 0.004 * (v - 0.45) ** 2
            vertices.append((x, y, z))
    for row in range(rows - 1):
        current, following = row * columns, (row + 1) * columns
        for column in range(columns - 1):
            faces.append((current + column, current + column + 1, following + column + 1, following + column))
    role = "recessed non-planar faceted visor with forward center and compound temple wrap"
    obj = u.new_mesh_object(f"{PREFIX}RecessedCompoundVisor", vertices, faces, collection, material, role)
    u.add_modifiers(obj, solidify=0.005, bevel=0.0016, bevel_segments=3)
    return tag(obj, role)


def build_helmet(
    garment: bpy.types.Collection,
    armor: bpy.types.Collection,
    detail: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = [sealed_helmet_liner(garment, materials["gunmetal"])]
    objects.append(recessed_visor(armor, materials["visor"]))

    for side, label in ((1.0, "R"), (-1.0, "L")):
        objects.append(helmet_shell(
            f"CrownFacet_{label}",
            [(1.690, min(0.008 * side, 0.105 * side), max(0.008 * side, 0.105 * side), -0.008, 0.120),
             (1.735, min(0.010 * side, 0.092 * side), max(0.010 * side, 0.092 * side), 0.002, 0.094),
             (1.775, min(0.012 * side, 0.058 * side), max(0.012 * side, 0.058 * side), 0.010, 0.058)],
            armor, materials["ceramic"], "faceted crown plate overlapping brow temple and central keel",
            front=True, columns=7, thickness=0.0065,
        ))
        brow_profile = [
            (-0.010, 1.713), (-0.092, 1.704), (-0.108, 1.674),
            (-0.098, 1.642), (-0.070, 1.650), (-0.032, 1.684),
        ]
        brow_xz = [(x * side, z) for x, z in brow_profile]
        objects.append(profile_volume(
            f"BrowArmor_{label}", brow_xz, 0.030, armor, materials["steel"],
            "forward brow armor framing and recessing the compound visor", bevel=0.0035, y_center=-0.171,
        ))
        cheek_profile = [
            (0.105 * side, 1.660), (0.118 * side, 1.622), (0.105 * side, 1.570),
            (0.075 * side, 1.535), (0.045 * side, 1.558), (0.070 * side, 1.615),
        ]
        objects.append(profile_volume(
            f"CheekJawArmor_{label}", cheek_profile, 0.036, armor, materials["ceramic_dark"],
            "deep cheek and jaw plate projecting ahead of recessed visor and locking into chin bridge",
            bevel=0.004, y_center=-0.160,
        ))
        temple_profile = [
            (-0.102, 1.704), (-0.052, 1.732), (0.038, 1.706),
            (0.092, 1.646), (0.070, 1.570), (0.010, 1.535), (-0.080, 1.585),
        ]
        x_minimum, x_maximum = sorted((0.102 * side, 0.132 * side))
        temple = u.extrude_yz_profile(
            f"{PREFIX}TempleHousing_{label}", temple_profile, x_minimum, x_maximum,
            armor, materials["steel"],
            "layered temple housing joining brow cheek crown and occipital structures", bevel=0.004,
        )
        objects.append(tag(temple, temple.get("kyx_role", "layered temple housing")))
        objects.append(add_disc_x(
            f"TemplePivot_{label}", (0.134 * side, -0.004, 1.645), 0.034, 0.012,
            detail, materials["bronze"], "nested temple pivot with concentric mechanical seating",
        ))
        objects.append(add_disc_x(
            f"TemplePivotInset_{label}", (0.141 * side, -0.004, 1.645), 0.018, 0.008,
            detail, materials["seam"], "recessed temple pivot inner bearing",
        ))
        objects.append(helmet_shell(
            f"OccipitalFacet_{label}",
            [(1.560, min(0.012 * side, 0.088 * side), max(0.012 * side, 0.088 * side), -0.004, 0.126),
             (1.625, min(0.018 * side, 0.105 * side), max(0.018 * side, 0.105 * side), 0.000, 0.140),
             (1.690, min(0.015 * side, 0.096 * side), max(0.015 * side, 0.096 * side), 0.005, 0.131),
             (1.728, min(0.012 * side, 0.075 * side), max(0.012 * side, 0.075 * side), 0.009, 0.105)],
            armor, materials["ceramic_dark"], "faceted rear occipital plate nested into crown temple and neck seal",
            front=False, columns=7, thickness=0.0065,
        ))

    objects.append(helmet_shell(
        "CrownCentralKeel",
        [(1.686, -0.030, 0.030, -0.008, 0.124), (1.735, -0.028, 0.028, 0.002, 0.094),
         (1.782, -0.018, 0.018, 0.012, 0.054)],
        armor, materials["bronze"], "narrow central crown keel locking left and right crown facets",
        front=True, columns=7, thickness=0.006,
    ))
    objects.append(profile_volume(
        "ChinBridge", [(-0.070, 1.570), (-0.042, 1.535), (0.0, 1.520),
                       (0.042, 1.535), (0.070, 1.570), (0.048, 1.592), (-0.048, 1.592)],
        0.034, armor, materials["steel"],
        "faceted chin bridge closing cheek plates beneath recessed visor", bevel=0.0035, y_center=-0.165,
    ))
    objects.append(helmet_shell(
        "OccipitalSpine",
        [(1.548, -0.038, 0.038, -0.002, 0.122), (1.610, -0.044, 0.044, 0.001, 0.141),
         (1.675, -0.038, 0.038, 0.005, 0.132), (1.720, -0.025, 0.025, 0.009, 0.108)],
        armor, materials["ceramic"], "central occipital load spine with nested cooling channels",
        front=False, columns=8, thickness=0.0065,
    ))
    for index, x in enumerate((-0.027, -0.009, 0.009, 0.027), 1):
        objects.append(add_box(
            f"OccipitalVent_{index}", (x, 0.145, 1.635), (0.007, 0.005, 0.048),
            detail, materials["seam"], "recessed occipital cooling vent", bevel=0.0012,
        ))
    objects.append(add_curve(
        "VisorBrowSeal", [(-0.090, -0.177, 1.698), (-0.045, -0.188, 1.713),
                           (0.0, -0.192, 1.716), (0.045, -0.188, 1.713), (0.090, -0.177, 1.698)],
        0.0017, detail, materials["seam"], "recessed manufactured visor brow seal",
    ))
    objects.append(add_curve(
        "VisorLowerSeal", [(-0.082, -0.166, 1.575), (-0.040, -0.181, 1.551),
                            (0.0, -0.185, 1.540), (0.040, -0.181, 1.551), (0.082, -0.166, 1.575)],
        0.0016, detail, materials["seam"], "recessed manufactured visor-to-jaw seal",
    ))
    objects.append(add_curve(
        "VisorCenterFacet", [(0.0, -0.185, 1.548), (0.0, -0.190, 1.625), (0.0, -0.188, 1.708)],
        0.0012, detail, materials["steel"], "subtle center visor facet rib",
    ))
    for side, label in ((1.0, "R"), (-1.0, "L")):
        objects.append(add_bolt_y(
            f"CheekFastener_{label}", (0.087 * side, -0.181, 1.557), 0.0038, 0.008,
            detail, materials["bronze"], "recessed cheek-to-jaw fastener",
        ))
    objects.append(add_box(
        "HelmetTelemetry", (0.0, -0.125, 1.758), (0.021, 0.0045, 0.006),
        detail, materials["cyan"], "single restrained crown telemetry index", bevel=0.0012,
    ))
    cowl = u.add_elliptical_loft(
        f"{PREFIX}HelmetNeckSeal",
        [(1.422, -0.005, 0.132, 0.088), (1.452, -0.009, 0.120, 0.082),
         (1.482, -0.013, 0.105, 0.076), (1.510, -0.017, 0.088, 0.070)],
        garment, materials["flex"],
        "close woven neck seal mechanically overlapping cuirass collar and helmet chin",
        segments=64, subdivision=1, solidify=0.006,
    )
    objects.append(tag(cowl, cowl.get("kyx_role", "helmet neck seal")))
    return objects


def boot_transform(side: float, lateral: float, longitudinal: float, z: float) -> tuple[float, float, float]:
    center_x = 0.188 * side
    angle = 0.115 * side
    cosine, sine = math.cos(angle), math.sin(angle)
    return (
        center_x + lateral * cosine - longitudinal * sine,
        -0.010 + lateral * sine + longitudinal * cosine,
        z,
    )


def build_boot(
    side: float,
    label: str,
    garment: bpy.types.Collection,
    armor: bpy.types.Collection,
    detail: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    sections = [
        (0.095, 0.047, 0.026, 0.108), (0.040, 0.058, 0.026, 0.116),
        (-0.030, 0.065, 0.025, 0.105), (-0.100, 0.064, 0.024, 0.083),
        (-0.165, 0.050, 0.023, 0.058), (-0.205, 0.026, 0.023, 0.045),
    ]
    cross = [(-1.0, 0.18), (-0.80, 0.76), (-0.28, 1.0), (0.28, 1.0),
             (0.80, 0.76), (1.0, 0.18), (0.80, 0.0), (-0.80, 0.0)]
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for longitudinal, half_width, bottom, top in sections:
        height = top - bottom
        for lateral_factor, height_factor in cross:
            vertices.append(boot_transform(side, lateral_factor * half_width, longitudinal, bottom + height_factor * height))
    ring_steps = len(cross)
    for section_index in range(len(sections) - 1):
        current, following = section_index * ring_steps, (section_index + 1) * ring_steps
        for index in range(ring_steps):
            nxt = (index + 1) % ring_steps
            faces.append((current + index, current + nxt, following + nxt, following + index))
    faces.append(tuple(reversed(range(ring_steps))))
    last = (len(sections) - 1) * ring_steps
    faces.append(tuple(last + index for index in range(ring_steps)))
    role = "low angular technical boot last with tapered toe and integrated heel seat"
    last_obj = u.new_mesh_object(f"{PREFIX}BootTechnicalLast_{label}", vertices, faces, garment, materials["rubber"], role)
    u.add_modifiers(last_obj, bevel=0.0028, bevel_segments=3)
    objects.append(tag(last_obj, role))

    outline = [(-0.045, 0.105), (0.045, 0.105), (0.061, 0.040), (0.067, -0.070),
               (0.057, -0.165), (0.029, -0.210), (-0.029, -0.210), (-0.057, -0.165),
               (-0.067, -0.070), (-0.061, 0.040)]
    lower = [boot_transform(side, x, y, 0.009) for x, y in outline]
    upper = [boot_transform(side, x, y, 0.026) for x, y in outline]
    count = len(outline)
    sole_faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        sole_faces.append((index, nxt, count + nxt, count + index))
    sole_role = "contoured angular outsole with protected toe and heel perimeter"
    sole = u.new_mesh_object(f"{PREFIX}BootOutsole_{label}", lower + upper, sole_faces, detail, materials["rubber"], sole_role)
    u.add_modifiers(sole, bevel=0.003, bevel_segments=3)
    objects.append(tag(sole, sole_role))

    top_sections = sections[1:]
    dorsal_vertices: list[tuple[float, float, float]] = []
    dorsal_faces: list[tuple[int, ...]] = []
    columns = 9
    for longitudinal, half_width, _bottom, top in top_sections:
        for column in range(columns):
            t = column / (columns - 1)
            lateral = -0.76 * half_width + 1.52 * half_width * t
            arch = (1.0 - (lateral / max(half_width, 1.0e-5)) ** 2) * 0.008
            dorsal_vertices.append(boot_transform(side, lateral, longitudinal, top + 0.004 + arch))
    for row_index in range(len(top_sections) - 1):
        current, following = row_index * columns, (row_index + 1) * columns
        for column in range(columns - 1):
            dorsal_faces.append((current + column, current + column + 1, following + column + 1, following + column))
    dorsal_role = "compound toe and instep armor nested into angular boot last"
    dorsal = u.new_mesh_object(f"{PREFIX}BootDorsalArmor_{label}", dorsal_vertices, dorsal_faces, armor, materials["ceramic_dark"], dorsal_role)
    u.add_modifiers(dorsal, subdivision=1, solidify=0.006, bevel=0.002, bevel_segments=3)
    objects.append(tag(dorsal, dorsal_role))

    toe_center = boot_transform(side, 0.0, -0.165, 0.058)
    objects.append(add_box(
        f"BootToeBumper_{label}", toe_center, (0.082, 0.052, 0.018), armor, materials["ceramic_dark"],
        "faceted armored toe bumper mechanically seated over dorsal shell", bevel=0.006,
        rotation=(0.0, 0.0, 0.115 * side),
    ))
    instep_center = boot_transform(side, 0.0, -0.035, 0.116)
    objects.append(add_box(
        f"BootInstepBridge_{label}", instep_center, (0.076, 0.048, 0.018), armor, materials["steel"],
        "raised instep bridge tying toe armor into ankle upper", bevel=0.006,
        rotation=(0.12, 0.0, 0.115 * side),
    ))
    ankle_sections = [(0.075, 0.018, 0.060, 0.055), (0.135, 0.015, 0.058, 0.052),
                      (0.205, 0.011, 0.053, 0.047), (0.270, 0.008, 0.048, 0.042)]
    steps = 12
    av: list[tuple[float, float, float]] = []
    af: list[tuple[int, ...]] = []
    for z, center_y, radius_x, radius_y in ankle_sections:
        for index in range(steps):
            angle = math.tau * index / steps
            av.append(boot_transform(side, radius_x * math.cos(angle), center_y + radius_y * math.sin(angle), z))
    for ring_index in range(len(ankle_sections) - 1):
        current, following = ring_index * steps, (ring_index + 1) * steps
        for index in range(steps):
            nxt = (index + 1) % steps
            af.append((current + index, current + nxt, following + nxt, following + index))
    ankle_role = "faceted armored ankle upper overlapping instep heel and shin collar"
    ankle = u.new_mesh_object(f"{PREFIX}BootAnkleUpper_{label}", av, af, garment, materials["gunmetal"], ankle_role)
    u.add_modifiers(ankle, subdivision=1, solidify=0.006, bevel=0.0022, bevel_segments=3)
    objects.append(tag(ankle, ankle_role))

    heel_profile = [(0.060, 0.065), (0.102, 0.080), (0.090, 0.205),
                    (0.048, 0.230), (0.020, 0.175), (0.025, 0.095)]
    x_minimum, x_maximum = sorted((0.150 * side, 0.220 * side))
    heel = u.extrude_yz_profile(
        f"{PREFIX}BootHeelCage_{label}", heel_profile, x_minimum, x_maximum,
        armor, materials["steel"], "mechanical heel cage joining outsole ankle and shin collar", bevel=0.004,
    )
    objects.append(tag(heel, heel.get("kyx_role", "mechanical heel cage")))
    objects.append(add_disc_x(
        f"BootAnklePivot_{label}", (0.226 * side, 0.012, 0.170), 0.026, 0.013,
        detail, materials["bronze"], "functional boot ankle pivot integrated into heel cage",
    ))
    for index, longitudinal in enumerate((-0.170, -0.105, -0.035, 0.035, 0.085), 1):
        center = boot_transform(side, 0.0, longitudinal, 0.006)
        objects.append(add_box(
            f"BootTreadBlock{index}_{label}", center, (0.086, 0.028, 0.012),
            detail, materials["rubber"], "segmented outsole traction block", bevel=0.002,
            rotation=(0.0, 0.0, 0.115 * side),
        ))
    objects.append(add_box(
        f"BootTelemetry_{label}", boot_transform(side, 0.0, -0.040, 0.150),
        (0.008, 0.005, 0.024), detail, materials["cyan"],
        "restrained boot status slit", bevel=0.0012, rotation=(0.0, 0.0, 0.115 * side),
    ))
    return objects


def build_rifle(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], dict[str, tuple[float, float, float]]]:
    objects: list[bpy.types.Object] = []
    receiver = axis_volume(
        "RifleReceiverCore",
        [(-0.430, 1.165, 0.044, 0.067), (-0.350, 1.175, 0.058, 0.092),
         (-0.150, 1.178, 0.066, 0.102), (0.060, 1.174, 0.062, 0.094),
         (0.150, 1.166, 0.052, 0.074)],
        collection, materials["gunmetal"],
        "forged multi-depth receiver core with changing section and real maintenance recesses",
        exponent=4.8, ring_steps=18, bevel=0.0055,
    )
    boolean_box_cut(receiver, "EjectionPort", (-0.070, -0.055, 1.205), (0.145, 0.052, 0.042))
    boolean_box_cut(receiver, "ControlPocket", (-0.278, -0.054, 1.145), (0.078, 0.046, 0.032))
    objects.append(receiver)
    objects.append(add_box(
        "RifleEjectionCavity", (-0.070, -0.048, 1.205), (0.124, 0.009, 0.027),
        collection, materials["seam"], "deep ejection cavity behind real receiver cutout", bevel=0.0025,
    ))
    objects.append(axis_volume(
        "RifleUpperSaddle",
        [(-0.370, 1.215, 0.052, 0.030), (-0.210, 1.225, 0.064, 0.038),
         (-0.020, 1.220, 0.067, 0.036), (0.105, 1.205, 0.056, 0.028)],
        collection, materials["ceramic_dark"],
        "stepped armored receiver saddle exposing structural gunmetal perimeter",
        exponent=4.4, ring_steps=16, bevel=0.004,
    ))
    handguard = axis_volume(
        "RifleHandguardCore",
        [(0.115, 1.168, 0.057, 0.078), (0.230, 1.170, 0.064, 0.086),
         (0.410, 1.168, 0.060, 0.080), (0.565, 1.163, 0.049, 0.064),
         (0.625, 1.160, 0.039, 0.050)],
        collection, materials["steel"],
        "tapered multi-depth handguard with real ventilation and barrel support structure",
        exponent=4.7, ring_steps=18, bevel=0.0045,
    )
    for index, x in enumerate((0.225, 0.315, 0.405, 0.495, 0.560), 1):
        boolean_box_cut(handguard, f"HandguardVent{index}", (x, 0.0, 1.205), (0.046, 0.150, 0.023), rotation=(0.0, -0.08, 0.0))
    objects.append(handguard)
    objects.append(axis_volume(
        "RifleLowerSupportModule",
        [(0.165, 1.098, 0.038, 0.020), (0.320, 1.094, 0.047, 0.027),
         (0.500, 1.098, 0.040, 0.021)],
        collection, materials["rubber"], "contoured forward support module with traction indexing",
        exponent=4.2, ring_steps=14, bevel=0.003,
    ))
    for index, x in enumerate((0.210, 0.260, 0.310, 0.360, 0.410, 0.460), 1):
        objects.append(add_box(
            f"RifleSupportRib_{index}", (x, -0.046, 1.096), (0.011, 0.010, 0.032),
            collection, materials["gunmetal"], "integrated support-hand traction rib", bevel=0.0017,
        ))

    for name, start, end, width, depth in (
        ("StockUpperSpar", (-0.375, 0.0, 1.218), (-0.680, 0.0, 1.248), 0.068, 0.030),
        ("StockLowerSpar", (-0.365, 0.0, 1.110), (-0.660, 0.0, 1.074), 0.064, 0.026),
        ("StockRearSpar", (-0.680, 0.0, 1.248), (-0.660, 0.0, 1.074), 0.072, 0.028),
    ):
        objects.append(add_strut(
            f"Rifle{name}", start, end, width, depth, collection, materials["steel"],
            "open skeleton stock spar with true negative space and changing load path",
        ))
    objects.append(profile_volume(
        "RifleButtPad", [(-0.710, 1.258), (-0.672, 1.252), (-0.650, 1.215),
                         (-0.652, 1.070), (-0.684, 1.045), (-0.722, 1.070)],
        0.080, collection, materials["rubber"],
        "angled rubber shoulder pad with defined seating face", bevel=0.006,
    ))
    objects.append(axis_volume(
        "RifleCheekRest", [(-0.655, 1.260, 0.042, 0.024), (-0.500, 1.254, 0.051, 0.030),
                           (-0.350, 1.232, 0.047, 0.024)],
        collection, materials["ceramic"], "tapered cheek rest nested onto stock upper spar",
        exponent=4.3, ring_steps=14, bevel=0.0035,
    ))

    objects.append(profile_volume(
        "RiflePistolGrip", [(-0.300, 1.110), (-0.205, 1.110), (-0.170, 0.990),
                            (-0.205, 0.930), (-0.266, 0.944), (-0.318, 1.045)],
        0.076, collection, materials["rubber"],
        "ergonomic pistol grip with palm swell heel and receiver root", bevel=0.009,
    ))
    objects.append(axis_volume(
        "RifleMagazineWell", [(-0.090, 1.105, 0.056, 0.034), (0.045, 1.100, 0.062, 0.040)],
        collection, materials["gunmetal"], "deep magazine well mechanically integrated into lower receiver",
        exponent=4.3, ring_steps=14, bevel=0.004,
    ))
    objects.append(profile_volume(
        "RifleMagazine", [(-0.080, 1.082), (0.042, 1.080), (0.055, 0.925),
                          (0.012, 0.892), (-0.087, 0.915)],
        0.068, collection, materials["steel"],
        "tapered armored magazine seated inside modeled well", bevel=0.0055,
    ))
    for index, x in enumerate((-0.052, -0.024, 0.004, 0.032), 1):
        objects.append(add_box(
            f"RifleMagazineRib_{index}", (x, -0.037, 0.970), (0.006, 0.005, 0.092),
            collection, materials["seam"], "recessed magazine manufacturing rib", bevel=0.0011,
        ))
    objects.append(add_curve(
        "RifleTriggerGuard", [(-0.300, -0.034, 1.092), (-0.267, -0.044, 1.128),
                              (-0.210, -0.044, 1.128), (-0.172, -0.034, 1.090)],
        0.0052, collection, materials["steel"], "continuous trigger guard with real clearance",
    ))
    objects.append(add_box(
        "RifleTrigger", (-0.232, -0.007, 1.086), (0.006, 0.025, 0.031),
        collection, materials["bronze"], "reachable trigger blade", bevel=0.0018, rotation=(0.0, -0.16, 0.0),
    ))

    barrel = u.add_cylinder_between(
        f"{PREFIX}RifleBarrel", (0.550, 0.0, 1.162), (0.825, 0.0, 1.162),
        0.014, collection, materials["gunmetal"],
        "rooted faceted free-floating barrel extending from modeled gas block", vertices=16,
    )
    objects.append(tag(barrel, "rooted faceted free-floating barrel extending from modeled gas block"))
    objects.append(axis_volume(
        "RifleGasBlock", [(0.530, 1.162, 0.032, 0.034), (0.625, 1.162, 0.034, 0.036)],
        collection, materials["gunmetal"], "modeled gas block rooting barrel into handguard",
        exponent=4.2, ring_steps=14, bevel=0.003,
    ))
    muzzle = u.add_cylinder_between(
        f"{PREFIX}RifleMuzzleBrake", (0.808, 0.0, 1.162), (0.912, 0.0, 1.162),
        0.026, collection, materials["steel"], "faceted muzzle brake with real expansion vents", vertices=14,
    )
    objects.append(tag(muzzle, "faceted muzzle brake with real expansion vents"))
    for index, x in enumerate((0.836, 0.868, 0.900), 1):
        boolean_box_cut(muzzle, f"MuzzleVent{index}", (x, 0.0, 1.162), (0.013, 0.076, 0.011))

    objects.append(add_box(
        "RifleTopRail", (0.105, 0.0, 1.280), (0.820, 0.040, 0.016),
        collection, materials["gunmetal"], "continuous manufactured top rail", bevel=0.003,
    ))
    for index, x in enumerate((-0.270, -0.205, -0.140, -0.075, -0.010, 0.055, 0.120, 0.185, 0.250, 0.315, 0.380, 0.445, 0.510), 1):
        objects.append(add_box(
            f"RifleRailTooth_{index}", (x, 0.0, 1.291), (0.026, 0.047, 0.009),
            collection, materials["steel"], "low-profile rail indexing tooth", bevel=0.0012,
        ))
    objects.append(axis_volume(
        "RifleOpticBase", [(-0.215, 1.305, 0.032, 0.020), (-0.085, 1.305, 0.037, 0.024)],
        collection, materials["gunmetal"], "low-profile optic mount keyed into receiver rail",
        exponent=4.2, ring_steps=12, bevel=0.003,
    ))
    optic = u.add_cylinder_between(
        f"{PREFIX}RifleOptic", (-0.190, 0.0, 1.343), (-0.075, 0.0, 1.343),
        0.026, collection, materials["ceramic_dark"], "compact enclosed combat optic", vertices=16,
    )
    objects.append(tag(optic, "compact enclosed combat optic"))
    objects.append(add_box(
        "RifleChargingHandle", (-0.310, 0.068, 1.220), (0.058, 0.022, 0.018),
        collection, materials["bronze"], "modeled charging handle with reachable purchase", bevel=0.003,
    ))
    for index, x in enumerate((-0.320, -0.135, 0.075, 0.585), 1):
        objects.append(add_bolt_y(
            f"RifleFastener_{index}", (x, -0.069, 1.205 if index != 4 else 1.170),
            0.004, 0.009, collection, materials["bronze"], "recessed rifle housing fastener",
        ))
    objects.append(add_box(
        "RifleTelemetry", (-0.120, -0.069, 1.225), (0.050, 0.005, 0.011),
        collection, materials["cyan"], "single restrained receiver telemetry aperture", bevel=0.0015,
    ))
    objects.append(add_box(
        "RifleSafetyIndex", (-0.265, -0.069, 1.145), (0.016, 0.005, 0.006),
        collection, materials["coral"], "minimal safety selector index", bevel=0.0011,
    ))

    witnesses = {
        "primary_grip": (-0.245, -0.052, 1.025),
        "support_grip": (0.335, -0.052, 1.098),
        "shoulder": (-0.708, 0.000, 1.165),
    }
    for label, location in witnesses.items():
        witness = bpy.data.objects.new(f"{PREFIX}CONTACT_{label}", None)
        witness.location = location
        witness.empty_display_type = "PLAIN_AXES"
        witness.empty_display_size = 0.030
        collection.objects.link(witness)
        tag(witness, f"future {label.replace('_', ' ')} witness only; no held-contact claim")
    return objects, witnesses


def inventory(collections: Iterable[bpy.types.Collection]) -> dict[str, object]:
    names = {collection.name for collection in collections}
    objects = [
        obj for obj in bpy.data.objects
        if any(collection.name in names for collection in obj.users_collection)
    ]
    return {
        "objects": len(objects),
        "meshes": sum(obj.type == "MESH" for obj in objects),
        "curves": sum(obj.type == "CURVE" for obj in objects),
        "empties": sum(obj.type == "EMPTY" for obj in objects),
        "materials": sorted({slot.material.name for obj in objects for slot in obj.material_slots if slot.material}),
        "collections": sorted(names),
    }


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 5:
        raise SystemExit(
            "Expected -- <accepted-v6a.blend> <preserved-rev9.blend> "
            "<production-target.png> <rev10.blend> <report.json>"
        )
    v6a_path, rev9_path, reference_path, output_path, report_path = (
        Path(value).resolve() for value in arguments
    )
    for path in (v6a_path, rev9_path, reference_path):
        if not path.is_file():
            raise FileNotFoundError(path)
    hashes_before = {
        "acceptedV6A": sha256(v6a_path),
        "preservedRev9": sha256(rev9_path),
        "productionTarget": sha256(reference_path),
    }
    expected = {
        "acceptedV6A": PINNED_V6A_SHA256,
        "preservedRev9": PINNED_REV9_SHA256,
        "productionTarget": PINNED_REFERENCE_SHA256,
    }
    if hashes_before != expected:
        raise RuntimeError(f"Pinned source hash mismatch: {hashes_before}")

    bpy.ops.wm.open_mainfile(filepath=str(v6a_path), load_ui=False, use_scripts=False)
    body = bpy.data.objects.get(SOURCE_BODY)
    if body is None or body.type != "MESH":
        raise RuntimeError(f"Missing accepted V6-A body: {SOURCE_BODY}")
    body_geometry_before = mesh_geometry_sha256(body)

    root = bpy.data.collections.new(f"{PREFIX}ProductionFormStrike")
    bpy.context.scene.collection.children.link(root)
    collections: dict[str, bpy.types.Collection] = {}
    for key, suffix in (
        ("garment", "ContinuousTechnicalUndersuit"),
        ("armor", "InterlockingProductionArmor"),
        ("detail", "FunctionalMicroDetail"),
        ("rifle", "MultiDepthAutoRifle"),
    ):
        collection = bpy.data.collections.new(f"{PREFIX}{suffix}")
        root.children.link(collection)
        collections[key] = collection

    materials = make_materials()
    u.relink(body, collections["garment"])
    body.name = f"{PREFIX}AcceptedV6AContinuousUndersuit"
    body.data.name = f"{PREFIX}AcceptedV6AContinuousUndersuit_Mesh"
    body.data.materials.clear()
    for material in (materials["fabric"], materials["flex"], materials["rubber"]):
        body.data.materials.append(material)
    for polygon in body.data.polygons:
        center = polygon.center
        if (0.98 < center.z < 1.08) or (0.50 < center.z < 0.70) or (1.00 < center.z < 1.16 and abs(center.x) > 0.27):
            polygon.material_index = 1
        elif center.z < 0.15 or (center.z < 0.78 and abs(center.x) > 0.30):
            polygon.material_index = 2
        else:
            polygon.material_index = 0
    tag(body, "accepted V6-A anatomy preserved as fully continuous graphite woven technical undersuit")
    for eye in [obj for obj in bpy.data.objects if "Eye." in obj.name]:
        eye.hide_render = True
        eye.hide_viewport = True

    character_objects: list[bpy.types.Object] = [body]
    character_objects.extend(build_torso(body, collections["armor"], collections["detail"], materials))
    character_objects.extend(build_limbs(collections["armor"], collections["detail"], materials))
    character_objects.extend(build_helmet(collections["garment"], collections["armor"], collections["detail"], materials))
    for side, label in ((1.0, "R"), (-1.0, "L")):
        character_objects.extend(build_boot(side, label, collections["garment"], collections["armor"], collections["detail"], materials))
    rifle_objects, witnesses = build_rifle(collections["rifle"], materials)
    bpy.context.view_layer.update()

    body_geometry_after = mesh_geometry_sha256(body)
    if body_geometry_after != body_geometry_before:
        raise RuntimeError("Accepted V6-A body geometry changed during rev10 authoring")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)
    hashes_after = {
        "acceptedV6A": sha256(v6a_path),
        "preservedRev9": sha256(rev9_path),
        "productionTarget": sha256(reference_path),
    }
    if hashes_after != hashes_before:
        raise RuntimeError("A pinned source changed during rev10 authoring")
    output_hash = sha256(output_path)
    all_names = [obj.name for obj in bpy.data.objects]
    report = {
        "schemaVersion": 1,
        "authoredUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "sources": {
            "acceptedV6A": {
                "path": str(v6a_path), "sha256Before": hashes_before["acceptedV6A"],
                "sha256After": hashes_after["acceptedV6A"], "unchanged": True,
                "bodyGeometrySha256Before": body_geometry_before,
                "bodyGeometrySha256After": body_geometry_after,
                "bodyGeometryUnchangedInOutput": body_geometry_before == body_geometry_after,
            },
            "preservedRev9": {
                "path": str(rev9_path), "sha256Before": hashes_before["preservedRev9"],
                "sha256After": hashes_after["preservedRev9"], "unchanged": True,
                "usedAsGeometrySource": False,
            },
            "productionTarget": {
                "path": str(reference_path), "sha256Before": hashes_before["productionTarget"],
                "sha256After": hashes_after["productionTarget"], "unchanged": True,
                "usage": "construction language only; accepted V6-A body bulk and proportions remain authoritative",
            },
        },
        "output": {"path": str(output_path), "bytes": output_path.stat().st_size, "sha256": output_hash},
        "constructionMethod": {
            "torso": "Direct V6-A BVH projection with continuous dark cuirass, separate overlapping clavicle, pectoral, rib, sternum, abdominal, waist, and fully armored pelvic systems.",
            "limbs": "Deep 214-258 degree anatomical joint housings, overlapping under-shells and strike plates, structural bridges, side rails, and functional pivot hardware.",
            "helmet": "Compact faceted sealed liner, separate crown/brow/cheek/jaw/temple/occipital plates, recessed non-planar visor, concentric pivots, vents, and close neck seal.",
            "boots": "Low angular last, contoured outsole, segmented tread, compound dorsal/toe/instep armor, armored ankle upper, mechanical heel cage, and pivot.",
            "rifle": "New multi-depth receiver and handguard with true cutouts, open stock, rooted barrel, optic, charging handle, fasteners, and restrained telemetry.",
        },
        "contactWitnesses": witnesses,
        "inventory": inventory(collections.values()),
        "objectCounts": {
            "character": len(character_objects), "rifle": len(rifle_objects),
            "contactWitnesses": len(witnesses),
        },
        "assertions": {
            "builtFromAcceptedV6A": True,
            "acceptedV6AFilePreserved": hashes_after["acceptedV6A"] == PINNED_V6A_SHA256,
            "acceptedV6ABodyGeometryPreservedInOutput": body_geometry_before == body_geometry_after,
            "rev9Preserved": hashes_after["preservedRev9"] == PINNED_REV9_SHA256,
            "rev9NotUsedAsGeometrySource": True,
            "productionTargetPinnedAndPreserved": hashes_after["productionTarget"] == PINNED_REFERENCE_SHA256,
            "noV6BObjects": not any("V6B" in name.upper() or "V6_B" in name.upper() for name in all_names),
            "noRev9Objects": not any(name.startswith("KYX_V6C_BENCH_R9_") for name in all_names),
            "noArmatures": len(bpy.data.armatures) == 0,
            "noActions": len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
            "contactWitnessCount": len(witnesses) == 3,
            "noLiteralHeldContactClaim": True,
        },
        "status": "V6C_VISUAL_BENCHMARK_REV10_REQUIRES_DIRECT_VISUAL_AUDIT",
        "nonClaims": [
            "Revision 10 is a visual benchmark candidate; it is not V6-C or G6 acceptance.",
            "Contact empties record future intent only; no held, two-hand, or shoulder contact is claimed.",
            "No final retopology, authored UVs, texture bake, rig, animation, LOD, GLB, runtime integration, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": report["status"], "outputSha256": output_hash,
        "objects": report["inventory"]["objects"],
        "sourceReferenceSha256": hashes_after["productionTarget"],
    }, sort_keys=True))


if __name__ == "__main__":
    main()
