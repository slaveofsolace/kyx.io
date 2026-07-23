"""Render the preserved, non-scaling V6 CONTACT-FIRST rev2 proof."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import sys


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_render_rev1_base", HERE / "render_v6_contact_first_rig_rev1.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev1 render helpers")
base = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base)

PREFIX = "V6CF2_"
base.PREFIX = PREFIX
base.EVIDENCE = base.OUTPUT_ROOT / "evidence" / "v6-contact-first-rig-rev2"
base.RENDERS = base.EVIDENCE / "renders"
base.REPORT = base.EVIDENCE / "render-report.json"
ORIGINAL_RENDER_VIEW = base.render_view
ORIGINAL_RENDER_BOARD = base.render_board


def rename_record(record: dict[str, object]) -> dict[str, object]:
    old_path = Path(record["path"])
    new_path = old_path.with_name(old_path.name.replace("rig-rev1", "rig-rev2"))
    if old_path != new_path:
        old_path.replace(new_path)
    record["path"] = str(new_path)
    record["name"] = str(record["name"])
    record["bytes"] = new_path.stat().st_size
    record["sha256"] = base.sha256(new_path)
    return record


def render_view(*args, **kwargs):
    return rename_record(ORIGINAL_RENDER_VIEW(*args, **kwargs))


def render_board(*args, **kwargs):
    return rename_record(ORIGINAL_RENDER_BOARD(*args, **kwargs))


base.render_view = render_view
base.render_board = render_board


def main() -> None:
    base.main()
    report = json.loads(base.REPORT.read_text(encoding="utf-8"))
    report["schema"] = "kyx-v6-contact-first-rig-render-report-v2"
    report["status"] = "EARLY_REV2_VISUAL_PROOF_REVIEW_REQUIRED"
    report["rev2Invariant"] = "all pose bones unit scale; native-length arm and digit solves"
    base.REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
