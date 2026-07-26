"""Run the cached official Khronos validator against the exact Rev16 GLB."""

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


def script_args() -> tuple[Path, Path]:
    if "--" not in sys.argv:
        raise SystemExit("Expected -- <rev16.glb> <validator-report.json>")
    values = sys.argv[sys.argv.index("--") + 1 :]
    if len(values) != 2:
        raise SystemExit(f"Expected two arguments, got {len(values)}")
    return Path(values[0]).resolve(), Path(values[1]).resolve()


def main() -> None:
    glb_path, report_path = script_args()
    if not glb_path.is_file():
        raise FileNotFoundError(glb_path)
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
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    if not node.is_file() or not candidates:
        raise RuntimeError("Cached Node/Khronos glTF validator toolchain not found")
    validator_module = candidates[0]
    javascript = """
const fs = require('fs');
const validator = require(process.argv[1]);
const path = process.argv[2];
validator.validateBytes(
  new Uint8Array(fs.readFileSync(path)),
  { uri: path, maxIssues: 1000 }
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
    validator = json.loads(completed.stdout)
    source_hash_before = sha256(glb_path)
    source_bytes_before = glb_path.stat().st_size
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
        "schema": "kyx-v6c-character-rev16-khronos-validator-report-v1",
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
        ],
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps(report, indent=2) + "\n", encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "status": report["status"],
                "sourceSha256": source_hash_before,
                "errors": issues["numErrors"],
                "warnings": issues["numWarnings"],
                "infos": issues["numInfos"],
                "report": str(report_path),
            },
            sort_keys=True,
        )
    )
    if not all(assertions.values()):
        raise RuntimeError(f"Rev16 validator assertions failed: {assertions}")


if __name__ == "__main__":
    main()
