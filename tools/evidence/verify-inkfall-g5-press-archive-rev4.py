"""Independently verify the bounded Inkfall Rev4 Press Archive art package."""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
from pathlib import Path
from typing import Any


PACKAGE_ROOT = Path(
    "assets/source/maps/inkfall-foundry/art-kit/press-archive-rev4/rev4"
)
MANIFEST_PATH = PACKAGE_ROOT / "manifest.inkfall-rev4-press-archive.json"
REPORT_PATH = (
    PACKAGE_ROOT / "validation/inkfall-rev4-press-archive-build-report.json"
)
DEFAULT_OUTPUT = (
    PACKAGE_ROOT
    / "validation/inkfall-rev4-press-archive-independent-verification.json"
)
EXPECTED_NON_CLAIMS = {
    "G5_NOT_PASSED",
    "REVISION_3_NOT_PROMOTED",
    "REVISION_4_ART_NOT_DEFAULT",
    "RENDER_GEOMETRY_NOT_COLLISION_AUTHORITY",
    "HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED",
    "HUMAN_2_4_8_PLAYER_REVIEW_NOT_PASSED",
    "TARGET_HARDWARE_PERFORMANCE_NOT_ACCEPTED",
    "FOCAL_LANDMARK_HAS_NO_OBJECTIVE_OR_GAMEPLAY_SEMANTICS",
    "NO_DEPLOYMENT_OR_PUBLISHING_AUTHORIZATION_USED",
}
EXPECTED_MATERIALS = {
    "V3_AQUA_INDICATOR",
    "V3_CAST_IRON",
    "V3_CHIPPED_SAFETY_RED",
    "V3_GARDEN_FRAGMENT",
    "V3_GREASED_LINKAGE",
    "V3_INK_BLACK",
    "V3_USED_CERAMIC",
    "V3_WORN_AMBER",
    "V3_WORN_STEEL",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--output")
    return parser.parse_args()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def png_dimensions(path: Path) -> list[int]:
    with path.open("rb") as handle:
        if handle.read(8) != b"\x89PNG\r\n\x1a\n":
            raise RuntimeError(f"Invalid PNG signature: {path}")
        chunk_length = struct.unpack(">I", handle.read(4))[0]
        if handle.read(4) != b"IHDR" or chunk_length < 8:
            raise RuntimeError(f"Missing PNG IHDR: {path}")
        return list(struct.unpack(">II", handle.read(8)))


def parse_glb(path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    data = path.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        raise RuntimeError("Invalid GLB header")
    version, declared_length = struct.unpack_from("<II", data, 4)
    if version != 2:
        raise RuntimeError(f"Unexpected GLB version: {version}")
    if declared_length != len(data):
        raise RuntimeError(
            f"GLB declared length {declared_length} != bytes {len(data)}"
        )

    offset = 12
    chunks: list[dict[str, int]] = []
    document: dict[str, Any] | None = None
    while offset < len(data):
        if offset + 8 > len(data):
            raise RuntimeError("Truncated GLB chunk header")
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        end = offset + chunk_length
        if chunk_length % 4 != 0 or end > len(data):
            raise RuntimeError("Invalid GLB chunk extent")
        payload = data[offset:end]
        chunks.append({"type": chunk_type, "bytes": chunk_length})
        if chunk_type == 0x4E4F534A:
            if document is not None:
                raise RuntimeError("Multiple GLB JSON chunks")
            document = json.loads(payload.rstrip(b" \t\r\n\x00").decode("utf-8"))
        offset = end
    if offset != len(data) or document is None:
        raise RuntimeError("GLB chunk walk did not consume one JSON document")
    return document, {
        "version": version,
        "declaredBytes": declared_length,
        "chunkCount": len(chunks),
        "chunks": chunks,
    }


def main() -> None:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    output_path = (
        Path(args.output).resolve()
        if args.output
        else repo_root / DEFAULT_OUTPUT
    )
    manifest = read_json(repo_root / MANIFEST_PATH)
    report = read_json(repo_root / REPORT_PATH)
    checks: list[dict[str, Any]] = []

    def check(name: str, passed: bool, evidence: Any) -> None:
        checks.append({"name": name, "passed": bool(passed), "evidence": evidence})

    check(
        "manifestStatusIsBoundedHumanReviewCandidate",
        manifest.get("status")
        == "bounded_authored_art_candidate_ready_for_human_review_g5_open",
        manifest.get("status"),
    )
    check(
        "buildReportPassesButKeepsG5Open",
        report.get("status") == "INKFALL_REV4_PRESS_ARCHIVE_ART_BUILD_PASS_G5_OPEN",
        report.get("status"),
    )
    check(
        "bindingRemainsNonDefaultRenderOnly",
        report.get("binding")
        == {
            "mapId": "inkfall_foundry",
            "authorityRevision": 3,
            "authorityPackageDigest": (
                "260b90de2e0c2d51fa01e166d11401a04a1cb76943042de9993e85560e37f39a"
            ),
            "authorityFixtureHash": "6cf785c5171f2ff5",
            "catalogDefaultRevision": 1,
            "artRevision": "4.1",
            "explicitInspectionOnly": True,
            "runtimeIntegrated": False,
            "shippingDefault": False,
            "renderGeometryMayBeAuthority": False,
        },
        report.get("binding"),
    )
    check(
        "requiredNonClaimsRemainExplicit",
        EXPECTED_NON_CLAIMS.issubset(set(report.get("nonClaims", [])))
        and set(report.get("nonClaims", [])) == set(manifest.get("nonClaims", [])),
        report.get("nonClaims"),
    )

    artifact_records = [
        report["generator"]["builder"],
        report["artifacts"]["sourceBlend"],
        report["artifacts"]["renderGlb"],
        *report["artifacts"]["reviewRenders"],
    ]
    artifact_results = []
    artifacts_pass = True
    for record in artifact_records:
        path = repo_root / record["path"]
        actual = {
            "path": record["path"],
            "exists": path.is_file(),
            "bytes": path.stat().st_size if path.is_file() else None,
            "sha256": sha256_file(path) if path.is_file() else None,
        }
        if "resolution" in record and path.is_file():
            actual["resolution"] = png_dimensions(path)
        passed = (
            actual["exists"]
            and actual["bytes"] == record["bytes"]
            and actual["sha256"] == record["sha256"]
            and (
                "resolution" not in record
                or actual.get("resolution") == record["resolution"]
            )
        )
        actual["passed"] = passed
        artifact_results.append(actual)
        artifacts_pass = artifacts_pass and passed
    check("allManifestedArtifactsMatchBytesAndHashes", artifacts_pass, artifact_results)

    check(
        "manifestArtifactsMatchBuildReport",
        manifest["source"]["builder"] == report["generator"]["builder"]
        and manifest["source"]["blend"] == report["artifacts"]["sourceBlend"]
        and manifest["stagedRenderExport"]
        == (report["artifacts"]["renderGlb"] | {"runtimeIntegrated": False})
        and manifest["reviewRenders"] == report["artifacts"]["reviewRenders"],
        {
            "builder": manifest["source"]["builder"]["sha256"],
            "blend": manifest["source"]["blend"]["sha256"],
            "glb": manifest["stagedRenderExport"]["sha256"],
            "renderCount": len(manifest["reviewRenders"]),
        },
    )

    frozen_results = []
    frozen_pass = report["frozenInputsBefore"] == report["frozenInputsAfter"]
    for name, record in report["frozenInputsAfter"].items():
        path = repo_root / record["path"]
        current = sha256_file(path)
        passed = current == record["expectedSha256"] == record["actualSha256"]
        frozen_results.append(
            {
                "name": name,
                "path": record["path"],
                "expectedSha256": record["expectedSha256"],
                "currentSha256": current,
                "passed": passed,
            }
        )
        frozen_pass = frozen_pass and passed
    check("frozenInputsRemainByteExact", frozen_pass, frozen_results)

    constants_text = (repo_root / "src/content/maps/constants.ts").read_text(
        encoding="utf-8"
    )
    check(
        "catalogDefaultStillRevisionOne",
        "DEFAULT_MAP_REVISION = 1 as const" in constants_text,
        "src/content/maps/constants.ts",
    )

    glb_path = repo_root / report["artifacts"]["renderGlb"]["path"]
    glb_document, glb_structure = parse_glb(glb_path)
    material_names = {
        material.get("name", "")
        for material in glb_document.get("materials", [])
    }
    node_names = [
        node.get("name", "")
        for node in glb_document.get("nodes", [])
    ]
    authority_flags = []
    for collection_name in ("nodes", "meshes"):
        for index, item in enumerate(glb_document.get(collection_name, [])):
            extras = item.get("extras", {})
            if extras.get("kyx_collision") is True or extras.get("kyx_authority") is True:
                authority_flags.append(
                    {
                        "collection": collection_name,
                        "index": index,
                        "name": item.get("name"),
                        "extras": extras,
                    }
                )
    check(
        "glbIsStructurallyReadableVersionTwo",
        glb_document.get("asset", {}).get("version") == "2.0"
        and glb_structure["chunkCount"] >= 2,
        {
            "asset": glb_document.get("asset"),
            "structure": glb_structure,
        },
    )
    check(
        "glbUsesOnlyApprovedMaterialSet",
        material_names == EXPECTED_MATERIALS,
        sorted(material_names),
    )
    check(
        "glbMeshCountMatchesBuildReport",
        len(glb_document.get("meshes", [])) == report["sceneFacts"]["meshCount"],
        {
            "glbMeshes": len(glb_document.get("meshes", [])),
            "reportMeshes": report["sceneFacts"]["meshCount"],
        },
    )
    check(
        "glbContainsNoCameraLightOrAuthorityPayload",
        not glb_document.get("cameras")
        and "KHR_lights_punctual" not in glb_document.get("extensionsUsed", [])
        and not authority_flags
        and not any(
            "collision" in name.casefold() or "authority" in name.casefold()
            for name in node_names
        ),
        {
            "cameraCount": len(glb_document.get("cameras", [])),
            "extensionsUsed": glb_document.get("extensionsUsed", []),
            "authorityFlags": authority_flags,
            "authorityNamedNodes": [
                name
                for name in node_names
                if "collision" in name.casefold() or "authority" in name.casefold()
            ],
        },
    )

    review_contract = report["reviewEvidenceContract"]
    overhead = review_contract["overheadContext"]
    overhead_camera = overhead["camera"]
    min_x, min_y, max_x, max_y = overhead_camera["framedMeshBoundsXY"]
    center_x, center_y = overhead_camera["locationBlenderMeters"][:2]
    half_width = overhead_camera["orthoScaleMeters"] * 0.5
    half_height = half_width / overhead_camera["frameAspect"]
    check(
        "overheadIsZeroRollOrthographicAndContainsBoundedScene",
        overhead_camera["projection"] == "ORTHO"
        and overhead["resolution"] == [1600, 1200]
        and all(
            abs(value) <= 1e-5
            for value in overhead_camera["rotationEulerRadians"]
        )
        and min_x >= center_x - half_width
        and max_x <= center_x + half_width
        and min_y >= center_y - half_height
        and max_y <= center_y + half_height
        and "not map-wide" in overhead["intent"],
        overhead,
    )
    gameplay = review_contract["gameplayContinuity"]
    gameplay_camera = gameplay["camera"]
    check(
        "gameplayContinuityIsLevelWideGameplayFov",
        gameplay_camera["projection"] == "PERSP"
        and gameplay["resolution"] == [1600, 900]
        and 24.0 <= gameplay_camera["lensMillimeters"] <= 32.0
        and abs(gameplay_camera["locationBlenderMeters"][2] - 1.72) <= 0.01
        and gameplay_camera["distanceToTargetMeters"] >= 35.0,
        gameplay,
    )
    landmark = review_contract["landmarkContext"]
    landmark_camera = landmark["camera"]
    check(
        "landmarkEvidenceIsPulledBack",
        landmark_camera["projection"] == "PERSP"
        and landmark["resolution"] == [1600, 900]
        and landmark_camera["distanceToTargetMeters"] >= 13.5
        and landmark_camera["lensMillimeters"] <= 45.0,
        landmark,
    )
    check(
        "allBuilderChecksPass",
        bool(report.get("checks"))
        and all(report["checks"].values()),
        report.get("checks"),
    )
    influence = report["influenceBoundary"]
    check(
        "buddyRepositoryBoundaryRecordsNoCopying",
        all(
            influence[key] is False
            for key in (
                "copiedCode",
                "copiedGeometry",
                "copiedCoordinates",
                "copiedWording",
                "copiedAssets",
                "licenseTextReliedUpon",
            )
        ),
        influence,
    )

    passed = sum(1 for item in checks if item["passed"])
    verification = {
        "schemaVersion": 1,
        "kind": "inkfall_rev4_press_archive_independent_verification",
        "status": (
            "INKFALL_REV4_PRESS_ARCHIVE_INDEPENDENT_PASS_G5_OPEN"
            if passed == len(checks)
            else "INKFALL_REV4_PRESS_ARCHIVE_INDEPENDENT_FAIL_G5_OPEN"
        ),
        "summary": {
            "checkCount": len(checks),
            "passCount": passed,
            "failureCount": len(checks) - passed,
        },
        "scope": report["scope"],
        "manifest": MANIFEST_PATH.as_posix(),
        "buildReport": REPORT_PATH.as_posix(),
        "verifier": {
            "path": Path(__file__).resolve().relative_to(repo_root).as_posix(),
            "sha256": sha256_file(Path(__file__).resolve()),
        },
        "checks": checks,
        "nonClaims": report["nonClaims"],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(verification, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        "G5_INKFALL_REV4_VERIFY="
        + json.dumps(
            {
                "status": verification["status"],
                "checks": verification["summary"],
                "output": str(output_path),
            },
            sort_keys=True,
        )
    )
    if passed != len(checks):
        failed = [item["name"] for item in checks if not item["passed"]]
        raise RuntimeError(f"Inkfall Rev4 independent verification failed: {failed}")


if __name__ == "__main__":
    main()
