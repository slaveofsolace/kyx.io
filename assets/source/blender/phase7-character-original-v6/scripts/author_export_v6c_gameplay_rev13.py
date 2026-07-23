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


CHECKPOINT = "V6C_GAMEPLAY_ANIMATION_CANDIDATE_REV13"
SOURCE_REV12_SHA256 = "eb767552e6af30025e6514b4d5c8e71fd3ad6ab3d168208c4450ab1dc6b1eb5a"
RIG_NAME = "V6CF11B_ContactFullBodyRig"
FPS = 24
CONTACT_TOLERANCE = 1.0e-4
EXPECTED_BONES = 52
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


def script_args() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <rev12.glb> <candidate.blend> <rev13.glb> "
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


def action_fcurves(action: bpy.types.Action) -> list[Any]:
    result = []
    for layer in action.layers:
        for strip in layer.strips:
            for channelbag in strip.channelbags:
                result.extend(channelbag.fcurves)
    return result


def set_action_interpolation(action: bpy.types.Action, mode: str) -> None:
    for fcurve in action_fcurves(action):
        for point in fcurve.keyframe_points:
            point.interpolation = mode
            if mode == "BEZIER":
                point.handle_left_type = "AUTO_CLAMPED"
                point.handle_right_type = "AUTO_CLAMPED"


def flatten_matrix(matrix: Matrix) -> list[float]:
    return [float(value) for row in matrix for value in row]


def max_delta(left: list[float], right: list[float]) -> float:
    return max(abs(a - b) for a, b in zip(left, right))


def pose_snapshot(rig: bpy.types.Object) -> dict[str, list[float]]:
    return {bone.name: flatten_matrix(bone.matrix) for bone in rig.pose.bones}


def world_bone_matrix(rig: bpy.types.Object, bone_name: str) -> Matrix:
    return rig.matrix_world @ rig.pose.bones[bone_name].matrix


def palm_relation(rig: bpy.types.Object) -> list[float]:
    right = world_bone_matrix(rig, "palm.R")
    left = world_bone_matrix(rig, "palm.L")
    return flatten_matrix(right.inverted_safe() @ left)


def pose_key(
    frame: int,
    rotations: tuple[tuple[str, str, float], ...] = (),
    root_location: tuple[float, float, float] = (0.0, 0.0, 0.0),
    morph: str = "accepted_contact",
    morph_weight: float = 0.0,
) -> dict[str, Any]:
    return {
        "frame": frame,
        "rotations": rotations,
        "rootLocation": root_location,
        "morph": morph,
        "morphWeight": morph_weight,
    }


