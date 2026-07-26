"""Author an immutable Rev16 corrective character candidate from Rev15.

Rev16 is deliberately isolated from the public runtime.  It removes the
visible soft-foot islands, replaces the fragmented central torso/waist pieces
with a smoothly segmented tactical shell, adds fitted ankle gaiters, applies a
coherent broad-mass color treatment, strengthens both weapon grips, and gives
the run cycle a planted stride and stronger forward weight.

The script exports and fresh-reimports the exact candidate GLB.  It never
touches ``public/soldier.glb`` and never claims G6.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
import bmesh
import importlib.util
import json
import math
from pathlib import Path
import sys
from typing import Any, Callable

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree


CHECKPOINT = "V6C_CHARACTER_CORRECTIVE_CONTACT_SILHOUETTE_CANDIDATE_REV16"
STATUS_PASS = "PASS_BOUNDED_REV16_CORRECTIVE_REVIEW_CANDIDATE_NOT_G6"
STATUS_FAIL = "FAIL_BOUNDED_REV16_CORRECTIVE_REVIEW_CANDIDATE"
SOURCE_REV15_SHA256 = (
    "668549acba50ca3f0f096e28c3001be0f13f80ce27713a18f92de6d724964c9c"
)
SOURCE_REV15_BYTES = 3_479_568
SOURCE_REV15_TRIANGLES = 42_106
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
    "soft": "LOD0_SOFT_REV15",
    "hard": "LOD0_HARD_REV15",
    "rifle": "LOD0_RIFLE_REV15",
}


def load_rev15_helpers() -> Any:
    source = Path(__file__).resolve().with_name(
        "author_export_v6c_character_rev15.py"
    )
    spec = importlib.util.spec_from_file_location("kyx_rev15_author_helpers", source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load Rev15 helpers from {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


REV15 = load_rev15_helpers()


def script_args() -> tuple[Path, Path, Path, Path, Path]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <rev15.glb> <rev16.blend> <rev16.glb> "
            "<reimport.blend> <audit.json>"
        )
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 5:
        raise SystemExit(f"Expected five arguments, got {len(values)}")
    return tuple(Path(value).resolve() for value in values)  # type: ignore[return-value]


def component_records(mesh: bpy.types.Mesh) -> list[dict[str, Any]]:
    by_vertex: dict[int, list[int]] = defaultdict(list)
    for polygon in mesh.polygons:
        for vertex_index in polygon.vertices:
            by_vertex[int(vertex_index)].append(polygon.index)
    seen: set[int] = set()
    records = []
    for polygon in mesh.polygons:
        if polygon.index in seen:
            continue
        stack = [polygon.index]
        seen.add(polygon.index)
        faces: list[int] = []
        vertices: set[int] = set()
        while stack:
            face_index = stack.pop()
            faces.append(face_index)
            for vertex_index in mesh.polygons[face_index].vertices:
                vertices.add(int(vertex_index))
                for neighbour in by_vertex[int(vertex_index)]:
                    if neighbour not in seen:
                        seen.add(neighbour)
                        stack.append(neighbour)
        points = [mesh.vertices[index].co for index in vertices]
        minimum = Vector(
            tuple(min(point[axis] for point in points) for axis in range(3))
        )
        maximum = Vector(
            tuple(max(point[axis] for point in points) for axis in range(3))
        )
        records.append(
            {
                "faces": faces,
                "vertices": vertices,
                "minimum": minimum,
                "maximum": maximum,
            }
        )
    return records


def remove_components(
    obj: bpy.types.Object,
    reason: str,
    predicate: Callable[[Vector, Vector], bool],
) -> dict[str, Any]:
    mesh = obj.data
    before_triangles = REV15.triangle_count(obj)
    records = component_records(mesh)
    selected = [
        record
        for record in records
        if predicate(record["minimum"], record["maximum"])
    ]
    vertex_indices: set[int] = set()
    face_count = 0
    bounds = []
    for record in selected:
        vertex_indices.update(record["vertices"])
        face_count += len(record["faces"])
        bounds.append(
            {
                "minimum": [round(float(value), 6) for value in record["minimum"]],
                "maximum": [round(float(value), 6) for value in record["maximum"]],
                "faces": len(record["faces"]),
                "vertices": len(record["vertices"]),
            }
        )
    if vertex_indices:
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bm.verts.ensure_lookup_table()
        bmesh.ops.delete(
            bm,
            geom=[bm.verts[index] for index in sorted(vertex_indices)],
            context="VERTS",
        )
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
    return {
        "reason": reason,
        "componentsBefore": len(records),
        "componentsRemoved": len(selected),
        "facesRemoved": face_count,
        "verticesRemoved": len(vertex_indices),
        "trianglesBefore": before_triangles,
        "trianglesAfter": REV15.triangle_count(obj),
        "removedBounds": bounds,
    }


def remove_soft_foot_islands(obj: bpy.types.Object) -> dict[str, Any]:
    return remove_components(
        obj,
        "remove_disconnected_soft_foot_and_toe_islands_hidden_inside_boots",
        lambda minimum, maximum: (
            maximum.z <= 0.205
            and minimum.z <= 0.04
            and max(abs(minimum.x), abs(maximum.x)) >= 0.11
        ),
    )


def remove_fragmented_central_hard_parts(obj: bpy.types.Object) -> dict[str, Any]:
    def fragmented(minimum: Vector, maximum: Vector) -> bool:
        size = maximum - minimum
        thin_vertical_strap = (
            size.x < 0.030
            and size.y < 0.030
            and size.z > 0.12
            and minimum.z > 0.72
            and maximum.z < 1.62
        )
        central_torso_or_waist = (
            minimum.z >= 0.72
            and maximum.z <= 1.52
            and minimum.x < 0.12
            and maximum.x > -0.12
            and max(abs(minimum.x), abs(maximum.x)) < 0.34
        )
        return thin_vertical_strap or central_torso_or_waist

    return remove_components(
        obj,
        "remove_floating_straps_and_fragmented_central_torso_waist_parts",
        fragmented,
    )


def coherent_surface_color(obj: bpy.types.Object, role: str) -> dict[str, Any]:
    mesh = obj.data
    color = REV15.find_color_attribute(mesh)
    hand_groups = {
        name
        for name in obj.vertex_groups.keys()
        if any(
            token in name
            for token in (
                "palm.",
                "wrist.",
                "thumb_",
                "index_",
                "middle_",
                "ring_",
                "pinky_",
            )
        )
    }
    changed: set[int] = set()
    bands: dict[str, int] = defaultdict(int)
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex_index = mesh.loops[loop_index].vertex_index
            vertex = mesh.vertices[vertex_index]
            position = vertex.co
            if role == "soft":
                hand_weight = REV15.group_weight(obj, vertex, hand_groups)
                if hand_weight > 0.10:
                    replacement = (0.004, 0.009, 0.014, 1.0)
                    band = "sealed_gloves"
                elif position.z > 1.54:
                    replacement = (0.16, 0.105, 0.075, 1.0)
                    band = "restrained_face"
                elif position.z < 1.04:
                    replacement = (0.008, 0.017, 0.026, 1.0)
                    band = "continuous_pants"
                else:
                    replacement = (0.014, 0.026, 0.036, 1.0)
                    band = "continuous_undersuit"
            elif role == "hard":
                if position.z < 0.34:
                    replacement = (0.003, 0.009, 0.014, 1.0)
                    band = "boots"
                elif position.z > 1.53:
                    replacement = (0.035, 0.075, 0.095, 1.0)
                    band = "helmet"
                else:
                    replacement = (0.025, 0.055, 0.073, 1.0)
                    band = "armor"
            else:
                continue
            color.data[loop_index].color = replacement
            changed.add(vertex_index)
            bands[band] += 1
    mesh.update()
    return {
        "role": role,
        "changedVertices": len(changed),
        "changedCorners": sum(bands.values()),
        "broadValueMasses": dict(sorted(bands.items())),
        "colorAttribute": color.name,
    }


def tune_material(material: bpy.types.Material, role: str) -> None:
    material.name = f"KYX_V6C_REV16_{role.upper()}_SURFACE_ROLE"
    material["kyx_checkpoint"] = CHECKPOINT
    material["kyx_clean_room_surface_revision"] = "rev16"
    bsdf = REV15.material_bsdf(material)
    if bsdf is not None:
        bsdf.inputs["Roughness"].default_value = {
            "soft": 0.88,
            "hard": 0.48,
            "rifle": 0.36,
        }[role]
        bsdf.inputs["Metallic"].default_value = {
            "soft": 0.01,
            "hard": 0.28,
            "rifle": 0.54,
        }[role]


def add_skinned_ring_shell(
    name: str,
    profiles: list[dict[str, Any]],
    segments: int,
    material: bpy.types.Material,
    rig: bpy.types.Object,
    center_x: float = 0.0,
    center_y: float = -0.01,
    color_mode: str = "torso",
) -> bpy.types.Object:
    vertices: list[tuple[float, float, float]] = []
    weights: list[dict[str, float]] = []
    for profile in profiles:
        for segment in range(segments):
            angle = math.tau * segment / segments
            vertices.append(
                (
                    center_x + float(profile["radiusX"]) * math.cos(angle),
                    center_y + float(profile["radiusY"]) * math.sin(angle),
                    float(profile["z"]),
                )
            )
            weights.append(dict(profile["weights"]))
    bottom_center = len(vertices)
    vertices.append((center_x, center_y, float(profiles[0]["z"])))
    weights.append(dict(profiles[0]["weights"]))
    top_center = len(vertices)
    vertices.append((center_x, center_y, float(profiles[-1]["z"])))
    weights.append(dict(profiles[-1]["weights"]))
    faces: list[tuple[int, ...]] = []
    for ring in range(len(profiles) - 1):
        start = ring * segments
        following = (ring + 1) * segments
        for segment in range(segments):
            next_segment = (segment + 1) % segments
            faces.append(
                (
                    start + segment,
                    start + next_segment,
                    following + next_segment,
                    following + segment,
                )
            )
    for segment in range(segments):
        next_segment = (segment + 1) % segments
        faces.append((bottom_center, segment, next_segment))
        top_start = (len(profiles) - 1) * segments
        faces.append((top_center, top_start + next_segment, top_start + segment))
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    obj.parent = rig
    armature = obj.modifiers.new(name="KYX_REV16_ARMATURE", type="ARMATURE")
    armature.object = rig
    for bone_name in sorted({name for record in weights for name in record}):
        group = obj.vertex_groups.new(name=bone_name)
        indices = [
            index
            for index, record in enumerate(weights)
            if record.get(bone_name, 0.0) > 0.0
        ]
        for index in indices:
            group.add([index], float(weights[index][bone_name]), "REPLACE")
    color = REV15.find_color_attribute(mesh)
    for polygon in mesh.polygons:
        for loop_index in polygon.loop_indices:
            vertex = mesh.vertices[mesh.loops[loop_index].vertex_index]
            if color_mode == "torso":
                if vertex.co.z < 1.02:
                    rgba = (0.018, 0.040, 0.055, 1.0)
                elif vertex.co.y < -0.13 and vertex.co.z > 1.15:
                    rgba = (0.070, 0.145, 0.175, 1.0)
                elif vertex.co.x > 0.16 and vertex.co.z > 1.25:
                    rgba = (0.13, 0.055, 0.035, 1.0)
                else:
                    rgba = (0.030, 0.070, 0.090, 1.0)
            else:
                rgba = (
                    (0.015, 0.040, 0.055, 1.0)
                    if vertex.co.z > 0.20
                    else (0.004, 0.012, 0.018, 1.0)
                )
            color.data[loop_index].color = rgba
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    obj["kyx_checkpoint"] = CHECKPOINT
    obj["kyx_clean_room_corrective_shell"] = color_mode
    return obj


def add_corrective_shells(
    hard: bpy.types.Object,
    rig: bpy.types.Object,
) -> dict[str, Any]:
    material = hard.material_slots[0].material
    if material is None:
        raise RuntimeError("Hard role has no material")
    torso = add_skinned_ring_shell(
        "KYX_REV16_CONTINUOUS_TACTICAL_TORSO",
        [
            {
                "z": 0.83,
                "radiusX": 0.235,
                "radiusY": 0.155,
                "weights": {"root": 1.0},
            },
            {
                "z": 0.91,
                "radiusX": 0.275,
                "radiusY": 0.175,
                "weights": {"root": 0.65, "spine_01": 0.35},
            },
            {
                "z": 1.00,
                "radiusX": 0.300,
                "radiusY": 0.190,
                "weights": {"spine_01": 1.0},
            },
            {
                "z": 1.10,
                "radiusX": 0.292,
                "radiusY": 0.185,
                "weights": {"spine_01": 0.70, "spine_02": 0.30},
            },
            {
                "z": 1.22,
                "radiusX": 0.315,
                "radiusY": 0.190,
                "weights": {"spine_02": 1.0},
            },
            {
                "z": 1.34,
                "radiusX": 0.335,
                "radiusY": 0.175,
                "weights": {"spine_02": 0.35, "chest": 0.65},
            },
            {
                "z": 1.45,
                "radiusX": 0.285,
                "radiusY": 0.145,
                "weights": {"chest": 1.0},
            },
        ],
        40,
        material,
        rig,
        color_mode="torso",
    )
    gaiters = []
    for side, center_x in (("L", 0.145), ("R", -0.145)):
        gaiters.append(
            add_skinned_ring_shell(
                f"KYX_REV16_FITTED_ANKLE_GAITER_{side}",
                [
                    {
                        "z": 0.105,
                        "radiusX": 0.072,
                        "radiusY": 0.090,
                        "weights": {f"shin_anchor.{side}": 1.0},
                    },
                    {
                        "z": 0.205,
                        "radiusX": 0.076,
                        "radiusY": 0.086,
                        "weights": {f"shin_anchor.{side}": 1.0},
                    },
                    {
                        "z": 0.315,
                        "radiusX": 0.069,
                        "radiusY": 0.076,
                        "weights": {f"shin_anchor.{side}": 1.0},
                    },
                ],
                28,
                material,
                rig,
                center_x=center_x,
                center_y=-0.015,
                color_mode="gaiter",
            )
        )
    additions = [torso, *gaiters]
    records = [
        {
            "name": obj.name,
            "triangles": REV15.triangle_count(obj),
            "vertices": len(obj.data.vertices),
            "weightedGroups": sorted(group.name for group in obj.vertex_groups),
        }
        for obj in additions
    ]
    before = REV15.triangle_count(hard)
    bpy.ops.object.select_all(action="DESELECT")
    hard.hide_set(False)
    hard.hide_viewport = False
    hard.select_set(True)
    for obj in additions:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = hard
    result = bpy.ops.object.join()
    if "FINISHED" not in result:
        raise RuntimeError(f"Unable to join Rev16 corrective shells: {result}")
    while len(hard.data.materials) > 1:
        hard.data.materials.pop(index=len(hard.data.materials) - 1)
    for polygon in hard.data.polygons:
        polygon.material_index = 0
    hard.data.update()
    return {
        "method": "clean_room_segmented_torso_and_fitted_ankle_shells",
        "sourceHardTriangles": before,
        "additions": records,
        "addedTriangles": REV15.triangle_count(hard) - before,
        "resultHardTriangles": REV15.triangle_count(hard),
    }


def apply_rev16_grip_correction(basis: dict[str, Matrix]) -> None:
    increments = {
        # Preserve the Rev15 trigger-index placement while closing the other
        # firing-hand digits only enough to read as a wrap, not a fist driven
        # through the grip.
        ("index", "R"): (0.0, 0.0, 0.0),
        ("middle", "R"): (8.0, 12.0, 8.0),
        ("ring", "R"): (8.0, 12.0, 8.0),
        ("pinky", "R"): (8.0, 12.0, 8.0),
        ("index", "L"): (26.0, 42.0, 28.0),
        ("middle", "L"): (28.0, 46.0, 31.0),
        ("ring", "L"): (28.0, 46.0, 31.0),
        ("pinky", "L"): (26.0, 44.0, 30.0),
    }
    for (finger, side), values in increments.items():
        for joint, degrees in enumerate(values, 1):
            REV15.rotate_basis(
                basis, f"{finger}_0{joint}.{side}", "X", degrees
            )
    for side in ("R", "L"):
        REV15.rotate_basis(basis, f"thumb_01.{side}", "X", 10.0)
        REV15.rotate_basis(basis, f"thumb_02.{side}", "X", 14.0)
        REV15.rotate_basis(basis, f"thumb_03.{side}", "X", 8.0)
    REV15.rotate_basis(basis, "wrist.L", "X", -4.0)
    REV15.rotate_basis(basis, "wrist.L", "Z", -6.0)


def apply_rev16_run_correction(
    basis: dict[str, Matrix], frame: int, start: int, end: int
) -> None:
    phase = math.tau * (frame - start) / max(1, end - start)
    stride = math.cos(phase)
    crossing = 1.0 - abs(stride)
    plant_weight = abs(stride) ** 2
    transverse = math.sin(phase)
    # Put the forward intent into the upper body.  Large root rotations lift
    # both feet around the pelvis pivot and were the cause of the first
    # corrective attempt reading as another airborne pose.
    REV15.rotate_basis(basis, "root", "X", -1.5)
    REV15.rotate_basis(basis, "spine_01", "X", -11.0)
    REV15.rotate_basis(basis, "spine_02", "X", -6.0)
    REV15.rotate_basis(basis, "chest", "X", 4.0)
    REV15.rotate_basis(basis, "spine_01", "Z", 3.5 * transverse)
    REV15.rotate_basis(basis, "chest", "Z", -3.0 * transverse)
    REV15.rotate_basis(basis, "thigh_anchor.L", "X", 10.0 * stride)
    REV15.rotate_basis(basis, "thigh_anchor.R", "X", -10.0 * stride)
    left_recovery = -18.0 * max(-stride, 0.0)
    right_recovery = -18.0 * max(stride, 0.0)
    REV15.rotate_basis(
        basis, "shin_anchor.L", "X", left_recovery - 10.0 * crossing
    )
    REV15.rotate_basis(
        basis, "shin_anchor.R", "X", right_recovery - 10.0 * crossing
    )
    REV15.rotate_basis(basis, "foot_anchor.L", "X", -11.0 * stride)
    REV15.rotate_basis(basis, "foot_anchor.R", "X", 11.0 * stride)
    root = basis["root"].copy()
    # This imported skeleton's root local Y axis maps to world Z; local Z maps
    # to world -Y.  Author the plant curve on local Y so it changes height
    # without spuriously shifting the character forward/backward.
    root.translation = root.translation + Vector(
        (
            0.0,
            -0.220 * plant_weight + 0.018 * (1.0 - plant_weight),
            0.0,
        )
    )
    basis["root"] = root


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
            apply_rev16_grip_correction(corrected)
            if name == "KYX_V6C_TP_RUN":
                apply_rev16_run_correction(corrected, frame, start, end)
                authored_root_location = corrected["root"].translation.copy()
            else:
                authored_root_location = None
            for bone in rig.pose.bones:
                bone.matrix_basis = corrected[bone.name]
            bpy.context.view_layer.update()
            # Blender's layered-action evaluation can restore an unkeyed root
            # location during the dependency-graph update.  Reapply the
            # authored basis translation immediately before keying so the
            # planted-height curve is actually embedded in the exported clip.
            if authored_root_location is not None:
                rig.pose.bones["root"].location = authored_root_location
            REV15.key_pose(rig, frame)
        interpolation = (
            "LINEAR" if name == "KYX_V6C_TP_PRIMARY_FIRE" else "BEZIER"
        )
        REV15.set_action_interpolation(action, interpolation)
        action["kyx_checkpoint"] = CHECKPOINT
        action["kyx_source_rev15_sha256"] = SOURCE_REV15_SHA256
        action["kyx_rev16_grip_correction_embedded"] = True
        action["kyx_rev16_run_weight_revision"] = (
            name == "KYX_V6C_TP_RUN"
        )
        actions[name] = action
        records.append(
            {
                "name": name,
                "frameRange": [start, end],
                "sampledEveryIntegerFrame": True,
                "fcurves": len(REV15.action_fcurves(action)),
                "interpolation": interpolation,
                "rev16GripCorrection": "embedded_in_action",
                "rev16RunWeightCorrection": name == "KYX_V6C_TP_RUN",
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
            "KYX-authored design, rig, materials, clean-room Rev16 corrective "
            "shells, and gameplay animation refinement. Non-default, "
            "non-release, not G6."
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


def finger_proximity_for_pose(
    rig: bpy.types.Object,
    rifle: bpy.types.Object,
    action: bpy.types.Action,
    frame: int,
) -> dict[str, Any]:
    REV15.assign_action(rig, action)
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bvh = BVHTree.FromObject(rifle, depsgraph)
    result: dict[str, Any] = {}
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


def evaluated_minimum_z(meshes: list[bpy.types.Object]) -> float:
    depsgraph = bpy.context.evaluated_depsgraph_get()
    values = []
    for obj in meshes:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        values.extend(
            (evaluated.matrix_world @ vertex.co).z for vertex in mesh.vertices
        )
        evaluated.to_mesh_clear()
    return float(min(values))


def audit_reimport(glb_path: Path, proof_path: Path) -> dict[str, Any]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(glb_path))
    if "FINISHED" not in result:
        raise RuntimeError(f"Fresh Rev16 import failed: {result}")
    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    rig = max(rigs, key=lambda obj: len(obj.data.bones), default=None)
    if rig is None:
        raise RuntimeError("Fresh Rev16 import contains no armature")
    helpers = [obj for obj in bpy.data.objects if REV15.importer_helper(obj)]
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
                if f"LOD0_{role.upper()}_REV16" in obj.name.upper()
            ),
            None,
        )
        for role in ROLE_TOKENS
    }
    actions = {action.name: action for action in bpy.data.actions}
    if set(actions) != set(EXPECTED_CLIPS):
        raise RuntimeError(
            f"Fresh Rev16 action contract mismatch: {sorted(actions)}"
        )
    motion, run = REV15.action_motion_audit(rig, actions)
    rifle = roles["rifle"]
    if rifle is None:
        raise RuntimeError("Fresh Rev16 import contains no rifle role")
    contact = {
        "idleFrame13": finger_proximity_for_pose(
            rig, rifle, actions["KYX_V6C_TP_IDLE"], 13
        ),
        "primaryFireFrame3": finger_proximity_for_pose(
            rig, rifle, actions["KYX_V6C_TP_PRIMARY_FIRE"], 3
        ),
    }
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
                "triangles": REV15.triangle_count(obj),
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
                "weights": REV15.mesh_weight_audit(obj, bone_names),
                "localMinimumZ": min(
                    float(vertex.co.z) for vertex in obj.data.vertices
                ),
            }
            if obj is not None
            else {"present": False}
        )
        for role, obj in roles.items()
    }
    run_floor_samples = []
    for frame in (1, 5, 10, 14, 19):
        REV15.assign_action(rig, actions["KYX_V6C_TP_RUN"])
        bpy.context.scene.frame_set(frame)
        bpy.context.view_layer.update()
        run_floor_samples.append(
            {"frame": frame, "evaluatedMinimumZ": evaluated_minimum_z(meshes)}
        )
    REV15.assign_action(rig, actions["KYX_V6C_TP_IDLE"])
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
            "sha256": REV15.sha256(proof_path),
        },
        "armatures": len(rigs),
        "bones": len(rig.data.bones),
        "meshes": len(meshes),
        "excludedImporterHelperMeshes": sorted(obj.name for obj in helpers),
        "actions": sorted(actions),
        "roles": role_records,
        "clips": motion,
        "runReadability": run,
        "runFloorSamples": run_floor_samples,
        "fingerTipProximity": contact,
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
    source_hash_before = REV15.sha256(source_path)
    source_bytes_before = source_path.stat().st_size
    if (
        source_hash_before != SOURCE_REV15_SHA256
        or source_bytes_before != SOURCE_REV15_BYTES
    ):
        raise RuntimeError(
            "Pinned Rev15 source mismatch: "
            f"{source_hash_before}/{source_bytes_before}"
        )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    import_result = bpy.ops.import_scene.gltf(filepath=str(source_path))
    if "FINISHED" not in import_result:
        raise RuntimeError(f"Rev15 import failed: {import_result}")
    bpy.context.scene.render.fps = FPS
    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    rig = max(rigs, key=lambda obj: len(obj.data.bones), default=None)
    if rig is None or len(rig.data.bones) != EXPECTED_BONES:
        raise RuntimeError("Expected one 52-bone Rev15 rig")
    helpers = [obj for obj in bpy.data.objects if REV15.importer_helper(obj)]
    meshes = [
        obj
        for obj in bpy.data.objects
        if obj.type == "MESH" and obj not in helpers
    ]
    if len(meshes) != 3:
        raise RuntimeError(f"Expected three Rev15 meshes, got {len(meshes)}")
    roles = {
        role: next(
            (obj for obj in meshes if token in obj.name.upper()),
            None,
        )
        for role, token in ROLE_TOKENS.items()
    }
    if not all(roles.values()):
        raise RuntimeError(
            "Unable to resolve Rev15 roles: "
            f"{ {role: obj.name if obj else None for role, obj in roles.items()} }"
        )
    source_triangles = sum(REV15.triangle_count(obj) for obj in meshes)
    if source_triangles != SOURCE_REV15_TRIANGLES:
        raise RuntimeError(
            f"Rev15 triangle mismatch: {source_triangles} != {SOURCE_REV15_TRIANGLES}"
        )
    source_actions = {action.name: action for action in bpy.data.actions}
    if set(source_actions) != set(EXPECTED_CLIPS):
        raise RuntimeError(
            f"Rev15 clip contract mismatch: {sorted(source_actions)}"
        )
    samples = REV15.sample_source_actions(rig, source_actions)

    soft = roles["soft"]
    hard = roles["hard"]
    rifle = roles["rifle"]
    if soft is None or hard is None or rifle is None:
        raise RuntimeError("Missing Rev15 role")
    cleanup_records = [
        remove_soft_foot_islands(soft),
        remove_fragmented_central_hard_parts(hard),
    ]
    surface_records = []
    for role, obj in roles.items():
        if obj is None:
            continue
        material = obj.material_slots[0].material
        if material is None:
            raise RuntimeError(f"{role} role has no material")
        tune_material(material, role)
        if role in {"soft", "hard"}:
            surface_records.append(coherent_surface_color(obj, role))
    shell_record = add_corrective_shells(hard, rig)
    actions, action_records = rebuild_actions(rig, samples)

    for role, obj in roles.items():
        if obj is None:
            continue
        obj.name = f"KYX_V6C_LOD0_{role.upper()}_REV16"
        obj.data.name = f"{obj.name}_MESH"
        obj["kyx_checkpoint"] = CHECKPOINT
        obj["kyx_source_rev15_sha256"] = SOURCE_REV15_SHA256
        obj["kyx_non_default_non_release_not_g6"] = True
    rig.name = "V6CF16_CorrectiveContactSilhouetteRig"
    rig["kyx_checkpoint"] = CHECKPOINT
    rig["kyx_source_rev15_sha256"] = SOURCE_REV15_SHA256
    rig["kyx_non_default_non_release_not_g6"] = True
    rig["kyx_visual_acceptance"] = "REQUIRED"
    rig["kyx_first_person_arms_status"] = "OPEN_NOT_INCLUDED"
    bpy.context.scene["kyx_checkpoint"] = CHECKPOINT
    bpy.context.scene["kyx_candidate_only"] = True

    candidate_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=str(candidate_path), check_existing=False, compress=True
    )
    candidate_hash = REV15.sha256(candidate_path)
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
        raise RuntimeError(f"Rev16 export failed: {export_result}")
    glb = REV15.parse_glb(glb_path)
    source_hash_after = REV15.sha256(source_path)
    source_bytes_after = source_path.stat().st_size
    reimport = audit_reimport(glb_path, proof_path)

    distances = [
        record["nearestRifleSurfaceDistance"]
        for pose in reimport["fingerTipProximity"].values()
        for side in pose.values()
        for record in side.values()
        if record["nearestRifleSurfaceDistance"] is not None
    ]
    assertions = {
        "rev15SourceHashAndBytesPinnedUnchanged": (
            source_hash_before == source_hash_after == SOURCE_REV15_SHA256
            and source_bytes_before == source_bytes_after == SOURCE_REV15_BYTES
        ),
        "rev16ArtifactsUseNewImmutableLane": (
            "rev16" in str(candidate_path).lower()
            and "rev15" not in candidate_path.name.lower()
            and "rev16" in str(glb_path).lower()
            and "rev15" not in glb_path.name.lower()
        ),
        "threeRoleMeshesRemainUnderHardTriangleLimit": (
            glb["counts"]["meshes"] == 3
            and glb["counts"]["primitives"] == 3
            and glb["counts"]["triangles"] <= HARD_TRIANGLE_LIMIT
        ),
        "one52JointSkinAndNoExternalUris": (
            glb["counts"]["skins"] == 1
            and glb["skinJointCounts"] == [EXPECTED_BONES]
            and not glb["externalUris"]
        ),
        "exactTenEmbeddedClipsPreserved": (
            glb["counts"]["animations"] == 10
            and {record["name"] for record in glb["animations"]}
            == set(EXPECTED_CLIPS)
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
        "softFootIslandsWereRemoved": (
            cleanup_records[0]["componentsRemoved"] > 0
            and cleanup_records[0]["trianglesAfter"]
            < cleanup_records[0]["trianglesBefore"]
        ),
        "fragmentedCentralHardPartsWereReplaced": (
            cleanup_records[1]["componentsRemoved"] > 0
            and shell_record["addedTriangles"] > 0
        ),
        "coherentBroadSurfaceMassesApplied": all(
            record["changedVertices"] > 1000 for record in surface_records
        ),
        "bothHandFingerTipsRemainNearRifleSurface": (
            len(distances) == 20 and max(float(value) for value in distances) <= 0.03
        ),
        "runStrideHasPlantedExtremes": (
            reimport["runFloorSamples"][0]["evaluatedMinimumZ"] <= 0.04
            and reimport["runFloorSamples"][2]["evaluatedMinimumZ"] <= 0.04
            and reimport["runReadability"]["maximumSagittalFootSeparation"] >= 0.45
        ),
        "rifleContactMaskSurvivesRoundTrip": (
            reimport["contactMaskVertices"] > 1000
        ),
    }
    passed = all(assertions.values())
    report = {
        "schema": "kyx-v6c-character-rev16-export-reimport-audit-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "status": STATUS_PASS if passed else STATUS_FAIL,
        "sourceRev15": {
            "path": str(source_path),
            "bytesBefore": source_bytes_before,
            "bytesAfter": source_bytes_after,
            "sha256Before": source_hash_before,
            "sha256After": source_hash_after,
            "triangles": source_triangles,
            "immutable": (
                source_hash_before == source_hash_after
                and source_bytes_before == source_bytes_after
            ),
        },
        "candidateBlend": {
            "path": str(candidate_path),
            "bytes": candidate_path.stat().st_size,
            "sha256": candidate_hash,
        },
        "geometryCleanup": cleanup_records,
        "surfaceTreatment": surface_records,
        "correctiveShells": shell_record,
        "animationAuthoring": {
            "method": (
                "Every integer Rev15 frame was sampled, then additional "
                "finger closure and planted weighted-run corrections were "
                "embedded into new Rev16 actions."
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
            "Rev16 is isolated and does not replace public/soldier.glb.",
            "Numeric proximity does not prove visually correct or clipping-free contact.",
            "Direct exact-current-GLB renders and human review remain required.",
            "The preserved ten-clip subset is not the complete handoff animation matrix.",
            "LOD1, LOD2, first-person arms, final atlases, runtime integration, performance, release eligibility, and G6 remain open.",
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
        raise RuntimeError(f"Rev16 audit failed closed: {failed}")


if __name__ == "__main__":
    main()
