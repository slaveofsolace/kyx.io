"""Deterministic P6.2 Blender graybox builder for Inkfall Foundry.

This generator consumes the immutable P6.1 layout seed.  It creates a source
.blend containing separate render-graybox and authoritative-collision
collections, exports each collection to its own GLB, and renders inspection
views.  It intentionally does not create runtime map data or claim G5/G6.

Run with Blender 5.1+:
  blender --background --factory-startup --python build_inkfall_foundry_graybox.py -- \
    --seed inkfall-foundry.layout-seed.v1.json --output-root .
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import bpy
from mathutils import Euler, Vector


GENERATOR_ID = "inkfall_foundry_p6_2_graybox"
GENERATOR_VERSION = 2
EXPECTED_SEED_SHA256 = "562c5ea8711a1eb1f4a08a31c8872c68c23778aa159110a107c9da0b74e67a63"
COLLECTION_RENDER = "P6_2_RENDER_GRAYBOX"
COLLECTION_COLLISION = "P6_2_AUTHORITATIVE_COLLISION"
COLLECTION_GUIDES = "P6_2_EDITOR_GUIDES"
COLLECTION_STAGE = "P6_2_PREVIEW_STAGE"
ROUTE_THICKNESS_MM = 250
ROUTE_END_OVERLAP_MM = 120
WAYPOINT_PAD_OVERLAP_MM = 200
GUARD_RAIL_THICKNESS_MM = 160
GUARD_RAIL_HEIGHT_MM = 900
GUARD_RAIL_END_CLEARANCE_MM = 3000
CAPSULE_RADIUS_WITH_SKIN_MM = 370
SCOPE = "P6.2_PREPRODUCTION_ONLY"

# These are real openings, not validator exemptions: at each listed shared-node
# approach, a neighboring physical centerline crosses the nominal rail interval.
# Omitting that short side guard preserves both capsule routes and classifies the
# edge as a deliberate crosslink/junction apron rather than an accidental fall.
ROUTE_RAIL_OPENINGS = {
    ("press_east_archive", 0, "left"): "press_east_choice",
    ("press_east_choice", 0, "right"): "press_east_archive",
    ("ink_mid_w_teleport_entry", 0, "left"): "ink_mid_w_mid_e",
    ("ink_mid_w_mid_e", 0, "right"): "ink_mid_w_teleport_entry",
    ("archive_mid_w_mid_e", 0, "left"): "archive_mid_w_drop",
    ("archive_mid_w_drop", 0, "right"): "archive_mid_w_mid_e",
    ("west_choice_press", 1, "left"): "press_west_ink",
}


UNIT_CUBE_VERTICES = (
    (-0.5, -0.5, -0.5),
    (0.5, -0.5, -0.5),
    (0.5, 0.5, -0.5),
    (-0.5, 0.5, -0.5),
    (-0.5, -0.5, 0.5),
    (0.5, -0.5, 0.5),
    (0.5, 0.5, 0.5),
    (-0.5, 0.5, 0.5),
)
UNIT_CUBE_FACES = (
    (0, 1, 2, 3),
    (4, 7, 6, 5),
    (0, 4, 5, 1),
    (1, 5, 6, 2),
    (2, 6, 7, 3),
    (4, 0, 3, 7),
)


@dataclass(frozen=True)
class BuildPaths:
    root: Path
    source_dir: Path
    export_dir: Path
    preview_dir: Path
    validation_dir: Path
    source_blend: Path
    render_glb: Path
    collision_glb: Path
    build_report: Path


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


def mm_to_m(value: float | int) -> float:
    return float(value) / 1000.0


def seed_point_to_blender(position_mm: Iterable[float | int]) -> Vector:
    """Map seed X-east/Y-up/Z-north into Blender X-east/Y-north/Z-up."""
    x_mm, y_mm, z_mm = position_mm
    return Vector((mm_to_m(x_mm), mm_to_m(z_mm), mm_to_m(y_mm)))


def sanitize(value: str) -> str:
    return "".join(char.upper() if char.isalnum() else "_" for char in value).strip("_")


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for datablocks in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.materials,
        bpy.data.cameras,
        bpy.data.lights,
    ):
        for datablock in list(datablocks):
            if datablock.users == 0:
                datablocks.remove(datablock)


def make_collection(name: str) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(collection)
    return collection


def make_material(
    name: str,
    color: tuple[float, float, float, float],
    *,
    metallic: float = 0.0,
    roughness: float = 0.72,
    emission_strength: float = 0.0,
) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is not None:
        principled.inputs["Base Color"].default_value = color
        principled.inputs["Roughness"].default_value = roughness
        principled.inputs["Metallic"].default_value = metallic
        if "Emission Color" in principled.inputs:
            principled.inputs["Emission Color"].default_value = color
        elif "Emission" in principled.inputs:
            principled.inputs["Emission"].default_value = color
        if "Emission Strength" in principled.inputs:
            principled.inputs["Emission Strength"].default_value = emission_strength
    return material


def add_custom_properties(
    obj: bpy.types.Object,
    *,
    role: str,
    source_kind: str,
    source_id: str,
    dimensions_mm: tuple[int, int, int],
    seed_sha256: str,
    extra: dict[str, Any] | None = None,
) -> None:
    obj["kyx_scope"] = SCOPE
    obj["kyx_role"] = role
    obj["kyx_shape"] = "box"
    obj["kyx_source_kind"] = source_kind
    obj["kyx_source_id"] = source_id
    obj["kyx_dimensions_mm"] = json.dumps(list(dimensions_mm), separators=(",", ":"))
    obj["kyx_seed_sha256"] = seed_sha256
    if extra:
        for key, value in sorted(extra.items()):
            if isinstance(value, (list, tuple, dict)):
                obj[f"kyx_{key}"] = json.dumps(value, separators=(",", ":"), sort_keys=True)
            else:
                obj[f"kyx_{key}"] = value


def create_box(
    *,
    name: str,
    dimensions_mm: tuple[int, int, int],
    location: Vector,
    rotation,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    role: str,
    source_kind: str,
    source_id: str,
    seed_sha256: str,
    extra: dict[str, Any] | None = None,
) -> bpy.types.Object:
    dimensions_m = tuple(mm_to_m(value) for value in dimensions_mm)
    vertices = [
        (
            vertex[0] * dimensions_m[0],
            vertex[1] * dimensions_m[1],
            vertex[2] * dimensions_m[2],
        )
        for vertex in UNIT_CUBE_VERTICES
    ]
    mesh = bpy.data.meshes.new(f"{name}__MESH")
    mesh.from_pydata(vertices, [], UNIT_CUBE_FACES)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.location = location
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = rotation
    obj.data.materials.append(material)
    add_custom_properties(
        obj,
        role=role,
        source_kind=source_kind,
        source_id=source_id,
        dimensions_mm=dimensions_mm,
        seed_sha256=seed_sha256,
        extra=extra,
    )
    return obj


def identity_rotation():
    return Euler((0.0, 0.0, 0.0)).to_quaternion()


def yaw_rotation(yaw_degrees: float):
    return Euler((0.0, 0.0, math.radians(yaw_degrees))).to_quaternion()


def route_rotation(direction: Vector):
    return direction.normalized().to_track_quat("X", "Z")


def add_box_pair(
    *,
    stem: str,
    dimensions_mm: tuple[int, int, int],
    location: Vector,
    rotation,
    render_collection: bpy.types.Collection,
    collision_collection: bpy.types.Collection,
    render_material: bpy.types.Material,
    collision_material: bpy.types.Material,
    source_kind: str,
    source_id: str,
    seed_sha256: str,
    extra: dict[str, Any] | None = None,
) -> tuple[bpy.types.Object, bpy.types.Object]:
    render = create_box(
        name=f"R_{stem}",
        dimensions_mm=dimensions_mm,
        location=location,
        rotation=rotation,
        collection=render_collection,
        material=render_material,
        role="render_graybox",
        source_kind=source_kind,
        source_id=source_id,
        seed_sha256=seed_sha256,
        extra=extra,
    )
    collision = create_box(
        name=f"C_{stem}",
        dimensions_mm=dimensions_mm,
        location=location,
        rotation=rotation,
        collection=collision_collection,
        material=collision_material,
        role="authoritative_collider",
        source_kind=source_kind,
        source_id=source_id,
        seed_sha256=seed_sha256,
        extra=extra,
    )
    return render, collision


def make_polyline(
    *,
    name: str,
    points: list[Vector],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    bevel_depth: float = 0.035,
    cyclic: bool = False,
) -> bpy.types.Object:
    curve_data = bpy.data.curves.new(f"{name}__CURVE", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.bevel_depth = bevel_depth
    curve_data.bevel_resolution = 0
    spline = curve_data.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for index, point in enumerate(points):
        spline.points[index].co = (*point, 1.0)
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, curve_data)
    collection.objects.link(obj)
    obj.data.materials.append(material)
    obj["kyx_scope"] = SCOPE
    obj["kyx_role"] = "editor_guide"
    return obj


def make_text(
    *,
    name: str,
    body: str,
    location: Vector,
    size: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
) -> bpy.types.Object:
    curve = bpy.data.curves.new(f"{name}__FONT", type="FONT")
    curve.body = body
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.extrude = 0.012
    curve.bevel_depth = 0.004
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.location = location
    obj.data.materials.append(material)
    obj["kyx_scope"] = SCOPE
    obj["kyx_role"] = "editor_guide"
    return obj


def make_ring(
    *,
    name: str,
    center: Vector,
    radius: float,
    height_offset: float,
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    segments: int = 32,
) -> bpy.types.Object:
    points = [
        center
        + Vector(
            (
                math.cos(index * math.tau / segments) * radius,
                math.sin(index * math.tau / segments) * radius,
                height_offset,
            )
        )
        for index in range(segments)
    ]
    return make_polyline(
        name=name,
        points=points,
        collection=collection,
        material=material,
        bevel_depth=0.045,
        cyclic=True,
    )


def material_for_family(materials: dict[str, bpy.types.Material], family: str):
    return materials.get(family, materials["crosslink"])


def add_route_geometry(
    *,
    seed: dict[str, Any],
    seed_sha256: str,
    render_collection: bpy.types.Collection,
    collision_collection: bpy.types.Collection,
    guide_collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> dict[str, int]:
    route_segments = 0
    waypoint_pads = 0
    skipped_teleport_segments = 0
    skipped_drop_segments = 0
    guard_rails = 0
    stair_steps = 0
    rail_openings: list[dict[str, Any]] = []

    for link in seed["links"]:
        link_id = link["id"]
        points = [seed_point_to_blender(point) for point in link["waypointsMm"]]
        family = link["family"]
        modes = set(link["modes"])
        guide_material = material_for_family(materials, family)
        lifted_points = [point + Vector((0.0, 0.0, 0.12)) for point in points]
        make_polyline(
            name=f"G_LINK__{sanitize(link_id)}",
            points=lifted_points,
            collection=guide_collection,
            material=guide_material,
            bevel_depth=0.045 if "teleport" not in modes else 0.075,
        )

        if modes == {"teleport"}:
            skipped_teleport_segments += len(points) - 1
            continue
        if modes == {"drop"}:
            skipped_drop_segments += len(points) - 1
            continue

        width_mm = int(link["minimumClearWidthMm"])
        render_material = material_for_family(materials, family)
        for segment_index, (start, end) in enumerate(zip(points, points[1:])):
            direction = end - start
            raw_length_mm = direction.length * 1000.0
            proxy_length_mm = int(math.ceil(raw_length_mm)) + ROUTE_END_OVERLAP_MM
            rotation = route_rotation(direction)
            local_up = rotation @ Vector((0.0, 0.0, 1.0))
            location = (start + end) * 0.5 - local_up * mm_to_m(ROUTE_THICKNESS_MM) * 0.5
            stem = f"ROUTE__{sanitize(link_id)}__S{segment_index:02d}"
            add_box_pair(
                stem=stem,
                dimensions_mm=(proxy_length_mm, width_mm, ROUTE_THICKNESS_MM),
                location=location,
                rotation=rotation,
                render_collection=render_collection,
                collision_collection=collision_collection,
                render_material=render_material,
                collision_material=materials["collision"],
                source_kind="route_segment",
                source_id=link_id,
                seed_sha256=seed_sha256,
                extra={
                    "segment_index": segment_index,
                    "source_length_mm": round(raw_length_mm, 6),
                    "proxy_length_mm": proxy_length_mm,
                    "minimum_clear_width_mm": width_mm,
                    "modes": link["modes"],
                    "one_way": bool(link["oneWay"]),
                    "endpoint_a_mm": link["waypointsMm"][segment_index],
                    "endpoint_b_mm": link["waypointsMm"][segment_index + 1],
                    "overlap_mm": ROUTE_END_OVERLAP_MM,
                },
            )
            route_segments += 1

            # Segments steeper than the ordinary 20 degree ramp allowance use
            # deterministic stacked treads over the hidden support wedge.  The
            # tread contract is taken directly from the seed (<=250 mm rise,
            # >=500 mm run), so the accepted capsule never depends on a slope
            # that exceeds the authored movement allowance.
            horizontal = Vector((direction.x, direction.y, 0.0))
            slope_degrees = math.degrees(
                math.atan2(abs(direction.z), max(horizontal.length, 1e-9))
            )
            if slope_degrees > 20.0 and link.get("maximumStairRiseMm"):
                maximum_rise_mm = int(link["maximumStairRiseMm"])
                minimum_run_mm = int(link.get("minimumStairRunMm", 500))
                total_rise_mm = abs(direction.z) * 1000.0
                step_count = int(math.ceil(total_rise_mm / maximum_rise_mm))
                step_run_mm = horizontal.length * 1000.0 / step_count
                step_rise_mm = total_rise_mm / step_count
                if step_run_mm + 1e-6 < minimum_run_mm:
                    raise RuntimeError(
                        f"{link_id} segment {segment_index} stair run "
                        f"{step_run_mm:.3f} mm is below {minimum_run_mm} mm"
                    )
                low = start if start.z <= end.z else end
                high = end if start.z <= end.z else start
                horizontal_unit = Vector(
                    (high.x - low.x, high.y - low.y, 0.0)
                ).normalized()
                stair_yaw = math.degrees(
                    math.atan2(horizontal_unit.y, horizontal_unit.x)
                )
                stair_rotation = yaw_rotation(stair_yaw)
                base_z = low.z - mm_to_m(ROUTE_THICKNESS_MM)
                for step_index in range(step_count):
                    top_z = low.z + mm_to_m(step_rise_mm * (step_index + 1))
                    step_center = Vector(
                        (
                            low.x
                            + horizontal_unit.x
                            * mm_to_m(step_run_mm * (step_index + 0.5)),
                            low.y
                            + horizontal_unit.y
                            * mm_to_m(step_run_mm * (step_index + 0.5)),
                            (base_z + top_z) * 0.5,
                        )
                    )
                    step_height_mm = int(round((top_z - base_z) * 1000.0))
                    add_box_pair(
                        stem=(
                            f"STAIR__{sanitize(link_id)}__S{segment_index:02d}"
                            f"__T{step_index:02d}"
                        ),
                        dimensions_mm=(
                            int(math.ceil(step_run_mm)) + 20,
                            width_mm,
                            step_height_mm,
                        ),
                        location=step_center,
                        rotation=stair_rotation,
                        render_collection=render_collection,
                        collision_collection=collision_collection,
                        render_material=render_material,
                        collision_material=materials["collision"],
                        source_kind="stair_step",
                        source_id=link_id,
                        seed_sha256=seed_sha256,
                        extra={
                            "segment_index": segment_index,
                            "step_index": step_index,
                            "step_count": step_count,
                            "step_rise_mm": round(step_rise_mm, 6),
                            "step_run_mm": round(step_run_mm, 6),
                            "maximum_stair_rise_mm": maximum_rise_mm,
                            "minimum_stair_run_mm": minimum_run_mm,
                            "surface_class": "walkable_stair_tread",
                        },
                    )
                    stair_steps += 1

            # Every floating physical route receives two deliberate side guards.
            # Rails stop before each waypoint/node apron so converging routes do
            # not create accidental one-way traps at junctions.  The rail inner
            # faces begin at the seed's minimum-clear-width boundary, preserving
            # the full authored corridor width for the movement capsule.
            rail_length_mm = max(
                800,
                int(math.floor(raw_length_mm)) - 2 * GUARD_RAIL_END_CLEARANCE_MM,
            )
            local_side = rotation @ Vector((0.0, 1.0, 0.0))
            rail_center = (start + end) * 0.5
            for side_name, sign in (("LEFT", -1.0), ("RIGHT", 1.0)):
                opening_neighbor = ROUTE_RAIL_OPENINGS.get(
                    (link_id, segment_index, side_name.lower())
                )
                if opening_neighbor is not None:
                    rail_openings.append(
                        {
                            "linkId": link_id,
                            "segmentIndex": segment_index,
                            "side": side_name.lower(),
                            "neighborLinkId": opening_neighbor,
                            "edgePolicy": "physical_crosslink_opening",
                        }
                    )
                    continue
                rail_location = (
                    rail_center
                    + local_side
                    * sign
                    * mm_to_m((width_mm + GUARD_RAIL_THICKNESS_MM) / 2)
                    + local_up * mm_to_m(GUARD_RAIL_HEIGHT_MM / 2)
                )
                add_box_pair(
                    stem=(
                        f"GUARD_RAIL__{sanitize(link_id)}__S{segment_index:02d}"
                        f"__{side_name}"
                    ),
                    dimensions_mm=(
                        rail_length_mm,
                        GUARD_RAIL_THICKNESS_MM,
                        GUARD_RAIL_HEIGHT_MM,
                    ),
                    location=rail_location,
                    rotation=rotation,
                    render_collection=render_collection,
                    collision_collection=collision_collection,
                    render_material=materials["oxide"]
                    if family in {"drop", "crosslink"}
                    else materials["slate"],
                    collision_material=materials["collision"],
                    source_kind="route_guard_rail",
                    source_id=link_id,
                    seed_sha256=seed_sha256,
                    extra={
                        "segment_index": segment_index,
                        "guard_side": side_name.lower(),
                        "edge_policy": "guarded_except_junction_apron",
                        "clear_width_mm": width_mm,
                        "junction_apron_mm": GUARD_RAIL_END_CLEARANCE_MM,
                    },
                )
                guard_rails += 1

        for waypoint_index, waypoint in enumerate(points[1:-1], start=1):
            pad_width_mm = width_mm + WAYPOINT_PAD_OVERLAP_MM
            location = waypoint - Vector((0.0, 0.0, mm_to_m(ROUTE_THICKNESS_MM) * 0.5))
            stem = f"WAYPOINT__{sanitize(link_id)}__W{waypoint_index:02d}"
            add_box_pair(
                stem=stem,
                dimensions_mm=(pad_width_mm, pad_width_mm, ROUTE_THICKNESS_MM),
                location=location,
                rotation=identity_rotation(),
                render_collection=render_collection,
                collision_collection=collision_collection,
                render_material=render_material,
                collision_material=materials["collision"],
                source_kind="route_waypoint_seam",
                source_id=link_id,
                seed_sha256=seed_sha256,
                extra={
                    "waypoint_index": waypoint_index,
                    "waypoint_mm": link["waypointsMm"][waypoint_index],
                    "seam_overlap_mm": WAYPOINT_PAD_OVERLAP_MM,
                },
            )
            waypoint_pads += 1

    return {
        "routeSegments": route_segments,
        "waypointSeamPads": waypoint_pads,
        "skippedTeleportSegments": skipped_teleport_segments,
        "skippedDropSegments": skipped_drop_segments,
        "guardRails": guard_rails,
        "stairSteps": stair_steps,
        "railOpenings": rail_openings,
    }


NODE_PLATFORM_MM = {
    # Spawn anchors sit at X +/-33 m inside the +/-36 m seed bound.
    # Keep the +/-33 m anchors plus their whole proxy inside the +/-36 m seed.
    "spawn_anchor": (5500, 6000),
    "route_choice": (6000, 6000),
    "junction": (4400, 4400),
    "contest": (6000, 6000),
    "strong_position": (6000, 5000),
    "teleport_entry": (4000, 4000),
    "teleport_exit": (4000, 4000),
    "drop_start": (3200, 3200),
}


def add_node_platforms(
    *,
    seed: dict[str, Any],
    seed_sha256: str,
    render_collection: bpy.types.Collection,
    collision_collection: bpy.types.Collection,
    guide_collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> int:
    zone_by_id = {zone["id"]: zone for zone in seed["zones"]}
    count = 0
    for node in seed["nodes"]:
        width_mm, depth_mm = NODE_PLATFORM_MM[node["kind"]]
        location = seed_point_to_blender(node["positionMm"]) - Vector(
            (0.0, 0.0, mm_to_m(ROUTE_THICKNESS_MM) * 0.5)
        )
        family = zone_by_id[node["zoneId"]]["family"]
        add_box_pair(
            stem=f"NODE__{sanitize(node['id'])}",
            dimensions_mm=(width_mm, depth_mm, ROUTE_THICKNESS_MM),
            location=location,
            rotation=identity_rotation(),
            render_collection=render_collection,
            collision_collection=collision_collection,
            render_material=material_for_family(materials, family),
            collision_material=materials["collision"],
            source_kind="node_platform",
            source_id=node["id"],
            seed_sha256=seed_sha256,
            extra={
                "node_kind": node["kind"],
                "zone_id": node["zoneId"],
                "position_mm": node["positionMm"],
            },
        )
        make_ring(
            name=f"G_NODE__{sanitize(node['id'])}",
            center=seed_point_to_blender(node["positionMm"]),
            radius=max(width_mm, depth_mm) / 2500.0,
            height_offset=0.06,
            collection=guide_collection,
            material=materials["guide_dark"],
            segments=24,
        )
        count += 1
    return count


def add_authored_modules(
    *,
    seed_sha256: str,
    render_collection: bpy.types.Collection,
    collision_collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> list[dict[str, Any]]:
    """Add deterministic, explicitly hypothetical graybox cover/landmarks.

    These modules do not move seed nodes or route centerlines.  They are
    pre-playtest layout additions and remain subject to P6.6 revision.
    """

    records: list[dict[str, Any]] = []

    def module(
        module_id: str,
        *,
        center_seed_mm: tuple[int, int, int],
        dimensions_local_mm: tuple[int, int, int],
        yaw_degrees: float,
        material_key: str,
        module_class: str,
        intent: str,
        extra: dict[str, Any] | None = None,
    ) -> None:
        payload = {
            "layout_status": "HYPOTHESIS_PENDING_PLAYTEST",
            "module_class": module_class,
            "intent": intent,
            "center_seed_mm": center_seed_mm,
            "yaw_degrees": yaw_degrees,
        }
        if extra:
            payload.update(extra)
        add_box_pair(
            stem=f"MODULE__{sanitize(module_id)}",
            dimensions_mm=dimensions_local_mm,
            location=seed_point_to_blender(center_seed_mm),
            rotation=yaw_rotation(yaw_degrees),
            render_collection=render_collection,
            collision_collection=collision_collection,
            render_material=materials[material_key],
            collision_material=materials["collision"],
            source_kind="authored_graybox_module",
            source_id=module_id,
            seed_sha256=seed_sha256,
            extra=payload,
        )
        records.append(
            {
                "id": module_id,
                "class": module_class,
                "centerSeedMm": list(center_seed_mm),
                "dimensionsLocalMm": list(dimensions_local_mm),
                "yawDegrees": yaw_degrees,
                "status": "HYPOTHESIS_PENDING_PLAYTEST",
                "intent": intent,
            }
        )

    # Split print-reactor jaws: concept-guided silhouette only.  The 5.5 m
    # north/south central opening preserves the press_core seed node.
    module(
        "press_reactor_north",
        center_seed_mm=(0, 3000, 7500),
        dimensions_local_mm=(3400, 3000, 6000),
        yaw_degrees=0,
        material_key="paper",
        module_class="landmark_mass",
        intent="split-reactor north jaw; preserve centerline opening",
        extra={"concept_guidance_only": True, "central_opening_mm": 5500},
    )
    module(
        "press_reactor_south",
        center_seed_mm=(0, 3000, -7500),
        dimensions_local_mm=(3400, 3000, 6000),
        yaw_degrees=0,
        material_key="paper",
        module_class="landmark_mass",
        intent="split-reactor south jaw; preserve centerline opening",
        extra={"concept_guidance_only": True, "central_opening_mm": 5500},
    )

    # 5.0 x 3.0 x 0.5 m press baffles from the seed module contract.
    for module_id, center, yaw in (
        ("press_baffle_w_outer", (-10500, 1500, 5600), 18.0),
        ("press_baffle_w_inner", (-5200, 1500, -4700), -22.0),
        ("press_baffle_e_inner", (5200, 1500, -4700), 22.0),
        ("press_baffle_e_outer", (10500, 1500, 5600), -18.0),
    ):
        module(
            module_id,
            center_seed_mm=center,
            dimensions_local_mm=(5000, 500, 3000),
            yaw_degrees=yaw,
            material_key="slate",
            module_class="press_baffle",
            intent="break central diagonal sightlines without changing route centerlines",
            extra={"seed_module_dimensions_order": [5000, 3000, 500]},
        )

    # Full and half cover use exactly the module dimensions in the seed.
    for module_id, center, yaw in (
        ("full_cover_press_w", (-10000, 1200, -8000), 28.0),
        ("full_cover_press_e", (15500, 1200, 8000), -28.0),
        ("full_cover_archive_w", (-12500, 7200, 17200), 12.0),
        ("full_cover_archive_e", (12500, 7200, 17200), -12.0),
    ):
        module(
            module_id,
            center_seed_mm=center,
            dimensions_local_mm=(1800, 800, 2400),
            yaw_degrees=yaw,
            material_key="paper",
            module_class="full_cover",
            intent="hard line break with two-sided flank space",
            extra={"seed_module_dimensions_order": [1800, 2400, 800]},
        )
    for module_id, center, yaw in (
        ("half_cover_press_w", (-7000, 625, 6000), -18.0),
        ("half_cover_press_e", (7000, 625, -1700), 18.0),
        ("half_cover_ink_w", (-13000, -2375, -19800), 15.0),
        ("half_cover_ink_e", (14500, -2375, -16900), -15.0),
    ):
        module(
            module_id,
            center_seed_mm=center,
            dimensions_local_mm=(2400, 600, 1250),
            yaw_degrees=yaw,
            material_key="oxide",
            module_class="half_cover",
            intent="standing exposure with crouched protection",
            extra={"seed_module_dimensions_order": [2400, 1250, 600]},
        )

    # Slide/crouch gate aligned to the first Ink Fold approach segment.
    # Place the gate far enough beyond the three-way ink_mid_w apron that its
    # roof cannot clip the neighboring Ink Channel branch.  The chosen segment
    # is the second half of the same immutable movement-feature link.
    gate_start = seed_point_to_blender((-5000, -3000, -15000))
    gate_end = seed_point_to_blender((-4000, -3000, -10000))
    gate_direction = (gate_end - gate_start).normalized()
    gate_center = gate_start + gate_direction * 2.4
    gate_yaw = math.degrees(math.atan2(gate_direction.y, gate_direction.x))
    gate_side = Vector((-gate_direction.y, gate_direction.x, 0.0))
    clear_half_width_m = 0.7
    wall_half_width_m = 0.2
    wall_offset = clear_half_width_m + wall_half_width_m
    for side_name, sign in (("left", -1.0), ("right", 1.0)):
        center = (
            gate_center
            + gate_side * wall_offset * sign
            + Vector((0.0, 0.0, 0.8))
        )
        center_seed = (
            int(round(center.x * 1000.0)),
            int(round(center.z * 1000.0)),
            int(round(center.y * 1000.0)),
        )
        module(
            f"ink_slide_gate_{side_name}",
            center_seed_mm=center_seed,
            dimensions_local_mm=(4800, 400, 1600),
            yaw_degrees=gate_yaw,
            material_key="ink",
            module_class="slide_gate_wall",
            intent="bound the optional slide/crouch bypass",
            extra={"clear_width_mm": 1400, "clear_height_mm": 1350},
        )
    roof_center = gate_center + Vector((0.0, 0.0, 1.475))
    roof_center_seed = (
        int(round(roof_center.x * 1000.0)),
        int(round(roof_center.z * 1000.0)),
        int(round(roof_center.y * 1000.0)),
    )
    module(
        "ink_slide_gate_roof",
        center_seed_mm=roof_center_seed,
        dimensions_local_mm=(4800, 2200, 250),
        yaw_degrees=gate_yaw,
        material_key="ink",
        module_class="slide_gate_roof",
        intent="provide exact 1.35 m clear height over the optional bypass",
        extra={"clear_width_mm": 1400, "clear_height_mm": 1350},
    )

    # Red Fold landing guards sit outside the required 4 m landing diameter.
    for node_id, base in (
        ("entry", (-4000, -3000, -10000)),
        ("exit", (1000, 1000, -5000)),
    ):
        for side_name, x_offset in (("west", -2300), ("east", 2300)):
            module(
                f"red_fold_{node_id}_{side_name}",
                center_seed_mm=(base[0] + x_offset, base[1] + 1250, base[2]),
                dimensions_local_mm=(350, 800, 2500),
                yaw_degrees=0.0,
                material_key="oxide",
                module_class="teleport_guard",
                intent="frame the optional teleport without entering its 4 m landing diameter",
                extra={"landing_clear_diameter_mm": 4000},
            )

    return records


def add_playability_geometry(
    *,
    seed: dict[str, Any],
    seed_sha256: str,
    render_collection: bpy.types.Collection,
    collision_collection: bpy.types.Collection,
    guide_collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> dict[str, Any]:
    """Add seed-bounded support needed to evaluate the graph as a real arena.

    This pass does not alter the accepted P6.1 node/link topology.  It fills the
    physical omissions that made the first export a topology extrusion only:
    spawn-pocket support and occlusion, explicit transition frames, bounded
    fall edges, readable teleport/drop interfaces, and two optional jump gaps.
    """

    records: list[dict[str, Any]] = []
    counts: dict[str, int] = {
        "spawnPocketFloors": 0,
        "spawnPads": 0,
        "spawnEgressFloors": 0,
        "spawnPocketWalls": 0,
        "spawnSightBlockers": 0,
        "doorFrameParts": 0,
        "killBoundaryGuards": 0,
        "teleportBoundaryMarkers": 0,
        "dropBoundaryParts": 0,
        "jumpPads": 0,
        "jumpGapSideGuards": 0,
    }

    def blender_to_seed_mm(point: Vector) -> tuple[int, int, int]:
        return (
            int(round(point.x * 1000.0)),
            int(round(point.z * 1000.0)),
            int(round(point.y * 1000.0)),
        )

    def world_box(
        object_id: str,
        *,
        dimensions_mm: tuple[int, int, int],
        location: Vector,
        rotation,
        material_key: str,
        source_kind: str,
        module_class: str,
        intent: str,
        extra: dict[str, Any] | None = None,
    ) -> None:
        payload: dict[str, Any] = {
            "layout_status": "HYPOTHESIS_PENDING_RUNTIME_TAPES",
            "module_class": module_class,
            "intent": intent,
            "center_seed_mm": blender_to_seed_mm(location),
        }
        if extra:
            payload.update(extra)
        add_box_pair(
            stem=sanitize(object_id),
            dimensions_mm=dimensions_mm,
            location=location,
            rotation=rotation,
            render_collection=render_collection,
            collision_collection=collision_collection,
            render_material=materials[material_key],
            collision_material=materials["collision"],
            source_kind=source_kind,
            source_id=object_id.lower(),
            seed_sha256=seed_sha256,
            extra=payload,
        )
        records.append(
            {
                "id": object_id.lower(),
                "class": module_class,
                "sourceKind": source_kind,
                "centerSeedMm": list(blender_to_seed_mm(location)),
                "dimensionsLocalMm": list(dimensions_mm),
                "intent": intent,
                "status": "HYPOTHESIS_PENDING_RUNTIME_TAPES",
            }
        )

    def seed_box(
        object_id: str,
        *,
        center_seed_mm: tuple[int, int, int],
        dimensions_mm: tuple[int, int, int],
        yaw_degrees: float = 0.0,
        material_key: str,
        source_kind: str,
        module_class: str,
        intent: str,
        extra: dict[str, Any] | None = None,
    ) -> None:
        world_box(
            object_id,
            dimensions_mm=dimensions_mm,
            location=seed_point_to_blender(center_seed_mm),
            rotation=yaw_rotation(yaw_degrees),
            material_key=material_key,
            source_kind=source_kind,
            module_class=module_class,
            intent=intent,
            extra=extra,
        )

    def floor_segment(
        object_id: str,
        *,
        start_seed_mm: tuple[int, int, int],
        end_seed_mm: tuple[int, int, int],
        clear_width_mm: int,
        material_key: str,
        source_kind: str,
        add_side_guards: bool,
    ) -> None:
        start = seed_point_to_blender(start_seed_mm)
        end = seed_point_to_blender(end_seed_mm)
        direction = end - start
        raw_length_mm = direction.length * 1000.0
        rotation = route_rotation(direction)
        local_up = rotation @ Vector((0.0, 0.0, 1.0))
        local_side = rotation @ Vector((0.0, 1.0, 0.0))
        floor_length_mm = int(math.ceil(raw_length_mm)) + ROUTE_END_OVERLAP_MM
        world_box(
            f"PLAYABLE_FLOOR__{object_id}",
            dimensions_mm=(floor_length_mm, clear_width_mm, ROUTE_THICKNESS_MM),
            location=(start + end) * 0.5
            - local_up * mm_to_m(ROUTE_THICKNESS_MM / 2),
            rotation=rotation,
            material_key=material_key,
            source_kind=source_kind,
            module_class="capsule_support_surface",
            intent="continuous authored support from a spawn candidate to the seed graph",
            extra={
                "endpoint_a_mm": start_seed_mm,
                "endpoint_b_mm": end_seed_mm,
                "clear_width_mm": clear_width_mm,
                "surface_class": "walkable_floor",
            },
        )
        counts["spawnEgressFloors"] += 1
        if not add_side_guards:
            return
        rail_length_mm = max(
            800,
            int(math.floor(raw_length_mm)) - 2 * GUARD_RAIL_END_CLEARANCE_MM,
        )
        for side_name, sign in (("LEFT", -1.0), ("RIGHT", 1.0)):
            world_box(
                f"PLAYABLE_GUARD__{object_id}__{side_name}",
                dimensions_mm=(
                    rail_length_mm,
                    GUARD_RAIL_THICKNESS_MM,
                    GUARD_RAIL_HEIGHT_MM,
                ),
                location=(start + end) * 0.5
                + local_side
                * sign
                * mm_to_m((clear_width_mm + GUARD_RAIL_THICKNESS_MM) / 2)
                + local_up * mm_to_m(GUARD_RAIL_HEIGHT_MM / 2),
                rotation=rotation,
                material_key="oxide",
                source_kind="spawn_egress_guard_rail",
                module_class="guard_rail",
                intent="guard the deathmatch-candidate egress without narrowing capsule clearance",
                extra={
                    "guard_side": side_name.lower(),
                    "edge_policy": "guarded_except_junction_apron",
                    "clear_width_mm": clear_width_mm,
                },
            )

    def door_frame(
        frame_id: str,
        *,
        start_seed_mm: tuple[int, int, int],
        end_seed_mm: tuple[int, int, int],
        t: float,
        clear_width_mm: int,
        clear_height_mm: int,
    ) -> None:
        start = seed_point_to_blender(start_seed_mm)
        end = seed_point_to_blender(end_seed_mm)
        floor_center = start.lerp(end, t)
        horizontal = Vector((end.x - start.x, end.y - start.y, 0.0)).normalized()
        side = Vector((-horizontal.y, horizontal.x, 0.0))
        yaw = math.degrees(math.atan2(horizontal.y, horizontal.x))
        rotation = yaw_rotation(yaw)
        post_width_mm = 420
        frame_depth_mm = 420
        lintel_height_mm = 420
        total_height_mm = clear_height_mm + lintel_height_mm
        for side_name, sign in (("LEFT", -1.0), ("RIGHT", 1.0)):
            world_box(
                f"DOOR_FRAME__{frame_id}__{side_name}",
                dimensions_mm=(frame_depth_mm, post_width_mm, total_height_mm),
                location=floor_center
                + side
                * sign
                * mm_to_m((clear_width_mm + post_width_mm) / 2)
                + Vector((0.0, 0.0, mm_to_m(total_height_mm / 2))),
                rotation=rotation,
                material_key="paper",
                source_kind="authored_door_frame",
                module_class="door_frame_post",
                intent="legible transition frame outside the seed minimum-clear-width envelope",
                extra={
                    "frame_id": frame_id,
                    "clear_width_mm": clear_width_mm,
                    "clear_height_mm": clear_height_mm,
                    "frame_part": side_name.lower(),
                },
            )
            counts["doorFrameParts"] += 1
        world_box(
            f"DOOR_FRAME__{frame_id}__LINTEL",
            dimensions_mm=(
                frame_depth_mm,
                clear_width_mm + 2 * post_width_mm,
                lintel_height_mm,
            ),
            location=floor_center
            + Vector(
                (0.0, 0.0, mm_to_m(clear_height_mm + lintel_height_mm / 2))
            ),
            rotation=rotation,
            material_key="paper",
            source_kind="authored_door_frame",
            module_class="door_frame_lintel",
            intent="legible transition frame with explicit standing clearance",
            extra={
                "frame_id": frame_id,
                "clear_width_mm": clear_width_mm,
                "clear_height_mm": clear_height_mm,
                "frame_part": "lintel",
            },
        )
        counts["doorFrameParts"] += 1

    # Broad spawn pockets replace the first export's unsupported guide rings.
    # Every candidate also gets a small, explicit occupancy pad for validation.
    for side_name, x_mm in (("WEST", -32000), ("EAST", 32000)):
        seed_box(
            f"SPAWN_POCKET_FLOOR__{side_name}",
            center_seed_mm=(x_mm, -125, 0),
            dimensions_mm=(8000, 18000, ROUTE_THICKNESS_MM),
            material_key="spawn",
            source_kind="spawn_pocket_floor",
            module_class="capsule_support_surface",
            intent="continuous protected floor for all team spawn candidates and the spawn anchor",
            extra={"surface_class": "walkable_floor", "spawn_side": side_name.lower()},
        )
        counts["spawnPocketFloors"] += 1

        outer_x = -35750 if side_name == "WEST" else 35750
        seed_box(
            f"KILL_BOUNDARY_GUARD__{side_name}_BACK",
            center_seed_mm=(outer_x, 1500, 0),
            dimensions_mm=(500, 18000, 3000),
            material_key="ink",
            source_kind="kill_boundary_guard",
            module_class="spawn_pocket_wall",
            intent="hard seed-bounded backstop before the future P6.3 kill volume",
            extra={"edge_policy": "guarded", "future_volume": "P6.3_kill_boundary"},
        )
        counts["spawnPocketWalls"] += 1
        counts["killBoundaryGuards"] += 1

        for north_name, z_mm in (("SOUTH", -8750), ("NORTH", 8750)):
            seed_box(
                f"SPAWN_POCKET_WALL__{side_name}__{north_name}",
                center_seed_mm=(x_mm, 1500, z_mm),
                dimensions_mm=(8000, 500, 3000),
                material_key="ink",
                source_kind="spawn_pocket_wall",
                module_class="spawn_pocket_wall",
                intent="protect the pocket flank while leaving the inward route-choice face open",
                extra={"edge_policy": "guarded", "spawn_side": side_name.lower()},
            )
            counts["spawnPocketWalls"] += 1

        inward_x = -28750 if side_name == "WEST" else 28750
        for blocker_name, z_mm in (("INK", -4500), ("ARCHIVE", 4500)):
            seed_box(
                f"SPAWN_SIGHT_BLOCKER__{side_name}__{blocker_name}",
                center_seed_mm=(inward_x, 1200, z_mm),
                dimensions_mm=(500, 2500, 2400),
                material_key="slate",
                source_kind="spawn_sight_blocker",
                module_class="full_cover",
                intent="break direct exterior sight into the spawn while preserving a central escape",
                extra={"spawn_side": side_name.lower(), "edge_policy": "occlusion"},
            )
            counts["spawnSightBlockers"] += 1

    for spawn in seed["spawnCandidates"]:
        x_mm, floor_y_mm, z_mm = spawn["positionMm"]
        seed_box(
            f"SPAWN_PAD__{spawn['id']}",
            center_seed_mm=(x_mm, floor_y_mm - ROUTE_THICKNESS_MM // 2, z_mm),
            dimensions_mm=(1800, 1800, ROUTE_THICKNESS_MM),
            material_key="spawn",
            source_kind="spawn_candidate_pad",
            module_class="capsule_support_surface",
            intent="explicit capsule-sized occupancy support at the immutable seed candidate",
            extra={
                "surface_class": "walkable_floor",
                "spawn_id": spawn["id"],
                "spawn_set": spawn["set"],
            },
        )
        counts["spawnPads"] += 1

    # Deathmatch candidates are outside the broad team pockets; connect each
    # one to the nearest seed node with a guarded, capsule-clear spur.
    for egress_id, start, end, width, material_key in (
        ("DM_INK_W", (-27000, -3000, -22000), (-22000, -3000, -17000), 2200, "ink_channel"),
        ("DM_INK_E", (27000, -3000, -21000), (22000, -3000, -17000), 2200, "ink_channel"),
        ("DM_ARCHIVE_W", (-27000, 6000, 22000), (-22000, 6000, 17000), 2600, "archive_walk"),
        ("DM_ARCHIVE_E", (27000, 6000, 21000), (22000, 6000, 17000), 2600, "archive_walk"),
    ):
        floor_segment(
            egress_id,
            start_seed_mm=start,
            end_seed_mm=end,
            clear_width_mm=width,
            material_key=material_key,
            source_kind="spawn_egress_floor",
            add_side_guards=True,
        )

    # Transition frames communicate the six route-family choices in grayscale.
    link_by_id = {link["id"]: link for link in seed["links"]}
    for frame_id, link_id, reverse, t in (
        ("WEST_SPAWN_MAIN", "west_spawn_choice", False, 0.72),
        ("EAST_SPAWN_MAIN", "east_choice_spawn", True, 0.72),
        ("WEST_INK_ENTRY", "west_choice_ink", False, 0.28),
        ("EAST_INK_ENTRY", "ink_east_choice", True, 0.28),
        ("WEST_ARCHIVE_ENTRY", "west_choice_archive", False, 0.28),
        ("EAST_ARCHIVE_ENTRY", "archive_east_choice", True, 0.28),
    ):
        link = link_by_id[link_id]
        points = list(link["waypointsMm"])
        if reverse:
            points.reverse()
        door_frame(
            frame_id,
            start_seed_mm=tuple(points[0]),
            end_seed_mm=tuple(points[1]),
            t=t,
            clear_width_mm=int(link["minimumClearWidthMm"]),
            clear_height_mm=int(link["minimumClearHeightMm"]),
        )

    # Outer north/south hard guards make the world edge deliberate.  The
    # actual trigger/kill/recovery volumes remain explicitly assigned to P6.3.
    for boundary_id, center, dimensions in (
        ("INK_SOUTH", (0, -1750, -27750), (72000, 500, 2500)),
        ("ARCHIVE_NORTH", (0, 7100, 27750), (72000, 500, 2200)),
    ):
        seed_box(
            f"KILL_BOUNDARY_GUARD__{boundary_id}",
            center_seed_mm=center,
            dimensions_mm=dimensions,
            material_key="ink",
            source_kind="kill_boundary_guard",
            module_class="outer_boundary_wall",
            intent="legible collision backstop at the seed bound before P6.3 trigger volumes",
            extra={"edge_policy": "guarded", "future_volume": "P6.3_kill_boundary"},
        )
        counts["killBoundaryGuards"] += 1

    # Low corner markers stay outside each 4 m teleport landing circle and do
    # not occupy the incoming/outgoing centerline.
    node_by_id = {node["id"]: node for node in seed["nodes"]}
    teleport_marker_offsets = {
        # Keep the south approach to the entry and the north-east exit vector
        # open for a full standing capsule.
        "teleport_entry": (
            ("W", -2200, 0),
            ("E", 2200, 0),
            ("NW", -2200, 2200),
            ("NE", 2200, 2200),
        ),
        "teleport_exit": (
            ("W", -2200, 0),
            ("S", 0, -2200),
            ("SW", -2200, -2200),
            ("N", 0, 2200),
        ),
    }
    for node_id in ("teleport_entry", "teleport_exit"):
        x_mm, floor_y_mm, z_mm = node_by_id[node_id]["positionMm"]
        for corner_id, dx_mm, dz_mm in teleport_marker_offsets[node_id]:
            seed_box(
                f"TELEPORT_BOUNDARY__{node_id}__{corner_id}",
                center_seed_mm=(x_mm + dx_mm, floor_y_mm + 450, z_mm + dz_mm),
                dimensions_mm=(300, 300, 900),
                material_key="oxide",
                source_kind="teleport_boundary_marker",
                module_class="interaction_boundary_marker",
                intent="readable landing boundary outside the required clear circle",
                extra={
                    "edge_policy": "interaction_boundary",
                    "landing_clear_diameter_mm": 4000,
                    "node_id": node_id,
                },
            )
            counts["teleportBoundaryMarkers"] += 1

    # The Paper Drop is intentionally open only at the committed fall seam.
    drop_start = seed_point_to_blender((-5000, 6000, 10000))
    drop_target = seed_point_to_blender((-4000, 2500, 8000))
    drop_forward = Vector(
        (drop_target.x - drop_start.x, drop_target.y - drop_start.y, 0.0)
    ).normalized()
    drop_side = Vector((-drop_forward.y, drop_forward.x, 0.0))
    drop_yaw = math.degrees(math.atan2(drop_forward.y, drop_forward.x))
    for side_name, sign in (("LEFT", -1.0), ("RIGHT", 1.0)):
        world_box(
            f"DROP_BOUNDARY__PAPER_DROP__{side_name}",
            dimensions_mm=(1400, GUARD_RAIL_THICKNESS_MM, 1100),
            location=drop_start
            + drop_forward * 0.45
            + drop_side * sign * 1.08
            + Vector((0.0, 0.0, 0.55)),
            rotation=yaw_rotation(drop_yaw),
            material_key="oxide",
            source_kind="intentional_drop_guard",
            module_class="guard_rail",
            intent="guard the drop shoulders while leaving the center fall seam open",
            extra={
                "edge_policy": "intentional_fall_center_guarded_shoulders",
                "guard_side": side_name.lower(),
                "drop_link_id": "archive_drop_press_north",
            },
        )
        counts["dropBoundaryParts"] += 1
    make_polyline(
        name="G_INTENTIONAL_FALL__PAPER_DROP",
        points=[
            drop_start - drop_side * 0.9 + Vector((0.0, 0.0, 0.08)),
            drop_start + drop_side * 0.9 + Vector((0.0, 0.0, 0.08)),
        ],
        collection=guide_collection,
        material=materials["oxide"],
        bevel_depth=0.08,
    )

    # Explicit optional jump shortcuts.  Each pad begins on an existing seed
    # surface and terminates at a mathematically measured intentional gap.
    jump_gap_records: list[dict[str, Any]] = []

    def jump_gap(
        feature_id: str,
        *,
        start_seed_mm: tuple[int, int, int],
        end_seed_mm: tuple[int, int, int],
        target_gap_mm: int,
        pad_width_mm: int,
        material_key: str,
    ) -> None:
        start = seed_point_to_blender(start_seed_mm)
        end = seed_point_to_blender(end_seed_mm)
        direction = end - start
        distance_mm = direction.length * 1000.0
        pad_length_mm = int(round((distance_mm - target_gap_mm) / 2.0))
        if pad_length_mm < 800:
            raise RuntimeError(f"Jump feature {feature_id} cannot fit explicit pads")
        unit = direction.normalized()
        rotation = route_rotation(direction)
        local_up = rotation @ Vector((0.0, 0.0, 1.0))
        local_side = rotation @ Vector((0.0, 1.0, 0.0))
        actual_gap_mm = distance_mm - 2 * pad_length_mm
        pad_centers = (
            ("TAKEOFF", start + unit * mm_to_m(pad_length_mm / 2)),
            ("LANDING", end - unit * mm_to_m(pad_length_mm / 2)),
        )
        for pad_name, center in pad_centers:
            world_box(
                f"JUMP_PAD__{feature_id}__{pad_name}",
                dimensions_mm=(pad_length_mm, pad_width_mm, ROUTE_THICKNESS_MM),
                location=center - local_up * mm_to_m(ROUTE_THICKNESS_MM / 2),
                rotation=rotation,
                material_key=material_key,
                source_kind=(
                    "jump_takeoff_pad" if pad_name == "TAKEOFF" else "jump_landing_pad"
                ),
                module_class="capsule_support_surface",
                intent="optional movement-tool shortcut with an explicit non-bridged fall gap",
                extra={
                    "surface_class": "walkable_floor",
                    "edge_policy": "intentional_jump_gap",
                    "feature_id": feature_id,
                    "target_gap_mm": target_gap_mm,
                    "actual_gap_mm": round(actual_gap_mm, 6),
                    "walkaround_available": True,
                },
            )
            counts["jumpPads"] += 1
            rail_back_clearance_mm = min(5000, pad_length_mm - 400)
            rail_length_mm = max(400, pad_length_mm - rail_back_clearance_mm)
            # Leave the existing seed surface end of each optional pad open;
            # shift the side guards toward the intentional fall edge instead.
            toward_gap_sign = 1.0 if pad_name == "TAKEOFF" else -1.0
            for side_name, sign in (("LEFT", -1.0), ("RIGHT", 1.0)):
                world_box(
                    f"JUMP_GUARD__{feature_id}__{pad_name}__{side_name}",
                    dimensions_mm=(
                        rail_length_mm,
                        GUARD_RAIL_THICKNESS_MM,
                        GUARD_RAIL_HEIGHT_MM,
                    ),
                    location=center
                    + unit
                    * toward_gap_sign
                    * mm_to_m(rail_back_clearance_mm / 2)
                    + local_side
                    * sign
                    * mm_to_m((pad_width_mm + GUARD_RAIL_THICKNESS_MM) / 2)
                    + local_up * mm_to_m(GUARD_RAIL_HEIGHT_MM / 2),
                    rotation=rotation,
                    material_key="oxide",
                    source_kind="jump_gap_side_guard",
                    module_class="guard_rail",
                    intent="guard the jump approach sides without bridging the fall edge",
                    extra={
                        "edge_policy": "guarded_side_intentional_fall_front",
                        "feature_id": feature_id,
                        "pad_side": pad_name.lower(),
                        "guard_side": side_name.lower(),
                    },
                )
                counts["jumpGapSideGuards"] += 1

        edge_a = start + unit * mm_to_m(pad_length_mm)
        edge_b = end - unit * mm_to_m(pad_length_mm)
        for edge_name, edge in (("TAKEOFF", edge_a), ("LANDING", edge_b)):
            make_polyline(
                name=f"G_INTENTIONAL_JUMP_EDGE__{sanitize(feature_id)}__{edge_name}",
                points=[
                    edge - local_side * mm_to_m(pad_width_mm / 2)
                    + local_up * 0.08,
                    edge + local_side * mm_to_m(pad_width_mm / 2)
                    + local_up * 0.08,
                ],
                collection=guide_collection,
                material=materials["saffron"],
                bevel_depth=0.07,
            )
        jump_gap_records.append(
            {
                "featureId": feature_id,
                "targetGapMm": target_gap_mm,
                "actualGapMm": round(actual_gap_mm, 6),
                "padLengthMm": pad_length_mm,
                "padWidthMm": pad_width_mm,
                "edgePolicy": "intentional_jump_gap",
                "walkaroundAvailable": True,
            }
        )

    jump_gap(
        "press_gap_west",
        start_seed_mm=(-18000, 0, -1500),
        end_seed_mm=(-4000, 0, -2500),
        target_gap_mm=4200,
        pad_width_mm=2200,
        material_key="press_hall",
    )
    jump_gap(
        "archive_gap_east",
        start_seed_mm=(-8000, 6000, 20000),
        end_seed_mm=(8000, 6000, 16000),
        target_gap_mm=5200,
        pad_width_mm=2400,
        material_key="archive_walk",
    )

    return {
        "counts": counts,
        "records": records,
        "jumpGaps": jump_gap_records,
        "edgePolicy": {
            "physicalRouteEdges": "guarded_except_junction_aprons",
            "jumpGapEdges": "intentional_fall_with_guarded_sides",
            "paperDrop": "intentional_one_way_fall_with_guarded_shoulders",
            "teleport": "nonphysical_connector_with_clear_landing_markers",
            "outerBounds": "hard_guard_now_trigger_volume_in_P6.3",
        },
    }


def add_guides(
    *,
    seed: dict[str, Any],
    guide_collection: bpy.types.Collection,
    materials: dict[str, bpy.types.Material],
) -> dict[str, int]:
    zone_count = 0
    spawn_count = 0
    node_by_id = {node["id"]: node for node in seed["nodes"]}

    for zone in seed["zones"]:
        center = seed_point_to_blender(zone["centerMm"])
        half_x = mm_to_m(zone["halfExtentsMm"][0])
        half_north = mm_to_m(zone["halfExtentsMm"][2])
        floor_z = center.z + 0.08
        rectangle = [
            Vector((center.x - half_x, center.y - half_north, floor_z)),
            Vector((center.x + half_x, center.y - half_north, floor_z)),
            Vector((center.x + half_x, center.y + half_north, floor_z)),
            Vector((center.x - half_x, center.y + half_north, floor_z)),
        ]
        make_polyline(
            name=f"G_ZONE_BOUNDS__{sanitize(zone['id'])}",
            points=rectangle,
            collection=guide_collection,
            material=materials["guide_light"],
            bevel_depth=0.028,
            cyclic=True,
        )
        make_text(
            name=f"G_ZONE_LABEL__{sanitize(zone['id'])}",
            body=zone["callout"].upper(),
            location=center + Vector((0.0, 0.0, 0.12)),
            size=1.0,
            collection=guide_collection,
            material=materials["guide_dark"],
        )
        zone_count += 1

    for spawn in seed["spawnCandidates"]:
        center = seed_point_to_blender(spawn["positionMm"])
        make_ring(
            name=f"G_SPAWN__{sanitize(spawn['id'])}",
            center=center,
            radius=0.75,
            height_offset=0.10,
            collection=guide_collection,
            material=materials["saffron"],
            segments=20,
        )
        spawn_count += 1

    for feature in seed["movementFeatures"]:
        link_id = feature.get("linkId")
        if link_id is None:
            # The two gap records are sizing hypotheses without authored seed
            # anchors.  P6.2 must not invent positions for them.
            continue
        link = next(link for link in seed["links"] if link["id"] == link_id)
        point = seed_point_to_blender(link["waypointsMm"][0])
        make_text(
            name=f"G_FEATURE__{sanitize(feature['id'])}",
            body=feature["type"].replace("_", " ").upper(),
            location=point + Vector((0.0, 0.0, 0.18)),
            size=0.62,
            collection=guide_collection,
            material=materials["oxide"] if feature["type"] == "teleport" else materials["guide_dark"],
        )

    # Mark the 4 m teleport landing circles from the seed.
    for node_id in ("teleport_entry", "teleport_exit"):
        make_ring(
            name=f"G_TELEPORT_LANDING__{sanitize(node_id)}",
            center=seed_point_to_blender(node_by_id[node_id]["positionMm"]),
            radius=2.0,
            height_offset=0.13,
            collection=guide_collection,
            material=materials["oxide"],
            segments=40,
        )

    # Provisional 3 x 3 performance cells, guides only.
    bounds_min = seed["boundsMm"]["minimum"]
    bounds_max = seed["boundsMm"]["maximum"]
    for column in range(4):
        x_mm = bounds_min[0] + (bounds_max[0] - bounds_min[0]) * column / 3
        points = [
            seed_point_to_blender((x_mm, 40, bounds_min[2])),
            seed_point_to_blender((x_mm, 40, bounds_max[2])),
        ]
        make_polyline(
            name=f"G_CELL_COLUMN__{column}",
            points=points,
            collection=guide_collection,
            material=materials["guide_cell"],
            bevel_depth=0.018,
        )
    for row in range(4):
        z_mm = bounds_min[2] + (bounds_max[2] - bounds_min[2]) * row / 3
        points = [
            seed_point_to_blender((bounds_min[0], 40, z_mm)),
            seed_point_to_blender((bounds_max[0], 40, z_mm)),
        ]
        make_polyline(
            name=f"G_CELL_ROW__{row}",
            points=points,
            collection=guide_collection,
            material=materials["guide_cell"],
            bevel_depth=0.018,
        )

    return {"zones": zone_count, "spawnMarkers": spawn_count, "cellGuideLines": 8}


def create_stage(stage_collection: bpy.types.Collection) -> tuple[bpy.types.Object, list[bpy.types.Object]]:
    camera_data = bpy.data.cameras.new("P6_2_INSPECTION_CAMERA")
    camera = bpy.data.objects.new("P6_2_INSPECTION_CAMERA", camera_data)
    stage_collection.objects.link(camera)

    lights: list[bpy.types.Object] = []
    sun_data = bpy.data.lights.new("P6_2_KEY_SUN", type="SUN")
    sun_data.energy = 2.2
    sun_data.angle = math.radians(18.0)
    sun = bpy.data.objects.new("P6_2_KEY_SUN", sun_data)
    sun.rotation_euler = Euler((math.radians(38), math.radians(-22), math.radians(28)))
    stage_collection.objects.link(sun)
    lights.append(sun)

    for name, location, energy, size in (
        ("P6_2_FILL_NORTH", (0.0, 12.0, 35.0), 1800.0, 32.0),
        ("P6_2_FILL_SOUTH", (0.0, -16.0, 24.0), 1200.0, 26.0),
    ):
        light_data = bpy.data.lights.new(name, type="AREA")
        light_data.energy = energy
        light_data.shape = "DISK"
        light_data.size = size
        light = bpy.data.objects.new(name, light_data)
        light.location = location
        light.rotation_euler = Euler((0.0, 0.0, 0.0))
        stage_collection.objects.link(light)
        lights.append(light)

    return camera, lights


def look_at(camera: bpy.types.Object, target: Vector) -> None:
    direction = target - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def set_collection_render_state(
    *,
    render_collection: bpy.types.Collection,
    collision_collection: bpy.types.Collection,
    guide_collection: bpy.types.Collection,
    render_visible: bool,
    collision_visible: bool,
    guides_visible: bool,
) -> None:
    render_collection.hide_render = not render_visible
    collision_collection.hide_render = not collision_visible
    guide_collection.hide_render = not guides_visible


def render_preview(
    *,
    scene: bpy.types.Scene,
    camera: bpy.types.Object,
    output_path: Path,
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    camera_type: str,
    ortho_scale: float | None,
    render_collection: bpy.types.Collection,
    collision_collection: bpy.types.Collection,
    guide_collection: bpy.types.Collection,
    render_visible: bool,
    collision_visible: bool,
    guides_visible: bool,
) -> None:
    set_collection_render_state(
        render_collection=render_collection,
        collision_collection=collision_collection,
        guide_collection=guide_collection,
        render_visible=render_visible,
        collision_visible=collision_visible,
        guides_visible=guides_visible,
    )
    camera.location = Vector(location)
    camera.data.type = camera_type
    if ortho_scale is not None:
        camera.data.ortho_scale = ortho_scale
    else:
        camera.data.lens = 48.0
    look_at(camera, Vector(target))
    scene.camera = camera
    scene.render.filepath = str(output_path)
    bpy.ops.render.render(write_still=True)


def export_selected_glb(path: Path, objects: list[bpy.types.Object]) -> dict[str, Any]:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    operator_properties = {
        prop.identifier for prop in bpy.ops.export_scene.gltf.get_rna_type().properties
    }
    candidate_kwargs: dict[str, Any] = {
        "filepath": str(path),
        "export_format": "GLB",
        "use_selection": True,
        "export_extras": True,
        "export_yup": True,
        "export_apply": True,
        "export_materials": "EXPORT",
        "export_cameras": False,
        "export_lights": False,
        "export_animations": False,
    }
    kwargs = {
        key: value for key, value in candidate_kwargs.items() if key in operator_properties
    }
    result = bpy.ops.export_scene.gltf(**kwargs)
    if "FINISHED" not in result:
        raise RuntimeError(f"GLB export failed for {path}: {result}")
    return {"operatorArguments": kwargs, "result": sorted(result)}


def object_mesh_stats(objects: list[bpy.types.Object]) -> dict[str, int]:
    vertices = sum(len(obj.data.vertices) for obj in objects if obj.type == "MESH")
    polygons = sum(len(obj.data.polygons) for obj in objects if obj.type == "MESH")
    triangles = sum(
        sum(max(0, len(polygon.vertices) - 2) for polygon in obj.data.polygons)
        for obj in objects
        if obj.type == "MESH"
    )
    materials = {
        material.name
        for obj in objects
        if obj.type == "MESH"
        for material in obj.data.materials
        if material is not None
    }
    return {
        "objects": len(objects),
        "meshes": sum(1 for obj in objects if obj.type == "MESH"),
        "vertices": vertices,
        "polygons": polygons,
        "triangles": triangles,
        "materials": len(materials),
    }


def world_aabb(objects: list[bpy.types.Object]) -> dict[str, list[float]]:
    minimum = Vector((math.inf, math.inf, math.inf))
    maximum = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        for corner in obj.bound_box:
            world_corner = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                minimum[axis] = min(minimum[axis], world_corner[axis])
                maximum[axis] = max(maximum[axis], world_corner[axis])
    return {
        "minimumBlenderMeters": [round(value, 6) for value in minimum],
        "maximumBlenderMeters": [round(value, 6) for value in maximum],
    }


def build() -> None:
    args = parse_args()
    seed_path = Path(args.seed).resolve()
    output_root = Path(args.output_root).resolve()
    paths = BuildPaths(
        root=output_root,
        source_dir=output_root / "source",
        export_dir=output_root / "export",
        preview_dir=output_root / "preview",
        validation_dir=output_root / "validation",
        source_blend=output_root / "source" / "inkfall_foundry.blend",
        render_glb=output_root / "export" / "render.graybox.glb",
        collision_glb=output_root / "export" / "collision.authority.glb",
        build_report=output_root / "validation" / "graybox-build-report.json",
    )
    for directory in (
        paths.source_dir,
        paths.export_dir,
        paths.preview_dir,
        paths.validation_dir,
    ):
        directory.mkdir(parents=True, exist_ok=True)

    seed_bytes = seed_path.read_bytes()
    seed_sha256 = hashlib.sha256(seed_bytes).hexdigest()
    if seed_sha256 != EXPECTED_SEED_SHA256:
        raise RuntimeError(
            f"Seed SHA mismatch: expected {EXPECTED_SEED_SHA256}, got {seed_sha256}"
        )
    seed = json.loads(seed_bytes.decode("utf-8"))
    if seed["mapId"] != "inkfall_foundry" or seed["schemaVersion"] != 1:
        raise RuntimeError("Unsupported seed identity")

    clear_scene()
    scene = bpy.context.scene
    scene.name = "INKFALL_FOUNDRY_P6_2"
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene["kyx_scope"] = SCOPE
    scene["kyx_generator_id"] = GENERATOR_ID
    scene["kyx_generator_version"] = GENERATOR_VERSION
    scene["kyx_seed_sha256"] = seed_sha256
    scene["kyx_seed_map_id"] = seed["mapId"]
    scene["kyx_runtime_integrated"] = False
    scene["kyx_g5_passed"] = False
    scene["kyx_g6_passed"] = False
    scene["kyx_coordinate_transform"] = "seed[x,y_up,z_north]_mm=>blender[x,z_north,y_up]_m"

    render_collection = make_collection(COLLECTION_RENDER)
    collision_collection = make_collection(COLLECTION_COLLISION)
    guide_collection = make_collection(COLLECTION_GUIDES)
    stage_collection = make_collection(COLLECTION_STAGE)

    materials = {
        "spawn": make_material("M_GB_SPAWN", (0.43, 0.50, 0.44, 1.0)),
        "press_hall": make_material("M_GB_PRESS", (0.82, 0.78, 0.69, 1.0)),
        "ink_channel": make_material("M_GB_INK_ROUTE", (0.11, 0.14, 0.20, 1.0)),
        "archive_walk": make_material("M_GB_ARCHIVE", (0.48, 0.54, 0.62, 1.0)),
        "crosslink": make_material("M_GB_CROSSLINK", (0.65, 0.48, 0.26, 1.0)),
        "teleport": make_material(
            "M_GB_TELEPORT", (0.72, 0.12, 0.07, 1.0), emission_strength=0.12
        ),
        "drop": make_material("M_GB_DROP", (0.54, 0.28, 0.12, 1.0)),
        "paper": make_material("M_GB_PAPER", (0.91, 0.86, 0.76, 1.0)),
        "slate": make_material("M_GB_SLATE", (0.22, 0.27, 0.34, 1.0), metallic=0.08),
        "ink": make_material("M_GB_INK", (0.045, 0.06, 0.09, 1.0)),
        "oxide": make_material("M_GB_OXIDE", (0.75, 0.16, 0.09, 1.0)),
        "saffron": make_material(
            "M_GB_SAFFRON", (0.92, 0.55, 0.08, 1.0), emission_strength=0.18
        ),
        "collision": make_material(
            "M_COLLISION_AUTHORITY", (0.03, 0.78, 0.73, 1.0), metallic=0.05
        ),
        "guide_dark": make_material("M_GUIDE_DARK", (0.015, 0.02, 0.03, 1.0)),
        "guide_light": make_material("M_GUIDE_LIGHT", (0.94, 0.89, 0.79, 1.0)),
        "guide_cell": make_material("M_GUIDE_CELL", (0.23, 0.62, 0.66, 1.0)),
    }

    route_counts = add_route_geometry(
        seed=seed,
        seed_sha256=seed_sha256,
        render_collection=render_collection,
        collision_collection=collision_collection,
        guide_collection=guide_collection,
        materials=materials,
    )
    scene["kyx_route_rail_openings"] = json.dumps(
        route_counts["railOpenings"], separators=(",", ":"), sort_keys=True
    )
    node_count = add_node_platforms(
        seed=seed,
        seed_sha256=seed_sha256,
        render_collection=render_collection,
        collision_collection=collision_collection,
        guide_collection=guide_collection,
        materials=materials,
    )
    module_records = add_authored_modules(
        seed_sha256=seed_sha256,
        render_collection=render_collection,
        collision_collection=collision_collection,
        materials=materials,
    )
    playability_geometry = add_playability_geometry(
        seed=seed,
        seed_sha256=seed_sha256,
        render_collection=render_collection,
        collision_collection=collision_collection,
        guide_collection=guide_collection,
        materials=materials,
    )
    guide_counts = add_guides(
        seed=seed,
        guide_collection=guide_collection,
        materials=materials,
    )
    camera, _lights = create_stage(stage_collection)

    scene.world = bpy.data.worlds.new("P6_2_WORLD")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (0.035, 0.045, 0.065, 1.0)
        background.inputs["Strength"].default_value = 0.38

    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.render.use_file_extension = True
    scene.render.filepath = str(paths.preview_dir / "inkfall-graybox-overview.png")
    scene.render.image_settings.color_depth = "8"
    scene.render.image_settings.compression = 20

    render_objects = sorted(
        [obj for obj in render_collection.objects if obj.type == "MESH"],
        key=lambda obj: obj.name,
    )
    collision_objects = sorted(
        [obj for obj in collision_collection.objects if obj.type == "MESH"],
        key=lambda obj: obj.name,
    )
    if not render_objects or not collision_objects:
        raise RuntimeError("Expected non-empty render and collision collections")
    render_pair_names = {obj.name.removeprefix("R_") for obj in render_objects}
    collision_pair_names = {obj.name.removeprefix("C_") for obj in collision_objects}
    if render_pair_names != collision_pair_names:
        raise RuntimeError("Render/collision object pairing diverged")
    if any(
        len(obj.data.vertices) != 8 or len(obj.data.polygons) != 6
        for obj in collision_objects
    ):
        raise RuntimeError("Authoritative collision contains a non-box mesh")

    set_collection_render_state(
        render_collection=render_collection,
        collision_collection=collision_collection,
        guide_collection=guide_collection,
        render_visible=True,
        collision_visible=False,
        guides_visible=True,
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(paths.source_blend), compress=True)

    render_export = export_selected_glb(paths.render_glb, render_objects)
    collision_export = export_selected_glb(paths.collision_glb, collision_objects)

    preview_specs = [
        {
            "file": "inkfall-graybox-overview.png",
            "location": (63.0, -68.0, 52.0),
            "target": (0.0, 0.0, 1.5),
            "camera_type": "PERSP",
            "ortho_scale": None,
            "render_visible": True,
            "collision_visible": False,
            "guides_visible": True,
        },
        {
            "file": "inkfall-graybox-plan.png",
            "location": (0.0, 0.0, 92.0),
            "target": (0.0, 0.0, 0.0),
            "camera_type": "ORTHO",
            "ortho_scale": 82.0,
            "render_visible": True,
            "collision_visible": False,
            "guides_visible": True,
        },
        {
            "file": "inkfall-collision-overview.png",
            "location": (63.0, -68.0, 52.0),
            "target": (0.0, 0.0, 1.5),
            "camera_type": "PERSP",
            "ortho_scale": None,
            "render_visible": False,
            "collision_visible": True,
            "guides_visible": False,
        },
        {
            "file": "inkfall-tier-elevation.png",
            "location": (0.0, -88.0, 18.0),
            "target": (0.0, 0.0, 1.5),
            "camera_type": "ORTHO",
            "ortho_scale": 78.0,
            "render_visible": True,
            "collision_visible": False,
            "guides_visible": False,
        },
        {
            "file": "inkfall-spawn-pocket-west.png",
            "location": (-48.0, -27.0, 16.0),
            "target": (-31.5, 0.0, 1.0),
            "camera_type": "PERSP",
            "ortho_scale": None,
            "render_visible": True,
            "collision_visible": False,
            "guides_visible": True,
        },
        {
            "file": "inkfall-movement-features.png",
            "location": (22.0, -46.0, 30.0),
            "target": (-3.0, -4.0, 2.5),
            "camera_type": "PERSP",
            "ortho_scale": None,
            "render_visible": True,
            "collision_visible": False,
            "guides_visible": True,
        },
    ]
    for preview in preview_specs:
        render_preview(
            scene=scene,
            camera=camera,
            output_path=paths.preview_dir / preview["file"],
            location=preview["location"],
            target=preview["target"],
            camera_type=preview["camera_type"],
            ortho_scale=preview["ortho_scale"],
            render_collection=render_collection,
            collision_collection=collision_collection,
            guide_collection=guide_collection,
            render_visible=preview["render_visible"],
            collision_visible=preview["collision_visible"],
            guides_visible=preview["guides_visible"],
        )

    set_collection_render_state(
        render_collection=render_collection,
        collision_collection=collision_collection,
        guide_collection=guide_collection,
        render_visible=True,
        collision_visible=False,
        guides_visible=True,
    )

    artifacts = {
        "sourceBlend": paths.source_blend,
        "renderGlb": paths.render_glb,
        "collisionGlb": paths.collision_glb,
        **{
            f"preview:{preview['file']}": paths.preview_dir / preview["file"]
            for preview in preview_specs
        },
    }
    artifact_records = {
        key: {
            "path": str(path.relative_to(paths.root)).replace("\\", "/"),
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
        }
        for key, path in artifacts.items()
    }

    assertions = [
        {
            "id": "seed_sha_matches_approved_p6_1",
            "passed": seed_sha256 == EXPECTED_SEED_SHA256,
        },
        {
            "id": "seed_identity_supported",
            "passed": seed["mapId"] == "inkfall_foundry" and seed["schemaVersion"] == 1,
        },
        {
            "id": "seed_topology_counts_preserved",
            "passed": len(seed["zones"]) == 9
            and len(seed["nodes"]) == 19
            and len(seed["links"]) == 27,
        },
        {
            "id": "render_collision_pair_sets_equal",
            "passed": render_pair_names == collision_pair_names,
        },
        {
            "id": "collision_boxes_only",
            "passed": all(
                len(obj.data.vertices) == 8 and len(obj.data.polygons) == 6
                for obj in collision_objects
            ),
        },
        {
            "id": "collision_roles_authoritative_only",
            "passed": all(
                obj.get("kyx_role") == "authoritative_collider"
                for obj in collision_objects
            ),
        },
        {
            "id": "render_roles_graybox_only",
            "passed": all(obj.get("kyx_role") == "render_graybox" for obj in render_objects),
        },
        {
            "id": "separate_exports_exist_and_differ",
            "passed": paths.render_glb.exists()
            and paths.collision_glb.exists()
            and sha256_file(paths.render_glb) != sha256_file(paths.collision_glb),
        },
        {
            "id": "no_runtime_or_gate_claim",
            "passed": scene["kyx_runtime_integrated"] is False
            and scene["kyx_g5_passed"] is False
            and scene["kyx_g6_passed"] is False,
        },
    ]
    if not all(assertion["passed"] for assertion in assertions):
        raise RuntimeError("One or more build assertions failed")

    report = {
        "schemaVersion": 1,
        "generator": {
            "id": GENERATOR_ID,
            "version": GENERATOR_VERSION,
            "script": Path(__file__).name,
            "scriptSha256": sha256_file(Path(__file__).resolve()),
            "blenderVersion": bpy.app.version_string,
        },
        "scope": {
            "phase": "P6.2",
            "status": "PLAYABLE_GRAYBOX_CANDIDATE_PENDING_INDEPENDENT_CAPSULE_VALIDATION",
            "runtimeIntegrated": False,
            "g5Passed": False,
            "g6Passed": False,
            "artStatus": "graybox_only",
            "conceptUse": "material_landmark_and_camera_guidance_only",
        },
        "seed": {
            "path": seed_path.name,
            "bytes": len(seed_bytes),
            "sha256": seed_sha256,
            "expectedSha256": EXPECTED_SEED_SHA256,
            "mapId": seed["mapId"],
            "schemaVersion": seed["schemaVersion"],
            "boundsMm": seed["boundsMm"],
            "counts": {
                "zones": len(seed["zones"]),
                "nodes": len(seed["nodes"]),
                "links": len(seed["links"]),
                "spawnCandidates": len(seed["spawnCandidates"]),
                "routeMetrics": len(seed["routeMetrics"]),
            },
        },
        "coordinateTransform": {
            "seed": "right-handed project map seed; X east, Y up, Z north; millimeters",
            "blender": "X east, Y north, Z up; meters",
            "formula": "[x,y,z]mm => [x/1000,z/1000,y/1000]m",
        },
        "collections": {
            "render": COLLECTION_RENDER,
            "collision": COLLECTION_COLLISION,
            "guides": COLLECTION_GUIDES,
            "previewStage": COLLECTION_STAGE,
        },
        "geometry": {
            **route_counts,
            "nodePlatforms": node_count,
            "authoredModuleCount": len(module_records),
            "authoredModules": module_records,
            "playabilityGeometry": playability_geometry,
            "guides": guide_counts,
            "renderStats": object_mesh_stats(render_objects),
            "collisionStats": object_mesh_stats(collision_objects),
            "collisionWorldAabb": world_aabb(collision_objects),
            "collisionPolicy": {
                "primitive": "oriented convex boxes only",
                "routeThicknessMm": ROUTE_THICKNESS_MM,
                "routeEndOverlapMm": ROUTE_END_OVERLAP_MM,
                "waypointPadOverlapMm": WAYPOINT_PAD_OVERLAP_MM,
                "guardRailThicknessMm": GUARD_RAIL_THICKNESS_MM,
                "guardRailHeightMm": GUARD_RAIL_HEIGHT_MM,
                "guardRailEndClearanceMm": GUARD_RAIL_END_CLEARANCE_MM,
                "acceptedCapsuleRadiusWithSkinMm": CAPSULE_RADIUS_WITH_SKIN_MM,
                "decorativeBevelsInAuthority": False,
                "teleportConnectorInCollision": False,
                "oneWayDropRampInCollision": False,
            },
        },
        "exports": {
            "render": render_export,
            "collision": collision_export,
            "artifacts": artifact_records,
        },
        "assertions": assertions,
        "result": "PASS" if all(item["passed"] for item in assertions) else "FAIL",
        "remainingP6Blockers": [
            "P6.3 strict runtime map schema and loader",
            "P6.3 authoritative spawns, pickups, zones, kill and recovery volumes",
            "P6.4 spawn scoring, LOS fixtures, and debug visualization",
            "P6.5 route, death, damage, sightline, and occupancy telemetry",
            "P6.6 authoritative run/jump/slide/teleport tapes and 2/4/8-player playtests",
            "P6.7 topology/spawn revision, graybox lock, and art-kit dimensions",
            "G5 final-art room and complete independent runtime package",
        ],
    }
    stable_write_json(paths.build_report, report)
    print(json.dumps({"result": report["result"], "report": str(paths.build_report)}))


if __name__ == "__main__":
    build()