def clip_contract() -> list[dict[str, Any]]:
    return [
        {
            "name": "KYX_V6C_TP_IDLE",
            "label": "third-person combat idle",
            "frameEnd": 49,
            "loop": True,
            "interpolation": "BEZIER",
            "contactPolicy": "both-hand rifle contact invariant",
            "keys": [
                pose_key(1),
                pose_key(
                    13,
                    (("spine_01", "X", 1.3), ("spine_02", "Y", 0.7), ("chest", "Z", 0.5), ("head", "Y", -0.4)),
                    (0.0, 0.0, 0.006),
                ),
                pose_key(25),
                pose_key(
                    37,
                    (("spine_01", "X", -1.0), ("spine_02", "Y", -0.6), ("chest", "Z", -0.45), ("head", "Y", 0.35)),
                    (0.0, 0.0, 0.004),
                ),
                pose_key(49),
            ],
        },
        {
            "name": "KYX_V6C_TP_WALK",
            "label": "third-person in-place walk",
            "frameEnd": 25,
            "loop": True,
            "interpolation": "BEZIER",
            "contactPolicy": "both-hand rifle contact invariant",
            "keys": [
                pose_key(
                    1,
                    (("thigh_anchor.L", "X", 28.0), ("shin_anchor.L", "X", -38.0), ("foot_anchor.L", "X", 11.0), ("thigh_anchor.R", "X", -22.0), ("shin_anchor.R", "X", 18.0), ("foot_anchor.R", "X", -7.0), ("spine_01", "Z", -2.3), ("chest", "Z", 1.2)),
                    morph="locomotion_leg_bend",
                    morph_weight=0.9,
                ),
                pose_key(
                    7,
                    (("thigh_anchor.L", "X", 8.0), ("shin_anchor.L", "X", -16.0), ("foot_anchor.L", "X", 5.0), ("thigh_anchor.R", "X", -7.0), ("shin_anchor.R", "X", 10.0), ("spine_01", "Z", -0.8)),
                    (0.0, 0.0, -0.018),
                    "locomotion_leg_bend",
                    0.45,
                ),
                pose_key(
                    13,
                    (("thigh_anchor.R", "X", 28.0), ("shin_anchor.R", "X", -38.0), ("foot_anchor.R", "X", 11.0), ("thigh_anchor.L", "X", -22.0), ("shin_anchor.L", "X", 18.0), ("foot_anchor.L", "X", -7.0), ("spine_01", "Z", 2.3), ("chest", "Z", -1.2)),
                    morph="locomotion_leg_bend",
                    morph_weight=0.9,
                ),
                pose_key(
                    19,
                    (("thigh_anchor.R", "X", 8.0), ("shin_anchor.R", "X", -16.0), ("foot_anchor.R", "X", 5.0), ("thigh_anchor.L", "X", -7.0), ("shin_anchor.L", "X", 10.0), ("spine_01", "Z", 0.8)),
                    (0.0, 0.0, -0.018),
                    "locomotion_leg_bend",
                    0.45,
                ),
                pose_key(
                    25,
                    (("thigh_anchor.L", "X", 28.0), ("shin_anchor.L", "X", -38.0), ("foot_anchor.L", "X", 11.0), ("thigh_anchor.R", "X", -22.0), ("shin_anchor.R", "X", 18.0), ("foot_anchor.R", "X", -7.0), ("spine_01", "Z", -2.3), ("chest", "Z", 1.2)),
                    morph="locomotion_leg_bend",
                    morph_weight=0.9,
                ),
            ],
        },
        {
            "name": "KYX_V6C_TP_RUN",
            "label": "third-person in-place run",
            "frameEnd": 19,
            "loop": True,
            "interpolation": "BEZIER",
            "contactPolicy": "both-hand rifle contact invariant",
            "keys": [
                pose_key(
                    1,
                    (("spine_01", "X", -5.0), ("chest", "X", 2.0), ("thigh_anchor.L", "X", 42.0), ("shin_anchor.L", "X", -58.0), ("foot_anchor.L", "X", 14.0), ("thigh_anchor.R", "X", -34.0), ("shin_anchor.R", "X", 28.0), ("spine_02", "Z", -3.0)),
                    (0.0, 0.0, 0.012),
                    "locomotion_leg_bend",
                    1.0,
                ),
                pose_key(
                    5,
                    (("spine_01", "X", -6.0), ("thigh_anchor.L", "X", 12.0), ("shin_anchor.L", "X", -25.0), ("thigh_anchor.R", "X", -10.0), ("shin_anchor.R", "X", 14.0), ("spine_02", "Z", -1.0)),
                    (0.0, 0.0, -0.032),
                    "locomotion_leg_bend",
                    0.55,
                ),
                pose_key(
                    10,
                    (("spine_01", "X", -5.0), ("chest", "X", 2.0), ("thigh_anchor.R", "X", 42.0), ("shin_anchor.R", "X", -58.0), ("foot_anchor.R", "X", 14.0), ("thigh_anchor.L", "X", -34.0), ("shin_anchor.L", "X", 28.0), ("spine_02", "Z", 3.0)),
                    (0.0, 0.0, 0.012),
                    "locomotion_leg_bend",
                    1.0,
                ),
                pose_key(
                    14,
                    (("spine_01", "X", -6.0), ("thigh_anchor.R", "X", 12.0), ("shin_anchor.R", "X", -25.0), ("thigh_anchor.L", "X", -10.0), ("shin_anchor.L", "X", 14.0), ("spine_02", "Z", 1.0)),
                    (0.0, 0.0, -0.032),
                    "locomotion_leg_bend",
                    0.55,
                ),
                pose_key(
                    19,
                    (("spine_01", "X", -5.0), ("chest", "X", 2.0), ("thigh_anchor.L", "X", 42.0), ("shin_anchor.L", "X", -58.0), ("foot_anchor.L", "X", 14.0), ("thigh_anchor.R", "X", -34.0), ("shin_anchor.R", "X", 28.0), ("spine_02", "Z", -3.0)),
                    (0.0, 0.0, 0.012),
                    "locomotion_leg_bend",
                    1.0,
                ),
            ],
        },
        {
            "name": "KYX_V6C_TP_JUMP_START",
            "label": "third-person jump anticipation and launch",
            "frameEnd": 14,
            "loop": False,
            "interpolation": "BEZIER",
            "contactPolicy": "both-hand rifle contact invariant",
            "keys": [
                pose_key(1),
                pose_key(
                    5,
                    (("spine_01", "X", 7.0), ("thigh_anchor.L", "X", 24.0), ("shin_anchor.L", "X", -42.0), ("foot_anchor.L", "X", 14.0), ("thigh_anchor.R", "X", 24.0), ("shin_anchor.R", "X", -42.0), ("foot_anchor.R", "X", 14.0)),
                    (0.0, 0.0, -0.105),
                    "locomotion_leg_bend",
                    1.0,
                ),
                pose_key(
                    9,
                    (("spine_01", "X", -5.0), ("thigh_anchor.L", "X", -10.0), ("shin_anchor.L", "X", 8.0), ("foot_anchor.L", "X", -8.0), ("thigh_anchor.R", "X", -10.0), ("shin_anchor.R", "X", 8.0), ("foot_anchor.R", "X", -8.0)),
                    (0.0, 0.0, 0.035),
                    "locomotion_leg_bend",
                    0.35,
                ),
                pose_key(
                    14,
                    (("spine_01", "X", -4.0), ("thigh_anchor.L", "X", 12.0), ("shin_anchor.L", "X", -24.0), ("thigh_anchor.R", "X", -5.0), ("shin_anchor.R", "X", -14.0)),
                    (0.0, 0.0, 0.16),
                    "locomotion_leg_bend",
                    0.6,
                ),
            ],
        },
        {
            "name": "KYX_V6C_TP_AIRBORNE_LOOP",
            "label": "third-person airborne loop",
            "frameEnd": 25,
            "loop": True,
            "interpolation": "BEZIER",
            "contactPolicy": "both-hand rifle contact invariant",
            "keys": [
                pose_key(
                    1,
                    (("spine_01", "X", -3.0), ("thigh_anchor.L", "X", 18.0), ("shin_anchor.L", "X", -32.0), ("thigh_anchor.R", "X", -8.0), ("shin_anchor.R", "X", -16.0)),
                    (0.0, 0.0, 0.12),
                    "locomotion_leg_bend",
                    0.7,
                ),
                pose_key(
                    7,
                    (("spine_01", "X", -4.0), ("thigh_anchor.L", "X", 12.0), ("shin_anchor.L", "X", -26.0), ("thigh_anchor.R", "X", -3.0), ("shin_anchor.R", "X", -12.0), ("spine_02", "Z", 1.2)),
                    (0.0, 0.0, 0.135),
                    "locomotion_leg_bend",
                    0.55,
                ),
                pose_key(
                    13,
                    (("spine_01", "X", -2.0), ("thigh_anchor.R", "X", 18.0), ("shin_anchor.R", "X", -32.0), ("thigh_anchor.L", "X", -8.0), ("shin_anchor.L", "X", -16.0)),
                    (0.0, 0.0, 0.12),
                    "locomotion_leg_bend",
                    0.7,
                ),
                pose_key(
                    19,
                    (("spine_01", "X", -4.0), ("thigh_anchor.R", "X", 12.0), ("shin_anchor.R", "X", -26.0), ("thigh_anchor.L", "X", -3.0), ("shin_anchor.L", "X", -12.0), ("spine_02", "Z", -1.2)),
                    (0.0, 0.0, 0.105),
                    "locomotion_leg_bend",
                    0.55,
                ),
                pose_key(
                    25,
                    (("spine_01", "X", -3.0), ("thigh_anchor.L", "X", 18.0), ("shin_anchor.L", "X", -32.0), ("thigh_anchor.R", "X", -8.0), ("shin_anchor.R", "X", -16.0)),
                    (0.0, 0.0, 0.12),
                    "locomotion_leg_bend",
                    0.7,
                ),
            ],
        },
        {
            "name": "KYX_V6C_TP_LAND",
            "label": "third-person landing compression and recovery",
            "frameEnd": 16,
            "loop": False,
            "interpolation": "BEZIER",
            "contactPolicy": "both-hand rifle contact invariant",
            "keys": [
                pose_key(
                    1,
                    (("spine_01", "X", -3.0), ("thigh_anchor.L", "X", 9.0), ("shin_anchor.L", "X", -18.0), ("thigh_anchor.R", "X", 9.0), ("shin_anchor.R", "X", -18.0)),
                    (0.0, 0.0, 0.08),
                    "locomotion_leg_bend",
                    0.5,
                ),
                pose_key(4, root_location=(0.0, 0.0, 0.0), morph="locomotion_leg_bend", morph_weight=0.45),
                pose_key(
                    8,
                    (("spine_01", "X", 8.0), ("thigh_anchor.L", "X", 23.0), ("shin_anchor.L", "X", -40.0), ("foot_anchor.L", "X", 12.0), ("thigh_anchor.R", "X", 23.0), ("shin_anchor.R", "X", -40.0), ("foot_anchor.R", "X", 12.0)),
                    (0.0, 0.0, -0.095),
                    "locomotion_leg_bend",
                    1.0,
                ),
                pose_key(
                    12,
                    (("spine_01", "X", 3.0), ("thigh_anchor.L", "X", 8.0), ("shin_anchor.L", "X", -15.0), ("thigh_anchor.R", "X", 8.0), ("shin_anchor.R", "X", -15.0)),
                    (0.0, 0.0, -0.025),
                    "locomotion_leg_bend",
                    0.4,
                ),
                pose_key(16),
            ],
        },
        {
            "name": "KYX_V6C_TP_PRIMARY_FIRE",
            "label": "third-person primary fire recoil",
            "frameEnd": 12,
            "loop": False,
            "interpolation": "LINEAR",
            "contactPolicy": "both palms invariant; trigger finger articulates",
            "keys": [
                pose_key(1),
                pose_key(
                    3,
                    (("root", "X", 1.5), ("spine_01", "X", 4.5), ("spine_02", "X", 3.5), ("chest", "X", 2.5), ("index_01.R", "X", 9.0), ("index_02.R", "X", 13.0), ("index_03.R", "X", 8.0)),
                    (0.0, 0.012, 0.004),
                    "firing_shoulder_extreme",
                    1.0,
                ),
                pose_key(
                    5,
                    (("root", "X", -0.5), ("spine_01", "X", -1.5), ("spine_02", "X", -1.0), ("index_01.R", "X", 12.0), ("index_02.R", "X", 18.0), ("index_03.R", "X", 11.0)),
                    (0.0, -0.004, 0.0),
                    "trigger_wrist_digit_extreme",
                    0.65,
                ),
                pose_key(8, (("index_01.R", "X", 4.0), ("index_02.R", "X", 6.0), ("index_03.R", "X", 4.0))),
                pose_key(12),
            ],
        },
        {
            "name": "KYX_V6C_TP_RELOAD",
            "label": "third-person magazine reload",
            "frameEnd": 49,
            "loop": False,
            "interpolation": "BEZIER",
            "contactPolicy": "right grip invariant; left support hand intentionally departs and returns",
            "keys": [
                pose_key(1),
                pose_key(
                    9,
                    (("clavicle.L", "Z", -8.0), ("upper_arm.L", "Y", 22.0), ("upper_arm.L", "Z", -10.0), ("forearm.L", "X", 24.0), ("wrist.L", "Z", 22.0), ("index_01.R", "X", -8.0)),
                    morph="support_hand_extreme",
                    morph_weight=0.65,
                ),
                pose_key(
                    18,
                    (("clavicle.L", "Z", -13.0), ("upper_arm.L", "Y", 38.0), ("upper_arm.L", "Z", -18.0), ("forearm.L", "X", 48.0), ("wrist.L", "Y", -14.0), ("wrist.L", "Z", 36.0), ("index_01.R", "X", -12.0), ("index_02.R", "X", -8.0)),
                    morph="support_hand_extreme",
                    morph_weight=1.0,
                ),
                pose_key(
                    28,
                    (("clavicle.L", "Z", -11.0), ("upper_arm.L", "Y", 32.0), ("upper_arm.L", "Z", -14.0), ("forearm.L", "X", 42.0), ("wrist.L", "Y", 12.0), ("wrist.L", "Z", 28.0), ("index_01.R", "X", -10.0)),
                    morph="support_hand_extreme",
                    morph_weight=0.9,
                ),
                pose_key(
                    38,
                    (("clavicle.L", "Z", -5.0), ("upper_arm.L", "Y", 14.0), ("upper_arm.L", "Z", -6.0), ("forearm.L", "X", 15.0), ("wrist.L", "Z", 12.0)),
                    morph="support_hand_extreme",
                    morph_weight=0.4,
                ),
                pose_key(49),
            ],
        },
        {
            "name": "KYX_V6C_TP_HIT_REACTION_FRONT",
            "label": "third-person frontal hit reaction",
            "frameEnd": 20,
            "loop": False,
            "interpolation": "BEZIER",
            "contactPolicy": "both-hand rifle contact invariant",
            "keys": [
                pose_key(1),
                pose_key(
                    5,
                    (("root", "X", 5.0), ("root", "Z", -4.0), ("spine_01", "X", 10.0), ("spine_02", "X", 8.0), ("chest", "Z", -6.0), ("neck", "X", -6.0), ("head", "X", -5.0)),
                    (-0.035, 0.018, -0.025),
                    "firing_shoulder_extreme",
                    0.7,
                ),
                pose_key(
                    10,
                    (("root", "X", -2.0), ("root", "Z", 2.0), ("spine_01", "X", -4.0), ("spine_02", "X", -3.0), ("chest", "Z", 3.0), ("head", "X", 2.0)),
                    (0.012, -0.006, 0.006),
                    "firing_shoulder_extreme",
                    0.3,
                ),
                pose_key(15, (("spine_01", "X", 1.5), ("chest", "Z", -1.0))),
                pose_key(20),
            ],
        },
        {
            "name": "KYX_V6C_TP_DEATH_FRONT",
            "label": "third-person forward collapse death",
            "frameEnd": 60,
            "loop": False,
            "interpolation": "BEZIER",
            "contactPolicy": "rifle remains right-hand bound; support hand stays attached in this candidate",
            "keys": [
                pose_key(1),
                pose_key(
                    8,
                    (("root", "X", 7.0), ("spine_01", "X", 12.0), ("spine_02", "X", 8.0), ("chest", "Z", -5.0), ("head", "X", -8.0)),
                    (-0.025, 0.02, -0.035),
                    "firing_shoulder_extreme",
                    0.75,
                ),
                pose_key(
                    18,
                    (("root", "X", 16.0), ("root", "Z", -9.0), ("spine_01", "X", 20.0), ("spine_02", "Z", -10.0), ("chest", "X", 12.0), ("neck", "X", -10.0), ("thigh_anchor.L", "X", 18.0), ("shin_anchor.L", "X", -32.0), ("thigh_anchor.R", "X", 8.0), ("shin_anchor.R", "X", -18.0)),
                    (-0.08, 0.08, -0.18),
                    "locomotion_leg_bend",
                    0.8,
                ),
                pose_key(
                    32,
                    (("root", "X", 35.0), ("root", "Z", -18.0), ("spine_01", "X", 28.0), ("spine_02", "Z", -15.0), ("chest", "X", 18.0), ("head", "X", -18.0), ("thigh_anchor.L", "X", 35.0), ("shin_anchor.L", "X", -62.0), ("thigh_anchor.R", "X", 26.0), ("shin_anchor.R", "X", -48.0)),
                    (-0.14, 0.17, -0.42),
                    "locomotion_leg_bend",
                    1.0,
                ),
                pose_key(
                    46,
                    (("root", "X", 62.0), ("root", "Z", -24.0), ("spine_01", "X", 34.0), ("spine_02", "Z", -18.0), ("chest", "X", 24.0), ("neck", "X", -20.0), ("head", "X", -20.0), ("thigh_anchor.L", "X", 42.0), ("shin_anchor.L", "X", -76.0), ("thigh_anchor.R", "X", 34.0), ("shin_anchor.R", "X", -65.0)),
                    (-0.18, 0.24, -0.68),
                    "locomotion_leg_bend",
                    1.0,
                ),
                pose_key(
                    60,
                    (("root", "X", 78.0), ("root", "Z", -28.0), ("spine_01", "X", 38.0), ("spine_02", "Z", -20.0), ("chest", "X", 28.0), ("neck", "X", -22.0), ("head", "X", -24.0), ("thigh_anchor.L", "X", 46.0), ("shin_anchor.L", "X", -82.0), ("thigh_anchor.R", "X", 38.0), ("shin_anchor.R", "X", -72.0)),
                    (-0.20, 0.28, -0.78),
                    "locomotion_leg_bend",
                    1.0,
                ),
            ],
        },
    ]


