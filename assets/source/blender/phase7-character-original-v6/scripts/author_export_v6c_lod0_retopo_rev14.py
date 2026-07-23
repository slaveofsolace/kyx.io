from __future__ import annotations

import hashlib
import json
import math
import struct
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import bpy
from mathutils import Matrix, Vector


CHECKPOINT = "V6C_LOD0_SEMANTIC_RETOPO_CANDIDATE_REV14"
SOURCE_REV13_SHA256 = "0688a781def693ebf0f4aa49eb76c32c458b83e786fbbdebadafb76022f39fee"
SOURCE_REV13_GLTF_TRIANGLES = 297996
SOURCE_REV13_BLENDER_TRIANGLES = 298076
EXPECTED_BONES = 52
FPS = 24
CONTACT_TOLERANCE = 1.0e-4
CONTACT_ATTRIBUTE = "_KYX_CONTACT_MASK"
EXPECTED_CLIPS = (
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
LOOP_CLIPS = {
    "KYX_V6C_TP_IDLE",
    "KYX_V6C_TP_WALK",
    "KYX_V6C_TP_RUN",
    "KYX_V6C_TP_AIRBORNE_LOOP",
}
ROLE_TARGETS = {"soft": 20000, "hard": 15000, "rifle": 7000}
SUBGROUP_TARGETS = {
    "soft_body": 10000,
    "soft_main_undersuit": 8000,
    "soft_secondary": 2000,
    "hard_helmet": 6500,
    "hard_boots": 3000,
    "hard_torso": 5500,
}
HARD_TRIANGLE_LIMIT = 45000
AUTHOR_TRIANGLE_TARGET = 42000


def script_args() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <rev13.glb> <candidate.blend> <rev14.glb> "
            "<reimport.blend> <audit.json>"
        )
    args = sys.argv[sys.argv.index("--") + 1 :]
    if len(args) != 5:
        raise SystemExit(f"Expected five arguments, got {len(args)}")
    return args


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def triangle_count_mesh(mesh: bpy.types.Mesh) -> int:
    mesh.calc_loop_triangles()
    return len(mesh.loop_triangles)


def triangle_count_object(obj: bpy.types.Object) -> int:
    return triangle_count_mesh(obj.data)


def flatten_matrix(matrix: Matrix) -> list[float]:
    return [float(value) for row in matrix for value in row]


def max_delta(left: list[float], right: list[float]) -> float:
    return max(abs(a - b) for a, b in zip(left, right))


def world_bone_matrix(rig: bpy.types.Object, bone_name: str) -> Matrix:
    return rig.matrix_world @ rig.pose.bones[bone_name].matrix


def palm_relation(rig: bpy.types.Object) -> list[float]:
    right = world_bone_matrix(rig, "palm.R")
    left = world_bone_matrix(rig, "palm.L")
    return flatten_matrix(right.inverted_safe() @ left)


def pose_snapshot(rig: bpy.types.Object) -> dict[str, list[float]]:
    return {bone.name: flatten_matrix(bone.matrix) for bone in rig.pose.bones}


def classify_role(name: str) -> str:
    if "RuntimeContact_" in name or "Rifle_" in name:
        return "rifle"
    if "AnatomySculpt" in name or "Undersuit" in name or "TailoredOnePiece" in name:
        return "soft"
    return "hard"


def classify_subgroup(name: str) -> str:
    role = classify_role(name)
    if role == "soft":
        if "AnatomySculpt" in name:
            return "soft_body"
        if "TailoredOnePiece" in name:
            return "soft_main_undersuit"
        return "soft_secondary"
    if role == "hard":
        if "Helmet" in name or "Visor" in name:
            return "hard_helmet"
        if "Boot_" in name:
            return "hard_boots"
        return "hard_torso"
    return "rifle_contact" if "RuntimeContact_" in name else "rifle_other"


def allocate_targets(
    objects: list[bpy.types.Object], budget: int, minimum: int = 4
) -> dict[str, int]:
    ordered = sorted(objects, key=lambda obj: obj.name)
    source = {obj.name: triangle_count_object(obj) for obj in ordered}
    if not ordered:
        if budget:
            raise RuntimeError(f"No objects available for nonzero budget {budget}")
        return {}
    if sum(source.values()) <= budget:
        return dict(source)
    raw_total = float(sum(source.values()))
    targets = {
        name: min(tris, max(minimum, int(math.floor(budget * tris / raw_total))))
        for name, tris in source.items()
    }
    current = sum(targets.values())
    # Deterministically spend any rounding remainder on the largest source islands.
    while current < budget:
        candidates = [
            name for name in source if targets[name] < source[name]
        ]
        if not candidates:
            break
        name = max(candidates, key=lambda item: (source[item] - targets[item], item))
        targets[name] += 1
        current += 1
    while current > budget:
        candidates = [name for name in source if targets[name] > minimum]
        if not candidates:
            break
        name = max(candidates, key=lambda item: (targets[item], source[item], item))
        targets[name] -= 1
        current -= 1
    if sum(targets.values()) > budget:
        raise RuntimeError(f"Unable to allocate {budget} triangles across {len(objects)} islands")
    return targets


