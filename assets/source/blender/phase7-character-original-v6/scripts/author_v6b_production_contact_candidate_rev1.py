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
        "underbody": material("ContactAuthorityUnderbody", (0.0018, 0.0028, 0.0040, 1.0), 0.0, 1.0),
        "suit": material("GraphiteTailoredWeave", (0.0060, 0.0100, 0.0150, 1.0), 0.0, 0.90, noise_scale=185.0, bump_strength=0.12),
        "flex": material("BlackJointKnit", (0.0012, 0.0022, 0.0035, 1.0), 0.0, 0.95, noise_scale=110.0, bump_strength=0.11),
        "reinforcement": material("WovenTrouserReinforcement", (0.010, 0.015, 0.019, 1.0), 0.02, 0.87, noise_scale=135.0, bump_strength=0.09),
        "glove": material("TactileGloveRubber", (0.0015, 0.0020, 0.0028, 1.0), 0.0, 0.72, noise_scale=95.0, bump_strength=0.11),
        "boot": material("BootCompositeUpper", (0.0030, 0.0045, 0.0060, 1.0), 0.04, 0.66, noise_scale=72.0, bump_strength=0.10),
        "ceramic": material("WeatheredBoneCeramic", (0.16, 0.125, 0.078, 1.0), 0.06, 0.58, noise_scale=26.0, bump_strength=0.035, coat=0.07),
        "ceramic_mid": material("AshComposite", (0.012, 0.018, 0.023, 1.0), 0.12, 0.66, noise_scale=34.0, bump_strength=0.026, coat=0.03),
        "ceramic_dark": material("SmokedCeramic", (0.008, 0.013, 0.018, 1.0), 0.16, 0.62, noise_scale=31.0, bump_strength=0.028, coat=0.05),
        "gunmetal": material("DeepGunmetal", (0.005, 0.009, 0.013, 1.0), 0.66, 0.38, noise_scale=38.0, bump_strength=0.020, coat=0.08),
        "edge": material("MachinedEdge", (0.028, 0.036, 0.043, 1.0), 0.82, 0.30, noise_scale=32.0, bump_strength=0.011, coat=0.12),
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
    ordered = [mats["underbody"], mats["underbody"], mats["glove"], mats["boot"], mats["underbody"]]
    for mat in ordered:
        body.data.materials.append(mat)
    group_names = {group.index: group.name for group in body.vertex_groups}
    counts = {"suit": 0, "flex": 0, "glove": 0, "boot": 0, "reinforcement": 0}
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
        elif any(name.startswith(("thigh_anchor", "shin_anchor")) for name in weighted_names) and abs(center.x) > 0.185:
            key = "reinforcement"
        elif (0.47 <= center.z <= 0.62) or (0.95 <= center.z <= 1.12 and abs(center.x) > 0.22) or (1.48 <= center.z <= 1.59):
            key = "flex"
        else:
            key = "suit"
        polygon.material_index = {"suit": 0, "flex": 1, "glove": 2, "boot": 3, "reinforcement": 4}[key]
        polygon.use_smooth = True
        counts[key] += 1
    body["kyx_visible_role"] = "accepted skinned anatomy retained as the contact-accurate underbody"
    body["kyx_garment_method"] = "unchanged contact underbody beneath an independent continuous skinned garment shell"
    return counts


