#!/usr/bin/env python3
"""Print structural metadata for the preserved Quaternius gun donors.

Run with Blender:

  blender --background --factory-startup \
    --python tools/art/inspect-quaternius-gun-pack.py

The script is read-only: it opens each donor and emits one JSON record without
saving or exporting any Blender file.
"""

from __future__ import annotations

import json
from pathlib import Path

import bpy
from mathutils import Vector


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DONOR_ROOT = (
    REPOSITORY_ROOT
    / "assets"
    / "source"
    / "blender"
    / "vendor"
    / "quaternius-sci-fi-gun-pack"
    / "blends"
)
DONOR_FILES = (
    "Pistol.blend",
    "LongPistol.blend",
    "Sniper rifle.blend",
    "Ray Gun.blend",
    "LightningGun.blend",
    "LongPistol_small.blend",
)


def inspect_donor(filename: str) -> dict[str, object]:
    path = DONOR_ROOT / filename
    bpy.ops.wm.open_mainfile(filepath=str(path))
    meshes = sorted(
        (obj for obj in bpy.context.scene.objects if obj.type == "MESH"),
        key=lambda obj: obj.name,
    )
    corners = [
        obj.matrix_world @ Vector(corner)
        for obj in meshes
        for corner in obj.bound_box
    ]
    minimum = [min(corner[index] for corner in corners) for index in range(3)]
    maximum = [max(corner[index] for corner in corners) for index in range(3)]
    return {
        "file": filename,
        "bytes": path.stat().st_size,
        "objects": [
            {
                "name": obj.name,
                "vertices": len(obj.data.vertices),
                "polygons": len(obj.data.polygons),
                "materials": [
                    material.name if material is not None else None
                    for material in obj.data.materials
                ],
            }
            for obj in meshes
        ],
        "materialNames": sorted(material.name for material in bpy.data.materials),
        "bounds": {
            "min": minimum,
            "max": maximum,
            "size": [maximum[index] - minimum[index] for index in range(3)],
        },
    }


print(
    "KYX_GUN_PACK_INSPECT="
    + json.dumps(
        [inspect_donor(filename) for filename in DONOR_FILES],
        separators=(",", ":"),
    )
)
