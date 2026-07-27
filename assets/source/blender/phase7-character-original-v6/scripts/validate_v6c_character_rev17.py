"""Run the cached official Khronos validator against every exact Rev17 GLB."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def script_args() -> tuple[Path, list[Path]]:
    if "--" not in sys.argv:
        raise SystemExit(
            "Expected -- <report-directory> <rev17-lod0.glb> "
            "<rev17-lod1.glb> <rev17-lod2.glb> <rev17-first-person.glb>"
        )
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 5:
        raise SystemExit(f"Expected five arguments, got {len(values)}")
    return Path(values[0]).resolve(), [Path(value).resolve() for value in values[1:]]


def cached_toolchain() -> tuple[Path, Path]:
    home = Path.home()
    node = (
        home
        / ".cache"
        / "codex-runtimes"
        / "codex-primary-runtime"
        / "dependencies"
        / "node"
        / "bin"
        / "node.exe"
    )
    candidates = sorted(
        (
            home
            / "AppData"
            / "Local"
            / "pnpm-cache"
            / "dlx"
        ).glob("*/**/node_modules/gltf-validator"),
        key=lambda candidate: candidate.stat().st_mtime,
        reverse=True,
    )
    if not node.is_file() or not candidates:
        raise RuntimeError("Cached Node/Khronos glTF validator toolchain not found")
    return node, candidates[0]


def validate(node: Path, validator_module: Path, glb_path: Path) -> dict:
    javascript = """
const fs = require('fs');
const validator = require(process.argv[1]);
const sourcePath = process.argv[2];
validator.validateBytes(
  new Uint8Array(fs.readFileSync(sourcePath)),
  { uri: sourcePath, maxIssues: 1000 }
).then((report) => {
  process.stdout.write(JSON.stringify(report));
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
"""
    completed = subprocess.run(
        [str(node), "-e", javascript, str(validator_module), str(glb_path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def main() -> None:
    report_directory, glb_paths = script_args()
    for glb_path in glb_paths:
        if not glb_path.is_file():
            raise FileNotFoundError(glb_path)

    node, validator_module = cached_toolchain()
    report_directory.mkdir(parents=True, exist_ok=True)
    reports: list[dict] = []

    for glb_path in glb_paths:
        source_hash_before = sha256(glb_path)
        source_bytes_before = glb_path.stat().st_size
        validator = validate(node, validator_module, glb_path)
        source_hash_after = sha256(glb_path)
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
            "schema": "kyx-v6c-character-rev17-khronos-validator-report-v1",
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
                "All warnings and infos remain disclosed in the embedded validator report.",
                "This candidate is not the default runtime character.",
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
        "schema": "kyx-v6c-character-rev17-khronos-validator-index-v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "status": (
            "PASS_ALL_REV17_GLBS_KHRONOS_NOT_G6"
            if all_passed
            else "FAIL_ONE_OR_MORE_REV17_GLBS"
        ),
        "reports": reports,
        "nonClaims": [
            "Structural validation is not human visual approval.",
            "Rev17 remains opt-in and non-default.",
            "G6 acceptance is not claimed.",
        ],
    }
    index_path = report_directory / "khronos-validator-index.json"
    index_path.write_text(json.dumps(index, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(index, sort_keys=True))
    if not all_passed:
        raise RuntimeError("One or more Rev17 Khronos validator assertions failed")


if __name__ == "__main__":
    main()