def build_tailored_undersuit(
    collection: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
    rig: bpy.types.Object,
    body: bpy.types.Object,
) -> tuple[bpy.types.Object, dict[str, int]]:
    """Create a real one-piece skinned cloth shell without touching the accepted body.

    The copied object retains the complete accepted deformation stack and weights.
    Non-garment vertices are removed only from the duplicate base mesh.  The full
    armature weights remain on every retained vertex; a clean relax/subdivision /
    solidify stack then places cloth outside the contact-authority body.  Hands
    therefore remain literal to rev11b while the normal-size silhouette reads as
    dressed rather than painted.
    """
    garment = body.copy()
    garment.data = body.data.copy()
    garment.name = PREFIX + "TailoredOnePieceUndersuit"
    garment.data.name = PREFIX + "TailoredOnePieceUndersuit_Mesh"
    link_only(garment, collection)
    garment.data.materials.clear()
    for mat in (mats["suit"], mats["flex"], mats["glove"], mats["boot"], mats["reinforcement"]):
        garment.data.materials.append(mat)

    coverage = garment.vertex_groups.get("GarmentCoverage") or garment.vertex_groups.new(name="GarmentCoverage")
    allowance_group = garment.vertex_groups.get("GarmentAllowance") or garment.vertex_groups.new(name="GarmentAllowance")
    include_prefixes = (
        "root", "spine_01", "spine_02", "chest", "clavicle.",
        "upper_arm.", "forearm.", "thigh_anchor.", "shin_anchor.",
    )
    exclude_prefixes = (
        "neck", "head", "wrist.", "palm.", "thumb_", "index_", "middle_",
        "ring_", "pinky_", "foot_anchor.",
    )
    group_names = {group.index: group.name for group in garment.vertex_groups}
    covered_indices: list[int] = []
    allowance_buckets: dict[float, list[int]] = {0.28: [], 0.62: [], 1.0: []}
    for vertex in garment.data.vertices:
        include_weight = 0.0
        exclude_weight = 0.0
        deform_names: set[str] = set()
        for item in vertex.groups:
            name = group_names.get(item.group, "")
            if item.weight > 0.001:
                deform_names.add(name)
            if name.startswith(include_prefixes):
                include_weight += item.weight
            if name.startswith(exclude_prefixes):
                exclude_weight += item.weight
        hard_surface_exclusion = vertex.co.z > 1.505 or vertex.co.z < 0.115
        dominant_hand_or_foot = exclude_weight > 0.60 and include_weight < 0.40
        # Any genuine torso/limb influence belongs to the continuous garment.
        # The earlier 0.18 threshold punched small holes wherever corrective or
        # transition weights diluted a limb group, exposing patchy underbody.
        if not hard_surface_exclusion and not dominant_hand_or_foot and include_weight > 0.001:
            covered_indices.append(vertex.index)
            firing_shoulder = vertex.co.x < 0.0 and vertex.co.z > 1.28 and any(
                name.startswith(("chest", "clavicle.R", "upper_arm.R")) for name in deform_names
            )
            arm_zone = any(name.startswith(("clavicle.", "upper_arm.", "forearm.")) for name in deform_names)
            allowance_buckets[0.28 if firing_shoulder else 0.62 if arm_zone else 1.0].append(vertex.index)
    if not covered_indices:
        raise RuntimeError("Tailored undersuit coverage resolved to zero vertices")
    coverage.add(covered_indices, 1.0, "REPLACE")
    for weight, indices in allowance_buckets.items():
        if indices:
            allowance_group.add(indices, weight, "REPLACE")

    # Reassign the copied surface as actual garment construction.  The restrained
    # contrast is visible at normal gameplay distance without reverting to painted
    # anatomy or floating bright armor slabs.
    counts = {"mainWeave": 0, "jointFlex": 0, "wovenReinforcement": 0}
    for polygon in garment.data.polygons:
        center = sum((garment.data.vertices[index].co for index in polygon.vertices), Vector()) / len(polygon.vertices)
        names: set[str] = set()
        for index in polygon.vertices:
            for item in garment.data.vertices[index].groups:
                if item.weight >= 0.22:
                    names.add(group_names.get(item.group, ""))
        wrist_cuff = any(name.startswith("wrist.") for name in names)
        if wrist_cuff:
            polygon.material_index = 1
            key = "jointFlex"
        else:
            polygon.material_index = 0
            key = "mainWeave"
        polygon.use_smooth = True
        counts[key] += 1

    # Multires and its rest-bound corrective data belong to the sealed sculpt and
    # cannot safely follow a masked topology (interpolated mask boundaries created
    # long render spikes in the rejected first shell attempt).  Remove them only
    # from this duplicate, delete excluded vertices, and rebuild a clean garment
    # evaluation stack around the still-intact armature modifier and weights.
    for modifier in list(garment.modifiers):
        if modifier.type != "ARMATURE":
            garment.modifiers.remove(modifier)
    covered_set = set(covered_indices)
    bpy.ops.object.select_all(action="DESELECT")
    garment.select_set(True)
    bpy.context.view_layer.objects.active = garment
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="DESELECT")
    bpy.ops.object.mode_set(mode="OBJECT")
    for vertex in garment.data.vertices:
        vertex.select = vertex.index not in covered_set
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.delete(type="VERT")
    bpy.ops.object.mode_set(mode="OBJECT")

    smooth = garment.modifiers.new("TailoredClothSurfaceRelax", "SMOOTH")
    smooth.factor = 0.44
    smooth.iterations = 5
    smooth.use_x = True
    smooth.use_y = True
    smooth.use_z = True
    subdivision = garment.modifiers.new("TailoredClothSubdivision", "SUBSURF")
    subdivision.subdivision_type = "CATMULL_CLARK"
    subdivision.levels = 2
    subdivision.render_levels = 2
    # The garment is an intentionally open surface at collar/cuffs/boot entries.
    # Constant normal offset supplies the visible cloth allowance without asking
    # Solidify to bridge those non-manifold boundaries (which was rejected after
    # it produced large spike faces on the first trimmed-shell evaluation).
    cloth_allowance = garment.modifiers.new("TailoredClothAllowance", "DISPLACE")
    cloth_allowance.direction = "NORMAL"
    cloth_allowance.strength = 0.0120
    cloth_allowance.mid_level = 0.0
    cloth_allowance.vertex_group = allowance_group.name

    garment["kyx_checkpoint"] = CHECKPOINT
    garment["kyx_role"] = "continuous one-piece tailored combat undersuit with integrated flex and reinforcement regions"
    garment["kyx_detail_tier"] = "primary"
    garment["kyx_surface_source"] = BODY_NAME
    garment["kyx_deformation_policy"] = "independent copied base mesh retaining accepted 52-bone skin weights; garment-only smooth/subdivision/normal-allowance stack"
    garment["kyx_contact_policy"] = "duplicate topology excludes head, hands, wrists, digits, and feet so rev11b contact geometry stays authoritative"
    garment["kyx_coverage_vertices"] = len(garment.data.vertices)
    return garment, counts


def extract_body_shell(
    name: str,
    body: bpy.types.Object,
    rig: bpy.types.Object,
    groups: tuple[str, ...],
    selector,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    bone: str,
    offset: float = 0.005,
    thickness: float = 0.004,
    bevel: float = 0.0015,
    tier: str = "primary",
) -> bpy.types.Object:
    """Copy a bounded region of the *posed* accepted body as a fitted rigid shell.

    This deliberately derives only the new garment/armor surface.  The accepted
    source body mesh, weights, modifiers, rig, and pose are never edited.
    """
    topology_states = {
        modifier.name: modifier.show_viewport
        for modifier in body.modifiers
        if modifier.type in {"MULTIRES", "SUBSURF", "REMESH"}
    }
    for modifier_name in topology_states:
        body.modifiers[modifier_name].show_viewport = False
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = body.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    group_ids = {body.vertex_groups[group].index for group in groups if group in body.vertex_groups}
    normal_matrix = evaluated.matrix_world.to_3x3().inverted().transposed()

    def combined_weight(vertex_index: int) -> float:
        return sum(item.weight for item in body.data.vertices[vertex_index].groups if item.group in group_ids)

    selected: list[bpy.types.MeshPolygon] = []
    for polygon in mesh.polygons:
        center = evaluated.matrix_world @ polygon.center
        normal = (normal_matrix @ polygon.normal).normalized()
        weight = sum(combined_weight(index) for index in polygon.vertices) / len(polygon.vertices)
        if selector(center, normal, weight):
            selected.append(polygon)
    if not selected:
        evaluated.to_mesh_clear()
        for modifier_name, visible in topology_states.items():
            body.modifiers[modifier_name].show_viewport = visible
        bpy.context.view_layer.update()
        raise RuntimeError(f"No body polygons selected for {name}")

    used = sorted({index for polygon in selected for index in polygon.vertices})
    remap = {old: new for new, old in enumerate(used)}
    vertices: list[tuple[float, float, float]] = []
    for index in used:
        vertex = mesh.vertices[index]
        world = evaluated.matrix_world @ vertex.co
        normal = (normal_matrix @ vertex.normal).normalized()
        vertices.append(tuple(world + normal * offset))
    faces = [tuple(remap[index] for index in polygon.vertices) for polygon in selected]
    evaluated.to_mesh_clear()
    for modifier_name, visible in topology_states.items():
        body.modifiers[modifier_name].show_viewport = visible
    bpy.context.view_layer.update()

    obj = add_mesh(
        name, vertices, faces, collection, mat, role,
        solidify=0.0, bevel=0.0, tier=tier, bone=bone,
    )
    obj["kyx_surface_source"] = BODY_NAME
    obj["kyx_surface_method"] = "posed accepted-body region copy with normal offset"
    obj["kyx_source_groups"] = ",".join(groups)
    obj["kyx_open_surface_reason"] = "non-manifold region boundaries retained without bevel/solidify to prevent render spikes"
    obj["kyx_requested_shell_offset"] = offset
    bone_parent_keep_world(obj, rig, bone)
    return obj


