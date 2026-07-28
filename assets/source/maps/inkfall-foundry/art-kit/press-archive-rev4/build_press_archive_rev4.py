"""Build the bounded Inkfall Rev4 Press-to-Archive authored-art expansion.

The builder opens the frozen Press Hall v3.3 optimized presentation source and
adds one focused, playable route: the west Press ascent into a compact Paper
Archive landing.  Everything emitted here is render-only review art.  Revision
3 collision, spawns, routes, sightlines, package identity, and the catalog
default remain immutable inputs.

No code, geometry, coordinates, wording, or assets are copied from the
NotHereButAfk/Ev.io repository.  Its current audit influenced only four abstract
art-direction principles recorded in the report: one focal landmark,
functional wayfinding, compressed side-route contrast, and restrained route
color hierarchy.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

import bpy
from mathutils import Vector


SCOPE = "G5_INKFALL_REV4_PRESS_ARCHIVE_RENDER_ONLY_NON_DEFAULT"
GENERATOR_ID = "inkfall_foundry_press_archive_rev4"
ART_REVISION = "4.1"

PARENT_SOURCE = (
    "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/"
    "material-export-v3-3/source/"
    "inkfall_foundry_press_hall_material_export_v3_3.optimized-export.blend"
)
PARENT_EXPORT = (
    "assets/source/maps/inkfall-foundry/art-kit/press-hall-final-art-v3/"
    "material-export-v3-3/export/"
    "inkfall_foundry_press_hall_material_export_v3_3.spatial-material-joined.glb"
)
FROZEN_INPUTS = {
    "parentPressHallV33Source": (
        PARENT_SOURCE,
        "9c19ba572b9808aa1776ab1c96e7653d381ba8c5b2d53c4cd28601c7517cf5a5",
    ),
    "parentPressHallV33Export": (
        PARENT_EXPORT,
        "4ad11232074a794fd817114385f7256e286aefe810c76357a9b0103667874564",
    ),
    "revision3Render": (
        "assets/source/maps/inkfall-foundry/revisions/revision-3/export/render.graybox.glb",
        "19bbf6f627f46146a7266d39e00e0635d7b4b09e556bfa0dee988bb2375c5ed6",
    ),
    "revision3Collision": (
        "assets/source/maps/inkfall-foundry/revisions/revision-3/export/collision.authority.glb",
        "1cce637ab4f83766627527b3885c3e9da819d8bcabdfa2144f8dc6b46bc5bba8",
    ),
    "revision3Package": (
        "assets/source/maps/inkfall-foundry/revisions/revision-3/runtime/map.package.v3.json",
        "53eaa6dd91fa407cdaf5738e0fe9193c72a20e209a412258dd01083c2b6fd67b",
    ),
    "revision3AuthorityFixture": (
        "assets/source/maps/inkfall-foundry/runtime/"
        "combat-authority-fixture.g5-revision3.v1.json",
        "dbdb5cfca1ea9aa1088457c89e1d269e9020b2ca3a67cb9ae1cc586703ed95ca",
    ),
    "catalogConstants": (
        "src/content/maps/constants.ts",
        "7dd9dc7b6aa00207d819434695d3daae6e313d1947e19891bab97d5207908dcd",
    ),
}

# Blender coordinates are X east, Y north, Z up.  These points match the
# frozen Revision 3 PRESS_WEST_ARCHIVE route centers without becoming
# collision authority.
ROUTE_POINTS = (
    (-13.40, 2.00, 0.06),
    (-16.00, 7.00, 2.06),
    (-19.00, 12.00, 4.06),
    (-22.00, 17.00, 6.06),
)
ROUTE_WIDTH_METERS = 2.18
LANDING_CENTER = (-22.0, 19.0, 5.91)
LANDING_SIZE = (8.0, 7.0, 0.18)
EXPECTED_PARENT_MESH_COUNT = 29
EXPECTED_PARENT_MATERIALS = (
    "V3_AQUA_INDICATOR",
    "V3_CAST_IRON",
    "V3_CHIPPED_SAFETY_RED",
    "V3_GARDEN_FRAGMENT",
    "V3_GREASED_LINKAGE",
    "V3_INK_BLACK",
    "V3_USED_CERAMIC",
    "V3_WORN_AMBER",
    "V3_WORN_STEEL",
)

NON_CLAIMS = (
    "G5_NOT_PASSED",
    "REVISION_3_NOT_PROMOTED",
    "REVISION_4_ART_NOT_DEFAULT",
    "RENDER_GEOMETRY_NOT_COLLISION_AUTHORITY",
    "HUMAN_VISUAL_ACCEPTANCE_NOT_PASSED",
    "HUMAN_2_4_8_PLAYER_REVIEW_NOT_PASSED",
    "TARGET_HARDWARE_PERFORMANCE_NOT_ACCEPTED",
    "FOCAL_LANDMARK_HAS_NO_OBJECTIVE_OR_GAMEPLAY_SEMANTICS",
    "NO_DEPLOYMENT_OR_PUBLISHING_AUTHORIZATION_USED",
)


def parse_args() -> argparse.Namespace:
    raw = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--output-root", required=True)
    return parser.parse_args(raw)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stable_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def verify_frozen_inputs(repo_root: Path) -> dict[str, dict[str, Any]]:
    verified: dict[str, dict[str, Any]] = {}
    for key, (relative_path, expected_hash) in FROZEN_INPUTS.items():
        path = repo_root / relative_path
        actual_hash = sha256_file(path)
        if actual_hash != expected_hash:
            raise RuntimeError(
                f"Frozen input drift for {key}: expected {expected_hash}, got {actual_hash}"
            )
        verified[key] = {
            "path": relative_path,
            "bytes": path.stat().st_size,
            "expectedSha256": expected_hash,
            "actualSha256": actual_hash,
        }
    return verified


def tune_rev4_material_values(materials: dict[str, bpy.types.Material]) -> dict[str, Any]:
    """Create a restrained value hierarchy using the inherited material set."""

    values = {
        "V3_USED_CERAMIC": ((0.31, 0.345, 0.355, 1.0), 0.00, 0.74),
        "V3_WORN_STEEL": ((0.115, 0.155, 0.165, 1.0), 0.30, 0.58),
        "V3_CAST_IRON": ((0.028, 0.043, 0.049, 1.0), 0.16, 0.66),
        "V3_INK_BLACK": ((0.008, 0.012, 0.016, 1.0), 0.02, 0.78),
        "V3_GREASED_LINKAGE": ((0.020, 0.014, 0.009, 1.0), 0.35, 0.44),
        "V3_WORN_AMBER": ((0.46, 0.205, 0.014, 1.0), 0.10, 0.56),
        "V3_AQUA_INDICATOR": ((0.018, 0.31, 0.34, 1.0), 0.05, 0.48),
        "V3_CHIPPED_SAFETY_RED": ((0.34, 0.025, 0.009, 1.0), 0.05, 0.68),
        "V3_GARDEN_FRAGMENT": ((0.20, 0.135, 0.055, 1.0), 0.00, 0.82),
    }
    result = {}
    for name, (color, metallic, roughness) in values.items():
        material = materials[name]
        material.diffuse_color = color
        material.metallic = metallic
        material.roughness = roughness
        if material.use_nodes:
            principled = material.node_tree.nodes.get("Principled BSDF")
            if principled is not None:
                principled.inputs["Base Color"].default_value = color
                principled.inputs["Metallic"].default_value = metallic
                principled.inputs["Roughness"].default_value = roughness
        result[name] = {
            "baseColorLinear": list(color),
            "metallic": metallic,
            "roughness": roughness,
        }
    return result


def mark_render_only(obj: bpy.types.Object, zone: str, family: str) -> bpy.types.Object:
    obj["kyx_scope"] = SCOPE
    obj["kyx_role"] = "rev4_authored_art_render_only"
    obj["kyx_zone"] = zone
    obj["kyx_family"] = family
    obj["kyx_collision"] = False
    obj["kyx_authority"] = False
    return obj


def apply_bevel(obj: bpy.types.Object, width: float, segments: int = 2) -> None:
    if width <= 0.0 or obj.type != "MESH":
        return
    modifier = obj.modifiers.new(name="REV4_EDGE_BREAK", type="BEVEL")
    modifier.width = width
    modifier.segments = segments
    modifier.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.select_set(False)


def add_box(
    name: str,
    dimensions: tuple[float, float, float],
    location: tuple[float, float, float],
    material: bpy.types.Material,
    zone: str,
    family: str,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    bevel: float = 0.025,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    mark_render_only(obj, zone, family)
    apply_bevel(obj, bevel)
    return obj


def add_cylinder(
    name: str,
    radius: float,
    depth: float,
    location: tuple[float, float, float],
    material: bpy.types.Material,
    zone: str,
    family: str,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
    vertices: int = 24,
    bevel: float = 0.018,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    mark_render_only(obj, zone, family)
    apply_bevel(obj, bevel)
    return obj


def add_torus(
    name: str,
    major_radius: float,
    minor_radius: float,
    location: tuple[float, float, float],
    material: bpy.types.Material,
    zone: str,
    family: str,
    *,
    rotation: tuple[float, float, float] = (0.0, 0.0, 0.0),
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=48,
        minor_segments=10,
        location=location,
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    return mark_render_only(obj, zone, family)


def add_beam(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    radius: float,
    material: bpy.types.Material,
    zone: str,
    family: str,
    *,
    vertices: int = 16,
) -> bpy.types.Object:
    start_vector = Vector(start)
    end_vector = Vector(end)
    direction = end_vector - start_vector
    length = direction.length
    if length <= 1e-6:
        raise ValueError(f"Zero-length beam: {name}")
    midpoint = (start_vector + end_vector) * 0.5
    obj = add_cylinder(
        name,
        radius,
        length,
        tuple(midpoint),
        material,
        zone,
        family,
        vertices=vertices,
        bevel=min(radius * 0.25, 0.018),
    )
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    return obj


def add_path_slab(
    name: str,
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    width: float,
    thickness: float,
    material: bpy.types.Material,
    zone: str,
    family: str,
) -> bpy.types.Object:
    a = Vector(start)
    b = Vector(end)
    horizontal = Vector((b.x - a.x, b.y - a.y, 0.0))
    if horizontal.length <= 1e-6:
        raise ValueError(f"Degenerate path slab: {name}")
    side = Vector((-horizontal.y, horizontal.x, 0.0)).normalized() * (width * 0.5)
    top = (a - side, a + side, b + side, b - side)
    bottom = tuple(vertex - Vector((0.0, 0.0, thickness)) for vertex in top)
    vertices = [tuple(vertex) for vertex in (*top, *bottom)]
    faces = (
        (0, 1, 2, 3),
        (7, 6, 5, 4),
        (0, 4, 5, 1),
        (1, 5, 6, 2),
        (2, 6, 7, 3),
        (3, 7, 4, 0),
    )
    mesh = bpy.data.meshes.new(name + "_MESH")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    mark_render_only(obj, zone, family)
    apply_bevel(obj, min(thickness * 0.18, 0.018), segments=1)
    return obj


def interpolate(
    start: tuple[float, float, float],
    end: tuple[float, float, float],
    fraction: float,
) -> tuple[float, float, float]:
    return tuple(
        left + (right - left) * fraction
        for left, right in zip(start, end)
    )


def path_side(
    start: tuple[float, float, float],
    end: tuple[float, float, float],
) -> Vector:
    horizontal = Vector((end[0] - start[0], end[1] - start[1], 0.0))
    return Vector((-horizontal.y, horizontal.x, 0.0)).normalized()


def offset_point(point: tuple[float, float, float], side: Vector, distance: float) -> tuple[float, float, float]:
    return (
        point[0] + side.x * distance,
        point[1] + side.y * distance,
        point[2],
    )


def carve_route_clearance(
    parent_meshes: list[bpy.types.Object],
) -> dict[str, Any]:
    """Cut only the derivative presentation mesh above the frozen route floor.

    Press Hall v3.3 was authored as a bounded room and its joined wall panels
    close over the Revision 3 west-Archive branch.  The immutable parent file
    remains untouched; this derivative output opens a 2.72 m visual portal
    around the already-authoritative route coordinates.
    """

    cutters: list[bpy.types.Object] = []
    for segment_index, (start, end) in enumerate(zip(ROUTE_POINTS, ROUTE_POINTS[1:])):
        horizontal = Vector((end[0] - start[0], end[1] - start[1], 0.0))
        segment_length = horizontal.length
        angle = math.atan2(horizontal.y, horizontal.x)
        for slice_index, fraction in enumerate((1.0 / 6.0, 0.5, 5.0 / 6.0)):
            center = interpolate(start, end, fraction)
            bpy.ops.mesh.primitive_cube_add(
                location=(center[0], center[1], center[2] + 1.72),
                rotation=(0.0, 0.0, angle),
            )
            cutter = bpy.context.object
            cutter.name = f"V4_ROUTE_CLEARANCE_{segment_index}_{slice_index}"
            cutter.dimensions = (segment_length / 3.0 + 0.78, 2.72, 3.36)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            cutters.append(cutter)

    bpy.ops.object.select_all(action="DESELECT")
    for cutter in cutters:
        cutter.select_set(True)
    joined_cutter = cutters[0]
    bpy.context.view_layer.objects.active = joined_cutter
    bpy.ops.object.join()
    joined_cutter.name = "V4_ROUTE_CLEARANCE_DERIVATIVE_PRESENTATION_ONLY"

    affected: list[dict[str, Any]] = []
    for obj in parent_meshes:
        before = mesh_triangles(obj)
        modifier = obj.modifiers.new(name="V4_ROUTE_CLEARANCE", type="BOOLEAN")
        modifier.operation = "DIFFERENCE"
        modifier.solver = "EXACT"
        modifier.object = joined_cutter
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        try:
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except RuntimeError as cause:
            obj.select_set(False)
            raise RuntimeError(f"Route-clearance boolean failed for {obj.name}") from cause
        obj.select_set(False)
        after = mesh_triangles(obj)
        if before != after:
            affected.append(
                {
                    "object": obj.name,
                    "trianglesBefore": before,
                    "trianglesAfter": after,
                }
            )

    bpy.data.objects.remove(joined_cutter, do_unlink=True)
    return {
        "kind": "derivative_presentation_portal_above_frozen_route",
        "clearWidthMeters": 2.72,
        "clearHeightMeters": 3.36,
        "cutterSliceCount": len(cutters),
        "affectedParentMeshes": affected,
        "frozenParentSourceModified": False,
        "authorityGeometryModified": False,
    }


def build_archive_rise(materials: dict[str, bpy.types.Material]) -> None:
    ceramic = materials["V3_USED_CERAMIC"]
    ink = materials["V3_INK_BLACK"]
    steel = materials["V3_WORN_STEEL"]
    cast = materials["V3_CAST_IRON"]
    amber = materials["V3_WORN_AMBER"]
    aqua = materials["V3_AQUA_INDICATOR"]
    safety = materials["V3_CHIPPED_SAFETY_RED"]

    for segment_index, (start, end) in enumerate(zip(ROUTE_POINTS, ROUTE_POINTS[1:])):
        zone = "archive_rise"
        side = path_side(start, end)
        segment_token = f"S{segment_index:02d}"

        # Two ceramic tread bands leave a dark drainage seam down the center.
        for band_index, band_offset in enumerate((-0.56, 0.56)):
            shifted_start = offset_point(start, side, band_offset)
            shifted_end = offset_point(end, side, band_offset)
            add_path_slab(
                f"V4_ARCHIVE_RISE_{segment_token}_TREAD_{band_index}",
                shifted_start,
                shifted_end,
                0.98,
                0.10,
                ceramic,
                zone,
                "route_tread",
            )
        add_path_slab(
            f"V4_ARCHIVE_RISE_{segment_token}_CENTER_SEAM",
            start,
            end,
            0.10,
            0.055,
            ink,
            zone,
            "drainage_seam",
        )

        # Render-only truss skins follow the frozen route edge; the playable
        # width remains visually open and no mesh becomes authority.
        for side_index, side_sign in enumerate((-1.0, 1.0)):
            edge_offset = side_sign * 1.19
            rail_start = offset_point(start, side, edge_offset)
            rail_end = offset_point(end, side, edge_offset)
            rail_start_top = (rail_start[0], rail_start[1], rail_start[2] + 1.04)
            rail_end_top = (rail_end[0], rail_end[1], rail_end[2] + 1.04)
            add_beam(
                f"V4_ARCHIVE_RISE_{segment_token}_TOP_RAIL_{side_index}",
                rail_start_top,
                rail_end_top,
                0.055,
                steel,
                zone,
                "guard_rail",
            )
            add_beam(
                f"V4_ARCHIVE_RISE_{segment_token}_EDGE_BEAM_{side_index}",
                (rail_start[0], rail_start[1], rail_start[2] - 0.08),
                (rail_end[0], rail_end[1], rail_end[2] - 0.08),
                0.075,
                cast,
                zone,
                "edge_structure",
            )
            for sample_index, fraction in enumerate((0.0, 0.5, 1.0)):
                sample = interpolate(rail_start, rail_end, fraction)
                add_beam(
                    f"V4_ARCHIVE_RISE_{segment_token}_POST_{side_index}_{sample_index}",
                    (sample[0], sample[1], sample[2] + 0.02),
                    (sample[0], sample[1], sample[2] + 1.08),
                    0.045,
                    cast,
                    zone,
                    "guard_post",
                )
            # Archive-bound edge is amber; the Press-return edge is cyan.
            guide_material = amber if side_sign > 0 else aqua
            guide_start = (rail_start[0], rail_start[1], rail_start[2] + 0.27)
            guide_end = (rail_end[0], rail_end[1], rail_end[2] + 0.27)
            add_beam(
                f"V4_ARCHIVE_RISE_{segment_token}_GUIDE_{side_index}",
                guide_start,
                guide_end,
                0.026,
                guide_material,
                zone,
                "route_wayfinding",
                vertices=12,
            )

        # An overhead datum frame makes the side route feel compressed and
        # readable against the wider Press Hall.
        midpoint = interpolate(start, end, 0.52)
        frame_side = side
        left = offset_point(midpoint, frame_side, -1.36)
        right = offset_point(midpoint, frame_side, 1.36)
        for token, point in (("L", left), ("R", right)):
            add_beam(
                f"V4_ARCHIVE_RISE_{segment_token}_DATUM_POST_{token}",
                (point[0], point[1], point[2] - 0.05),
                (point[0], point[1], point[2] + 2.74),
                0.065,
                cast,
                zone,
                "datum_frame",
            )
        add_beam(
            f"V4_ARCHIVE_RISE_{segment_token}_DATUM_CROSS",
            (left[0], left[1], left[2] + 2.68),
            (right[0], right[1], right[2] + 2.68),
            0.072,
            cast,
            zone,
            "datum_frame",
        )
        add_beam(
            f"V4_ARCHIVE_RISE_{segment_token}_DATUM_LIGHT",
            (
                left[0] * 0.82 + right[0] * 0.18,
                left[1] * 0.82 + right[1] * 0.18,
                left[2] + 2.60,
            ),
            (
                left[0] * 0.18 + right[0] * 0.82,
                left[1] * 0.18 + right[1] * 0.82,
                right[2] + 2.60,
            ),
            0.032,
            amber,
            zone,
            "route_wayfinding",
            vertices=12,
        )

        # Red remains a sparse hazard-only accent on the drop-side shoes.
        if segment_index in (0, 2):
            hazard = offset_point(midpoint, side, -1.26)
            add_box(
                f"V4_ARCHIVE_RISE_{segment_token}_HAZARD_SHOE",
                (0.18, 0.18, 0.34),
                (hazard[0], hazard[1], hazard[2] + 0.18),
                safety,
                zone,
                "hazard_identifier",
                bevel=0.018,
            )


def build_archive_landing(materials: dict[str, bpy.types.Material]) -> None:
    ceramic = materials["V3_USED_CERAMIC"]
    ink = materials["V3_INK_BLACK"]
    steel = materials["V3_WORN_STEEL"]
    cast = materials["V3_CAST_IRON"]
    amber = materials["V3_WORN_AMBER"]
    aqua = materials["V3_AQUA_INDICATOR"]
    safety = materials["V3_CHIPPED_SAFETY_RED"]
    grease = materials["V3_GREASED_LINKAGE"]
    paper = materials["V3_GARDEN_FRAGMENT"]
    zone = "archive_landing"

    add_box(
        "V4_ARCHIVE_LANDING_DECK",
        LANDING_SIZE,
        LANDING_CENTER,
        steel,
        zone,
        "landing_deck",
        bevel=0.035,
    )
    # Dark service strips break the broad slab into authored floor bays.
    for index, x in enumerate((-25.0, -23.0, -21.0, -19.0)):
        add_box(
            f"V4_ARCHIVE_LANDING_FLOOR_SEAM_{index}",
            (0.055, 6.56, 0.025),
            (x, 19.0, 6.015),
            ink,
            zone,
            "floor_seam",
            bevel=0.006,
        )
    for index, y in enumerate((16.4, 18.1, 19.8, 21.5)):
        add_box(
            f"V4_ARCHIVE_LANDING_FLOOR_CROSS_{index}",
            (7.56, 0.055, 0.025),
            (-22.0, y, 6.016),
            ink,
            zone,
            "floor_seam",
            bevel=0.006,
        )

    # Open gantry: enough structure to feel like a room without blocking the
    # west/east Archive continuation or the Press return.
    gantry_points = (
        (-25.55, 16.0),
        (-18.45, 16.0),
        (-25.55, 22.0),
        (-18.45, 22.0),
    )
    for index, (x, y) in enumerate(gantry_points):
        add_beam(
            f"V4_ARCHIVE_GANTRY_POST_{index}",
            (x, y, 6.02),
            (x, y, 10.72),
            0.095,
            cast,
            zone,
            "archive_gantry",
        )
        add_box(
            f"V4_ARCHIVE_GANTRY_SHOE_{index}",
            (0.48, 0.48, 0.16),
            (x, y, 6.10),
            cast,
            zone,
            "archive_gantry",
            bevel=0.045,
        )
    for token, start, end in (
        ("SOUTH", (-25.55, 16.0, 10.65), (-18.45, 16.0, 10.65)),
        ("NORTH", (-25.55, 22.0, 10.65), (-18.45, 22.0, 10.65)),
        ("WEST", (-25.55, 16.0, 10.65), (-25.55, 22.0, 10.65)),
        ("EAST", (-18.45, 16.0, 10.65), (-18.45, 22.0, 10.65)),
    ):
        add_beam(
            f"V4_ARCHIVE_GANTRY_TOP_{token}",
            start,
            end,
            0.105,
            cast,
            zone,
            "archive_gantry",
        )
    for x in (-24.4, -22.8, -21.2, -19.6):
        add_beam(
            f"V4_ARCHIVE_GANTRY_CROSSBEAM_{x}",
            (x, 16.0, 10.57),
            (x, 22.0, 10.57),
            0.065,
            steel,
            zone,
            "archive_gantry",
        )

    # Paper ledgers on restrained perimeter racks.  Their position preserves
    # the central 3.4 m route corridor and avoids implying new collision.
    rack_centers = (
        (-25.15, 18.0, 7.48),
        (-25.15, 20.5, 7.48),
        (-18.85, 20.5, 7.48),
    )
    for rack_index, (x, y, z) in enumerate(rack_centers):
        for x_offset in (-0.46, 0.46):
            add_box(
                f"V4_ARCHIVE_RACK_{rack_index}_POST_{x_offset}",
                (0.11, 0.42, 2.85),
                (x + x_offset, y, z),
                cast,
                zone,
                "archive_rack",
                bevel=0.025,
            )
        for shelf_index, shelf_z in enumerate((6.22, 7.10, 7.98, 8.86)):
            add_box(
                f"V4_ARCHIVE_RACK_{rack_index}_SHELF_{shelf_index}",
                (1.12, 0.55, 0.08),
                (x, y, shelf_z),
                steel,
                zone,
                "archive_rack",
                bevel=0.018,
            )
        for roll_index, (x_offset, roll_z) in enumerate(
            ((-0.25, 6.63), (0.25, 6.63), (-0.25, 7.51), (0.25, 7.51), (0.0, 8.39))
        ):
            add_cylinder(
                f"V4_ARCHIVE_RACK_{rack_index}_LEDGER_{roll_index}",
                0.25,
                0.42,
                (x + x_offset, y - 0.03, roll_z),
                paper,
                zone,
                "paper_ledger",
                rotation=(math.pi / 2.0, 0.0, 0.0),
                vertices=24,
                bevel=0.012,
            )
            add_cylinder(
                f"V4_ARCHIVE_RACK_{rack_index}_HUB_{roll_index}",
                0.075,
                0.48,
                (x + x_offset, y - 0.03, roll_z),
                grease,
                zone,
                "ledger_hub",
                rotation=(math.pi / 2.0, 0.0, 0.0),
                vertices=16,
                bevel=0.008,
            )

    # The index wheel is the single recognizable visual landmark.  It has no
    # gameplay/objective semantics and remains outside the clear route lane.
    focal_center = Vector((-22.0, 20.75, 8.42))
    add_torus(
        "V4_ARCHIVE_INDEX_WHEEL_OUTER",
        1.52,
        0.115,
        tuple(focal_center),
        amber,
        zone,
        "index_wheel_landmark",
        rotation=(math.pi / 2.0, 0.0, 0.0),
    )
    add_torus(
        "V4_ARCHIVE_INDEX_WHEEL_INNER",
        1.10,
        0.060,
        tuple(focal_center),
        steel,
        zone,
        "index_wheel_landmark",
        rotation=(math.pi / 2.0, 0.0, 0.0),
    )
    add_cylinder(
        "V4_ARCHIVE_INDEX_WHEEL_HUB",
        0.36,
        0.52,
        tuple(focal_center),
        grease,
        zone,
        "index_wheel_landmark",
        rotation=(math.pi / 2.0, 0.0, 0.0),
        vertices=32,
        bevel=0.035,
    )
    for spoke_index in range(8):
        angle = (math.tau / 8.0) * spoke_index
        inner = (
            focal_center.x + math.cos(angle) * 0.40,
            focal_center.y,
            focal_center.z + math.sin(angle) * 0.40,
        )
        outer = (
            focal_center.x + math.cos(angle) * 1.08,
            focal_center.y,
            focal_center.z + math.sin(angle) * 1.08,
        )
        add_beam(
            f"V4_ARCHIVE_INDEX_WHEEL_SPOKE_{spoke_index}",
            inner,
            outer,
            0.038,
            steel,
            zone,
            "index_wheel_landmark",
            vertices=12,
        )
    add_beam(
        "V4_ARCHIVE_INDEX_WHEEL_SUSPENSION_L",
        (-23.20, 20.75, 9.35),
        (-23.20, 20.75, 10.55),
        0.055,
        cast,
        zone,
        "landmark_suspension",
    )
    add_beam(
        "V4_ARCHIVE_INDEX_WHEEL_SUSPENSION_R",
        (-20.80, 20.75, 9.35),
        (-20.80, 20.75, 10.55),
        0.055,
        cast,
        zone,
        "landmark_suspension",
    )

    # Oversized geometric chevrons point toward Archive; cyan return bars point
    # back down toward Press.  No borrowed sign code, text, or wording.
    for chevron_index, y in enumerate((16.35, 16.68, 17.01)):
        x = -24.65 + chevron_index * 0.34
        add_beam(
            f"V4_ARCHIVE_WAYFIND_CHEVRON_{chevron_index}_A",
            (x - 0.46, y, 8.95),
            (x, y, 8.52),
            0.075,
            amber,
            zone,
            "oversized_wayfinding",
        )
        add_beam(
            f"V4_ARCHIVE_WAYFIND_CHEVRON_{chevron_index}_B",
            (x, y, 8.52),
            (x - 0.46, y, 8.09),
            0.075,
            amber,
            zone,
            "oversized_wayfinding",
        )
    for bar_index, z in enumerate((6.50, 6.86, 7.22)):
        add_box(
            f"V4_PRESS_RETURN_BAR_{bar_index}",
            (0.08, 0.52, 0.12),
            (-18.63, 16.25, z),
            aqua,
            zone,
            "press_return_wayfinding",
            rotation=(0.0, 0.0, -0.42),
            bevel=0.015,
        )

    # Sparse hazard identifiers stay on non-route deck edges.
    for index, x in enumerate((-25.1, -24.2, -19.8, -18.9)):
        add_box(
            f"V4_ARCHIVE_EDGE_HAZARD_{index}",
            (0.52, 0.12, 0.09),
            (x, 22.33, 6.12),
            safety,
            zone,
            "hazard_identifier",
            rotation=(0.0, 0.0, 0.38 if index < 2 else -0.38),
            bevel=0.012,
        )

    # A dark segmented north service wall gives the landmark spatial context
    # without closing the east/west Archive continuation.
    for panel_index, x in enumerate((-24.55, -22.0, -19.45)):
        add_box(
            f"V4_ARCHIVE_NORTH_SERVICE_PANEL_{panel_index}",
            (2.28, 0.16, 3.55),
            (x, 22.42, 8.18),
            ink if panel_index == 1 else ceramic,
            zone,
            "archive_context_wall",
            bevel=0.035,
        )
        add_box(
            f"V4_ARCHIVE_NORTH_PANEL_DATUM_{panel_index}",
            (1.78, 0.07, 0.085),
            (x, 22.31, 9.55),
            amber if panel_index == 1 else steel,
            zone,
            "archive_context_wall",
            bevel=0.015,
        )


def join_new_meshes_by_zone_and_material() -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str], list[bpy.types.Object]] = defaultdict(list)
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.get("kyx_scope") != SCOPE:
            continue
        material_name = obj.data.materials[0].name if obj.data.materials else "NO_MATERIAL"
        grouped[(str(obj.get("kyx_zone")), material_name)].append(obj)

    joined: list[dict[str, Any]] = []
    for (zone, material_name), objects in sorted(grouped.items()):
        bpy.ops.object.select_all(action="DESELECT")
        for obj in objects:
            obj.select_set(True)
        active = objects[0]
        bpy.context.view_layer.objects.active = active
        bpy.ops.object.join()
        active.name = f"V4OPT_{zone.upper()}_{material_name}"
        mark_render_only(active, zone, "joined_authored_art")
        joined.append(
            {
                "name": active.name,
                "zone": zone,
                "material": material_name,
                "sourceObjectCount": len(objects),
            }
        )
    bpy.ops.object.select_all(action="DESELECT")
    return joined


def add_area_light(
    name: str,
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    energy: float,
    color: tuple[float, float, float],
    size: float,
) -> bpy.types.Object:
    data = bpy.data.lights.new(name=name, type="AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    obj["kyx_scope"] = SCOPE
    obj["kyx_role"] = "review_light"
    return obj


def add_camera(
    name: str,
    location: tuple[float, float, float],
    target: tuple[float, float, float],
    lens: float,
) -> bpy.types.Object:
    data = bpy.data.cameras.new(name=name)
    data.lens = lens
    data.sensor_width = 36.0
    data.clip_start = 0.05
    data.clip_end = 500.0
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
    obj["kyx_scope"] = SCOPE
    obj["kyx_role"] = "review_camera"
    obj["kyx_review_target"] = list(target)
    return obj


def render_mesh_bounds() -> dict[str, float]:
    points = [
        obj.matrix_world @ Vector(corner)
        for obj in bpy.context.scene.objects
        if obj.type == "MESH" and not obj.hide_render
        for corner in obj.bound_box
    ]
    if not points:
        raise RuntimeError("Cannot frame Rev4 review cameras without render meshes")
    return {
        "minX": min(point.x for point in points),
        "minY": min(point.y for point in points),
        "minZ": min(point.z for point in points),
        "maxX": max(point.x for point in points),
        "maxY": max(point.y for point in points),
        "maxZ": max(point.z for point in points),
    }


def configure_review_scene() -> dict[str, bpy.types.Object]:
    scene = bpy.context.scene
    bounds = render_mesh_bounds()
    overhead_aspect = 4.0 / 3.0
    overhead_margin_ratio = 0.08
    overhead_center = (
        (bounds["minX"] + bounds["maxX"]) * 0.5,
        (bounds["minY"] + bounds["maxY"]) * 0.5,
    )
    bounded_width = bounds["maxX"] - bounds["minX"]
    bounded_height = bounds["maxY"] - bounds["minY"]
    overhead_scale = (
        max(bounded_width, bounded_height * overhead_aspect)
        * (1.0 + overhead_margin_ratio)
    )
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.006, 0.010, 0.014, 1.0)
    background.inputs["Strength"].default_value = 0.16
    add_area_light(
        "V4_LIGHT_ARCHIVE_WARM",
        (-22.0, 18.0, 13.0),
        (-22.0, 19.0, 7.5),
        680.0,
        (1.0, 0.48, 0.16),
        5.0,
    )
    add_area_light(
        "V4_LIGHT_ROUTE_COOL",
        (-13.0, 8.0, 8.0),
        (-18.0, 10.0, 3.4),
        620.0,
        (0.28, 0.72, 0.82),
        4.2,
    )
    add_area_light(
        "V4_LIGHT_LANDMARK_RIM",
        (-27.0, 20.0, 10.0),
        (-22.0, 20.75, 8.4),
        520.0,
        (1.0, 0.22, 0.08),
        3.0,
    )
    add_area_light(
        "V4_LIGHT_PRESS_FILL",
        (-4.0, 0.0, 10.0),
        (-8.0, 2.0, 2.0),
        460.0,
        (0.55, 0.72, 0.74),
        5.0,
    )
    # One broad, neutral plan light keeps the route and landing readable in
    # the top-down evidence without flattening the warmer Archive landmark.
    add_area_light(
        "V4_LIGHT_OVERHEAD_PLAN",
        (overhead_center[0], overhead_center[1], bounds["maxZ"] + 24.0),
        (overhead_center[0], overhead_center[1], 0.0),
        2600.0,
        (0.58, 0.72, 0.75),
        42.0,
    )
    overhead = add_camera(
        "CAM_V4_OVERHEAD_CONTEXT",
        (overhead_center[0], overhead_center[1], bounds["maxZ"] + 32.0),
        (overhead_center[0], overhead_center[1], 0.0),
        45.0,
    )
    overhead.data.type = "ORTHO"
    overhead.data.ortho_scale = overhead_scale
    overhead["kyx_framed_mesh_bounds_xy"] = [
        bounds["minX"],
        bounds["minY"],
        bounds["maxX"],
        bounds["maxY"],
    ]
    overhead["kyx_frame_aspect"] = overhead_aspect
    overhead["kyx_frame_margin_ratio"] = overhead_margin_ratio
    return {
        "gameplay_continuity": add_camera(
            "CAM_V4_GAMEPLAY_CONTINUITY",
            (16.0, -7.0, 1.72),
            (-18.0, 11.0, 4.50),
            28.0,
        ),
        "press_entry": add_camera(
            "CAM_V4_PRESS_ENTRY",
            (-7.4, -2.6, 3.35),
            (-17.6, 9.4, 3.45),
            34.0,
        ),
        "archive_rise": add_camera(
            "CAM_V4_ARCHIVE_RISE",
            (-10.2, 3.4, 5.75),
            (-19.7, 13.5, 5.10),
            34.0,
        ),
        "landing_arrival": add_camera(
            "CAM_V4_LANDING_ARRIVAL",
            (-13.5, 10.4, 8.60),
            (-22.0, 19.1, 8.02),
            34.0,
        ),
        "index_wheel": add_camera(
            "CAM_V4_INDEX_WHEEL",
            (-22.0, 5.5, 9.80),
            (-22.0, 19.0, 8.20),
            45.0,
        ),
        "press_return": add_camera(
            "CAM_V4_PRESS_RETURN",
            (-24.0, 21.0, 8.90),
            (-15.8, 7.4, 2.75),
            38.0,
        ),
        "overhead_context": overhead,
    }


def render_views(
    output_root: Path,
    cameras: dict[str, bpy.types.Object],
) -> list[dict[str, Any]]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.25
    scene.render.image_settings.color_mode = "RGB"
    render_dir = output_root / "renders"
    render_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for view_id, camera in cameras.items():
        scene.render.resolution_x = 1600
        scene.render.resolution_y = 1200 if view_id == "overhead_context" else 900
        path = render_dir / f"inkfall-rev4-press-archive-{view_id}.png"
        scene.camera = camera
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        results.append({"view": view_id, "path": path})
    return results


def export_render_only(output_root: Path) -> Path:
    path = output_root / "export/inkfall_foundry_press_archive_rev4.spatial-material-joined.glb"
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    selected = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.hide_render:
            continue
        if obj.get("kyx_collision") not in {False, None}:
            continue
        obj.select_set(True)
        selected.append(obj)
    if not selected:
        raise RuntimeError("No render-only meshes selected for Rev4 export")
    bpy.context.view_layer.objects.active = selected[0]
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
    )
    bpy.ops.object.select_all(action="DESELECT")
    return path


def png_dimensions(path: Path) -> list[int]:
    with path.open("rb") as handle:
        if handle.read(8) != b"\x89PNG\r\n\x1a\n":
            raise RuntimeError(f"Invalid PNG signature: {path}")
        length = struct.unpack(">I", handle.read(4))[0]
        if handle.read(4) != b"IHDR" or length < 8:
            raise RuntimeError(f"Missing PNG IHDR: {path}")
        return list(struct.unpack(">II", handle.read(8)))


def artifact(path: Path, repo_root: Path, *, include_resolution: bool = False) -> dict[str, Any]:
    value: dict[str, Any] = {
        "path": path.relative_to(repo_root).as_posix(),
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
    }
    if include_resolution:
        value["resolution"] = png_dimensions(path)
    return value


def mesh_triangles(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def scene_mesh_facts() -> dict[str, Any]:
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    materials = sorted(
        {
            material.name
            for obj in meshes
            for material in obj.data.materials
            if material is not None
        }
    )
    return {
        "meshCount": len(meshes),
        "triangleCount": sum(mesh_triangles(obj) for obj in meshes),
        "materialCount": len(materials),
        "materialNames": materials,
        "rev4JoinedMeshCount": sum(1 for obj in meshes if obj.get("kyx_scope") == SCOPE),
        "parentMeshCount": sum(1 for obj in meshes if obj.get("kyx_scope") != SCOPE),
    }


def family_counts() -> dict[str, int]:
    counts: dict[str, int] = defaultdict(int)
    for obj in bpy.context.scene.objects:
        if obj.get("kyx_scope") == SCOPE:
            counts[str(obj.get("kyx_family", "unknown"))] += 1
    return dict(sorted(counts.items()))


def route_length() -> float:
    return sum(
        (Vector(end) - Vector(start)).length
        for start, end in zip(ROUTE_POINTS, ROUTE_POINTS[1:])
    )


def review_camera_facts(
    cameras: dict[str, bpy.types.Object],
) -> dict[str, dict[str, Any]]:
    facts: dict[str, dict[str, Any]] = {}
    for view_id, camera in cameras.items():
        target = Vector(camera["kyx_review_target"])
        entry: dict[str, Any] = {
            "name": camera.name,
            "projection": camera.data.type,
            "locationBlenderMeters": list(camera.location),
            "targetBlenderMeters": list(target),
            "distanceToTargetMeters": (target - camera.location).length,
            "rotationEulerRadians": list(camera.rotation_euler),
            "clipStartMeters": camera.data.clip_start,
            "clipEndMeters": camera.data.clip_end,
        }
        if camera.data.type == "ORTHO":
            entry["orthoScaleMeters"] = camera.data.ortho_scale
            if "kyx_framed_mesh_bounds_xy" in camera:
                entry["framedMeshBoundsXY"] = list(camera["kyx_framed_mesh_bounds_xy"])
                entry["frameAspect"] = float(camera["kyx_frame_aspect"])
                entry["frameMarginRatio"] = float(camera["kyx_frame_margin_ratio"])
        else:
            entry["lensMillimeters"] = camera.data.lens
        facts[view_id] = entry
    return facts


def main() -> None:
    args = parse_args()
    repo_root = Path(args.repo_root).resolve()
    output_root = Path(args.output_root).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    frozen_before = verify_frozen_inputs(repo_root)

    bpy.ops.wm.open_mainfile(
        filepath=str(repo_root / PARENT_SOURCE),
        load_ui=False,
    )
    parent_meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    parent_material_names = sorted(material.name for material in bpy.data.materials)
    if len(parent_meshes) != EXPECTED_PARENT_MESH_COUNT:
        raise RuntimeError(
            f"Unexpected parent mesh count: {len(parent_meshes)} != {EXPECTED_PARENT_MESH_COUNT}"
        )
    if parent_material_names != sorted(EXPECTED_PARENT_MATERIALS):
        raise RuntimeError(f"Unexpected parent materials: {parent_material_names}")
    materials = {
        name: bpy.data.materials[name]
        for name in EXPECTED_PARENT_MATERIALS
    }

    material_value_hierarchy = tune_rev4_material_values(materials)
    presentation_clearance = carve_route_clearance(parent_meshes)
    build_archive_rise(materials)
    build_archive_landing(materials)
    authored_family_counts_before_join = family_counts()
    joined_meshes = join_new_meshes_by_zone_and_material()
    cameras = configure_review_scene()

    scene = bpy.context.scene
    scene["kyx_scope"] = SCOPE
    scene["kyx_generator_id"] = GENERATOR_ID
    scene["kyx_map_id"] = "inkfall_foundry"
    scene["kyx_authority_revision"] = 3
    scene["kyx_art_revision"] = ART_REVISION
    scene["kyx_catalog_default_revision"] = 1
    scene["kyx_render_only"] = True
    scene["kyx_collision_included"] = False
    scene["kyx_product_selectable"] = False
    scene["kyx_shipping_default"] = False
    scene["kyx_g5_claimed"] = False
    scene["kyx_human_accepted"] = False
    scene["kyx_landmark_gameplay_semantics"] = False

    source_path = output_root / "source/inkfall_foundry_press_archive_rev4.blend"
    source_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path), check_existing=False)
    render_results = render_views(output_root, cameras)
    export_path = export_render_only(output_root)
    bpy.ops.wm.save_as_mainfile(filepath=str(source_path), check_existing=False)

    frozen_after = verify_frozen_inputs(repo_root)
    facts = scene_mesh_facts()
    source_artifact = artifact(source_path, repo_root)
    export_artifact = artifact(export_path, repo_root)
    render_artifacts = [
        artifact(item["path"], repo_root, include_resolution=True) | {"view": item["view"]}
        for item in render_results
    ]
    camera_facts = review_camera_facts(cameras)
    review_resolutions = {
        item["view"]: item["resolution"]
        for item in render_artifacts
    }
    overhead_frame = camera_facts["overhead_context"]
    # Blender's orthographic scale is the horizontal camera span for this
    # landscape render. The vertical span is width divided by aspect.
    overhead_half_width = overhead_frame["orthoScaleMeters"] * 0.5
    overhead_half_height = (
        overhead_frame["orthoScaleMeters"]
        / overhead_frame["frameAspect"]
        * 0.5
    )
    overhead_center_x = overhead_frame["locationBlenderMeters"][0]
    overhead_center_y = overhead_frame["locationBlenderMeters"][1]
    overhead_bounds = overhead_frame["framedMeshBoundsXY"]
    constants_text = (repo_root / "src/content/maps/constants.ts").read_text(encoding="utf-8")
    route_meters = route_length()
    finished_coverage_square_meters = (
        route_meters * ROUTE_WIDTH_METERS
        + LANDING_SIZE[0] * LANDING_SIZE[1]
    )
    checks = {
        "frozenInputsUnchanged": frozen_before == frozen_after,
        "catalogDefaultStillRevision1": "DEFAULT_MAP_REVISION = 1 as const" in constants_text,
        "parentPressHallRetained": facts["parentMeshCount"] == EXPECTED_PARENT_MESH_COUNT,
        "derivativePresentationPortalOpened": (
            len(presentation_clearance["affectedParentMeshes"]) >= 1
            and presentation_clearance["frozenParentSourceModified"] is False
            and presentation_clearance["authorityGeometryModified"] is False
        ),
        "boundedRev4MeshesPresent": 8 <= facts["rev4JoinedMeshCount"] <= 18,
        "onlyApprovedMaterialSetUsed": facts["materialNames"] == sorted(EXPECTED_PARENT_MATERIALS),
        "renderOnlyNoCollisionObjects": all(
            obj.get("kyx_collision") in {False, None}
            for obj in bpy.context.scene.objects
            if obj.type == "MESH"
        ),
        "routeLengthMateriallyExpanded": route_meters >= 17.0,
        "finishedCoverageMateriallyExpanded": finished_coverage_square_meters >= 90.0,
        "clearVisualLaneAtLeastTwoMeters": ROUTE_WIDTH_METERS >= 2.0,
        "singleFocalLandmarkFamily": (
            authored_family_counts_before_join.get("index_wheel_landmark", 0) >= 10
        ),
        "functionalWayfindingPresent": (
            authored_family_counts_before_join.get("route_wayfinding", 0) >= 6
            and authored_family_counts_before_join.get("oversized_wayfinding", 0) >= 6
            and authored_family_counts_before_join.get("press_return_wayfinding", 0) >= 3
        ),
        "routeTreadsUseLighterInheritedCeramic": any(
            item["zone"] == "archive_rise"
            and item["material"] == "V3_USED_CERAMIC"
            for item in joined_meshes
        ),
        "restrainedNeutralValueHierarchySeparated": (
            material_value_hierarchy["V3_USED_CERAMIC"]["baseColorLinear"][0]
            - material_value_hierarchy["V3_WORN_STEEL"]["baseColorLinear"][0]
            >= 0.18
            and material_value_hierarchy["V3_WORN_STEEL"]["baseColorLinear"][0]
            - material_value_hierarchy["V3_CAST_IRON"]["baseColorLinear"][0]
            >= 0.08
        ),
        "levelWideGameplayFovContinuityEvidence": (
            camera_facts["gameplay_continuity"]["projection"] == "PERSP"
            and 24.0
            <= camera_facts["gameplay_continuity"]["lensMillimeters"]
            <= 32.0
            and abs(camera_facts["gameplay_continuity"]["locationBlenderMeters"][2] - 1.72)
            <= 0.01
            and camera_facts["gameplay_continuity"]["distanceToTargetMeters"] >= 35.0
        ),
        "overheadEvidenceTopDownUnrolledAndContainsExpansion": (
            camera_facts["overhead_context"]["projection"] == "ORTHO"
            and all(
                abs(value) <= 1e-5
                for value in camera_facts["overhead_context"]["rotationEulerRadians"]
            )
            and review_resolutions.get("overhead_context") == [1600, 1200]
            and overhead_bounds[0] >= overhead_center_x - overhead_half_width
            and overhead_bounds[2] <= overhead_center_x + overhead_half_width
            and overhead_bounds[1] >= overhead_center_y - overhead_half_height
            and overhead_bounds[3] <= overhead_center_y + overhead_half_height
        ),
        "landmarkEvidencePulledBackForSpatialContext": (
            camera_facts["index_wheel"]["projection"] == "PERSP"
            and camera_facts["index_wheel"]["distanceToTargetMeters"] >= 13.5
            and camera_facts["index_wheel"]["lensMillimeters"] <= 45.0
        ),
        "sevenFreshReviewRenders": (
            len(render_artifacts) == 7
            and all(
                item["resolution"]
                == ([1600, 1200] if item["view"] == "overhead_context" else [1600, 900])
                for item in render_artifacts
            )
        ),
        "glbWritten": export_artifact["bytes"] > 1024,
    }
    status = (
        "INKFALL_REV4_PRESS_ARCHIVE_ART_BUILD_PASS_G5_OPEN"
        if all(checks.values())
        else "INKFALL_REV4_PRESS_ARCHIVE_ART_BUILD_FAIL_G5_OPEN"
    )
    report = {
        "schemaVersion": 1,
        "kind": "inkfall_foundry_rev4_press_archive_authored_art_build_report",
        "status": status,
        "scope": SCOPE,
        "checks": checks,
        "binding": {
            "mapId": "inkfall_foundry",
            "authorityRevision": 3,
            "authorityPackageDigest": "260b90de2e0c2d51fa01e166d11401a04a1cb76943042de9993e85560e37f39a",
            "authorityFixtureHash": "6cf785c5171f2ff5",
            "catalogDefaultRevision": 1,
            "artRevision": ART_REVISION,
            "explicitInspectionOnly": True,
            "runtimeIntegrated": False,
            "shippingDefault": False,
            "renderGeometryMayBeAuthority": False,
        },
        "generator": {
            "id": GENERATOR_ID,
            "version": 2,
            "blenderVersion": bpy.app.version_string,
            "builder": artifact(Path(__file__).resolve(), repo_root),
        },
        "parent": {
            "id": "inkfall_foundry_press_hall_material_export_v3_3",
            "source": frozen_after["parentPressHallV33Source"],
            "export": frozen_after["parentPressHallV33Export"],
        },
        "derivativePresentationClearance": presentation_clearance,
        "expansion": {
            "id": "west_archive_rise_and_paper_archive_landing",
            "routePointsBlenderMeters": [list(point) for point in ROUTE_POINTS],
            "routeLengthMeters": route_meters,
            "visualLaneWidthMeters": ROUTE_WIDTH_METERS,
            "landingCenterBlenderMeters": list(LANDING_CENTER),
            "landingSizeMeters": list(LANDING_SIZE),
            "estimatedFinishedCoverageSquareMeters": finished_coverage_square_meters,
            "coordinateContract": "Blender X east, Y north, Z up; map x,z,y millimeters",
            "authorityRouteAlignment": [
                "R_ROUTE__PRESS_WEST_ARCHIVE__S00",
                "R_ROUTE__PRESS_WEST_ARCHIVE__S01",
                "R_ROUTE__PRESS_WEST_ARCHIVE__S02",
                "R_NODE__ARCHIVE_WEST",
            ],
            "clearRouteIntent": "Press Hall to west Paper Archive ascent and landing",
            "landmark": {
                "id": "archive_index_wheel",
                "role": "visual_orientation_only",
                "gameplayObjective": False,
            },
        },
        "authoredFamilyCountsBeforeJoin": authored_family_counts_before_join,
        "materialValueHierarchy": material_value_hierarchy,
        "reviewEvidenceContract": {
            "gameplayContinuity": {
                "intent": (
                    "single level-wide gameplay-eye-height frame showing Press Hall, "
                    "the west ascent, and the Archive landmark in one continuous view"
                ),
                "view": "gameplay_continuity",
                "resolution": review_resolutions["gameplay_continuity"],
                "camera": camera_facts["gameplay_continuity"],
            },
            "overheadContext": {
                "intent": (
                    "orthographic, zero-roll top-down frame containing the complete "
                    "bounded Press Hall parent plus Press-to-Archive authored expansion "
                    "without edge clipping; this is not map-wide Inkfall coverage"
                ),
                "view": "overhead_context",
                "resolution": review_resolutions["overhead_context"],
                "camera": camera_facts["overhead_context"],
            },
            "landmarkContext": {
                "intent": (
                    "pulled-back spatial framing of the Archive index wheel, racks, "
                    "landing deck, gantry, and return rail"
                ),
                "view": "index_wheel",
                "resolution": review_resolutions["index_wheel"],
                "camera": camera_facts["index_wheel"],
            },
        },
        "joinedRev4Meshes": joined_meshes,
        "sceneFacts": facts,
        "frozenInputsBefore": frozen_before,
        "frozenInputsAfter": frozen_after,
        "influenceBoundary": {
            "sourceAudited": "NotHereButAfk/Ev.io at 92b9716, d2ddb75 landmark delta",
            "adaptedAbstractPrinciples": [
                "one recognizable focal landmark",
                "oversized functional route wayfinding",
                "compressed side-route contrast",
                "disciplined route-color hierarchy",
            ],
            "copiedCode": False,
            "copiedGeometry": False,
            "copiedCoordinates": False,
            "copiedWording": False,
            "copiedAssets": False,
            "licenseTextReliedUpon": False,
        },
        "artifacts": {
            "sourceBlend": source_artifact,
            "renderGlb": export_artifact,
            "reviewRenders": render_artifacts,
        },
        "nonClaims": list(NON_CLAIMS),
    }
    report_path = output_root / "validation/inkfall-rev4-press-archive-build-report.json"
    stable_json(report_path, report)
    manifest = {
        "schemaVersion": 1,
        "kind": "inkfall_foundry_non_default_art_review_manifest",
        "id": GENERATOR_ID,
        "status": (
            "bounded_authored_art_candidate_ready_for_human_review_g5_open"
            if all(checks.values())
            else "bounded_authored_art_candidate_build_failed_g5_open"
        ),
        "scope": SCOPE,
        "binding": report["binding"],
        "source": {
            "builder": report["generator"]["builder"],
            "blend": source_artifact,
            "parent": report["parent"],
        },
        "stagedRenderExport": export_artifact | {"runtimeIntegrated": False},
        "reviewRenders": render_artifacts,
        "validation": {
            "buildReport": {
                "path": report_path.relative_to(repo_root).as_posix(),
                "status": status,
            },
        },
        "nonClaims": list(NON_CLAIMS),
    }
    manifest_path = output_root / "manifest.inkfall-rev4-press-archive.json"
    stable_json(manifest_path, manifest)
    print(
        "G5_INKFALL_REV4="
        + json.dumps(
            {
                "status": status,
                "source": str(source_path),
                "export": str(export_path),
                "report": str(report_path),
                "manifest": str(manifest_path),
            },
            sort_keys=True,
        )
    )
    if not all(checks.values()):
        failed = [key for key, value in checks.items() if not value]
        raise RuntimeError(f"Inkfall Rev4 build failed: {failed}")


if __name__ == "__main__":
    main()
