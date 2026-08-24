#!/usr/bin/env python3
"""Capture a fail-closed SHA-256 manifest for untracked files in a Git worktree.

The source worktree is treated as read-only. The manifest is written atomically
to a caller-selected path outside that source worktree.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path


CHUNK_SIZE = 4 * 1024 * 1024


def run_git(root: Path, *args: str) -> bytes:
    return subprocess.check_output(
        ["git", "-C", str(root), *args],
        stderr=subprocess.STDOUT,
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(CHUNK_SIZE):
            digest.update(chunk)
    return digest.hexdigest()


def is_within(path: Path, root: Path) -> bool:
    try:
        common_path = os.path.commonpath([path, root])
    except ValueError:
        return False
    return os.path.normcase(common_path) == os.path.normcase(str(root))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--expected-head", required=True)
    parser.add_argument("--expected-count", required=True, type=int)
    args = parser.parse_args()

    source_root = args.source_root.resolve(strict=True)
    output = args.output.resolve()
    if is_within(output, source_root):
        raise SystemExit("refusing to write the manifest inside the protected source")

    head = run_git(source_root, "rev-parse", "HEAD").decode().strip()
    branch = run_git(source_root, "branch", "--show-current").decode().strip()
    if head != args.expected_head:
        raise SystemExit(f"HEAD mismatch: expected {args.expected_head}, got {head}")

    raw_paths = run_git(
        source_root,
        "ls-files",
        "--others",
        "--exclude-standard",
        "-z",
    )
    relative_paths = [
        value.decode("utf-8", errors="surrogateescape")
        for value in raw_paths.split(b"\0")
        if value
    ]
    if len(relative_paths) != args.expected_count:
        raise SystemExit(
            f"untracked count mismatch: expected {args.expected_count}, "
            f"got {len(relative_paths)}"
        )

    entries: list[dict[str, object]] = []
    for relative_path in relative_paths:
        candidate = source_root.joinpath(*relative_path.split("/"))
        resolved = candidate.resolve(strict=True)
        if not is_within(resolved, source_root):
            raise SystemExit(f"path escapes protected source: {relative_path}")
        if candidate.is_symlink():
            link_target = os.readlink(candidate)
            payload = os.fsencode(link_target)
            entries.append(
                {
                    "path": relative_path,
                    "type": "symlink",
                    "sizeBytes": len(payload),
                    "sha256": hashlib.sha256(payload).hexdigest(),
                    "linkTarget": link_target,
                }
            )
            continue
        if not candidate.is_file():
            raise SystemExit(f"unsupported untracked entry type: {relative_path}")
        entries.append(
            {
                "path": relative_path,
                "type": "file",
                "sizeBytes": candidate.stat().st_size,
                "sha256": sha256_file(candidate),
            }
        )

    document = {
        "schemaVersion": 1,
        "capturedAtUtc": datetime.now(timezone.utc).isoformat(),
        "sourceRoot": str(source_root),
        "sourceBranch": branch,
        "sourceHead": head,
        "ownership": "protected-canonical-read-only",
        "disposition": "preserve-until-proven-merged-reachable-and-explicitly-listed",
        "untrackedCount": len(entries),
        "totalSizeBytes": sum(int(entry["sizeBytes"]) for entry in entries),
        "entries": entries,
    }

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        newline="\n",
        dir=output.parent,
        prefix=f".{output.name}.",
        suffix=".tmp",
        delete=False,
    ) as handle:
        json.dump(document, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
        temporary_path = Path(handle.name)
    os.replace(temporary_path, output)

    print(
        json.dumps(
            {
                "output": str(output),
                "head": head,
                "branch": branch,
                "untrackedCount": len(entries),
                "totalSizeBytes": document["totalSizeBytes"],
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
