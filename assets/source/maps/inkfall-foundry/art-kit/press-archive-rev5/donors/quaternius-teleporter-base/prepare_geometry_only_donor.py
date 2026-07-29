"""Prepare the CC0 Quaternius Teleporter Base for Inkfall Rev5.

The original Poly Pizza GLB is preserved beside this script. This preparation
step verifies the exact source contract, splits the three authored color groups
into named material-free parts, bakes the imported world transform, and exports
only render geometry. Inkfall assigns its own materials at build time.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
from typing import Any

import bpy
from mathutils import Vector


SOURCE_PAGE = "https://poly.pizza/m/OIezStCmak"
MODEL_URL = (
    "https://static.poly.pizza/"
    "39432e22-8304-40c5-8fc6-0fdf2a19c7e1.glb"
)
LICENSE_ID = "CC0-1.0"
LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"
EXPECTED_SOURCE_BYTES = 30_588
EXPECTED_SOURCE_SHA256 = (
    "29a296a33fc557c3765fec79cf06d6a262949b1fe6adca4c69ca7b2d3ecb2ac3"
)
EXPECTED_PARTS = {
    "DarkGrey": ("darkgrey", 222),
    "Main": ("main", 238),
    "Accent": ("accent", 96),
}


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


def main() -> None:
    args = parse_args()
    source_glb = Path(args.source_glb).resolve()
    output_root = Path(args.output_root).resolve()
    if not source_glb.is_file():
        raise FileNotFoundError(f"Missing source GLB: {source_glb}")
    if source_glb.stat().st_size != EXPECTED_SOURCE_BYTES:
        raise RuntimeError("Teleporter Base source byte count changed")
    if sha256(source_glb) != EXPECTED_SOURCE_SHA256:
        raise RuntimeError("Teleporter Base source hash changed")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(source_glb))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if len(meshes) != 1:
        raise RuntimeError(f"Expected one source mesh, found {len(meshes)}")
    if any(obj.type in {"CAMERA", "LIGHT"} for obj in bpy.context.scene.objects):
        raise RuntimeError("Teleporter Base source unexpectedly contains camera/light")
    if bpy.data.actions:
        raise RuntimeError("Teleporter Base source unexpectedly contains animation")
    if bpy.data.images or bpy.data.textures:
        raise RuntimeError("Teleporter Base source unexpectedly contains textures")

    source = meshes[0]
    material_names = [material.name for material in source.data.materials]
    if material_names != list(EXPECTED_PARTS):
        raise RuntimeError(
            f"Unexpected Teleporter Base material groups: {material_names}"
        )
    if source.data.uv_layers:
        raise RuntimeError("Teleporter Base source unexpectedly contains UV layers")

    source_polygons = list(source.data.polygons)
    total_triangles = triangle_count(source_polygons)
    if total_triangles != sum(record[1] for record in EXPECTED_PARTS.values()):
        raise RuntimeError(
            f"Unexpected Teleporter Base triangle count: {total_triangles}"
        )

    part_geometry: list[dict[str, Any]] = []
    all_points: list[Vector] = []
    for material_index, material_name in enumerate(material_names):
        part_id, expected_triangles = EXPECTED_PARTS[material_name]
        polygons = [
            polygon
            for polygon in source_polygons
            if polygon.material_index == material_index
        ]
        actual_triangles = triangle_count(polygons)
        if actual_triangles != expected_triangles:
            raise RuntimeError(
                f"Unexpected {material_name} triangle count: {actual_triangles}"
            )
        used_indices = sorted(
            {
                vertex_index
                for polygon in polygons
                for vertex_index in polygon.vertices
            }
        )
        remap = {
            source_index: output_index
            for output_index, source_index in enumerate(used_indices)
        }
        vertices = [
            source.matrix_world @ source.data.vertices[index].co
            for index in used_indices
        ]
        faces = [
            [remap[index] for index in polygon.vertices]
            for polygon in polygons
        ]
        all_points.extend(vertices)
        part_geometry.append(
            {
                "id": part_id,
                "sourceMaterial": material_name,
                "vertices": vertices,
                "faces": faces,
                "triangleCount": actual_triangles,
            }
        )

    minimum = Vector(
        (
            min(point.x for point in all_points),
            min(point.y for point in all_points),
            min(point.z for point in all_points),
        )
    )
    maximum = Vector(
        (
            max(point.x for point in all_points),
            max(point.y for point in all_points),
            max(point.z for point in all_points),
        )
    )
    expected_dimensions = Vector((2.396047, 2.396047, 0.320313))
    if any(
        abs(actual - expected) > 0.00001
        for actual, expected in zip(maximum - minimum, expected_dimensions)
    ):
        raise RuntimeError(
            "Teleporter Base dimensions changed: "
            f"{rounded_vector(maximum - minimum)}"
        )

    bpy.ops.wm.read_factory_settings(use_empty=True)
    exported_objects: list[bpy.types.Object] = []
    part_records: list[dict[str, Any]] = []
    for part in part_geometry:
        mesh = bpy.data.meshes.new(f"QTB_TELEPORTER_BASE_{part['id'].upper()}_MESH")
        mesh.from_pydata(
            [tuple(vertex) for vertex in part["vertices"]],
            [],
            part["faces"],
        )
        mesh.update()
        obj = bpy.data.objects.new(
            f"QTB_TELEPORTER_BASE_{part['id'].upper()}",
            mesh,
        )
        bpy.context.scene.collection.objects.link(obj)
        obj["kyx_donor_origin"] = "Quaternius Teleporter Base via Poly Pizza"
        obj["kyx_donor_model"] = "Teleporter_Base"
        obj["kyx_donor_part"] = part["id"]
        obj["kyx_donor_license"] = LICENSE_ID
        obj["kyx_donor_geometry_only"] = True
        obj["kyx_collision"] = False
        obj["kyx_authority"] = False
        exported_objects.append(obj)
        part_records.append(
            {
                "id": part["id"],
                "sourceMaterial": part["sourceMaterial"],
                "triangleCount": part["triangleCount"],
                "vertexCount": len(part["vertices"]),
            }
        )

    output_root.mkdir(parents=True, exist_ok=True)
    output_path = output_root / "Teleporter_Base.geometry-only.glb"
    bpy.ops.object.select_all(action="DESELECT")
    for obj in exported_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = exported_objects[0]
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

    manifest = {
        "kind": "inkfall_rev5_cc0_portal_machine_geometry_only_manifest",
        "source": {
            "creator": "Quaternius",
            "model": "Teleporter Base",
            "sourcePage": SOURCE_PAGE,
            "modelUrl": MODEL_URL,
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
            "sourceMaterialsReplacedAtRuntimeBuild": True,
            "materialsIncluded": False,
            "texturesIncluded": False,
            "animationsIncluded": False,
            "runtimeCollisionAuthority": False,
        },
        "model": {
            "id": "Teleporter_Base",
            "triangleCount": total_triangles,
            "boundsMinimumMeters": rounded_vector(minimum),
            "boundsMaximumMeters": rounded_vector(maximum),
            "dimensionsMeters": rounded_vector(maximum - minimum),
            "parts": part_records,
            "derivedGeometryOnlyGlb": {
                "name": output_path.name,
                "bytes": output_path.stat().st_size,
                "sha256": sha256(output_path),
                "meshCount": len(exported_objects),
                "materialCount": 0,
            },
        },
    }
    manifest_path = output_root / "geometry-only-donor-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"INKFALL_PORTAL_MACHINE_DONOR_MANIFEST={manifest_path}")


if __name__ == "__main__":
    main()
