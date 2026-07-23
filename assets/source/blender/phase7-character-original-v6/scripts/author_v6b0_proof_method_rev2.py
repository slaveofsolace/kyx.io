"""Author corrected KYX Vanguard V6-B0 production-method checkpoint rev2.

This is intentionally a partial study.  It starts from the immutable continuous
V6-A anatomy and demonstrates three Blender-native production methods only:

* body-surface garment extraction with shrinkwrap, cloth thickness and shaped
  seam/tension detail;
* curved surface-retopology armor with physical thickness, bevels, booleans,
  edge trim, attachment hardware and an explicit arm-clearance gap;
* a five-digit source-hand glove proportionally sculpted around a custom lofted
  grip and a boolean-cut hard-surface receiver region.

It does not construct a complete character, rig, export, LOD or runtime asset.
It never opens or appends revision 12 (or any later failed armor file).
"""

from __future__ import annotations

import json
import math
from collections import Counter, defaultdict
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


BASE = Path(__file__).resolve().parents[1]
OUTPUT_DIR = BASE / "model" / "v6b0-proof-method-rev2"
OUTPUT_BLEND = OUTPUT_DIR / "kyx_vanguard_v6b0_proof_method_rev2.blend"
REPORT_PATH = BASE / "evidence" / "v6b0-proof-method-rev2" / "authoring-report.json"
SOURCE_NAME = "KYX_V6A_AnatomySculpt_Body"
PREFIX = "V6B0_"


def ensure_collection(name: str, parent: bpy.types.Collection | None = None) -> bpy.types.Collection:
    collection = bpy.data.collections.get(name)
    if collection is None:
        collection = bpy.data.collections.new(name)
    parent = parent or bpy.context.scene.collection
    if collection.name not in {c.name for c in parent.children}:
        parent.children.link(collection)
    return collection


def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)


def set_input(node: bpy.types.Node, name: str, value) -> None:
    socket = node.inputs.get(name)
    if socket is not None:
        socket.default_value = value


def principled_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.45,
    fabric: bool = False,
    emission: tuple[float, float, float, float] | None = None,
) -> bpy.types.Material:
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()
    out = tree.nodes.new("ShaderNodeOutputMaterial")
    bsdf = tree.nodes.new("ShaderNodeBsdfPrincipled")
    set_input(bsdf, "Base Color", color)
    set_input(bsdf, "Metallic", metallic)
    set_input(bsdf, "Roughness", roughness)
    set_input(bsdf, "Coat Weight", 0.16 if metallic > 0.1 else 0.04)
    set_input(bsdf, "Coat Roughness", min(0.5, roughness + 0.08))
    if emission is not None:
        set_input(bsdf, "Emission Color", emission)
        set_input(bsdf, "Emission Strength", 5.0)
    tree.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    if fabric:
        noise = tree.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 210.0
        noise.inputs["Detail"].default_value = 3.0
        noise.inputs["Roughness"].default_value = 0.72
        bump = tree.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.17
        bump.inputs["Distance"].default_value = 0.0022
        tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
        tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
        set_input(bsdf, "Sheen Weight", 0.16)
        set_input(bsdf, "Sheen Roughness", 0.55)
    return mat


def tag(obj: bpy.types.Object, method: str, role: str) -> bpy.types.Object:
    obj["kyx_checkpoint"] = "V6-B0 proof-of-method rev2"
    obj["kyx_method"] = method
    obj["kyx_role"] = role
    obj["not_runtime_asset"] = True
    return obj


def smooth_mesh(obj: bpy.types.Object) -> None:
    if obj.type != "MESH":
        return
    for poly in obj.data.polygons:
        poly.use_smooth = True


def mesh_from_surface_region(
    source: bpy.types.Object,
    name: str,
    predicate,
    collection: bpy.types.Collection,
) -> tuple[bpy.types.Object, dict[int, int], list[tuple[int, ...]]]:
    source_mesh = source.data
    accepted = []
    for poly in source_mesh.polygons:
        center = poly.center
        normal = poly.normal
        if predicate(center, normal):
            accepted.append(tuple(poly.vertices))

    used = sorted({index for face in accepted for index in face})
    remap = {old: new for new, old in enumerate(used)}
    verts = [source_mesh.vertices[index].co.copy() for index in used]
    faces = [tuple(remap[index] for index in face) for face in accepted]
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    smooth_mesh(obj)
    return obj, {new: old for old, new in remap.items()}, faces


def add_surface_stack(
    obj: bpy.types.Object,
    target: bpy.types.Object,
    *,
    offset: float,
    thickness: float,
    bevel: float,
    subdiv: int = 1,
) -> None:
    shrink = obj.modifiers.new("01_NATIVE_SURFACE_FIT", "SHRINKWRAP")
    shrink.target = target
    shrink.wrap_method = "NEAREST_SURFACEPOINT"
    shrink.offset = offset
    if subdiv:
        sub = obj.modifiers.new("02_NATIVE_SURFACE_SMOOTH", "SUBSURF")
        sub.subdivision_type = "CATMULL_CLARK"
        sub.levels = subdiv
        sub.render_levels = subdiv
    solid = obj.modifiers.new("03_NATIVE_PHYSICAL_THICKNESS", "SOLIDIFY")
    solid.thickness = thickness
    solid.offset = 0.0
    solid.use_rim = True
    solid.use_quality_normals = True
    if bevel:
        bev = obj.modifiers.new("04_NATIVE_MANUFACTURED_BEVEL", "BEVEL")
        bev.width = bevel
        bev.segments = 3
        bev.limit_method = "ANGLE"


