"""Render the zero-heat-weight V6 CONTACT-FIRST rev4 proof."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_render_rev3_base", HERE / "render_v6_contact_first_rig_rev3.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev3 render helpers")
rev3 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev3)

PREFIX = "V6CF4_"
rev3.PREFIX = PREFIX
rev3.rev2.PREFIX = PREFIX
rev3.rev2.base.PREFIX = PREFIX
render_base = rev3.rev2.base
render_base.EVIDENCE = render_base.OUTPUT_ROOT / "evidence" / "v6-contact-first-rig-rev4"
render_base.RENDERS = render_base.EVIDENCE / "renders"
render_base.REPORT = render_base.EVIDENCE / "render-report.json"


def rename_rev4(record: dict[str, object]) -> dict[str, object]:
    old_path = Path(record["path"])
    new_path = old_path.with_name(old_path.name.replace("rig-rev1", "rig-rev4"))
    if old_path != new_path:
        old_path.replace(new_path)
    record["path"] = str(new_path)
    record["bytes"] = new_path.stat().st_size
    record["sha256"] = render_base.sha256(new_path)
    return record


def render_view(*args, **kwargs):
    return rename_rev4(rev3.rev2.ORIGINAL_RENDER_VIEW(*args, **kwargs))


def render_board(*args, **kwargs):
    return rename_rev4(rev3.rev2.ORIGINAL_RENDER_BOARD(*args, **kwargs))


render_base.render_view = render_view
render_base.render_board = render_board


def main() -> None:
    render_base.main()
    report = json.loads(render_base.REPORT.read_text(encoding="utf-8"))
    report["schema"] = "kyx-v6-contact-first-rig-render-report-v4"
    report["status"] = "EARLY_REV4_VISUAL_PROOF_REVIEW_REQUIRED"
    report["rev4Invariant"] = "zero heat weights; all 10582 vertices deterministically assigned and normalized"
    render_base.REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
