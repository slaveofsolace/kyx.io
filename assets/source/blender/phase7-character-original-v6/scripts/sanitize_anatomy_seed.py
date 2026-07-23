"""Append and sanitize the selected CC0 male anatomy sculpt seed.

This is deliberately append-only: the vendor scene is never used as the
working scene, and only the audited ``Body Male - Realistic`` collection is
requested. Run with Blender 5.1, factory startup, autoexec disabled, and a
blank startup file.
"""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

import bpy


SELECTED_COLLECTION = "Body Male - Realistic"
EXPECTED_OBJECTS = {
    "GEO-body_male_realistic",
    "GEO-body_male_realistic.eye.L",
    "GEO-body_male_realistic.eye.R",
}
OUTPUT_COLLECTION = "KYX_V6_CC0_AnatomySeed_MaleRealistic"
OBJECT_RENAMES = {
    "GEO-body_male_realistic": "KYX_V6_CC0_AnatomySeed_Body",
    "GEO-body_male_realistic.eye.L": "KYX_V6_CC0_AnatomySeed_Eye.L",
    "GEO-body_male_realistic.eye.R": "KYX_V6_CC0_AnatomySeed_Eye.R",
}


def args_after_separator() -> list[str]:
    if "--" not in sys.argv:
        raise SystemExit("Expected: -- <vendor.blend> <sanitized.blend> <report.json>")
    return sys.argv[sys.argv.index("--") + 1 :]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clear_blank_scene() -> None:
    for scene in bpy.data.scenes:
        for obj in list(scene.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for store in (
        bpy.data.meshes,
        bpy.data.curves,
        bpy.data.armatures,
        bpy.data.materials,
        bpy.data.images,
        bpy.data.actions,
        bpy.data.texts,
        bpy.data.cameras,
        bpy.data.lights,
        bpy.data.node_groups,
    ):
        for block in list(store):
            store.remove(block)


def remove_all_drivers() -> int:
    removed = 0
    stores = (
        bpy.data.objects,
        bpy.data.meshes,
        bpy.data.materials,
        bpy.data.node_groups,
        bpy.data.shape_keys,
        bpy.data.worlds,
        bpy.data.scenes,
    )
    for store in stores:
        for block in store:
            animation = getattr(block, "animation_data", None)
            if not animation:
                continue
            removed += len(animation.drivers)
            block.animation_data_clear()
    return removed


def handler_snapshot() -> dict[str, list[str]]:
    snapshot: dict[str, list[str]] = {}
    for name in dir(bpy.app.handlers):
        value = getattr(bpy.app.handlers, name)
        if not isinstance(value, list):
            continue
        # Application handlers are process state and are not stored in the
        # output blend. Record the factory-startup baseline, but do not remove
        # Blender's own handlers (doing so would corrupt orderly shutdown).
        snapshot[name] = [
            f"{getattr(item, '__module__', '')}.{getattr(item, '__name__', repr(item))}"
            for item in value
        ]
    return snapshot


def strip_custom_properties(block) -> None:
    for key in list(block.keys()):
        if key != "_RNA_UI":
            del block[key]
    if "_RNA_UI" in block:
        del block["_RNA_UI"]


def modifier_record(modifier) -> dict[str, object]:
    record: dict[str, object] = {
        "name": modifier.name,
        "type": modifier.type,
        "showViewport": modifier.show_viewport,
        "showRender": modifier.show_render,
    }
    if modifier.type == "MULTIRES":
        record.update(
            {
                "levels": modifier.levels,
                "sculptLevels": modifier.sculpt_levels,
                "renderLevels": modifier.render_levels,
                "totalLevels": modifier.total_levels,
            }
        )
    return record


def main() -> None:
    args = args_after_separator()
    if len(args) != 3:
        raise SystemExit("Expected: -- <vendor.blend> <sanitized.blend> <report.json>")
    vendor_path = Path(args[0]).resolve()
    output_path = Path(args[1]).resolve()
    report_path = Path(args[2]).resolve()
    if not vendor_path.is_file():
        raise SystemExit(f"Vendor blend does not exist: {vendor_path}")
    if bpy.data.filepath:
        raise SystemExit(
            "Sanitizer must start from factory blank state; a blend was opened: "
            f"{bpy.data.filepath}"
        )

    clear_blank_scene()
    handlers_before_append = handler_snapshot()

    with bpy.data.libraries.load(str(vendor_path), link=False, assets_only=False) as (
        available,
        requested,
    ):
        if SELECTED_COLLECTION not in available.collections:
            raise RuntimeError(
                f"Required collection {SELECTED_COLLECTION!r} is absent; "
                f"available={sorted(available.collections)}"
            )
        requested.collections = [SELECTED_COLLECTION]

    selected = bpy.data.collections.get(SELECTED_COLLECTION)
    if selected is None:
        raise RuntimeError("Selected collection did not append")
    selected_names = {obj.name for obj in selected.objects}
    if selected_names != EXPECTED_OBJECTS:
        raise RuntimeError(
            f"Selected collection object mismatch: expected={sorted(EXPECTED_OBJECTS)} "
            f"actual={sorted(selected_names)}"
        )
    # Appending resolves dependencies locally. Verify every imported ID is
    # local before constructing clean project-owned copies. Copying the three
    # approved IDs also strips Blender's append weak-reference bookkeeping.
    linked_ids = [
        f"object:{obj.name}" for obj in selected.objects if obj.library
    ] + [f"mesh:{obj.data.name}" for obj in selected.objects if obj.data and obj.data.library]
    if linked_ids:
        raise RuntimeError(
            f"Unexpected linked IDs after append: {linked_ids}"
        )
    source_objects = list(selected.objects)
    source_meshes = [obj.data for obj in source_objects if obj.data]
    output_collection = bpy.data.collections.new(OUTPUT_COLLECTION)
    bpy.context.scene.collection.children.link(output_collection)
    copied_by_source = {}
    source_name_by_copy = {}
    for source_obj in source_objects:
        copied = source_obj.copy()
        if source_obj.data:
            copied.data = source_obj.data.copy()
        output_collection.objects.link(copied)
        copied_by_source[source_obj] = copied
        source_name_by_copy[copied] = source_obj.name
    for source_obj, copied in copied_by_source.items():
        copied.parent = copied_by_source.get(source_obj.parent)
        copied.matrix_parent_inverse = source_obj.matrix_parent_inverse.copy()

    bpy.data.collections.remove(selected)
    for source_obj in source_objects:
        bpy.data.objects.remove(source_obj, do_unlink=True)
    for source_mesh in source_meshes:
        if source_mesh.users == 0:
            bpy.data.meshes.remove(source_mesh)
    for library in list(bpy.data.libraries):
        bpy.data.libraries.remove(library)

    selected = output_collection
    for obj in list(selected.objects):
        strip_custom_properties(obj)
        if obj.data:
            strip_custom_properties(obj.data)
        if obj.asset_data:
            obj.asset_clear()
        source_name = source_name_by_copy[obj]
        obj.name = OBJECT_RENAMES[source_name]
        if obj.data:
            obj.data.name = f"{obj.name}_Mesh"
        obj["kyx_source_license"] = "CC0-1.0"
        obj["kyx_source_product"] = "Blender Human Base Meshes 1.4.1"
        obj["kyx_source_collection"] = SELECTED_COLLECTION
        obj["kyx_source_object"] = source_name
        obj["kyx_asset_stage"] = "cc0_anatomy_sculpt_seed_prework"

    selected["kyx_source_license"] = "CC0-1.0"
    selected["kyx_source_product"] = "Blender Human Base Meshes 1.4.1"
    selected["kyx_source_collection"] = SELECTED_COLLECTION
    selected["kyx_asset_stage"] = "cc0_anatomy_sculpt_seed_prework"

    drivers_removed = remove_all_drivers()
    for block in list(bpy.data.texts):
        bpy.data.texts.remove(block)
    for block in list(bpy.data.actions):
        bpy.data.actions.remove(block)
    for block in list(bpy.data.materials):
        bpy.data.materials.remove(block)
    for block in list(bpy.data.images):
        bpy.data.images.remove(block)
    for block in list(bpy.data.node_groups):
        bpy.data.node_groups.remove(block)

    external_paths = list(bpy.utils.blend_paths(absolute=True, packed=False))
    if external_paths:
        raise RuntimeError(f"Unexpected external file paths after sanitization: {external_paths}")
    if len(bpy.data.collections) != 1 or bpy.data.collections[0] != selected:
        raise RuntimeError(
            f"Unexpected collections after sanitization: {[item.name for item in bpy.data.collections]}"
        )
    if len(selected.objects) != 3:
        raise RuntimeError(f"Expected three selected objects; found {len(selected.objects)}")

    body = bpy.data.objects.get("KYX_V6_CC0_AnatomySeed_Body")
    if body is None or body.type != "MESH":
        raise RuntimeError("Sanitized body mesh is missing")
    modifiers = [modifier_record(modifier) for modifier in body.modifiers]
    if not any(item["type"] == "MULTIRES" for item in modifiers):
        raise RuntimeError("Selected anatomy body lost its multiresolution sculpt data")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.scene["kyx_stage"] = "cc0_anatomy_sculpt_seed_prework"
    bpy.context.scene["kyx_non_claim"] = "Not final KYX geometry; not G6/runtime/visual acceptance"
    bpy.ops.wm.save_as_mainfile(filepath=str(output_path), compress=True)

    remaining_drivers = sum(
        len(block.animation_data.drivers)
        for store in (bpy.data.objects, bpy.data.meshes, bpy.data.scenes)
        for block in store
        if getattr(block, "animation_data", None)
    )
    handlers_after_append = handler_snapshot()

    report = {
        "schemaVersion": 1,
        "sanitizedUtc": datetime.now(timezone.utc).isoformat(),
        "blenderVersion": bpy.app.version_string,
        "source": {
            "fileName": vendor_path.name,
            "bytes": vendor_path.stat().st_size,
            "sha256": sha256(vendor_path),
            "selectedCollection": SELECTED_COLLECTION,
            "selectedObjects": sorted(EXPECTED_OBJECTS),
        },
        "sanitized": {
            "path": output_path.name,
            "bytes": output_path.stat().st_size,
            "sha256": sha256(output_path),
            "collection": selected.name,
            "objects": sorted(obj.name for obj in selected.objects),
            "body": {
                "vertices": len(body.data.vertices),
                "edges": len(body.data.edges),
                "polygons": len(body.data.polygons),
                "modifiers": modifiers,
            },
        },
        "sanitization": {
            "appendOnly": True,
            "texts": len(bpy.data.texts),
            "drivers": remaining_drivers,
            "driversRemoved": drivers_removed,
            "actions": len(bpy.data.actions),
            "materials": len(bpy.data.materials),
            "images": len(bpy.data.images),
            "nodeGroups": len(bpy.data.node_groups),
            "libraries": len(bpy.data.libraries),
            "externalPaths": external_paths,
            "factoryHandlersBeforeAppend": handlers_before_append,
            "factoryHandlersAfterAppend": handlers_after_append,
            "vendorHandlersImported": handlers_after_append != handlers_before_append,
            "unneededCollections": 0,
        },
        "assertions": {
            "singleApprovedCollectionOnly": True,
            "expectedThreeObjectsOnly": True,
            "noTextBlocks": len(bpy.data.texts) == 0,
            "noDrivers": remaining_drivers == 0,
            "noVendorHandlersImported": handlers_after_append == handlers_before_append,
            "noActions": len(bpy.data.actions) == 0,
            "noMaterialsOrImages": len(bpy.data.materials) == 0 and len(bpy.data.images) == 0,
            "noExternalLibrariesOrPaths": len(bpy.data.libraries) == 0 and not external_paths,
            "multiresSculptDataPreserved": any(item["type"] == "MULTIRES" for item in modifiers),
        },
        "status": "SANITIZED_CC0_SCULPT_SEED_PASS",
        "nonClaims": [
            "This is CC0 anatomy sculpt-seed prework, not project-original anatomy.",
            "No KYX design sculpt, retopology, UV, texture, rig, LOD, weapon, animation, or runtime asset is claimed.",
            "This does not satisfy G6 or human visual acceptance.",
        ],
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        "SANITIZED_CC0_SCULPT_SEED_PASS "
        f"bytes={report['sanitized']['bytes']} sha256={report['sanitized']['sha256']}"
    )


if __name__ == "__main__":
    main()
