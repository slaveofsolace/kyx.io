"""Run the cached official Khronos validator against every exact Rev18 GLB."""

from __future__ import annotations

from datetime import datetime, timezone
import importlib.util
import json
from pathlib import Path
import sys
from typing import Any


def load_rev17_toolchain() -> Any:
    source = Path(__file__).resolve().with_name("validate_v6c_character_rev17.py")
    spec = importlib.util.spec_from_file_location("kyx_rev18_khronos_helpers", source)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load Khronos helpers from {source}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


HELPERS = load_rev17_toolchain()


def script_args() -> tuple[Path, list[Path]]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <report-directory> <lod0.glb> <lod1.glb> <lod2.glb> "
            "<first-person.glb> <melee-proof.glb>"
        )
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 6:
        raise SystemExit(f"Expected six arguments, got {len(values)}")
    return Path(values[0]).resolve(), [
        Path(value).resolve() for value in values[1:]
    ]


def main() -> None:
    report_directory, glb_paths = script_args()
    for glb_path in glb_paths:
        if not glb_path.is_file():
            raise FileNotFoundError(glb_path)
    node, validator_module = HELPERS.cached_toolchain()
    report_directory.mkdir(parents=True, exist_ok=True)
    reports = []
    for glb_path in glb_paths:
        source_hash_before = HELPERS.sha256(glb_path)
        source_bytes_before = glb_path.stat().st_size
        validator = HELPERS.validate(node, validator_module, glb_path)
        source_hash_after = HELPERS.sha256(glb_path)
        source_bytes_after = glb_path.stat().st_size
        issues = validator["issues"]
        assertions = {
            "exactGlbUnchangedDuringValidation": (
                source_hash_before == source_hash_after
                and source_bytes_before == source_bytes_after
            ),
            "validatorCompletedWithoutErrors": issues["numErrors"] == 0,
            "issueListNotTruncated": not issues["truncated"],
        }
        report = {
            "schema": "kyx-v6c-character-rev18-khronos-validator-report-v1",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "status": (
                "PASS_KHRONOS_WITH_DISCLOSED_WARNINGS_NOT_G6"
                if all(assertions.values())
                else "FAIL_KHRONOS_VALIDATION"
            ),
            "sourceGlb": {
                "path": str(glb_path),
                "bytesBefore": source_bytes_before,
                "bytesAfter": source_bytes_after,
                "sha256Before": source_hash_before,
                "sha256After": source_hash_after,
            },
            "toolchain": {
                "node": str(node),
                "validatorModule": str(validator_module),
                "validatorVersion": validator["validatorVersion"],
            },
            "validator": validator,
            "assertions": assertions,
            "nonClaims": [
                "Zero validator errors does not grant visual acceptance or G6.",
                "Warnings and infos remain disclosed in the embedded report.",
                "Rev18 is candidate-only and is not a default runtime promotion.",
            ],
        }
        report_path = report_directory / f"{glb_path.stem}-khronos-report.json"
        report_path.write_text(
            json.dumps(report, indent=2) + "\n",
            encoding="utf-8",
        )
        reports.append(
            {
                "source": glb_path.name,
                "report": report_path.name,
                "status": report["status"],
                "sha256": source_hash_before,
                "bytes": source_bytes_before,
                "errors": issues["numErrors"],
                "warnings": issues["numWarnings"],
                "infos": issues["numInfos"],
                "assertions": assertions,
            }
        )
    all_passed = all(
        item["status"] == "PASS_KHRONOS_WITH_DISCLOSED_WARNINGS_NOT_G6"
        for item in reports
    )
    index = {
        "schema": "kyx-v6c-character-rev18-khronos-validator-index-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": (
            "PASS_ALL_REV18_GLBS_KHRONOS_NOT_G6"
            if all_passed
            else "FAIL_ONE_OR_MORE_REV18_GLBS"
        ),
        "reports": reports,
        "nonClaims": [
            "Structural validation is not human visual approval.",
            "Rev18 remains isolated, candidate-only, and non-default.",
            "G6 acceptance is not claimed.",
        ],
    }
    index_path = report_directory / "khronos-validator-index.json"
    index_path.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(index, sort_keys=True))
    if not all_passed:
        raise RuntimeError("One or more Rev18 Khronos assertions failed")


if __name__ == "__main__":
    main()
