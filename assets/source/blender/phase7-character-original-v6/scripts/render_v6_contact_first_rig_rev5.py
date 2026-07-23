"""Render the pre-Multires, rest-axial V6 CONTACT-FIRST rev5 proof."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_render_rev4_base", HERE / "render_v6_contact_first_rig_rev4.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev4 render helpers")
rev4 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev4)

PREFIX = "V6CF5_"
rev4.PREFIX = PREFIX
rev4.rev3.PREFIX = PREFIX
rev4.rev3.rev2.PREFIX = PREFIX
render_base = rev4.render_base
render_base.PREFIX = PREFIX
render_base.EVIDENCE = render_base.OUTPUT_ROOT / "evidence" / "v6-contact-first-rig-rev5"
render_base.RENDERS = render_base.EVIDENCE / "renders"
render_base.REPORT = render_base.EVIDENCE / "render-report.json"


def rename_rev5(record: dict[str, object]) -> dict[str, object]:
    old_path = Path(record["path"])
    new_path = old_path.with_name(old_path.name.replace("rig-rev1", "rig-rev5"))
    if old_path != new_path:
        old_path.replace(new_path)
    record["path"] = str(new_path)
    record["bytes"] = new_path.stat().st_size
    record["sha256"] = render_base.sha256(new_path)
    return record


def render_view(*args, **kwargs):
    return rename_rev5(rev4.rev3.rev2.ORIGINAL_RENDER_VIEW(*args, **kwargs))


def render_board(*args, **kwargs):
    return rename_rev5(rev4.rev3.rev2.ORIGINAL_RENDER_BOARD(*args, **kwargs))


render_base.render_view = render_view
render_base.render_board = render_board


def main() -> None:
    render_base.main()
    report = json.loads(render_base.REPORT.read_text(encoding="utf-8"))
    report["schema"] = "kyx-v6-contact-first-rig-render-report-v5"
    report["status"] = "EARLY_REV5_VISUAL_PROOF_REVIEW_REQUIRED"
    report["rev5Invariant"] = "Armature index 0 before Multires; axial/clavicle rest; all ten distal chains weighted"
    render_base.REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