def posed_foot_center(body: bpy.types.Object, sign: float) -> float:
    topology_states = {
        modifier.name: modifier.show_viewport
        for modifier in body.modifiers
        if modifier.type in {"MULTIRES", "SUBSURF", "REMESH"}
    }
    for modifier_name in topology_states:
        body.modifiers[modifier_name].show_viewport = False
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = body.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    evaluated.to_mesh_clear()
    for modifier_name, visible in topology_states.items():
        body.modifiers[modifier_name].show_viewport = visible
    bpy.context.view_layer.update()
    candidates = [point.x for point in points if point.z < 0.18 and point.x * sign > 0.0]
    if not candidates:
        raise RuntimeError("Could not resolve posed foot center")
    return (min(candidates) + max(candidates)) * 0.5


def fitted_grid_panel(
    name: str,
    body: bpy.types.Object,
    rig: bpy.types.Object,
    groups: tuple[str, ...],
    rows: list[tuple[float, float]],
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    *,
    bone: str,
    front: bool = True,
    center_x: float = 0.0,
    across: int = 15,
    offset: float = 0.010,
    thickness: float = 0.005,
    bevel: float = 0.0018,
    tier: str = "primary",
) -> bpy.types.Object:
    """Build a clean-edged grid and fit it to the posed torso point cloud."""
    topology_states = {
        modifier.name: modifier.show_viewport
        for modifier in body.modifiers
        if modifier.type in {"MULTIRES", "SUBSURF", "REMESH"}
    }
    for modifier_name in topology_states:
        body.modifiers[modifier_name].show_viewport = False
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = body.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    group_ids = {body.vertex_groups[group].index for group in groups if group in body.vertex_groups}
    normal_matrix = evaluated.matrix_world.to_3x3().inverted().transposed()
    cloud: list[tuple[Vector, Vector, float]] = []
    for index, vertex in enumerate(mesh.vertices):
        weight = sum(item.weight for item in body.data.vertices[index].groups if item.group in group_ids)
        if weight < 0.24:
            continue
        point = evaluated.matrix_world @ vertex.co
        normal = (normal_matrix @ vertex.normal).normalized()
        if (front and normal.y < -0.08) or (not front and normal.y > 0.08):
            cloud.append((point, normal, weight))
    if not cloud:
        evaluated.to_mesh_clear()
        for modifier_name, visible in topology_states.items():
            body.modifiers[modifier_name].show_viewport = visible
        bpy.context.view_layer.update()
        raise RuntimeError(f"No fitted point cloud for {name}")

    vertices: list[tuple[float, float, float]] = []
    for z, half_width in rows:
        for column in range(across):
            x = center_x - half_width + 2.0 * half_width * column / (across - 1)
            nearest = sorted(
                cloud,
                key=lambda item: (item[0].x - x) ** 2 + ((item[0].z - z) * 1.35) ** 2,
            )[:12]
            weighted_y = 0.0
            total = 0.0
            for point, normal, group_weight in nearest:
                distance_sq = (point.x - x) ** 2 + ((point.z - z) * 1.35) ** 2
                influence = group_weight / max(distance_sq, 1e-7)
                weighted_y += point.y * influence
                total += influence
            y = weighted_y / total
            vertices.append((x, y + (-offset if front else offset), z))
    faces: list[tuple[int, ...]] = []
    for row in range(len(rows) - 1):
        for column in range(across - 1):
            a = row * across + column
            faces.append((a, a + 1, a + across + 1, a + across))
    evaluated.to_mesh_clear()
    for modifier_name, visible in topology_states.items():
        body.modifiers[modifier_name].show_viewport = visible
    bpy.context.view_layer.update()

    obj = add_mesh(
        name, vertices, faces, collection, mat, role,
        solidify=thickness, bevel=bevel, subdiv=1, tier=tier, bone=bone,
    )
    obj["kyx_surface_source"] = BODY_NAME
    obj["kyx_surface_method"] = "clean topology grid fitted to posed weighted body point cloud"
    obj["kyx_source_groups"] = ",".join(groups)
    bone_parent_keep_world(obj, rig, bone)
    return obj


