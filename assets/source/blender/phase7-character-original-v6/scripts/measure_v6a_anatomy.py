"""Measure a KYX V6 anatomy checkpoint without modifying or saving it.

Run with Blender factory startup and auto-execution disabled. The report is
deliberately based on base-cage coordinates so source and authored V6-A can be
compared without evaluating or applying the preserved Multires sculpt levels.
"""

from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import statistics
import sys

import bpy
from mathutils import Vector


BODY_CANDIDATES = (
    "KYX_V6A_AnatomySculpt_Body",
    "KYX_V6_CC0_AnatomySeed_Body",
)


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected: -- <report.json> <checkpoint-label>")
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def quantile(values: list[float], fraction: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)


def round6(value: float) -> float:
    return round(float(value), 6)


def connected_components(vertex_count: int, edges: list[tuple[int, int]]) -> list[int]:
    adjacency: list[list[int]] = [[] for _ in range(vertex_count)]
    for a, b in edges:
        adjacency[a].append(b)
        adjacency[b].append(a)
    unseen = set(range(vertex_count))
    sizes: list[int] = []
    while unseen:
        root = min(unseen)
        unseen.remove(root)
        queue = deque([root])
        size = 0
        while queue:
            current = queue.popleft()
            size += 1
            for neighbor in adjacency[current]:
                if neighbor in unseen:
                    unseen.remove(neighbor)
                    queue.append(neighbor)
        sizes.append(size)
    return sorted(sizes, reverse=True)


def base_mesh_report(body: bpy.types.Object) -> dict[str, object]:
    mesh = body.data
    coords = [vertex.co.copy() for vertex in mesh.vertices]
    xs = [co.x for co in coords]
    ys = [co.y for co in coords]
    zs = [co.z for co in coords]
    minimum = Vector((min(xs), min(ys), min(zs)))
    maximum = Vector((max(xs), max(ys), max(zs)))
    height = maximum.z - minimum.z

    # Bands are fractions of measured standing height. They are deliberately
    # broad and reproducible; visual review remains authoritative.
    bands = {
        "foot": (0.00, 0.085),
        "lowerLeg": (0.085, 0.31),
        "knee": (0.27, 0.36),
        "thigh": (0.36, 0.52),
        "pelvis": (0.48, 0.61),
        "waist": (0.57, 0.69),
        "chest": (0.67, 0.82),
        "shoulderNeck": (0.79, 0.90),
        "head": (0.88, 1.001),
    }
    band_reports: dict[str, object] = {}
    for name, (low_fraction, high_fraction) in bands.items():
        low = minimum.z + height * low_fraction
        high = minimum.z + height * high_fraction
        selected = [co for co in coords if low <= co.z <= high]
        if not selected:
            continue
        selected_x = [co.x for co in selected]
        selected_y = [co.y for co in selected]
        band_reports[name] = {
            "zFraction": [low_fraction, high_fraction],
            "vertexCount": len(selected),
            "widthP98": round6(quantile(selected_x, 0.99) - quantile(selected_x, 0.01)),
            "depthP98": round6(quantile(selected_y, 0.99) - quantile(selected_y, 0.01)),
            "medianAbsX": round6(statistics.median(abs(co.x) for co in selected)),
            "medianY": round6(statistics.median(selected_y)),
        }

    # Central-body measurements exclude arms using conservative absolute-X
    # windows appropriate to this source pose.
    central_windows = {
        "pelvisCore": (0.49, 0.60, 0.235),
        "waistCore": (0.58, 0.69, 0.215),
        "chestCore": (0.69, 0.81, 0.245),
        "neckJawCore": (0.83, 0.91, 0.18),
    }
    central_reports: dict[str, object] = {}
    for name, (low_fraction, high_fraction, max_abs_x) in central_windows.items():
        low = minimum.z + height * low_fraction
        high = minimum.z + height * high_fraction
        selected = [
            co for co in coords
            if low <= co.z <= high and abs(co.x) <= max_abs_x
        ]
        selected_x = [co.x for co in selected]
        selected_y = [co.y for co in selected]
        central_reports[name] = {
            "zFraction": [low_fraction, high_fraction],
            "maxAbsXFilter": max_abs_x,
            "vertexCount": len(selected),
            "widthP98": round6(quantile(selected_x, 0.99) - quantile(selected_x, 0.01)),
            "depthP98": round6(quantile(selected_y, 0.99) - quantile(selected_y, 0.01)),
        }

    edges = [(edge.vertices[0], edge.vertices[1]) for edge in mesh.edges]
    components = connected_components(len(mesh.vertices), edges)
    edge_face_counts = [0] * len(mesh.edges)
    edge_lookup = {tuple(sorted(edge.vertices)): index for index, edge in enumerate(mesh.edges)}
    degenerate_polygons = 0
    for polygon in mesh.polygons:
        if polygon.area <= 1.0e-12:
            degenerate_polygons += 1
        vertices = polygon.vertices
        for index, a in enumerate(vertices):
            b = vertices[(index + 1) % len(vertices)]
            edge_face_counts[edge_lookup[tuple(sorted((a, b)))]] += 1

    multires = [
        {
            "name": modifier.name,
            "levels": modifier.levels,
            "sculptLevels": modifier.sculpt_levels,
            "renderLevels": modifier.render_levels,
            "totalLevels": modifier.total_levels,
            "showViewport": modifier.show_viewport,
            "showRender": modifier.show_render,
        }
        for modifier in body.modifiers
        if modifier.type == "MULTIRES"
    ]

    return {
        "name": body.name,
        "data": mesh.name,
        "objectLocation": [round6(value) for value in body.location],
        "objectRotationEuler": [round6(value) for value in body.rotation_euler],
        "objectScale": [round6(value) for value in body.scale],
        "baseVertices": len(mesh.vertices),
        "baseEdges": len(mesh.edges),
        "basePolygons": len(mesh.polygons),
        "bounds": {
            "min": [round6(value) for value in minimum],
            "max": [round6(value) for value in maximum],
            "height": round6(height),
            "width": round6(maximum.x - minimum.x),
            "depth": round6(maximum.y - minimum.y),
        },
        "bandMeasurements": band_reports,
        "centralBodyMeasurements": central_reports,
        "topology": {
            "connectedComponentCount": len(components),
            "connectedComponentSizes": components,
            "boundaryEdgeCount": sum(count == 1 for count in edge_face_counts),
            "nonManifoldEdgeCount": sum(count != 2 for count in edge_face_counts),
            "wireEdgeCount": sum(count == 0 for count in edge_face_counts),
            "degeneratePolygonCount": degenerate_polygons,
            "uvLayerCount": len(mesh.uv_layers),
            "colorAttributeCount": len(mesh.color_attributes),
            "shapeKeyCount": len(mesh.shape_keys.key_blocks) if mesh.shape_keys else 0,
        },
        "multires": multires,
    }


