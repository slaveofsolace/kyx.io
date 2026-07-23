"""Author the KYX V6 CONTACT-FIRST full upper-body/finger rig proof.

This is a deliberately bounded recovery lane.  It starts only from the pinned
V6-A anatomy sculpt, preserves that continuous body mesh, builds a real
deformation armature, poses both complete anatomical hands onto a simplified
rifle/contact fixture, and saves a reusable Blend.  It authors no garment,
armor, helmet, production weapon art, runtime export, or G6 acceptance claim.

Run with Blender 5.1.2 in background mode with auto-execution disabled:
  blender --background <working-copy.blend> --factory-startup --disable-autoexec \
    --python author_v6_contact_first_rig_rev1.py -- \
    <immutable-v6a.blend> <working-copy.blend> <author-report.json>
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector


PINNED_SOURCE_SHA256 = "074c17b819c9bc564f042d2dbc24bb5e359e428fce61f6cc8502a351307afa2d"
BODY_NAME = "KYX_V6A_AnatomySculpt_Body"
EYE_NAMES = ("KYX_V6A_AnatomySculpt_Eye.L", "KYX_V6A_AnatomySculpt_Eye.R")
PREFIX = "V6CF_"


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <immutable-v6a.blend> <working.blend> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rounded(vector: Vector) -> list[float]:
    return [round(float(value), 6) for value in vector]


def material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.5,
    alpha: float = 1.0,
    emission: float = 0.0,
) -> bpy.types.Material:
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    value.diffuse_color = (color[0], color[1], color[2], alpha)
    principled = value.node_tree.nodes.get("Principled BSDF")
    principled.inputs["Base Color"].default_value = (color[0], color[1], color[2], 1.0)
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Alpha"].default_value = alpha
    if emission > 0.0:
        principled.inputs["Emission Color"].default_value = (color[0], color[1], color[2], 1.0)
        principled.inputs["Emission Strength"].default_value = emission
    if alpha < 1.0:
        value.diffuse_color = (color[0], color[1], color[2], alpha)
        if hasattr(value, "surface_render_method"):
            value.surface_render_method = "DITHERED"
        value.use_transparency_overlap = False
    return value


def assign_material(obj: bpy.types.Object, value: bpy.types.Material) -> None:
    if obj.type != "MESH":
        return
    obj.data.materials.clear()
    obj.data.materials.append(value)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True


def link_only(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def box_mesh(
    name: str,
    center: Vector,
    dimensions: tuple[float, float, float],
    right_axis: Vector,
    forward_axis: Vector,
    collection: bpy.types.Collection,
    value: bpy.types.Material,
    bevel: float = 0.0,
) -> bpy.types.Object:
    r = right_axis.normalized() * (dimensions[0] * 0.5)
    f = forward_axis.normalized() * (dimensions[1] * 0.5)
    u = Vector((0.0, 0.0, dimensions[2] * 0.5))
    vertices = []
    for rz, fz, uz in (
        (-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
        (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1),
    ):
        vertices.append(tuple(center + r * rz + f * fz + u * uz))
    faces = (
        (0, 1, 2, 3), (4, 7, 6, 5),
        (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (4, 0, 3, 7),
    )
    mesh = bpy.data.meshes.new(f"{name}_Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    assign_material(obj, value)
    if bevel > 0.0:
        modifier = obj.modifiers.new("CONTACT_EDGE_BEVEL", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    return obj


def cylinder_between(
    name: str,
    start: Vector,
    end: Vector,
    radius: float,
    collection: bpy.types.Collection,
    value: bpy.types.Material,
    vertices: int = 32,
) -> bpy.types.Object:
    direction = end - start
    midpoint = (start + end) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=direction.length, location=midpoint)
    obj = bpy.context.object
    obj.name = name
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_only(obj, collection)
    assign_material(obj, value)
    bevel = obj.modifiers.new("CONTACT_EDGE_BEVEL", "BEVEL")
    bevel.width = min(radius * 0.24, 0.004)
    bevel.segments = 3
    return obj


def curve_tube(
    name: str,
    points: list[Vector],
    radius: float,
    collection: bpy.types.Collection,
    value: bpy.types.Material,
) -> bpy.types.Object:
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 16
    data.bevel_depth = radius
    data.bevel_resolution = 4
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, data)
    collection.objects.link(obj)
    data.materials.append(value)
    return obj


def add_edit_bone(
    armature: bpy.types.Armature,
    name: str,
    head: tuple[float, float, float],
    tail: tuple[float, float, float],
    parent: str | None = None,
    connected: bool = False,
) -> None:
    bone = armature.edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    bone.use_deform = True
    bone.envelope_distance = 0.018 if "finger" in name or "thumb" in name else 0.06
    bone.head_radius = bone.envelope_distance
    bone.tail_radius = bone.envelope_distance * 0.8
    if parent:
        bone.parent = armature.edit_bones[parent]
        bone.use_connect = connected


def build_armature(collection: bpy.types.Collection) -> bpy.types.Object:
    data = bpy.data.armatures.new(f"{PREFIX}ContactFullBodyRig_Data")
    rig = bpy.data.objects.new(f"{PREFIX}ContactFullBodyRig", data)
    collection.objects.link(rig)
    rig.show_in_front = True
    rig.display_type = "WIRE"
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    add_edit_bone(data, "root", (0.0, 0.0, 0.82), (0.0, 0.0, 0.96))
    add_edit_bone(data, "spine_01", (0.0, 0.0, 0.96), (0.0, -0.002, 1.14), "root", True)
    add_edit_bone(data, "spine_02", (0.0, -0.002, 1.14), (0.0, -0.008, 1.30), "spine_01", True)
    add_edit_bone(data, "chest", (0.0, -0.008, 1.30), (0.0, -0.010, 1.43), "spine_02", True)
    add_edit_bone(data, "neck", (0.0, -0.015, 1.43), (0.0, -0.025, 1.56), "chest", False)
    add_edit_bone(data, "head", (0.0, -0.025, 1.56), (0.0, -0.040, 1.73), "neck", True)

    # Stable lower-body anchors keep the unposed legs from drifting under heat weights.
    for sign, side in ((-1.0, "R"), (1.0, "L")):
        add_edit_bone(data, f"thigh_anchor.{side}", (0.085 * sign, 0.0, 0.93), (0.115 * sign, 0.0, 0.55), "root")
        add_edit_bone(data, f"shin_anchor.{side}", (0.115 * sign, 0.0, 0.55), (0.105 * sign, -0.01, 0.13), f"thigh_anchor.{side}", True)
        add_edit_bone(data, f"foot_anchor.{side}", (0.105 * sign, -0.01, 0.13), (0.105 * sign, -0.13, 0.035), f"shin_anchor.{side}", True)

    digit_y = {"index": -0.151, "middle": -0.126, "ring": -0.101, "pinky": -0.076}
    digit_lengths = {"index": (0.034, 0.031, 0.026), "middle": (0.037, 0.034, 0.028), "ring": (0.035, 0.032, 0.027), "pinky": (0.030, 0.027, 0.023)}
    for sign, side in ((-1.0, "R"), (1.0, "L")):
        clavicle_tail = (0.178 * sign, -0.010, 1.395)
        upper_tail = (0.295 * sign, -0.020, 1.205)
        fore_tail = (0.375 * sign, -0.045, 1.000)
        wrist_tail = (0.399 * sign, -0.080, 0.915)
        palm_tail = (0.402 * sign, -0.105, 0.855)
        add_edit_bone(data, f"clavicle.{side}", (0.0, -0.010, 1.405), clavicle_tail, "chest")
        add_edit_bone(data, f"upper_arm.{side}", clavicle_tail, upper_tail, f"clavicle.{side}", True)
        add_edit_bone(data, f"forearm.{side}", upper_tail, fore_tail, f"upper_arm.{side}", True)
        add_edit_bone(data, f"wrist.{side}", fore_tail, wrist_tail, f"forearm.{side}", True)
        add_edit_bone(data, f"palm.{side}", wrist_tail, palm_tail, f"wrist.{side}", True)
        for digit, y in digit_y.items():
            z0 = 0.865 if digit in ("index", "middle") else 0.858
            length_1, length_2, length_3 = digit_lengths[digit]
            head = Vector((0.402 * sign, y, z0))
            tail_1 = head + Vector((0.002 * sign, 0.0, -length_1))
            tail_2 = tail_1 + Vector((0.001 * sign, 0.0, -length_2))
            tail_3 = tail_2 + Vector((0.0, 0.0, -length_3))
            add_edit_bone(data, f"{digit}_01.{side}", tuple(head), tuple(tail_1), f"palm.{side}")
            add_edit_bone(data, f"{digit}_02.{side}", tuple(tail_1), tuple(tail_2), f"{digit}_01.{side}", True)
            add_edit_bone(data, f"{digit}_03.{side}", tuple(tail_2), tuple(tail_3), f"{digit}_02.{side}", True)
        thumb_head = Vector((0.382 * sign, -0.151, 0.900))
        thumb_1 = thumb_head + Vector((-0.018 * sign, -0.010, -0.025))
        thumb_2 = thumb_1 + Vector((-0.015 * sign, -0.008, -0.025))
        thumb_3 = thumb_2 + Vector((-0.010 * sign, 0.0, -0.020))
        add_edit_bone(data, f"thumb_01.{side}", tuple(thumb_head), tuple(thumb_1), f"palm.{side}")
        add_edit_bone(data, f"thumb_02.{side}", tuple(thumb_1), tuple(thumb_2), f"thumb_01.{side}", True)
        add_edit_bone(data, f"thumb_03.{side}", tuple(thumb_2), tuple(thumb_3), f"thumb_02.{side}", True)

    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def auto_weight_body(body: bpy.types.Object, rig: bpy.types.Object) -> str:
    bpy.ops.object.select_all(action="DESELECT")
    body.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    result = bpy.ops.object.parent_set(type="ARMATURE_AUTO", keep_transform=True)
    if "FINISHED" not in result:
        raise RuntimeError(f"Automatic armature weighting failed: {result}")
    return ",".join(sorted(result))


def bind_eyes(rig: bpy.types.Object) -> None:
    for name in EYE_NAMES:
        eye = bpy.data.objects.get(name)
        if eye is None or eye.type != "MESH":
            raise RuntimeError(f"Missing V6-A eye: {name}")
        eye.parent = rig
        eye.parent_type = "BONE"
        eye.parent_bone = "head"
        eye.matrix_parent_inverse = rig.matrix_world.inverted()


def segment_matrix(head: Vector, tail: Vector, roll_hint: Vector = Vector((0.0, 0.0, 1.0))) -> Matrix:
    direction = tail - head
    if direction.length < 1e-6:
        raise ValueError("Zero-length target bone")
    y_axis = direction.normalized()
    x_axis = roll_hint.cross(y_axis)
    if x_axis.length < 1e-5:
        x_axis = Vector((1.0, 0.0, 0.0)).cross(y_axis)
    x_axis.normalize()
    z_axis = x_axis.cross(y_axis).normalized()
    rotation = Matrix((x_axis, y_axis, z_axis)).transposed().to_4x4()
    return Matrix.Translation(head) @ rotation


def pose_bone_to(rig: bpy.types.Object, name: str, head: Vector, tail: Vector, roll_hint: Vector) -> None:
    pose_bone = rig.pose.bones[name]
    rest_length = pose_bone.bone.length
    desired_length = (tail - head).length
    pose_bone.matrix = segment_matrix(head, tail, roll_hint) @ Matrix.Diagonal((1.0, desired_length / rest_length, 1.0, 1.0))


def build_pose_targets() -> tuple[dict[str, tuple[Vector, Vector, Vector]], dict[str, list[float]]]:
    forward = Vector((0.22, -0.975, 0.0)).normalized()
    right = Vector((-forward.y, forward.x, 0.0)).normalized()
    up = Vector((0.0, 0.0, 1.0))
    shoulder_pad = Vector((-0.185, -0.115, 1.365))
    receiver = shoulder_pad + forward * 0.29 + Vector((0.0, 0.0, -0.055))
    grip = receiver + forward * 0.035 + Vector((0.0, 0.0, -0.145))
    foregrip = receiver + forward * 0.35 + Vector((0.0, 0.0, -0.120))
    trigger = grip + forward * 0.020 + Vector((0.0, 0.0, 0.105))

    firing_palm = grip - right * 0.055 + up * 0.040
    firing_wrist = firing_palm - right * 0.022 - forward * 0.065 + up * 0.012
    support_palm = foregrip + right * 0.055 + up * 0.035
    support_wrist = support_palm + right * 0.025 - forward * 0.075 + up * 0.018

    targets: dict[str, tuple[Vector, Vector, Vector]] = {}
    targets["spine_01"] = (Vector((0.0, 0.0, 0.96)), Vector((0.0, -0.006, 1.14)), Vector((1.0, 0.0, 0.0)))
    targets["spine_02"] = (Vector((0.0, -0.006, 1.14)), Vector((0.0, -0.016, 1.30)), Vector((1.0, 0.0, 0.0)))
    targets["chest"] = (Vector((0.0, -0.016, 1.30)), Vector((-0.008, -0.030, 1.43)), Vector((1.0, 0.0, 0.0)))
    targets["neck"] = (Vector((-0.008, -0.030, 1.43)), Vector((-0.005, -0.044, 1.56)), Vector((1.0, 0.0, 0.0)))
    targets["head"] = (Vector((-0.005, -0.044, 1.56)), Vector((0.0, -0.062, 1.73)), Vector((1.0, 0.0, 0.0)))

    firing_shoulder = Vector((-0.195, -0.030, 1.390))
    firing_elbow = Vector((-0.330, -0.245, 1.155))
    support_shoulder = Vector((0.195, -0.030, 1.390))
    support_elbow = Vector((0.330, -0.365, 1.145))
    targets["clavicle.R"] = (Vector((-0.008, -0.030, 1.415)), firing_shoulder, up)
    targets["upper_arm.R"] = (firing_shoulder, firing_elbow, up)
    targets["forearm.R"] = (firing_elbow, firing_wrist, up)
    targets["wrist.R"] = (firing_wrist, firing_palm - right * 0.020, up)
    targets["palm.R"] = (firing_palm - right * 0.020, firing_palm + forward * 0.028, up)
    targets["clavicle.L"] = (Vector((-0.008, -0.030, 1.415)), support_shoulder, up)
    targets["upper_arm.L"] = (support_shoulder, support_elbow, up)
    targets["forearm.L"] = (support_elbow, support_wrist, up)
    targets["wrist.L"] = (support_wrist, support_palm + right * 0.018, up)
    targets["palm.L"] = (support_palm + right * 0.018, support_palm + forward * 0.026, up)

    # Firing hand: middle/ring/pinky visibly wrap around the grip.  The index
    # follows its own high line inside the guard, and the thumb opposes it.
    firing_z = {"middle": 0.045, "ring": 0.008, "pinky": -0.030}
    for digit, z_offset in firing_z.items():
        p0 = grip - right * 0.058 + up * z_offset
        p1 = grip - right * 0.020 + forward * 0.030 + up * (z_offset - 0.012)
        p2 = grip + right * 0.028 + forward * 0.018 + up * (z_offset - 0.026)
        p3 = grip + right * 0.040 - forward * 0.018 + up * (z_offset - 0.038)
        targets[f"{digit}_01.R"] = (p0, p1, up)
        targets[f"{digit}_02.R"] = (p1, p2, up)
        targets[f"{digit}_03.R"] = (p2, p3, up)
    index_points = (
        grip - right * 0.058 + forward * 0.004 + up * 0.082,
        trigger - right * 0.030 - forward * 0.020 + up * 0.004,
        trigger - right * 0.007 + forward * 0.005,
        trigger + right * 0.013 + forward * 0.005,
    )
    for index in range(3):
        targets[f"index_0{index + 1}.R"] = (index_points[index], index_points[index + 1], up)
    thumb_points = (
        grip - right * 0.050 - forward * 0.028 + up * 0.058,
        grip - right * 0.018 - forward * 0.060 + up * 0.046,
        grip + right * 0.022 - forward * 0.042 + up * 0.024,
        grip + right * 0.038 - forward * 0.012 + up * 0.012,
    )
    for index in range(3):
        targets[f"thumb_0{index + 1}.R"] = (thumb_points[index], thumb_points[index + 1], up)

    # Support hand: all four fingers oppose the palm around the vertical
    # foregrip; the thumb lies high along the handguard side.
    support_z = {"index": 0.060, "middle": 0.026, "ring": -0.008, "pinky": -0.040}
    for digit, z_offset in support_z.items():
        p0 = foregrip + right * 0.060 + up * z_offset
        p1 = foregrip + right * 0.020 + forward * 0.030 + up * (z_offset - 0.012)
        p2 = foregrip - right * 0.028 + forward * 0.018 + up * (z_offset - 0.026)
        p3 = foregrip - right * 0.042 - forward * 0.018 + up * (z_offset - 0.038)
        targets[f"{digit}_01.L"] = (p0, p1, up)
        targets[f"{digit}_02.L"] = (p1, p2, up)
        targets[f"{digit}_03.L"] = (p2, p3, up)
    support_thumb = (
        foregrip + right * 0.054 - forward * 0.020 + up * 0.070,
        foregrip + right * 0.020 - forward * 0.052 + up * 0.060,
        foregrip - right * 0.020 - forward * 0.040 + up * 0.044,
        foregrip - right * 0.034 - forward * 0.012 + up * 0.030,
    )
    for index in range(3):
        targets[f"thumb_0{index + 1}.L"] = (support_thumb[index], support_thumb[index + 1], up)

    landmarks = {
        "forward": rounded(forward),
        "right": rounded(right),
        "shoulderPad": rounded(shoulder_pad),
        "receiver": rounded(receiver),
        "grip": rounded(grip),
        "foregrip": rounded(foregrip),
        "trigger": rounded(trigger),
        "firingPalm": rounded(firing_palm),
        "supportPalm": rounded(support_palm),
    }
    return targets, landmarks


def apply_pose(rig: bpy.types.Object, targets: dict[str, tuple[Vector, Vector, Vector]]) -> None:
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
    ordered = ["spine_01", "spine_02", "chest", "neck", "head"]
    ordered += ["clavicle.R", "upper_arm.R", "forearm.R", "wrist.R", "palm.R"]
    ordered += ["clavicle.L", "upper_arm.L", "forearm.L", "wrist.L", "palm.L"]
    ordered += [name for name in targets if name not in ordered]
    for name in ordered:
        head, tail, roll_hint = targets[name]
        pose_bone_to(rig, name, head, tail, roll_hint)
    bpy.context.view_layer.update()
    action = bpy.data.actions.new(f"{PREFIX}ContactPose_Action")
    rig.animation_data_create()
    rig.animation_data.action = action
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 20
    for frame in (1, 20):
        bpy.context.scene.frame_set(frame)
        for name in ordered:
            bone = rig.pose.bones[name]
            bone.keyframe_insert(data_path="location", frame=frame, group=name)
            if bone.rotation_mode == "QUATERNION":
                bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=name)
            else:
                bone.keyframe_insert(data_path="rotation_euler", frame=frame, group=name)
            bone.keyframe_insert(data_path="scale", frame=frame, group=name)
    bpy.context.scene.frame_set(1)
    bpy.ops.object.mode_set(mode="OBJECT")


def build_rifle(collection: bpy.types.Collection, landmarks: dict[str, list[float]]) -> list[bpy.types.Object]:
    forward = Vector(landmarks["forward"])
    right = Vector(landmarks["right"])
    shoulder = Vector(landmarks["shoulderPad"])
    receiver = Vector(landmarks["receiver"])
    grip = Vector(landmarks["grip"])
    foregrip = Vector(landmarks["foregrip"])
    trigger = Vector(landmarks["trigger"])
    up = Vector((0.0, 0.0, 1.0))

    ghost = material(f"{PREFIX}RifleSectionGhost_Mat", (0.06, 0.50, 0.74, 1.0), metallic=0.45, roughness=0.28, alpha=0.24)
    metal = material(f"{PREFIX}RifleStructure_Mat", (0.025, 0.035, 0.050, 1.0), metallic=0.72, roughness=0.26)
    contact = material(f"{PREFIX}ContactSurface_Mat", (0.95, 0.29, 0.055, 1.0), metallic=0.18, roughness=0.34, emission=0.18)
    trigger_mat = material(f"{PREFIX}Trigger_Mat", (1.0, 0.72, 0.08, 1.0), metallic=0.65, roughness=0.22, emission=0.35)
    guard_mat = material(f"{PREFIX}Guard_Mat", (0.14, 0.82, 1.0, 1.0), metallic=0.70, roughness=0.18, emission=0.22)

    objects: list[bpy.types.Object] = []
    objects.append(box_mesh(f"{PREFIX}Rifle_ReceiverSectioned", receiver + forward * 0.055, (0.145, 0.36, 0.115), right, forward, collection, ghost, 0.008))
    objects.append(box_mesh(f"{PREFIX}Rifle_GripContact", grip, (0.078, 0.092, 0.205), right, forward, collection, contact, 0.012))
    objects.append(cylinder_between(f"{PREFIX}Rifle_ForegripContact", foregrip + up * 0.105, foregrip - up * 0.105, 0.043, collection, contact, 40))
    stock_start = shoulder + forward * 0.025
    stock_end = receiver - forward * 0.125
    objects.append(cylinder_between(f"{PREFIX}Rifle_StockBeam", stock_start, stock_end, 0.030, collection, metal, 32))
    objects.append(box_mesh(f"{PREFIX}Rifle_StockPadContact", shoulder, (0.115, 0.030, 0.165), right, forward, collection, contact, 0.010))
    barrel_start = receiver + forward * 0.19 + up * 0.018
    barrel_end = receiver + forward * 0.80 + up * 0.018
    objects.append(cylinder_between(f"{PREFIX}Rifle_Barrel", barrel_start, barrel_end, 0.021, collection, metal, 36))
    objects.append(cylinder_between(f"{PREFIX}Rifle_Muzzle", barrel_end - forward * 0.055, barrel_end + forward * 0.015, 0.032, collection, metal, 36))
    trigger_start = trigger - forward * 0.010 + up * 0.025
    trigger_end = trigger + forward * 0.006 - up * 0.030
    objects.append(cylinder_between(f"{PREFIX}Rifle_Trigger", trigger_start, trigger_end, 0.007, collection, trigger_mat, 24))
    guard_points = [
        trigger - forward * 0.065 + up * 0.060,
        trigger - forward * 0.050 - up * 0.050,
        trigger + forward * 0.085 - up * 0.055,
        trigger + forward * 0.100 + up * 0.055,
    ]
    objects.append(curve_tube(f"{PREFIX}Rifle_TriggerGuard", guard_points, 0.008, collection, guard_mat))
    # Thin lateral hand-stop makes the support contact plane literal without
    # turning the blockout into production weapon art.
    objects.append(box_mesh(f"{PREFIX}Rifle_ForegripHandStop", foregrip + forward * 0.062 + up * 0.085, (0.125, 0.022, 0.055), right, forward, collection, guard_mat, 0.006))
    return objects


def weight_inventory(body: bpy.types.Object, rig: bpy.types.Object) -> dict[str, object]:
    per_group = {group.name: 0 for group in body.vertex_groups}
    zero_vertices = 0
    minimum_sum = 1000.0
    maximum_sum = 0.0
    for vertex in body.data.vertices:
        total = 0.0
        for membership in vertex.groups:
            if membership.group < len(body.vertex_groups):
                group_name = body.vertex_groups[membership.group].name
                per_group[group_name] = per_group.get(group_name, 0) + 1
                total += membership.weight
        if total <= 1e-6:
            zero_vertices += 1
        minimum_sum = min(minimum_sum, total)
        maximum_sum = max(maximum_sum, total)
    deform_names = [bone.name for bone in rig.data.bones if bone.use_deform]
    return {
        "vertexCount": len(body.data.vertices),
        "groupCount": len(body.vertex_groups),
        "deformBoneCount": len(deform_names),
        "zeroWeightVertices": zero_vertices,
        "minimumWeightSum": round(minimum_sum, 6),
        "maximumWeightSum": round(maximum_sum, 6),
        "verticesPerGroup": {name: per_group.get(name, 0) for name in sorted(deform_names)},
        "missingDeformGroups": sorted(name for name in deform_names if body.vertex_groups.get(name) is None),
    }


def main() -> None:
    args = args_after_separator()
    if len(args) != 3:
        raise SystemExit("Expected -- <immutable-v6a.blend> <working.blend> <report.json>")
    source_path = Path(args[0]).resolve()
    working_path = Path(args[1]).resolve()
    report_path = Path(args[2]).resolve()
    opened_path = Path(bpy.data.filepath).resolve()
    if opened_path != working_path:
        raise RuntimeError(f"Opened {opened_path}; expected working copy {working_path}")
    if source_path == working_path:
        raise RuntimeError("Refusing to edit immutable V6-A source")
    source_hash = sha256(source_path)
    working_initial_hash = sha256(working_path)
    if source_hash != PINNED_SOURCE_SHA256 or working_initial_hash != PINNED_SOURCE_SHA256:
        raise RuntimeError(f"Pinned V6-A mismatch: source={source_hash}, working={working_initial_hash}")
    if bpy.data.armatures or bpy.data.actions or bpy.data.libraries:
        raise RuntimeError("Working copy is not the clean reviewed V6-A seed")
    if any(name.lower().find(token) >= 0 for name in bpy.data.objects.keys() for token in ("garment", "armor")):
        raise RuntimeError("Unexpected garment/armor content in clean contact-first lane")

    body = bpy.data.objects.get(BODY_NAME)
    if body is None or body.type != "MESH":
        raise RuntimeError(f"Missing continuous V6-A body {BODY_NAME}")
    source_topology = {
        "vertices": len(body.data.vertices),
        "edges": len(body.data.edges),
        "polygons": len(body.data.polygons),
    }

    proof_collection = bpy.data.collections.new(f"{PREFIX}ContactFirstProof")
    bpy.context.scene.collection.children.link(proof_collection)
    rig = build_armature(proof_collection)
    weight_result = auto_weight_body(body, rig)
    bind_eyes(rig)

    skin = material(f"{PREFIX}AnatomyClay_Mat", (0.47, 0.22, 0.13, 1.0), roughness=0.62)
    eye_mat = material(f"{PREFIX}Eyes_Mat", (0.012, 0.020, 0.032, 1.0), roughness=0.18)
    assign_material(body, skin)
    for name in EYE_NAMES:
        assign_material(bpy.data.objects[name], eye_mat)

    targets, landmarks = build_pose_targets()
    apply_pose(rig, targets)
    rifle_objects = build_rifle(proof_collection, landmarks)

    bpy.context.scene["v6_contact_first_scope"] = "CONTACT_RIG_FOUNDATION_ONLY_CANDIDATE"
    bpy.context.scene["v6_contact_first_source_sha256"] = PINNED_SOURCE_SHA256
    bpy.context.scene["v6_contact_first_no_g6_claim"] = True
    rig["pose_method"] = "explicit armature-space bone matrices; keyed frame 1 and frame 20"
    rig["contact_priority"] = "both continuous anatomical hands; firing grip/index/guard; support foregrip; stock/shoulder"
    rig["no_garment_or_armor"] = True

    bpy.ops.wm.save_as_mainfile(filepath=str(working_path), check_existing=False)
    final_hash = sha256(working_path)
    weights = weight_inventory(body, rig)
    bone_inventory = []
    for bone in rig.data.bones:
        pose_bone = rig.pose.bones[bone.name]
        bone_inventory.append({
            "name": bone.name,
            "parent": bone.parent.name if bone.parent else None,
            "useDeform": bone.use_deform,
            "restHead": rounded(bone.head_local),
            "restTail": rounded(bone.tail_local),
            "posedHead": rounded(pose_bone.head),
            "posedTail": rounded(pose_bone.tail),
        })
    posed_topology = {
        "vertices": len(body.data.vertices),
        "edges": len(body.data.edges),
        "polygons": len(body.data.polygons),
    }
    forbidden = sorted(name for name in bpy.data.objects.keys() if "garment" in name.lower() or "armor" in name.lower())
    report = {
        "schema": "kyx-v6-contact-first-rig-author-report-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "status": "EARLY_CONTACT_RIG_PROOF_AUTHORED_VISUAL_REVIEW_REQUIRED",
        "scope": "CONTACT_RIG_FOUNDATION_ONLY_CANDIDATE",
        "source": {"path": str(source_path), "sha256": source_hash},
        "working": {"path": str(working_path), "initialSha256": working_initial_hash, "finalSha256": final_hash},
        "body": {
            "name": body.name,
            "continuousObjectCount": 1,
            "sourceTopology": source_topology,
            "posedTopology": posed_topology,
            "topologyPreserved": source_topology == posed_topology,
            "armatureModifiers": [modifier.object.name for modifier in body.modifiers if modifier.type == "ARMATURE" and modifier.object],
        },
        "rig": {
            "name": rig.name,
            "boneCount": len(rig.data.bones),
            "bones": bone_inventory,
            "action": rig.animation_data.action.name if rig.animation_data and rig.animation_data.action else None,
            "actionFrameRange": [1, 20],
            "poseMethod": rig["pose_method"],
            "weightingOperator": weight_result,
            "weights": weights,
        },
        "weaponContactBlockout": {
            "objects": sorted(obj.name for obj in rifle_objects),
            "requiredNamedSurfaces": [
                f"{PREFIX}Rifle_GripContact",
                f"{PREFIX}Rifle_Trigger",
                f"{PREFIX}Rifle_TriggerGuard",
                f"{PREFIX}Rifle_ForegripContact",
                f"{PREFIX}Rifle_StockPadContact",
            ],
            "landmarks": landmarks,
            "receiverPresentation": "sectioned translucent volume; contact surfaces remain opaque",
        },
        "prohibitions": {
            "garmentOrArmorObjects": forbidden,
            "externalLibraries": [library.filepath for library in bpy.data.libraries],
            "runtimeSourceTouched": False,
            "mapOrOnlineTouched": False,
            "productionWeaponArtClaim": False,
            "v6bClaim": False,
            "g6Claim": False,
        },
        "reviewContract": {
            "mustShow": [
                "continuous full-body firing pose",
                "firing palm seated on grip with four-digit wrap",
                "index visibly clear of guard and reaching trigger",
                "support palm and four digits seated around foregrip",
                "stock pad tangent to shoulder pocket",
                "plausible elbows and wrists",
                "no tearing, collapse, blocky/mannequin silhouette",
            ],
            "automaticAcceptance": False,
            "selfRejectOnInferredContact": True,
        },
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("V6CF_AUTHOR_REPORT:" + json.dumps(report))


if __name__ == "__main__":
    main()
