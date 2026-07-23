"""Author KYX Vanguard V6-C visual benchmark revision 8 from accepted V6-A.

The pinned production target is used only for coherent armor, helmet, material,
boot, and rifle construction language. Accepted V6-A anatomy remains the sole
body/proportion source. Rev7, V6-A, and the source-reference image are verified
and preserved byte-for-byte. This is a visual benchmark only.
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


PREFIX = "KYX_V6C_BENCH_R8_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV8"
SOURCE_BODY = "KYX_V6A_AnatomySculpt_Body"
PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
PINNED_REV7_SHA256 = "b07d9657cefe68d33f4657da8fb2cf3498339bbc49c333036f0782c78137e4d6"
PINNED_REFERENCE_SHA256 = "9c188fa32daaeec2d284727a5d9e600f94b8b57fee6f0568c7ebac9d462abdd2"

UTILITY_PATH = Path(__file__).with_name("author_v6b_production_sculpt_rev11.py")
SPEC = importlib.util.spec_from_file_location("kyx_rev8_hardsurface_utilities", UTILITY_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load hard-surface utilities: {UTILITY_PATH}")
u = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(u)
u.PREFIX = PREFIX
u.CHECKPOINT = CHECKPOINT


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <accepted-v6a.blend> <rev7.blend> <reference.png> "
            "<rev8.blend> <report.json>"
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
    mesh = obj.data
    for vertex in mesh.vertices:
        digest.update((f"v:{vertex.co.x:.9f},{vertex.co.y:.9f},{vertex.co.z:.9f};").encode())
    for polygon in mesh.polygons:
        digest.update(("p:" + ",".join(str(index) for index in polygon.vertices) + ";").encode())
    return digest.hexdigest()


def tag(obj: bpy.types.Object, role: str) -> bpy.types.Object:
    obj["kyx_checkpoint"] = CHECKPOINT
    obj["kyx_role"] = role
    obj["kyx_nonclaim"] = (
        "V6-C revision 8 visual benchmark only; not retopologized, rigged, "
        "exported, runtime, held-contact, V6-C accepted, or G6 accepted"
    )
    return obj


# Imported helpers resolve their module globals at call time.
u.tag = tag


def flat_shade(obj: bpy.types.Object) -> bpy.types.Object:
    if obj.type == "MESH":
        for polygon in obj.data.polygons:
            polygon.use_smooth = False
    return obj


def profile_prism(
    name: str,
    xz: list[tuple[float, float]],
    depth: float,
    center_y: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.004,
) -> bpy.types.Object:
    obj = u.add_receiver_profile(
        f"{PREFIX}{name}", xz, depth, collection, material, role, bevel=bevel,
    )
    obj.location.y = center_y
    return flat_shade(tag(obj, role))


def yz_prism(
    name: str,
    yz: list[tuple[float, float]],
    x_minimum: float,
    x_maximum: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.004,
) -> bpy.types.Object:
    obj = u.extrude_yz_profile(
        f"{PREFIX}{name}", yz, x_minimum, x_maximum,
        collection, material, role, bevel=bevel,
    )
    return flat_shade(tag(obj, role))


def xy_prism(
    name: str,
    xy: list[tuple[float, float]],
    z_minimum: float,
    z_maximum: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.003,
) -> bpy.types.Object:
    count = len(xy)
    vertices = [(x, y, z_minimum) for x, y in xy] + [(x, y, z_maximum) for x, y in xy]
    faces: list[tuple[int, ...]] = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    obj = u.new_mesh_object(f"{PREFIX}{name}", vertices, faces, collection, material, role)
    flat_shade(obj)
    u.add_modifiers(obj, bevel=bevel, bevel_segments=3)
    return tag(obj, role)


def mirror_xz(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
    return [(-x, z) for x, z in reversed(points)]


def xz_strut(
    name: str,
    start: tuple[float, float],
    end: tuple[float, float],
    center_y: float,
    depth: float,
    thickness: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
) -> bpy.types.Object:
    start_v = Vector((start[0], center_y, start[1]))
    end_v = Vector((end[0], center_y, end[1]))
    direction = end_v - start_v
    angle = -math.atan2(direction.z, direction.x)
    obj = u.add_beveled_box(
        f"{PREFIX}{name}", tuple((start_v + end_v) * 0.5),
        (direction.length, depth, thickness), collection, material, role,
        bevel=min(0.0035, thickness * 0.30), rotation=(0.0, angle, 0.0),
    )
    return flat_shade(tag(obj, role))


def add_hex_fastener(
    name: str,
    location: tuple[float, float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    radius: float = 0.006,
    depth: float = 0.006,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=6, radius=radius, depth=depth,
        location=location, rotation=(math.pi * 0.5, 0.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = f"{PREFIX}{name}"
    u.relink(obj, collection)
    obj.data.materials.append(material)
    u.add_modifiers(obj, bevel=radius * 0.18, bevel_segments=2)
    return flat_shade(tag(obj, role))


def faceted_axis_loft(
    name: str,
    sections: list[tuple[float, float, float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    ring_steps: int = 8,
    exponent: float = 4.0,
    bevel: float = 0.004,
) -> bpy.types.Object:
    """Closed faceted loft along X; section=(x, center_y, center_z, half_y, half_z)."""
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
    flat_shade(obj)
    u.add_modifiers(obj, bevel=bevel, bevel_segments=3)
    return tag(obj, role)


def faceted_helmet_shell(
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    outline = [
        (0.00, -1.00), (-0.66, -0.86), (-1.00, -0.24),
        (-0.91, 0.56), (-0.46, 1.00), (0.46, 1.00),
        (0.91, 0.56), (1.00, -0.24), (0.66, -0.86),
    ]
    rings = [
        (1.535, -0.032, 0.081, 0.122),
        (1.595, -0.034, 0.106, 0.162),
        (1.690, -0.022, 0.119, 0.164),
        (1.765, 0.004, 0.097, 0.116),
        (1.805, 0.018, 0.058, 0.069),
    ]
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, center_y, radius_x, radius_y in rings:
        vertices.extend((x * radius_x, center_y + y * radius_y, z) for x, y in outline)
    count = len(outline)
    for ring_index in range(len(rings) - 1):
        current = ring_index * count
        following = (ring_index + 1) * count
        for index in range(count):
            nxt = (index + 1) % count
            faces.append((current + index, current + nxt, following + nxt, following + index))
    faces.append(tuple(reversed(range(count))))
    last = (len(rings) - 1) * count
    faces.append(tuple(last + index for index in range(count)))
    role = "low-profile closed faceted helmet shell with flat crown and engineered plane breaks"
    obj = u.new_mesh_object(f"{PREFIX}HelmetFacetedShell", vertices, faces, collection, material, role)
    flat_shade(obj)
    u.add_modifiers(obj, bevel=0.0035, bevel_segments=3)
    return tag(obj, role)


def make_materials() -> dict[str, bpy.types.Material]:
    return {
        "fabric": u.make_fabric_material(f"{PREFIX}CharcoalWovenSuit"),
        "flex": u.make_principled_material(
            f"{PREFIX}FlexKnit", (0.015, 0.022, 0.027, 1.0), roughness=0.82,
        ),
        "seam": u.make_principled_material(
            f"{PREFIX}RecessedSeam", (0.004, 0.007, 0.009, 1.0), roughness=0.72,
        ),
        "gunmetal": u.make_principled_material(
            f"{PREFIX}SatinGunmetal", (0.026, 0.037, 0.043, 1.0),
            metallic=0.72, roughness=0.27, coat=0.04,
        ),
        "steel": u.make_principled_material(
            f"{PREFIX}StructuralSteel", (0.062, 0.084, 0.094, 1.0),
            metallic=0.58, roughness=0.31,
        ),
        "pearl": u.make_principled_material(
            f"{PREFIX}WarmPearlCeramic", (0.205, 0.178, 0.132, 1.0),
            metallic=0.08, roughness=0.30, coat=0.12,
        ),
        "rubber": u.make_principled_material(
            f"{PREFIX}GripRubber", (0.008, 0.012, 0.015, 1.0), roughness=0.70,
        ),
        "boot": u.make_principled_material(
            f"{PREFIX}BootComposite", (0.024, 0.034, 0.040, 1.0),
            metallic=0.18, roughness=0.46,
        ),
        "cyan": u.make_emissive_material(
            f"{PREFIX}CyanTelemetry", (0.005, 0.48, 0.68, 1.0), 1.7,
        ),
        "coral": u.make_emissive_material(
            f"{PREFIX}CoralSafety", (0.58, 0.028, 0.014, 1.0), 0.9,
        ),
        "visor": u.make_principled_material(
            f"{PREFIX}DeepCyanVisor", (0.002, 0.009, 0.014, 1.0),
            metallic=0.16, roughness=0.14, coat=0.24,
        ),
    }


def build_torso(
    armor: bpy.types.Collection,
    detail: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    front_base = [
        (-0.180, 1.472), (0.180, 1.472), (0.252, 1.412),
        (0.228, 1.252), (0.164, 1.092), (0.118, 1.045),
        (-0.118, 1.045), (-0.164, 1.092), (-0.228, 1.252), (-0.252, 1.412),
    ]
    objects.append(profile_prism(
        "FrontCuirassFoundation", front_base, 0.046, -0.145, armor,
        materials["gunmetal"],
        "single tapered cuirass foundation joining clavicle sternum rib and waist interfaces",
        bevel=0.006,
    ))
    back_base = [
        (-0.188, 1.465), (0.188, 1.465), (0.242, 1.402),
        (0.220, 1.242), (0.158, 1.085), (0.112, 1.038),
        (-0.112, 1.038), (-0.158, 1.085), (-0.220, 1.242), (-0.242, 1.402),
    ]
    objects.append(profile_prism(
        "RearCuirassFoundation", back_base, 0.040, 0.101, armor,
        materials["gunmetal"],
        "tapered rear cuirass foundation joining scapular flank waist and back-spine plates",
        bevel=0.006,
    ))

    flank_profile = [
        (-0.155, 1.395), (-0.105, 1.455), (0.055, 1.430),
        (0.120, 1.350), (0.108, 1.180), (0.042, 1.080),
        (-0.105, 1.112), (-0.165, 1.245),
    ]
    for side, label in ((1.0, "R"), (-1.0, "L")):
        x_minimum, x_maximum = sorted((0.218 * side, 0.250 * side))
        objects.append(yz_prism(
            f"CuirassFlankWrap_{label}", flank_profile, x_minimum, x_maximum,
            armor, materials["steel"],
            "solid side-wrap plate mechanically joining front and rear cuirass volumes",
            bevel=0.0045,
        ))

    clavicle_right = [
        (0.018, 1.446), (0.148, 1.458), (0.235, 1.404),
        (0.205, 1.343), (0.092, 1.356), (0.045, 1.392),
    ]
    upper_rib_right = [
        (0.050, 1.358), (0.202, 1.338), (0.218, 1.278),
        (0.078, 1.286),
    ]
    lower_rib_right = [
        (0.072, 1.272), (0.208, 1.246), (0.177, 1.178),
        (0.060, 1.205),
    ]
    for points, base_name, material in (
        (clavicle_right, "InterlockingClaviclePlate", materials["pearl"]),
        (upper_rib_right, "UpperRibPlate", materials["pearl"]),
        (lower_rib_right, "LowerRibPlate", materials["steel"]),
    ):
        for mirrored, label in ((False, "R"), (True, "L")):
            plate_points = mirror_xz(points) if mirrored else points
            objects.append(profile_prism(
                f"{base_name}_{label}", plate_points, 0.014, -0.174, armor,
                material,
                "angular mechanically nested front cuirass plate with controlled seam gap",
                bevel=0.003,
            ))

    sternum = [
        (-0.043, 1.450), (0.043, 1.450), (0.052, 1.192),
        (0.000, 1.145), (-0.052, 1.192),
    ]
    objects.append(profile_prism(
        "SternumKeel", sternum, 0.018, -0.181, armor, materials["pearl"],
        "continuous beveled sternum keel locking clavicle and rib plates to the abdomen",
        bevel=0.0035,
    ))
    abdomen_profiles = [
        [(-0.056, 1.184), (0.056, 1.184), (0.068, 1.135), (0.050, 1.110), (-0.050, 1.110), (-0.068, 1.135)],
        [(-0.062, 1.104), (0.062, 1.104), (0.072, 1.058), (0.048, 1.032), (-0.048, 1.032), (-0.072, 1.058)],
    ]
    for index, points in enumerate(abdomen_profiles, 1):
        objects.append(profile_prism(
            f"AbdominalLockPlate_{index}", points, 0.016, -0.170, armor,
            materials["steel"] if index == 1 else materials["gunmetal"],
            "stacked abdominal lock plate continuing cuirass load path into waist",
            bevel=0.003,
        ))

    waist_front = [
        (-0.156, 1.078), (0.156, 1.078), (0.174, 1.033),
        (0.112, 0.996), (-0.112, 0.996), (-0.174, 1.033),
    ]
    waist_back = [
        (-0.150, 1.072), (0.150, 1.072), (0.165, 1.025),
        (0.108, 0.992), (-0.108, 0.992), (-0.165, 1.025),
    ]
    objects.append(profile_prism(
        "FrontWaistLock", waist_front, 0.032, -0.112, armor, materials["pearl"],
        "front waist lock mechanically terminating the tapered cuirass", bevel=0.004,
    ))
    objects.append(profile_prism(
        "RearWaistLock", waist_back, 0.030, 0.090, armor, materials["steel"],
        "rear waist lock joining flank wraps and back spine", bevel=0.004,
    ))

    scapular_right = [
        (0.038, 1.435), (0.166, 1.448), (0.226, 1.391),
        (0.192, 1.302), (0.072, 1.326),
    ]
    lumbar_right = [
        (0.050, 1.285), (0.205, 1.260), (0.180, 1.155),
        (0.062, 1.180),
    ]
    for points, base_name, material in (
        (scapular_right, "ScapularInterlock", materials["pearl"]),
        (lumbar_right, "LumbarWing", materials["steel"]),
    ):
        for mirrored, label in ((False, "R"), (True, "L")):
            objects.append(profile_prism(
                f"{base_name}_{label}", mirror_xz(points) if mirrored else points,
                0.014, 0.127, armor, material,
                "angular rear plate nested into yoke flank and spine structure",
                bevel=0.003,
            ))
    back_spine_profiles = [
        [(-0.038, 1.446), (0.038, 1.446), (0.045, 1.362), (0.000, 1.330), (-0.045, 1.362)],
        [(-0.043, 1.322), (0.043, 1.322), (0.050, 1.236), (0.000, 1.205), (-0.050, 1.236)],
        [(-0.047, 1.194), (0.047, 1.194), (0.052, 1.112), (0.000, 1.082), (-0.052, 1.112)],
    ]
    for index, points in enumerate(back_spine_profiles, 1):
        objects.append(profile_prism(
            f"BackSpineLock_{index}", points, 0.018, 0.135, armor,
            materials["steel"] if index != 2 else materials["pearl"],
            "segmented structural back-spine plate with deliberate overlap",
            bevel=0.003,
        ))

    # Recessed construction seams replace the cable-like arcs of rev7.
    seam_specs = [
        ((-0.205, 1.337), (-0.075, 1.356), "UpperSeam_L"),
        ((0.075, 1.356), (0.205, 1.337), "UpperSeam_R"),
        ((-0.190, 1.247), (-0.070, 1.270), "LowerSeam_L"),
        ((0.070, 1.270), (0.190, 1.247), "LowerSeam_R"),
    ]
    for start, end, name in seam_specs:
        objects.append(xz_strut(
            name, start, end, -0.183, 0.008, 0.006, detail,
            materials["seam"], "recessed plate separation seam, not a cable",
        ))
    for index, (x, z) in enumerate(((-0.207, 1.400), (0.207, 1.400), (-0.150, 1.105), (0.150, 1.105)), 1):
        objects.append(add_hex_fastener(
            f"CuirassFastener_{index}", (x, -0.184, z), detail,
            materials["seam"], "flush hexagonal cuirass fastener",
        ))
    objects.append(u.add_beveled_box(
        f"{PREFIX}SternumTelemetry", (0.0, -0.193, 1.300),
        (0.013, 0.007, 0.058), detail, materials["cyan"],
        "restrained recessed sternum telemetry light", bevel=0.002,
    ))
    return [tag(obj, obj.get("kyx_role", "torso construction")) for obj in objects]


def build_helmet(
    armor: bpy.types.Collection,
    detail: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = [faceted_helmet_shell(armor, materials["gunmetal"])]
    visor_profile = [
        (-0.095, 1.704), (0.095, 1.704), (0.108, 1.645),
        (0.077, 1.570), (0.000, 1.548), (-0.077, 1.570), (-0.108, 1.645),
    ]
    objects.append(profile_prism(
        "VisorLens", visor_profile, 0.011, -0.191, armor, materials["visor"],
        "single faceted visor lens seated inside a complete brow jaw and temple frame",
        bevel=0.0025,
    ))
    crown_profile = [
        (-0.070, 1.802), (0.070, 1.802), (0.100, 1.752),
        (0.074, 1.714), (-0.074, 1.714), (-0.100, 1.752),
    ]
    chin_profile = [
        (-0.076, 1.568), (0.000, 1.542), (0.076, 1.568),
        (0.057, 1.520), (-0.057, 1.520),
    ]
    objects.append(profile_prism(
        "CrownArmorPlate", crown_profile, 0.014, -0.151, armor,
        materials["pearl"], "flat-crowned frontal armor plate with explicit brow overlap",
        bevel=0.003,
    ))
    objects.append(profile_prism(
        "ChinJawPlate", chin_profile, 0.018, -0.174, armor,
        materials["pearl"], "angular chin and jaw protection closing the visor frame",
        bevel=0.003,
    ))
    objects.append(xz_strut(
        "VisorBrowFrame", (-0.106, 1.711), (0.106, 1.711), -0.200,
        0.018, 0.014, detail, materials["steel"], "continuous visor brow frame",
    ))
    for side, label in ((1.0, "R"), (-1.0, "L")):
        objects.append(xz_strut(
            f"VisorSideFrame_{label}", (0.104 * side, 1.700), (0.111 * side, 1.598),
            -0.198, 0.018, 0.012, detail, materials["steel"],
            "beveled visor side frame locked into temple module",
        ))
        objects.append(xz_strut(
            f"JawRail_{label}", (0.108 * side, 1.600), (0.060 * side, 1.527),
            -0.180, 0.020, 0.014, detail, materials["steel"],
            "structural jaw rail joining visor temple and chin armor",
        ))
        temple_profile = [
            (-0.087, 1.696), (-0.050, 1.724), (0.044, 1.704),
            (0.092, 1.650), (0.061, 1.584), (-0.036, 1.568), (-0.086, 1.616),
        ]
        x_minimum, x_maximum = sorted((0.108 * side, 0.128 * side))
        objects.append(yz_prism(
            f"TempleModule_{label}", temple_profile, x_minimum, x_maximum,
            armor, materials["steel"],
            "layered temple module with angled brow jaw and occipital interfaces",
            bevel=0.0035,
        ))
        temple_inset = [
            (-0.070, 1.686), (-0.035, 1.708), (0.036, 1.692),
            (0.068, 1.648), (0.041, 1.602), (-0.031, 1.590), (-0.066, 1.626),
        ]
        inset_minimum, inset_maximum = sorted((0.129 * side, 0.135 * side))
        objects.append(yz_prism(
            f"TempleCeramicInset_{label}", temple_inset, inset_minimum, inset_maximum,
            detail, materials["pearl"],
            "smaller nested temple ceramic insert retaining a structural steel perimeter",
            bevel=0.002,
        ))
        objects.append(add_hex_fastener(
            f"TempleFastener_{label}", (0.137 * side, -0.006, 1.650),
            detail, materials["seam"], "flush temple-module fastener",
            radius=0.007, depth=0.006,
        ))

    rear_housing = [
        (-0.073, 1.724), (0.073, 1.724), (0.088, 1.660),
        (0.072, 1.574), (0.000, 1.548), (-0.072, 1.574), (-0.088, 1.660),
    ]
    objects.append(profile_prism(
        "OccipitalVentHousing", rear_housing, 0.032, 0.116, armor,
        materials["steel"],
        "structured rear helmet housing with load-bearing perimeter and vent field",
        bevel=0.004,
    ))
    for index, x in enumerate((-0.040, -0.013, 0.013, 0.040), 1):
        objects.append(u.add_beveled_box(
            f"{PREFIX}OccipitalVent_{index}", (x, 0.137, 1.640),
            (0.010, 0.008, 0.068), detail, materials["seam"],
            "recessed vertical occipital cooling vent", bevel=0.002,
        ))
    objects.append(u.add_beveled_box(
        f"{PREFIX}HelmetTelemetry", (0.0, -0.164, 1.773),
        (0.032, 0.007, 0.009), detail, materials["cyan"],
        "restrained brow telemetry slit", bevel=0.002,
    ))
    objects.append(u.add_beveled_box(
        f"{PREFIX}HelmetSafetyTick", (0.000, -0.164, 1.792),
        (0.019, 0.007, 0.005), detail, materials["coral"],
        "minimal crown safety identification tick", bevel=0.0015,
    ))
    return [tag(obj, obj.get("kyx_role", "helmet construction")) for obj in objects]


def build_limbs(
    armor: bpy.types.Collection,
    detail: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    shoulder_right = [
        (0.210, -0.006, 1.405, 0.068, 0.070),
        (0.265, -0.004, 1.405, 0.085, 0.082),
        (0.320, -0.001, 1.382, 0.078, 0.070),
        (0.348, 0.000, 1.350, 0.052, 0.045),
    ]
    shoulder_left = [(-x, y, z, hy, hz) for x, y, z, hy, hz in reversed(shoulder_right)]
    for sections, label in ((shoulder_right, "R"), (shoulder_left, "L")):
        objects.append(faceted_axis_loft(
            f"FacetedShoulderShell_{label}", sections, armor, materials["steel"],
            "low-profile faceted shoulder shell overlapping cuirass and upper-arm flex zone",
            bevel=0.0045,
        ))
    shoulder_crown_right = [
        (0.210, 1.443), (0.285, 1.454), (0.340, 1.408),
        (0.315, 1.365), (0.235, 1.375),
    ]
    for mirrored, label in ((False, "R"), (True, "L")):
        objects.append(profile_prism(
            f"ShoulderCeramicCrown_{label}",
            mirror_xz(shoulder_crown_right) if mirrored else shoulder_crown_right,
            0.016, -0.094, armor, materials["pearl"],
            "nested ceramic shoulder crown retaining a visible structural steel perimeter",
            bevel=0.003,
        ))

    upper_right = [
        (0.258, 1.345), (0.330, 1.326), (0.365, 1.180),
        (0.323, 1.120), (0.276, 1.190),
    ]
    elbow_right = [
        (0.304, 1.112), (0.372, 1.098), (0.392, 1.020),
        (0.354, 0.965), (0.302, 1.010),
    ]
    forearm_right = [
        (0.322, 0.973), (0.385, 0.950), (0.405, 0.760),
        (0.369, 0.704), (0.332, 0.765),
    ]
    thigh_right = [
        (0.104, 0.995), (0.232, 0.985), (0.250, 0.830),
        (0.220, 0.706), (0.142, 0.692), (0.108, 0.835),
    ]
    knee_right = [
        (0.118, 0.690), (0.220, 0.688), (0.238, 0.607),
        (0.214, 0.528), (0.132, 0.528), (0.105, 0.607),
    ]
    shin_right = [
        (0.116, 0.515), (0.214, 0.508), (0.207, 0.314),
        (0.180, 0.205), (0.132, 0.220), (0.105, 0.397),
    ]
    limb_specs = [
        (upper_right, "UpperArmPlate", materials["steel"], -0.094, 0.030),
        (elbow_right, "ElbowHingeShell", materials["gunmetal"], -0.092, 0.038),
        (forearm_right, "ForearmGauntlet", materials["pearl"], -0.088, 0.034),
        (thigh_right, "ThighArmor", materials["pearl"], -0.098, 0.030),
        (knee_right, "KneeMechanism", materials["gunmetal"], -0.092, 0.038),
        (shin_right, "ShinArmor", materials["pearl"], -0.080, 0.032),
    ]
    for points, base_name, material, center_y, depth in limb_specs:
        for mirrored, label in ((False, "R"), (True, "L")):
            objects.append(profile_prism(
                f"{base_name}_{label}", mirror_xz(points) if mirrored else points,
                depth, center_y, armor, material,
                "anatomically tapered hard-surface plate retaining dark woven flex gaps at joints",
                bevel=0.004,
            ))

    inset_specs = [
        ([(0.278, 1.316), (0.326, 1.298), (0.348, 1.205), (0.319, 1.165), (0.291, 1.208)],
         "UpperArmInset", -0.112),
        ([(0.339, 0.940), (0.373, 0.920), (0.390, 0.790), (0.367, 0.748), (0.344, 0.792)],
         "ForearmInset", -0.109),
        ([(0.130, 0.956), (0.210, 0.948), (0.226, 0.838), (0.205, 0.735), (0.152, 0.730), (0.128, 0.838)],
         "ThighInset", -0.117),
        ([(0.132, 0.482), (0.198, 0.476), (0.191, 0.326), (0.174, 0.245), (0.144, 0.255), (0.126, 0.386)],
         "ShinInset", -0.101),
    ]
    for points, base_name, center_y in inset_specs:
        for mirrored, label in ((False, "R"), (True, "L")):
            objects.append(profile_prism(
                f"{base_name}_{label}", mirror_xz(points) if mirrored else points,
                0.008, center_y, detail, materials["steel"],
                "nested structural inset reducing broad plate area and defining manufactured hierarchy",
                bevel=0.002,
            ))

    # Rear panels keep back views authored without turning the limbs into tubes.
    rear_thigh = [
        (0.125, 0.955), (0.224, 0.940), (0.235, 0.795),
        (0.205, 0.720), (0.145, 0.714), (0.118, 0.820),
    ]
    rear_shin = [
        (0.125, 0.485), (0.205, 0.476), (0.196, 0.310),
        (0.174, 0.228), (0.138, 0.237), (0.114, 0.386),
    ]
    for points, base_name in ((rear_thigh, "RearThighPlate"), (rear_shin, "RearShinPlate")):
        for mirrored, label in ((False, "R"), (True, "L")):
            objects.append(profile_prism(
                f"{base_name}_{label}", mirror_xz(points) if mirrored else points,
                0.022, 0.076, armor, materials["steel"],
                "faceted rear limb plate with preserved joint flex zone",
                bevel=0.0035,
            ))

    # Narrow structural edge rails and telemetry marks break broad faces.
    for side, label in ((1.0, "R"), (-1.0, "L")):
        objects.append(xz_strut(
            f"ForearmEdgeRail_{label}", (0.389 * side, 0.925), (0.397 * side, 0.775),
            -0.109, 0.010, 0.010, detail, materials["steel"],
            "raised forearm edge rail defining plate thickness and hinge direction",
        ))
        objects.append(xz_strut(
            f"ShinEdgeRail_{label}", (0.205 * side, 0.480), (0.194 * side, 0.270),
            -0.100, 0.010, 0.010, detail, materials["steel"],
            "raised shin edge rail defining plate thickness and ankle load path",
        ))
        objects.append(xz_strut(
            f"ForearmTelemetry_{label}", (0.350 * side, 0.900), (0.357 * side, 0.840),
            -0.111, 0.008, 0.007, detail, materials["cyan"],
            "restrained forearm telemetry slit",
        ))
        objects.append(xz_strut(
            f"ShinTelemetry_{label}", (0.149 * side, 0.330), (0.151 * side, 0.280),
            -0.101, 0.008, 0.007, detail, materials["cyan"],
            "restrained shin telemetry slit",
        ))
        objects.append(add_hex_fastener(
            f"KneeFastener_{label}", (0.218 * side, -0.114, 0.610),
            detail, materials["seam"], "flush knee hinge fastener",
            radius=0.0065,
        ))
    return [tag(obj, obj.get("kyx_role", "limb construction")) for obj in objects]


def build_boots(
    armor: bpy.types.Collection,
    detail: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    boot_materials = {
        "boot": materials["boot"], "rubber": materials["rubber"],
        "ivory": materials["pearl"],
    }
    for side, label in ((1.0, "R"), (-1.0, "L")):
        objects.extend(u.add_boot_last(side, label, armor, detail, boot_materials))
        angle = 0.16 * side
        cosine = math.cos(angle)
        sine = math.sin(angle)
        center_x = 0.188 * side

        def foot_transform(lateral: float, longitudinal: float) -> tuple[float, float]:
            return (
                center_x + lateral * cosine - longitudinal * sine,
                -0.006 + lateral * sine + longitudinal * cosine,
            )

        toe_outline = [
            foot_transform(-0.056, -0.035), foot_transform(-0.052, -0.135),
            foot_transform(-0.027, -0.165), foot_transform(0.027, -0.165),
            foot_transform(0.052, -0.135), foot_transform(0.056, -0.035),
        ]
        objects.append(xy_prism(
            f"BootAngularToeArmor_{label}", toe_outline, 0.058, 0.074,
            armor, materials["pearl"],
            "angular low-profile toe armor covering the rounded last with a manufactured perimeter",
            bevel=0.003,
        ))
        seam_start = foot_transform(-0.050, -0.050)
        seam_end = foot_transform(0.050, -0.050)
        direction = Vector((seam_end[0] - seam_start[0], seam_end[1] - seam_start[1], 0.0))
        bpy.ops.mesh.primitive_cube_add(
            size=1.0,
            location=((seam_start[0] + seam_end[0]) * 0.5, (seam_start[1] + seam_end[1]) * 0.5, 0.077),
            rotation=(0.0, 0.0, math.atan2(direction.y, direction.x)),
        )
        toe_seam = bpy.context.object
        toe_seam.name = f"{PREFIX}BootToeSeam_{label}"
        toe_seam.dimensions = (direction.length, 0.009, 0.006)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        u.relink(toe_seam, detail)
        toe_seam.data.materials.append(materials["seam"])
        u.add_modifiers(toe_seam, bevel=0.0015, bevel_segments=2)
        objects.append(flat_shade(tag(toe_seam, "recessed transverse toe-cap manufacturing seam")))
        ankle_plate = [
            (0.135, 0.255), (0.205, 0.250), (0.214, 0.172),
            (0.190, 0.112), (0.148, 0.118), (0.125, 0.190),
        ]
        objects.append(profile_prism(
            f"BootAnkleArmor_{label}", mirror_xz(ankle_plate) if side < 0 else ankle_plate,
            0.030, -0.055, armor, materials["steel"],
            "faceted ankle armor bridging shin flex zone into technical boot upper",
            bevel=0.0035,
        ))
        objects.append(xz_strut(
            f"BootInstepSeam_{label}", (0.150 * side, 0.135), (0.183 * side, 0.085),
            -0.118, 0.010, 0.008, detail, materials["seam"],
            "recessed boot instep articulation seam",
        ))
    return [tag(obj, obj.get("kyx_role", "boot construction")) for obj in objects]


def build_rifle(
    rifle: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], dict[str, tuple[float, float, float]]]:
    objects: list[bpy.types.Object] = []
    # Open skeleton stock; the negative space is real, not painted onto a slab.
    butt = [
        (-0.720, 1.245), (-0.650, 1.245), (-0.624, 1.215),
        (-0.624, 1.080), (-0.666, 1.050), (-0.720, 1.065),
    ]
    objects.append(profile_prism(
        "RifleButtPad", butt, 0.085, 0.0, rifle, materials["rubber"],
        "angled impact-absorbing butt pad with shoulder seating face", bevel=0.006,
    ))
    for name, start, end in (
        ("RifleUpperStockStrut", (-0.648, 1.220), (-0.410, 1.202)),
        ("RifleLowerStockStrut", (-0.650, 1.090), (-0.405, 1.145)),
        ("RifleStockRearBrace", (-0.655, 1.090), (-0.655, 1.220)),
    ):
        objects.append(xz_strut(
            name, start, end, 0.0, 0.074, 0.034, rifle, materials["steel"],
            "manufactured skeleton-stock strut defining real open negative space",
        ))
    cheek = [
        (-0.580, 1.247), (-0.392, 1.242), (-0.360, 1.214),
        (-0.410, 1.192), (-0.590, 1.204),
    ]
    objects.append(profile_prism(
        "RifleCheekRest", cheek, 0.082, 0.0, rifle, materials["pearl"],
        "tapered cheek rest nested onto open skeleton stock", bevel=0.004,
    ))

    receiver = [
        (-0.425, 1.245), (0.115, 1.245), (0.164, 1.210),
        (0.146, 1.095), (0.090, 1.060), (-0.342, 1.068),
        (-0.398, 1.112),
    ]
    objects.append(profile_prism(
        "RifleReceiverCore", receiver, 0.108, 0.0, rifle, materials["gunmetal"],
        "deep stepped receiver core with distinct upper lower and magazine-well interfaces",
        bevel=0.006,
    ))
    receiver_upper = [
        (-0.390, 1.236), (0.083, 1.236), (0.128, 1.205),
        (0.090, 1.160), (-0.340, 1.166),
    ]
    receiver_lower = [
        (-0.330, 1.150), (0.095, 1.147), (0.112, 1.101),
        (0.060, 1.077), (-0.300, 1.084),
    ]
    objects.append(profile_prism(
        "RifleReceiverUpperArmor", receiver_upper, 0.010, -0.059, rifle,
        materials["pearl"], "nested ceramic receiver armor with explicit seam perimeter",
        bevel=0.0025,
    ))
    objects.append(profile_prism(
        "RifleReceiverLowerArmor", receiver_lower, 0.010, -0.059, rifle,
        materials["steel"], "stepped lower receiver armor and magazine-well bridge",
        bevel=0.0025,
    ))
    ejection = [
        (-0.112, 1.218), (0.020, 1.218), (0.043, 1.193),
        (0.015, 1.172), (-0.120, 1.175), (-0.142, 1.198),
    ]
    objects.append(profile_prism(
        "RifleEjectionPort", ejection, 0.007, -0.066, rifle, materials["seam"],
        "recessed framed ejection area on the visible receiver side", bevel=0.0015,
    ))
    grip = [
        (-0.280, 1.085), (-0.190, 1.080), (-0.152, 0.985),
        (-0.194, 0.930), (-0.265, 0.963), (-0.306, 1.040),
    ]
    objects.append(profile_prism(
        "RiflePistolGrip", grip, 0.078, 0.0, rifle, materials["rubber"],
        "angled ergonomic pistol grip with palm swell and heel", bevel=0.005,
    ))
    objects.append(xz_strut(
        "RifleTriggerGuardFront", (-0.175, 1.084), (-0.151, 1.032),
        0.0, 0.062, 0.012, rifle, materials["steel"], "trigger-guard forward bow",
    ))
    objects.append(xz_strut(
        "RifleTriggerGuardBottom", (-0.151, 1.032), (-0.224, 1.021),
        0.0, 0.062, 0.012, rifle, materials["steel"], "trigger-guard lower bow",
    ))
    magazine = [
        (-0.060, 1.078), (0.040, 1.078), (0.055, 0.952),
        (0.012, 0.920), (-0.073, 0.940),
    ]
    objects.append(profile_prism(
        "RifleMagazine", magazine, 0.086, 0.0, rifle, materials["steel"],
        "separate tapered magazine seated into a defined magazine well", bevel=0.004,
    ))
    for index, x in enumerate((-0.040, -0.015, 0.010, 0.035), 1):
        objects.append(u.add_beveled_box(
            f"{PREFIX}RifleMagazineRib_{index}", (x, -0.047, 0.985),
            (0.008, 0.006, 0.095), rifle, materials["seam"],
            "recessed magazine manufacturing rib", bevel=0.0015,
        ))

    handguard = [
        (0.125, 1.226), (0.535, 1.218), (0.575, 1.183),
        (0.548, 1.086), (0.486, 1.058), (0.145, 1.068), (0.105, 1.112),
    ]
    objects.append(profile_prism(
        "RifleHandguardCore", handguard, 0.100, 0.0, rifle, materials["gunmetal"],
        "tapered ventilated handguard with a dedicated support-hand zone",
        bevel=0.006,
    ))
    handguard_shell = [
        (0.145, 1.218), (0.510, 1.210), (0.548, 1.180),
        (0.515, 1.130), (0.150, 1.138),
    ]
    objects.append(profile_prism(
        "RifleHandguardUpperShell", handguard_shell, 0.010, -0.055, rifle,
        materials["pearl"], "separate upper handguard shell with visible manufactured thickness",
        bevel=0.0025,
    ))
    for index, x in enumerate((0.230, 0.305, 0.380, 0.455), 1):
        vent = [
            (x - 0.026, 1.191), (x + 0.026, 1.191),
            (x + 0.017, 1.169), (x - 0.032, 1.169),
        ]
        objects.append(profile_prism(
            f"RifleHandguardVent_{index}", vent, 0.006, -0.063, rifle,
            materials["seam"], "recessed angled handguard cooling vent", bevel=0.001,
        ))
    support_zone = [
        (0.210, 1.105), (0.480, 1.102), (0.455, 1.064), (0.225, 1.064),
    ]
    objects.append(profile_prism(
        "RifleSupportHandZone", support_zone, 0.090, 0.0, rifle,
        materials["rubber"], "ribbed underside support-hand purchase zone", bevel=0.003,
    ))
    for index, x in enumerate((0.245, 0.285, 0.325, 0.365, 0.405, 0.445), 1):
        objects.append(u.add_beveled_box(
            f"{PREFIX}RifleSupportRib_{index}", (x, -0.049, 1.082),
            (0.012, 0.006, 0.035), rifle, materials["steel"],
            "support-hand traction rib", bevel=0.002,
        ))

    barrel = u.add_cylinder_between(
        f"{PREFIX}RifleBarrel", (0.540, 0.0, 1.147), (0.755, 0.0, 1.147),
        0.020, rifle, materials["steel"], "rooted faceted barrel assembly", vertices=8,
    )
    objects.append(flat_shade(tag(barrel, "rooted faceted barrel assembly")))
    muzzle = u.add_cylinder_between(
        f"{PREFIX}RifleMuzzleDevice", (0.735, 0.0, 1.147), (0.835, 0.0, 1.147),
        0.034, rifle, materials["gunmetal"], "faceted muzzle device with vented expansion chamber", vertices=8,
    )
    objects.append(flat_shade(tag(muzzle, "faceted muzzle device with vented expansion chamber")))
    for index, x in enumerate((0.760, 0.790, 0.820), 1):
        objects.append(u.add_beveled_box(
            f"{PREFIX}RifleMuzzleVent_{index}", (x, -0.033, 1.147),
            (0.014, 0.006, 0.022), rifle, materials["seam"],
            "recessed muzzle-device gas vent", bevel=0.0015,
        ))

    objects.append(u.add_beveled_box(
        f"{PREFIX}RifleTopRail", (0.125, 0.0, 1.259),
        (0.700, 0.050, 0.020), rifle, materials["steel"],
        "continuous receiver-to-handguard top rail", bevel=0.003,
    ))
    for index, x in enumerate((-0.190, -0.130, -0.070, -0.010, 0.050, 0.110, 0.170, 0.230, 0.290, 0.350, 0.410), 1):
        objects.append(u.add_beveled_box(
            f"{PREFIX}RifleRailTooth_{index}", (x, 0.0, 1.274),
            (0.027, 0.058, 0.013), rifle, materials["gunmetal"],
            "individual top-rail indexing tooth", bevel=0.0015,
        ))
    objects.append(u.add_beveled_box(
        f"{PREFIX}RifleTelemetry", (-0.065, -0.066, 1.205),
        (0.072, 0.006, 0.016), rifle, materials["cyan"],
        "restrained receiver telemetry display", bevel=0.002,
    ))
    objects.append(u.add_beveled_box(
        f"{PREFIX}RifleSafety", (-0.250, -0.067, 1.115),
        (0.025, 0.006, 0.010), rifle, materials["coral"],
        "minimal coral safety selector mark", bevel=0.0015,
    ))
    for index, (x, z) in enumerate(((-0.355, 1.205), (0.085, 1.200), (0.520, 1.180)), 1):
        objects.append(add_hex_fastener(
            f"RifleFastener_{index}", (x, -0.067, z), rifle, materials["seam"],
            "flush hexagonal rifle assembly fastener", radius=0.006, depth=0.006,
        ))

    witnesses = {
        "primary_grip": (-0.225, -0.060, 1.020),
        "support_grip": (0.330, -0.060, 1.085),
        "shoulder": (-0.716, 0.000, 1.165),
    }
    for label, location in witnesses.items():
        obj = bpy.data.objects.new(f"{PREFIX}CONTACT_{label}", None)
        obj.location = location
        obj.empty_display_type = "PLAIN_AXES"
        obj.empty_display_size = 0.035
        rifle.objects.link(obj)
        tag(obj, f"future {label.replace('_', ' ')} witness only; no contact claim")
    return [tag(obj, obj.get("kyx_role", "rifle construction")) for obj in objects], witnesses


def inventory(collections: Iterable[bpy.types.Collection]) -> dict[str, object]:
    collection_names = {collection.name for collection in collections}
    objects = [
        obj for obj in bpy.data.objects
        if any(collection.name in collection_names for collection in obj.users_collection)
    ]
    return {
        "objects": len(objects),
        "meshes": sum(obj.type == "MESH" for obj in objects),
        "empties": sum(obj.type == "EMPTY" for obj in objects),
        "materials": sorted({slot.material.name for obj in objects for slot in obj.material_slots if slot.material}),
        "collections": sorted(collection_names),
    }


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 5:
        raise SystemExit(
            "Expected -- <accepted-v6a.blend> <rev7.blend> <reference.png> "
            "<rev8.blend> <report.json>"
        )
    v6a_path, rev7_path, reference_path, output_path, report_path = (
        Path(value).resolve() for value in arguments
    )
    for path in (v6a_path, rev7_path, reference_path):
        if not path.is_file():
            raise FileNotFoundError(path)
    hashes_before = {
        "acceptedV6A": sha256(v6a_path),
        "preservedRev7": sha256(rev7_path),
        "productionTarget": sha256(reference_path),
    }
    expected = {
        "acceptedV6A": PINNED_V6A_SHA256,
        "preservedRev7": PINNED_REV7_SHA256,
        "productionTarget": PINNED_REFERENCE_SHA256,
    }
    if hashes_before != expected:
        raise RuntimeError(f"Pinned source hash mismatch: {hashes_before}")

    bpy.ops.wm.open_mainfile(filepath=str(v6a_path), load_ui=False, use_scripts=False)
    body = bpy.data.objects.get(SOURCE_BODY)
    if body is None or body.type != "MESH":
        raise RuntimeError(f"Missing accepted V6-A body: {SOURCE_BODY}")
    body_geometry_before = mesh_geometry_sha256(body)

    root = bpy.data.collections.new(f"{PREFIX}ProductionTargetConstruction")
    bpy.context.scene.collection.children.link(root)
    collections: dict[str, bpy.types.Collection] = {}
    for key, suffix in (
        ("garment", "AcceptedAnatomyGarment"),
        ("armor", "InterlockingArmorSystem"),
        ("detail", "ManufacturedSeamsFastenersVents"),
        ("rifle", "ProductionAutoRifle"),
    ):
        collection = bpy.data.collections.new(f"{PREFIX}{suffix}")
        root.children.link(collection)
        collections[key] = collection

    materials = make_materials()
    u.relink(body, collections["garment"])
    body.name = f"{PREFIX}AcceptedV6AAnatomyBody"
    body.data.name = f"{PREFIX}AcceptedV6AAnatomyBody_Mesh"
    body.data.materials.clear()
    body.data.materials.append(materials["fabric"])
    tag(body, "accepted V6-A anatomy preserved exactly as continuous charcoal woven undersuit")
    for eye in [obj for obj in bpy.data.objects if "Eye." in obj.name]:
        eye.hide_render = True
        eye.hide_viewport = True

    character_objects: list[bpy.types.Object] = [body]
    character_objects.extend(build_torso(collections["armor"], collections["detail"], materials))
    character_objects.extend(build_helmet(collections["armor"], collections["detail"], materials))
    character_objects.extend(build_limbs(collections["armor"], collections["detail"], materials))
    character_objects.extend(build_boots(collections["armor"], collections["detail"], materials))
    rifle_objects, contact_witnesses = build_rifle(collections["rifle"], materials)
    bpy.context.view_layer.update()

    body_geometry_after = mesh_geometry_sha256(body)
    if body_geometry_after != body_geometry_before:
        raise RuntimeError("Accepted V6-A body geometry changed during rev8 construction")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)

    hashes_after = {
        "acceptedV6A": sha256(v6a_path),
        "preservedRev7": sha256(rev7_path),
        "productionTarget": sha256(reference_path),
    }
    if hashes_after != hashes_before:
        raise RuntimeError("A pinned source changed during rev8 authoring")
    output_hash = sha256(output_path)
    authored_collections = list(collections.values())
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
            "preservedRev7": {
                "path": str(rev7_path), "sha256Before": hashes_before["preservedRev7"],
                "sha256After": hashes_after["preservedRev7"], "unchanged": True,
                "usedAsGeometrySource": False,
            },
            "productionTarget": {
                "path": str(reference_path), "sha256Before": hashes_before["productionTarget"],
                "sha256After": hashes_after["productionTarget"], "unchanged": True,
                "usage": "construction language only; body bulk and proportions ignored",
            },
        },
        "output": {
            "path": str(output_path), "bytes": output_path.stat().st_size,
            "sha256": output_hash,
        },
        "constructionSummary": [
            "Single front-side-back tapered cuirass foundation with interlocking angular clavicle, rib, sternum, abdomen, waist, scapular, lumbar, and back-spine plates.",
            "Recessed seams and flush hex fasteners replace floating foam patches and decorative cable arcs.",
            "Low-profile faceted closed helmet shell with complete brow, visor, jaw, temple, crown, chin, and structured occipital vent housing.",
            "Faceted fitted shoulder, upper-arm, elbow, forearm, thigh, knee, shin, ankle, and technical boot construction with woven flex zones retained.",
            "Open skeleton-stock compact rifle with stepped receiver, ejection port, separate magazine, trigger guard, support zone, vented handguard, rooted faceted barrel, muzzle device, and indexed rail.",
        ],
        "contactWitnesses": contact_witnesses,
        "inventory": inventory(authored_collections),
        "objectCounts": {
            "character": len(character_objects),
            "rifleMeshes": len(rifle_objects),
            "contactWitnesses": len(contact_witnesses),
        },
        "assertions": {
            "builtFromAcceptedV6A": True,
            "acceptedV6AFilePreserved": hashes_after["acceptedV6A"] == PINNED_V6A_SHA256,
            "acceptedV6ABodyGeometryPreservedInOutput": body_geometry_before == body_geometry_after,
            "rev7Preserved": hashes_after["preservedRev7"] == PINNED_REV7_SHA256,
            "productionTargetPinnedAndPreserved": hashes_after["productionTarget"] == PINNED_REFERENCE_SHA256,
            "rev7NotUsedAsGeometrySource": True,
            "noV6BObjects": not any("V6B" in name.upper() or "V6_B" in name.upper() for name in all_names),
            "noArmatures": len(bpy.data.armatures) == 0,
            "noActions": len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
            "contactWitnessCount": len(contact_witnesses) == 3,
            "noLiteralHeldContactClaim": True,
        },
        "status": "V6C_VISUAL_BENCHMARK_REV8_REQUIRES_DIRECT_VISUAL_AUDIT",
        "nonClaims": [
            "Revision 8 is a visual benchmark candidate; it is not V6-C or G6 acceptance.",
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
