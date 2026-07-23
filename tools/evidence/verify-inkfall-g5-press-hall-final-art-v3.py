"""Independent verifier for the bounded Press Hall v3 final-art package.

This script opens and inspects the authored Blender source but never imports or
executes the v3 builder.  A PASS means artifact integrity and the frozen spatial
contract passed; it is not G5, visual acceptance, playtest, or performance proof.
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

EXPECTED_REJECTED_V2 = {
    "blend": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v2/source/inkfall_foundry_press_hall_final_art_v2.blend",
        "a268331d8ca016a7b9ebeaa4e9b16d14d155ce7a532196e2590acce0debbc0ce",
    ),
    "glb": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v2/export/inkfall_foundry_press_hall_final_art_v2.glb",
        "542ad773414b3d42794b3550440e2555369ae82c174bf24e2fe37470803a2a8a",
    ),
    "report": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v2/validation/press-hall-final-art-v2-build-report.json",
        "e456a5987c035f2ed0b1cf69699763620228fde79b655d2b1e731d73f430181c",
    ),
    "manifest": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v2/manifest.press-hall-final-art-v2.json",
        "1daf91b5d6ad36d916692a1e8eb8ee59605e48e11508fb338b18c7febfbc7a2a",
    ),
}

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

AUXILIARY_TARGETS = {
    "R_MODULE__PRESS_BAFFLE_E_INNER", "R_MODULE__PRESS_BAFFLE_W_INNER",
    "R_MODULE__PRESS_BAFFLE_E_OUTER", "R_MODULE__PRESS_BAFFLE_W_OUTER",
    "R_MODULE__HALF_COVER_PRESS_E", "R_MODULE__HALF_COVER_PRESS_W",
    "R_MODULE__FULL_COVER_PRESS_E", "R_MODULE__FULL_COVER_PRESS_W",
}

REQUIRED_NONCLAIMS = {
    "G5_NOT_PASSED", "HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED",
    "HUMAN_PLAYTEST_ACCEPTANCE_NOT_PASSED", "PERFORMANCE_NOT_MEASURED",
    "NO_SNAG_RUNTIME_PROOF_NOT_COMPLETE", "PRODUCT_INTEGRATION_NOT_COMPLETE",
    "REVISION_2_NOT_DEFAULT_OR_SHIPPING", "DEPLOYMENT_NOT_AUTHORIZED",
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


def png_dimensions(path: Path) -> list[int]:
    with path.open("rb") as handle:
        if handle.read(8) != b"\x89PNG\r\n\x1a\n":
            raise ValueError(f"Not a PNG: {path}")
        length = struct.unpack(">I", handle.read(4))[0]
        if handle.read(4) != b"IHDR" or length < 8:
            raise ValueError(f"Missing PNG IHDR: {path}")
        return list(struct.unpack(">II", handle.read(8)))


def glb_header(path: Path) -> dict[str, int | str]:
    with path.open("rb") as handle:
        magic, version, declared_length = struct.unpack("<4sII", handle.read(12))
    return {"magic": magic.decode("ascii", errors="replace"), "version": version, "declaredLength": declared_length, "actualLength": path.stat().st_size}


def object_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector] | None:
    corners: list[Vector] = []
    for obj in objects:
        if obj.type == "MESH":
            corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not corners:
        return None
    return (
        Vector(tuple(min(corner[index] for corner in corners) for index in range(3))),
        Vector(tuple(max(corner[index] for corner in corners) for index in range(3))),
    )


def verify_hashes(repo_root: Path, expected: dict[str, tuple[str, str]]) -> dict[str, dict[str, str]]:
    results = {}
    for key, (relative, expected_sha) in expected.items():
        actual_sha = sha256_file(repo_root / relative)
        results[key] = {"path": relative, "expectedSha256": expected_sha, "actualSha256": actual_sha}
    return results


def main() -> None:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    output_root = Path(args.output_root).resolve()
    report_output = Path(args.report_output).resolve()
    build_report_path = output_root / "final/validation/press-hall-final-art-v3-build-report.json"
    manifest_path = output_root / "final/manifest.press-hall-final-art-v3.json"
    build_report = json.loads(build_report_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    checks: list[dict[str, Any]] = []

    def record(check_id: str, passed: bool, evidence: Any) -> None:
        checks.append({"id": check_id, "status": "PASS" if passed else "FAIL", "evidence": evidence})

    for check_id, expected in (
        ("immutable_p67_hashes", EXPECTED_IMMUTABLE),
        ("verified_v1_hashes", EXPECTED_V1),
        ("preserved_rejected_v2_hashes", EXPECTED_REJECTED_V2),
        ("frozen_v31_checkpoint_hashes", FROZEN_V3_1),
    ):
        results = verify_hashes(repo_root, expected)
        record(check_id, all(item["expectedSha256"] == item["actualSha256"] for item in results.values()), results)

    constants_path = repo_root / "src/content/maps/constants.ts"
    constants_text = constants_path.read_text(encoding="utf-8")
    record("catalog_default_revision_is_1", "DEFAULT_MAP_REVISION = 1 as const" in constants_text, {"path": constants_path.relative_to(repo_root).as_posix(), "sha256": sha256_file(constants_path)})
    record("build_report_pass", build_report.get("status") == "BOUNDED_PRESS_HALL_FINAL_ART_V3_BUILD_PASS" and all(build_report.get("checks", {}).values()), {"status": build_report.get("status"), "checks": build_report.get("checks")})
    record("visual_decision_pending", build_report.get("visualDecision") == "PENDING_PARENT_FINAL_REVIEW" and manifest.get("visualDecision") == "PENDING_PARENT_FINAL_REVIEW", {"buildReport": build_report.get("visualDecision"), "manifest": manifest.get("visualDecision")})
    record("nonclaims_present", set(build_report.get("nonClaims", [])) >= REQUIRED_NONCLAIMS and set(manifest.get("nonClaims", [])) >= REQUIRED_NONCLAIMS, build_report.get("nonClaims"))
    record("manifest_boundary", manifest.get("status") == "bounded_art_candidate_pending_parent_final_review_non_default" and manifest.get("binding", {}).get("runtimeIntegrated") is False and manifest.get("binding", {}).get("shippingDefault") is False, manifest.get("binding"))

    artifact_checks = []
    artifacts = [build_report["artifacts"]["sourceBlend"], build_report["artifacts"]["renderGlb"], *build_report["artifacts"]["renders"], *build_report["artifacts"]["boards"]]
    for item in artifacts:
        path = repo_root / item["path"]
        actual_sha = sha256_file(path)
        evidence = {"path": item["path"], "expectedSha256": item["sha256"], "actualSha256": actual_sha, "bytes": path.stat().st_size}
        if path.suffix.lower() == ".png":
            evidence["dimensions"] = png_dimensions(path)
            evidence["expectedDimensions"] = item["resolution"]
        artifact_checks.append(evidence)
    record("artifact_hashes_and_dimensions", all(item["expectedSha256"] == item["actualSha256"] and ("dimensions" not in item or item["dimensions"] == item["expectedDimensions"]) for item in artifact_checks), artifact_checks)
    glb_path = repo_root / build_report["artifacts"]["renderGlb"]["path"]
    glb = glb_header(glb_path)
    record("render_glb_header", glb["magic"] == "glTF" and glb["version"] == 2 and glb["declaredLength"] == glb["actualLength"], glb)

    blend_path = repo_root / build_report["artifacts"]["sourceBlend"]["path"]
    bpy.ops.wm.open_mainfile(filepath=str(blend_path), load_ui=False)
    scene = bpy.context.scene
    scene_contract = {
        "scope": scene.get("kyx_scope"),
        "mapId": scene.get("kyx_map_id"),
        "grayboxRevision": scene.get("kyx_graybox_revision"),
        "grayboxLockRevision": scene.get("kyx_graybox_lock_revision"),
        "catalogDefaultRevision": scene.get("kyx_catalog_default_revision"),
        "authorityCollisionIncluded": scene.get("kyx_authority_collision_included"),
        "productSelectable": scene.get("kyx_product_selectable"),
        "shippingDefault": scene.get("kyx_shipping_default"),
        "g5Claimed": scene.get("kyx_g5_claimed"),
        "finalReviewCandidate": scene.get("kyx_final_review_candidate"),
        "visualDecision": scene.get("kyx_visual_decision"),
        "parent": scene.get("kyx_parent_art_candidate"),
    }
    expected_contract = {
        "scope": "G5_BOUNDED_PRESS_HALL_FINAL_ART_V3_PREVIEW_ONLY",
        "mapId": "inkfall_foundry",
        "grayboxRevision": 2,
        "grayboxLockRevision": 1,
        "catalogDefaultRevision": 1,
        "authorityCollisionIncluded": False,
        "productSelectable": False,
        "shippingDefault": False,
        "g5Claimed": False,
        "finalReviewCandidate": True,
        "visualDecision": "PENDING_PARENT_FINAL_REVIEW",
        "parent": "inkfall_foundry_press_hall_hero_checkpoint_v3_1",
    }
    record("blend_scene_boundary", scene_contract == expected_contract, scene_contract)
    required_collections = {"G5_V3_FINAL_MECHANICAL_DELTA", "G5_V3_FINAL_REVIEW_CAMERAS", "G5_V3_FINAL_REVIEW_LIGHTING", "G5_V3_1_HERO_PRESS_MACHINERY", "G5_V3_1_SUPPORTED_PAPER_SYSTEMS"}
    collection_names = {collection.name for collection in bpy.data.collections}
    record("required_collections", required_collections <= collection_names, sorted(collection_names))
    required_slots = {"env_base_ceramic", "env_secondary_metal", "env_ink_surface", "env_vermilion_safety", "env_garden_fragment", "env_functional_marking", "env_emissive_signage"}
    material_slots = {str(material.get("kyx_material_slot")) for material in bpy.data.materials if material.get("kyx_material_slot")}
    record("semantic_material_slots", required_slots <= material_slots, sorted(material_slots))
    collision_objects = [obj.name for obj in bpy.data.objects if obj.get("kyx_collision") not in {False, None}]
    record("no_authority_collision_objects", not collision_objects, collision_objects)

    final_counts: dict[str, int] = {}
    inherited_counts: dict[str, int] = {}
    for obj in bpy.data.objects:
        final_family = obj.get("kyx_v3_final_family")
        inherited_family = obj.get("kyx_v3_family")
        if final_family:
            final_counts[str(final_family)] = final_counts.get(str(final_family), 0) + 1
        if inherited_family:
            inherited_counts[str(inherited_family)] = inherited_counts.get(str(inherited_family), 0) + 1
    record("north_literal_force_path", inherited_counts.get("powered_force_path", 0) >= 10 and inherited_counts.get("crosshead_guide", 0) >= 4 and final_counts.get("service_hardware", 0) >= 4, {"final": final_counts, "inherited": inherited_counts})
    record("south_distinct_roller_tension_system", final_counts.get("south_tension_roller", 0) >= 2 and final_counts.get("south_tension_arm", 0) >= 2 and final_counts.get("south_tension_adjuster", 0) >= 2 and final_counts.get("south_drive_train", 0) >= 3 and final_counts.get("bearing_housing", 0) >= 12, final_counts)
    record("restrained_guard_service_fasteners", final_counts.get("fastener", 0) >= 24 and final_counts.get("south_drive_guard", 0) >= 3 and final_counts.get("service_access", 0) >= 16, final_counts)

    auxiliary_members = {}
    for target in sorted(AUXILIARY_TARGETS):
        members = [obj for obj in bpy.data.objects if obj.get("kyx_replacement_target") == target]
        auxiliary_members[target] = {"count": len(members), "allFinalDelta": bool(members) and all(obj.get("kyx_v3_final_family") for obj in members), "families": sorted({str(obj.get("kyx_v3_final_family")) for obj in members})}
    record("auxiliary_slabs_replaced", all(item["count"] >= 10 and item["allFinalDelta"] for item in auxiliary_members.values()), auxiliary_members)

    paper_rolls = [obj for obj in bpy.data.objects if obj.get("kyx_v3_family") == "paper_roll"]
    paper_webs = [obj for obj in bpy.data.objects if obj.get("kyx_v3_family") == "supported_paper_web"]
    paper_supports = {obj.name: sum(1 for candidate in bpy.data.objects if candidate.get("kyx_support_target") == obj.name) for obj in [*paper_rolls, *paper_webs]}
    record("supported_paper_systems", len(paper_rolls) == 2 and len(paper_webs) == 4 and all(count >= 2 for count in paper_supports.values()), paper_supports)

    envelope_results = []
    tolerance = 0.004
    for target, envelope in sorted(LOCKED_ENVELOPES.items()):
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
            "target": target,
            "status": "PASS" if passed else "FAIL",
            "memberCount": len(members),
            "authoredLowerMeters": [round(value, 6) for value in lower],
            "authoredUpperMeters": [round(value, 6) for value in upper],
            "lockedCenterMeters": list(envelope["center"]),
            "lockedSizeMeters": list(envelope["size"]),
        })
    record("replacement_envelopes", all(item["status"] == "PASS" for item in envelope_results), envelope_results)

    pass_count = sum(check["status"] == "PASS" for check in checks)
    status = "INDEPENDENT_PRESS_HALL_FINAL_ART_V3_VERIFICATION_PASS" if pass_count == len(checks) else "INDEPENDENT_PRESS_HALL_FINAL_ART_V3_VERIFICATION_FAIL"
    payload = {
        "schemaVersion": 1,
        "kind": "inkfall_foundry_press_hall_final_art_v3_independent_verification",
        "status": status,
        "visualDecision": "PENDING_PARENT_FINAL_REVIEW",
        "verifier": "tools/evidence/verify-inkfall-g5-press-hall-final-art-v3.py",
        "blenderVersion": bpy.app.version_string,
        "summary": {"passCount": pass_count, "checkCount": len(checks), "failCount": len(checks) - pass_count},
        "checks": checks,
        "nonClaims": sorted(REQUIRED_NONCLAIMS | {"COLOR_VISION_REVIEW_NOT_COMPLETE"}),
    }
    report_output.parent.mkdir(parents=True, exist_ok=True)
    report_output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print("PRESS_HALL_V3_FINAL_VERIFY=" + json.dumps({"status": status, "report": str(report_output)}, sort_keys=True))
    if status.endswith("_FAIL"):
        raise RuntimeError(f"Independent Press Hall v3 final verification failed: {len(checks) - pass_count} checks")


if __name__ == "__main__":
    main()