def select_only(obj: bpy.types.Object) -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    for collection in obj.users_collection:
        collection.hide_select = False
        collection.hide_viewport = False
    obj.hide_set(False)
    obj.hide_viewport = False
    obj.hide_select = False
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def reduce_object(obj: bpy.types.Object, target: int) -> dict[str, Any]:
    before = triangle_count_object(obj)
    if target >= before:
        return {
            "object": obj.name,
            "role": classify_role(obj.name),
            "subgroup": classify_subgroup(obj.name),
            "sourceTriangles": before,
            "allocatedTarget": target,
            "resultTriangles": before,
            "passes": 0,
            "method": "preserved_source_island",
        }
    if target < 4:
        raise RuntimeError(f"Target below four triangles for {obj.name}: {target}")

    passes = 0
    current = before
    while current > target and passes < 3:
        select_only(obj)
        modifier = obj.modifiers.new(name=f"KYX_SEMANTIC_RETOPO_{passes + 1}", type="DECIMATE")
        # Evaluate reduction before the live armature so no gameplay pose is baked.
        while obj.modifiers.find(modifier.name) > 0:
            bpy.ops.object.modifier_move_up(modifier=modifier.name)
        modifier.decimate_type = "COLLAPSE"
        modifier.ratio = max(0.005, min(0.999, (target / current) * 0.995))
        modifier.use_collapse_triangulate = True
        modifier.use_symmetry = (
            "AnatomySculpt" in obj.name or "TailoredOnePiece" in obj.name
        )
        modifier.symmetry_axis = "X"
        result = bpy.ops.object.modifier_apply(modifier=modifier.name)
        if "FINISHED" not in result:
            raise RuntimeError(f"Semantic reduction failed for {obj.name}: {result}")
        obj.data.update()
        next_count = triangle_count_object(obj)
        passes += 1
        if next_count >= current:
            break
        current = next_count
    if current > max(target + 8, int(target * 1.04)):
        raise RuntimeError(
            f"Semantic reduction missed allocation for {obj.name}: {current} > {target}"
        )
    return {
        "object": obj.name,
        "role": classify_role(obj.name),
        "subgroup": classify_subgroup(obj.name),
        "sourceTriangles": before,
        "allocatedTarget": target,
        "resultTriangles": current,
        "passes": passes,
        "method": "per_island_semantic_quadric_collapse_before_armature",
    }


def ensure_contact_attribute(obj: bpy.types.Object, is_contact: bool) -> None:
    attribute = obj.data.attributes.get(CONTACT_ATTRIBUTE)
    if attribute is None:
        attribute = obj.data.attributes.new(
            name=CONTACT_ATTRIBUTE, type="FLOAT", domain="POINT"
        )
    value = 1.0 if is_contact else 0.0
    for datum in attribute.data:
        datum.value = value


def contact_points_from_objects(objects: list[bpy.types.Object]) -> list[tuple[float, float, float]]:
    result = []
    for obj in objects:
        world = obj.matrix_world
        attribute = obj.data.attributes.get(CONTACT_ATTRIBUTE)
        if attribute is None:
            continue
        for index, datum in enumerate(attribute.data):
            if float(datum.value) > 0.5:
                point = world @ obj.data.vertices[index].co
                result.append((float(point.x), float(point.y), float(point.z)))
    return sorted(result)


def point_cloud_delta(
    left: list[tuple[float, float, float]],
    right: list[tuple[float, float, float]],
) -> float:
    if len(left) != len(right):
        return math.inf
    return max(
        (max(abs(a - b) for a, b in zip(lp, rp)) for lp, rp in zip(left, right)),
        default=0.0,
    )


def make_role_material(role: str) -> bpy.types.Material:
    material = bpy.data.materials.new(f"KYX_V6C_LOD0_{role.upper()}_ATLAS_ROLE")
    material.use_nodes = True
    material.diffuse_color = (1.0, 1.0, 1.0, 1.0)
    material.surface_render_method = "DITHERED"
    material.use_transparency_overlap = False
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (1.0, 1.0, 1.0, 1.0)
        bsdf.inputs["Roughness"].default_value = {
            "soft": 0.78,
            "hard": 0.42,
            "rifle": 0.36,
        }[role]
        bsdf.inputs["Metallic"].default_value = {
            "soft": 0.05,
            "hard": 0.36,
            "rifle": 0.55,
        }[role]
    material["kyx_atlas_role"] = role
    material["kyx_candidate_only"] = True
    return material