def apply_pose(
    rig: bpy.types.Object,
    accepted: dict[str, Matrix],
    key: dict[str, Any],
) -> None:
    basis = {name: matrix.copy() for name, matrix in accepted.items()}
    root = basis["root"].copy()
    root.translation += Vector(key["rootLocation"])
    basis["root"] = root
    for bone_name, axis, degrees in key["rotations"]:
        basis[bone_name] = basis[bone_name] @ Matrix.Rotation(
            math.radians(degrees), 4, axis
        )
    for bone in rig.pose.bones:
        bone.matrix_basis = basis[bone.name]
    bpy.context.view_layer.update()


def key_rig_pose(rig: bpy.types.Object, frame: float) -> None:
    for bone in rig.pose.bones:
        bone.keyframe_insert(data_path="location", frame=frame, group=bone.name)
        bone.keyframe_insert(
            data_path="rotation_quaternion", frame=frame, group=bone.name
        )
        bone.keyframe_insert(data_path="scale", frame=frame, group=bone.name)


def add_nla_track(
    animation_data: bpy.types.AnimData,
    action: bpy.types.Action,
    clip_name: str,
    frame_end: float,
) -> None:
    track = animation_data.nla_tracks.new()
    track.name = clip_name
    strip = track.strips.new(clip_name, 1, action)
    strip.action_frame_start = 1.0
    strip.action_frame_end = frame_end
    strip.frame_start = 1.0
    strip.frame_end = frame_end
    strip.blend_type = "REPLACE"
    strip.extrapolation = "NOTHING"