def elliptical_band(
    name: str,
    rows: list[tuple[float, float, float]],
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    rig: bpy.types.Object,
    *,
    bone: str,
    segments: int = 36,
    thickness: float = 0.003,
    bevel: float = 0.0015,
    tier: str = "secondary",
    center_x: float = 0.0,
    center_y: float = 0.0,
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    for z, radius_x, radius_y in rows:
        for index in range(segments):
            angle = math.tau * index / segments
            vertices.append((center_x + math.sin(angle) * radius_x, center_y + math.cos(angle) * radius_y, z))
    faces: list[tuple[int, ...]] = []
    for row in range(len(rows) - 1):
        for index in range(segments):
            nxt = (index + 1) % segments
            a = row * segments + index
            faces.append((a, row * segments + nxt, (row + 1) * segments + nxt, a + segments))
    obj = add_mesh(name, vertices, faces, collection, mat, role, solidify=thickness, bevel=bevel, tier=tier, bone=bone)
    bone_parent_keep_world(obj, rig, bone)
    return obj


def oriented_cuff(
    name: str,
    start: Vector,
    end: Vector,
    radius: float,
    collection: bpy.types.Collection,
    mat: bpy.types.Material,
    role: str,
    rig: bpy.types.Object,
    *,
    bone: str,
    segments: int = 28,
    radial_thickness: float = 0.0035,
    tier: str = "secondary",
) -> bpy.types.Object:
    """Build a short hollow band aligned to a posed limb segment."""
    axis = end - start
    if axis.length < 1e-6:
        raise RuntimeError(f"Degenerate cuff axis for {name}")
    axis.normalize()
    reference = UP if abs(axis.dot(UP)) < 0.86 else RIGHT
    basis_u = axis.cross(reference).normalized()
    basis_v = axis.cross(basis_u).normalized()
    inner_radius = max(0.001, radius - radial_thickness)
    vertices: list[tuple[float, float, float]] = []
    for center, ring_radius in ((start, radius), (end, radius), (start, inner_radius), (end, inner_radius)):
        for index in range(segments):
            angle = math.tau * index / segments
            point = center + basis_u * (math.cos(angle) * ring_radius) + basis_v * (math.sin(angle) * ring_radius)
            vertices.append(tuple(point))
    faces: list[tuple[int, ...]] = []
    for index in range(segments):
        nxt = (index + 1) % segments
        # Outer and inner walls.
        faces.append((index, nxt, segments + nxt, segments + index))
        faces.append((2 * segments + nxt, 2 * segments + index, 3 * segments + index, 3 * segments + nxt))
        # Annular end caps.
        faces.append((nxt, index, 2 * segments + index, 2 * segments + nxt))
        faces.append((segments + index, segments + nxt, 3 * segments + nxt, 3 * segments + index))
    obj = add_mesh(name, vertices, faces, collection, mat, role, bevel=0.0012, tier=tier, bone=bone)
    bone_parent_keep_world(obj, rig, bone)
    return obj


def build_tailoring_details(
    collection: bpy.types.Collection,
    detail: bpy.types.Collection,
    mats: dict[str, bpy.types.Material],
    rig: bpy.types.Object,
    body: bpy.types.Object,
) -> list[bpy.types.Object]:
    """Add restrained construction cues that survive normal-size review."""
    objects: list[bpy.types.Object] = []
    # Bridge the sculpt's narrow lumbar-to-hip transition with one continuous
    # tailored cloth volume.  Its soft profile reads as garment construction and
    # stops the source anatomy islands from reading as a mannequin waist gap.
    waist_bridge = elliptical_band(
        "Undersuit_ContinuousWaistBridge",
        [
            (0.925, 0.148, 0.100),
            (0.952, 0.157, 0.114),
            (0.980, 0.158, 0.126),
            (1.008, 0.141, 0.128),
            (1.038, 0.130, 0.119),
            (1.068, 0.123, 0.110),
        ],
        collection, mats["flex"], "continuous tailored lumbar-to-trouser waist transition", rig,
        bone="spine_01", thickness=0.0, bevel=0.0, center_y=-0.004,
    )
    bridge_subdivision = waist_bridge.modifiers.new("TailoredWaistBridgeSubdivision", "SUBSURF")
    bridge_subdivision.subdivision_type = "CATMULL_CLARK"
    bridge_subdivision.levels = 1
    bridge_subdivision.render_levels = 1
    objects.append(waist_bridge)
    # The waist transition and glove cuffs are material-built directly on the
    # continuous skinned garment.  Construction seams below use short mesh
    # segments instead of Bezier tubes, preventing endpoint-handle overshoot.
    for sign, label in ((-1.0, "R"), (1.0, "L")):
        shoulder_points = [
            Vector((sign * 0.045, -0.095, 1.482)),
            Vector((sign * 0.095, -0.098, 1.472)),
            Vector((sign * 0.145, -0.087, 1.448)),
            Vector((sign * 0.185, -0.066, 1.415)),
        ]
        for index in range(len(shoulder_points) - 1):
            seam = cylinder_between(
                f"Undersuit_ShoulderSeam_{label}_{index+1}",
                shoulder_points[index], shoulder_points[index + 1], 0.0019,
                detail, mats["stitch"], "tailored shoulder construction seam",
                vertices=12, bevel=0.00045, tier="tertiary", bone="chest",
            )
            bone_parent_keep_world(seam, rig, "chest")
            objects.append(seam)

        side_points = [
            Vector((sign * 0.158, 0.008, 1.015)),
            Vector((sign * 0.146, 0.004, 1.110)),
            Vector((sign * 0.151, -0.004, 1.230)),
            Vector((sign * 0.154, -0.012, 1.345)),
            Vector((sign * 0.143, -0.018, 1.420)),
        ]
        for index in range(len(side_points) - 1):
            seam = cylinder_between(
                f"Undersuit_SideSeam_{label}_{index+1}",
                side_points[index], side_points[index + 1], 0.0018,
                detail, mats["stitch"], "continuous torso side seam",
                vertices=12, bevel=0.0004, tier="tertiary", bone="spine_02",
            )
            bone_parent_keep_world(seam, rig, "spine_02")
            objects.append(seam)

        center_x = sign * 0.114
        objects.append(fitted_grid_panel(
            f"Undersuit_ThighUtilityPanel_{label}", body, rig,
            (f"thigh_anchor.{label}",),
            [(0.680, 0.022), (0.730, 0.033), (0.790, 0.036), (0.840, 0.027)],
            collection, mats["reinforcement"], "compact fitted thigh utility textile panel",
            bone=f"thigh_anchor.{label}", center_x=sign * 0.145, across=7,
            offset=0.0042, thickness=0.0018, bevel=0.0008, tier="secondary",
        ))
        objects.append(fitted_grid_panel(
            f"Undersuit_KneeReinforcement_{label}", body, rig,
            (f"thigh_anchor.{label}", f"shin_anchor.{label}"),
            [(0.472, 0.034), (0.505, 0.047), (0.555, 0.049), (0.600, 0.035)],
            collection, mats["reinforcement"], "integrated articulated woven knee reinforcement",
            bone=f"shin_anchor.{label}", center_x=center_x, across=9,
            offset=0.0045, thickness=0.0022, bevel=0.0009, tier="secondary",
        ))
    return objects


def build_helmet(collection: bpy.types.Collection, detail: bpy.types.Collection, mats: dict[str, bpy.types.Material], rig: bpy.types.Object, body: bpy.types.Object) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    objects.append(extract_body_shell(
        "Helmet_TailoredUnderShell", body, rig, ("head",),
        lambda center, normal, weight: weight > 0.42 and center.z > 1.535,
        collection, mats["ceramic_dark"], "close-fitted ballistic under-shell", bone="head", offset=0.006, thickness=0.004,
    ))
    helmet_center = Vector((0.0, -0.004, 1.665))
    helmet_radii = (0.097, 0.106, 0.121)
    objects.extend((
        ellipsoid_patch(
            "Helmet_CrownCenter", helmet_center, helmet_radii, (0.05, 0.96), (-0.48, 0.48),
            collection, mats["ceramic"], "narrow interlocking crown center plate", thickness=0.006, bevel=0.0022, bone="head",
        ),
        ellipsoid_patch(
            "Helmet_CrownLeft", helmet_center, helmet_radii, (0.12, 1.12), (0.55, 1.48),
            collection, mats["ceramic"], "layered left crown plate", thickness=0.005, bevel=0.0020, bone="head",
        ),
        ellipsoid_patch(
            "Helmet_CrownRight", helmet_center, helmet_radii, (0.12, 1.12), (-1.48, -0.55),
            collection, mats["ceramic"], "layered right crown plate", thickness=0.005, bevel=0.0020, bone="head",
        ),
        ellipsoid_patch(
            "Helmet_OccipitalArmor", helmet_center, helmet_radii, (0.18, 1.12), (1.66, 4.62),
            collection, mats["gunmetal"], "close-fitted rear occipital carrier", thickness=0.005, bevel=0.0020, bone="head",
        ),
    ))
    visor = curved_panel(
        "Helmet_Visor", Vector((0.0, -0.119, 1.665)), Vector((1, 0, 0)), UP, Vector((0, -1, 0)),
        [0.038, 0.056, 0.065, 0.056, 0.038], 0.068, collection, mats["visor"], "compact recessed ballistic visor",
        across=11, crown=0.006, thickness=0.005, bevel=0.0020, bone="head",
    )
    objects.append(visor)
    for side, label in ((-1, "R"), (1, "L")):
        cheek_normal = Vector((side * 0.30, -0.954, 0.0))
        cheek = curved_panel(
            f"Helmet_Cheek_{label}", Vector((side * 0.063, -0.101, 1.618)), Vector((1, 0, 0)), UP, cheek_normal,
            [0.016, 0.025, 0.028, 0.022, 0.014], 0.070, collection, mats["ceramic"], "compact layered cheek and jaw plate",
            across=7, crown=0.004, thickness=0.005, bevel=0.0020, bone="head",
        )
        objects.append(cheek)
        temple = cylinder_between(
            f"Helmet_TemplePivot_{label}", Vector((side * 0.096, -0.006, 1.658)), Vector((side * 0.108, -0.006, 1.658)),
            0.014, detail, mats["gunmetal"], "recessed helmet articulation pivot", vertices=24, bevel=0.0020, tier="tertiary", bone="head",
        )
        objects.append(temple)
    brow = curved_panel(
        "Helmet_BrowBridge", Vector((0.0, -0.116, 1.707)), Vector((1, 0, 0)), UP, Vector((0, -1, 0)),
        [0.034, 0.058, 0.068, 0.050], 0.034, collection, mats["gunmetal"], "low-profile brow and crown bridge",
        across=9, crown=0.005, thickness=0.006, bevel=0.0022, bone="head",
    )
    objects.append(brow)
    chin = curved_panel(
        "Helmet_ChinBridge", Vector((0.0, -0.108, 1.586)), Vector((1, 0, 0)), UP, Vector((0, -1, 0)),
        [0.026, 0.040, 0.043, 0.034], 0.034, collection, mats["gunmetal"], "fitted chin bridge with neck clearance",
        across=9, crown=0.004, thickness=0.006, bevel=0.0022, bone="head",
    )
    objects.append(chin)
    gasket = curve_tube(
        "Helmet_VisorGasket",
        [Vector((-0.055, -0.127, 1.634)), Vector((-0.068, -0.127, 1.665)), Vector((-0.054, -0.127, 1.697)), Vector((0.0, -0.130, 1.704)), Vector((0.054, -0.127, 1.697)), Vector((0.068, -0.127, 1.665)), Vector((0.055, -0.127, 1.634)), Vector((0.0, -0.130, 1.626))],
        0.0022, detail, mats["edge"], "continuous visor seal", cyclic=True, bone="head",
    )
    objects.append(gasket)
    crown_keel = curve_tube(
        "Helmet_CrownKeel",
        [Vector((0.0, -0.111, 1.704)), Vector((0.0, -0.071, 1.760)), Vector((0.0, 0.002, 1.785)), Vector((0.0, 0.078, 1.738))],
        0.0025, detail, mats["edge"], "manufactured crown keel", bone="head",
    )
    objects.append(crown_keel)
    telemetry = curve_tube(
        "Helmet_LeftTelemetry", [Vector((0.084, -0.052, 1.680)), Vector((0.098, -0.018, 1.692))],
        0.0022, detail, mats["cyan"], "restrained helmet telemetry", tier="tertiary", bone="head",
    )
    objects.append(telemetry)
    for obj in objects:
        bone_parent_keep_world(obj, rig, "head")
    return objects


def build_torso(collection: bpy.types.Collection, detail: bpy.types.Collection, mats: dict[str, bpy.types.Material], rig: bpy.types.Object, body: bpy.types.Object) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    torso_groups = ("chest", "spine_02", "spine_01")
    objects.append(elliptical_band(
        "Torso_TechnicalGorget",
        [(1.486, 0.086, 0.073), (1.516, 0.097, 0.086), (1.548, 0.078, 0.071)],
        collection, mats["flex"], "layered technical-cloth neck gorget", rig, bone="neck", thickness=0.004, bevel=0.0018,
    ))
    objects.append(elliptical_band(
        "Torso_GorgetLoadRing",
        [(1.497, 0.092, 0.081), (1.510, 0.096, 0.085)],
        detail, mats["gunmetal"], "manufactured gorget load ring", rig, bone="neck", thickness=0.003, bevel=0.0015, tier="tertiary",
    ))
    objects.append(fitted_grid_panel(
        "Chest_ContinuousCeramic", body, rig, torso_groups,
        [(1.255, 0.085), (1.285, 0.118), (1.335, 0.140), (1.390, 0.132), (1.440, 0.095)],
        collection, mats["ceramic"], "support-biased clean-edged body-fitted clavicle and chest armor", bone="chest", center_x=0.022, offset=0.010, thickness=0.005, bevel=0.0020,
    ))
    objects.append(fitted_grid_panel(
        "Chest_LowerRibCarrier", body, rig, torso_groups,
        [(1.150, 0.072), (1.185, 0.102), (1.225, 0.112), (1.260, 0.092)],
        collection, mats["ceramic_dark"], "support-biased fitted lower-rib carrier", bone="spine_02", center_x=0.014, offset=0.008, thickness=0.004, bevel=0.0018,
    ))
    objects.append(fitted_grid_panel(
        "Back_ContinuousScapularCarrier", body, rig, torso_groups,
        [(1.195, 0.090), (1.245, 0.135), (1.330, 0.165), (1.405, 0.145), (1.445, 0.095)],
        collection, mats["ceramic_dark"], "continuous fitted rear scapular carrier", bone="chest", front=False, offset=0.010, thickness=0.005, bevel=0.0020,
    ))
    objects.append(fitted_grid_panel(
        "Chest_SternumKeel", body, rig, torso_groups,
        [(1.260, 0.023), (1.320, 0.030), (1.385, 0.027), (1.438, 0.018)],
        detail, mats["gunmetal"], "surface-fitted sternum load keel", bone="chest", across=7, offset=0.020, thickness=0.005, bevel=0.0018, tier="secondary",
    ))
    for index, (lower, upper, width) in enumerate(((1.074, 1.107, 0.075), (1.112, 1.145, 0.086), (1.150, 1.183, 0.096))):
        objects.append(fitted_grid_panel(
            f"Abdomen_FlexLamella_{index+1}", body, rig, torso_groups,
            [(lower, width * 0.82), (upper, width)],
            collection, mats["gunmetal"], "body-fitted articulated abdominal lamella", bone="spine_02", across=11, offset=0.009, thickness=0.004, bevel=0.0016, tier="secondary",
        ))
    for sign, label in ((1.0, "L"),):
        objects.append(fitted_grid_panel(
            f"Chest_{label}_SideLoadCarrier", body, rig, torso_groups,
            [(1.205, 0.024), (1.275, 0.038), (1.355, 0.042), (1.425, 0.030)],
            collection, mats["ceramic_mid"], "continuous chest-to-side load carrier", bone="chest",
            center_x=sign * 0.125, across=7, offset=0.015, thickness=0.0045, bevel=0.0018, tier="secondary",
        ))
    telemetry = curve_tube(
        "Chest_Telemetry", [Vector((0.0, -0.205, 1.324)), Vector((0.0, -0.208, 1.380))],
        0.0020, detail, mats["cyan"], "restrained sternum telemetry index", tier="tertiary", bone="chest",
    )
    bone_parent_keep_world(telemetry, rig, "chest")
    objects.append(telemetry)
    return objects


def build_limb_armor(collection: bpy.types.Collection, detail: bpy.types.Collection, mats: dict[str, bpy.types.Material], rig: bpy.types.Object, body: bpy.types.Object) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    # Body-derived shells remove the old half-scale anchor mismatch.  The firing
    # shoulder remains soft and unobstructed for the sealed stock contact.
    for side, label in (("R", "Firing"), ("L", "Support")):
        sign = -1.0 if side == "R" else 1.0
        objects.append(extract_body_shell(
            f"{label}Forearm_FittedGuard", body, rig, (f"forearm.{side}",),
            lambda center, normal, weight, sign=sign: weight > 0.50 and normal.x * sign > -0.55,
            collection, mats["ceramic_dark"], "surface-conforming forearm guard with wrist clearance", bone=f"forearm.{side}", offset=0.009, thickness=0.0045, bevel=0.0018,
        ))
    return objects


def sole_loft(name: str, side: str, cx: float, collection: bpy.types.Collection, mat: bpy.types.Material, rig: bpy.types.Object) -> bpy.types.Object:
    stations = [
        (0.085, 0.047, 0.026, 0.021),
        (0.030, 0.052, 0.026, 0.022),
        (-0.040, 0.057, 0.025, 0.022),
        (-0.105, 0.060, 0.024, 0.020),
        (-0.155, 0.050, 0.023, 0.018),
        (-0.184, 0.036, 0.024, 0.014),
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


def boot_upper_loft(name: str, side: str, cx: float, collection: bpy.types.Collection, mat: bpy.types.Material, rig: bpy.types.Object) -> bpy.types.Object:
    """Closed anatomical boot volume that conceals toes without a wedge profile."""
    stations = [
        (0.108, 0.071, 0.103, 0.086),
        (0.050, 0.073, 0.092, 0.076),
        (-0.030, 0.075, 0.074, 0.058),
        (-0.103, 0.074, 0.057, 0.041),
        (-0.158, 0.066, 0.045, 0.030),
        (-0.187, 0.044, 0.040, 0.021),
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


def build_boots(collection: bpy.types.Collection, detail: bpy.types.Collection, mats: dict[str, bpy.types.Material], rig: bpy.types.Object, body: bpy.types.Object) -> list[bpy.types.Object]:
    objects: list[bpy.types.Object] = []
    for side, label, sign in (("R", "R", -1.0), ("L", "L", 1.0)):
        cx = posed_foot_center(body, sign)
        sole = sole_loft(f"Boot_{label}_ContouredOutsole", side, cx, collection, mats["rubber"], rig)
        upper = boot_upper_loft(f"Boot_{label}_AnatomicalUpper", side, cx, collection, mats["boot"], rig)
        objects.extend((sole, upper))
        toe = curved_panel(
            f"Boot_{label}_ToeCap", Vector((cx, -0.112, 0.087)), Vector((1, 0, 0)), Vector((0, -1, 0)), UP,
            [0.038, 0.056, 0.062, 0.054, 0.034], 0.072, collection, mats["ceramic_dark"], "fitted toe-cap shell",
            across=9, crown=0.008, thickness=0.006, bevel=0.0028, bone=f"foot_anchor.{side}",
        )
        objects.append(toe)
        bone_parent_keep_world(toe, rig, f"foot_anchor.{side}")
        # Two seated retention bridges replace the floating curve laces.
        for index, y in enumerate((-0.050, -0.094)):
            bridge = profile_volume_basis(
                f"Boot_{label}_RetentionBridge_{index+1}", Vector((cx, y, 0.126 - index * 0.016)), Vector((1, 0, 0)), Vector((0, -1, 0)), UP,
                [(-0.036, -0.008), (0.036, -0.008), (0.040, 0.008), (-0.040, 0.008)], 0.004,
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
    # One continuous receiver establishes the primary silhouette; thinner
    # overlays, ports, fasteners, and rails provide material/scale breakup.
    receiver = add_weapon_profile(
        "Rifle_Receiver",
        [(-0.160, 0.050), (-0.120, 0.188), (0.168, 0.192), (0.242, 0.142), (0.218, 0.045), (0.146, 0.012), (-0.105, 0.014)],
        0.104, collection, mats["gunmetal"], "continuous forged receiver with grip and trigger clearance", bevel=0.008,
    )
    objects.append(receiver)
    objects.append(add_weapon_profile(
        "Rifle_ReceiverUpperShell",
        [(-0.110, 0.142), (-0.070, 0.180), (0.145, 0.180), (0.205, 0.138), (0.168, 0.092), (-0.082, 0.092)],
        0.112, detail, mats["ceramic"], "fitted receiver upper ceramic shell", bevel=0.0045, tier="secondary",
    ))
    objects.append(add_weapon_profile(
        "Rifle_ReceiverLowerRail",
        [(-0.090, 0.030), (0.178, 0.030), (0.205, 0.061), (0.150, 0.080), (-0.085, 0.075)],
        0.110, detail, mats["ceramic_dark"], "receiver lower structural rail", bevel=0.0035, tier="secondary",
    ))
    objects.append(add_weapon_profile(
        "Rifle_EjectionPort", [(-0.015, 0.139), (0.108, 0.139), (0.130, 0.112), (0.105, 0.082), (-0.030, 0.082), (-0.045, 0.108)],
        0.118, detail, mats["flex"], "recessed ejection port", bevel=0.0020, tier="tertiary",
    ))

    # Open stock architecture terminates around, never through, the exact pad.
    objects.append(add_weapon_profile(
        "Rifle_StockSpine", [(-0.268, 0.222), (-0.115, 0.194), (-0.078, 0.153), (-0.118, 0.128), (-0.248, 0.150)],
        0.094, collection, mats["gunmetal"], "open stock upper cheek spine", bevel=0.005,
    ))
    objects.append(add_weapon_profile(
        "Rifle_StockLowerRail", [(-0.255, 0.065), (-0.118, 0.085), (-0.078, 0.120), (-0.105, 0.142), (-0.245, 0.112)],
        0.086, collection, mats["ceramic_dark"], "open stock lower load rail", bevel=0.004,
    ))
    objects.append(add_weapon_profile(
        "Rifle_StockCheekInset", [(-0.228, 0.202), (-0.125, 0.183), (-0.107, 0.158), (-0.220, 0.171)],
        0.102, detail, mats["ceramic"], "stock cheek weld inset", bevel=0.003, tier="secondary",
    ))

    # A coherent free-float handguard encloses the barrel while its dark insets
    # read as real cooling apertures at normal gameplay distance.
    objects.append(add_weapon_profile(
        "Rifle_HandguardBody", [(0.185, 0.046), (0.705, 0.052), (0.735, 0.088), (0.718, 0.162), (0.202, 0.174), (0.170, 0.142)],
        0.100, collection, mats["ceramic"], "continuous free-float handguard body", bevel=0.006,
    ))
    objects.append(add_weapon_profile(
        "Rifle_HandguardLowerRail", [(0.205, 0.030), (0.680, 0.034), (0.705, 0.058), (0.205, 0.062)],
        0.106, detail, mats["gunmetal"], "handguard lower load rail", bevel=0.003, tier="secondary",
    ))
    objects.append(add_weapon_profile(
        "Rifle_HandguardTopRail", [(0.175, 0.170), (0.720, 0.170), (0.742, 0.198), (0.180, 0.202)],
        0.096, detail, mats["gunmetal"], "continuous handguard top rail", bevel=0.003, tier="secondary",
    ))
    for index, (start, end) in enumerate(((0.250, 0.318), (0.348, 0.416), (0.446, 0.514), (0.544, 0.612), (0.640, 0.690))):
        objects.append(add_weapon_profile(
            f"Rifle_HandguardVent_{index+1}", [(start, 0.104), (start + 0.014, 0.130), (end, 0.130), (end - 0.014, 0.104), (end - 0.004, 0.086), (start + 0.004, 0.086)],
            0.112, detail, mats["flex"], "recessed handguard cooling aperture", bevel=0.0020, tier="tertiary",
        ))
    objects.append(add_weapon_profile(
        "Rifle_GasBlock", [(0.690, 0.066), (0.760, 0.070), (0.768, 0.152), (0.700, 0.160)],
        0.088, collection, mats["gunmetal"], "machined gas block and barrel seat", bevel=0.004,
    ))

    magazine = add_weapon_profile(
        "Rifle_Magazine", [(0.018, 0.018), (0.130, 0.016), (0.125, -0.084), (0.108, -0.188), (0.035, -0.205), (0.012, -0.064)],
        0.074, collection, mats["gunmetal"], "curved detachable magazine", bevel=0.0055,
    )
    objects.append(magazine)
    objects.append(add_weapon_profile(
        "Rifle_Magwell", [(-0.002, 0.040), (0.148, 0.038), (0.160, -0.010), (0.010, -0.014)],
        0.108, detail, mats["ceramic_dark"], "reinforced magazine well", bevel=0.0035, tier="secondary",
    ))
    for index, t in enumerate((0.047, 0.071, 0.095)):
        objects.append(add_weapon_profile(
            f"Rifle_MagazineRib_{index+1}", [(t, -0.010), (t + 0.008, -0.010), (t + 0.004, -0.170), (t - 0.004, -0.165)],
            0.080, detail, mats["edge"], "pressed magazine reinforcement rib", bevel=0.0012, tier="tertiary",
        ))
    optic = add_weapon_profile(
        "Rifle_Optic", [(-0.052, 0.202), (0.092, 0.202), (0.122, 0.232), (0.098, 0.264), (-0.070, 0.264), (-0.096, 0.232)],
        0.072, collection, mats["gunmetal"], "low-profile enclosed combat optic", bevel=0.005,
    )
    objects.append(optic)
    optic_lens = profile_volume_basis(
        "Rifle_OpticLens", GRIP + FORWARD * -0.102 + UP * 0.235, RIGHT, UP, FORWARD,
        [(-0.022, 0.022), (0.022, 0.022), (0.022, -0.022), (-0.022, -0.022)], 0.005,
        detail, mats["cyan"], "optic glass index", bevel=0.002, tier="tertiary", bone="palm.R",
    )
    objects.append(optic_lens)
    barrel_start = GRIP + FORWARD * 0.700 + UP * 0.112
    barrel_end = GRIP + FORWARD * 1.000 + UP * 0.112
    barrel = cylinder_between("Rifle_FreeFloatBarrel", barrel_start, barrel_end, 0.013, collection, mats["gunmetal"], "free-float barrel", vertices=32, bevel=0.0018, bone="palm.R")
    muzzle = cylinder_between("Rifle_MuzzleBrake", barrel_end, barrel_end + FORWARD * 0.108, 0.024, collection, mats["edge"], "ported muzzle brake", vertices=32, bevel=0.0025, bone="palm.R")
    objects.extend((barrel, muzzle))
    for index, t in enumerate((0.195, 0.255, 0.315, 0.375, 0.435, 0.495, 0.555, 0.615, 0.675, 0.725)):
        tooth = profile_volume_basis(
            f"Rifle_RailTooth_{index+1}", GRIP + FORWARD * t + UP * 0.205, RIGHT, UP, FORWARD,
            [(-0.024, -0.006), (0.024, -0.006), (0.024, 0.006), (-0.024, 0.006)], 0.016,
            detail, mats["edge"], "machined top rail tooth", bevel=0.001, tier="tertiary", bone="palm.R",
        )
        objects.append(tooth)
    for index, t in enumerate((-0.075, 0.075, 0.175, 0.285, 0.665)):
        center = GRIP + FORWARD * t + UP * (0.118 if t < 0.25 else 0.145)
        fastener = cylinder_between(
            f"Rifle_SideFastener_{index+1}", center + RIGHT * 0.054, center + RIGHT * 0.063,
            0.006, detail, mats["edge"], "recessed receiver and handguard fastener", vertices=20, bevel=0.0010, tier="tertiary", bone="palm.R",
        )
        objects.append(fastener)
    status = curve_tube(
        "Rifle_StatusLight", [GRIP + FORWARD * 0.008 + RIGHT * 0.061 + UP * 0.153, GRIP + FORWARD * 0.062 + RIGHT * 0.061 + UP * 0.153],
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

    undersuit, undersuit_regions = build_tailored_undersuit(collections["garment"], mats, rig, body)
    tailoring = build_tailoring_details(collections["garment"], collections["detail"], mats, rig, body)
    helmet = build_helmet(collections["armor"], collections["detail"], mats, rig, body)
    torso = build_torso(collections["armor"], collections["detail"], mats, rig, body)
    limbs = build_limb_armor(collections["armor"], collections["detail"], mats, rig, body)
    boots = build_boots(collections["armor"], collections["detail"], mats, rig, body)
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
        "garment": {
            "method": "independent continuous 52-bone skinned cloth shell copied from but never written back to the accepted contact body; non-garment duplicate vertices removed, then garment-only relaxation, clean subdivision, and variable outward cloth allowance up to 12 mm, reduced at the arms and firing shoulder",
            "underbodyPolygonRegions": garment_regions,
            "undersuitPolygonRegions": undersuit_regions,
            "undersuitObject": undersuit.name,
            "coverageVertices": int(undersuit.get("kyx_coverage_vertices", 0)),
        },
        "authoredConstruction": {
            "undersuitObjects": 1, "tailoringDetailObjects": len(tailoring), "helmetObjects": len(helmet), "torsoObjects": len(torso), "limbObjects": len(limbs), "bootObjects": len(boots), "weaponShellObjects": len(weapon),
            "deformationPolicy": "accepted body and independent continuous undersuit both retain the full 52-bone skin; fitted construction details/armor/helmet/boots are explicit bone children; held weapon is a palm.R bone child",
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
