"""Verify Phase 7 character-refinement v2 output structure and hashes."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import struct
import sys


LANE_DIR = Path(__file__).resolve().parent
OUTPUT_DIR = LANE_DIR / "output"
REPORT_PATH = OUTPUT_DIR / "character-refinement-v2-report.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fail(message: str) -> None:
    raise AssertionError(message)


def main() -> None:
    if not REPORT_PATH.is_file():
        fail(f"Missing report: {REPORT_PATH}")
    report = json.loads(REPORT_PATH.read_text(encoding="utf-8"))
    if report.get("status") != "VISUAL_REFINEMENT_CANDIDATE_NOT_G6":
        fail("Report status must preserve the non-G6 boundary")

    glb = LANE_DIR / report["glb"]["path"]
    if not glb.is_file():
        fail(f"Missing GLB: {glb}")
    data = glb.read_bytes()
    if len(data) < 20 or data[:4] != b"glTF":
        fail("Invalid GLB magic")
    version, declared_length = struct.unpack_from("<II", data, 4)
    if version != 2 or declared_length != len(data):
        fail("GLB version or declared length mismatch")
    if sha256(glb) != report["glb"]["sha256"]:
        fail("GLB SHA-256 does not match report")

    required_views = {
        "refinement-v2-close-color.png",
        "refinement-v2-tactical-mid-color.png",
        "refinement-v2-far-color.png",
        "refinement-v2-front-ortho-color.png",
        "refinement-v2-side-ortho-color.png",
        "refinement-v2-back-ortho-color.png",
        "refinement-v2-weapon-contact-color.png",
        "refinement-v2-close-grayscale.png",
        "refinement-v2-front-ortho-grayscale.png",
    }
    render_paths = [LANE_DIR / path for path in report["renders"]["paths"]]
    actual_views = {path.name for path in render_paths}
    if actual_views != required_views:
        fail(f"Render matrix mismatch: {sorted(actual_views ^ required_views)}")
    for path in render_paths:
        if not path.is_file() or path.stat().st_size < 10_000:
            fail(f"Missing or implausibly small render: {path}")
        if path.read_bytes()[:8] != b"\x89PNG\r\n\x1a\n":
            fail(f"Invalid PNG signature: {path}")

    manifest = {entry["path"]: entry for entry in report["manifest"]}
    for path in [glb, *render_paths]:
        relative = path.relative_to(LANE_DIR).as_posix()
        entry = manifest.get(relative)
        if entry is None:
            fail(f"Manifest missing {relative}")
        if entry["bytes"] != path.stat().st_size or entry["sha256"] != sha256(path):
            fail(f"Manifest identity mismatch for {relative}")

    if report["source"]["meshObjects"] < 70:
        fail("Refinement unexpectedly lost modeled detail")
    if report["source"]["triangles"] < 20_000:
        fail("Refinement unexpectedly fell below the intended geometry floor")
    if report["glb"]["animations"] < 1:
        fail("GLB has no animation")
    print(json.dumps({
        "status": "PASS",
        "glbSha256": report["glb"]["sha256"],
        "glbBytes": report["glb"]["bytes"],
        "meshObjects": report["source"]["meshObjects"],
        "triangles": report["source"]["triangles"],
        "renders": len(render_paths),
        "g6Claimed": False,
    }, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        raise
