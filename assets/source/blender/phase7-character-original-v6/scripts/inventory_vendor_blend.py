"""Inventory a quarantined vendor .blend without trusting embedded automation.

Run only with Blender 5.1 using ``--factory-startup --disable-autoexec``.
This script is project-authored and records data blocks; it does not evaluate
or execute text blocks stored in the inspected file.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

import bpy


def script_args() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected: -- <vendor.blend> <output.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def names(items) -> list[str]:
    return sorted(item.name for item in items)


def driver_inventory() -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for collection_name in (
        "objects",
        "meshes",
        "materials",
        "node_groups",
        "shape_keys",
        "worlds",
        "scenes",
    ):
        for block in getattr(bpy.data, collection_name):
            animation = getattr(block, "animation_data", None)
            if animation and animation.drivers:
                records.append(
                    {
                        "dataBlockType": collection_name,
                        "dataBlock": block.name,
                        "driverCount": len(animation.drivers),
                        "dataPaths": sorted(driver.data_path for driver in animation.drivers),
                    }
                )
    return records


def object_record(obj: bpy.types.Object) -> dict[str, object]:
    bound_box = []
    if obj.type == "MESH":
        bound_box = [[round(value, 6) for value in corner] for corner in obj.bound_box]
    return {
        "name": obj.name,
        "type": obj.type,
        "data": obj.data.name if obj.data else None,
        "collections": sorted(collection.name for collection in obj.users_collection),
        "parent": obj.parent.name if obj.parent else None,
        "library": obj.library.filepath if obj.library else None,
        "vertexCount": len(obj.data.vertices) if obj.type == "MESH" else None,
        "edgeCount": len(obj.data.edges) if obj.type == "MESH" else None,
        "polygonCount": len(obj.data.polygons) if obj.type == "MESH" else None,
        "materialSlots": [slot.material.name if slot.material else None for slot in obj.material_slots],
        "modifierTypes": [modifier.type for modifier in obj.modifiers],
        "shapeKeys": (
            names(obj.data.shape_keys.key_blocks)
            if obj.type == "MESH" and obj.data.shape_keys
            else []
        ),
        "boundBoxLocal": bound_box,
        "assetData": bool(obj.asset_data),
        "customProperties": sorted(key for key in obj.keys() if key != "_RNA_UI"),
    }


def main() -> None:
    args = script_args()
    if len(args) != 2:
        raise SystemExit("Expected: -- <vendor.blend> <output.json>")
    source = Path(args[0]).resolve()
    output = Path(args[1]).resolve()
    if bpy.data.filepath and Path(bpy.data.filepath).resolve() != source:
        raise SystemExit(f"Unexpected opened file: {bpy.data.filepath}")

    record = {
        "schemaVersion": 1,
        "inventoryUtc": __import__("datetime").datetime.now(
            __import__("datetime").timezone.utc
        ).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "autoexecFail": bool(bpy.app.autoexec_fail),
        "source": {
            "fileName": source.name,
            "bytes": source.stat().st_size,
            "sha256": sha256(source),
        },
        "collections": [
            {
                "name": collection.name,
                "objects": sorted(obj.name for obj in collection.objects),
                "children": sorted(child.name for child in collection.children),
                "assetData": bool(collection.asset_data),
                "library": collection.library.filepath if collection.library else None,
            }
            for collection in sorted(bpy.data.collections, key=lambda item: item.name)
        ],
        "objects": [object_record(obj) for obj in sorted(bpy.data.objects, key=lambda item: item.name)],
        "meshes": names(bpy.data.meshes),
        "materials": names(bpy.data.materials),
        "images": [
            {
                "name": image.name,
                "source": image.source,
                "filepath": image.filepath,
                "packed": image.packed_file is not None,
                "library": image.library.filepath if image.library else None,
            }
            for image in sorted(bpy.data.images, key=lambda item: item.name)
        ],
        "texts": [
            {
                "name": block.name,
                "bytes": len(block.as_string().encode("utf-8")),
                "sha256": hashlib.sha256(block.as_string().encode("utf-8")).hexdigest(),
                "content": block.as_string(),
                "currentLine": block.current_line_index,
                "library": block.library.filepath if block.library else None,
            }
            for block in sorted(bpy.data.texts, key=lambda item: item.name)
        ],
        "actions": names(bpy.data.actions),
        "armatures": names(bpy.data.armatures),
        "nodeGroups": names(bpy.data.node_groups),
        "worlds": names(bpy.data.worlds),
        "scenes": names(bpy.data.scenes),
        "libraries": [library.filepath for library in bpy.data.libraries],
        "drivers": driver_inventory(),
        "handlers": {
            name: [getattr(handler, "__name__", repr(handler)) for handler in getattr(bpy.app.handlers, name)]
            for name in (
                "load_post",
                "depsgraph_update_post",
                "frame_change_pre",
                "frame_change_post",
                "render_pre",
                "render_post",
                "save_post",
            )
        },
        "externalFiles": sorted(
            set(
                item
                for item in bpy.utils.blend_paths(absolute=True, packed=False)
                if item
            )
        ),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(
        "VENDOR_BLEND_INVENTORY_COMPLETE "
        f"collections={len(record['collections'])} objects={len(record['objects'])} "
        f"texts={len(record['texts'])} drivers={len(record['drivers'])}"
    )


if __name__ == "__main__":
    main()
