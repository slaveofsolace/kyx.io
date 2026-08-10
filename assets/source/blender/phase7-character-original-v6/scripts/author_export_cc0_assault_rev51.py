from __future__ import annotations

import bpy
import bmesh
import hashlib
import json
import math
import os
import struct
import time
import traceback
from pathlib import Path

from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from bpy_extras.object_utils import world_to_camera_view


SCRIPT_PATH = Path(__file__).resolve()
WORKTREE = SCRIPT_PATH.parents[5]
SOURCE_BLEND = (
    WORKTREE
    / "assets"
    / "source"
    / "blender"
    / "phase7-character-original-v6"
    / "model"
    / "v6c-character-rev30-cc0-donor"
    / "kyx-v6c-character-rev30-cc0-donor-master.blend"
)
ASSAULT_VARIANT = os.environ.get("KYX_ASSAULT_VARIANT", "")
if ASSAULT_VARIANT not in {
    "",
    "weapon-ready-v2",
    "weapon-ready-v3",
    "weapon-ready-v4",
    "weapon-ready-v5",
    "weapon-ready-v6",
    "weapon-ready-v7",
    "weapon-ready-v8",
    "weapon-ready-v9",
    "weapon-ready-v11",
    "weapon-ready-v15",
}:
    raise RuntimeError(f"Unknown KYX assault variant: {ASSAULT_VARIANT}")
WEAPON_READY_VARIANT = bool(ASSAULT_VARIANT)
WEAPON_READY_ANCHOR_VARIANT = ASSAULT_VARIANT in {
    "weapon-ready-v3",
    "weapon-ready-v4",
    "weapon-ready-v5",
    "weapon-ready-v6",
    "weapon-ready-v7",
    "weapon-ready-v8",
    "weapon-ready-v9",
    "weapon-ready-v11",
    "weapon-ready-v15",
}
WEAPON_READY_WEIGHT_REPAIR_VARIANT = ASSAULT_VARIANT in {
    "weapon-ready-v4",
    "weapon-ready-v5",
    "weapon-ready-v6",
    "weapon-ready-v7",
    "weapon-ready-v8",
    "weapon-ready-v9",
    "weapon-ready-v11",
    "weapon-ready-v15",
}
KEVIN_RIFLE_VARIANT = ASSAULT_VARIANT == "weapon-ready-v5"
VLR7_GRIP_VARIANT = ASSAULT_VARIANT == "weapon-ready-v7"
VLR7_DIAGNOSTIC_VARIANT = ASSAULT_VARIANT in {
    "weapon-ready-v11",
    "weapon-ready-v15",
}
VLR7_ORIENTED_CLEARANCE_VARIANT = ASSAULT_VARIANT == "weapon-ready-v15"
VLR7_ANATOMICAL_GRIP_VARIANT = ASSAULT_VARIANT in {
    "weapon-ready-v9",
    "weapon-ready-v11",
    "weapon-ready-v15",
}
VLR7_LANDMARK_GRIP_VARIANT = ASSAULT_VARIANT in {
    "weapon-ready-v8",
    "weapon-ready-v9",
    "weapon-ready-v11",
    "weapon-ready-v15",
}
VLR7_MATERIAL_VARIANT = VLR7_GRIP_VARIANT or VLR7_LANDMARK_GRIP_VARIANT
VLR7_CONSTRAINED_VARIANT = ASSAULT_VARIANT in {
    "weapon-ready-v6",
    "weapon-ready-v7",
    "weapon-ready-v8",
    "weapon-ready-v9",
    "weapon-ready-v11",
    "weapon-ready-v15",
}
VLR7_CONTACT_SOLVE_LABEL = (
    "KYX VLR-7 Rev51 bounded-route anatomical landmark grip solve"
    if VLR7_ORIENTED_CLEARANCE_VARIANT
    else "KYX VLR-7 Rev47 fixture-schema-validated anatomical landmark grip solve"
    if VLR7_DIAGNOSTIC_VARIANT
    else "KYX VLR-7 exact-normal anatomical landmark grip solve"
    if VLR7_ANATOMICAL_GRIP_VARIANT
    else "KYX VLR-7 semantic per-digit landmark grip solve"
    if VLR7_LANDMARK_GRIP_VARIANT
    else "KYX VLR-7 actual-geometry constrained contact solve"
)
if not WEAPON_READY_VARIANT:
    CANDIDATE_ID = "g6-assault-rev40-cc0"
    MODEL_SLUG = "v6c-character-rev40-cc0-assault"
    EVIDENCE_SLUG = "g6-assault-rev40-source-build"
elif VLR7_ORIENTED_CLEARANCE_VARIANT:
    CANDIDATE_ID = "g6-assault-rev51-vlr7-bounded-route-v1"
    MODEL_SLUG = "v6c-character-rev51-vlr7-bounded-route-assault-v1"
    EVIDENCE_SLUG = "g6-assault-rev51-vlr7-bounded-route-source-build-v1"
elif VLR7_DIAGNOSTIC_VARIANT:
    CANDIDATE_ID = "g6-assault-rev47-vlr7-fixture-schema-v1"
    MODEL_SLUG = "v6c-character-rev47-vlr7-fixture-schema-assault-v1"
    EVIDENCE_SLUG = "g6-assault-rev47-vlr7-fixture-schema-source-build-v1"
elif VLR7_ANATOMICAL_GRIP_VARIANT:
    CANDIDATE_ID = "g6-assault-rev45-vlr7-anatomical-grip-v1"
    MODEL_SLUG = "v6c-character-rev45-vlr7-anatomical-grip-assault-v1"
    EVIDENCE_SLUG = "g6-assault-rev45-vlr7-anatomical-grip-source-build-v1"
elif VLR7_LANDMARK_GRIP_VARIANT:
    CANDIDATE_ID = "g6-assault-rev44-vlr7-landmark-grip-v1"
    MODEL_SLUG = "v6c-character-rev44-vlr7-landmark-grip-assault-v1"
    EVIDENCE_SLUG = "g6-assault-rev44-vlr7-landmark-grip-source-build-v1"
elif VLR7_GRIP_VARIANT:
    CANDIDATE_ID = "g6-assault-rev43-vlr7-grip-v1"
    MODEL_SLUG = "v6c-character-rev43-vlr7-grip-assault-v1"
    EVIDENCE_SLUG = "g6-assault-rev43-vlr7-grip-source-build-v1"
elif VLR7_CONSTRAINED_VARIANT:
    CANDIDATE_ID = "g6-assault-rev42-vlr7-constrained-v1"
    MODEL_SLUG = "v6c-character-rev42-vlr7-constrained-assault-v1"
    EVIDENCE_SLUG = "g6-assault-rev42-vlr7-constrained-source-build-v1"
elif KEVIN_RIFLE_VARIANT:
    CANDIDATE_ID = "g6-assault-rev41-kevin-rifle-v1"
    MODEL_SLUG = "v6c-character-rev41-kevin-rifle-assault-v1"
    EVIDENCE_SLUG = "g6-assault-rev41-kevin-rifle-source-build-v1"
else:
    CANDIDATE_ID = f"g6-assault-rev40-cc0-{ASSAULT_VARIANT}"
    MODEL_SLUG = f"v6c-character-rev40-cc0-assault-{ASSAULT_VARIANT}"
    EVIDENCE_SLUG = (
        f"g6-assault-rev40-weapon-ready-source-build-v{ASSAULT_VARIANT[-1]}"
    )
MODEL_DIR = (
    WORKTREE
    / "assets"
    / "source"
    / "blender"
    / "phase7-character-original-v6"
    / "model"
    / MODEL_SLUG
)
MASTER_BLEND = MODEL_DIR / f"kyx-{MODEL_SLUG}-master.blend"
RUNTIME_DIR = WORKTREE / "assets" / "review" / "runtime-candidates" / CANDIDATE_ID
EVIDENCE_DIR = (
    WORKTREE
    / "evidence"
    / "2026-08-09"
    / EVIDENCE_SLUG
)
REPORT_PATH = EVIDENCE_DIR / "author-export-report.json"
MANIFEST_PATH = RUNTIME_DIR / "manifest.json"
NOTICE_PATH = MODEL_DIR / "DONOR_NOTICE.md"
REV46_STAGE_LOG_PATH = EVIDENCE_DIR / (
    "rev51-stage.jsonl" if VLR7_ORIENTED_CLEARANCE_VARIANT else "rev47-stage.jsonl"
)
REV46_TRACEBACK_PATH = EVIDENCE_DIR / (
    "rev51-traceback.txt"
    if VLR7_ORIENTED_CLEARANCE_VARIANT
    else "rev47-traceback.txt"
)
REV46_WRAPPER_TRACEBACK_PATH = EVIDENCE_DIR / (
    "rev51-wrapper-traceback.txt"
    if VLR7_ORIENTED_CLEARANCE_VARIANT
    else "rev47-wrapper-traceback.txt"
)
_REV46_STAGE_SEQUENCE = 0

UAL1_GLB = Path(
    r"D:\AI Projects\Projects\Games\evio\resource-quarantine-20260802"
    r"\quaternius-universal-animation\UAL1"
    r"\Universal Animation Library[Standard]\Unreal-Godot\UAL1_Standard.glb"
)
UAL2_GLB = Path(
    r"D:\AI Projects\Projects\Games\evio\resource-quarantine-20260802"
    r"\quaternius-universal-animation\UAL2"
    r"\Universal Animation Library 2[Standard]\Unreal-Godot\UAL2_Standard.glb"
)
KEVIN_SOLDIER_BLEND = Path(
    r"D:\AI Projects\Projects\Games\evio\resource-quarantine-20260809"
    r"\human-soldier-animations-free\blender-reviewed"
    r"\HumanM_SoldierAnimationsFREE_2.0.blend"
)
KEVIN_SOLDIER_ARCHIVE = Path(
    r"D:\AI Projects\Projects\Games\evio\resource-quarantine-20260809"
    r"\human-soldier-animations-free\Human Soldier Animations FREE.zip"
)
VLR7_REVIEW_BLEND = (
    WORKTREE
    / "assets"
    / "source"
    / "blender"
    / "kyx-weapons"
    / "vlr7-quaternius-rev1"
    / "kyx-vlr7-quaternius-rev1.blend"
)
VLR7_REVIEW_BLEND_SHA256 = (
    "79e7e94af59303c7028fcb3c851ad7b514007a155880abd96910d06b8ec2c139"
)
VLR7_REVIEW_GLB = (
    WORKTREE
    / "assets"
    / "review"
    / "runtime-candidates"
    / "kyx-vlr7-quaternius-rev1"
    / "kyx-vlr7-quaternius-rev1.glb"
)
VLR7_REVIEW_GLB_SHA256 = (
    "46de2380ac08810524d7bb4bb67d8621bb436a4f559b4d672d5c2026a075dd79"
)
VLR7_ROOT_NAME = "KYX_VLR7_QUATERNIUS_REV1"
VLR7_STOCK_NAME = "KYX_VLR7_REVIEW_STOCK_GRIP"
VLR7_HANDGUARD_NAME = "KYX_VLR7_REVIEW_RECEIVER_HANDGUARD"
VLR7_TRIGGER_GUARD_NAME = "KYX_VLR7_REVIEW_TRIGGER_GUARD"
VLR7_DOMINANT_MARKER = "KYX_VLR7_REVIEW_DOMINANT_GRIP_REFERENCE"
VLR7_SUPPORT_MARKER = "KYX_VLR7_REVIEW_SUPPORT_GRIP_REFERENCE"
VLR7_MUZZLE_MARKER = "KYX_VLR7_REVIEW_MUZZLE_REFERENCE"
VLR7_RUNTIME_UNIFORM_SCALE = 0.86
# Ten-percent edge inset on the nearest clean underside triangle of the exact
# hash-pinned receiver/handguard. Raw glTF +X/+Y/-Z is converted here to Blender
# +X/+Y/+Z source-local coordinates. Rev42's triangle 298 was a transverse
# muzzle-facing end face, so a palm could reach its point but could not grasp it.
VLR7_SUPPORT_CONTACT_SOURCE_LOCAL = Vector((
    -0.122993874550,
    2.248229932785,
    0.148874521255,
))
VLR7_SUPPORT_CONTACT_CANDIDATE_LOCAL_METERS = (
    -0.019679019928,
    -0.024180077000,
    -0.199716789000,
)
VLR7_SUPPORT_CONTACT_BARYCENTRIC = (0.1, 0.8, 0.1)
VLR7_SUPPORT_CONTACT_PRIMITIVE = 2
VLR7_SUPPORT_CONTACT_TRIANGLE = 287
VLR7_SUPPORT_CONTACT_INDICES = (425, 418, 411)
# Triangle 287 has raw glTF normal (0,-1,0), or Blender-source (0,0,-1).
# The support palm faces the opposite direction, toward the underside surface;
# its fingers run across the weapon along raw/source +X.
VLR7_SUPPORT_SURFACE_NORMAL_SOURCE_LOCAL = Vector((0.0, 0.0, -1.0))
VLR7_SUPPORT_FINGER_SOURCE_LOCAL = Vector((1.0, 0.0, 0.0))
# PCA up-axis of the hash-pinned pistol-grip cluster. The source mapping is
# raw glTF (0,-0.975924739,+0.218107553) -> Blender source
# (0,-0.218107553,-0.975924739) for grip-down; fingers point grip-up.
VLR7_DOMINANT_FINGER_SOURCE_LOCAL = Vector((
    0.0,
    0.218107552643,
    0.975924738635,
))
# Exact +X surface intersection from the dominant center marker into primitive
# 0, triangle 64 of KYX_VLR7_REVIEW_STOCK_GRIP. The right palm contacts this
# side surface instead of being centered inside the pistol grip.
VLR7_DOMINANT_SURFACE_OFFSET_SOURCE_LOCAL = Vector((
    0.137786284089,
    0.0,
    0.0,
))
VLR7_DOMINANT_CONTACT_PRIMITIVE = 0
VLR7_DOMINANT_CONTACT_TRIANGLE = 64
VLR7_DOMINANT_SURFACE_NORMAL_SOURCE_LOCAL = Vector((1.0, 0.0, 0.0))
# These are exact 50%-inset wrist-to-mean-MCP anchors in each hand bone's local
# frame.  Solving the wrist to the weapon surface was Rev42's core error: it put
# the joint on the grip and left the actual palm displaced by roughly 58 mm.
VLR7_PALM_CENTER_FRACTION = 0.5
VLR7_PALM_ANCHOR_LOCAL = {
    "hand_l": Vector((
        0.000387429726,
        0.058537438512,
        -0.002724996768,
    )),
    "hand_r": Vector((
        -0.000387478082,
        0.058537409641,
        -0.002724946011,
    )),
}
VLR7_PALM_CONTACT_TOLERANCE_METERS = 0.002
VLR7_REQUIRED_REACH_MARGIN_METERS = 0.022
VLR7_MAX_WRIST_TWIST_DEGREES = 70.0
VLR7_MAX_WRIST_SWING_DEGREES = 65.0
# Rev44 failed closed at 65.698 degrees on the dominant wrist.  Rev45 keeps
# the anatomical gates unchanged and searches only the exact palm-normal axis
# for the smallest in-plane semantic correction that clears a 0.5-degree
# numerical/animation safety margin.  The explicit cap prevents this bounded
# correction from becoming a disguised orientation clamp.
VLR7_REV45_WRIST_SWING_SOLVE_TARGET_DEGREES = 64.5
VLR7_REV45_MAX_IN_PLANE_CORRECTION_DEGREES = 3.0
VLR7_REV45_IN_PLANE_SEARCH_STEP_DEGREES = 0.25
VLR7_REV45_IN_PLANE_REFINEMENT_ITERATIONS = 10
VLR7_REV45_MAX_ADJACENT_CORRECTION_DEGREES = 0.75
VLR7_REV45_PALM_NORMAL_PRESERVATION_DEGREES = 1e-5
# Bend magnitudes are conservative authored limits; every bend direction is
# recomputed from the hash-pinned weapon surface frame and current phalanx, so
# the digits close toward the actual grip rather than a fixed Euler axis.
VLR7_FINGER_CURL_DEGREES = {
    "dominant": {
        "index": (8.0, 12.0, 8.0),
        "middle": (35.0, 55.0, 40.0),
        "ring": (40.0, 60.0, 45.0),
        "pinky": (45.0, 65.0, 50.0),
        "thumb": (25.0, 35.0, 25.0),
    },
    "support": {
        "index": (30.0, 45.0, 30.0),
        "middle": (35.0, 55.0, 40.0),
        "ring": (40.0, 60.0, 45.0),
        "pinky": (45.0, 65.0, 50.0),
        "thumb": (20.0, 30.0, 20.0),
    },
}
# Rev44 does not consume VLR7_FINGER_CURL_DEGREES.  Each digit is solved from
# an explicit triangle on the hash-pinned VLR-7, through two distinct exterior
# waypoints, while preserving the three authored phalanx lengths.  These
# surface points are fail-closed seeds reconstructed from an explicit GLB
# primitive, zero-based triangle, and barycentric address; the runtime verifier
# recomputes every point and normal before a hand bone is moved.
VLR7_LANDMARK_BARYCENTRIC = (1.0 / 3.0,) * 3
VLR7_FIXTURE_POINT_TOLERANCE_METERS = 0.000002
VLR7_FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS = 0.0000001
VLR7_FIXTURE_NORMAL_DOT_GATE = 0.9999
VLR7_DIGIT_TIP_SURFACE_GATE_METERS = 0.002
VLR7_DIGIT_WAYPOINT_GATE_METERS = 0.008
VLR7_DIGIT_CONTACT_PAD_RADIUS_METERS = 0.008
VLR7_ADJACENT_MCP_SPACING_GATE_METERS = 0.004
VLR7_ADJACENT_TIP_SPACING_GATE_METERS = 0.014
VLR7_DIGIT_LENGTH_GATE_METERS = 0.000002
VLR7_DIGIT_SOLVE_ITERATION_LIMIT = 12
VLR7_DISTAL_WAYPOINT_OUTWARD_BIAS = 0.04
# Rev47 incorrectly applied one fingertip triangle's infinite tangent plane to
# the MCP and both intermediate joints.  The VLR-7 is non-convex, so a point
# can be behind that local plane while remaining outside the actual oriented
# mesh.  Rev51 keeps the strict positive-clearance rule but measures it against
# the nearest triangle on the exact hash-pinned role mesh instead.
VLR7_ORIENTED_MESH_CLEARANCE_GATE_METERS = 0.0
VLR7_ORIENTED_MESH_NUMERICAL_ZERO_METERS = 1e-12
VLR7_DIGIT_MAX_JOINT_DEGREES = 150.0
VLR7_DOMINANT_WRAP_GATE_DEGREES = 115.0
VLR7_SUPPORT_WRAP_GATE_DEGREES = 65.0
VLR7_THUMB_OPPOSITION_GATE_DEGREES = 90.0
VLR7_ROUTE_TEMPORAL_SHAPE_DELTA_GATE_METERS = 0.012
VLR7_ROUTE_THETA_DIVISIONS = 16
VLR7_ROUTE_PSI_DIVISIONS = 32
VLR7_ROUTE_PHI_DIVISIONS = 72
VLR7_ROUTE_DOMINANT_MIDDLE_THETA_INDICES = (7, 8, 9)
VLR7_ROUTE_DOMINANT_MIDDLE_PSI_INDICES = (25, 26, 27)
VLR7_ROUTE_DOMINANT_MIDDLE_PHI_INDICES = (67, 68, 69, 70, 71)
VLR7_ROUTE_DOMINANT_MIDDLE_ACCEPTED_SEED = (8, 26, 69)
# Selection state is action-local and is updated only after every digit has
# completed its preflight and post-application gates for the current frame.
VLR7_ROUTE_TEMPORAL_STATE: dict[tuple[str, str], dict[str, object]] = {}
VLR7_ROUTE_ACTION_NAME: str | None = None
VLR7_TRIGGER_SHELF_MAX_ANGLE_DEGREES = 45.0
VLR7_TRIGGER_INDEX_MAX_WRAP_DEGREES = 75.0
VLR7_CAMERA_FRAME_MIN = 0.08
VLR7_CAMERA_FRAME_MAX = 0.92
VLR7_CAMERA_CLUSTER_GATE = 0.35

VLR7_DOMINANT_WRAP_SOURCE_LOCAL = Vector((1.0, 0.0, 0.0))
VLR7_DOMINANT_AXIS_SOURCE_LOCAL = Vector((
    0.0,
    0.218107552643,
    0.975924738635,
)).normalized()
VLR7_DOMINANT_DEPTH_SOURCE_LOCAL = (
    VLR7_DOMINANT_WRAP_SOURCE_LOCAL.cross(VLR7_DOMINANT_AXIS_SOURCE_LOCAL)
).normalized()
VLR7_DOMINANT_PCA_CENTER_SOURCE_LOCAL = Vector((
    0.0,
    -0.324142694455,
    -0.225098230545,
))
VLR7_SUPPORT_WRAP_SOURCE_LOCAL = Vector((0.0, 0.0, -1.0))
VLR7_SUPPORT_AXIS_SOURCE_LOCAL = Vector((0.0, 1.0, 0.0))
VLR7_SUPPORT_DEPTH_SOURCE_LOCAL = (
    VLR7_SUPPORT_WRAP_SOURCE_LOCAL.cross(VLR7_SUPPORT_AXIS_SOURCE_LOCAL)
).normalized()

VLR7_DIGIT_FIXTURES = {
    "dominant": {
        "side": "r",
        "hand": "hand_r",
        "node": VLR7_STOCK_NAME,
        "mesh": "KYX_VLR7_REVIEW_STOCK_GRIP_MESH",
        "primitive": 0,
        "digits": {
            "index": {
                "qualified": True,
                "triangle": 74,
                "indices": (181, 165, 209),
                "barycentric": (0.20, 0.32, 0.48),
                "surfacePoint": (0.244989141822, 0.213736057281, 0.506494083405),
                "normal": (1.0, 0.0, 0.0),
                "boneCenterOffsetMeters": 0.0015,
            },
            "middle": {
                "qualified": True,
                "triangle": 55,
                "indices": (305, 389, 358),
                "barycentric": (0.50, 0.125, 0.375),
                "surfacePoint": (-0.13778628408908844, -0.2450641840696335, -0.1637265309691429),
                "normal": (-1.0, 0.0, 0.0),
                "boneCenterOffsetMeters": 0.0015,
            },
            "ring": {
                "qualified": True,
                "triangle": 236,
                "indices": (386, 361, 358),
                "barycentric": VLR7_LANDMARK_BARYCENTRIC,
                "surfacePoint": (-0.137786284089, -0.200400233269, -0.338977376620),
                "normal": (-1.0, 0.0, 0.0),
                "boneCenterOffsetMeters": 0.0015,
            },
            "pinky": {
                "qualified": True,
                "triangle": 51,
                "indices": (361, 442, 413),
                "barycentric": VLR7_LANDMARK_BARYCENTRIC,
                "surfacePoint": (-0.137786284089, -0.224298954010, -0.444387813409),
                "normal": (-1.0, 0.0, 0.0),
                "boneCenterOffsetMeters": 0.0015,
            },
            "thumb": {
                "qualified": True,
                "triangle": 57,
                "indices": (335, 406, 394),
                "barycentric": VLR7_LANDMARK_BARYCENTRIC,
                "surfacePoint": (0.040662750602, -0.383816401164, -0.383598268032),
                "normal": (0.0, -0.999018749599, -0.044289253213),
                "boneCenterOffsetMeters": 0.0015,
            },
        },
    },
    "support": {
        "side": "l",
        "hand": "hand_l",
        "node": VLR7_HANDGUARD_NAME,
        "mesh": "KYX_VLR7_REVIEW_RECEIVER_HANDGUARD_MESH",
        "primitive": 2,
        "digits": {
            "index": {
                "qualified": True,
                "triangle": 293,
                "indices": (427, 429, 444),
                "barycentric": VLR7_LANDMARK_BARYCENTRIC,
                "surfacePoint": (0.165617783864, 2.194637139638, 0.181036849817),
                "normal": (0.956914901224, 0.058887882591, -0.284334466957),
                "boneCenterOffsetMeters": 0.0015,
            },
            "middle": {
                "qualified": True,
                "triangle": 292,
                "indices": (470, 426, 416),
                "barycentric": VLR7_LANDMARK_BARYCENTRIC,
                "surfacePoint": (0.159680063526, 2.338399330775, 0.167714774609),
                "normal": (0.953754526802, 0.0, -0.300586597515),
                "boneCenterOffsetMeters": 0.0015,
            },
            "ring": {
                "qualified": True,
                "triangle": 323,
                "indices": (472, 416, 475),
                "barycentric": (0.45, 0.10, 0.45),
                "surfacePoint": (0.161758265644, 2.463379573822, 0.174308863282),
                "normal": (0.953754526802, 0.0, -0.300586597515),
                "boneCenterOffsetMeters": 0.0015,
            },
            "pinky": {
                "qualified": True,
                "triangle": 324,
                "indices": (476, 472, 475),
                "barycentric": (0.18, 0.41, 0.41),
                "surfacePoint": (0.164252108186, 2.626492242813, 0.182221769691),
                "normal": (0.953754526802, 0.0, -0.300586597515),
                "boneCenterOffsetMeters": 0.0015,
            },
            "thumb": {
                "qualified": True,
                "triangle": 283,
                "indices": (380, 407, 412),
                "barycentric": VLR7_LANDMARK_BARYCENTRIC,
                "surfacePoint": (-0.165617783864, 2.332881053289, 0.186555027962),
                "normal": (-0.953754526802, 0.0, -0.300586597515),
                "boneCenterOffsetMeters": 0.0015,
            },
        },
    },
}


def validate_vlr7_digit_fixture_schema(
    fixtures: object,
) -> dict[str, object]:
    """Validate every fixture access path without touching Blender state."""
    expected_roles = {
        "dominant": {
            "side": "r",
            "hand": "hand_r",
            "node": VLR7_STOCK_NAME,
            "mesh": "KYX_VLR7_REVIEW_STOCK_GRIP_MESH",
            "primitive": 0,
        },
        "support": {
            "side": "l",
            "hand": "hand_l",
            "node": VLR7_HANDGUARD_NAME,
            "mesh": "KYX_VLR7_REVIEW_RECEIVER_HANDGUARD_MESH",
            "primitive": 2,
        },
    }
    expected_role_fields = {
        "side", "hand", "node", "mesh", "primitive", "digits"
    }
    expected_digits = {"index", "middle", "ring", "pinky", "thumb"}
    expected_digit_fields = {
        "qualified",
        "triangle",
        "indices",
        "barycentric",
        "surfacePoint",
        "normal",
        "boneCenterOffsetMeters",
    }
    if type(fixtures) is not dict:
        raise RuntimeError(
            "Rev47 fixture schema root must be one unaliased dict"
        )
    if set(fixtures) != set(expected_roles):
        raise RuntimeError(
            "Rev47 fixture schema roles changed: "
            f"expected={sorted(expected_roles)} actual={sorted(fixtures)}"
        )
    seen_mapping_ids = {id(fixtures)}
    validated_paths = []
    for role in ("dominant", "support"):
        role_fixture = fixtures[role]
        if type(role_fixture) is not dict or id(role_fixture) in seen_mapping_ids:
            raise RuntimeError(
                f"Rev47 fixture role mapping is missing or aliased: {role}"
            )
        seen_mapping_ids.add(id(role_fixture))
        if set(role_fixture) != expected_role_fields:
            raise RuntimeError(
                f"Rev47 fixture role fields changed for {role}: "
                f"expected={sorted(expected_role_fields)} "
                f"actual={sorted(role_fixture)}"
            )
        for field, expected in expected_roles[role].items():
            actual = role_fixture[field]
            if type(actual) is not type(expected) or actual != expected:
                raise RuntimeError(
                    f"Rev47 fixture role field changed: {role}.{field} "
                    f"expected={expected!r} actual={actual!r}"
                )
            validated_paths.append(f"{role}.{field}")
        digits = role_fixture["digits"]
        if type(digits) is not dict or id(digits) in seen_mapping_ids:
            raise RuntimeError(
                f"Rev47 fixture digit mapping is missing or aliased: {role}"
            )
        seen_mapping_ids.add(id(digits))
        if set(digits) != expected_digits:
            raise RuntimeError(
                f"Rev47 fixture digits changed for {role}: "
                f"expected={sorted(expected_digits)} actual={sorted(digits)}"
            )
        for finger in ("index", "middle", "ring", "pinky", "thumb"):
            fixture = digits[finger]
            if type(fixture) is not dict or id(fixture) in seen_mapping_ids:
                raise RuntimeError(
                    "Rev47 digit fixture mapping is missing or aliased: "
                    f"{role}.{finger}"
                )
            seen_mapping_ids.add(id(fixture))
            if set(fixture) != expected_digit_fields:
                raise RuntimeError(
                    f"Rev47 digit fixture fields changed for {role}.{finger}: "
                    f"expected={sorted(expected_digit_fields)} "
                    f"actual={sorted(fixture)}"
                )
            if type(fixture["qualified"]) is not bool or not fixture["qualified"]:
                raise RuntimeError(
                    f"Rev47 digit fixture is not qualified: {role}.{finger}"
                )
            if type(fixture["triangle"]) is not int:
                raise RuntimeError(
                    f"Rev47 triangle must be one integer: {role}.{finger}"
                )
            if (
                type(fixture["indices"]) is not tuple
                or len(fixture["indices"]) != 3
                or any(type(value) is not int for value in fixture["indices"])
            ):
                raise RuntimeError(
                    f"Rev47 indices must be three integers: {role}.{finger}"
                )
            for field in ("barycentric", "surfacePoint", "normal"):
                values = fixture[field]
                if (
                    type(values) is not tuple
                    or len(values) != 3
                    or any(type(value) is not float for value in values)
                    or any(not math.isfinite(value) for value in values)
                ):
                    raise RuntimeError(
                        "Rev47 fixture vector must be three finite floats: "
                        f"{role}.{finger}.{field}"
                    )
            offset = fixture["boneCenterOffsetMeters"]
            if type(offset) is not float or not math.isfinite(offset):
                raise RuntimeError(
                    "Rev47 bone-center offset must be one finite float: "
                    f"{role}.{finger}"
                )
            validated_paths.extend(
                f"{role}.digits.{finger}.{field}"
                for field in sorted(expected_digit_fields)
            )
    # This explicit telemetry path was the malformed Rev46 access. Keeping it
    # in the validated path set makes future schema drift statically visible.
    telemetry_path = "dominant.digits.index.triangle"
    if telemetry_path not in validated_paths:
        raise RuntimeError(
            f"Rev47 telemetry fixture path was not validated: {telemetry_path}"
        )
    return {
        "schema": "kyx-rev47-vlr7-digit-fixture-schema-v1",
        "roles": ["dominant", "support"],
        "digits": ["index", "middle", "ring", "pinky", "thumb"],
        "validatedAccessPaths": validated_paths,
        "validatedMappingCount": len(seen_mapping_ids),
        "poseContextMutations": 0,
    }


VLR7_FIXTURE_SCHEMA_REPORT = validate_vlr7_digit_fixture_schema(
    VLR7_DIGIT_FIXTURES
)


VLR7_REJECTED_FIXTURE_SEEDS = [{
    "role": "dominant",
    "finger": "index",
    "node": VLR7_STOCK_NAME,
    "primitive": 0,
    "triangle": 293,
    "indices": (496, 514, 501),
    "centroidSourceLocalMeters": (
        0.148181890448,
        0.057190895081,
        0.324146946271,
    ),
    "reason": (
        "fixture audit found about 89.8 mm runtime separation from the middle "
        "contact and more than 84 mm behind the trigger guard; not a credible "
        "trigger-discipline shelf"
    ),
}, {
    "role": "dominant",
    "finger": "index",
    "node": VLR7_STOCK_NAME,
    "primitive": 0,
    "triangle": 200,
    "indices": (215, 208, 205),
    "barycentric": VLR7_LANDMARK_BARYCENTRIC,
    "surfacePointSourceLocalMeters": (
        0.239723131061,
        0.458531379700,
        0.533175190290,
    ),
    "reason": (
        "exact semantic-palm review found chain length 0.105600446462631 m "
        "but MCP-to-target 0.130338164382277 m (margin -0.024737718 m), shelf angle "
        "47.7982 degrees above the 45-degree gate, and optimal distal "
        "waypoint 0.100237968 m beyond the 0.075500250 m proximal reach"
    ),
}, {
    "role": "dominant",
    "finger": "middle",
    "node": VLR7_STOCK_NAME,
    "primitive": 0,
    "triangle": 55,
    "indices": (305, 389, 358),
    "barycentric": VLR7_LANDMARK_BARYCENTRIC,
    "surfacePointSourceLocalMeters": (
        -0.137786284089,
        -0.162839849790,
        -0.220648328463,
    ),
    "reason": (
        "Rev50 consumed Idle_Loop frame zero proved both projected-pole paths "
        "intersect the exact StockGrip outside the unchanged 8 mm contact pad; "
        "the distinct Rev51 target remains on triangle 55 and changes only "
        "its barycentric point"
    ),
}, {
    "role": "support",
    "finger": "middle",
    "node": VLR7_HANDGUARD_NAME,
    "primitive": 2,
    "triangle": 291,
    "indices": (470, 428, 426),
    "reason": "11.749/8.504 mm neighboring centers overlapped 8 mm contact pads",
}, {
    "role": "support",
    "finger": "ring",
    "node": VLR7_HANDGUARD_NAME,
    "primitive": 2,
    "triangle": 292,
    "indices": (470, 426, 416),
    "reason": "old assignment overlapped; triangle is reassigned to corrected middle",
}, {
    "role": "support",
    "finger": "pinky",
    "node": VLR7_HANDGUARD_NAME,
    "primitive": 2,
    "triangle": 323,
    "indices": (472, 416, 475),
    "reason": "old assignment overlapped; weighted triangle is reassigned to corrected ring",
}]
VLR7_TRIGGER_GUARD_SOURCE_BOUNDS = {
    "minimum": (-0.043970112, 0.668198526, 0.374170035),
    "maximum": (0.043970112, 0.770952523, 0.575553775),
}
VLR7_DOMINANT_INDEX_FIXTURE_STATIC_AUDIT = {
    "triangle": 74,
    "barycentric": (0.20, 0.32, 0.48),
    "coordinateSpace": (
        "weapon-aligned evaluated semantic-hand frame; common source-to-rig "
        "rotation/translation factored out; native 0.86 runtime scale applied"
    ),
    "indexMcpMeters": (
        0.017914250267987,
        -0.048339747315035,
        0.008633032423845,
    ),
    "targetMeters": (
        0.035210505914707,
        0.029410081481866,
        0.069693585876528,
    ),
    "outward": (1.0, 0.0, 0.0),
    "phalanxLengthsMeters": (
        0.040700133889914,
        0.034800115972757,
        0.030100196599960,
    ),
    "chainLengthMeters": 0.105600446462631,
    "mcpToTargetMeters": 0.100362281387442,
    "reachMarginMeters": 0.005238165075189,
    "targetToRootUnit": (
        -0.172338207219,
        -0.774691724043,
        -0.608401409459,
    ),
    "tangentTowardRoot": (
        0.0,
        -0.786458848727,
        -0.617642679272,
    ),
    "distalOut": (
        0.039968038349,
        -0.785830435644,
        -0.617149157276,
    ),
    "waypointTwoMeters": (
        0.036413551727,
        0.005756430875,
        0.051117274911,
    ),
    "waypointTwoRootDistanceMeters": 0.071228726711,
    "proximalReachMinimumMeters": 0.005901017917,
    "proximalReachMaximumMeters": 0.075499249863,
    "proximalMinimumMarginMeters": 0.065327708794,
    "proximalMaximumMarginMeters": 0.004270523151,
    "lawOfCosinesAlongMeters": 0.038741281718,
    "lawOfCosinesHeightMeters": 0.012474533639,
    "solveIterations": 1,
    "gripAxisAlignmentDegrees": 40.2954135,
    "nearestTriggerGuardSurfaceRuntimeMeters": 0.068493,
    "distalWaypointFeasible": True,
}
VLR7_UPPER_BODY_BASELINE_BONES = (
    "clavicle_l",
    "upperarm_l",
    "lowerarm_l",
    "hand_l",
    "clavicle_r",
    "upperarm_r",
    "lowerarm_r",
    "hand_r",
)
# Blender-source coordinates reconstructed from the live authority muzzle and
# visible barrel nose. The GLB's legacy internal muzzle marker is 0.16 m short
# and remains only as a discrepancy witness.
VLR7_AUTHORITY_MUZZLE_LOCAL = Vector((0.0, 6.5625, 0.95625))
VLR7_VISUAL_MUZZLE_LOCAL = Vector((0.0, 6.583, 0.7384728625))

