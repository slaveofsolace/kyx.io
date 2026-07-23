"""Build the bounded Press Hall v3 final-art review package.

The approved v3.1 checkpoint is treated as an immutable parent.  This builder
opens that exact Blender source, replaces the inherited slab-like cover and
baffle members, resolves the south roller/tension machine, adds restrained
service detail, and emits review-only evidence.  It never touches runtime
selection, collision authority, the catalog default, or shipping state.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import struct
import sys
from array import array
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


SCOPE = "G5_BOUNDED_PRESS_HALL_FINAL_ART_V3_PREVIEW_ONLY"
GENERATOR_ID = "inkfall_foundry_press_hall_final_art_v3"
VISUAL_DECISION = "PENDING_PARENT_FINAL_REVIEW"

FROZEN_V3_1 = {
    "builder": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/build_press_hall_hero_checkpoint_v3.py",
        "4fd978d2d5564f909df65c990038fd527355ddeb3c1d98c7ca61f27f889e3a61",
    ),
    "source": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/checkpoint-v3-1/source/inkfall_foundry_press_hall_hero_checkpoint_v3_1.blend",
        "ea83bb5c37b31cc53ff5450c46f2437a3c705969043df7d9ac01184c2381d368",
    ),
    "report": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/checkpoint-v3-1/validation/press-hall-v3-1-hero-checkpoint-delta-report.json",
        "6d055cd5c0a5af0b7e160cf09a2ed811a7fc4602edfc2e5324bcbcff5e0c8890",
    ),
    "board": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/checkpoint-v3-1/boards/inkfall-press-hall-v3-1-hero-checkpoint-board.png",
        "65db1e4b951fa7ba22c70f8f151efc3e67208294d1ecdc09f295d39b54dc79da",
    ),
    "gameplay": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/checkpoint-v3-1/renders/inkfall-press-hall-v3-1-gameplay_eye.png",
        "4edc27c3cd4bbe9ee7e206466ac3888ba1e9b9b2041330d48390f6e2ccf85069",
    ),
    "north_close": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/checkpoint-v3-1/renders/inkfall-press-hall-v3-1-hero_close.png",
        "39860fd07d93508a071c2982c8fcd7db26e376236fabc2ccf22be87216f1572e",
    ),
    "context": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/checkpoint-v3-1/renders/inkfall-press-hall-v3-1-overhead_context.png",
        "813a60b76e570e4c84a953ea6dc59ad3fac5ed3fb519917e4b4589303a142899",
    ),
}

LOCKED_ENVELOPES = {
    "R_MODULE__PRESS_REACTOR_NORTH": {"center": (0.0, 7.5, 3.0), "size": (3.4, 3.0, 6.0)},
    "R_MODULE__PRESS_REACTOR_SOUTH": {"center": (0.0, -7.5, 3.0), "size": (3.4, 3.0, 6.0)},
    "R_MODULE__PRESS_BAFFLE_E_INNER": {"center": (5.2, -4.7, 1.5), "size": (5.0, 0.5, 3.0)},
    "R_MODULE__PRESS_BAFFLE_W_INNER": {"center": (-5.2, -4.7, 1.5), "size": (5.0, 0.5, 3.0)},
    "R_MODULE__PRESS_BAFFLE_E_OUTER": {"center": (10.5, 5.6, 1.5), "size": (5.0, 0.5, 3.0)},
    "R_MODULE__PRESS_BAFFLE_W_OUTER": {"center": (-10.5, 5.6, 1.5), "size": (5.0, 0.5, 3.0)},
    "R_MODULE__HALF_COVER_PRESS_E": {"center": (7.0, -1.7, 0.625), "size": (2.4, 0.6, 1.25)},
    "R_MODULE__HALF_COVER_PRESS_W": {"center": (-7.0, 6.0, 0.625), "size": (2.4, 0.6, 1.25)},
    "R_MODULE__FULL_COVER_PRESS_E": {"center": (15.5, 8.0, 1.2), "size": (1.8, 0.8, 2.4)},
    "R_MODULE__FULL_COVER_PRESS_W": {"center": (-10.0, -8.0, 1.2), "size": (1.8, 0.8, 2.4)},
}

BAFFLE_TARGETS = {
    "R_MODULE__PRESS_BAFFLE_E_INNER",
    "R_MODULE__PRESS_BAFFLE_W_INNER",
    "R_MODULE__PRESS_BAFFLE_E_OUTER",
    "R_MODULE__PRESS_BAFFLE_W_OUTER",
}
COVER_TARGETS = {
    "R_MODULE__HALF_COVER_PRESS_E",
    "R_MODULE__HALF_COVER_PRESS_W",
    "R_MODULE__FULL_COVER_PRESS_E",
    "R_MODULE__FULL_COVER_PRESS_W",
}
REPLACED_AUXILIARY_TARGETS = BAFFLE_TARGETS | COVER_TARGETS

NON_CLAIMS = [
    "G5_NOT_PASSED",
    "HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED",
    "HUMAN_PLAYTEST_ACCEPTANCE_NOT_PASSED",
    "PERFORMANCE_NOT_MEASURED",
    "NO_SNAG_RUNTIME_PROOF_NOT_COMPLETE",
    "COLOR_VISION_REVIEW_NOT_COMPLETE",
    "PRODUCT_INTEGRATION_NOT_COMPLETE",
    "REVISION_2_NOT_DEFAULT_OR_SHIPPING",
    "DEPLOYMENT_NOT_AUTHORIZED",
]


def parse_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--output-root", required=True)
    return parser.parse_args(raw)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def stable_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")


def import_checkpoint_builder(repo_root: Path):
    path = repo_root / FROZEN_V3_1["builder"][0]
    spec = importlib.util.spec_from_file_location("inkfall_press_hall_v31_frozen_parent", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to import checkpoint builder: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.SCOPE = SCOPE
    module.GENERATOR_ID = GENERATOR_ID
    return module


def verify_hash_set(repo_root: Path, expected: dict[str, tuple[str, str]]) -> dict[str, dict[str, str]]:
    results = {}
    for key, (relative, expected_sha) in expected.items():
        path = repo_root / relative
        actual_sha = sha256_file(path)
        if actual_sha != expected_sha:
            raise RuntimeError(f"Preserved input drift: {key}: expected {expected_sha}, got {actual_sha}")
        results[key] = {"path": relative, "expectedSha256": expected_sha, "actualSha256": actual_sha}
    return results


def remove_collection_objects(collection_name: str) -> list[str]:
    collection = bpy.data.collections.get(collection_name)
    if collection is None:
        return []
    names = sorted(obj.name for obj in collection.objects)
    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(collection)
    return names


def remove_inherited_auxiliaries() -> dict[str, list[str]]:
    removed = {target: [] for target in sorted(REPLACED_AUXILIARY_TARGETS)}
    for obj in list(bpy.data.objects):
        target = obj.get("kyx_replacement_target")
        if target in REPLACED_AUXILIARY_TARGETS:
            removed[str(target)].append(obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    return {target: sorted(names) for target, names in removed.items()}


def final_mark(obj: bpy.types.Object, family: str) -> bpy.types.Object:
    obj["kyx_scope"] = SCOPE
    obj["kyx_role"] = "v3_final_art_render_only"
    obj["kyx_v3_final_family"] = family
    obj["kyx_collision"] = False
    return obj


def add_box(v31, v1, materials, name, dimensions, location, target, family, material="cast", bevel=0.04):
    return final_mark(v31.add_target_box(name, dimensions, location, FINAL_COLLECTION, materials[material], v1, target, family, bevel=bevel), family)


def add_cylinder(v31, v1, materials, name, radius, depth, location, target, family, material="steel", rotation=(0.0, 0.0, 0.0), bevel=0.018):
    return final_mark(v31.add_target_cylinder(name, radius, depth, location, FINAL_COLLECTION, materials[material], v1, target, family, rotation=rotation, bevel=bevel), family)


def add_beam(v31, v1, materials, name, start, end, radius, target, family, material="steel"):
    return final_mark(v31.add_target_beam(name, start, end, radius, FINAL_COLLECTION, materials[material], v1, target, family), family)


def add_arc(v31, materials, name, center_xz, y_center, depth, outer_radius, inner_radius, start, end, target, family, material="cast"):
    return final_mark(v31.add_cast_arc(name, center_xz, y_center, depth, outer_radius, inner_radius, start, end, FINAL_COLLECTION, materials[material], V1_BUILDER, target, family=family), family)


def build_open_guard_screen(v31, v1, materials, target: str, center: tuple[float, float, float], size: tuple[float, float, float]) -> None:
    cx, cy, cz = center
    sx, sy, sz = size
    prefix = "V3F_" + target.replace("R_MODULE__", "")
    frame_y = sy * 0.56
    face_y = sy * 0.22
    x_edge = sx * 0.5 - 0.19
    z_low, z_high = 0.22, sz - 0.22
    z_mid = (z_low + z_high) * 0.5

    for token, x in (("L", cx - x_edge), ("C", cx), ("R", cx + x_edge)):
        add_box(v31, v1, materials, prefix + f"_FRAME_POST_{token}", (0.15, frame_y, sz - 0.28), (x, cy, sz * 0.5), target, "open_guard_frame", bevel=0.035)
    for token, z in (("BASE", 0.14), ("MID", z_mid), ("TOP", sz - 0.14)):
        add_box(v31, v1, materials, prefix + f"_FRAME_RAIL_{token}", (sx - 0.22, frame_y, 0.14), (cx, cy, z), target, "open_guard_frame", bevel=0.035)
    for index, x_offset in enumerate((-0.34, -0.17, 0.17, 0.34)):
        x = cx + x_offset * sx
        add_box(v31, v1, materials, prefix + f"_GRILLE_VERTICAL_{index}", (0.042, face_y, sz - 0.62), (x, cy - sy * 0.19, sz * 0.5), target, "open_guard_grille", material="steel", bevel=0.012)
    for index, z in enumerate((0.58, 1.02, 1.92, 2.36)):
        add_box(v31, v1, materials, prefix + f"_GRILLE_HORIZONTAL_{index}", (sx - 0.72, face_y, 0.042), (cx, cy - sy * 0.19, z), target, "open_guard_grille", material="steel", bevel=0.012)
    add_beam(v31, v1, materials, prefix + "_DIAGONAL_L", (cx - x_edge + 0.16, cy, z_low + 0.12), (cx - 0.16, cy, z_high - 0.12), 0.048, target, "open_guard_brace")
    add_beam(v31, v1, materials, prefix + "_DIAGONAL_R", (cx + 0.16, cy, z_high - 0.12), (cx + x_edge - 0.16, cy, z_low + 0.12), 0.048, target, "open_guard_brace")
    add_box(v31, v1, materials, prefix + "_SAFETY_ID_BAR", (0.66, sy * 0.66, 0.11), (cx + x_edge - 0.45, cy, z_mid), target, "safety_identifier", material="safety", bevel=0.025)
    for index, x in enumerate((cx - x_edge + 0.22, cx + x_edge - 0.22)):
        add_box(v31, v1, materials, prefix + f"_BASE_SHOE_{index}", (0.52, sy * 0.78, 0.16), (x, cy, 0.10), target, "open_guard_anchor", bevel=0.04)
        for bolt, xo in enumerate((-0.15, 0.15)):
            add_cylinder(v31, v1, materials, prefix + f"_ANCHOR_BOLT_{index}_{bolt}", 0.045, 0.13, (x + xo, cy, 0.23), target, "fastener", material="steel", bevel=0.008)
    for index, z in enumerate((0.74, 2.24)):
        add_cylinder(v31, v1, materials, prefix + f"_SERVICE_HINGE_{index}", 0.045, 0.22, (cx - 0.14, cy - sy * 0.30, z), target, "service_access", material="steel", bevel=0.009)


def build_full_ribbed_cover(v31, v1, materials, target: str, center: tuple[float, float, float]) -> None:
    cx, cy, _ = center
    prefix = "V3F_" + target.replace("R_MODULE__", "")
    add_box(v31, v1, materials, prefix + "_BASE", (1.62, 0.62, 0.18), (cx, cy, 0.12), target, "ribbed_cover_frame", bevel=0.055)
    for side, x in (("L", cx - 0.69), ("R", cx + 0.69)):
        add_box(v31, v1, materials, prefix + f"_LEG_{side}", (0.14, 0.50, 1.40), (x, cy, 0.84), target, "ribbed_cover_frame", bevel=0.035)
    add_arc(v31, materials, prefix + "_CAST_CROWN", (cx, 1.53), cy, 0.48, 0.78, 0.63, 0.0, 180.0, target, "ribbed_cover_frame")
    for index, z in enumerate((0.50, 0.77, 1.04, 1.31)):
        add_box(v31, v1, materials, prefix + f"_VENT_LOUVER_{index}", (1.18, 0.075, 0.055), (cx, cy - 0.31, z), target, "ribbed_cover_vent", material="steel", bevel=0.012)
    add_box(v31, v1, materials, prefix + "_MID_TIE", (1.42, 0.44, 0.10), (cx, cy, 1.53), target, "ribbed_cover_frame", bevel=0.025)
    for x_token, x in (("L", cx - 0.47), ("R", cx + 0.47)):
        add_box(v31, v1, materials, prefix + f"_SERVICE_FRAME_{x_token}", (0.055, 0.075, 0.50), (x, cy - 0.32, 1.22), target, "service_access", material="steel", bevel=0.012)
    for z_token, z in (("LOW", 0.97), ("HIGH", 1.47)):
        add_box(v31, v1, materials, prefix + f"_SERVICE_FRAME_{z_token}", (0.98, 0.075, 0.055), (cx, cy - 0.32, z), target, "service_access", material="steel", bevel=0.012)
    add_box(v31, v1, materials, prefix + "_WARNING_TAB", (0.30, 0.09, 0.16), (cx + 0.40, cy - 0.33, 1.22), target, "safety_identifier", material="safety", bevel=0.018)
    for index, x in enumerate((cx - 0.58, cx + 0.58)):
        add_cylinder(v31, v1, materials, prefix + f"_ANCHOR_{index}", 0.052, 0.14, (x, cy - 0.18, 0.25), target, "fastener", bevel=0.008)


def build_half_service_cage(v31, v1, materials, target: str, center: tuple[float, float, float]) -> None:
    cx, cy, _ = center
    prefix = "V3F_" + target.replace("R_MODULE__", "")
    add_box(v31, v1, materials, prefix + "_BASE", (2.18, 0.46, 0.15), (cx, cy, 0.10), target, "ribbed_cover_frame", bevel=0.045)
    for side, x in (("L", cx - 0.96), ("R", cx + 0.96)):
        add_box(v31, v1, materials, prefix + f"_POST_{side}", (0.13, 0.40, 0.78), (x, cy, 0.52), target, "ribbed_cover_frame", bevel=0.03)
    add_box(v31, v1, materials, prefix + "_TOP_RAIL", (2.04, 0.40, 0.13), (cx, cy, 0.93), target, "ribbed_cover_frame", bevel=0.035)
    add_beam(v31, v1, materials, prefix + "_TRUSS_L", (cx - 0.90, cy, 0.28), (cx - 0.08, cy, 0.88), 0.045, target, "ribbed_cover_brace")
    add_beam(v31, v1, materials, prefix + "_TRUSS_R", (cx + 0.08, cy, 0.88), (cx + 0.90, cy, 0.28), 0.045, target, "ribbed_cover_brace")
    for index, z in enumerate((0.34, 0.54, 0.74)):
        add_box(v31, v1, materials, prefix + f"_VENT_RIB_{index}", (1.42, 0.07, 0.045), (cx, cy - 0.24, z), target, "ribbed_cover_vent", material="steel", bevel=0.01)
    add_box(v31, v1, materials, prefix + "_SERVICE_TAB", (0.28, 0.08, 0.20), (cx + 0.67, cy - 0.25, 0.57), target, "service_access", material="safety", bevel=0.018)
    for index, x in enumerate((cx - 0.78, cx + 0.78)):
        add_cylinder(v31, v1, materials, prefix + f"_ANCHOR_{index}", 0.045, 0.13, (x, cy, 0.22), target, "fastener", bevel=0.008)


def build_south_final_mechanism(v31, v1, materials) -> None:
    target = "R_MODULE__PRESS_REACTOR_SOUTH"
    prefix = "V3F_SOUTH_TENSION_SYSTEM"
    # A dedicated dancer-roll path makes the south machine a web-tension and
    # calender system, visibly distinct from the north eccentric letterpress.
    add_cylinder(v31, v1, materials, prefix + "_DANCER_ROLL", 0.18, 2.04, (0.0, -7.73, 4.08), target, "south_tension_roller", material="steel", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.025)
    for side, x in (("L", -1.14), ("R", 1.14)):
        add_cylinder(v31, v1, materials, prefix + f"_DANCER_BEARING_{side}", 0.14, 0.17, (x, -7.73, 4.08), target, "bearing_housing", material="cast", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.022)
        add_beam(v31, v1, materials, prefix + f"_PIVOT_ARM_{side}", (x, -7.73, 4.08), (x, -7.30, 3.43), 0.075, target, "south_tension_arm", material="steel")
        add_cylinder(v31, v1, materials, prefix + f"_ARM_PIVOT_{side}", 0.13, 0.17, (x, -7.30, 3.43), target, "bearing_housing", material="cast", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.022)
        add_cylinder(v31, v1, materials, prefix + f"_ADJUST_SCREW_{side}", 0.055, 0.72, (x, -7.42, 4.48), target, "south_tension_adjuster", material="steel", bevel=0.012)
        add_cylinder(v31, v1, materials, prefix + f"_SCREW_HANDWHEEL_{side}", 0.16, 0.08, (x, -7.42, 4.86), target, "service_control", material="safety", bevel=0.016)
    for token, z, radius in (("LOW", 2.32, 0.34), ("HIGH", 3.18, 0.31)):
        for side, x in (("L", -1.31), ("R", 1.31)):
            add_box(v31, v1, materials, prefix + f"_{token}_SPLIT_BLOCK_{side}", (0.24, 0.46, radius * 1.32), (x, -7.36, z), target, "bearing_housing", bevel=0.045)
            for bolt, dz in enumerate((-radius * 0.38, radius * 0.38)):
                add_cylinder(v31, v1, materials, prefix + f"_{token}_BLOCK_BOLT_{side}_{bolt}", 0.038, 0.12, (x, -7.13, z + dz), target, "fastener", material="steel", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.007)
    add_box(v31, v1, materials, prefix + "_REDUCTION_GEARBOX", (0.66, 0.72, 0.66), (1.16, -7.78, 1.72), target, "south_drive_train", bevel=0.09)
    add_cylinder(v31, v1, materials, prefix + "_LOW_ROLL_COUPLING", 0.15, 0.42, (1.42, -7.36, 2.32), target, "south_drive_train", material="steel", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.022)
    add_beam(v31, v1, materials, prefix + "_GEARBOX_LINK", (1.16, -7.62, 1.92), (1.38, -7.38, 2.25), 0.075, target, "south_drive_train", material="grease")
    add_arc(v31, materials, prefix + "_DRIVE_GUARD", (0.66, 3.20), -6.055, 0.07, 0.76, 0.66, 32.0, 172.0, target, "south_drive_guard", material="safety")
    for index, x in enumerate((0.13, 1.18)):
        add_beam(v31, v1, materials, prefix + f"_GUARD_STAY_{index}", (x, -6.09, 3.56), (x, -6.09, 4.03), 0.038, target, "south_drive_guard", material="steel")
    add_cylinder(v31, v1, materials, prefix + "_OUTPUT_GUIDE_ROLL", 0.13, 1.92, (0.0, -6.48, 2.26), target, "south_tension_roller", material="steel", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.020)
    for side, x in (("L", -1.08), ("R", 1.08)):
        add_cylinder(v31, v1, materials, prefix + f"_OUTPUT_GUIDE_JOURNAL_{side}", 0.10, 0.15, (x, -6.48, 2.26), target, "bearing_housing", material="cast", rotation=(0.0, math.pi / 2.0, 0.0), bevel=0.018)
        add_beam(v31, v1, materials, prefix + f"_OUTPUT_BRACKET_{side}", (x, -6.48, 2.26), (x, -6.68, 1.90), 0.055, target, "paper_support", material="cast")
    add_box(v31, v1, materials, prefix + "_CALIBRATION_SPINE", (0.08, 0.08, 0.92), (1.47, -6.08, 3.78), target, "service_control", material="steel", bevel=0.012)
    for index, z in enumerate((3.44, 3.66, 3.88, 4.10)):
        add_box(v31, v1, materials, prefix + f"_CALIBRATION_TICK_{index}", (0.22, 0.06, 0.025), (1.40, -6.055, z), target, "functional_marking", material="amber", bevel=0.006)
    add_box(v31, v1, materials, prefix + "_SERVICE_FRAME_L", (0.05, 0.07, 0.64), (-1.46, -6.055, 1.48), target, "service_access", material="steel", bevel=0.010)
    add_box(v31, v1, materials, prefix + "_SERVICE_FRAME_R", (0.05, 0.07, 0.64), (-1.02, -6.055, 1.48), target, "service_access", material="steel", bevel=0.010)
    for token, z in (("LOW", 1.16), ("HIGH", 1.80)):
        add_box(v31, v1, materials, prefix + f"_SERVICE_FRAME_{token}", (0.49, 0.07, 0.05), (-1.24, -6.055, z), target, "service_access", material="steel", bevel=0.010)
    add_cylinder(v31, v1, materials, prefix + "_GREASE_CUP", 0.060, 0.14, (-1.31, -7.36, 3.63), target, "service_hardware", material="grease", bevel=0.012)


def refine_north_service_detail(v31, v1, materials) -> None:
    target = "R_MODULE__PRESS_REACTOR_NORTH"
    prefix = "V3F_NORTH_SERVICE"
    for obj in bpy.data.objects:
        if obj.name.startswith("V3_NORTH_FORGING_PRESS_BEARING_BOLT_") and obj.type == "MESH":
            obj.data.materials.clear()
            obj.data.materials.append(materials["steel"])
            obj["kyx_scope"] = SCOPE
            obj["kyx_role"] = "v3_final_art_render_only"
    add_box(v31, v1, materials, prefix + "_BEARING_SPLIT_CAP", (0.58, 0.07, 0.065), (0.72, 6.055, 3.94), target, "bearing_housing", material="steel", bevel=0.012)
    for side, x in (("L", 0.49), ("R", 0.95)):
        add_cylinder(v31, v1, materials, prefix + f"_CAP_BOLT_{side}", 0.038, 0.10, (x, 6.06, 3.94), target, "fastener", material="steel", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.007)
    add_cylinder(v31, v1, materials, prefix + "_RAM_GUIDE_BUSHING", 0.31, 0.11, (0.0, 6.18, 2.52), target, "bearing_housing", material="cast", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.025)
    add_beam(v31, v1, materials, prefix + "_OIL_LINE_A", (0.72, 6.10, 4.30), (0.99, 6.10, 4.52), 0.026, target, "service_hardware", material="grease")
    add_beam(v31, v1, materials, prefix + "_OIL_LINE_B", (0.99, 6.10, 4.52), (1.20, 6.10, 4.32), 0.026, target, "service_hardware", material="grease")
    add_cylinder(v31, v1, materials, prefix + "_OIL_SIGHT", 0.055, 0.09, (1.20, 6.055, 4.32), target, "service_control", material="aqua", rotation=(math.pi / 2.0, 0.0, 0.0), bevel=0.010)
    for index, x in enumerate((0.04, 1.38)):
        add_beam(v31, v1, materials, prefix + f"_GUARD_STAY_{index}", (x, 6.09, 4.38), (x, 6.09, 4.72), 0.040, target, "drive_guard", material="steel")
    add_box(v31, v1, materials, prefix + "_PLATEN_WIPER", (1.72, 0.07, 0.08), (0.0, 6.66, 1.87), target, "service_hardware", material="grease", bevel=0.014)


def create_camera(v31, collection, name, location, target, lens):
    camera = v31.create_camera(name, location, target, lens, collection)
    camera["kyx_scope"] = SCOPE
    camera["kyx_role"] = "final_review_camera"
    return camera


def configure_final_cameras(v31, collection) -> dict[str, bpy.types.Object]:
    return {
        "gameplay_lane": create_camera(v31, collection, "CAM_V3F_GAMEPLAY_LANE", (-18.2, -1.5, 1.72), (0.0, 0.0, 2.55), 31.0),
        "north_hero": create_camera(v31, collection, "CAM_V3F_NORTH_HERO", (-5.9, 2.8, 3.25), (0.0, 7.34, 3.08), 43.0),
        "north_force_path": create_camera(v31, collection, "CAM_V3F_NORTH_FORCE", (4.75, 2.55, 3.75), (0.28, 7.05, 3.35), 48.0),
        "south_hero": create_camera(v31, collection, "CAM_V3F_SOUTH_HERO", (-5.7, -2.45, 3.28), (0.0, -7.28, 2.95), 43.0),
        "south_tension": create_camera(v31, collection, "CAM_V3F_SOUTH_TENSION", (4.70, -2.55, 3.68), (0.25, -7.30, 3.18), 48.0),
        "baffle_detail": create_camera(v31, collection, "CAM_V3F_BAFFLE_DETAIL", (14.2, 0.75, 3.18), (10.5, 5.60, 1.48), 50.0),
        "cover_detail": create_camera(v31, collection, "CAM_V3F_COVER_DETAIL", (18.5, 3.25, 2.85), (15.5, 8.0, 1.20), 52.0),
        "overhead_context": create_camera(v31, collection, "CAM_V3F_CONTEXT", (-14.0, -6.5, 6.35), (0.0, -0.3, 2.20), 35.0),
    }


def configure_final_lighting(v31, collection) -> None:
    scene = bpy.context.scene
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.007, 0.010, 0.013, 1.0)
    background.inputs["Strength"].default_value = 0.21
    for args in (
        ("V3F_SOUTH_FACE_FILL", (0.0, -3.2, 5.8), (0.0, -7.3, 2.9), 920.0, (0.34, 0.67, 0.72), 3.2),
        ("V3F_SOUTH_RIM", (4.8, -7.0, 6.5), (0.0, -7.4, 3.2), 760.0, (1.0, 0.30, 0.10), 3.0),
        ("V3F_BAFFLE_FILL", (10.5, 1.7, 5.3), (10.5, 5.6, 1.5), 840.0, (0.32, 0.68, 0.72), 3.4),
        ("V3F_COVER_FILL", (18.0, 6.0, 4.4), (15.5, 8.0, 1.2), 720.0, (1.0, 0.44, 0.16), 2.8),
    ):
        light = v31.add_area_light(*args, collection)
        light["kyx_scope"] = SCOPE


def render_views(output_root: Path, cameras: dict[str, bpy.types.Object]) -> list[dict[str, Any]]:
    render_dir = output_root / "final/renders"
    render_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    results = []
    for view_id, camera in cameras.items():
        path = render_dir / f"inkfall-press-hall-v3-{view_id}.png"
        scene.camera = camera
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        results.append({"view": view_id, "mode": "color", "path": path})
    return results


def create_review_board(output_path: Path, image_paths: list[Path], board_id: str) -> None:
    if len(image_paths) != 4:
        raise RuntimeError("Final review boards require exactly four images")
    width, height = 1920, 1080
    panel_width, panel_height = 960, 540
    canvas = array("f", [0.003, 0.004, 0.006, 1.0]) * (width * height)
    placements = [(0, 540), (960, 540), (0, 0), (960, 0)]
    for image_path, (origin_x, origin_y) in zip(image_paths, placements):
        source = bpy.data.images.load(str(image_path), check_existing=False)
        source.scale(panel_width, panel_height)
        pixels = array("f", [0.0]) * (panel_width * panel_height * 4)
        source.pixels.foreach_get(pixels)
        row_size = panel_width * 4
        for row in range(panel_height):
            source_start = row * row_size
            target_start = ((origin_y + row) * width + origin_x) * 4
            canvas[target_start : target_start + row_size] = pixels[source_start : source_start + row_size]
    board = bpy.data.images.new(f"G5_V3_FINAL_BOARD_{board_id}", width=width, height=height, alpha=True)
    board.pixels.foreach_set(canvas)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    board.filepath_raw = str(output_path)
    board.file_format = "PNG"
    board.save()


def export_render_only(output_root: Path) -> Path:
    path = output_root / "final/export/inkfall_foundry_press_hall_final_art_v3.glb"
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    selected = []
    for obj in bpy.context.scene.objects:
        if obj.type not in {"MESH", "CURVE"} or obj.hide_render:
            continue
        if obj.get("kyx_collision") not in {False, None}:
            continue
        obj.select_set(True)
        selected.append(obj)
    if not selected:
        raise RuntimeError("No final render-only objects selected for GLB")
    bpy.context.view_layer.objects.active = selected[0]
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True, export_apply=True, export_cameras=False, export_lights=False)
    bpy.ops.object.select_all(action="DESELECT")
    return path


def png_dimensions(path: Path) -> list[int]:
    with path.open("rb") as handle:
        if handle.read(8) != b"\x89PNG\r\n\x1a\n":
            raise RuntimeError(f"Invalid PNG: {path}")
        length = struct.unpack(">I", handle.read(4))[0]
        if handle.read(4) != b"IHDR" or length < 8:
            raise RuntimeError(f"Missing IHDR: {path}")
        return list(struct.unpack(">II", handle.read(8)))


def artifact(path: Path, repo_root: Path, *, include_resolution=False) -> dict[str, Any]:
    result = {"path": path.relative_to(repo_root).as_posix(), "sha256": sha256_file(path), "bytes": path.stat().st_size}
    if include_resolution:
        result["resolution"] = png_dimensions(path)
    return result


def family_counts(property_name: str) -> dict[str, int]:
    counts: dict[str, int] = {}
    for obj in bpy.data.objects:
        family = obj.get(property_name)
        if family:
            counts[str(family)] = counts.get(str(family), 0) + 1
    return dict(sorted(counts.items()))


def main() -> None:
    global FINAL_COLLECTION, V1_BUILDER
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    output_root = Path(args.output_root).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    v31 = import_checkpoint_builder(repo_root)
    V1_BUILDER = v31.import_v1_builder(repo_root)

    p67_before = V1_BUILDER.verify_inputs(repo_root)
    v1_before = verify_hash_set(repo_root, v31.PRESERVED_V1)
    v2_before = verify_hash_set(repo_root, v31.PRESERVED_REJECTED_V2)
    baseline_v3_before = verify_hash_set(repo_root, v31.PRESERVED_V3_CHECKPOINT)
    v31_before = verify_hash_set(repo_root, FROZEN_V3_1)

    bpy.ops.wm.open_mainfile(filepath=str(repo_root / FROZEN_V3_1["source"][0]), load_ui=False)
    removed_review_rig = {
        "cameras": remove_collection_objects("G5_V3_1_CHECKPOINT_CAMERAS"),
        "lights": remove_collection_objects("G5_V3_1_CHECKPOINT_LIGHTING"),
    }
    removed_auxiliaries = remove_inherited_auxiliaries()
    materials = v31.make_materials()
    v31.replace_context_materials(materials)
    FINAL_COLLECTION = v31.make_collection("G5_V3_FINAL_MECHANICAL_DELTA")
    camera_collection = v31.make_collection("G5_V3_FINAL_REVIEW_CAMERAS")
    light_collection = v31.make_collection("G5_V3_FINAL_REVIEW_LIGHTING")

    for target in sorted(BAFFLE_TARGETS):
        envelope = LOCKED_ENVELOPES[target]
        build_open_guard_screen(v31, V1_BUILDER, materials, target, envelope["center"], envelope["size"])
    for target in sorted(COVER_TARGETS):
        envelope = LOCKED_ENVELOPES[target]
        if target.startswith("R_MODULE__FULL"):
            build_full_ribbed_cover(v31, V1_BUILDER, materials, target, envelope["center"])
        else:
            build_half_service_cage(v31, V1_BUILDER, materials, target, envelope["center"])
    build_south_final_mechanism(v31, V1_BUILDER, materials)
    refine_north_service_detail(v31, V1_BUILDER, materials)

    for obj in bpy.data.objects:
        if obj.get("kyx_v3_family"):
            obj["kyx_scope"] = SCOPE
            obj["kyx_role"] = "v3_final_art_render_only"
            obj["kyx_collision"] = False

    configure_final_lighting(v31, light_collection)
    cameras = configure_final_cameras(v31, camera_collection)
    scene = bpy.context.scene
    scene["kyx_scope"] = SCOPE
    scene["kyx_generator_id"] = GENERATOR_ID
    scene["kyx_map_id"] = "inkfall_foundry"
    scene["kyx_graybox_revision"] = 2
    scene["kyx_graybox_lock_revision"] = 1
    scene["kyx_catalog_default_revision"] = 1
    scene["kyx_authority_collision_included"] = False
    scene["kyx_product_selectable"] = False
    scene["kyx_shipping_default"] = False
    scene["kyx_g5_claimed"] = False
    scene["kyx_checkpoint_only"] = False
    scene["kyx_final_review_candidate"] = True
    scene["kyx_visual_decision"] = VISUAL_DECISION
    scene["kyx_parent_art_candidate"] = "inkfall_foundry_press_hall_hero_checkpoint_v3_1"
    scene["kyx_checkpoint_revision"] = "3.1-frozen"

    source_path = output_root / "final/source/inkfall_foundry_press_hall_final_art_v3.blend"
    source_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path), check_existing=False)
    render_results = render_views(output_root, cameras)
    render_by_view = {item["view"]: item["path"] for item in render_results}
    boards = [
        ("primary", output_root / "final/boards/inkfall-press-hall-v3-primary-review-board.png", [render_by_view[key] for key in ("gameplay_lane", "north_hero", "south_hero", "overhead_context")]),
        ("mechanical", output_root / "final/boards/inkfall-press-hall-v3-mechanical-review-board.png", [render_by_view[key] for key in ("north_force_path", "south_tension", "baffle_detail", "cover_detail")]),
    ]
    for board_id, board_path, images in boards:
        create_review_board(board_path, images, board_id)
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path), check_existing=False)
    export_path = export_render_only(output_root)

    envelope_results = V1_BUILDER.validate_replacement_envelopes()
    constants_path = repo_root / "src/content/maps/constants.ts"
    constants_text = constants_path.read_text(encoding="utf-8")
    collision_objects = sorted(obj.name for obj in bpy.data.objects if obj.get("kyx_collision") not in {False, None})
    final_counts = family_counts("kyx_v3_final_family")
    inherited_counts = family_counts("kyx_v3_family")
    auxiliary_members = {
        target: [obj.name for obj in bpy.data.objects if obj.get("kyx_replacement_target") == target and obj.get("kyx_v3_final_family")]
        for target in sorted(REPLACED_AUXILIARY_TARGETS)
    }
    paper_rolls = [obj for obj in bpy.data.objects if obj.get("kyx_v3_family") == "paper_roll"]
    paper_webs = [obj for obj in bpy.data.objects if obj.get("kyx_v3_family") == "supported_paper_web"]
    paper_support_counts = {
        obj.name: sum(1 for candidate in bpy.data.objects if candidate.get("kyx_support_target") == obj.name)
        for obj in [*paper_rolls, *paper_webs]
    }

    p67_after = V1_BUILDER.verify_inputs(repo_root)
    v1_after = verify_hash_set(repo_root, v31.PRESERVED_V1)
    v2_after = verify_hash_set(repo_root, v31.PRESERVED_REJECTED_V2)
    baseline_v3_after = verify_hash_set(repo_root, v31.PRESERVED_V3_CHECKPOINT)
    v31_after = verify_hash_set(repo_root, FROZEN_V3_1)
    render_artifacts = [artifact(item["path"], repo_root, include_resolution=True) | {"view": item["view"], "mode": item["mode"]} for item in render_results]
    board_artifacts = [artifact(path, repo_root, include_resolution=True) | {"id": board_id} for board_id, path, _ in boards]
    source_artifact = artifact(source_path, repo_root)
    export_artifact = artifact(export_path, repo_root)

    checks = {
        "p67InputsUnchanged": p67_before == p67_after,
        "verifiedV1Unchanged": v1_before == v1_after,
        "rejectedV2Unchanged": v2_before == v2_after,
        "baselineV3CheckpointUnchanged": baseline_v3_before == baseline_v3_after,
        "approvedV31CheckpointFrozen": v31_before == v31_after,
        "catalogDefaultStillRevision1": "DEFAULT_MAP_REVISION = 1 as const" in constants_text,
        "authorityCollisionObjectsAbsent": collision_objects == [],
        "allReplacementEnvelopesContained": all(item["status"] == "PASS" for item in envelope_results),
        "allBafflesRebuiltAsOpenGuards": all(len(auxiliary_members[target]) >= 20 for target in BAFFLE_TARGETS) and final_counts.get("open_guard_grille", 0) >= 32,
        "allCoversRebuiltAsRibbedServiceCages": all(len(auxiliary_members[target]) >= 10 for target in COVER_TARGETS) and final_counts.get("ribbed_cover_frame", 0) >= 18,
        "northForcePathRetainedAndServiced": inherited_counts.get("powered_force_path", 0) >= 10 and inherited_counts.get("crosshead_guide", 0) >= 4 and final_counts.get("service_hardware", 0) >= 4,
        "southRollerTensionSystemResolved": final_counts.get("south_tension_roller", 0) >= 2 and final_counts.get("south_tension_arm", 0) >= 2 and final_counts.get("south_tension_adjuster", 0) >= 2 and final_counts.get("south_drive_train", 0) >= 3,
        "bearingFastenerAndGuardAccentsPresent": final_counts.get("bearing_housing", 0) >= 12 and final_counts.get("fastener", 0) >= 24 and final_counts.get("south_drive_guard", 0) >= 3,
        "paperSystemsRemainSupported": len(paper_rolls) == 2 and len(paper_webs) == 4 and all(paper_support_counts[obj.name] >= 2 for obj in [*paper_rolls, *paper_webs]),
        "eightFinalViewsRendered": len(render_artifacts) == 8 and all(item["resolution"] == [1600, 900] for item in render_artifacts),
        "twoFinalBoardsRendered": len(board_artifacts) == 2 and all(item["resolution"] == [1920, 1080] for item in board_artifacts),
        "stagedRenderGlbWritten": export_artifact["bytes"] > 1024,
    }
    status = "BOUNDED_PRESS_HALL_FINAL_ART_V3_BUILD_PASS" if all(checks.values()) else "BOUNDED_PRESS_HALL_FINAL_ART_V3_BUILD_FAIL"
    report = {
        "schemaVersion": 1,
        "kind": "inkfall_foundry_press_hall_final_art_v3_build_report",
        "status": status,
        "scope": SCOPE,
        "visualDecision": VISUAL_DECISION,
        "checks": checks,
        "binding": {
            "mapId": "inkfall_foundry",
            "grayboxRevision": 2,
            "grayboxLockRevision": 1,
            "catalogDefaultRevision": 1,
            "parentArtCandidate": "inkfall_foundry_press_hall_hero_checkpoint_v3_1",
            "productSelectable": False,
            "runtimeIntegrated": False,
            "shippingDefault": False,
        },
        "generator": {"id": GENERATOR_ID, "version": 3, "blenderVersion": bpy.app.version_string, "builderSha256": sha256_file(Path(__file__).resolve())},
        "removedInheritedAuxiliaries": removed_auxiliaries,
        "removedCheckpointReviewRig": removed_review_rig,
        "finalDetailCounts": final_counts,
        "inheritedV31DetailCounts": inherited_counts,
        "auxiliaryReplacementMembers": {key: sorted(value) for key, value in auxiliary_members.items()},
        "paperSupportCounts": paper_support_counts,
        "replacementEnvelopeValidation": envelope_results,
        "collisionObjects": collision_objects,
        "preservedP67Before": p67_before,
        "preservedP67After": p67_after,
        "preservedV1Before": v1_before,
        "preservedV1After": v1_after,
        "preservedRejectedV2Before": v2_before,
        "preservedRejectedV2After": v2_after,
        "preservedBaselineV3Before": baseline_v3_before,
        "preservedBaselineV3After": baseline_v3_after,
        "preservedApprovedV31Before": v31_before,
        "preservedApprovedV31After": v31_after,
        "deltaFromApprovedV31": [
            "replaced all four inherited baffles with anchored open guard frames, grilles, braces, hinges, and restrained safety identifiers",
            "replaced both full covers and both half covers with open ribbed service cages instead of loose slabs",
            "resolved the south machine as a distinct roller-calender and web-tension system with dancer roll, pivot arms, adjusters, split bearings, drive reduction, output guide, and calibration hardware",
            "added restrained north bearing, lubrication, guard-mount, and platen-service accents without changing the approved force-path silhouette",
            "preserved the combat lane, all ten P6.7 replacement envelopes, authority collision, catalog default, and frozen v3.1 checkpoint",
        ],
        "artifacts": {
            "sourceBlend": source_artifact,
            "renderGlb": export_artifact,
            "renders": render_artifacts,
            "boards": board_artifacts,
        },
        "nonClaims": NON_CLAIMS,
    }
    report_path = output_root / "final/validation/press-hall-final-art-v3-build-report.json"
    stable_json(report_path, report)
    manifest = {
        "schemaVersion": 1,
        "kind": "inkfall_foundry_staged_final_art_preview_manifest",
        "id": GENERATOR_ID,
        "status": "bounded_art_candidate_pending_parent_final_review_non_default" if all(checks.values()) else "bounded_art_candidate_build_failed",
        "scope": SCOPE,
        "visualDecision": VISUAL_DECISION,
        "binding": report["binding"],
        "frozenParentV31": v31_after,
        "source": {"builder": {"path": Path(__file__).resolve().relative_to(repo_root).as_posix(), "sha256": sha256_file(Path(__file__).resolve())}, "blend": source_artifact},
        "stagedRenderExport": export_artifact | {"runtimeIntegrated": False},
        "reviewRenders": render_artifacts,
        "reviewBoards": board_artifacts,
        "validation": {
            "buildReport": artifact(report_path, repo_root) | {"status": status},
            "independentVerifier": {"path": "tools/evidence/verify-inkfall-g5-press-hall-art-v3.py"},
            "independentReport": {"path": "evidence/2026-07-22/phase-6-g5-press-hall-final-art-v3/independent-verification.json", "status": "PENDING"},
        },
        "nonClaims": NON_CLAIMS,
    }
    manifest_path = output_root / "final/manifest.press-hall-final-art-v3.json"
    stable_json(manifest_path, manifest)
    print("G5_PRESS_HALL_V3_FINAL=" + json.dumps({"status": status, "visualDecision": VISUAL_DECISION, "report": str(report_path), "manifest": str(manifest_path)}, sort_keys=True))
    if not all(checks.values()):
        raise RuntimeError(f"Press Hall v3 final build failed: {[key for key, value in checks.items() if not value]}")


if __name__ == "__main__":
    main()
