"""Remediate the isolated KYX Rev17 candidate into the Rev18 review slice.

This is deliberately a bounded correction pass, not a default promotion.  It
opens the exact Rev17 master, preserves the existing rig and authored clips,
reshapes the continuous suit and hard-surface layers in rest space, replaces
the toy-like material hierarchy, adds compact authored helmet/chest details,
and authors a socket-derived melee blade plus sampled contact report.

Outputs remain candidate-only and require direct human visual review.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any

import bpy
from mathutils import Euler, Quaternion, Vector


CHECKPOINT = "G6_REV18_CHARACTER_REMEDIATION_SLICE"
STATUS = "REV18_SUBSTANTIVE_FIRST_PASS_HUMAN_VISUAL_REVIEW_REQUIRED_NOT_G6"
REV17_PREFIX = "KYX_REV17"
REV18_PREFIX = "KYX_REV18"

BODY_COLORS = {
    "base": (0.0045, 0.0055, 0.0065, 1.0),
    "torso": (0.009, 0.011, 0.013, 1.0),
    "limb": (0.007, 0.009, 0.011, 1.0),
    "joint": (0.0025, 0.0035, 0.0045, 1.0),
    "glove": (0.0015, 0.0022, 0.0030, 1.0),
    "helmet_underlay": (0.004, 0.0055, 0.007, 1.0),
}

ARMOR_COLORS = {
    "shell": (0.036, 0.042, 0.046, 1.0),
    "plate": (0.070, 0.078, 0.082, 1.0),
    "edge": (0.105, 0.118, 0.120, 1.0),
    "dark": (0.007, 0.009, 0.011, 1.0),
    "visor": (0.004, 0.075, 0.105, 1.0),
    "accent": (0.31, 0.075, 0.012, 1.0),
}

RIFLE_COLORS = {
    "body": (0.020, 0.034, 0.040, 1.0),
    "panel": (0.072, 0.094, 0.100, 1.0),
    "grip": (0.004, 0.007, 0.009, 1.0),
    "accent": (0.23, 0.047, 0.010, 1.0),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def triangle_count(obj: bpy.types.Object) -> int:
    if obj.type != "MESH":
        return 0
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def script_paths() -> dict[str, Path]:
    script = Path(__file__).resolve()
    source_root = script.parent.parent
    model_root = source_root / "model"
    rev17_root = model_root / "v6c-character-rev17"
    rev18_root = model_root / "v6c-character-rev18"
    evidence_root = (
        source_root.parents[4]
        / "evidence"
        / "2026-07-27"
        / "g6-rev18-character-remediation"
    )
    if "--" in sys.argv:
        values = sys.argv[sys.argv.index("--") + 1 :]
        if values:
            evidence_root = Path(values[0]).resolve()
    return {
        "source": rev17_root / "kyx-v6c-character-rev17-master.blend",
        "rev18_root": rev18_root,
        "master": rev18_root / "kyx-v6c-character-rev18-master.blend",
        "export": rev18_root / "export",
        "reimport": rev18_root / "reimport",
        "evidence": evidence_root,
    }


def reset_active() -> None:
    bpy.ops.object.mode_set(mode="OBJECT") if bpy.context.object and bpy.context.object.mode != "OBJECT" else None
    bpy.ops.object.select_all(action="DESELECT")


def color_attribute(mesh: bpy.types.Mesh) -> bpy.types.Attribute:
    active = mesh.color_attributes.active_color
    if active is not None and active.domain == "CORNER" and active.data_type == "FLOAT_COLOR":
        return active
    for attribute in mesh.color_attributes:
        if attribute.domain == "CORNER" and attribute.data_type == "FLOAT_COLOR":
            mesh.color_attributes.active_color = attribute
            return attribute
    attribute = mesh.color_attributes.new(
        name="KYX_COLOR",
        type="FLOAT_COLOR",
        domain="CORNER",
    )
    mesh.color_attributes.active_color = attribute
    return attribute


def fill_polygon_color(
    attribute: bpy.types.Attribute,
    polygon: bpy.types.MeshPolygon,
    rgba: tuple[float, float, float, float],
) -> None:
    for loop_index in polygon.loop_indices:
        attribute.data[loop_index].color = rgba


def material_principled(material: bpy.types.Material) -> bpy.types.Node | None:
    if not material.use_nodes or material.node_tree is None:
        return None
    return next(
        (node for node in material.node_tree.nodes if node.type == "BSDF_PRINCIPLED"),
        None,
    )


def tune_material(
    material: bpy.types.Material,
    *,
    metallic: float,
    roughness: float,
    coat: float = 0.0,
) -> None:
    node = material_principled(material)
    if node is None:
        return
    if "Metallic" in node.inputs:
        node.inputs["Metallic"].default_value = metallic
    if "Roughness" in node.inputs:
        node.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in node.inputs:
        node.inputs["Coat Weight"].default_value = coat


def group_weight(
    obj: bpy.types.Object,
    vertex: bpy.types.MeshVertex,
    names: set[str],
) -> float:
    total = 0.0
    for item in vertex.groups:
        group = obj.vertex_groups[item.group]
        if group.name in names:
            total += float(item.weight)
    return min(total, 1.0)


def dominant_group(
    obj: bpy.types.Object,
    vertices: list[int] | tuple[int, ...],
) -> str:
    scores: dict[str, float] = {}
    for index in vertices:
        for item in obj.data.vertices[index].groups:
            name = obj.vertex_groups[item.group].name
            scores[name] = scores.get(name, 0.0) + float(item.weight)
    return max(scores, key=scores.get) if scores else ""


def bone_radial_delta(
    rig: bpy.types.Object,
    bone_name: str,
    point: Vector,
    radial: float,
    longitudinal: float = 1.0,
) -> Vector:
    bone = rig.data.bones.get(bone_name)
    if bone is None:
        return Vector()
    local = bone.matrix_local.inverted() @ point
    transformed = local.copy()
    transformed.x *= radial
    transformed.y *= longitudinal
    transformed.z *= radial
    return (bone.matrix_local @ transformed) - point


def reshape_body(obj: bpy.types.Object, rig: bpy.types.Object) -> dict[str, Any]:
    """Move Rev17 from a narrow mannequin toward a grounded athletic silhouette."""

    limb_specs = {
        "upper_arm.L": (1.115, 1.0),
        "upper_arm.R": (1.115, 1.0),
        "forearm.L": (1.095, 1.0),
        "forearm.R": (1.095, 1.0),
        "wrist.L": (1.04, 1.0),
        "wrist.R": (1.04, 1.0),
        "palm.L": (1.055, 1.0),
        "palm.R": (1.055, 1.0),
        "thigh_anchor.L": (1.055, 1.0),
        "thigh_anchor.R": (1.055, 1.0),
        "shin_anchor.L": (1.085, 1.0),
        "shin_anchor.R": (1.085, 1.0),
        "foot_anchor.L": (1.02, 0.94),
        "foot_anchor.R": (1.02, 0.94),
    }
    original_bounds = [
        tuple(min(vertex.co[axis] for vertex in obj.data.vertices) for axis in range(3)),
        tuple(max(vertex.co[axis] for vertex in obj.data.vertices) for axis in range(3)),
    ]
    moved = 0
    maximum_delta = 0.0
    torso_groups = {"chest", "spine_02", "spine_01", "root", "neck"}
    for vertex in obj.data.vertices:
        source = vertex.co.copy()
        delta = Vector()
        for item in vertex.groups:
            group_name = obj.vertex_groups[item.group].name
            spec = limb_specs.get(group_name)
            if spec is not None:
                delta += bone_radial_delta(
                    rig,
                    group_name,
                    source,
                    radial=spec[0],
                    longitudinal=spec[1],
                ) * float(item.weight)

        torso_weight = group_weight(obj, vertex, torso_groups)
        if torso_weight > 0.0:
            z = source.z
            if z >= 1.20:
                # Wider upper torso/neck and more depth, tapering into the waist.
                blend = min(max((z - 1.20) / 0.32, 0.0), 1.0)
                sx = 1.055 + 0.085 * blend
                sy = 0.76 + 0.025 * blend
            elif z >= 0.92:
                blend = min(max((z - 0.92) / 0.28, 0.0), 1.0)
                sx = 0.955 + 0.080 * blend
                sy = 1.015 + 0.025 * blend
            else:
                # Reduce the exaggerated hip read without flattening anatomy.
                sx = 0.865
                sy = 0.965
            torso_target = Vector((source.x * sx, source.y * sy, source.z))
            delta += (torso_target - source) * torso_weight

        # A small head-depth reduction makes the helmet read fitted rather than
        # as a shell floating around the anatomy seed.
        head_weight = group_weight(obj, vertex, {"head"})
        if head_weight > 0.0:
            head_center = Vector((0.0, -0.030, 1.650))
            local = source - head_center
            head_target = head_center + Vector((local.x * 0.975, local.y * 0.94, local.z))
            delta += (head_target - source) * head_weight

        if delta.length > 1e-7:
            vertex.co = source + delta
            moved += 1
            maximum_delta = max(maximum_delta, delta.length)
    obj.data.update()
    new_bounds = [
        tuple(min(vertex.co[axis] for vertex in obj.data.vertices) for axis in range(3)),
        tuple(max(vertex.co[axis] for vertex in obj.data.vertices) for axis in range(3)),
    ]
    return {
        "object": obj.name,
        "verticesMoved": moved,
        "maximumRestSpaceDeltaMeters": round(maximum_delta, 6),
        "boundsBefore": [[round(value, 6) for value in row] for row in original_bounds],
        "boundsAfter": [[round(value, 6) for value in row] for row in new_bounds],
    }


def recolor_body(obj: bpy.types.Object) -> dict[str, int]:
    attribute = color_attribute(obj.data)
    counts: dict[str, int] = {}
    for polygon in obj.data.polygons:
        group = dominant_group(obj, list(polygon.vertices))
        center_z = polygon.center.z
        if group.startswith(("palm.", "finger_", "thumb_", "wrist.")):
            role = "glove"
        elif group in {"head", "neck"}:
            role = "helmet_underlay"
        elif group in {"chest", "spine_02", "spine_01", "root"}:
            role = "torso"
        elif group.startswith(("upper_arm.", "forearm.", "thigh_", "shin_", "foot_")):
            role = "limb"
        elif center_z < 0.20 or 0.48 < center_z < 0.62:
            role = "joint"
        else:
            role = "base"
        fill_polygon_color(attribute, polygon, BODY_COLORS[role])
        polygon.use_smooth = True
        counts[role] = counts.get(role, 0) + 1
    return dict(sorted(counts.items()))


def weighted_global_scale(
    obj: bpy.types.Object,
    specs: dict[str, tuple[Vector, Vector]],
) -> dict[str, Any]:
    moved = 0
    maximum_delta = 0.0
    for vertex in obj.data.vertices:
        source = vertex.co.copy()
        delta = Vector()
        for item in vertex.groups:
            name = obj.vertex_groups[item.group].name
            spec = specs.get(name)
            if spec is None:
                continue
            center, scale = spec
            target = center + Vector(
                (
                    (source.x - center.x) * scale.x,
                    (source.y - center.y) * scale.y,
                    (source.z - center.z) * scale.z,
                )
            )
            delta += (target - source) * float(item.weight)
        if delta.length > 1e-7:
            vertex.co = source + delta
            moved += 1
            maximum_delta = max(maximum_delta, delta.length)
    obj.data.update()
    return {
        "object": obj.name,
        "verticesMoved": moved,
        "maximumRestSpaceDeltaMeters": round(maximum_delta, 6),
    }


def armor_scale_specs() -> dict[str, tuple[Vector, Vector]]:
    return {
        "head": (Vector((0.0, -0.030, 1.650)), Vector((0.90, 0.73, 0.91))),
        "chest": (Vector((0.0, -0.020, 1.325)), Vector((0.94, 0.60, 0.91))),
        "spine_02": (Vector((0.0, -0.015, 1.160)), Vector((0.90, 0.62, 0.90))),
        "spine_01": (Vector((0.0, -0.010, 1.045)), Vector((0.90, 0.62, 0.90))),
        "root": (Vector((0.0, 0.0, 0.915)), Vector((0.90, 0.64, 0.88))),
        "upper_arm.L": (Vector((0.250, -0.030, 1.395)), Vector((0.79, 0.70, 0.82))),
        "upper_arm.R": (Vector((-0.250, -0.030, 1.395)), Vector((0.79, 0.70, 0.82))),
        "forearm.L": (Vector((0.360, -0.070, 1.020)), Vector((0.84, 0.70, 0.90))),
        "forearm.R": (Vector((-0.360, -0.070, 1.020)), Vector((0.84, 0.70, 0.90))),
        "thigh_anchor.L": (Vector((0.125, -0.030, 0.780)), Vector((0.82, 0.70, 0.90))),
        "thigh_anchor.R": (Vector((-0.125, -0.030, 0.780)), Vector((0.82, 0.70, 0.90))),
        "shin_anchor.L": (Vector((0.115, -0.030, 0.390)), Vector((0.82, 0.70, 0.92))),
        "shin_anchor.R": (Vector((-0.115, -0.030, 0.390)), Vector((0.82, 0.70, 0.92))),
        "foot_anchor.L": (Vector((0.180, -0.055, 0.105)), Vector((0.82, 0.86, 0.78))),
        "foot_anchor.R": (Vector((-0.180, -0.055, 0.105)), Vector((0.82, 0.86, 0.78))),
    }


def recolor_armor(obj: bpy.types.Object) -> dict[str, int]:
    attribute = color_attribute(obj.data)
    counts: dict[str, int] = {}
    for polygon in obj.data.polygons:
        group = dominant_group(obj, list(polygon.vertices))
        center = polygon.center
        if group == "head":
            if center.y < -0.115 and center.z > 1.585:
                role = "visor"
            elif center.z > 1.69:
                role = "plate"
            else:
                role = "shell"
        elif group == "chest":
            role = "plate" if center.y < -0.105 else "shell"
        elif group in {"spine_01", "spine_02", "root"}:
            role = "dark" if center.y > -0.10 else "shell"
        elif group.startswith("upper_arm."):
            role = "plate"
        elif group.startswith(("forearm.", "thigh_", "shin_", "foot_")):
            role = "shell"
        else:
            role = "shell"
        # Keep accent coverage deliberately sparse; one small right-side read is
        # enough for team/readability without turning the whole model orange.
        if group == "upper_arm.R" and center.y < -0.075 and center.z > 1.39:
            role = "accent"
        fill_polygon_color(attribute, polygon, ARMOR_COLORS[role])
        polygon.use_smooth = role not in {"visor", "accent"}
        counts[role] = counts.get(role, 0) + 1
    return dict(sorted(counts.items()))


def recolor_rifle(obj: bpy.types.Object) -> dict[str, int]:
    attribute = color_attribute(obj.data)
    counts: dict[str, int] = {}
    minimum_z = min(vertex.co.z for vertex in obj.data.vertices)
    maximum_z = max(vertex.co.z for vertex in obj.data.vertices)
    span_z = max(maximum_z - minimum_z, 1e-6)
    for polygon in obj.data.polygons:
        center = polygon.center
        normalized_z = (center.z - minimum_z) / span_z
        if normalized_z < 0.24:
            role = "grip"
        elif normalized_z > 0.78:
            role = "panel"
        elif center.x > 0.09 and 0.42 < normalized_z < 0.70:
            role = "accent"
        else:
            role = "body"
        fill_polygon_color(attribute, polygon, RIFLE_COLORS[role])
        polygon.use_smooth = False
        counts[role] = counts.get(role, 0) + 1
    return dict(sorted(counts.items()))


def remove_weighted_regions(
    obj: bpy.types.Object,
    group_names: set[str],
    *,
    threshold: float = 0.50,
) -> dict[str, Any]:
    """Remove inherited floating plates before authoring fitted replacements."""

    selected = []
    for vertex in obj.data.vertices:
        weight = sum(
            float(item.weight)
            for item in vertex.groups
            if obj.vertex_groups[item.group].name in group_names
        )
        vertex.select = weight >= threshold
        if vertex.select:
            selected.append(vertex.index)
    triangles_before = triangle_count(obj)
    if selected:
        selected_set = set(selected)
        reset_active()
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        for vertex in obj.data.vertices:
            vertex.select = vertex.index in selected_set
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.delete(type="VERT")
        bpy.ops.object.mode_set(mode="OBJECT")
    obj.data.update()
    return {
        "object": obj.name,
        "groups": sorted(group_names),
        "verticesRemoved": len(selected),
        "trianglesBefore": triangles_before,
        "trianglesAfter": triangle_count(obj),
    }


def make_profile_prism(
    name: str,
    profile: list[tuple[float, float]],
    y_minimum: float,
    y_maximum: float,
    *,
    rig: bpy.types.Object,
    bone_name: str,
    material: bpy.types.Material,
    rgba: tuple[float, float, float, float],
    bevel_width: float,
) -> bpy.types.Object:
    count = len(profile)
    vertices = [(x, y_minimum, z) for x, z in profile] + [
        (x, y_maximum, z) for x, z in profile
    ]
    faces: list[tuple[int, ...]] = []
    faces.append(tuple(reversed(range(count))))
    faces.append(tuple(range(count, count * 2)))
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, count + following, count + index))
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    attribute = color_attribute(mesh)
    for polygon in mesh.polygons:
        fill_polygon_color(attribute, polygon, rgba)
        polygon.use_smooth = False
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(mesh.vertices))), 1.0, "REPLACE")
    obj.parent = rig
    modifier = obj.modifiers.new("KYX_REV18_ARMATURE", "ARMATURE")
    modifier.object = rig
    reset_active()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bevel = obj.modifiers.new("KYX_REV18_COMPACT_DETAIL_BEVEL", "BEVEL")
    bevel.width = bevel_width
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    result = bpy.ops.object.modifier_apply(modifier=bevel.name)
    if "FINISHED" not in result:
        raise RuntimeError(f"Unable to bevel {name}: {result}")
    return obj


def join_into_armor(
    armor: bpy.types.Object,
    additions: list[bpy.types.Object],
    rig: bpy.types.Object,
) -> dict[str, Any]:
    before = {obj.name: triangle_count(obj) for obj in [armor, *additions]}
    for obj in [armor, *additions]:
        for modifier in list(obj.modifiers):
            if modifier.type == "ARMATURE":
                obj.modifiers.remove(modifier)
    reset_active()
    armor.select_set(True)
    for obj in additions:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = armor
    result = bpy.ops.object.join()
    if "FINISHED" not in result:
        raise RuntimeError(f"Unable to join Rev18 armor additions: {result}")
    armor = bpy.context.object
    modifier = armor.modifiers.new("KYX_REV18_ARMATURE", "ARMATURE")
    modifier.object = rig
    armor.parent = rig
    armor.data.update()
    return {
        "sourceTriangles": before,
        "joinedTriangles": triangle_count(armor),
        "additionCount": len(additions),
    }


def make_fitted_surface(
    name: str,
    source: bpy.types.Object,
    rig: bpy.types.Object,
    material: bpy.types.Material,
    *,
    bone_name: str,
    z_minimum: float,
    z_maximum: float,
    rgba: tuple[float, float, float, float],
    front_only: bool = True,
    offset: float = 0.010,
    smoothing_iterations: int = 0,
    voxel_size: float | None = None,
    rigid_bone_name: str | None = None,
) -> bpy.types.Object:
    group = source.vertex_groups.get(bone_name)
    if group is None:
        raise RuntimeError(f"Missing fitted-surface group {bone_name}")
    selected = []
    for polygon in source.data.polygons:
        center = polygon.center
        if center.z < z_minimum or center.z > z_maximum:
            continue
        if front_only and center.y > 0.025:
            continue
        weight = sum(
            next(
                (
                    float(item.weight)
                    for item in source.data.vertices[index].groups
                    if item.group == group.index
                ),
                0.0,
            )
            for index in polygon.vertices
        ) / len(polygon.vertices)
        if weight >= 0.32:
            selected.append(polygon)
    if not selected:
        raise RuntimeError(f"No fitted-surface polygons selected for {name}")
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    source_indices: list[int] = []
    mapping: dict[int, int] = {}
    for polygon in selected:
        face = []
        for source_index in polygon.vertices:
            destination = mapping.get(source_index)
            if destination is None:
                source_vertex = source.data.vertices[source_index]
                point = source_vertex.co + source_vertex.normal.normalized() * offset
                destination = len(vertices)
                mapping[source_index] = destination
                vertices.append(tuple(point))
                source_indices.append(int(source_index))
            face.append(destination)
        faces.append(tuple(face))
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    attribute = color_attribute(mesh)
    for polygon in mesh.polygons:
        fill_polygon_color(attribute, polygon, rgba)
        polygon.use_smooth = True
    for source_group in source.vertex_groups:
        obj.vertex_groups.new(name=source_group.name)
    for destination, source_index in enumerate(source_indices):
        for item in source.data.vertices[source_index].groups:
            source_group = source.vertex_groups[item.group]
            destination_group = obj.vertex_groups.get(source_group.name)
            if destination_group is not None and item.weight > 0.0001:
                destination_group.add(
                    [destination],
                    float(item.weight),
                    "REPLACE",
                )
    reset_active()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    solidify = obj.modifiers.new("KYX_REV18_FITTED_SURFACE_THICKNESS", "SOLIDIFY")
    solidify.thickness = 0.005
    solidify.offset = 0.0
    result = bpy.ops.object.modifier_apply(modifier=solidify.name)
    if "FINISHED" not in result:
        raise RuntimeError(f"Unable to solidify {name}: {result}")
    if voxel_size is not None:
        obj.data.remesh_voxel_size = voxel_size
        obj.data.remesh_voxel_adaptivity = 0.0
        result = bpy.ops.object.voxel_remesh()
        if "FINISHED" not in result:
            raise RuntimeError(f"Unable to voxel-remesh {name}: {result}")
        if rigid_bone_name is None:
            raise RuntimeError(f"{name} voxel remesh requires a rigid bone")
        for existing_group in list(obj.vertex_groups):
            obj.vertex_groups.remove(existing_group)
        rigid_group = obj.vertex_groups.new(name=rigid_bone_name)
        rigid_group.add(
            list(range(len(obj.data.vertices))),
            1.0,
            "REPLACE",
        )
    if smoothing_iterations > 0:
        smooth = obj.modifiers.new("KYX_REV18_FITTED_SURFACE_SMOOTH", "SMOOTH")
        smooth.factor = 0.30
        smooth.iterations = smoothing_iterations
        result = bpy.ops.object.modifier_apply(modifier=smooth.name)
        if "FINISHED" not in result:
            raise RuntimeError(f"Unable to smooth {name}: {result}")
    obj.parent = rig
    armature = obj.modifiers.new("KYX_REV18_ARMATURE", "ARMATURE")
    armature.object = rig
    return obj


def make_convex_boot(
    name: str,
    source: bpy.types.Object,
    rig: bpy.types.Object,
    material: bpy.types.Material,
    *,
    bone_name: str,
) -> bpy.types.Object:
    group = source.vertex_groups.get(bone_name)
    if group is None:
        raise RuntimeError(f"Missing boot source group {bone_name}")
    points = [
        vertex.co.copy()
        for vertex in source.data.vertices
        if any(
            item.group == group.index and item.weight >= 0.34
            for item in vertex.groups
        )
        and vertex.co.z <= 0.175
    ]
    if len(points) < 12:
        raise RuntimeError(f"Not enough boot points for {name}: {len(points)}")
    minimum = Vector(
        tuple(min(point[axis] for point in points) for axis in range(3))
    )
    maximum = Vector(
        tuple(max(point[axis] for point in points) for axis in range(3))
    )
    dimensions = maximum - minimum
    scale_z = max(dimensions.z * 0.30, 0.045)
    center = (minimum + maximum) * 0.5
    center.z = minimum.z + scale_z
    reset_active()
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=24,
        ring_count=12,
        location=center,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.name = name + "_MESH"
    obj.scale = Vector(
        (
            max(dimensions.x * 0.57, 0.070),
            max(dimensions.y * 0.57, 0.125),
            scale_z,
        )
    )
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    cuff_center = Vector((center.x, center.y, minimum.z + 0.115))
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=20,
        ring_count=10,
        location=cuff_center,
    )
    cuff = bpy.context.object
    cuff.name = name + "_CUFF"
    cuff.data.name = cuff.name + "_MESH"
    cuff.scale = Vector(
        (
            max(dimensions.x * 0.48, 0.062),
            max(dimensions.y * 0.34, 0.070),
            0.085,
        )
    )
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for piece in (obj, cuff):
        piece.data.materials.append(material)
        attribute = color_attribute(piece.data)
        for polygon in piece.data.polygons:
            fill_polygon_color(attribute, polygon, ARMOR_COLORS["dark"])
            polygon.use_smooth = True
        vertex_group = piece.vertex_groups.new(name=bone_name)
        vertex_group.add(
            list(range(len(piece.data.vertices))),
            1.0,
            "REPLACE",
        )
    reset_active()
    obj.select_set(True)
    cuff.select_set(True)
    bpy.context.view_layer.objects.active = obj
    result = bpy.ops.object.join()
    if "FINISHED" not in result:
        raise RuntimeError(f"Unable to join rounded boot components {name}: {result}")
    reset_active()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    obj.parent = rig
    armature = obj.modifiers.new("KYX_REV18_ARMATURE", "ARMATURE")
    armature.object = rig
    return obj


def add_compact_armor_details(
    armor: bpy.types.Object,
    body: bpy.types.Object,
    rig: bpy.types.Object,
) -> dict[str, Any]:
    material = armor.data.materials[0]
    additions = [
        make_profile_prism(
            "KYX_REV18_VISOR_CORE",
            [
                (-0.090, 1.690),
                (0.090, 1.690),
                (0.098, 1.635),
                (0.066, 1.590),
                (-0.066, 1.590),
                (-0.098, 1.635),
            ],
            -0.160,
            -0.127,
            rig=rig,
            bone_name="head",
            material=material,
            rgba=ARMOR_COLORS["visor"],
            bevel_width=0.010,
        ),
        make_profile_prism(
            "KYX_REV18_COMPACT_CHEST_SHELL",
            [
                (-0.112, 1.425),
                (0.112, 1.425),
                (0.152, 1.365),
                (0.138, 1.285),
                (0.060, 1.228),
                (-0.060, 1.228),
                (-0.138, 1.285),
                (-0.152, 1.365),
            ],
            -0.156,
            -0.116,
            rig=rig,
            bone_name="chest",
            material=material,
            rgba=ARMOR_COLORS["shell"],
            bevel_width=0.012,
        ),
        make_profile_prism(
            "KYX_REV18_CHEST_STERNUM",
            [
                (-0.040, 1.405),
                (0.040, 1.405),
                (0.054, 1.330),
                (0.035, 1.245),
                (-0.035, 1.245),
                (-0.054, 1.330),
            ],
            -0.175,
            -0.142,
            rig=rig,
            bone_name="chest",
            material=material,
            rgba=ARMOR_COLORS["dark"],
            bevel_width=0.008,
        ),
        make_profile_prism(
            "KYX_REV18_CHEST_INDEX",
            [
                (-0.011, 1.382),
                (0.011, 1.382),
                (0.014, 1.320),
                (0.008, 1.275),
                (-0.008, 1.275),
                (-0.014, 1.320),
            ],
            -0.184,
            -0.174,
            rig=rig,
            bone_name="chest",
            material=material,
            rgba=ARMOR_COLORS["accent"],
            bevel_width=0.003,
        ),
    ]
    for side in ("L", "R"):
        additions.extend(
            [
                make_fitted_surface(
                    f"KYX_REV18_FITTED_THIGH_{side}",
                    body,
                    rig=rig,
                    bone_name=f"thigh_anchor.{side}",
                    material=material,
                    z_minimum=0.625,
                    z_maximum=0.925,
                    rgba=ARMOR_COLORS["shell"],
                    front_only=False,
                    offset=0.009,
                ),
                make_fitted_surface(
                    f"KYX_REV18_FITTED_KNEE_{side}",
                    body,
                    rig=rig,
                    bone_name=f"shin_anchor.{side}",
                    material=material,
                    z_minimum=0.485,
                    z_maximum=0.625,
                    rgba=ARMOR_COLORS["plate"],
                    front_only=True,
                    offset=0.012,
                ),
                make_fitted_surface(
                    f"KYX_REV18_FITTED_SHIN_{side}",
                    body,
                    rig=rig,
                    bone_name=f"shin_anchor.{side}",
                    material=material,
                    z_minimum=0.170,
                    z_maximum=0.495,
                    rgba=ARMOR_COLORS["shell"],
                    front_only=False,
                    offset=0.010,
                ),
                make_fitted_surface(
                    f"KYX_REV18_VOXEL_BOOT_{side}",
                    body,
                    rig=rig,
                    bone_name=f"foot_anchor.{side}",
                    material=material,
                    z_minimum=-0.010,
                    z_maximum=0.180,
                    rgba=ARMOR_COLORS["dark"],
                    front_only=False,
                    offset=0.012,
                    smoothing_iterations=2,
                    voxel_size=0.010,
                    rigid_bone_name=f"foot_anchor.{side}",
                ),
            ]
        )
    return join_into_armor(armor, additions, rig)


def add_melee_socket(rig: bpy.types.Object) -> dict[str, Any]:
    existing = rig.data.bones.get("socket_melee")
    if existing is not None:
        return {
            "name": existing.name,
            "created": False,
            "parent": existing.parent.name if existing.parent else None,
        }
    reset_active()
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    palm = rig.data.edit_bones.get("palm.R")
    if palm is None:
        raise RuntimeError("Rev18 cannot author socket_melee without palm.R")
    bone = rig.data.edit_bones.new("socket_melee")
    bone.head = palm.head + Vector((0.0, 0.0, 0.005))
    bone.tail = bone.head + Vector((0.0, 0.0, 0.110))
    bone.parent = palm
    bone.use_connect = False
    bone.use_deform = True
    bpy.ops.object.mode_set(mode="OBJECT")
    result = rig.data.bones["socket_melee"]
    return {
        "name": result.name,
        "created": True,
        "parent": result.parent.name if result.parent else None,
        "head": [round(float(value), 6) for value in result.head_local],
        "tail": [round(float(value), 6) for value in result.tail_local],
    }


def make_sword(
    rig: bpy.types.Object,
    material: bpy.types.Material,
) -> bpy.types.Object:
    bone = rig.data.bones["socket_melee"]
    anchor = bone.head_local.copy()
    profile = [
        (-0.026, anchor.z + 0.092),
        (0.026, anchor.z + 0.092),
        (0.020, anchor.z + 0.690),
        (0.000, anchor.z + 0.780),
        (-0.020, anchor.z + 0.690),
    ]
    blade = make_profile_prism(
        "KYX_REV18_MELEE_BLADE",
        [(anchor.x + x, z) for x, z in profile],
        anchor.y - 0.010,
        anchor.y + 0.010,
        rig=rig,
        bone_name="socket_melee",
        material=material,
        rgba=ARMOR_COLORS["edge"],
        bevel_width=0.004,
    )
    pieces = [blade]
    # Guard and grip remain compact so the silhouette reads as a weapon, not a
    # second block pasted over the runtime sword.
    guard = make_profile_prism(
        "KYX_REV18_MELEE_GUARD",
        [
            (anchor.x - 0.060, anchor.z + 0.060),
            (anchor.x + 0.060, anchor.z + 0.060),
            (anchor.x + 0.052, anchor.z + 0.088),
            (anchor.x - 0.052, anchor.z + 0.088),
        ],
        anchor.y - 0.014,
        anchor.y + 0.014,
        rig=rig,
        bone_name="socket_melee",
        material=material,
        rgba=ARMOR_COLORS["dark"],
        bevel_width=0.006,
    )
    pieces.append(guard)
    grip = make_profile_prism(
        "KYX_REV18_MELEE_GRIP",
        [
            (anchor.x - 0.022, anchor.z - 0.075),
            (anchor.x + 0.022, anchor.z - 0.075),
            (anchor.x + 0.022, anchor.z + 0.072),
            (anchor.x - 0.022, anchor.z + 0.072),
        ],
        anchor.y - 0.020,
        anchor.y + 0.020,
        rig=rig,
        bone_name="socket_melee",
        material=material,
        rgba=BODY_COLORS["glove"],
        bevel_width=0.007,
    )
    pieces.append(grip)
    for piece in pieces:
        for modifier in list(piece.modifiers):
            if modifier.type == "ARMATURE":
                piece.modifiers.remove(modifier)
    reset_active()
    blade.select_set(True)
    for piece in pieces[1:]:
        piece.select_set(True)
    bpy.context.view_layer.objects.active = blade
    result = bpy.ops.object.join()
    if "FINISHED" not in result:
        raise RuntimeError(f"Unable to join Rev18 melee weapon: {result}")
    sword = bpy.context.object
    sword.name = "KYX_REV18_MELEE_SOCKET_DERIVED_BLADE"
    sword.data.name = sword.name + "_MESH"
    modifier = sword.modifiers.new("KYX_REV18_ARMATURE", "ARMATURE")
    modifier.object = rig
    sword.parent = rig
    sword["kyx_socket_source"] = "socket_melee"
    sword["kyx_candidate_only"] = True
    sword["kyx_standard_lod_export"] = False
    return sword


def add_melee_action(rig: bpy.types.Object) -> bpy.types.Action:
    source = bpy.data.actions.get("KYX_REV18_TP_IDLE")
    if source is None:
        raise RuntimeError("Rev18 melee action requires KYX_REV18_TP_IDLE")
    action = source.copy()
    action.name = "KYX_REV18_TP_MELEE"
    action.use_frame_range = True
    action.frame_start = 1.0
    action.frame_end = 24.0
    if rig.animation_data is None:
        rig.animation_data_create()
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    rig.animation_data.action = action

    keys = (
        # frame, torso twist, clavicle, upper arm, forearm, wrist
        (1, 0.34, -0.22, -0.42, 0.26, -0.20),
        (6, 0.48, -0.34, -0.60, 0.42, -0.30),
        (11, 0.05, 0.08, 0.18, -0.12, 0.08),
        (15, -0.50, 0.40, 0.66, -0.44, 0.32),
        (19, -0.24, 0.22, 0.36, -0.22, 0.16),
        (24, 0.18, -0.10, -0.20, 0.12, -0.08),
    )
    targets = {
        "spine_02": Vector((0.0, 0.0, 1.0)),
        "clavicle.R": Vector((0.0, 1.0, 0.0)),
        "upper_arm.R": Vector((1.0, 0.0, 0.0)),
        "forearm.R": Vector((1.0, 0.0, 0.0)),
        "wrist.R": Vector((0.0, 1.0, 0.0)),
    }
    for frame, torso, clavicle, upper_arm, forearm, wrist in keys:
        bpy.context.scene.frame_set(frame)
        values = {
            "spine_02": torso,
            "clavicle.R": clavicle,
            "upper_arm.R": upper_arm,
            "forearm.R": forearm,
            "wrist.R": wrist,
        }
        for bone_name, axis in targets.items():
            pose_bone = rig.pose.bones.get(bone_name)
            if pose_bone is None:
                continue
            pose_bone.rotation_mode = "QUATERNION"
            base = pose_bone.rotation_quaternion.copy()
            pose_bone.rotation_quaternion = Quaternion(axis, values[bone_name]) @ base
            pose_bone.keyframe_insert(
                data_path="rotation_quaternion",
                frame=float(frame),
                group=bone_name,
            )

    rig.animation_data.action = None
    track = rig.animation_data.nla_tracks.new()
    track.name = action.name
    strip = track.strips.new(action.name, 1, action)
    strip.name = action.name
    strip.action_frame_start = 1.0
    strip.action_frame_end = 24.0
    strip.frame_start = 1.0
    strip.frame_end = 24.0
    for existing in rig.animation_data.nla_tracks:
        existing.mute = False
    return action


def rename_revision_content() -> dict[str, int]:
    counts = {"objects": 0, "meshes": 0, "materials": 0, "actions": 0, "tracks": 0}
    for obj in bpy.data.objects:
        if "REV17" in obj.name:
            obj.name = obj.name.replace("REV17", "REV18")
            counts["objects"] += 1
        if obj.type == "MESH" and "REV17" in obj.data.name:
            obj.data.name = obj.data.name.replace("REV17", "REV18")
            counts["meshes"] += 1
    for material in bpy.data.materials:
        if "REV17" in material.name:
            material.name = material.name.replace("REV17", "REV18")
            counts["materials"] += 1
    for action in bpy.data.actions:
        if "REV17" in action.name:
            action.name = action.name.replace("REV17", "REV18")
            counts["actions"] += 1
    for obj in bpy.data.objects:
        if obj.animation_data is None:
            continue
        for track in obj.animation_data.nla_tracks:
            if "REV17" in track.name:
                track.name = track.name.replace("REV17", "REV18")
                counts["tracks"] += 1
            for strip in track.strips:
                if "REV17" in strip.name:
                    strip.name = strip.name.replace("REV17", "REV18")
    return counts


def exporter_kwargs(path: Path) -> dict[str, Any]:
    requested = {
        "filepath": str(path),
        "check_existing": False,
        "export_format": "GLB",
        "use_selection": True,
        "export_copyright": (
            "CC0 Blender Human Base Meshes anatomy; KYX-authored Rev18 geometry, "
            "materials, compact armor details, sockets, contact clip, rifle treatment "
            "and LODs. Candidate only; non-default, non-release, review required."
        ),
        "export_texcoords": True,
        "export_normals": True,
        "export_tangents": False,
        "export_materials": "EXPORT",
        "export_vertex_color": "ACTIVE",
        "export_all_vertex_colors": False,
        "export_attributes": True,
        "export_cameras": False,
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
        "export_lights": False,
    }
    available = {
        prop.identifier for prop in bpy.ops.export_scene.gltf.get_rna_type().properties
    }
    return {key: value for key, value in requested.items() if key in available}


def export_variant(
    path: Path,
    rig: bpy.types.Object,
    meshes: list[bpy.types.Object],
) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    reset_active()
    for obj in [rig, *meshes]:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    result = bpy.ops.export_scene.gltf(**exporter_kwargs(path))
    if "FINISHED" not in result:
        raise RuntimeError(f"Rev18 export failed for {path}: {result}")
    return {
        "path": str(path),
        "sha256": sha256(path),
        "bytes": path.stat().st_size,
        "triangles": sum(triangle_count(obj) for obj in meshes),
        "meshes": [obj.name for obj in meshes],
        "operatorResult": sorted(result),
    }


def fresh_reimport(path: Path, proof_path: Path | None = None) -> dict[str, Any]:
    source_hash = sha256(path)
    source_bytes = path.stat().st_size
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(path))
    if "FINISHED" not in result:
        raise RuntimeError(f"Rev18 fresh reimport failed for {path}: {result}")
    helpers = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH"
        and (
            obj.name.startswith("Icosphere")
            or obj.name.startswith("Sphere")
            or obj.name.startswith("Cube")
        )
        and not obj.parent
    ]
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH" and obj not in helpers]
    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    rig = max(rigs, key=lambda item: len(item.data.bones), default=None)
    if rig is None or len(meshes) != 3:
        raise RuntimeError(
            f"Rev18 reimport contract mismatch: rig={rig}, meshes={[obj.name for obj in meshes]}"
        )
    if proof_path is not None:
        proof_path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(
            filepath=str(proof_path),
            check_existing=False,
            compress=True,
        )
    return {
        "operatorResult": sorted(result),
        "sourceUnchanged": sha256(path) == source_hash and path.stat().st_size == source_bytes,
        "runtimeMeshes": sorted(obj.name for obj in meshes),
        "armature": rig.name,
        "boneCount": len(rig.data.bones),
        "actions": sorted(action.name for action in bpy.data.actions),
        "sockets": sorted(
            bone.name for bone in rig.data.bones if bone.name.startswith("socket_")
        ),
    }


def assign_only_action(
    rig: bpy.types.Object,
    action_name: str,
) -> None:
    if rig.animation_data is None:
        raise RuntimeError("Rig has no animation data")
    rig.animation_data.action = None
    for track in rig.animation_data.nla_tracks:
        track.mute = track.name != action_name


def point_segment_distance(point: Vector, start: Vector, end: Vector) -> float:
    segment = end - start
    denominator = segment.length_squared
    if denominator <= 1e-12:
        return (point - start).length
    factor = max(0.0, min(1.0, (point - start).dot(segment) / denominator))
    return (point - (start + segment * factor)).length


def contact_audit(
    rig: bpy.types.Object,
    body: bpy.types.Object,
    sword: bpy.types.Object,
) -> dict[str, Any]:
    palm_group = body.vertex_groups.get("palm.R")
    wrist_group = body.vertex_groups.get("wrist.R")
    if palm_group is None or wrist_group is None:
        raise RuntimeError("Rev18 contact audit cannot resolve right hand vertices")
    hand_indices = [
        vertex.index
        for vertex in body.data.vertices
        if any(
            item.group in {palm_group.index, wrist_group.index} and item.weight > 0.08
            for item in vertex.groups
        )
    ]
    if not hand_indices:
        raise RuntimeError("Rev18 contact audit selected no right hand vertices")
    action_name = "KYX_REV18_TP_MELEE"
    assign_only_action(rig, action_name)
    samples = []
    grip_radius = 0.022
    for frame in (1, 4, 7, 10, 13, 16, 19, 22, 24):
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        evaluated_rig = rig.evaluated_get(bpy.context.evaluated_depsgraph_get())
        pose_bone = evaluated_rig.pose.bones["socket_melee"]
        socket_head = evaluated_rig.matrix_world @ pose_bone.head
        socket_tail = evaluated_rig.matrix_world @ pose_bone.tail
        evaluated_body = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
        evaluated_mesh = evaluated_body.to_mesh()
        try:
            points = [
                evaluated_body.matrix_world @ evaluated_mesh.vertices[index].co
                for index in hand_indices
                if index < len(evaluated_mesh.vertices)
            ]
            centerline_distance = min(
                point_segment_distance(point, socket_head, socket_tail)
                for point in points
            )
            surface_gap = abs(centerline_distance - grip_radius)
        finally:
            evaluated_body.to_mesh_clear()
        sword_matrix = sword.evaluated_get(
            bpy.context.evaluated_depsgraph_get()
        ).matrix_world
        samples.append(
            {
                "frame": frame,
                "socketHead": [round(float(value), 6) for value in socket_head],
                "socketTail": [round(float(value), 6) for value in socket_tail],
                "swordObjectTranslation": [
                    round(float(value), 6) for value in sword_matrix.translation
                ],
                "nearestHandToGripCenterlineMeters": round(centerline_distance, 6),
                "nearestHandToGripSurfaceGapMeters": round(surface_gap, 6),
            }
        )
    for track in rig.animation_data.nla_tracks:
        track.mute = False
    worst = max(sample["nearestHandToGripSurfaceGapMeters"] for sample in samples)
    return {
        "action": action_name,
        "clock": {
            "source": "single NLA action frame",
            "frames": [sample["frame"] for sample in samples],
            "fps": bpy.context.scene.render.fps,
        },
        "bladeTransformSource": "socket_melee child of palm.R",
        "handVertexCount": len(hand_indices),
        "gripRadiusMeters": grip_radius,
        "samples": samples,
        "worstHandToGripSurfaceGapMeters": round(worst, 6),
        "thresholdMeters": 0.05,
        "passesFiveCentimeterGate": worst < 0.05,
    }


def main() -> None:
    paths = script_paths()
    source_path = paths["source"]
    if not source_path.is_file():
        raise FileNotFoundError(source_path)
    source_hash_before = sha256(source_path)
    source_bytes_before = source_path.stat().st_size
    paths["rev18_root"].mkdir(parents=True, exist_ok=True)
    paths["export"].mkdir(parents=True, exist_ok=True)
    paths["reimport"].mkdir(parents=True, exist_ok=True)
    paths["evidence"].mkdir(parents=True, exist_ok=True)

    bpy.ops.wm.open_mainfile(filepath=str(source_path))
    bpy.context.scene.render.fps = 24
    for obj in list(bpy.data.objects):
        if obj.name == "Icosphere" and obj.parent is None:
            bpy.data.objects.remove(obj, do_unlink=True)

    rename_audit = rename_revision_content()
    rig = bpy.data.objects.get("KYX_REV18_RIG_66_JOINT_WITH_SOCKETS")
    if rig is None:
        raise RuntimeError("Unable to resolve renamed Rev18 rig")

    body_names = [
        "KYX_REV18_LOD0_CONTINUOUS_HUMAN_UNDERSUIT",
        "KYX_REV18_LOD1_CONTINUOUS_HUMAN_UNDERSUIT",
        "KYX_REV18_LOD2_CONTINUOUS_HUMAN_UNDERSUIT",
        "KYX_REV18_FP_ARMS_GLOVES",
    ]
    armor_names = [
        "KYX_REV18_LOD0_AUTHORED_FITTED_ARMOR",
        "KYX_REV18_LOD1_FITTED_ARMOR",
        "KYX_REV18_LOD2_FITTED_ARMOR",
        "KYX_REV18_FP_ARMOR_SLEEVES",
    ]
    rifle_names = [
        "KYX_REV18_LOD0_COMPACT_RIFLE",
        "KYX_REV18_LOD1_COMPACT_RIFLE",
        "KYX_REV18_LOD2_COMPACT_RIFLE",
        "KYX_REV18_FP_COMPACT_RIFLE",
    ]
    bodies = [bpy.data.objects[name] for name in body_names]
    armors = [bpy.data.objects[name] for name in armor_names]
    rifles = [bpy.data.objects[name] for name in rifle_names]

    body_reshape = [reshape_body(body, rig) for body in bodies]
    body_colors = {body.name: recolor_body(body) for body in bodies}
    removed_floating_leg_armor = []
    for index, armor in enumerate(armors[:3]):
        groups_to_remove = {
            "thigh_anchor.L",
            "thigh_anchor.R",
            "shin_anchor.L",
            "shin_anchor.R",
            "foot_anchor.L",
            "foot_anchor.R",
        }
        if index == 0:
            groups_to_remove.add("chest")
        removed_floating_leg_armor.append(
            remove_weighted_regions(armor, groups_to_remove)
        )
    armor_reshape = [
        weighted_global_scale(armor, armor_scale_specs()) for armor in armors
    ]
    armor_colors = {armor.name: recolor_armor(armor) for armor in armors}
    rifle_colors = {rifle.name: recolor_rifle(rifle) for rifle in rifles}

    body_material = bodies[0].data.materials[0]
    armor_material = armors[0].data.materials[0]
    rifle_material = rifles[0].data.materials[0]
    tune_material(body_material, metallic=0.0, roughness=0.73)
    tune_material(armor_material, metallic=0.28, roughness=0.46, coat=0.05)
    tune_material(rifle_material, metallic=0.42, roughness=0.38, coat=0.03)

    detail_audit = add_compact_armor_details(armors[0], bodies[0], rig)
    socket_audit = add_melee_socket(rig)
    rig.name = "KYX_REV18_RIG_67_JOINT_WITH_SOCKETS"
    rig.data.name = rig.name + "_ARMATURE"
    melee_action = add_melee_action(rig)
    melee_action_audit = {
        "name": melee_action.name,
        "frameRange": [
            round(float(value), 3) for value in melee_action.frame_range
        ],
    }
    sword = make_sword(rig, armor_material)

    for obj in [*bodies, *armors, *rifles, sword, rig]:
        obj["kyx_checkpoint"] = CHECKPOINT
        obj["kyx_candidate_only"] = True
        obj["kyx_non_default_non_release"] = True
        obj["kyx_visual_acceptance"] = "REQUIRED"
    bpy.context.scene["kyx_checkpoint"] = CHECKPOINT
    bpy.context.scene["kyx_candidate_only"] = True
    bpy.context.scene["kyx_default_promotion"] = False
    bpy.context.scene["kyx_visual_acceptance"] = "REQUIRED"

    contact = contact_audit(rig, bodies[0], sword)
    if not contact["passesFiveCentimeterGate"]:
        raise RuntimeError(f"Rev18 melee contact gate failed: {contact}")

    sword.hide_set(True)
    sword.hide_viewport = True
    sword.hide_render = True
    paths["master"].parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=str(paths["master"]),
        check_existing=False,
        compress=True,
    )

    lod0_path = paths["export"] / "kyx-v6c-character-rev18-lod0.runtime-candidate.glb"
    lod1_path = paths["export"] / "kyx-v6c-character-rev18-lod1.runtime-candidate.glb"
    lod2_path = paths["export"] / "kyx-v6c-character-rev18-lod2.runtime-candidate.glb"
    fp_path = paths["export"] / "kyx-v6c-character-rev18-first-person.runtime-candidate.glb"
    melee_path = paths["export"] / "kyx-v6c-character-rev18-melee-proof.runtime-candidate.glb"
    exports = {
        "lod0": export_variant(lod0_path, rig, [bodies[0], armors[0], rifles[0]]),
        "lod1": export_variant(lod1_path, rig, [bodies[1], armors[1], rifles[1]]),
        "lod2": export_variant(lod2_path, rig, [bodies[2], armors[2], rifles[2]]),
        "firstPerson": export_variant(fp_path, rig, [bodies[3], armors[3], rifles[3]]),
        "meleeProof": export_variant(
            melee_path,
            rig,
            [bodies[0], armors[0], sword],
        ),
    }

    reimport = fresh_reimport(
        lod0_path,
        paths["reimport"] / "kyx-v6c-character-rev18-lod0-fresh-reimport.blend",
    )
    report = {
        "schema": "kyx-g6-rev18-character-remediation-author-report-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "status": STATUS,
        "candidateDisposition": {
            "default": False,
            "releaseEligible": False,
            "g6Accepted": False,
            "humanVisualReviewRequired": True,
        },
        "source": {
            "path": str(source_path),
            "sha256Before": source_hash_before,
            "sha256After": sha256(source_path),
            "bytesBefore": source_bytes_before,
            "bytesAfter": source_path.stat().st_size,
            "unchanged": (
                source_hash_before == sha256(source_path)
                and source_bytes_before == source_path.stat().st_size
            ),
        },
        "renamedContent": rename_audit,
        "bodyReshape": body_reshape,
        "bodyColorRoles": body_colors,
        "removedFloatingLegArmor": removed_floating_leg_armor,
        "armorReshape": armor_reshape,
        "armorColorRoles": armor_colors,
        "rifleColorRoles": rifle_colors,
        "compactArmorDetails": detail_audit,
        "meleeSocket": socket_audit,
        "meleeAction": melee_action_audit,
        "meleeContact": contact,
        "master": {
            "path": str(paths["master"]),
            "sha256": sha256(paths["master"]),
            "bytes": paths["master"].stat().st_size,
        },
        "exports": exports,
        "freshReimport": reimport,
        "assertions": {
            "rev17SourceUnchanged": (
                source_hash_before == sha256(source_path)
                and source_bytes_before == source_path.stat().st_size
            ),
            "lod0FreshReimportHasThreeMeshes": len(reimport["runtimeMeshes"]) == 3,
            "lod0FreshReimportHasRev18MeleeSocket": "socket_melee" in reimport["sockets"],
            "lod0FreshReimportHasMeleeClip": (
                "KYX_REV18_TP_MELEE" in reimport["actions"]
            ),
            "meleeGapBelowFiveCentimeters": contact["passesFiveCentimeterGate"],
            "noDefaultPromotion": not bpy.context.scene.get(
                "kyx_default_promotion", False
            ),
        },
        "nonClaims": [
            "This first remediation slice is not G6 acceptance.",
            "A clean export and bounded contact metric do not grant human visual approval.",
            "The melee proof asset is not a default/runtime equipment promotion.",
            "Runtime integration, every-frame clipping review, and gameplay camera review remain separate.",
        ],
    }
    report_path = paths["evidence"] / "author-remediation-report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if not all(report["assertions"].values()):
        raise RuntimeError(f"Rev18 author assertions failed: {report['assertions']}")
    print(
        json.dumps(
            {
                "status": report["status"],
                "master": report["master"],
                "lod0": exports["lod0"],
                "meleeContact": contact,
                "report": str(report_path),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
