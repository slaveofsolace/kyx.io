"""Author the bounded V6-B0.1 clean-cage and literal-contact proof.

This script must be run with the immutable V6-A anatomy Blend already open.
It creates a new file; it never edits the V6-A source, either V6-B0 proof-method
revision, or any V6-C benchmark file.

Scope is deliberately narrow:
* one connected, all-quad sleeveless garment cage with waist, neck and two
  explicit arm-hole boundary loops;
* one clean quad chest/shoulder armor panel with one continuous perimeter;
* one full, continuous V6-A body copy whose existing five-digit hand is posed
  by a temporary hand/finger armature around a simplified contact fixture.

No complete character, runtime rig, export, LOD, animation, runtime integration,
V6-B claim, V6-C claim or G6 claim is produced.
"""

from __future__ import annotations

import bpy
import hashlib
import json
import math
import os
import sys
from pathlib import Path
from mathutils import Vector


BASE = Path(__file__).resolve().parents[1]
SOURCE_BLEND = BASE / "model" / "kyx_vanguard_v6a_anatomy_sculpt_working.blend"
SOURCE_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
CONCEPT = BASE / "concept" / "kyx-vanguard-v6c-production-target-v1.png"
CONCEPT_SHA256 = "9c188fa32daaeec2d284727a5d9e600f94b8b57fee6f0568c7ebac9d462abdd2"

if "--output-root" in sys.argv:
    OUTPUT_ROOT = Path(sys.argv[sys.argv.index("--output-root") + 1])
else:
    OUTPUT_ROOT = Path(os.environ.get("KYX_V6B01_OUTPUT_ROOT", str(BASE)))
MODEL_DIR = OUTPUT_ROOT / "model" / "v6b01-clean-cage-contact-rev1"
EVIDENCE_DIR = OUTPUT_ROOT / "evidence" / "v6b01-clean-cage-contact-rev1"
OUTPUT_BLEND = MODEL_DIR / "kyx_vanguard_v6b01_clean_cage_contact_rev1.blend"
REPORT = EVIDENCE_DIR / "authoring-report.json"

PREFIX = "V6B01_"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_sources() -> None:
    if sha256(SOURCE_BLEND) != SOURCE_SHA256:
        raise RuntimeError("Immutable V6-A anatomy hash mismatch")
    if sha256(CONCEPT) != CONCEPT_SHA256:
        raise RuntimeError("Pinned concept hash mismatch")
    opened = Path(bpy.data.filepath).resolve()
    if opened != SOURCE_BLEND.resolve():
        raise RuntimeError(f"Run with V6-A source open; got {opened}")


def collection(name: str) -> bpy.types.Collection:
    found = bpy.data.collections.get(name)
    if found:
        return found
    result = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(result)
    return result


def link_only(obj: bpy.types.Object, target: bpy.types.Collection) -> None:
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    target.objects.link(obj)


def material(
    name: str,
    color: tuple[float, float, float, float],
    roughness: float = 0.45,
    metallic: float = 0.0,
    alpha: float = 1.0,
    emission: tuple[float, float, float, float] | None = None,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color[:3], alpha)
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color[:3], 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Alpha"].default_value = alpha
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.18 if metallic else 0.04
    if emission:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0:
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "DITHERED"
        mat.use_transparency_overlap = False
    return mat