def add_source_material_colors(obj: bpy.types.Object) -> None:
    mesh = obj.data
    old = mesh.color_attributes.get("COLOR_0")
    if old:
        mesh.color_attributes.remove(old)
    attribute = mesh.color_attributes.new(
        name="COLOR_0", type="FLOAT_COLOR", domain="CORNER"
    )
    for polygon in mesh.polygons:
        material = None
        if polygon.material_index < len(obj.material_slots):
            material = obj.material_slots[polygon.material_index].material
        color = tuple(material.diffuse_color) if material else (0.5, 0.5, 0.5, 1.0)
        for loop_index in polygon.loop_indices:
            attribute.data[loop_index].color = color
    mesh.color_attributes.active_color_index = mesh.color_attributes.find(attribute.name)
    mesh.color_attributes.render_color_index = mesh.color_attributes.find(attribute.name)


def smart_uv(obj: bpy.types.Object) -> None:
    select_only(obj)
    if not obj.data.uv_layers:
        obj.data.uv_layers.new(name="UV0")
    else:
        obj.data.uv_layers.active.name = "UV0"
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    result = bpy.ops.uv.smart_project(
        angle_limit=math.radians(66.0),
        island_margin=0.006,
        area_weight=0.15,
        correct_aspect=True,
        scale_to_bounds=True,
    )
    bpy.ops.object.mode_set(mode="OBJECT")
    if "FINISHED" not in result:
        raise RuntimeError(f"UV0 smart projection failed for {obj.name}: {result}")


def normalize_and_limit_weights(
    obj: bpy.types.Object, bone_names: set[str], force_palm: bool = False
) -> dict[str, Any]:
    if force_palm:
        obj.vertex_groups.clear()
        palm = obj.vertex_groups.new(name="palm.R")
        palm.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
        return {
            "vertices": len(obj.data.vertices),
            "zeroWeightVertices": 0,
            "maximumInfluences": 1,
            "weightedGroups": ["palm.R"],
        }

    zero = 0
    maximum = 0
    for vertex in obj.data.vertices:
        assignments = [
            (assignment.group, float(assignment.weight))
            for assignment in vertex.groups
            if assignment.group < len(obj.vertex_groups)
            and obj.vertex_groups[assignment.group].name in bone_names
            and assignment.weight > 1.0e-8
        ]
        assignments.sort(key=lambda item: item[1], reverse=True)
        keep = assignments[:4]
        keep_indices = {index for index, _ in keep}
        for group_index, _ in assignments[4:]:
            obj.vertex_groups[group_index].remove([vertex.index])
        total = sum(weight for _, weight in keep)
        if total <= 1.0e-8:
            zero += 1
            root = obj.vertex_groups.get("root") or obj.vertex_groups.new(name="root")
            root.add([vertex.index], 1.0, "REPLACE")
            maximum = max(maximum, 1)
            continue
        for group_index, weight in keep:
            obj.vertex_groups[group_index].add(
                [vertex.index], weight / total, "REPLACE"
            )
        maximum = max(maximum, len(keep_indices))
    weighted_groups = sorted(
        {
            obj.vertex_groups[assignment.group].name
            for vertex in obj.data.vertices
            for assignment in vertex.groups
            if assignment.weight > 1.0e-6
            and assignment.group < len(obj.vertex_groups)
            and obj.vertex_groups[assignment.group].name in bone_names
        }
    )
    return {
        "vertices": len(obj.data.vertices),
        "zeroWeightVertices": zero,
        "maximumInfluences": maximum,
        "weightedGroups": weighted_groups,
    }


def join_role(
    role: str,
    objects: list[bpy.types.Object],
    material: bpy.types.Material,
    rig: bpy.types.Object,
    bone_names: set[str],
) -> tuple[bpy.types.Object, dict[str, Any]]:
    if not objects:
        raise RuntimeError(f"Role {role} has no surviving objects")
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    ordered = sorted(objects, key=lambda item: item.name)
    for obj in ordered:
        for collection in obj.users_collection:
            collection.hide_select = False
            collection.hide_viewport = False
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_select = False
        obj.select_set(True)
    active = ordered[0]
    bpy.context.view_layer.objects.active = active
    active.select_set(True)
    bpy.context.view_layer.update()
    if not active.select_get() or active.type != "MESH":
        raise RuntimeError(f"Role {role} active mesh could not be selected: {active.name}")
    result = bpy.ops.object.join()
    if "FINISHED" not in result:
        raise RuntimeError(f"Join failed for role {role}: {result}")
    joined = bpy.context.object
    joined.name = f"KYX_V6C_LOD0_{role.upper()}_REV14"
    joined.data.name = f"{joined.name}_MESH"
    # The glTF exporter only treats a selected mesh as part of the selected skin
    # when the armature is its object parent.  Source islands are inconsistently
    # parented, so joining can leave the hard role unparented depending on which
    # island becomes active.  Normalize all three roles while preserving world
    # space so this never depends on source ordering.
    world_matrix = joined.matrix_world.copy()
    joined.parent = rig
    joined.matrix_world = world_matrix
    add_source_material_colors(joined)
    joined.data.materials.clear()
    joined.data.materials.append(material)
    for polygon in joined.data.polygons:
        polygon.material_index = 0
        polygon.use_smooth = True
    if not any(modifier.type == "ARMATURE" for modifier in joined.modifiers):
        modifier = joined.modifiers.new(name="KYX_V6C_LOD0_ARMATURE", type="ARMATURE")
        modifier.object = rig
    smart_uv(joined)
    weights = normalize_and_limit_weights(
        joined, bone_names, force_palm=(role == "rifle")
    )
    joined["kyx_checkpoint"] = CHECKPOINT
    joined["kyx_atlas_role"] = role
    joined["kyx_non_default_non_release_not_g6"] = True
    joined["kyx_source_rev13_sha256"] = SOURCE_REV13_SHA256
    joined.data.update()
    return joined, {
        "role": role,
        "object": joined.name,
        "triangles": triangle_count_object(joined),
        "vertices": len(joined.data.vertices),
        "polygons": len(joined.data.polygons),
        "materials": len(joined.data.materials),
        "uvLayers": [layer.name for layer in joined.data.uv_layers],
        "colorAttributes": [attribute.name for attribute in joined.data.color_attributes],
        "weights": weights,
    }


