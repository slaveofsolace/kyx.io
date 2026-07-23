"""Numerical surface checks for the bounded rev11 contact proof."""

from __future__ import annotations

import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


PREFIX = "V6CF11_"
BODY_NAME = "KYX_V6A_AnatomySculpt_Body"
FORWARD = Vector((0.220107, -0.975476, 0.0))
RIGHT = Vector((0.975476, 0.220107, 0.0))
SHOULDER = Vector((-0.185, -0.115, 1.365))


def rounded(point: Vector) -> list[float]:
    return [round(float(value), 7) for value in point]


def main() -> None:
    global PREFIX
    args = sys.argv[sys.argv.index("--") + 1 :]
    output = Path(args[0]).resolve()
    if len(args) > 1:
        PREFIX = args[1]
    body = bpy.data.objects[BODY_NAME]
    for modifier in body.modifiers:
        if modifier.type == "MULTIRES":
            modifier.levels = 0
            modifier.sculpt_levels = 0
            modifier.render_levels = 0
    depsgraph = bpy.context.evaluated_depsgraph_get()
    evaluated = body.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh(preserve_all_data_layers=True, depsgraph=depsgraph)
    if len(mesh.vertices) != len(body.data.vertices):
        raise RuntimeError("Index-stable body evaluation required")
    world = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]

    shoulder_candidates = []
    for index, point in enumerate(world):
        delta = point - SHOULDER
        r = delta.dot(RIGHT)
        f = delta.dot(FORWARD)
        if abs(r) <= 0.060 and abs(delta.z) <= 0.085 and -0.10 <= f <= 0.10:
            shoulder_candidates.append((f, index, point, r, delta.z))
    shoulder_candidates.sort(reverse=True)

    def family_distances(side: str, family: str, object_name: str) -> dict[str, object]:
        group_indices = {
            body.vertex_groups[f"{family}_0{index}.{side}"].index
            for index in range(1, 4)
        }
        fixture = bpy.data.objects[object_name]
        inverse = fixture.matrix_world.inverted()
        values = []
        for vertex in body.data.vertices:
            family_weight = sum(item.weight for item in vertex.groups if item.group in group_indices)
            if family_weight < 0.55:
                continue
            point = world[vertex.index]
            hit, location, _normal, _face = fixture.closest_point_on_mesh(inverse @ point)
            if hit:
                nearest = fixture.matrix_world @ location
                values.append(((point - nearest).length, vertex.index, point, family_weight))
        values.sort()
        return {
            "checkedVertices": len(values),
            "nearest": [
                {"distance": round(distance, 7), "vertex": index, "point": rounded(point), "familyWeight": round(weight, 5)}
                for distance, index, point, weight in values[:8]
            ],
        }

    def group_distances(group_name: str, object_name: str, minimum_weight: float = 0.55) -> dict[str, object]:
        group_index = body.vertex_groups[group_name].index
        fixture = bpy.data.objects[object_name]
        inverse = fixture.matrix_world.inverted()
        values = []
        for vertex in body.data.vertices:
            weight = next((item.weight for item in vertex.groups if item.group == group_index), 0.0)
            if weight < minimum_weight:
                continue
            point = world[vertex.index]
            hit, location, _normal, _face = fixture.closest_point_on_mesh(inverse @ point)
            if hit:
                nearest = fixture.matrix_world @ location
                values.append(((point - nearest).length, vertex.index, point, weight))
        values.sort()
        return {
            "checkedVertices": len(values),
            "nearest": [
                {"distance": round(distance, 7), "vertex": index, "point": rounded(point), "weight": round(weight, 5)}
                for distance, index, point, weight in values[:8]
            ],
        }

    pad = bpy.data.objects[f"{PREFIX}Rifle_StockPadContact"]
    pad_inverse = pad.matrix_world.inverted()
    pad_distances = []
    for _f, index, point, _r, _z in shoulder_candidates:
        hit, location, _normal, _face = pad.closest_point_on_mesh(pad_inverse @ point)
        if hit:
            nearest = pad.matrix_world @ location
            pad_distances.append(((point - nearest).length, index, point, nearest))
    pad_distances.sort()

    report = {
        "schema": "kyx-v6-contact-surface-diagnostic-v11",
        "shoulderPad": {
            "candidateCount": len(shoulder_candidates),
            "frontmost": [
                {"forwardOffset": round(f, 7), "vertex": index, "point": rounded(point), "rightOffset": round(r, 7), "zOffset": round(z, 7)}
                for f, index, point, r, z in shoulder_candidates[:12]
            ],
            "nearestSurface": [
                {"distance": round(distance, 7), "vertex": index, "bodyPoint": rounded(point), "padPoint": rounded(nearest)}
                for distance, index, point, nearest in pad_distances[:8]
            ],
        },
        "firingGrip": {family: family_distances("R", family, f"{PREFIX}Rifle_GripContact") for family in ("middle", "ring", "pinky", "thumb")},
        "firingPalm": group_distances("palm.R", f"{PREFIX}Rifle_GripContact", 0.20),
        "trigger": family_distances("R", "index", f"{PREFIX}Rifle_Trigger"),
        "supportForegrip": {family: family_distances("L", family, f"{PREFIX}Rifle_ForegripContact") for family in ("index", "middle", "ring", "pinky", "thumb")},
        "supportPalm": group_distances("palm.L", f"{PREFIX}Rifle_ForegripContact", 0.20),
    }
    evaluated.to_mesh_clear()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
