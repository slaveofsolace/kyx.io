#!/usr/bin/env python3
"""Pure-Python Rev51 VLR-7 bounded-route verifier.

This intentionally imports neither bpy nor mathutils.  It verifies the pinned
GLB, every fixture address/normal/target, the audited same-face middle target,
the stable-ID exact-length route family, segment/joint/handedness controls, and
the six-action temporal stage contract. When given a Rev51 stage JSONL, it
requires one fully-qualified selected route for all ten digits of every contact
frame before any per-frame temporal commit.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import math
import struct
from pathlib import Path


GLB_SHA256 = "46de2380ac08810524d7bb4bb67d8621bb436a4f559b4d672d5c2026a075dd79"
NATIVE_SCALE = 0.1599999964237213
RUNTIME_SCALE = NATIVE_SCALE * 0.86
POINT_TOLERANCE = 0.000002
NUMERICAL_ZERO = 1e-12
NORMAL_DOT_GATE = 0.99999
CONTACT_PAD_RADIUS = 0.008
DIAGNOSTIC_CLEARANCE_MAGNITUDE = 0.125
DIAGNOSTIC_EQUALITY_TOLERANCE = 1e-12
FIXTURE_OFFSET_METERS = 0.0015
FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS = 0.0000001
FIXTURE_POINT_TOLERANCE_METERS = 0.000002
ROLES = ("dominant", "support")
DIGITS = ("index", "middle", "ring", "pinky", "thumb")
EXPECTED_ACTION_CONTRACT = {
    "KYX_REV17_TP_IDLE": ("ual1", "Idle_Loop", 61, True),
    "KYX_REV17_TP_WALK": ("ual1", "Walk_Loop", 33, True),
    "KYX_REV17_TP_RUN": ("ual1", "Jog_Fwd_Loop", 23, True),
    "KYX_REV17_TP_JUMP_START": ("ual1", "Jump_Start", 33, True),
    "KYX_REV17_TP_AIRBORNE_LOOP": ("ual1", "Jump_Loop", 61, True),
    "KYX_REV17_TP_LAND": ("ual1", "Jump_Land", 31, True),
    "KYX_REV17_TP_PRIMARY_FIRE": ("ual1", "Pistol_Shoot", 16, False),
    "KYX_REV17_TP_RELOAD": ("ual1", "Pistol_Reload", 41, False),
    "KYX_REV17_TP_HIT_REACTION_FRONT": ("ual1", "Hit_Chest", 9, False),
    "KYX_REV17_TP_DEATH_FRONT": ("ual1", "Death01", 59, False),
    "KYX_REV40_TP_ABILITY_THROW": ("ual2", "OverhandThrow", 33, False),
    "KYX_REV40_TP_MELEE": ("ual2", "Sword_Regular_A", 11, False),
}
EXPECTED_CONTACT_FRAME_COUNT = 242
EXPECTED_CONTACT_DIGIT_PASS_COUNT = 2420
EXPECTED_CANDIDATE = "g6-assault-rev51-vlr7-bounded-route-v1"
EXPECTED_COMPLETION_SIGNATURE = "KYX_REV51_VLR7_BOUNDED_ROUTE_COMPLETE"
EXPECTED_CORE_SHA256 = "eea6b87e379b276a9f04b9fc492d1068299003b1d9d901dc55deabadb48974db"
EXPECTED_WRAPPER_SHA256 = "e8a0687733c30e7778d291c46a3a5b519b135880ece56d1855af6243d83085f6"
EXPECTED_RENDER_NAMES = {
    "kyx-rev51-assault-three-quarter.png",
    "kyx-rev51-assault-front.png",
    "kyx-rev51-assault-helmet-chest.png",
    "kyx-rev51-vlr7-dominant-grip-macro.png",
    "kyx-rev51-vlr7-support-underside-macro.png",
    "kyx-rev51-vlr7-trigger-discipline-profile.png",
    "kyx-rev51-vlr7-contact-neutral-macro.png",
}
ROLE_MESH = {
    "dominant": (
        "KYX_VLR7_REVIEW_STOCK_GRIP",
        "KYX_VLR7_REVIEW_STOCK_GRIP_MESH",
        2,
    ),
    "support": (
        "KYX_VLR7_REVIEW_RECEIVER_HANDGUARD",
        "KYX_VLR7_REVIEW_RECEIVER_HANDGUARD_MESH",
        3,
    ),
}
EXPECTED = {
    "dominant": {
        "index": (0, 74, (181, 165, 209), (.20, .32, .48),
                  (.244989141822, .213736057281, .506494083405), (1., 0., 0.)),
        "middle": (0, 55, (305, 389, 358), (.50, .125, .375),
                   (-.13778628408908844, -.2450641840696335,
                    -.1637265309691429), (-1., 0., 0.)),
        "ring": (0, 236, (386, 361, 358), (1/3,)*3,
                 (-.137786284089, -.200400233269, -.338977376620), (-1., 0., 0.)),
        "pinky": (0, 51, (361, 442, 413), (1/3,)*3,
                  (-.137786284089, -.224298954010, -.444387813409), (-1., 0., 0.)),
        "thumb": (0, 57, (335, 406, 394), (1/3,)*3,
                  (.040662750602, -.383816401164, -.383598268032),
                  (0., -.999018749599, -.044289253213)),
    },
    "support": {
        "index": (2, 293, (427, 429, 444), (1/3,)*3,
                  (.165617783864, 2.194637139638, .181036849817),
                  (.956914901224, .058887882591, -.284334466957)),
        "middle": (2, 292, (470, 426, 416), (1/3,)*3,
                   (.159680063526, 2.338399330775, .167714774609),
                   (.953754526802, 0., -.300586597515)),
        "ring": (2, 323, (472, 416, 475), (.45, .10, .45),
                 (.161758265644, 2.463379573822, .174308863282),
                 (.953754526802, 0., -.300586597515)),
        "pinky": (2, 324, (476, 472, 475), (.18, .41, .41),
                  (.164252108186, 2.626492242813, .182221769691),
                  (.953754526802, 0., -.300586597515)),
        "thumb": (2, 283, (380, 407, 412), (1/3,)*3,
                  (-.165617783864, 2.332881053289, .186555027962),
                  (-.953754526802, 0., -.300586597515)),
    },
}

REV51_IDLE_WEAPON_ROTATION_COLUMNS = (
    (-0.9701424861207064, -0.24253568113482152, 5.743678258395129e-08),
    (0.23875899011765087, -0.9550356062005941, -0.1757871881766792),
    (0.04263472027337844, -0.17053860605234392, 0.9844281916284876),
)
REV51_IDLE_WEAPON_TRANSLATION = (
    0.06503590426663458,
    -0.15750532089051228,
    1.2058006523282563,
)
REV51_MIDDLE_ROOT = (
    0.040551986545324326,
    -0.1429070383310318,
    1.2152637243270874,
)
REV51_MIDDLE_REST_DIRECTION = (
    0.9677091056786747,
    0.1569998610045818,
    0.19720580729563084,
)
REV51_MIDDLE_LENGTHS = (
    0.04234728217136135,
    0.03393318131568641,
    0.03443721681834312,
)
REV51_MIDDLE_SURFACE = (
    0.07441755685264252,
    -0.11686037246328489,
    1.1895503848331828,
)
REV51_MIDDLE_TARGET = (
    0.07587277058182358,
    -0.11649656894158265,
    1.1895503847470277,
)
REV51_MIDDLE_WAYPOINT_ONE = (
    0.03774335504986236,
    -0.10128617110229453,
    1.2225512004026173,
)
REV51_MIDDLE_WAYPOINT_TWO = (
    0.07120900536043448,
    -0.09784150587508911,
    1.2181188957011968,
)
REV51_EXPECTED_JOINT_ANGLES = (
    82.87344177875607,
    89.31908437646720,
    79.22631827974077,
)


def add(a, b): return tuple(x + y for x, y in zip(a, b))
def sub(a, b): return tuple(x - y for x, y in zip(a, b))
def mul(a, value): return tuple(x * value for x in a)
def dot(a, b): return sum(x * y for x, y in zip(a, b))
def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])
def length(a): return math.sqrt(dot(a, a))
def unit(a):
    size = length(a)
    if not math.isfinite(size) or size <= 1e-12:
        raise RuntimeError("missing/NaN/degenerate vector")
    return mul(a, 1.0 / size)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def float32(value):
    return struct.unpack("<f", struct.pack("<f", value))[0]


def evaluate_assignments(path: Path):
    tree = ast.parse(path.read_text(encoding="utf-8"))
    nodes = {}
    for statement in tree.body:
        if (
            isinstance(statement, ast.Assign)
            and len(statement.targets) == 1
            and isinstance(statement.targets[0], ast.Name)
        ):
            nodes[statement.targets[0].id] = statement.value
    cache = {}

    def evaluate(node):
        if isinstance(node, ast.Constant): return node.value
        if isinstance(node, ast.Name):
            if node.id not in nodes: raise RuntimeError(f"unsupported source name: {node.id}")
            if node.id not in cache: cache[node.id] = evaluate(nodes[node.id])
            return cache[node.id]
        if isinstance(node, ast.Tuple): return tuple(evaluate(value) for value in node.elts)
        if isinstance(node, ast.List): return [evaluate(value) for value in node.elts]
        if isinstance(node, ast.Set): return {evaluate(value) for value in node.elts}
        if isinstance(node, ast.Dict): return {evaluate(key): evaluate(value) for key, value in zip(node.keys, node.values)}
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub): return -evaluate(node.operand)
        if isinstance(node, ast.BinOp):
            left, right = evaluate(node.left), evaluate(node.right)
            if isinstance(node.op, ast.Div): return left / right
            if isinstance(node.op, ast.Mult): return left * right
            if isinstance(node.op, ast.Add): return left + right
            if isinstance(node.op, ast.Sub): return left - right
        raise RuntimeError(f"unsupported source literal: {ast.dump(node)}")

    wanted = {
        "VLR7_DIGIT_FIXTURES",
        "VLR7_FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS",
        "VLR7_FIXTURE_POINT_TOLERANCE_METERS",
        "VLR7_STOCK_NAME",
        "VLR7_HANDGUARD_NAME",
        "EXPECTED_ACTIONS",
        "MOTION_SOURCES",
        "WEAPON_READY_OVERLAY_OUTPUTS",
        "VLR7_ROUTE_TEMPORAL_SHAPE_DELTA_GATE_METERS",
        "VLR7_ROUTE_THETA_DIVISIONS",
        "VLR7_ROUTE_PSI_DIVISIONS",
        "VLR7_ROUTE_PHI_DIVISIONS",
        "VLR7_ROUTE_DOMINANT_MIDDLE_THETA_INDICES",
        "VLR7_ROUTE_DOMINANT_MIDDLE_PSI_INDICES",
        "VLR7_ROUTE_DOMINANT_MIDDLE_PHI_INDICES",
        "VLR7_ROUTE_DOMINANT_MIDDLE_ACCEPTED_SEED",
    }
    return {name: evaluate(node) for name, node in nodes.items() if name in wanted}


def validate_fixture_offset_representation(actual, label):
    if (
        isinstance(actual, bool)
        or not isinstance(actual, (int, float))
        or not math.isfinite(actual)
    ):
        raise RuntimeError(f"fixture offset is missing or non-finite: {label}")
    actual = float(actual)
    delta = abs(actual - FIXTURE_OFFSET_METERS)
    if actual <= 0.0:
        raise RuntimeError(
            f"fixture offset is not strictly outward: {label} actual={actual}"
        )
    if delta > FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS:
        raise RuntimeError(
            "fixture offset representation exceeds tolerance: "
            f"{label} actual={actual} expected={FIXTURE_OFFSET_METERS} "
            f"delta={delta} "
            f"tolerance={FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS}"
        )
    return {
        "actualMeters": actual,
        "expectedMeters": FIXTURE_OFFSET_METERS,
        "deltaMeters": delta,
        "toleranceMeters": (
            FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS
        ),
        "strictlyOutward": True,
    }


def verify_all_fixture_offset_semantics(fixtures):
    reports = {}
    for role in ROLES:
        for finger in DIGITS:
            label = f"{role}/{finger}"
            offset = fixtures[role]["digits"][finger][
                "boneCenterOffsetMeters"
            ]
            if offset != FIXTURE_OFFSET_METERS:
                raise RuntimeError(f"fixture offset changed: {label}")
            reports[label] = validate_fixture_offset_representation(
                offset,
                label,
            )
    if len(reports) != len(ROLES) * len(DIGITS):
        raise RuntimeError("fixture offset semantic cardinality changed")
    return reports


def verify_fixture_offset_representation_controls():
    observed = validate_fixture_offset_representation(
        0.001499998507,
        "observed-rev49-positive",
    )
    exact = validate_fixture_offset_representation(
        FIXTURE_OFFSET_METERS,
        "exact-positive",
    )
    boundary_high_inside = math.nextafter(
        FIXTURE_OFFSET_METERS
        + FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS,
        FIXTURE_OFFSET_METERS,
    )
    boundary_low_inside = math.nextafter(
        FIXTURE_OFFSET_METERS
        - FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS,
        FIXTURE_OFFSET_METERS,
    )
    boundary_reports = {
        "highInside": validate_fixture_offset_representation(
            boundary_high_inside,
            "boundary-high-inside",
        ),
        "lowInside": validate_fixture_offset_representation(
            boundary_low_inside,
            "boundary-low-inside",
        ),
    }
    rejected = []
    controls = (
        ("zero", 0.0),
        ("negative", -0.000001),
        ("sign-flip", -FIXTURE_OFFSET_METERS),
        (
            "genuine-magnitude-error-1e-6",
            FIXTURE_OFFSET_METERS + 0.000001,
        ),
        (
            "boundary-high-outside",
            math.nextafter(
                FIXTURE_OFFSET_METERS
                + FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS,
                math.inf,
            ),
        ),
        (
            "boundary-low-outside",
            math.nextafter(
                FIXTURE_OFFSET_METERS
                - FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS,
                -math.inf,
            ),
        ),
    )
    for label, value in controls:
        try:
            validate_fixture_offset_representation(value, label)
        except RuntimeError:
            rejected.append(label)
        else:
            raise RuntimeError(
                f"fixture offset negative control was accepted: {label}"
            )
    if observed["deltaMeters"] >= (
        FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS / 60.0
    ):
        raise RuntimeError("observed Rev49 delta lost the intended safety margin")
    return {
        "schema": "kyx-rev51-fixture-offset-representation-controls-v1",
        "observedRev49": observed,
        "exactPositive": exact,
        "boundaryPasses": boundary_reports,
        "rejectedControls": rejected,
        "toleranceRatioToObservedRev49Delta": (
            FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS
            / observed["deltaMeters"]
        ),
        "toleranceRatioToFixturePointGate": (
            FIXTURE_POINT_TOLERANCE_METERS
            / FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS
        ),
    }


def verify_core_fixture_schema(core: Path):
    assignments = evaluate_assignments(core)
    if (
        assignments["VLR7_FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS"]
        != FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS
    ):
        raise RuntimeError("core fixture offset representation tolerance changed")
    if (
        assignments["VLR7_FIXTURE_POINT_TOLERANCE_METERS"]
        != FIXTURE_POINT_TOLERANCE_METERS
    ):
        raise RuntimeError("core fixture point tolerance changed")
    if (
        FIXTURE_POINT_TOLERANCE_METERS
        != 20 * FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS
    ):
        raise RuntimeError("fixture tolerance hierarchy changed")
    actual = assignments["VLR7_DIGIT_FIXTURES"]
    if set(actual) != set(ROLES): raise RuntimeError("core fixture roles changed")
    expected_roles = {
        "dominant": {
            "side": "r",
            "hand": "hand_r",
            "node": "KYX_VLR7_REVIEW_STOCK_GRIP",
            "mesh": "KYX_VLR7_REVIEW_STOCK_GRIP_MESH",
            "primitive": 0,
        },
        "support": {
            "side": "l",
            "hand": "hand_l",
            "node": "KYX_VLR7_REVIEW_RECEIVER_HANDGUARD",
            "mesh": "KYX_VLR7_REVIEW_RECEIVER_HANDGUARD_MESH",
            "primitive": 2,
        },
    }
    for role in ROLES:
        if set(actual[role]) != {
            "side", "hand", "node", "mesh", "primitive", "digits"
        }:
            raise RuntimeError(f"core role fixture fields changed: {role}")
        for field, expected in expected_roles[role].items():
            if actual[role][field] != expected:
                raise RuntimeError(f"core role fixture changed: {role}.{field}")
        if set(actual[role]["digits"]) != set(DIGITS): raise RuntimeError(f"core fixture digits changed: {role}")
        for finger in DIGITS:
            primitive, triangle, indices, bary, point, normal = EXPECTED[role][finger]
            fixture = actual[role]["digits"][finger]
            expected_values = {
                "qualified": True,
                "triangle": triangle,
                "indices": indices,
                "barycentric": bary,
                "surfacePoint": point,
                "normal": normal,
                "boneCenterOffsetMeters": FIXTURE_OFFSET_METERS,
            }
            if set(fixture) != set(expected_values): raise RuntimeError(f"core fixture fields changed: {role}/{finger}")
            for field, expected in expected_values.items():
                value = fixture[field]
                if isinstance(expected, tuple):
                    if len(value) != len(expected) or max(abs(a-b) for a,b in zip(value, expected)) > 1e-12:
                        raise RuntimeError(f"core fixture {field} changed: {role}/{finger}")
                elif value != expected:
                    raise RuntimeError(f"core fixture {field} changed: {role}/{finger}")
    offset_semantics = verify_all_fixture_offset_semantics(actual)
    return {
        "roles": list(ROLES),
        "digitsPerRole": len(DIGITS),
        "fixtureCount": 10,
        "offsetSemantics": offset_semantics,
    }


def verify_core_action_contract(core: Path):
    assignments = evaluate_assignments(core)
    expected_actions = assignments["EXPECTED_ACTIONS"]
    motion_sources = assignments["MOTION_SOURCES"]
    contact_actions = assignments["WEAPON_READY_OVERLAY_OUTPUTS"]
    if set(expected_actions) != set(EXPECTED_ACTION_CONTRACT):
        raise RuntimeError("core expected-action set changed")
    if set(motion_sources) != set(EXPECTED_ACTION_CONTRACT):
        raise RuntimeError("core motion-source set changed")
    pinned_contacts = {
        name for name, contract in EXPECTED_ACTION_CONTRACT.items() if contract[3]
    }
    if contact_actions != pinned_contacts or len(contact_actions) != 6:
        raise RuntimeError("core contact-action set changed")
    for name, (library, source, frames, _contact) in EXPECTED_ACTION_CONTRACT.items():
        if motion_sources[name] != (library, source):
            raise RuntimeError(f"core motion source changed: {name}")
        if tuple(expected_actions[name]) != (1.0, float(frames)):
            raise RuntimeError(f"core action frame range changed: {name}")
    contact_frames = sum(
        contract[2] for contract in EXPECTED_ACTION_CONTRACT.values() if contract[3]
    )
    if contact_frames != EXPECTED_CONTACT_FRAME_COUNT:
        raise RuntimeError("pinned contact-frame total changed")
    return {
        "actionCount": len(EXPECTED_ACTION_CONTRACT),
        "contactActions": sorted(pinned_contacts),
        "contactFrameCount": contact_frames,
        "contactDigitPassCount": contact_frames * len(ROLES) * len(DIGITS),
    }


def read_glb(path: Path):
    if sha256(path) != GLB_SHA256:
        raise RuntimeError("pinned VLR-7 GLB hash changed")
    data = path.read_bytes()
    offset = 12
    document = binary = None
    while offset < len(data):
        size, kind = struct.unpack_from("<II", data, offset)
        offset += 8
        payload = data[offset:offset + size]
        offset += size
        if kind == 0x4E4F534A:
            document = json.loads(payload.decode().rstrip(" \t\r\n\0"))
        elif kind == 0x004E4942:
            binary = payload
    if document is None or binary is None:
        raise RuntimeError("GLB chunks missing")
    return document, binary


def accessor(document, binary, index):
    formats = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
    widths = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}
    value = document["accessors"][index]
    view = document["bufferViews"][value["bufferView"]]
    width = widths[value["type"]]
    form = "<" + formats[value["componentType"]] * width
    size = struct.calcsize(form)
    stride = view.get("byteStride", size)
    start = view.get("byteOffset", 0) + value.get("byteOffset", 0)
    return [struct.unpack_from(form, binary, start + item * stride)
            for item in range(value["count"])]


def source_point(value):
    return (float(value[0]), -float(value[2]), float(value[1]))


def require_positive_determinant(value):
    if not math.isfinite(value) or value <= 0.0:
        raise RuntimeError("mirrored or invalid transform determinant")


def require_complete_primitive_count(role, actual):
    expected = ROLE_MESH[role][2]
    if actual != expected:
        raise RuntimeError(
            f"full-object primitive omission for {role}: {actual} != {expected}"
        )


def closest_point(point, a, b, c):
    ab, ac, ap = sub(b, a), sub(c, a), sub(point, a)
    d1, d2 = dot(ab, ap), dot(ac, ap)
    if d1 <= 0 and d2 <= 0: return a
    bp = sub(point, b); d3, d4 = dot(ab, bp), dot(ac, bp)
    if d3 >= 0 and d4 <= d3: return b
    vc = d1*d4 - d3*d2
    if vc <= 0 and d1 >= 0 and d3 <= 0: return add(a, mul(ab, d1/(d1-d3)))
    cp = sub(point, c); d5, d6 = dot(ab, cp), dot(ac, cp)
    if d6 >= 0 and d5 <= d6: return c
    vb = d5*d2 - d1*d6
    if vb <= 0 and d2 >= 0 and d6 <= 0: return add(a, mul(ac, d2/(d2-d6)))
    va = d3*d6 - d5*d4
    if va <= 0 and d4-d3 >= 0 and d5-d6 >= 0:
        return add(b, mul(sub(c, b), (d4-d3)/((d4-d3)+(d5-d6))))
    denominator = 1.0 / (va + vb + vc)
    return add(a, add(mul(ab, vb*denominator), mul(ac, vc*denominator)))


def clearance(point, triangles):
    if not triangles or any(not math.isfinite(value) for value in point):
        raise RuntimeError("missing or non-finite clearance input")
    values = []
    for triangle in triangles:
        closest = closest_point(point, *triangle["vertices"])
        delta = sub(point, closest)
        distance = length(delta)
        signed = dot(delta, triangle["normal"])
        if abs(signed) <= NUMERICAL_ZERO: signed = 0.0
        values.append({**triangle, "closest": closest, "distance": distance,
                       "signed": signed})
    minimum = min(item["distance"] for item in values)
    tied = [item for item in values if item["distance"] - minimum <= POINT_TOLERANCE]
    signs = {1 if item["signed"] > 0 else -1 if item["signed"] < 0 else 0
             for item in tied}
    if 1 in signs and -1 in signs:
        raise RuntimeError("sign-conflicting nearest tie")
    winner = min(tied, key=lambda item: (item["signed"], item["primitive"], item["triangle"]))
    return {"signed": winner["signed"], "distance": minimum,
            "primitive": winner["primitive"], "triangle": winner["triangle"],
            "ties": [(item["primitive"], item["triangle"], item["signed"], item["normal"]) for item in tied]}


def require_strict_positive_diagnostic_clearance(value, label):
    if not math.isfinite(value) or value <= 0.0:
        raise RuntimeError(f"strict positive clearance rejected: {label}")


def verify_float32_diagnostic_controls():
    magnitude = float32(DIAGNOSTIC_CLEARANCE_MAGNITUDE)
    negative_magnitude = float32(-DIAGNOSTIC_CLEARANCE_MAGNITUDE)
    if magnitude != DIAGNOSTIC_CLEARANCE_MAGNITUDE:
        raise RuntimeError("positive diagnostic magnitude is not exact float32")
    if negative_magnitude != -DIAGNOSTIC_CLEARANCE_MAGNITUDE:
        raise RuntimeError("negative diagnostic magnitude is not exact float32")

    vertices = tuple(
        tuple(float32(component) for component in vertex)
        for vertex in ((0., 0., 0.), (1., 0., 0.), (0., 1., 0.))
    )
    positive_triangle = [{
        "primitive": 0,
        "triangle": 0,
        "vertices": vertices,
        "normal": (0., 0., 1.),
    }]
    repaired_triangle = [{
        "primitive": 0,
        "triangle": 0,
        "vertices": (vertices[0], vertices[2], vertices[1]),
        "normal": (0., 0., -1.),
    }]
    positive_actual = clearance(
        (float32(.25), float32(.25), magnitude),
        positive_triangle,
    )["signed"]
    repaired_actual = clearance(
        (float32(.25), float32(.25), negative_magnitude),
        repaired_triangle,
    )["signed"]
    positive_delta = abs(positive_actual - DIAGNOSTIC_CLEARANCE_MAGNITUDE)
    repaired_delta = abs(repaired_actual - DIAGNOSTIC_CLEARANCE_MAGNITUDE)
    if positive_delta > DIAGNOSTIC_EQUALITY_TOLERANCE:
        raise RuntimeError("float32 positive diagnostic control changed")
    if repaired_delta > DIAGNOSTIC_EQUALITY_TOLERANCE:
        raise RuntimeError("float32 repaired-mirror diagnostic control changed")
    require_strict_positive_diagnostic_clearance(
        positive_actual,
        "positive-control",
    )
    require_strict_positive_diagnostic_clearance(
        repaired_actual,
        "repaired-mirror-control",
    )

    violating_actual = clearance(
        (float32(.25), float32(.25), negative_magnitude),
        positive_triangle,
    )["signed"]
    try:
        require_strict_positive_diagnostic_clearance(
            violating_actual,
            "genuine-inward-violation",
        )
    except RuntimeError:
        violation_rejected = True
    else:
        raise RuntimeError("genuine clearance violation was accepted")

    non_exact_tenth = float32(0.1)
    non_exact_tenth_delta = abs(non_exact_tenth - 0.1)
    if non_exact_tenth_delta <= DIAGNOSTIC_EQUALITY_TOLERANCE:
        raise RuntimeError("float32 parity discriminator no longer reproduces")
    return {
        "schema": "kyx-rev51-float32-diagnostic-controls-v1",
        "positiveInputMeters": magnitude,
        "negativeInputMeters": negative_magnitude,
        "positiveActualMeters": positive_actual,
        "positiveDeltaMeters": positive_delta,
        "repairedMirrorActualMeters": repaired_actual,
        "repairedMirrorDeltaMeters": repaired_delta,
        "genuineViolationMeters": violating_actual,
        "genuineViolationRejected": violation_rejected,
        "nonExactTenthFloat32Meters": non_exact_tenth,
        "nonExactTenthDeltaMeters": non_exact_tenth_delta,
        "equalityToleranceMeters": DIAGNOSTIC_EQUALITY_TOLERANCE,
    }


def segment_hit(start, end, vertices):
    direction = sub(end, start); segment_length = length(direction)
    a, b, c = vertices; ab, ac = sub(b, a), sub(c, a)
    p = cross(direction, ac); determinant = dot(ab, p)
    if abs(determinant) <= 1e-12: return None
    inverse = 1.0 / determinant; offset = sub(start, a)
    u = dot(offset, p) * inverse
    if u < 0 or u > 1: return None
    q = cross(offset, ab); v = dot(direction, q) * inverse
    if v < 0 or u + v > 1: return None
    fraction = dot(ac, q) * inverse
    epsilon = min(1e-9 / segment_length, 1e-6)
    if not epsilon < fraction < 1-epsilon: return None
    return add(start, mul(direction, fraction))


def path_hits(points, triangles, surface):
    hits = []
    for segment, (start, end) in enumerate(zip(points[:-1], points[1:])):
        for triangle in triangles:
            location = segment_hit(start, end, triangle["vertices"])
            if location is None: continue
            pad = length(sub(location, surface))
            if pad > CONTACT_PAD_RADIUS:
                raise RuntimeError(f"segment {segment} crosses outside contact pad: {pad}")
            hits.append((segment, triangle["primitive"], triangle["triangle"], pad))
    return hits


def mesh_triangles(document, binary, role):
    node_name, mesh_name, primitive_count = ROLE_MESH[role]
    node = next((value for value in document["nodes"] if value.get("name") == node_name), None)
    if node is None: raise RuntimeError(f"missing role node {role}")
    mesh = document["meshes"][node["mesh"]]
    if mesh.get("name") != mesh_name:
        raise RuntimeError(f"full-object omission for {role}")
    require_complete_primitive_count(role, len(mesh["primitives"]))
    require_positive_determinant(RUNTIME_SCALE ** 3)
    triangles = []
    primitive_data = []
    for primitive_index, primitive in enumerate(mesh["primitives"]):
        positions = accessor(document, binary, primitive["attributes"]["POSITION"])
        indices = [int(value[0]) for value in accessor(document, binary, primitive["indices"])]
        primitive_data.append((positions, indices))
        for triangle_index in range(len(indices)//3):
            ids = tuple(indices[triangle_index*3:triangle_index*3+3])
            vertices = tuple(mul(source_point(positions[index]), RUNTIME_SCALE) for index in ids)
            normal = unit(cross(sub(vertices[1], vertices[0]), sub(vertices[2], vertices[0])))
            triangles.append({"primitive": primitive_index, "triangle": triangle_index,
                              "indices": ids, "vertices": vertices, "normal": normal})
    return triangles, primitive_data


def verify_fixtures(document, binary):
    result = {}
    meshes = {}
    for role in ROLES:
        triangles, primitive_data = mesh_triangles(document, binary, role)
        meshes[role] = triangles
        result[role] = {}
        for finger in DIGITS:
            primitive, triangle, expected_indices, bary, expected_point, expected_normal = EXPECTED[role][finger]
            positions, indices = primitive_data[primitive]
            actual_indices = tuple(indices[triangle*3:triangle*3+3])
            if actual_indices != expected_indices: raise RuntimeError(f"fixture indices changed: {role}/{finger}")
            vertices_source = tuple(source_point(positions[index]) for index in actual_indices)
            point = tuple(sum(vertex[axis]*weight for vertex, weight in zip(vertices_source, bary)) for axis in range(3))
            if length(sub(point, expected_point)) > POINT_TOLERANCE: raise RuntimeError(f"fixture point changed: {role}/{finger}")
            normal = unit(cross(sub(vertices_source[1], vertices_source[0]), sub(vertices_source[2], vertices_source[0])))
            if dot(normal, expected_normal) < NORMAL_DOT_GATE: raise RuntimeError(f"fixture winding changed: {role}/{finger}")
            surface = mul(point, RUNTIME_SCALE); target = add(surface, mul(normal, .0015))
            witness = clearance(target, triangles)
            if witness["signed"] <= 0: raise RuntimeError(f"target is not exterior: {role}/{finger}")
            result[role][finger] = {"targetSignedClearanceMeters": witness["signed"],
                                    "nearest": [witness["primitive"], witness["triangle"]]}
    return result, meshes


def solve_rev47_witness(mesh):
    root = (.017914250267987, -.048339747315035, .008633032423845)
    target = (.035210505914707, .029410081481866, .069693585876528)
    outward = (1., 0., 0.); pole = (0., -.975924738635, .218107552643)
    lengths = (.040700133889914, .034800115972757, .030100196599960)
    target_to_root = unit(sub(root, target))
    tangent = unit(sub(target_to_root, mul(outward, dot(target_to_root, outward))))
    distal = unit(add(tangent, mul(outward, .04)))
    waypoint_two = add(target, mul(distal, lengths[2]))
    reach = sub(waypoint_two, root); distance = length(reach); direction = unit(reach)
    along = (lengths[0]**2-lengths[1]**2+distance**2)/(2*distance)
    height = math.sqrt(max(0., lengths[0]**2-along**2))
    projected_pole = unit(sub(pole, mul(direction, dot(pole, direction))))
    candidates = [add(add(root, mul(direction, along)), mul(projected_pole, sign*height)) for sign in (1., -1.)]
    selected = max(candidates, key=lambda point: dot(sub(point, target), outward))
    alternate = candidates[1-candidates.index(selected)]
    surface = sub(target, mul(outward, .0015))
    points = {"root": root, "selectedWaypointOne": selected,
              "alternateWaypointOne": alternate, "waypointTwo": waypoint_two,
              "target": target}
    plane = {name: dot(sub(point, target), outward) for name, point in points.items()}
    witnesses = {name: clearance(point, mesh) for name, point in points.items()}
    if not (plane["selectedWaypointOne"] < 0 and plane["alternateWaypointOne"] < 0):
        raise RuntimeError("sealed Rev47 plane regression no longer reproduces")
    if min(item["signed"] for item in witnesses.values()) <= 0:
        raise RuntimeError("sealed Rev47 geometry is not exterior")
    selected_hits = path_hits([root, selected, waypoint_two, target], mesh, surface)
    alternate_hits = path_hits([root, alternate, waypoint_two, target], mesh, surface)
    root_ties = witnesses["root"]["ties"]
    if len(root_ties) < 2 or any(item[2] <= 0 for item in root_ties):
        raise RuntimeError("actual root tie lost positive-consensus semantics")
    tie_125 = next(item for item in root_ties if item[:2] == (0, 125))
    tie_217 = next(item for item in root_ties if item[:2] == (0, 217))
    root_tie_normal_dot = dot(tie_125[3], tie_217[3])
    if not 0.30 < root_tie_normal_dot < 0.35:
        raise RuntimeError("actual root tied normals changed")
    return {"targetPlaneMeters": plane,
            "orientedMeshMeters": {key: value["signed"] for key, value in witnesses.items()},
            "selectedPathContactPadHits": selected_hits,
            "alternatePathContactPadHits": alternate_hits,
            "rootNearestTies": root_ties,
            "rootTieNormalDot": root_tie_normal_dot}


def idle_rotate(value):
    return tuple(
        sum(
            REV51_IDLE_WEAPON_ROTATION_COLUMNS[column][axis] * value[column]
            for column in range(3)
        )
        for axis in range(3)
    )


def idle_transform(value):
    return add(idle_rotate(value), REV51_IDLE_WEAPON_TRANSLATION)


def vector_angle_degrees(a, b):
    return math.degrees(math.acos(max(-1.0, min(1.0, dot(unit(a), unit(b))))))


def verify_rev51_middle_proposal(mesh, fixtures):
    transformed = [
        {
            **triangle,
            "vertices": tuple(idle_transform(value) for value in triangle["vertices"]),
            "normal": unit(idle_rotate(triangle["normal"])),
        }
        for triangle in mesh
    ]
    points = (
        REV51_MIDDLE_ROOT,
        REV51_MIDDLE_WAYPOINT_ONE,
        REV51_MIDDLE_WAYPOINT_TWO,
        REV51_MIDDLE_TARGET,
    )
    source_surface = EXPECTED["dominant"]["middle"][4]
    expected_surface = idle_transform(mul(source_surface, RUNTIME_SCALE))
    expected_normal = unit(idle_rotate(EXPECTED["dominant"]["middle"][5]))
    expected_target = add(
        expected_surface,
        mul(expected_normal, FIXTURE_OFFSET_METERS),
    )
    if length(sub(expected_surface, REV51_MIDDLE_SURFACE)) > POINT_TOLERANCE:
        raise RuntimeError("Rev51 proposal surface transform changed")
    if length(sub(expected_target, REV51_MIDDLE_TARGET)) > POINT_TOLERANCE:
        raise RuntimeError("Rev51 proposal target transform/offset changed")
    actual_lengths = tuple(
        length(sub(points[index + 1], points[index])) for index in range(3)
    )
    length_errors = tuple(
        abs(actual - expected)
        for actual, expected in zip(actual_lengths, REV51_MIDDLE_LENGTHS)
    )
    if max(length_errors) > 2e-6:
        raise RuntimeError(f"Rev51 proposal changed exact lengths: {length_errors}")
    witnesses = tuple(clearance(point, transformed) for point in points)
    signed = tuple(value["signed"] for value in witnesses)
    if min(signed) <= 0.0:
        raise RuntimeError(f"Rev51 proposal is not strictly exterior: {signed}")
    intersections = path_hits(points, transformed, REV51_MIDDLE_SURFACE)
    if intersections:
        raise RuntimeError(f"Rev51 proposal unexpectedly consumes contact pad: {intersections}")
    directions = tuple(
        unit(sub(points[index + 1], points[index])) for index in range(3)
    )
    angles = (
        vector_angle_degrees(REV51_MIDDLE_REST_DIRECTION, directions[0]),
        vector_angle_degrees(directions[0], directions[1]),
        vector_angle_degrees(directions[1], directions[2]),
    )
    if max(abs(a - b) for a, b in zip(angles, REV51_EXPECTED_JOINT_ANGLES)) > 1e-9:
        raise RuntimeError(f"Rev51 outgoing-segment angle semantics changed: {angles}")
    margins = tuple(150.0 - value for value in angles)
    wrap = sum(angles)
    if min(margins) <= 0.0 or wrap < 115.0:
        raise RuntimeError("Rev51 proposal joint/wrap margin failed")

    order = ("index", "middle", "ring", "pinky")
    surfaces = {}
    for finger in order:
        source = EXPECTED["dominant"][finger][4]
        surfaces[finger] = idle_transform(mul(source, RUNTIME_SCALE))
    axis = unit(sub(surfaces["index"], surfaces["pinky"]))
    projections = {finger: dot(surfaces[finger], axis) for finger in order}
    spacings = tuple(
        length(sub(surfaces[order[index]], surfaces[order[index + 1]]))
        for index in range(3)
    )
    if not all(
        projections[order[index]] > projections[order[index + 1]]
        for index in range(3)
    ) or min(spacings) < .014:
        raise RuntimeError("Rev51 proposal order/spacing failed")

    # Full mirror is an isometry: reflect geometry, normals, points, surface,
    # and rest direction together. It must preserve validity and angle values.
    mirror = lambda value: (-value[0], value[1], value[2])
    mirrored_mesh = []
    for triangle in transformed:
        mirrored_vertices = tuple(
            mirror(value) for value in triangle["vertices"]
        )
        # A reflection reverses handedness. Reverse the mirrored winding so the
        # transformed outward normal remains consistent with the exact mesh.
        mirrored_mesh.append({
            **triangle,
            "vertices": (
                mirrored_vertices[0],
                mirrored_vertices[2],
                mirrored_vertices[1],
            ),
            "normal": mirror(triangle["normal"]),
        })
    mirrored_points = tuple(mirror(value) for value in points)
    mirrored_signed = tuple(
        clearance(point, mirrored_mesh)["signed"] for point in mirrored_points
    )
    mirrored_directions = tuple(
        unit(sub(mirrored_points[index + 1], mirrored_points[index]))
        for index in range(3)
    )
    mirrored_angles = (
        vector_angle_degrees(mirror(REV51_MIDDLE_REST_DIRECTION), mirrored_directions[0]),
        vector_angle_degrees(mirrored_directions[0], mirrored_directions[1]),
        vector_angle_degrees(mirrored_directions[1], mirrored_directions[2]),
    )
    if max(abs(a - b) for a, b in zip(signed, mirrored_signed)) > 1e-12:
        raise RuntimeError("full mirror changed proposal clearance")
    if max(abs(a - b) for a, b in zip(angles, mirrored_angles)) > 1e-12:
        raise RuntimeError("full mirror changed proposal joint semantics")
    if path_hits(mirrored_points, mirrored_mesh, mirror(REV51_MIDDLE_SURFACE)):
        raise RuntimeError("full mirror changed proposal intersections")
    # A partial mirror may coincidentally land outside another mesh face, so it
    # is not a sound negative when classified by nearest-triangle clearance.
    # Instead hold the authoritative surface/normal fixed and mirror only the
    # target. That must destroy the exact +1.5 mm fixture-offset contract.
    partial_offset = dot(
        sub(mirror(REV51_MIDDLE_TARGET), REV51_MIDDLE_SURFACE),
        unit(sub(REV51_MIDDLE_TARGET, REV51_MIDDLE_SURFACE)),
    )
    partial_mirror_rejected = (
        abs(partial_offset - FIXTURE_OFFSET_METERS)
        > FIXTURE_OFFSET_REPRESENTATION_TOLERANCE_METERS
    )
    if not partial_mirror_rejected:
        raise RuntimeError("partial mirror preserved the fixture-offset contract")

    source_current = (-.137786284089, -.162839849790, -.220648328463)
    source_proposal = source_surface
    displacement = length(mul(sub(source_proposal, source_current), RUNTIME_SCALE))
    published_displacement = .013760639016548178
    if abs(displacement - published_displacement) > POINT_TOLERANCE:
        raise RuntimeError("Rev51 same-face displacement changed")
    return {
        "fixture": {
            "node": ROLE_MESH["dominant"][0],
            "mesh": ROLE_MESH["dominant"][1],
            "primitive": 0,
            "triangle": 55,
            "indices": [305, 389, 358],
            "barycentric": [.5, .125, .375],
            "sourceSurface": list(source_proposal),
            "sourceNormal": [-1., 0., 0.],
            "samePlanarFaceDisplacementMeters": displacement,
            "publishedAuditDisplacementMeters": published_displacement,
            "publishedAuditDisplacementDeltaMeters": abs(
                displacement - published_displacement
            ),
        },
        "pointsRigLocalMeters": [list(value) for value in points],
        "lengthsMeters": list(actual_lengths),
        "lengthErrorsMeters": list(length_errors),
        "pointClearancesMeters": list(signed),
        "segmentIntersections": intersections,
        "jointAnglesDegrees": list(angles),
        "jointMarginsDegrees": list(margins),
        "wrapDegrees": wrap,
        "wrapMarginDegrees": wrap - 115.0,
        "orderProjections": projections,
        "adjacentSpacingMeters": list(spacings),
        "mirrorControls": {
            "fullMirrorPreserved": True,
            "partialMirrorRejected": partial_mirror_rejected,
        },
    }


def verify_rev51_route_contract(core):
    assignments = evaluate_assignments(core)
    expected = {
        "VLR7_ROUTE_TEMPORAL_SHAPE_DELTA_GATE_METERS": .012,
        "VLR7_ROUTE_THETA_DIVISIONS": 16,
        "VLR7_ROUTE_PSI_DIVISIONS": 32,
        "VLR7_ROUTE_PHI_DIVISIONS": 72,
        "VLR7_ROUTE_DOMINANT_MIDDLE_THETA_INDICES": (7, 8, 9),
        "VLR7_ROUTE_DOMINANT_MIDDLE_PSI_INDICES": (25, 26, 27),
        "VLR7_ROUTE_DOMINANT_MIDDLE_PHI_INDICES": (67, 68, 69, 70, 71),
        "VLR7_ROUTE_DOMINANT_MIDDLE_ACCEPTED_SEED": (8, 26, 69),
    }
    for key, value in expected.items():
        if assignments.get(key) != value:
            raise RuntimeError(f"Rev51 route contract changed: {key}")
    ordered_ids = expected_route_order("dominant", "middle")
    grid_ids = ordered_ids[:-2]
    if len(grid_ids) != 45 or len(set(grid_ids)) != 45:
        raise RuntimeError("Rev51 route grid cardinality changed")
    accepted_id = "grid-t08-p26-f69"
    if not grid_ids or grid_ids[0] != accepted_id:
        raise RuntimeError("Rev51 accepted route seed/order changed")

    outward = unit(sub(REV51_MIDDLE_TARGET, REV51_MIDDLE_SURFACE))
    target_to_root_direction = unit(
        sub(REV51_MIDDLE_ROOT, REV51_MIDDLE_TARGET)
    )
    tangent = unit(sub(
        target_to_root_direction,
        mul(outward, dot(target_to_root_direction, outward)),
    ))
    lateral = unit(cross(outward, tangent))
    theta = math.pi * 8 / 16
    psi = 2.0 * math.pi * 26 / 32
    phi = 2.0 * math.pi * 69 / 72
    distal = unit(add(
        mul(outward, math.cos(theta)),
        mul(
            add(mul(tangent, math.cos(psi)), mul(lateral, math.sin(psi))),
            math.sin(theta),
        ),
    ))
    waypoint_two = add(
        REV51_MIDDLE_TARGET,
        mul(distal, REV51_MIDDLE_LENGTHS[2]),
    )
    reach = sub(waypoint_two, REV51_MIDDLE_ROOT)
    reach_distance = length(reach)
    reach_direction = unit(reach)
    along = (
        REV51_MIDDLE_LENGTHS[0] ** 2
        - REV51_MIDDLE_LENGTHS[1] ** 2
        + reach_distance ** 2
    ) / (2.0 * reach_distance)
    height = math.sqrt(max(
        0.0,
        REV51_MIDDLE_LENGTHS[0] ** 2 - along ** 2,
    ))
    source_depth = unit((0.0, -0.975924738635, 0.218107552643))
    pole_hint = unit(idle_rotate(source_depth))
    pole = unit(sub(
        pole_hint,
        mul(reach_direction, dot(pole_hint, reach_direction)),
    ))
    circle_binormal = unit(cross(reach_direction, pole))
    radial = unit(add(mul(pole, math.cos(phi)), mul(circle_binormal, math.sin(phi))))
    waypoint_one = add(
        add(REV51_MIDDLE_ROOT, mul(reach_direction, along)),
        mul(radial, height),
    )
    seed_deltas = {
        "waypointOneMeters": length(sub(
            waypoint_one, REV51_MIDDLE_WAYPOINT_ONE
        )),
        "waypointTwoMeters": length(sub(
            waypoint_two, REV51_MIDDLE_WAYPOINT_TWO
        )),
    }
    if max(seed_deltas.values()) > POINT_TOLERANCE or dot(radial, pole) <= 0.0:
        raise RuntimeError(
            f"Rev51 accepted seed no longer reconstructs proposal: {seed_deltas}"
        )

    def select(records, previous=None):
        valid = [value for value in records if value["valid"]]
        eligible = [
            value for value in valid
            if previous is None or value["delta"] <= .012
        ]
        if not eligible:
            raise RuntimeError("no valid temporally eligible route")
        retained = (
            [value for value in eligible if value["id"] == previous]
            if previous is not None else []
        )
        return (
            retained[0] if retained else min(
                eligible,
                key=lambda value: (value["delta"], value["priority"], value["id"]),
            )
        )["id"]

    controls = {
        "valid-selected-invalid-alternate": select([
            {"id": accepted_id, "valid": True, "delta": 0., "priority": 0},
            {"id": "alternate", "valid": False, "delta": 0., "priority": 1},
        ]),
        "invalid-selected-valid-alternate": select([
            {"id": accepted_id, "valid": False, "delta": 0., "priority": 0},
            {"id": "alternate", "valid": True, "delta": .001, "priority": 1},
        ]),
        "both-valid": select([
            {"id": accepted_id, "valid": True, "delta": .002, "priority": 0},
            {"id": "alternate", "valid": True, "delta": .001, "priority": 1},
        ]),
        "retain-stable-id": select([
            {"id": accepted_id, "valid": True, "delta": .002, "priority": 0},
            {"id": "alternate", "valid": True, "delta": .001, "priority": 1},
        ], accepted_id),
    }
    for label, records, previous in (
        ("both-invalid", [
            {"id": accepted_id, "valid": False, "delta": 0., "priority": 0},
            {"id": "alternate", "valid": False, "delta": 0., "priority": 1},
        ], None),
        ("temporal-overflow", [
            {"id": accepted_id, "valid": True, "delta": .012000001, "priority": 0},
        ], accepted_id),
    ):
        try:
            select(records, previous)
        except RuntimeError:
            controls[label] = "REJECTED"
        else:
            raise RuntimeError(f"Rev51 negative selection control accepted: {label}")
    return {
        "schema": "kyx-rev51-bounded-route-contract-v1",
        "dominantMiddleGridCount": len(grid_ids),
        "dominantMiddleTotalHardCap": len(grid_ids) + 2,
        "otherDigitHardCap": 2,
        "acceptedSeedId": accepted_id,
        "acceptedSeedReconstruction": {
            "waypointOne": list(waypoint_one),
            "waypointTwo": list(waypoint_two),
            "deltasMeters": seed_deltas,
            "handednessPoleDot": dot(radial, pole),
        },
        "finiteResolution": {
            "thetaDivisions": 16,
            "psiDivisions": 32,
            "phiDivisions": 72,
            "sampledNotGlobal": True,
        },
        "selectionControls": controls,
    }


def negative_controls(meshes, fixture_result):
    failures = []
    mesh = meshes["dominant"]
    surface = mul(EXPECTED["dominant"]["index"][4], RUNTIME_SCALE)
    normal = EXPECTED["dominant"]["index"][5]
    for label, point in (("inward", add(surface, mul(normal, -.001))), ("on-surface", surface)):
        if clearance(point, mesh)["signed"] > 0: raise RuntimeError(f"{label} control accepted")
        failures.append(label)
    synthetic = [{"primitive": 0, "triangle": 0, "vertices": ((0.,0.,0.),(1.,0.,0.),(0.,1.,0.)), "normal": (0.,0.,1.)},
                 {"primitive": 1, "triangle": 0, "vertices": ((0.,0.,0.),(1.,0.,0.),(0.,1.,0.)), "normal": (0.,0.,-1.)}]
    try: clearance((.2,.2,.1), synthetic)
    except RuntimeError: failures.append("sign-conflicting-tie")
    else: raise RuntimeError("sign-conflicting tie accepted")
    for label, action in (("missing", lambda: clearance((0.,0.,0.), [])),
                          ("nan", lambda: clearance((math.nan,0.,0.), mesh)),
                          ("degenerate", lambda: unit((0.,0.,0.)))):
        try: action()
        except RuntimeError: failures.append(label)
        else: raise RuntimeError(f"{label} control accepted")
    for role in ROLES:
        role_mesh = meshes[role]
        surface_point = EXPECTED[role]["index"][4]
        surface_normal = EXPECTED[role]["index"][5]
        target = add(
            mul(surface_point, RUNTIME_SCALE),
            mul(surface_normal, .0015),
        )
        reversed_winding_mesh = []
        reversed_normal_mesh = []
        for triangle in role_mesh:
            a, b, c = triangle["vertices"]
            reversed_vertices = (a, c, b)
            reversed_winding_mesh.append({
                **triangle,
                "vertices": reversed_vertices,
                "normal": unit(cross(sub(c, a), sub(b, a))),
            })
            reversed_normal_mesh.append({
                **triangle,
                "normal": mul(triangle["normal"], -1.0),
            })
        if clearance(target, reversed_winding_mesh)["signed"] >= 0:
            raise RuntimeError(f"exact reversed winding accepted: {role}")
        if clearance(target, reversed_normal_mesh)["signed"] >= 0:
            raise RuntimeError(f"exact reversed normal accepted: {role}")
        failures.extend((
            f"exact-{role}-reversed-winding",
            f"exact-{role}-reversed-normal",
        ))
    valid_vertices = ((0.,0.,0.), (1.,0.,0.), (0.,1.,0.))
    expected_normal = (0.,0.,1.)
    reversed_winding_normal = unit(cross(
        sub(valid_vertices[2], valid_vertices[0]),
        sub(valid_vertices[1], valid_vertices[0]),
    ))
    if dot(reversed_winding_normal, expected_normal) >= NORMAL_DOT_GATE:
        raise RuntimeError("reversed winding accepted")
    failures.append("synthetic-reversed-winding")
    if dot(expected_normal, mul(expected_normal, -1.)) >= NORMAL_DOT_GATE:
        raise RuntimeError("reversed normal accepted")
    failures.append("synthetic-reversed-normal")
    controls = [
        ("mirrored-determinant", lambda: require_positive_determinant(-1.0)),
    ]
    controls.extend(
        (
            f"{role}-primitive-omission",
            lambda role=role: require_complete_primitive_count(
                role, ROLE_MESH[role][2] - 1
            ),
        )
        for role in ROLES
    )
    for label, action in controls:
        try: action()
        except RuntimeError: failures.append(label)
        else: raise RuntimeError(f"{label} control accepted")
    repaired_triangle = [{
        "primitive": 0,
        "triangle": 0,
        "vertices": (valid_vertices[0], valid_vertices[2], valid_vertices[1]),
        "normal": mul(expected_normal, -1.),
    }]
    repaired = clearance(
        (.2, .2, -DIAGNOSTIC_CLEARANCE_MAGNITUDE),
        repaired_triangle,
    )
    if (
        abs(repaired["signed"] - DIAGNOSTIC_CLEARANCE_MAGNITUDE)
        > DIAGNOSTIC_EQUALITY_TOLERANCE
    ):
        raise RuntimeError("repaired-mirror magnitude control failed")
    if fixture_result["dominant"]["index"]["targetSignedClearanceMeters"] <= 0: raise RuntimeError("magnitude repair failed")
    failures.append("repaired-mirror-magnitude")
    return failures


def expected_route_order(role, finger):
    legacy = ["legacy-positive", "legacy-negative"]
    if (role, finger) != ("dominant", "middle"):
        return legacy
    accepted = (8, 26, 69)
    grid = []
    for theta in (7, 8, 9):
        for psi in (25, 26, 27):
            for phi in (67, 68, 69, 70, 71):
                candidate_id = f"grid-t{theta:02d}-p{psi:02d}-f{phi:02d}"
                priority = (
                    abs(theta - accepted[0])
                    + abs(psi - accepted[1])
                    + abs(phi - accepted[2])
                )
                grid.append((priority, candidate_id))
    grid.sort(key=lambda value: (value[0], value[1]))
    return [candidate_id for _priority, candidate_id in grid] + legacy


def validate_route_intersections(hits, primitive_count):
    if not isinstance(hits, list):
        raise RuntimeError("route intersection witness is missing")
    for hit in hits:
        if (
            not isinstance(hit, dict)
            or hit.get("segment") not in (0, 1, 2)
            or not isinstance(hit.get("primitive"), int)
            or not 0 <= hit["primitive"] < primitive_count
            or not isinstance(hit.get("triangle"), int)
            or hit["triangle"] < 0
            or not isinstance(hit.get("distanceAlongSegmentMeters"), (int, float))
            or not math.isfinite(hit["distanceAlongSegmentMeters"])
            or hit["distanceAlongSegmentMeters"] < 0
            or not isinstance(hit.get("distanceToContactPadMeters"), (int, float))
            or not math.isfinite(hit["distanceToContactPadMeters"])
            or not 0 <= hit["distanceToContactPadMeters"] <= CONTACT_PAD_RADIUS
        ):
            raise RuntimeError("invalid oriented-mesh segment witness")


def validate_route_clearance(clearances, primitive_count):
    if set(clearances or {}) != {
        "mcpRoot", "waypointOne", "waypointTwo", "contactTarget"
    }:
        raise RuntimeError("route clearance cardinality changed")
    for value in clearances.values():
        signed = value.get("signedClearanceMeters")
        distance = value.get("distanceMeters")
        primitive = value.get("nearestPrimitive")
        triangle = value.get("nearestTriangle")
        if (
            not isinstance(signed, (int, float))
            or not math.isfinite(signed)
            or signed <= 0
            or not isinstance(distance, (int, float))
            or not math.isfinite(distance)
            or distance < 0
            or not isinstance(primitive, int)
            or not 0 <= primitive < primitive_count
            or not isinstance(triangle, int)
            or triangle < 0
            or not isinstance(value.get("tiedTriangles"), list)
        ):
            raise RuntimeError("invalid oriented-mesh point witness")


def finite_vector(value, cardinality):
    return (
        isinstance(value, list)
        and len(value) == cardinality
        and all(
            isinstance(component, (int, float)) and math.isfinite(component)
            for component in value
        )
    )


def validate_digit_stage_record(record):
    role = record.get("role")
    finger = record.get("finger")
    if role not in ROLES or finger not in DIGITS:
        raise RuntimeError("digit preflight role/finger changed")
    primitive_count = ROLE_MESH[role][2]
    validate_route_clearance(record.get("clearance"), primitive_count)
    validate_route_intersections(
        record.get("selectedPathOrientedMeshIntersections"),
        primitive_count,
    )
    expected_order = expected_route_order(role, finger)
    reports = record.get("candidateReports")
    if (
        record.get("routeFamilySchema")
        != "kyx-rev51-bounded-stable-id-route-family-v1"
        or record.get("routeFamilyCandidateCount") != len(expected_order)
        or record.get("routeFamilyOrder") != expected_order
        or not isinstance(reports, list)
        or len(reports) != len(expected_order)
    ):
        raise RuntimeError(f"Rev51 route family changed: {role}/{finger}")
    qualified_ids = []
    selected_reports = []
    for schedule_index, (candidate_id, candidate) in enumerate(
        zip(expected_order, reports)
    ):
        if (
            not isinstance(candidate, dict)
            or candidate.get("id") != candidate_id
            or candidate.get("scheduleIndex") != schedule_index
            or not isinstance(candidate.get("priority"), int)
            or not isinstance(candidate.get("source"), str)
            or not candidate["source"]
            or not isinstance(candidate.get("qualified"), bool)
            or not isinstance(candidate.get("rejectionReasons"), list)
        ):
            raise RuntimeError("route candidate identity/order changed")
        if candidate.get("selected") is True:
            selected_reports.append(candidate)
        if not candidate["qualified"]:
            if not candidate["rejectionReasons"] or candidate.get("selected") is True:
                raise RuntimeError("rejected route lacks reason or was selected")
            continue
        if candidate["rejectionReasons"]:
            raise RuntimeError("qualified route contains rejection reasons")
        qualified_ids.append(candidate_id)
        points = candidate.get("pointsRigLocalMeters")
        errors = candidate.get("lengthErrorsMeters")
        angles = candidate.get("jointAnglesDegrees")
        margins = candidate.get("jointMarginsDegrees")
        wrap = candidate.get("wrapDegrees")
        handedness = candidate.get("handednessPoleDot")
        temporal_delta = candidate.get("temporalShapeDeltaMeters")
        shape = candidate.get("shapeVectorsMeters")
        if (
            not isinstance(points, list)
            or len(points) != 4
            or not all(finite_vector(value, 3) for value in points)
            or not finite_vector(errors, 3)
            or max(errors) > POINT_TOLERANCE
            or not finite_vector(angles, 3)
            or not finite_vector(margins, 3)
            or max(angles) > 150.0
            or max(
                abs(margin - (150.0 - angle))
                for margin, angle in zip(margins, angles)
            ) > 1e-8
            or not isinstance(wrap, (int, float))
            or not math.isfinite(wrap)
            or abs(wrap - sum(angles)) > 1e-8
            or not isinstance(handedness, (int, float))
            or not math.isfinite(handedness)
            or handedness <= 0.0
            or not isinstance(temporal_delta, (int, float))
            or not math.isfinite(temporal_delta)
            or temporal_delta < 0.0
            or not isinstance(shape, list)
            or len(shape) != 3
            or not all(finite_vector(value, 3) for value in shape)
        ):
            raise RuntimeError("qualified route geometry/joint telemetry changed")
        recomputed_shape = [
            list(sub(points[index + 1], points[index]))
            for index in range(3)
        ]
        if max(
            length(sub(reported, expected))
            for reported, expected in zip(shape, recomputed_shape)
        ) > 1e-10:
            raise RuntimeError("route directed-link telemetry changed")
        if role == "dominant" and finger in ("middle", "ring", "pinky"):
            if wrap < 115.0:
                raise RuntimeError("dominant wrap gate changed")
        if role == "support" and finger in ("index", "middle", "ring", "pinky"):
            if wrap < 65.0:
                raise RuntimeError("support wrap gate changed")
        if role == "dominant" and finger == "index" and wrap > 75.0:
            raise RuntimeError("trigger-discipline wrap gate changed")
        validate_route_clearance(
            candidate.get("orientedMeshClearance"), primitive_count
        )
        validate_route_intersections(
            candidate.get("pathOrientedMeshIntersections"), primitive_count
        )
    if record.get("validCandidateIds") != qualified_ids or not qualified_ids:
        raise RuntimeError("valid route set changed or is empty")
    if len(selected_reports) != 1:
        raise RuntimeError("route selection cardinality changed")
    selected = selected_reports[0]
    selected_id = record.get("selectedCandidateId")
    if selected.get("id") != selected_id or selected_id not in qualified_ids:
        raise RuntimeError("selected route is not in the qualified set")
    if record.get("clearance") != selected.get("orientedMeshClearance"):
        raise RuntimeError("selected route clearance summary changed")
    if (
        record.get("selectedPathOrientedMeshIntersections")
        != selected.get("pathOrientedMeshIntersections")
        or record.get("jointAnglesDegrees") != selected.get("jointAnglesDegrees")
        or record.get("jointMarginsDegrees") != selected.get("jointMarginsDegrees")
        or record.get("wrapDegrees") != selected.get("wrapDegrees")
        or record.get("handednessPoleDot") != selected.get("handednessPoleDot")
    ):
        raise RuntimeError("selected route summary/report diverged")
    delta = record.get("temporalShapeDeltaMeters")
    gate = record.get("temporalShapeDeltaGateMeters")
    if (
        gate != .012
        or delta != selected.get("temporalShapeDeltaMeters")
        or not isinstance(delta, (int, float))
        or not math.isfinite(delta)
        or not 0.0 <= delta <= gate
    ):
        raise RuntimeError("route temporal continuity gate changed")
    method = record.get("selectionMethod")
    previous = record.get("previousCandidateId")
    if method not in {
        "first-frame-priority",
        "retain-valid-stable-id",
        "bounded-continuity-switch",
    }:
        raise RuntimeError("route selection method changed")
    return {
        "selectedCandidateId": selected_id,
        "previousCandidateId": previous,
        "selectionMethod": method,
        "temporalShapeDeltaMeters": delta,
        "shapeVectorsMeters": selected["shapeVectorsMeters"],
    }


def verify_stage_records(records):
    expected_digits = {(role, finger) for role in ROLES for finger in DIGITS}
    expected_frames = {}
    for action, (library, source, count, _contact) in EXPECTED_ACTION_CONTRACT.items():
        for source_frame in range(count):
            key = (action, library, source, source_frame, source_frame + 1)
            expected_frames[key] = action
    action_entries = {}
    frame_entry_counts = {}
    digit_counts = {}
    frame_completion_counts = {}
    frame_commit_counts = {}
    frame_selected_ids = {}
    frame_pending_states = {}
    action_completion_counts = {}
    route_reset_counts = {}
    temporal_state = {}
    latest_frame = None
    top_entries = 0
    top_completions = 0
    top_exceptions = 0
    for expected_sequence, record in enumerate(records, start=1):
        if record.get("sequence") != expected_sequence:
            raise RuntimeError(
                "stage sequence is missing, duplicated, or out of order: "
                f"expected={expected_sequence} actual={record.get('sequence')}"
            )
        if record.get("schema") != "kyx-rev51-stage-observation-v1":
            raise RuntimeError("stage schema changed")
        if record.get("candidate") != EXPECTED_CANDIDATE:
            raise RuntimeError("stage candidate changed")
        stage = record.get("stage")
        if stage == "top_level_main_entry":
            top_entries += 1
        elif stage == "top_level_main_complete":
            top_completions += 1
        elif stage == "top_level_exception":
            top_exceptions += 1
        elif stage == "route_temporal_state_action_reset":
            action = record.get("outputAction")
            if (
                action not in EXPECTED_ACTION_CONTRACT
                or not EXPECTED_ACTION_CONTRACT[action][3]
            ):
                raise RuntimeError(f"unexpected route reset: {action}")
            library, source, _count, _contact = EXPECTED_ACTION_CONTRACT[action]
            if (
                record.get("sourceLibrary") != library
                or record.get("sourceAction") != source
                or record.get("expectedDigitCount") != 10
            ):
                raise RuntimeError(f"route reset contract changed: {action}")
            route_reset_counts[action] = route_reset_counts.get(action, 0) + 1
            if route_reset_counts[action] != 1:
                raise RuntimeError(f"duplicate route reset: {action}")
            temporal_state[action] = {}
            latest_frame = None
        elif stage == "action_entry":
            action = record.get("outputAction")
            if action not in EXPECTED_ACTION_CONTRACT:
                raise RuntimeError(f"unexpected action entry: {action}")
            library, source, count, contact = EXPECTED_ACTION_CONTRACT[action]
            if (
                record.get("sourceLibrary") != library
                or record.get("sourceAction") != source
                or record.get("sourceFrameEnd") != count - 1
            ):
                raise RuntimeError(f"action entry contract changed: {action}")
            if contact and route_reset_counts.get(action) != 1:
                raise RuntimeError(f"contact action lacks prior route reset: {action}")
            if not contact and action in route_reset_counts:
                raise RuntimeError(f"non-contact action received route reset: {action}")
            action_entries[action] = action_entries.get(action, 0) + 1
        elif stage == "action_frame_entry":
            key = (
                record.get("outputAction"),
                record.get("sourceLibrary"),
                record.get("sourceAction"),
                record.get("sourceFrame"),
                record.get("outputFrame"),
            )
            if key not in expected_frames:
                raise RuntimeError(f"unexpected action/frame tuple: {key}")
            latest_frame = key
            frame_entry_counts[key] = frame_entry_counts.get(key, 0) + 1
        elif stage == "digit_oriented_mesh_preflight_pass":
            if latest_frame is None:
                raise RuntimeError("digit preflight lacks action/frame")
            action = latest_frame[0]
            if not EXPECTED_ACTION_CONTRACT[action][3]:
                raise RuntimeError(
                    f"digit preflight polluted non-contact action: {action}"
                )
            route = validate_digit_stage_record(record)
            key = (record["role"], record["finger"])
            frame_digits = digit_counts.setdefault(latest_frame, {})
            frame_digits[key] = frame_digits.get(key, 0) + 1
            previous_state = temporal_state[action].get(key)
            if previous_state is None:
                if (
                    route["previousCandidateId"] is not None
                    or route["selectionMethod"] != "first-frame-priority"
                    or route["temporalShapeDeltaMeters"] != 0.0
                ):
                    raise RuntimeError("first-frame route state changed")
                recomputed_delta = 0.0
            else:
                previous_id = previous_state["candidateId"]
                if route["previousCandidateId"] != previous_id:
                    raise RuntimeError("route previous stable ID changed")
                expected_method = (
                    "retain-valid-stable-id"
                    if route["selectedCandidateId"] == previous_id
                    else "bounded-continuity-switch"
                )
                if route["selectionMethod"] != expected_method:
                    raise RuntimeError("route retention/switch semantics changed")
                recomputed_delta = max(
                    length(sub(current, previous_vector))
                    for current, previous_vector in zip(
                        route["shapeVectorsMeters"],
                        previous_state["shapeVectorsMeters"],
                    )
                )
            if (
                abs(route["temporalShapeDeltaMeters"] - recomputed_delta)
                > 1e-10
                or recomputed_delta > .012
            ):
                raise RuntimeError("route temporal scalar was not recomputed")
            frame_routes = frame_selected_ids.setdefault(latest_frame, {})
            if key in frame_routes:
                raise RuntimeError("duplicate route selection in frame")
            frame_routes[key] = route["selectedCandidateId"]
            pending = frame_pending_states.setdefault(latest_frame, {})
            pending[key] = {
                "candidateId": route["selectedCandidateId"],
                "shapeVectorsMeters": route["shapeVectorsMeters"],
            }
        elif stage == "all_digit_oriented_mesh_preflights_post_validation":
            if latest_frame is None:
                raise RuntimeError("digit completion lacks action/frame")
            if not EXPECTED_ACTION_CONTRACT[latest_frame[0]][3]:
                raise RuntimeError("digit completion polluted non-contact action")
            if record.get("digitCount") != 10:
                raise RuntimeError("digit completion count changed")
            frame_completion_counts[latest_frame] = (
                frame_completion_counts.get(latest_frame, 0) + 1
            )
        elif stage == "all_digit_route_temporal_state_commit_post_validation":
            if latest_frame is None:
                raise RuntimeError("route commit lacks action/frame")
            action = latest_frame[0]
            if (
                not EXPECTED_ACTION_CONTRACT[action][3]
                or record.get("action") != action
                or record.get("digitCount") != 10
                or record.get("shapeDeltaGateMeters") != .012
                or frame_completion_counts.get(latest_frame) != 1
            ):
                raise RuntimeError("route commit contract/order changed")
            selected = frame_selected_ids.get(latest_frame, {})
            expected_selected = {
                f"{role}/{finger}": selected[(role, finger)]
                for role in ROLES
                for finger in DIGITS
            } if set(selected) == expected_digits else {}
            if record.get("selectedCandidateIds") != expected_selected:
                raise RuntimeError("route commit selection set changed")
            frame_commit_counts[latest_frame] = (
                frame_commit_counts.get(latest_frame, 0) + 1
            )
            if frame_commit_counts[latest_frame] != 1:
                raise RuntimeError("duplicate route temporal commit")
            pending = frame_pending_states.get(latest_frame, {})
            if set(pending) != expected_digits:
                raise RuntimeError("route commit lacks ten pending link states")
            temporal_state[action] = {
                key: {
                    "candidateId": state["candidateId"],
                    "shapeVectorsMeters": [list(value) for value in state[
                        "shapeVectorsMeters"
                    ]],
                }
                for key, state in pending.items()
            }
        elif stage == "action_frames_complete":
            action = record.get("outputAction")
            if action not in EXPECTED_ACTION_CONTRACT:
                raise RuntimeError(f"unexpected action completion: {action}")
            _library, _source, count, contact = EXPECTED_ACTION_CONTRACT[action]
            if (
                record.get("sampledFrames") != count
                or record.get("contactSamples") != (count if contact else 0)
            ):
                raise RuntimeError(f"action completion contract changed: {action}")
            action_completion_counts[action] = (
                action_completion_counts.get(action, 0) + 1
            )
    if top_entries != 1 or top_completions != 1 or top_exceptions != 0:
        raise RuntimeError(
            "top-level completion contract failed: "
            f"entry={top_entries} complete={top_completions} "
            f"exceptions={top_exceptions}"
        )
    for action in EXPECTED_ACTION_CONTRACT:
        if action_entries.get(action) != 1:
            raise RuntimeError(f"missing/duplicate action entry: {action}")
        if action_completion_counts.get(action) != 1:
            raise RuntimeError(f"missing/duplicate action completion: {action}")
        expected_reset_count = 1 if EXPECTED_ACTION_CONTRACT[action][3] else 0
        if route_reset_counts.get(action, 0) != expected_reset_count:
            raise RuntimeError(f"route reset count changed: {action}")
    contact_frames = 0
    digit_passes = 0
    for frame, action in expected_frames.items():
        if frame_entry_counts.get(frame) != 1:
            raise RuntimeError(f"missing/duplicate action frame: {frame}")
        if EXPECTED_ACTION_CONTRACT[action][3]:
            contact_frames += 1
            counts = digit_counts.get(frame, {})
            if set(counts) != expected_digits or any(
                value != 1 for value in counts.values()
            ):
                raise RuntimeError(f"missing/duplicate digit preflight: {frame}")
            if frame_completion_counts.get(frame) != 1:
                raise RuntimeError(f"missing/duplicate frame completion: {frame}")
            if frame_commit_counts.get(frame) != 1:
                raise RuntimeError(f"missing/duplicate route commit: {frame}")
            digit_passes += sum(counts.values())
        elif (
            frame in digit_counts
            or frame in frame_completion_counts
            or frame in frame_commit_counts
            or frame in frame_selected_ids
            or frame in frame_pending_states
        ):
            raise RuntimeError(f"non-contact frame contains digit proof: {frame}")
    if contact_frames != EXPECTED_CONTACT_FRAME_COUNT:
        raise RuntimeError("contact frame total changed")
    if digit_passes != EXPECTED_CONTACT_DIGIT_PASS_COUNT:
        raise RuntimeError("contact digit-pass total changed")
    return {
        "actionCount": len(action_entries),
        "allActionFrameCount": len(expected_frames),
        "contactActionCount": 6,
        "contactFrameCount": contact_frames,
        "digitWitnessCount": digit_passes,
        "routeTemporalCommitCount": sum(frame_commit_counts.values()),
        "topLevelMainComplete": True,
    }


def synthetic_stage_records():
    records = []
    sequence = 0

    def add_record(stage, **payload):
        nonlocal sequence
        sequence += 1
        records.append({
            "schema": "kyx-rev51-stage-observation-v1",
            "candidate": EXPECTED_CANDIDATE,
            "sequence": sequence,
            "stage": stage,
            **payload,
        })

    def clearance_record():
        return {
            name: {
                "signedClearanceMeters": 0.001,
                "distanceMeters": 0.001,
                "nearestPrimitive": 0,
                "nearestTriangle": 0,
                "nearestTieCount": 1,
                "tiedTriangles": [{
                    "primitive": 0,
                    "triangle": 0,
                    "signedClearanceMeters": 0.001,
                }],
                "closestPointRigLocalMeters": [0.0, 0.0, 0.0],
                "outwardNormalRigLocal": [1.0, 0.0, 0.0],
            }
            for name in (
                "mcpRoot", "waypointOne", "waypointTwo", "contactTarget"
            )
        }

    def route_payload(role, finger, first_frame):
        order = expected_route_order(role, finger)
        selected_id = order[0]
        selected_clearance = clearance_record()
        angles = (
            [20.0, 20.0, 20.0]
            if (role, finger) == ("dominant", "index")
            else [80.0, 90.0, 80.0]
        )
        reports = []
        for schedule_index, candidate_id in enumerate(order):
            qualified = schedule_index == 0
            reports.append({
                "id": candidate_id,
                "scheduleIndex": schedule_index,
                "priority": schedule_index,
                "source": "synthetic bounded verifier control",
                "thetaIndex": None,
                "psiIndex": None,
                "phiIndex": None,
                "phiRadians": 0.0,
                "qualified": qualified,
                "rejectionReasons": [] if qualified else ["synthetic-reject"],
                "waypointTwoRootDistanceMeters": 0.05,
                "proximalReachMinimumMeters": 0.005,
                "proximalReachMaximumMeters": 0.08,
                "lengthErrorsMeters": [0.0, 0.0, 0.0] if qualified else [],
                "handednessPoleDot": 1.0 if qualified else None,
                "jointAnglesDegrees": angles if qualified else [],
                "jointMarginsDegrees": (
                    [150.0 - value for value in angles] if qualified else []
                ),
                "wrapDegrees": sum(angles) if qualified else None,
                "orientedMeshClearance": (
                    selected_clearance if qualified else {}
                ),
                "pathOrientedMeshIntersections": [],
                "pointsRigLocalMeters": (
                    [
                        [0.0, 0.0, 0.0],
                        [0.01, 0.0, 0.0],
                        [0.02, 0.0, 0.0],
                        [0.03, 0.0, 0.0],
                    ] if qualified else None
                ),
                **({
                    "shapeVectorsMeters": [
                        [0.01, 0.0, 0.0],
                        [0.01, 0.0, 0.0],
                        [0.01, 0.0, 0.0],
                    ],
                    "temporalShapeDeltaMeters": 0.0,
                    "selected": True,
                } if qualified else {}),
            })
        return {
            "minimumSignedClearanceMeters": 0.001,
            "clearance": selected_clearance,
            "selectedPathOrientedMeshIntersections": [],
            "routeFamilySchema": (
                "kyx-rev51-bounded-stable-id-route-family-v1"
            ),
            "routeFamilyCandidateCount": len(order),
            "routeFamilyOrder": order,
            "candidateReports": reports,
            "validCandidateIds": [selected_id],
            "selectedCandidateId": selected_id,
            "previousCandidateId": None if first_frame else selected_id,
            "selectionMethod": (
                "first-frame-priority"
                if first_frame else "retain-valid-stable-id"
            ),
            "temporalShapeDeltaMeters": 0.0,
            "temporalShapeDeltaGateMeters": .012,
            "jointAnglesDegrees": angles,
            "jointMarginsDegrees": [150.0 - value for value in angles],
            "wrapDegrees": sum(angles),
            "handednessPoleDot": 1.0,
        }

    add_record("top_level_main_entry")
    for action, (library, source, count, contact) in EXPECTED_ACTION_CONTRACT.items():
        if contact:
            add_record(
                "route_temporal_state_action_reset",
                outputAction=action,
                sourceLibrary=library,
                sourceAction=source,
                expectedDigitCount=10,
            )
        add_record(
            "action_entry",
            outputAction=action,
            sourceLibrary=library,
            sourceAction=source,
            sourceFrameEnd=count - 1,
        )
        for source_frame in range(count):
            add_record(
                "action_frame_entry",
                outputAction=action,
                sourceLibrary=library,
                sourceAction=source,
                sourceFrame=source_frame,
                outputFrame=source_frame + 1,
            )
            if contact:
                selected_ids = {}
                for role in ROLES:
                    for finger in DIGITS:
                        payload = route_payload(
                            role,
                            finger,
                            first_frame=source_frame == 0,
                        )
                        selected_ids[f"{role}/{finger}"] = payload[
                            "selectedCandidateId"
                        ]
                        add_record(
                            "digit_oriented_mesh_preflight_pass",
                            role=role,
                            finger=finger,
                            **payload,
                        )
                add_record(
                    "all_digit_oriented_mesh_preflights_post_validation",
                    digitCount=10,
                )
                add_record(
                    "all_digit_route_temporal_state_commit_post_validation",
                    action=action,
                    digitCount=10,
                    selectedCandidateIds=selected_ids,
                    shapeDeltaGateMeters=.012,
                )
        add_record(
            "action_frames_complete",
            outputAction=action,
            sampledFrames=count,
            contactSamples=count if contact else 0,
        )
    add_record("top_level_main_complete")
    return records


def verify_stage_negative_self_tests():
    valid = synthetic_stage_records()
    baseline = verify_stage_records(valid)
    cases = {}
    cases["truncated-log"] = valid[:120]
    first_digit = next(
        index for index, value in enumerate(valid)
        if value["stage"] == "digit_oriented_mesh_preflight_pass"
    )
    missing_digit = [*valid[:first_digit], *valid[first_digit + 1:]]
    cases["missing-digit"] = missing_digit
    duplicate_digit = [
        *valid[:first_digit + 1],
        dict(valid[first_digit]),
        *valid[first_digit + 1:],
    ]
    cases["duplicate-digit"] = duplicate_digit
    first_frame_complete = next(
        index for index, value in enumerate(valid)
        if value["stage"] == "all_digit_oriented_mesh_preflights_post_validation"
    )
    cases["missing-frame-completion"] = [
        *valid[:first_frame_complete], *valid[first_frame_complete + 1:]
    ]
    first_commit = next(
        index for index, value in enumerate(valid)
        if value["stage"]
        == "all_digit_route_temporal_state_commit_post_validation"
    )
    cases["missing-route-commit"] = [
        *valid[:first_commit], *valid[first_commit + 1:]
    ]
    cases["duplicate-route-commit"] = [
        *valid[:first_commit + 1],
        dict(valid[first_commit]),
        *valid[first_commit + 1:],
    ]
    first_reset = next(
        index for index, value in enumerate(valid)
        if value["stage"] == "route_temporal_state_action_reset"
    )
    cases["missing-route-reset"] = [
        *valid[:first_reset], *valid[first_reset + 1:]
    ]
    first_action_complete = next(
        index for index, value in enumerate(valid)
        if value["stage"] == "action_frames_complete"
    )
    cases["missing-action-completion"] = [
        *valid[:first_action_complete], *valid[first_action_complete + 1:]
    ]
    cases["missing-top-level-completion"] = valid[:-1]
    polluted = [dict(value) for value in valid]
    noncontact_frame = next(
        index for index, value in enumerate(polluted)
        if value["stage"] == "action_frame_entry"
        and not EXPECTED_ACTION_CONTRACT[value["outputAction"]][3]
    )
    pollution = dict(valid[first_digit])
    polluted.insert(noncontact_frame + 1, pollution)
    cases["non-contact-frame-pollution"] = polluted
    route_order_changed = [dict(value) for value in valid]
    route_order_changed[first_digit] = dict(route_order_changed[first_digit])
    route_order_changed[first_digit]["routeFamilyOrder"] = list(reversed(
        route_order_changed[first_digit]["routeFamilyOrder"]
    ))
    cases["route-order-tamper"] = route_order_changed
    temporal_overflow = [dict(value) for value in valid]
    temporal_overflow[first_digit] = dict(temporal_overflow[first_digit])
    temporal_overflow[first_digit]["temporalShapeDeltaMeters"] = .012000001
    cases["temporal-overflow"] = temporal_overflow
    middle_vector_tamper = json.loads(json.dumps(valid))
    first_middle = next(
        index for index, value in enumerate(middle_vector_tamper)
        if value["stage"] == "digit_oriented_mesh_preflight_pass"
        and value.get("role") == "dominant"
        and value.get("finger") == "middle"
    )
    selected_middle = next(
        value for value in middle_vector_tamper[first_middle]["candidateReports"]
        if value.get("selected") is True
    )
    selected_middle["shapeVectorsMeters"][1][0] += .001
    cases["tampered-middle-link-vector"] = middle_vector_tamper
    scalar_delta_tamper = json.loads(json.dumps(valid))
    scalar_delta_tamper[first_digit]["temporalShapeDeltaMeters"] = .001
    selected_scalar = next(
        value for value in scalar_delta_tamper[first_digit]["candidateReports"]
        if value.get("selected") is True
    )
    selected_scalar["temporalShapeDeltaMeters"] = .001
    cases["trusted-scalar-delta-tamper"] = scalar_delta_tamper
    cases["state-change-before-commit"] = [
        *valid[:first_commit], *valid[first_commit + 1:]
    ]
    commit_mismatch = [dict(value) for value in valid]
    commit_mismatch[first_commit] = dict(commit_mismatch[first_commit])
    commit_mismatch[first_commit]["selectedCandidateIds"] = {
        **commit_mismatch[first_commit]["selectedCandidateIds"],
        "dominant/index": "not-a-qualified-route",
    }
    cases["commit-selection-mismatch"] = commit_mismatch
    rejected = []
    for label, records in cases.items():
        records = [
            {**record, "sequence": index}
            for index, record in enumerate(records, start=1)
        ]
        try:
            verify_stage_records(records)
        except RuntimeError:
            rejected.append(label)
        else:
            raise RuntimeError(f"stage negative self-test was accepted: {label}")
    return {"baseline": baseline, "rejected": rejected}


def verify_completion_artifacts(stage_path: Path, stdout_path: Path, repo: Path):
    expected_evidence = repo / "evidence/2026-08-09/g6-assault-rev51-vlr7-bounded-route-source-build-v1"
    expected_launch = repo / "evidence/2026-08-09/g6-assault-rev51-vlr7-bounded-route-launch-v1"
    expected_runtime = repo / "assets/review/runtime-candidates/g6-assault-rev51-vlr7-bounded-route-v1"
    expected_model = repo / "assets/source/blender/phase7-character-original-v6/model/v6c-character-rev51-vlr7-bounded-route-assault-v1"
    if stage_path.resolve().parent != expected_evidence.resolve():
        raise RuntimeError("stage log is outside the distinct Rev51 evidence root")
    report_path = expected_evidence / "author-export-report.json"
    manifest_path = expected_runtime / "manifest.json"
    master_path = expected_model / "kyx-v6c-character-rev51-vlr7-bounded-route-assault-v1-master.blend"
    expected_stdout_path = expected_launch / "blender-stdout.log"
    if stdout_path.resolve() != expected_stdout_path.resolve():
        raise RuntimeError("stdout log is outside the distinct Rev51 launch root")
    for path in (report_path, manifest_path, master_path, stdout_path):
        if not path.is_file():
            raise RuntimeError(f"Rev51 completion artifact missing: {path}")
    prefix = EXPECTED_COMPLETION_SIGNATURE + " "
    signatures = [
        line for line in stdout_path.read_text(encoding="utf-8", errors="replace").splitlines()
        if line.startswith(prefix)
    ]
    if len(signatures) != 1:
        raise RuntimeError("Rev51 completion signature is missing or duplicated")
    completion = json.loads(signatures[0][len(prefix):])
    if completion.get("candidate") != EXPECTED_CANDIDATE:
        raise RuntimeError("completion signature candidate changed")
    if Path(completion.get("masterBlend", "")).resolve() != master_path.resolve():
        raise RuntimeError("completion signature master path changed")
    if Path(completion.get("manifest", "")).resolve() != manifest_path.resolve():
        raise RuntimeError("completion signature manifest path changed")
    if Path(completion.get("report", "")).resolve() != report_path.resolve():
        raise RuntimeError("completion signature report path changed")
    report = json.loads(report_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if (
        report.get("schema")
        != "kyx-g6-assault-rev51-vlr7-bounded-route-source-build-v1"
        or report.get("candidate") != EXPECTED_CANDIDATE
    ):
        raise RuntimeError("report candidate changed")
    if (
        manifest.get("schema")
        != "kyx-g6-assault-rev51-vlr7-bounded-route-review-candidate-manifest-v1"
        or manifest.get("revision") != EXPECTED_CANDIDATE
        or manifest.get("humanAccepted") is not False
        or manifest.get("releaseEligible") is not False
    ):
        raise RuntimeError("manifest revision changed")
    master_report = report.get("masterBlend")
    if not isinstance(master_report, dict) or set(master_report) != {
        "path", "bytes", "sha256"
    }:
        raise RuntimeError("report master-blend record is missing or malformed")
    reported_master_path = repo / master_report["path"]
    if reported_master_path.resolve() != master_path.resolve():
        raise RuntimeError("report master-blend path changed")
    if (
        not isinstance(master_report["bytes"], int)
        or master_report["bytes"] <= 0
        or master_path.stat().st_size != master_report["bytes"]
        or not isinstance(master_report["sha256"], str)
        or sha256(master_path) != master_report["sha256"]
    ):
        raise RuntimeError("master blend was missing, replaced, or corrupted")
    lods = report.get("lods", [])
    if len(lods) != 3:
        raise RuntimeError("report LOD cardinality changed")
    combined_bytes = 0
    for index, lod in enumerate(lods):
        path = repo / lod["path"]
        if path.resolve().parent != expected_runtime.resolve() or not path.is_file():
            raise RuntimeError(f"LOD artifact path changed: {path}")
        if path.stat().st_size != lod["bytes"] or sha256(path) != lod["sha256"]:
            raise RuntimeError(f"LOD artifact integrity changed: {path}")
        manifest_lod = manifest.get("assets", {}).get(f"lod{index}")
        if manifest_lod != lod:
            raise RuntimeError(f"manifest/report LOD mismatch: lod{index}")
        combined_bytes += lod["bytes"]
    if (
        combined_bytes != report.get("combinedGlbBytes")
        or combined_bytes != completion.get("combinedGlbBytes")
    ):
        raise RuntimeError("combined package bytes changed")
    if completion.get("lodTriangles") != [lod["triangles"] for lod in lods]:
        raise RuntimeError("completion/report LOD triangles mismatch")
    renders = report.get("renders")
    if not isinstance(renders, list) or len(renders) != len(EXPECTED_RENDER_NAMES):
        raise RuntimeError(
            "report render list is missing or has the wrong cardinality: "
            f"expected={len(EXPECTED_RENDER_NAMES)} "
            f"actual={len(renders) if isinstance(renders, list) else '<missing>'}"
        )
    report_renders = []
    resolved_render_paths = set()
    for render in renders:
        if not isinstance(render, dict) or not {
            "path", "bytes", "sha256"
        }.issubset(render):
            raise RuntimeError("report render record is malformed")
        relative = Path(render["path"])
        if relative.is_absolute() or ".." in relative.parts:
            raise RuntimeError(f"render path is absolute or traverses: {relative}")
        path = (repo / relative).resolve()
        try:
            path.relative_to(expected_evidence.resolve())
        except ValueError as exc:
            raise RuntimeError(f"render escaped Rev51 evidence root: {path}") from exc
        if path.parent != expected_evidence.resolve():
            raise RuntimeError(f"render is not directly in Rev51 evidence root: {path}")
        if path in resolved_render_paths:
            raise RuntimeError(f"duplicate render path: {path}")
        resolved_render_paths.add(path)
        report_renders.append(render["path"])
        if (
            not path.is_file()
            or not isinstance(render["bytes"], int)
            or render["bytes"] <= 0
            or path.stat().st_size != render["bytes"]
            or not isinstance(render["sha256"], str)
            or sha256(path) != render["sha256"]
        ):
            raise RuntimeError(f"render artifact missing or corrupted: {path}")
    if {Path(path).name for path in report_renders} != EXPECTED_RENDER_NAMES:
        raise RuntimeError("Rev51 render filename set changed")
    if completion.get("renders") != report_renders:
        raise RuntimeError("completion/report render list mismatch")
    return {
        "completionSignature": EXPECTED_COMPLETION_SIGNATURE,
        "reportSha256": sha256(report_path),
        "manifestSha256": sha256(manifest_path),
        "masterBlendSha256": master_report["sha256"],
        "lodCount": len(lods),
        "renderCount": len(report_renders),
    }


def verify_stage(
    path: Path | None,
    stdout_path: Path | None,
    repo: Path,
):
    if path is None:
        return {
            "status": "NOT_RUN",
            "nonClaim": (
                "242-frame/2420-digit proof awaits one complete Rev51 stage "
                "log plus its authoritative Blender stdout and artifacts"
            ),
        }
    if stdout_path is None:
        raise RuntimeError("--stdout-log is required with a Rev51 stage log")
    records = [
        json.loads(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    stage_report = verify_stage_records(records)
    artifact_report = verify_completion_artifacts(path, stdout_path, repo)
    return {"status": "PASS", **stage_report, "artifacts": artifact_report}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("stage_log", nargs="?", type=Path)
    parser.add_argument("--stdout-log", type=Path)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    core = repo / "assets/source/blender/phase7-character-original-v6/scripts/author_export_cc0_assault_rev51.py"
    wrapper = repo / "assets/source/blender/phase7-character-original-v6/scripts/author_export_assault_rev51_vlr7_bounded_route_v1.py"
    ast.parse(core.read_text(encoding="utf-8")); ast.parse(wrapper.read_text(encoding="utf-8"))
    if sha256(core) != EXPECTED_CORE_SHA256:
        raise RuntimeError("sealed Rev51 core hash changed")
    if sha256(wrapper) != EXPECTED_WRAPPER_SHA256:
        raise RuntimeError("sealed Rev51 wrapper hash changed")
    core_text = core.read_text(encoding="utf-8")
    for token in (
        "weapon-ready-v15",
        "kyx-rev51-bounded-stable-id-route-family-v1",
        "all_digit_oriented_mesh_preflights_post_validation",
        "all_digit_route_temporal_state_commit_post_validation",
        "VLR7_ROUTE_DOMINANT_MIDDLE_ACCEPTED_SEED",
    ):
        if token not in core_text: raise RuntimeError(f"Rev51 core wiring missing: {token}")
    glb = repo / "assets/review/runtime-candidates/kyx-vlr7-quaternius-rev1/kyx-vlr7-quaternius-rev1.glb"
    core_schema = verify_core_fixture_schema(core)
    action_contract = verify_core_action_contract(core)
    document, binary = read_glb(glb)
    fixtures, meshes = verify_fixtures(document, binary)
    witness = solve_rev47_witness(meshes["dominant"])
    proposal = verify_rev51_middle_proposal(meshes["dominant"], fixtures)
    route_contract = verify_rev51_route_contract(core)
    negatives = negative_controls(meshes, fixtures)
    stage_self_tests = verify_stage_negative_self_tests()
    result = {"schema": "kyx-rev51-bounded-route-static-verifier-v1",
              "coreSha256": sha256(core), "wrapperSha256": sha256(wrapper),
              "glbSha256": sha256(glb), "coreFixtureSchema": core_schema,
              "coreActionContract": action_contract,
              "fixtures": fixtures,
              "sealedRev47Discriminator": witness, "negativeControls": negatives,
              "rev51MiddleProposal": proposal,
              "rev51RouteContract": route_contract,
              "float32DiagnosticControls": verify_float32_diagnostic_controls(),
              "fixtureOffsetRepresentationControls": (
                  verify_fixture_offset_representation_controls()
              ),
              "stageVerifierSelfTests": stage_self_tests,
              "stageCoverage": verify_stage(
                  args.stage_log,
                  args.stdout_log,
                  repo,
              )}
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
