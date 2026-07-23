"""Author the first bounded V6-B production/contact visual candidate.

This lane starts only from the sealed rev11b contact-rig Blend.  It preserves
the accepted continuous body topology, 52-bone rig, vertex weights, pose, and
literal weapon-contact fixtures.  Project-authored technical-suit materials,
fitted armor, helmet, boots, and a production-readable rifle shell are layered
around that foundation.  No G6 or final human visual acceptance is claimed.

Run with Blender 5.1.2:
  blender --background --factory-startup --disable-autoexec \
    --python author_v6b_production_contact_candidate_rev1.py -- \
    <sealed-rev11b.blend> <candidate.blend> <author-report.json>
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector


SEALED_REV11B_SHA256 = "029ce233dca6ed2119ac0810e07e4392090f0866dde78da04bed390d9a3e0ec0"
BODY_NAME = "KYX_V6A_AnatomySculpt_Body"
RIG_NAME = "V6CF11B_ContactFullBodyRig"
CONTACT_PREFIX = "V6CF11B_"
PREFIX = "KYX_V6B_CF_R1_"
CHECKPOINT = "V6-B_PRODUCTION_CONTACT_CANDIDATE_REV1"

FORWARD = Vector((0.220107, -0.975476, 0.0))
RIGHT = Vector((0.975476, 0.220107, 0.0))
UP = Vector((0.0, 0.0, 1.0))
GRIP = Vector((-0.113465, -0.432030, 1.165))
TRIGGER = Vector((-0.1600969, -0.3991525, 1.1988127))
FOREGRIP = Vector((-0.048834, -0.627599, 1.190))
STOCK_PAD = Vector((-0.175315, -0.157921, 1.365))


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <sealed-rev11b.blend> <candidate.blend> <report.json>")
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
    digest.update(struct.pack("<III", len(mesh.vertices), len(mesh.edges), len(mesh.polygons)))
    for vertex in mesh.vertices:
        digest.update(struct.pack("<3f", *vertex.co))
    for edge in mesh.edges:
        digest.update(struct.pack("<2I", *edge.vertices))
    for polygon in mesh.polygons:
        digest.update(struct.pack("<I", polygon.loop_total))
        digest.update(struct.pack(f"<{polygon.loop_total}I", *polygon.vertices))
    return digest.hexdigest()


def rounded(vector: Vector, digits: int = 6) -> list[float]:
    return [round(float(value), digits) for value in vector]


def make_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.new(PREFIX + name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def link_only(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def tag(obj: bpy.types.Object, role: str, tier: str, bone: str | None = None) -> bpy.types.Object:
    obj["kyx_checkpoint"] = CHECKPOINT
    obj["kyx_role"] = role
    obj["kyx_detail_tier"] = tier
    obj["kyx_deformation_policy"] = f"rigid bone parent: {bone}" if bone else "static authored component"
    return obj


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
        noise.inputs["Detail"].default_value = 4.0
        noise.inputs["Roughness"].default_value = 0.70
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = bump_strength
        bump.inputs["Distance"].default_value = 0.0014 if metallic < 0.35 else 0.0007
        links.new(noise.outputs["Fac"], bump.inputs["Height"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        ramp = nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.25
        ramp.color_ramp.elements[0].color = (roughness * 0.62,) * 3 + (1.0,)
        ramp.color_ramp.elements[1].position = 0.78
        ramp.color_ramp.elements[1].color = (min(1.0, roughness * 1.25),) * 3 + (1.0,)
        links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        links.new(ramp.outputs["Color"], bsdf.inputs["Roughness"])
    links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
    mat.diffuse_color = base_color
    return mat


def make_materials() -> dict[str, bpy.types.Material]:
    return {
        "suit": material("GraphiteTailoredWeave", (0.005, 0.009, 0.014, 1.0), 0.04, 0.67, noise_scale=185.0, bump_strength=0.24),
        "flex": material("BlackJointKnit", (0.001, 0.002, 0.004, 1.0), 0.01, 0.80, noise_scale=110.0, bump_strength=0.20),
        "glove": material("TactileGloveRubber", (0.003, 0.004, 0.006, 1.0), 0.02, 0.53, noise_scale=95.0, bump_strength=0.14),
        "boot": material("BootCompositeUpper", (0.008, 0.011, 0.014, 1.0), 0.10, 0.56, noise_scale=72.0, bump_strength=0.13),
        "ceramic": material("WeatheredBoneCeramic", (0.34, 0.285, 0.20, 1.0), 0.22, 0.36, noise_scale=26.0, bump_strength=0.045, coat=0.18),
        "ceramic_dark": material("SmokedCeramic", (0.025, 0.035, 0.043, 1.0), 0.32, 0.39, noise_scale=31.0, bump_strength=0.035, coat=0.12),
        "gunmetal": material("DeepGunmetal", (0.010, 0.018, 0.024, 1.0), 0.78, 0.28, noise_scale=38.0, bump_strength=0.026, coat=0.14),
        "edge": material("MachinedEdge", (0.07, 0.085, 0.092, 1.0), 0.86, 0.22, noise_scale=32.0, bump_strength=0.014, coat=0.20),
        "rubber": material("ContactRubber", (0.002, 0.003, 0.004, 1.0), 0.0, 0.82, noise_scale=80.0, bump_strength=0.21),
        "visor": material("PetrolBallisticVisor", (0.002, 0.025, 0.038, 1.0), 0.62, 0.15, noise_scale=12.0, bump_strength=0.008, coat=0.54),
        "cyan": material("CyanTelemetry", (0.002, 0.12, 0.17, 1.0), 0.20, 0.20, emission=(0.0, 0.72, 1.0, 1.0), emission_strength=4.2, coat=0.30),
        "oxide": material("OxideIdentity", (0.28, 0.035, 0.014, 1.0), 0.20, 0.38, noise_scale=30.0, bump_strength=0.025, emission=(0.35, 0.010, 0.002, 1.0), emission_strength=0.35),
        "stitch": material("RecessedSeam", (0.015, 0.020, 0.024, 1.0), 0.15, 0.47, noise_scale=65.0, bump_strength=0.035),
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
    bone: str | None = None,
) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(PREFIX + name + "_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(PREFIX + name, mesh)
    collection.objects.link(obj)
    mesh.materials.append(mat)
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
        mod = obj.modifiers.new("SurfaceSubdivision", "SUBSURF")
        mod.subdivision_type = "CATMULL_CLARK"
        mod.levels = subdiv
        mod.render_levels = subdiv
    return tag(obj, role, tier, bone)


def bone_parent_keep_world(obj: bpy.types.Object, rig: bpy.types.Object, bone: str) -> None:
    world = obj.matrix_world.copy()
    obj.parent = rig
    obj.parent_type = "BONE"
    obj.parent_bone = bone
    obj.matrix_world = world
    obj["kyx_deformation_policy"] = f"rigid bone parent: {bone}"


def curved_panel(
    name: str,
    center: Vector,
    axis_u: Vector,
    axis_v: Vector,
    normal: Vector,
    half_widths: list[float],
    height: float,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    across: int = 9,
    crown: float = 0.014,
    thickness: float = 0.009,
    bevel: float = 0.0035,
    tier: str = "primary",
    bone: str | None = None,
) -> bpy.types.Object:
    u_axis = axis_u.normalized()
    v_axis = axis_v.normalized()
    n_axis = normal.normalized()
    rows = len(half_widths)
    vertices: list[tuple[float, float, float]] = []
    for row, half_width in enumerate(half_widths):
        v = row / (rows - 1) - 0.5
        for index in range(across):
            u = index / (across - 1) * 2.0 - 1.0
            edge_soften = max(0.0, 1.0 - u * u)
            row_soften = max(0.0, 1.0 - (v * 1.55) ** 2)
            point = center + u_axis * (u * half_width) + v_axis * (v * height)
            point += n_axis * (crown * edge_soften * (0.68 + 0.32 * row_soften))
            vertices.append(tuple(point))
    faces: list[tuple[int, ...]] = []
    for row in range(rows - 1):
        for index in range(across - 1):
            a = row * across + index
            faces.append((a, a + 1, a + across + 1, a + across))
    obj = add_mesh(name, vertices, faces, collection, mat, role, solidify=thickness, bevel=bevel, subdiv=1, tier=tier, bone=bone)
    return obj


def limb_shell_world(
    name: str,
    start: Vector,
    end: Vector,
    radii: tuple[float, float],
    outward: Vector,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    span_degrees: float = 112.0,
    length_steps: int = 6,
    angular_steps: int = 11,
    thickness: float = 0.008,
    bevel: float = 0.003,
    tier: str = "primary",
    bone: str,
) -> bpy.types.Object:
    direction = (end - start).normalized()
    basis_a = outward - direction * outward.dot(direction)
    if basis_a.length < 1e-5:
        basis_a = direction.cross(Vector((0.0, 0.0, 1.0)))
    basis_a.normalize()
    basis_b = direction.cross(basis_a).normalized()
    span = math.radians(span_degrees) * 0.5
    vertices: list[tuple[float, float, float]] = []
    for row in range(length_steps):
        t = row / (length_steps - 1)
        center = start.lerp(end, t)
        radius = radii[0] * (1.0 - t) + radii[1] * t
        # Narrowed ends prevent fitted guards from reading as rectangular slabs.
        taper = 0.68 + 0.32 * math.sin(math.pi * t)
        for index in range(angular_steps):
            angle = -span + 2.0 * span * index / (angular_steps - 1)
            point = center + basis_a * (math.cos(angle) * radius * taper) + basis_b * (math.sin(angle) * radius * 0.78)
            vertices.append(tuple(point))
    faces: list[tuple[int, ...]] = []
    for row in range(length_steps - 1):
        for index in range(angular_steps - 1):
            a = row * angular_steps + index
            faces.append((a, a + 1, a + angular_steps + 1, a + angular_steps))
    return add_mesh(name, vertices, faces, collection, mat, role, solidify=thickness, bevel=bevel, subdiv=1, tier=tier, bone=bone)


def ellipsoid_patch(
    name: str,
    center: Vector,
    radii: tuple[float, float, float],
    phi_range: tuple[float, float],
    theta_range: tuple[float, float],
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    phi_steps: int = 10,
    theta_steps: int = 14,
    thickness: float = 0.009,
    bevel: float = 0.003,
    tier: str = "primary",
    bone: str = "head",
) -> bpy.types.Object:
    rx, ry, rz = radii
    vertices: list[tuple[float, float, float]] = []
    for i in range(phi_steps):
        phi = phi_range[0] + (phi_range[1] - phi_range[0]) * i / (phi_steps - 1)
        for j in range(theta_steps):
            theta = theta_range[0] + (theta_range[1] - theta_range[0]) * j / (theta_steps - 1)
            crown_break = 1.0 - 0.045 * math.cos(3.0 * theta) * math.sin(phi) ** 2
            vertices.append(tuple(center + Vector((
                rx * math.sin(phi) * math.sin(theta) * crown_break,
                -ry * math.sin(phi) * math.cos(theta),
                rz * math.cos(phi),
            ))))
    faces: list[tuple[int, ...]] = []
    for i in range(phi_steps - 1):
        for j in range(theta_steps - 1):
            a = i * theta_steps + j
            faces.append((a, a + 1, a + theta_steps + 1, a + theta_steps))
    return add_mesh(name, vertices, faces, collection, mat, role, solidify=thickness, bevel=bevel, subdiv=1, tier=tier, bone=bone)


def profile_volume_basis(
    name: str,
    origin: Vector,
    axis_a: Vector,
    axis_b: Vector,
    depth_axis: Vector,
    outline: list[tuple[float, float]],
    depth: float,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.004,
    tier: str = "secondary",
    bone: str | None = None,
) -> bpy.types.Object:
    a_axis = axis_a.normalized()
    b_axis = axis_b.normalized()
    d_axis = depth_axis.normalized()
    count = len(outline)
    vertices: list[tuple[float, float, float]] = []
    for sign in (-0.5, 0.5):
        for a, b in outline:
            vertices.append(tuple(origin + a_axis * a + b_axis * b + d_axis * (depth * sign)))
    faces: list[tuple[int, ...]] = [tuple(reversed(range(count))), tuple(count + index for index in range(count))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    return add_mesh(name, vertices, faces, collection, mat, role, bevel=bevel, tier=tier, bone=bone)


def curve_tube(
    name: str,
    points: list[Vector],
    radius: float,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    tier: str = "secondary",
    cyclic: bool = False,
    bone: str | None = None,
) -> bpy.types.Object:
    data = bpy.data.curves.new(PREFIX + name + "_Curve", "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 3
    data.bevel_depth = radius
    data.bevel_resolution = 3
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(PREFIX + name, data)
    collection.objects.link(obj)
    data.materials.append(mat)
    return tag(obj, role, tier, bone)


def cylinder_between(
    name: str,
    start: Vector,
    end: Vector,
    radius: float,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    vertices: int = 24,
    bevel: float = 0.002,
    tier: str = "secondary",
    bone: str | None = None,
) -> bpy.types.Object:
    direction = end - start
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=(start + end) * 0.5)
    obj = bpy.context.object
    obj.name = PREFIX + name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_only(obj, collection)
    obj.data.materials.append(mat)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    if bevel > 0.0:
        mod = obj.modifiers.new("ManufacturedEdgeRadius", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    return tag(obj, role, tier, bone)


def pose_segment(rig: bpy.types.Object, bone_name: str, start_t: float, end_t: float) -> tuple[Vector, Vector]:
    bone = rig.pose.bones[bone_name]
    head = rig.matrix_world @ bone.head
    tail = rig.matrix_world @ bone.tail
    return head.lerp(tail, start_t), head.lerp(tail, end_t)


def assign_body_garment_materials(body: bpy.types.Object, mats: dict[str, bpy.types.Material]) -> dict[str, int]:
    body.data.materials.clear()
    ordered = [mats["suit"], mats["flex"], mats["glove"], mats["boot"]]
    for mat in ordered:
        body.data.materials.append(mat)
    group_names = {group.index: group.name for group in body.vertex_groups}
    counts = {"suit": 0, "flex": 0, "glove": 0, "boot": 0}
    glove_tokens = ("palm.", "wrist.", "thumb_", "index_", "middle_", "ring_", "pinky_")
    for polygon in body.data.polygons:
        center = sum((body.data.vertices[index].co for index in polygon.vertices), Vector()) / len(polygon.vertices)
        weighted_names: set[str] = set()
        for index in polygon.vertices:
            for item in body.data.vertices[index].groups:
                if item.weight >= 0.24:
                    weighted_names.add(group_names.get(item.group, ""))
        if any(any(token in name for token in glove_tokens) for name in weighted_names):
            key = "glove"
        elif center.z < 0.17 or any(name.startswith("foot_anchor") for name in weighted_names):
            key = "boot"
        elif (0.47 <= center.z <= 0.62) or (0.95 <= center.z <= 1.12 and abs(center.x) > 0.22) or (1.48 <= center.z <= 1.59):
            key = "flex"
        else:
            key = "suit"
        polygon.material_index = {"suit": 0, "flex": 1, "glove": 2, "boot": 3}[key]
        polygon.use_smooth = True
        counts[key] += 1
    body["kyx_visible_role"] = "continuous tailored technical garment over accepted anatomy"
    body["kyx_garment_method"] = "material-region tailoring on unchanged continuous skinned topology"
    return counts


def build_helmet(collection: bpy.types.Collection, detail: bpy.types.Collection, mats: dict[str, bpy.types.Material], rig: bpy.types.Object) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    center = Vector((0.0, -0.010, 1.665))
    radii = (0.108, 0.122, 0.142)
    pieces = [
        ellipsoid_patch("Helmet_CrownCenter", center, radii, (0.08, 0.88), (-0.52, 0.52), collection, mats["ceramic"], "interlocking crown center", thickness=0.010, bevel=0.0035),
        ellipsoid_patch("Helmet_CrownLeft", center, radii, (0.18, 1.30), (0.56, 1.72), collection, mats["ceramic_dark"], "left crown and temple shell", thickness=0.010, bevel=0.0035),
        ellipsoid_patch("Helmet_CrownRight", center, radii, (0.18, 1.30), (-1.72, -0.56), collection, mats["ceramic_dark"], "right crown and temple shell", thickness=0.010, bevel=0.0035),
        ellipsoid_patch("Helmet_Occipital", center, radii, (0.20, 1.35), (1.68, 4.60), collection, mats["ceramic"], "wrapped rear occipital shell", thickness=0.010, bevel=0.0035),
    ]
    objects.extend(pieces)
    visor = curved_panel(
        "Helmet_Visor", Vector((0.0, -0.128, 1.665)), Vector((1, 0, 0)), UP, Vector((0, -1, 0)),
        [0.042, 0.061, 0.069, 0.061, 0.042], 0.088, collection, mats["visor"], "compact compound recessed ballistic visor",
        across=11, crown=0.009, thickness=0.006, bevel=0.0025, bone="head",
    )
    objects.append(visor)
    for side, label in ((-1, "R"), (1, "L")):
        cheek_normal = Vector((side * 0.42, -0.91, 0.0))
        cheek = curved_panel(
            f"Helmet_Cheek_{label}", Vector((side * 0.071, -0.095, 1.605)), Vector((1, 0, 0)), UP, cheek_normal,
            [0.020, 0.032, 0.036, 0.030, 0.018], 0.100, collection, mats["ceramic"], "fitted cheek and jaw shell",
            across=7, crown=0.007, thickness=0.009, bevel=0.003, bone="head",
        )
        objects.append(cheek)
        temple = cylinder_between(
            f"Helmet_TemplePivot_{label}", Vector((side * 0.110, -0.015, 1.660)), Vector((side * 0.120, -0.015, 1.660)),
            0.018, detail, mats["gunmetal"], "recessed helmet articulation pivot", vertices=24, bevel=0.0025, tier="tertiary", bone="head",
        )
        objects.append(temple)
    brow = curved_panel(
        "Helmet_BrowBridge", Vector((0.0, -0.118, 1.722)), Vector((1, 0, 0)), UP, Vector((0, -1, 0)),
        [0.040, 0.066, 0.072, 0.054], 0.044, collection, mats["ceramic_dark"], "interlocking brow and crown bridge",
        across=9, crown=0.007, thickness=0.008, bevel=0.0028, bone="head",
    )
    objects.append(brow)
    chin = curved_panel(
        "Helmet_ChinBridge", Vector((0.0, -0.112, 1.575)), Vector((1, 0, 0)), UP, Vector((0, -1, 0)),
        [0.038, 0.052, 0.054, 0.044], 0.054, collection, mats["ceramic_dark"], "floating chin bridge with neck clearance",
        across=9, crown=0.006, thickness=0.008, bevel=0.003, bone="head",
    )
    objects.append(chin)
    gasket = curve_tube(
        "Helmet_VisorGasket",
        [Vector((-0.060, -0.141, 1.625)), Vector((-0.074, -0.141, 1.665)), Vector((-0.058, -0.141, 1.706)), Vector((0.0, -0.145, 1.716)), Vector((0.058, -0.141, 1.706)), Vector((0.074, -0.141, 1.665)), Vector((0.060, -0.141, 1.625)), Vector((0.0, -0.145, 1.612))],
        0.0027, detail, mats["edge"], "continuous visor seal", cyclic=True, bone="head",
    )
    objects.append(gasket)
    crown_keel = curve_tube(
        "Helmet_CrownKeel",
        [Vector((0.0, -0.125, 1.710)), Vector((0.0, -0.080, 1.780)), Vector((0.0, 0.005, 1.807)), Vector((0.0, 0.095, 1.748))],
        0.0032, detail, mats["edge"], "manufactured crown keel", bone="head",
    )
    objects.append(crown_keel)
    telemetry = curve_tube(
        "Helmet_LeftTelemetry", [Vector((0.092, -0.058, 1.690)), Vector((0.105, -0.020, 1.700))],
        0.0022, detail, mats["cyan"], "restrained helmet telemetry", tier="tertiary", bone="head",
    )
    objects.append(telemetry)
    for obj in objects:
        bone_parent_keep_world(obj, rig, "head")
    return objects


def build_torso(collection: bpy.types.Collection, detail: bpy.types.Collection, mats: dict[str, bpy.types.Material], rig: bpy.types.Object) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    for side, label in ((-1, "R"), (1, "L")):
        x = side * 0.082
        upper = curved_panel(
            f"Chest_{label}_ClaviclePectoral", Vector((x, -0.148, 1.365)), Vector((1, 0, 0)), UP, Vector((0, -1, 0)),
            [0.050, 0.076, 0.088, 0.082, 0.064, 0.038], 0.150, collection, mats["ceramic"], "fitted clavicle and pectoral ceramic",
            across=9, crown=0.018, thickness=0.009, bevel=0.0035, bone="chest",
        )
        objects.append(upper)
        lower = curved_panel(
            f"Chest_{label}_RibLamella", Vector((side * 0.078, -0.178, 1.245)), Vector((1, 0, 0)), UP, Vector((0, -1, 0)),
            [0.038, 0.065, 0.074, 0.068, 0.048], 0.105, collection, mats["ceramic_dark"], "overlapping lower rib lamella",
            across=9, crown=0.014, thickness=0.008, bevel=0.003, bone="chest",
        )
        objects.append(lower)
        back = curved_panel(
            f"Back_{label}_ScapularCarrier", Vector((side * 0.080, 0.132, 1.330)), Vector((1, 0, 0)), UP, Vector((0, 1, 0)),
            [0.040, 0.072, 0.084, 0.078, 0.054], 0.145, collection, mats["ceramic_dark"], "fitted rear scapular carrier",
            across=9, crown=0.014, thickness=0.009, bevel=0.0035, bone="chest",
        )
        objects.append(back)
        seam = curve_tube(
            f"Suit_{label}_ObliqueSeam",
            [Vector((side * 0.035, -0.126, 1.215)), Vector((side * 0.100, -0.118, 1.160)), Vector((side * 0.145, -0.095, 1.075)), Vector((side * 0.155, -0.070, 1.010))],
            0.0017, detail, mats["stitch"], "tailored oblique garment seam", tier="tertiary", bone="chest",
        )
        objects.append(seam)
    sternum_outline = [(-0.032, 0.105), (0.0, 0.135), (0.032, 0.105), (0.025, -0.100), (0.0, -0.126), (-0.025, -0.100)]
    sternum = profile_volume_basis(
        "Chest_SternumKeel", Vector((0.0, -0.184, 1.340)), Vector((1, 0, 0)), UP, Vector((0, 1, 0)), sternum_outline, 0.028,
        collection, mats["gunmetal"], "narrow load-bearing sternum keel", bevel=0.0045, bone="chest",
    )
    objects.append(sternum)
    telemetry = profile_volume_basis(
        "Chest_Telemetry", Vector((0.0, -0.202, 1.365)), Vector((1, 0, 0)), UP, Vector((0, 1, 0)),
        [(-0.006, 0.026), (0.006, 0.026), (0.006, -0.026), (-0.006, -0.026)], 0.004,
        detail, mats["cyan"], "sternum telemetry inset", bevel=0.0015, tier="tertiary", bone="chest",
    )
    objects.append(telemetry)
    for z, width, depth in ((1.176, 0.100, -0.188), (1.125, 0.092, -0.183), (1.076, 0.082, -0.176)):
        panel = curved_panel(
            f"Abdomen_FlexLamella_{int(z*1000)}", Vector((0.0, depth, z)), Vector((1, 0, 0)), UP, Vector((0, -1, 0)),
            [width * 0.78, width, width * 0.84], 0.044, collection, mats["gunmetal"], "articulated abdominal flex lamella",
            across=9, crown=0.007, thickness=0.006, bevel=0.0025, tier="secondary", bone="spine_02",
        )
        objects.append(panel)
    lumbar = curved_panel(
        "Back_LumbarCarrier", Vector((0.0, 0.142, 1.125)), Vector((1, 0, 0)), UP, Vector((0, 1, 0)),
        [0.060, 0.095, 0.108, 0.095, 0.060], 0.150, collection, mats["gunmetal"], "continuous rear lumbar carrier",
        across=11, crown=0.012, thickness=0.008, bevel=0.003, bone="spine_02",
    )
    objects.append(lumbar)
    for obj in objects:
        bone = obj.get("kyx_deformation_policy", "").replace("rigid bone parent: ", "")
        if bone and bone in rig.pose.bones:
            bone_parent_keep_world(obj, rig, bone)
    return objects


def build_limb_armor(collection: bpy.types.Collection, detail: bpy.types.Collection, mats: dict[str, bpy.types.Material], rig: bpy.types.Object) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    # Support-side shoulder identity plate; firing shoulder remains a soft stock pocket.
    start, end = pose_segment(rig, "upper_arm.L", 0.03, 0.31)
    shoulder = limb_shell_world(
        "SupportShoulder_Mantle", start, end, (0.076, 0.061), Vector((0.70, -0.65, 0.20)), collection, mats["ceramic"],
        "asymmetric clavicle-seated shoulder mantle", span_degrees=126.0, thickness=0.009, bevel=0.0035, bone="upper_arm.L",
    )
    objects.append(shoulder)
    stripe = limb_shell_world(
        "SupportShoulder_OxideStripe", start.lerp(end, 0.16), start.lerp(end, 0.50), (0.079, 0.064), Vector((0.70, -0.65, 0.20)), detail, mats["oxide"],
        "project identity stripe inset", span_degrees=26.0, length_steps=4, angular_steps=5, thickness=0.004, bevel=0.0015, tier="tertiary", bone="upper_arm.L",
    )
    objects.append(stripe)
    for side, label in (("R", "Firing"), ("L", "Support")):
        start, end = pose_segment(rig, f"forearm.{side}", 0.10, 0.82)
        outward = Vector(((-0.72 if side == "R" else 0.72), -0.66, 0.10))
        guard = limb_shell_world(
            f"{label}Forearm_FittedGuard", start, end, (0.050, 0.034), outward, collection,
            mats["ceramic_dark"], "tapered forearm guard with wrist clearance",
            span_degrees=92.0, thickness=0.007, bevel=0.0028, bone=f"forearm.{side}",
        )
        objects.append(guard)
        seam = curve_tube(
            f"{label}Arm_TensionSeam", [start + outward.normalized() * 0.048, start.lerp(end, 0.45) + outward.normalized() * 0.042, end + outward.normalized() * 0.032],
            0.0016, detail, mats["stitch"], "forearm garment tension seam", tier="tertiary", bone=f"forearm.{side}",
        )
        objects.append(seam)
        cyan = curve_tube(
            f"{label}Forearm_Telemetry", [start.lerp(end, 0.30) + outward.normalized() * 0.060, start.lerp(end, 0.47) + outward.normalized() * 0.052],
            0.0020, detail, mats["cyan"], "forearm telemetry index", tier="tertiary", bone=f"forearm.{side}",
        )
        objects.append(cyan)
    for side, label, sign in (("R", "R", -1.0), ("L", "L", 1.0)):
        start, end = pose_segment(rig, f"thigh_anchor.{side}", 0.18, 0.68)
        outward = Vector((sign * 0.78, -0.58, 0.0))
        thigh = limb_shell_world(
            f"{label}_Thigh_LateralCarrier", start, end, (0.100, 0.078), outward, collection, mats["ceramic_dark"],
            "curved lateral thigh carrier", span_degrees=72.0, thickness=0.008, bevel=0.0032, bone=f"thigh_anchor.{side}",
        )
        objects.append(thigh)
        start_s, end_s = pose_segment(rig, f"shin_anchor.{side}", 0.14, 0.68)
        shin = limb_shell_world(
            f"{label}_Shin_AnteriorCarrier", start_s, end_s, (0.078, 0.055), Vector((sign * 0.25, -0.97, 0.0)), collection, mats["ceramic_dark"],
            "anatomically tapered shin carrier", span_degrees=64.0, thickness=0.008, bevel=0.0032, bone=f"shin_anchor.{side}",
        )
        objects.append(shin)
        knee_seam = curve_tube(
            f"{label}_Knee_FlexSeam", [start_s + Vector((sign * 0.060, -0.045, 0.020)), start_s + Vector((sign * 0.076, -0.055, -0.015)), start_s + Vector((sign * 0.055, -0.040, -0.045))],
            0.0018, detail, mats["stitch"], "knee articulation seam", tier="tertiary", bone=f"shin_anchor.{side}",
        )
        objects.append(knee_seam)
    for obj in objects:
        policy = obj.get("kyx_deformation_policy", "")
        bone = policy.replace("rigid bone parent: ", "") if policy.startswith("rigid bone parent: ") else ""
        if bone in rig.pose.bones:
            bone_parent_keep_world(obj, rig, bone)
    return objects


def sole_loft(name: str, side: str, sign: float, collection: bpy.types.Collection, mat: bpy.types.Material, rig: bpy.types.Object) -> bpy.types.Object:
    cx = sign * 0.105
    stations = [
        (0.085, 0.047, 0.026, 0.021),
        (0.030, 0.052, 0.026, 0.022),
        (-0.040, 0.057, 0.025, 0.022),
        (-0.105, 0.060, 0.024, 0.020),
        (-0.155, 0.050, 0.023, 0.018),
    ]
    segments = 18
    vertices: list[tuple[float, float, float]] = []
    exponent = 0.54
    for y, half_width, zc, rz in stations:
        for index in range(segments):
            angle = math.tau * index / segments
            cosine, sine = math.cos(angle), math.sin(angle)
            x_shape = math.copysign(abs(cosine) ** exponent, cosine)
            z_shape = math.copysign(abs(sine) ** exponent, sine)
            if z_shape < 0.0:
                z_shape *= 0.32
            vertices.append((cx + half_width * x_shape, y, zc + rz * z_shape))
    faces: list[tuple[int, ...]] = []
    for row in range(len(stations) - 1):
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((row * segments + index, row * segments + nxt, (row + 1) * segments + nxt, (row + 1) * segments + index))
    faces.append(tuple(reversed(range(segments))))
    last = (len(stations) - 1) * segments
    faces.append(tuple(last + index for index in range(segments)))
    obj = add_mesh(name, vertices, faces, collection, mat, "contoured combat outsole and heel-to-toe rocker", bevel=0.0025, subdiv=1, bone=f"foot_anchor.{side}")
    bone_parent_keep_world(obj, rig, f"foot_anchor.{side}")
    return obj


def boot_upper_loft(name: str, side: str, sign: float, collection: bpy.types.Collection, mat: bpy.types.Material, rig: bpy.types.Object) -> bpy.types.Object:
    """Closed anatomical boot volume that conceals toes without a wedge profile."""
    cx = sign * 0.105
    stations = [
        (0.105, 0.052, 0.102, 0.075),
        (0.045, 0.056, 0.092, 0.068),
        (-0.035, 0.061, 0.074, 0.052),
        (-0.105, 0.064, 0.058, 0.038),
        (-0.165, 0.054, 0.047, 0.027),
    ]
    segments = 20
    vertices: list[tuple[float, float, float]] = []
    exponent = 0.70
    for y, half_width, zc, rz in stations:
        for index in range(segments):
            angle = math.tau * index / segments
            cosine, sine = math.cos(angle), math.sin(angle)
            x_shape = math.copysign(abs(cosine) ** exponent, cosine)
            z_shape = math.copysign(abs(sine) ** exponent, sine)
            vertices.append((cx + half_width * x_shape, y, zc + rz * z_shape))
    faces: list[tuple[int, ...]] = []
    for row in range(len(stations) - 1):
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((row * segments + index, row * segments + nxt, (row + 1) * segments + nxt, (row + 1) * segments + index))
    faces.append(tuple(reversed(range(segments))))
    last = (len(stations) - 1) * segments
    faces.append(tuple(last + index for index in range(segments)))
    obj = add_mesh(name, vertices, faces, collection, mat, "anatomical boot upper with heel ankle instep and enclosed toe", bevel=0.0025, subdiv=1, bone=f"foot_anchor.{side}")
    bone_parent_keep_world(obj, rig, f"foot_anchor.{side}")
    return obj


def build_boots(collection: bpy.types.Collection, detail: bpy.types.Collection, mats: dict[str, bpy.types.Material], rig: bpy.types.Object) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    for side, label, sign in (("R", "R", -1.0), ("L", "L", 1.0)):
        sole = sole_loft(f"Boot_{label}_ContouredOutsole", side, sign, collection, mats["rubber"], rig)
        upper = boot_upper_loft(f"Boot_{label}_AnatomicalUpper", side, sign, collection, mats["boot"], rig)
        objects.extend((sole, upper))
        cx = sign * 0.105
        toe = curved_panel(
            f"Boot_{label}_ToeCap", Vector((cx, -0.118, 0.082)), Vector((1, 0, 0)), Vector((0, -1, 0)), UP,
            [0.030, 0.044, 0.048, 0.042, 0.026], 0.078, collection, mats["ceramic_dark"], "fitted toe-cap shell",
            across=9, crown=0.008, thickness=0.006, bevel=0.0028, bone=f"foot_anchor.{side}",
        )
        objects.append(toe)
        bone_parent_keep_world(toe, rig, f"foot_anchor.{side}")
        # Two seated retention bridges replace the floating curve laces.
        for index, y in enumerate((-0.058, -0.102)):
            bridge = profile_volume_basis(
                f"Boot_{label}_RetentionBridge_{index+1}", Vector((cx, y, 0.119 - index * 0.014)), Vector((1, 0, 0)), Vector((0, -1, 0)), UP,
                [(-0.026, -0.008), (0.026, -0.008), (0.030, 0.008), (-0.030, 0.008)], 0.004,
                detail, mats["edge"], "seated instep retention bridge", bevel=0.0012, tier="tertiary", bone=f"foot_anchor.{side}",
            )
            bone_parent_keep_world(bridge, rig, f"foot_anchor.{side}")
            objects.append(bridge)
    return objects


def add_weapon_profile(
    name: str,
    outline: list[tuple[float, float]],
    thickness: float,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    bevel: float = 0.004,
    tier: str = "secondary",
) -> bpy.types.Object:
    return profile_volume_basis(name, GRIP, FORWARD, UP, RIGHT, outline, thickness, collection, mat, role, bevel=bevel, tier=tier, bone="palm.R")


def build_weapon(collection: bpy.types.Collection, detail: bpy.types.Collection, mats: dict[str, bpy.types.Material], rig: bpy.types.Object) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    # Preserve exact contact geometry, update only its authored material response.
    contact_materials = {
        "Rifle_GripContact": mats["rubber"],
        "Rifle_ForegripContact": mats["rubber"],
        "Rifle_ForegripHandStop": mats["gunmetal"],
        "Rifle_StockPadContact": mats["rubber"],
        "Rifle_Trigger": mats["oxide"],
        "Rifle_TriggerGuard": mats["gunmetal"],
    }
    for suffix, mat in contact_materials.items():
        obj = bpy.data.objects[CONTACT_PREFIX + suffix]
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        obj["kyx_contact_geometry_preserved"] = True
    # Retire the visibly sectioned blockout shells; exact contact parts remain visible.
    for suffix in ("Rifle_ReceiverSectioned", "Rifle_StockBeam", "Rifle_Barrel", "Rifle_Muzzle"):
        obj = bpy.data.objects[CONTACT_PREFIX + suffix]
        obj.hide_render = True
        obj.hide_viewport = True
        obj["kyx_replaced_by_production_shell"] = True
    receiver = add_weapon_profile(
        "Rifle_Receiver",
        [(-0.145, 0.055), (-0.105, 0.175), (0.155, 0.180), (0.225, 0.135), (0.205, 0.045), (0.135, 0.005), (-0.105, 0.010)],
        0.095, collection, mats["gunmetal"], "layered forged receiver with grip and trigger clearance", bevel=0.007,
    )
    objects.append(receiver)
    accent = add_weapon_profile(
        "Rifle_ReceiverCeramicShell",
        [(-0.100, 0.148), (-0.055, 0.175), (0.130, 0.175), (0.175, 0.140), (0.145, 0.080), (-0.075, 0.080)],
        0.102, detail, mats["ceramic"], "stepped receiver ceramic shell", bevel=0.0045, tier="secondary",
    )
    objects.append(accent)
    ejection = add_weapon_profile(
        "Rifle_EjectionPort", [(-0.010, 0.135), (0.105, 0.135), (0.125, 0.105), (0.100, 0.075), (-0.020, 0.075), (-0.035, 0.105)],
        0.108, detail, mats["flex"], "recessed ejection port", bevel=0.0025, tier="tertiary",
    )
    objects.append(ejection)
    # Open handguard: rails and diagonal bridges leave real negative space.
    for suffix, outline, mat, role in (
        ("TopRail", [(0.150, 0.145), (0.650, 0.145), (0.675, 0.175), (0.150, 0.175)], mats["gunmetal"], "continuous upper handguard rail"),
        ("BottomRail", [(0.150, 0.025), (0.585, 0.025), (0.610, 0.055), (0.170, 0.060)], mats["gunmetal"], "continuous lower handguard rail"),
    ):
        obj = add_weapon_profile("Rifle_" + suffix, outline, 0.086, collection, mat, role, bevel=0.0035)
        objects.append(obj)
    for index, t in enumerate((0.20, 0.31, 0.42, 0.53, 0.62)):
        outline = [(t - 0.026, 0.060), (t - 0.006, 0.145), (t + 0.026, 0.145), (t + 0.006, 0.055)]
        obj = add_weapon_profile(f"Rifle_HandguardBridge_{index+1}", outline, 0.090, collection, mats["ceramic_dark"] if index % 2 else mats["ceramic"], "ventilated diagonal handguard bridge", bevel=0.003)
        objects.append(obj)
    # Open stock rails terminate around, not through, the sealed shoulder pad.
    stock_top = cylinder_between("Rifle_StockTopRail", STOCK_PAD + UP * 0.035 + FORWARD * 0.018, GRIP - FORWARD * 0.095 + UP * 0.145, 0.011, collection, mats["gunmetal"], "open stock upper load rail", vertices=20, bevel=0.0025, bone="palm.R")
    stock_low = cylinder_between("Rifle_StockLowerRail", STOCK_PAD - UP * 0.045 + FORWARD * 0.020, GRIP - FORWARD * 0.055 + UP * 0.050, 0.010, collection, mats["gunmetal"], "open stock lower load rail", vertices=20, bevel=0.0025, bone="palm.R")
    objects.extend((stock_top, stock_low))
    magazine = add_weapon_profile(
        "Rifle_Magazine", [(0.025, 0.015), (0.125, 0.012), (0.115, -0.190), (0.035, -0.205), (0.005, -0.055)],
        0.068, collection, mats["gunmetal"], "curved detachable magazine", bevel=0.0055,
    )
    objects.append(magazine)
    optic = add_weapon_profile(
        "Rifle_Optic", [(-0.060, 0.195), (0.085, 0.195), (0.120, 0.235), (0.092, 0.275), (-0.075, 0.275), (-0.100, 0.235)],
        0.068, collection, mats["gunmetal"], "low-profile combat optic", bevel=0.005,
    )
    objects.append(optic)
    optic_lens = profile_volume_basis(
        "Rifle_OpticLens", GRIP + FORWARD * -0.102 + UP * 0.235, RIGHT, UP, FORWARD,
        [(-0.022, 0.022), (0.022, 0.022), (0.022, -0.022), (-0.022, -0.022)], 0.005,
        detail, mats["cyan"], "optic glass index", bevel=0.002, tier="tertiary", bone="palm.R",
    )
    objects.append(optic_lens)
    barrel_start = GRIP + FORWARD * 0.640 + UP * 0.118
    barrel_end = GRIP + FORWARD * 0.965 + UP * 0.118
    barrel = cylinder_between("Rifle_FreeFloatBarrel", barrel_start, barrel_end, 0.014, collection, mats["gunmetal"], "free-float barrel", vertices=28, bevel=0.002, bone="palm.R")
    muzzle = cylinder_between("Rifle_MuzzleBrake", barrel_end, barrel_end + FORWARD * 0.105, 0.027, collection, mats["edge"], "ported muzzle brake", vertices=28, bevel=0.003, bone="palm.R")
    objects.extend((barrel, muzzle))
    for index, t in enumerate((0.705, 0.755, 0.805, 0.855, 0.905)):
        tooth = profile_volume_basis(
            f"Rifle_RailTooth_{index+1}", GRIP + FORWARD * t + UP * 0.184, RIGHT, UP, FORWARD,
            [(-0.026, -0.006), (0.026, -0.006), (0.026, 0.006), (-0.026, 0.006)], 0.018,
            detail, mats["edge"], "machined top rail tooth", bevel=0.001, tier="tertiary", bone="palm.R",
        )
        objects.append(tooth)
    status = curve_tube(
        "Rifle_StatusLight", [GRIP + FORWARD * 0.012 + RIGHT * 0.052 + UP * 0.125, GRIP + FORWARD * 0.065 + RIGHT * 0.052 + UP * 0.125],
        0.0022, detail, mats["cyan"], "receiver status light", tier="tertiary", bone="palm.R",
    )
    objects.append(status)
    # The sealed fixtures remain unparented byte-for-byte in transform space.
    # Only the new non-contact production shell follows the firing palm.
    all_weapon = objects
    seen: set[str] = set()
    for obj in all_weapon:
        if obj.name in seen:
            continue
        seen.add(obj.name)
        bone_parent_keep_world(obj, rig, "palm.R")
        obj["kyx_weapon_role"] = "contact-preserving held auto-rifle"
    return objects


def contact_snapshot() -> dict[str, dict[str, object]]:
    snapshot: dict[str, dict[str, object]] = {}
    for obj in bpy.data.objects:
        if not obj.name.startswith(CONTACT_PREFIX + "Rifle_"):
            continue
        points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        snapshot[obj.name] = {
            "matrixWorld": [[round(float(value), 9) for value in row] for row in obj.matrix_world],
            "bounds": [[round(min(point[axis] for point in points), 9), round(max(point[axis] for point in points), 9)] for axis in range(3)],
            "meshVertices": len(obj.data.vertices) if obj.type == "MESH" else None,
            "meshPolygons": len(obj.data.polygons) if obj.type == "MESH" else None,
            "curveSplines": len(obj.data.splines) if obj.type == "CURVE" else None,
        }
    return snapshot


def inventory(prefix: str) -> dict[str, object]:
    objects = [obj for obj in bpy.data.objects if obj.name.startswith(prefix)]
    meshes = [obj for obj in objects if obj.type == "MESH"]
    curves = [obj for obj in objects if obj.type == "CURVE"]
    return {
        "objects": len(objects),
        "meshes": len(meshes),
        "curves": len(curves),
        "meshVertices": sum(len(obj.data.vertices) for obj in meshes),
        "meshPolygons": sum(len(obj.data.polygons) for obj in meshes),
        "names": sorted(obj.name for obj in objects),
    }


def main() -> None:
    arguments = args_after_separator()
    if len(arguments) != 3:
        raise SystemExit("Expected -- <sealed-rev11b.blend> <candidate.blend> <report.json>")
    sealed_path, output_path, report_path = (Path(value).resolve() for value in arguments)
    sealed_hash_before = sha256(sealed_path)
    if sealed_hash_before != SEALED_REV11B_SHA256:
        raise RuntimeError(f"Sealed rev11b hash mismatch: {sealed_hash_before}")

    bpy.ops.wm.open_mainfile(filepath=str(sealed_path), load_ui=False, use_scripts=False)
    body = bpy.data.objects[BODY_NAME]
    rig = bpy.data.objects[RIG_NAME]
    body_topology_before = (len(body.data.vertices), len(body.data.edges), len(body.data.polygons))
    body_geometry_before = mesh_geometry_sha256(body)
    bone_names_before = sorted(bone.name for bone in rig.data.bones)
    contact_before = contact_snapshot()

    mats = make_materials()
    collections = {
        "garment": make_collection("TailoredTechnicalGarment"),
        "armor": make_collection("FittedArmorAndHelmet"),
        "detail": make_collection("AuthoredSurfaceDetail"),
        "weapon": make_collection("ProductionContactAutoRifle"),
    }
    garment_regions = assign_body_garment_materials(body, mats)
    body["kyx_checkpoint"] = CHECKPOINT
    body["kyx_contact_foundation"] = "sealed rev11b preserved"

    helmet = build_helmet(collections["armor"], collections["detail"], mats, rig)
    torso = build_torso(collections["armor"], collections["detail"], mats, rig)
    limbs = build_limb_armor(collections["armor"], collections["detail"], mats, rig)
    boots = build_boots(collections["armor"], collections["detail"], mats, rig)
    weapon = build_weapon(collections["weapon"], collections["detail"], mats, rig)

    # Eyes are enclosed by the helmet and can produce bone-parent transform artifacts.
    for eye_name in ("KYX_V6A_AnatomySculpt_Eye.L", "KYX_V6A_AnatomySculpt_Eye.R"):
        eye = bpy.data.objects.get(eye_name)
        if eye is not None:
            eye.hide_render = True
            eye.hide_viewport = True

    scene = bpy.context.scene
    scene["kyx_checkpoint"] = CHECKPOINT
    scene["kyx_scope"] = "first bounded V6-B production/contact visual candidate"
    scene["kyx_nonclaim"] = "No G6, final V6-B human acceptance, final UV/texture/LOD, animation matrix, or runtime integration claim"
    bpy.context.view_layer.update()

    body_topology_after = (len(body.data.vertices), len(body.data.edges), len(body.data.polygons))
    body_geometry_after = mesh_geometry_sha256(body)
    bone_names_after = sorted(bone.name for bone in rig.data.bones)
    contact_after = contact_snapshot()

    # Exact fixture geometry and current-pose world bounds must survive visual authoring.
    contact_preserved = True
    contact_deltas: dict[str, object] = {}
    for name, before in contact_before.items():
        after = contact_after[name]
        max_matrix = max(abs(before["matrixWorld"][r][c] - after["matrixWorld"][r][c]) for r in range(4) for c in range(4))
        max_bounds = max(abs(before["bounds"][axis][edge] - after["bounds"][axis][edge]) for axis in range(3) for edge in range(2))
        same_geometry = all(before[key] == after[key] for key in ("meshVertices", "meshPolygons", "curveSplines"))
        contact_deltas[name] = {"maxMatrixDelta": max_matrix, "maxBoundsDelta": max_bounds, "sameGeometryCounts": same_geometry}
        contact_preserved = contact_preserved and max_matrix <= 1e-7 and max_bounds <= 1e-7 and same_geometry
    if body_topology_after != body_topology_before or body_geometry_after != body_geometry_before:
        raise RuntimeError("Accepted body topology/geometry changed")
    if bone_names_after != bone_names_before or len(bone_names_after) != 52:
        raise RuntimeError("Accepted rig inventory changed")
    if not contact_preserved:
        raise RuntimeError(f"Accepted contact fixtures changed: {contact_deltas}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), check_existing=False)
    sealed_hash_after = sha256(sealed_path)
    if sealed_hash_after != sealed_hash_before:
        raise RuntimeError("Sealed rev11b input changed during authoring")
    output_hash = sha256(output_path)
    report = {
        "schema": "kyx-v6b-production-contact-candidate-author-report-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "status": "EARLY_V6B_PRODUCTION_CONTACT_VISUAL_REVIEW_REQUIRED",
        "source": {"path": str(sealed_path), "sha256Before": sealed_hash_before, "sha256After": sealed_hash_after, "unchanged": True},
        "output": {"path": str(output_path), "bytes": output_path.stat().st_size, "sha256": output_hash},
        "preservedFoundation": {
            "body": {"name": BODY_NAME, "topologyBefore": body_topology_before, "topologyAfter": body_topology_after, "geometrySha256Before": body_geometry_before, "geometrySha256After": body_geometry_after, "unchanged": body_geometry_before == body_geometry_after},
            "rig": {"name": RIG_NAME, "boneCount": len(bone_names_after), "boneNames": bone_names_after, "unchanged": bone_names_before == bone_names_after},
            "contactFixtures": {"unchangedAtCurrentPose": contact_preserved, "deltas": contact_deltas},
        },
        "garment": {"method": "unchanged continuous skinned human topology made visible as tailored technical cloth; project-authored procedural weave, flex, glove, and boot regions", "polygonRegions": garment_regions},
        "authoredConstruction": {
            "helmetObjects": len(helmet), "torsoObjects": len(torso), "limbObjects": len(limbs), "bootObjects": len(boots), "weaponShellObjects": len(weapon),
            "deformationPolicy": "continuous body remains skinned; rigid armor/helmet/boots are explicit bone children; held weapon is a palm.R bone child",
            "contactPolicy": "sealed grip, trigger, guard, foregrip, hand-stop, and stock-pad geometry preserved exactly and wrapped by non-contact weapon surfacing",
        },
        "inventory": inventory(PREFIX),
        "materials": sorted(mat.name for mat in mats.values()),
        "assertions": {
            "sealedRev11bPreserved": sealed_hash_before == sealed_hash_after,
            "bodyTopologyAndGeometryPreserved": body_geometry_before == body_geometry_after,
            "rig52BonesPreserved": bone_names_before == bone_names_after and len(bone_names_after) == 52,
            "contactFixturesPreservedAtCurrentPose": contact_preserved,
            "all30DigitBonesStillPresent": sum(1 for name in bone_names_after if any(token in name for token in ("thumb_", "index_", "middle_", "ring_", "pinky_"))) == 30,
            "noExternalLibraries": len(bpy.data.libraries) == 0,
        },
        "nonClaims": [
            "This is the first bounded V6-B production/contact visual candidate; it is not G6 or final human acceptance.",
            "The accepted rev11b contact proof remains the literal-contact authority until the candidate contact audit and close renders are reviewed.",
            "No final authored UV atlas, texture bake, LOD set, animation matrix, runtime integration, multiplayer capture, or performance acceptance is claimed.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("KYX_V6B_CF_R1_AUTHOR_REPORT:" + json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    main()