def main() -> None:
    args = args_after_separator()
    if len(args) != 2:
        raise SystemExit("Expected: -- <report.json> <checkpoint-label>")
    report_path = Path(args[0]).resolve()
    label = args[1]
    blend_path = Path(bpy.data.filepath).resolve()
    if not blend_path.is_file():
        raise RuntimeError("No blend file is open")
    body = next((bpy.data.objects.get(name) for name in BODY_CANDIDATES if bpy.data.objects.get(name)), None)
    if body is None or body.type != "MESH":
        raise RuntimeError(f"Expected one of these body objects: {BODY_CANDIDATES}")
    external_paths = sorted(set(bpy.utils.blend_paths(absolute=True, packed=False)))
    driver_records = []
    for datablocks in (
        bpy.data.objects,
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.worlds,
        bpy.data.scenes,
    ):
        for datablock in datablocks:
            animation_data = getattr(datablock, "animation_data", None)
            if animation_data and animation_data.drivers:
                driver_records.append(datablock.name)

    report = {
        "schemaVersion": 1,
        "measuredUtc": datetime.now(timezone.utc).isoformat(),
        "label": label,
        "blenderVersion": bpy.app.version_string,
        "autoexecFail": bool(bpy.app.autoexec_fail),
        "blend": {
            "path": blend_path.name,
            "bytes": blend_path.stat().st_size,
            "sha256": sha256(blend_path),
        },
        "body": base_mesh_report(body),
        "eyes": [
            {
                "name": obj.name,
                "parent": obj.parent.name if obj.parent else None,
                "location": [round6(value) for value in obj.location],
                "matrixLocalTranslation": [round6(value) for value in obj.matrix_local.translation],
                "matrixWorldTranslation": [round6(value) for value in obj.matrix_world.translation],
                "scale": [round6(value) for value in obj.scale],
                "vertices": len(obj.data.vertices),
                "polygons": len(obj.data.polygons),
            }
            for obj in sorted(bpy.data.objects, key=lambda item: item.name)
            if obj.type == "MESH" and "Eye" in obj.name
        ],
        "sceneInventory": {
            "collections": len(bpy.data.collections),
            "objects": len(bpy.data.objects),
            "meshes": len(bpy.data.meshes),
            "materials": len(bpy.data.materials),
            "images": len(bpy.data.images),
            "texts": len(bpy.data.texts),
            "actions": len(bpy.data.actions),
            "armatures": len(bpy.data.armatures),
            "libraries": len(bpy.data.libraries),
            "drivers": driver_records,
            "externalPaths": external_paths,
        },
    }
    report["assertions"] = {
        "autoexecDidNotFail": not report["autoexecFail"],
        "noTextBlocks": report["sceneInventory"]["texts"] == 0,
        "noActions": report["sceneInventory"]["actions"] == 0,
        "noArmatures": report["sceneInventory"]["armatures"] == 0,
        "noLibraries": report["sceneInventory"]["libraries"] == 0,
        "noDrivers": not report["sceneInventory"]["drivers"],
        "noExternalPaths": not report["sceneInventory"]["externalPaths"],
        "oneConnectedBodyComponent": report["body"]["topology"]["connectedComponentCount"] == 1,
        "noDegeneratePolygons": report["body"]["topology"]["degeneratePolygonCount"] == 0,
        "multiresThreeLevelsPreserved": any(
            modifier["totalLevels"] == 3 for modifier in report["body"]["multires"]
        ),
    }
    report["status"] = (
        "ANATOMY_MEASUREMENT_PASS" if all(report["assertions"].values())
        else "ANATOMY_MEASUREMENT_FAIL"
    )
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(report["status"] + " " + str(report_path))
    if report["status"].endswith("FAIL"):
        raise SystemExit(2)


if __name__ == "__main__":
    main()