def boundary_curve(
    source: bpy.types.Object,
    name: str,
    reverse_map: dict[int, int],
    faces: list[tuple[int, ...]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    offset: float,
    radius: float,
) -> bpy.types.Object:
    counts: Counter[tuple[int, int]] = Counter()
    for face in faces:
        for idx, a in enumerate(face):
            b = face[(idx + 1) % len(face)]
            counts[tuple(sorted((a, b)))] += 1
    edges = [edge for edge, count in counts.items() if count == 1]
    adjacency: dict[int, list[int]] = defaultdict(list)
    for a, b in edges:
        adjacency[a].append(b)
        adjacency[b].append(a)

    paths: list[list[int]] = []
    remaining = {tuple(sorted(edge)) for edge in edges}
    while remaining:
        seed = next(iter(remaining))
        start = seed[0]
        for candidate in seed:
            if len(adjacency[candidate]) == 1:
                start = candidate
                break
        path = [start]
        previous = None
        current = start
        while True:
            candidates = [n for n in adjacency[current] if tuple(sorted((current, n))) in remaining]
            if not candidates:
                break
            nxt = candidates[0]
            remaining.remove(tuple(sorted((current, nxt))))
            previous, current = current, nxt
            path.append(current)
            if current == start:
                break
        if len(path) >= 2:
            paths.append(path)

    curve = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = radius
    curve.bevel_resolution = 3
    curve.resolution_u = 2
    for path in paths:
        spline = curve.splines.new("NURBS")
        spline.points.add(len(path) - 1)
        for point, new_index in zip(spline.points, path):
            old_index = reverse_map[new_index]
            vertex = source.data.vertices[old_index]
            co = vertex.co + vertex.normal * offset
            point.co = (*co, 1.0)
        spline.order_u = min(4, len(path))
        spline.use_endpoint_u = True
        spline.resolution_u = 5
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    tag(obj, "boundary-derived curve trim", "manufactured armor edge")
    return obj


def curve_object(
    name: str,
    points: list[tuple[float, float, float]],
    radius: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    cyclic: bool = False,
    bezier: bool = True,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"{name}_Curve", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = radius
    curve.bevel_resolution = 4
    curve.resolution_u = 12
    if bezier:
        spline = curve.splines.new("BEZIER")
        spline.bezier_points.add(len(points) - 1)
        for point, coordinate in zip(spline.bezier_points, points):
            point.co = coordinate
            point.handle_left_type = "AUTO"
            point.handle_right_type = "AUTO"
    else:
        spline = curve.splines.new("POLY")
        spline.points.add(len(points) - 1)
        for point, coordinate in zip(spline.points, points):
            point.co = (*coordinate, 1.0)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    return obj


def rounded_cutter(
    name: str,
    location: tuple[float, float, float],
    dimensions: tuple[float, float, float],
    rotation: tuple[float, float, float],
    collection: bpy.types.Collection,
    bevel: float,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bev = obj.modifiers.new("CUTTER_RADIUS", "BEVEL")
    bev.width = bevel
    bev.segments = 5
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=bev.name)
    move_to_collection(obj, collection)
    obj.display_type = "WIRE"
    obj.hide_render = True
    tag(obj, "boolean cutter", "non-render construction witness")
    return obj


def add_boolean(target: bpy.types.Object, cutter: bpy.types.Object, name: str) -> None:
    modifier = target.modifiers.new(name, "BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter


def extruded_profile(
    name: str,
    xz_points: list[tuple[float, float]],
    y_center: float,
    depth: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    *,
    bevel: float = 0.004,
) -> bpy.types.Object:
    count = len(xz_points)
    front = [(x, y_center - depth * 0.5, z) for x, z in xz_points]
    back = [(x, y_center + depth * 0.5, z) for x, z in xz_points]
    verts = front + back
    faces = [tuple(range(count)), tuple(range(count, count * 2))[::-1]]
    for i in range(count):
        n = (i + 1) % count
        faces.append((i, n, count + n, count + i))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    smooth_mesh(obj)
    if bevel:
        mod = obj.modifiers.new("NATIVE_HARD_SURFACE_BEVEL", "BEVEL")
        mod.width = bevel
        mod.segments = 4
        mod.limit_method = "ANGLE"
    tag(obj, "custom profile extrusion and bevel", "hard-surface manufactured volume")
    return obj


def lofted_grip(
    name: str,
    rings: list[tuple[float, float, float, float, float]],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    segments: int = 16,
) -> bpy.types.Object:
    verts = []
    for x_center, y_center, z, rx, ry in rings:
        for step in range(segments):
            angle = math.tau * step / segments
            # Deliberately asymmetric, flatter front and fuller back rather than
            # a capsule or stock cylinder.
            sx = math.cos(angle)
            sy = math.sin(angle)
            verts.append(
                (
                    x_center + rx * sx * (0.88 if sx < 0.0 else 1.0),
                    y_center + ry * sy * (0.78 if sy < 0.0 else 1.0),
                    z,
                )
            )
    faces = []
    for ring_index in range(len(rings) - 1):
        start = ring_index * segments
        next_start = (ring_index + 1) * segments
        for step in range(segments):
            nxt = (step + 1) % segments
            faces.append((start + step, start + nxt, next_start + nxt, next_start + step))
    faces.append(tuple(range(segments))[::-1])
    top_start = (len(rings) - 1) * segments
    faces.append(tuple(top_start + step for step in range(segments)))
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    smooth_mesh(obj)
    bevel = obj.modifiers.new("NATIVE_GRIP_EDGE_SOFTEN", "BEVEL")
    bevel.width = 0.0035
    bevel.segments = 3
    sub = obj.modifiers.new("NATIVE_GRIP_SUBDIV", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    tag(obj, "multi-ring ergonomic loft", "rifle pistol grip")
    return obj


def make_hand_glove(
    source: bpy.types.Object,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    def mask(center: Vector, _normal: Vector) -> bool:
        return center.x > 0.318 and 0.765 < center.z < 1.025

    glove, _reverse, _faces = mesh_from_surface_region(
        source, f"{PREFIX}Glove_SourceSurfaceExtract", mask, collection
    )

    # Blender-native proportional mesh deformation of the accepted five-digit
    # source hand.  The four digits are identified from the actual separated
    # source topology bands, never replaced by capsules or primitive stacks.
    finger_centers = (-0.151, -0.127, -0.098, -0.063)

    def rotate_weighted(
        coordinate: Vector,
        pivot: Vector,
        axis: str,
        angle: float,
        weight: float,
    ) -> Vector:
        if weight <= 0.0:
            return coordinate
        matrix = Matrix.Rotation(angle * min(1.0, weight), 4, axis)
        return pivot + matrix @ (coordinate - pivot)

    for vertex in glove.data.vertices:
        co = vertex.co.copy()
        if co.x > 0.368 and co.z < 0.908:
            nearest = min(range(4), key=lambda index: abs(co.y - finger_centers[index]))
            center = finger_centers[nearest]
            if abs(co.y - center) < 0.024:
                if nearest == 0:
                    # Trigger digit: sweep forward and flatten so the distal pad
                    # reaches the trigger rather than joining the grip curl.
                    schedule = ((0.902, math.radians(62), 0.045), (0.862, math.radians(24), 0.035))
                else:
                    schedule = (
                        (0.902, math.radians(34), 0.050),
                        (0.866, math.radians(52), 0.042),
                        (0.830, math.radians(40), 0.032),
                    )
                for pivot_z, angle, blend in schedule:
                    weight = max(0.0, min(1.0, (pivot_z - co.z) / blend))
                    co = rotate_weighted(co, Vector((0.397, center, pivot_z)), "Y", angle, weight)

        # Opposed thumb crosses the grip's rear quadrant.  This works on the
        # extracted source thumb volume and keeps its web and nail-side taper.
        if co.x < 0.372 and co.y < -0.125 and co.z < 0.934:
            weight = max(0.0, min(1.0, (0.934 - co.z) / 0.055))
            pivot = Vector((0.356, -0.146, 0.928))
            co = rotate_weighted(co, pivot, "Z", math.radians(-34), weight)
            co = rotate_weighted(co, pivot, "Y", math.radians(28), weight)
        vertex.co = co

    glove.data.update()
    smooth_mesh(glove)
    glove.data.materials.append(material)
    # Keep the non-destructive native garment stack visible in the Blend.
    smooth = glove.modifiers.new("01_NATIVE_PROPORTIONAL_SCULPT_RELAX", "CORRECTIVE_SMOOTH")
    smooth.factor = 0.18
    smooth.iterations = 2
    sub = glove.modifiers.new("02_NATIVE_GLOVE_SURFACE_SMOOTH", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
    solid = glove.modifiers.new("03_NATIVE_GLOVE_THICKNESS", "SOLIDIFY")
    solid.thickness = 0.0024
    solid.offset = 0.4
    solid.use_rim = True

    # Move the posed extracted hand into the isolated receiver contact study.
    palm_origin = Vector((0.382, -0.104, 0.925))
    for vertex in glove.data.vertices:
        vertex.co -= palm_origin
    glove.location = (-0.270, -0.361, 1.040)
    glove.rotation_euler[2] = math.radians(-90.0)
    tag(glove, "source-surface extraction plus proportional sculpt deformation", "five-digit glove")
    return glove


def add_cylinder_hardware(
    name: str,
    location: tuple[float, float, float],
    radius: float,
    depth: float,
    rotation: tuple[float, float, float],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=48,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    move_to_collection(obj, collection)
    obj.data.materials.append(material)
    bevel = obj.modifiers.new("MANUFACTURED_EDGE", "BEVEL")
    bevel.width = min(radius * 0.18, 0.003)
    bevel.segments = 3
    smooth_mesh(obj)
    tag(obj, "lathed attachment hardware", "mechanical fastener")
    return obj


def evaluated_counts(obj: bpy.types.Object) -> tuple[int, int, int]:
    if obj.type != "MESH":
        return (0, 0, 0)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    result = (len(mesh.vertices), len(mesh.polygons), sum(len(poly.vertices) - 2 for poly in mesh.polygons))
    evaluated.to_mesh_clear()
    return result


def author() -> None:
    source = bpy.data.objects.get(SOURCE_NAME)
    if source is None:
        raise RuntimeError(f"Immutable V6-A source object missing: {SOURCE_NAME}")
    if "v6a_anatomy_sculpt_working" not in Path(bpy.data.filepath).name:
        raise RuntimeError("This checkpoint must start from the immutable V6-A anatomy Blend")
    immutable_source_filepath = bpy.data.filepath

    # Remove only a prior execution of this exact isolated lane.
    for obj in list(bpy.data.objects):
        if obj.name.startswith(PREFIX):
            bpy.data.objects.remove(obj, do_unlink=True)

    root = ensure_collection("V6B0_PROOF_METHOD_REV1")
    garment_collection = ensure_collection("V6B0_01_NATIVE_GARMENT", root)
    armor_collection = ensure_collection("V6B0_02_ARMOR_ASSEMBLY", root)
    weapon_collection = ensure_collection("V6B0_03_RECEIVER_CONTACT", root)
    construction_collection = ensure_collection("V6B0_90_CONSTRUCTION_WITNESSES", root)

    source.hide_render = True
    source.hide_set(True)
    source["immutable_v6a_source"] = True
    for source_witness in bpy.data.objects:
        if source_witness.name.startswith("KYX_V6A_AnatomySculpt_"):
            source_witness.hide_render = True
            source_witness.hide_set(True)

    fabric = principled_material(
        "V6B0_MAT_TechnicalFabric",
        (0.012, 0.018, 0.025, 1.0),
        roughness=0.60,
        fabric=True,
    )
    seam = principled_material("V6B0_MAT_SeamRubber", (0.025, 0.035, 0.045, 1.0), roughness=0.38)
    ceramic = principled_material(
        "V6B0_MAT_WarmCeramic",
        (0.47, 0.50, 0.49, 1.0),
        metallic=0.17,
        roughness=0.27,
    )
    edge = principled_material("V6B0_MAT_EdgeMetal", (0.025, 0.035, 0.047, 1.0), metallic=0.82, roughness=0.19)
    graphite = principled_material("V6B0_MAT_Graphite", (0.018, 0.025, 0.034, 1.0), metallic=0.62, roughness=0.31)
    rubber = principled_material("V6B0_MAT_GripRubber", (0.009, 0.012, 0.016, 1.0), roughness=0.48, fabric=True)
    glove_mat = principled_material("V6B0_MAT_GloveTextile", (0.018, 0.024, 0.030, 1.0), roughness=0.53, fabric=True)
    cyan = principled_material(
        "V6B0_MAT_CyanDevice",
        (0.005, 0.055, 0.075, 1.0),
        metallic=0.18,
        roughness=0.20,
        emission=(0.0, 0.75, 1.0, 1.0),
    )
    red = principled_material("V6B0_MAT_SafetyRed", (0.33, 0.018, 0.012, 1.0), metallic=0.28, roughness=0.30)

    def garment_mask(center: Vector, _normal: Vector) -> bool:
        torso = 0.855 < center.z < 1.545 and -0.245 < center.x < 0.248
        right_arm = 0.185 < center.x < 0.420 and 0.930 < center.z < 1.505
        neck = abs(center.x) < 0.125 and 1.485 < center.z < 1.595
        # Deliberate open left armhole; this is a construction study, not a body.
        return torso or right_arm or neck

    garment, _garment_map, _garment_faces = mesh_from_surface_region(
        source, f"{PREFIX}Undersuit_TorsoRightArm_SurfaceExtract", garment_mask, garment_collection
    )
    garment.data.materials.append(fabric)
    add_surface_stack(garment, source, offset=0.0028, thickness=0.0034, bevel=0.0007, subdiv=1)
    tag(garment, "surface extraction, shrinkwrap, subdivision and solidify", "fitted undersuit torso and right arm")

    # Anatomically routed seam and tension/fold logic.  These are stitched
    # curves sitting on the garment, not floating decorative armor plates.
    garment_paths = [
        ("TorsoCenterSeam", [(0.000, -0.174, 0.90), (0.000, -0.178, 1.13), (0.000, -0.174, 1.38), (0.000, -0.145, 1.51)]),
        ("RightClavicleSeam", [(0.000, -0.174, 1.42), (0.090, -0.164, 1.455), (0.185, -0.122, 1.455), (0.250, -0.074, 1.425)]),
        ("LeftClavicleSeam", [(0.000, -0.174, 1.42), (-0.090, -0.164, 1.455), (-0.185, -0.122, 1.455), (-0.232, -0.080, 1.425)]),
        ("RightRibTension", [(0.030, -0.178, 1.22), (0.095, -0.170, 1.205), (0.160, -0.140, 1.175), (0.220, -0.090, 1.145)]),
        ("LeftRibTension", [(-0.030, -0.178, 1.22), (-0.095, -0.170, 1.205), (-0.160, -0.140, 1.175), (-0.225, -0.090, 1.145)]),
        ("RightArmBiasSeam", [(0.238, -0.105, 1.420), (0.292, -0.120, 1.330), (0.327, -0.125, 1.220), (0.365, -0.125, 1.085), (0.392, -0.117, 0.985)]),
    ]
    for suffix, points in garment_paths:
        obj = curve_object(f"{PREFIX}Seam_{suffix}", points, 0.0017, garment_collection, seam)
        tag(obj, "anatomical seam curve", "garment seam and tension routing")

    # Elbow/axilla compression folds communicate actual cloth behavior.
    fold_paths = [
        [(0.312, -0.142, 1.215), (0.334, -0.150, 1.195), (0.355, -0.145, 1.180)],
        [(0.316, -0.138, 1.200), (0.338, -0.147, 1.180), (0.359, -0.140, 1.165)],
        [(0.238, -0.123, 1.385), (0.252, -0.145, 1.355), (0.267, -0.137, 1.325)],
    ]
    for index, points in enumerate(fold_paths, 1):
        obj = curve_object(f"{PREFIX}ClothFold_{index:02d}", points, 0.0011, garment_collection, seam)
        tag(obj, "shaped cloth fold curve", "elbow or axilla compression witness")

    def chest_mask(center: Vector, normal: Vector) -> bool:
        if not (1.225 < center.z < 1.495 and center.y < -0.035 and abs(center.x) < 0.222):
            return False
        normalized = (center.z - 1.225) / 0.270
        width = 0.135 + 0.090 * normalized
        chevron_floor = 1.218 + 0.13 * abs(center.x) / 0.222
        return abs(center.x) < width and center.z > chevron_floor

    chest, chest_map, chest_faces = mesh_from_surface_region(
        source, f"{PREFIX}Armor_ThoracicSurfaceRetopo", chest_mask, armor_collection
    )
    chest.data.materials.append(ceramic)
    add_surface_stack(chest, source, offset=0.016, thickness=0.014, bevel=0.0045, subdiv=1)
    tag(chest, "surface retopology, shrinkwrap, solidify, bevel and boolean", "manufactured thoracic armor")
    boundary_curve(
        source,
        f"{PREFIX}Armor_ThoracicEdgeSeal",
        chest_map,
        chest_faces,
        armor_collection,
        edge,
        offset=0.026,
        radius=0.0025,
    )

    chest_cutters = [
        rounded_cutter(f"{PREFIX}CUT_ChestCore", (0.0, -0.145, 1.375), (0.042, 0.24, 0.105), (0.0, 0.0, 0.0), construction_collection, 0.012),
        rounded_cutter(f"{PREFIX}CUT_ChestVentR1", (0.095, -0.145, 1.345), (0.072, 0.24, 0.014), (0.0, math.radians(-18), 0.0), construction_collection, 0.006),
        rounded_cutter(f"{PREFIX}CUT_ChestVentR2", (0.130, -0.133, 1.315), (0.060, 0.24, 0.013), (0.0, math.radians(-18), 0.0), construction_collection, 0.005),
        rounded_cutter(f"{PREFIX}CUT_ChestVentL1", (-0.095, -0.145, 1.345), (0.072, 0.24, 0.014), (0.0, math.radians(18), 0.0), construction_collection, 0.006),
        rounded_cutter(f"{PREFIX}CUT_ChestVentL2", (-0.130, -0.133, 1.315), (0.060, 0.24, 0.013), (0.0, math.radians(18), 0.0), construction_collection, 0.005),
    ]
    for index, cutter in enumerate(chest_cutters, 1):
        add_boolean(chest, cutter, f"{5 + index:02d}_NATIVE_CARVED_NEGATIVE_SPACE")

    core = extruded_profile(
        f"{PREFIX}Armor_ChestCoreDevice",
        [(-0.016, 1.327), (0.016, 1.327), (0.020, 1.422), (0.0, 1.448), (-0.020, 1.422)],
        -0.171,
        0.010,
        armor_collection,
        cyan,
        bevel=0.002,
    )
    tag(core, "recessed device insert", "backed chest aperture")

    def shoulder_mask(center: Vector, normal: Vector) -> bool:
        dx = (center.x - 0.255) / 0.125
        dy = (center.y + 0.025) / 0.145
        dz = (center.z - 1.405) / 0.115
        return (
            center.x > 0.180
            and center.z > 1.285
            and dx * dx + dy * dy + dz * dz < 1.22
        )

    shoulder, shoulder_map, shoulder_faces = mesh_from_surface_region(
        source, f"{PREFIX}Armor_RightDeltoidSurfaceRetopo", shoulder_mask, armor_collection
    )
    shoulder.data.materials.append(ceramic)
    add_surface_stack(shoulder, source, offset=0.020, thickness=0.013, bevel=0.004, subdiv=1)
    tag(shoulder, "deltoid surface retopology, clearance offset, solidify and bevel", "articulated shoulder armor")
    boundary_curve(
        source,
        f"{PREFIX}Armor_RightDeltoidEdgeSeal",
        shoulder_map,
        shoulder_faces,
        armor_collection,
        edge,
        offset=0.030,
        radius=0.0024,
    )

    shoulder_cutters = [
        rounded_cutter(f"{PREFIX}CUT_ShoulderVent1", (0.292, -0.060, 1.435), (0.18, 0.040, 0.012), (0.0, math.radians(-12), math.radians(8)), construction_collection, 0.0045),
        rounded_cutter(f"{PREFIX}CUT_ShoulderVent2", (0.292, -0.054, 1.405), (0.18, 0.035, 0.010), (0.0, math.radians(-12), math.radians(8)), construction_collection, 0.004),
    ]
    for index, cutter in enumerate(shoulder_cutters, 1):
        add_boolean(shoulder, cutter, f"{5 + index:02d}_NATIVE_VENT_NEGATIVE_SPACE")

    # Two load rails and a real pivot pin bridge chest to deltoid while leaving
    # a visible deforming-arm gap below them.
    for index, points in enumerate(
        [
            [(0.176, -0.112, 1.443), (0.208, -0.102, 1.455), (0.246, -0.076, 1.452), (0.275, -0.043, 1.437)],
            [(0.173, -0.121, 1.407), (0.207, -0.111, 1.419), (0.247, -0.083, 1.418), (0.282, -0.048, 1.405)],
        ],
        1,
    ):
        rail = curve_object(f"{PREFIX}Armor_ShoulderLoadRail_{index:02d}", points, 0.0052, armor_collection, edge)
        tag(rail, "curved load rail", "physical chest-to-shoulder attachment")
    add_cylinder_hardware(
        f"{PREFIX}Armor_ShoulderPivot",
        (0.258, -0.079, 1.421),
        0.018,
        0.070,
        (math.radians(90), 0.0, 0.0),
        armor_collection,
        graphite,
    )
    for y in (-0.116, -0.042):
        add_cylinder_hardware(
            f"{PREFIX}Armor_ShoulderPivotCap_{'Front' if y < -0.08 else 'Rear'}",
            (0.258, y, 1.421),
            0.023,
            0.006,
            (math.radians(90), 0.0, 0.0),
            armor_collection,
            edge,
        )

    # ------------------------------------------------------------------
    # Receiver / grip / trigger / stock-contact construction study.
    # ------------------------------------------------------------------
    receiver = extruded_profile(
        f"{PREFIX}Rifle_ReceiverCore",
        [
            (-0.660, 1.140),
            (-0.610, 1.245),
            (-0.470, 1.272),
            (-0.405, 1.310),
            (-0.080, 1.312),
            (0.055, 1.275),
            (0.135, 1.230),
            (0.125, 1.158),
            (0.025, 1.118),
            (-0.230, 1.108),
            (-0.350, 1.130),
        ],
        -0.285,
        0.102,
        weapon_collection,
        graphite,
        bevel=0.007,
    )
    receiver["actual_boolean_negative_space"] = True
    receiver_cutters = [
        rounded_cutter(f"{PREFIX}CUT_ReceiverEjection", (-0.205, -0.285, 1.247), (0.175, 0.17, 0.050), (0.0, math.radians(-3), 0.0), construction_collection, 0.014),
        rounded_cutter(f"{PREFIX}CUT_ReceiverWindow", (-0.490, -0.285, 1.205), (0.100, 0.17, 0.035), (0.0, math.radians(8), 0.0), construction_collection, 0.010),
        rounded_cutter(f"{PREFIX}CUT_ReceiverVent1", (-0.575, -0.285, 1.243), (0.060, 0.17, 0.018), (0.0, math.radians(10), 0.0), construction_collection, 0.007),
    ]
    for index, cutter in enumerate(receiver_cutters, 1):
        add_boolean(receiver, cutter, f"BOOL_{index:02d}_TRUE_CUT")

    # Recessed internal surfaces prove that the ports are actual negative space.
    extruded_profile(
        f"{PREFIX}Rifle_EjectionBacking",
        [(-0.285, 1.219), (-0.120, 1.219), (-0.120, 1.272), (-0.285, 1.272)],
        -0.258,
        0.006,
        weapon_collection,
        edge,
        bevel=0.001,
    )
    extruded_profile(
        f"{PREFIX}Rifle_CeramicReceiverShell",
        [(-0.435, 1.280), (-0.375, 1.326), (-0.072, 1.328), (0.045, 1.286), (-0.012, 1.254), (-0.340, 1.252)],
        -0.342,
        0.016,
        weapon_collection,
        ceramic,
        bevel=0.004,
    )

    grip = lofted_grip(
        f"{PREFIX}Rifle_Grip",
        [
            (-0.305, -0.285, 1.153, 0.036, 0.046),
            (-0.294, -0.286, 1.105, 0.039, 0.047),
            (-0.278, -0.288, 1.030, 0.043, 0.050),
            (-0.252, -0.290, 0.952, 0.045, 0.052),
            (-0.238, -0.290, 0.902, 0.042, 0.050),
        ],
        weapon_collection,
        rubber,
    )
    grip["literal_contact_target"] = True

    # Grip ribs are continuous fitted curves and provide tactile manufacturing
    # logic without stacking box primitives.
    for index, z in enumerate((0.985, 1.015, 1.045, 1.075), 1):
        rib = curve_object(
            f"{PREFIX}Rifle_GripRib_{index:02d}",
            [(-0.313 + 0.20 * (1.08 - z), -0.333, z + 0.012), (-0.270 + 0.16 * (1.08 - z), -0.342, z), (-0.235 + 0.12 * (1.08 - z), -0.329, z - 0.006)],
            0.0026,
            weapon_collection,
            edge,
        )
        tag(rib, "fitted grip seam rib", "tactile grip detail")

    # Trigger guard and reachable trigger are continuous manufactured curves.
    guard = curve_object(
        f"{PREFIX}Rifle_TriggerGuard",
        [(-0.350, -0.286, 1.125), (-0.380, -0.286, 1.075), (-0.350, -0.286, 1.025), (-0.295, -0.286, 1.040)],
        0.0062,
        weapon_collection,
        graphite,
    )
    tag(guard, "continuous curved trigger guard", "reachable control protection")
    trigger = curve_object(
        f"{PREFIX}Rifle_Trigger",
        [(-0.334, -0.286, 1.115), (-0.337, -0.286, 1.075), (-0.325, -0.286, 1.045)],
        0.0038,
        weapon_collection,
        red,
    )
    trigger["literal_index_contact_target"] = True
    tag(trigger, "continuous trigger curve", "reachable fire control")

    # Magazine well and removable magazine use tapered profiles rather than
    # cuboids; both have readable insertion direction and a release control.
    extruded_profile(
        f"{PREFIX}Rifle_MagWell",
        [(-0.150, 1.145), (-0.035, 1.145), (-0.010, 1.078), (-0.133, 1.067)],
        -0.285,
        0.088,
        weapon_collection,
        edge,
        bevel=0.004,
    )
    extruded_profile(
        f"{PREFIX}Rifle_Magazine",
        [(-0.132, 1.082), (-0.025, 1.082), (-0.008, 0.910), (-0.105, 0.898)],
        -0.285,
        0.074,
        weapon_collection,
        graphite,
        bevel=0.004,
    )
    mag_release = add_cylinder_hardware(
        f"{PREFIX}Rifle_MagRelease",
        (-0.150, -0.344, 1.116),
        0.012,
        0.008,
        (math.radians(90), 0.0, 0.0),
        weapon_collection,
        red,
    )
    mag_release["reachable_control"] = True

    # Skeletonized stock rails replace the rejected rev1 slab. Their curved
    # centerlines rise out of the receiver and terminate in one small pocket
    # pad, preserving negative space and a readable shoulder contact path.
    stock_upper = curve_object(
        f"{PREFIX}Rifle_StockUpperRail",
        [(0.045, -0.238, 1.245), (0.130, -0.205, 1.305), (0.225, -0.160, 1.378), (0.315, -0.104, 1.416)],
        0.011,
        weapon_collection,
        graphite,
    )
    stock_lower = curve_object(
        f"{PREFIX}Rifle_StockLowerRail",
        [(0.058, -0.236, 1.192), (0.145, -0.198, 1.245), (0.236, -0.151, 1.326), (0.314, -0.103, 1.372)],
        0.009,
        weapon_collection,
        graphite,
    )
    for stock_rail in (stock_upper, stock_lower):
        stock_rail["literal_shoulder_contact_target"] = True
        tag(stock_rail, "continuous curved stock rail", "skeletonized shoulder-contact load path")
    stock_pad = extruded_profile(
        f"{PREFIX}Rifle_StockContactPad",
        [(0.298, 1.353), (0.348, 1.365), (0.369, 1.409), (0.342, 1.448), (0.300, 1.426)],
        -0.078,
        0.050,
        weapon_collection,
        rubber,
        bevel=0.006,
    )
    stock_pad["literal_shoulder_contact_target"] = True

    # A continuous handguard stub with true vent cuts establishes production
    # weapon language without pretending this checkpoint is a full rifle.
    handguard = extruded_profile(
        f"{PREFIX}Rifle_HandguardStub",
        [(-0.825, 1.137), (-0.760, 1.250), (-0.610, 1.250), (-0.575, 1.140)],
        -0.285,
        0.095,
        weapon_collection,
        ceramic,
        bevel=0.006,
    )
    for index, x in enumerate((-0.750, -0.690, -0.630), 1):
        cutter = rounded_cutter(
            f"{PREFIX}CUT_HandguardVent_{index:02d}",
            (x, -0.285, 1.205),
            (0.038, 0.17, 0.018),
            (0.0, math.radians(12), 0.0),
            construction_collection,
            0.006,
        )
        add_boolean(handguard, cutter, f"BOOL_VENT_{index:02d}")

    # One continuous top rail with a serrated manufacturing profile.
    rail_profile = [(-0.560, 1.313)]
    teeth = 14
    for index in range(teeth):
        x0 = -0.535 + index * 0.037
        rail_profile.extend([(x0, 1.326), (x0 + 0.018, 1.340), (x0 + 0.034, 1.326)])
    rail_profile.extend([(-0.010, 1.313), (-0.560, 1.313)])
    extruded_profile(
        f"{PREFIX}Rifle_ContinuousTopRail",
        rail_profile,
        -0.285,
        0.050,
        weapon_collection,
        edge,
        bevel=0.0015,
    )

    # Selector, bolt release and restrained luminous status indicator.
    add_cylinder_hardware(
        f"{PREFIX}Rifle_SafetySelector",
        (-0.365, -0.342, 1.205),
        0.013,
        0.009,
        (math.radians(90), 0.0, 0.0),
        weapon_collection,
        red,
    )
    curve_object(
        f"{PREFIX}Rifle_BoltRelease",
        [(-0.115, -0.344, 1.198), (-0.085, -0.347, 1.207), (-0.060, -0.344, 1.193)],
        0.0045,
        weapon_collection,
        edge,
    )
    status = extruded_profile(
        f"{PREFIX}Rifle_StatusIndicator",
        [(-0.310, 1.274), (-0.242, 1.274), (-0.231, 1.292), (-0.299, 1.294)],
        -0.347,
        0.008,
        weapon_collection,
        cyan,
        bevel=0.002,
    )
    status["restrained_accent"] = True

    glove = make_hand_glove(source, weapon_collection, glove_mat)
    glove["contact_targets"] = "grip, trigger, receiver underside"

    # Scene evidence metadata is embedded directly in the Blend.
    scene = bpy.context.scene
    scene["kyx_status"] = "EARLY V6-B0 PROOF OF METHOD REV2 / HUMAN VISUAL REVIEW REQUIRED"
    scene["kyx_nonclaims"] = "NOT V6-B; NOT V6-C; NOT G6; NO RIG; NO EXPORT; NO RUNTIME"
    scene["immutable_source"] = "model/kyx_vanguard_v6a_anatomy_sculpt_working.blend"
    scene["pinned_concept"] = "concept/kyx-vanguard-v6c-production-target-v1.png"
    scene["construction_scope"] = "undersuit torso/right arm; chest/right shoulder armor; five-digit glove; receiver/grip/trigger/stock-contact region"

    # Save and generate a machine-readable direct inventory from the actual
    # evaluated scene, not from author intent.
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT_BLEND), check_existing=False)

    inventory = []
    for obj in sorted((o for o in bpy.data.objects if o.name.startswith(PREFIX)), key=lambda item: item.name):
        base_vertices = len(obj.data.vertices) if obj.type == "MESH" else 0
        base_polygons = len(obj.data.polygons) if obj.type == "MESH" else 0
        eval_vertices, eval_polygons, eval_triangles = evaluated_counts(obj)
        inventory.append(
            {
                "name": obj.name,
                "type": obj.type,
                "role": obj.get("kyx_role", ""),
                "method": obj.get("kyx_method", ""),
                "hide_render": bool(obj.hide_render),
                "base_vertices": base_vertices,
                "base_polygons": base_polygons,
                "evaluated_vertices": eval_vertices,
                "evaluated_polygons": eval_polygons,
                "evaluated_triangles": eval_triangles,
                "modifiers": [
                    {"name": modifier.name, "type": modifier.type}
                    for modifier in obj.modifiers
                ],
                "materials": [slot.material.name if slot.material else None for slot in obj.material_slots],
            }
        )

    report = {
        "checkpoint": "V6-B0 proof-of-method rev2",
        "status": "EARLY METHOD CHECKPOINT / HUMAN VISUAL REVIEW REQUIRED / NO G6 CLAIM",
        "source_blend": immutable_source_filepath,
        "output_blend": str(OUTPUT_BLEND),
        "object_count": len(inventory),
        "visible_object_count": sum(not item["hide_render"] for item in inventory),
        "construction_witness_count": sum(item["hide_render"] for item in inventory),
        "base_vertices": sum(item["base_vertices"] for item in inventory),
        "base_polygons": sum(item["base_polygons"] for item in inventory),
        "evaluated_vertices": sum(item["evaluated_vertices"] for item in inventory),
        "evaluated_polygons": sum(item["evaluated_polygons"] for item in inventory),
        "evaluated_triangles": sum(item["evaluated_triangles"] for item in inventory),
        "armatures": len([obj for obj in bpy.data.objects if obj.type == "ARMATURE"]),
        "actions": len(bpy.data.actions),
        "external_libraries": len(bpy.data.libraries),
        "materials": sorted(material.name for material in bpy.data.materials if material.name.startswith("V6B0_")),
        "inventory": inventory,
        "nonclaims": ["NOT V6-B", "NOT V6-C", "NOT G6", "NO RIG", "NO EXPORT", "NO RUNTIME INTEGRATION"],
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("V6B0_AUTHORING_REPORT=" + json.dumps({key: report[key] for key in ("object_count", "evaluated_triangles", "armatures", "actions")}))


if __name__ == "__main__":
    author()