RIG_NAME = "KYX_REV40_UAL_RIG_66_JOINT_WITH_SOCKET"
BODY_SOURCE_NAME = "KYX_REV30_CC0_DONOR_BODY_WITH_LEFT_HAND"
HAND_SOURCE_NAME = "KYX_REV30_CC0_DONOR_RIGHT_HAND"
HEAD_SOURCE_NAME = "KYX_REV30_CC0_DONOR_HEAD2_BROAD_VISOR"

EXPECTED_ACTIONS = {
    "KYX_REV17_TP_IDLE": (1.0, 61.0),
    "KYX_REV17_TP_WALK": (1.0, 33.0),
    "KYX_REV17_TP_RUN": (1.0, 23.0),
    "KYX_REV17_TP_JUMP_START": (1.0, 33.0),
    "KYX_REV17_TP_AIRBORNE_LOOP": (1.0, 61.0),
    "KYX_REV17_TP_LAND": (1.0, 31.0),
    "KYX_REV17_TP_PRIMARY_FIRE": (1.0, 16.0),
    "KYX_REV17_TP_RELOAD": (1.0, 41.0),
    "KYX_REV17_TP_HIT_REACTION_FRONT": (1.0, 9.0),
    "KYX_REV17_TP_DEATH_FRONT": (1.0, 59.0),
    "KYX_REV40_TP_ABILITY_THROW": (1.0, 33.0),
    "KYX_REV40_TP_MELEE": (1.0, 11.0),
}

MOTION_SOURCES = {
    "KYX_REV17_TP_IDLE": ("ual1", "Idle_Loop"),
    "KYX_REV17_TP_WALK": ("ual1", "Walk_Loop"),
    "KYX_REV17_TP_RUN": ("ual1", "Jog_Fwd_Loop"),
    "KYX_REV17_TP_JUMP_START": ("ual1", "Jump_Start"),
    "KYX_REV17_TP_AIRBORNE_LOOP": ("ual1", "Jump_Loop"),
    "KYX_REV17_TP_LAND": ("ual1", "Jump_Land"),
    "KYX_REV17_TP_PRIMARY_FIRE": ("ual1", "Pistol_Shoot"),
    "KYX_REV17_TP_RELOAD": ("ual1", "Pistol_Reload"),
    "KYX_REV17_TP_HIT_REACTION_FRONT": ("ual1", "Hit_Chest"),
    "KYX_REV17_TP_DEATH_FRONT": ("ual1", "Death01"),
    "KYX_REV40_TP_ABILITY_THROW": ("ual2", "OverhandThrow"),
    "KYX_REV40_TP_MELEE": ("ual2", "Sword_Regular_A"),
}

WEAPON_READY_OVERLAY_SOURCE = ("ual1", "Pistol_Idle_Loop")
WEAPON_READY_OVERLAY_OUTPUTS = {
    "KYX_REV17_TP_IDLE",
    "KYX_REV17_TP_WALK",
    "KYX_REV17_TP_RUN",
    "KYX_REV17_TP_JUMP_START",
    "KYX_REV17_TP_AIRBORNE_LOOP",
    "KYX_REV17_TP_LAND",
}

KEVIN_RIFLE_POSE_TOKEN = "WeaponHold_AssaultRifle01"
KEVIN_RIFLE_BONE_CHAINS = (
    (
        ("clavicle_l", "B-shoulder.L"),
        ("upperarm_l", "B-upperArm.L"),
        ("lowerarm_l", "B-forearm.L"),
        ("hand_l", "B-hand.L"),
    ),
    (
        ("clavicle_r", "B-shoulder.R"),
        ("upperarm_r", "B-upperArm.R"),
        ("lowerarm_r", "B-forearm.R"),
        ("hand_r", "B-hand.R"),
    ),
)

LOD_RATIOS = {
    0: {"body": 1.0, "hand": 1.0, "head": 1.0},
    1: {"body": 0.55, "hand": 0.55, "head": 0.75},
    2: {"body": 0.28, "hand": 0.35, "head": 0.55},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rev46_observe(stage: str, **payload: object) -> None:
    """Append one durable diagnostic stage record and force it to disk."""
    if not VLR7_DIAGNOSTIC_VARIANT:
        return
    global _REV46_STAGE_SEQUENCE
    _REV46_STAGE_SEQUENCE += 1
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    record = {
        "schema": (
            "kyx-rev51-stage-observation-v1"
            if VLR7_ORIENTED_CLEARANCE_VARIANT
            else "kyx-rev47-stage-observation-v1"
        ),
        "sequence": _REV46_STAGE_SEQUENCE,
        "timeUnixNanoseconds": time.time_ns(),
        "candidate": CANDIDATE_ID,
        "stage": stage,
        **payload,
    }
    with REV46_STAGE_LOG_PATH.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(record, sort_keys=True) + "\n")
        handle.flush()
        os.fsync(handle.fileno())


def rev46_assert_output_isolation() -> None:
    """Reject any diagnostic invocation that could write a prior revision root."""
    if not VLR7_DIAGNOSTIC_VARIANT:
        return
    expected_leaves = (
        {
            "model": "v6c-character-rev51-vlr7-bounded-route-assault-v1",
            "runtime": "g6-assault-rev51-vlr7-bounded-route-v1",
            "evidence": "g6-assault-rev51-vlr7-bounded-route-source-build-v1",
        }
        if VLR7_ORIENTED_CLEARANCE_VARIANT
        else {
            "model": "v6c-character-rev47-vlr7-fixture-schema-assault-v1",
            "runtime": "g6-assault-rev47-vlr7-fixture-schema-v1",
            "evidence": "g6-assault-rev47-vlr7-fixture-schema-source-build-v1",
        }
    )
    actual_leaves = {
        "model": MODEL_DIR.name,
        "runtime": RUNTIME_DIR.name,
        "evidence": EVIDENCE_DIR.name,
    }
    if actual_leaves != expected_leaves:
        raise RuntimeError(
            "Rev51/Rev47 output isolation changed: "
            f"expected={expected_leaves} actual={actual_leaves}"
        )
    owned_paths = (
        MODEL_DIR,
        RUNTIME_DIR,
        EVIDENCE_DIR,
        MASTER_BLEND,
        REPORT_PATH,
        MANIFEST_PATH,
        NOTICE_PATH,
        REV46_STAGE_LOG_PATH,
        REV46_TRACEBACK_PATH,
        REV46_WRAPPER_TRACEBACK_PATH,
    )
    for path in owned_paths:
        try:
            path.resolve().relative_to(WORKTREE.resolve())
        except ValueError as exc:
            raise RuntimeError(
                f"Rev51/Rev47 output escaped the worktree: {path}"
            ) from exc


