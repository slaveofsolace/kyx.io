"""Render V6 CONTACT-FIRST rev3 after numeric armature-space assertions."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_render_rev2_base", HERE / "render_v6_contact_first_rig_rev2.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev2 render helpers")
rev2 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev2)

PREFIX = "V6CF3_"
rev2.PREFIX = PREFIX
rev2.base.PREFIX = PREFIX
rev2.base.EVIDENCE = rev2.base.OUTPUT_ROOT / "evidence" / "v6-contact-first-rig-rev3"
rev2.base.RENDERS = rev2.base.EVIDENCE / "renders"
rev2.base.REPORT = rev2.base.EVIDENCE / "render-report.json"


def rename_rev3(record: dict[str, object]) -> dict[str, object]:
    old_path = Path(record["path"])
    new_path = old_path.with_name(old_path.name.replace("rig-rev1", "rig-rev3"))
    if old_path != new_path:
        old_path.replace(new_path)
    record["path"] = str(new_path)
    record["bytes"] = new_path.stat().st_size
    record["sha256"] = rev2.base.sha256(new_path)
    return record


def render_view(*args, **kwargs):
    return rename_rev3(rev2.ORIGINAL_RENDER_VIEW(*args, **kwargs))


def render_board(*args, **kwargs):
    return rename_rev3(rev2.ORIGINAL_RENDER_BOARD(*args, **kwargs))


rev2.base.render_view = render_view
rev2.base.render_board = render_board


def main() -> None:
    rev2.base.main()
    report = json.loads(rev2.base.REPORT.read_text(encoding="utf-8"))
    report["schema"] = "kyx-v6-contact-first-rig-render-report-v3"
    report["status"] = "EARLY_REV3_VISUAL_PROOF_REVIEW_REQUIRED"
    report["rev3Invariant"] = "45 posed target bones asserted within 0.000001 m; visual acceptance still required"
    rev2.base.REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