def set_morph_weights(shape_keys: bpy.types.Key, key: dict[str, Any]) -> None:
    target_suffix = key["morph"]
    weight = float(key["morphWeight"])
    accepted = None
    target = None
    for block in shape_keys.key_blocks:
        if block.name == "Basis":
            continue
        if block.name.endswith("_accepted_contact"):
            accepted = block
        if block.name.endswith(f"_{target_suffix}"):
            target = block
        block.value = 0.0
    if target_suffix == "accepted_contact" or target is None:
        if accepted is not None:
            accepted.value = 1.0
    else:
        if accepted is not None:
            accepted.value = max(0.0, 1.0 - weight)
        target.value = weight


def bake_current_shape_mix(obj: bpy.types.Object) -> dict[str, Any] | None:
    """Bake the currently evaluated relative-key mix into Basis, then remove keys.

    Rev12's corrective targets are valid in its source GLB, but a Blender GLB
    import/re-export round trip emits those imported deltas as extreme runtime
    spikes.  V6-C therefore freezes the visually accepted Rev12 frame-1 mix in
    object-local coordinates before gameplay animation authoring.  The armature
    remains live; only the accepted corrective surface is made static.
    """
    shape_keys = obj.data.shape_keys
    if shape_keys is None or len(shape_keys.key_blocks) <= 1:
        return None
    if not shape_keys.use_relative:
        raise RuntimeError(f"Absolute shape keys are not supported for {obj.name}")

    blocks = list(shape_keys.key_blocks)
    basis = blocks[0]
    active = [
        {"name": block.name, "value": float(block.value)}
        for block in blocks[1:]
        if abs(float(block.value)) > 1.0e-8
    ]
    baked_coordinates = [point.co.copy() for point in basis.data]
    for block in blocks[1:]:
        value = float(block.value)
        if abs(value) <= 1.0e-8:
            continue
        relative = block.relative_key or basis
        for index, coordinate in enumerate(baked_coordinates):
            coordinate += (block.data[index].co - relative.data[index].co) * value
    for index, coordinate in enumerate(baked_coordinates):
        basis.data[index].co = coordinate

    removed = [block.name for block in blocks[1:]]
    obj.shape_key_clear()
    return {
        "object": obj.name,
        "vertices": len(obj.data.vertices),
        "removedShapeKeys": removed,
        "activeAcceptedMix": active,
        "armaturePreserved": any(modifier.type == "ARMATURE" for modifier in obj.modifiers),
    }


