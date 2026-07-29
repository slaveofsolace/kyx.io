"""Prepare the small CC0 geometry-only donor set used by Inkfall Rev5.

Run this with Blender after downloading the Quaternius Modular Sci-Fi MegaKit
Standard archive from the official source. The source glTF files remain outside
the repository; this script strips their materials/textures and exports only the
selected meshes as compact GLBs. Runtime materials and placement are authored by
the Inkfall builder.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
from typing import Any

import bpy


SOURCE_ARCHIVE_SHA256 = (
    "4ca9acbc7a13e7baa48e24c4853b779889b7ab21587004c36668826e705c8a10"
)
SOURCE_PAGE = "https://quaternius.com/packs/modularscifimegakit.html"
DOWNLOAD_PAGE = "https://quaternius.itch.io/modular-sci-fi-megakit"
LICENSE_ID = "CC0-1.0"
LICENSE_URL = "https://creativecommons.org/publicdomain/zero/1.0/"

SELECTED_MODELS = (
    "Door_Frame_SquareTall",
    "Platform_Metal2",
    "Platform_Rails_4WideTall",
    "Column_MetalSupport",
    "Column_MetalSupport_Curve",
    "Column_Pipes",
    "Prop_AccessPoint",
    "Prop_Light_Wide",
    "Prop_PipeHolder",
    "Prop_Vent_Wide",
)


def parse_args() -> argparse.Namespace:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--output-root", required=True)
    return parser.parse_args(arguments)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def prepare_model(
    name: str,
    source_root: Path,
    output_root: Path,
) -> dict[str, Any]:
    clear_scene()
    source_gltf = source_root / f"{name}.gltf"
    source_bin = source_root / f"{name}.bin"
    if not source_gltf.is_file() or not source_bin.is_file():
        raise FileNotFoundError(f"Missing source pair for {name}: {source_root}")

    bpy.ops.import_scene.gltf(filepath=str(source_gltf))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"{name}: imported source contains no mesh")

    for index, obj in enumerate(meshes):
        obj.name = f"QSMK_{name}_{index:02d}"
        obj.data.name = f"QSMK_{name}_Mesh_{index:02d}"
        obj.data.materials.clear()
        obj["kyx_donor_origin"] = "Quaternius Modular Sci-Fi MegaKit Standard"
        obj["kyx_donor_model"] = name
        obj["kyx_donor_license"] = LICENSE_ID
        obj["kyx_donor_geometry_only"] = True
        obj["kyx_collision"] = False
        obj["kyx_authority"] = False

    output_path = output_root / f"{name}.geometry-only.glb"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
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

    return {
        "id": name,
        "sourceFiles": [
            {
                "name": source_gltf.name,
                "bytes": source_gltf.stat().st_size,
                "sha256": sha256(source_gltf),
            },
            {
                "name": source_bin.name,
                "bytes": source_bin.stat().st_size,
                "sha256": sha256(source_bin),
            },
        ],
        "derivedGeometryOnlyGlb": {
            "name": output_path.name,
            "bytes": output_path.stat().st_size,
            "sha256": sha256(output_path),
            "meshCount": len(meshes),
        },
    }


def main() -> None:
    args = parse_args()
    source_root = Path(args.source_root).resolve()
    output_root = Path(args.output_root).resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    records = [
        prepare_model(name, source_root, output_root)
        for name in SELECTED_MODELS
    ]
    manifest = {
        "kind": "inkfall_rev5_cc0_geometry_only_donor_manifest",
        "source": {
            "creator": "Quaternius",
            "pack": "Modular Sci-Fi MegaKit Standard",
            "sourcePage": SOURCE_PAGE,
            "downloadPage": DOWNLOAD_PAGE,
            "downloadedArchiveSha256": SOURCE_ARCHIVE_SHA256,
            "licenseId": LICENSE_ID,
            "licenseUrl": LICENSE_URL,
        },
        "process": {
            "script": Path(__file__).name,
            "geometryOnly": True,
            "materialsIncluded": False,
            "texturesIncluded": False,
            "animationsIncluded": False,
            "runtimeCollisionAuthority": False,
        },
        "models": records,
    }
    manifest_path = output_root / "geometry-only-donor-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"INKFALL_DONOR_MANIFEST={manifest_path}")


if __name__ == "__main__":
    main()
