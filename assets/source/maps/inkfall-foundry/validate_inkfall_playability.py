"""Independent offline capsule validator for the Inkfall Foundry P6.2 graybox.

This script deliberately does not import the builder.  It opens the saved Blend,
reads only the immutable P6.1 seed plus collider metadata, and evaluates physical
support, capsule clearance, stairs, edge policy, spawn occupancy, movement-tool
boundaries, world bounds, and render/collision artifact separation.

It proves Blender-space graybox geometry only.  Runtime loading, authoritative
physics integration, playtest fun/readability, spawn LOS, and G5 remain later work.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Any, Iterable

import bpy
from mathutils import Vector


EXPECTED_SEED_SHA256 = "562c5ea8711a1eb1f4a08a31c8872c68c23778aa159110a107c9da0b74e67a63"
COLLECTION_COLLISION = "P6_2_AUTHORITATIVE_COLLISION"
CAPSULE_RADIUS_MM = 350
CAPSULE_SKIN_MM = 20
CAPSULE_RADIUS_WITH_SKIN_M = (CAPSULE_RADIUS_MM + CAPSULE_SKIN_MM) / 1000.0
STANDING_HEIGHT_M = 1.8
CROUCHED_HEIGHT_M = 1.1
SAMPLE_SPACING_M = 0.25
ORDINARY_RAMP_LIMIT_DEGREES = 20.0
SUPPORT_KINDS = {
    "route_segment",
    "route_waypoint_seam",
    "node_platform",
    "stair_step",
    "spawn_pocket_floor",
    "spawn_candidate_pad",
    "spawn_egress_floor",
    "jump_takeoff_pad",
    "jump_landing_pad",
    "bounded_authority_drop_landing_runout",
    "bounded_authority_drop_launch_runout",
    "bounded_authority_terminal_support",
    "bounded_teleport_landing_support",
}


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", required=True)
    parser.add_argument("--output-root", required=True)
    parser.add_argument(
        "--artifact-report",
        default="validation/graybox-artifact-validation.json",
    )
    parser.add_argument("--artifact-status", default="PASS")
    parser.add_argument("--build-report", default="validation/graybox-build-report.json")
    parser.add_argument(
        "--output-report",
        default="validation/playable-surface-validation.json",
    )
    parser.add_argument("--runtime-manifest")
    parser.add_argument("--continuous-ramp-link", action="append", default=[])
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


def seed_to_blender(position_mm: Iterable[float | int]) -> Vector:
    x_mm, y_mm, z_mm = position_mm
    return Vector((x_mm / 1000.0, z_mm / 1000.0, y_mm / 1000.0))


def assertion(
    assertions: list[dict[str, Any]],
    assertion_id: str,
    passed: bool,
    **details: Any,
) -> None:
    record: dict[str, Any] = {"id": assertion_id, "passed": bool(passed)}
    record.update(details)
    assertions.append(record)


def object_dimensions_mm(obj: bpy.types.Object) -> list[int]:
    return list(json.loads(obj["kyx_dimensions_mm"]))


def object_aabb(obj: bpy.types.Object) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return (
        Vector(tuple(min(corner[axis] for corner in corners) for axis in range(3))),
        Vector(tuple(max(corner[axis] for corner in corners) for axis in range(3))),
    )


def sphere_intersects_obb(
    center: Vector,
    radius: float,
    obj: bpy.types.Object,
    *,
    tolerance: float = 1e-5,
) -> bool:
    local = obj.matrix_world.inverted() @ center
    local_corners = [Vector(corner) for corner in obj.bound_box]
    minimum = Vector(
        tuple(min(corner[axis] for corner in local_corners) for axis in range(3))
    )
    maximum = Vector(
        tuple(max(corner[axis] for corner in local_corners) for axis in range(3))
    )
    closest = Vector(
        tuple(max(minimum[axis], min(maximum[axis], local[axis])) for axis in range(3))
    )
    return (local - closest).length_squared < (radius - tolerance) ** 2


def capsule_obstructions(
    feet: Vector,
    height_m: float,
    collision_objects: list[bpy.types.Object],
    *,
    object_allowlist: set[str] | None = None,
) -> list[str]:
    """Approximate an upright capsule as dense spheres along its medial axis."""

    allowlist = object_allowlist or set()
    radius = CAPSULE_RADIUS_WITH_SKIN_M
    axis_bottom = feet.z + radius
    axis_top = feet.z + height_m - radius
    sphere_count = max(2, int(math.ceil((axis_top - axis_bottom) / 0.10)) + 1)
    sphere_centers = [
        Vector(
            (
                feet.x,
                feet.y,
                axis_bottom
                + (axis_top - axis_bottom) * index / max(sphere_count - 1, 1),
            )
        )
        for index in range(sphere_count)
    ]
    hits: list[str] = []
    capsule_min = Vector((feet.x - radius, feet.y - radius, feet.z))
    capsule_max = Vector((feet.x + radius, feet.y + radius, feet.z + height_m))
    for obj in collision_objects:
        if obj.name in allowlist or obj.get("kyx_source_kind") in SUPPORT_KINDS:
            continue
        obj_min, obj_max = object_aabb(obj)
        if any(
            capsule_max[axis] < obj_min[axis] or capsule_min[axis] > obj_max[axis]
            for axis in range(3)
        ):
            continue
        if any(sphere_intersects_obb(center, radius, obj) for center in sphere_centers):
            hits.append(obj.name)
    return sorted(hits)


def support_footprint_on_box(
    obj: bpy.types.Object,
    feet: Vector,
    side: Vector,
    *,
    radius_m: float,
    tolerance_m: float = 0.004,
) -> bool:
    inverse = obj.matrix_world.inverted()
    local_corners = [Vector(corner) for corner in obj.bound_box]
    minimum = Vector(
        tuple(min(corner[axis] for corner in local_corners) for axis in range(3))
    )
    maximum = Vector(
        tuple(max(corner[axis] for corner in local_corners) for axis in range(3))
    )
    for offset in (-radius_m, 0.0, radius_m):
        local = inverse @ (feet + side * offset)
        if not (
            minimum.x - tolerance_m <= local.x <= maximum.x + tolerance_m
            and minimum.y - tolerance_m <= local.y <= maximum.y + tolerance_m
            and abs(local.z - maximum.z) <= tolerance_m
        ):
            return False
    return True


def colliders_inside_seed_bounds(
    objects: list[bpy.types.Object], seed: dict[str, Any]
) -> tuple[bool, list[dict[str, Any]]]:
    minimum = seed_to_blender(seed["boundsMm"]["minimum"])
    maximum = seed_to_blender(seed["boundsMm"]["maximum"])
    failures: list[dict[str, Any]] = []
    for obj in objects:
        obj_min, obj_max = object_aabb(obj)
        if any(
            obj_min[axis] < minimum[axis] - 0.001
            or obj_max[axis] > maximum[axis] + 0.001
            for axis in range(3)
        ):
            failures.append(
                {
                    "object": obj.name,
                    "minimum": [round(value, 6) for value in obj_min],
                    "maximum": [round(value, 6) for value in obj_max],
                }
            )
    return not failures, failures


def physical_link_sweep(
    link: dict[str, Any],
    collision_objects: list[bpy.types.Object],
    continuous_ramp_links: set[str],
) -> dict[str, Any]:
    failures: list[dict[str, Any]] = []
    sample_count = 0
    crouched_samples = 0
    standing_samples = 0
    maximum_slope_degrees = 0.0
    stair_segments: list[dict[str, Any]] = []
    continuous_ramp_segments: list[dict[str, Any]] = []

    points = [seed_to_blender(point) for point in link["waypointsMm"]]
    for segment_index, (start, end) in enumerate(zip(points, points[1:])):
        direction = end - start
        length_m = direction.length
        horizontal_length_m = Vector((direction.x, direction.y, 0.0)).length
        slope_degrees = math.degrees(
            math.atan2(abs(direction.z), max(horizontal_length_m, 1e-9))
        )
        maximum_slope_degrees = max(maximum_slope_degrees, slope_degrees)
        segment_name = f"C_ROUTE__{sanitize(link['id'])}__S{segment_index:02d}"
        segment_obj = bpy.data.objects.get(segment_name)
        if segment_obj is None:
            failures.append(
                {"kind": "missing_route_segment", "segment": segment_index, "object": segment_name}
            )
            continue
        local_side = segment_obj.matrix_world.to_quaternion() @ Vector((0.0, 1.0, 0.0))

        stairs = sorted(
            [
                obj
                for obj in collision_objects
                if obj.get("kyx_source_kind") == "stair_step"
                and obj.get("kyx_source_id") == link["id"]
                and int(obj.get("kyx_segment_index", -1)) == segment_index
            ],
            key=lambda obj: int(obj.get("kyx_step_index", -1)),
        )
        if slope_degrees > ORDINARY_RAMP_LIMIT_DEGREES:
            if not stairs:
                if link["id"] in continuous_ramp_links:
                    continuous_ramp_segments.append(
                        {
                            "segment": segment_index,
                            "slopeDegrees": round(slope_degrees, 6),
                            "policy": "explicit_bounded_collision_revision_exception",
                        }
                    )
                else:
                    failures.append(
                        {
                            "kind": "steep_segment_without_stairs",
                            "segment": segment_index,
                            "slopeDegrees": round(slope_degrees, 6),
                        }
                    )
            else:
                rises = [float(obj.get("kyx_step_rise_mm", 0)) for obj in stairs]
                runs = [float(obj.get("kyx_step_run_mm", 0)) for obj in stairs]
                max_allowed = float(link.get("maximumStairRiseMm", 0))
                min_allowed = float(link.get("minimumStairRunMm", 0))
                stair_passed = (
                    bool(rises)
                    and max(rises) <= max_allowed + 0.001
                    and min(runs) >= min_allowed - 0.001
                )
                stair_segments.append(
                    {
                        "segment": segment_index,
                        "steps": len(stairs),
                        "riseMm": round(max(rises), 6),
                        "runMm": round(min(runs), 6),
                        "maximumAllowedRiseMm": max_allowed,
                        "minimumAllowedRunMm": min_allowed,
                        "passed": stair_passed,
                    }
                )
                if not stair_passed:
                    failures.append(
                        {"kind": "stair_contract_failed", "segment": segment_index}
                    )
        elif stairs:
            failures.append(
                {"kind": "unexpected_stairs_on_ordinary_ramp", "segment": segment_index}
            )

        steps = max(2, int(math.ceil(length_m / SAMPLE_SPACING_M)) + 1)
        for sample_index in range(steps):
            t = sample_index / (steps - 1)
            feet = start.lerp(end, t)
            if stairs:
                # Quantize the feet height to the actual 250 mm-or-less tread
                # reached at this horizontal progress, including both endpoints.
                low_z = min(start.z, end.z)
                high_z = max(start.z, end.z)
                if end.z >= start.z:
                    progress = t
                else:
                    progress = 1.0 - t
                tread_index = min(len(stairs), max(0, int(math.ceil(progress * len(stairs)))))
                feet.z = low_z + (high_z - low_z) * tread_index / len(stairs)

            segment_supported = support_footprint_on_box(
                segment_obj,
                start.lerp(end, t),
                local_side,
                radius_m=CAPSULE_RADIUS_WITH_SKIN_M,
            )
            bounded_revision_support = any(
                obj.get("kyx_source_kind")
                in {
                    "bounded_authority_drop_landing_runout",
                    "bounded_authority_drop_launch_runout",
                    "bounded_authority_terminal_support",
                    "bounded_teleport_landing_support",
                }
                and support_footprint_on_box(
                    obj,
                    feet,
                    local_side,
                    radius_m=(
                        0.0
                        if obj.get("kyx_source_kind") == "bounded_teleport_landing_support"
                        else CAPSULE_RADIUS_WITH_SKIN_M
                    ),
                    tolerance_m=(
                        0.105
                        if obj.get("kyx_source_kind") == "bounded_teleport_landing_support"
                        else 0.004
                    ),
                )
                for obj in collision_objects
            )
            if not segment_supported and not bounded_revision_support:
                failures.append(
                    {
                        "kind": "capsule_footprint_not_supported",
                        "segment": segment_index,
                        "sample": sample_index,
                        "t": round(t, 6),
                    }
                )
                break

            gate_roof = bpy.data.objects.get("C_MODULE__INK_SLIDE_GATE_ROOF")
            in_slide_gate = False
            if link["id"] == "ink_mid_w_teleport_entry" and gate_roof is not None:
                gate_local = gate_roof.matrix_world.inverted() @ feet
                gate_dimensions = object_dimensions_mm(gate_roof)
                in_slide_gate = (
                    abs(gate_local.x)
                    <= gate_dimensions[0] / 2000.0 + CAPSULE_RADIUS_WITH_SKIN_M
                    and abs(gate_local.y)
                    <= gate_dimensions[1] / 2000.0 + CAPSULE_RADIUS_WITH_SKIN_M
                )
            height_m = CROUCHED_HEIGHT_M if in_slide_gate else STANDING_HEIGHT_M
            crouched_samples += int(in_slide_gate)
            standing_samples += int(not in_slide_gate)
            hits = capsule_obstructions(feet, height_m, collision_objects)
            if hits:
                failures.append(
                    {
                        "kind": "capsule_obstruction",
                        "segment": segment_index,
                        "sample": sample_index,
                        "t": round(t, 6),
                        "posture": "crouched" if in_slide_gate else "standing",
                        "objects": hits[:12],
                    }
                )
                break
            sample_count += 1

    # Waypoint aprons must support the entire capsule footprint at every kink.
    for waypoint_index, waypoint in enumerate(points[1:-1], start=1):
        name = f"C_WAYPOINT__{sanitize(link['id'])}__W{waypoint_index:02d}"
        obj = bpy.data.objects.get(name)
        if obj is None:
            failures.append({"kind": "missing_waypoint_apron", "object": name})
            continue
        dimensions = object_dimensions_mm(obj)
        if min(dimensions[:2]) < 2 * (CAPSULE_RADIUS_MM + CAPSULE_SKIN_MM):
            failures.append(
                {
                    "kind": "waypoint_apron_too_small",
                    "object": name,
                    "dimensionsMm": dimensions,
                }
            )

    # Both route edges must be guarded, with the declared junction apron gap.
    rail_failures: list[str] = []
    declared_openings = json.loads(
        str(bpy.context.scene.get("kyx_route_rail_openings", "[]"))
    )
    accepted_openings: list[dict[str, Any]] = []
    for segment_index in range(len(points) - 1):
        for side in ("LEFT", "RIGHT"):
            name = (
                f"C_GUARD_RAIL__{sanitize(link['id'])}__S{segment_index:02d}__{side}"
            )
            rail = bpy.data.objects.get(name)
            matching_opening = next(
                (
                    opening
                    for opening in declared_openings
                    if opening.get("linkId") == link["id"]
                    and int(opening.get("segmentIndex", -1)) == segment_index
                    and opening.get("side") == side.lower()
                    and opening.get("edgePolicy") == "physical_crosslink_opening"
                ),
                None,
            )
            if rail is None and matching_opening is not None:
                accepted_openings.append(matching_opening)
            elif (
                rail is None
                or rail.get("kyx_edge_policy") != "guarded_except_junction_apron"
            ):
                rail_failures.append(name)
    if rail_failures:
        failures.append({"kind": "guard_policy_missing", "objects": rail_failures})

    return {
        "linkId": link["id"],
        "family": link["family"],
        "modes": link["modes"],
        "segments": len(points) - 1,
        "samplesCompleted": sample_count,
        "standingSamples": standing_samples,
        "crouchedSamples": crouched_samples,
        "maximumSlopeDegrees": round(maximum_slope_degrees, 6),
        "stairSegments": stair_segments,
        "continuousRampSegments": continuous_ramp_segments,
        "edgePolicy": "guarded_except_junction_aprons_and_declared_crosslink_openings",
        "crosslinkOpenings": accepted_openings,
        "failures": failures,
        "passed": not failures,
    }


def validate() -> None:
    args = parse_args()
    seed_path = Path(args.seed).resolve()
    root = Path(args.output_root).resolve()
    blend_path = root / "source" / "inkfall_foundry.blend"
    render_glb = root / "export" / "render.graybox.glb"
    collision_glb = root / "export" / "collision.authority.glb"
    artifact_report_path = root / args.artifact_report
    build_report_path = root / args.build_report
    output_path = root / args.output_report

    seed_bytes = seed_path.read_bytes()
    seed_sha256 = hashlib.sha256(seed_bytes).hexdigest()
    seed = json.loads(seed_bytes.decode("utf-8"))
    artifact_report = json.loads(artifact_report_path.read_text(encoding="utf-8"))
    build_report = json.loads(build_report_path.read_text(encoding="utf-8"))
    artifact_status = artifact_report.get("result", artifact_report.get("status"))
    bpy.ops.wm.open_mainfile(filepath=str(blend_path), load_ui=False)

    collision_objects = sorted(
        [
            obj
            for obj in bpy.data.collections[COLLECTION_COLLISION].objects
            if obj.type == "MESH"
        ],
        key=lambda obj: obj.name,
    )
    assertions: list[dict[str, Any]] = []
    assertion(
        assertions,
        "approved_seed_unchanged",
        seed_sha256 == EXPECTED_SEED_SHA256
        and bpy.context.scene.get("kyx_seed_sha256") == EXPECTED_SEED_SHA256,
        expected=EXPECTED_SEED_SHA256,
        actual=seed_sha256,
    )
    assertion(
        assertions,
        "generator_v2_playability_candidate",
        int(bpy.context.scene.get("kyx_generator_version", 0)) >= 2,
        actual=bpy.context.scene.get("kyx_generator_version"),
    )
    assertion(
        assertions,
        "artifact_validator_passed",
        artifact_status == args.artifact_status,
        report=str(artifact_report_path.relative_to(root)).replace("\\", "/"),
        expectedStatus=args.artifact_status,
        actualStatus=artifact_status,
    )
    assertion(
        assertions,
        "render_and_collision_packages_distinct",
        render_glb.exists()
        and collision_glb.exists()
        and sha256_file(render_glb) != sha256_file(collision_glb),
        renderSha256=sha256_file(render_glb),
        collisionSha256=sha256_file(collision_glb),
    )

    bounds_passed, bounds_failures = colliders_inside_seed_bounds(collision_objects, seed)
    assertion(
        assertions,
        "all_collision_seed_bounded",
        bounds_passed,
        failures=bounds_failures[:20],
    )

    physical_links = [
        link
        for link in seed["links"]
        if set(link["modes"]) not in ({"teleport"}, {"drop"})
    ]
    teleport_revision_validation = None
    if args.runtime_manifest:
        runtime_manifest_path = root / args.runtime_manifest
        runtime_manifest = json.loads(runtime_manifest_path.read_text(encoding="utf-8"))
        teleport_trigger = next(
            trigger for trigger in runtime_manifest["triggers"] if trigger["kind"] == "teleport"
        )
        teleport_route = bpy.data.objects["C_ROUTE__TELEPORT_EXIT_PRESS_CORE__S00"]
        endpoint_a = json.loads(teleport_route["kyx_endpoint_a_mm"])
        endpoint_b = json.loads(teleport_route["kyx_endpoint_b_mm"])
        trimmed_start_mm = int(teleport_route.get("kyx_trimmed_start_mm", 0))
        endpoint_direction = [
            endpoint_b[index] - endpoint_a[index] for index in range(3)
        ]
        endpoint_length = math.sqrt(sum(value * value for value in endpoint_direction))
        trimmed_route_start = [
            round(
                endpoint_a[index]
                + endpoint_direction[index] * trimmed_start_mm / endpoint_length
            )
            for index in range(3)
        ]
        destination = teleport_trigger["destinationFeetMm"]
        destination_point = [destination["x"], destination["y"], destination["z"]]
        landing = bpy.data.objects["C_REV2__NODE__TELEPORT_EXIT_SLOPED_LANDING"]
        landing_dimensions = object_dimensions_mm(landing)
        landing_fixed_point = json.loads(landing["kyx_fixed_landing_feet_mm"])
        connector_distance = math.dist(destination_point, trimmed_route_start)
        teleport_revision_validation = {
            "contractSatisfied": (
                landing_fixed_point == destination_point
                and min(landing_dimensions[:2]) >= 4_000
                and int(landing.get("kyx_cast_clearance_mm", -1)) == 100
                and connector_distance <= 2_000
            ),
            "destinationFeetMm": destination_point,
            "trimmedRouteStartMm": trimmed_route_start,
            "connectorDistanceMm": round(connector_distance, 6),
            "landingDimensionsMm": landing_dimensions,
            "castClearanceMm": int(landing.get("kyx_cast_clearance_mm", -1)),
        }
        physical_links = [dict(link) for link in physical_links]
        for link in physical_links:
            if link["id"] == "teleport_exit_press_core":
                link["waypointsMm"] = [
                    trimmed_route_start,
                    *link["waypointsMm"][1:],
                ]
    continuous_ramp_links = set(args.continuous_ramp_link)
    link_results = [
        physical_link_sweep(link, collision_objects, continuous_ramp_links)
        for link in physical_links
    ]
    assertion(
        assertions,
        "every_physical_seed_link_capsule_sweep_passed",
        len(link_results) == 25 and all(result["passed"] for result in link_results),
        expectedLinks=25,
        actualLinks=len(link_results),
        failedLinks=[result["linkId"] for result in link_results if not result["passed"]],
    )
    if teleport_revision_validation is not None:
        assertion(
            assertions,
            "revision2_teleport_landing_and_trimmed_route_contract",
            teleport_revision_validation["contractSatisfied"],
            **teleport_revision_validation,
        )
    declared_openings = json.loads(
        str(bpy.context.scene.get("kyx_route_rail_openings", "[]"))
    )
    seed_link_by_id = {link["id"]: link for link in physical_links}
    opening_keys: set[tuple[str, int, str]] = set()
    opening_failures: list[dict[str, Any]] = []
    for opening in declared_openings:
        key = (
            str(opening.get("linkId")),
            int(opening.get("segmentIndex", -1)),
            str(opening.get("side")),
        )
        link = seed_link_by_id.get(key[0])
        neighbor = seed_link_by_id.get(str(opening.get("neighborLinkId")))
        rail_name = (
            f"C_GUARD_RAIL__{sanitize(key[0])}__S{key[1]:02d}__{key[2].upper()}"
        )
        shared_nodes = (
            set((link["from"], link["to"]))
            & set((neighbor["from"], neighbor["to"]))
            if link is not None and neighbor is not None
            else set()
        )
        valid = (
            key not in opening_keys
            and link is not None
            and neighbor is not None
            and 0 <= key[1] < len(link["waypointsMm"]) - 1
            and key[2] in {"left", "right"}
            and opening.get("edgePolicy") == "physical_crosslink_opening"
            and bool(shared_nodes)
            and bpy.data.objects.get(rail_name) is None
        )
        if not valid:
            opening_failures.append(
                {
                    "opening": opening,
                    "railName": rail_name,
                    "sharedNodes": sorted(shared_nodes),
                }
            )
        opening_keys.add(key)
    assertion(
        assertions,
        "declared_crosslink_openings_are_bounded_shared_node_intervals",
        len(declared_openings) == 7 and not opening_failures,
        expectedOpenings=7,
        actualOpenings=len(declared_openings),
        failures=opening_failures,
    )
    total_samples = sum(result["samplesCompleted"] for result in link_results)
    assertion(
        assertions,
        "capsule_sweep_sample_density",
        total_samples >= 1000,
        sampleSpacingMm=int(SAMPLE_SPACING_M * 1000),
        totalSamples=total_samples,
    )

    # Gate geometry must reject standing expansion while allowing the crouched
    # profile through the exact 1.4 m x 1.35 m seed aperture.
    gate_left = bpy.data.objects.get("C_MODULE__INK_SLIDE_GATE_LEFT")
    gate_right = bpy.data.objects.get("C_MODULE__INK_SLIDE_GATE_RIGHT")
    gate_roof = bpy.data.objects.get("C_MODULE__INK_SLIDE_GATE_ROOF")
    gate_parts_exist = all(obj is not None for obj in (gate_left, gate_right, gate_roof))
    gate_center = gate_roof.location.copy() if gate_roof is not None else Vector()
    gate_center.z = -3.0
    gate_standing_hits = (
        capsule_obstructions(gate_center, STANDING_HEIGHT_M, collision_objects)
        if gate_parts_exist
        else []
    )
    gate_crouched_hits = (
        capsule_obstructions(gate_center, CROUCHED_HEIGHT_M, collision_objects)
        if gate_parts_exist
        else ["missing_gate"]
    )
    gate_center_separation_mm = (
        (gate_left.location - gate_right.location).length * 1000.0
        if gate_parts_exist
        else 0.0
    )
    wall_thickness_mm = object_dimensions_mm(gate_left)[1] if gate_parts_exist else 0
    measured_clear_width_mm = gate_center_separation_mm - wall_thickness_mm
    roof_dimensions = object_dimensions_mm(gate_roof) if gate_parts_exist else [0, 0, 0]
    measured_clear_height_mm = (
        (gate_roof.location.z - roof_dimensions[2] / 2000.0 + 3.0) * 1000.0
        if gate_parts_exist
        else 0.0
    )
    gate_passed = (
        gate_parts_exist
        and abs(measured_clear_width_mm - 1400.0) <= 2.0
        and abs(measured_clear_height_mm - 1350.0) <= 2.0
        and "C_MODULE__INK_SLIDE_GATE_ROOF" in gate_standing_hits
        and not gate_crouched_hits
    )
    assertion(
        assertions,
        "slide_gate_capsule_contract",
        gate_passed,
        measuredClearWidthMm=round(measured_clear_width_mm, 6),
        measuredClearHeightMm=round(measured_clear_height_mm, 6),
        standingHits=gate_standing_hits,
        crouchedHits=gate_crouched_hits,
    )

    # All twelve immutable spawn candidates need in-bounds support and a clear
    # standing capsule.  This directly catches the old +/-37 m pad defect.
    spawn_results: list[dict[str, Any]] = []
    seed_min = seed["boundsMm"]["minimum"]
    seed_max = seed["boundsMm"]["maximum"]
    radius_mm = CAPSULE_RADIUS_MM + CAPSULE_SKIN_MM
    for spawn in seed["spawnCandidates"]:
        feet = seed_to_blender(spawn["positionMm"])
        pad_name = f"C_SPAWN_PAD__{sanitize(spawn['id'])}"
        pad = bpy.data.objects.get(pad_name)
        in_bounds = (
            seed_min[0] + radius_mm <= spawn["positionMm"][0] <= seed_max[0] - radius_mm
            and seed_min[2] + radius_mm <= spawn["positionMm"][2] <= seed_max[2] - radius_mm
        )
        pad_supported = False
        if pad is not None:
            pad_supported = support_footprint_on_box(
                pad,
                feet,
                Vector((1.0, 0.0, 0.0)),
                radius_m=CAPSULE_RADIUS_WITH_SKIN_M,
            ) and support_footprint_on_box(
                pad,
                feet,
                Vector((0.0, 1.0, 0.0)),
                radius_m=CAPSULE_RADIUS_WITH_SKIN_M,
            )
        hits = capsule_obstructions(feet, STANDING_HEIGHT_M, collision_objects)
        passed = pad is not None and in_bounds and pad_supported and not hits
        spawn_results.append(
            {
                "spawnId": spawn["id"],
                "set": spawn["set"],
                "pad": pad_name,
                "inBoundsWithCapsule": in_bounds,
                "capsuleFootprintSupported": pad_supported,
                "obstructions": hits,
                "passed": passed,
            }
        )
    assertion(
        assertions,
        "all_spawn_candidates_supported_clear_and_seed_bounded",
        len(spawn_results) == 12 and all(item["passed"] for item in spawn_results),
        failedSpawns=[item["spawnId"] for item in spawn_results if not item["passed"]],
    )

    # The teleport is deliberately nonphysical: two supported endpoints, eight
    # readable markers, and no accidental bridge between the pads.
    teleport_route_objects = [
        obj.name
        for obj in collision_objects
        if obj.get("kyx_source_id") == "teleport_shortcut"
        and obj.get("kyx_source_kind") == "route_segment"
    ]
    teleport_markers = [
        obj
        for obj in collision_objects
        if obj.get("kyx_source_kind") == "teleport_boundary_marker"
    ]
    assertion(
        assertions,
        "teleport_boundary_nonphysical_and_legible",
        not teleport_route_objects and len(teleport_markers) == 8,
        physicalConnectors=teleport_route_objects,
        boundaryMarkers=len(teleport_markers),
    )

    # The Paper Drop must remain a one-way open fall; its two shoulder guards
    # classify the edge without creating a returnable ramp.
    drop_route_objects = [
        obj.name
        for obj in collision_objects
        if obj.get("kyx_source_id") == "archive_drop_press_north"
        and obj.get("kyx_source_kind") == "route_segment"
    ]
    drop_guards = [
        obj
        for obj in collision_objects
        if obj.get("kyx_source_kind") == "intentional_drop_guard"
    ]
    assertion(
        assertions,
        "paper_drop_intentional_fall_not_accidental_ramp",
        not drop_route_objects
        and len(drop_guards) == 2
        and all(
            obj.get("kyx_edge_policy")
            == "intentional_fall_center_guarded_shoulders"
            for obj in drop_guards
        ),
        physicalDropConnectors=drop_route_objects,
        shoulderGuards=len(drop_guards),
    )

    movement_feature_by_id = {
        feature["id"]: feature for feature in seed["movementFeatures"]
    }
    jump_results: list[dict[str, Any]] = []
    for feature_id in ("press_gap_west", "archive_gap_east"):
        feature = movement_feature_by_id[feature_id]
        takeoff = bpy.data.objects.get(f"C_JUMP_PAD__{sanitize(feature_id)}__TAKEOFF")
        landing = bpy.data.objects.get(f"C_JUMP_PAD__{sanitize(feature_id)}__LANDING")
        guards = [
            obj
            for obj in collision_objects
            if obj.get("kyx_source_kind") == "jump_gap_side_guard"
            and obj.get("kyx_feature_id") == feature_id
        ]
        actual_gap_mm = math.inf
        bridge_objects: list[str] = []
        if takeoff is not None and landing is not None:
            takeoff_half_x = object_dimensions_mm(takeoff)[0] / 2000.0
            landing_half_x = object_dimensions_mm(landing)[0] / 2000.0
            takeoff_edge = takeoff.matrix_world @ Vector((takeoff_half_x, 0.0, 0.125))
            landing_edge = landing.matrix_world @ Vector((-landing_half_x, 0.0, 0.125))
            actual_gap_mm = (landing_edge - takeoff_edge).length * 1000.0
            direction = (landing_edge - takeoff_edge).normalized()
            side = takeoff.matrix_world.to_quaternion() @ Vector((0.0, 1.0, 0.0))
            for index in range(1, 10):
                point = takeoff_edge.lerp(landing_edge, index / 10.0)
                for obj in collision_objects:
                    if obj.get("kyx_source_kind") not in SUPPORT_KINDS:
                        continue
                    if obj in (takeoff, landing):
                        continue
                    local = obj.matrix_world.inverted() @ point
                    corners = [Vector(corner) for corner in obj.bound_box]
                    minimum = Vector(
                        tuple(min(corner[axis] for corner in corners) for axis in range(3))
                    )
                    maximum = Vector(
                        tuple(max(corner[axis] for corner in corners) for axis in range(3))
                    )
                    if (
                        minimum.x <= local.x <= maximum.x
                        and minimum.y <= local.y <= maximum.y
                        and abs(local.z - maximum.z) <= 0.08
                    ):
                        bridge_objects.append(obj.name)
        target_gap_mm = int(feature["gapMm"])
        max_air_distance_mm = int(
            seed["movementSizing"]["jump"]["airSpeedCapMmPerSecond"]
            * seed["movementSizing"]["jump"]["measuredAirtimeMs"]
            / 1000
        )
        passed = (
            takeoff is not None
            and landing is not None
            and len(guards) == 4
            and abs(actual_gap_mm - target_gap_mm) <= 2.0
            and actual_gap_mm <= max_air_distance_mm
            and not bridge_objects
        )
        jump_results.append(
            {
                "featureId": feature_id,
                "targetGapMm": target_gap_mm,
                "actualGapMm": round(actual_gap_mm, 6),
                "maximumBallisticHorizontalDistanceMm": max_air_distance_mm,
                "sideGuards": len(guards),
                "bridgeObjects": sorted(set(bridge_objects)),
                "edgePolicy": "intentional_jump_gap",
                "passed": passed,
            }
        )
    assertion(
        assertions,
        "explicit_jump_gap_geometry_valid",
        all(item["passed"] for item in jump_results),
        failedFeatures=[item["featureId"] for item in jump_results if not item["passed"]],
    )

    door_parts = [
        obj for obj in collision_objects if obj.get("kyx_source_kind") == "authored_door_frame"
    ]
    frame_ids = sorted({str(obj.get("kyx_frame_id")) for obj in door_parts})
    frame_contract_passed = len(frame_ids) == 6 and all(
        len([obj for obj in door_parts if obj.get("kyx_frame_id") == frame_id]) == 3
        for frame_id in frame_ids
    )
    assertion(
        assertions,
        "six_authored_transition_frames",
        frame_contract_passed,
        frameIds=frame_ids,
        parts=len(door_parts),
    )

    all_passed = all(item["passed"] for item in assertions)
    result = "PASS" if all_passed else "FAIL"
    output = {
        "schemaVersion": 1,
        "scope": {
            "phase": "P6.2",
            "status": (
                "PLAYABLE_GRAYBOX_OFFLINE_CAPSULE_VALIDATED"
                if all_passed
                else "PLAYABLE_GRAYBOX_CANDIDATE_FAILED_VALIDATION"
            ),
            "runtimeIntegrated": False,
            "runtimeTraversalProven": False,
            "playtestRun": False,
            "g5Passed": False,
            "g6Passed": False,
        },
        "validator": {
            "script": Path(__file__).name,
            "scriptSha256": sha256_file(Path(__file__).resolve()),
            "blenderVersion": bpy.app.version_string,
            "independentOfBuilderImports": True,
            "runtimeManifest": args.runtime_manifest,
            "continuousRampLinks": sorted(continuous_ramp_links),
        },
        "seed": {
            "path": str(seed_path.name),
            "sha256": seed_sha256,
            "bytes": len(seed_bytes),
            "nodes": len(seed["nodes"]),
            "links": len(seed["links"]),
            "physicalLinks": len(physical_links),
            "spawnCandidates": len(seed["spawnCandidates"]),
        },
        "capsule": {
            "standingHeightMm": int(STANDING_HEIGHT_M * 1000),
            "crouchedHeightMm": int(CROUCHED_HEIGHT_M * 1000),
            "radiusMm": CAPSULE_RADIUS_MM,
            "contactSkinMm": CAPSULE_SKIN_MM,
            "sampleSpacingMm": int(SAMPLE_SPACING_M * 1000),
            "totalCompletedSamples": total_samples,
            "method": "dense upright capsule medial-axis spheres against oriented boxes",
        },
        "physicalLinkSweeps": link_results,
        "spawnSweeps": spawn_results,
        "jumpGaps": jump_results,
        "edgeClassification": {
            "guardedRouteRailObjects": len(
                [obj for obj in collision_objects if obj.get("kyx_source_kind") == "route_guard_rail"]
            ),
            "intentionalJumpGaps": 2,
            "intentionalDropSeams": 1,
            "nonphysicalTeleportConnectors": 1,
            "killBoundaryGuardObjects": len(
                [obj for obj in collision_objects if obj.get("kyx_source_kind") == "kill_boundary_guard"]
            ),
            "futureTriggerVolumes": "P6.3_NOT_CLAIMED",
        },
        "artifacts": {
            "sourceBlend": {
                "path": str(blend_path.relative_to(root)).replace("\\", "/"),
                "sha256": sha256_file(blend_path),
                "bytes": blend_path.stat().st_size,
            },
            "renderGlb": {
                "path": str(render_glb.relative_to(root)).replace("\\", "/"),
                "sha256": sha256_file(render_glb),
                "bytes": render_glb.stat().st_size,
            },
            "collisionGlb": {
                "path": str(collision_glb.relative_to(root)).replace("\\", "/"),
                "sha256": sha256_file(collision_glb),
                "bytes": collision_glb.stat().st_size,
            },
            "artifactValidation": str(artifact_report_path.relative_to(root)).replace("\\", "/"),
            "buildReport": str(build_report_path.relative_to(root)).replace("\\", "/"),
        },
        "assertions": assertions,
        "assertionSummary": {
            "passed": sum(item["passed"] for item in assertions),
            "failed": sum(not item["passed"] for item in assertions),
            "total": len(assertions),
        },
        "result": result,
        "interpretation": (
            "PASS proves the saved P6.2 Blender graybox and separate collider export are "
            "seed-identical, seed-bounded, capsule-continuous across all 25 physical "
            "links, clear at all 12 spawn candidates, and explicit about guarded versus "
            "intentional fall edges. It does not prove runtime loading, engine collision, "
            "spawn LOS/scoring, telemetry, 2/4/8-player fun/readability, performance, or G5."
        ),
    }
    stable_write_json(output_path, output)
    print(json.dumps({"result": result, "report": str(output_path)}))
    if result != "PASS":
        failed = [item["id"] for item in assertions if not item["passed"]]
        raise RuntimeError(f"P6.2 playability validation failed: {failed}")


if __name__ == "__main__":
    validate()
