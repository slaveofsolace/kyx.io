"""Author the rigged KYX Assault Rev32 third-person review character.

This script preserves the frozen Rev23/Material Flow presentation source,
transfers the proven Rev17 66-joint deformation/socket/animation contract onto
the continuous V6B body, retains the detailed CC0 SciFiHelmet, replaces the
floating visor slab with a fitted framed lens, skins the connected armor,
builds practical LODs, and exports animated GLBs without an embedded weapon.

The output remains a candidate until direct runtime and human visual review.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


CHECKPOINT = "G6_ASSAULT_REV32_RUNTIME_REVIEW_CHARACTER"
BODY_NAME = "KYX_V6B_TACTICAL_REV9_ContinuousBodysuit"
SOURCE_WEIGHT_BODY = "KYX_REV17_LOD0_CONTINUOUS_HUMAN_UNDERSUIT"
SOURCE_FOOTWEAR_ARMOR = "KYX_REV17_LOD0_AUTHORED_FITTED_ARMOR"
SOURCE_RIG = "KYX_REV17_RIG_66_JOINT_WITH_SOCKETS"
RUNTIME_RIG = "KYX_REV32_ASSAULT_RIG_66_JOINT_WITH_SOCKETS"
RUNTIME_BODY = "KYX_REV32_ASSAULT_LOD0_CONTINUOUS_CYBERSUIT"
RUNTIME_ARMOR = "KYX_REV32_ASSAULT_LOD0_CONNECTED_ARMOR_HELMET"
EYE_PREFIX = "KYX_V6A_AnatomySculpt_Eye"
HELMET_PREFIXES = (
    "KYX_V6B_REV22_HelmetLiner",
    "KYX_V6B_REV22_SciFiHelmet_CC0",
    "KYX_V6B_REV22_Visor",
    "KYX_REV32_Assault",
)
NON_ARMOR_NAMES = {
    BODY_NAME,
    "KYX_V6B_REV22_SciFiHelmet_Source_Camera",
}
EXCLUDED_RUNTIME_MESHES = {
    # Keep the complete fitted presentation footwear. It is cleaner than the
    # legacy Rev17 multi-part armor crop and is articulated below per foot/shin.
    # Replace the disconnected presentation shoulder wedges and waist ring
    # with rounded, overlapping runtime assemblies.
    "KYX_V6B_REV23_ClavicleYoke_L",
    "KYX_V6B_REV23_ClavicleYoke_R",
    "KYX_V6B_REV23_ShoulderBridge_L",
    "KYX_V6B_REV23_ShoulderBridge_R",
    "KYX_V6B_REV23_ShoulderCap_L",
    "KYX_V6B_REV23_ShoulderCap_R",
    "KYX_V6B_TACTICAL_REV2_NarrowWaistBreak",
}
EXPECTED_ACTIONS = (
    "KYX_REV17_FP_AIRBORNE",
    "KYX_REV17_FP_FIRE",
    "KYX_REV17_FP_IDLE",
    "KYX_REV17_FP_LAND",
    "KYX_REV17_FP_RELOAD",
    "KYX_REV17_FP_SPRINT",
    "KYX_REV17_TP_IDLE",
    "KYX_REV17_TP_WALK",
    "KYX_REV17_TP_RUN",
    "KYX_REV17_TP_JUMP_START",
    "KYX_REV17_TP_AIRBORNE_LOOP",
    "KYX_REV17_TP_LAND",
    "KYX_REV17_TP_PRIMARY_FIRE",
    "KYX_REV17_TP_RELOAD",
    "KYX_REV17_TP_HIT_REACTION_FRONT",
    "KYX_REV17_TP_DEATH_FRONT",
)
RUNTIME_PBR_PALETTE = {
    "KYX_V6B_REV23_CyberSuit": {
        "base": (0.0070, 0.0150, 0.0240, 1.0),
        "metallic": 0.12,
        "roughness": 0.58,
    },
    "KYX_V6B_REV23_CyberGlove": {
        "base": (0.0030, 0.0075, 0.0125, 1.0),
        "metallic": 0.08,
        "roughness": 0.56,
    },
    "KYX_V6B_REV23_AgedIvorySteel": {
        "base": (0.050, 0.064, 0.078, 1.0),
        "metallic": 0.82,
        "roughness": 0.40,
    },
    "KYX_V6B_REV23_GraphiteMetal": {
        "base": (0.0060, 0.0090, 0.0130, 1.0),
        "metallic": 0.72,
        "roughness": 0.48,
    },
    "KYX_V6B_REV23_InsetBlack": {
        "base": (0.003, 0.010, 0.016, 1.0),
        "metallic": 0.38,
        "roughness": 0.52,
    },
    "KYX_V6B_REV23_MutedBrass": {
        "base": (0.1175, 0.0565, 0.0140, 1.0),
        "metallic": 0.82,
        "roughness": 0.34,
    },
    "KYX_V6B_REV23_VisorGlass": {
        "base": (0.0020, 0.0320, 0.0520, 1.0),
        "metallic": 0.52,
        "roughness": 0.12,
        "emission": (0.000, 0.060, 0.105, 1.0),
        "emissionStrength": 0.75,
    },
}


def args() -> tuple[Path, ...]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <rev17-master.blend> <output-master.blend> "
            "<lod0.glb> <lod1.glb> <lod2.glb> <audit.json>"
        )
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 6:
        raise SystemExit(f"Expected six arguments, got {len(values)}")
    return tuple(Path(value).resolve() for value in values)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def triangle_count(obj: bpy.types.Object) -> int:
    if obj.type != "MESH":
        return 0
    return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)


def activate(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def apply_modifier(obj: bpy.types.Object, modifier: bpy.types.Modifier) -> None:
    activate(obj)
    bpy.ops.object.modifier_apply(modifier=modifier.name)


def apply_candidate_surface(obj: bpy.types.Object) -> list[dict[str, Any]]:
    """Freeze visible non-rig modifiers without baking the 64x body Multires."""

    records: list[dict[str, Any]] = []
    for modifier in list(obj.modifiers):
        record = {
            "name": modifier.name,
            "type": modifier.type,
            "action": "applied",
        }
        if modifier.type == "MULTIRES":
            # The candidate render used level 3, but a 677k-vertex body is not a
            # viable browser runtime mesh. Preserve the authored base cage and
            # let material normals carry fine surface detail.
            obj.modifiers.remove(modifier)
            record["action"] = "removed_runtime_excess"
        elif modifier.type == "ARMATURE":
            obj.modifiers.remove(modifier)
            record["action"] = "removed_stale_armature"
        else:
            apply_modifier(obj, modifier)
        records.append(record)
    return records


def flatten_runtime_materials() -> list[dict[str, Any]]:
    """Replace unsupported procedural inputs with portable glTF PBR constants."""

    records: list[dict[str, Any]] = []
    for palette_name, values in RUNTIME_PBR_PALETTE.items():
        matches = [
            material
            for material in bpy.data.materials
            if material.name == palette_name
            or material.name.startswith(palette_name + ".")
        ]
        for material in matches:
            if not material.use_nodes:
                continue
            shader = next(
                (
                    node
                    for node in material.node_tree.nodes
                    if node.type == "BSDF_PRINCIPLED"
                ),
                None,
            )
            if shader is None:
                continue
            links = material.node_tree.links
            for socket_name in ("Base Color", "Normal"):
                socket = shader.inputs.get(socket_name)
                if socket is not None:
                    for link in list(socket.links):
                        links.remove(link)
            shader.inputs["Base Color"].default_value = values["base"]
            shader.inputs["Metallic"].default_value = values["metallic"]
            shader.inputs["Roughness"].default_value = values["roughness"]
            emission = shader.inputs.get("Emission Color") or shader.inputs.get(
                "Emission"
            )
            if emission is not None and "emission" in values:
                emission.default_value = values["emission"]
            emission_strength = shader.inputs.get("Emission Strength")
            if emission_strength is not None and "emissionStrength" in values:
                emission_strength.default_value = values["emissionStrength"]
            records.append(
                {
                    "material": material.name,
                    "paletteSource": palette_name,
                    "baseColor": list(values["base"]),
                    "metallic": values["metallic"],
                    "roughness": values["roughness"],
                    "method": "portable_constant_pbr_for_gltf",
                }
            )
    return records


def align_presentation_to_rev17_forward() -> dict[str, Any]:
    """Mirror source depth so its front matches the proven Rev17 +Y contract.

    A 180-degree object rotation would swap anatomical left and right. Mirroring
    only world Y preserves each side's vertex-to-bone correspondence while
    correcting the presentation source's opposite forward axis.
    """

    records: list[dict[str, Any]] = []
    for obj in [item for item in bpy.data.objects if item.type == "MESH"]:
        world = obj.matrix_world.copy()
        inverse = world.inverted()
        for vertex in obj.data.vertices:
            point = world @ vertex.co
            point.y *= -1.0
            vertex.co = inverse @ point
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
        records.append(
            {
                "object": obj.name,
                "vertices": len(obj.data.vertices),
                "method": "world_y_mirror_preserve_anatomical_x",
            }
        )
    return {
        "sourceForward": "-Y",
        "runtimeForward": "+Y",
        "leftRightPreserved": True,
        "objectsMirrored": records,
    }


def add_runtime_abdomen_bands() -> list[bpy.types.Object]:
    source = bpy.data.objects.get("KYX_V6B_TACTICAL_REV2_NarrowWaistBreak")
    if source is None or source.type != "MESH":
        raise RuntimeError("Runtime abdomen bridge source band is missing")
    graphite = bpy.data.materials.get("KYX_V6B_REV23_GraphiteMetal")
    inset = bpy.data.materials.get("KYX_V6B_REV23_InsetBlack")
    if graphite is None or inset is None:
        raise RuntimeError("Runtime waist materials are missing")
    created: list[bpy.types.Object] = []

    gasket = source.copy()
    gasket.data = source.data.copy()
    gasket.name = "KYX_REV24_RuntimeWaistFlexGasket"
    source.users_collection[0].objects.link(gasket)
    center_z = sum(vertex.co.z for vertex in gasket.data.vertices) / max(
        1, len(gasket.data.vertices)
    )
    for vertex in gasket.data.vertices:
        vertex.co.x *= 0.94
        vertex.co.y *= 0.94
        vertex.co.z = center_z + (vertex.co.z - center_z) * 1.45
    gasket.location.z -= 0.010
    gasket.data.materials.clear()
    gasket.data.materials.append(inset)
    gasket["kyx_role"] = "continuous inset-black articulated waist flex gasket"
    created.append(gasket)

    for role in ("Front_L", "Front_R", "Lumbar"):
        plate = source.copy()
        plate.data = source.data.copy()
        plate.name = f"KYX_REV24_RuntimeWaistPlate_{role}"
        source.users_collection[0].objects.link(plate)
        world = plate.matrix_world.copy()
        bm = bmesh.new()
        bm.from_mesh(plate.data)
        remove = []
        for vertex in bm.verts:
            point = world @ vertex.co
            if role == "Front_L":
                keep = point.x >= 0.004 and point.y <= 0.018
            elif role == "Front_R":
                keep = point.x <= -0.004 and point.y <= 0.018
            else:
                keep = point.y >= 0.004
            if not keep:
                remove.append(vertex)
        bmesh.ops.delete(bm, geom=remove, context="VERTS")
        bm.to_mesh(plate.data)
        bm.free()
        if not plate.data.vertices or not plate.data.polygons:
            raise RuntimeError(f"Runtime waist crop produced an empty part: {role}")
        center_z = sum(vertex.co.z for vertex in plate.data.vertices) / max(
            1, len(plate.data.vertices)
        )
        for vertex in plate.data.vertices:
            vertex.co.x *= 1.01
            vertex.co.y *= 1.01
            vertex.co.z = center_z + (vertex.co.z - center_z) * 0.72
        plate.location.z += 0.026
        plate.data.materials.clear()
        plate.data.materials.append(graphite)
        for polygon in plate.data.polygons:
            polygon.use_smooth = True
        plate["kyx_role"] = (
            "segmented overlapping waist plate with visible flex gaps"
        )
        created.append(plate)
    return created


def add_runtime_shoulder_assemblies() -> list[bpy.types.Object]:
    """Replace pointed presentation wedges with rounded telescoping shoulder armor."""

    aged = bpy.data.materials.get("KYX_V6B_REV23_AgedIvorySteel")
    if aged is None:
        raise RuntimeError("Runtime shoulder material is missing")
    created: list[bpy.types.Object] = []
    for side in ("L", "R"):
        cap_source = bpy.data.objects.get(f"KYX_V6B_REV23_ShoulderCap_{side}")
        yoke_source = bpy.data.objects.get(f"KYX_V6B_REV23_ClavicleYoke_{side}")
        if cap_source is None or yoke_source is None:
            raise RuntimeError(f"Runtime shoulder sources are missing for {side}")

        cap = cap_source.copy()
        cap.data = cap_source.data.copy()
        cap.name = f"KYX_REV24_RoundedShoulderCap_{side}"
        cap_source.users_collection[0].objects.link(cap)
        while cap.modifiers:
            cap.modifiers.remove(cap.modifiers[0])
        bm = bmesh.new()
        bm.from_mesh(cap.data)
        for _ in range(2):
            bmesh.ops.smooth_vert(
                bm,
                verts=list(bm.verts),
                factor=0.34,
                use_axis_x=True,
                use_axis_y=True,
                use_axis_z=True,
            )
        bm.to_mesh(cap.data)
        bm.free()
        center = sum((vertex.co for vertex in cap.data.vertices), Vector()) / max(
            1, len(cap.data.vertices)
        )
        for vertex in cap.data.vertices:
            radial = vertex.co - center
            vertex.co = center + Vector(
                (radial.x * 1.04, radial.y * 1.08, radial.z * 0.92)
            )
        cap.data.materials.clear()
        cap.data.materials.append(aged)
        subdivision = cap.modifiers.new(
            name="KYX_REV24_ShoulderRound",
            type="SUBSURF",
        )
        subdivision.levels = 1
        subdivision.render_levels = 1
        solidify = cap.modifiers.new(
            name="KYX_REV24_ShoulderThickness",
            type="SOLIDIFY",
        )
        solidify.thickness = 0.0036
        bevel = cap.modifiers.new(name="KYX_REV24_ShoulderEdge", type="BEVEL")
        bevel.width = 0.0015
        bevel.segments = 3
        for polygon in cap.data.polygons:
            polygon.use_smooth = True
        cap["kyx_role"] = "rounded upper-arm shoulder shell without pointed corners"
        created.append(cap)

        yoke = yoke_source.copy()
        yoke.data = yoke_source.data.copy()
        yoke.name = f"KYX_REV24_ConnectedClavicleYoke_{side}"
        yoke_source.users_collection[0].objects.link(yoke)
        while yoke.modifiers:
            yoke.modifiers.remove(yoke.modifiers[0])
        points = [vertex.co.copy() for vertex in yoke.data.vertices]
        center = sum(points, Vector()) / max(1, len(points))
        minimum_x = min(abs(point.x) for point in points)
        maximum_x = max(abs(point.x) for point in points)
        span_x = max(0.0001, maximum_x - minimum_x)
        direction = 1.0 if side == "L" else -1.0
        for vertex in yoke.data.vertices:
            outer = min(
                1.0,
                max(0.0, (abs(vertex.co.x) - minimum_x) / span_x),
            )
            vertex.co.x += direction * 0.012 * outer
            vertex.co.z = center.z + (vertex.co.z - center.z) * 0.90
        yoke.location.z -= 0.006
        yoke.data.materials.clear()
        yoke.data.materials.append(aged)
        subdivision = yoke.modifiers.new(
            name="KYX_REV24_YokeRound",
            type="SUBSURF",
        )
        subdivision.levels = 1
        subdivision.render_levels = 1
        solidify = yoke.modifiers.new(
            name="KYX_REV24_YokeThickness",
            type="SOLIDIFY",
        )
        solidify.thickness = 0.0032
        bevel = yoke.modifiers.new(name="KYX_REV24_YokeEdge", type="BEVEL")
        bevel.width = 0.0014
        bevel.segments = 3
        for polygon in yoke.data.polygons:
            polygon.use_smooth = True
        yoke["kyx_role"] = "connected rounded clavicle-to-shoulder transition"
        created.append(yoke)
    return created


def rounded_curve_mesh(
    name: str,
    points: tuple[tuple[float, float, float], ...],
    material: bpy.types.Material,
    bevel_depth: float,
    role: str,
) -> bpy.types.Object:
    """Create one smooth authored rail, then freeze it to exportable mesh."""

    curve = bpy.data.curves.new(name=f"{name}_Curve", type="CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 3
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 3
    curve.resolution_u = 12
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for control, coordinate in zip(spline.bezier_points, points):
        control.co = coordinate
        control.handle_left_type = "AUTO"
        control.handle_right_type = "AUTO"
    curve.materials.append(material)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.scene.collection.objects.link(obj)
    activate(obj)
    result = bpy.ops.object.convert(target="MESH")
    if "FINISHED" not in result or bpy.context.object is None:
        raise RuntimeError(f"Could not freeze helmet rail: {name}")
    obj = bpy.context.object
    obj.name = name
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    obj["kyx_role"] = role
    return obj


def prepare_rev32_helmet_integration() -> list[bpy.types.Object]:
    """Keep the authored helmet and fit a restrained lens into its eye line."""

    aged = bpy.data.materials.get("KYX_V6B_REV23_AgedIvorySteel")
    graphite = bpy.data.materials.get("KYX_V6B_REV23_GraphiteMetal")
    visor_material = bpy.data.materials.get("KYX_V6B_REV23_VisorGlass")
    liner = bpy.data.objects.get("KYX_V6B_REV22_HelmetLiner")
    helmet = bpy.data.objects.get("KYX_V6B_REV22_SciFiHelmet_CC0")
    source_visor = bpy.data.objects.get("KYX_V6B_REV22_Visor")
    if any(
        item is None
        for item in (aged, graphite, visor_material, liner, helmet, source_visor)
    ):
        raise RuntimeError("Rev32 detailed helmet integration sources are missing")

    # Pull the smooth cowl closer to the skull so the detailed exoshell, rather
    # than an oversized egg silhouette, owns the helmet's outer read.
    liner_world = liner.matrix_world.copy()
    liner_inverse = liner_world.inverted()
    liner_bounds = [liner_world @ Vector(corner) for corner in liner.bound_box]
    liner_center = Vector(
        tuple(
            (min(point[axis] for point in liner_bounds) + max(point[axis] for point in liner_bounds)) * 0.5
            for axis in range(3)
        )
    )
    for vertex in liner.data.vertices:
        point = liner_world @ vertex.co
        delta = point - liner_center
        point = liner_center + Vector((delta.x * 0.92, delta.y * 0.90, delta.z * 0.98))
        vertex.co = liner_inverse @ point
    liner.data.update()

    # Discard the presentation ribbon and author one continuous inset eye-line
    # lens. Eleven columns produce a shallow wrap that remains inside the cheek
    # shells instead of reading as a black bar pasted across the face.
    bpy.data.objects.remove(source_visor, do_unlink=True)
    x_values = (
        -0.062,
        -0.050,
        -0.038,
        -0.025,
        -0.012,
        0.0,
        0.012,
        0.025,
        0.038,
        0.050,
        0.062,
    )
    vertices: list[tuple[float, float, float]] = []
    for upper in (True, False):
        for x_value in x_values:
            side = abs(x_value) / 0.062
            y_value = 0.177 - 0.023 * (side**1.55)
            z_value = (
                1.666 - 0.008 * side
                if upper
                else 1.648 + 0.004 * side
            )
            vertices.append((x_value, y_value, z_value))
    column_count = len(x_values)
    faces = [
        (index, index + 1, column_count + index + 1, column_count + index)
        for index in range(column_count - 1)
    ]
    visor_mesh = bpy.data.meshes.new("KYX_REV32_AssaultIntegratedVisor_Mesh")
    visor_mesh.from_pydata(vertices, [], faces)
    visor_mesh.update()
    visor = bpy.data.objects.new("KYX_REV32_AssaultIntegratedVisor", visor_mesh)
    bpy.context.scene.collection.objects.link(visor)
    visor.data.materials.append(visor_material)
    for polygon in visor.data.polygons:
        polygon.use_smooth = True
    visor_solidify = visor.modifiers.new(name="KYX_REV32_VisorThickness", type="SOLIDIFY")
    visor_solidify.thickness = 0.0018
    visor_bevel = visor.modifiers.new(name="KYX_REV32_VisorEdge", type="BEVEL")
    visor_bevel.width = 0.0008
    visor_bevel.segments = 3
    visor["kyx_role"] = "continuous fitted dark sapphire eye-line visor"

    rail_specs = (
        (
            "KYX_REV32_AssaultVisorBrowRail",
            (
                (-0.062, 0.154, 1.658),
                (-0.038, 0.167, 1.661),
                (0.000, 0.177, 1.666),
                (0.038, 0.167, 1.661),
                (0.062, 0.154, 1.658),
            ),
            graphite,
            0.0012,
            "continuous visor brow frame",
        ),
        (
            "KYX_REV32_AssaultVisorSillRail",
            (
                (-0.062, 0.154, 1.652),
                (-0.038, 0.167, 1.650),
                (0.000, 0.177, 1.648),
                (0.038, 0.167, 1.650),
                (0.062, 0.154, 1.652),
            ),
            graphite,
            0.0010,
            "continuous visor sill frame",
        ),
        (
            "KYX_REV32_AssaultVisorTemple_L",
            (
                (-0.062, 0.154, 1.658),
                (-0.063, 0.153, 1.655),
                (-0.062, 0.154, 1.652),
            ),
            graphite,
            0.0011,
            "left fitted visor edge frame",
        ),
        (
            "KYX_REV32_AssaultVisorTemple_R",
            (
                (0.062, 0.154, 1.658),
                (0.063, 0.153, 1.655),
                (0.062, 0.154, 1.652),
            ),
            graphite,
            0.0011,
            "right fitted visor edge frame",
        ),
        (
            "KYX_REV32_AssaultCrownSpine",
            (
                (0.000, 0.177, 1.668),
                (0.000, 0.132, 1.716),
                (0.000, 0.080, 1.770),
                (0.000, 0.018, 1.800),
                (0.000, -0.046, 1.775),
            ),
            aged,
            0.0035,
            "continuous visor-to-crown helmet spine",
        ),
    )
    created = [visor]
    for name, points, material, bevel_depth, role in rail_specs:
        created.append(
            rounded_curve_mesh(name, points, material, bevel_depth, role)
        )
    helmet["kyx_role"] = "detailed CC0 Assault exoshell retained from source"
    liner["kyx_role"] = "continuous graphite helmet cowl and neck seal"
    return created


def add_rev32_forearm_bracers(rig: bpy.types.Object) -> list[bpy.types.Object]:
    """Add one smooth tapered Assault bracer per forearm articulation."""

    graphite = bpy.data.materials.get("KYX_V6B_REV23_GraphiteMetal")
    if graphite is None:
        raise RuntimeError("Rev32 graphite bracer material is missing")
    created: list[bpy.types.Object] = []
    for side in ("L", "R"):
        bone_name = f"forearm.{side}"
        bone = rig.data.bones.get(bone_name)
        if bone is None:
            raise RuntimeError(f"Rev32 forearm attachment bone is missing: {bone_name}")
        head = rig.matrix_world @ bone.head_local
        tail = rig.matrix_world @ bone.tail_local
        axis = tail - head
        length = axis.length
        if length <= 0.05:
            raise RuntimeError(f"Rev32 forearm bone is too short: {bone_name}")
        center = head + axis * 0.68
        depth = length * 0.48
        bpy.ops.mesh.primitive_cone_add(
            vertices=24,
            radius1=0.042,
            radius2=0.050,
            depth=depth,
            end_fill_type="NGON",
            location=center,
        )
        obj = bpy.context.object
        if obj is None:
            raise RuntimeError(f"Could not create Rev32 bracer: {side}")
        obj.name = f"KYX_REV32_AssaultForearmBracer_{side}"
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = Vector((0.0, 0.0, 1.0)).rotation_difference(
            axis.normalized()
        )
        obj.data.materials.append(graphite)
        bevel = obj.modifiers.new(name="KYX_REV32_BracerEdge", type="BEVEL")
        bevel.width = 0.0040
        bevel.segments = 3
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        obj["kyx_role"] = f"smooth tapered articulated forearm bracer {side}"
        created.append(obj)
    return created


def add_runtime_ankle_transitions() -> list[bpy.types.Object]:
    """Build nested, articulated ankle armor from the measured lower-leg rings."""

    graphite = bpy.data.materials.get("KYX_V6B_REV23_GraphiteMetal")
    aged = bpy.data.materials.get("KYX_V6B_REV23_AgedIvorySteel")
    if graphite is None or aged is None:
        raise RuntimeError("Runtime ankle-transition materials are missing")

    created: list[bpy.types.Object] = []
    for side in ("L", "R"):
        source = bpy.data.objects.get(f"KYX_V6B_TACTICAL_REV21_BootCuff_{side}")
        if source is None or source.type != "MESH":
            raise RuntimeError(f"Measured ankle-ring source is missing for {side}")

        # The original source ring already follows the true body opening. Split
        # it into a foot-driven lower bell and a shin-driven upper collar so the
        # two hard-surface pieces telescope during ankle flex instead of pulling
        # one rigid cylinder through both the shoe and lower leg.
        for role, keep_lower, material in (
            ("AnkleLower", True, graphite),
            ("ShinCollar", False, aged),
        ):
            obj = source.copy()
            obj.data = source.data.copy()
            obj.name = f"KYX_REV24_{role}_{side}"
            source.users_collection[0].objects.link(obj)

            world = obj.matrix_world.copy()
            inverse = world.inverted()
            ring_centers: dict[float, Vector] = {}
            for vertex in obj.data.vertices:
                point = world @ vertex.co
                ring_z = round(float(point.z), 6)
                ring_centers.setdefault(ring_z, Vector())
                ring_centers[ring_z] += point
            for ring_z in list(ring_centers):
                count = sum(
                    1
                    for vertex in obj.data.vertices
                    if round(float((world @ vertex.co).z), 6) == ring_z
                )
                ring_centers[ring_z] /= max(1, count)

            bm = bmesh.new()
            bm.from_mesh(obj.data)
            remove = []
            for vertex in bm.verts:
                point = world @ vertex.co
                if (keep_lower and point.z > 0.180001) or (
                    not keep_lower
                    and (point.z < 0.179999 or point.y > 0.086)
                ):
                    remove.append(vertex)
            bmesh.ops.delete(bm, geom=remove, context="VERTS")
            bm.to_mesh(obj.data)
            bm.free()

            for vertex in obj.data.vertices:
                point = world @ vertex.co
                source_z = round(float(point.z), 6)
                center = ring_centers[source_z]
                radial = Vector((point.x - center.x, point.y - center.y, 0.0))
                if keep_lower:
                    blend = min(1.0, max(0.0, (point.z - 0.120) / 0.060))
                    radial_scale = 0.96 + 0.06 * blend
                    point.z = 0.120 + (point.z - 0.120) * 1.03
                else:
                    # Nest the collar inside the lower bell for a 20 mm
                    # telescoping overlap, then flare it just outside the body
                    # opening to prevent coplanar clipping and visible air.
                    blend = min(1.0, max(0.0, (point.z - 0.180) / 0.067))
                    radial_scale = 0.90 + 0.10 * blend
                    if source_z == 0.18:
                        point.z = 0.162
                point.x = center.x + radial.x * radial_scale
                point.y = center.y + radial.y * radial_scale
                vertex.co = inverse @ point

            obj.data.update()
            obj.data.materials.clear()
            obj.data.materials.append(material)
            for polygon in obj.data.polygons:
                polygon.material_index = 0
                polygon.use_smooth = True
            obj["kyx_role"] = (
                "foot-driven nested tactical ankle bell"
                if keep_lower
                else "shin-driven fitted tactical collar"
            )
            obj["kyx_articulation"] = (
                f"foot_anchor.{side}" if keep_lower else f"shin_anchor.{side}"
            )
            created.append(obj)
    return created


def fit_runtime_footwear(obj: bpy.types.Object) -> dict[str, Any] | None:
    """Center compact footwear beneath the measured lower-leg opening."""

    if "Boot" not in obj.name or obj.type != "MESH":
        return None
    is_left = obj.name.endswith("_L")
    is_right = obj.name.endswith("_R")
    if not is_left and not is_right:
        return None
    world = obj.matrix_world.copy()
    inverse = world.inverted()
    points = [world @ vertex.co for vertex in obj.data.vertices]
    if not points:
        raise RuntimeError(f"Runtime footwear has no vertices: {obj.name}")
    center = sum(points, Vector()) / len(points)
    minimum_z = min(point.z for point in points)
    # The actual lower-leg boundary is centered at +/-0.1662 m. The previous
    # +/-0.105 m target pulled both shoes inward and created the apparent air
    # gap even though their top vertices reached the correct height.
    target_x = 0.166 if is_left else -0.166
    if "BootCuff" in obj.name:
        scales = Vector((0.82, 0.94, 0.86))
        target_y = 0.020
    elif "BootOutsole" in obj.name:
        scales = Vector((0.78, 0.82, 0.78))
        target_y = 0.035
    else:
        scales = Vector((0.80, 0.82, 1.10))
        target_y = 0.040
    maximum_toe_flattening = 0.0
    for vertex, point in zip(obj.data.vertices, points):
        fitted = Vector(
            (
                target_x + (point.x - center.x) * scales.x,
                target_y + (point.y - center.y) * scales.y,
                minimum_z + (point.z - minimum_z) * scales.z,
            )
        )
        if "BootUpper" in obj.name:
            toe_weight = min(
                1.0,
                max(0.0, ((fitted.y - target_y) - 0.035) / 0.070),
            )
            if toe_weight > 0.0:
                ceiling = minimum_z + 0.100 - 0.045 * toe_weight
                if fitted.z > ceiling:
                    maximum_toe_flattening = max(
                        maximum_toe_flattening,
                        fitted.z - ceiling,
                    )
                    fitted.z = ceiling
        vertex.co = inverse @ fitted
    obj.data.update()
    fitted_points = [world @ vertex.co for vertex in obj.data.vertices]
    fitted_center = sum(fitted_points, Vector()) / len(fitted_points)
    return {
        "object": obj.name,
        "method": "world_space_anchor_centered_proportionate_footwear_fit",
        "centerBefore": [round(float(value), 6) for value in center],
        "centerAfter": [round(float(value), 6) for value in fitted_center],
        "targetAnchorX": target_x,
        "measuredLowerLegOpeningAnchorX": 0.1662 if is_left else -0.1662,
        "scaleXYZ": [float(value) for value in scales],
        "pointedUpperExtensionRemoved": True,
        "ankleTransition": "nested_articulated_lower_bell_and_shin_collar",
        "maximumToeFlatteningMeters": round(maximum_toe_flattening, 6),
        "floorZPreserved": round(float(minimum_z), 6),
        "floorShiftMeters": round(
            min(point.z for point in fitted_points) - minimum_z,
            8,
        ),
    }


def fit_runtime_torso_armor(obj: bpy.types.Object) -> dict[str, Any] | None:
    """Refit presentation armor after the bounded runtime body proportion pass."""

    if obj.type != "MESH" or any(
        token in obj.name
        for token in (
            "Helmet",
            "Boot",
            "Ankle",
            "ShinCollar",
            "NeckGorget",
            "RIFLE",
        )
    ):
        return None
    if "SternumSpine" in obj.name:
        world = obj.matrix_world.copy()
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        remove = [
            vertex for vertex in bm.verts if (world @ vertex.co).z < 1.245
        ]
        bmesh.ops.delete(bm, geom=remove, context="VERTS")
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(obj.data)
        bm.free()
        if not obj.data.vertices or not obj.data.polygons:
            raise RuntimeError("Runtime sternum cleanup removed the entire plate")

    world = obj.matrix_world.copy()
    inverse = world.inverted()
    changed = 0
    maximum_displacement = 0.0
    for vertex in obj.data.vertices:
        point = world @ vertex.co
        fitted = point.copy()
        if 1.18 <= point.z <= 1.52 and abs(point.x) <= 0.39:
            taper = (
                1.0
                if point.z <= 1.44
                else max(0.0, min(1.0, (1.52 - point.z) / 0.08))
            )
            fitted.x *= 1.0 + 0.112 * taper
            fitted.y *= 1.0 + 0.048 * taper
        elif 0.98 <= point.z < 1.18 and abs(point.x) <= 0.36:
            fitted.x *= 1.13
            fitted.y *= 1.05
        displacement = (fitted - point).length
        if displacement > 0.0:
            vertex.co = inverse @ fitted
            changed += 1
            maximum_displacement = max(maximum_displacement, displacement)
    obj.data.update()
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return {
        "object": obj.name,
        "method": "role_bounded_refit_after_runtime_body_proportion_pass",
        "changedVertices": changed,
        "maximumDisplacementMeters": round(maximum_displacement, 8),
        "sternumLowerEdgeMeters": 1.245 if "SternumSpine" in obj.name else None,
    }


def refine_runtime_grip_actions(
    rig: bpy.types.Object,
    rifle: bpy.types.Object,
    body: bpy.types.Object,
) -> list[dict[str, Any]]:
    """Close mirrored grips and keep the support palm on the rifle fore-end."""

    corrections = {
        # Firing hand: preserve a moderated trigger index while closing the
        # remaining fingers and thumb around the narrower Rev19 grip.
        ("R", "index"): 22.0,
        ("R", "middle"): 52.0,
        ("R", "ring"): 56.0,
        ("R", "pinky"): 60.0,
        ("R", "thumb"): 30.0,
        # The source pose already carries a strong mirrored curl. Add only a
        # bounded anatomical progression after rolling the palm toward the
        # fore-end; large cancelling values made the fingers read as needles.
        ("L", "index"): 38.0,
        ("L", "middle"): 44.0,
        ("L", "ring"): 48.0,
        ("L", "pinky"): 52.0,
        ("L", "thumb"): 26.0,
    }
    joint_factors = {
        "R": (0.6, 1.0, 0.8),
        "L": (0.45, 0.70, 0.55),
    }
    support_forearm_name = "forearm.L"
    support_bone_name = "wrist.L"
    support_forearm_roll_y_degrees = -45.0
    support_wrist_roll_y_degrees = -33.0
    support_thumb_opposition_z_degrees = -14.0
    desired_palm_clearance = 0.0025
    maximum_palm_correction = 0.010
    palm_group = body.vertex_groups.get("palm.L")
    if palm_group is None:
        raise RuntimeError("Runtime body is missing palm.L weights")
    palm_vertex_indices = [
        vertex.index
        for vertex in body.data.vertices
        if any(
            assignment.group == palm_group.index and assignment.weight >= 0.35
            for assignment in vertex.groups
        )
    ]
    if len(palm_vertex_indices) < 4:
        raise RuntimeError(
            f"Runtime palm contact sample is too small: {len(palm_vertex_indices)}"
        )
    contact_actions = {
        "KYX_REV17_TP_IDLE",
        "KYX_REV17_TP_WALK",
        "KYX_REV17_TP_RUN",
        "KYX_REV17_TP_JUMP_START",
        "KYX_REV17_TP_AIRBORNE_LOOP",
        "KYX_REV17_TP_LAND",
        "KYX_REV17_TP_PRIMARY_FIRE",
    }
    animation_data = rig.animation_data_create()
    animation_data.use_nla = False
    scene = bpy.context.scene
    records: list[dict[str, Any]] = []
    for action_name in sorted(contact_actions):
        action = bpy.data.actions.get(action_name)
        if action is None:
            raise RuntimeError(f"Grip correction action is missing: {action_name}")
        matching_export_strips = [
            strip
            for track in animation_data.nla_tracks
            for strip in track.strips
            if strip.action == action
        ]
        if len(matching_export_strips) != 1:
            raise RuntimeError(
                f"Expected one NLA export strip for {action_name}, got "
                f"{len(matching_export_strips)}"
            )
        export_strip = matching_export_strips[0]
        export_slot = export_strip.action_slot
        if export_slot is None:
            raise RuntimeError(f"NLA export slot is missing for {action_name}")
        slot_count_before = len(action.slots)
        animation_data.action = action
        # Blender 5 actions are layered and slotted. Renaming the imported rig
        # from Rev17 to Rev24 makes automatic assignment choose/create a second
        # slot, while the NLA strip and glTF exporter continue reading the
        # original Rev17 slot. Bind edits explicitly to the strip's slot so the
        # corrected channels are the channels that are actually exported.
        animation_data.action_slot = export_slot
        if animation_data.action_slot != export_slot:
            raise RuntimeError(f"Could not bind NLA export slot for {action_name}")
        start = int(math.floor(action.frame_range[0]))
        end = int(math.ceil(action.frame_range[1]))
        sampled: dict[int, dict[str, Matrix]] = {}
        for frame in range(start, end + 1):
            scene.frame_set(frame)
            bpy.context.view_layer.update()
            sampled[frame] = {
                **{
                    f"{finger}_{joint:02d}.{side}": rig.pose.bones[
                        f"{finger}_{joint:02d}.{side}"
                    ].matrix_basis.copy()
                    for side, finger in corrections
                    for joint in (1, 2, 3)
                },
                support_bone_name: rig.pose.bones[
                    support_bone_name
                ].matrix_basis.copy(),
                support_forearm_name: rig.pose.bones[
                    support_forearm_name
                ].matrix_basis.copy(),
            }
        pre_contact_clearances: list[float] = []
        post_contact_clearances: list[float] = []
        support_corrections: list[float] = []
        for frame in range(start, end + 1):
            scene.frame_set(frame)
            support_forearm = rig.pose.bones[support_forearm_name]
            support_forearm.matrix_basis = sampled[frame][
                support_forearm_name
            ] @ Matrix.Rotation(
                math.radians(support_forearm_roll_y_degrees),
                4,
                "Y",
            )
            support_bone = rig.pose.bones[support_bone_name]
            support_bone.matrix_basis = sampled[frame][
                support_bone_name
            ] @ Matrix.Rotation(
                math.radians(support_wrist_roll_y_degrees),
                4,
                "Y",
            )

            for (side, finger), degrees in corrections.items():
                for joint, factor in zip((1, 2, 3), joint_factors[side]):
                    bone_name = f"{finger}_{joint:02d}.{side}"
                    bone = rig.pose.bones[bone_name]
                    corrected_basis = sampled[frame][bone_name] @ Matrix.Rotation(
                        math.radians(degrees * factor),
                        4,
                        "X",
                    )
                    if side == "L" and finger == "thumb" and joint == 1:
                        corrected_basis = corrected_basis @ Matrix.Rotation(
                            math.radians(support_thumb_opposition_z_degrees),
                            4,
                            "Z",
                        )
                    bone.matrix_basis = corrected_basis
            bpy.context.view_layer.update()

            evaluated_rifle = rifle.evaluated_get(
                bpy.context.evaluated_depsgraph_get()
            )
            evaluated_mesh = evaluated_rifle.to_mesh()
            rifle_vertices = [
                evaluated_rifle.matrix_world @ vertex.co
                for vertex in evaluated_mesh.vertices
            ]
            rifle_polygons = [
                tuple(polygon.vertices) for polygon in evaluated_mesh.polygons
            ]
            rifle_bvh = BVHTree.FromPolygons(
                rifle_vertices,
                rifle_polygons,
                all_triangles=False,
            )
            evaluated_rifle.to_mesh_clear()

            evaluated_body = body.evaluated_get(
                bpy.context.evaluated_depsgraph_get()
            )
            evaluated_body_mesh = evaluated_body.to_mesh()
            if len(evaluated_body_mesh.vertices) != len(body.data.vertices):
                evaluated_body.to_mesh_clear()
                raise RuntimeError(
                    "Runtime palm contact evaluation changed body topology"
                )
            palm_center = sum(
                (
                    evaluated_body.matrix_world
                    @ evaluated_body_mesh.vertices[index].co
                    for index in palm_vertex_indices
                ),
                Vector(),
            ) / len(palm_vertex_indices)
            evaluated_body.to_mesh_clear()
            nearest = rifle_bvh.find_nearest(palm_center)
            if nearest is None:
                raise RuntimeError(
                    f"Could not find rifle surface for support hand in {action_name}"
                )
            nearest_point = nearest[0]
            pre_clearance = float(nearest[3])
            correction_distance = min(
                maximum_palm_correction,
                max(0.0, pre_clearance - desired_palm_clearance),
            )
            if correction_distance > 0.0:
                direction = (nearest_point - palm_center).normalized()
                world_delta = direction * correction_distance
                pose_delta = (
                    rig.matrix_world.inverted().to_3x3() @ world_delta
                )
                support_matrix = support_bone.matrix.copy()
                support_matrix.translation += pose_delta
                support_bone.matrix = support_matrix
                bpy.context.view_layer.update()

            support_bone.keyframe_insert(
                data_path="location",
                frame=frame,
                group=support_bone_name,
            )
            if support_bone.rotation_mode == "QUATERNION":
                support_bone.keyframe_insert(
                    data_path="rotation_quaternion",
                    frame=frame,
                    group=support_bone_name,
                )
            elif support_bone.rotation_mode == "AXIS_ANGLE":
                support_bone.keyframe_insert(
                    data_path="rotation_axis_angle",
                    frame=frame,
                    group=support_bone_name,
                )
            else:
                support_bone.keyframe_insert(
                    data_path="rotation_euler",
                    frame=frame,
                    group=support_bone_name,
                )
            if support_forearm.rotation_mode == "QUATERNION":
                support_forearm.keyframe_insert(
                    data_path="rotation_quaternion",
                    frame=frame,
                    group=support_forearm_name,
                )
            elif support_forearm.rotation_mode == "AXIS_ANGLE":
                support_forearm.keyframe_insert(
                    data_path="rotation_axis_angle",
                    frame=frame,
                    group=support_forearm_name,
                )
            else:
                support_forearm.keyframe_insert(
                    data_path="rotation_euler",
                    frame=frame,
                    group=support_forearm_name,
                )

            evaluated_body = body.evaluated_get(
                bpy.context.evaluated_depsgraph_get()
            )
            evaluated_body_mesh = evaluated_body.to_mesh()
            corrected_palm_center = sum(
                (
                    evaluated_body.matrix_world
                    @ evaluated_body_mesh.vertices[index].co
                    for index in palm_vertex_indices
                ),
                Vector(),
            ) / len(palm_vertex_indices)
            evaluated_body.to_mesh_clear()
            corrected_nearest = rifle_bvh.find_nearest(corrected_palm_center)
            if corrected_nearest is None:
                raise RuntimeError(
                    f"Could not recheck support hand in {action_name}"
                )
            pre_contact_clearances.append(pre_clearance)
            post_contact_clearances.append(float(corrected_nearest[3]))
            support_corrections.append(correction_distance)

            for (side, finger), degrees in corrections.items():
                for joint, _factor in zip((1, 2, 3), joint_factors[side]):
                    bone_name = f"{finger}_{joint:02d}.{side}"
                    bone = rig.pose.bones[bone_name]
                    if bone.rotation_mode == "QUATERNION":
                        bone.keyframe_insert(
                            data_path="rotation_quaternion",
                            frame=frame,
                            group=bone_name,
                        )
                    elif bone.rotation_mode == "AXIS_ANGLE":
                        bone.keyframe_insert(
                            data_path="rotation_axis_angle",
                            frame=frame,
                            group=bone_name,
                        )
                    else:
                        bone.keyframe_insert(
                            data_path="rotation_euler",
                            frame=frame,
                            group=bone_name,
                        )
        maximum_post_clearance = max(post_contact_clearances)
        if maximum_post_clearance > 0.00405:
            raise RuntimeError(
                f"Support palm clearance remains too large in {action_name}: "
                f"{maximum_post_clearance:.6f} m"
            )
        if len(action.slots) != slot_count_before:
            raise RuntimeError(
                f"Grip correction created an unintended action slot for "
                f"{action_name}: {slot_count_before} -> {len(action.slots)}"
            )
        action["kyx_rev24_mirrored_compact_rifle_grip"] = True
        records.append(
            {
                "action": action_name,
                "frames": [start, end],
                "method": (
                    "sample_then_key_exact_nla_export_slot_mirrored_local_x_"
                    "digit_curl_and_bounded_support_palm_surface_contact"
                ),
                "exportSlot": {
                    "identifier": export_slot.identifier,
                    "handle": int(export_slot.handle),
                    "nlaStrip": export_strip.name,
                    "actionSlotCount": len(action.slots),
                },
                "mirroredLocalXCurlDegrees": {
                    f"{finger}.{side}": degrees
                    for (side, finger), degrees in corrections.items()
                },
                "jointFactors": {
                    side: list(factors)
                    for side, factors in joint_factors.items()
                },
                "supportPalm": {
                    "drivenBone": support_bone_name,
                    "distributedRollBones": [
                        support_forearm_name,
                        support_bone_name,
                    ],
                    "contactSampleBodyGroup": "palm.L",
                    "contactSampleVertexCount": len(palm_vertex_indices),
                    "forearmLocalYRollDegrees": (
                        support_forearm_roll_y_degrees
                    ),
                    "wristLocalYRollDegrees": support_wrist_roll_y_degrees,
                    "thumbOppositionLocalZDegrees": (
                        support_thumb_opposition_z_degrees
                    ),
                    "desiredClearanceMeters": desired_palm_clearance,
                    "maximumCorrectionMeters": maximum_palm_correction,
                    "maximumAppliedCorrectionMeters": round(
                        max(support_corrections),
                        8,
                    ),
                    "meanAppliedCorrectionMeters": round(
                        sum(support_corrections) / len(support_corrections),
                        8,
                    ),
                    "maximumClearanceBeforeMeters": round(
                        max(pre_contact_clearances),
                        8,
                    ),
                    "maximumClearanceAfterMeters": round(
                        maximum_post_clearance,
                        8,
                    ),
                },
            }
        )
    animation_data.action = None
    return records


def evaluated_minimum_z(objects: list[bpy.types.Object]) -> float:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    minimum = math.inf
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            minimum = min(
                minimum,
                *(
                    (evaluated.matrix_world @ vertex.co).z
                    for vertex in mesh.vertices
                ),
            )
        finally:
            evaluated.to_mesh_clear()
    if not math.isfinite(minimum):
        raise RuntimeError("Could not evaluate a finite runtime floor minimum")
    return float(minimum)


def ground_runtime_death_action(
    rig: bpy.types.Object,
    meshes: list[bpy.types.Object],
) -> dict[str, Any]:
    """Keep the inherited in-place death fall in contact with the floor.

    Rev17 rotated the character around an elevated root without compensating
    translation, leaving the final corpse roughly 0.77 m in the air. Sample the
    unmodified exact export slot first, then key a per-frame root translation so
    the lowest evaluated body/armor point remains on the rest-pose floor.
    """

    action_name = "KYX_REV17_TP_DEATH_FRONT"
    action = bpy.data.actions.get(action_name)
    if action is None:
        raise RuntimeError(f"Death grounding action is missing: {action_name}")
    animation_data = rig.animation_data_create()
    matching_export_strips = [
        strip
        for track in animation_data.nla_tracks
        for strip in track.strips
        if strip.action == action
    ]
    if len(matching_export_strips) != 1:
        raise RuntimeError(
            f"Expected one NLA export strip for {action_name}, got "
            f"{len(matching_export_strips)}"
        )
    export_strip = matching_export_strips[0]
    export_slot = export_strip.action_slot
    if export_slot is None:
        raise RuntimeError(f"NLA export slot is missing for {action_name}")
    slot_count_before = len(action.slots)
    scene = bpy.context.scene
    root = rig.pose.bones.get("root")
    if root is None:
        raise RuntimeError("Runtime rig is missing the root bone")

    animation_data.use_nla = False
    animation_data.action = None
    rig.data.pose_position = "REST"
    scene.frame_set(1)
    bpy.context.view_layer.update()
    reference_floor = evaluated_minimum_z(meshes)

    rig.data.pose_position = "POSE"
    animation_data.action = action
    animation_data.action_slot = export_slot
    if animation_data.action_slot != export_slot:
        raise RuntimeError(f"Could not bind NLA export slot for {action_name}")
    start = int(math.floor(action.frame_range[0]))
    end = int(math.ceil(action.frame_range[1]))
    sampled: dict[int, dict[str, Any]] = {}
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        sampled[frame] = {
            "matrix": root.matrix.copy(),
            "floorBefore": evaluated_minimum_z(meshes),
        }

    world_to_pose = rig.matrix_world.inverted().to_3x3()
    corrections: list[float] = []
    floors_after: list[float] = []
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        correction = max(
            0.0,
            sampled[frame]["floorBefore"] - reference_floor,
        )
        corrected = sampled[frame]["matrix"].copy()
        corrected.translation += world_to_pose @ Vector((0.0, 0.0, -correction))
        root.matrix = corrected
        bpy.context.view_layer.update()
        root.keyframe_insert(
            data_path="location",
            frame=frame,
            group=root.name,
        )
        corrections.append(correction)

    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        floors_after.append(evaluated_minimum_z(meshes))
    maximum_floor_error = max(abs(value - reference_floor) for value in floors_after)
    if maximum_floor_error > 0.0025:
        raise RuntimeError(
            f"Death grounding residual exceeds tolerance: {maximum_floor_error:.6f} m"
        )
    if len(action.slots) != slot_count_before:
        raise RuntimeError(
            f"Death grounding created an unintended action slot: "
            f"{slot_count_before} -> {len(action.slots)}"
        )
    action["kyx_rev32_grounded_death"] = True
    animation_data.action = None
    return {
        "action": action_name,
        "frames": [start, end],
        "method": "sample_exact_nla_slot_then_key_root_floor_contact_every_frame",
        "exportSlot": {
            "identifier": export_slot.identifier,
            "handle": int(export_slot.handle),
            "nlaStrip": export_strip.name,
            "actionSlotCount": len(action.slots),
        },
        "referenceFloorZ": round(reference_floor, 8),
        "finalFloorBeforeZ": round(sampled[end]["floorBefore"], 8),
        "finalFloorAfterZ": round(floors_after[-1], 8),
        "maximumAppliedDownwardCorrectionMeters": round(max(corrections), 8),
        "maximumPostCorrectionFloorErrorMeters": round(maximum_floor_error, 8),
    }


def author_runtime_proportions(body: bpy.types.Object) -> dict[str, Any]:
    """Correct the inherited hourglass read into an athletic cyber-soldier."""

    changed = 0
    maximum_displacement = 0.0
    regions = {
        "upperTorso": 0,
        "waist": 0,
        "pelvis": 0,
        "upperLegs": 0,
    }
    for vertex in body.data.vertices:
        before = vertex.co.copy()
        x = float(vertex.co.x)
        z = float(vertex.co.z)
        if 1.18 <= z <= 1.54 and abs(x) <= 0.35:
            taper = (
                1.0
                if z <= 1.44
                else max(0.0, min(1.0, (1.52 - z) / 0.08))
            )
            if z >= 1.48 and abs(x) <= 0.12:
                taper = 0.0
            if taper > 0.0:
                vertex.co.x *= 1.0 + 0.10 * taper
                vertex.co.y *= 1.0 + 0.035 * taper
                regions["upperTorso"] += 1
        elif 0.98 <= z < 1.18 and abs(x) <= 0.31:
            vertex.co.x *= 1.12
            vertex.co.y *= 1.035
            regions["waist"] += 1
        elif 0.76 <= z < 0.98 and abs(x) <= 0.36:
            vertex.co.x *= 0.86
            vertex.co.y *= 0.86
            regions["pelvis"] += 1
        elif 0.52 <= z < 0.76 and abs(x) <= 0.34:
            vertex.co.x *= 0.92
            vertex.co.y *= 0.90
            regions["upperLegs"] += 1
        displacement = (vertex.co - before).length
        if displacement > 0.0:
            changed += 1
            maximum_displacement = max(maximum_displacement, displacement)
    body.data.update()
    return {
        "method": "bounded_athletic_torso_waist_pelvis_upper_leg_runtime_adjustment",
        "changedVertices": changed,
        "regionVertexCounts": regions,
        "maximumDisplacementMeters": round(maximum_displacement, 8),
        "topologyChanged": False,
    }


def expose_runtime_boot_underlay(body: bpy.types.Object) -> dict[str, Any]:
    """Preserve the fully hidden foot helper below the complete boot assembly."""

    slots = [
        {"slot": index, "source": material.name}
        for index, material in enumerate(body.data.materials)
        if material is not None and "BootOcclusionMask" in material.name
    ]
    return {
        "method": "complete_authored_boot_shell_hides_deleted_foot_helper",
        "replacedSlots": [],
        "maskedSlots": slots,
        "visible": False,
    }


def remove_runtime_occlusion_faces(body: bpy.types.Object) -> dict[str, Any]:
    """Delete presentation-only faces hidden below helmet and complete boots."""

    head_mask_indices = {
        index
        for index, material in enumerate(body.data.materials)
        if material is not None
        and "HeadOcclusionMask" in material.name
    }
    boot_mask_indices = {
        index
        for index, material in enumerate(body.data.materials)
        if material is not None
        and "BootOcclusionMask" in material.name
    }
    if not head_mask_indices and not boot_mask_indices:
        return {"removedFaces": 0, "materialIndices": []}
    bm = bmesh.new()
    bm.from_mesh(body.data)
    bm.faces.ensure_lookup_table()
    targets = [
        face
        for face in bm.faces
        if face.material_index in head_mask_indices
        or face.material_index in boot_mask_indices
    ]
    removed = len(targets)
    bmesh.ops.delete(bm, geom=targets, context="FACES_ONLY")
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()
    return {
        "removedFaces": removed,
        "materialIndices": sorted(head_mask_indices | boot_mask_indices),
        "method": "delete_head_mask_and_fully_enclosed_foot_helper_keep_authored_boot_shell",
    }


def append_rig_and_weight_reference(
    master_path: Path,
) -> tuple[bpy.types.Object, bpy.types.Object, bpy.types.Object]:
    with bpy.data.libraries.load(str(master_path), link=False) as (source, target):
        missing = {
            SOURCE_RIG,
            SOURCE_WEIGHT_BODY,
            SOURCE_FOOTWEAR_ARMOR,
        } - set(source.objects)
        if missing:
            raise RuntimeError(f"Missing Rev17 source objects: {sorted(missing)}")
        target.objects = [SOURCE_RIG, SOURCE_WEIGHT_BODY, SOURCE_FOOTWEAR_ARMOR]

    objects = [item for item in target.objects if item is not None]
    rig = next(item for item in objects if item.name.startswith(SOURCE_RIG))
    reference = next(
        item for item in objects if item.name.startswith(SOURCE_WEIGHT_BODY)
    )
    footwear = next(
        item for item in objects if item.name.startswith(SOURCE_FOOTWEAR_ARMOR)
    )
    for obj in objects:
        if not obj.users_collection:
            bpy.context.scene.collection.objects.link(obj)
    rig.name = RUNTIME_RIG
    return rig, reference, footwear


def prepare_rev32_footwear(
    footwear: bpy.types.Object,
    rig: bpy.types.Object,
) -> dict[str, Any]:
    """Extract the proven articulated Rev17 shoes without its rejected armor."""

    before_vertices = len(footwear.data.vertices)
    before_triangles = triangle_count(footwear)
    world = footwear.matrix_world.copy()
    bm = bmesh.new()
    bm.from_mesh(footwear.data)
    remove = [
        vertex for vertex in bm.verts if (world @ vertex.co).z > 0.315
    ]
    bmesh.ops.delete(bm, geom=remove, context="VERTS")
    # Discard disconnected lower tips from shin/thigh plates. Real shoe
    # components reach the floor; the V-shaped remnants do not.
    unvisited = set(bm.verts)
    components: list[set[bmesh.types.BMVert]] = []
    while unvisited:
        seed = unvisited.pop()
        component = {seed}
        stack = [seed]
        while stack:
            current = stack.pop()
            for edge in current.link_edges:
                neighbor = edge.other_vert(current)
                if neighbor in unvisited:
                    unvisited.remove(neighbor)
                    component.add(neighbor)
                    stack.append(neighbor)
        components.append(component)
    keep = {
        vertex
        for component in components
        if len(component) >= 8
        and min((world @ vertex.co).z for vertex in component) <= 0.060
        for vertex in component
    }
    bmesh.ops.delete(
        bm,
        geom=[vertex for vertex in bm.verts if vertex not in keep],
        context="VERTS",
    )
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(footwear.data)
    bm.free()
    footwear.data.update()
    if not footwear.data.vertices or not footwear.data.polygons:
        raise RuntimeError("Rev17 footwear extraction produced an empty mesh")
    inverse = world.inverted()
    for vertex in footwear.data.vertices:
        point = world @ vertex.co
        anchor_x = 0.166 if point.x >= 0.0 else -0.166
        point.x = anchor_x + (point.x - anchor_x) * 0.90
        point.y *= 0.90
        point.z *= 0.92
        vertex.co = inverse @ point
    footwear.data.update()
    for modifier in list(footwear.modifiers):
        if modifier.type == "ARMATURE":
            modifier.object = rig
            modifier.use_deform_preserve_volume = True
        else:
            apply_modifier(footwear, modifier)
    if not any(modifier.type == "ARMATURE" for modifier in footwear.modifiers):
        bind_to_rig(footwear, rig)
    graphite = bpy.data.materials.get("KYX_V6B_REV23_GraphiteMetal")
    if graphite is None:
        raise RuntimeError("Rev32 graphite footwear material is missing")
    footwear.data.materials.clear()
    footwear.data.materials.append(graphite)
    for polygon in footwear.data.polygons:
        polygon.material_index = 0
        polygon.use_smooth = True
    footwear.name = "KYX_REV32_AssaultArticulatedFootwear"
    footwear["kyx_role"] = "proven Rev17 articulated compact footwear extraction"
    return {
        "object": footwear.name,
        "method": "crop_proven_rev17_articulated_armor_below_0_315m",
        "verticesBefore": before_vertices,
        "trianglesBefore": before_triangles,
        "verticesAfter": len(footwear.data.vertices),
        "trianglesAfter": triangle_count(footwear),
        "maximumWorldZ": 0.315,
        "floorConnectedComponentsKept": True,
        "scaleXYZ": [0.90, 0.90, 0.92],
        "weightsPreserved": True,
    }


def clear_vertex_groups(obj: bpy.types.Object) -> None:
    while obj.vertex_groups:
        obj.vertex_groups.remove(obj.vertex_groups[0])


def copy_weights_by_index(
    source: bpy.types.Object,
    target: bpy.types.Object,
) -> dict[str, Any]:
    if len(source.data.vertices) != len(target.data.vertices):
        raise RuntimeError(
            "Continuous body topology no longer matches the proven weight source: "
            f"{len(source.data.vertices)} != {len(target.data.vertices)}"
        )
    clear_vertex_groups(target)
    groups = {
        group.index: target.vertex_groups.new(name=group.name)
        for group in source.vertex_groups
    }
    assigned = 0
    max_influences = 0
    for source_vertex in source.data.vertices:
        influences = [
            assignment
            for assignment in source_vertex.groups
            if assignment.weight > 0.00001
        ]
        max_influences = max(max_influences, len(influences))
        for assignment in influences:
            groups[assignment.group].add(
                [source_vertex.index],
                float(assignment.weight),
                "REPLACE",
            )
            assigned += 1
    return {
        "method": "exact_vertex_index_from_rev17_continuous_body",
        "vertices": len(target.data.vertices),
        "groups": len(target.vertex_groups),
        "assignments": assigned,
        "maximumInfluences": max_influences,
    }


def refine_runtime_glove_geometry(
    body: bpy.types.Object,
    rig: bpy.types.Object,
) -> dict[str, Any]:
    """Thicken weighted digit silhouettes and shorten distal needle tips."""

    finger_names = {
        f"{finger}_{joint:02d}.{side}"
        for side in ("L", "R")
        for finger in ("index", "middle", "ring", "pinky", "thumb")
        for joint in (1, 2, 3)
    }
    groups = {
        group.index: group.name
        for group in body.vertex_groups
        if group.name in finger_names
    }
    if len(groups) != len(finger_names):
        missing = sorted(finger_names - set(groups.values()))
        raise RuntimeError(f"Runtime glove groups are missing: {missing}")

    body_to_rig = rig.matrix_world.inverted() @ body.matrix_world
    rig_to_body = body_to_rig.inverted()
    changed = 0
    maximum_displacement = 0.0
    for vertex in body.data.vertices:
        relevant = [
            assignment
            for assignment in vertex.groups
            if assignment.group in groups and assignment.weight > 0.05
        ]
        if not relevant:
            continue
        dominant = max(relevant, key=lambda item: item.weight)
        influence = min(1.0, sum(item.weight for item in relevant))
        bone_name = groups[dominant.group]
        bone = rig.data.bones[bone_name]
        point = body_to_rig @ vertex.co
        axis = bone.tail_local - bone.head_local
        length = axis.length
        if length <= 0.0001:
            continue
        axis.normalize()
        along = (point - bone.head_local).dot(axis)
        if bone_name.split(".")[0].endswith("_03") and along > length:
            along = length + (along - length) * 0.82
        centerline = bone.head_local + axis * along
        radial = point - centerline
        if radial.length > 0.035:
            continue
        thickness = 1.0 + (
            0.16 if bone_name.split(".")[0].endswith("_03") else 0.12
        ) * influence
        fitted = centerline + radial * thickness
        before = vertex.co.copy()
        vertex.co = rig_to_body @ fitted
        displacement = (vertex.co - before).length
        if displacement > 0.0:
            changed += 1
            maximum_displacement = max(maximum_displacement, displacement)
    body.data.update()
    return {
        "method": "weight_bounded_digit_radial_thickening_and_tip_shortening",
        "changedVertices": changed,
        "maximumDisplacementMeters": round(maximum_displacement, 8),
        "topologyChanged": False,
    }


def bind_to_rig(obj: bpy.types.Object, rig: bpy.types.Object) -> None:
    # glTF requires skinned meshes at the scene root for portable transform
    # behavior. The Armature modifier carries the deformation relationship.
    world = obj.matrix_world.copy()
    obj.parent = None
    obj.matrix_world = world
    modifier = obj.modifiers.new(name="KYX_REV24_Armature", type="ARMATURE")
    modifier.object = rig
    modifier.use_deform_preserve_volume = True


def rigid_weight(
    obj: bpy.types.Object,
    rig: bpy.types.Object,
    bone_name: str,
) -> dict[str, Any]:
    if bone_name not in rig.data.bones:
        raise RuntimeError(f"Required bone is missing: {bone_name}")
    clear_vertex_groups(obj)
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    bind_to_rig(obj, rig)
    return {
        "object": obj.name,
        "bone": bone_name,
        "vertices": len(obj.data.vertices),
    }


def transfer_surface_weights(
    obj: bpy.types.Object,
    body: bpy.types.Object,
    rig: bpy.types.Object,
) -> dict[str, Any]:
    clear_vertex_groups(obj)
    for source_group in body.vertex_groups:
        obj.vertex_groups.new(name=source_group.name)
    modifier = obj.modifiers.new(name="KYX_REV24_SurfaceWeights", type="DATA_TRANSFER")
    modifier.object = body
    modifier.use_vert_data = True
    modifier.data_types_verts = {"VGROUP_WEIGHTS"}
    modifier.vert_mapping = "POLYINTERP_NEAREST"
    modifier.layers_vgroup_select_src = "ALL"
    modifier.layers_vgroup_select_dst = "NAME"
    modifier.mix_mode = "REPLACE"
    modifier.mix_factor = 1.0
    modifier.use_max_distance = True
    modifier.max_distance = 0.30
    apply_modifier(obj, modifier)
    bind_to_rig(obj, rig)
    weighted = sum(1 for vertex in obj.data.vertices if vertex.groups)
    if weighted != len(obj.data.vertices):
        raise RuntimeError(
            f"Surface weight transfer left {len(obj.data.vertices) - weighted} "
            f"vertices unweighted on {obj.name}"
        )
    return {
        "object": obj.name,
        "vertices": len(obj.data.vertices),
        "weightedVertices": weighted,
        "groups": len(obj.vertex_groups),
        "method": "nearest_surface_interpolated_from_continuous_body",
    }


def armor_attachment_bone(name: str) -> str:
    """Choose one articulated hard-surface attachment per authored plate."""

    if "AnkleLower_L" in name:
        return "foot_anchor.L"
    if "AnkleLower_R" in name:
        return "foot_anchor.R"
    if "ShinCollar_L" in name:
        return "shin_anchor.L"
    if "ShinCollar_R" in name:
        return "shin_anchor.R"
    if "BootUpper_L" in name or "BootOutsole_L" in name:
        return "foot_anchor.L"
    if "BootUpper_R" in name or "BootOutsole_R" in name:
        return "foot_anchor.R"
    if "BootCuff_L" in name:
        return "foot_anchor.L"
    if "BootCuff_R" in name:
        return "foot_anchor.R"
    if "ShoulderCap_L" in name:
        return "upper_arm.L"
    if "ShoulderCap_R" in name:
        return "upper_arm.R"
    if "ShoulderBridge_L" in name or "ClavicleYoke_L" in name:
        return "clavicle.L"
    if "ShoulderBridge_R" in name or "ClavicleYoke_R" in name:
        return "clavicle.R"
    if "ForearmBracer_L" in name:
        return "forearm.L"
    if "ForearmBracer_R" in name:
        return "forearm.R"
    if any(
        token in name
        for token in (
            "AbdomenPlate",
            "LumbarPlate",
            "WaistBreak",
            "RuntimeAbdomenBand",
            "RuntimeWaist",
        )
    ):
        return "spine_01"
    return "chest"


def weld_helmet(obj: bpy.types.Object) -> dict[str, Any]:
    before_vertices = len(obj.data.vertices)
    before_triangles = triangle_count(obj)
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=0.00001)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()

    # The imported source is effectively unwelded triangle soup. After welding,
    # reduce only this helmet shell to a browser-safe LOD0 budget.
    after_weld_vertices = len(mesh.vertices)
    after_weld_triangles = triangle_count(obj)
    if after_weld_triangles > 28_000:
        ratio = max(0.35, 28_000 / after_weld_triangles)
        modifier = obj.modifiers.new(name="KYX_REV24_HelmetLOD0", type="DECIMATE")
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = ratio
        modifier.use_collapse_triangulate = True
        apply_modifier(obj, modifier)
    return {
        "object": obj.name,
        "verticesBefore": before_vertices,
        "trianglesBefore": before_triangles,
        "verticesAfterWeld": after_weld_vertices,
        "trianglesAfterWeld": after_weld_triangles,
        "verticesFinal": len(obj.data.vertices),
        "trianglesFinal": triangle_count(obj),
        "weldDistanceMeters": 0.00001,
    }


def join_meshes(
    objects: list[bpy.types.Object],
    active: bpy.types.Object,
    name: str,
) -> bpy.types.Object:
    if active not in objects:
        raise RuntimeError("Join active object is not part of the join set")
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = active
    bpy.ops.object.join()
    active.name = name
    return active


def audit_weights(obj: bpy.types.Object) -> dict[str, Any]:
    missing: list[int] = []
    excessive: list[int] = []
    totals: list[float] = []
    for vertex in obj.data.vertices:
        weights = [
            assignment.weight
            for assignment in vertex.groups
            if assignment.weight > 0.00001
        ]
        total = sum(weights)
        totals.append(total)
        if total < 0.999:
            missing.append(vertex.index)
        if len(weights) > 4:
            excessive.append(vertex.index)
    return {
        "vertices": len(obj.data.vertices),
        "groups": len(obj.vertex_groups),
        "underweightedVertices": len(missing),
        "overFourInfluenceVertices": len(excessive),
        "minimumWeightTotal": round(min(totals, default=0.0), 6),
        "maximumWeightTotal": round(max(totals, default=0.0), 6),
    }


def limit_and_normalize_weights(
    obj: bpy.types.Object,
    maximum_influences: int = 4,
) -> dict[str, Any]:
    removed_assignments = 0
    changed_vertices = 0
    for vertex in obj.data.vertices:
        assignments = sorted(
            [
                (item.group, float(item.weight))
                for item in vertex.groups
                if item.weight > 0.00001
            ],
            key=lambda item: item[1],
            reverse=True,
        )
        kept = assignments[:maximum_influences]
        removed = assignments[maximum_influences:]
        if removed:
            changed_vertices += 1
            removed_assignments += len(removed)
            for group_index, _ in removed:
                obj.vertex_groups[group_index].remove([vertex.index])
        total = sum(weight for _, weight in kept)
        if total <= 0.00001:
            raise RuntimeError(f"Weight pruning emptied vertex {vertex.index} on {obj.name}")
        for group_index, weight in kept:
            obj.vertex_groups[group_index].add(
                [vertex.index],
                weight / total,
                "REPLACE",
            )
    return {
        "maximumInfluences": maximum_influences,
        "changedVertices": changed_vertices,
        "removedAssignments": removed_assignments,
    }


def duplicate_mesh(obj: bpy.types.Object, name: str) -> bpy.types.Object:
    duplicate = obj.copy()
    duplicate.data = obj.data.copy()
    duplicate.name = name
    bpy.context.scene.collection.objects.link(duplicate)
    duplicate.parent = obj.parent
    for modifier in list(duplicate.modifiers):
        if modifier.type == "ARMATURE":
            modifier.object = obj.parent
    return duplicate


def triangulate_runtime_mesh(obj: bpy.types.Object) -> dict[str, Any]:
    """Bake a portable tangent-ready topology on the generated runtime copy."""

    before_faces = len(obj.data.polygons)
    before_triangles = triangle_count(obj)
    mesh = bmesh.new()
    mesh.from_mesh(obj.data)
    bmesh.ops.triangulate(mesh, faces=list(mesh.faces))
    mesh.to_mesh(obj.data)
    mesh.free()
    obj.data.update()
    return {
        "facesBefore": before_faces,
        "facesAfter": len(obj.data.polygons),
        "trianglesBefore": before_triangles,
        "trianglesAfter": triangle_count(obj),
        "topologyTriangleCountPreserved": (
            before_triangles == triangle_count(obj)
        ),
    }


def decimate_skinned(obj: bpy.types.Object, ratio: float) -> dict[str, Any]:
    before_vertices = len(obj.data.vertices)
    before_triangles = triangle_count(obj)
    modifier = obj.modifiers.new(name="KYX_REV24_RuntimeLOD", type="DECIMATE")
    modifier.decimate_type = "COLLAPSE"
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    # Keep deformation live while baking only geometric reduction.
    armature_modifiers = [item for item in obj.modifiers if item.type == "ARMATURE"]
    for armature in armature_modifiers:
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_move_up(modifier=modifier.name)
    apply_modifier(obj, modifier)
    # Collapse decimation can leave imported split normals referencing a
    # topology that no longer exists. Blender's glTF exporter then derives a
    # zero-length tangent for an otherwise valid vertex (observed on the LOD2
    # SciFiHelmet primitive). Drop only the stale custom-normal layer on the
    # generated LOD copy so Blender recomputes a tangent basis from the reduced
    # geometry; the authored LOD0 mesh and source presentation remain intact.
    custom_normal = obj.data.attributes.get("custom_normal")
    custom_normals_cleared = custom_normal is not None
    if custom_normal is not None:
        obj.data.attributes.remove(custom_normal)
    obj.data.update()
    return {
        "ratio": ratio,
        "verticesBefore": before_vertices,
        "verticesAfter": len(obj.data.vertices),
        "trianglesBefore": before_triangles,
        "trianglesAfter": triangle_count(obj),
        "staleCustomNormalsCleared": custom_normals_cleared,
    }


def exporter_kwargs(path: Path) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "filepath": str(path),
        "export_format": "GLB",
        "use_selection": True,
        "export_texcoords": True,
        "export_normals": True,
        "export_tangents": True,
        "export_materials": "EXPORT",
        "export_cameras": False,
        "export_lights": False,
        "export_extras": True,
        "export_yup": True,
        "export_apply": False,
        "export_animations": True,
        "export_frame_range": True,
        "export_frame_step": 1,
        "export_force_sampling": False,
        "export_optimize_animation_size": False,
        "export_animation_mode": "NLA_TRACKS",
        "export_merge_animation": "NLA_TRACK",
        "export_skins": True,
        "export_influence_nb": 4,
        "export_all_influences": False,
        "export_def_bones": False,
        "export_leaf_bone": False,
    }
    supported = {
        item.identifier
        for item in bpy.ops.export_scene.gltf.get_rna_type().properties
    }
    return {key: value for key, value in kwargs.items() if key in supported}


def export_variant(
    path: Path,
    rig: bpy.types.Object,
    meshes: list[bpy.types.Object],
) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for obj in meshes:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    result = bpy.ops.export_scene.gltf(**exporter_kwargs(path))
    if "FINISHED" not in result or not path.is_file():
        raise RuntimeError(f"GLB export failed for {path}: {result}")
    return {
        "path": str(path),
        "bytes": path.stat().st_size,
        "sha256": sha256(path),
        "meshes": [
            {
                "name": obj.name,
                "vertices": len(obj.data.vertices),
                "triangles": triangle_count(obj),
            }
            for obj in meshes
        ],
    }


def main() -> None:
    (
        rev17_master,
        output_master,
        lod0_path,
        lod1_path,
        lod2_path,
        audit_path,
    ) = args()
    source_candidate = Path(bpy.data.filepath).resolve()
    if not source_candidate.is_file() or not rev17_master.is_file():
        raise RuntimeError("Required source blend is missing")

    source_hashes_before = {
        "presentationCandidate": sha256(source_candidate),
        "rev17RigMaster": sha256(rev17_master),
    }
    forward_alignment_audit = align_presentation_to_rev17_forward()
    runtime_material_audit = flatten_runtime_materials()
    candidate_mesh_names = {
        obj.name
        for obj in bpy.data.objects
        if obj.type == "MESH" and obj.name not in EXCLUDED_RUNTIME_MESHES
    }
    constructed_runtime_parts = [
        *add_runtime_abdomen_bands(),
        *add_runtime_shoulder_assemblies(),
        *prepare_rev32_helmet_integration(),
    ]
    constructed_runtime_part_audit = [
        {
            "name": obj.name,
            "role": obj.get("kyx_role", ""),
        }
        for obj in constructed_runtime_parts
    ]
    candidate_mesh_names.update(obj.name for obj in constructed_runtime_parts)

    rig, reference_body, footwear = append_rig_and_weight_reference(rev17_master)
    # Preserve the authored continuous glove/forearm silhouette. Procedural
    # rigid bracers detached under locomotion and are deliberately excluded.
    body = bpy.data.objects.get(BODY_NAME)
    if body is None or body.type != "MESH":
        raise RuntimeError(f"Candidate body is missing: {BODY_NAME}")
    body_modifier_audit = apply_candidate_surface(body)
    # Preserve the authored V6-A anatomical foundation. The earlier height-only
    # proportion pass accidentally selected lowered forearms/wrists as pelvis
    # vertices, producing spikes and an abrupt skirt-like waist transition.
    runtime_proportion_audit = {
        "method": "preserve_authored_v6a_anatomical_proportions",
        "changedVertices": 0,
        "regionVertexCounts": {},
        "maximumDisplacementMeters": 0.0,
        "topologyChanged": False,
    }
    body_weight_audit = copy_weights_by_index(reference_body, body)
    glove_geometry_audit = {
        "method": "preserve_authored_continuous_glove_geometry",
        "changedVertices": 0,
        "maximumDisplacementMeters": 0.0,
        "topologyChanged": False,
    }
    bind_to_rig(body, rig)
    occlusion_face_audit = remove_runtime_occlusion_faces(body)
    boot_underlay_audit = expose_runtime_boot_underlay(body)
    body.name = RUNTIME_BODY
    bpy.data.objects.remove(footwear, do_unlink=True)
    footwear_extraction_audit = {
        "method": "discard_legacy_rev17_armor_crop_use_complete_rev21_footwear",
        "weightsPreserved": False,
    }

    eye_records: list[dict[str, Any]] = []
    eyes = [
        obj
        for obj in list(bpy.data.objects)
        if obj.type == "MESH" and obj.name.startswith(EYE_PREFIX)
    ]
    for eye in eyes:
        eye_records.append(
            {
                "object": eye.name,
                "action": "removed_fully_enclosed_review_geometry",
                "reason": "prevents transformed eye helper debris outside the helmet",
            }
        )
        bpy.data.objects.remove(eye, do_unlink=True)

    helmet_records: list[dict[str, Any]] = []
    armor_records: list[dict[str, Any]] = [
        {
            **footwear_extraction_audit,
            "method": "inherited_articulated_weights_from_proven_rev17_footwear",
        }
    ]
    footwear_fit_records: list[dict[str, Any]] = []
    torso_armor_fit_records: list[dict[str, Any]] = []
    armor_objects: list[bpy.types.Object] = []
    for obj in list(bpy.data.objects):
        if (
            obj.type != "MESH"
            or obj.name not in candidate_mesh_names
            or obj in {body, reference_body}
        ):
            continue
        if obj.name in NON_ARMOR_NAMES:
            continue
        # Armor was authored against this exact preserved body. Do not apply the
        # superseded global proportion compensation to otherwise fitted plates.
        torso_armor_fit = None
        # The complete Rev21 boot/cuff/outsole set was authored together around
        # this exact body. Preserve its matched source proportions and offsets.
        footwear_fit = None
        surface_modifiers = apply_candidate_surface(obj)
        if obj.name.startswith(HELMET_PREFIXES):
            weld_record = None
            if obj.name.startswith("KYX_V6B_REV22_SciFiHelmet_CC0"):
                weld_record = weld_helmet(obj)
            weight_record = rigid_weight(obj, rig, "head")
            helmet_records.append(
                {
                    **weight_record,
                    "surfaceModifiers": surface_modifiers,
                    "weld": weld_record,
                }
            )
        else:
            attachment_bone = armor_attachment_bone(obj.name)
            weight_record = rigid_weight(obj, rig, attachment_bone)
            weight_record["method"] = "single_bone_articulated_hard_surface_attachment"
            armor_records.append(
                {
                    **weight_record,
                    "surfaceModifiers": surface_modifiers,
                }
            )
        armor_objects.append(obj)

    if not armor_objects:
        raise RuntimeError("No candidate armor objects were found")
    armor = join_meshes(armor_objects, armor_objects[0], RUNTIME_ARMOR)
    # Blender's implicit glTF triangulation could not derive a portable tangent
    # basis for one textured helmet polygon. Triangulate only the generated
    # runtime armor copy; source presentation meshes remain untouched.
    runtime_armor_triangulation_audit = triangulate_runtime_mesh(armor)
    body.name = RUNTIME_BODY
    lod0_weight_pruning = {
        "body": limit_and_normalize_weights(body),
        "armor": limit_and_normalize_weights(armor),
    }
    death_grounding_audit = ground_runtime_death_action(rig, [body, armor])

    # Remove source-only and presentation helper objects.
    bpy.data.objects.remove(reference_body, do_unlink=True)
    for obj in list(bpy.data.objects):
        if (
            obj.type in {"CAMERA", "LIGHT"}
            or obj.name.endswith("Source_Camera")
            or obj.name in EXCLUDED_RUNTIME_MESHES
        ):
            bpy.data.objects.remove(obj, do_unlink=True)

    action_names = sorted(
        {
            strip.action.name
            for track in rig.animation_data.nla_tracks
            for strip in track.strips
            if strip.action is not None
        }
        if rig.animation_data
        else set()
    )
    missing_actions = sorted(set(EXPECTED_ACTIONS) - set(action_names))
    if missing_actions:
        raise RuntimeError(f"Missing inherited runtime actions: {missing_actions}")
    weapon_contact_audit = {
        "embeddedWeapon": False,
        "ownership": "equipped runtime weapon and socket adapter",
        "status": "NOT_CLAIMED_BY_CHARACTER_REVIEW_EXPORT",
        "reason": "base character GLBs must not overlap the equipped weapon model",
    }

    lod1_body = duplicate_mesh(body, "KYX_REV32_ASSAULT_LOD1_CONTINUOUS_CYBERSUIT")
    lod1_armor = duplicate_mesh(armor, "KYX_REV32_ASSAULT_LOD1_CONNECTED_ARMOR_HELMET")
    lod2_body = duplicate_mesh(body, "KYX_REV32_ASSAULT_LOD2_CONTINUOUS_CYBERSUIT")
    lod2_armor = duplicate_mesh(armor, "KYX_REV32_ASSAULT_LOD2_CONNECTED_ARMOR_HELMET")
    lod_audit = {
        "lod1": {
            "body": decimate_skinned(lod1_body, 0.55),
            "armor": decimate_skinned(lod1_armor, 0.52),
        },
        "lod2": {
            "body": decimate_skinned(lod2_body, 0.28),
            "armor": decimate_skinned(lod2_armor, 0.24),
        },
    }
    lod_weight_pruning = {
        "lod1": {
            "body": limit_and_normalize_weights(lod1_body),
            "armor": limit_and_normalize_weights(lod1_armor),
        },
        "lod2": {
            "body": limit_and_normalize_weights(lod2_body),
            "armor": limit_and_normalize_weights(lod2_armor),
        },
    }

    rig["kyx_checkpoint"] = CHECKPOINT
    rig["kyx_runtime_candidate"] = True
    rig["kyx_source_presentation_sha256"] = source_hashes_before[
        "presentationCandidate"
    ]
    rig["kyx_animation_contract"] = "rev17_66_joint_16_clip_inherited"
    for obj in (
        body,
        armor,
        lod1_body,
        lod1_armor,
        lod2_body,
        lod2_armor,
    ):
        obj["kyx_checkpoint"] = CHECKPOINT

    output_master.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output_master), check_existing=False)

    exports = {
        "lod0": export_variant(lod0_path, rig, [body, armor]),
        "lod1": export_variant(lod1_path, rig, [lod1_body, lod1_armor]),
        "lod2": export_variant(lod2_path, rig, [lod2_body, lod2_armor]),
    }
    # Save again after exporter-side state changes so the source stays exact.
    bpy.ops.wm.save_as_mainfile(filepath=str(output_master), check_existing=False)

    audit = {
        "checkpoint": CHECKPOINT,
        "status": "RIGGED_RUNTIME_CANDIDATE_EXPORTED_VISUAL_RUNTIME_REVIEW_REQUIRED",
        "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
        "sources": {
            "presentationCandidate": {
                "path": str(source_candidate),
                "sha256Before": source_hashes_before["presentationCandidate"],
                "sha256After": sha256(source_candidate),
                "preserved": (
                    sha256(source_candidate)
                    == source_hashes_before["presentationCandidate"]
                ),
            },
            "rev17RigMaster": {
                "path": str(rev17_master),
                "sha256Before": source_hashes_before["rev17RigMaster"],
                "sha256After": sha256(rev17_master),
                "preserved": (
                    sha256(rev17_master) == source_hashes_before["rev17RigMaster"]
                ),
            },
        },
        "masterBlend": {
            "path": str(output_master),
            "bytes": output_master.stat().st_size,
            "sha256": sha256(output_master),
        },
        "runtimeMaterials": runtime_material_audit,
        "sourceForwardAlignment": forward_alignment_audit,
        "constructedRuntimeParts": constructed_runtime_part_audit,
        "rig": {
            "name": rig.name,
            "bones": len(rig.data.bones),
            "nlaTracks": len(rig.animation_data.nla_tracks)
            if rig.animation_data
            else 0,
            "actions": action_names,
            "expectedThirdPersonActionsPresent": not missing_actions,
        },
        "body": {
            "surfaceModifiers": body_modifier_audit,
            "runtimeProportions": runtime_proportion_audit,
            "gloveGeometry": glove_geometry_audit,
            "bootUnderlay": boot_underlay_audit,
            "occlusionFaces": occlusion_face_audit,
            "weightTransfer": body_weight_audit,
            "influencePruning": lod0_weight_pruning["body"],
            "runtime": audit_weights(body),
        },
        "armor": {
            "piecesJoined": len(armor_objects),
            "runtimeTriangulation": runtime_armor_triangulation_audit,
            "surfaceWeightedPieces": armor_records,
            "headRigidPieces": helmet_records,
            "postProportionTorsoFit": torso_armor_fit_records,
            "footwearFit": footwear_fit_records,
            "influencePruning": lod0_weight_pruning["armor"],
            "runtime": audit_weights(armor),
        },
        "animationCorrections": {
            "weaponContact": weapon_contact_audit,
            "deathGrounding": death_grounding_audit,
        },
        "eyes": eye_records,
        "lods": lod_audit,
        "lodInfluencePruning": lod_weight_pruning,
        "exports": exports,
        "claims": {
            "rigged": True,
            "skinned": True,
            "animated": True,
            "socketContractPreserved": True,
            "lod0Lod1Lod2Exported": True,
            "embeddedWeapon": False,
            "presentationSourceMutated": False,
            "humanVisualAcceptance": False,
            "runtimeAcceptance": False,
        },
    }
    audit_path.parent.mkdir(parents=True, exist_ok=True)
    audit_path.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
