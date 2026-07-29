"""Prepare Polygonal Mind's CC0 ABM Teleporter01 for Inkfall Rev5.

The preserved upstream GLB contains a textured gateway and a fused center orb.
This deterministic preparation step verifies the exact upstream artifact,
identifies the orb by its welded-coordinate topology, removes only that orb,
bakes the imported world transform, normalizes the frame to a floor-centered
origin, and exports material-free render geometry. Inkfall assigns its own
materials and energy/VFX at build time.
"""

from __future__ import annotations

import argparse
from collections import defaultdict, deque
import hashlib
import json
from pathlib import Path
import sys
from typing import Any

import bpy
from mathutils import Vector


SOURCE_REPOSITORY = "https://github.com/ToxSam/cc0-models-Polygonal-Mind"
SOURCE_REVISION = "56db2d4088512531a070d0bf3eb9d284d077528d"
SOURCE_MODEL_PATH = "projects/abm/Teleporter01_Art.glb"
SOURCE_MODEL_URL = (
    "https://raw.githubusercontent.com/ToxSam/cc0-models-Polygonal-Mind/"
    f"{SOURCE_REVISION}/{SOURCE_MODEL_PATH}"
)
ORIGINAL_INITIATIVE = (
    "https://github.com/PolygonalMind/initiative-opensource-release"
)
LICENSE_ID = "CC0-1.0"
LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"
EXPECTED_SOURCE_BYTES = 253_020
EXPECTED_SOURCE_SHA256 = (
    "566822f43f2ca4c7cc435d7229f75878c2f33f69c31f3b1b6179fd9201918e5c"
)
EXPECTED_SOURCE_TRIANGLES = 918
EXPECTED_ORB_TRIANGLES = 180
EXPECTED_PLATE_TRIANGLES = 50
EXPECTED_FRAME_TRIANGLES = 688
LEG_SHORTEN_METERS = 0.65
LEG_TOP_THRESHOLD_METERS = 1.5


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-glb", required=True)
    parser.add_argument("--output-root", required=True)
    return parser.parse_args(arguments)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def triangle_count(polygons: list[Any]) -> int:
    return sum(max(0, len(polygon.vertices) - 2) for polygon in polygons)


def rounded_vector(value: Vector) -> list[float]:
    return [round(component, 6) for component in value]


def coordinate_key(value: Vector) -> tuple[int, int, int]:
    scale = 1_000_000
    return tuple(round(component * scale) for component in value)


def polygon_components(
    source: bpy.types.Object,
    polygons: list[Any],
) -> list[list[int]]:
    """Connect faces through welded coordinates, including duplicated seams."""

    coordinate_faces: dict[tuple[int, int, int], list[int]] = defaultdict(list)
    for polygon_index, polygon in enumerate(polygons):
        for vertex_index in polygon.vertices:
            coordinate_faces[
                coordinate_key(source.data.vertices[vertex_index].co)
            ].append(polygon_index)

    neighbors: list[set[int]] = [set() for _ in polygons]
    for linked_faces in coordinate_faces.values():
        for polygon_index in linked_faces:
            neighbors[polygon_index].update(linked_faces)

    unvisited = set(range(len(polygons)))
    components: list[list[int]] = []
    while unvisited:
        seed = min(unvisited)
        queue: deque[int] = deque((seed,))
        component: list[int] = []
        unvisited.remove(seed)
        while queue:
            polygon_index = queue.popleft()
            component.append(polygon_index)
            for neighbor in sorted(neighbors[polygon_index]):
                if neighbor in unvisited:
                    unvisited.remove(neighbor)
                    queue.append(neighbor)
        components.append(sorted(component))
    return components


