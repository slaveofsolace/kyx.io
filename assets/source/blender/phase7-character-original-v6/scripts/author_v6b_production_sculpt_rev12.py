"""Author KYX Vanguard V6-B production-sculpt construction revision 12.

Revision 12 preserves the complete rev11 failure packet and changes the visible
silhouette grammar: one coherent thoracic bib, fitted projected limb shields,
a closed lower helmet, body-close waist treatment, hidden head/foot underlayer,
and corrected rifle control proportions.  It remains a V6-B visual checkpoint.
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


PREFIX = "KYX_V6B_PROD_R12_"
CHECKPOINT = "V6-B_PRODUCTION_SCULPT_REV12"
PINNED_V6A_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
SOURCE_BODY = "KYX_V6A_AnatomySculpt_Body"

BASE_PATH = Path(__file__).with_name("author_v6b_production_sculpt_rev11.py")
SPEC = importlib.util.spec_from_file_location("kyx_v6b_rev11_construction_library", BASE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Cannot load construction library: {BASE_PATH}")
base = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base)
base.PREFIX = PREFIX
base.CHECKPOINT = CHECKPOINT


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <accepted-v6a.blend> <rev12.blend> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def make_hidden_material(name: str) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    output = nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(transparent.outputs["BSDF"], output.inputs["Surface"])
    if hasattr(material, "surface_render_method"):
        material.surface_render_method = "DITHERED"
    return material


def make_dark_fabric(name: str) -> bpy.types.Material:
    material = base.make_fabric_material(name)
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.0035, 0.0065, 0.010, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.76
    return material


def robust_surface_hit(
    bvh,
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
        guess = Vector((x, -0.07 if front else 0.06, z))
        location, normal, _index, _distance = bvh.find_nearest(guess, 0.16)
    if location is None or normal is None:
        raise RuntimeError(f"No body projection at x={x:.4f}, z={z:.4f}, front={front}")
    return location + normal.normalized() * offset


base.surface_hit = robust_surface_hit


def add_shoulder_saddle(
    side: float,
    label: str,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    role: str,
    radial_offset: float = 0.0,
) -> bpy.types.Object:
    across_steps = 17
    outward_steps = 11
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for outward_index in range(outward_steps):
        v = outward_index / (outward_steps - 1)
        eased = v * v * (3.0 - 2.0 * v)
        abs_x = 0.232 + 0.104 * eased + radial_offset
        center_z = 1.422 - 0.085 * eased
        half_depth = 0.072 - 0.010 * eased
        for across_index in range(across_steps):
            u = -1.0 + 2.0 * across_index / (across_steps - 1)
            y = -0.003 + half_depth * u
            z = center_z + 0.026 * (1.0 - u * u) - 0.007 * u
            x = side * (abs_x + 0.007 * (1.0 - u * u))
            vertices.append((x, y, z))
    for outward_index in range(outward_steps - 1):
        current = outward_index * across_steps
        following = (outward_index + 1) * across_steps
        for across_index in range(across_steps - 1):
            faces.append((current + across_index, current + across_index + 1,
                          following + across_index + 1, following + across_index))
    obj = base.new_mesh_object(
        f"{PREFIX}ShoulderSaddle_{label}", vertices, faces, collection, material, role,
    )
    base.add_modifiers(obj, subdivision=1, solidify=0.009, bevel=0.0035, bevel_segments=4)
    return obj


def add_closed_helmet_crown(
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    rings = [
        (1.580, -0.004, 0.108, 0.112),
        (1.638, -0.004, 0.116, 0.118),
        (1.700, -0.001, 0.108, 0.109),
        (1.748, 0.003, 0.077, 0.074),
        (1.774, 0.004, 0.028, 0.026),
    ]
    angular_steps = 39
    start = math.radians(-22.0)
    end = math.radians(202.0)
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for z, center_y, radius_x, radius_y in rings:
        for index in range(angular_steps):
            t = index / (angular_steps - 1)
            theta = start + (end - start) * t
            vertices.append((radius_x * math.cos(theta), center_y + radius_y * math.sin(theta), z))
    for ring in range(len(rings) - 1):
        current = ring * angular_steps
        following = (ring + 1) * angular_steps
        for index in range(angular_steps - 1):
            faces.append((current + index, current + index + 1, following + index + 1, following + index))
    top = (len(rings) - 1) * angular_steps
    faces.append(tuple(top + index for index in range(angular_steps)))
    obj = base.new_mesh_object(
        f"{PREFIX}HelmetCrownRear", vertices, faces, collection, material,
        "closed low-profile open-face crown and rear shell with angular brow edge",
    )
    base.add_modifiers(obj, subdivision=1, solidify=0.011, bevel=0.003, bevel_segments=4)
    return obj


def add_visor(collection: bpy.types.Collection, material: bpy.types.Material) -> bpy.types.Object:
    columns = 19
    rows = 6
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    for row in range(rows):
        v = row / (rows - 1)
        for column in range(columns):
            u = column / (columns - 1)
            x = -0.089 + 0.178 * u
            normalized_x = x / 0.089
            top = 1.704 - 0.022 * abs(normalized_x) ** 1.7
            bottom = 1.584 + 0.020 * abs(normalized_x) ** 1.4
            z = bottom + (top - bottom) * v
            y = -0.148 - 0.025 * (1.0 - normalized_x * normalized_x) - 0.004 * (1.0 - v)
            vertices.append((x, y, z))
    for row in range(rows - 1):
        current = row * columns
        following = (row + 1) * columns
        for column in range(columns - 1):
            faces.append((current + column, current + column + 1,
                          following + column + 1, following + column))
    obj = base.new_mesh_object(
        f"{PREFIX}Visor", vertices, faces, collection, material,
        "lower compound-curved visor seated between crown and cheek rails",
    )
    base.add_modifiers(obj, subdivision=1, solidify=0.007, bevel=0.0025, bevel_segments=4)
    return obj


def postprocess_boot(objects: list[bpy.types.Object], label: str) -> None:
    shaft = bpy.data.objects.get(f"{PREFIX}BootShaft_{label}")
    if shaft is not None:
        shaft.scale.x = 0.88
        shaft.scale.y = 0.86
        shaft.scale.z = 0.88
    toe = bpy.data.objects.get(f"{PREFIX}BootToeBridge_{label}")
    if toe is not None:
        toe.scale.x = 0.86
        toe.scale.y = 0.91


def build_character(
    body: bpy.types.Object,
    collections: dict[str, bpy.types.Collection],
    materials: dict[str, bpy.types.Material],
) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    garment = collections["garment"]
    armor = collections["armor"]
    detail = collections["detail"]
    bvh = base.make_body_bvh(body)

    body.name = f"{PREFIX}ContinuousTechnicalGarment"
    body.data.name = f"{PREFIX}ContinuousTechnicalGarment_Mesh"
    body.data.materials.clear()
    for material in (materials["fabric"], materials["flex"], materials["glove"], materials["hidden"]):
        body.data.materials.append(material)
    for polygon in body.data.polygons:
        center = polygon.center
        if center.z < 0.145 or center.z > 1.505:
            polygon.material_index = 3
        elif abs(center.x) > 0.355 and center.z < 0.94:
            polygon.material_index = 2
        elif (1.03 < center.z < 1.22 and abs(center.x) < 0.20) or (0.49 < center.z < 0.64):
            polygon.material_index = 1
        else:
            polygon.material_index = 0
    base.tag(body, "accepted V6-A anatomy as one continuous dark technical garment; head and feet hidden under authored equipment")
    body["accepted_v6a_sha256"] = PINNED_V6A_SHA256
    objects.append(body)
    for obj in bpy.context.scene.objects:
        if obj.name.startswith("KYX_V6A_AnatomySculpt_Eye"):
            obj.hide_render = True
            obj.hide_viewport = True

    objects.append(base.add_body_fitted_strip(
        f"{PREFIX}ThoracicBib",
        [(1.212, -0.094, 0.094), (1.248, -0.128, 0.128), (1.300, -0.150, 0.150),
         (1.360, -0.200, 0.200), (1.410, -0.190, 0.190), (1.437, -0.148, 0.148)],
        bvh, armor, materials["ivory"],
        "single coherent continuous-curvature ceramic thoracic bib with central articulation seam",
        front=True, offset=0.009, columns=30, thickness=0.010, bevel=0.0032,
    ))
    objects.append(base.add_body_fitted_strip(
        f"{PREFIX}BackYoke",
        [(1.212, -0.115, 0.115), (1.260, -0.134, 0.134), (1.325, -0.164, 0.164),
         (1.390, -0.190, 0.190), (1.430, -0.145, 0.145)],
        bvh, armor, materials["ivory"], "single body-close back yoke with waist and shoulder gaps",
        front=False, offset=0.008, columns=28, thickness=0.009, bevel=0.003,
    ))
    objects.append(base.add_body_fitted_strip(
        f"{PREFIX}AbdominalFlex",
        [(1.075, -0.100, 0.100), (1.115, -0.110, 0.110),
         (1.165, -0.115, 0.115), (1.202, -0.100, 0.100)],
        bvh, detail, materials["flex"], "integrated flexible abdominal articulation surface",
        front=True, offset=0.0035, columns=24, thickness=0.003, bevel=0.0012,
    ))

    objects.append(base.add_elliptical_loft(
        f"{PREFIX}FittedWaistHarness",
        [(1.010, -0.004, 0.174, 0.091), (1.035, -0.004, 0.177, 0.093),
         (1.058, -0.004, 0.174, 0.090)],
        detail, materials["dark_metal"], "body-close low-profile continuous waist harness",
        segments=72, subdivision=1, solidify=0.005,
    ))
    objects.append(base.add_beveled_box(
        f"{PREFIX}HarnessIndex", (0.0, -0.100, 1.034), (0.040, 0.010, 0.021),
        detail, materials["red"], "restrained waist identity index", bevel=0.004,
    ))

    for side, label in ((1.0, "L"), (-1.0, "R")):
        objects.append(add_shoulder_saddle(
            side, label, armor, materials["ivory"],
            role="fitted deltoid saddle with manufactured curvature and open arm clearance",
        ))
        if label == "L":
            route = add_shoulder_saddle(
                side, f"{label}_Route", detail, materials["red"],
                role="integrated asymmetric shoulder identity route", radial_offset=0.006,
            )
            route.scale.y = 0.34
            route.location.y = -0.044
            objects.append(route)

        forearm = [
            (1.120, 0.320, 0.350), (1.075, 0.337, 0.373),
            (1.020, 0.356, 0.398), (0.965, 0.375, 0.414),
        ]
        thigh = [(0.875, 0.132, 0.205), (0.830, 0.126, 0.206),
                 (0.775, 0.124, 0.200), (0.724, 0.130, 0.190)]
        knee = [(0.620, 0.108, 0.180), (0.585, 0.101, 0.188),
                (0.548, 0.105, 0.184), (0.522, 0.115, 0.174)]
        shin = [(0.468, 0.112, 0.187), (0.410, 0.116, 0.190),
                (0.340, 0.125, 0.194), (0.270, 0.135, 0.194)]
        for suffix, rows, thickness, role in (
            ("ForearmShield", forearm, 0.006, "body-projected tapered forearm shield with elbow and wrist gaps"),
            ("LateralThighShield", thigh, 0.006, "body-projected slim lateral-front thigh shield"),
            ("KneeShell", knee, 0.007, "body-projected patella shell with open flex zone"),
            ("ShinShield", shin, 0.007, "body-projected tapered tibia shield with ankle clearance"),
        ):
            mirrored = rows if side > 0.0 else [(z, -maximum, -minimum) for z, minimum, maximum in rows]
            objects.append(base.add_body_fitted_strip(
                f"{PREFIX}{suffix}_{label}", mirrored, bvh, armor, materials["ivory"], role,
                front=True, offset=0.007, columns=12, thickness=thickness, bevel=0.0025,
            ))

        boot_objects = base.add_boot_last(side, label, garment, detail, materials)
        postprocess_boot(boot_objects, label)
        objects.extend(boot_objects)

    # Helmet under-volume is dark and compact; the accepted head is hidden.
    objects.append(base.add_elliptical_loft(
        f"{PREFIX}HelmetInner",
        [(1.512, -0.004, 0.076, 0.068), (1.565, -0.008, 0.098, 0.089),
         (1.630, -0.010, 0.110, 0.108), (1.695, -0.004, 0.106, 0.108),
         (1.744, 0.000, 0.078, 0.075), (1.772, 0.002, 0.024, 0.022)],
        garment, materials["helmet_inner"], "compact sealed helmet under-volume",
        segments=72, subdivision=1, solidify=0.004,
    ))
    objects.append(add_closed_helmet_crown(armor, materials["ivory"]))
    objects.append(add_visor(armor, materials["visor"]))
    cheek_profile = [
        (-0.140, 1.690), (-0.104, 1.716), (-0.010, 1.700),
        (0.035, 1.642), (0.010, 1.592), (-0.116, 1.570), (-0.154, 1.612),
    ]
    for side, label in ((1.0, "L"), (-1.0, "R")):
        x_minimum, x_maximum = (0.080, 0.105) if side > 0.0 else (-0.105, -0.080)
        objects.append(base.extrude_yz_profile(
            f"{PREFIX}HelmetCheekRail_{label}", cheek_profile, x_minimum, x_maximum,
            armor, materials["ivory"], "slender structural cheek rail joining visor and crown", bevel=0.0045,
        ))
        objects.append(base.add_beveled_box(
            f"{PREFIX}HelmetPivot_{label}", (0.105 * side, -0.004, 1.652),
            (0.014, 0.037, 0.041), detail, materials["dark_metal"],
            "recessed visor pivot volume", bevel=0.006,
        ))
    objects.append(base.add_curve(
        f"{PREFIX}HelmetBrowIndex",
        [(-0.078, -0.151, 1.702), (-0.036, -0.168, 1.716),
         (0.026, -0.168, 1.714), (0.078, -0.150, 1.698)],
        0.0028, detail, materials["red"], "restrained integrated brow seal",
    ))
    objects.append(base.add_elliptical_loft(
        f"{PREFIX}CloseCowl",
        [(1.425, -0.003, 0.124, 0.086), (1.454, -0.007, 0.116, 0.082),
         (1.482, -0.008, 0.105, 0.077), (1.510, -0.006, 0.094, 0.070)],
        garment, materials["fabric"], "close technical-fabric neck seal without mantle volume",
        segments=72, subdivision=1, solidify=0.006,
    ))

    objects.append(base.add_beveled_box(
        f"{PREFIX}ChestReadout", (0.136, -0.151, 1.337), (0.032, 0.008, 0.011),
        detail, materials["cyan"], "embedded chest status readout", bevel=0.003,
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

    objects.append(base.add_receiver_profile(
        f"{PREFIX}RifleReceiver",
        [(-0.238, 1.142), (0.112, 1.142), (0.155, 1.178), (0.135, 1.245),
         (-0.155, 1.262), (-0.232, 1.214)],
        0.112, collection, dark, "deep forged receiver with softened chamfer hierarchy", bevel=0.012,
    ))
    objects.append(base.add_receiver_profile(
        f"{PREFIX}RifleReceiverSaddle",
        [(-0.164, 1.201), (0.072, 1.202), (0.106, 1.231),
         (-0.126, 1.242), (-0.188, 1.222)],
        0.121, collection, ivory, "smaller ceramic receiver saddle exposing structural receiver", bevel=0.007,
    ))
    objects.append(base.add_superellipse_axis_loft(
        f"{PREFIX}RifleHandguardCore",
        [(0.100, 1.200, 0.050, 0.062), (0.205, 1.200, 0.052, 0.064),
         (0.450, 1.200, 0.049, 0.058), (0.575, 1.200, 0.040, 0.047)],
        collection, dark, "continuous graphite handguard core with real transverse volume",
        exponent=4.0, ring_steps=28, bevel=0.004,
    ))
    # Ivory upper/lower rails break the loaf silhouette without becoming side slabs.
    objects.append(base.add_beveled_box(
        f"{PREFIX}RifleHandguardUpperShell", (0.335, 0.0, 1.251),
        (0.455, 0.094, 0.028), collection, ivory,
        "narrow ceramic upper handguard bridge", bevel=0.010,
    ))
    objects.append(base.add_beveled_box(
        f"{PREFIX}RifleHandguardLowerShell", (0.345, 0.0, 1.151),
        (0.400, 0.088, 0.024), collection, ivory,
        "narrow ceramic lower handguard bridge", bevel=0.009,
    ))

    objects.append(base.add_strut_between(
        f"{PREFIX}RifleStockUpper", (-0.205, 0.0, 1.235), (-0.478, 0.0, 1.282),
        0.070, 0.030, collection, dark, "upper skeleton-stock spar with real depth",
    ))
    objects.append(base.add_strut_between(
        f"{PREFIX}RifleStockLower", (-0.205, 0.0, 1.165), (-0.462, 0.0, 1.132),
        0.070, 0.028, collection, dark, "lower skeleton-stock spar forming negative space",
    ))
    objects.append(base.add_strut_between(
        f"{PREFIX}RifleStockRear", (-0.478, 0.0, 1.282), (-0.462, 0.0, 1.132),
        0.072, 0.030, collection, black, "continuous rear stock bridge",
    ))
    objects.append(base.add_beveled_box(
        f"{PREFIX}RifleButtPad", (-0.491, 0.0, 1.205), (0.026, 0.090, 0.160),
        collection, black, "broad rubber shoulder pad", bevel=0.012,
    ))

    objects.append(base.add_beveled_box(
        f"{PREFIX}RiflePistolGrip", (-0.105, 0.0, 1.070), (0.058, 0.070, 0.155),
        collection, black, "distinct swept pistol grip with palm-filling depth",
        bevel=0.013, rotation=(0.0, -0.22, 0.0),
    ))
    objects.append(base.add_receiver_profile(
        f"{PREFIX}RifleMagazine",
        [(-0.010, 1.145), (0.083, 1.145), (0.064, 0.945),
         (-0.002, 0.912), (-0.032, 0.972)],
        0.060, collection, dark, "long curved removable magazine distinct from pistol grip", bevel=0.008,
    ))

    objects.append(base.add_cylinder_between(
        f"{PREFIX}RifleBarrel", (0.545, 0.0, 1.200), (0.835, 0.0, 1.200),
        0.014, collection, dark, "free-floating barrel", vertices=40,
    ))
    objects.append(base.add_cylinder_between(
        f"{PREFIX}RifleMuzzle", (0.817, 0.0, 1.200), (0.905, 0.0, 1.200),
        0.023, collection, dark, "faceted muzzle device", vertices=40,
    ))
    objects.append(base.add_cylinder_between(
        f"{PREFIX}RifleGasBlock", (0.500, 0.0, 1.200), (0.605, 0.0, 1.200),
        0.026, collection, dark, "recessed barrel support and gas block", vertices=36,
    ))
    objects.append(base.add_beveled_box(
        f"{PREFIX}RifleTopRail", (0.165, 0.0, 1.286), (0.560, 0.038, 0.018),
        collection, dark, "continuous transverse-width top rail", bevel=0.004,
    ))
    objects.append(base.add_beveled_box(
        f"{PREFIX}RifleBottomRail", (0.342, 0.0, 1.120), (0.280, 0.036, 0.017),
        collection, dark, "recessed lower rail", bevel=0.004,
    ))
    objects.append(base.add_beveled_box(
        f"{PREFIX}RifleSupportGrip", (0.340, 0.0, 1.071), (0.050, 0.066, 0.108),
        collection, black, "reachable short support grip with palm depth",
        bevel=0.012, rotation=(0.0, -0.13, 0.0),
    ))

    # Vent recesses sit flush inside the dark core rather than floating on ivory.
    for side, side_label in ((-1.0, "Near"), (1.0, "Far")):
        for index, x in enumerate((0.220, 0.305, 0.390, 0.475)):
            objects.append(base.add_beveled_box(
                f"{PREFIX}RifleVent_{side_label}_{index + 1}",
                (x, 0.049 * side, 1.203), (0.045, 0.007, 0.016), collection, black,
                "flush deep handguard vent recess", bevel=0.003,
            ))
    objects.append(base.add_beveled_box(
        f"{PREFIX}RifleEjectionPort", (0.012, -0.060, 1.211), (0.086, 0.008, 0.030),
        collection, black, "recessed ejection port", bevel=0.004,
    ))
    objects.append(base.add_beveled_box(
        f"{PREFIX}RifleChargingHandle", (-0.146, 0.0, 1.278), (0.066, 0.078, 0.018),
        collection, dark, "ambidextrous charging handle", bevel=0.005,
    ))
    objects.append(base.add_curve(
        f"{PREFIX}RifleTriggerGuard",
        [(-0.143, -0.037, 1.146), (-0.108, -0.045, 1.180), (-0.055, -0.037, 1.145)],
        0.0055, collection, dark, "trigger guard with literal finger opening",
    ))
    objects.append(base.add_beveled_box(
        f"{PREFIX}RifleTrigger", (-0.102, -0.005, 1.149), (0.007, 0.030, 0.030),
        collection, dark, "trigger blade", bevel=0.0025,
    ))
    for name, x in (("RearSight", -0.105), ("FrontSight", 0.505)):
        objects.append(base.add_beveled_box(
            f"{PREFIX}Rifle{name}", (x, 0.0, 1.316), (0.030, 0.042, 0.050),
            collection, dark, f"folded {name.lower()}", bevel=0.006,
        ))
    objects.append(base.add_beveled_box(
        f"{PREFIX}RifleRedIndex", (0.108, -0.061, 1.246), (0.064, 0.008, 0.011),
        collection, materials["red"], "restrained rifle identity index", bevel=0.003,
    ))
    objects.append(base.add_beveled_box(
        f"{PREFIX}RifleStatus", (-0.052, -0.061, 1.245), (0.044, 0.008, 0.014),
        collection, materials["cyan"], "embedded rifle status readout", bevel=0.003,
    ))
    for label, location in {
        "trigger": (-0.103, -0.074, 1.123),
        "support": (0.340, -0.075, 1.150),
        "shoulder": (-0.492, 0.0, 1.205),
    }.items():
        witness = bpy.data.objects.new(f"{PREFIX}CONTACT_{label}", None)
        witness.location = location
        witness.empty_display_type = "SPHERE"
        witness.empty_display_size = 0.014
        witness.hide_render = True
        collection.objects.link(witness)
        base.tag(witness, "future rigged literal-contact witness; not contact proof")
    return objects


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 3:
        raise SystemExit("Expected -- <accepted-v6a.blend> <rev12.blend> <report.json>")
    input_path, output_path, report_path = (Path(value).resolve() for value in arguments)
    input_hash_before = sha256(input_path)
    if input_hash_before != PINNED_V6A_SHA256:
        raise RuntimeError(f"Pinned V6-A hash mismatch: {input_hash_before}")

    bpy.ops.wm.open_mainfile(filepath=str(input_path), load_ui=False, use_scripts=False)
    body = bpy.data.objects.get(SOURCE_BODY)
    if body is None:
        raise RuntimeError(f"Missing accepted body: {SOURCE_BODY}")

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
        "fabric": make_dark_fabric(f"{PREFIX}WovenTechnicalCharcoal"),
        "flex": base.make_principled_material(f"{PREFIX}FlexKnit", (0.008, 0.014, 0.021, 1.0), roughness=0.82),
        "glove": base.make_principled_material(f"{PREFIX}GripRubber", (0.0025, 0.0045, 0.0065, 1.0), roughness=0.64),
        "hidden": make_hidden_material(f"{PREFIX}HiddenUnderEquipment"),
        "boot": base.make_principled_material(f"{PREFIX}BootComposite", (0.006, 0.011, 0.016, 1.0), roughness=0.56),
        "rubber": base.make_principled_material(f"{PREFIX}OutsoleRubber", (0.0015, 0.0025, 0.0035, 1.0), roughness=0.80),
        "ivory": base.make_principled_material(f"{PREFIX}IvoryCeramic", (0.54, 0.50, 0.41, 1.0), roughness=0.38, coat=0.06),
        "dark_metal": base.make_principled_material(f"{PREFIX}GraphiteMetal", (0.012, 0.023, 0.033, 1.0), metallic=0.54, roughness=0.32),
        "red": base.make_principled_material(f"{PREFIX}SignalRed", (0.40, 0.010, 0.006, 1.0), metallic=0.12, roughness=0.38, coat=0.05),
        "cyan": base.make_emissive_material(f"{PREFIX}CyanReadout", (0.005, 0.38, 0.56, 1.0), 1.5),
        "visor": base.make_visor_material(f"{PREFIX}VisorGlass"),
        "helmet_inner": base.make_principled_material(f"{PREFIX}HelmetInner", (0.003, 0.010, 0.017, 1.0), metallic=0.22, roughness=0.30),
    }

    base.relink(body, collections["garment"])
    character_objects = build_character(body, collections, materials)
    rifle_objects = build_rifle(collections["rifle"], materials)
    bpy.context.view_layer.update()

    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)
    input_hash_after = sha256(input_path)
    if input_hash_after != input_hash_before:
        raise RuntimeError("Accepted V6-A input changed during rev12 authoring")
    output_hash = sha256(output_path)
    authored_collections = [collections[key] for key in ("garment", "armor", "detail", "rifle")]
    report = {
        "schemaVersion": 1,
        "authoredUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "input": {"path": input_path.name, "sha256Before": input_hash_before,
                  "sha256After": input_hash_after, "unchanged": input_hash_before == input_hash_after},
        "output": {"path": output_path.name, "bytes": output_path.stat().st_size, "sha256": output_hash},
        "changesFromRev11": [
            "Replaced split breast-like plates with one body-projected thoracic bib.",
            "Replaced horn-like partial cylinders with compact authored shoulder saddles.",
            "Replaced rectangular limb lofts with clean body-projected tapered shields.",
            "Hid source head and feet beneath authored helmet/boot volumes.",
            "Closed and lowered helmet crown; narrowed visor and structural cheek rails.",
            "Pulled waist harness against body and reduced cowl volume.",
            "Separated rifle pistol-grip and magazine silhouettes and exposed a dark volumetric handguard core.",
        ],
        "inventory": base.inventory(authored_collections),
        "objectCounts": {"character": len(character_objects), "rifleAndWitnesses": len(rifle_objects)},
        "assertions": {
            "acceptedV6APinned": input_hash_before == PINNED_V6A_SHA256,
            "acceptedV6AUnchanged": input_hash_before == input_hash_after,
            "outputDiffersFromInput": output_hash != input_hash_before,
            "noArmatures": len(bpy.data.armatures) == 0,
            "noActions": len(bpy.data.actions) == 0,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
        },
        "status": "V6B_PRODUCTION_SCULPT_REV12_REQUIRES_DIRECT_VISUAL_AUDIT",
        "nonClaims": [
            "Revision 12 is a V6-B visual construction candidate only; it is not G6.",
            "Rifle contact remains open until a defensible rigged pose exists.",
            "No final retopology, UV, texture bake, rig, animation, LOD, GLB, runtime, or performance claim is made.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "outputSha256": output_hash,
                      "objects": report["inventory"]["objects"]}, sort_keys=True))


if __name__ == "__main__":
    main()