def assign_material(obj: bpy.types.Object, mat: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def smooth(obj: bpy.types.Object) -> None:
    if obj.type != "MESH":
        return
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def tag(obj: bpy.types.Object, method: str, role: str) -> None:
    obj["kyx_method"] = method
    obj["kyx_role"] = role
    obj["kyx_checkpoint"] = "V6-B0.1 clean cage/contact proof rev1"


def curve_object(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    target_collection: bpy.types.Collection,
    mat: bpy.types.Material,
    cyclic: bool = False,
    bezier: bool = True,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 10
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    curve.resolution_u = 16
    if bezier:
        spline = curve.splines.new("BEZIER")
        spline.bezier_points.add(len(points) - 1)
        for point, coordinate in zip(spline.bezier_points, points):
            point.co = coordinate
            point.handle_left_type = "AUTO"
            point.handle_right_type = "AUTO"
        spline.use_cyclic_u = cyclic
    else:
        spline = curve.splines.new("POLY")
        spline.points.add(len(points) - 1)
        for point, coordinate in zip(spline.points, points):
            point.co = (*coordinate, 1.0)
        spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    target_collection.objects.link(obj)
    curve.materials.append(mat)
    return obj


def box(
    name: str,
    location: tuple[float, float, float],
    scale: tuple[float, float, float],
    target_collection: bpy.types.Collection,
    mat: bpy.types.Material,
    bevel: float = 0.004,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_only(obj, target_collection)
    assign_material(obj, mat)
    if bevel:
        modifier = obj.modifiers.new("MANUFACTURED_EDGE_BEVEL", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    smooth(obj)
    return obj


def cylinder(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    target_collection: bpy.types.Collection,
    mat: bpy.types.Material,
    rotation: tuple[float, float, float] = (math.pi / 2.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    link_only(obj, target_collection)
    assign_material(obj, mat)
    bevel = obj.modifiers.new("ATTACHMENT_EDGE_BEVEL", "BEVEL")
    bevel.width = min(radius * 0.22, 0.002)
    bevel.segments = 3
    smooth(obj)
    return obj


def topology_report(obj: bpy.types.Object, boundary_contract: str) -> dict:
    mesh = obj.data
    adjacency: dict[int, set[int]] = {vertex.index: set() for vertex in mesh.vertices}
    edge_face_count = [0] * len(mesh.edges)
    edge_lookup = {tuple(sorted(edge.vertices)): edge.index for edge in mesh.edges}
    for polygon in mesh.polygons:
        verts = list(polygon.vertices)
        for index, vertex in enumerate(verts):
            other = verts[(index + 1) % len(verts)]
            adjacency[vertex].add(other)
            adjacency[other].add(vertex)
            edge_face_count[edge_lookup[tuple(sorted((vertex, other)))]] += 1

    visited: set[int] = set()
    components = 0
    for vertex in adjacency:
        if vertex in visited:
            continue
        components += 1
        stack = [vertex]
        visited.add(vertex)
        while stack:
            current = stack.pop()
            for other in adjacency[current]:
                if other not in visited:
                    visited.add(other)
                    stack.append(other)

    boundary_edges = [mesh.edges[index] for index, count in enumerate(edge_face_count) if count == 1]
    boundary_adjacency: dict[int, set[int]] = {}
    for edge in boundary_edges:
        a, b = edge.vertices
        boundary_adjacency.setdefault(a, set()).add(b)
        boundary_adjacency.setdefault(b, set()).add(a)
    boundary_seen: set[int] = set()
    boundary_loops = 0
    for vertex in boundary_adjacency:
        if vertex in boundary_seen:
            continue
        boundary_loops += 1
        stack = [vertex]
        boundary_seen.add(vertex)
        while stack:
            current = stack.pop()
            for other in boundary_adjacency[current]:
                if other not in boundary_seen:
                    boundary_seen.add(other)
                    stack.append(other)

    return {
        "vertices": len(mesh.vertices),
        "edges": len(mesh.edges),
        "faces": len(mesh.polygons),
        "quad_faces": sum(1 for polygon in mesh.polygons if len(polygon.vertices) == 4),
        "non_quad_faces": sum(1 for polygon in mesh.polygons if len(polygon.vertices) != 4),
        "connected_components": components,
        "boundary_edges": len(boundary_edges),
        "boundary_loops": boundary_loops,
        "boundary_loop_contract": boundary_contract,
    }


def build_clean_garment_cage(
    anatomy: bpy.types.Object,
    target_collection: bpy.types.Collection,
    wire_collection: bpy.types.Collection,
    fabric: bpy.types.Material,
    wire_mat: bpy.types.Material,
) -> tuple[bpy.types.Object, bpy.types.Object, dict]:
    # This is a separately drawn retopology cage, not a duplicate or selected
    # region of anatomy.  Stable topological indices define the arm holes.
    segments = 24
    levels = [
        (0.900, 0.170, 0.105),
        (1.020, 0.176, 0.112),
        (1.140, 0.192, 0.121),
        (1.260, 0.214, 0.130),
        (1.360, 0.230, 0.132),
        (1.440, 0.158, 0.103),
        (1.505, 0.087, 0.073),
    ]
    vertices: list[tuple[float, float, float]] = []
    for level_index, (z, radius_x, radius_y) in enumerate(levels):
        for segment in range(segments):
            theta = math.tau * segment / segments
            x = radius_x * math.sin(theta)
            y = -0.020 - radius_y * math.cos(theta)
            # Restrained hand-tuned cloth tension: two broad, sub-millimetric
            # front undulations and a small axilla draw, never primitive folds.
            front_weight = max(0.0, math.cos(theta)) ** 6
            if level_index in (1, 2):
                y -= front_weight * (0.0020 if level_index == 1 else -0.0015)
            if level_index in (3, 4) and segment in (4, 8, 16, 20):
                z += 0.0025
            vertices.append((x, y, z))

    removed_side_faces = set(range(4, 8)) | set(range(16, 20))
    faces: list[tuple[int, int, int, int]] = []
    for level_index in range(len(levels) - 1):
        for segment in range(segments):
            if level_index in (3, 4) and segment in removed_side_faces:
                continue
            next_segment = (segment + 1) % segments
            lower = level_index * segments
            upper = (level_index + 1) * segments
            faces.append((lower + segment, lower + next_segment, upper + next_segment, upper + segment))

    # Deleted arm-hole bands leave no construction vertices behind.  Explicitly
    # compact the cage so topology evidence cannot hide isolated points.
    used_vertices = sorted({vertex for face in faces for vertex in face})
    remap = {old: new for new, old in enumerate(used_vertices)}
    vertices = [vertices[index] for index in used_vertices]
    faces = [tuple(remap[index] for index in face) for face in faces]

    mesh = bpy.data.meshes.new(f"{PREFIX}Garment_CleanQuadCage_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    cage = bpy.data.objects.new(f"{PREFIX}Garment_CleanQuadCage", mesh)
    target_collection.objects.link(cage)
    mesh.materials.append(fabric)
    cage["forbidden_surface_extraction"] = False
    cage["explicit_armhole_topology"] = True
    cage["sculpt_detail"] = "restrained front tension offsets and axilla draw only"
    tag(cage, "independently drawn connected quad cage; index-defined arm holes; live shrinkwrap/solidify/subdivision", "technical undersuit proof")

    shrink = cage.modifiers.new("01_CLEAN_CAGE_SHRINKWRAP_TO_V6A", "SHRINKWRAP")
    shrink.target = anatomy
    shrink.wrap_method = "NEAREST_SURFACEPOINT"
    shrink.wrap_mode = "OUTSIDE_SURFACE"
    shrink.offset = 0.004
    subdiv = cage.modifiers.new("02_CLEAN_CAGE_SUBDIVISION", "SUBSURF")
    subdiv.subdivision_type = "CATMULL_CLARK"
    subdiv.levels = 1
    subdiv.render_levels = 2
    solidify = cage.modifiers.new("03_GARMENT_PHYSICAL_THICKNESS", "SOLIDIFY")
    solidify.thickness = 0.0035
    solidify.offset = 0.55
    solidify.use_rim = True
    bevel = cage.modifiers.new("04_RESTRAINED_SEAM_EDGE_SOFTEN", "BEVEL")
    bevel.width = 0.0012
    bevel.segments = 2
    smooth(cage)

    wire_mesh = mesh.copy()
    wire = bpy.data.objects.new(f"{PREFIX}Garment_CageWireWitness", wire_mesh)
    wire_collection.objects.link(wire)
    wire_mesh.materials.clear()
    wire_mesh.materials.append(wire_mat)
    wire_shrink = wire.modifiers.new("01_SAME_CAGE_SHRINKWRAP", "SHRINKWRAP")
    wire_shrink.target = anatomy
    wire_shrink.wrap_method = "NEAREST_SURFACEPOINT"
    wire_shrink.wrap_mode = "OUTSIDE_SURFACE"
    wire_shrink.offset = 0.0085
    wireframe = wire.modifiers.new("02_TOPOLOGY_WIREFRAME", "WIREFRAME")
    wireframe.thickness = 0.00115
    wireframe.use_even_offset = True
    wireframe.use_relative_offset = False
    tag(wire, "exact unsmoothed cage topology witness", "wireframe audit")

    return cage, wire, topology_report(cage, "waist + neck + left armhole + right armhole")


def build_seams(
    target_collection: bpy.types.Collection,
    seam_mat: bpy.types.Material,
) -> list[bpy.types.Object]:
    objects = []
    center = curve_object(
        f"{PREFIX}Garment_Seam_CenterFront",
        [(0.0, -0.132, 0.93), (0.0, -0.143, 1.10), (0.0, -0.151, 1.28), (0.0, -0.116, 1.43)],
        0.00135,
        target_collection,
        seam_mat,
    )
    objects.append(center)
    for side, sign in (("R", 1.0), ("L", -1.0)):
        seam = curve_object(
            f"{PREFIX}Garment_Seam_{side}_ClavicleTension",
            [
                (0.012 * sign, -0.147, 1.355),
                (0.078 * sign, -0.139, 1.382),
                (0.130 * sign, -0.121, 1.409),
                (0.152 * sign, -0.090, 1.438),
            ],
            0.00125,
            target_collection,
            seam_mat,
        )
        objects.append(seam)
    for obj in objects:
        tag(obj, "restrained anatomical seam route", "garment seam/tension witness")
    return objects


def build_armor_panel(
    garment: bpy.types.Object,
    target_collection: bpy.types.Collection,
    ceramic: bpy.types.Material,
    edge_mat: bpy.types.Material,
    accent: bpy.types.Material,
) -> tuple[bpy.types.Object, dict]:
    x_rows = [
        [0.030, 0.080, 0.130, 0.178, 0.210],
        [0.022, 0.080, 0.140, 0.198, 0.232],
        [0.016, 0.078, 0.145, 0.205, 0.242],
        [0.032, 0.090, 0.150, 0.205, 0.228],
    ]
    z_rows = [
        [1.175, 1.164, 1.160, 1.170, 1.194],
        [1.245, 1.238, 1.236, 1.246, 1.266],
        [1.330, 1.332, 1.336, 1.344, 1.354],
        [1.405, 1.432, 1.447, 1.438, 1.408],
    ]
    vertices: list[tuple[float, float, float]] = []
    for row in range(4):
        for column in range(5):
            x = x_rows[row][column]
            z = z_rows[row][column]
            y = -0.150 + 0.58 * x * x + 0.004 * (row - 1.5)
            vertices.append((x, y, z))
    faces = []
    for row in range(3):
        for column in range(4):
            a = row * 5 + column
            faces.append((a, a + 1, a + 6, a + 5))

    mesh = bpy.data.meshes.new(f"{PREFIX}Armor_ChestShoulderCleanRetopo_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    panel = bpy.data.objects.new(f"{PREFIX}Armor_ChestShoulderCleanRetopo", mesh)
    target_collection.objects.link(panel)
    mesh.materials.append(ceramic)
    mesh.materials.append(edge_mat)
    panel["continuous_manufactured_perimeter"] = True
    panel["arm_clearance_design_mm"] = 22
    panel["outline_method"] = "independent 4x5 curve/retopo grid, not anatomy face selection"
    tag(panel, "clean 4x5 quad retopo outline projected to garment; solidify and bevel", "single chest/shoulder armor panel")

    shrink = panel.modifiers.new("01_PROJECT_CLEAN_OUTLINE_TO_GARMENT", "SHRINKWRAP")
    shrink.target = garment
    shrink.wrap_method = "NEAREST_SURFACEPOINT"
    shrink.wrap_mode = "OUTSIDE_SURFACE"
    shrink.offset = 0.012
    solidify = panel.modifiers.new("02_CONTINUOUS_MANUFACTURED_THICKNESS", "SOLIDIFY")
    solidify.thickness = 0.012
    solidify.offset = 0.2
    solidify.use_rim = True
    solidify.material_offset = 1
    bevel = panel.modifiers.new("03_CONTINUOUS_PERIMETER_BEVEL", "BEVEL")
    bevel.width = 0.0042
    bevel.segments = 4
    smooth(panel)

    # One continuous edge-seal curve follows the actual base perimeter.
    perimeter_indices = [0, 1, 2, 3, 4, 9, 14, 19, 18, 17, 16, 15, 10, 5]
    perimeter = [vertices[index] for index in perimeter_indices]
    edge = curve_object(
        f"{PREFIX}Armor_ContinuousPerimeterSeal",
        [(x, y - 0.008, z) for x, y, z in perimeter],
        0.0020,
        target_collection,
        edge_mat,
        cyclic=True,
        bezier=False,
    )
    tag(edge, "single cyclic perimeter seal from clean panel boundary", "manufactured perimeter witness")

    # Three explicit backed fasteners; the two outer fasteners leave a visible
    # material gap to the arm-hole edge rather than floating on the deltoid.
    for index, (x, y, z) in enumerate(((0.064, -0.166, 1.385), (0.176, -0.150, 1.389), (0.194, -0.147, 1.232)), 1):
        gasket = cylinder(
            f"{PREFIX}Armor_AttachmentGasket_{index:02d}",
            (x, y + 0.006, z),
            0.010,
            0.005,
            target_collection,
            edge_mat,
        )
        tag(gasket, "backed panel standoff", "attachment logic")
        bolt = cylinder(
            f"{PREFIX}Armor_AttachmentBolt_{index:02d}",
            (x, y - 0.004, z),
            0.0055,
            0.009,
            target_collection,
            accent if index == 2 else edge_mat,
        )
        tag(bolt, "seated fastener through gasket", "attachment logic")

    return panel, topology_report(panel, "one continuous manufactured armor perimeter")


def build_hand_armature(
    contact_body: bpy.types.Object,
    target_collection: bpy.types.Collection,
) -> tuple[bpy.types.Object, dict]:
    armature_data = bpy.data.armatures.new(f"{PREFIX}ContactHandRig_Data")
    rig = bpy.data.objects.new(f"{PREFIX}ContactHandRig", armature_data)
    target_collection.objects.link(rig)
    rig.show_in_front = True
    armature_data.display_type = "OCTAHEDRAL"

    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    root = armature_data.edit_bones.new("contact_root")
    root.head = (0.0, 0.0, 0.0)
    root.tail = (0.0, 0.0, 1.70)
    hand = armature_data.edit_bones.new("hand.R")
    hand.head = (0.338, -0.075, 0.985)
    hand.tail = (0.386, -0.105, 0.910)
    hand.parent = root

    centers = {
        "index": -0.151,
        "middle": -0.127,
        "ring": -0.098,
        "pinky": -0.063,
    }
    for finger, y in centers.items():
        previous = hand
        chain = [
            ((0.388, y, 0.910), (0.401, y, 0.872)),
            ((0.401, y, 0.872), (0.405, y, 0.832)),
            ((0.405, y, 0.832), (0.403, y, 0.792)),
        ]
        for segment, (head_position, tail_position) in enumerate(chain, 1):
            bone = armature_data.edit_bones.new(f"{finger}.{segment:02d}.R")
            bone.head = head_position
            bone.tail = tail_position
            bone.parent = previous
            bone.use_connect = segment > 1
            previous = bone

    thumb_1 = armature_data.edit_bones.new("thumb.01.R")
    thumb_1.head = (0.352, -0.145, 0.926)
    thumb_1.tail = (0.383, -0.158, 0.892)
    thumb_1.parent = hand
    thumb_2 = armature_data.edit_bones.new("thumb.02.R")
    thumb_2.head = thumb_1.tail
    thumb_2.tail = (0.407, -0.160, 0.865)
    thumb_2.parent = thumb_1
    thumb_2.use_connect = True

    bpy.ops.object.mode_set(mode="POSE")
    # Bone-local Z is the controlled curl axis for this rest orientation.
    curl_degrees = {
        "index": (24.0, 18.0, 8.0),
        "middle": (54.0, 61.0, 38.0),
        "ring": (58.0, 66.0, 42.0),
        "pinky": (62.0, 70.0, 44.0),
    }
    for finger, angles in curl_degrees.items():
        for segment, degrees in enumerate(angles, 1):
            pose_bone = rig.pose.bones[f"{finger}.{segment:02d}.R"]
            pose_bone.rotation_mode = "XYZ"
            pose_bone.rotation_euler[2] = math.radians(degrees)
    rig.pose.bones["thumb.01.R"].rotation_mode = "XYZ"
    rig.pose.bones["thumb.02.R"].rotation_mode = "XYZ"
    rig.pose.bones["thumb.01.R"].rotation_euler[0] = math.radians(-18.0)
    rig.pose.bones["thumb.01.R"].rotation_euler[2] = math.radians(-32.0)
    rig.pose.bones["thumb.02.R"].rotation_euler[2] = math.radians(-38.0)
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.select_set(False)

    # Keep the entire V6-A body mesh continuous.  Only vertex weights are added;
    # no hand, finger or garment faces are extracted or duplicated.
    for group in list(contact_body.vertex_groups):
        contact_body.vertex_groups.remove(group)
    groups = {bone.name: contact_body.vertex_groups.new(name=bone.name) for bone in armature_data.bones if bone.use_deform}
    all_indices = [vertex.index for vertex in contact_body.data.vertices]
    groups["contact_root"].add(all_indices, 1.0, "REPLACE")

    finger_centers = list(centers.items())
    assignment_counts = {name: 0 for name in groups}
    for vertex in contact_body.data.vertices:
        co = vertex.co
        # Existing continuous thumb volume.
        if 0.330 < co.x < 0.392 and -0.172 < co.y < -0.124 and 0.845 < co.z < 0.943:
            groups["contact_root"].remove([vertex.index])
            bone_name = "thumb.01.R" if co.z >= 0.890 else "thumb.02.R"
            groups[bone_name].add([vertex.index], 1.0, "REPLACE")
            assignment_counts[bone_name] += 1
            continue
        if co.x < 0.382 or not (0.785 < co.z < 0.922):
            continue
        finger, y = min(finger_centers, key=lambda item: abs(co.y - item[1]))
        if abs(co.y - y) > 0.0215:
            continue
        groups["contact_root"].remove([vertex.index])
        if co.z >= 0.870:
            segment = 1
        elif co.z >= 0.832:
            segment = 2
        else:
            segment = 3
        bone_name = f"{finger}.{segment:02d}.R"
        groups[bone_name].add([vertex.index], 1.0, "REPLACE")
        assignment_counts[bone_name] += 1

    modifier = contact_body.modifiers.new("TEMPORARY_CONTINUOUS_HAND_ARMATURE", "ARMATURE")
    modifier.object = rig
    modifier.use_deform_preserve_volume = True
    contact_body["continuous_source_body"] = True
    contact_body["finger_method"] = "temporary 15-bone hand rig on continuous V6-A body; no finger primitives"
    tag(contact_body, "continuous V6-A body copy posed by temporary hand/finger armature", "literal five-digit contact witness")
    tag(rig, "temporary hand/finger armature", "contact authoring rig; not runtime skeleton")

    return rig, {
        "bones": len(armature_data.bones),
        "deform_bones": sum(1 for bone in armature_data.bones if bone.use_deform),
        "actions": len(bpy.data.actions),
        "assigned_vertices_by_bone": assignment_counts,
        "body_vertices": len(contact_body.data.vertices),
        "body_faces": len(contact_body.data.polygons),
        "body_connected_mesh_preserved": True,
        "independent_finger_meshes": 0,
    }


def lofted_grip(
    name: str,
    target_collection: bpy.types.Collection,
    mat: bpy.types.Material,
) -> bpy.types.Object:
    rings = [
        (0.372, -0.105, 0.946, 0.027, 0.047),
        (0.378, -0.105, 0.900, 0.030, 0.048),
        (0.389, -0.105, 0.846, 0.031, 0.048),
        (0.397, -0.105, 0.792, 0.028, 0.044),
    ]
    segments = 16
    vertices = []
    for center_x, center_y, z, radius_x, radius_y in rings:
        for step in range(segments):
            angle = math.tau * step / segments
            # Flatten the palm side and retain a fuller distal quadrant.
            sx = math.cos(angle)
            x = center_x + radius_x * (0.82 * sx if sx < 0.0 else sx)
            y = center_y + radius_y * math.sin(angle)
            vertices.append((x, y, z))
    faces = []
    for ring in range(len(rings) - 1):
        for step in range(segments):
            next_step = (step + 1) % segments
            a = ring * segments + step
            b = ring * segments + next_step
            c = (ring + 1) * segments + next_step
            d = (ring + 1) * segments + step
            faces.append((a, b, c, d))
    faces.append(tuple(reversed(range(segments))))
    offset = (len(rings) - 1) * segments
    faces.append(tuple(offset + step for step in range(segments)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update(calc_edges=True)
    grip = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(grip)
    mesh.materials.append(mat)
    smooth(grip)
    bevel = grip.modifiers.new("ERGONOMIC_GRIP_EDGE_SOFTEN", "BEVEL")
    bevel.width = 0.003
    bevel.segments = 3
    subdiv = grip.modifiers.new("ERGONOMIC_GRIP_SUBDIVISION", "SUBSURF")
    subdiv.levels = 1
    subdiv.render_levels = 2
    grip["literal_palm_contact_target"] = True
    grip["literal_four_digit_wrap_target"] = True
    tag(grip, "connected multi-ring ergonomic loft", "simplified grip contact fixture")
    return grip


def build_contact_fixture(
    target_collection: bpy.types.Collection,
    graphite: bpy.types.Material,
    rubber: bpy.types.Material,
    transparent: bpy.types.Material,
    accent: bpy.types.Material,
    contact_mat: bpy.types.Material,
) -> dict:
    grip = lofted_grip(f"{PREFIX}ContactFixture_ErgonomicGrip", target_collection, rubber)

    # Sectioned receiver: one transparent bridge and two slim rails retain the
    # ergonomic context without hiding the hand-first proof.
    receiver = box(
        f"{PREFIX}ContactFixture_SectionedReceiver",
        (0.350, -0.105, 1.002),
        (0.110, 0.055, 0.032),
        target_collection,
        transparent,
        bevel=0.008,
        rotation=(0.0, math.radians(-8.0), 0.0),
    )
    receiver["sectioned_for_contact_audit"] = True
    tag(receiver, "transparent sectioned receiver witness", "occlusion-controlled context")

    guard = curve_object(
        f"{PREFIX}ContactFixture_TriggerGuard",
        [
            (0.345, -0.153, 0.975),
            (0.365, -0.159, 0.934),
            (0.401, -0.159, 0.918),
            (0.427, -0.156, 0.944),
            (0.414, -0.153, 0.984),
        ],
        0.0048,
        target_collection,
        graphite,
    )
    guard["literal_guard_clearance_target"] = True
    tag(guard, "continuous ergonomic guard curve", "trigger/index clearance witness")
    trigger = curve_object(
        f"{PREFIX}ContactFixture_Trigger",
        [(0.381, -0.158, 0.971), (0.389, -0.160, 0.945), (0.398, -0.159, 0.931)],
        0.0033,
        target_collection,
        accent,
    )
    trigger["literal_index_contact_target"] = True
    tag(trigger, "continuous trigger curve", "index-on-trigger witness")

    # A low-ready skeletal stock links the sectioned receiver to an actual pad
    # at the source body's right shoulder pocket.
    rails = []
    for index, points in enumerate(
        (
            [(0.300, -0.085, 1.025), (0.277, -0.083, 1.155), (0.248, -0.080, 1.300), (0.224, -0.077, 1.390)],
            [(0.342, -0.056, 1.042), (0.314, -0.061, 1.175), (0.273, -0.067, 1.318), (0.238, -0.071, 1.405)],
        ),
        1,
    ):
        rail = curve_object(f"{PREFIX}ContactFixture_StockRail_{index:02d}", points, 0.0070, target_collection, graphite)
        rail["literal_shoulder_contact_target"] = True
        tag(rail, "continuous skeletal stock load rail", "shoulder-contact load path")
        rails.append(rail)

    pad = box(
        f"{PREFIX}ContactFixture_ShoulderPad",
        (0.224, -0.070, 1.398),
        (0.025, 0.018, 0.052),
        target_collection,
        contact_mat,
        bevel=0.008,
        rotation=(math.radians(-5.0), math.radians(-12.0), math.radians(2.0)),
    )
    pad["literal_shoulder_contact_target"] = True
    tag(pad, "rubberized tangent pad seated at shoulder pocket", "stock/shoulder contact witness")
    witness = curve_object(
        f"{PREFIX}ContactFixture_ShoulderContactWitness",
        [(0.203, -0.091, 1.360), (0.198, -0.092, 1.398), (0.207, -0.090, 1.437)],
        0.0018,
        target_collection,
        accent,
    )
    tag(witness, "thin tangent contact witness", "pad-to-shoulder visibility aid")

    return {
        "grip": grip.name,
        "guard": guard.name,
        "trigger": trigger.name,
        "stock_rails": [rail.name for rail in rails],
        "shoulder_pad": pad.name,
        "receiver": receiver.name,
    }


def evaluated_inventory(objects: list[bpy.types.Object]) -> list[dict]:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    inventory = []
    for obj in objects:
        entry = {
            "name": obj.name,
            "type": obj.type,
            "role": obj.get("kyx_role", ""),
            "method": obj.get("kyx_method", ""),
            "modifiers": [{"name": modifier.name, "type": modifier.type} for modifier in obj.modifiers],
        }
        if obj.type == "MESH":
            entry["base_vertices"] = len(obj.data.vertices)
            entry["base_faces"] = len(obj.data.polygons)
            evaluated = obj.evaluated_get(depsgraph)
            mesh = evaluated.to_mesh()
            entry["evaluated_vertices"] = len(mesh.vertices)
            entry["evaluated_faces"] = len(mesh.polygons)
            entry["evaluated_triangles"] = sum(len(polygon.vertices) - 2 for polygon in mesh.polygons)
            evaluated.to_mesh_clear()
        inventory.append(entry)
    return inventory


def main() -> None:
    require_sources()
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

    source_body = bpy.data.objects.get("KYX_V6A_AnatomySculpt_Body")
    if source_body is None or source_body.type != "MESH":
        raise RuntimeError("V6-A continuous body is missing")

    immutable_collection = collection(f"{PREFIX}00_IMMUTABLE_SOURCE")
    neutral_collection = collection(f"{PREFIX}10_GARMENT_ANATOMY")
    garment_collection = collection(f"{PREFIX}20_CLEAN_GARMENT")
    wire_collection = collection(f"{PREFIX}21_CAGE_WIRE_WITNESS")
    armor_collection = collection(f"{PREFIX}30_SINGLE_ARMOR_PANEL")
    contact_collection = collection(f"{PREFIX}40_CONTINUOUS_HAND_CONTACT")

    for obj in list(bpy.data.objects):
        if obj.name.startswith("KYX_V6A_"):
            link_only(obj, immutable_collection)
            obj.hide_render = True
            obj.hide_viewport = True
            obj.hide_select = True
            obj["immutable_source_witness"] = True

    body_clay = material(f"{PREFIX}MAT_AnatomyClay", (0.135, 0.160, 0.177, 1.0), roughness=0.72)
    contact_clay = material(f"{PREFIX}MAT_ContactBody", (0.055, 0.125, 0.155, 1.0), roughness=0.58)
    fabric = material(f"{PREFIX}MAT_TechnicalFabric", (0.010, 0.017, 0.024, 1.0), roughness=0.72)
    wire_mat = material(
        f"{PREFIX}MAT_CageWire",
        (0.003, 0.155, 0.220, 1.0),
        roughness=0.22,
        emission=(0.003, 0.22, 0.35, 1.0),
        emission_strength=2.2,
    )
    seam_mat = material(f"{PREFIX}MAT_SeamRubber", (0.080, 0.105, 0.120, 1.0), roughness=0.58)
    ceramic = material(f"{PREFIX}MAT_WarmCeramic", (0.72, 0.67, 0.58, 1.0), roughness=0.28, metallic=0.08)
    edge_mat = material(f"{PREFIX}MAT_EdgeMetal", (0.020, 0.030, 0.040, 1.0), roughness=0.25, metallic=0.75)
    graphite = material(f"{PREFIX}MAT_Graphite", (0.010, 0.016, 0.024, 1.0), roughness=0.32, metallic=0.58)
    rubber = material(f"{PREFIX}MAT_GripRubber", (0.018, 0.026, 0.030, 1.0), roughness=0.63)
    contact_mat = material(f"{PREFIX}MAT_ContactPad", (0.095, 0.115, 0.120, 1.0), roughness=0.70)
    accent = material(
        f"{PREFIX}MAT_ContactAccent",
        (0.008, 0.38, 0.52, 1.0),
        roughness=0.25,
        emission=(0.004, 0.45, 0.70, 1.0),
        emission_strength=3.5,
    )
    transparent = material(f"{PREFIX}MAT_SectionedReceiver", (0.13, 0.20, 0.24, 1.0), roughness=0.25, metallic=0.25, alpha=0.17)

    neutral = source_body.copy()
    neutral.data = source_body.data.copy()
    neutral.name = f"{PREFIX}GarmentAnatomyWitness"
    neutral_collection.objects.link(neutral)
    neutral.hide_render = False
    neutral.hide_viewport = False
    neutral.hide_select = False
    assign_material(neutral, body_clay)
    tag(neutral, "unaltered continuous V6-A anatomy copy", "garment fit witness")

    contact_body = source_body.copy()
    contact_body.data = source_body.data.copy()
    contact_body.name = f"{PREFIX}ContactAnatomyContinuousBody"
    contact_collection.objects.link(contact_body)
    contact_body.hide_render = True
    contact_body.hide_viewport = False
    contact_body.hide_select = False
    assign_material(contact_body, contact_clay)

    cage, wire, cage_topology = build_clean_garment_cage(neutral, garment_collection, wire_collection, fabric, wire_mat)
    seams = build_seams(garment_collection, seam_mat)
    panel, panel_topology = build_armor_panel(cage, armor_collection, ceramic, edge_mat, accent)
    rig, rig_report = build_hand_armature(contact_body, contact_collection)
    fixture = build_contact_fixture(contact_collection, graphite, rubber, transparent, accent, contact_mat)

    scene = bpy.context.scene
    scene["kyx_status"] = "EARLY V6-B0.1 CLEAN-CAGE/CONTACT PROOF REV1 / HUMAN REVIEW REQUIRED"
    scene["kyx_nonclaims"] = "NOT V6-B; NOT V6-C; NOT G6; NO RUNTIME RIG; NO EXPORT; NO LOD; NO RUNTIME INTEGRATION"
    scene["immutable_source"] = "model/kyx_vanguard_v6a_anatomy_sculpt_working.blend"
    scene["forbidden_inputs"] = "v6b0-proof-method-rev1; v6b0-proof-method-rev2; v6c-benchmark-rev12"
    scene["construction_scope"] = "clean garment cage; one armor panel; continuous five-digit contact hand; sectioned contact fixture"
    scene["stop_before"] = "full body costume; full rifle; detail pack; rig/export/runtime"

    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND), check_existing=False)

    authored_objects = [obj for obj in bpy.data.objects if obj.name.startswith(PREFIX)]
    report = {
        "checkpoint": "V6-B0.1 clean-cage/contact proof rev1",
        "status": "EARLY METHOD PROOF / HUMAN VISUAL REVIEW REQUIRED / NO V6-B OR G6 CLAIM",
        "source_blend": str(SOURCE_BLEND),
        "source_sha256_before": SOURCE_SHA256,
        "source_sha256_after": sha256(SOURCE_BLEND),
        "concept": str(CONCEPT),
        "concept_sha256": sha256(CONCEPT),
        "output_blend": str(OUTPUT_BLEND),
        "output_blend_sha256": sha256(OUTPUT_BLEND),
        "garment_topology": cage_topology,
        "armor_panel_topology": panel_topology,
        "temporary_contact_rig": rig_report,
        "contact_fixture": fixture,
        "authored_object_count": len(authored_objects),
        "armatures": len([obj for obj in authored_objects if obj.type == "ARMATURE"]),
        "actions": len(bpy.data.actions),
        "inventory": evaluated_inventory(authored_objects),
        "method_guards": {
            "anatomy_face_extraction_used_for_garment": False,
            "anatomy_face_extraction_used_for_armor": False,
            "independent_finger_tubes": False,
            "continuous_source_hand_preserved": True,
            "full_character_authored": False,
            "full_rifle_authored": False,
            "runtime_integration": False,
        },
        "nonclaims": ["NOT V6-B", "NOT V6-C", "NOT G6", "NO RUNTIME RIG", "NO EXPORT", "NO LOD", "NO RUNTIME INTEGRATION"],
    }
    REPORT.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("V6B01_AUTHORING_REPORT=" + json.dumps(report))


if __name__ == "__main__":
    main()