def rev46_write_traceback(path: Path, text: str) -> None:
    """Persist a complete traceback without relying on Blender console state."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
        if not text.endswith("\n"):
            handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    if edge0 == edge1:
        return 0.0
    t = max(0.0, min(1.0, (value - edge0) / (edge1 - edge0)))
    return t * t * (3.0 - 2.0 * t)


def band(value: float, low: float, high: float, feather: float) -> float:
    return smoothstep(low - feather, low + feather, value) * (
        1.0 - smoothstep(high - feather, high + feather, value)
    )


def triangle_count(obj: bpy.types.Object) -> int:
    return sum(max(0, len(polygon.vertices) - 2) for polygon in obj.data.polygons)


def action_contract() -> dict[str, list[float]]:
    return {
        action.name: [float(action.frame_range[0]), float(action.frame_range[1])]
        for action in sorted(bpy.data.actions, key=lambda item: item.name)
        if action.name in EXPECTED_ACTIONS
    }


def assert_action_contract(stage: str) -> None:
    expected = {
        name: [frame_range[0], frame_range[1]]
        for name, frame_range in EXPECTED_ACTIONS.items()
    }
    actual = action_contract()
    if actual != expected:
        raise RuntimeError(f"{stage}: action contract changed: {actual}")


def assign_action(
    rig: bpy.types.Object,
    action: bpy.types.Action,
    frame: int,
) -> None:
    animation_data = rig.animation_data_create()
    animation_data.use_nla = False
    animation_data.action = action
    if len(action.slots):
        compatible = next(
            (slot for slot in action.slots if slot.target_id_type == "OBJECT"),
            action.slots[0],
        )
        animation_data.action_slot = compatible
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.update()


def import_motion_library(path: Path, label: str) -> tuple[bpy.types.Object, dict]:
    if not path.is_file():
        raise RuntimeError(f"Qualified {label} motion library is missing: {path}")
    previous_objects = set(bpy.data.objects)
    previous_actions = set(bpy.data.actions)
    result = bpy.ops.import_scene.gltf(filepath=str(path))
    if "FINISHED" not in result:
        raise RuntimeError(f"Could not import {label}: {result}")
    new_objects = [obj for obj in bpy.data.objects if obj not in previous_objects]
    rigs = [obj for obj in new_objects if obj.type == "ARMATURE"]
    if len(rigs) != 1 or len(rigs[0].data.bones) != 65:
        raise RuntimeError(
            f"{label} expected one 65-bone armature, found "
            f"{[(obj.name, len(obj.data.bones)) for obj in rigs]}"
        )
    actions = {
        action.name: action
        for action in bpy.data.actions
        if action not in previous_actions
    }
    return rigs[0], actions


def append_kevin_rifle_pose_library(
    path: Path,
) -> tuple[bpy.types.Object, dict[str, bpy.types.Action]]:
    if not path.is_file():
        raise RuntimeError(f"Qualified Human Soldier source is missing: {path}")
    previous_objects = set(bpy.data.objects)
    previous_actions = set(bpy.data.actions)
    with bpy.data.libraries.load(str(path), link=False) as (source, target):
        target.objects = list(source.objects)
        target.actions = list(source.actions)
    loaded_objects = [obj for obj in bpy.data.objects if obj not in previous_objects]
    for obj in loaded_objects:
        if not obj.users_collection:
            bpy.context.scene.collection.objects.link(obj)
    required = {
        source_name
        for chain in KEVIN_RIFLE_BONE_CHAINS
        for _, source_name in chain
    } | {"B-chest"}
    rigs = [
        obj for obj in loaded_objects
        if obj.type == "ARMATURE"
        and required.issubset(set(obj.pose.bones.keys()))
    ]
    if len(rigs) != 1:
        raise RuntimeError(
            "Human Soldier source expected one compatible armature, found "
            f"{[(obj.name, len(obj.data.bones)) for obj in rigs]}"
        )
    actions = {
        action.name: action
        for action in bpy.data.actions
        if action not in previous_actions
    }
    pose_actions = [
        action for action in actions.values()
        if KEVIN_RIFLE_POSE_TOKEN.lower() in action.name.lower()
    ]
    if len(pose_actions) != 1:
        raise RuntimeError(
            "Human Soldier source expected one AssaultRifle hold pose, found "
            f"{[action.name for action in pose_actions]}"
        )
    return rigs[0], actions


def pose_bones_by_depth(rig: bpy.types.Object) -> list[bpy.types.PoseBone]:
    def depth(bone: bpy.types.PoseBone) -> int:
        value = 0
        parent = bone.parent
        while parent is not None:
            value += 1
            parent = parent.parent
        return value

    return sorted(rig.pose.bones, key=lambda bone: (depth(bone), bone.name))


def match_source_pose(
    target: bpy.types.Object,
    source: bpy.types.Object,
    ignored: set[str] | None = None,
) -> None:
    ignored = ignored or set()
    identity = Matrix.Identity(4)
    for bone in target.pose.bones:
        bone.matrix_basis = identity
    bpy.context.view_layer.update()
    ordered = [
        bone for bone in pose_bones_by_depth(target)
        if bone.name not in ignored
    ]
    current_depth = -1
    for bone in ordered:
        depth = 0
        parent = bone.parent
        while parent is not None:
            depth += 1
            parent = parent.parent
        if depth != current_depth:
            bpy.context.view_layer.update()
            current_depth = depth
        source_bone = source.pose.bones.get(bone.name)
        if source_bone is None:
            raise RuntimeError(f"Motion source bone missing: {bone.name}")
        bone.matrix = source_bone.matrix.copy()
    bpy.context.view_layer.update()


def weapon_ready_overlay_bone_names(rig: bpy.types.Object) -> set[str]:
    roots = {"clavicle_l", "clavicle_r"}
    names = set()
    for bone in rig.pose.bones:
        current = bone
        while current is not None:
            if current.name in roots:
                names.add(bone.name)
                break
            current = current.parent
    if not roots.issubset(names):
        raise RuntimeError(
            f"Weapon-ready overlay roots missing: {sorted(roots - names)}"
        )
    return names


def weapon_ready_overlay_anchor_name(rig: bpy.types.Object) -> str:
    roots = [rig.pose.bones.get(name) for name in ("clavicle_l", "clavicle_r")]
    if any(root is None or root.parent is None for root in roots):
        raise RuntimeError("Weapon-ready clavicles require a shared parent")
    parent_names = {root.parent.name for root in roots}
    if len(parent_names) != 1:
        raise RuntimeError(
            f"Weapon-ready clavicles do not share one parent: {sorted(parent_names)}"
        )
    return next(iter(parent_names))


def capture_armature_space_pose(
    rig: bpy.types.Object,
    bone_names: set[str],
) -> dict[str, Matrix]:
    return {
        bone.name: bone.matrix.copy()
        for bone in pose_bones_by_depth(rig)
        if bone.name in bone_names
    }


def apply_anchor_relative_pose_overlay(
    target: bpy.types.Object,
    source_anchor_matrix: Matrix,
    armature_space_pose: dict[str, Matrix],
    anchor_name: str,
) -> None:
    target_anchor = target.pose.bones.get(anchor_name)
    if target_anchor is None:
        raise RuntimeError(f"Weapon-ready target anchor missing: {anchor_name}")
    # Source and target share the exact Quaternius skeleton, but the target's
    # neutral pose was applied as its rest pose. Copying source *local* bone
    # matrices therefore also copied incompatible rest-relative translations
    # and scales, visibly stretching the weighted arms. Align the authored
    # armature-space pose to the target's current shared clavicle parent instead.
    anchor_alignment = target_anchor.matrix @ source_anchor_matrix.inverted_safe()
    current_depth = -1
    for bone in pose_bones_by_depth(target):
        source_matrix = armature_space_pose.get(bone.name)
        if source_matrix is None:
            continue
        depth = 0
        parent = bone.parent
        while parent is not None:
            depth += 1
            parent = parent.parent
        if depth != current_depth:
            bpy.context.view_layer.update()
            current_depth = depth
        bone.matrix = anchor_alignment @ source_matrix
    bpy.context.view_layer.update()


def capture_kevin_rifle_directions(
    source: bpy.types.Object,
) -> dict[str, Vector]:
    anchor = source.pose.bones.get("B-chest")
    if anchor is None:
        raise RuntimeError("Human Soldier B-chest anchor is missing")
    source_to_anchor = anchor.matrix.to_3x3().inverted_safe()
    directions: dict[str, Vector] = {}
    for chain in KEVIN_RIFLE_BONE_CHAINS:
        for target_name, source_name in chain:
            bone = source.pose.bones.get(source_name)
            if bone is None or bone.vector.length <= 1e-6:
                raise RuntimeError(f"Human Soldier pose bone is invalid: {source_name}")
            directions[target_name] = (source_to_anchor @ bone.vector).normalized()
    return directions


def rotate_pose_bone_to_direction(
    rig: bpy.types.Object,
    bone_name: str,
    desired_direction: Vector,
) -> None:
    bone = rig.pose.bones.get(bone_name)
    if bone is None or bone.vector.length <= 1e-6:
        raise RuntimeError(f"Rev41 target pose bone is invalid: {bone_name}")
    current = bone.vector.normalized()
    desired = desired_direction.normalized()
    delta = current.rotation_difference(desired)
    pivot = bone.head.copy()
    bone.matrix = (
        Matrix.Translation(pivot)
        @ delta.to_matrix().to_4x4()
        @ Matrix.Translation(-pivot)
        @ bone.matrix
    )
    bpy.context.view_layer.update()


def apply_kevin_rifle_pose_overlay(
    target: bpy.types.Object,
    anchor_local_directions: dict[str, Vector],
) -> None:
    anchor = target.pose.bones.get("chest") or target.pose.bones.get("spine_03")
    if anchor is None:
        raise RuntimeError("Rev41 target chest anchor is missing")
    anchor_rotation = anchor.matrix.to_3x3().normalized()
    for chain in KEVIN_RIFLE_BONE_CHAINS:
        for target_name, _ in chain:
            direction = anchor_local_directions.get(target_name)
            if direction is None:
                raise RuntimeError(f"Rev41 rifle direction is missing: {target_name}")
            rotate_pose_bone_to_direction(
                target,
                target_name,
                anchor_rotation @ direction,
            )


def append_vlr7_source_review_weapon() -> dict[str, object]:
    if not VLR7_REVIEW_BLEND.is_file():
        raise RuntimeError(f"VLR-7 review blend is missing: {VLR7_REVIEW_BLEND}")
    actual_sha256 = sha256(VLR7_REVIEW_BLEND)
    if actual_sha256 != VLR7_REVIEW_BLEND_SHA256:
        raise RuntimeError(
            "VLR-7 review blend hash changed: "
            f"expected={VLR7_REVIEW_BLEND_SHA256} actual={actual_sha256}"
        )
    if not VLR7_REVIEW_GLB.is_file():
        raise RuntimeError(f"VLR-7 review GLB is missing: {VLR7_REVIEW_GLB}")
    actual_glb_sha256 = sha256(VLR7_REVIEW_GLB)
    if actual_glb_sha256 != VLR7_REVIEW_GLB_SHA256:
        raise RuntimeError(
            "VLR-7 review GLB hash changed: "
            f"expected={VLR7_REVIEW_GLB_SHA256} actual={actual_glb_sha256}"
        )

    with bpy.data.libraries.load(str(VLR7_REVIEW_BLEND), link=False) as (
        data_from,
        data_to,
    ):
        names = sorted(
            name for name in data_from.objects if name.startswith("KYX_VLR7_")
        )
        data_to.objects = names
    objects = [obj for obj in data_to.objects if obj is not None]
    if len(objects) != len(names):
        raise RuntimeError(
            "VLR-7 source review append lost objects: "
            f"requested={len(names)} loaded={len(objects)}"
        )
    collection = bpy.data.collections.new(
        "KYX_REV44_VLR7_SOURCE_REVIEW"
        if VLR7_LANDMARK_GRIP_VARIANT
        else "KYX_REV42_VLR7_SOURCE_REVIEW"
    )
    bpy.context.scene.collection.children.link(collection)
    for obj in objects:
        if not obj.users_collection:
            collection.objects.link(obj)
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        obj["kyx_source_review_only"] = True
        obj["kyx_release_eligible"] = False

    by_name = {obj.name: obj for obj in objects}
    required = {
        VLR7_ROOT_NAME,
        VLR7_STOCK_NAME,
        VLR7_DOMINANT_MARKER,
        VLR7_SUPPORT_MARKER,
        VLR7_MUZZLE_MARKER,
    }
    if VLR7_LANDMARK_GRIP_VARIANT:
        required.update({VLR7_HANDGUARD_NAME, VLR7_TRIGGER_GUARD_NAME})
    missing = sorted(required - set(by_name))
    if missing:
        raise RuntimeError(f"VLR-7 source review nodes are missing: {missing}")
    root = by_name[VLR7_ROOT_NAME]
    stock = by_name[VLR7_STOCK_NAME]
    dominant = by_name[VLR7_DOMINANT_MARKER]
    support = by_name[VLR7_SUPPORT_MARKER]
    muzzle = by_name[VLR7_MUZZLE_MARKER]
    if any(obj.parent != root for obj in (stock, dominant, support, muzzle)):
        raise RuntimeError("VLR-7 review contact nodes must be direct root children")

    source_forward = (
        VLR7_AUTHORITY_MUZZLE_LOCAL - dominant.location
    ).normalized()
    stock_points = [stock.matrix_local @ vertex.co for vertex in stock.data.vertices]
    rear_projection = min(point.y for point in stock_points)
    rear_points = [
        point for point in stock_points
        if point.y <= rear_projection + 1e-4
    ]
    if len(rear_points) < 3:
        raise RuntimeError(
            f"VLR-7 stock reference is underconstrained: points={len(rear_points)}"
        )
    stock_reference = sum(rear_points, Vector((0.0, 0.0, 0.0))) / len(
        rear_points
    )
    native_scale = float(root.scale.x)
    if not 0.15 <= native_scale <= 0.17:
        raise RuntimeError(f"VLR-7 native scale changed: {native_scale}")
    root["kyx_candidate"] = CANDIDATE_ID
    root["kyx_source_blend_sha256"] = actual_sha256
    root["kyx_source_glb_sha256"] = actual_glb_sha256
    root["kyx_source_license"] = "CC0-1.0"
    root["kyx_source_review_weapon"] = True
    bpy.context.view_layer.update()
    return {
        "root": root,
        "objects": objects,
        "byName": by_name,
        "dominant": dominant,
        "support": support,
        "muzzle": muzzle,
        "authorityMuzzleReference": VLR7_AUTHORITY_MUZZLE_LOCAL.copy(),
        "visualMuzzleWitness": VLR7_VISUAL_MUZZLE_LOCAL.copy(),
        "stockReference": stock_reference,
        "sourceForward": source_forward,
        "nativeScale": native_scale,
        "sourceGlb": VLR7_REVIEW_GLB,
        "sourceGlbSha256": actual_glb_sha256,
    }


def weapon_basis(forward: Vector, up_hint: Vector) -> Matrix:
    forward = forward.normalized()
    right = forward.cross(up_hint)
    if right.length <= 1e-6:
        raise RuntimeError("VLR-7 weapon basis is degenerate")
    right.normalize()
    up = right.cross(forward).normalized()
    return Matrix((right, forward, up)).transposed()


def position_vlr7_source_review_weapon(
    target: bpy.types.Object,
    weapon: dict[str, object],
) -> dict[str, Vector | float]:
    shoulder = target.pose.bones.get("upperarm_r")
    if shoulder is None:
        raise RuntimeError("Rev42 right shoulder bone is missing")
    chest = (
        target.pose.bones.get("chest")
        or target.pose.bones.get("spine_03")
        or target.pose.bones.get("spine_02")
    )
    if chest is None:
        raise RuntimeError("Rev42 chest anchor bone is missing")
    chest_pose_rotation = chest.matrix.to_3x3().normalized()
    chest_rest_rotation = chest.bone.matrix_local.to_3x3().normalized()
    chest_delta = chest_pose_rotation @ chest_rest_rotation.inverted_safe()
    source_forward = weapon["sourceForward"]
    source_basis = weapon_basis(source_forward, Vector((0.0, 0.0, 1.0)))
    desired_forward = (
        chest_delta @ Vector((0.25, -1.0, 0.025))
    ).normalized()
    desired_up = (chest_delta @ Vector((0.0, 0.0, 1.0))).normalized()
    desired_basis = weapon_basis(desired_forward, desired_up)
    rotation = desired_basis @ source_basis.inverted_safe()
    scale = float(weapon["nativeScale"]) * VLR7_RUNTIME_UNIFORM_SCALE

    # Bring the stock into the inner shoulder pocket. This keeps the dominant
    # grip near the torso instead of asking the support arm to cross more than
    # a metre, as the rejected browser solve did.
    stock_target = shoulder.head + chest_delta @ Vector(
        (0.16, -0.01, -0.055)
    )
    stock_reference = weapon["stockReference"]
    translation = stock_target - rotation @ (stock_reference * scale)
    local_matrix = (
        Matrix.Translation(translation)
        @ rotation.to_4x4()
        @ Matrix.Diagonal((scale, scale, scale, 1.0))
    )
    root = weapon["root"]
    root.matrix_world = target.matrix_world @ local_matrix
    bpy.context.view_layer.update()

    target_inverse = target.matrix_world.inverted_safe()
    dominant = target_inverse @ weapon["dominant"].matrix_world.translation
    dominant_surface = local_matrix @ (
        weapon["dominant"].location
        + VLR7_DOMINANT_SURFACE_OFFSET_SOURCE_LOCAL
    )
    full_support = target_inverse @ weapon["support"].matrix_world.translation
    support = local_matrix @ VLR7_SUPPORT_CONTACT_SOURCE_LOCAL
    internal_muzzle = target_inverse @ weapon["muzzle"].matrix_world.translation
    muzzle = local_matrix @ weapon["authorityMuzzleReference"]
    visual_muzzle = local_matrix @ weapon["visualMuzzleWitness"]
    stock = local_matrix @ stock_reference
    return {
        "dominant": dominant,
        "dominantMarker": dominant,
        "dominantSurface": dominant_surface,
        "support": support,
        "fullSupport": full_support,
        "muzzle": muzzle,
        "internalMuzzle": internal_muzzle,
        "visualMuzzle": visual_muzzle,
        "stock": stock,
        "stockTarget": stock_target,
        "desiredForward": desired_forward,
        "weaponRotation": rotation,
        "sourceToRigMatrix": local_matrix,
        "dominantSurfaceNormal": (
            rotation @ VLR7_DOMINANT_SURFACE_NORMAL_SOURCE_LOCAL
        ).normalized(),
        "dominantFingerDirection": (
            rotation @ VLR7_DOMINANT_FINGER_SOURCE_LOCAL
        ).normalized(),
        "supportSurfaceNormal": (
            rotation @ VLR7_SUPPORT_SURFACE_NORMAL_SOURCE_LOCAL
        ).normalized(),
        "supportFingerDirection": (
            rotation @ VLR7_SUPPORT_FINGER_SOURCE_LOCAL
        ).normalized(),
        "scale": scale,
    }


def restore_vlr7_upper_body_baseline(
    rig: bpy.types.Object,
) -> dict[str, float | int]:
    """Keep locomotion below the chest while removing arbitrary arm swing."""
    identity = Matrix.Identity(4)
    bones = {}
    for bone_name in VLR7_UPPER_BODY_BASELINE_BONES:
        bone = rig.pose.bones.get(bone_name)
        if bone is None:
            continue
        bones[bone_name] = bone
    missing = sorted(set(VLR7_UPPER_BODY_BASELINE_BONES) - set(bones))
    if missing:
        raise RuntimeError(
            f"Rev42 upper-body baseline bones are missing: {missing}"
        )
    canonical_lengths = {
        name: float(bone.bone.length) for name, bone in bones.items()
    }
    maximum_pre_reset_length_delta = max(
        abs(float(bone.length) - canonical_lengths[name])
        for name, bone in bones.items()
    )
    for bone in bones.values():
        bone.matrix_basis = identity
    bpy.context.view_layer.update()
    maximum_basis_error = max(
        abs(bone.matrix_basis[row][column] - identity[row][column])
        for bone in bones.values()
        for row in range(4)
        for column in range(4)
    )
    maximum_length_delta = max(
        abs(float(bone.length) - canonical_lengths[name])
        for name, bone in bones.items()
    )
    if maximum_basis_error > 1e-6 or maximum_length_delta > 1e-6:
        raise RuntimeError(
            "Rev42 upper-body baseline reset changed its invariant: "
            f"basis={maximum_basis_error:.9f} "
            f"length={maximum_length_delta:.9f}"
        )
    return {
        "bones": len(bones),
        "maximumBasisError": maximum_basis_error,
        "maximumPreResetLengthDeltaMeters": maximum_pre_reset_length_delta,
        "maximumLengthDeltaMeters": maximum_length_delta,
    }


def solve_two_bone_contact(
    rig: bpy.types.Object,
    upper_name: str,
    lower_name: str,
    hand_name: str,
    target: Vector,
    pole_hint: Vector,
) -> dict[str, float]:
    upper = rig.pose.bones.get(upper_name)
    lower = rig.pose.bones.get(lower_name)
    hand = rig.pose.bones.get(hand_name)
    if any(bone is None for bone in (upper, lower, hand)):
        raise RuntimeError(
            f"Rev42 arm chain is incomplete: {upper_name}/{lower_name}/{hand_name}"
        )
    shoulder = upper.head.copy()
    upper_length = float(upper.length)
    lower_length = float(lower.length)
    to_target = target - shoulder
    distance = to_target.length
    minimum = abs(upper_length - lower_length) + 0.005
    maximum = upper_length + lower_length - 0.020
    if not minimum < distance < maximum:
        raise RuntimeError(
            "Rev42 hand contact is outside arm reach: "
            f"chain={upper_name} distance={distance:.6f} "
            f"allowed=({minimum:.6f},{maximum:.6f})"
        )

    axis = to_target.normalized()
    pole = pole_hint - shoulder
    pole -= axis * pole.dot(axis)
    if pole.length <= 1e-6:
        fallback = Vector(
            (-1.0, 0.0, -0.45)
            if upper_name.endswith("_r")
            else (1.0, 0.0, -0.45)
        )
        pole = fallback - axis * fallback.dot(axis)
    if pole.length <= 1e-6:
        raise RuntimeError(f"Rev42 elbow pole fallback is degenerate: {upper_name}")
    pole.normalize()
    along = (
        upper_length * upper_length
        - lower_length * lower_length
        + distance * distance
    ) / (2.0 * distance)
    height = math.sqrt(max(0.0, upper_length * upper_length - along * along))
    elbow = shoulder + axis * along + pole * height
    rotate_pose_bone_to_direction(rig, upper_name, elbow - shoulder)
    lower = rig.pose.bones[lower_name]
    rotate_pose_bone_to_direction(rig, lower_name, target - lower.head)
    bpy.context.view_layer.update()
    error = (rig.pose.bones[hand_name].head - target).length
    if error > 0.002:
        raise RuntimeError(
            f"Rev42 hand contact solve missed: chain={upper_name} error={error:.6f}"
        )
    elbow_angle = math.degrees(math.acos(max(-1.0, min(
        1.0,
        (
            upper_length * upper_length
            + lower_length * lower_length
            - distance * distance
        ) / (2.0 * upper_length * lower_length),
    ))))
    return {
        "errorMeters": error,
        "targetDistanceMeters": distance,
        "armReachMeters": upper_length + lower_length,
        "reachMarginMeters": upper_length + lower_length - distance,
        "elbowAngleDegrees": elbow_angle,
    }


def advance_clavicle_for_contact(
    rig: bpy.types.Object,
    clavicle_name: str,
    upper_name: str,
    lower_name: str,
    target: Vector,
    *,
    maximum_degrees: float = 24.0,
    required_margin: float = 0.022,
) -> dict[str, float]:
    clavicle = rig.pose.bones.get(clavicle_name)
    upper = rig.pose.bones.get(upper_name)
    lower = rig.pose.bones.get(lower_name)
    if any(bone is None for bone in (clavicle, upper, lower)):
        raise RuntimeError(
            f"Rev42 clavicle reach chain is incomplete: {clavicle_name}"
        )
    usable_reach = float(upper.length + lower.length - required_margin)
    before = (target - upper.head).length
    if before <= usable_reach:
        return {
            "beforeDistanceMeters": before,
            "afterDistanceMeters": before,
            "rotationDegrees": 0.0,
            "usableReachMeters": usable_reach,
        }

    current = clavicle.vector.normalized()
    desired = (target - clavicle.head).normalized()
    angle = current.angle(desired)
    if angle <= 1e-6:
        raise RuntimeError(
            f"Rev42 clavicle cannot improve reach: {clavicle_name}"
        )
    allowed = math.radians(maximum_degrees)
    bounded_angle = min(angle, allowed)
    rotation_axis = current.cross(desired)
    if rotation_axis.length <= 1e-6:
        raise RuntimeError(
            f"Rev42 clavicle rotation axis is degenerate: {clavicle_name}"
        )
    rotation_axis.normalize()
    # Rotate along the actual shortest arc. Linear vector interpolation made a
    # declared 24-degree bound produce only 13.901 degrees in the failed run,
    # leaving the anatomically available shoulder roll unused.
    bounded_direction = (
        Matrix.Rotation(bounded_angle, 3, rotation_axis) @ current
    ).normalized()
    rotate_pose_bone_to_direction(rig, clavicle_name, bounded_direction)
    bpy.context.view_layer.update()
    after = (target - rig.pose.bones[upper_name].head).length
    actual_rotation = math.degrees(current.angle(bounded_direction))
    if after > usable_reach:
        raise RuntimeError(
            "Rev42 clavicle roll cannot make support contact reachable: "
            f"chain={clavicle_name} before={before:.6f} after={after:.6f} "
            f"usable={usable_reach:.6f} rotation={actual_rotation:.3f}"
        )
    return {
        "beforeDistanceMeters": before,
        "afterDistanceMeters": after,
        "rotationDegrees": actual_rotation,
        "usableReachMeters": usable_reach,
    }


def vector_values(value: Vector) -> list[float]:
    return [float(component) for component in value]


def verified_palm_anchor_local(
    rig: bpy.types.Object,
    hand_name: str,
    side: str,
) -> tuple[Vector, dict[str, object]]:
    """Return the exact half-way wrist-to-MCP palm contact anchor."""
    hand = rig.data.bones.get(hand_name)
    if hand is None:
        raise RuntimeError(f"Rev43 palm-anchor hand is missing: {hand_name}")
    mcp_names = [
        f"{finger}_01_{side}"
        for finger in ("index", "middle", "ring", "pinky")
    ]
    mcp_bones = [rig.data.bones.get(name) for name in mcp_names]
    if any(bone is None for bone in mcp_bones):
        missing = [
            name for name, bone in zip(mcp_names, mcp_bones)
            if bone is None
        ]
        raise RuntimeError(f"Rev43 MCP roots are missing: {missing}")
    hand_inverse = hand.matrix_local.inverted_safe()
    mcp_local = [hand_inverse @ bone.head_local for bone in mcp_bones]
    centroid = sum(mcp_local, Vector((0.0, 0.0, 0.0))) / len(mcp_local)
    derived = centroid * VLR7_PALM_CENTER_FRACTION
    expected = VLR7_PALM_ANCHOR_LOCAL[hand_name]
    derivation_error = (derived - expected).length
    if derivation_error > 1e-6:
        raise RuntimeError(
            "Rev43 palm-anchor rig invariant changed: "
            f"hand={hand_name} error={derivation_error:.9f}"
        )
    return expected.copy(), {
        "method": "50% wrist-to-mean-index-middle-ring-pinky MCP roots",
        "mcpBones": mcp_names,
        "mcpCentroidLocalMeters": vector_values(centroid),
        "anchorLocalMeters": vector_values(expected),
        "derivationErrorMeters": derivation_error,
    }


def hand_contact_frame(
    palm_normal: Vector,
    finger_direction: Vector,
) -> Matrix:
    """Map hand-local -X to palm and +Y to the weapon-derived finger axis."""
    y_axis = finger_direction.normalized()
    x_axis = -palm_normal.normalized()
    x_axis -= y_axis * x_axis.dot(y_axis)
    if x_axis.length <= 1e-6:
        raise RuntimeError("Rev43 hand-contact frame is degenerate")
    x_axis.normalize()
    z_axis = x_axis.cross(y_axis)
    if z_axis.length <= 1e-6:
        raise RuntimeError("Rev43 hand-contact frame has no binormal")
    z_axis.normalize()
    x_axis = y_axis.cross(z_axis).normalized()
    return Matrix((x_axis, y_axis, z_axis)).transposed()


def wrist_orientation_delta(
    current_basis: Matrix,
    desired_basis: Matrix,
) -> tuple[float, float]:
    current_x = current_basis.col[0].normalized()
    current_y = current_basis.col[1].normalized()
    desired_x = desired_basis.col[0].normalized()
    desired_y = desired_basis.col[1].normalized()
    swing_degrees = math.degrees(current_y.angle(desired_y))
    swing_rotation = current_y.rotation_difference(desired_y)
    swung_x = swing_rotation @ current_x
    swung_x -= desired_y * swung_x.dot(desired_y)
    desired_x -= desired_y * desired_x.dot(desired_y)
    if swung_x.length <= 1e-6 or desired_x.length <= 1e-6:
        raise RuntimeError("Rev43 wrist twist decomposition is degenerate")
    swung_x.normalize()
    desired_x.normalize()
    twist_degrees = abs(math.degrees(math.atan2(
        desired_y.dot(swung_x.cross(desired_x)),
        max(-1.0, min(1.0, swung_x.dot(desired_x))),
    )))
    return swing_degrees, twist_degrees


def pose_basis_snapshot(
    rig: bpy.types.Object,
    bone_names: tuple[str, ...],
) -> dict[str, Matrix]:
    """Capture only the isolated chain state used by a bounded Rev45 probe."""
    return {
        name: rig.pose.bones[name].matrix_basis.copy()
        for name in bone_names
    }


def restore_pose_basis_snapshot(
    rig: bpy.types.Object,
    snapshot: dict[str, Matrix],
) -> None:
    for name, basis in snapshot.items():
        rig.pose.bones[name].matrix_basis = basis.copy()
    bpy.context.view_layer.update()


def matrix3_values(matrix: Matrix) -> list[list[float]]:
    return [
        [float(matrix[row][column]) for column in range(3)]
        for row in range(3)
    ]


def solve_dominant_rev45_exact_normal_wrist(
    rig: bpy.types.Object,
    surface_contact: Vector,
    palm_anchor_local: Vector,
    requested_basis: Matrix,
    requested_palm_normal: Vector,
    pole_hint: Vector,
) -> tuple[dict[str, float], Matrix, Vector, dict[str, object]]:
    """Find the closest strict in-plane hand basis inside unchanged gates.

    Only rotation about the exact requested weapon-facing palm normal is
    permitted.  Each probe restores the same arm state, recomputes the wrist
    target from the unchanged surface contact, and fully re-solves the arm.
    This is not a generic clamp and cannot change the palm normal or contact.
    """
    chain_names = ("upperarm_r", "lowerarm_r", "hand_r")
    snapshot = pose_basis_snapshot(rig, chain_names)
    requested = requested_basis.normalized()
    palm_normal = requested_palm_normal.normalized()
    if palm_normal.length <= 1e-6:
        raise RuntimeError("Rev45 requested palm normal is degenerate")

    def evaluate(angle_degrees: float) -> dict[str, object]:
        rev46_observe(
            "exact_normal_correction_probe_entry",
            angleDegrees=float(angle_degrees),
        )
        restore_pose_basis_snapshot(rig, snapshot)
        rotation = Matrix.Rotation(
            math.radians(angle_degrees),
            3,
            palm_normal,
        )
        applied = (rotation @ requested).normalized()
        applied_normal = (rotation @ palm_normal).normalized()
        normal_error = math.degrees(palm_normal.angle(applied_normal))
        if normal_error > VLR7_REV45_PALM_NORMAL_PRESERVATION_DEGREES:
            raise RuntimeError(
                "Rev45 in-plane correction changed the requested palm normal: "
                f"error={normal_error:.9f}"
            )
        wrist_target = surface_contact - applied @ palm_anchor_local
        arm_report = solve_two_bone_contact(
            rig,
            "upperarm_r",
            "lowerarm_r",
            "hand_r",
            wrist_target,
            pole_hint,
        )
        current = rig.pose.bones["hand_r"].matrix.to_3x3().normalized()
        swing, twist = wrist_orientation_delta(current, applied)
        result = {
            "angleDegrees": float(angle_degrees),
            "appliedBasis": applied,
            "appliedPalmNormal": applied_normal,
            "palmNormalErrorDegrees": normal_error,
            "wristTarget": wrist_target,
            "armReport": arm_report,
            "swingDegrees": swing,
            "twistDegrees": twist,
        }
        rev46_observe(
            "exact_normal_correction_probe_result",
            angleDegrees=float(angle_degrees),
            palmNormalErrorDegrees=float(normal_error),
            swingDegrees=float(swing),
            twistDegrees=float(twist),
            wristTargetMeters=vector_values(wrist_target),
            reachMarginMeters=float(arm_report["reachMarginMeters"]),
        )
        return result

    def feasible(result: dict[str, object]) -> bool:
        return bool(
            float(result["swingDegrees"])
            <= VLR7_REV45_WRIST_SWING_SOLVE_TARGET_DEGREES + 1e-4
            and float(result["twistDegrees"])
            <= VLR7_MAX_WRIST_TWIST_DEGREES + 1e-4
            and abs(float(result["angleDegrees"]))
            <= VLR7_REV45_MAX_IN_PLANE_CORRECTION_DEGREES + 1e-8
        )

    requested_probe = evaluate(0.0)
    selected = requested_probe if feasible(requested_probe) else None
    if selected is None:
        step = VLR7_REV45_IN_PLANE_SEARCH_STEP_DEGREES
        steps = int(round(
            VLR7_REV45_MAX_IN_PLANE_CORRECTION_DEGREES / step
        ))
        bracketed: list[dict[str, object]] = []
        bracket_magnitude = None
        for index in range(1, steps + 1):
            magnitude = index * step
            pair = [evaluate(magnitude), evaluate(-magnitude)]
            bracketed = [result for result in pair if feasible(result)]
            if bracketed:
                bracket_magnitude = magnitude
                break
        if bracket_magnitude is None:
            restore_pose_basis_snapshot(rig, snapshot)
            raise RuntimeError(
                "Rev45 exact-normal wrist solve could not converge without "
                "exceeding its 3-degree authored deviation cap: "
                f"requestedSwing={requested_probe['swingDegrees']:.6f} "
                f"requestedTwist={requested_probe['twistDegrees']:.6f}"
            )
        refined = []
        for coarse in bracketed:
            sign = 1.0 if float(coarse["angleDegrees"]) > 0.0 else -1.0
            low = max(0.0, bracket_magnitude - step)
            high = bracket_magnitude
            best = coarse
            for _iteration in range(
                VLR7_REV45_IN_PLANE_REFINEMENT_ITERATIONS
            ):
                middle = (low + high) * 0.5
                probe = evaluate(sign * middle)
                if feasible(probe):
                    high = middle
                    best = probe
                else:
                    low = middle
            refined.append(best)
        selected = min(
            refined,
            key=lambda result: (
                abs(float(result["angleDegrees"])),
                float(result["swingDegrees"]),
            ),
        )

    # Leave the arm in exactly the selected solve state, independent of the
    # last search probe, and record requested/applied truth separately.
    selected = evaluate(float(selected["angleDegrees"]))
    if not feasible(selected):
        raise RuntimeError("Rev45 selected exact-normal wrist solve regressed")
    rev46_observe(
        "exact_normal_correction_selected",
        requestedSwingDegrees=float(requested_probe["swingDegrees"]),
        requestedTwistDegrees=float(requested_probe["twistDegrees"]),
        signedInPlaneCorrectionDegrees=float(selected["angleDegrees"]),
        appliedSwingDegrees=float(selected["swingDegrees"]),
        appliedTwistDegrees=float(selected["twistDegrees"]),
        palmNormalErrorDegrees=float(selected["palmNormalErrorDegrees"]),
    )
    applied_basis = selected["appliedBasis"]
    wrist_target = selected["wristTarget"]
    return (
        selected["armReport"],
        applied_basis,
        wrist_target,
        {
            "method": (
                "smallest signed in-plane rotation about exact requested palm "
                "normal; bounded bracket plus binary refinement"
            ),
            "requestedBasisRigLocal": matrix3_values(requested),
            "appliedBasisRigLocal": matrix3_values(applied_basis),
            "requestedPalmNormalRigLocal": vector_values(palm_normal),
            "appliedPalmNormalRigLocal": vector_values(
                selected["appliedPalmNormal"]
            ),
            "palmNormalErrorDegrees": selected["palmNormalErrorDegrees"],
            "requestedSwingDegrees": requested_probe["swingDegrees"],
            "requestedTwistDegrees": requested_probe["twistDegrees"],
            "appliedSwingDegrees": selected["swingDegrees"],
            "appliedTwistDegrees": selected["twistDegrees"],
            "signedInPlaneCorrectionDegrees": selected["angleDegrees"],
            "absoluteInPlaneCorrectionDegrees": abs(
                float(selected["angleDegrees"])
            ),
            "solveTargetDegrees": (
                VLR7_REV45_WRIST_SWING_SOLVE_TARGET_DEGREES
            ),
            "unchangedSwingGateDegrees": VLR7_MAX_WRIST_SWING_DEGREES,
            "unchangedTwistGateDegrees": VLR7_MAX_WRIST_TWIST_DEGREES,
            "maximumAuthoredDeviationDegrees": (
                VLR7_REV45_MAX_IN_PLANE_CORRECTION_DEGREES
            ),
            "refinementIterations": (
                VLR7_REV45_IN_PLANE_REFINEMENT_ITERATIONS
            ),
            "elbowPlaneFallbackUsed": False,
        },
    )


def validate_rev45_correction_continuity(
    samples: list[dict[str, object]],
) -> dict[str, object]:
    """Fail closed on frame-to-frame correction pops and report all extrema."""
    fits = [sample["dominant"]["semanticFrameFit"] for sample in samples]
    if not fits or any(fit is None for fit in fits):
        raise RuntimeError("Rev45 correction continuity has no complete samples")
    signed = [float(fit["signedInPlaneCorrectionDegrees"]) for fit in fits]
    adjacent = [
        abs(signed[index] - signed[index - 1])
        for index in range(1, len(signed))
    ]
    maximum_adjacent = max(adjacent, default=0.0)
    sign_flips = sum(
        1
        for before, after in zip(signed, signed[1:])
        if before * after < 0.0 and min(abs(before), abs(after)) > 0.05
    )
    if maximum_adjacent > VLR7_REV45_MAX_ADJACENT_CORRECTION_DEGREES:
        raise RuntimeError(
            "Rev45 exact-normal correction is temporally discontinuous: "
            f"maximumAdjacent={maximum_adjacent:.6f} "
            f"gate={VLR7_REV45_MAX_ADJACENT_CORRECTION_DEGREES:.6f}"
        )
    if sign_flips:
        raise RuntimeError(
            "Rev45 exact-normal correction flips direction between frames: "
            f"count={sign_flips}"
        )
    return {
        "minimumSignedCorrectionDegrees": min(signed),
        "maximumSignedCorrectionDegrees": max(signed),
        "maximumAbsoluteCorrectionDegrees": max(abs(value) for value in signed),
        "maximumAdjacentCorrectionDegrees": maximum_adjacent,
        "maximumAdjacentCorrectionGateDegrees": (
            VLR7_REV45_MAX_ADJACENT_CORRECTION_DEGREES
        ),
        "signFlipCountOutsideDeadband": sign_flips,
        "maximumRequestedSwingDegrees": max(
            float(fit["requestedSwingDegrees"]) for fit in fits
        ),
        "maximumAppliedSwingDegrees": max(
            float(fit["appliedSwingDegrees"]) for fit in fits
        ),
        "maximumAppliedTwistDegrees": max(
            float(fit["appliedTwistDegrees"]) for fit in fits
        ),
        "maximumPalmNormalErrorDegrees": max(
            float(fit["palmNormalErrorDegrees"]) for fit in fits
        ),
        "allFramesWithinUnchangedWristGates": True,
        "allFramesPreserveExactRequestedPalmNormal": True,
    }


def orient_hand_to_contact_frame(
    rig: bpy.types.Object,
    hand_name: str,
    desired_basis: Matrix,
) -> dict[str, float]:
    hand = rig.pose.bones.get(hand_name)
    if hand is None:
        raise RuntimeError(f"Rev43 hand pose bone is missing: {hand_name}")
    current_basis = hand.matrix.to_3x3().normalized()
    swing_degrees, twist_degrees = wrist_orientation_delta(
        current_basis,
        desired_basis,
    )
    if swing_degrees > VLR7_MAX_WRIST_SWING_DEGREES + 1e-4:
        raise RuntimeError(
            "Rev43 wrist swing exceeds the anatomical gate: "
            f"hand={hand_name} swing={swing_degrees:.3f} "
            f"limit={VLR7_MAX_WRIST_SWING_DEGREES:.3f}"
        )
    if twist_degrees > VLR7_MAX_WRIST_TWIST_DEGREES + 1e-4:
        raise RuntimeError(
            "Rev43 wrist twist exceeds the anatomical gate: "
            f"hand={hand_name} twist={twist_degrees:.3f} "
            f"limit={VLR7_MAX_WRIST_TWIST_DEGREES:.3f}"
        )
    pivot = hand.head.copy()
    delta = desired_basis @ current_basis.inverted_safe()
    hand.matrix = (
        Matrix.Translation(pivot)
        @ delta.to_4x4()
        @ Matrix.Translation(-pivot)
        @ hand.matrix
    )
    bpy.context.view_layer.update()
    final_hand = rig.pose.bones[hand_name]
    head_error = (final_hand.head - pivot).length
    final_basis = final_hand.matrix.to_3x3().normalized()
    maximum_axis_error = max(
        math.degrees(final_basis.col[index].angle(desired_basis.col[index]))
        for index in range(3)
    )
    if head_error > 1e-6 or maximum_axis_error > 1e-3:
        raise RuntimeError(
            "Rev43 hand-frame application missed its invariant: "
            f"hand={hand_name} head={head_error:.9f} "
            f"axis={maximum_axis_error:.6f}"
        )
    return {
        "swingDegrees": swing_degrees,
        "twistDegrees": twist_degrees,
        "headErrorMeters": head_error,
        "maximumAxisErrorDegrees": maximum_axis_error,
    }


def palm_contact_measurement(
    rig: bpy.types.Object,
    hand_name: str,
    palm_anchor_local: Vector,
    surface_contact: Vector,
) -> dict[str, object]:
    hand = rig.pose.bones[hand_name]
    transformed_anchor = hand.matrix @ palm_anchor_local
    error = (transformed_anchor - surface_contact).length
    if error > VLR7_PALM_CONTACT_TOLERANCE_METERS:
        raise RuntimeError(
            "Rev43 transformed palm missed weapon surface: "
            f"hand={hand_name} error={error:.6f} "
            f"limit={VLR7_PALM_CONTACT_TOLERANCE_METERS:.6f}"
        )
    return {
        "transformedAnchorMeters": vector_values(transformed_anchor),
        "surfaceContactMeters": vector_values(surface_contact),
        "errorMeters": error,
    }


def apply_geometry_finger_curl(
    rig: bpy.types.Object,
    side: str,
    role: str,
    palm_normal: Vector,
) -> dict[str, object]:
    profile = VLR7_FINGER_CURL_DEGREES[role]
    inward = palm_normal.normalized()
    applied: dict[str, list[float]] = {}
    for finger, angles in profile.items():
        applied_angles = []
        for joint, degrees in enumerate(angles, start=1):
            bone_name = f"{finger}_0{joint}_{side}"
            bone = rig.pose.bones.get(bone_name)
            if bone is None or bone.vector.length <= 1e-6:
                raise RuntimeError(f"Rev43 finger bone is invalid: {bone_name}")
            current = bone.vector.normalized()
            bend_direction = inward - current * inward.dot(current)
            if bend_direction.length <= 1e-6:
                raise RuntimeError(
                    f"Rev43 weapon-derived finger bend is degenerate: {bone_name}"
                )
            bend_direction.normalize()
            radians = math.radians(degrees)
            desired = (
                current * math.cos(radians)
                + bend_direction * math.sin(radians)
            ).normalized()
            rotate_pose_bone_to_direction(rig, bone_name, desired)
            actual = math.degrees(current.angle(
                rig.pose.bones[bone_name].vector.normalized()
            ))
            if abs(actual - degrees) > 1e-3:
                raise RuntimeError(
                    "Rev43 finger curl missed its geometry-derived direction: "
                    f"bone={bone_name} expected={degrees:.3f} actual={actual:.3f}"
                )
            applied_angles.append(actual)
        applied[finger] = applied_angles
    return {
        "method": "current phalanx rotated toward weapon-frame palm normal",
        "side": side,
        "role": role,
        "appliedDegrees": applied,
        "maximumAppliedDegrees": max(
            degree for values in applied.values() for degree in values
        ),
    }


def finger_clearance_witnesses(
    rig: bpy.types.Object,
    side: str,
    surface_contact: Vector,
    outward_surface_normal: Vector,
) -> dict[str, object]:
    normal = outward_surface_normal.normalized()
    knuckle_distances = {}
    tip_distances = {}
    for finger in ("index", "middle", "ring", "pinky", "thumb"):
        root = rig.pose.bones[f"{finger}_01_{side}"]
        tip = rig.pose.bones[f"{finger}_03_{side}"]
        knuckle_distances[finger] = float(
            (root.head - surface_contact).dot(normal)
        )
        tip_distances[finger] = float(
            (tip.tail - surface_contact).dot(normal)
        )
    all_distances = [*knuckle_distances.values(), *tip_distances.values()]
    return {
        "reference": "signed distance from tangent plane; positive is outside",
        "knuckleRootSignedDistanceMeters": knuckle_distances,
        "fingerTipSignedDistanceMeters": tip_distances,
        "minimumSignedDistanceMeters": min(all_distances),
        "maximumSignedDistanceMeters": max(all_distances),
        "nonClaim": "plane witness only; not a full mesh collision test",
    }


def read_vlr7_fixture_glb() -> tuple[dict, bytes]:
    """Read the exact pinned GLB without letting Blender reorder primitives."""
    bytes_value = VLR7_REVIEW_GLB.read_bytes()
    if len(bytes_value) < 20 or bytes_value[:4] != b"glTF":
        raise RuntimeError("Rev44 VLR-7 fixture GLB header is invalid")
    version, total_length = struct.unpack_from("<II", bytes_value, 4)
    if version != 2 or total_length != len(bytes_value):
        raise RuntimeError(
            "Rev44 VLR-7 fixture GLB container changed: "
            f"version={version} total={total_length} bytes={len(bytes_value)}"
        )
    document = None
    binary = None
    offset = 12
    while offset < len(bytes_value):
        chunk_length, chunk_type = struct.unpack_from("<II", bytes_value, offset)
        offset += 8
        payload = bytes_value[offset:offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            if document is not None:
                raise RuntimeError("Rev44 VLR-7 GLB has duplicate JSON chunks")
            document = json.loads(payload.decode("utf-8").rstrip(" \t\r\n\0"))
        elif chunk_type == 0x004E4942:
            if binary is not None:
                raise RuntimeError("Rev44 VLR-7 GLB has duplicate BIN chunks")
            binary = payload
    if document is None or binary is None:
        raise RuntimeError("Rev44 VLR-7 GLB requires one JSON and one BIN chunk")
    return document, binary


def read_gltf_accessor(document: dict, binary: bytes, index: int) -> list[tuple]:
    component_formats = {
        5120: "b",
        5121: "B",
        5122: "h",
        5123: "H",
        5125: "I",
        5126: "f",
    }
    component_widths = {
        "SCALAR": 1,
        "VEC2": 2,
        "VEC3": 3,
        "VEC4": 4,
        "MAT2": 4,
        "MAT3": 9,
        "MAT4": 16,
    }
    accessors = document.get("accessors", [])
    if not 0 <= index < len(accessors):
        raise RuntimeError(f"Rev44 GLB accessor is out of range: {index}")
    accessor = accessors[index]
    if "sparse" in accessor or "bufferView" not in accessor:
        raise RuntimeError(f"Rev44 fixture accessor is unsupported: {index}")
    views = document.get("bufferViews", [])
    view_index = int(accessor["bufferView"])
    if not 0 <= view_index < len(views):
        raise RuntimeError(f"Rev44 GLB bufferView is out of range: {view_index}")
    view = views[view_index]
    if int(view.get("buffer", 0)) != 0:
        raise RuntimeError("Rev44 fixture GLB must use its embedded buffer 0")
    component_type = int(accessor["componentType"])
    accessor_type = str(accessor["type"])
    if component_type not in component_formats or accessor_type not in component_widths:
        raise RuntimeError(
            "Rev44 fixture accessor encoding is unsupported: "
            f"component={component_type} type={accessor_type}"
        )
    width = component_widths[accessor_type]
    value_format = "<" + component_formats[component_type] * width
    element_bytes = struct.calcsize(value_format)
    stride = int(view.get("byteStride", element_bytes))
    if stride < element_bytes:
        raise RuntimeError(f"Rev44 fixture accessor stride is invalid: {stride}")
    start = int(view.get("byteOffset", 0)) + int(accessor.get("byteOffset", 0))
    count = int(accessor["count"])
    if count <= 0 or start + (count - 1) * stride + element_bytes > len(binary):
        raise RuntimeError(f"Rev44 fixture accessor bounds are invalid: {index}")
    return [
        struct.unpack_from(value_format, binary, start + item * stride)
        for item in range(count)
    ]


def gltf_to_blender_source(value: tuple[float, float, float]) -> Vector:
    return Vector((float(value[0]), -float(value[2]), float(value[1])))


def closest_point_on_triangle(
    point: Vector,
    vertex_a: Vector,
    vertex_b: Vector,
    vertex_c: Vector,
) -> Vector:
    """Return the exact Euclidean closest point on one finite triangle."""
    edge_ab = vertex_b - vertex_a
    edge_ac = vertex_c - vertex_a
    point_a = point - vertex_a
    dot_ab_a = edge_ab.dot(point_a)
    dot_ac_a = edge_ac.dot(point_a)
    if dot_ab_a <= 0.0 and dot_ac_a <= 0.0:
        return vertex_a.copy()
    point_b = point - vertex_b
    dot_ab_b = edge_ab.dot(point_b)
    dot_ac_b = edge_ac.dot(point_b)
    if dot_ab_b >= 0.0 and dot_ac_b <= dot_ab_b:
        return vertex_b.copy()
    vertex_c_region = dot_ab_a * dot_ac_b - dot_ab_b * dot_ac_a
    if vertex_c_region <= 0.0 and dot_ab_a >= 0.0 and dot_ab_b <= 0.0:
        weight = dot_ab_a / (dot_ab_a - dot_ab_b)
        return vertex_a + edge_ab * weight
    point_c = point - vertex_c
    dot_ab_c = edge_ab.dot(point_c)
    dot_ac_c = edge_ac.dot(point_c)
    if dot_ac_c >= 0.0 and dot_ab_c <= dot_ac_c:
        return vertex_c.copy()
    vertex_b_region = dot_ab_c * dot_ac_a - dot_ab_a * dot_ac_c
    if vertex_b_region <= 0.0 and dot_ac_a >= 0.0 and dot_ac_c <= 0.0:
        weight = dot_ac_a / (dot_ac_a - dot_ac_c)
        return vertex_a + edge_ac * weight
    vertex_a_region = dot_ab_b * dot_ac_c - dot_ab_c * dot_ac_b
    if (
        vertex_a_region <= 0.0
        and dot_ac_b - dot_ab_b >= 0.0
        and dot_ab_c - dot_ac_c >= 0.0
    ):
        weight = (dot_ac_b - dot_ab_b) / (
            (dot_ac_b - dot_ab_b) + (dot_ab_c - dot_ac_c)
        )
        return vertex_b + (vertex_c - vertex_b) * weight
    denominator = 1.0 / (
        vertex_a_region + vertex_b_region + vertex_c_region
    )
    weight_b = vertex_b_region * denominator
    weight_c = vertex_c_region * denominator
    return vertex_a + edge_ab * weight_b + edge_ac * weight_c


def validate_oriented_triangle_contract(
    vertices: tuple[Vector, Vector, Vector],
    expected_normal: Vector,
    transform_determinant: float,
    label: str,
) -> Vector:
    """Fail closed on reversed winding, reversed normals, or mirror transforms."""
    if not math.isfinite(transform_determinant) or transform_determinant <= 0.0:
        raise RuntimeError(
            f"Rev51 oriented fixture transform is mirrored: {label} "
            f"determinant={transform_determinant}"
        )
    normal = (vertices[1] - vertices[0]).cross(vertices[2] - vertices[0])
    if normal.length <= 1e-9:
        raise RuntimeError(f"Rev51 oriented fixture triangle is degenerate: {label}")
    normal.normalize()
    expected = expected_normal.normalized()
    normal_dot = normal.dot(expected)
    if normal_dot < VLR7_FIXTURE_NORMAL_DOT_GATE:
        raise RuntimeError(
            f"Rev51 oriented fixture winding changed: {label} "
            f"dot={normal_dot:.9f}"
        )
    return normal


def oriented_mesh_signed_clearance(
    point: Vector,
    triangles: list[dict[str, object]],
) -> dict[str, object]:
    """Measure point clearance from the nearest finite, outward-wound face."""
    if not triangles:
        raise RuntimeError("Rev51 oriented fixture mesh has no triangles")
    candidates: list[dict[str, object]] = []
    for triangle in triangles:
        vertices = triangle["verticesRigLocalMeters"]
        closest = closest_point_on_triangle(point, *vertices)
        delta = point - closest
        distance_squared = delta.length_squared
        signed_clearance = delta.dot(triangle["outwardNormalRigLocal"])
        if abs(signed_clearance) <= VLR7_ORIENTED_MESH_NUMERICAL_ZERO_METERS:
            signed_clearance = 0.0
        candidate = {
            "primitive": int(triangle["primitive"]),
            "triangle": int(triangle["triangle"]),
            "closestPointRigLocalMeters": closest,
            "outwardNormalRigLocal": triangle["outwardNormalRigLocal"],
            "distanceSquaredMeters": float(distance_squared),
            "distanceMeters": math.sqrt(max(0.0, distance_squared)),
            "signedClearanceMeters": float(signed_clearance),
        }
        candidates.append(candidate)
    nearest_distance = min(float(value["distanceMeters"]) for value in candidates)
    nearest = [
        value
        for value in candidates
        if float(value["distanceMeters"]) - nearest_distance
        <= VLR7_FIXTURE_POINT_TOLERANCE_METERS
    ]
    signs = {
        1 if value["signedClearanceMeters"] > 0.0 else -1
        if value["signedClearanceMeters"] < 0.0 else 0
        for value in nearest
    }
    if 1 in signs and -1 in signs:
        raise RuntimeError(
            "Rev51 nearest oriented fixture faces disagree on inside/outside: "
            f"point={tuple(float(value) for value in point)}"
        )
    # A shared edge can have multiple outward normals.  Use the smallest signed
    # clearance among exact-distance ties so the gate remains fail closed.
    winner = min(
        nearest,
        key=lambda value: (
            float(value["signedClearanceMeters"]),
            int(value["primitive"]),
            int(value["triangle"]),
        ),
    )
    return {
        **winner,
        "distanceMeters": nearest_distance,
        "nearestTieCount": len(nearest),
        "tieDistanceToleranceMeters": VLR7_FIXTURE_POINT_TOLERANCE_METERS,
        "tiedSignedClearancesMeters": [
            float(value["signedClearanceMeters"]) for value in nearest
        ],
        "tiedTriangles": [
            {
                "primitive": int(value["primitive"]),
                "triangle": int(value["triangle"]),
                "signedClearanceMeters": float(value["signedClearanceMeters"]),
            }
            for value in nearest
        ],
    }


def segment_triangle_intersection(
    start: Vector,
    end: Vector,
    vertices: tuple[Vector, Vector, Vector],
) -> dict[str, object] | None:
    """Pure finite-segment Moller-Trumbore intersection witness."""
    direction = end - start
    length = direction.length
    if length <= 1e-9:
        raise RuntimeError("Rev51 clearance segment is degenerate")
    vertex_a, vertex_b, vertex_c = vertices
    edge_ab = vertex_b - vertex_a
    edge_ac = vertex_c - vertex_a
    cross_value = direction.cross(edge_ac)
    determinant = edge_ab.dot(cross_value)
    if abs(determinant) <= 1e-12:
        return None
    inverse = 1.0 / determinant
    start_offset = start - vertex_a
    barycentric_b = start_offset.dot(cross_value) * inverse
    if barycentric_b < 0.0 or barycentric_b > 1.0:
        return None
    barycentric_cross = start_offset.cross(edge_ab)
    barycentric_c = direction.dot(barycentric_cross) * inverse
    if barycentric_c < 0.0 or barycentric_b + barycentric_c > 1.0:
        return None
    segment_fraction = edge_ac.dot(barycentric_cross) * inverse
    # Ignore exact endpoints only.  Root/target clearance is independently
    # gated, so this does not hide a point that starts or ends inside.
    endpoint_epsilon = min(1e-9 / length, 1e-6)
    if not endpoint_epsilon < segment_fraction < 1.0 - endpoint_epsilon:
        return None
    location = start + direction * segment_fraction
    return {
        "segmentFraction": float(segment_fraction),
        "distanceAlongSegmentMeters": float(length * segment_fraction),
        "locationRigLocalMeters": location,
        "barycentric": (
            1.0 - barycentric_b - barycentric_c,
            barycentric_b,
            barycentric_c,
        ),
    }


def oriented_mesh_segment_intersections(
    points: list[Vector],
    triangles: list[dict[str, object]],
    contact_surface: Vector,
) -> list[dict[str, object]]:
    """Return all path/mesh crossings and reject any outside the contact pad."""
    hits = []
    for segment_index, (start, end) in enumerate(zip(points[:-1], points[1:])):
        for triangle in triangles:
            hit = segment_triangle_intersection(
                start,
                end,
                triangle["verticesRigLocalMeters"],
            )
            if hit is None:
                continue
            contact_distance = (
                hit["locationRigLocalMeters"] - contact_surface
            ).length
            report = {
                "segment": segment_index,
                "primitive": int(triangle["primitive"]),
                "triangle": int(triangle["triangle"]),
                "distanceAlongSegmentMeters": hit["distanceAlongSegmentMeters"],
                "distanceToContactPadMeters": float(contact_distance),
                "locationRigLocalMeters": vector_values(
                    hit["locationRigLocalMeters"]
                ),
                "barycentric": list(hit["barycentric"]),
            }
            if contact_distance > VLR7_DIGIT_CONTACT_PAD_RADIUS_METERS:
                raise RuntimeError(
                    "Rev51 analytic digit path intersects its oriented role mesh "
                    "outside the unchanged contact pad: "
                    f"segment={segment_index} "
                    f"primitive={triangle['primitive']} "
                    f"triangle={triangle['triangle']} "
                    f"distanceToPad={contact_distance:.9f}"
                )
            hits.append(report)
    return hits


def validate_rev51_oriented_mesh_math_contract() -> dict[str, object]:
    """Pure analytic negative controls for winding, normal, and mirroring."""
    diagnostic_expected_clearance_meters = 0.125
    diagnostic_equality_tolerance_meters = 1e-12
    valid_vertices = (
        Vector((0.0, 0.0, 0.0)),
        Vector((1.0, 0.0, 0.0)),
        Vector((0.0, 1.0, 0.0)),
    )
    expected_normal = Vector((0.0, 0.0, 1.0))
    valid_normal = validate_oriented_triangle_contract(
        valid_vertices,
        expected_normal,
        1.0,
        "positive-control",
    )
    triangle = [{
        "primitive": 0,
        "triangle": 0,
        "verticesRigLocalMeters": valid_vertices,
        "outwardNormalRigLocal": valid_normal,
    }]
    positive = oriented_mesh_signed_clearance(
        Vector((0.25, 0.25, diagnostic_expected_clearance_meters)),
        triangle,
    )
    positive_actual_meters = float(positive["signedClearanceMeters"])
    positive_delta_meters = abs(
        positive_actual_meters - diagnostic_expected_clearance_meters
    )
    if positive_delta_meters > diagnostic_equality_tolerance_meters:
        raise RuntimeError(
            "Rev51 oriented clearance positive control failed: "
            f"actual={positive_actual_meters:.17g} "
            f"expected={diagnostic_expected_clearance_meters:.17g} "
            f"delta={positive_delta_meters:.17g} "
            f"tolerance={diagnostic_equality_tolerance_meters:.17g}"
        )
    failures = []
    for label, vertices, normal, determinant in (
        (
            "reversed-winding",
            (valid_vertices[0], valid_vertices[2], valid_vertices[1]),
            expected_normal,
            1.0,
        ),
        (
            "reversed-normal",
            valid_vertices,
            -expected_normal,
            1.0,
        ),
        (
            "mirrored-transform",
            valid_vertices,
            expected_normal,
            -1.0,
        ),
    ):
        try:
            validate_oriented_triangle_contract(
                vertices,
                normal,
                determinant,
                label,
            )
        except RuntimeError:
            failures.append(label)
        else:
            raise RuntimeError(
                f"Rev51 negative orientation control was accepted: {label}"
            )
    mirrored_hand = oriented_mesh_signed_clearance(
        Vector((0.25, 0.25, -0.1)),
        triangle,
    )
    if float(mirrored_hand["signedClearanceMeters"]) >= 0.0:
        raise RuntimeError("Rev51 mirrored-hand clearance control was accepted")
    failures.append("mirrored-hand-point")
    on_surface = oriented_mesh_signed_clearance(
        Vector((0.25, 0.25, 0.0)),
        triangle,
    )
    if float(on_surface["signedClearanceMeters"]) > 0.0:
        raise RuntimeError("Rev51 on-surface clearance control was accepted")
    failures.append("on-surface-point")
    repaired_mirror = validate_oriented_triangle_contract(
        (valid_vertices[0], valid_vertices[2], valid_vertices[1]),
        -expected_normal,
        1.0,
        "repaired-mirror-magnitude-control",
    )
    repaired_clearance = oriented_mesh_signed_clearance(
        Vector((0.25, 0.25, -diagnostic_expected_clearance_meters)),
        [{
            "primitive": 0,
            "triangle": 0,
            "verticesRigLocalMeters": (
                valid_vertices[0],
                valid_vertices[2],
                valid_vertices[1],
            ),
            "outwardNormalRigLocal": repaired_mirror,
        }],
    )
    repaired_actual_meters = float(repaired_clearance["signedClearanceMeters"])
    repaired_delta_meters = abs(
        repaired_actual_meters - diagnostic_expected_clearance_meters
    )
    if repaired_delta_meters > diagnostic_equality_tolerance_meters:
        raise RuntimeError(
            "Rev51 repaired-mirror magnitude control failed: "
            f"actual={repaired_actual_meters:.17g} "
            f"expected={diagnostic_expected_clearance_meters:.17g} "
            f"delta={repaired_delta_meters:.17g} "
            f"tolerance={diagnostic_equality_tolerance_meters:.17g}"
        )
    return {
        "schema": "kyx-rev51-oriented-mesh-math-contract-v1",
        "diagnosticExpectedClearanceMeters": (
            diagnostic_expected_clearance_meters
        ),
        "diagnosticEqualityToleranceMeters": (
            diagnostic_equality_tolerance_meters
        ),
        "positiveClearanceMeters": positive_actual_meters,
        "positiveClearanceDeltaMeters": positive_delta_meters,
        "rejectedNegativeControls": failures,
        "repairedMirrorClearanceMeters": repaired_actual_meters,
        "repairedMirrorClearanceDeltaMeters": repaired_delta_meters,
        "poseContextMutations": 0,
    }


VLR7_ORIENTED_MESH_MATH_REPORT = (
    validate_rev51_oriented_mesh_math_contract()
)


def resolve_vlr7_landmark_fixtures(
    contacts: dict[str, Vector | float],
) -> dict[str, dict[str, dict[str, object]]]:
    """Resolve every named digit fixture from the hash-pinned GLB exactly."""
    if sha256(VLR7_REVIEW_GLB) != VLR7_REVIEW_GLB_SHA256:
        raise RuntimeError("Rev44 refuses an unpinned VLR-7 fixture GLB")
    document, binary = read_vlr7_fixture_glb()
    nodes = document.get("nodes", [])
    meshes = document.get("meshes", [])
    nodes_by_name = {
        node.get("name"): node
        for node in nodes
        if isinstance(node.get("name"), str)
    }
    trigger_node = nodes_by_name.get(VLR7_TRIGGER_GUARD_NAME)
    if trigger_node is None or "mesh" not in trigger_node:
        raise RuntimeError("Rev44 trigger-guard node is missing from the pinned GLB")
    trigger_mesh = meshes[int(trigger_node["mesh"])]
    trigger_points = []
    for primitive in trigger_mesh.get("primitives", []):
        position_index = primitive.get("attributes", {}).get("POSITION")
        if position_index is None:
            raise RuntimeError("Rev44 trigger-guard primitive has no positions")
        trigger_points.extend(
            gltf_to_blender_source(value)
            for value in read_gltf_accessor(document, binary, int(position_index))
        )
    if not trigger_points:
        raise RuntimeError("Rev44 trigger-guard bounds are empty")
    trigger_minimum = Vector((
        min(point.x for point in trigger_points),
        min(point.y for point in trigger_points),
        min(point.z for point in trigger_points),
    ))
    trigger_maximum = Vector((
        max(point.x for point in trigger_points),
        max(point.y for point in trigger_points),
        max(point.z for point in trigger_points),
    ))
    expected_trigger_minimum = Vector(VLR7_TRIGGER_GUARD_SOURCE_BOUNDS["minimum"])
    expected_trigger_maximum = Vector(VLR7_TRIGGER_GUARD_SOURCE_BOUNDS["maximum"])
    trigger_bounds_error = max(
        (trigger_minimum - expected_trigger_minimum).length,
        (trigger_maximum - expected_trigger_maximum).length,
    )
    if trigger_bounds_error > VLR7_FIXTURE_POINT_TOLERANCE_METERS:
        raise RuntimeError(
            "Rev44 trigger-guard bounds changed: "
            f"error={trigger_bounds_error:.9f}"
        )
    source_to_rig = contacts["sourceToRigMatrix"]
    weapon_rotation = contacts["weaponRotation"]
    resolved = {}
    seen_addresses = set()
    for role, role_fixture in VLR7_DIGIT_FIXTURES.items():
        node_name = role_fixture["node"]
        node = nodes_by_name.get(node_name)
        if node is None or "mesh" not in node:
            raise RuntimeError(f"Rev44 fixture node is missing: {node_name}")
        mesh_index = int(node["mesh"])
        if not 0 <= mesh_index < len(meshes):
            raise RuntimeError(f"Rev44 fixture mesh index is invalid: {mesh_index}")
        mesh = meshes[mesh_index]
        if mesh.get("name") != role_fixture["mesh"]:
            raise RuntimeError(
                "Rev44 fixture mesh name changed: "
                f"expected={role_fixture['mesh']} actual={mesh.get('name')}"
            )
        primitive_index = int(role_fixture["primitive"])
        primitives = mesh.get("primitives", [])
        if not 0 <= primitive_index < len(primitives):
            raise RuntimeError(
                f"Rev44 fixture primitive is missing: {node_name}/{primitive_index}"
            )
        primitive = primitives[primitive_index]
        if int(primitive.get("mode", 4)) != 4:
            raise RuntimeError("Rev44 digit fixtures require TRIANGLES mode")
        position_index = primitive.get("attributes", {}).get("POSITION")
        indices_index = primitive.get("indices")
        if position_index is None or indices_index is None:
            raise RuntimeError("Rev44 digit fixture primitive is not indexed")
        positions = read_gltf_accessor(document, binary, int(position_index))
        indices = [
            int(value[0])
            for value in read_gltf_accessor(document, binary, int(indices_index))
        ]
        source_to_rig_determinant = source_to_rig.to_3x3().determinant()
        if (
            not math.isfinite(source_to_rig_determinant)
            or source_to_rig_determinant <= 0.0
        ):
            raise RuntimeError(
                "Rev51 role mesh source-to-rig transform is mirrored: "
                f"role={role} determinant={source_to_rig_determinant}"
            )
        # Clearance is measured against every primitive of the exact named
        # role mesh.  Restricting this to the contact primitive would recreate
        # Rev47's local-plane blind spot at material/primitive boundaries.
        role_clearance_triangles = []
        for clearance_primitive_index, clearance_primitive in enumerate(primitives):
            if int(clearance_primitive.get("mode", 4)) != 4:
                raise RuntimeError(
                    "Rev51 role clearance mesh requires TRIANGLES mode: "
                    f"role={role} primitive={clearance_primitive_index}"
                )
            clearance_position_index = clearance_primitive.get(
                "attributes", {}
            ).get("POSITION")
            clearance_indices_index = clearance_primitive.get("indices")
            if clearance_position_index is None or clearance_indices_index is None:
                raise RuntimeError(
                    "Rev51 role clearance mesh must be indexed: "
                    f"role={role} primitive={clearance_primitive_index}"
                )
            clearance_positions = read_gltf_accessor(
                document,
                binary,
                int(clearance_position_index),
            )
            clearance_indices = [
                int(value[0])
                for value in read_gltf_accessor(
                    document,
                    binary,
                    int(clearance_indices_index),
                )
            ]
            if len(clearance_indices) % 3 != 0:
                raise RuntimeError(
                    "Rev51 role clearance index count is not triangular: "
                    f"role={role} primitive={clearance_primitive_index} "
                    f"count={len(clearance_indices)}"
                )
            for clearance_triangle_index in range(len(clearance_indices) // 3):
                base = clearance_triangle_index * 3
                clearance_triangle_indices = tuple(
                    clearance_indices[base:base + 3]
                )
                source_vertices = tuple(
                    gltf_to_blender_source(clearance_positions[index])
                    for index in clearance_triangle_indices
                )
                source_normal = (
                    (source_vertices[1] - source_vertices[0])
                    .cross(source_vertices[2] - source_vertices[0])
                )
                if source_normal.length <= 1e-9:
                    raise RuntimeError(
                        "Rev51 role clearance triangle is degenerate: "
                        f"role={role} primitive={clearance_primitive_index} "
                        f"triangle={clearance_triangle_index}"
                    )
                source_normal.normalize()
                rig_vertices = tuple(
                    source_to_rig @ vertex for vertex in source_vertices
                )
                expected_rig_normal = (
                    weapon_rotation @ source_normal
                ).normalized()
                rig_normal = validate_oriented_triangle_contract(
                    rig_vertices,
                    expected_rig_normal,
                    source_to_rig_determinant,
                    (
                        f"{role}/{clearance_primitive_index}/"
                        f"{clearance_triangle_index}"
                    ),
                )
                role_clearance_triangles.append({
                    "primitive": clearance_primitive_index,
                    "triangle": clearance_triangle_index,
                    "indices": clearance_triangle_indices,
                    "verticesRigLocalMeters": rig_vertices,
                    "outwardNormalRigLocal": rig_normal,
                })
        if not role_clearance_triangles:
            raise RuntimeError(f"Rev51 role clearance mesh is empty: {role}")
        role_resolved = {}
        for finger, fixture in role_fixture["digits"].items():
            if not bool(fixture.get("qualified", False)):
                raise RuntimeError(
                    "Rev44 digit fixture remains unqualified: "
                    f"role={role} finger={finger} reason={fixture.get('blocker')}"
                )
            address = (node_name, primitive_index, int(fixture["triangle"]))
            if address in seen_addresses:
                raise RuntimeError(f"Rev44 digit fixture address is reused: {address}")
            seen_addresses.add(address)
            triangle_offset = int(fixture["triangle"]) * 3
            triangle_indices = tuple(indices[triangle_offset:triangle_offset + 3])
            if len(triangle_indices) != 3:
                raise RuntimeError(f"Rev44 fixture triangle is out of range: {address}")
            if triangle_indices != tuple(fixture["indices"]):
                raise RuntimeError(
                    "Rev44 fixture triangle ordering changed: "
                    f"address={address} expected={fixture['indices']} "
                    f"actual={triangle_indices}"
                )
            vertices = [gltf_to_blender_source(positions[index]) for index in triangle_indices]
            barycentric = tuple(float(value) for value in fixture["barycentric"])
            if (
                len(barycentric) != 3
                or min(barycentric) < 0.0
                or abs(sum(barycentric) - 1.0) > 1e-9
            ):
                raise RuntimeError(
                    "Rev44 fixture barycentric weights are invalid: "
                    f"role={role} finger={finger} values={barycentric}"
                )
            surface_point = sum(
                (vertex * weight for vertex, weight in zip(vertices, barycentric)),
                Vector((0.0, 0.0, 0.0)),
            )
            expected_surface_point = Vector(fixture["surfacePoint"])
            point_error = (surface_point - expected_surface_point).length
            if point_error > VLR7_FIXTURE_POINT_TOLERANCE_METERS:
                raise RuntimeError(
                    "Rev44 fixture barycentric surface point changed: "
                    f"role={role} finger={finger} error={point_error:.9f}"
                )
            normal = (vertices[1] - vertices[0]).cross(vertices[2] - vertices[0])
            if normal.length <= 1e-9:
                raise RuntimeError(f"Rev44 fixture triangle is degenerate: {address}")
            normal.normalize()
            expected_normal = Vector(fixture["normal"]).normalized()
            normal_dot = normal.dot(expected_normal)
            if normal_dot < VLR7_FIXTURE_NORMAL_DOT_GATE:
                raise RuntimeError(
                    "Rev44 fixture normal changed: "
                    f"role={role} finger={finger} dot={normal_dot:.9f}"
                )
            surface_rig = source_to_rig @ surface_point
            outward_rig = (weapon_rotation @ normal).normalized()
            offset = float(fixture["boneCenterOffsetMeters"])
            if offset <= 0.0:
                raise RuntimeError(
                    "Rev51 fixture bone-center offset must be outward: "
                    f"role={role} finger={finger} offset={offset}"
                )
            target_rig = surface_rig + outward_rig * offset
            signed_target_offset = (target_rig - surface_rig).dot(outward_rig)
            target_offset_representation_delta = abs(
                signed_target_offset - offset
            )
            if signed_target_offset <= 0.0:
                raise RuntimeError(
                    "Rev51 fixture target changed sides of its oriented surface: "
                    f"role={role} finger={finger} "
                    f"actual={signed_target_offset:.12f} "
                    f"expected={offset:.12f} "
                    f"delta={target_offset_representation_delta:.12f} "
                    "strictOutwardMinimum=0.000000000000 "
                    "tolerance="
                    f"{VLR7_FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS:.12f}"
                )
            if (
                target_offset_representation_delta
                > VLR7_FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS
            ):
                raise RuntimeError(
                    "Rev51 fixture target offset representation changed: "
                    f"role={role} finger={finger} "
                    f"actual={signed_target_offset:.12f} "
                    f"expected={offset:.12f} "
                    f"delta={target_offset_representation_delta:.12f} "
                    "tolerance="
                    f"{VLR7_FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS:.12f}"
                )
            role_resolved[finger] = {
                "node": node_name,
                "mesh": role_fixture["mesh"],
                "primitive": primitive_index,
                "triangle": int(fixture["triangle"]),
                "indexBase": 0,
                "indices": list(triangle_indices),
                "barycentric": list(barycentric),
                "surfaceSourceLocalMeters": vector_values(surface_point),
                "surfaceRigLocalMeters": surface_rig,
                "outwardNormalSourceLocal": vector_values(normal),
                "outwardNormalRigLocal": outward_rig,
                "boneCenterOffsetMeters": offset,
                "targetRigLocalMeters": target_rig,
                "targetSignedSurfaceOffsetMeters": signed_target_offset,
                "targetExpectedSurfaceOffsetMeters": offset,
                "targetOffsetRepresentationDeltaMeters": (
                    target_offset_representation_delta
                ),
                "targetOffsetRepresentationToleranceMeters": (
                    VLR7_FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS
                ),
                "targetStrictlyOutward": True,
                "surfacePointSeedErrorMeters": point_error,
                "normalSeedDot": normal_dot,
                "clearanceMeshName": role_fixture["mesh"],
                "clearanceMeshPrimitiveCount": len(primitives),
                "clearanceMeshTriangleCount": len(role_clearance_triangles),
                "clearanceTrianglesRigLocal": role_clearance_triangles,
            }
        order = ("index", "middle", "ring", "pinky")
        order_axis = (
            role_resolved["index"]["surfaceRigLocalMeters"]
            - role_resolved["pinky"]["surfaceRigLocalMeters"]
        ).normalized()
        projections = {
            finger: float(
                role_resolved[finger]["surfaceRigLocalMeters"].dot(order_axis)
            )
            for finger in order
        }
        if not all(
            projections[order[index]] > projections[order[index + 1]]
            for index in range(len(order) - 1)
        ):
            raise RuntimeError(
                f"Rev44 fixture finger order crossed for {role}: {projections}"
            )
        resolved[role] = role_resolved
    return resolved


def semantic_hand_contact_frame(
    rig: bpy.types.Object,
    hand_name: str,
    side: str,
    role: str,
    surface_contact: Vector,
    contacts: dict[str, Vector | float],
) -> tuple[Matrix, dict[str, object]]:
    """Map measured hand semantics to weapon semantics, not assumed bone axes."""
    hand = rig.pose.bones[hand_name]
    mcps = {
        finger: rig.pose.bones[f"{finger}_01_{side}"].head.copy()
        for finger in ("index", "middle", "ring", "pinky")
    }
    extension = (
        sum(mcps.values(), Vector((0.0, 0.0, 0.0))) / len(mcps)
        - hand.head
    ).normalized()
    across = mcps["index"] - mcps["pinky"]
    across -= extension * across.dot(extension)
    if across.length <= 1e-6:
        raise RuntimeError(f"Rev44 semantic MCP basis is degenerate: {role}")
    across.normalize()
    normal = across.cross(extension).normalized()
    palm_center = hand.head + extension * (hand.length * 0.5)
    toward_surface = (surface_contact - palm_center).normalized()
    if normal.dot(toward_surface) < 0.0:
        across.negate()
        normal.negate()
    current_semantic = Matrix((across, extension, normal)).transposed()

    source_wrap = (
        VLR7_DOMINANT_WRAP_SOURCE_LOCAL
        if role == "dominant"
        else VLR7_SUPPORT_WRAP_SOURCE_LOCAL
    )
    source_axis = (
        VLR7_DOMINANT_AXIS_SOURCE_LOCAL
        if role == "dominant"
        else VLR7_SUPPORT_AXIS_SOURCE_LOCAL
    )
    desired_normal = (contacts["weaponRotation"] @ -source_wrap).normalized()
    desired_extension = (contacts["weaponRotation"] @ source_axis).normalized()
    desired_extension -= desired_normal * desired_extension.dot(desired_normal)
    if desired_extension.length <= 1e-6:
        raise RuntimeError(f"Rev44 weapon semantic basis is degenerate: {role}")
    desired_extension.normalize()
    desired_across = desired_extension.cross(desired_normal).normalized()
    desired_semantic = Matrix(
        (desired_across, desired_extension, desired_normal)
    ).transposed()
    hand_basis = hand.matrix.to_3x3().normalized()
    desired_hand_basis = (
        desired_semantic @ current_semantic.inverted_safe() @ hand_basis
    ).normalized()
    return desired_hand_basis, {
        "method": "measured MCP extension/across/palm basis mapped to weapon W/A/D semantics",
        "role": role,
        "currentAcross": vector_values(across),
        "currentExtension": vector_values(extension),
        "currentPalmNormal": vector_values(normal),
        "desiredAcross": vector_values(desired_across),
        "desiredExtension": vector_values(desired_extension),
        "desiredPalmNormal": vector_values(desired_normal),
    }


def validate_mcp_ordering(
    rig: bpy.types.Object,
    side: str,
    role: str,
) -> dict[str, object]:
    order = ("index", "middle", "ring", "pinky")
    points = {
        finger: rig.pose.bones[f"{finger}_01_{side}"].head.copy()
        for finger in order
    }
    axis = (points["index"] - points["pinky"]).normalized()
    projections = {finger: float(points[finger].dot(axis)) for finger in order}
    if not all(
        projections[order[index]] > projections[order[index + 1]]
        for index in range(len(order) - 1)
    ):
        raise RuntimeError(f"Rev44 MCP order crossed for {role}: {projections}")
    spacings = [
        (points[order[index]] - points[order[index + 1]]).length
        for index in range(len(order) - 1)
    ]
    minimum_spacing = min(spacings)
    if minimum_spacing < VLR7_ADJACENT_MCP_SPACING_GATE_METERS:
        raise RuntimeError(
            "Rev44 MCP spacing is below gate: "
            f"role={role} spacing={minimum_spacing:.6f}"
        )
    return {
        "order": list(order),
        "axis": vector_values(axis),
        "projections": projections,
        "adjacentSpacingMeters": spacings,
        "minimumAdjacentSpacingMeters": minimum_spacing,
        "spacingGateMeters": VLR7_ADJACENT_MCP_SPACING_GATE_METERS,
    }


def validate_rev51_fixture_target_order_spacing(
    fixtures: dict[str, dict[str, dict[str, object]]],
) -> dict[str, object]:
    """Fail before pose mutation if a reviewed target crosses another digit."""
    result = {}
    order = ("index", "middle", "ring", "pinky")
    for role in ("dominant", "support"):
        points = {
            finger: fixtures[role][finger]["surfaceRigLocalMeters"]
            for finger in order
        }
        axis = (points["index"] - points["pinky"]).normalized()
        projections = {
            finger: float(points[finger].dot(axis)) for finger in order
        }
        ordered = all(
            projections[order[index]] > projections[order[index + 1]]
            for index in range(len(order) - 1)
        )
        spacings = [
            (points[order[index]] - points[order[index + 1]]).length
            for index in range(len(order) - 1)
        ]
        minimum_spacing = min(spacings)
        if not ordered:
            raise RuntimeError(
                f"Rev51 fixture target order crossed for {role}: {projections}"
            )
        if minimum_spacing < VLR7_ADJACENT_TIP_SPACING_GATE_METERS:
            raise RuntimeError(
                "Rev51 fixture target spacing is below the unchanged gate: "
                f"role={role} spacing={minimum_spacing:.9f}"
            )
        result[role] = {
            "order": list(order),
            "axisRigLocal": vector_values(axis),
            "projections": projections,
            "adjacentSpacingMeters": spacings,
            "minimumAdjacentSpacingMeters": minimum_spacing,
            "spacingGateMeters": VLR7_ADJACENT_TIP_SPACING_GATE_METERS,
        }
    return result


def solve_fixed_length_digit_waypoints(
    root: Vector,
    lengths: list[float],
    rest_directions: list[Vector],
    target: Vector,
    surface: Vector,
    outward: Vector,
    pole_hint: Vector,
    clearance_triangles: list[dict[str, object]],
    role: str,
    finger: str,
) -> tuple[list[Vector], dict[str, object]]:
    """Select one fully-qualified path from a finite stable-ID route family."""
    if len(lengths) != 3 or min(lengths) <= 1e-6:
        raise RuntimeError(f"Rev51 digit lengths are invalid: {lengths}")
    if len(rest_directions) != 3:
        raise RuntimeError(
            f"Rev51 digit rest-direction cardinality changed: {role}/{finger}"
        )
    outward = outward.normalized()
    target_to_root = root - target
    direct_distance = target_to_root.length
    direct_margin = sum(lengths) - direct_distance
    if direct_distance <= 1e-6:
        raise RuntimeError("Rev51 digit root collapsed onto its target")
    if direct_margin < 0.0:
        raise RuntimeError(
            "Rev51 digit surface point exceeds the exact chain length: "
            f"distance={direct_distance:.9f} chain={sum(lengths):.9f} "
            f"margin={direct_margin:.9f}"
        )
    target_to_root_direction = target_to_root.normalized()
    tangent_to_root = (
        target_to_root_direction
        - outward * target_to_root_direction.dot(outward)
    )
    if tangent_to_root.length <= 1e-6:
        raise RuntimeError("Rev51 distal waypoint tangent is degenerate")
    tangent_to_root.normalize()
    lateral = outward.cross(tangent_to_root)
    if lateral.length <= 1e-6:
        raise RuntimeError("Rev51 route-family lateral is degenerate")
    lateral.normalize()
    legacy_distal = (
        tangent_to_root + outward * VLR7_DISTAL_WAYPOINT_OUTWARD_BIAS
    ).normalized()
    route_specs = [
        {
            "id": "legacy-positive",
            "priority": 100,
            "distal": legacy_distal,
            "phi": 0.0,
            "source": "Rev44 deterministic distal plus authored pole",
        },
        {
            "id": "legacy-negative",
            "priority": 101,
            "distal": legacy_distal,
            "phi": math.pi,
            "source": "Rev44 deterministic distal minus authored pole",
        },
    ]
    if role == "dominant" and finger == "middle":
        grid = []
        accepted_theta, accepted_psi, accepted_phi = (
            VLR7_ROUTE_DOMINANT_MIDDLE_ACCEPTED_SEED
        )
        for theta_index in VLR7_ROUTE_DOMINANT_MIDDLE_THETA_INDICES:
            theta = math.pi * theta_index / VLR7_ROUTE_THETA_DIVISIONS
            for psi_index in VLR7_ROUTE_DOMINANT_MIDDLE_PSI_INDICES:
                psi = 2.0 * math.pi * psi_index / VLR7_ROUTE_PSI_DIVISIONS
                distal = (
                    outward * math.cos(theta)
                    + (
                        tangent_to_root * math.cos(psi)
                        + lateral * math.sin(psi)
                    ) * math.sin(theta)
                ).normalized()
                for phi_index in VLR7_ROUTE_DOMINANT_MIDDLE_PHI_INDICES:
                    phi = 2.0 * math.pi * phi_index / VLR7_ROUTE_PHI_DIVISIONS
                    distance_from_seed = (
                        abs(theta_index - accepted_theta)
                        + abs(psi_index - accepted_psi)
                        + abs(phi_index - accepted_phi)
                    )
                    grid.append({
                        "id": (
                            f"grid-t{theta_index:02d}-p{psi_index:02d}"
                            f"-f{phi_index:02d}"
                        ),
                        "priority": distance_from_seed,
                        "distal": distal,
                        "phi": phi,
                        "source": "bounded tri55 route-family grid",
                        "thetaIndex": theta_index,
                        "psiIndex": psi_index,
                        "phiIndex": phi_index,
                    })
        grid.sort(key=lambda value: (value["priority"], value["id"]))
        route_specs = grid + route_specs
    hard_cap = 47 if role == "dominant" and finger == "middle" else 2
    if len(route_specs) != hard_cap:
        raise RuntimeError(
            "Rev51 route-family cardinality changed: "
            f"role={role} finger={finger} expected={hard_cap} "
            f"actual={len(route_specs)}"
        )

    point_names = ("mcpRoot", "waypointOne", "waypointTwo", "contactTarget")
    proximal_minimum = abs(lengths[0] - lengths[1]) + 1e-6
    proximal_maximum = lengths[0] + lengths[1] - 1e-6
    candidate_reports = []
    valid_internal = []
    for schedule_index, spec in enumerate(route_specs):
        reasons = []
        waypoint_two = target + spec["distal"] * lengths[2]
        reach = waypoint_two - root
        distance = reach.length
        waypoint_one = None
        clearance_reports = {}
        intersections = []
        joint_angles = []
        length_errors = []
        handedness = None
        if not proximal_minimum <= distance <= proximal_maximum:
            reasons.append("proximal-reach")
        else:
            reach_direction = reach / distance
            along = (
                lengths[0] * lengths[0]
                - lengths[1] * lengths[1]
                + distance * distance
            ) / (2.0 * distance)
            height_squared = lengths[0] * lengths[0] - along * along
            if height_squared < -1e-9:
                reasons.append("law-of-cosines")
            else:
                height = math.sqrt(max(0.0, height_squared))
                pole = pole_hint - reach_direction * pole_hint.dot(reach_direction)
                if pole.length <= 1e-6:
                    pole = outward - reach_direction * outward.dot(reach_direction)
                if pole.length <= 1e-6:
                    reasons.append("projected-pole")
                else:
                    pole.normalize()
                    circle_binormal = reach_direction.cross(pole)
                    if circle_binormal.length <= 1e-6:
                        reasons.append("circle-binormal")
                    else:
                        circle_binormal.normalize()
                        radial = (
                            pole * math.cos(spec["phi"])
                            + circle_binormal * math.sin(spec["phi"])
                        ).normalized()
                        waypoint_one = (
                            root + reach_direction * along + radial * height
                        )
                        handedness = float(radial.dot(pole))
                        if handedness <= 0.0:
                            reasons.append("handedness")
        points = (
            [root.copy(), waypoint_one, waypoint_two, target.copy()]
            if waypoint_one is not None
            else None
        )
        if points is not None:
            for index, expected_length in enumerate(lengths):
                actual_length = (points[index + 1] - points[index]).length
                error = abs(actual_length - expected_length)
                length_errors.append(error)
                if error > VLR7_DIGIT_LENGTH_GATE_METERS:
                    reasons.append(f"length-{index}")
            for point_name, point in zip(point_names, points):
                try:
                    clearance = oriented_mesh_signed_clearance(
                        point,
                        clearance_triangles,
                    )
                except RuntimeError as exc:
                    reasons.append(f"clearance-{point_name}:{exc}")
                    continue
                signed_clearance = float(clearance["signedClearanceMeters"])
                clearance_reports[point_name] = {
                    "signedClearanceMeters": signed_clearance,
                    "distanceMeters": float(clearance["distanceMeters"]),
                    "nearestPrimitive": int(clearance["primitive"]),
                    "nearestTriangle": int(clearance["triangle"]),
                    "nearestTieCount": int(clearance["nearestTieCount"]),
                    "tiedTriangles": clearance["tiedTriangles"],
                    "closestPointRigLocalMeters": vector_values(
                        clearance["closestPointRigLocalMeters"]
                    ),
                    "outwardNormalRigLocal": vector_values(
                        clearance["outwardNormalRigLocal"]
                    ),
                }
                if signed_clearance <= VLR7_ORIENTED_MESH_CLEARANCE_GATE_METERS:
                    reasons.append(f"clearance-{point_name}")
            try:
                intersections = oriented_mesh_segment_intersections(
                    points,
                    clearance_triangles,
                    surface,
                )
            except RuntimeError as exc:
                reasons.append(f"segment-intersection:{exc}")
            directions = [
                (points[index + 1] - points[index]).normalized()
                for index in range(3)
            ]
            joint_angles = [
                math.degrees(rest_directions[0].angle(directions[0])),
                math.degrees(directions[0].angle(directions[1])),
                math.degrees(directions[1].angle(directions[2])),
            ]
            if max(joint_angles) > VLR7_DIGIT_MAX_JOINT_DEGREES:
                reasons.append("joint-angle")
            wrap = sum(joint_angles)
            wrap_gate = None
            if role == "dominant" and finger in ("middle", "ring", "pinky"):
                wrap_gate = VLR7_DOMINANT_WRAP_GATE_DEGREES
            elif role == "support" and finger in (
                "index", "middle", "ring", "pinky"
            ):
                wrap_gate = VLR7_SUPPORT_WRAP_GATE_DEGREES
            if wrap_gate is not None and wrap < wrap_gate:
                reasons.append("wrap")
            if (
                role == "dominant"
                and finger == "index"
                and wrap > VLR7_TRIGGER_INDEX_MAX_WRAP_DEGREES
            ):
                reasons.append("trigger-index-wrap")
        report = {
            "id": spec["id"],
            "scheduleIndex": schedule_index,
            "priority": int(spec["priority"]),
            "source": spec["source"],
            "thetaIndex": spec.get("thetaIndex"),
            "psiIndex": spec.get("psiIndex"),
            "phiIndex": spec.get("phiIndex"),
            "phiRadians": float(spec["phi"]),
            "qualified": not reasons,
            "rejectionReasons": reasons,
            "waypointTwoRootDistanceMeters": distance,
            "proximalReachMinimumMeters": proximal_minimum,
            "proximalReachMaximumMeters": proximal_maximum,
            "lengthErrorsMeters": length_errors,
            "handednessPoleDot": handedness,
            "jointAnglesDegrees": joint_angles,
            "jointMarginsDegrees": [
                VLR7_DIGIT_MAX_JOINT_DEGREES - value
                for value in joint_angles
            ],
            "wrapDegrees": sum(joint_angles) if joint_angles else None,
            "orientedMeshClearance": clearance_reports,
            "pathOrientedMeshIntersections": intersections,
            "pointsRigLocalMeters": (
                [vector_values(value) for value in points]
                if points is not None
                else None
            ),
        }
        candidate_reports.append(report)
        if not reasons and points is not None:
            valid_internal.append((spec, report, points))

    if not valid_internal:
        reason_counts = {}
        for report in candidate_reports:
            for reason in report["rejectionReasons"]:
                key = reason.split(":", 1)[0]
                reason_counts[key] = reason_counts.get(key, 0) + 1
        raise RuntimeError(
            "Rev51 bounded route family has no fully qualified candidate: "
            f"role={role} finger={finger} candidates={len(candidate_reports)} "
            f"reasons={reason_counts}"
        )

    state_key = (role, finger)
    previous = VLR7_ROUTE_TEMPORAL_STATE.get(state_key)
    for _spec, report, points in valid_internal:
        shape = (
            points[1] - points[0],
            points[2] - points[1],
            points[3] - points[2],
        )
        report["shapeVectorsMeters"] = [vector_values(value) for value in shape]
        if previous is None:
            report["temporalShapeDeltaMeters"] = 0.0
        else:
            previous_shape = [Vector(value) for value in previous["shapeVectorsMeters"]]
            if len(previous_shape) != 3:
                raise RuntimeError(
                    "Rev51 committed route state lost a directed link vector: "
                    f"role={role} finger={finger} count={len(previous_shape)}"
                )
            report["temporalShapeDeltaMeters"] = max(
                (shape[index] - previous_shape[index]).length
                for index in range(3)
            )
    eligible = [
        value for value in valid_internal
        if previous is None
        or value[1]["temporalShapeDeltaMeters"]
        <= VLR7_ROUTE_TEMPORAL_SHAPE_DELTA_GATE_METERS
    ]
    if not eligible:
        minimum_delta = min(
            value[1]["temporalShapeDeltaMeters"] for value in valid_internal
        )
        raise RuntimeError(
            "Rev51 route family cannot preserve temporal continuity: "
            f"role={role} finger={finger} previous={previous['candidateId']} "
            f"minimumDelta={minimum_delta:.9f} "
            f"gate={VLR7_ROUTE_TEMPORAL_SHAPE_DELTA_GATE_METERS:.9f}"
        )
    previous_match = (
        [value for value in eligible if value[1]["id"] == previous["candidateId"]]
        if previous is not None
        else []
    )
    if previous_match:
        selected_spec, selected_report, selected_points = previous_match[0]
        selection_method = "retain-valid-stable-id"
    else:
        selected_spec, selected_report, selected_points = min(
            eligible,
            key=lambda value: (
                value[1]["temporalShapeDeltaMeters"],
                value[0]["priority"],
                value[1]["id"],
            ),
        )
        selection_method = (
            "first-frame-priority"
            if previous is None
            else "bounded-continuity-switch"
        )
    selected_report["selected"] = True
    pending_state = {
        "candidateId": selected_report["id"],
        "shapeVectorsMeters": selected_report["shapeVectorsMeters"],
        "selectionMethod": selection_method,
    }
    target_plane_clearances = {
        point_name: float((point - target).dot(outward))
        for point_name, point in zip(point_names, selected_points)
    }
    surface_plane_clearances = {
        point_name: float((point - surface).dot(outward))
        for point_name, point in zip(point_names, selected_points)
    }
    return selected_points, {
        "iterations": 1,
        "iterationLimit": VLR7_DIGIT_SOLVE_ITERATION_LIMIT,
        "directTargetDistanceMeters": direct_distance,
        "directTargetReachMarginMeters": direct_margin,
        "routeFamilySchema": "kyx-rev51-bounded-stable-id-route-family-v1",
        "routeFamilyCandidateCount": len(candidate_reports),
        "routeFamilyHardCap": hard_cap,
        "routeFamilyOrder": [value["id"] for value in candidate_reports],
        "candidateReports": candidate_reports,
        "validCandidateIds": [value[1]["id"] for value in valid_internal],
        "selectedCandidateId": selected_report["id"],
        "selectionMethod": selection_method,
        "previousCandidateId": (
            previous["candidateId"] if previous is not None else None
        ),
        "temporalShapeDeltaMeters": selected_report[
            "temporalShapeDeltaMeters"
        ],
        "temporalShapeDeltaGateMeters": (
            VLR7_ROUTE_TEMPORAL_SHAPE_DELTA_GATE_METERS
        ),
        "pendingTemporalState": pending_state,
        "clearanceMethod": "nearest finite triangle on exact oriented role mesh",
        "clearanceGateMeters": VLR7_ORIENTED_MESH_CLEARANCE_GATE_METERS,
        "orientedMeshClearance": selected_report["orientedMeshClearance"],
        "selectedPathOrientedMeshIntersections": selected_report[
            "pathOrientedMeshIntersections"
        ],
        "contactPadRadiusMeters": VLR7_DIGIT_CONTACT_PAD_RADIUS_METERS,
        "jointAnglesDegrees": selected_report["jointAnglesDegrees"],
        "jointMarginsDegrees": selected_report["jointMarginsDegrees"],
        "wrapDegrees": selected_report["wrapDegrees"],
        "handednessPoleDot": selected_report["handednessPoleDot"],
        "rejectedRev47TargetPlaneWitnessMeters": target_plane_clearances,
        "physicalFixturePlaneWitnessMeters": surface_plane_clearances,
    }


def prepare_landmark_digit_solve(
    rig: bpy.types.Object,
    side: str,
    role: str,
    finger: str,
    fixture: dict[str, object],
    pole_hint: Vector,
) -> dict[str, object]:
    """Compute and validate one digit path without mutating pose state."""
    names = [f"{finger}_0{index}_{side}" for index in range(1, 4)]
    bones = [rig.pose.bones.get(name) for name in names]
    if any(bone is None or bone.vector.length <= 1e-6 for bone in bones):
        raise RuntimeError(f"Rev44 digit chain is incomplete: {role}/{finger}/{names}")
    lengths = [float(bone.vector.length) for bone in bones]
    rest_directions = [bone.vector.normalized() for bone in bones]
    surface = fixture["surfaceRigLocalMeters"]
    outward = fixture["outwardNormalRigLocal"]
    target = fixture["targetRigLocalMeters"]
    points, solve_report = solve_fixed_length_digit_waypoints(
        bones[0].head.copy(),
        lengths,
        rest_directions,
        target,
        surface,
        outward,
        pole_hint,
        fixture["clearanceTrianglesRigLocal"],
        role,
        finger,
    )
    return {
        "names": names,
        "rootRigLocalMeters": bones[0].head.copy(),
        "lengthsMeters": lengths,
        "restDirections": rest_directions,
        "surfaceRigLocalMeters": surface,
        "outwardNormalRigLocal": outward,
        "targetRigLocalMeters": target,
        "pointsRigLocalMeters": points,
        "solveReport": solve_report,
    }


def apply_landmark_digit_solve(
    rig: bpy.types.Object,
    side: str,
    role: str,
    finger: str,
    fixture: dict[str, object],
    pole_hint: Vector,
    prepared_solve: dict[str, object] | None = None,
) -> dict[str, object]:
    plan = prepared_solve or prepare_landmark_digit_solve(
        rig,
        side,
        role,
        finger,
        fixture,
        pole_hint,
    )
    names = plan["names"]
    bones = [rig.pose.bones.get(name) for name in names]
    if any(bone is None or bone.vector.length <= 1e-6 for bone in bones):
        raise RuntimeError(f"Rev51 prepared digit chain changed: {role}/{finger}")
    lengths = plan["lengthsMeters"]
    rest_directions = plan["restDirections"]
    surface = plan["surfaceRigLocalMeters"]
    outward = plan["outwardNormalRigLocal"]
    target = plan["targetRigLocalMeters"]
    points = plan["pointsRigLocalMeters"]
    solve_report = plan["solveReport"]
    root_error = (bones[0].head - plan["rootRigLocalMeters"]).length
    current_lengths = [float(bone.vector.length) for bone in bones]
    preapply_length_error = max(
        abs(actual - expected)
        for actual, expected in zip(current_lengths, lengths)
    )
    if (
        root_error > VLR7_DIGIT_WAYPOINT_GATE_METERS
        or preapply_length_error > VLR7_DIGIT_LENGTH_GATE_METERS
    ):
        raise RuntimeError(
            "Rev51 prepared digit geometry changed before application: "
            f"role={role} finger={finger} root={root_error:.9f} "
            f"length={preapply_length_error:.9f}"
        )
    for bone_name, start, end in zip(names, points[:-1], points[1:]):
        bone = rig.pose.bones[bone_name]
        head_error = (bone.head - start).length
        if head_error > VLR7_DIGIT_WAYPOINT_GATE_METERS:
            raise RuntimeError(
                "Rev44 digit parent moved off its waypoint: "
                f"bone={bone_name} error={head_error:.6f}"
            )
        rotate_pose_bone_to_direction(rig, bone_name, (end - start).normalized())
    bones = [rig.pose.bones[name] for name in names]
    waypoint_errors = [
        (bones[0].tail - points[1]).length,
        (bones[1].tail - points[2]).length,
    ]
    tip = bones[2].tail.copy()
    target_error = (tip - target).length
    tip_surface_error = (tip - surface).length
    if max([*waypoint_errors, target_error]) > VLR7_DIGIT_WAYPOINT_GATE_METERS:
        raise RuntimeError(
            "Rev44 digit solve missed an exterior waypoint: "
            f"role={role} finger={finger} waypoints={waypoint_errors} "
            f"target={target_error:.6f}"
        )
    if tip_surface_error > VLR7_DIGIT_TIP_SURFACE_GATE_METERS:
        raise RuntimeError(
            "Rev44 fingertip missed its VLR-7 surface: "
            f"role={role} finger={finger} error={tip_surface_error:.6f}"
        )
    final_lengths = [float(bone.vector.length) for bone in bones]
    length_errors = [
        abs(actual - expected)
        for actual, expected in zip(final_lengths, lengths)
    ]
    if max(length_errors) > VLR7_DIGIT_LENGTH_GATE_METERS:
        raise RuntimeError(
            f"Rev44 digit solve changed bone length: {role}/{finger}/{length_errors}"
        )
    directions = [bone.vector.normalized() for bone in bones]
    joint_angles = [
        math.degrees(rest_directions[0].angle(directions[0])),
        math.degrees(directions[0].angle(directions[1])),
        math.degrees(directions[1].angle(directions[2])),
    ]
    if max(joint_angles) > VLR7_DIGIT_MAX_JOINT_DEGREES:
        raise RuntimeError(
            "Rev44 digit joint exceeds anatomical validation gate: "
            f"role={role} finger={finger} angles={joint_angles}"
        )
    return {
        "method": "explicit GLB fixture plus two exterior fixed-length waypoints",
        "role": role,
        "finger": finger,
        "bones": names,
        "iterations": solve_report["iterations"],
        "iterationLimit": solve_report["iterationLimit"],
        "fixedLengthSolve": solve_report,
        "lengthsMeters": lengths,
        "lengthErrorsMeters": length_errors,
        "waypointsRigLocalMeters": [vector_values(value) for value in points[1:3]],
        "waypointErrorsMeters": waypoint_errors,
        "targetErrorMeters": target_error,
        "tipSurfaceErrorMeters": tip_surface_error,
        "jointAnglesDegrees": joint_angles,
        "wrapDegrees": sum(joint_angles),
        "fixture": {
            key: value
            for key, value in fixture.items()
            if key not in {
                "surfaceRigLocalMeters",
                "outwardNormalRigLocal",
                "targetRigLocalMeters",
                "clearanceTrianglesRigLocal",
            }
        },
        "clearanceMesh": {
            "name": fixture["clearanceMeshName"],
            "primitiveCount": fixture["clearanceMeshPrimitiveCount"],
            "triangleCount": fixture["clearanceMeshTriangleCount"],
        },
        "surfaceRigLocalMeters": vector_values(surface),
        "targetRigLocalMeters": vector_values(target),
        "outwardNormalRigLocal": vector_values(outward),
    }


def build_weapon_bvh(
    rig: bpy.types.Object,
    weapon: dict[str, object],
    include_names: set[str] | None = None,
) -> tuple[BVHTree, int]:
    vertices = []
    polygons = []
    rig_inverse = rig.matrix_world.inverted_safe()
    for obj in weapon["objects"]:
        if obj.type != "MESH" or (
            include_names is not None and obj.name not in include_names
        ):
            continue
        transform = rig_inverse @ obj.matrix_world
        offset = len(vertices)
        vertices.extend(transform @ vertex.co for vertex in obj.data.vertices)
        obj.data.calc_loop_triangles()
        polygons.extend(
            tuple(offset + int(index) for index in triangle.vertices)
            for triangle in obj.data.loop_triangles
        )
    if not vertices or not polygons:
        raise RuntimeError(f"Rev44 weapon BVH is empty: include={include_names}")
    return BVHTree.FromPolygons(vertices, polygons, all_triangles=True), len(polygons)


def segment_bvh_hit(
    bvh: BVHTree,
    start: Vector,
    end: Vector,
) -> tuple[Vector, float] | None:
    segment = end - start
    length = segment.length
    if length <= 1e-6:
        raise RuntimeError("Rev44 digit centerline segment is degenerate")
    direction = segment / length
    epsilon = min(0.00005, length * 0.1)
    result = bvh.ray_cast(start + direction * epsilon, direction, length - epsilon)
    location, _normal, _index, distance = result
    if location is None or distance is None:
        return None
    return location, float(distance + epsilon)


def validate_landmark_digit_set(
    rig: bpy.types.Object,
    weapon: dict[str, object],
    contacts: dict[str, Vector | float],
    digit_reports: dict[str, dict[str, dict[str, object]]],
    fixtures: dict[str, dict[str, dict[str, object]]],
) -> dict[str, object]:
    weapon_bvh, weapon_triangles = build_weapon_bvh(rig, weapon)
    trigger_bvh, trigger_triangles = build_weapon_bvh(
        rig,
        weapon,
        {VLR7_TRIGGER_GUARD_NAME},
    )
    result = {
        "weaponBvhTriangles": weapon_triangles,
        "triggerGuardBvhTriangles": trigger_triangles,
        "roles": {},
    }
    order = ("index", "middle", "ring", "pinky")
    for role, role_fixture in VLR7_DIGIT_FIXTURES.items():
        side = role_fixture["side"]
        mcp_report = validate_mcp_ordering(rig, side, role)
        tips = {
            finger: rig.pose.bones[f"{finger}_03_{side}"].tail.copy()
            for finger in order
        }
        mcp_points = {
            finger: rig.pose.bones[f"{finger}_01_{side}"].head.copy()
            for finger in order
        }
        tip_spacings = [
            (tips[order[index]] - tips[order[index + 1]]).length
            for index in range(len(order) - 1)
        ]
        minimum_tip_spacing = min(tip_spacings)
        if minimum_tip_spacing < VLR7_ADJACENT_TIP_SPACING_GATE_METERS:
            raise RuntimeError(
                "Rev44 adjacent fingertip spacing is below gate: "
                f"role={role} spacing={minimum_tip_spacing:.6f}"
            )
        fixture_axis = (
            fixtures[role]["index"]["surfaceRigLocalMeters"]
            - fixtures[role]["pinky"]["surfaceRigLocalMeters"]
        ).normalized()
        tip_projections = {
            finger: float(tips[finger].dot(fixture_axis)) for finger in order
        }
        if not all(
            tip_projections[order[index]] > tip_projections[order[index + 1]]
            for index in range(len(order) - 1)
        ):
            raise RuntimeError(
                f"Rev44 solved fingertip order crossed for {role}: {tip_projections}"
            )
        collision_witnesses = {}
        for finger in (*order, "thumb"):
            contact = fixtures[role][finger]["surfaceRigLocalMeters"]
            hits = []
            for joint in range(1, 4):
                bone = rig.pose.bones[f"{finger}_0{joint}_{side}"]
                hit = segment_bvh_hit(weapon_bvh, bone.head, bone.tail)
                if hit is None:
                    continue
                location, distance = hit
                contact_distance = (location - contact).length
                if contact_distance > VLR7_DIGIT_CONTACT_PAD_RADIUS_METERS:
                    raise RuntimeError(
                        "Rev44 digit centerline intersects VLR-7 outside its contact pad: "
                        f"role={role} finger={finger} joint={joint} "
                        f"distanceToPad={contact_distance:.6f}"
                    )
                hits.append({
                    "joint": joint,
                    "distanceAlongSegmentMeters": distance,
                    "distanceToContactPadMeters": contact_distance,
                })
            collision_witnesses[finger] = hits
        gripping = (
            ("middle", "ring", "pinky")
            if role == "dominant"
            else order
        )
        minimum_wrap = min(
            float(digit_reports[role][finger]["wrapDegrees"])
            for finger in gripping
        )
        wrap_gate = (
            VLR7_DOMINANT_WRAP_GATE_DEGREES
            if role == "dominant"
            else VLR7_SUPPORT_WRAP_GATE_DEGREES
        )
        if minimum_wrap < wrap_gate:
            raise RuntimeError(
                "Rev44 grip wrap is below gate: "
                f"role={role} wrap={minimum_wrap:.3f} gate={wrap_gate:.3f}"
            )
        thumb_direction = rig.pose.bones[f"thumb_01_{side}"].vector.normalized()
        finger_mean = sum(
            (
                rig.pose.bones[f"{finger}_01_{side}"].vector.normalized()
                for finger in order
            ),
            Vector((0.0, 0.0, 0.0)),
        )
        if finger_mean.length <= 1e-6:
            raise RuntimeError(f"Rev44 finger mean is degenerate: {role}")
        thumb_opposition = math.degrees(thumb_direction.angle(finger_mean.normalized()))
        if thumb_opposition < VLR7_THUMB_OPPOSITION_GATE_DEGREES:
            raise RuntimeError(
                "Rev44 thumb opposition is below gate: "
                f"role={role} angle={thumb_opposition:.3f}"
            )
        trigger_report = None
        if role == "dominant":
            index_bones = [
                rig.pose.bones[f"index_0{joint}_{side}"]
                for joint in range(1, 4)
            ]
            trigger_hits = [
                joint
                for joint, bone in enumerate(index_bones, start=1)
                if segment_bvh_hit(trigger_bvh, bone.head, bone.tail) is not None
            ]
            if trigger_hits:
                raise RuntimeError(
                    f"Rev44 dominant index enters trigger-guard BVH: {trigger_hits}"
                )
            shelf_axis = (
                contacts["weaponRotation"] @ VLR7_DOMINANT_AXIS_SOURCE_LOCAL
            ).normalized()
            index_direction = (tips["index"] - mcp_points["index"]).normalized()
            alignment_dot = abs(index_direction.dot(shelf_axis))
            shelf_angle = math.degrees(math.acos(max(-1.0, min(1.0, alignment_dot))))
            index_wrap = float(digit_reports[role]["index"]["wrapDegrees"])
            if shelf_angle > VLR7_TRIGGER_SHELF_MAX_ANGLE_DEGREES:
                raise RuntimeError(
                    "Rev44 dominant index is not aligned to the trigger shelf: "
                    f"angle={shelf_angle:.3f}"
                )
            if index_wrap > VLR7_TRIGGER_INDEX_MAX_WRAP_DEGREES:
                raise RuntimeError(
                    "Rev44 dominant index curls into a trigger posture: "
                    f"wrap={index_wrap:.3f}"
                )
            trigger_report = {
                "triggerGuardIntersections": trigger_hits,
                "shelfAlignmentDegrees": shelf_angle,
                "shelfAlignmentGateDegrees": VLR7_TRIGGER_SHELF_MAX_ANGLE_DEGREES,
                "indexWrapDegrees": index_wrap,
                "indexWrapMaximumDegrees": VLR7_TRIGGER_INDEX_MAX_WRAP_DEGREES,
            }
        result["roles"][role] = {
            "mcpOrdering": mcp_report,
            "tipOrder": list(order),
            "tipProjections": tip_projections,
            "adjacentTipSpacingMeters": tip_spacings,
            "minimumAdjacentTipSpacingMeters": minimum_tip_spacing,
            "adjacentTipSpacingGateMeters": VLR7_ADJACENT_TIP_SPACING_GATE_METERS,
            "minimumWrapDegrees": minimum_wrap,
            "wrapGateDegrees": wrap_gate,
            "thumbOppositionDegrees": thumb_opposition,
            "thumbOppositionGateDegrees": VLR7_THUMB_OPPOSITION_GATE_DEGREES,
            "centerlineContactPadHits": collision_witnesses,
            "outsidePadIntersections": 0,
            "triggerDiscipline": trigger_report,
        }
    return result


def apply_vlr7_grip_pose(
    target: bpy.types.Object,
    weapon: dict[str, object],
) -> dict[str, object]:
    """Rev43 palm-on-surface solve; Rev42 remains untouched below."""
    baseline_report = restore_vlr7_upper_body_baseline(target)
    contacts = position_vlr7_source_review_weapon(target, weapon)
    dominant_palm = -contacts["dominantSurfaceNormal"]
    support_palm = -contacts["supportSurfaceNormal"]
    dominant_frame = hand_contact_frame(
        dominant_palm,
        contacts["dominantFingerDirection"],
    )
    support_frame = hand_contact_frame(
        support_palm,
        contacts["supportFingerDirection"],
    )
    dominant_anchor, dominant_anchor_report = verified_palm_anchor_local(
        target,
        "hand_r",
        "r",
    )
    support_anchor, support_anchor_report = verified_palm_anchor_local(
        target,
        "hand_l",
        "l",
    )
    dominant_wrist_target = (
        contacts["dominantSurface"] - dominant_frame @ dominant_anchor
    )
    support_wrist_target = contacts["support"] - support_frame @ support_anchor
    support_clavicle_report = advance_clavicle_for_contact(
        target,
        "clavicle_l",
        "upperarm_l",
        "lowerarm_l",
        support_wrist_target,
        required_margin=VLR7_REQUIRED_REACH_MARGIN_METERS,
    )
    left_shoulder = target.pose.bones["upperarm_l"].head.copy()
    right_elbow_hint = target.pose.bones["lowerarm_r"].head.copy()
    left_elbow_hint = target.pose.bones["lowerarm_l"].head.copy()
    dominant_report = solve_two_bone_contact(
        target,
        "upperarm_r",
        "lowerarm_r",
        "hand_r",
        dominant_wrist_target,
        right_elbow_hint,
    )
    support_report = solve_two_bone_contact(
        target,
        "upperarm_l",
        "lowerarm_l",
        "hand_l",
        support_wrist_target,
        left_elbow_hint,
    )
    for role, report in (
        ("dominant", dominant_report),
        ("support", support_report),
    ):
        if report["reachMarginMeters"] < VLR7_REQUIRED_REACH_MARGIN_METERS:
            raise RuntimeError(
                "Rev43 wrist target violates the preserved reach margin: "
                f"role={role} margin={report['reachMarginMeters']:.6f} "
                f"required={VLR7_REQUIRED_REACH_MARGIN_METERS:.6f}"
            )
    dominant_wrist_error = dominant_report["errorMeters"]
    support_wrist_error = support_report["errorMeters"]
    dominant_orientation = orient_hand_to_contact_frame(
        target,
        "hand_r",
        dominant_frame,
    )
    support_orientation = orient_hand_to_contact_frame(
        target,
        "hand_l",
        support_frame,
    )
    dominant_contact = palm_contact_measurement(
        target,
        "hand_r",
        dominant_anchor,
        contacts["dominantSurface"],
    )
    support_contact = palm_contact_measurement(
        target,
        "hand_l",
        support_anchor,
        contacts["support"],
    )
    dominant_curl = apply_geometry_finger_curl(
        target,
        "r",
        "dominant",
        dominant_palm,
    )
    support_curl = apply_geometry_finger_curl(
        target,
        "l",
        "support",
        support_palm,
    )
    # Finger descendants must not disturb either oriented hand or palm anchor.
    dominant_contact = palm_contact_measurement(
        target,
        "hand_r",
        dominant_anchor,
        contacts["dominantSurface"],
    )
    support_contact = palm_contact_measurement(
        target,
        "hand_l",
        support_anchor,
        contacts["support"],
    )
    dominant_report.update({
        "errorMeters": dominant_contact["errorMeters"],
        "palmContactErrorMeters": dominant_contact["errorMeters"],
        "wristTargetErrorMeters": dominant_wrist_error,
        "wristTargetMeters": vector_values(dominant_wrist_target),
        "surfaceContactMeters": vector_values(contacts["dominantSurface"]),
        "palmAnchor": dominant_anchor_report,
        "palmContact": dominant_contact,
        "wristOrientation": dominant_orientation,
        "fingerCurl": dominant_curl,
        "clearanceWitnesses": finger_clearance_witnesses(
            target,
            "r",
            contacts["dominantSurface"],
            contacts["dominantSurfaceNormal"],
        ),
    })
    support_report.update({
        "errorMeters": support_contact["errorMeters"],
        "palmContactErrorMeters": support_contact["errorMeters"],
        "wristTargetErrorMeters": support_wrist_error,
        "wristTargetMeters": vector_values(support_wrist_target),
        "surfaceContactMeters": vector_values(contacts["support"]),
        "palmAnchor": support_anchor_report,
        "palmContact": support_contact,
        "wristOrientation": support_orientation,
        "fingerCurl": support_curl,
        "clearanceWitnesses": finger_clearance_witnesses(
            target,
            "l",
            contacts["support"],
            contacts["supportSurfaceNormal"],
        ),
    })

    primary_from_support_shoulder = (
        contacts["dominantMarker"] - left_shoulder
    ).length
    stock_error = (contacts["stock"] - contacts["stockTarget"]).length
    if stock_error > 0.002:
        raise RuntimeError(f"Rev43 stock missed shoulder target: {stock_error:.6f}")
    # Preserve Rev42 muzzle and sightline gates against the original center
    # marker; moving the palm to the right-side surface must not redefine aim.
    weapon_axis = contacts["muzzle"] - contacts["dominantMarker"]
    forward_projection = weapon_axis.dot(contacts["desiredForward"])
    if forward_projection < 0.90:
        raise RuntimeError(
            f"Rev43 muzzle is not sufficiently forward: {forward_projection:.6f}"
        )
    head = target.pose.bones.get("Head") or target.pose.bones.get("head")
    if head is None:
        raise RuntimeError("Rev43 head bone is missing")
    segment_length_squared = weapon_axis.length_squared
    t = max(0.0, min(
        1.0,
        (head.head - contacts["dominantMarker"]).dot(weapon_axis)
        / segment_length_squared,
    ))
    sightline_clearance = (
        head.head - (contacts["dominantMarker"] + weapon_axis * t)
    ).length
    if sightline_clearance < 0.075:
        raise RuntimeError(
            f"Rev43 rifle axis crowds the head: {sightline_clearance:.6f}"
        )
    return {
        "upperBodyBaseline": baseline_report,
        "dominant": dominant_report,
        "support": support_report,
        "supportClavicle": support_clavicle_report,
        "primaryGripDistanceFromSupportShoulderMeters": (
            primary_from_support_shoulder
        ),
        "dominantContact": {
            "node": VLR7_STOCK_NAME,
            "primitive": VLR7_DOMINANT_CONTACT_PRIMITIVE,
            "triangle": VLR7_DOMINANT_CONTACT_TRIANGLE,
            "surfaceOffsetFromCenterMarkerSourceMeters": vector_values(
                VLR7_DOMINANT_SURFACE_OFFSET_SOURCE_LOCAL
            ),
            "outwardNormalSourceLocal": vector_values(
                VLR7_DOMINANT_SURFACE_NORMAL_SOURCE_LOCAL
            ),
            "palmNormalSourceLocal": vector_values(
                -VLR7_DOMINANT_SURFACE_NORMAL_SOURCE_LOCAL
            ),
            "fingerDirectionSourceLocal": vector_values(
                VLR7_DOMINANT_FINGER_SOURCE_LOCAL
            ),
        },
        "supportContact": {
            "node": "KYX_VLR7_REVIEW_RECEIVER_HANDGUARD",
            "primitive": VLR7_SUPPORT_CONTACT_PRIMITIVE,
            "triangle": VLR7_SUPPORT_CONTACT_TRIANGLE,
            "indices": list(VLR7_SUPPORT_CONTACT_INDICES),
            "barycentric": list(VLR7_SUPPORT_CONTACT_BARYCENTRIC),
            "outwardNormalSourceLocal": vector_values(
                VLR7_SUPPORT_SURFACE_NORMAL_SOURCE_LOCAL
            ),
            "palmNormalSourceLocal": vector_values(
                -VLR7_SUPPORT_SURFACE_NORMAL_SOURCE_LOCAL
            ),
            "fingerDirectionSourceLocal": vector_values(
                VLR7_SUPPORT_FINGER_SOURCE_LOCAL
            ),
        },
        "supportContactCandidateLocalMeters": list(
            VLR7_SUPPORT_CONTACT_CANDIDATE_LOCAL_METERS
        ),
        "stockShoulderErrorMeters": stock_error,
        "weaponScale": float(contacts["scale"]),
        "muzzleFromDominantMeters": weapon_axis.length,
        "muzzleForwardProjectionMeters": forward_projection,
        "headToRifleAxisMeters": sightline_clearance,
        "internalMuzzleShortfallMeters": (
            contacts["muzzle"] - contacts["internalMuzzle"]
        ).length,
        "authorityToVisualMuzzleMeters": (
            contacts["muzzle"] - contacts["visualMuzzle"]
        ).length,
        "contactGateMeters": VLR7_PALM_CONTACT_TOLERANCE_METERS,
        "wristSwingGateDegrees": VLR7_MAX_WRIST_SWING_DEGREES,
        "wristTwistGateDegrees": VLR7_MAX_WRIST_TWIST_DEGREES,
        "requiredReachMarginMeters": VLR7_REQUIRED_REACH_MARGIN_METERS,
        "operationOrder": [
            "restoreUpperBodyBaseline",
            "positionHashPinnedVLR7AndDeriveSurfaceFrames",
            "derivePalmAnchorsAndOffsetWristTargets",
            "applyBoundedSupportClavicleReach",
            "solveTwoBoneArmsToWristTargets",
            "applyBoundedHandFrames",
            "verifyTransformedPalmContacts",
            "curlFingersTowardWeaponSurfaceFrames",
            "reverifyPalmContactsAndRecordClearanceWitnesses",
        ],
    }


def apply_vlr7_landmark_grip_pose(
    target: bpy.types.Object,
    weapon: dict[str, object],
) -> dict[str, object]:
    """Rev44 semantic-palm and explicit per-digit VLR-7 landmark solve."""
    global VLR7_ROUTE_TEMPORAL_STATE
    baseline_report = restore_vlr7_upper_body_baseline(target)
    contacts = position_vlr7_source_review_weapon(target, weapon)
    # Resolve and qualify every GLB triangle before modifying any arm or hand.
    # Rejected triangle-293 and unreachable triangle-200 seeds remain recorded,
    # never silently substituted for the exact triangle-74 barycentric shelf.
    fixtures = resolve_vlr7_landmark_fixtures(contacts)
    fixture_target_order_spacing = validate_rev51_fixture_target_order_spacing(
        fixtures
    )
    rev46_observe(
        "weapon_fixture_validation_post_validation",
        glbSha256=VLR7_REVIEW_GLB_SHA256,
        dominantIndexTriangle=int(
            VLR7_DIGIT_FIXTURES["dominant"]["digits"]["index"]["triangle"]
        ),
        roles=sorted(fixtures),
        fixturesPerRole={role: len(values) for role, values in fixtures.items()},
        fixtureSchema=VLR7_FIXTURE_SCHEMA_REPORT,
        fixtureTargetOrderSpacing=fixture_target_order_spacing,
    )
    dominant_anchor, dominant_anchor_report = verified_palm_anchor_local(
        target,
        "hand_r",
        "r",
    )
    support_anchor, support_anchor_report = verified_palm_anchor_local(
        target,
        "hand_l",
        "l",
    )
    dominant_frame, dominant_semantics = semantic_hand_contact_frame(
        target,
        "hand_r",
        "r",
        "dominant",
        contacts["dominantSurface"],
        contacts,
    )
    support_frame, support_semantics = semantic_hand_contact_frame(
        target,
        "hand_l",
        "l",
        "support",
        contacts["support"],
        contacts,
    )
    dominant_wrist_target = (
        contacts["dominantSurface"] - dominant_frame @ dominant_anchor
    )
    support_wrist_target = contacts["support"] - support_frame @ support_anchor
    support_clavicle_report = advance_clavicle_for_contact(
        target,
        "clavicle_l",
        "upperarm_l",
        "lowerarm_l",
        support_wrist_target,
        required_margin=VLR7_REQUIRED_REACH_MARGIN_METERS,
    )
    left_shoulder = target.pose.bones["upperarm_l"].head.copy()
    dominant_frame_fit = None
    if VLR7_ANATOMICAL_GRIP_VARIANT:
        dominant_report, dominant_frame, dominant_wrist_target, dominant_frame_fit = (
            solve_dominant_rev45_exact_normal_wrist(
                target,
                contacts["dominantSurface"],
                dominant_anchor,
                dominant_frame,
                (
                    contacts["weaponRotation"]
                    @ -VLR7_DOMINANT_WRAP_SOURCE_LOCAL
                ).normalized(),
                target.pose.bones["lowerarm_r"].head.copy(),
            )
        )
    else:
        dominant_report = solve_two_bone_contact(
            target,
            "upperarm_r",
            "lowerarm_r",
            "hand_r",
            dominant_wrist_target,
            target.pose.bones["lowerarm_r"].head.copy(),
        )
    support_report = solve_two_bone_contact(
        target,
        "upperarm_l",
        "lowerarm_l",
        "hand_l",
        support_wrist_target,
        target.pose.bones["lowerarm_l"].head.copy(),
    )
    for role, report in (
        ("dominant", dominant_report),
        ("support", support_report),
    ):
        if report["reachMarginMeters"] < VLR7_REQUIRED_REACH_MARGIN_METERS:
            raise RuntimeError(
                "Rev44 wrist target violates the preserved reach margin: "
                f"role={role} margin={report['reachMarginMeters']:.6f} "
                f"required={VLR7_REQUIRED_REACH_MARGIN_METERS:.6f}"
            )
    dominant_wrist_error = dominant_report["errorMeters"]
    support_wrist_error = support_report["errorMeters"]
    dominant_orientation = orient_hand_to_contact_frame(
        target,
        "hand_r",
        dominant_frame,
    )
    support_orientation = orient_hand_to_contact_frame(
        target,
        "hand_l",
        support_frame,
    )
    dominant_contact = palm_contact_measurement(
        target,
        "hand_r",
        dominant_anchor,
        contacts["dominantSurface"],
    )
    support_contact = palm_contact_measurement(
        target,
        "hand_l",
        support_anchor,
        contacts["support"],
    )
    mcp_order_before = {
        "dominant": validate_mcp_ordering(target, "r", "dominant"),
        "support": validate_mcp_ordering(target, "l", "support"),
    }
    digit_reports = {"dominant": {}, "support": {}}
    digit_plans = {"dominant": {}, "support": {}}
    # Compute and clearance-gate every one of the ten paths before moving any
    # digit.  A late support-hand failure therefore cannot leave a partially
    # mutated dominant hand, and the final durable marker always identifies the
    # exact role/finger/geometry that failed.
    for role, side, source_depth in (
        ("dominant", "r", VLR7_DOMINANT_DEPTH_SOURCE_LOCAL),
        ("support", "l", VLR7_SUPPORT_DEPTH_SOURCE_LOCAL),
    ):
        pole = (contacts["weaponRotation"] @ source_depth).normalized()
        for finger in ("index", "middle", "ring", "pinky", "thumb"):
            finger_pole = pole.copy()
            if finger == "thumb":
                finger_pole.negate()
            fixture = fixtures[role][finger]
            root_bone = target.pose.bones.get(f"{finger}_01_{side}")
            rev46_observe(
                "digit_oriented_mesh_preflight_entry",
                role=role,
                finger=finger,
                side=side,
                rootRigLocalMeters=(
                    vector_values(root_bone.head)
                    if root_bone is not None
                    else None
                ),
                targetRigLocalMeters=vector_values(
                    fixture["targetRigLocalMeters"]
                ),
                surfaceRigLocalMeters=vector_values(
                    fixture["surfaceRigLocalMeters"]
                ),
                outwardNormalRigLocal=vector_values(
                    fixture["outwardNormalRigLocal"]
                ),
                mesh=fixture["clearanceMeshName"],
                meshPrimitiveCount=fixture["clearanceMeshPrimitiveCount"],
                meshTriangleCount=fixture["clearanceMeshTriangleCount"],
            )
            try:
                digit_plans[role][finger] = prepare_landmark_digit_solve(
                    target,
                    side,
                    role,
                    finger,
                    fixture,
                    finger_pole,
                )
            except BaseException as exc:
                rev46_observe(
                    "digit_oriented_mesh_preflight_failure",
                    role=role,
                    finger=finger,
                    exceptionType=type(exc).__name__,
                    exceptionMessage=str(exc),
                )
                raise
            solve_preflight_report = digit_plans[role][finger]["solveReport"]
            clearance_report = solve_preflight_report["orientedMeshClearance"]
            rev46_observe(
                "digit_oriented_mesh_preflight_pass",
                role=role,
                finger=finger,
                minimumSignedClearanceMeters=min(
                    float(value["signedClearanceMeters"])
                    for value in clearance_report.values()
                ),
                clearance=clearance_report,
                rejectedRev47TargetPlaneWitnessMeters=(
                    solve_preflight_report[
                        "rejectedRev47TargetPlaneWitnessMeters"
                    ]
                ),
                selectedPathOrientedMeshIntersections=solve_preflight_report[
                    "selectedPathOrientedMeshIntersections"
                ],
                routeFamilySchema=solve_preflight_report["routeFamilySchema"],
                routeFamilyCandidateCount=solve_preflight_report[
                    "routeFamilyCandidateCount"
                ],
                routeFamilyOrder=solve_preflight_report["routeFamilyOrder"],
                candidateReports=solve_preflight_report["candidateReports"],
                validCandidateIds=solve_preflight_report["validCandidateIds"],
                selectedCandidateId=solve_preflight_report[
                    "selectedCandidateId"
                ],
                previousCandidateId=solve_preflight_report[
                    "previousCandidateId"
                ],
                selectionMethod=solve_preflight_report["selectionMethod"],
                temporalShapeDeltaMeters=solve_preflight_report[
                    "temporalShapeDeltaMeters"
                ],
                temporalShapeDeltaGateMeters=solve_preflight_report[
                    "temporalShapeDeltaGateMeters"
                ],
                jointAnglesDegrees=solve_preflight_report[
                    "jointAnglesDegrees"
                ],
                jointMarginsDegrees=solve_preflight_report[
                    "jointMarginsDegrees"
                ],
                wrapDegrees=solve_preflight_report["wrapDegrees"],
                handednessPoleDot=solve_preflight_report[
                    "handednessPoleDot"
                ],
            )
    rev46_observe(
        "all_digit_oriented_mesh_preflights_post_validation",
        roles=["dominant", "support"],
        digitCount=sum(len(values) for values in digit_plans.values()),
        clearanceGateMeters=VLR7_ORIENTED_MESH_CLEARANCE_GATE_METERS,
        mathContract=VLR7_ORIENTED_MESH_MATH_REPORT,
        fixtureTargetOrderSpacing=fixture_target_order_spacing,
    )
    for role, side, source_depth in (
        ("dominant", "r", VLR7_DOMINANT_DEPTH_SOURCE_LOCAL),
        ("support", "l", VLR7_SUPPORT_DEPTH_SOURCE_LOCAL),
    ):
        pole = (contacts["weaponRotation"] @ source_depth).normalized()
        for finger in ("index", "middle", "ring", "pinky", "thumb"):
            finger_pole = pole.copy()
            if finger == "thumb":
                finger_pole.negate()
            digit_reports[role][finger] = apply_landmark_digit_solve(
                target,
                side,
                role,
                finger,
                fixtures[role][finger],
                finger_pole,
                digit_plans[role][finger],
            )
    # Digit descendants must not disturb the wrists or verified palm anchors.
    dominant_contact = palm_contact_measurement(
        target,
        "hand_r",
        dominant_anchor,
        contacts["dominantSurface"],
    )
    support_contact = palm_contact_measurement(
        target,
        "hand_l",
        support_anchor,
        contacts["support"],
    )
    rev46_observe(
        "digit_bvh_gates_entry",
        dominantPalmContactErrorMeters=float(dominant_contact["errorMeters"]),
        supportPalmContactErrorMeters=float(support_contact["errorMeters"]),
        solvedDigitCount=sum(len(values) for values in digit_reports.values()),
    )
    digit_gates = validate_landmark_digit_set(
        target,
        weapon,
        contacts,
        digit_reports,
        fixtures,
    )
    pending_temporal_state = {
        (role, finger): digit_plans[role][finger]["solveReport"][
            "pendingTemporalState"
        ]
        for role in ("dominant", "support")
        for finger in ("index", "middle", "ring", "pinky", "thumb")
    }
    if len(pending_temporal_state) != 10:
        raise RuntimeError(
            "Rev51 temporal commit does not cover all ten digits"
        )
    VLR7_ROUTE_TEMPORAL_STATE.update(pending_temporal_state)
    rev46_observe(
        "all_digit_route_temporal_state_commit_post_validation",
        action=VLR7_ROUTE_ACTION_NAME,
        digitCount=len(pending_temporal_state),
        selectedCandidateIds={
            f"{role}/{finger}": state["candidateId"]
            for (role, finger), state in sorted(pending_temporal_state.items())
        },
        shapeDeltaGateMeters=VLR7_ROUTE_TEMPORAL_SHAPE_DELTA_GATE_METERS,
    )
    dominant_report.update({
        "errorMeters": dominant_contact["errorMeters"],
        "palmContactErrorMeters": dominant_contact["errorMeters"],
        "wristTargetErrorMeters": dominant_wrist_error,
        "wristTargetMeters": vector_values(dominant_wrist_target),
        "surfaceContactMeters": vector_values(contacts["dominantSurface"]),
        "palmAnchor": dominant_anchor_report,
        "palmContact": dominant_contact,
        "wristOrientation": dominant_orientation,
        "semanticFrameFit": dominant_frame_fit,
        "semanticHandBasis": dominant_semantics,
        "mcpOrderingBeforeDigitSolve": mcp_order_before["dominant"],
        "digits": digit_reports["dominant"],
        "digitGates": digit_gates["roles"]["dominant"],
    })
    support_report.update({
        "errorMeters": support_contact["errorMeters"],
        "palmContactErrorMeters": support_contact["errorMeters"],
        "wristTargetErrorMeters": support_wrist_error,
        "wristTargetMeters": vector_values(support_wrist_target),
        "surfaceContactMeters": vector_values(contacts["support"]),
        "palmAnchor": support_anchor_report,
        "palmContact": support_contact,
        "wristOrientation": support_orientation,
        "semanticHandBasis": support_semantics,
        "mcpOrderingBeforeDigitSolve": mcp_order_before["support"],
        "digits": digit_reports["support"],
        "digitGates": digit_gates["roles"]["support"],
    })

    primary_from_support_shoulder = (
        contacts["dominantMarker"] - left_shoulder
    ).length
    stock_error = (contacts["stock"] - contacts["stockTarget"]).length
    if stock_error > 0.002:
        raise RuntimeError(f"Rev44 stock missed shoulder target: {stock_error:.6f}")
    weapon_axis = contacts["muzzle"] - contacts["dominantMarker"]
    forward_projection = weapon_axis.dot(contacts["desiredForward"])
    if forward_projection < 0.90:
        raise RuntimeError(
            f"Rev44 muzzle is not sufficiently forward: {forward_projection:.6f}"
        )
    head = target.pose.bones.get("Head") or target.pose.bones.get("head")
    if head is None:
        raise RuntimeError("Rev44 head bone is missing")
    segment_length_squared = weapon_axis.length_squared
    t = max(0.0, min(
        1.0,
        (head.head - contacts["dominantMarker"]).dot(weapon_axis)
        / segment_length_squared,
    ))
    sightline_clearance = (
        head.head - (contacts["dominantMarker"] + weapon_axis * t)
    ).length
    if sightline_clearance < 0.075:
        raise RuntimeError(
            f"Rev44 rifle axis crowds the head: {sightline_clearance:.6f}"
        )
    fixture_report = {
        role: {
            finger: {
                key: (
                    vector_values(value)
                    if isinstance(value, Vector)
                    else value
                )
                for key, value in fixture.items()
            }
            for finger, fixture in role_fixtures.items()
        }
        for role, role_fixtures in fixtures.items()
    }
    return {
        "upperBodyBaseline": baseline_report,
        "dominant": dominant_report,
        "support": support_report,
        "supportClavicle": support_clavicle_report,
        "primaryGripDistanceFromSupportShoulderMeters": primary_from_support_shoulder,
        "digitFixtures": fixture_report,
        "fixtureTargetOrderSpacing": fixture_target_order_spacing,
        "digitGates": digit_gates,
        "stockShoulderErrorMeters": stock_error,
        "weaponScale": float(contacts["scale"]),
        "muzzleFromDominantMeters": weapon_axis.length,
        "muzzleForwardProjectionMeters": forward_projection,
        "headToRifleAxisMeters": sightline_clearance,
        "internalMuzzleShortfallMeters": (
            contacts["muzzle"] - contacts["internalMuzzle"]
        ).length,
        "authorityToVisualMuzzleMeters": (
            contacts["muzzle"] - contacts["visualMuzzle"]
        ).length,
        "contactGateMeters": VLR7_PALM_CONTACT_TOLERANCE_METERS,
        "fingertipSurfaceGateMeters": VLR7_DIGIT_TIP_SURFACE_GATE_METERS,
        "waypointGateMeters": VLR7_DIGIT_WAYPOINT_GATE_METERS,
        "wristSwingGateDegrees": VLR7_MAX_WRIST_SWING_DEGREES,
        "wristTwistGateDegrees": VLR7_MAX_WRIST_TWIST_DEGREES,
        "requiredReachMarginMeters": VLR7_REQUIRED_REACH_MARGIN_METERS,
        "operationOrder": [
            "restoreUpperBodyBaseline",
            "positionHashPinnedVLR7AtExactPoint86Scale",
            "resolveAndQualifyExplicitGlbDigitTrianglesBeforeRigMutation",
            "deriveSemanticHandBasesFromMcpMeasurementsAndWeaponWADFrames",
            "derivePalmAnchorsAndOffsetWristTargets",
            "applyBoundedSupportClavicleReach",
            (
                "solveDominantExactPalmNormalInPlaneCorrectionAndTwoBoneArm"
                if VLR7_ANATOMICAL_GRIP_VARIANT
                else "solveTwoBoneArmsToWristTargets"
            ),
            "applyBoundedSemanticHandFrames",
            "verifyTransformedPalmContacts",
            "solveEachDigitThroughTwoExteriorFixedLengthWaypoints",
            "validateTipWaypointWrapOppositionSpacingOrderAndTriggerDiscipline",
            "rejectAllCenterlineWeaponIntersectionsOutsideContactPads",
            "reverifyPalmContactsAndPreservedWeaponAuthorityGates",
        ],
    }


def apply_vlr7_constrained_pose(
    target: bpy.types.Object,
    weapon: dict[str, object],
) -> dict[str, object]:
    if VLR7_LANDMARK_GRIP_VARIANT:
        return apply_vlr7_landmark_grip_pose(target, weapon)
    if VLR7_GRIP_VARIANT:
        return apply_vlr7_grip_pose(target, weapon)
    baseline_report = restore_vlr7_upper_body_baseline(target)
    contacts = position_vlr7_source_review_weapon(target, weapon)
    support_clavicle_report = advance_clavicle_for_contact(
        target,
        "clavicle_l",
        "upperarm_l",
        "lowerarm_l",
        contacts["support"],
    )
    right_shoulder = target.pose.bones["upperarm_r"].head.copy()
    left_shoulder = target.pose.bones["upperarm_l"].head.copy()
    right_elbow_hint = target.pose.bones["lowerarm_r"].head.copy()
    left_elbow_hint = target.pose.bones["lowerarm_l"].head.copy()
    dominant_report = solve_two_bone_contact(
        target,
        "upperarm_r",
        "lowerarm_r",
        "hand_r",
        contacts["dominant"],
        right_elbow_hint,
    )
    support_report = solve_two_bone_contact(
        target,
        "upperarm_l",
        "lowerarm_l",
        "hand_l",
        contacts["support"],
        left_elbow_hint,
    )
    primary_from_support_shoulder = (
        contacts["dominant"] - left_shoulder
    ).length
    stock_error = (contacts["stock"] - contacts["stockTarget"]).length
    if stock_error > 0.002:
        raise RuntimeError(f"Rev42 stock missed shoulder target: {stock_error:.6f}")
    weapon_axis = contacts["muzzle"] - contacts["dominant"]
    forward_projection = weapon_axis.dot(contacts["desiredForward"])
    if forward_projection < 0.90:
        raise RuntimeError(
            f"Rev42 muzzle is not sufficiently forward: {forward_projection:.6f}"
        )
    head = target.pose.bones.get("Head") or target.pose.bones.get("head")
    if head is None:
        raise RuntimeError("Rev42 head bone is missing")
    segment = contacts["muzzle"] - contacts["dominant"]
    segment_length_squared = segment.length_squared
    t = max(0.0, min(
        1.0,
        (head.head - contacts["dominant"]).dot(segment)
        / segment_length_squared,
    ))
    sightline_clearance = (
        head.head - (contacts["dominant"] + segment * t)
    ).length
    if sightline_clearance < 0.075:
        raise RuntimeError(
            f"Rev42 rifle axis crowds the head: {sightline_clearance:.6f}"
        )
    return {
        "upperBodyBaseline": baseline_report,
        "dominant": dominant_report,
        "support": support_report,
        "supportClavicle": support_clavicle_report,
        "primaryGripDistanceFromSupportShoulderMeters": (
            primary_from_support_shoulder
        ),
        "supportContactCandidateLocalMeters": list(
            VLR7_SUPPORT_CONTACT_CANDIDATE_LOCAL_METERS
        ),
        "stockShoulderErrorMeters": stock_error,
        "weaponScale": float(contacts["scale"]),
        "muzzleFromDominantMeters": (
            contacts["muzzle"] - contacts["dominant"]
        ).length,
        "muzzleForwardProjectionMeters": forward_projection,
        "headToRifleAxisMeters": sightline_clearance,
        "internalMuzzleShortfallMeters": (
            contacts["muzzle"] - contacts["internalMuzzle"]
        ).length,
        "authorityToVisualMuzzleMeters": (
            contacts["muzzle"] - contacts["visualMuzzle"]
        ).length,
    }


def create_target_rig(
    source_rig: bpy.types.Object,
    idle_action: bpy.types.Action,
) -> bpy.types.Object:
    target = source_rig.copy()
    target.data = source_rig.data.copy()
    target.name = RIG_NAME
    target.data.name = RIG_NAME + "_ARMATURE"
    bpy.context.scene.collection.objects.link(target)
    target.animation_data_clear()

    assign_action(source_rig, idle_action, 0)
    for bone in target.pose.bones:
        bone.rotation_mode = "QUATERNION"
    match_source_pose(target, source_rig)

    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.context.view_layer.objects.active = target
    bpy.ops.object.mode_set(mode="EDIT")
    hand = target.data.edit_bones.get("hand_r")
    if hand is None:
        raise RuntimeError("Quaternius right-hand bone missing")
    socket = target.data.edit_bones.new("socket_weapon_r")
    socket.parent = hand
    socket.use_connect = False
    socket.use_deform = False
    socket.head = hand.tail.copy()
    socket.tail = socket.head + Vector((0.0, -0.16, 0.0))
    bpy.ops.object.mode_set(mode="OBJECT")
    if len(target.data.bones) != 66:
        raise RuntimeError(f"Expected 66 target bones, found {len(target.data.bones)}")
    return target


def key_target_pose(target: bpy.types.Object, frame: int) -> None:
    for bone in target.pose.bones:
        bone.keyframe_insert(data_path="location", frame=frame, group=bone.name)
        bone.keyframe_insert(
            data_path="rotation_quaternion",
            frame=frame,
            group=bone.name,
        )
        bone.keyframe_insert(data_path="scale", frame=frame, group=bone.name)


def retarget_actions(
    target: bpy.types.Object,
    libraries: dict[str, tuple[bpy.types.Object, dict]],
    weapon_review: dict[str, object] | None = None,
) -> list[dict]:
    global VLR7_ROUTE_ACTION_NAME, VLR7_ROUTE_TEMPORAL_STATE
    records = []
    target.animation_data_clear()
    animation_data = target.animation_data_create()
    animation_data.use_nla = False
    built_actions = {}
    kevin_directions = None
    if VLR7_CONSTRAINED_VARIANT:
        if weapon_review is None:
            raise RuntimeError("Rev42 requires the actual VLR-7 source weapon")
        overlay_rig = None
        overlay_action = None
    elif KEVIN_RIFLE_VARIANT:
        overlay_library_name = "kevin"
        overlay_source_name = KEVIN_RIFLE_POSE_TOKEN
        overlay_rig, overlay_actions = libraries[overlay_library_name]
        matches = [
            action for action in overlay_actions.values()
            if overlay_source_name.lower() in action.name.lower()
        ]
        if len(matches) != 1:
            raise RuntimeError(
                "Human Soldier AssaultRifle hold action is ambiguous: "
                f"{[action.name for action in matches]}"
            )
        overlay_action = matches[0]
        assign_action(
            overlay_rig,
            overlay_action,
            int(round(float(overlay_action.frame_range[0]))),
        )
        kevin_directions = capture_kevin_rifle_directions(overlay_rig)
    else:
        overlay_library_name, overlay_source_name = WEAPON_READY_OVERLAY_SOURCE
        overlay_rig, overlay_actions = libraries[overlay_library_name]
        overlay_action = overlay_actions.get(overlay_source_name)
        if WEAPON_READY_VARIANT and overlay_action is None:
            raise RuntimeError(
                f"Weapon-ready overlay source missing: "
                f"{overlay_library_name}/{overlay_source_name}"
            )
    overlay_end = (
        int(round(float(overlay_action.frame_range[1])))
        if overlay_action is not None
        else 0
    )
    overlay_bones = (
        weapon_ready_overlay_bone_names(overlay_rig)
        if (
            WEAPON_READY_VARIANT
            and not KEVIN_RIFLE_VARIANT
            and not VLR7_CONSTRAINED_VARIANT
        )
        else set()
    )
    overlay_anchor_name = (
        weapon_ready_overlay_anchor_name(overlay_rig)
        if (
            WEAPON_READY_VARIANT
            and not KEVIN_RIFLE_VARIANT
            and not VLR7_CONSTRAINED_VARIANT
        )
        else ""
    )
    for output_name, (library_name, source_name) in MOTION_SOURCES.items():
        source_rig, source_actions = libraries[library_name]
        source_action = source_actions.get(source_name)
        if source_action is None:
            raise RuntimeError(f"Motion source missing: {library_name}/{source_name}")
        end = int(round(float(source_action.frame_range[1])))
        output_action = bpy.data.actions.new(output_name)
        animation_data.action = output_action
        contact_samples = []
        if (
            VLR7_LANDMARK_GRIP_VARIANT
            and output_name in WEAPON_READY_OVERLAY_OUTPUTS
        ):
            VLR7_ROUTE_ACTION_NAME = output_name
            VLR7_ROUTE_TEMPORAL_STATE = {}
            rev46_observe(
                "route_temporal_state_action_reset",
                outputAction=output_name,
                sourceLibrary=library_name,
                sourceAction=source_name,
                expectedDigitCount=10,
            )
        rev46_observe(
            "action_entry",
            outputAction=output_name,
            sourceLibrary=library_name,
            sourceAction=source_name,
            sourceFrameEnd=end,
        )
        for source_frame in range(0, end + 1):
            rev46_observe(
                "action_frame_entry",
                outputAction=output_name,
                sourceLibrary=library_name,
                sourceAction=source_name,
                sourceFrame=source_frame,
                outputFrame=source_frame + 1,
            )
            overlay_pose = None
            overlay_anchor_matrix = None
            if (
                WEAPON_READY_VARIANT
                and output_name in WEAPON_READY_OVERLAY_OUTPUTS
            ):
                if not KEVIN_RIFLE_VARIANT and not VLR7_CONSTRAINED_VARIANT:
                    normalized = source_frame / max(1, end)
                    overlay_frame = int(round(normalized * overlay_end))
                    assign_action(overlay_rig, overlay_action, overlay_frame)
                    overlay_anchor_matrix = overlay_rig.pose.bones[
                        overlay_anchor_name
                    ].matrix.copy()
                    overlay_pose = capture_armature_space_pose(
                        overlay_rig,
                        overlay_bones,
                    )
            assign_action(source_rig, source_action, source_frame)
            # The extra socket has no motion-source counterpart. Match the
            # 65 donor bones parent-first so children are evaluated against the
            # correct current parent rather than the previous sample.
            match_source_pose(target, source_rig, {"socket_weapon_r"})
            if (
                VLR7_CONSTRAINED_VARIANT
                and output_name in WEAPON_READY_OVERLAY_OUTPUTS
                and weapon_review is not None
            ):
                try:
                    contact_samples.append(
                        apply_vlr7_constrained_pose(target, weapon_review)
                    )
                except RuntimeError as exc:
                    raise RuntimeError(
                        "Rev42 contact solve failed: "
                        f"output={output_name} library={library_name} "
                        f"source={source_name} sourceFrame={source_frame} "
                        f"outputFrame={source_frame + 1}: {exc}"
                    ) from exc
            elif (
                KEVIN_RIFLE_VARIANT
                and output_name in WEAPON_READY_OVERLAY_OUTPUTS
                and kevin_directions is not None
            ):
                apply_kevin_rifle_pose_overlay(target, kevin_directions)
            elif overlay_pose is not None and overlay_anchor_matrix is not None:
                apply_anchor_relative_pose_overlay(
                    target,
                    overlay_anchor_matrix,
                    overlay_pose,
                    overlay_anchor_name,
                )
            key_target_pose(target, source_frame + 1)
        rev45_correction_continuity = (
            validate_rev45_correction_continuity(contact_samples)
            if VLR7_ANATOMICAL_GRIP_VARIANT and contact_samples
            else None
        )
        rev46_observe(
            "action_frames_complete",
            outputAction=output_name,
            sampledFrames=end + 1,
            contactSamples=len(contact_samples),
        )
        output_action["kyx_motion_source"] = (
            f"Quaternius {library_name.upper()} Standard/{source_name}"
        )
        output_action["kyx_license"] = "CC0-1.0"
        output_action["kyx_candidate"] = CANDIDATE_ID
        if output_name in WEAPON_READY_OVERLAY_OUTPUTS and WEAPON_READY_VARIANT:
            output_action["kyx_upper_body_overlay"] = (
                VLR7_CONTACT_SOLVE_LABEL
                if VLR7_CONSTRAINED_VARIANT
                else (
                    "Kevin Iglesias Human Soldier/WeaponHold_AssaultRifle01"
                    if KEVIN_RIFLE_VARIANT
                    else "Quaternius UAL1 Standard/Pistol_Idle_Loop"
                )
            )
        built_actions[output_name] = output_action
        records.append({
            "name": output_name,
            "sourceLibrary": library_name,
            "sourceClip": source_name,
            "frameRange": [1, end + 1],
            "sampledEveryIntegerFrame": True,
            "upperBodyOverlay": (
                (
                    VLR7_CONTACT_SOLVE_LABEL
                    if VLR7_CONSTRAINED_VARIANT
                    else (
                        "Kevin Iglesias Human Soldier/WeaponHold_AssaultRifle01"
                        if KEVIN_RIFLE_VARIANT
                        else "Quaternius UAL1 Standard/Pistol_Idle_Loop"
                    )
                )
                if WEAPON_READY_VARIANT
                and output_name in WEAPON_READY_OVERLAY_OUTPUTS
                else None
            ),
            "weaponContact": (
                {
                    "samples": len(contact_samples),
                    "maximumDominantErrorMeters": max(
                        sample["dominant"]["errorMeters"]
                        for sample in contact_samples
                    ),
                    "maximumSupportErrorMeters": max(
                        sample["support"]["errorMeters"]
                        for sample in contact_samples
                    ),
                    **(
                        {
                            "maximumDominantPalmContactErrorMeters": max(
                                sample["dominant"]["palmContactErrorMeters"]
                                for sample in contact_samples
                            ),
                            "maximumSupportPalmContactErrorMeters": max(
                                sample["support"]["palmContactErrorMeters"]
                                for sample in contact_samples
                            ),
                            "maximumDominantWristTargetErrorMeters": max(
                                sample["dominant"]["wristTargetErrorMeters"]
                                for sample in contact_samples
                            ),
                            "maximumSupportWristTargetErrorMeters": max(
                                sample["support"]["wristTargetErrorMeters"]
                                for sample in contact_samples
                            ),
                            "maximumWristSwingDegrees": max(
                                sample[role]["wristOrientation"]["swingDegrees"]
                                for sample in contact_samples
                                for role in ("dominant", "support")
                            ),
                            "maximumWristTwistDegrees": max(
                                sample[role]["wristOrientation"]["twistDegrees"]
                                for sample in contact_samples
                                for role in ("dominant", "support")
                            ),
                            "palmContactGateMeters": (
                                VLR7_PALM_CONTACT_TOLERANCE_METERS
                            ),
                            "wristSwingGateDegrees": (
                                VLR7_MAX_WRIST_SWING_DEGREES
                            ),
                            "wristTwistGateDegrees": (
                                VLR7_MAX_WRIST_TWIST_DEGREES
                            ),
                            "requiredReachMarginMeters": (
                                VLR7_REQUIRED_REACH_MARGIN_METERS
                            ),
                            "minimumDominantReachMarginMeters": min(
                                sample["dominant"]["reachMarginMeters"]
                                for sample in contact_samples
                            ),
                            "operationOrder": contact_samples[0][
                                "operationOrder"
                            ],
                        }
                        if VLR7_MATERIAL_VARIANT
                        else {}
                    ),
                    **(
                        {
                            "fixtureGlbSha256": VLR7_REVIEW_GLB_SHA256,
                            "maximumFingertipSurfaceErrorMeters": max(
                                sample[role]["digits"][finger][
                                    "tipSurfaceErrorMeters"
                                ]
                                for sample in contact_samples
                                for role in ("dominant", "support")
                                for finger in (
                                    "index", "middle", "ring", "pinky", "thumb"
                                )
                            ),
                            "maximumWaypointErrorMeters": max(
                                max(sample[role]["digits"][finger][
                                    "waypointErrorsMeters"
                                ])
                                for sample in contact_samples
                                for role in ("dominant", "support")
                                for finger in (
                                    "index", "middle", "ring", "pinky", "thumb"
                                )
                            ),
                            "minimumDominantWrapDegrees": min(
                                sample["dominant"]["digitGates"][
                                    "minimumWrapDegrees"
                                ]
                                for sample in contact_samples
                            ),
                            "minimumSupportWrapDegrees": min(
                                sample["support"]["digitGates"][
                                    "minimumWrapDegrees"
                                ]
                                for sample in contact_samples
                            ),
                            "minimumThumbOppositionDegrees": min(
                                sample[role]["digitGates"][
                                    "thumbOppositionDegrees"
                                ]
                                for sample in contact_samples
                                for role in ("dominant", "support")
                            ),
                            "minimumAdjacentTipSpacingMeters": min(
                                sample[role]["digitGates"][
                                    "minimumAdjacentTipSpacingMeters"
                                ]
                                for sample in contact_samples
                                for role in ("dominant", "support")
                            ),
                            "outsideContactPadIntersections": max(
                                sample[role]["digitGates"][
                                    "outsidePadIntersections"
                                ]
                                for sample in contact_samples
                                for role in ("dominant", "support")
                            ),
                            "maximumTriggerShelfAlignmentDegrees": max(
                                sample["dominant"]["digitGates"][
                                    "triggerDiscipline"
                                ]["shelfAlignmentDegrees"]
                                for sample in contact_samples
                            ),
                            "fixtureContract": contact_samples[0]["digitFixtures"],
                            "rev45ExactNormalCorrection": (
                                rev45_correction_continuity
                                if VLR7_ANATOMICAL_GRIP_VARIANT
                                else None
                            ),
                        }
                        if VLR7_LANDMARK_GRIP_VARIANT
                        else {}
                    ),
                    **(
                        {
                            "dominantContact": contact_samples[0][
                                "dominantContact"
                            ],
                        }
                        if VLR7_GRIP_VARIANT
                        else {}
                    ),
                    "minimumSupportReachMarginMeters": min(
                        sample["support"]["reachMarginMeters"]
                        for sample in contact_samples
                    ),
                    "maximumSupportClavicleRotationDegrees": max(
                        sample["supportClavicle"]["rotationDegrees"]
                        for sample in contact_samples
                    ),
                    "maximumPreClavicleSupportDistanceMeters": max(
                        sample["supportClavicle"]["beforeDistanceMeters"]
                        for sample in contact_samples
                    ),
                    "maximumSupportTargetDistanceMeters": max(
                        sample["support"]["targetDistanceMeters"]
                        for sample in contact_samples
                    ),
                    "upperBodyBaselineBones": min(
                        sample["upperBodyBaseline"]["bones"]
                        for sample in contact_samples
                    ),
                    "maximumUpperBodyBaselineError": max(
                        sample["upperBodyBaseline"]["maximumBasisError"]
                        for sample in contact_samples
                    ),
                    "maximumPreResetLengthDeltaMeters": max(
                        sample["upperBodyBaseline"][
                            "maximumPreResetLengthDeltaMeters"
                        ]
                        for sample in contact_samples
                    ),
                    "maximumUpperBodyLengthDeltaMeters": max(
                        sample["upperBodyBaseline"][
                            "maximumLengthDeltaMeters"
                        ]
                        for sample in contact_samples
                    ),
                    "minimumHeadToRifleAxisMeters": min(
                        sample["headToRifleAxisMeters"]
                        for sample in contact_samples
                    ),
                    "minimumMuzzleForwardProjectionMeters": min(
                        sample["muzzleForwardProjectionMeters"]
                        for sample in contact_samples
                    ),
                    "maximumStockShoulderErrorMeters": max(
                        sample["stockShoulderErrorMeters"]
                        for sample in contact_samples
                    ),
                    "internalMuzzleShortfallMeters": max(
                        sample["internalMuzzleShortfallMeters"]
                        for sample in contact_samples
                    ),
                    "supportContact": {
                        "node": "KYX_VLR7_REVIEW_RECEIVER_HANDGUARD",
                        "mesh": "KYX_VLR7_REVIEW_RECEIVER_HANDGUARD_MESH",
                        "primitive": VLR7_SUPPORT_CONTACT_PRIMITIVE,
                        "triangle": VLR7_SUPPORT_CONTACT_TRIANGLE,
                        "indexBase": 0,
                        "indices": list(VLR7_SUPPORT_CONTACT_INDICES),
                        "barycentric": list(VLR7_SUPPORT_CONTACT_BARYCENTRIC),
                        "candidateLocalMeters": list(
                            VLR7_SUPPORT_CONTACT_CANDIDATE_LOCAL_METERS
                        ),
                        "candidateLocalSpace": (
                            "hash-pinned GLB root TRS before runtime 0.86 scale; "
                            "+X right, +Y up, -Z muzzle"
                        ),
                    },
                }
                if contact_samples
                else None
            ),
        })

    if VLR7_LANDMARK_GRIP_VARIANT:
        contact_actions = {
            record["name"]
            for record in records
            if record.get("weaponContact") is not None
        }
        if contact_actions != WEAPON_READY_OVERLAY_OUTPUTS:
            raise RuntimeError(
                "Rev44 must solve all six contact actions exactly: "
                f"expected={sorted(WEAPON_READY_OVERLAY_OUTPUTS)} "
                f"actual={sorted(contact_actions)}"
            )
        if any(
            int(record["weaponContact"]["samples"]) <= 0
            for record in records
            if record["name"] in contact_actions
        ):
            raise RuntimeError("Rev44 contact action has no sampled frames")

    animation_data.action = None
    target.animation_data_clear()
    animation_data = target.animation_data_create()
    animation_data.use_nla = True
    for name, action in built_actions.items():
        start, end = [float(value) for value in action.frame_range]
        track = animation_data.nla_tracks.new()
        track.name = name
        track.mute = False
        strip = track.strips.new(name, int(start), action)
        strip.action_frame_start = start
        strip.action_frame_end = end
        strip.frame_start = start
        strip.frame_end = end
        strip.blend_type = "REPLACE"
        strip.extrapolation = "NOTHING"
    animation_data.action = None
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = max(int(item[1]) for item in EXPECTED_ACTIONS.values())
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    assert_action_contract("retargeted")
    return records


WEIGHT_GROUP_MAP = {
    "hips": "pelvis",
    "spine": "spine_01",
    "chest": "spine_02",
    "neck": "neck_01",
    "head": "Head",
    "shoulder.L": "clavicle_l",
    "shoulder.R": "clavicle_r",
    "upper_arm.L": "upperarm_l",
    "upper_arm.R": "upperarm_r",
    "forearm.L": "lowerarm_l",
    "forearm.R": "lowerarm_r",
    "hand.L": "hand_l",
    "hand.R": "hand_r",
    "thigh.L": "thigh_l",
    "thigh.R": "thigh_r",
    "shin.L": "calf_l",
    "shin.R": "calf_r",
    "foot.L": "foot_l",
    "foot.R": "foot_r",
    "toe.L": "ball_l",
    "toe.R": "ball_r",
    "heel.L": "foot_l",
    "heel.R": "foot_r",
    "heel.02.L": "foot_l",
    "heel.02.R": "foot_r",
}

for side, suffix in (("L", "l"), ("R", "r")):
    for finger, target in (
        ("index", "index"),
        ("middle", "middle"),
        ("ring", "ring"),
        ("pinky", "pinky"),
        ("thumb", "thumb"),
    ):
        source_prefix = "f_" + finger if finger != "thumb" else "thumb"
        for segment in range(1, 4):
            WEIGHT_GROUP_MAP[
                f"{source_prefix}.{segment:02d}.{side}"
            ] = f"{target}_{segment:02d}_{suffix}"


def remap_donor_weights(
    obj: bpy.types.Object,
    rig: bpy.types.Object,
) -> dict:
    source_names = {group.index: group.name for group in obj.vertex_groups}
    mapped_by_vertex: dict[int, dict[str, float]] = {}
    unweighted = []
    for vertex in obj.data.vertices:
        accumulated = {}
        for assignment in vertex.groups:
            target_name = WEIGHT_GROUP_MAP.get(source_names.get(assignment.group, ""))
            if target_name is None or target_name not in rig.data.bones:
                continue
            accumulated[target_name] = (
                accumulated.get(target_name, 0.0) + float(assignment.weight)
            )
        total = sum(accumulated.values())
        if total <= 1e-8:
            unweighted.append(vertex.index)
            mapped_by_vertex[vertex.index] = {}
            continue
        mapped_by_vertex[vertex.index] = {
            target_name: weight / total
            for target_name, weight in accumulated.items()
        }

    topology_repaired = []
    nearest_repaired = []
    pelvis_fallback = []
    if WEAPON_READY_WEIGHT_REPAIR_VARIANT and unweighted:
        neighbors = {vertex.index: set() for vertex in obj.data.vertices}
        for edge in obj.data.edges:
            first, second = [int(value) for value in edge.vertices]
            neighbors[first].add(second)
            neighbors[second].add(first)
        weighted_indices = {
            index for index, weights in mapped_by_vertex.items() if weights
        }
        for vertex_index in unweighted:
            visited = {vertex_index}
            frontier = {vertex_index}
            candidates = set()
            while frontier and not candidates:
                expanded = {
                    neighbor
                    for current in frontier
                    for neighbor in neighbors[current]
                    if neighbor not in visited
                }
                visited.update(expanded)
                candidates = expanded & weighted_indices
                frontier = expanded
            repair_mode = "topology"
            if not candidates and weighted_indices:
                source_co = obj.data.vertices[vertex_index].co
                candidates = {
                    min(
                        weighted_indices,
                        key=lambda index: (
                            obj.data.vertices[index].co - source_co
                        ).length_squared,
                    )
                }
                repair_mode = "nearest"
            if candidates:
                source_co = obj.data.vertices[vertex_index].co
                repaired = {}
                for candidate_index in sorted(candidates):
                    distance = max(
                        (obj.data.vertices[candidate_index].co - source_co).length,
                        1e-5,
                    )
                    influence = 1.0 / distance
                    for target_name, weight in mapped_by_vertex[
                        candidate_index
                    ].items():
                        repaired[target_name] = (
                            repaired.get(target_name, 0.0) + weight * influence
                        )
                repaired_total = sum(repaired.values())
                mapped_by_vertex[vertex_index] = {
                    target_name: weight / repaired_total
                    for target_name, weight in repaired.items()
                }
                weighted_indices.add(vertex_index)
                if repair_mode == "topology":
                    topology_repaired.append(vertex_index)
                else:
                    nearest_repaired.append(vertex_index)
                continue
            mapped_by_vertex[vertex_index] = {"pelvis": 1.0}
            pelvis_fallback.append(vertex_index)
        if pelvis_fallback:
            raise RuntimeError(
                f"Weapon-ready weight repair left pelvis fallbacks on {obj.name}: "
                f"{pelvis_fallback}"
            )
    else:
        for vertex_index in unweighted:
            mapped_by_vertex[vertex_index] = {"pelvis": 1.0}
            pelvis_fallback.append(vertex_index)

    per_target: dict[str, dict[int, float]] = {}
    for vertex_index, weights in mapped_by_vertex.items():
        for target_name, weight in weights.items():
            per_target.setdefault(target_name, {})[vertex_index] = weight

    obj.vertex_groups.clear()
    for target_name, weights in per_target.items():
        group = obj.vertex_groups.new(name=target_name)
        for vertex_index, weight in weights.items():
            group.add([vertex_index], weight, "REPLACE")
    for modifier in list(obj.modifiers):
        if modifier.type == "ARMATURE":
            obj.modifiers.remove(modifier)
    modifier = obj.modifiers.new(name="KYX_REV40_UAL_ARMATURE", type="ARMATURE")
    modifier.object = rig
    obj.parent = rig
    return {
        "object": obj.name,
        "targetGroups": len(per_target),
        "unweightedVerticesDetected": len(unweighted),
        "unweightedVerticesRepairedByTopology": len(topology_repaired),
        "unweightedVerticesRepairedByNearest": len(nearest_repaired),
        "unweightedVerticesAssignedToPelvis": len(pelvis_fallback),
    }


def set_principled_value(material: bpy.types.Material, input_name: str, value) -> None:
    if not material.use_nodes or material.node_tree is None:
        return
    node = next(
        (item for item in material.node_tree.nodes if item.type == "BSDF_PRINCIPLED"),
        None,
    )
    socket = node.inputs.get(input_name) if node else None
    if socket is not None:
        socket.default_value = value


def prepare_materials(objects: list[bpy.types.Object]) -> dict[str, str]:
    material_map: dict[bpy.types.Material, bpy.types.Material] = {}
    names = {}
    material_profiles = {
        "CHARCOAL_GUNMETAL": ((0.010, 0.014, 0.018, 1.0), 0.02, 0.76),
        "RESTRAINED_BLUE_ARMOR": ((0.045, 0.085, 0.115, 1.0), 0.46, 0.40),
        "FITTED_GUNMETAL_GLOVES": ((0.018, 0.022, 0.026, 1.0), 0.04, 0.66),
        "CLEAN_KNEE_GUNMETAL": ((0.035, 0.055, 0.070, 1.0), 0.58, 0.34),
        "DARK_CYAN_BROAD_VISOR": ((0.005, 0.120, 0.180, 1.0), 0.10, 0.20),
    }
    for obj in objects:
        for index, source in enumerate(obj.data.materials):
            if source is None:
                continue
            if source not in material_map:
                target_prefix = (
                    "KYX_REV51_"
                    if VLR7_ORIENTED_CLEARANCE_VARIANT
                    else "KYX_REV47_"
                    if VLR7_DIAGNOSTIC_VARIANT
                    else "KYX_REV45_"
                    if VLR7_ANATOMICAL_GRIP_VARIANT
                    else "KYX_REV44_"
                    if VLR7_LANDMARK_GRIP_VARIANT
                    else "KYX_REV43_" if VLR7_GRIP_VARIANT else "KYX_REV40_"
                )
                material = source.copy()
                material.name = (
                    source.name
                    .replace("KYX_REV30_", target_prefix)
                    .replace("KYX_REV17_", target_prefix)
                )
                upper = material.name.upper()
                profile_key = next(
                    (key for key in material_profiles if key in upper),
                    "CHARCOAL_GUNMETAL",
                )
                color, metallic, roughness = material_profiles[profile_key]
                material.diffuse_color = color
                material.metallic = metallic
                material.roughness = roughness
                set_principled_value(material, "Base Color", color)
                set_principled_value(material, "Metallic IOR Level", metallic)
                set_principled_value(material, "Roughness", roughness)
                set_principled_value(material, "Emission Strength", 0.0)
                if profile_key == "DARK_CYAN_BROAD_VISOR":
                    set_principled_value(
                        material,
                        "Emission Color",
                        (0.0, 0.025, 0.040, 1.0),
                    )
                    set_principled_value(material, "Emission Strength", 0.35)
                material_map[source] = material
                names[source.name] = material.name
            obj.data.materials[index] = material_map[source]
    return names


def prepare_vlr7_review_materials(
    objects: list[bpy.types.Object],
) -> dict[str, str]:
    """Separate the review rifle from the character without changing geometry."""
    material_map: dict[bpy.types.Material, bpy.types.Material] = {}
    names = {}
    profiles = {
        "GLASS": ((0.0, 0.060, 0.090, 1.0), 0.08, 0.14),
        "BARREL": ((0.012, 0.015, 0.018, 1.0), 0.78, 0.28),
        "DETAIL": ((0.14, 0.17, 0.19, 1.0), 0.65, 0.30),
        "SCOPEHANDLE": ((0.018, 0.023, 0.028, 1.0), 0.68, 0.32),
        "MAIN": ((0.020, 0.028, 0.034, 1.0), 0.52, 0.44),
    }
    for obj in objects:
        if obj.type != "MESH":
            continue
        for index, source in enumerate(obj.data.materials):
            if source is None:
                continue
            if source not in material_map:
                upper = source.name.upper()
                profile_key = next(
                    (key for key in profiles if key in upper),
                    "MAIN",
                )
                color, metallic, roughness = profiles[profile_key]
                material = source.copy()
                material.name = (
                    f"KYX_REV51_VLR7_{profile_key}"
                    if VLR7_ORIENTED_CLEARANCE_VARIANT
                    else f"KYX_REV47_VLR7_{profile_key}"
                    if VLR7_DIAGNOSTIC_VARIANT
                    else f"KYX_REV45_VLR7_{profile_key}"
                    if VLR7_ANATOMICAL_GRIP_VARIANT
                    else f"KYX_REV44_VLR7_{profile_key}"
                    if VLR7_LANDMARK_GRIP_VARIANT
                    else f"KYX_REV43_VLR7_{profile_key}"
                )
                material.diffuse_color = color
                material.metallic = metallic
                material.roughness = roughness
                set_principled_value(material, "Base Color", color)
                set_principled_value(material, "Metallic IOR Level", metallic)
                set_principled_value(material, "Roughness", roughness)
                set_principled_value(material, "Emission Strength", 0.0)
                if profile_key == "GLASS":
                    set_principled_value(
                        material,
                        "Emission Color",
                        (0.0, 0.015, 0.025, 1.0),
                    )
                    set_principled_value(material, "Emission Strength", 0.25)
                material_map[source] = material
                names[source.name] = material.name
            obj.data.materials[index] = material_map[source]
    return names


def downsample_packed_detail_images() -> list[dict]:
    records = []
    for image in bpy.data.images:
        if not image.name.lower().startswith("kyx-rev30-"):
            continue
        before = [int(image.size[0]), int(image.size[1])]
        longest = max(before)
        if longest > 1024:
            scale = 1024.0 / longest
            width = max(1, int(round(before[0] * scale)))
            height = max(1, int(round(before[1] * scale)))
            image.scale(width, height)
        image.name = image.name.replace("kyx-rev30-", "kyx-rev40-")
        image.pack()
        records.append({
            "name": image.name,
            "before": before,
            "after": [int(image.size[0]), int(image.size[1])],
            "packed": image.packed_file is not None,
        })
    return records


def strengthen_assault_proportions(body: bpy.types.Object) -> dict:
    before = [vector.copy() for vector in (body.data.vertices[0].co,)]
    group_indices = {group.name: group.index for group in body.vertex_groups}
    torso_indices = {
        group_indices[name]
        for name in ("hips", "spine", "spine_01", "spine_02", "chest", "chest.001")
        if name in group_indices
    }
    shoulder_indices = {
        group_indices[name]
        for name in ("shoulder.L", "shoulder.R", "clavicle.L", "clavicle.R")
        if name in group_indices
    }
    limb_indices = {
        group_indices[name]
        for name in (
            "upper_arm.L",
            "upper_arm.R",
            "forearm.L",
            "forearm.R",
            "thigh.L",
            "thigh.R",
            "shin.L",
            "shin.R",
        )
        if name in group_indices
    }
    foot_indices = {
        group_indices[name]
        for name in (
            "foot.L",
            "foot.R",
            "toe.L",
            "toe.R",
            "heel.L",
            "heel.R",
            "heel.02.L",
            "heel.02.R",
            "foot_anchor.L",
            "foot_anchor.R",
        )
        if name in group_indices
    }

    def strongest_weight(vertex, indices: set[int]) -> float:
        return max(
            (assignment.weight for assignment in vertex.groups if assignment.group in indices),
            default=0.0,
        )

    changed = 0
    max_delta = 0.0
    for vertex in body.data.vertices:
        original = vertex.co.copy()
        x_abs = abs(original.x)
        torso_weight = strongest_weight(vertex, torso_indices)
        shoulder_weight = strongest_weight(vertex, shoulder_indices)
        limb_weight = strongest_weight(vertex, limb_indices)
        torso_mask = smoothstep(0.18, 0.72, torso_weight) * (
            1.0 - smoothstep(0.32, 0.72, limb_weight)
        )
        shoulder_mask = smoothstep(0.20, 0.72, shoulder_weight) * (
            1.0 - smoothstep(0.45, 0.82, limb_weight)
        )
        waist = band(original.z, 0.70, 1.08, 0.10) * (
            1.0 - smoothstep(0.31, 0.43, x_abs)
        ) * torso_mask
        chest = band(original.z, 1.00, 1.42, 0.10) * (
            1.0 - smoothstep(0.31, 0.43, x_abs)
        ) * torso_mask
        shoulder = shoulder_mask * band(original.z, 1.18, 1.58, 0.10)
        vertex.co.x *= 1.0 + 0.12 * waist + 0.09 * chest + 0.065 * shoulder
        vertex.co.y *= 1.0 + 0.05 * waist + 0.06 * chest + 0.05 * shoulder

        foot = smoothstep(0.25, 0.72, strongest_weight(vertex, foot_indices))
        if foot > 0.0:
            side_center = 0.105 if original.x >= 0.0 else -0.105
            vertex.co.x = side_center + (vertex.co.x - side_center) * (
                1.0 - 0.045 * foot
            )
            foot_center_y = -0.035
            vertex.co.y = foot_center_y + (vertex.co.y - foot_center_y) * (
                1.0 - 0.055 * foot
            )

        delta = (vertex.co - original).length
        if delta > 1e-8:
            changed += 1
            max_delta = max(max_delta, delta)
    body.data.update()
    del before
    return {
        "changedVertices": changed,
        "maxVertexDeltaMeters": round(max_delta, 6),
        "waistWidthGain": 0.12,
        "chestWidthGain": 0.09,
        "shoulderWidthGain": 0.065,
        "selection": "spine-pelvis and clavicle weights; limb-dominant vertices excluded",
        "footLocalReduction": [0.045, 0.055],
    }


def strengthen_helmet(head: bpy.types.Object) -> dict:
    changed = 0
    max_delta = 0.0
    for vertex in head.data.vertices:
        original = vertex.co.copy()
        vertex.co.x *= 1.025
        vertex.co.y *= 1.035
        delta = (vertex.co - original).length
        if delta > 1e-8:
            changed += 1
            max_delta = max(max_delta, delta)
    head.data.update()
    return {
        "changedVertices": changed,
        "maxVertexDeltaMeters": round(max_delta, 6),
        "widthScale": 1.025,
        "depthScale": 1.035,
    }


def make_armor_shell(body: bpy.types.Object) -> bpy.types.Object:
    shell = body.copy()
    shell.data = body.data.copy()
    shell.name = "KYX_REV40_ASSAULT_ARMOR_SHELL_SOURCE"
    body.users_collection[0].objects.link(shell)

    edit_mesh = bmesh.new()
    edit_mesh.from_mesh(shell.data)
    remove_faces = []
    for face in edit_mesh.faces:
        center = face.calc_center_median()
        keep = face.material_index in {1, 2, 3}
        if not keep:
            remove_faces.append(face)
    bmesh.ops.delete(edit_mesh, geom=remove_faces, context="FACES_ONLY")
    loose_vertices = [vertex for vertex in edit_mesh.verts if not vertex.link_faces]
    if loose_vertices:
        bmesh.ops.delete(edit_mesh, geom=loose_vertices, context="VERTS")
    edit_mesh.normal_update()
    for vertex in edit_mesh.verts:
        vertex.co += vertex.normal.normalized() * 0.008
    edit_mesh.to_mesh(shell.data)
    edit_mesh.free()
    shell.data.update(calc_edges=True)

    shell_material = bpy.data.materials.new("KYX_REV40_LAYERED_TITANIUM_ARMOR")
    shell_material.use_nodes = True
    shell_material.diffuse_color = (0.045, 0.075, 0.10, 1.0)
    shell_material.metallic = 0.82
    shell_material.roughness = 0.24
    set_principled_value(shell_material, "Base Color", shell_material.diffuse_color)
    set_principled_value(shell_material, "Metallic IOR Level", 0.82)
    set_principled_value(shell_material, "Roughness", 0.24)
    shell.data.materials.clear()
    shell.data.materials.append(shell_material)
    for polygon in shell.data.polygons:
        polygon.material_index = 0
    return shell


def apply_decimate(obj: bpy.types.Object, ratio: float) -> None:
    if ratio >= 0.999:
        return
    modifier = obj.modifiers.new(name="KYX_REV40_LOD_DECIMATE", type="DECIMATE")
    modifier.ratio = ratio
    modifier.use_collapse_triangulate = True
    while obj.modifiers.find(modifier.name) > 0:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.modifier_move_up(modifier=modifier.name)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    result = bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)
    if "FINISHED" not in result:
        raise RuntimeError(f"Could not apply LOD modifier to {obj.name}: {result}")


def clone_for_lod(
    source: bpy.types.Object,
    name: str,
    ratio: float,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    clone = source.copy()
    clone.data = source.data.copy()
    clone.name = name
    collection.objects.link(clone)
    clone.hide_render = False
    clone.hide_viewport = False
    clone.hide_set(False)
    apply_decimate(clone, ratio)
    clone.data.validate(clean_customdata=False)
    clone.data.update(calc_edges=True)
    return clone


def exporter_kwargs(path: Path) -> dict:
    requested = {
        "filepath": str(path),
        "check_existing": False,
        "export_format": "GLB",
        "use_selection": True,
        "export_copyright": (
            (
                "KYX.IO Assault Rev51 bounded-route review candidate"
                if VLR7_ORIENTED_CLEARANCE_VARIANT
                else "KYX.IO Assault Rev47 fixture-schema review candidate"
                if VLR7_DIAGNOSTIC_VARIANT
                else "KYX.IO Assault Rev45 anatomical-grip review candidate"
                if VLR7_ANATOMICAL_GRIP_VARIANT
                else "KYX.IO Assault Rev44 landmark-grip review candidate"
                if VLR7_LANDMARK_GRIP_VARIANT
                else (
                    "KYX.IO Assault Rev43 palm-grip review candidate"
                    if VLR7_GRIP_VARIANT
                    else "KYX.IO Assault Rev40 review candidate"
                )
            )
            + "; adapted from Sci-fi Soldier "
            "by Irondust under CC0 1.0. KYX Rev17 rig, sockets, animations, "
            "proportion fit, layered material treatment, LODs and integration."
        ),
        "export_texcoords": True,
        "export_normals": True,
        "export_tangents": False,
        "export_materials": "EXPORT",
        "export_attributes": True,
        "export_cameras": False,
        "export_extras": True,
        "export_yup": True,
        "export_apply": False,
        "export_animations": True,
        "export_frame_range": True,
        "export_frame_step": 1,
        "export_force_sampling": False,
        "export_optimize_animation_size": True,
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


def parse_glb(path: Path) -> dict:
    payload = path.read_bytes()
    magic, version, total_length = struct.unpack_from("<III", payload, 0)
    if magic != 0x46546C67 or version != 2 or total_length != len(payload):
        raise RuntimeError(f"Invalid GLB header: {path}")
    document = None
    offset = 12
    while offset < len(payload):
        chunk_length, chunk_type = struct.unpack_from("<II", payload, offset)
        offset += 8
        chunk = payload[offset : offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            document = json.loads(chunk.decode("utf-8").rstrip(" \t\r\n\x00"))
    if document is None:
        raise RuntimeError(f"GLB JSON chunk missing: {path}")
    accessors = document.get("accessors", [])
    triangles = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            if primitive.get("mode", 4) != 4:
                continue
            index_accessor = primitive.get("indices")
            count = (
                accessors[index_accessor].get("count", 0)
                if index_accessor is not None
                else accessors[primitive["attributes"]["POSITION"]].get("count", 0)
            )
            triangles += int(count) // 3
    return {
        "path": str(path.relative_to(WORKTREE)).replace("\\", "/"),
        "sha256": sha256(path),
        "bytes": len(payload),
        "nodes": len(document.get("nodes", [])),
        "meshes": len(document.get("meshes", [])),
        "primitives": sum(
            len(mesh.get("primitives", [])) for mesh in document.get("meshes", [])
        ),
        "triangles": triangles,
        "materials": len(document.get("materials", [])),
        "textures": len(document.get("textures", [])),
        "skins": len(document.get("skins", [])),
        "joints": max(
            (len(skin.get("joints", [])) for skin in document.get("skins", [])),
            default=0,
        ),
        "animations": [
            animation.get("name") for animation in document.get("animations", [])
        ],
    }


def look_at(obj: bpy.types.Object, target: tuple[float, float, float]) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def make_render_material(
    name: str,
    color: tuple[float, float, float, float],
    metallic: float,
    roughness: float,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.diffuse_color = color
    material.metallic = metallic
    material.roughness = roughness
    set_principled_value(material, "Base Color", color)
    set_principled_value(material, "Metallic IOR Level", metallic)
    set_principled_value(material, "Roughness", roughness)
    return material


def setup_render(
    lod_objects: list[bpy.types.Object],
    all_lods: list[bpy.types.Object],
    weapon_review: dict[str, object] | None = None,
):
    for obj in all_lods:
        obj.hide_render = obj not in lod_objects
    rig = bpy.data.objects[RIG_NAME]
    if rig.animation_data:
        for track in rig.animation_data.nla_tracks:
            track.mute = track.name != "KYX_REV17_TP_IDLE"
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    if weapon_review is not None:
        position_vlr7_source_review_weapon(rig, weapon_review)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 1100
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("KYX_REV40_RENDER_WORLD")
    scene.world.color = (0.006, 0.007, 0.009)

    bpy.ops.mesh.primitive_plane_add(size=14, location=(0.0, 0.0, -0.01))
    floor = bpy.context.object
    floor.name = "KYX_REV40_RENDER_FLOOR"
    floor.data.materials.append(
        make_render_material(
            "KYX_REV40_RENDER_FLOOR_MATERIAL",
            (0.028, 0.030, 0.034, 1.0),
            0.0,
            0.80,
        )
    )

    # The Irondust donor faces -Y. Keep every review camera on that side so
    # filenames such as `front` and `helmet-chest` describe the rendered view.
    bpy.ops.object.camera_add(location=(2.75, -4.8, 2.15))
    camera = bpy.context.object
    camera.data.lens = 58
    look_at(camera, (0.0, 0.0, 0.9))
    scene.camera = camera

    light_specs = [
        ((2.8, -3.6, 4.3), 650.0, 4.0, (1.0, 0.93, 0.86)),
        ((-3.0, -2.0, 2.7), 180.0, 4.5, (0.72, 0.80, 1.0)),
        ((0.6, 3.2, 3.6), 260.0, 3.0, (0.55, 0.70, 1.0)),
    ]
    for location, energy, size, color in light_specs:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        look_at(light, (0.0, 0.0, 0.95))
    return camera


def apply_neutral_contact_overrides(
    character_objects: list[bpy.types.Object],
    weapon_review: dict[str, object] | None,
) -> list[tuple[bpy.types.Object, int, bpy.types.Material | None]]:
    """Expose hand/weapon intersections without beauty-light material masking."""
    neutral_prefix = (
        "KYX_REV51"
        if VLR7_ORIENTED_CLEARANCE_VARIANT
        else "KYX_REV47"
        if VLR7_DIAGNOSTIC_VARIANT
        else "KYX_REV45"
        if VLR7_ANATOMICAL_GRIP_VARIANT
        else "KYX_REV44" if VLR7_LANDMARK_GRIP_VARIANT else "KYX_REV43"
    )
    character_matte = make_render_material(
        f"{neutral_prefix}_NEUTRAL_CHARACTER",
        (0.18, 0.18, 0.18, 1.0),
        0.0,
        0.72,
    )
    glove_matte = make_render_material(
        f"{neutral_prefix}_NEUTRAL_GLOVE",
        (0.30, 0.30, 0.30, 1.0),
        0.0,
        0.78,
    )
    visor_matte = make_render_material(
        f"{neutral_prefix}_NEUTRAL_VISOR",
        (0.10, 0.10, 0.10, 1.0),
        0.0,
        0.70,
    )
    rifle_matte = make_render_material(
        f"{neutral_prefix}_NEUTRAL_RIFLE",
        (0.055, 0.060, 0.065, 1.0),
        0.0,
        0.62,
    )
    overrides = []
    for obj in character_objects:
        for index, original in enumerate(obj.data.materials):
            upper = original.name.upper() if original is not None else ""
            replacement = (
                glove_matte
                if "GLOVE" in upper
                else visor_matte if "VISOR" in upper else character_matte
            )
            overrides.append((obj, index, original))
            obj.data.materials[index] = replacement
    if weapon_review is not None:
        for obj in weapon_review["objects"]:
            if obj.type != "MESH":
                continue
            for index, original in enumerate(obj.data.materials):
                overrides.append((obj, index, original))
                obj.data.materials[index] = rifle_matte
    bpy.context.view_layer.update()
    return overrides


def restore_neutral_contact_overrides(
    overrides: list[tuple[bpy.types.Object, int, bpy.types.Material | None]],
) -> None:
    for obj, index, original in overrides:
        obj.data.materials[index] = original
    bpy.context.view_layer.update()


def rev44_contact_camera_views(
    rig: bpy.types.Object,
    weapon_review: dict[str, object],
) -> list[tuple[str, Vector, Vector, int, bool, list[Vector]]]:
    """Derive macro cameras from the evaluated palms and digit landmarks."""
    contacts = position_vlr7_source_review_weapon(rig, weapon_review)
    rig_to_world = rig.matrix_world
    rig_rotation = rig_to_world.to_3x3().normalized()

    def hand_points(side: str, hand_name: str) -> list[Vector]:
        anchor, _report = verified_palm_anchor_local(rig, hand_name, side)
        local_points = [rig.pose.bones[hand_name].matrix @ anchor]
        local_points.extend(
            rig.pose.bones[f"{finger}_03_{side}"].tail.copy()
            for finger in ("index", "middle", "ring", "pinky", "thumb")
        )
        return [rig_to_world @ point for point in local_points]

    dominant = hand_points("r", "hand_r")
    support = hand_points("l", "hand_l")
    dominant_focus = sum(dominant, Vector((0.0, 0.0, 0.0))) / len(dominant)
    support_focus = sum(support, Vector((0.0, 0.0, 0.0))) / len(support)
    dominant_out = (
        rig_rotation
        @ (contacts["weaponRotation"] @ VLR7_DOMINANT_WRAP_SOURCE_LOCAL)
    ).normalized()
    support_out = (
        rig_rotation
        @ (contacts["weaponRotation"] @ VLR7_SUPPORT_WRAP_SOURCE_LOCAL)
    ).normalized()
    weapon_axis = (
        rig_rotation
        @ (contacts["weaponRotation"] @ VLR7_DOMINANT_AXIS_SOURCE_LOCAL)
    ).normalized()
    weapon_depth = dominant_out.cross(weapon_axis).normalized()
    trigger_points = [
        rig_to_world @ rig.pose.bones[f"index_0{joint}_r"].head
        for joint in range(1, 4)
    ] + [rig_to_world @ rig.pose.bones["index_03_r"].tail]
    neutral_points = [*dominant, *support]
    revision_slug = (
        "rev51"
        if VLR7_ORIENTED_CLEARANCE_VARIANT
        else "rev47"
        if VLR7_DIAGNOSTIC_VARIANT
        else "rev45" if VLR7_ANATOMICAL_GRIP_VARIANT else "rev44"
    )
    return [
        (
            f"kyx-{revision_slug}-vlr7-dominant-grip-macro.png",
            dominant_focus + dominant_out * 0.27 + weapon_depth * 0.07,
            dominant_focus,
            88,
            False,
            dominant,
        ),
        (
            f"kyx-{revision_slug}-vlr7-support-underside-macro.png",
            support_focus + support_out * 0.28 - weapon_axis * 0.055,
            support_focus,
            86,
            False,
            support,
        ),
        (
            f"kyx-{revision_slug}-vlr7-trigger-discipline-profile.png",
            sum(trigger_points, Vector((0.0, 0.0, 0.0))) / len(trigger_points)
            + weapon_depth * 0.29,
            sum(trigger_points, Vector((0.0, 0.0, 0.0))) / len(trigger_points),
            90,
            False,
            trigger_points,
        ),
        (
            f"kyx-{revision_slug}-vlr7-contact-neutral-macro.png",
            (dominant_focus + support_focus) * 0.5
            + dominant_out * 0.27
            + weapon_depth * 0.05,
            (dominant_focus + support_focus) * 0.5,
            88,
            True,
            neutral_points,
        ),
    ]


def validate_camera_projection(
    camera: bpy.types.Object,
    landmarks: list[Vector],
) -> dict[str, object]:
    scene = bpy.context.scene
    projected = [world_to_camera_view(scene, camera, point) for point in landmarks]
    failures = [
        index
        for index, point in enumerate(projected)
        if (
            point.z <= 0.0
            or point.x < VLR7_CAMERA_FRAME_MIN
            or point.x > VLR7_CAMERA_FRAME_MAX
            or point.y < VLR7_CAMERA_FRAME_MIN
            or point.y > VLR7_CAMERA_FRAME_MAX
        )
    ]
    if failures:
        raise RuntimeError(
            "Rev44 contact camera lost a required landmark: "
            f"indices={failures} projected="
            f"{[[float(p.x), float(p.y), float(p.z)] for p in projected]}"
        )
    width_pixels = (
        max(point.x for point in projected) - min(point.x for point in projected)
    ) * scene.render.resolution_x
    height_pixels = (
        max(point.y for point in projected) - min(point.y for point in projected)
    ) * scene.render.resolution_y
    cluster_fraction = max(width_pixels, height_pixels) / min(
        scene.render.resolution_x,
        scene.render.resolution_y,
    )
    if cluster_fraction < VLR7_CAMERA_CLUSTER_GATE:
        raise RuntimeError(
            "Rev44 contact camera cluster is too small: "
            f"fraction={cluster_fraction:.6f} gate={VLR7_CAMERA_CLUSTER_GATE:.6f}"
        )
    return {
        "landmarks": [
            [float(point.x), float(point.y), float(point.z)]
            for point in projected
        ],
        "frameBounds": [VLR7_CAMERA_FRAME_MIN, VLR7_CAMERA_FRAME_MAX],
        "clusterFractionOfShortDimension": cluster_fraction,
        "clusterGate": VLR7_CAMERA_CLUSTER_GATE,
        "allLandmarksInFront": True,
    }


def render_review(
    camera: bpy.types.Object,
    character_objects: list[bpy.types.Object],
    weapon_review: dict[str, object] | None,
) -> list[dict]:
    renders = []
    base_revision = (
        "kyx-rev51"
        if VLR7_ORIENTED_CLEARANCE_VARIANT
        else "kyx-rev47"
        if VLR7_DIAGNOSTIC_VARIANT
        else "kyx-rev45"
        if VLR7_ANATOMICAL_GRIP_VARIANT
        else "kyx-rev44"
        if VLR7_LANDMARK_GRIP_VARIANT
        else "kyx-rev43" if VLR7_GRIP_VARIANT else "kyx-rev40"
    )
    views = [
        (
            f"{base_revision}-assault-three-quarter.png",
            (2.75, -4.8, 2.15),
            (0.0, 0.0, 0.9),
            58,
            False,
            None,
        ),
        (
            f"{base_revision}-assault-front.png",
            (0.0, -5.2, 1.55),
            (0.0, 0.0, 0.9),
            58,
            False,
            None,
        ),
        (
            f"{base_revision}-assault-helmet-chest.png",
            (1.25, -2.7, 1.72),
            (0.0, 0.0, 1.35),
            58,
            False,
            None,
        ),
    ]
    if VLR7_LANDMARK_GRIP_VARIANT:
        if weapon_review is None:
            raise RuntimeError("Rev44 contact cameras require the VLR-7 fixture")
        views.extend(rev44_contact_camera_views(
            bpy.data.objects[RIG_NAME],
            weapon_review,
        ))
    elif VLR7_GRIP_VARIANT:
        views.extend([
            (
                "kyx-rev43-vlr7-contact-front.png",
                (0.0, -3.25, 1.55),
                (0.0, -0.28, 1.27),
                65,
                False,
                None,
            ),
            (
                "kyx-rev43-vlr7-dominant-stock.png",
                (-1.45, -2.35, 1.62),
                (-0.12, -0.18, 1.31),
                72,
                False,
                None,
            ),
            (
                "kyx-rev43-vlr7-support-handguard.png",
                (1.45, -2.45, 1.58),
                (0.0, -0.43, 1.32),
                72,
                False,
                None,
            ),
            (
                "kyx-rev43-vlr7-sightline-side.png",
                (-2.45, -0.8, 1.58),
                (0.0, -0.42, 1.35),
                65,
                False,
                None,
            ),
            (
                "kyx-rev43-vlr7-dominant-grip-rear.png",
                (1.65, 2.35, 1.60),
                (0.12, -0.18, 1.30),
                72,
                False,
                None,
            ),
            (
                "kyx-rev43-vlr7-contact-neutral.png",
                (0.0, -2.85, 1.50),
                (0.0, -0.27, 1.28),
                72,
                True,
                None,
            ),
        ])
    elif VLR7_CONSTRAINED_VARIANT:
        views.extend([
            (
                "kyx-rev42-vlr7-contact-front.png",
                (0.0, -3.25, 1.55),
                (0.0, -0.28, 1.27),
                58,
                False,
                None,
            ),
            (
                "kyx-rev42-vlr7-dominant-stock.png",
                (-1.45, -2.35, 1.62),
                (-0.12, -0.18, 1.31),
                58,
                False,
                None,
            ),
            (
                "kyx-rev42-vlr7-support-handguard.png",
                (1.45, -2.45, 1.58),
                (0.0, -0.43, 1.32),
                58,
                False,
                None,
            ),
            (
                "kyx-rev42-vlr7-sightline-side.png",
                (-2.45, -0.8, 1.58),
                (0.0, -0.42, 1.35),
                58,
                False,
                None,
            ),
        ])
    for filename, location, target, lens, neutral_contact, landmarks in views:
        camera.location = location
        camera.data.lens = lens
        look_at(camera, target)
        projection = (
            validate_camera_projection(camera, landmarks)
            if landmarks is not None
            else None
        )
        output = EVIDENCE_DIR / filename
        bpy.context.scene.render.filepath = str(output)
        overrides = (
            apply_neutral_contact_overrides(character_objects, weapon_review)
            if neutral_contact
            else []
        )
        rev46_observe(
            "render_view_boundary_entry",
            filename=filename,
            outputPath=str(output),
            neutralContact=bool(neutral_contact),
        )
        try:
            bpy.ops.render.render(write_still=True)
        finally:
            restore_neutral_contact_overrides(overrides)
        renders.append({
            "path": str(output.relative_to(WORKTREE)).replace("\\", "/"),
            "bytes": output.stat().st_size,
            "sha256": sha256(output),
            "neutralContactWitness": neutral_contact,
            "projectionGate": projection,
        })
        rev46_observe(
            "render_view_boundary_complete",
            filename=filename,
            outputPath=str(output),
            bytes=int(output.stat().st_size),
            sha256=sha256(output),
        )
    return renders


def write_notice() -> None:
    revision_label = (
        "Rev51"
        if VLR7_ORIENTED_CLEARANCE_VARIANT
        else "Rev47"
        if VLR7_DIAGNOSTIC_VARIANT
        else "Rev45"
        if VLR7_ANATOMICAL_GRIP_VARIANT
        else "Rev44"
        if VLR7_LANDMARK_GRIP_VARIANT
        else "Rev43" if VLR7_GRIP_VARIANT else "Rev40"
    )
    if VLR7_ORIENTED_CLEARANCE_VARIANT:
        weapon_ready_note = (
            "\nThe weapon-ready-v15 / Rev51 branch preserves Rev47 fixture "
            "schema validation, Rev46 fsync diagnostics, and Rev45's exact "
            "anatomical/mechanical thresholds. It moves only the dominant "
            "middle fixture to the audited same-face tri55 barycentric target "
            "and selects from a finite stable-ID exact-length route family. "
            "Every selectable route must pass full oriented-mesh point and "
            "segment clearance, joint, wrap, handedness, and temporal gates; "
            "all ten digits preflight before any digit moves or state commits. "
            "This is finite sampled evidence, not a global feasibility proof. "
            "Human Eye, browser/runtime integration, release, and deployment "
            "acceptance remain nonclaims.\n"
        )
    elif VLR7_DIAGNOSTIC_VARIANT:
        weapon_ready_note = (
            "\nThe weapon-ready-v11 / Rev47 branch preserves Rev46's exact "
            "anatomical solve, mechanical gates, fsync-backed diagnostics, and "
            "failure propagation. It adds a pure fail-closed fixture-schema "
            "validator and corrects the dominant-index telemetry path to "
            "dominant.digits.index.triangle. If the final report and completion "
            "signature are emitted, they establish one bounded technical "
            "Blender execution and its recorded gates. Human Eye, browser/runtime "
            "integration, release, and deployment acceptance remain explicit "
            "nonclaims. The weapon remains excluded from character GLBs.\n"
        )
    elif VLR7_ANATOMICAL_GRIP_VARIANT:
        weapon_ready_note = (
            "\nThe weapon-ready-v9 / Rev45 branch preserves Rev44's exact "
            "tri-74 dominant-index fixture, all ten digit landmarks, 0.86 VLR-7 "
            "scale, stock, authority muzzle, palm, reach, wrist, rig, action, "
            "LOD, skin, and package gates. It corrects the failed 65.698-degree "
            "dominant wrist sample only through the smallest bounded in-plane "
            "rotation about the exact requested palm normal, recomputes the "
            "wrist target, and re-solves the arm and digits. Requested/applied "
            "bases, all-frame extrema, and continuity are recorded. The weapon "
            "remains excluded from the character GLB exports.\n"
        )
    elif VLR7_LANDMARK_GRIP_VARIANT:
        weapon_ready_note = (
            "\nThe weapon-ready-v8 / Rev44 branch preserves the exact 0.86 "
            "VLR-7 scale, stock, authority muzzle, palm, reach, wrist, rig, "
            "action, LOD, skin, and package gates. It replaces Rev43's global "
            "curl profile with hash-pinned per-digit GLB triangle fixtures, "
            "two exterior fixed-length waypoints per digit, thumb opposition, "
            "trigger discipline, collision, ordering, wrap, spacing, and "
            "contact-frame camera gates. The corrected dominant-index fixture "
            "is the explicitly pinned triangle-74 barycentric tangent shelf; the "
            "rejected triangle-293 and unreachable triangle-200 seeds remain "
            "documented and cannot be substituted. The "
            "weapon remains excluded from the character GLB exports.\n"
        )
    elif VLR7_GRIP_VARIANT:
        weapon_ready_note = (
            "\nThe weapon-ready-v7 / Rev43 variant uses the exact hash-pinned "
            "Quaternius VLR-7 as a source-only contact fixture. It seats the real "
            "stock and authority muzzle, constrains measured palm landmarks to the "
            "pistol-grip and handguard surfaces through offset wrist targets, and "
            "adds bounded wrist orientation and geometry-directed finger curls. "
            "The weapon remains excluded from the character GLB exports.\n"
        )
    elif VLR7_CONSTRAINED_VARIANT:
        weapon_ready_note = (
            "\nThe weapon-ready-v6 / Rev42 variant uses the exact hash-pinned "
            "Quaternius VLR-7 review geometry as a source-only contact fixture. "
            "It places the real stock in the shoulder pocket, solves the dominant "
            "wrist to the pistol-grip marker, and solves the support wrist to a "
            "decoded receiver/handguard surface. The weapon remains excluded from "
            "the character GLB exports.\n"
        )
    elif KEVIN_RIFLE_VARIANT:
        weapon_ready_note = (
            "\nThe weapon-ready-v5 / Rev41 variant preserves the CC0 lower-body "
            "motion while adapting arm-chain directions from Kevin Iglesias' "
            "`HumanM@WeaponHold_AssaultRifle01` pose. That source remains governed "
            "by the Unity Standard Asset Store EULA and review-only pending the "
            "distribution-mode decision.\n"
        )
    elif WEAPON_READY_VARIANT:
        weapon_ready_note = (
            f"\nThe {ASSAULT_VARIANT} variant preserves lower-body source motion "
            "while overlaying arm chains from the same hash-pinned CC0 "
            "`Pistol_Idle_Loop` clip.\n"
        )
    else:
        weapon_ready_note = ""
    NOTICE_PATH.write_text(
        f"""# KYX.IO Assault {revision_label} donor notice

