"""Author an immutable Rev15 character-review candidate from the pinned Rev14 GLB.

Rev15 is intentionally bounded.  It preserves Rev14 as an immutable source,
adds clean-room authored rounded weapon grips, refines waist/pants/boots
vertex-color surface treatment, rebuilds the ten embedded actions with better
hand closure and run readability, then exports and fresh-reimports the exact GLB.

This script never touches the public runtime asset and never claims G6.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import struct
import sys
from typing import Any

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


CHECKPOINT = "V6C_CHARACTER_CONTACT_MOTION_SURFACE_CANDIDATE_REV15"
STATUS_PASS = "PASS_BOUNDED_REV15_CHARACTER_REVIEW_CANDIDATE_NOT_G6"
STATUS_FAIL = "FAIL_BOUNDED_REV15_CHARACTER_REVIEW_CANDIDATE"
SOURCE_REV14_SHA256 = "4a42ab81a4df17f40572a0fb276ab7a5310cae71edfe8ac5f65868d3e77e9dbb"
SOURCE_REV14_BYTES = 3_314_572
SOURCE_REV14_TRIANGLES = 41_682
EXPECTED_BONES = 52
FPS = 24
HARD_TRIANGLE_LIMIT = 45_000
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
ROLE_TOKENS = {
    "soft": "LOD0_SOFT_REV14",
    "hard": "LOD0_HARD_REV14",
    "rifle": "LOD0_RIFLE_REV14",
}


def script_args() -> tuple[Path, Path, Path, Path, Path]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <rev14.glb> <rev15.blend> <rev15.glb> "
            "<reimport.blend> <audit.json>"
        )
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 5:
        raise SystemExit(f"Expected five arguments, got {len(values)}")
    return tuple(Path(value).resolve() for value in values)  # type: ignore[return-value]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def triangle_count(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def importer_helper(obj: bpy.types.Object) -> bool:
    return (
        obj.type == "MESH"
        and bool(obj.users_collection)
        and all(collection.name == "glTF_not_exported" for collection in obj.users_collection)
    )


def action_fcurves(action: bpy.types.Action) -> list[Any]:
    result = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in strip.channelbags:
                result.extend(channelbag.fcurves)
    return result


def set_action_interpolation(action: bpy.types.Action, mode: str) -> None:
    for curve in action_fcurves(action):
        for point in curve.keyframe_points:
            point.interpolation = mode
            if mode == "BEZIER":
                point.handle_left_type = "AUTO_CLAMPED"
                point.handle_right_type = "AUTO_CLAMPED"


def assign_action(rig: bpy.types.Object, action: bpy.types.Action) -> None:
    animation_data = rig.animation_data_create()
    animation_data.use_nla = False
    animation_data.action = action


def flatten_matrix(matrix: Matrix) -> list[float]:
    return [float(value) for row in matrix for value in row]


def max_delta(left: list[float], right: list[float]) -> float:
    return max(abs(a - b) for a, b in zip(left, right))


def pose_snapshot(rig: bpy.types.Object) -> dict[str, list[float]]:
    return {bone.name: flatten_matrix(bone.matrix) for bone in rig.pose.bones}


def palm_relation(rig: bpy.types.Object) -> list[float]:
    right = rig.matrix_world @ rig.pose.bones["palm.R"].matrix
    left = rig.matrix_world @ rig.pose.bones["palm.L"].matrix
    return flatten_matrix(right.inverted_safe() @ left)


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
    materials = [record.get("name") for record in document.get("materials", [])]
    primitives = []
    total_triangles = 0
    for mesh_index, mesh in enumerate(document.get("meshes", [])):
        for primitive_index, primitive in enumerate(mesh.get("primitives", [])):
            index_accessor = primitive.get("indices")
            if index_accessor is None:
                triangles = int(
                    accessors[primitive["attributes"]["POSITION"]]["count"]
                ) // 3
            else:
                triangles = int(accessors[index_accessor]["count"]) // 3
            total_triangles += triangles
            material_index = primitive.get("material")
            primitives.append(
                {
                    "meshIndex": mesh_index,
                    "meshName": mesh.get("name"),
                    "primitiveIndex": primitive_index,
                    "triangles": triangles,
                    "attributes": sorted(primitive.get("attributes", {})),
                    "material": (
                        materials[material_index]
                        if isinstance(material_index, int)
                        else None
                    ),
                }
            )
    animations = []
    for animation in document.get("animations", []):
        target_paths = Counter()
        duration = 0.0
        key_counts = []
        for sampler in animation.get("samplers", []):
            accessor = accessors[sampler["input"]]
            key_counts.append(int(accessor["count"]))
            duration = max(duration, float(accessor.get("max", [0.0])[0]))
        for channel in animation.get("channels", []):
            target_paths[channel.get("target", {}).get("path", "missing")] += 1
        animations.append(
            {
                "name": animation.get("name"),
                "durationSeconds": duration,
                "channels": len(animation.get("channels", [])),
                "keyCountMinimum": min(key_counts, default=0),
                "keyCountMaximum": max(key_counts, default=0),
                "targetPaths": dict(sorted(target_paths.items())),
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
            "primitives": len(primitives),
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
        "primitives": primitives,
        "animations": animations,
        "externalUris": external_uris,
    }


def material_bsdf(material: bpy.types.Material) -> bpy.types.Node | None:
    if not material.use_nodes or material.node_tree is None:
        return None
    return material.node_tree.nodes.get("Principled BSDF")


def tune_material(material: bpy.types.Material, role: str) -> None:
    material.name = f"KYX_V6C_REV15_{role.upper()}_SURFACE_ROLE"
    material["kyx_checkpoint"] = CHECKPOINT
    material["kyx_clean_room_surface_revision"] = "rev15"
    bsdf = material_bsdf(material)
    if bsdf is not None:
        bsdf.inputs["Roughness"].default_value = {
            "soft": 0.84,
            "hard": 0.58,
            "rifle": 0.38,
        }[role]
        bsdf.inputs["Metallic"].default_value = {
            "soft": 0.02,
            "hard": 0.24,
            "rifle": 0.52,
        }[role]


def find_color_attribute(mesh: bpy.types.Mesh) -> bpy.types.Attribute:
    attribute = (
        mesh.color_attributes.get("Color")
        or mesh.color_attributes.get("COLOR_0")
    )
    if attribute is None:
        attribute = mesh.color_attributes.new(
            name="Color", type="FLOAT_COLOR", domain="CORNER"
        )
    index = mesh.color_attributes.find(attribute.name)
    mesh.color_attributes.active_color_index = index
    mesh.color_attributes.render_color_index = index
    return attribute


def group_weight(obj: bpy.types.Object, vertex: bpy.types.MeshVertex, names: set[str]) -> float:
    result = 0.0
    for assignment in vertex.groups:
        if assignment.group >= len(obj.vertex_groups):
            continue
        if obj.vertex_groups[assignment.group].name in names:
            result += float(assignment.weight)
    return result


def recolor_surface(obj: bpy.types.Object, role: str) -> dict[str, Any]:
    mesh = obj.data
    color = find_color_attribute(mesh)
    leg_groups = {
        "thigh_anchor.L",
        "shin_anchor.L",
        "foot_anchor.L",
        "thigh_anchor.R",
        "shin_anchor.R",
        "foot_anchor.R",
    }
    boot_groups = {
        "shin_anchor.L",
        "foot_anchor.L",
        "shin_anchor.R",
        "foot_anchor.R",
    }
    changed_vertices: set[int] = set()
    treatment_counts = Counter()
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            vertex = mesh.vertices[vertex_index]
            position = vertex.co
            leg_weight = group_weight(obj, vertex, leg_groups)
            boot_weight = group_weight(obj, vertex, boot_groups)
            replacement = None
            treatment = None
            if role == "soft" and (
                leg_weight >= 0.24
                or (
                    position.z < 1.05
                    and abs(position.x) < 0.31
                    and position.y > -0.18
                )
            ):
                panel = (
                    int(abs(position.x) * 31.0)
                    + int((position.z + 0.07) * 17.0)
                    + int((position.y + 0.22) * 13.0)
                ) % 4
                replacement = (
                    (0.0035, 0.0060, 0.0090, 1.0)
                    if panel in (0, 1)
                    else (0.0060, 0.0110, 0.0170, 1.0)
                )
                treatment = "pants_panel"
                if 0.43 <= position.z <= 0.62 and leg_weight >= 0.35:
                    replacement = (0.0120, 0.0220, 0.0300, 1.0)
                    treatment = "pants_knee_reinforcement"
                if position.z < 0.29 and boot_weight >= 0.25:
                    replacement = (0.0020, 0.0040, 0.0060, 1.0)
                    treatment = "pants_boot_overlap"
                if (
                    0.93 <= position.z <= 1.075
                    and abs(position.x) < 0.27
                    and -0.17 < position.y < 0.14
                ):
                    replacement = (0.0015, 0.0040, 0.0065, 1.0)
                    treatment = "continuous_waist_bridge"
            elif role == "hard" and (
                boot_weight >= 0.22 or position.z < 0.285
            ):
                if position.z < 0.035:
                    replacement = (0.0010, 0.0015, 0.0020, 1.0)
                    treatment = "boot_sole"
                elif position.y < -0.095:
                    replacement = (0.0040, 0.0180, 0.0250, 1.0)
                    treatment = "boot_toe_cap"
                else:
                    band = int((position.z + 0.02) * 42.0) % 3
                    replacement = (
                        (0.0025, 0.0060, 0.0090, 1.0)
                        if band != 1
                        else (0.0060, 0.0140, 0.0190, 1.0)
                    )
                    treatment = "boot_panel"
            if replacement is not None:
                color.data[loop_index].color = replacement
                changed_vertices.add(vertex_index)
                treatment_counts[treatment] += 1
    mesh.update()
    return {
        "role": role,
        "changedVertices": len(changed_vertices),
        "changedCorners": sum(treatment_counts.values()),
        "treatments": dict(sorted(treatment_counts.items())),
        "colorAttribute": color.name,
    }


def add_corner_color(
    obj: bpy.types.Object, rgba: tuple[float, float, float, float]
) -> None:
    attribute = find_color_attribute(obj.data)
    for record in attribute.data:
        record.color = rgba


def create_skinned_grip_cylinder(
    name: str,
    desired_world_matrix: Matrix,
    radius: float,
    depth: float,
    color: tuple[float, float, float, float],
    material: bpy.types.Material,
    rig: bpy.types.Object,
    rifle: bpy.types.Object,
) -> bpy.types.Object:
    bone = rig.data.bones["palm.R"]
    pose = rig.pose.bones["palm.R"]
    skin_matrix = (
        rig.matrix_world
        @ pose.matrix
        @ bone.matrix_local.inverted()
        @ rig.matrix_world.inverted()
        @ rifle.matrix_world
    )
    bind_matrix = skin_matrix.inverted_safe() @ desired_world_matrix
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=12,
        radius=radius,
        depth=depth,
        end_fill_type="NGON",
    )
    obj = bpy.context.object
    obj.name = name
    obj.matrix_world = bind_matrix
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bevel = obj.modifiers.new(name="KYX_REV15_GRIP_EDGE_BREAK", type="BEVEL")
    bevel.width = 0.006
    bevel.segments = 2
    bevel.affect = "EDGES"
    result = bpy.ops.object.modifier_apply(modifier=bevel.name)
    if "FINISHED" not in result:
        raise RuntimeError(f"Unable to bevel {name}: {result}")
    obj.data.materials.append(material)
    add_corner_color(obj, color)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    group = obj.vertex_groups.new(name="palm.R")
    group.add(range(len(obj.data.vertices)), 1.0, "REPLACE")
    obj.parent = rig
    armature = obj.modifiers.new(name="KYX_REV15_ARMATURE", type="ARMATURE")
    armature.object = rig
    obj["kyx_checkpoint"] = CHECKPOINT
    obj["kyx_clean_room_generated_grip"] = True
    return obj


def join_clean_room_grips(
    rifle: bpy.types.Object,
    rig: bpy.types.Object,
    actions: dict[str, bpy.types.Action],
) -> dict[str, Any]:
    material = rifle.material_slots[0].material
    if material is None:
        raise RuntimeError("Rifle role has no material")
    assign_action(rig, actions["KYX_V6C_TP_IDLE"])
    bpy.context.scene.frame_set(13)
    bpy.context.view_layer.update()
    desired = (
        (
            "KYX_REV15_PISTOL_GRIP",
            Matrix.Translation(Vector((-0.160, -0.415, 1.160)))
            @ Matrix.Rotation(math.radians(-18.0), 4, "X"),
            0.028,
            0.130,
            (0.0025, 0.0110, 0.0170, 1.0),
        ),
        (
            "KYX_REV15_SUPPORT_GRIP",
            Matrix.Translation(Vector((-0.045, -0.630, 1.155))),
            0.025,
            0.140,
            (0.0030, 0.0150, 0.0220, 1.0),
        ),
    )
    before = triangle_count(rifle)
    additions = [
        create_skinned_grip_cylinder(
            name,
            matrix,
            radius,
            depth,
            color,
            material,
            rig,
            rifle,
        )
        for name, matrix, radius, depth, color in desired
    ]
    records = [
        {
            "name": obj.name,
            "triangles": triangle_count(obj),
            "vertices": len(obj.data.vertices),
            "weightedBone": "palm.R",
        }
        for obj in additions
    ]
    bpy.ops.object.select_all(action="DESELECT")
    rifle.hide_set(False)
    rifle.hide_viewport = False
    rifle.select_set(True)
    for obj in additions:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rifle
    result = bpy.ops.object.join()
    if "FINISHED" not in result:
        raise RuntimeError(f"Unable to join Rev15 grips: {result}")
    while len(rifle.data.materials) > 1:
        rifle.data.materials.pop(index=len(rifle.data.materials) - 1)
    for polygon in rifle.data.polygons:
        polygon.material_index = 0
    rifle.data.update()
    return {
        "method": "clean_room_rounded_grips_joined_to_rifle_role",
        "sourceRifleTriangles": before,
        "additions": records,
        "addedTriangles": triangle_count(rifle) - before,
        "resultRifleTriangles": triangle_count(rifle),
    }


def sample_source_actions(
    rig: bpy.types.Object, actions: dict[str, bpy.types.Action]
) -> dict[str, dict[int, dict[str, Matrix]]]:
    result: dict[str, dict[int, dict[str, Matrix]]] = {}
    for name in EXPECTED_CLIPS:
        action = actions[name]
        assign_action(rig, action)
        start, end = [int(round(value)) for value in action.frame_range]
        frames = {}
        for frame in range(start, end + 1):
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            frames[frame] = {
                bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones
            }
        result[name] = frames
    return result


def rotate_basis(
    basis: dict[str, Matrix], bone_name: str, axis: str, degrees: float
) -> None:
    basis[bone_name] = basis[bone_name] @ Matrix.Rotation(
        math.radians(degrees), 4, axis
    )


def apply_grip_correction(basis: dict[str, Matrix]) -> None:
    # Right index stays comparatively extended for the trigger.  The remaining
    # digits close around the pistol grip.  The mirrored support fingers close
    # over the foregrip.  These are bone-space corrections, not render-only poses.
    finger_scales = {
        ("index", "R"): 0.25,
        ("middle", "R"): 0.75,
        ("ring", "R"): 0.50,
        ("pinky", "R"): 0.75,
        ("index", "L"): 0.78,
        ("middle", "L"): 0.72,
        ("ring", "L"): 0.76,
        ("pinky", "L"): 0.72,
    }
    for (finger, side), scale in finger_scales.items():
        for joint, degrees in zip((1, 2, 3), (42.0, 72.0, 48.0)):
            rotate_basis(
                basis,
                f"{finger}_0{joint}.{side}",
                "X",
                degrees * scale,
            )
    for side in ("R", "L"):
        for joint, degrees in zip((1, 2, 3), (30.0, 45.0, 25.0)):
            rotate_basis(
                basis,
                f"thumb_0{joint}.{side}",
                "X",
                degrees * 0.25,
            )
    support_arm_correction = (
        ("clavicle.L", "Z", -25.0),
        ("upper_arm.L", "Y", -23.0),
        ("upper_arm.L", "Z", 25.0),
        ("forearm.L", "X", 9.0),
        ("forearm.L", "Y", 7.0),
        ("forearm.L", "Z", -3.0),
        ("wrist.L", "X", -13.0),
        ("wrist.L", "Y", -3.0),
        ("wrist.L", "Z", -18.0),
    )
    for bone_name, axis, degrees in support_arm_correction:
        rotate_basis(basis, bone_name, axis, degrees)


def apply_run_correction(
    basis: dict[str, Matrix], frame: int, start: int, end: int
) -> None:
    phase = math.tau * (frame - start) / max(1, end - start)
    stride = math.cos(phase)
    transverse = math.sin(phase)
    rotate_basis(basis, "root", "X", -2.5)
    rotate_basis(basis, "spine_01", "X", -7.0)
    rotate_basis(basis, "spine_02", "X", -3.0)
    rotate_basis(basis, "chest", "X", 2.0)
    rotate_basis(basis, "spine_01", "Z", 4.5 * transverse)
    rotate_basis(basis, "chest", "Z", -2.5 * transverse)
    rotate_basis(basis, "thigh_anchor.L", "X", 15.0 * stride)
    rotate_basis(basis, "thigh_anchor.R", "X", -15.0 * stride)
    left_knee = -18.0 * max(stride, 0.0) + 10.0 * max(-stride, 0.0)
    right_knee = -18.0 * max(-stride, 0.0) + 10.0 * max(stride, 0.0)
    # Both knees stay visibly flexed through the crossing phases, preventing a
    # sampled in-between frame from reading as a static attention pose.
    crossing_flex = -13.0 * (1.0 - abs(stride))
    rotate_basis(basis, "shin_anchor.L", "X", left_knee + crossing_flex)
    rotate_basis(basis, "shin_anchor.R", "X", right_knee + crossing_flex)
    rotate_basis(basis, "foot_anchor.L", "X", -6.0 * stride)
    rotate_basis(basis, "foot_anchor.R", "X", 6.0 * stride)
    root = basis["root"].copy()
    root.translation += Vector((0.0, 0.0, 0.034 * (1.0 - abs(stride))))
    basis["root"] = root


def key_pose(rig: bpy.types.Object, frame: int) -> None:
    for bone in rig.pose.bones:
        bone.rotation_mode = "QUATERNION"
        bone.keyframe_insert(data_path="location", frame=frame, group=bone.name)
        bone.keyframe_insert(
            data_path="rotation_quaternion", frame=frame, group=bone.name
        )
        bone.keyframe_insert(data_path="scale", frame=frame, group=bone.name)


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
    actions: dict[str, bpy.types.Action] = {}
    records = []
    for name in EXPECTED_CLIPS:
        frames = samples[name]
        start = min(frames)
        end = max(frames)
        action = bpy.data.actions.new(name)
        animation_data.action = action
        for frame in range(start, end + 1):
            corrected = {
                bone_name: matrix.copy()
                for bone_name, matrix in frames[frame].items()
            }
            apply_grip_correction(corrected)
            if name == "KYX_V6C_TP_RUN":
                apply_run_correction(corrected, frame, start, end)
            for bone in rig.pose.bones:
                bone.matrix_basis = corrected[bone.name]
            bpy.context.view_layer.update()
            key_pose(rig, frame)
        interpolation = "LINEAR" if name == "KYX_V6C_TP_PRIMARY_FIRE" else "BEZIER"
        set_action_interpolation(action, interpolation)
        action["kyx_checkpoint"] = CHECKPOINT
        action["kyx_source_rev14_sha256"] = SOURCE_REV14_SHA256
        action["kyx_grip_correction_embedded"] = True
        action["kyx_run_readability_revision"] = name == "KYX_V6C_TP_RUN"
        actions[name] = action
        records.append(
            {
                "name": name,
                "frameRange": [start, end],
                "sampledEveryIntegerFrame": True,
                "fcurves": len(action_fcurves(action)),
                "interpolation": interpolation,
                "gripCorrection": "embedded_in_action",
                "runCorrection": name == "KYX_V6C_TP_RUN",
            }
        )
    animation_data.action = None
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
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = max(
        int(round(action.frame_range[1])) for action in actions.values()
    )
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    return actions, records


def exporter_kwargs(path: Path) -> dict[str, Any]:
    requested = {
        "filepath": str(path),
        "check_existing": False,
        "export_format": "GLB",
        "use_selection": True,
        "export_copyright": (
            "Includes CC0-derived Blender Human Base Meshes anatomy; "
            "KYX-authored design, rig, materials, clean-room Rev15 hard-surface "
            "details, and gameplay animation refinement. Non-default, non-release, not G6."
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


def mesh_weight_audit(
    obj: bpy.types.Object, bone_names: set[str]
) -> dict[str, Any]:
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


def finger_tip_proximity(
    rig: bpy.types.Object, rifle: bpy.types.Object
) -> dict[str, Any]:
    action = bpy.data.actions["KYX_V6C_TP_IDLE"]
    assign_action(rig, action)
    bpy.context.scene.frame_set(13)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(rifle, depsgraph)
    result = {}
    for side in ("R", "L"):
        result[side] = {}
        for finger in ("index", "middle", "ring", "pinky", "thumb"):
            bone_name = f"{finger}_03.{side}"
            point = rig.matrix_world @ rig.pose.bones[bone_name].tail
            nearest = bvh.find_nearest(point)
            result[side][finger] = {
                "worldTip": [float(value) for value in point],
                "nearestRifleSurfaceDistance": (
                    float(nearest[3]) if nearest is not None else None
                ),
            }
    return result


def action_motion_audit(
    rig: bpy.types.Object, actions: dict[str, bpy.types.Action]
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    idle = actions["KYX_V6C_TP_IDLE"]
    assign_action(rig, idle)
    idle_start = float(idle.frame_range[0])
    bpy.context.scene.frame_set(int(idle_start))
    bpy.context.view_layer.update()
    baseline_palms = palm_relation(rig)
    records = []
    run_samples = []
    for name in EXPECTED_CLIPS:
        action = actions[name]
        assign_action(rig, action)
        start, end = [float(value) for value in action.frame_range]
        sample_frames = sorted(
            {
                start,
                start + (end - start) * 0.25,
                start + (end - start) * 0.5,
                start + (end - start) * 0.75,
                end,
            }
        )
        snapshots = []
        palms = []
        for value in sample_frames:
            bpy.context.scene.frame_set(
                math.floor(value), subframe=value - math.floor(value)
            )
            bpy.context.view_layer.update()
            snapshots.append(pose_snapshot(rig))
            palms.append(palm_relation(rig))
            if name == "KYX_V6C_TP_RUN":
                left = (
                    rig.matrix_world @ rig.pose.bones["foot_anchor.L"].matrix
                ).translation
                right = (
                    rig.matrix_world @ rig.pose.bones["foot_anchor.R"].matrix
                ).translation
                run_samples.append(
                    {
                        "frame": value,
                        "leftFootHead": [float(component) for component in left],
                        "rightFootHead": [float(component) for component in right],
                        "sagittalSeparation": abs(float(left.y - right.y)),
                        "verticalSeparation": abs(float(left.z - right.z)),
                    }
                )
        records.append(
            {
                "name": name,
                "frameRange": [start, end],
                "maxPoseMatrixDelta": max(
                    max_delta(snapshots[0][bone], snapshot[bone])
                    for snapshot in snapshots[1:]
                    for bone in snapshots[0]
                ),
                "variedBones": sum(
                    any(
                        max_delta(snapshots[0][bone], snapshot[bone]) > 1.0e-4
                        for snapshot in snapshots[1:]
                    )
                    for bone in snapshots[0]
                ),
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
                "endPalmRelationDelta": max_delta(
                    baseline_palms, palms[-1]
                ),
            }
        )
    return records, {
        "samples": run_samples,
        "maximumSagittalFootSeparation": max(
            record["sagittalSeparation"] for record in run_samples
        ),
        "maximumVerticalFootSeparation": max(
            record["verticalSeparation"] for record in run_samples
        ),
    }


def audit_reimport(
    glb_path: Path, proof_path: Path
) -> dict[str, Any]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(glb_path))
    if "FINISHED" not in result:
        raise RuntimeError(f"Fresh Rev15 import failed: {result}")
    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    rig = max(rigs, key=lambda obj: len(obj.data.bones), default=None)
    if rig is None:
        raise RuntimeError("Fresh Rev15 import contains no armature")
    helpers = [obj for obj in bpy.data.objects if importer_helper(obj)]
    meshes = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH" and obj not in helpers
    ]
    roles = {
        role: next(
            (
                obj
                for obj in meshes
                if f"LOD0_{role.upper()}_REV15" in obj.name.upper()
            ),
            None,
        )
        for role in ROLE_TOKENS
    }
    actions = {action.name: action for action in bpy.data.actions}
    if set(actions) != set(EXPECTED_CLIPS):
        raise RuntimeError(
            f"Fresh Rev15 action contract mismatch: {sorted(actions)}"
        )
    motion, run = action_motion_audit(rig, actions)
    rifle = roles["rifle"]
    if rifle is None:
        raise RuntimeError("Fresh Rev15 import contains no rifle role")
    proximity = finger_tip_proximity(rig, rifle)
    contact_attribute = rifle.data.attributes.get("_KYX_CONTACT_MASK")
    contact_count = (
        sum(float(record.value) > 0.5 for record in contact_attribute.data)
        if contact_attribute is not None
        else 0
    )
    bone_names = {bone.name for bone in rig.data.bones}
    role_records = {
        role: (
            {
                "present": True,
                "name": obj.name,
                "triangles": triangle_count(obj),
                "vertices": len(obj.data.vertices),
                "materials": [
                    slot.material.name
                    for slot in obj.material_slots
                    if slot.material is not None
                ],
                "uvLayers": [layer.name for layer in obj.data.uv_layers],
                "colorAttributes": [
                    attribute.name for attribute in obj.data.color_attributes
                ],
                "weights": mesh_weight_audit(obj, bone_names),
            }
            if obj is not None
            else {"present": False}
        )
        for role, obj in roles.items()
    }
    assign_action(rig, actions["KYX_V6C_TP_IDLE"])
    bpy.context.scene.frame_set(13)
    bpy.context.view_layer.update()
    proof_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=str(proof_path), check_existing=False, compress=True
    )
    return {
        "operatorResult": sorted(result),
        "proofBlend": {
            "path": str(proof_path),
            "bytes": proof_path.stat().st_size,
            "sha256": sha256(proof_path),
        },
        "armatures": len(rigs),
        "bones": len(rig.data.bones),
        "meshes": len(meshes),
        "excludedImporterHelperMeshes": sorted(obj.name for obj in helpers),
        "actions": sorted(actions),
        "roles": role_records,
        "clips": motion,
        "runReadability": run,
        "fingerTipProximity": proximity,
        "contactMaskVertices": contact_count,
    }


def main() -> None:
    (
        source_path,
        candidate_path,
        glb_path,
        proof_path,
        report_path,
    ) = script_args()
    for path in (candidate_path, glb_path, proof_path, report_path):
        path.parent.mkdir(parents=True, exist_ok=True)
    source_hash_before = sha256(source_path)
    source_bytes_before = source_path.stat().st_size
    if (
        source_hash_before != SOURCE_REV14_SHA256
        or source_bytes_before != SOURCE_REV14_BYTES
    ):
        raise RuntimeError(
            "Pinned Rev14 source mismatch: "
            f"{source_hash_before}/{source_bytes_before}"
        )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_result = bpy.ops.import_scene.gltf(filepath=str(source_path))
    if "FINISHED" not in import_result:
        raise RuntimeError(f"Rev14 import failed: {import_result}")
    bpy.context.scene.render.fps = FPS
    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    rig = max(rigs, key=lambda obj: len(obj.data.bones), default=None)
    if rig is None or len(rig.data.bones) != EXPECTED_BONES:
        raise RuntimeError("Expected one 52-bone Rev14 rig")
    helpers = [obj for obj in bpy.data.objects if importer_helper(obj)]
    meshes = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH" and obj not in helpers
    ]
    if len(meshes) != 3:
        raise RuntimeError(f"Expected three Rev14 meshes, got {len(meshes)}")
    roles = {
        role: next(
            (obj for obj in meshes if token in obj.name.upper()),
            None,
        )
        for role, token in ROLE_TOKENS.items()
    }
    if not all(roles.values()):
        raise RuntimeError(
            f"Unable to resolve Rev14 roles: "
            f"{ {role: obj.name if obj else None for role, obj in roles.items()} }"
        )
    source_triangles = sum(triangle_count(obj) for obj in meshes)
    if source_triangles != SOURCE_REV14_TRIANGLES:
        raise RuntimeError(
            f"Rev14 triangle mismatch: {source_triangles} != {SOURCE_REV14_TRIANGLES}"
        )
    source_actions = {action.name: action for action in bpy.data.actions}
    if set(source_actions) != set(EXPECTED_CLIPS):
        raise RuntimeError(
            f"Rev14 clip contract mismatch: {sorted(source_actions)}"
        )

    samples = sample_source_actions(rig, source_actions)
    surface_records = []
    for role, obj in roles.items():
        if obj is None:
            raise RuntimeError(f"Missing role {role}")
        material = obj.material_slots[0].material
        if material is None:
            raise RuntimeError(f"{role} role has no material")
        tune_material(material, role)
        surface_records.append(recolor_surface(obj, role))

    rifle = roles["rifle"]
    if rifle is None:
        raise RuntimeError("Missing rifle role")
    detail_record = join_clean_room_grips(rifle, rig, source_actions)
    actions, action_records = rebuild_actions(rig, samples)

    for role, obj in roles.items():
        if obj is None:
            continue
        obj.name = f"KYX_V6C_LOD0_{role.upper()}_REV15"
        obj.data.name = f"{obj.name}_MESH"
        obj["kyx_checkpoint"] = CHECKPOINT
        obj["kyx_source_rev14_sha256"] = SOURCE_REV14_SHA256
        obj["kyx_non_default_non_release_not_g6"] = True
    rig.name = "V6CF15_ContactMotionSurfaceRig"
    rig["kyx_checkpoint"] = CHECKPOINT
    rig["kyx_source_rev14_sha256"] = SOURCE_REV14_SHA256
    rig["kyx_non_default_non_release_not_g6"] = True
    rig["kyx_visual_acceptance"] = "REQUIRED"
    bpy.context.scene["kyx_checkpoint"] = CHECKPOINT
    bpy.context.scene["kyx_candidate_only"] = True

    candidate_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=str(candidate_path), check_existing=False, compress=True
    )
    candidate_hash = sha256(candidate_path)

    bpy.ops.object.select_all(action="DESELECT")
    export_objects = [rig] + [roles[role] for role in ("soft", "hard", "rifle")]
    for obj in export_objects:
        if obj is None:
            continue
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    kwargs = exporter_kwargs(glb_path)
    export_result = bpy.ops.export_scene.gltf(**kwargs)
    if "FINISHED" not in export_result:
        raise RuntimeError(f"Rev15 export failed: {export_result}")
    glb = parse_glb(glb_path)
    source_hash_after = sha256(source_path)
    source_bytes_after = source_path.stat().st_size
    reimport = audit_reimport(glb_path, proof_path)

    imported_clips = {
        record["name"]: record for record in reimport["clips"]
    }
    non_reload = [
        name for name in EXPECTED_CLIPS if name != "KYX_V6C_TP_RELOAD"
    ]
    finger_distances = [
        record["nearestRifleSurfaceDistance"]
        for side in ("R", "L")
        for finger, record in reimport["fingerTipProximity"][side].items()
        if finger != "thumb"
    ]
    assertions = {
        "rev14SourceHashAndBytesPinnedUnchanged": (
            source_hash_before == source_hash_after == SOURCE_REV14_SHA256
            and source_bytes_before == source_bytes_after == SOURCE_REV14_BYTES
        ),
        "rev15ArtifactsUseNewImmutableLane": (
            "rev15" in str(candidate_path).lower()
            and "rev14" not in candidate_path.name.lower()
            and "rev15" in str(glb_path).lower()
            and "rev14" not in glb_path.name.lower()
        ),
        "threeRoleMeshesRemainUnderHardTriangleLimit": (
            glb["counts"]["meshes"] == 3
            and glb["counts"]["primitives"] == 3
            and glb["counts"]["triangles"] <= HARD_TRIANGLE_LIMIT
            and glb["counts"]["triangles"] > SOURCE_REV14_TRIANGLES
        ),
        "one52JointSkinAndNoExternalUris": (
            glb["counts"]["skins"] == 1
            and glb["skinJointCounts"] == [EXPECTED_BONES]
            and not glb["externalUris"]
        ),
        "exactTenEmbeddedClips": (
            glb["counts"]["animations"] == 10
            and {record["name"] for record in glb["animations"]}
            == set(EXPECTED_CLIPS)
            and all(record["channels"] == EXPECTED_BONES * 3 for record in glb["animations"])
        ),
        "allPrimitivesCarryRuntimeSkinUvNormalColor": all(
            {
                "POSITION",
                "NORMAL",
                "JOINTS_0",
                "WEIGHTS_0",
                "TEXCOORD_0",
                "COLOR_0",
            }
            <= set(record["attributes"])
            for record in glb["primitives"]
        ),
        "freshReimportHasThreeRolesAnd52Bones": (
            reimport["meshes"] == 3
            and reimport["bones"] == EXPECTED_BONES
            and all(record["present"] for record in reimport["roles"].values())
        ),
        "freshReimportWeightsRemainValid": all(
            record["weights"]["zeroWeightVertices"] == 0
            and record["weights"]["maximumInfluences"] <= 4
            for record in reimport["roles"].values()
        ),
        "cleanRoomRoundedWeaponGripsAdded": (
            detail_record["addedTriangles"] > 0
            and len(detail_record["additions"]) == 2
        ),
        "pantsAndBootSurfaceTreatmentsApplied": (
            next(
                record["changedVertices"]
                for record in surface_records
                if record["role"] == "soft"
            )
            > 1000
            and next(
                record["changedVertices"]
                for record in surface_records
                if record["role"] == "hard"
            )
            > 500
        ),
        "fingerTipsHaveBoundedRifleSurfaceProximity": (
            all(distance is not None for distance in finger_distances)
            and max(float(distance) for distance in finger_distances) <= 0.014
        ),
        "runHasReadableSagittalAndVerticalSeparation": (
            reimport["runReadability"]["maximumSagittalFootSeparation"] >= 0.30
            and reimport["runReadability"]["maximumVerticalFootSeparation"] >= 0.03
        ),
        "loopSeamsRemainClosed": all(
            imported_clips[name]["loopSeamMaxMatrixDelta"] <= 1.0e-4
            for name in LOOP_CLIPS
        ),
        "palmRelationStableOutsideReloadAndReloadReturns": (
            all(
                imported_clips[name]["maxPalmRelationDelta"] <= 1.0e-4
                for name in non_reload
            )
            and imported_clips["KYX_V6C_TP_RELOAD"]["maxPalmRelationDelta"] > 0.005
            and imported_clips["KYX_V6C_TP_RELOAD"]["endPalmRelationDelta"] <= 1.0e-4
        ),
        "rifleContactMaskSurvivesRoundTrip": reimport["contactMaskVertices"] > 1000,
    }
    passed = all(assertions.values())
    report = {
        "schema": "kyx-v6c-character-rev15-export-reimport-audit-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "status": STATUS_PASS if passed else STATUS_FAIL,
        "sourceRev14": {
            "path": str(source_path),
            "bytesBefore": source_bytes_before,
            "bytesAfter": source_bytes_after,
            "sha256Before": source_hash_before,
            "sha256After": source_hash_after,
            "triangles": source_triangles,
            "immutable": source_hash_before == source_hash_after
            and source_bytes_before == source_bytes_after,
        },
        "candidateBlend": {
            "path": str(candidate_path),
            "bytes": candidate_path.stat().st_size,
            "sha256": candidate_hash,
        },
        "surfaceTreatment": surface_records,
        "cleanRoomWeaponGripDetails": detail_record,
        "animationAuthoring": {
            "method": (
                "Every integer source frame was sampled from pinned Rev14, "
                "then bone-space grip and run-readability corrections were "
                "embedded into newly authored Rev15 actions."
            ),
            "actions": action_records,
        },
        "export": {
            "path": str(glb_path),
            "operatorResult": sorted(export_result),
            "operatorKwargs": kwargs,
            **glb,
        },
        "reimport": reimport,
        "assertions": assertions,
        "visualDecision": "REVIEW_REQUIRED_NOT_HUMAN_ACCEPTED_NOT_G6",
        "nonClaims": [
            "Rev15 is isolated and does not replace public/soldier.glb.",
            "Numeric proximity is supporting evidence and does not prove clipping-free visual contact.",
            "Deterministic direct GLB renders and human review remain required.",
            "LOD1, LOD2, first-person arms, final texture atlases, product integration, 2/4/8 performance, release eligibility, and G6 remain open.",
        ],
    }
    report_path.write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "status": report["status"],
                "source": source_hash_before,
                "candidate": glb["sha256"],
                "triangles": glb["counts"]["triangles"],
                "assertions": assertions,
                "report": str(report_path),
            },
            sort_keys=True,
        )
    )
    if not passed:
        failed = [name for name, value in assertions.items() if not value]
        raise RuntimeError(f"Rev15 audit failed closed: {failed}")


if __name__ == "__main__":
    main()
