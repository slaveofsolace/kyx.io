"""Run the isolated Rev51 bounded-route candidate with durable evidence.

PowerShell launch contract (use distinct absolute log paths):

    # Launch evidence identity:
    # evidence/2026-08-09/
    # g6-assault-rev51-vlr7-bounded-route-launch-v1

    $argumentString = `
      '--background "{0}" --python-exit-code 1 --python "{1}"' -f `
      $sourceBlend, $wrapper
    $process = Start-Process -FilePath $blenderExe `
      -ArgumentList $argumentString `
      -RedirectStandardOutput $stdoutLog `
      -RedirectStandardError $stderrLog `
      -Wait -PassThru
    if ($process.ExitCode -ne 0) {
      throw "Rev51 Blender failed with exit code $($process.ExitCode)"
    }

Do not invoke Blender directly from a PowerShell expression under a temporary
``$ErrorActionPreference = 'Stop'`` policy: native stderr can become a
PowerShell NativeCommandError before the authoritative process exit is read.
Start-Process above keeps stdout/stderr separate and makes ExitCode decisive.

Rev51 preserves every Rev50 anatomical/mechanical/authority threshold, changes
only dominant-middle triangle-55 barycentrics to the audited same-face target,
and chooses from a finite stable-ID exact-length route family only after every
point, segment, joint, wrap, handedness, order, spacing, and temporal gate has
passed. A successful bounded Blender run can claim only its recorded technical
gates; Human Eye, browser/runtime integration, release, and deployment
acceptance remain open.
"""

from __future__ import annotations

import os
import runpy
import sys
import traceback
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve()
WORKTREE = SCRIPT_PATH.parents[5]
REV51_EVIDENCE_DIR = (
    WORKTREE
    / "evidence"
    / "2026-08-09"
    / "g6-assault-rev51-vlr7-bounded-route-source-build-v1"
)
REV51_WRAPPER_TRACEBACK_PATH = (
    REV51_EVIDENCE_DIR / "rev51-wrapper-traceback.txt"
)


def durable_wrapper_log(text: str) -> None:
    REV51_EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    with REV51_WRAPPER_TRACEBACK_PATH.open(
        "w",
        encoding="utf-8",
        newline="\n",
    ) as handle:
        handle.write(text)
        if not text.endswith("\n"):
            handle.write("\n")
        handle.flush()
        os.fsync(handle.fileno())


def reject_launch_contract(reason: str) -> None:
    message = "REV51_LAUNCH_CONTRACT_ERROR: " + reason + "\n"
    durable_wrapper_log(message)
    sys.stderr.write(message)
    sys.stderr.flush()
    # This occurs before the core opens, so an immediate nonzero exit cannot
    # strand a partially-authored candidate.
    os._exit(86)


def require_python_exit_contract() -> None:
    exit_like_positions = [
        index
        for index, value in enumerate(sys.argv)
        if value == "--python-exit-code"
        or value.startswith("--python-exit-code=")
    ]
    exit_positions = [
        index
        for index, value in enumerate(sys.argv)
        if value == "--python-exit-code"
    ]
    python_positions = [
        index
        for index, value in enumerate(sys.argv)
        if value == "--python"
    ]
    python_like_positions = [
        index
        for index, value in enumerate(sys.argv)
        if value == "--python" or value.startswith("--python=")
    ]
    if len(exit_like_positions) != 1 or len(exit_positions) != 1:
        reject_launch_contract(
            "expected exactly one '--python-exit-code 1' pair; "
            f"found {len(exit_like_positions)} exact/equal-form flags"
        )
    if len(python_like_positions) != 1 or len(python_positions) != 1:
        reject_launch_contract(
            "expected exactly one '--python <Rev51 wrapper>' pair; "
            f"found {len(python_like_positions)} exact/equal-form flags"
        )
    exit_index = exit_positions[0]
    python_index = python_positions[0]
    if exit_index + 1 >= len(sys.argv) or sys.argv[exit_index + 1] != "1":
        supplied = (
            sys.argv[exit_index + 1]
            if exit_index + 1 < len(sys.argv)
            else "<missing>"
        )
        reject_launch_contract(
            "'--python-exit-code' must be followed by exact value '1'; "
            f"received {supplied!r}"
        )
    if python_index + 1 >= len(sys.argv):
        reject_launch_contract("'--python' is missing the Rev51 wrapper path")
    try:
        supplied_wrapper = Path(sys.argv[python_index + 1]).resolve()
    except (OSError, RuntimeError) as exc:
        reject_launch_contract(
            f"Rev51 wrapper path cannot be resolved: {exc}"
        )
    if supplied_wrapper != SCRIPT_PATH:
        reject_launch_contract(
            "the single '--python' argument must name this exact Rev51 wrapper; "
            f"received {supplied_wrapper}"
        )
    if exit_index >= python_index:
        reject_launch_contract(
            "the exact '--python-exit-code 1' pair must occur before the "
            "specific Rev51 '--python' argument"
        )


try:
    require_python_exit_contract()
    os.environ["KYX_ASSAULT_VARIANT"] = "weapon-ready-v15"
    runpy.run_path(
        str(Path(__file__).with_name("author_export_cc0_assault_rev51.py")),
        run_name="__main__",
    )
except BaseException:
    # Core-main failures own their complete traceback.  This wrapper log is
    # reserved for launch/import failures before the core's guarded main entry.
    if os.environ.get("KYX_REV51_CORE_MAIN_ENTERED") != "1":
        wrapper_traceback = traceback.format_exc()
        try:
            durable_wrapper_log(wrapper_traceback)
        finally:
            print(wrapper_traceback, flush=True)
    raise
