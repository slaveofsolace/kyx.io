"""Build the bounded Inkfall revision-4 east-choice seam correction.

Revision 3 is immutable input. This generator trims only the platform-side
endpoint of one authoritative guard rail. It preserves the opposite endpoint,
all other collision meshes, every render mesh, spawns, zones, triggers,
movement tuning, and KCC safety tolerances.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

import bpy
from mathutils import Vector


GENERATOR_ID = "inkfall_foundry_rev4_east_choice_seam_correction"
GENERATOR_VERSION = 1
SOURCE_REVISION = 3
COLLISION_REVISION = 4
SCOPE = "INKFALL_REV5_REVISION_4_AUTHORITY_SEAM_CORRECTION_CANDIDATE"
COLLECTION_RENDER = "P6_2_RENDER_GRAYBOX"
COLLECTION_COLLISION = "P6_2_AUTHORITATIVE_COLLISION"
TARGET_RAIL_NAME = "C_GUARD_RAIL__INK_EAST_CHOICE__S02__RIGHT"
TARGET_SOURCE_ID = "ink_east_choice"
EXPECTED_SEED_SHA256 = "562c5ea8711a1eb1f4a08a31c8872c68c23778aa159110a107c9da0b74e67a63"
EXPECTED_SOURCE_BLEND_SHA256 = (
    "5e0d2549b1e642f3763f2df27213862375cad90ba9ada8353f89bfcba2864fa3"
)
EXPECTED_SOURCE_RENDER_SHA256 = (
    "19bbf6f627f46146a7266d39e00e0635d7b4b09e556bfa0dee988bb2375c5ed6"
)
EXPECTED_SOURCE_COLLISION_SHA256 = (
    "1cce637ab4f83766627527b3885c3e9da819d8bcabdfa2144f8dc6b46bc5bba8"
)
EXPECTED_SOURCE_MANIFEST_SHA256 = (
    "14648737f7e511370e1136ac5150fa25b1ebfdc9bff2dd86ba7b2ce83e1c45b6"
)
EXPECTED_SOURCE_PACKAGE_DIGEST = (
    "4027934730af7c855b0abcee1b36cc256294e3e5c22a6ffb8aa02a77f71d196a"
)
EXPECTED_SOURCE_FIXTURE_HASH = "97eb7772ac59dc95"
EXPECTED_COLLIDER_COUNT = 339
EXPECTED_RAIL_DIMENSIONS_MM = [1681, 160, 900]
TRIMMED_PLATFORM_ENDPOINT_MM = 141
NEW_RAIL_LENGTH_MM = 1540
CAPSULE_RADIUS_MM = 350
KCC_SKIN_MM = 20
DETERMINISTIC_MARGIN_MM = 50
MINIMUM_EDGE_CLEARANCE_MM = CAPSULE_RADIUS_MM + KCC_SKIN_MM + DETERMINISTIC_MARGIN_MM
EXPECTED_AWAY_ENDPOINT_MM = (22675, -163, -4824)
EXPECTED_INTRUDING_ENDPOINT_MM = (22018, 56, -3292)
PLATFORM_EDGE_Z_MM = -3000


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-blend", required=True)
    parser.add_argument("--source-render", required=True)
    parser.add_argument("--source-collision", required=True)
    parser.add_argument("--source-manifest", required=True)
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


def authority_point_mm(value: Vector) -> tuple[int, int, int]:
    # Blender source is x=east, y=north, z=up. Authority is x=east, y=up, z=north.
    return (
        round(value.x * 1000),
        round(value.z * 1000),
        round(value.y * 1000),
    )


def rail_endpoints_mm(
    rail: bpy.types.Object,
    length_mm: int,
) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    local_forward = rail.rotation_quaternion @ Vector((1.0, 0.0, 0.0))
    positive = rail.location + local_forward * (length_mm / 2000.0)
    negative = rail.location - local_forward * (length_mm / 2000.0)
    return authority_point_mm(positive), authority_point_mm(negative)


def endpoint_close(
    actual: tuple[int, int, int],
    expected: tuple[int, int, int],
    tolerance_mm: int = 2,
) -> bool:
    return all(abs(left - right) <= tolerance_mm for left, right in zip(actual, expected))


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
    source_manifest = Path(args.source_manifest).resolve()
    output_root = Path(args.output_root).resolve()
    export_dir = output_root / "export"
    source_dir = output_root / "source"
    validation_dir = output_root / "validation"
    for directory in (export_dir, source_dir, validation_dir):
        directory.mkdir(parents=True, exist_ok=True)

    expected_inputs = (
        (source_blend, EXPECTED_SOURCE_BLEND_SHA256, "revision-3 source blend"),
        (source_render, EXPECTED_SOURCE_RENDER_SHA256, "revision-3 render"),
        (source_collision, EXPECTED_SOURCE_COLLISION_SHA256, "revision-3 collision"),
        (source_manifest, EXPECTED_SOURCE_MANIFEST_SHA256, "revision-3 manifest"),
    )
    for path, expected_sha256, label in expected_inputs:
        if not path.is_file():
            raise RuntimeError(f"Missing {label}: {path}")
        actual_sha256 = sha256_file(path)
        if actual_sha256 != expected_sha256:
            raise RuntimeError(
                f"{label} drifted: expected {expected_sha256}, got {actual_sha256}"
            )
    manifest = json.loads(source_manifest.read_text(encoding="utf-8"))
    if (
        manifest.get("revision") != SOURCE_REVISION
        or manifest.get("identity", {}).get("digest") != EXPECTED_SOURCE_PACKAGE_DIGEST
    ):
        raise RuntimeError("Revision-3 manifest identity drifted")

    bpy.ops.wm.open_mainfile(filepath=str(source_blend), load_ui=False)
    scene = bpy.context.scene
    render_collection = bpy.data.collections.get(COLLECTION_RENDER)
    collision_collection = bpy.data.collections.get(COLLECTION_COLLISION)
    if render_collection is None or collision_collection is None:
        raise RuntimeError("Revision-3 render/collision collections are missing")
    if scene.get("kyx_seed_sha256") != EXPECTED_SEED_SHA256:
        raise RuntimeError("Layout seed identity drifted")
    if scene.get("kyx_collision_revision") != SOURCE_REVISION:
        raise RuntimeError("Source blend is not collision revision 3")

    collision_objects = sorted(
        [obj for obj in collision_collection.objects if obj.type == "MESH"],
        key=lambda candidate: candidate.name,
    )
    render_objects = sorted(
        [obj for obj in render_collection.objects if obj.type == "MESH"],
        key=lambda candidate: candidate.name,
    )
    if len(collision_objects) != EXPECTED_COLLIDER_COUNT:
        raise RuntimeError(
            f"Expected {EXPECTED_COLLIDER_COUNT} authority solids; found {len(collision_objects)}"
        )
    if any(len(obj.data.vertices) != 8 or len(obj.data.polygons) != 6 for obj in collision_objects):
        raise RuntimeError("Revision-3 authority collision contains a non-box mesh")
    if any(obj.get("kyx_role") != "authoritative_collider" for obj in collision_objects):
        raise RuntimeError("Revision-3 collision contains a non-authority role")

    rail = bpy.data.objects.get(TARGET_RAIL_NAME)
    if rail is None or rail.name not in collision_collection.objects:
        raise RuntimeError(f"Missing target rail {TARGET_RAIL_NAME}")
    if rail.get("kyx_role") != "authoritative_collider":
        raise RuntimeError("Target rail is not an authoritative collider")
    if rail.get("kyx_source_kind") != "route_guard_rail":
        raise RuntimeError("Target rail source kind drifted")
    if rail.get("kyx_source_id") != TARGET_SOURCE_ID:
        raise RuntimeError("Target rail source identity drifted")
    if rail.get("kyx_guard_side") != "right":
        raise RuntimeError("Target rail side drifted")
    if json.loads(rail["kyx_dimensions_mm"]) != EXPECTED_RAIL_DIMENSIONS_MM:
        raise RuntimeError("Target rail dimensions drifted")

    render_fingerprint_before = collection_fingerprint(render_collection)
    collision_fingerprint_before = collection_fingerprint(
        collision_collection,
        exclude_names=frozenset((TARGET_RAIL_NAME,)),
    )
    target_before = mesh_record(rail)
    positive_before, negative_before = rail_endpoints_mm(
        rail,
        EXPECTED_RAIL_DIMENSIONS_MM[0],
    )
    if not endpoint_close(positive_before, EXPECTED_INTRUDING_ENDPOINT_MM):
        raise RuntimeError(f"Intruding endpoint drifted: {positive_before}")
    if not endpoint_close(negative_before, EXPECTED_AWAY_ENDPOINT_MM):
        raise RuntimeError(f"Away endpoint drifted: {negative_before}")

    local_forward = rail.rotation_quaternion @ Vector((1.0, 0.0, 0.0))
    rail.location -= local_forward * (TRIMMED_PLATFORM_ENDPOINT_MM / 2000.0)
    for vertex in rail.data.vertices:
        vertex.co.x = (NEW_RAIL_LENGTH_MM / 2000.0) * (1.0 if vertex.co.x >= 0 else -1.0)
    rail.data.update()
    rail["kyx_dimensions_mm"] = json.dumps(
        [NEW_RAIL_LENGTH_MM, EXPECTED_RAIL_DIMENSIONS_MM[1], EXPECTED_RAIL_DIMENSIONS_MM[2]],
        separators=(",", ":"),
    )
    rail["kyx_collision_revision"] = COLLISION_REVISION
    rail["kyx_revision_reason"] = "remove_east_choice_platform_guard_rail_concave_kcc_seam"
    rail["kyx_trimmed_platform_endpoint_mm"] = TRIMMED_PLATFORM_ENDPOINT_MM
    rail["kyx_required_edge_clearance_mm"] = MINIMUM_EDGE_CLEARANCE_MM
    rail["kyx_render_geometry_changed"] = False
    target_after = mesh_record(rail)
    positive_after, negative_after = rail_endpoints_mm(rail, NEW_RAIL_LENGTH_MM)
    if not endpoint_close(negative_after, negative_before):
        raise RuntimeError("The away endpoint moved")
    edge_clearance_mm = abs(positive_after[2] - PLATFORM_EDGE_Z_MM)
    if edge_clearance_mm < MINIMUM_EDGE_CLEARANCE_MM:
        raise RuntimeError(
            f"Corrected rail clearance {edge_clearance_mm}mm is below {MINIMUM_EDGE_CLEARANCE_MM}mm"
        )

    scene["kyx_collision_revision"] = COLLISION_REVISION
    scene["kyx_collision_revision_scope"] = SCOPE
    scene["kyx_revision4_changed_collider"] = TARGET_RAIL_NAME
    scene["kyx_revision4_trimmed_platform_endpoint_mm"] = TRIMMED_PLATFORM_ENDPOINT_MM
    scene["kyx_revision4_render_reused_from_revision"] = SOURCE_REVISION
    scene["kyx_runtime_integrated"] = False
    scene["kyx_g5_passed"] = False

    render_fingerprint_after = collection_fingerprint(render_collection)
    collision_fingerprint_after = collection_fingerprint(
        collision_collection,
        exclude_names=frozenset((TARGET_RAIL_NAME,)),
    )
    if render_fingerprint_after != render_fingerprint_before:
        raise RuntimeError("A render mesh changed")
    if collision_fingerprint_after != collision_fingerprint_before:
        raise RuntimeError("A non-target authority collider changed")

    collision_output = export_dir / "collision.authority.glb"
    source_output = source_dir / "inkfall_foundry.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(source_output), compress=True)
    collision_export = export_selected_glb(collision_output, collision_objects)

    report = {
        "schemaVersion": 1,
        "status": "INKFALL_REV5_REVISION_4_AUTHORITY_SEAM_CORRECTION_CANDIDATE",
        "generator": {
            "id": GENERATOR_ID,
            "version": GENERATOR_VERSION,
            "script": Path(__file__).name,
            "scriptSha256": sha256_file(Path(__file__).resolve()),
            "blenderVersion": bpy.app.version_string,
        },
        "sourceRevision": {
            "revision": SOURCE_REVISION,
            "packageDigest": EXPECTED_SOURCE_PACKAGE_DIGEST,
            "fixtureHash": EXPECTED_SOURCE_FIXTURE_HASH,
            "blend": {"bytes": source_blend.stat().st_size, "sha256": sha256_file(source_blend)},
            "render": {"bytes": source_render.stat().st_size, "sha256": sha256_file(source_render)},
            "collision": {
                "bytes": source_collision.stat().st_size,
                "sha256": sha256_file(source_collision),
            },
            "manifest": {
                "bytes": source_manifest.stat().st_size,
                "sha256": sha256_file(source_manifest),
            },
        },
        "candidateRevision": {
            "revision": COLLISION_REVISION,
            "render": {
                "reusedFromRevision": SOURCE_REVISION,
                "bytes": source_render.stat().st_size,
                "sha256": sha256_file(source_render),
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
            "originalLengthMm": EXPECTED_RAIL_DIMENSIONS_MM[0],
            "candidateLengthMm": NEW_RAIL_LENGTH_MM,
            "trimmedPlatformEndpointMm": TRIMMED_PLATFORM_ENDPOINT_MM,
            "capsuleRadiusMm": CAPSULE_RADIUS_MM,
            "kccSkinMm": KCC_SKIN_MM,
            "deterministicMarginMm": DETERMINISTIC_MARGIN_MM,
            "requiredEdgeClearanceMm": MINIMUM_EDGE_CLEARANCE_MM,
            "candidateEdgeClearanceMm": edge_clearance_mm,
            "platformEdgeZMm": PLATFORM_EDGE_Z_MM,
            "awayEndpointBeforeMm": negative_before,
            "awayEndpointAfterMm": negative_after,
            "intrudingEndpointBeforeMm": positive_before,
            "intrudingEndpointAfterMm": positive_after,
            "before": target_before,
            "after": target_after,
        },
        "preservation": {
            "renderFingerprintBefore": render_fingerprint_before,
            "renderFingerprintAfter": render_fingerprint_after,
            "allRenderMeshesUnchanged": render_fingerprint_after == render_fingerprint_before,
            "nonTargetCollisionFingerprintBefore": collision_fingerprint_before,
            "nonTargetCollisionFingerprintAfter": collision_fingerprint_after,
            "allNonTargetCollidersUnchanged": (
                collision_fingerprint_after == collision_fingerprint_before
            ),
            "colliderCardinalityUnchanged": len(collision_objects) == EXPECTED_COLLIDER_COUNT,
            "topologyChanged": False,
            "spawnsChanged": False,
            "zonesChanged": False,
            "triggersChanged": False,
            "movementProfileChanged": False,
            "kccToleranceChanged": False,
            "renderChanged": False,
            "revision3ArtifactsChanged": False,
        },
        "requiredProof": [
            "EXACT_FAILING_POSE_CLEAR",
            "DETERMINISTIC_ONE_PLUS_SEVEN_SUSTAINED_TRAVERSAL",
            "PLAYER_EYE_COLLISION_AND_READABILITY_REVIEW",
        ],
        "nonClaims": [
            "REVISION_4_NOT_PROMOTED",
            "HUMAN_MAP_ACCEPTANCE_NOT_RUN",
            "FINAL_TWO_FOUR_EIGHT_MATRIX_NOT_RUN",
            "G5_NOT_PASSED",
        ],
    }
    stable_write_json(validation_dir / "collision-revision4-build-report.json", report)
    print(
        json.dumps(
            {
                "result": "REVISION_4_AUTHORITY_CANDIDATE_BUILT",
                "changedColliderCount": 1,
                "collisionMeshNodeCount": len(collision_objects),
                "collisionSha256": report["candidateRevision"]["collision"]["sha256"],
                "sourceBlendSha256": report["candidateRevision"]["sourceBlend"]["sha256"],
                "candidateEdgeClearanceMm": edge_clearance_mm,
                "allRenderMeshesUnchanged": report["preservation"]["allRenderMeshesUnchanged"],
                "allNonTargetCollidersUnchanged": report["preservation"][
                    "allNonTargetCollidersUnchanged"
                ],
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    build()
