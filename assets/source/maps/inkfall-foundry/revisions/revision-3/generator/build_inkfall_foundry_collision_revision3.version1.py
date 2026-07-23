"""Build the bounded G5 Inkfall Foundry authority-collision revision 3.

The locked revision-2 source is immutable input. This script trims only the
shared-junction start of the left press_west_ink guard rail, copies the locked
render GLB byte-for-byte, and emits a separate non-default revision-3 candidate.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


GENERATOR_ID = "inkfall_foundry_g5_bounded_canonical_traversal_collision_revision"
GENERATOR_VERSION = 1
COLLISION_REVISION = 3
SCOPE = "G5_BOUNDED_CANONICAL_TRAVERSAL_COLLISION_REVISION_3"
COLLECTION_RENDER = "P6_2_RENDER_GRAYBOX"
COLLECTION_COLLISION = "P6_2_AUTHORITATIVE_COLLISION"
TARGET_RAIL_NAME = "C_GUARD_RAIL__PRESS_WEST_INK__S00__LEFT"
TARGET_RAIL_SOURCE_ID = "press_west_ink"
TRIMMED_START_MM = 200
EXPECTED_SOURCE_BLEND_SHA256 = (
    "6dfb09a9c6c92dd830a21e61689ee9b363ef81928a0f8663339e6b868230f224"
)
EXPECTED_SOURCE_RENDER_SHA256 = (
    "90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634"
)
EXPECTED_SOURCE_COLLISION_SHA256 = (
    "cd661c12534dd7d2362c862f4ff9f9177cb9f8ef0cea85d14a3b18e3dfb1380e"
)
EXPECTED_SEED_SHA256 = "562c5ea8711a1eb1f4a08a31c8872c68c23778aa159110a107c9da0b74e67a63"
EXPECTED_RAIL_DIMENSIONS_MM = [1_348, 160, 900]
EXPECTED_RAIL_JUNCTION_APRON_MM = 3_000


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-blend", required=True)
    parser.add_argument("--source-render", required=True)
    parser.add_argument("--source-collision", required=True)
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


def mesh_record(obj: bpy.types.Object) -> dict[str, Any]:
    return {
        "name": obj.name,
        "location": [round(value, 9) for value in obj.location],
        "rotation": [round(value, 9) for value in obj.rotation_quaternion],
        "vertices": [
            [round(axis, 9) for axis in vertex.co]
            for vertex in obj.data.vertices
        ],
        "properties": {
            key: obj[key]
            for key in sorted(obj.keys())
            if key.startswith("kyx_")
        },
    }


def collection_fingerprint(
    collection: bpy.types.Collection,
    *,
    exclude_names: frozenset[str] = frozenset(),
) -> str:
    records = [
        mesh_record(obj)
        for obj in sorted(collection.objects, key=lambda candidate: candidate.name)
        if obj.type == "MESH" and obj.name not in exclude_names
    ]
    encoded = json.dumps(records, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def export_selected_glb(path: Path, objects: list[bpy.types.Object]) -> dict[str, Any]:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    operator_properties = {
        prop.identifier for prop in bpy.ops.export_scene.gltf.get_rna_type().properties
    }
    candidates: dict[str, Any] = {
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
    kwargs = {key: value for key, value in candidates.items() if key in operator_properties}
    result = bpy.ops.export_scene.gltf(**kwargs)
    if "FINISHED" not in result:
        raise RuntimeError(f"GLB export failed for {path}: {result}")
    return {"operatorArguments": kwargs, "result": sorted(result)}


def build() -> None:
    args = parse_args()
    source_blend = Path(args.source_blend).resolve()
    source_render = Path(args.source_render).resolve()
    source_collision = Path(args.source_collision).resolve()
    output_root = Path(args.output_root).resolve()
    export_dir = output_root / "export"
    source_dir = output_root / "source"
    validation_dir = output_root / "validation"
    for directory in (export_dir, source_dir, validation_dir):
        directory.mkdir(parents=True, exist_ok=True)

    expected_inputs = (
        (source_blend, EXPECTED_SOURCE_BLEND_SHA256, "revision-2 source blend"),
        (source_render, EXPECTED_SOURCE_RENDER_SHA256, "revision-2 render"),
        (source_collision, EXPECTED_SOURCE_COLLISION_SHA256, "revision-2 collision"),
    )
    for path, expected_sha256, label in expected_inputs:
        if not path.is_file():
            raise RuntimeError(f"Missing {label}: {path}")
        actual_sha256 = sha256_file(path)
        if actual_sha256 != expected_sha256:
            raise RuntimeError(
                f"{label} drifted: expected {expected_sha256}, got {actual_sha256}"
            )

    bpy.ops.wm.open_mainfile(filepath=str(source_blend), load_ui=False)
    scene = bpy.context.scene
    render_collection = bpy.data.collections.get(COLLECTION_RENDER)
    collision_collection = bpy.data.collections.get(COLLECTION_COLLISION)
    if render_collection is None or collision_collection is None:
        raise RuntimeError("Locked revision-2 render/collision collections are missing")
    if scene.get("kyx_seed_sha256") != EXPECTED_SEED_SHA256:
        raise RuntimeError("Locked layout seed identity drifted")
    if scene.get("kyx_collision_revision") != 2:
        raise RuntimeError("Source blend is not locked collision revision 2")

    collision_objects = sorted(
        [obj for obj in collision_collection.objects if obj.type == "MESH"],
        key=lambda candidate: candidate.name,
    )
    if len(collision_objects) != 339:
        raise RuntimeError(f"Expected 339 locked authority solids; found {len(collision_objects)}")
    rail = bpy.data.objects.get(TARGET_RAIL_NAME)
    if rail is None or rail.name not in collision_collection.objects:
        raise RuntimeError(f"Missing target rail {TARGET_RAIL_NAME}")
    if rail.get("kyx_role") != "authoritative_collider":
        raise RuntimeError("Target rail is not an authoritative collider")
    if rail.get("kyx_source_kind") != "route_guard_rail":
        raise RuntimeError("Target rail source kind drifted")
    if rail.get("kyx_source_id") != TARGET_RAIL_SOURCE_ID:
        raise RuntimeError("Target rail source identity drifted")
    if rail.get("kyx_guard_side") != "left":
        raise RuntimeError("Target rail side drifted")
    if json.loads(rail["kyx_dimensions_mm"]) != EXPECTED_RAIL_DIMENSIONS_MM:
        raise RuntimeError("Target rail dimensions drifted")
    if rail.get("kyx_junction_apron_mm") != EXPECTED_RAIL_JUNCTION_APRON_MM:
        raise RuntimeError("Target rail junction apron drifted")

    render_fingerprint_before = collection_fingerprint(render_collection)
    untouched_collision_fingerprint_before = collection_fingerprint(
        collision_collection,
        exclude_names=frozenset((TARGET_RAIL_NAME,)),
    )
    target_before = mesh_record(rail)

    old_length_mm = EXPECTED_RAIL_DIMENSIONS_MM[0]
    new_length_mm = old_length_mm - TRIMMED_START_MM
    if new_length_mm <= 0:
        raise RuntimeError("Target rail trim removes the complete collider")
    local_forward = rail.rotation_quaternion @ Vector((1.0, 0.0, 0.0))
    rail.location += local_forward * (TRIMMED_START_MM / 2000.0)
    for vertex in rail.data.vertices:
        vertex.co.x = (new_length_mm / 2000.0) * (1.0 if vertex.co.x >= 0 else -1.0)
    rail.data.update()
    rail["kyx_dimensions_mm"] = json.dumps(
        [new_length_mm, EXPECTED_RAIL_DIMENSIONS_MM[1], EXPECTED_RAIL_DIMENSIONS_MM[2]],
        separators=(",", ":"),
    )
    rail["kyx_collision_revision"] = COLLISION_REVISION
    rail["kyx_revision_reason"] = (
        "trim_left_press_west_ink_guard_start_away_from_west_choice_press_canonical_approach"
    )
    rail["kyx_junction_apron_start_mm"] = EXPECTED_RAIL_JUNCTION_APRON_MM + TRIMMED_START_MM
    rail["kyx_junction_apron_end_mm"] = EXPECTED_RAIL_JUNCTION_APRON_MM
    rail["kyx_trimmed_start_mm"] = TRIMMED_START_MM
    rail["kyx_render_geometry_changed"] = False
    target_after = mesh_record(rail)

    scene["kyx_collision_revision"] = COLLISION_REVISION
    scene["kyx_collision_revision_scope"] = SCOPE
    scene["kyx_render_geometry_changed"] = False
    scene["kyx_g5_passed"] = False

    render_fingerprint_after = collection_fingerprint(render_collection)
    untouched_collision_fingerprint_after = collection_fingerprint(
        collision_collection,
        exclude_names=frozenset((TARGET_RAIL_NAME,)),
    )
    if render_fingerprint_after != render_fingerprint_before:
        raise RuntimeError("Visible render collection changed during collision-only correction")
    if untouched_collision_fingerprint_after != untouched_collision_fingerprint_before:
        raise RuntimeError("A non-target authority collider changed")

    render_output = export_dir / "render.graybox.glb"
    collision_output = export_dir / "collision.authority.glb"
    source_output = source_dir / "inkfall_foundry.blend"
    shutil.copyfile(source_render, render_output)
    if sha256_file(render_output) != EXPECTED_SOURCE_RENDER_SHA256:
        raise RuntimeError("Revision-3 render copy is not byte-identical to locked revision 2")

    if any(len(obj.data.vertices) != 8 or len(obj.data.polygons) != 6 for obj in collision_objects):
        raise RuntimeError("Revision-3 authority collision contains a non-box mesh")
    if any(obj.get("kyx_role") != "authoritative_collider" for obj in collision_objects):
        raise RuntimeError("Revision-3 collision contains a non-authority role")
    bpy.ops.wm.save_as_mainfile(filepath=str(source_output), compress=True)
    collision_export = export_selected_glb(collision_output, collision_objects)

    report = {
        "schemaVersion": 1,
        "status": "G5_BOUNDED_COLLISION_REVISION_3_CANDIDATE",
        "generator": {
            "id": GENERATOR_ID,
            "version": GENERATOR_VERSION,
            "script": Path(__file__).name,
            "scriptSha256": sha256_file(Path(__file__).resolve()),
            "blenderVersion": bpy.app.version_string,
        },
        "sourceRevision": {
            "revision": 2,
            "blend": {"bytes": source_blend.stat().st_size, "sha256": sha256_file(source_blend)},
            "render": {"bytes": source_render.stat().st_size, "sha256": sha256_file(source_render)},
            "collision": {
                "bytes": source_collision.stat().st_size,
                "sha256": sha256_file(source_collision),
            },
        },
        "candidateRevision": {
            "revision": COLLISION_REVISION,
            "render": {
                "path": str(render_output.relative_to(output_root)).replace("\\", "/"),
                "bytes": render_output.stat().st_size,
                "sha256": sha256_file(render_output),
                "byteIdenticalToRevision2": True,
            },
            "collision": {
                "path": str(collision_output.relative_to(output_root)).replace("\\", "/"),
                "bytes": collision_output.stat().st_size,
                "sha256": sha256_file(collision_output),
                "meshNodeCount": len(collision_objects),
                "export": collision_export,
            },
            "sourceBlend": {
                "path": str(source_output.relative_to(output_root)).replace("\\", "/"),
                "bytes": source_output.stat().st_size,
                "sha256": sha256_file(source_output),
            },
        },
        "collisionCorrection": {
            "changedColliderCount": 1,
            "changedCollider": TARGET_RAIL_NAME,
            "trimmedStartMm": TRIMMED_START_MM,
            "originalJunctionApronStartMm": EXPECTED_RAIL_JUNCTION_APRON_MM,
            "candidateJunctionApronStartMm": EXPECTED_RAIL_JUNCTION_APRON_MM + TRIMMED_START_MM,
            "junctionApronEndMm": EXPECTED_RAIL_JUNCTION_APRON_MM,
            "before": target_before,
            "after": target_after,
        },
        "preservation": {
            "renderFingerprintBefore": render_fingerprint_before,
            "renderFingerprintAfter": render_fingerprint_after,
            "renderUnchanged": render_fingerprint_after == render_fingerprint_before,
            "untouchedCollisionFingerprintBefore": untouched_collision_fingerprint_before,
            "untouchedCollisionFingerprintAfter": untouched_collision_fingerprint_after,
            "allNonTargetCollidersUnchanged": (
                untouched_collision_fingerprint_after == untouched_collision_fingerprint_before
            ),
            "colliderCardinalityUnchanged": len(collision_objects) == 339,
            "seedSha256": EXPECTED_SEED_SHA256,
            "topologyChanged": False,
            "spawnsChanged": False,
            "timingBandsChanged": False,
            "movementProfileChanged": False,
            "renderChanged": False,
            "revision2ArtifactsChanged": False,
        },
        "nonClaims": [
            "REVISION_3_NOT_DEFAULT",
            "REVISION_3_NOT_PROMOTED",
            "EXACT_PRODUCT_RUNTIME_REPLAY_NOT_RUN",
            "HUMAN_ACCEPTANCE_NOT_RUN",
            "G5_NOT_PASSED",
        ],
    }
    stable_write_json(validation_dir / "collision-revision3-build-report.json", report)
    print(
        json.dumps(
            {
                "result": "REVISION_3_CANDIDATE_BUILT",
                "changedColliderCount": 1,
                "collisionMeshNodeCount": len(collision_objects),
                "collisionSha256": report["candidateRevision"]["collision"]["sha256"],
                "renderUnchanged": report["preservation"]["renderUnchanged"],
                "allNonTargetCollidersUnchanged": report["preservation"][
                    "allNonTargetCollidersUnchanged"
                ],
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    build()
