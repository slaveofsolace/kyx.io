"""Author KYX Vanguard V6-C visual benchmark rev9 from accepted V6-A.

Rev9 is a production-form strike, not a rev8 geometry edit. It uses authored
body-sampled subdivision surfaces, nested joint shells, a wrapped compound
helmet, a coherent angular boot volume, and boolean-cut multi-depth rifle
construction. The pinned concept controls construction language only.
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


PREFIX = "KYX_V6C_BENCH_R9_"
CHECKPOINT = "V6-C_VISUAL_BENCHMARK_REV9"
SOURCE_BODY = "KYX_V6A_AnatomySculpt_Body"
PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
PINNED_REV8_SHA256 = "9f4c21b756c54f93710c5c0435326aaa321faeccd79d2524a0c5a61ed651d886"
PINNED_REFERENCE_SHA256 = "9c188fa32daaeec2d284727a5d9e600f94b8b57fee6f0568c7ebac9d462abdd2"

UTILITY_PATH = Path(__file__).with_name("author_v6b_production_sculpt_rev11.py")
SPEC = importlib.util.spec_from_file_location("kyx_rev9_surface_utilities", UTILITY_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load surface utilities: {UTILITY_PATH}")
u = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(u)
u.PREFIX = PREFIX
u.CHECKPOINT = CHECKPOINT


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <accepted-v6a.blend> <preserved-rev8.blend> "
            "<production-target.png> <rev9.blend> <report.json>"
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
        "V6-C rev9 visual benchmark only; not retopologized, rigged, exported, "
        "runtime, held-contact, V6-C accepted, or G6 accepted"
    )
    return obj


u.tag = tag


def make_dark_fabric(name: str, base_color: tuple[float, float, float, float]) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = base_color
    bsdf.inputs["Roughness"].default_value = 0.90
    specular = bsdf.inputs.get("Specular IOR Level") or bsdf.inputs.get("Specular")
    if specular is not None:
        specular.default_value = 0.08
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 240.0
    noise.inputs["Detail"].default_value = 1.7
    noise.inputs["Roughness"].default_value = 0.58
    wave = nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 310.0
    wave.inputs["Distortion"].default_value = 3.0
    mix = nodes.new("ShaderNodeMixRGB")
    mix.blend_type = "MULTIPLY"
    mix.inputs[0].default_value = 0.48
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.20
    bump.inputs["Distance"].default_value = 0.0008
    links.new(noise.outputs["Fac"], mix.inputs[1])
    links.new(wave.outputs["Color"], mix.inputs[2])
    links.new(mix.outputs["Color"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return material


def make_materials() -> dict[str, bpy.types.Material]:
    return {
        "fabric": make_dark_fabric(
            f"{PREFIX}CharcoalWovenSuit", (0.00015, 0.00030, 0.00045, 1.0),
        ),
        "flex": make_dark_fabric(
            f"{PREFIX}BlackFlexKnit", (0.00005, 0.00008, 0.00012, 1.0),
        ),
        "rubber": u.make_principled_material(
            f"{PREFIX}GripRubber", (0.00010, 0.00016, 0.00022, 1.0), roughness=0.92,
        ),
        "gunmetal": u.make_principled_material(
            f"{PREFIX}SatinGunmetal", (0.012, 0.019, 0.024, 1.0),
            metallic=0.54, roughness=0.46, coat=0.02,
        ),
        "steel": u.make_principled_material(
            f"{PREFIX}BlueBlackStructuralSteel", (0.025, 0.047, 0.060, 1.0),
            metallic=0.48, roughness=0.43,
        ),
        "pearl": u.make_principled_material(
            f"{PREFIX}WarmPearlCeramic", (0.145, 0.118, 0.078, 1.0),
            metallic=0.04, roughness=0.40, coat=0.08,
        ),
        "seam": u.make_principled_material(
            f"{PREFIX}RecessedSeam", (0.0005, 0.0010, 0.0014, 1.0), roughness=0.72,
        ),
        "visor": u.make_principled_material(
            f"{PREFIX}DeepCyanVisor", (0.0010, 0.0060, 0.0100, 1.0),
            metallic=0.10, roughness=0.22, coat=0.20,
        ),
        "cyan": u.make_emissive_material(
            f"{PREFIX}CyanTelemetry", (0.002, 0.34, 0.54, 1.0), 1.35,
        ),
        "coral": u.make_emissive_material(
            f"{PREFIX}CoralSafety", (0.48, 0.018, 0.008, 1.0), 0.75,
        ),
    }


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
    columns: int = 24,
    flatten: float = 0.20,
    thickness: float = 0.008,
    subdivision: int = 1,
    bevel: float = 0.0025,
) -> bpy.types.Object:
    """Authored quad grid projected to V6-A, with optional gentle row flattening."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, minimum_x, maximum_x in rows:
        row_points: list[Vector] = []
        for column in range(columns):
            t = column / (columns - 1)
            eased = t * t * (3.0 - 2.0 * t)
            x = minimum_x + (maximum_x - minimum_x) * eased
            hit = None
            for shrink in (1.0, 0.97, 0.94, 0.90, 0.86, 0.82, 0.76, 0.68):
                try:
                    hit = u.surface_hit(bvh, x * shrink, z, front=front, offset=offset)
                    break
                except RuntimeError:
                    continue
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
    obj = u.new_mesh_object(f"{PREFIX}{name}", vertices, faces, collection, material, role)
    u.add_modifiers(
        obj, subdivision=subdivision, solidify=thickness,
        bevel=bevel, bevel_segments=4,
    )
    rim_material = bpy.data.materials.get(f"{PREFIX}RecessedSeam")
    if rim_material is not None:
        obj.data.materials.append(rim_material)
        for modifier in obj.modifiers:
            if modifier.type == "SOLIDIFY" and hasattr(modifier, "material_offset_rim"):
                modifier.material_offset_rim = 1
    obj["surface_fit_method"] = "authored quad grid projected to accepted V6-A BVH"
    obj["row_flatten_fraction"] = flatten
    return tag(obj, role)


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
    center_direction: Vector = Vector((0.0, -1.0, 0.0)),
    thickness: float = 0.007,
    axial_steps: int = 12,
    radial_steps: int = 18,
) -> bpy.types.Object:
    obj = u.add_partial_limb_shell(
        f"{PREFIX}{name}", start, end, radii, collection, material, role,
        span_degrees=span, axial_steps=axial_steps, radial_steps=radial_steps,
        center_direction=center_direction, thickness=thickness,
    )
    return tag(obj, role)