def clear_source_animation(rig: bpy.types.Object, shape_objects: list[bpy.types.Object]) -> None:
    if rig.animation_data:
        rig.animation_data_clear()
    for obj in shape_objects:
        shape_keys = obj.data.shape_keys
        if shape_keys and shape_keys.animation_data:
            shape_keys.animation_data_clear()
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def build_gameplay_tracks(
    rig: bpy.types.Object,
    shape_objects: list[bpy.types.Object],
    accepted: dict[str, Matrix],
    contract: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rig.animation_data_create()
    rig.animation_data.use_nla = False
    for obj in shape_objects:
        obj.data.shape_keys.animation_data_create()
        obj.data.shape_keys.animation_data.use_nla = False

    records = []
    for clip in contract:
        clip_name = clip["name"]
        action = bpy.data.actions.new(f"{clip_name}__RIG")
        rig.animation_data.action = action
        for key in clip["keys"]:
            bpy.context.scene.frame_set(key["frame"])
            apply_pose(rig, accepted, key)
            key_rig_pose(rig, float(key["frame"]))
        set_action_interpolation(action, clip["interpolation"])
        action["kyx_clip_name"] = clip_name
        action["kyx_clip_class"] = "genuine_third_person_gameplay_candidate"
        action["kyx_loop"] = bool(clip["loop"])
        add_nla_track(
            rig.animation_data,
            action,
            clip_name,
            float(clip["frameEnd"]),
        )

        morph_actions = []
        for obj in shape_objects:
            shape_keys = obj.data.shape_keys
            morph_action = bpy.data.actions.new(
                f"{clip_name}__{obj.name}__MORPH"
            )
            shape_keys.animation_data.action = morph_action
            animated = [key for key in shape_keys.key_blocks if key.name != "Basis"]
            for key in clip["keys"]:
                set_morph_weights(shape_keys, key)
                for block in animated:
                    block.keyframe_insert(
                        data_path="value",
                        frame=float(key["frame"]),
                        group="V6C_RUNTIME_CORRECTIVES",
                    )
            set_action_interpolation(morph_action, clip["interpolation"])
            add_nla_track(
                shape_keys.animation_data,
                morph_action,
                clip_name,
                float(clip["frameEnd"]),
            )
            morph_actions.append(morph_action.name)

        records.append(
            {
                "name": clip_name,
                "label": clip["label"],
                "frameStart": 1,
                "frameEnd": clip["frameEnd"],
                "durationSeconds": (clip["frameEnd"] - 1) / FPS,
                "loop": clip["loop"],
                "interpolation": clip["interpolation"],
                "authoredPoseKeys": len(clip["keys"]),
                "rigAction": action.name,
                "rigFcurves": len(action_fcurves(action)),
                "morphActions": morph_actions,
                "contactPolicy": clip["contactPolicy"],
            }
        )

    rig.animation_data.action = None
    rig.animation_data.use_nla = True
    for obj in shape_objects:
        shape_keys = obj.data.shape_keys
        shape_keys.animation_data.action = None
        shape_keys.animation_data.use_nla = True
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = max(clip["frameEnd"] for clip in contract)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    return records


def exporter_kwargs(path: Path) -> dict[str, Any]:
    requested = {
        "filepath": str(path),
        "check_existing": False,
        "export_format": "GLB",
        "use_selection": True,
        "export_copyright": (
            "Includes CC0-derived Blender Human Base Meshes anatomy; "
            "KYX-authored design, gear, rig, materials, and gameplay-animation "
            "candidate. Non-default, non-release, not G6."
        ),
        "export_texcoords": False,
        "export_normals": True,
        "export_tangents": False,
        "export_materials": "EXPORT",
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
    json_length, json_type = struct.unpack_from("<II", payload, 12)
    if magic != b"glTF" or version != 2 or declared_length != len(payload):
        raise RuntimeError("Invalid GLB header")
    if json_type != 0x4E4F534A:
        raise RuntimeError("GLB JSON chunk missing")
    doc = json.loads(payload[20 : 20 + json_length].decode("utf-8").rstrip(" \t\r\n\x00"))
    accessors = doc.get("accessors", [])
    animations = []
    for animation in doc.get("animations", []):
        inputs = [accessors[sampler["input"]] for sampler in animation.get("samplers", [])]
        starts = [float(accessor.get("min", [0.0])[0]) for accessor in inputs]
        ends = [float(accessor.get("max", [0.0])[0]) for accessor in inputs]
        animations.append(
            {
                "name": animation.get("name", ""),
                "durationSeconds": max(ends, default=0.0) - min(starts, default=0.0),
                "channels": len(animation.get("channels", [])),
                "samplers": len(animation.get("samplers", [])),
                "keyCountMinimum": min((a.get("count", 0) for a in inputs), default=0),
                "keyCountMaximum": max((a.get("count", 0) for a in inputs), default=0),
                "distinctKeyCounts": sorted({a.get("count", 0) for a in inputs}),
                "interpolations": dict(
                    sorted(Counter(s.get("interpolation", "LINEAR") for s in animation.get("samplers", [])).items())
                ),
                "targetPaths": dict(
                    sorted(Counter(channel.get("target", {}).get("path", "") for channel in animation.get("channels", [])).items())
                ),
            }
        )
    primitives = [
        primitive
        for mesh in doc.get("meshes", [])
        for primitive in mesh.get("primitives", [])
    ]
    triangles = 0
    for primitive in primitives:
        accessor = accessors[primitive["indices"]]
        count = int(accessor["count"])
        mode = int(primitive.get("mode", 4))
        if mode == 4:
            triangles += count // 3
        elif mode in {5, 6}:
            triangles += max(0, count - 2)
    external_uris = []
    for section in ("buffers", "images"):
        for record in doc.get(section, []):
            uri = record.get("uri")
            if uri and not uri.startswith("data:"):
                external_uris.append(uri)
    return {
        "asset": doc.get("asset", {}),
        "bytes": len(payload),
        "sha256": sha256(path),
        "counts": {
            "nodes": len(doc.get("nodes", [])),
            "meshes": len(doc.get("meshes", [])),
            "primitives": len(primitives),
            "triangles": triangles,
            "materials": len(doc.get("materials", [])),
            "skins": len(doc.get("skins", [])),
            "animations": len(doc.get("animations", [])),
            "images": len(doc.get("images", [])),
            "textures": len(doc.get("textures", [])),
        },
        "skinJointCounts": [len(skin.get("joints", [])) for skin in doc.get("skins", [])],
        "externalUris": external_uris,
        "animations": animations,
    }


def assign_imported_action(
    rig: bpy.types.Object,
    shape_objects: list[bpy.types.Object],
    action: bpy.types.Action,
) -> None:
    rig.animation_data_create()
    rig.animation_data.use_nla = False
    rig.animation_data.action = action
    for obj in shape_objects:
        shape_keys = obj.data.shape_keys
        shape_keys.animation_data_create()
        shape_keys.animation_data.use_nla = False
        shape_keys.animation_data.action = action


def audit_reimport(
    glb_path: Path,
    proof_path: Path,
    contract: list[dict[str, Any]],
) -> dict[str, Any]:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(glb_path))
    if "FINISHED" not in result:
        raise RuntimeError(f"Fresh GLB reimport failed: {result}")
    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    rig = max(rigs, key=lambda obj: len(obj.data.bones), default=None)
    if rig is None:
        raise RuntimeError("Fresh GLB reimport contains no armature")
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    shape_objects = [obj for obj in meshes if obj.data.shape_keys is not None]
    actions = {action.name: action for action in bpy.data.actions}

    idle = actions.get("KYX_V6C_TP_IDLE")
    if idle is None:
        raise RuntimeError("Imported idle action missing")
    assign_imported_action(rig, shape_objects, idle)
    idle_start = float(idle.frame_range[0])
    bpy.context.scene.frame_set(math.floor(idle_start), subframe=idle_start % 1.0)
    bpy.context.view_layer.update()
    baseline_palms = palm_relation(rig)

    clip_audits = []
    for spec in contract:
        action = actions.get(spec["name"])
        if action is None:
            clip_audits.append({"name": spec["name"], "present": False})
            continue
        assign_imported_action(rig, shape_objects, action)
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
        palm_relations = []
        for frame in sample_frames:
            bpy.context.scene.frame_set(math.floor(frame), subframe=frame % 1.0)
            bpy.context.view_layer.update()
            snapshots.append(pose_snapshot(rig))
            palm_relations.append(palm_relation(rig))
        max_pose_motion = max(
            max_delta(snapshots[0][bone], snapshot[bone])
            for snapshot in snapshots[1:]
            for bone in snapshots[0]
        )
        varied_bones = sum(
            any(max_delta(snapshots[0][bone], snapshot[bone]) > 1.0e-4 for snapshot in snapshots[1:])
            for bone in snapshots[0]
        )
        max_palm_delta = max(max_delta(baseline_palms, relation) for relation in palm_relations)
        end_palm_delta = max_delta(baseline_palms, palm_relations[-1])
        fcurves = action_fcurves(action)
        clip_audits.append(
            {
                "name": spec["name"],
                "present": True,
                "frameRange": [start, end],
                "durationSecondsAt24Fps": (end - start) / FPS,
                "sampleFrames": sample_frames,
                "fcurves": len(fcurves),
                "keyframeCountMinimum": min((len(f.keyframe_points) for f in fcurves), default=0),
                "keyframeCountMaximum": max((len(f.keyframe_points) for f in fcurves), default=0),
                "maxPoseMatrixDelta": max_pose_motion,
                "variedBones": varied_bones,
                "loopSeamMaxMatrixDelta": (
                    max(max_delta(snapshots[0][bone], snapshots[-1][bone]) for bone in snapshots[0])
                    if spec["loop"]
                    else None
                ),
                "maxPalmRelationDelta": max_palm_delta,
                "endPalmRelationDelta": end_palm_delta,
                "contactException": spec["name"] == "KYX_V6C_TP_RELOAD",
            }
        )

    contact_meshes = [obj for obj in meshes if "RuntimeContact_" in obj.name]
    contact_skin_groups = {}
    for obj in contact_meshes:
        weighted_groups = {
            obj.vertex_groups[assignment.group].name
            for vertex in obj.data.vertices
            for assignment in vertex.groups
            if assignment.weight > 1.0e-6
        }
        contact_skin_groups[obj.name] = sorted(weighted_groups)
    nonempty = all(len(obj.data.vertices) > 0 and len(obj.data.polygons) > 0 for obj in meshes)
    materials = sorted(material.name for material in bpy.data.materials)

    idle = actions.get("KYX_V6C_TP_IDLE")
    if idle is not None:
        assign_imported_action(rig, shape_objects, idle)
        bpy.context.scene.frame_set(int(idle.frame_range[0]))
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
        "largestRig": rig.name,
        "bones": len(rig.data.bones),
        "meshes": len(meshes),
        "materials": len(materials),
        "shapeKeyMeshes": len(shape_objects),
        "nonemptyMeshes": nonempty,
        "actionNames": sorted(actions),
        "clips": clip_audits,
        "contactFixtureSkinGroups": contact_skin_groups,
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
    if source_hash_before != SOURCE_REV12_SHA256:
        raise RuntimeError(
            f"Rev12 source hash mismatch: {source_hash_before} != {SOURCE_REV12_SHA256}"
        )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    result = bpy.ops.import_scene.gltf(filepath=str(source_path))
    if "FINISHED" not in result:
        raise RuntimeError(f"Rev12 import failed: {result}")
    bpy.context.scene.render.fps = FPS
    rigs = [obj for obj in bpy.data.objects if obj.type == "ARMATURE"]
    rig = max(rigs, key=lambda obj: len(obj.data.bones), default=None)
    if rig is None or len(rig.data.bones) != EXPECTED_BONES:
        raise RuntimeError("Expected one 52-bone Rev12 rig")
    meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
    shape_objects = [obj for obj in meshes if obj.data.shape_keys is not None]

    accepted_action = bpy.data.actions.get("V6B_DIAG_ACCEPTED_CONTACT_HOLD_NOT_G6")
    if accepted_action is None:
        raise RuntimeError("Rev12 accepted-contact action is missing")
    assign_imported_action(rig, shape_objects, accepted_action)
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    accepted_basis = {bone.name: bone.matrix_basis.copy() for bone in rig.pose.bones}
    accepted_palms = palm_relation(rig)

    # Freeze Rev12's accepted frame-1 surface before clearing its diagnostic
    # animation.  This deliberately prevents imported corrective targets from
    # being re-exported as corrupt stretched geometry in Three.js while keeping
    # the full 52-bone skin live for the ten gameplay clips.
    corrective_bakes = [
        record
        for obj in shape_objects
        if (record := bake_current_shape_mix(obj)) is not None
    ]
    shape_objects = [obj for obj in meshes if obj.data.shape_keys is not None]

    clear_source_animation(rig, shape_objects)
    contract = clip_contract()
    animation_records = build_gameplay_tracks(
        rig, shape_objects, accepted_basis, contract
    )
    rig["kyx_checkpoint"] = CHECKPOINT
    rig["kyx_source_rev12_sha256"] = SOURCE_REV12_SHA256
    rig["kyx_non_default_non_release_not_g6"] = True
    rig["kyx_first_person_arms_status"] = "BLOCKED_NO_CLEAN_SEPARATE_ARM_MESH"
    bpy.context.scene["kyx_checkpoint"] = CHECKPOINT

    candidate_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(
        filepath=str(candidate_path), check_existing=False, compress=True
    )
    candidate_hash = sha256(candidate_path)

    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="DESELECT")
    export_objects = [rig, *meshes]
    for obj in export_objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    kwargs = exporter_kwargs(glb_path)
    export_result = bpy.ops.export_scene.gltf(**kwargs)
    if "FINISHED" not in export_result:
        raise RuntimeError(f"V6-C GLB export failed: {export_result}")
    glb_audit = parse_glb(glb_path)

    source_hash_after = sha256(source_path)
    reimport = audit_reimport(glb_path, proof_path, contract)
    glb_clips = {record["name"]: record for record in glb_audit["animations"]}
    imported_clips = {record["name"]: record for record in reimport["clips"]}
    expected_durations = {
        clip["name"]: (clip["frameEnd"] - 1) / FPS for clip in contract
    }
    stable_clips = [name for name in EXPECTED_CLIPS if name != "KYX_V6C_TP_RELOAD"]
    reload_audit = imported_clips.get("KYX_V6C_TP_RELOAD", {})
    assertions = {
        "rev12SourceHashPinnedAndUnchanged": (
            source_hash_before == source_hash_after == SOURCE_REV12_SHA256
        ),
        "candidateSavedOutsideRev12Path": (
            candidate_path.exists()
            and source_path not in candidate_path.parents
            and "v6c-gameplay-rev13" in str(candidate_path).lower()
        ),
        "glbHeaderSelfContained": not glb_audit["externalUris"],
        "glbContainsExactGameplayClipSet": (
            set(glb_clips) == set(EXPECTED_CLIPS)
            and glb_audit["counts"]["animations"] == len(EXPECTED_CLIPS)
        ),
        "glbContainsNoDiagnosticHoldClips": all(
            "DIAG" not in name and "HOLD_NOT_G6" not in name for name in glb_clips
        ),
        "allGlbClipsHaveExpectedNonzeroDurations": all(
            name in glb_clips
            and glb_clips[name]["durationSeconds"] > 0.1
            and abs(glb_clips[name]["durationSeconds"] - duration) <= 1.0 / FPS
            for name, duration in expected_durations.items()
        ),
        "allGlbClipsHaveMultiKeyMotionTracks": all(
            record["keyCountMaximum"] >= 4
            and record["channels"] >= EXPECTED_BONES * 3
            and record["targetPaths"].get("rotation", 0) >= EXPECTED_BONES
            for record in glb_clips.values()
        ),
        "freshReimportContains52BoneRigAndMeshes": (
            reimport["bones"] == EXPECTED_BONES
            and reimport["meshes"] >= 100
            and reimport["nonemptyMeshes"]
        ),
        "freshReimportContainsExactGameplayClipSet": (
            set(reimport["actionNames"]) == set(EXPECTED_CLIPS)
            and all(record.get("present") for record in reimport["clips"])
        ),
        "everyImportedClipHasVisiblePoseDiversity": all(
            record.get("maxPoseMatrixDelta", 0.0) > 0.001
            and record.get("variedBones", 0) >= 2
            for record in reimport["clips"]
        ),
        "loopClipsAreSeamClosed": all(
            imported_clips[name]["loopSeamMaxMatrixDelta"] <= CONTACT_TOLERANCE
            for name in LOOP_CLIPS
        ),
        "supportAndGripRelationStableOutsideReload": all(
            imported_clips[name]["maxPalmRelationDelta"] <= CONTACT_TOLERANCE
            for name in stable_clips
        ),
        "reloadSupportHandDepartsAndReturns": (
            reload_audit.get("maxPalmRelationDelta", 0.0) > 0.005
            and reload_audit.get("endPalmRelationDelta", math.inf) <= CONTACT_TOLERANCE
        ),
        "runtimeContactFixturesRemainPalmRightSkinned": (
            len(reimport["contactFixtureSkinGroups"]) == 6
            and all(
                groups == ["palm.R"]
                for groups in reimport["contactFixtureSkinGroups"].values()
            )
        ),
        "acceptedCorrectiveSurfaceBakedAndNoRuntimeMorphTracks": (
            len(corrective_bakes) > 0
            and all(record["removedShapeKeys"] for record in corrective_bakes)
            and reimport["shapeKeyMeshes"] == 0
            and all(
                record["targetPaths"].get("weights", 0) == 0
                for record in glb_clips.values()
            )
        ),
    }
    passed = all(assertions.values())
    report = {
        "schema": "kyx-v6c-gameplay-animation-rev13-audit-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "checkpoint": CHECKPOINT,
        "status": (
            "PASS_BOUNDED_V6C_GAMEPLAY_ANIMATION_CANDIDATE_NOT_G6"
            if passed
            else "FAIL_BOUNDED_V6C_GAMEPLAY_ANIMATION_CANDIDATE"
        ),
        "sourceRev12": {
            "path": str(source_path),
            "bytes": source_path.stat().st_size,
            "sha256Before": source_hash_before,
            "sha256After": source_hash_after,
            "unchanged": source_hash_before == source_hash_after,
        },
        "candidateBlend": {
            "path": str(candidate_path),
            "bytes": candidate_path.stat().st_size,
            "sha256": candidate_hash,
        },
        "rig": {
            "name": RIG_NAME,
            "bones": EXPECTED_BONES,
            "acceptedPalmRelation": accepted_palms,
            "contactPolicy": (
                "The rifle/contact fixtures remain one-bone skinned to palm.R. "
                "All clips preserve the accepted palm-to-palm relation except "
                "the intentional support-hand reload excursion, which returns "
                "to the accepted relation on the final key."
            ),
        },
        "animationContract": animation_records,
        "acceptedCorrectiveSurfaceBake": {
            "status": "BAKED_TO_STATIC_BASE_BEFORE_GAMEPLAY_EXPORT",
            "reason": (
                "A controlled Three.js normal-versus-zero-morph render isolated "
                "Rev12 imported corrective targets as the source of stretched "
                "geometry after GLB re-export. The accepted frame-1 local-space "
                "mix is baked into Basis while the 52-bone armature stays live."
            ),
            "objects": corrective_bakes,
        },
        "firstPersonArms": {
            "status": "BLOCKED_NOT_AUTHORED",
            "blocker": (
                "Rev12 contains a continuous full-body anatomy mesh and continuous "
                "one-piece undersuit, with no reviewed shoulder cutoff, dedicated "
                "first-person topology/UVs, viewmodel camera contract, or occlusion "
                "test. Extracting visible arms here would create unreviewed seams "
                "and would not be a clean first-person asset."
            ),
            "requiredFutureClips": [
                "arms_idle",
                "arms_walk_sway",
                "arms_run_sway",
                "arms_primary_fire",
                "arms_reload",
            ],
        },
        "export": {
            "path": str(glb_path),
            "operator": "bpy.ops.export_scene.gltf",
            "operatorKwargs": kwargs,
            **glb_audit,
        },
        "reimport": reimport,
        "budget": {
            "measured": {
                "triangles": glb_audit["counts"]["triangles"],
                "primitives": glb_audit["counts"]["primitives"],
                "materials": glb_audit["counts"]["materials"],
                "nodes": glb_audit["counts"]["nodes"],
                "lods": 0,
            },
            "currentCharacterLimits": {"triangles": 45000, "primitives": 3},
            "status": "OPEN_OVER_BUDGET_NOT_RELEASE",
            "safeOptimizationSequence": [
                "Freeze the visually accepted V6-C high-detail source and never decimate it in place.",
                "Build a clean authored LOD0 retopology near 45k triangles with one continuous body/undersuit shell and preserve hands, face, helmet silhouette, and rifle contacts.",
                f"Merge rigid armor and rifle subparts by material/skin role, then atlas materials to reduce {glb_audit['counts']['primitives']} primitives toward the three-primitive contract.",
                "Transfer weights and corrective shapes from the frozen high-detail source; replay this exact ten-clip audit before accepting LOD0.",
                "Derive LOD1/LOD2 from the accepted LOD0 with silhouette/contact constraints, then add screen-size switching and multiplayer performance capture.",
                "Do not use blind whole-character decimation as the first step; it would jeopardize hands, garment boundaries, helmet facets, and rifle contact."
            ],
        },
        "assertions": assertions,
        "nonClaims": [
            "This is a non-default, non-release V6-C/Rev13 gameplay-animation candidate.",
            "It does not replace public/player.glb or any assets/runtime path.",
            "No first-person arms, LOD, multiplayer, performance, human visual acceptance, or G6 claim is made.",
            "The Blender and Three.js proofs validate authentic timed motion and runtime playback, not final animation polish."
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "assertions": assertions}, sort_keys=True))
    if not passed:
        failed = [name for name, value in assertions.items() if not value]
        raise RuntimeError(f"V6-C Rev13 audit failed: {failed}")


if __name__ == "__main__":
    main()
