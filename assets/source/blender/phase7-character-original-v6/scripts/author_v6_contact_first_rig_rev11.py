"""Rev11 bounded contact pass with explicit curled digit directions."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_rev10_base", HERE / "author_v6_contact_first_rig_rev10.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev10 authoring helpers")
rev10 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev10)

PREFIX = "V6CF11_"
rev10.PREFIX = PREFIX
rev10.rev9.PREFIX = PREFIX
rev10.rev9.rev8.PREFIX = PREFIX
rev10.rev9.rev8.rev7.PREFIX = PREFIX
rev10.rev9.rev8.rev7.rev5.PREFIX = PREFIX
rev10.rev9.rev8.rev7.rev5.rev4.PREFIX = PREFIX
rev10.rev9.rev8.rev7.rev5.rev4.rev3.PREFIX = PREFIX
rev10.rev9.rev8.rev7.rev5.rev4.rev3.rev2.PREFIX = PREFIX
base = rev10.base
base.PREFIX = PREFIX


def direct_chain(
    targets: dict[str, tuple[Vector, Vector, Vector]],
    rig: bpy.types.Object,
    side: str,
    family: str,
    root: Vector,
    directions: tuple[Vector, Vector, Vector],
) -> Vector:
    point = root.copy()
    up = Vector((0.0, 0.0, 1.0))
    for index, direction in enumerate(directions, 1):
        name = f"{family}_0{index}.{side}"
        tail = point + direction.normalized() * rig.data.bones[name].length
        targets[name] = (point, tail, up)
        point = tail
    return point


def build_pose_targets() -> tuple[dict[str, tuple[Vector, Vector, Vector]], dict[str, list[float]]]:
    targets, landmarks = rev10.build_pose_targets()
    rig = bpy.data.objects[f"{PREFIX}ContactFullBodyRig"]
    forward = Vector(landmarks["forward"])
    right = Vector(landmarks["right"])
    up = Vector((0.0, 0.0, 1.0))
    grip = Vector(landmarks["grip"])
    # Move only the foregrip contact cylinder into the reachable palm pocket;
    # the support arm pose remains the native-length rev10 solution.
    foregrip = Vector(landmarks["foregrip"]) + right * 0.020 - forward * 0.020

    roots: dict[str, list[float]] = {}
    tips: dict[str, list[float]] = {}
    firing_curl = (
        right * 0.45 + forward * 0.23 + up * 0.18,
        right * 0.15 + forward * 0.25 - up * 0.74,
        forward * 0.05 - up * 0.998,
    )
    for family in ("middle", "ring", "pinky"):
        root = rev10.rev9.palm_mapped_root(rig, targets, "palm.R", f"{family}_01.R")
        roots[f"{family}.R"] = base.rounded(root)
        tips[f"{family}.R"] = base.rounded(direct_chain(targets, rig, "R", family, root, firing_curl))
    index_root = rev10.rev9.palm_mapped_root(rig, targets, "palm.R", "index_01.R")
    roots["index.R"] = base.rounded(index_root)
    tips["index.R"] = base.rounded(direct_chain(targets, rig, "R", "index", index_root, (
        right * 0.35 + forward * 0.18 + up * 0.75,
        right * 0.30 + forward * 0.22 + up * 0.70,
        right * 0.20 + forward * 0.28 + up * 0.55,
    )))
    thumb_root = rev10.rev9.palm_mapped_root(rig, targets, "palm.R", "thumb_01.R")
    roots["thumb.R"] = base.rounded(thumb_root)
    tips["thumb.R"] = base.rounded(direct_chain(targets, rig, "R", "thumb", thumb_root, (
        right * 0.65 + forward * 0.45 + up * 0.35,
        right * 0.55 + forward * 0.55 + up * 0.25,
        right * 0.35 + forward * 0.55 + up * 0.15,
    )))

    support_curl = (
        -right * 0.20 + forward * 0.50 + up * 0.18,
        -right * 0.12 + forward * 0.18 - up * 0.75,
        forward * 0.45 - up * 0.89,
    )
    for family in ("index", "middle", "ring", "pinky"):
        root = rev10.rev9.palm_mapped_root(rig, targets, "palm.L", f"{family}_01.L")
        roots[f"{family}.L"] = base.rounded(root)
        tips[f"{family}.L"] = base.rounded(direct_chain(targets, rig, "L", family, root, support_curl))
    support_thumb_root = rev10.rev9.palm_mapped_root(rig, targets, "palm.L", "thumb_01.L")
    roots["thumb.L"] = base.rounded(support_thumb_root)
    tips["thumb.L"] = base.rounded(direct_chain(targets, rig, "L", "thumb", support_thumb_root, (
        -right * 0.45 + forward * 0.62 + up * 0.32,
        -right * 0.38 + forward * 0.65 + up * 0.22,
        -right * 0.22 + forward * 0.70 + up * 0.12,
    )))

    landmarks["foregrip"] = base.rounded(foregrip)
    landmarks["trigger"] = tips["index.R"]
    landmarks["palmMappedDigitRoots"] = roots
    landmarks["explicitContactTips"] = tips
    return targets, landmarks


def build_rifle(collection: bpy.types.Collection, landmarks: dict[str, list[float]]) -> list[bpy.types.Object]:
    objects = rev10.build_rifle(collection, landmarks)
    grip = bpy.data.objects[f"{PREFIX}Rifle_GripContact"]
    # Rev10 creates baked box geometry.  Scale around its bounding-box center
    # by editing vertices in the authored local right/forward/up basis.
    forward = Vector(landmarks["forward"])
    right = Vector(landmarks["right"])
    center = Vector(landmarks["grip"])
    up = Vector((0.0, 0.0, 1.0))
    for vertex in grip.data.vertices:
        world = grip.matrix_world @ vertex.co
        delta = world - center
        r = delta.dot(right) * (0.074 / 0.044)
        f = delta.dot(forward) * (0.090 / 0.052)
        z = delta.dot(up)
        new_world = center + right * r + forward * f + up * z
        vertex.co = grip.matrix_world.inverted() @ new_world
    foregrip = bpy.data.objects[f"{PREFIX}Rifle_ForegripContact"]
    foregrip.scale.x *= 1.17
    foregrip.scale.y *= 1.17
    return objects


base.build_pose_targets = build_pose_targets
base.build_rifle = build_rifle


def main() -> None:
    rev10.main()
    args = sys.argv[sys.argv.index("--") + 1 :]
    report_path = Path(args[2]).resolve()
    report = json.loads(report_path.read_text(encoding="utf-8"))
    rig = bpy.data.objects[f"{PREFIX}ContactFullBodyRig"]
    report["schema"] = "kyx-v6-contact-first-rig-author-report-v11"
    report["status"] = "EARLY_CONTACT_RIG_REV11_EXPLICIT_CURL_VISUAL_REVIEW_REQUIRED"
    report["scope"] = "CONTACT_RIG_FOUNDATION_ONLY_CANDIDATE_REV11"
    report["rev11Corrections"] = {
        "rev1ThroughRev10Preserved": True,
        "digitSolve": "explicit native-length three-direction curls from palm-mapped roots",
        "fixtureFit": "grip widened/deepened to the literal finger curl surface; foregrip centered in reachable support palm pocket",
        "poseAudit": json.loads(rig["native_y_track_pose_audit"]),
        "weightAudit": json.loads(rig["deterministic_full_body_weight_audit"]),
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