def curved_seam(
    name: str,
    points: list[tuple[float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    radius: float = 0.0018,
) -> bpy.types.Object:
    return tag(u.add_curve(f"{PREFIX}{name}", points, radius, collection, material, role), role)


def add_box(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.004,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    return tag(u.add_beveled_box(
        f"{PREFIX}{name}", location, dimensions, collection, material, role,
        bevel=bevel, rotation=rotation,
    ), role)


def profile_volume(
    name: str,
    xz: list[tuple[float, float]],
    depth: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.006,
) -> bpy.types.Object:
    return tag(u.add_receiver_profile(
        f"{PREFIX}{name}", xz, depth, collection, material, role, bevel=bevel,
    ), role)


def axis_volume(
    name: str,
    sections: list[tuple[float, float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    exponent: float = 4.2,
    ring_steps: int = 16,
    bevel: float = 0.005,
    subdivision: int = 0,
) -> bpy.types.Object:
    """Closed multi-depth volume along X; section=(x, center_z, half_y, half_z)."""
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
    u.add_modifiers(obj, subdivision=subdivision, bevel=bevel, bevel_segments=4)
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
    front_foundation = [
        (1.055, -0.115, 0.115), (1.105, -0.148, 0.148),
        (1.180, -0.172, 0.172), (1.270, -0.198, 0.198),
        (1.355, -0.220, 0.220), (1.420, -0.205, 0.205),
        (1.463, -0.155, 0.155),
    ]
    objects.append(body_panel(
        "FrontCuirassUnderstructure", front_foundation, bvh, armor, materials["gunmetal"],
        "narrow body-conforming front cuirass understructure with continuous waist-to-clavicle load path",
        front=True, offset=0.009, columns=32, flatten=0.38, thickness=0.010, bevel=0.003,
    ))
    rear_foundation = [
        (1.050, -0.112, 0.112), (1.112, -0.150, 0.150),
        (1.200, -0.180, 0.180), (1.295, -0.205, 0.205),
        (1.380, -0.220, 0.220), (1.438, -0.190, 0.190),
        (1.462, -0.145, 0.145),
    ]
    objects.append(body_panel(
        "RearCuirassUnderstructure", rear_foundation, bvh, armor, materials["gunmetal"],
        "narrow body-conforming rear cuirass understructure joining scapulae waist and spine",
        front=False, offset=0.008, columns=32, flatten=0.18, thickness=0.009, bevel=0.003,
    ))

    # One connected clavicle mantle avoids separate breast-cup language.
    objects.append(body_panel(
        "ConnectedClavicleMantle",
        [(1.325, -0.175, 0.175), (1.372, -0.205, 0.205),
         (1.420, -0.192, 0.192), (1.452, -0.145, 0.145)],
        bvh, armor, materials["pearl"],
        "single continuous ceramic clavicle mantle mechanically nested into the dark cuirass",
        front=True, offset=0.017, columns=30, flatten=0.42, thickness=0.008, bevel=0.0025,
    ))
    for side, label in ((1.0, "R"), (-1.0, "L")):
        rib_rows = [
            (1.170, 0.052 * side, 0.145 * side),
            (1.220, 0.047 * side, 0.178 * side),
            (1.285, 0.052 * side, 0.190 * side),
            (1.325, 0.070 * side, 0.170 * side),
        ]
        rib_rows = [(z, min(a, b), max(a, b)) for z, a, b in rib_rows]
        objects.append(body_panel(
            f"NestedRibWing_{label}", rib_rows, bvh, armor, materials["steel"],
            "curved rib wing overlapping the connected mantle and central sternum keel",
            front=True, offset=0.019, columns=16, flatten=0.18,
            thickness=0.007, bevel=0.0022,
        ))
    objects.append(body_panel(
        "SternumKeel",
        [(1.110, -0.034, 0.034), (1.185, -0.042, 0.042),
         (1.280, -0.040, 0.040), (1.370, -0.034, 0.034),
         (1.444, -0.026, 0.026)],
        bvh, armor, materials["pearl"],
        "signature KYX tapered sternum keel locking mantle rib wings and abdominal flex",
        front=True, offset=0.024, columns=12, flatten=0.55,
        thickness=0.008, bevel=0.0022,
    ))
    objects.append(body_panel(
        "AbdominalArticulation",
        [(1.055, -0.090, 0.090), (1.095, -0.106, 0.106),
         (1.145, -0.116, 0.116), (1.180, -0.104, 0.104)],
        bvh, detail, materials["steel"],
        "recessed curved abdominal articulation nested below the sternum keel",
        front=True, offset=0.014, columns=20, flatten=0.20,
        thickness=0.005, bevel=0.0018,
    ))
    objects.append(body_panel(
        "RearScapularMantle",
        [(1.315, -0.172, 0.172), (1.365, -0.204, 0.204),
         (1.414, -0.190, 0.190), (1.448, -0.140, 0.140)],
        bvh, armor, materials["pearl"],
        "single curved rear scapular mantle seated inside the dark cuirass perimeter",
        front=False, offset=0.016, columns=30, flatten=0.10,
        thickness=0.008, bevel=0.0025,
    ))
    rear_spine_segments = [
        ("RearSpineUpper", [(1.335, -0.030, 0.030), (1.390, -0.034, 0.034), (1.442, -0.025, 0.025)]),
        ("RearSpineMiddle", [(1.220, -0.037, 0.037), (1.275, -0.042, 0.042), (1.327, -0.032, 0.032)]),
        ("RearSpineLower", [(1.095, -0.042, 0.042), (1.155, -0.046, 0.046), (1.210, -0.035, 0.035)]),
    ]
    for index, (name, rows) in enumerate(rear_spine_segments):
        objects.append(body_panel(
            name, rows, bvh, armor,
            materials["steel"] if index != 1 else materials["pearl"],
            "segmented curved rear load-spine plate with deliberate overlap gap",
            front=False, offset=0.020, columns=12, flatten=0.08,
            thickness=0.006, bevel=0.002,
        ))

    waist_rows = [
        (0.988, -0.112, 0.112), (1.012, -0.145, 0.145),
        (1.042, -0.158, 0.158), (1.066, -0.138, 0.138),
    ]
    objects.append(body_panel(
        "FrontWaistHarness", waist_rows, bvh, detail, materials["gunmetal"],
        "body-conforming front waist harness seated between cuirass and woven pelvis",
        front=True, offset=0.009, columns=24, flatten=0.12,
        thickness=0.006, bevel=0.002,
    ))
    objects.append(body_panel(
        "RearWaistHarness", waist_rows, bvh, detail, materials["gunmetal"],
        "body-conforming rear waist harness seated between cuirass and woven pelvis",
        front=False, offset=0.008, columns=24, flatten=0.08,
        thickness=0.006, bevel=0.002,
    ))
    objects.append(add_box(
        "WaistLock", (0.0, -0.121, 1.028), (0.050, 0.010, 0.025),
        detail, materials["pearl"], "flush waist-harness locking buckle", bevel=0.004,
    ))

    # Authored boundary seams sit in panel gaps; they are not decorative cables.
    for name, points in (
        ("LeftMantleSeam", [(-0.182, -0.142, 1.388), (-0.125, -0.166, 1.356), (-0.065, -0.172, 1.330)]),
        ("RightMantleSeam", [(0.182, -0.142, 1.388), (0.125, -0.166, 1.356), (0.065, -0.172, 1.330)]),
    ):
        objects.append(curved_seam(
            name, points, detail, materials["seam"],
            "recessed authored mantle-to-rib manufacturing seam", radius=0.0016,
        ))
    objects.append(add_box(
        "SternumTelemetry", (0.0, -0.176, 1.295), (0.012, 0.006, 0.048),
        detail, materials["cyan"], "restrained signature vertical KYX telemetry slit", bevel=0.002,
    ))
    return objects


def build_limbs(
    armor: bpy.types.Collection,
    detail: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    for side, label in ((1.0, "R"), (-1.0, "L")):
        front_outer = Vector((0.22 * side, -1.0, 0.0))
        shoulder_direction = Vector((0.0, -0.76, 0.65))
        objects.append(partial_shell(
            f"ShoulderUnderShell_{label}",
            (0.238 * side, -0.002, 1.430), (0.329 * side, -0.003, 1.340),
            (0.071, 0.054), armor, materials["steel"],
            "curved deltoid-fitted shoulder under-shell overlapping cuirass and upper arm",
            span=154.0, center_direction=shoulder_direction, thickness=0.007,
            axial_steps=12, radial_steps=18,
        ))
        objects.append(partial_shell(
            f"ShoulderCeramicCrown_{label}",
            (0.247 * side, -0.010, 1.438), (0.318 * side, -0.012, 1.365),
            (0.075, 0.057), armor, materials["pearl"],
            "nested ceramic shoulder crown leaving a visible structural steel perimeter",
            span=88.0, center_direction=shoulder_direction, thickness=0.005,
            axial_steps=10, radial_steps=16,
        ))
        objects.append(partial_shell(
            f"UpperArmBridge_{label}",
            (0.302 * side, -0.002, 1.330), (0.348 * side, -0.004, 1.145),
            (0.052, 0.042), armor, materials["gunmetal"],
            "tapered upper-arm bridge nested under shoulder and ending above elbow flex",
            span=142.0, center_direction=front_outer, thickness=0.006,
            axial_steps=12, radial_steps=18,
        ))
        objects.append(partial_shell(
            f"ElbowHingeCuff_{label}",
            (0.340 * side, -0.004, 1.115), (0.365 * side, -0.005, 1.035),
            (0.048, 0.044), armor, materials["steel"],
            "curved elbow hinge cuff with open rear flex channel",
            span=178.0, thickness=0.006, axial_steps=8, radial_steps=18,
        ))
        objects.append(partial_shell(
            f"ForearmUnderShell_{label}",
            (0.362 * side, -0.006, 1.010), (0.397 * side, -0.008, 0.790),
            (0.045, 0.036), armor, materials["steel"],
            "compound tapered forearm under-shell with elbow and wrist clearance",
            span=160.0, center_direction=front_outer, thickness=0.006,
            axial_steps=14, radial_steps=18,
        ))
        objects.append(partial_shell(
            f"ForearmCeramicDorsal_{label}",
            (0.365 * side, -0.012, 0.995), (0.394 * side, -0.014, 0.810),
            (0.047, 0.038), armor, materials["pearl"],
            "nested ceramic dorsal forearm shell with visible steel side rails",
            span=84.0, center_direction=front_outer, thickness=0.0045,
            axial_steps=12, radial_steps=16,
        ))

        thigh_direction = Vector((0.58 * side, -0.82, 0.0))
        objects.append(partial_shell(
            f"HipArmorAnchor_{label}",
            (0.157 * side, -0.004, 0.985), (0.171 * side, -0.006, 0.895),
            (0.067, 0.064), armor, materials["steel"],
            "curved hip anchor overlapping waist harness and thigh under-shell",
            span=92.0, center_direction=thigh_direction, thickness=0.005,
            axial_steps=9, radial_steps=14,
        ))
        objects.append(partial_shell(
            f"ThighUnderShell_{label}",
            (0.170 * side, -0.004, 0.915), (0.158 * side, -0.006, 0.715),
            (0.067, 0.057), armor, materials["gunmetal"],
            "curved thigh under-shell following quadriceps volume and stopping above knee flex",
            span=136.0, center_direction=thigh_direction, thickness=0.006,
            axial_steps=14, radial_steps=20,
        ))
        objects.append(partial_shell(
            f"ThighCeramicBlade_{label}",
            (0.176 * side, -0.010, 0.900), (0.160 * side, -0.012, 0.735),
            (0.070, 0.060), armor, materials["pearl"],
            "slender nested thigh ceramic blade retaining woven inner-thigh mobility",
            span=80.0, center_direction=thigh_direction, thickness=0.0045,
            axial_steps=12, radial_steps=16,
        ))
        objects.append(partial_shell(
            f"KneeHingeUnderShell_{label}",
            (0.148 * side, -0.006, 0.672), (0.151 * side, -0.008, 0.535),
            (0.058, 0.052), armor, materials["steel"],
            "curved knee hinge under-shell with side articulation clearance",
            span=176.0, thickness=0.006, axial_steps=10, radial_steps=18,
        ))
        objects.append(partial_shell(
            f"KneeCeramicCap_{label}",
            (0.149 * side, -0.014, 0.650), (0.152 * side, -0.016, 0.558),
            (0.061, 0.054), armor, materials["pearl"],
            "nested patella cap seated in the structural knee hinge",
            span=84.0, center_direction=Vector((0.0, -1.0, 0.0)),
            thickness=0.005, axial_steps=8, radial_steps=16,
        ))
        objects.append(partial_shell(
            f"ShinUnderShell_{label}",
            (0.153 * side, -0.005, 0.492), (0.169 * side, -0.005, 0.245),
            (0.052, 0.040), armor, materials["steel"],
            "compound tibia-following under-shell bridging knee and ankle interfaces",
            span=156.0, thickness=0.006, axial_steps=15, radial_steps=18,
        ))
        objects.append(partial_shell(
            f"ShinCeramicBlade_{label}",
            (0.154 * side, -0.013, 0.475), (0.168 * side, -0.014, 0.265),
            (0.054, 0.043), armor, materials["pearl"],
            "narrow nested shin ceramic blade leaving structural side rails visible",
            span=82.0, center_direction=Vector((0.0, -1.0, 0.0)),
            thickness=0.005, axial_steps=13, radial_steps=16,
        ))
        objects.append(curved_seam(
            f"ForearmPanelSeam_{label}",
            [(0.372 * side, -0.052, 0.970), (0.384 * side, -0.056, 0.900),
             (0.394 * side, -0.051, 0.830)],
            detail, materials["seam"], "recessed forearm shell manufacturing seam",
            radius=0.0015,
        ))
        objects.append(curved_seam(
            f"ShinPanelSeam_{label}",
            [(0.155 * side, -0.060, 0.450), (0.161 * side, -0.062, 0.365),
             (0.168 * side, -0.055, 0.285)],
            detail, materials["seam"], "recessed shin shell manufacturing seam",
            radius=0.0015,
        ))
        if label == "L":
            objects.append(curved_seam(
                "LeftShoulderCoralRoute",
                [(-0.250, -0.075, 1.438), (-0.286, -0.085, 1.418),
                 (-0.320, -0.070, 1.380)],
                detail, materials["coral"],
                "asymmetric KYX coral shoulder safety route integrated into ceramic crown",
                radius=0.0022,
            ))
        if label == "R":
            objects.append(add_box(
                "RightForearmTelemetry", (0.397, -0.058, 0.900),
                (0.010, 0.006, 0.050), detail, materials["cyan"],
                "asymmetric KYX forearm telemetry slit", bevel=0.002,
                rotation=(0.0, -0.12, 0.0),
            ))
    return objects


def closed_helmet_liner(
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    rings = [
        (1.515, -0.024, 0.074, 0.095),
        (1.570, -0.032, 0.096, 0.142),
        (1.650, -0.028, 0.108, 0.158),
        (1.720, -0.010, 0.105, 0.136),
        (1.770, 0.006, 0.081, 0.090),
        (1.797, 0.014, 0.034, 0.042),
    ]
    steps = 20
    exponent = 3.2
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, center_y, radius_x, radius_y in rings:
        for index in range(steps):
            angle = math.tau * index / steps
            cosine, sine = math.cos(angle), math.sin(angle)
            x = radius_x * math.copysign(abs(cosine) ** (2.0 / exponent), cosine)
            y = center_y + radius_y * math.copysign(abs(sine) ** (2.0 / exponent), sine)
            vertices.append((x, y, z))
    for ring_index in range(len(rings) - 1):
        current, following = ring_index * steps, (ring_index + 1) * steps
        for index in range(steps):
            nxt = (index + 1) % steps
            faces.append((current + index, current + nxt, following + nxt, following + index))
    faces.append(tuple(reversed(range(steps))))
    last = (len(rings) - 1) * steps
    faces.append(tuple(last + index for index in range(steps)))
    role = "compact sealed compound helmet liner enclosing accepted V6-A head and face"
    obj = u.new_mesh_object(f"{PREFIX}HelmetSealedLiner", vertices, faces, collection, material, role)
    u.add_modifiers(obj, subdivision=1, bevel=0.0025, bevel_segments=3)
    return tag(obj, role)


def compound_visor(
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    columns, rows = 25, 9
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for row in range(rows):
        v = row / (rows - 1)
        for column in range(columns):
            u_value = column / (columns - 1)
            x = -0.105 + 0.210 * u_value
            nx = x / 0.105
            top = 1.710 - 0.028 * abs(nx) ** 1.7
            bottom = 1.560 + 0.034 * abs(nx) ** 1.4
            z = bottom + (top - bottom) * v
            # Center projects forward, temples wrap rearward and lower edge tucks into jaw.
            y = -0.196 + 0.058 * abs(nx) ** 1.65 + 0.006 * (1.0 - v)
            vertices.append((x, y, z))
    for row in range(rows - 1):
        current, following = row * columns, (row + 1) * columns
        for column in range(columns - 1):
            faces.append((current + column, current + column + 1,
                          following + column + 1, following + column))
    role = "wrapped compound visor with forward center temple sweep and jaw tuck"
    obj = u.new_mesh_object(f"{PREFIX}WrappedCompoundVisor", vertices, faces, collection, material, role)
    u.add_modifiers(obj, subdivision=1, solidify=0.007, bevel=0.0022, bevel_segments=4)
    return tag(obj, role)


def helmet_surface_patch(
    name: str,
    rows: list[tuple[float, float, float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    *,
    front: bool,
    columns: int = 18,
    thickness: float = 0.007,
) -> bpy.types.Object:
    """Curved helmet patch; row=(z,min_x,max_x,center_y,radius_y)."""
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, minimum_x, maximum_x, center_y, radius_y in rows:
        radius_x = max(abs(minimum_x), abs(maximum_x)) * 1.08
        for column in range(columns):
            t = column / (columns - 1)
            eased = t * t * (3.0 - 2.0 * t)
            x = minimum_x + (maximum_x - minimum_x) * eased
            factor = math.sqrt(max(0.0, 1.0 - (x / max(radius_x, 1.0e-5)) ** 2))
            y = center_y + (-radius_y if front else radius_y) * factor
            vertices.append((x, y, z))
    for row_index in range(len(rows) - 1):
        current, following = row_index * columns, (row_index + 1) * columns
        for column in range(columns - 1):
            faces.append((current + column, current + column + 1,
                          following + column + 1, following + column))
    obj = u.new_mesh_object(f"{PREFIX}{name}", vertices, faces, collection, material, role)
    u.add_modifiers(obj, subdivision=1, solidify=thickness, bevel=0.0023, bevel_segments=4)
    return tag(obj, role)


def build_helmet(
    garment: bpy.types.Collection,
    armor: bpy.types.Collection,
    detail: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = [closed_helmet_liner(garment, materials["gunmetal"])]
    crown = u.add_helmet_sector(
        f"{PREFIX}HelmetCrownRearWrap",
        [(1.585, -0.018, 0.110, 0.144), (1.650, -0.014, 0.117, 0.149),
         (1.712, -0.003, 0.108, 0.132), (1.762, 0.008, 0.082, 0.092),
         (1.792, 0.014, 0.036, 0.044)],
        armor, materials["steel"],
        "wrapped crown rear shell with compact compound curvature and open visor aperture",
        theta_start=math.radians(-28.0), theta_end=math.radians(208.0),
        angular_steps=46, thickness=0.009,
    )
    objects.append(tag(crown, crown.get("kyx_role", "wrapped helmet crown")))
    objects.append(compound_visor(armor, materials["visor"]))
    objects.append(helmet_surface_patch(
        "HelmetCrownCeramicKeel",
        [(1.708, -0.068, 0.068, -0.010, 0.125),
         (1.748, -0.060, 0.060, 0.004, 0.094),
         (1.785, -0.034, 0.034, 0.014, 0.052)],
        armor, materials["pearl"],
        "signature KYX curved crown keel nested into structural helmet wrap",
        front=True, columns=16, thickness=0.006,
    ))
    objects.append(helmet_surface_patch(
        "HelmetOccipitalHousing",
        [(1.575, -0.070, 0.070, -0.005, 0.126),
         (1.625, -0.082, 0.082, 0.000, 0.143),
         (1.690, -0.078, 0.078, 0.004, 0.140),
         (1.728, -0.060, 0.060, 0.008, 0.116)],
        armor, materials["pearl"],
        "curved rear vent housing mechanically nested into crown and neck seal",
        front=False, columns=18, thickness=0.007,
    ))
    jaw_rows = [
        (1.520, -0.058, 0.058, -0.026, 0.128),
        (1.550, -0.075, 0.075, -0.030, 0.150),
        (1.580, -0.090, 0.090, -0.030, 0.158),
    ]
    objects.append(helmet_surface_patch(
        "HelmetJawBridge", jaw_rows, armor, materials["steel"],
        "curved lower jaw bridge closing the wrapped visor into helmet liner",
        front=True, columns=18, thickness=0.007,
    ))
    temple_profile = [
        (-0.090, 1.700), (-0.045, 1.730), (0.042, 1.710),
        (0.087, 1.650), (0.055, 1.585), (-0.034, 1.568), (-0.082, 1.612),
    ]
    for side, label in ((1.0, "R"), (-1.0, "L")):
        x_minimum, x_maximum = sorted((0.105 * side, 0.126 * side))
        temple = u.extrude_yz_profile(
            f"{PREFIX}HelmetTempleMechanism_{label}", temple_profile,
            x_minimum, x_maximum, armor, materials["gunmetal"],
            "compact layered temple mechanism joining visor crown jaw and occipital shell",
            bevel=0.004,
        )
        objects.append(tag(temple, temple.get("kyx_role", "helmet temple mechanism")))
        objects.append(add_box(
            f"HelmetTemplePivot_{label}", (0.127 * side, -0.008, 1.648),
            (0.010, 0.036, 0.036), detail, materials["pearl"],
            "flush temple pivot nested into compact mechanism", bevel=0.006,
        ))
    for index, x in enumerate((-0.038, -0.013, 0.013, 0.038), 1):
        objects.append(add_box(
            f"OccipitalVent_{index}", (x, 0.145, 1.650),
            (0.008, 0.006, 0.050), detail, materials["seam"],
            "recessed occipital cooling vent", bevel=0.0015,
        ))
    objects.append(curved_seam(
        "HelmetBrowFrame",
        [(-0.098, -0.150, 1.704), (-0.050, -0.184, 1.724),
         (0.0, -0.193, 1.728), (0.050, -0.184, 1.724), (0.098, -0.150, 1.704)],
        detail, materials["steel"], "flush compound visor brow frame",
        radius=0.0020,
    ))
    objects.append(curved_seam(
        "HelmetLowerVisorFrame",
        [(-0.088, -0.145, 1.575), (-0.050, -0.181, 1.548),
         (0.0, -0.194, 1.535), (0.050, -0.181, 1.548), (0.088, -0.145, 1.575)],
        detail, materials["gunmetal"], "flush compound lower visor and jaw frame",
        radius=0.0018,
    ))
    objects.append(add_box(
        "HelmetCyanIndex", (0.0, -0.121, 1.764), (0.027, 0.005, 0.007),
        detail, materials["cyan"], "restrained crown telemetry index", bevel=0.0015,
    ))
    objects.append(add_box(
        "HelmetCoralTick", (-0.035, -0.118, 1.778), (0.015, 0.005, 0.004),
        detail, materials["coral"], "minimal asymmetric helmet safety tick", bevel=0.001,
    ))
    cowl = u.add_elliptical_loft(
        f"{PREFIX}HelmetNeckSeal",
        [(1.432, -0.006, 0.126, 0.086), (1.462, -0.010, 0.116, 0.081),
         (1.495, -0.013, 0.098, 0.074), (1.520, -0.018, 0.085, 0.069)],
        garment, materials["flex"],
        "close woven helmet neck seal bridging armor and accepted anatomy",
        segments=64, subdivision=1, solidify=0.006,
    )
    objects.append(tag(cowl, cowl.get("kyx_role", "helmet neck seal")))
    return objects


def boot_transform(side: float, lateral: float, longitudinal: float, z: float) -> tuple[float, float, float]:
    center_x = 0.188 * side
    angle = 0.13 * side
    cosine, sine = math.cos(angle), math.sin(angle)
    return (
        center_x + lateral * cosine - longitudinal * sine,
        -0.008 + lateral * sine + longitudinal * cosine,
        z,
    )


def angular_boot_volume(
    side: float,
    label: str,
    garment: bpy.types.Collection,
    armor: bpy.types.Collection,
    detail: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    # Coherent last uses angular compound sections and a flat sole, never a sphere/capsule toe.
    sections = [
        (0.105, 0.046, 0.030, 0.116),
        (0.045, 0.058, 0.030, 0.124),
        (-0.025, 0.066, 0.029, 0.112),
        (-0.095, 0.067, 0.028, 0.088),
        (-0.158, 0.052, 0.027, 0.064),
        (-0.192, 0.028, 0.027, 0.050),
    ]
    cross = [
        (-1.0, 0.18), (-0.78, 0.86), (-0.22, 1.0), (0.22, 1.0),
        (0.78, 0.86), (1.0, 0.18), (0.82, 0.0), (-0.82, 0.0),
    ]
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for longitudinal, half_width, bottom, top in sections:
        height = top - bottom
        for lateral_factor, height_factor in cross:
            vertices.append(boot_transform(
                side, lateral_factor * half_width, longitudinal,
                bottom + height_factor * height,
            ))
    ring_steps = len(cross)
    for section_index in range(len(sections) - 1):
        current, following = section_index * ring_steps, (section_index + 1) * ring_steps
        for index in range(ring_steps):
            nxt = (index + 1) % ring_steps
            faces.append((current + index, current + nxt, following + nxt, following + index))
    faces.append(tuple(reversed(range(ring_steps))))
    last = (len(sections) - 1) * ring_steps
    faces.append(tuple(last + index for index in range(ring_steps)))
    role = "coherent angular technical boot last with flat sole tapered toe and raised heel counter"
    boot = u.new_mesh_object(f"{PREFIX}BootAngularLast_{label}", vertices, faces, garment, materials["rubber"], role)
    u.add_modifiers(boot, subdivision=0, bevel=0.003, bevel_segments=3)
    objects.append(tag(boot, role))

    outline_local = [
        (-0.044, 0.112), (0.044, 0.112), (0.061, 0.045),
        (0.070, -0.050), (0.062, -0.132), (0.036, -0.194),
        (-0.036, -0.194), (-0.062, -0.132), (-0.070, -0.050), (-0.061, 0.045),
    ]
    bottom_vertices = [boot_transform(side, x, y, 0.011) for x, y in outline_local]
    top_vertices = [boot_transform(side, x, y, 0.031) for x, y in outline_local]
    count = len(outline_local)
    sole_faces = [tuple(reversed(range(count))), tuple(range(count, count * 2))]
    for index in range(count):
        nxt = (index + 1) % count
        sole_faces.append((index, nxt, count + nxt, count + index))
    sole_role = "contoured flat technical outsole with angular heel-to-toe footprint"
    sole = u.new_mesh_object(
        f"{PREFIX}BootOutsole_{label}", bottom_vertices + top_vertices,
        sole_faces, detail, materials["rubber"], sole_role,
    )
    u.add_modifiers(sole, bevel=0.004, bevel_segments=3)
    objects.append(tag(sole, sole_role))

    # A faceted ankle upper encloses the body and overlaps the shin shell.
    ankle_sections = [
        (0.075, 0.026, 0.059, 0.057),
        (0.125, 0.020, 0.057, 0.053),
        (0.190, 0.014, 0.052, 0.047),
        (0.250, 0.010, 0.047, 0.042),
    ]
    steps = 12
    ankle_vertices: list[tuple[float, float, float]] = []
    ankle_faces: list[tuple[int, ...]] = []
    for z, center_y, radius_x, radius_y in ankle_sections:
        for index in range(steps):
            angle = math.tau * index / steps
            ankle_vertices.append(boot_transform(
                side, radius_x * math.cos(angle), center_y + radius_y * math.sin(angle), z,
            ))
    for ring_index in range(len(ankle_sections) - 1):
        current, following = ring_index * steps, (ring_index + 1) * steps
        for index in range(steps):
            nxt = (index + 1) % steps
            ankle_faces.append((current + index, current + nxt, following + nxt, following + index))
    ankle_role = "faceted ankle upper overlapping boot last and shin shell with retained hinge zone"
    ankle = u.new_mesh_object(
        f"{PREFIX}BootAnkleUpper_{label}", ankle_vertices, ankle_faces,
        garment, materials["gunmetal"], ankle_role,
    )
    u.add_modifiers(ankle, subdivision=1, solidify=0.006, bevel=0.0025, bevel_segments=3)
    objects.append(tag(ankle, ankle_role))

    # Curved dorsal armor follows the top of the last through instep and toe.
    top_sections = sections[1:]
    dorsal_vertices: list[tuple[float, float, float]] = []
    dorsal_faces: list[tuple[int, ...]] = []
    dorsal_columns = 9
    for longitudinal, half_width, _bottom, top in top_sections:
        for column in range(dorsal_columns):
            t = column / (dorsal_columns - 1)
            lateral = -0.78 * half_width + 1.56 * half_width * t
            arch = (1.0 - (lateral / max(half_width, 1.0e-5)) ** 2) * 0.010
            dorsal_vertices.append(boot_transform(side, lateral, longitudinal, top + 0.004 + arch))
    for row_index in range(len(top_sections) - 1):
        current, following = row_index * dorsal_columns, (row_index + 1) * dorsal_columns
        for column in range(dorsal_columns - 1):
            dorsal_faces.append((current + column, current + column + 1,
                                 following + column + 1, following + column))
    dorsal_role = "compound curved instep and toe ceramic shell integrated into angular technical boot"
    dorsal = u.new_mesh_object(
        f"{PREFIX}BootDorsalArmor_{label}", dorsal_vertices, dorsal_faces,
        armor, materials["pearl"], dorsal_role,
    )
    u.add_modifiers(dorsal, subdivision=1, solidify=0.006, bevel=0.0022, bevel_segments=3)
    objects.append(tag(dorsal, dorsal_role))

    heel_profile = [
        (0.065, 0.075), (0.104, 0.090), (0.092, 0.178),
        (0.054, 0.200), (0.025, 0.160), (0.028, 0.095),
    ]
    x_minimum, x_maximum = sorted((0.155 * side, 0.218 * side))
    heel = u.extrude_yz_profile(
        f"{PREFIX}BootHeelCounter_{label}", heel_profile, x_minimum, x_maximum,
        armor, materials["steel"],
        "angular heel counter mechanically joining outsole ankle upper and shin interface",
        bevel=0.004,
    )
    objects.append(tag(heel, heel.get("kyx_role", "boot heel counter")))
    objects.append(add_box(
        f"BootAnklePivot_{label}", (0.232 * side, 0.018, 0.165),
        (0.010, 0.034, 0.034), detail, materials["pearl"],
        "flush boot ankle hinge pivot", bevel=0.006,
    ))
    objects.append(add_box(
        f"BootTelemetry_{label}", (0.190 * side, -0.068, 0.117),
        (0.009, 0.006, 0.030), detail, materials["cyan"],
        "restrained boot telemetry slit", bevel=0.0018,
    ))
    return objects


def build_rifle(
    collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> tuple[list[bpy.types.Object], dict[str, tuple[float, float, float]]]:
    objects: list[bpy.types.Object] = []
    receiver = axis_volume(
        "RifleReceiverCore",
        [(-0.410, 1.170, 0.047, 0.076), (-0.320, 1.175, 0.058, 0.095),
         (-0.120, 1.172, 0.064, 0.102), (0.080, 1.170, 0.061, 0.094),
         (0.145, 1.165, 0.052, 0.078)],
        collection, materials["gunmetal"],
        "multi-depth forged receiver core with changing cross-section and rounded manufactured corners",
        exponent=4.6, ring_steps=16, bevel=0.006,
    )
    boolean_box_cut(receiver, "EjectionPocket", (-0.055, -0.056, 1.205), (0.130, 0.050, 0.043))
    boolean_box_cut(receiver, "ControlRecess", (-0.260, -0.055, 1.145), (0.070, 0.045, 0.035))
    objects.append(receiver)
    objects.append(add_box(
        "RifleEjectionInner", (-0.055, -0.047, 1.205), (0.112, 0.010, 0.028),
        collection, materials["seam"], "dark inner ejection cavity behind real receiver pocket", bevel=0.003,
    ))
    receiver_saddle = axis_volume(
        "RifleReceiverCeramicSaddle",
        [(-0.350, 1.205, 0.061, 0.035), (-0.170, 1.215, 0.069, 0.041),
         (0.055, 1.205, 0.065, 0.035)],
        collection, materials["pearl"],
        "smaller multi-depth ceramic receiver saddle leaving structural core visible",
        exponent=4.2, ring_steps=14, bevel=0.004,
    )
    objects.append(receiver_saddle)

    handguard = axis_volume(
        "RifleHandguard",
        [(0.105, 1.170, 0.059, 0.080), (0.200, 1.170, 0.062, 0.084),
         (0.420, 1.168, 0.058, 0.077), (0.565, 1.165, 0.048, 0.063),
         (0.610, 1.163, 0.040, 0.052)],
        collection, materials["steel"],
        "tapered multi-depth handguard enclosing rooted barrel and support-hand structure",
        exponent=4.5, ring_steps=16, bevel=0.005,
    )
    for index, x in enumerate((0.225, 0.315, 0.405, 0.495), 1):
        boolean_box_cut(
            handguard, f"HandguardThroughVent_{index}", (x, 0.0, 1.205),
            (0.052, 0.150, 0.025), rotation=(0.0, -0.10, 0.0),
        )
    objects.append(handguard)
    objects.append(axis_volume(
        "RifleLowerSupportRail",
        [(0.175, 1.105, 0.041, 0.022), (0.315, 1.100, 0.046, 0.026),
         (0.495, 1.103, 0.040, 0.022)],
        collection, materials["rubber"],
        "ribbed multi-depth forward support-hand purchase zone",
        exponent=4.0, ring_steps=12, bevel=0.003,
    ))
    for index, x in enumerate((0.220, 0.270, 0.320, 0.370, 0.420, 0.470), 1):
        objects.append(add_box(
            f"RifleSupportRib_{index}", (x, -0.044, 1.100),
            (0.012, 0.010, 0.034), collection, materials["steel"],
            "support-hand traction rib integrated into lower rail", bevel=0.002,
        ))

    # Open stock has true negative space and a shaped shoulder pad.
    for name, start, end, thickness in (
        ("RifleStockUpper", (-0.365, 0.0, 1.215), (-0.650, 0.0, 1.245), 0.032),
        ("RifleStockLower", (-0.360, 0.0, 1.115), (-0.638, 0.0, 1.080), 0.028),
        ("RifleStockRear", (-0.650, 0.0, 1.245), (-0.638, 0.0, 1.080), 0.030),
    ):
        objects.append(tag(u.add_strut_between(
            f"{PREFIX}{name}", start, end, 0.070, thickness,
            collection, materials["steel"],
            "open skeleton stock spar with real three-dimensional depth",
        ), "open skeleton stock spar with real three-dimensional depth"))
    butt = profile_volume(
        "RifleButtPad",
        [(-0.690, 1.255), (-0.642, 1.250), (-0.625, 1.210),
         (-0.628, 1.075), (-0.664, 1.048), (-0.700, 1.070)],
        0.084, collection, materials["rubber"],
        "angled rubber butt pad with defined shoulder seating surface", bevel=0.007,
    )
    objects.append(butt)
    objects.append(axis_volume(
        "RifleCheekRest",
        [(-0.620, 1.258, 0.044, 0.025), (-0.470, 1.250, 0.050, 0.030),
         (-0.340, 1.230, 0.048, 0.026)],
        collection, materials["pearl"],
        "tapered volumetric cheek rest nested on upper stock spar",
        exponent=4.2, ring_steps=12, bevel=0.004,
    ))

    grip = profile_volume(
        "RiflePistolGrip",
        [(-0.285, 1.105), (-0.205, 1.105), (-0.165, 0.985),
         (-0.202, 0.930), (-0.260, 0.950), (-0.305, 1.045)],
        0.078, collection, materials["rubber"],
        "ergonomic angled pistol grip with palm swell and heel", bevel=0.010,
    )
    objects.append(grip)
    magazine_well = axis_volume(
        "RifleMagazineWell",
        [(-0.075, 1.105, 0.058, 0.035), (0.045, 1.100, 0.062, 0.040)],
        collection, materials["gunmetal"],
        "distinct multi-depth magazine well mechanically joined to lower receiver",
        exponent=4.2, ring_steps=12, bevel=0.004,
    )
    objects.append(magazine_well)
    magazine = profile_volume(
        "RifleMagazine",
        [(-0.065, 1.085), (0.040, 1.082), (0.052, 0.935),
         (0.010, 0.905), (-0.078, 0.925)],
        0.070, collection, materials["steel"],
        "separate tapered magazine seated inside modeled magazine well", bevel=0.006,
    )
    objects.append(magazine)
    for index, x in enumerate((-0.045, -0.020, 0.005, 0.030), 1):
        objects.append(add_box(
            f"RifleMagazineRib_{index}", (x, -0.038, 0.975),
            (0.007, 0.006, 0.090), collection, materials["seam"],
            "recessed magazine manufacturing rib", bevel=0.0014,
        ))

    trigger_guard = curved_seam(
        "RifleTriggerGuard",
        [(-0.285, -0.035, 1.092), (-0.255, -0.045, 1.125),
         (-0.205, -0.045, 1.125), (-0.170, -0.035, 1.090)],
        collection, materials["steel"],
        "continuous trigger guard with real finger clearance", radius=0.0055,
    )
    objects.append(trigger_guard)
    objects.append(add_box(
        "RifleTrigger", (-0.226, -0.006, 1.085), (0.007, 0.026, 0.030),
        collection, materials["gunmetal"], "reachable trigger blade", bevel=0.002,
        rotation=(0.0, -0.18, 0.0),
    ))

    barrel = u.add_cylinder_between(
        f"{PREFIX}RifleBarrel", (0.545, 0.0, 1.165), (0.805, 0.0, 1.165),
        0.015, collection, materials["gunmetal"],
        "rooted faceted free-floating barrel running through handguard", vertices=16,
    )
    objects.append(tag(barrel, "rooted faceted free-floating barrel running through handguard"))
    gas_block = axis_volume(
        "RifleGasBlock",
        [(0.520, 1.165, 0.034, 0.036), (0.605, 1.165, 0.035, 0.037)],
        collection, materials["gunmetal"],
        "modeled gas block rooting barrel into handguard and muzzle assembly",
        exponent=4.0, ring_steps=12, bevel=0.003,
    )
    objects.append(gas_block)
    muzzle = u.add_cylinder_between(
        f"{PREFIX}RifleMuzzleDevice", (0.790, 0.0, 1.165), (0.885, 0.0, 1.165),
        0.027, collection, materials["steel"],
        "faceted muzzle brake with modeled expansion volume", vertices=12,
    )
    objects.append(tag(muzzle, "faceted muzzle brake with modeled expansion volume"))
    for index, x in enumerate((0.815, 0.845, 0.872), 1):
        boolean_box_cut(muzzle, f"MuzzleVent_{index}", (x, 0.0, 1.165), (0.012, 0.080, 0.012))

    objects.append(add_box(
        "RifleTopRail", (0.115, 0.0, 1.278), (0.760, 0.042, 0.018),
        collection, materials["gunmetal"],
        "continuous receiver-to-handguard top rail with manufactured width", bevel=0.004,
    ))
    for index, x in enumerate((-0.220, -0.150, -0.080, -0.010, 0.060, 0.130, 0.200, 0.270, 0.340, 0.410, 0.480), 1):
        objects.append(add_box(
            f"RifleRailIndex_{index}", (x, 0.0, 1.291),
            (0.030, 0.050, 0.010), collection, materials["steel"],
            "low-profile top rail indexing tooth", bevel=0.0015,
        ))
    objects.append(axis_volume(
        "RifleRearSight",
        [(-0.260, 1.300, 0.025, 0.026), (-0.205, 1.300, 0.025, 0.026)],
        collection, materials["gunmetal"], "folded volumetric rear sight", ring_steps=10, bevel=0.003,
    ))
    objects.append(axis_volume(
        "RifleFrontSight",
        [(0.470, 1.300, 0.023, 0.024), (0.520, 1.300, 0.023, 0.024)],
        collection, materials["gunmetal"], "folded volumetric front sight", ring_steps=10, bevel=0.003,
    ))
    objects.append(add_box(
        "RifleTelemetry", (-0.105, -0.068, 1.220), (0.060, 0.006, 0.014),
        collection, materials["cyan"], "restrained receiver telemetry aperture", bevel=0.002,
    ))
    objects.append(add_box(
        "RifleSafetyIndex", (-0.245, -0.068, 1.145), (0.020, 0.006, 0.008),
        collection, materials["coral"], "minimal coral safety selector index", bevel=0.0015,
    ))

    witnesses = {
        "primary_grip": (-0.238, -0.055, 1.020),
        "support_grip": (0.330, -0.055, 1.105),
        "shoulder": (-0.695, 0.000, 1.165),
    }
    for label, location in witnesses.items():
        witness = bpy.data.objects.new(f"{PREFIX}CONTACT_{label}", None)
        witness.location = location
        witness.empty_display_type = "PLAIN_AXES"
        witness.empty_display_size = 0.032
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
            "Expected -- <accepted-v6a.blend> <preserved-rev8.blend> "
            "<production-target.png> <rev9.blend> <report.json>"
        )
    v6a_path, rev8_path, reference_path, output_path, report_path = (
        Path(value).resolve() for value in arguments
    )
    for path in (v6a_path, rev8_path, reference_path):
        if not path.is_file():
            raise FileNotFoundError(path)
    hashes_before = {
        "acceptedV6A": sha256(v6a_path),
        "preservedRev8": sha256(rev8_path),
        "productionTarget": sha256(reference_path),
    }
    expected = {
        "acceptedV6A": PINNED_V6A_SHA256,
        "preservedRev8": PINNED_REV8_SHA256,
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
        ("garment", "ContinuousUndersuit"),
        ("armor", "BodyConformingNestedArmor"),
        ("detail", "AuthoredSeamsTelemetry"),
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
        if (0.95 < center.z < 1.08) or (0.48 < center.z < 0.70) or (0.98 < center.z < 1.14 and abs(center.x) > 0.28):
            polygon.material_index = 1
        elif center.z < 0.16 or (center.z < 0.78 and abs(center.x) > 0.30):
            polygon.material_index = 2
        else:
            polygon.material_index = 0
    tag(body, "accepted V6-A anatomy preserved as fully continuous dark woven technical undersuit")
    for eye in [obj for obj in bpy.data.objects if "Eye." in obj.name]:
        eye.hide_render = True
        eye.hide_viewport = True

    character_objects: list[bpy.types.Object] = [body]
    character_objects.extend(build_torso(body, collections["armor"], collections["detail"], materials))
    character_objects.extend(build_limbs(collections["armor"], collections["detail"], materials))
    character_objects.extend(build_helmet(collections["garment"], collections["armor"], collections["detail"], materials))
    for side, label in ((1.0, "R"), (-1.0, "L")):
        character_objects.extend(angular_boot_volume(
            side, label, collections["garment"], collections["armor"], collections["detail"], materials,
        ))
    rifle_objects, witnesses = build_rifle(collections["rifle"], materials)
    bpy.context.view_layer.update()

    body_geometry_after = mesh_geometry_sha256(body)
    if body_geometry_after != body_geometry_before:
        raise RuntimeError("Accepted V6-A body geometry changed during rev9 authoring")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)
    hashes_after = {
        "acceptedV6A": sha256(v6a_path),
        "preservedRev8": sha256(rev8_path),
        "productionTarget": sha256(reference_path),
    }
    if hashes_after != hashes_before:
        raise RuntimeError("A pinned source changed during rev9 authoring")
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
            "preservedRev8": {
                "path": str(rev8_path), "sha256Before": hashes_before["preservedRev8"],
                "sha256After": hashes_after["preservedRev8"], "unchanged": True,
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
            "torso": "Authored quad grids projected to V6-A BVH with restrained row flattening, subdivision, solid thickness, nested overlays, and continuous waist wrap.",
            "limbs": "Nested compound partial shells around anatomical axes with steel under-shells, smaller ceramic crowns/blades, and exposed woven flex zones.",
            "helmet": "Compact sealed liner, wrapped crown/rear shell, compound visor grid, curved crown/jaw/occipital patches, compact temple mechanisms, and complete neck seal.",
            "boots": "One angular compound last per foot, contoured outsole, faceted ankle upper, curved dorsal shell, heel counter, and hinge interface; no inherited rounded boot geometry.",
            "rifle": "Changing-cross-section axis volumes, real boolean vent/ejection/muzzle cutouts, open stock negative space, magazine well, rooted barrel/gas block, trigger group, support rail, and mechanical overlays.",
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
            "rev8Preserved": hashes_after["preservedRev8"] == PINNED_REV8_SHA256,
            "rev8NotUsedAsGeometrySource": True,
            "productionTargetPinnedAndPreserved": hashes_after["productionTarget"] == PINNED_REFERENCE_SHA256,
            "noV6BObjects": not any("V6B" in name.upper() or "V6_B" in name.upper() for name in all_names),
            "noArmatures": len(bpy.data.armatures) == 0,
            "noActions": len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
            "contactWitnessCount": len(witnesses) == 3,
            "noLiteralHeldContactClaim": True,
        },
        "status": "V6C_VISUAL_BENCHMARK_REV9_REQUIRES_DIRECT_VISUAL_AUDIT",
        "nonClaims": [
            "Revision 9 is a visual benchmark candidate; it is not V6-C or G6 acceptance.",
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
