"""Independent headless validator for Inkfall Foundry P6.2 artifacts.

Run with Blender:
  blender --background --factory-startup --python validate_inkfall_foundry_graybox.py -- \
    --seed inkfall-foundry.layout-seed.v1.json --output-root .
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


EXPECTED_SEED_SHA256 = "562c5ea8711a1eb1f4a08a31c8872c68c23778aa159110a107c9da0b74e67a63"
COLLECTION_RENDER = "P6_2_RENDER_GRAYBOX"
COLLECTION_COLLISION = "P6_2_AUTHORITATIVE_COLLISION"
COLLECTION_GUIDES = "P6_2_EDITOR_GUIDES"
COLLECTION_STAGE = "P6_2_PREVIEW_STAGE"


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", required=True)
    parser.add_argument("--output-root", required=True)
    return parser.parse_args(args)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def stable_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def sanitize(value: str) -> str:
    return "".join(char.upper() if char.isalnum() else "_" for char in value).strip("_")


def parse_glb(path: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    raw = path.read_bytes()
    if len(raw) < 20:
        raise ValueError(f"{path} is too small to be a GLB")
    magic, version, declared_length = struct.unpack_from("<4sII", raw, 0)
    if magic != b"glTF" or version != 2 or declared_length != len(raw):
        raise ValueError(f"{path} has an invalid GLB header")
    cursor = 12
    json_chunk: bytes | None = None
    binary_bytes = 0
    chunk_count = 0
    while cursor < len(raw):
        chunk_length, chunk_type = struct.unpack_from("<II", raw, cursor)
        cursor += 8
        chunk = raw[cursor : cursor + chunk_length]
        cursor += chunk_length
        chunk_count += 1
        if chunk_type == 0x4E4F534A:
            json_chunk = chunk
        elif chunk_type == 0x004E4942:
            binary_bytes += chunk_length
    if cursor != len(raw) or json_chunk is None:
        raise ValueError(f"{path} has malformed GLB chunks")
    document = json.loads(json_chunk.rstrip(b" \x00").decode("utf-8"))

    accessors = document.get("accessors", [])
    triangle_count = 0
    primitive_count = 0
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            primitive_count += 1
            if primitive.get("mode", 4) != 4:
                continue
            if "indices" in primitive:
                triangle_count += accessors[primitive["indices"]]["count"] // 3
            else:
                position_accessor = primitive["attributes"]["POSITION"]
                triangle_count += accessors[position_accessor]["count"] // 3

    node_names = [
        node.get("name", "")
        for node in document.get("nodes", [])
        if node.get("name")
    ]
    report = {
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "chunks": chunk_count,
        "binaryBytes": binary_bytes,
        "scenes": len(document.get("scenes", [])),
        "nodes": len(document.get("nodes", [])),
        "meshes": len(document.get("meshes", [])),
        "primitives": primitive_count,
        "triangles": triangle_count,
        "materials": len(document.get("materials", [])),
        "textures": len(document.get("textures", [])),
        "images": len(document.get("images", [])),
        "skins": len(document.get("skins", [])),
        "animations": len(document.get("animations", [])),
        "extensionsUsed": sorted(document.get("extensionsUsed", [])),
        "nodeNames": sorted(node_names),
    }
    return document, report


def assertion(
    assertions: list[dict[str, Any]],
    assertion_id: str,
    passed: bool,
    *,
    expected: Any = None,
    actual: Any = None,
    detail: str | None = None,
) -> None:
    record: dict[str, Any] = {"id": assertion_id, "passed": bool(passed)}
    if expected is not None:
        record["expected"] = expected
    if actual is not None:
        record["actual"] = actual
    if detail is not None:
        record["detail"] = detail
    assertions.append(record)


def world_aabb(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    minimum = Vector((math.inf, math.inf, math.inf))
    maximum = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        for corner in obj.bound_box:
            world_corner = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                minimum[axis] = min(minimum[axis], world_corner[axis])
                maximum[axis] = max(maximum[axis], world_corner[axis])
    return minimum, maximum


def build_expected_names(seed: dict[str, Any]) -> dict[str, set[str]]:
    route_segments: set[str] = set()
    waypoint_pads: set[str] = set()
    for link in seed["links"]:
        modes = set(link["modes"])
        if modes in ({"teleport"}, {"drop"}):
            continue
        for index in range(len(link["waypointsMm"]) - 1):
            route_segments.add(f"ROUTE__{sanitize(link['id'])}__S{index:02d}")
        for index in range(1, len(link["waypointsMm"]) - 1):
            waypoint_pads.add(f"WAYPOINT__{sanitize(link['id'])}__W{index:02d}")
    nodes = {f"NODE__{sanitize(node['id'])}" for node in seed["nodes"]}
    return {
        "routeSegments": route_segments,
        "waypointPads": waypoint_pads,
        "nodes": nodes,
    }


def validate() -> None:
    args = parse_args()
    seed_path = Path(args.seed).resolve()
    root = Path(args.output_root).resolve()
    source_blend = root / "source" / "inkfall_foundry.blend"
    render_glb = root / "export" / "render.graybox.glb"
    collision_glb = root / "export" / "collision.authority.glb"
    build_report_path = root / "validation" / "graybox-build-report.json"
    report_path = root / "validation" / "graybox-artifact-validation.json"

    seed_bytes = seed_path.read_bytes()
    seed_sha256 = hashlib.sha256(seed_bytes).hexdigest()
    seed = json.loads(seed_bytes.decode("utf-8"))
    build_report = json.loads(build_report_path.read_text(encoding="utf-8"))
    bpy.ops.wm.open_mainfile(filepath=str(source_blend), load_ui=False)

    assertions: list[dict[str, Any]] = []
    assertion(
        assertions,
        "approved_seed_sha",
        seed_sha256 == EXPECTED_SEED_SHA256,
        expected=EXPECTED_SEED_SHA256,
        actual=seed_sha256,
    )
    assertion(
        assertions,
        "scene_seed_sha",
        bpy.context.scene.get("kyx_seed_sha256") == seed_sha256,
        expected=seed_sha256,
        actual=bpy.context.scene.get("kyx_seed_sha256"),
    )
    assertion(
        assertions,
        "scene_truth_boundary",
        bpy.context.scene.get("kyx_runtime_integrated") is False
        and bpy.context.scene.get("kyx_g5_passed") is False
        and bpy.context.scene.get("kyx_g6_passed") is False,
        detail="P6.2 artifacts must not claim runtime integration or G5/G6.",
    )

    collection_names = set(bpy.data.collections.keys())
    required_collections = {
        COLLECTION_RENDER,
        COLLECTION_COLLISION,
        COLLECTION_GUIDES,
        COLLECTION_STAGE,
    }
    assertion(
        assertions,
        "required_collections",
        required_collections.issubset(collection_names),
        expected=sorted(required_collections),
        actual=sorted(collection_names),
    )

    render_objects = sorted(
        [
            obj
            for obj in bpy.data.collections[COLLECTION_RENDER].objects
            if obj.type == "MESH"
        ],
        key=lambda obj: obj.name,
    )
    collision_objects = sorted(
        [
            obj
            for obj in bpy.data.collections[COLLECTION_COLLISION].objects
            if obj.type == "MESH"
        ],
        key=lambda obj: obj.name,
    )
    render_stems = {obj.name.removeprefix("R_") for obj in render_objects}
    collision_stems = {obj.name.removeprefix("C_") for obj in collision_objects}
    assertion(
        assertions,
        "render_collision_one_to_one",
        render_stems == collision_stems,
        expected=len(render_stems),
        actual=len(collision_stems),
    )
    assertion(
        assertions,
        "separate_blend_collections",
        not set(render_objects).intersection(collision_objects),
    )

    expected = build_expected_names(seed)
    assertion(
        assertions,
        "all_seed_route_segments_present",
        expected["routeSegments"].issubset(collision_stems),
        expected=len(expected["routeSegments"]),
        actual=sum(stem.startswith("ROUTE__") for stem in collision_stems),
    )
    assertion(
        assertions,
        "all_seed_waypoint_seams_present",
        expected["waypointPads"].issubset(collision_stems),
        expected=len(expected["waypointPads"]),
        actual=sum(stem.startswith("WAYPOINT__") for stem in collision_stems),
    )
    assertion(
        assertions,
        "all_seed_node_platforms_present",
        expected["nodes"].issubset(collision_stems),
        expected=len(expected["nodes"]),
        actual=sum(stem.startswith("NODE__") for stem in collision_stems),
    )
    assertion(
        assertions,
        "teleport_connector_not_physical",
        not any("TELEPORT_SHORTCUT" in stem for stem in collision_stems),
    )
    assertion(
        assertions,
        "drop_connector_not_returnable_ramp",
        not any("ARCHIVE_DROP_PRESS_NORTH" in stem for stem in collision_stems),
    )

    box_only = all(
        obj.get("kyx_shape") == "box"
        and len(obj.data.vertices) == 8
        and len(obj.data.polygons) == 6
        for obj in collision_objects
    )
    assertion(
        assertions,
        "collision_convex_boxes_only",
        box_only,
        actual={
            "objects": len(collision_objects),
            "maxVertices": max(len(obj.data.vertices) for obj in collision_objects),
            "maxPolygons": max(len(obj.data.polygons) for obj in collision_objects),
        },
    )
    assertion(
        assertions,
        "collision_roles_only",
        all(obj.get("kyx_role") == "authoritative_collider" for obj in collision_objects),
    )
    assertion(
        assertions,
        "render_roles_only",
        all(obj.get("kyx_role") == "render_graybox" for obj in render_objects),
    )

    dimensions_are_integer_mm = True
    for obj in collision_objects:
        dimensions = json.loads(obj["kyx_dimensions_mm"])
        if (
            len(dimensions) != 3
            or any(not isinstance(value, int) or value <= 0 for value in dimensions)
        ):
            dimensions_are_integer_mm = False
            break
    assertion(
        assertions,
        "integer_millimeter_proxy_dimensions",
        dimensions_are_integer_mm,
    )

    links_by_id = {link["id"]: link for link in seed["links"]}
    route_widths_match = True
    mismatched_widths: list[dict[str, Any]] = []
    for obj in collision_objects:
        if obj.get("kyx_source_kind") != "route_segment":
            continue
        dimensions = json.loads(obj["kyx_dimensions_mm"])
        link_id = obj["kyx_source_id"]
        expected_width = links_by_id[link_id]["minimumClearWidthMm"]
        if dimensions[1] != expected_width:
            route_widths_match = False
            mismatched_widths.append(
                {
                    "object": obj.name,
                    "expectedMm": expected_width,
                    "actualMm": dimensions[1],
                }
            )
    assertion(
        assertions,
        "route_proxy_widths_match_seed_minima",
        route_widths_match,
        actual=mismatched_widths,
    )

    gate_left = bpy.data.objects.get("C_MODULE__INK_SLIDE_GATE_LEFT")
    gate_right = bpy.data.objects.get("C_MODULE__INK_SLIDE_GATE_RIGHT")
    gate_roof = bpy.data.objects.get("C_MODULE__INK_SLIDE_GATE_ROOF")
    gate_objects_exist = all(obj is not None for obj in (gate_left, gate_right, gate_roof))
    assertion(assertions, "slide_gate_three_proxy_parts", gate_objects_exist)
    if gate_objects_exist:
        gate_separation = (gate_left.location - gate_right.location).length
        assertion(
            assertions,
            "slide_gate_walls_are_distinct",
            gate_separation > 1.0,
            expected=">1.0 m",
            actual=round(gate_separation, 6),
        )
        gate_clear_height = int(gate_roof.get("kyx_clear_height_mm", 0))
        gate_clear_width = int(gate_roof.get("kyx_clear_width_mm", 0))
        assertion(
            assertions,
            "slide_gate_seed_clearance",
            gate_clear_height == 1350 and gate_clear_width == 1400,
            expected={"heightMm": 1350, "widthMm": 1400},
            actual={"heightMm": gate_clear_height, "widthMm": gate_clear_width},
        )

    collider_min, collider_max = world_aabb(collision_objects)
    seed_min = seed["boundsMm"]["minimum"]
    seed_max = seed["boundsMm"]["maximum"]
    blender_bound_min = Vector(
        (seed_min[0] / 1000.0, seed_min[2] / 1000.0, seed_min[1] / 1000.0)
    )
    blender_bound_max = Vector(
        (seed_max[0] / 1000.0, seed_max[2] / 1000.0, seed_max[1] / 1000.0)
    )
    within_bounds = all(
        collider_min[axis] >= blender_bound_min[axis] - 0.001
        and collider_max[axis] <= blender_bound_max[axis] + 0.001
        for axis in range(3)
    )
    assertion(
        assertions,
        "collision_aabb_inside_seed_bounds",
        within_bounds,
        expected={
            "minimum": [round(value, 6) for value in blender_bound_min],
            "maximum": [round(value, 6) for value in blender_bound_max],
        },
        actual={
            "minimum": [round(value, 6) for value in collider_min],
            "maximum": [round(value, 6) for value in collider_max],
        },
    )

    render_document, render_report = parse_glb(render_glb)
    collision_document, collision_report = parse_glb(collision_glb)
    render_node_names = set(render_report["nodeNames"])
    collision_node_names = set(collision_report["nodeNames"])
    expected_render_names = {obj.name for obj in render_objects}
    expected_collision_names = {obj.name for obj in collision_objects}
    assertion(
        assertions,
        "render_glb_exact_mesh_node_set",
        render_node_names == expected_render_names,
        expected=len(expected_render_names),
        actual=len(render_node_names),
    )
    assertion(
        assertions,
        "collision_glb_exact_mesh_node_set",
        collision_node_names == expected_collision_names,
        expected=len(expected_collision_names),
        actual=len(collision_node_names),
    )
    assertion(
        assertions,
        "collision_glb_contains_no_render_or_guides",
        all(name.startswith("C_") for name in collision_node_names),
    )
    assertion(
        assertions,
        "render_glb_contains_no_collision_or_guides",
        all(name.startswith("R_") for name in render_node_names),
    )
    assertion(
        assertions,
        "glb_artifacts_are_distinct",
        render_report["sha256"] != collision_report["sha256"],
    )
    assertion(
        assertions,
        "collision_glb_static_only",
        collision_report["skins"] == 0
        and collision_report["animations"] == 0
        and collision_report["textures"] == 0
        and collision_report["images"] == 0,
        actual={
            key: collision_report[key]
            for key in ("skins", "animations", "textures", "images")
        },
    )
    assertion(
        assertions,
        "collision_glb_triangle_count_matches_boxes",
        collision_report["triangles"] == len(collision_objects) * 12,
        expected=len(collision_objects) * 12,
        actual=collision_report["triangles"],
    )

    artifact_hashes_current = {
        "sourceBlend": sha256_file(source_blend),
        "renderGlb": sha256_file(render_glb),
        "collisionGlb": sha256_file(collision_glb),
    }
    artifact_hashes_reported = {
        key: build_report["exports"]["artifacts"][key]["sha256"]
        for key in artifact_hashes_current
    }
    assertion(
        assertions,
        "build_report_hashes_match_disk",
        artifact_hashes_current == artifact_hashes_reported,
        expected=artifact_hashes_reported,
        actual=artifact_hashes_current,
    )
    assertion(
        assertions,
        "build_report_passed",
        build_report["result"] == "PASS"
        and all(item["passed"] for item in build_report["assertions"]),
    )

    result = "PASS" if all(item["passed"] for item in assertions) else "FAIL"
    output = {
        "schemaVersion": 1,
        "scope": {
            "phase": "P6.2",
            "runtimeIntegrated": False,
            "g5Passed": False,
            "g6Passed": False,
        },
        "validator": {
            "script": Path(__file__).name,
            "scriptSha256": sha256_file(Path(__file__).resolve()),
            "blenderVersion": bpy.app.version_string,
        },
        "seed": {
            "sha256": seed_sha256,
            "bytes": len(seed_bytes),
            "zones": len(seed["zones"]),
            "nodes": len(seed["nodes"]),
            "links": len(seed["links"]),
        },
        "blend": {
            "path": str(source_blend.relative_to(root)).replace("\\", "/"),
            "bytes": source_blend.stat().st_size,
            "sha256": artifact_hashes_current["sourceBlend"],
            "renderObjects": len(render_objects),
            "collisionObjects": len(collision_objects),
            "collisionAabbBlenderMeters": {
                "minimum": [round(value, 6) for value in collider_min],
                "maximum": [round(value, 6) for value in collider_max],
            },
        },
        "glb": {
            "render": {
                "path": str(render_glb.relative_to(root)).replace("\\", "/"),
                **render_report,
            },
            "collision": {
                "path": str(collision_glb.relative_to(root)).replace("\\", "/"),
                **collision_report,
            },
        },
        "assertions": assertions,
        "assertionSummary": {
            "passed": sum(item["passed"] for item in assertions),
            "failed": sum(not item["passed"] for item in assertions),
            "total": len(assertions),
        },
        "result": result,
        "interpretation": (
            "PASS proves deterministic-source traceability, collection/export "
            "separation, seed topology coverage, simple-box collider policy, "
            "and artifact integrity. It does not prove runtime loading, "
            "traversal, LOS, spawn safety, fun, performance, G5, or G6."
        ),
    }
    stable_write_json(report_path, output)
    print(json.dumps({"result": result, "report": str(report_path)}))
    if result != "PASS":
        failed = [item["id"] for item in assertions if not item["passed"]]
        raise RuntimeError(f"P6.2 validation failed: {failed}")


if __name__ == "__main__":
    validate()
