"""Independent verifier for the Press Hall v3.2 readability candidate.

The verifier does not import or execute the builder.  It validates frozen
parents, artifact hashes, offline payload metrics, the named authoring source,
and P6.7 envelopes.  PASS is not visual acceptance, G5, or runtime proof.
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

FROZEN_FINAL_CORE = {
    "builder": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/build_press_hall_final_art_v3.py",
        "63023443ed9047a63f5f20a042ac13640e7b625a2f2a2da749a36599c97ca77a",
    ),
    "verifier": (
        "tools/evidence/verify-inkfall-g5-press-hall-final-art-v3.py",
        "45d1373c24665d8805bb8a8fb1d8ca15819514613bf6cc35ff872a258066af86",
    ),
    "source": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/source/inkfall_foundry_press_hall_final_art_v3.blend",
        "160ce9e8be88f88149f55732200652d48d608dd26ad404804f794585c5aaf09b",
    ),
    "report": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/validation/press-hall-final-art-v3-build-report.json",
        "573adae86fa96e02a92a2b49e1575e2dfa17aa1e73ba509015446a31be8d9c9d",
    ),
    "manifest": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/manifest.press-hall-final-art-v3.json",
        "9bae11f5ae75d1fce1794b41f7ca9653827ee6649e4b42c543b17b1976880909",
    ),
    "glb": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/export/inkfall_foundry_press_hall_final_art_v3.glb",
        "0699bf53860261d4204c3e9b1b5e61cec51324bf195ab5a3dc4852cfcf573e20",
    ),
    "primary_board": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/boards/inkfall-press-hall-v3-primary-review-board.png",
        "51b0809d597be11f4f3bf88cadd3d1ced902cbc2aa3badb56a8fbadfb13046fa",
    ),
    "mechanical_board": (
        "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/final/boards/inkfall-press-hall-v3-mechanical-review-board.png",
        "1276ad31c19e73101c08d7c7a4ceff7a1d5e47f03d9cb750a4e5471d911cc02b",
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

REQUIRED_NONCLAIMS = {
    "G5_NOT_PASSED", "HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED",
    "HUMAN_PLAYTEST_ACCEPTANCE_NOT_PASSED", "PERFORMANCE_NOT_MEASURED",
    "NO_SNAG_RUNTIME_PROOF_NOT_COMPLETE", "PRODUCT_INTEGRATION_NOT_COMPLETE",
    "REVISION_2_NOT_DEFAULT_OR_SHIPPING", "PAYLOAD_MEASURED_NOT_RUNTIME_PROFILED",
    "DEPLOYMENT_NOT_AUTHORIZED",
}

PARENT_DECISION = "V3_2_BOUNDED_READABILITY_AND_BATCHING_PASS / ART_DIRECTION_AND_RUNTIME_CANDIDATE_ONLY"
REVIEW_NOTE = (
    "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/readability-v3-2/PARENT_REVIEW_DECISION.md",
    "bfaa68ff134a1738a837a31d3ec639a6127b94c81bdaea5b638924c664c4b972",
)


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


def verify_hashes(repo_root: Path, expected: dict[str, tuple[str, str]]) -> dict[str, dict[str, str]]:
    results = {}
    for key, (relative, expected_sha) in expected.items():
        actual_sha = sha256_file(repo_root / relative)
        results[key] = {"path": relative, "expectedSha256": expected_sha, "actualSha256": actual_sha}
    return results


def glb_metrics(path: Path) -> dict[str, Any]:
    with path.open("rb") as handle:
        magic, version, declared_length = struct.unpack("<4sII", handle.read(12))
        document = None
        while handle.tell() < declared_length:
            chunk_length, chunk_type = struct.unpack("<II", handle.read(8))
            chunk = handle.read(chunk_length)
            if chunk_type == 0x4E4F534A:
                document = json.loads(chunk.decode("utf-8").rstrip(" \t\r\n\x00"))
                break
    if magic != b"glTF" or version != 2 or document is None:
        raise RuntimeError(f"Invalid GLB: {path}")
    accessors = document.get("accessors", [])
    primitive_count = 0
    vertices = 0
    triangles = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            primitive_count += 1
            position = primitive.get("attributes", {}).get("POSITION")
            if position is not None:
                vertices += int(accessors[position].get("count", 0))
            if int(primitive.get("mode", 4)) == 4:
                indices = primitive.get("indices")
                triangles += int(accessors[indices].get("count", 0)) // 3 if indices is not None else int(accessors[position].get("count", 0)) // 3
    return {
        "bytes": path.stat().st_size,
        "declaredBytes": declared_length,
        "nodeCount": len(document.get("nodes", [])),
        "meshCount": len(document.get("meshes", [])),
        "primitiveCount": primitive_count,
        "drawCallProxy": primitive_count,
        "summedPositionVertices": vertices,
        "triangleCount": triangles,
        "materialCount": len(document.get("materials", [])),
        "textureCount": len(document.get("textures", [])),
        "imageCount": len(document.get("images", [])),
        "extensionsUsed": document.get("extensionsUsed", []),
        "extensionsRequired": document.get("extensionsRequired", []),
    }


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


def main() -> None:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    output_root = Path(args.output_root).resolve()
    report_output = Path(args.report_output).resolve()
    build_report_path = output_root / "readability-v3-2/validation/press-hall-readability-v3-2-build-report.json"
    manifest_path = output_root / "readability-v3-2/manifest.press-hall-readability-v3-2.json"
    build_report = json.loads(build_report_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    checks: list[dict[str, Any]] = []

    def record(check_id: str, passed: bool, evidence: Any) -> None:
        checks.append({"id": check_id, "status": "PASS" if passed else "FAIL", "evidence": evidence})

    for check_id, expected in (("immutable_p67_hashes", EXPECTED_IMMUTABLE), ("frozen_final_core_hashes", FROZEN_FINAL_CORE)):
        results = verify_hashes(repo_root, expected)
        record(check_id, all(item["expectedSha256"] == item["actualSha256"] for item in results.values()), results)

    constants_path = repo_root / "src/content/maps/constants.ts"
    constants_text = constants_path.read_text(encoding="utf-8")
    record("catalog_default_revision_is_1", "DEFAULT_MAP_REVISION = 1 as const" in constants_text, {"path": constants_path.relative_to(repo_root).as_posix(), "sha256": sha256_file(constants_path)})
    record("build_report_pass", build_report.get("status") == "BOUNDED_PRESS_HALL_V3_2_READABILITY_BUILD_PASS" and all(build_report.get("checks", {}).values()), {"status": build_report.get("status"), "checks": build_report.get("checks")})
    record("bounded_parent_decision_sealed", build_report.get("visualDecision") == "PENDING_PARENT_FINAL_REVIEW" and manifest.get("visualDecision") == PARENT_DECISION and manifest.get("parentReview", {}).get("decision") == PARENT_DECISION, {"buildReportPreReview": build_report.get("visualDecision"), "manifest": manifest.get("visualDecision"), "parentReview": manifest.get("parentReview")})
    review_path, expected_review_sha = REVIEW_NOTE
    actual_review_sha = sha256_file(repo_root / review_path)
    record("parent_review_note_hash", actual_review_sha == expected_review_sha, {"path": review_path, "expectedSha256": expected_review_sha, "actualSha256": actual_review_sha})
    record("nonclaims_present", set(build_report.get("nonClaims", [])) >= REQUIRED_NONCLAIMS and set(manifest.get("nonClaims", [])) >= REQUIRED_NONCLAIMS, build_report.get("nonClaims"))
    record("manifest_nondefault_boundary", manifest.get("status") == "bounded_readability_and_batching_pass_art_direction_and_runtime_candidate_only_non_default" and manifest.get("binding", {}).get("runtimeIntegrated") is False and manifest.get("binding", {}).get("shippingDefault") is False, {"status": manifest.get("status"), "binding": manifest.get("binding")})

    artifact_checks = []
    artifacts = [
        build_report["artifacts"]["sourceBlend"],
        build_report["artifacts"]["optimizedExportBlend"],
        build_report["artifacts"]["standardRenderGlb"],
        build_report["artifacts"]["spatialMaterialJoinedRenderGlb"],
        *build_report["artifacts"]["renders"],
        *build_report["artifacts"]["boards"],
    ]
    for item in artifacts:
        path = repo_root / item["path"]
        evidence = {"path": item["path"], "expectedSha256": item["sha256"], "actualSha256": sha256_file(path), "bytes": path.stat().st_size}
        if path.suffix.lower() == ".png":
            evidence["dimensions"] = png_dimensions(path)
            evidence["expectedDimensions"] = item["resolution"]
        artifact_checks.append(evidence)
    record("artifact_hashes_and_dimensions", all(item["expectedSha256"] == item["actualSha256"] and ("dimensions" not in item or item["dimensions"] == item["expectedDimensions"]) for item in artifact_checks), artifact_checks)

    standard_path = repo_root / build_report["artifacts"]["standardRenderGlb"]["path"]
    optimized_path = repo_root / build_report["artifacts"]["spatialMaterialJoinedRenderGlb"]["path"]
    standard = glb_metrics(standard_path)
    optimized = glb_metrics(optimized_path)
    recorded_standard = build_report["payloadMetrics"]["v32AuthoringGlb"]
    recorded_optimized = build_report["payloadMetrics"]["v32SpatialMaterialJoinedGlb"]
    record("glb_metrics_match_report", standard == recorded_standard and optimized == recorded_optimized, {"standard": standard, "optimized": optimized})
    record("joined_export_primitive_target", standard["primitiveCount"] == 654 and optimized["primitiveCount"] <= 50 and optimized["primitiveCount"] < standard["primitiveCount"], {"standard": standard, "optimized": optimized})
    record("joined_export_geometry_preserved", optimized["triangleCount"] == standard["triangleCount"] == 188576 and optimized["materialCount"] == standard["materialCount"] == 9, {"standard": standard, "optimized": optimized})
    compression_extensions = {"KHR_draco_mesh_compression", "EXT_meshopt_compression"}
    record("compression_withheld_without_loader_proof", not (compression_extensions & set(optimized["extensionsUsed"])) and build_report["payloadMetrics"]["compression"]["applied"] is False, build_report["payloadMetrics"]["compression"])
    record("offline_payload_not_runtime_claim", build_report["payloadMetrics"].get("runtimePerformanceMeasured") is False and any("runtime performance" in blocker for blocker in build_report.get("knownBlockers", [])), build_report.get("knownBlockers"))

    luminance = build_report["imageLuminanceDiagnostics"]
    old = luminance["frozenFinalNorthForce"]
    new = luminance["v32NorthForceColor"]
    neutral = luminance["v32NorthForceNeutral"]
    record("north_force_readability_lift", new["mean"] >= old["mean"] * 1.45 and new["shadowFractionBelow0035"] <= old["shadowFractionBelow0035"] * 0.78 and neutral["shadowFractionBelow0035"] <= new["shadowFractionBelow0035"], luminance)

    source_path = repo_root / build_report["artifacts"]["sourceBlend"]["path"]
    bpy.ops.wm.open_mainfile(filepath=str(source_path), load_ui=False)
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
        "readabilityRevision": scene.get("kyx_readability_revision"),
        "visualDecision": scene.get("kyx_visual_decision"),
        "parent": scene.get("kyx_parent_art_candidate"),
    }
    expected_contract = {
        "scope": "G5_BOUNDED_PRESS_HALL_V3_2_READABILITY_PREVIEW_ONLY",
        "mapId": "inkfall_foundry",
        "grayboxRevision": 2,
        "grayboxLockRevision": 1,
        "catalogDefaultRevision": 1,
        "authorityCollisionIncluded": False,
        "productSelectable": False,
        "shippingDefault": False,
        "g5Claimed": False,
        "readabilityRevision": "3.2",
        "visualDecision": "PENDING_PARENT_FINAL_REVIEW",
        "parent": "inkfall_foundry_press_hall_final_art_v3_conditional",
    }
    record("blend_scene_boundary", scene_contract == expected_contract, scene_contract)
    collections = {collection.name for collection in bpy.data.collections}
    record("readability_review_rig", {"G5_V3_2_READABILITY_CAMERAS", "G5_V3_2_READABILITY_LIGHTING"} <= collections and "G5_V3_FINAL_REVIEW_CAMERAS" not in collections and "G5_V3_FINAL_REVIEW_LIGHTING" not in collections, sorted(collections))
    collision_objects = [obj.name for obj in bpy.data.objects if obj.get("kyx_collision") not in {False, None}]
    record("no_authority_collision_objects", not collision_objects, collision_objects)
    gameplay_camera_evidence = {name: list(bpy.data.objects[name].location) for name in ("CAM_V32_GAMEPLAY_NORTH", "CAM_V32_GAMEPLAY_SOUTH")}
    record("gameplay_eye_height_views", all(abs(location[2] - 1.72) < 1e-6 for location in gameplay_camera_evidence.values()), gameplay_camera_evidence)

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
            "target": target, "status": "PASS" if passed else "FAIL", "memberCount": len(members),
            "authoredLowerMeters": [round(value, 6) for value in lower], "authoredUpperMeters": [round(value, 6) for value in upper],
            "lockedCenterMeters": list(envelope["center"]), "lockedSizeMeters": list(envelope["size"]),
        })
    record("replacement_envelopes", all(item["status"] == "PASS" for item in envelope_results), envelope_results)

    pass_count = sum(check["status"] == "PASS" for check in checks)
    status = "INDEPENDENT_PRESS_HALL_V3_2_READABILITY_VERIFICATION_PASS" if pass_count == len(checks) else "INDEPENDENT_PRESS_HALL_V3_2_READABILITY_VERIFICATION_FAIL"
    payload = {
        "schemaVersion": 1,
        "kind": "inkfall_foundry_press_hall_v3_2_readability_independent_verification",
        "status": status,
        "visualDecision": "PENDING_PARENT_FINAL_REVIEW",
        "verifier": "tools/evidence/verify-inkfall-g5-press-hall-readability-v3-2.py",
        "blenderVersion": bpy.app.version_string,
        "summary": {"passCount": pass_count, "checkCount": len(checks), "failCount": len(checks) - pass_count},
        "checks": checks,
        "nonClaims": sorted(REQUIRED_NONCLAIMS | {"COLOR_VISION_REVIEW_NOT_COMPLETE"}),
    }
    report_output.parent.mkdir(parents=True, exist_ok=True)
    report_output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
    print("PRESS_HALL_V32_VERIFY=" + json.dumps({"status": status, "report": str(report_output)}, sort_keys=True))
    if status.endswith("_FAIL"):
        raise RuntimeError(f"Independent Press Hall v3.2 verification failed: {len(checks) - pass_count} checks")


if __name__ == "__main__":
    main()