This review candidate directly reuses and boundedly adapts **Sci-fi Soldier**
by **Irondust**, published under **CC0 1.0** at
<https://opengameart.org/content/sci-fi-soldier>.

The exact mesh-source and archive record remains in the Rev30 donor notice.
{revision_label} reuses the preserved `Body`, `HandSimple`, and `Head2` geometry and its
normal/occlusion/specular detail instead of reconstructing the character from
procedural primitives.

The motion rig and sampled motion come from **Quaternius Universal Animation
Library Standard** and **Universal Animation Library 2 Standard**, also under
**CC0 1.0**, at <https://quaternius.com/packs/universalanimationlibrary.html>
and <https://quaternius.com/packs/universalanimationlibrary2.html>. The unchanged
archives, hashes, license snapshots, and static inventories remain outside Git
under `resource-quarantine-20260802/quaternius-universal-animation`.

KYX adds the non-deforming right-hand weapon socket, maps the donor's original
weights to the Quaternius humanoid hierarchy, samples only the required twelve
motions, retunes materials, downsamples web detail maps, removes the embedded
diagnostic rifle, and authors distinct LOD1/LOD2 review meshes.
{weapon_ready_note}

This is review-only source. It is not human accepted, release eligible, or
claimed as wholly original KYX geometry.
""",
        encoding="utf-8",
    )


def main() -> None:
    if Path(bpy.data.filepath).resolve() != SOURCE_BLEND.resolve():
        raise RuntimeError(f"Expected source blend {SOURCE_BLEND}, got {bpy.data.filepath}")
    if ASSAULT_VARIANT in {"weapon-ready-v2", "weapon-ready-v3"} and (
        MANIFEST_PATH.exists() or REPORT_PATH.exists()
    ):
        raise RuntimeError(
            f"{ASSAULT_VARIANT} is a sealed rejected evidence packet; "
            "use weapon-ready-v4 for the corrected overlay and weights"
        )
    if KEVIN_RIFLE_VARIANT and (MANIFEST_PATH.exists() or REPORT_PATH.exists()):
        raise RuntimeError(
            "Rev41 Human Soldier rifle-pose packet already exists; "
            "preserve it and use a new revision for any rerun"
        )
    if VLR7_CONSTRAINED_VARIANT and (
        MANIFEST_PATH.exists() or REPORT_PATH.exists()
    ):
        revision = (
            "Rev51 bounded-route"
            if VLR7_ORIENTED_CLEARANCE_VARIANT
            else "Rev47 fixture-schema"
            if VLR7_DIAGNOSTIC_VARIANT
            else "Rev45 anatomical-grip"
            if VLR7_ANATOMICAL_GRIP_VARIANT
            else "Rev44 landmark-grip"
            if VLR7_LANDMARK_GRIP_VARIANT
            else "Rev43 palm-grip" if VLR7_GRIP_VARIANT else "Rev42 constrained"
        )
        raise RuntimeError(
            f"{revision} VLR-7 packet already exists; preserve it and use a new "
            "revision for any rerun"
        )
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    rev46_observe(
        "main_entry",
        sourceBlend=str(SOURCE_BLEND),
        runtimeRoot=str(RUNTIME_DIR),
        evidenceRoot=str(EVIDENCE_DIR),
    )

    body = bpy.data.objects.get(BODY_SOURCE_NAME)
    hand = bpy.data.objects.get(HAND_SOURCE_NAME)
    head = bpy.data.objects.get(HEAD_SOURCE_NAME)
    if any(obj is None or obj.type != "MESH" for obj in (body, hand, head)):
        raise RuntimeError("Rev30 donor body, hand, or helmet is missing")
    source_objects = [body, hand, head]

    ual1_rig, ual1_actions = import_motion_library(UAL1_GLB, "UAL1 Standard")
    rev46_observe(
        "ual1_post_validation",
        boneCount=len(ual1_rig.data.bones),
        actionCount=len(ual1_actions),
        sourceSha256=sha256(UAL1_GLB),
    )
    ual2_rig, ual2_actions = import_motion_library(UAL2_GLB, "UAL2 Standard")
    rev46_observe(
        "ual2_post_validation",
        boneCount=len(ual2_rig.data.bones),
        actionCount=len(ual2_actions),
        sourceSha256=sha256(UAL2_GLB),
    )
    kevin_library = (
        append_kevin_rifle_pose_library(KEVIN_SOLDIER_BLEND)
        if KEVIN_RIFLE_VARIANT
        else None
    )
    weapon_review = (
        append_vlr7_source_review_weapon()
        if VLR7_CONSTRAINED_VARIANT
        else None
    )
    rev46_observe(
        "weapon_append_post_validation",
        appended=weapon_review is not None,
        objectCount=(len(weapon_review["objects"]) if weapon_review else 0),
        blendSha256=(VLR7_REVIEW_BLEND_SHA256 if weapon_review else None),
        glbSha256=(VLR7_REVIEW_GLB_SHA256 if weapon_review else None),
    )
    retained_source_actions = set(ual1_actions.values()) | set(ual2_actions.values())
    if kevin_library is not None:
        retained_source_actions |= set(kevin_library[1].values())
    for action in list(bpy.data.actions):
        if action not in retained_source_actions:
            bpy.data.actions.remove(action)
    rev46_observe(
        "initial_action_cleanup_complete",
        retainedActionCount=len(retained_source_actions),
        currentActionCount=len(bpy.data.actions),
    )

    idle_action = ual1_actions.get("Idle_Loop")
    if idle_action is None:
        raise RuntimeError("UAL1 Idle_Loop is missing")
    rev46_observe(
        "idle_lookup_post_validation",
        actionName=idle_action.name,
        frameRange=[float(value) for value in idle_action.frame_range],
    )
    rig = create_target_rig(ual1_rig, idle_action)
    rev46_observe(
        "target_rig_creation_post_validation",
        rigName=rig.name,
        boneCount=len(rig.data.bones),
    )
    libraries = {
        "ual1": (ual1_rig, ual1_actions),
        "ual2": (ual2_rig, ual2_actions),
    }
    if kevin_library is not None:
        libraries["kevin"] = kevin_library
    motion_records = retarget_actions(rig, libraries, weapon_review)
    for action in list(bpy.data.actions):
        if action.name not in EXPECTED_ACTIONS:
            bpy.data.actions.remove(action)
    assert_action_contract("isolated")
    rev46_observe(
        "final_action_cleanup_post_validation",
        actionCount=len(bpy.data.actions),
        expectedActions=sorted(EXPECTED_ACTIONS),
    )

    weight_reports = [remap_donor_weights(obj, rig) for obj in source_objects]
    kept = set(source_objects + [rig])
    if weapon_review is not None:
        kept.update(weapon_review["objects"])
    for obj in list(bpy.data.objects):
        if obj not in kept:
            bpy.data.objects.remove(obj, do_unlink=True)

    material_renames = prepare_materials(source_objects)
    weapon_review_material_renames = (
        prepare_vlr7_review_materials(weapon_review["objects"])
        if VLR7_MATERIAL_VARIANT and weapon_review is not None
        else {}
    )
    image_records = downsample_packed_detail_images()
    source_names = [source.name for source in source_objects]
    for source in source_objects:
        source.hide_render = True
        source.hide_viewport = True

    lod_objects: dict[int, list[bpy.types.Object]] = {}
    kind_by_source = {body: "body", hand: "hand", head: "head"}
    for lod, ratios in LOD_RATIOS.items():
        collection = bpy.data.collections.new(f"KYX_REV40_LOD{lod}")
        bpy.context.scene.collection.children.link(collection)
        objects = []
        for source in source_objects:
            kind = kind_by_source[source]
            clone = clone_for_lod(
                source,
                f"KYX_REV40_LOD{lod}_{kind.upper()}",
                ratios[kind],
                collection,
            )
            clone["kyx_candidate"] = CANDIDATE_ID
            clone["kyx_lod"] = lod
            clone["kyx_source"] = (
                "Irondust mesh / Quaternius motion and VLR-7 contact fixture; CC0-1.0"
                if VLR7_CONSTRAINED_VARIANT
                else (
                    "Irondust mesh / Quaternius motion (CC0-1.0) / "
                    "Kevin Iglesias rifle pose (Standard Asset Store EULA)"
                    if KEVIN_RIFLE_VARIANT
                    else "Irondust mesh / Quaternius motion; CC0-1.0"
                )
            )
            objects.append(clone)
        lod_objects[lod] = objects

    for source_name in source_names:
        source = bpy.data.objects.get(source_name)
        if source is not None:
            bpy.data.objects.remove(source, do_unlink=True)

    rig["kyx_candidate"] = CANDIDATE_ID
    rig["kyx_mesh_source"] = "Irondust Sci-fi Soldier CC0-1.0"
    rig["kyx_motion_source"] = "Quaternius UAL1/UAL2 Standard CC0-1.0"
    rig["kyx_motion_source_hash_ual1"] = sha256(UAL1_GLB)
    rig["kyx_motion_source_hash_ual2"] = sha256(UAL2_GLB)
    if KEVIN_RIFLE_VARIANT:
        rig["kyx_rifle_pose_source"] = (
            "Kevin Iglesias Human Soldier Animations FREE/"
            "HumanM@WeaponHold_AssaultRifle01"
        )
        rig["kyx_rifle_pose_source_hash"] = sha256(KEVIN_SOLDIER_BLEND)
        rig["kyx_rifle_pose_license"] = "Unity Standard Asset Store EULA"
    elif VLR7_CONSTRAINED_VARIANT:
        rig["kyx_rifle_pose_source"] = (
            "KYX VLR-7 Quaternius Rev1 explicit landmark grip solve"
            if VLR7_LANDMARK_GRIP_VARIANT
            else "KYX VLR-7 Quaternius Rev1 actual-geometry constrained contact solve"
        )
        rig["kyx_rifle_pose_source_hash"] = VLR7_REVIEW_BLEND_SHA256
        rig["kyx_rifle_pose_license"] = "CC0-1.0"
    rig["kyx_embedded_diagnostic_weapon"] = False
    rig.data.pose_position = "POSE"
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()
    assert_action_contract("adapted")

    write_notice()
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(MASTER_BLEND), check_existing=False)

    glb_reports = []
    expected_animations = sorted(EXPECTED_ACTIONS)
    for lod, objects in lod_objects.items():
        bpy.ops.object.select_all(action="DESELECT")
        for other_lod, other_objects in lod_objects.items():
            for obj in other_objects:
                hidden = other_lod != lod
                obj.hide_set(hidden)
                obj.hide_viewport = hidden
                obj.hide_render = hidden
                obj.select_set(not hidden)
        rig.hide_set(False)
        rig.hide_viewport = False
        rig.hide_render = False
        rig.select_set(True)
        bpy.context.view_layer.objects.active = rig
        path = RUNTIME_DIR / f"character-lod{lod}.glb"
        rev46_observe(
            "export_boundary_entry",
            lod=int(lod),
            outputPath=str(path),
        )
        result = bpy.ops.export_scene.gltf(**exporter_kwargs(path))
        if "FINISHED" not in result:
            raise RuntimeError(f"LOD{lod} export failed: {result}")
        report = parse_glb(path)
        if report["joints"] != 66:
            raise RuntimeError(f"LOD{lod} expected 66 joints, found {report['joints']}")
        if sorted(report["animations"]) != expected_animations:
            raise RuntimeError(f"LOD{lod} action set changed: {report['animations']}")
        if report["meshes"] != 3:
            raise RuntimeError(f"LOD{lod} expected three meshes, found {report['meshes']}")
        glb_reports.append(report)
        rev46_observe(
            "export_boundary_complete",
            lod=int(lod),
            outputPath=str(path),
            bytes=int(report["bytes"]),
            sha256=report["sha256"],
        )

    triangle_counts = [report["triangles"] for report in glb_reports]
    if not (triangle_counts[0] > triangle_counts[1] > triangle_counts[2]):
        raise RuntimeError(f"LOD triangle order is not strict: {triangle_counts}")
    if triangle_counts[1] > triangle_counts[0] * 0.65:
        raise RuntimeError(f"LOD1 exceeds 65% target: {triangle_counts}")
    if triangle_counts[2] > triangle_counts[0] * 0.35:
        raise RuntimeError(f"LOD2 exceeds 35% target: {triangle_counts}")
    total_bytes = sum(report["bytes"] for report in glb_reports)
    if total_bytes > 20 * 1024 * 1024:
        raise RuntimeError(f"Combined GLB package exceeds 20 MiB: {total_bytes}")

    all_lods = [obj for objects in lod_objects.values() for obj in objects]
    rev46_observe(
        "render_boundary_entry",
        expectedViewFamily=(
            "rev51-bounded-route"
            if VLR7_ORIENTED_CLEARANCE_VARIANT
            else "rev47-fixture-schema"
        ),
    )
    camera = setup_render(lod_objects[0], all_lods, weapon_review)
    renders = render_review(camera, lod_objects[0], weapon_review)
    rev46_observe(
        "render_boundary_complete",
        renderCount=len(renders),
        outputs=[render["path"] for render in renders],
    )
    technical_claims = (
        [
            (
                "Successful emission of this report establishes one bounded "
                "Rev51 Blender technical execution through export and "
                "source-contact rendering."
                if VLR7_ORIENTED_CLEARANCE_VARIANT
                else "Successful emission of this report establishes one "
                "bounded Rev47 Blender technical execution through export and "
                "source-contact rendering."
            ),
            "The gate values recorded in this report are evaluated technical evidence for this exact run and source identity.",
        ]
        if VLR7_DIAGNOSTIC_VARIANT
        else []
    )
    nonclaims = [
        "Review-only candidate; no owner or human visual acceptance is declared.",
        "No final first-person-arm derivative is authored in this source build.",
        "Structural export is not browser runtime, foot-lock, performance-soak, release, or deployment proof.",
    ]
    if KEVIN_RIFLE_VARIANT:
        nonclaims.append(
            "Kevin Iglesias rifle-pose derivatives are not approved for public "
            "source distribution or release packaging pending distribution-mode closure."
        )
    if VLR7_CONSTRAINED_VARIANT:
        nonclaims.append(
            "The embedded VLR-7 is a source-render contact fixture only; it is "
            "not embedded in the exported character GLBs and does not prove "
            "browser attachment, recoil, reload, ADS, or browser support-hand "
            "contact."
        )
    if VLR7_LANDMARK_GRIP_VARIANT:
        nonclaims.extend([
            "This packet records one bounded Blender technical execution and source contact renders; it does not prove browser integration or Human Eye acceptance.",
            "Static fixture qualification alone was insufficient; the recorded evaluated reach, wrap, clearance, trigger, and camera gates are technical evidence only, not visual acceptance.",
            "KayKit and OpenGameArt research informed only clean-room pose and control principles; no Euler track, mesh, rig, or animation was copied.",
        ])
    motion_sources = [
        {
            "library": "Quaternius Universal Animation Library Standard",
            "sha256": sha256(UAL1_GLB),
            "license": "CC0-1.0",
            "canonicalUrl": "https://quaternius.com/packs/universalanimationlibrary.html",
        },
        {
            "library": "Quaternius Universal Animation Library 2 Standard",
            "sha256": sha256(UAL2_GLB),
            "license": "CC0-1.0",
            "canonicalUrl": "https://quaternius.com/packs/universalanimationlibrary2.html",
        },
    ]
    if KEVIN_RIFLE_VARIANT:
        motion_sources.append({
            "library": "Human Soldier Animations FREE / WeaponHold_AssaultRifle01",
            "sha256": sha256(KEVIN_SOLDIER_BLEND),
            "archiveSha256": sha256(KEVIN_SOLDIER_ARCHIVE),
            "license": "Unity Standard Asset Store EULA",
            "canonicalUrl": "https://kevdev.itch.io/human-soldier-animations-free",
            "releaseDistribution": "hold",
        })
    report = {
        "schema": (
            (
                (
                    "kyx-g6-assault-rev51-vlr7-bounded-route-source-build-v1"
                    if VLR7_ORIENTED_CLEARANCE_VARIANT
                    else "kyx-g6-assault-rev47-vlr7-fixture-schema-source-build-v1"
                    if VLR7_DIAGNOSTIC_VARIANT
                    else "kyx-g6-assault-rev45-vlr7-anatomical-grip-source-build-v1"
                    if VLR7_ANATOMICAL_GRIP_VARIANT
                    else "kyx-g6-assault-rev44-vlr7-landmark-grip-source-build-v1"
                    if VLR7_LANDMARK_GRIP_VARIANT
                    else (
                        "kyx-g6-assault-rev43-vlr7-palm-grip-source-build-v1"
                        if VLR7_GRIP_VARIANT
                        else (
                            "kyx-g6-assault-rev42-vlr7-constrained-source-build-v1"
                            if VLR7_CONSTRAINED_VARIANT
                            else "kyx-g6-assault-rev41-kevin-rifle-source-build-v1"
                        )
                    )
                )
                if KEVIN_RIFLE_VARIANT or VLR7_CONSTRAINED_VARIANT
                else f"kyx-g6-assault-rev40-{ASSAULT_VARIANT}-source-build-v2"
            )
            if WEAPON_READY_VARIANT
            else "kyx-g6-assault-rev40-source-build-v2"
        ),
        "candidate": CANDIDATE_ID,
        "source": {
            "mesh": {
                "blend": str(SOURCE_BLEND.relative_to(WORKTREE)).replace("\\", "/"),
                "blendSha256": "ebfc91e9918a1d48fa1dd6330387debdf2f4c1aa0d08fbcf743071023a5f0a2a",
                "donor": "Sci-fi Soldier by Irondust",
                "license": "CC0-1.0",
                "canonicalUrl": "https://opengameart.org/content/sci-fi-soldier",
            },
            "motion": motion_sources,
            "weapon": (
                {
                    "candidate": "kyx-vlr7-quaternius-rev1",
                    "blend": str(VLR7_REVIEW_BLEND.relative_to(WORKTREE)).replace(
                        "\\", "/"
                    ),
                    "blendSha256": VLR7_REVIEW_BLEND_SHA256,
                    "glbSha256": VLR7_REVIEW_GLB_SHA256,
                    "license": "CC0-1.0",
                    "role": "source-render and contact fixture only",
                    "runtimeUniformScale": VLR7_RUNTIME_UNIFORM_SCALE,
                    "digitFixtureSeeds": (
                        VLR7_DIGIT_FIXTURES
                        if VLR7_LANDMARK_GRIP_VARIANT
                        else None
                    ),
                    "digitFixtureQualification": (
                        {
                            "qualified": True,
                            "rejectedSeeds": VLR7_REJECTED_FIXTURE_SEEDS,
                            "dominantIndexStaticAudit": (
                                VLR7_DOMINANT_INDEX_FIXTURE_STATIC_AUDIT
                            ),
                            "triggerGuardSourceBounds": (
                                VLR7_TRIGGER_GUARD_SOURCE_BOUNDS
                            ),
                        }
                        if VLR7_LANDMARK_GRIP_VARIANT
                        else None
                    ),
                    "dominantContact": (
                        {
                            "node": VLR7_STOCK_NAME,
                            "primitive": VLR7_DOMINANT_CONTACT_PRIMITIVE,
                            "triangle": VLR7_DOMINANT_CONTACT_TRIANGLE,
                            "surfaceOffsetFromCenterMarkerSourceMeters": (
                                vector_values(
                                    VLR7_DOMINANT_SURFACE_OFFSET_SOURCE_LOCAL
                                )
                            ),
                            "outwardNormalSourceLocal": vector_values(
                                VLR7_DOMINANT_SURFACE_NORMAL_SOURCE_LOCAL
                            ),
                            "palmNormalSourceLocal": vector_values(
                                -VLR7_DOMINANT_SURFACE_NORMAL_SOURCE_LOCAL
                            ),
                            "fingerDirectionSourceLocal": vector_values(
                                VLR7_DOMINANT_FINGER_SOURCE_LOCAL
                            ),
                            "gripClusterRule": (
                                "primitive 0 unique positions where abs(x)<=0.14, "
                                "-0.50<=y<=0.05, 0.20<=z<=0.40; use PCA grip-up"
                            ),
                            "gripClusterCentroidRawGltfMeters": [
                                0.0,
                                -0.225098230622,
                                0.324142694473,
                            ],
                        }
                        if VLR7_GRIP_VARIANT
                        else None
                    ),
                    "supportContact": {
                        "node": "KYX_VLR7_REVIEW_RECEIVER_HANDGUARD",
                        "mesh": "KYX_VLR7_REVIEW_RECEIVER_HANDGUARD_MESH",
                        "primitive": VLR7_SUPPORT_CONTACT_PRIMITIVE,
                        "triangle": VLR7_SUPPORT_CONTACT_TRIANGLE,
                        "indexBase": 0,
                        "indices": list(VLR7_SUPPORT_CONTACT_INDICES),
                        "barycentric": list(VLR7_SUPPORT_CONTACT_BARYCENTRIC),
                        "candidateLocalMeters": list(
                            VLR7_SUPPORT_CONTACT_CANDIDATE_LOCAL_METERS
                        ),
                        "candidateLocalSpace": (
                            "hash-pinned GLB root TRS before runtime 0.86 scale; "
                            "+X right, +Y up, -Z muzzle"
                        ),
                    },
                }
                if VLR7_CONSTRAINED_VARIANT
                else None
            ),
        },
        "masterBlend": {
            "path": str(MASTER_BLEND.relative_to(WORKTREE)).replace("\\", "/"),
            "bytes": MASTER_BLEND.stat().st_size,
            "sha256": sha256(MASTER_BLEND),
        },
        "runtimeContract": {
            "bones": len(rig.data.bones),
            "actions": action_contract(),
            "motionRetarget": motion_records,
            "weaponReadyUpperBodyOverlay": (
                {
                    "source": (
                        VLR7_CONTACT_SOLVE_LABEL
                        if VLR7_CONSTRAINED_VARIANT
                        else (
                            "Kevin Iglesias Human Soldier/WeaponHold_AssaultRifle01"
                            if KEVIN_RIFLE_VARIANT
                            else "Quaternius UAL1 Standard/Pistol_Idle_Loop"
                        )
                    ),
                    "outputs": sorted(WEAPON_READY_OVERLAY_OUTPUTS),
                    "boneRoots": ["clavicle_l", "clavicle_r"],
                    "transfer": (
                        (
                            "semantic MCP hand bases plus hash-pinned per-digit "
                            "surface landmarks, exterior fixed-length waypoints, "
                            "opposition, wrap, collision, ordering, trigger, and "
                            "contact-camera gates"
                        )
                        if VLR7_LANDMARK_GRIP_VARIANT
                        else (
                            "surface-framed palm-anchor-offset wrist solve with "
                            "bounded hand orientation and geometry-directed digits"
                            if VLR7_GRIP_VARIANT
                            else (
                                "actual VLR-7 stock/grip/handguard constrained two-bone solve"
                                if VLR7_CONSTRAINED_VARIANT
                                else (
                                    "chest-frame directional chain retarget"
                                    if KEVIN_RIFLE_VARIANT
                                    else "shared-clavicle-parent armature-space"
                                    if WEAPON_READY_ANCHOR_VARIANT
                                    else "legacy local-rest-relative"
                                )
                            )
                        )
                    ),
                }
                if WEAPON_READY_VARIANT
                else None
            ),
            "unweightedVertexRepair": (
                "topology-neighbor then nearest-valid fail-closed"
                if WEAPON_READY_WEIGHT_REPAIR_VARIANT
                else None
            ),
            "embeddedDiagnosticWeapon": False,
            "sourceReviewWeapon": VLR7_CONSTRAINED_VARIANT,
        },
        "adaptation": {
            "strategy": (
                "qualified CC0 mesh, locomotion, and actual VLR-7 geometry "
                "with source-baked reachable weapon contacts"
                if VLR7_CONSTRAINED_VARIANT
                else (
                    "qualified CC0 mesh and locomotion reuse plus isolated "
                    "Standard-EULA rifle-pose adaptation"
                    if KEVIN_RIFLE_VARIANT
                    else "direct qualified CC0 mesh reuse with bounded weight, material, LOD, and motion adaptation"
                )
            ),
            "materialRenames": material_renames,
            "weaponReviewMaterialRenames": weapon_review_material_renames,
            "detailImages": image_records,
            "geometry": "Irondust Rev30 body, right hand, and broad-visor head reused without procedural torso replacement",
            "weights": weight_reports,
            "weaponSocket": "one non-deforming socket_weapon_r bone added under hand_r",
        },
        "lods": glb_reports,
        "combinedGlbBytes": total_bytes,
        "renders": renders,
        "technicalClaims": technical_claims,
        "nonclaims": nonclaims,
    }
    REPORT_PATH.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")

    manifest = {
        "schema": (
            (
                (
                    "kyx-g6-assault-rev51-vlr7-bounded-route-review-candidate-manifest-v1"
                    if VLR7_ORIENTED_CLEARANCE_VARIANT
                    else "kyx-g6-assault-rev47-vlr7-fixture-schema-review-candidate-manifest-v1"
                    if VLR7_DIAGNOSTIC_VARIANT
                    else "kyx-g6-assault-rev45-vlr7-anatomical-grip-review-candidate-manifest-v1"
                    if VLR7_ANATOMICAL_GRIP_VARIANT
                    else "kyx-g6-assault-rev44-vlr7-landmark-grip-review-candidate-manifest-v1"
                    if VLR7_LANDMARK_GRIP_VARIANT
                    else (
                        "kyx-g6-assault-rev43-vlr7-palm-grip-review-candidate-manifest-v1"
                        if VLR7_GRIP_VARIANT
                        else (
                            "kyx-g6-assault-rev42-vlr7-constrained-review-candidate-manifest-v1"
                            if VLR7_CONSTRAINED_VARIANT
                            else "kyx-g6-assault-rev41-kevin-rifle-review-candidate-manifest-v1"
                        )
                    )
                )
                if KEVIN_RIFLE_VARIANT or VLR7_CONSTRAINED_VARIANT
                else f"kyx-g6-assault-rev40-{ASSAULT_VARIANT}-review-candidate-manifest-v2"
            )
            if WEAPON_READY_VARIANT
            else "kyx-g6-assault-rev40-review-candidate-manifest-v2"
        ),
        "revision": CANDIDATE_ID,
        "displayName": (
            (
                (
                    "KYX Assault Rev51 VLR-7 bounded-route review derivative"
                    if VLR7_ORIENTED_CLEARANCE_VARIANT
                    else "KYX Assault Rev47 VLR-7 fixture-schema review derivative"
                    if VLR7_DIAGNOSTIC_VARIANT
                    else "KYX Assault Rev45 VLR-7 anatomical-grip review derivative"
                    if VLR7_ANATOMICAL_GRIP_VARIANT
                    else "KYX Assault Rev44 VLR-7 landmark-grip review derivative"
                    if VLR7_LANDMARK_GRIP_VARIANT
                    else (
                        "KYX Assault Rev43 VLR-7 palm-grip review derivative"
                        if VLR7_GRIP_VARIANT
                        else (
                            "KYX Assault Rev42 VLR-7 constrained-contact review derivative"
                            if VLR7_CONSTRAINED_VARIANT
                            else "KYX Assault Rev41 Human Soldier rifle-pose review derivative"
                        )
                    )
                )
                if KEVIN_RIFLE_VARIANT or VLR7_CONSTRAINED_VARIANT
                else f"KYX Assault Rev40 CC0 {ASSAULT_VARIANT} motion derivative"
            )
            if WEAPON_READY_VARIANT
            else "KYX Assault Rev40 CC0 mesh and motion derivative"
        ),
        "default": False,
        "releaseEligible": False,
        "humanAccepted": False,
        "runtimeIntegrated": False,
        "sourceDisposition": "ADAPT",
        "assets": {f"lod{index}": glb_reports[index] for index in range(3)},
        "provenance": {
            "meshSource": "Sci-fi Soldier by Irondust",
            "meshSourceUrl": "https://opengameart.org/content/sci-fi-soldier",
            "motionSource": (
                "Quaternius Universal Animation Library 1/2 Standard"
                if VLR7_CONSTRAINED_VARIANT
                else (
                    "Quaternius UAL1/2 Standard plus Kevin Iglesias Human Soldier rifle pose"
                    if KEVIN_RIFLE_VARIANT
                    else "Quaternius Universal Animation Library 1/2 Standard"
                )
            ),
            "motionSourceUrls": [
                "https://quaternius.com/packs/universalanimationlibrary.html",
                "https://quaternius.com/packs/universalanimationlibrary2.html",
            ],
            "license": (
                "CC0-1.0 plus Unity Standard Asset Store EULA"
                if KEVIN_RIFLE_VARIANT
                else "CC0-1.0"
            ),
            "kevinRiflePose": (
                {
                    "canonicalUrl": "https://kevdev.itch.io/human-soldier-animations-free",
                    "sourceBlendSha256": sha256(KEVIN_SOLDIER_BLEND),
                    "archiveSha256": sha256(KEVIN_SOLDIER_ARCHIVE),
                    "license": "Unity Standard Asset Store EULA",
                    "publicSourceDistribution": "hold",
                }
                if KEVIN_RIFLE_VARIANT
                else None
            ),
            "vlr7ContactFixture": (
                {
                    "candidate": "kyx-vlr7-quaternius-rev1",
                    "blendSha256": VLR7_REVIEW_BLEND_SHA256,
                    "glbSha256": VLR7_REVIEW_GLB_SHA256,
                    "license": "CC0-1.0",
                    "exportedWithCharacter": False,
                    "runtimeUniformScale": VLR7_RUNTIME_UNIFORM_SCALE,
                    "digitFixtureSeeds": (
                        VLR7_DIGIT_FIXTURES
                        if VLR7_LANDMARK_GRIP_VARIANT
                        else None
                    ),
                    "digitFixtureQualification": (
                        {
                            "qualified": True,
                            "rejectedSeeds": VLR7_REJECTED_FIXTURE_SEEDS,
                            "dominantIndexStaticAudit": (
                                VLR7_DOMINANT_INDEX_FIXTURE_STATIC_AUDIT
                            ),
                            "triggerGuardSourceBounds": (
                                VLR7_TRIGGER_GUARD_SOURCE_BOUNDS
                            ),
                        }
                        if VLR7_LANDMARK_GRIP_VARIANT
                        else None
                    ),
                    "dominantContact": (
                        {
                            "node": VLR7_STOCK_NAME,
                            "primitive": VLR7_DOMINANT_CONTACT_PRIMITIVE,
                            "triangle": VLR7_DOMINANT_CONTACT_TRIANGLE,
                            "surfaceOffsetFromCenterMarkerSourceMeters": (
                                vector_values(
                                    VLR7_DOMINANT_SURFACE_OFFSET_SOURCE_LOCAL
                                )
                            ),
                            "outwardNormalSourceLocal": vector_values(
                                VLR7_DOMINANT_SURFACE_NORMAL_SOURCE_LOCAL
                            ),
                            "palmNormalSourceLocal": vector_values(
                                -VLR7_DOMINANT_SURFACE_NORMAL_SOURCE_LOCAL
                            ),
                            "fingerDirectionSourceLocal": vector_values(
                                VLR7_DOMINANT_FINGER_SOURCE_LOCAL
                            ),
                        }
                        if VLR7_GRIP_VARIANT
                        else None
                    ),
                    "supportContact": {
                        "node": "KYX_VLR7_REVIEW_RECEIVER_HANDGUARD",
                        "mesh": "KYX_VLR7_REVIEW_RECEIVER_HANDGUARD_MESH",
                        "primitive": VLR7_SUPPORT_CONTACT_PRIMITIVE,
                        "triangle": VLR7_SUPPORT_CONTACT_TRIANGLE,
                        "indexBase": 0,
                        "indices": list(VLR7_SUPPORT_CONTACT_INDICES),
                        "barycentric": list(VLR7_SUPPORT_CONTACT_BARYCENTRIC),
                        "candidateLocalMeters": list(
                            VLR7_SUPPORT_CONTACT_CANDIDATE_LOCAL_METERS
                        ),
                        "candidateLocalSpace": (
                            "hash-pinned GLB root TRS before runtime 0.86 scale; "
                            "+X right, +Y up, -Z muzzle"
                        ),
                    },
                }
                if VLR7_CONSTRAINED_VARIANT
                else None
            ),
            "notice": str(NOTICE_PATH.relative_to(WORKTREE)).replace("\\", "/"),
            "resourceBrief": "docs/resource-briefs/g6-assault-rev40-browser-character.md",
            "registry": "assets/review/resource-registry/g6-assault-rev40-source-candidates.json",
        },
        "package": {
            "combinedBytes": total_bytes,
            "distinctAuthoredLods": True,
            "embeddedDiagnosticWeapon": False,
        },
        "weaponReadyUpperBodyOverlay": (
            (
                VLR7_CONTACT_SOLVE_LABEL
                if VLR7_CONSTRAINED_VARIANT
                else (
                    "Kevin Iglesias Human Soldier/WeaponHold_AssaultRifle01"
                    if KEVIN_RIFLE_VARIANT
                    else "Quaternius UAL1 Standard/Pistol_Idle_Loop"
                )
            )
            if WEAPON_READY_VARIANT
            else None
        ),
        "weaponReadyOverlayTransfer": (
            (
                (
                    "semantic MCP hand bases plus hash-pinned per-digit surface "
                    "landmarks and exterior fixed-length waypoint solves"
                )
                if VLR7_LANDMARK_GRIP_VARIANT
                else (
                    "surface-framed palm-anchor-offset wrist solve with bounded "
                    "hand orientation and geometry-directed digits"
                    if VLR7_GRIP_VARIANT
                    else (
                        "actual VLR-7 stock/grip/handguard constrained two-bone solve"
                        if VLR7_CONSTRAINED_VARIANT
                        else (
                            "chest-frame directional chain retarget"
                            if KEVIN_RIFLE_VARIANT
                            else "shared-clavicle-parent armature-space"
                        )
                    )
                )
            )
            if WEAPON_READY_ANCHOR_VARIANT
            else None
        ),
        "unweightedVertexRepair": (
            "topology-neighbor then nearest-valid fail-closed"
            if WEAPON_READY_WEIGHT_REPAIR_VARIANT
            else None
        ),
        "nonClaims": nonclaims,
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    completion_signature = (
        "KYX_REV51_VLR7_BOUNDED_ROUTE_COMPLETE"
        if VLR7_ORIENTED_CLEARANCE_VARIANT
        else "KYX_REV47_VLR7_FIXTURE_SCHEMA_COMPLETE"
        if VLR7_DIAGNOSTIC_VARIANT
        else "KYX_REV45_VLR7_ANATOMICAL_GRIP_COMPLETE"
        if VLR7_ANATOMICAL_GRIP_VARIANT
        else "KYX_REV44_VLR7_LANDMARK_GRIP_COMPLETE"
        if VLR7_LANDMARK_GRIP_VARIANT
        else (
            "KYX_REV43_VLR7_PALM_GRIP_COMPLETE"
            if VLR7_GRIP_VARIANT
            else "KYX_REV40_CC0_ASSAULT_COMPLETE"
        )
    )
    print(completion_signature + " " + json.dumps({
        "candidate": CANDIDATE_ID,
        "masterBlend": str(MASTER_BLEND),
        "manifest": str(MANIFEST_PATH),
        "report": str(REPORT_PATH),
        "lodTriangles": triangle_counts,
        "combinedGlbBytes": total_bytes,
        "renders": [render["path"] for render in renders],
    }))


if __name__ == "__main__":
    if not VLR7_DIAGNOSTIC_VARIANT:
        main()
    else:
        rev46_assert_output_isolation()
        os.environ[
            "KYX_REV51_CORE_MAIN_ENTERED"
            if VLR7_ORIENTED_CLEARANCE_VARIANT
            else "KYX_REV47_CORE_MAIN_ENTERED"
        ] = "1"
        try:
            rev46_observe("top_level_main_entry")
            main()
            rev46_observe("top_level_main_complete")
        except BaseException as exc:
            failure_traceback = traceback.format_exc()
            try:
                rev46_observe(
                    "top_level_exception",
                    exceptionType=type(exc).__name__,
                    exceptionMessage=str(exc),
                )
            except BaseException:
                print(
                    (
                        "REV51_STAGE_LOG_SECONDARY_FAILURE\n"
                        if VLR7_ORIENTED_CLEARANCE_VARIANT
                        else "REV47_STAGE_LOG_SECONDARY_FAILURE\n"
                    )
                    + traceback.format_exc(),
                    flush=True,
                )
            try:
                rev46_write_traceback(REV46_TRACEBACK_PATH, failure_traceback)
            except BaseException:
                print(
                    (
                        "REV51_TRACEBACK_WRITE_SECONDARY_FAILURE\n"
                        if VLR7_ORIENTED_CLEARANCE_VARIANT
                        else "REV47_TRACEBACK_WRITE_SECONDARY_FAILURE\n"
                    )
                    + traceback.format_exc(),
                    flush=True,
                )
            # stdout is intentionally authoritative alongside the durable file;
            # the exception is re-raised so Blender's --python-exit-code 1 owns
            # the final native-process result.
            print(failure_traceback, flush=True)
            raise