def rebuild_nla(rig: bpy.types.Object, actions: dict[str, bpy.types.Action]) -> None:
    if rig.animation_data:
        rig.animation_data_clear()
    animation_data = rig.animation_data_create()
    animation_data.use_nla = True
    for name in EXPECTED_CLIPS:
        action = actions[name]
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


def exporter_kwargs(path: Path) -> dict[str, Any]:
    requested = {
        "filepath": str(path),
        "check_existing": False,
        "export_format": "GLB",
        "use_selection": True,
        "export_copyright": (
            "Includes CC0-derived Blender Human Base Meshes anatomy; "
            "KYX-authored design, rig, materials, semantic LOD0 retopology, "
            "rifle, and gameplay-animation candidate. Non-default, non-release, not G6."
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
        "export_def_bones": True,
        "export_leaf_bone": False,
        "export_lights": False,
    }
    available = {
        prop.identifier for prop in bpy.ops.export_scene.gltf.get_rna_type().properties
    }
    return {key: value for key, value in requested.items() if key in available}


def parse_glb(path: Path) -> dict[str, Any]:
    payload = path.read_bytes()
    magic, version, declared_length = struct.unpack_from("<4sII", payload, 0)
    if magic != b"glTF" or version != 2 or declared_length != len(payload):
        raise RuntimeError("Invalid GLB header")
    json_length, json_type = struct.unpack_from("<II", payload, 12)
    if json_type != 0x4E4F534A:
        raise RuntimeError("GLB first chunk is not JSON")
    document = json.loads(payload[20 : 20 + json_length].decode("utf-8"))
    accessors = document.get("accessors", [])
    material_names = [material.get("name") for material in document.get("materials", [])]
    primitive_records = []
    total_triangles = 0
    for mesh_index, mesh in enumerate(document.get("meshes", [])):
        for primitive_index, primitive in enumerate(mesh.get("primitives", [])):
            if "indices" in primitive:
                triangles = int(accessors[primitive["indices"]]["count"]) // 3
            else:
                triangles = int(accessors[primitive["attributes"]["POSITION"]]["count"]) // 3
            total_triangles += triangles
            material_index = primitive.get("material")
            primitive_records.append(
                {
                    "meshIndex": mesh_index,
                    "meshName": mesh.get("name"),
                    "primitiveIndex": primitive_index,
                    "triangles": triangles,
                    "attributes": sorted(primitive.get("attributes", {})),
                    "material": (
                        material_names[material_index]
                        if isinstance(material_index, int)
                        else None
                    ),
                }
            )
    animations = []
    for animation in document.get("animations", []):
        counts = []
        duration = 0.0
        target_paths = Counter()
        for sampler in animation.get("samplers", []):
            accessor = accessors[sampler["input"]]
            counts.append(int(accessor["count"]))
            maximum = accessor.get("max", [0.0])
            duration = max(duration, float(maximum[0]))
        for channel in animation.get("channels", []):
            target_paths[channel.get("target", {}).get("path", "missing")] += 1
        animations.append(
            {
                "name": animation.get("name"),
                "durationSeconds": duration,
                "channels": len(animation.get("channels", [])),
                "keyCountMinimum": min(counts, default=0),
                "keyCountMaximum": max(counts, default=0),
                "targetPaths": dict(sorted(target_paths.items())),
                "extras": animation.get("extras"),
            }
        )
    external_uris = []
    for section in ("buffers", "images"):
        for record in document.get(section, []):
            uri = record.get("uri")
            if uri and not uri.startswith("data:"):
                external_uris.append(uri)
    return {
        "asset": document.get("asset", {}),
        "bytes": len(payload),
        "sha256": sha256(path),
        "counts": {
            "nodes": len(document.get("nodes", [])),
            "meshes": len(document.get("meshes", [])),
            "primitives": len(primitive_records),
            "triangles": total_triangles,
            "materials": len(document.get("materials", [])),
            "skins": len(document.get("skins", [])),
            "animations": len(document.get("animations", [])),
            "images": len(document.get("images", [])),
            "textures": len(document.get("textures", [])),
        },
        "skinJointCounts": [
            len(skin.get("joints", [])) for skin in document.get("skins", [])
        ],
        "externalUris": external_uris,
        "primitives": primitive_records,
        "animations": animations,
    }


def assign_action(rig: bpy.types.Object, action: bpy.types.Action) -> None:
    animation_data = rig.animation_data_create()
    animation_data.use_nla = False
    animation_data.action = action


def mesh_weight_audit(obj: bpy.types.Object, bone_names: set[str]) -> dict[str, Any]:
    zero = 0
    maximum = 0
    groups = set()
    for vertex in obj.data.vertices:
        assignments = [
            assignment
            for assignment in vertex.groups
            if assignment.group < len(obj.vertex_groups)
            and obj.vertex_groups[assignment.group].name in bone_names
            and assignment.weight > 1.0e-6
        ]
        if not assignments:
            zero += 1
        maximum = max(maximum, len(assignments))
        groups.update(obj.vertex_groups[a.group].name for a in assignments)
    return {
        "vertices": len(obj.data.vertices),
        "zeroWeightVertices": zero,
        "maximumInfluences": maximum,
        "weightedGroups": sorted(groups),
    }


def audit_reimport(
    glb_path: Path,
    proof_path: Path,
    expected_contact_points: list[tuple[float, float, float]],
) -> dict[str, Any]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(glb_path))
    if "FINISHED" not in result:
        raise RuntimeError(f"Fresh Rev14 GLB reimport failed: {result}")
    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    rig = max(rigs, key=lambda obj: len(obj.data.bones), default=None)
    if rig is None:
        raise RuntimeError("Fresh Rev14 GLB contains no armature")
    bone_names = {bone.name for bone in rig.data.bones}
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    roles = {}
    for role in ROLE_TARGETS:
        roles[role] = next(
            (obj for obj in meshes if f"LOD0_{role.upper()}_REV14" in obj.name),
            None,
        )
    actions = {action.name: action for action in bpy.data.actions}
    missing_actions = sorted(set(EXPECTED_CLIPS) - set(actions))
    if missing_actions:
        raise RuntimeError(f"Fresh reimport missing actions: {missing_actions}")

    idle = actions["KYX_V6C_TP_IDLE"]
    assign_action(rig, idle)
    idle_start = float(idle.frame_range[0])
    bpy.context.scene.frame_set(math.floor(idle_start), subframe=idle_start % 1.0)
    bpy.context.view_layer.update()
    baseline_palms = palm_relation(rig)

    clip_audits = []
    for name in EXPECTED_CLIPS:
        action = actions[name]
        assign_action(rig, action)
        start, end = [float(value) for value in action.frame_range]
        sample_frames = sorted(
            {start, start + (end - start) * 0.25, start + (end - start) * 0.5,
             start + (end - start) * 0.75, end}
        )
        snapshots = []
        palms = []
        for frame in sample_frames:
            bpy.context.scene.frame_set(math.floor(frame), subframe=frame % 1.0)
            bpy.context.view_layer.update()
            snapshots.append(pose_snapshot(rig))
            palms.append(palm_relation(rig))
        motion = max(
            max_delta(snapshots[0][bone], snapshot[bone])
            for snapshot in snapshots[1:]
            for bone in snapshots[0]
        )
        varied = sum(
            any(
                max_delta(snapshots[0][bone], snapshot[bone]) > 1.0e-4
                for snapshot in snapshots[1:]
            )
            for bone in snapshots[0]
        )
        clip_audits.append(
            {
                "name": name,
                "frameRange": [start, end],
                "durationSecondsAt24Fps": (end - start) / FPS,
                "maxPoseMatrixDelta": motion,
                "variedBones": varied,
                "loopSeamMaxMatrixDelta": (
                    max(
                        max_delta(snapshots[0][bone], snapshots[-1][bone])
                        for bone in snapshots[0]
                    )
                    if name in LOOP_CLIPS
                    else None
                ),
                "maxPalmRelationDelta": max(
                    max_delta(baseline_palms, relation) for relation in palms
                ),
                "endPalmRelationDelta": max_delta(baseline_palms, palms[-1]),
            }
        )

    rifle = roles.get("rifle")
    imported_contact_points = contact_points_from_objects([rifle] if rifle else [])
    role_audits = {}
    for role, obj in roles.items():
        role_audits[role] = (
            {
                "present": True,
                "object": obj.name,
                "triangles": triangle_count_object(obj),
                "materials": [slot.material.name for slot in obj.material_slots if slot.material],
                "uvLayers": [layer.name for layer in obj.data.uv_layers],
                "colorAttributes": [a.name for a in obj.data.color_attributes],
                "meshAttributes": [a.name for a in obj.data.attributes],
                "weights": mesh_weight_audit(obj, bone_names),
            }
            if obj
            else {"present": False}
        )

    assign_action(rig, idle)
    bpy.context.scene.frame_set(math.floor(idle_start), subframe=idle_start % 1.0)
    bpy.context.view_layer.update()
    proof_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=str(proof_path), check_existing=False, compress=True
    )
    return {
        "proofBlend": {
            "path": str(proof_path),
            "bytes": proof_path.stat().st_size,
            "sha256": sha256(proof_path),
        },
        "armatures": len(rigs),
        "bones": len(rig.data.bones),
        "meshes": len(meshes),
        "materials": len(bpy.data.materials),
        "actionNames": sorted(actions),
        "shapeKeyMeshes": sum(obj.data.shape_keys is not None for obj in meshes),
        "roles": role_audits,
        "clips": clip_audits,
        "contact": {
            "expectedVertices": len(expected_contact_points),
            "reimportVertices": len(imported_contact_points),
            "roundTripMaxWorldCoordinateDelta": point_cloud_delta(
                expected_contact_points, imported_contact_points
            ),
        },
    }


