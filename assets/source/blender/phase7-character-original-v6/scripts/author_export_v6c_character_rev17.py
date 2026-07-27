"""Author the isolated KYX Rev17 character candidate and practical LOD set.

Rev17 deliberately does not replace any public/default runtime asset.  It uses
the clean, separately weighted CC0 anatomy island preserved in the Rev13
gameplay GLB as a continuous base, keeps the 52-bone deformation contract,
preserves the Rev16 contact/action source only as a rejected input, and builds
new fitted surface armor without the Rev15/Rev16 stacked-shell silhouette.

Outputs are a source .blend, LOD0/LOD1/LOD2 GLBs, a dedicated first-person
arms/rifle GLB, a fresh-reimport proof .blend, and a machine-readable audit.
No output from this script grants G6 or human visual acceptance.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
import importlib.util
import json
import math
from pathlib import Path
import sys
from typing import Any, Callable

import bmesh
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


CHECKPOINT = "G6_REV17_HUMAN_PROPORTIONED_CHARACTER_CANDIDATE"
STATUS = "REV17_CANDIDATE_STRUCTURAL_PIPELINE_COMPLETE_VISUAL_REVIEW_REQUIRED"
FPS = 24
SOURCE_REV16_SHA256 = (
    "13a3f3761960b0aad80653dce5c7f3439f29458f8979b8f10537e9be40b9c0eb"
)
SOURCE_REV16_BYTES = 3_073_000
SOURCE_V6A_SHA256 = (
    "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
)
SOURCE_REV14_BLEND_SHA256 = (
    "b4adcc29def7633c5c1c5756d2d419b636a5ff5161fe04bbded9709575e56315"
)
SOURCE_REV13_GAMEPLAY_SHA256 = (
    "0688a781def693ebf0f4aa49eb76c32c458b83e786fbbdebadafb76022f39fee"
)
SOURCE_REV13_GAMEPLAY_BYTES = 9_278_844
SOURCE_REV13_ARMOR_BLEND_SHA256 = (
    "4c6d1b386c90895a15b3d0713c916ba7270dbe81b74d265975db0109e152d1bb"
)
SOURCE_CLIPS = (
    "KYX_V6C_TP_IDLE",
    "KYX_V6C_TP_WALK",
    "KYX_V6C_TP_RUN",
    "KYX_V6C_TP_JUMP_START",
    "KYX_V6C_TP_AIRBORNE_LOOP",
    "KYX_V6C_TP_LAND",
    "KYX_V6C_TP_PRIMARY_FIRE",
    "KYX_V6C_TP_RELOAD",
    "KYX_V6C_TP_HIT_REACTION_FRONT",
    "KYX_V6C_TP_DEATH_FRONT",
)
TP_CLIP_MAP = {
    "KYX_REV17_TP_IDLE": "KYX_V6C_TP_IDLE",
    "KYX_REV17_TP_WALK": "KYX_V6C_TP_WALK",
    "KYX_REV17_TP_RUN": "KYX_V6C_TP_RUN",
    "KYX_REV17_TP_JUMP_START": "KYX_V6C_TP_JUMP_START",
    "KYX_REV17_TP_AIRBORNE_LOOP": "KYX_V6C_TP_AIRBORNE_LOOP",
    "KYX_REV17_TP_LAND": "KYX_V6C_TP_LAND",
    "KYX_REV17_TP_PRIMARY_FIRE": "KYX_V6C_TP_PRIMARY_FIRE",
    "KYX_REV17_TP_RELOAD": "KYX_V6C_TP_RELOAD",
    "KYX_REV17_TP_HIT_REACTION_FRONT": "KYX_V6C_TP_HIT_REACTION_FRONT",
    "KYX_REV17_TP_DEATH_FRONT": "KYX_V6C_TP_DEATH_FRONT",
}
FP_CLIP_MAP = {
    "KYX_REV17_FP_IDLE": "KYX_V6C_TP_IDLE",
    "KYX_REV17_FP_FIRE": "KYX_V6C_TP_PRIMARY_FIRE",
    "KYX_REV17_FP_RELOAD": "KYX_V6C_TP_RELOAD",
    "KYX_REV17_FP_SPRINT": "KYX_V6C_TP_RUN",
    "KYX_REV17_FP_AIRBORNE": "KYX_V6C_TP_AIRBORNE_LOOP",
    "KYX_REV17_FP_LAND": "KYX_V6C_TP_LAND",
}
ALL_CLIP_MAP = {**TP_CLIP_MAP, **FP_CLIP_MAP}
LOOP_CLIPS = {
    "KYX_REV17_TP_IDLE",
    "KYX_REV17_TP_WALK",
    "KYX_REV17_TP_RUN",
    "KYX_REV17_TP_AIRBORNE_LOOP",
    "KYX_REV17_FP_IDLE",
    "KYX_REV17_FP_SPRINT",
    "KYX_REV17_FP_AIRBORNE",
}
SOCKET_SPECS = (
    ("socket_head", "head"),
    ("socket_chest", "chest"),
    ("socket_back", "chest"),
    ("socket_hips", "root"),
    ("socket_hand_r", "palm.R"),
    ("socket_hand_l", "palm.L"),
    ("socket_weapon_r", "palm.R"),
    ("socket_support_l", "palm.L"),
    ("socket_muzzle", "socket_weapon_r"),
    ("socket_nozzle", "socket_muzzle"),
    ("socket_casing", "socket_weapon_r"),
    ("socket_foot_l", "foot_anchor.L"),
    ("socket_foot_r", "foot_anchor.R"),
    ("socket_ability", "chest"),
)


def load_rev15_helpers() -> Any:
    source = Path(__file__).resolve().with_name(
        "author_export_v6c_character_rev15.py"
    )
    spec = importlib.util.spec_from_file_location("kyx_rev17_rev15_helpers", source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load shared authoring helpers from {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


HELPERS = load_rev15_helpers()


def script_args() -> tuple[Path, ...]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <rev16.glb> <v6a.blend> <rev14.blend> <master.blend> "
            "<lod0.glb> <lod1.glb> <lod2.glb> <fp.glb> <reimport.blend> "
            "<audit.json>"
        )
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 10:
        raise SystemExit(f"Expected ten arguments, got {len(values)}")
    return tuple(Path(value).resolve() for value in values)


def append_object(blend_path: Path, object_name: str) -> bpy.types.Object:
    before = set(bpy.data.objects)
    with bpy.data.libraries.load(str(blend_path), link=False) as (source, target):
        if object_name not in source.objects:
            raise RuntimeError(f"{object_name} not found in {blend_path}")
        target.objects = [object_name]
    appended = [obj for obj in target.objects if obj is not None]
    if len(appended) != 1:
        raise RuntimeError(f"Unable to append exactly one object: {object_name}")
    obj = appended[0]
    if obj not in before and not obj.users_collection:
        bpy.context.scene.collection.objects.link(obj)
    return obj


def import_clean_v6a_anatomy(
    blend_path: Path,
    destination_rig: bpy.types.Object,
) -> tuple[bpy.types.Object, dict[str, Any]]:
    """Append the intact V6A CC0 anatomy base cage for the visible Rev17 suit.

    The prior Rev13 gameplay island was already cut into garment regions.  It
    deformed, but those inherited open boundaries read as torn skin at the
    shoulder, waist, wrist, and ankle.  Rev17 instead starts from the preserved
    continuous V6A base cage, removes only its non-destructive sculpt modifier,
    and authors fresh destination-rig weights without deleting any surface.
    """

    body = append_object(blend_path, "KYX_V6A_AnatomySculpt_Body")
    source_name = body.name
    source_modifiers = [
        {
            "name": modifier.name,
            "type": modifier.type,
            "levels": getattr(modifier, "levels", None),
            "renderLevels": getattr(modifier, "render_levels", None),
        }
        for modifier in body.modifiers
    ]
    world = body.matrix_world.copy()
    clear_modifiers(body)
    source_triangles = HELPERS.triangle_count(body)
    body.parent = destination_rig
    body.matrix_world = world
    body.animation_data_clear()
    return body, {
        "source": str(blend_path),
        "sourceObject": source_name,
        "sourceModifiersRemoved": source_modifiers,
        "vertices": len(body.data.vertices),
        "sourceTriangles": source_triangles,
        "trianglesAfterModifierRemoval": HELPERS.triangle_count(body),
        "method": (
            "append_preserved_continuous_v6a_cc0_base_cage; remove_multires_"
            "modifier_without_applying; no_surface_deletion_or_projection"
        ),
    }


def author_athletic_suit_proportions(
    body: bpy.types.Object,
) -> dict[str, Any]:
    """Apply a bounded waist/hip refinement to the preserved V6A base cage."""

    original = [vertex.co.copy() for vertex in body.data.vertices]
    changed = 0
    region_counts: dict[str, int] = defaultdict(int)
    for vertex in body.data.vertices:
        x = float(vertex.co.x)
        z = float(vertex.co.z)
        if abs(x) > 0.245:
            continue
        if 0.945 <= z <= 1.135:
            # Broaden the suit waist smoothly so a bent rifle pose retains an
            # athletic trunk instead of collapsing into an hourglass point.
            normalized = abs(z - 1.035) / 0.095
            influence = max(0.0, 1.0 - normalized)
            influence = influence * influence * (3.0 - 2.0 * influence)
            vertex.co.x *= 1.0 + 0.24 * influence
            vertex.co.y *= 1.0 + 0.07 * influence
            changed += 1
            region_counts["athletic_waist_broadening"] += 1
        elif 0.700 <= z < 0.945:
            # Reduce only the outer/depth read of the upper hip, retaining the
            # original leg length, crotch topology, and closed surface.
            influence = max(0.0, min(1.0, (0.945 - z) / 0.245))
            vertex.co.x *= 1.0 - 0.055 * influence
            vertex.co.y *= 1.0 - 0.10 * influence
            changed += 1
            region_counts["bounded_upper_hip_taper"] += 1
    body.data.update()
    displacements = [
        (vertex.co - before).length
        for vertex, before in zip(body.data.vertices, original)
    ]
    return {
        "method": (
            "bounded_base_cage_athletic_waist_broadening_and_upper_hip_taper_"
            "before_destination_weight_authoring"
        ),
        "changedVertices": changed,
        "regionVertexCounts": dict(sorted(region_counts.items())),
        "maximumDisplacementMeters": round(max(displacements, default=0.0), 8),
        "meanDisplacementMeters": round(
            sum(displacements) / max(1, len(displacements)), 8
        ),
        "topologyChanged": False,
        "surfaceDeleted": False,
    }


def clear_modifiers(obj: bpy.types.Object) -> None:
    for modifier in list(obj.modifiers):
        obj.modifiers.remove(modifier)


def ensure_active(obj: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def make_vertex_color_material(
    name: str, metallic: float, roughness: float
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material["kyx_checkpoint"] = CHECKPOINT
    material["kyx_candidate_only"] = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    output.location = (340.0, 0.0)
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    shader.location = (40.0, 0.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Coat Weight"].default_value = 0.12
    shader.inputs["Coat Roughness"].default_value = min(0.6, roughness + 0.12)
    color = nodes.new("ShaderNodeVertexColor")
    color.layer_name = "COLOR_0"
    color.location = (-240.0, 20.0)
    links.new(color.outputs["Color"], shader.inputs["Base Color"])
    links.new(shader.outputs["BSDF"], output.inputs["Surface"])
    return material


def ensure_color_attribute(mesh: bpy.types.Mesh) -> bpy.types.Attribute:
    existing = mesh.color_attributes.get("COLOR_0")
    if existing is not None:
        mesh.color_attributes.active_color = existing
        mesh.color_attributes.render_color_index = list(mesh.color_attributes).index(
            existing
        )
        return existing
    color = mesh.color_attributes.new(
        name="COLOR_0", type="BYTE_COLOR", domain="CORNER"
    )
    mesh.color_attributes.active_color = color
    mesh.color_attributes.render_color_index = list(mesh.color_attributes).index(
        color
    )
    return color


def reset_color_attribute(mesh: bpy.types.Mesh) -> bpy.types.Attribute:
    """Install one unambiguous export/render color layer.

    Several preserved sources contain historical color attributes.  Blender's
    viewport and glTF exporter can otherwise select different active layers,
    which made the same surface look torn or patch-painted in evidence.
    """

    for existing in list(mesh.color_attributes):
        mesh.color_attributes.remove(existing)
    return ensure_color_attribute(mesh)


def vertex_group_names(obj: bpy.types.Object, vertex: bpy.types.MeshVertex) -> set[str]:
    return {
        obj.vertex_groups[item.group].name
        for item in vertex.groups
        if item.weight > 0.001
    }


def group_weight(
    obj: bpy.types.Object, vertex: bpy.types.MeshVertex, names: set[str]
) -> float:
    return sum(
        item.weight
        for item in vertex.groups
        if obj.vertex_groups[item.group].name in names
    )


def point_segment_distance(point: Vector, head: Vector, tail: Vector) -> float:
    segment = tail - head
    length_squared = segment.length_squared
    if length_squared <= 1.0e-12:
        return (point - head).length
    parameter = max(
        0.0, min(1.0, (point - head).dot(segment) / length_squared)
    )
    return (point - (head + segment * parameter)).length


def author_spatially_separated_heat_weights(
    body: bpy.types.Object,
    rig: bpy.types.Object,
) -> dict[str, Any]:
    """Solve body weights with limbs separated from the compact rifle pose.

    The source rig's rest arms sit close to the thorax and both upper legs sit
    close to the pelvis.  A direct heat solve therefore leaks weights across
    unrelated surfaces.  Existing named weights are used only to classify each
    vertex when present.  For the intact V6A source, nearest named deformation-
    bone segments provide the same classification without projecting or
    altering its surface.  Limb vertices and matching bones are shifted apart
    in a temporary solve rig, automatic weights are generated there, and then
    the exact authored coordinates are restored for the production rig.
    """

    clear_modifiers(body)
    original_world = body.matrix_world.copy()
    original_coordinates = [vertex.co.copy() for vertex in body.data.vertices]
    source_group_names = {
        group.index: group.name for group in body.vertex_groups
    }
    arm_tokens = (
        "clavicle.",
        "upper_arm.",
        "forearm.",
        "wrist.",
        "palm.",
        "thumb_",
        "index_",
        "middle_",
        "ring_",
        "pinky_",
    )
    leg_tokens = ("thigh_anchor.", "shin_anchor.", "foot_anchor.")
    shifts = {
        "arm_L": Vector((0.72, 0.0, 0.0)),
        "arm_R": Vector((-0.72, 0.0, 0.0)),
        "leg_L": Vector((0.30, 0.0, 0.0)),
        "leg_R": Vector((-0.30, 0.0, 0.0)),
        "torso": Vector(),
    }
    region_bone_names = {
        "arm_L": [
            bone.name
            for bone in rig.data.bones
            if any(token in bone.name for token in arm_tokens)
            and bone.name.endswith(".L")
        ],
        "arm_R": [
            bone.name
            for bone in rig.data.bones
            if any(token in bone.name for token in arm_tokens)
            and bone.name.endswith(".R")
        ],
        "leg_L": [
            bone.name
            for bone in rig.data.bones
            if any(token in bone.name for token in leg_tokens)
            and bone.name.endswith(".L")
        ],
        "leg_R": [
            bone.name
            for bone in rig.data.bones
            if any(token in bone.name for token in leg_tokens)
            and bone.name.endswith(".R")
        ],
        "torso": [
            name
            for name in ("root", "spine_01", "spine_02", "chest", "neck", "head")
            if name in rig.data.bones
        ],
    }
    rig_inverse = rig.matrix_world.inverted()

    def nearest_bone_region(vertex: bpy.types.MeshVertex) -> str:
        world_point = body.matrix_world @ vertex.co
        rig_point = rig_inverse @ world_point
        distances: dict[str, float] = {}
        for region, names in region_bone_names.items():
            distances[region] = min(
                (
                    point_segment_distance(
                        rig_point,
                        rig.data.bones[name].head_local,
                        rig.data.bones[name].tail_local,
                    )
                    for name in names
                ),
                default=1.0e9,
            )
        # Keep the central pelvis attached to the torso rather than allowing
        # the first millimetres of each upper thigh to split it in the solve.
        if vertex.co.z > 0.86 and abs(vertex.co.x) < 0.16:
            return "torso"
        return min(distances, key=distances.get)

    regions: list[str] = []
    region_counts: dict[str, int] = defaultdict(int)
    classification_methods: dict[str, int] = defaultdict(int)
    for vertex in body.data.vertices:
        scores = {
            "arm_L": 0.0,
            "arm_R": 0.0,
            "leg_L": 0.0,
            "leg_R": 0.0,
            "torso": 0.0,
        }
        for assignment in vertex.groups:
            name = source_group_names.get(assignment.group, "")
            weight = float(assignment.weight)
            if any(token in name for token in arm_tokens):
                if name.endswith(".L"):
                    scores["arm_L"] += weight
                elif name.endswith(".R"):
                    scores["arm_R"] += weight
            elif any(token in name for token in leg_tokens):
                if name.endswith(".L"):
                    scores["leg_L"] += weight
                elif name.endswith(".R"):
                    scores["leg_R"] += weight
            else:
                scores["torso"] += weight
        if max(scores.values()) > 0.0001:
            region = max(scores, key=scores.get)
            classification_methods["preserved_named_weight"] += 1
        else:
            region = nearest_bone_region(vertex)
            classification_methods["nearest_named_bone_segment"] += 1
        regions.append(region)
        region_counts[region] += 1
        vertex.co += shifts[region]
    body.data.update()

    temporary_rig = rig.copy()
    temporary_rig.data = rig.data.copy()
    temporary_rig.name = "KYX_REV17_TEMP_SEPARATED_HEAT_SOLVE_RIG"
    bpy.context.scene.collection.objects.link(temporary_rig)
    temporary_rig.animation_data_clear()
    ensure_active(temporary_rig)
    bpy.ops.object.mode_set(mode="EDIT")
    for bone in temporary_rig.data.edit_bones:
        name = bone.name
        shift = Vector()
        if any(token in name for token in arm_tokens):
            if name.endswith(".L"):
                shift = shifts["arm_L"]
            elif name.endswith(".R"):
                shift = shifts["arm_R"]
        elif any(token in name for token in leg_tokens):
            if name.endswith(".L"):
                shift = shifts["leg_L"]
            elif name.endswith(".R"):
                shift = shifts["leg_R"]
        bone.head += shift
        bone.tail += shift
    bpy.ops.object.mode_set(mode="OBJECT")

    for group in list(body.vertex_groups):
        body.vertex_groups.remove(group)
    body.parent = None
    body.matrix_world = original_world
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    temporary_rig.select_set(True)
    bpy.context.view_layer.objects.active = temporary_rig
    result = bpy.ops.object.parent_set(type="ARMATURE_AUTO", keep_transform=True)
    if "FINISHED" not in result:
        raise RuntimeError(f"Spatially separated heat solve failed: {result}")

    for modifier in list(body.modifiers):
        if modifier.type == "ARMATURE":
            body.modifiers.remove(modifier)
    body.parent = None
    body.matrix_world = original_world
    for vertex, coordinate in zip(body.data.vertices, original_coordinates):
        vertex.co = coordinate
    body.data.update()
    body.parent = rig
    body.matrix_world = original_world
    armature = body.modifiers.new("KYX_REV17_ARMATURE", "ARMATURE")
    armature.object = rig
    temporary_rig_name = temporary_rig.name
    bpy.data.objects.remove(temporary_rig, do_unlink=True)

    ensure_active(body)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(
        group_select_mode="ALL", lock_active=False
    )
    totals = []
    influences = []
    missing = []
    for vertex in body.data.vertices:
        weights = [item.weight for item in vertex.groups if item.weight > 0.0001]
        total = sum(weights)
        totals.append(total)
        influences.append(len(weights))
        if total < 0.90:
            missing.append(vertex.index)
    return {
        "method": (
            "temporary_spatial_separation_of_named_limb_regions_and_matching_"
            "bones_then_automatic_heat_weights_then_exact_rest_coordinate_restore"
        ),
        "temporaryOffsetsMeters": {
            key: [round(float(value), 4) for value in vector]
            for key, vector in shifts.items()
        },
        "classificationVertexCounts": dict(sorted(region_counts.items())),
        "classificationMethods": dict(sorted(classification_methods.items())),
        "unweightedOrUnderweightedVertices": len(missing),
        "maximumInfluences": max(influences, default=0),
        "minimumWeightTotal": round(min(totals, default=0.0), 6),
        "maximumWeightTotal": round(max(totals, default=0.0), 6),
        "temporarySolveRigRemoved": temporary_rig_name not in bpy.data.objects,
        "authoredRestCoordinatesRestoredExactly": all(
            (vertex.co - coordinate).length <= 1.0e-9
            for vertex, coordinate in zip(body.data.vertices, original_coordinates)
        ),
    }


def stabilize_pelvis_weights(body: bpy.types.Object) -> dict[str, Any]:
    """Blend the continuous suit across the root-to-thigh transition.

    Automatic heat weights are reliable on the separated limbs, but a rifle
    stance asks the two thigh anchors to rotate strongly beneath a compact root.
    A narrow analytic blend across the closed V6A pelvis prevents the waist from
    collapsing to a point while retaining independent leg motion.
    """

    required = ("root", "spine_01", "thigh_anchor.L", "thigh_anchor.R")
    missing = [name for name in required if body.vertex_groups.get(name) is None]
    if missing:
        raise RuntimeError(f"Pelvis stabilization groups are missing: {missing}")

    def smoothstep(edge0: float, edge1: float, value: float) -> float:
        t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
        return t * t * (3.0 - 2.0 * t)

    edited = 0
    totals = []
    by_side: dict[str, int] = defaultdict(int)
    all_groups = list(body.vertex_groups)
    for vertex in body.data.vertices:
        z = float(vertex.co.z)
        # Rest-pose hands and distal forearms occupy the same vertical band as
        # the pelvis; lateral gating keeps this correction strictly on the hip.
        if not 0.76 <= z <= 1.075 or abs(float(vertex.co.x)) > 0.245:
            continue
        index = vertex.index
        for group in all_groups:
            try:
                group.remove([index])
            except RuntimeError:
                pass

        side = "L" if vertex.co.x >= 0.0 else "R"
        lateral = smoothstep(0.018, 0.105, abs(float(vertex.co.x)))
        vertical_leg = 1.0 - smoothstep(0.80, 1.015, z)
        thigh_weight = 0.92 * lateral * vertical_leg
        spine_weight = 0.34 * smoothstep(0.95, 1.075, z)
        root_weight = max(0.0, 1.0 - thigh_weight - spine_weight)
        total = root_weight + spine_weight + thigh_weight
        root_weight /= total
        spine_weight /= total
        thigh_weight /= total
        body.vertex_groups["root"].add([index], root_weight, "REPLACE")
        if spine_weight > 0.0001:
            body.vertex_groups["spine_01"].add(
                [index], spine_weight, "REPLACE"
            )
        if thigh_weight > 0.0001:
            body.vertex_groups[f"thigh_anchor.{side}"].add(
                [index], thigh_weight, "REPLACE"
            )
        totals.append(root_weight + spine_weight + thigh_weight)
        by_side[side] += 1
        edited += 1

    ensure_active(body)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(
        group_select_mode="ALL", lock_active=False
    )
    body.data.update()
    return {
        "method": (
            "bounded_closed_pelvis_root_spine_thigh_blend_by_rest_height_and_"
            "lateral_distance"
        ),
        "restHeightBandMeters": [0.76, 1.075],
        "editedVertices": edited,
        "editedVerticesBySide": dict(sorted(by_side.items())),
        "minimumAuthoredWeightTotal": round(min(totals, default=0.0), 6),
        "maximumAuthoredWeightTotal": round(max(totals, default=0.0), 6),
        "maximumInfluencesAuthored": 3,
    }


def author_analytic_deformation_weights(
    body: bpy.types.Object,
    rig: bpy.types.Object,
) -> dict[str, Any]:
    clear_modifiers(body)
    for group in list(body.vertex_groups):
        body.vertex_groups.remove(group)
    deform_names = [bone.name for bone in rig.data.bones if bone.use_deform]
    groups = {
        name: body.vertex_groups.new(name=name) for name in deform_names
    }
    segments = {
        bone.name: (bone.head_local.copy(), bone.tail_local.copy())
        for bone in rig.data.bones
        if bone.use_deform
    }
    torso = ["root", "spine_01", "spine_02", "chest", "neck"]
    head = ["neck", "head"]
    regions: dict[str, int] = defaultdict(int)
    influence_counts = []
    totals = []
    for vertex in body.data.vertices:
        point = vertex.co
        side = "L" if point.x >= 0.0 else "R"
        arm = [
            f"clavicle.{side}",
            f"upper_arm.{side}",
            f"forearm.{side}",
            f"wrist.{side}",
            f"palm.{side}",
            *[
                f"{finger}_0{joint}.{side}"
                for finger in ("thumb", "index", "middle", "ring", "pinky")
                for joint in (1, 2, 3)
            ],
        ]
        leg = [
            "root",
            f"thigh_anchor.{side}",
            f"shin_anchor.{side}",
            f"foot_anchor.{side}",
        ]
        nearest_arm = min(
            point_segment_distance(point, *segments[name]) for name in arm
        )
        nearest_torso = min(
            point_segment_distance(point, *segments[name]) for name in torso
        )
        shoulder_transition = point.z > 1.23 and abs(point.x) > 0.17
        is_arm = (
            0.72 < point.z < 1.49
            and abs(point.x) > 0.17
            and (
                abs(point.x) > 0.285
                or nearest_arm < nearest_torso * 0.83
                or shoulder_transition
            )
        )
        if point.z > 1.50:
            candidates = head
            region = "head_neck"
        elif point.z < 0.985:
            candidates = leg
            region = f"leg_{side}"
        elif is_arm:
            candidates = arm + (["chest"] if shoulder_transition else [])
            region = f"arm_{side}"
        else:
            candidates = torso
            region = "torso"
        distances = [
            (
                name,
                point_segment_distance(point, *segments[name]),
            )
            for name in candidates
        ]
        distances.sort(key=lambda item: item[1])
        nearest = distances[:4]
        raw = [
            (name, 1.0 / ((distance + 0.018) ** 4))
            for name, distance in nearest
        ]
        weight_total = sum(weight for _, weight in raw)
        normalized = [
            (name, weight / weight_total) for name, weight in raw
        ]
        for name, weight in normalized:
            if weight > 0.0001:
                groups[name].add([vertex.index], weight, "REPLACE")
        regions[region] += 1
        totals.append(sum(weight for _, weight in normalized))
        influence_counts.append(
            sum(1 for _, weight in normalized if weight > 0.0001)
        )
    body.parent = rig
    armature = body.modifiers.new("KYX_REV17_ARMATURE", "ARMATURE")
    armature.object = rig
    totals = []
    influence_counts = []
    missing = []
    for vertex in body.data.vertices:
        weights = [item.weight for item in vertex.groups if item.weight > 0.0001]
        total = sum(weights)
        totals.append(total)
        influence_counts.append(len(weights))
        if total < 0.90:
            missing.append(vertex.index)
    return {
        "source": rig.name,
        "method": (
            "bounded_anatomical_regions_plus_inverse_distance_to_aligned_bone_segments"
        ),
        "regionVertexCounts": dict(sorted(regions.items())),
        "rejectedMethods": [
            (
                "nearest-surface Rev14 transfer: visually rejected because "
                "overlapping limbs produced waist and shoulder ambiguity"
            ),
            (
                "automatic bone heat: visually rejected because the compact "
                "contact rig caused torso and pelvis cross-influence"
            ),
        ],
        "destinationVertices": len(body.data.vertices),
        "destinationGroups": len(body.vertex_groups),
        "unweightedOrUnderweightedVertices": len(missing),
        "maximumInfluences": max(influence_counts, default=0),
        "minimumWeightTotal": round(min(totals, default=0.0), 6),
        "maximumWeightTotal": round(max(totals, default=0.0), 6),
    }


def project_weighted_body_to_clean_anatomy(
    body: bpy.types.Object,
    clean_anatomy_path: Path,
    rig: bpy.types.Object,
) -> dict[str, Any]:
    """Preserve proven Rev14 weights while restoring the clean CC0 surface.

    The Rev14 retopology deforms correctly with the contact rig but its surface
    contains visible reduction artifacts.  Every existing weighted vertex is
    projected to the nearest point of the preserved V6A CC0 anatomy.  This
    avoids the cross-limb ambiguity of nearest *weight* transfer: positions move
    to the clean surface while every authored Rev14 vertex group stays attached
    to its original vertex.
    """

    clear_modifiers(body)
    clean = append_object(
        clean_anatomy_path, "KYX_V6A_AnatomySculpt_Body"
    )
    clear_modifiers(clean)
    clean.hide_render = True
    clean.data.calc_loop_triangles()
    clean_vertices = [vertex.co.copy() for vertex in clean.data.vertices]
    clean_faces = [
        tuple(triangle.vertices) for triangle in clean.data.loop_triangles
    ]
    bvh = BVHTree.FromPolygons(
        clean_vertices, clean_faces, all_triangles=True, epsilon=0.0
    )
    distances = []
    unmatched = []
    for vertex in body.data.vertices:
        nearest = bvh.find_nearest(vertex.co)
        if nearest is None or nearest[0] is None:
            unmatched.append(vertex.index)
            continue
        location, _normal, _index, distance = nearest
        vertex.co = location
        distances.append(float(distance))
    if unmatched:
        raise RuntimeError(
            f"Clean anatomy projection missed {len(unmatched)} body vertices"
        )
    body.data.update()

    boundary_before = sum(1 for edge in body.data.edges if edge.is_loose)
    bm = bmesh.new()
    bm.from_mesh(body.data)
    boundary_edges = [edge for edge in bm.edges if edge.is_boundary]
    boundary_edge_count = len(boundary_edges)
    fill_result = (
        bmesh.ops.holes_fill(bm, edges=boundary_edges, sides=0)
        if boundary_edges
        else {"faces": []}
    )
    bm.to_mesh(body.data)
    bm.free()
    body.data.update()

    ensure_active(body)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(
        group_select_mode="ALL", lock_active=False
    )
    body.parent = rig
    armature = body.modifiers.new("KYX_REV17_ARMATURE", "ARMATURE")
    armature.object = rig
    totals = []
    influence_counts = []
    missing = []
    for vertex in body.data.vertices:
        weights = [item.weight for item in vertex.groups if item.weight > 0.0001]
        total = sum(weights)
        totals.append(total)
        influence_counts.append(len(weights))
        if total < 0.90:
            missing.append(vertex.index)
    bpy.data.objects.remove(clean, do_unlink=True)
    return {
        "source": "KYX_V6C_LOD0_SOFT_REV14",
        "method": (
            "preserve_vertex_weight_identity_then_project_positions_to_clean_"
            "v6a_cc0_anatomy_surface"
        ),
        "cleanSurface": str(clean_anatomy_path),
        "destinationVertices": len(body.data.vertices),
        "destinationGroups": len(body.vertex_groups),
        "projectionDistance": {
            "minimum": round(min(distances, default=0.0), 8),
            "maximum": round(max(distances, default=0.0), 8),
            "mean": round(
                sum(distances) / max(1, len(distances)), 8
            ),
        },
        "boundaryEdgesBeforeFill": boundary_edge_count,
        "looseEdgesBeforeFill": boundary_before,
        "facesFilled": len(fill_result.get("faces", [])),
        "unweightedOrUnderweightedVertices": len(missing),
        "maximumInfluences": max(influence_counts, default=0),
        "minimumWeightTotal": round(min(totals, default=0.0), 6),
        "maximumWeightTotal": round(max(totals, default=0.0), 6),
        "rejectedMethods": [
            "nearest-surface weight transfer caused cross-limb ambiguity",
            "automatic bone heat caused torso and pelvis cross-influence",
            "analytic proximity weights broke authored arm/finger correspondence",
        ],
    }


def prepare_preserved_weighted_body(
    body: bpy.types.Object, rig: bpy.types.Object
) -> dict[str, Any]:
    """Keep the intact closed V6A surface; armor overlays it without cut masks."""

    clear_modifiers(body)
    before_vertices = len(body.data.vertices)
    before_triangles = HELPERS.triangle_count(body)
    body.data.validate(clean_customdata=False)
    body.data.update()
    ensure_active(body)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(
        group_select_mode="ALL", lock_active=False
    )
    body.parent = rig
    armature = body.modifiers.new("KYX_REV17_ARMATURE", "ARMATURE")
    armature.object = rig
    for polygon in body.data.polygons:
        polygon.use_smooth = True
    totals = []
    influence_counts = []
    missing = []
    for vertex in body.data.vertices:
        weights = [item.weight for item in vertex.groups if item.weight > 0.0001]
        total = sum(weights)
        totals.append(total)
        influence_counts.append(len(weights))
        if total < 0.90:
            missing.append(vertex.index)
    return {
        "source": "KYX_V6A_AnatomySculpt_Body",
        "method": (
            "preserve_entire_continuous_v6a_surface_with_fresh_spatially_"
            "separated_heat_weights; no_masking_no_open_garment_boundaries"
        ),
        "verticesBeforeMask": before_vertices,
        "verticesAfterMask": len(body.data.vertices),
        "trianglesBeforeMask": before_triangles,
        "trianglesAfterMask": HELPERS.triangle_count(body),
        "maskedRestZones": [],
        "surfaceDeletionPerformed": False,
        "destinationGroups": len(body.vertex_groups),
        "unweightedOrUnderweightedVertices": len(missing),
        "maximumInfluences": max(influence_counts, default=0),
        "minimumWeightTotal": round(min(totals, default=0.0), 6),
        "maximumWeightTotal": round(max(totals, default=0.0), 6),
    }


REV13_ARMOR_OBJECTS = (
    # Retain only hard-surface pieces that can move rigidly with one bone.
    # Torso, shoulder, and limb plates are rebuilt from the freshly weighted
    # continuous body so they cannot shear into ribbons during animation.
    "KYX_V6B_PROD_R13_BootLast_L",
    "KYX_V6B_PROD_R13_BootLast_R",
    "KYX_V6B_PROD_R13_BootOutsole_L",
    "KYX_V6B_PROD_R13_BootOutsole_R",
    "KYX_V6B_PROD_R13_BootShaft_L",
    "KYX_V6B_PROD_R13_BootShaft_R",
    "KYX_V6B_PROD_R13_BootHeelCup_L",
    "KYX_V6B_PROD_R13_BootHeelCup_R",
    "KYX_V6B_PROD_R13_BootToeBridge_L",
    "KYX_V6B_PROD_R13_BootToeBridge_R",
    "KYX_V6B_PROD_R13_HelmetCrownRear",
    "KYX_V6B_PROD_R13_HelmetInner",
    "KYX_V6B_PROD_R13_HelmetCheekRail_L",
    "KYX_V6B_PROD_R13_HelmetCheekRail_R",
    "KYX_V6B_PROD_R13_HelmetPivot_L",
    "KYX_V6B_PROD_R13_HelmetPivot_R",
    "KYX_V6B_PROD_R13_HelmetBrowIndex",
    "KYX_V6B_PROD_R13_Visor",
)


def rev13_piece_role_and_weights(
    name: str,
) -> tuple[str, dict[str, float]]:
    if "Visor" in name or "HelmetBrowIndex" in name:
        return "visor", {"head": 1.0}
    if "Helmet" in name:
        return "helmet_pearl", {"head": 1.0}
    if "CloseCowl" in name:
        return "helmet_dark", {"chest": 1.0}
    if "ThoracicBib" in name:
        return "chest", {"chest": 1.0}
    if "BackYoke" in name:
        return "chest", {"chest": 1.0}
    if "AbdominalFlex" in name:
        return "abdomen", {"spine_01": 1.0}
    if "FittedWaistHarness" in name or "HarnessIndex" in name:
        return "pelvis", {"root": 0.65, "spine_01": 0.35}
    if "ChestReadout" in name:
        return "chest_index", {"chest": 1.0}
    side = "L" if name.endswith("_L") else "R"
    if "Shoulder" in name:
        role = "shoulder" if side == "L" else "shoulder_accent"
        return role, {f"upper_arm.{side}": 1.0}
    if "ForearmGuard" in name:
        return "forearm", {f"forearm.{side}": 1.0}
    if "ThighGuard" in name:
        return "thigh", {f"thigh_anchor.{side}": 1.0}
    if "KneeGuard" in name:
        return "knee", {f"shin_anchor.{side}": 1.0}
    if "ShinGuard" in name:
        return "shin", {f"shin_anchor.{side}": 1.0}
    if "BootShaft" in name:
        return "boot", {f"foot_anchor.{side}": 1.0}
    if "Boot" in name:
        return "boot", {f"foot_anchor.{side}": 1.0}
    raise RuntimeError(f"No Rev13 armor skinning rule for {name}")


def evaluated_mesh(obj: bpy.types.Object) -> bpy.types.Object:
    if obj.type == "CURVE":
        ensure_active(obj)
        result = bpy.ops.object.convert(target="MESH")
        if "FINISHED" not in result:
            raise RuntimeError(f"Unable to convert Rev13 curve {obj.name}: {result}")
        obj = bpy.context.object
    # Evidence does not need the sculpt/render subdivision density.  One
    # subdivision level retains the authored silhouettes and prevents a hidden
    # 95k-triangle armor payload before the practical LOD pass.
    for modifier in obj.modifiers:
        if modifier.type == "SUBSURF":
            modifier.levels = min(int(modifier.levels), 1)
            modifier.render_levels = min(int(modifier.render_levels), 1)
        elif modifier.type == "BEVEL":
            modifier.segments = min(int(modifier.segments), 2)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = obj.evaluated_get(depsgraph)
    mesh = bpy.data.meshes.new_from_object(
        evaluated, preserve_all_data_layers=True, depsgraph=depsgraph
    )
    old_mesh = obj.data
    obj.data = mesh
    clear_modifiers(obj)
    if old_mesh.users == 0:
        bpy.data.meshes.remove(old_mesh)
    return obj


def build_rev13_authored_armor(
    source_path: Path,
    rig: bpy.types.Object,
    material: bpy.types.Material,
) -> tuple[bpy.types.Object, dict[str, Any]]:
    with bpy.data.libraries.load(str(source_path), link=False) as (source, target):
        missing = [name for name in REV13_ARMOR_OBJECTS if name not in source.objects]
        if missing:
            raise RuntimeError(f"Rev13 armor source is missing objects: {missing}")
        target.objects = list(REV13_ARMOR_OBJECTS)
    pieces = []
    role_counts: dict[str, int] = defaultdict(int)
    triangle_counts: dict[str, int] = {}
    for original in [obj for obj in target.objects if obj is not None]:
        if not original.users_collection:
            bpy.context.scene.collection.objects.link(original)
        obj = evaluated_mesh(original)
        obj.parent = rig
        role, weights = rev13_piece_role_and_weights(obj.name)
        obj.data.materials.clear()
        obj.data.materials.append(material)
        for group in list(obj.vertex_groups):
            obj.vertex_groups.remove(group)
        for bone_name, weight in weights.items():
            group = obj.vertex_groups.new(name=bone_name)
            group.add(
                list(range(len(obj.data.vertices))), float(weight), "REPLACE"
            )
        armature = obj.modifiers.new("KYX_REV17_ARMATURE", "ARMATURE")
        armature.object = rig
        color = reset_color_attribute(obj.data)
        rgba = ARMOR_COLORS[role]
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
            for loop_index in polygon.loop_indices:
                color.data[loop_index].color = rgba
        role_counts[role] += 1
        triangle_counts[obj.name] = HELPERS.triangle_count(obj)
        pieces.append(obj)
    if len(pieces) != len(REV13_ARMOR_OBJECTS):
        raise RuntimeError("Not all Rev13 armor pieces were appended")
    bpy.ops.object.select_all(action="DESELECT")
    for piece in pieces:
        piece.hide_set(False)
        piece.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    result = bpy.ops.object.join()
    if "FINISHED" not in result:
        raise RuntimeError(f"Unable to join Rev13 authored armor: {result}")
    armor = bpy.context.object
    armor.name = "KYX_REV17_LOD0_AUTHORED_FITTED_ARMOR"
    armor.data.name = armor.name + "_MESH"
    for modifier in list(armor.modifiers):
        if modifier.type == "ARMATURE":
            armor.modifiers.remove(modifier)
    armature = armor.modifiers.new("KYX_REV17_ARMATURE", "ARMATURE")
    armature.object = rig
    armor.parent = rig
    armor.data.materials.clear()
    armor.data.materials.append(material)
    for polygon in armor.data.polygons:
        polygon.material_index = 0
    pre_decimate_triangles = HELPERS.triangle_count(armor)
    hard_surface_budget = 12_500
    if pre_decimate_triangles > hard_surface_budget:
        ensure_active(armor)
        decimate = armor.modifiers.new(
            name="KYX_REV17_LOD0_ARMOR_BUDGET_DECIMATE", type="DECIMATE"
        )
        decimate.decimate_type = "COLLAPSE"
        decimate.ratio = hard_surface_budget / pre_decimate_triangles
        decimate.use_collapse_triangulate = True
        result = bpy.ops.object.modifier_apply(modifier=decimate.name)
        if "FINISHED" not in result:
            raise RuntimeError(f"Unable to budget Rev17 authored armor: {result}")
    ensure_active(armor)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(
        group_select_mode="ALL", lock_active=False
    )
    armor.data.validate(clean_customdata=False)
    armor.data.update()
    armor["kyx_checkpoint"] = CHECKPOINT
    armor["kyx_authored_source_revision"] = "v6b-production-rev13"
    armor["kyx_candidate_revision"] = "rev17"
    return armor, {
        "source": str(source_path),
        "pieceCount": len(pieces),
        "rolePieceCounts": dict(sorted(role_counts.items())),
        "sourcePieceTriangles": dict(sorted(triangle_counts.items())),
        "joinedTrianglesBeforeBudget": pre_decimate_triangles,
        "joinedTriangles": HELPERS.triangle_count(armor),
        "method": (
            "single_subdivision_evaluated_authored_components_rigidly_skinned_"
            "by_declared_role_then_bounded_to_12500_triangles"
        ),
        "triangleBudget": hard_surface_budget,
    }


def color_body(body: bpy.types.Object) -> dict[str, int]:
    mesh = body.data
    color = reset_color_attribute(mesh)
    hand_names = {
        name
        for name in body.vertex_groups.keys()
        if any(
            token in name
            for token in (
                "wrist.",
                "palm.",
                "thumb_",
                "index_",
                "middle_",
                "ring_",
                "pinky_",
            )
        )
    }
    bands: dict[str, int] = defaultdict(int)
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            if group_weight(body, vertex, hand_names) > 0.10:
                rgba = (0.018, 0.026, 0.034, 1.0)
                band = "sealed_glove"
            elif vertex.co.z > 1.535:
                rgba = (0.30, 0.17, 0.11, 1.0)
                band = "occluded_face"
            elif vertex.co.z < 0.24:
                rgba = (0.015, 0.025, 0.034, 1.0)
                band = "boot_liner"
            elif vertex.co.z < 0.98:
                rgba = (0.025, 0.045, 0.060, 1.0)
                band = "technical_trouser"
            elif vertex.co.y < -0.045 and vertex.co.z > 1.10:
                rgba = (0.042, 0.075, 0.090, 1.0)
                band = "thoracic_underlayer"
            else:
                rgba = (0.020, 0.038, 0.052, 1.0)
                band = "continuous_undersuit"
            color.data[loop_index].color = rgba
            bands[band] += 1
    mesh.update()
    return dict(sorted(bands.items()))


TORSO = {"root", "spine_01", "spine_02", "chest", "neck"}
HEAD = {"neck", "head"}
ARM = {
    "clavicle.L",
    "upper_arm.L",
    "forearm.L",
    "wrist.L",
    "palm.L",
    "clavicle.R",
    "upper_arm.R",
    "forearm.R",
    "wrist.R",
    "palm.R",
}
FOREARM = {"forearm.L", "wrist.L", "forearm.R", "wrist.R"}
SHOULDER = {"clavicle.L", "upper_arm.L", "clavicle.R", "upper_arm.R"}
THIGH = {"thigh_anchor.L", "thigh_anchor.R"}
SHIN = {"shin_anchor.L", "shin_anchor.R"}
FOOT = {"foot_anchor.L", "foot_anchor.R"}


def polygon_weight(
    obj: bpy.types.Object, polygon: bpy.types.MeshPolygon, names: set[str]
) -> float:
    return sum(
        group_weight(obj, obj.data.vertices[index], names)
        for index in polygon.vertices
    ) / max(1, len(polygon.vertices))


def classify_armor_polygon(
    body: bpy.types.Object, polygon: bpy.types.MeshPolygon
) -> tuple[str, float] | None:
    center = polygon.center
    normal = polygon.normal
    head = polygon_weight(body, polygon, HEAD)
    torso = polygon_weight(body, polygon, TORSO)
    shoulder = polygon_weight(body, polygon, SHOULDER)
    forearm = polygon_weight(body, polygon, FOREARM)
    thigh = polygon_weight(body, polygon, THIGH)
    shin = polygon_weight(body, polygon, SHIN)
    foot = polygon_weight(body, polygon, FOOT)
    front_back = abs(normal.y) > 0.26
    if center.z > 1.535 and head > 0.32:
        if center.y < -0.090 and 1.605 < center.z < 1.735:
            return "visor", 0.016
        if center.y < -0.070 and center.z < 1.615:
            return "helmet_dark", 0.013
        return "helmet_pearl", 0.014
    if foot > 0.32 or (center.z < 0.205 and shin > 0.20):
        return "boot", 0.012
    if 0.445 < center.z < 0.615 and (thigh + shin) > 0.38 and center.y < 0.025:
        return "knee", 0.014
    if 0.19 < center.z < 0.49 and shin > 0.52 and (
        center.y < -0.010 or abs(center.x) > 0.105
    ):
        return "shin", 0.011
    if 0.60 < center.z < 0.93 and thigh > 0.55 and (
        center.y < -0.015 or abs(center.x) > 0.13
    ):
        return "thigh", 0.010
    if 0.76 < center.z < 1.14 and forearm > 0.48 and (
        center.y < 0.005 or abs(center.x) > 0.30
    ):
        return "forearm", 0.010
    if center.z > 1.20 and shoulder > 0.42 and abs(center.x) > 0.205:
        if center.x < 0.0:
            return "shoulder_accent", 0.015
        return "shoulder", 0.013
    if 1.145 < center.z < 1.43 and torso > 0.44 and front_back:
        if center.y < -0.030 and abs(center.x) < 0.075:
            return "chest_index", 0.012
        return "chest", 0.011
    if 0.975 < center.z <= 1.145 and torso > 0.48 and front_back:
        return "abdomen", 0.008
    if 0.885 < center.z <= 0.995 and torso > 0.42 and (
        abs(normal.y) > 0.42 and abs(center.x) > 0.035
    ):
        return "pelvis", 0.008
    return None


ARMOR_COLORS = {
    "visor": (0.006, 0.16, 0.29, 1.0),
    "helmet_dark": (0.012, 0.038, 0.052, 1.0),
    "helmet_pearl": (0.15, 0.24, 0.28, 1.0),
    "boot": (0.018, 0.045, 0.060, 1.0),
    "knee": (0.055, 0.13, 0.16, 1.0),
    "shin": (0.035, 0.10, 0.13, 1.0),
    "thigh": (0.030, 0.085, 0.115, 1.0),
    "forearm": (0.040, 0.105, 0.145, 1.0),
    "shoulder": (0.050, 0.12, 0.16, 1.0),
    "shoulder_accent": (0.30, 0.038, 0.012, 1.0),
    "chest": (0.035, 0.095, 0.135, 1.0),
    "chest_index": (0.28, 0.025, 0.006, 1.0),
    "abdomen": (0.025, 0.070, 0.100, 1.0),
    "pelvis": (0.020, 0.055, 0.080, 1.0),
}


def make_beveled_profile_plate(
    name: str,
    profile_xz: list[tuple[float, float]],
    y_minimum: float,
    y_maximum: float,
    bone_name: str,
    role: str,
    rig: bpy.types.Object,
    material: bpy.types.Material,
    bevel_width: float = 0.010,
) -> bpy.types.Object:
    """Build one closed fitted hard-surface plate with a clean authored edge."""

    count = len(profile_xz)
    vertices = [
        (x, y_minimum, z) for x, z in profile_xz
    ] + [
        (x, y_maximum, z) for x, z in profile_xz
    ]
    faces: list[tuple[int, ...]] = [
        tuple(reversed(range(count))),
        tuple(range(count, count * 2)),
    ]
    for index in range(count):
        following = (index + 1) % count
        faces.append(
            (index, following, count + following, count + index)
        )
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    ensure_active(obj)
    bevel = obj.modifiers.new(name="KYX_REV17_CLEAN_EDGE_BEVEL", type="BEVEL")
    bevel.width = bevel_width
    bevel.segments = 2
    bevel.limit_method = "ANGLE"
    applied = bpy.ops.object.modifier_apply(modifier=bevel.name)
    if "FINISHED" not in applied:
        raise RuntimeError(f"Unable to bevel clean armor plate {name}: {applied}")
    color = reset_color_attribute(obj.data)
    rgba = ARMOR_COLORS[role]
    for polygon in obj.data.polygons:
        polygon.use_smooth = False
        for loop_index in polygon.loop_indices:
            color.data[loop_index].color = rgba
    group = obj.vertex_groups.new(name=bone_name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    obj.parent = rig
    armature = obj.modifiers.new("KYX_REV17_ARMATURE", "ARMATURE")
    armature.object = rig
    obj["kyx_clean_authored_profile"] = True
    obj["kyx_armor_role"] = role
    return obj


def build_clean_procedural_armor(
    rig: bpy.types.Object,
    material: bpy.types.Material,
) -> tuple[bpy.types.Object, dict[str, Any]]:
    """Author a readable sci-fi plate set without copied or torn mesh borders."""

    pieces: list[bpy.types.Object] = []
    piece_records: list[dict[str, Any]] = []

    def add(
        name: str,
        profile: list[tuple[float, float]],
        y_minimum: float,
        y_maximum: float,
        bone: str,
        role: str,
        bevel: float = 0.010,
    ) -> None:
        piece = make_beveled_profile_plate(
            name,
            profile,
            y_minimum,
            y_maximum,
            bone,
            role,
            rig,
            material,
            bevel,
        )
        pieces.append(piece)
        piece_records.append(
            {
                "name": name,
                "bone": bone,
                "role": role,
                "triangles": HELPERS.triangle_count(piece),
            }
        )

    left_pectoral = [
        (0.012, 1.435),
        (0.050, 1.478),
        (0.120, 1.458),
        (0.168, 1.398),
        (0.152, 1.292),
        (0.104, 1.232),
        (0.025, 1.215),
    ]
    right_pectoral = [(-x, z) for x, z in reversed(left_pectoral)]
    add(
        "KYX_REV17_CHEST_PECTORAL_L",
        left_pectoral,
        -0.184,
        -0.115,
        "chest",
        "chest",
        0.012,
    )
    add(
        "KYX_REV17_CHEST_PECTORAL_R",
        right_pectoral,
        -0.184,
        -0.115,
        "chest",
        "chest",
        0.012,
    )
    add(
        "KYX_REV17_CHEST_INDEX",
        [
            (-0.034, 1.430),
            (0.034, 1.430),
            (0.046, 1.335),
            (0.026, 1.245),
            (-0.026, 1.245),
            (-0.046, 1.335),
        ],
        -0.205,
        -0.185,
        "chest",
        "chest_index",
        0.006,
    )
    add(
        "KYX_REV17_BACK_CARAPACE",
        [
            (-0.190, 1.395),
            (-0.125, 1.470),
            (0.125, 1.470),
            (0.190, 1.395),
            (0.165, 1.230),
            (0.080, 1.175),
            (-0.080, 1.175),
            (-0.165, 1.230),
        ],
        0.082,
        0.145,
        "chest",
        "chest",
        0.013,
    )
    for index, (center_z, half_width, bone) in enumerate(
        (
            (1.135, 0.135, "spine_02"),
            (1.075, 0.122, "spine_01"),
            (1.018, 0.108, "spine_01"),
        ),
        start=1,
    ):
        add(
            f"KYX_REV17_ABDOMEN_FLEX_{index:02d}",
            [
                (-half_width, center_z + 0.026),
                (-half_width + 0.024, center_z + 0.040),
                (half_width - 0.024, center_z + 0.040),
                (half_width, center_z + 0.026),
                (half_width - 0.016, center_z - 0.027),
                (-half_width + 0.016, center_z - 0.027),
            ],
            -0.156,
            -0.120,
            bone,
            "abdomen",
            0.007,
        )
    add(
        "KYX_REV17_PELVIS_CENTER",
        [
            (-0.090, 0.985),
            (0.090, 0.985),
            (0.110, 0.925),
            (0.065, 0.860),
            (-0.065, 0.860),
            (-0.110, 0.925),
        ],
        -0.158,
        -0.112,
        "root",
        "pelvis",
        0.009,
    )

    left_shoulder = [
        (0.165, 1.430),
        (0.205, 1.485),
        (0.285, 1.462),
        (0.330, 1.385),
        (0.292, 1.325),
        (0.205, 1.350),
    ]
    right_shoulder = [(-x, z) for x, z in reversed(left_shoulder)]
    add(
        "KYX_REV17_SHOULDER_CAP_L",
        left_shoulder,
        -0.115,
        0.025,
        "upper_arm.L",
        "shoulder",
        0.012,
    )
    add(
        "KYX_REV17_SHOULDER_CAP_R",
        right_shoulder,
        -0.115,
        0.025,
        "upper_arm.R",
        "shoulder_accent",
        0.012,
    )

    for side, sign in (("L", 1.0), ("R", -1.0)):
        def mirrored(points: list[tuple[float, float]]) -> list[tuple[float, float]]:
            transformed = [(sign * x, z) for x, z in points]
            return transformed if sign > 0.0 else list(reversed(transformed))

        add(
            f"KYX_REV17_FOREARM_GUARD_{side}",
            mirrored(
                [
                    (0.305, 1.135),
                    (0.362, 1.150),
                    (0.420, 0.955),
                    (0.402, 0.890),
                    (0.350, 0.930),
                ]
            ),
            -0.115,
            -0.045,
            f"forearm.{side}",
            "forearm",
            0.009,
        )
        add(
            f"KYX_REV17_THIGH_GUARD_{side}",
            mirrored(
                [
                    (0.070, 0.920),
                    (0.135, 0.955),
                    (0.195, 0.895),
                    (0.180, 0.675),
                    (0.130, 0.610),
                    (0.080, 0.650),
                ]
            ),
            -0.148,
            -0.090,
            f"thigh_anchor.{side}",
            "thigh",
            0.010,
        )
        add(
            f"KYX_REV17_KNEE_GUARD_{side}",
            mirrored(
                [
                    (0.075, 0.605),
                    (0.145, 0.620),
                    (0.175, 0.560),
                    (0.150, 0.495),
                    (0.085, 0.495),
                    (0.060, 0.555),
                ]
            ),
            -0.150,
            -0.080,
            f"shin_anchor.{side}",
            "knee",
            0.011,
        )
        add(
            f"KYX_REV17_SHIN_GUARD_{side}",
            mirrored(
                [
                    (0.070, 0.485),
                    (0.145, 0.500),
                    (0.170, 0.410),
                    (0.145, 0.205),
                    (0.105, 0.155),
                    (0.070, 0.220),
                ]
            ),
            -0.135,
            -0.075,
            f"shin_anchor.{side}",
            "shin",
            0.010,
        )

    bpy.ops.object.select_all(action="DESELECT")
    for piece in pieces:
        for modifier in list(piece.modifiers):
            if modifier.type == "ARMATURE":
                piece.modifiers.remove(modifier)
        piece.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    joined = bpy.ops.object.join()
    if "FINISHED" not in joined:
        raise RuntimeError(f"Unable to join clean procedural armor: {joined}")
    armor = bpy.context.object
    armor.name = "KYX_REV17_LOD0_CLEAN_PROFILE_ARMOR"
    armor.data.name = armor.name + "_MESH"
    armor.parent = rig
    armor.data.materials.clear()
    armor.data.materials.append(material)
    for polygon in armor.data.polygons:
        polygon.material_index = 0
    armature = armor.modifiers.new("KYX_REV17_ARMATURE", "ARMATURE")
    armature.object = rig
    armor["kyx_checkpoint"] = CHECKPOINT
    armor["kyx_clean_authored_profiles"] = True
    return armor, {
        "method": (
            "closed_beveled_authored_profile_plates_with_clean_manifold_edges_"
            "and_single_bone_hard_surface_skinning"
        ),
        "pieceCount": len(piece_records),
        "pieces": piece_records,
        "joinedTriangles": HELPERS.triangle_count(armor),
        "copiedBodySurfaceFaces": 0,
        "openSawtoothSelectionBorders": 0,
    }


def copy_weighted_faces(
    source: bpy.types.Object,
    selected: list[tuple[bpy.types.MeshPolygon, str, float]],
    name: str,
    rig: bpy.types.Object,
    material: bpy.types.Material,
) -> tuple[bpy.types.Object, dict[str, int]]:
    source.data.update()
    vertices: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    source_indices: list[int] = []
    roles: list[str] = []
    mapping: dict[tuple[int, str, int], int] = {}
    for polygon, role, offset in selected:
        face = []
        offset_key = int(round(offset * 100_000))
        for source_index in polygon.vertices:
            key = (int(source_index), role, offset_key)
            destination = mapping.get(key)
            if destination is None:
                vertex = source.data.vertices[source_index]
                point = vertex.co + vertex.normal.normalized() * offset
                destination = len(vertices)
                mapping[key] = destination
                vertices.append(tuple(point))
                source_indices.append(int(source_index))
            face.append(destination)
        faces.append(tuple(face))
        roles.append(role)
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj.parent = rig
    armature = obj.modifiers.new("KYX_REV17_ARMATURE", "ARMATURE")
    armature.object = rig
    for group in source.vertex_groups:
        obj.vertex_groups.new(name=group.name)
    for destination, source_index in enumerate(source_indices):
        for item in source.data.vertices[source_index].groups:
            source_group = source.vertex_groups[item.group]
            target_group = obj.vertex_groups.get(source_group.name)
            if target_group is not None and item.weight > 0.0001:
                target_group.add([destination], item.weight, "REPLACE")
    color = ensure_color_attribute(mesh)
    counts: dict[str, int] = defaultdict(int)
    for polygon, role in zip(mesh.polygons, roles):
        rgba = ARMOR_COLORS[role]
        for loop_index in polygon.loop_indices:
            color.data[loop_index].color = rgba
        polygon.use_smooth = True
        counts[role] += 1
    obj["kyx_checkpoint"] = CHECKPOINT
    obj["kyx_fitted_surface_armor"] = True
    obj["kyx_panel_method"] = "offset_from_continuous_human_anatomy"
    return obj, dict(sorted(counts.items()))


def build_fitted_armor(
    body: bpy.types.Object,
    rig: bpy.types.Object,
    material: bpy.types.Material,
) -> tuple[bpy.types.Object, dict[str, int]]:
    body.data.update()
    body.data.calc_loop_triangles()
    selected = []
    for polygon in body.data.polygons:
        classification = classify_armor_polygon(body, polygon)
        if classification is not None:
            role, offset = classification
            selected.append((polygon, role, offset))
    if not selected:
        raise RuntimeError("Fitted armor selection unexpectedly produced no faces")
    return copy_weighted_faces(
        body, selected, "KYX_REV17_LOD0_FITTED_ARMOR", rig, material
    )


def build_fitted_core_panels(
    body: bpy.types.Object,
    rig: bpy.types.Object,
    material: bpy.types.Material,
) -> tuple[bpy.types.Object, dict[str, int]]:
    """Add body-following abdomen/pelvis panels without a rigid waist ring."""

    selected = []
    for polygon in body.data.polygons:
        classification = classify_armor_polygon(body, polygon)
        if classification is not None and classification[0] in {
            "abdomen",
            "pelvis",
        }:
            selected.append((polygon, *classification))
    if not selected:
        raise RuntimeError("Rev17 fitted core panel selection is empty")
    return copy_weighted_faces(
        body,
        selected,
        "KYX_REV17_LOD0_FITTED_CORE_PANELS",
        rig,
        material,
    )


def join_armor_layers(
    primary: bpy.types.Object,
    fitted_core: bpy.types.Object,
    rig: bpy.types.Object,
    material: bpy.types.Material,
) -> tuple[bpy.types.Object, dict[str, Any]]:
    before = {
        primary.name: HELPERS.triangle_count(primary),
        fitted_core.name: HELPERS.triangle_count(fitted_core),
    }
    for obj in (primary, fitted_core):
        for modifier in list(obj.modifiers):
            if modifier.type == "ARMATURE":
                obj.modifiers.remove(modifier)
    bpy.ops.object.select_all(action="DESELECT")
    primary.select_set(True)
    fitted_core.select_set(True)
    bpy.context.view_layer.objects.active = primary
    result = bpy.ops.object.join()
    if "FINISHED" not in result:
        raise RuntimeError(f"Unable to join authored and fitted armor: {result}")
    armor = bpy.context.object
    armor.name = "KYX_REV17_LOD0_AUTHORED_FITTED_ARMOR"
    armor.data.name = armor.name + "_MESH"
    armor.parent = rig
    armor.data.materials.clear()
    armor.data.materials.append(material)
    for polygon in armor.data.polygons:
        polygon.material_index = 0
    joined_before_budget = HELPERS.triangle_count(armor)
    if joined_before_budget > 16_000:
        ensure_active(armor)
        decimate = armor.modifiers.new(
            name="KYX_REV17_COMBINED_ARMOR_BUDGET_DECIMATE", type="DECIMATE"
        )
        decimate.decimate_type = "COLLAPSE"
        decimate.ratio = 16_000 / joined_before_budget
        decimate.use_collapse_triangulate = True
        applied = bpy.ops.object.modifier_apply(modifier=decimate.name)
        if "FINISHED" not in applied:
            raise RuntimeError(f"Unable to budget combined Rev17 armor: {applied}")
    ensure_active(armor)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(
        group_select_mode="ALL", lock_active=False
    )
    armature = armor.modifiers.new("KYX_REV17_ARMATURE", "ARMATURE")
    armature.object = rig
    armor.data.update()
    return armor, {
        "inputTriangles": before,
        "joinedTrianglesBeforeBudget": joined_before_budget,
        "joinedTriangles": HELPERS.triangle_count(armor),
        "budgetTriangles": 16_000,
        "method": (
            "authored_rigid_helmet_and_boot_components_plus_closed_beveled_"
            "clean_profile_plates_joined_to_one_runtime_primitive"
        ),
    }


def compact_rifle_profile(rifle: bpy.types.Object) -> dict[str, Any]:
    """Shorten only the unsupported muzzle run while preserving both grips."""

    mesh = rifle.data
    before_minimum = [min(vertex.co[i] for vertex in mesh.vertices) for i in range(3)]
    before_maximum = [max(vertex.co[i] for vertex in mesh.vertices) for i in range(3)]
    contact = mesh.attributes.get("_KYX_CONTACT_MASK")
    contact_before = {}
    if contact is not None and contact.domain == "POINT":
        contact_before = {
            index: mesh.vertices[index].co.copy()
            for index, datum in enumerate(contact.data)
            if float(getattr(datum, "value", 0.0)) > 0.5
        }
    support_safe_pivot_z = 0.50
    forward_scale = 0.56
    changed_vertices = 0
    for vertex in mesh.vertices:
        if vertex.co.z < support_safe_pivot_z:
            vertex.co.z = support_safe_pivot_z + (
                vertex.co.z - support_safe_pivot_z
            ) * forward_scale
            changed_vertices += 1
    mesh.update()
    after_minimum = [min(vertex.co[i] for vertex in mesh.vertices) for i in range(3)]
    after_maximum = [max(vertex.co[i] for vertex in mesh.vertices) for i in range(3)]
    maximum_contact_delta = max(
        (
            (mesh.vertices[index].co - coordinate).length
            for index, coordinate in contact_before.items()
        ),
        default=0.0,
    )
    if maximum_contact_delta > 1.0e-9:
        raise RuntimeError(
            "Compact rifle profile moved protected contact geometry: "
            f"{maximum_contact_delta}"
        )
    return {
        "method": (
            "support_safe_piecewise_forward_compression_below_rest_z_0.50; "
            "all contact-mask vertices preserved exactly"
        ),
        "supportSafePivotZ": support_safe_pivot_z,
        "forwardScale": forward_scale,
        "changedVertices": changed_vertices,
        "contactVertices": len(contact_before),
        "maximumContactVertexDelta": maximum_contact_delta,
        "boundsBefore": {
            "minimum": before_minimum,
            "maximum": before_maximum,
            "dimensions": [
                before_maximum[i] - before_minimum[i] for i in range(3)
            ],
        },
        "boundsAfter": {
            "minimum": after_minimum,
            "maximum": after_maximum,
            "dimensions": [
                after_maximum[i] - after_minimum[i] for i in range(3)
            ],
        },
    }


def recolor_rifle(rifle: bpy.types.Object) -> dict[str, int]:
    mesh = rifle.data
    color = reset_color_attribute(mesh)
    bounds_y = [vertex.co.y for vertex in mesh.vertices]
    front = min(bounds_y)
    rear = max(bounds_y)
    span = max(0.001, rear - front)
    bands: dict[str, int] = defaultdict(int)
    for polygon in mesh.polygons:
        center = polygon.center
        relative = (center.y - front) / span
        if relative < 0.12:
            rgba = (0.34, 0.42, 0.44, 1.0)
            band = "muzzle"
        elif center.x < -0.43 and 0.25 < relative < 0.72:
            rgba = (0.40, 0.065, 0.022, 1.0)
            band = "oxide_index"
        elif center.z > 0.48:
            rgba = (0.12, 0.20, 0.23, 1.0)
            band = "upper_receiver"
        else:
            rgba = (0.025, 0.060, 0.075, 1.0)
            band = "rifle_body"
        for loop_index in polygon.loop_indices:
            color.data[loop_index].color = rgba
            bands[band] += 1
        polygon.use_smooth = True
    mesh.update()
    return dict(sorted(bands.items()))


def add_socket_bones(
    rig: bpy.types.Object, rifle: bpy.types.Object
) -> list[dict[str, Any]]:
    mesh = rifle.data
    muzzle_candidates = sorted(mesh.vertices, key=lambda vertex: vertex.co.z)[
        : max(8, len(mesh.vertices) // 150)
    ]
    muzzle = sum((vertex.co for vertex in muzzle_candidates), Vector()) / len(
        muzzle_candidates
    )
    casing = Vector((-0.50, -0.06, 0.69))
    ensure_active(rig)
    bpy.ops.object.mode_set(mode="EDIT")
    edit_bones = rig.data.edit_bones
    records = []
    for name, parent_name in SOCKET_SPECS:
        if name in edit_bones:
            continue
        parent = edit_bones.get(parent_name)
        if parent is None:
            raise RuntimeError(f"Socket parent does not exist: {parent_name}")
        bone = edit_bones.new(name)
        bone.parent = parent
        bone.use_connect = False
        bone.use_deform = False
        if name in {"socket_head"}:
            head = Vector((0.0, -0.035, 1.68))
        elif name == "socket_chest":
            head = Vector((0.0, -0.15, 1.31))
        elif name == "socket_back":
            head = Vector((0.0, 0.13, 1.28))
        elif name == "socket_hips":
            head = Vector((0.0, 0.0, 0.91))
        elif name == "socket_hand_r":
            head = edit_bones["palm.R"].head.copy()
        elif name == "socket_hand_l":
            head = edit_bones["palm.L"].head.copy()
        elif name == "socket_weapon_r":
            head = edit_bones["palm.R"].head.copy()
        elif name == "socket_support_l":
            head = edit_bones["palm.L"].head.copy()
        elif name == "socket_muzzle":
            head = muzzle.copy()
        elif name == "socket_nozzle":
            head = muzzle + Vector((0.0, 0.0, -0.018))
        elif name == "socket_casing":
            head = casing.copy()
        elif name == "socket_foot_l":
            head = edit_bones["foot_anchor.L"].tail.copy()
        elif name == "socket_foot_r":
            head = edit_bones["foot_anchor.R"].tail.copy()
        elif name == "socket_ability":
            head = Vector((-0.17, -0.12, 1.24))
        else:
            head = parent.head.copy()
        bone.head = head
        bone.tail = head + Vector((0.0, 0.025, 0.0))
        records.append(
            {
                "name": name,
                "parent": parent_name,
                "head": [round(float(value), 6) for value in head],
            }
        )
    bpy.ops.object.mode_set(mode="OBJECT")
    return records


def sample_source_actions(
    rig: bpy.types.Object, actions: dict[str, bpy.types.Action]
) -> dict[str, dict[int, dict[str, Matrix]]]:
    samples = {}
    for name in SOURCE_CLIPS:
        action = actions[name]
        HELPERS.assign_action(rig, action)
        start, end = [int(round(value)) for value in action.frame_range]
        frames = {}
        for frame in range(start, end + 1):
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            frames[frame] = {
                bone.name: bone.matrix_basis.copy()
                for bone in rig.pose.bones
                if not bone.name.startswith("socket_")
            }
        samples[name] = frames
    return samples


def apply_rev17_motion_weight(
    basis: dict[str, Matrix],
    output_name: str,
    frame: int,
    start: int,
    end: int,
) -> None:
    normalized = (frame - start) / max(1, end - start)
    phase = math.tau * normalized
    if output_name.endswith("_IDLE"):
        HELPERS.rotate_basis(basis, "spine_02", "X", 0.8 * math.sin(phase))
        HELPERS.rotate_basis(basis, "chest", "X", -0.45 * math.sin(phase))
    if output_name.endswith("_WALK"):
        HELPERS.rotate_basis(basis, "spine_01", "X", -2.0)
        HELPERS.rotate_basis(basis, "chest", "Z", 1.5 * math.sin(phase))
    if output_name.endswith("_RUN") or output_name.endswith("_SPRINT"):
        HELPERS.rotate_basis(basis, "spine_01", "X", -6.0)
        HELPERS.rotate_basis(basis, "spine_02", "X", -3.0)
        HELPERS.rotate_basis(basis, "chest", "X", 2.0)
        HELPERS.rotate_basis(basis, "chest", "Z", -2.6 * math.sin(phase))
        # The imported Rev16 source already contains its plant-height revision.
        # This Rev17 pass adds forward body weight without reapplying root lift.
    if output_name.endswith("AIRBORNE_LOOP") or output_name.endswith("_AIRBORNE"):
        HELPERS.rotate_basis(basis, "spine_01", "X", -4.0)
        HELPERS.rotate_basis(basis, "thigh_anchor.L", "X", 28.0)
        HELPERS.rotate_basis(basis, "thigh_anchor.R", "X", 24.0)
        HELPERS.rotate_basis(basis, "shin_anchor.L", "X", -40.0)
        HELPERS.rotate_basis(basis, "shin_anchor.R", "X", -34.0)
    if output_name.endswith("PRIMARY_FIRE") or output_name.endswith("_FIRE"):
        recoil = math.sin(math.pi * normalized)
        HELPERS.rotate_basis(basis, "chest", "X", 2.8 * recoil)
        HELPERS.rotate_basis(basis, "upper_arm.R", "X", -2.2 * recoil)
    if output_name.endswith("DEATH_FRONT"):
        settle = max(0.0, min(1.0, (normalized - 0.42) / 0.58))
        settle = settle * settle * (3.0 - 2.0 * settle)
        HELPERS.rotate_basis(basis, "spine_01", "X", -24.0 * settle)
        HELPERS.rotate_basis(basis, "spine_02", "X", -16.0 * settle)
        HELPERS.rotate_basis(basis, "chest", "Z", -8.0 * settle)
        HELPERS.rotate_basis(basis, "thigh_anchor.L", "X", 16.0 * settle)
        HELPERS.rotate_basis(basis, "thigh_anchor.R", "X", 24.0 * settle)
        HELPERS.rotate_basis(basis, "shin_anchor.L", "X", -22.0 * settle)
        HELPERS.rotate_basis(basis, "shin_anchor.R", "X", -30.0 * settle)
        root_matrix = basis["root"].copy()
        root_matrix.translation.z -= 0.30 * settle
        basis["root"] = root_matrix


def rebuild_actions(
    rig: bpy.types.Object,
    samples: dict[str, dict[int, dict[str, Matrix]]],
) -> tuple[dict[str, bpy.types.Action], list[dict[str, Any]]]:
    if rig.animation_data:
        rig.animation_data_clear()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    animation_data = rig.animation_data_create()
    animation_data.use_nla = False
    actions = {}
    records = []
    socket_names = {
        bone.name for bone in rig.pose.bones if bone.name.startswith("socket_")
    }
    for output_name, source_name in ALL_CLIP_MAP.items():
        source_frames = samples[source_name]
        start = min(source_frames)
        end = max(source_frames)
        action = bpy.data.actions.new(output_name)
        animation_data.action = action
        for frame in range(start, end + 1):
            basis = {
                bone_name: matrix.copy()
                for bone_name, matrix in source_frames[frame].items()
            }
            apply_rev17_motion_weight(basis, output_name, frame, start, end)
            for bone in rig.pose.bones:
                bone.matrix_basis = (
                    Matrix.Identity(4) if bone.name in socket_names else basis[bone.name]
                )
            bpy.context.view_layer.update()
            HELPERS.key_pose(rig, frame)
        interpolation = (
            "LINEAR"
            if output_name.endswith("PRIMARY_FIRE") or output_name.endswith("_FIRE")
            else "BEZIER"
        )
        HELPERS.set_action_interpolation(action, interpolation)
        action["kyx_checkpoint"] = CHECKPOINT
        action["kyx_source_rev16_sha256"] = SOURCE_REV16_SHA256
        action["kyx_loop"] = output_name in LOOP_CLIPS
        action["kyx_candidate_only"] = True
        actions[output_name] = action
        records.append(
            {
                "name": output_name,
                "sourceClip": source_name,
                "frameRange": [start, end],
                "durationSeconds": round((end - start) / FPS, 6),
                "sampledEveryIntegerFrame": True,
                "interpolation": interpolation,
                "loop": output_name in LOOP_CLIPS,
                "fcurves": len(HELPERS.action_fcurves(action)),
            }
        )
    animation_data.action = None
    rig.animation_data_clear()
    animation_data = rig.animation_data_create()
    animation_data.use_nla = True
    for name, action in actions.items():
        start, end = [float(value) for value in action.frame_range]
        track = animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, int(math.floor(start)), action)
        strip.action_frame_start = start
        strip.action_frame_end = end
        strip.frame_start = start
        strip.frame_end = end
        strip.blend_type = "REPLACE"
        strip.extrapolation = "NOTHING"
    animation_data.action = None
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = max(
        int(round(action.frame_range[1])) for action in actions.values()
    )
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    return actions, records


def duplicate_decimated(
    source: bpy.types.Object, name: str, ratio: float, rig: bpy.types.Object
) -> bpy.types.Object:
    obj = source.copy()
    obj.data = source.data.copy()
    obj.name = name
    obj.data.name = name + "_MESH"
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = rig
    for modifier in list(obj.modifiers):
        if modifier.type == "ARMATURE":
            obj.modifiers.remove(modifier)
    ensure_active(obj)
    decimate = obj.modifiers.new(name="KYX_REV17_LOD_DECIMATE", type="DECIMATE")
    decimate.decimate_type = "COLLAPSE"
    decimate.ratio = ratio
    decimate.use_collapse_triangulate = True
    result = bpy.ops.object.modifier_apply(modifier=decimate.name)
    if "FINISHED" not in result:
        raise RuntimeError(f"Unable to apply decimation for {name}: {result}")
    ensure_active(obj)
    bpy.ops.object.vertex_group_limit_total(group_select_mode="ALL", limit=4)
    bpy.ops.object.vertex_group_normalize_all(
        group_select_mode="ALL", lock_active=False
    )
    armature = obj.modifiers.new("KYX_REV17_ARMATURE", "ARMATURE")
    armature.object = rig
    obj["kyx_checkpoint"] = CHECKPOINT
    obj["kyx_lod_source"] = source.name
    obj["kyx_lod_ratio"] = ratio
    return obj


def extract_subset(
    source: bpy.types.Object,
    name: str,
    rig: bpy.types.Object,
    predicate: Callable[[bpy.types.MeshPolygon], bool],
) -> bpy.types.Object:
    mesh = source.data
    selected = [polygon for polygon in mesh.polygons if predicate(polygon)]
    if not selected:
        raise RuntimeError(f"First-person subset {name} contains no polygons")
    vertices = []
    source_indices = []
    faces = []
    mapping = {}
    source_color = mesh.color_attributes.get("COLOR_0")
    face_colors = []
    for polygon in selected:
        face = []
        loop_colors = []
        for loop_index, source_index in zip(
            polygon.loop_indices, polygon.vertices
        ):
            destination = mapping.get(int(source_index))
            if destination is None:
                destination = len(vertices)
                mapping[int(source_index)] = destination
                vertices.append(tuple(mesh.vertices[source_index].co))
                source_indices.append(int(source_index))
            face.append(destination)
            loop_colors.append(
                tuple(source_color.data[loop_index].color)
                if source_color is not None
                else (0.1, 0.1, 0.1, 1.0)
            )
        faces.append(tuple(face))
        face_colors.append(loop_colors)
    target_mesh = bpy.data.meshes.new(name + "_MESH")
    target_mesh.from_pydata(vertices, [], faces)
    target_mesh.update()
    obj = bpy.data.objects.new(name, target_mesh)
    bpy.context.scene.collection.objects.link(obj)
    if source.material_slots and source.material_slots[0].material is not None:
        obj.data.materials.append(source.material_slots[0].material)
    obj.parent = rig
    armature = obj.modifiers.new("KYX_REV17_ARMATURE", "ARMATURE")
    armature.object = rig
    for group in source.vertex_groups:
        obj.vertex_groups.new(name=group.name)
    for destination, source_index in enumerate(source_indices):
        for item in mesh.vertices[source_index].groups:
            group = obj.vertex_groups.get(source.vertex_groups[item.group].name)
            if group is not None and item.weight > 0.0001:
                group.add([destination], item.weight, "REPLACE")
    color = ensure_color_attribute(target_mesh)
    for polygon, loop_colors in zip(target_mesh.polygons, face_colors):
        polygon.use_smooth = True
        for loop_index, rgba in zip(polygon.loop_indices, loop_colors):
            color.data[loop_index].color = rgba
    obj["kyx_checkpoint"] = CHECKPOINT
    obj["kyx_dedicated_first_person_geometry"] = True
    return obj


def maximum_polygon_group_weight(
    obj: bpy.types.Object, polygon: bpy.types.MeshPolygon, names: set[str]
) -> float:
    return max(
        group_weight(obj, obj.data.vertices[index], names)
        for index in polygon.vertices
    )


def exporter_kwargs(path: Path) -> dict[str, Any]:
    requested = {
        "filepath": str(path),
        "check_existing": False,
        "export_format": "GLB",
        "use_selection": True,
        "export_copyright": (
            "CC0 Blender Human Base Meshes anatomy; KYX-authored fitted armor, "
            "rig sockets, contact animation refinement, rifle treatment and LODs. "
            "Rev17 candidate only; non-default, non-release, visual review required."
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
    path: Path, rig: bpy.types.Object, meshes: list[bpy.types.Object]
) -> dict[str, Any]:
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [rig, *meshes]:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    result = bpy.ops.export_scene.gltf(**exporter_kwargs(path))
    if "FINISHED" not in result:
        raise RuntimeError(f"Export failed for {path}: {result}")
    parsed = HELPERS.parse_glb(path)
    return {
        "path": str(path),
        "operatorResult": sorted(result),
        "sha256": parsed["sha256"],
        "bytes": parsed["bytes"],
        "counts": parsed["counts"],
        "primitives": parsed["primitives"],
        "animations": parsed["animations"],
        "externalUris": parsed["externalUris"],
    }


def fresh_reimport(
    path: Path, proof_path: Path | None = None
) -> dict[str, Any]:
    source_sha = HELPERS.sha256(path)
    source_bytes = path.stat().st_size
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(path))
    if "FINISHED" not in result:
        raise RuntimeError(f"Fresh reimport failed for {path}: {result}")
    helpers = [
        obj for obj in bpy.data.objects if HELPERS.importer_helper(obj)
    ]
    meshes = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH" and obj not in helpers
    ]
    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    rig = max(rigs, key=lambda item: len(item.data.bones), default=None)
    actions = sorted(action.name for action in bpy.data.actions)
    if not meshes or rig is None:
        raise RuntimeError(f"Fresh reimport lacks runtime content: {path}")
    minimum = Vector(
        tuple(
            min((obj.matrix_world @ Vector(corner))[axis] for obj in meshes for corner in obj.bound_box)
            for axis in range(3)
        )
    )
    maximum = Vector(
        tuple(
            max((obj.matrix_world @ Vector(corner))[axis] for obj in meshes for corner in obj.bound_box)
            for axis in range(3)
        )
    )
    sockets = sorted(
        bone.name for bone in rig.data.bones if bone.name.startswith("socket_")
    )
    if proof_path is not None:
        proof_path.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(
            filepath=str(proof_path), check_existing=False, compress=True
        )
    unchanged = (
        HELPERS.sha256(path) == source_sha and path.stat().st_size == source_bytes
    )
    return {
        "path": str(path),
        "operatorResult": sorted(result),
        "sourceUnchangedDuringReimport": unchanged,
        "runtimeMeshes": sorted(obj.name for obj in meshes),
        "excludedImporterHelpers": sorted(obj.name for obj in helpers),
        "armature": rig.name,
        "boneCount": len(rig.data.bones),
        "socketBones": sockets,
        "actions": actions,
        "bounds": {
            "minimum": [round(float(value), 6) for value in minimum],
            "maximum": [round(float(value), 6) for value in maximum],
            "dimensions": [
                round(float(maximum[axis] - minimum[axis]), 6)
                for axis in range(3)
            ],
        },
    }


def main() -> None:
    (
        rev16_path,
        v6a_path,
        rev14_blend,
        master_path,
        lod0_path,
        lod1_path,
        lod2_path,
        fp_path,
        proof_path,
        audit_path,
    ) = script_args()
    for path in (
        master_path,
        lod0_path,
        lod1_path,
        lod2_path,
        fp_path,
        proof_path,
        audit_path,
    ):
        path.parent.mkdir(parents=True, exist_ok=True)
    rev13_armor_blend = (
        rev14_blend.parent.parent
        / "v6b-production-rev13"
        / "kyx_vanguard_v6b_production_sculpt_rev13.blend"
    )
    rev13_gameplay_glb = (
        rev14_blend.parent.parent
        / "v6c-gameplay-rev13"
        / "export"
        / "kyx-v6c-gameplay-rev13.runtime-candidate.glb"
    )
    source_hashes_before = {
        "rev16Glb": HELPERS.sha256(rev16_path),
        "v6aBlend": HELPERS.sha256(v6a_path),
        "rev14Blend": HELPERS.sha256(rev14_blend),
        "rev13GameplayGlb": HELPERS.sha256(rev13_gameplay_glb),
        "rev13ArmorBlend": HELPERS.sha256(rev13_armor_blend),
    }
    if (
        source_hashes_before["rev16Glb"] != SOURCE_REV16_SHA256
        or rev16_path.stat().st_size != SOURCE_REV16_BYTES
        or source_hashes_before["v6aBlend"] != SOURCE_V6A_SHA256
        or source_hashes_before["rev14Blend"] != SOURCE_REV14_BLEND_SHA256
        or source_hashes_before["rev13GameplayGlb"]
        != SOURCE_REV13_GAMEPLAY_SHA256
        or rev13_gameplay_glb.stat().st_size != SOURCE_REV13_GAMEPLAY_BYTES
        or source_hashes_before["rev13ArmorBlend"]
        != SOURCE_REV13_ARMOR_BLEND_SHA256
    ):
        raise RuntimeError(f"Pinned Rev17 inputs do not match: {source_hashes_before}")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    imported = bpy.ops.import_scene.gltf(filepath=str(rev16_path))
    if "FINISHED" not in imported:
        raise RuntimeError(f"Unable to import rejected Rev16 source: {imported}")
    bpy.context.scene.render.fps = FPS
    rig = max(
        (obj for obj in bpy.data.objects if obj.type == "ARMATURE"),
        key=lambda item: len(item.data.bones),
        default=None,
    )
    if rig is None or len(rig.data.bones) != 52:
        raise RuntimeError("Rejected Rev16 source does not contain the 52-bone rig")
    source_actions = {action.name: action for action in bpy.data.actions}
    if set(source_actions) != set(SOURCE_CLIPS):
        raise RuntimeError(f"Rev16 source clip contract changed: {source_actions}")
    samples = sample_source_actions(rig, source_actions)
    runtime_meshes = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH" and not HELPERS.importer_helper(obj)
    ]
    rifle = next((obj for obj in runtime_meshes if "RIFLE" in obj.name.upper()), None)
    rejected_meshes = [obj for obj in runtime_meshes if obj is not rifle]
    if rifle is None or len(rejected_meshes) != 2:
        raise RuntimeError("Unable to resolve rejected Rev16 mesh roles")
    for obj in rejected_meshes:
        bpy.data.objects.remove(obj, do_unlink=True)

    body, clean_anatomy_audit = import_clean_v6a_anatomy(v6a_path, rig)
    body.name = "KYX_REV17_LOD0_CONTINUOUS_HUMAN_UNDERSUIT"
    body.data.name = body.name + "_MESH"
    athletic_proportion_audit = author_athletic_suit_proportions(body)
    heat_weight_audit = author_spatially_separated_heat_weights(body, rig)
    if (
        heat_weight_audit["unweightedOrUnderweightedVertices"] != 0
        or heat_weight_audit["maximumInfluences"] > 4
        or not heat_weight_audit["temporarySolveRigRemoved"]
        or not heat_weight_audit["authoredRestCoordinatesRestoredExactly"]
    ):
        raise RuntimeError(
            f"Rev17 spatially separated heat solve failed: {heat_weight_audit}"
        )
    pelvis_weight_audit = stabilize_pelvis_weights(body)
    weight_audit = prepare_preserved_weighted_body(body, rig)
    weight_audit["cleanAnatomyImport"] = clean_anatomy_audit
    weight_audit["athleticSuitProportionRefinement"] = athletic_proportion_audit
    weight_audit["spatiallySeparatedHeatSolve"] = heat_weight_audit
    weight_audit["pelvisStabilization"] = pelvis_weight_audit
    if (
        weight_audit["unweightedOrUnderweightedVertices"] != 0
        or weight_audit["maximumInfluences"] > 4
    ):
        raise RuntimeError(f"Rev17 body weight audit failed: {weight_audit}")

    body_material = make_vertex_color_material(
        "KYX_REV17_UNDERSUIT_VERTEX_COLOR", metallic=0.02, roughness=0.78
    )
    body.data.materials.clear()
    body.data.materials.append(body_material)
    body_color_bands = color_body(body)
    armor_material = make_vertex_color_material(
        "KYX_REV17_FITTED_ARMOR_VERTEX_COLOR", metallic=0.34, roughness=0.39
    )
    authored_hard_surface, armor_regions = build_rev13_authored_armor(
        rev13_armor_blend, rig, armor_material
    )
    fitted_surface, fitted_surface_regions = build_clean_procedural_armor(
        rig, armor_material
    )
    armor, combined_armor_audit = join_armor_layers(
        authored_hard_surface, fitted_surface, rig, armor_material
    )
    armor_regions["cleanAuthoredProfilePanels"] = fitted_surface_regions
    armor_regions["combinedArmor"] = combined_armor_audit
    rifle.name = "KYX_REV17_LOD0_COMPACT_RIFLE"
    rifle.data.name = rifle.name + "_MESH"
    rifle_profile_audit = compact_rifle_profile(rifle)
    rifle_material = make_vertex_color_material(
        "KYX_REV17_RIFLE_VERTEX_COLOR", metallic=0.48, roughness=0.33
    )
    rifle.data.materials.clear()
    rifle.data.materials.append(rifle_material)
    rifle_color_bands = recolor_rifle(rifle)
    sockets = add_socket_bones(rig, rifle)
    rig.name = "KYX_REV17_RIG_66_JOINT_WITH_SOCKETS"
    actions, action_records = rebuild_actions(rig, samples)

    for role, obj in (("body", body), ("armor", armor), ("rifle", rifle)):
        obj["kyx_checkpoint"] = CHECKPOINT
        obj["kyx_role"] = role
        obj["kyx_candidate_only"] = True
        obj["kyx_non_default_non_release"] = True
        obj["kyx_visual_acceptance"] = "REQUIRED"
    rig["kyx_checkpoint"] = CHECKPOINT
    rig["kyx_candidate_only"] = True
    rig["kyx_non_default_non_release"] = True
    rig["kyx_visual_acceptance"] = "REQUIRED"
    rig["kyx_first_person_geometry"] = "DEDICATED_EXPORT_INCLUDED"
    bpy.context.scene["kyx_checkpoint"] = CHECKPOINT
    bpy.context.scene["kyx_candidate_only"] = True
    bpy.context.scene["kyx_default_promotion"] = False
    bpy.context.scene["kyx_visual_acceptance"] = "REQUIRED"

    lod1_body = duplicate_decimated(
        body, "KYX_REV17_LOD1_CONTINUOUS_HUMAN_UNDERSUIT", 0.40, rig
    )
    lod1_armor = duplicate_decimated(
        armor, "KYX_REV17_LOD1_FITTED_ARMOR", 0.42, rig
    )
    lod1_rifle = duplicate_decimated(
        rifle, "KYX_REV17_LOD1_COMPACT_RIFLE", 0.50, rig
    )
    lod2_body = duplicate_decimated(
        body, "KYX_REV17_LOD2_CONTINUOUS_HUMAN_UNDERSUIT", 0.15, rig
    )
    lod2_armor = duplicate_decimated(
        armor, "KYX_REV17_LOD2_FITTED_ARMOR", 0.16, rig
    )
    lod2_rifle = duplicate_decimated(
        rifle, "KYX_REV17_LOD2_COMPACT_RIFLE", 0.20, rig
    )
    fp_body = extract_subset(
        body,
        "KYX_REV17_FP_ARMS_GLOVES",
        rig,
        lambda polygon: (
            maximum_polygon_group_weight(body, polygon, ARM) > 0.22
            and polygon.center.z > 0.72
        )
        or (
            polygon_weight(body, polygon, {"spine_01", "spine_02", "chest"})
            > 0.44
            and polygon.center.z > 0.98
        ),
    )
    for modifier in list(fp_body.modifiers):
        if modifier.type == "ARMATURE":
            fp_body.modifiers.remove(modifier)
    ensure_active(fp_body)
    fp_subdivision = fp_body.modifiers.new(
        "KYX_REV17_FP_CONTACT_SURFACE_SUBDIVISION", "SUBSURF"
    )
    fp_subdivision.subdivision_type = "SIMPLE"
    fp_subdivision.levels = 1
    fp_subdivision.render_levels = 1
    applied_fp_subdivision = bpy.ops.object.modifier_apply(
        modifier=fp_subdivision.name
    )
    if "FINISHED" not in applied_fp_subdivision:
        raise RuntimeError(
            "Unable to apply dedicated first-person contact-surface subdivision: "
            f"{applied_fp_subdivision}"
        )
    fp_budget_decimate = fp_body.modifiers.new(
        "KYX_REV17_FP_CONTACT_SURFACE_BUDGET", "DECIMATE"
    )
    fp_budget_decimate.decimate_type = "COLLAPSE"
    fp_budget_decimate.ratio = 0.82
    fp_budget_decimate.use_collapse_triangulate = True
    applied_fp_budget = bpy.ops.object.modifier_apply(
        modifier=fp_budget_decimate.name
    )
    if "FINISHED" not in applied_fp_budget:
        raise RuntimeError(
            "Unable to budget dedicated first-person contact surface: "
            f"{applied_fp_budget}"
        )
    fp_body_armature = fp_body.modifiers.new(
        "KYX_REV17_ARMATURE", "ARMATURE"
    )
    fp_body_armature.object = rig
    fp_body["kyx_first_person_contact_surface_subdivision"] = (
        "SIMPLE_LEVEL_1_THEN_BOUNDED_0_82_COLLAPSE"
    )
    fp_armor = extract_subset(
        armor,
        "KYX_REV17_FP_ARMOR_SLEEVES",
        rig,
        lambda polygon: maximum_polygon_group_weight(armor, polygon, ARM) > 0.22
        or (
            polygon_weight(armor, polygon, {"spine_01", "spine_02", "chest"})
            > 0.44
            and polygon.center.z > 0.98
        ),
    )
    fp_rifle = rifle.copy()
    fp_rifle.data = rifle.data.copy()
    fp_rifle.name = "KYX_REV17_FP_COMPACT_RIFLE"
    fp_rifle.data.name = fp_rifle.name + "_MESH"
    bpy.context.scene.collection.objects.link(fp_rifle)
    fp_rifle.parent = rig
    for modifier in fp_rifle.modifiers:
        if modifier.type == "ARMATURE":
            modifier.object = rig
    fp_rifle["kyx_checkpoint"] = CHECKPOINT
    fp_rifle["kyx_dedicated_first_person_geometry"] = True
    fp_geometry_names = [fp_body.name, fp_armor.name, fp_rifle.name]

    for obj in [
        body,
        armor,
        rifle,
        lod1_body,
        lod1_armor,
        lod1_rifle,
        lod2_body,
        lod2_armor,
        lod2_rifle,
        fp_body,
        fp_armor,
        fp_rifle,
    ]:
        obj.hide_set(False)
        obj.hide_viewport = False
    bpy.ops.wm.save_as_mainfile(
        filepath=str(master_path), check_existing=False, compress=True
    )
    master_hash = HELPERS.sha256(master_path)

    exports = {
        "lod0": export_variant(lod0_path, rig, [body, armor, rifle]),
        "lod1": export_variant(
            lod1_path, rig, [lod1_body, lod1_armor, lod1_rifle]
        ),
        "lod2": export_variant(
            lod2_path, rig, [lod2_body, lod2_armor, lod2_rifle]
        ),
        "firstPerson": export_variant(
            fp_path, rig, [fp_body, fp_armor, fp_rifle]
        ),
    }
    source_hashes_after = {
        "rev16Glb": HELPERS.sha256(rev16_path),
        "v6aBlend": HELPERS.sha256(v6a_path),
        "rev14Blend": HELPERS.sha256(rev14_blend),
        "rev13GameplayGlb": HELPERS.sha256(rev13_gameplay_glb),
        "rev13ArmorBlend": HELPERS.sha256(rev13_armor_blend),
    }
    reimports = {
        "lod0": fresh_reimport(lod0_path, proof_path),
        "lod1": fresh_reimport(lod1_path),
        "lod2": fresh_reimport(lod2_path),
        "firstPerson": fresh_reimport(fp_path),
    }
    required_sockets = sorted(name for name, _ in SOCKET_SPECS)
    assertions = {
        "pinnedInputsUnchanged": source_hashes_before == source_hashes_after,
        "sourceBlendPreserved": master_path.is_file(),
        "fourGlbsExported": all(Path(item["path"]).is_file() for item in exports.values()),
        "allGlbsSelfContained": all(not item["externalUris"] for item in exports.values()),
        "allGlbsHaveThreePrimitives": all(
            item["counts"]["meshes"] == 3 and item["counts"]["primitives"] == 3
            for item in exports.values()
        ),
        "allGlbsHaveOneSkin": all(
            item["counts"]["skins"] == 1 for item in exports.values()
        ),
        "allGlbsHaveRequiredClips": all(
            set(item["actions"]) == set(ALL_CLIP_MAP) for item in reimports.values()
        ),
        "allGlbsHaveRequiredSockets": all(
            set(item["socketBones"]) == set(required_sockets)
            for item in reimports.values()
        ),
        "allFreshReimportsPreserveSource": all(
            item["sourceUnchangedDuringReimport"] for item in reimports.values()
        ),
        "humanScaleWithinContract": 1.70
        <= reimports["lod0"]["bounds"]["dimensions"][2]
        <= 2.15,
        "lodTriangleOrdering": (
            exports["lod0"]["counts"]["triangles"]
            > exports["lod1"]["counts"]["triangles"]
            > exports["lod2"]["counts"]["triangles"]
        ),
        "lod0TriangleBudget": 25_000
        <= exports["lod0"]["counts"]["triangles"]
        <= 45_000,
        "lod1TriangleBudget": 12_000
        <= exports["lod1"]["counts"]["triangles"]
        <= 22_000,
        "lod2TriangleBudget": 4_000
        <= exports["lod2"]["counts"]["triangles"]
        <= 8_500,
        "firstPersonTriangleBudget": 15_000
        <= exports["firstPerson"]["counts"]["triangles"]
        <= 30_000,
    }
    report = {
        "schema": "kyx-g6-rev17-character-author-export-audit-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "status": STATUS if all(assertions.values()) else "REV17_PIPELINE_ASSERTION_FAILURE",
        "candidateDisposition": {
            "default": False,
            "releaseEligible": False,
            "g6Accepted": False,
            "humanVisualReviewRequired": True,
            "rev15AndRev16RemainRejectedAndNonDefault": True,
        },
        "sources": {
            "rev16RejectedGlb": {
                "path": str(rev16_path),
                "sha256": SOURCE_REV16_SHA256,
                "bytes": SOURCE_REV16_BYTES,
                "use": "rig, embedded contact/action sampling, rifle topology only",
            },
            "v6aCc0Anatomy": {
                "path": str(v6a_path),
                "sha256": SOURCE_V6A_SHA256,
                "use": "preserved clean CC0 anatomy reference; not mutated",
            },
            "rev14WeightedBody": {
                "path": str(rev14_blend),
                "sha256": SOURCE_REV14_BLEND_SHA256,
                "use": (
                    "preserved prior weighted retopology reference; not used as "
                    "Rev17 visible surface because joined soft islands tore visually"
                ),
            },
            "rev13WeightedAnatomy": {
                "path": str(rev13_gameplay_glb),
                "sha256": SOURCE_REV13_GAMEPLAY_SHA256,
                "bytes": SOURCE_REV13_GAMEPLAY_BYTES,
                "use": (
                    "separately weighted clean CC0 anatomy island, reduced before "
                    "armature and used as the continuous visible Rev17 body"
                ),
            },
            "rev13AuthoredArmor": {
                "path": str(rev13_armor_blend),
                "sha256": SOURCE_REV13_ARMOR_BLEND_SHA256,
                "use": (
                    "evaluated fitted helmet, boots, torso and limb armor "
                    "components, rigidly assigned by declared bone role"
                ),
            },
            "hashesBefore": source_hashes_before,
            "hashesAfter": source_hashes_after,
        },
        "authoring": {
            "masterBlend": {
                "path": str(master_path),
                "sha256": master_hash,
                "bytes": master_path.stat().st_size,
            },
            "weightTransfer": weight_audit,
            "bodyColorBands": body_color_bands,
            "fittedArmorRegions": armor_regions,
            "compactRifleProfile": rifle_profile_audit,
            "rifleColorBands": rifle_color_bands,
            "socketBones": sockets,
            "armatureBoneCount": 52 + len(sockets),
            "actions": action_records,
            "firstPersonPlan": {
                "dedicatedGeometry": True,
                "geometry": fp_geometry_names,
                "clips": sorted(FP_CLIP_MAP),
                "runtimeIntent": (
                    "Opt-in M4 viewmodel replacement under ?g6Candidate=rev17; "
                    "no default/public asset replacement."
                ),
            },
        },
        "exports": exports,
        "freshReimports": reimports,
        "assertions": assertions,
        "nonClaims": [
            "Structural success does not grant G6 or human visual acceptance.",
            "Static and sampled render evidence cannot prove every-frame clipping freedom.",
            "Rev17 is candidate-only and is not promoted to public/soldier.glb.",
            "Enemy tinting and runtime population require separate opt-in integration evidence.",
            "Rev15 and Rev16 remain rejected evidence and are not modified by this script.",
        ],
    }
    audit_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "status": report["status"],
                "masterBlend": str(master_path),
                "exports": {
                    key: {
                        "triangles": value["counts"]["triangles"],
                        "sha256": value["sha256"],
                    }
                    for key, value in exports.items()
                },
                "assertions": assertions,
                "audit": str(audit_path),
            },
            indent=2,
        )
    )
    if not all(assertions.values()):
        raise RuntimeError(f"Rev17 author/export assertions failed: {assertions}")


if __name__ == "__main__":
    main()
