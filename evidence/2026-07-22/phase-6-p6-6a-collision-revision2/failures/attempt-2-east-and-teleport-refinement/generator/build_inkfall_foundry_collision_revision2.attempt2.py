"""Build the bounded P6.6A Inkfall Foundry authority-collision revision 2.

This script opens the preserved revision-1 Blender source and changes only the
authoritative-collision collection. It never regenerates render geometry and
copies the accepted revision-1 render GLB byte-for-byte into the revision-2
candidate directory.

Run with Blender 5.1+:
  blender --background --factory-startup --python \
    build_inkfall_foundry_collision_revision2.py -- \
    --source-blend source/inkfall_foundry.blend \
    --source-render export/render.graybox.glb \
    --output-root revisions/revision-2
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
from mathutils import Euler, Vector


GENERATOR_ID = "inkfall_foundry_p6_6a_bounded_collision_revision"
GENERATOR_VERSION = 2
COLLISION_REVISION = 2
EXPECTED_SEED_SHA256 = "562c5ea8711a1eb1f4a08a31c8872c68c23778aa159110a107c9da0b74e67a63"
EXPECTED_REVISION_1_RENDER_SHA256 = (
    "90a9450491355ac6fe007a8ac337c7838df107d775c269366aaf7fc01ce4c634"
)
COLLECTION_RENDER = "P6_2_RENDER_GRAYBOX"
COLLECTION_COLLISION = "P6_2_AUTHORITATIVE_COLLISION"
SCOPE = "P6.6A_BOUNDED_COLLISION_REVISION_2"

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

ARCHIVE_TREAD_PREFIXES = (
    "C_STAIR__WEST_CHOICE_ARCHIVE__S01__T",
    "C_STAIR__ARCHIVE_EAST_CHOICE__S01__T",
)
ARCHIVE_RAMP_NAMES = (
    "C_ROUTE__WEST_CHOICE_ARCHIVE__S01",
    "C_ROUTE__ARCHIVE_EAST_CHOICE__S01",
)
TELEPORT_EXIT_ROUTE_NAME = "C_ROUTE__TELEPORT_EXIT_PRESS_CORE__S00"
TELEPORT_EXIT_NODE_NAME = "C_NODE__TELEPORT_EXIT"
REACTOR_NAME = "C_MODULE__PRESS_REACTOR_SOUTH"


def parse_args() -> argparse.Namespace:
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-blend", required=True)
    parser.add_argument("--source-render", required=True)
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


def seed_point_to_blender(center_seed_mm: tuple[int, int, int]) -> Vector:
    x_mm, y_mm, z_mm = center_seed_mm
    return Vector((x_mm / 1000.0, z_mm / 1000.0, y_mm / 1000.0))


def render_fingerprint(collection: bpy.types.Collection) -> str:
    records: list[dict[str, Any]] = []
    for obj in sorted(collection.objects, key=lambda candidate: candidate.name):
        if obj.type != "MESH":
            continue
        records.append(
            {
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
        )
    encoded = json.dumps(records, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def create_collision_box(
    *,
    name: str,
    center_seed_mm: tuple[int, int, int],
    dimensions_mm: tuple[int, int, int],
    collection: bpy.types.Collection,
    material: bpy.types.Material,
    source_kind: str,
    source_id: str,
    reason: str,
) -> bpy.types.Object:
    dimensions_m = tuple(value / 1000.0 for value in dimensions_mm)
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
    obj.location = seed_point_to_blender(center_seed_mm)
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Euler((0.0, 0.0, 0.0)).to_quaternion()
    obj.data.materials.append(material)
    obj["kyx_scope"] = SCOPE
    obj["kyx_role"] = "authoritative_collider"
    obj["kyx_shape"] = "box"
    obj["kyx_source_kind"] = source_kind
    obj["kyx_source_id"] = source_id
    obj["kyx_dimensions_mm"] = json.dumps(list(dimensions_mm), separators=(",", ":"))
    obj["kyx_seed_sha256"] = EXPECTED_SEED_SHA256
    obj["kyx_collision_revision"] = COLLISION_REVISION
    obj["kyx_revision_reason"] = reason
    obj["kyx_render_geometry_changed"] = False
    return obj


def remove_object(obj: bpy.types.Object) -> None:
    mesh = obj.data if obj.type == "MESH" else None
    bpy.data.objects.remove(obj, do_unlink=True)
    if mesh is not None and mesh.users == 0:
        bpy.data.meshes.remove(mesh)


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
    output_root = Path(args.output_root).resolve()
    export_dir = output_root / "export"
    source_dir = output_root / "source"
    validation_dir = output_root / "validation"
    for directory in (export_dir, source_dir, validation_dir):
        directory.mkdir(parents=True, exist_ok=True)

    if not source_blend.is_file() or not source_render.is_file():
        raise RuntimeError("Revision-1 source blend and render GLB are required")
    source_render_sha256 = sha256_file(source_render)
    if source_render_sha256 != EXPECTED_REVISION_1_RENDER_SHA256:
        raise RuntimeError(
            "Revision-1 render GLB drifted: "
            f"expected {EXPECTED_REVISION_1_RENDER_SHA256}, got {source_render_sha256}"
        )

    bpy.ops.wm.open_mainfile(filepath=str(source_blend), load_ui=False)
    scene = bpy.context.scene
    render_collection = bpy.data.collections.get(COLLECTION_RENDER)
    collision_collection = bpy.data.collections.get(COLLECTION_COLLISION)
    if render_collection is None or collision_collection is None:
        raise RuntimeError("Preserved revision-1 render/collision collections are missing")
    if scene.get("kyx_seed_sha256") != EXPECTED_SEED_SHA256:
        raise RuntimeError("Preserved Blender seed identity drifted")

    render_fingerprint_before = render_fingerprint(render_collection)
    original_collision_count = len(
        [obj for obj in collision_collection.objects if obj.type == "MESH"]
    )
    original_render_count = len(
        [obj for obj in render_collection.objects if obj.type == "MESH"]
    )

    removed_treads = sorted(
        [
            obj.name
            for obj in collision_collection.objects
            if any(obj.name.startswith(prefix) for prefix in ARCHIVE_TREAD_PREFIXES)
        ]
    )
    if len(removed_treads) != 16:
        raise RuntimeError(f"Expected 16 Archive authority treads; found {len(removed_treads)}")
    for name in removed_treads:
        remove_object(bpy.data.objects[name])

    for ramp_name in ARCHIVE_RAMP_NAMES:
        ramp = bpy.data.objects.get(ramp_name)
        if ramp is None or ramp.name not in collision_collection.objects:
            raise RuntimeError(f"Missing preserved continuous Archive support {ramp_name}")
        ramp["kyx_collision_revision"] = COLLISION_REVISION
        ramp["kyx_revision_reason"] = "replace_authority_tread_stack_with_continuous_walkable_ramp"
        ramp["kyx_surface_class"] = "walkable_continuous_ramp"
        ramp["kyx_render_geometry_changed"] = False

    collision_material = bpy.data.materials.get("M_COLLISION_AUTHORITY")
    if collision_material is None:
        raise RuntimeError("Preserved collision material is missing")

    terminal_support = create_collision_box(
        name="C_REV2__ARCHIVE_EAST_TERMINAL_SUPPORT",
        center_seed_mm=(23_800, 5_500, 14_700),
        dimensions_mm=(5_200, 2_000, 300),
        collection=collision_collection,
        material=collision_material,
        source_kind="bounded_authority_terminal_support",
        source_id="archive_east_terminal_support",
        reason="split_observed_5350_to_6000_terminal_rise_into_300_and_350_mm_steps",
    )
    terminal_support["kyx_support_top_mm"] = 5_650
    terminal_support["kyx_maximum_resulting_step_mm"] = 350

    exit_route = bpy.data.objects.get(TELEPORT_EXIT_ROUTE_NAME)
    if exit_route is None or exit_route.name not in collision_collection.objects:
        raise RuntimeError("Teleport exit authority route collider is missing")
    old_route_dimensions = json.loads(exit_route["kyx_dimensions_mm"])
    if old_route_dimensions != [3862, 2400, 250]:
        raise RuntimeError(f"Teleport exit route dimensions drifted: {old_route_dimensions}")
    trim_start_mm = 1_800
    new_route_length_mm = old_route_dimensions[0] - trim_start_mm
    local_forward = exit_route.rotation_quaternion @ Vector((1.0, 0.0, 0.0))
    exit_route.location += local_forward * (trim_start_mm / 2000.0)
    for vertex in exit_route.data.vertices:
        vertex.co.x = (new_route_length_mm / 2000.0) * (1.0 if vertex.co.x >= 0 else -1.0)
    exit_route.data.update()
    exit_route["kyx_dimensions_mm"] = json.dumps(
        [new_route_length_mm, old_route_dimensions[1], old_route_dimensions[2]],
        separators=(",", ":"),
    )
    exit_route["kyx_collision_revision"] = COLLISION_REVISION
    exit_route["kyx_revision_reason"] = "trim_exit_route_away_from_teleport_landing_capsule"
    exit_route["kyx_trimmed_start_mm"] = trim_start_mm
    exit_route["kyx_render_geometry_changed"] = False

    teleport_exit_node = bpy.data.objects.get(TELEPORT_EXIT_NODE_NAME)
    if teleport_exit_node is None or teleport_exit_node.name not in collision_collection.objects:
        raise RuntimeError("Teleport exit authority landing node is missing")
    if json.loads(teleport_exit_node["kyx_dimensions_mm"]) != [4000, 4000, 250]:
        raise RuntimeError("Teleport exit authority landing dimensions drifted")
    remove_object(teleport_exit_node)

    # The fixed-range tool aims at the immutable authored exit but travels the
    # full 9 m. Its supported point is therefore 876 mm past that seed node.
    # A 4 m sloped authority pad parallel to the swept capsule leaves a 100 mm
    # clearance during the cast and remains within the accepted 45 degree
    # movement slope after landing. The visible horizontal node stays intact.
    teleport_direction = Vector((5.0, 5.0, 4.0)).normalized()
    teleport_rotation = teleport_direction.to_track_quat("X", "Z")
    teleport_local_up = teleport_rotation @ Vector((0.0, 0.0, 1.0))
    fixed_landing_seed_mm = (1_539, 1_431, -4_461)
    fixed_landing_blender = seed_point_to_blender(fixed_landing_seed_mm)
    landing_pad = create_collision_box(
        name="C_REV2__NODE__TELEPORT_EXIT_SLOPED_LANDING",
        center_seed_mm=fixed_landing_seed_mm,
        dimensions_mm=(4_000, 4_000, 250),
        collection=collision_collection,
        material=collision_material,
        source_kind="bounded_teleport_landing_support",
        source_id="teleport_exit",
        reason="support_fixed_9m_destination_without_intersecting_upward_capsule_cast",
    )
    landing_pad.location = fixed_landing_blender - teleport_local_up * 0.225
    landing_pad.rotation_quaternion = teleport_rotation
    landing_pad["kyx_fixed_range_mm"] = 9_000
    landing_pad["kyx_cast_clearance_mm"] = 100
    landing_pad["kyx_landing_clear_diameter_mm"] = 4_000
    landing_pad["kyx_authored_aim_endpoint_mm"] = json.dumps([1_000, 1_000, -5_000])
    landing_pad["kyx_fixed_landing_feet_mm"] = json.dumps(list(fixed_landing_seed_mm))
    landing_pad["kyx_visible_node_geometry_changed"] = False

    reactor = bpy.data.objects.get(REACTOR_NAME)
    if reactor is None or reactor.name not in collision_collection.objects:
        raise RuntimeError("Press reactor south authority collider is missing")
    if json.loads(reactor["kyx_dimensions_mm"]) != [3400, 3000, 6000]:
        raise RuntimeError("Press reactor south authority bounds drifted")
    remove_object(reactor)

    reactor_parts = (
        (
            "C_REV2__PRESS_REACTOR_SOUTH__UPPER_CAP",
            (0, 4_350, -7_500),
            (3_400, 3_000, 3_300),
            "upper_cap_preserves_reactor_solidity_above_local_teleport_tunnel",
        ),
        (
            "C_REV2__PRESS_REACTOR_SOUTH__LOWER_SOUTH",
            (0, 1_350, -8_600),
            (3_400, 800, 2_700),
            "south_flank_preserves_reactor_solidity_outside_local_teleport_tunnel",
        ),
        (
            "C_REV2__PRESS_REACTOR_SOUTH__LOWER_EAST",
            (1_250, 1_350, -7_100),
            (900, 2_200, 2_700),
            "east_flank_preserves_reactor_solidity_outside_local_teleport_tunnel",
        ),
        (
            "C_REV2__PRESS_REACTOR_SOUTH__LOWER_WEST_NORTH",
            (-1_400, 1_350, -6_250),
            (600, 500, 2_700),
            "west_north_flank_preserves_reactor_solidity_outside_local_teleport_tunnel",
        ),
    )
    for name, center, dimensions, reason in reactor_parts:
        part = create_collision_box(
            name=name,
            center_seed_mm=center,
            dimensions_mm=dimensions,
            collection=collision_collection,
            material=collision_material,
            source_kind="authored_graybox_module_revision2",
            source_id="press_reactor_south",
            reason=reason,
        )
        part["kyx_original_center_seed_mm"] = json.dumps([0, 3_000, -7_500])
        part["kyx_original_dimensions_mm"] = json.dumps([3_400, 3_000, 6_000])
        part["kyx_corridor_policy"] = "local_fixed_9m_swept_capsule_clearance"

    scene["kyx_collision_revision"] = COLLISION_REVISION
    scene["kyx_collision_revision_scope"] = SCOPE
    scene["kyx_render_geometry_changed"] = False
    scene["kyx_p6_7_passed"] = False
    scene["kyx_g5_passed"] = False

    render_fingerprint_after = render_fingerprint(render_collection)
    if render_fingerprint_after != render_fingerprint_before:
        raise RuntimeError("Visible render collection changed during collision-only correction")

    render_output = export_dir / "render.graybox.glb"
    collision_output = export_dir / "collision.authority.glb"
    source_output = source_dir / "inkfall_foundry_collision_revision2.blend"
    shutil.copyfile(source_render, render_output)
    if sha256_file(render_output) != source_render_sha256:
        raise RuntimeError("Revision-2 render copy is not byte-identical to revision 1")

    collision_objects = sorted(
        [obj for obj in collision_collection.objects if obj.type == "MESH"],
        key=lambda candidate: candidate.name,
    )
    if any(len(obj.data.vertices) != 8 or len(obj.data.polygons) != 6 for obj in collision_objects):
        raise RuntimeError("Revision-2 authority collision contains a non-box mesh")
    if any(obj.get("kyx_role") != "authoritative_collider" for obj in collision_objects):
        raise RuntimeError("Revision-2 collision contains a non-authority role")

    bpy.ops.wm.save_as_mainfile(filepath=str(source_output), compress=True)
    collision_export = export_selected_glb(collision_output, collision_objects)

    report = {
        "schemaVersion": 1,
        "status": "P6_6A_BOUNDED_COLLISION_REVISION_2_CANDIDATE",
        "generator": {
            "id": GENERATOR_ID,
            "version": GENERATOR_VERSION,
            "script": Path(__file__).name,
            "scriptSha256": sha256_file(Path(__file__).resolve()),
            "blenderVersion": bpy.app.version_string,
        },
        "sourceRevision": {
            "revision": 1,
            "blend": {
                "path": str(source_blend),
                "bytes": source_blend.stat().st_size,
                "sha256": sha256_file(source_blend),
            },
            "render": {
                "path": str(source_render),
                "bytes": source_render.stat().st_size,
                "sha256": source_render_sha256,
            },
        },
        "candidateRevision": {
            "revision": COLLISION_REVISION,
            "render": {
                "path": str(render_output.relative_to(output_root)).replace("\\", "/"),
                "bytes": render_output.stat().st_size,
                "sha256": sha256_file(render_output),
                "byteIdenticalToRevision1": sha256_file(render_output) == source_render_sha256,
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
        "renderPreservation": {
            "objectCount": original_render_count,
            "fingerprintBefore": render_fingerprint_before,
            "fingerprintAfter": render_fingerprint_after,
            "unchanged": render_fingerprint_before == render_fingerprint_after,
        },
        "collisionCorrection": {
            "originalMeshNodeCount": original_collision_count,
            "candidateMeshNodeCount": len(collision_objects),
            "removedArchiveTreads": removed_treads,
            "retainedContinuousArchiveRamps": list(ARCHIVE_RAMP_NAMES),
            "eastTerminalSupport": {
                "id": terminal_support.name,
                "centerSeedMm": [23_800, 5_500, 14_700],
                "dimensionsLocalMm": [5_200, 2_000, 300],
                "supportTopMm": 5_650,
                "measuredIncomingFootMm": 5_350,
                "archiveNodeTopMm": 6_000,
                "resultingRisesMm": [300, 350],
            },
            "teleport": {
                "exitRouteCollider": {
                    "id": TELEPORT_EXIT_ROUTE_NAME,
                    "originalDimensionsLocalMm": old_route_dimensions,
                    "candidateDimensionsLocalMm": [new_route_length_mm, 2_400, 250],
                    "trimmedStartMm": trim_start_mm,
                },
                "removedLandingCollider": TELEPORT_EXIT_NODE_NAME,
                "replacementLandingCollider": {
                    "id": landing_pad.name,
                    "fixedLandingFeetMm": list(fixed_landing_seed_mm),
                    "dimensionsLocalMm": [4_000, 4_000, 250],
                    "castClearanceMm": 100,
                    "surfacePolicy": "parallel_to_fixed_9m_swept_capsule",
                },
                "removedReactorCollider": REACTOR_NAME,
                "replacementReactorParts": [name for name, _, _, _ in reactor_parts],
                "reactorOriginalBoundsPreservedByUpperAndFlankSolids": True,
                "landingPadDiameterMm": 4_000,
                "landingNodeAuthorityCollisionChanged": True,
                "landingNodeVisibleGeometryChanged": False,
            },
        },
        "preserved": {
            "seedSha256": EXPECTED_SEED_SHA256,
            "topologyChanged": False,
            "spawnsChanged": False,
            "timingBandsChanged": False,
            "movementProfileChanged": False,
            "renderChanged": False,
            "revision1ArtifactsChanged": False,
        },
        "nonClaims": [
            "P6_7_TOPOLOGY_LOCK_NOT_CLAIMED",
            "FINAL_ART_NOT_CLAIMED",
            "HUMAN_ACCEPTANCE_NOT_RUN",
            "G5_NOT_PASSED",
        ],
    }
    stable_write_json(validation_dir / "collision-revision2-build-report.json", report)
    print(
        json.dumps(
            {
                "result": "CANDIDATE_BUILT",
                "collisionMeshNodeCount": len(collision_objects),
                "collisionSha256": report["candidateRevision"]["collision"]["sha256"],
                "renderUnchanged": report["renderPreservation"]["unchanged"],
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    build()

