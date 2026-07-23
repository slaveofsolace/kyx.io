"""Render rev10 reachable, curled contact pose."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

from mathutils import Vector


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v6cf_render_rev9_base", HERE / "render_v6_contact_first_rig_rev9.py")
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load rev9 render helpers")
rev9 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(rev9)

PREFIX = "V6CF10_"
rev9.PREFIX = PREFIX
rev9.rev8.PREFIX = PREFIX
rev9.rev8.rev7.PREFIX = PREFIX
rev9.rev8.rev7.rev5.PREFIX = PREFIX
rev9.rev8.rev7.rev5.rev4.PREFIX = PREFIX
rev9.rev8.rev7.rev5.rev4.rev3.PREFIX = PREFIX
rev9.rev8.rev7.rev5.rev4.rev3.rev2.PREFIX = PREFIX
render_base = rev9.render_base
render_base.PREFIX = PREFIX
render_base.EVIDENCE = render_base.OUTPUT_ROOT / "evidence" / "v6-contact-first-rig-rev10"
render_base.RENDERS = render_base.EVIDENCE / "renders"
render_base.REPORT = render_base.EVIDENCE / "render-report.json"
rev9.GRIP = Vector((-0.113465, -0.432030, 1.165))
rev9.TRIGGER = Vector((-0.123194, -0.439549, 1.187478))
rev9.FOREGRIP = Vector((-0.063941, -0.651511, 1.190))


def rename_rev10(record: dict[str, object]) -> dict[str, object]:
    old_path = Path(record["path"])
    new_path = old_path.with_name(old_path.name.replace("rig-rev1", "rig-rev10"))
    if old_path != new_path:
        old_path.replace(new_path)
    record["path"] = str(new_path)
    record["bytes"] = new_path.stat().st_size
    record["sha256"] = render_base.sha256(new_path)
    return record


rev9.rename_rev9 = rename_rev10
render_base.render_view = rev9.render_view
render_base.render_board = rev9.render_board


def main() -> None:
    rev9.main()
    report = json.loads(render_base.REPORT.read_text(encoding="utf-8"))
    report["schema"] = "kyx-v6-contact-first-rig-render-report-v10"
    report["status"] = "EARLY_REV10_REACHABLE_CURLED_VISUAL_PROOF_REVIEW_REQUIRED"
    report["rev10Invariant"] = "support palm target is native-reachable; digit roots are palm-continuous and chains retain curl slack"
    render_base.REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
