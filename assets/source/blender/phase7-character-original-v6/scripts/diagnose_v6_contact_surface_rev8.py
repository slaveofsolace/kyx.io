"""Measure rev8 deformed hand and shoulder surfaces against rifle contacts."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


PREFIX = "V6CF8_"
BODY_NAME = "KYX_V6A_AnatomySculpt_Body"


def world_vertices(body: bpy.types.Object) -> list[tuple[int, Vector, Vector]]:
    for modifier in body.modifiers:
        if modifier.type == "MULTIRES":
            modifier.levels = 0
            modifier.sculpt_levels = 0
            modifier.render_levels = 0
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = body.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    try:
        if len(mesh.vertices) != len(body.data.vertices):
            raise RuntimeError(f"Index-stable evaluation required: {len(mesh.vertices)} != {len(body.data.vertices)}")
        return [
            (vertex.index, evaluated.matrix_world @ vertex.co, body.matrix_world @ body.data.vertices[vertex.index].co)
            for vertex in mesh.vertices
        ]
    finally:
        evaluated.to_mesh_clear()


def object_center(name: str) -> Vector:
    obj = bpy.data.objects[name]
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return sum(corners, Vector()) / len(corners)


def vec(value: Vector) -> list[float]:
    return [round(float(component), 7) for component in value]


def main() -> None:
    output = Path(sys.argv[sys.argv.index("--") + 1]).resolve()
    body = bpy.data.objects[BODY_NAME]
    vertices = world_vertices(body)

    centers = {
        "grip": object_center(f"{PREFIX}Rifle_GripContact"),
        "foregrip": object_center(f"{PREFIX}Rifle_ForegripContact"),
        "stockPad": object_center(f"{PREFIX}Rifle_StockPadContact"),
        "trigger": object_center(f"{PREFIX}Rifle_Trigger"),
    }
    shoulder_candidates = [
        item for item in vertices
        if item[2].x < -0.07 and 1.16 <= item[2].z <= 1.56 and abs(item[2].y) <= 0.32
    ]
    nearest_shoulder = sorted(shoulder_candidates, key=lambda item: (item[1] - centers["stockPad"]).length)[:20]

    result: dict[str, object] = {
        "schema": "kyx-v6-contact-surface-diagnostic-rev8",
        "centers": {name: vec(center) for name, center in centers.items()},
        "shoulder": {
            "candidateCount": len(shoulder_candidates),
            "nearest": [
                {
                    "vertex": index,
                    "deformed": vec(deformed),
                    "rest": vec(rest),
                    "distanceToPadCenter": round((deformed - centers["stockPad"]).length, 7),
                }
                for index, deformed, rest in nearest_shoulder
            ],
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