def main() -> None:
    args = parse_args()
    source_glb = Path(args.source_glb).resolve()
    output_root = Path(args.output_root).resolve()
    if not source_glb.is_file():
        raise FileNotFoundError(f"Missing source GLB: {source_glb}")
    if source_glb.stat().st_size != EXPECTED_SOURCE_BYTES:
        raise RuntimeError("Teleporter01 source byte count changed")
    if sha256(source_glb) != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("Teleporter01 source hash changed")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source_glb))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one source mesh, found {len(meshes)}")
    if any(obj.type in {"CAMERA", "LIGHT"} for obj in bpy.context.scene.objects):
        raise RuntimeError("Teleporter01 source unexpectedly contains camera/light")
    if bpy.data.actions:
        raise RuntimeError("Teleporter01 source unexpectedly contains animation")

    source = meshes[0]
    polygons = list(source.data.polygons)
    source_triangles = triangle_count(polygons)
    if source_triangles != EXPECTED_SOURCE_TRIANGLES:
        raise RuntimeError(
            f"Unexpected Teleporter01 triangle count: {source_triangles}"
        )

    components = polygon_components(source, polygons)
    orb_candidates = [
        component
        for component in components
        if triangle_count([polygons[index] for index in component])
        == EXPECTED_ORB_TRIANGLES
    ]
    if len(orb_candidates) != 1:
        raise RuntimeError(
            "Expected exactly one 180-triangle center orb component; "
            f"found {len(orb_candidates)}"
        )
    orb_faces = set(orb_candidates[0])
    orb_vertex_indices = {
        vertex_index
        for polygon_index in orb_faces
        for vertex_index in polygons[polygon_index].vertices
    }
    orb_world_points = [
        source.matrix_world @ source.data.vertices[index].co
        for index in orb_vertex_indices
    ]
    orb_world_center = Vector(
        (
            (
                min(point.x for point in orb_world_points)
                + max(point.x for point in orb_world_points)
            )
            * 0.5,
            (
                min(point.y for point in orb_world_points)
                + max(point.y for point in orb_world_points)
            )
            * 0.5,
            (
                min(point.z for point in orb_world_points)
                + max(point.z for point in orb_world_points)
            )
            * 0.5,
        )
    )
    plate_faces = {
        polygon_index
        for polygon_index, polygon in enumerate(polygons)
        if polygon_index not in orb_faces
        and (
            max(
                (
                    source.matrix_world
                    @ source.data.vertices[vertex_index].co
                ).y
                for vertex_index in polygon.vertices
            )
            - min(
                (
                    source.matrix_world
                    @ source.data.vertices[vertex_index].co
                ).y
                for vertex_index in polygon.vertices
            )
            <= 0.0001
        )
        and any(
            abs(
                (
                    source.matrix_world
                    @ source.data.vertices[vertex_index].co
                ).x
                - orb_world_center.x
            )
            <= 0.00001
            and abs(
                (
                    source.matrix_world
                    @ source.data.vertices[vertex_index].co
                ).z
                - orb_world_center.z
            )
            <= 0.00001
            for vertex_index in polygon.vertices
        )
    }
    plate_triangles = triangle_count(
        [polygons[index] for index in plate_faces]
    )
    if plate_triangles != EXPECTED_PLATE_TRIANGLES:
        raise RuntimeError(
            "Unexpected Teleporter01 fused center-plate topology: "
            f"{plate_triangles} triangles"
        )
    frame_polygons = [
        polygon
        for polygon_index, polygon in enumerate(polygons)
        if polygon_index not in orb_faces
        and polygon_index not in plate_faces
    ]
    frame_triangles = triangle_count(frame_polygons)
    if frame_triangles != EXPECTED_FRAME_TRIANGLES:
        raise RuntimeError(
            f"Unexpected frame-only triangle count: {frame_triangles}"
        )

    used_indices = sorted(
        {
            vertex_index
            for polygon in frame_polygons
            for vertex_index in polygon.vertices
        }
    )
    world_vertices = {
        index: source.matrix_world @ source.data.vertices[index].co
        for index in used_indices
    }
    minimum = Vector(
        (
            min(point.x for point in world_vertices.values()),
            min(point.y for point in world_vertices.values()),
            min(point.z for point in world_vertices.values()),
        )
    )
    maximum = Vector(
        (
            max(point.x for point in world_vertices.values()),
            max(point.y for point in world_vertices.values()),
            max(point.z for point in world_vertices.values()),
        )
    )
    dimensions = maximum - minimum
    if not (
        1.15 <= dimensions.x <= 1.20
        and 0.15 <= dimensions.y <= 0.20
        and 3.10 <= dimensions.z <= 3.20
    ):
        raise RuntimeError(
            "Teleporter01 imported orientation/bounds changed: "
            f"{rounded_vector(dimensions)}"
        )

    floor_center = Vector(
        (
            (minimum.x + maximum.x) * 0.5,
            (minimum.y + maximum.y) * 0.5,
            minimum.z,
        )
    )
    remap = {
        source_index: output_index
        for output_index, source_index in enumerate(used_indices)
    }
    normalized_vertices = [
        world_vertices[source_index] - floor_center
        for source_index in used_indices
    ]
    if any(
        0.10 < vertex.z < LEG_TOP_THRESHOLD_METERS
        for vertex in normalized_vertices
    ):
        raise RuntimeError(
            "Teleporter01 leg topology changed inside the shortening gap"
        )
    vertices = [
        Vector(
            (
                vertex.x,
                vertex.y,
                vertex.z - (
                    LEG_SHORTEN_METERS
                    if vertex.z >= LEG_TOP_THRESHOLD_METERS
                    else 0.0
                ),
            )
        )
        for vertex in normalized_vertices
    ]
    faces = [
        [remap[source_index] for source_index in polygon.vertices]
        for polygon in frame_polygons
    ]

    bpy.ops.wm.read_factory_settings(use_empty=True)
    mesh = bpy.data.meshes.new("PM_ABM_TELEPORTER01_FRAME_MESH")
    mesh.from_pydata([tuple(vertex) for vertex in vertices], [], faces)
    mesh.update()
    frame = bpy.data.objects.new("PM_ABM_TELEPORTER01_FRAME", mesh)
    bpy.context.scene.collection.objects.link(frame)
    frame["kyx_donor_origin"] = "Polygonal Mind ABM Teleporter01_Art"
    frame["kyx_donor_model"] = "Teleporter01_Art"
    frame["kyx_donor_part"] = "frame"
    frame["kyx_donor_license"] = LICENSE_ID
    frame["kyx_donor_geometry_only"] = True
    frame["kyx_source_orb_removed"] = True
    frame["kyx_source_center_plate_removed"] = True
    frame["kyx_collision"] = False
    frame["kyx_authority"] = False

    output_root.mkdir(parents=True, exist_ok=True)
    output_path = output_root / "Teleporter01_Art.frame.geometry-only.glb"
    bpy.ops.object.select_all(action="DESELECT")
    frame.select_set(True)
    bpy.context.view_layer.objects.active = frame
    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
        export_materials="NONE",
        export_animations=False,
    )

    derived_minimum = Vector(
        (
            min(point.x for point in vertices),
            min(point.y for point in vertices),
            min(point.z for point in vertices),
        )
    )
    derived_maximum = Vector(
        (
            max(point.x for point in vertices),
            max(point.y for point in vertices),
            max(point.z for point in vertices),
        )
    )
    manifest = {
        "kind": "inkfall_rev5_cc0_portal_frame_geometry_only_manifest",
        "source": {
            "creator": "Polygonal Mind",
            "conversionRepositoryMaintainer": "ToxSam",
            "model": "Teleporter01_Art",
            "repository": SOURCE_REPOSITORY,
            "repositoryRevision": SOURCE_REVISION,
            "modelPath": SOURCE_MODEL_PATH,
            "modelUrl": SOURCE_MODEL_URL,
            "originalInitiative": ORIGINAL_INITIATIVE,
            "licenseId": LICENSE_ID,
            "licenseUrl": LICENSE_URL,
            "originalGlb": {
                "name": source_glb.name,
                "bytes": source_glb.stat().st_size,
                "sha256": sha256(source_glb),
            },
        },
        "process": {
            "script": Path(__file__).name,
            "geometryOnly": True,
            "sourceOrbRemoved": True,
            "sourceCenterPlateRemoved": True,
            "authoredLegsShortenedMeters": LEG_SHORTEN_METERS,
            "sourceMaterialsReplacedAtRuntimeBuild": True,
            "materialsIncluded": False,
            "texturesIncluded": False,
            "animationsIncluded": False,
            "runtimeCollisionAuthority": False,
        },
        "model": {
            "id": "Teleporter01_Art_Frame",
            "sourceTriangleCount": source_triangles,
            "removedOrbTriangleCount": EXPECTED_ORB_TRIANGLES,
            "removedCenterPlateTriangleCount": EXPECTED_PLATE_TRIANGLES,
            "triangleCount": frame_triangles,
            "boundsMinimumMeters": rounded_vector(derived_minimum),
            "boundsMaximumMeters": rounded_vector(derived_maximum),
            "dimensionsMeters": rounded_vector(
                derived_maximum - derived_minimum
            ),
            "derivedGeometryOnlyGlb": {
                "name": output_path.name,
                "bytes": output_path.stat().st_size,
                "sha256": sha256(output_path),
                "meshCount": 1,
                "materialCount": 0,
            },
        },
    }
    manifest_path = output_root / "geometry-only-donor-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"INKFALL_PORTAL_FRAME_DONOR_MANIFEST={manifest_path}")


if __name__ == "__main__":
    main()