def main() -> None:
    source_arg, candidate_arg, glb_arg, proof_arg, report_arg = script_args()
    source_path = Path(source_arg).resolve()
    candidate_path = Path(candidate_arg).resolve()
    glb_path = Path(glb_arg).resolve()
    proof_path = Path(proof_arg).resolve()
    report_path = Path(report_arg).resolve()
    for path in (candidate_path, glb_path, proof_path, report_path):
        path.parent.mkdir(parents=True, exist_ok=True)

    source_hash_before = sha256(source_path)
    if source_hash_before != SOURCE_REV13_SHA256:
        raise RuntimeError(
            f"Rev13 source hash mismatch: {source_hash_before} != {SOURCE_REV13_SHA256}"
        )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(source_path))
    if "FINISHED" not in result:
        raise RuntimeError(f"Rev13 import failed: {result}")
    bpy.context.scene.render.fps = FPS
    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    rig = max(rigs, key=lambda obj: len(obj.data.bones), default=None)
    if rig is None or len(rig.data.bones) != EXPECTED_BONES:
        raise RuntimeError("Expected one 52-bone Rev13 rig")
    bone_names = {bone.name for bone in rig.data.bones}
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    # GLB contains 106 mesh definitions / 109 primitives; Blender may materialize
    # a multi-primitive definition as an additional object on import.  Pin the
    # actual triangle payload below rather than relying on importer object count.
    if len(meshes) < 100 or len(meshes) > 109:
        raise RuntimeError(f"Unexpected Rev13 source mesh-object count: {len(meshes)}")
    actions = {action.name: action for action in bpy.data.actions}
    if set(actions) != set(EXPECTED_CLIPS):
        raise RuntimeError(
            f"Rev13 action contract mismatch: {sorted(actions)} != {sorted(EXPECTED_CLIPS)}"
        )

    source_triangles = sum(triangle_count_object(obj) for obj in meshes)
    if source_triangles != SOURCE_REV13_BLENDER_TRIANGLES:
        raise RuntimeError(
            "Rev13 imported triangle payload mismatch: "
            f"{source_triangles} != {SOURCE_REV13_BLENDER_TRIANGLES}"
        )
    source_role_triangles = Counter()
    for obj in meshes:
        source_role_triangles[classify_role(obj.name)] += triangle_count_object(obj)

    rifle_objects = [obj for obj in meshes if classify_role(obj.name) == "rifle"]
    contact_objects = [obj for obj in rifle_objects if "RuntimeContact_" in obj.name]
    for obj in rifle_objects:
        ensure_contact_attribute(obj, obj in contact_objects)
    source_contact_points = contact_points_from_objects(contact_objects)
    source_contact_triangles = sum(triangle_count_object(obj) for obj in contact_objects)

    subgroup_objects: dict[str, list[bpy.types.Object]] = {}
    for obj in meshes:
        subgroup_objects.setdefault(classify_subgroup(obj.name), []).append(obj)

    allocations: dict[str, int] = {}
    for subgroup, budget in SUBGROUP_TARGETS.items():
        allocations.update(allocate_targets(subgroup_objects.get(subgroup, []), budget))
    contact_names = {obj.name for obj in contact_objects}
    for obj in contact_objects:
        allocations[obj.name] = triangle_count_object(obj)
    rifle_other_budget = ROLE_TARGETS["rifle"] - source_contact_triangles
    if rifle_other_budget <= 0:
        raise RuntimeError("Exact contact geometry alone exceeds the rifle budget")
    allocations.update(
        allocate_targets(subgroup_objects.get("rifle_other", []), rifle_other_budget)
    )
    if set(allocations) != {obj.name for obj in meshes}:
        missing = sorted({obj.name for obj in meshes} - set(allocations))
        raise RuntimeError(f"Unallocated semantic islands: {missing}")

    reduction_records = []
    for obj in sorted(meshes, key=lambda item: item.name):
        if obj.name in contact_names:
            reduction_records.append(
                {
                    "object": obj.name,
                    "role": "rifle",
                    "subgroup": "rifle_contact",
                    "sourceTriangles": triangle_count_object(obj),
                    "allocatedTarget": allocations[obj.name],
                    "resultTriangles": triangle_count_object(obj),
                    "passes": 0,
                    "method": "exact_contact_island_preserved_no_reduction",
                }
            )
        else:
            reduction_records.append(reduce_object(obj, allocations[obj.name]))

    role_materials = {role: make_role_material(role) for role in ROLE_TARGETS}
    role_member_names = {
        role: [obj.name for obj in meshes if classify_role(obj.name) == role]
        for role in ROLE_TARGETS
    }
    role_objects = {}
    role_records = {}
    for role in ("soft", "hard", "rifle"):
        members = [
            bpy.data.objects[name]
            for name in role_member_names[role]
            if name in bpy.data.objects
        ]
        joined, record = join_role(
            role, members, role_materials[role], rig, bone_names
        )
        role_objects[role] = joined
        role_records[role] = record

    candidate_contact_points = contact_points_from_objects([role_objects["rifle"]])
    candidate_contact_delta = point_cloud_delta(
        source_contact_points, candidate_contact_points
    )
    candidate_triangles = sum(record["triangles"] for record in role_records.values())
    role_triangle_delta = {
        role: role_records[role]["triangles"] - ROLE_TARGETS[role]
        for role in ROLE_TARGETS
    }

    rebuild_nla(rig, actions)
    rig["kyx_checkpoint"] = CHECKPOINT
    rig["kyx_source_rev13_sha256"] = SOURCE_REV13_SHA256
    rig["kyx_non_default_non_release_not_g6"] = True
    rig["kyx_first_person_arms_status"] = "BLOCKED_NO_CLEAN_SEPARATE_ARM_MESH"
    rig["kyx_lod0_target_triangles"] = AUTHOR_TRIANGLE_TARGET
    rig["kyx_lod0_hard_max_triangles"] = HARD_TRIANGLE_LIMIT
    bpy.context.scene["kyx_checkpoint"] = CHECKPOINT
    bpy.context.scene["kyx_candidate_only"] = True

    candidate_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=str(candidate_path), check_existing=False, compress=True
    )
    candidate_hash = sha256(candidate_path)

    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    export_objects = [rig, role_objects["soft"], role_objects["hard"], role_objects["rifle"]]
    for obj in export_objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    kwargs = exporter_kwargs(glb_path)
    export_result = bpy.ops.export_scene.gltf(**kwargs)
    if "FINISHED" not in export_result:
        raise RuntimeError(f"Rev14 LOD0 GLB export failed: {export_result}")
    glb_audit = parse_glb(glb_path)
    source_hash_after = sha256(source_path)
    reimport = audit_reimport(glb_path, proof_path, candidate_contact_points)

    glb_clips = {record["name"]: record for record in glb_audit["animations"]}
    imported_clips = {record["name"]: record for record in reimport["clips"]}
    stable_clips = [name for name in EXPECTED_CLIPS if name != "KYX_V6C_TP_RELOAD"]
    reload_audit = imported_clips["KYX_V6C_TP_RELOAD"]
    assertions = {
        "rev13SourceHashPinnedAndUnchanged": (
            source_hash_before == source_hash_after == SOURCE_REV13_SHA256
        ),
        "candidateSavedInNewRev14Lane": (
            "v6c-lod0-retopo-rev14" in str(candidate_path).lower()
            and "v6c-gameplay-rev13" not in str(candidate_path).lower()
        ),
        "semanticRoleTargetsWithinAuthoringContract": (
            candidate_triangles <= AUTHOR_TRIANGLE_TARGET
            and candidate_triangles >= 36000
            and all(role_records[role]["triangles"] <= ROLE_TARGETS[role] + 32 for role in ROLE_TARGETS)
        ),
        "glbMeetsHardTriangleAndPrimitiveContract": (
            glb_audit["counts"]["triangles"] <= HARD_TRIANGLE_LIMIT
            and glb_audit["counts"]["primitives"] == 3
            and glb_audit["counts"]["meshes"] == 3
            and glb_audit["counts"]["materials"] == 3
        ),
        "allThreePrimitivesCarrySkinNormalsUvColor": all(
            {"POSITION", "NORMAL", "JOINTS_0", "WEIGHTS_0", "TEXCOORD_0", "COLOR_0"}
            <= set(record["attributes"])
            for record in glb_audit["primitives"]
        ),
        "glbIsSelfContainedAndHasOne52JointSkin": (
            not glb_audit["externalUris"]
            and glb_audit["counts"]["skins"] == 1
            and glb_audit["skinJointCounts"] == [EXPECTED_BONES]
        ),
        "glbContainsExactTenClipContract": (
            set(glb_clips) == set(EXPECTED_CLIPS)
            and glb_audit["counts"]["animations"] == 10
            and all(
                record["channels"] == EXPECTED_BONES * 3
                and record["durationSeconds"] > 0.1
                for record in glb_clips.values()
            )
        ),
        "freshReimportContainsThreeRoleMeshesAnd52BoneRig": (
            reimport["bones"] == EXPECTED_BONES
            and reimport["meshes"] == 3
            and all(record["present"] for record in reimport["roles"].values())
        ),
        "freshReimportWeightsAreNonzeroAndMaximumFour": all(
            record.get("present", False)
            and record.get("weights", {}).get("zeroWeightVertices") == 0
            and record.get("weights", {}).get("maximumInfluences", math.inf) <= 4
            for record in reimport["roles"].values()
        ),
        "rifleIsPalmRightOnly": (
            reimport["roles"]["rifle"].get("present", False)
            and reimport["roles"]["rifle"].get("weights", {}).get("weightedGroups")
            == ["palm.R"]
        ),
        "contactVerticesPreservedBeforeAndAfterGlbRoundTrip": (
            len(source_contact_points) > 0
            and candidate_contact_delta <= 1.0e-7
            and reimport["contact"]["expectedVertices"] == len(source_contact_points)
            and reimport["contact"]["reimportVertices"] == len(source_contact_points)
            and reimport["contact"]["roundTripMaxWorldCoordinateDelta"] <= 1.0e-5
        ),
        "everyImportedClipHasPoseDiversity": all(
            record["maxPoseMatrixDelta"] > 0.001 and record["variedBones"] >= 2
            for record in reimport["clips"]
        ),
        "loopClipsRemainSeamClosed": all(
            imported_clips[name]["loopSeamMaxMatrixDelta"] <= CONTACT_TOLERANCE
            for name in LOOP_CLIPS
        ),
        "supportAndGripRelationStableOutsideReload": all(
            imported_clips[name]["maxPalmRelationDelta"] <= CONTACT_TOLERANCE
            for name in stable_clips
        ),
        "reloadSupportHandDepartsAndReturns": (
            reload_audit["maxPalmRelationDelta"] > 0.005
            and reload_audit["endPalmRelationDelta"] <= CONTACT_TOLERANCE
        ),
        "noRuntimeMorphTargetsRemain": reimport["shapeKeyMeshes"] == 0,
    }
    passed = all(assertions.values())
    report = {
        "schema": "kyx-v6c-lod0-retopo-rev14-audit-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "status": (
            "PASS_BOUNDED_V6C_LOD0_RETOPO_CANDIDATE_NOT_G6"
            if passed
            else "FAIL_BOUNDED_V6C_LOD0_RETOPO_CANDIDATE"
        ),
        "method": {
            "name": "semantic_per_island_retopology_and_three_role_consolidation",
            "blindWholeCharacterDecimation": False,
            "description": (
                "Each source island receives an explicit semantic subgroup budget. "
                "Reduction runs before the live armature, six contact islands are "
                "not reduced, and only soft, hard, and rifle roles are joined."
            ),
        },
        "sourceRev13": {
            "path": str(source_path),
            "bytes": source_path.stat().st_size,
            "sha256Before": source_hash_before,
            "sha256After": source_hash_after,
            "triangles": source_triangles,
            "sourceGlbTriangles": SOURCE_REV13_GLTF_TRIANGLES,
            "roleTriangles": dict(source_role_triangles),
            "contactTrianglesPreserved": source_contact_triangles,
            "contactVerticesPreserved": len(source_contact_points),
        },
        "targets": {
            "authorTriangleTarget": AUTHOR_TRIANGLE_TARGET,
            "hardTriangleLimit": HARD_TRIANGLE_LIMIT,
            "roleTargets": ROLE_TARGETS,
            "subgroupTargets": SUBGROUP_TARGETS,
            "primitiveTarget": 3,
        },
        "reductionRecords": reduction_records,
        "candidateRoles": role_records,
        "candidateTriangleTotal": candidate_triangles,
        "roleTriangleDeltaFromTarget": role_triangle_delta,
        "candidateContactMaxWorldCoordinateDelta": candidate_contact_delta,
        "candidateBlend": {
            "path": str(candidate_path),
            "bytes": candidate_path.stat().st_size,
            "sha256": candidate_hash,
        },
        "export": {
            "path": str(glb_path),
            "operator": "bpy.ops.export_scene.gltf",
            "operatorKwargs": kwargs,
            **glb_audit,
        },
        "reimport": reimport,
        "assertions": assertions,
        "firstPersonArms": {
            "status": "BLOCKED_NOT_AUTHORED",
            "reason": "Rev13 still has no clean separable viewmodel arm topology or reviewed shoulder cutoff.",
        },
        "nonClaims": [
            "This is an isolated, non-default, non-release Rev14 LOD0 candidate.",
            "No public/ or assets/runtime/ asset is changed.",
            "Blender metrics and contact proofs do not constitute human visual acceptance.",
            "LOD1, LOD2, final texture atlases, first-person arms, markers, product integration, 2/4/8 performance, release eligibility, and G6 remain open.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "assertions": assertions}, sort_keys=True))
    if not passed:
        failed = [name for name, value in assertions.items() if not value]
        raise RuntimeError(f"Rev14 LOD0 audit failed closed: {failed}")


if __name__ == "__main__":
    main()
