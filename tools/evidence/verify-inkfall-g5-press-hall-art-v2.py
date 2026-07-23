"""Independent verifier for the preserved Inkfall Foundry Press Hall v2 art candidate.

Run with Blender 5.1+ so both the artifact package and the authored .blend are
checked.  This script does not import or execute the v2 builder and never edits
the candidate scene.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


EXPECTED_IMMUTABLE = {
    "graybox_lock": (
        "assets/source/maps/inkfall-foundry/runtime/graybox-lock.p6-7.v1.json",
        "feb6c299c426eff8fccdb3b9a92e3e0f8fd9d73d6dd32b678b68e5ef09178fdd",
    ),
    "dimension_contract": (
        "assets/source/maps/inkfall-foundry/art-kit/graybox-dimensions.p6-7.v1.json",
        "66b84c1d23a948b474a4cbc602a3e9b8a170a7f4be67d7d3c4356778825e3d83",
    ),
    "revision2_blend": (
        "assets/source/maps/inkfall-foundry/revisions/revision-2/source/inkfall_foundry.blend",
        "6dfb09a9c6c92dd830a21e61689ee9b363ef81928a0f8663339e6b868230f224",
    ),
    "revision2_render": (
        "assets/source/maps/inkfall-foundry/revisions/revision-2/export/render.graybox.glb",
        "90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634",
    ),
    "revision2_collision": (
        "assets/source/maps/inkfall-foundry/revisions/revision-2/export/collision.authority.glb",
        "cd661c12534dd7d2362c862f4ff9f9177cb9f8ef0cea85d14a3b18e3dfb1380e",
    ),
}

EXPECTED_V1 = {
    "blend": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v1/source/inkfall_foundry_press_hall_final_art_v1.blend",
        "e1d186c630bd87ee6c68b58427ba095086bae57bcf4daa147afbd859d7f92495",
    ),
    "glb": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v1/export/inkfall_foundry_press_hall_final_art_v1.glb",
        "7078294365656fc6a16a5581b8cf5ae7a4477590c2125bbbad69e94d1e509e4e",
    ),
    "build_report": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v1/validation/press-hall-final-art-v1-build-report.json",
        "b24a47f353b32ca97f4ec5aadb17a5ffc1d6c400770277ab626c8ed8764a67ca",
    ),
    "manifest": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v1/manifest.press-hall-final-art-v1.json",
        "bb2a3332fd22afb64d8bef82c71e311f336631ded793f2448f9014a50626dfbe",
    ),
}

LOCKED_REPLACEMENT_ENVELOPES = {
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

REQUIRED_COLLECTIONS = {
    "G5_PRESS_HALL_ARCHITECTURE",
    "G5_PRESS_HALL_MODULAR_ASSETS",
    "G5_TRANSITION_RED_FOLD",
    "G5_TRANSITION_PAPER_DROP",
    "G5_V2_SUPPORTED_PRINT_STOCK",
    "G5_V2_SUPPORTS_AND_CLAMPS",
    "G5_V2_FASTENERS",
    "G5_V2_CONDUIT_LOGIC",
    "G5_V2_FOUNDRY_MACHINERY",
    "G5_V2_PAPER_DROP_IDENTITY",
    "G5_V2_SURFACE_HISTORY",
    "G5_V2_SAFETY_SIGNAGE",
    "G5_V2_REVIEW_LIGHTING",
    "G5_V2_REVIEW_CAMERAS",
}

REQUIRED_MATERIAL_SLOTS = {
    "env_base_ceramic",
    "env_secondary_metal",
    "env_ink_surface",
    "env_vermilion_safety",
    "env_garden_fragment",
    "env_functional_marking",
    "env_emissive_signage",
}

REQUIRED_DETAIL_THRESHOLDS = {
    "supported_print_stock": 4,
    "support_and_clamp": 24,
    "fastener": 32,
    "conduit_and_cable": 20,
    "foundry_machinery": 24,
    "surface_history": 18,
    "safety_signage": 8,
    "paper_drop_identity": 18,
}

REMOVED_V1_FLOATERS = {
    "PH_HANGING_PAPER_00", "PH_HANGING_PAPER_01", "PH_HANGING_PAPER_02", "PH_HANGING_PAPER_03",
    "PH_HANGING_PAPER_SPINE_00", "PH_HANGING_PAPER_SPINE_01", "PH_HANGING_PAPER_SPINE_02", "PH_HANGING_PAPER_SPINE_03",
}


def parse_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument("--report-output", required=True)
    return parser.parse_args(raw)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def png_dimensions(path: Path) -> tuple[int, int]:
    with path.open("rb") as handle:
        if handle.read(8) != b"\x89PNG\r\n\x1a\n":
            raise ValueError(f"Not a PNG: {path}")
        length = struct.unpack(">I", handle.read(4))[0]
        if handle.read(4) != b"IHDR" or length < 8:
            raise ValueError(f"Missing PNG IHDR: {path}")
        return struct.unpack(">II", handle.read(8))


def glb_header(path: Path) -> dict[str, int | str]:
    with path.open("rb") as handle:
        magic, version, declared_length = struct.unpack("<4sII", handle.read(12))
    return {
        "magic": magic.decode("ascii", errors="replace"),
        "version": version,
        "declaredLength": declared_length,
        "actualLength": path.stat().st_size,
    }


def object_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector] | None:
    corners: list[Vector] = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not corners:
        return None
    return (
        Vector(tuple(min(corner[index] for corner in corners) for index in range(3))),
        Vector(tuple(max(corner[index] for corner in corners) for index in range(3))),
    )


def main() -> None:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    output_root = Path(args.output_root).resolve()
    report_output = Path(args.report_output).resolve()
    build_report_path = output_root / "validation/press-hall-final-art-v2-build-report.json"
    build_report = json.loads(build_report_path.read_text(encoding="utf-8"))
    checks: list[dict[str, Any]] = []

    def record(check_id: str, passed: bool, evidence: Any) -> None:
        checks.append({"id": check_id, "status": "PASS" if passed else "FAIL", "evidence": evidence})

    for group, expected in (("immutable", EXPECTED_IMMUTABLE), ("verified_v1", EXPECTED_V1)):
        results = {}
        for key, (relative, expected_sha) in expected.items():
            actual_sha = sha256_file(repo_root / relative)
            results[key] = {"path": relative, "expectedSha256": expected_sha, "actualSha256": actual_sha}
        record(f"{group}_hashes", all(value["expectedSha256"] == value["actualSha256"] for value in results.values()), results)

    constants_path = repo_root / "src/content/maps/constants.ts"
    constants_text = constants_path.read_text(encoding="utf-8")
    record("catalog_default_revision_is_1", "DEFAULT_MAP_REVISION = 1 as const" in constants_text, {
        "path": constants_path.relative_to(repo_root).as_posix(), "sha256": sha256_file(constants_path)
    })
    record("build_report_status", build_report.get("status") == "BOUNDED_PRESS_HALL_ART_V2_BUILD_PASS", build_report.get("status"))
    record("build_report_checks_all_true", all(build_report.get("checks", {}).values()), build_report.get("checks"))
    record("nonclaims_present", set(build_report.get("nonClaims", [])) >= {
        "G5_NOT_PASSED", "HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED", "PERFORMANCE_NOT_MEASURED",
        "PRODUCT_INTEGRATION_NOT_COMPLETE", "REVISION_2_NOT_DEFAULT_OR_SHIPPING",
    }, build_report.get("nonClaims"))

    artifact_checks = []
    artifacts = [
        build_report["artifacts"]["sourceBlend"], build_report["artifacts"]["renderGlb"],
        *build_report["artifacts"]["renders"], *build_report["artifacts"]["boards"],
    ]
    for artifact in artifacts:
        path = repo_root / artifact["path"]
        actual_sha = sha256_file(path)
        entry = {"path": artifact["path"], "expectedSha256": artifact["sha256"], "actualSha256": actual_sha, "bytes": path.stat().st_size}
        if path.suffix.lower() == ".png":
            entry["dimensions"] = list(png_dimensions(path))
            entry["expectedDimensions"] = artifact["resolution"]
        artifact_checks.append(entry)
    record("artifact_hashes_and_dimensions", all(
        item["expectedSha256"] == item["actualSha256"] and
        ("dimensions" not in item or item["dimensions"] == item["expectedDimensions"])
        for item in artifact_checks
    ), artifact_checks)

    glb_path = repo_root / build_report["artifacts"]["renderGlb"]["path"]
    glb = glb_header(glb_path)
    record("render_glb_header", glb["magic"] == "glTF" and glb["version"] == 2 and glb["declaredLength"] == glb["actualLength"], glb)
    blend_path = repo_root / build_report["artifacts"]["sourceBlend"]["path"]
    record("blend_binary_present", blend_path.stat().st_size > 1024, {"path": blend_path.relative_to(repo_root).as_posix(), "bytes": blend_path.stat().st_size})

    bpy.ops.wm.open_mainfile(filepath=str(blend_path), load_ui=False)
    scene = bpy.context.scene
    scene_contract = {
        "scope": scene.get("kyx_scope"), "mapId": scene.get("kyx_map_id"),
        "grayboxRevision": scene.get("kyx_graybox_revision"), "grayboxLockRevision": scene.get("kyx_graybox_lock_revision"),
        "catalogDefaultRevision": scene.get("kyx_catalog_default_revision"), "authorityCollisionIncluded": scene.get("kyx_authority_collision_included"),
        "productSelectable": scene.get("kyx_product_selectable"), "shippingDefault": scene.get("kyx_shipping_default"),
        "g5Claimed": scene.get("kyx_g5_claimed"), "parentArtCandidate": scene.get("kyx_parent_art_candidate"),
    }
    expected_contract = {
        "scope": "G5_BOUNDED_PRESS_HALL_ART_V2_PREVIEW_ONLY", "mapId": "inkfall_foundry",
        "grayboxRevision": 2, "grayboxLockRevision": 1, "catalogDefaultRevision": 1,
        "authorityCollisionIncluded": False, "productSelectable": False, "shippingDefault": False,
        "g5Claimed": False, "parentArtCandidate": "inkfall_foundry_press_hall_final_art_v1",
    }
    record("blend_scene_boundary", scene_contract == expected_contract, scene_contract)

    collection_names = {collection.name for collection in bpy.data.collections}
    record("required_collections", REQUIRED_COLLECTIONS <= collection_names, sorted(collection_names))
    material_slots = {str(material.get("kyx_material_slot")) for material in bpy.data.materials if material.get("kyx_material_slot")}
    record("required_material_slots", REQUIRED_MATERIAL_SLOTS <= material_slots, sorted(material_slots))
    collision_objects = [obj.name for obj in bpy.data.objects if obj.get("kyx_collision") not in {False, None}]
    record("no_authority_collision_objects", not collision_objects, collision_objects)
    record("removed_v1_floaters_absent", not (REMOVED_V1_FLOATERS & {obj.name for obj in bpy.data.objects}), sorted(REMOVED_V1_FLOATERS & {obj.name for obj in bpy.data.objects}))

    detail_counts = {family: 0 for family in REQUIRED_DETAIL_THRESHOLDS}
    for obj in bpy.data.objects:
        family = obj.get("kyx_v2_detail_family")
        if family in detail_counts:
            detail_counts[str(family)] += 1
    record("v2_detail_thresholds", all(detail_counts[key] >= value for key, value in REQUIRED_DETAIL_THRESHOLDS.items()), {
        key: {"required": value, "actual": detail_counts[key]} for key, value in REQUIRED_DETAIL_THRESHOLDS.items()
    })

    stocks = [obj for obj in bpy.data.objects if obj.get("kyx_v2_detail_family") == "supported_print_stock"]
    support_counts = {}
    for stock in stocks:
        tagged = sum(1 for obj in bpy.data.objects if obj.get("kyx_support_target") == stock.name)
        support_counts[stock.name] = {"declared": int(stock.get("kyx_support_count", 0)), "taggedObjects": tagged}
    record("supported_print_stock", len(stocks) == 4 and all(item["declared"] >= 5 and item["taggedObjects"] >= 5 for item in support_counts.values()), support_counts)
    paper_drop_details = [obj.name for obj in bpy.data.objects if obj.get("kyx_v2_detail_family") == "paper_drop_identity" and obj.get("kyx_transition_id") == "paper_drop"]
    record("paper_drop_machine_identity", len(paper_drop_details) >= 18, {"count": len(paper_drop_details), "objects": sorted(paper_drop_details)})

    envelope_results = []
    tolerance = 0.004
    for target, envelope in sorted(LOCKED_REPLACEMENT_ENVELOPES.items()):
        members = [obj for obj in bpy.data.objects if obj.get("kyx_replacement_target") == target]
        bounds = object_bounds(members)
        if bounds is None:
            envelope_results.append({"target": target, "status": "FAIL", "reason": "missing members"})
            continue
        lower, upper = bounds
        center = Vector(envelope["center"])
        half = Vector(envelope["size"]) * 0.5
        expected_lower, expected_upper = center - half, center + half
        passed = all(lower[index] >= expected_lower[index] - tolerance and upper[index] <= expected_upper[index] + tolerance for index in range(3))
        envelope_results.append({
            "target": target, "status": "PASS" if passed else "FAIL", "memberCount": len(members),
            "authoredLowerMeters": [round(value, 6) for value in lower], "authoredUpperMeters": [round(value, 6) for value in upper],
            "lockedCenterMeters": list(envelope["center"]), "lockedSizeMeters": list(envelope["size"]),
        })
    record("replacement_envelopes", all(item["status"] == "PASS" for item in envelope_results), envelope_results)

    pass_count = sum(check["status"] == "PASS" for check in checks)
    status = "INDEPENDENT_G5_PRESS_HALL_ART_V2_VERIFICATION_PASS" if pass_count == len(checks) else "INDEPENDENT_G5_PRESS_HALL_ART_V2_VERIFICATION_FAIL"
    payload = {
        "schemaVersion": 1,
        "kind": "inkfall_foundry_g5_press_hall_art_v2_independent_verification",
        "status": status,
        "verifier": "tools/evidence/verify-inkfall-g5-press-hall-art-v2.py",
        "blenderVersion": bpy.app.version_string,
        "summary": {"passCount": pass_count, "checkCount": len(checks), "failCount": len(checks) - pass_count},
        "checks": checks,
        "nonClaims": [
            "G5_NOT_PASSED", "HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED", "HUMAN_PLAYTEST_ACCEPTANCE_NOT_PASSED",
            "PERFORMANCE_NOT_MEASURED", "NO_SNAG_RUNTIME_PROOF_NOT_COMPLETE", "COLOR_VISION_REVIEW_NOT_COMPLETE",
            "PRODUCT_INTEGRATION_NOT_COMPLETE", "REVISION_2_NOT_DEFAULT_OR_SHIPPING", "DEPLOYMENT_NOT_AUTHORIZED",
        ],
    }
    report_output.parent.mkdir(parents=True, exist_ok=True)
    report_output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print("G5_PRESS_HALL_V2_VERIFY=" + json.dumps({"status": status, "report": str(report_output)}, sort_keys=True))
    if status.endswith("_FAIL"):
        raise RuntimeError(f"Independent Press Hall v2 verification failed: {len(checks) - pass_count} checks")


if __name__ == "__main__":
    main()
